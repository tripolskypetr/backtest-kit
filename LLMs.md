<img src="./assets/triangle.svg" height="105px" align="right">

# 🧿 Backtest Kit

> **A production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture.**

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Build sophisticated trading systems with confidence. Backtest Kit empowers you to develop, test, and deploy algorithmic trading strategies with enterprise-grade reliability—featuring atomic state persistence, comprehensive validation, and memory-efficient execution. Whether you're backtesting historical data or running live strategies, this framework provides the tools you need to trade with precision.

📚 **[API Reference](https://github.com/tripolskypetr/backtest-kit)** | 🌟 **[Quick Start](#quick-start)**

## ✨ Why Choose Backtest Kit?

- 🚀 **Production-Ready Architecture**: Seamlessly switch between backtest and live modes with robust error recovery and graceful shutdown mechanisms. Your strategy code remains identical across environments. 

- 💾 **Crash-Safe Persistence**: Atomic file writes with automatic state recovery ensure no duplicate signals or lost data—even after crashes. Resume execution exactly where you left off.

- ✅ **Signal Validation**: Comprehensive validation prevents invalid trades before execution. Catches price logic errors (TP/SL), throttles signal spam, and ensures data integrity. 🛡️

- 🔄 **Async Generator Architecture**: Memory-efficient streaming for backtest and live execution. Process years of historical data without loading everything into memory. ⚡

- 📊 **VWAP Pricing**: Volume-weighted average price from last 5 1-minute candles ensures realistic backtest results that match live execution. 📈

- 🎯 **Type-Safe Signal Lifecycle**: State machine with compile-time guarantees (idle → scheduled → opened → active → closed/cancelled). No runtime state confusion. 🔒

- 📈 **Accurate PNL Calculation**: Realistic profit/loss with configurable fees (0.1%) and slippage (0.1%). Track gross and net returns separately. 💰

- ⏰ **Time-Travel Context**: Async context propagation allows same strategy code to run in backtest (with historical time) and live (with real-time) without modifications. 🌐

- 📝 **Auto-Generated Reports**: Markdown reports with statistics (win rate, avg PNL, Sharpe Ratio, standard deviation, certainty ratio, expected yearly returns, risk-adjusted returns). 📊

- 📊 **Revenue Profiling**: Built-in performance tracking with aggregated statistics (avg, min, max, stdDev, P95, P99) for bottleneck analysis. ⚡

- 🏃 **Strategy Comparison (Walker)**: Compare multiple strategies in parallel with automatic ranking and statistical analysis. Find your best performer. 🏆

- 🔥 **Portfolio Heatmap**: Multi-symbol performance analysis with extended metrics (Profit Factor, Expectancy, Win/Loss Streaks, Avg Win/Loss) sorted by Sharpe Ratio. 📉

- 💰 **Position Sizing Calculator**: Built-in position sizing methods (Fixed Percentage, Kelly Criterion, ATR-based) with risk management constraints. 💵

- 🛡️ **Risk Management System**: Portfolio-level risk controls with custom validation logic, concurrent position limits, and cross-strategy coordination. 🔐

- 💾 **Zero Data Download**: Unlike Freqtrade, no need to download gigabytes of historical data—plug any data source (CCXT, database, API). 🚀

- 🔌 **Pluggable Persistence**: Replace default file-based persistence with custom adapters (Redis, MongoDB, PostgreSQL) for distributed systems and high-performance scenarios.

- 🔒 **Safe Math & Robustness**: All metrics protected against NaN/Infinity with unsafe numeric checks. Returns N/A for invalid calculations. ✨

- 🤖 **AI Strategy Optimizer**: LLM-powered strategy generation from historical data. Train multiple strategy variants, compare performance, and auto-generate executable code. Supports Ollama integration with multi-timeframe analysis. 🧠

- 🧪 **Comprehensive Test Coverage**: Unit and integration tests covering validation, PNL, callbacks, reports, performance tracking, walker, heatmap, position sizing, risk management, scheduled signals, crash recovery, optimizer, and event system. 

---

### 🎳 Supported Order Types

Backtest Kit supports multiple execution styles to match real trading behavior:

-   **Market** — instant execution using current VWAP

-   **Limit** — entry at a specified `priceOpen`

-   **Take Profit (TP)** — automatic exit at the target price

-   **Stop Loss (SL)** — protective exit at the stop level

-   **OCO (TP + SL)** — linked exits; one cancels the other

-   **Grid** — auto-cancel if price never reaches entry point or hits SL before activation
    

### 🆕 Extendable Order Types

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
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  listenSignalBacktest,
  listenError,
  listenDoneBacktest
} from "backtest-kit";
import ccxt from "ccxt";

// 1. Register exchange data source
addExchangeSchema({
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
addStrategySchema({
  strategyName: "sma-crossover",
  interval: "5m", // Throttling: signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    const price = await getAveragePrice(symbol);
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: price,
      priceTakeProfit: price + 1_000,  // Must be > priceOpen for long
      priceStopLoss: price - 1_000,     // Must be < priceOpen for long
      minuteEstimatedTime: 60,
    };
  },
  callbacks: {
    onSchedule: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Scheduled signal created:`, signal.id);
    },
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal opened:`, signal.id);
    },
    onActive: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal active:`, signal.id);
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Signal closed:`, priceClose);
    },
    onCancel: (symbol, signal, currentPrice, backtest) => {
      console.log(`[${backtest ? "BT" : "LIVE"}] Scheduled signal cancelled:`, signal.id);
    },
  },
});

// 3. Add timeframe generator
addFrameSchema({
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

addStrategySchema({
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
- 🛑 **Graceful Shutdown**: Stop backtests, live trading, and walkers programmatically with `stop()` methods. Current signals complete normally, no forced closures. ⏹️
- 📋 **Task Monitoring**: Track all running instances with `list()` methods. Monitor task statuses: `ready`, `pending`, `fulfilled`, `rejected`. 📊
- 🛠️ **Custom Validators**: Define validation rules with strategy-level throttling and price logic checks. 🔧
- 🛡️ **Signal Lifecycle**: Type-safe state machine prevents invalid state transitions. 🚑
- 📦 **Dependency Inversion**: Lazy-load components at runtime for modular, scalable designs. 🧩
- 🔍 **Schema Reflection**: Runtime introspection with `listExchanges()`, `listStrategies()`, `listFrames()`. 📊
- 🔬 **Data Validation**: Automatic detection and rejection of incomplete candles from Binance API with anomaly checks. ✅ 

---

## 🎯 Use Cases

- 📈 **Algorithmic Trading**: Backtest and deploy systematic trading strategies with confidence. 💹
- 🤖 **Strategy Development**: Rapid prototyping with automatic validation and PNL tracking. 🛠️
- 📊 **Performance Analysis**: Compare strategies with Walker and analyze portfolios with Heatmap. 📉
- 💼 **Portfolio Management**: Multi-symbol trading with risk controls and position sizing. 🏦

---

## 📖 API Highlights

- 🛠️ **`addExchangeSchema`**: Define exchange data sources (CCXT, database, API). 📡
- 🤖 **`addStrategySchema`**: Create trading strategies with custom signals and callbacks. 💡
- 🌐 **`addFrameSchema`**: Configure timeframes for backtesting. 📅
- 🔄 **`Backtest` / `Live`**: Run strategies in backtest or live mode (generator or background). ⚡
- 🛑 **`Backtest.stop()` / `Live.stop()` / `Walker.stop()`**: Gracefully stop running strategies—current signals complete, no forced exits. ⏹️
- 📋 **`Backtest.list()` / `Live.list()` / `Walker.list()`**: Monitor all running instances with status tracking (`ready`, `pending`, `fulfilled`, `rejected`). 📊
- 📅 **`Schedule`**: Track scheduled signals and cancellation rate for limit orders. 📊
- 📊 **`Partial`**: Access partial profit/loss statistics and reports for risk management. Track signals reaching milestone levels (10%, 20%, 30%, etc.). 💹
- 🎯 **`Constant`**: Kelly Criterion-based constants for optimal take profit (TP_LEVEL1-3) and stop loss (SL_LEVEL1-2) levels. 📐
- 🏃 **`Walker`**: Compare multiple strategies in parallel with ranking. 🏆
- 🔥 **`Heat`**: Portfolio-wide performance analysis across multiple symbols. 📊
- 💰 **`PositionSize`**: Calculate position sizes with Fixed %, Kelly Criterion, or ATR-based methods. 💵
- 🛡️ **`addRiskSchema`**: Portfolio-level risk management with custom validation logic. 🔐
- 💾 **`PersistBase`**: Base class for custom persistence adapters (Redis, MongoDB, PostgreSQL).
- 🔌 **`PersistSignalAdapter` / `PersistScheduleAdapter` / `PersistRiskAdapter` / `PersistPartialAdapter`**: Register custom adapters for signal, scheduled signal, risk, and partial state persistence.
- 🤖 **`Optimizer`**: AI-powered strategy generation with LLM integration. Auto-generate strategies from historical data and export executable code. 🧠

Check out the sections below for detailed examples! 📚

---

## 🛠 Advanced Features

### 1. Register Exchange Data Source

You can plug any data source: CCXT for live data or a database for faster backtesting:

```typescript
import { addExchangeSchema } from "backtest-kit";
import ccxt from "ccxt";

// Option 1: CCXT (live or historical)
addExchangeSchema({
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

addExchangeSchema({
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
import { addStrategySchema } from "backtest-kit";

addStrategySchema({
  strategyName: "my-strategy",
  interval: "5m", // Throttling: signals generated max once per 5 minutes
  getSignal: async (symbol) => {
    const price = await getAveragePrice(symbol);
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: price,
      priceTakeProfit: price + 1_000,  // Must be > priceOpen for long
      priceStopLoss: price - 1_000,     // Must be < priceOpen for long
      minuteEstimatedTime: 60,
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

// Graceful shutdown - stop backtest programmatically
await Backtest.stop("BTCUSDT", "my-strategy");
// - Current signal completes execution (onClose callback fires)
// - No new signals are generated after stop
// - listenDoneBacktest event fires when complete

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
const cancelFn = Live.background("BTCUSDT", {
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

// Graceful shutdown - stop live trading programmatically
await Live.stop("BTCUSDT", "my-strategy");
// - Active signal completes normally (no forced close)
// - No new signals are generated after stop
// - State remains persisted for resume on restart

// Or use cancelFn() for immediate cancellation
cancelFn();
```

**Crash Recovery:** If process crashes, restart with same code—state automatically recovered from disk (no duplicate signals).

### 5. Strategy Comparison with Walker

Walker runs multiple strategies in parallel and ranks them by a selected metric:

```typescript
import { addWalkerSchema, Walker, listenWalkerComplete } from "backtest-kit";

// Register walker schema
addWalkerSchema({
  walkerName: "btc-walker",
  exchangeName: "binance",
  frameName: "1d-backtest",
  strategies: ["strategy-a", "strategy-b", "strategy-c"],
  metric: "sharpeRatio", // Metric to compare strategies
  callbacks: {
    onStrategyStart: (strategyName, symbol) => {
      console.log(`Starting strategy: ${strategyName}`);
    },
    onStrategyComplete: async (strategyName, symbol, stats) => {
      console.log(`${strategyName} completed:`, stats.sharpeRatio);

      // Optional: Stop walker early after first strategy completes
      // await Walker.stop("BTCUSDT", "btc-walker");
    },
    onComplete: (results) => {
      console.log("Best strategy:", results.bestStrategy);
      console.log("Best metric:", results.bestMetric);
    },
  },
});

// Run walker in background
const cancelFn = Walker.background("BTCUSDT", {
  walkerName: "btc-walker"
});

// Listen to walker completion
listenWalkerComplete((results) => {
  console.log("Walker completed:", results.bestStrategy);
  Walker.dump("BTCUSDT", results.walkerName); // Save report
});

// Graceful shutdown - stop walker programmatically
await Walker.stop("BTCUSDT", "btc-walker");
// - Current strategy completes execution
// - Remaining strategies in queue won't run
// - listenWalkerComplete event fires with partial results
// - Use case: Early termination when first strategy is good enough

// Or use cancelFn() for immediate cancellation
cancelFn();

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
import { addRiskSchema } from "backtest-kit";

// Simple concurrent position limit
addRiskSchema({
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
addRiskSchema({
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
addRiskSchema({
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
addRiskSchema({
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
addStrategySchema({
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

### 10. Partial Profit/Loss Tracking

Partial Profit/Loss system tracks signal performance at fixed percentage levels (10%, 20%, 30%, etc.) for risk management and position scaling strategies.

#### Understanding Partial Levels

The system automatically monitors profit/loss milestones and emits events when signals reach specific levels:

```typescript
import {
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailableOnce,
  Constant
} from "backtest-kit";

// Listen to all profit levels (10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100%)
listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} profit: ${level}% at ${price}`);

  // Close portions at Kelly-optimized levels
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

// Listen to all loss levels (10%, 20%, 30%, 40%, 50%, 60%, 70%, 80%, 90%, 100%)
listenPartialLossAvailable(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} loss: -${level}% at ${price}`);

  // Close portions at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});

// Listen once to first profit level reached
listenPartialProfitAvailableOnce(
  () => true, // Accept any profit event
  ({ symbol, signal, price, level, backtest }) => {
    console.log(`First profit milestone: ${level}%`);
  }
);

// Listen once to first loss level reached
listenPartialLossAvailableOnce(
  () => true, // Accept any loss event
  ({ symbol, signal, price, level, backtest }) => {
    console.log(`First loss milestone: -${level}%`);
  }
);
```

#### Constant Utility - Kelly-Optimized Levels

The `Constant` class provides predefined Kelly Criterion-based levels for optimal position sizing:

```typescript
import { Constant } from "backtest-kit";

// Take Profit Levels
console.log(Constant.TP_LEVEL1); // 100% (aggressive target)
console.log(Constant.TP_LEVEL2); // 50%  (moderate target)
console.log(Constant.TP_LEVEL3); // 25%  (conservative target)

// Stop Loss Levels
console.log(Constant.SL_LEVEL1); // 100% (maximum risk)
console.log(Constant.SL_LEVEL2); // 50%  (standard stop)
```

**Use Case - Scale Out Strategy:**

```typescript
// Strategy: Close position in 3 tranches at optimal levels
listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
  if (level === Constant.TP_LEVEL3) {
    // Close 33% at 25% profit (secure early gains)
    executePartialClose(symbol, signal.id, 0.33);
  }
  if (level === Constant.TP_LEVEL2) {
    // Close 33% at 50% profit (lock in medium gains)
    executePartialClose(symbol, signal.id, 0.33);
  }
  if (level === Constant.TP_LEVEL1) {
    // Close 34% at 100% profit (maximize winners)
    executePartialClose(symbol, signal.id, 0.34);
  }
});
```

#### Partial Reports and Statistics

The `Partial` utility provides access to accumulated partial profit/loss data:

```typescript
import { Partial } from "backtest-kit";

// Get statistical data
const stats = await Partial.getData("BTCUSDT");
console.log(stats);
// Returns:
// {
//   totalEvents: 15,          // Total profit/loss events
//   totalProfit: 10,          // Number of profit events
//   totalLoss: 5,             // Number of loss events
//   eventList: [
//     {
//       timestamp: 1704370800000,
//       action: "PROFIT",       // PROFIT or LOSS
//       symbol: "BTCUSDT",
//       signalId: "abc123",
//       position: "LONG",       // or SHORT
//       level: 10,              // Percentage level reached
//       price: 51500.00,        // Current price at level
//       mode: "Backtest"        // or Live
//     },
//     // ... more events
//   ]
// }

// Generate markdown report
const markdown = await Partial.getReport("BTCUSDT");
console.log(markdown);

// Save report to disk (default: ./dump/partial/BTCUSDT.md)
await Partial.dump("BTCUSDT");

// Custom output path
await Partial.dump("BTCUSDT", "./reports/partial");
```

**Partial Report Example:**

```markdown
# Partial Profit/Loss Report: BTCUSDT

| Action | Symbol | Signal ID | Position | Level % | Current Price | Timestamp | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PROFIT | BTCUSDT | abc123 | LONG | +10% | 51500.00000000 USD | 2024-01-15T10:30:00.000Z | Backtest |
| PROFIT | BTCUSDT | abc123 | LONG | +20% | 53000.00000000 USD | 2024-01-15T11:15:00.000Z | Backtest |
| LOSS | BTCUSDT | def456 | SHORT | -10% | 51500.00000000 USD | 2024-01-15T14:00:00.000Z | Backtest |

**Total events:** 15
**Profit events:** 10
**Loss events:** 5
```

#### Strategy Callbacks

Partial profit/loss callbacks can also be configured at the strategy level:

```typescript
import { addStrategySchema } from "backtest-kit";

addStrategySchema({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
  callbacks: {
    onPartialProfit: (symbol, data, currentPrice, revenuePercent, backtest) => {
      console.log(`Signal ${data.id} at ${revenuePercent.toFixed(2)}% profit`);
    },
    onPartialLoss: (symbol, data, currentPrice, lossPercent, backtest) => {
      console.log(`Signal ${data.id} at ${lossPercent.toFixed(2)}% loss`);
    },
  },
});
```

#### How Partial Levels Work

**Architecture:**

1. `ClientPartial` - Tracks levels using `Map<signalId, Set<level>>` to prevent duplicates
2. `ClientStrategy` - Calls `partial.profit()` / `partial.loss()` on every tick
3. `PartialMarkdownService` - Accumulates events (max 250 per symbol) for reports
4. State persisted to disk: `./dump/data/partial/{symbol}/levels.json`

**Level Detection:**

```typescript
// For LONG position at entry price 50000
// Current price = 55000 → revenue = 10%
// Levels triggered: 10%

// Current price = 61000 → revenue = 22%
// Levels triggered: 10%, 20% (only 20% event emitted if 10% already triggered)

// For SHORT position at entry price 50000
// Current price = 45000 → revenue = 10%
// Levels triggered: 10%
```

**Deduplication Guarantee:**

Each level is emitted **exactly once per signal**:

- Uses `Set<level>` to track reached levels
- Persisted to disk for crash recovery
- Restored on system restart

**Crash Recovery:**

```typescript
// Before crash:
// Signal opened at 50000, reached 10% and 20% profit
// State: { profitLevels: [10, 20], lossLevels: [] }
// Persisted to: ./dump/data/partial/BTCUSDT/levels.json

// After restart:
// State restored from disk
// Only new levels (30%, 40%, etc.) will emit events
// 10% and 20% won't fire again
```

#### Best Practices

1. **Use Constant for Kelly-Optimized Levels** - Don't hardcode profit/loss levels
2. **Scale Out Gradually** - Close positions in tranches (25%, 50%, 100%)
3. **Monitor Partial Statistics** - Use `Partial.getData()` to track scaling effectiveness
4. **Filter Events** - Use `listenPartialProfitAvailableOnce` for first-level-only logic
5. **Combine with Position Sizing** - Scale out inversely to volatility

```typescript
import { Constant, listenPartialProfitAvailable } from "backtest-kit";

// Advanced: Dynamic scaling based on level
listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
  const percentToClose =
    level === Constant.TP_LEVEL3 ? 0.25 : // 25% at first level
    level === Constant.TP_LEVEL2 ? 0.35 : // 35% at second level
    level === Constant.TP_LEVEL1 ? 0.40 : // 40% at third level
    0;

  if (percentToClose > 0) {
    executePartialClose(symbol, signal.id, percentToClose);
  }
});
```

---

### 11. Graceful Shutdown and Task Monitoring

The framework provides graceful shutdown mechanisms and task monitoring for all execution modes: backtests, live trading, and walkers. This ensures clean termination without forced signal closures and visibility into running tasks.

#### Task Status Monitoring

Use `list()` method to monitor all running instances and their statuses:

```typescript
// Get list of all backtest instances
const backtests = await Backtest.list();
console.log(backtests);
// [
//   { symbol: "BTCUSDT", strategyName: "strategy-1", status: "pending" },
//   { symbol: "ETHUSDT", strategyName: "strategy-2", status: "fulfilled" }
// ]

// Get list of all live trading instances
const liveInstances = await Live.list();
console.log(liveInstances);
// [
//   { symbol: "BTCUSDT", strategyName: "my-strategy", status: "pending" }
// ]

// Get list of all walker instances
const walkers = await Walker.list();
console.log(walkers);
// [
//   { symbol: "BTCUSDT", walkerName: "btc-walker", status: "fulfilled" }
// ]
```

**Task Statuses:**
- `ready` - Task created but not yet started
- `pending` - Task is currently running
- `fulfilled` - Task completed successfully
- `rejected` - Task failed with an error

#### How Graceful Shutdown Works

When you call `Backtest.stop()`, `Live.stop()`, or `Walker.stop()`:

1. **Current Signal Completes** - Active signals finish normally (reach TP/SL or expire)
2. **No New Signals** - Strategy stops generating new signals after stop is called
3. **Callbacks Fire** - All lifecycle callbacks (`onClose`, etc.) execute as expected
4. **Events Emitted** - Completion events (`listenDoneBacktest`, `listenDoneLive`, `listenWalkerComplete`) fire
5. **State Persisted** - In live mode, final state is saved to disk
6. **Status Updated** - Task status transitions from `pending` to `fulfilled`

#### Backtest Shutdown

```typescript
import { Backtest, listenDoneBacktest } from "backtest-kit";

Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Stop backtest gracefully
await Backtest.stop("BTCUSDT", "my-strategy");
// - Current active signal completes (TP/SL reached)
// - No new signals generated after stop
// - listenDoneBacktest event fires

listenDoneBacktest((event) => {
  console.log("Backtest stopped:", event.strategyName);
});
```

#### Live Trading Shutdown

```typescript
import { Live, listenDoneLive } from "backtest-kit";

Live.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});

// Stop live trading gracefully
await Live.stop("BTCUSDT", "my-strategy");
// - Active signal completes normally (no forced close)
// - No new signals generated after stop
// - State persisted to disk for resume on restart

listenDoneLive((event) => {
  console.log("Live trading stopped:", event.strategyName);
});
```

#### Walker Shutdown (Early Termination)

Walker shutdown is particularly useful for early termination when comparing strategies:

```typescript
import { addWalkerSchema, Walker, listenWalkerComplete } from "backtest-kit";

addWalkerSchema({
  walkerName: "btc-walker",
  exchangeName: "binance",
  frameName: "1d-backtest",
  strategies: ["strategy-a", "strategy-b", "strategy-c"],
  callbacks: {
    onStrategyComplete: async (strategyName, symbol, stats) => {
      console.log(`${strategyName} completed with Sharpe: ${stats.sharpeRatio}`);

      // Early termination: Stop walker if first strategy is good enough
      if (stats.sharpeRatio > 2.0) {
        console.log("Found excellent strategy, stopping walker early");
        await Walker.stop("BTCUSDT", "btc-walker");
      }
    },
  },
});

Walker.background("BTCUSDT", {
  walkerName: "btc-walker"
});

// Monitor walker status
const walkers = await Walker.list();
console.log(walkers.find(w => w.walkerName === "btc-walker"));
// { symbol: "BTCUSDT", walkerName: "btc-walker", status: "pending" }

// Or stop walker manually after some condition
await Walker.stop("BTCUSDT", "btc-walker");
// - Current strategy completes execution
// - Remaining strategies (not yet started) won't run
// - listenWalkerComplete fires with partial results
// - Status changes to "fulfilled"

listenWalkerComplete((results) => {
  console.log("Walker stopped early:", results.bestStrategy);
  console.log(`Tested ${results.strategies.length}/3 strategies`);
});
```

#### Multiple Walkers on Same Symbol

Walker shutdown only affects the specified walker, not others running on the same symbol:

```typescript
// Start two independent walkers on same symbol
Walker.background("BTCUSDT", { walkerName: "walker-A" });
Walker.background("BTCUSDT", { walkerName: "walker-B" });

// Stop walker-A only
await Walker.stop("BTCUSDT", "walker-A");
// - walker-A stops gracefully
// - walker-B continues unaffected
```

#### Monitoring Multiple Instances

Track multiple running instances across different symbols:

```typescript
// Start multiple backtests
Backtest.background("BTCUSDT", { strategyName: "strategy-1", ... });
Backtest.background("ETHUSDT", { strategyName: "strategy-2", ... });
Backtest.background("SOLUSDT", { strategyName: "strategy-3", ... });

// Monitor all running backtests
const allBacktests = await Backtest.list();
console.log(`Running: ${allBacktests.filter(b => b.status === "pending").length}`);
console.log(`Completed: ${allBacktests.filter(b => b.status === "fulfilled").length}`);
console.log(`Failed: ${allBacktests.filter(b => b.status === "rejected").length}`);

// Stop specific instance
await Backtest.stop("ETHUSDT", "strategy-2");

// Verify status change
const updated = await Backtest.list();
const eth = updated.find(b => b.symbol === "ETHUSDT");
console.log(eth.status); // "fulfilled"
```

#### Use Cases

1. **Backtest Early Exit** - Stop backtest when strategy performs poorly (e.g., drawdown > 10%)
2. **Live Trading Maintenance** - Gracefully stop live trading for system updates
3. **Walker Optimization** - Skip remaining strategies when first one is excellent
4. **Resource Management** - Stop long-running backtests to free up resources
5. **Conditional Termination** - Stop based on external events (API limits, market conditions)
6. **Task Monitoring Dashboard** - Build real-time monitoring UI with `list()` method
7. **Health Checks** - Monitor task statuses for alerting and automation

#### Best Practices

1. **Always await stop()** - Ensure graceful shutdown completes before exiting process
2. **Use listenDone events** - Track completion with `listenDoneBacktest`, `listenDoneLive`, `listenWalkerComplete`
3. **Monitor task status** - Use `list()` method to track running instances and their states
4. **Don't force-kill** - Let signals complete naturally instead of process.exit()
5. **Save reports** - Call `dump()` methods before stopping to preserve results
6. **Test shutdown paths** - Write tests that verify graceful shutdown behavior
7. **Handle rejected status** - Check for `rejected` status and handle errors appropriately

```typescript
// GOOD - Graceful shutdown with cleanup and monitoring
const instances = await Backtest.list();
console.log(`Running instances: ${instances.filter(i => i.status === "pending").length}`);

await Backtest.stop("BTCUSDT", "my-strategy");
await Backtest.dump("my-strategy"); // Save report

// Verify status change
const updated = await Backtest.list();
const stopped = updated.find(i => i.symbol === "BTCUSDT");
console.log(`Status: ${stopped.status}`); // "fulfilled"
console.log("Shutdown complete");

// BAD - Forced exit without cleanup
process.exit(0); // Signals may not complete, callbacks may not fire
```

#### Live Trading Considerations

**Important:** Live mode operates on real-time data with actual minute intervals. When testing graceful shutdown in live mode:

- Expect longer wait times (minimum 1 minute per candle)
- Use backtest mode for quick iteration and testing
- Live mode is designed for production trading, not rapid testing
- Status transitions may take longer due to real-time constraints

---

### 12. Scheduled Signal Persistence

The framework includes a separate persistence system for scheduled signals (`PersistScheduleAdapter`) that works independently from pending/active signal persistence (`PersistSignalAdapter`). This separation ensures crash-safe recovery of both signal types.

#### Understanding the Dual Persistence System

The library uses **two independent persistence layers** for signals:

1. **PersistSignalAdapter** - Manages pending/active signals (signals that are already opened or waiting to reach TP/SL)
2. **PersistScheduleAdapter** - Manages scheduled signals (signals waiting for entry price to activate)

This dual-layer architecture ensures that both signal types can be recovered independently after crashes, with proper callbacks (`onActive` for pending signals, `onSchedule` for scheduled signals).

#### Default Storage Structure

By default, scheduled signals are stored separately from pending signals:

```
./dump/data/
  signal/
    my-strategy/
      BTCUSDT.json      # Pending/active signal state
      ETHUSDT.json
  schedule/
    my-strategy/
      BTCUSDT.json      # Scheduled signal state
      ETHUSDT.json
```

#### How Scheduled Signal Persistence Works

**During Normal Operation:**

When a strategy generates a scheduled signal (limit order waiting for entry), the framework:

1. Stores the signal to disk using atomic writes: `./dump/data/schedule/{strategyName}/{symbol}.json`
2. Monitors price movements for activation
3. When price reaches entry point OR cancellation condition occurs:
   - Deletes scheduled signal from storage
   - Optionally creates pending signal in `PersistSignalAdapter`

**After System Crash:**

When the system restarts:

1. Framework checks for stored scheduled signals during initialization
2. Validates exchange name and strategy name match (security protection)
3. Restores scheduled signal to memory (`_scheduledSignal`)
4. Calls `onSchedule()` callback to notify about restored signal
5. Continues monitoring from where it left off

**Crash Recovery Flow:**

```typescript
// Before crash:
// 1. Strategy generates signal with priceOpen = 50000 (current price = 49500)
// 2. Signal stored to ./dump/data/schedule/my-strategy/BTCUSDT.json
// 3. System waits for price to reach 50000
// 4. CRASH OCCURS at current price = 49800

// After restart:
// 1. System reads ./dump/data/schedule/my-strategy/BTCUSDT.json
// 2. Validates exchangeName and strategyName
// 3. Restores signal to _scheduledSignal
// 4. Calls onSchedule() callback with restored signal
// 5. Continues monitoring for price = 50000
// 6. When price reaches 50000, signal activates normally
```

#### Scheduled Signal Data Structure

```typescript
interface IScheduledSignalRow {
  id: string;                    // Unique signal ID
  position: "long" | "short";
  priceOpen: number;             // Entry price (trigger price for scheduled signal)
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  exchangeName: string;          // Used for validation during restore
  strategyName: string;          // Used for validation during restore
  timestamp: number;
  pendingAt: number;
  scheduledAt: number;
  symbol: string;
  _isScheduled: true;            // Marker for scheduled signals
  note?: string;
}
```

#### Integration with ClientStrategy

The `ClientStrategy` class uses `setScheduledSignal()` method to ensure all scheduled signal changes are persisted:

```typescript
// WRONG - Direct assignment (not persisted)
this._scheduledSignal = newSignal;

// CORRECT - Using setScheduledSignal() method (persisted)
await this.setScheduledSignal(newSignal);
```

**Automatic Persistence Locations:**

All scheduled signal state changes are automatically persisted:

- Signal generation (new scheduled signal created)
- Signal activation (scheduled → pending transition)
- Signal cancellation (timeout or stop loss hit before activation)
- Manual signal clearing

**BACKTEST Mode Exception:**

In backtest mode, persistence is **skipped** for performance reasons:

```typescript
public async setScheduledSignal(scheduledSignal: IScheduledSignalRow | null) {
  this._scheduledSignal = scheduledSignal;

  if (this.params.execution.context.backtest) {
    return; // Skip persistence in backtest mode
  }

  await PersistScheduleAdapter.writeScheduleData(
    this._scheduledSignal,
    this.params.strategyName,
    this.params.execution.context.symbol
  );
}
```

#### Custom Scheduled Signal Adapters

You can replace file-based scheduled signal persistence with custom adapters (Redis, MongoDB, etc.):

```typescript
import { PersistScheduleAdapter, PersistBase } from "backtest-kit";
import Redis from "ioredis";

const redis = new Redis();

class RedisSchedulePersist extends PersistBase {
  async waitForInit(initial: boolean): Promise<void> {
    console.log(`Redis scheduled signal persistence initialized for ${this.entityName}`);
  }

  async readValue<T>(entityId: string | number): Promise<T> {
    const key = `schedule:${this.entityName}:${entityId}`;
    const data = await redis.get(key);

    if (!data) {
      throw new Error(`Scheduled signal ${this.entityName}:${entityId} not found`);
    }

    return JSON.parse(data) as T;
  }

  async hasValue(entityId: string | number): Promise<boolean> {
    const key = `schedule:${this.entityName}:${entityId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  }

  async writeValue<T>(entityId: string | number, entity: T): Promise<void> {
    const key = `schedule:${this.entityName}:${entityId}`;
    const serializedData = JSON.stringify(entity);
    await redis.set(key, serializedData);

    // Optional: Set TTL for scheduled signals (e.g., 24 hours)
    await redis.expire(key, 86400);
  }

  async removeValue(entityId: string | number): Promise<void> {
    const key = `schedule:${this.entityName}:${entityId}`;
    const result = await redis.del(key);

    if (result === 0) {
      throw new Error(`Scheduled signal ${this.entityName}:${entityId} not found for deletion`);
    }
  }

  async removeAll(): Promise<void> {
    const pattern = `schedule:${this.entityName}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  async *values<T>(): AsyncGenerator<T> {
    const pattern = `schedule:${this.entityName}:*`;
    const keys = await redis.keys(pattern);

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

  async *keys(): AsyncGenerator<string> {
    const pattern = `schedule:${this.entityName}:*`;
    const keys = await redis.keys(pattern);

    keys.sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base"
    }));

    for (const key of keys) {
      const entityId = key.slice(`schedule:${this.entityName}:`.length);
      yield entityId;
    }
  }
}

// Register Redis adapter for scheduled signal persistence
PersistScheduleAdapter.usePersistScheduleAdapter(RedisSchedulePersist);
```

#### Best Practices

1. **Always use `setScheduledSignal()`** - Never assign `_scheduledSignal` directly (except in `waitForInit` for restoration)

2. **Validate signal metadata** - Always store `exchangeName` and `strategyName` with signals for validation

3. **Handle empty storage gracefully** - Don't crash when `readScheduleData()` returns `null`

4. **Test crash recovery** - Write E2E tests that simulate system crashes and verify restoration

5. **Choose persistence adapter wisely**:
   - Use file-based for single-instance deployments
   - Use Redis for distributed systems with multiple instances
   - Use MongoDB for analytics and complex queries

6. **Monitor persistence operations** - Use callbacks to track storage operations:

```typescript
addStrategySchema({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
  callbacks: {
    onSchedule: (symbol, signal, price, backtest) => {
      console.log(`Scheduled signal created/restored: ${signal.id}`);
      // Signal was either:
      // 1. Newly generated and persisted
      // 2. Restored from storage after crash
    },
    onCancel: (symbol, signal, price, backtest) => {
      console.log(`Scheduled signal cancelled: ${signal.id}`);
      // Signal was removed from storage
    },
  },
});
```

---

## 🤖 AI Strategy Optimizer

The Optimizer uses LLM (Large Language Models) to generate trading strategies from historical data. It automates the process of analyzing backtest results, generating strategy logic, and creating executable code.

### How It Works

1. **Data Collection**: Fetch historical data from multiple sources (backtest results, market data, indicators)
2. **LLM Training**: Build conversation context with data for each training period
3. **Strategy Generation**: LLM analyzes patterns and generates strategy logic
4. **Code Export**: Auto-generate complete executable code with Walker for testing

### Basic Example

```typescript
import { addOptimizerSchema, Optimizer } from "backtest-kit";

// Register optimizer configuration
addOptimizerSchema({
  optimizerName: "btc-optimizer",

  // Training periods (multiple strategies generated)
  rangeTrain: [
    {
      note: "Bull market Q1 2024",
      startDate: new Date("2024-01-01T00:00:00Z"),
      endDate: new Date("2024-03-31T23:59:59Z"),
    },
    {
      note: "Consolidation Q2 2024",
      startDate: new Date("2024-04-01T00:00:00Z"),
      endDate: new Date("2024-06-30T23:59:59Z"),
    },
  ],

  // Testing period (Walker validates strategies)
  rangeTest: {
    note: "Validation Q3 2024",
    startDate: new Date("2024-07-01T00:00:00Z"),
    endDate: new Date("2024-09-30T23:59:59Z"),
  },

  // Data sources for strategy generation
  source: [
    {
      name: "backtest-results",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        // Fetch closed signals from your backtest database
        return await db.getBacktestResults({
          symbol,
          startDate,
          endDate,
          limit,
          offset,
        });
      },
    },
    {
      name: "market-indicators",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        // Fetch RSI, MACD, volume data, etc.
        return await db.getIndicators({
          symbol,
          startDate,
          endDate,
          limit,
          offset,
        });
      },
    },
  ],

  // LLM prompt generation from conversation history
  getPrompt: async (symbol, messages) => {
    // Analyze messages and create strategy prompt
    return `
      Based on the historical data, create a strategy that:
      - Uses multi-timeframe analysis (1h, 15m, 5m, 1m)
      - Identifies high-probability entry points
      - Uses proper risk/reward ratios (min 1.5:1)
      - Adapts to market conditions
    `;
  },
});

// Generate strategies and export code
await Optimizer.dump("BTCUSDT", {
  optimizerName: "btc-optimizer"
}, "./generated");

// Output: ./generated/btc-optimizer_BTCUSDT.mjs
```

### Generated Code Structure

The Optimizer auto-generates a complete executable file with:

1. **Imports** - All necessary dependencies (backtest-kit, ollama, ccxt)
2. **Helper Functions**:
   - `text()` - LLM text generation for analysis
   - `json()` - Structured signal generation with schema validation
   - `dumpJson()` - Debug logging to ./dump/strategy
3. **Exchange Configuration** - CCXT Binance integration
4. **Frame Definitions** - Training and testing timeframes
5. **Strategy Implementations** - One per training range with multi-timeframe analysis
6. **Walker Setup** - Automatic strategy comparison on test period
7. **Event Listeners** - Progress tracking and result collection

### Advanced Configuration

#### Custom Message Templates

Override default LLM message formatting:

```typescript
addOptimizerSchema({
  optimizerName: "custom-optimizer",
  rangeTrain: [...],
  rangeTest: {...},
  source: [...],
  getPrompt: async (symbol, messages) => "...",

  // Custom templates
  template: {
    getUserMessage: async (symbol, data, sourceName) => {
      return `Analyze ${sourceName} data for ${symbol}:\n${JSON.stringify(data, null, 2)}`;
    },
    getAssistantMessage: async (symbol, data, sourceName) => {
      return `Data from ${sourceName} analyzed successfully`;
    },
  },
});
```

#### Lifecycle Callbacks

Monitor optimizer operations:

```typescript
addOptimizerSchema({
  optimizerName: "monitored-optimizer",
  rangeTrain: [...],
  rangeTest: {...},
  source: [...],
  getPrompt: async (symbol, messages) => "...",

  callbacks: {
    onSourceData: async (symbol, sourceName, data, startDate, endDate) => {
      console.log(`Fetched ${data.length} rows from ${sourceName}`);
    },
    onData: async (symbol, strategyData) => {
      console.log(`Generated ${strategyData.length} strategies for ${symbol}`);
    },
    onCode: async (symbol, code) => {
      console.log(`Generated ${code.length} bytes of code`);
    },
    onDump: async (symbol, filepath) => {
      console.log(`Saved strategy to ${filepath}`);
    },
  },
});
```

#### Multiple Data Sources

Combine different data types for comprehensive analysis:

```typescript
addOptimizerSchema({
  optimizerName: "multi-source-optimizer",
  rangeTrain: [...],
  rangeTest: {...},

  source: [
    // Source 1: Backtest results
    {
      name: "backtest-signals",
      fetch: async (args) => await getBacktestSignals(args),
    },

    // Source 2: Market indicators
    {
      name: "technical-indicators",
      fetch: async (args) => await getTechnicalIndicators(args),
    },

    // Source 3: Volume profile
    {
      name: "volume-analysis",
      fetch: async (args) => await getVolumeProfile(args),
    },

    // Source 4: Order book depth
    {
      name: "order-book",
      fetch: async (args) => await getOrderBookData(args),
    },
  ],

  getPrompt: async (symbol, messages) => {
    // LLM has full context from all sources
    return `Create strategy using all available data sources`;
  },
});
```

### API Methods

```typescript
// Get strategy metadata (no code generation)
const strategies = await Optimizer.getData("BTCUSDT", {
  optimizerName: "my-optimizer"
});

// strategies[0].messages - LLM conversation history
// strategies[0].strategy - Generated strategy prompt

// Generate executable code
const code = await Optimizer.getCode("BTCUSDT", {
  optimizerName: "my-optimizer"
});

// Save to file
await Optimizer.dump("BTCUSDT", {
  optimizerName: "my-optimizer"
}, "./output"); // Default: "./"
```

### LLM Integration

The Optimizer uses Ollama for LLM inference:

```bash
# Set up Ollama API
export OLLAMA_API_KEY=your-api-key

# Run generated strategy
node generated/btc-optimizer_BTCUSDT.mjs
```

Generated strategies use:
- **Model**: `gpt-oss:20b` (configurable in templates)
- **Multi-timeframe analysis**: 1h, 15m, 5m, 1m candles
- **Structured output**: JSON schema with signal validation
- **Debug logging**: Saves conversations to ./dump/strategy

### Best Practices

1. **Training Periods**: Use 2-4 diverse market conditions (bull, bear, sideways)
2. **Data Quality**: Ensure data sources have unique IDs for deduplication
3. **Pagination**: Sources automatically paginated (25 records per request)
4. **Testing**: Always validate generated strategies on unseen data (rangeTest)
5. **Monitoring**: Use callbacks to track data fetching and code generation

---

## 📐 Architecture Overview

The framework follows **clean architecture** with:

- **Client Layer** - Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame)
- **Service Layer** - DI-based services organized by responsibility
  - **Schema Services** - Registry pattern for configuration
  - **Connection Services** - Memoized client instance creators
  - **Global Services** - Context wrappers for public API
  - **Logic Services** - Async generator orchestration (backtest/live)
- **Persistence Layer** - Crash-safe atomic file writes with `PersistSignalAdapter`

---

## ✅ Signal Validation

All signals are validated automatically before execution:

```typescript
// ✅ Valid long signal
{
  position: "long",
  priceOpen: 50000,
  priceTakeProfit: 51000,  // ✅ 51000 > 50000
  priceStopLoss: 49000,     // ✅ 49000 < 50000
  minuteEstimatedTime: 60,  // ✅ positive
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

---

## 🧠 Interval Throttling

Prevent signal spam with automatic throttling:

```typescript
addStrategySchema({
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

---

## 📝 Markdown Reports

Generate detailed trading reports with statistics:

### Backtest Reports

```typescript
import { Backtest } from "backtest-kit";

// Get raw statistical data (Controller)
const stats = await Backtest.getData("my-strategy");
console.log(stats);
// Returns:
// {
//   signalList: [...],           // All closed signals
//   totalSignals: 10,
//   winCount: 7,
//   lossCount: 3,
//   winRate: 70.0,               // Percentage (higher is better)
//   avgPnl: 1.23,                // Average PNL % (higher is better)
//   totalPnl: 12.30,             // Total PNL % (higher is better)
//   stdDev: 2.45,                // Standard deviation (lower is better)
//   sharpeRatio: 0.50,           // Risk-adjusted return (higher is better)
//   annualizedSharpeRatio: 9.55, // Sharpe × √365 (higher is better)
//   certaintyRatio: 1.75,        // avgWin / |avgLoss| (higher is better)
//   expectedYearlyReturns: 156   // Estimated yearly trades (higher is better)
// }

// Generate markdown report (View)
const markdown = await Backtest.getReport("my-strategy");

// Save to disk (default: ./logs/backtest/my-strategy.md)
await Backtest.dump("my-strategy");
```

### Live Trading Reports

```typescript
import { Live } from "backtest-kit";

// Get raw statistical data (Controller)
const stats = await Live.getData("my-strategy");
console.log(stats);
// Returns:
// {
//   eventList: [...],            // All events (idle, scheduled, opened, active, closed, cancelled)
//   totalEvents: 15,
//   totalClosed: 5,
//   winCount: 3,
//   lossCount: 2,
//   winRate: 60.0,               // Percentage (higher is better)
//   avgPnl: 1.23,                // Average PNL % (higher is better)
//   totalPnl: 6.15,              // Total PNL % (higher is better)
//   stdDev: 1.85,                // Standard deviation (lower is better)
//   sharpeRatio: 0.66,           // Risk-adjusted return (higher is better)
//   annualizedSharpeRatio: 12.61,// Sharpe × √365 (higher is better)
//   certaintyRatio: 2.10,        // avgWin / |avgLoss| (higher is better)
//   expectedYearlyReturns: 365   // Estimated yearly trades (higher is better)
// }

// Generate markdown report (View)
const markdown = await Live.getReport("my-strategy");

// Save to disk (default: ./logs/live/my-strategy.md)
await Live.dump("my-strategy");
```

### Scheduled Signals Reports

```typescript
import { Schedule } from "backtest-kit";

// Get raw scheduled signals data (Controller)
const stats = await Schedule.getData("my-strategy");
console.log(stats);
// Returns:
// {
//   eventList: [...],            // All scheduled/cancelled events
//   totalEvents: 8,
//   totalScheduled: 6,           // Number of scheduled signals
//   totalCancelled: 2,           // Number of cancelled signals
//   cancellationRate: 33.33,     // Percentage (lower is better)
//   avgWaitTime: 45.5,           // Average wait time for cancelled signals in minutes
// }

// Generate markdown report (View)
const markdown = await Schedule.getReport("my-strategy");

// Save to disk (default: ./logs/schedule/my-strategy.md)
await Schedule.dump("my-strategy");

// Clear accumulated data
await Schedule.clear("my-strategy");
```

**Scheduled Signals Report Example:**
```markdown
# Scheduled Signals Report: my-strategy

| Timestamp | Action | Symbol | Signal ID | Position | Note | Current Price | Entry Price | Take Profit | Stop Loss | Wait Time (min) |
|-----------|--------|--------|-----------|----------|------|---------------|-------------|-------------|-----------|-----------------|
| 2024-01-15T10:30:00Z | SCHEDULED | BTCUSDT | sig-001 | LONG | BTC breakout | 42150.50 USD | 42000.00 USD | 43000.00 USD | 41000.00 USD | N/A |
| 2024-01-15T10:35:00Z | CANCELLED | BTCUSDT | sig-002 | LONG | BTC breakout | 42350.80 USD | 10000.00 USD | 11000.00 USD | 9000.00 USD | 60 |

**Total events:** 8
**Scheduled signals:** 6
**Cancelled signals:** 2
**Cancellation rate:** 33.33% (lower is better)
**Average wait time (cancelled):** 45.50 minutes
```

---

## 🎧 Event Listeners

### Listen to All Signals (Backtest + Live)

```typescript
import { listenSignal } from "backtest-kit";

// Listen to both backtest and live signals
listenSignal((event) => {
  console.log(`[${event.backtest ? "BT" : "LIVE"}] ${event.action}:`, event.signal.id);

  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
    console.log("Close reason:", event.closeReason);
  }
});
```

### Listen to Partial Profit/Loss Events

```typescript
import {
  listenPartialProfitAvailable,
  listenPartialLossAvailable,
  listenPartialProfitAvailableOnce,
  listenPartialLossAvailableOnce,
  Constant
} from "backtest-kit";

// Listen to all profit milestones
listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);

  // Scale out at Kelly-optimized levels
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

// Listen to all loss milestones
listenPartialLossAvailable(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});

// Listen once to first profit level
listenPartialProfitAvailableOnce(
  () => true, // Accept any profit event
  ({ symbol, signal, price, level, backtest }) => {
    console.log(`First profit milestone: ${level}%`);
  }
);

// Listen once to first loss level
listenPartialLossAvailableOnce(
  () => true, // Accept any loss event
  ({ symbol, signal, price, level, backtest }) => {
    console.log(`First loss milestone: -${level}%`);
  }
);
```

### Listen Once with Filter

```typescript
import { listenSignalOnce, listenSignalLiveOnce } from "backtest-kit";

// Listen once with filter
listenSignalOnce(
  (event) => event.action === "closed" && event.pnl.pnlPercentage > 5,
  (event) => {
    console.log("Big win detected:", event.pnl.pnlPercentage);
  }
);

// Listen once for specific symbol in live mode
listenSignalLiveOnce(
  (event) => event.signal.symbol === "BTCUSDT" && event.action === "opened",
  (event) => {
    console.log("BTC signal opened:", event.signal.id);
  }
);
```

### Listen to Background Completion

```typescript
import { listenDoneBacktest, listenDoneLive, listenDoneWalker } from "backtest-kit";

// Backtest completion
listenDoneBacktest((event) => {
  console.log("Backtest completed:", event.strategyName);
  console.log("Symbol:", event.symbol);
  console.log("Exchange:", event.exchangeName);
});

// Live trading completion
listenDoneLive((event) => {
  console.log("Live trading stopped:", event.strategyName);
});

// Walker completion
listenDoneWalker((event) => {
  console.log("Walker completed:", event.strategyName);
  console.log("Best strategy:", event.bestStrategy);
});
```

---

## ⚙️ Global Configuration

You can customize framework behavior using the `setConfig()` function. This allows you to adjust global parameters without modifying the source code.

### Available Configuration Options

```typescript
import { setConfig } from "backtest-kit";

// Configure global parameters
await setConfig({
  // Time to wait for scheduled signal activation (in minutes)
  // If a scheduled signal doesn't activate within this time, it will be cancelled
  // Default: 120 minutes
  CC_SCHEDULE_AWAIT_MINUTES: 90,

  // Number of candles to use for average price calculation (VWAP)
  // Used in both backtest and live modes for price calculations
  // Default: 5 candles (last 5 minutes when using 1m interval)
  CC_AVG_PRICE_CANDLES_COUNT: 10,
});
```

### Configuration Parameters

#### `CC_SCHEDULE_AWAIT_MINUTES`

Controls how long scheduled signals wait for activation before being cancelled.

- **Default:** `120` minutes (2 hours)
- **Use case:** Adjust based on market volatility and strategy timeframe
- **Example:** Lower for scalping strategies (30-60 min), higher for swing trading (180-360 min)

```typescript
// For scalping strategies with tight entry windows
await setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 30,
});

// For swing trading with wider entry windows
await setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 240,
});
```

#### `CC_AVG_PRICE_CANDLES_COUNT`

Controls the number of 1-minute candles used for VWAP (Volume Weighted Average Price) calculations.

- **Default:** `5` candles (5 minutes of data)
- **Use case:** Adjust for more stable (higher) or responsive (lower) price calculations
- **Impact:** Affects entry/exit prices in both backtest and live modes

```typescript
// More responsive to recent price changes (3 minutes)
await setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 3,
});

// More stable, less sensitive to spikes (10 minutes)
await setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 10,
});
```

### When to Call `setConfig()`

Always call `setConfig()` **before** running any strategies to ensure configuration is applied:

```typescript
import { setConfig, Backtest, Live } from "backtest-kit";

// 1. Configure framework first
await setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 90,
  CC_AVG_PRICE_CANDLES_COUNT: 7,
});

// 2. Then run strategies
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

Live.background("ETHUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

### Partial Configuration

You can update individual parameters without specifying all of them:

```typescript
// Only change candle count, keep other defaults
await setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 8,
});

// Later, only change timeout
await setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 60,
});
```

---

## ✅ Tested & Reliable

`backtest-kit` comes with **244 unit and integration tests** covering:

- Signal validation and throttling
- PNL calculation with fees and slippage
- Crash recovery and state persistence
- Dual-layer persistence (pending signals and scheduled signals)
- Crash recovery validation (exchange/strategy name mismatch protection)
- Graceful shutdown (Backtest.stop, Live.stop, Walker.stop) with signal completion
- Callback execution order (onSchedule, onOpen, onActive, onClose, onCancel)
- Markdown report generation (backtest, live, scheduled signals)
- Walker strategy comparison and early termination
- Heatmap portfolio analysis
- Position sizing calculations
- Risk management validation
- Scheduled signals lifecycle and cancellation tracking
- Event system

---

## 🤝 Contribute

We'd love your input! Fork the repo, submit a PR, or open an issue on **[GitHub](https://github.com/tripolskypetr/backtest-kit)**. 🙌

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr) 🖋️
