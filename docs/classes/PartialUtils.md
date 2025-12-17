---
title: docs/api-reference/class/PartialUtils
group: docs
---

# PartialUtils

Utility class for accessing partial profit/loss reports and statistics.

Provides static-like methods (via singleton instance) to retrieve data
accumulated by PartialMarkdownService from partial profit/loss events.

Features:
- Statistical data extraction (total profit/loss events count)
- Markdown report generation with event tables
- File export to disk

Data source:
- PartialMarkdownService listens to partialProfitSubject/partialLossSubject
- Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
- Events include: timestamp, action, symbol, strategyName, signalId, position, level, price, mode

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: (symbol: string, strategyName: string) => Promise<PartialStatisticsModel>
```

Retrieves statistical data from accumulated partial profit/loss events.

Delegates to PartialMarkdownService.getData() which reads from ReportStorage.
Returns aggregated metrics calculated from all profit and loss events.

### getReport

```ts
getReport: (symbol: string, strategyName: string, columns?: Columns$1[]) => Promise<string>
```

Generates markdown report with all partial profit/loss events for a symbol-strategy pair.

Creates formatted table containing:
- Action (PROFIT/LOSS)
- Symbol
- Strategy
- Signal ID
- Position (LONG/SHORT)
- Level % (+10%, -20%, etc)
- Current Price
- Timestamp (ISO 8601)
- Mode (Backtest/Live)

Also includes summary statistics at the end.

### dump

```ts
dump: (symbol: string, strategyName: string, path?: string, columns?: Columns$1[]) => Promise<void>
```

Generates and saves markdown report to file.

Creates directory if it doesn't exist.
Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")

Delegates to PartialMarkdownService.dump() which:
1. Generates markdown report via getReport()
2. Creates output directory (recursive mkdir)
3. Writes file with UTF-8 encoding
4. Logs success/failure to console
