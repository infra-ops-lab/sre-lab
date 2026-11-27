# Lab: SLOs for the checkout service

In this lab you define two SLOs for **checkout**, generate the Prometheus rules with [Sloth](https://sloth.dev), then break the service on purpose and watch the error budget burn.

| | |
|---|---|
| **Time** | About 60 minutes |
| **You need** | The [lab environment](../setup.md) running, with Prometheus on <http://localhost:9090> |
| **Files** | `labs/01-slos/` |

Each part starts with a **task**. Try it yourself first, then open the solution.

## Part 1: Find the users in the metrics

checkout records every request in a Prometheus histogram called `http_request_duration_seconds`, labelled by `path` and `status`.

**Task:** in the Prometheus UI, show the request rate per path and status. Which series are real users, and which aren't?

??? success "Solution"
    ```promql
    sum by (path, status) (rate(http_request_duration_seconds_count{namespace="shop"}[1m]))
    ```

    ```text
    {path="root", status="200"}     14.21
    {path="healthz", status="200"}  0.23
    {path="readyz", status="200"}   0.23
    {path="metrics", status="200"}  0.1
    ```

    Only `root` is user traffic (loadgen). `healthz` and `readyz` are kubelet probes, and `metrics` is Prometheus scraping. None of them should count in an SLI.

## Part 2: Write the SLIs by hand

Before using a tool, write the queries yourself. An SLI is **bad events / total events** (or good / total).

**Task 1:** write the **availability** error ratio: the share of user requests that returned a 5xx, over 5 minutes.

??? success "Solution"
    ```promql
    sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status=~"5.."}[5m]))
    /
    sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[5m]))
    ```

    On a fresh lab this returns **no data**, not 0. If checkout hasn't returned a single 5xx since its pods started, there are no 5xx series at all, so the top of the fraction is empty, and empty divided by anything is empty. A dashboard shows a gap, and an alert can't fire. Sloth's version in Part 3 adds `or vector(0)` to the top to fix that.

**Task 2:** write the **latency** error ratio: the share of user requests that took **longer than 0.5 s**. Hint: a histogram has a `_bucket` series with an `le` ("less than or equal") label.

??? success "Solution"
    Slow requests = all requests − requests in the `le="0.5"` bucket.

    ```promql
    (
      sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[5m]))
      -
      sum(rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics", le="0.5"}[5m]))
    )
    /
    sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[5m]))
    ```

    This works only because the histogram has a bucket boundary at exactly 0.5 s. Choose your latency threshold from the buckets you have, or add the bucket you need.

## Part 3: Turn the SLIs into SLOs with Sloth

Open `labs/01-slos/checkout-slos.yaml`. It defines two SLOs:

| SLO | SLI | Target | Error budget |
|---|---|---|---|
| `requests-availability` | % of user requests that aren't 5xx | 99.5% | 0.5% |
| `requests-latency` | % of user requests under 0.5 s | 99% | 1% |

Generate the Prometheus rules. The script runs Sloth in a container, so you don't need to install it:

```bash
./labs/01-slos/generate.sh
```

**Task:** open the generated `labs/01-slos/checkout-slo-rules.yaml` and answer:

1. Which time windows does Sloth record the error ratio for?
2. Find the page alert for availability. What two thresholds does it use, and where do they come from?

??? success "Solution"
    1. `slo:sli_error:ratio_rate5m`, `30m`, `1h`, `2h`, `6h`, `1d`, `3d` and `30d`: every window the multi-window alerts need, plus 30 days for the budget.
    2. `14.4 * 0.005` on the **5m and 1h** windows, **or** `6 * 0.005` on the **30m and 6h** windows. 0.005 is the error budget (100% − 99.5%), and 14.4 and 6 are the page burn rates from the [lesson](index.md#alerting-on-burn-rate). The ticket alert uses 3x (2h and 1d) and 1x (6h and 3d).

Apply the rules. Prometheus picks them up within about 30 seconds:

```bash
kubectl apply -f labs/01-slos/checkout-slo-rules.yaml
```

Check the current SLIs and burn rates:

```promql
slo:sli_error:ratio_rate5m
slo:current_burn_rate:ratio
```

Both SLOs should be at or near **0**. If the latency SLO shows a small number, that's real: a few user requests are slower than 0.5 s.

## Part 4: Burn the budget

**Task:** before you change anything, **predict**. If 30% of user requests fail, what will the availability burn rate be? Will it page?

??? success "Prediction"
    Burn rate = 0.30 / 0.005 = **60**. That's far above 14.4, so yes, it should page.

Now make 30% of requests fail:

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=30
```

Watch these in the Prometheus UI. Use the **Graph** tab, refresh every 30 seconds, and keep the tab open:

```promql
slo:current_burn_rate:ratio{sloth_slo="requests-availability"}
ALERTS{alertname="CheckoutAvailabilityBudgetBurn"}
```

What you should see:

| Time after the change | Burn rate (5m) | Alerts |
|---|---|---|
| 40 s | about 8 | **page** and **ticket** firing |
| 2 minutes | about 27 | firing |
| 6 minutes | **60**, and it stays there | firing |

The burn rate climbs for about 5 minutes because the 5-minute window is still filling with bad requests. Then it settles at the 60 you predicted. Your exact numbers will differ a little, depending on when you refresh.

!!! question "Why did it page so fast?"
    In production, with the same 30% failure rate, this alert would take about **14 minutes** to fire. The 1-hour window has to fill until the error ratio passes 14.4 × 0.5% = 7.2%, which takes 7.2 / 30 of an hour.

In the lab it fired in under a minute because **your Prometheus has very little history**. A `rate(...[6h])` over a cluster that's 30 minutes old can only use 30 minutes of data. The 30m, 1h and 6h windows then all describe the same short period, so the 6x condition (30m **and** 6h above 3%) is met almost immediately.

Compare them yourself:

```promql
slo:sli_error:ratio_rate30m{sloth_slo="requests-availability"}
slo:sli_error:ratio_rate6h{sloth_slo="requests-availability"}
```

On a new cluster the two are almost the same number. This happens in real life too: a **new service**, or a Prometheus that just lost its data, has "long" windows that react like short ones. Expect SLO alerts to be jumpy for the first few hours.

## Part 5: Recover and watch the alert

Fix the "bug":

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=0
```

**Task:** predict how long until (a) the 5-minute burn rate is back to 0 and (b) the page alert stops firing.

??? success "What happens"
    | Time after the fix | Burn rate (5m) | 30m error ratio | Alerts firing |
    |---|---|---|---|
    | 0 | 60 | 24% | page, ticket |
    | 3 minutes | 31 | 20% | page, ticket |
    | **6 minutes** | **0** | 16% | page, ticket |
    | 15 minutes | 0 | 11% | page, ticket |
    | **28 minutes** | 0 | 2.5% | **ticket only**: the page has cleared |

    - The **5-minute burn rate** drops to 0 within about 6 minutes. Errors have stopped.
    - The **page keeps firing for almost half an hour** after the fix. The 6x condition needs both the 30m **and** the 6h ratio above 3%, and the 30m window still contains the bad minutes. The page clears only when they leave it.
    - The **ticket** keeps firing much longer. The 1x condition (6h and 3d above 0.5%) remembers the incident for hours. That's on purpose: someone should look at what burned the budget, but in working hours.

    This is why on-call checks the **short-window burn rate**, not the alert state, to confirm a fix worked.

!!! question "Would this incident have paged in production?"
    Work it out: 30% errors for about 8 minutes, with a 99.5% SLO over 30 days.

    ??? success "Answer"
        **No.** With 6 hours of normal history, the 1-hour ratio after 8 bad minutes is 30% × 8 / 60 = **4%**, below the 7.2% page threshold. The 6-hour ratio is 30% × 8 / 360 = **0.7%**, below 3%.

        The whole incident used 0.30 × 8 minutes ÷ (0.005 × 43,200 minutes) ≈ **1%** of the monthly budget. That deserves a ticket, not a 3 a.m. page. If the errors had lasted about 15 minutes, the 1-hour condition would have paged.

        Burn-rate alerts page when the **budget** is in danger, not whenever something is broken. The lab paged only because of the short history you saw in Part 4.

## Part 6: A latency problem that doesn't page

**Task:** 5% of requests become slow (2 seconds). The latency SLO is 99% under 0.5 s. Predict the burn rate and which alert, if any, fires.

??? success "Prediction"
    Burn rate = 0.05 / 0.01 = **5**. That's below both page thresholds (14.4 and 6), so **no page**. It's above 3, so the **ticket** alert should fire: the problem matters, but it can wait for working hours.

```bash
kubectl -n shop set env deploy/loadgen SLOW_PCT=5
```

Watch:

```promql
slo:current_burn_rate:ratio{sloth_slo="requests-latency"}
ALERTS{alertname="CheckoutLatencyBudgetBurn"}
```

| Time | Latency burn rate (5m) | Alerts |
|---|---|---|
| 1 minute | 0.6 | none |
| 5 minutes | 4.4 | **latency ticket** |
| 6 minutes onwards | **5.0**, steady | latency ticket, no page |

The burn rate settles at exactly the predicted 5. The ticket fires after about 5 minutes. On a cluster with full history it would take much longer. Each ticket condition needs **both** of its windows above the threshold. At 5% slow, the 6h window passes 0.5% after about 36 minutes, but the 3d window needs about **7 hours**. The 2h + 1d condition takes even longer. That's the short-history effect from Part 4 again. In production, a slow leak like this one is found the same working day, not within minutes.

This is the error budget at work. A small, steady problem gets a ticket, not a 3 a.m. page. A threshold alert such as "p99 > 500 ms" would have paged as soon as the slow requests started.

Put it back:

```bash
kubectl -n shop set env deploy/loadgen SLOW_PCT=0
```

## Part 7: Don't trust a new budget

Query the 30-day budget remaining:

```promql
slo:period_error_budget_remaining:ratio
```

```text
{sloth_slo="requests-availability"}  -25.9     # -2,590%
{sloth_slo="requests-latency"}       -1.46     # -146%, and it was +67% half an hour ago
```

Your numbers will be different, but expect large negative values. The budget is "overspent" by thousands of percent after a few minutes of errors.

**Task:** your manager sees this on a dashboard and asks if checkout is broken. What do you say?

??? success "Answer"
    "No. The SLO is less than a day old. Prometheus calculates the '30-day' number from the data it has, which is mostly a test where we broke checkout on purpose. The number becomes meaningful once we have 30 days of data. Until then, use the burn-rate alerts, which work on short windows."

## Part 8: Write the error budget policy

**Task:** write a one-page error budget policy for checkout, using the SLOs from this lab. Include:

- What happens when budget remaining is above 25%, below 25%, and exhausted.
- Which outages don't count against the budget.
- Who can approve an exception, and how often the policy is reviewed.

Compare yours with the [example in the lesson](index.md#the-error-budget-policy). The exact numbers matter less than this: product and engineering agree on it **before** the next incident.

## Check your work

- [ ] You can explain why probes and `/metrics` are excluded from the SLIs.
- [ ] You wrote availability and latency SLIs in PromQL without looking.
- [ ] You predicted the burn rate before each failure, and the result matched.
- [ ] You saw a page alert fire and stay firing after recovery, and can explain why.
- [ ] You saw a latency problem that raised a ticket but no page.
- [ ] You have a written error budget policy for checkout.

## Reset

Leave the SLO rules in place: Module 3 builds on them. Make sure the users are healthy again:

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=0 SLOW_PCT=0
```

**Next:** [Test yourself](test-yourself.md).
