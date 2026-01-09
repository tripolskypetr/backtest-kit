---
title: docs/function/getDefaultConfig
group: docs
---

# getDefaultConfig

```ts
declare function getDefaultConfig(): Readonly<{
    CC_SCHEDULE_AWAIT_MINUTES: number;
    CC_AVG_PRICE_CANDLES_COUNT: number;
    CC_PERCENT_SLIPPAGE: number;
    CC_PERCENT_FEE: number;
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: number;
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_SIGNAL_LIFETIME_MINUTES: number;
    CC_MAX_SIGNAL_GENERATION_SECONDS: number;
    CC_GET_CANDLES_RETRY_COUNT: number;
    CC_GET_CANDLES_RETRY_DELAY_MS: number;
    CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: number;
    CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: number;
    CC_REPORT_SHOW_SIGNAL_NOTE: boolean;
    CC_BREAKEVEN_THRESHOLD: number;
}>;
```

Retrieves the default configuration object for the framework.

Returns a reference to the default configuration with all preset values.
Use this to see what configuration options are available and their default values.
