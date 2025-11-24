---
title: docs/api-reference/function/addWalker
group: docs
---

# addWalker

```ts
declare function addWalker(walkerSchema: IWalkerSchema): void;
```

Registers a walker for strategy comparison.

The walker executes backtests for multiple strategies on the same
historical data and compares their performance using a specified metric.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `walkerSchema` | Walker configuration object |
