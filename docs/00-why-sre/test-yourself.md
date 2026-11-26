# Test yourself: Why SRE

Answer each question in your own words first, then open the answer.

??? question "1. What conflict does SRE resolve, and how?"
    Development is rewarded for change; operations is rewarded for stability; most outages come from change. SRE agrees on a reliability target (SLO) measured from the user's point of view. The gap between the target and 100% is the **error budget**: while it lasts, teams ship freely; when it's spent, reliability work comes first. The decision is made by a number agreed in advance, not by whoever argues hardest.

??? question "2. Why is 100% availability the wrong target?"
    - Each extra nine costs roughly 10x more (redundancy, testing, slower releases).
    - Users can't tell the difference above a certain level: their own Wi-Fi, phone and ISP fail more often than 99.99%.
    - A 100% target leaves zero budget for change, so every release becomes a risk to be blocked.
    The right target is the one where users are happy and the business can still move fast.

??? question "3. What is toil? Give two examples from platform work and one thing that looks like toil but isn't."
    Toil is work that is **manual, repetitive, automatable, reactive, has no lasting value, and grows with the size of the service**.

    Examples: renewing certificates by hand; running the same upgrade steps on each cluster; restarting a stuck pod every week; answering the same access-request ticket.

    Not toil: handling a genuinely new incident, design work, writing a postmortem, building automation. These are operational or engineering work with lasting value.

??? question "4. How would you explain the difference between DevOps, platform engineering and SRE to a new team member?"
    DevOps is the culture: developers and operations share ownership and automate delivery. Platform engineering builds the internal platform and golden paths that make delivery easy. SRE is the engineering discipline for production reliability: it measures what users experience (SLOs), decides priorities with error budgets, and engineers away toil and failure modes. In practice the three overlap and often sit in the same team.

??? question "5. A team says they're doing SRE, but their SREs spend 90% of their time on tickets and pages. What's wrong, and what would you change?"
    They're doing operations with an SRE title. Without engineering time, nothing gets better and the load grows with the service.

    Changes: measure the operational load (pages, tickets, hours); cap it (about 50%); send the overflow back to the owning development team or trigger the error budget policy; spend the reclaimed time on the top sources of pages and tickets (automation, fixes from postmortems, better alerts).

??? question "6. Which SRE team model fits a company with 40 developers in 6 teams and 3 SREs?"
    Usually **consulting/enabling** with a bit of **infrastructure SRE**: 3 people can't embed in 6 teams. The SREs own the shared platform's reliability, build the SLO, alerting and incident tooling, run the incident process, and coach teams to own their own services' SLOs and on-call. Embedding comes later, for the most critical service, if the business needs it.

??? question "7. Name four things the industry commonly expects a senior SRE to do, beyond keeping systems running."
    Any four of: define SLOs and error budgets with product teams; lead incidents and run blameless postmortems; design observability and actionable alerting; plan capacity and cost; make releases safe (canary, rollback); design for failure and run chaos or DR tests; build automation in Python or Go to remove toil; influence other teams and explain reliability risk in business terms.

??? question "8. Your manager asks: 'Why should we invest in SRE? We already have a DevOps team.' Give a two-sentence answer."
    "Our DevOps practices make delivery fast, but we have no shared, measurable definition of 'reliable enough', so every incident becomes an argument and every release a risk. SRE gives us user-focused targets and an error budget that tells us objectively when to ship and when to fix, plus a discipline for reducing incidents and toil over time."
