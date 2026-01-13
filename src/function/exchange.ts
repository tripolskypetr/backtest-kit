import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { CandleInterval, ICandleData, IOrderBookData } from "../interfaces/Exchange.interface";

const GET_CANDLES_METHOD_NAME = "exchange.getCandles";
const GET_AVERAGE_PRICE_METHOD_NAME = "exchange.getAveragePrice";
const FORMAT_PRICE_METHOD_NAME = "exchange.formatPrice";
const FORMAT_QUANTITY_METHOD_NAME = "exchange.formatQuantity";
const GET_DATE_METHOD_NAME = "exchange.getDate";
const GET_MODE_METHOD_NAME = "exchange.getMode";
const HAS_TRADE_CONTEXT_METHOD_NAME = "exchange.hasTradeContext";
const GET_ORDER_BOOK_METHOD_NAME = "exchange.getOrderBook";

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
 * Fetches order book for a trading pair from the registered exchange.
 *
 * Uses current execution context to determine timing. The underlying exchange
 * implementation receives time range parameters but may use them (backtest)
 * or ignore them (live trading).
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Promise resolving to order book data
 * @throws Error if execution or method context is missing
 *
 * @example
 * ```typescript
 * const orderBook = await getOrderBook("BTCUSDT");
 * console.log(orderBook.bids); // [{ price: "50000.00", quantity: "0.5" }, ...]
 * console.log(orderBook.asks); // [{ price: "50001.00", quantity: "0.3" }, ...]
 * ```
 */
export async function getOrderBook(symbol: string): Promise<IOrderBookData> {
  backtest.loggerService.info(GET_ORDER_BOOK_METHOD_NAME, {
    symbol,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getOrderBook requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getOrderBook requires a method context");
  }
  return await backtest.exchangeConnectionService.getOrderBook(symbol);
}

export default { getCandles, getAveragePrice, getDate, getMode, hasTradeContext, getOrderBook };
