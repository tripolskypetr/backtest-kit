---
title: docs/interface/IRiskValidationPayload
group: docs
---

# IRiskValidationPayload

Payload passed to risk validation functions.
Extends IRiskCheckArgs with portfolio state data.

## Properties

### pendingSignal

```ts
pendingSignal: IRiskSignalRow
```

Pending signal to apply (IRiskSignalRow is calculated internally so priceOpen always exist)

### activePositionCount

```ts
activePositionCount: number
```

Number of currently active positions across all strategies

### activePositions

```ts
activePositions: IRiskActivePosition[]
```

List of currently active positions across all strategies
