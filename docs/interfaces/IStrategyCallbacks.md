---
title: docs/api-reference/interface/IStrategyCallbacks
group: docs
---

# IStrategyCallbacks

## Properties

### onOpen

```ts
onOpen: (backtest: boolean, symbol: string, data: ISignalRow) => void
```

### onClose

```ts
onClose: (backtest: boolean, symbol: string, priceClose: number, data: ISignalRow) => void
```
