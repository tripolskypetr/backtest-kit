import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Session } from "../classes/Session";

const GET_SESSION_METHOD_NAME = "session.getSession";
const SET_SESSION_METHOD_NAME = "session.setSession";

/**
 * Reads the session value scoped to the current (symbol, strategy, exchange, frame) context.
 *
 * Session data persists across candles within a single run and can survive process
 * restarts in live mode — useful for caching LLM inference results, intermediate
 * indicator state, or any cross-candle accumulator that is not tied to a specific signal.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @returns Promise resolving to current session value, or null if not set
 *
 * @example
 * ```typescript
 * import { getSession } from "backtest-kit";
 *
 * const session = await getSession<{ lastLlmSignal: string }>("BTCUSDT");
 * if (session?.lastLlmSignal === "buy") {
 *   // reuse cached LLM result instead of calling the model again
 * }
 * ```
 */
export async function getSessionData<Value extends object = object>(
  symbol: string,
): Promise<Value | null> {
  backtest.loggerService.info(GET_SESSION_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("getSession requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("getSession requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  return await Session.getData<Value>(
    symbol,
    { exchangeName, frameName, strategyName },
    isBacktest,
  );
}

/**
 * Writes a session value scoped to the current (symbol, strategy, exchange, frame) context.
 *
 * Session data persists across candles within a single run and can survive process
 * restarts in live mode — useful for caching LLM inference results, intermediate
 * indicator state, or any cross-candle accumulator that is not tied to a specific signal.
 *
 * Pass null to clear the session.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param value - New value or null to clear
 * @returns Promise that resolves when the session has been written
 *
 * @example
 * ```typescript
 * import { setSession } from "backtest-kit";
 *
 * await setSession("BTCUSDT", { lastLlmSignal: "buy" });
 * ```
 */
export async function setSessionData<Value extends object = object>(
  symbol: string,
  value: Value | null,
): Promise<void> {
  backtest.loggerService.info(SET_SESSION_METHOD_NAME, { symbol });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("setSession requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("setSession requires a method context");
  }
  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  await Session.setData<Value>(
    symbol,
    value,
    { exchangeName, frameName, strategyName },
    isBacktest,
  );
}
