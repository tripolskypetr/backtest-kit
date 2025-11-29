# Validation Services


## Purpose and Scope

Validation Services provide schema validation and runtime checks for all component types in the framework. These services ensure that components are correctly configured at registration time and that runtime data (signals, prices, risk parameters) meets safety constraints before execution. Validation Services act as gatekeepers between the public API and the execution engine, preventing invalid configurations from causing runtime errors or financial losses.

For information about how validated schemas are stored and retrieved, see [Schema Services](./39_Schema_Services.md). For details on how validation results flow into execution, see [Global Services](./41_Global_Services.md).

---

## Architecture Overview

### Validation Services in the DI System

![Mermaid Diagram](./diagrams/40_Validation_Services_0.svg)

**Sources:** [src/function/add.ts:54-56](), [src/function/add.ts:103-105](), [src/lib/index.ts:143-150](), [src/lib/core/types.ts:59-66]()

### Validation Flow: Registration to Execution

![Mermaid Diagram](./diagrams/40_Validation_Services_1.svg)

**Sources:** [src/function/add.ts:50-62](), [test/e2e/defend.test.mjs:544-641](), [test/e2e/sanitize.test.mjs:27-131]()

---

## Validation Service Types

The framework provides six validation service classes, one for each component type. All validation services follow a common pattern: they validate schemas at registration time, memoize validation results, and provide a `list()` method for retrieving registered schemas.

### Service Responsibilities Table

| Service Class | Component Type | Primary Responsibilities | DI Symbol |
|--------------|----------------|-------------------------|-----------|
| `StrategyValidationService` | Strategy | Signal generation validation, interval checks, risk/sizing references | `TYPES.strategyValidationService` |
| `ExchangeValidationService` | Exchange | Market data interface validation, formatting function checks | `TYPES.exchangeValidationService` |
| `FrameValidationService` | Frame | Timeframe configuration validation, date range checks | `TYPES.frameValidationService` |
| `RiskValidationService` | Risk | Position limit validation, custom validation function checks | `TYPES.riskValidationService` |
| `SizingValidationService` | Sizing | Position sizing method validation, parameter range checks | `TYPES.sizingValidationService` |
| `WalkerValidationService` | Walker | Strategy comparison validation, metric selection checks | `TYPES.walkerValidationService` |

**Sources:** [src/lib/index.ts:143-150](), [src/lib/core/types.ts:59-66](), [src/lib/core/provide.ts:102-109]()

### Common Service Interface

All validation services implement a consistent interface pattern:

```typescript
interface IValidationService<TSchema> {
  // Store and validate schema
  addComponent(name: string, schema: TSchema): void;
  
  // Retrieve all registered schemas
  list(): Promise<TSchema[]>;
  
  // Internal validation logic (memoized)
  _validateSchema(schema: TSchema): ValidationResult;
}
```

The `addComponent` method (named `addStrategy`, `addExchange`, etc.) is called by the corresponding `add*` functions in the public API. Validation results are memoized to avoid repeated validation of the same schema.

**Sources:** [src/function/add.ts:50-62](), [src/function/list.ts:41-44]()

---

## Schema Validation

### Registration-Time Validation

Schema validation occurs when a component is registered via an `add*` function. The validation flow follows this sequence:

![Mermaid Diagram](./diagrams/40_Validation_Services_2.svg)

**Sources:** [src/function/add.ts:50-62](), [src/function/add.ts:99-111]()

### Validation Checks by Component Type

Each validation service performs component-specific checks:

#### Strategy Validation
- `strategyName` is non-empty string
- `interval` matches `FrameInterval` enum values
- `getSignal` is an async function
- `riskName` reference exists (if specified)
- `sizingName` reference exists (if specified)
- `callbacks` structure is valid (if specified)

#### Exchange Validation
- `exchangeName` is non-empty string
- `getCandles` is an async function returning candle array
- `formatPrice` is an async function
- `formatQuantity` is an async function
- `callbacks` structure is valid (if specified)

#### Frame Validation
- `frameName` is non-empty string
- `interval` matches `FrameInterval` enum values
- `startDate` is valid Date object
- `endDate` is valid Date object
- `startDate < endDate`
- `callbacks` structure is valid (if specified)

#### Risk Validation
- `riskName` is non-empty string
- `maxConcurrentPositions` is positive integer (if specified)
- `validations` array contains valid functions (if specified)
- `callbacks` structure is valid (if specified)

#### Sizing Validation
- `sizingName` is non-empty string
- `method` is one of: `"fixed-percentage"`, `"kelly-criterion"`, `"atr-based"`
- Method-specific parameters are valid (e.g., `riskPercentage`, `kellyMultiplier`)
- `callbacks` structure is valid (if specified)

#### Walker Validation
- `walkerName` is non-empty string
- `exchangeName` reference exists
- `frameName` reference exists
- `strategies` is non-empty array of strategy names
- All referenced strategies exist
- `metric` is valid metric name (if specified)
- `callbacks` structure is valid (if specified)

**Sources:** [src/function/add.ts:16-62](), [src/function/add.ts:99-111](), [src/function/add.ts:143-149](), [src/function/add.ts:188-199](), [src/function/add.ts:254-265](), [src/function/add.ts:329-340]()

### Memoization Pattern

Validation services use memoization to cache validation results. Once a schema is validated, subsequent calls with the same schema name return the cached result without re-running validation logic. This optimization is critical for performance during execution when validation services may be called frequently.

**Sources:** [src/lib/index.ts:143-150]()

---

## Signal Validation

### VALIDATE_SIGNAL_FN: Runtime Signal Checks

Signal validation occurs at runtime when a strategy generates a signal via `getSignal()`. The validation function `VALIDATE_SIGNAL_FN` performs comprehensive checks to ensure the signal is financially sound and meets safety constraints.

![Mermaid Diagram](./diagrams/40_Validation_Services_3.svg)

**Sources:** [test/e2e/defend.test.mjs:25-145](), [test/e2e/sanitize.test.mjs:27-131]()

### Price Validation Checks

The framework validates all price fields to prevent impossible or dangerous trades:

| Check | Condition | Purpose |
|-------|-----------|---------|
| **Positive Prices** | `priceOpen > 0`, `priceTakeProfit > 0`, `priceStopLoss > 0` | Prevent negative or zero prices |
| **Finite Numbers** | `isFinite(priceOpen)`, `isFinite(priceTakeProfit)`, `isFinite(priceStopLoss)` | Prevent NaN or Infinity values |
| **Non-NaN** | `!isNaN(priceOpen)`, `!isNaN(priceTakeProfit)`, `!isNaN(priceStopLoss)` | Prevent calculation explosions |

**Example: Negative Price Rejection**
```typescript
// This signal will be rejected at validation
{
  position: "long",
  priceOpen: -42000,  // Invalid: negative price
  priceTakeProfit: 43000,
  priceStopLoss: 41000,
  minuteEstimatedTime: 60
}
```

**Sources:** [test/e2e/sanitize.test.mjs:360-452](), [test/e2e/sanitize.test.mjs:464-556](), [test/e2e/sanitize.test.mjs:568-660]()

### TP/SL Logic Validation

The framework enforces position-specific logic for Take Profit and Stop Loss prices:

**LONG Position Logic:**
- Take Profit must be above entry: `priceTakeProfit > priceOpen`
- Stop Loss must be below entry: `priceStopLoss < priceOpen`

**SHORT Position Logic:**
- Take Profit must be below entry: `priceTakeProfit < priceOpen`
- Stop Loss must be above entry: `priceStopLoss > priceOpen`

**Example: Invalid LONG Signal**
```typescript
// This signal will be rejected at validation
{
  position: "long",
  priceOpen: 41000,
  priceTakeProfit: 40000,  // Invalid: TP below priceOpen for LONG
  priceStopLoss: 39000,
  minuteEstimatedTime: 60
}
```

**Example: Invalid SHORT Signal**
```typescript
// This signal will be rejected at validation
{
  position: "short",
  priceOpen: 43000,
  priceTakeProfit: 44000,  // Invalid: TP above priceOpen for SHORT
  priceStopLoss: 45000,
  minuteEstimatedTime: 60
}
```

**Sources:** [test/e2e/defend.test.mjs:544-641](), [test/e2e/defend.test.mjs:648-743](), [test/e2e/defend.test.mjs:751-845](), [test/e2e/defend.test.mjs:962-1069]()

### Distance Validation

The framework validates minimum and maximum distances for Take Profit and Stop Loss to ensure trades are profitable after fees and risk is bounded:

| Parameter | Default Value | Purpose |
|-----------|---------------|---------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | 0.1% | Ensure TP distance covers trading fees (2×0.1%) plus minimum profit |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | 20% | Prevent catastrophic losses (one signal cannot lose >20% of position) |

**Example: Micro-Profit Rejection**
```typescript
// This signal will be rejected at validation
{
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 42010,  // Only 0.024% profit - fees will eat profit
  priceStopLoss: 41000,
  minuteEstimatedTime: 60
}
// Net PNL after fees: 0.024% - 0.2% = -0.176% (loss!)
```

**Example: Extreme Stop Loss Rejection**
```typescript
// This signal will be rejected at validation
{
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 43000,
  priceStopLoss: 20000,  // -52% loss - catastrophic risk!
  minuteEstimatedTime: 60
}
```

**Sources:** [test/e2e/sanitize.test.mjs:27-131](), [test/e2e/sanitize.test.mjs:143-238](), [src/config/params.ts:13-23]()

### Lifetime Validation

The framework validates signal lifetime to prevent "eternal signals" that block risk limits indefinitely:

| Parameter | Default Value | Purpose |
|-----------|---------------|---------|
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 (1 day) | Prevent signals from blocking positions for weeks/months |

**Example: Excessive Lifetime Rejection**
```typescript
// This signal will be rejected at validation
{
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 43000,
  priceStopLoss: 41000,
  minuteEstimatedTime: 50000  // >34 days - strategy deadlock risk!
}
```

**Sources:** [test/e2e/sanitize.test.mjs:250-348](), [src/config/params.ts:24-29]()

---

## Global Configuration Parameters

Validation behavior is controlled by global configuration parameters that can be modified at runtime using `setConfig()`:

### Configuration Parameters Table

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `number` | 0.1 | Minimum TP distance from `priceOpen` (percentage). Must be greater than trading fees to ensure profitable trades. |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `number` | 20 | Maximum SL distance from `priceOpen` (percentage). Prevents catastrophic losses from extreme StopLoss values. |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `number` | 1440 | Maximum signal lifetime in minutes. Prevents eternal signals that block risk limits for weeks/months. |
| `CC_SCHEDULE_AWAIT_MINUTES` | `number` | 120 | Time to wait for scheduled signal to activate (in minutes). Signals that don't activate are cancelled. |
| `CC_AVG_PRICE_CANDLES_COUNT` | `number` | 5 | Number of candles to use for average price calculation (VWAP). Used in real-time monitoring. |

**Example: Customizing Validation Parameters**
```typescript
import { setConfig } from "backtest-kit";

setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // Require 0.3% minimum TP
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 10,     // Limit SL to 10% max
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 720,      // Limit signals to 12 hours
});
```

**Sources:** [src/config/params.ts:1-35](), [test/config/setup.mjs:36-41](), [test/e2e/sanitize.test.mjs:27-131]()

---

## Common Patterns

### Pattern 1: Validation at Registration

All `add*` functions follow the same pattern:
1. Log the registration attempt
2. Call the validation service's `addComponent` method
3. Call the schema service's `register` method

```typescript
// Pattern from src/function/add.ts:50-62
export function addStrategy(strategySchema: IStrategySchema) {
  backtest.loggerService.info(ADD_STRATEGY_METHOD_NAME, {
    strategySchema,
  });
  backtest.strategyValidationService.addStrategy(
    strategySchema.strategyName,
    strategySchema
  );
  backtest.strategySchemaService.register(
    strategySchema.strategyName,
    strategySchema
  );
}
```

This two-phase approach ensures that invalid schemas are rejected before being stored, preventing runtime errors later in the execution pipeline.

**Sources:** [src/function/add.ts:50-62](), [src/function/add.ts:99-111](), [src/function/add.ts:143-149]()

### Pattern 2: Validation Result Memoization

Validation services memoize validation results to avoid redundant checks. Once a schema is validated, subsequent references to the same component name use the cached validation result. This is critical for performance during execution when components may be referenced hundreds or thousands of times.

**Sources:** [src/lib/index.ts:143-150]()

### Pattern 3: Listing Registered Schemas

All validation services provide a `list()` method that returns an array of all registered schemas. This is used for debugging, documentation generation, and building dynamic UIs:

```typescript
// Pattern from src/function/list.ts:41-44
export async function listExchanges(): Promise<IExchangeSchema[]> {
  backtest.loggerService.log(LIST_EXCHANGES_METHOD_NAME);
  return await backtest.exchangeValidationService.list();
}
```

**Sources:** [src/function/list.ts:41-44](), [src/function/list.ts:76-79](), [src/function/list.ts:106-109]()

### Pattern 4: Reference Validation

Some validation services check that referenced components exist. For example, `WalkerValidationService` validates that all strategy names in the `strategies` array exist, and that the `exchangeName` and `frameName` references are valid.

This cross-component validation ensures that the execution engine never attempts to use non-existent components, preventing runtime errors.

**Sources:** [src/function/add.ts:188-199]()

---

## Error Handling

### Validation Errors

When validation fails, the validation service throws an error immediately. This error propagates back to the caller (typically the `add*` function), which then propagates to the user. Validation errors are synchronous and deterministic - they occur at registration time, not at execution time.

**Example Error Scenarios:**

1. **Invalid Schema Structure:** Missing required fields or invalid types
2. **Reference Errors:** Referenced components don't exist (e.g., `riskName` not registered)
3. **Constraint Violations:** Values outside valid ranges (e.g., negative `maxConcurrentPositions`)
4. **Runtime Signal Validation:** Invalid signal prices, TP/SL logic, or lifetime

**Sources:** [test/e2e/defend.test.mjs:544-641](), [test/e2e/sanitize.test.mjs:110-130]()

### Signal Rejection vs. Validation Errors

It's important to distinguish between two types of validation failures:

| Type | Timing | Behavior | Example |
|------|--------|----------|---------|
| **Schema Validation Error** | Registration time | Throws exception, prevents component registration | Missing `strategyName` field |
| **Signal Rejection** | Runtime (during execution) | Signal marked as `idle`, no exception thrown | TP/SL distances too close |

Signal rejections are part of normal execution flow - the framework validates every signal generated by `getSignal()` and silently rejects invalid ones. Schema validation errors are exceptional conditions that indicate programmer error.

**Sources:** [test/e2e/defend.test.mjs:25-145](), [test/e2e/sanitize.test.mjs:110-130]()

---

## Integration with Other Services

### Validation → Schema Storage Flow

![Mermaid Diagram](./diagrams/40_Validation_Services_4.svg)

After a schema passes validation:
1. It's stored in the corresponding `*SchemaService` (see [Schema Services](./39_Schema_Services.md))
2. During execution, `*ConnectionService` retrieves it (see [Connection Services](./38_Connection_Services.md))
3. `*ConnectionService` creates a memoized `Client*` instance
4. The `Client*` instance uses the validated schema for all operations

This ensures that only validated schemas reach the execution engine.

**Sources:** [src/function/add.ts:50-62](), [src/lib/index.ts:80-91](), [src/lib/index.ts:143-150]()

### Validation Service DI Bindings

All validation services are registered in the DI container as singletons:

```typescript
// From src/lib/core/provide.ts:102-109
{
    provide(TYPES.exchangeValidationService, () => new ExchangeValidationService());
    provide(TYPES.strategyValidationService, () => new StrategyValidationService());
    provide(TYPES.frameValidationService, () => new FrameValidationService());
    provide(TYPES.walkerValidationService, () => new WalkerValidationService());
    provide(TYPES.sizingValidationService, () => new SizingValidationService());
    provide(TYPES.riskValidationService, () => new RiskValidationService());
}
```

The singleton pattern ensures that validation results and registered schemas are shared across the entire application lifecycle.

**Sources:** [src/lib/core/provide.ts:102-109](), [src/lib/core/types.ts:59-66](), [src/lib/index.ts:143-150]()