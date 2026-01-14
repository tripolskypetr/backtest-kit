import { inject } from "../../../lib/core/di";
import LoggerService from "../common/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { IOutlineMessage } from "agent-swarm-kit";
import ContextService from "../base/ContextService";
import OutlinePrivateService from "../private/OutlinePrivateService";
import InferenceName from "../../../enum/InferenceName";

/**
 * Public-facing service for structured AI outline completions.
 *
 * Provides a simplified interface for executing structured AI completions with schema validation.
 * Handles context creation and isolation for outline-based operations.
 * Used for extracting structured data from AI responses (e.g., trading signals).
 *
 * Key features:
 * - Simplified API with automatic context management
 * - JSON schema validation for structured outputs
 * - Support for multiple AI providers
 * - Optional API key parameter with fallback
 * - Logging integration
 *
 * @example
 * ```typescript
 * import { engine } from "./lib";
 * import { InferenceName } from "./enum/InferenceName";
 *
 * const signal = await engine.outlinePublicService.getCompletion(
 *   [{ role: "user", content: "Analyze BTC/USDT and decide position" }],
 *   InferenceName.ClaudeInference,
 *   "claude-3-5-sonnet-20240620",
 *   "sk-ant-..."
 * );
 *
 * // Returns structured signal:
 * // {
 * //   position: "long",
 * //   priceOpen: 50000,
 * //   priceStopLoss: 48000,
 * //   priceTakeProfit: 52000,
 * //   minuteEstimatedTime: 120,
 * //   note: "Strong bullish momentum..."
 * // }
 * ```
 */
export class OutlinePublicService {
  /** Logger service for operation tracking */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /** Private service handling outline completion logic */
  private readonly outlinePrivateService = inject<OutlinePrivateService>(
    TYPES.outlinePrivateService
  );

  /**
   * Executes a structured outline completion with schema validation.
   *
   * Creates an isolated execution context and processes messages through the AI provider
   * to generate a structured response conforming to a predefined schema.
   *
   * @param messages - Array of conversation messages for the AI
   * @param inference - AI provider identifier
   * @param model - Model name/identifier
   * @param apiKey - Optional API key(s), required for most providers
   * @returns Promise resolving to structured signal data or null if position is "wait"
   *
   * @example
   * ```typescript
   * const result = await outlinePublicService.getCompletion(
   *   [
   *     { role: "system", content: "You are a trading analyst" },
   *     { role: "user", content: "Analyze current BTC market" }
   *   ],
   *   InferenceName.DeepseekInference,
   *   "deepseek-chat",
   *   "sk-..."
   * );
   * ```
   */
  public getCompletion = async (
    messages: IOutlineMessage[],
    inference: InferenceName,
    model: string,
    apiKey?: string | string[]
  ) => {
    this.loggerService.log("outlinePublicService getCompletion", {
      messages,
      model,
      apiKey,
      inference,
    });
    return await ContextService.runInContext(
      async () => {
        return await this.outlinePrivateService.getCompletion(messages);
      },
      {
        apiKey: apiKey!,
        inference,
        model,
      }
    );
  };
}

export default OutlinePublicService;
