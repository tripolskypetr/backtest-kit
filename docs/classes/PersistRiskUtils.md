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

### PersistRiskFactory

```ts
PersistRiskFactory: any
```

### getRiskStorage

```ts
getRiskStorage: any
```

### readPositionData

```ts
readPositionData: (riskName: string, exchangeName: string) => Promise<RiskData>
```

Reads persisted active positions for a risk profile.

Called by ClientRisk.waitForInit() to restore state.
Returns empty Map if no positions exist.

### writePositionData

```ts
writePositionData: (riskRow: RiskData, riskName: string, exchangeName: string) => Promise<void>
```

Writes active positions to disk with atomic file writes.

Called by ClientRisk after addSignal/removeSignal to persist state.
Uses atomic writes to prevent corruption on crashes.

## Methods

### usePersistRiskAdapter

```ts
usePersistRiskAdapter(Ctor: TPersistBaseCtor<RiskName, RiskData>): void;
```

Registers a custom persistence adapter.
