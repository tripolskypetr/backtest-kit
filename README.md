# Backtest Kit

> A production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()
[![Architecture](https://img.shields.io/badge/architecture-clean-orange)]()

## Features

- 🚀 **Production-Ready Architecture** - Backtest/live mode, robust error recovery
- 💾 **Crash-Safe Persistence** - Atomic file writes with automatic state recovery
- ✅ **Signal Validation** - Comprehensive validation prevents invalid trades
- 🔄 **Async Generators** - Memory-efficient streaming for backtest and live execution
- 📊 **VWAP Pricing** - Volume-weighted average price from last 5 1m candles
- 🎯 **Signal Lifecycle** - Type-safe state machine (idle → opened → active → closed)
- 📉 **Accurate PNL** - Calculation with fees (0.1%) and slippage (0.1%)
- 🧠 **Interval Throttling** - Prevents signal spam at strategy level
- ⚡ **Memory Optimized** - Prototype methods + memoization + streaming
- 🔌 **Flexible Architecture** - Plug your own exchanges and strategies
- 📝 **Markdown Reports** - Auto-generated trading reports with statistics (win rate, avg PNL, Sharpe Ratio, Standard Deviation, Certainty Ratio, Expected Yearly Returns)
- 🛑 **Graceful Shutdown** - Live.background() waits for open positions to close before stopping
- 💉 **Strategy Dependency Injection** - addStrategy() enables DI pattern for trading strategies
- 🔍 **Schema Reflection API** - listExchanges(), listStrategies(), listFrames() for runtime introspection
- 🧪 **Comprehensive Test Coverage** - 30+ unit tests covering validation, PNL, callbacks, reports, and event system

## Installation

```bash
npm install backtest-kit
```

## Quick Start

### 1. Register Exchange Data Source

```typescript
import { addExchange } from "backtest-kit";
import ccxt from "ccxt"; // Example using CCXT library

addExchange({
  exchangeName: "binance",

  // Fetch historical candles
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);

    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }));
  },

  // Format price according to exchange rules (e.g., 2 decimals for BTC)
  formatPrice: async (symbol, price) => {
    const exchange = new ccxt.binance();
    const market = exchange.market(symbol);
    return exchange.priceToPrecision(symbol, price);
  },

  // Format quantity according to exchange rules (e.g., 8 decimals)
  formatQuantity: async (symbol, quantity) => {
    const exchange = new ccxt.binance();
    return exchange.amountToPrecision(symbol, quantity);
  },
});
```

**Alternative: Database implementation**

```typescript
import { addExchange } from "backtest-kit";
import { db } from "./database"; // Your database client

addExchange({
  exchangeName: "binance-db",

  getCandles: async (symbol, interval, since, limit) => {
    // Fetch from database for faster backtesting
    return await db.query(`
      SELECT timestamp, open, high, low, close, volume
      FROM candles
      WHERE symbol = $1 AND interval = $2 AND timestamp >= $3
      ORDER BY timestamp ASC
      LIMIT $4
    `, [symbol, interval, since, limit]);
  },

  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});
```

### 2. Register Trading Strategy

```typescript
import { addStrategy } from "backtest-kit";

addStrategy({
  strategyName: "my-strategy",
  interval: "5m", // Throttling: signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    // Your signal generation logic
    // Validation happens automatically (prices, TP/SL logic, timestamps)
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: 50000,
      priceTakeProfit: 51000,  // Must be > priceOpen for long
      priceStopLoss: 49000,     // Must be < priceOpen for long
      minuteEstimatedTime: 60,  // Signal duration in minutes
      timestamp: Date.now(),
    };
  },
  callbacks: {
    onOpen: (backtest, symbol, signal) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal opened:`, signal.id);
    },
    onClose: (backtest, symbol, priceClose, signal) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal closed:`, priceClose);
    },
  },
});
```

### 3. Add Timeframe Generator

```typescript
import { addFrame } from "backtest-kit";

addFrame({
  frameName: "1d-backtest",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
  callbacks: {
    onTimeframe: (timeframe, startDate, endDate, interval) => {
      console.log(`Generated ${timeframe.length} timeframes from ${startDate} to ${endDate}`);
    },
  },
});
```

### 4. Run Backtest

```typescript
import { Backtest, listenSignalBacktest, listenError, listenDone } from "backtest-kit";

// Run backtest in background
const stopBacktest = Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to closed signals
listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

// Listen to errors
listenError((error) => {
  console.error("Error:", error.message);
});

// Listen to completion
listenDone((event) => {
  if (event.backtest) {
    console.log("Backtest completed:", event.symbol);
    // Generate and save report
    Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
  }
});
```

### 5. Run Live Trading (Crash-Safe)

```typescript
import { Live, listenSignalLive, listenError, listenDone } from "backtest-kit";

// Run live trading in background (infinite loop, crash-safe)
const stop = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Listen to all signal events
listenSignalLive((event) => {
  if (event.action === "opened") {
    console.log("Signal opened:", event.signal.id);
  }

  if (event.action === "closed") {
    console.log("Signal closed:", {
      reason: event.closeReason,
      pnl: event.pnl.pnlPercentage,
    });

    // Auto-save report
    Live.dump(event.strategyName);
  }
});

// Listen to errors
listenError((error) => {
  console.error("Error:", error.message);
});

// Listen to completion
listenDone((event) => {
  if (!event.backtest) {
    console.log("Live trading stopped:", event.symbol);
  }
});

// Stop when needed: stop();
```

**Crash Recovery:** If process crashes, restart with same code - state automatically recovered from disk (no duplicate signals).

### 6. Alternative: Async Generators (Optional)

For manual control over execution flow:

```typescript
import { Backtest, Live } from "backtest-kit";

// Manual backtest iteration
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
})) {
  console.log("PNL:", result.pnl.pnlPercentage);
  if (result.pnl.pnlPercentage < -5) break; // Early termination
}

// Manual live iteration (infinite loop)
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  if (result.action === "closed") {
    console.log("PNL:", result.pnl.pnlPercentage);
  }
}
```

### 7. Schema Reflection API (Optional)

Retrieve registered schemas at runtime for debugging, documentation, or building dynamic UIs:

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  listExchanges,
  listStrategies,
  listFrames
} from "backtest-kit";

// Register schemas with notes
addExchange({
  exchangeName: "binance",
  note: "Binance cryptocurrency exchange with database backend",
  getCandles: async (symbol, interval, since, limit) => [...],
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

addStrategy({
  strategyName: "sma-crossover",
  note: "Simple moving average crossover strategy (50/200)",
  interval: "5m",
  getSignal: async (symbol) => ({...}),
});

addFrame({
  frameName: "january-2024",
  note: "Full month backtest for January 2024",
  interval: "1m",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-02-01"),
});

// List all registered schemas
const exchanges = await listExchanges();
console.log("Available exchanges:", exchanges.map(e => ({
  name: e.exchangeName,
  note: e.note
})));
// Output: [{ name: "binance", note: "Binance cryptocurrency exchange..." }]

const strategies = await listStrategies();
console.log("Available strategies:", strategies.map(s => ({
  name: s.strategyName,
  note: s.note,
  interval: s.interval
})));
// Output: [{ name: "sma-crossover", note: "Simple moving average...", interval: "5m" }]

const frames = await listFrames();
console.log("Available frames:", frames.map(f => ({
  name: f.frameName,
  note: f.note,
  period: `${f.startDate.toISOString()} - ${f.endDate.toISOString()}`
})));
// Output: [{ name: "january-2024", note: "Full month backtest...", period: "2024-01-01..." }]
```

**Use cases:**
- Generate documentation automatically from registered schemas
- Build admin dashboards showing available strategies and exchanges
- Create CLI tools with auto-completion based on registered schemas
- Validate configuration files against registered schemas

## Architecture Overview

The framework follows **clean architecture** with:

- **Client Layer** - Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame)
- **Service Layer** - DI-based services organized by responsibility
  - **Schema Services** - Registry pattern for configuration
  - **Connection Services** - Memoized client instance creators
  - **Global Services** - Context wrappers for public API
  - **Logic Services** - Async generator orchestration (backtest/live)
- **Persistence Layer** - Crash-safe atomic file writes with `PersistSignalAdaper`

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## Signal Validation

All signals are validated automatically before execution:

```typescript
// ✅ Valid long signal
{
  position: "long",
  priceOpen: 50000,
  priceTakeProfit: 51000,  // ✅ 51000 > 50000
  priceStopLoss: 49000,     // ✅ 49000 < 50000
  minuteEstimatedTime: 60,  // ✅ positive
  timestamp: Date.now(),    // ✅ positive
}

// ❌ Invalid long signal - throws error
{
  position: "long",
  priceOpen: 50000,
  priceTakeProfit: 49000,  // ❌ 49000 < 50000 (must be higher for long)
  priceStopLoss: 51000,    // ❌ 51000 > 50000 (must be lower for long)
}

// ✅ Valid short signal
{
  position: "short",
  priceOpen: 50000,
  priceTakeProfit: 49000,  // ✅ 49000 < 50000 (profit goes down for short)
  priceStopLoss: 51000,    // ✅ 51000 > 50000 (stop loss goes up for short)
}
```

Validation errors include detailed messages for debugging.

## Custom Persistence Adapter

By default, signals are persisted to disk using atomic file writes (`./logs/data/signal/`). You can override the persistence layer with a custom adapter (e.g., Redis, MongoDB):

```typescript
import { PersistBase, PersistSignalAdaper, ISignalData, EntityId } from "backtest-kit";
import Redis from "ioredis";

// Create custom Redis adapter
class RedisPersist extends PersistBase {
  private redis = new Redis({
    host: "localhost",
    port: 6379,
  });

  async waitForInit(initial: boolean): Promise<void> {
    // Initialize Redis connection if needed
    await this.redis.ping();
  }

  async readValue(entityId: EntityId): Promise<ISignalData> {
    const key = `${this.entityName}:${entityId}`;
    const data = await this.redis.get(key);

    if (!data) {
      throw new Error(`Entity ${this.entityName}:${entityId} not found`);
    }

    return JSON.parse(data);
  }

  async hasValue(entityId: EntityId): Promise<boolean> {
    const key = `${this.entityName}:${entityId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async writeValue(entityId: EntityId, entity: ISignalData): Promise<void> {
    const key = `${this.entityName}:${entityId}`;
    await this.redis.set(key, JSON.stringify(entity));
  }
}

// Register custom adapter
PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);

// Now all signal persistence uses Redis
Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

**Key methods to implement:**
- `waitForInit(initial)` - Initialize storage connection
- `readValue(entityId)` - Read entity from storage
- `hasValue(entityId)` - Check if entity exists
- `writeValue(entityId, entity)` - Write entity to storage

The adapter is registered globally and applies to all strategies.

## Interval Throttling

Prevent signal spam with automatic throttling:

```typescript
addStrategy({
  strategyName: "my-strategy",
  interval: "5m", // Signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    // This function will be called max once per 5 minutes
    // Even if tick() is called every second
    return signal;
  },
});
```

Supported intervals: `"1m"`, `"3m"`, `"5m"`, `"15m"`, `"30m"`, `"1h"`

## Markdown Reports

Generate detailed trading reports with statistics:

### Backtest Reports

```typescript
import { Backtest } from "backtest-kit";

// Run backtest
const stopBacktest = Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Generate markdown report
const markdown = await Backtest.getReport("my-strategy");
console.log(markdown);

// Save to disk (default: ./logs/backtest/my-strategy.md)
await Backtest.dump("my-strategy");

// Save to custom path
await Backtest.dump("my-strategy", "./custom/path");
```

**Report includes:**
- Total closed signals
- All signal details (prices, TP/SL, PNL, duration, close reason)
- Timestamps for each signal

### Live Trading Reports

```typescript
import { Live } from "backtest-kit";

// Generate live trading report
const markdown = await Live.getReport("my-strategy");

// Save to disk (default: ./logs/live/my-strategy.md)
await Live.dump("my-strategy");
```

**Report includes:**
- Total events (idle, opened, active, closed)
- Closed signals count
- Win rate (% wins, wins/losses)
- Average PNL percentage
- Signal-by-signal details with current state

**Report example:**
```markdown
# Live Trading Report: my-strategy

Total events: 15
Closed signals: 5
Win rate: 60.00% (3W / 2L)
Average PNL: +1.23%

| Timestamp | Action | Symbol | Signal ID | Position | ... | PNL (net) | Close Reason |
|-----------|--------|--------|-----------|----------|-----|-----------|--------------|
| ...       | CLOSED | BTCUSD | abc-123   | LONG     | ... | +2.45%    | take_profit  |
```

## Event Listeners

Subscribe to signal events with filtering support. Useful for running strategies in background while reacting to specific events.

### Background Execution with Event Listeners

```typescript
import { Backtest, listenSignalBacktest } from "backtest-kit";

// Run backtest in background (doesn't yield results)
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to all backtest events
const unsubscribe = listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("Signal closed:", {
      pnl: event.pnl.pnlPercentage,
      reason: event.closeReason
    });
  }
});

// Stop listening when done
// unsubscribe();
```

### Listen Once with Filter

```typescript
import { Backtest, listenSignalBacktestOnce } from "backtest-kit";

// Run backtest in background
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Wait for first take profit event
listenSignalBacktestOnce(
  (event) => event.action === "closed" && event.closeReason === "take_profit",
  (event) => {
    console.log("First take profit hit!", event.pnl.pnlPercentage);
    // Automatically unsubscribes after first match
  }
);
```

### Live Trading with Event Listeners

```typescript
import { Live, listenSignalLive, listenSignalLiveOnce } from "backtest-kit";

// Run live trading in background (infinite loop)
const cancel = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Listen to all live events
listenSignalLive((event) => {
  if (event.action === "opened") {
    console.log("Signal opened:", event.signal.id);
  }
  if (event.action === "closed") {
    console.log("Signal closed:", event.pnl.pnlPercentage);
  }
});

// React to first stop loss once
listenSignalLiveOnce(
  (event) => event.action === "closed" && event.closeReason === "stop_loss",
  (event) => {
    console.error("Stop loss hit!", event.pnl.pnlPercentage);
    // Send alert, dump report, etc.
  }
);

// Stop live trading after some condition
// cancel();
```

### Listen to All Signals (Backtest + Live)

```typescript
import { listenSignal, listenSignalOnce, Backtest, Live } from "backtest-kit";

// Listen to both backtest and live events
listenSignal((event) => {
  console.log("Event:", event.action, event.strategyName);
});

// Wait for first loss from any source
listenSignalOnce(
  (event) => event.action === "closed" && event.pnl.pnlPercentage < 0,
  (event) => {
    console.log("First loss detected:", event.pnl.pnlPercentage);
  }
);

// Run both modes
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

**Available event listeners:**

- `listenSignal(callback)` - Subscribe to all signal events (backtest + live)
- `listenSignalOnce(filter, callback)` - Subscribe once with filter predicate
- `listenSignalBacktest(callback)` - Subscribe to backtest signals only
- `listenSignalBacktestOnce(filter, callback)` - Subscribe to backtest signals once
- `listenSignalLive(callback)` - Subscribe to live signals only
- `listenSignalLiveOnce(filter, callback)` - Subscribe to live signals once
- `listenError(callback)` - Subscribe to background execution errors
- `listenDone(callback)` - Subscribe to background completion events
- `listenDoneOnce(filter, callback)` - Subscribe to background completion once

All listeners return an `unsubscribe` function. All callbacks are processed sequentially using queued async execution.

### Listen to Background Completion

```typescript
import { listenDone, listenDoneOnce, Backtest, Live } from "backtest-kit";

// Listen to all completion events
listenDone((event) => {
  console.log("Execution completed:", {
    mode: event.backtest ? "backtest" : "live",
    symbol: event.symbol,
    strategy: event.strategyName,
    exchange: event.exchangeName,
  });

  // Auto-generate report on completion
  if (event.backtest) {
    Backtest.dump(event.strategyName);
  } else {
    Live.dump(event.strategyName);
  }
});

// Wait for specific backtest to complete
listenDoneOnce(
  (event) => event.backtest && event.symbol === "BTCUSDT",
  (event) => {
    console.log("BTCUSDT backtest finished");
    // Start next backtest or live trading
    Live.background(event.symbol, {
      strategyName: event.strategyName,
      exchangeName: event.exchangeName,
    });
  }
);

// Run backtests
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});
```

## API Reference

### High-Level Functions

#### Schema Registration

```typescript
// Register exchange
addExchange(exchangeSchema: IExchangeSchema): void

// Register strategy
addStrategy(strategySchema: IStrategySchema): void

// Register timeframe generator
addFrame(frameSchema: IFrameSchema): void
```

#### Exchange Data

```typescript
// Get historical candles
const candles = await getCandles("BTCUSDT", "1h", 5);
// Returns: [
//   { timestamp: 1704067200000, open: 42150.5, high: 42380.2, low: 42100.0, close: 42250.8, volume: 125.43 },
//   { timestamp: 1704070800000, open: 42250.8, high: 42500.0, low: 42200.0, close: 42450.3, volume: 98.76 },
//   { timestamp: 1704074400000, open: 42450.3, high: 42600.0, low: 42400.0, close: 42580.5, volume: 110.22 },
//   { timestamp: 1704078000000, open: 42580.5, high: 42700.0, low: 42550.0, close: 42650.0, volume: 95.18 },
//   { timestamp: 1704081600000, open: 42650.0, high: 42750.0, low: 42600.0, close: 42720.0, volume: 102.35 }
// ]

// Get VWAP from last 5 1m candles
const vwap = await getAveragePrice("BTCUSDT");
// Returns: 42685.34

// Get current date in execution context
const date = await getDate();
// Returns: 2024-01-01T12:00:00.000Z (in backtest mode, returns frame's current timestamp)
// Returns: 2024-01-15T10:30:45.123Z (in live mode, returns current wall clock time)

// Get current mode
const mode = await getMode();
// Returns: "backtest" or "live"

// Format price/quantity for exchange
const price = await formatPrice("BTCUSDT", 42685.3456789);
// Returns: "42685.35" (formatted to exchange precision)

const quantity = await formatQuantity("BTCUSDT", 0.123456789);
// Returns: "0.12345" (formatted to exchange precision)
```

### Service APIs

#### Backtest API

```typescript
import { Backtest } from "backtest-kit";

// Stream backtest results
Backtest.run(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
    frameName: string;
  }
): AsyncIterableIterator<IStrategyTickResultClosed>

// Run in background without yielding results
Backtest.background(
  symbol: string,
  context: { strategyName, exchangeName, frameName }
): Promise<() => void> // Returns cancellation function

// Generate markdown report
Backtest.getReport(strategyName: string): Promise<string>

// Save report to disk
Backtest.dump(strategyName: string, path?: string): Promise<void>
```

#### Live Trading API

```typescript
import { Live } from "backtest-kit";

// Stream live results (infinite)
Live.run(
  symbol: string,
  context: {
    strategyName: string;
    exchangeName: string;
  }
): AsyncIterableIterator<IStrategyTickResult>

// Run in background without yielding results
Live.background(
  symbol: string,
  context: { strategyName, exchangeName }
): Promise<() => void> // Returns cancellation function

// Generate markdown report
Live.getReport(strategyName: string): Promise<string>

// Save report to disk
Live.dump(strategyName: string, path?: string): Promise<void>
```

## Type Definitions

### Signal Data

```typescript
interface ISignalRow {
  id: string;                    // Auto-generated
  position: "long" | "short";
  note: string;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  timestamp: number;
}
```

### Tick Results (Discriminated Union)

```typescript
type IStrategyTickResult =
  | { action: "idle"; signal: null }
  | { action: "opened"; signal: ISignalRow }
  | { action: "active"; signal: ISignalRow; currentPrice: number }
  | {
      action: "closed";
      signal: ISignalRow;
      currentPrice: number;
      closeReason: "take_profit" | "stop_loss" | "time_expired";
      closeTimestamp: number;
      pnl: {
        priceOpenWithCosts: number;
        priceCloseWithCosts: number;
        pnlPercentage: number;
      };
    };
```

### PNL Calculation

```typescript
// Constants
PERCENT_SLIPPAGE = 0.1% // 0.001
PERCENT_FEE = 0.1%      // 0.001

// LONG position
priceOpenWithCosts = priceOpen * (1 + slippage + fee)
priceCloseWithCosts = priceClose * (1 - slippage - fee)
pnl% = (priceCloseWithCosts - priceOpenWithCosts) / priceOpenWithCosts * 100

// SHORT position
priceOpenWithCosts = priceOpen * (1 - slippage + fee)
priceCloseWithCosts = priceClose * (1 + slippage + fee)
pnl% = (priceOpenWithCosts - priceCloseWithCosts) / priceOpenWithCosts * 100
```

## Production Readiness

### ✅ Production-Ready Features

1. **Crash-Safe Persistence** - Atomic file writes with automatic recovery
2. **Signal Validation** - Comprehensive validation prevents invalid trades
3. **Type Safety** - Discriminated unions eliminate runtime type errors
4. **Memory Efficiency** - Prototype methods + async generators + memoization
5. **Interval Throttling** - Prevents signal spam
6. **Live Trading Ready** - Full implementation with real-time progression
7. **Error Recovery** - Stateless process with disk-based state

## Advanced Examples

### Multi-Symbol Live Trading

```typescript
import { Live } from "backtest-kit";

const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

// Run all symbols in parallel
await Promise.all(
  symbols.map(async (symbol) => {
    for await (const result of Live.run(symbol, {
      strategyName: "my-strategy",
      exchangeName: "binance"
    })) {
      console.log(`[${symbol}]`, result.action);

      // Generate reports periodically
      if (result.action === "closed") {
        await Live.dump("my-strategy");
      }
    }
  })
);
```

### Backtest Progress Listener

```typescript
import { listenProgress, Backtest } from "backtest-kit";

listenProgress((event) => {
  console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
  console.log(`${event.processedFrames} / ${event.totalFrames} frames`);
  console.log(`Strategy: ${event.strategyName}, Symbol: ${event.symbol}`);
});

Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});
```

### Early Termination

**Using async generator with break:**

```typescript
import { Backtest } from "backtest-kit";

for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
})) {
  if (result.closeReason === "stop_loss") {
    console.log("Stop loss hit - terminating backtest");

    // Save final report before exit
    await Backtest.dump("my-strategy");
    break; // Generator stops immediately
  }
}
```

**Using background mode with stop() function:**

```typescript
import { Backtest, Live, listenSignalLiveOnce } from "backtest-kit";

// Backtest.background returns a stop function
const stopBacktest = await Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Stop backtest after some condition
setTimeout(() => {
  console.log("Stopping backtest...");
  stopBacktest(); // Stops the background execution
}, 5000);

// Live.background also returns a stop function
const stopLive = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Stop live trading after detecting stop loss
listenSignalLiveOnce(
  (event) => event.action === "closed" && event.closeReason === "stop_loss",
  (event) => {
    console.log("Stop loss detected - stopping live trading");
    stopLive(); // Stops the infinite loop
  }
);
```

## Use Cases

- **Algorithmic Trading** - Backtest and deploy strategies with crash recovery
- **Strategy Research** - Test hypotheses on historical data
- **Signal Generation** - Use with ML models or technical indicators
- **Portfolio Management** - Track multiple strategies across symbols
- **Educational Projects** - Learn trading system architecture

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT

## Links

- [Architecture Documentation](./ARCHITECTURE.md)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Dependency Injection](https://github.com/tripolskypetr/di-kit)
