import { MessageModel } from "../model/Message.model";
import engine from "../lib";
import { getContext, getMode } from "backtest-kit";

const METHOD_NAME_SIGNAL = "history.commitSignalPromptHistory";

/**
 * Commits signal prompt history to the message array.
 *
 * Extracts trading context from ExecutionContext and MethodContext,
 * then adds signal-specific system prompts at the beginning and user prompt
 * at the end of the history array if they are not empty.
 *
 * Context extraction:
 * - symbol: Provided as parameter for debugging convenience
 * - backtest mode: From ExecutionContext
 * - strategyName, exchangeName, frameName: From MethodContext
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT") for debugging convenience
 * @param history - Message array to append prompts to
 * @returns Promise that resolves when prompts are added
 * @throws Error if ExecutionContext or MethodContext is not active
 *
 * @example
 * ```typescript
 * const messages: MessageModel[] = [];
 * await commitSignalPromptHistory("BTCUSDT", messages);
 * // messages now contains system prompts at start and user prompt at end
 * ```
 */
export async function commitSignalPromptHistory(
  symbol: string,
  history: MessageModel[],
): Promise<void> {
  engine.loggerService.log(METHOD_NAME_SIGNAL, {
    symbol,
  });

  const { strategyName, exchangeName, frameName } = await getContext();
  const mode = await getMode();

  const isBacktest = mode === "backtest";

  const systemPrompts = await engine.signalPromptService.getSystemPrompt(
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );
  const userPrompt = await engine.signalPromptService.getUserPrompt(
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );

  if (systemPrompts.length > 0) {
    for (const content of systemPrompts) {
      history.unshift({
        role: "system",
        content,
      });
    }
  }

  if (userPrompt && userPrompt.trim() !== "") {
    history.push({
      role: "user",
      content: userPrompt,
    });
  }
}
