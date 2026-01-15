import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Cohere API.
 *
 * Uses OpenAI SDK with Cohere's compatibility endpoint.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Cohere API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getCohere } from "./config/cohere";
 *
 * const client = getCohere();
 * const completion = await client.chat.completions.create({
 *   model: "command-r-plus",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getCohere = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getCohere.clear();
        throw new Error("Cohere provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.cohere.ai/compatibility/v1",
        apiKey: apiKey,
    })
});
