import lib from "../lib";

const METHOD_NAME = "validate.validate";

/**
 * Type alias for enum objects with string key-value pairs
 */
type Enum = Record<string, string>;

/**
 * Type alias for ValidateArgs with any enum type
 */
type Args = ValidateArgs<any>;

/**
 * Interface defining validation arguments for all entity types.
 *
 * Each property accepts an enum object where values will be validated
 * against registered entities in their respective validation services.
 *
 * @template T - Enum type extending Record<string, string>
 */
interface ValidateArgs<T = Enum> {
  /**
   * Optimizer name enum to validate
   * @example { GRID_SEARCH: "grid-search" }
   */
  OptimizerName?: T;
}

/**
 * Retrieves all registered optimizers as a map
 * @private
 * @returns Map of optimizer names
 */
const getOptimizerMap = async () => {
  const optimizerMap: Record<string, string> = {};
  for (const { optimizerName } of await lib.optimizerValidationService.list()) {
    Object.assign(optimizerMap, { [optimizerName]: optimizerName });
  }
  return optimizerMap;
};

/**
 * Internal validation function that processes all provided entity enums.
 *
 * Iterates through each enum's values and validates them against their
 * respective validation services. Uses memoized validation for performance.
 *
 * If entity enums are not provided, fetches all registered entities from
 * their respective validation services and validates them.
 *
 * @private
 * @param args - Validation arguments containing entity name enums
 * @throws {Error} If any entity name is not found in its registry
 */
const validateInternal = async (args: ValidateArgs<Enum>) => {
  const {
    OptimizerName = await getOptimizerMap(),
  } = args;
  for (const optimizerName of Object.values(OptimizerName)) {
    lib.optimizerValidationService.validate(optimizerName, METHOD_NAME);
  }
};

/**
 * Validates the existence of all provided entity names across validation services.
 *
 * This function accepts enum objects for various entity types (exchanges, frames,
 * strategies, risks, sizings, optimizers, walkers) and validates that each entity
 * name exists in its respective registry. Validation results are memoized for performance.
 *
 * If no arguments are provided (or specific entity types are omitted), the function
 * automatically fetches and validates ALL registered entities from their respective
 * validation services. This is useful for comprehensive validation of the entire setup.
 *
 * Use this before running backtests or optimizations to ensure all referenced
 * entities are properly registered and configured.
 *
 * @public
 * @param args - Partial validation arguments containing entity name enums to validate.
 *                If empty or omitted, validates all registered entities.
 * @throws {Error} If any entity name is not found in its validation service
 *
 * @example
 * ```typescript
 * // Validate ALL registered entities (exchanges, frames, strategies, etc.)
 * await validate({});
 * ```
 *
 * @example
 * ```typescript
 * // Define your entity name enums
 * enum ExchangeName {
 *   BINANCE = "binance",
 *   BYBIT = "bybit"
 * }
 *
 * enum StrategyName {
 *   MOMENTUM_BTC = "momentum-btc"
 * }
 *
 * // Validate specific entities before running backtest
 * await validate({
 *   ExchangeName,
 *   StrategyName,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Validate specific entity types
 * await validate({
 *   RiskName: { CONSERVATIVE: "conservative" },
 *   SizingName: { FIXED_1000: "fixed-1000" },
 * });
 * ```
 */
export async function validate(args: Partial<Args> = {}) {
  lib.loggerService.log(METHOD_NAME);
  return await validateInternal(args);
}
