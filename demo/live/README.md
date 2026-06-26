---
title: other/live/readme
group: other/live
---

# AI-Powered Live Trading Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/live)

The [backtest demo](../backtest) promoted to live execution. **The strategy code is identical** — same multi-timeframe LLM signal, same risk gate — but `Live.background()` drives it on a wall-clock loop instead of replaying history. This is the "same code, backtest → live" guarantee made concrete, and it works for both paper trading and real money.

## What's different from the backtest demo

Only the runner and the event surface. The `getSignal` body, the `demo_risk` schema, and the message-building are byte-for-byte the same. On top, the live demo adds:

- **Continuous monitoring** — `Live.background()` ticks on the frame interval, generating a signal every strategy interval and otherwise watching the open position for TP/SL/timeout.
- **Scheduled orders** — a limit `priceOpen` becomes a `scheduled` signal that activates when price reaches it, or `cancelled` if it times out first.
- **Partial levels & breakeven** — `listenPartialProfitAvailable` / `listenPartialLossAvailable` fire at predefined PnL milestones (via `Constant.TP_LEVEL*` / `SL_LEVEL*`); `listenBreakevenAvailable` signals when the stop can be moved to entry.

> ⚠️ **Always paper-trade first.** The same code runs against a testnet/paper API (zero risk) or a production API (real funds). Validate on paper before risking capital.

## Run it

```bash
cd demo/live
npm install
export OLLAMA_API_KEY=your_ollama_api_key   # or .env
npm start
```

Pre-configured for **BTCUSDT**, strategy **5m**, frame **1m**, Binance via CCXT. The frame (Dec 1 2025) bounds a replay/test window; for true continuous live trading, remove the date constraints.

<details>
<summary>The runner (src/index.mjs)</summary>

Exchange / risk (`demo_risk`, identical to the backtest demo) / frame / strategy register exactly as in the backtest demo; the only change is the entrypoint:

```javascript
import {
  addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema,
  Live, Partial, Schedule, Risk, Breakeven, Constant, Markdown,
  listenSignalLive, listenPartialProfitAvailable, listenPartialLossAvailable,
  listenError, listenRisk, listenBreakevenAvailable, dumpSignalData,
} from "backtest-kit";

Markdown.enable();
// addExchangeSchema / addRiskSchema(demo_risk) / addFrameSchema / addStrategySchema … (same as backtest demo)

Live.background("BTCUSDT", {
  strategyName: "test_strategy", exchangeName: "test_exchange", frameName: "test_frame",
});
```

</details>

<details>
<summary>Signal lifecycle & report dumps</summary>

`listenSignalLive` reacts to every lifecycle action and dumps the relevant report (each with a symbol + context object):

```javascript
listenSignalLive(async (event) => {
  if (event.action === "opened")  console.log("Open position");
  if (event.action === "closed") {
    console.log("Close position");
    await Live.dump(event.symbol,    { strategyName: event.strategyName, exchangeName: event.exchangeName, frameName: event.frameName });
    await Partial.dump(event.symbol, { /* context */ });
  }
  if (event.action === "scheduled" || event.action === "cancelled") {
    await Schedule.dump(event.symbol, { /* context */ });
  }
  console.log(event);
});

listenBreakevenAvailable(async (e) => { await Breakeven.dump(e.symbol, { /* context */ }); });
listenRisk(async (e) => { await Risk.dump(e.symbol, { /* context */ }); });
listenError((err) => console.error("Error occurred:", err));
```

Lifecycle actions: `idle` → `scheduled` → `opened` → `active` → `closed` (or `cancelled` for a scheduled order that never activates). Generated reports: `./dump/backtest/`, `./dump/partial/`, `./dump/schedule/`, plus `./dump/strategy/{uuid}/` conversation logs.

</details>

<details>
<summary>Partial profit / loss handlers</summary>

The demo logs at each level — the hook is where you'd wire a real partial close through your broker adapter:

```javascript
listenPartialProfitAvailable(({ symbol, price, level }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);
  if (level === Constant.TP_LEVEL3) console.log("Close 33% …");
  if (level === Constant.TP_LEVEL2) console.log("Close 33% …");
  if (level === Constant.TP_LEVEL1) console.log("Close 34% …");
});

listenPartialLossAvailable(({ symbol, price, level }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);
  if (level === Constant.SL_LEVEL2) console.log("Close 50% …");
  if (level === Constant.SL_LEVEL1) console.log("Close 50% …");
});
```

`Constant.TP_LEVEL*` / `SL_LEVEL*` are the framework's predefined milestone thresholds; the percentage you scale out at each is your decision.

</details>

<details>
<summary>Paper vs. real money — the only change is the CCXT client</summary>

```javascript
// Paper — testnet, zero risk
new ccxt.binance({ apiKey: TESTNET_KEY, secret: TESTNET_SECRET, enableRateLimit: true, options: { defaultType: "future", test: true } });
// Production — real funds
new ccxt.binance({ apiKey: PROD_KEY, secret: PROD_SECRET, enableRateLimit: true, options: { defaultType: "future" } });
```

A reasonable gate before real money: win rate > 60% and Sharpe > 1.0 across 100+ backtest signals, ≥30 days on paper, max drawdown < 20% — plus an emergency `SIGINT` handler that closes open positions.

</details>

## Tech stack

Node.js (ESM) · backtest-kit 13.6.0 · Ollama (`deepseek-v3.1:671b`) · Binance via ccxt 4.5.24 · functools-kit · uuid.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
