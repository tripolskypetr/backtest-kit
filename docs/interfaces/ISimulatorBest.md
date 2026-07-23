---
title: docs/interface/ISimulatorBest
group: docs
---

# ISimulatorBest

Winner of one ranking criterion with its trade list and the author
artifact under ITS OWN ban rule. Different criteria may elect
points with different ban rules — the whitelist is a property of
the winning point, never a global of the run.

## Properties

### criterion

```ts
criterion: SimulatorRankingCriterion
```

The ranking criterion this winner belongs to.

### report

```ts
report: ISimulatorPointReport
```

Winning point report; null when the grid produced no reports.

### trades

```ts
trades: ISimulatorTrade[]
```

Trades of the winning point (empty when report is null).

### authorStats

```ts
authorStats: ISimulatorAuthorStat[]
```

Per-author track records under THIS winner's rule — the ONLY
source of the author artifact in a run result. Hits are counted
by the rule's metric (authorMetric + the lock/stop levels the
"reach" metric grades against), so even the raw numbers differ
between winners with different rules — a single run-level list
cannot represent them. Empty when report is null.

### allowedAuthors

```ts
allowedAuthors: string[]
```

Whitelist under THIS winner's ban rule.

### bannedAuthors

```ts
bannedAuthors: string[]
```

Ban list under THIS winner's ban rule.
