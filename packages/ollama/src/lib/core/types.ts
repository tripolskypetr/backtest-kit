/**
 * Common service type identifiers.
 * Services used across the entire application.
 */
const commonServices = {
    /** Logger service for application-wide logging */
    loggerService: Symbol("loggerService"),
}

/**
 * Base service type identifiers.
 * Core foundational services.
 */
const baseServices = {
    /** Context service for scoped execution contexts */
    contextService: Symbol('contextService'),
};

/**
 * Private service type identifiers.
 * Internal services not exposed in public API.
 */
const privateServices = {
    /** Runner private service for AI provider operations */
    runnerPrivateService: Symbol('runnerPrivateService'),
    /** Outline private service for structured completions */
    outlinePrivateService: Symbol('outlinePrivateService'),
};

/**
 * Public service type identifiers.
 * Services exposed in the public API.
 */
const publicServices = {
    /** Runner public service for context-managed AI operations */
    runnerPublicService: Symbol('runnerPublicService'),
    /** Outline public service for simplified structured completions */
    outlinePublicService: Symbol('outlinePublicService'),
};

const promptServices = {
    signalPromptService: Symbol('signalPromptService'),
}

const markdownServices = {
    outlineMarkdownService: Symbol('outlineMarkdownService'),
}

const optimizerServices = {
    optimizerTemplateService: Symbol('optimizerTemplateService'),
    optimizerSchemaService: Symbol('optimizerSchemaService'),
    optimizerValidationService: Symbol('optimizerValidationService'),
    optimizerConnectionService: Symbol('optimizerConnectionService'),
    optimizerGlobalService: Symbol('optimizerGlobalService'),
}

/**
 * Service type identifier registry for dependency injection.
 *
 * Centralizes all Symbol-based type identifiers used for DI container registration.
 * Organized by service layer: common, base, private, and public services.
 *
 * @example
 * ```typescript
 * import { inject } from "./di";
 * import { TYPES } from "./types";
 * import LoggerService from "../services/common/LoggerService";
 *
 * const logger = inject<LoggerService>(TYPES.loggerService);
 * ```
 */
export const TYPES = {
    ...commonServices,
    ...baseServices,
    ...promptServices,
    ...markdownServices,
    ...optimizerServices,
    ...privateServices,
    ...publicServices,
}
