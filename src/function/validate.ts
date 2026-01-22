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
   * Exchange name enum to validate
   * @example { BINANCE: "binance", BYBIT: "bybit" }
   */
  ExchangeName?: T;

  /**
   * Frame (timeframe) name enum to validate
   * @example { Q1_2024: "2024-Q1", Q2_2024: "2024-Q2" }
   */
  FrameName?: T;

  /**
   * Strategy name enum to validate
   * @example { MOMENTUM_BTC: "momentum-btc" }
   */
  StrategyName?: T;

  /**
   * Risk profile name enum to validate
   * @example { CONSERVATIVE: "conservative", AGGRESSIVE: "aggressive" }
   */
  RiskName?: T;

  /**
   * Action handler name enum to validate
   * @example { TELEGRAM_NOTIFIER: "telegram-notifier" }
   */
  ActionName?: T;

  /**
   * Sizing strategy name enum to validate
   * @example { FIXED_1000: "fixed-1000" }
   */
  SizingName?: T;

  /**
   * Walker (parameter sweep) name enum to validate
   * @example { RSI_SWEEP: "rsi-sweep" }
   */
  WalkerName?: T;
}

/**
 * Retrieves all registered exchanges as a map
 * @private
 * @returns Map of exchange names
 */
const getExchangeMap = async () => {
  const exchangeMap: Record<string, string> = {};
  for (const { exchangeName } of await lib.exchangeValidationService.list()) {
    Object.assign(exchangeMap, { [exchangeName]: exchangeName });
  }
  return exchangeMap;
};

/**
 * Retrieves all registered frames as a map
 * @private
 * @returns Map of frame names
 */
const getFrameMap = async () => {
  const frameMap: Record<string, string> = {};
  for (const { frameName } of await lib.frameValidationService.list()) {
    Object.assign(frameMap, { [frameName]: frameName });
  }
  return frameMap;
};

/**
 * Retrieves all registered strategies as a map
 * @private
 * @returns Map of strategy names
 */
const getStrategyMap = async () => {
  const strategyMap: Record<string, string> = {};
  for (const { strategyName } of await lib.strategyValidationService.list()) {
    Object.assign(strategyMap, { [strategyName]: strategyName });
  }
  return strategyMap;
};

/**
 * Retrieves all registered risk profiles as a map
 * @private
 * @returns Map of risk names
 */
const getRiskMap = async () => {
  const riskMap: Record<string, string> = {};
  for (const { riskName } of await lib.riskValidationService.list()) {
    Object.assign(riskMap, { [riskName]: riskName });
  }
  return riskMap;
};

/**
 * Retrieves all registered action handlers as a map
 * @private
 * @returns Map of action names
 */
const getActionMap = async () => {
  const actionMap: Record<string, string> = {};
  for (const { actionName } of await lib.actionValidationService.list()) {
    Object.assign(actionMap, { [actionName]: actionName });
  }
  return actionMap;
};

/**
 * Retrieves all registered sizing strategies as a map
 * @private
 * @returns Map of sizing names
 */
const getSizingMap = async () => {
  const sizingMap: Record<string, string> = {};
  for (const { sizingName } of await lib.sizingValidationService.list()) {
    Object.assign(sizingMap, { [sizingName]: sizingName });
  }
  return sizingMap;
};

/**
 * Retrieves all registered walkers as a map
 * @private
 * @returns Map of walker names
 */
const getWalkerMap = async () => {
  const walkerMap: Record<string, string> = {};
  for (const { walkerName } of await lib.walkerValidationService.list()) {
    Object.assign(walkerMap, { [walkerName]: walkerName });
  }
  return walkerMap;
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
    ExchangeName = await getExchangeMap(),
    FrameName = await getFrameMap(),
    StrategyName = await getStrategyMap(),
    RiskName = await getRiskMap(),
    ActionName = await getActionMap(),
    SizingName = await getSizingMap(),
    WalkerName = await getWalkerMap(),
  } = args;

  for (const exchangeName of Object.values(ExchangeName)) {
    lib.exchangeValidationService.validate(exchangeName, METHOD_NAME);
  }
  for (const frameName of Object.values(FrameName)) {
    lib.frameValidationService.validate(frameName, METHOD_NAME);
  }
  for (const strategyName of Object.values(StrategyName)) {
    lib.strategyValidationService.validate(strategyName, METHOD_NAME);
  }
  for (const riskName of Object.values(RiskName)) {
    lib.riskValidationService.validate(riskName, METHOD_NAME);
  }
  for (const actionName of Object.values(ActionName)) {
    lib.actionValidationService.validate(actionName, METHOD_NAME);
  }
  for (const sizingName of Object.values(SizingName)) {
    lib.sizingValidationService.validate(sizingName, METHOD_NAME);
  }
  for (const walkerName of Object.values(WalkerName)) {
    lib.walkerValidationService.validate(walkerName, METHOD_NAME);
  }
};

/**
 * Validates the existence of all provided entity names across validation services.
 *
 * This function accepts enum objects for various entity types (exchanges, frames,
 * strategies, risks, sizings, walkers) and validates that each entity
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
