import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { WalkerName } from "../interfaces/Walker.interface";
import { SizingName } from "../interfaces/Sizing.interface";
import { RiskName } from "../interfaces/Risk.interface";
import { ActionName } from "../interfaces/Action.interface";
import { SweepName } from "../interfaces/Sweep.interface";
import { MCPName } from "../interfaces/MCP.interface";
import { LauncherName } from "../interfaces/Launcher.interface";
import backtest from "../lib";

const GET_STRATEGY_METHOD_NAME = "get.getStrategySchema";
const GET_EXCHANGE_METHOD_NAME = "get.getExchangeSchema";
const GET_FRAME_METHOD_NAME = "get.getFrameSchema";
const GET_WALKER_METHOD_NAME = "get.getWalkerSchema";
const GET_SIZING_METHOD_NAME = "get.getSizingSchema";
const GET_RISK_METHOD_NAME = "get.getRiskSchema";
const GET_ACTION_METHOD_NAME = "get.getActionSchema";
const GET_SIMULATOR_METHOD_NAME = "get.getSweepSchema";
const GET_MCP_METHOD_NAME = "get.getMCPSchema";
const GET_LAUNCHER_METHOD_NAME = "get.getLauncherSchema";

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

/**
 * Retrieves a registered sweep schema by name.
 *
 * @param sweepName - Unique sweep identifier
 * @returns The sweep schema configuration object
 * @throws Error if sweep is not registered
 *
 * @example
 * ```typescript
 * const sweep = getSweepSchema("tv-ideas-sweep");
 * console.log(sweep.exchangeName); // "ccxt-exchange"
 * console.log(sweep.gridAxes); // grid axes override or undefined
 * ```
 */
export function getSweepSchema(sweepName: SweepName) {
  backtest.loggerService.log(GET_SIMULATOR_METHOD_NAME, {
    sweepName,
  });

  backtest.sweepValidationService.validate(
    sweepName,
    GET_SIMULATOR_METHOD_NAME
  );

  return backtest.sweepSchemaService.get(sweepName);
}

/**
 * Retrieves a registered MCP (Model Context Protocol) schema by name.
 *
 * @param mcpName - Unique MCP identifier
 * @returns The MCP schema configuration object
 * @throws Error if MCP is not registered
 *
 * @example
 * ```typescript
 * const mcp = getMCPSchema("my-mcp");
 * console.log(mcp.strategyName); // "my-strategy"
 * console.log(mcp.positionCost); // entry cost override or undefined
 * ```
 */
export function getMCPSchema(mcpName: MCPName) {
  backtest.loggerService.log(GET_MCP_METHOD_NAME, {
    mcpName,
  });

  backtest.mcpValidationService.validate(
    mcpName,
    GET_MCP_METHOD_NAME
  );

  return backtest.mcpSchemaService.get(mcpName);
}

/**
 * Retrieves a registered launcher schema by name.
 *
 * @param launcherName - Unique launcher identifier
 * @returns The launcher schema configuration object
 * @throws Error if launcher is not registered
 *
 * @example
 * ```typescript
 * const launcher = getLauncherSchema("my-launcher");
 * console.log(launcher.strategyName); // "my-strategy"
 * ```
 */
export function getLauncherSchema(launcherName: LauncherName) {
  backtest.loggerService.log(GET_LAUNCHER_METHOD_NAME, {
    launcherName,
  });

  backtest.launcherValidationService.validate(
    launcherName,
    GET_LAUNCHER_METHOD_NAME
  );

  return backtest.launcherSchemaService.get(launcherName);
}
