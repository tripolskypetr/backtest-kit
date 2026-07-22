---
title: docs/interface/OrderFillCloseContract
group: docs
---

# OrderFillCloseContract

Broker-confirmed close fill: the exit order executed (TP/SL/time/user close).
Always type "active".

## Properties

### action

```ts
action: "signal-close"
```

Discriminator for the confirmed close

### closeReason

```ts
closeReason: StrategyCloseReason
```

Why the position was closed
