import { MessageModel } from "../model/Message.model";
import engine from "../lib";
import { getContext, getMode, getSymbol } from "backtest-kit";
import { Prompt } from "../classes/Prompt";

const METHOD_NAME_SIGNAL = "history.commitSignalPromptHistory";

/**
 * Commits signal prompt history to the message array.
 *
 * Extracts trading context from ExecutionContext and MethodContext,
 * then adds signal-specific system prompts at the beginning and user prompt
 * at the end of the history array if they are not empty.
 *
 * Context extraction:
 * - symbol: From getSymbol()
 * - backtest mode: From getMode()
 * - strategyName, exchangeName, frameName: From getContext()
 *
 * @param source - Prompt object containing path to .cjs module
 * @param history - Message array to append prompts to
 * @returns Promise that resolves when prompts are added
 * @throws Error if ExecutionContext or MethodContext is not active
 *
 * @example
 * ```typescript
 * const messages: MessageModel[] = [];
 * const prompt = Prompt.fromPath("signal.prompt.cjs");
 * await commitSignalPromptHistory(prompt, messages);
 * // messages now contains system prompts at start and user prompt at end
 * ```
 */
export async function commitSignalPromptHistory(
  source: Prompt,
  history: MessageModel[],
): Promise<void> {
  engine.loggerService.log(METHOD_NAME_SIGNAL, {
    source,
  });

  const symbol = await getSymbol();
  const { strategyName, exchangeName, frameName } = await getContext();
  const mode = await getMode();
  const isBacktest = mode === "backtest";

  const code = engine.promptCacheService.readModule(source);

  const systemPrompts = await engine.resolvePromptService.getSystemPrompt(
    code,
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );
  const userPrompt = await engine.resolvePromptService.getUserPrompt(
    code,
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
