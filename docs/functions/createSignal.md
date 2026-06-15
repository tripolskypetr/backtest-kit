---
title: docs/function/createSignal
group: docs
---

# createSignal

```ts
declare function createSignal(symbol: string, dto: ISignalDto): Promise<void>;
```

Queues a user-supplied signal DTO to be consumed by the next tick instead of params.getSignal.

priceOpen decides the outcome via the existing pipeline: omitted → opens immediately at the
current price; provided → opens immediately if already reached, otherwise registers a
scheduled (priceOpen-awaiting) signal. The DTO is validated (reusing validateSignal) and the
call is rejected if a signal or deferred action is already in flight.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Signal DTO to open (priceOpen optional) |
