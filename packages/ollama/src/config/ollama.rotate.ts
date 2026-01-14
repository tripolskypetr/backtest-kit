import { singleshot } from "functools-kit";
import { ChatRequest, ChatResponse, Config, Ollama } from "ollama";
import { RoundRobin } from "agent-swarm-kit";
import engine from "../lib";

/**
 * Wrapper class for Ollama client with token rotation support.
 *
 * Implements round-robin API key rotation for high-volume Ollama usage.
 * Each request automatically rotates through the provided API keys to
 * distribute load and avoid rate limiting.
 *
 * Key features:
 * - Round-robin token rotation using RoundRobin from agent-swarm-kit
 * - Streaming and non-streaming support
 * - Type-safe method overloads
 * - Automatic Ollama client creation per token
 *
 * @throws Error if no API keys are provided in context
 */
class OllamaWrapper {
  constructor(readonly _config: Partial<Config>) {
    if (!engine.contextService.context.apiKey) {
      throw new Error("OllamaRotate required apiKey[] to process token rotation");
    }
  }

  /** Round-robin chat function factory */
  _chatFn = RoundRobin.create(<string[]>engine.contextService.context.apiKey, (token) => {
    const ollama = new Ollama({
      ...this._config,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return async (
      request: ChatRequest
    ): Promise<ChatResponse | AsyncIterable<ChatResponse>> => {
      if (request.stream === true) {
        return await ollama.chat(request as ChatRequest & { stream: true });
      } else {
        return await ollama.chat(request as ChatRequest & { stream?: false });
      }
    };
  });

  /** Non-streaming chat method overload */
  async chat(request: ChatRequest & { stream?: false }): Promise<ChatResponse>;
  /** Streaming chat method overload */
  async chat(
    request: ChatRequest & { stream: true }
  ): Promise<AsyncIterable<ChatResponse>>;
  /**
   * Executes a chat request with automatic token rotation.
   *
   * @param request - Chat request configuration
   * @returns Chat response or async iterable (for streaming)
   */
  async chat(
    request: ChatRequest
  ): Promise<ChatResponse | AsyncIterable<ChatResponse>> {
    return await this._chatFn(request);
  }
}

/**
 * Creates and caches an Ollama wrapper with token rotation enabled.
 *
 * Requires an array of API keys in the execution context.
 * The wrapper automatically rotates through keys using round-robin strategy.
 *
 * @returns OllamaWrapper instance with token rotation
 *
 * @example
 * ```typescript
 * import { getOllamaRotate } from "./config/ollama.rotate";
 *
 * // Context must have array of API keys
 * const client = getOllamaRotate();
 * const response = await client.chat({
 *   model: "llama2",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * // Next request will use a different API key
 * ```
 */
export const getOllamaRotate = singleshot(
  () =>
    new OllamaWrapper({
      host: "https://ollama.com",
    })
);
