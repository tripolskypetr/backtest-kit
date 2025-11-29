# Global Configuration


This page documents the global configuration system for backtest-kit, including the `GLOBAL_CONFIG` object, the `setConfig()` function, and all runtime configuration parameters that control validation rules and timing constraints across the framework.

For detailed information about specific parameter categories, see:
- Validation parameters (TP/SL distance constraints): [14.2](./73_Validation_Parameters.md)
- Timing parameters (signal lifetime and scheduling): [14.3](./74_Timing_Parameters.md)

---

## Configuration Object Structure

The framework uses a singleton `GLOBAL_CONFIG` object to store runtime parameters that affect signal validation, scheduling behavior, and risk management. This object is defined in [src/config/params.ts:1-30]() and contains five primary configuration parameters.

### GLOBAL_CONFIG Definition

![Mermaid Diagram](./diagrams/72_Global_Configuration_0.svg)

**GLOBAL_CONFIG Parameter Summary**

| Parameter | Default | Unit | Purpose |
|-----------|---------|------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | minutes | Maximum wait time for scheduled signals to activate |
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | candles | Number of 1-minute candles for VWAP calculation |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.1 | percent | Minimum TP distance from priceOpen (fee coverage) |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20 | percent | Maximum SL distance from priceOpen (risk limit) |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 | minutes | Maximum signal duration (1 day default) |

Sources: [src/config/params.ts:1-30](), [types.d.ts:5-34]()

---

## Setting Configuration

The `setConfig()` function allows runtime modification of global configuration parameters. It accepts a partial configuration object, enabling selective parameter updates without affecting other values.

### setConfig Function Signature

```typescript
setConfig(config: Partial<GlobalConfig>): Promise<void>
```

**Parameters:**
- `config`: Partial<GlobalConfig> - Object containing configuration parameters to update. Only specified parameters are modified; others retain their current values.

**Returns:**
- `Promise<void>` - Resolves when configuration is updated

**Behavior:**
- Updates GLOBAL_CONFIG object in-place
- Accepts partial updates (only specified fields are changed)
- Changes take effect immediately for subsequent operations
- No validation of parameter values (caller responsible for sensible values)

Sources: [types.d.ts:86-97](), [src/index.ts:1]()

---

## Configuration Parameters

### CC_SCHEDULE_AWAIT_MINUTES

**Purpose:** Maximum time in minutes to wait for a scheduled signal to activate before cancelling it.

**Default Value:** 120 minutes (2 hours)

**Usage Context:**
- Applied to scheduled signals (signals with `priceOpen` specified)
- Timer starts at `scheduledAt` timestamp
- Signal cancelled if `priceOpen` not reached within timeout
- Prevents "eternal" scheduled signals from blocking risk limits indefinitely

**Validation Flow:**

![Mermaid Diagram](./diagrams/72_Global_Configuration_1.svg)

**Example:**
```typescript
// Extend timeout for long-term scheduled signals
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 240, // 4 hours
});
```

Sources: [src/config/params.ts:3-6](), [types.d.ts:7-10](), [test/e2e/defend.test.mjs:444-536]()

---

### CC_AVG_PRICE_CANDLES_COUNT

**Purpose:** Number of 1-minute candles to use for Volume-Weighted Average Price (VWAP) calculation.

**Default Value:** 5 candles (last 5 minutes)

**Usage Context:**
- Used by `ClientExchange.getAveragePrice()` method
- Applied in live mode for real-time price monitoring
- Formula: `VWAP = Σ(Typical Price × Volume) / Σ(Volume)`
- Typical Price = `(High + Low + Close) / 3`

**VWAP Calculation Flow:**

![Mermaid Diagram](./diagrams/72_Global_Configuration_2.svg)

**Example:**
```typescript
// Use 10 candles for smoother VWAP
setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 10,
});
```

Sources: [src/config/params.ts:8-10](), [types.d.ts:12-15](), [types.d.ts:264-270]()

---

### CC_MIN_TAKEPROFIT_DISTANCE_PERCENT

**Purpose:** Minimum percentage distance between `priceTakeProfit` and `priceOpen` to ensure profit exceeds trading fees.

**Default Value:** 0.1% (minimum profit after 2×0.1% fees)

**Usage Context:**
- Applied during signal validation in `VALIDATE_SIGNAL_FN`
- Prevents micro-profit signals where fees exceed gains
- Default 0.3% recommended to cover fees (0.1% entry + 0.1% exit) plus minimum margin
- Setting to 0 disables validation (not recommended for production)

**Validation Logic:**

![Mermaid Diagram](./diagrams/72_Global_Configuration_3.svg)

**Example:**
```typescript
// Require 0.5% minimum TP distance for high-fee exchanges
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.5,
});
```

Sources: [src/config/params.ts:12-17](), [types.d.ts:17-21](), [test/e2e/sanitize.test.mjs:26-131]()

---

### CC_MAX_STOPLOSS_DISTANCE_PERCENT

**Purpose:** Maximum percentage distance between `priceStopLoss` and `priceOpen` to prevent catastrophic losses from extreme StopLoss values.

**Default Value:** 20% (one signal cannot lose more than 20% of position)

**Usage Context:**
- Applied during signal validation in `VALIDATE_SIGNAL_FN`
- Prevents accidental or malicious extreme SL values
- Protects against single-signal portfolio wipeout scenarios
- Setting to 100 effectively disables validation

**Validation Logic:**

![Mermaid Diagram](./diagrams/72_Global_Configuration_4.svg)

**Example:**
```typescript
// Allow 10% max risk per signal for conservative strategy
setConfig({
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 10,
});
```

Sources: [src/config/params.ts:19-23](), [types.d.ts:23-27](), [test/e2e/sanitize.test.mjs:143-238]()

---

### CC_MAX_SIGNAL_LIFETIME_MINUTES

**Purpose:** Maximum signal duration in minutes before automatic closure via time expiration.

**Default Value:** 1440 minutes (1 day)

**Usage Context:**
- Applied during signal lifecycle monitoring
- Prevents eternal signals that block risk limits indefinitely
- Timer starts at `pendingAt` timestamp (when signal becomes active)
- Signal closed with `closeReason: "time_expired"` when exceeded
- Critical for portfolio turnover and risk limit availability

**Lifecycle Monitoring:**

![Mermaid Diagram](./diagrams/72_Global_Configuration_5.svg)

**Example:**
```typescript
// Allow 7-day positions for long-term strategies
setConfig({
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 10080, // 7 days
});
```

Sources: [src/config/params.ts:25-29](), [types.d.ts:29-34](), [test/e2e/sanitize.test.mjs:250-348]()

---

## Configuration Flow Architecture

The configuration system follows a simple write-once-read-many pattern, where configuration parameters are read by validation and monitoring logic throughout the framework.

![Mermaid Diagram](./diagrams/72_Global_Configuration_6.svg)

**Configuration Consumers:**

| Consumer | Configuration Parameter | Usage |
|----------|------------------------|-------|
| `VALIDATE_SIGNAL_FN` | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | Validate minimum TP distance |
| `VALIDATE_SIGNAL_FN` | `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | Validate maximum SL distance |
| `VALIDATE_SIGNAL_FN` | `CC_MAX_SIGNAL_LIFETIME_MINUTES` | Validate signal lifetime |
| `ClientExchange.getAveragePrice()` | `CC_AVG_PRICE_CANDLES_COUNT` | VWAP candle count |
| `ClientStrategy.tick()` | `CC_MAX_SIGNAL_LIFETIME_MINUTES` | Check signal expiration |
| Scheduled signal monitoring | `CC_SCHEDULE_AWAIT_MINUTES` | Check scheduled timeout |

Sources: [src/config/params.ts:1-30](), [types.d.ts:5-38]()

---

## Type Safety

The configuration system uses TypeScript's `typeof` operator to derive the `GlobalConfig` type from the runtime `GLOBAL_CONFIG` object, ensuring type safety for partial updates via `setConfig()`.

**Type Definition:**

```typescript
// Runtime object
const GLOBAL_CONFIG = {
  CC_SCHEDULE_AWAIT_MINUTES: 120,
  CC_AVG_PRICE_CANDLES_COUNT: 5,
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.1,
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 20,
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 1440,
};

// Type derived from runtime object
type GlobalConfig = typeof GLOBAL_CONFIG;

// setConfig accepts partial configuration
function setConfig(config: Partial<GlobalConfig>): Promise<void>;
```

**Type Safety Benefits:**
- Autocomplete for configuration parameter names
- Compile-time validation of parameter types
- Prevention of typos in parameter names
- IDE support for parameter discovery

Sources: [src/config/params.ts:32-35](), [types.d.ts:36-38]()

---

## Usage Patterns

### Pattern 1: Disable Validation for Testing

Test environments often require relaxed validation rules to test edge cases:

```typescript
// Disable all validation constraints for testing
await setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0, // Allow any TP distance
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100, // Allow any SL distance
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, // Allow any lifetime
});
```

Sources: [test/config/setup.mjs:36-41]()

---

### Pattern 2: Conservative Risk Management

Production strategies may require stricter validation:

```typescript
// Conservative configuration for production
await setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.5, // 0.5% minimum profit
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 5, // 5% maximum loss per signal
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 720, // 12 hours max signal duration
  CC_SCHEDULE_AWAIT_MINUTES: 60, // 1 hour scheduled signal timeout
});
```

---

### Pattern 3: Validate Specific Parameters

Update only specific parameters while preserving defaults for others:

```typescript
// Only modify scheduled signal timeout
await setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 180, // 3 hours
});
// All other parameters retain their default values
```

Sources: [test/e2e/sanitize.test.mjs:30-32](), [test/e2e/sanitize.test.mjs:146-148]()

---

### Pattern 4: Long-Term Strategy Configuration

Swing trading strategies may require extended timeouts:

```typescript
// Configuration for multi-day swing trading
await setConfig({
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 10080, // 7 days
  CC_SCHEDULE_AWAIT_MINUTES: 1440, // 24 hours for limit orders
  CC_AVG_PRICE_CANDLES_COUNT: 15, // 15-minute VWAP for stability
});
```

---

### Pattern 5: High-Frequency Trading Configuration

Scalping strategies require tighter constraints:

```typescript
// Configuration for high-frequency scalping
await setConfig({
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 60, // 1 hour max
  CC_SCHEDULE_AWAIT_MINUTES: 15, // 15 minutes scheduled timeout
  CC_AVG_PRICE_CANDLES_COUNT: 3, // 3-minute VWAP for responsiveness
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.2, // Tight TP for quick exits
});
```

---

## Configuration Timing

Configuration changes take effect **immediately** but only affect **future operations**:

- **Validation**: New signals validated with updated parameters
- **Monitoring**: Active signals continue using parameters from their creation time
- **Scheduled signals**: Timeout calculated using parameters at schedule time
- **VWAP**: Next `getAveragePrice()` call uses updated candle count

**Important:** Configuration changes do NOT retroactively affect active or scheduled signals. Signals retain the validation parameters that were active when they were created.

---

## Default Configuration Rationale

The default configuration values represent a balanced approach suitable for most cryptocurrency trading strategies:

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 min | 2-hour window balances limit order patience vs. stale signals |
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 candles | 5-minute lookback reduces noise while remaining responsive |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.1% | Minimal profit check (fees typically 0.1% each side = 0.2% total) |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Prevents catastrophic single-signal portfolio damage |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 min | 24-hour limit prevents eternal signals blocking risk limits |

**Note:** The default `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` of 0.1% is intentionally permissive. For production use with 0.1% trading fees, consider increasing to 0.3% or higher to ensure profitable trades after fees.

Sources: [src/config/params.ts:1-30](), [types.d.ts:5-34]()