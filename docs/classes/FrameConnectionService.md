---
title: docs/api-reference/class/FrameConnectionService
group: docs
---

# FrameConnectionService

Implements `IFrame`

Connection service routing frame operations to correct ClientFrame instance.

Routes all IFrame method calls to the appropriate frame implementation
based on methodContextService.context.frameName. Uses memoization to cache
ClientFrame instances for performance.

Key features:
- Automatic frame routing via method context
- Memoized ClientFrame instances by frameName
- Implements IFrame interface
- Backtest timeframe management (startDate, endDate, interval)

Note: frameName is empty string for live mode (no frame constraints).

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### frameSchemaService

```ts
frameSchemaService: any
```

### methodContextService

```ts
methodContextService: any
```

### getFrame

```ts
getFrame: ((frameName: string) => ClientFrame) & IClearableMemoize<string> & IControlMemoize<string, ClientFrame>
```

Retrieves memoized ClientFrame instance for given frame name.

Creates ClientFrame on first call, returns cached instance on subsequent calls.
Cache key is frameName string.

### getTimeframe

```ts
getTimeframe: (symbol: string) => Promise<Date[]>
```

Retrieves backtest timeframe boundaries for symbol.

Returns startDate and endDate from frame configuration.
Used to limit backtest execution to specific date range.
