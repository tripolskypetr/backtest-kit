---
title: docs/interface/IRisk
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
addSignal: (symbol: string, context: { strategyName: string; riskName: string; exchangeName: string; frameName: string; }, positionData: { position: "long" | "short"; priceOpen: number; priceStopLoss: number; priceTakeProfit: number; minuteEstimatedTime: number; openTimestamp: number; }) => Promise<...>
```

Register a new opened signal/position.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Remove a closed signal/position.
