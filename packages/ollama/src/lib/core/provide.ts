/**
 * Service registration module for dependency injection.
 *
 * Registers all service implementations in the DI container during application startup.
 * Services are organized by layer: common, base, private, and public services.
 * Each service is registered with a factory function that creates new instances.
 *
 * Registration order:
 * 1. Common services (LoggerService)
 * 2. Base services (ContextService)
 * 3. Private services (RunnerPrivateService, OutlinePrivateService)
 * 4. Public services (RunnerPublicService, OutlinePublicService)
 *
 * This file is imported by lib/index.ts to ensure services are registered
 * before the DI container is initialized.
 */

import ContextService from "../services/base/ContextService";
import LoggerService from "../services/base/LoggerService";
import OutlineMarkdownService from "../services/markdown/OutlineMarkdownService";
import OutlinePrivateService from "../services/private/OutlinePrivateService";
import RunnerPrivateService from "../services/private/RunnerPrivateService";
import SignalPromptService from "../services/prompt/SignalPromptService";
import OutlinePublicService from "../services/public/OutlinePublicService";
import RunnerPublicService from "../services/public/RunnerPublicService";
import OptimizerTemplateService from "../services/template/OptimizerTemplateService";
import OptimizerSchemaService from "../services/schema/OptimizerSchemaService";
import OptimizerValidationService from "../services/validation/OptimizerValidationService";
import OptimizerConnectionService from "../services/connection/OptimizerConnectionService";
import OptimizerGlobalService from "../services/global/OptimizerGlobalService";
import { provide } from "./di";
import { TYPES } from "./types";

/**
 * Register base services.
 */
{
  provide(TYPES.contextService, () => new ContextService());
  provide(TYPES.loggerService, () => new LoggerService());
}

/**
 * Register private services.
 */
{
  provide(TYPES.runnerPrivateService, () => new RunnerPrivateService());
  provide(TYPES.outlinePrivateService, () => new OutlinePrivateService());
}

/**
 * Register public services.
 */
{
  provide(TYPES.runnerPublicService, () => new RunnerPublicService());
  provide(TYPES.outlinePublicService, () => new OutlinePublicService());
}

{
  provide(TYPES.signalPromptService, () => new SignalPromptService());
}

{
  provide(TYPES.outlineMarkdownService, () => new OutlineMarkdownService());
}

/**
 * Register template services.
 */
{
  provide(TYPES.optimizerTemplateService, () => new OptimizerTemplateService());
}

/**
 * Register schema services.
 */
{
  provide(TYPES.optimizerSchemaService, () => new OptimizerSchemaService());
}

/**
 * Register validation services.
 */
{
  provide(TYPES.optimizerValidationService, () => new OptimizerValidationService());
}

/**
 * Register connection services.
 */
{
  provide(TYPES.optimizerConnectionService, () => new OptimizerConnectionService());
}

/**
 * Register global services.
 */
{
  provide(TYPES.optimizerGlobalService, () => new OptimizerGlobalService());
}
