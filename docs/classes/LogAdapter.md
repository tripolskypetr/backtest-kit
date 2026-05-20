---
title: docs/class/LogAdapter
group: docs
---

# LogAdapter

Implements `ILog`

Log adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable log implementations
- Default adapter: LogMemoryUtils (in-memory storage)
- Alternative adapters: LogPersistUtils, LogDummyUtils
- Convenience methods: usePersist(), useMemory(), useDummy()

## Constructor

```ts
constructor();
```

## Properties

### _logFactory

```ts
_logFactory: any
```

Factory producing the active log utils instance

### getInstance

```ts
getInstance: any
```

Lazily constructs the log utils from the registered factory and memoizes
the result via `singleshot`.

The instance is built on the first call and cached for all subsequent calls.
Reset via `clear()` so the next call rebuilds from the current factory
(e.g. when `process.cwd()` changes between strategy iterations).

### getList

```ts
getList: () => Promise<ILogEntry[]>
```

Lists all stored log entries.
Proxies call to the underlying log adapter.

### log

```ts
log: (topic: string, ...args: any[]) => void
```

Logs a general-purpose message.
Proxies call to the underlying log adapter.

### debug

```ts
debug: (topic: string, ...args: any[]) => void
```

Logs a debug-level message.
Proxies call to the underlying log adapter.

### info

```ts
info: (topic: string, ...args: any[]) => void
```

Logs an info-level message.
Proxies call to the underlying log adapter.

### warn

```ts
warn: (topic: string, ...args: any[]) => void
```

Logs a warning-level message.
Proxies call to the underlying log adapter.

### useLogger

```ts
useLogger: (Ctor: TLogCtor) => void
```

Sets the log adapter constructor.
All future log operations will use this adapter.

### usePersist

```ts
usePersist: () => void
```

Switches to persistent log adapter.
Log entries will be persisted to disk.

### useMemory

```ts
useMemory: () => void
```

Switches to in-memory log adapter (default).
Log entries will be stored in memory only.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy log adapter.
All future log writes will be no-ops.

### useJsonl

```ts
useJsonl: (fileName?: string, dirName?: string) => void
```

Switches to JSONL file log adapter.
Log entries will be appended to {dirName}/{fileName}.jsonl.
Reads are performed by parsing all lines from the file.

### clear

```ts
clear: () => void
```

Clears the memoized log instance.
Call this when process.cwd() changes between strategy iterations
so a new adapter instance is created with the updated base path.
