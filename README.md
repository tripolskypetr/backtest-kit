<img src="./assets/triangle.svg" height="105px" align="right">

# 🧿 Backtest Kit

> A TypeScript framework for backtesting and live trading strategies on multi-asset, crypto, forex or [DEX (peer-to-peer marketplace)](https://en.wikipedia.org/wiki/Decentralized_finance#Decentralized_exchanges), spot, futures with crash-safe persistence, signal validation, and AI optimization.

![future](./assets/prophet.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/backtest-kit.svg?style=flat-square)](https://npmjs.org/package/backtest-kit)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Build reliable trading systems: backtest on historical data, deploy live bots with recovery, and optimize strategies using LLMs like Ollama.

📚 **[API Reference](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[Quick Start](https://github.com/tripolskypetr/backtest-kit/tree/master/demo)** | **📰 [Article](https://backtest-kit.github.io/documents/article_02_second_order_chaos.html)**

## 🚀 Quick Start

### 🎯 The Fastest Way: Sidekick CLI

> **Create a production-ready trading bot in seconds:**

```bash
# Create project with npx (recommended)
npx -y @backtest-kit/sidekick my-trading-bot
cd my-trading-bot
npm start
```

### 📦 Manual Installation

> **Want to see the code?** 👉 [Demo app](https://github.com/tripolskypetr/backtest-kit/tree/master/demo) 👈

```bash
npm install backtest-kit ccxt ollama uuid
```

## ✨ Why Choose Backtest Kit?

- 🚀 **Production-Ready**: Seamless switch between backtest/live modes; identical code across environments.
- 💾 **Crash-Safe**: Atomic persistence recovers states after crashes, preventing duplicates or losses.
- ✅ **Validation**: Checks signals for TP/SL logic, risk/reward ratios, and portfolio limits.
- 🔄 **Efficient Execution**: Streaming architecture for large datasets; VWAP pricing for realism.
- 🤖 **AI Integration**: LLM-powered strategy generation (Optimizer) with multi-timeframe analysis.
- 📊 **Reports & Metrics**: Auto Markdown reports with PNL, Sharpe Ratio, win rate, and more.
- 🛡️ **Risk Management**: Custom rules for position limits, time windows, and multi-strategy coordination.
- 🔌 **Pluggable**: Custom data sources (CCXT), persistence (file/Redis), and sizing calculators.
- 🧪 **Tested**: 350+ unit/integration tests for validation, recovery, and events.
- 🔓 **Self hosted**: Zero dependency on third-party node_modules or platforms; run entirely in your own environment.

## 📋 Supported Order Types

- Market/Limit entries
- TP/SL/OCO exits
- Grid with auto-cancel on unmet conditions
- Partial profit/loss levels
- Trailing stop-loss
- Breakeven protection

## 📚 Code Samples

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
import { addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema } from 'backtest-kit';

// Exchange (data source)
addExchangeSchema({
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
addRiskSchema({
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
addFrameSchema({
  frameName: '1d-test',
  interval: '1m',
  startDate: new Date('2025-12-01'),
  endDate: new Date('2025-12-02'),
});
```

### 💡 Example Strategy (with LLM)
```typescript
import { v4 as uuid } from 'uuid';
import { addStrategySchema, dumpSignalData, getCandles } from 'backtest-kit';
import { json } from './utils/json.mjs';  // LLM wrapper
import { getMessages } from './utils/messages.mjs';  // Market data prep

addStrategySchema({
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
    await dumpSignalData(resultId, messages, signal);  // Log

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

**Boundary Semantics:**

All methods use **strict exclusive boundaries** - candles at exact boundary times are excluded. This prevents accidental inclusion of boundary conditions in backtest logic and ensures consistent behavior across cache and runtime.

**Key principle:** A candle is included only if it **fully closed** before the upper boundary.

For a candle with:
- `timestamp` = candle open time
- `stepMs` = interval duration (e.g., 60000ms for "1m")
- Candle close time = `timestamp + stepMs`

The candle is included if: `timestamp + stepMs < upperBoundary`

---

- `getCandles(symbol, interval, limit)` - Returns data in range `(when - limit*interval, when)`
  - Fetches historical candles backwards from execution context time
  - Only fully closed candles are included (candle must close before `when`)
  - Lower bound: `candle.timestamp > sinceTimestamp` (exclusive)
  - Upper bound: `candle.timestamp + stepMs < when` (exclusive)
  - Example: `getCandles("BTCUSDT", "1m", 100)` returns 100 candles ending before current time

- `getNextCandles(symbol, interval, limit)` - Returns data in range `(when, when + limit*interval)`
  - Fetches future candles forwards from execution context time (backtest only)
  - Only fully closed candles are included
  - Lower bound: `candle.timestamp > when` (exclusive)
  - Upper bound: `candle.timestamp + stepMs < endTime` (exclusive)
  - Throws error in live mode to prevent look-ahead bias
  - Example: `getNextCandles("BTCUSDT", "1m", 10)` returns next 10 candles after current time

- `getRawCandles(symbol, interval, limit?, sDate?, eDate?)` - Flexible parameter combinations:
  - `(limit)` - Returns data in range `(now - limit*interval, now)`
  - `(limit, sDate)` - Returns data in range `(sDate, sDate + limit*interval)`
  - `(limit, undefined, eDate)` - Returns data in range `(eDate - limit*interval, eDate)`
  - `(undefined, sDate, eDate)` - Returns data in range `(sDate, eDate)`, limit calculated from range
  - `(limit, sDate, eDate)` - Returns data in range `(sDate, eDate)`, limit used only for fetch size
  - All combinations use: `candle.timestamp > sDate && candle.timestamp + stepMs < eDate`
  - All combinations respect exclusive boundaries and look-ahead bias protection

**Persistent Cache:**
- Candle cache uses identical boundary semantics: `timestamp > sinceTimestamp && timestamp < untilTimestamp`
- Cache and runtime filters are synchronized to prevent inconsistencies
- Cache returns only candles that match the requested time range exactly

### 💭 What this means:
- `getCandles()` always returns data UP TO the current backtest timestamp using `async_hooks`
- Multi-timeframe data is automatically synchronized
- **Impossible to introduce look-ahead bias** - all time boundaries are enforced
- Same code works in both backtest and live modes
- Boundary semantics prevent edge cases in signal generation


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

**Open-source QuantConnect/MetaTrader without the vendor lock-in**

Unlike cloud-based platforms, backtest-kit runs entirely in your environment. You own the entire stack from data ingestion to live execution. In addition to Ollama, you can use [neural-trader](https://www.npmjs.com/package/neural-trader) in `getSignal` function or any other third party library

- No C#/C++ required - pure TypeScript/JavaScript
- Self-hosted - your code, your data, your infrastructure
- No platform fees or hidden costs
- Full control over execution and data sources
- [GUI](https://backtest-kit.github.io/documents/design_30_markdown-report-system.html#method-signatures) for visualization and monitoring

## 🌍 Ecosystem

The `backtest-kit` ecosystem extends beyond the core library, offering complementary packages and tools to enhance your trading system development experience:

### @backtest-kit/pinets

> **[Explore on NPM](https://www.npmjs.com/package/@backtest-kit/pinets)** 📜

The **@backtest-kit/pinets** package lets you run TradingView Pine Script strategies directly in Node.js. Port your existing Pine Script indicators to backtest-kit with zero rewrite using the [PineTS](https://github.com/QuantForgeOrg/PineTS) runtime.

#### Key Features
- 📜 **Pine Script v5/v6**: Native TradingView syntax with 1:1 compatibility
- 🎯 **60+ Indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic built-in
- 📁 **File or Code**: Load `.pine` files or pass code strings directly
- 🗺️ **Plot Extraction**: Flexible mapping from Pine `plot()` outputs to structured signals
- ⚡ **Cached Execution**: Memoized file reads for repeated strategy runs

#### Use Case
Perfect for traders who already have working TradingView strategies. Instead of rewriting your Pine Script logic in JavaScript, simply copy your `.pine` file and use `getSignal()` to extract trading signals. Works seamlessly with backtest-kit's temporal context - no look-ahead bias possible.

#### Get Started
```bash
npm install @backtest-kit/pinets pinets backtest-kit
```

### @backtest-kit/ollama

> **[Explore on NPM](https://www.npmjs.com/package/@backtest-kit/ollama)** 🤖

The **@backtest-kit/ollama** package is a multi-provider LLM inference library that supports 10+ providers including OpenAI, Claude, DeepSeek, Grok, Mistral, Perplexity, Cohere, Alibaba, Hugging Face, and Ollama with unified API and automatic token rotation.

#### Key Features
- 🔌 **10+ LLM Providers**: OpenAI, Claude, DeepSeek, Grok, Mistral, Perplexity, Cohere, Alibaba, Hugging Face, Ollama
- 🔄 **Token Rotation**: Automatic API key rotation for Ollama (others throw clear errors)
- 🎯 **Structured Output**: Enforced JSON schema for trading signals (position, price levels, risk notes)
- 🔑 **Flexible Auth**: Context-based API keys or environment variables
- ⚡ **Unified API**: Single interface across all providers
- 📊 **Trading-First**: Built for backtest-kit with position sizing and risk management

#### Use Case
Ideal for building multi-provider LLM strategies with fallback chains and ensemble predictions. The package returns structured trading signals with validated TP/SL levels, making it perfect for use in `getSignal` functions. Supports both backtest and live trading modes.

#### Get Started
```bash
npm install @backtest-kit/ollama agent-swarm-kit backtest-kit
```


### @backtest-kit/signals

> **[Explore on NPM](https://www.npmjs.com/package/@backtest-kit/signals)** 📊

The **@backtest-kit/signals** package is a technical analysis and trading signal generation library designed for AI-powered trading systems. It computes 50+ indicators across 4 timeframes and generates markdown reports optimized for LLM consumption.

#### Key Features
- 📈 **Multi-Timeframe Analysis**: 1m, 15m, 30m, 1h with synchronized indicator computation
- 🎯 **50+ Technical Indicators**: RSI, MACD, Bollinger Bands, Stochastic, ADX, ATR, CCI, Fibonacci, Support/Resistance
- 📊 **Order Book Analysis**: Bid/ask depth, spread, liquidity imbalance, top 20 levels
- 🤖 **AI-Ready Output**: Markdown reports formatted for LLM context injection
- ⚡ **Performance Optimized**: Intelligent caching with configurable TTL per timeframe

#### Use Case
Perfect for injecting comprehensive market context into your LLM-powered strategies. Instead of manually calculating indicators, `@backtest-kit/signals` provides a single function call that adds all technical analysis to your message context. Works seamlessly with `getSignal` function in backtest-kit strategies.

#### Get Started
```bash
npm install @backtest-kit/signals backtest-kit
```

## 🤖 Are you a robot?

**For language models**: Read extended description in [./LLMs.md](./LLMs.md)

## ✅ Tested & Reliable

350+ tests cover validation, recovery, reports, and events.

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

