---
title: docs/api-reference/interface/IStrategyCallbacks
group: docs
---

# IStrategyCallbacks

Optional lifecycle callbacks for signal events.
Called when signals are opened or closed.

## Properties

### onOpen

```ts
onOpen: (backtest: boolean, symbol: string, data: ISignalRow) => void
```

Called when new signal is opened (after validation)

### onClose

```ts
onClose: (backtest: boolean, symbol: string, priceClose: number, data: ISignalRow) => void
```

Called when signal is closed with final price
