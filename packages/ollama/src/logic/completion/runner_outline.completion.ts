import { addCompletion, IOutlineCompletionArgs } from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { engine } from "../../lib";
import { timeout } from "functools-kit";

const INFERENCE_TIMEOUT = 35_000;

const LOCAL_RUNNER_FN = timeout(async (params: IOutlineCompletionArgs) => {
  return await engine.runnerPrivateService.getOutlineCompletion(params);
}, INFERENCE_TIMEOUT);

/**
 * Outline runner completion handler registration.
 *
 * Registers a structured outline completion handler with agent-swarm-kit.
 * This completion type enforces JSON schema validation on AI responses,
 * ensuring they conform to a predefined structure. Essential for extracting
 * structured data from AI responses (e.g., trading signals with specific fields).
 *
 * Key features:
 * - JSON schema validation enabled (json: true)
 * - Structured output enforcement
 * - Type-safe response parsing
 * - Automatic validation with retry on failure
 * - Delegates to RunnerPrivateService
 *
 * @example
 * ```typescript
 * import { completion } from "agent-swarm-kit";
 * import { CompletionName } from "./enum/CompletionName";
 *
 * const result = await completion(CompletionName.RunnerOutlineCompletion, {
 *   messages: [
 *     { role: "user", content: "Decide trading position" }
 *   ]
 * });
 * // Returns structured data validated against schema
 * ```
 */
addCompletion({
  completionName: CompletionName.RunnerOutlineCompletion,
  getCompletion: async (params: IOutlineCompletionArgs) => {
    const result = await LOCAL_RUNNER_FN(params);
    if (typeof result === "symbol") {
      throw new Error(
        `${CompletionName.RunnerOutlineCompletion} inference timeout`
      );
    }
    return result;
  },
  json: true,
});
