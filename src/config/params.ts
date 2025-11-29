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
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 1_440,
  /**
   * Number of retries for getCandles function
   * Default: 3 retries
   */
  CC_GET_CANDLES_RETRY_COUNT: 3,
  /**
   * Delay between retries for getCandles function (in milliseconds)
   * Default: 5000 ms (5 seconds)
   */
  CC_GET_CANDLES_RETRY_DELAY_MS: 5_000,

  /**
   * Maximum allowed deviation factor for price anomaly detection.
   * Price should not be more than this factor lower than reference price.
   *
   * Reasoning:
   * - Incomplete candles from Binance API typically have prices near 0 (e.g., $0.01-1)
   * - Normal BTC price ranges: $20,000-100,000
   * - Factor 1000 catches prices below $20-100 when median is $20,000-100,000
   * - Factor 100 would be too permissive (allows $200 when median is $20,000)
   * - Factor 10000 might be too strict for low-cap altcoins
   *
   * Example: BTC at $50,000 median → threshold $50 (catches $0.01-1 anomalies)
   */
  CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: 1_000,

  /**
   * Minimum number of candles required for reliable median calculation.
   * Below this threshold, use simple average instead of median.
   *
   * Reasoning:
   * - Each candle provides 4 price points (OHLC)
   * - 5 candles = 20 price points, sufficient for robust median calculation
   * - Below 5 candles, single anomaly can heavily skew median
   * - Statistical rule of thumb: minimum 7-10 data points for median stability
   * - Average is more stable than median for small datasets (n < 20)
   *
   * Example: 3 candles = 12 points (use average), 5 candles = 20 points (use median)
   */
  CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: 5,
};

/**
 * Type for global configuration object.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
