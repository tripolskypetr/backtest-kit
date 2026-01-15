import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches an OpenAI-compatible client for Z.ai GLM-4 API.
 *
 * Uses OpenAI SDK with Z.ai's API endpoint for accessing Zhipu AI's GLM-4 models.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * Key features:
 * - OpenAI SDK compatibility layer
 * - Single API key support only
 * - Instance caching with singleshot
 * - Automatic cache clearing on error
 * - Context-based API key retrieval
 *
 * @returns OpenAI client configured for Z.ai API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getZAi } from "./config/zai";
 *
 * const client = getZAi();
 * const completion = await client.chat.completions.create({
 *   model: "glm-4-plus",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With structured output
 * const client = getZAi();
 * const completion = await client.chat.completions.create({
 *   model: "glm-4-plus",
 *   messages: [{ role: "user", content: "Generate trading signal" }],
 *   response_format: {
 *     type: "json_schema",
 *     json_schema: { schema: { type: "object", properties: {...} } }
 *   }
 * });
 * ```
 */
export const getZAi = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getZAi.clear();
        throw new Error("Z.ai provider does not support token rotation");
    }
    return new OpenAI({
        apiKey,
        baseURL: "https://api.z.ai/api/paas/v4/"
    });
});
