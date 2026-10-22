---
title: docs/interface/BudgetContract
group: docs
---

# BudgetContract

Contract for budget journal rows emitted by the framework.
One event per row inserted into a budget journal (`reserve`, `release`,
`reject`, `deposit`, `withdraw`) by `BudgetLocalInstance` / `BudgetPersistInstance`.
The record key (strategy, exchange, frame, backtest) plus the budget name
identify the journal; the row carries the balance AFTER it at insertion time.
Fed into `budget.jsonl` (`BudgetReportService`) and the `budget` markdown
report (`BudgetMarkdownService`); user code can listen via `listenBudget`.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy name of the run (part of the record key)

### exchangeName

```ts
exchangeName: string
```

Exchange name of the run (part of the record key)

### frameName

```ts
frameName: string
```

Frame name of the run (part of the record key; empty string in live mode)

### backtest

```ts
backtest: boolean
```

Backtest or live record (part of the record key)

### name

```ts
name: string
```

Budget name — the bucket inside the record

### symbol

```ts
symbol: string
```

Symbol that authored the row, null when the call had no symbol

### timestamp

```ts
timestamp: number
```

Logical time of the action (the row's `timestamp`, milliseconds since epoch)

### when

```ts
when: Date
```

Logical time as a `Date` instance. Backtest mode: virtual execution time;
live mode: wall-clock time of the call. Always equal to `new Date(timestamp)`.

### row

```ts
row: IBudgetHistoryRow
```

The inserted journal row (a copy) with the balance after it
