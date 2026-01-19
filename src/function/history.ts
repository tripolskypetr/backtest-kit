import { MessageModel } from "../model/Message.model";
import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib/index";

const METHOD_NAME_SIGNAL = "history.commitSignalPromptHistory";
const METHOD_NAME_RISK = "history.commitRiskPromptHistory";
const METHOD_NAME_TRAILING_TAKE = "history.commitTrailingTakePromptHistory";
const METHOD_NAME_TRAILING_STOP = "history.commitTrailingStopPromptHistory";
const METHOD_NAME_PARTIAL_PROFIT = "history.commitPartialProfitPromptHistory";
const METHOD_NAME_PARTIAL_LOSS = "history.commitPartialLossPromptHistory";
const METHOD_NAME_BREAKEVEN = "history.commitBreakevenPromptHistory";
const METHOD_NAME_SCHEDULE_CANCEL = "history.commitScheduleCancelPromptHistory";

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
  backtest.loggerService.log(METHOD_NAME_SIGNAL, {
    symbol,
  });

  if (!ExecutionContextService.hasContext()) {
    throw new Error("commitSignalPromptHistory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("commitSignalPromptHistory requires a method context");
  }

  const { backtest: isBacktest } = backtest.executionContextService.context;
  const { strategyName, exchangeName, frameName } =
    backtest.methodContextService.context;

  const systemPrompts = await backtest.signalPromptService.getSystemPrompt(
    symbol,
    strategyName,
    exchangeName,
    frameName,
    isBacktest,
  );
  const userPrompt = await backtest.signalPromptService.getUserPrompt(
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
