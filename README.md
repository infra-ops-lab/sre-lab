# SRE Lab

A hands-on **Site Reliability Engineering** course for platform and DevOps engineers.

**Website:** https://infra-ops-lab.github.io/sre-lab/

Each module has a lesson (objectives, why it matters, concepts, industry practice, common mistakes), a lab on a local kind cluster, and a **Test yourself** section with answers.

| # | Module |
|---|---|
| 0 | Why SRE |
| 1 | SLOs and error budgets |
| 2 | Observability |
| 3 | Alerting and on-call |
| 4 | Incidents and postmortems |
| 5-12 | Troubleshooting, safe change, capacity, resilience, platform design, toil, culture, capstone |

See the [roadmap](docs/roadmap.md) for what's published.

## Repository layout

```text
docs/     course pages (MkDocs Material)
labs/     lab files: kind cluster, monitoring values, demo app, per-module manifests
```

Build the site locally:

```bash
pip install -r requirements-docs.txt
mkdocs serve        # http://127.0.0.1:8000
```
