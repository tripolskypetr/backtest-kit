---
title: docs/interface/RiskEvent
group: docs
---

# RiskEvent

Risk rejection event data for report generation.
Contains all information about rejected signals due to risk limits.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds

### symbol

```ts
symbol: string
```

Trading pair symbol

### pendingSignal

```ts
pendingSignal: ISignalDto
```

Pending signal details

### strategyName

```ts
strategyName: string
```

Strategy name

### exchangeName

```ts
exchangeName: string
```

Exchange name

### currentPrice

```ts
currentPrice: number
```

Current market price

### activePositionCount

```ts
activePositionCount: number
```

Number of active positions at rejection time

### comment

```ts
comment: string
```

Rejection reason from validation note

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)
