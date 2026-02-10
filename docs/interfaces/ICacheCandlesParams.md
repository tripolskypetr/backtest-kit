---
title: docs/interface/ICacheCandlesParams
group: docs
---

# ICacheCandlesParams

Parameters for pre-caching candles into persist storage.
Used to download historical candle data before running a backtest.

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

Start date of the caching range (inclusive)

### to

```ts
to: Date
```

End date of the caching range (inclusive)
