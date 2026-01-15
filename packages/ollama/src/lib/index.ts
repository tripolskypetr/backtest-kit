/**
 * Main library entry point for the Ollama package.
 *
 * Initializes the dependency injection container, registers all AI providers,
 * and exports the engine object containing all services.
 *
 * The engine provides access to:
 * - Common services (logger)
 * - Base services (context)
 * - Private services (runner and outline private services)
 * - Public services (runner and outline public services)
 *
 * Registered AI providers:
 * - Ollama (local and cloud)
 * - OpenAI (GPT-5)
 * - Claude (Anthropic)
 * - Deepseek
 * - Mistral
 * - Perplexity
 * - Cohere
 * - Grok (xAI)
 * - Alibaba
 * - Hugging Face
 *
 * @example
 * ```typescript
 * import { engine } from "./lib";
 *
 * // Access logger
 * engine.loggerService.info("Application started");
 *
 * // Use public service for AI completion
 * const result = await engine.runnerPublicService.getCompletion(
 *   { messages: [...] },
 *   { inference: "claude", model: "claude-3-5-sonnet", apiKey: "..." }
 * );
 * ```
 */

import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";
import { TContextService } from "./services/base/ContextService";
import RunnerPrivateService from "./services/private/RunnerPrivateService";
import RunnerPublicService from "./services/public/RunnerPublicService";
import { InferenceName } from "../enum/InferenceName";
import GrokProvider from "../client/GrokProvider.client";
import HfProvider from "../client/HfProvider.client";
import OllamaProvider from "../client/OllamaProvider.client";
import ClaudeProvider from "../client/ClaudeProvider.client";
import GPT5Provider from "../client/GPT5Provider.client";
import DeepseekProvider from "../client/DeepseekProvider.client";
import MistralProvider from "../client/MistralProvider.client";
import PerplexityProvider from "../client/PerplexityProvider.client";
import CohereProvider from "../client/CohereProvider.client";
import AlibabaProvider from "../client/AlibabaProvider.client";
import GLM4Provider from "../client/GLM4Provider.client";
import LoggerService from "./services/common/LoggerService";
import OutlinePrivateService from "./services/private/OutlinePrivateService";
import OutlinePublicService from "./services/public/OutlinePublicService";

/**
 * Common service instances.
 */
const commonServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
}

/**
 * Base service instances.
 */
const baseServices = {
  contextService: inject<TContextService>(TYPES.contextService),
};

/**
 * Private service instances.
 */
const privateServices = {
  runnerPrivateService: inject<RunnerPrivateService>(
    TYPES.runnerPrivateService
  ),
  outlinePrivateService: inject<OutlinePrivateService>(TYPES.outlinePrivateService),
};

/**
 * Public service instances.
 */
const publicServices = {
  runnerPublicService: inject<RunnerPublicService>(TYPES.runnerPublicService),
  outlinePublicService: inject<OutlinePublicService>(TYPES.outlinePublicService),
};

/**
 * Main engine object containing all services.
 * Provides unified access to the entire service layer.
 */
const engine = {
  ...commonServices,
  ...baseServices,
  ...privateServices,
  ...publicServices,
};

// Initialize DI container
init();

/**
 * Register all AI provider implementations.
 */
{
  engine.runnerPrivateService.registerRunner(
    InferenceName.OllamaInference,
    OllamaProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.GrokInference,
    GrokProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.HfInference,
    HfProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.ClaudeInference,
    ClaudeProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.GPT5Inference,
    GPT5Provider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.DeepseekInference,
    DeepseekProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.MistralInference,
    MistralProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.PerplexityInference,
    PerplexityProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.CohereInference,
    CohereProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.AlibabaInference,
    AlibabaProvider
  );
  engine.runnerPrivateService.registerRunner(
    InferenceName.GLM4Inference,
    GLM4Provider,
  );
}

export { engine };

// Make engine globally accessible for debugging
Object.assign(globalThis, { engine });

export default engine;
