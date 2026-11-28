# Lab: Game day: a bad release

In this lab you run a **game day**. Checkout's team ships "release 2". You respond as on-call and incident commander, mitigate, then build the timeline from data and write a blameless postmortem.

| | |
|---|---|
| **Time** | About 90 minutes |
| **You need** | The [lab environment](../setup.md) with Module 1's SLO rules, Module 2's checkout dashboard, and Module 3's Alertmanager configuration and receivers |
| **Files** | `labs/04-incidents/`, the [postmortem template](postmortem-template.md), the [checkout runbook](../03-alerting/runbook-checkout.md) |

**Best with 2-4 people**: one runs the release and watches, the others respond without knowing what's in it. Alone, it still works: don't read `labs/04-incidents/release-2-values.yaml` until Part 5.

## Part 1: Plan the game day

**Task:** before breaking anything, write down (in a file or on paper):

1. **Roles**: who is incident commander (IC), operations, communications and scribe. Alone, you hold all four, but switch hats explicitly.
2. **Success criteria**: what should happen if alerting and response work well.
3. **Stop condition**: when you end the exercise even if the responders haven't fixed it, and how.

??? success "Example plan"
    ```text
    Game day: checkout release 2, 2026-11-28
    Roles: IC = me, Ops = me, Comms = me, Scribe = me (timeline in gameday.md)
    Success criteria:
      - We're notified (page or ticket) within 15 minutes of user impact.
      - Mitigated within 10 minutes of being notified.
      - First status update within 10 minutes of being notified.
    Stop condition: 45 minutes after the release, or more than 50% of requests failing:
      roll back with `helm -n shop rollback checkout --wait`.
    ```

    The success criteria are what make it an exercise rather than a demonstration: afterwards you can say what worked and what didn't.

Open the tools you'll need, each in its own terminal or tab:

- Grafana → **Checkout service** dashboard (<http://localhost:3000/d/checkout>), time range **Last 1 hour**.
- Prometheus (<http://localhost:9090>).
- A terminal for notifications: `watch -n 15 ./labs/03-alerting/show-notifications.sh 30m` (or run it by hand every few minutes).
- A file for the scribe: `gameday.md`. Write the time and what happened at every step from now on.

Make sure checkout is healthy before you start: the dashboard shows no errors, and `helm -n shop history checkout --max 1` shows the release you expect.

## Part 2: The release

The CD pipeline deploys release 2. Run it, and note the time:

```bash
./labs/04-incidents/release.sh
```

```text
21:32:12  deploying checkout release 2 ...
21:32:19  checkout release 2 deployed: Upgrade complete
```

Now **don't do anything** until you're notified: as in real life, the people who deploy aren't watching all the time. Watch the notifications.

- If **nothing** arrives within **20 minutes**, a customer support ticket comes in: *"Lots of customers say checkout fails with an error, since about half an hour ago."* Start the response at that point anyway.

??? success "What you see"
    When you're notified depends on how much history your Prometheus has (the same effect as in Module 1, Part 4):

    | Prometheus history | What happens |
    |---|---|
    | Under an hour (a new lab cluster) | **Page** within a few minutes: the short history makes the long windows react fast |
    | Several hours or more | **Nothing for about 45 minutes.** The page needs the 1-hour error ratio above 7.2%, and the SLO sees only 9% of requests failing, so it fires after about 7.2 / 9 × 60 ≈ **47 minutes**. The ticket alerts need their 1-day and 3-day windows to fill too, which takes hours. |

    The second row is the realistic one, and it's a problem: a third of checkouts are failing, and nobody is told for 45 minutes. That's why the customer report arrives first. Keep it in mind for the postmortem.

## Part 3: Respond

From the first notification (or the customer report), run the incident.

**Task 1 (IC):** declare the incident. Decide the severity using the [lesson's table](index.md#what-counts-as-an-incident), and write the first entry in `gameday.md`.

**Task 2 (Ops):** follow the [checkout runbook](../03-alerting/runbook-checkout.md): first 5 minutes, then "find where it hurts". What's failing, and what changed?

**Task 3 (Comms):** write the first external status update.

**Task 4 (IC):** decide on a mitigation, apply it, and confirm it worked.

??? success "Solution"
    **Severity:** with the dashboard showing about a third of checkouts failing, this is at least a **SEV2** (a core journey degraded for many users). Many teams would call it SEV1. Pick the higher one when unsure.

    **What the runbook shows:**

    ```promql
    sum by (status) (rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[5m]))
    ```

    ```text
    {status="200"}  ~68%
    {status="400"}  ~12%
    {status="409"}  ~10%
    {status="500"}   ~9%
    ```

    - Errors on `path="root"`, the main user path, on **every pod**.
    - The **first 5 minutes** step "was there a change?" finds it:

    ```bash
    helm -n shop history checkout | tail -3
    ```

    ```text
    6   Sat Nov 28 21:32:12 2026  deployed  podinfo-6.17.0  6.17.0  Upgrade complete
    ```

    A release a few minutes before the errors began. The runbook says: **roll back first, investigate later.**

    **Status update:**

    ```text
    [Investigating] 21:40 UTC
    Some customers are seeing errors when checking out. We're investigating.
    Orders already placed are not affected. Next update by 22:00 UTC.
    ```

    **Mitigation:**

    ```bash
    helm -n shop rollback checkout --wait
    ```

    The rollback takes about 15 seconds. Confirm with the error ratio over 1 minute (it should be **0** within a minute) and the 5-minute burn rate (0 within about 5 minutes):

    ```promql
    (sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status!="200"}[1m])) or vector(0))
    / sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[1m]))
    ```

    Then the **mitigated** update, and later the **resolved** one, with the start and end times of user impact.

## Part 4: Build the timeline from data

Memory is unreliable. **Task:** using only data, find the exact times of:

1. The release, and the rollback.
2. The start and end of user impact.
3. Each alert notification, and its resolution (the page can resolve up to 40 minutes after the rollback; come back later for it).

??? success "Where to find each one"
    **Deploys:** `helm history` keeps every release with its time:

    ```bash
    helm -n shop history checkout --max 3
    ```

    ```text
    REVISION  UPDATED                   STATUS      DESCRIPTION
    6         Sat Nov 28 21:32:12 2026  superseded  Upgrade complete
    7         Sat Nov 28 21:35:55 2026  deployed    Rollback to 5
    ```

    **User impact:** graph the failure ratio in Prometheus (**Graph** tab, range 1h) and hover over where it starts and ends:

    ```promql
    (sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status!="200"}[1m])) or vector(0))
    / sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[1m]))
    ```

    It rises within a minute of the release and falls to 0 within a minute of the rollback. A `[1m]` window smooths the edges by up to a minute, which is good enough for a timeline.

    **Alerts:** `./labs/03-alerting/show-notifications.sh 2h` for notifications, and the `ALERTS{sloth_service="checkout"}` graph in Prometheus for when each alert was pending and firing.

    **Kubernetes:** `kubectl -n shop get events --sort-by=.lastTimestamp` shows the pods being replaced at each release. Events are kept for only about an hour, so collect them early.

    In a real incident, add the **chat log** of the incident channel: it records what people believed and decided, which no metric shows.

## Part 5: Measure the impact

Now you can read `labs/04-incidents/release-2-values.yaml`. The release turned on podinfo's random-error fault, which returns **500, 400 and 409** responses.

**Task:** how much of the 30-day availability error budget did the incident use, according to the SLO? And how many requests really failed? Run this within an hour of the rollback (set the `[30m]` window to cover the whole incident):

```promql
# 5xx failures (what the SLO counts)
sum(increase(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status=~"5.."}[30m]))

# all failures (what users experienced)
sum(increase(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status!="200"}[30m]))

# share of the 30-day budget used: 5xx failures / (0.5% of 30 days of traffic at today's rate)
sum(increase(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics", status=~"5.."}[30m]))
/ (0.005 * sum(rate(http_request_duration_seconds_count{namespace="shop", path!~"healthz|readyz|metrics"}[30m])) * 30 * 86400)
```

??? success "Solution"
    In a test run with a 4-minute incident at about 18 requests per second:

    | | Requests |
    |---|---|
    | Failed with 5xx (counted by the SLO) | about 390 |
    | Failed with any error (what users saw) | about 1,180 |
    | Budget used, by the SLO's count | about **0.17%** of the 30-day budget |
    | Budget used, if every failure counted | about **0.52%** |

    Your numbers depend on how long your incident lasted. The important part is the ratio: **the SLO saw about 30% of the real impact.** Two out of three failed checkouts were 400 or 409 responses, which the availability SLI ignores because it assumes 4xx are the client's fault. Here they were caused by our own release.

    That's also why detection was slow on a cluster with history: the SLO saw a 9% failure rate (burn rate about 18x) instead of 31% (about 63x). At 63x, the 1-hour ratio passes 7.2% after about 7.2 / 31 × 60 ≈ **14 minutes**, so the page would have fired in a third of the time.

## Part 6: Write the postmortem

**Task:** copy the [postmortem template](postmortem-template.md) into `postmortem.md` and fill it in for this game day. Keep it blameless. Include at least three action items, each one specific enough to have an owner and a due date.

??? success "Example postmortem"
    ```markdown
    # Postmortem: Checkout errors after release 2

    | | |
    |---|---|
    | **Date** | 2026-11-28 |
    | **Status** | Final |
    | **Severity** | SEV2 |
    | **Incident commander** | on-call (game day) |

    ## Summary
    Between 21:32 and 21:36, about 31% of checkout requests failed after release 2 enabled a change
    that returned random 500, 400 and 409 responses. Rolling back to the previous release fixed it.

    ## Impact
    - Users: about 1 in 3 checkout attempts failed for 4 minutes (about 1,180 failed requests).
    - SLO: 0.17% of the 30-day availability budget by the SLI; about 0.5% if 4xx are counted.
    - Business: estimated 1,180 failed checkout attempts; customers could retry.

    ## Detection
    - On this long-running cluster, no alert would have fired for ~47 minutes (the page), and the ticket
      alerts later still. We started responding on a customer report at 20 minutes (game day script).
    - The availability SLI counted only the 500s (9% of requests), so the burn rate was ~18x instead of ~63x.
      Counting all failures, the page would have fired after ~14 minutes.

    ## Timeline (local time)
    | Time | Event |
    |---|---|
    | 21:32:12 | Release 2 deployed by the CD pipeline (`helm history` revision 6) |
    | 21:32:30 | Failure ratio rises to ~31% (Prometheus) |
    | 21:35:30 | IC declared SEV2 (game day: response started early); runbook "was there a change?" points at revision 6 |
    | 21:35:55 | Rollback to the previous release (revision 7) |
    | 21:36:30 | Failure ratio back to 0 |

    ## Contributing factors
    - Release 2 contained a change that returned errors for about a third of requests.
    - No pre-production check or canary measured the error ratio before full rollout.
    - The availability SLI excludes 4xx, so two thirds of the failures were invisible to alerting.
    - The release description ("minor validation changes") gave no hint of risk.

    ## What went well
    - The runbook's "was there a change?" step found the cause immediately.
    - Rollback took one command and 15 seconds.

    ## What went badly
    - Detection: no alert for ~47 minutes on a cluster with normal history; a customer told us first.
    - The SLO under-reported the impact by about 3x.

    ## Where we got lucky
    - The faulty change was in the service itself, so a rollback fixed it. A bad database migration would not roll back.

    ## Action items
    | Action | Type | Owner | Due |
    |---|---|---|---|
    | Add a canary stage that pauses the rollout if the non-200 ratio rises above 2% (Module 7) | Prevent | shop-team | +2 weeks |
    | Count 400/409 responses caused by checkout's own validation in the availability SLI | Detect | shop-team | +1 week |
    | Add a ticket alert on a sudden rise in the 4xx ratio within 30 minutes of a release | Detect | shop-team | +1 week |
    | Add deploy annotations to the checkout dashboard | Diagnose | platform | +2 weeks |

    ## Lessons learned
    An SLI is a hypothesis about what users experience. "4xx is the client's fault" was wrong here.
    ```

## Part 7: Review the game day

**Task:** compare what happened with the success criteria from Part 1. What would you change before the next game day, in the system and in the exercise?

??? success "Example review"
    | Criterion | Result |
    |---|---|
    | Notified within 15 minutes | **Missed** on a cluster with history (page after ~47 min; a customer report came first). Met on a new cluster, but only because of the short history. |
    | Mitigated within 10 minutes of being notified | Met: rollback ~1 minute after finding the release |
    | First status update within 10 minutes | Met (if you wrote it) |

    Findings for the system: the SLI gap and the missing canary (the action items above). Findings for the exercise: the runbook worked; next time, try a fault that a rollback **can't** fix, such as a CPU limit set outside the Helm release (Module 2), or a slow dependency.

## Check your work

- [ ] You wrote a game day plan with roles, success criteria and a stop condition before starting.
- [ ] You declared the incident, chose a severity, and wrote a status update.
- [ ] You mitigated with a rollback before investigating the root cause.
- [ ] You built the timeline from `helm history`, Prometheus and the notification log, not from memory.
- [ ] You measured the error budget used, and found that the SLI missed two thirds of the failures.
- [ ] You wrote a blameless postmortem with specific action items, and reviewed the game day against its success criteria.

## Reset

Make sure release 2 is no longer deployed and checkout is healthy:

```bash
helm -n shop get values checkout | grep -c "error: true"     # should print 0
kubectl -n shop set env deploy/loadgen ERROR_PCT=0 SLOW_PCT=0
```

If the first command prints `1`, run `helm -n shop rollback checkout --wait`.

**Next:** [Test yourself](test-yourself.md).
