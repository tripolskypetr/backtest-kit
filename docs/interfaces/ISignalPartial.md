---
title: docs/interface/ISignalPartial
group: docs
---

# ISignalPartial

One partial close recorded on a position (ISignalRow._partial, published as
IPublicSignalRow.partials). Appended by commitPartialProfit / commitPartialLoss
(and their *Cost variants).

## Properties

### type

```ts
type: "profit" | "loss"
```

Type of partial close: profit (moving toward TP) or loss (moving toward SL)

### percent

```ts
percent: number
```

Percentage of position closed (0-100)

### currentPrice

```ts
currentPrice: number
```

Price at which this partial was executed

### costBasisAtClose

```ts
costBasisAtClose: number
```

Running cost basis (sum of entry costs) at the moment this partial was executed,
BEFORE applying the percent reduction.
Stored as a snapshot so helpers don't need to replay the full entry history.
Effective entry price at this partial = costBasisAtClose / Σ(entry.cost/entry.price for entries[0..entryCountAtClose])

### entryCountAtClose

```ts
entryCountAtClose: number
```

Number of _entry elements at the moment this partial close was executed.
Used to slice _entry to only entries that existed at this partial.

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when this partial close was executed

### note

```ts
note: string
```

Optional human-readable description passed with the commit (e.g. "RSI &gt; 70")
