---
title: docs/interface/OrderRejectCloseContract
group: docs
---

# OrderRejectCloseContract

Terminal rejection of a close: the exit order was definitively refused —
the engine force-closes its state with the original closeReason.
Always type "active".

## Properties

### action

```ts
action: "signal-close"
```

Discriminator for the rejected close

### closeReason

```ts
closeReason: StrategyCloseReason
```

The closeReason the engine force-closes with
