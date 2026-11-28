# Lab: Alerting for the checkout service

In this lab you connect Alertmanager to a pager and a ticket queue, clean up the noise that a default install produces, then follow a real SLO page from a planned-maintenance silence, through the runbook, to resolution.

| | |
|---|---|
| **Time** | About 75 minutes, plus a check 30 minutes later |
| **You need** | The [lab environment](../setup.md) running, Module 1's SLO rules applied, and Prometheus on <http://localhost:9090> and Alertmanager on <http://localhost:9093> |
| **Files** | `labs/03-alerting/` |

Each part starts with a **task**. Try it yourself first, then open the solution.

The lab uses Alertmanager's command-line tool, `amtool`, which is already inside the Alertmanager pod. Define a shortcut for this terminal:

```bash
amtool() { kubectl -n monitoring exec alertmanager-monitoring-kube-prometheus-alertmanager-0 -c alertmanager -- amtool --alertmanager.url=http://localhost:9093 "$@"; }
```

## Part 1: Connect a pager and a ticket queue

Real teams send alerts to PagerDuty, Opsgenie, Jira or Slack. The lab uses two small web servers instead, **pager** and **tickets**, which print every notification they receive.

```bash
kubectl apply -f labs/03-alerting/webhook-receivers.yaml
helm upgrade monitoring prometheus-community/kube-prometheus-stack --version 94.0.0 -n monitoring \
  -f labs/setup/monitoring-values.yaml -f labs/03-alerting/alertmanager-values.yaml --wait
```

Open `labs/03-alerting/alertmanager-values.yaml` and read the `route` section. Then print the routing tree as Alertmanager sees it. The Prometheus operator takes up to a minute to load the new configuration; if the tree has no `pager` route yet, wait and run it again.

```bash
amtool config routes --config.file=/etc/alertmanager/config_out/alertmanager.env.yaml
```

amtool prints `Warning: --config.file flag overrides the --alertmanager.url.` for these commands; you can ignore it.

```text
Routing tree:
.
└── default-route  receiver: tickets
    ├── {alertname="Watchdog"}  receiver: null
    ├── {severity="page"}  receiver: pager
    └── {severity=~"ticket|warning"}  receiver: tickets
```

**Task:** predict where each of these alerts goes: `pager`, `tickets` or `null` (nowhere). Then check your answers with `amtool config routes test`.

| Alert | Labels |
|---|---|
| A | `alertname=CheckoutAvailabilityBudgetBurn severity=page` |
| B | `alertname=CheckoutAvailabilityBudgetBurn severity=ticket` |
| C | `alertname=CPUThrottlingHigh severity=info` |
| D | `alertname=InfoInhibitor severity=none` |
| E | `alertname=KubeAPIDown severity=critical` |

```bash
amtool config routes test --config.file=/etc/alertmanager/config_out/alertmanager.env.yaml alertname=CPUThrottlingHigh severity=info
```

??? success "Solution"
    | Alert | Receiver | Right? |
    |---|---|---|
    | A: SLO page | `pager` | Yes |
    | B: SLO ticket | `tickets` | Yes |
    | C: `info` | **`tickets`** | **No.** `info` matches no route, so it falls through to the default receiver. Every `CPUThrottlingHigh` becomes a ticket. |
    | D: `none` | **`tickets`** | **No.** `InfoInhibitor` is a helper alert that exists only to inhibit `info` alerts. Nobody should ever see it. |
    | E: `critical` | **`tickets`** | **Maybe not.** The API server being down is a real emergency for a platform team, and it doesn't page. |

    The routing tree looks reasonable, but the **default route** catches everything nobody thought about. Always test it with the labels your alerts really have.

## Part 2: Triage the noise

**Task:** wait a few minutes, then look at what Alertmanager has already sent, and how often:

```bash
./labs/03-alerting/show-notifications.sh 1h
./labs/03-alerting/show-notifications.sh 1h count
```

For each alert in the list, decide: **page**, **ticket**, **nothing**, or **delete the rule**. Then look at the list of kube-prometheus-stack's `critical` alerts and decide which ones should page a platform team:

```bash
kubectl get prometheusrule -n monitoring -o json | python3 -c '
import json, sys
for item in json.load(sys.stdin)["items"]:
    for group in item["spec"]["groups"]:
        for rule in group["rules"]:
            if rule.get("labels", {}).get("severity") == "critical":
                print(rule["alert"])' | sort -u
```

??? success "What you see"
    ```text
    18:44:47  tickets  firing    NodeClockNotSynchronising        severity=warning https://runbooks.prometheus-operator.dev/runbooks/node/nodeclocknotsynchronising
    18:44:47  tickets  firing    NodeClockNotSynchronising        severity=warning https://runbooks.prometheus-operator.dev/runbooks/node/nodeclocknotsynchronising
    18:44:47  tickets  firing    NodeClockNotSynchronising        severity=warning https://runbooks.prometheus-operator.dev/runbooks/node/nodeclocknotsynchronising
    18:45:15  tickets  firing    InfoInhibitor                    severity=none    https://runbooks.prometheus-operator.dev/runbooks/general/infoinhibitor
    ```

    Nothing is wrong with checkout, and the ticket queue already has a ticket for every node (and sometimes one for `InfoInhibitor`). (On a cluster that has only just started, wait 5-10 minutes for them.)

    | Alert | Decision | Why |
    |---|---|---|
    | `NodeClockNotSynchronising` | **Delete the rule** (here) | kind nodes are containers sharing the Docker VM's clock; there's no NTP to fix. In a real cluster, keep it as a ticket: clock drift breaks TLS and etcd. |
    | `InfoInhibitor` | **Nothing** | A helper alert, not for humans |
    | `CPUThrottlingHigh` and other `info` alerts | **Nothing** | Context for investigations (Module 2), not a notification. The SLO tells you if users are affected. |
    | `Watchdog` | Nothing **here** | In production, send it to a dead man's switch service (see the [lesson](index.md#watching-the-watcher)) |

    Of the 31 `critical` alerts, a reasonable choice for a platform team is to **page** on:

    - `KubeAPIErrorBudgetBurn`: the API server's own SLO burn-rate alert. Developers can't deploy.
    - `KubeAPIDown`: the API server is unreachable.
    - `NodeFilesystemSpaceFillingUp` (`critical` version): a disk is predicted to fill within 4 hours.

    The rest (certificate expiry warnings, Alertmanager and Prometheus configuration problems, kube-state-metrics errors) go to **tickets**: they need fixing, but not at 3 a.m. Alerts about Alertmanager itself can't be delivered reliably by Alertmanager anyway; that's the dead man's switch's job.

**Task:** change `labs/03-alerting/alertmanager-values.yaml` so that:

1. `info` and `none` alerts go nowhere.
2. The three `critical` alerts above page; other `critical` alerts become tickets.
3. The `NodeClockNotSynchronising` rule is disabled. Hint: kube-prometheus-stack has a `defaultRules.disabled` setting that takes a map of alert names.

Apply it with the same `helm upgrade` as in Part 1, and test the routes again.

??? success "Solution"
    Routes are checked **in order**, and the first match wins. Put the most specific routes first:

    ```yaml
    alertmanager:
      config:
        route:
          receiver: tickets
          group_by: [alertname, sloth_service]
          group_wait: 30s
          group_interval: 5m
          repeat_interval: 4h
          routes:
            - receiver: "null"
              matchers: [alertname = "Watchdog"]
            - receiver: "null"              # info alerts and the InfoInhibitor are context, not notifications
              matchers: [severity =~ "info|none"]
            - receiver: pager               # the few built-in critical alerts that are worth waking up for
              matchers:
                - severity = "critical"
                - alertname =~ "KubeAPIErrorBudgetBurn|KubeAPIDown|NodeFilesystemSpaceFillingUp"
            - receiver: pager
              matchers: [severity = "page"]
            - receiver: tickets
              matchers: [severity =~ "ticket|warning|critical"]
        # inhibit_rules and receivers: unchanged
    defaultRules:
      disabled:
        NodeClockNotSynchronising: true   # can't be fixed on kind
    ```

    `matchers` in one route are combined with **AND**: the third route needs `severity="critical"` **and** one of the three names.

    ```bash
    helm upgrade monitoring prometheus-community/kube-prometheus-stack --version 94.0.0 -n monitoring \
      -f labs/setup/monitoring-values.yaml -f labs/03-alerting/alertmanager-values.yaml --wait
    ```

    After a minute:

    ```text
    alertname=CPUThrottlingHigh severity=info          -> null
    alertname=InfoInhibitor severity=none              -> null
    alertname=KubeAPIDown severity=critical            -> pager
    alertname=KubeletDown severity=critical            -> tickets
    alertname=CheckoutAvailabilityBudgetBurn severity=page   -> pager
    ```

    Disabling the rule also makes its alerts **resolve**, so the ticket queue gets one "resolved" notification for each `NodeClockNotSynchronising` alert. In a real ticketing integration, that closes the tickets.

    And the rule is gone (`0` means no rule by that name):

    ```bash
    kubectl get prometheusrule -n monitoring -o yaml | grep -c "alert: NodeClockNotSynchronising"
    ```

    In a real team, this file lives in Git and the change goes through review. Routing mistakes are silent: nothing tells you that a page went to the ticket queue until the incident review.

## Part 3: Planned maintenance

The checkout team is about to run a database migration that may cause errors for a few minutes. They don't want to page anyone for it.

**Task:** create a **silence** for all checkout alerts for 1 hour, with a comment that says why. Then list the silences.

??? success "Solution"
    ```bash
    amtool silence add sloth_service=checkout --duration=1h --author="$USER" \
      --comment="Planned maintenance: checkout DB migration, CHG-1234"
    amtool silence query
    ```

    A silence matches **labels**, like a route. Good silences are as narrow as possible (one service, not `severity=page`), have an **end time**, and have a **comment** that links to the change.

Now the migration goes badly. Make 30% of requests fail:

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=30
```

**Task:** watch the page alert in Prometheus. Once it's **firing**, check what Alertmanager did with it, and what reached the pager.

```promql
ALERTS{sloth_service="checkout"}
```

```bash
amtool alert query --silenced sloth_service=checkout
./labs/03-alerting/show-notifications.sh 10m
```

??? success "What you see"
    How long the page alert takes to fire depends on how much history your Prometheus has (Module 1, Part 4):

    | Prometheus history | Page alert firing after |
    |---|---|
    | Under an hour (a new lab cluster) | about 2 minutes |
    | Many hours (a cluster you've used for days) | about 13 minutes, close to the 14 minutes you'd see in production |

    The **ticket** alert usually fires first, within a few minutes. Both show as **suppressed** in Alertmanager:

    ```text
    Alertname                       Starts At                Summary                                                     State
    CheckoutAvailabilityBudgetBurn  2026-11-28 15:12:56 UTC  Checkout is burning its availability error budget too fast  suppressed
    ```

    `amtool alert query --silenced` lists `CheckoutAvailabilityBudgetBurn` as **silenced**, and `show-notifications.sh` shows **nothing** for checkout. The alert is real and firing; the silence stops the notification, as intended.

    That's also the risk: if the migration takes the whole site down, nobody is told. Keep maintenance silences short and narrow, and have someone watching the dashboard while they're active.

## Part 4: The page

The migration is "finished", but errors continue. End the maintenance early by expiring the silence:

```bash
amtool silence expire $(amtool silence query -q)
```

**Task:** how long until the pager receives the page? Will the ticket queue also get a ticket for the same problem?

??? success "What you see"
    ```text
    20:48:41  pager    firing    CheckoutAvailabilityBudgetBurn   severity=page    https://infra-ops-lab.github.io/sre-lab/03-alerting/runbook-checkout/
    ```

    - The **page** arrives up to **5 minutes** after you expire the silence (4.5 minutes in the test run), not immediately. Alertmanager created the alert group while it was silenced, and it only flushes an existing group every `group_interval` (5 minutes in this configuration). A brand-new problem notifies after `group_wait` (30 seconds) instead.
    - The ticket alert is firing too (check `ALERTS` in Prometheus), but **no ticket** is sent. The inhibit rule mutes `severity=ticket` while a `severity=page` alert with the same `alertname` and `sloth_service` fires:

    ```bash
    amtool alert query --inhibited sloth_service=checkout
    ```

    One problem, one notification, to the right place.

## Part 5: Follow the runbook

**Task:** the notification includes a `runbook_url`. Open it: it's the [checkout runbook](runbook-checkout.md). Work through **First 5 minutes** and **Find where it hurts**, using the commands and queries in it. What's failing, and what would you do?

??? success "Solution"
    1. **Is it still happening?** The 5-minute burn rate for availability is far above 1 (about 60).
    2. **Recent change?** `helm -n shop history checkout` shows nothing new for the checkout release. No rollback.
    3. **Which status codes?** About 30% of user requests return **500**.
    4. **Which endpoint?** All the 5xx are on `path="status"`, which no real user should call; `root` is fine.
    5. **Which pod?** All three pods return errors at the same rate, so it isn't one bad pod.

    In this lab the cause is a client sending bad requests (the loadgen). In real life this pattern (one endpoint, every pod, no release) points to a **caller** or a **dependency** behind that endpoint, and the runbook says to escalate to the owning team.

    Fix it:

    ```bash
    kubectl -n shop set env deploy/loadgen ERROR_PCT=0
    ```

    Confirm with the **5-minute burn rate**, as the runbook says, not with the alert:

    ```promql
    slo:current_burn_rate:ratio{sloth_slo="requests-availability"}
    ```

    It drops to 0 within 5-6 minutes.

## Part 6: Resolved

**Task:** the configuration has `send_resolved: true`. Predict when the pager receives a **resolved** notification for the page. Then check back in 30 minutes.

```bash
./labs/03-alerting/show-notifications.sh 1h
```

??? success "What you see"
    ```text
    20:48:41  pager    firing    CheckoutAvailabilityBudgetBurn   severity=page    ...
    21:29:19  pager    resolved  CheckoutAvailabilityBudgetBurn   severity=page    ...
    21:30:11  tickets  firing    CheckoutAvailabilityBudgetBurn   severity=ticket  ...
    ```

    In the test run the errors stopped at 20:50, and the **resolved** notification came **39 minutes later**. On a new cluster with little history it's closer to 30 minutes.

    The resolved notification comes only when the alert stops firing, which takes much longer than the fix itself, because the long windows of the burn-rate alert still contain the bad minutes (Module 1, Part 5). Meanwhile the **ticket** stops being inhibited once the page clears, and the ticket queue receives it: someone should look at the incident during working hours.

    This is why on-call confirms a fix with the **short-window burn rate**, and why paging tools let you **resolve** an incident manually without waiting for the alert.

## Part 7: Review an alert pull request

A teammate opens a pull request with these new alerts for checkout. You're the reviewer.

```yaml
- alert: CheckoutHighCPU
  expr: sum(rate(container_cpu_usage_seconds_total{namespace="shop", container="podinfo"}[1m])) > 0.05
  labels: { severity: page }
- alert: CheckoutPodRestarted
  expr: increase(kube_pod_container_status_restarts_total{namespace="shop"}[5m]) > 0
  labels: { severity: page }
- alert: CheckoutAnyError
  expr: sum(rate(http_request_duration_seconds_count{namespace="shop", status=~"5.."}[1m])) > 0
  labels: { severity: page }
  annotations: { summary: "Checkout has errors" }
```

**Task:** write your review comments. For each alert: keep, change, or delete, and why. What's missing from all three?

??? success "Solution"
    - **CheckoutHighCPU: delete.** It's a cause, not a symptom, and 0.05 cores for 3 pods is normal load. If CPU makes checkout slow, the latency SLO alert pages. Put CPU and throttling on the dashboard (Module 2).
    - **CheckoutPodRestarted: delete, or make it a ticket for crash loops.** One restart is Kubernetes doing its job. kube-prometheus-stack already has `KubePodCrashLooping` for repeated restarts, as a warning.
    - **CheckoutAnyError: delete.** Any single 5xx pages, at any traffic level. A 99.5% SLO **allows** 1 failure in 200. The SLO burn-rate alerts already cover errors, with the right sensitivity.
    - **Missing from all three:** no `for:` duration (they fire on a single evaluation), no `owner` or `team` label for routing, no `runbook_url`, and a vague or missing `summary`.

    A good review result here is **"close this PR; the SLO alerts already cover it"**. The best alert is often the one you don't add.

## Check your work

- [ ] Your routing tree sends `info` and `none` nowhere, a chosen few `critical` alerts to the pager, and everything else to tickets, and you tested it with `amtool config routes test`.
- [ ] You disabled a rule that can't be fixed in your environment, in code, not with a silence.
- [ ] You saw a maintenance silence suppress a real page, and the page arrive when it expired.
- [ ] You saw inhibition keep the ticket quiet while the page fired.
- [ ] You followed the runbook from the notification to the cause.
- [ ] You can explain why the resolved notification came long after the fix.
- [ ] You can review an alert PR and explain why "delete" is often the right answer.

## Reset

Keep the Alertmanager configuration and the receivers: Module 4 uses them. Make sure checkout is healthy:

```bash
kubectl -n shop set env deploy/loadgen ERROR_PCT=0 SLOW_PCT=0
amtool silence query
```

`amtool silence query` should show no active silences.

**Next:** [Test yourself](test-yourself.md).
