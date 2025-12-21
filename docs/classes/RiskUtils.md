---
title: docs/class/RiskUtils
group: docs
---

# RiskUtils

Utility class for accessing risk rejection reports and statistics.

Provides static-like methods (via singleton instance) to retrieve data
accumulated by RiskMarkdownService from risk rejection events.

Features:
- Statistical data extraction (total rejections count, by symbol, by strategy)
- Markdown report generation with event tables
- File export to disk

Data source:
- RiskMarkdownService listens to riskSubject
- Accumulates rejection events in ReportStorage (max 250 events per symbol-strategy pair)
- Events include: timestamp, symbol, strategyName, position, exchangeName, price, activePositionCount, comment

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (symbol: string, strategyName: string, backtest: boolean) => Promise<RiskStatisticsModel>
```

Retrieves statistical data from accumulated risk rejection events.

Delegates to RiskMarkdownService.getData() which reads from ReportStorage.
Returns aggregated metrics calculated from all rejection events.

### getReport

```ts
getReport: (symbol: string, strategyName: string, backtest: boolean, columns?: Columns[]) => Promise<string>
```

Generates markdown report with all risk rejection events for a symbol-strategy pair.

Creates formatted table containing:
- Symbol
- Strategy
- Position (LONG/SHORT)
- Exchange
- Price
- Active Positions (at rejection time)
- Reason (from validation note)
- Timestamp (ISO 8601)

Also includes summary statistics at the end (total rejections, by symbol, by strategy).

### dump

```ts
dump: (symbol: string, strategyName: string, backtest: boolean, path?: string, columns?: Columns[]) => Promise<void>
```

Generates and saves markdown report to file.

Creates directory if it doesn't exist.
Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")

Delegates to RiskMarkdownService.dump() which:
1. Generates markdown report via getReport()
2. Creates output directory (recursive mkdir)
3. Writes file with UTF-8 encoding
4. Logs success/failure to console
