---
title: docs/api-reference/interface/RiskContract
group: docs
---

# RiskContract

Contract for risk rejection events.

Emitted by riskSubject ONLY when a signal is REJECTED due to risk validation failure.
Used for tracking actual risk violations and monitoring rejected signals.

Events are emitted only when risk limits are violated (not for allowed signals).
This prevents spam and allows focusing on actual risk management interventions.

Consumers:
- RiskMarkdownService: Accumulates rejection events for report generation
- User callbacks via listenRisk() / listenRiskOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this rejected signal belongs to.

### pendingSignal

```ts
pendingSignal: ISignalDto
```

Pending signal to apply.
Contains signal details (position, priceOpen, priceTakeProfit, priceStopLoss, etc).

### strategyName

```ts
strategyName: string
```

Strategy name requesting to open a position.
Identifies which strategy attempted to create the signal.

### exchangeName

```ts
exchangeName: string
```

Exchange name.
Identifies which exchange this signal was for.

### currentPrice

```ts
currentPrice: number
```

Current VWAP price at the time of rejection.
Market price when risk check was performed.

### activePositionCount

```ts
activePositionCount: number
```

Number of currently active positions across all strategies at rejection time.
Used to track portfolio-level exposure when signal was rejected.

### comment

```ts
comment: string
```

Comment describing why the signal was rejected.
Captured from IRiskValidation.note or "N/A" if not provided.

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds since Unix epoch.
Represents when the signal was rejected.
