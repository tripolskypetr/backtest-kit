import { memoize, singleshot } from "functools-kit";
import createSearchIndex from "../utils/createSearchIndex";

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

export class MemoryInstance implements IMemoryInstance {
  private _index = createSearchIndex();

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}

  public waitForInit = singleshot(async () => {
    // todo for storage _index.upsert
  });

  public async writeMemory<T extends object = object>(
    memoryId: string,
    value: T,
  ) {
    //  _index.upsert
    this._index.upsert(
      memoryId,
      JSON.stringify(value),
      Object.values(value).join(","),
    );
  }

  public async readMemory<T extends object = object>(
    memoryId: string,
  ): Promise<T> {
    const valueRaw = this._index.read(memoryId);
    if (!valueRaw) {
      throw new Error(`MemoryInstance value not found memoryId=${memoryId}`);
    }
    return JSON.parse(valueRaw);
  }

  public async searchMemory<T extends object = object>(query: string) {
    return this._index.search(query).map<{
      memoryId: string;
      score: number;
      content: T;
    }>(SEARCH_MEMORY_FN);
  }

  public async listMemory<T extends object = object>() {
    return this._index.list().map<{
      memoryId: string;
      content: T;
    }>(LIST_MEMORY_FN);
  }

  public async removeMemory(memoryId: string) {
    return this._index.remove(memoryId);
  }
}

export class MemoryAdapter implements TMemoryIntance {
  private MemoryFactory: TMemoryInstanceCtor = MemoryInstance;

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
}

export const Memory = new MemoryAdapter();
