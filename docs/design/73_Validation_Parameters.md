# Validation Parameters


This document describes the global validation parameters that control financial safety constraints in signal generation. These parameters enforce minimum take profit distances, maximum stop loss distances, and signal lifetime limits to protect capital from unprofitable trades, catastrophic losses, and strategy deadlock.

For information about other configuration parameters like timeout and timing constraints, see [Timing Parameters](./74_Timing_Parameters.md). For an overview of the configuration system, see [Global Configuration](./72_Global_Configuration.md). For details on how signals are validated during generation, see [Signal Generation and Validation](./46_Signal_Generation_and_Validation.md).

---

## Overview of Validation Parameters

The framework enforces three critical validation parameters that act as financial guardrails during signal generation. These parameters are part of `GLOBAL_CONFIG` and can be modified via `setConfig()` at runtime.

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | number | 0.1 | Minimum percentage distance between `priceOpen` and `priceTakeProfit` to ensure profit exceeds trading fees |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | number | 20 | Maximum percentage distance between `priceOpen` and `priceStopLoss` to prevent catastrophic losses |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | number | 1440 | Maximum signal duration in minutes to prevent eternal signals blocking risk limits |

These validations occur in the `VALIDATE_SIGNAL_FN` function within `ClientStrategy`, which is called before every signal is created. Signals that fail validation are rejected immediately with descriptive error messages.

**Sources:** [src/config/params.ts:1-36](), [src/client/ClientStrategy.ts:40-185]()

---

## Take Profit Distance Validation

### Problem Statement

Trading fees (typically 0.1% per side) create a minimum profit threshold. If `priceTakeProfit` is too close to `priceOpen`, the gross profit will be consumed by fees, resulting in a net loss despite hitting the take profit target.

**Example Scenario:**
- Long position: `priceOpen = 42000`, `priceTakeProfit = 42010` (0.024% profit)
- Fees: 2 × 0.1% = 0.2% total
- Net PNL: 0.024% - 0.2% = **-0.176% loss**

### Validation Logic

![Mermaid Diagram](./diagrams/73_Validation_Parameters_0.svg)

**Diagram: Take Profit Distance Validation Flow**

The validation calculates the percentage distance between entry price and take profit target, then compares it against `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT`. For long positions, TP must be above entry. For short positions, TP must be below entry.

**Long Position Validation** (lines 87-97):
```typescript
const tpDistancePercent = ((signal.priceTakeProfit - signal.priceOpen) / signal.priceOpen) * 100;
if (tpDistancePercent < GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
  errors.push(`Long: TakeProfit too close to priceOpen...`);
}
```

**Short Position Validation** (lines 127-137):
```typescript
const tpDistancePercent = ((signal.priceOpen - signal.priceTakeProfit) / signal.priceOpen) * 100;
if (tpDistancePercent < GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) {
  errors.push(`Short: TakeProfit too close to priceOpen...`);
}
```

### Default Value Justification

The default value of `0.1%` is intentionally conservative:
- Covers standard exchange fees: 2 × 0.1% = 0.2% total
- Provides small profit margin after fees
- Can be increased to enforce larger minimum profits
- Can be set to `0` to disable validation (not recommended for production)

**Sources:** [src/client/ClientStrategy.ts:87-137](), [src/config/params.ts:12-17](), [test/e2e/sanitize.test.mjs:27-131]()

---

## Stop Loss Distance Validation

### Problem Statement

Excessively wide stop losses can expose the portfolio to catastrophic single-trade losses. A stop loss positioned 50% below entry would lose half the position size in one trade, potentially destroying the strategy's expected value.

**Example Scenario:**
- Long position: `priceOpen = 42000`, `priceStopLoss = 20000` (52.4% loss)
- With 10% position sizing: -5.24% portfolio loss on one signal
- After 4 consecutive stop loss hits: portfolio down -20%

### Validation Logic

![Mermaid Diagram](./diagrams/73_Validation_Parameters_1.svg)

**Diagram: Stop Loss Distance Validation Flow**

The validation calculates the percentage distance between entry price and stop loss target, then compares it against `CC_MAX_STOPLOSS_DISTANCE_PERCENT`. For long positions, SL must be below entry. For short positions, SL must be above entry.

**Long Position Validation** (lines 100-110):
```typescript
const slDistancePercent = ((signal.priceOpen - signal.priceStopLoss) / signal.priceOpen) * 100;
if (slDistancePercent > GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
  errors.push(`Long: StopLoss too far from priceOpen...`);
}
```

**Short Position Validation** (lines 140-150):
```typescript
const slDistancePercent = ((signal.priceStopLoss - signal.priceOpen) / signal.priceOpen) * 100;
if (slDistancePercent > GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
  errors.push(`Short: StopLoss too far from priceOpen...`);
}
```

### Default Value Justification

The default value of `20%` represents a reasonable maximum loss per signal:
- Prevents single-trade portfolio destruction
- Allows flexibility for volatile markets
- Enforces risk discipline at the signal level
- Can be tightened to `5-10%` for conservative strategies
- Should not be disabled (set to `100+%`) in production

**Sources:** [src/client/ClientStrategy.ts:100-150](), [src/config/params.ts:18-23](), [test/e2e/sanitize.test.mjs:143-238]()

---

## Signal Lifetime Validation

### Problem Statement

Signals with excessively long `minuteEstimatedTime` can create strategy deadlock by occupying risk limits indefinitely. If a signal expects to remain active for 30+ days, it blocks new signals from being generated, effectively freezing the strategy.

**Example Scenario:**
- Signal with `minuteEstimatedTime = 50000` minutes (34.7 days)
- Risk profile allows `maxConcurrentPositions = 3`
- After 3 such signals open: strategy cannot generate new signals for weeks
- Strategy becomes non-responsive to market changes

### Validation Logic

![Mermaid Diagram](./diagrams/73_Validation_Parameters_2.svg)

**Diagram: Signal Lifetime Validation Flow**

The validation compares `minuteEstimatedTime` directly against `CC_MAX_SIGNAL_LIFETIME_MINUTES`. Error messages include human-readable day conversions for clarity.

**Validation Implementation** (lines 161-171):
```typescript
if (signal.minuteEstimatedTime > GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
  const days = (signal.minuteEstimatedTime / 60 / 24).toFixed(1);
  const maxDays = (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES / 60 / 24).toFixed(0);
  errors.push(
    `minuteEstimatedTime too large (${signal.minuteEstimatedTime} minutes = ${days} days). ` +
    `Maximum: ${GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES} minutes (${maxDays} days) to prevent strategy deadlock. ` +
    `Eternal signals block risk limits and prevent new trades.`
  );
}
```

### Default Value Justification

The default value of `1440 minutes` (1 day):
- Balances flexibility with risk management
- Prevents week-long signals from blocking strategy execution
- Aligns with typical intraday/swing trading timeframes
- Can be increased for longer-term strategies (e.g., 10080 minutes = 1 week)
- Should not be disabled (set to `999999`) in production

**Sources:** [src/client/ClientStrategy.ts:161-171](), [src/config/params.ts:24-30](), [test/e2e/sanitize.test.mjs:250-348]()

---

## Complete Validation Flow

The following diagram shows how validation parameters integrate into the signal generation pipeline:

![Mermaid Diagram](./diagrams/73_Validation_Parameters_3.svg)

**Diagram: Complete Signal Validation Flow with Validation Parameters**

The validation occurs in `VALIDATE_SIGNAL_FN` at [src/client/ClientStrategy.ts:40-185](). The function accumulates all validation errors into an array, then throws a single descriptive error if any validations fail. This provides comprehensive feedback to strategy developers.

**Key Validation Stages:**

1. **Price Sanity Checks** (lines 43-71): Validates that all prices are finite, positive numbers
2. **Position Logic Checks** (lines 74-151): Ensures TP/SL are on correct side of entry for long/short
3. **TP Distance Validation** (lines 87-97, 127-137): Uses `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT`
4. **SL Distance Validation** (lines 100-110, 140-150): Uses `CC_MAX_STOPLOSS_DISTANCE_PERCENT`
5. **Lifetime Validation** (lines 161-171): Uses `CC_MAX_SIGNAL_LIFETIME_MINUTES`
6. **Error Aggregation** (lines 180-184): Throws single error with all validation failures

**Sources:** [src/client/ClientStrategy.ts:40-185](), [src/client/ClientStrategy.ts:187-283]()

---

## Configuration via setConfig

Validation parameters can be modified at runtime using the `setConfig()` function. This is typically done during initialization or in test environments.

### Configuration Syntax

```typescript
import { setConfig } from 'backtest-kit';

setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.5,  // Require 0.5% minimum profit
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 10,     // Allow max 10% stop loss
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 720,       // Max 12 hours per signal
});
```

### Configuration Patterns

| Use Case | Configuration | Rationale |
|----------|---------------|-----------|
| **Disable Validation (Testing)** | Set to `0`, `100`, `999999` respectively | Allows testing edge cases without validation constraints |
| **Conservative Trading** | Set to `0.5%`, `5%`, `360 min` | Tighter constraints for risk-averse strategies |
| **Volatile Markets** | Set to `0.2%`, `30%`, `2880 min` | Looser constraints for high-volatility assets |
| **Long-term Holding** | Set to `1%`, `20%`, `10080 min` | Allow multi-day positions with wider stops |

### Test Environment Configuration

Test files disable validation by default to isolate signal logic testing from validation constraints:

```typescript
// test/config/setup.mjs
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0,      // No TP distance check
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100,      // Allow any SL
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,     // No lifetime limit
});
```

Specific validation tests override these defaults:

```typescript
// test/e2e/sanitize.test.mjs
test("Micro-profit validation", async () => {
  setConfig({
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // Enable TP validation
  });
  // ... test code
});
```

**Sources:** [test/config/setup.mjs:36-41](), [test/e2e/sanitize.test.mjs:30-32](), [test/e2e/sanitize.test.mjs:146-148]()

---

## Validation Error Messages

Validation failures produce detailed error messages that help strategy developers diagnose issues:

### Take Profit Error Message Format

```
Long: TakeProfit too close to priceOpen (0.024%). 
Minimum distance: 0.3% to cover trading fees. 
Current: TP=42010, Open=42000
```

### Stop Loss Error Message Format

```
Long: StopLoss too far from priceOpen (52.381%). 
Maximum distance: 20% to protect capital. 
Current: SL=20000, Open=42000
```

### Signal Lifetime Error Message Format

```
minuteEstimatedTime too large (50000 minutes = 34.7 days). 
Maximum: 1440 minutes (1 days) to prevent strategy deadlock. 
Eternal signals block risk limits and prevent new trades.
```

### Error Aggregation

Multiple validation failures are combined into a single error message:

```
Invalid signal for long position:
Long: TakeProfit too close to priceOpen (0.024%). Minimum distance: 0.3% to cover trading fees. Current: TP=42010, Open=42000
Long: StopLoss too far from priceOpen (52.381%). Maximum distance: 20% to protect capital. Current: SL=20000, Open=42000
minuteEstimatedTime too large (50000 minutes = 34.7 days). Maximum: 1440 minutes (1 days) to prevent strategy deadlock. Eternal signals block risk limits and prevent new trades.
```

This comprehensive error output allows developers to fix all validation issues in a single iteration.

**Sources:** [src/client/ClientStrategy.ts:180-184]()

---

## Default Values and Trade-offs

The table below summarizes default values, their safety guarantees, and when to adjust them:

| Parameter | Default | Safety Guarantee | When to Increase | When to Decrease |
|-----------|---------|-----------------|------------------|------------------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.1% | Prevents fee-eating micro-profits | Higher fee exchanges (0.2%+) | Lower fee exchanges or maker rebates |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Prevents catastrophic single-trade losses | High-volatility assets (crypto, meme coins) | Stable assets, conservative risk appetite |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 (1 day) | Prevents strategy deadlock from eternal signals | Swing trading (1 week), position trading (1 month) | Intraday strategies (2-4 hours) |

### Interaction with Risk Management

These validation parameters work in conjunction with risk profile limits (see [Risk Profiles](./64_Risk_Profiles.md)):

![Mermaid Diagram](./diagrams/73_Validation_Parameters_4.svg)

**Diagram: Validation Parameters as First Line of Defense**

Validation parameters act as the first line of defense, rejecting signals before they reach the risk management layer. This prevents invalid signals from consuming risk limit slots or triggering custom validations.

**Sources:** [src/config/params.ts:1-36](), [src/client/ClientStrategy.ts:40-185](), [test/e2e/sanitize.test.mjs:1-660](), [test/e2e/defend.test.mjs:1-1100]()