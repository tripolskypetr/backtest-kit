---
title: other/backtest/readme
group: other/backtest
---

# AI-Powered Backtest Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/backtest)

An LLM-driven trading strategy backtested on real history: a local model reads four timeframes of candles, returns a structured signal, and `backtest-kit` replays it over a December 2025 frame — with risk validation, partial-level tracking, and a full conversation log saved for every signal.

## What it shows

- **Multi-timeframe context** — each signal is built from 1h (24 candles), 15m (24), 5m (24) and 1m (30), formatted as plain OHLCV text for the model.
- **Structured LLM output** — Ollama (`deepseek-v3.1:671b`) returns a JSON signal (`position`, `priceOpen`, TP/SL, estimated time) enforced by a response schema.
- **Risk gate** — a `demo_risk` schema rejects signals with TP distance < 1% or risk/reward < 2:1 before they ever execute.
- **Auditability** — `dumpSignalData()` writes the entire model conversation per signal, so any decision is reconstructable.

## Run it

```bash
cd demo/backtest
npm install
export OLLAMA_API_KEY=your_ollama_api_key   # or put it in .env
npm start
```

Pre-configured for **BTCUSDT**, strategy interval **5m**, frame interval **1m**, over **Dec 1 2025** on Binance via CCXT.

<details>
<summary>The strategy (src/index.mjs)</summary>

`Markdown.enable()` turns on report generation; the exchange, risk, frame, and strategy schemas register up front, then `Backtest.background` kicks off the replay.

```javascript
import ccxt from "ccxt";
import {
  addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema,
  Backtest, Partial, Risk, Markdown,
  listenSignalBacktest, listenDoneBacktest, listenBacktestProgress,
  listenError, listenRisk, listenPartialLossAvailable, listenPartialProfitAvailable,
  dumpSignalData,
} from "backtest-kit";
import { v4 as uuid } from "uuid";
import { json } from "./utils/json.mjs";
import { getMessages } from "./utils/messages.mjs";

Markdown.enable();

addExchangeSchema({
  exchangeName: "test_exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) =>
      ({ timestamp, open, high, low, close, volume }));
  },
  formatPrice: async (s, p) => p.toFixed(2),
  formatQuantity: async (s, q) => q.toFixed(8),
});

addFrameSchema({ frameName: "test_frame", interval: "1m",
  startDate: new Date("2025-12-01T00:00:00.000Z"),
  endDate:   new Date("2025-12-01T23:59:59.000Z") });

addStrategySchema({
  strategyName: "test_strategy", interval: "5m", riskName: "demo_risk",
  getSignal: async (symbol) => {
    const messages = await getMessages(symbol);
    const resultId = uuid();
    const result = await json(messages);          // LLM → structured signal
    await dumpSignalData(resultId, messages, result);
    result.id = resultId;
    return result;
  },
});

Backtest.background("BTCUSDT", {
  strategyName: "test_strategy", exchangeName: "test_exchange", frameName: "test_frame",
});
```

</details>

<details>
<summary>The risk gate (demo_risk)</summary>

Two validations run on every pending signal — a signal that fails either is rejected (and surfaced through `listenRisk`):

```javascript
addRiskSchema({
  riskName: "demo_risk",
  validations: [
    { note: "TP distance must be at least 1%",
      validate: ({ pendingSignal, currentPrice }) => {
        const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
        if (!priceOpen) return;
        const tp = position === "long"
          ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
          : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
        if (tp < 1) throw new Error(`TP distance ${tp.toFixed(2)}% < 1%`);
      } },
    { note: "Risk-Reward ratio must be at least 1:2",
      validate: ({ pendingSignal, currentPrice }) => {
        const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
        if (!priceOpen) return;
        const reward = position === "long" ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
        const risk   = position === "long" ? priceOpen - priceStopLoss   : priceStopLoss - priceOpen;
        if (risk <= 0) throw new Error("Invalid SL: risk must be positive");
        if (reward / risk < 2) throw new Error(`RR ratio ${(reward / risk).toFixed(2)} < 2:1`);
      } },
  ],
});
```

</details>

<details>
<summary>Multi-timeframe messages & the LLM client (utils/)</summary>

`utils/messages.mjs` fetches the four timeframes via `getCandles` (look-ahead-safe — no timestamps to pass) and builds a user/assistant conversation, one turn per timeframe, ending with a "generate a signal, use `wait` if unclear" request:

```javascript
const microTermCandles  = await getCandles(symbol, "1m", 30);
const mainTermCandles   = await getCandles(symbol, "5m", 24);
const shortTermCandles  = await getCandles(symbol, "15m", 24);
const mediumTermCandles = await getCandles(symbol, "1h", 24);
// → messages: [user 1h, assistant ack, user 15m, ack, user 5m, ack, user 1m, ack, user "generate signal"]
```

`utils/json.mjs` calls Ollama with a system prompt (position rules, TP/SL relationship, ≤360-minute horizon) and a strict response schema:

```javascript
const response = await ollama.chat({
  model: "deepseek-v3.1:671b",
  messages: [{ role: "system", content: /* trading rules */ }, ...messages],
  format: { type: "object", properties: {
    position: { type: "string", enum: ["wait", "long", "short"] },
    note: { type: "string" }, priceOpen: { type: "number" },
    priceTakeProfit: { type: "number" }, priceStopLoss: { type: "number" },
    minuteEstimatedTime: { type: "number" },
  }, required: ["position", "note", "priceOpen", "priceTakeProfit", "priceStopLoss", "minuteEstimatedTime"] },
});
return JSON.parse(response.message.content.trim());
```

</details>

<details>
<summary>Events & generated output</summary>

Listeners drive logging and report dumps; each dump takes the symbol + a `{ strategyName, exchangeName, frameName }` context:

```javascript
listenBacktestProgress((e) => console.log(`Progress: ${(e.progress * 100).toFixed(2)}%`));
listenDoneBacktest(async (e) => { await Backtest.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }); });
listenRisk(async (e) => { await Risk.dump(e.symbol, { /* context */ }); });
listenPartialProfitAvailable(async (e) => { await Partial.dump(e.symbol, { /* context */ }); });
listenPartialLossAvailable(async (e) => { await Partial.dump(e.symbol, { /* context */ }); });
listenError((err) => console.error("Error occurred:", err));
```

Generated files: `./dump/backtest/test_strategy.md` (performance report) and `./dump/strategy/{uuid}/` (one folder of conversation logs per signal — `00_system_prompt.md` … `10_llm_output.md`).

</details>

## Tech stack

Node.js (ESM) · backtest-kit 13.6.0 · Ollama (`deepseek-v3.1:671b`) · Binance via ccxt 4.5.24 · functools-kit · uuid.

## Next steps

Use the conversation logs to improve prompts · pre-compute indicators before the LLM call · swap to `Live.background()` for real-time execution · run Walker to A/B different prompts · extend to multiple symbols.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
