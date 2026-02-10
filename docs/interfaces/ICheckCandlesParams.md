---
title: docs/interface/ICheckCandlesParams
group: docs
---

# ICheckCandlesParams

Parameters for validating cached candle timestamps.
Reads JSON files directly from persist storage directory.

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

### baseDir

```ts
baseDir: string
```

Base directory of candle persist storage (default: "./dump/data/candle")
