<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 🧿 Backtest Kit — Technical Reference for Language Models

> Exhaustive, source-accurate API reference for **backtest-kit** `v13.6.0`. This document is written for language models and machine consumption: every symbol below is exported from `backtest-kit` and verified against `./src`. The human-facing narrative lives in [README.md](./README.md); this file is the dense, complete specification.

`backtest-kit` is a TypeScript framework for backtesting and live trading strategies on multi-asset markets (crypto, forex, DEX/peer-to-peer, spot, futures) with crash-safe persistence, signal validation, transactional broker integration, virtual-time scheduling, and AI/LLM optimization. It is **not a data-processing library — it is a time execution engine**: an async stream of virtual (backtest) or real (live) time, where your strategy is evaluated tick by tick, and the *same strategy code* runs unchanged in both modes.

---

## Table of Contents

1. [Mental model & guarantees](#1-mental-model--guarantees)
2. [Installation & ecosystem packages](#2-installation--ecosystem-packages)
3. [Quick start](#3-quick-start)
4. [Core concepts](#4-core-concepts)
5. [The execution model (tick stream, contexts, look-ahead protection)](#5-the-execution-model)
6. [Schema registration reference](#6-schema-registration-reference)
7. [Signal lifecycle & tick results](#7-signal-lifecycle--tick-results)
8. [Strategy context functions](#8-strategy-context-functions)
9. [Commit functions (position mutation API)](#9-commit-functions)
10. [Position analytics functions](#10-position-analytics-functions)
11. [Exchange data API & candle math](#11-exchange-data-api--candle-math)
12. [PNL, DCA & effective-price math](#12-pnl-dca--effective-price-math)
13. [Runners: Backtest, Live, Walker](#13-runners-backtest-live-walker)
14. [Analytics & reports: Heat, Schedule, Partial, Position, HighestProfit, MaxDrawdown, Risk, Performance, Sync](#14-analytics--reports)
15. [Position sizing](#15-position-sizing)
16. [Risk management](#16-risk-management)
17. [Broker: transactional live orders](#17-broker-transactional-live-orders)
18. [Cron: virtual-time scheduler](#18-cron-virtual-time-scheduler)
19. [Sync: order synchronization](#19-sync-order-synchronization)
20. [Per-signal Memory, State, Session, Storage, Recent](#20-per-signal-memory-state-session-storage-recent)
21. [Dump: agent reasoning & record capture](#21-dump-agent-reasoning--record-capture)
22. [Actions: pluggable event handlers](#22-actions-pluggable-event-handlers)
23. [Event listeners](#23-event-listeners)
24. [Notifications](#24-notifications)
25. [Persistence adapters (15 domains)](#25-persistence-adapters)
26. [Global configuration reference](#26-global-configuration-reference)
27. [Math helpers & utilities](#27-math-helpers--utilities)
28. [Reflection & introspection](#28-reflection--introspection)
29. [AI strategy optimizer](#29-ai-strategy-optimizer)
30. [Strategy examples](#30-strategy-examples)
31. [Architecture overview](#31-architecture-overview)
32. [Complete public export index](#32-complete-public-export-index)
33. [Ecosystem packages — detailed API](#33-ecosystem-packages--detailed-api)
34. [Strategy examples (reference implementations)](#34-strategy-examples-reference-implementations)
35. [Raw-library demos (no CLI)](#35-raw-library-demos-no-cli)
36. [Framework philosophy & further reading](#36-framework-philosophy--further-reading)
37. [Markdown report catalog](#37-markdown-report-catalog)
38. [JSONL report streams](#38-jsonl-report-streams)
39. [Schema & graph validation](#39-schema--graph-validation)
40. [Config in practice — where each parameter is consumed](#40-config-in-practice--where-each-parameter-is-consumed)

---

## 1. Mental model & guarantees

Think of the engine as an **async stream of time**. Each emitted moment is a *tick*. On each tick the engine:

1. Computes the current price (VWAP of the last `CC_AVG_PRICE_CANDLES_COUNT` 1-minute candles).
2. Asks your strategy for a signal (throttled to the strategy `interval`).
3. Monitors any open position for TP / SL / time expiry / trailing / breakeven / partial milestones.
4. Emits lifecycle events (`idle`, `scheduled`, `waiting`, `opened`, `active`, `closed`, `cancelled`) plus ping events (`idlePing`, `schedulePing`, `activePing`).

The headline guarantees:

- **Mode parity.** The identical strategy file runs in `Backtest` (historical, virtual time) and `Live` (real time). The only difference is the clock source — handled by the framework via `AsyncLocalStorage`.
- **No look-ahead bias.** All candle/orderbook/trade fetches are aligned down to interval boundaries and clamped to the current virtual `when`. It is structurally impossible for a strategy to read a candle from its own future. See [§11](#11-exchange-data-api--candle-math).
- **Crash-safe persistence.** Live state (pending signals, scheduled signals, partial levels, breakeven flags, risk positions, strategy commit queue, …) is written atomically and restored on restart — no duplicate signals, no lost positions. 15 independent persistence domains, each replaceable with a custom adapter ([§25](#25-persistence-adapters)).
- **Transactional live orders.** The optional `Broker` adapter intercepts every position mutation *before* internal state changes; an exchange rejection rolls back the operation atomically and the engine retries on the next tick ([§17](#17-broker-transactional-live-orders)).
- **Path-aware exits.** Exits are evaluated against OHLC replay within each candle, not close-to-close — so intra-candle SL/TP hits are detected in the correct order.
- **Safe math.** Every statistic is guarded against `NaN`/`Infinity`; invalid computations surface as `null` / `N/A` rather than poisoning a report.

`backtest-kit` has **775+** unit and integration tests covering validation, recovery, reports, events, walker, heatmap, position sizing, risk, scheduled signals, partials, breakeven, trailing, DCA, cron, sync, and broker.

> The *why* behind these design choices — look-ahead bias as an architectural constraint, second-order chaos, the zero-expectation trap, AI-driven strategy development, the monorepo/parallel model — is laid out in [§36 Framework philosophy & further reading](#36-framework-philosophy--further-reading).

---

## 2. Installation & ecosystem packages

### Core install

```bash
npm install backtest-kit ccxt ollama uuid
```

`backtest-kit` has only four runtime dependencies (`di-kit`, `di-scoped`, `di-singleton`, `functools-kit`, `get-moment-stamp`) and requires `typescript ^5.0.0` as a peer dependency. `ccxt`, `ollama`, `uuid` are *your* peers for data fetching and LLM inference — not required by the core.

### Scaffolding (fastest paths)

```bash
# Zero-boilerplate: all wiring stays inside the CLI package
npx @backtest-kit/cli --init --output backtest-kit-project
cd backtest-kit-project && npm install && npm start

# Full-control eject: exchange/frame/risk/strategy/runner all live as editable files
npx -y @backtest-kit/sidekick my-trading-bot
cd my-trading-bot && npm start

# Docker workspace with auto-restart
npx @backtest-kit/cli --docker
cd backtest-kit-docker
MODE=live SYMBOL=TRXUSDT STRATEGY_FILE=./content/feb_2026/feb_2026.strategy.ts docker-compose up -d
```

### Ecosystem packages

| Package | Purpose |
| --- | --- |
| `@backtest-kit/cli` | Zero-boilerplate CLI runner. `--backtest` / `--paper` / `--live`, auto candle cache, `--ui`, `--telegram`, monorepo isolation. |
| `@backtest-kit/sidekick` | Project scaffolder — the "eject" of `--init`; all boilerplate as editable source files. |
| `@backtest-kit/pinets` | Run TradingView Pine Script v5/v6 strategies in Node via the PineTS runtime; 60+ built-in indicators. |
| `@backtest-kit/graph` | Compose computations as a typed DAG (`sourceNode` + `outputNode`), resolved in topological order with `Promise.all` parallelism. |
| `@backtest-kit/ui` | Full-stack visualization: Node backend + React dashboard, candlestick charts, signal tracking, risk analysis. |
| `@backtest-kit/mongo` | MongoDB source-of-truth + Redis O(1) cache replacing file-based `./dump/`; all 15 persist adapters implemented. |
| `@backtest-kit/ollama` | Multi-provider LLM inference (OpenAI, Claude, DeepSeek, Grok, Mistral, Perplexity, Cohere, Alibaba, HuggingFace, Ollama) with structured JSON output and token rotation. |
| `@backtest-kit/signals` | 50+ technical indicators across 4 timeframes; markdown reports formatted for LLM context injection. |

> Full per-package API reference (verified against each `src/index.ts`) is in [§33](#33-ecosystem-packages--detailed-api).

Community templates: `backtest-monorepo-parallel` (9 symbols in one process on Mongo+Redis), `backtest-ollama-crontab` (Telegram-ingested signals + LLM risk filter), `backtest-kit-redis-mongo-docker` (production persistence stack), `uzse-backtest-app` (regional stock exchanges via Pine Script).

Vector/quant math companions, plugging into the `Exchange` schema with no Python runtime: [`garch`](https://www.npmjs.com/package/garch) (conditional variance → TP/SL corridor, via `getCandles`), [`pump-anomaly`](https://www.npmjs.com/package/pump-anomaly) (coordinated-speculation detection, via `getRawCandles`), [`volume-anomaly`](https://www.npmjs.com/package/volume-anomaly) (order-flow intensity, via `getAggregatedTrades`).

---

## 3. Quick start

### 3.1 Basic configuration

```typescript
import { setLogger, setConfig } from "backtest-kit";

setLogger({
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
});

// Optional — see §26 for all ~40 keys. Call before running any strategy.
setConfig({
  CC_PERCENT_SLIPPAGE: 0.1,        // % slippage per side
  CC_PERCENT_FEE: 0.1,             // % fee per side
  CC_SCHEDULE_AWAIT_MINUTES: 120,  // pending (scheduled) signal timeout
});
```

> `setLogger`/`setConfig` are synchronous in `v13.6.0` (the README's `await setConfig(...)` still works because `await` on a non-promise is a no-op, but it is not required). `setConfig` validates the merged config and rolls back + rethrows on failure.

### 3.2 Register components

```typescript
import ccxt from "ccxt";
import {
  addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema,
} from "backtest-kit";

// Exchange (data source)
addExchangeSchema({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit, backtest) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: (symbol, price) => price.toFixed(2),
  formatQuantity: (symbol, quantity) => quantity.toFixed(8),
});

// Risk profile (portfolio-level validations)
addRiskSchema({
  riskName: "demo",
  validations: [
    // TP at least 1%
    ({ currentSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, position } = currentSignal;
      const tpDistance = position === "long"
        ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
        : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
      if (tpDistance < 1) throw new Error(`TP too close: ${tpDistance.toFixed(2)}%`);
    },
    // Reward/Risk at least 2:1
    ({ currentSignal }) => {
      const { priceOpen, priceTakeProfit, priceStopLoss, position } = currentSignal;
      const reward = position === "long" ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
      const risk   = position === "long" ? priceOpen - priceStopLoss : priceStopLoss - priceOpen;
      if (reward / risk < 2) throw new Error("Poor R/R ratio");
    },
  ],
});

// Time frame (backtest period)
addFrameSchema({
  frameName: "1d-test",
  interval: "1m",
  startDate: new Date("2025-12-01"),
  endDate: new Date("2025-12-02"),
});
```

> **Note on the risk validation payload.** In `v13.6.0` the validation function receives an `IRiskValidationPayload` whose signal field is `currentSignal` (an `IRiskSignalRow`, with `priceOpen` always present), plus `activePositionCount` and `activePositions`. Earlier docs referenced `pendingSignal` — use `currentSignal`. See [§16](#16-risk-management).

### 3.3 Define a strategy (with an LLM)

```typescript
import { v4 as uuid } from "uuid";
import { addStrategySchema, getCandles, dumpAgentAnswer, dumpRecord } from "backtest-kit";
import { json } from "./utils/json.mjs";       // your LLM wrapper
import { getMessages } from "./utils/messages.mjs"; // market-data prep

addStrategySchema({
  strategyName: "llm-strategy",
  interval: "5m",
  riskName: "demo",
  getSignal: async (symbol, when, currentPrice) => {
    const candles1h  = await getCandles(symbol, "1h", 24);
    const candles15m = await getCandles(symbol, "15m", 48);
    const candles5m  = await getCandles(symbol, "5m", 60);
    const candles1m  = await getCandles(symbol, "1m", 60);

    const messages = await getMessages(symbol, { candles1h, candles15m, candles5m, candles1m });
    const resultId = uuid();
    const signal = await json(messages); // LLM returns { position, priceTakeProfit, priceStopLoss, ... }

    await dumpAgentAnswer({
      dumpId: "position-context",
      bucketName: "multi-timeframe-strategy",
      messages,
      description: "agent reasoning for this signal",
    });
    await dumpRecord({
      dumpId: "position-entry",
      bucketName: "multi-timeframe-strategy",
      record: signal,
      description: "signal entry parameters",
    });

    return { ...signal, id: resultId };
  },
});
```

> **`getSignal` signature changed.** In `v13.6.0` `getSignal` is `(symbol, when, currentPrice) => Promise<ISignalDto | null>`. The `when: Date` and `currentPrice: number` arguments are passed by the engine; you no longer have to call `getDate()`/`getAveragePrice()` just to obtain them (though those functions still exist). Returning `null` means "no signal this tick".

### 3.4 Run a backtest

```typescript
import { Backtest, listenSignalBacktest, listenDoneBacktest } from "backtest-kit";

Backtest.background("BTCUSDT", {
  strategyName: "llm-strategy",
  exchangeName: "binance",
  frameName: "1d-test",
});

listenSignalBacktest((event) => console.log(event));
listenDoneBacktest(async (event) => {
  await Backtest.dump(event.symbol, event.strategyName); // → ./dump/backtest/llm-strategy.md
});
```

### 3.5 Run live trading

```typescript
import { Live, listenSignalLive } from "backtest-kit";

Live.background("BTCUSDT", {
  strategyName: "llm-strategy",
  exchangeName: "binance",
});

listenSignalLive((event) => console.log(event));
```

### 3.6 Complete end-to-end example (single file)

A minimal, fully self-contained backtest with a deterministic synthetic exchange — useful as a smoke test or a starting skeleton:

```typescript
import {
  addExchangeSchema, addStrategySchema, addFrameSchema,
  Backtest, listenSignalBacktest, listenDoneBacktest, listenError,
} from "backtest-kit";

// 1) Exchange — synthetic candles around a slowly drifting base price.
addExchangeSchema({
  exchangeName: "sim",
  getCandles: async (symbol, interval, since, limit) => {
    const base = 50_000;
    return Array.from({ length: limit }, (_, i) => {
      const t = since.getTime() + i * 60_000;
      const p = base + Math.sin(t / 6e6) * 500;
      return { timestamp: t, open: p, high: p + 25, low: p - 25, close: p, volume: 10 };
    });
  },
  formatPrice: (s, price) => price.toFixed(2),
  formatQuantity: (s, qty) => qty.toFixed(6),
});

// 2) Strategy — open a LONG immediately when flat, scale out at +1%, trail at +2%.
addStrategySchema({
  strategyName: "demo",
  interval: "5m",
  getSignal: async (symbol, when, currentPrice) => {
    if (!(await hasNoPendingSignal(symbol))) return null;
    return {
      position: "long",
      priceTakeProfit: currentPrice * 1.03,
      priceStopLoss: currentPrice * 0.98,
      minuteEstimatedTime: 240,
    };
  },
  callbacks: {
    onActivePing: async (symbol, data, currentPrice) => {
      const pct = await getPositionPnlPercent(symbol, currentPrice);
      if (pct !== null && pct >= 1) await commitPartialProfit(symbol, 50);
      if (pct !== null && pct >= 2) await commitTrailingStop(symbol, 1, currentPrice);
    },
    onClose: (symbol, data, priceClose, when) =>
      console.log(`closed ${symbol} @ ${priceClose} pnl=${data.pnl.pnlPercentage.toFixed(2)}%`),
  },
});

// 3) Frame — one day at 1-minute granularity.
addFrameSchema({
  frameName: "1d",
  interval: "1m",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate:   new Date("2025-12-02T00:00:00Z"),
});

// 4) Run + report.
listenError((e) => console.error("engine error:", e));
listenSignalBacktest((e) => { if (e.action === "closed") console.log("PNL%", e.pnl.pnlPercentage); });
listenDoneBacktest(async (e) => { await Backtest.dump(e.symbol, e.strategyName); });

Backtest.background("BTCUSDT", { strategyName: "demo", exchangeName: "sim", frameName: "1d" });
```

> Imports of `hasNoPendingSignal`, `getPositionPnlPercent`, `commitPartialProfit`, `commitTrailingStop` come from `backtest-kit` (omitted above for brevity). They are valid inside `getSignal`/callbacks because the engine has an active context there.

---

## 4. Core concepts

### 4.1 Dependency inversion via string names

Exchanges, strategies, frames, risk profiles, sizing profiles, walkers, and actions are registered under **string identifiers** and lazily resolved at runtime. Declare them in separate modules, wire them with constants:

```typescript
export enum ExchangeName { Binance = "binance", Bybit = "bybit" }
export enum StrategyName { SMA = "sma-crossover", RSI = "rsi-strategy" }
export enum FrameName    { Day = "1d", Week = "1w" }

addStrategySchema({ strategyName: StrategyName.SMA, interval: "5m", getSignal: async () => { /* … */ } });
Backtest.background("BTCUSDT", {
  strategyName: StrategyName.SMA,
  exchangeName: ExchangeName.Binance,
  frameName: FrameName.Day,
});
```

All name types (`ExchangeName`, `StrategyName`, `FrameName`, `RiskName`, `SizingName`, `WalkerName`, `ActionName`) are `string` aliases — use plain strings or enums interchangeably.

### 4.2 The `context` object

Every runner method takes `(symbol, context)`. The shape depends on the runner:

- **Backtest**: `{ strategyName, exchangeName, frameName }`
- **Live**: `{ strategyName, exchangeName }` (no frame — live uses the wall clock)
- **Walker**: `{ walkerName }` (the walker schema already names the exchange + frame + strategy list)

### 4.3 Two ways to run the engine

Both consume the **same engine with the same guarantees**; only the consumption model differs.

**Event-driven (background):** for production bots, monitoring, long-running processes.

```typescript
Backtest.background("BTCUSDT", config);
listenSignalBacktest((event) => { /* handle every lifecycle event */ });
listenDoneBacktest((event) => { /* finalize / dump report */ });
```

**Async iterator (pull-based):** for research, scripting, tests, and LLM agents.

```typescript
for await (const event of Backtest.run("BTCUSDT", config)) {
  // backtest yields closed/cancelled/opened/scheduled/active results
}
```

`background(...)` returns a **cancellation closure** (graceful stop — lets the current position finish). `run(...)` returns an **async generator**.

### 4.4 Signals: scheduled vs immediate

`getSignal` returns an `ISignalDto`:

- If `priceOpen` is **provided**, the signal is **scheduled** — it waits for the market to reach `priceOpen` (a limit/grid-style entry). It is auto-cancelled after `CC_SCHEDULE_AWAIT_MINUTES`, or if SL is hit before activation.
- If `priceOpen` is **omitted**, the signal opens **immediately at the current VWAP**.

Direction rules (validated automatically): for `long`, `priceTakeProfit > priceOpen` and `priceStopLoss < priceOpen`; for `short`, the inverse.

### 4.5 Supported order types

With per-entry PNL, peak profit, and max drawdown tracking:

- Market / Limit entries
- TP / SL / OCO exits
- Grid (auto-cancel when entry condition or SL fires before activation)
- Partial profit / loss levels
- Trailing take-profit / trailing stop-loss
- Breakeven protection
- Stop-limit entries
- Dollar-cost averaging (DCA via `commitAverageBuy`)
- Time-attack / infinite-hold (`minuteEstimatedTime: Infinity`)

---

## 5. The execution model

### 5.1 Async context propagation

`backtest-kit` uses Node's `AsyncLocalStorage` to propagate two contexts through the entire async call tree without threading parameters:

- **ExecutionContextService** — `{ symbol, when: Date, backtest: boolean }`. The clock.
- **MethodContextService** — `{ strategyName, exchangeName, frameName }`. The identity.

Almost every public function (`getCandles`, `getAveragePrice`, `commitPartialProfit`, `getPositionPnlPercent`, …) reads these contexts internally. They **throw if called outside an active context** — i.e. you can only call them from inside `getSignal` or a strategy callback (`onActivePing`, `onClose`, …), not at module top-level. Use `hasTradeContext()` to test for an active context before calling.

`getMode()` returns `"backtest" | "live"`; `getDate()` returns the current `when`; `getSymbol()` returns the symbol; `getRuntimeInfo()` returns the full `{ symbol, context, backtest, range, currentPrice, info, when }` snapshot ([§28](#28-reflection--introspection)).

### 5.2 VWAP pricing

The engine's "current price" is the **VWAP** of the last `CC_AVG_PRICE_CANDLES_COUNT` (default 5) one-minute candles:

```
TypicalPrice = (high + low + close) / 3
VWAP         = Σ(TypicalPrice × volume) / Σ(volume)
```

If total volume is zero, the engine falls back to the simple average of close prices. The same VWAP is used in backtest and live so results are comparable. Obtain it with `getAveragePrice(symbol)`.

### 5.3 Candle timestamp convention

A candle's `timestamp` is its **openTime**, never its closeTime. Close time = `timestamp + stepMs` where `stepMs` is the interval duration (e.g. 60000 for `"1m"`).

All timestamps are aligned **down** to the interval boundary (e.g. for `15m`: `00:17 → 00:15`, `00:44 → 00:30`), in **UTC** (Unix epoch). For a `4h` interval the boundaries are `00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC` — they will look "uneven" if printed in a non-UTC-multiple local zone; use `toISOString()`/`toUTCString()` in callbacks to see true aligned boundaries.

### 5.4 Look-ahead bias protection

The fetch functions ([§11](#11-exchange-data-api--candle-math)) all compute timestamps relative to the current virtual `when` and exclude the in-progress (pending) candle:

- `getCandles` returns the half-open range `[since, alignedWhen)` — the candle *at* `alignedWhen` is **not** returned (it is still open).
- `getNextCandles` (backtest only) returns `[alignedWhen, …)` going forward — throws in live mode to prevent look-ahead.
- `getRawCandles` supports flexible `(limit, sDate, eDate)` combinations, all validated so `eDate <= when`.

It is therefore structurally impossible for a strategy to observe data from after its current tick.

### 5.5 Interval throttling

`getSignal` is throttled to the strategy `interval` (default `"1m"`; one of `"1m" | "3m" | "5m" | "15m" | "30m" | "1h"`). Even if the engine ticks every minute, `getSignal` is invoked at most once per interval window. Ping callbacks (`onActivePing`, `onSchedulePing`, `onIdlePing`) fire **every minute regardless of interval**, so position management can be finer-grained than signal generation.

---

## 6. Schema registration reference

All `addXxxSchema` functions register a configuration object under a string name. Each has a matching `overrideXxxSchema` (replace an existing registration), `getXxxSchema` (retrieve the raw schema), and `listXxxSchema` (list registered names). Registration is idempotent on the name.

| Domain | Add | Override | Get | List |
| --- | --- | --- | --- | --- |
| Exchange | `addExchangeSchema` | `overrideExchangeSchema` | `getExchangeSchema` | `listExchangeSchema` |
| Strategy | `addStrategySchema` | `overrideStrategySchema` | `getStrategySchema` | `listStrategySchema` |
| Frame | `addFrameSchema` | `overrideFrameSchema` | `getFrameSchema` | `listFrameSchema` |
| Risk | `addRiskSchema` | `overrideRiskSchema` | `getRiskSchema` | `listRiskSchema` |
| Sizing | `addSizingSchema` | `overrideSizingSchema` | `getSizingSchema` | `listSizingSchema` |
| Walker | `addWalkerSchema` | `overrideWalkerSchema` | `getWalkerSchema` | `listWalkerSchema` |
| Action | `addActionSchema` | `overrideActionSchema` | `getActionSchema` | — |

### 6.1 Exchange schema — `addExchangeSchema(schema: IExchangeSchema)`

The data source. Only `exchangeName` and `getCandles` are required; everything else has defaults.

```typescript
interface IExchangeSchema {
  exchangeName: ExchangeName;                  // unique id
  note?: string;
  // REQUIRED — fetch OHLCV; backtest flag tells you whether you may use sliced historical data
  getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number, backtest: boolean)
    => Promise<IPublicCandleData[]>;
  // OPTIONAL — default Binance precision (2 dp price, 8 dp quantity) if omitted
  formatPrice?:    (symbol: string, price: number, backtest: boolean) => Promise<string>;
  formatQuantity?: (symbol: string, quantity: number, backtest: boolean) => Promise<string>;
  // OPTIONAL — throw-if-called if omitted
  getOrderBook?:        (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => Promise<IOrderBookData>;
  getAggregatedTrades?: (symbol: string, from: Date, to: Date, backtest: boolean) => Promise<IAggregatedTradeData[]>;
  callbacks?: Partial<{
    onCandleData: (symbol, interval, since, limit, data) => void | Promise<void>;
  }>;
}
```

`CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "1d"`.

**Adapter contract for `getCandles`** (enforced by validation):
- First returned candle's `timestamp` must equal the aligned `since`.
- Exactly `limit` candles must be returned.
- Timestamps must be sequential: `since + i * stepMs` for `i = 0 … limit-1`.

Data types:

```typescript
interface IPublicCandleData { timestamp; open; high; low; close; volume; }  // all number | undefined
interface ICandleData       { timestamp: number; open; high; low; close; volume: number; } // all required
interface IBidData          { price: string; quantity: string; }
interface IOrderBookData     { symbol: string; bids: IBidData[]; asks: IBidData[]; }
interface IAggregatedTradeData { id: string; price: number; qty: number; timestamp: number; isBuyerMaker: boolean; }
```

`formatPrice`/`formatQuantity` may return synchronously or as a `Promise` — both are accepted.

### 6.2 Strategy schema — `addStrategySchema(schema: IStrategySchema)`

```typescript
interface IStrategySchema {
  strategyName: StrategyName;          // unique id
  note?: string;
  interval?: SignalInterval;           // throttle for getSignal; default "1m"
  // Returns a signal DTO or null. `when` and `currentPrice` are supplied by the engine.
  getSignal?: (symbol: string, when: Date, currentPrice: number) => Promise<ISignalDto | null>;
  callbacks?: Partial<IStrategyCallbacks>;
  riskName?: RiskName;                 // single risk profile
  riskList?: RiskName[];               // multiple risk profiles (all must pass)
  actions?: ActionName[];              // attached action handlers (see §22)
  info?: RuntimeData;                  // arbitrary Record<string, unknown> surfaced in getRuntimeInfo()
}

type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
type RuntimeData = Record<string, unknown>;
```

**`ISignalDto`** — what `getSignal` returns:

```typescript
interface ISignalDto {
  id?: string;                  // auto-generated UUID v4 if omitted
  symbol?: string;
  position: "long" | "short";
  note?: string;
  priceOpen?: number;           // provided → scheduled entry; omitted → immediate at VWAP
  priceTakeProfit: number;      // long: > priceOpen ; short: < priceOpen
  priceStopLoss: number;        // long: < priceOpen ; short: > priceOpen
  minuteEstimatedTime?: number; // Infinity = no timeout; default CC_MAX_SIGNAL_LIFETIME_MINUTES (1440)
  cost?: number;                // entry cost in USD; default CC_POSITION_ENTRY_COST (100)
}
```

**`IStrategyCallbacks`** — all optional, all receive `when: Date` and `backtest: boolean`. The argument order in `v13.6.0` is shown below (note: `when` precedes `backtest`, and partial callbacks pass the percent *before* `currentPrice`):

```typescript
interface IStrategyCallbacks {
  onTick:    (symbol, result: IStrategyTickResult, currentPrice, when, backtest) => void | Promise<void>;
  onOpen:    (symbol, data: IPublicSignalRow, currentPrice, when, backtest) => void | Promise<void>;
  onActive:  (symbol, data: IPublicSignalRow, currentPrice, when, backtest) => void | Promise<void>;
  onIdle:    (symbol, currentPrice, when, backtest) => void | Promise<void>;
  onClose:   (symbol, data: IPublicSignalRow, priceClose, when, backtest) => void | Promise<void>;
  onSchedule:(symbol, data: IPublicSignalRow, currentPrice, when, backtest) => void | Promise<void>;
  onCancel:  (symbol, data: IPublicSignalRow, currentPrice, when, backtest) => void | Promise<void>;
  onWrite:   (symbol, data: ISignalRow | null, currentPrice, when, backtest) => void;
  onPartialProfit: (symbol, data, revenuePercent, currentPrice, when, backtest) => void | Promise<void>;
  onPartialLoss:   (symbol, data, lossPercent,   currentPrice, when, backtest) => void | Promise<void>;
  onBreakeven:     (symbol, data, currentPrice, when, backtest) => void | Promise<void>;
  // Fire EVERY minute regardless of `interval` — the right place for dynamic management:
  onSchedulePing:  (symbol, data, currentPrice, when, backtest) => void | Promise<void>;
  onActivePing:    (symbol, data, currentPrice, when, backtest) => void | Promise<void>;
}
```

Use `onActivePing` to call `commitAverageBuy` / `commitPartialProfit` / `commitTrailingStop` / `commitBreakeven` against the live position ([§9](#9-commit-functions)).

### 6.3 Frame schema — `addFrameSchema(schema: IFrameSchema)`

Defines the backtest period. (Live mode ignores frames — it uses the wall clock.)

```typescript
interface IFrameSchema {
  frameName: FrameName;        // unique id
  note?: string;
  interval?: FrameInterval;    // tick granularity; default "1m"
  startDate: Date;             // inclusive
  endDate: Date;               // inclusive
  callbacks?: Partial<{
    onTimeframe: (timeframe: Date[], startDate: Date, endDate: Date, interval: FrameInterval) => void | Promise<void>;
  }>;
}

type FrameInterval =
  "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d";
```

The number of generated ticks corresponds to `(endDate - startDate) / interval`. For a 1-day frame at `1m` granularity that is ~1440 ticks. The `interval` here is the engine's *step size*, independent of any `getCandles` interval you request inside `getSignal`.

### 6.4 Risk schema — see [§16](#16-risk-management)
### 6.5 Sizing schema — see [§15](#15-position-sizing)
### 6.6 Walker schema — see [§13.3](#133-walker)
### 6.7 Action schema — see [§22](#22-actions-pluggable-event-handlers)

---

## 7. Signal lifecycle & tick results

### 7.1 State machine

A signal moves through a type-safe state machine. Each tick yields exactly one `IStrategyTickResult` discriminated on `action`:

```
idle ──getSignal──▶ scheduled ──price reaches priceOpen──▶ opened ──▶ active ──▶ closed
  │                     │                                                            ▲
  │                     └── timeout / SL-before-entry ─▶ cancelled                   │
  └── getSignal (no priceOpen) ───────────────────────▶ opened ────────────────────┘
```

- `idle` — no active or scheduled signal this tick.
- `scheduled` — a limit/grid signal was just created and is waiting for `priceOpen`.
- `waiting` — emitted on subsequent ticks while a scheduled signal is still waiting (distinct from the one-time `scheduled`).
- `opened` — a position just became active (either immediate, or a scheduled signal that activated).
- `active` — an open position is being monitored (carries `percentTp`, `percentSl`, `pnl`).
- `closed` — position exited (carries `closeReason`, `closeTimestamp`, `pnl`).
- `cancelled` — a scheduled signal never activated (carries `reason`).

### 7.2 Tick result union

```typescript
type IStrategyTickResult =
  | IStrategyTickResultIdle       // { action: "idle"; signal: null; currentPrice; … }
  | IStrategyTickResultScheduled  // { action: "scheduled"; signal: IPublicSignalRow; … }
  | IStrategyTickResultWaiting    // { action: "waiting"; signal; percentTp:0; percentSl:0; pnl; … }
  | IStrategyTickResultOpened     // { action: "opened"; signal; currentPrice; … }
  | IStrategyTickResultActive     // { action: "active"; signal; percentTp; percentSl; pnl; … }
  | IStrategyTickResultClosed     // { action: "closed"; signal; closeReason; closeTimestamp; pnl; … }
  | IStrategyTickResultCancelled; // { action: "cancelled"; signal; reason; closeTimestamp; … }

type StrategyCloseReason  = "time_expired" | "take_profit" | "stop_loss" | "closed";
type StrategyCancelReason = "timeout" | "price_reject" | "user";
```

Every variant carries `strategyName`, `exchangeName`, `frameName`, `symbol`, `currentPrice`, `backtest`, and `createdAt`. Use a type guard on `action` for type-safe field access:

```typescript
for await (const result of Backtest.run("BTCUSDT", config)) {
  if (result.action === "closed") {
    console.log(result.closeReason, result.pnl.pnlPercentage);
  }
}
```

`Backtest.run` yields `opened | scheduled | active | closed | cancelled` (an `active` result only appears when the frame is exhausted while a `minuteEstimatedTime: Infinity` position is still open). `Live.run` yields the full set including `idle`.

### 7.3 PNL object — `IStrategyPnL`

```typescript
interface IStrategyPnL {
  pnlPercentage: number;   // e.g. 1.5 = +1.5%
  priceOpen: number;       // entry adjusted for slippage + fees
  priceClose: number;      // exit adjusted for slippage + fees
  pnlCost: number;         // absolute USD P/L = pnlPercentage/100 * pnlEntries
  pnlEntries: number;      // total invested capital in USD (sum of all entry costs)
}
```

### 7.4 `IPublicSignalRow` — the signal object surfaced everywhere

`ISignalDto` (your input) is augmented into `ISignalRow` (internal) and exposed as `IPublicSignalRow` in events, callbacks, and analytics. Key public fields beyond the DTO:

```typescript
interface IPublicSignalRow extends ISignalRow {
  cost: number;                  // cost of the initial entry (not DCA)
  originalPriceOpen: number;     // entry at creation (unchanged by averaging)
  originalPriceStopLoss: number; // SL at creation (unchanged by trailing)
  originalPriceTakeProfit: number;// TP at creation (unchanged by trailing)
  partialExecuted: number;       // 0–100, sum of all partial-close percentages
  totalEntries: number;          // _entry.length (1 = no DCA)
  totalPartials: number;         // _partial.length (0 = no partial closes)
  pnl: IStrategyPnL;             // unrealized PNL at emission
  peakProfit: IStrategyPnL;      // best favorable excursion so far
  maxDrawdown: IStrategyPnL;     // worst adverse excursion so far
}
```

Internal `_`-prefixed fields (also present, useful when persisting/inspecting): `_entry[]` (DCA history `{ price, cost, timestamp }`), `_partial[]` (partial-close history `{ type, percent, currentPrice, costBasisAtClose, entryCountAtClose, timestamp }`), `_trailingPriceStopLoss`, `_trailingPriceTakeProfit`, `_peak`, `_fall`, `pendingAt`, `scheduledAt`.

### 7.5 Signal validation rules

Every signal is validated automatically before it is opened/scheduled. Failures throw with a detailed message (surfaced via `listenError` / `listenValidation`). The exported validators (`validateSignal`, `validateCommonSignal`, `validatePendingSignal`, `validateScheduledSignal`) implement these rules and can also be called standalone.

**Common rules (`validateCommonSignal`)** — applied to every signal:
- `priceOpen`, `priceTakeProfit`, `priceStopLoss` must each be a **finite, positive number**.
- Direction correctness:
  - LONG: `priceTakeProfit > priceOpen` **and** `priceStopLoss < priceOpen`.
  - SHORT: `priceTakeProfit < priceOpen` **and** `priceStopLoss > priceOpen`.
- Distance floors/ceilings (when configured):
  - TP distance ≥ `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` (default 0.5%) — must exceed slippage+fees so a trade can be net-profitable.
  - SL distance ≥ `CC_MIN_STOPLOSS_DISTANCE_PERCENT` (0.5%) — avoids instant stop-out on noise.
  - SL distance ≤ `CC_MAX_STOPLOSS_DISTANCE_PERCENT` (20%) — caps catastrophic single-signal loss.

**Immediate (pending) signals (`validatePendingSignal`)** — when `priceOpen` is omitted and the position opens now at `currentPrice`:
- LONG: rejects if `currentPrice <= priceStopLoss` (would instantly stop) or `currentPrice >= priceTakeProfit` (would instantly take profit).
- SHORT: rejects if `currentPrice >= priceStopLoss` or `currentPrice <= priceTakeProfit`.

**Scheduled signals (`validateScheduledSignal`)** — when `priceOpen` is provided:
- `priceOpen` must lie strictly **between** SL and TP so activation would not immediately close the position:
  - LONG: `priceStopLoss < priceOpen < priceTakeProfit`.
  - SHORT: `priceTakeProfit < priceOpen < priceStopLoss`.

```typescript
// ✅ valid LONG
{ position: "long", priceOpen: 50000, priceTakeProfit: 51000, priceStopLoss: 49000 }
// ❌ invalid LONG — throws (TP below open, SL above open)
{ position: "long", priceOpen: 50000, priceTakeProfit: 49000, priceStopLoss: 51000 }
// ✅ valid SHORT
{ position: "short", priceOpen: 50000, priceTakeProfit: 49000, priceStopLoss: 51000 }
```

### 7.6 Candle data validation

`validateCandles` (and the internal fetch path) reject incomplete/anomalous candles from the data source:
- Every OHLC value must be positive and finite (catches Binance incomplete-candle ~0 prices).
- With ≥ `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` (default 5) candles a **median** reference price is used; below that, a simple average — then any candle whose price is more than `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` (default 1000×) below the reference is rejected as an anomaly.
- First-timestamp + exact-count + sequential-timestamp checks (the adapter contract from [§6.1](#61-exchange-schema--addexchangeschemaschema-iexchangeschema)) are enforced on `getCandles`, `getNextCandles`, `getRawCandles`, and the cache layer.

`getCandles` retries up to `CC_GET_CANDLES_RETRY_COUNT` (3) times with `CC_GET_CANDLES_RETRY_DELAY_MS` (5000 ms) between attempts; requests larger than `CC_MAX_CANDLES_PER_REQUEST` (1000) are paginated.

---

## 8. Strategy context functions

These are called from inside `getSignal` or a strategy callback. They read the execution + method context automatically (no `strategyName`/`exchangeName` arguments) and throw if no context is active. Import them as named functions from `backtest-kit`.

### 8.1 Signal & position queries

| Function | Signature | Returns |
| --- | --- | --- |
| `getPendingSignal` | `(symbol) => Promise<IPublicSignalRow \| null>` | The active open position, or `null`. |
| `getScheduledSignal` | `(symbol) => Promise<IPublicSignalRow \| null>` | The waiting scheduled signal, or `null`. |
| `hasNoPendingSignal` | `(symbol) => Promise<boolean>` | `true` if no open position. |
| `hasNoScheduledSignal` | `(symbol) => Promise<boolean>` | `true` if no scheduled signal. |
| `getBreakeven` | `(symbol, currentPrice) => Promise<boolean>` | `true` if price has cleared the breakeven threshold (covers fees+slippage). |
| `getStrategyStatus` | `(symbol) => Promise<StrategyStatus>` | Deferred-state snapshot (commit queue, created/closed/cancelled/activated signal, pendingSignalId). |
| `getTotalPercentClosed` | `(symbol) => Promise<number>` | % of position still held (100 = full, 0 = fully closed), DCA-aware. |
| `getTotalCostClosed` | `(symbol) => Promise<number>` | USD cost basis still held, DCA-aware. |
| `getLatestSignal` | `(symbol) => Promise<IPublicSignalRow \| null>` | Most recent signal (pending or closed) — useful for cooldown logic. |
| `getMinutesSinceLatestSignalCreated` | `(symbol) => Promise<number \| null>` | Whole minutes since the latest signal was created. |

```typescript
// Guard pattern inside getSignal:
addStrategySchema({
  strategyName: "guarded",
  getSignal: async (symbol, when, currentPrice) => {
    if (!(await hasNoPendingSignal(symbol))) return null;        // one position at a time
    const minutes = await getMinutesSinceLatestSignalCreated(symbol);
    if (minutes !== null && minutes < 240) return null;          // 4h cooldown after last signal
    return { position: "long", priceTakeProfit: currentPrice * 1.03, priceStopLoss: currentPrice * 0.99 };
  },
});
```

### 8.2 Meta functions

| Function | Signature | Notes |
| --- | --- | --- |
| `hasTradeContext` | `() => boolean` | `true` if both execution + method contexts are active. |
| `getDate` | `() => Promise<Date>` | Current virtual (backtest) or real (live) time. |
| `getTimestamp` | `() => Promise<number>` | Same as `getDate().getTime()`, via the time-meta service. |
| `getMode` | `() => Promise<"backtest" \| "live">` | |
| `getSymbol` | `() => Promise<string>` | Current symbol. |
| `getContext` | `() => Promise<{ strategyName; exchangeName; frameName }>` | Method context. |
| `getRuntimeInfo` | `<Data>() => Promise<IRuntimeInfo<Data>>` | Full snapshot: `{ symbol, context, backtest, range, currentPrice, info, when }`. |

### 8.3 `createSignalState` — typed per-signal accumulator (recommended)

Returns a bound `[getState, setState]` tuple scoped to a bucket and an active signal. Both resolve the signal and backtest flag from context — no `signalId` argument. Ideal for capitulation logic that accumulates per-trade metrics across `onActivePing` ticks.

```typescript
import { createSignalState } from "backtest-kit";

const [getTradeState, setTradeState] = createSignalState({
  bucketName: "trade",
  initialValue: { peakPercent: 0, minutesOpen: 0 },
});

// inside onActivePing:
await setTradeState((s) => ({
  peakPercent: Math.max(s.peakPercent, currentUnrealisedPercent),
  minutesOpen: s.minutesOpen + 1,
}));
const { peakPercent, minutesOpen } = await getTradeState();
if (minutesOpen >= 15 && peakPercent < 0.3) await commitClosePending(symbol); // capitulate
```

> `getSignalState(symbol, { bucketName, initialValue })` and `setSignalState(symbol, dispatch, { bucketName, initialValue })` are the lower-level equivalents and are **deprecated** in favour of `createSignalState`.

---

## 9. Commit functions

The **position-mutation API**. Called from `onActivePing` (or other callbacks) with `await`. All read context automatically. Mutations are queued and applied transactionally; in live mode each is intercepted by the `Broker` adapter *before* internal state changes ([§17](#17-broker-transactional-live-orders)).

### 9.1 Lifecycle commits

| Function | Signature | Effect |
| --- | --- | --- |
| `commitCreateSignal` | `(symbol, currentPrice, dto: ISignalDto) => Promise<void>` | Queue a user-supplied signal for the next tick instead of `getSignal`. |
| `commitClosePending` | `(symbol, payload?: Partial<CommitPayload>) => Promise<void>` | Close the open position now (`closeReason: "closed"`). |
| `commitCancelScheduled` | `(symbol, payload?: Partial<CommitPayload>) => Promise<void>` | Cancel the waiting scheduled signal (`reason: "user"`). |
| `commitActivateScheduled` | `(symbol, payload?: Partial<CommitPayload>) => Promise<void>` | Force-activate the scheduled signal at the current price without waiting for `priceOpen`. |
| `commitSignalNotify` | `(symbol, payload: SignalNotificationPayload) => Promise<void>` | Emit a user notification tied to the signal. |

`CommitPayload = { id: string; note: string }` (both optional via `Partial`).

### 9.2 DCA (dollar-cost averaging)

```typescript
commitAverageBuy(symbol: string, cost?: number): Promise<boolean>
```

Adds a new entry to the open position. `cost` defaults to `CC_POSITION_ENTRY_COST` ($100). **Default acceptance rule:** the entry is accepted only when `currentPrice` beats the all-time extreme since entry —
- LONG: accepted only when `currentPrice` is a new low (below every prior entry price);
- SHORT: accepted only when `currentPrice` is a new high (above every prior entry price).

This prevents averaging *up* (into a losing direction the wrong way). When rejected it returns `false` silently. Set `CC_ENABLE_DCA_EVERYWHERE: true` to relax the rule to "any price still beyond `priceOpen`" rather than a new extreme. Each accepted entry shifts the effective `priceOpen` (harmonic/cost-basis mean — see [§12](#12-pnl-dca--effective-price-math)), which in turn changes whether the next `commitAverageBuy` is accepted.

### 9.3 Partial closes

| Function | Signature | Effect |
| --- | --- | --- |
| `commitPartialProfit` | `(symbol, percentToClose: number) => Promise<boolean>` | Close `percentToClose` % (0–100) of the position at profit. Throws if price is not in profit direction. |
| `commitPartialLoss` | `(symbol, percentToClose: number) => Promise<boolean>` | Close `percentToClose` % at loss. |
| `commitPartialProfitCost` | `(symbol, dollarAmount: number) => Promise<boolean>` | Close a USD `dollarAmount` worth at profit. |
| `commitPartialLossCost` | `(symbol, dollarAmount: number) => Promise<boolean>` | Close a USD `dollarAmount` worth at loss. |

Returns `false` (skips) if closing would exceed 100% total closed, or if the precondition fails. By default a partial-profit only succeeds when price is moving toward TP and a partial-loss only when moving toward SL; set `CC_ENABLE_PPPL_EVERYWHERE: true` to allow mixing.

```typescript
addStrategySchema({
  strategyName: "scale-out",
  getSignal,
  callbacks: {
    onActivePing: async (symbol, data, currentPrice) => {
      const pct = await getPositionPnlPercent(symbol, currentPrice);
      if (pct !== null && pct >= 3) await commitPartialProfit(symbol, 33);
      if (pct !== null && pct >= 6) await commitPartialProfit(symbol, 33);
    },
  },
});
```

### 9.4 Trailing & breakeven

| Function | Signature | Effect |
| --- | --- | --- |
| `commitTrailingStop` | `(symbol, percentShift: number, currentPrice: number) => Promise<boolean>` | Move SL to a trailing distance `percentShift` % behind `currentPrice` (ratchets one way only). |
| `commitTrailingTake` | `(symbol, percentShift: number, currentPrice: number) => Promise<boolean>` | Adjust TP by `percentShift` % relative to `currentPrice`. |
| `commitTrailingStopCost` | `(symbol, newStopLossPrice: number) => Promise<boolean>` | Set the trailing SL to an absolute price. |
| `commitTrailingTakeCost` | `(symbol, newTakeProfitPrice: number) => Promise<boolean>` | Set the trailing TP to an absolute price. |
| `commitBreakeven` | `(symbol) => Promise<boolean>` | Move SL to entry (breakeven) once `getBreakeven(symbol, currentPrice)` would return `true`. |

The trailing SL never moves against the position (for LONG it only moves up, for SHORT only down). The original SL/TP are preserved in `originalPriceStopLoss`/`originalPriceTakeProfit`; the trailing values override them for exit evaluation. Set `CC_ENABLE_TRAILING_EVERYWHERE: true` to activate trailing without absorption conditions.

```typescript
callbacks: {
  onActivePing: async (symbol, data, currentPrice) => {
    if (await getBreakeven(symbol, currentPrice)) await commitBreakeven(symbol);
    await commitTrailingStop(symbol, 1.0, currentPrice); // 1% trailing stop
  },
}
```

---

## 10. Position analytics functions

A large family of read-only `getPosition*` functions describing the current open position. All read context automatically, take `(symbol)` (a few also take `currentPrice`), and return `null` when there is no pending signal. They are also available as methods on `Backtest`/`Live` (with explicit `(symbol, [currentPrice,] context)`), which is how you query a position from *outside* a strategy callback.

### 10.1 Composition & cost basis

| Function | Returns | Meaning |
| --- | --- | --- |
| `getPositionEffectivePrice` | `number \| null` | Weighted-average (cost-basis) entry price across all DCA entries. |
| `getPositionInvestedCount` | `number \| null` | Total base-asset units held (sum across DCA entries). |
| `getPositionInvestedCost` | `number \| null` | Total USD cost invested (sum of entry costs). |
| `getPositionEntries` | `Array<{ price; cost; timestamp }> \| null` | All entries; `[0]` is the original `priceOpen`. |
| `getPositionLevels` | `number[] \| null` | Just the entry prices; single-element `[priceOpen]` if no DCA. |
| `getPositionPartials` | `Array<{ type:"profit"\|"loss"; percent; currentPrice; costBasisAtClose; entryCountAtClose; timestamp }> \| null` | Partial-close history. |

### 10.2 Live PNL

| Function | Signature | Returns |
| --- | --- | --- |
| `getPositionPnlPercent` | `(symbol, currentPrice)` | Unrealized PNL % vs effective entry (fees/slippage/partials aware). |
| `getPositionPnlCost` | `(symbol, currentPrice)` | Unrealized PNL in USD. |

### 10.3 Timing

| Function | Returns | Meaning |
| --- | --- | --- |
| `getPositionEstimateMinutes` | `number \| null` | Original `minuteEstimatedTime`. |
| `getPositionCountdownMinutes` | `number \| null` | Remaining minutes before `time_expired` (clamped to 0). |
| `getPositionActiveMinutes` | `number \| null` | Minutes the position has been open. |
| `getPositionWaitingMinutes` | `number \| null` | Minutes a scheduled signal has been waiting for activation. |

### 10.4 Peak profit (best favorable excursion)

| Function | Returns |
| --- | --- |
| `getPositionHighestProfitPrice` | Best price seen in the profit direction. |
| `getPositionHighestProfitTimestamp` | When that peak occurred. |
| `getPositionHighestPnlPercentage` | Peak unrealized PNL %. |
| `getPositionHighestPnlCost` | Peak unrealized PNL in USD. |
| `getPositionHighestProfitMinutes` | Minutes from open to the peak. |
| `getPositionHighestProfitBreakeven` | Whether the peak ever cleared the breakeven threshold. |

### 10.5 Max drawdown (worst adverse excursion)

| Function | Returns |
| --- | --- |
| `getPositionDrawdownMinutes` | Minutes spent below the effective entry. |
| `getPositionMaxDrawdownPrice` | Worst price seen in the loss direction. |
| `getPositionMaxDrawdownTimestamp` | When that trough occurred. |
| `getPositionMaxDrawdownMinutes` | Minutes from open to the trough. |
| `getPositionMaxDrawdownPnlPercentage` | Worst unrealized PNL %. |
| `getPositionMaxDrawdownPnlCost` | Worst unrealized PNL in USD. |

### 10.6 Cross-section distances (peak ↔ trough analysis)

| Function | Meaning |
| --- | --- |
| `getPositionHighestMaxDrawdownPnlPercentage` / `…PnlCost` | The worst drawdown that occurred *after* the highest profit. |
| `getPositionHighestProfitDistancePnlPercentage` / `…PnlCost` | Distance between peak profit and the current/closing point. |
| `getMaxDrawdownDistancePnlPercentage` / `getMaxDrawdownDistancePnlCost` | Distance from the max-drawdown point. |

### 10.7 Overlap (DCA / partial spacing diagnostics)

| Function | Meaning |
| --- | --- |
| `getPositionEntryOverlap` | `(symbol, currentPrice, ladder?) => Promise<boolean>` — `true` if `currentPrice` falls within the spacing band of an existing DCA entry. |
| `getPositionPartialOverlap` | `(symbol, currentPrice, ladder?) => Promise<boolean>` — same, for partial-close prices. |

`ladder` is an `IPositionOverlapLadder` (`{ upperPercent, lowerPercent }`, default `POSITION_OVERLAP_LADDER_DEFAULT`). This is the **DCA-ladder spacing guard**: before adding a rung, check `getPositionEntryOverlap` and skip if it returns `true`, so entries are spaced at least `lowerPercent`/`upperPercent` apart (see the ladder recipe in [§22.5](#225-strategy-recipes) and the Mar/Apr 2026 examples in [§34](#34-strategy-examples-reference-implementations)).

---

## 11. Exchange data API & candle math

These functions fetch market data from the registered exchange, always relative to the current virtual `when`, always look-ahead-safe. Import them from `backtest-kit`; call from inside a strategy/callback (active context required).

### 11.1 Functions

| Function | Signature | Notes |
| --- | --- | --- |
| `getCandles` | `(symbol, interval, limit) => Promise<ICandleData[]>` | `limit` candles **backwards** from aligned `when`. Range `[since, alignedWhen)`. |
| `getNextCandles` | `(symbol, interval, limit) => Promise<ICandleData[]>` | `limit` candles **forwards** from aligned `when`. **Backtest only** — throws in live (look-ahead). Range `[alignedWhen, …)`. |
| `getRawCandles` | `(symbol, interval, limit?, sDate?, eDate?) => Promise<ICandleData[]>` | Flexible date/limit combos (see below). |
| `getAveragePrice` | `(symbol) => Promise<number>` | VWAP of last `CC_AVG_PRICE_CANDLES_COUNT` 1-minute candles. |
| `getClosePrice` | `(symbol, interval) => Promise<number>` | Close of the last completed candle for `interval`. |
| `getOrderBook` | `(symbol, depth?) => Promise<IOrderBookData>` | Depth defaults to `CC_ORDER_BOOK_MAX_DEPTH_LEVELS`. |
| `getAggregatedTrades` | `(symbol, limit?) => Promise<IAggregatedTradeData[]>` | No `limit` → one `CC_AGGREGATED_TRADES_MAX_MINUTES` window; with `limit` → paginates backwards then slices to most-recent `limit`. |
| `formatPrice` | `(symbol, price) => Promise<string>` | Exchange precision. |
| `formatQuantity` | `(symbol, quantity) => Promise<string>` | Exchange precision. |
| `hasTradeContext` | `() => boolean` | Guard before calling any of the above. |

### 11.2 `getRawCandles` parameter combinations

All combinations validate `eDate <= when` (look-ahead protection). `sDate`/`eDate` are epoch milliseconds.

1. `(limit)` — `since = alignedWhen - limit*stepMs`, range `[since, alignedWhen)`.
2. `(limit, sDate)` — `since = align(sDate)`, `limit` candles forward, range `[since, since + limit*stepMs)`.
3. `(limit, undefined, eDate)` — `since = align(eDate) - limit*stepMs`, range `[since, eDate)` (**eDate exclusive**).
4. `(undefined, sDate, eDate)` — `limit` computed from range, **sDate inclusive, eDate exclusive**, range `[sDate, eDate)`.
5. `(limit, sDate, eDate)` — `since = align(sDate)`, `limit` candles, sDate inclusive.

### 11.3 Timestamp alignment math (worked example)

```
// 15-minute interval, when = 00:12:00
stepMs      = 15 * 60000 = 900000
alignedWhen = floor(when / stepMs) * stepMs = 00:00:00
// getCandles("BTCUSDT","15m",4):
since = alignedWhen - 4*stepMs = 23:00:00 (prev day)
// returns timestamps: 23:00, 23:15, 23:30, 23:45  — the 00:00 candle is EXCLUDED (still open)
```

**Why exclude the pending candle:** at `when = 00:12`, the `00:00` candle covers `[00:00, 00:15)` and is incomplete; its OHLCV would distort indicators. Only fully-closed candles are returned. Validation (first-timestamp + count) is applied uniformly across `getCandles`, `getNextCandles`, `getRawCandles`, and the cache layer.

### 11.4 Order book & aggregated trades windows

**Order book** uses a configurable time offset rather than candle intervals:
```
offsetMs  = CC_ORDER_BOOK_TIME_OFFSET_MINUTES * 60000   // default 10 min
alignedTo = floor(when / offsetMs) * offsetMs
to = alignedTo ; from = alignedTo - offsetMs
// adapter receives (symbol, depth, from, to, backtest)
```
Most exchanges expose only the *current* book (Binance `GET /api/v3/depth`), so for backtest you supply your own snapshot storage; live adapters may ignore `from`/`to`.

**Aggregated trades** are aligned to the 1-minute boundary; `to = align(when, 1m)`, window = `CC_AGGREGATED_TRADES_MAX_MINUTES`. With a `limit`, the engine paginates backwards in window-sized chunks until `limit` is collected, then slices to the most recent `limit`. Compatible with `garch` and `volume-anomaly` which accept the same `from`/`to` format.

### 11.5 Candle cache

`warmCandles`, `checkCandles`, `cacheCandles` (exported) pre-warm and validate a persistent candle cache. The cache uses the **identical timestamp math** as the runtime fetch path: a lookup computes the expected `since + i*stepMs` timestamps and returns all candles if present, `null` on any miss. `CC_ENABLE_CANDLE_FETCH_MUTEX` (default `true`) serializes concurrent fetches of the same candles to avoid redundant API calls.

---

## 12. PNL, DCA & effective-price math

> No mathematical knowledge is required to *use* the framework — this section documents the internal model so generated code and reports can be reasoned about precisely.

To reduce position linearity, each DCA entry is by default a fixed **$100 unit** (`CC_POSITION_ENTRY_COST`, overridable per-entry via `ISignalDto.cost` or per-call via `commitAverageBuy(symbol, cost)`).

Three public functions drive position management dynamically:
- `commitAverageBuy` — adds a DCA entry (default: only when price beats the all-time extreme since entry).
- `commitPartialProfit` — closes X% at profit (locks gains, keeps exposure).
- `commitPartialLoss` — closes X% at loss (cuts exposure before SL).

### 12.1 Effective `priceOpen`

`priceOpen` is the **cost-basis (harmonic) mean** of all accepted DCA entries. After every partial close the remaining cost basis is carried forward into the mean for subsequent entries, so the effective `priceOpen` shifts after each partial — which feeds back into whether the next `commitAverageBuy` is accepted. The *physical* entry prices are never altered by sells (`getEffectivePriceOpen` exposes the computation; `costBasisAtClose` is the accounting snapshot stored on each partial).

### 12.2 Worked scenario

**Scenario:** LONG entry @ 1000, 4 DCA attempts (1 rejected), 3 partials, closed at TP. `totalInvested = $400` (4 × $100; the rejected attempt is not counted).

```
entry#1 @ 1000  → 0.10000 coins
  commitPartialProfit(30%) @ 1150          ← entryCountAtClose = 1
entry#2 @ 950   → 0.10526 coins
entry#3 @ 880   → 0.11364 coins
  commitPartialLoss(20%)   @ 860           ← entryCountAtClose = 3
entry#4 @ 920   → 0.10870 coins
  commitPartialProfit(40%) @ 1050          ← entryCountAtClose = 4
entry#5 @ 980   ✗ REJECTED (980 > effectivePrice₃ ≈ 929.92)
```

**Partial #1 — profit @ 1150, 30%, cnt=1**
```
effectivePrice = 1000 ; costBasis = $100
partialDollarValue = 30% × 100 = $30  → weight = 30/400 = 0.075
pnl = (1150−1000)/1000 × 100 = +15.00%
costBasis → $70 ; coins sold 0.03000 ; remaining 0.07000
```

**After #1:** entry#2 @ 950 (✓ <1000), entry#3 @ 880 (✓ <1000). coins = 0.07000 + 0.10526 + 0.11364 = 0.28890

**Partial #2 — loss @ 860, 20%, cnt=3**
```
costBasis = 70 + 100 + 100 = $270 ; effectivePrice₂ = 270/0.28890 ≈ 934.58
partialDollarValue = 20% × 270 = $54  → weight = 54/400 = 0.135
pnl = (860−934.58)/934.58 × 100 ≈ −7.98%
costBasis → $216 ; remaining 0.23112
```

**After #2:** entry#4 @ 920 (✓ <934.58). coins = 0.23112 + 0.10870 = 0.33982

**Partial #3 — profit @ 1050, 40%, cnt=4**
```
costBasis = 216 + 100 = $316 ; effectivePrice₃ = 316/0.33982 ≈ 929.92
partialDollarValue = 40% × 316 = $126.4  → weight = 126.4/400 = 0.316
pnl = (1050−929.92)/929.92 × 100 ≈ +12.91%
costBasis → $189.6 ; remaining 0.20389
```

entry#5 @ 980 rejected (980 > 929.92).

**Close at TP @ 1200**
```
effectivePrice_final = 929.92 (no new entries) ; remaining dollar value = 400−30−54−126.4 = $189.6
weight = 189.6/400 = 0.474 ; pnl = (1200−929.92)/929.92 × 100 ≈ +29.04%
```

**Result (`toProfitLossDto`):**
```
0.075 × (+15.00) = +1.125
0.135 × (−7.98)  = −1.077
0.316 × (+12.91) = +4.080
0.474 × (+29.04) = +13.765
────────────────────────────
                ≈ +17.89%
Cross-check (coins): 34.50 + 49.69 + 142.72 + 244.67 = $471.58 → (471.58−400)/400 ≈ +17.90% ✓
```

### 12.3 Cost-basis replay algorithm

The weighted PNL is `Σ(weightᵢ × pnlᵢ)`. Weights come from a running cost-basis replay through all partials in order:

```
costBasis = 0
for each partial[i]:
  newEntries  = entryCountAtClose[i] - entryCountAtClose[i-1]   // 0 for i = 0
  costBasis  += newEntries * CC_POSITION_ENTRY_COST
  dollarValue = (percent[i] / 100) * costBasis                  // correct running basis
  costBasis  *= (1 - percent[i] / 100)                          // reduce after each close
weightᵢ = dollarValueᵢ / totalInvested
```

The remaining (final) close gets `weight = remainingDollarValue / totalInvested`. Helpers `toProfitLossDto`, `getEffectivePriceOpen`, `getTotalClosed`, `getPriceScale`, and `computeEffectivePriceAtPartial` (internal) implement this. Fees (`CC_PERCENT_FEE`, default 0.1% per side) and slippage (`CC_PERCENT_SLIPPAGE`, default 0.1% per side) are applied to entry and exit prices in `IStrategyPnL.priceOpen`/`priceClose`.

---

## 13. Runners: Backtest, Live, Walker

### 13.1 `Backtest`

Singleton with per-`(symbol, strategy, exchange, frame)` memoized instances.

| Method | Signature | Notes |
| --- | --- | --- |
| `run` | `(symbol, { strategyName, exchangeName, frameName }) => AsyncGenerator<IStrategyBacktestResult>` | Pull-based; validates schemas, clears prior state, yields each closed/cancelled/opened result. |
| `background` | `(symbol, ctx) => () => void` | Fire-and-forget; returns a graceful-stop closure. Throws if already running for this key. |
| `stop` | `(symbol, strategyName) => Promise<void>` | Graceful stop: current position completes, no new signals, then `listenDoneBacktest` fires. |
| `list` | `() => Promise<Array<{ id; symbol; strategyName; exchangeName; frameName; status }>>` | All instances; `status ∈ "ready" \| "pending" \| "fulfilled" \| "rejected"`. |
| `getStatus` | (per instance) | Single instance status. |
| `getData` | `(strategyName) => Promise<BacktestStatisticsModel>` | Raw statistics. |
| `getReport` | `(strategyName) => Promise<string>` | Markdown report. |
| `dump` | `(symbol, { strategyName, exchangeName, frameName }, path?, columns?) => Promise<void>` | Write report to disk (default `./dump/backtest/{strategyName}.md`). Takes the full context object, not just the strategy name. |

`Backtest` also exposes the full position-query family as methods (explicit context form): `getPendingSignal(symbol, currentPrice, ctx)`, `getScheduledSignal`, `hasNoPendingSignal(symbol, ctx)`, `hasNoScheduledSignal`, `getBreakeven(symbol, currentPrice, ctx)`, `getTotalPercentClosed`, `getTotalCostClosed`, and every `getPosition*` from [§10](#10-position-analytics-functions). Use these to inspect a running backtest from outside a callback.

```typescript
import { Backtest, listenDoneBacktest } from "backtest-kit";

const stop = Backtest.background("BTCUSDT", { strategyName: "my", exchangeName: "binance", frameName: "1d" });
listenDoneBacktest(async (e) =>
  await Backtest.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }));
// later — graceful early exit:
await Backtest.stop("BTCUSDT", "my");
```

> **`dump` takes the context object.** `Backtest.dump`, `Live.dump`, `Partial.dump`, `Risk.dump`, `Schedule.dump`, `Breakeven.dump`, etc. all take `(symbol, { strategyName, exchangeName, frameName }, path?)`. The `listenDone*` / `listen*` event objects carry exactly those fields, so the idiom is to spread them straight from the event. (Earlier examples in this document showing `dump(symbol, strategyName)` are shorthand — the real call passes the context object.)

**`BacktestStatisticsModel`** (`getData`):

```typescript
{
  signalList: IStrategyTickResultClosed[];  // all closed signals
  totalSignals: number; winCount: number; lossCount: number;
  winRate: number | null;        // %
  avgPnl: number | null;         // %
  totalPnl: number | null;       // %
  stdDev: number | null;
  sharpeRatio: number | null;            // avgPnl / stdDev
  annualizedSharpeRatio: number | null;  // sharpe × √tradesPerYear
  certaintyRatio: number | null;         // avgWin / |avgLoss|
  expectedYearlyReturns: number | null;
}
```

### 13.2 `Live`

Same surface as `Backtest` but context is `{ strategyName, exchangeName }` (no frame), `run` is an **infinite** async generator with crash recovery, and reports live at `./dump/live/{strategyName}.md`.

| Method | Signature |
| --- | --- |
| `run` | `(symbol, { strategyName, exchangeName }) => AsyncGenerator<IStrategyTickResult>` |
| `background` | `(symbol, ctx) => () => void` |
| `stop` | `(symbol, strategyName) => Promise<void>` |
| `list` | `() => Promise<Array<{ id; symbol; strategyName; exchangeName; status }>>` |
| `getData` | `(strategyName) => Promise<LiveStatisticsModel>` |
| `getReport` / `dump` | as Backtest |

`LiveStatisticsModel` adds `eventList: TickEvent[]`, `totalEvents`, `totalClosed` to the same win/PNL/Sharpe fields. Crash recovery: if the process dies, restarting with the same code restores pending + scheduled signals, partial levels, breakeven flags, and the strategy commit queue from disk — no duplicate signals.

`getStatus()` returns `{ id, symbol, strategyName, exchangeName, status }`. The position-query family is also available as `Live.getPositionPnlPercent(symbol, currentPrice, { strategyName, exchangeName })` etc.

### 13.3 Walker

A/B-tests multiple strategies on the same symbol/exchange/frame and ranks them.

```typescript
interface IWalkerSchema {
  walkerName: WalkerName;
  note?: string;
  exchangeName: ExchangeName;
  frameName: FrameName;
  strategies: StrategyName[];        // must be registered
  metric?: WalkerMetric;             // default "sharpeRatio"
  callbacks?: Partial<{
    onStrategyStart:    (strategyName, symbol) => void | Promise<void>;
    onStrategyComplete: (strategyName, symbol, stats: BacktestStatisticsModel, metric: number | null) => void | Promise<void>;
    onStrategyError:    (strategyName, symbol, error) => void | Promise<void>;
    onComplete:         (results: IWalkerResults) => void | Promise<void>;
  }>;
}

type WalkerMetric =
  | "sharpeRatio"            // default
  | "annualizedSharpeRatio"
  | "winRate"
  | "totalPnl"
  | "certaintyRatio"
  | "avgPnl"
  | "expectedYearlyReturns"; // higher is always better — the metric is maximized
```

| Method | Signature |
| --- | --- |
| `run` | `(symbol, { walkerName }) => AsyncGenerator<…>` |
| `background` | `(symbol, { walkerName }) => () => void` |
| `stop` | `(symbol, walkerName) => Promise<void>` (early termination: current strategy finishes, remaining skipped, `listenWalkerComplete` fires with partial results) |
| `getData` | `(symbol, walkerName) => Promise<IWalkerResults>` |
| `getReport` | `(symbol, walkerName) => Promise<string>` |
| `dump` | `(symbol, walkerName, path?) => Promise<void>` |
| `list` | `() => Promise<Array<{ symbol; walkerName; status }>>` |

`IWalkerResults`: `{ bestStrategy, bestMetric, strategies: IWalkerStrategyResult[], symbol, exchangeName, walkerName, frameName }`, where each `IWalkerStrategyResult = { strategyName, stats: BacktestStatisticsModel, metric: number | null, rank: number }` (rank 1 = best). The comparison table shows the top `CC_WALKER_MARKDOWN_TOP_N` (default 10) strategies.

```typescript
addWalkerSchema({
  walkerName: "btc-walker",
  exchangeName: "binance",
  frameName: "1d",
  strategies: ["strategy-a", "strategy-b", "strategy-c"],
  metric: "sharpeRatio",
  callbacks: {
    onStrategyComplete: async (name, symbol, stats) => {
      if ((stats.sharpeRatio ?? 0) > 2.0) await Walker.stop("BTCUSDT", "btc-walker"); // good enough
    },
    onComplete: (r) => console.log("best:", r.bestStrategy, r.bestMetric),
  },
});
Walker.background("BTCUSDT", { walkerName: "btc-walker" });
listenWalkerComplete((r) => Walker.dump("BTCUSDT", r.walkerName));
```

### 13.4 Graceful shutdown & task monitoring

`Backtest.stop` / `Live.stop` / `Walker.stop` are graceful: the current signal/strategy completes naturally (callbacks fire, state persists in live), no forced close, then the corresponding `listenDone*` / `listenWalkerComplete` event fires and the task status transitions `pending → fulfilled`. `list()` lets you build a monitoring dashboard. The top-level `shutdown()` function ([§23](#23-event-listeners)) waits until no `Backtest`/`Live` task is `pending`, then emits the shutdown event for cleanup — the clean way to handle `SIGINT`.

```typescript
process.on("SIGINT", () => shutdown());
```

---

## 14. Analytics & reports

Every analytics class follows the same trio: `getData(...) → model`, `getReport(...) → markdown string`, `dump(..., path?) → writes file`. Default dump paths are under `./dump/<domain>/`.

> The complete catalog of all 13 markdown reports — exact titles, default paths, what feeds each, and row caps — is in [§37](#37-markdown-report-catalog).

### 14.1 `Heat` — portfolio heatmap across symbols

`Heat.getData(strategyName)`, `Heat.getReport(strategyName)`, `Heat.dump(strategyName, path?)`. Run a backtest per symbol first, then aggregate.

The per-symbol row (`IHeatmapRow`) is far richer than win/loss basics — it includes (all `number | null` unless noted):

`totalPnl, sharpeRatio, maxDrawdown, totalTrades, winCount, lossCount, winRate, avgPnl, stdDev, profitFactor, avgWin, avgLoss, maxWinStreak, maxLossStreak, expectancy, avgPeakPnl, avgFallPnl, peakProfitPnl, maxDrawdownPnl, avgDuration, medianPnl, avgConsecutiveWinPnl, avgConsecutiveLossPnl, avgWinDuration, avgLossDuration, sortinoRatio, calmarRatio, recoveryFactor, annualizedSharpeRatio, certaintyRatio, expectedYearlyReturns, tradesPerYear, medianStepSize, buyerPressure, sellerPressure, buyerStrength, sellerStrength, pressureImbalance, trend ("bullish"|"bearish"|"sideways"|"neutral"|null), trendStrength, trendConfidence`.

The aggregate (`IHeatmapStatistics`) wraps `symbols: IHeatmapRow[]` plus `totalSymbols`, `portfolioTotalPnl`, `portfolioSharpeRatio`, `portfolioTotalTrades`. Symbols are sorted by Sharpe.

```typescript
for (const symbol of ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]) {
  for await (const _ of Backtest.run(symbol, { strategyName: "my", exchangeName: "binance", frameName: "2024" })) {}
}
await Heat.dump("my"); // → ./dump/heatmap/my.md
```

Selected column meanings: **Profit Factor** = Σ wins / Σ losses (>1 profitable); **Expectancy** = (winRate·avgWin) − (lossRate·|avgLoss|); **Sortino** = avgPnl / downside-deviation; **Calmar / Recovery** = totalPnl / maxDrawdown; **trend** is a bivariate (slope × R²) classification of the log-price regression with `trendStrength` (%/day slope) and `trendConfidence` (R²).

### 14.2 `Schedule` — scheduled-signal stats

`Schedule.getData(strategyName)`, `getReport`, `dump`, `clear(strategyName)`.

`ScheduleStatisticsModel`: `{ eventList: ScheduledEvent[], totalEvents, totalScheduled, totalOpened, totalCancelled, cancellationRate (%, null — lower is better), activationRate (%, null — higher is better), avgWaitTime (min, null — for cancelled signals), avgActivationTime (min, null — for opened signals) }`. Each `ScheduledEvent.action` is `"scheduled" | "opened" | "cancelled"` (`"opened"` = a scheduled signal that activated). The report tabulates these events with entry/TP/SL and wait/activation time.

### 14.3 `Partial` — partial profit/loss milestone stats

`Partial.getData(symbol)`, `getReport`, `dump(symbol, path?)` (default `./dump/partial/{symbol}.md`).

`PartialStatisticsModel`: `{ eventList: PartialEvent[], totalEvents, totalProfit, totalLoss }`. Each `PartialEvent` records `{ timestamp, action: "PROFIT"|"LOSS", symbol, signalId, position, level, price, mode }`. Milestone levels are emitted exactly once per signal (deduplicated, crash-safe). Max `CC_MAX_PARTIAL_MARKDOWN_ROWS` (default 250) events retained.

**Report samples** (markdown produced by `getReport`/`dump`):

*Heatmap* (`Heat`):
```markdown
# Portfolio Heatmap: my-strategy
**Total Symbols:** 4 | **Portfolio PNL:** +45.30% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120

| Symbol | Total PNL | Sharpe | PF | Expect | WR | Avg Win | Avg Loss | Max DD | W Streak | L Streak | Trades |
|--------|-----------|--------|----|--------|----|---------|----------|--------|----------|----------|--------|
| BTCUSDT | +15.50% | 2.10 | 2.50 | +1.85% | 72.3% | +2.45% | -0.95% | -2.50% | 5 | 2 | 45 |
| ETHUSDT | +12.30% | 1.85 | 2.15 | +1.45% | 68.5% | +2.10% | -1.05% | -3.10% | 4 | 2 | 38 |
```

*Partial* (`Partial`):
```markdown
# Partial Profit/Loss Report: BTCUSDT
| Action | Symbol | Signal ID | Position | Level % | Current Price | Timestamp | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PROFIT | BTCUSDT | abc123 | LONG | +10% | 51500.00 USD | 2024-01-15T10:30:00.000Z | Backtest |
| LOSS   | BTCUSDT | def456 | SHORT | -10% | 51500.00 USD | 2024-01-15T14:00:00.000Z | Backtest |

**Total events:** 15  **Profit events:** 10  **Loss events:** 5
```

*Scheduled signals* (`Schedule`):
```markdown
# Scheduled Signals Report: my-strategy
| Timestamp | Action | Symbol | Signal ID | Position | Current Price | Entry Price | Take Profit | Stop Loss | Wait Time (min) |
|-----------|--------|--------|-----------|----------|---------------|-------------|-------------|-----------|-----------------|
| 2024-01-15T10:30:00Z | SCHEDULED | BTCUSDT | sig-001 | LONG | 42150.50 USD | 42000.00 USD | 43000.00 USD | 41000.00 USD | N/A |
| 2024-01-15T10:35:00Z | CANCELLED | BTCUSDT | sig-002 | LONG | 42350.80 USD | 42000.00 USD | 43000.00 USD | 41000.00 USD | 60 |

**Scheduled:** 6  **Cancelled:** 2  **Cancellation rate:** 33.33% (lower is better)  **Avg wait (cancelled):** 45.50 min
```

### 14.4 `Position` — signal-DTO builders + open-position snapshot

`Position` has **two** roles. First, static **signal-DTO factories** used inside `getSignal` to derive `priceTakeProfit`/`priceStopLoss` from a percentage and the current price (you spread the result into your returned `ISignalDto`):

```typescript
Position.bracket({ position, currentPrice, percentTakeProfit, percentStopLoss })
//   → { position, priceTakeProfit, priceStopLoss } with both legs set from percentages
Position.moonbag({ position, currentPrice, percentStopLoss })
//   → same shape but TP fixed at +50% (a "let it run" wide target; you exit via trailing/close logic)
```

For `long`, `priceTakeProfit = currentPrice·(1 + pct/100)` and `priceStopLoss = currentPrice·(1 − pct/100)`; for `short` the signs invert. `moonbag` is the idiom across the reference strategies — open with a far TP + a hard SL, then manage the exit dynamically in `listenActivePing` (trailing take, target PNL, sentiment flip).

```typescript
return {
  ...Position.moonbag({ position: "long", currentPrice, percentStopLoss: 1.0 }),
  minuteEstimatedTime: Infinity,
};
```

Second, like [§10](#10-position-analytics-functions), `Position` also exposes the `getPosition*` analytics as a standalone utility for querying a live position outside a strategy callback.

### 14.5 `HighestProfit` & `MaxDrawdown` — excursion stats

Both follow `getData` / `getReport` / `dump`. `HighestProfit` tracks the best favorable excursion per signal (`HighestProfitStatisticsModel`, `HighestProfitEvent`); `MaxDrawdown` tracks the worst adverse excursion (`MaxDrawdownStatisticsModel`, `MaxDrawdownEvent`). Listen live via `listenHighestProfit` / `listenMaxDrawdown`. Retained rows: `CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS` / `CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS` (250 each).

### 14.6 `Risk` — risk-rejection stats

`Risk.getData`, `getReport`, `dump`. Records every rejection (`RiskStatisticsModel`, `RiskEvent`). Listen live via `listenRisk` / `listenRiskOnce`. Retained: `CC_MAX_RISK_MARKDOWN_ROWS` (250).

### 14.7 `Performance` — revenue profiling

`Performance` aggregates timing metrics (avg, min, max, stdDev, P95, P99) for bottleneck analysis (`PerformanceStatisticsModel`, `MetricStats`, `PerformanceMetricType`). Listen via `listenPerformance`. Retained: `CC_MAX_PERFORMANCE_MARKDOWN_ROWS` (10000 — higher because metrics are lightweight and benefit from larger samples).

### 14.8 `Sync` — order-sync stats — see [§19](#19-sync-order-synchronization)

### 14.9 `Lookup` — parallel-run coordination

`Lookup` tracks active `(symbol, context, backtest)` activities and exposes `Lookup.isParallel` (whether more than one workload is active). It drives the cooperative `CC_ENABLE_BACKTEST_PARALLEL_SPIN` interleaving so parallel backtests progress round-robin instead of one monopolizing the event loop.

---

## 15. Position sizing

Register sizing profiles with `addSizingSchema`, then compute sizes with the static `PositionSize` methods. Three methods, discriminated by `method`:

```typescript
type ISizingSchema =
  | ISizingSchemaFixedPercentage   // method: "fixed-percentage"; riskPercentage: number
  | ISizingSchemaKelly             // method: "kelly-criterion"; kellyMultiplier?: number (default 0.25)
  | ISizingSchemaATR;              // method: "atr-based"; riskPercentage: number; atrMultiplier?: number

interface ISizingSchemaBase {
  sizingName: SizingName;
  note?: string;
  maxPositionPercentage?: number;  // cap as % of account (0–100)
  minPositionSize?: number;        // absolute floor
  maxPositionSize?: number;        // absolute cap
  callbacks?: Partial<{ onCalculate: (quantity: number, params: ISizingCalculateParams) => void | Promise<void> }>;
}
```

```typescript
addSizingSchema({ sizingName: "conservative", method: "fixed-percentage", riskPercentage: 2, maxPositionPercentage: 10 });
addSizingSchema({ sizingName: "kelly-quarter", method: "kelly-criterion", kellyMultiplier: 0.25, maxPositionPercentage: 15 });
addSizingSchema({ sizingName: "atr-dynamic",  method: "atr-based", riskPercentage: 2, atrMultiplier: 2 });
```

`PositionSize` static methods (each takes the symbol, balance, prices/edge inputs, and `{ sizingName }`):

```typescript
PositionSize.fixedPercentage(symbol, accountBalance, priceOpen, priceStopLoss, { sizingName }): Promise<number>
PositionSize.kellyCriterion(symbol, accountBalance, priceOpen, winRate, winLossRatio, { sizingName }): Promise<number>
PositionSize.atrBased(symbol, accountBalance, priceOpen, atr, { sizingName }): Promise<number>
```

```typescript
const qty = await PositionSize.fixedPercentage("BTCUSDT", 10_000, 50_000, 49_000, { sizingName: "conservative" });
const qtyK = await PositionSize.kellyCriterion("BTCUSDT", 10_000, 50_000, 0.55, 1.5, { sizingName: "kelly-quarter" });
const qtyA = await PositionSize.atrBased("BTCUSDT", 10_000, 50_000, 500, { sizingName: "atr-dynamic" });
```

**When to use:** *Fixed %* — simple, consistent risk per trade (beginners, conservative). *Kelly* — optimal sizing given a measured edge; use fractional (0.25–0.5) to tame volatility. *ATR-based* — volatility-adjusted sizing for swing/volatile markets.

---

## 16. Risk management

Portfolio-level controls evaluated **before** a signal is opened. Attach via `riskName` (single) or `riskList` (multiple — all must pass) on the strategy schema.

```typescript
interface IRiskSchema {
  riskName: RiskName;
  note?: string;
  validations: (IRiskValidation | IRiskValidationFn)[];   // throw or return rejection to block
  callbacks?: Partial<{
    onRejected: (symbol, params: IRiskCheckArgs) => void | Promise<void>;
    onAllowed:  (symbol, params: IRiskCheckArgs) => void | Promise<void>;
  }>;
}

// A validation is either a bare function or { validate, note }:
type IRiskValidationFn = (payload: IRiskValidationPayload) => RiskRejection | Promise<RiskRejection>;
type RiskRejection = void | IRiskRejectionResult | string | null; // throw/return-truthy/return-string ⇒ reject
```

**`IRiskValidationPayload`** (what each validation receives):

```typescript
{
  symbol: string;
  currentSignal: IRiskSignalRow;        // the candidate signal; priceOpen always present
  strategyName; exchangeName; riskName; frameName;
  currentPrice: number;
  timestamp: number;
  activePositionCount: number;          // across ALL strategies sharing this risk profile
  activePositions: IRiskActivePosition[]; // each: { strategyName, exchangeName, frameName, symbol, position, priceOpen, priceStopLoss, priceTakeProfit, minuteEstimatedTime, openTimestamp }
}
```

To reject: `throw new Error(reason)`, or return a truthy `string`/`IRiskRejectionResult`. Returning `void`/`null` allows the signal.

```typescript
// Concurrent-position cap
addRiskSchema({
  riskName: "conservative",
  validations: [
    ({ activePositionCount }) => { if (activePositionCount >= 3) throw new Error("Max 3 concurrent positions"); },
  ],
});

// Symbol filter
addRiskSchema({
  riskName: "no-meme",
  validations: [
    ({ symbol }) => { if (["DOGEUSDT","SHIBUSDT","PEPEUSDT"].includes(symbol)) throw new Error(`${symbol} blocked`); },
  ],
});

// Trading-hours window
addRiskSchema({
  riskName: "hours",
  validations: [
    ({ timestamp }) => { const h = new Date(timestamp).getUTCHours(); if (h < 9 || h >= 17) throw new Error("Outside 9–17 UTC"); },
  ],
});

// Cross-strategy coordination
addRiskSchema({
  riskName: "coordinator",
  validations: [
    ({ activePositions, strategyName, symbol }) => {
      if (activePositions.filter(p => p.strategyName === strategyName).length >= 2) throw new Error("Strategy at cap");
      if (activePositions.some(p => p.symbol === symbol)) throw new Error(`Already in ${symbol}`);
    },
  ],
});
```

`Risk.getData/getReport/dump` ([§14.6](#14-analytics--reports)) report all rejections. Concurrency note: risk uses an internal `checkSignalAndReserve` that atomically validates **and** reserves a slot, so parallel strategies sharing a profile cannot all pass a count check before any of them registers — preventing limit overshoot.

---

## 17. Broker: transactional live orders

`Broker.useBrokerAdapter(adapter)` connects a real exchange (ccxt/Binance/etc.) to the framework with transaction safety. Every commit method fires **before** internal position state mutates. If the exchange rejects, the fill times out, or the network fails, the adapter throws → the mutation is skipped → backtest-kit retries on the next tick. Call `Broker.enable()` once at startup. `Broker.disable()` tears it down.

Signal **open/close** events are routed automatically via an internal event bus after `Broker.enable()` — no manual wiring. All other operations (`partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, `breakeven`, `averageBuy`) are intercepted explicitly before the corresponding state mutation.

### 17.1 `IBroker` interface & payloads

```typescript
interface IBroker {
  waitForInit(): Promise<void>;
  onSignalOpenCommit(p: BrokerSignalOpenPayload): Promise<void>;
  onSignalCloseCommit(p: BrokerSignalClosePayload): Promise<void>;
  onOrderPing(p: BrokerSignalPendingPayload): Promise<void>;        // confirm order still open; throw if gone
  onPartialProfitCommit(p: BrokerPartialProfitPayload): Promise<void>;
  onPartialLossCommit(p: BrokerPartialLossPayload): Promise<void>;
  onTrailingStopCommit(p: BrokerTrailingStopPayload): Promise<void>;
  onTrailingTakeCommit(p: BrokerTrailingTakePayload): Promise<void>;
  onBreakevenCommit(p: BrokerBreakevenPayload): Promise<void>;
  onAverageBuyCommit(p: BrokerAverageBuyPayload): Promise<void>;
}
```

Every payload carries `symbol`, `signalId`, and `position: "long" | "short"`. Additional fields per payload:

| Payload | Extra fields |
| --- | --- |
| `BrokerSignalOpenPayload` | `cost`, `priceOpen`, `priceTakeProfit`, `priceStopLoss` |
| `BrokerSignalClosePayload` | `cost`, `currentPrice`, `priceOpen`, `priceTakeProfit`, `priceStopLoss` |
| `BrokerSignalPendingPayload` | `currentPrice`, `priceOpen`, `priceTakeProfit`, `priceStopLoss` |
| `BrokerPartialProfitPayload` / `BrokerPartialLossPayload` | `percentToClose`, `cost`, `currentPrice`, `priceTakeProfit`, `priceStopLoss` |
| `BrokerTrailingStopPayload` | `currentPrice`, `newStopLossPrice` |
| `BrokerTrailingTakePayload` | `currentPrice`, `newTakeProfitPrice` |
| `BrokerBreakevenPayload` | `currentPrice`, `newStopLossPrice`, `newTakeProfitPrice` |
| `BrokerAverageBuyPayload` | `currentPrice`, `cost`, `priceTakeProfit`, `priceStopLoss` |

`BrokerBase` is an abstract base you can extend; `TBrokerCtor` is the constructor type. `useBrokerAdapter` accepts a class (`TBrokerCtor`) or a partial instance (`Partial<IBroker>`).

### 17.2 Spot adapter (Binance via ccxt) — complete reference implementation

```typescript
import ccxt from "ccxt";
import { singleshot, sleep } from "functools-kit";
import {
  Broker, IBroker,
  BrokerSignalOpenPayload, BrokerSignalClosePayload,
  BrokerPartialProfitPayload, BrokerPartialLossPayload,
  BrokerTrailingStopPayload, BrokerTrailingTakePayload,
  BrokerBreakevenPayload, BrokerAverageBuyPayload,
} from "backtest-kit";

const FILL_POLL_INTERVAL_MS = 10_000;
const FILL_POLL_ATTEMPTS = 10;
const CANCEL_SETTLE_MS = 2_000;       // let Binance settle a cancellation before reading balance
const STOP_LIMIT_SLIPPAGE = 0.995;    // limit slightly below stopPrice so it fills on a gap down

const getSpotExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_API_SECRET,
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

const getBase = (ex, symbol) => ex.markets[symbol].base; // safe for any quote (USDT/USDC/FDUSD)
const truncateQty = (ex, symbol, qty) => parseFloat(ex.amountToPrecision(symbol, qty, ex.TRUNCATE)); // round down
async function fetchFreeQty(ex, symbol) {
  const balance = await ex.fetchBalance();
  return parseFloat(String(balance?.free?.[getBase(ex, symbol)] ?? 0));
}
async function cancelAllOrders(ex, orders, symbol) {
  await Promise.allSettled(orders.map((o) => ex.cancelOrder(o.id, symbol)));
}
async function createStopLossOrder(ex, symbol, qty, stopPrice) {
  const limitPrice = parseFloat(ex.priceToPrecision(symbol, stopPrice * STOP_LIMIT_SLIPPAGE));
  await ex.createOrder(symbol, "stop_loss_limit", "sell", qty, limitPrice, { stopPrice });
}

// Place a limit order, poll until filled; on timeout cancel, roll back any partial fill via market,
// restore SL/TP on the remainder, then throw so backtest-kit retries.
async function createLimitOrderAndWait(ex, symbol, side, qty, price, restore) {
  const order = await ex.createOrder(symbol, "limit", side, qty, price);
  for (let i = 0; i < FILL_POLL_ATTEMPTS; i++) {
    await sleep(FILL_POLL_INTERVAL_MS);
    if ((await ex.fetchOrder(order.id, symbol)).status === "closed") return;
  }
  await ex.cancelOrder(order.id, symbol);
  await sleep(CANCEL_SETTLE_MS);
  const final = await ex.fetchOrder(order.id, symbol);
  const filledQty = final.filled ?? 0;
  if (filledQty > 0) {
    await ex.createOrder(symbol, "market", side === "buy" ? "sell" : "buy", filledQty);
  }
  if (restore) {
    const remainingQty = truncateQty(ex, symbol, await fetchFreeQty(ex, symbol));
    if (remainingQty > 0) {
      await ex.createOrder(symbol, "limit", "sell", remainingQty, restore.tpPrice);
      await createStopLossOrder(ex, symbol, remainingQty, restore.slPrice);
    }
  }
  throw new Error(`Limit ${order.id} not filled — partial rolled back, will retry`);
}

Broker.useBrokerAdapter(class implements IBroker {
  async waitForInit() { await getSpotExchange(); }

  async onSignalOpenCommit({ symbol, cost, priceOpen, priceTakeProfit, priceStopLoss, position }: BrokerSignalOpenPayload) {
    if (position === "short") throw new Error(`Spot has no short selling (${symbol})`);
    const ex = await getSpotExchange();
    const qty = truncateQty(ex, symbol, cost / priceOpen);
    if (qty <= 0) throw new Error(`Computed qty zero for ${symbol}`);
    const openPrice = parseFloat(ex.priceToPrecision(symbol, priceOpen));
    const tpPrice   = parseFloat(ex.priceToPrecision(symbol, priceTakeProfit));
    const slPrice   = parseFloat(ex.priceToPrecision(symbol, priceStopLoss));
    await createLimitOrderAndWait(ex, symbol, "buy", qty, openPrice);
    try {
      await ex.createOrder(symbol, "limit", "sell", qty, tpPrice);
      await createStopLossOrder(ex, symbol, qty, slPrice);
    } catch (err) { await ex.createOrder(symbol, "market", "sell", qty); throw err; } // unprotected → market close
  }

  async onSignalCloseCommit({ symbol, currentPrice, priceTakeProfit, priceStopLoss }: BrokerSignalClosePayload) {
    const ex = await getSpotExchange();
    await cancelAllOrders(ex, await ex.fetchOpenOrders(symbol), symbol);
    await sleep(CANCEL_SETTLE_MS);
    const qty = truncateQty(ex, symbol, await fetchFreeQty(ex, symbol));
    if (qty === 0) return; // already closed by exchange SL/TP — commit succeeds
    await createLimitOrderAndWait(ex, symbol, "sell", qty,
      parseFloat(ex.priceToPrecision(symbol, currentPrice)),
      { tpPrice: parseFloat(ex.priceToPrecision(symbol, priceTakeProfit)),
        slPrice: parseFloat(ex.priceToPrecision(symbol, priceStopLoss)) });
  }

  async onPartialProfitCommit(p: BrokerPartialProfitPayload) { /* cancel orders, sell percentToClose%, restore SL/TP on remainder */ }
  async onPartialLossCommit(p: BrokerPartialLossPayload)     { /* symmetric to partial profit */ }
  async onTrailingStopCommit({ symbol, newStopLossPrice }: BrokerTrailingStopPayload) {
    const ex = await getSpotExchange();
    const orders = await ex.fetchOpenOrders(symbol);
    const slOrder = orders.find(o => o.side === "sell" && ["stop_loss_limit","stop","STOP_LOSS_LIMIT"].includes(o.type ?? "")) ?? null;
    if (slOrder) { await ex.cancelOrder(slOrder.id, symbol); await sleep(CANCEL_SETTLE_MS); }
    const qty = truncateQty(ex, symbol, await fetchFreeQty(ex, symbol));
    if (qty === 0) throw new Error(`TrailingStop skipped: no position for ${symbol}`);
    await createStopLossOrder(ex, symbol, qty, parseFloat(ex.priceToPrecision(symbol, newStopLossPrice)));
  }
  async onTrailingTakeCommit(p: BrokerTrailingTakePayload) { /* cancel TP limit, re-place at new price */ }
  async onBreakevenCommit(p: BrokerBreakevenPayload)       { /* cancel SL, re-place stop_loss_limit at entry */ }
  async onAverageBuyCommit({ symbol, currentPrice, cost, priceTakeProfit, priceStopLoss }: BrokerAverageBuyPayload) {
    const ex = await getSpotExchange();
    await cancelAllOrders(ex, await ex.fetchOpenOrders(symbol), symbol);
    await sleep(CANCEL_SETTLE_MS);
    const existing = await fetchFreeQty(ex, symbol);
    const minNotional = ex.markets[symbol].limits?.cost?.min ?? 1;
    if (existing * currentPrice < minNotional) throw new Error(`AverageBuy skipped: no position for ${symbol}`); // ghost-position guard
    const qty = truncateQty(ex, symbol, cost / currentPrice);
    if (qty <= 0) throw new Error(`Computed qty zero for ${symbol}`);
    const tpPrice = parseFloat(ex.priceToPrecision(symbol, priceTakeProfit));
    const slPrice = parseFloat(ex.priceToPrecision(symbol, priceStopLoss));
    await createLimitOrderAndWait(ex, symbol, "buy", qty, parseFloat(ex.priceToPrecision(symbol, currentPrice)), { tpPrice, slPrice });
    const totalQty = truncateQty(ex, symbol, await fetchFreeQty(ex, symbol)); // refetch after fill
    try {
      await ex.createOrder(symbol, "limit", "sell", totalQty, tpPrice);
      await createStopLossOrder(ex, symbol, totalQty, slPrice);
    } catch (err) { await ex.createOrder(symbol, "market", "sell", totalQty); throw err; }
  }
});

Broker.enable();
```

### 17.3 Futures adapter — key differences from spot

The futures adapter (Binance USD-M via ccxt) mirrors the spot logic with these structural differences:

- **`options.defaultType: "future"`** and `await exchange.setLeverage(FUTURES_LEVERAGE, symbol)` before the first open (e.g. `3×`).
- **Shorts allowed** — `entrySide`/`exitSide` derive from `position`; `positionSide` (`"LONG"`/`"SHORT"`) is forwarded on every order (required in **hedge mode** to avoid Binance error `-4061`; ignored in one-way mode).
- **Positions, not balances** — quantity comes from `exchange.fetchPositions([symbol])` + `findPosition(positions, symbol, side)` (handles both one-way and hedge mode), reading `pos.contracts`.
- **`reduceOnly: true`** on all exit/rollback orders so qty drift can never accidentally reverse the position.
- **`stop_market`** orders for SL (with `{ stopPrice, reduceOnly: true, positionSide }`) instead of spot's `stop_loss_limit`.
- The timeout-rollback in `createLimitOrderAndWait` closes the partial fill via a `reduceOnly` market order with the correct `positionSide`.

Filtering existing SL/TP for cancellation uses `o.reduceOnly && ["stop_market","stop","STOP_MARKET"].includes(o.type)` for SL and `o.reduceOnly && ["limit","LIMIT"].includes(o.type)` for TP. The DCA (`onAverageBuyCommit`) ghost-position guard compares notional (`existing * currentPrice < minNotional`) rather than raw contracts to avoid the float-`=== 0` trap.

Complete futures reference implementation:

```typescript
import ccxt from "ccxt";
import { singleshot, sleep } from "functools-kit";
import {
  Broker, IBroker,
  BrokerSignalOpenPayload, BrokerSignalClosePayload,
  BrokerPartialProfitPayload, BrokerPartialLossPayload,
  BrokerTrailingStopPayload, BrokerTrailingTakePayload,
  BrokerBreakevenPayload, BrokerAverageBuyPayload,
} from "backtest-kit";

const FILL_POLL_INTERVAL_MS = 10_000;
const FILL_POLL_ATTEMPTS = 10;
const CANCEL_SETTLE_MS = 2_000;
const FUTURES_LEVERAGE = 3; // conservative for ~$1000 fiat; applied per-symbol on first open

const getFuturesExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_API_SECRET,
    options: { defaultType: "future", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

const truncateQty = (ex, symbol, qty) => parseFloat(ex.amountToPrecision(symbol, qty, ex.TRUNCATE));
const toPositionSide = (position: "long" | "short") => (position === "long" ? "LONG" : "SHORT");

// Resolve position for symbol/side — safe in both one-way and hedge mode
function findPosition(positions, symbol, side: "long" | "short") {
  const hedged = positions.find((p) => p.symbol === symbol && p.side === side);
  if (hedged) return hedged;
  const pos = positions.find((p) => p.symbol === symbol) ?? null;
  if (pos && pos.side && pos.side !== side) {
    console.warn(`findPosition: expected side="${side}" got "${pos.side}" for ${symbol} — one-way/hedge mismatch`);
  }
  return pos;
}
async function fetchContractsQty(ex, symbol, side: "long" | "short") {
  const positions = await ex.fetchPositions([symbol]);
  return Math.abs(parseFloat(String(findPosition(positions, symbol, side)?.contracts ?? 0)));
}
async function cancelAllOrders(ex, orders, symbol) {
  await Promise.allSettled(orders.map((o) => ex.cancelOrder(o.id, symbol)));
}

// Place limit order, poll, roll back partial fill via reduceOnly market on timeout, restore SL/TP, throw.
async function createLimitOrderAndWait(ex, symbol, side, qty, price, params = {}, restore?) {
  const order = await ex.createOrder(symbol, "limit", side, qty, price, params);
  for (let i = 0; i < FILL_POLL_ATTEMPTS; i++) {
    await sleep(FILL_POLL_INTERVAL_MS);
    if ((await ex.fetchOrder(order.id, symbol)).status === "closed") return;
  }
  await ex.cancelOrder(order.id, symbol);
  await sleep(CANCEL_SETTLE_MS);
  const final = await ex.fetchOrder(order.id, symbol);
  const filledQty = final.filled ?? 0;
  if (filledQty > 0) {
    const rollbackSide = side === "buy" ? "sell" : "buy";
    const rollbackPositionSide = params.positionSide ?? (restore ? toPositionSide(restore.positionSide) : undefined);
    await ex.createOrder(symbol, "market", rollbackSide, filledQty, undefined, {
      reduceOnly: true, ...(rollbackPositionSide ? { positionSide: rollbackPositionSide } : {}),
    });
  }
  if (restore) {
    const remainingQty = truncateQty(ex, symbol, await fetchContractsQty(ex, symbol, restore.positionSide));
    if (remainingQty > 0) {
      await ex.createOrder(symbol, "limit", restore.exitSide, remainingQty, restore.tpPrice, { reduceOnly: true });
      await ex.createOrder(symbol, "stop_market", restore.exitSide, remainingQty, undefined, { stopPrice: restore.slPrice, reduceOnly: true });
    }
  }
  throw new Error(`Limit ${order.id} not filled — partial rolled back, will retry`);
}

Broker.useBrokerAdapter(class implements IBroker {
  async waitForInit() { await getFuturesExchange(); }

  async onSignalOpenCommit({ symbol, cost, priceOpen, priceTakeProfit, priceStopLoss, position }: BrokerSignalOpenPayload) {
    const ex = await getFuturesExchange();
    await ex.setLeverage(FUTURES_LEVERAGE, symbol);
    const qty = truncateQty(ex, symbol, cost / priceOpen);
    if (qty <= 0) throw new Error(`Computed qty zero for ${symbol}`);
    const openPrice = parseFloat(ex.priceToPrecision(symbol, priceOpen));
    const tpPrice   = parseFloat(ex.priceToPrecision(symbol, priceTakeProfit));
    const slPrice   = parseFloat(ex.priceToPrecision(symbol, priceStopLoss));
    const entrySide = position === "long" ? "buy"  : "sell";
    const exitSide  = position === "long" ? "sell" : "buy";
    const positionSide = toPositionSide(position);
    await createLimitOrderAndWait(ex, symbol, entrySide, qty, openPrice, { positionSide });
    try {
      await ex.createOrder(symbol, "limit", exitSide, qty, tpPrice, { reduceOnly: true, positionSide });
      await ex.createOrder(symbol, "stop_market", exitSide, qty, undefined, { stopPrice: slPrice, reduceOnly: true, positionSide });
    } catch (err) {
      await ex.createOrder(symbol, "market", exitSide, qty, undefined, { reduceOnly: true, positionSide });
      throw err;
    }
  }

  async onSignalCloseCommit({ symbol, position, currentPrice, priceTakeProfit, priceStopLoss }: BrokerSignalClosePayload) {
    const ex = await getFuturesExchange();
    await cancelAllOrders(ex, await ex.fetchOpenOrders(symbol), symbol);
    await sleep(CANCEL_SETTLE_MS);
    const qty = truncateQty(ex, symbol, await fetchContractsQty(ex, symbol, position));
    const exitSide = position === "long" ? "sell" : "buy";
    if (qty === 0) throw new Error(`SignalClose skipped: no position for ${symbol} — let backtest-kit reconcile`);
    await createLimitOrderAndWait(ex, symbol, exitSide, qty,
      parseFloat(ex.priceToPrecision(symbol, currentPrice)),
      { reduceOnly: true },
      { exitSide, tpPrice: parseFloat(ex.priceToPrecision(symbol, priceTakeProfit)),
        slPrice: parseFloat(ex.priceToPrecision(symbol, priceStopLoss)), positionSide: position });
  }

  async onPartialProfitCommit(p: BrokerPartialProfitPayload) { /* cancel; reduceOnly limit close percentToClose%; restore SL/TP stop_market+limit on remainder */ }
  async onPartialLossCommit(p: BrokerPartialLossPayload)     { /* symmetric */ }

  async onTrailingStopCommit({ symbol, newStopLossPrice, position }: BrokerTrailingStopPayload) {
    const ex = await getFuturesExchange();
    const slOrder = (await ex.fetchOpenOrders(symbol)).find(o => !!o.reduceOnly && ["stop_market","stop","STOP_MARKET"].includes(o.type ?? "")) ?? null;
    if (slOrder) { await ex.cancelOrder(slOrder.id, symbol); await sleep(CANCEL_SETTLE_MS); }
    const qty = truncateQty(ex, symbol, await fetchContractsQty(ex, symbol, position));
    const exitSide = position === "long" ? "sell" : "buy";
    if (qty === 0) throw new Error(`TrailingStop skipped: no position for ${symbol}`);
    await ex.createOrder(symbol, "stop_market", exitSide, qty, undefined,
      { stopPrice: parseFloat(ex.priceToPrecision(symbol, newStopLossPrice)), reduceOnly: true, positionSide: toPositionSide(position) });
  }
  async onTrailingTakeCommit(p: BrokerTrailingTakePayload) { /* cancel reduceOnly limit TP; re-place reduceOnly limit at new price */ }
  async onBreakevenCommit(p: BrokerBreakevenPayload)       { /* cancel reduceOnly stop_market SL; re-place at entry */ }

  async onAverageBuyCommit({ symbol, currentPrice, cost, position, priceTakeProfit, priceStopLoss }: BrokerAverageBuyPayload) {
    const ex = await getFuturesExchange();
    await cancelAllOrders(ex, await ex.fetchOpenOrders(symbol), symbol);
    await sleep(CANCEL_SETTLE_MS);
    const existing = await fetchContractsQty(ex, symbol, position);
    const minNotional = ex.markets[symbol].limits?.cost?.min ?? 1;
    if (existing * currentPrice < minNotional) throw new Error(`AverageBuy skipped: no position for ${symbol}`);
    const qty = truncateQty(ex, symbol, cost / currentPrice);
    if (qty <= 0) throw new Error(`Computed qty zero for ${symbol}`);
    const tpPrice = parseFloat(ex.priceToPrecision(symbol, priceTakeProfit));
    const slPrice = parseFloat(ex.priceToPrecision(symbol, priceStopLoss));
    const positionSide = toPositionSide(position);
    const entrySide = position === "long" ? "buy"  : "sell";
    const exitSide  = position === "long" ? "sell" : "buy";
    await createLimitOrderAndWait(ex, symbol, entrySide, qty, parseFloat(ex.priceToPrecision(symbol, currentPrice)),
      { positionSide }, { exitSide, tpPrice, slPrice, positionSide: position });
    const totalQty = truncateQty(ex, symbol, await fetchContractsQty(ex, symbol, position));
    try {
      await ex.createOrder(symbol, "limit", exitSide, totalQty, tpPrice, { reduceOnly: true, positionSide });
      await ex.createOrder(symbol, "stop_market", exitSide, totalQty, undefined, { stopPrice: slPrice, reduceOnly: true, positionSide });
    } catch (err) {
      await ex.createOrder(symbol, "market", exitSide, totalQty, undefined, { reduceOnly: true, positionSide });
      throw err;
    }
  }
});

Broker.enable();
```

### 17.4 `onOrderPing` (optional)

`onOrderPing(payload: BrokerSignalPendingPayload)` fires on every live tick while a pending signal is monitored, *before* TP/SL/time evaluation, to confirm the order still exists. **Throw only when the order is confirmed not-found by id** (filled/cancelled/liquidated externally) — the framework then closes the position with `closeReason: "closed"`. **Swallow transient/network errors** (timeout, 5xx, rate-limit, disconnect) — returning normally — or a connectivity blip would wrongly close an open position.

---

## 18. Cron: virtual-time scheduler

`Cron` is a periodic / fire-once scheduler that runs in **virtual time** — the same time stream strategies see in backtest. Handlers fire on candle-interval boundaries (`1m`, `5m`, `1h`, `1d`, …) and are coordinated across parallel `Backtest.background(symbol, …)` runs so the same boundary never produces two concurrent invocations.

### 18.1 API

```typescript
interface CronEntry {
  name: string;               // unique; must not contain ':' (reserved key separator)
  interval?: CandleInterval;  // omit ⇒ fire-once mode
  symbols?: string[];         // omit/empty ⇒ global; non-empty ⇒ per-symbol fan-out
  handler: (info: IRuntimeInfo) => void | Promise<void>;
}

Cron.register(entry: CronEntry): CronHandle  // returns a disposer; re-registering a name replaces it
Cron.unregister(name: string): void
Cron.enable(): () => void                    // subscribe to engine lifecycle; singleshot, returns disposer
Cron.disable(): void                         // tear down subscriptions (safe before enable / repeatedly)
Cron.clear(symbol?: string): void            // clear fire-once marks (symbol ⇒ fan-out marks for that symbol)
Cron.dispose(): void                         // hard reset: disable + wipe entries/marks/watermarks
```

`CronHandle` is `() => void` (calling it = `unregister(name)`). The handler receives `IRuntimeInfo` (`{ symbol, context, backtest, range, currentPrice, info, when }`).

### 18.2 Two modes × two scopes

- **Periodic** (`interval` set) — fires once per boundary of that interval.
- **Fire-once** (`interval` omitted) — fires on the first matching tick, never again until `clear()`/`unregister`/re-`register`. A failed handler is **not** marked fired, so it retries.
- **Global** (`symbols` empty) — fires once per boundary across **all** parallel backtests; first symbol to reach the boundary opens the slot, others await the same promise.
- **Fan-out** (`symbols` non-empty) — fires once per boundary **per whitelisted symbol**; each symbol has its own slot.

```typescript
import { Cron, Backtest } from "backtest-kit";

// Global hourly job — once per virtual hour across all parallel backtests
Cron.register({ name: "tg-signal-parser", interval: "1h",
  handler: async ({ when }) => { await parseTelegramSignalsToMongo(when); } });

// Per-symbol fan-out — once per hour per whitelisted symbol
Cron.register({ name: "fetch-funding", interval: "1h", symbols: ["BTCUSDT","ETHUSDT"],
  handler: async ({ symbol, when }) => { await fetchFundingRate(symbol, when); } });

// Fire-once global warm-up
Cron.register({ name: "warm-cache", handler: async () => { await warmupCache(); } });

Cron.enable(); // wire once at startup; after this every strategy tick feeds Cron automatically
for (const symbol of ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","TRXUSDT"]) {
  Backtest.background(symbol, { strategyName, exchangeName, frameName });
}
// On shutdown: Cron.disable();
```

### 18.3 Internals (coordination)

`enable()` subscribes a single `singlerun`-wrapped handler to four lifecycle subjects (`beforeStart`, `idlePing`, `activePing`, `schedulePing`), merging them into one serial queue so concurrent ticks on the same `(symbol, virtual-minute)` cannot race to open a slot. Each tick is **base-aligned to the 1-minute boundary** first. Coordination keys are `${name}:${alignedMs}:${symbol?}:g${generation}`; parallel backtests hitting the same key share one in-flight promise (mutex). Periodic entries use a **watermark** (`_lastBoundary`): they fire when the tick's aligned boundary is **strictly greater** than the last fired — so a virtual-time jump that skips clean over a boundary (e.g. a `5m` loop going 00:14 → 00:29 missing the `15m` 00:15 boundary) still fires once, at the newest crossed boundary (catch-up). A failed periodic handler rolls back the watermark so the boundary retries. A 120s watchdog warns (does not interrupt) if a handler stalls. The `generation` suffix isolates re-registrations so a late write from an old in-flight handler never collides with the new entry.

---

## 19. Sync: order synchronization

`Sync` records and reports order-synchronization events between the framework and the broker/exchange. It is driven by the broker/sync contracts (`SignalSyncContract`, `SignalOpenContract`, `SignalCloseContract`, `SignalPingContract`). Listen live with `listenSync` / `listenSyncOnce`. Reporting trio: `Sync.getData`, `Sync.getReport`, `Sync.dump` (`SyncStatisticsModel`, `SyncEvent`; retained rows `CC_MAX_SYNC_MARKDOWN_ROWS`, default 250).

These contracts back the broker auto-routing in [§17](#17-broker-transactional-live-orders): when the framework wants to open or close a position it emits a `SignalSyncContract` (`action: "signal-open" | "signal-close"`); a listener (or broker adapter) that throws rejects the operation and the framework retries on the next tick.

---

## 20. Per-signal Memory, State, Session, Storage, Recent

Five scoped key-value subsystems. **Memory / State** are scoped to the **active signal** (resolved from context); **Session** is scoped to `(symbol, strategy, exchange, frame)`; **Storage / Recent** are general-purpose utilities. All persist across candles, survive live restarts, and respect virtual time.

### 20.1 Memory — BM25-searchable per-signal store

All functions resolve the active pending **or** scheduled signal from context, and throw if neither exists. Object-DTO call style:

```typescript
writeMemory<T>({ bucketName, memoryId, value: T, description }): Promise<void>
readMemory<T>({ bucketName, memoryId }): Promise<T>            // throws if not found
listMemory<T>({ bucketName }): Promise<Array<{ memoryId; content: T }>>
removeMemory({ bucketName, memoryId }): Promise<void>
searchMemory<T>({ bucketName, query }): Promise<Array<{ memoryId; score; content: T }>> // BM25 full-text, sorted by relevance
```

The `description` field is indexed for BM25 search. Use it for cross-candle recall of LLM context tied to a signal:

```typescript
await writeMemory({ bucketName: "ctx", memoryId: "thesis",
  value: { trend: "up", confidence: 0.9 }, description: "bullish breakout thesis at entry" });
const hits = await searchMemory({ bucketName: "ctx", query: "bullish trend" });
```

`Memory` (and `MemoryLive`/`MemoryBacktest` variants, `MemoryBacktestAdapter`/`MemoryLiveAdapter`, `IMemoryInstance`, `TMemoryInstanceCtor`) are exported for advanced use.

### 20.2 State — typed per-signal accumulator

Prefer `createSignalState({ bucketName, initialValue })` → `[getState, setState]` ([§8.3](#83-createsignalstate--typed-per-signal-accumulator-recommended)). The lower-level `getSignalState(symbol, { bucketName, initialValue })` / `setSignalState(symbol, dispatch, { bucketName, initialValue })` are deprecated. `setState` accepts a value or an updater `(current) => next`. Exported: `State`, `StateLive`, `StateBacktest`, `StateBacktestAdapter`, `StateLiveAdapter`, `IStateInstance`, `TStateInstanceCtor`.

### 20.3 Session — per-context cross-candle store

Not tied to a signal — survives across signals within a run, and across restarts in live. Ideal for caching LLM inference results or indicator state.

```typescript
getSessionData<T>(symbol): Promise<T | null>
setSessionData<T>(symbol, value: T | null): Promise<void>   // null clears
```

```typescript
const session = await getSessionData<{ lastLlmSignal: string }>("BTCUSDT");
if (session?.lastLlmSignal === "buy") { /* reuse cached LLM result */ }
await setSessionData("BTCUSDT", { lastLlmSignal: "buy" });
```

Exported: `Session`, `SessionLive`, `SessionBacktest`, `ISessionInstance`, `TSessionInstanceCtor`.

### 20.4 Storage & Recent

`Storage` (and `StorageLive`/`StorageBacktest`, `IStorageUtils`, `TStorageUtilsCtor`) is a general-purpose persisted key-value utility. `Recent` (and `RecentLive`/`RecentBacktest`, `IRecentUtils`, `TRecentUtilsCtor`) tracks recent signals and powers `getLatestSignal` / `getMinutesSinceLatestSignalCreated` ([§8.1](#81-signal--position-queries)).

---

## 21. Dump: agent reasoning & record capture

`dump*` functions capture artifacts scoped to the **active signal** (pending or scheduled, resolved from context) into a per-bucket markdown/record store under `./dump/`. Their `description` is indexed for Memory-style search. All use object-DTO call style and throw if no signal is active.

```typescript
dumpAgentAnswer({ bucketName, dumpId, messages: MessageModel[], description }): Promise<void>  // full LLM chat history
dumpRecord({ bucketName, dumpId, record: Record<string,unknown>, description }): Promise<void>  // flat KV → markdown table / SQL
dumpTable({ bucketName, dumpId, rows: Record<string,unknown>[], description }): Promise<void>   // array → table (union of keys)
dumpText({ bucketName, dumpId, content: string, description }): Promise<void>                   // raw text
dumpError({ bucketName, dumpId, content: string, description }): Promise<void>                  // error description
dumpJson({ bucketName, dumpId, json: object, description }): Promise<void>                      // DEPRECATED — prefer dumpRecord
```

`MessageModel` (`MessageRole`, `MessageToolCall`) is the chat-message shape for `dumpAgentAnswer`. Typical use is inside an LLM `getSignal` to record the reasoning and the resulting signal alongside the trade for later audit (see [§3.3](#33-define-a-strategy-with-an-llm)).

The lower-level `Dump` class (`IDumpInstance`, `IDumpContext`, `TDumpInstanceCtor`) backs these functions.

---

## 22. Actions: pluggable event handlers

Actions attach custom handler classes to a strategy (via `actions: [actionName]` on the schema). Each action instance is created per strategy-frame pair and receives every event the strategy emits — ideal for state managers (Redux/Zustand), notifications (Telegram/Discord), logging, analytics, and external-system writes.

```typescript
interface IActionSchema {
  actionName: ActionName;
  note?: string;
  handler: TActionCtor | Partial<IPublicAction>;  // class or instance
  callbacks?: Partial<IActionCallbacks>;
}

// Constructor receives identity + mode:
type TActionCtor = new (strategyName, frameName, actionName, backtest: boolean) => Partial<IPublicAction>;
```

`IAction` event methods (all optional via `IPublicAction`, plus an `init?()` lifecycle hook):

`signal` (all modes), `signalLive`, `signalBacktest` (one mode), `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `pingIdle`, `riskRejection`, `signalSync` *(deprecated — use signal*())*, `orderPing` *(deprecated — use Broker.onOrderPing)*, `dispose`.

The same hooks are available as `callbacks` on the schema (`onSignal`, `onSignalLive`, `onSignalBacktest`, `onBreakevenAvailable`, `onPartialProfitAvailable`, `onPartialLossAvailable`, `onPingScheduled`, `onPingActive`, `onPingIdle`, `onRiskRejection`, `onSignalSync`, `onOrderPing`, plus `onInit`/`onDispose`), each receiving `(event, actionName, strategyName, frameName, backtest)`.

```typescript
class TelegramNotifier implements Partial<IPublicAction> {
  constructor(private strategyName: string, private frameName: string, private actionName: string, private backtest: boolean) {}
  async init() { /* connect bot */ }
  async signal(event: IStrategyTickResult) {
    if (!this.backtest && event.action === "opened") await sendTelegram(`Signal opened: ${event.signal.id}`);
  }
  async dispose() { /* disconnect */ }
}
addActionSchema({ actionName: "telegram", handler: TelegramNotifier });
addStrategySchema({ strategyName: "my", actions: ["telegram"], getSignal });
```

`dispose()` is guaranteed to run exactly once (singleshot). `ActionBase` is an exported base class. Exceptions from `signalSync`/`orderPing` are **not** swallowed (they reject the operation) — all other action callbacks swallow exceptions.

---

## 22.5 Strategy recipes

Complete, copy-pastable patterns built only from verified API. All assume the relevant functions are imported from `backtest-kit`.

### Scale-out at Kelly levels via the milestone listener

```typescript
import { listenPartialProfitAvailable, Constant, commitPartialProfit } from "backtest-kit";

listenPartialProfitAvailable(async ({ symbol, level }) => {
  if (level === Constant.TP_LEVEL1) await commitPartialProfit(symbol, 33); // +3%
  if (level === Constant.TP_LEVEL2) await commitPartialProfit(symbol, 33); // +6%
  if (level === Constant.TP_LEVEL3) await commitPartialProfit(symbol, 34); // +9%
});
```

### Breakeven then trail (callback-driven)

```typescript
addStrategySchema({
  strategyName: "protect",
  getSignal,
  callbacks: {
    onActivePing: async (symbol, data, currentPrice) => {
      if (await getBreakeven(symbol, currentPrice)) await commitBreakeven(symbol);
      const pct = await getPositionPnlPercent(symbol, currentPrice);
      if (pct !== null && pct >= 2) await commitTrailingStop(symbol, 1, currentPrice); // 1% trail past +2%
    },
  },
});
```

### LONG DCA ladder (add rungs on new lows, close at blended profit)

```typescript
addStrategySchema({
  strategyName: "long-dca",
  interval: "5m",
  getSignal: async (symbol, when, currentPrice) => {
    if (!(await hasNoPendingSignal(symbol))) return null;
    return { position: "long", priceTakeProfit: currentPrice * 1.10, priceStopLoss: currentPrice * 0.85, minuteEstimatedTime: Infinity };
  },
  callbacks: {
    onActivePing: async (symbol, data, currentPrice) => {
      // commitAverageBuy is auto-rejected unless currentPrice is a NEW LOW since entry (default rule),
      // so simply attempting on every ping naturally builds the ladder only on genuine dips.
      const entries = await getPositionInvestedCount(symbol);
      if ((entries ?? 0) < 10) await commitAverageBuy(symbol, 100); // up to 10 rungs of $100

      const pct = await getPositionPnlPercent(symbol, currentPrice);
      if (pct !== null && pct >= 3) await commitClosePending(symbol); // 3% blended target
    },
  },
});
```

### SHORT DCA ladder

Identical structure with `position: "short"`; `commitAverageBuy` is auto-rejected unless `currentPrice` is a **new high** since entry. Close at a small blended profit (e.g. 0.5%) via `commitClosePending`.

### Cooldown after a stop-loss

```typescript
getSignal: async (symbol, when, currentPrice) => {
  const minutes = await getMinutesSinceLatestSignalCreated(symbol);
  if (minutes !== null && minutes < 240) return null;           // 4h cooldown
  // ... generate signal
}
```

### Scheduled (limit/grid) entry

```typescript
getSignal: async (symbol, when, currentPrice) => ({
  position: "long",
  priceOpen: currentPrice * 0.99,            // provided ⇒ scheduled; waits for a 1% dip
  priceTakeProfit: currentPrice * 1.02,
  priceStopLoss: currentPrice * 0.96,
});
// Auto-cancelled after CC_SCHEDULE_AWAIT_MINUTES, or if SL is hit before activation.
// Force early activation from a callback: await commitActivateScheduled(symbol);
// Cancel manually: await commitCancelScheduled(symbol);
```

### LLM capitulation exit via per-signal state

```typescript
const [getTradeState, setTradeState] = createSignalState({
  bucketName: "trade", initialValue: { peakPercent: 0, minutesOpen: 0 },
});
addStrategySchema({
  strategyName: "llm-capitulation",
  getSignal,
  callbacks: {
    onActivePing: async (symbol, data, currentPrice) => {
      const pct = (await getPositionPnlPercent(symbol, currentPrice)) ?? 0;
      const { peakPercent, minutesOpen } = await setTradeState((s) => ({
        peakPercent: Math.max(s.peakPercent, pct),
        minutesOpen: s.minutesOpen + 1,
      }));
      if (minutesOpen >= 15 && peakPercent < 0.3) await commitClosePending(symbol); // thesis not confirmed
    },
  },
});
```

---

## 23. Event listeners

Global event listeners. Each returns an **unsubscribe closure**. `*Once` variants take a `(filter, handler)` pair and auto-unsubscribe after the first matching event. Import from `backtest-kit`.

### 23.1 Signal lifecycle

| Listener | Fires on |
| --- | --- |
| `listenSignal` / `listenSignalOnce` | Every tick result, both modes. `event.backtest` distinguishes. |
| `listenSignalBacktest` / `listenSignalBacktestOnce` | Backtest tick results only. |
| `listenSignalLive` / `listenSignalLiveOnce` | Live tick results only. |
| `listenSignalNotify` / `listenSignalNotifyOnce` | User notifications emitted via `commitSignalNotify`. |

```typescript
listenSignal((event) => {
  if (event.action === "closed") console.log(event.closeReason, event.pnl.pnlPercentage);
});
listenSignalOnce(
  (e) => e.action === "closed" && e.pnl.pnlPercentage > 5,
  (e) => console.log("big win", e.pnl.pnlPercentage),
);
```

### 23.2 Completion & progress

| Listener | Fires on |
| --- | --- |
| `listenDoneBacktest` / `…Once` | A backtest completes/stops (`{ symbol, strategyName, exchangeName, frameName, backtest }`). |
| `listenDoneLive` / `…Once` | Live trading stops. |
| `listenDoneWalker` / `…Once` | Walker completes (carries `bestStrategy`). |
| `listenWalkerComplete` | Walker results (`IWalkerResults`). |
| `listenWalker` / `…Once` | Per-strategy walker progress events. |
| `listenWalkerProgress` | Walker progress ticks. |
| `listenBacktestProgress` | Backtest progress ticks. |

### 23.3 Ping & milestone

| Listener | Fires on |
| --- | --- |
| `listenIdlePing` / `…Once` | Every minute while idle. |
| `listenSchedulePing` / `…Once` | Every minute while a scheduled signal waits. |
| `listenActivePing` / `…Once` | Every minute while a position is active. |
| `listenPartialProfitAvailable` / `…Once` | A profit milestone (10/20/…/100%) reached (deduplicated). |
| `listenPartialLossAvailable` / `…Once` | A loss milestone reached. |
| `listenBreakevenAvailable` / `…Once` | Breakeven threshold reached. |
| `listenHighestProfit` / `…Once` | Peak-profit update. |
| `listenMaxDrawdown` / `…Once` | Max-drawdown update. |

```typescript
import { listenPartialProfitAvailable, Constant } from "backtest-kit";
listenPartialProfitAvailable(({ symbol, signal, price, level, backtest }) => {
  if (level === Constant.TP_LEVEL1) { /* +3% — close 33% */ }
  if (level === Constant.TP_LEVEL2) { /* +6% — close 33% */ }
  if (level === Constant.TP_LEVEL3) { /* +9% — close 34% */ }
});
```

The `*Once` filtered form:

```typescript
listenPartialProfitAvailableOnce(() => true, ({ level }) => console.log("first profit milestone", level));
```

### 23.4 System & lifecycle

| Listener | Fires on |
| --- | --- |
| `listenError` | An uncaught engine error (`(error) => …`). |
| `listenExit` | Process-exit signal. |
| `listenValidation` | A signal validation event. |
| `listenRisk` / `…Once` | A risk rejection. |
| `listenStrategyCommit` / `…Once` | A strategy commit (partial/trailing/breakeven/average-buy). |
| `listenSync` / `…Once` | An order-sync event. |
| `listenPerformance` | A performance metric sample. |
| `listenBeforeStart` / `…Once` | First lifecycle event of a run. |
| `listenAfterEnd` / `…Once` | After a run ends. |

`shutdown()` ([§13.4](#134-graceful-shutdown--task-monitoring)) is the orchestrated stop: it waits until no `Backtest`/`Live` task is `pending`, then emits the shutdown event so subscribers can clean up.

```typescript
import { listenError, shutdown } from "backtest-kit";
let lastError;
const unError = listenError((e) => { lastError = e; });
process.on("SIGINT", () => shutdown());
```

The raw subjects are also exported under `emitters` (`import { emitters } from "backtest-kit"`) for advanced wiring.

---

## 24. Notifications

`Notification` (and `NotificationLive`/`NotificationBacktest`, `INotificationUtils`, `TNotificationUtilsCtor`) emit and persist typed notifications. The exported `NotificationModel` discriminated union covers every event type:

`CriticalErrorNotification`, `InfoErrorNotification`, `PartialLossAvailableNotification`, `PartialProfitAvailableNotification`, `BreakevenAvailableNotification`, `PartialProfitCommitNotification`, `PartialLossCommitNotification`, `BreakevenCommitNotification`, `ActivateScheduledCommitNotification`, `TrailingStopCommitNotification`, `TrailingTakeCommitNotification`, `RiskRejectionNotification`, `SignalCancelledNotification`, `SignalClosedNotification`, `SignalOpenedNotification`, `SignalScheduledNotification`, `ValidationErrorNotification`, `AverageBuyCommitNotification`, `SignalSyncCloseNotification`, `SignalSyncOpenNotification`, `CancelScheduledCommitNotification`, `ClosePendingCommitNotification`, `SignalInfoNotification`.

Up to `CC_MAX_NOTIFICATIONS` (default 500) notifications are retained. `@backtest-kit/ui` consumes these for its real-time notification panel.

---

## 25. Persistence adapters

Default persistence is **file-based with atomic writes** under `./dump/`. There are **15 independent persistence domains**, each with its own adapter you can replace (Redis, MongoDB, PostgreSQL, …) for distributed or high-performance deployments. In **backtest mode persistence is skipped** for performance; it is active in **live mode** for crash recovery.

### 25.1 The 15 domains

Each domain `X` exports: a data type `XData`, an adapter namespace `PersistXAdapter` (with `usePersistXAdapter(ctor)`), an instance interface `IPersistXInstance`, a default instance class `PersistXInstance`, and a constructor type `TPersistXInstanceCtor`.

| # | Domain | Purpose |
| --- | --- | --- |
| 1 | `Signal` | Pending/active signals (live recovery). `SignalData`, `PersistSignalAdapter`, … |
| 2 | `Schedule` | Scheduled (waiting) signals — independent of Signal so both recover separately. |
| 3 | `Risk` | Active positions for portfolio risk. `RiskData`, `PersistRiskAdapter`. |
| 4 | `Strategy` | Deferred strategy state (commit queue, created/closed/cancelled/activated signal). |
| 5 | `Partial` | Per-signal partial milestone levels (dedup, crash-safe). |
| 6 | `Breakeven` | Per-signal breakeven flags. |
| 7 | `Candle` | OHLCV cache. `PersistCandleAdapter`. |
| 8 | `Storage` | General key-value store ([§20.4](#204-storage--recent)). |
| 9 | `Notification` | Notification log ([§24](#24-notifications)). |
| 10 | `Log` | Log lines (capped at `CC_MAX_LOG_LINES`). |
| 11 | `Measure` | Performance metric samples. |
| 12 | `Memory` | BM25-searchable per-signal memory ([§20.1](#201-memory--bm25-searchable-per-signal-store)). |
| 13 | `Interval` | Interval/throttle bookkeeping. |
| 14 | `Recent` | Recent-signal tracking ([§20.4](#204-storage--recent)). |
| 15 | `State` | Per-signal typed state ([§20.2](#202-state--typed-per-signal-accumulator)). |
| (+) | `Session` | Per-context session store ([§20.3](#203-session--per-context-cross-candle-store)) — `SessionData`, `PersistSessionAdapter`, … |

### 25.2 Default file layout

```
./dump/data/
  signal/{strategyName}/{symbol}.json      # pending/active signal
  schedule/{strategyName}/{symbol}.json     # scheduled signal
  risk/{riskName}/positions.json            # active positions
  partial/{symbol}/levels.json              # partial milestone levels
  ...
./dump/backtest/{strategyName}.md           # reports
./dump/live/{strategyName}.md
./dump/heatmap/{strategyName}.md
./dump/partial/{symbol}.md
./dump/schedule/{strategyName}.md
```

### 25.3 `PersistBase` — the base contract

```typescript
class PersistBase {
  constructor(entityName: string, baseDir: string);
  waitForInit(initial: boolean): Promise<void>;
  readValue<T>(entityId: string | number): Promise<T>;     // throw if missing
  hasValue(entityId: string | number): Promise<boolean>;
  writeValue<T>(entityId: string | number, entity: T): Promise<void>;
  removeValue(entityId: string | number): Promise<void>;   // throw if missing
  removeAll(): Promise<void>;
  values<T>(): AsyncGenerator<T>;     // sorted alphanumerically
  keys(): AsyncGenerator<string>;     // sorted alphanumerically
  // plus filter(predicate) and take(n) iterators
}
```

Exported helpers: `SignalData`, `EntityId`, `PersistBase`, `TPersistBase`, `IPersistBase`, `TPersistBaseCtor`, plus the full `PersistXAdapter` / `IPersistXInstance` / `PersistXInstance` / `TPersistXInstanceCtor` / `XData` set for all 15 domains (+ Session).

### 25.4 Custom adapter — Redis example

```typescript
import { PersistBase, PersistSignalAdapter, PersistRiskAdapter, PersistScheduleAdapter } from "backtest-kit";
import Redis from "ioredis";
const redis = new Redis();

class RedisPersist extends PersistBase {
  async waitForInit() { /* connection already established */ }
  async readValue<T>(id) {
    const data = await redis.get(`${this.entityName}:${id}`);
    if (!data) throw new Error(`${this.entityName}:${id} not found`);
    return JSON.parse(data) as T;
  }
  async hasValue(id) { return (await redis.exists(`${this.entityName}:${id}`)) === 1; }
  async writeValue<T>(id, entity: T) { await redis.set(`${this.entityName}:${id}`, JSON.stringify(entity)); }
  async removeValue(id) { if ((await redis.del(`${this.entityName}:${id}`)) === 0) throw new Error("not found"); }
  async removeAll() { const k = await redis.keys(`${this.entityName}:*`); if (k.length) await redis.del(...k); }
  async *values<T>() {
    const keys = (await redis.keys(`${this.entityName}:*`)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    for (const key of keys) { const d = await redis.get(key); if (d) yield JSON.parse(d) as T; }
  }
  async *keys() {
    const keys = (await redis.keys(`${this.entityName}:*`)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    for (const key of keys) yield key.slice(this.entityName.length + 1);
  }
}

// Register BEFORE running any strategy:
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);
PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
```

> The complete production stack (all 15 domains on MongoDB + Redis O(1) cache, atomic `findOneAndUpdate` upserts, look-ahead-protected `when` columns) is `@backtest-kit/mongo` / `backtest-kit-redis-mongo-docker` — drop-in, strategy code unchanged.

### 25.6 Custom adapter — MongoDB example

```typescript
import { PersistBase, PersistSignalAdapter, PersistRiskAdapter } from "backtest-kit";
import { MongoClient, Collection } from "mongodb";

const client = new MongoClient("mongodb://localhost:27017");
const db = client.db("backtest-kit");

class MongoPersist extends PersistBase {
  private collection: Collection;
  constructor(entityName: string, baseDir: string) {
    super(entityName, baseDir);
    this.collection = db.collection(this.entityName);
  }
  async waitForInit() {
    await client.connect();
    await this.collection.createIndex({ entityId: 1 }, { unique: true });
  }
  async readValue<T>(entityId) {
    const doc = await this.collection.findOne({ entityId });
    if (!doc) throw new Error(`${this.entityName}:${entityId} not found`);
    return doc.data as T;
  }
  async hasValue(entityId) { return (await this.collection.countDocuments({ entityId })) > 0; }
  async writeValue<T>(entityId, entity: T) {
    await this.collection.updateOne({ entityId },
      { $set: { entityId, data: entity, updatedAt: new Date() } }, { upsert: true });
  }
  async removeValue(entityId) {
    if ((await this.collection.deleteOne({ entityId })).deletedCount === 0) throw new Error("not found");
  }
  async removeAll() { await this.collection.deleteMany({}); }
  async *values<T>() { for await (const doc of this.collection.find({}).sort({ entityId: 1 })) yield doc.data as T; }
  async *keys() { for await (const doc of this.collection.find({}, { projection: { entityId: 1 } }).sort({ entityId: 1 })) yield String(doc.entityId); }
}

PersistSignalAdapter.usePersistSignalAdapter(MongoPersist);
PersistRiskAdapter.usePersistRiskAdapter(MongoPersist);
```

**When to choose:** *Redis* — high-performance distributed systems, multiple instances, TTL cleanup, pub/sub. *MongoDB* — rich queries, aggregation pipelines, large datasets. *PostgreSQL* — ACID, complex joins. *File (default)* — single instance, zero deps, inspectable JSON.

### 25.7 Scheduled-signal crash recovery

`PersistScheduleAdapter` is fully independent from `PersistSignalAdapter`, so scheduled (waiting) signals recover separately from pending/active ones. The scheduled-signal row (`IScheduledSignalRow`) carries `exchangeName` and `strategyName` so the framework can **validate** the restored signal belongs to the right strategy/exchange before reinstating it.

```
Before crash:
1. getSignal returns { priceOpen: 50000 } at current price 49500 → scheduled
2. written atomically to ./dump/data/schedule/my-strategy/BTCUSDT.json
3. engine waits for price to reach 50000
4. CRASH at price 49800
After restart (same code):
1. framework reads the scheduled JSON during waitForInit
2. validates exchangeName + strategyName match (security)
3. restores it to _scheduledSignal and fires onSchedule()
4. continues monitoring; activates normally when price reaches 50000
```

The same dual-layer recovery applies to partial milestone levels (`PersistPartial`), breakeven flags (`PersistBreakeven`), risk positions (`PersistRisk`), and the deferred strategy commit queue (`PersistStrategy`) — so a live process can die mid-trade and resume with the exact in-flight state.

### 25.5 Direct use

```typescript
import { PersistBase } from "backtest-kit";
const logs = new PersistBase("trading-logs", "./dump/custom");
await logs.waitForInit(true);
await logs.writeValue("log-1", { timestamp: Date.now(), message: "started" });
const log = await logs.readValue("log-1");
for await (const l of logs.values()) { /* … */ }
for await (const l of logs.filter((x:any) => x.symbol === "BTCUSDT")) { /* … */ }
```

---

## 26. Global configuration reference

Set with `setConfig(partial)` **before running any strategy**. `getConfig()` returns a copy of the current config; `getDefaultConfig()` returns the frozen defaults; `GlobalConfig` is the exported type. For *where in the engine* each key is actually consumed (the consumer file/behavior), see [§40](#40-config-in-practice--where-each-parameter-is-consumed). `setColumns`/`getColumns`/`getDefaultColumns` + `ColumnConfig`/`ColumnModel` customize markdown report columns (`setColumns({ backtest_columns: [...] })`).

### 26.1 Execution & pricing

| Key | Default | Meaning |
| --- | --- | --- |
| `CC_AVG_PRICE_CANDLES_COUNT` | `5` | 1-minute candles used for VWAP. Lower = responsive, higher = stable. |
| `CC_PERCENT_SLIPPAGE` | `0.1` | % slippage per side (applied at entry and exit). |
| `CC_PERCENT_FEE` | `0.1` | % fee per side (total ~0.2% round-trip). |
| `CC_POSITION_ENTRY_COST` | `100` | Default USD cost per entry (used for DCA units and sizing). |

### 26.2 Signal validation & lifetime

| Key | Default | Meaning |
| --- | --- | --- |
| `CC_SCHEDULE_AWAIT_MINUTES` | `120` | Minutes a scheduled signal waits for activation before auto-cancel. |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `0.5` | Minimum TP distance from `priceOpen` (must exceed slippage+fees). |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | `0.5` | Minimum SL distance (avoids instant stop-out on noise). |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `20` | Maximum SL distance (caps single-signal loss). |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `1440` | Max signal lifetime; also default `minuteEstimatedTime`. Use `Infinity` for no timeout. |
| `CC_MAX_SIGNAL_GENERATION_SECONDS` | `180` | Max time `getSignal` may run before being aborted. |
| `CC_BREAKEVEN_THRESHOLD` | `0.2` | Min profit distance from entry to enable breakeven (above cost coverage). |

### 26.3 Candle fetching & anomaly detection

| Key | Default | Meaning |
| --- | --- | --- |
| `CC_GET_CANDLES_RETRY_COUNT` | `3` | Retries for `getCandles`. |
| `CC_GET_CANDLES_RETRY_DELAY_MS` | `5000` | Delay between retries. |
| `CC_MAX_CANDLES_PER_REQUEST` | `1000` | Pagination threshold per API call. |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` | `1000` | Reject candles whose price is this factor below the reference (catches Binance incomplete-candle ~0 prices). |
| `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | `5` | Below this count, use average instead of median for anomaly reference. |
| `CC_ENABLE_CANDLE_FETCH_MUTEX` | `true` | Serialize concurrent fetches of identical candles. |
| `CC_ENABLE_BACKTEST_PARALLEL_SPIN` | `true` | Cooperative round-robin interleaving of parallel backtests after each fetch (skipped when single workload or mutex off). |

### 26.4 Order book & aggregated trades

| Key | Default | Meaning |
| --- | --- | --- |
| `CC_ORDER_BOOK_TIME_OFFSET_MINUTES` | `10` | Time-window size/offset for `getOrderBook`. |
| `CC_ORDER_BOOK_MAX_DEPTH_LEVELS` | `1000` | Default depth levels. |
| `CC_AGGREGATED_TRADES_MAX_MINUTES` | `60` | Window size for `getAggregatedTrades` pagination (Binance constraint). |

### 26.5 Behavior toggles

| Key | Default | Meaning |
| --- | --- | --- |
| `CC_ENABLE_DCA_EVERYWHERE` | `false` | Allow `commitAverageBuy` when price is below `priceOpen` even if not a new extreme. |
| `CC_ENABLE_PPPL_EVERYWHERE` | `false` | Allow partial profit/loss even when it mixes exit directions. |
| `CC_ENABLE_TRAILING_EVERYWHERE` | `false` | Activate trailing without absorption conditions. |
| `CC_ENABLE_LONG_SIGNAL` | `true` | Permit long signals. |
| `CC_ENABLE_SHORT_SIGNAL` | `true` | Permit short signals. |

### 26.6 Report row caps

`CC_MAX_*_MARKDOWN_ROWS` cap how many events each report retains (FIFO eviction). All default to **250** except where noted: `CC_MAX_BACKTEST_MARKDOWN_ROWS`, `CC_MAX_BREAKEVEN_MARKDOWN_ROWS`, `CC_MAX_HEATMAP_MARKDOWN_ROWS`, `CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS`, `CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS`, `CC_MAX_LIVE_MARKDOWN_ROWS`, `CC_MAX_PARTIAL_MARKDOWN_ROWS`, `CC_MAX_RISK_MARKDOWN_ROWS`, `CC_MAX_SCHEDULE_MARKDOWN_ROWS`, `CC_MAX_STRATEGY_MARKDOWN_ROWS`, `CC_MAX_SYNC_MARKDOWN_ROWS`. Larger caps: `CC_MAX_PERFORMANCE_MARKDOWN_ROWS = 10000`, plus storage caps `CC_MAX_NOTIFICATIONS = 500`, `CC_MAX_SIGNALS = 50`, `CC_MAX_LOG_LINES = 1000`, and `CC_WALKER_MARKDOWN_TOP_N = 10`. `CC_REPORT_SHOW_SIGNAL_NOTE = false` toggles the "Note" column across all report tables.

```typescript
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 90,
  CC_AVG_PRICE_CANDLES_COUNT: 7,
  CC_ENABLE_DCA_EVERYWHERE: true,
});
```

---

## 27. Math helpers & utilities

Exported pure functions (no context required):

| Function | Purpose |
| --- | --- |
| `percentDiff(a, b)` | Percentage difference between two values. |
| `percentValue(value, percent)` | `value × percent/100`. |
| `investedCostToPercent(...)` | Convert invested cost to a percentage of basis. |
| `slPriceToPercentShift` / `tpPriceToPercentShift` | Convert an SL/TP price to a % distance from entry. |
| `slPercentShiftToPrice` / `tpPercentShiftToPrice` | The inverse — % distance → absolute SL/TP price. |
| `percentToCloseCost(...)` | Convert a close-percentage to a USD cost amount. |
| `roundTicks(...)` | Round a price to the exchange tick size. |
| `alignToInterval(date, interval)` | Align a date down to an interval boundary (the core look-ahead primitive). |
| `intervalStepMs(interval)` | Milliseconds per interval step. |
| `waitForCandle(...)` | Await the next candle boundary (live). |
| `getBacktestTimeframe(...)` | Generate the array of tick timestamps for a frame. |
| `parseArgs(...)` | CLI-style argument parser. |
| `beginContext(...)` / `beginTime(...)` | Manually establish execution/method context (advanced/testing). |
| `runInMockContext(...)` | Run a function inside a synthetic context (testing). |
| `get(obj, path)` / `set(obj, path, value)` | Safe deep get/set. |
| `validate` / `validateSignal` / `validateCandles` / `validateCommonSignal` / `validatePendingSignal` / `validateScheduledSignal` | Standalone validators. |
| `toProfitLossDto` / `getEffectivePriceOpen` / `getTotalClosed` / `getPriceScale` / `toPlainString` | PNL/DCA helpers ([§12](#12-pnl-dca--effective-price-math)). |
| `waitForReady` | Await framework initialization. |

`Constant` exposes Kelly-tuned partial levels (verified values in `v13.6.0`):

```typescript
Constant.TP_LEVEL1 // 30  → triggers at +3% profit (30% of TP distance)
Constant.TP_LEVEL2 // 60  → +6% profit
Constant.TP_LEVEL3 // 90  → +9% profit
Constant.SL_LEVEL1 // 40  → -2% loss
Constant.SL_LEVEL2 // 80  → -4% loss
```

> These are the level *thresholds* used by the partial-milestone system, not close-percentages. They differ from older docs that listed 100/50/25 — always reference `Constant.*` rather than hardcoding.

`Cache` and `Interval` (exported classes) back the candle cache and interval throttling, and both expose a **memoize-per-interval** wrapper used throughout the reference strategies:

```typescript
Cache.fn(run, { interval: CandleInterval, key?: (args) => K })       // memoize a fetch; recomputes once per interval boundary
Cache.file(run, { interval, name: string, key? })                    // same, persisted to a named file (survives restarts)
Interval.fn(run, { interval: CandleInterval, key? })                 // throttle a fn to at most once per interval
```

Each returns the wrapped function augmented with `.clear()`, `.gc()`, and `.hasValue(...args)`. `Cache.fn(getPrediction, { interval: "8h" })` runs an expensive model train/inference at most once per 8h boundary across all ticks; `Interval.fn(getSignal, { interval: "15m" })` gates signal generation. They are the building blocks behind the strategy examples in [§34](#34-strategy-examples-reference-implementations) and compose with `@backtest-kit/graph` `sourceNode`s. `System`, `Log` (`ILog`, `TLogCtor`), `Markdown`, `Report`, `MarkdownWriter`/`ReportWriter` and the writer base classes (`MarkdownFileBase`, `MarkdownFolderBase`, `ReportBase`, …) support custom report generation. `Strategy`, `Exchange`, `Breakeven` are the lower-level client wrappers. The raw orchestration container is exported as `lib` (`import { lib } from "backtest-kit"`) for deep integration.

---

## 28. Reflection & introspection

`Reflect` plus the `listXxxSchema` functions enable runtime introspection of every registered component:

```typescript
import { listExchangeSchema, listStrategySchema, listFrameSchema,
         listRiskSchema, listSizingSchema, listWalkerSchema, Reflect } from "backtest-kit";

listStrategySchema();   // → registered strategy names
getStrategySchema(name);// → raw IStrategySchema
```

`getRuntimeInfo<Data>()` (from inside a context) returns the full `IRuntimeInfo<Data>`:

```typescript
interface IRuntimeInfo<Data = RuntimeData> {
  symbol: string;
  context: { strategyName; exchangeName; frameName };
  backtest: boolean;
  range: IRuntimeRange | null;   // backtest frame { from, to }; null in live
  currentPrice: number;
  info: Data | null;             // IStrategySchema.info payload
  when: Date;
}
```

This is exactly the object passed to `Cron` handlers ([§18](#18-cron-virtual-time-scheduler)).

---

## 29. AI strategy optimizer

The Optimizer (`@backtest-kit/ollama`: `addOptimizerSchema`, `Optimizer`) uses an LLM to generate strategies from historical data and emit executable code.

**Flow:** (1) fetch historical data from your sources; (2) build LLM conversation context per training period; (3) LLM analyzes patterns and produces strategy logic; (4) export complete executable code with a Walker for validation on an unseen test period.

```typescript
import { addOptimizerSchema, Optimizer } from "@backtest-kit/ollama";

addOptimizerSchema({
  optimizerName: "btc-optimizer",
  rangeTrain: [
    { note: "Bull Q1", startDate: new Date("2024-01-01"), endDate: new Date("2024-03-31") },
    { note: "Consolidation Q2", startDate: new Date("2024-04-01"), endDate: new Date("2024-06-30") },
  ],
  rangeTest: { note: "Validation Q3", startDate: new Date("2024-07-01"), endDate: new Date("2024-09-30") },
  source: [
    { name: "backtest-results", fetch: async ({ symbol, startDate, endDate, limit, offset }) => db.getBacktestResults({ symbol, startDate, endDate, limit, offset }) },
    { name: "market-indicators", fetch: async (a) => db.getIndicators(a) },
  ],
  getPrompt: async (symbol, messages) => `Create a multi-timeframe strategy with R/R ≥ 1.5:1 …`,
  template: {
    getUserMessage: async (symbol, data, sourceName) => `Analyze ${sourceName}:\n${JSON.stringify(data)}`,
    getAssistantMessage: async (symbol, data, sourceName) => `Analyzed ${sourceName}`,
  },
  callbacks: {
    onSourceData: async (symbol, sourceName, data) => console.log(`fetched ${data.length} from ${sourceName}`),
    onData: async (symbol, strategies) => console.log(`generated ${strategies.length}`),
    onCode: async (symbol, code) => console.log(`${code.length} bytes`),
    onDump: async (symbol, filepath) => console.log(`saved ${filepath}`),
  },
});

await Optimizer.dump("BTCUSDT", { optimizerName: "btc-optimizer" }, "./generated");
// → ./generated/btc-optimizer_BTCUSDT.mjs
```

API: `Optimizer.getData(symbol, { optimizerName })` (metadata + LLM conversation), `Optimizer.getCode(symbol, { optimizerName })` (string), `Optimizer.dump(symbol, { optimizerName }, path?)`. Sources are auto-paginated (25 records/request). Generated files default to model `gpt-oss:20b`, multi-timeframe (1h/15m/5m/1m), structured JSON output, and debug logging to `./dump/strategy`. Best practice: 2–4 diverse training regimes, always validate on `rangeTest`, ensure source rows have unique IDs for dedup.

---

## 30. Strategy examples

Reference implementations in [`example/content/`](https://github.com/tripolskypetr/backtest-kit/tree/master/example):

| Strategy | Mechanism |
| --- | --- |
| **Neural Network (Oct 2021)** | TensorFlow FFN (8→6→4→1) retrained every 8h predicts next-candle close; LONG with 1% trailing TP when price < prediction. |
| **Pine Script Range Breakout (Dec 2025)** | `@backtest-kit/pinets` runs `btc_dec2025_range.pine` on 1h candles; fires on confirmed BB/range/volume breakouts. |
| **Signal Inversion (Jan 2026)** | Takes a real Telegram channel's signals, enters the same zone/time but **inverts** direction to fade the crowd. |
| **AI News Sentiment (Feb 2026)** | Every 4–8h fetches news via Tavily, asks Ollama for bullish/bearish/wait, flips positions on conflict. **+16.99% during a −16.4% month.** |
| **SHORT DCA Ladder (Mar 2026)** | SHORT on every pending signal, adds up to 10 rungs on upward spikes outside a ±1–5% band; closes at 0.5% blended profit. |
| **LONG DCA Ladder (Apr 2026)** | LONG-biased, 3% target. ~2.4 entries/trade avg; **+67.85% PNL on deployed capital**, drawdown −2.59% vs −3.99% without DCA. |
| **Python EMA Crossover (Feb 2021)** | WASI/WebAssembly Python strategy; EMA(9)×EMA(21) crossover confirmed by 4h range midpoint. |

The recommended starting point is the [reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example) — a complete news-sentiment AI system with LLM forecasting, multi-timeframe data, and a documented Feb 2026 backtest.

> Full annotated source + documented results for all eight examples is in [§34](#34-strategy-examples-reference-implementations).

---

## 31. Architecture overview

Clean-architecture layering:

- **Client layer** — pure business logic, no DI: `ClientStrategy`, `ClientExchange`, `ClientFrame`, `ClientRisk`, `ClientSizing`, `ClientPartial`, `ClientBreakeven`, `ClientAction`.
- **Service layer** (DI, organized by responsibility):
  - *Schema services* — registry pattern for configuration (`add*`/`get*`/`list*`).
  - *Connection services* — memoized client-instance creators.
  - *Global services* — context wrappers behind the public API.
  - *Logic/command services* — async-generator orchestration for backtest/live.
  - *Meta services* — `TimeMetaService`, `RuntimeMetaService`, etc.
  - *Markdown/report services* — per-domain report accumulators.
- **Persistence layer** — 15 crash-safe atomic file domains, each adapter-replaceable ([§25](#25-persistence-adapters)).
- **Context layer** — `ExecutionContextService` (clock) + `MethodContextService` (identity) over `AsyncLocalStorage`.

Two equivalent run forms over the **same engine**: event-driven `background(...)` + listeners, or pull-based `for await (... of run(...))`.

---

## 32. Complete public export index

Everything below is exported from the `backtest-kit` package root.

**Schema registration:** `addExchangeSchema` `addStrategySchema` `addFrameSchema` `addRiskSchema` `addSizingSchema` `addWalkerSchema` `addActionSchema` · `overrideExchangeSchema` `overrideStrategySchema` `overrideFrameSchema` `overrideRiskSchema` `overrideSizingSchema` `overrideWalkerSchema` `overrideActionSchema` · `getStrategySchema` `getExchangeSchema` `getFrameSchema` `getWalkerSchema` `getSizingSchema` `getRiskSchema` `getActionSchema` · `listExchangeSchema` `listStrategySchema` `listFrameSchema` `listWalkerSchema` `listSizingSchema` `listRiskSchema`

**Runners & analytics:** `Backtest` `Live` `Walker` `Heat` `Schedule` `Partial` `Position` `HighestProfit` `MaxDrawdown` `Risk` `Performance` `Sync` `Lookup` `PositionSize` `Reflect` `Constant`

**Commit functions:** `commitCreateSignal` `commitClosePending` `commitCancelScheduled` `commitActivateScheduled` `commitAverageBuy` `commitSignalNotify` `commitPartialProfit` `commitPartialLoss` `commitPartialProfitCost` `commitPartialLossCost` `commitTrailingStop` `commitTrailingTake` `commitTrailingStopCost` `commitTrailingTakeCost` `commitBreakeven`

**Strategy context queries:** `getPendingSignal` `getScheduledSignal` `hasNoPendingSignal` `hasNoScheduledSignal` `getBreakeven` `getStrategyStatus` `getTotalPercentClosed` `getTotalCostClosed` `getLatestSignal` `getMinutesSinceLatestSignalCreated`

**Position analytics:** `getPositionEffectivePrice` `getPositionInvestedCount` `getPositionInvestedCost` `getPositionPnlPercent` `getPositionPnlCost` `getPositionLevels` `getPositionPartials` `getPositionEntries` `getPositionEstimateMinutes` `getPositionCountdownMinutes` `getPositionActiveMinutes` `getPositionWaitingMinutes` `getPositionHighestProfitPrice` `getPositionHighestProfitTimestamp` `getPositionHighestPnlPercentage` `getPositionHighestPnlCost` `getPositionHighestProfitBreakeven` `getPositionHighestProfitMinutes` `getPositionDrawdownMinutes` `getPositionMaxDrawdownMinutes` `getPositionMaxDrawdownPrice` `getPositionMaxDrawdownTimestamp` `getPositionMaxDrawdownPnlPercentage` `getPositionMaxDrawdownPnlCost` `getPositionHighestMaxDrawdownPnlCost` `getPositionHighestMaxDrawdownPnlPercentage` `getPositionHighestProfitDistancePnlCost` `getPositionHighestProfitDistancePnlPercentage` `getPositionEntryOverlap` `getPositionPartialOverlap` `getMaxDrawdownDistancePnlCost` `getMaxDrawdownDistancePnlPercentage`

**Exchange data:** `getCandles` `getRawCandles` `getNextCandles` `getAveragePrice` `getClosePrice` `getAggregatedTrades` `getOrderBook` `formatPrice` `formatQuantity` `hasTradeContext` · cache: `warmCandles` `checkCandles` `cacheCandles`

**Meta / context:** `getDate` `getTimestamp` `getMode` `getContext` `getSymbol` `getRuntimeInfo` · `createSignalState` `getSignalState` `setSignalState` `getSessionData` `setSessionData` `runInMockContext`

**Memory / dump:** `writeMemory` `readMemory` `removeMemory` `searchMemory` `listMemory` · `dumpAgentAnswer` `dumpRecord` `dumpTable` `dumpText` `dumpError` `dumpJson`

**Control & setup:** `stopStrategy` `shutdown` `waitForReady` `setLogger` `setConfig` `getConfig` `getDefaultConfig` `setColumns` `getColumns` `getDefaultColumns`

**Events:** `listenSignal(+Once/Backtest/Live)` `listenError` `listenExit` `listenDoneLive` `listenDoneBacktest` `listenDoneWalker` `listenBacktestProgress` `listenPerformance` `listenWalker(+Once/Complete/Progress)` `listenValidation` `listenPartialLossAvailable(+Once)` `listenPartialProfitAvailable(+Once)` `listenBreakevenAvailable(+Once)` `listenRisk(+Once)` `listenSchedulePing(+Once)` `listenActivePing(+Once)` `listenIdlePing(+Once)` `listenStrategyCommit(+Once)` `listenSync(+Once)` `listenHighestProfit(+Once)` `listenMaxDrawdown(+Once)` `listenSignalNotify(+Once)` `listenBeforeStart(+Once)` `listenAfterEnd(+Once)` · `emitters`

**Broker / Cron / persistence:** `Broker` `BrokerBase` `IBroker` `TBrokerCtor` + all `Broker*Payload` types · `Cron` (`CronEntry` `CronHandle` `CronCallback`) · `PersistBase` + the 15-domain `Persist*Adapter` / `IPersist*Instance` / `Persist*Instance` / `*Data` sets · `Session`/`Storage`/`Recent`/`Memory`/`State`/`Notification`/`Dump` utility classes & variants

**Models & types:** `BacktestStatisticsModel` `LiveStatisticsModel` `HeatmapStatisticsModel` `ScheduleStatisticsModel` `PerformanceStatisticsModel` `WalkerStatisticsModel` `PartialStatisticsModel` `HighestProfitStatisticsModel` `MaxDrawdownStatisticsModel` `RiskStatisticsModel` `BreakevenStatisticsModel` `StrategyStatisticsModel` · `NotificationModel` (+ all notification variants) · `MessageModel` · `ColumnModel` · all `I*Schema` / `I*` interfaces and `*Name` aliases listed throughout this document.

**Math & utils:** `percentDiff` `percentValue` `investedCostToPercent` `slPriceToPercentShift` `tpPriceToPercentShift` `slPercentShiftToPrice` `tpPercentShiftToPrice` `percentToCloseCost` · `alignToInterval` `intervalStepMs` `waitForCandle` `roundTicks` `parseArgs` `beginContext` `beginTime` `get` `set` `getBacktestTimeframe` · `validate` `validateSignal` `validateCandles` `validateCommonSignal` `validatePendingSignal` `validateScheduledSignal` · `toProfitLossDto` `toPlainString` `getEffectivePriceOpen` `getTotalClosed` `getPriceScale` · `lib`

---

## Notes for language models

- **Version:** this document tracks `backtest-kit@13.6.0`. Verify the installed version before relying on a signature; the API has grown substantially across major versions.
- **Context requirement:** strategy context functions (`getCandles`, `getAveragePrice`, `commit*`, `getPosition*`, `dump*`, memory/state/session) throw outside an active execution+method context. Only call them from inside `getSignal` or a strategy callback. Guard with `hasTradeContext()` when unsure.
- **`getSignal` signature:** `(symbol, when, currentPrice) => Promise<ISignalDto | null>`. Return `null` for no-op ticks.
- **Risk payload field is `currentSignal`** (an `IRiskSignalRow`), not `pendingSignal`.
- **`Constant` levels** are 30/60/90 (TP) and 40/80 (SL) — never hardcode partial levels.
- **Default DCA rule** rejects averaging unless price beats the all-time extreme since entry; relax with `CC_ENABLE_DCA_EVERYWHERE`.
- **Reports** default to `./dump/<domain>/`; persistence data to `./dump/data/`.
- **Always `setConfig`/register adapters before running any strategy.**

---

## 33. Ecosystem packages — detailed API

Each package below is a separate npm module that builds on `backtest-kit`. The exports listed are verified against each package's `src/index.ts`.

### 33.1 `@backtest-kit/pinets` — Pine Script v5/v6 runtime

Run TradingView Pine Script in Node via the [PineTS](https://github.com/QuantForgeOrg/PineTS) runtime — no rewrite, 1:1 syntax, 60+ built-in indicators (`ta.rsi`, `ta.macd`, `ta.ema`, `ta.atr`, `ta.crossover`, …). `getCandles` is wired to backtest-kit's temporal context, so look-ahead protection still applies.

```bash
npm install @backtest-kit/pinets pinets backtest-kit
```

**Exports:** `Code` `File` · `run` `getSignal` `extract` `extractRows` · `usePine` `useIndicator` `setLogger` `dumpPlotData` `toMarkdown` `markdown` `toSignalDto` · `CandleModel` `PlotModel` `PlotRecord` `SymbolInfoModel` · `ILogger` `IPine`/`TPineCtor` `IIndicator`/`TIndicatorCtor` `IProvider` `AXIS_SYMBOL` · `lib`.

**Source loaders:** `File.fromPath(path)` (cached file read) or `Code.fromString(code)` (inline).

```typescript
import { File, getSignal } from "@backtest-kit/pinets";
import { addStrategySchema } from "backtest-kit";

addStrategySchema({
  strategyName: "pine-ema-cross",
  interval: "5m",
  riskName: "demo",
  getSignal: async (symbol) =>
    getSignal(File.fromPath("strategy.pine"), { symbol, timeframe: "1h", limit: 100 }),
});
```

**`getSignal(source, { symbol, timeframe, limit })`** runs the script and maps required plots to an `ISignalDto`. The Pine Script must `plot()` these names:

| Plot | Value | Meaning |
| --- | --- | --- |
| `"Signal"` | `1` / `-1` / `0` | long / short / no-signal |
| `"Close"` | price | entry price |
| `"StopLoss"` | price | SL level |
| `"TakeProfit"` | price | TP level |
| `"EstimatedTime"` | minutes | hold duration (optional, default 240) |

**`run(source, opts) → plots`** returns raw plot data. **`extract(plots, mapping)`** pulls the **latest** bar (missing → `0`); **`extractRows(plots, mapping)`** returns **every** bar as `{ timestamp, … }` rows (missing → `null`). Mapping entries are either a plot name or `{ plot, barsBack?, transform? }`:

```typescript
const data = await extract(plots, {
  rsi: "RSI",
  prevRsi: { plot: "RSI", barsBack: 1 },
  trend: { plot: "ADX", transform: (v) => (v > 25 ? "strong" : "weak") },
});
```

`dumpPlotData(id, plots, name, "./dump/ta")` writes plot data to markdown for debugging. `usePine(Pine)` registers a custom Pine constructor; `toSignalDto(id, extracted, …)` converts extracted values to an `ISignalDto`.

### 33.2 `@backtest-kit/graph` — typed DAG of computations

Compose computations as a directed acyclic graph; nodes resolve bottom-up in topological order with `Promise.all` parallelism. TypeScript infers each node's value type through the graph.

```bash
npm install @backtest-kit/graph backtest-kit
```

**Exports:** `sourceNode` `outputNode` `resolve` `deepFlat` `serialize` `deserialize` · `INode` `TypedNode` `IFlatNode` `Value` (`Value = string | number | boolean | null`).

- **`sourceNode(fetch)`** — leaf node. `fetch` receives `(symbol, when, currentPrice, exchangeName)` from the execution context.
- **`outputNode(compute, ...nodes)`** — combines children; `compute(values)` is typed by position from `nodes`.
- **`resolve(node)`** — resolves the graph inside a backtest-kit strategy.

```typescript
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";

const close  = sourceNode(async (symbol, when, price, ex) => (await getCandles(symbol, "1h", 1))[0].close);
const volume = sourceNode(async (symbol, when, price, ex) => (await getCandles(symbol, "1h", 1))[0].volume);
const vwap   = outputNode(([c, v]) => c * v, close, volume); // c,v inferred number

addStrategySchema({ strategyName: "graph", getSignal: () => resolve(vwap) });
```

A multi-timeframe Pine filter composes naturally — a 4h `sourceNode` (trend) + a 15m `sourceNode` (entry) combined in an `outputNode` that returns `null` when the trend disagrees:

```typescript
const mtfSignal = outputNode(
  async ([higher, lower]) => {
    if (higher.noTrades || lower.position === 0) return null;
    if (higher.allowShort && lower.position === 1)  return null;
    if (higher.allowLong  && lower.position === -1) return null;
    return toSignalDto(randomString(), lower, null);
  },
  higherTimeframe, lowerTimeframe,
);
```

`serialize(roots) → IFlatNode[]` flattens the graph for DB storage (replacing object refs with `nodeIds`); `deserialize(flat) → INode[]` rebuilds it (you re-attach `fetch`/`compute` afterward — they are not serialized). `deepFlat(nodes)` returns all nodes in topological order, deduplicated. `INode` is the untyped runtime/storage shape; `TypedNode` is the authoring union with full inference.

### 33.3 `@backtest-kit/ollama` — multi-provider LLM + Optimizer

Unified higher-order-function wrapper over **13 providers**, structured JSON output via `agent-swarm-kit` outlines, plus the AI strategy `Optimizer`.

```bash
npm install @backtest-kit/ollama backtest-kit agent-swarm-kit
```

**Provider HOFs** — `(fn, model, apiKey?) => fn` (wraps an async fn with inference context via `di-scoped`):

| Function | Provider | Base URL |
| --- | --- | --- |
| `gpt5` | OpenAI | `api.openai.com/v1/` |
| `claude` | Anthropic | `api.anthropic.com/v1/` |
| `deepseek` | DeepSeek | `api.deepseek.com/` |
| `grok` | xAI | `api.x.ai/v1/` |
| `groq` | Groq | (Groq cloud) |
| `mistral` | Mistral | `api.mistral.ai/v1/` |
| `perplexity` | Perplexity | `api.perplexity.ai/` |
| `cohere` | Cohere | `api.cohere.ai/compatibility/v1/` |
| `alibaba` | Alibaba | `dashscope-intl.aliyuncs.com/compatible-mode/v1/` |
| `hf` | HuggingFace | `router.huggingface.co/v1/` |
| `ollama` | Ollama | `localhost:11434/` |
| `glm4` | Zhipu AI | `open.bigmodel.cn/api/paas/v4/` |

(`groq` is exported but omitted from the README provider table.) Pass an **array** of keys for automatic token rotation: `ollama(fn, "llama3.3:70b", ["k1","k2","k3"])`.

**Prompt assembly:** `Module.fromPath(path, baseDir?)` (default baseDir `{cwd}/config/prompt/`) loads a `.cjs` prompt module; `Prompt.fromPrompt(source)` takes an inline `PromptModel`; `commitPrompt(source, history)` appends the assembled system/user messages to a `MessageModel[]`.

```typescript
type PromptModel = { system?: string[] | SystemPromptFn; user: string | UserPromptFn };
// both fns receive (symbol, strategyName, exchangeName, frameName, backtest)
```

```typescript
import { deepseek, Module, commitPrompt, MessageModel } from "@backtest-kit/ollama";
import { json } from "agent-swarm-kit";

const signalModule = Module.fromPath("./signal.prompt.cjs");
const getSignal = async () => {
  const messages: MessageModel[] = [];
  await commitPrompt(signalModule, messages);
  const { data } = await json("SignalOutline", messages); // outline registered via addOutline
  return data;
};
addStrategySchema({ strategyName: "llm-signal", interval: "5m",
  getSignal: deepseek(getSignal, "deepseek-chat", process.env.DEEPSEEK_API_KEY) });
```

Structured output uses `agent-swarm-kit`'s `addOutline({ outlineName, completion: CompletionName.RunnerOutlineCompletion, format, getOutlineHistory, validations })` with either a Zod `zodResponseFormat(...)` or a plain JSON `IOutlineFormat`. `CompletionName` is the exported completion-name enum.

**Optimizer** (also re-summarized in [§29](#29-ai-strategy-optimizer)) — `addOptimizerSchema(schema: IOptimizerSchema)`, `Optimizer.getData/getCode/dump`, `getOptimizerSchema`, `listOptimizerSchema`, `listenOptimizerProgress`, `ProgressOptimizerContract`. Interfaces: `IOptimizerSchema` `IOptimizerSource` `IOptimizerRange` `IOptimizerStrategy` `IOptimizerData` `IOptimizerTemplate` `IOptimizerCallbacks` `IOptimizerFetchArgs` `IOptimizerFilterArgs`. Also exported: `dumpSignalData`, `validate`, `setLogger`, `lib`.

### 33.4 `@backtest-kit/signals` — 50+ indicators across 4 timeframes

Computes multi-timeframe technical analysis and emits markdown reports formatted for LLM context injection.

```bash
npm install @backtest-kit/signals backtest-kit
```

**Exports:** orchestrators `commitHistorySetup` `commitBookDataReport` · histories `commitOneMinuteHistory` `commitFifteenMinuteHistory` `commitThirtyMinuteHistory` `commitHourHistory` · indicator maths `commitMicroTermMath` `commitShortTermMath` `commitSwingTermMath` `commitLongTermMath` · `setLogger` · `lib`. Each `commit*` appends a markdown report to a `MessageModel[]`.

```typescript
import { commitHistorySetup } from "@backtest-kit/signals";
const messages = [{ role: "system", content: "You are a trading bot." }];
await commitHistorySetup("BTCUSDT", messages); // order book + 1m/15m/30m/1h candles + all 4 indicator sets
const signal = await llm(messages);
```

Timeframe tiers: **MicroTerm** (1m, 60 candles — scalping), **ShortTerm** (15m, 144 — day trading), **SwingTerm** (30m, 96 — swing), **LongTerm** (1h, 100 — trend). Indicators include RSI, MACD, Bollinger, Stochastic, ADX, ATR, CCI, Fibonacci, support/resistance, volume trend, squeeze, order-book imbalance `= (bidVol − askVol)/(bidVol + askVol)`. Per-timeframe caching (1m → 1 min TTL … 1h → 30 min), cleared automatically on error.

### 33.5 `@backtest-kit/mongo` — MongoDB + Redis persistence

Replaces file-based `./dump/` with all 15 persist adapters on MongoDB (source of truth) + Redis (O(1) `_id` cache). Strategy code unchanged.

```bash
npm install @backtest-kit/mongo backtest-kit mongoose ioredis
```

**Exports:** `setup(config?)` `install()` `setConfig(config)` `getConfig()` `setLogger(logger)` `getMongo()` `getRedis()` `waitForInit()` `BaseCRUD` `BaseMap`.

```typescript
import { setup } from "@backtest-kit/mongo";
setup(); // reads env vars; call once before any trading op
// or explicit:
setup({ CC_MONGO_CONNECTION_STRING: "mongodb://mongo:27017/db", CC_REDIS_HOST: "redis", CC_REDIS_PORT: 6379, CC_REDIS_PASSWORD: "secret" });
```

`setup()` configures **and** registers all adapters; `install()` registers only (when config came from env/`setConfig`). Env vars: `CC_MONGO_CONNECTION_STRING` (default `mongodb://localhost:27017/backtest-kit?wtimeoutMS=15000`), `CC_REDIS_HOST` (`127.0.0.1`), `CC_REDIS_PORT` (`6379`), `CC_REDIS_USER`, `CC_REDIS_PASSWORD`. Explicit args override env.

Collections & unique indexes: `candle-items` (`symbol+interval+timestamp`, **immutable** via `$setOnInsert`), `signal-items`/`schedule-items` (`symbol+strategyName+exchangeName`), `risk-items` (`riskName+exchangeName`), `partial-items`/`breakeven-items` (`…+signalId`), `storage-items` (`backtest+signalId`), `notification-items` (`backtest+notificationId`), `log-items` (`entryId`), `measure-items`/`interval-items` (`bucket+entryKey`), `memory-items` (`signalId+bucketName+memoryId`), `recent-items` (`symbol+strategyName+exchangeName+frameName+backtest`), `state-items` (`signalId+bucketName`), `session-items` (`strategyName+exchangeName+frameName`). Writes are atomic `findOneAndUpdate(..., { upsert: true, new: true })` then Redis `SET`, guaranteeing read-after-write. Measure/Interval/Memory use **soft delete** (`removed: true`). Signal-affecting domains store `when: Number` for look-ahead protection (Measure is exempt — it caches LLM/API responses).

### 33.6 `@backtest-kit/ui` — full-stack dashboard

Node backend + React 18 / MUI 5 / Lightweight-Charts dashboard for signals, candles, risk, notifications.

```bash
npm install @backtest-kit/ui backtest-kit ccxt
```

**Exports:** `serve(host?, port?)` `getRouter()` `setLogger(logger)` `SymbolModel` `getModulesPath()` `getPublicPath()` `lib`.

```typescript
import { serve } from "@backtest-kit/ui";
serve("0.0.0.0", 60050); // dashboard at http://localhost:60050
```

`getRouter()` returns an Express-compatible router for embedding in your own server. Views: Signal Opened/Closed/Scheduled/Cancelled, Risk Rejection, Partial Profit/Loss, Trailing Stop/Take, Breakeven — each with a detail form, 1m/15m/1h charts, and JSON export.

**Dashboard revenue math** — revenue per window is the dollar sum `Σ signal.pnl.pnlCost` over closed signals, where `pnlCost = pnlPercentage/100 × pnlEntries` and `pnlEntries = Σ entry.cost`. The anchor is the latest `updatedAt` in backtest mode, `Date.now()` in live. Windows: Today, Yesterday, 7d, 31d. Effective entry through DCA + partials uses the same cost-basis replay as [§12](#12-pnl-dca--effective-price-math) (`effectivePrice = Σcost / Σ(cost/price)`), and the per-partial fee/slippage-weighted PNL of `toProfitLossDto`.

### 33.7 `@backtest-kit/cli` — zero-boilerplate runner

The lightest possible runner for a solo quant *and* a monorepo-grade runner for a desk of strategies — the same tool, no rewrite when the business scales. Point it at a strategy entry file, choose a mode, and it resolves exchange connectivity, candle caching, the UI dashboard, Telegram alerts, broker wiring, persistence, and graceful shutdown for you. The strategy file only registers schemas via `backtest-kit`; the CLI is purely the runner.

```bash
npm install @backtest-kit/cli backtest-kit ccxt
# or run once without installing:
npx @backtest-kit/cli --backtest ./src/index.mjs --symbol BTCUSDT
npx @backtest-kit/cli --init --output backtest-kit-project   # scaffold
npx @backtest-kit/cli --docker                               # docker workspace
```

The bin is `backtest-kit` (so `npx @backtest-kit/cli` ≡ the `backtest-kit` executable). **Library exports** (`src/index.ts`, for embedding the runner): `Setup`, `setLogger`, `run`, `cli` (DI container), and the `ILogger` / `ILoader` / `IBabel` / `ExchangeName` / `FrameName` types.

#### Modes

Exactly one positional argument — the path to the strategy entry file — is required (set once in `package.json` scripts). Each mode maps to a `main/*` handler:

| Mode | Flag | Description |
| --- | --- | --- |
| Backtest | `--backtest` | Run on historical candles using a registered `FrameSchema`. |
| Walker | `--walker` | A/B-compare multiple strategy files on the same history; ranked report. |
| Paper | `--paper` | Live prices, no real orders (identical code path to live). |
| Live | `--live` | Real trades via the exchange API + broker adapter. |
| Main | `--main` | Run a custom entry point with the full prepared environment but **no** trading harness. |
| UI | `--ui` | Start `@backtest-kit/ui` at `http://localhost:60050`. |
| Telegram | `--telegram` | HTML trade notifications with 1m/15m/1h charts. |
| PineScript | `--pine` | Run a local `.pine` indicator against exchange data. |
| Pine Editor | `--editor` | Browser-based Pine Script editor (`?pine=1` on the UI server). |
| Candle Dump | `--dump` | Fetch + save raw OHLCV to a file. |
| PnL Debug | `--pnldebug` | Simulate per-minute PnL for an entry price + direction. |
| Broker Debug | `--brokerdebug` | Fire a single broker commit against the live adapter (`--commit`, default `signal-open`). |
| Flush | `--flush` | Delete report/log/markdown/agent folders from the dump dir. |
| Init | `--init` | Scaffold a new project. |
| Docker | `--docker` | Generate a docker-compose workspace. |

#### Common flags

`--symbol` (default `BTCUSDT`), `--strategy` / `--exchange` / `--frame` (default: first registered), `--cacheInterval` (default `"1m, 15m, 30m, 4h"`), `--ui`, `--telegram`, `--verbose` (log each candle fetch), `--noCache` (skip cache warming), `--noFlush` (keep output folders). If no exchange is registered, the CLI auto-registers a CCXT Binance schema.

```json
{
  "scripts": {
    "backtest": "npx @backtest-kit/cli --backtest ./src/index.mjs",
    "paper":    "npx @backtest-kit/cli --paper    ./src/index.mjs",
    "start":    "npx @backtest-kit/cli --live --ui ./src/index.mjs"
  }
}
```

Before a backtest the CLI removes `report`/`log`/`markdown`/`agent` from the strategy's `dump/`, then warms the candle cache for every `--cacheInterval`; subsequent runs use cached data with no API calls.

#### Walker mode

Each positional argument is a separate strategy entry file; `addWalkerSchema` is called automatically using the exchange + frame the files register (falls back to the last 31 days if no frame). Walker-specific flags: `--output` (base name, default `walker_{SYMBOL}_{TIMESTAMP}`), `--json` (save `Walker.getData()` to `./dump/<output>.json`), `--markdown` (save `Walker.getReport()` to `./dump/<output>.md`); no flag → print Markdown to stdout.

```bash
npx @backtest-kit/cli --walker --symbol BTCUSDT --noCache --markdown --output cmp \
  ./content/v1.strategy.ts ./content/v2.strategy.ts ./content/v3.strategy.ts   # → ./dump/cmp.md
```

#### Main mode & `--entry` (multi-symbol fan-out)

`--main <entry>` loads the full environment (`.env`, `config/setup.config`, `config/loader.config`, `./modules/main.module`, cwd → entry dir, SIGINT wiring) but **starts no harness** — your entry decides what to run. Any `Backtest`/`Live`/`Walker.background()` your code launches is still managed (auto-exit on `listenDone*`, first Ctrl+C stops all via `*.list()`/`*.stop()`, second force-quits).

`--entry <file>` is a **modifier** combined with exactly one of `--backtest`/`--live`/`--paper`/`--walker`: the CLI does only the boilerplate (Setup, providers, the matching `./modules/<mode>.module`, SIGINT, `shutdown()`), and **you** pick the symbol set + call `*.background()` per symbol — the way to fan one strategy across many symbols in one process:

```javascript
// src/multi-symbol.mjs — run with: npx @backtest-kit/cli --backtest --entry ./src/multi-symbol.mjs
import { addExchangeSchema, addFrameSchema, addStrategySchema, Backtest } from "backtest-kit";
// … register schemas …
for (const symbol of ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]) {
  Backtest.background(symbol, { strategyName: "my-strategy", exchangeName: "binance", frameName: "feb-2026" });
}
```

#### Monorepo & per-strategy isolation

When the CLI loads an entry file it `process.chdir()`s to that file's directory, loads the root `.env` then the strategy `.env` (override). So `dump/`, `modules/`, `template/`, and `config/` resolve **inside the strategy folder**. Each strategy gets an isolated candle cache (`./dump/data/candle/`), reports (`./dump/`), broker modules (`./modules/{live,paper,backtest,walker,main,brokerdebug}.module.{ts,mjs,cjs}`), Telegram templates (`./template/*.mustache`), and env.

#### Shared import aliases

Every **top-level folder** in `process.cwd()` becomes a bare import alias inside strategy files — no config: `import { calcRSI } from "math/rsi"` resolves `<cwd>/math/rsi.ts`, `import { research } from "logic"` resolves `<cwd>/logic/index.ts` (barrel + deep subpaths supported). Add matching `paths` to `tsconfig.json` for editor resolution.

#### Module hooks (broker adapters)

A mode-specific side-effect module registers a `Broker` adapter before the run starts; `.ts`/`.mjs`/`.cjs` tried in order, missing is a soft warning:

| Flag | Module file | Loaded before |
| --- | --- | --- |
| `--live` | `./modules/live.module` | `Live.background()` |
| `--paper` | `./modules/paper.module` | `Live.background()` (paper) |
| `--backtest` | `./modules/backtest.module` | `Backtest.background()` |
| `--walker` | `./modules/walker.module` | `Walker.background()` |
| `--main` | `./modules/main.module` | the custom entry |
| `--brokerdebug` | `./modules/brokerdebug.module` | the broker commit test |
| `--pine` / `--editor` | `./modules/pine.module` / `editor.module` | exchange registration for Pine runs |

The module calls `Broker.useBrokerAdapter(MyBroker); Broker.enable();` ([§17](#17-broker-transactional-live-orders)). In backtest mode broker calls are skipped automatically.

#### Config hooks (`config/*.config`)

Loaded from the project root, each tried as `.ts`/`.cjs`/`.mjs`/`.js`:

- **`config/setup.config`** — side-effect, loaded once before everything. When present, the CLI **skips its own default persistence adapter registration** — your config owns the persistence layer. Typical use: `import { setup } from "@backtest-kit/mongo"; setup();`.
- **`config/loader.config`** — loaded after `setup.config`, **awaited**. Exports `export default async () => {…}` **or** `export const loader = async () => {…}` (never both — `default` wins). Use it to gate the run on an async dependency (verify a Mongo/Redis connection, stitch monorepo packages, warm caches, run migrations).
- **`config/alias.config`** — global module-import override (`{ moduleName: replacement }`), or an async factory resolving to that shape (same `default`-vs-`loader` rule). Replaces a heavy dep with a stub, mocks an API in CI, or aliases an ESM-only module so `require("nanoid")` transparently gets the dynamic import. Process-wide, not per-strategy.
- **`config/symbol.config`** (UI symbol list — `export const symbol_list = [...]`) and **`config/notification.config`** (UI notification category toggles), each resolved strategy-dir → project-root → package default.
- **`config/telegram.config`** — `export default { getOpenedMarkdown, getClosedMarkdown, getScheduledMarkdown, getCancelledMarkdown, getRiskMarkdown, getPartialProfitMarkdown, getPartialLossMarkdown, getBreakevenMarkdown, getTrailingTakeMarkdown, getTrailingStopMarkdown, getAverageBuyMarkdown, getSignalOpenMarkdown, getSignalCloseMarkdown, getCancelScheduledMarkdown, getClosePendingMarkdown, getSignalInfoMarkdown }` — each optional, receives the typed event, returns `Promise<string>`; unimplemented ones fall back to the Mustache template.

#### Entry-point formats & Pine mode

Auto-detected: `.ts` (via `tsx`/`tsImport`, cross-format imports), `.mjs` (native `import()`, top-level await), `.cjs` (native `require()`).

`--pine <file.pine>` runs a local indicator against exchange data and prints a Markdown table (columns = the names of `plot(..., display=display.data_window)` calls; other plots ignored). Flags: `--timeframe` (default `15m`), `--limit` (default `250` — must cover indicator warmup or rows show `N/A`), `--when` (ISO 8601 or Unix ms), `--exchange`, `--output`, `--json`/`--jsonl`/`--markdown` (written to `<pine-dir>/dump/`). `--editor` opens the visual Pine editor at `http://localhost:{CC_WWWROOT_PORT}?pine=1`. Both use `./modules/pine.module` (or `editor.module`) for exchange registration. Env: `CC_WWWROOT_HOST` (`0.0.0.0`), `CC_WWWROOT_PORT` (`60050`), `CC_TELEGRAM_TOKEN`, `CC_TELEGRAM_CHANNEL`.

### 33.8 `@backtest-kit/sidekick` — full-control scaffolder

```bash
npx -y @backtest-kit/sidekick my-trading-bot
cd my-trading-bot && npm start
```

The "eject" of `--init`: every part of the wiring (exchange adapter, frame defs, risk rules, strategy logic, runner) lives as editable source in the generated project. Ships a working multi-timeframe Pine Script strategy — a 4H trend filter (RSI+MACD+ADX → `AllowLong`/`AllowShort`/`AllowBoth`/`NoTrades`) plus a 15m EMA-crossover entry generator confirmed by volume spike and momentum, with Kelly-optimized partial profit taking (33/33/34%), breakeven trailing stop, SL/TP distance risk filters, predefined backtest frames (Feb 2024 bull / Oct–Dec 2025 drops & ranges), Binance via CCXT, `@backtest-kit/ui`, optional Ollama LLM, and a `CLAUDE.md` for AI-assisted iteration.

### 33.9 Quant-math companions

Zero-dependency TypeScript ports of vectorbt-style models, each plugging into the `Exchange` schema:

- **[`garch`](https://www.npmjs.com/package/garch)** — conditional variance of log-returns (GARCH/EGARCH/GJR-GARCH/HAR-RV/NoVaS, auto-selected by QLIKE) → log-normal TP/SL corridor `P·exp(±z·σ)`. Via `Exchange.getCandles`.
- **[`pump-anomaly`](https://www.npmjs.com/package/pump-anomaly)** — coordinated-speculation detection (cross-correlation + union-find author clustering, volume z-scores) → entry/exit plan screened against winner's-curse (DSR/PBO/SPA). Via `Exchange.getRawCandles`.
- **[`volume-anomaly`](https://www.npmjs.com/package/volume-anomaly)** — order-flow intensity (Hawkes branching ratio, CUSUM, BOCPD) → composite outlier score as an entry-timing gate. Via `Exchange.getAggregatedTrades`.

---

---

## 34. Strategy examples (reference implementations)

Eight production-quality backtests live in [`example/content/*.strategy/`](https://github.com/tripolskypetr/backtest-kit/tree/master/example/content), each a single `*.strategy.ts` file plus a `README.md` with price context, full trade log, equity curve, and env vars. All run through `@backtest-kit/cli`:

```bash
npm start -- --backtest --symbol TRXUSDT ./content/jan_2026.strategy/jan_2026.strategy.ts
```

### 34.1 Index (documented results)

| Strategy | Ticker | Period | Signal source | Net PNL | Sharpe |
| --- | --- | --- | --- | --- | --- |
| Feb 2021 — Python EMA Crossover | DOTUSDT | Feb 2021 | EMA(9)/EMA(21) crossover via WebAssembly Python | +5.52% | 0.09 |
| Apr 2024 — Polymarket Δprob | BTCUSDT | Apr 2024 | Polymarket "yes" probability shifts | +0.63% | 0.055 |
| Oct 2021 — TensorFlow NN | BTCUSDT | Oct 2021 | NN predicting next-candle close | +18.26% | 0.31 |
| Dec 2025 — Pine Range Breakout | BTCUSDT | Dec 2025 | Pine BB + range + volume spike | +2.40% | 0.06 |
| Jan 2026 — Liquidity Harvesting | TRXUSDT | Jan 2026 | Telegram channel signals (inverted) | +8.58% | 1.14 |
| Feb 2026 — AI News Sentiment | BTCUSDT | Feb 2026 | LLM forecast on live news (Tavily + Ollama) | +16.99% | 0.25 |
| Mar 2026 — SHORT DCA Ladder | BTCUSDT | Mar 2026 | Fixed SHORT + DCA ladder up (≤10 rungs) | +37.83% | 0.35 |
| Apr 2026 — LONG DCA Ladder | BTCUSDT | Apr 2026 | Fixed LONG + DCA ladder down (≤10 rungs) | +67.85% | 0.12 |

Recurring idioms across all eight: `Position.moonbag(...)` for entry, `minuteEstimatedTime: Infinity` (manage the exit manually), `Cache.fn`/`Cache.file` to memoize an expensive computation per candle boundary, and `listenActivePing` for dynamic exit (trailing take, target PNL, sentiment flip, peak staleness).

### 34.2 Mar/Apr 2026 — DCA ladder (the core DCA pattern)

The two ladder strategies are nearly identical; only `position`, `TARGET_PROFIT`, and the band orientation differ. This is the canonical DCA implementation:

```typescript
import {
  addStrategySchema, listenActivePing, listenError, Log, Position,
  commitClosePending, getPositionPnlPercent, getPositionEntryOverlap,
  getPositionEntries, commitAverageBuy,
} from "backtest-kit";

const HARD_STOP = 25.0;          // wide hard stop — DCA needs room
const TARGET_PROFIT = 3;         // 0.5 for the SHORT (Mar), 3 for the LONG (Apr)
const LADDER_STEP_COST = 100;    // $100 per rung
const LADDER_UPPER_STEP = 5;     // band above last entry  (Mar: 1)
const LADDER_LOWER_STEP = 1;     // band below last entry  (Mar: 5)
const LADDER_MAX_STEPS = 10;     // cap rungs

addStrategySchema({
  strategyName: "apr_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => ({
    position: "long",
    ...Position.moonbag({ position: "long", currentPrice, percentStopLoss: HARD_STOP }),
    minuteEstimatedTime: Infinity,
    cost: LADDER_STEP_COST,
  }),
});

// Add a rung on each ping when price has moved outside the spacing band and we are under the cap.
listenActivePing(async ({ symbol, currentPrice }) => {
  const { length: steps } = await getPositionEntries(symbol);
  if (steps >= LADDER_MAX_STEPS) return;
  const hasOverlap = await getPositionEntryOverlap(symbol, currentPrice, {
    upperPercent: LADDER_UPPER_STEP, lowerPercent: LADDER_LOWER_STEP,
  });
  if (hasOverlap) return;                       // too close to an existing entry — skip
  await commitAverageBuy(symbol, LADDER_STEP_COST);
});

// Close the whole blended position once target PNL is hit.
listenActivePing(async ({ symbol }) => {
  if ((await getPositionPnlPercent(symbol)) < TARGET_PROFIT) return;
  await commitClosePending(symbol, { id: "unknown", note: "# closed at target PNL" });
});
```

Apr 2026 deployed ~2.4 entries/trade on average for **+67.85%** on deployed capital with a tighter drawdown than a single entry. Mar 2026 mirrors it on the short side with a 0.5% target and inverted band, **+37.83%**.

### 34.3 Feb 2026 — AI news sentiment (LLM + graph)

Combines `@backtest-kit/graph` (`sourceNode`/`outputNode`/`resolve`), `Cache.file` (persist the daily forecast), and sentiment-flip exit. Achieved **+16.99% during a −16.4% month** (16 trades, 68.8% win rate, profit factor 2.25 — best trade +14.28% SHORT on Feb 4).

```typescript
import { addStrategySchema, listenActivePing, commitClosePending, Cache, Position,
  getPositionHighestProfitDistancePnlPercentage, getPositionPnlPercent,
  getMinutesSinceLatestSignalCreated } from "backtest-kit";
import { sourceNode, outputNode, resolve } from "@backtest-kit/graph";
import { forecast } from "logic";   // monorepo alias → LLM forecast over Tavily news

const TRAILING_TAKE = 2.5, HARD_STOP = 3.0, NEWS_WINDOW = 24 * 60;
const POSITION_LABEL_MAP = { bullish: "long", bearish: "short", neutral: "wait", sideways: "wait" } as const;

const forecastSource = sourceNode(
  Cache.file(async (symbol, when, currentPrice) => ({ ...(await forecast(symbol, when)), currentPrice }),
    { interval: "1d", name: "forecast_source" }),
);
const positionOutput = outputNode(async ([f]) => POSITION_LABEL_MAP[f.sentiment], forecastSource);

addStrategySchema({
  strategyName: "feb_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const since = await getMinutesSinceLatestSignalCreated(symbol);
    if (since && since < NEWS_WINDOW) return null;            // ≤ 1 trade / 24h
    const f = await resolve(forecastSource);
    const position = await resolve(positionOutput);
    if (position === "wait" || f.confidence === "not_reliable") return null;
    return { id: `${f.id}_${randomString()}`,
      ...Position.moonbag({ position, currentPrice, percentStopLoss: HARD_STOP }),
      minuteEstimatedTime: Infinity, note: f.reasoning };
  },
});

// Sentiment flip → close.
listenActivePing(async ({ symbol, data }) => {
  const position = await resolve(positionOutput);
  if (position === data.position) return;
  await commitClosePending(symbol, { id: "flip", note: "# sentiment changed" });
});
// Trailing take.
listenActivePing(async ({ symbol }) => {
  if ((await getPositionPnlPercent(symbol)) < 0) return;
  if ((await getPositionHighestProfitDistancePnlPercentage(symbol)) < TRAILING_TAKE) return;
  await commitClosePending(symbol, { id: "unknown", note: "# trailing take" });
});
```

### 34.4 Jan 2026 — liquidity harvesting (Telegram signals, inverted)

Loads 11 real posts from a Telegram channel (`assets/entry.jsonl`), matches `publishedAt` to the current minute, confirms price is inside `entry.from..entry.to`, then enters **counter-trend** (the channel's R:R is ~0.375:1 at 25× — mathematically a losing setup, so the inverse harvests the crowd's liquidity). SL −0.5%, no fixed TP, trailing-take + peak-staleness exits. **+8.58%, Sharpe 1.14** (the highest Sharpe of the set).

```typescript
import { addStrategySchema, listenActivePing, commitClosePending, alignToInterval,
  getClosePrice, getCandles, Position, getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestPnlPercentage, getPositionPnlPercent, getPositionHighestProfitMinutes } from "backtest-kit";

const SIGNALS = readFileSync("./assets/entry.jsonl", "utf-8").split("\n").filter(Boolean).map(JSON.parse);

addStrategySchema({
  strategyName: "jan_2026_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    const signal = SIGNALS.find((s) => s.symbol === symbol &&
      alignToInterval(new Date(s.publishedAt), "1m").getTime() === when.getTime());
    if (!signal) return null;
    const close1m = await getClosePrice(symbol, "1m");
    if (close1m < signal.entry.from || close1m > signal.entry.to) return null;
    const [prev, cur] = await getCandles(symbol, "4h", 2);
    const mid = Math.max(prev.high, cur.high) + Math.max(prev.low, cur.low) / 2;
    const position = close1m > mid ? "short" : "long";       // counter-trend vs 4h range midpoint
    return { position, ...Position.moonbag({ position, currentPrice, percentStopLoss: 1.0 }),
      minuteEstimatedTime: 24 * 60, note: signal.note };
  },
});
// Exit 1: trailing take (close once peak-distance ≥ 1% and currently in profit).
// Exit 2: peak staleness — close if peak PNL ≥ 1% but it occurred ≥ 240 min ago
//   (getPositionHighestPnlPercentage + getPositionHighestProfitMinutes).
```

### 34.5 Oct 2021 — TensorFlow neural network

`Cache.fn(..., { interval: "8h" })` trains an 8→6→4→1 feed-forward net every 8h on 50 normalized candles (`(close−low)/(high−low)`), predicts the next close, and `Interval.fn(..., { interval: "15m" })` opens a LONG (`Position.moonbag`, 1% hard stop) whenever `currentPrice < predictedPrice`. Trailing take at 1% drawdown from peak. **+18.26%, Sharpe 0.31.**

```typescript
const getPrediction = Cache.fn(async (symbol) => {
  const candles = await getCandles(symbol, "8h", 58);
  const model = await trainTrendNetwork(candles.slice(0, 50));
  return predictNextClose(model, candles.slice(50), { low: last.low, high: last.high });
}, { interval: "8h" });

const getSignal = Interval.fn(async (symbol, currentPrice) => {
  const prediction = await getPrediction(symbol);
  return currentPrice < prediction.price
    ? { ...Position.moonbag({ position: "long", currentPrice, percentStopLoss: 1.0 }), minuteEstimatedTime: Infinity }
    : null;
}, { interval: "15m" });

addStrategySchema({ strategyName: "oct_2021_strategy", getSignal: (symbol, when, price) => getSignal(symbol, price) });
```

### 34.6 Dec 2025 — Pine Script range breakout

`Cache.fn(..., { interval: "1h" })` runs `btc_dec2025_range.pine` (RSI 14) via `@backtest-kit/pinets` and `extract`s BB bands, range boundaries, `signal` (±1), `isRanging`, `volSpike`. Opens a fixed ±2% `Position.bracket` on `signal === ±1`, but **skips** if price already moved past the signal-time close or if `isRanging`. **+2.40%, Sharpe 0.06.**

```typescript
import { run, extract, File } from "@backtest-kit/pinets";
const PINE_FILE = File.fromPath("btc_dec2025_range.pine", "./math");
const getPlot = Cache.fn(async (symbol) =>
  extract(await run(PINE_FILE, { symbol, inputs: { rsi_len: 14 }, timeframe: "1h", limit: 100 }),
    { signal: "Signal", close: "Close", isRanging: "IsRanging", volSpike: "VolSpike" /* + BB/range */ }),
  { interval: "1h" });

addStrategySchema({ strategyName: "dec_2025_strategy", getSignal: async (symbol, when, currentPrice) => {
  const plot = await getPlot(symbol);
  if (plot?.signal === 1  && currentPrice <= plot.close && !plot.isRanging)
    return { ...Position.bracket({ position: "long",  currentPrice, percentTakeProfit: 2, percentStopLoss: 2 }), minuteEstimatedTime: Infinity };
  if (plot?.signal === -1 && currentPrice >= plot.close && !plot.isRanging)
    return { ...Position.bracket({ position: "short", currentPrice, percentTakeProfit: 2, percentStopLoss: 2 }), minuteEstimatedTime: Infinity };
  return null;
}});
```

### 34.7 Feb 2021 — Python EMA crossover (WebAssembly)

`Cache.fn(..., { interval: "8h" })` runs a Python indicator (`strategy.py`) over WASI to compute EMA(9)/EMA(21); `Interval.fn(..., { interval: "8h" })` opens a $100 ±2% `Position.bracket` LONG on bullish crossover. 33 trades, 63.6% WR, **+5.52%.** Demonstrates polyglot indicators (Python → WebAssembly) feeding a TypeScript strategy.

### 34.8 Apr 2024 — Polymarket Δprob

`singleshot` loads `assets/polymarket-backtest-result.json`, aggregates to one signal/day (max `|dprob|`), and **strips future-data fields** (`entryPrice`/`exitPrice`) to avoid look-ahead. `getSignal` picks the most recent signal with `timestamp ≤ when`, rejecting it if older than 1h or `|dprob| < 0.10`; positive Δprob → LONG, negative → SHORT, via `Position.moonbag` (1% hard stop). Trailing-take + 24h timeout exits. 10 trades, 70% WR, **+0.63%, Sharpe 0.055.** A clean template for ingesting an external dataset without leaking future data.

---

---

## 35. Raw-library demos (no CLI)

[`demo/*/src/index.mjs`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo) are minimal single-file programs that use **the raw library directly** — no `@backtest-kit/cli`, no scaffold. They are the clearest reference for wiring the engine by hand. Each registers schemas, attaches listeners, and calls `Backtest.background` / `Live.background` itself. (`demo/broker` is CLI-based and excluded here.)

A few APIs these demos exercise that are easy to miss:

- **`Markdown.enable(opts?)`** — turn on markdown report generation (singleshot). Call once before running. Accepts flags `{ backtest, breakeven, heat, … }`.
- **`Exchange.*`** — a **context-free** counterpart to the strategy fetch functions, callable *outside* a strategy by passing `{ exchangeName }` explicitly: `Exchange.getCandles(symbol, interval, limit, { exchangeName })`, `Exchange.getRawCandles(symbol, interval, { exchangeName }, limit?, sDate?, eDate?)`, `Exchange.getAggregatedTrades(symbol, { exchangeName }, limit?)`, `Exchange.getAveragePrice`, `Exchange.getOrderBook`. Use it in setup scripts or to feed quant-math models before a run.
- **`roundTicks(value, tickSize)`** — round a price/quantity to an exchange tick/step size inside `formatPrice`/`formatQuantity`.
- **`dump` takes the context object** — every `*.dump(symbol, { strategyName, exchangeName, frameName })` call spreads straight from a `listen*` event ([§13.1 note](#131-backtest)).

> The demos register risk validations with `validate: ({ pendingSignal, currentPrice }) => …`. In `v13.6.0` the canonical payload field is **`currentSignal`** ([§16](#16-risk-management)); `pendingSignal` appears in older demo code. Prefer `currentSignal` in new strategies.

### 35.1 `demo/backtest` — backtest + reports + risk

The end-to-end backtest skeleton: CCXT Binance exchange, a 1:2 R/R risk profile, a 1-day frame, an LLM `getSignal` (userland `json`/`getMessages`/`dumpSignalData` helpers — **not** core exports), and listeners that dump backtest / risk / partial reports on the matching events.

```typescript
import ccxt from "ccxt";
import { addExchangeSchema, addStrategySchema, addFrameSchema, addRiskSchema,
  Backtest, Partial, Risk, Markdown, listenSignalBacktest, listenDoneBacktest,
  listenBacktestProgress, listenRisk, listenPartialLossAvailable, listenPartialProfitAvailable,
  listenError } from "backtest-kit";

Markdown.enable();

addExchangeSchema({
  exchangeName: "test_exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const ohlcv = await new ccxt.binance().fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
  formatPrice: async (s, price) => price.toFixed(2),
  formatQuantity: async (s, qty) => qty.toFixed(8),
});

addRiskSchema({
  riskName: "demo_risk",
  validations: [
    { note: "TP ≥ 1%", validate: ({ currentSignal, currentPrice }) => {
        const { priceOpen = currentPrice, priceTakeProfit, position } = currentSignal;
        const tp = position === "long" ? (priceTakeProfit - priceOpen) / priceOpen * 100 : (priceOpen - priceTakeProfit) / priceOpen * 100;
        if (tp < 1) throw new Error(`TP ${tp.toFixed(2)}% < 1%`);
    } },
    { note: "R/R ≥ 2:1", validate: ({ currentSignal }) => {
        const { priceOpen, priceTakeProfit, priceStopLoss, position } = currentSignal;
        const reward = position === "long" ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
        const risk   = position === "long" ? priceOpen - priceStopLoss : priceStopLoss - priceOpen;
        if (risk <= 0 || reward / risk < 2) throw new Error("Poor R/R");
    } },
  ],
});

addFrameSchema({ frameName: "test_frame", interval: "1m",
  startDate: new Date("2025-12-01T00:00:00Z"), endDate: new Date("2025-12-01T23:59:59Z") });

addStrategySchema({ strategyName: "test_strategy", interval: "5m", riskName: "demo_risk",
  getSignal: async (symbol) => { /* return an ISignalDto from your model */ } });

Backtest.background("BTCUSDT", { strategyName: "test_strategy", exchangeName: "test_exchange", frameName: "test_frame" });

listenBacktestProgress((e) => console.log(`Progress ${(e.progress * 100).toFixed(2)}% (${e.processedFrames}/${e.totalFrames})`));
listenDoneBacktest(async (e) => await Backtest.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }));
listenRisk(async (e) => await Risk.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }));
listenPartialLossAvailable(async (e) => await Partial.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }));
listenPartialProfitAvailable(async (e) => await Partial.dump(e.symbol, { strategyName: e.strategyName, exchangeName: e.exchangeName, frameName: e.frameName }));
listenError((err) => console.error(err));
```

Note `listenBacktestProgress` carries `{ progress (0–1), processedFrames, totalFrames }`.

### 35.2 `demo/live` — live + per-event report dumps

Same schema setup, but `Live.background(...)` and a single `listenSignalLive` that branches on `event.action` (`opened` / `closed` / `scheduled` / `cancelled`) to dump `Live` / `Partial` / `Schedule` reports, plus `listenBreakevenAvailable` → `Breakeven.dump`, and `listenPartialProfit/LossAvailable` matching on `Constant.TP_LEVEL*` / `SL_LEVEL*`.

```typescript
import { Live, Partial, Schedule, Risk, Breakeven, Constant, Markdown,
  listenSignalLive, listenBreakevenAvailable, listenRisk,
  listenPartialProfitAvailable, listenPartialLossAvailable, listenError } from "backtest-kit";

Markdown.enable();
Live.background("BTCUSDT", { strategyName: "test_strategy", exchangeName: "test_exchange", frameName: "test_frame" });

listenSignalLive(async (event) => {
  if (event.action === "closed") {
    await Live.dump(event.symbol, { strategyName: event.strategyName, exchangeName: event.exchangeName, frameName: event.frameName });
    await Partial.dump(event.symbol, { strategyName: event.strategyName, exchangeName: event.exchangeName, frameName: event.frameName });
  }
  if (event.action === "scheduled" || event.action === "cancelled") {
    await Schedule.dump(event.symbol, { strategyName: event.strategyName, exchangeName: event.exchangeName, frameName: event.frameName });
  }
});

listenPartialProfitAvailable(({ symbol, price, level }) => {
  if (level === Constant.TP_LEVEL1) {/* +30% of TP distance → +3% */}
  if (level === Constant.TP_LEVEL2) {/* +6% */}
  if (level === Constant.TP_LEVEL3) {/* +9% */}
});
```

### 35.3 `demo/ccxt` — full exchange schema + quant-math models

The reference **production exchange adapter**: a `singleshot` ccxt Binance instance, `roundTicks`-based precision via market metadata, real `getOrderBook` (throws in backtest — supply your own snapshot store) and `getAggregatedTrades` (`publicGetAggTrades`). It then feeds the context-free `Exchange.*` API into the three quant-math companions ([§33.9](#339-quant-math-companions)):

```typescript
import { addExchangeSchema, Exchange, roundTicks } from "backtest-kit";
import * as volume from "volume-anomaly";
import * as pump from "pump-anomaly";
import * as volatility from "garch";

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => { /* ccxt fetchOHLCV */ },
  formatPrice: async (symbol, price) => {
    const m = (await getExchange()).market(symbol);
    const tick = m.limits?.price?.min || m.precision?.price;
    return tick !== undefined ? roundTicks(price, tick) : (await getExchange()).priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, qty) => { /* roundTicks by step size */ },
  getOrderBook: async (symbol, depth, from, to, backtest) => {
    if (backtest) throw new Error("supply your own snapshot store for backtest order book");
    return /* ccxt fetchOrderBook → IOrderBookData */;
  },
  getAggregatedTrades: async (symbol, from, to) => /* ccxt publicGetAggTrades → IAggregatedTradeData[] */,
});

// volume-anomaly — order-flow skew from aggregated trades
const all = await Exchange.getAggregatedTrades("BTCUSDT", { exchangeName: "ccxt-exchange" }, 1400);
const skew = volume.predict(all.slice(0, 1200), all.slice(1200), 0.75);

// garch — per-timeframe volatility forecast feeding TP/SL corridor
const c1h = await Exchange.getCandles("BTCUSDT", "1h", 500, { exchangeName: "ccxt-exchange" });
const { sigma, reliable } = await volatility.predict(c1h, "1h");

// pump-anomaly — fit / plan / backtest via getRawCandles
const getCandles = (symbol, interval, limit, sDate, eDate) =>
  Exchange.getRawCandles(symbol, interval, { exchangeName: "ccxt-exchange" }, limit, sDate, eDate);
const model = pump.PumpMatrix.load(weights);
const plan = await model.plan(signals, getCandles);
```

This is the canonical template for the "See also" quant models — note every model receives data through the look-ahead-safe `Exchange.*` accessors.

### 35.4 `demo/optimization` — AI optimizer end-to-end

Wires `@backtest-kit/ollama`'s `addOptimizerSchema` with 7 daily training ranges + 1 test day, four paginated multi-timeframe data sources (`long/swing/short/micro-term-range`, each `fetch` + `user`/`assistant` message templates with exhaustive indicator documentation), a `getPrompt` backed by an Ollama `deepseek-v3.1:671b` call, `listenOptimizerProgress`, and `Optimizer.dump("BTCUSDT", { optimizerName }, "./generated")`. See [§29](#29-ai-strategy-optimizer) / [§33.3](#333-backtest-kitollama--multi-provider-llm--optimizer) for the API. Each `source` entry has the shape:

```typescript
{
  name: "short-term-range",
  fetch: async ({ symbol, startDate, endDate, limit, offset }) => /* paginated rows */,
  user: (symbol, data) => /* markdown table + indicator legend for the LLM */,
  assistant: () => /* acknowledgement message */,
}
```

### 35.5 `demo/pinets` — raw Pine Script run

The smallest demo — register a candle-only exchange, then `run` a `.pine` file with an explicit `exchangeName` and `when`, and render the plots:

```typescript
import { addExchangeSchema } from "backtest-kit";
import { run, File, toMarkdown } from "@backtest-kit/pinets";

addExchangeSchema({ exchangeName: "ccxt-exchange", getCandles: async (...) => /* ccxt */ });

const plots = await run(
  File.fromPath("test_request_security.pine", "./math"),
  { symbol: "ETHUSDT", timeframe: "15m", limit: 180 },
  "ccxt-exchange",                       // explicit exchange (no execution context here)
  new Date("2025-09-24T12:00:00.000Z"),  // explicit `when` end-date
);
console.log(await toMarkdown(randomString(), plots, { position: "Position", close: "Close", btcClose: "BTC Close" }));
```

Note `run(...)` accepts an optional `exchangeName` and `when` as 3rd/4th args for use **outside** a strategy context — the only way to drive Pine from a plain script. `toMarkdown(id, plots, schema)` renders the extracted columns as a markdown table.

---

---

## 36. Framework philosophy & further reading

`backtest-kit` is opinionated. Its API choices fall out of a small set of convictions about *why* trading systems fail and *how* AI changes the way they are built. The long-form arguments live in [`docs/`](https://github.com/tripolskypetr/backtest-kit/tree/master/docs); this section distills each into a thesis you can reason from.

### 36.1 Foundational concepts

**No edge survives the crowd — escape to a growing-sum game.** On an infinite horizon every strategy decays to zero expectancy minus commission: market volume is finite, so it is a fixed-sum game where your gain is someone's loss, and any exploited inefficiency disappears once others arbitrage it (the LuxAlgo "plateau"). The only durable edge taps capital flowing *into* the system from outside — e.g. a public recommendation to an audience that tends to infinity. Crowd behavior (Telegram pumps) reproduces every time the author has subscribers, so it is *not* a bug that gets arbitraged away — it is a growing-sum factor. → [`docs/concept/02_zero_expectation_escape.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/concept/02_zero_expectation_escape.md)

**Declarative monorepo over the Python God Object.** Imperative, thousands-of-line `IStrategy` subclasses (Freqtrade-style) don't survive the AI era: three engineers block each other on merge conflicts, split repos accumulate no shared knowledge, and a coding agent can't read prior iterations — every new strategy is a random shot, not a continuation. `backtest-kit`'s declarative schema registration + monorepo with shared packages (broker, signals, DB) lets parallel strategies *and* parallel authors (human or agent) compound knowledge instead of colliding. This is the architectural root of the string-name dependency inversion ([§4.1](#41-dependency-inversion-via-string-names)), per-strategy isolation ([§33.7](#337-backtest-kitcli--zero-boilerplate-runner)), and single-process parallel `background()` runs. → [`docs/concept/01_monorepo_parallel_execution.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/concept/01_monorepo_parallel_execution.md)

### 36.2 Why backtests lie, and what the engine does about it

**Look-ahead bias, made architecturally impossible.** The failure that breaks most bots — a backtest that accidentally reads its own future — is prevented structurally via `AsyncLocalStorage`: the clock (`when`) propagates through every fetch, candles are aligned and clamped to the current tick, and the in-progress candle is excluded. It is not a lint rule you can forget; the data simply isn't reachable ([§5.4](#54-look-ahead-bias-protection), [§11](#11-exchange-data-api--candle-math)). → [`docs/article/01_look_ahead_bias.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/01_look_ahead_bias.md)

**Second-order chaos: bots trade against themselves.** In a first-order-chaos market you can find edge by analysis; in second-order chaos the market is unpredictable *because* everyone knows the same patterns and reacts to each other — strategies create the very noise they try to trade. Thousands of copies of the same algorithm blowing up together is why ~95% of bots fail. The design implication: prefer flow you understand (crowd liquidity, capital inflow) over yet another indicator everyone already runs. → [`docs/article/02_second_order_chaos.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/02_second_order_chaos.md)

**Markets are fragile — price moves in jumps, not diffusion.** "Buy and hold" in 2026 is a bet you can stomach a −40…−70% drawdown; liquidation cascades happen several times a year. Textbook continuous-diffusion models break on gaps where no intermediate trades exist, so a hedge can't keep up. This motivates path-aware OHLC-replay exits ([§1](#1-mental-model--guarantees)), wide hard stops for DCA, and option-style convexity thinking. → [`docs/article/04_option_hedging.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/04_option_hedging.md)

### 36.3 AI as the strategy developer

**Give the AI hands.** Claude Code has superhuman pattern recognition (it can dissect 50 MB of backtest logs, find why 80% of trades hit timeout/SL, and edit Pine Script surgically) but no *hands* — the human running TradingView is the bottleneck. `backtest-kit` + `@backtest-kit/cli` + `@backtest-kit/pinets` give the agent an executable loop it can drive end-to-end. → [`docs/article/03_claude_trader.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/03_claude_trader.md)

**A self-updating workflow via `/loop` + Cron.** Liquidation-cascade criteria drift monthly, so the parameters must be re-derived from the news feed continuously. With Claude Code's `/loop` (a local crontab) plus the framework's virtual-time `Cron` ([§18](#18-cron-virtual-time-scheduler)) and self-enforcement runtime, an agent re-reads the feed, rewrites the filters as code, and re-backtests — closing the loop without a human in the inner cycle. → [`docs/article/05_ai_strategy_workflow.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/05_ai_strategy_workflow.md)

**News-sentiment via ReAct, not debate theater.** Most LLM trading agents (e.g. multi-agent "debate" pipelines) have fatal flaws; the reasoning-plus-acting (ReAct) pattern with a hierarchical search prompt produces correct BUY/SELL/WAIT calls under real shocks (the April 2026 Iran escalation). This is the blueprint behind the Feb 2026 news strategy ([§34.3](#343-feb-2026--ai-news-sentiment-llm--graph)) and `@backtest-kit/ollama` outlines ([§33.3](#333-backtest-kitollama--multi-provider-llm--optimizer)). → [`docs/article/06_ai_strategy_blueprint.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/06_ai_strategy_blueprint.md)

### 36.4 Worked edges (each maps to a shipped strategy)

- **AI news trading signals** — LLM forecast on live news; the +16.99%-in-a-−16.4%-month case study ([§34.3](#343-feb-2026--ai-news-sentiment-llm--graph)). → [`docs/article/07_ai_news_trading_signals.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/07_ai_news_trading_signals.md)
- **AI liquidity harvesting** — fade the crowd: a channel's signals are a stop-hunt trigger, so the inverse harvests the liquidity; filter by pre-publication momentum to keep only real-inflow setups ([§34.4](#344-jan-2026--liquidity-harvesting-telegram-signals-inverted)). → [`docs/article/08_ai_liquidity_harvesting.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/08_ai_liquidity_harvesting.md)
- **Pine Script on local markets** — run Pine on exchanges TradingView doesn't cover (MSE, UZSE, DSE, …) via `@backtest-kit/pinets` + a custom exchange adapter ([§33.1](#331-backtest-kitpinets--pine-script-v5v6-runtime)). → [`docs/article/09_pinescript_local_markets.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/09_pinescript_local_markets.md)
- **DCA averaging** — why averaging into pullbacks lowers the blended cost basis and turns a +12% raw move into a larger realized return (and why a broker "freezes" a deposit); the math behind `commitAverageBuy` + the ladder recipe ([§12](#12-pnl-dca--effective-price-math), [§22.5](#225-strategy-recipes), [§34.2](#342-marapr-2026--dca-ladder-the-core-dca-pattern)). → [`docs/article/10_dca_averaging_strategy.md`](https://github.com/tripolskypetr/backtest-kit/blob/master/docs/article/10_dca_averaging_strategy.md)

### 36.5 Reading order

New readers: start with the two concepts (the *why* of the architecture), then `01_look_ahead_bias` and `02_second_order_chaos` (the *why* of the guarantees), then the AI-workflow trio (`03`→`05`→`06`), and finally the worked edges (`07`–`10`) alongside their strategy examples in [§34](#34-strategy-examples-reference-implementations).

---

---

## 37. Markdown report catalog

The framework auto-generates **13 distinct markdown reports**, one per analytics domain. Each is produced by a dedicated markdown service (`src/lib/services/markdown/*MarkdownService.ts`) that **subscribes to an event subject/emitter**, accumulates rows in a per-context memoized store (capped FIFO), and renders a markdown table plus a statistics footer. You consume them through the public wrapper classes ([§13](#13-runners-backtest-live-walker)–[§14](#14-analytics--reports), [§19](#19-sync-order-synchronization)) via `getData` / `getReport` / `dump`, or let the CLI/UI subscribe automatically (`Markdown.enable()`, [§35](#35-raw-library-demos-no-cli)).

### 37.1 The 13 reports

| # | Report (title) | Wrapper | Default dump path | Fed by | Row cap |
| --- | --- | --- | --- | --- | --- |
| 1 | `# Backtest Report:` | `Backtest` | `./dump/backtest/` | `signalBacktestEmitter` (closed signals) | `CC_MAX_BACKTEST_MARKDOWN_ROWS` (250) |
| 2 | `# Live Trading Report:` | `Live` | `./dump/live/` | `signalLiveEmitter` (all tick events) | `CC_MAX_LIVE_MARKDOWN_ROWS` (250) |
| 3 | `# Walker Comparison Report:` | `Walker` | `./dump/walker/` | `walkerEmitter` (per-strategy results) | top `CC_WALKER_MARKDOWN_TOP_N` (10) |
| 4 | `# Portfolio Heatmap:` | `Heat` | `./dump/heatmap/` | `signalEmitter` (closed, all symbols) | `CC_MAX_HEATMAP_MARKDOWN_ROWS` (250) |
| 5 | `# Scheduled Signals Report:` | `Schedule` | `./dump/schedule/` | `signalEmitter` (scheduled/opened/cancelled) | `CC_MAX_SCHEDULE_MARKDOWN_ROWS` (250) |
| 6 | `# Partial Profit/Loss Report:` | `Partial` | `./dump/partial/` | `partialProfitSubject` + `partialLossSubject` | `CC_MAX_PARTIAL_MARKDOWN_ROWS` (250) |
| 7 | `# Risk Rejection Report:` | `Risk` | `./dump/risk/` | `riskSubject` (rejections only) | `CC_MAX_RISK_MARKDOWN_ROWS` (250) |
| 8 | `# Breakeven Report:` | `Breakeven` | `./dump/breakeven/` | `breakevenSubject` | `CC_MAX_BREAKEVEN_MARKDOWN_ROWS` (250) |
| 9 | `# Highest Profit Report:` | `HighestProfit` | `./dump/highest_profit/` | `highestProfitSubject` | `CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS` (250) |
| 10 | `# Max Drawdown Report:` | `MaxDrawdown` | `./dump/max_drawdown/` | `maxDrawdownSubject` | `CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS` (250) |
| 11 | `# Strategy Report:` | `Strategy` | `./dump/strategy/` | `strategyCommitSubject` (commit events) | `CC_MAX_STRATEGY_MARKDOWN_ROWS` (250) |
| 12 | `# Signal Sync Report:` | `Sync` | `./dump/sync/` | `syncSubject` (open/close sync) | `CC_MAX_SYNC_MARKDOWN_ROWS` (250) |
| 13 | `# Performance Report:` | `Performance` | `./dump/performance/` | `performanceEmitter` (timing metrics) | `CC_MAX_PERFORMANCE_MARKDOWN_ROWS` (10000) |

Dump filenames embed the context and a timestamp: `{symbol}_{strategyName}_{exchangeName}_{frameName}_backtest-{ts}.md` (backtest) or `{symbol}_{strategyName}_{exchangeName}_live-{ts}.md` (live). Backtest/Live/Heat reports are keyed per `(symbol, strategy, exchange, frame, mode)`; clearing one context (`clear(...)`) does not touch others. The `MarkdownWriter` adapter ([§14.9](#149-lookup--parallel-run-coordination)/persistence) decides the physical sink — separate `.md` files (`useMd`, default), one JSONL stream (`useJsonl`), or silent (`useDummy`).

### 37.2 What each report contains

**Backtest (1) & Live (2)** — the two richest reports. A per-signal/per-event table plus an extensive statistics footer (every value `null`/`N/A` when the sample is too small or the math is unsafe):
- Counts & basics: `totalSignals`/`totalEvents` (Live adds `totalClosed`), `winCount`/`lossCount`, win rate, avg PNL, total PNL, median PNL.
- Risk-adjusted: standard deviation per trade, **Sharpe**, **Annualized Sharpe**, **Sortino**, **Calmar**, **Recovery Factor**, **Certainty Ratio**, **Expectancy**, **Expected Yearly Returns** (geometric, equity-curve based).
- Excursion: avg peak PNL, avg max-drawdown PNL.
- Duration: avg / avg-win / avg-loss duration (minutes), avg consecutive win/loss PNL (streaks).
- Market profile (from close-to-close of closed trades): **trend** (`bullish`/`bearish`/`sideways`/`neutral`), trend strength (%/day), trend confidence (R²), buyer/seller pressure, buyer/seller strength, pressure imbalance, median step size.

Statistical gates (verified constants): per-trade ratios are `null` below **10** closed signals (`MIN_SIGNALS_FOR_RATIOS`); annualized metrics additionally require calendar span ≥ **14 days** and raw frequency ≤ **365**/yr; `|Expected Yearly Returns|` capped at **100%** (else `null`); Calmar/Recovery clamped to **±1000**; stdDev below **1e-9** treated as zero (identical-returns guard). **All equity-curve metrics assume 100% capital allocation per position** — they ignore the position-sizing subsystem and are theoretical upper bounds. Backtest reports lazily merge persisted closed history from disk before computing, so reports work even with event capture disabled.

**Walker (3)** — ranked comparison table of the strategies in the walker (top `CC_WALKER_MARKDOWN_TOP_N`), each row carrying its `BacktestStatisticsModel` and the chosen `metric`; the best strategy + best metric are surfaced ([§13.3](#133-walker)).

**Heat (4)** — per-symbol rows (the full `IHeatmapRow`, [§14.1](#141-heat--portfolio-heatmap-across-symbols)) sorted by Sharpe, plus a **portfolio aggregate**: `portfolioTotalPnl` (sum of non-null per-symbol PNL), `portfolioTotalTrades`, **pooled** `portfolioSharpeRatio`/`portfolioSortinoRatio`/`portfolioCalmarRatio`/`portfolioAnnualizedSharpeRatio` (computed over all trades across symbols — not a Markowitz cross-correlation Sharpe), `portfolioTradesPerYear`, and trade-weighted `portfolioAvgPeakPnl`/`portfolioAvgFallPnl`. Built defensively against NaN/∞.

**Schedule (5)** — SCHEDULED / OPENED / CANCELLED events with entry/TP/SL, wait time, and the `ScheduleStatisticsModel` footer (`totalScheduled`, `totalOpened`, `totalCancelled`, `cancellationRate`, `activationRate`, `avgWaitTime`, `avgActivationTime` — [§14.2](#142-schedule--scheduled-signal-stats)).

**Partial (6)** — PROFIT/LOSS milestone rows (`PartialEvent`: level %, price, position, signalId, mode) with `totalEvents`/`totalProfit`/`totalLoss`. Subscribes to *both* the profit and loss subjects.

**Risk (7)** — one row per rejection (`RiskEvent`: symbol, strategy, rejection note, price, position) + counts by symbol/strategy. Emitted only on rejection, never on allow.

**Breakeven (8)** — one row per breakeven trigger (`BreakevenEvent`) + total count.

**Highest Profit (9)** & **Max Drawdown (10)** — per-signal best favorable / worst adverse excursion events (`HighestProfitEvent` / `MaxDrawdownEvent`: PNL, peak/trough price + timestamp, position) newest-first, with total counts.

**Strategy (11)** — an audit log of every commit (`StrategyEvent`): cancel-scheduled, close-pending, partial profit/loss, trailing stop/take, breakeven, activate-scheduled, average-buy — with price, percent, effective entry, DCA entry count/cost, and a note. `StrategyStatisticsModel` totals each action type.

**Sync (12)** — signal open/close synchronization lifecycle (`SyncEvent`: entry/exit prices, TP/SL, PNL, close reason) with `totalEvents`/`openCount`/`closeCount` — the audit trail behind broker order routing ([§19](#19-sync-order-synchronization)).

**Performance (13)** — revenue profiling: per-metric timing aggregates (`MetricStats`: count, total/avg duration, stdDev, median, P95, P99, inter-event wait times) for bottleneck analysis. Larger row cap (10000) since samples are lightweight.

### 37.3 Customizing report columns

The table columns of every report are driven by `COLUMN_CONFIG` (per-report arrays like `backtest_columns`, `live_columns`, …). Override them globally with `setColumns({ backtest_columns: [...] })` ([§26](#26-global-configuration-reference)) or pass a `columns` argument to `getReport`/`dump`. Each `ColumnModel` is `{ key, label, format(row, index) => string, isVisible() => boolean }`. `CC_REPORT_SHOW_SIGNAL_NOTE` toggles the Note column across all reports.

---

## 38. JSONL report streams

Parallel to the human-facing markdown reports ([§37](#37-markdown-report-catalog)), the framework keeps a **machine-facing JSONL layer**: 13 report services (`src/lib/services/report/*ReportService.ts`) that stream one structured row per event into append-only JSONL files for analytics, audit, and post-processing with standard tools. This is the data backbone behind `@backtest-kit/ui`, the MongoDB stack, and any downstream pipeline.

### 38.1 Markdown layer vs JSONL layer

Same event sources, different purpose:

| | Markdown ([§37](#37-markdown-report-catalog)) | JSONL ([§38](#38-jsonl-report-streams)) |
| --- | --- | --- |
| Service suffix | `*MarkdownService` | `*ReportService` |
| Output | `.md` table + stats footer | append-only `.jsonl`, one object per line |
| Path | `./dump/<domain>/{context}-{ts}.md` (per-context) | `./dump/report/{reportType}.jsonl` (one file per type) |
| Retention | capped FIFO (`CC_MAX_*_MARKDOWN_ROWS`) | **unbounded — append-only, never overwrites** |
| Activated by | `Markdown.enable(opts?)` | `Report.enable(opts?)` |
| Audience | human review | analytics / DB ingest / UI |

Both subscribe to the same emitters/subjects, so enabling one, the other, or both is independent.

### 38.2 Enabling — `Report.enable(config?)`

`Report` (the `ReportUtils` singleton) toggles JSONL capture per type. `enable` is `singleshot` and returns an unsubscribe closure; `disable(config?)` stops selected types without unsubscribing the rest. With no argument every type is enabled (all flags default `true`):

```typescript
import { Report } from "backtest-kit";

const stop = Report.enable();                                  // all 13 streams
// or selectively:
Report.enable({ backtest: true, walker: true, performance: false });
// ... run backtests ...
stop();                                                        // unsubscribe all
```

Config keys (all `boolean`, default `true`): `backtest`, `live`, `walker`, `heat`, `schedule`, `partial`, `risk`, `breakeven`, `highest_profit`, `max_drawdown`, `strategy`, `sync`, `performance`. The physical sink is the `ReportWriter` adapter — `useJsonl` (default, appends to `./dump/report/{type}.jsonl`) or `useDummy` (discard, for tests); you can register a custom writer (e.g. the MongoDB adapter, [§25](#25-persistence-adapters)). Every row is written with search keys `{ symbol, strategyName, exchangeName, frameName, signalId, walkerName }`, and `ReportBase`/`MarkdownFileBase` expose a `search(...)` over those keys so the JSONL can be queried by context.

### 38.3 The 13 streams

| `reportType` (file) | Fed by | Row = one … |
| --- | --- | --- |
| `backtest` → `./dump/report/backtest.jsonl` | `signalBacktestEmitter` | backtest tick: `idle` / `opened` / `active` / `closed` |
| `live` → `live.jsonl` | `signalLiveEmitter` | live tick (all lifecycle actions) |
| `walker` → `walker.jsonl` | `walkerEmitter` | per-strategy walker result |
| `heat` → `heat.jsonl` | `signalEmitter` | closed signal (portfolio-wide, all symbols) |
| `schedule` → `schedule.jsonl` | `signalEmitter` | scheduled / opened / cancelled event |
| `partial` → `partial.jsonl` | `partialProfitSubject` + `partialLossSubject` | partial profit/loss milestone |
| `risk` → `risk.jsonl` | `riskSubject` | risk rejection |
| `breakeven` → `breakeven.jsonl` | `breakevenSubject` | breakeven trigger |
| `highest_profit` → `highest_profit.jsonl` | `highestProfitSubject` | new peak-profit record |
| `max_drawdown` → `max_drawdown.jsonl` | `maxDrawdownSubject` | new max-drawdown record |
| `strategy` → `strategy.jsonl` | `strategyCommitSubject` | commit (cancel/close/partial/trailing/breakeven/activate/average-buy) |
| `sync` → `sync.jsonl` | `syncSubject` | signal open/close sync event |
| `performance` → `performance.jsonl` | `performanceEmitter` | timing metric sample |

### 38.4 Row shape

Each line is a flat JSON object combining a **base envelope** with action-specific fields. For the `backtest`/`live` streams the envelope is `{ timestamp, action, symbol, strategyName, exchangeName, frameName, backtest, currentPrice }`, and richer actions append the full signal/PNL breakdown. Example fields by action (backtest stream):

- `idle` — envelope only.
- `opened` — `+ signalId, position, note, priceOpen, priceTakeProfit, priceStopLoss, originalPrice{Open,TakeProfit,StopLoss}, totalEntries, _partial, partialExecuted, totalPartials, cost, openTime (pendingAt), scheduledAt, minuteEstimatedTime`.
- `active` — opened fields `+ percentTp, percentSl, pnl, pnlCost, pnlEntries, pnlPriceOpen, pnlPriceClose,` and flattened `peakProfit*` / `maxDrawdown*` (priceOpen/priceClose/percentage/cost/entries each).
- `closed` — opened+pnl fields `+ closeReason, closeTime, duration (minutes), peakProfit*/maxDrawdown*`.

PNL DTOs are **flattened into scalar columns** (e.g. `peakProfitPercentage`, `maxDrawdownCost`) rather than nested objects, so the JSONL maps cleanly onto SQL columns / dataframes. Other streams follow the analogous event shapes from [§14](#14-analytics--reports) / [§24](#24-notifications) (e.g. `risk` rows carry `rejectionNote` + `activePositionCount`; `performance` rows carry per-metric durations; `strategy` rows carry the commit `action` + price/percent/DCA fields). Because the files are append-only, a single run produces a complete, replayable event log per type — load with any JSONL reader (`jq`, pandas `read_json(lines=True)`, DuckDB `read_json_auto`, etc.).

---

---

## 39. Schema & graph validation

The framework validates configuration in **two distinct phases**, by two distinct service families:

1. **Shallow schema validation** — at *registration* time (`addXxxSchema`), each `*SchemaService.validateShallow` checks the schema object's own structure/types before it enters the registry. Catches malformed config immediately.
2. **Graph (relationship) validation** — at *run* time (`Backtest.run`/`background`, `Live.*`, `Walker.*`, `getPendingSignal`, …), each `*ValidationService.validate(name, source)` checks the named entity *exists* and recursively validates everything it *references*. Catches dangling string-name links across the dependency graph.

Plus two standalone validators for global config and report columns. All of this is independent from the per-signal/per-candle [data validation](#75-signal-validation-rules) ([§7.5–7.6](#76-candle-data-validation)).

### 39.1 Shallow schema validation (registration)

Every `addXxxSchema(schema)` calls `register(name, schema)`, which runs `validateShallow(schema)` and then inserts into a `ToolRegistry` — **registering a name that already exists throws**. `validateShallow` only inspects the object's own fields (no cross-references). Verified checks per domain:

| Schema | `validateShallow` throws when … |
| --- | --- |
| **Strategy** | `strategyName` not a string; `riskName` present but not a string; `riskList` not an array / has duplicates / non-string entries; `actions` not an array / has duplicates / non-string entries; `interval` present but not a string; `getSignal` present but not a function. |
| **Exchange** | `exchangeName` missing; `getCandles` missing (the one mandatory adapter fn). |
| **Frame** | `frameName` missing; `interval` invalid; `startDate` missing; `endDate` missing. |
| **Risk** | `riskName` missing; `validations` not an array / invalid entries. |
| **Sizing** | `sizingName` missing; `method` missing; `riskPercentage` missing for `fixed-percentage` / `atr-based` methods. |
| **Walker** | `walkerName` missing; `exchangeName` missing; `frameName` missing; `strategies` not an array / empty / has duplicates / invalid entries. |
| **Action** | `actionName` missing; `handler` not a function or plain object; `callbacks` present but not an object. |

`overrideXxxSchema` does **not** re-run `validateShallow` — it applies a partial update to an already-registered (already-validated) schema via the registry.

### 39.2 Graph validation (run time)

Each domain also has a `*ValidationService` holding its own `Map<name, schema>` (populated by `add*` alongside registration; `add*` throws on a duplicate name). `validate(name, source)` is **memoized** (each name validated at most once per process — repeat calls are free) and throws `"<domain> <name> not found source=<source>"` if the entity was never registered. The `source` string is the call site (e.g. `"BacktestUtils.run"`) and appears in the error for traceability.

**Leaf validators (existence only, no cascade):** `Exchange`, `Frame`, `Risk`, `Sizing`, `Action`. Each just confirms the name is in its map. (`ActionValidationService` memoizes on `actionName:source`; it does **not** introspect handler method names — that's a claim in some prose docs that the code does not implement.)

**Cascade roots (existence + recursive dependency validation):**

- **`StrategyValidationService.validate(strategyName, source)`** → confirms the strategy exists, then validates each referenced dependency:
  - `riskName` → `RiskValidationService.validate`
  - every `riskList[i]` → `RiskValidationService.validate`
  - every `actions[i]` → `ActionValidationService.validate`
- **`WalkerValidationService.validate(walkerName, source)`** → confirms the walker exists, then for **every strategy** in `walker.strategies`: validates the strategy *and* its `riskName` / `riskList` / `actions`. So validating one walker transitively validates the entire sub-graph (walker → strategies → risks + actions).

This is why a typo in `riskName` or an `actions: ["telegram"]` referencing an unregistered action surfaces as a clear `"risk … not found"` / `"action … not found"` at the first `run`/`background` call, rather than as a silent no-op deep in execution. The runners invoke these validators up front:

```
Backtest.run("BTCUSDT", { strategyName, exchangeName, frameName })
  ├─ strategyValidationService.validate(strategyName, "BacktestUtils.run")
  │     ├─ riskValidationService.validate(riskName, …)        // if riskName
  │     ├─ riskValidationService.validate(each riskList, …)   // if riskList
  │     └─ actionValidationService.validate(each action, …)   // if actions
  ├─ exchangeValidationService.validate(exchangeName, …)
  └─ frameValidationService.validate(frameName, …)
```

`Reflect` / the `listXxxSchema` functions ([§28](#28-reflection--introspection)) expose the same registries for read-only introspection.

### 39.3 Global-config & column validation

Two aggregating validators run when you change global settings (each collects **all** failures and throws one combined message; both are skipped when the internal `_unsafe` flag is set, used only by the test harness):

- **`ConfigValidationService.validate()`** — invoked by `setConfig(...)`. Checks `GLOBAL_CONFIG` for mathematical/economic soundness: slippage/fee/breakeven percentages non-negative; **`CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` must cover `2×slippage + 2×fee`** (else "all TakeProfit signals will be unprofitable"); SL min/max positive and `min < max`; time params (`CC_SCHEDULE_AWAIT_MINUTES`, `CC_MAX_SIGNAL_GENERATION_SECONDS`) positive integers; `CC_MAX_SIGNAL_LIFETIME_MINUTES` a positive integer **or `Infinity`**; candle params (`CC_AVG_PRICE_CANDLES_COUNT`, retry count/delay, anomaly factor, min-candles-for-median, max-per-request, order-book offset) integers in range; storage limits (`CC_MAX_NOTIFICATIONS`, `CC_MAX_SIGNALS`) positive integers. On failure `setConfig` rolls back to the previous config and rethrows ([§26](#26-global-configuration-reference)).
- **`ColumnValidationService.validate()`** — invoked by `setColumns(...)`. For every collection in `COLUMN_CONFIG`: each column must be an object with `key`, `label`, `format`, `isVisible`; `key`/`label` non-empty strings; `format`/`isVisible` functions; and **keys unique within each collection** (reports duplicate key + indexes). On failure `setColumns` rolls back and rethrows ([§37.3](#373-customizing-report-columns)).

### 39.4 Summary of guarantees

- A malformed schema can't enter the registry (shallow validation at `add*`).
- A duplicate name can't be registered (registry + validation-service maps both throw).
- A dangling string reference (strategy→risk/action, walker→strategy→…) is caught at the first run, with the offending name and call-site `source` in the message.
- Each entity is validated at most once (memoized) — validation adds no per-tick cost.
- Bad global config / columns are rejected atomically with a single aggregated error and a rollback.

---

---

## 40. Config in practice — where each parameter is consumed

[§26](#26-global-configuration-reference) lists every `GLOBAL_CONFIG` key with its default. This section maps the keys to **where in the source they are actually read**, so you can predict the effect of changing one. Two config objects exist: `GLOBAL_CONFIG` (`src/config/params.ts`, numeric/boolean knobs) and `COLUMN_CONFIG` (`src/config/columns.ts`, report table columns). Defaults are frozen as `DEFAULT_CONFIG` / `DEFAULT_COLUMNS`.

### 40.1 Pricing, fees & PNL math

| Key | Consumed by | Effect |
| --- | --- | --- |
| `CC_PERCENT_SLIPPAGE`, `CC_PERCENT_FEE` | `toProfitLossDto` (helpers), `ClientBreakeven`, `ClientStrategy` breakeven formula | Applied **twice** (entry+exit) to every PNL; also feed the breakeven & min-TP-distance math. |
| `CC_AVG_PRICE_CANDLES_COUNT` | VWAP (`getAveragePrice` / exchange services), candle fetch sizing | Number of 1m candles averaged for the engine's "current price". |
| `CC_POSITION_ENTRY_COST` | `commitAverageBuy(symbol, cost?)` default, `ClientRisk` & `ClientStrategy` cost fallback (`signal.cost \|\| …`), `Backtest`/`Live` DCA cost default | The `$100` unit per entry when a signal/DCA omits `cost`. Drives DCA weighting and `pnlEntries`. |
| `CC_BREAKEVEN_THRESHOLD` | `ClientBreakeven`, `ClientStrategy` (`getBreakeven`) | Breakeven trigger = `(CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) × 2 + CC_BREAKEVEN_THRESHOLD` — the extra margin above cost recovery. |

### 40.2 Signal validation & lifetime

| Key | Consumed by | Effect |
| --- | --- | --- |
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `validateCommonSignal`, `ConfigValidationService` | Rejects signals whose TP is closer than this; config-validated to cover `2×slippage + 2×fee` ([§39.3](#393-global-config--column-validation)). |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT`, `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `validateCommonSignal` | Floor/ceiling on SL distance; config-validated `min < max`. |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `ClientStrategy` — `minuteEstimatedTime ?? CC_MAX_SIGNAL_LIFETIME_MINUTES` at every signal-create path | Default position lifetime when the DTO omits `minuteEstimatedTime`; `Infinity` ⇒ no time-expiry. |
| `CC_MAX_SIGNAL_GENERATION_SECONDS` | signal-generation guard | Aborts a `getSignal` that runs longer than this. |
| `CC_ENABLE_LONG_SIGNAL`, `CC_ENABLE_SHORT_SIGNAL` | `validateCommonSignal` (`position === "long"/"short" && !flag → throw`) | Hard gate that rejects a whole direction at validation. |

### 40.3 Behavior toggles (the big four `*_EVERYWHERE`)

These are all read in `ClientStrategy` (and one in `validateCommonSignal`) and change *when* a commit is permitted:

| Key | Consumed by | Effect when `true` |
| --- | --- | --- |
| `CC_ENABLE_DCA_EVERYWHERE` | `ClientStrategy` averageBuy gate + its validate path (`!flag && currentPrice >= minEntryPrice → reject` for LONG; `<= maxEntryPrice` for SHORT) | Lets `commitAverageBuy` fire when price is merely beyond `priceOpen`, not only at a new all-time extreme since entry. |
| `CC_ENABLE_PPPL_EVERYWHERE` | `ClientStrategy` partial-profit/partial-loss direction gates | Allows partial profit/loss even when it mixes exit directions. |
| `CC_ENABLE_TRAILING_EVERYWHERE` | `ClientStrategy` trailing stop/take absorption gates | Activates trailing without requiring the absorption condition. |
| (validation) `CC_ENABLE_LONG/SHORT_SIGNAL` | see §40.2 | — |

Default `false` for the three `*_EVERYWHERE` (conservative); the DCA/PPPL/trailing recipes in [§22.5](#225-strategy-recipes) work under the default rules.

### 40.4 Candle fetching, order book & trades

| Key | Consumed by | Effect |
| --- | --- | --- |
| `CC_GET_CANDLES_RETRY_COUNT`, `CC_GET_CANDLES_RETRY_DELAY_MS` | candle fetch path | Retry policy for `getCandles` failures. |
| `CC_MAX_CANDLES_PER_REQUEST` | candle fetch / cache (5 sites) | Pagination chunk size when a request exceeds it. |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR`, `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | `validateCandles` | Anomaly rejection (price ≫ factor below median) + median-vs-average switch ([§7.6](#76-candle-data-validation)). |
| `CC_ENABLE_CANDLE_FETCH_MUTEX` | `Candle.ts` (`spinLock`, fetch lock) | Serializes concurrent identical-candle fetches. |
| `CC_ENABLE_BACKTEST_PARALLEL_SPIN` | `Candle.ts` (`spinLock`) | Cooperative round-robin yield between parallel backtests after each fetch (skipped if single workload or mutex off). |
| `CC_ORDER_BOOK_TIME_OFFSET_MINUTES` | order-book window math | Time window/offset for `getOrderBook`. |
| `CC_ORDER_BOOK_MAX_DEPTH_LEVELS` | `Exchange.getOrderBook` / `ClientExchange` default `depth` arg | Default depth when `getOrderBook(symbol)` omits depth. |
| `CC_AGGREGATED_TRADES_MAX_MINUTES` | `Exchange` / `ClientExchange` (`windowMs = CC_… × 60000 − 60000`) | Aggregated-trades window size & pagination chunk. |

### 40.5 Storage caps & report rows

| Key | Consumed by | Effect |
| --- | --- | --- |
| `CC_MAX_*_MARKDOWN_ROWS` (12 keys) | the matching `*MarkdownService` ([§37](#37-markdown-report-catalog)) | FIFO cap on rows retained per markdown report (250 default; Performance 10000). |
| `CC_WALKER_MARKDOWN_TOP_N` | `WalkerMarkdownService` | How many top strategies the walker comparison table shows (10). |
| `CC_MAX_NOTIFICATIONS`, `CC_MAX_SIGNALS` | notification store, signal store | FIFO retention caps (also config-validated as positive ints). |
| `CC_MAX_LOG_LINES` | `Log.ts` (`_entries.slice(-CC_MAX_LOG_LINES)` + trim) | Rolling log buffer size. |
| `CC_REPORT_SHOW_SIGNAL_NOTE` | the **`isVisible`** of the Note column in `src/assets/*.columns` (backtest/live/breakeven/…) | Toggles the Note column across all report tables without editing columns. |

> JSONL report streams ([§38](#38-jsonl-report-streams)) are append-only and **not** subject to the `CC_MAX_*_MARKDOWN_ROWS` caps — those bound only the in-memory markdown stores.

### 40.6 `COLUMN_CONFIG` — report table columns

`src/config/columns.ts` exports `COLUMN_CONFIG`, mapping each report to a column array imported from `src/assets/*.columns`. There are **14 collections** (Walker has two): `backtest_columns`, `heat_columns`, `live_columns`, `partial_columns`, `breakeven_columns`, `performance_columns`, `risk_columns`, `schedule_columns`, `strategy_columns`, `sync_columns`, `highest_profit_columns`, `max_drawdown_columns`, `walker_pnl_columns`, `walker_strategy_columns`.

Each entry is a `ColumnModel` (`{ key, label, format(row, index) => string, isVisible() => boolean }`) — `format` builds the cell, `isVisible` gates the whole column (e.g. the Note column returns `GLOBAL_CONFIG.CC_REPORT_SHOW_SIGNAL_NOTE`). Override globally with `setColumns({ <collection>: [...] })` or per-call via the `columns` argument to `getReport`/`dump`; both paths run `ColumnValidationService` ([§39.3](#393-global-config--column-validation)) and roll back on failure. Inspect with `getColumns()` / `getDefaultColumns()` (`ColumnConfig` is the exported type). The markdown services iterate visible columns to build the table header + rows ([§37.3](#373-customizing-report-columns)).

---

🤖 For the human-readable narrative, see [README.md](./README.md). MIT © [tripolskypetr](https://github.com/tripolskypetr).
