---
title: docs/api-reference/interface/IRiskValidationPayload
group: docs
---

# IRiskValidationPayload

Payload passed to risk validation functions.
Extends IRiskCheckArgs with portfolio state data.

## Properties

### pendingSignal

```ts
pendingSignal: ISignalDto
```

Pending signal to apply

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
