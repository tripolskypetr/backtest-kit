---
title: docs/api-reference/interface/ISignalRow
group: docs
---

# ISignalRow

Complete signal with auto-generated id.
Used throughout the system after validation.

## Properties

### id

```ts
id: string
```

Unique signal identifier (UUID v4 auto-generated)

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### exchangeName

```ts
exchangeName: string
```

Unique exchange identifier for execution

### strategyName

```ts
strategyName: string
```

Unique strategy identifier for execution

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds (when signal was first created/scheduled)

### pendingAt

```ts
pendingAt: number
```

Pending timestamp in milliseconds (when position became pending/active at priceOpen)

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### _isScheduled

```ts
_isScheduled: boolean
```

Internal runtime marker for scheduled signals
