---
title: docs/api-reference/class/FrameGlobalService
group: docs
---

# FrameGlobalService

Global service for frame operations.

Wraps FrameConnectionService for timeframe generation.
Used internally by BacktestLogicPrivateService.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### frameConnectionService

```ts
frameConnectionService: any
```

### getTimeframe

```ts
getTimeframe: (symbol: string) => Promise<Date[]>
```

Generates timeframe array for backtest iteration.
