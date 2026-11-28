# Postmortem template

Copy this template for every incident that paged, used more than 5% of a monthly error budget, or surprised you. Fill it in within **5 working days**, while people still remember. The [Module 4 lab](lab.md) has you fill it in for the game day.

**Blameless rule:** describe what people did and why it made sense to them at the time. Write "the deploy pipeline allowed an untested change", not "Sam pushed a bad change". If a person could make the mistake, the system allowed it.

---

```markdown
# Postmortem: <short title, in user terms: "Checkout errors for 9 minutes">

| | |
|---|---|
| **Date** | YYYY-MM-DD |
| **Authors** | <names> |
| **Status** | Draft / In review / Final |
| **Severity** | SEV1 / SEV2 / SEV3 |
| **Incident commander** | <name> |

## Summary

Two or three sentences a director can read: what users experienced, for how long, what caused it,
and how it was fixed.

## Impact

- **Users affected:** what they saw (errors, slowness, wrong data) and roughly how many.
- **Duration:** from first user impact to full recovery. Start and end times, with time zone.
- **SLO impact:** error budget consumed: <X>% of the 30-day budget for <SLO>.
- **Business impact:** failed orders, support tickets, revenue, if known.

## Detection

- How did we find out? (SLO page / customer report / someone noticed a dashboard)
- Time from start of impact to the page, and from the page to acknowledgement.
- Did the alert work as designed? If a human or customer noticed first, that's an action item.

## Timeline

All times in <time zone>. Include what people **thought** at each step, not only what they did.

| Time | Event |
|---|---|
| 14:02 | Release 2 of checkout deployed (helm upgrade) |
| 14:03 | Error ratio rises to ~13% (from the dashboard) |
| 14:04 | `CheckoutAvailabilityBudgetBurn` page fires |
| 14:06 | On-call acknowledges, opens the runbook |
| 14:09 | IC declared; release 2 suspected because it matches the start time |
| 14:10 | Rollback to release 1 |
| 14:11 | Error ratio back to 0; 5-minute burn rate 0 |
| 14:40 | Page alert resolves |

## Root cause and contributing factors

What made this possible. Usually several things, not one. Ask "why" until you reach things you can change:
the system, the process, the tooling. Not "human error".

- <the change or event that triggered it>
- <why it wasn't caught before production: tests, canary, review>
- <why it lasted as long as it did: detection, diagnosis, mitigation>

## What went well

- <for example: the page fired within 2 minutes; rollback took 1 command>

## What went badly

- <for example: the SLI only counts 5xx, so 4xx errors from the same bug were invisible>

## Where we got lucky

- <for example: it happened during working hours; traffic was low>

## Action items

Each one has an owner and a due date, and is tracked in the normal backlog. Prefer actions that **prevent** the
problem or make it **smaller**, over actions that only ask people to be more careful.

| Action | Type | Owner | Due | Ticket |
|---|---|---|---|---|
| Add a canary step that checks the error ratio before full rollout | Prevent | | | |
| Decide whether 4xx from our own bugs should count in the SLI | Detect | | | |
| Add the rollback command to the runbook's first 5 minutes | Mitigate | | | |

## Lessons learned

What would you tell another team so they don't have the same incident?
```
