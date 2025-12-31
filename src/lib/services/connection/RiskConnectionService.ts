import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskCheckArgs, IRiskRejectionResult } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";
import ClientRisk from "../../../client/ClientRisk";
import RiskSchemaService from "../schema/RiskSchemaService";
import { riskSubject } from "../../../config/emitters";

/**
 * Creates a unique key for memoizing ClientRisk instances.
 * Key format: "riskName:backtest" or "riskName:live"
 * @param riskName - Name of the risk schema
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (riskName: RiskName, backtest: boolean) =>
  `${riskName}:${backtest ? "backtest" : "live"}` as const;

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
 */
const COMMIT_REJECTION_FN = async (
  symbol: string,
  params: IRiskCheckArgs,
  activePositionCount: number,
  rejectionResult: IRiskRejectionResult,
  timestamp: number,
  backtest: boolean
) =>
  await riskSubject.next({
    symbol,
    pendingSignal: params.pendingSignal,
    strategyName: params.strategyName,
    exchangeName: params.exchangeName,
    currentPrice: params.currentPrice,
    activePositionCount,
    rejectionId: rejectionResult.id,
    rejectionNote: rejectionResult.note,
    timestamp,
    backtest,
  });

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
export class RiskConnectionService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly riskSchemaService = inject<RiskSchemaService>(
    TYPES.riskSchemaService
  );

  /**
   * Retrieves memoized ClientRisk instance for given risk name and backtest mode.
   *
   * Creates ClientRisk on first call, returns cached instance on subsequent calls.
   * Cache key is "riskName:backtest" string to separate live and backtest instances.
   *
   * @param riskName - Name of registered risk schema
   * @param backtest - True if backtest mode, false if live mode
   * @returns Configured ClientRisk instance
   */
  public getRisk = memoize(
    ([riskName, backtest]) => CREATE_KEY_FN(riskName, backtest),
    (riskName: RiskName, backtest: boolean) => {
      const schema = this.riskSchemaService.get(riskName);
      return new ClientRisk({
        ...schema,
        logger: this.loggerService,
        backtest,
        onRejected: COMMIT_REJECTION_FN,
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
   * @param context - Execution context with risk name and backtest mode
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    context: { riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskConnectionService checkSignal", {
      symbol: params.symbol,
      context,
    });
    return await this.getRisk(context.riskName, context.backtest).checkSignal(params);
  };

  /**
   * Registers an opened signal with the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName, backtest)
   */
  public addSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskConnectionService addSignal", {
      symbol,
      context,
    });
    await this.getRisk(context.riskName, context.backtest).addSignal(symbol, context);
  };

  /**
   * Removes a closed signal from the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName, backtest)
   */
  public removeSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskConnectionService removeSignal", {
      symbol,
      context,
    });
    await this.getRisk(context.riskName, context.backtest).removeSignal(symbol, context);
  };

  /**
   * Clears the cached ClientRisk instance for the given risk name.
   *
   * @param backtest - Whether running in backtest mode
   * @param ctx - Optional context with riskName (clears all if not provided)
   */
  public clear = async (
    backtest: boolean,
    ctx?: { riskName: RiskName }
  ): Promise<void> => {
    this.loggerService.log("riskConnectionService clear", {
      ctx,
      backtest,
    });
    if (ctx) {
      const key = CREATE_KEY_FN(ctx.riskName, backtest);
      this.getRisk.clear(key);
    } else {
      this.getRisk.clear();
    }
  };
}

export default RiskConnectionService;
