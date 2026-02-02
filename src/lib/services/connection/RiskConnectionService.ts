import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskCheckArgs, IRiskRejectionResult, IRisk } from "../../../interfaces/Risk.interface";
import { memoize, trycatch, errorData, getErrorMessage } from "functools-kit";
import ClientRisk from "../../../client/ClientRisk";
import RiskSchemaService from "../schema/RiskSchemaService";
import { riskSubject, errorEmitter } from "../../../config/emitters";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import ActionCoreService from "../core/ActionCoreService";
import backtest from "../../../lib";

/**
 * Creates a unique key for memoizing ClientRisk instances.
 * Key format: "riskName:exchangeName:frameName:backtest" or "riskName:exchangeName:live"
 * @param riskName - Name of the risk schema
 * @param exchangeName - Exchange name
 * @param frameName - Frame name (empty string for live)
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  riskName: RiskName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [riskName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a callback function for emitting risk rejection events to riskSubject.
 *
 * Called by ClientRisk when a signal is rejected due to risk validation failure.
 * Emits RiskContract event to all subscribers and calls ActionCoreService.
 *
 * @param self - Reference to RiskConnectionService instance
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @returns Callback function for risk rejection events
 */
const CREATE_COMMIT_REJECTION_FN = (
  self: RiskConnectionService,
  exchangeName: ExchangeName,
  frameName: FrameName
) => trycatch(
  async (
    symbol: string,
    params: IRiskCheckArgs,
    activePositionCount: number,
    rejectionResult: IRiskRejectionResult,
    timestamp: number,
    backtest: boolean
  ): Promise<void> => {
    const event = {
      symbol,
      currentSignal: params.currentSignal,
      strategyName: params.strategyName,
      exchangeName,
      currentPrice: params.currentPrice,
      activePositionCount,
      rejectionId: rejectionResult.id,
      rejectionNote: rejectionResult.note,
      frameName,
      timestamp,
      backtest,
    };
    await riskSubject.next(event);
    await self.actionCoreService.riskRejection(backtest, event, { strategyName: params.strategyName, exchangeName, frameName });
  },
  {
    fallback: (error) => {
      const message = "RiskConnectionService CREATE_COMMIT_REJECTION_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Type definition for risk methods.
 * Maps all keys of IRisk to any type.
 * Used for dynamic method routing in RiskConnectionService.
 */
type TRisk = {
  [key in keyof IRisk]: any;
}

/**
 * Connection service routing risk operations to correct ClientRisk instance.
 *
 * Routes risk checking calls to the appropriate risk implementation
 * based on the provided riskName parameter. Uses memoization to cache
 * ClientRisk instances for performance.
 *
 * Key features:
 * - Explicit risk routing via riskName parameter
 * - Memoized ClientRisk instances by riskName
 * - Risk limit validation for signals
 *
 * Note: riskName is empty string for strategies without risk configuration.
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await riskConnectionService.checkSignal(
 *   {
 *     symbol: "BTCUSDT",
 *     positionSize: 0.5,
 *     currentPrice: 50000,
 *     portfolioBalance: 100000,
 *     currentDrawdown: 5,
 *     currentPositions: 3,
 *     dailyPnl: -2,
 *     currentSymbolExposure: 8
 *   },
 *   { riskName: "conservative" }
 * );
 * ```
 */
export class RiskConnectionService implements TRisk {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly riskSchemaService = inject<RiskSchemaService>(
    TYPES.riskSchemaService
  );

  /**
   * Action core service injected from DI container.
   */
  public readonly actionCoreService = inject<ActionCoreService>(TYPES.actionCoreService);

  /**
   * Retrieves memoized ClientRisk instance for given risk name, exchange, frame and backtest mode.
   *
   * Creates ClientRisk on first call, returns cached instance on subsequent calls.
   * Cache key includes exchangeName and frameName to isolate risk per exchange+frame.
   *
   * @param riskName - Name of registered risk schema
   * @param exchangeName - Exchange name
   * @param frameName - Frame name (empty string for live)
   * @param backtest - True if backtest mode, false if live mode
   * @returns Configured ClientRisk instance
   */
  public getRisk = memoize(
    ([riskName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(riskName, exchangeName, frameName, backtest),
    (riskName: RiskName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => {
      const schema = this.riskSchemaService.get(riskName);
      return new ClientRisk({
        ...schema,
        logger: this.loggerService,
        backtest,
        exchangeName,
        onRejected: CREATE_COMMIT_REJECTION_FN(this, exchangeName, frameName),
      });
    }
  );

  /**
   * Checks if a signal should be allowed based on risk limits.
   *
   * Routes to appropriate ClientRisk instance based on provided context.
   * Validates portfolio drawdown, symbol exposure, position count, and daily loss limits.
   * ClientRisk will emit riskSubject event via onRejected callback when signal is rejected.
   *
   * @param params - Risk check arguments (portfolio state, position details)
   * @param payload - Execution payload with risk name, exchangeName, frameName and backtest mode
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    payload: { riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ) => {
    this.loggerService.log("riskConnectionService checkSignal", {
      symbol: params.symbol,
      payload,
    });
    return await this.getRisk(payload.riskName, payload.exchangeName, payload.frameName, payload.backtest).checkSignal(params);
  };

  /**
   * Registers an opened signal with the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
   * @param positionData - Position data (position, prices, timing)
   */
  public addSignal = async (
    symbol: string,
    payload: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean },
    positionData: {
      position: "long" | "short";
      priceOpen: number;
      priceStopLoss: number;
      priceTakeProfit: number;
      minuteEstimatedTime: number;
      openTimestamp: number;
    }
  ) => {
    this.loggerService.log("riskConnectionService addSignal", {
      symbol,
      payload,
      positionData,
    });
    await this.getRisk(payload.riskName, payload.exchangeName, payload.frameName, payload.backtest).addSignal(symbol, payload, positionData);
  };

  /**
   * Removes a closed signal from the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
   */
  public removeSignal = async (
    symbol: string,
    payload: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ) => {
    this.loggerService.log("riskConnectionService removeSignal", {
      symbol,
      payload,
    });
    await this.getRisk(payload.riskName, payload.exchangeName, payload.frameName, payload.backtest).removeSignal(symbol, payload);
  };

  /**
   * Clears the cached ClientRisk instance for the given risk name.
   *
   * @param payload - Optional payload with riskName, exchangeName, frameName, backtest (clears all if not provided)
   */
  public clear = async (
    payload?: { riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ): Promise<void> => {
    this.loggerService.log("riskConnectionService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.riskName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getRisk.clear(key);
    } else {
      this.getRisk.clear();
    }
  };
}

export default RiskConnectionService;
