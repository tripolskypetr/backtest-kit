import backtest from "../lib/index";
import { IStrategySchema } from "../interfaces/Strategy.interface";
import { IExchangeSchema } from "../interfaces/Exchange.interface";
import { IFrameSchema } from "../interfaces/Frame.interface";
import { IWalkerSchema } from "../interfaces/Walker.interface";
import { ISizingSchema } from "../interfaces/Sizing.interface";
import { IRiskSchema } from "../interfaces/Risk.interface";
import { ISweepSchema } from "../interfaces/Sweep.interface";
import { IMCPSchema } from "../interfaces/MCP.interface";
import { ILauncherSchema } from "../interfaces/Launcher.interface";

const LIST_EXCHANGES_METHOD_NAME = "list.listExchangeSchema";
const LIST_STRATEGIES_METHOD_NAME = "list.listStrategySchema";
const LIST_FRAMES_METHOD_NAME = "list.listFrameSchema";
const LIST_WALKERS_METHOD_NAME = "list.listWalkerSchema";
const LIST_SIZINGS_METHOD_NAME = "list.listSizingSchema";
const LIST_RISKS_METHOD_NAME = "list.listRiskSchema";
const LIST_SIMULATORS_METHOD_NAME = "list.listSweepSchema";
const LIST_MCP_METHOD_NAME = "list.listMCPSchema";
const LIST_LAUNCHERS_METHOD_NAME = "list.listLauncherSchema";

/**
 * Returns a list of all registered exchange schemas.
 *
 * Retrieves all exchanges that have been registered via addExchange().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of exchange schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listExchanges, addExchange } from "backtest-kit";
 *
 * addExchange({
 *   exchangeName: "binance",
 *   note: "Binance cryptocurrency exchange",
 *   getCandles: async (symbol, interval, since, limit) => [...],
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 * });
 *
 * const exchanges = listExchanges();
 * console.log(exchanges);
 * // [{ exchangeName: "binance", note: "Binance cryptocurrency exchange", ... }]
 * ```
 */
export async function listExchangeSchema(): Promise<IExchangeSchema[]> {
  backtest.loggerService.log(LIST_EXCHANGES_METHOD_NAME);
  return await backtest.exchangeValidationService.list();
}

/**
 * Returns a list of all registered strategy schemas.
 *
 * Retrieves all strategies that have been registered via addStrategy().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of strategy schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listStrategies, addStrategy } from "backtest-kit";
 *
 * addStrategy({
 *   strategyName: "my-strategy",
 *   note: "Simple moving average crossover strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({
 *     position: "long",
 *     priceOpen: 50000,
 *     priceTakeProfit: 51000,
 *     priceStopLoss: 49000,
 *     minuteEstimatedTime: 60,
 *   }),
 * });
 *
 * const strategies = listStrategies();
 * console.log(strategies);
 * // [{ strategyName: "my-strategy", note: "Simple moving average...", ... }]
 * ```
 */
export async function listStrategySchema(): Promise<IStrategySchema[]> {
  backtest.loggerService.log(LIST_STRATEGIES_METHOD_NAME);
  return await backtest.strategyValidationService.list();
}

/**
 * Returns a list of all registered frame schemas.
 *
 * Retrieves all frames that have been registered via addFrame().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of frame schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listFrames, addFrame } from "backtest-kit";
 *
 * addFrame({
 *   frameName: "1d-backtest",
 *   note: "One day backtest period for testing",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 * });
 *
 * const frames = listFrames();
 * console.log(frames);
 * // [{ frameName: "1d-backtest", note: "One day backtest...", ... }]
 * ```
 */
export async function listFrameSchema(): Promise<IFrameSchema[]> {
  backtest.loggerService.log(LIST_FRAMES_METHOD_NAME);
  return await backtest.frameValidationService.list();
}

/**
 * Returns a list of all registered walker schemas.
 *
 * Retrieves all walkers that have been registered via addWalker().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of walker schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listWalkers, addWalker } from "backtest-kit";
 *
 * addWalker({
 *   walkerName: "llm-prompt-optimizer",
 *   note: "Compare LLM-based trading strategies",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: ["my-strategy-v1", "my-strategy-v2"],
 *   metric: "sharpeRatio",
 * });
 *
 * const walkers = listWalkers();
 * console.log(walkers);
 * // [{ walkerName: "llm-prompt-optimizer", note: "Compare LLM...", ... }]
 * ```
 */
export async function listWalkerSchema(): Promise<IWalkerSchema[]> {
  backtest.loggerService.log(LIST_WALKERS_METHOD_NAME);
  return await backtest.walkerValidationService.list();
}

/**
 * Returns a list of all registered sizing schemas.
 *
 * Retrieves all sizing configurations that have been registered via addSizing().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of sizing schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listSizings, addSizing } from "backtest-kit";
 *
 * addSizing({
 *   sizingName: "conservative",
 *   note: "Low risk fixed percentage sizing",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 *   maxPositionPercentage: 10,
 * });
 *
 * addSizing({
 *   sizingName: "kelly",
 *   note: "Kelly Criterion with quarter multiplier",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 * });
 *
 * const sizings = listSizings();
 * console.log(sizings);
 * // [
 * //   { sizingName: "conservative", method: "fixed-percentage", ... },
 * //   { sizingName: "kelly", method: "kelly-criterion", ... }
 * // ]
 * ```
 */
export async function listSizingSchema(): Promise<ISizingSchema[]> {
  backtest.loggerService.log(LIST_SIZINGS_METHOD_NAME);
  return await backtest.sizingValidationService.list();
}

/**
 * Returns a list of all registered risk schemas.
 *
 * Retrieves all risk configurations that have been registered via addRisk().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of risk schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listRisks, addRisk } from "backtest-kit";
 *
 * addRisk({
 *   riskName: "conservative",
 *   note: "Conservative risk management with tight position limits",
 *   maxConcurrentPositions: 5,
 * });
 *
 * addRisk({
 *   riskName: "aggressive",
 *   note: "Aggressive risk management with loose limits",
 *   maxConcurrentPositions: 10,
 * });
 *
 * const risks = listRisks();
 * console.log(risks);
 * // [
 * //   { riskName: "conservative", maxConcurrentPositions: 5, ... },
 * //   { riskName: "aggressive", maxConcurrentPositions: 10, ... }
 * // ]
 * ```
 */
export async function listRiskSchema(): Promise<IRiskSchema[]> {
  backtest.loggerService.log(LIST_RISKS_METHOD_NAME);
  return await backtest.riskValidationService.list();
}

/**
 * Returns a list of all registered sweep schemas.
 *
 * Retrieves all sweeps that have been registered via addSweepSchema().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of sweep schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listSweepSchema, addSweepSchema } from "backtest-kit";
 *
 * addSweepSchema({
 *   sweepName: "tv-ideas-sweep",
 *   exchangeName: "ccxt-exchange",
 *   callbacks: {},
 * });
 *
 * const sweeps = await listSweepSchema();
 * console.log(sweeps);
 * // [{ sweepName: "tv-ideas-sweep", exchangeName: "ccxt-exchange", ... }]
 * ```
 */
export async function listSweepSchema(): Promise<ISweepSchema[]> {
  backtest.loggerService.log(LIST_SIMULATORS_METHOD_NAME);
  return await backtest.sweepValidationService.list();
}

/**
 * Returns a list of all registered MCP (Model Context Protocol) schemas.
 *
 * Retrieves all MCP instances that have been registered via addMCPSchema().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of MCP schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listMCPSchema, addMCPSchema } from "backtest-kit";
 *
 * addMCPSchema({
 *   mcpName: "my-mcp",
 *   strategyName: "my-strategy",
 * });
 *
 * const mcps = await listMCPSchema();
 * console.log(mcps);
 * // [{ mcpName: "my-mcp", strategyName: "my-strategy", ... }]
 * ```
 */
export async function listMCPSchema(): Promise<IMCPSchema[]> {
  backtest.loggerService.log(LIST_MCP_METHOD_NAME);
  return await backtest.mcpValidationService.list();
}

/**
 * Returns a list of all registered launcher schemas.
 *
 * Retrieves all launchers that have been registered via addLauncherSchema().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of launcher schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listLauncherSchema, addLauncherSchema } from "backtest-kit";
 *
 * addLauncherSchema({
 *   launcherName: "my-launcher",
 *   symbolList: ["BTCUSDT"],
 *   strategyName: "my-strategy",
 *   backtest: true,
 * });
 *
 * const launchers = await listLauncherSchema();
 * console.log(launchers);
 * // [{ launcherName: "my-launcher", symbolList: ["BTCUSDT"], strategyName: "my-strategy", backtest: true }]
 * ```
 */
export async function listLauncherSchema(): Promise<ILauncherSchema[]> {
  backtest.loggerService.log(LIST_LAUNCHERS_METHOD_NAME);
  return await backtest.launcherValidationService.list();
}
