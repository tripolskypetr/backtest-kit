import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Grok (xAI) API.
 *
 * Uses OpenAI SDK with Grok's API endpoint.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Grok API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getGrok } from "./config/grok";
 *
 * const client = getGrok();
 * const completion = await client.chat.completions.create({
 *   model: "grok-beta",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getGrok = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getGrok.clear();
        throw new Error("Grok provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.x.ai/v1",
        apiKey: apiKey,
    })
});
