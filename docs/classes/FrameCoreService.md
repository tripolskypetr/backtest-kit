---
title: docs/api-reference/class/FrameCoreService
group: docs
---

# FrameCoreService

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

### frameValidationService

```ts
frameValidationService: any
```

### getTimeframe

```ts
getTimeframe: (symbol: string, frameName: string) => Promise<Date[]>
```

Generates timeframe array for backtest iteration.
