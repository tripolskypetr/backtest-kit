---
title: other/pinets/readme
group: other/pinets
---

# Pine Script Runner

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/pinets)

The smallest possible `@backtest-kit/pinets` setup: run a `.pine` indicator against real CCXT candles and print its plots as a markdown table — including a cross-symbol `request.security` call resolved through the same exchange.

## What it shows

- **Run a `.pine` from Node** — no TradingView account.
- **`request.security`** — the example script pulls 1h BTC closes while charting 15m ETH, and the runner resolves that second symbol through the registered exchange.
- **Plot → markdown** — `toMarkdown` renders the returned plot arrays, keyed by a name→column schema.

## Run it

```bash
cd demo/pinets
npm install
npm start
```

Pre-configured: **ETHUSDT**, **15m**, **180 candles**, from **2025-09-24T12:00Z**, Binance spot via CCXT.

<details>
<summary>The runner (src/index.mjs)</summary>

Register a CCXT exchange, run the script against it, render the result. `run()` takes the file, the run options, the exchange name, and the "as-of" date; `toMarkdown` takes a signal id, the plots, and the schema mapping plot names to column headers:

```javascript
import { addExchangeSchema } from "backtest-kit";
import { singleshot, randomString } from "functools-kit";
import { run, File, toMarkdown } from "@backtest-kit/pinets";
import ccxt from "ccxt";

const SIGNAL_SCHEMA = { position: "Position", close: "Close", btcClose: "BTC Close" };

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({ options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 }, enableRateLimit: true });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const candles = await (await getExchange()).fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
});

const plots = await run(
  File.fromPath("test_request_security.pine", "./math"),
  { symbol: "ETHUSDT", timeframe: "15m", limit: 180 },
  "ccxt-exchange",
  new Date("2025-09-24T12:00:00.000Z"),
);

console.log(await toMarkdown(randomString(), plots, SIGNAL_SCHEMA));
```

Change symbol/timeframe/limit in the `run()` options, or drop a new `.pine` into `./math/` and point `File.fromPath` at it.

</details>

<details>
<summary>The indicator (math/test_request_security.pine)</summary>

A trivial script that proves cross-symbol data flows: it charts the current symbol's close and pulls BTC's 1h close via `request.security`, with a flat `Position` plot. Every output uses `display=display.data_window` so the runner picks it up as a column.

```pine
//@version=5
indicator("test_request_security", overlay=false)

btcClose = request.security("BINANCE:BTCUSDT", "1h", close)  // higher-timeframe / cross-symbol

plot(close,    "Close",     display=display.data_window)
plot(btcClose, "BTC Close", display=display.data_window)
plot(0,        "Position",  display=display.data_window)     // flat — just verifying data flow
```

`run()` feeds the script candles from `ccxt-exchange` and resolves the `request.security("BINANCE:BTCUSDT", …)` call through that same exchange — so a multi-symbol Pine strategy needs no extra wiring.

</details>

## Output

```
| Time | Position | Close | BTC Close |
|------|----------|-------|-----------|
| ...  | 0        | ...   | ...       |
```

## Tech stack

Node.js (ESM) · backtest-kit 13.6.0 · @backtest-kit/pinets 13.6.0 · ccxt 4.5.24 (Binance spot) · functools-kit.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
