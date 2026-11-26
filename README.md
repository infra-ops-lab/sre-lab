# SRE Practice Lab

A self-study lab for Site Reliability Engineering: 100+ questions with model answers, timed drills, mock rounds and a 14-day plan.

**Live site:** https://infra-ops-lab.github.io/sre-lab/

## What's inside

| Area | Topics |
|---|---|
| Fundamentals | How to structure answers, SRE vs DevOps, toil, error budget policy |
| SLOs | SLI/SLO/SLA, error budgets, burn-rate alerting, SLOs for a Kubernetes platform |
| Observability | Golden signals, RED/USE, alert design, cardinality, Prometheus at scale, OpenTelemetry |
| Incidents | Incident command, severity, mitigation first, blameless postmortems, on-call health |
| Troubleshooting | Kubernetes (16 scenarios), Linux (11), networking (5) |
| Design | Safe releases, capacity, resilience patterns, chaos, HA control plane, etcd, multi-region, multi-tenancy |
| Coding | Practical Python (log parsing, health checks, Kubernetes client) and easy data-structure questions |
| Behavioural | STAR-L stories and how to structure them |

## How to use it

- **Q&A drill:** answer out loud first, then open the model answer and rate yourself.
- **Interview me:** random timed questions; weak ones come back more often.
- **Mock rounds:** practice mode with hints, or timed real mode with self-scoring.
- Progress is saved in your browser (export/import on the Help page).

## Run it locally

```bash
python3 app/server.py            # http://localhost:4300
python3 scripts/build-site.py    # static build into ./site
```

Questions live in `app/content/qa-*.txt` (`## Section | Tag`, then `Q:`, `A:`, `F:` follow-ups). Corrections and new questions are welcome.
