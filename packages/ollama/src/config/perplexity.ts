import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Perplexity API.
 *
 * Uses OpenAI SDK with Perplexity's API endpoint.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Perplexity API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getPerplexity } from "./config/perplexity";
 *
 * const client = getPerplexity();
 * const completion = await client.chat.completions.create({
 *   model: "llama-3.1-sonar-large-128k-online",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getPerplexity = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getPerplexity.clear();
        throw new Error("Perplexity provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.perplexity.ai",
        apiKey: apiKey,
    })
});
