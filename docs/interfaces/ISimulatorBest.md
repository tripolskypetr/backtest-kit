---
title: docs/interface/ISimulatorBest
group: docs
---

# ISimulatorBest

Winner of one ranking criterion with its trade list.

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
