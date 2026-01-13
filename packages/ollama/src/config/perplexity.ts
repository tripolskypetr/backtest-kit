import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

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
