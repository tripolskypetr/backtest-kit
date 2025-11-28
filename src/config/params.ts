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
}

/**
 * Type for global configuration object.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
