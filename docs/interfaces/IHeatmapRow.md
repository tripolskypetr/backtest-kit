---
title: docs/api-reference/interface/IHeatmapRow
group: docs
---

# IHeatmapRow

Portfolio heatmap statistics for a single symbol.
Aggregated metrics across all strategies for one trading pair.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### totalPnl

```ts
totalPnl: number
```

Total profit/loss percentage across all closed trades

### sharpeRatio

```ts
sharpeRatio: number
```

Risk-adjusted return (Sharpe Ratio)

### maxDrawdown

```ts
maxDrawdown: number
```

Maximum drawdown percentage (largest peak-to-trough decline)

### totalTrades

```ts
totalTrades: number
```

Total number of closed trades

### winCount

```ts
winCount: number
```

Number of winning trades

### lossCount

```ts
lossCount: number
```

Number of losing trades

### winRate

```ts
winRate: number
```

Win rate percentage

### avgPnl

```ts
avgPnl: number
```

Average PNL per trade

### stdDev

```ts
stdDev: number
```

Standard deviation of PNL

### profitFactor

```ts
profitFactor: number
```

Profit factor: sum of wins / sum of losses

### avgWin

```ts
avgWin: number
```

Average profit percentage on winning trades

### avgLoss

```ts
avgLoss: number
```

Average loss percentage on losing trades

### maxWinStreak

```ts
maxWinStreak: number
```

Maximum consecutive winning trades

### maxLossStreak

```ts
maxLossStreak: number
```

Maximum consecutive losing trades

### expectancy

```ts
expectancy: number
```

Expectancy: (winRate * avgWin) - (lossRate * avgLoss)
