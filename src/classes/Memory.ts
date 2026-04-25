import { compose, memoize, singleshot } from "functools-kit";
import createSearchIndex, { SearchSettings } from "../utils/createSearchIndex";
import swarm from "../lib";
import { PersistMemoryAdapter } from "./Persist";
import { signalEmitter } from "../config/emitters";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}_${bucketName}`;

const LIST_MEMORY_FN = <T extends object = object>({ id, content }) => ({
  memoryId: id,
  content: <T>content,
});

const SEARCH_MEMORY_FN = <T extends object = object>({
  id,
  content,
  score,
}) => ({
  memoryId: id,
  content: <T>content,
  score,
});

const MEMORY_LOCAL_INSTANCE_METHOD_NAME_WRITE = "MemoryLocalInstance.writeMemory";
const MEMORY_LOCAL_INSTANCE_METHOD_NAME_READ = "MemoryLocalInstance.readMemory";
const MEMORY_LOCAL_INSTANCE_METHOD_NAME_SEARCH = "MemoryLocalInstance.searchMemory";
const MEMORY_LOCAL_INSTANCE_METHOD_NAME_LIST = "MemoryLocalInstance.listMemory";
const MEMORY_LOCAL_INSTANCE_METHOD_NAME_REMOVE = "MemoryLocalInstance.removeMemory";

const MEMORY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "MemoryPersistInstance.waitForInit";
const MEMORY_PERSIST_INSTANCE_METHOD_NAME_WRITE = "MemoryPersistInstance.writeMemory";
const MEMORY_PERSIST_INSTANCE_METHOD_NAME_READ = "MemoryPersistInstance.readMemory";
const MEMORY_PERSIST_INSTANCE_METHOD_NAME_SEARCH = "MemoryPersistInstance.searchMemory";
const MEMORY_PERSIST_INSTANCE_METHOD_NAME_LIST = "MemoryPersistInstance.listMemory";
const MEMORY_PERSIST_INSTANCE_METHOD_NAME_REMOVE = "MemoryPersistInstance.removeMemory";

const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE = "MemoryBacktestAdapter.dispose";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_WRITE = "MemoryBacktestAdapter.writeMemory";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_SEARCH = "MemoryBacktestAdapter.searchMemory";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_LIST = "MemoryBacktestAdapter.listMemory";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_REMOVE = "MemoryBacktestAdapter.removeMemory";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_READ = "MemoryBacktestAdapter.readMemory";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "MemoryBacktestAdapter.useLocal";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "MemoryBacktestAdapter.usePersist";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "MemoryBacktestAdapter.useDummy";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER = "MemoryBacktestAdapter.useMemoryAdapter";
const MEMORY_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "MemoryBacktestAdapter.clear";

const MEMORY_LIVE_ADAPTER_METHOD_NAME_DISPOSE = "MemoryLiveAdapter.dispose";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_WRITE = "MemoryLiveAdapter.writeMemory";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_SEARCH = "MemoryLiveAdapter.searchMemory";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_LIST = "MemoryLiveAdapter.listMemory";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_REMOVE = "MemoryLiveAdapter.removeMemory";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_READ = "MemoryLiveAdapter.readMemory";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "MemoryLiveAdapter.useLocal";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "MemoryLiveAdapter.usePersist";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "MemoryLiveAdapter.useDummy";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER = "MemoryLiveAdapter.useMemoryAdapter";
const MEMORY_LIVE_ADAPTER_METHOD_NAME_CLEAR = "MemoryLiveAdapter.clear";

const MEMORY_ADAPTER_METHOD_NAME_ENABLE = "MemoryAdapter.enable";
const MEMORY_ADAPTER_METHOD_NAME_DISABLE = "MemoryAdapter.disable";
const MEMORY_ADAPTER_METHOD_NAME_WRITE = "MemoryAdapter.writeMemory";
const MEMORY_ADAPTER_METHOD_NAME_SEARCH = "MemoryAdapter.searchMemory";
const MEMORY_ADAPTER_METHOD_NAME_LIST = "MemoryAdapter.listMemory";
const MEMORY_ADAPTER_METHOD_NAME_REMOVE = "MemoryAdapter.removeMemory";
const MEMORY_ADAPTER_METHOD_NAME_READ = "MemoryAdapter.readMemory";

/**
 * Interface for memory instance implementations.
 * Defines the contract for local, persist, and dummy backends.
 */
export interface IMemoryInstance {
  /**
   * Initialize the memory instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Write a value to memory.
   * @param memoryId - Unique entry identifier
   * @param value - Value to store
   * @param description - Optional BM25 index string; defaults to JSON.stringify(value)
   */
  writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    description: string,
  ): Promise<void>;

  /**
   * Search memory using BM25 full-text scoring.
   * @param query - Search query string
   * @returns Array of matching entries with scores
   */
  searchMemory<T extends object = object>(
    query: string,
    settings?: SearchSettings,
  ): Promise<
    Array<{
      memoryId: string;
      score: number;
      content: T;
    }>
  >;

  /**
   * List all entries in memory.
   * @returns Array of all stored entries
   */
  listMemory<T extends object = object>(): Promise<
    Array<{
      memoryId: string;
      content: T;
    }>
  >;

  /**
   * Remove an entry from memory.
   * @param memoryId - Unique entry identifier
   */
  removeMemory(memoryId: string): Promise<void>;

  /**
   * Read a single entry from memory.
   * @param memoryId - Unique entry identifier
   * @returns Entry value
   * @throws Error if entry not found
   */
  readMemory<T extends object = object>(memoryId: string): Promise<T>;
  /**
   * Releases any resources held by this instance.
   */
  dispose(): void;
}

/**
 * Constructor type for memory instance implementations.
 * Used for swapping backends via MemoryBacktestAdapter / MemoryLiveAdapter.
 */
export type TMemoryInstanceCtor = new (
  signalId: string,
  bucketName: string,
) => IMemoryInstance;

/**
 * Public surface of MemoryBacktestAdapter / MemoryLiveAdapter — IMemoryInstance minus waitForInit.
 * waitForInit is managed internally by the adapter.
 */
export type TMemoryInstance = Omit<
  {
    [key in keyof IMemoryInstance]: any;
  },
  keyof {
    waitForInit: never;
    dispose: never;
  }
>;

/**
 * In-memory BM25 search index backed instance.
 * All data lives in the process memory only - no disk persistence.
 *
 * Features:
 * - Full-text BM25 search via createSearchIndex
 * - Scoped per (signalId, bucketName) pair
 */
export class MemoryLocalInstance implements IMemoryInstance {
  private _index = createSearchIndex();

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  /**
   * No-op initialization - local index needs no setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * Write a value into the BM25 index.
   * @param memoryId - Unique entry identifier
   * @param value - Value to store and index
   * @param description - BM25 index string
   */
  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    description: string,
  ) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_WRITE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    this._index.upsert({
      id: memoryId,
      content: value,
      index: description,
      priority: Date.now(),
    });
  }

  /**
   * Read a single entry from the in-memory index.
   * @param memoryId - Unique entry identifier
   * @returns Parsed entry value
   * @throws Error if entry not found
   */
  public async readMemory<T extends object = object>(
    memoryId: string,
  ): Promise<T> {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_READ, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const value = this._index.read(memoryId);
    if (!value) {
      throw new Error(`MemoryLocalInstance value not found memoryId=${memoryId}`);
    }
    return <T>value;
  }

  /**
   * Search entries using BM25 full-text scoring.
   * @param query - Search query string
   * @returns Matching entries sorted by relevance score
   */
  public async searchMemory<T extends object = object>(query: string, settings?: SearchSettings) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query, settings).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

  /**
   * List all entries stored in the in-memory index.
   * @returns Array of all stored entries
   */
  public async listMemory<T extends object = object>() {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_LIST, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return this._index.list().map<{
      memoryId: string;
      content: T;
    }>(LIST_MEMORY_FN);
  }

  /**
   * Remove an entry from the in-memory index.
   * @param memoryId - Unique entry identifier
   */
  public async removeMemory(memoryId: string) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_REMOVE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    return this._index.remove(memoryId);
  }

  /** Releases resources held by this instance. */
  public dispose(): void {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
  }
}

/**
 * File-system backed instance with in-memory BM25 index.
 * Data is persisted atomically to disk via PersistMemoryAdapter.
 * The BM25 index is rebuilt from disk on waitForInit.
 *
 * Storage layout:
 *   ./dump/memory/<bucketName>/<signalId>/<memoryId>.json
 *
 * Features:
 * - Crash-safe atomic file writes
 * - Full-text BM25 search (index rebuilt from disk on init)
 * - Scoped per (signalId, bucketName) pair
 */
export class MemoryPersistInstance implements IMemoryInstance {
  private _index = createSearchIndex();

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  /**
   * Initialize persistence storage and rebuild BM25 index from disk.
   * @param initial - Whether this is the first initialization
   */
  public async waitForInit(initial: boolean): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      initial,
    });
    await PersistMemoryAdapter.waitForInit(this.signalId, this.bucketName, initial);
    for await (const { memoryId, data: { data, index, priority } } of PersistMemoryAdapter.listMemoryData(this.signalId, this.bucketName)) {
      this._index.upsert({
        id: memoryId,
        content: data,
        index,
        priority,
      });
    }
  }

  /**
   * Write a value to disk and update the BM25 index.
   * @param memoryId - Unique entry identifier
   * @param value - Value to persist and index
   * @param index - BM25 index string; defaults to JSON.stringify(value)
   */
  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    index = JSON.stringify(value),
  ): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WRITE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const priority = Date.now();
    await PersistMemoryAdapter.writeMemoryData(
      { data: value, priority, removed: false, index },
      this.signalId,
      this.bucketName,
      memoryId,
    );
    this._index.upsert({
      id: memoryId,
      content: value,
      index,
      priority,
    });
  }

  /**
   * Read a single entry from disk.
   * @param memoryId - Unique entry identifier
   * @returns Entry value
   * @throws Error if entry not found
   */
  public async readMemory<T extends object = object>(
    memoryId: string,
  ): Promise<T> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_READ, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const data = await PersistMemoryAdapter.readMemoryData(this.signalId, this.bucketName, memoryId);
    if (!data) {
      throw new Error(`MemoryPersistInstance value not found memoryId=${memoryId}`);
    }
    return <T>data.data;
  }

  /**
   * Search entries using BM25 index rebuilt from disk on init.
   * @param query - Search query string
   * @returns Matching entries sorted by relevance score
   */
  public async searchMemory<T extends object = object>(query: string, settings?: SearchSettings) {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query, settings).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

  /**
   * List all entries from the in-memory index (populated from disk on init).
   * @returns Array of all stored entries
   */
  public async listMemory<T extends object = object>() {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_LIST, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return this._index.list().map<{
      memoryId: string;
      content: T;
    }>(LIST_MEMORY_FN);
  }

  /**
   * Remove an entry from disk and from the BM25 index.
   * @param memoryId - Unique entry identifier
   */
  public async removeMemory(memoryId: string): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_REMOVE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    await PersistMemoryAdapter.removeMemoryData(this.signalId, this.bucketName, memoryId);
    this._index.remove(memoryId);
  }

  /** Releases resources held by this instance. */
  public dispose(): void {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    PersistMemoryAdapter.dispose(
      this.signalId,
      this.bucketName,
    );
  }
}

/**
 * No-op memory instance that discards all writes.
 * Used for disabling memory in tests or dry-run scenarios.
 */
export class MemoryDummyInstance implements IMemoryInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public async waitForInit(): Promise<void> {
    void 0;
  }

  /**
   * No-op write - discards the value.
   * @returns Promise that resolves immediately
   */
  public async writeMemory(): Promise<void> {
    void 0;
  }

  /**
   * No-op read - always throws.
   * @throws Error always
   */
  public async readMemory<T extends object = object>(_memoryId: string): Promise<T> {
    throw new Error("MemoryDummyInstance: readMemory not supported");
  }

  /**
   * No-op search - returns empty array.
   * @returns Empty array
   */
  public async searchMemory<T extends object = object>(): Promise<Array<{ memoryId: string; score: number; content: T }>> {
    return [];
  }

  /**
   * No-op list - returns empty array.
   * @returns Empty array
   */
  public async listMemory<T extends object = object>(): Promise<Array<{ memoryId: string; content: T }>> {
    return [];
  }

  /**
   * No-op remove.
   * @returns Promise that resolves immediately
   */
  public async removeMemory(): Promise<void> {
    void 0;
  }

  /** No-op. */
  public dispose(): void {
    void 0;
  }
}

/**
 * Backtest memory adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable memory instance implementations
 * - Default backend: MemoryLocalInstance (in-memory BM25, no disk persistence)
 * - Alternative backends: MemoryPersistInstance, MemoryDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useMemoryAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from MemoryAdapter
 *
 * Use this adapter for backtest memory storage.
 */
export class MemoryBacktestAdapter implements TMemoryInstance {
  private MemoryFactory: TMemoryInstanceCtor = MemoryLocalInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: string): IMemoryInstance =>
      Reflect.construct(this.MemoryFactory, [signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by MemoryAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Write a value to memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.value - Value to store
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.description - BM25 index string; defaults to JSON.stringify(value)
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_WRITE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.writeMemory<T>(dto.memoryId, dto.value, dto.description);
  };

  /**
   * Search memory using BM25 full-text scoring.
   * @param dto.query - Search query string
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    settings?: SearchSettings;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_SEARCH, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      query: dto.query,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.searchMemory<T>(dto.query, dto.settings);
  };

  /**
   * List all entries in memory.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_LIST, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.listMemory<T>();
  };

  /**
   * Remove an entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_REMOVE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.removeMemory(dto.memoryId);
  };

  /**
   * Read a single entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_READ, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.readMemory<T>(dto.memoryId);
  };

  /**
   * Switches to in-memory BM25 adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.MemoryFactory = MemoryLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to ./dump/memory/<signalId>/<bucketName>/.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.MemoryFactory = MemoryPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.MemoryFactory = MemoryDummyInstance;
  };

  /**
   * Switches to a custom memory adapter implementation.
   * @param Ctor - Constructor for the custom memory instance
   */
  public useMemoryAdapter = (Ctor: TMemoryInstanceCtor): void => {
    swarm.loggerService.info(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this.MemoryFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Live trading memory adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable memory instance implementations
 * - Default backend: MemoryPersistInstance (file-system backed, survives restarts)
 * - Alternative backends: MemoryLocalInstance, MemoryDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useMemoryAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from MemoryAdapter
 *
 * Use this adapter for live trading memory storage.
 */
export class MemoryLiveAdapter implements TMemoryInstance {
  private MemoryFactory: TMemoryInstanceCtor = MemoryPersistInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: string): IMemoryInstance =>
      Reflect.construct(this.MemoryFactory, [signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by MemoryAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Write a value to memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.value - Value to store
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.description - BM25 index string; defaults to JSON.stringify(value)
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_WRITE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.writeMemory<T>(dto.memoryId, dto.value, dto.description);
  };

  /**
   * Search memory using BM25 full-text scoring.
   * @param dto.query - Search query string
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    settings?: SearchSettings;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_SEARCH, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      query: dto.query,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.searchMemory<T>(dto.query, dto.settings);
  };

  /**
   * List all entries in memory.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_LIST, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.listMemory<T>();
  };

  /**
   * Remove an entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_REMOVE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.removeMemory(dto.memoryId);
  };

  /**
   * Read a single entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_READ, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.readMemory<T>(dto.memoryId);
  };

  /**
   * Switches to in-memory BM25 adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.MemoryFactory = MemoryLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to ./dump/memory/<signalId>/<bucketName>/.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.MemoryFactory = MemoryPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.MemoryFactory = MemoryDummyInstance;
  };

  /**
   * Switches to a custom memory adapter implementation.
   * @param Ctor - Constructor for the custom memory instance
   */
  public useMemoryAdapter = (Ctor: TMemoryInstanceCtor): void => {
    swarm.loggerService.info(MEMORY_LIVE_ADAPTER_METHOD_NAME_USE_ADAPTER);
    this.MemoryFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(MEMORY_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Main memory adapter that manages both backtest and live memory storage.
 *
 * Features:
 * - Subscribes to signal lifecycle events (cancelled/closed) to dispose stale instances
 * - Routes all operations to MemoryBacktest or MemoryLive based on dto.backtest
 * - Singleshot enable pattern prevents duplicate subscriptions
 * - Cleanup function for proper unsubscription
 */
export class MemoryAdapter {
  /**
   * Enables memory storage by subscribing to signal lifecycle events.
   * Clears memoized instances in MemoryBacktest and MemoryLive when a signal
   * is cancelled or closed, preventing stale instances from accumulating.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public enable = singleshot(() => {
    swarm.loggerService.info(MEMORY_ADAPTER_METHOD_NAME_ENABLE);

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => {
        MemoryBacktest.disposeSignal(signal.id);
        MemoryLive.disposeSignal(signal.id);
      });

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => {
        MemoryBacktest.disposeSignal(signal.id);
        MemoryLive.disposeSignal(signal.id);
      });

    return compose(
      () => unCancel(),
      () => unClose(),
      () => this.enable.clear(),
    );
  });

  /**
   * Disables memory storage by unsubscribing from signal lifecycle events.
   * Safe to call multiple times.
   */
  public disable = () => {
    swarm.loggerService.info(MEMORY_ADAPTER_METHOD_NAME_DISABLE);
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  /**
   * Write a value to memory.
   * Routes to MemoryBacktest or MemoryLive based on dto.backtest.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.value - Value to store
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.description - BM25 index string; defaults to JSON.stringify(value)
   * @param dto.backtest - Flag indicating if the context is backtest or live
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
    backtest: boolean;
  }) => {
    if (!this.enable.hasValue()) {
      throw new Error("MemoryAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(MEMORY_ADAPTER_METHOD_NAME_WRITE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await MemoryBacktest.writeMemory(dto);
    }
    return await MemoryLive.writeMemory(dto);
  };

  /**
   * Search memory using BM25 full-text scoring.
   * Routes to MemoryBacktest or MemoryLive based on dto.backtest.
   * @param dto.query - Search query string
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    settings?: SearchSettings;
    backtest: boolean;
  }) => {
    if (!this.enable.hasValue()) {
      throw new Error("MemoryAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(MEMORY_ADAPTER_METHOD_NAME_SEARCH, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      query: dto.query,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await MemoryBacktest.searchMemory<T>(dto);
    }
    return await MemoryLive.searchMemory<T>(dto);
  };

  /**
   * List all entries in memory.
   * Routes to MemoryBacktest or MemoryLive based on dto.backtest.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
    backtest: boolean;
  }) => {
    if (!this.enable.hasValue()) {
      throw new Error("MemoryAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(MEMORY_ADAPTER_METHOD_NAME_LIST, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await MemoryBacktest.listMemory<T>(dto);
    }
    return await MemoryLive.listMemory<T>(dto);
  };

  /**
   * Remove an entry from memory.
   * Routes to MemoryBacktest or MemoryLive based on dto.backtest.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.backtest - Flag indicating if the context is backtest or live
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    backtest: boolean;
  }) => {
    if (!this.enable.hasValue()) {
      throw new Error("MemoryAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(MEMORY_ADAPTER_METHOD_NAME_REMOVE, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await MemoryBacktest.removeMemory(dto);
    }
    return await MemoryLive.removeMemory(dto);
  };

  /**
   * Read a single entry from memory.
   * Routes to MemoryBacktest or MemoryLive based on dto.backtest.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    backtest: boolean;
  }) => {
    if (!this.enable.hasValue()) {
      throw new Error("MemoryAdapter is not enabled. Call enable() first.");
    }
    swarm.loggerService.debug(MEMORY_ADAPTER_METHOD_NAME_READ, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      memoryId: dto.memoryId,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await MemoryBacktest.readMemory<T>(dto);
    }
    return await MemoryLive.readMemory<T>(dto);
  };
}

/**
 * Global singleton instance of MemoryAdapter.
 * Provides unified memory management for backtest and live trading.
 */
export const Memory = new MemoryAdapter();

/**
 * Global singleton instance of MemoryLiveAdapter.
 * Provides live trading memory storage with pluggable backends.
 */
export const MemoryLive = new MemoryLiveAdapter();

/**
 * Global singleton instance of MemoryBacktestAdapter.
 * Provides backtest memory storage with pluggable backends.
 */
export const MemoryBacktest = new MemoryBacktestAdapter();
