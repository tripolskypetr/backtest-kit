import OpenAI from "openai";
import { memoize } from "functools-kit";
import engine from "../lib";

const GET_CLIENT_FN = memoize(
    ([apiKey]) => `${apiKey}`,
    (apiKey: string | undefined) =>
        new OpenAI({
            apiKey,
        }),
);

/**
 * Creates and caches an OpenAI client for OpenAI API.
 *
 * Uses the official OpenAI SDK with default settings.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - Official OpenAI SDK
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for OpenAI API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getOpenAi } from "./config/openai";
 *
 * const client = getOpenAi();
 * const completion = await client.chat.completions.create({
 *   model: "gpt-5o-mini",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getOpenAi = () => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        throw new Error("OpenAI provider does not support token rotation");
    }
    return GET_CLIENT_FN(apiKey);
};
