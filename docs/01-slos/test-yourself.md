# Test yourself: SLOs and error budgets

Answer each question in your own words first, then open the answer. Questions 2, 4 and 6 need a calculator.

??? question "1. Explain SLI, SLO, error budget and SLA using one service as the example."
    For a checkout API:

    - **SLI**: the share of checkout requests that return a non-5xx response, measured at the ingress: good requests / all requests.
    - **SLO**: that SLI should be at least 99.9% over a rolling 30 days. It's an internal target.
    - **Error budget**: 100% − 99.9% = 0.1%. That's about 43 minutes of total outage a month, or 1 failed request in every 1,000.
    - **SLA**: the contract with customers, for example 99.5% monthly or they get service credits. It's looser than the SLO so you have a margin before you owe anyone money.

??? question "2. Your SLO is 99.95% over 30 days. The service handles 50 million requests a month. How much downtime and how many failed requests can you afford?"
    - Time: 30 days × 24 h × 60 min × 0.0005 = **21.6 minutes** of total outage.
    - Requests: 50,000,000 × 0.0005 = **25,000 failed requests**.

    The request-based number is usually more useful. A partial outage that fails 10% of requests for 3 hours costs about 10% × 180 min = 18 minutes' worth of budget, without the service ever being fully "down".

??? question "3. A colleague proposes these SLIs for a Kubernetes platform: node CPU below 80%, zero pod restarts, and etcd up. What's wrong, and what would you propose instead?"
    All three measure **causes**, not what the platform's users (developers and their workloads) experience. CPU can sit at 90% with everyone happy; etcd can be "up" while the API server times out.

    Better SLIs, all as good/total ratios:

    - **API server availability**: % of API requests that don't return 5xx.
    - **API server latency**: % of mutating requests under 1 s.
    - **Pod start time**: % of pods that become Ready within 60 s of creation (excluding image pulls you don't control, if you can).
    - **Deploy success rate**: % of rollouts that complete.
    - **DNS**: % of cluster DNS lookups that succeed.

    Keep CPU, restarts and etcd health on dashboards. They help you find the cause after an SLO alert tells you users are affected.

??? question "4. The SLO is 99.9%. For the last hour, 1.5% of requests have failed. What's the burn rate, how long until the 30-day budget is gone, and should someone be paged?"
    - Burn rate = 0.015 / 0.001 = **15**.
    - Time to exhaust the budget: 30 days / 15 = **2 days**.
    - **Yes, page.** 15 is above the 14.4 threshold for the 1-hour window (2% of the monthly budget in an hour), and the 5-minute window is high too because the errors are still happening. Waiting until tomorrow would cost about half the month's budget.

??? question "5. Why do burn-rate alerts check two windows (for example 1 hour and 5 minutes)? What goes wrong if you only use one?"
    - **Only the long window (1 h)**: the alert is accurate, but it keeps firing long after you've fixed the problem, because the bad minutes stay in the window for an hour. On-call can't tell if their fix worked.
    - **Only the short window (5 min)**: the alert reacts fast but pages on every brief blip that barely touches the budget, so people learn to ignore it.
    - **Both**: the long window proves the problem is big enough to matter, and the short window proves it's still happening. The alert fires quickly and clears within minutes of recovery.

    You'll see this in the lab: the page alert keeps firing for almost half an hour after the fix because its 30m and 6h windows still hold the bad minutes, while the 5-minute burn rate is already back to 0.

??? question "6. Checkout calls payments, inventory and user-profile, one after another. Each has a 99.9% SLO. Product wants checkout at 99.95%. What do you tell them?"
    In series, the best checkout can do is about 0.999 × 0.999 × 0.999 ≈ **99.7%**, before counting checkout's own failures. 99.95% isn't achievable with this design.

    Options, which you can combine:

    - **Remove dependencies from the critical path**: load the user profile asynchronously or from a cache, and reserve inventory after the order is accepted.
    - **Add fallbacks**: use a cached or default response if a non-critical call fails.
    - **Retry with a budget**: safe retries on idempotent calls hide brief failures.
    - **Ask the dependencies for tighter SLOs**, if they can support them.
    - **Or agree on a lower target** that matches what users actually need.

??? question "7. The availability SLI includes health-check and /metrics requests. Why is that a problem? Give a concrete example."
    Probes and scrapes aren't users. They usually hit cheap endpoints that keep succeeding while real requests fail, so they **dilute** the error ratio and hide outages.

    Example: users send 2 requests/s, and probes plus scrapes add 1 request/s. Users see 10% errors (0.2 failed/s). Counted with the probes, the SLI shows 0.2 / 3 = **6.7%**: a third of the problem disappears. In a low-traffic service, or at night, probes can outnumber users and hide almost everything.

    Fix: filter them out in the SLI query (in the lab: `path!~"healthz|readyz|metrics"`), or measure at the ingress, which probes don't go through.

??? question "8. Should HTTP 4xx responses count as errors in an availability SLI?"
    **Usually not.** A 400 or 404 normally means the client sent a bad request, and your service behaved correctly.

    Exceptions to watch:

    - **429 Too Many Requests**: you're turning real users away. Count it, or give it its own SLI.
    - **A 4xx spike after a release**: often your bug, such as a broken validation rule. The SLI will look green while users fail. Module 4's game day shows exactly this.
    - **401/403 after an auth change**: same story.

    A common approach: count 5xx in the SLO, and alert separately on unusual 4xx rates or on 4xx changes right after a deploy.

??? question "9. You created an SLO an hour ago. The dashboard says the 30-day error budget remaining is −1,600%. Is the service in terrible shape?"
    **Not necessarily.** Prometheus computes the "30-day" ratio over whatever data exists. If there's only an hour of data and that hour includes a test or a short incident, that hour counts as the whole month. Budget-remaining numbers mean little until the window has filled (30 days).

    Until then, trust the short-window burn rates and the alerts. Don't report budget remaining to anyone. If you need an early number, use one that matches your data, such as the last 7 days.

??? question "10. Why is a latency SLI written as '99% of requests under 500 ms' and not as 'average latency under 200 ms' or 'p99 under 500 ms'?"
    - **Averages hide the tail.** 95% of requests at 50 ms and 5% at 4 s still average about 250 ms, but one user in twenty has a terrible experience.
    - **Threshold-based SLIs are countable**: each request is good or bad, so they fit the same good/total maths, error budget and burn-rate alerts as availability.
    - **Percentiles don't add up.** You can't average p99s across pods, regions or time windows and get a true p99. Counts of requests under the threshold can simply be summed, for example from histogram buckets (`le="0.5"`).

    p99 is still a useful **diagnostic** on dashboards.

??? question "11. The error budget for checkout is spent, with 10 days left in the window. Product has a big feature launch planned for Friday. What happens?"
    Follow the **error budget policy** that was agreed in advance. A typical policy says that feature releases stop and only reliability fixes and security patches ship until the SLI is back above target.

    In practice:

    - Show the data: what burned the budget, and the top fixes already in progress.
    - Offer options: delay the launch; ship it behind a feature flag to a small canary group; or ship it as a documented one-time exception approved by the person named in the policy (for example the VP Engineering).
    - Put the reliability fixes at the top of the backlog.

    The point is that **nobody negotiates in the moment**. The decision rule existed before the incident. If the business keeps granting exceptions, the SLO is probably wrong and should be reviewed.

??? question "12. A team wants a 99.99% SLO. Rollback is manual and takes about 15 minutes. Is that realistic?"
    No. 99.99% over 30 days allows about **4.3 minutes** of total outage. One bad release with a 15-minute manual rollback uses more than three months of budget at once, and that's before anyone notices and gets paged.

    To defend 99.99% you need: automated canary analysis with **automatic rollback** within a minute or two; redundancy across zones with automatic failover; and dependencies that are themselves better than 99.99%. Otherwise, start at 99.9% (43 minutes), measure for a few months, and tighten only if users need it and the automation exists.
