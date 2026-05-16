---
title: docs/class/PersistSessionUtils
group: docs
---

# PersistSessionUtils

Utility class for managing session persistence.

Features:
- Memoized storage instances per (strategyName, exchangeName, frameName) key
- Custom adapter support
- Atomic read/write operations

Storage layout: ./dump/session/&lt;strategyName&gt;/&lt;exchangeName&gt;/&lt;frameName&gt;.json

Used by SessionPersistInstance for crash-safe session persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistSessionInstanceCtor

```ts
PersistSessionInstanceCtor: any
```

Constructor used to create per-context session instances.
Replaceable via usePersistSessionAdapter() / useJson() / useDummy().

### getSessionStorage

```ts
getSessionStorage: any
```

Memoized factory creating one IPersistSessionInstance per
(strategyName, exchangeName, frameName) triple.

### waitForInit

```ts
waitForInit: (strategyName: string, exchangeName: string, frameName: string, initial: boolean) => Promise<void>
```

Initializes the session storage for the given context.
Skips initialization when `initial` is false (used to gate first-time setup).

### readSessionData

```ts
readSessionData: (strategyName: string, exchangeName: string, frameName: string) => Promise<SessionData>
```

Reads persisted session data for the given context.
Lazily initializes the instance on first access.

### writeSessionData

```ts
writeSessionData: (data: SessionData, strategyName: string, exchangeName: string, frameName: string, when: Date) => Promise<void>
```

Writes session data for the given context.
Lazily initializes the instance on first access.

### useDummy

```ts
useDummy: () => void
```

Switches to PersistSessionDummyInstance (all operations are no-ops).

### useJson

```ts
useJson: () => void
```

Switches to the default file-based PersistSessionInstance.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### dispose

```ts
dispose: (strategyName: string, exchangeName: string, frameName: string) => void
```

Drops the memoized instance for the given context.
Call when a session is removed to clean up its associated storage entry.

## Methods

### usePersistSessionAdapter

```ts
usePersistSessionAdapter(Ctor: TPersistSessionInstanceCtor): void;
```

Registers a custom IPersistSessionInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.
