/**
 * Standard runner completion handler registration.
 *
 * Registers a non-streaming AI completion handler with agent-swarm-kit.
 * This completion type is used for standard request-response AI interactions
 * where the full response is returned at once.
 *
 * Key features:
 * - Standard (non-streaming) completion mode
 * - Delegates to RunnerPrivateService
 * - Supports all registered AI providers
 * - Context-aware provider selection
 *
 * @example
 * ```typescript
 * import { completion } from "agent-swarm-kit";
 * import { CompletionName } from "./enum/CompletionName";
 *
 * const result = await completion(CompletionName.RunnerCompletion, {
 *   messages: [
 *     { role: "system", content: "You are a trading assistant" },
 *     { role: "user", content: "Analyze BTC/USDT" }
 *   ]
 * });
 * ```
 */

import {
  addCompletion,
  type ISwarmCompletionArgs,
  type ISwarmMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { engine } from "../../lib";

addCompletion({
  completionName: CompletionName.RunnerCompletion,
  getCompletion: async (params: ISwarmCompletionArgs): Promise<ISwarmMessage> => {
    return await engine.runnerPrivateService.getCompletion(params);
  },
});
