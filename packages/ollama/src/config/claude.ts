import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

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
