---
title: docs/interface/IFrameSchema
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

### note

```ts
note: string
```

Optional developer note for documentation

### interval

```ts
interval: FrameInterval
```

Interval for time range generation. Defaults to "1m" if not specified

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
