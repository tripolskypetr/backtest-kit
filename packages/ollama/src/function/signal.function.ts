import { IOutlineMessage } from "agent-swarm-kit";
import InferenceName from "../enum/InferenceName";
import engine from "../lib";

/**
 * Generate structured trading signal from Ollama models.
 *
 * Supports token rotation by passing multiple API keys. Automatically enforces
 * the signal JSON schema defined in Signal.schema.ts.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Ollama model name (e.g., "llama3.3:70b")
 * @param apiKey - Single API key or array of keys for rotation
 * @returns Promise resolving to structured trading signal
 *
 * @example
 * ```typescript
 * import { ollama } from '@backtest-kit/ollama';
 *
 * const signal = await ollama(messages, 'llama3.3:70b', ['key1', 'key2']);
 * console.log(signal.position); // "long" | "short" | "wait"
 * ```
 */
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

/**
 * Generate structured trading signal from Grok models.
 *
 * Uses xAI Grok models through direct API access. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Grok model name (e.g., "grok-beta")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { grok } from '@backtest-kit/ollama';
 *
 * const signal = await grok(messages, 'grok-beta', process.env.GROK_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Hugging Face models.
 *
 * Uses HuggingFace Router API for model access. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - HuggingFace model name
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 *
 * @example
 * ```typescript
 * import { hf } from '@backtest-kit/ollama';
 *
 * const signal = await hf(messages, 'meta-llama/Llama-3-70b', process.env.HF_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Claude models.
 *
 * Uses Anthropic Claude through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Claude model name (e.g., "claude-3-5-sonnet-20241022")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { claude } from '@backtest-kit/ollama';
 *
 * const signal = await claude(messages, 'claude-3-5-sonnet-20241022', process.env.ANTHROPIC_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from OpenAI GPT models.
 *
 * Uses official OpenAI SDK with JSON schema enforcement. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - OpenAI model name (e.g., "gpt-4o", "gpt-4-turbo")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { gpt5 } from '@backtest-kit/ollama';
 *
 * const signal = await gpt5(messages, 'gpt-4o', process.env.OPENAI_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from DeepSeek models.
 *
 * Uses DeepSeek AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - DeepSeek model name (e.g., "deepseek-chat")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { deepseek } from '@backtest-kit/ollama';
 *
 * const signal = await deepseek(messages, 'deepseek-chat', process.env.DEEPSEEK_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Mistral AI models.
 *
 * Uses Mistral AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Mistral model name (e.g., "mistral-large-latest")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { mistral } from '@backtest-kit/ollama';
 *
 * const signal = await mistral(messages, 'mistral-large-latest', process.env.MISTRAL_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Perplexity AI models.
 *
 * Uses Perplexity AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Perplexity model name (e.g., "llama-3.1-sonar-huge-128k-online")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { perplexity } from '@backtest-kit/ollama';
 *
 * const signal = await perplexity(messages, 'llama-3.1-sonar-huge-128k-online', process.env.PERPLEXITY_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Cohere models.
 *
 * Uses Cohere AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Cohere model name (e.g., "command-r-plus")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { cohere } from '@backtest-kit/ollama';
 *
 * const signal = await cohere(messages, 'command-r-plus', process.env.COHERE_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Alibaba Cloud Qwen models.
 *
 * Uses Alibaba DashScope API through direct HTTP requests. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Qwen model name (e.g., "qwen-max")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { alibaba } from '@backtest-kit/ollama';
 *
 * const signal = await alibaba(messages, 'qwen-max', process.env.ALIBABA_API_KEY);
 * ```
 */
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

/**
 * Generate structured trading signal from Zhipu AI GLM-4 models.
 *
 * Uses Zhipu AI's GLM-4 through OpenAI-compatible Z.ai API. Does NOT support token rotation.
 * GLM-4 is a powerful Chinese language model with strong reasoning capabilities.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - GLM-4 model name (e.g., "glm-4-plus", "glm-4-air")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { glm4 } from '@backtest-kit/ollama';
 *
 * const signal = await glm4(messages, 'glm-4-plus', process.env.ZAI_API_KEY);
 * console.log(`Position: ${signal.position}`);
 * console.log(`Entry: ${signal.priceOpen}`);
 * ```
 */
export const glm4 = async (
  messages: IOutlineMessage[],
  model: string,
  apiKey?: string | string[]
) => {
  return await engine.outlinePublicService.getCompletion(
    messages,
    InferenceName.GLM4Inference,
    model,
    apiKey
  );
};
