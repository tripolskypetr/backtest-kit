import OpenAI from "openai";
import { memoize } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Deepseek API.
 *
 * Uses OpenAI SDK with Deepseek's API endpoint.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Deepseek API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getDeepseek } from "./config/deepseek";
 *
 * const client = getDeepseek();
 * const completion = await client.chat.completions.create({
 *   model: "deepseek-chat",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
const GET_CLIENT_FN = memoize(
    ([apiKey]) => `${apiKey}`,
    (apiKey: string | undefined) =>
        new OpenAI({
            baseURL: "https://api.deepseek.com",
            apiKey,
        }),
);

export const getDeepseek = () => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        throw new Error("Deepseek provider does not support token rotation");
    }
    return GET_CLIENT_FN(apiKey);
};
