import { memoize, singleshot } from "functools-kit";
import createSearchIndex from "../utils/createSearchIndex";
import swarm from "../lib";
import { PersistMemoryAdapter } from "./Persist";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}-${bucketName}`;

const LIST_MEMORY_FN = <T extends object = object>({ id, content }) => ({
  memoryId: id,
  content: <T>JSON.parse(content),
});

const SEARCH_MEMORY_FN = <T extends object = object>({
  id,
  content,
  score,
}) => ({
  memoryId: id,
  content: <T>JSON.parse(content),
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

const MEMORY_ADAPTER_METHOD_NAME_USE_LOCAL = "MemoryAdapter.useLocal";
const MEMORY_ADAPTER_METHOD_NAME_USE_PERSIST = "MemoryAdapter.usePersist";
const MEMORY_ADAPTER_METHOD_NAME_USE_DUMMY = "MemoryAdapter.useDummy";

export interface IMemoryInstance {
  waitForInit(initial: boolean): Promise<void>;
  writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
  ): Promise<void>;
  searchMemory<T extends object = object>(
    query: string,
  ): Promise<
    Array<{
      memoryId: string;
      score: number;
      content: T;
    }>
  >;
  listMemory<T extends object = object>(): Promise<
    Array<{
      memoryId: string;
      content: T;
    }>
  >;
  removeMemory(memoryId: string): Promise<void>;
  readMemory<T extends object = object>(memoryId: string): Promise<T>;
}

export type TMemoryInstanceCtor = new (
  signalId: string,
  bucketName: string,
) => IMemoryInstance;

export type TMemoryIntance = Omit<
  {
    [key in keyof IMemoryInstance]: any;
  },
  keyof {
    waitForInit: never;
  }
>;

/**
 * In-memory BM25 search index backed instance.
 * All data lives in the process memory only — no disk persistence.
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

  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
  ) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_WRITE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    this._index.upsert(
      memoryId,
      JSON.stringify(value),
      Object.values(value).join(","),
    );
  }

  public async readMemory<T extends object = object>(
    memoryId: string,
  ): Promise<T> {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_READ, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    const valueRaw = this._index.read(memoryId);
    if (!valueRaw) {
      throw new Error(`MemoryLocalInstance value not found memoryId=${memoryId}`);
    }
    return JSON.parse(valueRaw);
  }

  public async searchMemory<T extends object = object>(query: string) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

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

  public async removeMemory(memoryId: string) {
    swarm.loggerService.debug(MEMORY_LOCAL_INSTANCE_METHOD_NAME_REMOVE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    return this._index.remove(memoryId);
  }
}

/**
 * File-system backed instance with in-memory BM25 index.
 * Data is persisted atomically to disk via PersistMemoryAdapter.
 * The BM25 index is rebuilt from disk on waitForInit.
 *
 * Storage layout:
 *   ./dump/data/memory/<bucketName>/<signalId>/<memoryId>.json
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

  public async waitForInit(initial: boolean): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      initial,
    });
    await PersistMemoryAdapter.waitForInit(this.signalId, this.bucketName, initial);
    for await (const { memoryId, data } of PersistMemoryAdapter.listMemoryData(this.signalId, this.bucketName)) {
      this._index.upsert(
        memoryId,
        JSON.stringify(data),
        Object.values(data).join(","),
      );
    }
  }

  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
  ): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_WRITE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    await PersistMemoryAdapter.writeMemoryData(value, this.signalId, this.bucketName, memoryId);
    this._index.upsert(
      memoryId,
      JSON.stringify(value),
      Object.values(value).join(","),
    );
  }

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
    return data as T;
  }

  public async searchMemory<T extends object = object>(query: string) {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_SEARCH, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      query,
    });
    return this._index.search(query).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

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

  public async removeMemory(memoryId: string): Promise<void> {
    swarm.loggerService.debug(MEMORY_PERSIST_INSTANCE_METHOD_NAME_REMOVE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      memoryId,
    });
    await PersistMemoryAdapter.removeMemoryData(this.signalId, this.bucketName, memoryId);
    this._index.remove(memoryId);
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
   * No-op write — discards the value.
   * @returns Promise that resolves immediately
   */
  public async writeMemory(): Promise<void> {
    void 0;
  }

  /**
   * No-op read — always throws.
   * @throws Error always
   */
  public async readMemory<T extends object = object>(_memoryId: string): Promise<T> {
    throw new Error("MemoryDummyInstance: readMemory not supported");
  }

  /**
   * No-op search — returns empty array.
   * @returns Empty array
   */
  public async searchMemory<T extends object = object>(): Promise<Array<{ memoryId: string; score: number; content: T }>> {
    return [];
  }

  /**
   * No-op list — returns empty array.
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
}

export class MemoryAdapter implements TMemoryIntance {
  private MemoryFactory: TMemoryInstanceCtor = MemoryLocalInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: string) =>
      Reflect.construct(this.MemoryFactory, [signalId, bucketName]),
  );

  public writeMemory = async <T extends object = object>(dto: {
    memoryId: string;
    value: T;
    signalId: string;
    bucketName: string;
  }) => {
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.writeMemory<T>(dto.memoryId, dto.value);
  };

  public searchMemory = async <T extends object = object>(dto: {
    query: string;
    signalId: string;
    bucketName: string;
  }) => {
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.searchMemory<T>(dto.query);
  };

  public listMemory = async <T extends object = object>(dto: {
    signalId: string;
    bucketName: string;
  }) => {
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.listMemory<T>();
  };

  public removeMemory = async (dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName);
    await instance.waitForInit(isInitial);
    return await instance.removeMemory(dto.memoryId);
  };

  public readMemory = async <T extends object = object>(dto: {
    memoryId: string;
    signalId: string;
    bucketName: string;
  }) => {
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
    swarm.loggerService.info(MEMORY_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.MemoryFactory = MemoryLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to ./dump/data/memory/<bucketName>/<signalId>/.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(MEMORY_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.MemoryFactory = MemoryPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(MEMORY_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.MemoryFactory = MemoryDummyInstance;
  };
}

export const Memory = new MemoryAdapter();
