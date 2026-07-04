import { MessageModel } from "../model/Message.model";
import engine from "../lib";
import { getContext, getMode, getSymbol } from "backtest-kit";
import { Module } from "../classes/Module";
import { Prompt } from "../classes/Prompt";

const METHOD_NAME_SIGNAL = "history.commitSignalPromptHistory";

const GET_PROMPT_FN = async (source: Prompt | Module) => {
  if (Prompt.isPrompt(source)) {
    return source;
  }
  if (Module.isModule(source)) {
    return await engine.promptCacheService.readModule(source);
  }
  throw new Error("Source must be a Prompt or Module instance");
};


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
 * @param source - Module object containing path to .cjs module
 * @param history - Message array to append prompts to
 * @returns Promise that resolves when prompts are added
 * @throws Error if ExecutionContext or MethodContext is not active
 *
 * ```
 */
export async function commitPrompt(
  source: Module | Prompt,
  history: MessageModel[],
): Promise<void> {
  engine.loggerService.log(METHOD_NAME_SIGNAL, {
    source,
  });

  const symbol = await getSymbol();
  const { strategyName, exchangeName, frameName } = await getContext();
  const mode = await getMode();
  const isBacktest = mode === "backtest";

  const prompt = await GET_PROMPT_FN(source);

  const systemPrompts = await engine.resolvePromptService.getSystemPrompt(
    prompt,
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );

  const userPrompt = await engine.resolvePromptService.getUserPrompt(
    prompt,
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );

  if (systemPrompts.length > 0) {
    // Single unshift with spread: per-item unshift in a loop would REVERSE
    // the system prompt order at the head of the history.
    const systemMessages = systemPrompts
      .filter((content) => content.trim())
      .map(
        (content): MessageModel => ({
          role: "system",
          content,
        })
      );
    history.unshift(...systemMessages);
  }

  if (userPrompt && userPrompt.trim()) {
    history.push({
      role: "user",
      content: userPrompt,
    });
  }
}
