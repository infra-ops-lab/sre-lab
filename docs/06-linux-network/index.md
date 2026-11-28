# Module 6: Linux and network troubleshooting

## Objectives

After this module you can:

- Check a Linux system's resources quickly with the **USE** method and standard tools.
- Explain what **load average**, CPU **throttling**, **pressure (PSI)** and **OOM** mean, and how containers change the picture.
- Split a slow request into DNS, connect, server time and transfer, and say which side is slow.
- Recognise **latency**, **packet loss** and **DNS** problems from their symptoms, and confirm them with `ping`, `curl`, `ss`, `nstat` and `tcpdump`.
- Explain Kubernetes DNS (`ndots`, search domains) and why it can multiply lookups.

## Why it matters

Kubernetes hides machines, but doesn't remove them. Every container is a Linux process in cgroups and namespaces, and every request crosses a real network. When a problem gets past the Kubernetes layer (Module 5), you need to look at processes, CPU, memory, disks and packets.

## A 60-second Linux check

Brendan Gregg's classic first minute on a slow Linux server, mapped to USE (Module 2):

| Command | What it shows | Look for |
|---|---|---|
| `uptime` | Load averages (1, 5, 15 min) | Load far above the number of CPUs; rising or falling trend |
| `top` (or `htop`) | Processes by CPU and memory | One process using everything; unexpected processes |
| `vmstat 1` | CPU (user, system, idle, **wait**), run queue (`r`), swapping | `r` above CPU count = CPU saturation; `wa` high = waiting on disk |
| `free -m` | Memory, **available** (not "free") | Available near zero; swap in use |
| `df -h`, `df -i` | Disk space and **inodes** | 100% used (space or inodes) |
| `iostat -xz 1` | Disk utilisation and wait times | `%util` near 100, high `await` |
| `dmesg -T \| tail` | Kernel messages | **OOM killer**, disk errors, network drops |
| `ss -s`, `ss -tan` | Socket summary and TCP states | Thousands of `TIME-WAIT` or `CLOSE-WAIT` |

### Load average

Load average counts processes that are **running or waiting to run**, plus (on Linux) those waiting for disk I/O. Compare it with the number of CPUs: a load of 8 on an 8-CPU machine means it's fully busy; 16 means half the work is waiting. A high load with idle CPUs usually means **I/O wait**.

### Containers change the numbers

A container is a process tree in its own **cgroup**. Inside a container:

- `top`, `uptime` and `/proc/meminfo` mostly show the **host**, not the container. A container can be throttled to a standstill while `top` says the CPU is 60% idle.
- The container's real limits and usage are in its cgroup files (cgroup v2):

```bash
cat /sys/fs/cgroup/cpu.max        # "20000 100000" = 20 ms of CPU per 100 ms = 0.2 CPU
cat /sys/fs/cgroup/cpu.stat       # nr_throttled / nr_periods = share of periods throttled
cat /sys/fs/cgroup/memory.max     # memory limit in bytes
cat /sys/fs/cgroup/memory.current # memory in use
cat /sys/fs/cgroup/memory.events  # oom_kill counter
cat /sys/fs/cgroup/cpu.pressure   # PSI: share of time tasks waited for CPU
```

**PSI (pressure stall information)** is the most direct saturation signal Linux has: the percentage of time some (or all) tasks were stalled waiting for CPU, memory or I/O. node-exporter exposes it as `node_pressure_*` (Module 2), and cAdvisor as `container_pressure_*`.

## Following a request across the network

`curl` can time each phase of a request:

```bash
curl -s -o /dev/null -w 'dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n' http://api.lab6/
```

| Timer (cumulative) | Phase | If this jumps |
|---|---|---|
| `time_namelookup` | DNS resolution | DNS server slow or unreachable; too many search-domain lookups |
| `time_connect` | TCP handshake: one **round trip** | Network latency or packet loss (lost SYNs are retried after 1 s) |
| `time_appconnect` | TLS handshake | TLS overhead, certificate checks (0 for plain HTTP) |
| `time_starttransfer` | First byte of the response (TTFB) | **Server** processing time, **plus** one more round trip |
| `time_total` | Whole response | Large responses, slow bandwidth |

The quick rule: **if connect is slow, suspect the network; if only TTFB is slow, suspect the server.** With 150 ms of extra network latency, connect becomes about 150 ms and TTFB about 300 ms (two round trips). With a busy server, connect stays at a fraction of a millisecond and TTFB grows.

### Latency and packet loss

| Problem | Symptoms | Confirm with |
|---|---|---|
| **Latency** | Every request slower by about the same amount; connect time high | `ping` round-trip time; compare with another destination to find which hop or host |
| **Packet loss** | Most requests are fine, some take about **0.2 s or 1 s** extra (TCP retransmissions); p99 explodes while p50 is fine | `ping -c 100` loss %; `nstat` `TcpRetransSegs` and `TcpExtTCPSynRetrans` growing; `ss -ti` shows `retrans` per connection |
| **Bandwidth** | Large responses slow, small ones fine | `iperf3` between the two ends |

Loss is especially nasty: TCP hides it from applications by retransmitting, so there are no errors, only a long tail of slow requests. A lost data packet is resent after about 200 ms (more on slower links), and a lost **SYN** after 1 second, then 3, then 7: that's why loss shows up as requests that are "suspiciously close to 0.2 or 1 second" slower.

### tcpdump

When you need to see the packets themselves:

```bash
tcpdump -n -i eth0 port 53                 # DNS queries and answers
tcpdump -n -i eth0 host 10.244.1.17        # everything to or from one pod
tcpdump -n -i eth0 'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0'   # connection attempts and resets
```

In Kubernetes, run it in a debug container that shares the pod's network namespace (`kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container>`), or on the node.

## Kubernetes DNS

Every pod's `/etc/resolv.conf` looks like this:

```text
search lab6.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

`ndots:5` means: a name with **fewer than 5 dots** is first tried with each search domain appended. Looking up `example.com` (1 dot) sends:

```text
A?    example.com.lab6.svc.cluster.local.    → NXDOMAIN
AAAA? example.com.lab6.svc.cluster.local.    → NXDOMAIN
A?    example.com.svc.cluster.local.         → NXDOMAIN
AAAA? example.com.svc.cluster.local.         → NXDOMAIN
A?    example.com.cluster.local.             → NXDOMAIN
AAAA? example.com.cluster.local.             → NXDOMAIN
A?    example.com.                           → answer
AAAA? example.com.                           → answer
```

**Eight queries** for one external name. It's convenient for short in-cluster names (`api` works within the same namespace), but for services that call external APIs heavily it multiplies the load on CoreDNS and adds latency. Fixes: use fully qualified names with a trailing dot (`example.com.`), lower `ndots` in the pod's `dnsConfig`, or run **NodeLocal DNSCache**.

## How the industry does it

- **eBPF-based tools** (bpftrace, BCC tools such as `execsnoop`, `tcplife`, `biolatency`; Pixie; Cilium Hubble) for low-overhead visibility into processes and network flows without changing applications.
- **Continuous profiling** (Parca, Pyroscope, Grafana Pyroscope) to find where CPU goes.
- **Network observability**: Hubble or flow logs to see dropped packets and NetworkPolicy denials.
- **NodeLocal DNSCache** in larger clusters to cut DNS latency and CoreDNS load.
- **Debug containers** (`kubectl debug`) instead of shipping tools in every production image.

## Common mistakes

- Trusting `top` inside a container to tell you if it's CPU-starved.
- Reading "free" memory instead of "available" (Linux uses spare memory for cache).
- Running out of **inodes** with plenty of disk space left (millions of small files).
- Blaming "the network" without timing the phases: most slow requests turn out to be server time.
- Looking only at averages: packet loss shows up in the tail.
- Forgetting that the response status can lie: an application that returns HTTP 200 with an error in the body hides failures from status-code SLIs (you'll see one in the lab).

## Further reading

- [Brendan Gregg: Linux performance analysis in 60,000 milliseconds](https://netflixtechblog.com/linux-performance-analysis-in-60-000-milliseconds-accc10403c55)
- [Brendan Gregg: Linux performance](https://www.brendangregg.com/linuxperf.html)
- [Kubernetes: Debugging DNS resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/)
- [Linux kernel: PSI, pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [nicolaka/netshoot](https://github.com/nicolaka/netshoot): a container full of network tools

**Next:** the [lab](lab.md): four mystery problems in one service, and a look at DNS.
