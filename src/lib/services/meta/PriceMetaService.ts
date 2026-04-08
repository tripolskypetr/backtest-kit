import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { BehaviorSubject, memoize, waitForNext } from "functools-kit";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";
import MethodContextService from "../context/MethodContextService";
import ExchangeConnectionService from "../connection/ExchangeConnectionService";

const LISTEN_TIMEOUT = 120_000;

/**
 * Creates a unique memoization key for a price stream.
 * Key format: "symbol:strategyName:exchangeName[:frameName]:backtest|live"
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param strategyName - Strategy identifier
 * @param exchangeName - Exchange identifier
 * @param frameName - Frame identifier (omitted when empty)
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Signature of the memoized factory used by getSource.
 * Maps (symbol, strategyName, exchangeName, frameName, backtest) to a BehaviorSubject
 * that emits the latest currentPrice for that key.
 */
type KeyFn = (
  symbol: string,
  strategyName: string,
  exchangeName: string,
  frameName: string,
  backtest: boolean,
) => BehaviorSubject<number>;

/**
 * Service for tracking the latest market price per symbol-strategy-exchange-frame combination.
 *
 * Maintains a memoized BehaviorSubject per unique key that is updated on every strategy tick
 * by StrategyConnectionService. Consumers can synchronously read the last known price or
 * await the first value if none has arrived yet.
 *
 * Primary use case: providing the current price outside of a tick execution context,
 * e.g., when a command is triggered between ticks.
 *
 * Features:
 * - One BehaviorSubject per (symbol, strategyName, exchangeName, frameName, backtest) key
 * - Falls back to ExchangeConnectionService.getAveragePrice when called inside an execution context
 * - Waits up to LISTEN_TIMEOUT ms for the first price if none is cached yet
 * - clear() disposes the BehaviorSubject for a single key or all keys
 *
 * Architecture:
 * - Registered as singleton in DI container
 * - Updated by StrategyConnectionService after each tick
 * - Cleared by Backtest/Live/Walker at strategy start to prevent stale data
 *
 * @example
 * ```typescript
 * const price = await backtest.priceMetaService.getCurrentPrice("BTCUSDT", context, false);
 * ```
 */
export class PriceMetaService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly exchangeConnectionService = inject<ExchangeConnectionService>(
    TYPES.exchangeConnectionService,
  );

  /**
   * Memoized factory for BehaviorSubject streams keyed by (symbol, strategyName, exchangeName, frameName, backtest).
   *
   * Each subject holds the latest currentPrice emitted by the strategy iterator for that key.
   * Instances are cached until clear() is called.
   */
  private getSource = memoize<KeyFn>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    () => new BehaviorSubject<number>(),
  );

  /**
   * Returns the current market price for the given symbol and context.
   *
   * When called inside an execution context (i.e., during a signal handler or action),
   * delegates to ExchangeConnectionService.getAveragePrice for the live exchange price.
   * Otherwise, reads the last value from the cached BehaviorSubject. If no value has
   * been emitted yet, waits up to LISTEN_TIMEOUT ms for the first tick before throwing.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Strategy, exchange, and frame identifiers
   * @param backtest - True if backtest mode, false if live mode
   * @returns Current market price in quote currency
   * @throws When no price arrives within LISTEN_TIMEOUT ms
   */
  public getCurrentPrice = async (
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ) => {
    this.loggerService.log("priceMetaService getCurrentPrice", {
      symbol,
      context,
      backtest,
    });
    if (
      ExecutionContextService.hasContext() &&
      MethodContextService.hasContext()
    ) {
      return await this.exchangeConnectionService.getAveragePrice(symbol);
    }
    const source = this.getSource(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
    );
    if (source.data) {
      return source.data;
    }
    console.warn(
      `PriceMetaService: No currentPrice available for ${CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, backtest)}. Trying to fetch from strategy iterator as a fallback...`,
    );
    const currentPrice = await waitForNext<number>(
      source,
      (data) => !!data,
      LISTEN_TIMEOUT,
    );
    if (typeof currentPrice === "symbol") {
      throw new Error(
        `PriceMetaService: Timeout while waiting for currentPrice for ${CREATE_KEY_FN(symbol, context.strategyName, context.exchangeName, context.frameName, backtest)}`,
      );
    }
    return currentPrice;
  };

  /**
   * Pushes a new price value into the BehaviorSubject for the given key.
   *
   * Called by StrategyConnectionService after each strategy tick to keep
   * the cached price up to date.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - The latest price from the tick
   * @param context - Strategy, exchange, and frame identifiers
   * @param backtest - True if backtest mode, false if live mode
   */
  public next = async (
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ) => {
    this.loggerService.log("priceMetaService next", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    const source = this.getSource(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
    );
    source.next(currentPrice);
  };

  /**
   * Disposes cached BehaviorSubject(s) to free memory and prevent stale data.
   *
   * When called without arguments, clears all memoized price streams.
   * When called with a payload, clears only the stream for the specified key.
   * Should be called at strategy start (Backtest/Live/Walker) to reset state.
   *
   * @param payload - Optional key to clear a single stream; omit to clear all
   */
  public clear = (
    payload?: {
      symbol: string,
      strategyName: string;
      exchangeName: string;
      frameName: string;
      backtest: boolean,
    }
  ) => {
    this.loggerService.log("priceMetaService clear", {
      payload
    });
    if (!payload) {
      this.getSource.clear();
      return;
    }
    const key = CREATE_KEY_FN(
      payload.symbol,
      payload.strategyName,
      payload.exchangeName,
      payload.frameName,
      payload.backtest,
    );
    this.getSource.clear(key);
  };
}

export default PriceMetaService;
