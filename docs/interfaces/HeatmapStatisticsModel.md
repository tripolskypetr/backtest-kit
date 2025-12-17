---
title: docs/api-reference/interface/HeatmapStatisticsModel
group: docs
---

# HeatmapStatisticsModel

Portfolio heatmap statistics structure.
Contains aggregated data for all symbols in the portfolio.

## Properties

### symbols

```ts
symbols: IHeatmapRow[]
```

Array of symbol statistics

### totalSymbols

```ts
totalSymbols: number
```

Total number of symbols tracked

### portfolioTotalPnl

```ts
portfolioTotalPnl: number
```

Portfolio-wide total PNL

### portfolioSharpeRatio

```ts
portfolioSharpeRatio: number
```

Portfolio-wide Sharpe Ratio

### portfolioTotalTrades

```ts
portfolioTotalTrades: number
```

Portfolio-wide total trades
