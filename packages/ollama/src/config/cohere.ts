import OpenAI from "openai";
import { CC_COHERE_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getCohere = singleshot(() => new OpenAI({
    baseURL: "https://api.cohere.ai/compatibility/v1",
    apiKey: CC_COHERE_API_KEY,
}));
