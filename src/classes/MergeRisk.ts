import { not } from "functools-kit";
import { IRisk, IRiskCheckArgs, RiskName } from "../interfaces/Risk.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import LoggerService from "../lib/services/base/LoggerService";

const RISK_METHOD_NAME_CHECK_SIGNAL = "MergeRisk.checkSignal";
const RISK_METHOD_NAME_ADD_SIGNAL = "MergeRisk.addSignal";
const RISK_METHOD_NAME_REMOVE_SIGNAL = "MergeRisk.removeSignal";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/**
 * Composite risk management class that combines multiple risk profiles.
 *
 * Implements the Composite pattern to merge multiple IRisk instances into a single
 * risk checker. All risk checks must pass (logical AND) for a signal to be allowed.
 *
 * Features:
 * - Combines multiple risk profiles into one
 * - Signal is allowed only if ALL risks approve (checkSignal returns true for all)
 * - Propagates addSignal/removeSignal to all child risks
 * - Used internally when strategy has both riskName and riskList
 *
 * @example
 * ```typescript
 * import { MergeRisk } from "./classes/Risk";
 *
 * // Combine multiple risk profiles
 * const maxPositionsRisk = new MaxPositionsRisk(3);
 * const correlationRisk = new CorrelationRisk(0.7);
 * const mergedRisk = new MergeRisk({
 *   "max-positions": maxPositionsRisk,
 *   "correlation": correlationRisk
 * });
 *
 * // Check if signal passes all risks
 * const canTrade = await mergedRisk.checkSignal({
 *   symbol: "BTCUSDT",
 *   strategyName: "my-strategy",
 *   position: PositionEnum.LONG,
 *   exchangeName: "binance"
 * });
 *
 * // If canTrade is true, all risks approved
 * // If false, at least one risk rejected the signal
 * ```
 */
export class MergeRisk implements IRisk {
  /**
   * Creates a merged risk profile from multiple risk instances.
   *
   * @param _riskMap - Object mapping RiskName to IRisk instances to combine
   */
  constructor(readonly _riskMap: Record<RiskName, IRisk>) {}

  /**
   * Checks if signal passes all combined risk profiles.
   *
   * Executes checkSignal on all child risks in parallel and returns true only
   * if ALL risks approve the signal (logical AND operation).
   *
   * @param params - Risk check parameters (symbol, strategy, position, exchange)
   * @returns Promise resolving to true if all risks approve, false if any risk rejects
   */
  public async checkSignal(params: IRiskCheckArgs): Promise<boolean> {
    LOGGER_SERVICE.info(RISK_METHOD_NAME_CHECK_SIGNAL, {
      params,
    });
    for (const [riskName, risk] of Object.entries(this._riskMap)) {
      if (
        await not(
          risk.checkSignal({
            ...params,
            riskName,
          })
        )
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Registers a signal with all child risk profiles.
   *
   * Propagates the addSignal call to all child risks in parallel.
   * Used to track active positions across all risk management systems.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, riskName, exchangeName and frameName
   * @returns Promise that resolves when all risks have registered the signal
   */
  public async addSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName },
    positionData: {
      position: "long" | "short";
      priceOpen: number;
      priceStopLoss: number;
      priceTakeProfit: number;
      minuteEstimatedTime: number;
      openTimestamp: number;
    }
  ) {
    LOGGER_SERVICE.info(RISK_METHOD_NAME_ADD_SIGNAL, {
      symbol,
      context,
    });
    await Promise.all(
      Object.entries(this._riskMap).map(async ([riskName, risk]) =>
        await risk.addSignal(symbol, { ...context, riskName }, positionData)
      )
    );
  }

  /**
   * Removes a signal from all child risk profiles.
   *
   * Propagates the removeSignal call to all child risks in parallel.
   * Used to update risk state when a position closes.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, riskName, exchangeName and frameName
   * @returns Promise that resolves when all risks have removed the signal
   */
  public async removeSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }
  ) {
    LOGGER_SERVICE.info(RISK_METHOD_NAME_REMOVE_SIGNAL, {
      symbol,
      context,
    });
    await Promise.all(
      Object.entries(this._riskMap).map(
        async ([riskName, risk]) => await risk.removeSignal(symbol, { ...context, riskName })
      )
    );
  }
}
