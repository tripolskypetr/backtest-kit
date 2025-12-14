---
title: design/27_economic-viability-and-validation
group: design
---

# Economic Viability and Validation

## Purpose and Scope

This document explains the framework's configuration validation system that ensures trading strategies are economically viable before execution. It covers the cost model (slippage and fees), minimum profit requirements, the `ConfigValidationService` implementation, and validation rules that prevent unprofitable or dangerous configurations.

For signal-level risk validation, see [Risk Management](./14-risk-management.md). For a complete catalog of configuration parameters, see [Global Configuration Parameters](./26-global-configuration-parameters.md). For the configuration API, see [Configuration API](./28-configuration-api.md).

---

## Economic Viability Problem

Trading strategies must account for execution costs. Without validation, users may configure strategies that appear profitable in theory but lose money after costs.

### Cost Components

| Cost Component | Default Value | Application | Impact |
|----------------|---------------|-------------|--------|
| `CC_PERCENT_SLIPPAGE` | 0.1% | Applied twice (entry + exit) | 0.2% total |
| `CC_PERCENT_FEE` | 0.1% | Applied twice (entry + exit) | 0.2% total |
| **Total Cost** | - | - | **0.4%** |

Every trade incurs these costs regardless of direction (long/short) or outcome (profit/loss). A signal with `priceTakeProfit` only 0.3% away from `priceOpen` will result in a net loss even when the take-profit is hit.

### Example: Unprofitable Configuration

```typescript
// DANGEROUS: This signal loses money even when TP is hit
{
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 42100,  // Only 0.238% profit
  priceStopLoss: 41000,
  minuteEstimatedTime: 60
}

// After costs:
// - Slippage effect: 0.2% (42000 * 1.001 entry, 42100 * 0.999 exit)
// - Fees: 0.2% (0.1% * 2 transactions)
// - Net PNL: -0.176% (LOSS despite hitting TP!)
```

---

## Cost Calculation Model

![Mermaid Diagram](./diagrams\27-economic-viability-and-validation_0.svg)

### Implementation: toProfitLossDto
```typescript
// Simplified excerpt showing cost application
if (signal.position === "long") {
  // LONG: buy higher, sell lower (worse execution)
  priceOpenWithSlippage = priceOpen * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  priceCloseWithSlippage = priceClose * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
} else {
  // SHORT: sell lower, buy higher (worse execution)
  priceOpenWithSlippage = priceOpen * (1 - GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
  priceCloseWithSlippage = priceClose * (1 + GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100);
}

const totalFee = GLOBAL_CONFIG.CC_PERCENT_FEE * 2;  // Entry + exit
pnlPercentage -= totalFee;  // Subtract fees from calculated PNL
```

---

## ConfigValidationService

The `ConfigValidationService` validates `GLOBAL_CONFIG` on every `setConfig()` call to prevent unprofitable or dangerous configurations.

### Architecture

![Mermaid Diagram](./diagrams\27-economic-viability-and-validation_1.svg)

### Validation Categories

#### 1. Economic Viability Check

**Core Logic** [src/lib/services/validation/ConfigValidationService.ts:69-88]()

```typescript
// Calculate minimum required TP distance to cover costs
const slippageEffect = GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE * 2;  // 0.2%
const feesTotal = GLOBAL_CONFIG.CC_PERCENT_FEE * 2;            // 0.2%
const minRequiredTpDistance = slippageEffect + feesTotal;       // 0.4%

if (GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT < minRequiredTpDistance) {
  errors.push(
    `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (${GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT}%) ` +
    `is too low to cover trading costs.\n` +
    `  Required minimum: ${minRequiredTpDistance.toFixed(2)}%\n` +
    `  Breakdown:\n` +
    `    - Slippage effect: ${slippageEffect.toFixed(2)}%\n` +
    `    - Fees: ${feesTotal.toFixed(2)}%\n` +
    `  All TakeProfit signals will be unprofitable with current settings!`
  );
}
```

This ensures that `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` (default 0.5%) is greater than total costs (0.4%), guaranteeing a minimum 0.1% profit buffer.

#### 2. Percentage Parameter Validation

| Parameter | Constraint | Reason |
|-----------|-----------|---------|
| `CC_PERCENT_SLIPPAGE` | ≥ 0, finite | Negative slippage is nonsensical |
| `CC_PERCENT_FEE` | ≥ 0, finite | Negative fees don't exist |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | > 0, ≥ costs | Must cover execution costs |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | > 0 | Prevents instant stop-out |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | > 0 | Prevents catastrophic losses |

#### 3. Range Constraint Validation
```typescript
// Validate that MIN < MAX for StopLoss
if (GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT >= 
    GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) {
  errors.push(
    `CC_MIN_STOPLOSS_DISTANCE_PERCENT must be less than ` +
    `CC_MAX_STOPLOSS_DISTANCE_PERCENT`
  );
}
```

Prevents configurations like `MIN_SL=10%, MAX_SL=5%` which create impossible constraints.

#### 4. Integer and Time Validation

| Parameter | Type | Constraint | Default |
|-----------|------|-----------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | integer | > 0 | 120 |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | integer | > 0 | 1440 |
| `CC_MAX_SIGNAL_GENERATION_SECONDS` | integer | > 0 | 180 |
| `CC_AVG_PRICE_CANDLES_COUNT` | integer | > 0 | 5 |
| `CC_GET_CANDLES_RETRY_COUNT` | integer | ≥ 0 | 3 |
| `CC_GET_CANDLES_RETRY_DELAY_MS` | integer | ≥ 0 | 5000 |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` | integer | > 0 | 1000 |
| `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | integer | > 0 | 5 |

---

## Validation Flow

![Mermaid Diagram](./diagrams\27-economic-viability-and-validation_2.svg)

### Error Output Example

```
GLOBAL_CONFIG validation failed:
  1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low to cover trading costs.
     Required minimum: 0.40%
     Breakdown:
       - Slippage effect: 0.20% (0.1% × 2 transactions)
       - Fees: 0.20% (0.1% × 2 transactions)
     All TakeProfit signals will be unprofitable with current settings!
```

---

## Safety Tests: Sanitize Suite

The sanitize test suite [test/e2e/sanitize.test.mjs:1-1507]() validates that dangerous configurations are rejected before execution.

### Critical Test Categories

![Mermaid Diagram](./diagrams\27-economic-viability-and-validation_3.svg)

### Test 1: Micro-Profit Protection
**Scenario:** Signal with `priceTakeProfit=42010, priceOpen=42000` (0.024% profit)

**Expected Behavior:** Rejected by validation (not scheduled or opened)

**Cost Analysis:**
- Raw profit: 0.024%
- Slippage: -0.2%
- Fees: -0.2%
- **Net PNL: -0.376% (LOSS)**

**Validation:** `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3%` blocks this signal.

### Test 2: Extreme StopLoss Protection
**Scenario:** `priceOpen=42000, priceStopLoss=20000` (52% risk per signal)

**Expected Behavior:** Rejected to prevent portfolio destruction

**Protection:** `CC_MAX_STOPLOSS_DISTANCE_PERCENT: 20%` (default) limits risk per signal.

### Test 3: Excessive Lifetime Protection
**Scenario:** `minuteEstimatedTime=50000` (34+ days)

**Problem:** Signal blocks risk limits for weeks, preventing new trades

**Protection:** `CC_MAX_SIGNAL_LIFETIME_MINUTES: 43200` (30 days default) prevents strategy deadlock.

### Test 4-5: Price Sanity Checks

| Test | Scenario | Validation |
|------|----------|------------|
| Negative prices | `priceOpen=-42000` | Rejected (impossible in crypto markets) |
| NaN/Infinity | `priceOpen=NaN` or `priceTakeProfit=Infinity` | Rejected (breaks all calculations) |

### Test 6: Incomplete Candle Detection
**Problem:** Binance API sometimes returns incomplete candles with anomalously low prices (e.g., `open=0.1` instead of `42000`).

**Detection:** `VALIDATE_NO_INCOMPLETE_CANDLES_FN` compares prices against reference price (median or average).

**Threshold:** `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: 1000` (price must be > referencePrice / 1000)

**Example:**
- Normal BTC price: $42,000
- Anomalous candle: $0.1 (420,000× too low)
- Threshold: $42 (42000/1000)
- Result: $0.1 < $42 → **Rejected**

---

## Configuration Validation Mapping

![Mermaid Diagram](./diagrams\27-economic-viability-and-validation_4.svg)

---

## Usage Examples

### Valid Configuration

```typescript
import { setConfig } from 'backtest-kit';

// This passes validation (TP covers costs + buffer)
setConfig({
  CC_PERCENT_SLIPPAGE: 0.1,      // 0.2% total effect
  CC_PERCENT_FEE: 0.1,            // 0.2% total
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.5,  // > 0.4% costs ✓
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 15,     // Reasonable risk limit
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 2880,     // 2 days max
});
```

### Invalid Configuration (Rejected)

```typescript
// This throws error: TP too low to cover costs
setConfig({
  CC_PERCENT_SLIPPAGE: 0.1,
  CC_PERCENT_FEE: 0.1,
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // < 0.4% costs ✗
});
// Error: CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low...
```

```typescript
// This throws error: MIN > MAX
setConfig({
  CC_MIN_STOPLOSS_DISTANCE_PERCENT: 25,
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 10,  // MIN > MAX ✗
});
// Error: CC_MIN_STOPLOSS_DISTANCE_PERCENT must be less than...
```

### Bypassing Validation (Testing Only)
```typescript
// For testbed only: skip validation with _unsafe flag
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0,  // Would normally fail
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100,
}, true);  // _unsafe=true bypasses validation
```

The `_unsafe` parameter is used in test environments to disable validation for testing edge cases.

---

## Validation Timing

| Event | Validation Trigger | Impact |
|-------|-------------------|--------|
| `setConfig()` call | Immediate | Rollback on error, state preserved |
| `addStrategy()` | None | Config already validated |
| `Backtest.run()` | None | Config already validated |
| Signal generation | Runtime checks | Separate from config validation |

Configuration validation happens once at `setConfig()` time, not during execution. This ensures performance is not impacted during backtests or live trading.

---

## Cost Model Default Values Rationale

| Parameter | Default | Reasoning |
|-----------|---------|-----------|
| `CC_PERCENT_SLIPPAGE` | 0.1% | Conservative estimate for liquid markets (BTC, ETH) |
| `CC_PERCENT_FEE` | 0.1% | Standard maker/taker fee on major exchanges |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.5% | Covers 0.4% costs + 0.1% minimum profit buffer |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | 0.5% | Prevents instant stop-out from normal volatility |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Limits single-signal risk to 20% of position |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 | 1 day prevents eternal signals blocking risk limits |

---

## Test Coverage Summary

| Category | Test Count | Coverage |
|----------|-----------|----------|
| Economic viability | 1 | Micro-profit rejection |
| Risk protection | 2 | Extreme SL, excessive lifetime |
| Data integrity | 4 | Negative/NaN/Infinity prices, incomplete candles |
| Baseline functionality | 2 | LONG/SHORT basic trading |
| Configuration validation | 25+ | All parameter constraints |

**Total:** 34+ tests ensuring money safety and system stability.

---

## Integration with Signal Validation

Configuration validation (`ConfigValidationService`) is distinct from signal validation at runtime:

| Validation Type | Timing | Scope | Example |
|----------------|--------|-------|---------|
| **Config Validation** | `setConfig()` time | Global parameters | Ensure TP distance ≥ 0.4% |
| **Signal Validation** | Runtime (per signal) | Individual signal fields | Check `priceTakeProfit > priceOpen` for LONG |

Both layers work together:
1. Config validation ensures global constraints are sane
2. Signal validation ensures each signal respects those constraints

For signal-level validation (e.g., `VALIDATE_SIGNAL_FN`), see [Risk Management](./14-risk-management.md).

---

## Summary

The `ConfigValidationService` prevents unprofitable and dangerous trading configurations through:

1. **Economic viability checks:** Ensures `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` covers all execution costs (slippage + fees)
2. **Range constraints:** Validates MIN < MAX relationships and reasonable bounds
3. **Type safety:** Enforces integer/positive constraints on time and count parameters
4. **Comprehensive error reporting:** Aggregates all validation errors with detailed breakdowns
5. **Rollback on failure:** Preserves previous valid configuration if new config is rejected
6. **Extensive test coverage:** 34+ tests verify protection against common pitfalls

This system ensures that strategies are mathematically sound before any capital is risked, providing a critical safety layer between user configuration and execution.

