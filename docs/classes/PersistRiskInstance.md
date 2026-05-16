---
title: docs/class/PersistRiskInstance
group: docs
---

# PersistRiskInstance

Implements `IPersistRiskInstance`

Default file-based implementation of IPersistRiskInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses fixed entity ID "positions" within a per-context PersistBase
- Crash-safe via atomic writes

## Constructor

```ts
constructor(riskName: string, exchangeName: string);
```

## Properties

### riskName

```ts
riskName: string
```

### exchangeName

```ts
exchangeName: string
```

### STORAGE_KEY

```ts
STORAGE_KEY: any
```

Fixed entity key for storing the positions array

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

### readPositionData

```ts
readPositionData(_when: Date): Promise<RiskData>;
```

Reads the persisted positions array using the fixed STORAGE_KEY.

### writePositionData

```ts
writePositionData(riskRow: RiskData, _when: Date): Promise<void>;
```

Writes the positions array using the fixed STORAGE_KEY.
