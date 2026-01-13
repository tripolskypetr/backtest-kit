import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

export const getCohere = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getCohere.clear();
        throw new Error("Cohere provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.cohere.ai/compatibility/v1",
        apiKey: apiKey,
    })
});
