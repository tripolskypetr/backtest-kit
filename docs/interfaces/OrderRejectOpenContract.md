---
title: docs/interface/OrderRejectOpenContract
group: docs
---

# OrderRejectOpenContract

Terminal rejection of an open: the position order (type "active") or the
resting entry placement (type "schedule") was definitively refused — the
trade attempt is dropped and its signalId consumed.

## Properties

### action

```ts
action: "signal-open"
```

Discriminator for the rejected open/placement

### cost

```ts
cost: number
```

Cost of the position (sum of entry costs)
