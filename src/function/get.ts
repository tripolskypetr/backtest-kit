import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { WalkerName } from "../interfaces/Walker.interface";
import { SizingName } from "../interfaces/Sizing.interface";
import { RiskName } from "../interfaces/Risk.interface";
import { OptimizerName } from "../interfaces/Optimizer.interface";
import { ActionName } from "../interfaces/Action.interface";
import backtest from "../lib";

const GET_STRATEGY_METHOD_NAME = "get.getStrategySchema";
const GET_EXCHANGE_METHOD_NAME = "get.getExchangeSchema";
const GET_FRAME_METHOD_NAME = "get.getFrameSchema";
const GET_WALKER_METHOD_NAME = "get.getWalkerSchema";
const GET_SIZING_METHOD_NAME = "get.getSizingSchema";
const GET_RISK_METHOD_NAME = "get.getRiskSchema";
const GET_OPTIMIZER_METHOD_NAME = "get.getOptimizerSchema";
const GET_ACTION_METHOD_NAME = "get.getActionSchema";

/**
 * Retrieves a registered strategy schema by name.
 *
 * @param strategyName - Unique strategy identifier
 * @returns The strategy schema configuration object
 * @throws Error if strategy is not registered
 *
 * @example
 * ```typescript
 * const strategy = getStrategy("my-strategy");
 * console.log(strategy.interval); // "5m"
 * console.log(strategy.getSignal); // async function
 * ```
 */
export function getStrategySchema(strategyName: StrategyName) {
  backtest.loggerService.log(GET_STRATEGY_METHOD_NAME, {
    strategyName,
  });

  backtest.strategyValidationService.validate(
    strategyName,
    GET_STRATEGY_METHOD_NAME
  );

  return backtest.strategySchemaService.get(strategyName);
}

/**
 * Retrieves a registered exchange schema by name.
 *
 * @param exchangeName - Unique exchange identifier
 * @returns The exchange schema configuration object
 * @throws Error if exchange is not registered
 *
 * @example
 * ```typescript
 * const exchange = getExchange("binance");
 * console.log(exchange.getCandles); // async function
 * console.log(exchange.formatPrice); // async function
 * ```
 */
export function getExchangeSchema(exchangeName: ExchangeName) {
  backtest.loggerService.log(GET_EXCHANGE_METHOD_NAME, {
    exchangeName,
  });

  backtest.exchangeValidationService.validate(
    exchangeName,
    GET_EXCHANGE_METHOD_NAME
  );

  return backtest.exchangeSchemaService.get(exchangeName);
}

/**
 * Retrieves a registered frame schema by name.
 *
 * @param frameName - Unique frame identifier
 * @returns The frame schema configuration object
 * @throws Error if frame is not registered
 *
 * @example
 * ```typescript
 * const frame = getFrame("1d-backtest");
 * console.log(frame.interval); // "1m"
 * console.log(frame.startDate); // Date object
 * console.log(frame.endDate); // Date object
 * ```
 */
export function getFrameSchema(frameName: FrameName) {
  backtest.loggerService.log(GET_FRAME_METHOD_NAME, {
    frameName,
  });

  backtest.frameValidationService.validate(
    frameName,
    GET_FRAME_METHOD_NAME
  );

  return backtest.frameSchemaService.get(frameName);
}

/**
 * Retrieves a registered walker schema by name.
 *
 * @param walkerName - Unique walker identifier
 * @returns The walker schema configuration object
 * @throws Error if walker is not registered
 *
 * @example
 * ```typescript
 * const walker = getWalker("llm-prompt-optimizer");
 * console.log(walker.exchangeName); // "binance"
 * console.log(walker.frameName); // "1d-backtest"
 * console.log(walker.strategies); // ["my-strategy-v1", "my-strategy-v2"]
 * console.log(walker.metric); // "sharpeRatio"
 * ```
 */
export function getWalkerSchema(walkerName: WalkerName) {
  backtest.loggerService.log(GET_WALKER_METHOD_NAME, {
    walkerName,
  });

  backtest.walkerValidationService.validate(
    walkerName,
    GET_WALKER_METHOD_NAME
  );

  return backtest.walkerSchemaService.get(walkerName);
}

/**
 * Retrieves a registered sizing schema by name.
 *
 * @param sizingName - Unique sizing identifier
 * @returns The sizing schema configuration object
 * @throws Error if sizing is not registered
 *
 * @example
 * ```typescript
 * const sizing = getSizing("conservative");
 * console.log(sizing.method); // "fixed-percentage"
 * console.log(sizing.riskPercentage); // 1
 * console.log(sizing.maxPositionPercentage); // 10
 * ```
 */
export function getSizingSchema(sizingName: SizingName) {
  backtest.loggerService.log(GET_SIZING_METHOD_NAME, {
    sizingName,
  });

  backtest.sizingValidationService.validate(
    sizingName,
    GET_SIZING_METHOD_NAME
  );

  return backtest.sizingSchemaService.get(sizingName);
}

/**
 * Retrieves a registered risk schema by name.
 *
 * @param riskName - Unique risk identifier
 * @returns The risk schema configuration object
 * @throws Error if risk is not registered
 *
 * @example
 * ```typescript
 * const risk = getRisk("conservative");
 * console.log(risk.maxConcurrentPositions); // 5
 * console.log(risk.validations); // Array of validation functions
 * ```
 */
export function getRiskSchema(riskName: RiskName) {
  backtest.loggerService.log(GET_RISK_METHOD_NAME, {
    riskName,
  });

  backtest.riskValidationService.validate(
    riskName,
    GET_RISK_METHOD_NAME
  );

  return backtest.riskSchemaService.get(riskName);
}

/**
 * Retrieves a registered optimizer schema by name.
 *
 * @param optimizerName - Unique optimizer identifier
 * @returns The optimizer schema configuration object
 * @throws Error if optimizer is not registered
 *
 * @example
 * ```typescript
 * const optimizer = getOptimizer("llm-strategy-generator");
 * console.log(optimizer.rangeTrain); // Array of training ranges
 * console.log(optimizer.rangeTest); // Testing range
 * console.log(optimizer.source); // Array of data sources
 * console.log(optimizer.getPrompt); // async function
 * ```
 */
export function getOptimizerSchema(optimizerName: OptimizerName) {
  backtest.loggerService.log(GET_OPTIMIZER_METHOD_NAME, {
    optimizerName,
  });

  backtest.optimizerValidationService.validate(
    optimizerName,
    GET_OPTIMIZER_METHOD_NAME
  );

  return backtest.optimizerSchemaService.get(optimizerName);
}

/**
 * Retrieves a registered action schema by name.
 *
 * @param actionName - Unique action identifier
 * @returns The action schema configuration object
 * @throws Error if action is not registered
 *
 * @example
 * ```typescript
 * const action = getAction("telegram-notifier");
 * console.log(action.handler); // Class constructor or object
 * console.log(action.callbacks); // Optional lifecycle callbacks
 * ```
 */
export function getActionSchema(actionName: ActionName) {
  backtest.loggerService.log(GET_ACTION_METHOD_NAME, {
    actionName,
  });

  backtest.actionValidationService.validate(
    actionName,
    GET_ACTION_METHOD_NAME
  );

  return backtest.actionSchemaService.get(actionName);
}
