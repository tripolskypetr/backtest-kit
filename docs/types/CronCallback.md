---
title: docs/type/CronCallback
group: docs
---

# CronCallback

```ts
type CronCallback = (symbol: string, when: Date, backtest: boolean) => void | Promise<void>;
```

Callback signature for a cron entry handler.

Invocation cardinality depends on `entry.symbols` (see {@link CronEntry}):
- **Global mode** (`symbols` empty/undefined): invoked once per aligned
  boundary across all parallel backtests. The first symbol to reach the
  boundary opens the slot and runs the handler; others await the same
  promise.
- **Fan-out mode** (`symbols` non-empty): invoked once per aligned
  boundary **per whitelisted symbol**. Each symbol has its own slot.
