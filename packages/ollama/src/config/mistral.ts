import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Mistral API.
 *
 * Uses OpenAI SDK with Mistral's API endpoint.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Mistral API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getMistral } from "./config/mistral";
 *
 * const client = getMistral();
 * const completion = await client.chat.completions.create({
 *   model: "mistral-large-latest",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getMistral = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getMistral.clear();
        throw new Error("Mistral provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.mistral.ai/v1",
        apiKey: apiKey,
    })
});
