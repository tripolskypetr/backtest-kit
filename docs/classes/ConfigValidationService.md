---
title: docs/api-reference/class/ConfigValidationService
group: docs
---

# ConfigValidationService

Service for validating GLOBAL_CONFIG parameters to ensure mathematical correctness
and prevent unprofitable trading configurations.

Performs comprehensive validation on:
- **Percentage parameters**: Slippage, fees, and profit margins must be non-negative
- **Economic viability**: Ensures CC_MIN_TAKEPROFIT_DISTANCE_PERCENT covers all trading costs
  (slippage + fees) to guarantee profitable trades when TakeProfit is hit
- **Range constraints**: Validates MIN &lt; MAX relationships (e.g., StopLoss distances)
- **Time-based parameters**: Ensures positive integer values for timeouts and lifetimes
- **Candle parameters**: Validates retry counts, delays, and anomaly detection thresholds

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### validate

```ts
validate: () => void
```

Validates GLOBAL_CONFIG parameters for mathematical correctness.

Checks:
1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT must cover slippage + fees
2. All percentage values must be positive
3. Time/count values must be positive integers
