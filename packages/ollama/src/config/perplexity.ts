import OpenAI from "openai";
import { memoize } from "functools-kit";
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
const GET_CLIENT_FN = memoize(
    ([apiKey]) => `${apiKey}`,
    (apiKey: string | undefined) =>
        new OpenAI({
            baseURL: "https://api.perplexity.ai",
            apiKey,
        }),
);

export const getPerplexity = () => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        throw new Error("Perplexity provider does not support token rotation");
    }
    return GET_CLIENT_FN(apiKey);
};
