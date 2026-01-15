import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Claude (Anthropic) API.
 *
 * Uses OpenAI SDK with Claude's API endpoint for compatibility.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 *
 * @returns OpenAI client configured for Claude API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getClaude } from "./config/claude";
 *
 * const client = getClaude();
 * const completion = await client.chat.completions.create({
 *   model: "claude-3-5-sonnet-20240620",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getClaude = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getClaude.clear();
        throw new Error("Claude provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.anthropic.com/v1/",
        apiKey,
    })
});
