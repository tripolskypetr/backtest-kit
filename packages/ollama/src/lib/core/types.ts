/**
 * Base service type identifiers.
 * Core foundational services.
 */
const baseServices = {
    /** Context service for scoped execution contexts */
    contextService: Symbol('contextService'),
    loggerService: Symbol("loggerService"),
};

/**
 * Private service type identifiers.
 * Internal services not exposed in public API.
 */
const privateServices = {
    /** Runner private service for AI provider operations */
    runnerPrivateService: Symbol('runnerPrivateService'),
};

/**
 * Public service type identifiers.
 * Services exposed in the public API.
 */
const publicServices = {
    /** Runner public service for context-managed AI operations */
    runnerPublicService: Symbol('runnerPublicService'),
};

const promptServices = {
    resolvePromptService: Symbol('resolvePromptService'),
}

const cacheServices = {
    promptCacheService: Symbol('promptCacheService'),
}

const markdownServices = {
    outlineMarkdownService: Symbol('outlineMarkdownService'),
}

const templateServices = {
    optimizerTemplateService: Symbol('optimizerTemplateService'),
}

const schemaServices = {
    optimizerSchemaService: Symbol('optimizerSchemaService'),
}

const validationServices = {
    optimizerValidationService: Symbol('optimizerValidationService'),
}

const connectionServices = {
    optimizerConnectionService: Symbol('optimizerConnectionService'),
}

const globalServices = {
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
    ...baseServices,
    ...promptServices,
    ...cacheServices,
    ...markdownServices,
    ...templateServices,
    ...schemaServices,
    ...validationServices,
    ...connectionServices,
    ...globalServices,
    ...privateServices,
    ...publicServices,
}
