---
title: docs/class/StrategyUtils
group: docs
---

# StrategyUtils

Utility class for accessing strategy management reports and statistics.

Provides static-like methods (via singleton instance) to retrieve data
accumulated by StrategyMarkdownService from strategy management events.

Features:
- Statistical data extraction (event counts by action type)
- Markdown report generation with event tables
- File export to disk

Data source:
- StrategyMarkdownService receives events via direct method calls
- Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
- Events include: cancel-scheduled, close-pending, partial-profit, partial-loss,
  trailing-stop, trailing-take, breakeven

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<StrategyStatisticsModel>
```

Retrieves statistical data from accumulated strategy events.

Delegates to StrategyMarkdownService.getData() which reads from ReportStorage.
Returns aggregated metrics calculated from all strategy events.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean, columns?: Columns[]) => Promise<string>
```

Generates markdown report with all strategy events for a symbol-strategy pair.

Creates formatted table containing:
- Symbol
- Strategy
- Signal ID
- Action (cancel-scheduled, close-pending, partial-profit, etc.)
- Price
- Percent values (% To Close, % Shift)
- Cancel/Close IDs
- Timestamp (ISO 8601)
- Mode (Backtest/Live)

Also includes summary statistics at the end with counts by action type.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean, path?: string, columns?: Columns[]) => Promise<void>
```

Generates and saves markdown report to file.

Creates directory if it doesn't exist.
Filename format: {symbol}_{strategyName}_{exchangeName}_{frameName&vert;live}-{timestamp}.md

Delegates to StrategyMarkdownService.dump() which:
1. Generates markdown report via getReport()
2. Creates output directory (recursive mkdir)
3. Writes file with UTF-8 encoding
4. Logs success/failure to console
