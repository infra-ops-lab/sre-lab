# Lab: Observability for the checkout service

In this lab you build the RED and USE views for **checkout**, see an average hide a latency problem, track down a cause that the node dashboards can't show, put the views on a dashboard as code, and stop a cardinality explosion.

| | |
|---|---|
| **Time** | About 75 minutes |
| **You need** | The [lab environment](../setup.md) running, with Prometheus on <http://localhost:9090> and Grafana on <http://localhost:3000>. Module 1's SLO rules applied. |
| **Files** | `labs/02-observability/` |

Each part starts with a **task**. Try it yourself first, then open the solution.

All queries in this lab use the same filter for **user** requests, to leave out probes and scrapes (Module 1, Part 1):

```promql
{namespace="shop", path!~"healthz|readyz|metrics"}
```

## Part 1: Counters and rate()

**Task:** graph the raw counter below for the last few hours, using the **Graph** tab. Then graph the same thing wrapped in `rate(...[1m])`. Which one would you put on a dashboard, and why?

```promql
sum(http_request_duration_seconds_count{namespace="shop", path="root"})
```

??? success "Solution"
    The raw counter is a line that only ever goes up, with sudden drops to near zero wherever pods restarted (after a laptop restart or a `helm upgrade`). The height of the line means "requests since the pod started", which tells you nothing useful.

    ```promql
    sum(rate(http_request_duration_seconds_count{namespace="shop", path="root"}[1m]))
    ```

    `rate()` gives requests per second: between about **14 and 20** in this lab, depending on how fast your machine is. It also detects counter resets and handles them, so the restarts don't show up as dips. Always apply `rate()` (or `increase()`) to a counter **before** `sum()`: if you sum first, Prometheus can't see the resets.

## Part 2: RED for checkout

**Task:** write three queries for checkout's user traffic:

1. **Rate**: requests per second, split by status code.
2. **Errors**: the share of requests that are 5xx. It should return **0**, not "no data", when nothing is failing.
3. **Duration**: p50, p90 and p99 latency for the whole service.

??? success "Solution"
    ```promql
    # 1. Rate
    sum by (status) (rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[1m]))

    # 2. Errors ("or vector(0)" turns "no 5xx series" into 0, as in Module 1)
    (sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status=~"5.."}[1m])) or vector(0))
    /
    sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[1m]))

    # 3. Duration (change 0.99 to 0.5 and 0.9 for the others)
    histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[1m])))
    ```

    Healthy results:

    ```text
    rate      {status="200"}  19.4
    errors    0
    p50       0.0025
    p90       0.0045
    p99       0.00495
    ```

**Task:** p50 is exactly `0.0025` and p99 is `0.00495`. Did checkout really answer half its requests in exactly 2.5 ms? Look at the `le` values of the buckets:

```promql
http_request_duration_seconds_bucket{namespace="shop", path="root", status="200"}
```

??? success "Solution"
    The buckets are `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, +Inf`. Almost every request lands in the first bucket (0 to 5 ms), and the histogram knows nothing about where inside it. `histogram_quantile` assumes the requests are spread evenly through the bucket, so p50 comes out at its middle (2.5 ms) and p99 just below its top (4.95 ms).

    A percentile from a histogram is an **estimate**, only as precise as the buckets around it. That's fine for an SLO threshold sitting on a bucket boundary (500 ms in Module 1), but don't read 0.00495 as "4.95 ms".

## Part 3: The average hides the problem

You'll make 5% of user requests slow again, as in Module 1.

**Task:** predict the **average** latency, **p50**, **p95** and **p99** when 95% of requests take about 3 ms and 5% take 2 s.

??? success "Prediction"
    - Average ≈ 0.95 × 0.003 + 0.05 × 2 ≈ **0.1 s**.
    - p50 and p95 are still fast requests: a few **ms**. Exactly 5% are slow, so p95 sits right at the edge.
    - p99 is one of the slow requests: about **2 s**.

```bash
kubectl -n shop set env deploy/loadgen SLOW_PCT=5
```

Wait 3 minutes, then run the average and the three percentiles:

```promql
# average = total time spent / number of requests
sum(rate(http_request_duration_seconds_sum{namespace="shop", path!~"healthz|readyz|metrics"}[2m]))
/
sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[2m]))

histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[2m])))
```

| Statistic | Result in two test runs |
|---|---|
| Average | **0.096 s** and 0.104 s |
| p50 | 0.0026 s |
| p95 | 0.0050 s and **1.05 s** |
| p99 | **2.19 s** and 2.21 s |

A dashboard that shows only the average says "about 100 ms, fine". One request in 20 takes 2 seconds.

p95 jumps between runs because exactly 5% of requests are slow, so the 95th percentile sits on the border between the fast and the slow group. A tiny change in the mix moves it from one side to the other.

**Task:** now find **where** the slow requests are. Split p99 by `path`.

??? success "Solution"
    ```promql
    histogram_quantile(0.99, sum by (le, path) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[2m])))
    ```

    ```text
    {path="delay"}  2.485
    {path="root"}   0.00495
    ```

    The slow requests all go to one endpoint (`/delay/2`, which loadgen calls for the "slow" share). In a real service this is the moment you go from "checkout is slow" to "the payment endpoint is slow".

    Also notice **2.485**: the requests really take 2.0 s, but they fall in the 1 s to 2.5 s bucket, so the estimate is near the top of it.

**Task:** a colleague's dashboard uses this query. What's wrong with it? Run it and look at the result.

```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[2m]))
```

??? success "Solution"
    There's no `sum by (le)`, so it calculates a separate p99 **for every series**: every pod × path × status. You get a handful of lines (`2.485` and `0.00495` for each pod) instead of one answer for the service.

    The other common mistake is `avg(histogram_quantile(0.99, sum by (le, pod) (...)))`: averaging the pods' p99s. In this lab it happens to give nearly the right number, because loadgen spreads traffic evenly. In production, one slow pod that gets 5% of the traffic can make the average of the p99s badly wrong. **Add up the buckets, then take the quantile.**

Put it back:

```bash
kubectl -n shop set env deploy/loadgen SLOW_PCT=0
```

## Part 4: Find the cause with USE

A colleague "right-sized" checkout's CPU to save money. Apply their change:

```bash
helm -n shop upgrade checkout podinfo/podinfo --version 6.17.0 --reuse-values \
  --set resources.limits.cpu=5m --wait
```

Wait 3 minutes. Your latency SLO starts burning. You're on call.

**Task 1:** use **RED** first. Is it errors or latency? One endpoint or all of them? One pod or all of them?

??? success "Solution"
    ```promql
    histogram_quantile(0.99, sum by (le, path) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[2m])))
    histogram_quantile(0.99, sum by (le, pod) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[2m])))
    ```

    - No errors, but **p99 goes from 5 ms to between about 1 and 2.5 s** (it varies from pod to pod and run to run). p50 stays at about 3 ms.
    - It's the `root` path, which does no real work, so it isn't slow code.
    - It's **every pod**, so it isn't one bad node or one bad pod.
    - The request rate drops (to about 11-12 per second), because loadgen waits for slow responses. In production, users would be abandoning their carts.

    Something is wrong with all the pods at once, and the code didn't change. Time to check resources.

**Task 2:** now use **USE**. Check the **nodes** first, then the **containers**. Which resource is saturated?

```promql
# node CPU utilisation
1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

# checkout CPU used per pod, in cores
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="shop", container="podinfo"}[2m]))
```

??? success "Solution"
    The nodes are **70-80% idle**, and each checkout pod uses only about **0.005 cores**. Both look fine, and both are misleading. 0.005 cores is exactly the new **limit** (`5m`), so the container is at **100% utilisation**.

    The saturation signal for a container with a CPU limit is **CFS throttling**: the share of 100 ms scheduling periods in which the container used its whole quota and had to wait.

    ```promql
    sum by (pod) (rate(container_cpu_cfs_throttled_periods_total{namespace="shop", container="podinfo"}[2m]))
    /
    sum by (pod) (rate(container_cpu_cfs_periods_total{namespace="shop", container="podinfo"}[2m]))
    ```

    ```text
    {pod="checkout-podinfo-7d64cc9964-gzkrx"}  1
    {pod="checkout-podinfo-7d64cc9964-6qq28"}  0.996
    {pod="checkout-podinfo-7d64cc9964-9cc59"}  0.969
    ```

    Checkout is throttled in **94-100%** of periods (94-99% and 97-100% in two test runs). A request that arrives after the container has used its 0.5 ms of CPU for the period waits for the next period, and requests pile up behind each other.

    Before this change, these two throttling metrics **didn't exist** for checkout: cAdvisor reports them only for containers that have a CPU limit.

    kube-prometheus-stack also has a built-in alert for this. Look for `CPUThrottlingHigh` in **Alerts**: it's **pending** now, and fires once a container has been throttled in more than 25% of periods for 15 minutes. Its severity is only `info`, because throttling by itself isn't always a problem. The SLO tells you whether users are affected.

**Task 3:** fix it, and confirm with the right signal that the fix worked.

??? success "Solution"
    Roll back the change:

    ```bash
    helm -n shop rollback checkout --wait
    ```

    `helm rollback` with no revision number goes back to the previous release. Confirm with **RED**, not with the alert: p99 is back to about 5 ms within 1-2 minutes, and the latency burn rate (`slo:current_burn_rate:ratio{sloth_slo="requests-latency"}`) falls back to 0. The SLO alerts take longer to clear, as you saw in Module 1.

    The real fix is a process one: right-sizing must be checked against **throttling and latency**, not only against average CPU usage. Many teams don't set CPU **limits** at all for latency-sensitive services, only **requests**. Module 8 comes back to this.

## Part 5: USE for the nodes

**Task:** write the node USE queries: CPU utilisation, CPU saturation, memory utilisation and an errors signal. Then compare the three nodes. What's odd?

??? success "Solution"
    ```promql
    # CPU utilisation
    1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))

    # CPU saturation: share of time that tasks were waiting for a CPU (pressure stall information)
    rate(node_pressure_cpu_waiting_seconds_total[5m])

    # Memory utilisation
    1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes

    # Errors: OOM kills and network interface errors
    node_vmstat_oom_kill
    sum by (instance) (rate(node_network_receive_errs_total[5m]) + rate(node_network_transmit_errs_total[5m]))
    ```

    **The odd part:** all three nodes show almost exactly the same CPU, memory and load. kind nodes are containers on **one** Docker VM, so node-exporter on each "node" sees the same kernel and the same hardware. On real clusters every node is different. Remember this when you use kind for capacity questions: node-level numbers are meaningless there, while container-level numbers (cgroups) are correct.

## Part 6: A dashboard as code

Apply the checkout dashboard. It's a ConfigMap with the label `grafana_dashboard: "1"`, which Grafana's sidecar loads automatically:

```bash
kubectl apply -f labs/02-observability/checkout-dashboard.yaml
```

Open **Grafana → Dashboards → Checkout service** (<http://localhost:3000/d/checkout>). Read it from top to bottom:

1. **SLO**: availability and latency burn rates, and the SLO alerts that are firing.
2. **RED**: rate by status, error ratio, p50/p90/p99.
3. **USE**: CPU per pod, memory per pod, restarts.

**Task:** the USE row is missing the panel that would have solved Part 4 in one glance. Add a **CPU throttling** panel to `checkout-dashboard.yaml`, re-apply it, and check that it appears. Then repeat Part 4 with the dashboard open.

??? success "Solution"
    Add this object to the `panels` list, after the "Container restarts" panel. Remember the comma before it.

    ```json
    {
      "type": "timeseries", "title": "CPU throttled (% of periods)",
      "description": "Above a few % for a latency-sensitive service means the CPU limit is too low.",
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "gridPos": { "x": 0, "y": 23, "w": 24, "h": 8 },
      "fieldConfig": { "defaults": { "unit": "percentunit", "min": 0, "max": 1 } },
      "targets": [ { "refId": "A", "legendFormat": "{{pod}}",
        "expr": "sum by (pod) (rate(container_cpu_cfs_throttled_periods_total{namespace=\"shop\", container=\"podinfo\"}[1m])) / sum by (pod) (rate(container_cpu_cfs_periods_total{namespace=\"shop\", container=\"podinfo\"}[1m]))" } ]
    }
    ```

    ```bash
    kubectl apply -f labs/02-observability/checkout-dashboard.yaml
    ```

    The sidecar reloads the dashboard within about a minute; refresh the page. Without a CPU limit, the panel shows **No data**. That's expected, as you saw in Part 4.

    Because the dashboard is a file in Git, the panel you added goes through code review like any other change, and nobody can lose it by clicking "Save" over it in the UI.

## Part 7: A cardinality explosion

The team that owns **cart** just shipped a new version with per-user metrics. Deploy it:

```bash
kubectl apply -f labs/02-observability/cart-metrics.yaml
```

Every 15 seconds, 100 more users show up, up to 3,000.

**Task 1:** watch how many samples each cart scrape returns, and how many series Prometheus holds in memory. Refresh a few times over 5 minutes.

```promql
scrape_samples_scraped{job="cart"}
prometheus_tsdb_head_series
```

??? success "What you see"
    | Time after deploy | Samples per cart scrape | Head series (whole Prometheus) |
    |---|---|---|
    | 1 minute | 2,400 | about 60,000 |
    | 4 minutes | 12,800 | 70,000 |
    | 7 minutes | 22,400 | 79,500 |
    | 8 minutes on | 24,000 (the cap) | about 82,000 |

    Cart grows by 800 samples every scrape, and Prometheus's memory grows with it. In a real service there's no cap: it grows with your user base. Your exact numbers depend on what else runs in the cluster.

**Task 2:** find the guilty metric and label, without knowing in advance that it's cart. Use **Status → TSDB Status** in the Prometheus UI, or this query:

```promql
topk(5, count by (__name__) ({__name__=~".+"}))
```

??? success "Solution"
    `cart_request_duration_seconds_bucket` jumps to the top of the list, above all the Kubernetes API server histograms. TSDB Status also shows `user_id` near the top of **labels with the most values**.

    Each user creates **8 series**: one counter, plus a histogram with 5 buckets, `_sum` and `_count`. 3,000 users × 8 = **24,000 series** from one small service. With 100,000 real users it would be 800,000.

    The `topk(count by (__name__) ...)` query touches every series in Prometheus. It's fine in a lab; on a big production Prometheus, use TSDB Status instead.

**Task 3:** protect Prometheus first. Add a limit to cart's ServiceMonitor, so that a target exposing more than 2,000 samples is rejected:

```bash
kubectl -n shop patch servicemonitor cart --type=json \
  -p '[{"op":"add","path":"/spec/sampleLimit","value":2000}]'
```

Wait 1-2 minutes for the Prometheus operator to reload the configuration. What happens to the cart target? Check **Status → Targets** and:

```promql
up{job="cart"}
scrape_samples_scraped{job="cart"}
prometheus_target_scrapes_exceeded_sample_limit_total
```

??? success "Solution"
    - The cart target turns **down** with the error `sample limit exceeded`, and `up{job="cart"}` is **0**.
    - `scrape_samples_scraped` still shows how big the scrape was (24,000), so you can see how far over the limit it is.
    - `prometheus_target_scrapes_exceeded_sample_limit_total` goes up once Prometheus next scrapes its own metrics, up to 30 seconds later.
    - The whole scrape is rejected, not just the samples over the limit, and no new cart series are added. Prometheus is safe.
    - The cart team loses its metrics, and after 10 minutes the built-in `TargetDown` alert fires. That's the right trade-off: one team's dashboard breaks, instead of everyone's monitoring falling over.

**Task 4:** now fix the cause. The cart team removes the `user_id` label (here, with a setting):

```bash
kubectl -n shop set env deploy/cart PER_USER_METRICS=false
```

Check the target again. Why is `prometheus_tsdb_head_series` still high?

??? success "Solution"
    Cart comes back **up**, with **8 samples** per scrape, and it stays under the limit. Keep the `sampleLimit` in place: it's the guardrail for the next mistake.

    `prometheus_tsdb_head_series` drops only slowly. Series that stopped receiving samples stay in Prometheus's in-memory "head" block until the next head compaction, which happens about every 2 hours. The data already written stays on disk until retention removes it. A cardinality explosion costs memory for hours after you fix it, so catching it early with `sampleLimit` matters.

    If you need to know which users check out most, that belongs in logs or an analytics pipeline, not in Prometheus labels.

## Check your work

- [ ] You can explain why you never graph a raw counter.
- [ ] You wrote RED queries for checkout, including p99 with `sum by (le)`.
- [ ] You saw an average of 96 ms while 1 request in 20 took 2 seconds.
- [ ] You found a CPU limit problem that the node dashboards didn't show, using throttling.
- [ ] You added a panel to a dashboard defined in Git.
- [ ] You found a cardinality explosion with TSDB Status, contained it with `sampleLimit`, and know why memory stays high after the fix.

## Reset

Keep the checkout dashboard: later modules use it. Remove cart and make sure checkout is healthy:

```bash
kubectl delete -f labs/02-observability/cart-metrics.yaml
kubectl -n shop set env deploy/loadgen ERROR_PCT=0 SLOW_PCT=0
kubectl -n shop get deploy checkout-podinfo -o jsonpath='{.spec.template.spec.containers[0].resources}'; echo
```

The last command should show no `limits`. If it still shows `"limits":{"cpu":"5m"}`, run `helm -n shop rollback checkout --wait`.

**Next:** [Test yourself](test-yourself.md).
