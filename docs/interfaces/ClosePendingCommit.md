---
title: docs/interface/ClosePendingCommit
group: docs
---

# ClosePendingCommit

Close pending signal event.

## Properties

### action

```ts
action: "close-pending"
```

Discriminator for close-pending action

### closeId

```ts
closeId: string
```

Optional identifier for the close reason (user-provided)

### pnl

```ts
pnl: IStrategyPnL
```

Total PNL of the closed position (including all entries and partials)

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment this public signal was created

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment this public signal was created
