---
title: docs/api-reference/interface/IRiskActivePosition
group: docs
---

# IRiskActivePosition

Active position tracked by ClientRisk for cross-strategy analysis.

## Properties

### signal

```ts
signal: ISignalRow
```

Signal details for the active position

### strategyName

```ts
strategyName: string
```

Strategy name owning the position

### exchangeName

```ts
exchangeName: string
```

Exchange name

### openTimestamp

```ts
openTimestamp: number
```

Timestamp when the position was opened
