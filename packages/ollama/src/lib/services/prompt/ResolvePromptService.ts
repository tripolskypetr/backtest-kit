import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Code } from "../../../classes/Code";

type StrategyName = string;
type ExchangeName = string;
type FrameName = string;

/**
 * Service for managing signal prompts for AI/LLM integrations.
 *
 * Provides access to system and user prompts from Code.
 * Supports both static prompt arrays and dynamic prompt functions.
 *
 * Key responsibilities:
 * - Resolves system prompts (static arrays or async functions)
 * - Provides user prompt strings
 *
 * Used for AI-powered signal analysis and strategy recommendations.
 */
export class ResolvePromptService {

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Retrieves system prompts for AI context.
   *
   * System prompts can be:
   * - Static array of strings (returned directly)
   * - Async/sync function returning string array (executed and awaited)
   * - Undefined (returns empty array)
   *
   * @param code - Code containing the loaded module
   * @param symbol - Trading symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to array of system prompt strings
   */
  public getSystemPrompt = async (
    code: Code,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ) => {
    this.loggerService.log("resolvePromptService getSystemPrompt", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const { system } = code.source;
    if (Array.isArray(system)) {
      return system;
    }
    if (typeof system === "function") {
      return await system(symbol, strategyName, exchangeName, frameName, backtest);
    }
    return [];
  };

  /**
   * Retrieves user prompt string for AI input.
   *
   * @param code - Code containing the loaded module
   * @param symbol - Trading symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to user prompt string
   */
  public getUserPrompt = async (
    code: Code,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ) => {
    this.loggerService.log("resolvePromptService getUserPrompt", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const { user } = code.source;
    if (typeof user === "string") {
      return user;
    }
    if (typeof user === "function") {
      return await user(symbol, strategyName, exchangeName, frameName, backtest);
    }
    return "";
  };
}

export default ResolvePromptService;
