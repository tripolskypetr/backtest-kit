---
title: docs/interface/ISimulatorCallbacks
group: docs
---

# ISimulatorCallbacks

Lifecycle callbacks of a simulation run. Every progress point the
reference Sweep script printed to console is exposed here instead.

## Methods

### onProgress

```ts
onProgress: (symbol: string, stage: SimulatorProgressStage, processed: number, total: number) => void
```

Progress of a long-running stage: fires after every processed
item — idea (stage "profiles") or grid point (stage "grid").
processed grows from 1 to total within a stage.

### onIdeas

```ts
onIdeas: (symbol: string, ideasTotal: number, ideasDirectional: number) => void
```

Ideas received: total vs directional (NEUTRAL excluded).

### onProfiles

```ts
onProfiles: (symbol: string, profiles: ISimulatorIdeaProfile[], truncatedCount: number) => void
```

All idea profiles built (one candle pass per idea).
truncatedCount — profiles cut short by end of candle data.

### onAuthorsTrained

```ts
onAuthorsTrained: (symbol: string, stats: ISimulatorAuthorStat[], bannedIdeas: number) => void
```

Author ban list trained for one ban-rule combination of the grid
(fires once per unique minAuthorTrack x minAuthorHitRate pair):
per-author stats under that rule and how many ideas belong to
banned authors.

### onGridPoint

```ts
onGridPoint: (symbol: string, report: ISimulatorPointReport, trades: ISimulatorTrade[]) => void
```

One grid point evaluated.

### onRanking

```ts
onRanking: (symbol: string, criterion: SimulatorRankingCriterion, sorted: ISimulatorPointReport[], best: ISimulatorBest) => void
```

Ranking computed WITHIN one metric bucket: the bucket's reports
sorted by the criterion (descending) and the eligible winner
(minimum-trades floor applied per bucket). Fires once per
(swept metric x criterion).

### onDone

```ts
onDone: (symbol: string, result: ISimulatorResult) => void
```

Simulation finished.

### onTestDone

```ts
onTestDone: (symbol: string, result: ISimulatorTestResult) => void
```

Out-of-sample test finished. onAuthorsTrained deliberately never
fires during a test — nothing is trained on the test data.
