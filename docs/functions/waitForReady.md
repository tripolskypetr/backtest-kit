---
title: docs/function/waitForReady
group: docs
---

# waitForReady

```ts
declare function waitForReady(isBacktest?: boolean): Promise<void>;
```

Blocks until the schema registries needed to start trading are populated.

Polls `exchangeValidationService`, `frameValidationService` and
`strategyValidationService` once per second for up to `MAX_WAIT_SECONDS`
seconds. The loop exits as soon as the required registries are non-empty
for the given mode:

- Backtest mode (`isBacktest = true`): exchange, frame and strategy schemas
  must all be registered (frames define the historical window).
- Live mode (`isBacktest = false`): only exchange and strategy schemas are
  required — frames are unused.

Useful at startup when schemas are registered asynchronously (lazy imports,
remote config, plugin loading) and the caller wants to delay `Backtest`/
`Live` invocation until everything is ready. If the timeout elapses without
the registries filling in, the function returns silently — the caller is
expected to surface a clearer error from the subsequent `Backtest`/`Live`
call (e.g. "no strategy registered").

## Parameters

| Parameter | Description |
|-----------|-------------|
| `isBacktest` | Whether to additionally require a registered frame schema. Defaults to `true`. |
