---
title: docs/class/PersistBreakevenUtils
group: docs
---

# PersistBreakevenUtils

Persistence utility class for breakeven state management.

Handles reading and writing breakeven state to disk.
Uses memoized PersistBreakevenInstance instances per symbol-strategy pair.

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

### PersistBreakevenInstanceCtor

```ts
PersistBreakevenInstanceCtor: any
```

Constructor used to create per-context breakeven instances.
Replaceable via usePersistBreakevenAdapter() / useJson() / useDummy().

### getBreakevenStorage

```ts
getBreakevenStorage: any
```

Memoized factory creating one IPersistBreakevenInstance per (symbol, strategy, exchange) triple.
Each signal's breakeven data is stored under its own signalId within the instance.

### readBreakevenData

```ts
readBreakevenData: (symbol: string, strategyName: string, signalId: string, exchangeName: string, when: Date) => Promise<BreakevenData>
```

Reads breakeven data for the given context and signalId.
Lazily initializes the instance on first access.

### writeBreakevenData

```ts
writeBreakevenData: (breakevenData: BreakevenData, symbol: string, strategyName: string, signalId: string, exchangeName: string, when: Date) => Promise<void>
```

Writes breakeven data for the given context and signalId.
Lazily initializes the instance on first access.

## Methods

### usePersistBreakevenAdapter

```ts
usePersistBreakevenAdapter(Ctor: TPersistBreakevenInstanceCtor): void;
```

Registers a custom IPersistBreakevenInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### clear

```ts
clear(): void;
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistBreakevenInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistBreakevenDummyInstance (all operations are no-ops).
