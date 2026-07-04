---
title: other/broker/readme
group: other/broker
---

# Broker Adapter Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/broker)

A minimal harness for exercising the `Broker` adapter by hand. It pairs a signal-less strategy with mode-specific broker modules, so every trade mutation is driven from the dashboard's **Manual Control** page — not from `getSignal`. That lets you inspect the exact payload the framework hands to your exchange code, and watch the framework recover when that code throws.

## Purpose

This project exists for the concrete checks below.

### 1. Proof-of-concept for the broker (paper mode)

In paper mode the broker adapter only logs its payload and returns. Put a `debugger` (or a breakpoint) inside any commit hook, trigger it from the UI, and inspect what the framework passes to your exchange code — `symbol`, `cost`, prices, direction — before you wire a real exchange. Nothing is sent anywhere, so you can iterate freely.

### 2. Self-recovery on an exceptional situation (live mode)

In live mode the broker adapter deliberately `throw`s in every commit hook. The framework treats the throw as a rejected order and **rolls the transaction back**: the internal position state is left exactly as it was before the commit, as if the action never happened. If the strategy calls for it, the same commit is **retried on the next tick** — so a transient exchange failure heals itself once the adapter stops throwing. This makes the transactional-integrity guarantee observable: a failing broker can never desync the engine's state from the exchange.

### 3. The human-driven bot

There is **no `getSignal`** — the strategy never opens anything on its own. This demo is the **human-driven bot** case: the full broker machinery runs exactly as in an automated setup (transactional commits, rollback, retry, exchange wiring), but a person — not an algorithm — issues the commands. Every open, average, close, and breakeven originates from a human clicking a button in the UI, while the framework handles the order the same way it would for a signal-generated trade. You get the bot's execution guarantees with manual decision-making, and you control exactly when each hook fires.

### 4. Testing the broker in the integrated environment

A broker adapter is usually written in isolation — a module that *looks* like it will work, validated by nothing but a careful read of the code. In a dev environment there is no real feedback loop; you stare at the diff and hope. The only way to learn whether it actually fires correctly is to ship it to production and **wait hours** for a strategy to generate a signal, just to find out the adapter threw on the first commit.

### 5. End-to-end test of the strategy

This demo collapses that loop into a full end-to-end test. The strategy runs inside the real framework — same commit pipeline, same exchange wiring, same transactional path as production — but you fire each hook **on demand** by clicking a button instead of waiting for a signal. Open a position and you immediately know whether `onOrderOpenCommit` succeeded or threw; no waiting for the market, no synthetic test double that drifts from reality. You exercise the whole path — strategy, framework, broker, exchange — in the environment it will actually run in, and get the pass/fail answer in seconds instead of hours.

## Project Structure

```
demo/broker/
├── content/
│   └── manual_strategy.ts      # Signal-less strategy — lifecycle callbacks only
├── modules/
│   ├── backtest.module.ts      # Exchange + frame, NO broker adapter
│   ├── paper.module.ts         # Broker adapter that logs the payload (observe)
│   └── live.module.ts          # Broker adapter that throws (force rollback/retry)
├── package.json                # Scripts and @backtest-kit/cli dependency
└── README.md                   # This file
```

The exchange schema (CCXT Binance spot) is identical across all three modules. What differs is the broker adapter: paper logs, live throws, backtest registers none.

## Installation

```bash
cd demo/broker
npm install
```

## Running

The strategy file is passed as a positional argument; the mode flag selects which `./modules/<mode>.module.ts` the CLI loads before the run starts.

```bash
# Paper — inspect the broker payload (adapter logs and returns)
npm start -- --paper --ui .\content\manual_strategy.ts

# Live — observe self-recovery (adapter throws, framework rolls back and retries)
npm start -- --live --ui .\content\manual_strategy.ts
```

The `--ui` flag starts the web dashboard at `http://localhost:60050` — this is where the **Manual Control** page and its operation buttons live, so `--ui` is required to drive the broker by hand.

## The Two Broker Adapters

### Paper — observe

`paper.module.ts` registers an adapter that logs the payload and returns. Set a breakpoint on any `console.log` to inspect what a real exchange adapter would receive:

```typescript
Broker.useBrokerAdapter({
  onAverageBuyCommit: async (payload) => {
    console.log("AVERAGE_BUY", { payload });
  },
  onOrderOpenCommit: async (payload) => {
    console.log("ORDER_OPEN", { payload });
  },
  onOrderCloseCommit: async (payload) => {
    console.log("ORDER_CLOSE", { payload });
  },
});

Broker.enable();
```

### Live — reject

`live.module.ts` registers an adapter that logs **and throws**. The throw forces the rollback/retry path:

```typescript
Broker.useBrokerAdapter({
  onAverageBuyCommit: async (payload) => {
    console.log("AVERAGE_BUY", { payload });
    throw new Error("AVERAGE_BUY NOT ALLOWED!");
  },
  onOrderOpenCommit: async (payload) => {
    console.log("ORDER_OPEN", { payload });
    throw new Error("ORDER_OPEN NOT ALLOWED!");
  },
  onOrderCloseCommit: async (payload) => {
    console.log("ORDER_CLOSE", { payload });
    throw new Error("ORDER_CLOSE NOT ALLOWED!");
  },
});

Broker.enable();
```

When a hook throws, the framework logs the payload, skips the mutation (internal state is untouched), and retries on the next tick. The UI surfaces the thrown message back to the operator — the same text the broker raised, e.g. `ORDER_OPEN NOT ALLOWED!`.

## Reaching Manual Control from `/`

The dashboard opens at `/`, and every step down to the broker form is a button click:

1. **`/`** — redirects to **`/main`** (`getMainRoute()` returns `/main` when there is no `?pine` query param).
2. **`/main`** (MainPage) — click the **Pending Status** tile in the **Live** group (purple, play icon). → `/status`
3. **`/status`** (MainView) — pending signals are grouped by strategy; click the symbol tile for your signal. → `/status/:id`
   *If there is exactly one pending signal, `/status` auto-redirects straight to it and this step is skipped.*
4. **`/status/:id`** (StatusView) — click the **Manual Control** breadcrumb button (gamepad icon). → `/status/:id/control`
5. **`/status/:id/control`** (ControlView) — the operation buttons live here.

A pending signal must already exist to reach step 3 — it appears the first time you open a position, or streams in from the live run. Until then, `/status` shows *"Listening for a pending signal…"*.

## Which Button Fires Which Broker Hook

Each button on the Manual Control page opens a short confirmation form; submitting it fires the broker hook for the active mode:

| Button            | Broker hook           |
|-------------------|-----------------------|
| Open Position     | `onOrderOpenCommit`  |
| Commit Averaging  | `onAverageBuyCommit`  |
| Close Position    | `onOrderCloseCommit` |
| Commit Breakeven  | stop-loss adjustment  |

In **paper** mode the hook logs and the action lands; in **live** mode the hook throws and the action is rolled back. Same buttons, same commands — only the loaded module differs.

## How Module Hooks Are Wired

`@backtest-kit/cli` loads `./modules/<mode>.module.ts` as a side-effect import **before** the run starts:

- `--paper` → `paper.module.ts`
- `--live` → `live.module.ts`
- `--backtest` → `backtest.module.ts`

Each module registers the exchange schema and, for paper/live, calls `Broker.useBrokerAdapter(...)` followed by `Broker.enable()`. A missing module is a soft warning, not an error.

Every broker commit fires **before** the engine mutates its internal position state. If the hook resolves, the mutation is applied; if it throws, the mutation is skipped and retried later. In **backtest** mode no adapter is registered at all (see `backtest.module.ts`), so historical replays never touch exchange code.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
