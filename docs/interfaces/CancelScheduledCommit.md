---
title: docs/interface/CancelScheduledCommit
group: docs
---

# CancelScheduledCommit

Cancel scheduled signal event.

## Properties

### action

```ts
action: "cancel-scheduled"
```

Discriminator for cancel-scheduled action

### cancelId

```ts
cancelId: string
```

Optional identifier for the cancellation reason (user-provided)

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
