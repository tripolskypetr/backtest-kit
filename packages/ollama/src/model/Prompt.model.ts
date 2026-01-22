
type StrategyName = string;
type ExchangeName = string;
type FrameName = string;

/**
 * Function type for generating dynamic system prompts.
 *
 * System prompt functions enable context-aware AI prompt generation based on:
 * - Trading symbol and market conditions
 * - Strategy-specific requirements
 * - Exchange platform characteristics
 * - Timeframe considerations
 * - Execution mode (backtest vs live)
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT", "ETHUSDT")
 * @param strategyName - Strategy identifier for configuration lookup
 * @param exchangeName - Exchange platform identifier
 * @param frameName - Timeframe identifier (e.g., "1m", "5m", "1h")
 * @param backtest - Whether running in backtest mode (true) or live trading (false)
 * @returns Promise resolving to array of system prompt strings, or array directly
 *
 * @example
 * ```typescript
 * const systemPromptFn: SystemPromptFn = async (symbol, strategyName, exchangeName, frameName, backtest) => {
 *   return [
 *     `You are analyzing ${symbol} on ${exchangeName}`,
 *     `Strategy: ${strategyName}, Timeframe: ${frameName}`,
 *     backtest ? "Running in backtest mode" : "Running in live mode"
 *   ];
 * };
 * ```
 */
type SystemPromptFn = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
) => Promise<string[]> | string[];

/**
 * Function type for generating dynamic user prompts.
 *
 * User prompt functions enable context-aware AI query generation based on:
 * - Trading symbol and market conditions
 * - Strategy-specific requirements
 * - Exchange platform characteristics
 * - Timeframe considerations
 * - Execution mode (backtest vs live)
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT", "ETHUSDT")
 * @param strategyName - Strategy identifier for configuration lookup
 * @param exchangeName - Exchange platform identifier
 * @param frameName - Timeframe identifier (e.g., "1m", "5m", "1h")
 * @param backtest - Whether running in backtest mode (true) or live trading (false)
 * @returns Promise resolving to user prompt string, or string directly
 *
 * @example
 * ```typescript
 * const userPromptFn: UserPromptFn = async (symbol, strategyName, exchangeName, frameName, backtest) => {
 *   return `Analyze ${symbol} for ${strategyName} strategy on ${frameName} timeframe`;
 * };
 * ```
 */
type UserPromptFn = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
) => Promise<string> | string;

/**
 * Prompt configuration model for AI/LLM integrations.
 *
 * Defines the structure for AI prompts used in trading strategy analysis.
 * Supports both static prompts and dynamic functions for context-aware generation.
 *
 * Key features:
 * - System prompts: Provide AI context and instructions (optional)
 * - User prompts: Define specific queries or tasks (required)
 * - Static values: Use fixed strings/arrays for consistent prompts
 * - Dynamic functions: Generate prompts based on runtime context
 *
 * Used by PromptService implementations to load and process prompt configurations
 * from config/prompt/*.prompt.cjs files.
 *
 * @example
 * ```typescript
 * // Static prompts
 * const staticPrompt: PromptModel = {
 *   system: ["You are a trading analyst", "Focus on risk management"],
 *   user: "Should I enter this trade?"
 * };
 *
 * // Dynamic prompts
 * const dynamicPrompt: PromptModel = {
 *   system: async (symbol, strategy, exchange, frame, backtest) => [
 *     `Analyzing ${symbol} on ${exchange}`,
 *     `Strategy: ${strategy}, Timeframe: ${frame}`
 *   ],
 *   user: async (symbol, strategy, exchange, frame, backtest) =>
 *     `Evaluate ${symbol} for ${strategy} strategy`
 * };
 * ```
 */
export interface PromptModel {
  /**
   * System prompts for AI context.
   * Can be static array of strings or dynamic function returning string array.
   * Used to set AI behavior, constraints, and domain knowledge.
   */
  system?: string[] | SystemPromptFn;

  /**
   * User prompt for AI input.
   * Can be static string or dynamic function returning string.
   * Defines the specific question or task for the AI to perform.
   */
  user: string | UserPromptFn;
}
