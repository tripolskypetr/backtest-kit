import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { IPublicSignalRow, IScheduledSignalRow } from "../interfaces/Strategy.interface";
import { Memory } from "../classes/Memory";

const WRITE_MEMORY_METHOD_NAME = "memory.writeMemory";
const READ_MEMORY_METHOD_NAME = "memory.readMemory";
const SEARCH_MEMORY_METHOD_NAME = "memory.searchMemory";
const LIST_MEMORY_METHOD_NAME = "memory.listMemory";
const REMOVE_MEMORY_METHOD_NAME = "memory.removeMemory";

/**
 * Writes a value to memory scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @param dto.value - Value to store
 * @param dto.description - BM25 index string for contextual search
 * @returns Promise that resolves when write is complete
 *
 * @example
 * ```typescript
 * import { writeMemory } from "backtest-kit";
 *
 * await writeMemory({ bucketName: "my-strategy", memoryId: "context", value: { trend: "up", confidence: 0.9 }, description: "Signal context at entry" });
 * ```
 */
export async function writeMemory<T extends object = object>(dto: {
  bucketName: string;
  memoryId: string;
  value: T;
  description: string;
}): Promise<void> {
  const { bucketName, memoryId, value, description } = dto;
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
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Memory.writeMemory({
      memoryId,
      value,
      signalId: signal.id,
      bucketName,
      description,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Memory.writeMemory({
      memoryId,
      value,
      signalId: signal.id,
      bucketName,
      description,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`writeMemory requires a pending or scheduled signal for symbol=${symbol} memoryId=${memoryId}`);
}

/**
 * Reads a value from memory scoped to the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @returns Promise resolving to stored value
 * @throws Error if no pending or scheduled signal exists, or if entry not found
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
}): Promise<T> {
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
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.readMemory<T>({
      memoryId,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.readMemory<T>({
      memoryId,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  throw new Error(`readMemory requires a pending or scheduled signal for symbol=${symbol} memoryId=${memoryId}`);
}

/**
 * Searches memory entries for the current signal using BM25 full-text scoring.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.query - Search query string
 * @returns Promise resolving to matching entries sorted by relevance
 * @throws Error if no pending or scheduled signal exists
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
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.searchMemory<T>({
      query,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.searchMemory<T>({
      query,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  throw new Error(`searchMemory requires a pending or scheduled signal for symbol=${symbol} query=${query}`);
}

/**
 * Lists all memory entries for the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @returns Promise resolving to all stored entries
 * @throws Error if no pending or scheduled signal exists
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
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.listMemory<T>({
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    return await Memory.listMemory<T>({
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
  }
  throw new Error(`listMemory requires a pending or scheduled signal for symbol=${symbol} bucketName=${bucketName}`);
}

/**
 * Removes a memory entry for the current signal.
 *
 * Resolves the active pending or scheduled signal automatically from execution context.
 * Automatically detects backtest/live mode from execution context.
 *
 * @param dto.bucketName - Memory bucket name
 * @param dto.memoryId - Unique memory entry identifier
 * @returns Promise that resolves when removal is complete
 * @throws Error if no pending or scheduled signal exists
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
  let signal: IPublicSignalRow | IScheduledSignalRow;
  if (
    signal = await backtest.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Memory.removeMemory({
      memoryId,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
    return;
  }
  if (
    signal = await backtest.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    )
  ) {
    await Memory.removeMemory({
      memoryId,
      signalId: signal.id,
      bucketName,
      backtest: isBacktest,
    });
    return;
  }
  throw new Error(`removeMemory requires a pending or scheduled signal for symbol=${symbol} memoryId=${memoryId}`);
}
