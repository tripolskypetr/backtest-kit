import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Service for validating GLOBAL_CONFIG parameters to ensure mathematical correctness
 * and prevent unprofitable trading configurations.
 *
 * Performs comprehensive validation on:
 * - **Percentage parameters**: Slippage, fees, and profit margins must be non-negative
 * - **Economic viability**: Ensures CC_MIN_TAKEPROFIT_DISTANCE_PERCENT covers all trading costs
 *   (slippage + fees) to guarantee profitable trades when TakeProfit is hit
 * - **Range constraints**: Validates MIN < MAX relationships (e.g., StopLoss distances)
 * - **Time-based parameters**: Ensures positive integer values for timeouts and lifetimes
 * - **Candle parameters**: Validates retry counts, delays, and anomaly detection thresholds
 *
 * @throws {Error} If any validation fails, throws with detailed breakdown of all errors
 *
 * @example
 * ```typescript
 * const validator = new ConfigValidationService();
 * validator.validate(); // Throws if config is invalid
 * ```
 *
 * @example Validation failure output:
 * ```
 * GLOBAL_CONFIG validation failed:
 *   1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low to cover trading costs.
 *      Required minimum: 0.40%
 *      Breakdown:
 *        - Slippage effect: 0.20% (0.1% × 2 transactions)
 *        - Fees: 0.20% (0.1% × 2 transactions)
 *      All TakeProfit signals will be unprofitable with current settings!
 * ```
 */
export class ConfigValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Validates GLOBAL_CONFIG parameters for mathematical correctness.
   *
   * Checks:
   * 1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT must cover slippage + fees
   * 2. All percentage values must be positive
   * 3. Time/count values must be positive integers
   *
   * @throws Error if configuration is invalid
   */
  public validate = () => {
    this.loggerService.log("configValidationService validate");

    const errors: string[] = [];

    // Validate slippage and fee percentages
    if (!Number.isFinite(GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE) || GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE < 0) {
      errors.push(`CC_PERCENT_SLIPPAGE must be a non-negative number, got ${GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE}`);
    }

    if (!Number.isFinite(GLOBAL_CONFIG.CC_PERCENT_FEE) || GLOBAL_CONFIG.CC_PERCENT_FEE < 0) {
      errors.push(`CC_PERCENT_FEE must be a non-negative number, got ${GLOBAL_CONFIG.CC_PERCENT_FEE}`);
    }

    // Calculate minimum required TP distance to cover costs
    const slippageEffect = GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE * 2; // Applied twice (entry + exit)
    const feesTotal = GLOBAL_CONFIG.CC_PERCENT_FEE * 2; // Applied twice (entry + exit)
    const minRequiredTpDistance = slippageEffect + feesTotal;

    // Validate CC_MIN_TAKEPROFIT_DISTANCE_PERCENT
    if (!Number.isFinite(GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT) || GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT <= 0) {
      errors.push(
        `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT must be a positive number, got ${GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT}`
      );
    } else if (GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT < minRequiredTpDistance) {
      errors.push(
        `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (${GLOBAL_CONFIG.CC_MIN_TAKEPROFIT_DISTANCE_PERCENT}%) is too low to cover trading costs.\n` +
        `  Required minimum: ${minRequiredTpDistance.toFixed(2)}%\n` +
        `  Breakdown:\n` +
        `    - Slippage effect: ${slippageEffect.toFixed(2)}% (${GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE}% × 2 transactions)\n` +
        `    - Fees: ${feesTotal.toFixed(2)}% (${GLOBAL_CONFIG.CC_PERCENT_FEE}% × 2 transactions)\n` +
        `  All TakeProfit signals will be unprofitable with current settings!`
      );
    }

    // Validate CC_MIN_STOPLOSS_DISTANCE_PERCENT
    if (!Number.isFinite(GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) || GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT <= 0) {
      errors.push(
        `CC_MIN_STOPLOSS_DISTANCE_PERCENT must be a positive number, got ${GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT}`
      );
    }

    // Validate CC_MAX_STOPLOSS_DISTANCE_PERCENT
    if (!Number.isFinite(GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) || GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT <= 0) {
      errors.push(
        `CC_MAX_STOPLOSS_DISTANCE_PERCENT must be a positive number, got ${GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT}`
      );
    }

    // Validate that MIN < MAX for StopLoss
    if (
      Number.isFinite(GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT) &&
      Number.isFinite(GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT) &&
      GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT >= GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT
    ) {
      errors.push(
        `CC_MIN_STOPLOSS_DISTANCE_PERCENT (${GLOBAL_CONFIG.CC_MIN_STOPLOSS_DISTANCE_PERCENT}%) must be less than ` +
        `CC_MAX_STOPLOSS_DISTANCE_PERCENT (${GLOBAL_CONFIG.CC_MAX_STOPLOSS_DISTANCE_PERCENT}%)`
      );
    }

    // Validate time-based parameters
    if (!Number.isInteger(GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES) || GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES <= 0) {
      errors.push(
        `CC_SCHEDULE_AWAIT_MINUTES must be a positive integer, got ${GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) || GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES <= 0) {
      errors.push(
        `CC_MAX_SIGNAL_LIFETIME_MINUTES must be a positive integer, got ${GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_MAX_SIGNAL_GENERATION_SECONDS) || GLOBAL_CONFIG.CC_MAX_SIGNAL_GENERATION_SECONDS <= 0) {
      errors.push(
        `CC_MAX_SIGNAL_GENERATION_SECONDS must be a positive integer, got ${GLOBAL_CONFIG.CC_MAX_SIGNAL_GENERATION_SECONDS}`
      );
    }

    // Validate candle-based parameters
    if (!Number.isInteger(GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT) || GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT <= 0) {
      errors.push(
        `CC_AVG_PRICE_CANDLES_COUNT must be a positive integer, got ${GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_COUNT) || GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_COUNT < 0) {
      errors.push(
        `CC_GET_CANDLES_RETRY_COUNT must be a non-negative integer, got ${GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_COUNT}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_DELAY_MS) || GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_DELAY_MS < 0) {
      errors.push(
        `CC_GET_CANDLES_RETRY_DELAY_MS must be a non-negative integer, got ${GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_DELAY_MS}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR) || GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR <= 0) {
      errors.push(
        `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR must be a positive integer, got ${GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR}`
      );
    }

    if (!Number.isInteger(GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN) || GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN <= 0) {
      errors.push(
        `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN must be a positive integer, got ${GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN}`
      );
    }

    // Throw aggregated errors if any
    if (errors.length > 0) {
      const errorMessage = `GLOBAL_CONFIG validation failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
      this.loggerService.warn(errorMessage);
      throw new Error(errorMessage);
    }

    this.loggerService.log("configValidationService validation passed");
  }

}

export default ConfigValidationService;
