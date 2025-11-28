import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";

const GET_TIMEFRAME_METHOD_NAME = "get.getTimeframe";

/**
 * Retrieves current backtest timeframe for given symbol.
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Promise resolving to array of Date objects representing tick timestamps
 * @throws Error if called outside of backtest execution context
 */
export async function getCurrentTimeframe(symbol: string): Promise<Date[]> {
  backtest.loggerService.info(GET_TIMEFRAME_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getCurrentTimeframe requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getCurrentTimeframe requires a method context");
  }
  if (!backtest.executionContextService.context.backtest) {
    throw new Error(
      "getCurrentTimeframe can only be used during backtest execution"
    );
  }
  return await backtest.frameGlobalService.getTimeframe(
    symbol,
    backtest.methodContextService.context.frameName
  );
}
