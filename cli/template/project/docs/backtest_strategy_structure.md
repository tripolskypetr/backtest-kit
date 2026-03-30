# Strategy Structure Guide

## Overview

A backtest-kit strategy file registers four schemas and wires them together. The CLI reads all `.ts` / `.mjs` files in the target directory and calls the registered schemas at runtime.

```
addExchangeSchema  — data source (candles, trades, order book)
addFrameSchema     — backtest time window
addStrategySchema  — signal generation logic
addRiskSchema      — optional position filters
```

---

## Minimal Strategy File

```ts
import { addExchangeSchema, addFrameSchema, addStrategySchema, getCandles, Log } from "backtest-kit";
import { randomString } from "functools-kit";

// 1. Data source
addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => { ... },
});

// 2. Backtest window
addFrameSchema({
  frameName: "feb_2024_frame",
  interval: "1m",                              // tick granularity
  startDate: new Date("2024-02-01T00:00:00Z"),
  endDate:   new Date("2024-02-29T23:59:59Z"),
});

// 3. Signal logic
addStrategySchema({
  strategyName: "my_strategy",
  interval: "15m",                             // getSignal call frequency
  getSignal: async (symbol, when) => {
    // ... compute signal
    return {
      id: randomString(),
      position: "long",
      priceTakeProfit: 50000,
      priceStopLoss:   48000,
      minuteEstimatedTime: 480,
    };
    // return null → no signal this tick
  },
});
```

---

## ISignalDto — Signal Fields

```ts
interface ISignalDto {
  id?:                  string;   // auto-generated UUID if omitted
  position:             "long" | "short";
  priceTakeProfit:      number;   // for long: > priceOpen; for short: < priceOpen
  priceStopLoss:        number;   // for long: < priceOpen; for short: > priceOpen
  minuteEstimatedTime:  number;   // expected hold duration in minutes
  priceOpen?:           number;   // omit → opens immediately at current price
                                  // provide → creates a scheduled signal
  note?:                string;   // human-readable description
}
```

**Immediate vs scheduled signal:**
- `priceOpen` omitted → position opens at current VWAP immediately
- `priceOpen` set → signal waits until price reaches that level, then opens

---

## Signal Lifecycle

```
idle
  │  getSignal() returns ISignalDto (no priceOpen)
  ▼
opened → active → closed (TP or SL hit, or time expired)
                 ↓
              pnlPercentage in result

  │  getSignal() returns ISignalDto (with priceOpen)
  ▼
scheduled → waiting → opened → active → closed
                    ↓
                 cancelled (if price never reached)
```

Lifecycle callbacks (all optional):

```ts
addStrategySchema({
  strategyName: "...",
  interval: "15m",
  getSignal: ...,
  callbacks: {
    onOpen:    (symbol, signal, price, backtest) => { ... },
    onClose:   (symbol, signal, closePrice, backtest) => { ... },
    onActive:  (symbol, signal, price, backtest) => { ... },
    onIdle:    (symbol, price, backtest) => { ... },
    onCancel:  (symbol, signal, price, backtest) => { ... },
    onSchedule:(symbol, signal, price, backtest) => { ... },
    onPartialProfit: (symbol, signal, price, revenuePercent, backtest) => { ... },
    onPartialLoss:   (symbol, signal, price, lossPercent, backtest) => { ... },
    onBreakeven:     (symbol, signal, price, backtest) => { ... },
  },
});
```

---

## Interval Types

| Schema | Parameter | Valid values |
|---|---|---|
| `addFrameSchema` | `interval` | `"1m"` `"3m"` `"5m"` `"15m"` `"30m"` `"1h"` `"2h"` `"4h"` `"6h"` `"8h"` `"12h"` `"1d"` `"3d"` |
| `addStrategySchema` | `interval` | `"1m"` `"3m"` `"5m"` `"15m"` `"30m"` `"1h"` |
| `getCandles` / `addExchangeSchema` | `interval` | `"1m"` `"3m"` `"5m"` `"15m"` `"30m"` `"1h"` `"2h"` `"4h"` `"6h"` `"8h"` |

**Rule:** `frameSchema.interval` controls tick granularity; `strategySchema.interval` throttles how often `getSignal` is called. Strategy interval must be ≥ frame interval.

---

## Exchange Schema — Binance via CCXT

Full boilerplate with candles + aggregated trades:

```ts
import { singleshot } from "functools-kit";
import ccxt from "ccxt";

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  getAggregatedTrades: async (symbol, from, to) => {
    const exchange = await getExchange();
    const response = await exchange.publicGetAggTrades({
      symbol,
      startTime: from.getTime(),
      endTime:   to.getTime(),
    });
    return response.map((t: any) => ({
      id:           String(t.a),
      price:        parseFloat(t.p),
      qty:          parseFloat(t.q),
      timestamp:    t.T,
      isBuyerMaker: t.m,
    }));
  },
});
```

Notes:
- `singleshot` from `functools-kit` memoizes the exchange init — called once, reused everywhere
- `getAggregatedTrades` is optional; only needed if strategy uses `volume-anomaly`
- In backtest mode the `backtest: boolean` flag is passed as 4th arg — use it to switch between live API and cached data

---

## Risk Schema

Filters that run before a signal is accepted. If any validation returns a rejection string, the signal is blocked.

```ts
import { addRiskSchema } from "backtest-kit";

addRiskSchema({
  riskName: "max_positions",
  validations: [
    {
      note: "Allow max 1 active position",
      validate: ({ activePositionCount }) => {
        if (activePositionCount >= 1) return "Too many open positions";
        return null; // null = allowed
      },
    },
  ],
});

// Attach to strategy:
addStrategySchema({
  strategyName: "my_strategy",
  interval: "15m",
  riskName: "max_positions",  // single risk profile
  getSignal: ...,
});
// or multiple:
// riskList: ["max_positions", "funding_filter"]
```

`IRiskValidationPayload` fields available in `validate`:

| Field | Type | Description |
|---|---|---|
| `currentSignal` | `IRiskSignalRow` | Signal about to open |
| `activePositionCount` | `number` | Currently open positions |
| `activePositions` | `IRiskActivePosition[]` | Details of each open position |
| `currentPrice` | `number` | Current market price |
| `symbol` | `string` | Trading pair |
| `backtest` | `boolean` | Whether running in backtest mode |

---

## PNL Calculation

Transaction costs are automatically applied:
- Slippage: **0.1%** per side
- Fee: **0.1%** per side
- Round-trip cost: **0.4%**

`priceOpen` and `priceClose` in `IStrategyPnL` are **adjusted** (slippage + fee already subtracted). `pnlPercentage` is the net result.

Minimum `movePercent` to cover costs: `> 0.4%`. Recommended filter: `> 0.7%` to leave margin.

---

## File Naming Convention

Strategy files must be importable by the CLI. Use either:
- `content/my_strategy.ts` (TypeScript, requires compilation)
- `strategies/my_strategy/index.mjs` (compiled ESM)

The CLI entry point from `package.json`:
```
npx @backtest-kit/cli ./strategies/feb_2024/index.mjs --backtest --ui --noCache
```
