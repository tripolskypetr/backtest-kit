import {
  addCompletion,
  ISwarmCompletionArgs,
  type ISwarmMessage,
} from "agent-swarm-kit";
import { CompletionName } from "../../enum/CompletionName";
import { engine } from "../../lib";
import { timeout } from "functools-kit";

const INFERENCE_TIMEOUT = 35_000;

const LOCAL_RUNNER_FN = timeout(
  async (params: ISwarmCompletionArgs): Promise<ISwarmMessage> => {
    return await engine.runnerPrivateService.getStreamCompletion(params);
  },
  INFERENCE_TIMEOUT
);

/**
 * Streaming runner completion handler registration.
 *
 * Registers a streaming AI completion handler with agent-swarm-kit.
 * This completion type enables real-time token streaming from AI providers
 * that support it (OpenAI, Claude, etc.), with automatic accumulation into
 * a complete response.
 *
 * Key features:
 * - Streaming completion mode for real-time responses
 * - Automatic response accumulation
 * - Delegates to RunnerPrivateService
 * - Supports streaming-capable AI providers
 *
 * @example
 * ```typescript
 * import { completion } from "agent-swarm-kit";
 * import { CompletionName } from "./enum/CompletionName";
 *
 * const result = await completion(CompletionName.RunnerStreamCompletion, {
 *   messages: [
 *     { role: "user", content: "Generate trading analysis" }
 *   ]
 * });
 * // Response is accumulated from stream
 * ```
 */
addCompletion({
  completionName: CompletionName.RunnerStreamCompletion,
  getCompletion: async (
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> => {
    const result = await LOCAL_RUNNER_FN(params);
    if (typeof result === "symbol") {
      throw new Error(`${CompletionName.RunnerCompletion} inference timeout`);
    }
    return result;
  },
});
