import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

export const getDeepseek = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getDeepseek.clear();
        throw new Error("Deepseek provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.deepseek.com",
        apiKey: apiKey,
    })
});
