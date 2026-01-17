---
title: docs/function/addWalkerSchema
group: docs
---

# addWalkerSchema

```ts
declare function addWalkerSchema(walkerSchema: IWalkerSchema): void;
```

Registers a walker for strategy comparison.

The walker executes backtests for multiple strategies on the same
historical data and compares their performance using a specified metric.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `walkerSchema` | Walker configuration object |
