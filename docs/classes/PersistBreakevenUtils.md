---
title: docs/class/PersistBreakevenUtils
group: docs
---

# PersistBreakevenUtils

Persistence utility class for breakeven state management.

Handles reading and writing breakeven state to disk.
Uses memoized PersistBase instances per symbol-strategy pair.

Features:
- Atomic file writes via PersistBase.writeValue()
- Lazy initialization on first access
- Singleton pattern for global access
- Custom adapter support via usePersistBreakevenAdapter()

File structure:
```
./dump/data/breakeven/
├── BTCUSDT_my-strategy/
│   └── state.json        // { "signal-id-1": { reached: true }, ... }
└── ETHUSDT_other-strategy/
    └── state.json
```

## Constructor

```ts
constructor();
```

## Properties

### PersistBreakevenFactory

```ts
PersistBreakevenFactory: any
```

Factory for creating PersistBase instances.
Can be replaced via usePersistBreakevenAdapter().

### getBreakevenStorage

```ts
getBreakevenStorage: any
```

Memoized storage factory for breakeven data.
Creates one PersistBase instance per symbol-strategy-exchange combination.
Key format: "symbol:strategyName:exchangeName"

### readBreakevenData

```ts
readBreakevenData: (symbol: string, strategyName: string, signalId: string, exchangeName: string) => Promise<BreakevenData>
```

Reads persisted breakeven data for a symbol and strategy.

Called by ClientBreakeven.waitForInit() to restore state.
Returns empty object if no breakeven data exists.

### writeBreakevenData

```ts
writeBreakevenData: (breakevenData: BreakevenData, symbol: string, strategyName: string, signalId: string, exchangeName: string) => Promise<void>
```

Writes breakeven data to disk.

Called by ClientBreakeven._persistState() after state changes.
Creates directory and file if they don't exist.
Uses atomic writes to prevent data corruption.

## Methods

### usePersistBreakevenAdapter

```ts
usePersistBreakevenAdapter(Ctor: TPersistBaseCtor<string, BreakevenData>): void;
```

Registers a custom persistence adapter.
