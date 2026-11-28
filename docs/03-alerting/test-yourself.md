# Test yourself: Alerting and on-call

Answer each question in your own words first, then open the answer.

??? question "1. What four tests should every page pass?"
    1. **Urgent**: users are affected now, or will be within hours.
    2. **Actionable**: a human can do something about it right now.
    3. **Needs a human**: it can't be fixed automatically (if it can, automate it).
    4. **Real**: it rarely fires when nothing is wrong.

    Anything that fails one of these becomes a ticket, a dashboard panel, or is deleted.

??? question "2. A colleague wants to page on 'node CPU above 90% for 5 minutes'. What do you say, and what do you propose instead?"
    High CPU is a **cause**, and usually a harmless one: batch jobs, autoscaling, a busy but healthy node. It will page people when users are fine, and it won't catch outages with other causes.

    Propose:

    - **Page** on the service's **SLO burn rate** (symptom). If high CPU makes requests slow or fail, that alert fires.
    - Put node CPU on the **dashboard** and in the **runbook**, as something to check after the SLO alert.
    - If sustained saturation is a capacity concern, make it a **ticket** (for example, CPU above 90% for 6 hours), or better, a capacity review (Module 8).

??? question "3. Explain grouping, inhibition and silences in Alertmanager, with one example of each."
    - **Grouping** combines related alerts into one notification. `group_by: [alertname, service]` turns 50 `KubePodCrashLooping` alerts from one service into a single notification listing all 50 pods.
    - **Inhibition** mutes some alerts while another is firing. While the checkout **page** fires, the checkout **ticket** for the same SLO is muted, so on-call gets one notification, not two. Another example: while "zone A down" fires, mute every per-service alert in zone A.
    - **Silences** mute matching alerts for a set time, created by a person. Example: a 1-hour silence on `service="checkout"` during a planned database migration, with the change ticket number as the comment.

??? question "4. What's the difference between group_wait, group_interval and repeat_interval?"
    - **group_wait** (for example 30 s): how long Alertmanager waits after the **first** alert of a new group before notifying, so that related alerts arriving a few seconds later go in the same notification.
    - **group_interval** (for example 5 min): how long it waits before sending an **update** about a group that already notified, when alerts are added to or removed from it.
    - **repeat_interval** (for example 4 h): how often it **re-sends** a notification for a group that's still firing with no changes, as a reminder.

??? question "5. You inherit kube-prometheus-stack's default rules: about 30 critical, 90 warning and some info alerts. How do you turn them into a sensible on-call setup?"
    1. **Route by severity**: `info` (and `none`) to nowhere; `warning` to a ticket queue or a chat channel; `critical` to a ticket queue by default.
    2. **Choose the few critical alerts that page your team**, for example API server down, the API server's own error-budget burn, and disks predicted to fill within hours. Route those explicitly to the pager.
    3. **Disable rules that can't be fixed** in your environment (on kind: `NodeClockNotSynchronising`; in managed Kubernetes: control-plane alerts you can't act on).
    4. **Add your own SLO alerts** for the services and the platform. These are the main pages.
    5. **Review notifications weekly**: fix, tune or delete the noisiest alerts.

??? question "6. Why does the Watchdog alert always fire, and what should it be routed to?"
    It's a **dead man's switch**. If Prometheus, Alertmanager or the network between them breaks, no alerts are delivered at all, and the silence looks like good news.

    Route Watchdog to an **external heartbeat service** (Dead Man's Snitch, or PagerDuty or Opsgenie heartbeat monitoring) that expects a notification every few minutes and **pages you when they stop**. Routing it to nowhere (as in the lab) or to a normal channel defeats its purpose.

??? question "7. An alert fires and auto-resolves 10 to 20 times a day. Nobody acts on it. What are your options, in order of preference?"
    1. **Delete it** if it doesn't reflect user impact and nobody would act on it. The SLO alerts cover real impact.
    2. **Fix what it measures**: if the flapping shows a real but minor problem, fix the problem.
    3. **Tune it**: a longer `for:`, a longer evaluation window, or a higher threshold, so it fires only when the condition is sustained.
    4. **Downgrade it**: from page to ticket, or from ticket to dashboard only.

    Never just silence it indefinitely. A permanent silence is a deleted alert that nobody admits to deleting.

??? question "8. During an incident, an engineer silences the page alert 'so it stops bothering us'. What's the risk, and what should they do instead?"
    The silence hides **new information**: if the incident gets worse, spreads to another SLO, or a second unrelated problem starts with the same labels, nobody is told. And if they forget to remove it, the next incident won't page at all.

    Instead, **acknowledge** the page in the paging tool (that stops re-notifications for that incident but still tracks it), and rely on `repeat_interval` for reminders. Use silences for **planned** work, always with an end time and a comment.

??? question "9. What belongs in a runbook, and what's a sign that a runbook should be replaced by automation?"
    - What the alert means, in user terms, and its severity levels.
    - The **first 5 minutes**: acknowledge, confirm it's still happening, check recent changes, roll back if they match.
    - Copy-paste **queries and commands** to find where it hurts, and the usual **mitigations**.
    - **When and to whom to escalate.**
    - Links: dashboard, owner, service documentation.

    If the runbook is the same few commands every time and they always work (for example "restart the pod" or "clear the cache"), that's toil: **automate the fix**, and keep the alert only for when the automation fails.

??? question "10. Your team of 4 is on call for a service that pages about 15 times a week, mostly at night. What's wrong, and what would you change?"
    - **Too few people**: with 4, everyone is on call every 4th week, with little recovery time. Aim for 6-8, or share the rotation with another team.
    - **Too many pages**: 15 a week is about 2 a day. Google's guideline is at most about 2 **incidents** per 12-hour shift, and most teams aim much lower. Review every page: how many were actionable?
    - **Night pages**: check whether they're real user impact at night, or batch jobs and noisy cause alerts. Move non-urgent ones to tickets, and consider follow-the-sun if the team spans time zones.
    - Make sure on-call is **compensated**, and that the team gets time to fix the causes, not just respond to them.

??? question "11. How would you measure whether your alerting is getting better?"
    - **Pages per week** per rotation, and the share at night.
    - **Actionable rate**: pages where someone did something ÷ all pages. Aim for close to 100%.
    - **Top noisy alerts** by notification count (in the lab: `show-notifications.sh 24h count`).
    - **Missed incidents**: user-visible incidents that **didn't** page, or paged late. These show gaps in the SLOs.
    - **Time to acknowledge** and **time to mitigate**.

    Review them in a weekly ops meeting, and track the trend.

??? question "12. A ticket alert for checkout fired at 02:00 and was delivered to the ticket queue. Should it have paged instead? How do you decide?"
    It depends on the **burn rate**, which is exactly what the page/ticket split encodes. A ticket alert means the budget is being spent fast enough to matter this month (3x over a day, or 1x over three days), but not so fast that waiting until morning risks the SLO. Waking someone at 02:00 for it would cost more (fatigue, slower response to real pages) than waiting 7 hours.

    If the team often finds that ticket-level burns turn into real problems before morning, lower the page thresholds or shorten the windows. Don't page on everything at night.
