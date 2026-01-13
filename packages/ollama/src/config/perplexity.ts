import OpenAI from "openai";
import { CC_PERPLEXITY_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getPerplexity = singleshot(() => new OpenAI({
    baseURL: "https://api.perplexity.ai",
    apiKey: CC_PERPLEXITY_API_KEY,
}));
