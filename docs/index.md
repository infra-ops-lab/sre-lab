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
- [x] Troubleshoot Kubernetes, Linux and networks methodically.
- [x] Ship changes safely with canaries and automated rollback.
- [ ] Plan capacity, design for failure and run chaos experiments *(modules 8-10)*.

## Course map

| # | Module | You'll practise |
|---|---|---|
| 0 | [Why SRE](00-why-sre/index.md) | Where SRE fits, what the industry expects, a skills self-check |
| 1 | [SLOs and error budgets](01-slos/index.md) | SLOs for a real service with Sloth; watch the budget burn |
| 2 | [Observability](02-observability/index.md) | RED and USE with PromQL, a hidden CPU limit, a dashboard as code, a cardinality explosion |
| 3 | [Alerting and on-call](03-alerting/index.md) | Routing, inhibition and silences, triaging a noisy default install, a runbook, reviewing alert PRs |
| 4 | [Incidents and postmortems](04-incidents/index.md) | A game day: a bad release, incident roles, rollback, a timeline from data, a blameless postmortem |
| 5 | [Troubleshooting Kubernetes](05-k8s-troubleshooting/index.md) | Eight broken services to fix without being told what's wrong, and a DNS outage the SLO can't see |
| 6 | [Linux and network troubleshooting](06-linux-network/index.md) | Latency, packet loss, a CPU hog and a full disk found with Linux tools; what one DNS lookup costs |
| 7 | [Safe change](07-safe-change/index.md) | An Argo Rollouts canary with automated analysis that rolls a bad release back by itself |
| 8-12 | [Coming next](roadmap.md) | Capacity, resilience, platform design, toil, culture, capstone |

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
