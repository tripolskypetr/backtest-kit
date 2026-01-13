import OpenAI from "openai";
import { singleshot } from "functools-kit";
import engine from "src/lib";

export const getOpenAi = singleshot(() => {
    const apiKey = engine.contextService.context.apiKey;
    if (Array.isArray(apiKey)) {
        getOpenAi.clear();
        throw new Error("OpenAI provider does not support token rotation");
    }
    return new OpenAI({
        apiKey: apiKey,
    })
});
