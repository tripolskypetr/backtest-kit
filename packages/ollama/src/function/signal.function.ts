import InferenceName from "../enum/InferenceName";
import ContextService from "../lib/services/base/ContextService";

/**
 * Wrap async function with Ollama inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Ollama inference context. Supports token rotation by passing multiple API keys.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Ollama model name (e.g., "llama3.3:70b")
 * @param apiKey - Single API key or array of keys for rotation
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { ollama } from '@backtest-kit/ollama';
 *
 * const wrappedFn = ollama(myAsyncFn, 'llama3.3:70b', ['key1', 'key2']);
 * const result = await wrappedFn(args);
 * ```
 */
export const ollama = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.OllamaInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Grok inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Grok (xAI) inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Grok model name (e.g., "grok-beta")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { grok } from '@backtest-kit/ollama';
 *
 * const wrappedFn = grok(myAsyncFn, 'grok-beta', process.env.GROK_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const grok = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.GrokInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with HuggingFace inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a HuggingFace Router API inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - HuggingFace model name (e.g., "meta-llama/Llama-3-70b")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { hf } from '@backtest-kit/ollama';
 *
 * const wrappedFn = hf(myAsyncFn, 'meta-llama/Llama-3-70b', process.env.HF_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const hf = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.HfInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Claude inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Anthropic Claude inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Claude model name (e.g., "claude-3-5-sonnet-20241022")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { claude } from '@backtest-kit/ollama';
 *
 * const wrappedFn = claude(myAsyncFn, 'claude-3-5-sonnet-20241022', process.env.ANTHROPIC_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const claude = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.ClaudeInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with OpenAI GPT inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an OpenAI GPT inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - OpenAI model name (e.g., "gpt-4o", "gpt-4-turbo")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { gpt5 } from '@backtest-kit/ollama';
 *
 * const wrappedFn = gpt5(myAsyncFn, 'gpt-4o', process.env.OPENAI_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const gpt5 = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.GPT5Inference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with DeepSeek inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a DeepSeek AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - DeepSeek model name (e.g., "deepseek-chat")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { deepseek } from '@backtest-kit/ollama';
 *
 * const wrappedFn = deepseek(myAsyncFn, 'deepseek-chat', process.env.DEEPSEEK_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const deepseek = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.DeepseekInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Mistral AI inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Mistral AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Mistral model name (e.g., "mistral-large-latest")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { mistral } from '@backtest-kit/ollama';
 *
 * const wrappedFn = mistral(myAsyncFn, 'mistral-large-latest', process.env.MISTRAL_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const mistral = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.MistralInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Perplexity AI inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Perplexity AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Perplexity model name (e.g., "llama-3.1-sonar-huge-128k-online")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { perplexity } from '@backtest-kit/ollama';
 *
 * const wrappedFn = perplexity(myAsyncFn, 'llama-3.1-sonar-huge-128k-online', process.env.PERPLEXITY_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const perplexity = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.PerplexityInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Cohere inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Cohere AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Cohere model name (e.g., "command-r-plus")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { cohere } from '@backtest-kit/ollama';
 *
 * const wrappedFn = cohere(myAsyncFn, 'command-r-plus', process.env.COHERE_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const cohere = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.CohereInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Alibaba Qwen inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Alibaba DashScope API inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Qwen model name (e.g., "qwen-max")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { alibaba } from '@backtest-kit/ollama';
 *
 * const wrappedFn = alibaba(myAsyncFn, 'qwen-max', process.env.ALIBABA_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const alibaba = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.AlibabaInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

/**
 * Wrap async function with Zhipu AI GLM-4 inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Zhipu AI GLM-4 inference context via OpenAI-compatible Z.ai API.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - GLM-4 model name (e.g., "glm-4-plus", "glm-4-air")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { glm4 } from '@backtest-kit/ollama';
 *
 * const wrappedFn = glm4(myAsyncFn, 'glm-4-plus', process.env.ZAI_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
/**
 * Wrap async function with Groq inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Groq inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Groq model name (e.g., "llama-3.3-70b-versatile")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { groq } from '@backtest-kit/ollama';
 *
 * const wrappedFn = groq(myAsyncFn, 'llama-3.3-70b-versatile', process.env.GROQ_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
export const groq = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.GroqInference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};

export const glm4 = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  model: string,
  apiKey?: string | string[],
): T => {
  const wrappedFn = async (args: Parameters<T>) => {
    return await ContextService.runInContext(
      async () => {
        return await fn(...args);
      },
      {
        apiKey,
        inference: InferenceName.GLM4Inference,
        model,
      },
    );
  };

  return <T>wrappedFn;
};
