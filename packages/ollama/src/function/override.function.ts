import { overrideOutline } from "agent-swarm-kit";
import { zodResponseFormat } from "openai/helpers/zod";
import OutlineName from "../enum/OutlineName";
import { type ZodType } from "zod";

/**
 * Overrides the default signal format schema for LLM-generated trading signals.
 *
 * This function allows customization of the structured output format used by the
 * SignalOutline. It replaces the default signal schema with a custom Zod schema,
 * enabling flexible signal structure definitions while maintaining type safety.
 *
 * The override affects all subsequent signal generation calls using SignalOutline
 * until the application restarts or the schema is overridden again.
 *
 * @template ZodInput - The Zod schema type used for validation and type inference
 *
 * @param {ZodInput} format - Custom Zod schema defining the signal structure.
 *                            Must be a valid Zod type (z.object, z.string, etc.)
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { overrideSignalFormat } from '@backtest-kit/ollama';
 *
 * // Override with custom signal schema
 * const CustomSignalSchema = z.object({
 *   position: z.enum(['long', 'short', 'wait']),
 *   price_open: z.number(),
 *   confidence: z.number().min(0).max(100),
 *   custom_field: z.string()
 * });
 *
 * overrideSignalFormat(CustomSignalSchema);
 * ```
 *
 * @example
 * ```typescript
 * // Override with simplified schema
 * const SimpleSignalSchema = z.object({
 *   action: z.enum(['buy', 'sell', 'hold']),
 *   price: z.number()
 * });
 *
 * overrideSignalFormat(SimpleSignalSchema);
 * ```
 *
 * @remarks
 * - The custom schema replaces the default SignalSchema completely
 * - Schema name in OpenAI format is always "position_open_decision"
 * - Changes persist until application restart or next override
 * - Ensure the custom schema matches your signal processing logic
 *
 * @see {@link SignalSchema} - Default signal schema structure
 * @see {@link OutlineName.SignalOutline} - Outline being overridden
 */
export function overrideSignalFormat<ZodInput extends ZodType>(format: ZodInput) {
    overrideOutline({
        outlineName: OutlineName.SignalOutline,
        format: zodResponseFormat(format, "position_open_decision"),
    })
}
