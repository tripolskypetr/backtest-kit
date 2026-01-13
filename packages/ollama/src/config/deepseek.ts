import OpenAI from "openai";
import { CC_DEEPSEEK_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getDeepseek = singleshot(() => new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: CC_DEEPSEEK_API_KEY,
}));
