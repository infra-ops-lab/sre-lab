# Module 0: Why SRE

## Objectives

After this module you can:

- Explain the problem SRE solves and why "keep it running" is not enough at scale.
- Describe the core SRE principles in your own words.
- Tell SRE, DevOps and platform engineering apart, and see where they overlap.
- List what organisations expect from an SRE today.
- Map your current skills as a platform or DevOps engineer to those expectations and find your gaps.

## The problem SRE solves

Every software organisation has a built-in conflict:

- **Developers and product teams are rewarded for change**: new features, faster releases.
- **Operations teams are rewarded for stability**: fewer outages, fewer pages.

Most outages are caused by changes, so the two goals pull against each other. Without a shared rule, the result is predictable: operations adds gates and change freezes, developers work around them, releases get bigger and riskier, and both sides blame each other after every incident.

Scale makes it worse. When a service grows 10x, traditional operations work (manual deploys, hand-run upgrades, ticket-driven fixes) grows 10x too. You can't hire your way out of linear work.

**SRE resolves both problems with engineering:**

1. **Measure reliability** the way users experience it, and agree on a target that is good enough, not perfect.
2. **Use the gap between the target and 100% as a budget** for change. While the budget lasts, ship fast. When it's spent, focus on reliability. The argument becomes a number.
3. **Treat operations as a software problem.** Automate repetitive work so the operations load doesn't grow with the service.

!!! quote "The classic definition"
    SRE is "what happens when you ask a software engineer to design an operations team."
    Ben Treynor Sloss, who founded Google's SRE team, in the [Site Reliability Engineering book](https://sre.google/sre-book/introduction/).

## Core principles

| Principle | What it means in practice |
|---|---|
| **Embrace risk** | 100% reliability is the wrong goal. Each extra "nine" costs roughly 10x more and slows delivery, and users can't tell 99.99% from 100% because their own network fails more often. |
| **Service level objectives** | Reliability is defined from the user's point of view (SLIs) with explicit targets (SLOs). Module 1. |
| **Error budgets** | The allowed unreliability (100% minus the SLO) is spent on releases and experiments. A pre-agreed policy says what happens when it runs out. |
| **Eliminate toil** | Manual, repetitive, automatable work is capped (a common rule is at most 50% of an SRE's time) and engineered away. |
| **Monitoring that matters** | Alert on symptoms users feel, not on every cause. Every page must need a human. Modules 2-3. |
| **Safe change** | Most outages come from changes, so releases are gradual, observable and reversible. Module 7. |
| **Blameless learning** | Incidents are investigated to fix systems, not to blame people. Module 4. |
| **Simplicity** | Simple systems fail in fewer, more understandable ways. |

## SRE, DevOps and platform engineering

These overlap a lot, and job titles are used loosely. A useful way to separate them:

| | **DevOps** | **Platform engineering** | **SRE** |
|---|---|---|---|
| **What it is** | A culture and set of practices: shared ownership, automation, fast feedback | A team that builds an internal platform (paved roads) for developers | An engineering discipline focused on the reliability of production services |
| **Main question** | "How do we deliver changes quickly and safely together?" | "How do we make the right way the easy way for developers?" | "Is the service reliable enough for users, and how do we keep it that way as it changes?" |
| **Typical outputs** | CI/CD pipelines, infrastructure as code, shared on-call | Golden paths, self-service, Kubernetes platform, developer portal | SLOs, error budget policy, observability, incident response, capacity plans, reliability fixes |
| **How success is measured** | Deployment frequency, lead time, change failure rate, recovery time (the DORA metrics) | Adoption, developer time saved, time to first deploy | SLO attainment, error budget, toil, incident trends, time to detect and recover |

The short version: **DevOps is the "what" (culture), SRE is one concrete "how" for reliability, and platform engineering builds the tools both use.** As a platform or DevOps engineer you already do much of the work; SRE adds measurement and a decision rule on top.

## How organisations run SRE

There is no single model. Common ones ([Google Cloud: How SRE teams are organized](https://cloud.google.com/blog/products/devops-sre/how-sre-teams-are-organized-and-how-to-get-started)):

- **Kitchen sink**: one SRE team for everything. Common when starting out.
- **Infrastructure SRE**: owns the shared platform (Kubernetes, networking, databases) and its reliability. Very close to platform engineering.
- **Product or application SRE**: dedicated to one product's reliability.
- **Embedded SRE**: SREs sit inside development teams.
- **Consulting / enabling SRE**: a central team that teaches practices and builds tools so development teams own their own reliability.

Many companies mix these: a central team sets standards (SLO tooling, incident process) while development teams carry the pager for their own services.

## What the industry expects from an SRE

Across current senior SRE job descriptions, the same responsibilities keep appearing:

| Area | What is expected | Covered in |
|---|---|---|
| **Reliability targets** | Define and track SLIs, SLOs and error budgets with product teams | Module 1 |
| **Observability** | Metrics, logs and traces instrumented on purpose, not after the outage | Module 2 |
| **On-call and alerting** | Take part in on-call; keep alerts actionable; reduce pages | Module 3 |
| **Incident response** | Lead incidents across teams, run blameless postmortems, make sure actions get done | Module 4 |
| **Deep troubleshooting** | Kubernetes, Linux, networking (DNS, TCP, TLS, load balancing), storage | Modules 5-6 |
| **Safe change** | CI/CD, GitOps, progressive delivery, rollbacks | Module 7 |
| **Capacity and cost** | Capacity planning, autoscaling, right-sizing, cost awareness | Module 8 |
| **Resilience** | Design for failure, chaos experiments, disaster recovery | Modules 9-10 |
| **Automation and code** | Python or Go tools that remove toil; infrastructure as code | Module 11 |
| **Influence** | Work across development, product and security teams; explain risk in business terms | Module 12 |

Two trends are rising: **cost awareness** (being able to say what a reliability choice costs) and **AI-assisted operations** (using AI tools for analysis and automation while keeping human judgement and review in charge).

## A typical week

SRE work splits into two kinds:

- **Operational work (at most about half):** on-call shifts, incidents, tickets, helping teams with production issues.
- **Engineering work (at least half):** automation, better alerts, reliability fixes from postmortems, capacity planning, tooling, reviews of new services before they launch.

If operational work keeps growing past half, that's a signal: either the service needs reliability investment or the team needs help, and the error budget policy should say which.

## Your starting point: a skills check

Rate yourself honestly for each line: **0** = never done it, **1** = done it with help, **2** = can do it alone and explain it.

| Skill | 0 / 1 / 2 |
|---|---|
| Explain SLI, SLO, SLA and error budget, and calculate allowed downtime | |
| Choose SLIs for a service from the user's point of view | |
| Write PromQL for request rate, error ratio and latency percentiles | |
| Design alerts that page only for user impact | |
| Lead an incident as incident commander | |
| Write a blameless postmortem with useful action items | |
| Debug a failing Kubernetes workload methodically | |
| Debug a slow Linux host (CPU, memory, disk, network) | |
| Roll out a change with a canary and automatic rollback | |
| Plan capacity for peak traffic and a zone failure | |
| Explain retries, backoff, timeouts and circuit breakers | |
| Back up and restore etcd | |
| Write a small Python or Go tool that removes toil | |

Keep your scores. Re-check after each module; the lines with 0 are where to spend extra time.

## Common misconceptions

- **"SRE is just ops with a new name."** If the work is all tickets and no engineering, it isn't SRE. The 50% engineering time and the error budget are what make it different.
- **"SRE means 100% uptime."** The opposite: SRE sets a deliberate target below 100% and uses the rest.
- **"SREs own reliability so developers don't have to."** Reliability is shared. SREs provide targets, tools and expertise; development teams still own their code's behaviour in production.
- **"You need Google's scale for SRE."** The practices (SLOs, blameless postmortems, toil reduction, safe change) work for a team of five.

## Further reading

- [Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/) (Google, free online), chapters 1-6.
- [The Site Reliability Workbook](https://sre.google/workbook/table-of-contents/) (Google, free online): practical follow-up with examples.
- [DORA research](https://dora.dev/): the four key delivery metrics.

**Next:** [Test yourself](test-yourself.md), then Module 1: SLOs and error budgets (coming soon; see the [roadmap](../roadmap.md)).
