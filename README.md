# 🧿 Backtest Kit

> **A production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture.**

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Build sophisticated trading systems with confidence. Backtest Kit empowers you to develop, test, and deploy algorithmic trading strategies with enterprise-grade reliability—featuring atomic state persistence, comprehensive validation, and memory-efficient execution. Whether you're backtesting historical data or running live strategies, this framework provides the tools you need to trade with precision.

📚 **[API Reference](https://github.com/tripolskypetr/backtest-kit)** | 🌟 **[Quick Start](#quick-start)**

## 🎯 Supported Order Types

Backtest Kit supports multiple execution styles to match real trading behavior:

## ✨ Why Choose Backtest Kit?

- 🚀 **Production-Ready Architecture**: Seamlessly switch between backtest and live modes with robust error recovery and graceful shutdown mechanisms. Your strategy code remains identical across environments. ✅

- 💾 **Crash-Safe Persistence**: Atomic file writes with automatic state recovery ensure no duplicate signals or lost data—even after crashes. Resume execution exactly where you left off. 🔄

- ✅ **Signal Validation**: Comprehensive validation prevents invalid trades before execution. Catches price logic errors (TP/SL), throttles signal spam, and ensures data integrity. 🛡️

- 🔄 **Async Generator Architecture**: Memory-efficient streaming for backtest and live execution. Process years of historical data without loading everything into memory. ⚡

- 📊 **VWAP Pricing**: Volume-weighted average price from last 5 1-minute candles ensures realistic backtest results that match live execution. 📈

- 🎯 **Type-Safe Signal Lifecycle**: State machine with compile-time guarantees (idle → opened → active → closed). No runtime state confusion. 🔒

- 📈 **Accurate PNL Calculation**: Realistic profit/loss with configurable fees (0.1%) and slippage (0.1%). Track gross and net returns separately. 💰

- ⏰ **Time-Travel Context**: Async context propagation allows same strategy code to run in backtest (with historical time) and live (with real-time) without modifications. 🌐

- 📝 **Auto-Generated Reports**: Markdown reports with statistics (win rate, avg PNL, Sharpe Ratio, standard deviation, certainty ratio, expected yearly returns, risk-adjusted returns). 📊

- 📊 **Revenue Profiling**: Built-in performance tracking with aggregated statistics (avg, min, max, stdDev, P95, P99) for bottleneck analysis. ⚡

- 🏃 **Strategy Comparison (Walker)**: Compare multiple strategies in parallel with automatic ranking and statistical analysis. Find your best performer. 🏆

- 🔥 **Portfolio Heatmap**: Multi-symbol performance analysis with extended metrics (Profit Factor, Expectancy, Win/Loss Streaks, Avg Win/Loss) sorted by Sharpe Ratio. 📉

- 💰 **Position Sizing Calculator**: Built-in position sizing methods (Fixed Percentage, Kelly Criterion, ATR-based) with risk management constraints. 💵

- 🛡️ **Risk Management System**: Portfolio-level risk controls with custom validation logic, concurrent position limits, and cross-strategy coordination. 🔐

- 💾 **Zero Data Download**: Unlike Freqtrade, no need to download gigabytes of historical data—plug any data source (CCXT, database, API). 🚀

- 🔌 **Pluggable Persistence**: Replace default file-based persistence with custom adapters (Redis, MongoDB, PostgreSQL) for distributed systems and high-performance scenarios. 💾

- 🔒 **Safe Math & Robustness**: All metrics protected against NaN/Infinity with unsafe numeric checks. Returns N/A for invalid calculations. ✨

- 🧪 **Comprehensive Test Coverage**: 109 unit and integration tests covering validation, PNL, callbacks, reports, performance tracking, walker, heatmap, position sizing, risk management, and event system. ✅

---

### ✅ Built-in Order Types

-   **Market** — instant execution using current VWAP
    
-   **Limit** — entry at a specified `priceOpen`
    
-   **Take Profit (TP)** — automatic exit at the target price
    
-   **Stop Loss (SL)** — protective exit at the stop level
    
-   **OCO (TP + SL)** — linked exits; one cancels the other
    
-   **Time-Expired** — automatic closure after `minuteEstimatedTime` ⏱️
    

### ➕ Extendable Order Types

Easy to add without modifying the core:

-   **Stop / Stop-Limit** — entry triggered by `triggerPrice`
    
-   **Trailing Stop** — dynamic SL based on market movement
    
-   **Conditional Entry** — enter only if price breaks a level (`above` / `below`)
    
-   **Post-Only / Reduce-Only** — exchange-level execution flags

---

## 🚀 Getting Started

### Installation

Get up and running in seconds:

```bash
npm install backtest-kit
```

### Quick Example

Here's a taste of what `backtest-kit` can do—create a simple moving average crossover strategy with crash-safe persistence:

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  Backtest,
  listenSignalBacktest,
  listenError,
  listenDoneBacktest
} from "backtest-kit";
import ccxt from "ccxt";

// 1. Register exchange data source
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume
    }));
  },
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

// 2. Register trading strategy
addStrategy({
  strategyName: "sma-crossover",
  interval: "5m", // Throttling: signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    // Your signal generation logic
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: 50000,
      priceTakeProfit: 51000,  // Must be > priceOpen for long
      priceStopLoss: 49000,     // Must be < priceOpen for long
      minuteEstimatedTime: 60,  // Signal duration in minutes
    };
  },
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal opened:`, signal.id);
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal closed:`, priceClose);
    },
  },
});

// 3. Add timeframe generator
addFrame({
  frameName: "1d-backtest",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
});

// 4. Run backtest in background
Backtest.background("BTCUSDT", {
  strategyName: "sma-crossover",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to closed signals
listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

// Listen to backtest completion
listenDoneBacktest((event) => {
  console.log("Backtest completed:", event.symbol);
  Backtest.dump(event.strategyName); // ./logs/backtest/sma-crossover.md
});
```

The feature of this library is dependency inversion for component injection. Exchanges, strategies, frames, and risk profiles are lazy-loaded during runtime, so you can declare them in separate modules and connect them with string constants 🧩

```typescript
export enum ExchangeName {
  Binance = "binance",
  Bybit = "bybit",
}

export enum StrategyName {
  SMACrossover = "sma-crossover",
  RSIStrategy = "rsi-strategy",
}

export enum FrameName {
  OneDay = "1d-backtest",
  OneWeek = "1w-backtest",
}

// ...

addStrategy({
  strategyName: StrategyName.SMACrossover,
  interval: "5m",
  // ...
});

Backtest.background("BTCUSDT", {
  strategyName: StrategyName.SMACrossover,
  exchangeName: ExchangeName.Binance,
  frameName: FrameName.OneDay
});
```

---

## 🌟 Key Features

- 🤝 **Mode Switching**: Seamlessly switch between backtest and live modes with identical strategy code. 🔄
- 📜 **Crash Recovery**: Atomic persistence ensures state recovery after crashes—no duplicate signals. 🗂️
- 🛠️ **Custom Validators**: Define validation rules with strategy-level throttling and price logic checks. 🔧
- 🛡️ **Signal Lifecycle**: Type-safe state machine prevents invalid state transitions. 🚑
- 📦 **Dependency Inversion**: Lazy-load components at runtime for modular, scalable designs. 🧩
- 🔍 **Schema Reflection**: Runtime introspection with `listExchanges()`, `listStrategies()`, `listFrames()`. 📊

---

## 🎯 Use Cases

- 📈 **Algorithmic Trading**: Backtest and deploy systematic trading strategies with confidence. 💹
- 🤖 **Strategy Development**: Rapid prototyping with automatic validation and PNL tracking. 🛠️
- 📊 **Performance Analysis**: Compare strategies with Walker and analyze portfolios with Heatmap. 📉
- 💼 **Portfolio Management**: Multi-symbol trading with risk controls and position sizing. 🏦

---

## 📖 API Highlights

- 🛠️ **`addExchange`**: Define exchange data sources (CCXT, database, API). 📡
- 🤖 **`addStrategy`**: Create trading strategies with custom signals and callbacks. 💡
- 🌐 **`addFrame`**: Configure timeframes for backtesting. 📅
- 🔄 **`Backtest` / `Live`**: Run strategies in backtest or live mode (generator or background). ⚡
- 🏃 **`Walker`**: Compare multiple strategies in parallel with ranking. 🏆
- 🔥 **`Heat`**: Portfolio-wide performance analysis across multiple symbols. 📊
- 💰 **`PositionSize`**: Calculate position sizes with Fixed %, Kelly Criterion, or ATR-based methods. 💵
- 🛡️ **`addRisk`**: Portfolio-level risk management with custom validation logic. 🔐
- 💾 **`PersistBase`**: Base class for custom persistence adapters (Redis, MongoDB, PostgreSQL). 🗄️
- 🔌 **`PersistSignalAdapter` / `PersistRiskAdapter`**: Register custom adapters for signal and risk persistence. 🔄

Check out the sections below for detailed examples! 📚

---

## 🛠 Advanced Features

### 1. Register Exchange Data Source

You can plug any data source—CCXT for live data or a database for faster backtesting:

```typescript
import { addExchange } from "backtest-kit";
import ccxt from "ccxt";

// Option 1: CCXT (live or historical)
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume
    }));
  },
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

// Option 2: Database (faster backtesting)
import { db } from "./database";

addExchange({
  exchangeName: "binance-db",
  getCandles: async (symbol, interval, since, limit) => {
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

Define your signal generation logic with automatic validation:

```typescript
import { addStrategy } from "backtest-kit";

addStrategy({
  strategyName: "my-strategy",
  interval: "5m", // Throttling: signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    // Your signal generation logic
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: 50000,
      priceTakeProfit: 51000,  // Must be > priceOpen for long
      priceStopLoss: 49000,     // Must be < priceOpen for long
      minuteEstimatedTime: 60,  // Signal duration in minutes
    };
  },
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal opened:`, signal.id);
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal closed:`, priceClose);
    },
  },
});
```

### 3. Run Backtest

Run strategies in background mode (infinite loop) or manually iterate with async generators:

```typescript
import { Backtest, listenSignalBacktest, listenDoneBacktest } from "backtest-kit";

// Option 1: Background mode (recommended)
const stopBacktest = Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

listenDoneBacktest((event) => {
  console.log("Backtest completed:", event.symbol);
  Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
});

// Option 2: Manual iteration (for custom control)
for await (const result of Backtest.run("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
})) {
  console.log("PNL:", result.pnl.pnlPercentage);
  if (result.pnl.pnlPercentage < -5) break; // Early termination
}
```

### 4. Run Live Trading (Crash-Safe)

Live mode automatically persists state to disk with atomic writes:

```typescript
import { Live, listenSignalLive } from "backtest-kit";

// Run live trading in background (infinite loop, crash-safe)
const stop = Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

listenSignalLive((event) => {
  if (event.action === "opened") {
    console.log("Signal opened:", event.signal.id);
  }

  if (event.action === "closed") {
    console.log("Signal closed:", {
      reason: event.closeReason,
      pnl: event.pnl.pnlPercentage,
    });
    Live.dump(event.strategyName); // Auto-save report
  }
});

// Stop when needed: stop();
```

**Crash Recovery:** If process crashes, restart with same code—state automatically recovered from disk (no duplicate signals).

### 5. Strategy Comparison with Walker

Walker runs multiple strategies in parallel and ranks them by a selected metric:

```typescript
import { addWalker, Walker, listenWalkerComplete } from "backtest-kit";

// Register walker schema
addWalker({
  walkerName: "btc-walker",
  exchangeName: "binance",
  frameName: "1d-backtest",
  strategies: ["strategy-a", "strategy-b", "strategy-c"],
  metric: "sharpeRatio", // Metric to compare strategies
  callbacks: {
    onStrategyStart: (strategyName, symbol) => {
      console.log(`Starting strategy: ${strategyName}`);
    },
    onStrategyComplete: (strategyName, symbol, stats) => {
      console.log(`${strategyName} completed:`, stats.sharpeRatio);
    },
    onComplete: (results) => {
      console.log("Best strategy:", results.bestStrategy);
      console.log("Best metric:", results.bestMetric);
    },
  },
});

// Run walker in background
Walker.background("BTCUSDT", {
  walkerName: "btc-walker"
});

// Listen to walker completion
listenWalkerComplete((results) => {
  console.log("Walker completed:", results.bestStrategy);
  Walker.dump("BTCUSDT", results.walkerName); // Save report
});

// Get raw comparison data
const results = await Walker.getData("BTCUSDT", "btc-walker");
console.log(results);
// Returns:
// {
//   bestStrategy: "strategy-b",
//   bestMetric: 1.85,
//   strategies: [
//     { strategyName: "strategy-a", stats: { sharpeRatio: 1.23, ... }, metric: 1.23 },
//     { strategyName: "strategy-b", stats: { sharpeRatio: 1.85, ... }, metric: 1.85 },
//     { strategyName: "strategy-c", stats: { sharpeRatio: 0.98, ... }, metric: 0.98 }
//   ]
// }

// Generate markdown report
const markdown = await Walker.getReport("BTCUSDT", "btc-walker");
console.log(markdown);
```

**Available metrics for comparison:**
- `sharpeRatio` - Risk-adjusted return (default)
- `winRate` - Win percentage
- `avgPnl` - Average PNL percentage
- `totalPnl` - Total PNL percentage
- `certaintyRatio` - avgWin / |avgLoss|

### 6. Portfolio Heatmap

Heat provides portfolio-wide performance analysis across multiple symbols:

```typescript
import { Heat, Backtest } from "backtest-kit";

// Run backtests for multiple symbols
for (const symbol of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]) {
  for await (const _ of Backtest.run(symbol, {
    strategyName: "my-strategy",
    exchangeName: "binance",
    frameName: "2024-backtest"
  })) {}
}

// Get raw heatmap data
const stats = await Heat.getData("my-strategy");
console.log(stats);
// Returns:
// {
//   symbols: [
//     {
//       symbol: "BTCUSDT",
//       totalPnl: 15.5,           // Total profit/loss %
//       sharpeRatio: 2.10,        // Risk-adjusted return
//       profitFactor: 2.50,       // Wins / Losses ratio
//       expectancy: 1.85,         // Expected value per trade
//       winRate: 72.3,            // Win percentage
//       avgWin: 2.45,             // Average win %
//       avgLoss: -0.95,           // Average loss %
//       maxDrawdown: -2.5,        // Maximum drawdown %
//       maxWinStreak: 5,          // Consecutive wins
//       maxLossStreak: 2,         // Consecutive losses
//       totalTrades: 45,
//       winCount: 32,
//       lossCount: 13,
//       avgPnl: 0.34,
//       stdDev: 1.62
//     },
//     // ... more symbols sorted by Sharpe Ratio
//   ],
//   totalSymbols: 4,
//   portfolioTotalPnl: 45.3,      // Portfolio-wide total PNL
//   portfolioSharpeRatio: 1.85,   // Portfolio-wide Sharpe
//   portfolioTotalTrades: 120
// }

// Generate markdown report
const markdown = await Heat.getReport("my-strategy");
console.log(markdown);

// Save to disk (default: ./logs/heatmap/my-strategy.md)
await Heat.dump("my-strategy");
```

**Heatmap Report Example:**
```markdown
# Portfolio Heatmap: my-strategy

**Total Symbols:** 4 | **Portfolio PNL:** +45.30% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120

| Symbol | Total PNL | Sharpe | PF | Expect | WR | Avg Win | Avg Loss | Max DD | W Streak | L Streak | Trades |
|--------|-----------|--------|-------|--------|-----|---------|----------|--------|----------|----------|--------|
| BTCUSDT | +15.50% | 2.10 | 2.50 | +1.85% | 72.3% | +2.45% | -0.95% | -2.50% | 5 | 2 | 45 |
| ETHUSDT | +12.30% | 1.85 | 2.15 | +1.45% | 68.5% | +2.10% | -1.05% | -3.10% | 4 | 2 | 38 |
| SOLUSDT | +10.20% | 1.65 | 1.95 | +1.20% | 65.2% | +1.95% | -1.15% | -4.20% | 3 | 3 | 25 |
| BNBUSDT | +7.30% | 1.40 | 1.75 | +0.95% | 62.5% | +1.75% | -1.20% | -3.80% | 3 | 2 | 12 |
```

**Column Descriptions:**
- **Total PNL** - Total profit/loss percentage across all trades
- **Sharpe** - Risk-adjusted return (higher is better)
- **PF** - Profit Factor: sum of wins / sum of losses (>1.0 is profitable)
- **Expect** - Expectancy: expected value per trade
- **WR** - Win Rate: percentage of winning trades
- **Avg Win** - Average profit on winning trades
- **Avg Loss** - Average loss on losing trades
- **Max DD** - Maximum drawdown (largest peak-to-trough decline)
- **W Streak** - Maximum consecutive winning trades
- **L Streak** - Maximum consecutive losing trades
- **Trades** - Total number of trades for this symbol

### 7. Position Sizing Calculator

Position Sizing Calculator helps determine optimal position sizes based on risk management rules:

```typescript
import { addSizing, PositionSize } from "backtest-kit";

// Fixed Percentage Risk - risk fixed % of account per trade
addSizing({
  sizingName: "conservative",
  note: "Conservative 2% risk per trade",
  method: "fixed-percentage",
  riskPercentage: 2,                // Risk 2% of account per trade
  maxPositionPercentage: 10,        // Max 10% of account in single position (optional)
  minPositionSize: 0.001,           // Min 0.001 BTC position (optional)
  maxPositionSize: 1.0,             // Max 1.0 BTC position (optional)
});

// Kelly Criterion - optimal bet sizing based on edge
addSizing({
  sizingName: "kelly-quarter",
  note: "Kelly Criterion with 25% multiplier for safety",
  method: "kelly-criterion",
  kellyMultiplier: 0.25,            // Use 25% of full Kelly (recommended for safety)
  maxPositionPercentage: 15,        // Cap position at 15% of account (optional)
  minPositionSize: 0.001,           // Min 0.001 BTC position (optional)
  maxPositionSize: 2.0,             // Max 2.0 BTC position (optional)
});

// ATR-based - volatility-adjusted position sizing
addSizing({
  sizingName: "atr-dynamic",
  note: "ATR-based sizing with 2x multiplier",
  method: "atr-based",
  riskPercentage: 2,                // Risk 2% of account
  atrMultiplier: 2,                 // Use 2x ATR as stop distance
  maxPositionPercentage: 12,        // Max 12% of account (optional)
  minPositionSize: 0.001,           // Min 0.001 BTC position (optional)
  maxPositionSize: 1.5,             // Max 1.5 BTC position (optional)
});

// Calculate position sizes
const quantity1 = await PositionSize.fixedPercentage(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  49000,      // Stop loss: $49,000
  { sizingName: "conservative" }
);
console.log(`Position size: ${quantity1} BTC`);

const quantity2 = await PositionSize.kellyCriterion(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  0.55,       // Win rate: 55%
  1.5,        // Win/loss ratio: 1.5
  { sizingName: "kelly-quarter" }
);
console.log(`Position size: ${quantity2} BTC`);

const quantity3 = await PositionSize.atrBased(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  500,        // ATR: $500
  { sizingName: "atr-dynamic" }
);
console.log(`Position size: ${quantity3} BTC`);
```

**When to Use Each Method:**

1. **Fixed Percentage** - Simple risk management, consistent risk per trade
   - Best for: Beginners, conservative strategies
   - Risk: Fixed 1-2% per trade

2. **Kelly Criterion** - Optimal bet sizing based on win rate and win/loss ratio
   - Best for: Strategies with known edge, statistical advantage
   - Risk: Use fractional Kelly (0.25-0.5) to reduce volatility

3. **ATR-based** - Volatility-adjusted sizing, accounts for market conditions
   - Best for: Swing trading, volatile markets
   - Risk: Position size scales with volatility

### 8. Risk Management

Risk Management provides portfolio-level risk controls across strategies:

```typescript
import { addRisk } from "backtest-kit";

// Simple concurrent position limit
addRisk({
  riskName: "conservative",
  note: "Conservative risk profile with max 3 concurrent positions",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 3) {
        throw new Error("Maximum 3 concurrent positions allowed");
      }
    },
  ],
  callbacks: {
    onRejected: (symbol, params) => {
      console.warn(`Signal rejected for ${symbol}:`, params);
    },
    onAllowed: (symbol, params) => {
      console.log(`Signal allowed for ${symbol}`);
    },
  },
});

// Symbol-based filtering
addRisk({
  riskName: "no-meme-coins",
  note: "Block meme coins from trading",
  validations: [
    ({ symbol }) => {
      const memeCoins = ["DOGEUSDT", "SHIBUSDT", "PEPEUSDT"];
      if (memeCoins.includes(symbol)) {
        throw new Error(`Meme coin ${symbol} not allowed`);
      }
    },
  ],
});

// Time-based trading windows
addRisk({
  riskName: "trading-hours",
  note: "Only trade during market hours (9 AM - 5 PM UTC)",
  validations: [
    ({ timestamp }) => {
      const date = new Date(timestamp);
      const hour = date.getUTCHours();

      if (hour < 9 || hour >= 17) {
        throw new Error("Trading only allowed 9 AM - 5 PM UTC");
      }
    },
  ],
});

// Multi-strategy coordination with position inspection
addRisk({
  riskName: "strategy-coordinator",
  note: "Limit exposure per strategy and inspect active positions",
  validations: [
    ({ activePositions, strategyName, symbol }) => {
      // Count positions for this specific strategy
      const strategyPositions = activePositions.filter(
        (pos) => pos.strategyName === strategyName
      );

      if (strategyPositions.length >= 2) {
        throw new Error(`Strategy ${strategyName} already has 2 positions`);
      }

      // Check if we already have a position on this symbol
      const symbolPositions = activePositions.filter(
        (pos) => pos.symbol === symbol
      );

      if (symbolPositions.length > 0) {
        throw new Error(`Already have position on ${symbol}`);
      }
    },
  ],
});

// Use risk profile in strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  riskName: "conservative", // Apply risk profile
  getSignal: async (symbol) => {
    // Signal generation logic
    return { /* ... */ };
  },
});
```

### 9. Custom Persistence Adapters (Optional)

By default, backtest-kit uses file-based persistence with atomic writes. You can replace this with custom adapters (e.g., Redis, MongoDB, PostgreSQL) for distributed systems or high-performance scenarios.

#### Understanding the Persistence System

The library uses three persistence layers:

1. **PersistBase** - Base class for all persistence operations (file-based by default)
2. **PersistSignalAdapter** - Manages signal state persistence (used by Live mode)
3. **PersistRiskAdapter** - Manages active positions for risk management

#### Default File-Based Persistence

By default, data is stored in JSON files:

```
./logs/data/
  signal/
    my-strategy/
      BTCUSDT.json      # Signal state for BTCUSDT
      ETHUSDT.json      # Signal state for ETHUSDT
  risk/
    conservative/
      positions.json     # Active positions for risk profile
```

#### Create Custom Adapter (Redis Example)

```typescript
import { PersistBase, PersistSignalAdaper, PersistRiskAdapter } from "backtest-kit";
import Redis from "ioredis";

const redis = new Redis();

// Custom Redis-based persistence adapter
class RedisPersist extends PersistBase {
  // Initialize Redis connection
  async waitForInit(initial: boolean): Promise<void> {
    // Redis connection is already established
    console.log(`Redis persistence initialized for ${this.entityName}`);
  }

  // Read entity from Redis
  async readValue<T>(entityId: string | number): Promise<T> {
    const key = `${this.entityName}:${entityId}`;
    const data = await redis.get(key);

    if (!data) {
      throw new Error(`Entity ${this.entityName}:${entityId} not found`);
    }

    return JSON.parse(data) as T;
  }

  // Check if entity exists in Redis
  async hasValue(entityId: string | number): Promise<boolean> {
    const key = `${this.entityName}:${entityId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  }

  // Write entity to Redis
  async writeValue<T>(entityId: string | number, entity: T): Promise<void> {
    const key = `${this.entityName}:${entityId}`;
    const serializedData = JSON.stringify(entity);
    await redis.set(key, serializedData);

    // Optional: Set TTL (time to live)
    // await redis.expire(key, 86400); // 24 hours
  }

  // Remove entity from Redis
  async removeValue(entityId: string | number): Promise<void> {
    const key = `${this.entityName}:${entityId}`;
    const result = await redis.del(key);

    if (result === 0) {
      throw new Error(`Entity ${this.entityName}:${entityId} not found for deletion`);
    }
  }

  // Remove all entities for this entity type
  async removeAll(): Promise<void> {
    const pattern = `${this.entityName}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  // Iterate over all entity values
  async *values<T>(): AsyncGenerator<T> {
    const pattern = `${this.entityName}:*`;
    const keys = await redis.keys(pattern);

    // Sort keys alphanumerically
    keys.sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    }));

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        yield JSON.parse(data) as T;
      }
    }
  }

  // Iterate over all entity IDs
  async *keys(): AsyncGenerator<string> {
    const pattern = `${this.entityName}:*`;
    const keys = await redis.keys(pattern);

    // Sort keys alphanumerically
    keys.sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    }));

    for (const key of keys) {
      // Extract entity ID from key (remove prefix)
      const entityId = key.slice(this.entityName.length + 1);
      yield entityId;
    }
  }
}

// Register Redis adapter for signal persistence
PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);

// Register Redis adapter for risk persistence
PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
```

#### Custom Adapter Registration (Before Running Strategies)

```typescript
import { PersistSignalAdaper, PersistRiskAdapter, Live } from "backtest-kit";

// IMPORTANT: Register adapters BEFORE running any strategies
PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);

// Now run live trading with Redis persistence
Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

#### MongoDB Adapter Example

```typescript
import { PersistBase } from "backtest-kit";
import { MongoClient, Collection } from "mongodb";

const client = new MongoClient("mongodb://localhost:27017");
const db = client.db("backtest-kit");

class MongoPersist extends PersistBase {
  private collection: Collection;

  constructor(entityName: string, baseDir: string) {
    super(entityName, baseDir);
    this.collection = db.collection(this.entityName);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await client.connect();
    // Create index for faster lookups
    await this.collection.createIndex({ entityId: 1 }, { unique: true });
    console.log(`MongoDB persistence initialized for ${this.entityName}`);
  }

  async readValue<T>(entityId: string | number): Promise<T> {
    const doc = await this.collection.findOne({ entityId });

    if (!doc) {
      throw new Error(`Entity ${this.entityName}:${entityId} not found`);
    }

    return doc.data as T;
  }

  async hasValue(entityId: string | number): Promise<boolean> {
    const count = await this.collection.countDocuments({ entityId });
    return count > 0;
  }

  async writeValue<T>(entityId: string | number, entity: T): Promise<void> {
    await this.collection.updateOne(
      { entityId },
      { $set: { entityId, data: entity, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async removeValue(entityId: string | number): Promise<void> {
    const result = await this.collection.deleteOne({ entityId });

    if (result.deletedCount === 0) {
      throw new Error(`Entity ${this.entityName}:${entityId} not found for deletion`);
    }
  }

  async removeAll(): Promise<void> {
    await this.collection.deleteMany({});
  }

  async *values<T>(): AsyncGenerator<T> {
    const cursor = this.collection.find({}).sort({ entityId: 1 });

    for await (const doc of cursor) {
      yield doc.data as T;
    }
  }

  async *keys(): AsyncGenerator<string> {
    const cursor = this.collection.find({}, { projection: { entityId: 1 } }).sort({ entityId: 1 });

    for await (const doc of cursor) {
      yield String(doc.entityId);
    }
  }
}

// Register MongoDB adapter
PersistSignalAdaper.usePersistSignalAdapter(MongoPersist);
PersistRiskAdapter.usePersistRiskAdapter(MongoPersist);
```

#### Direct Persistence API Usage (Advanced)

You can also use PersistBase directly for custom data storage:

```typescript
import { PersistBase } from "backtest-kit";

// Create custom persistence for trading logs
const tradingLogs = new PersistBase("trading-logs", "./logs/custom");

// Initialize
await tradingLogs.waitForInit(true);

// Write log entry
await tradingLogs.writeValue("log-1", {
  timestamp: Date.now(),
  message: "Strategy started",
  metadata: { symbol: "BTCUSDT", strategy: "sma-crossover" }
});

// Read log entry
const log = await tradingLogs.readValue("log-1");
console.log(log);

// Check if log exists
const exists = await tradingLogs.hasValue("log-1");
console.log(`Log exists: ${exists}`);

// Iterate over all logs
for await (const log of tradingLogs.values()) {
  console.log("Log:", log);
}

// Get all log IDs
for await (const logId of tradingLogs.keys()) {
  console.log("Log ID:", logId);
}

// Filter logs
for await (const log of tradingLogs.filter((l: any) => l.metadata.symbol === "BTCUSDT")) {
  console.log("BTC Log:", log);
}

// Take first 5 logs
for await (const log of tradingLogs.take(5)) {
  console.log("Recent Log:", log);
}

// Remove specific log
await tradingLogs.removeValue("log-1");

// Remove all logs
await tradingLogs.removeAll();
```

#### When to Use Custom Adapters

1. **Redis** - Best for high-performance distributed systems with multiple instances
   - Fast read/write operations
   - Built-in TTL (automatic cleanup)
   - Pub/sub for real-time updates

2. **MongoDB** - Best for complex queries and analytics
   - Rich query language
   - Aggregation pipelines
   - Scalable for large datasets

3. **PostgreSQL** - Best for ACID transactions and relational data
   - Strong consistency guarantees
   - Complex joins and queries
   - Mature ecosystem

4. **File-based (default)** - Best for single-instance deployments
   - No dependencies
   - Simple debugging (inspect JSON files)
   - Sufficient for most use cases

#### Testing Custom Adapters

```typescript
import { test } from "worker-testbed";
import { PersistBase } from "backtest-kit";

test("Custom Redis adapter works correctly", async ({ pass, fail }) => {
  const persist = new RedisPersist("test-entity", "./logs/test");

  await persist.waitForInit(true);

  // Write
  await persist.writeValue("key1", { data: "value1" });

  // Read
  const value = await persist.readValue("key1");
  if (value.data === "value1") {
    pass("Redis adapter read/write works");
  } else {
    fail("Redis adapter failed");
  }

  // Cleanup
  await persist.removeValue("key1");
});
```

---

## ✅ Tested & Reliable

`backtest-kit` comes with a robust test suite covering:
- 🛡️ **Validation**: Ensures all components (exchanges, strategies, frames, risk profiles) are properly configured. ✅
- 🚑 **Recovery**: Handles edge cases like invalid signals or empty outputs. 🛠️
- 🔄 **Navigation**: Smoothly switches between backtest and live modes without errors. 🌐
- ⚡ **Performance**: Efficient memory usage and history management. 📈

**109 unit and integration tests** covering:
- Signal validation and throttling
- PNL calculation with fees and slippage
- Crash recovery and state persistence
- Callback execution order
- Markdown report generation
- Walker strategy comparison
- Heatmap portfolio analysis
- Position sizing calculations
- Risk management validation
- Event system

---

## 🤝 Contribute

We'd love your input! Fork the repo, submit a PR, or open an issue on **[GitHub](https://github.com/tripolskypetr/backtest-kit)**. 🙌

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr) 🖋️
