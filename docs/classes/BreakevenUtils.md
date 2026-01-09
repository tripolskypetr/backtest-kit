---
title: docs/class/BreakevenUtils
group: docs
---

# BreakevenUtils

Utility class for accessing breakeven protection reports and statistics.

Provides static-like methods (via singleton instance) to retrieve data
accumulated by BreakevenMarkdownService from breakeven events.

Features:
- Statistical data extraction (total breakeven events count)
- Markdown report generation with event tables
- File export to disk

Data source:
- BreakevenMarkdownService listens to breakevenSubject
- Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
- Events include: timestamp, symbol, strategyName, signalId, position, priceOpen, currentPrice, mode

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean) => Promise<BreakevenStatisticsModel>
```

Retrieves statistical data from accumulated breakeven events.

Delegates to BreakevenMarkdownService.getData() which reads from ReportStorage.
Returns aggregated metrics calculated from all breakeven events.

### getReport

```ts
getReport: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean, columns?: Columns[]) => Promise<string>
```

Generates markdown report with all breakeven events for a symbol-strategy pair.

Creates formatted table containing:
- Symbol
- Strategy
- Signal ID
- Position (LONG/SHORT)
- Entry Price
- Breakeven Price
- Timestamp (ISO 8601)
- Mode (Backtest/Live)

Also includes summary statistics at the end.

### dump

```ts
dump: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest?: boolean, path?: string, columns?: Columns[]) => Promise<void>
```

Generates and saves markdown report to file.

Creates directory if it doesn't exist.
Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")

Delegates to BreakevenMarkdownService.dump() which:
1. Generates markdown report via getReport()
2. Creates output directory (recursive mkdir)
3. Writes file with UTF-8 encoding
4. Logs success/failure to console
