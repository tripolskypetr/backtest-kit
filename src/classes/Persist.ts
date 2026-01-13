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
import {
  ISignalRow,
  IScheduledSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";
import { IRiskActivePosition, RiskName } from "../interfaces/Risk.interface";
import { IPartialData } from "../interfaces/Partial.interface";
import { IBreakevenData } from "../interfaces/Breakeven.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";

const BASE_WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");

const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER =
  "PersistSignalUtils.usePersistSignalAdapter";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA =
  "PersistSignalUtils.readSignalData";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistSignalUtils.writeSignalData";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON =
  "PersistSignalUtils.useJson";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistSignalUtils.useDummy";

const PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_PERSIST_SCHEDULE_ADAPTER =
  "PersistScheduleUtils.usePersistScheduleAdapter";
const PERSIST_SCHEDULE_UTILS_METHOD_NAME_READ_DATA =
  "PersistScheduleUtils.readScheduleData";
const PERSIST_SCHEDULE_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistScheduleUtils.writeScheduleData";
const PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_JSON =
  "PersistScheduleUtils.useJson";
const PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistScheduleUtils.useDummy";

const PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_PERSIST_PARTIAL_ADAPTER =
  "PersistPartialUtils.usePersistPartialAdapter";
const PERSIST_PARTIAL_UTILS_METHOD_NAME_READ_DATA =
  "PersistPartialUtils.readPartialData";
const PERSIST_PARTIAL_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistPartialUtils.writePartialData";
const PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_JSON =
  "PersistPartialUtils.useJson";
const PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistPartialUtils.useDummy";

const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_PERSIST_BREAKEVEN_ADAPTER =
  "PersistBreakevenUtils.usePersistBreakevenAdapter";
const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_READ_DATA =
  "PersistBreakevenUtils.readBreakevenData";
const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistBreakevenUtils.writeBreakevenData";
const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_JSON =
  "PersistBreakevenUtils.useJson";
const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistBreakevenUtils.useDummy";

const PERSIST_RISK_UTILS_METHOD_NAME_USE_PERSIST_RISK_ADAPTER =
  "PersistRiskUtils.usePersistRiskAdapter";
const PERSIST_RISK_UTILS_METHOD_NAME_READ_DATA =
  "PersistRiskUtils.readPositionData";
const PERSIST_RISK_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistRiskUtils.writePositionData";
const PERSIST_RISK_UTILS_METHOD_NAME_USE_JSON =
  "PersistRiskUtils.useJson";
const PERSIST_RISK_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistRiskUtils.useDummy";


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
export type SignalData = ISignalRow | null;

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
  Entity extends IEntity | null = IEntity
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
export interface IPersistBase<Entity extends IEntity | null = IEntity> {
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
     * @param baseDir - Base directory for all entities (default: ./dump/data)
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
 * Dummy persist adapter that discards all writes.
 * Used for disabling persistence.
 */
export class PersistDummy implements IPersistBase {
  /**
   * No-op initialization function.
   * @returns Promise that resolves immediately
   */
  async waitForInit() {
    void 0;
  }
  /**
   * No-op read function.
   * @returns Promise that resolves with empty object
   */
  async readValue() {
    return {} as any;
  }
  /**
   * No-op has value check.
   * @returns Promise that resolves to false
   */
  async hasValue() {
    return false;
  }
  /**
   * No-op write function.
   * @returns Promise that resolves immediately
   */
  async writeValue() {
    void 0;
  }
}

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
  private PersistSignalFactory: TPersistBaseCtor<StrategyName, SignalData> =
    PersistBase;

  private getSignalStorage = memoize(
    ([symbol, strategyName, exchangeName]: [string, StrategyName, ExchangeName]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName): IPersistBase<SignalData> =>
      Reflect.construct(this.PersistSignalFactory, [
        `${symbol}_${strategyName}_${exchangeName}`,
        `./dump/data/signal/`,
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
   * PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
   * ```
   */
  public usePersistSignalAdapter(
    Ctor: TPersistBaseCtor<StrategyName, SignalData>
  ): void {
    swarm.loggerService.info(
      PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER
    );
    this.PersistSignalFactory = Ctor;
  }

  /**
   * Reads persisted signal data for a symbol and strategy.
   *
   * Called by ClientStrategy.waitForInit() to restore state.
   * Returns null if no signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to signal or null
   */
  public readSignalData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<ISignalRow | null> => {
    swarm.loggerService.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getSignalStorage.has(key);
    const stateStorage = this.getSignalStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    if (await stateStorage.hasValue(symbol)) {
      return await stateStorage.readValue(symbol);
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
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
  public writeSignalData = async (
    signalRow: ISignalRow | null,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    swarm.loggerService.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getSignalStorage.has(key);
    const stateStorage = this.getSignalStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    await stateStorage.writeValue(symbol, signalRow);
  };

  /**
   * Switches to the default JSON persist adapter.
   * All future persistence writes will use JSON storage.
   */
  public useJson() {
    swarm.loggerService.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistSignalAdapter(PersistBase);
  }

  /**
   * Switches to a dummy persist adapter that discards all writes.
   * All future persistence writes will be no-ops.
   */
  public useDummy() {
    swarm.loggerService.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistSignalAdapter(PersistDummy);
  }
}

/**
 * Global singleton instance of PersistSignalUtils.
 * Used by ClientStrategy for signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
 *
 * // Read signal
 * const signal = await PersistSignalAdapter.readSignalData("my-strategy", "BTCUSDT");
 *
 * // Write signal
 * await PersistSignalAdapter.writeSignalData(signal, "my-strategy", "BTCUSDT");
 * ```
 */
export const PersistSignalAdapter = new PersistSignalUtils();

/**
 * Type for persisted risk positions data.
 * Stores Map entries as array of [key, value] tuples for JSON serialization.
 */
export type RiskData = Array<[string, IRiskActivePosition]>;

/**
 * Utility class for managing risk active positions persistence.
 *
 * Features:
 * - Memoized storage instances per risk profile
 * - Custom adapter support
 * - Atomic read/write operations for RiskData
 * - Crash-safe position state management
 *
 * Used by ClientRisk for live mode persistence of active positions.
 */
export class PersistRiskUtils {
  private PersistRiskFactory: TPersistBaseCtor<RiskName, RiskData> =
    PersistBase;

  private getRiskStorage = memoize(
    ([riskName, exchangeName]: [RiskName, ExchangeName]): string => `${riskName}:${exchangeName}`,
    (riskName: RiskName, exchangeName: ExchangeName): IPersistBase<RiskData> =>
      Reflect.construct(this.PersistRiskFactory, [
        `${riskName}_${exchangeName}`,
        `./dump/data/risk/`,
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
   * PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
   * ```
   */
  public usePersistRiskAdapter(
    Ctor: TPersistBaseCtor<RiskName, RiskData>
  ): void {
    swarm.loggerService.info(
      PERSIST_RISK_UTILS_METHOD_NAME_USE_PERSIST_RISK_ADAPTER
    );
    this.PersistRiskFactory = Ctor;
  }

  /**
   * Reads persisted active positions for a risk profile.
   *
   * Called by ClientRisk.waitForInit() to restore state.
   * Returns empty Map if no positions exist.
   *
   * @param riskName - Risk profile identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to Map of active positions
   */
  public readPositionData = async (riskName: RiskName, exchangeName: ExchangeName): Promise<RiskData> => {
    swarm.loggerService.info(PERSIST_RISK_UTILS_METHOD_NAME_READ_DATA);

    const key = `${riskName}:${exchangeName}`;
    const isInitial = !this.getRiskStorage.has(key);
    const stateStorage = this.getRiskStorage(riskName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    const RISK_STORAGE_KEY = "positions";

    if (await stateStorage.hasValue(RISK_STORAGE_KEY)) {
      return await stateStorage.readValue(RISK_STORAGE_KEY);
    }

    return [];
  };

  /**
   * Writes active positions to disk with atomic file writes.
   *
   * Called by ClientRisk after addSignal/removeSignal to persist state.
   * Uses atomic writes to prevent corruption on crashes.
   *
   * @param positions - Map of active positions
   * @param riskName - Risk profile identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
  public writePositionData = async (
    riskRow: RiskData,
    riskName: RiskName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    swarm.loggerService.info(PERSIST_RISK_UTILS_METHOD_NAME_WRITE_DATA);

    const key = `${riskName}:${exchangeName}`;
    const isInitial = !this.getRiskStorage.has(key);
    const stateStorage = this.getRiskStorage(riskName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    const RISK_STORAGE_KEY = "positions";

    await stateStorage.writeValue(RISK_STORAGE_KEY, riskRow);
  };

  /**
   * Switches to the default JSON persist adapter.
   * All future persistence writes will use JSON storage.
   */
  public useJson() {
    swarm.loggerService.log(PERSIST_RISK_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistRiskAdapter(PersistBase);
  }

  /**
   * Switches to a dummy persist adapter that discards all writes.
   * All future persistence writes will be no-ops.
   */
  public useDummy() {
    swarm.loggerService.log(PERSIST_RISK_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistRiskAdapter(PersistDummy);
  }
}

/**
 * Global singleton instance of PersistRiskUtils.
 * Used by ClientRisk for active positions persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
 *
 * // Read positions
 * const positions = await PersistRiskAdapter.readPositionData("my-risk");
 *
 * // Write positions
 * await PersistRiskAdapter.writePositionData(positionsMap, "my-risk");
 * ```
 */
export const PersistRiskAdapter = new PersistRiskUtils();

/**
 * Type for persisted scheduled signal data.
 * Contains nullable scheduled signal for atomic updates.
 */
export type ScheduleData = IScheduledSignalRow | null;

/**
 * Utility class for managing scheduled signal persistence.
 *
 * Features:
 * - Memoized storage instances per strategy
 * - Custom adapter support
 * - Atomic read/write operations for scheduled signals
 * - Crash-safe scheduled signal state management
 *
 * Used by ClientStrategy for live mode persistence of scheduled signals (_scheduledSignal).
 */
export class PersistScheduleUtils {
  private PersistScheduleFactory: TPersistBaseCtor<StrategyName, ScheduleData> =
    PersistBase;

  private getScheduleStorage = memoize(
    ([symbol, strategyName, exchangeName]: [string, StrategyName, ExchangeName]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName): IPersistBase<ScheduleData> =>
      Reflect.construct(this.PersistScheduleFactory, [
        `${symbol}_${strategyName}_${exchangeName}`,
        `./dump/data/schedule/`,
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
   * PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);
   * ```
   */
  public usePersistScheduleAdapter(
    Ctor: TPersistBaseCtor<StrategyName, ScheduleData>
  ): void {
    swarm.loggerService.info(
      PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_PERSIST_SCHEDULE_ADAPTER
    );
    this.PersistScheduleFactory = Ctor;
  }

  /**
   * Reads persisted scheduled signal data for a symbol and strategy.
   *
   * Called by ClientStrategy.waitForInit() to restore scheduled signal state.
   * Returns null if no scheduled signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to scheduled signal or null
   */
  public readScheduleData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<IScheduledSignalRow | null> => {
    swarm.loggerService.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_READ_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getScheduleStorage.has(key);
    const stateStorage = this.getScheduleStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    if (await stateStorage.hasValue(symbol)) {
      return await stateStorage.readValue(symbol);
    }

    return null;
  };

  /**
   * Writes scheduled signal data to disk with atomic file writes.
   *
   * Called by ClientStrategy.setScheduledSignal() to persist state.
   * Uses atomic writes to prevent corruption on crashes.
   *
   * @param scheduledSignalRow - Scheduled signal data (null to clear)
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
  public writeScheduleData = async (
    scheduledSignalRow: IScheduledSignalRow | null,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    swarm.loggerService.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_WRITE_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getScheduleStorage.has(key);
    const stateStorage = this.getScheduleStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    await stateStorage.writeValue(symbol, scheduledSignalRow);
  };

  /**
   * Switches to the default JSON persist adapter.
   * All future persistence writes will use JSON storage.
   */
  public useJson() {
    swarm.loggerService.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistScheduleAdapter(PersistBase);
  }

  /**
   * Switches to a dummy persist adapter that discards all writes.
   * All future persistence writes will be no-ops.
   */
  public useDummy() {
    swarm.loggerService.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistScheduleAdapter(PersistDummy);
  }
}

/**
 * Global singleton instance of PersistScheduleUtils.
 * Used by ClientStrategy for scheduled signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);
 *
 * // Read scheduled signal
 * const scheduled = await PersistScheduleAdapter.readScheduleData("my-strategy", "BTCUSDT");
 *
 * // Write scheduled signal
 * await PersistScheduleAdapter.writeScheduleData(scheduled, "my-strategy", "BTCUSDT");
 * ```
 */
export const PersistScheduleAdapter = new PersistScheduleUtils();

/**
 * Type for persisted partial data.
 * Stores profit and loss levels as arrays for JSON serialization.
 */
export type PartialData = Record<string, IPartialData>;

/**
 * Utility class for managing partial profit/loss levels persistence.
 *
 * Features:
 * - Memoized storage instances per symbol:strategyName
 * - Custom adapter support
 * - Atomic read/write operations for partial data
 * - Crash-safe partial state management
 *
 * Used by ClientPartial for live mode persistence of profit/loss levels.
 */
export class PersistPartialUtils {
  private PersistPartialFactory: TPersistBaseCtor<string, PartialData> =
    PersistBase;

  private getPartialStorage = memoize(
    ([symbol, strategyName, exchangeName]: [string, StrategyName, ExchangeName]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName): IPersistBase<PartialData> =>
      Reflect.construct(this.PersistPartialFactory, [
        `${symbol}_${strategyName}_${exchangeName}`,
        `./dump/data/partial/`,
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
   * PersistPartialAdapter.usePersistPartialAdapter(RedisPersist);
   * ```
   */
  public usePersistPartialAdapter(
    Ctor: TPersistBaseCtor<string, PartialData>
  ): void {
    swarm.loggerService.info(
      PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_PERSIST_PARTIAL_ADAPTER
    );
    this.PersistPartialFactory = Ctor;
  }

  /**
   * Reads persisted partial data for a symbol and strategy.
   *
   * Called by ClientPartial.waitForInit() to restore state.
   * Returns empty object if no partial data exists.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to partial data record
   */
  public readPartialData = async (symbol: string, strategyName: StrategyName, signalId: string, exchangeName: ExchangeName): Promise<PartialData> => {
    swarm.loggerService.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_READ_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getPartialStorage.has(key);
    const stateStorage = this.getPartialStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    if (await stateStorage.hasValue(signalId)) {
      return await stateStorage.readValue(signalId);
    }

    return {};
  };

  /**
   * Writes partial data to disk with atomic file writes.
   *
   * Called by ClientPartial after profit/loss level changes to persist state.
   * Uses atomic writes to prevent corruption on crashes.
   *
   * @param partialData - Record of signal IDs to partial data
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
  public writePartialData = async (
    partialData: PartialData,
    symbol: string,
    strategyName: StrategyName,
    signalId: string,
    exchangeName: ExchangeName
  ): Promise<void> => {
    swarm.loggerService.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_WRITE_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getPartialStorage.has(key);
    const stateStorage = this.getPartialStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    await stateStorage.writeValue(signalId, partialData);
  };

  /**
   * Switches to the default JSON persist adapter.
   * All future persistence writes will use JSON storage.
   */
  public useJson() {
    swarm.loggerService.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistPartialAdapter(PersistBase);
  }

  /**
   * Switches to a dummy persist adapter that discards all writes.
   * All future persistence writes will be no-ops.
   */
  public useDummy() {
    swarm.loggerService.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistPartialAdapter(PersistDummy);
  }
}

/**
 * Global singleton instance of PersistPartialUtils.
 * Used by ClientPartial for partial profit/loss levels persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistPartialAdapter.usePersistPartialAdapter(RedisPersist);
 *
 * // Read partial data
 * const partialData = await PersistPartialAdapter.readPartialData("BTCUSDT", "my-strategy");
 *
 * // Write partial data
 * await PersistPartialAdapter.writePartialData(partialData, "BTCUSDT", "my-strategy");
 * ```
 */
export const PersistPartialAdapter = new PersistPartialUtils();

/**
 * Type for persisted breakeven data.
 * Stores breakeven state (reached flag) for each signal ID.
 */
export type BreakevenData = Record<string, IBreakevenData>;

/**
 * Persistence utility class for breakeven state management.
 *
 * Handles reading and writing breakeven state to disk.
 * Uses memoized PersistBase instances per symbol-strategy pair.
 *
 * Features:
 * - Atomic file writes via PersistBase.writeValue()
 * - Lazy initialization on first access
 * - Singleton pattern for global access
 * - Custom adapter support via usePersistBreakevenAdapter()
 *
 * File structure:
 * ```
 * ./dump/data/breakeven/
 * ├── BTCUSDT_my-strategy/
 * │   └── state.json        // { "signal-id-1": { reached: true }, ... }
 * └── ETHUSDT_other-strategy/
 *     └── state.json
 * ```
 *
 * @example
 * ```typescript
 * // Read breakeven data
 * const breakevenData = await PersistBreakevenAdapter.readBreakevenData("BTCUSDT", "my-strategy");
 * // Returns: { "signal-id": { reached: true }, ... }
 *
 * // Write breakeven data
 * await PersistBreakevenAdapter.writeBreakevenData(breakevenData, "BTCUSDT", "my-strategy");
 * ```
 */
class PersistBreakevenUtils {
  /**
   * Factory for creating PersistBase instances.
   * Can be replaced via usePersistBreakevenAdapter().
   */
  private PersistBreakevenFactory: TPersistBaseCtor<string, BreakevenData> =
    PersistBase;

  /**
   * Memoized storage factory for breakeven data.
   * Creates one PersistBase instance per symbol-strategy-exchange combination.
   * Key format: "symbol:strategyName:exchangeName"
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns PersistBase instance for this symbol-strategy-exchange combination
   */
  private getBreakevenStorage = memoize(
    ([symbol, strategyName, exchangeName]: [string, StrategyName, ExchangeName]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName): IPersistBase<BreakevenData> =>
      Reflect.construct(this.PersistBreakevenFactory, [
        `${symbol}_${strategyName}_${exchangeName}`,
        `./dump/data/breakeven/`,
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
   * PersistBreakevenAdapter.usePersistBreakevenAdapter(RedisPersist);
   * ```
   */
  public usePersistBreakevenAdapter(
    Ctor: TPersistBaseCtor<string, BreakevenData>
  ): void {
    swarm.loggerService.info(
      PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_PERSIST_BREAKEVEN_ADAPTER
    );
    this.PersistBreakevenFactory = Ctor;
  }

  /**
   * Reads persisted breakeven data for a symbol and strategy.
   *
   * Called by ClientBreakeven.waitForInit() to restore state.
   * Returns empty object if no breakeven data exists.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to breakeven data record
   */
  public readBreakevenData = async (symbol: string, strategyName: StrategyName, signalId: string, exchangeName: ExchangeName): Promise<BreakevenData> => {
    swarm.loggerService.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_READ_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getBreakevenStorage.has(key);
    const stateStorage = this.getBreakevenStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    if (await stateStorage.hasValue(signalId)) {
      return await stateStorage.readValue(signalId);
    }

    return {};
  };

  /**
   * Writes breakeven data to disk.
   *
   * Called by ClientBreakeven._persistState() after state changes.
   * Creates directory and file if they don't exist.
   * Uses atomic writes to prevent data corruption.
   *
   * @param breakevenData - Breakeven data record to persist
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
  public writeBreakevenData = async (breakevenData: BreakevenData, symbol: string, strategyName: StrategyName, signalId: string, exchangeName: ExchangeName): Promise<void> => {
    swarm.loggerService.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_WRITE_DATA);

    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getBreakevenStorage.has(key);
    const stateStorage = this.getBreakevenStorage(symbol, strategyName, exchangeName);
    await stateStorage.waitForInit(isInitial);

    await stateStorage.writeValue(signalId, breakevenData);
  };

  /**
   * Switches to the default JSON persist adapter.
   * All future persistence writes will use JSON storage.
   */
  public useJson() {
    swarm.loggerService.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistBreakevenAdapter(PersistBase);
  }

  /**
   * Switches to a dummy persist adapter that discards all writes.
   * All future persistence writes will be no-ops.
   */
  public useDummy() {
    swarm.loggerService.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistBreakevenAdapter(PersistDummy);
  }
}

/**
 * Global singleton instance of PersistBreakevenUtils.
 * Used by ClientBreakeven for breakeven state persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistBreakevenAdapter.usePersistBreakevenAdapter(RedisPersist);
 *
 * // Read breakeven data
 * const breakevenData = await PersistBreakevenAdapter.readBreakevenData("BTCUSDT", "my-strategy");
 *
 * // Write breakeven data
 * await PersistBreakevenAdapter.writeBreakevenData(breakevenData, "BTCUSDT", "my-strategy");
 * ```
 */
export const PersistBreakevenAdapter = new PersistBreakevenUtils();

