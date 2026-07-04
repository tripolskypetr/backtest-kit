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
constructor(strategyName: string, exchangeName: string, frameName: string, symbol: string, backtest: boolean);
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

### symbol

```ts
symbol: string
```

### backtest

```ts
backtest: boolean
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

### _entityId

```ts
_entityId: any
```

Entity key inside the per-strategy/exchange/frame storage directory.
Includes the symbol and backtest flag: without them two symbols running
the same strategy would clobber one shared record and restore each
other's session state after a restart.

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

Reads the persisted session data using the per-symbol entity key.

### writeSessionData

```ts
writeSessionData(data: SessionData, _when: Date): Promise<void>;
```

Writes the session data using the per-symbol entity key.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistSessionUtils.dispose().
