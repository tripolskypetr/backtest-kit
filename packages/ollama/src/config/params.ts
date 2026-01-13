declare function parseInt(value: unknown): number;

export const CC_PERPLEXITY_API_KEY = process.env.CC_PERPLEXITY_API_KEY || "";
export const CC_DEEPSEEK_API_KEY = process.env.CC_DEEPSEEK_API_KEY || "";
export const CC_ALIBABA_API_KEY = process.env.CC_ALIBABA_API_KEY || "";
export const CC_MISTRAL_API_KEY = process.env.CC_MISTRAL_API_KEY || "";
export const CC_CLAUDE_API_KEY = process.env.CC_CLAUDE_API_KEY || "";
export const CC_OLLAMA_API_KEY = process.env.CC_OLLAMA_API_KEY || "";
export const CC_OPENAI_API_KEY = process.env.CC_OPENAI_API_KEY || "";
export const CC_COHERE_API_KEY = process.env.CC_COHERE_API_KEY || "";
export const CC_GROK_API_KEY = process.env.CC_GROK_API_KEY || "";
export const CC_HF_API_KEY = process.env.CC_HF_API_KEY || "";

export const CC_ENABLE_DEBUG = "CC_ENABLE_DEBUG" in process.env ? !!parseInt(process.env.CC_ENABLE_DEBUG) : false;
