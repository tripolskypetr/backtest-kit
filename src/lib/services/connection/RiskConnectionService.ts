import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskCheckArgs, IRiskRejectionResult, IRisk } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";
import ClientRisk from "../../../client/ClientRisk";
import RiskSchemaService from "../schema/RiskSchemaService";
import { riskSubject } from "../../../config/emitters";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";

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
 * Callback function for emitting risk rejection events to riskSubject.
 *
 * Called by ClientRisk when a signal is rejected due to risk validation failure.
 * Emits RiskContract event to all subscribers.
 *
 * @param symbol - Trading pair symbol
 * @param params - Risk check arguments
 * @param activePositionCount - Number of active positions at rejection time
 * @param rejectionResult - Rejection result with id and note
 * @param timestamp - Event timestamp in milliseconds
 * @param backtest - True if backtest mode, false if live mode
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 */
const COMMIT_REJECTION_FN = async (
  symbol: string,
  params: IRiskCheckArgs,
  activePositionCount: number,
  rejectionResult: IRiskRejectionResult,
  timestamp: number,
  backtest: boolean,
  exchangeName: ExchangeName,
  frameName: FrameName
) =>
  await riskSubject.next({
    symbol,
    pendingSignal: params.pendingSignal,
    strategyName: params.strategyName,
    exchangeName,
    currentPrice: params.currentPrice,
    activePositionCount,
    rejectionId: rejectionResult.id,
    rejectionNote: rejectionResult.note,
    frameName,
    timestamp,
    backtest,
  });

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
        onRejected: (symbol, params, activePositionCount, rejectionResult, timestamp, backtest) =>
          COMMIT_REJECTION_FN(
            symbol,
            params,
            activePositionCount,
            rejectionResult,
            timestamp,
            backtest,
            exchangeName,
            frameName
          ),
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
