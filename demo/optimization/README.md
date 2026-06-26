---
title: other/optimization/readme
group: other/optimization
---

# AI Strategy Optimizer

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/optimization)

Generate **runnable strategy code** with an LLM. The optimizer analyzes a symbol across seven training days of multi-timeframe data, then emits a complete executable `.mjs` — exchange config, frames, seven strategies, and a Walker comparison — that you run to find the best variant on held-out test data.

## What it shows

- **Optimizer schema** (`@backtest-kit/ollama`) — `addOptimizerSchema` wires data sources + train/test ranges + an LLM prompt function into one generator.
- **Four data sources** — 1h (Fibonacci levels), 30m (volume/volatility), 15m (ROC), 1m (squeeze momentum + pressure index), each pulled from a [node-ccxt-dumper](https://github.com/tripolskypetr/node-ccxt-dumper) instance and formatted with full indicator legends for the model.
- **Train → test split** — 7 days of training (Nov 24–30 2025) → 1 day of validation (Dec 1 2025).
- **Code generation** — `Optimizer.dump()` writes `./generated/btc-optimizer_BTCUSDT.mjs`; running it executes a 7-strategy Walker ranked by Sharpe.

## Run it

```bash
cd demo/optimization
npm install
export OLLAMA_API_KEY=your_ollama_api_key
export CCXT_DUMPER_URL=your_node_ccxt_dumper_instance
npm start                                   # → ./generated/btc-optimizer_BTCUSDT.mjs
node ./generated/btc-optimizer_BTCUSDT.mjs  # run the generated comparison
```

<details>
<summary>The optimizer schema (src/index.mjs)</summary>

`addOptimizerSchema` takes the training/test ranges, the source list, and a `getPrompt` that turns the assembled multi-timeframe messages into one strategy report; `Optimizer.dump` runs it and writes the executable:

```javascript
import { addOptimizerSchema, Optimizer, listenOptimizerProgress } from "@backtest-kit/ollama";

addOptimizerSchema({
  optimizerName: "btc-optimizer",
  rangeTrain: TRAIN_RANGE,   // 7 daily ranges, Nov 24–30 2025
  rangeTest:  TEST_RANGE,    // Dec 1 2025
  source:     SOURCE_LIST,   // 4 timeframe sources (below)
  getPrompt: async (symbol, messages) => text(symbol, messages),  // LLM → strategy report
});

listenOptimizerProgress(({ progress }) => console.log(`Progress: ${progress * 100}%`));

await Optimizer.dump("BTCUSDT", { optimizerName: "btc-optimizer" }, "./generated");
```

`Optimizer.getData("BTCUSDT", { optimizerName })` is available too — it returns the per-range strategy metadata without generating code (commented out in the demo, handy for inspecting what the LLM produced).

</details>

<details>
<summary>The four data sources (SOURCE_LIST)</summary>

Each source is `{ name, fetch, user, assistant }`: `fetch` pulls rows from `CCXT_DUMPER_URL/view/<range>` for the given symbol/date window; `user` renders them as a markdown table followed by an exhaustive indicator legend (period, lookback, range for every column); `assistant` is the acknowledgement turn.

```javascript
const SOURCE_LIST = [
  { name: "long-term-range",  /* 1h, 48 candles, RSI/MACD/ADX/Bollinger/Fibonacci/DEMA/WMA/SMA50 … */ },
  { name: "swing-term-range", /* 30m, 96 candles, + volume/volatility/Bollinger width */ },
  { name: "short-term-range", /* 15m, fast indicators + ROC(5/10) */ },
  { name: "micro-term-range", /* 1m, 60 candles, squeeze momentum + pressure index */ },
];
// each: fetch({symbol,startDate,endDate,limit,offset}) → rows; user(symbol,data) → markdown + legend
```

The legends are deliberately verbose — they tell the model exactly what each column means (e.g. "RSI(14): over previous 14 candles before row timestamp, Min 0 Max 100"), so the generated strategy reasons over named indicators rather than raw numbers.

</details>

<details>
<summary>The prompt (getPrompt → text())</summary>

`text()` calls Ollama with `think: true`, a system instruction to return **only** a copy-paste-ready strategy report (no greeting, no meta-talk), the assembled source messages, and a final question asking for a *fundamental* (not just technical) recommendation with S/R entries and an RR target. The returned report is escaped for safe embedding into the generated `.mjs`:

```javascript
const response = await ollama.chat({
  model: "deepseek-v3.1:671b", think: true,
  messages: [
    { role: "system", content: "только отчёт готовый для копипасты … Не здоровайся, не говори что делаешь" },
    { role: "system", content: "Reasoning: high" },
    ...messages,
    { role: "user", content: `На каких условиях мне купить ${symbol}? … RR? LONG или SHORT? … фундаментальный анализ` },
  ],
});
```

</details>

<details>
<summary>What the generated file does</summary>

`./generated/btc-optimizer_BTCUSDT.mjs` is self-contained: exchange config (Binance/CCXT), frame definitions (the 7 training days + the test day), 7 strategy implementations (one per training day's generated report), a Walker setup, and progress listeners. Running it executes all seven strategies on the test data and ranks them by Sharpe — so a week of LLM analysis collapses into one comparable, reproducible artifact.

</details>

## Tech stack

Node.js (ESM) · backtest-kit 13.6.0 · @backtest-kit/ollama 13.6.0 · Ollama (`deepseek-v3.1:671b`) · functools-kit · node-ccxt-dumper API.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
