/**
 * Utility class containing predefined trading constants for take-profit and stop-loss levels.
 *
 * Provides standardized percentage values based on Kelly Criterion with exponential risk decay.
 * These constants represent percentage levels relative to entry price.
 */
export class ConstantUtils {
    /**
     * Take Profit Level 1 (Kelly-optimized aggressive target).
     * Represents 100% profit from entry price.
     */
    public readonly TP_LEVEL1 = 100;

    /**
     * Take Profit Level 2 (Kelly-optimized moderate target).
     * Represents 50% profit from entry price.
     */
    public readonly TP_LEVEL2 = 50;

    /**
     * Take Profit Level 3 (Kelly-optimized conservative target).
     * Represents 25% profit from entry price.
     */
    public readonly TP_LEVEL3 = 25;

    /**
     * Stop Loss Level 1 (Kelly-optimized maximum risk).
     * Represents 50% maximum acceptable loss from entry price.
     */
    public readonly SL_LEVEL1 = 100;

    /**
     * Stop Loss Level 2 (Kelly-optimized standard stop).
     * Represents 25% maximum acceptable loss from entry price.
     */
    public readonly SL_LEVEL2 = 50;
}

/**
 * Global singleton instance of ConstantUtils.
 * Provides static-like access to predefined trading level constants.
 *
 * Take Profit example:
 * 
 * @example
 * ```typescript
 * listenPartialProfit(async (event) => {
 *   // ClientPartial эмитит события на всех уровнях: 10, 20, 30, 40, 50...
 *   // Но мы закрываем только на Kelly-оптимизированных уровнях:
 *   if (event.level === Constant.TP_LEVEL3) { close 33% }
 *   if (event.level === Constant.TP_LEVEL2) { close 33% }
 *   if (event.level === Constant.TP_LEVEL1) { close 34% }
 * });
 * ```
 * 
 * Stop Loss example:
 * 
 * @example
 * ```typescript
 * listenPartialLoss(async (event) => {
 *   if (event.level === SL_LEVEL2) { close 50% } // Closest to Constant.SL_LEVEL2
 *   if (event.level === SL_LEVEL1) { close 50% } // Closest to Constant.SL_LEVEL1
 * });
 * ```
 */
export const Constant = new ConstantUtils();
