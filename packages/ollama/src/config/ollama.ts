import { singleshot } from "functools-kit";
import { Ollama } from "ollama";
import engine from "../lib";
import { getOllamaRotate } from "./ollama.rotate";

/**
 * Creates and caches an Ollama client with flexible configuration.
 *
 * Supports three modes of operation:
 * 1. Token rotation mode: Array of API keys enables automatic rotation
 * 2. Cloud mode: Single API key connects to ollama.com
 * 3. Local mode: No API key connects to local Ollama instance
 *
 * The client instance is cached using singleshot memoization for performance.
 * Automatically selects the appropriate client based on API key configuration.
 *
 * Key features:
 * - Token rotation support for high-volume usage
 * - Cloud and local Ollama support
 * - Instance caching with singleshot
 * - Automatic mode detection
 *
 * @returns Ollama client or OllamaWrapper (for token rotation)
 *
 * @example
 * ```typescript
 * import { getOllama } from "./config/ollama";
 *
 * // Local mode (no API key)
 * const localClient = getOllama();
 * const response = await localClient.chat({
 *   model: "llama2",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 *
 * // Cloud mode (single API key)
 * const cloudClient = getOllama();
 * const response = await cloudClient.chat({
 *   model: "llama2",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 *
 * // Token rotation mode (array of API keys)
 * const rotateClient = getOllama();
 * const response = await rotateClient.chat({
 *   model: "llama2",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getOllama = singleshot(() => {
  const apiKey = engine.contextService.context.apiKey;
  if (Array.isArray(apiKey)) {
    return getOllamaRotate();
  }
  if (!apiKey) {
    return new Ollama();
  }
  return new Ollama({
    host: "https://ollama.com",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
});
