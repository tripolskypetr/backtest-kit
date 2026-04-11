---
title: docs/function/runInMockContext
group: docs
---

# runInMockContext

```ts
declare function runInMockContext<T extends unknown = any>(run: Function$2<T>, { exchangeName, frameName, strategyName, symbol, backtest: isBacktest, when, }: Partial<IRunContext>): Promise<T>;
```

Runs a function inside a mock method and execution context.

Useful in tests and scripts that need to call context-dependent services
(e.g. `getBacktestTimeframe`) without a real backtest runner.

All context fields are optional; the defaults produce a minimal live-mode
environment pointing at placeholder schema names:
- `exchangeName` → `"mock-exchange"`
- `strategyName` → `"mock-strategy"`
- `frameName`    → `"mock-frame"`
- `symbol`       → `"BTCUSDT"`
- `backtest`     → `false` (live mode)
- `when`         → current minute boundary (`alignToInterval(new Date(), "1m")`)

## Parameters

| Parameter | Description |
|-----------|-------------|
| `run` | Zero-argument function to execute within the context. |
| `__1` | |
