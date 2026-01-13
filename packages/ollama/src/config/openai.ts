import OpenAI from "openai";
import { CC_OPENAI_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getOpenAi = singleshot(() => new OpenAI({
    apiKey: CC_OPENAI_API_KEY,
}));
