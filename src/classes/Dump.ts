import fs from "fs/promises";
import { join, dirname } from "path";
import backtest from "../lib";
import { Memory } from "./Memory";
import MessageModel from "../model/Message.model";

const DUMP_MEMORY_INSTANCE_METHOD_NAME_AGENT = "DumpMemoryInstance.dumpAgentAnswer";
const DUMP_MEMORY_INSTANCE_METHOD_NAME_RECORD = "DumpMemoryInstance.dumpRecord";
const DUMP_MEMORY_INSTANCE_METHOD_NAME_TABLE = "DumpMemoryInstance.dumpTable";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_AGENT = "DumpMarkdownInstance.dumpAgentAnswer";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_RECORD = "DumpMarkdownInstance.dumpRecord";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TABLE = "DumpMarkdownInstance.dumpTable";
const DUMP_MEMORY_INSTANCE_METHOD_NAME_TEXT = "DumpMemoryInstance.dumpText";
const DUMP_MEMORY_INSTANCE_METHOD_NAME_ERROR = "DumpMemoryInstance.dumpError";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TEXT = "DumpMarkdownInstance.dumpText";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_ERROR = "DumpMarkdownInstance.dumpError";
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
 * Renders a flat Record as a two-column markdown table (key | value).
 */
const RENDER_RECORD_FN = (record: Record<string, unknown>): string => {
  let table = "| key | value |\n| --- | --- |\n";
  for (const [key, value] of Object.entries(record)) {
    const cell = value === null || value === undefined ? "" : String(value);
    table += `| ${key} | ${cell} |\n`;
  }
  return table;
};

/**
 * Derives column headers from the union of all keys across all rows.
 * Renders an array of objects as a markdown table.
 */
const RENDER_TABLE_FN = (rows: Record<string, unknown>[]): string => {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  let table = `| ${keys.join(" | ")} |\n`;
  table += `| ${keys.map(() => "---").join(" | ")} |\n`;
  for (const row of rows) {
    const cells = keys.map((k) => {
      const v = row[k];
      return v === null || v === undefined ? "" : String(v);
    });
    table += `| ${cells.join(" | ")} |\n`;
  }
  return table;
};

/**
 * Context required to identify a dump entry.
 * Compatible with both Memory (signalId + bucketName + dumpId as memoryId)
 * and Markdown (path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md).
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
  /**
   * Persist a flat key-value record.
   * @param record - Arbitrary flat object to dump
   * @param context - Scope identifiers for the dump entry
   */
  dumpRecord(record: Record<string, unknown>, context: IDumpContext): Promise<void>;
  /**
   * Persist an array of objects as a table.
   * Column headers are derived from the union of all keys across all rows.
   * @param rows - Array of arbitrary objects to dump
   * @param context - Scope identifiers for the dump entry
   */
  dumpTable(rows: Record<string, unknown>[], context: IDumpContext): Promise<void>;
  /**
   * Persist a raw text or markdown string.
   * @param content - Arbitrary text content to dump
   * @param context - Scope identifiers for the dump entry
   */
  dumpText(content: string, context: IDumpContext): Promise<void>;
  /**
   * Persist an error description.
   * @param content - Error message or description to dump
   * @param context - Scope identifiers for the dump entry
   */
  dumpError(content: string, context: IDumpContext): Promise<void>;
}

/**
 * Constructor type for dump instance implementations.
 * Used for swapping backends via DumpAdapter.useDumpAdapter().
 */
export type TDumpInstanceCtor = new () => IDumpInstance;

/**
 * Memory-backed dump instance.
 * Stores data via Memory.writeMemory using dumpId as memoryId.
 * Useful for downstream LLM retrieval via Memory.searchMemory.
 */
export class DumpMemoryInstance implements IDumpInstance {
  /**
   * Stores the full agent message history in Memory as a `{ messages }` object.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * If the message list is empty, the call is a no-op.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpAgentAnswer(
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_AGENT, {
      messagesLen: messages.length,
      context,
    });
    if (!messages.length) {
      return;
    }
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: { messages },
    });
  }

  /**
   * Stores the record object in Memory.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * @param record - Arbitrary flat object to persist
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpRecord(
    record: Record<string, unknown>,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_RECORD, {
      context,
    });
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: record,
    });
  }

  /**
   * Stores the row array in Memory as a single object with a `rows` field.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * @param rows - Array of arbitrary objects to persist
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpTable(
    rows: Record<string, unknown>[],
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_TABLE, {
      rowsLen: rows.length,
      context,
    });
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: { rows },
    });
  }

  /**
   * Stores the text content in Memory as a plain object with a `content` field.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * @param content - Arbitrary text to persist
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpText(
    content: string,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_TEXT, {
      context,
    });
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: { content },
    });
  }

  /**
   * Stores the error content in Memory as a plain object with a `content` field.
   * Uses dumpId as memoryId, scoped by signalId and bucketName.
   * @param content - Error message or description to persist
   * @param context - Scope identifiers for the memory entry
   */
  public async dumpError(
    content: string,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_ERROR, {
      context,
    });
    await Memory.writeMemory({
      memoryId: context.dumpId,
      bucketName: context.bucketName,
      signalId: context.signalId,
      value: { content },
    });
  }
}

/**
 * Markdown-backed dump instance.
 * Writes output into a single .md file per call.
 *
 * Storage layout:
 *   ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
 *
 * If the file already exists, the call is skipped (idempotent).
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
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_AGENT, {
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

  /**
   * Writes a flat key-value record as a two-column markdown table.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param record - Arbitrary flat object to render
   * @param context - Scope identifiers used to construct the file path
   */
  public async dumpRecord(
    record: Record<string, unknown>,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_RECORD, {
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
    let content = `# Record Dump — ${context.dumpId}\n\n`;
    content += `**signalId**: ${context.signalId}  \n`;
    content += `**bucketName**: ${context.bucketName}\n\n`;
    content += RENDER_RECORD_FN(record);
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes an array of objects as a markdown table.
   * Column headers are derived from the union of all keys across all rows.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param rows - Array of arbitrary objects to render
   * @param context - Scope identifiers used to construct the file path
   */
  public async dumpTable(
    rows: Record<string, unknown>[],
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TABLE, {
      rowsLen: rows.length,
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
    let content = `# Table Dump — ${context.dumpId}\n\n`;
    content += `**signalId**: ${context.signalId}  \n`;
    content += `**bucketName**: ${context.bucketName}\n\n`;
    content += RENDER_TABLE_FN(rows);
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes raw text content to a markdown file as-is.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Arbitrary text to write
   * @param context - Scope identifiers used to construct the file path
   */
  public async dumpText(
    content: string,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TEXT, {
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
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes an error description to a markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Error message or description to write
   * @param context - Scope identifiers used to construct the file path
   */
  public async dumpError(
    content: string,
    context: IDumpContext,
  ): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_ERROR, {
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
    let output = `# Error Dump — ${context.dumpId}\n\n`;
    output += `**signalId**: ${context.signalId}  \n`;
    output += `**bucketName**: ${context.bucketName}\n\n`;
    output += content;
    output += "\n";
    await fs.writeFile(filePath, output, "utf8");
  }
}

/**
 * No-op dump instance that discards all writes.
 * Used for disabling dumps in tests or dry-run scenarios.
 */
export class DumpDummyInstance implements IDumpInstance {
  /** No-op. */
  public async dumpAgentAnswer(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public async dumpRecord(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public async dumpTable(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public async dumpText(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public async dumpError(): Promise<void> {
    void 0;
  }
}

/**
 * Facade for dump instances with swappable backend.
 * Default backend: DumpMarkdownInstance.
 *
 * Switch backends via:
 * - useMarkdown() — write one .md file per call (default)
 * - useMemory()   — store data in Memory
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
   * Persist a flat key-value record.
   * Delegates to the active backend instance.
   */
  public dumpRecord = async (
    record: Record<string, unknown>,
    context: IDumpContext,
  ): Promise<void> => {
    return await this._instance.dumpRecord(record, context);
  };

  /**
   * Persist an array of objects as a table.
   * Delegates to the active backend instance.
   */
  public dumpTable = async (
    rows: Record<string, unknown>[],
    context: IDumpContext,
  ): Promise<void> => {
    return await this._instance.dumpTable(rows, context);
  };

  /**
   * Persist raw text content.
   * Delegates to the active backend instance.
   */
  public dumpText = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    return await this._instance.dumpText(content, context);
  };

  /**
   * Persist an error description.
   * Delegates to the active backend instance.
   */
  public dumpError = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    return await this._instance.dumpError(content, context);
  };

  /**
   * Switches to markdown backend (default).
   * Writes one .md file per call to ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   */
  public useMarkdown = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_MARKDOWN);
    this._instance = new DumpMarkdownInstance();
  };

  /**
   * Switches to memory backend.
   * Stores data via Memory.writeMemory.
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
