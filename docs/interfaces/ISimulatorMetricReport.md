---
title: docs/interface/ISimulatorMetricReport
group: docs
---

# ISimulatorMetricReport

Self-contained result of ONE author metric: its grid points, its
ranking winners and its trained ban dictionaries. Metrics are
never glued together — each bucket answers its own question with
its own numbers.

## Properties

### reports

```ts
reports: ISimulatorPointReport[]
```

Grid point reports of this metric, sorted descending by the
schema's reportOrder criterion (default sharpe).

### best

```ts
best: ISimulatorBest[]
```

Winners of the four ranking criteria WITHIN this metric bucket
(anti-fluke trades floor applies per bucket). Empty when the
metric is not swept.

### bans

```ts
bans: ISimulatorRuleBans[]
```

Trained ban dictionaries of this bucket — one entry per unique
rule, identified by its own threshold/level fields (no
synthetic keys). Pure threshold arithmetic — which authors a
rule allows does not depend on any ranking.
