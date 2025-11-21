# Configuration Functions

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [src/function/add.ts](src/function/add.ts)
- [src/function/exchange.ts](src/function/exchange.ts)
- [src/index.ts](src/index.ts)
- [types.d.ts](types.d.ts)

</details>



## Purpose and Scope

This document describes the three public API functions for registering configurations in the backtest-kit framework: `addStrategy()`, `addExchange()`, and `addFrame()`. These functions store schema objects in registry services that are later used by Connection Services to instantiate client components at runtime.

For information about running backtests and live trading with these configurations, see [Backtest API](#3.2) and [Live Trading API](#3.3). For details on how schema registries work internally, see [Schema Services](#5.2).

**Sources:** [types.d.ts:545-646](), [src/function/add.ts:1-135](), [README.md:30-103]()

---

## Overview

The configuration system separates registration (startup phase) from instantiation (runtime phase). Users register schemas via three functions, which store configurations in singleton registry services. At execution time, Connection Services retrieve these schemas and create memoized client instances.

![Mermaid Diagram](./diagrams\09_Configuration_Functions_0.svg)

**Figure 1: Configuration Registration and Runtime Retrieval Flow**

The three configuration functions are:

| Function | Schema Type | Purpose | Registry Service |
|----------|-------------|---------|------------------|
| `addStrategy()` | `IStrategySchema` | Registers signal generation logic with interval throttling | `StrategySchemaService` |
| `addExchange()` | `IExchangeSchema` | Registers candle data source and formatting functions | `ExchangeSchemaService` |
| `addFrame()` | `IFrameSchema` | Registers timeframe generator for backtest periods | `FrameSchemaService` |

**Sources:** [src/function/add.ts:1-135](), [types.d.ts:410-646]()

---

## addStrategy Function

### Function Signature

The `addStrategy()` function registers a trading strategy configuration that defines signal generation logic, throttling interval, and optional lifecycle callbacks.

```typescript
function addStrategy(strategySchema: IStrategySchema): void
```

**Sources:** [types.d.ts:545-579](), [src/function/add.ts:44-52]()

### IStrategySchema Interface

The strategy schema contains the core strategy configuration:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `strategyName` | `StrategyName` (string) | ✅ | Unique strategy identifier used for registration and retrieval |
| `interval` | `SignalInterval` | ✅ | Throttling interval: `"1m"` \| `"3m"` \| `"5m"` \| `"15m"` \| `"30m"` \| `"1h"` |
| `getSignal` | `(symbol: string) => Promise<ISignalDto \| null>` | ✅ | Async function returning signal DTO or null if no signal |
| `callbacks` | `Partial<IStrategyCallbacks>` | ❌ | Optional lifecycle event handlers (onTick, onOpen, onActive, onIdle, onClose) |

**Sources:** [types.d.ts:410-422]()

### Signal Generation Function

The `getSignal` function is called at most once per `interval` due to automatic throttling. It must return either:
- `ISignalDto` object with required fields (validated by ClientStrategy)
- `null` if no signal should be generated

![Mermaid Diagram](./diagrams\09_Configuration_Functions_1.svg)

**Figure 2: Signal Generation Flow with Throttling and Validation**

**Sources:** [types.d.ts:417-419]()

### ISignalDto Structure

The signal DTO returned by `getSignal` must contain:

| Field | Type | Required | Validation Rules |
|-------|------|----------|------------------|
| `id` | `string` | ❌ | Auto-generated UUID v4 if not provided |
| `position` | `"long"` \| `"short"` | ✅ | Trade direction |
| `note` | `string` | ❌ | Human-readable signal description |
| `priceOpen` | `number` | ✅ | Must be positive. Entry price for position. |
| `priceTakeProfit` | `number` | ✅ | Long: must be > priceOpen. Short: must be < priceOpen. |
| `priceStopLoss` | `number` | ✅ | Long: must be < priceOpen. Short: must be > priceOpen. |
| `minuteEstimatedTime` | `number` | ✅ | Must be positive. Signal duration before time_expired. |

**Sources:** [types.d.ts:358-376]()

### Lifecycle Callbacks

Optional callbacks in `IStrategyCallbacks`:

| Callback | Parameters | When Called |
|----------|-----------|-------------|
| `onTick` | `(symbol, result, backtest)` | On every tick execution (idle, opened, active, closed) |
| `onOpen` | `(symbol, data, currentPrice, backtest)` | After signal validation and persistence |
| `onActive` | `(symbol, data, currentPrice, backtest)` | When monitoring active signal (every tick) |
| `onIdle` | `(symbol, currentPrice, backtest)` | When no active signal exists |
| `onClose` | `(symbol, data, priceClose, backtest)` | When signal closes (TP/SL/time_expired) |

**Sources:** [types.d.ts:393-408]()

### Implementation Details

The `addStrategy()` function implementation in [src/function/add.ts:44-52]():

1. Logs the registration via `LoggerService` with topic `"add.addStrategy"`
2. Calls `strategySchemaService.register(strategyName, strategySchema)` to store in registry
3. Does not validate the schema (validation happens at runtime in ClientStrategy)

**Sources:** [src/function/add.ts:44-52]()

---

## addExchange Function

### Function Signature

The `addExchange()` function registers an exchange data source that provides historical candle data and formatting functions.

```typescript
function addExchange(exchangeSchema: IExchangeSchema): void
```

**Sources:** [types.d.ts:580-615](), [src/function/add.ts:89-97]()

### IExchangeSchema Interface

The exchange schema defines data source integration:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `exchangeName` | `ExchangeName` (string) | ✅ | Unique exchange identifier |
| `getCandles` | `(symbol, interval, since, limit) => Promise<ICandleData[]>` | ✅ | Fetches historical OHLCV candle data |
| `formatQuantity` | `(symbol, quantity) => Promise<string>` | ✅ | Formats quantity per exchange precision rules |
| `formatPrice` | `(symbol, price) => Promise<string>` | ✅ | Formats price per exchange precision rules |
| `callbacks` | `Partial<IExchangeCallbacks>` | ❌ | Optional event handlers (onCandleData) |

**Sources:** [types.d.ts:137-171]()

### getCandles Function

The `getCandles` implementation must fetch historical candle data:

**Parameters:**
- `symbol: string` - Trading pair (e.g., "BTCUSDT")
- `interval: CandleInterval` - Time interval: `"1m"` \| `"3m"` \| `"5m"` \| `"15m"` \| `"30m"` \| `"1h"` \| `"2h"` \| `"4h"` \| `"6h"` \| `"8h"`
- `since: Date` - Start date for candle fetching (backwards from this point)
- `limit: number` - Maximum number of candles to return

**Returns:** `Promise<ICandleData[]>` array sorted by timestamp ascending

**Sources:** [types.d.ts:144-152]()

### ICandleData Structure

Each candle object must contain:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `number` | Unix timestamp in milliseconds when candle opened |
| `open` | `number` | Opening price at candle start |
| `high` | `number` | Highest price during candle period |
| `low` | `number` | Lowest price during candle period |
| `close` | `number` | Closing price at candle end |
| `volume` | `number` | Trading volume during candle period |

**Sources:** [types.d.ts:103-118]()

### Format Functions

The formatting functions ensure prices and quantities match exchange precision rules:

- `formatPrice(symbol, price)` - Returns formatted price string (e.g., "50000.12")
- `formatQuantity(symbol, quantity)` - Returns formatted quantity string (e.g., "0.12345678")

These are typically implemented using exchange API metadata or hardcoded precision rules.

**Sources:** [types.d.ts:153-169]()

### Exchange Registration Flow

![Mermaid Diagram](./diagrams\09_Configuration_Functions_2.svg)

**Figure 3: Exchange Schema Registration Sequence**

**Sources:** [src/function/add.ts:89-97]()

---

## addFrame Function

### Function Signature

The `addFrame()` function registers a timeframe generator for backtesting with defined start/end dates and interval.

```typescript
function addFrame(frameSchema: IFrameSchema): void
```

**Sources:** [types.d.ts:616-646](), [src/function/add.ts:129-134]()

### IFrameSchema Interface

The frame schema configures backtest period generation:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `frameName` | `FrameName` (string) | ✅ | Unique frame identifier |
| `interval` | `FrameInterval` | ✅ | Timestamp spacing interval |
| `startDate` | `Date` | ✅ | Start of backtest period (inclusive) |
| `endDate` | `Date` | ✅ | End of backtest period (inclusive) |
| `callbacks` | `Partial<IFrameCallbacks>` | ❌ | Optional lifecycle callbacks (onTimeframe) |

**Sources:** [types.d.ts:278-289]()

### Frame Intervals

Valid `FrameInterval` values determine timestamp spacing:

| Category | Intervals |
|----------|-----------|
| Minutes | `"1m"`, `"3m"`, `"5m"`, `"15m"`, `"30m"` |
| Hours | `"1h"`, `"2h"`, `"4h"`, `"6h"`, `"8h"`, `"12h"` |
| Days | `"1d"`, `"3d"` |

The frame generates an array of `Date` objects spaced by the specified interval between `startDate` and `endDate`.

**Sources:** [types.d.ts:234-235]()

### Timeframe Generation

When a backtest runs, the frame generates timestamps:

![Mermaid Diagram](./diagrams\09_Configuration_Functions_3.svg)

**Figure 4: Timeframe Array Generation**

**Sources:** [types.d.ts:278-303]()

### Frame Callbacks

The `onTimeframe` callback is invoked after timestamp array generation:

```typescript
onTimeframe: (
  timeframe: Date[],      // Generated timestamp array
  startDate: Date,        // Schema startDate
  endDate: Date,          // Schema endDate
  interval: FrameInterval // Schema interval
) => void
```

This callback is useful for logging timestamp counts or validating the generated timeframe.

**Sources:** [types.d.ts:247-258]()

---

## Registration Flow Architecture

### Schema Storage

Each schema service maintains an internal `Map` data structure:

| Service | Key Type | Value Type | Storage Location |
|---------|----------|------------|------------------|
| `StrategySchemaService` | `StrategyName` | `IStrategySchema` | Memory (singleton service) |
| `ExchangeSchemaService` | `ExchangeName` | `IExchangeSchema` | Memory (singleton service) |
| `FrameSchemaService` | `FrameName` | `IFrameSchema` | Memory (singleton service) |

These registries persist for the lifetime of the Node.js process. They are not stored on disk.

**Sources:** [types.d.ts:410-646]()

### Registration Example

The following demonstrates registering all three schema types:

```typescript
import { addStrategy, addExchange, addFrame } from "backtest-kit";

// 1. Register exchange data source
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    // Implementation fetches from API or database
    return candles; // ICandleData[]
  },
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

// 2. Register trading strategy
addStrategy({
  strategyName: "trend-following",
  interval: "5m",
  getSignal: async (symbol) => {
    // Implementation checks indicators
    if (shouldOpenLong) {
      return {
        position: "long",
        priceOpen: 50000,
        priceTakeProfit: 51000,
        priceStopLoss: 49000,
        minuteEstimatedTime: 60,
      };
    }
    return null;
  },
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal opened:`, signal.id);
    },
  },
});

// 3. Register backtest timeframe
addFrame({
  frameName: "jan-2024",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-31T23:59:59Z"),
  callbacks: {
    onTimeframe: (timeframe) => {
      console.log(`Generated ${timeframe.length} timestamps`);
    },
  },
});
```

**Sources:** [README.md:30-103]()

---

## Schema Retrieval at Runtime

### Connection Service Access Pattern

When backtest or live execution starts, Connection Services retrieve schemas by name:

![Mermaid Diagram](./diagrams\09_Configuration_Functions_5.svg)

**Figure 6: Schema Retrieval and Client Instantiation with Memoization**

This memoization ensures that multiple calls with the same `strategyName` return the same `ClientStrategy` instance, preserving state across ticks.

**Sources:** [types.d.ts:1-1200]()

### Context Routing

The `MethodContextService` provides implicit context propagation:

```typescript
// MethodContextService context structure
interface IMethodContext {
  exchangeName: ExchangeName;  // Which exchange to use
  strategyName: StrategyName;  // Which strategy to use
  frameName: FrameName;        // Which frame to use (empty in live mode)
}
```

This context is set by `Backtest.run()` or `Live.run()` and automatically routes to the correct schema registries.

**Sources:** [types.d.ts:310-350]()

---

## Schema Validation

### Registration Time

The `add*()` functions perform **no validation** at registration time. Invalid schemas are stored as-is.

**Sources:** [src/function/add.ts:1-135]()

### Runtime Validation

Validation occurs when:

1. **ClientStrategy** validates `ISignalDto` returned by `getSignal()`:
   - All prices must be positive
   - Take profit logic: long requires TP > open, short requires TP < open
   - Stop loss logic: long requires SL < open, short requires SL > open
   - Time must be positive
   - Throws detailed validation errors if invalid

2. **ClientExchange** validates candle data:
   - Ensures non-empty arrays
   - Validates OHLCV data structure

3. **ClientFrame** validates date range:
   - Ensures `endDate >= startDate`
   - Validates interval values

Validation errors throw exceptions with descriptive messages.

**Sources:** [types.d.ts:358-422]()

---

## Multiple Schema Registration

### Registering Multiple Strategies

Multiple strategies can be registered with different names:

```typescript
addStrategy({
  strategyName: "strategy-1",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
});

addStrategy({
  strategyName: "strategy-2",
  interval: "15m",
  getSignal: async (symbol) => { /* ... */ },
});

// Run both strategies simultaneously
Backtest.run("BTCUSDT", {
  strategyName: "strategy-1",
  exchangeName: "binance",
  frameName: "frame-1",
});

Backtest.run("BTCUSDT", {
  strategyName: "strategy-2",
  exchangeName: "binance",
  frameName: "frame-1",
});
```

Each strategy maintains independent state (separate `ClientStrategy` instances due to memoization by name).

**Sources:** [types.d.ts:545-579]()

### Overwriting Schemas

Calling `add*()` with an existing name **overwrites** the previous schema:

```typescript
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async () => null,
});

// Overwrites previous registration
addStrategy({
  strategyName: "my-strategy",
  interval: "15m",  // Changed interval
  getSignal: async () => null,
});
```

The memoization cache is **not** cleared, so existing instances continue using the old schema. Only new requests retrieve the updated schema.

**Sources:** [src/function/add.ts:44-134]()

---

## Type Exports

All schema interfaces are exported from the main package:

```typescript
import {
  IStrategySchema,
  IExchangeSchema,
  IFrameSchema,
  addStrategy,
  addExchange,
  addFrame,
} from "backtest-kit";
```

Supporting types also exported:

- `SignalInterval` - Strategy throttling intervals
- `CandleInterval` - Exchange candle intervals  
- `FrameInterval` - Frame timestamp spacing intervals
- `ISignalDto` - Signal data transfer object
- `ICandleData` - Candle OHLCV structure
- `IStrategyCallbacks` - Strategy lifecycle callbacks
- `IExchangeCallbacks` - Exchange lifecycle callbacks
- `IFrameCallbacks` - Frame lifecycle callbacks

**Sources:** [src/index.ts:1-56]()