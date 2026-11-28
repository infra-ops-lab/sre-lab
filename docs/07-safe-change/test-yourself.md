# Test yourself: Safe change

Answer each question in your own words first, then open the answer. Question 6 needs a calculator.

??? question "1. A rolling update completed successfully, and the new version returns errors for 30% of requests. How is that possible, and what would have caught it?"
    A rolling update only checks that new pods become **Ready**. If the readiness probe passes (the process is up and answers `/readyz`), Kubernetes considers the pod good, whatever the real requests return. That's exactly what happened in Module 4.

    A **canary with automated analysis** would have caught it: send a small share of traffic to the new version, measure its error ratio, and abort if it's above a threshold.

??? question "2. What do maxSurge, maxUnavailable and minReadySeconds control? What settings would you use for a service with 4 replicas that must never drop capacity?"
    - `maxSurge`: how many **extra** pods can exist during the update.
    - `maxUnavailable`: how many pods can be **missing** (not Ready) during the update.
    - `minReadySeconds`: how long a new pod must stay Ready before it counts as available, which catches pods that crash shortly after starting.

    For "never drop capacity": `maxUnavailable: 0`, `maxSurge: 1` (or 25%), and `minReadySeconds: 10` or more. The update is slower, but there are always at least 4 Ready pods.

??? question "3. Compare blue-green and canary releases. When would you choose each?"
    - **Blue-green**: the new version runs in full beside the old; traffic switches all at once; switching back is instant. Choose it when you need to **test the new version in production before it gets traffic**, when you need a very fast, complete rollback, or when the two versions can't run side by side for long. Costs double capacity, and the switch exposes everyone at once.
    - **Canary**: the new version gets a growing share of traffic, checked at each step. Choose it when you want to **limit the blast radius** of problems that only show up with real traffic. Needs per-version metrics and enough traffic to judge.

    Many teams use canary for normal releases, and blue-green for things like database or infrastructure changes where a clean switch matters.

??? question "4. Why must canary analysis measure the canary pods only, not the whole service?"
    With 20% of traffic on the canary, a canary failing 30% of requests raises the **service's** error ratio by only 6%, and with 5% canary traffic by 1.5%. That might stay under the threshold, or look like noise. Measuring only the canary's pods shows its real error ratio (30%), so the analysis fails clearly and quickly.

    In the lab, metrics carry the `rollouts_pod_template_hash` label, so the analysis query selects only the new version's pods.

??? question "5. What makes a deploy 'safe to roll back', and what kinds of change usually aren't?"
    Safe to roll back: the previous version can run against the **current** state: same database schema, same message formats, same config keys, no one-way side effects.

    Usually not safe:

    - **Schema changes** the old code doesn't understand (a renamed or removed column).
    - **Data migrations** that change or delete data.
    - **External side effects**: emails, payments, events published to other systems.
    - Changes to **shared formats** (message schemas, APIs) that other services have already adopted.

    Make them reversible with **expand and contract** for schemas, flags for side effects, and backward-compatible formats.

??? question "6. A bad release fails 30% of requests. With a canary at 20% that's caught after 3 minutes, versus a full rollout caught after 15 minutes, how do the failed requests compare? The service handles 20 requests per second."
    - Canary: 20 rps × 20% × 30% × 180 s ≈ **216** failed requests.
    - Full rollout: 20 rps × 100% × 30% × 900 s ≈ **5,400** failed requests.

    The canary limits the damage to about **4%** of the full rollout's, because it combines a smaller share of traffic (5x less) with faster detection (5x faster). Both factors matter.

??? question "7. Your platform team needs to upgrade the CNI plugin on 200 clusters. Describe a safe rollout plan."
    1. **Wave 0**: test and internal clusters. Bake for a day.
    2. **Wave 1**: 2-5 low-risk production clusters, in one region. Bake 1-2 days, long enough for slow problems (leaks, daily jobs).
    3. **Wave 2**: about 25% of clusters, spread so that no region or customer has all its clusters in one wave.
    4. **Wave 3**: the rest, still in batches.

    At each wave, **automated gates** on platform SLOs: pod network errors, DNS success rate, pod start time, API availability, application SLO burn rates. **Stop automatically** on a gate failure. Test the rollback procedure in wave 0, and never upgrade every region in the same window.

??? question "8. What is 'expand and contract'? Use renaming a database column as the example."
    A way to change a schema in backward-compatible steps, each of which can be rolled back:

    1. **Expand**: add the new column `customer_email` next to the old `email`.
    2. Deploy code that **writes both** columns and reads the new one if set, else the old.
    3. **Backfill**: copy existing data from `email` to `customer_email`.
    4. Deploy code that reads and writes **only** `customer_email`.
    5. **Contract**: once nothing uses `email` (and you're sure you won't roll back), drop it.

    At every step, both the current and the previous code version work with the database.

??? question "9. What's the difference between deploying and releasing, and how do feature flags help?"
    **Deploying** puts new code into production; **releasing** exposes the new behaviour to users. Feature flags separate them: the code ships turned off, so the deploy carries little risk. Then the feature is turned on gradually (employees, 1% of users, one region), and turned off in seconds if it causes problems, without a new deploy or rollback.

    Costs: flags need ownership and cleanup (old flags are technical debt), and flag changes are themselves changes that should be logged and visible on dashboards.

??? question "10. The canary analysis query sometimes returns no data in the first minute and the rollout gets stuck or aborted. Why, and how do you fix it?"
    New pods have no request metrics until they've received traffic and Prometheus has scraped them (one or two scrape intervals), and `rate(...[1m])` needs at least two samples. So the first measurements are empty.

    Fixes: an **initialDelay** on the analysis (the lab uses 60 s), `or vector(0)` on the numerator so "no errors" is 0 rather than empty, and a **minimum traffic** condition so the analysis doesn't judge a canary that has served almost nothing.

??? question "11. How should the error budget affect release policy?"
    - **Budget healthy**: normal release pace, standard canaries.
    - **Budget getting low**: smaller releases, longer canary steps and bake times, extra review for risky changes.
    - **Budget exhausted**: freeze feature releases; only reliability fixes and security patches ship until the SLI recovers (the error budget policy from Module 1).

    The point is that the decision is made in advance, based on data, not argued during a crisis.

??? question "12. A colleague argues 'we deploy once a month to be safe'. What's your response?"
    Infrequent releases are **larger**, so each one contains more changes: more likely to break, harder to test, harder to debug ("which of the 200 changes did it?"), and harder to roll back (other changes depend on it). Teams also get less practice with the deploy process, so it stays manual and fragile.

    Safety comes from **small, frequent, gradual, observed** changes: canaries with automated analysis, fast rollback, and flags. Industry research (the DORA reports) consistently finds that teams that deploy more often also have **lower** change failure rates and faster recovery.
