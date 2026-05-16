---
title: docs/class/PersistRiskUtils
group: docs
---

# PersistRiskUtils

Utility class for managing risk active positions persistence.

Features:
- Memoized storage instances per risk profile
- Custom adapter support
- Atomic read/write operations for RiskData
- Crash-safe position state management

Used by ClientRisk for live mode persistence of active positions.

## Constructor

```ts
constructor();
```

## Properties

### PersistRiskInstanceCtor

```ts
PersistRiskInstanceCtor: any
```

Constructor used to create per-context risk instances.
Replaceable via usePersistRiskAdapter() / useJson() / useDummy().

### getRiskStorage

```ts
getRiskStorage: any
```

Memoized factory creating one IPersistRiskInstance per (riskName, exchange) pair.

### readPositionData

```ts
readPositionData: (riskName: string, exchangeName: string, when: Date) => Promise<RiskData>
```

Reads persisted active positions for the given risk context.
Lazily initializes the instance on first access.

### writePositionData

```ts
writePositionData: (riskRow: RiskData, riskName: string, exchangeName: string, when: Date) => Promise<void>
```

Writes active positions for the given risk context.
Lazily initializes the instance on first access.

## Methods

### usePersistRiskAdapter

```ts
usePersistRiskAdapter(Ctor: TPersistRiskInstanceCtor): void;
```

Registers a custom IPersistRiskInstance constructor.
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

Switches to the default file-based PersistRiskInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistRiskDummyInstance (all operations are no-ops).
