---
title: docs/interface/ISimulatorPointReport
group: docs
---

# ISimulatorPointReport

Aggregated metrics of one grid point (production slot semantics).

## Properties

### point

```ts
point: ISimulatorGridPoint
```

The grid point these metrics belong to.

### trades

```ts
trades: number
```

Number of simulated trades.

### skippedBusy

```ts
skippedBusy: number
```

Qualified ideas skipped because the position slot was busy.

### totalPnlPercent

```ts
totalPnlPercent: number
```

Sum of trade PnL percents over the range.

### avgPnlPercent

```ts
avgPnlPercent: number
```

Mean trade PnL, percent.

### winRate

```ts
winRate: number
```

Share of profitable trades, 0..1.

### profitFactor

```ts
profitFactor: number
```

Gross profit divided by gross loss; Infinity when no losses.

### maxSeriesDrawdownPercent

```ts
maxSeriesDrawdownPercent: number
```

Maximum drawdown of the cumulative trade PnL curve, percent.

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time per trade, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time, minutes — spots eternal holds.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time, minutes — spots eternal holds.

### sharpe

```ts
sharpe: number
```

Time-based Sharpe: mean/std * sqrt(days) over DAILY equity
increments of the whole simulated range (idle days included,
realized PnL booked on the exit day). Penalizes dead holding
time — frozen capital is not free.

### sortino

```ts
sortino: number
```

Time-based Sortino: like sharpe but deviation is computed over
negative daily increments only; 999 when no losing days.

### exitReasons

```ts
exitReasons: Record<SimulatorExitReason, number>
```

Trade counts per exit reason.
