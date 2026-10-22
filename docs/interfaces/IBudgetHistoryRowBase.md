---
title: docs/interface/IBudgetHistoryRowBase
group: docs
---

# IBudgetHistoryRowBase

Fields shared by every journal row. strategyName, exchangeName, frameName and
backtest are the record key and are not repeated on rows.

## Properties

### timestamp

```ts
timestamp: number
```

Logical time of the action (`when` of the call that produced it)

### symbol

```ts
symbol: string
```

Symbol that authored the row, null when the call had no symbol

### seq

```ts
seq: number
```

Insertion order — the last tie-break of the journal order (timestamp, symbol, seq)

### balance

```ts
balance: IBudgetRowBalance
```

Balance after this row
