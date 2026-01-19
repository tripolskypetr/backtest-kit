---
title: docs/interface/IParseArgsParams
group: docs
---

# IParseArgsParams

Input parameters for parseArgs function.
Defines the default values for command-line argument parsing.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT", "ETHUSDT")

### strategyName

```ts
strategyName: string
```

Name of the trading strategy to execute

### exchangeName

```ts
exchangeName: string
```

Name of the exchange to connect to (e.g., "binance", "bybit")

### frameName

```ts
frameName: string
```

Timeframe for candle data (e.g., "1h", "15m", "1d")
