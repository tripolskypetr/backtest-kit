---
title: docs/type/TSessionInstanceCtor
group: docs
---

# TSessionInstanceCtor

```ts
type TSessionInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ISessionInstance;
```

Constructor type for session instance implementations.
Used for swapping backends via SessionBacktestAdapter / SessionLiveAdapter.
