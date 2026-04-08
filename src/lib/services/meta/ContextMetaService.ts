import { singleton } from "di-singleton";
import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExecutionContextService, { TExecutionContextService } from "../context/ExecutionContextService";
import alignToInterval from "../../../utils/alignToInterval";

/**
 * ContextMetaService provides metadata about the current execution context.
 *
 * Currently provides:
 * - getContextTimestamp(): Returns the current context timestamp, aligned to 1 minute intervals.
 *
 * Used by markdown/jsonl reports to obtain the current timestamp for labeling and logging purposes.
 *
 * @example
 * ```typescript
 * const contextMetaService = inject<TContextMetaService>(TYPES.contextMetaService);
 */
export const ContextMetaService = singleton(class {
    readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
    readonly executionContextService = inject<TExecutionContextService>(TYPES.executionContextService);

    /**
     * Gets the current context timestamp.
     *
     * If an execution context exists, returns the timestamp of the current context's "when" property.
     * If no execution context exists, returns the current time aligned to the nearest 1 minute interval.
     * This ensures that timestamps used in reports are consistent and aligned, even when called outside of an execution context.
     * @returns {number} The current context timestamp in milliseconds since the Unix epoch.
     */
    public getContextTimestamp = () => {
        this.loggerService.log("contextMetaService getContextTimestamp");
        if (ExecutionContextService.hasContext()) {
            return this.executionContextService.context.when.getTime();
        }
        return alignToInterval(new Date(), "1m").getTime();
    }
});

/**
 * Type helper for ContextMetaService instance.
 * Used for dependency injection type annotations.
 * @example
 * ```typescript
 * const contextMetaService = inject<TContextMetaService>(TYPES.contextMetaService);
 * const timestamp = contextMetaService.getContextTimestamp();
 * console.log("Current context timestamp:", timestamp);
 * ```
 */
export type TContextMetaService = InstanceType<typeof ContextMetaService>;

export default ContextMetaService;
