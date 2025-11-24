---
title: docs/api-reference/class/HeatUtils
group: docs
---

# HeatUtils

Utility class for portfolio heatmap operations.

Provides simplified access to heatMarkdownService with logging.
Automatically aggregates statistics across all symbols per strategy.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (strategyName: string) => Promise<IHeatmapStatistics>
```

Gets aggregated portfolio heatmap statistics for a strategy.

Returns per-symbol breakdown and portfolio-wide metrics.
Data is automatically collected from all closed signals for the strategy.

### getReport

```ts
getReport: (strategyName: string) => Promise<string>
```

Generates markdown report with portfolio heatmap table for a strategy.

Table includes: Symbol, Total PNL, Sharpe Ratio, Max Drawdown, Trades.
Symbols are sorted by Total PNL descending.

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves heatmap report to disk for a strategy.

Creates directory if it doesn't exist.
Default filename: {strategyName}.md
