---
title: docs/api-reference/interface/IFrameSchema
group: docs
---

# IFrameSchema

Frame schema registered via addFrame().
Defines backtest period and interval for timestamp generation.

## Properties

### frameName

```ts
frameName: string
```

Unique identifier for this frame

### interval

```ts
interval: FrameInterval
```

Interval for timestamp generation

### startDate

```ts
startDate: Date
```

Start of backtest period (inclusive)

### endDate

```ts
endDate: Date
```

End of backtest period (inclusive)

### callbacks

```ts
callbacks: Partial<IFrameCallbacks>
```

Optional lifecycle callbacks
