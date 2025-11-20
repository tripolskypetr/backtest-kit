---
title: docs/api-reference/function/addFrame
group: docs
---

# addFrame

```ts
declare function addFrame(frameSchema: IFrameSchema): void;
```

Registers a timeframe generator for backtesting.

The frame defines:
- Start and end dates for backtest period
- Interval for timeframe generation
- Callback for timeframe generation events

## Parameters

| Parameter | Description |
|-----------|-------------|
| `frameSchema` | Frame configuration object |
