import fs from "fs/promises";
import path from "path";
import backtest from "../lib";

/** Unique identifier for a dump result. Can be a string or numeric ID. */
type ResultId = string | number;

const WARN_KB = 30;

const DUMP_MESSAGES_METHOD_NAME = "dump.dumpMessages";

/** Role of the message sender in the chat history. */
type BaseRole = "assistant" | "system" | "user";

/**
 * A single message in the chat history.
 * Used to represent system instructions, user input, or LLM responses.
 */
interface Message<Role extends BaseRole = BaseRole> {
  /**
   * The sender of the message.
   * - "system": System instructions and context
   * - "user": User input and questions
   * - "assistant": LLM responses
   */
  role: Role;

  /**
   * The text content of the message.
   * Contains the actual message text sent or received.
   */
  content: string;
}


/**
 * Dumps chat history and result data to markdown files in a structured directory.
 *
 * Creates a subfolder named after `resultId` inside `outputDir`.
 * If the subfolder already exists, the function returns early without overwriting.
 * Writes:
 * - `00_system_prompt.md` — system messages and output data summary
 * - `NN_user_message.md` — each user message as a separate file
 * - `NN_llm_output.md` — final LLM output data
 *
 * Warns via logger if any user message exceeds 30 KB.
 *
 * @param resultId - Unique identifier for the result (used as subfolder name)
 * @param history - Full chat history containing system, user, and assistant messages
 * @param result - Structured output data to include in the dump
 * @param outputDir - Base directory for output files (default: `./dump/strategy`)
 * @returns Promise that resolves when all files are written
 *
 * @example
 * ```typescript
 * import { dumpMessages } from "backtest-kit";
 *
 * await dumpMessages("result-123", history, { profit: 42 });
 * ```
 */
export async function dumpMessages<Data extends object = any>(
  resultId: ResultId,
  history: Message[],
  result: Data,
  outputDir = "./dump/strategy",
) {
  backtest.loggerService.info(DUMP_MESSAGES_METHOD_NAME, {
    resultId,
    outputDir,
  });

  // Extract system messages and system reminders from existing data
  const systemMessages = history.filter((m) => m.role === "system");
  const userMessages = history.filter((m) => m.role === "user");
  const subfolderPath = path.join(outputDir, String(resultId));

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
      summary += `**ResultId**: ${resultId}\n`;
      summary += "\n";
    }

    if (result) {
      summary += "## Output Data\n\n";
      summary += "```json\n";
      summary += JSON.stringify(result, null, 2);
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
              `User message ${idx + 1} is ${messageSizeBytes} bytes (${messageSizeKb}kb), which exceeds warning limit`,
            );
            backtest.loggerService.warn(DUMP_MESSAGES_METHOD_NAME, {
              resultId,
              messageIndex: idx + 1,
              messageSizeBytes,
              messageSizeKb,
            });
          }
        }

        let content = `# User Input ${idx + 1}\n\n`;
        content += `**ResultId**: ${resultId}\n\n`;
        content += message.content;
        content += "\n";

        await fs.writeFile(contentFilePath, content, "utf8");
      }),
    );
  }

  {
    const messageNum = String(userMessages.length + 1).padStart(2, "0");
    const contentFileName = `${messageNum}_llm_output.md`;
    const contentFilePath = path.join(subfolderPath, contentFileName);

    let content = "# Full Outline Result\n\n";
    content += `**ResultId**: ${resultId}\n\n`;

    if (result) {
      content += "## Output Data\n\n";
      content += "```json\n";
      content += JSON.stringify(result, null, 2);
      content += "\n```\n";
    }

    await fs.writeFile(contentFilePath, content, "utf8");
  }
}
