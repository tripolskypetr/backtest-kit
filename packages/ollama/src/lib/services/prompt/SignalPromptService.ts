import { singleshot } from "functools-kit";
import { createRequire } from "module";
import path from "path";
import { inject } from "../../../lib/core/di";
import LoggerService from "../common/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { PromptModel } from "../../../model/Prompt.model";

const require = createRequire(import.meta.url);

type StrategyName = string;
type ExchangeName = string;
type FrameName = string;

/**
 * Default fallback prompt configuration.
 * Used when signal.prompt.cjs file is not found.
 */
const DEFAULT_PROMPT: PromptModel = {
    user: "",
    system: [],
}

/**
 * Lazy-loads and caches signal prompt configuration.
 * Attempts to load from config/prompt/signal.prompt.cjs, falls back to DEFAULT_PROMPT if not found.
 * Uses singleshot pattern to ensure configuration is loaded only once.
 * @returns Prompt configuration with system and user prompts
 */
const GET_PROMPT_FN = singleshot((): PromptModel => {
  try {
    const modulePath = require.resolve(
      path.join(process.cwd(), `./config/prompt/signal.prompt.cjs`)
    );
    console.log(`Using ${modulePath} implementation as signal.prompt.cjs`);
    return require(modulePath);
  } catch (error) {
    console.log(`Using empty fallback for signal.prompt.cjs`, error);
    return DEFAULT_PROMPT;
  }
});

/**
 * Service for managing signal prompts for AI/LLM integrations.
 *
 * Provides access to system and user prompts configured in signal.prompt.cjs.
 * Supports both static prompt arrays and dynamic prompt functions.
 *
 * Key responsibilities:
 * - Lazy-loads prompt configuration from config/prompt/signal.prompt.cjs
 * - Resolves system prompts (static arrays or async functions)
 * - Provides user prompt strings
 * - Falls back to empty prompts if configuration is missing
 *
 * Used for AI-powered signal analysis and strategy recommendations.
 */
export class SignalPromptService {

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Retrieves system prompts for AI context.
   *
   * System prompts can be:
   * - Static array of strings (returned directly)
   * - Async/sync function returning string array (executed and awaited)
   * - Undefined (returns empty array)
   *
   * @param symbol - Trading symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to array of system prompt strings
   */
  public getSystemPrompt = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ) => {
    this.loggerService.log("signalPromptService getSystemPrompt", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const { system } = GET_PROMPT_FN();
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
   * @param symbol - Trading symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Timeframe identifier
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to user prompt string
   */
  public getUserPrompt = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ) => {
    this.loggerService.log("signalPromptService getUserPrompt", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const { user } = GET_PROMPT_FN();
    if (typeof user === "string") {
      return user;
    }
    if (typeof user === "function") {
      return await user(symbol, strategyName, exchangeName, frameName, backtest);
    }
    return "";
  };
}

export default SignalPromptService;
