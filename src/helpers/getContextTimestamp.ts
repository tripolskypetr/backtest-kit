import ContextMetaService from "../lib/services/meta/ContextMetaService";

/**
 * Global instance of ContextMetaService used by getContextTimestamp.
 * Ensures a single source of truth for context-aware timestamps across the application.
 */
const CONTEXT_META_SERVICE = new ContextMetaService();

/**
 * Retrieves the current timestamp based on the execution context.
 * If an execution context is active (e.g., during a backtest), it returns the timestamp from the context to ensure consistency with the simulated time.
 * If no execution context is active (e.g., during live operation), it returns the current real-world timestamp.
 * This function helps maintain accurate timing for logs, metrics, and other time-sensitive operations across both live and backtest modes.
 * @return {number} The current timestamp in milliseconds, either from the execution context or the real-world clock.
 */
export const getContextTimestamp = () => {
    return CONTEXT_META_SERVICE.getContextTimestamp();
}
