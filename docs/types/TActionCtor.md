---
title: docs/type/TActionCtor
group: docs
---

# TActionCtor

```ts
type TActionCtor = new (strategyName: StrategyName, frameName: FrameName, actionName: ActionName) => Partial<IPublicAction>;
```

Constructor type for action handlers with strategy context.
