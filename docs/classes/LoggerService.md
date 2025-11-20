---
title: docs/api-reference/class/LoggerService
group: docs
---

# LoggerService

Implements `ILogger`

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

Logs a general-purpose message.
Used throughout the swarm system to record significant events or state changes, such as agent execution, session connections, or storage updates.

### debug

```ts
debug: (topic: string, ...args: any[]) => Promise<void>
```

Logs a debug-level message.
Employed for detailed diagnostic information, such as intermediate states during agent tool calls, swarm navigation changes, or embedding creation processes, typically enabled in development or troubleshooting scenarios.

### info

```ts
info: (topic: string, ...args: any[]) => Promise<void>
```

Logs an info-level message.
Used to record informational updates, such as successful completions, policy validations, or history commits, providing a high-level overview of system activity without excessive detail.

### setLogger

```ts
setLogger: (logger: ILogger) => void
```
