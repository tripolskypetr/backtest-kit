import OpenAI from "openai";
import { CC_MISTRAL_API_KEY } from "./params";
import { singleshot } from "functools-kit";

export const getMistral = singleshot(() => new OpenAI({
    baseURL: "https://api.mistral.ai/v1",
    apiKey: CC_MISTRAL_API_KEY,
}));
