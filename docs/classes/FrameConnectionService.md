---
title: docs/class/FrameConnectionService
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

### clear

```ts
clear: (frameName?: string) => void
```

Disposes cached ClientFrame instance(s) so the next getTimeframe call
regenerates timeframes. Without this, ClientFrame's singleshot would keep
the endDate-to-now clamp frozen at the moment of the first run: a
long-running process re-running the same frame would silently backtest
against stale timeframes and never see newly available candles.

When called without arguments, clears all memoized frames.
Called by Backtest/Walker at strategy start.

### getTimeframe

```ts
getTimeframe: (symbol: string, frameName: string) => Promise<Date[]>
```

Retrieves backtest timeframe boundaries for symbol.

Returns startDate and endDate from frame configuration.
Used to limit backtest execution to specific date range.
