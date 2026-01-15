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

import {
  addCompletion,
  IOutlineCompletionArgs,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { engine } from "../../lib";

addCompletion({
  completionName: CompletionName.RunnerOutlineCompletion,
  getCompletion: async (params: IOutlineCompletionArgs) => {
    return await engine.runnerPrivateService.getOutlineCompletion(params);
  },
  json: true,
});
