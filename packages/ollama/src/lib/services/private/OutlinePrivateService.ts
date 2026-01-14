import { inject } from "../../../lib/core/di";
import LoggerService from "../common/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { IOutlineMessage, json } from "agent-swarm-kit";
import TSignalSchema from "../../../schema/Signal.schema";
import OutlineName from "../../../enum/OutlineName";
import toPlainString from "../../../helpers/toPlainString";

/**
 * Private service for processing structured outline completions.
 *
 * Handles the core logic for executing outline-based AI completions with schema validation.
 * Processes AI responses through the agent-swarm-kit json function to extract and validate
 * structured trading signal data.
 *
 * Key features:
 * - JSON schema validation using agent-swarm-kit
 * - Trading signal extraction and transformation
 * - Type conversion for numeric fields
 * - Markdown formatting cleanup for notes
 * - Error handling for validation failures
 *
 * @example
 * ```typescript
 * const outlinePrivate = inject<OutlinePrivateService>(TYPES.outlinePrivateService);
 * const signal = await outlinePrivate.getCompletion([
 *   { role: "user", content: "Analyze market" }
 * ]);
 * ```
 */
export class OutlinePrivateService {
  /** Logger service for operation tracking */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes outline completion messages and extracts structured signal data.
   *
   * Sends messages to the AI provider, validates the response against the signal schema,
   * and transforms the data into a structured format. Returns null if the AI decides
   * to wait (no position).
   *
   * @param messages - Array of conversation messages for the AI
   * @returns Promise resolving to structured signal data or null if position is "wait"
   * @throws Error if validation fails or AI returns an error
   *
   * @example
   * ```typescript
   * const signal = await outlinePrivateService.getCompletion([
   *   { role: "system", content: "Trading analyst role" },
   *   { role: "user", content: "Market analysis data..." }
   * ]);
   *
   * if (signal) {
   *   console.log(`Position: ${signal.position}`);
   *   console.log(`Entry: ${signal.priceOpen}`);
   *   console.log(`SL: ${signal.priceStopLoss}`);
   *   console.log(`TP: ${signal.priceTakeProfit}`);
   * }
   * ```
   */
  public getCompletion = async (messages: IOutlineMessage[]) => {
    this.loggerService.log("outlinePrivateService getCompletion", {
        messages,
    });
    const { data, resultId, error } = await json<TSignalSchema, IOutlineMessage[]>(
      OutlineName.SignalOutline,
      messages
    );
    if (error) {
      throw new Error(error);
    }
    if (data.position === "wait") {
      return null;
    }
    return {
      id: resultId,
      position: data.position,
      minuteEstimatedTime: +data.minute_estimated_time,
      priceStopLoss: +data.price_stop_loss,
      priceTakeProfit: +data.price_take_profit,
      note: await toPlainString(data.risk_note),
      priceOpen: +data.price_open,
    };
  };
}

export default OutlinePrivateService;
