---
title: docs/class/SessionLiveAdapter
group: docs
---

# SessionLiveAdapter

Implements `TSessionAdapter`

Live trading session adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable session instance implementations
- Default backend: SessionPersistInstance (file-system backed, survives restarts)
- Alternative backends: SessionLocalInstance, SessionDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useSessionAdapter()
- Memoized instances per (symbol, strategyName, exchangeName, frameName) tuple

## Constructor

```ts
constructor();
```

## Properties

### SessionFactory

```ts
SessionFactory: any
```

### getInstance

```ts
getInstance: any
```

### getData

```ts
getData: <Value extends object = object>(symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<Value>
```

Read the current session value for a live run.

### setData

```ts
setData: <Value extends object = object>(symbol: string, value: Value, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Update the session value for a live run.

### useLocal

```ts
useLocal: () => void
```

Switches to in-memory adapter.
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter (default).
Data is persisted to disk via PersistSessionAdapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### useSessionAdapter

```ts
useSessionAdapter: (Ctor: TSessionInstanceCtor) => void
```

Switches to a custom session adapter implementation.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
