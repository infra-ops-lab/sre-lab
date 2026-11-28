# Runbook: checkout SLO alerts

This is the runbook that the checkout SLO alerts link to (`runbook_url`). It's also the example for [Module 3](index.md): a runbook is short, starts with what to do in the first five minutes, and is written for a tired person who has never seen this service.

| | |
|---|---|
| **Alerts** | `CheckoutAvailabilityBudgetBurn`, `CheckoutLatencyBudgetBurn` |
| **Service** | checkout (namespace `shop`, Helm release `checkout`) |
| **Owner** | shop-team |
| **Dashboard** | Grafana → **Checkout service** (`/d/checkout`) |
| **SLOs** | 99.5% of requests succeed; 99% faster than 0.5 s; rolling 30 days |

## What the alert means

Checkout is spending its error budget faster than it can afford.

- **`severity=page`**: at the current rate, a large part of the month's budget is gone within hours (burn rate above 14.4 over 1 hour, or above 6 over 6 hours). Users are affected **now**. Act immediately.
- **`severity=ticket`**: a slower leak (burn rate above 3 over a day, or 1 over 3 days). Look at it during working hours.

The alert doesn't say **why**. That's what the steps below are for.

## First 5 minutes

1. **Acknowledge** the page, so nobody else is woken up for the same thing.
2. **Check it's real and still happening.** Open the dashboard. Is the **5-minute burn rate** above 1 right now?
    ```promql
    slo:current_burn_rate:ratio{sloth_service="checkout"}
    ```
    If it's already 0, the problem has stopped. The page can keep firing for up to 30 minutes after recovery (see Module 1). Go to [After it's over](#after-its-over).
3. **Say you're on it** in the incident channel: "Looking at the checkout SLO page. Error ratio X%, started around HH:MM."
4. **Was there a change?** The most common cause of a sudden burn is a deploy or a config change.
    ```bash
    helm -n shop history checkout | tail -3
    kubectl -n shop rollout history deploy/checkout-podinfo
    ```
    If something changed in the last hour and the timing matches: **roll back first, investigate later.**
    ```bash
    helm -n shop rollback checkout --wait
    ```

## Find where it hurts

Use the **RED** row of the dashboard, then split:

```promql
# Which status codes?
sum by (status) (rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[5m]))

# Which endpoint is failing?
sum by (path) (rate(http_request_duration_seconds_count{namespace="shop", status=~"5.."}[5m]))

# Which pod is failing?
sum by (pod) (rate(http_request_duration_seconds_count{namespace="shop", status=~"5.."}[5m]))

# Slow rather than failing? p99 per pod
histogram_quantile(0.99, sum by (le, pod) (rate(http_request_duration_seconds_bucket{namespace="shop", path!~"healthz|readyz|metrics"}[5m])))
```

Then the **USE** row:

| Symptom | Check | Likely fix |
|---|---|---|
| All pods slow, nodes idle | CPU throttling panel | Raise or remove the CPU limit (Module 2) |
| Pods restarting | `kubectl -n shop get pods`, `kubectl -n shop describe pod <pod>` (look for `OOMKilled`) | Raise the memory limit; roll back a release that leaks |
| One pod bad, others fine | Errors by pod | Delete that pod: `kubectl -n shop delete pod <pod>` |
| Pods not Ready | `kubectl -n shop get endpoints checkout-podinfo` | Fix the readiness failure; check the last change |

## Mitigate

Stop the bleeding before you understand the root cause:

| Mitigation | Command | When |
|---|---|---|
| Roll back | `helm -n shop rollback checkout --wait` | A release or config change matches the start time |
| Restart one pod | `kubectl -n shop delete pod <pod>` | Only one pod is bad |
| Add capacity | `kubectl -n shop scale deploy/checkout-podinfo --replicas=6` | Every pod is saturated and traffic went up |

**Confirm the fix with the 5-minute burn rate**, not with the alert: it should drop to about 0 within 5 minutes.

## Escalate

Escalate to the shop-team lead if:

- you haven't found a mitigation within **30 minutes**, or
- the error ratio is above **50%** (most users can't check out), or
- the cause is outside checkout (a dependency, the cluster, the network): page the owning team.

## After it's over

- Post a short summary in the incident channel: start, end, impact (error ratio × duration), what fixed it.
- Check how much budget was used: `slo:period_error_budget_remaining:ratio{sloth_service="checkout"}`.
- If it was a page, or used more than 5% of the monthly budget: open a **postmortem** (Module 4).
- If this runbook was wrong or missing a step, **fix it now**, while you remember.
