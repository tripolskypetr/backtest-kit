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
const DUMP_MEMORY_INSTANCE_METHOD_NAME_JSON = "DumpMemoryInstance.dumpJson";
const DUMP_MARKDOWN_INSTANCE_METHOD_NAME_JSON = "DumpMarkdownInstance.dumpJson";
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
 * Passed only through DumpAdapter — instances receive signalId and bucketName via constructor.
 */
export interface IDumpContext {
  /** Signal identifier — scopes the dump to a specific trade */
  signalId: string;
  /** Bucket name — groups dumps by strategy or agent name */
  bucketName: string;
  /** Unique identifier for this dump entry */
  dumpId: string;
}

/**
 * Interface for dump instance implementations.
 * Instances are scoped to (signalId, bucketName) via constructor.
 * Methods receive only the payload and dumpId.
 */
export interface IDumpInstance {
  /**
   * Persist the full message history of one agent invocation.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param dumpId - Unique identifier for this dump entry
   */
  dumpAgentAnswer(messages: MessageModel[], dumpId: string): Promise<void>;
  /**
   * Persist a flat key-value record.
   * @param record - Arbitrary flat object to dump
   * @param dumpId - Unique identifier for this dump entry
   */
  dumpRecord(record: Record<string, unknown>, dumpId: string): Promise<void>;
  /**
   * Persist an array of objects as a table.
   * Column headers are derived from the union of all keys across all rows.
   * @param rows - Array of arbitrary objects to dump
   * @param dumpId - Unique identifier for this dump entry
   */
  dumpTable(rows: Record<string, unknown>[], dumpId: string): Promise<void>;
  /**
   * Persist a raw text or markdown string.
   * @param content - Arbitrary text content to dump
   * @param dumpId - Unique identifier for this dump entry
   */
  dumpText(content: string, dumpId: string): Promise<void>;
  /**
   * Persist an error description.
   * @param content - Error message or description to dump
   * @param dumpId - Unique identifier for this dump entry
   */
  dumpError(content: string, dumpId: string): Promise<void>;
  /**
   * Persist an arbitrary nested object as a fenced JSON block.
   * @param json - Arbitrary object to serialize with JSON.stringify
   * @param dumpId - Unique identifier for this dump entry
   * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
   */
  dumpJson(json: object, dumpId: string): Promise<void>;
}

/**
 * Constructor type for dump instance implementations.
 * Used for swapping backends via DumpAdapter.useDumpAdapter().
 */
export type TDumpInstanceCtor = new (signalId: string, bucketName: string) => IDumpInstance;

/**
 * Memory-backed dump instance.
 * Stores data via Memory.writeMemory using dumpId as memoryId.
 * Scoped to (signalId, bucketName) via constructor.
 * Useful for downstream LLM retrieval via Memory.searchMemory.
 */
export class DumpMemoryInstance implements IDumpInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  /**
   * Stores the full agent message history in Memory as a `{ messages }` object.
   * If the message list is empty, the call is a no-op.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpAgentAnswer(messages: MessageModel[], dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_AGENT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      messagesLen: messages.length,
    });
    if (!messages.length) {
      return;
    }
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: { messages },
    });
  }

  /**
   * Stores the record object in Memory.
   * @param record - Arbitrary flat object to persist
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpRecord(record: Record<string, unknown>, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_RECORD, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: record,
    });
  }

  /**
   * Stores the row array in Memory as a single object with a `rows` field.
   * @param rows - Array of arbitrary objects to persist
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpTable(rows: Record<string, unknown>[], dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_TABLE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      rowsLen: rows.length,
    });
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: { rows },
    });
  }

  /**
   * Stores the text content in Memory as a plain object with a `content` field.
   * @param content - Arbitrary text to persist
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpText(content: string, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_TEXT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: { content },
    });
  }

  /**
   * Stores the error content in Memory as a plain object with a `content` field.
   * @param content - Error message or description to persist
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpError(content: string, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_ERROR, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: { content },
    });
  }

  /**
   * Stores the JSON object in Memory as-is.
   * @param json - Arbitrary nested object to persist
   * @param dumpId - Unique identifier for this dump entry
   * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(json: object, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MEMORY_INSTANCE_METHOD_NAME_JSON, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Memory.writeMemory({
      memoryId: dumpId,
      bucketName: this.bucketName,
      signalId: this.signalId,
      value: json,
    });
  }
}

/**
 * Markdown-backed dump instance.
 * Writes output into a single .md file per call.
 * Scoped to (signalId, bucketName) via constructor.
 *
 * Storage layout:
 *   ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
 *
 * If the file already exists, the call is skipped (idempotent).
 */
export class DumpMarkdownInstance implements IDumpInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  private getFilePath(dumpId: string): string {
    return join("./dump/agent", this.signalId, this.bucketName, `${dumpId}.md`);
  }

  private async ensureFile(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return false;
    } catch {
      await fs.mkdir(dirname(filePath), { recursive: true });
      return true;
    }
  }

  /**
   * Writes all messages of the agent invocation to a single markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpAgentAnswer(messages: MessageModel[], dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_AGENT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      messagesLen: messages.length,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let content = `# Agent Reasoning — ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}\n\n`;
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
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpRecord(record: Record<string, unknown>, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_RECORD, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let content = `# Record Dump — ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}\n\n`;
    content += RENDER_RECORD_FN(record);
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes an array of objects as a markdown table.
   * Column headers are derived from the union of all keys across all rows.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param rows - Array of arbitrary objects to render
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpTable(rows: Record<string, unknown>[], dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TABLE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      rowsLen: rows.length,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let content = `# Table Dump — ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}\n\n`;
    content += RENDER_TABLE_FN(rows);
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes raw text content to a markdown file as-is.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Arbitrary text to write
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpText(content: string, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TEXT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes an error description to a markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Error message or description to write
   * @param dumpId - Unique identifier for this dump entry
   */
  public async dumpError(content: string, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_ERROR, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let output = `# Error Dump — ${dumpId}\n\n`;
    output += `**signalId**: ${this.signalId}  \n`;
    output += `**bucketName**: ${this.bucketName}\n\n`;
    output += content;
    output += "\n";
    await fs.writeFile(filePath, output, "utf8");
  }

  /**
   * Writes an arbitrary nested object as a fenced JSON block to a markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param json - Arbitrary nested object to serialize
   * @param dumpId - Unique identifier for this dump entry
   * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(json: object, dumpId: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_JSON, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let output = `# JSON Dump — ${dumpId}\n\n`;
    output += `**signalId**: ${this.signalId}  \n`;
    output += `**bucketName**: ${this.bucketName}\n\n`;
    output += "```json\n";
    output += JSON.stringify(json, null, 2);
    output += "\n```\n";
    await fs.writeFile(filePath, output, "utf8");
  }
}

/**
 * No-op dump instance that discards all writes.
 * Used for disabling dumps in tests or dry-run scenarios.
 */
export class DumpDummyInstance implements IDumpInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

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

  /**
   * No-op.
   * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(): Promise<void> {
    void 0;
  }
}

/**
 * Facade for dump instances with swappable backend.
 * Default backend: DumpMarkdownInstance.
 *
 * Accepts IDumpContext on every call, constructs a scoped instance per (signalId, bucketName),
 * and delegates with only the dumpId.
 *
 * Switch backends via:
 * - useMarkdown() — write one .md file per call (default)
 * - useMemory()   — store data in Memory
 * - useDummy()    — no-op, discard all writes
 * - useDumpAdapter(Ctor) — inject a custom implementation
 */
export class DumpAdapter {
  private DumpFactory: TDumpInstanceCtor = DumpMarkdownInstance;

  private getInstance(signalId: string, bucketName: string): IDumpInstance {
    return Reflect.construct(this.DumpFactory, [signalId, bucketName]);
  }

  /**
   * Persist the full message history of one agent invocation.
   */
  public dumpAgentAnswer = async (
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpAgentAnswer(messages, context.dumpId);
  };

  /**
   * Persist a flat key-value record.
   */
  public dumpRecord = async (
    record: Record<string, unknown>,
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpRecord(record, context.dumpId);
  };

  /**
   * Persist an array of objects as a table.
   */
  public dumpTable = async (
    rows: Record<string, unknown>[],
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpTable(rows, context.dumpId);
  };

  /**
   * Persist raw text content.
   */
  public dumpText = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpText(content, context.dumpId);
  };

  /**
   * Persist an error description.
   */
  public dumpError = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpError(content, context.dumpId);
  };

  /**
   * Persist an arbitrary nested object as a fenced JSON block.
   * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public dumpJson = async (
    json: object,
    context: IDumpContext,
  ): Promise<void> => {
    return await this.getInstance(context.signalId, context.bucketName)
      .dumpJson(json, context.dumpId);
  };

  /**
   * Switches to markdown backend (default).
   * Writes one .md file per call to ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   */
  public useMarkdown = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_MARKDOWN);
    this.DumpFactory = DumpMarkdownInstance;
  };

  /**
   * Switches to memory backend.
   * Stores data via Memory.writeMemory.
   */
  public useMemory = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_MEMORY);
    this.DumpFactory = DumpMemoryInstance;
  };

  /**
   * Switches to dummy backend.
   * All writes are discarded.
   */
  public useDummy = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.DumpFactory = DumpDummyInstance;
  };

  /**
   * Injects a custom dump adapter implementation.
   * Uses Reflect.construct for ES3/ES6 interop compatibility.
   * @param Ctor - Constructor for the custom dump implementation
   */
  public useDumpAdapter = (Ctor: TDumpInstanceCtor): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this.DumpFactory = Ctor;
  };
}

export const Dump = new DumpAdapter();
