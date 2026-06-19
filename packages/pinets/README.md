<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/heraldry.svg" height="45px" align="right">

# 📜 @backtest-kit/pinets

> Run TradingView Pine Script v5/v6 in a self-hosted Node.js environment for [backtest-kit](https://www.npmjs.com/package/backtest-kit). Execute your existing `.pine` indicators with 1:1 syntax compatibility and extract structured trading signals — no TradingView account, no rewrite.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/pinets.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/pinets)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

Powered by [PineTS](https://github.com/QuantForgeOrg/PineTS) — an open-source Pine Script transpiler & runtime.

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 📜 **[PineTS Docs](https://quantforgeorg.github.io/PineTS/)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @backtest-kit/pinets pinets backtest-kit
```

---

## Why

Your edge already exists as a TradingView Pine Script — rewriting it in JavaScript is error-prone busywork that drifts from the original. This package runs the `.pine` **as-is** inside backtest-kit's execution context: `getCandles` feeds it look-ahead-safe data, 60+ indicators are built in (no manual TA math), and the same script powers both backtest and live. You map its `plot()` outputs to a structured signal and you're done.

- 📜 **Pine Script v5/v6** — native TradingView syntax, 1:1 compatibility.
- 🎯 **60+ indicators** — SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, ADX, …
- 🔌 **Engine integration** — runs on backtest-kit's temporal context (no look-ahead).
- 📁 **File or inline** — load a `.pine` file or pass a code string.
- 🗺️ **Flexible extraction** — map any `plot()` to typed data, with lookback & transforms.
- ⚡ **Cached execution** — memoized file reads for repeated runs.
- 🛡️ **Type-safe** — full generics on extracted data.

---

## Quick start

A Pine Script just needs to expose a few named plots; `getSignal` maps them to an `ISignalDto`.

<details>
<summary>strategy.pine + getSignal</summary>

```pine
//@version=5
indicator("EMA cross — 1H, 100 candles")

rsi = ta.rsi(close, 10)
atr = ta.atr(10)
ema_fast = ta.ema(close, 7)
ema_slow = ta.ema(close, 16)

long_cond  = ta.crossover(ema_fast, ema_slow)  and rsi < 65
short_cond = ta.crossunder(ema_fast, ema_slow) and rsi > 35

plot(close, "Close")
plot(long_cond ? 1 : short_cond ? -1 : 0, "Signal")
plot(long_cond ? close - atr*1.5 : close + atr*1.5, "StopLoss")
plot(long_cond ? close + atr*3   : close - atr*3,   "TakeProfit")
plot(60, "EstimatedTime")  // minutes
```

```typescript
import { File, getSignal } from '@backtest-kit/pinets';
import { addStrategy } from 'backtest-kit';

addStrategy({
  strategyName: 'pine-ema-cross', interval: '5m', riskName: 'demo',
  getSignal: async (symbol) =>
    getSignal(File.fromPath('strategy.pine'), { symbol, timeframe: '1h', limit: 100 }),
});
```

Inline code needs no file:

```typescript
import { Code, getSignal } from '@backtest-kit/pinets';
const signal = await getSignal(
  Code.fromString(`//@version=5\nindicator("RSI")\nrsi=ta.rsi(close,14)\natr=ta.atr(14)\nplot(close,"Close")\nplot(rsi<30?1:rsi>70?-1:0,"Signal")\nplot(close-atr*2,"StopLoss")\nplot(close+atr*3,"TakeProfit")`),
  { symbol: 'BTCUSDT', timeframe: '15m', limit: 100 });
```

</details>

### Required plots for `getSignal()`

| Plot name | Value | Meaning |
|-----------|-------|---------|
| `"Signal"` | `1` / `-1` / `0` | Long / Short / no signal |
| `"Close"` | `close` | Entry price |
| `"StopLoss"` | price | Stop-loss level |
| `"TakeProfit"` | price | Take-profit level |
| `"EstimatedTime"` | minutes | Hold duration (optional, default 240) |

Custom plots are fine too — use `run` + `extract` to remap them (below).

---

## Custom extraction

`run()` returns raw plot data; `extract()` / `extractRows()` pull it into typed shapes with optional lookback and transforms.

<details>
<summary>extract() — latest bar values</summary>

```typescript
import { File, run, extract } from '@backtest-kit/pinets';

const plots = await run(File.fromPath('indicators.pine'), { symbol: 'ETHUSDT', timeframe: '1h', limit: 200 });
const data = await extract(plots, {
  rsi: 'RSI', macd: 'MACD',                                  // plot name → number
  prevRsi: { plot: 'RSI', barsBack: 1 },                     // previous bar
  trendStrength: { plot: 'ADX', transform: (v) => v > 25 ? 'strong' : 'weak' },
});
// { rsi: 55.2, macd: 12.5, prevRsi: 52.1, trendStrength: 'strong' }
```

</details>

<details>
<summary>extractRows() — every bar, timestamped</summary>

```typescript
import { File, run, extractRows } from '@backtest-kit/pinets';

const plots = await run(File.fromPath('indicators.pine'), { symbol: 'ETHUSDT', timeframe: '1h', limit: 200 });
const rows = await extractRows(plots, {
  rsi: 'RSI', macd: 'MACD',
  prevRsi: { plot: 'RSI', barsBack: 1 },
  trend: { plot: 'ADX', transform: (v) => v > 25 ? 'strong' : 'weak' },
});
// rows[1] = { timestamp: '2024-01-01T01:00:00.000Z', rsi: 52.1, macd: -1.5, prevRsi: 48.3, trend: 'weak' }
```

`extract()` vs `extractRows()`: single latest object vs array of all bars; missing value `0` vs `null`; no timestamp vs ISO `timestamp`; `barsBack` from the last bar vs from each bar's own index. Use `extract` for signal generation at the current bar, `extractRows` for dataset export / historical analysis.

</details>

<details>
<summary>toSignalDto() — turn extracted values into a signal</summary>

The helper `getSignal` uses internally, exposed for custom graphs (e.g. multi-timeframe via `@backtest-kit/graph`). Maps `position` `1`/`-1`/`0` → `long`/`short`/`null`, carrying TP/SL/estimated-time, with an optional explicit `priceOpen`:

```typescript
import { run, extract, toSignalDto } from '@backtest-kit/pinets';
import { randomString } from 'functools-kit';

const plots = await run(File.fromPath('strategy.pine'), { symbol, timeframe: '15m', limit: 100 });
const data  = await extract(plots, { position: 'Signal', priceTakeProfit: 'TakeProfit', priceStopLoss: 'StopLoss', minuteEstimatedTime: 'EstimatedTime' });
const signal = toSignalDto(randomString(), data, null); // ISignalDto | null
```

</details>

---

## Debugging & customization

<details>
<summary>dumpPlotData / markdown — inspect plot output</summary>

```typescript
import { File, run, dumpPlotData, toMarkdown } from '@backtest-kit/pinets';
const plots = await run(File.fromPath('strategy.pine'), { symbol: 'BTCUSDT', timeframe: '1h', limit: 100 });
await dumpPlotData('signal-001', plots, 'ema-cross', './dump/ta');  // → markdown files
const md = await toMarkdown(plots);                                 // markdown table as a string
```

</details>

<details>
<summary>usePine / useIndicator / setLogger — swap internals</summary>

```typescript
import { usePine, useIndicator, setLogger } from '@backtest-kit/pinets';
import { Pine } from 'pinets';

usePine(Pine);                       // register a custom Pine constructor
useIndicator(MyIndicatorCtor);       // register a custom indicator constructor
setLogger({ log: (m, d) => console.log(`[${m}]`, d), info: () => {}, error: console.error });
```

</details>

---

## Why not just rewrite it in JS?

<details>
<summary>The difference</summary>

```typescript
// ❌ Manual rewrite — re-derive every indicator, drift from the original
const candles = await getCandles('BTCUSDT', '5m', 100);
const closes = candles.map(c => c.close);
const rsi = RSI.calculate({ values: closes, period: 14 });
const emaFast = EMA.calculate({ values: closes, period: 9 });
// …port all the Pine logic by hand

// ✅ With pinets — copy the .pine straight from TradingView
const signal = await getSignal(File.fromPath('strategy.pine'), { symbol: 'BTCUSDT', timeframe: '5m', limit: 100 });
```

Use existing scripts as-is · 60+ indicators with no manual math · same code backtest & live · full time-series lookback semantics · type-safe extraction.

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `getSignal(source, opts)` | Run Pine Script → structured `ISignalDto` (position, TP/SL, estimated time) |
| `run(source, opts)` | Run Pine Script → raw plot data |
| `extract(plots, mapping)` | Latest-bar values with custom mapping (missing → `0`) |
| `extractRows(plots, mapping)` | All bars as timestamped rows (missing → `null`) |
| `toSignalDto(id, data, priceOpen?)` | Map extracted `{ position, … }` → `ISignalDto \| null` |
| `dumpPlotData(id, plots, name, dir)` | Dump plot data to markdown files |
| `toMarkdown(plots)` · `markdown(...)` | Render plots as a markdown table |
| `File.fromPath(path)` | Load Pine Script from a `.pine` file (memoized) |
| `Code.fromString(code)` | Use inline Pine Script |
| `usePine(ctor)` · `useIndicator(ctor)` | Register a custom Pine / indicator constructor |
| `setLogger(logger)` | Custom logger |
| `lib` | The internal IoC container for advanced use |
| `AXIS_SYMBOL` | Axis provider symbol token |

**Options** (`run`/`getSignal`): `symbol`, `timeframe` (Pine candle interval), `limit` (candles to fetch — must cover indicator warmup; pre-warmup bars are `N/A`).

**Types:** `PlotExtractConfig`, `PlotMapping`, `ExtractedData`, `ExtractedDataRow`, `CandleModel`, `PlotModel`, `PlotRecord`, `SymbolInfoModel`, `ILogger`, `IPine`/`TPineCtor`, `IIndicator`/`TIndicatorCtor`, `IProvider`.

<details>
<summary>Complete source map</summary>

`classes/{Code,File}.ts` · `function/{pine,indicator,run,extract,setup,strategy,dump,markdown}.function.ts` · `helpers/toSignalDto.ts` · `model/{Candle,Plot,SymbolInfo}.model.ts` · `interface/{Logger,Pine,Indicator,Provider}.interface.ts` · `lib/` IoC (`core/{di,provide,types}`, `services/{base/LoggerService, cache/PineCacheService, connection/{Pine,Indicator}ConnectionService, context/ExchangeContextService, data/PineDataService, job/PineJobService, markdown/PineMarkdownService, provider/{Axis,Candle}ProviderService}`). Every export above maps to one of these — nothing in `src/` is undocumented.

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
