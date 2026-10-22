---
title: docs/interface/ISignalEntry
group: docs
---

# ISignalEntry

One DCA entry recorded on a position (ISignalRow._entry, published as
IPublicSignalRow.entries). The first element is the original entry; the
rest are appended by commitAverageBuy.

## Properties

### price

```ts
price: number
```

Price at which this entry was executed

### cost

```ts
cost: number
```

Cost of this entry in USD (e.g. 100 for $100 position)

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when this entry was executed

### note

```ts
note: string
```

Optional human-readable description passed with the commit (e.g. "ladder step 2")
