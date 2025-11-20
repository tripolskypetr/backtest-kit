---
title: docs/api-reference/function/setLogger
group: docs
---

# setLogger

```ts
declare function setLogger(logger: ILogger): Promise<void>;
```

Sets custom logger implementation for the framework.

All log messages from internal services will be forwarded to the provided logger
with automatic context injection (strategyName, exchangeName, symbol, etc.).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `logger` | Custom logger implementing ILogger interface |
