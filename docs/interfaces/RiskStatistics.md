---
title: docs/api-reference/interface/RiskStatistics
group: docs
---

# RiskStatistics

Statistical data calculated from risk rejection events.

Provides metrics for risk management tracking.

## Properties

### eventList

```ts
eventList: RiskEvent[]
```

Array of all risk rejection events with full details

### totalRejections

```ts
totalRejections: number
```

Total number of risk rejections

### bySymbol

```ts
bySymbol: Record<string, number>
```

Rejections grouped by symbol

### byStrategy

```ts
byStrategy: Record<string, number>
```

Rejections grouped by strategy
