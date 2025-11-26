---
title: docs/api-reference/interface/IRisk
group: docs
---

# IRisk

Risk interface implemented by ClientRisk.
Provides risk checking for signals and position tracking.

## Properties

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs) => Promise<boolean>
```

Check if a signal should be allowed based on risk limits.

### addSignal

```ts
addSignal: (symbol: string, context: { strategyName: string; riskName: string; }) => Promise<void>
```

Register a new opened signal/position.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; }) => Promise<void>
```

Remove a closed signal/position.
