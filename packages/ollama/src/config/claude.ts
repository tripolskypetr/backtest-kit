import OpenAI from "openai";
import { CC_CLAUDE_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getClaude = singleshot(() => new OpenAI({
    baseURL: "https://api.anthropic.com/v1/",
    apiKey: CC_CLAUDE_API_KEY,
}));
