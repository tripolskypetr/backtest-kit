---
title: design/26_global-configuration-parameters
group: design
---

# Global Configuration Parameters

## Overview and Scope

This page documents all global configuration parameters in `GLOBAL_CONFIG`, which control system-wide behavior for backtesting, live trading, data fetching, and economic calculations. These parameters affect signal validation, cost modeling, timeout enforcement, and report generation across all execution modes.

For details on how these parameters are validated for economic viability, see [Economic Viability and Validation](./27-economic-viability-and-validation.md). For the configuration API (`setConfig`, `getConfig`), see [Configuration API](./28-configuration-api.md).

---

## Parameter Categories Overview

The 14 global configuration parameters are organized into five functional categories:

![Mermaid Diagram](./diagrams\26-global-configuration-parameters_0.svg)

---

## Economic Parameters

Economic parameters control transaction cost modeling and profitability constraints. These are the most critical parameters as they determine whether strategies can be profitable.

### Cost Modeling: Slippage and Fees

#### CC_PERCENT_SLIPPAGE

**Default**: `0.1` (0.1% per transaction)  
**Type**: `number` (non-negative)  
**Purpose**: Simulates market impact and order book depth by worsening execution prices.

Applied twice per round-trip trade:
- **Entry**: Long positions buy at higher price (+0.1%), short positions sell at lower price (-0.1%)
- **Exit**: Long positions sell at lower price (-0.1%), short positions buy at higher price (+0.1%)

Total slippage effect: **0.2%** (2 × 0.1%)

#### CC_PERCENT_FEE

**Default**: `0.1` (0.1% per transaction)  
**Type**: `number` (non-negative)  
**Purpose**: Transaction fee charged by exchange or broker.

Applied twice per round-trip trade:
- Entry transaction: 0.1% fee
- Exit transaction: 0.1% fee

Total fee cost: **0.2%** (2 × 0.1%)

### Cost Breakdown Diagram

![Mermaid Diagram](./diagrams\26-global-configuration-parameters_1.svg)

### Profitability Constraints

#### CC_MIN_TAKEPROFIT_DISTANCE_PERCENT

**Default**: `0.5` (0.5%)  
**Type**: `number` (positive)  
**Purpose**: Minimum distance from `priceOpen` to `priceTakeProfit` to ensure profitable trades.

**Critical Constraint**: Must be **greater than** total trading costs (slippage + fees) to guarantee profit when TP is hit.

**Calculation**:
```
Total Costs = (slippage × 2) + (fees × 2)
            = (0.1% × 2) + (0.1% × 2)
            = 0.2% + 0.2%
            = 0.4%

Minimum Required TP Distance = 0.4% + buffer
Default: 0.5% (covers 0.4% costs + 0.1% profit margin)
```

**Validation**: If `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT < (CC_PERCENT_SLIPPAGE × 2 + CC_PERCENT_FEE × 2)`, all TP signals will be unprofitable (see [Economic Viability and Validation](./27-economic-viability-and-validation.md)).

#### CC_MIN_STOPLOSS_DISTANCE_PERCENT

**Default**: `0.5` (0.5%)  
**Type**: `number` (positive)  
**Purpose**: Minimum distance from `priceOpen` to `priceStopLoss` to prevent signals from being immediately stopped out by normal price volatility.

Prevents "instant stop loss" scenarios where minor price fluctuations trigger SL before the strategy has a chance to develop.

#### CC_MAX_STOPLOSS_DISTANCE_PERCENT

**Default**: `20` (20%)  
**Type**: `number` (positive)  
**Purpose**: Maximum distance from `priceOpen` to `priceStopLoss` to prevent catastrophic losses.

Caps risk per signal to 20% of position value. Prevents single signals from causing devastating portfolio damage.

**Constraint**: Must be **greater than** `CC_MIN_STOPLOSS_DISTANCE_PERCENT`.

---

## Signal Lifecycle Parameters

Signal lifecycle parameters control timeouts and maximum durations for various signal states.

### Parameter Summary Table

| Parameter | Default | Type | Purpose |
|-----------|---------|------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | `number` (positive integer) | Scheduled signal activation timeout |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 | `number` (positive integer) | Maximum signal duration (opened state) |
| `CC_MAX_SIGNAL_GENERATION_SECONDS` | 180 | `number` (positive integer) | `getSignal` execution timeout |

### CC_SCHEDULE_AWAIT_MINUTES

**Default**: `120` (2 hours)  
**Type**: `number` (positive integer, minutes)  
**Purpose**: Maximum time to wait for a scheduled signal to activate (price to reach `priceOpen`).

If a scheduled signal does not activate within this timeout, it is automatically cancelled to prevent indefinite blocking of risk limits.

**Related Signals**: Scheduled signals (those with explicit `priceOpen` set in `getSignal` return value).

### CC_MAX_SIGNAL_LIFETIME_MINUTES

**Default**: `1440` (1 day = 24 hours)  
**Type**: `number` (positive integer, minutes)  
**Purpose**: Maximum duration a signal can remain in the "opened" state before being force-closed with reason `"time_expired"`.

Prevents "eternal signals" that block risk limits for weeks/months without reaching TP or SL.

### CC_MAX_SIGNAL_GENERATION_SECONDS

**Default**: `180` (3 minutes)  
**Type**: `number` (positive integer, seconds)  
**Purpose**: Maximum execution time allowed for the `getSignal` callback in strategy schemas.

Prevents long-running or stuck signal generation routines from blocking execution or consuming resources indefinitely. If generation exceeds this threshold, the attempt is aborted and logged.

### Lifecycle State Diagram with Timeouts

![Mermaid Diagram](./diagrams\26-global-configuration-parameters_2.svg)

---

## Data Fetching and Reliability Parameters

These parameters control VWAP calculation, retry logic for failed `getCandles` calls, and anomaly detection for incomplete candle data.

### VWAP Calculation

#### CC_AVG_PRICE_CANDLES_COUNT

**Default**: `5` (5 candles)  
**Type**: `number` (positive integer)  
**Purpose**: Number of 1-minute candles to use for Volume-Weighted Average Price (VWAP) calculation.

Default of 5 means VWAP is calculated from the last 5 minutes of 1m candle data.

**Formula**:
```
VWAP = Σ(Typical Price × Volume) / Σ(Volume)
where Typical Price = (High + Low + Close) / 3
```

**Used By**: `ClientExchange.getAveragePrice()` method, which is called by strategies to get current market price.

### Retry Logic

#### CC_GET_CANDLES_RETRY_COUNT

**Default**: `3` (3 retries)  
**Type**: `number` (non-negative integer)  
**Purpose**: Number of retry attempts for `getCandles` function when API calls fail.

Total attempts = 1 initial + 3 retries = 4 attempts maximum.

#### CC_GET_CANDLES_RETRY_DELAY_MS

**Default**: `5000` (5 seconds)  
**Type**: `number` (non-negative integer, milliseconds)  
**Purpose**: Delay between retry attempts for `getCandles` function.

Provides backoff time to avoid overwhelming failing APIs or to wait for transient network issues to resolve.

### Anomaly Detection

#### CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR

**Default**: `1000` (factor of 1000)  
**Type**: `number` (positive integer)  
**Purpose**: Maximum allowed deviation factor for detecting incomplete/anomalous candles from exchange APIs.

**Detection Logic**: Price is rejected if it's more than `factor` times lower than reference price (median/average).

**Reasoning**:
- Incomplete candles from Binance API typically have prices near $0.01-$1
- Normal BTC price: $20,000-$100,000
- Factor 1000: Catches prices below $20-$100 when median is $20,000-$100,000
- Factor 100 would be too permissive ($200 allowed when median is $20,000)
- Factor 10000 might be too strict for low-cap altcoins

**Example**: BTC at $50,000 median → threshold $50 → catches $0.01-$1 anomalies.

#### CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN

**Default**: `5` (5 candles)  
**Type**: `number` (positive integer)  
**Purpose**: Minimum number of candles required for reliable median calculation in anomaly detection.

**Statistical Reasoning**:
- Each candle provides 4 price points (OHLC)
- 5 candles = 20 price points, sufficient for robust median
- Below 5 candles, single anomaly can heavily skew median
- Rule of thumb: minimum 7-10 data points for median stability
- Average is more stable than median for small datasets (n < 20)

**Behavior**: If fewer than this threshold, use simple average instead of median for reference price calculation.

### Data Fetching Flow Diagram

![Mermaid Diagram](./diagrams\26-global-configuration-parameters_3.svg)

---

## Reporting Parameters

### CC_REPORT_SHOW_SIGNAL_NOTE

**Default**: `false`  
**Type**: `boolean`  
**Purpose**: Controls visibility of the "Note" column in markdown report tables.

When `true`, the "Note" column (populated from `ISignalDto.note` field) is displayed in all markdown reports:
- `BacktestMarkdownService` reports
- `LiveMarkdownService` reports
- `ScheduleMarkdownService` reports
- `RiskMarkdownService` reports
- Other markdown report tables

When `false` (default), notes are hidden to reduce table width and improve readability.

---

## Complete Parameter Reference Table

| Parameter | Default | Type | Constraints | Purpose |
|-----------|---------|------|-------------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | `120` | `number` | Positive integer | Scheduled signal activation timeout (minutes) |
| `CC_AVG_PRICE_CANDLES_COUNT` | `5` | `number` | Positive integer | Number of candles for VWAP calculation |
| `CC_PERCENT_SLIPPAGE` | `0.1` | `number` | Non-negative | Slippage per transaction (%) |
| `CC_PERCENT_FEE` | `0.1` | `number` | Non-negative | Fee per transaction (%) |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `0.5` | `number` | Positive, must cover costs | Minimum TP distance from priceOpen (%) |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | `0.5` | `number` | Positive, < MAX_SL | Minimum SL distance from priceOpen (%) |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `20` | `number` | Positive, > MIN_SL | Maximum SL distance from priceOpen (%) |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `1440` | `number` | Positive integer | Maximum signal duration (minutes) |
| `CC_MAX_SIGNAL_GENERATION_SECONDS` | `180` | `number` | Positive integer | getSignal timeout (seconds) |
| `CC_GET_CANDLES_RETRY_COUNT` | `3` | `number` | Non-negative integer | Number of retries for getCandles |
| `CC_GET_CANDLES_RETRY_DELAY_MS` | `5000` | `number` | Non-negative integer | Delay between retries (milliseconds) |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` | `1000` | `number` | Positive integer | Anomaly detection factor |
| `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | `5` | `number` | Positive integer | Min candles for median calculation |
| `CC_REPORT_SHOW_SIGNAL_NOTE` | `false` | `boolean` | N/A | Show note column in reports |

---

## Parameter Relationships and Dependencies

Some parameters have mathematical relationships and dependencies that are enforced by validation:

![Mermaid Diagram](./diagrams\26-global-configuration-parameters_4.svg)

---

## Type Definition and Access

The `GlobalConfig` type is defined as `typeof GLOBAL_CONFIG`, providing type safety for configuration access:

```typescript
// Type definition
export type GlobalConfig = typeof GLOBAL_CONFIG;

// Access via global object
import { GLOBAL_CONFIG } from "./config/params";
console.log(GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES); // 120

// Access via API functions (see page 7.3)
import { getConfig } from "./function/setup";
const config = getConfig(); // Returns shallow copy
console.log(config.CC_SCHEDULE_AWAIT_MINUTES); // 120
```

**Type Location**: [src/config/params.ts:121](), [types.d.ts:119]()

**Default Configuration**: `DEFAULT_CONFIG` is a frozen copy of initial `GLOBAL_CONFIG` values, providing reference to original defaults even after configuration changes.

---

## Validation Overview

All configuration parameters are validated when `setConfig()` is called (unless `_unsafe` flag is set). Validation ensures:

1. **Type constraints**: Integer parameters are integers, positive values are positive
2. **Economic viability**: `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` covers all costs
3. **Range constraints**: MIN < MAX relationships (e.g., StopLoss distances)
4. **Sanity checks**: Timeouts, retry counts, and thresholds are reasonable

If validation fails, `setConfig()` reverts to previous configuration and throws an error with detailed breakdown of all validation failures.

**Validator Class**: `ConfigValidationService` at [src/lib/services/validation/ConfigValidationService.ts:1-179]()

For detailed validation rules and economic viability calculations, see [Economic Viability and Validation](./27-economic-viability-and-validation.md).

For configuration API usage (setting/getting config), see [Configuration API](./28-configuration-api.md).

