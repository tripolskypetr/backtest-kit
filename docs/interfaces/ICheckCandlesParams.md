---
title: docs/interface/ICheckCandlesParams
group: docs
---

# ICheckCandlesParams

Parameters for validating cached candle presence.
Queries persist storage adapter without scanning files.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### exchangeName

```ts
exchangeName: string
```

Name of the registered exchange schema

### interval

```ts
interval: CandleInterval
```

Candle time interval (e.g., "1m", "4h")

### from

```ts
from: Date
```

Start date of the validation range (inclusive)

### to

```ts
to: Date
```

End date of the validation range (inclusive)
