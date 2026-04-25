---
title: docs/class/SessionAdapter
group: docs
---

# SessionAdapter

Main session adapter that manages both backtest and live session storage.

Features:
- Routes all operations to SessionBacktest or SessionLive based on the backtest flag

## Constructor

```ts
constructor();
```

## Properties

### getData

```ts
getData: <Value extends object = object>(symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<Value>
```

Read the current session value for a signal.
Routes to SessionBacktest or SessionLive based on backtest.

### setData

```ts
setData: <Value extends object = object>(symbol: string, value: Value, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<void>
```

Update the session value for a signal.
Routes to SessionBacktest or SessionLive based on backtest.
