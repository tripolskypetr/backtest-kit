---
title: docs/class/PersistRecentInstance
group: docs
---

# PersistRecentInstance

Implements `IPersistRecentInstance`

Default file-based implementation of IPersistRecentInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses symbol as entity ID within a per-context PersistBase
- Context key includes backtest/live mode and optional frameName

## Constructor

```ts
constructor(symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean);
```

## Properties

### symbol

```ts
symbol: string
```

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

### backtest

```ts
backtest: boolean
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

### readRecentData

```ts
readRecentData(): Promise<IPublicSignalRow | null>;
```

Reads the persisted recent signal using `symbol` as the entity key.

### writeRecentData

```ts
writeRecentData(signalRow: IPublicSignalRow, _when: Date): Promise<void>;
```

Writes the recent signal using `symbol` as the entity key.
