---
title: other/exchange/readme
group: other/exchange
---

# Exchange Schema Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/ccxt)

A full `addExchangeSchema` reference — CCXT Binance spot — and a showcase of what you can build *on top of* that one schema: multi-timeframe GARCH volatility forecasting, trade-flow anomaly detection, and trained crypto-pump signal/exit planning, all sharing the same candle/trade adapter.

## What it shows

- **A complete exchange schema** — candles, tick/step-aware price/quantity formatting, live order book, aggregated trades, one singleton CCXT instance.
- **`garch`** — multi-timeframe volatility forecast (σ + reliability) across 8 intervals (1m → 8h).
- **`volume-anomaly`** — trade-flow skew from a calibration/detection split of aggregated trades.
- **`pump-anomaly`** — train → live → backtest of coordinated pump signals, reusing one `getRawCandles` adapter.

## Run it

```bash
cd demo/ccxt
npm install
npm start
```

Registers the schema, then runs four smoke tests: last 5 candles, volume-anomaly skew, multi-timeframe volatility forecast, and a pump backtest over the bundled `parser-items.json`.

<details>
<summary>The exchange schema (src/index.mjs)</summary>

One lazily-created Binance spot instance (`singleshot`) serves every method. Price/quantity formatting uses market tick/step size with a `roundTicks` fallback to CCXT precision; the order book throws in backtest (implement snapshot replay if you need it); aggregated trades use Binance's `publicGetAggTrades`.

```javascript
const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({ options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 }, enableRateLimit: true });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
  formatPrice: async (symbol, price) => {
    const m = (await getExchange()).market(symbol);
    const tick = m.limits?.price?.min || m.precision?.price;
    return tick !== undefined ? roundTicks(price, tick) : (await getExchange()).priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, qty) => { /* step-size aware, same shape */ },
  getOrderBook: async (symbol, depth, from, to, backtest) => {
    if (backtest) throw new Error("Order book not supported in backtest for the default schema — implement snapshot replay");
    const book = await (await getExchange()).fetchOrderBook(symbol, depth);
    return { symbol, asks: book.asks.map(([p, q]) => ({ price: String(p), quantity: String(q) })), bids: book.bids.map(([p, q]) => ({ price: String(p), quantity: String(q) })) };
  },
  getAggregatedTrades: async (symbol, from, to) => {
    const res = await (await getExchange()).publicGetAggTrades({ symbol, startTime: from.getTime(), endTime: to.getTime() });
    return res.map((t) => ({ id: String(t.a), price: parseFloat(t.p), qty: parseFloat(t.q), timestamp: t.T, isBuyerMaker: t.m }));
  },
});
```

Reuse it from any strategy via the `Exchange` facade: `Exchange.getCandles("ETHUSDT", "15m", 100, { exchangeName: "ccxt-exchange" })`. Swap `ccxt.binance` for any CCXT exchange to retarget.

</details>

<details>
<summary>Volume anomaly — getExecutedTradesSkew</summary>

Fetches `N_TRAIN + N_DETECT` (1200 + 200) aggregated trades and splits them with **no overlap** — baseline for calibration, recent window for detection:

```javascript
const all = await Exchange.getAggregatedTrades(symbol, { exchangeName: "ccxt-exchange" }, 1400);
return volume.predict(all.slice(0, 1200), all.slice(1200), 0.75); // → { anomaly, confidence, direction, imbalance }
```

> Never overlap baseline and recent — training would absorb the anomaly and learn to treat it as normal.

</details>

<details>
<summary>Volatility forecast — getVolatilityForecast</summary>

Fetches candles across 8 timeframes and runs `garch.predict()` on each, returning per-interval `{ sigma, reliable }`:

```javascript
const candles_1m = await Exchange.getCandles(symbol, "1m", 1500, { exchangeName: "ccxt-exchange" });
const { sigma: sigma_1m, reliable: reliable_1m } = await volatility.predict(candles_1m, "1m");
// … repeated for 5m, 15m, 30m, 1h, 4h, 6h, 8h → { volatility_1m … volatility_8h }
```

`garch` auto-selects the best model (GARCH/EGARCH/GJR-GARCH/HAR-RV/NoVaS) by QLIKE; `predict` also returns `upperPrice`/`lowerPrice` = `P·exp(±z·σ)` for a TP/SL corridor (z by confidence: 1.00 @ 68%, 1.96 @ 95%, 2.58 @ 99%).

</details>

<details>
<summary>Pump detection — train / live / backtest</summary>

All three phases share one `getCandles` adapter forwarding straight to `Exchange.getRawCandles` — its argument order (`symbol, interval, limit, sDate, eDate`) matches pump-anomaly's `GetCandles` contract one-to-one:

```javascript
const getCandles = (symbol, interval, limit, sDate, eDate) =>
  Exchange.getRawCandles(symbol, interval, { exchangeName: "ccxt-exchange" }, limit, sDate, eDate);

// TRAIN once (slow — labels replay 1m candles forward) → serialize weights
const weights = (await pump.PumpMatrix.fit(signals, getCandles)).save();   // → assets/model-weights.json
// LIVE — load weights, cascade measured BEFORE each signal (no look-ahead)
const live = await pump.PumpMatrix.load(weights).plan(signals, getCandles);     // TradeSignal[]
// BACKTEST — replay each exit plan forward over closed history (wired into smoke test #4)
const bt = await pump.PumpMatrix.load(weights).backtest(signals, getCandles);   // BacktestSignal[] with result.pnl/reason
```

`signals` is the bundled channel history (`parser-items.json`); `weights` is a previously-trained model (`model-weights.json`). `plan`/`backtest` only load — they never retrain. The three methods differ by which candles they may see: `signals()` none (every outcome `enter`), `plan()` candles *before* the signal (live), `backtest()` candles *after* (forward replay).

**Why a trained model may refuse to trade:** a grid search is `argmax` over thousands of noisy CV scores, biased upward even at zero true edge. pump-anomaly defends in layers — the one-standard-error rule picks the most conservative config within 1 SE of the best; `model.reliable`/`confidence` report training stability; and `model.certification` is an independent five-barrier judge (Deflated Sharpe, PBO, SPA, minTRL, nested OOS). `certified: false` is the honest refusal that the edge is a brute-force artifact.

</details>

## The three analysis libraries

Fed by the same `Exchange` schema, independent of each other:

| Library | Input via schema | Answers |
|---|---|---|
| **[garch](https://www.npmjs.com/package/garch)** | `getCandles` | how far price can move next candle(s) — σ corridor for TP/SL |
| **[volume-anomaly](https://www.npmjs.com/package/volume-anomaly)** | `getAggregatedTrades` | is trade flow abnormally skewed right now (Hawkes + CUSUM + BOCPD) |
| **[pump-anomaly](https://www.npmjs.com/package/pump-anomaly)** | `getRawCandles` | which channel post to trade and exactly how to exit it |

## Project files

`src/index.mjs` (schema + the four functions + smoke tests) · `assets/parser-items.json` (channel signal history — pump input) · `assets/model-weights.json` (trained PumpMatrix weights).

## Tech stack

Node.js (ESM) · backtest-kit 13.6.0 · ccxt 4.5.24 (Binance spot) · garch 1.2.3 · volume-anomaly 1.2.3 · pump-anomaly 1.0.0 · functools-kit.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
