import fs from "fs/promises";
import { join, dirname } from "path";
import backtest from "../lib";
import { Memory } from "./Memory";
import MessageModel from "../model/Message.model";

const DUMP_MEMORY_INSTANCE_METHOD_NAME = "DumpMemoryInstance.dumpAgentAnswer";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME = "DumpMarkdownInstance.dumpAgentAnswer";
const DUMP_ADAPTER_METHOD_NAME_USE_MARKDOWN = "DumpAdapter.useMarkdown";
const DUMP_ADAPTER_METHOD_NAME_USE_MEMORY = "DumpAdapter.useMemory";
const DUMP_ADAPTER_METHOD_NAME_USE_DUMMY = "DumpAdapter.useDummy";
const DUMP_ADAPTER_METHOD_NAME_USE_ADAPTER = "DumpAdapter.useDumpAdapter";


/**
 * Renders a single MessageModel as a markdown section.
 * tool_calls are rendered as a fenced JSON block.
 */
const RENDER_MESSAGE_FN = (message: MessageModel, index: number): string => {
  let section = `## [${index + 1}] ${message.role}`;
  if (message.tool_call_id) {
    section += ` (call_id: ${message.tool_call_id})`;
  }
  section += "\n\n";
  if (message.content) {
    section += message.content;
    section += "\n";
  }
  if (message.tool_calls && message.tool_calls.length > 0) {
    section += "\n### Tool Calls\n\n";
    section += "```json\n";
    section += JSON.stringify(message.tool_calls, null, 2);
    section += "\n```\n";
  }
  return section;
};

/**
 * Context required to identify a dump entry.
 * Compatible with both Memory (signalId + bucketName + dumpId as memoryId)
 * and Markdown (path: ./dump/agent/{bucketName}/{signalId}/{dumpId}.md).
 */
export interface IDumpContext {
  /** Signal identifier — scopes the dump to a specific trade */
  signalId: string;
  /** Bucket name — groups dumps by strategy or agent name */
  bucketName: string;
  /** Unique identifier for this agent invocation */
  dumpId: string;
}

/**
 * Interface for dump instance implementations.
 * Defines the contract for memory, markdown, and dummy backends.
 */
export interface IDumpInstance {
  /**
   * Persist the full message history of one agent invocation.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param context - Scope identifiers for the dump entry
   */
  dumpAgentAnswer(messages: MessageModel[], context: IDumpContext): Promise<void>;
}

/**
 * Constructor type for dump instance implementations.
 * Used for swapping backends via DumpAdapter.useAdapter().
 */
export type TDumpInstanceCtor = new () => IDumpInstance;

/**
 * Memory-backed dump instance.
 * Stores only the last assistant message via Memory.writeMemory.
 * Useful for downstream LLM retrieval via Memory.searchMemory.
 */
export class DumpMemoryInstance implements IDumpInstance {
  /**
   * Stores the last message of the agent invocation in Memory.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * If the message list is empty, the call is a no-op.
   * @param messages - Full chat history; only the last entry is persisted
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpAgentAnswer(
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME, {
      messagesLen: messages.length,
      context,
    });
    const lastMessage = messages[messages.length - 1] ?? null;
    if (!lastMessage) {
      return;
    }
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: lastMessage,
    });
  }
}

/**
 * Markdown-backed dump instance.
 * Writes all messages of one agent invocation into a single .md file.
 *
 * Storage layout:
 *   ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
 *
 * One file per invocation — readable by both LLM and developer.
 * All roles (system, user, assistant, tool) are rendered as numbered sections.
 * tool_calls are rendered as fenced JSON blocks.
 * If the file already exists, the call is skipped.
 */
export class DumpMarkdownInstance implements IDumpInstance {
  /**
   * Writes all messages of the agent invocation to a single markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param context - Scope identifiers used to construct the file path
   */
  public async dumpAgentAnswer(
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME, {
      messagesLen: messages.length,
      context,
    });
    const filePath = join(
      "./dump/agent",
      context.signalId,
      context.bucketName,
      `${context.dumpId}.md`,
    );
    try {
      await fs.access(filePath);
      return;
    } catch {
      await fs.mkdir(dirname(filePath), { recursive: true });
    }
    let content = `# Agent Reasoning — ${context.dumpId}\n\n`;
    content += `**signalId**: ${context.signalId}  \n`;
    content += `**bucketName**: ${context.bucketName}\n\n`;
    for (let i = 0; i < messages.length; i++) {
      content += RENDER_MESSAGE_FN(messages[i], i);
      content += "\n";
    }
    await fs.writeFile(filePath, content, "utf8");
  }
}

/**
 * No-op dump instance that discards all writes.
 * Used for disabling dumps in tests or dry-run scenarios.
 */
export class DumpDummyInstance implements IDumpInstance {
  public async dumpAgentAnswer(): Promise<void> {
    void 0;
  }
}

/**
 * Facade for dump instances with swappable backend.
 * Default backend: DumpMarkdownInstance.
 *
 * Switch backends via:
 * - useMarkdown() — write one .md file per invocation (default)
 * - useMemory()   — store last assistant message in Memory
 * - useDummy()    — no-op, discard all writes
 * - useDumpAdapter(Ctor) — inject a custom implementation
 */
export class DumpAdapter implements IDumpInstance {
  private _instance: IDumpInstance = new DumpMarkdownInstance();

  /**
   * Persist the full message history of one agent invocation.
   * Delegates to the active backend instance.
   */
  public dumpAgentAnswer = async (
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> => {
    return await this._instance.dumpAgentAnswer(messages, context);
  };

  /**
   * Switches to markdown backend (default).
   * Writes one .md file per invocation to ./dump/agent/{bucketName}/{signalId}/{memoryId}.md
   */
  public useMarkdown = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_MARKDOWN);
    this._instance = new DumpMarkdownInstance();
  };

  /**
   * Switches to memory backend.
   * Stores the last assistant message via Memory.writeMemory.
   */
  public useMemory = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._instance = new DumpMemoryInstance();
  };

  /**
   * Switches to dummy backend.
   * All writes are discarded.
   */
  public useDummy = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._instance = new DumpDummyInstance();
  };

  /**
   * Injects a custom dump adapter implementation.
   * Uses Reflect.construct for ES3/ES6 interop compatibility.
   * @param Ctor - Constructor for the custom dump implementation
   */
  public useDumpAdapter = (Ctor: TDumpInstanceCtor): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this._instance = Reflect.construct(Ctor, []);
  };
}

export const Dump = new DumpAdapter();
