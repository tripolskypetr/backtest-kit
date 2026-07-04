import { compose, memoize, singleshot } from "functools-kit";
import createSearchIndex, { SearchSettings } from "../utils/createSearchIndex";
import swarm from "../lib";
import { PersistMemoryAdapter } from "./Persist";
import { signalEmitter } from "../config/emitters";

// NUL separator: cannot appear in signal ids or bucket names, so the
// disposeSignal prefix match never crosses into another signal whose id
// merely starts with this one (e.g. "sig" vs "sig_2" with a "_" separator).
const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}\u0000${bucketName}`;

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
   * @param when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    description: string,
    when: Date,
  ): Promise<void>;

  /**
   * Search memory using BM25 full-text scoring.
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param query - Search query string
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of matching entries with scores
   */
  searchMemory<T extends object = object>(
    query: string,
    when: Date,
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
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  listMemory<T extends object = object>(when: Date): Promise<
    Array<{
      memoryId: string;
      content: T;
    }>
  >;

  /**
   * Remove an entry from memory.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  removeMemory(memoryId: string, when: Date): Promise<void>;

  /**
   * Read a single entry from memory.
   * Behaves as not-found if the stored `when` is greater than the requested `when`.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Entry value
   * @throws Error if entry not found (or shadowed by look-ahead)
   */
  readMemory<T extends object = object>(memoryId: string, when: Date): Promise<T>;
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
   * @param when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    description: string,
    when: Date,
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
      when: when.getTime(),
    });
  }

  /**
   * Read a single entry from the in-memory index.
   * Behaves as not-found if the stored `when` is greater than the requested `when`.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Parsed entry value
   * @throws Error if entry not found (or shadowed by look-ahead)
   */
  public async readMemory<T extends object = object>(
    memoryId: string,
    when: Date,
  ): Promise<T> {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_READ, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const value = this._index.read(memoryId, when.getTime());
    if (!value) {
      throw new Error(`MemoryLocalInstance value not found memoryId=${memoryId}`);
    }
    return <T>value;
  }

  /**
   * Search entries using BM25 full-text scoring.
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param query - Search query string
   * @param when - Logical timestamp at which the search is happening (look-ahead guard)
   * @returns Matching entries sorted by relevance score
   */
  public async searchMemory<T extends object = object>(query: string, when: Date, settings?: SearchSettings) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query, when.getTime(), settings).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

  /**
   * List all entries stored in the in-memory index.
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param when - Logical timestamp at which the list is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  public async listMemory<T extends object = object>(when: Date) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_LIST, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return this._index.list(when.getTime()).map<{
      memoryId: string;
      content: T;
    }>(LIST_MEMORY_FN);
  }

  /**
   * Remove an entry from the in-memory index.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  public async removeMemory(memoryId: string, _when: Date) {
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
   * Singleshot: adapters call waitForInit on every operation, but the disk
   * rescan and index rebuild must run exactly once per instance — otherwise
   * every read/write/search pays O(files) fs reads and a concurrent rebuild
   * can resurrect an entry that removeMemory just dropped from the index.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean): Promise<void> => {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      initial,
    });
    await PersistMemoryAdapter.waitForInit(this.signalId, this.bucketName, initial);
    for await (const { memoryId, data: { data, index, priority, when } } of PersistMemoryAdapter.listMemoryData(this.signalId, this.bucketName)) {
      this._index.upsert({
        id: memoryId,
        content: data,
        index,
        priority,
        when,
      });
    }
  });

  /**
   * Write a value to disk and update the BM25 index.
   * @param memoryId - Unique entry identifier
   * @param value - Value to persist and index
   * @param index - BM25 index string; defaults to JSON.stringify(value)
   * @param when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
    index: string,
    when: Date,
  ): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WRITE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const priority = Date.now();
    const whenMs = when.getTime();
    await PersistMemoryAdapter.writeMemoryData(
      { data: value, priority, removed: false, index, when: whenMs },
      this.signalId,
      this.bucketName,
      memoryId,
      when,
    );
    this._index.upsert({
      id: memoryId,
      content: value,
      index,
      priority,
      when: whenMs,
    });
  }

  /**
   * Read a single entry from disk.
   * Behaves as not-found if the stored `when` is greater than the requested `when`.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Entry value
   * @throws Error if entry not found (or shadowed by look-ahead)
   */
  public async readMemory<T extends object = object>(
    memoryId: string,
    when: Date,
  ): Promise<T> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_READ, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const data = await PersistMemoryAdapter.readMemoryData(this.signalId, this.bucketName, memoryId);
    if (!data || data.when > when.getTime()) {
      throw new Error(`MemoryPersistInstance value not found memoryId=${memoryId}`);
    }
    return <T>data.data;
  }

  /**
   * Search entries using BM25 index rebuilt from disk on init.
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param query - Search query string
   * @param when - Logical timestamp at which the search is happening (look-ahead guard)
   * @returns Matching entries sorted by relevance score
   */
  public async searchMemory<T extends object = object>(query: string, when: Date, settings?: SearchSettings) {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query, when.getTime(), settings).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

  /**
   * List all entries from the in-memory index (populated from disk on init).
   * Filters out entries whose `when` is greater than the requested `when`.
   * @param when - Logical timestamp at which the list is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  public async listMemory<T extends object = object>(when: Date) {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_LIST, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    return this._index.list(when.getTime()).map<{
      memoryId: string;
      content: T;
    }>(LIST_MEMORY_FN);
  }

  /**
   * Remove an entry from disk and from the BM25 index.
   * @param memoryId - Unique entry identifier
   * @param when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  public async removeMemory(memoryId: string, _when: Date): Promise<void> {
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
  public async writeMemory<T extends object = object>(
    _memoryId: string,
    _value: T,
    _description: string,
    _when: Date,
  ): Promise<void> {
    void 0;
  }

  /**
   * No-op read - always throws.
   * @throws Error always
   */
  public async readMemory<T extends object = object>(_memoryId: string, _when: Date): Promise<T> {
    throw new Error("MemoryDummyInstance: readMemory not supported");
  }

  /**
   * No-op search - returns empty array.
   * @returns Empty array
   */
  public async searchMemory<T extends object = object>(
    _query: string,
    _when: Date,
    _settings?: SearchSettings,
  ): Promise<Array<{ memoryId: string; score: number; content: T }>> {
    return [];
  }

  /**
   * No-op list - returns empty array.
   * @returns Empty array
   */
  public async listMemory<T extends object = object>(_when: Date): Promise<Array<{ memoryId: string; content: T }>> {
    return [];
  }

  /**
   * No-op remove.
   * @returns Promise that resolves immediately
   */
  public async removeMemory(_memoryId: string, _when: Date): Promise<void> {
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
   * @param dto.when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
    when: Date;
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
    return await instance.writeMemory<T>(dto.memoryId, dto.value, dto.description, dto.when);
  };

  /**
   * Search memory using BM25 full-text scoring.
   * @param dto.query - Search query string
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the search is happening (look-ahead guard)
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.searchMemory<T>(dto.query, dto.when, dto.settings);
  };

  /**
   * List all entries in memory.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the list is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
    when: Date;
  }) => {
    swarm.loggerService.debug(MEMORY_BACKTEST_ADAPTER_METHOD_NAME_LIST, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.listMemory<T>(dto.when);
  };

  /**
   * Remove an entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.removeMemory(dto.memoryId, dto.when);
  };

  /**
   * Read a single entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.readMemory<T>(dto.memoryId, dto.when);
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
   * @param dto.when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
    when: Date;
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
    return await instance.writeMemory<T>(dto.memoryId, dto.value, dto.description, dto.when);
  };

  /**
   * Search memory using BM25 full-text scoring.
   * @param dto.query - Search query string
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the search is happening (look-ahead guard)
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.searchMemory<T>(dto.query, dto.when, dto.settings);
  };

  /**
   * List all entries in memory.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the list is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
    when: Date;
  }) => {
    swarm.loggerService.debug(MEMORY_LIVE_ADAPTER_METHOD_NAME_LIST, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.listMemory<T>(dto.when);
  };

  /**
   * Remove an entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.removeMemory(dto.memoryId, dto.when);
  };

  /**
   * Read a single entry from memory.
   * @param dto.memoryId - Unique entry identifier
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    when: Date;
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
    return await instance.readMemory<T>(dto.memoryId, dto.when);
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
   * @param dto.when - Logical timestamp this entry belongs to (look-ahead guard)
   */
  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
    description: string;
    backtest: boolean;
    when: Date;
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
   * @param dto.when - Logical timestamp at which the search is happening (look-ahead guard)
   * @returns Matching entries sorted by relevance score
   */
  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
    settings?: SearchSettings;
    backtest: boolean;
    when: Date;
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
   * @param dto.when - Logical timestamp at which the list is happening (look-ahead guard)
   * @returns Array of all stored entries
   */
  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
    backtest: boolean;
    when: Date;
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
   * @param dto.when - Logical timestamp (kept for API consistency; removal is by UUID)
   */
  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    backtest: boolean;
    when: Date;
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
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Entry value
   * @throws Error if entry not found
   */
  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
    backtest: boolean;
    when: Date;
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
