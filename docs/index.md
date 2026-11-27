# SRE Lab

**A hands-on Site Reliability Engineering course for platform and DevOps engineers.**

You already build and run infrastructure: Kubernetes, CI/CD, Terraform, monitoring. This course teaches the part that turns that into **reliability engineering**: deciding how reliable a service must be, measuring it, alerting on what users feel, running incidents well, and making changes safely. Every module has a lesson, a lab on your laptop, and a "Test yourself" section with answers.

## Who this is for

- **Platform engineers** who run Kubernetes and want to own reliability, not only infrastructure.
- **DevOps engineers** who automate delivery and want to measure and improve what users experience.
- **Ops and sysadmins** moving towards SRE who want the engineering practices and vocabulary.

You should be comfortable with Linux, `kubectl`, Helm and basic Prometheus. You don't need prior SRE experience.

## What you will be able to do

By the end of the course you will be able to:

- [x] Explain what SRE is, why organisations adopt it, and what SRE teams are expected to deliver.
- [x] Define **SLIs and SLOs** for a service and a platform, and run an **error budget** policy.
- [x] Build **observability** that answers "are users hurting?" and "where is the problem?"
- [x] Replace noisy threshold alerts with **burn-rate alerts** and write useful runbooks.
- [x] Lead an **incident** and write a **blameless postmortem** that leads to real fixes.
- [ ] Troubleshoot Kubernetes, Linux and networks methodically *(modules 5-6, coming next)*.
- [ ] Ship changes safely with canaries and automated rollback *(module 7)*.
- [ ] Plan capacity, design for failure and run chaos experiments *(modules 8-10)*.

## Course map

| # | Module | You'll practise |
|---|---|---|
| 0 | [Why SRE](00-why-sre/index.md) | Where SRE fits, what the industry expects, a skills self-check |
| 1 | [SLOs and error budgets](01-slos/index.md) | SLOs for a real service with Sloth; watch the budget burn |
| 2 | Observability *(coming soon)* | RED and USE with PromQL, a service dashboard, cardinality |
| 3 | Alerting and on-call *(coming soon)* | Alert routing, inhibition, triaging noisy alerts, runbooks |
| 4 | Incidents and postmortems *(coming soon)* | A game day: a bad release, incident roles, rollback, postmortem |
| 5-12 | [Coming next](roadmap.md) | Troubleshooting, safe change, capacity, resilience, platform design, toil, culture, capstone |

## How each module works

1. **Lesson**: objectives, why it matters, concepts, how the industry does it, common mistakes.
2. **Lab**: step-by-step on a local kind cluster. Every command was run before it was published, and the outputs you'll see are real.
3. **Test yourself**: questions that check understanding, not memory. Try to answer before you open the answer.

!!! tip "Learn by saying it"
    For each "Test yourself" question, answer out loud or in writing first. If you can't explain it simply, read the lesson section again. That's the fastest way to make it stick.

## Start here

1. Set up the [lab environment](setup.md) (about 10 minutes).
2. Read [Module 0: Why SRE](00-why-sre/index.md).
3. Work through the modules in order; each builds on the last.
