import OpenAI from "openai";
import { CC_GROK_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getGrok = singleshot(() => new OpenAI({
    baseURL: "https://api.x.ai/v1",
    apiKey: CC_GROK_API_KEY,
}));
