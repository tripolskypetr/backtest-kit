---
title: docs/api-reference/interface/IStrategyTickResultClosed
group: docs
---

# IStrategyTickResultClosed

Tick result: signal closed with PNL.
Final state with close reason and profit/loss calculation.

## Properties

### action

```ts
action: "closed"
```

### signal

```ts
signal: ISignalRow
```

### currentPrice

```ts
currentPrice: number
```

### closeReason

```ts
closeReason: StrategyCloseReason
```

### closeTimestamp

```ts
closeTimestamp: number
```

### pnl

```ts
pnl: IStrategyPnL
```
