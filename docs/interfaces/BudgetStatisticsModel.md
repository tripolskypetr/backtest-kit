---
title: docs/interface/BudgetStatisticsModel
group: docs
---

# BudgetStatisticsModel

Aggregated statistics model for budget journal events.

## Properties

### eventList

```ts
eventList: BudgetEvent[]
```

Full list of recorded rows (newest first by arrival)

### totalEvents

```ts
totalEvents: number
```

Total number of recorded rows

### totalRejects

```ts
totalRejects: number
```

Number of `reject` rows (refused reserves / withdrawals)

### totalOverdrafts

```ts
totalOverdrafts: number
```

Number of `reserve` rows that carried an overdraft mark when inserted
