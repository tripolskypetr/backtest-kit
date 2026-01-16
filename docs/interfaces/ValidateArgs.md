---
title: docs/interface/ValidateArgs
group: docs
---

# ValidateArgs

Interface defining validation arguments for all entity types.

Each property accepts an enum object where values will be validated
against registered entities in their respective validation services.

## Properties

### ExchangeName

```ts
ExchangeName: T
```

Exchange name enum to validate

### FrameName

```ts
FrameName: T
```

Frame (timeframe) name enum to validate

### StrategyName

```ts
StrategyName: T
```

Strategy name enum to validate

### RiskName

```ts
RiskName: T
```

Risk profile name enum to validate

### ActionName

```ts
ActionName: T
```

Action handler name enum to validate

### SizingName

```ts
SizingName: T
```

Sizing strategy name enum to validate

### OptimizerName

```ts
OptimizerName: T
```

Optimizer name enum to validate

### WalkerName

```ts
WalkerName: T
```

Walker (parameter sweep) name enum to validate
