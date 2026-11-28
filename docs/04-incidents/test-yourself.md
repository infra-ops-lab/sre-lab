# Test yourself: Incidents and postmortems

Answer each question in your own words first, then open the answer. Question 7 needs a calculator.

??? question "1. Why declare an incident early, even when you aren't sure it's serious?"
    Declaring is cheap: you can downgrade or close it in a minute. Not declaring is expensive: without an IC, a channel and roles, people investigate in parallel without coordinating, nobody tells stakeholders, and the timeline is lost. Most organisations would rather have ten small incidents declared and closed than one big incident that ran for 40 minutes before anyone coordinated it.

??? question "2. What does the incident commander do, and what don't they do?"
    The IC **coordinates**: sets the current goal, assigns people to investigate and to communicate, makes decisions (roll back or not, escalate or not), keeps track of who is doing what, and declares the end.

    The IC **doesn't** debug or type commands. As soon as the IC starts investigating, nobody is watching the big picture, communication stops, and decisions stall. In a very small incident one person can do both, but they should hand IC to someone else as soon as others join.

??? question "3. During an incident, the team finds a deploy 5 minutes before errors started, but the engineer who made it is sure it can't be the cause. What should the IC decide?"
    **Roll it back.** A change that lines up with the start of the impact is the most likely cause, whatever anyone believes. Rolling back costs a few minutes and is reversible; debating it costs user impact for as long as the debate lasts. If the rollback doesn't help, the team has ruled out one cause and moves on. The postmortem can work out who was right.

??? question "4. Rank these mitigations by how fast and safe they usually are: scale up, roll back, debug and hotfix, turn off a feature flag, fail over to another region."
    Usually, from fastest and safest:

    1. **Turn off a feature flag**: seconds, and touches only the new code.
    2. **Roll back**: minutes, back to a version that worked.
    3. **Scale up**: minutes, if saturation is the problem. Doesn't help with bugs.
    4. **Fail over to another region**: works for location-specific problems, but it's a big change with its own risks (capacity in the other region, data replication).
    5. **Debug and hotfix**: slowest and riskiest. A new, untested change made under pressure. Use it only when nothing else works.

??? question "5. Write a first external status update for: 20% of checkout attempts failing since 14:02, cause unknown, investigating."
    ```text
    [Investigating] 14:10 UTC
    Some customers are seeing errors when completing checkout. We're investigating.
    Orders that have already been placed are not affected. If your checkout fails,
    please try again in a few minutes. Next update by 14:30 UTC.
    ```

    It says what's affected, what users should do, and when the next update comes. It doesn't guess at the cause, give internal details, or promise a time to fix.

??? question "6. What does 'blameless' mean in a postmortem, and why does it lead to better fixes?"
    It means assuming that everyone acted reasonably with the information, tools and pressures they had at the time, and asking **what in the system made the mistake possible**, rather than who made it.

    It leads to better fixes because:

    - People tell the full story, including their own mistakes, when they aren't afraid of punishment. Hidden information makes the analysis wrong.
    - "Human error" isn't fixable; "the deploy tool doesn't ask for confirmation in production" is. Blame stops the analysis exactly where it should continue.

    Blameless doesn't mean no accountability: people are accountable for taking part honestly and for completing their action items.

??? question "7. Checkout has a 99.5% availability SLO over 30 days and handles 20 requests per second. An incident made 13% of requests fail for 9 minutes. How much of the monthly error budget was used?"
    - Failed requests: 20 × 60 × 9 × 0.13 ≈ **1,400**.
    - Requests in 30 days: 20 × 86,400 × 30 ≈ 51.8 million. Budget: 0.5% of that ≈ **259,000** failed requests.
    - Used: 1,400 / 259,000 ≈ **0.5%** of the monthly budget.

    Or with time: 13% × 9 minutes ≈ 1.2 "full outage minutes", against a budget of 0.5% × 43,200 minutes = 216 minutes ≈ 0.5%.

    Small. Still worth a postmortem if it paged, or if (as in the lab) the SLI **under-counted** the real impact.

??? question "8. Why build the timeline from data, and which sources would you use for a Kubernetes service?"
    Memory is unreliable, especially under stress: people misremember the order of events and forget dead ends. Data gives exact times and shows what was really happening, not what people thought.

    Sources:

    - **Deploy history**: `helm history`, `kubectl rollout history`, CI/CD pipeline logs, Argo CD or Flux sync history.
    - **Metrics**: when the error ratio and burn rate started and stopped (Prometheus range queries).
    - **Alerts**: when each alert started firing, notified, was acknowledged, and resolved (Alertmanager, paging tool).
    - **Kubernetes events**: `kubectl get events`, pod restarts.
    - **Chat**: the incident channel, for decisions and what people believed.

??? question "9. Rewrite these action items so they'd actually prevent a repeat: 'Be more careful with Helm values', 'Improve alerting', 'Look into why it took long to find'."
    - "Be more careful with Helm values" → "Add a CI check that renders the chart and fails if `faults.*` is enabled for production" and "Deploy checkout through a canary stage that stops if the error ratio exceeds 1%".
    - "Improve alerting" → "Count 4xx responses from checkout's own validation errors in the availability SLI, so the page reflects the real impact".
    - "Look into why it took long to find" → "Add a 'recent deploys' annotation to the checkout dashboard, so changes are visible next to the error graph".

    Each one is specific, has a clear done state, and can have an owner and a due date.

??? question "10. Your team's postmortems keep listing 'missing alert' as a contributing factor. What does that pattern tell you, and what would you do?"
    That detection relies on luck (customers or engineers noticing), and that the alerting design has gaps, probably cause-based alerts instead of SLOs, or SLOs that don't cover all critical user journeys.

    Fix the pattern, not each instance: review which user journeys have SLOs, add SLO burn-rate alerts for the missing ones, and add "did the SLO alert fire first?" as a standard postmortem question. Track "incidents detected by alert vs by humans" over time.

??? question "11. What is a game day, and what makes it useful rather than theatre?"
    A planned exercise where the team deliberately causes a failure and practises responding to it.

    It's useful when:

    - It has a **hypothesis and success criteria** ("the page fires within 5 minutes; rollback within 10").
    - The responders follow the **real process**: real alerts, real runbooks, real roles, no hints.
    - It has a **stop condition** and a way to undo the fault quickly.
    - It ends with a **written review and action items** that get done.

    It's theatre when everyone knows the script, the fault is announced in advance, and nothing changes afterwards.

??? question "12. In the lab's game day, the bad release returned 500, 400 and 409 errors, but the availability SLI only counts 5xx. What would you propose in the postmortem?"
    The SLO under-reported the impact: about 31% of requests failed, but the SLI saw only the 9% that were 500s. Users don't care which status code they got.

    Options to discuss:

    - Count **4xx caused by the service itself** (for example, responses with a specific error code or header) as bad events, while still excluding genuine client mistakes.
    - Add a separate SLI for **successful checkouts** (business events), measured where orders are recorded.
    - At minimum, add a **4xx ratio panel** and a ticket-level alert on sudden 4xx spikes after a release.

    The general lesson: an SLI is a hypothesis about what users experience. Incidents are when you find out whether it's right.
