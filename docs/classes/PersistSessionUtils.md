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

### PersistSessionFactory

```ts
PersistSessionFactory: any
```

### getSessionStorage

```ts
getSessionStorage: any
```

### waitForInit

```ts
waitForInit: (strategyName: string, exchangeName: string, frameName: string, initial: boolean) => Promise<void>
```

Initializes the storage for a given (strategyName, exchangeName, frameName) triple.

### readSessionData

```ts
readSessionData: (strategyName: string, exchangeName: string, frameName: string) => Promise<SessionData>
```

Reads a session entry from persistence storage.

### writeSessionData

```ts
writeSessionData: (data: SessionData, strategyName: string, exchangeName: string, frameName: string) => Promise<void>
```

Writes a session entry to disk with atomic file writes.

### useDummy

```ts
useDummy: () => void
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.

### useJson

```ts
useJson: () => void
```

Switches to the default JSON persist adapter.
All future persistence writes will use JSON storage.

### clear

```ts
clear: () => void
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations
so new storage instances are created with the updated base path.

### dispose

```ts
dispose: (strategyName: string, exchangeName: string, frameName: string) => void
```

Disposes of the session adapter and releases any resources.
Call this when a session is removed to clean up its associated storage.

## Methods

### usePersistSessionAdapter

```ts
usePersistSessionAdapter(Ctor: TPersistBaseCtor<string, SessionData>): void;
```

Registers a custom persistence adapter.
