---
title: docs/api-reference/class/LoggerService
group: docs
---

# LoggerService

Implements `ILogger`

Logger service with automatic context injection.

Features:
- Delegates to user-provided logger via setLogger()
- Automatically appends method context (strategyName, exchangeName, frameName)
- Automatically appends execution context (symbol, when, backtest)
- Defaults to NOOP_LOGGER if no logger configured

Used throughout the framework for consistent logging with context.

## Constructor

```ts
constructor();
```

## Properties

### methodContextService

```ts
methodContextService: any
```

### executionContextService

```ts
executionContextService: any
```

### _commonLogger

```ts
_commonLogger: any
```

### log

```ts
log: (topic: string, ...args: any[]) => Promise<void>
```

Logs general-purpose message with automatic context injection.

### debug

```ts
debug: (topic: string, ...args: any[]) => Promise<void>
```

Logs debug-level message with automatic context injection.

### info

```ts
info: (topic: string, ...args: any[]) => Promise<void>
```

Logs info-level message with automatic context injection.

### setLogger

```ts
setLogger: (logger: ILogger) => void
```

Sets custom logger implementation.
