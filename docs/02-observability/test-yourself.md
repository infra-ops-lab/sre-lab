# Test yourself: Observability

Answer each question in your own words first, then open the answer. Questions 5 and 9 need a calculator.

??? question "1. What's the difference between monitoring and observability? Give an example of a question only good observability can answer."
    **Monitoring** checks for problems you predicted: "error rate above 1%", "disk above 90%". It's dashboards and alerts built in advance.

    **Observability** is how well you can answer **new** questions from the data the system already emits, without shipping new code. For example: "why is checkout slow only for customers using the new payment provider, and only since 14:05?" Answering that needs high-detail data you can slice by any attribute, usually traces and structured logs, linked to the metrics that raised the alarm.

??? question "2. Metrics, logs and traces: what is each best at? In what order do you usually use them in an incident?"
    - **Metrics**: cheap, aggregated numbers over time. Best for alerts, trends and "how much, how often". Weak at per-request detail.
    - **Traces**: the path and timing of one request across services. Best for "which hop made this slow?"
    - **Logs**: detailed events. Best for "what exactly happened": the error message, the stack trace.

    Usual order: **metrics → traces → logs**. A metric (or SLO alert) says that p99 went up; traces show which service or dependency is slow; that service's logs show why. Exemplars and trace IDs in logs are what make the jumps between them quick.

??? question "3. Explain RED and USE. Which do you apply to what, and which do you start with?"
    - **RED** (Rate, Errors, Duration) is for **services**: anything that handles requests. It describes what users experience.
    - **USE** (Utilisation, Saturation, Errors) is for **resources**: CPU, memory, disk, network, connection pools, queues. It describes what might be causing a problem.

    Start with **RED**: it tells you whether users are affected and narrows down where (which endpoint, which pod). Then apply **USE** to the resources behind that part. Starting with USE gives you numbers like "CPU 85%" with no way to tell whether they matter.

??? question "4. Why should you never graph a raw counter, and why must rate() come before sum()?"
    A counter only goes up and **resets to 0** when the process restarts. A raw counter graph shows "total since the pod started", with meaningless drops at every restart. `rate()` turns it into per-second change and **detects the resets**, so a restart doesn't look like a drop in traffic.

    `rate()` must be applied to each individual series **before** `sum()`. If you sum first, one pod's restart makes the **total** drop. `rate()` treats any drop as a reset and assumes the counter started again from 0, so it adds the whole remaining total as new requests, and the graph shows a huge, false spike.

??? question "5. 98% of requests take 10 ms and 2% take 3 s. What are the average, p50 and p99? Which number would you put on the dashboard?"
    - Average = 0.98 × 0.01 + 0.02 × 3 = 0.0098 + 0.06 ≈ **70 ms**.
    - p50 = **10 ms**.
    - p99 = **3 s** (the slowest 2% includes the 99th percentile).

    Show **p50, p90 and p99** (or the share of requests under your SLO threshold). The average describes no real request, and it hides the 1 in 50 users waiting 3 seconds.

??? question "6. What's wrong with each of these queries?"
    ```promql
    # A
    histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
    # B
    avg(histogram_quantile(0.99, sum by (le, pod) (rate(http_request_duration_seconds_bucket[5m]))))
    # C
    rate(node_memory_MemAvailable_bytes[5m])
    ```

    ??? success "Answer"
        - **A**: there's no `sum by (le)`, so you get one p99 **per series** (per pod, path, status and so on) instead of one for the service.
        - **B**: it averages per-pod p99s. Percentiles can't be averaged. One slow pod with little traffic pulls the average far from the real p99, or a busy slow pod barely moves it. Use `histogram_quantile(0.99, sum by (le) (rate(...)))`.
        - **C**: `rate()` on a **gauge**. Available memory goes up and down; `rate()` assumes a counter and treats every drop as a reset. Use the raw value, or `deriv()` if you really want its trend.

??? question "7. A histogram has buckets at 0.1, 0.25, 0.5, 1 and 2.5 seconds. All slow requests take 1.2 s. What will histogram_quantile report as p99, roughly, and what does that teach you?"
    Something between **1 and 2.5 s**, probably well above 1.2 s. `histogram_quantile` only knows that the requests fell in the 1 s to 2.5 s bucket, and assumes they're spread evenly inside it. In the lab, 2.0 s requests were reported as 2.485 s.

    Lessons: a percentile from a histogram is an **estimate**, and its precision depends on the buckets. Put bucket boundaries around the thresholds you care about (exactly at your SLO latency threshold), or use **native histograms**, which have much finer buckets.

??? question "8. p99 latency for a service doubled. Node CPU is 40% and every pod uses 0.2 cores. What would you check next, and why?"
    Check each container's CPU against its **limit**, and its **CFS throttling**:

    ```promql
    sum by (pod) (rate(container_cpu_cfs_throttled_periods_total{container="app"}[5m]))
    / sum by (pod) (rate(container_cpu_cfs_periods_total{container="app"}[5m]))
    ```

    If the limit is 0.2 cores, the containers are at **100%** utilisation even though the node is mostly idle, and the kernel makes them wait for the next 100 ms period. That's what you found in the lab: node dashboards looked healthy while 97% of periods were throttled and p99 went from 5 ms to 2 s.

    Fix: raise the limit (or remove CPU limits for latency-sensitive services and rely on requests), and always check throttling and latency before "right-sizing".

??? question "9. A developer adds a label customer_id (20,000 customers) to a histogram with 10 buckets that already has labels method (3 values) and status (5 values). The service runs 6 pods. How many series, before and after?"
    A histogram has its buckets (10, including `+Inf` here) plus `_sum` and `_count`: **12 series** per combination of labels.

    - Before: 6 pods × 3 methods × 5 statuses × 12 = **1,080 series**.
    - After: 1,080 × 20,000 = **21.6 million series**.

    In practice not every customer hits every method and status on every pod, so the real number would be lower, but still millions. That's enough to run a typical Prometheus out of memory. `customer_id` belongs in logs or traces, not in a metric label.

??? question "10. How do you protect a shared Prometheus from one team's cardinality mistake? What happens to that team when the protection kicks in?"
    - **Prevent**: review metrics and labels in code review; publish label guidelines (no IDs, no raw URLs).
    - **Limit**: set `sampleLimit` (and optionally `labelLimit`) on every ServiceMonitor or scrape job. Platform teams often set a default limit per team.
    - **Detect**: alert on fast growth of `prometheus_tsdb_head_series`, and check **TSDB Status** for the top metrics and labels.
    - **Emergency fix**: drop the metric or label with `metricRelabelings` while the code is fixed.

    When a target goes over `sampleLimit`, its **whole scrape is rejected**: `up` is 0 and the team loses that target's metrics until they fix it, and `TargetDown` fires. One team's dashboard breaks instead of everyone's monitoring. Memory used by the series already created is freed only after the next head compaction, a few hours later.

??? question "11. Design the top of a dashboard for a service that on-call will open during an incident. What goes in the first three rows?"
    1. **Is it healthy?** SLO burn rates (short window) and the SLO alerts that are firing. On-call should know in 2 seconds whether users are hurting.
    2. **What do users see?** RED: request rate by status, error ratio, and p50/p90/p99 latency, each with units and a threshold line.
    3. **Where is it?** The same RED panels split by endpoint and by pod (or zone). Then, below, **USE** for what's behind it: CPU against limit and throttling, memory against limit, restarts, and dependency latency.

    Keep it in Git (dashboards as code), with the same layout for every service.

??? question "12. Your team wants to know which customers use the checkout API most. A colleague suggests adding customer_id to the request metric. What do you propose instead?"
    Metrics are for aggregates with **bounded** labels. Per-customer analysis needs a store designed for high cardinality:

    - **Structured logs** (or OTel events) with `customer_id` as a field, queried in the logging system or exported to a data warehouse.
    - **Trace attributes**: add `customer_id` to spans, so you can search traces for one customer during a support case.
    - If you need a metric, aggregate at a coarser level: customer **tier** (free, pro, enterprise) or **region**, a handful of values.

    That gives the business its answer without putting millions of series in Prometheus.
