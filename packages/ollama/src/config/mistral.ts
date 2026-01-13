import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

export const getMistral = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getMistral.clear();
        throw new Error("Mistral provider does not support token rotation");
    }
    return new OpenAI({
        baseURL: "https://api.mistral.ai/v1",
        apiKey: apiKey,
    })
});
