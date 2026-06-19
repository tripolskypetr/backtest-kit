<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/chronos.svg" height="45px" align="right">

# 📊 @backtest-kit/signals

> Multi-timeframe technical analysis for AI trading on [backtest-kit](https://www.npmjs.com/package/backtest-kit). Computes 50+ indicators across four timeframes plus order-book depth, and emits LLM-ready markdown reports — drop the whole market context into an LLM prompt in one call.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/signals.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/signals)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/signals backtest-kit
```

---

## Why

An LLM trading strategy is only as good as the market context you hand it. Computing 50+ indicators across four timeframes, formatting order-book depth, and laying it all out as clean markdown — by hand, every tick — is the unglamorous 200 lines that decides signal quality. This package is that work, pre-computed, cached, and synchronized with backtest-kit's timeline: one `commitHistorySetup(symbol, messages)` appends order book + candle history + indicators for 1m/15m/30m/1h to your LLM message array.

- 📈 **Four synchronized timeframes** — MicroTerm 1m · ShortTerm 15m · SwingTerm 30m · LongTerm 1h.
- 🎯 **50+ indicators** — RSI, MACD, Bollinger, Stochastic, ADX, ATR, CCI, Fibonacci, support/resistance, squeeze, volume trend.
- 📊 **Order-book depth** — best bid/ask, spread, top-20 levels, liquidity imbalance.
- 🤖 **LLM-ready markdown** — formatted tables for context injection.
- ⚡ **Cached** — per-timeframe TTL; cache cleared on error.
- 📦 **Zero config** — works out of the box on the engine's temporal context.

---

## Quick start — one call

```typescript
import { commitHistorySetup } from '@backtest-kit/signals';

const messages = [];
await commitHistorySetup('BTCUSDT', messages);
// messages now hold: order book + 1m/15m/30m/1h candle history
// + indicators for all 4 timeframes + system context (symbol, price, timestamp)
const signal = await llm(messages);
```

<details>
<summary>Complete LLM strategy</summary>

```typescript
import { v4 as uuid } from 'uuid';
import { addStrategy, dumpSignal } from 'backtest-kit';
import { commitHistorySetup } from '@backtest-kit/signals';
import { json } from './utils/json.mjs';   // your LLM wrapper

addStrategy({
  strategyName: 'llm-strategy', interval: '5m', riskName: 'demo',
  getSignal: async (symbol) => {
    const messages = [{ role: 'system', content: 'You are a trading bot. Analyze the indicators and generate a signal.' }];
    await commitHistorySetup(symbol, messages);
    messages.push({ role: 'user', content: [
      'Based on the technical analysis above, generate a trading signal.',
      'Use position: "wait" if signals are unclear or contradictory.',
      'Return JSON: { position: "long"|"short"|"wait", priceTakeProfit: number, priceStopLoss: number }',
    ].join('\n') });

    const resultId = uuid();
    const signal = await json(messages);
    await dumpSignal(resultId, messages, signal);   // archive for debugging
    return { ...signal, id: resultId };
  },
});
```

</details>

---

## Granular control

Prefer to choose exactly what goes into the prompt? Call the individual report functions — each appends one markdown section to `messages`.

<details>
<summary>The 9 granular functions</summary>

```typescript
import {
  commitBookDataReport,                                 // order book: bids/asks, spread, imbalance
  commitOneMinuteHistory, commitFifteenMinuteHistory,   // candle histories (last 15 / 8 …)
  commitThirtyMinuteHistory, commitHourHistory,
  commitMicroTermMath, commitShortTermMath,             // indicator tables per timeframe
  commitSwingTermMath, commitLongTermMath,
} from '@backtest-kit/signals';

const messages = [];
await commitBookDataReport('BTCUSDT', messages);
await commitOneMinuteHistory('BTCUSDT', messages);
await commitMicroTermMath('BTCUSDT', messages);
// …add only the sections you want, then call your LLM
```

`commitHistorySetup` is simply the orchestrator that runs all of these in the right order.

</details>

---

## What each timeframe computes

| Timeframe | Candles | Indicators | Use case |
|-----------|---------|------------|----------|
| **MicroTerm** (1m) | 60 | RSI(9,14), MACD(8,21,5), Stochastic, ADX(9), Bollinger(8,2), ATR, CCI, Volume, Squeeze | Scalping, ultra-short entries |
| **ShortTerm** (15m) | 144 | RSI(9), MACD(8,21,5), Stochastic(5,3,3), ADX(14), Bollinger(10,2), Fibonacci | Day trading |
| **SwingTerm** (30m) | 96 | RSI(14), MACD(12,26,9), Stochastic(14,3,3), Bollinger(20,2), Support/Resistance | Swing trading |
| **LongTerm** (1h) | 100 | RSI(14), MACD(12,26,9), ADX(14), Bollinger(20,2), SMA(50), DEMA, WMA, Volume Trend | Trend analysis |

<details>
<summary>Report structure (order book · candles · indicators)</summary>

**Order book** — symbol, best bid/ask, mid price, spread, depth imbalance (`(bid_vol − ask_vol)/(bid_vol + ask_vol)`, + = buy pressure), and top-20 bid/ask levels with `% of total`.

**Candle history** — per-candle table: timestamp, OHLC, volume, volatility, body size.

**Indicators** — a wide per-bar table; e.g. MicroTerm columns: Price, RSI(9), RSI(14), MACD, Signal, Histogram, Stoch %K/%D, ADX, +DI, −DI, BB Upper/Middle/Lower, ATR(5/9), CCI(9), Volume, Vol Trend, Momentum, ROC, Support, Resistance, Squeeze, Pressure — followed by a **Data Sources** note listing every period used.

</details>

<details>
<summary>Caching & key algorithms</summary>

**Cache TTL** (cleared on error): 1m data → 1 min · 15m → 5 min · 30m → 15 min · 1h → 30 min · order book → 5 min.

- **Support/Resistance** — MicroTerm/SwingTerm look back N candles for significant highs/lows (±0.3% threshold); LongTerm uses a 4-candle pivot method.
- **Fibonacci** — levels 0 / 23.6 / 38.2 / 50 / 61.8 / 78.6 / 100 %, extensions 127.2 / 161.8 / 261.8 %; nearest level to price within 1.5% tolerance.
- **Volume** — MicroTerm: SMA(5) with increasing/decreasing/stable trend (±20%); LongTerm: 6-candle average (±10%).
- **Order-book imbalance** — `(bid − ask)/(bid + ask)`, positive = buy pressure.

</details>

<details>
<summary>Custom logger (default is no-op)</summary>

```typescript
import { setLogger } from '@backtest-kit/signals';
setLogger({ log: console.log, debug: console.debug, info: console.info, warn: console.warn });
```

</details>

---

## Why not compute indicators yourself?

<details>
<summary>The difference</summary>

```typescript
// ❌ Manual — 40+ indicators, formatting, caching, all by hand
const candles = await getCandles('BTCUSDT', '1m', 60);
const rsi  = calculateRSI(candles, 14);
const macd = calculateMACD(candles, 12, 26, 9);
const bb   = calculateBollingerBands(candles, 20, 2);
// …and the markdown formatting, and the cache
messages.push({ role: 'user', content: formatToMarkdown(rsi, macd, bb /* … */) });

// ✅ With signals
await commitHistorySetup('BTCUSDT', messages);
```

Pre-computed, cached, optimized · 50+ indicators × 4 timeframes · LLM-ready markdown · synchronized with the backtest timeline · validation & error handling built in.

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `commitHistorySetup(symbol, messages)` | Orchestrator — appends order book + all candle histories + all indicators + context |
| `commitBookDataReport(symbol, messages)` | Order-book depth & imbalance section |
| `commitOneMinuteHistory` / `commitFifteenMinuteHistory` / `commitThirtyMinuteHistory` / `commitHourHistory` | Candle-history sections per timeframe |
| `commitMicroTermMath` / `commitShortTermMath` / `commitSwingTermMath` / `commitLongTermMath` | Indicator-table sections (1m / 15m / 30m / 1h) |
| `setLogger(logger)` | Replace the default no-op logger |
| `lib` | Internal IoC service container (advanced use) |

<details>
<summary>Complete source map</summary>

- `function/history.function.ts` — the four `commit*History` functions. `function/math.function.ts` — the four `commit*Math` functions. `function/other.function.ts` — `commitBookDataReport` + `commitHistorySetup`.
- `tools/setup.tool.ts` — `setLogger`. `contract/{History,ReportFn}.contract.ts` — report-function contracts. `interfaces/Logger.interface.ts`.
- `lib/` IoC: `core/{di,provide,types}`, `services/common/LoggerService`, `services/history/{One,Fifteen,Thirty}MinuteCandleHistoryService` + `HourCandleHistoryService`, `services/math/{MicroTerm,ShortTerm,SwingTerm,LongTerm}MathService` + `BookDataMathService` (the math services are the package's bulk — 32–45 KB each). Every export maps to one of these; nothing in `src/` is undocumented.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
