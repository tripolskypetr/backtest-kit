---
title: docs/interface/OrderFillOpenContract
group: docs
---

# OrderFillOpenContract

Broker-confirmed open fill: the position order FILLED (type "active") or the
resting entry order was PLACED (type "schedule").

## Properties

### action

```ts
action: "signal-open"
```

Discriminator for the confirmed open/placement

### cost

```ts
cost: number
```

Cost of the position (sum of entry costs)
