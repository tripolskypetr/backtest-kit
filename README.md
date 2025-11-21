# Backtest Kit

A production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture.

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
- 📝 **Markdown Reports** - Auto-generated trading reports with statistics (win rate, avg PNL)

## Installation

```bash
npm install backtest-kit
```

## Quick Start

### 1. Register Exchange Data Source

```typescript
import { addExchange } from "backtest-kit";

addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    // Fetch candle data from your exchange API or database
    return [
      {
        timestamp: Date.now(),
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 1000,
      },
    ];
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

### 4. Run Backtest with Async Generator

```typescript
import { Backtest } from "backtest-kit";

// Stream backtest results without memory accumulation
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
})) {
  console.log({
    action: result.action,           // "closed"
    reason: result.closeReason,      // "take_profit" | "stop_loss" | "time_expired"
    pnl: result.pnl.pnlPercentage,  // e.g., +1.98%
    closePrice: result.currentPrice,
    closeTime: result.closeTimestamp,
  });

  // Early termination possible
  if (result.pnl.pnlPercentage < -5) {
    console.log("Stopping backtest - too many losses");
    break;
  }
}

// Generate markdown report
const markdown = await Backtest.getReport("my-strategy");
console.log(markdown);

// Save report to disk
await Backtest.dump("my-strategy"); // ./logs/backtest/my-strategy.md
```

### 5. Live Trading with Crash Recovery

```typescript
import { Live } from "backtest-kit";

// Infinite async generator - streams live results
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  if (result.action === "opened") {
    console.log("New signal opened:", result.signal);
    // Signal automatically persisted to disk
  }

  if (result.action === "closed") {
    console.log("Signal closed:", {
      reason: result.closeReason,
      pnl: result.pnl.pnlPercentage,
      closePrice: result.currentPrice,
    });
    // State automatically persisted

    // Save live trading report
    await Live.dump("my-strategy"); // ./logs/live/my-strategy.md
  }

  // If process crashes, restart will resume from last saved state
  // No duplicate signals, no lost trades
}
```

**Crash Recovery Example:**

```typescript
import { Live } from "backtest-kit";

// First run
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  console.log(result); // { action: "opened", signal: {...} }
  // Process crashes here ❌
}

// After restart - automatic recovery ✅
for await (const result of Live.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
})) {
  // Reads persisted state from disk
  // Continues monitoring from where it left off
  console.log(result); // { action: "active", signal: {...}, currentPrice: 50100 }
}
```

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
await Backtest.background("BTCUSDT", {
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

// Clear accumulated data
await Backtest.clear("my-strategy"); // Clear specific strategy
await Backtest.clear();              // Clear all strategies
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

// Clear accumulated data
await Live.clear("my-strategy");
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
const cancel = await Live.background("BTCUSDT", {
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

All listeners return an `unsubscribe` function. All callbacks are processed sequentially using queued async execution.

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
getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>

// Get VWAP from last 5 1m candles
getAveragePrice(symbol: string): Promise<number>

// Get current date in execution context
getDate(): Promise<Date>

// Get current mode ("backtest" | "live")
getMode(): Promise<string>

// Format price/quantity for exchange
formatPrice(symbol: string, price: number): Promise<string>
formatQuantity(symbol: string, quantity: number): Promise<string>
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

// Clear accumulated data
Backtest.clear(strategyName?: string): Promise<void>
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

// Clear accumulated data
Live.clear(strategyName?: string): Promise<void>
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

### Recommended Next Steps

1. Implement exchange connectors with retry logic
2. Add order execution service
3. Build monitoring dashboard
4. Add integration tests
5. Implement portfolio risk management

## File Structure

```
src/
├── client/                      # Pure business logic (no DI)
│   ├── ClientStrategy.ts       # Signal lifecycle + validation + persistence
│   ├── ClientExchange.ts       # VWAP calculation
│   └── ClientFrame.ts          # Timeframe generation
├── classes/
│   └── Persist.ts              # Atomic file persistence
├── function/                   # High-level API
│   ├── add.ts                  # addStrategy, addExchange, addFrame
│   ├── exchange.ts             # getCandles, getAveragePrice, getDate, getMode
│   └── run.ts                  # DEPRECATED - use logic services instead
├── interfaces/                 # TypeScript interfaces
│   ├── Strategy.interface.ts
│   ├── Exchange.interface.ts
│   └── Frame.interface.ts
├── lib/
│   ├── core/                   # DI container
│   ├── services/
│   │   ├── base/              # LoggerService
│   │   ├── context/           # ExecutionContext, MethodContext
│   │   ├── connection/        # Client instance creators
│   │   ├── global/            # Context wrappers
│   │   ├── schema/            # Registry services
│   │   └── logic/
│   │       └── private/       # Async generator orchestration
│   │           ├── BacktestLogicPrivateService.ts
│   │           └── LiveLogicPrivateService.ts
│   └── index.ts               # Public API
└── helpers/
    └── toProfitLossDto.ts     # PNL calculation
```

## Advanced Examples

### Custom Persistence Adapter

```typescript
import { PersistSignalAdaper, PersistBase } from "backtest-kit";

class RedisPersist extends PersistBase {
  async readValue(entityId) {
    return JSON.parse(await redis.get(entityId));
  }
  async writeValue(entityId, entity) {
    await redis.set(entityId, JSON.stringify(entity));
  }
}

PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
```

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
const stopLive = await Live.background("BTCUSDT", {
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
