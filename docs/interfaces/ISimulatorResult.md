---
title: docs/interface/ISimulatorResult
group: docs
---

# ISimulatorResult

Final result of a simulation run: grid reports, three ranking
winners and the trained author filter artifact.

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

### authorStats

```ts
authorStats: ISimulatorAuthorStat[]
```

Per-author track records under the ban rule of the Sharpe
winner's grid point (raw ideas/hits/hitRate are rule-independent;
the banned flag follows the winning rule).

### allowedAuthors

```ts
allowedAuthors: string[]
```

Logins of allowed authors — the production WHITELIST under the
Sharpe winner's ban rule. With default-ban semantics this is the
trained artifact to apply: in production only ideas of these
authors count.

### bannedAuthors

```ts
bannedAuthors: string[]
```

Logins of banned authors (complement of the whitelist).

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

All grid point reports, sorted by Sharpe descending.

### best

```ts
best: ISimulatorBest[]
```

Winners of the three rankings: sharpe, sortino, pnl.
