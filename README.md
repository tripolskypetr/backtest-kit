<img src="./assets/triangle.svg" height="105px" align="right">

# 🧿 Backtest Kit

> A TypeScript framework for backtesting and live trading strategies on multi-asset, crypto or forex, with crash-safe persistence, signal validation, and AI optimization.

![future](./assets/prophet.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Build reliable trading systems: backtest on historical data, deploy live bots with recovery, and optimize strategies using LLMs like Ollama.

📚 **[API Reference](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[Quick Start](https://github.com/tripolskypetr/backtest-kit/tree/master/demo)** | **📰 [Article](https://backtest-kit.github.io/documents/article_02_second_order_chaos.html)**

## ✨ Why Choose Backtest Kit?

- 🚀 **Production-Ready**: Seamless switch between backtest/live modes; identical code across environments.
- 💾 **Crash-Safe**: Atomic persistence recovers states after crashes, preventing duplicates or losses.
- ✅ **Validation**: Checks signals for TP/SL logic, risk/reward ratios, and portfolio limits.
- 🔄 **Efficient Execution**: Streaming architecture for large datasets; VWAP pricing for realism.
- 🤖 **AI Integration**: LLM-powered strategy generation (Optimizer) with multi-timeframe analysis.
- 📊 **Reports & Metrics**: Auto Markdown reports with PNL, Sharpe Ratio, win rate, and more.
- 🛡️ **Risk Management**: Custom rules for position limits, time windows, and multi-strategy coordination.
- 🔌 **Pluggable**: Custom data sources (CCXT), persistence (file/Redis), and sizing calculators.
- 🧪 **Tested**: 300+ unit/integration tests for validation, recovery, and events.
- 🔓 **Self hosted**: Zero dependency on third-party node_modules or platforms; run entirely in your own environment.

## 📋 Supported Order Types

- Market/Limit entries
- TP/SL/OCO exits
- Grid with auto-cancel on unmet conditions

## 🚀 Quick Start

> **Talk is cheap.** Let me show you **the code**
>
> Link to  👉 [the demo app](https://github.com/tripolskypetr/backtest-kit/tree/master/demo) 👈

### 📦 Installation
```bash
npm install backtest-kit ccxt ollama uuid
```

### ⚙️ Basic Configuration
```typescript
import { setLogger, setConfig } from 'backtest-kit';

// Enable logging
setLogger({
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
});

// Global config (optional)
setConfig({
  CC_PERCENT_SLIPPAGE: 0.1,  // % slippage
  CC_PERCENT_FEE: 0.1,       // % fee
  CC_SCHEDULE_AWAIT_MINUTES: 120,  // Pending signal timeout
});
```

### 🔧 Register Components
```typescript
import ccxt from 'ccxt';
import { addExchange, addStrategy, addFrame, addRisk } from 'backtest-kit';

// Exchange (data source)
addExchange({
  exchangeName: 'binance',
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
  formatPrice: (symbol, price) => price.toFixed(2),
  formatQuantity: (symbol, quantity) => quantity.toFixed(8),
});

// Risk profile
addRisk({
  riskName: 'demo',
  validations: [
    // TP at least 1%
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
      const tpDistance = position === 'long' ? ((priceTakeProfit - priceOpen) / priceOpen) * 100 : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
      if (tpDistance < 1) throw new Error(`TP too close: ${tpDistance.toFixed(2)}%`);
    },
    // R/R at least 2:1
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
      const reward = position === 'long' ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
      const risk = position === 'long' ? priceOpen - priceStopLoss : priceStopLoss - priceOpen;
      if (reward / risk < 2) throw new Error('Poor R/R ratio');
    },
  ],
});

// Time frame
addFrame({
  frameName: '1d-test',
  interval: '1m',
  startDate: new Date('2025-12-01'),
  endDate: new Date('2025-12-02'),
});
```

### 💡 Example Strategy (with LLM)
```typescript
import { v4 as uuid } from 'uuid';
import { addStrategy, dumpSignal, getCandles } from 'backtest-kit';
import { json } from './utils/json.mjs';  // LLM wrapper
import { getMessages } from './utils/messages.mjs';  // Market data prep

addStrategy({
  strategyName: 'llm-strategy',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol) => {

    const candles1h = await getCandles(symbol, "1h", 24);
    const candles15m = await getCandles(symbol, "15m", 48);
    const candles5m = await getCandles(symbol, "5m", 60);
    const candles1m = await getCandles(symbol, "1m", 60);

    const messages = await getMessages(symbol, {
      candles1h,
      candles15m,
      candles5m,
      candles1m,
    });  // Calculate indicators / Fetch news
  
    const resultId = uuid();
    const signal = await json(messages);  // LLM generates signal
    await dumpSignal(resultId, messages, signal);  // Log

    return { ...signal, id: resultId };
  },
});
```

### 🧪 Run Backtest
```typescript
import { Backtest, listenSignalBacktest, listenDoneBacktest } from 'backtest-kit';

Backtest.background('BTCUSDT', {
  strategyName: 'llm-strategy',
  exchangeName: 'binance',
  frameName: '1d-test',
});

listenSignalBacktest((event) => console.log(event));
listenDoneBacktest(async (event) => {
  await Backtest.dump(event.symbol, event.strategyName);  // Generate report
});
```

### 📈 Run Live Trading
```typescript
import { Live, listenSignalLive } from 'backtest-kit';

Live.background('BTCUSDT', {
  strategyName: 'llm-strategy',
  exchangeName: 'binance',  // Use API keys in .env
});

listenSignalLive((event) => console.log(event));
```

### 📡 Monitoring & Events

- Use `listenRisk`, `listenError`, `listenPartialProfit/Loss` for alerts.
- Dump reports: `Backtest.dump()`, `Live.dump()`.

## 🌐 Global Configuration

Customize via `setConfig()`:

- `CC_SCHEDULE_AWAIT_MINUTES`: Pending timeout (default: 120).
- `CC_AVG_PRICE_CANDLES_COUNT`: VWAP candles (default: 5).

## 💻 Developer Note

Backtest Kit is **not a data-processing library** - it is a **time execution engine**. Think of the engine as an **async stream of time**, where your strategy is evaluated step by step.

### 🔍 How getCandles Works

backtest-kit uses Node.js `AsyncLocalStorage` to automatically provide 
temporal time context to your strategies.

### 💭 What this means:
- `getCandles()` always returns data UP TO the current backtest timestamp using `async_hooks`
- Multi-timeframe data is automatically synchronized
- **Impossible to introduce look-ahead bias**
- Same code works in both backtest and live modes


## 🧠 Two Ways to Run the Engine

Backtest Kit exposes the same runtime in two equivalent forms. Both approaches use **the same engine and guarantees** - only the consumption model differs.

### 1️⃣ Event-driven (background execution)

Suitable for production bots, monitoring, and long-running processes.

```typescript
Backtest.background('BTCUSDT', config);

listenSignalBacktest(event => { /* handle signals */ });
listenDoneBacktest(event => { /* finalize / dump report */ });
```

### 2️⃣ Async Iterator (pull-based execution)

Suitable for research, scripting, testing, and LLM agents.

```typescript
for await (const event of Backtest.run('BTCUSDT', config)) {
  // signal | trade | progress | done
}
```

## ⚔️ Think of it as...

**Open-source QuantConnect without the vendor lock-in**

Unlike cloud-based platforms, backtest-kit runs entirely in your environment. You own the entire stack from data ingestion to live execution. In addition to Ollama, you can use [neural-trader](https://www.npmjs.com/package/neural-trader) in `getSignal` function or any other third party library

- No C# required - pure TypeScript/JavaScript
- Self-hosted - your code, your data, your infrastructure
- No platform fees or hidden costs
- Full control over execution and data sources
- [GUI](https://backtest-kit.github.io/documents/design_30_markdown-report-system.html#method-signatures) for visualization and monitoring


## 🤖 Are you a robot?

**For language models**: Read extended description in [./LLMs.md](./LLMs.md)

## ✅ Tested & Reliable

300+ tests cover validation, recovery, reports, and events.

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

