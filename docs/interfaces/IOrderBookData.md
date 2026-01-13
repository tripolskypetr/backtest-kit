---
title: docs/interface/IOrderBookData
group: docs
---

# IOrderBookData

Order book data containing bids and asks.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol

### bids

```ts
bids: IBidData[]
```

Array of bid orders (buy orders)

### asks

```ts
asks: IBidData[]
```

Array of ask orders (sell orders)
