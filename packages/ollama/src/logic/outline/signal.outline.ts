/**
 * Trading signal outline schema registration.
 *
 * Registers a structured outline for trading signal generation with comprehensive
 * validation rules. This outline enforces a strict schema for AI-generated trading
 * signals, ensuring all required fields are present and correctly formatted.
 *
 * Schema fields:
 * - position: Trading direction ("long", "short", or "wait")
 * - price_open: Entry price for the position
 * - price_stop_loss: Stop-loss price level
 * - price_take_profit: Take-profit price level
 * - minute_estimated_time: Estimated time to reach TP (in minutes)
 * - risk_note: Risk assessment and reasoning (markdown format)
 *
 * Validation rules:
 * 1. All required fields must be present
 * 2. Prices must be positive numbers
 * 3. For LONG: SL < entry < TP
 * 4. For SHORT: TP < entry < SL
 * 5. Estimated time must be <= 360 minutes (6 hours)
 * 6. Wait position skips price validations
 *
 * @example
 * ```typescript
 * import { json } from "agent-swarm-kit";
 * import { OutlineName } from "./enum/OutlineName";
 *
 * const { data } = await json(OutlineName.SignalOutline, [
 *   { role: "user", content: "Analyze BTC/USDT and decide position" }
 * ]);
 *
 * if (data.position !== "wait") {
 *   console.log(`Position: ${data.position}`);
 *   console.log(`Entry: ${data.price_open}`);
 *   console.log(`SL: ${data.price_stop_loss}`);
 *   console.log(`TP: ${data.price_take_profit}`);
 * }
 * ```
 */

import { addOutline, IOutlineMessage } from "agent-swarm-kit";
import { OutlineName } from "../../enum/OutlineName";
import { CompletionName } from "../../enum/CompletionName";
import { zodResponseFormat } from "openai/helpers/zod";
import TSignalSchema, { SignalSchema } from "../../schema/Signal.schema";

addOutline<TSignalSchema, IOutlineMessage[]>({
  outlineName: OutlineName.SignalOutline,
  completion: CompletionName.RunnerOutlineCompletion,
  format: zodResponseFormat(SignalSchema, "position_open_decision"),
  getOutlineHistory: async ({ history, param: messages = [] }) => {
    await history.push(messages);
  },
  validations: [
    {
      validate: ({ data }) => {
        if (!data.position) {
          throw new Error("The position field is not filled");
        }
      },
      docDescription: "Validates that position direction (long/short/wait) is specified.",
    },
    {
      validate: ({ data }) => {
        if (!data.risk_note) {
          throw new Error("The risk_note field is not filled");
        }
      },
      docDescription: "Validates that risk description is provided.",
    },
    {
      validate: ({ data }) => {
        if (
          data.position !== "wait" &&
          (!data.price_open || data.price_open <= 0)
        ) {
          throw new Error(
            "When position='long' or 'short', the price_open field is required and must be positive"
          );
        }
      },
      docDescription: "Validates that opening price is specified and positive when opening a position.",
    },
    {
      validate: ({ data }) => {
        if (
          data.position !== "wait" &&
          (!data.price_stop_loss || data.price_stop_loss <= 0)
        ) {
          throw new Error(
            "When position='long' or 'short', the price_stop_loss field is required and must be positive"
          );
        }
      },
      docDescription: "Validates that stop-loss is specified when opening a position.",
    },
    {
      validate: ({ data }) => {
        if (
          data.position !== "wait" &&
          (!data.price_take_profit || data.price_take_profit <= 0)
        ) {
          throw new Error(
            "When position='long' or 'short', the price_take_profit field is required and must be positive"
          );
        }
      },
      docDescription: "Validates that take-profit is specified when opening a position.",
    },
    {
      validate: ({ data }) => {
        if (data.position === "long" && data.price_open && data.price_stop_loss && data.price_take_profit) {
          if (data.price_stop_loss >= data.price_open) {
            throw new Error(
              "For LONG position, price_stop_loss must be below price_open"
            );
          }
          if (data.price_take_profit <= data.price_open) {
            throw new Error(
              "For LONG position, price_take_profit must be above price_open"
            );
          }
        }
      },
      docDescription: "Validates price correctness for LONG position.",
    },
    {
      validate: ({ data }) => {
        if (data.position === "short" && data.price_open && data.price_stop_loss && data.price_take_profit) {
          if (data.price_stop_loss <= data.price_open) {
            throw new Error(
              "For SHORT position, price_stop_loss must be above price_open"
            );
          }
          if (data.price_take_profit >= data.price_open) {
            throw new Error(
              "For SHORT position, price_take_profit must be below price_open"
            );
          }
        }
      },
      docDescription: "Validates price correctness for SHORT position.",
    },
    {
      validate: ({ data }) => {
        if (
          data.position !== "wait" &&
          (!data.minute_estimated_time || data.minute_estimated_time <= 0)
        ) {
          throw new Error(
            "When position='long' or 'short', the minute_estimated_time field is required and must be positive"
          );
        }
      },
      docDescription:
        "Validates that estimated time to TP is specified when opening a position.",
    },
    {
      validate: ({ data }) => {
        if (data.position !== "wait" && data.minute_estimated_time > 360) {
          throw new Error(
            "Estimated time to reach TP exceeds 6 hours (360 minutes). Use position='wait' for low volatility conditions"
          );
        }
      },
      docDescription:
        "Validates that estimated time to reach TP does not exceed 6 hours.",
    },
  ],
});
