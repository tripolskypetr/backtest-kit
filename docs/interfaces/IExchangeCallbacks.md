---
title: docs/api-reference/interface/IExchangeCallbacks
group: docs
---

# IExchangeCallbacks

Optional callbacks for exchange data events.

## Properties

### onCandleData

```ts
onCandleData: (symbol: string, interval: CandleInterval, since: Date, limit: number, data: ICandleData[]) => void
```

Called when candle data is fetched
