import { createActivator } from "di-kit";

/**
 * Dependency injection activator for the Ollama package.
 *
 * Creates a scoped DI container using di-kit with the namespace "ollama".
 * Provides functions for service registration, injection, initialization, and overriding.
 *
 * Exported functions:
 * - provide: Register a service implementation in the container
 * - inject: Retrieve a service instance from the container
 * - init: Initialize the DI container (must be called before using services)
 * - override: Replace an existing service registration with a new implementation
 *
 * @example
 * ```typescript
 * import { provide, inject, init } from "./core/di";
 * import { TYPES } from "./core/types";
 *
 * // Register service
 * provide(TYPES.loggerService, () => new LoggerService());
 *
 * // Initialize container
 * init();
 *
 * // Inject service
 * const logger = inject<LoggerService>(TYPES.loggerService);
 * ```
 */
export const { provide, inject, init, override } = createActivator("ollama");
