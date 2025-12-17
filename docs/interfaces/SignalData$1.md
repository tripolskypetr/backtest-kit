---
title: docs/api-reference/interface/SignalData$1
group: docs
---

# SignalData$1

Signal data for PNL table.
Represents a single closed signal with essential trading information.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy that generated this signal

### signalId

```ts
signalId: string
```

Unique signal identifier

### symbol

```ts
symbol: string
```

Trading pair symbol

### position

```ts
position: string
```

Position type (long/short)

### pnl

```ts
pnl: number
```

PNL as percentage

### closeReason

```ts
closeReason: string
```

Reason why signal was closed

### openTime

```ts
openTime: number
```

Timestamp when signal opened

### closeTime

```ts
closeTime: number
```

Timestamp when signal closed
