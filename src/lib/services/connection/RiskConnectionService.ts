import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskCheckArgs } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";
import ClientRisk from "../../../client/ClientRisk";
import RiskSchemaService from "../schema/RiskSchemaService";
import { riskSubject } from "../../../config/emitters";

/**
 * Callback function for emitting risk rejection events to riskSubject.
 *
 * Called by ClientRisk when a signal is rejected due to risk validation failure.
 * Emits RiskContract event to all subscribers.
 *
 * @param symbol - Trading pair symbol
 * @param params - Risk check arguments
 * @param activePositionCount - Number of active positions at rejection time
 * @param comment - Rejection reason from validation note or "N/A"
 * @param timestamp - Event timestamp in milliseconds
 */
const COMMIT_REJECTION_FN = async (
  symbol: string,
  params: IRiskCheckArgs,
  activePositionCount: number,
  comment: string,
  timestamp: number
) =>
  await riskSubject.next({
    symbol,
    pendingSignal: params.pendingSignal,
    strategyName: params.strategyName,
    exchangeName: params.exchangeName,
    currentPrice: params.currentPrice,
    activePositionCount,
    comment,
    timestamp,
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
   * Retrieves memoized ClientRisk instance for given risk name.
   *
   * Creates ClientRisk on first call, returns cached instance on subsequent calls.
   * Cache key is riskName string.
   *
   * @param riskName - Name of registered risk schema
   * @returns Configured ClientRisk instance
   */
  public getRisk = memoize(
    ([riskName]) => `${riskName}`,
    (riskName: RiskName) => {
      const schema = this.riskSchemaService.get(riskName);
      return new ClientRisk({
        ...schema,
        logger: this.loggerService,
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
   * @param context - Execution context with risk name
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    context: { riskName: RiskName }
  ) => {
    this.loggerService.log("riskConnectionService checkSignal", {
      symbol: params.symbol,
      context,
    });
    return await this.getRisk(context.riskName).checkSignal(params);
  };

  /**
   * Registers an opened signal with the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  public addSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName }
  ) => {
    this.loggerService.log("riskConnectionService addSignal", {
      symbol,
      context,
    });
    await this.getRisk(context.riskName).addSignal(symbol, context);
  };

  /**
   * Removes a closed signal from the risk management system.
   * Routes to appropriate ClientRisk instance.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  public removeSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName }
  ) => {
    this.loggerService.log("riskConnectionService removeSignal", {
      symbol,
      context,
    });
    await this.getRisk(context.riskName).removeSignal(symbol, context);
  };

  /**
   * Clears the cached ClientRisk instance for the given risk name.
   *
   * @param riskName - Name of the risk schema to clear from cache
   */
  public clear = async (riskName?: RiskName): Promise<void> => {
    this.loggerService.log("riskConnectionService clear", {
      riskName,
    });
    this.getRisk.clear(riskName);
  };
}

export default RiskConnectionService;
