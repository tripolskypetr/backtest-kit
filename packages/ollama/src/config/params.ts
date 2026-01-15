/**
 * Global configuration parameters for the Ollama package.
 *
 * Provides runtime configuration via environment variables with sensible defaults.
 * All configuration values are immutable once initialized.
 *
 * Available configurations:
 * - CC_ENABLE_DEBUG: Enable detailed debug logging
 * - CC_ENABLE_THINKING: Enable AI extended reasoning mode
 *
 * @example
 * ```typescript
 * import { GLOBAL_CONFIG } from "./config/params";
 *
 * if (GLOBAL_CONFIG.CC_ENABLE_DEBUG) {
 *   console.log("Debug mode enabled");
 * }
 *
 * if (GLOBAL_CONFIG.CC_ENABLE_THINKING) {
 *   // AI will provide reasoning before responses
 * }
 * ```
 */

declare function parseInt(value: unknown): number;

/**
 * Mutable global configuration object.
 * Values are read from environment variables at initialization.
 */
export const GLOBAL_CONFIG = {
  /**
   * Enable debug mode for detailed logging.
   * When enabled, additional debug information will be logged.
   * Can be set via CC_ENABLE_DEBUG environment variable.
   * Default: false
   */
  CC_ENABLE_DEBUG: "CC_ENABLE_DEBUG" in process.env ? !!parseInt(process.env.CC_ENABLE_DEBUG) : false,
  /**
   * Enable thinking mode for AI responses.
   * When enabled, the AI will provide extended reasoning before answering.
   * Can be set via CC_ENABLE_THINKING environment variable.
   * Default: false
   */
  CC_ENABLE_THINKING: "CC_ENABLE_THINKING" in process.env ? !!parseInt(process.env.CC_ENABLE_THINKING) : false,
};

/**
 * Frozen copy of default configuration values.
 * Use this to restore configuration to defaults.
 */
export const DEFAULT_CONFIG = Object.freeze({...GLOBAL_CONFIG});

/**
 * Type for global configuration object.
 * Ensures type safety when accessing configuration values.
 */
export type GlobalConfig = typeof GLOBAL_CONFIG;
