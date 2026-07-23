---
title: docs/interface/ISimulatorResult
group: docs
---

# ISimulatorResult

Final result of a simulation run: grid reports, four ranking
winners; the author artifact is per-winner in best[] — hits are
metric-dependent, a run-level list would lie to other criteria.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol the simulation ran for.

### ideasTotal

```ts
ideasTotal: number
```

Total ideas of the symbol received (including NEUTRAL).

### ideasDirectional

```ts
ideasDirectional: number
```

Directional ideas simulated (NEUTRAL and flood duplicates excluded).

### profileCount

```ts
profileCount: number
```

Number of idea profiles built (ideas with candle data).

### truncatedCount

```ts
truncatedCount: number
```

Profiles cut short by end of candle data.

### allowedAuthors

```ts
allowedAuthors: string[]
```

Authors allowed by AT LEAST ONE ranking winner's rule (union
over best[]). No criterion is privileged: with different rules
among winners this is the honest run-level whitelist candidate
set; which winner allows whom — in best[].allowedAuthors.

### bannedAuthors

```ts
bannedAuthors: string[]
```

Authors banned by EVERY ranking winner's rule (complement of
allowedAuthors over all authors seen in the run). Banned here
means banned no matter which winner is taken to production.

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time across all trades of every grid point, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time across the whole grid, minutes.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result.

### reports

```ts
reports: ISimulatorPointReport[]
```

All grid point reports, sorted descending by the schema's
reportOrder criterion (default sharpe).

### best

```ts
best: ISimulatorBest[]
```

Winners of the rankings: sharpe, sortino, pnl, recovery.
