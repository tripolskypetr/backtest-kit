import fs from "fs/promises";
import { join, dirname } from "path";
import { compose, memoize, singleshot } from "functools-kit";
import backtest from "../lib";
import { Memory } from "./Memory";
import MessageModel from "../model/Message.model";
import { signalEmitter } from "../config/emitters";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}-${bucketName}`;

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
const DUMP_BOTH_INSTANCE_METHOD_NAME_AGENT = "DumpBothInstance.dumpAgentAnswer";
const DUMP_BOTH_INSTANCE_METHOD_NAME_RECORD = "DumpBothInstance.dumpRecord";
const DUMP_BOTH_INSTANCE_METHOD_NAME_TABLE = "DumpBothInstance.dumpTable";
const DUMP_BOTH_INSTANCE_METHOD_NAME_TEXT = "DumpBothInstance.dumpText";
const DUMP_BOTH_INSTANCE_METHOD_NAME_ERROR = "DumpBothInstance.dumpError";
const DUMP_BOTH_INSTANCE_METHOD_NAME_JSON = "DumpBothInstance.dumpJson";
const DUMP_ADAPTER_METHOD_NAME_ENABLE = "DumpAdapter.enable";
const DUMP_ADAPTER_METHOD_NAME_DISABLE = "DumpAdapter.disable";
const DUMP_ADAPTER_METHOD_NAME_DISPOSE = "DumpAdapter.dispose";
const DUMP_ADAPTER_METHOD_NAME_AGENT = "DumpAdapter.dumpAgentAnswer";
const DUMP_ADAPTER_METHOD_NAME_RECORD = "DumpAdapter.dumpRecord";
const DUMP_ADAPTER_METHOD_NAME_TABLE = "DumpAdapter.dumpTable";
const DUMP_ADAPTER_METHOD_NAME_TEXT = "DumpAdapter.dumpText";
const DUMP_ADAPTER_METHOD_NAME_ERROR = "DumpAdapter.dumpError";
const DUMP_ADAPTER_METHOD_NAME_JSON = "DumpAdapter.dumpJson";
const DUMP_ADAPTER_METHOD_NAME_USE_MARKDOWN = "DumpAdapter.useMarkdown";
const DUMP_ADAPTER_METHOD_NAME_USE_MEMORY = "DumpAdapter.useMemory";
const DUMP_ADAPTER_METHOD_NAME_USE_DUMMY = "DumpAdapter.useDummy";
const DUMP_ADAPTER_METHOD_NAME_USE_BOTH = "DumpAdapter.useMarkdownMemoryBoth";
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
 * Passed only through DumpAdapter - instances receive signalId and bucketName via constructor.
 */
export interface IDumpContext {
  /** Signal identifier - scopes the dump to a specific trade */
  signalId: string;
  /** Bucket name - groups dumps by strategy or agent name */
  bucketName: string;
  /** Unique identifier for this dump entry */
  dumpId: string;
  /** Human-readable label describing the dump contents; included in the BM25 index for Memory search and rendered in Markdown output */
  description: string;
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
   * @param description - Human-readable label describing the agent invocation context; included in the BM25 index for Memory search
   */
  dumpAgentAnswer(messages: MessageModel[], dumpId: string, description: string): Promise<void>;
  /**
   * Persist a flat key-value record.
   * @param record - Arbitrary flat object to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the record contents; included in the BM25 index for Memory search
   */
  dumpRecord(record: Record<string, unknown>, dumpId: string, description: string): Promise<void>;
  /**
   * Persist an array of objects as a table.
   * Column headers are derived from the union of all keys across all rows.
   * @param rows - Array of arbitrary objects to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the table contents; included in the BM25 index for Memory search
   */
  dumpTable(rows: Record<string, unknown>[], dumpId: string, description: string): Promise<void>;
  /**
   * Persist a raw text or markdown string.
   * @param content - Arbitrary text content to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the content; included in the BM25 index for Memory search
   */
  dumpText(content: string, dumpId: string, description: string): Promise<void>;
  /**
   * Persist an error description.
   * @param content - Error message or description to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the error context; included in the BM25 index for Memory search
   */
  dumpError(content: string, dumpId: string, description: string): Promise<void>;
  /**
   * Persist an arbitrary nested object as a fenced JSON block.
   * @param json - Arbitrary object to serialize with JSON.stringify
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the object contents; included in the BM25 index for Memory search
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  dumpJson(json: object, dumpId: string, description: string): Promise<void>;
  /**
   * Releases any resources held by this instance.
   */
  dispose(): void;
}

/**
 * Constructor type for dump instance implementations.
 * Used for swapping backends via DumpAdapter.useDumpAdapter().
 */
export type TDumpInstanceCtor = new (signalId: string, bucketName: string) => IDumpInstance;


/**
 * Dual-write dump instance.
 * Each call writes to both backends in parallel via Promise.all:
 * - Memory (BM25-indexed, searchable via Memory.searchMemory for downstream LLM retrieval)
 * - Markdown (human-readable .md file at ./dump/agent/{signalId}/{bucketName}/{dumpId}.md, visible in GUI dump explorer)
 * Scoped to (signalId, bucketName) via constructor.
 */
export class DumpBothInstance implements IDumpInstance {
  private readonly _memory: DumpMemoryInstance;
  private readonly _markdown: DumpMarkdownInstance;

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {
    this._memory = new DumpMemoryInstance(signalId, bucketName);
    this._markdown = new DumpMarkdownInstance(signalId, bucketName);
  }

  /** Releases resources held by both backends. */
  public dispose(): void {
    this._memory.dispose();
    this._markdown.dispose();
  }

  /**
   * Persists the full agent reasoning chain to both backends simultaneously.
   * Memory: stored as `{ description, messages }` object, searchable by content via BM25.
   * Markdown: rendered as numbered sections per role with tool_calls as fenced JSON blocks.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the agent invocation context; included in the BM25 index for Memory search
   */
  public async dumpAgentAnswer(messages: MessageModel[], dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_AGENT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      messagesLen: messages.length,
    });
    await Promise.all([
      this._memory.dumpAgentAnswer(messages, dumpId, description),
      this._markdown.dumpAgentAnswer(messages, dumpId, description),
    ]);
  }

  /**
   * Persists a flat key-value record to both backends simultaneously.
   * Memory: stored as `{ description, ...record }`, each key searchable via BM25.
   * Markdown: rendered as a two-column `| key | value |` table.
   * @param record - Arbitrary flat object to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the record contents; included in the BM25 index for Memory search
   */
  public async dumpRecord(record: Record<string, unknown>, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_RECORD, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Promise.all([
      this._memory.dumpRecord(record, dumpId, description),
      this._markdown.dumpRecord(record, dumpId, description),
    ]);
  }

  /**
   * Persists an array of objects as a table to both backends simultaneously.
   * Memory: stored as `{ description, rows }` object, row contents searchable via BM25.
   * Markdown: rendered as a multi-column table; headers derived from the union of all row keys.
   * @param rows - Array of arbitrary objects to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the table contents; included in the BM25 index for Memory search
   */
  public async dumpTable(rows: Record<string, unknown>[], dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_TABLE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
      rowsLen: rows.length,
    });
    await Promise.all([
      this._memory.dumpTable(rows, dumpId, description),
      this._markdown.dumpTable(rows, dumpId, description),
    ]);
  }

  /**
   * Persists raw text to both backends simultaneously.
   * Memory: stored as `{ description, content }` object, text searchable via BM25.
   * Markdown: written as-is to the .md file - suitable for agent summaries or reasoning traces.
   * @param content - Arbitrary text content to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the content; included in the BM25 index for Memory search
   */
  public async dumpText(content: string, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_TEXT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Promise.all([
      this._memory.dumpText(content, dumpId, description),
      this._markdown.dumpText(content, dumpId, description),
    ]);
  }

  /**
   * Persists an error description to both backends simultaneously.
   * Memory: stored as `{ description, content }` object, message searchable via BM25 for post-mortem analysis.
   * Markdown: rendered with an `# Error Dump` header and signal context for human review.
   * @param content - Error message or description to dump
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the error context; included in the BM25 index for Memory search
   */
  public async dumpError(content: string, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_ERROR, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Promise.all([
      this._memory.dumpError(content, dumpId, description),
      this._markdown.dumpError(content, dumpId, description),
    ]);
  }

  /**
   * Persists an arbitrary nested object to both backends simultaneously.
   * Memory: stored as `{ description, ...json }`, top-level keys searchable via BM25.
   * Markdown: rendered as a fenced ```json block with JSON.stringify(json, null, 2).
   * @param json - Arbitrary nested object to serialize
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the object contents; included in the BM25 index for Memory search
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(json: object, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_BOTH_INSTANCE_METHOD_NAME_JSON, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    await Promise.all([
      this._memory.dumpJson(json, dumpId, description),
      this._markdown.dumpJson(json, dumpId, description),
    ]);
  }
}

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
   * description is passed as the BM25 index string to enable contextual search across agent invocations.
   * If the message list is empty, the call is a no-op.
   * @param messages - Full chat history (system, user, assistant, tool)
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   */
  public async dumpAgentAnswer(messages: MessageModel[], dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /**
   * Stores the record object in Memory as-is.
   * description is passed as the BM25 index string to enable contextual search.
   * @param record - Arbitrary flat object to persist
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   */
  public async dumpRecord(record: Record<string, unknown>, dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /**
   * Stores the row array in Memory as a `{ rows }` object.
   * description is passed as the BM25 index string to enable contextual search.
   * @param rows - Array of arbitrary objects to persist
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   */
  public async dumpTable(rows: Record<string, unknown>[], dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /**
   * Stores the text content in Memory as a `{ content }` object.
   * description is passed as the BM25 index string to enable contextual search.
   * @param content - Arbitrary text to persist
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   */
  public async dumpText(content: string, dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /**
   * Stores the error content in Memory as a `{ content }` object.
   * description is passed as the BM25 index string to enable contextual search.
   * @param content - Error message or description to persist
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   */
  public async dumpError(content: string, dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /**
   * Stores the JSON object in Memory as-is.
   * description is passed as the BM25 index string to enable contextual search.
   * @param json - Arbitrary nested object to persist
   * @param dumpId - Unique identifier for this dump entry
   * @param description - BM25 index string for contextual search
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(json: object, dumpId: string, description: string): Promise<void> {
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
      index: description,
    });
  }

  /** Releases resources held by this instance. */
  public dispose(): void {
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
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
   * @param description - Human-readable label describing the agent invocation context; rendered as a header line in the markdown file
   */
  public async dumpAgentAnswer(messages: MessageModel[], dumpId: string, description: string): Promise<void> {
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
    let content = `# Agent Reasoning - ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}  \n`;
    content += `**description**: ${description}\n\n`;
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
   * @param description - Human-readable label describing the record contents; rendered as a header line in the markdown file
   */
  public async dumpRecord(record: Record<string, unknown>, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_RECORD, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let content = `# Record Dump - ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}  \n`;
    content += `**description**: ${description}\n\n`;
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
   * @param description - Human-readable label describing the table contents; rendered as a header line in the markdown file
   */
  public async dumpTable(rows: Record<string, unknown>[], dumpId: string, description: string): Promise<void> {
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
    let content = `# Table Dump - ${dumpId}\n\n`;
    content += `**signalId**: ${this.signalId}  \n`;
    content += `**bucketName**: ${this.bucketName}  \n`;
    content += `**description**: ${description}\n\n`;
    content += RENDER_TABLE_FN(rows);
    await fs.writeFile(filePath, content, "utf8");
  }

  /**
   * Writes raw text content to a markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Arbitrary text to write
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the content; rendered as a header line in the markdown file
   */
  public async dumpText(content: string, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_TEXT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let output = `# Text Dump - ${dumpId}\n\n`;
    output += `**signalId**: ${this.signalId}  \n`;
    output += `**bucketName**: ${this.bucketName}  \n`;
    output += `**description**: ${description}\n\n`;
    output += content;
    output += "\n";
    await fs.writeFile(filePath, output, "utf8");
  }

  /**
   * Writes an error description to a markdown file.
   * Path: ./dump/agent/{signalId}/{bucketName}/{dumpId}.md
   * If the file already exists, the call is skipped (idempotent).
   * @param content - Error message or description to write
   * @param dumpId - Unique identifier for this dump entry
   * @param description - Human-readable label describing the error context; rendered as a header line in the markdown file
   */
  public async dumpError(content: string, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_ERROR, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let output = `# Error Dump - ${dumpId}\n\n`;
    output += `**signalId**: ${this.signalId}  \n`;
    output += `**bucketName**: ${this.bucketName}  \n`;
    output += `**description**: ${description}\n\n`;
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
   * @param description - Human-readable label describing the object contents; rendered as a header line in the markdown file
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(json: object, dumpId: string, description: string): Promise<void> {
    backtest.loggerService.info(DUMP_MARKDOWN_INSTANCE_METHOD_NAME_JSON, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      dumpId,
    });
    const filePath = this.getFilePath(dumpId);
    if (!await this.ensureFile(filePath)) {
      return;
    }
    let output = `# JSON Dump - ${dumpId}\n\n`;
    output += `**signalId**: ${this.signalId}  \n`;
    output += `**bucketName**: ${this.bucketName}  \n`;
    output += `**description**: ${description}\n\n`;
    output += "```json\n";
    output += JSON.stringify(json, null, 2);
    output += "\n```\n";
    await fs.writeFile(filePath, output, "utf8");
  }

  /** Releases resources held by this instance. */
  public dispose(): void {
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
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
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public async dumpJson(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public dispose(): void {
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
 * - useMarkdown() - write one .md file per call (default)
 * - useMemory()   - store data in Memory
 * - useDummy()    - no-op, discard all writes
 * - useDumpAdapter(Ctor) - inject a custom implementation
 */
export class DumpAdapter {
  private DumpFactory: TDumpInstanceCtor = DumpMarkdownInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: string): IDumpInstance =>
      Reflect.construct(this.DumpFactory, [signalId, bucketName]),
  );

  /**
   * Activates the adapter by subscribing to signal lifecycle events.
   * Clears memoized instances for a signalId when it is cancelled or closed,
   * preventing stale instances from accumulating in memory.
   * Idempotent — subsequent calls return the same subscription handle.
   * Must be called before any dump method is used.
   */
  public enable = singleshot(() => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_ENABLE);

    const handleDispose = (signalId: string) => {
      const prefix = CREATE_KEY_FN(signalId, "");
      for (const key of this.getInstance.keys()) {
        if (key.startsWith(prefix)) {
          const instance = this.getInstance.get(key);
          instance && instance.dispose();
          this.getInstance.clear(key);
        }
      }
    };

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => handleDispose(signal.id))

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => handleDispose(signal.id))

    return compose(
      () => unCancel(),
      () => unClose(),
    );
  });

  /**
   * Deactivates the adapter by unsubscribing from signal lifecycle events.
   * No-op if enable() was never called.
   */
  public disable = () => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Persist the full message history of one agent invocation.
   */
  public dumpAgentAnswer = async (
    messages: MessageModel[],
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_AGENT, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpAgentAnswer(messages, context.dumpId, context.description);
  };

  /**
   * Persist a flat key-value record.
   */
  public dumpRecord = async (
    record: Record<string, unknown>,
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_RECORD, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpRecord(record, context.dumpId, context.description);
  };

  /**
   * Persist an array of objects as a table.
   */
  public dumpTable = async (
    rows: Record<string, unknown>[],
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_TABLE, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpTable(rows, context.dumpId, context.description);
  };

  /**
   * Persist raw text content.
   */
  public dumpText = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_TEXT, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpText(content, context.dumpId, context.description);
  };

  /**
   * Persist an error description.
   */
  public dumpError = async (
    content: string,
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_ERROR, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpError(content, context.dumpId, context.description);
  };

  /**
   * Persist an arbitrary nested object as a fenced JSON block.
   * @deprecated Prefer dumpRecord - flat key-value structure maps naturally to markdown tables and SQL storage
   */
  public dumpJson = async (
    json: object,
    context: IDumpContext,
  ): Promise<void> => {
    if (!this.enable.hasValue()) {
      throw new Error("DumpAdapter is not enabled. Call enable() first.");
    }
    backtest.loggerService.debug(DUMP_ADAPTER_METHOD_NAME_JSON, {
      signalId: context.signalId,
      bucketName: context.bucketName,
      dumpId: context.dumpId,
    });
    const instance = this.getInstance(context.signalId, context.bucketName);
    return await instance.dumpJson(json, context.dumpId, context.description);
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
   * Switches to dual-write backend.
   * Writes to both Memory and Markdown simultaneously.
   */
  public useMarkdownMemoryBoth = (): void => {
    backtest.loggerService.info(DUMP_ADAPTER_METHOD_NAME_USE_BOTH);
    this.DumpFactory = DumpBothInstance;
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
