---
title: demo/exchange/readme
group: demo/exchange
---

# Exchange Schema Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/ccxt)

Reference implementation of a full `addExchangeSchema` setup using CCXT and Binance spot, with integrated volatility forecasting, volume anomaly, pump detection

## Purpose

Demonstrates how to wire a real exchange into backtest-kit for:
- OHLCV candle fetching with proper timestamp handling
- Price and quantity formatting via market tick/step size
- Order book fetching (live only)
- Aggregated trade history fetching
- Multi-timeframe volatility forecasting via `garch`
- Trade flow anomaly detection via `volume-anomaly`
- Crypto pump-signal detection and exit planning via `pump-anomaly`

## Key Features

- **Candle Fetching**: `fetchOHLCV` mapped to backtest-kit candle format
- **Price Formatting**: Tick-size-aware rounding via `roundTicks`
- **Quantity Formatting**: Step-size-aware rounding via `roundTicks`
- **Order Book**: Live order book via `fetchOrderBook` (backtest mode throws)
- **Aggregated Trades**: Historical trade data via Binance `publicGetAggTrades`
- **Singleton Exchange**: One CCXT instance reused across all calls via `singleshot`
- **Volatility Forecast**: Multi-timeframe GARCH sigma across 8 intervals (1m → 8h)
- **Volume Anomaly**: Trade-flow skew detection with configurable confidence threshold
- **Pump Detection**: Train → live → backtest of Crypto pump signals reusing a single `getCandles` adapter over the same exchange schema

## Technology Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: backtest-kit 6.5.0
- **Utilities**: functools-kit 1.0.95
- **Data Source**: ccxt 4.5.24 (Binance spot)
- **Volatility**: garch (GARCH/EGARCH/GJR-GARCH/HAR-RV/NoVaS auto-selection)
- **Volume Anomaly**: volume-anomaly (Hawkes + CUSUM + BOCD ensemble)
- **Pump Detection**: pump-anomaly (author-cluster dedup + path-aware exit replay + cascade detection)

## Project Structure

```
demo/ccxt/
├── src/
│   └── index.mjs            # Exchange schema, volatility forecast, volume anomaly, pump detection, smoke tests
├── assets/
│   ├── parser-items.json    # Crypto channel signal history (ParserItem[]) — pump-anomaly input
│   └── model-weights.json   # Trained PumpMatrix weights (model.save() output, params v3)
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Installation and Setup

```bash
# Navigate to project directory
cd demo/ccxt

# Install dependencies
npm install

# Run the demo
npm start
```

## Usage Examples

### Basic Usage

Registers the exchange schema, then runs four smoke tests:

```bash
npm start
```

Output:
```javascript
// 1. Last 5 candles (1m) — BTCUSDT
[
  { timestamp: ..., open: ..., high: ..., low: ..., close: ..., volume: ... },
  ...
]

// 2. Volume anomaly skew from aggregated trades — BTCUSDT
{ anomaly: true, confidence: 0.83, direction: 'long', imbalance: 0.61 }

// 3. Multi-timeframe volatility forecast — BTCUSDT
{
  volatility_1m:  { sigma_1m:  0.0004, reliable_1m:  true },
  volatility_5m:  { sigma_5m:  0.0009, reliable_5m:  true },
  ...
  volatility_8h:  { sigma_8h:  0.031,  reliable_8h:  false }
}

// 4. Pump backtest over the parser-items history (BacktestSignal[])
[
  {
    symbol: 'SOLUSDT', direction: 'long', action: 'enter', ts: ...,
    exit: { trailingTake: 0.5, hardStop: 2, impactHorizonMinutes: 60, ... },
    origin: { detector: 'single', exitSource: 'cell', volRegime: 'calm', ... },
    result: { entered: true, pnl: 0.037, peak: 0.052, reason: 'trailing-take', heldMinutes: 42, ... }
  },
  ...
]
```

### Reusing the Schema in Your Project

Copy `addExchangeSchema` block from `src/index.mjs` into your own strategy file and reference it by name:

```javascript
import { Exchange } from "backtest-kit";

const candles = await Exchange.getCandles("ETHUSDT", "15m", 100, {
  exchangeName: "ccxt-exchange",
});
```

### Customizing the Exchange

Replace `ccxt.binance` with any other CCXT-supported exchange:

```javascript
const exchange = new ccxt.bybit({
  enableRateLimit: true,
});
```

## How It Works

### Exchange Initialization

A single Binance spot instance is created lazily via `singleshot` and reused across all calls:

```javascript
const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({ ... });
  await exchange.loadMarkets();
  return exchange;
});
```

### Price / Quantity Formatting

Uses market `limits` (tick size / step size) with `roundTicks` fallback to CCXT precision methods:

```javascript
const tickSize = market.limits?.price?.min || market.precision?.price;
return tickSize !== undefined
  ? roundTicks(price, tickSize)
  : exchange.priceToPrecision(symbol, price);
```

### Order Book

Returns normalized `{ asks, bids }` arrays with string price/quantity. Throws in backtest mode — implement your own snapshot replay if needed.

### Aggregated Trades

Uses Binance-specific `publicGetAggTrades` endpoint with `startTime`/`endTime` window.

### Volume Anomaly (`getExecutedTradesSkew`)

Fetches `N_TRAIN + N_DETECT` (1 400) aggregated trades and splits them into a calibration baseline and a detection window with no overlap:

```javascript
const all = await Exchange.getAggregatedTrades(symbol, { exchangeName: "ccxt-exchange" }, 1400);
return anomaly.predict(all.slice(0, 1200), all.slice(1200), 0.75);
```

Returns `{ anomaly, confidence, direction, imbalance }`.

### Volatility Forecast (`getVolatilityForecast`)

Fetches candles across 8 timeframes (1m, 5m, 15m, 30m, 1h, 4h, 6h, 8h) and runs `garch.predict()` on each. Returns per-timeframe `{ sigma, reliable }` pairs grouped by interval:

```javascript
const { sigma: sigma_1m, reliable: reliable_1m } = await volatility.predict(candles_1m, "1m");
// ...
return { volatility_1m, volatility_5m, ..., volatility_8h };
```

### Pump Detection (`getPumpWeights` / `getPumpLive` / `getPumpBacktest`)

All three phases share one `getCandles` adapter that forwards straight to `Exchange.getRawCandles` — the argument order (`symbol, interval, limit, sDate, eDate`) matches pump-anomaly's `GetCandles` contract one-to-one, so no reshaping is needed:

```javascript
const getCandles = (symbol, interval, limit, sDate, eDate) =>
  Exchange.getRawCandles(symbol, interval, { exchangeName: "ccxt-exchange" }, limit, sDate, eDate);
```

- **`getPumpWeights`** — `PumpMatrix.fit(signals, getCandles)` trains once on `parser-items.json` (labels replay 1m candles forward, so this is the slow phase) and returns `model.save()` — the JSON written to `assets/model-weights.json`.
- **`getPumpLive`** — `PumpMatrix.load(weights)` then `model.plan(signals, getCandles)`: look-ahead-free live decisions (cascade measured from candles *before* each signal). Returns ready-to-execute `TradeSignal[]`.
- **`getPumpBacktest`** — same loaded weights, `model.backtest(signals, getCandles)`: replays each exit plan forward over closed history. Returns `BacktestSignal[]`, each carrying a `result` with realized `pnl`/`reason`. This is the function wired into the fourth smoke test.

`signals` (the JSON) is the channel history; `weights` is a previously-trained model — `getPumpLive`/`getPumpBacktest` never retrain, they only load.

## Analysis Libraries

The aggregated trades and candles fetched via this exchange schema feed three independent libraries. `garch` and `volume-anomaly` are one-shot predictors over a candle/trade window; `pump-anomaly` is a trained model (train → save → load → plan/backtest) that answers *which post to trade and how to exit it*. All three plug into the same `Exchange` schema without touching each other.

### `garch` — Volatility Forecasting

Forecasts the expected price range for the next candle(s) using realized GARCH-family models. Auto-selects the best model (GARCH, EGARCH, GJR-GARCH, HAR-RV, NoVaS) by QLIKE error comparison.

```javascript
import { predict } from 'garch';

const candles = await Exchange.getCandles("BTCUSDT", "4h", 200, { exchangeName: "ccxt-exchange" });
const result = predict(candles, '4h');
// {
//   currentPrice: 97500,
//   sigma: 0.012,        // 1.2% per-period volatility
//   upperPrice: 98677,   // P·exp(+σ) — ceiling
//   lowerPrice: 96337,   // P·exp(-σ) — floor
//   modelType: 'egarch',
//   reliable: true
// }
```

Use `predictRange(candles, interval, steps)` for multi-candle swing trade corridors. Use `backtest(candles, interval)` for walk-forward validation of model accuracy.

**Confidence bands:**

| `confidence` | z | Typical use |
|---|---|---|
| `0.6827` (default) | 1.00 | Expected move, SL/TP targets |
| `0.95` | 1.96 | Risk management, position sizing |
| `0.99` | 2.58 | Stress testing, margin calculations |

See the [garch npm page](https://www.npmjs.com/package/garch) for the full API reference.

---

### `volume-anomaly` — Trade Flow Anomaly Detection

Detects abnormal surges in trade flow from a raw stream of aggregated trades. Three independent detectors run in parallel (Hawkes Process, CUSUM, Bayesian Online Changepoint Detection) and combine into a single `confidence` score.

```javascript
import { predict } from 'volume-anomaly';

// Fetch trades using getAggregatedTrades from the exchange schema
const all        = await Exchange.getAggregatedTrades("BTCUSDT", from, to, { exchangeName: "ccxt-exchange" });
const historical = all.slice(0, 1200);   // calibration baseline
const recent     = all.slice(1200);      // window to evaluate — no overlap

const result = predict(historical, recent, 0.75);
// {
//   anomaly:    true,
//   confidence: 0.83,
//   direction:  'long',   // 'long' | 'short' | 'neutral'
//   imbalance:  0.61,
// }
```

> Never overlap `historical` and `recent` — training absorbs any anomaly in the baseline and the detector learns to treat it as normal.

Use the stateful `VolumeAnomalyDetector` class for continuous monitoring (re-use fitted models across multiple `detect()` calls without re-training).

See the [volume-anomaly npm page](https://www.npmjs.com/package/volume-anomaly) for the full API reference.

---

### `pump-anomaly` — Pump Signal Detection & Exit Planning

Detects **synchronized pump signals** in a stream of Telegram channel recommendations (`ParserItem[]`) and turns each into a ready-to-execute trade plan. It solves three problems the other two libraries do not touch:

1. **Separates real capital inflow** — several independent authors hitting the same ticker in sync — from one actor spamming multiple anonymous channels (author-cluster deduplication via a Jaccard/lag-correlation authorship matrix).
2. **Separates a pump from a stop hunt** — the training label comes from an exact replay of your prod exit on **1m candles** (`replayExit`), so a wick into a liquidation-cascade trap is labeled negative even if close-to-close looks positive.
3. **Produces a ready-to-trade plan** — trained exit parameters (trailing take / hard stop / impact horizon) tuned **separately per `[mode][channel][symbol][direction][volRegime]` cell** of an exit tensor.

```javascript
import * as pump from "pump-anomaly";

// getCandles is the same Exchange.getRawCandles adapter used above.

// 1) TRAIN once → serialize weights (slow: labels replay 1m candles forward)
const model = await pump.PumpMatrix.fit(signals, getCandles);
const weights = model.save();                 // → assets/model-weights.json

// 2) LIVE — load weights, no retraining; cascade measured BEFORE the signal (no look-ahead)
const live = await pump.PumpMatrix.load(weights).plan(signals, getCandles);
// live: TradeSignal[] — direction already inverted if needed, entry zone + exit ready

// 3) BACKTEST — replay each exit plan forward, realized pnl in result
const bt = await pump.PumpMatrix.load(weights).backtest(signals, getCandles);
// bt: BacktestSignal[] — each carries result.pnl / result.reason
```

Three execution methods, distinguished by which candles they are allowed to see:

| method | candles | use |
|---|---|---|
| `signals(items, policy?)` | none | fast path; cascade not evaluated → every outcome is `enter` |
| `plan(items, source, policy?)` | **before** the signal | live decision, no look-ahead (`squeezePressureBefore`) |
| `backtest(items, source, policy?)` | **after** the signal | forward replay over closed history (realized pnl/cascade) |

`signals`/`plan` already pick the mode, compute `volRegime`, evaluate the cascade, filter veto, and apply inversion — execution just runs `s.direction` with `s.exit`, no `if (veto)` branching.

**Statistical gates (why a trained model may refuse to trade).** A grid search is `argmax` over thousands of CV scores, and the max of N noisy estimates is biased upward even when the true edge is zero. pump-anomaly defends against this in layers: the **one-standard-error rule** picks the most conservative config within 1 SE of the best (not the raw max); `model.reliable`/`model.confidence` report whether training had enough stable data; and `model.certification` is an independent five-barrier judge (Deflated Sharpe, PBO, SPA/Reality-Check, minTRL, nested OOS) — `certified: false` is the honest refusal that the surviving edge is a brute-force artifact.

```javascript
if (!model.certification.certified) {
  console.warn("do NOT trade this model:", model.certification.reasons);
}
```

**Per-asset training grids.** The default grid is deliberately small and asset-agnostic. The library ships tuned `TrainGrid`s per asset (fastest → slowest: Fartcoin, HYPE, SOL, TRX, TON, DOGE, BNB, ETH, XRP, LTC, ZEC, XLM, LINK, DOT, BTC), set from how each coin actually pumps — the unifying axis is **pump speed → everything else** (faster ⇒ shorter `staleMinutes`, tighter `hardStop`, shorter cascade window, looser matrix thresholds, more aggressive squeeze handling). A grid only steers *where* the search looks; the 1-SE rule and `certification` still decide what is tradeable.

See the [pump-anomaly npm page](https://www.npmjs.com/package/pump-anomaly) for the full API reference, the `TradeSignal`/`BacktestResult` contracts, the exit tensor, the liquidation-cascade detector, and the meta-overfitting ledger.

---

## Dependencies

- [backtest-kit](https://github.com/tripolskypetr/backtest-kit) - Trading framework
- [functools-kit](https://www.npmjs.com/package/functools-kit) - Utility functions
- [garch](https://github.com/tripolskypetr/garch) - Volatility forecasting models
- [volume-anomaly](https://github.com/tripolskypetr/volume-anomaly) - Trade flow anomaly detection
- [pump-anomaly](https://github.com/tripolskypetr/pump-anomaly) - Pump signal detection & exit planning

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
