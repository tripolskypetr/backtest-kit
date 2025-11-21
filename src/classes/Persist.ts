import fs from "fs/promises";
import {
  getErrorMessage,
  makeExtendable,
  memoize,
  not,
  retry,
  singleshot,
  trycatch,
} from "functools-kit";
import { join } from "path";
import { writeFileAtomic } from "../utils/writeFileAtomic";
import swarm from "../lib";
import { ISignalRow, StrategyName } from "../interfaces/Strategy.interface";

const BASE_WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");

const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER =
  "PersistSignalUtils.usePersistSignalAdapter";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA =
  "PersistSignalUtils.readSignalData";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistSignalUtils.writeSignalData";

const PERSIST_BASE_METHOD_NAME_CTOR = "PersistBase.CTOR";
const PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT = "PersistBase.waitForInit";
const PERSIST_BASE_METHOD_NAME_READ_VALUE = "PersistBase.readValue";
const PERSIST_BASE_METHOD_NAME_WRITE_VALUE = "PersistBase.writeValue";
const PERSIST_BASE_METHOD_NAME_HAS_VALUE = "PersistBase.hasValue";
const PERSIST_BASE_METHOD_NAME_REMOVE_VALUE = "PersistBase.removeValue";
const PERSIST_BASE_METHOD_NAME_REMOVE_ALL = "PersistBase.removeAll";
const PERSIST_BASE_METHOD_NAME_VALUES = "PersistBase.values";
const PERSIST_BASE_METHOD_NAME_KEYS = "PersistBase.keys";

const BASE_WAIT_FOR_INIT_FN_METHOD_NAME = "PersistBase.waitForInitFn";

const BASE_UNLINK_RETRY_COUNT = 5;
const BASE_UNLINK_RETRY_DELAY = 1_000;

/**
 * Signal data stored in persistence layer.
 * Contains nullable signal for atomic updates.
 */
export interface ISignalData {
  /** Current signal state (null when no active signal) */
  signalRow: ISignalRow | null;
}

/**
 * Type helper for PersistBase instance.
 */
export type TPersistBase = InstanceType<typeof PersistBase>;

/**
 * Constructor type for PersistBase.
 * Used for custom persistence adapters.
 */
export type TPersistBaseCtor<
  EntityName extends string = string,
  Entity extends IEntity = IEntity
> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;

/**
 * Entity identifier - string or number.
 */
export type EntityId = string | number;

/**
 * Base interface for persisted entities.
 */
export interface IEntity {}

/**
 * Persistence interface for CRUD operations.
 * Implemented by PersistBase.
 */
export interface IPersistBase<Entity extends IEntity = IEntity> {
  /**
   * Initialize persistence directory and validate existing files.
   * Uses singleshot to ensure one-time execution.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read entity from persistence storage.
   *
   * @param entityId - Unique entity identifier
   * @returns Promise resolving to entity data
   * @throws Error if entity not found or read fails
   */
  readValue(entityId: EntityId): Promise<Entity>;

  /**
   * Check if entity exists in storage.
   *
   * @param entityId - Unique entity identifier
   * @returns Promise resolving to true if exists, false otherwise
   */
  hasValue(entityId: EntityId): Promise<boolean>;

  /**
   * Write entity to storage with atomic file writes.
   *
   * @param entityId - Unique entity identifier
   * @param entity - Entity data to persist
   * @returns Promise that resolves when write is complete
   * @throws Error if write fails
   */
  writeValue(entityId: EntityId, entity: Entity): Promise<void>;
}

const BASE_WAIT_FOR_INIT_FN = async (self: TPersistBase): Promise<void> => {
  swarm.loggerService.debug(BASE_WAIT_FOR_INIT_FN_METHOD_NAME, {
    entityName: self.entityName,
    directory: self._directory,
  });
  await fs.mkdir(self._directory, { recursive: true });
  for await (const key of self.keys()) {
    try {
      await self.readValue(key);
    } catch {
      const filePath = self._getFilePath(key);
      console.error(
        `backtest-kit PersistBase found invalid document for filePath=${filePath} entityName=${self.entityName}`
      );
      if (await not(BASE_WAIT_FOR_INIT_UNLINK_FN(filePath))) {
        console.error(
          `backtest-kit PersistBase failed to remove invalid document for filePath=${filePath} entityName=${self.entityName}`
        );
      }
    }
  }
};

const BASE_WAIT_FOR_INIT_UNLINK_FN = async (filePath: string) =>
  trycatch(
    retry(
      async () => {
        try {
          await fs.unlink(filePath);
          return true;
        } catch (error) {
          console.error(
            `backtest-kit PersistBase unlink failed for filePath=${filePath} error=${getErrorMessage(
              error
            )}`
          );
          throw error;
        }
      },
      BASE_UNLINK_RETRY_COUNT,
      BASE_UNLINK_RETRY_DELAY
    ),
    {
      defaultValue: false,
    }
  );

/**
 * Base class for file-based persistence with atomic writes.
 *
 * Features:
 * - Atomic file writes using writeFileAtomic
 * - Auto-validation and cleanup of corrupted files
 * - Async generator support for iteration
 * - Retry logic for file deletion
 *
 * @example
 * ```typescript
 * const persist = new PersistBase("my-entity", "./data");
 * await persist.waitForInit(true);
 * await persist.writeValue("key1", { data: "value" });
 * const value = await persist.readValue("key1");
 * ```
 */
export const PersistBase = makeExtendable(
  class<EntityName extends string = string> implements IPersistBase {
    /** Computed directory path for entity storage */
    _directory: string;

    /**
     * Creates new persistence instance.
     *
     * @param entityName - Unique entity type identifier
     * @param baseDir - Base directory for all entities (default: ./logs/data)
     */
    constructor(
      readonly entityName: EntityName,
      readonly baseDir = join(process.cwd(), "logs/data")
    ) {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_CTOR, {
        entityName: this.entityName,
        baseDir,
      });
      this._directory = join(this.baseDir, this.entityName);
    }

    /**
     * Computes file path for entity ID.
     *
     * @param entityId - Entity identifier
     * @returns Full file path to entity JSON file
     */
    _getFilePath(entityId: EntityId): string {
      return join(this.baseDir, this.entityName, `${entityId}.json`);
    }

    [BASE_WAIT_FOR_INIT_SYMBOL] = singleshot(
      async (): Promise<void> => await BASE_WAIT_FOR_INIT_FN(this)
    );

    async waitForInit(initial: boolean): Promise<void> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT, {
        entityName: this.entityName,
        initial,
      });
      await this[BASE_WAIT_FOR_INIT_SYMBOL]();
    }

    /**
     * Returns count of persisted entities.
     *
     * @returns Promise resolving to number of .json files in directory
     */
    async getCount(): Promise<number> {
      const files = await fs.readdir(this._directory);
      const { length } = files.filter((file) => file.endsWith(".json"));
      return length;
    }

    async readValue<T extends IEntity = IEntity>(
      entityId: EntityId
    ): Promise<T> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_READ_VALUE, {
        entityName: this.entityName,
        entityId,
      });
      try {
        const filePath = this._getFilePath(entityId);
        const fileContent = await fs.readFile(filePath, "utf-8");
        return JSON.parse(fileContent) as T;
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          throw new Error(`Entity ${this.entityName}:${entityId} not found`);
        }
        throw new Error(
          `Failed to read entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    async hasValue(entityId: EntityId): Promise<boolean> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_HAS_VALUE, {
        entityName: this.entityName,
        entityId,
      });
      try {
        const filePath = this._getFilePath(entityId);
        await fs.access(filePath);
        return true;
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          return false;
        }
        throw new Error(
          `Failed to check existence of entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    async writeValue<T extends IEntity = IEntity>(
      entityId: EntityId,
      entity: T
    ): Promise<void> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_WRITE_VALUE, {
        entityName: this.entityName,
        entityId,
      });
      try {
        const filePath = this._getFilePath(entityId);
        const serializedData = JSON.stringify(entity);
        await writeFileAtomic(filePath, serializedData, "utf-8");
      } catch (error) {
        throw new Error(
          `Failed to write entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Removes entity from storage.
     *
     * @param entityId - Entity identifier to remove
     * @returns Promise that resolves when entity is deleted
     * @throws Error if entity not found or deletion fails
     */
    async removeValue(entityId: EntityId): Promise<void> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_REMOVE_VALUE, {
        entityName: this.entityName,
        entityId,
      });
      try {
        const filePath = this._getFilePath(entityId);
        await fs.unlink(filePath);
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          throw new Error(
            `Entity ${this.entityName}:${entityId} not found for deletion`
          );
        }
        throw new Error(
          `Failed to remove entity ${
            this.entityName
          }:${entityId}: ${getErrorMessage(error)}`
        );
      }
    }

    /**
     * Removes all entities from storage.
     *
     * @returns Promise that resolves when all entities are deleted
     * @throws Error if deletion fails
     */
    async removeAll(): Promise<void> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_REMOVE_ALL, {
        entityName: this.entityName,
      });
      try {
        const files = await fs.readdir(this._directory);
        const entityFiles = files.filter((file) => file.endsWith(".json"));
        for (const file of entityFiles) {
          await fs.unlink(join(this._directory, file));
        }
      } catch (error) {
        throw new Error(
          `Failed to remove values for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Async generator yielding all entity values.
     * Sorted alphanumerically by entity ID.
     *
     * @returns AsyncGenerator yielding entities
     * @throws Error if reading fails
     */
    async *values<T extends IEntity = IEntity>(): AsyncGenerator<T> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_VALUES, {
        entityName: this.entityName,
      });
      try {
        const files = await fs.readdir(this._directory);
        const entityIds = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -5))
          .sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        for (const entityId of entityIds) {
          const entity = await this.readValue<T>(entityId);
          yield entity;
        }
      } catch (error) {
        throw new Error(
          `Failed to read values for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Async generator yielding all entity IDs.
     * Sorted alphanumerically.
     *
     * @returns AsyncGenerator yielding entity IDs
     * @throws Error if reading fails
     */
    async *keys(): AsyncGenerator<EntityId> {
      swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_KEYS, {
        entityName: this.entityName,
      });
      try {
        const files = await fs.readdir(this._directory);
        const entityIds = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.slice(0, -5))
          .sort((a, b) =>
            a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
        for (const entityId of entityIds) {
          yield entityId;
        }
      } catch (error) {
        throw new Error(
          `Failed to read keys for ${this.entityName}: ${getErrorMessage(
            error
          )}`
        );
      }
    }

    /**
     * Async iterator implementation.
     * Delegates to values() generator.
     *
     * @returns AsyncIterableIterator yielding entities
     */
    async *[Symbol.asyncIterator](): AsyncIterableIterator<any> {
      for await (const entity of this.values()) {
        yield entity;
      }
    }

    /**
     * Filters entities by predicate function.
     *
     * @param predicate - Filter function
     * @returns AsyncGenerator yielding filtered entities
     */
    async *filter<T extends IEntity = IEntity>(
      predicate: (value: T) => boolean
    ): AsyncGenerator<T> {
      for await (const entity of this.values<T>()) {
        if (predicate(entity)) {
          yield entity;
        }
      }
    }

    /**
     * Takes first N entities, optionally filtered.
     *
     * @param total - Maximum number of entities to yield
     * @param predicate - Optional filter function
     * @returns AsyncGenerator yielding up to total entities
     */
    async *take<T extends IEntity = IEntity>(
      total: number,
      predicate?: (value: T) => boolean
    ): AsyncGenerator<T> {
      let count = 0;
      if (predicate) {
        for await (const entity of this.values<T>()) {
          if (!predicate(entity)) {
            continue;
          }
          count += 1;
          yield entity;
          if (count >= total) {
            break;
          }
        }
      } else {
        for await (const entity of this.values<T>()) {
          count += 1;
          yield entity;
          if (count >= total) {
            break;
          }
        }
      }
    }
  }
);

/**
 * Utility class for managing signal persistence.
 *
 * Features:
 * - Memoized storage instances per strategy
 * - Custom adapter support
 * - Atomic read/write operations
 * - Crash-safe signal state management
 *
 * Used by ClientStrategy for live mode persistence.
 */
export class PersistSignalUtils {
  private PersistSignalFactory: TPersistBaseCtor<StrategyName, ISignalData> =
    PersistBase;

  private getSignalStorage = memoize(
    ([strategyName]: [StrategyName]): string => `${strategyName}`,
    (strategyName: StrategyName): IPersistBase<ISignalData> =>
      Reflect.construct(this.PersistSignalFactory, [
        strategyName,
        `./logs/data/signal/`,
      ])
  );

  /**
   * Registers a custom persistence adapter.
   *
   * @param Ctor - Custom PersistBase constructor
   *
   * @example
   * ```typescript
   * class RedisPersist extends PersistBase {
   *   async readValue(id) { return JSON.parse(await redis.get(id)); }
   *   async writeValue(id, entity) { await redis.set(id, JSON.stringify(entity)); }
   * }
   * PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
   * ```
   */
  public usePersistSignalAdapter(
    Ctor: TPersistBaseCtor<StrategyName, ISignalData>
  ): void {
    swarm.loggerService.info(
      PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER
    );
    this.PersistSignalFactory = Ctor;
  }

  /**
   * Reads persisted signal data for a strategy and symbol.
   *
   * Called by ClientStrategy.waitForInit() to restore state.
   * Returns null if no signal exists.
   *
   * @param strategyName - Strategy identifier
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to signal or null
   */
  public readSignalData = async (
    strategyName: StrategyName,
    symbol: string
  ): Promise<ISignalRow | null> => {
    swarm.loggerService.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA);

    const isInitial = !this.getSignalStorage.has(strategyName);
    const stateStorage = this.getSignalStorage(strategyName);
    await stateStorage.waitForInit(isInitial);

    if (await stateStorage.hasValue(symbol)) {
      const { signalRow } = await stateStorage.readValue(symbol);
      return signalRow;
    }

    return null;
  };

  /**
   * Writes signal data to disk with atomic file writes.
   *
   * Called by ClientStrategy.setPendingSignal() to persist state.
   * Uses atomic writes to prevent corruption on crashes.
   *
   * @param signalRow - Signal data (null to clear)
   * @param strategyName - Strategy identifier
   * @param symbol - Trading pair symbol
   * @returns Promise that resolves when write is complete
   */
  public writeSignalData = async (
    signalRow: ISignalRow | null,
    strategyName: StrategyName,
    symbol: string
  ): Promise<void> => {
    swarm.loggerService.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA);

    const isInitial = !this.getSignalStorage.has(strategyName);
    const stateStorage = this.getSignalStorage(strategyName);
    await stateStorage.waitForInit(isInitial);

    await stateStorage.writeValue(symbol, { signalRow });
  };
}

/**
 * Global singleton instance of PersistSignalUtils.
 * Used by ClientStrategy for signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
 *
 * // Read signal
 * const signal = await PersistSignalAdaper.readSignalData("my-strategy", "BTCUSDT");
 *
 * // Write signal
 * await PersistSignalAdaper.writeSignalData(signal, "my-strategy", "BTCUSDT");
 * ```
 */
export const PersistSignalAdaper = new PersistSignalUtils();
