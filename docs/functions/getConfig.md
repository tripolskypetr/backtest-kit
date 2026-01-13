---
title: docs/function/getConfig
group: docs
---

# getConfig

```ts
declare function getConfig(): {
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
    CC_MAX_CANDLES_PER_REQUEST: number;
    CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: number;
    CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: number;
    CC_REPORT_SHOW_SIGNAL_NOTE: boolean;
    CC_BREAKEVEN_THRESHOLD: number;
    CC_ORDER_BOOK_TIME_OFFSET_MINUTES: number;
};
```

Retrieves a copy of the current global configuration.

Returns a shallow copy of the current GLOBAL_CONFIG to prevent accidental mutations.
Use this to inspect the current configuration state without modifying it.
