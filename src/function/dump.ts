import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Dump } from "../classes/Dump";
import MessageModel from "../model/Message.model";

const DUMP_AGENT_ANSWER_METHOD_NAME = "dump.dumpAgentAnswer";
const DUMP_RECORD_METHOD_NAME = "dump.dumpRecord";
const DUMP_TABLE_METHOD_NAME = "dump.dumpTable";
const DUMP_TEXT_METHOD_NAME = "dump.dumpText";
const DUMP_ERROR_METHOD_NAME = "dump.dumpError";
const DUMP_JSON_METHOD_NAME = "dump.dumpJson";

/**
 * Dumps the full agent message history scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this agent invocation
 * @param dto.messages - Full chat history (system, user, assistant, tool)
 * @param dto.description - Human-readable label describing the agent invocation context; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Better use Dump.dumpAgentAnswer with manual signalId argument
 *
 * @example
 * ```typescript
 * import { dumpAgentAnswer } from "backtest-kit";
 *
 * await dumpAgentAnswer({ bucketName: "my-strategy", dumpId: "reasoning-1", messages, description: "BTC long signal reasoning" });
 * ```
 */
export async function dumpAgentAnswer(dto: {
  bucketName: string;
  dumpId: string;
  messages: MessageModel[];
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, messages, description } = dto;
  backtest.loggerService.info(DUMP_AGENT_ANSWER_METHOD_NAME, {
    bucketName,
    dumpId,
    messagesLen: messages.length,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpAgentAnswer requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpAgentAnswer requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpAgentAnswer no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpAgentAnswer(messages, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}

/**
 * Dumps a flat key-value record scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.record - Arbitrary flat object to persist
 * @param dto.description - Human-readable label describing the record contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Better use Dump.dumpRecord with manual signalId argument
 *
 * @example
 * ```typescript
 * import { dumpRecord } from "backtest-kit";
 *
 * await dumpRecord({ bucketName: "my-strategy", dumpId: "context", record: { price: 42000, signal: "long" }, description: "Signal context at entry" });
 * ```
 */
export async function dumpRecord(dto: {
  bucketName: string;
  dumpId: string;
  record: Record<string, unknown>;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, record, description } = dto;
  backtest.loggerService.info(DUMP_RECORD_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpRecord requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpRecord requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpRecord no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpRecord(record, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}

/**
 * Dumps an array of objects as a table scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * Column headers are derived from the union of all keys across all rows.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.rows - Array of arbitrary objects to render as a table
 * @param dto.description - Human-readable label describing the table contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Better use Dump.dumpTable with manual signalId argument
 *
 * @example
 * ```typescript
 * import { dumpTable } from "backtest-kit";
 *
 * await dumpTable({ bucketName: "my-strategy", dumpId: "candles", rows: [{ time: 1234, close: 42000 }], description: "Recent candle history" });
 * ```
 */
export async function dumpTable(dto: {
  bucketName: string;
  dumpId: string;
  rows: Record<string, unknown>[];
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, rows, description } = dto;
  backtest.loggerService.info(DUMP_TABLE_METHOD_NAME, {
    bucketName,
    dumpId,
    rowsLen: rows.length,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpTable requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpTable requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpTable no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpTable(rows, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}

/**
 * Dumps raw text content scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.content - Arbitrary text content to persist
 * @param dto.description - Human-readable label describing the content; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Better use Dump.dumpText with manual signalId argument
 *
 * @example
 * ```typescript
 * import { dumpText } from "backtest-kit";
 *
 * await dumpText({ bucketName: "my-strategy", dumpId: "summary", content: "Agent concluded: bullish", description: "Agent final summary" });
 * ```
 */
export async function dumpText(dto: {
  bucketName: string;
  dumpId: string;
  content: string;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, content, description } = dto;
  backtest.loggerService.info(DUMP_TEXT_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpText requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpText requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpText no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpText(content, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}

/**
 * Dumps an error description scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.content - Error message or description to persist
 * @param dto.description - Human-readable label describing the error context; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Better use Dump.dumpError with manual signalId argument
 *
 * @example
 * ```typescript
 * import { dumpError } from "backtest-kit";
 *
 * await dumpError({ bucketName: "my-strategy", dumpId: "error-1", content: "Tool call failed: timeout", description: "Tool execution error" });
 * ```
 */
export async function dumpError(dto: {
  bucketName: string;
  dumpId: string;
  content: string;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, content, description } = dto;
  backtest.loggerService.info(DUMP_ERROR_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpError requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpError requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpError no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpError(content, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}

/**
 * Dumps an arbitrary nested object as a fenced JSON block scoped to the current signal.
 *
 * Reads signalId from the active pending signal via execution and method context.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * @param dto.bucketName - Bucket name grouping dumps by strategy or agent name
 * @param dto.dumpId - Unique identifier for this dump entry
 * @param dto.json - Arbitrary nested object to serialize with JSON.stringify
 * @param dto.description - Human-readable label describing the object contents; included in the BM25 index for Memory search
 * @returns Promise that resolves when the dump is complete
 *
 * @deprecated Prefer dumpRecord — flat key-value structure maps naturally to markdown tables and SQL storage
 *
 * @example
 * ```typescript
 * import { dumpJson } from "backtest-kit";
 *
 * await dumpJson({ bucketName: "my-strategy", dumpId: "signal-state", json: { entries: [], partials: [] }, description: "Signal state snapshot" });
 * ```
 */
export async function dumpJson(dto: {
  bucketName: string;
  dumpId: string;
  json: object;
  description: string;
}): Promise<void> {
  const { bucketName, dumpId, json, description } = dto;
  backtest.loggerService.info(DUMP_JSON_METHOD_NAME, {
    bucketName,
    dumpId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("dumpJson requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("dumpJson requires a method context");
  }
  const { backtest: isBacktest, symbol } = backtest.executionContextService.context;
  const { exchangeName, frameName, strategyName } =
    backtest.methodContextService.context;
  const currentPrice =
    await backtest.exchangeConnectionService.getAveragePrice(symbol);
  const signal = await backtest.strategyCoreService.getPendingSignal(
    isBacktest,
    symbol,
    currentPrice,
    { exchangeName, frameName, strategyName },
  );
  if (!signal) {
    console.warn(`backtest-kit dumpJson no pending signal for symbol=${symbol} dumpId=${dumpId}`);
    return;
  }
  await Dump.dumpJson(json, {
    dumpId,
    bucketName,
    signalId: signal.id,
    description,
  });
}
