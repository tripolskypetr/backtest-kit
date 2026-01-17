---
title: docs/type/TActionCtor
group: docs
---

# TActionCtor

```ts
type TActionCtor = new (strategyName: StrategyName, frameName: FrameName, actionName: ActionName, backtest: boolean) => Partial<IPublicAction>;
```

Constructor type for action handlers with strategy context.
