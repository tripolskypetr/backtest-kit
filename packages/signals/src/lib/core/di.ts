/**
 * Dependency injection container for signals library.
 *
 * Creates an isolated DI container using di-kit for managing service instances.
 * Provides methods for dependency registration, injection, and initialization.
 *
 * @module lib/core/di
 */

import { createActivator } from "di-kit";

/**
 * DI container exports for signals library.
 *
 * - provide: Register service factory in DI container
 * - inject: Retrieve service instance from container
 * - init: Initialize all registered services
 * - override: Replace existing service registration
 */
export const { provide, inject, init, override } = createActivator("signal");
