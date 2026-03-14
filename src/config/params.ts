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
   * Slippage percentage applied to entry and exit prices.
   * Simulates market impact and order book depth.
   * Applied twice (entry and exit) for realistic execution simulation.
   * Default: 0.1% per transaction
   */
  CC_PERCENT_SLIPPAGE: 0.1,
  /**
   * Fee percentage charged per transaction.
   * Applied twice (entry and exit) for total fee calculation.
   * Default: 0.1% per transaction (total 0.2%)
   */
  CC_PERCENT_FEE: 0.1,
  /**
   * Minimum TakeProfit distance from priceOpen (percentage)
   * Must be greater than (slippage + fees) to ensure profitable trades
   *
   * Calculation:
   * - Slippage effect: ~0.2% (0.1% × 2 transactions)
   * - Fees: 0.2% (0.1% × 2 transactions)
   * - Minimum profit buffer: 0.1%
   * - Total: 0.5%
   *
   * Default: 0.5% (covers all costs + minimum profit margin)
   */
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.5,
  /**
   * Minimum StopLoss distance from priceOpen (percentage)
   * Prevents signals from being immediately stopped out due to price volatility
   * Default: 0.5% (buffer to avoid instant stop loss on normal market fluctuations)
   */
  CC_MIN_STOPLOSS_DISTANCE_PERCENT: 0.5,
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
   * Maximum time allowed for signal generation (in seconds).
   * Prevents long-running or stuck signal generation routines from blocking
   * execution or consuming resources indefinitely. If generation exceeds this
   * threshold the attempt should be aborted, logged and optionally retried.
   *
   * Default: 180 seconds (3 minutes)
   */
  CC_MAX_SIGNAL_GENERATION_SECONDS: 180,
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
   * Maximum number of candles to request per single API call.
   * If a request exceeds this limit, data will be fetched using pagination.
   * Default: 1000 candles per request
   */
  CC_MAX_CANDLES_PER_REQUEST: 1_000,

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

  /**
   * Controls visibility of signal notes in markdown report tables.
   * When enabled, the "Note" column will be displayed in all markdown reports
   * (backtest, live, schedule, risk, etc.)
   *
   * Default: false (notes are hidden to reduce table width and improve readability)
   */
  CC_REPORT_SHOW_SIGNAL_NOTE: false,
  /**
   * Breakeven threshold percentage - minimum profit distance from entry to enable breakeven.
   * When price moves this percentage in profit direction, stop-loss can be moved to entry (breakeven).
   *
   * Calculation:
   * - Slippage effect: ~0.2% (0.1% × 2 transactions)
   * - Fees: 0.2% (0.1% × 2 transactions)
   * - Total: 0.4%
   * - Added buffer: 0.2%
   * - Overall: 0.6%
   *
   * Default: 0.2% (additional buffer above costs to ensure no loss when moving to breakeven)
   */
  CC_BREAKEVEN_THRESHOLD: 0.2,
  /**
   * Time offset in minutes for order book fetching.
   * Subtracts this amount from the current time when fetching order book data.
   * This helps get a more stable snapshot of the order book by avoiding real-time volatility.
   *
   * Default: 10 minutes
   */
  CC_ORDER_BOOK_TIME_OFFSET_MINUTES: 10,
  /**
   * Maximum depth levels for order book fetching.
   * Specifies how many price levels to fetch from both bids and asks.
   *
   * Default: 20 levels
   */
  CC_ORDER_BOOK_MAX_DEPTH_LEVELS: 1_000,

  /**
   * Maximum minutes of aggregated trades to fetch when no limit is provided.
   * If limit is not specified, the system will fetch aggregated trades for this many minutes starting from the current time minus the offset.
   * Binance requirement
   */
  CC_AGGREGATED_TRADES_MAX_MINUTES: 60,

  /**
   * Maximum number of events to keep in backtest markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_BACKTEST_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in breakeven markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_BREAKEVEN_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in heatmap markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_HEATMAP_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in highest profit markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in live markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_LIVE_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in partial markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_PARTIAL_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in risk markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_RISK_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in schedule markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_SCHEDULE_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in strategy markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_STRATEGY_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of events to keep in sync markdown report storage.
   * Older events are removed (FIFO) when this limit is exceeded.
   *
   * Default: 250 events
   */
  CC_MAX_SYNC_MARKDOWN_ROWS: 250,
  /**
   * Maximum number of performance metric events to keep in storage.
   * Older events are removed when this limit is exceeded.
   * Higher than other report event limits because performance metrics are lightweight
   * and benefit from larger sample sizes for accurate statistical analysis.
   *
   * Default: 10000 events
   */
  CC_MAX_PERFORMANCE_MARKDOWN_ROWS: 10_000,
  /**
   * Maximum number of notifications to keep in storage.
   * Older notifications are removed when this limit is exceeded.
   *
   * Default: 500 notifications
   */
  CC_MAX_NOTIFICATIONS: 500,
  /**
   * Maximum number of signals to keep in storage.
   * Older signals are removed when this limit is exceeded.
   *
   * Default: 50 signals
   */
  CC_MAX_SIGNALS: 50,

  /**
   * Maximum number of log lines to keep in storage.
   * Older log lines are removed when this limit is exceeded.
   * This helps prevent unbounded log growth which can consume memory and degrade performance over time.
   *
   * Default: 1000 log lines
   */
  CC_MAX_LOG_LINES: 1_000,

  /**
   * Enables mutex locking for candle fetching to prevent concurrent fetches of the same candles.
   * This can help avoid redundant API calls and ensure data consistency when multiple processes/threads attempt to fetch candles simultaneously.
   *
   * Default: true (mutex locking enabled for candle fetching)
   */
  CC_ENABLE_CANDLE_FETCH_MUTEX: true,

  /**
   * Enables DCA (Dollar-Cost Averaging) logic even if antirecord is not broken.
   * Allows to commitAverageBuy if currentPrice is not the lowest price since entry, but still lower than priceOpen.
   * This can help improve average entry price in cases where price has rebounded after entry but is still below priceOpen, without waiting for a new lower price.
   *
   * Default: false (DCA logic enabled only when antirecord is broken)
   */
  CC_ENABLE_DCA_EVERYWHERE: false,

  /**
   * Enables PPPL (Partial Profit, Partial Loss) logic even if this breaks a direction of exits
   * Allows to take partial profit or loss on a position even if it results in a mix of profit and loss exits
   * This can help lock in profits or cut losses on part of the position without waiting for a perfect exit scenario.
   *
   * Default: false (PPPL logic is only applied when it does not break the direction of exits, ensuring clearer profit/loss outcomes)
   */
  CC_ENABLE_PPPL_EVERYWHERE: false,

  /**
   * Cost of entering a position (in USD).
   * This is used as a default value for calculating position size and risk management when cost data is not provided by the strategy
   * Default: $100 per position
   */
  CC_POSITION_ENTRY_COST: 100,
};

export const DEFAULT_CONFIG = Object.freeze({...GLOBAL_CONFIG});

/**
 * Type for global configuration object.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
