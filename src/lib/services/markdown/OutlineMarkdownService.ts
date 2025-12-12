import { ISignalDto } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import { MessageModel } from "../../../model/Message.model";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { promises as fs } from "fs";
import path from "path";

/**
 * Unique identifier for outline result.
 * Can be string or number for flexible ID formats.
 */
type ResultId = string | number;

/**
 * Warning threshold for message size in kilobytes.
 * Messages exceeding this size trigger console warnings.
 */
const WARN_KB = 20;

/**
 * Internal function for dumping signal data to markdown files.
 * Creates a directory structure with system prompts, user messages, and LLM output.
 *
 * @param signalId - Unique identifier for the result
 * @param history - Array of message models from LLM conversation
 * @param signal - Signal DTO with trade parameters
 * @param outputDir - Output directory path (default: "./dump/strategy")
 * @returns Promise that resolves when all files are written
 */
const DUMP_SIGNAL_FN = async <Data extends ISignalDto>(
  signalId: ResultId,
  history: MessageModel[],
  signal: Data,
  outputDir = "./dump/strategy"
) => {
  // Extract system messages and system reminders from existing data
  const systemMessages = history.filter((m) => m.role === "system");
  const userMessages = history.filter((m) => m.role === "user");
  const subfolderPath = path.join(outputDir, String(signalId));

  try {
    await fs.access(subfolderPath);
    return;
  } catch {
    await fs.mkdir(subfolderPath, { recursive: true });
  }

  {
    let summary = "# Outline Result Summary\n";

    {
      summary += "\n";
      summary += `**ResultId**: ${String(signalId)}\n`;
      summary += "\n";
    }

    if (signal) {
      summary += "## Output Data\n\n";
      summary += "```json\n";
      summary += JSON.stringify(signal, null, 2);
      summary += "\n```\n\n";
    }

    // Add system messages to summary
    if (systemMessages.length > 0) {
      summary += "## System Messages\n\n";
      systemMessages.forEach((msg, idx) => {
        summary += `### System Message ${idx + 1}\n\n`;
        summary += msg.content;
        summary += "\n";
      });
    }

    const summaryFile = path.join(subfolderPath, "00_system_prompt.md");
    await fs.writeFile(summaryFile, summary, "utf8");
  }

  {
    await Promise.all(
      Array.from(userMessages.entries()).map(async ([idx, message]) => {
        const messageNum = String(idx + 1).padStart(2, "0");
        const contentFileName = `${messageNum}_user_message.md`;
        const contentFilePath = path.join(subfolderPath, contentFileName);

        {
          const messageSizeBytes = Buffer.byteLength(message.content, "utf8");
          const messageSizeKb = Math.floor(messageSizeBytes / 1024);
          if (messageSizeKb > WARN_KB) {
            console.warn(
              `User message ${
                idx + 1
              } is ${messageSizeBytes} bytes (${messageSizeKb}kb), which exceeds warning limit`
            );
          }
        }

        let content = `# User Input ${idx + 1}\n\n`;
        content += `**ResultId**: ${String(signalId)}\n\n`;
        content += message.content;
        content += "\n";

        await fs.writeFile(contentFilePath, content, "utf8");
      })
    );
  }

  {
    const messageNum = String(userMessages.length + 1).padStart(2, "0");
    const contentFileName = `${messageNum}_llm_output.md`;
    const contentFilePath = path.join(subfolderPath, contentFileName);

    let content = "# Full Outline Result\n\n";
    content += `**ResultId**: ${String(signalId)}\n\n`;

    if (signal) {
      content += "## Output Data\n\n";
      content += "```json\n";
      content += JSON.stringify(signal, null, 2);
      content += "\n```\n";
    }

    await fs.writeFile(contentFilePath, content, "utf8");
  }
};

/**
 * Service for generating markdown documentation from LLM outline results.
 * Used by AI Strategy Optimizer to save debug logs and conversation history.
 *
 * Creates directory structure:
 * - ./dump/strategy/{signalId}/00_system_prompt.md - System messages and output data
 * - ./dump/strategy/{signalId}/01_user_message.md - First user input
 * - ./dump/strategy/{signalId}/02_user_message.md - Second user input
 * - ./dump/strategy/{signalId}/XX_llm_output.md - Final LLM output
 */
export class OutlineMarkdownService {
  /** Logger service injected via DI */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Dumps signal data and conversation history to markdown files.
   * Skips if directory already exists to avoid overwriting previous results.
   *
   * Generated files:
   * - 00_system_prompt.md - System messages and output summary
   * - XX_user_message.md - Each user message in separate file (numbered)
   * - XX_llm_output.md - Final LLM output with signal data
   *
   * @param signalId - Unique identifier for the result (used as directory name)
   * @param history - Array of message models from LLM conversation
   * @param signal - Signal DTO with trade parameters (priceOpen, TP, SL, etc.)
   * @param outputDir - Output directory path (default: "./dump/strategy")
   * @returns Promise that resolves when all files are written
   *
   * @example
   * ```typescript
   * await outlineService.dumpSignal(
   *   "strategy-1",
   *   conversationHistory,
   *   { position: "long", priceTakeProfit: 51000, priceStopLoss: 49000, minuteEstimatedTime: 60 }
   * );
   * // Creates: ./dump/strategy/strategy-1/00_system_prompt.md
   * //          ./dump/strategy/strategy-1/01_user_message.md
   * //          ./dump/strategy/strategy-1/02_llm_output.md
   * ```
   */
  public dumpSignal = async (
    signalId: ResultId,
    history: MessageModel[],
    signal: ISignalDto,
    outputDir = "./dump/strategy"
  ) => {
    this.loggerService.log("outlineMarkdownService dumpSignal", {
      signalId,
      history,
      signal,
      outputDir,
    });
    return await DUMP_SIGNAL_FN(signalId, history, signal, outputDir);
  };
}

export default OutlineMarkdownService;
