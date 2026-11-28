# Test yourself: Linux and network troubleshooting

Answer each question in your own words first, then open the answer.

??? question "1. A server has 8 CPUs and a load average of 24. CPU usage is 30%. What's going on, and what would you check?"
    Load average counts tasks that are running, waiting for a CPU, **or waiting for disk I/O** (uninterruptible sleep). A load of 24 with CPUs mostly idle points to **I/O wait**, not CPU.

    Check `vmstat 1` (the `wa` column and `b`, blocked processes), `iostat -xz 1` (`%util` and `await` per disk), and look for processes in state `D` (`ps -eo state,pid,cmd | grep '^D'`). Also check for an NFS or network-storage mount that has stopped responding.

??? question "2. Why is `top` inside a container misleading, and where do you look instead?"
    `top`, `uptime`, `free` and most of `/proc` show the **host's** CPUs, memory and load, not the container's limits. A container can be throttled most of the time while `top` reports the CPU as mostly idle, or shows its processes at "2%" of a large host.

    Look at the container's **cgroup** files: `cpu.max` (the limit), `cpu.stat` (`nr_throttled` / `nr_periods`), `memory.max` and `memory.current`, `memory.events` (OOM kills), and `cpu.pressure`. Or at the same data in Prometheus via cAdvisor (`container_cpu_cfs_throttled_periods_total`, Module 2).

??? question "3. A request takes 400 ms. curl shows connect = 0.2 ms and ttfb = 398 ms. Network or server?"
    **Server.** The TCP handshake (one round trip) took 0.2 ms, so the network between client and server is fast. Almost all the time is between sending the request and getting the first byte: the server processing it, or something the server is waiting for (a database, another service, a lock). Look at the server's latency metrics, traces and its dependencies.

??? question "4. Most requests take 3 ms, but about 5% take between 200 ms and 1 second, and there are no errors. What do you suspect, and how do you confirm it?"
    **Packet loss.** TCP retransmits lost packets, after about 200 ms for data and 1 s for a lost SYN, so requests succeed but some are slow by those amounts. Error rates stay at zero.

    Confirm with `ping -c 100` (loss %), TCP retransmission counters (`nstat -az TcpRetransSegs TcpExtTCPSynRetrans`, or `node_netstat_Tcp_RetransSegs` in node-exporter), and `ss -ti` (the `retrans` field per connection). Then find where: compare paths, check interface error counters (`ip -s link`), and look for an overloaded node or link.

??? question "5. Explain ndots:5 and the search list in a pod's resolv.conf. What happens when a pod looks up api.stripe.com?"
    With `ndots:5`, any name with fewer than 5 dots is first tried with each **search domain** appended. `api.stripe.com` has 2 dots, so the resolver tries:

    `api.stripe.com.<ns>.svc.cluster.local`, `api.stripe.com.svc.cluster.local`, `api.stripe.com.cluster.local`, and only then `api.stripe.com.`, each for A and AAAA: **8 queries**, 6 of which return NXDOMAIN.

    It adds latency and load on CoreDNS for every external call. Fixes: use the FQDN with a trailing dot (`api.stripe.com.`), set `ndots: 2` in the pod's `dnsConfig`, or use NodeLocal DNSCache.

??? question "6. `df -h` shows 40% used, but writes fail with 'No space left on device'. Why?"
    The filesystem has run out of **inodes**: every file uses one, and a directory with millions of tiny files (cache, session files, mail queue) can use them all while plenty of space is left. Check with `df -i`, then find the directory with the most files (`find /path -xdev -type f | cut -d/ -f2-3 | sort | uniq -c | sort -n`).

    Another cause: space held by **deleted files** that a process still has open (common with log rotation). `lsof +L1` lists them; the space is freed when the process closes the file or restarts.

??? question "7. `free -m` shows 200 MB free out of 16 GB. Is the machine short of memory?"
    Probably not. Linux uses spare memory as **page cache** and gives it back when applications need it. Look at the **available** column, which estimates how much can be used without swapping. Signs of real memory pressure: available near zero, swap activity (`vmstat` `si`/`so`), memory PSI (`/proc/pressure/memory`) above zero, and OOM-killer messages in `dmesg`.

??? question "8. In the lab, a failed upload returned HTTP 200 with an error in the body. Why does that matter for SRE work?"
    Every status-code-based SLI, error-ratio alert and dashboard counts that failure as a **success**. Users fail and the SLO says 100%.

    Fixes: the application should return a proper error status (5xx for server-side failures like a full disk); and for critical journeys, measure success at a level that can't lie, for example "uploads that are actually stored" or "orders actually recorded", not just HTTP status. This is the same lesson as Module 4: an SLI is a hypothesis about what users experience.

??? question "9. How do you run tcpdump for a pod whose image has no shell or tools?"
    Use an **ephemeral debug container** that shares the pod's network namespace:

    ```bash
    kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container> -- tcpdump -n -i eth0 port 9898
    ```

    Or run tcpdump on the **node**, filtering on the pod's IP (or on its veth interface). Production images shouldn't contain debugging tools; debug containers are the standard way to bring them in temporarily.

??? question "10. What's PSI, and why is it a better saturation signal than CPU utilisation?"
    **Pressure stall information**: the percentage of time that some (or all) tasks were **stalled** waiting for CPU, memory or I/O, over 10 s, 60 s and 300 s. It's in `/proc/pressure/*` for the whole machine and in each cgroup's `cpu.pressure`, `memory.pressure` and `io.pressure`.

    Utilisation says how busy a resource is; PSI says how much **work is waiting** because of it, which is what users feel. A CPU at 95% with near-zero CPU pressure is fine; a CPU at 60% with high pressure (bursts, throttling) is not.

??? question "11. Users in one region report slow responses. How do you work out whether it's the network?"
    1. **Time the phases** from that region (curl `-w`, or synthetic probes): is connect slow, or only TTFB?
    2. Compare with another region: if connect time differs by the network distance, it's latency; if some requests take extra 200 ms/1 s, it's loss.
    3. `mtr` (or traceroute) from an affected client towards the service, to see where latency or loss starts.
    4. Check the server side for that region's traffic: if server time is the same for every region, the difference is in the network or a load balancer in between.
    5. Check recent changes to routing, DNS (are users sent to the wrong region?), CDN or load balancer configuration.

??? question "12. Why should you look at a process's open TCP connections (ss -tan) during an incident, and what states are suspicious?"
    The connection states show how a service is talking to its peers:

    - Thousands of **TIME-WAIT**: many short connections, no keep-alive or connection pooling; can exhaust ephemeral ports.
    - Many **CLOSE-WAIT**: the remote end closed, but **your** application never closed its side, usually a connection leak in the code.
    - Many **SYN-SENT**: you're trying to connect to something that doesn't answer (down, or packets dropped by a firewall or NetworkPolicy).
    - A large **Recv-Q** or **Send-Q** on established connections: one side isn't reading fast enough.

    `ss -s` gives the summary; `ss -tan state close-wait` lists one state.
