# 📊 @backtest-kit/signals

> Technical analysis and trading signal generation library for AI-powered trading systems. Computes 50+ indicators across 4 timeframes and generates markdown reports for LLM consumption.

![bots](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/bots.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/signals.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/signals)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Transform raw market data into actionable trading insights with multi-timeframe technical analysis, order book depth, and AI-ready markdown reports.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

## ✨ Features

- 📈 **Multi-Timeframe Analysis**: 1m, 15m, 30m, 1h with synchronized indicator computation
- 🎯 **50+ Technical Indicators**: RSI, MACD, Bollinger Bands, Stochastic, ADX, ATR, CCI, Fibonacci, Support/Resistance
- 📊 **Order Book Analysis**: Bid/ask depth, spread, liquidity imbalance, top 20 levels
- 🤖 **AI-Ready Output**: Markdown reports formatted for LLM context injection
- ⚡ **Performance Optimized**: Intelligent caching with configurable TTL per timeframe
- 🧮 **Custom Algorithms**: Fibonacci retracements, support/resistance detection, volume analysis
- 📦 **Zero Config**: Works out-of-the-box with backtest-kit

## 📋 What It Does

`@backtest-kit/signals` analyzes market data and generates comprehensive technical reports across multiple timeframes:

| Timeframe | Candles | Indicators | Use Case |
|-----------|---------|------------|----------|
| **MicroTerm** (1m) | 60 | RSI(9,14), MACD(8,21,5), Stochastic, ADX(9), Bollinger(8,2), ATR, CCI, Volume, Squeeze | Scalping, ultra-short entries |
| **ShortTerm** (15m) | 144 | RSI(9), MACD(8,21,5), Stochastic(5,3,3), ADX(14), Bollinger(10,2), Fibonacci | Day trading |
| **SwingTerm** (30m) | 96 | RSI(14), MACD(12,26,9), Stochastic(14,3,3), Bollinger(20,2), Support/Resistance | Swing trading |
| **LongTerm** (1h) | 100 | RSI(14), MACD(12,26,9), ADX(14), Bollinger(20,2), SMA(50), DEMA, WMA, Volume Trend | Trend analysis |

**Plus:** Real-time order book analysis with bid/ask depth and imbalance metrics.

## 🚀 Installation

```bash
npm install @backtest-kit/signals backtest-kit
```

## 📖 Usage

### Quick Start - All-in-One Report

The easiest way to inject technical analysis into your LLM strategy:

```typescript
import { commitHistorySetup } from '@backtest-kit/signals';
import { getCandles } from 'backtest-kit';

// In your strategy's getSignal function:
const messages = [];

// Add all technical analysis + order book + candle history
await commitHistorySetup('BTCUSDT', messages);

// Now messages contains:
// - Order book analysis (bids/asks, spread, imbalance)
// - Candle history (1m, 15m, 30m, 1h)
// - Technical indicators for all 4 timeframes
// - System info (symbol, price, timestamp)

// Send to LLM
const signal = await llm(messages);
```

### Granular Control - Individual Reports

For fine-grained control over what data to include:

```typescript
import {
  commitBookDataReport,
  commitOneMinuteHistory,
  commitFifteenMinuteHistory,
  commitThirtyMinuteHistory,
  commitHourHistory,
  commitMicroTermMath,
  commitShortTermMath,
  commitSwingTermMath,
  commitLongTermMath,
} from '@backtest-kit/signals';

const messages = [];

// Order book analysis
await commitBookDataReport('BTCUSDT', messages);

// Candle histories
await commitOneMinuteHistory('BTCUSDT', messages);      // Last 15 candles
await commitFifteenMinuteHistory('BTCUSDT', messages);  // Last 8 candles
await commitThirtyMinuteHistory('BTCUSDT', messages);   // Last 6 candles
await commitHourHistory('BTCUSDT', messages);           // Last 6 candles

// Technical indicators
await commitMicroTermMath('BTCUSDT', messages);   // 1m indicators
await commitShortTermMath('BTCUSDT', messages);   // 15m indicators
await commitSwingTermMath('BTCUSDT', messages);   // 30m indicators
await commitLongTermMath('BTCUSDT', messages);    // 1h indicators

// Send to LLM
const signal = await llm(messages);
```

### Complete LLM Strategy Example

```typescript
import { v4 as uuid } from 'uuid';
import { addStrategy, dumpSignal } from 'backtest-kit';
import { commitHistorySetup } from '@backtest-kit/signals';
import { json } from './utils/json.mjs';  // Your LLM wrapper

addStrategy({
  strategyName: 'llm-strategy',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol) => {
    const messages = [
      {
        role: 'system',
        content: 'You are a trading bot. Analyze technical indicators and generate signals.'
      }
    ];

    // Inject all technical analysis
    await commitHistorySetup(symbol, messages);

    // Add trading instructions
    messages.push({
      role: 'user',
      content: [
        'Based on the technical analysis above, generate a trading signal.',
        'Use position: "wait" if signals are unclear or contradictory.',
        'Return JSON: { position: "long"|"short"|"wait", priceTakeProfit: number, priceStopLoss: number }'
      ].join('\n')
    });

    // Generate signal via LLM
    const resultId = uuid();
    const signal = await json(messages);

    // Save conversation for debugging
    await dumpSignal(resultId, messages, signal);

    return { ...signal, id: resultId };
  }
});
```

### Custom Logger

By default, signals uses a no-op logger. To enable logging:

```typescript
import { setLogger } from '@backtest-kit/signals';

setLogger({
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
});
```

## 📊 Generated Report Structure

### Order Book Report

```markdown
## Order Book Analysis

**Symbol:** BTCUSDT
**Best Bid:** 50000.00 | **Best Ask:** 50001.00
**Mid Price:** 50000.50 | **Spread:** 1.00
**Depth Imbalance:** +5.2% (buy pressure)

### Top 20 Levels (Bids)
| Price | Volume | % Total |
|-------|--------|---------|
| 50000.00 | 1.234 | 15.5% |
...

### Top 20 Levels (Asks)
| Price | Volume | % Total |
|-------|--------|---------|
| 50001.00 | 0.987 | 12.3% |
...
```

### Candle History Report

```markdown
## 1-Minute Candle History (Last 15)

| Timestamp | Open | High | Low | Close | Volume | Volatility | Body Size |
|-----------|------|------|-----|-------|--------|------------|-----------|
| 2025-01-13 10:00 | 50000 | 50050 | 49990 | 50020 | 123.45 | 0.12% | 0.04% |
...
```

### Technical Indicators Report

```markdown
## MicroTerm Analysis (1-Minute Timeframe)

| Time | Price | RSI(9) | RSI(14) | MACD | Signal | Histogram | Stoch %K | Stoch %D | ADX | +DI | -DI | BB Upper | BB Middle | BB Lower | ATR(5) | ATR(9) | CCI(9) | Volume | Vol Trend | Momentum | ROC | Support | Resistance | Squeeze | Pressure |
|------|-------|--------|---------|------|--------|-----------|----------|----------|-----|-----|-----|----------|-----------|----------|--------|--------|--------|--------|-----------|----------|-----|---------|------------|---------|----------|
| 10:00 | 50020 | 55.2 | 52.8 | 12.5 | 8.3 | 4.2 | 45.6 | 42.1 | 28.5 | 22.3 | 18.7 | 50100 | 50000 | 49900 | 15.2 | 18.9 | 45.7 | 123.45 | increasing | 0.8% | 1.2% | 49950 | 50100 | 0.85 | 15.2 |
...

**Data Sources:**
- RSI periods: 9, 14
- MACD: Fast=8, Slow=21, Signal=5
- Stochastic: K=3, D=3, Smooth=3 (primary), K=5, D=3, Smooth=3 (secondary)
...
```

## 🔄 Caching Strategy

Reports are cached to avoid redundant calculations:

| Timeframe | Cache Duration |
|-----------|----------------|
| 1-minute data | 1 minute |
| 15-minute data | 5 minutes |
| 30-minute data | 15 minutes |
| 1-hour data | 30 minutes |
| Order book | 5 minutes |

Cache is automatically cleared on errors.

## 🧮 Key Algorithms

### Support/Resistance Detection
- **MicroTerm/SwingTerm**: Looks back N candles for significant highs/lows (±0.3% threshold)
- **LongTerm**: 4-candle pivot point method

### Fibonacci Retracement
- Calculates levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
- Extensions: 127.2%, 161.8%, 261.8%
- Finds nearest level to current price (1.5% tolerance)

### Volume Analysis
- **MicroTerm**: SMA(5) volume with increasing/decreasing/stable trend (±20% threshold)
- **LongTerm**: 6-candle average comparison (±10% threshold)

### Order Book Imbalance

Imbalance = (bid_volume - ask_volume) / (bid_volume + ask_volume)

Positive = buy pressure, Negative = sell pressure

## 🎯 Use Cases

### 1. LLM-Powered Trading Strategies
Inject technical analysis into your LLM's context for intelligent signal generation.

### 2. Multi-Timeframe Confirmation
Combine indicators from different timeframes to filter false signals.

### 3. Market Context for AI Agents
Provide comprehensive market state to AI agents making trading decisions.

### 4. Debugging & Analysis
Save generated reports for post-analysis and strategy improvement.

## 💡 Why Use @backtest-kit/signals?

Instead of manually calculating indicators and formatting data for your LLM:

```typescript
// ❌ Without signals (manual work)
const candles = await getCandles('BTCUSDT', '1m', 60);
const rsi = calculateRSI(candles, 14);
const macd = calculateMACD(candles, 12, 26, 9);
const bb = calculateBollingerBands(candles, 20, 2);
// ... 40+ more indicators
const report = formatToMarkdown(rsi, macd, bb, ...);
messages.push({ role: 'user', content: report });
```

```typescript
// ✅ With signals (one line)
await commitHistorySetup('BTCUSDT', messages);
```

**Benefits:**
- ⚡ Pre-computed, cached, optimized
- 📊 50+ indicators across 4 timeframes
- 🎨 Formatted markdown tables ready for LLM
- 🔄 Synchronized with backtest timeline
- 🛡️ Error handling and validation built-in

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
