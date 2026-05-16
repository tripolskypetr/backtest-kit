---
title: docs/class/PersistSessionInstance
group: docs
---

# PersistSessionInstance

Implements `IPersistSessionInstance`

Default file-based implementation of IPersistSessionInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses frameName as entity ID within a per-strategy/exchange PersistBase
- dispose is a no-op (memo cache is managed by PersistSessionUtils)

## Constructor

```ts
constructor(strategyName: string, exchangeName: string, frameName: string);
```

## Properties

### strategyName

```ts
strategyName: string
```

### exchangeName

```ts
exchangeName: string
```

### frameName

```ts
frameName: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readSessionData

```ts
readSessionData(): Promise<SessionData | null>;
```

Reads the persisted session data using `frameName` as the entity key.

### writeSessionData

```ts
writeSessionData(data: SessionData, _when: Date): Promise<void>;
```

Writes the session data using `frameName` as the entity key.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistSessionUtils.dispose().
