import { IOutlineMessage } from "agent-swarm-kit";
import InferenceName from "../enum/InferenceName";
import engine from "../lib";

export const ollama = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.OllamaInference,
    model,
    apiKey
  );
};

export const grok = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.GrokInference,
    model,
    apiKey
  );
};

export const hf = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.HfInference,
    model,
    apiKey
  );
};

export const claude = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.ClaudeInference,
    model,
    apiKey
  );
};

export const gpt5 = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.GPT5Inference,
    model,
    apiKey
  );
};

export const deepseek = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.DeepseekInference,
    model,
    apiKey
  );
};

export const mistral = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.MistralInference,
    model,
    apiKey
  );
};

export const perplexity = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.PerplexityInference,
    model,
    apiKey
  );
};

export const cohere = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.CohereInference,
    model,
    apiKey
  );
};

export const alibaba = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.AlibabaInference,
    model,
    apiKey
  );
};
