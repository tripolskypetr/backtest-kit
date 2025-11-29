export const GLOBAL_CONFIG = {
    /**
     * Time to wait for scheduled signal to activate (in minutes)
     * If signal does not activate within this time, it will be cancelled.
     */
    CC_SCHEDULE_AWAIT_MINUTES: 120,
    /**
     * Number of candles to use for average price calculation (VWAP)
     * Default: 5 candles (last 5 minutes when using 1m interval)
     */
    CC_AVG_PRICE_CANDLES_COUNT: 5,
    /**
     * Minimum TakeProfit distance from priceOpen (percentage)
     * Must be greater than trading fees to ensure profitable trades
     * Default: 0.3% (covers 2×0.1% fees + minimum profit margin)
     */
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.1,
    /**
     * Maximum StopLoss distance from priceOpen (percentage)
     * Prevents catastrophic losses from extreme StopLoss values
     * Default: 20% (one signal cannot lose more than 20% of position)
     */
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: 20,
    /**
     * Maximum signal lifetime in minutes
     * Prevents eternal signals that block risk limits for weeks/months
     * Default: 1440 minutes (1 day)
     */
    CC_MAX_SIGNAL_LIFETIME_MINUTES: 1440,
}

/**
 * Type for global configuration object.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
