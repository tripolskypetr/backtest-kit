---
title: docs/interface/Signal$3
group: docs
---

# Signal$3

## Properties

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### _entry

```ts
_entry: { price: number; cost: number; timestamp: number; }[]
```

### _partial

```ts
_partial: { type: "profit" | "loss"; percent: number; currentPrice: number; costBasisAtClose: number; entryCountAtClose: number; timestamp: number; }[]
```
