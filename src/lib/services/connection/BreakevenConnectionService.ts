import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { IPublicSignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { IBreakeven } from "../../../interfaces/Breakeven.interface";
import ClientBreakeven from "../../../client/ClientBreakeven";
import { memoize, trycatch, errorData, getErrorMessage } from "functools-kit";
import { breakevenSubject, errorEmitter } from "../../../config/emitters";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import ActionCoreService from "../core/ActionCoreService";
import backtest from "../../../lib";

/**
 * Creates a unique key for memoizing ClientBreakeven instances.
 * Key format: "signalId:backtest" or "signalId:live"
 *
 * @param signalId - Signal ID
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (signalId: string, backtest: boolean) =>
  `${signalId}:${backtest ? "backtest" : "live"}` as const;

/**
 * Creates a callback function for emitting breakeven events to breakevenSubject.
 *
 * Called by ClientBreakeven when breakeven threshold is reached.
 * Emits BreakevenContract event to all subscribers and calls ActionCoreService.
 *
 * @param self - Reference to BreakevenConnectionService instance
 * @returns Callback function for breakeven events
 */
const CREATE_COMMIT_BREAKEVEN_FN = (self: BreakevenConnectionService) => trycatch(
  async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    timestamp: number
  ): Promise<void> => {
    const event = {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      data,
      currentPrice,
      backtest,
      timestamp,
    };
    await breakevenSubject.next(event);
    await self.actionCoreService.breakevenAvailable(backtest, event, { strategyName, exchangeName, frameName });
  },
  {
    fallback: (error) => {
      const message = "BreakevenConnectionService CREATE_COMMIT_BREAKEVEN_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Connection service for breakeven tracking.
 *
 * Provides memoized ClientBreakeven instances per signal ID.
 * Acts as factory and lifetime manager for ClientBreakeven objects.
 *
 * Features:
 * - Creates one ClientBreakeven instance per signal ID (memoized)
 * - Configures instances with logger and event emitter callbacks
 * - Delegates check/clear operations to appropriate ClientBreakeven
 * - Cleans up memoized instances when signals are cleared
 *
 * Architecture:
 * - Injected into ClientStrategy via BreakevenGlobalService
 * - Uses memoize from functools-kit for instance caching
 * - Emits events to breakevenSubject
 *
 * @example
 * ```typescript
 * // Service injected via DI
 * const service = inject<BreakevenConnectionService>(TYPES.breakevenConnectionService);
 *
 * // Called by ClientStrategy during signal monitoring
 * await service.check("BTCUSDT", signal, 100.5, false, new Date());
 * // Creates or reuses ClientBreakeven for signal.id
 * // Delegates to ClientBreakeven.check()
 *
 * // When signal closes
 * await service.clear("BTCUSDT", signal, 101, false);
 * // Clears signal state and removes memoized instance
 * ```
 */
export class BreakevenConnectionService implements IBreakeven {
  /**
   * Logger service injected from DI container.
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Action core service injected from DI container.
   */
  public readonly actionCoreService = inject<ActionCoreService>(TYPES.actionCoreService);

  /**
   * Memoized factory function for ClientBreakeven instances.
   *
   * Creates one ClientBreakeven per signal ID and backtest mode with configured callbacks.
   * Instances are cached until clear() is called.
   *
   * Key format: "signalId:backtest" or "signalId:live"
   * Value: ClientBreakeven instance with logger and event emitter
   */
  private getBreakeven = memoize<(signalId: string, backtest: boolean) => ClientBreakeven>(
    ([signalId, backtest]) => CREATE_KEY_FN(signalId, backtest),
    (signalId: string, backtest: boolean) => {
      return new ClientBreakeven({
        signalId,
        logger: this.loggerService,
        backtest,
        onBreakeven: CREATE_COMMIT_BREAKEVEN_FN(this),
      });
    }
  );

  /**
   * Checks if breakeven should be triggered and emits event if conditions met.
   *
   * Retrieves or creates ClientBreakeven for signal ID, initializes it if needed,
   * then delegates to ClientBreakeven.check() method.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when breakeven check is complete
   */
  public check = async (
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("breakevenConnectionService check", {
      symbol,
      data,
      currentPrice,
      backtest,
      when,
    });
    const breakeven = this.getBreakeven(data.id, backtest);
    await breakeven.waitForInit(symbol, data.strategyName, data.exchangeName, backtest);
    return await breakeven.check(
      symbol,
      data,
      currentPrice,
      backtest,
      when
    );
  };

  /**
   * Clears breakeven state when signal closes.
   *
   * Retrieves ClientBreakeven for signal ID, initializes if needed,
   * delegates clear operation, then removes memoized instance.
   *
   * Sequence:
   * 1. Get ClientBreakeven from memoize cache
   * 2. Ensure initialization (waitForInit)
   * 3. Call ClientBreakeven.clear() - removes state, persists to disk
   * 4. Clear memoized instance - prevents memory leaks
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @param backtest - True if backtest mode, false if live mode
   * @returns Promise that resolves when clear is complete
   */
  public clear = async (
    symbol: string,
    data: IPublicSignalRow,
    priceClose: number,
    backtest: boolean,
  ) => {
    this.loggerService.log("breakevenConnectionService clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    const breakeven = this.getBreakeven(data.id, backtest);
    await breakeven.waitForInit(symbol, data.strategyName, data.exchangeName, backtest);
    await breakeven.clear(symbol, data, priceClose, backtest);
    const key = CREATE_KEY_FN(data.id, backtest);
    this.getBreakeven.clear(key);
  };
}

export default BreakevenConnectionService;
