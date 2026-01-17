import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { IPublicSignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { IPartial, PartialLevel } from "../../../interfaces/Partial.interface";
import ClientPartial from "../../../client/ClientPartial";
import { memoize } from "functools-kit";
import {
  partialProfitSubject,
  partialLossSubject,
} from "../../../config/emitters";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import ActionCoreService from "../core/ActionCoreService";

/**
 * Creates a unique key for memoizing ClientPartial instances.
 * Key format: "signalId:backtest" or "signalId:live"
 *
 * @param signalId - Signal ID
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (signalId: string, backtest: boolean) =>
  `${signalId}:${backtest ? "backtest" : "live"}` as const;

/**
 * Creates a callback function for emitting profit events to partialProfitSubject.
 *
 * Called by ClientPartial when a new profit level is reached.
 * Emits PartialProfitContract event to all subscribers and calls ActionCoreService.
 *
 * @param self - Reference to PartialConnectionService instance
 * @returns Callback function for profit events
 */
const CREATE_COMMIT_PROFIT_FN = (self: PartialConnectionService) => async (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  data: IPublicSignalRow,
  currentPrice: number,
  level: PartialLevel,
  backtest: boolean,
  timestamp: number
) => {
  const event = {
    symbol,
    strategyName,
    exchangeName,
    frameName,
    data,
    currentPrice,
    level,
    backtest,
    timestamp,
  };
  await partialProfitSubject.next(event);
  await self.actionCoreService.partialProfitAvailable(backtest, event, { strategyName, exchangeName, frameName });
};

/**
 * Creates a callback function for emitting loss events to partialLossSubject.
 *
 * Called by ClientPartial when a new loss level is reached.
 * Emits PartialLossContract event to all subscribers and calls ActionCoreService.
 *
 * @param self - Reference to PartialConnectionService instance
 * @returns Callback function for loss events
 */
const CREATE_COMMIT_LOSS_FN = (self: PartialConnectionService) => async (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  data: IPublicSignalRow,
  currentPrice: number,
  level: PartialLevel,
  backtest: boolean,
  timestamp: number
) => {
  const event = {
    symbol,
    strategyName,
    exchangeName,
    frameName,
    data,
    currentPrice,
    level,
    backtest,
    timestamp,
  };
  await partialLossSubject.next(event);
  await self.actionCoreService.partialLossAvailable(backtest, event, { strategyName, exchangeName, frameName });
};

/**
 * Connection service for partial profit/loss tracking.
 *
 * Provides memoized ClientPartial instances per signal ID.
 * Acts as factory and lifetime manager for ClientPartial objects.
 *
 * Features:
 * - Creates one ClientPartial instance per signal ID (memoized)
 * - Configures instances with logger and event emitter callbacks
 * - Delegates profit/loss/clear operations to appropriate ClientPartial
 * - Cleans up memoized instances when signals are cleared
 *
 * Architecture:
 * - Injected into ClientStrategy via PartialGlobalService
 * - Uses memoize from functools-kit for instance caching
 * - Emits events to partialProfitSubject/partialLossSubject
 *
 * @example
 * ```typescript
 * // Service injected via DI
 * const service = inject<PartialConnectionService>(TYPES.partialConnectionService);
 *
 * // Called by ClientStrategy during signal monitoring
 * await service.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
 * // Creates or reuses ClientPartial for signal.id
 * // Delegates to ClientPartial.profit()
 *
 * // When signal closes
 * await service.clear("BTCUSDT", signal, 52000);
 * // Clears signal state and removes memoized instance
 * ```
 */
export class PartialConnectionService implements IPartial {
  /**
   * Logger service injected from DI container.
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Action core service injected from DI container.
   */
  public readonly actionCoreService = inject<ActionCoreService>(TYPES.actionCoreService);

  /**
   * Memoized factory function for ClientPartial instances.
   *
   * Creates one ClientPartial per signal ID and backtest mode with configured callbacks.
   * Instances are cached until clear() is called.
   *
   * Key format: "signalId:backtest" or "signalId:live"
   * Value: ClientPartial instance with logger and event emitters
   */
  private getPartial = memoize<(signalId: string, backtest: boolean) => ClientPartial>(
    ([signalId, backtest]) => CREATE_KEY_FN(signalId, backtest),
    (signalId: string, backtest: boolean) => {
      return new ClientPartial({
        signalId,
        logger: this.loggerService,
        backtest,
        onProfit: CREATE_COMMIT_PROFIT_FN(this),
        onLoss: CREATE_COMMIT_LOSS_FN(this),
      });
    }
  );

  /**
   * Processes profit state and emits events for newly reached profit levels.
   *
   * Retrieves or creates ClientPartial for signal ID, initializes it if needed,
   * then delegates to ClientPartial.profit() method.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param revenuePercent - Current profit percentage (positive value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when profit processing is complete
   */
  public profit = async (
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialConnectionService profit", {
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    const partial = this.getPartial(data.id, backtest);
    await partial.waitForInit(symbol, data.strategyName, data.exchangeName, backtest);
    return await partial.profit(
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when
    );
  };

  /**
   * Processes loss state and emits events for newly reached loss levels.
   *
   * Retrieves or creates ClientPartial for signal ID, initializes it if needed,
   * then delegates to ClientPartial.loss() method.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param lossPercent - Current loss percentage (negative value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when loss processing is complete
   */
  public loss = async (
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialConnectionService loss", {
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    const partial = this.getPartial(data.id, backtest);
    await partial.waitForInit(symbol, data.strategyName, data.exchangeName, backtest);
    return await partial.loss(
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when
    );
  };

  /**
   * Clears partial profit/loss state when signal closes.
   *
   * Retrieves ClientPartial for signal ID, initializes if needed,
   * delegates clear operation, then removes memoized instance.
   *
   * Sequence:
   * 1. Get ClientPartial from memoize cache
   * 2. Ensure initialization (waitForInit)
   * 3. Call ClientPartial.clear() - removes state, persists to disk
   * 4. Clear memoized instance - prevents memory leaks
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @returns Promise that resolves when clear is complete
   */
  public clear = async (
    symbol: string,
    data: IPublicSignalRow,
    priceClose: number,
    backtest: boolean,
  ) => {
    this.loggerService.log("partialConnectionService clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    const partial = this.getPartial(data.id, backtest);
    await partial.waitForInit(symbol, data.strategyName, data.exchangeName, backtest);
    await partial.clear(symbol, data, priceClose, backtest);
    const key = CREATE_KEY_FN(data.id, backtest);
    this.getPartial.clear(key);
  };
}

export default PartialConnectionService;
