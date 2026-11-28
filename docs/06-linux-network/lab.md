# Lab: Four mystery problems and a DNS surprise

In this lab you investigate an **api** service that misbehaves in four different ways, using Linux and network tools from inside the cluster. Then you watch what one DNS lookup really costs.

| | |
|---|---|
| **Time** | About 60 minutes |
| **You need** | The [lab environment](../setup.md) running |
| **Files** | `labs/06-linux-network/` |

The lab runs in namespace `lab6`:

- **api**: podinfo, plus a `net` sidecar container that shares the api's network (so `tc`, `ss`, `nstat` and `tcpdump` run there see the api's traffic). Uploads go to a small 32 MiB volume at `/data`.
- **toolbox**: a client pod with every network tool ([netshoot](https://github.com/nicolaka/netshoot)). You investigate from here.

```bash
kubectl apply -f labs/06-linux-network/lab6.yaml
kubectl -n lab6 rollout status deploy/api
kubectl -n lab6 wait --for=condition=Ready pod/toolbox
```

**Rules:** don't read `break.sh`. Each scenario has a hint and a solution.

## Part 1: A baseline

You can't recognise "slow" without knowing "normal". Open a shell in the toolbox:

```bash
kubectl -n lab6 exec -it toolbox -- bash
```

**Task:** measure the api from the toolbox: the time of each phase of one request, then 40 requests summarised.

```bash
curl -s -o /dev/null -w 'dns=%{time_namelookup} connect=%{time_connect} ttfb=%{time_starttransfer} total=%{time_total}\n' http://api.lab6/

for i in $(seq 1 40); do curl -s -o /dev/null -m 10 -w '%{time_total}\n' http://api.lab6/; done | sort -n | awk '{a[NR]=$1} END {print "p50=" a[int(NR*0.5)], "p95=" a[int(NR*0.95)], "max=" a[NR]}'
```

??? success "What you see"
    ```text
    dns=0.002 connect=0.002 ttfb=0.003 total=0.003
    p50=0.003 p95=0.004 max=0.005
    ```

    About **3 ms** per request, all phases tiny. Keep these numbers: they're "normal". Keep the toolbox shell open, and use a second terminal on your machine for `break.sh` and `kubectl`.

## Part 2: Scenario 1

```bash
./labs/06-linux-network/break.sh 1
```

**Task:** from the toolbox, measure again. What's slow, network or server? Then find the cause.

??? tip "Hint"
    Compare `connect` and `ttfb`. Then `ping` the api pod's IP, and another pod's IP for comparison (`kubectl get pods -A -o wide`). If only the api is slow, look at its network configuration from the `net` sidecar.

??? success "Solution"
    ```text
    dns=0.002 connect=0.153 ttfb=0.304 total=0.304
    ```

    **Connect** jumped to 150 ms: the TCP handshake itself is slow, which is the network. TTFB is about two round trips (300 ms), so the server isn't adding time.

    ```bash
    ping -c 4 <api-pod-ip>          # rtt avg = 150.4 ms
    ping -c 4 <checkout-pod-ip>     # rtt avg = 0.145 ms
    ```

    Only traffic to the api is slow, so look at the api's network interface:

    ```bash
    kubectl -n lab6 exec deploy/api -c net -- tc qdisc show dev eth0
    ```

    ```text
    qdisc netem 8004: root refcnt 9 limit 1000 delay 150ms
    ```

    Someone left a **netem** rule on the interface, adding 150 ms to every outgoing packet. `tc` (traffic control) is how tools like chaos frameworks inject latency (Module 9). In real life, the same symptom comes from cross-region calls, a congested link or an overloaded node. Remove it:

    ```bash
    kubectl -n lab6 exec deploy/api -c net -- tc qdisc del dev eth0 root
    ```

## Part 3: Scenario 2

```bash
./labs/06-linux-network/break.sh 2
```

**Task:** run the 40-request summary again. How is this different from scenario 1? Find the cause and the evidence.

??? tip "Hint"
    Look at p50 and max separately. Then `ping -c 40 -i 0.2` the api pod, and compare the TCP retransmission counters (`nstat -az TcpRetransSegs TcpExtTCPSynRetrans`, in the api's `net` container) before and after sending traffic.

??? success "Solution"
    Most requests are as fast as normal, but some are much slower:

    ```text
    p50=0.003 p95=0.21 max=1.05
    ```

    Loss is random, so run the batch two or three times; one batch of 40 can be lucky. The slow requests are about **0.2 s** or **1 s** slower, never anything in between. That's the fingerprint of **packet loss**: TCP resends a lost data packet after about 200 ms, and a lost SYN (the first packet of the handshake) after 1 second.

    ```bash
    ping -c 40 -i 0.2 -q <api-pod-ip>
    ```

    ```text
    40 packets transmitted, 35 received, 12.5% packet loss
    ```

    ```bash
    kubectl -n lab6 exec deploy/api -c net -- nstat -az TcpRetransSegs TcpExtTCPSynRetrans
    ```

    ```text
    TcpRetransSegs                  27
    TcpExtTCPSynRetrans             18
    ```

    27 retransmitted segments for 40 requests, 18 of them SYNs (the handshake). And `tc qdisc show dev eth0` shows `netem loss 15%`. Remove it as in scenario 1.

    Notice: **no errors at all**. TCP hides the loss by retrying, so error-ratio dashboards stay green. Only the latency **tail** shows it, and only if you look at p95/p99 rather than the average (Module 2).

## Part 4: Scenario 3

```bash
./labs/06-linux-network/break.sh 3
```

**Task:** measure again, then find the cause inside the api pod.

??? tip "Hint"
    Connect is normal, TTFB isn't: the server is slow. Look at the processes in the `app` container (`top -b -n1`), and at its cgroup CPU files (`/sys/fs/cgroup/cpu.max`, `/sys/fs/cgroup/cpu.stat`).

??? success "Solution"
    ```text
    connect=0.002 ttfb=0.035 (average)      p50=0.004 p95=0.086
    ```

    Connect is normal; the server is slow some of the time.

    ```bash
    kubectl -n lab6 exec deploy/api -c app -- top -b -n1 | head -12
    ```

    ```text
    Load average: 9.56 7.89 5.19
      PID  PPID USER     STAT   VSZ %VSZ CPU %CPU COMMAND
       25     1 app      R     1644   0%   2   2% sh /tmp/report-builder.sh
       24     1 app      R     1644   0%   1   2% sh /tmp/report-builder.sh
        1     0 app      S    1261m   5%   7   0% ./podinfo --port=9898 ...
    ```

    Two `report-builder.sh` processes are always **R**unning. Their `%CPU` says only 2%, because `top` in a container shows a share of the whole **host** (and the load average is the host's too). The container's own numbers tell the truth:

    ```bash
    kubectl -n lab6 exec deploy/api -c app -- cat /sys/fs/cgroup/cpu.max /sys/fs/cgroup/cpu.stat
    ```

    ```text
    20000 100000          <- limit: 0.2 CPU
    nr_periods 137
    nr_throttled 135      <- throttled in 135 of 137 periods
    ```

    The busy loops use the container's whole 0.2-CPU quota, so podinfo waits for the next 100 ms period to run: the same throttling as in Module 2, seen from inside. Look at what the script does (`cat /tmp/report-builder.sh`: an endless loop), then stop it:

    ```bash
    kubectl -n lab6 exec deploy/api -c app -- pkill -f report-builder
    ```

    In real life this is a background job, a stuck thread or a runaway cron inside the same container as the web server. Lessons: give background work its own container or pod, and check the **cgroup**, not `top`.

## Part 5: Scenario 4

```bash
./labs/06-linux-network/break.sh 4
```

**Task:** the api's **upload** feature is broken. Upload a file from the toolbox and look carefully at the response. Then find the cause.

```bash
head -c 4096 /dev/urandom > /tmp/upload.bin
curl -s -w ' HTTP %{http_code}\n' --data-binary @/tmp/upload.bin http://api.lab6/store
```

??? tip "Hint"
    Read the response body, not just the status code. Then read the app's logs, and check the disk where uploads go (`df -h /data`, then `du`, including hidden files).

??? success "Solution"
    ```text
    {
      "code": 500,
      "message": "writing file failed"
    } HTTP 200
    ```

    The **body** says 500; the **HTTP status** says 200. Any SLI based on status codes, like checkout's in Module 1, would count this failed upload as a success. The logs say why:

    ```bash
    kubectl -n lab6 logs deploy/api -c app | grep -i fail
    ```

    ```text
    "msg":"writing file failed","error":"write /data/...: no space left on device"
    ```

    ```bash
    kubectl -n lab6 exec deploy/api -c app -- df -h /data
    kubectl -n lab6 exec deploy/api -c app -- du -ah /data
    ```

    ```text
    tmpfs                    32.0M     32.0M         0 100% /data
    32.0M   /data/.cache/thumbnails.tmp
    ```

    A hidden `.cache` directory has filled the volume. `ls /data` wouldn't show it; `du -a` (or `ls -la`) does. Clean up after confirming it's safe (here it's a temporary file):

    ```bash
    kubectl -n lab6 exec deploy/api -c app -- rm /data/.cache/thumbnails.tmp
    ```

    The upload now returns a hash. Real-life versions: logs or temp files filling a volume, or the node's disk filling up (which makes the kubelet **evict** pods). Alert on disk space **predicted** to run out, as kube-prometheus-stack's `NodeFilesystemSpaceFillingUp` does.

## Part 6: What one DNS lookup costs

```bash
./labs/06-linux-network/break.sh reset
```

**Task:** in the toolbox, look at `/etc/resolv.conf`. Then capture the DNS traffic while fetching one external page. How many DNS queries does one request send?

```bash
cat /etc/resolv.conf
tcpdump -n -l -i eth0 udp port 53 & sleep 1; curl -s -o /dev/null http://example.com/; sleep 1; kill %1
```

??? success "What you see"
    ```text
    search lab6.svc.cluster.local svc.cluster.local cluster.local
    nameserver 10.96.0.10
    options ndots:5
    ```

    ```text
    A? example.com.lab6.svc.cluster.local.
    AAAA? example.com.lab6.svc.cluster.local.
    A? example.com.svc.cluster.local.
    AAAA? example.com.svc.cluster.local.
    A? example.com.cluster.local.
    AAAA? example.com.cluster.local.
    A? example.com.
    AAAA? example.com.
    ```

    **Eight queries**, six of which are guaranteed to fail. `example.com` has fewer than 5 dots, so the resolver tries every search domain first.

    Try the fully qualified name with a trailing dot:

    ```bash
    tcpdump -n -l -i eth0 udp port 53 & sleep 1; curl -s -o /dev/null http://example.com./; sleep 1; kill %1
    ```

    Only **two** queries (A and AAAA). For services that call external APIs at high rates, that's 4x less load on CoreDNS. Other options: set `dnsConfig.options: [{name: ndots, value: "2"}]` in the pod spec, or run NodeLocal DNSCache.

    If your lab machine has no internet access, the external lookups fail, but you still see the eight queries.

## Check your work

- [ ] You can tell network latency from server slowness using curl's phase timings.
- [ ] You recognised packet loss from the "about 1 second extra" tail, and confirmed it with ping and TCP retransmission counters.
- [ ] You found a CPU hog with `top`, and confirmed the throttling with the cgroup files, not with `top`'s percentages.
- [ ] You found a full disk caused by a hidden directory, and noticed the HTTP 200 that hid the failure.
- [ ] You can explain `ndots:5` and why one external lookup sent eight queries.

## Reset

```bash
kubectl delete namespace lab6
```

**Next:** [Test yourself](test-yourself.md).
