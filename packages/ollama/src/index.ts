/**
 * Main entry point for the @backtest-kit/ollama package.
 *
 * A comprehensive AI inference package supporting multiple providers with
 * structured output validation for trading signal generation.
 *
 * Exported functionality:
 * - Signal generation functions for each AI provider
 * - Logger configuration utilities
 * - Engine library for advanced usage
 *
 * Supported AI providers:
 * - Alibaba Cloud
 * - Claude (Anthropic)
 * - Cohere
 * - Deepseek
 * - GPT-5 (OpenAI)
 * - Grok (xAI)
 * - Hugging Face
 * - Mistral
 * - Ollama (local and cloud)
 * - Perplexity
 *
 * @example
 * ```typescript
 * import { claude, setLogger } from "@backtest-kit/ollama";
 *
 * // Configure logger (optional)
 * setLogger({
 *   log: async (topic, ...args) => console.log(topic, ...args),
 *   debug: async (topic, ...args) => console.debug(topic, ...args),
 *   info: async (topic, ...args) => console.info(topic, ...args),
 *   warn: async (topic, ...args) => console.warn(topic, ...args),
 * });
 *
 * // Generate trading signal
 * const signal = await claude({
 *   messages: [
 *     { role: "system", content: "You are a trading analyst" },
 *     { role: "user", content: "Analyze BTC/USDT market and decide position" }
 *   ],
 *   model: "claude-3-5-sonnet-20240620",
 *   apiKey: "sk-ant-..."
 * });
 *
 * if (signal) {
 *   console.log(`Position: ${signal.position}`);
 *   console.log(`Entry: ${signal.priceOpen}`);
 *   console.log(`Stop Loss: ${signal.priceStopLoss}`);
 *   console.log(`Take Profit: ${signal.priceTakeProfit}`);
 *   console.log(`Time Estimate: ${signal.minuteEstimatedTime}min`);
 *   console.log(`Risk Note: ${signal.note}`);
 * }
 * ```
 */

import "./logic";
import "./main/bootstrap";

/**
 * Signal generation functions for all supported AI providers.
 * Each function generates structured trading signals with validation.
 */
export {
  alibaba,
  claude,
  cohere,
  deepseek,
  gpt5,
  grok,
  hf,
  mistral,
  ollama,
  perplexity,
  glm4,
} from "./function/signal.function";

/**
 * Configuration utilities.
 */
export {
  setLogger,
} from "./function/setup.function";

/**
 * Advanced engine library for direct service access.
 * Use this for custom integrations and low-level operations.
 */
export { engine as lib } from "./lib";
