/**
 * Enumeration of supported LLM inference providers.
 *
 * Defines unique identifiers for each LLM provider supported by the library.
 * Used internally for dependency injection and provider resolution.
 *
 * @example
 * ```typescript
 * import { InferenceName } from '@backtest-kit/ollama';
 *
 * const providerName = InferenceName.GPT5Inference;
 * ```
 */
export enum InferenceName {
    /** Ollama provider for local/cloud LLM inference */
    OllamaInference = "ollama_inference",
    /** Grok provider by X.AI (api.x.ai) */
    GrokInference = "grok_inference",
    /** Hugging Face Inference API provider */
    HfInference = "hf_inference",
    /** Claude provider by Anthropic (api.anthropic.com) */
    ClaudeInference = "claude_inference",
    /** OpenAI GPT provider (api.openai.com) */
    GPT5Inference = "gpt5_inference",
    /** Z.ai GPT Provider (api.z.ai/api/paas/v4) */
    GLM4Inference = "glm4_inference",
    /** DeepSeek provider (api.deepseek.com) */
    DeepseekInference = "deepseek_inference",
    /** Mistral AI provider (api.mistral.ai) */
    MistralInference = "mistral_inference",
    /** Perplexity AI provider (api.perplexity.ai) */
    PerplexityInference = "perplexity_inference",
    /** Cohere provider (api.cohere.ai) */
    CohereInference = "cohere_inference",
    /** Alibaba Cloud provider (dashscope-intl.aliyuncs.com) */
    AlibabaInference = "alibaba_inference",
    /** Groq provider (api.groq.com) */
    GroqInference = "groq_inference",
}

export default InferenceName;
