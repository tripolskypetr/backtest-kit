# 🧿 Backtest Kit

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
- 📈 **Accurate PNL** - Calculation with fees (0.1%) and slippage (0.1%)
- 🧠 **Interval Throttling** - Prevents signal spam at strategy level
- ⚡ **Memory Optimized** - Prototype methods + memoization + streaming
- 🔌 **Flexible Architecture** - Plug your own exchanges and strategies
- 📝 **Markdown Reports** - Auto-generated trading reports with statistics (win rate, avg PNL, Sharpe Ratio, Standard Deviation, Certainty Ratio, Expected Yearly Returns, Risk-Adjusted Returns)
- 📊 **Revenue Profiling** - Built-in performance tracking with aggregated statistics (avg, min, max, stdDev, P95, P99) for bottleneck analysis
- 🛑 **Graceful Shutdown** - Live.background() waits for open positions to close before stopping
- 💉 **Strategy Dependency Injection** - addStrategy() enables DI pattern for trading strategies
- 🔍 **Schema Reflection API** - listExchanges(), listStrategies(), listFrames() for runtime introspection
- 🏃 **Strategy Comparison (Walker)** - Compare multiple strategies in parallel with automatic ranking and statistical analysis
- 🔥 **Portfolio Heatmap** - Multi-symbol performance analysis with extended metrics (Profit Factor, Expectancy, Win/Loss Streaks, Avg Win/Loss) sorted by Sharpe Ratio
- 🧪 **Comprehensive Test Coverage** - 109 unit and integration tests covering validation, PNL, callbacks, reports, performance tracking, walker, heatmap, position sizing, risk management, and event system
- 💰 **Position Sizing Calculator** - Built-in position sizing methods (Fixed Percentage, Kelly Criterion, ATR-based) with risk management constraints
- 🛡️ **Risk Management System** - Portfolio-level risk controls with custom validation logic, concurrent position limits, and cross-strategy coordination
- 💾 **Zero Data Download** - Unlike Freqtrade, no need to download gigabytes of historical data - plug any data source (CCXT, database, API)
- 🔒 **Safe Math & Robustness** - All metrics protected against NaN/Infinity with unsafe numeric checks, returns N/A for invalid calculations

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
    // Validation happens automatically (prices, TP/SL logic)
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
import { Backtest, listenSignalBacktest, listenError, listenDoneBacktest } from "backtest-kit";

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

// Listen to backtest completion
listenDoneBacktest((event) => {
  console.log("Backtest completed:", event.symbol);
  // Generate and save report
  Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
});
```

### 5. Run Live Trading (Crash-Safe)

```typescript
import { Live, listenSignalLive, listenError, listenDoneLive } from "backtest-kit";

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

// Listen to live trading completion
listenDoneLive((event) => {
  console.log("Live trading stopped:", event.symbol);
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

### 7. Strategy Comparison with Walker (Optional)

Walker runs multiple strategies in parallel and compares their performance to find the best one. It automatically pulls configuration from walker schema.

#### Register Walker Schema

```typescript
import { addWalker } from "backtest-kit";

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
```

#### Run Walker Comparison

```typescript
import { Walker, listenWalker, listenDoneWalker } from "backtest-kit";

// Listen to walker progress
listenWalker((progress) => {
  console.log(`Progress: ${progress.strategiesTested}/${progress.totalStrategies}`);
  console.log(`Current best: ${progress.bestStrategy} (${progress.bestMetric})`);
});

// Listen to walker completion
listenDoneWalker((event) => {
  console.log("Walker completed:", event.strategyName);
  Walker.dump(event.symbol, event.strategyName); // Save report
});

// Run walker in background
Walker.background("BTCUSDT", {
  walkerName: "btc-walker"
});

// Or manually iterate
for await (const progress of Walker.run("BTCUSDT", {
  walkerName: "btc-walker"
})) {
  console.log("Progress:", progress.strategiesTested, "/", progress.totalStrategies);
  console.log("Best so far:", progress.bestStrategy, progress.bestMetric);
}
```

#### Get Walker Results

```typescript
import { Walker } from "backtest-kit";

// Get raw comparison data (Controller)
const results = await Walker.getData("BTCUSDT", "btc-walker");
console.log(results);
// Returns:
// {
//   bestStrategy: "strategy-b",
//   bestMetric: 1.85,
//   strategies: [
//     {
//       strategyName: "strategy-a",
//       stats: { sharpeRatio: 1.23, winRate: 65.5, ... },
//       metric: 1.23
//     },
//     {
//       strategyName: "strategy-b",
//       stats: { sharpeRatio: 1.85, winRate: 72.3, ... },
//       metric: 1.85
//     },
//     {
//       strategyName: "strategy-c",
//       stats: { sharpeRatio: 0.98, winRate: 58.2, ... },
//       metric: 0.98
//     }
//   ]
// }

// Generate markdown report (View)
const markdown = await Walker.getReport("BTCUSDT", "btc-walker");
console.log(markdown);

// Save to disk (default: ./logs/walker/btc-walker.md)
await Walker.dump("BTCUSDT", "btc-walker");

// Save to custom path
await Walker.dump("BTCUSDT", "btc-walker", "./custom/path");
```

**Walker Report Example:**
```markdown
# Walker Report: btc-walker

Symbol: BTCUSDT
Comparison metric: Sharpe Ratio (higher is better)
Total strategies tested: 3

## Best Strategy: strategy-b
Metric value: 1.85

## All Strategies Ranked

| Rank | Strategy | Metric | Win Rate | Avg PNL | Total PNL | Std Dev |
|------|----------|--------|----------|---------|-----------|---------|
| 1    | strategy-b | 1.85 | 72.3% | +2.15% | +43.00% | 1.16% |
| 2    | strategy-a | 1.23 | 65.5% | +1.85% | +37.00% | 1.50% |
| 3    | strategy-c | 0.98 | 58.2% | +1.45% | +29.00% | 1.48% |
```

**Available metrics for comparison:**
- `sharpeRatio` - Risk-adjusted return (default)
- `winRate` - Win percentage
- `avgPnl` - Average PNL percentage
- `totalPnl` - Total PNL percentage
- `certaintyRatio` - avgWin / |avgLoss|

### 8. Portfolio Heatmap (Optional)

Heat provides portfolio-wide performance analysis across multiple symbols with extended metrics. Automatically collects data from all closed signals per strategy.

#### Get Heatmap Data

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

// Get raw heatmap data (Controller)
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

// Generate markdown report (View)
const markdown = await Heat.getReport("my-strategy");
console.log(markdown);

// Save to disk (default: ./logs/heatmap/my-strategy.md)
await Heat.dump("my-strategy");

// Save to custom path
await Heat.dump("my-strategy", "./reports");

// Clear accumulated data
Heat.clear("my-strategy");

// Clear all strategies
Heat.clear();
```

#### Heatmap Report Example

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

**Note:** Symbols are sorted by Sharpe Ratio descending (best performers first).

#### Use Cases

- **Multi-Symbol Portfolio Analysis** - Compare performance across different trading pairs
- **Symbol Selection** - Identify which symbols work best with your strategy
- **Risk Management** - Monitor drawdowns and streaks across the portfolio
- **Strategy Optimization** - Focus on symbols with highest Sharpe Ratio
- **Performance Tracking** - Track long-term portfolio health with expectancy and profit factor

### 9. Position Sizing Calculator (Optional)

Position Sizing Calculator helps determine optimal position sizes based on risk management rules. Three calculation methods are available with constraint enforcement.

#### Register Position Sizing Schemas

```typescript
import { addSizing } from "backtest-kit";

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
```

#### Calculate Position Sizes

```typescript
import { PositionSize } from "backtest-kit";

// Fixed Percentage Method
const quantity1 = await PositionSize.fixedPercentage(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  49000,      // Stop loss: $49,000
  { sizingName: "conservative" }
);
console.log(`Position size: ${quantity1} BTC`);
// Formula: (accountBalance * riskPercentage / 100) / |priceOpen - priceStopLoss|
// Example: (10000 * 0.02) / |50000 - 49000| = 0.2 BTC

// Kelly Criterion Method
const quantity2 = await PositionSize.kellyCriterion(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  0.55,       // Win rate: 55%
  1.5,        // Win/loss ratio: 1.5
  { sizingName: "kelly-quarter" }
);
console.log(`Position size: ${quantity2} BTC`);
// Formula: (winRate - (1 - winRate) / winLossRatio) * kellyMultiplier * accountBalance / priceOpen
// Example: (0.55 - 0.45/1.5) * 0.25 * 10000 / 50000 = 0.0125 BTC

// ATR-based Method
const quantity3 = await PositionSize.atrBased(
  "BTCUSDT",
  10000,      // Account balance: $10,000
  50000,      // Entry price: $50,000
  500,        // ATR: $500
  { sizingName: "atr-dynamic" }
);
console.log(`Position size: ${quantity3} BTC`);
// Formula: (accountBalance * riskPercentage / 100) / (atr * atrMultiplier)
// Example: (10000 * 0.02) / (500 * 2) = 0.2 BTC
```

#### Integration with Strategy

```typescript
import { addStrategy, PositionSize, getCandles, listenSignalLive } from "backtest-kit";

// Mock Binance exchange client
const binance = {
  marketBuy: async (symbol: string, quantity: number) => {
    console.log(`[BINANCE] Market BUY: ${quantity} ${symbol}`);
    // return await exchange.createOrder(symbol, "market", "buy", quantity);
    return { orderId: Math.random().toString(), symbol, side: "buy", quantity };
  },
  marketSell: async (symbol: string, quantity: number) => {
    console.log(`[BINANCE] Market SELL: ${quantity} ${symbol}`);
    // return await exchange.createOrder(symbol, "market", "sell", quantity);
    return { orderId: Math.random().toString(), symbol, side: "sell", quantity };
  },
  getBalance: async (asset: string) => {
    console.log(`[BINANCE] Get balance: ${asset}`);
    // return await exchange.fetchBalance();
    return { free: 10000, used: 0, total: 10000 };
  },
};

addStrategy({
  strategyName: "sma-crossover-sized",
  interval: "5m",
  getSignal: async (symbol) => {
    return {
      position: "long",
      priceOpen: 50000,
      priceTakeProfit: 51000,
      priceStopLoss: 49000,
      minuteEstimatedTime: 60,
    };
  },
  callbacks: {
    onOpen: async (symbol, signal, currentPrice, backtest) => {
      if (backtest) return; // Skip execution in backtest mode

      // Calculate ATR for dynamic sizing
      const candles = await getCandles(symbol, "1h", 14);
      const atr = calculateATR(candles); // Your ATR calculation

      // Get account balance from exchange
      const balance = await binance.getBalance("USDT");
      const accountBalance = balance.free;

      // Calculate position size based on volatility
      const quantity = await PositionSize.atrBased(
        symbol,
        accountBalance,
        signal.priceOpen,
        atr,
        { sizingName: "atr-dynamic" }
      );

      console.log(`[LIVE] Opening position: ${quantity} BTC at ${currentPrice}`);

      // Execute market buy order
      const order = await binance.marketBuy(symbol, quantity);
      console.log(`Order executed:`, order);
    },
    onClose: async (symbol, signal, priceClose, backtest) => {
      if (backtest) return; // Skip execution in backtest mode

      // Get actual BTC balance from exchange
      const balance = await binance.getBalance("BTC");
      const quantity = balance.free; // Sell all available BTC

      console.log(`[LIVE] Closing position: ${quantity} BTC at ${priceClose}`);
      console.log(`Entry: ${signal.priceOpen}, Exit: ${priceClose}`);
      console.log(`P&L: ${((priceClose - signal.priceOpen) / signal.priceOpen * 100).toFixed(2)}%`);

      // Execute market sell order to close entire position
      const order = await binance.marketSell(symbol, quantity);
      console.log(`Order executed:`, order);
    },
  },
});

// Alternative: Calculate in listener
listenSignalLive(async (event) => {
  if (event.action === "opened") {
    // Calculate position size when signal opens
    const candles = await getCandles(event.signal.symbol, "1h", 14);
    const atr = calculateATR(candles);

    // Get account balance from exchange
    const balance = await binance.getBalance("USDT");
    const accountBalance = balance.free;

    const quantity = await PositionSize.atrBased(
      event.signal.symbol,
      accountBalance,
      event.signal.priceOpen,
      atr,
      { sizingName: "atr-dynamic" }
    );

    console.log(`Position opened: ${quantity} BTC at ${event.currentPrice}`);

    // Execute market buy order
    const order = await binance.marketBuy(event.signal.symbol, quantity);
    console.log(`Order executed:`, order);
  }

  if (event.action === "closed") {
    // Get actual BTC balance from exchange
    const balance = await binance.getBalance("BTC");
    const quantity = balance.free; // Sell all available BTC

    console.log(`Position closed: ${quantity} BTC at ${event.currentPrice}`);
    console.log(`Close reason: ${event.closeReason}`);
    console.log(`P&L: ${event.pnl.pnlPercentage.toFixed(2)}%`);

    // Execute market sell order to close entire position with profit/loss
    const order = await binance.marketSell(event.signal.symbol, quantity);
    console.log(`Order executed:`, order);
  }
});
```

#### List Available Sizing Schemas

```typescript
import { listSizings } from "backtest-kit";

const sizings = await listSizings();
console.log("Available sizing methods:", sizings.map(s => ({
  name: s.sizingName,
  method: s.method,
  note: s.note
})));
// Output:
// [
//   { name: "conservative", method: "fixed-percentage", note: "Conservative 2% risk..." },
//   { name: "kelly-quarter", method: "kelly-criterion", note: "Kelly Criterion with 25%..." },
//   { name: "atr-dynamic", method: "atr-based", note: "ATR-based sizing with 2x..." }
// ]
```

#### Position Sizing Callbacks

```typescript
import { addSizing } from "backtest-kit";

addSizing({
  sizingName: "monitored",
  method: "fixed-percentage",
  riskPercentage: 2,
  callbacks: {
    onCalculate: (quantity, params) => {
      console.log(`Calculated position size: ${quantity}`);
      console.log(`Symbol: ${params.symbol}`);
      console.log(`Account balance: ${params.accountBalance}`);
      console.log(`Entry price: ${params.priceOpen}`);

      // Log to monitoring system, send alerts, etc.
      if (quantity > 1.0) {
        console.warn("Large position size detected!");
      }
    },
  },
});
```

#### Constraint Enforcement

All sizing methods enforce optional constraints automatically:

```typescript
addSizing({
  sizingName: "constrained",
  method: "fixed-percentage",
  riskPercentage: 10,               // High risk percentage
  maxPositionPercentage: 5,         // But cap at 5% of account
  minPositionSize: 0.01,            // Minimum 0.01 BTC
  maxPositionSize: 0.5,             // Maximum 0.5 BTC
});

const quantity = await PositionSize.fixedPercentage(
  "BTCUSDT",
  10000,      // $10,000 account
  50000,      // $50,000 entry
  49000,      // $49,000 stop
  { sizingName: "constrained" }
);
// Without constraints: (10000 * 0.10) / 1000 = 1.0 BTC
// With maxPositionPercentage: min(1.0, 10000 * 0.05 / 50000) = 0.01 BTC
// With maxPositionSize: min(0.01, 0.5) = 0.01 BTC
// Result: 0.01 BTC (enforces all constraints)
```

**Available Constraints:**
- `maxPositionPercentage` - Maximum percentage of account in single position
- `minPositionSize` - Minimum position size in base currency
- `maxPositionSize` - Maximum position size in base currency

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

### 10. Risk Management (Optional)

Risk Management provides portfolio-level risk controls across strategies with custom validation logic. Prevent overexposure by limiting concurrent positions, filtering symbols, implementing time-based rules, or any custom logic.

#### Register Risk Profiles

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

// Price-based filtering
addRisk({
  riskName: "price-filter",
  note: "Avoid trading during low liquidity (price < $100)",
  validations: [
    ({ currentPrice }) => {
      if (currentPrice < 100) {
        throw new Error("Price too low - liquidity risk");
      }
    },
  ],
});

// Multi-strategy coordination with position inspection
addRisk({
  riskName: "strategy-coordinator",
  note: "Limit exposure per strategy and inspect active positions",
  validations: [
    ({ activePositions, strategyName }) => {
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

// Complex validation with multiple rules
addRisk({
  riskName: "advanced",
  note: "Advanced risk profile with multiple validations",
  validations: [
    // Validation 1: Position limit
    ({ activePositionCount }) => {
      if (activePositionCount >= 5) {
        throw new Error("Max 5 positions");
      }
    },
    // Validation 2: Symbol filter
    ({ symbol }) => {
      if (symbol.endsWith("BUSD")) {
        throw new Error("BUSD pairs not allowed");
      }
    },
    // Validation 3: Time filter
    ({ timestamp }) => {
      const hour = new Date(timestamp).getUTCHours();
      if (hour < 6 || hour >= 22) {
        throw new Error("Trading hours: 6 AM - 10 PM UTC");
      }
    },
  ],
});
```

#### Attach Risk Profile to Strategy

```typescript
import { addStrategy } from "backtest-kit";

addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  riskName: "conservative", // Attach risk profile
  getSignal: async (symbol) => {
    return {
      position: "long",
      priceOpen: 50000,
      priceTakeProfit: 51000,
      priceStopLoss: 49000,
      minuteEstimatedTime: 60,
    };
  },
});
```

#### Multiple Strategies Sharing Risk Profile

```typescript
import { addStrategy, addRisk } from "backtest-kit";

// Shared risk profile for all strategies
addRisk({
  riskName: "portfolio-risk",
  note: "Portfolio-wide max 10 positions across all strategies",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 10) {
        throw new Error("Portfolio limit: 10 positions");
      }
    },
  ],
});

// Strategy A
addStrategy({
  strategyName: "momentum",
  interval: "5m",
  riskName: "portfolio-risk", // Shared risk profile
  getSignal: async (symbol) => ({...}),
});

// Strategy B
addStrategy({
  strategyName: "mean-reversion",
  interval: "15m",
  riskName: "portfolio-risk", // Same risk profile
  getSignal: async (symbol) => ({...}),
});

// Both strategies share the same 10-position limit
// If strategy A has 6 open positions, strategy B can only open 4 more
```

#### Risk Validation Context

Each validation function receives the following context:

```typescript
interface IRiskValidationPayload {
  symbol: string;                      // Trading symbol (e.g., "BTCUSDT")
  strategyName: string;                // Strategy name attempting to open position
  exchangeName: string;                // Exchange name
  currentPrice: number;                // Current market price
  timestamp: number;                   // Signal timestamp (epoch ms)
  activePositionCount: number;         // Number of currently open positions
  activePositions: Array<{             // Array of all active positions
    strategyName: string;              // Strategy that opened this position
    symbol: string;                    // Trading symbol
  }>;
}
```

#### Listen to Validation Errors

```typescript
import { listenValidation } from "backtest-kit";

// Monitor risk validation errors in real-time
const unsubscribe = listenValidation((error) => {
  console.error("Risk validation error:", error.message);

  // Log to monitoring service
  // Send alerts
  // Track rejection patterns
});

// Stop listening
// unsubscribe();
```

#### List Registered Risk Profiles

```typescript
import { listRisks } from "backtest-kit";

const risks = await listRisks();
console.log("Available risk profiles:", risks.map(r => ({
  name: r.riskName,
  note: r.note,
  validationCount: r.validations?.length || 0
})));
// Output:
// [
//   { name: "conservative", note: "Conservative risk...", validationCount: 1 },
//   { name: "no-meme-coins", note: "Block meme coins...", validationCount: 1 },
//   { name: "trading-hours", note: "Only trade during...", validationCount: 1 }
// ]
```

#### Risk Validation Flow

1. **Signal Generation** - Strategy generates a signal
2. **Risk Check** - Before opening position, risk.checkSignal() is called
3. **Validation Execution** - All validation functions execute sequentially
4. **Fail-Fast** - First validation that throws an error stops execution
5. **Callbacks** - `onRejected` or `onAllowed` callback is triggered
6. **Result** - Signal is either allowed (position opens) or rejected (signal ignored)

**Example validation flow:**

```typescript
// Strategy generates signal at 10 AM UTC
const signal = {
  position: "long",
  priceOpen: 50000,
  // ...
};

// Risk validation checks:
// 1. activePositionCount < 3? ✅ Pass (currently 2 open)
// 2. symbol not in meme coins? ✅ Pass (BTCUSDT is not a meme coin)
// 3. hour between 9-17? ✅ Pass (10 AM is valid)
// 4. price >= 100? ✅ Pass ($50,000 > $100)

// All validations pass → onAllowed() callback → Position opens

// If any validation fails → onRejected() callback → Signal ignored
```

#### Validation Rules Best Practices

1. **Keep validations simple** - Each validation should check one thing
2. **Throw descriptive errors** - Error messages help debug rejections
3. **Use fail-fast** - Order validations by cheapest-to-check first
4. **Avoid side effects** - Validations should be pure checks
5. **Test thoroughly** - Use unit tests to verify validation logic

#### Use Cases

- **Position Limits** - Prevent overexposure by limiting concurrent positions
- **Symbol Filtering** - Block specific coins or pairs from trading
- **Time Windows** - Only trade during specific hours or days
- **Price Filtering** - Avoid low-liquidity or extreme price ranges
- **Cross-Strategy Coordination** - Share risk limits across multiple strategies
- **Portfolio Limits** - Enforce portfolio-wide constraints
- **Dynamic Rules** - Implement any custom logic based on market conditions

### 11. Schema Reflection API (Optional)

Retrieve registered schemas at runtime for debugging, documentation, or building dynamic UIs:

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  addSizing,
  listExchanges,
  listStrategies,
  listFrames,
  listSizings
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

addSizing({
  sizingName: "conservative",
  note: "Conservative 2% risk per trade",
  method: "fixed-percentage",
  riskPercentage: 2,
  maxPositionPercentage: 10,
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

const sizings = await listSizings();
console.log("Available sizings:", sizings.map(s => ({
  name: s.sizingName,
  note: s.note,
  method: s.method
})));
// Output: [{ name: "conservative", note: "Conservative 2% risk...", method: "fixed-percentage" }]

const risks = await listRisks();
console.log("Available risks:", risks.map(r => ({
  name: r.riskName,
  note: r.note,
  validationCount: r.validations?.length || 0
})));
// Output: [{ name: "conservative", note: "Conservative risk...", validationCount: 1 }]
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
console.log(markdown);

// Save to disk (default: ./logs/backtest/my-strategy.md)
await Backtest.dump("my-strategy");

// Save to custom path
await Backtest.dump("my-strategy", "./custom/path");
```

**getData() returns BacktestStatistics:**
- `signalList` - Array of all closed signals
- `totalSignals` - Total number of closed signals
- `winCount` / `lossCount` - Number of winning/losing trades
- `winRate` - Win percentage (higher is better)
- `avgPnl` - Average PNL percentage (higher is better)
- `totalPnl` - Total PNL percentage (higher is better)
- `stdDev` - Standard deviation / volatility (lower is better)
- `sharpeRatio` - Risk-adjusted return (higher is better)
- `annualizedSharpeRatio` - Sharpe Ratio × √365 (higher is better)
- `certaintyRatio` - avgWin / |avgLoss| (higher is better)
- `expectedYearlyReturns` - Estimated number of trades per year (higher is better)

**getReport() includes:**
- All metrics from getData() formatted as markdown
- All signal details (prices, TP/SL, PNL, duration, close reason)
- Timestamps for each signal
- "Higher is better" / "Lower is better" annotations

### Live Trading Reports

```typescript
import { Live } from "backtest-kit";

// Get raw statistical data (Controller)
const stats = await Live.getData("my-strategy");
console.log(stats);
// Returns:
// {
//   eventList: [...],            // All events (idle, opened, active, closed)
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

**getData() returns LiveStatistics:**
- `eventList` - Array of all events (idle, opened, active, closed)
- `totalEvents` - Total number of events
- `totalClosed` - Total number of closed signals
- `winCount` / `lossCount` - Number of winning/losing trades
- `winRate` - Win percentage (higher is better)
- `avgPnl` - Average PNL percentage (higher is better)
- `totalPnl` - Total PNL percentage (higher is better)
- `stdDev` - Standard deviation / volatility (lower is better)
- `sharpeRatio` - Risk-adjusted return (higher is better)
- `annualizedSharpeRatio` - Sharpe Ratio × √365 (higher is better)
- `certaintyRatio` - avgWin / |avgLoss| (higher is better)
- `expectedYearlyReturns` - Estimated number of trades per year (higher is better)

**getReport() includes:**
- All metrics from getData() formatted as markdown
- Signal-by-signal details with current state
- "Higher is better" / "Lower is better" annotations

**Report example:**
```markdown
# Live Trading Report: my-strategy

Total events: 15
Closed signals: 5
Win rate: 60.00% (3W / 2L) (higher is better)
Average PNL: +1.23% (higher is better)
Total PNL: +6.15% (higher is better)
Standard Deviation: 1.85% (lower is better)
Sharpe Ratio: 0.66 (higher is better)
Annualized Sharpe Ratio: 12.61 (higher is better)
Certainty Ratio: 2.10 (higher is better)
Expected Yearly Returns: 365 trades (higher is better)

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
- `listenPerformance(callback)` - Subscribe to performance metrics (backtest + live)
- `listenProgress(callback)` - Subscribe to backtest progress events
- `listenError(callback)` - Subscribe to background execution errors
- `listenDoneLive(callback)` - Subscribe to live background completion events
- `listenDoneLiveOnce(filter, callback)` - Subscribe to live background completion once
- `listenDoneBacktest(callback)` - Subscribe to backtest background completion events
- `listenDoneBacktestOnce(filter, callback)` - Subscribe to backtest background completion once
- `listenDoneWalker(callback)` - Subscribe to walker background completion events
- `listenDoneWalkerOnce(filter, callback)` - Subscribe to walker background completion once
- `listenWalker(callback)` - Subscribe to walker progress events (each strategy completion)
- `listenWalkerOnce(filter, callback)` - Subscribe to walker progress events once
- `listenWalkerComplete(callback)` - Subscribe to final walker results (all strategies compared)
- `listenValidation(callback)` - Subscribe to risk validation errors

All listeners return an `unsubscribe` function. All callbacks are processed sequentially using queued async execution.

### Listen to Background Completion

```typescript
import {
  listenDoneBacktest,
  listenDoneBacktestOnce,
  listenDoneLive,
  Backtest,
  Live
} from "backtest-kit";

// Listen to backtest completion events
listenDoneBacktest((event) => {
  console.log("Backtest completed:", {
    symbol: event.symbol,
    strategy: event.strategyName,
    exchange: event.exchangeName,
  });

  // Auto-generate report on completion
  Backtest.dump(event.strategyName);
});

// Listen to live completion events
listenDoneLive((event) => {
  console.log("Live trading stopped:", {
    symbol: event.symbol,
    strategy: event.strategyName,
    exchange: event.exchangeName,
  });

  // Auto-generate report on completion
  Live.dump(event.strategyName);
});

// Wait for specific backtest to complete
listenDoneBacktestOnce(
  (event) => event.symbol === "BTCUSDT",
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

// Register walker for strategy comparison
addWalker(walkerSchema: IWalkerSchema): void

// Register position sizing configuration
addSizing(sizingSchema: ISizingSchema): void

// Register risk management profile
addRisk(riskSchema: IRiskSchema): void
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
import { Backtest, BacktestStatistics } from "backtest-kit";

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

// Get raw statistical data (Controller)
Backtest.getData(strategyName: string): Promise<BacktestStatistics>

// Generate markdown report (View)
Backtest.getReport(strategyName: string): Promise<string>

// Save report to disk
Backtest.dump(strategyName: string, path?: string): Promise<void>
```

#### Live Trading API

```typescript
import { Live, LiveStatistics } from "backtest-kit";

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

// Get raw statistical data (Controller)
Live.getData(strategyName: string): Promise<LiveStatistics>

// Generate markdown report (View)
Live.getReport(strategyName: string): Promise<string>

// Save report to disk
Live.dump(strategyName: string, path?: string): Promise<void>
```

#### Walker API

```typescript
import { Walker, WalkerResults } from "backtest-kit";

// Stream walker progress (yields after each strategy)
Walker.run(
  symbol: string,
  context: {
    walkerName: string;
  }
): AsyncIterableIterator<WalkerContract>

// Run in background without yielding results
Walker.background(
  symbol: string,
  context: { walkerName }
): () => void // Returns cancellation function

// Get raw comparison data (Controller)
Walker.getData(symbol: string, walkerName: string): Promise<IWalkerResults>

// Generate markdown report (View)
Walker.getReport(symbol: string, walkerName: string): Promise<string>

// Save report to disk (default: ./logs/walker)
Walker.dump(symbol: string, walkerName: string, path?: string): Promise<void>
```

#### Heat API

```typescript
import { Heat, IHeatmapStatistics } from "backtest-kit";

// Get raw heatmap statistics (Controller)
Heat.getData(strategyName: string): Promise<IHeatmapStatistics>

// Generate markdown report (View)
Heat.getReport(strategyName: string): Promise<string>

// Save heatmap report to disk (default: ./logs/heatmap)
Heat.dump(strategyName: string, path?: string): Promise<void>

// Clear accumulated heatmap data
Heat.clear(strategyName?: string): void
```

#### Position Sizing API

```typescript
import { PositionSize } from "backtest-kit";

// Calculate position size using fixed percentage risk
PositionSize.fixedPercentage(
  symbol: string,
  accountBalance: number,
  priceOpen: number,
  priceStopLoss: number,
  context: { sizingName: string }
): Promise<number>

// Calculate position size using Kelly Criterion
PositionSize.kellyCriterion(
  symbol: string,
  accountBalance: number,
  priceOpen: number,
  winRate: number,
  winLossRatio: number,
  context: { sizingName: string }
): Promise<number>

// Calculate position size using ATR-based method
PositionSize.atrBased(
  symbol: string,
  accountBalance: number,
  priceOpen: number,
  atr: number,
  context: { sizingName: string }
): Promise<number>
```

#### Performance Profiling API

```typescript
import { Performance, PerformanceStatistics, listenPerformance } from "backtest-kit";

// Get raw performance statistics (Controller)
Performance.getData(strategyName: string): Promise<PerformanceStatistics>

// Generate markdown report with bottleneck analysis (View)
Performance.getReport(strategyName: string): Promise<string>

// Save performance report to disk (default: ./logs/performance)
Performance.dump(strategyName: string, path?: string): Promise<void>

// Clear accumulated performance data
Performance.clear(strategyName?: string): Promise<void>

// Listen to real-time performance events
listenPerformance((event) => {
  console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
  console.log(`Strategy: ${event.strategyName} @ ${event.exchangeName}`);
  console.log(`Symbol: ${event.symbol}, Backtest: ${event.backtest}`);
});
```

## Type Definitions

### Statistics Types

```typescript
// Backtest statistics (exported from "backtest-kit")
interface BacktestStatistics {
  signalList: IStrategyTickResultClosed[];  // All closed signals
  totalSignals: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;               // Win percentage (higher is better)
  avgPnl: number | null;                // Average PNL % (higher is better)
  totalPnl: number | null;              // Total PNL % (higher is better)
  stdDev: number | null;                // Standard deviation (lower is better)
  sharpeRatio: number | null;           // Risk-adjusted return (higher is better)
  annualizedSharpeRatio: number | null; // Sharpe × √365 (higher is better)
  certaintyRatio: number | null;        // avgWin / |avgLoss| (higher is better)
  expectedYearlyReturns: number | null; // Estimated yearly trades (higher is better)
}

// Live statistics (exported from "backtest-kit")
interface LiveStatistics {
  eventList: TickEvent[];               // All events (idle, opened, active, closed)
  totalEvents: number;
  totalClosed: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;               // Win percentage (higher is better)
  avgPnl: number | null;                // Average PNL % (higher is better)
  totalPnl: number | null;              // Total PNL % (higher is better)
  stdDev: number | null;                // Standard deviation (lower is better)
  sharpeRatio: number | null;           // Risk-adjusted return (higher is better)
  annualizedSharpeRatio: number | null; // Sharpe × √365 (higher is better)
  certaintyRatio: number | null;        // avgWin / |avgLoss| (higher is better)
  expectedYearlyReturns: number | null; // Estimated yearly trades (higher is better)
}

// Performance statistics (exported from "backtest-kit")
interface PerformanceStatistics {
  strategyName: string;                 // Strategy name
  totalEvents: number;                  // Total number of performance events
  totalDuration: number;                // Total execution time (ms)
  metricStats: Record<string, {         // Statistics by metric type
    metricType: PerformanceMetricType;  // backtest_total | backtest_timeframe | backtest_signal | live_tick
    count: number;                      // Number of samples
    totalDuration: number;              // Total duration (ms)
    avgDuration: number;                // Average duration (ms)
    minDuration: number;                // Minimum duration (ms)
    maxDuration: number;                // Maximum duration (ms)
    stdDev: number;                     // Standard deviation (ms)
    median: number;                     // Median duration (ms)
    p95: number;                        // 95th percentile (ms)
    p99: number;                        // 99th percentile (ms)
  }>;
  events: PerformanceContract[];        // All raw performance events
}

// Performance event (exported from "backtest-kit")
interface PerformanceContract {
  timestamp: number;                    // When metric was recorded (epoch ms)
  metricType: PerformanceMetricType;    // Type of operation measured
  duration: number;                     // Operation duration (ms)
  strategyName: string;                 // Strategy name
  exchangeName: string;                 // Exchange name
  symbol: string;                       // Trading symbol
  backtest: boolean;                    // true = backtest, false = live
}

// Performance metric types (exported from "backtest-kit")
type PerformanceMetricType =
  | "backtest_total"      // Total backtest duration
  | "backtest_timeframe"  // Single timeframe processing
  | "backtest_signal"     // Signal processing (tick + getNextCandles + backtest)
  | "live_tick";          // Single live tick duration

// Walker results (exported from "backtest-kit")
interface IWalkerResults {
  bestStrategy: string;                     // Name of best performing strategy
  bestMetric: number;                       // Metric value of best strategy
  strategies: Array<{
    strategyName: string;                   // Strategy name
    stats: BacktestStatistics;              // Full backtest statistics
    metric: number;                         // Metric value used for comparison
  }>;
}

// Walker progress event (exported from "backtest-kit")
interface WalkerContract {
  strategiesTested: number;                 // Number of strategies tested so far
  totalStrategies: number;                  // Total number of strategies to test
  currentStrategy: string;                  // Currently testing strategy name
  bestStrategy: string | null;              // Current best strategy (null if first)
  bestMetric: number | null;                // Current best metric value
  stats: BacktestStatistics;                // Full statistics for current strategy
}

// Heatmap statistics (exported from "backtest-kit")
interface IHeatmapStatistics {
  symbols: IHeatmapRow[];                   // Array of per-symbol statistics
  totalSymbols: number;                     // Total number of symbols tracked
  portfolioTotalPnl: number | null;         // Portfolio-wide total PNL
  portfolioSharpeRatio: number | null;      // Portfolio-wide Sharpe Ratio
  portfolioTotalTrades: number;             // Portfolio-wide total trades
}

// Heatmap row (exported from "backtest-kit")
interface IHeatmapRow {
  symbol: string;                           // Trading pair symbol (e.g., "BTCUSDT")
  totalPnl: number | null;                  // Total profit/loss % across all trades
  sharpeRatio: number | null;               // Risk-adjusted return
  profitFactor: number | null;              // Sum of wins / sum of losses
  expectancy: number | null;                // Expected value per trade
  winRate: number | null;                   // Win percentage
  avgWin: number | null;                    // Average profit % on winning trades
  avgLoss: number | null;                   // Average loss % on losing trades
  maxDrawdown: number | null;               // Maximum drawdown %
  maxWinStreak: number;                     // Maximum consecutive winning trades
  maxLossStreak: number;                    // Maximum consecutive losing trades
  totalTrades: number;                      // Total number of closed trades
  winCount: number;                         // Number of winning trades
  lossCount: number;                        // Number of losing trades
  avgPnl: number | null;                    // Average PNL per trade
  stdDev: number | null;                    // Standard deviation of PNL
}
```

### Signal Data

```typescript
interface ISignalRow {
  id: string;                     // UUID v4 auto-generated
  position: "long" | "short";
  note?: string;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  exchangeName: string;
  strategyName: string;
  timestamp: number;              // Signal creation timestamp
  symbol: string;                 // Trading pair (e.g., "BTCUSDT")
}
```

### Tick Results (Discriminated Union)

```typescript
type IStrategyTickResult =
  | {
      action: "idle";
      signal: null;
      strategyName: string;
      exchangeName: string;
      currentPrice: number;
    }
  | {
      action: "opened";
      signal: ISignalRow;
      strategyName: string;
      exchangeName: string;
      currentPrice: number;
    }
  | {
      action: "active";
      signal: ISignalRow;
      currentPrice: number;
      strategyName: string;
      exchangeName: string;
    }
  | {
      action: "closed";
      signal: ISignalRow;
      currentPrice: number;
      closeReason: "take_profit" | "stop_loss" | "time_expired";
      closeTimestamp: number;
      pnl: {
        pnlPercentage: number;
        priceOpen: number;        // Entry price adjusted with slippage and fees
        priceClose: number;       // Exit price adjusted with slippage and fees
      };
      strategyName: string;
      exchangeName: string;
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

### Performance Profiling

```typescript
import { Performance, listenPerformance, Backtest } from "backtest-kit";

// Listen to real-time performance metrics
listenPerformance((event) => {
  console.log(`[${event.metricType}] ${event.duration.toFixed(2)}ms`);
  console.log(`  Strategy: ${event.strategyName}`);
  console.log(`  Symbol: ${event.symbol}, Backtest: ${event.backtest}`);
});

// Run backtest
await Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Get aggregated performance statistics
const perfStats = await Performance.getData("my-strategy");
console.log("Performance Statistics:");
console.log(`  Total events: ${perfStats.totalEvents}`);
console.log(`  Total duration: ${perfStats.totalDuration.toFixed(2)}ms`);
console.log(`  Metrics tracked: ${Object.keys(perfStats.metricStats).join(", ")}`);

// Analyze bottlenecks
for (const [type, stats] of Object.entries(perfStats.metricStats)) {
  console.log(`\n${type}:`);
  console.log(`  Count: ${stats.count}`);
  console.log(`  Average: ${stats.avgDuration.toFixed(2)}ms`);
  console.log(`  Min/Max: ${stats.minDuration.toFixed(2)}ms / ${stats.maxDuration.toFixed(2)}ms`);
  console.log(`  P95/P99: ${stats.p95.toFixed(2)}ms / ${stats.p99.toFixed(2)}ms`);
  console.log(`  Std Dev: ${stats.stdDev.toFixed(2)}ms`);
}

// Generate and save performance report
const markdown = await Performance.getReport("my-strategy");
await Performance.dump("my-strategy"); // Saves to ./logs/performance/my-strategy.md
```

**Performance Report Example:**
```markdown
# Performance Report: my-strategy

**Total events:** 1440
**Total execution time:** 12345.67ms
**Number of metric types:** 3

## Time Distribution

- **backtest_timeframe**: 65.4% (8074.32ms total)
- **backtest_signal**: 28.3% (3493.85ms total)
- **backtest_total**: 6.3% (777.50ms total)

## Detailed Metrics

| Metric Type | Count | Total (ms) | Avg (ms) | Min (ms) | Max (ms) | Std Dev (ms) | Median (ms) | P95 (ms) | P99 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| backtest_timeframe | 1440 | 8074.32 | 5.61 | 2.10 | 12.45 | 1.85 | 5.20 | 8.90 | 10.50 |
| backtest_signal | 45 | 3493.85 | 77.64 | 45.20 | 125.80 | 18.32 | 75.10 | 110.20 | 120.15 |
| backtest_total | 1 | 777.50 | 777.50 | 777.50 | 777.50 | 0.00 | 777.50 | 777.50 | 777.50 |

**Note:** All durations are in milliseconds. P95/P99 represent 95th and 99th percentile response times.
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
