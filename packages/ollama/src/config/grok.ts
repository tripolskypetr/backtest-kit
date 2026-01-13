import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

export const getGrok = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getGrok.clear();
        throw new Error("Grok provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.x.ai/v1",
        apiKey: apiKey,
    })
});
