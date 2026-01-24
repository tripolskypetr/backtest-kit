# 📜 @backtest-kit/pinets

> Run TradingView Pine Script strategies in Node.js self hosted enviroment. Execute your existing Pine Script indicators and generate trading signals - pure technical analysis with 1:1 syntax compatibility.

![bots](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/bots.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/pinets.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/pinets)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Port your TradingView strategies to backtest-kit with zero rewrite. Powered by [PineTS](https://github.com/QuantForgeOrg/PineTS) - an open-source Pine Script transpiler and runtime.

📚 **[Backtest Kit Docs](https://backtest-kit.github.io/documents/example_02_first_backtest.html)** | 🌟 **[GitHub](https://github.com/tripolskypetr/backtest-kit)** | 📜 **[PineTS Docs](https://quantforgeorg.github.io/PineTS/)**

## ✨ Features

- 📜 **Pine Script v5/v6**: Native TradingView syntax with 1:1 compatibility
- 🎯 **60+ Indicators**: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, and more
- 🔌 **Backtest Integration**: Seamless `getCandles` integration with temporal context
- 📁 **File or Code**: Load `.pine` files or pass code strings directly
- 🗺️ **Plot Extraction**: Flexible mapping from Pine `plot()` outputs to structured data
- ⚡ **Cached Execution**: Memoized file reads for repeated strategy runs
- 🛡️ **Type Safe**: Full TypeScript support with generics for extracted data

## 📋 What It Does

`@backtest-kit/pinets` executes TradingView Pine Script and extracts trading signals for backtest-kit:

| Function | Description |
|----------|-------------|
| **`getSignal()`** | Run Pine Script and get structured `ISignalDto` (position, TP/SL, estimated time) |
| **`run()`** | Run Pine Script with custom plot mapping for advanced extraction |
| **`File.fromPath()`** | Load Pine Script from `.pine` file |
| **`Code.fromString()`** | Use inline Pine Script code |

## 🚀 Installation

```bash
npm install @backtest-kit/pinets pinets backtest-kit
```

## 📖 Usage

### Quick Start - Pine Script Strategy

Create a Pine Script file (`strategy.pine`):

```pine
//@version=5
indicator("Signal Strategy 100 candles of 1H timeframe")

// Indicators - faster settings for 1H
rsi = ta.rsi(close, 10)
atr = ta.atr(10)
ema_fast = ta.ema(close, 7)
ema_slow = ta.ema(close, 16)

// Conditions
long_cond = ta.crossover(ema_fast, ema_slow) and rsi < 65
short_cond = ta.crossunder(ema_fast, ema_slow) and rsi > 35

// Levels - tighter SL, wider TP for better RR
sl_long = close - atr * 1.5
tp_long = close + atr * 3
sl_short = close + atr * 1.5
tp_short = close - atr * 3

// Plots for extraction
plot(close, "Close")
plot(long_cond ? 1 : short_cond ? -1 : 0, "Signal")
plot(long_cond ? sl_long : sl_short, "StopLoss")
plot(long_cond ? tp_long : tp_short, "TakeProfit")
plot(60, "EstimatedTime")  // 1 hour in minutes
```

Use it in your strategy:

```typescript
import { File, getSignal } from '@backtest-kit/pinets';
import { addStrategy } from 'backtest-kit';

addStrategy({
  strategyName: 'pine-ema-cross',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol) => {
    const source = File.fromPath('strategy.pine');

    return await getSignal(source, {
      symbol,
      timeframe: '1h',
      limit: 100,
    });
  }
});
```

### Inline Code Strategy

No file needed - pass Pine Script as a string:

```typescript
import { Code, getSignal } from '@backtest-kit/pinets';

const pineScript = `
//@version=5
indicator("RSI Strategy")

rsi = ta.rsi(close, 14)
atr = ta.atr(14)

long_cond = rsi < 30
short_cond = rsi > 70

plot(close, "Close")
plot(long_cond ? 1 : short_cond ? -1 : 0, "Signal")
plot(close - atr * 2, "StopLoss")
plot(close + atr * 3, "TakeProfit")
`;

const source = Code.fromString(pineScript);
const signal = await getSignal(source, {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  limit: 100,
});
```

### Custom Plot Extraction

For advanced use cases, extract any Pine `plot()` with custom mapping:

```typescript
import { File, run, extract } from '@backtest-kit/pinets';

const source = File.fromPath('indicators.pine');

const plots = await run(source, {
  symbol: 'ETHUSDT',
  timeframe: '1h',
  limit: 200,
});

const data = extract(plots, {
  // Simple: plot name -> number
  rsi: 'RSI',
  macd: 'MACD',

  // Advanced: with transform and lookback
  prevRsi: {
    plot: 'RSI',
    barsBack: 1,  // Previous bar value
  },
  trendStrength: {
    plot: 'ADX',
    transform: (v) => v > 25 ? 'strong' : 'weak',
  },
});

// data = { rsi: 55.2, macd: 12.5, prevRsi: 52.1, trendStrength: 'strong' }
```

## 📜 Pine Script Conventions

For `getSignal()` to work, your Pine Script must include these plots:

| Plot Name | Value | Description |
|-----------|-------|-------------|
| `"Signal"` | `1` / `-1` / `0` | Long / Short / No signal |
| `"Close"` | `close` | Entry price |
| `"StopLoss"` | price | Stop loss level |
| `"TakeProfit"` | price | Take profit level |
| `"EstimatedTime"` | minutes | Hold duration (optional, default: 240) |

Using custom plots is also possible with `run`, it allows to reconfigure the mapper

## 💡 Why Use @backtest-kit/pinets?

Instead of rewriting your TradingView strategies:

```typescript
// ❌ Without pinets (manual rewrite)
import { getCandles } from 'backtest-kit';
import { RSI, EMA, ATR } from 'technicalindicators';

const candles = await getCandles('BTCUSDT', '5m', 100);
const closes = candles.map(c => c.close);
const rsi = RSI.calculate({ values: closes, period: 14 });
const emaFast = EMA.calculate({ values: closes, period: 9 });
const emaSlow = EMA.calculate({ values: closes, period: 21 });
// ... rewrite all your Pine Script logic in JS
```

```typescript
// ✅ With pinets (copy-paste from TradingView)
import { File, getSignal } from '@backtest-kit/pinets';

const signal = await getSignal(File.fromPath('strategy.pine'), {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  limit: 100,
});
```

**Benefits:**

- 📜 Use existing TradingView Pine Script as-is
- 🎯 60+ built-in indicators (no manual calculation)
- ⚡ Same code for backtest and live trading
- 🔄 Full time-series semantics with lookback support
- 🛡️ Type-safe extraction with TypeScript generics

## 🤝 Contribute

Fork/PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
