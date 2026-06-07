import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";

const GET_DATE_METHOD_NAME = "meta.getDate";
const GET_TIMESTAMP_METHOD_NAME = "meta.getTimestamp";
const GET_MODE_METHOD_NAME = "meta.getMode";
const GET_SYMBOL_METHOD_NAME = "meta.getSymbol";
const GET_CONTEXT_METHOD_NAME = "meta.getContext";
const GET_RUNTIME_INFO_METHOD_NAME = "meta.getRuntimeInfo";

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
  if (!MethodContextService.hasContext()) {
    throw new Error("getTimestamp requires a method context");
  }
  const { symbol, backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  return backtest.timeMetaService.getTimestamp(
    symbol,
    {
      exchangeName,
      frameName,
      strategyName,
    },
    isBacktest,
  );
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
 * Gets runtime information about the current execution environment.
 *
 * This includes details such as the current symbol, exchange, timeframe, strategy, and whether it's a backtest or live run.
 *
 * @returns Promise resolving to an object containing runtime information
 * @throws Error if method context or execution context is not active
 *
 * @example
 * ```typescript
 * const runtimeInfo = await getRuntimeInfo();
 * console.log(runtimeInfo);
 * // {
 * //   symbol: "BTCUSDT",
 * //   context: {,
 * //     exchangeName: "Binance",
 * //     frameName: "1m",
 * //     strategyName: "MyStrategy",
 * //   },
 * //   backtest: false
 * // }
 * ```
 */
export async function getRuntimeInfo() {
  backtest.loggerService.info(GET_RUNTIME_INFO_METHOD_NAME);
  if (!MethodContextService.hasContext()) {
    throw new Error("getRuntimeInfo requires a method context");
  }
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getRuntimeInfo requires an execution context");
  }
  const { exchangeName, frameName, strategyName } = backtest.methodContextService.context;
  const { symbol, backtest: isBacktest } = backtest.executionContextService.context;
  return await backtest.runtimeMetaService.getRuntimeInfo(
    symbol,
    {
      exchangeName,
      frameName,
      strategyName,
    },
    isBacktest
  );
}
