import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { Memory } from "../classes/Memory";

const WRITE_MEMORY_METHOD_NAME = "memory.writeMemory";
const READ_MEMORY_METHOD_NAME = "memory.readMemory";
const SEARCH_MEMORY_METHOD_NAME = "memory.searchMemory";
const LIST_MEMORY_METHOD_NAME = "memory.listMemory";
const REMOVE_MEMORY_METHOD_NAME = "memory.removeMemory";

/**
 * Writes a value to memory scoped to the current signal.
 *
 * Reads symbol from execution context and signalId from the active pending signal.
 * If no pending signal exists, logs a warning and returns without writing.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @param dto.value - Value to store
 * @returns Promise that resolves when write is complete
 *
 * @deprecated Better use Memory.writeMemory with manual signalId argument
 * 
 * @example
 * ```typescript
 * import { writeMemory } from "backtest-kit";
 *
 * await writeMemory({ bucketName: "my-strategy", memoryId: "context", value: { trend: "up", confidence: 0.9 } });
 * ```
 */
export async function writeMemory<T extends object = object>(dto: {
  bucketName: string;
  memoryId: string;
  value: T;
}): Promise<void> {
  const { bucketName, memoryId, value } = dto;
  backtest.loggerService.info(WRITE_MEMORY_METHOD_NAME, {
    bucketName,
    memoryId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("writeMemory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("writeMemory requires a method context");
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
    console.warn(`backtest-kit writeMemory no pending signal for symbol=${symbol} memoryId=${memoryId}`);
    return;
  }
  await Memory.writeMemory({
    memoryId,
    value,
    signalId: signal.id,
    bucketName,
  });
}

/**
 * Reads a value from memory scoped to the current signal.
 *
 * Reads symbol from execution context and signalId from the active pending signal.
 * If no pending signal exists, logs a warning and returns null.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @returns Promise resolving to stored value or null if no signal
 * @throws Error if entry not found within an active signal
 *
 * @deprecated Better use Memory.readMemory with manual signalId argument
 * 
 * @example
 * ```typescript
 * import { readMemory } from "backtest-kit";
 *
 * const ctx = await readMemory<{ trend: string }>({ bucketName: "my-strategy", memoryId: "context" });
 * ```
 */
export async function readMemory<T extends object = object>(dto: {
  bucketName: string;
  memoryId: string;
}): Promise<T | null> {
  const { bucketName, memoryId } = dto;
  backtest.loggerService.info(READ_MEMORY_METHOD_NAME, {
    bucketName,
    memoryId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("readMemory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("readMemory requires a method context");
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
    console.warn(`backtest-kit readMemory no pending signal for symbol=${symbol} memoryId=${memoryId}`);
    return null;
  }
  return await Memory.readMemory<T>({
    memoryId,
    signalId: signal.id,
    bucketName,
  });
}

/**
 * Searches memory entries for the current signal using BM25 full-text scoring.
 *
 * Reads symbol from execution context and signalId from the active pending signal.
 * If no pending signal exists, logs a warning and returns an empty array.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.query - Search query string
 * @returns Promise resolving to matching entries sorted by relevance, or empty array if no signal
 *
 * @deprecated Better use Memory.searchMemory with manual signalId argument
 * 
 * @example
 * ```typescript
 * import { searchMemory } from "backtest-kit";
 *
 * const results = await searchMemory({ bucketName: "my-strategy", query: "bullish trend" });
 * ```
 */
export async function searchMemory<T extends object = object>(dto: {
  bucketName: string;
  query: string;
}): Promise<Array<{ memoryId: string; score: number; content: T }>> {
  const { bucketName, query } = dto;
  backtest.loggerService.info(SEARCH_MEMORY_METHOD_NAME, {
    bucketName,
    query,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("searchMemory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("searchMemory requires a method context");
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
    console.warn(`backtest-kit searchMemory no pending signal for symbol=${symbol} query=${query}`);
    return [];
  }
  return await Memory.searchMemory<T>({
    query,
    signalId: signal.id,
    bucketName,
  });
}

/**
 * Lists all memory entries for the current signal.
 *
 * Reads symbol from execution context and signalId from the active pending signal.
 * If no pending signal exists, logs a warning and returns an empty array.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @returns Promise resolving to all stored entries, or empty array if no signal
 *
 * @deprecated Better use Memory.listMemory with manual signalId argument
 * 
 * @example
 * ```typescript
 * import { listMemory } from "backtest-kit";
 *
 * const entries = await listMemory({ bucketName: "my-strategy" });
 * ```
 */
export async function listMemory<T extends object = object>(dto: {
  bucketName: string;
}): Promise<Array<{ memoryId: string; content: T }>> {
  const { bucketName } = dto;
  backtest.loggerService.info(LIST_MEMORY_METHOD_NAME, {
    bucketName,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("listMemory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("listMemory requires a method context");
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
    console.warn(`backtest-kit listMemory no pending signal for symbol=${symbol}`);
    return [];
  }
  return await Memory.listMemory<T>({
    signalId: signal.id,
    bucketName,
  });
}

/**
 * Removes a memory entry for the current signal.
 *
 * Reads symbol from execution context and signalId from the active pending signal.
 * If no pending signal exists, logs a warning and returns without removing.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @returns Promise that resolves when removal is complete
 *
 * @deprecated Better use Memory.removeMemory with manual signalId argument
 * 
 * @example
 * ```typescript
 * import { removeMemory } from "backtest-kit";
 *
 * await removeMemory({ bucketName: "my-strategy", memoryId: "context" });
 * ```
 */
export async function removeMemory(dto: {
  bucketName: string;
  memoryId: string;
}): Promise<void> {
  const { bucketName, memoryId } = dto;
  backtest.loggerService.info(REMOVE_MEMORY_METHOD_NAME, {
    bucketName,
    memoryId,
  });
  if (!ExecutionContextService.hasContext()) {
    throw new Error("removeMemory requires an execution context");
  }
  if (!MethodContextService.hasContext()) {
    throw new Error("removeMemory requires a method context");
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
    console.warn(`backtest-kit removeMemory no pending signal for symbol=${symbol} memoryId=${memoryId}`);
    return;
  }
  await Memory.removeMemory({
    memoryId,
    signalId: signal.id,
    bucketName,
  });
}
