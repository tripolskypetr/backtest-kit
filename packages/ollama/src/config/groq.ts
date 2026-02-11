import Groq from "groq-sdk";
import { singleshot } from "functools-kit";
import engine from "../lib";

/**
 * Creates and caches a Groq client for Groq API.
 *
 * Uses the official Groq SDK with default settings.
 * The client instance is cached using singleshot memoization for performance.
 * Token rotation is not supported - throws error if array of keys is provided.
 *
 * @returns Groq client configured for Groq API
 * @throws Error if API key array is provided (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { getGroq } from "./config/groq";
 *
 * const client = getGroq();
 * const completion = await client.chat.completions.create({
 *   model: "llama-3.3-70b-versatile",
 *   messages: [{ role: "user", content: "Hello" }]
 * });
 * ```
 */
export const getGroq = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getGroq.clear();
        throw new Error("Groq provider does not support token rotation");
    }
    return new Groq({
        apiKey: apiKey,
    });
});
