import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { CandleInterval, IAggregatedTradeData, ICandleData, IOrderBookData } from "../interfaces/Exchange.interface";
import { getContextTimestamp } from "src/helpers/getContextTimestamp";

const GET_CANDLES_METHOD_NAME = "exchange.getCandles";
const GET_AVERAGE_PRICE_METHOD_NAME = "exchange.getAveragePrice";
const FORMAT_PRICE_METHOD_NAME = "exchange.formatPrice";
const FORMAT_QUANTITY_METHOD_NAME = "exchange.formatQuantity";
const GET_DATE_METHOD_NAME = "exchange.getDate";
const GET_TIMESTAMP_METHOD_NAME = "exchange.getTimestamp";
const GET_MODE_METHOD_NAME = "exchange.getMode";
const GET_SYMBOL_METHOD_NAME = "exchange.getSymbol";
const GET_CONTEXT_METHOD_NAME = "exchange.getContext";
const HAS_TRADE_CONTEXT_METHOD_NAME = "exchange.hasTradeContext";
const GET_ORDER_BOOK_METHOD_NAME = "exchange.getOrderBook";
const GET_RAW_CANDLES_METHOD_NAME = "exchange.getRawCandles";
const GET_NEXT_CANDLES_METHOD_NAME = "exchange.getNextCandles";
const GET_AGGREGATED_TRADES_METHOD_NAME = "exchange.getAggregatedTrades";

/**
 * Checks if trade context is active (execution and method contexts).
 *
 * Returns true when both contexts are active, which is required for calling
 * exchange functions like getCandles, getAveragePrice, formatPrice, formatQuantity,
 * getDate, and getMode.
 *
 * @returns true if trade context is active, false otherwise
 *
 * @example
 * ```typescript
 * import { hasTradeContext, getCandles } from "backtest-kit";
 *
 * if (hasTradeContext()) {
 *   const candles = await getCandles("BTCUSDT", "1m", 100);
 * } else {
 *   console.log("Trade context not active");
 * }
 * ```
 */
export function hasTradeContext(): boolean {
  backtest.loggerService.info(HAS_TRADE_CONTEXT_METHOD_NAME);
  return ExecutionContextService.hasContext() && MethodContextService.hasContext();
}

/**
 * Fetches historical candle data from the registered exchange.
 *
 * Candles are fetched backwards from the current execution context time.
 * Uses the exchange's getCandles implementation.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param interval - Candle interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h")
 * @param limit - Number of candles to fetch
 * @returns Promise resolving to array of candle data
 *
 * @example
 * ```typescript
 * const candles = await getCandles("BTCUSDT", "1m", 100);
 * console.log(candles[0]); // { timestamp, open, high, low, close, volume }
 * ```
 */
export async function getCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number
): Promise<ICandleData[]> {
  backtest.loggerService.info(GET_CANDLES_METHOD_NAME, {
    symbol,
    interval,
    limit,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getCandles requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getCandles requires a method context");
  }
  return await backtest.exchangeConnectionService.getCandles(
    symbol,
    interval,
    limit
  );
}

/**
 * Calculates VWAP (Volume Weighted Average Price) for a symbol.
 *
 * Uses the last 5 1-minute candles to calculate:
 * - Typical Price = (high + low + close) / 3
 * - VWAP = sum(typical_price * volume) / sum(volume)
 *
 * If volume is zero, returns simple average of close prices.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Promise resolving to VWAP price
 *
 * @example
 * ```typescript
 * const vwap = await getAveragePrice("BTCUSDT");
 * console.log(vwap); // 50125.43
 * ```
 */
export async function getAveragePrice(symbol: string): Promise<number> {
  backtest.loggerService.info(GET_AVERAGE_PRICE_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getAveragePrice requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getAveragePrice requires a method context");
  }
  return await backtest.exchangeConnectionService.getAveragePrice(symbol);
}

/**
 * Formats a price value according to exchange rules.
 *
 * Uses the exchange's formatPrice implementation for proper decimal places.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param price - Raw price value
 * @returns Promise resolving to formatted price string
 *
 * @example
 * ```typescript
 * const formatted = await formatPrice("BTCUSDT", 50000.123456);
 * console.log(formatted); // "50000.12"
 * ```
 */
export async function formatPrice(
  symbol: string,
  price: number
): Promise<string> {
  backtest.loggerService.info(FORMAT_PRICE_METHOD_NAME, {
    symbol,
    price,
  });
  if (!MethodContextService.hasContext()) {
    throw new Error("formatPrice requires a method context");
  }
  return await backtest.exchangeConnectionService.formatPrice(symbol, price);
}

/**
 * Formats a quantity value according to exchange rules.
 *
 * Uses the exchange's formatQuantity implementation for proper decimal places.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param quantity - Raw quantity value
 * @returns Promise resolving to formatted quantity string
 *
 * @example
 * ```typescript
 * const formatted = await formatQuantity("BTCUSDT", 0.123456789);
 * console.log(formatted); // "0.12345678"
 * ```
 */
export async function formatQuantity(
  symbol: string,
  quantity: number
): Promise<string> {
  backtest.loggerService.info(FORMAT_QUANTITY_METHOD_NAME, {
    symbol,
    quantity,
  });
  if (!MethodContextService.hasContext()) {
    throw new Error("formatQuantity requires a method context");
  }
  return await backtest.exchangeConnectionService.formatQuantity(
    symbol,
    quantity
  );
}

/**
 * Gets the current date from execution context.
 *
 * In backtest mode: returns the current timeframe date being processed
 * In live mode: returns current real-time date
 *
 * @returns Promise resolving to current execution context date
 *
 * @example
 * ```typescript
 * const date = await getDate();
 * console.log(date); // 2024-01-01T12:00:00.000Z
 * ```
 */
export async function getDate() {
  backtest.loggerService.info(GET_DATE_METHOD_NAME);
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getDate requires an execution context");
  }
  const { when } = backtest.executionContextService.context;
  return new Date(when.getTime());
}

/**
 * Gets the current timestamp from execution context.
 *
 * In backtest mode: returns the current timeframe timestamp being processed
 * In live mode: returns current real-time timestamp
 *
 * @returns Promise resolving to current execution context timestamp in milliseconds
 * @example
 * ```typescript
 * const timestamp = await getTimestamp();
 * console.log(timestamp); // 1700000000000
 * ```
 */
export async function getTimestamp() {
  backtest.loggerService.info(GET_TIMESTAMP_METHOD_NAME);
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getTimestamp requires an execution context");
  }
  return getContextTimestamp();
};

/**
 * Gets the current execution mode.
 *
 * @returns Promise resolving to "backtest" or "live"
 *
 * @example
 * ```typescript
 * const mode = await getMode();
 * if (mode === "backtest") {
 *   console.log("Running in backtest mode");
 * } else {
 *   console.log("Running in live mode");
 * }
 * ```
 */
export async function getMode(): Promise<"backtest" | "live"> {
  backtest.loggerService.info(GET_MODE_METHOD_NAME);
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getMode requires an execution context");
  }
  const { backtest: bt } = backtest.executionContextService.context;
  return bt ? "backtest" : "live";
}

/**
 * Gets the current trading symbol from execution context.
 *
 * @returns Promise resolving to the current trading symbol (e.g., "BTCUSDT")
 * @throws Error if execution context is not active
 *
 * @example
 * ```typescript
 * const symbol = await getSymbol();
 * console.log(symbol); // "BTCUSDT"
 * ```
 */
export async function getSymbol() {
  backtest.loggerService.info(GET_SYMBOL_METHOD_NAME);
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getSymbol requires an execution context");
  }
  const { symbol } = backtest.executionContextService.context;
  return symbol;
}

/**
 * Gets the current method context.
 *
 * Returns the context object from the method context service, which contains
 * information about the current method execution environment.
 *
 * @returns Promise resolving to the current method context object
 * @throws Error if method context is not active
 *
 * @example
 * ```typescript
 * const context = await getContext();
 * console.log(context); // { ...method context data... }
 * ```
 */
export async function getContext() {
  backtest.loggerService.info(GET_CONTEXT_METHOD_NAME);
  if (!MethodContextService.hasContext()) {
    throw new Error("getContext requires a method context");
  }
  return backtest.methodContextService.context;
} 

/**
 * Fetches order book for a trading pair from the registered exchange.
 *
 * Uses current execution context to determine timing. The underlying exchange
 * implementation receives time range parameters but may use them (backtest)
 * or ignore them (live trading).
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
 * @returns Promise resolving to order book data
 * @throws Error if execution or method context is missing
 *
 * @example
 * ```typescript
 * const orderBook = await getOrderBook("BTCUSDT");
 * console.log(orderBook.bids); // [{ price: "50000.00", quantity: "0.5" }, ...]
 * console.log(orderBook.asks); // [{ price: "50001.00", quantity: "0.3" }, ...]
 *
 * // Fetch deeper order book
 * const deepBook = await getOrderBook("BTCUSDT", 100);
 * ```
 */
export async function getOrderBook(symbol: string, depth?: number): Promise<IOrderBookData> {
  backtest.loggerService.info(GET_ORDER_BOOK_METHOD_NAME, {
    symbol,
    depth,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getOrderBook requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getOrderBook requires a method context");
  }
  return await backtest.exchangeConnectionService.getOrderBook(symbol, depth);
}

/**
 * Fetches raw candles with flexible date/limit parameters.
 *
 * All modes respect execution context and prevent look-ahead bias.
 *
 * Parameter combinations:
 * 1. sDate + eDate + limit: fetches with explicit parameters, validates eDate <= when
 * 2. sDate + eDate: calculates limit from date range, validates eDate <= when
 * 3. eDate + limit: calculates sDate backward, validates eDate <= when
 * 4. sDate + limit: fetches forward, validates calculated endTimestamp <= when
 * 5. Only limit: uses execution.context.when as reference (backward)
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param interval - Candle interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h")
 * @param limit - Optional number of candles to fetch
 * @param sDate - Optional start date in milliseconds
 * @param eDate - Optional end date in milliseconds
 * @returns Promise resolving to array of candle data
 *
 * @example
 * ```typescript
 * // Fetch 100 candles backward from current context time
 * const candles = await getRawCandles("BTCUSDT", "1m", 100);
 *
 * // Fetch candles for specific date range
 * const rangeCandles = await getRawCandles("BTCUSDT", "1h", undefined, startMs, endMs);
 *
 * // Fetch with all parameters specified
 * const exactCandles = await getRawCandles("BTCUSDT", "1m", 100, startMs, endMs);
 * ```
 */
export async function getRawCandles(
  symbol: string,
  interval: CandleInterval,
  limit?: number,
  sDate?: number,
  eDate?: number
): Promise<ICandleData[]> {
  backtest.loggerService.info(GET_RAW_CANDLES_METHOD_NAME, {
    symbol,
    interval,
    limit,
    sDate,
    eDate,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getRawCandles requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getRawCandles requires a method context");
  }
  return await backtest.exchangeConnectionService.getRawCandles(
    symbol,
    interval,
    limit,
    sDate,
    eDate
  );
}

/**
 * Fetches the set of candles after current time based on execution context.
 *
 * Uses the exchange's getNextCandles implementation to retrieve candles
 * that occur after the current context time.
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param interval - Candle interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h")
 * @param limit - Number of candles to fetch
 * @returns Promise resolving to array of candle data
 */
export async function getNextCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number,
): Promise<ICandleData[]> {
  backtest.loggerService.info(GET_NEXT_CANDLES_METHOD_NAME, {
    symbol,
    interval,
    limit,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getNextCandles requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getNextCandles requires a method context");
  }
  return await backtest.exchangeConnectionService.getNextCandles(
    symbol,
    interval,
    limit,
  );
}

/**
 * Fetches aggregated trades for a trading pair from the registered exchange.
 *
 * Trades are fetched backwards from the current execution context time.
 * If limit is not specified, returns all trades within one CC_AGGREGATED_TRADES_MAX_MINUTES window.
 * If limit is specified, paginates backwards until at least limit trades are collected.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param limit - Optional maximum number of trades to fetch
 * @returns Promise resolving to array of aggregated trade data
 * @throws Error if execution or method context is missing
 *
 * @example
 * ```typescript
 * // Fetch last hour of trades
 * const trades = await getAggregatedTrades("BTCUSDT");
 *
 * // Fetch last 500 trades
 * const lastTrades = await getAggregatedTrades("BTCUSDT", 500);
 * console.log(lastTrades[0]); // { id, price, qty, timestamp, isBuyerMaker }
 * ```
 */
export async function getAggregatedTrades(
  symbol: string,
  limit?: number,
): Promise<IAggregatedTradeData[]> {
  backtest.loggerService.info(GET_AGGREGATED_TRADES_METHOD_NAME, {
    symbol,
    limit,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getAggregatedTrades requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getAggregatedTrades requires a method context");
  }
  return await backtest.exchangeConnectionService.getAggregatedTrades(symbol, limit);
}