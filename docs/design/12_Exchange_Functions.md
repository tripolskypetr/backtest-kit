# Exchange Functions

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/function/add.ts](src/function/add.ts)
- [src/function/exchange.ts](src/function/exchange.ts)
- [src/index.ts](src/index.ts)
- [types.d.ts](types.d.ts)

</details>



This page documents the public utility functions for interacting with exchange data and execution context. These functions provide candle data fetching, VWAP calculation, price/quantity formatting, and execution context queries.

For exchange registration and configuration, see [Configuration Functions](#3.1). For the underlying exchange business logic implementation, see [ClientExchange](#4.2). For exchange service orchestration, see [Global Services](#5.3).

---

## Overview

Exchange functions are exported from [src/function/exchange.ts]() and provide a simplified public API for accessing exchange operations without directly interacting with the service layer. These functions automatically handle context propagation and logging.

| Function | Purpose | Returns |
|----------|---------|---------|
| `getCandles` | Fetch historical OHLCV data | `Promise<ICandleData[]>` |
| `getAveragePrice` | Calculate VWAP from last 5 1m candles | `Promise<number>` |
| `formatPrice` | Format price to exchange precision | `Promise<string>` |
| `formatQuantity` | Format quantity to exchange precision | `Promise<string>` |
| `getDate` | Get current execution context date | `Promise<Date>` |
| `getMode` | Get current execution mode | `Promise<"backtest" \| "live">` |

**Sources:** [src/function/exchange.ts:1-166](), [types.d.ts:795-893]()

---

## Function Call Flow

![Mermaid Diagram](./diagrams\12_Exchange_Functions_0.svg)

**Sources:** [src/function/exchange.ts:28-166](), [src/lib/services/connection/ExchangeConnectionService.ts]()

---

## getCandles

Fetches historical candle data from the registered exchange, backwards from the current execution context time.

### Signature

```typescript
function getCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number
): Promise<ICandleData[]>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair symbol (e.g., `"BTCUSDT"`) |
| `interval` | `CandleInterval` | Time interval: `"1m"` \| `"3m"` \| `"5m"` \| `"15m"` \| `"30m"` \| `"1h"` \| `"2h"` \| `"4h"` \| `"6h"` \| `"8h"` |
| `limit` | `number` | Maximum number of candles to fetch |

### Returns

`Promise<ICandleData[]>` - Array of OHLCV candle objects:

```typescript
interface ICandleData {
  timestamp: number;  // Unix milliseconds when candle opened
  open: number;       // Opening price
  high: number;       // Highest price during period
  low: number;        // Lowest price during period
  close: number;      // Closing price
  volume: number;     // Trading volume
}
```

### Behavior

1. Logs function call via `loggerService.info` with parameters
2. Delegates to `exchangeConnectionService.getCandles()`
3. Uses execution context date (`ExecutionContextService.context.when`) as the "since" time
4. In backtest mode, fetches historical data from the past
5. In live mode, fetches recent data up to current time

### Usage Example

```typescript
import { getCandles } from "backtest-kit";

// Inside getSignal or strategy callback
const candles = await getCandles("BTCUSDT", "1h", 24);
console.log(`Fetched ${candles.length} hourly candles`);

// Calculate simple moving average
const sma = candles.reduce((sum, c) => sum + c.close, 0) / candles.length;
```

**Sources:** [src/function/exchange.ts:28-43](), [types.d.ts:795-810]()

---

## getAveragePrice

Calculates Volume Weighted Average Price (VWAP) from the last 5 one-minute candles.

### Signature

```typescript
function getAveragePrice(symbol: string): Promise<number>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair symbol (e.g., `"BTCUSDT"`) |

### Returns

`Promise<number>` - Volume weighted average price

### VWAP Calculation

![Mermaid Diagram](./diagrams\12_Exchange_Functions_1.svg)

The formula implemented in `ClientExchange`:
- **Typical Price** = `(high + low + close) / 3`
- **VWAP** = `Σ(typical_price × volume) / Σ(volume)`
- **Fallback** (if total volume is zero): `Σ(close) / count`

### Behavior

1. Logs function call via `loggerService.info`
2. Delegates to `exchangeConnectionService.getAveragePrice()`
3. Internally calls `getCandles(symbol, "1m", 5)`
4. Applies VWAP formula to fetched candles

### Usage Example

```typescript
import { getAveragePrice } from "backtest-kit";

// Get current market price for signal generation
const currentPrice = await getAveragePrice("BTCUSDT");

// Generate signal if price crosses threshold
if (currentPrice > threshold) {
  return {
    position: "long",
    priceOpen: currentPrice,
    priceTakeProfit: currentPrice * 1.02,
    priceStopLoss: currentPrice * 0.98,
    minuteEstimatedTime: 60,
  };
}
```

**Sources:** [src/function/exchange.ts:63-68](), [types.d.ts:812-829]()

---

## formatPrice

Formats a price value according to the exchange's precision rules.

### Signature

```typescript
function formatPrice(
  symbol: string,
  price: number
): Promise<string>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair symbol (e.g., `"BTCUSDT"`) |
| `price` | `number` | Raw price value to format |

### Returns

`Promise<string>` - Formatted price string with exchange-appropriate decimal places

### Behavior

1. Logs function call via `loggerService.info` with symbol and price
2. Delegates to `exchangeConnectionService.formatPrice()`
3. Uses the `formatPrice` implementation from the registered `IExchangeSchema`

Different exchanges have different precision rules:
- Bitcoin pairs: typically 2 decimal places (`"50000.12"`)
- Altcoin pairs: may have 4-8 decimal places (`"0.00012345"`)

### Usage Example

```typescript
import { formatPrice, getAveragePrice } from "backtest-kit";

const vwap = await getAveragePrice("BTCUSDT");
const formatted = await formatPrice("BTCUSDT", vwap);

console.log(`Current BTCUSDT price: $${formatted}`);
// Output: "Current BTCUSDT price: $50125.43"
```

**Sources:** [src/function/exchange.ts:85-94](), [types.d.ts:831-845]()

---

## formatQuantity

Formats a quantity (order size) value according to the exchange's precision rules.

### Signature

```typescript
function formatQuantity(
  symbol: string,
  quantity: number
): Promise<string>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair symbol (e.g., `"BTCUSDT"`) |
| `quantity` | `number` | Raw quantity value to format |

### Returns

`Promise<string>` - Formatted quantity string with exchange-appropriate decimal places

### Behavior

1. Logs function call via `loggerService.info` with symbol and quantity
2. Delegates to `exchangeConnectionService.formatQuantity()`
3. Uses the `formatQuantity` implementation from the registered `IExchangeSchema`

Different exchanges have different lot size rules:
- Bitcoin quantities: typically 8 decimal places (`"0.12345678"`)
- Altcoin quantities: may vary based on minimum order size

### Usage Example

```typescript
import { formatQuantity } from "backtest-kit";

const orderSize = 0.123456789;
const formatted = await formatQuantity("BTCUSDT", orderSize);

console.log(`Order size: ${formatted} BTC`);
// Output: "Order size: 0.12345678 BTC"
```

**Sources:** [src/function/exchange.ts:111-123](), [types.d.ts:847-861]()

---

## getDate

Retrieves the current execution context date, which differs based on execution mode.

### Signature

```typescript
function getDate(): Promise<Date>
```

### Returns

`Promise<Date>` - Current date from execution context:
- **Backtest mode**: Current timeframe timestamp being processed
- **Live mode**: Real-time current date (`Date.now()`)

### Behavior

1. Logs function call via `loggerService.info`
2. Accesses `executionContextService.context.when`
3. Returns a new `Date` instance (copy) to prevent mutation

### Context Injection Flow

![Mermaid Diagram](./diagrams\12_Exchange_Functions_2.svg)

### Usage Example

```typescript
import { getDate, getMode } from "backtest-kit";

// Inside getSignal function
const currentDate = await getDate();
const mode = await getMode();

console.log(`[${mode}] Current date: ${currentDate.toISOString()}`);
// Backtest: "[backtest] Current date: 2024-01-15T14:30:00.000Z"
// Live:     "[live] Current date: 2024-12-20T08:45:23.456Z"

// Check if within trading hours
const hour = currentDate.getUTCHours();
const isTradingHours = hour >= 9 && hour < 17;
```

**Sources:** [src/function/exchange.ts:139-143](), [types.d.ts:863-876]()

---

## getMode

Determines whether the current execution is running in backtest or live mode.

### Signature

```typescript
function getMode(): Promise<"backtest" | "live">
```

### Returns

`Promise<"backtest" | "live">` - Current execution mode:
- `"backtest"`: Historical simulation mode
- `"live"`: Real-time trading mode

### Behavior

1. Logs function call via `loggerService.info`
2. Accesses `executionContextService.context.backtest`
3. Returns `"backtest"` if flag is `true`, `"live"` if `false`

### Mode Differences

| Aspect | Backtest Mode | Live Mode |
|--------|---------------|-----------|
| Date progression | Historical timestamps from `FrameGlobalService` | Real-time `Date.now()` |
| Signal persistence | Memory only | Atomic file writes via `PersistSignalAdapter` |
| Execution speed | Fast-forward through timeframes | 1-minute intervals with sleep |
| Candle data | Fetch historical + future (for simulation) | Fetch recent only |

### Usage Example

```typescript
import { getMode, getDate } from "backtest-kit";

// Conditional logging based on mode
const mode = await getMode();
const date = await getDate();

if (mode === "live") {
  console.log(`[LIVE TRADING] ${date.toISOString()}`);
  // Send alert, write to database, etc.
} else {
  // Minimal logging in backtest for performance
  console.debug(`[BACKTEST] ${date.toISOString()}`);
}
```

**Sources:** [src/function/exchange.ts:160-164](), [types.d.ts:878-893]()

---

## Context Propagation Architecture

These functions rely on implicit context propagation via `ExecutionContextService` and `MethodContextService`.

### Scoped Context Flow

![Mermaid Diagram](./diagrams\12_Exchange_Functions_3.svg)

### IExecutionContext Interface

The execution context contains three fields:

```typescript
interface IExecutionContext {
  symbol: string;   // Trading pair (e.g., "BTCUSDT")
  when: Date;       // Current timestamp
  backtest: boolean; // Mode flag
}
```

**Context Lifecycle:**
1. **Set by Logic Service**: `BacktestLogicPrivateService` or `LiveLogicPrivateService` calls `ExecutionContextService.runInContext()`
2. **Propagated Implicitly**: Uses `di-scoped` library to make context available to nested function calls
3. **Read by Exchange Functions**: `getDate()` and `getMode()` directly access `context`
4. **Used by ClientExchange**: `getCandles()` and `getAveragePrice()` use `context.when` for time-based queries

**Sources:** [src/lib/services/context/ExecutionContextService.ts](), [types.d.ts:52-95]()

---

## Usage Patterns

### Pattern 1: Technical Indicator Calculation

```typescript
import { getCandles } from "backtest-kit";

// Inside getSignal function
async function calculateRSI(symbol: string, period: number = 14) {
  const candles = await getCandles(symbol, "1h", period + 1);
  
  // Calculate RSI from candle data
  let gains = 0, losses = 0;
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}
```

### Pattern 2: Price Comparison with Formatting

```typescript
import { getAveragePrice, formatPrice } from "backtest-kit";

// Check if current price is within acceptable range
const currentPrice = await getAveragePrice("BTCUSDT");
const targetPrice = 50000;
const threshold = targetPrice * 0.01; // 1% threshold

if (Math.abs(currentPrice - targetPrice) <= threshold) {
  const formatted = await formatPrice("BTCUSDT", currentPrice);
  console.log(`Price ${formatted} is near target ${targetPrice}`);
}
```

### Pattern 3: Mode-Specific Behavior

```typescript
import { getMode, getDate, getAveragePrice } from "backtest-kit";

const mode = await getMode();
const currentDate = await getDate();
const price = await getAveragePrice("BTCUSDT");

if (mode === "live") {
  // Send real-time alert
  await sendTelegramAlert(`BTC price: $${price} at ${currentDate}`);
} else {
  // Just log for backtest
  console.log(`[${currentDate.toISOString()}] BTC: $${price}`);
}
```

### Pattern 4: Multi-Interval Analysis

```typescript
import { getCandles } from "backtest-kit";

// Analyze multiple timeframes for signal confirmation
const candles1m = await getCandles("BTCUSDT", "1m", 60);
const candles1h = await getCandles("BTCUSDT", "1h", 24);
const candles4h = await getCandles("BTCUSDT", "4h", 24);

// Short-term trend from 1m candles
const shortTermTrend = candles1m[0].close > candles1m[59].close;

// Medium-term trend from 1h candles
const mediumTermTrend = candles1h[0].close > candles1h[23].close;

// Long-term trend from 4h candles
const longTermTrend = candles4h[0].close > candles4h[23].close;

// Signal only if all trends align
if (shortTermTrend && mediumTermTrend && longTermTrend) {
  return generateLongSignal();
}
```

**Sources:** [src/function/exchange.ts:1-166]()

---

## Error Handling

Exchange functions propagate errors from the underlying service layer.

### Common Error Scenarios

| Error Type | Cause | Example |
|------------|-------|---------|
| **No Exchange Registered** | `addExchange()` not called for current exchange name | `Error: Exchange "binance" not registered` |
| **Invalid Context** | Function called outside `Backtest.run()` or `Live.run()` | `Error: ExecutionContext not available` |
| **API Failure** | Exchange API returns error or timeout | `Error: Failed to fetch candles from API` |
| **Invalid Parameters** | Symbol or interval format incorrect | `Error: Invalid candle interval "2m"` |

### Error Propagation Flow

![Mermaid Diagram](./diagrams\12_Exchange_Functions_4.svg)

### Handling Errors

```typescript
import { getCandles, getAveragePrice } from "backtest-kit";

try {
  const candles = await getCandles("BTCUSDT", "1h", 24);
  const vwap = await getAveragePrice("BTCUSDT");
  
  // Process data
  
} catch (error) {
  console.error("Exchange operation failed:", error);
  
  // In live mode, might want to retry or alert
  // In backtest mode, might want to skip this timestamp
  
  return null; // No signal on error
}
```

**Sources:** [src/function/exchange.ts:1-166](), [src/lib/services/connection/ExchangeConnectionService.ts]()

---

## Logging Behavior

All exchange functions automatically log their invocations via `loggerService.info()`.

### Log Format

Each function logs with a consistent method name pattern:

| Function | Log Method Name | Logged Parameters |
|----------|----------------|-------------------|
| `getCandles` | `"exchange.getCandles"` | `{ symbol, interval, limit }` |
| `getAveragePrice` | `"exchange.getAveragePrice"` | `{ symbol }` |
| `formatPrice` | `"exchange.formatPrice"` | `{ symbol, price }` |
| `formatQuantity` | `"exchange.formatQuantity"` | `{ symbol, quantity }` |
| `getDate` | `"exchange.getDate"` | (none) |
| `getMode` | `"exchange.getMode"` | (none) |

### Automatic Context Enrichment

The `LoggerService` automatically enriches logs with execution context when available:

```typescript
// Log output example (automatic enrichment):
{
  method: "exchange.getCandles",
  strategyName: "my-strategy",
  exchangeName: "binance",
  symbol: "BTCUSDT",
  interval: "1h",
  limit: 24,
  timestamp: "2024-01-15T14:30:00.000Z",
  backtest: true
}
```

For custom logger configuration, see [Logging System](#10.1).

**Sources:** [src/function/exchange.ts:4-9](), [src/function/exchange.ts:33-37](), [src/function/exchange.ts:64-67](), [src/function/exchange.ts:89-92](), [src/function/exchange.ts:115-118](), [src/function/exchange.ts:140](), [src/function/exchange.ts:161]()