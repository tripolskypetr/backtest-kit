---
title: design/28_configuration-api
group: design
---

# Configuration API

This page documents the public API functions for configuring the framework's global parameters at runtime. For descriptions of individual configuration parameters, see [Global Configuration Parameters](./26-global-configuration-parameters.md). For details on how configuration values are validated, see [Economic Viability and Validation](./27-economic-viability-and-validation.md).

---

## API Functions

The configuration API provides three primary functions for managing global settings: `setConfig()` for updating parameters, `getConfig()` for reading current values, and `getDefaultConfig()` for inspecting defaults.

### setConfig()

Sets or updates global configuration parameters with automatic validation and rollback on error.

**Function Signature:**
```typescript
function setConfig(config: Partial<GlobalConfig>, _unsafe?: boolean): void
```

**Parameters:**
- `config`: Partial configuration object containing only the parameters to update
- `_unsafe`: Optional boolean to skip validation (used only in test environments)

**Behavior:**
1. Creates a backup copy of current `GLOBAL_CONFIG`
2. Merges provided config into `GLOBAL_CONFIG` using `Object.assign()`
3. Calls `ConfigValidationService.validate()` (unless `_unsafe=true`)
4. If validation fails, restores previous config from backup and throws error
5. If validation succeeds, new config is active immediately

### getConfig()

Retrieves a shallow copy of the current global configuration state.

**Function Signature:**
```typescript
function getConfig(): GlobalConfig
```

**Returns:** Shallow copy of `GLOBAL_CONFIG` to prevent accidental mutations

**Usage:** Inspect current configuration without modifying it

### getDefaultConfig()

Retrieves the frozen default configuration object.

**Function Signature:**
```typescript
function getDefaultConfig(): Readonly<GlobalConfig>
```

**Returns:** Read-only reference to `DEFAULT_CONFIG` with all preset values

**Usage:** Compare current config against defaults or reset to known state

---

## Configuration Flow Architecture

![Mermaid Diagram](./diagrams\28-configuration-api_0.svg)

---

## Basic Usage Examples

### Updating Configuration Parameters

```typescript
import { setConfig } from 'backtest-kit';

// Update schedule await timeout
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 90,
});

// Update multiple parameters atomically
setConfig({
  CC_PERCENT_SLIPPAGE: 0.15,
  CC_PERCENT_FEE: 0.08,
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.6,
});
```

### Partial Updates Preserve Other Values

```typescript
import { setConfig } from 'backtest-kit';

// Set both values
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 90,
  CC_AVG_PRICE_CANDLES_COUNT: 7,
});

// Update only one value - other value remains 90
setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 8,
});
```

### Reading Current Configuration

```typescript
import { getConfig } from 'backtest-kit';

const currentConfig = getConfig();
console.log(currentConfig.CC_SCHEDULE_AWAIT_MINUTES); // Current value
console.log(currentConfig.CC_PERCENT_SLIPPAGE); // Current value

// Safe to mutate copy without affecting global config
currentConfig.CC_PERCENT_FEE = 999; // Does NOT affect GLOBAL_CONFIG
```

### Inspecting Default Values

```typescript
import { getDefaultConfig } from 'backtest-kit';

const defaults = getDefaultConfig();
console.log(defaults.CC_SCHEDULE_AWAIT_MINUTES); // 120
console.log(defaults.CC_AVG_PRICE_CANDLES_COUNT); // 5
console.log(defaults.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT); // 0.5
```

---

## Validation Error Handling

When `setConfig()` is called without the `_unsafe` parameter, the `ConfigValidationService` validates all constraints before applying changes. If validation fails, the previous configuration is restored and an error is thrown with detailed diagnostics.

### Validation Error Structure

![Mermaid Diagram](./diagrams\28-configuration-api_1.svg)

### Example Validation Errors

| Scenario | Error Message |
|----------|---------------|
| Negative slippage | `CC_PERCENT_SLIPPAGE must be a non-negative number, got -0.1` |
| TP below costs | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low to cover trading costs. Required minimum: 0.40%` |
| MIN_SL > MAX_SL | `CC_MIN_STOPLOSS_DISTANCE_PERCENT (10%) must be less than CC_MAX_STOPLOSS_DISTANCE_PERCENT (5%)` |
| Non-integer count | `CC_AVG_PRICE_CANDLES_COUNT must be a positive integer, got 5.5` |
| Multiple errors | `GLOBAL_CONFIG validation failed:\n  1. [error1]\n  2. [error2]\n  3. [error3]` |

### Error Example: Take Profit Below Cost Coverage

```typescript
import { setConfig } from 'backtest-kit';

try {
  setConfig({
    CC_PERCENT_SLIPPAGE: 0.1,
    CC_PERCENT_FEE: 0.1,
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3, // Too low!
  });
} catch (error) {
  console.error(error.message);
  // Output:
  // GLOBAL_CONFIG validation failed:
  //   1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low to cover trading costs.
  //      Required minimum: 0.40%
  //      Breakdown:
  //        - Slippage effect: 0.20% (0.1% × 2 transactions)
  //        - Fees: 0.20% (0.1% × 2 transactions)
  //      All TakeProfit signals will be unprofitable with current settings!
}
```

---

## The _unsafe Parameter

The `_unsafe` parameter in `setConfig()` bypasses validation checks. This is **only for testing environments** where you need to test edge cases or invalid configurations.

### When to Use _unsafe

| Use Case | Reason |
|----------|--------|
| Test edge cases | Verify signal validation catches micro-profit signals |
| Test error handling | Ensure system handles invalid configs gracefully |
| Testbed isolation | Disable strict checks for faster test execution |
| Mock configurations | Create unrealistic but controlled test scenarios |

### Usage in Tests

```typescript
import { setConfig } from 'backtest-kit';

// In production code - validation runs
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3, // Would throw error
});

// In testbed - validation skipped
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0, // Allowed with _unsafe=true
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100,
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,
}, true); // _unsafe parameter
```

### Production Warning

**Never use `_unsafe=true` in production code.** Disabling validation can lead to:
- Unprofitable signals (TP below cost coverage)
- Catastrophic losses (extreme stop loss distances)
- System instability (negative or infinite values)
- Mathematical errors (division by zero, NaN propagation)

---

## Configuration Lifecycle in Execution Modes

The configuration system integrates with all execution modes through direct reads of `GLOBAL_CONFIG`. Changes take effect immediately for subsequent operations.

![Mermaid Diagram](./diagrams\28-configuration-api_2.svg)

---

## Code Entity Reference

### Core Configuration Types and Functions

| Entity | Location | Purpose |
|--------|----------|---------|
| `GlobalConfig` | [types.d.ts:119]() | Type definition for configuration object |
| `GLOBAL_CONFIG` | [src/config/params.ts:1-114]() | Mutable runtime configuration state |
| `DEFAULT_CONFIG` | [src/config/params.ts:116]() | Frozen default configuration values |
| `setConfig()` | [src/function/setup.ts:39-52]() | Update configuration with validation |
| `getConfig()` | [src/function/setup.ts:68-70]() | Retrieve current configuration copy |
| `getDefaultConfig()` | [src/function/setup.ts:86-88]() | Retrieve default configuration |
| `ConfigValidationService` | [src/lib/services/validation/ConfigValidationService.ts:37]() | Validates configuration constraints |

---

## Advanced Configuration Patterns

### Conditional Configuration Based on Environment

```typescript
import { setConfig } from 'backtest-kit';

if (process.env.NODE_ENV === 'production') {
  setConfig({
    CC_PERCENT_SLIPPAGE: 0.15, // Higher slippage for production
    CC_PERCENT_FEE: 0.1,
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.7, // More conservative
  });
} else {
  setConfig({
    CC_PERCENT_SLIPPAGE: 0.05, // Lower slippage for testing
    CC_PERCENT_FEE: 0.05,
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,
  });
}
```

### Configuration Before Strategy Registration

Configuration changes must be applied **before** calling `addStrategy()`, `addExchange()`, etc. The framework reads `GLOBAL_CONFIG` during strategy execution, not during registration.

```typescript
import { setConfig, addExchange, addStrategy, Backtest } from 'backtest-kit';

// 1. Configure FIRST
setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 6,
  CC_SCHEDULE_AWAIT_MINUTES: 90,
});

// 2. Register components SECOND
addExchange({ /* ... */ });
addStrategy({ /* ... */ });
addFrame({ /* ... */ });

// 3. Execute THIRD - uses current GLOBAL_CONFIG
Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "my-exchange",
  frameName: "my-frame",
});
```

---

## Related Pages

- [Global Configuration Parameters](./26-global-configuration-parameters.md) - Descriptions of all configuration parameters
- [Economic Viability and Validation](./27-economic-viability-and-validation.md) - Details on how validation logic prevents unprofitable configurations
- [Risk Management](./14-risk-management.md) - How configuration affects risk validation
- [Position Sizing](./15-position-sizing.md) - How configuration influences position calculations

