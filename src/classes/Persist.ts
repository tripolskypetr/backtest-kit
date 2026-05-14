import fs from "fs/promises";
import {
  getErrorMessage,
  makeExtendable,
  memoize,
  not,
  retry,
  singleshot,
  trycatch,
  errorData,
} from "functools-kit";
import { join } from "path";
import { writeFileAtomic } from "../utils/writeFileAtomic";
import {
  ISignalRow,
  IScheduledSignalRow,
  IPublicSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";
import { errorEmitter } from "../config/emitters";
import { IRiskActivePosition, RiskName } from "../interfaces/Risk.interface";
import { IPartialData } from "../interfaces/Partial.interface";
import { IBreakevenData } from "../interfaces/Breakeven.interface";
import { ExchangeName, CandleInterval, ICandleData } from "../interfaces/Exchange.interface";
import { IStorageSignalRow } from "../interfaces/Strategy.interface";
import { NotificationModel } from "../model/Notification.model";
import { ILogEntry } from "../interfaces/Logger.interface";
import LoggerService from "../lib/services/base/LoggerService";
import { FrameName } from "../interfaces/Frame.interface";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/** Symbol key for the singleshot waitForInit function on PersistBase instances. */
const BASE_WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");

// Calculate step in milliseconds for candle close time validation
const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
};

const MS_PER_MINUTE = 60_000;

const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER =
  "PersistSignalUtils.usePersistSignalAdapter";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA =
  "PersistSignalUtils.readSignalData";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistSignalUtils.writeSignalData";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON = "PersistSignalUtils.useJson";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistSignalUtils.useDummy";
const PERSIST_SIGNAL_UTILS_METHOD_NAME_CLEAR = "PersistSignalUtils.clear";

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
const PERSIST_SCHEDULE_UTILS_METHOD_NAME_CLEAR = "PersistScheduleUtils.clear";

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
const PERSIST_PARTIAL_UTILS_METHOD_NAME_CLEAR = "PersistPartialUtils.clear";

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
const PERSIST_BREAKEVEN_UTILS_METHOD_NAME_CLEAR = "PersistBreakevenUtils.clear";

const PERSIST_RISK_UTILS_METHOD_NAME_USE_PERSIST_RISK_ADAPTER =
  "PersistRiskUtils.usePersistRiskAdapter";
const PERSIST_RISK_UTILS_METHOD_NAME_READ_DATA =
  "PersistRiskUtils.readPositionData";
const PERSIST_RISK_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistRiskUtils.writePositionData";
const PERSIST_RISK_UTILS_METHOD_NAME_USE_JSON = "PersistRiskUtils.useJson";
const PERSIST_RISK_UTILS_METHOD_NAME_USE_DUMMY = "PersistRiskUtils.useDummy";
const PERSIST_RISK_UTILS_METHOD_NAME_CLEAR = "PersistRiskUtils.clear";

const PERSIST_BASE_METHOD_NAME_CTOR = "PersistBase.CTOR";
const PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT = "PersistBase.waitForInit";
const PERSIST_BASE_METHOD_NAME_READ_VALUE = "PersistBase.readValue";
const PERSIST_BASE_METHOD_NAME_WRITE_VALUE = "PersistBase.writeValue";
const PERSIST_BASE_METHOD_NAME_HAS_VALUE = "PersistBase.hasValue";
const PERSIST_BASE_METHOD_NAME_KEYS = "PersistBase.keys";

const PERSIST_STORAGE_UTILS_METHOD_NAME_READ_DATA =
  "PersistStorageUtils.readStorageData";
const PERSIST_STORAGE_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistStorageUtils.writeStorageData";
const PERSIST_STORAGE_UTILS_METHOD_NAME_USE_JSON =
  "PersistStorageUtils.useJson";
const PERSIST_STORAGE_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistStorageUtils.useDummy";
const PERSIST_STORAGE_UTILS_METHOD_NAME_CLEAR = "PersistStorageUtils.clear";
const PERSIST_STORAGE_UTILS_METHOD_NAME_USE_PERSIST_STORAGE_ADAPTER =
  "PersistStorageUtils.usePersistStorageAdapter";

const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_READ_DATA =
  "PersistNotificationUtils.readNotificationData";
const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistNotificationUtils.writeNotificationData";
const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_JSON =
  "PersistNotificationUtils.useJson";
const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistNotificationUtils.useDummy";
const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_CLEAR = "PersistNotificationUtils.clear";
const PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_PERSIST_NOTIFICATION_ADAPTER =
  "PersistNotificationUtils.usePersistNotificationAdapter";

const PERSIST_LOG_UTILS_METHOD_NAME_READ_DATA =
  "PersistLogUtils.readLogData";
const PERSIST_LOG_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistLogUtils.writeLogData";
const PERSIST_LOG_UTILS_METHOD_NAME_USE_JSON =
  "PersistLogUtils.useJson";
const PERSIST_LOG_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistLogUtils.useDummy";
const PERSIST_LOG_UTILS_METHOD_NAME_USE_PERSIST_LOG_ADAPTER =
  "PersistLogUtils.usePersistLogAdapter";
const PERSIST_LOG_UTILS_METHOD_NAME_CLEAR = "PersistLogUtils.clear";

const PERSIST_MEASURE_UTILS_METHOD_NAME_READ_DATA =
  "PersistMeasureUtils.readMeasureData";
const PERSIST_MEASURE_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistMeasureUtils.writeMeasureData";
const PERSIST_MEASURE_UTILS_METHOD_NAME_USE_JSON =
  "PersistMeasureUtils.useJson";
const PERSIST_MEASURE_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistMeasureUtils.useDummy";
const PERSIST_MEASURE_UTILS_METHOD_NAME_REMOVE_DATA =
  "PersistMeasureUtils.removeMeasureData";
const PERSIST_MEASURE_UTILS_METHOD_NAME_LIST_DATA =
  "PersistMeasureUtils.listMeasureData";
const PERSIST_MEASURE_UTILS_METHOD_NAME_CLEAR = "PersistMeasureUtils.clear";
const PERSIST_MEASURE_UTILS_METHOD_NAME_USE_PERSIST_MEASURE_ADAPTER =
  "PersistMeasureUtils.usePersistMeasureAdapter";

const PERSIST_INTERVAL_UTILS_METHOD_NAME_READ_DATA =
  "PersistIntervalUtils.readIntervalData";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistIntervalUtils.writeIntervalData";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_JSON =
  "PersistIntervalUtils.useJson";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistIntervalUtils.useDummy";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_REMOVE_DATA =
  "PersistIntervalUtils.removeIntervalData";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_LIST_DATA =
  "PersistIntervalUtils.listIntervalData";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_CLEAR = "PersistIntervalUtils.clear";
const PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_PERSIST_INTERVAL_ADAPTER =
  "PersistIntervalUtils.usePersistIntervalAdapter";

const PERSIST_CANDLE_UTILS_METHOD_NAME_CLEAR = "PersistCandleUtils.clear";

const PERSIST_MEMORY_UTILS_METHOD_NAME_USE_PERSIST_MEMORY_ADAPTER =
  "PersistMemoryUtils.usePersistMemoryAdapter";
const PERSIST_MEMORY_UTILS_METHOD_NAME_READ_DATA =
  "PersistMemoryUtils.readMemoryData";
const PERSIST_MEMORY_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistMemoryUtils.writeMemoryData";
const PERSIST_MEMORY_UTILS_METHOD_NAME_REMOVE_DATA =
  "PersistMemoryUtils.removeMemoryData";
const PERSIST_MEMORY_UTILS_METHOD_NAME_LIST_DATA =
  "PersistMemoryUtils.listMemoryData";
const PERSIST_MEMORY_UTILS_METHOD_NAME_HAS_DATA =
  "PersistMemoryUtils.hasMemoryData";
const PERSIST_MEMORY_UTILS_METHOD_NAME_CLEAR =
  "PersistMemoryUtils.clear";
const PERSIST_MEMORY_UTILS_METHOD_NAME_DISPOSE =
  "PersistMemoryUtils.dispose";

const PERSIST_STATE_UTILS_METHOD_NAME_USE_PERSIST_STATE_ADAPTER =
  "PersistStateUtils.usePersistStateAdapter";
const PERSIST_STATE_UTILS_METHOD_NAME_READ_DATA =
  "PersistStateUtils.readStateData";
const PERSIST_STATE_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistStateUtils.writeStateData";
const PERSIST_STATE_UTILS_METHOD_NAME_CLEAR =
  "PersistStateUtils.clear";
const PERSIST_STATE_UTILS_METHOD_NAME_DISPOSE =
  "PersistStateUtils.dispose";
const PERSIST_STATE_UTILS_METHOD_NAME_WAIT_FOR_INIT =
  "PersistStateUtils.waitForInit";
const PERSIST_STATE_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistStateUtils.useDummy";
const PERSIST_STATE_UTILS_METHOD_NAME_USE_JSON =
  "PersistStateUtils.useJson";

const PERSIST_SESSION_UTILS_METHOD_NAME_USE_PERSIST_SESSION_ADAPTER =
  "PersistSessionUtils.usePersistSessionAdapter";
const PERSIST_SESSION_UTILS_METHOD_NAME_READ_DATA =
  "PersistSessionUtils.readSessionData";
const PERSIST_SESSION_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistSessionUtils.writeSessionData";
const PERSIST_SESSION_UTILS_METHOD_NAME_CLEAR =
  "PersistSessionUtils.clear";
const PERSIST_SESSION_UTILS_METHOD_NAME_DISPOSE =
  "PersistSessionUtils.dispose";
const PERSIST_SESSION_UTILS_METHOD_NAME_WAIT_FOR_INIT =
  "PersistSessionUtils.waitForInit";
const PERSIST_SESSION_UTILS_METHOD_NAME_USE_DUMMY =
  "PersistSessionUtils.useDummy";
const PERSIST_SESSION_UTILS_METHOD_NAME_USE_JSON =
  "PersistSessionUtils.useJson";

const PERSIST_RECENT_UTILS_METHOD_NAME_USE_PERSIST_RECENT_ADAPTER =
  "PersistRecentUtils.usePersistRecentAdapter";
const PERSIST_RECENT_UTILS_METHOD_NAME_READ_DATA =
  "PersistRecentUtils.readRecentData";
const PERSIST_RECENT_UTILS_METHOD_NAME_WRITE_DATA =
  "PersistRecentUtils.writeRecentData";
const PERSIST_RECENT_UTILS_METHOD_NAME_USE_JSON = "PersistRecentUtils.useJson";
const PERSIST_RECENT_UTILS_METHOD_NAME_USE_DUMMY = "PersistRecentUtils.useDummy";
const PERSIST_RECENT_UTILS_METHOD_NAME_CLEAR = "PersistRecentUtils.clear";

const BASE_WAIT_FOR_INIT_FN_METHOD_NAME = "PersistBase.waitForInitFn";

const BASE_UNLINK_RETRY_COUNT = 5;
const BASE_UNLINK_RETRY_DELAY = 1_000;

/**
 * Signal data stored in persistence layer.
 * Contains nullable signal for atomic updates.
 */
export type SignalData = ISignalRow | null;

/**
 * Cache.file data type stored in persistence layer.
 */
export type MeasureData = {
  id: string;
  data: unknown;
  removed: boolean;
};

/**
 * Interval.file data type stored in persistence layer.
 */
export type IntervalData = {
  id: string;
  data: unknown;
  removed: boolean;
};

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
 * Persistence interface for custom adapters.
 * Defines only the essential CRUD operations required for persistence.
 * Custom adapters should implement this interface.
 *
 * Architecture:
 * - IPersistBase: Public API for custom adapters (5 methods: waitForInit, readValue, hasValue, writeValue, keys)
 * - PersistBase: Default implementation with keys() method for validation and iteration
 * - TPersistBaseCtor: Constructor type requiring IPersistBase
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

  /**
   * Async generator yielding all entity IDs.
   * Sorted alphanumerically.
   * Used for iteration and validation.
   *
   * @returns AsyncGenerator yielding entity IDs
   * @throws Error if reading fails
   */
  keys(): AsyncGenerator<EntityId>;
}

const BASE_WAIT_FOR_INIT_FN = async (self: TPersistBase): Promise<void> => {
  LOGGER_SERVICE.debug(BASE_WAIT_FOR_INIT_FN_METHOD_NAME, {
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
class PersistBase<EntityName extends string = string> implements IPersistBase {
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
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_CTOR, {
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
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_WAIT_FOR_INIT, {
      entityName: this.entityName,
      initial,
    });
    await this[BASE_WAIT_FOR_INIT_SYMBOL]();
  }

  async readValue<T extends IEntity = IEntity>(entityId: EntityId): Promise<T> {
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_READ_VALUE, {
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
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_HAS_VALUE, {
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
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_WRITE_VALUE, {
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
   * Async generator yielding all entity IDs.
   * Sorted alphanumerically.
   * Used internally by waitForInit for validation.
   *
   * @returns AsyncGenerator yielding entity IDs
   * @throws Error if reading fails
   */
  async *keys(): AsyncGenerator<EntityId> {
    LOGGER_SERVICE.debug(PERSIST_BASE_METHOD_NAME_KEYS, {
      entityName: this.entityName,
    });
    try {
      const entityIds: string[] = [];
      for await (const entry of await fs.opendir(this._directory)) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          entityIds.push(entry.name.slice(0, -5));
        }
      }
      entityIds.sort((a, b) =>
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
        `Failed to read keys for ${this.entityName}: ${getErrorMessage(error)}`
      );
    }
  }
}

// @ts-ignore
PersistBase = makeExtendable(PersistBase);

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
  /**
   * No-op keys generator.
   * @returns Empty async generator
   */
  async *keys(): AsyncGenerator<EntityId> {
    // Empty generator - no keys
  }
}

export interface IPersistSignalInstance {
  waitForInit(initial: boolean): Promise<void>;
  readSignalData(): Promise<ISignalRow | null>;
  writeSignalData(signalRow: ISignalRow | null): Promise<void>;
}

export class PersistSignalInstance implements IPersistSignalInstance {
  private readonly _storage: IPersistBase<SignalData>;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${symbol}_${strategyName}_${exchangeName}`,
      `./dump/data/signal/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readSignalData(): Promise<ISignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  async writeSignalData(signalRow: ISignalRow | null): Promise<void> {
    await this._storage.writeValue(this.symbol, signalRow);
  }
}

class PersistSignalDummyInstance implements IPersistSignalInstance {
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readSignalData(): Promise<ISignalRow | null> { return null; }
  async writeSignalData(_signalRow: ISignalRow | null): Promise<void> { void 0; }
}

export type TPersistSignalInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
) => IPersistSignalInstance;

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
  private PersistSignalInstanceCtor: TPersistSignalInstanceCtor = PersistSignalInstance;

  private getStorage = memoize(
    ([symbol, strategyName, exchangeName]: [
      string,
      StrategyName,
      ExchangeName
    ]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName
    ): IPersistSignalInstance =>
      Reflect.construct(this.PersistSignalInstanceCtor, [symbol, strategyName, exchangeName])
  );

  public usePersistSignalAdapter(Ctor: TPersistSignalInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER);
    this.PersistSignalInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  public readSignalData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<ISignalRow | null> => {
    LOGGER_SERVICE.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_READ_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readSignalData();
  };

  public writeSignalData = async (
    signalRow: ISignalRow | null,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeSignalData(signalRow);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistSignalAdapter(PersistSignalInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistSignalAdapter(PersistSignalDummyInstance);
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

export interface IPersistRiskInstance {
  waitForInit(initial: boolean): Promise<void>;
  readPositionData(): Promise<RiskData>;
  writePositionData(riskRow: RiskData): Promise<void>;
}

export class PersistRiskInstance implements IPersistRiskInstance {
  private static readonly STORAGE_KEY = "positions";
  private readonly _storage: IPersistBase<RiskData>;

  constructor(
    readonly riskName: RiskName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${riskName}_${exchangeName}`,
      `./dump/data/risk/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readPositionData(): Promise<RiskData> {
    if (await this._storage.hasValue(PersistRiskInstance.STORAGE_KEY)) {
      return await this._storage.readValue(PersistRiskInstance.STORAGE_KEY);
    }
    return [];
  }

  async writePositionData(riskRow: RiskData): Promise<void> {
    await this._storage.writeValue(PersistRiskInstance.STORAGE_KEY, riskRow);
  }
}

class PersistRiskDummyInstance implements IPersistRiskInstance {
  constructor(_riskName: RiskName, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readPositionData(): Promise<RiskData> { return []; }
  async writePositionData(_riskRow: RiskData): Promise<void> { void 0; }
}

export type TPersistRiskInstanceCtor = new (
  riskName: RiskName,
  exchangeName: ExchangeName,
) => IPersistRiskInstance;

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
  private PersistRiskInstanceCtor: TPersistRiskInstanceCtor = PersistRiskInstance;

  private getRiskStorage = memoize(
    ([riskName, exchangeName]: [RiskName, ExchangeName]): string =>
      `${riskName}:${exchangeName}`,
    (riskName: RiskName, exchangeName: ExchangeName): IPersistRiskInstance =>
      Reflect.construct(this.PersistRiskInstanceCtor, [riskName, exchangeName])
  );

  public usePersistRiskAdapter(Ctor: TPersistRiskInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_RISK_UTILS_METHOD_NAME_USE_PERSIST_RISK_ADAPTER);
    this.PersistRiskInstanceCtor = Ctor;
    this.getRiskStorage.clear();
  }

  public readPositionData = async (
    riskName: RiskName,
    exchangeName: ExchangeName
  ): Promise<RiskData> => {
    LOGGER_SERVICE.info(PERSIST_RISK_UTILS_METHOD_NAME_READ_DATA);
    const key = `${riskName}:${exchangeName}`;
    const isInitial = !this.getRiskStorage.has(key);
    const instance = this.getRiskStorage(riskName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readPositionData();
  };

  public writePositionData = async (
    riskRow: RiskData,
    riskName: RiskName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_RISK_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${riskName}:${exchangeName}`;
    const isInitial = !this.getRiskStorage.has(key);
    const instance = this.getRiskStorage(riskName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writePositionData(riskRow);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_RISK_UTILS_METHOD_NAME_CLEAR);
    this.getRiskStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_RISK_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistRiskAdapter(PersistRiskInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_RISK_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistRiskAdapter(PersistRiskDummyInstance);
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

export interface IPersistScheduleInstance {
  waitForInit(initial: boolean): Promise<void>;
  readScheduleData(): Promise<IScheduledSignalRow | null>;
  writeScheduleData(row: IScheduledSignalRow | null): Promise<void>;
}

export class PersistScheduleInstance implements IPersistScheduleInstance {
  private readonly _storage: IPersistBase<ScheduleData>;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${symbol}_${strategyName}_${exchangeName}`,
      `./dump/data/schedule/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readScheduleData(): Promise<IScheduledSignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  async writeScheduleData(row: IScheduledSignalRow | null): Promise<void> {
    await this._storage.writeValue(this.symbol, row);
  }
}

class PersistScheduleDummyInstance implements IPersistScheduleInstance {
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readScheduleData(): Promise<IScheduledSignalRow | null> { return null; }
  async writeScheduleData(_row: IScheduledSignalRow | null): Promise<void> { void 0; }
}

export type TPersistScheduleInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
) => IPersistScheduleInstance;

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
  private PersistScheduleInstanceCtor: TPersistScheduleInstanceCtor = PersistScheduleInstance;

  private getScheduleStorage = memoize(
    ([symbol, strategyName, exchangeName]: [
      string,
      StrategyName,
      ExchangeName
    ]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName
    ): IPersistScheduleInstance =>
      Reflect.construct(this.PersistScheduleInstanceCtor, [symbol, strategyName, exchangeName])
  );

  public usePersistScheduleAdapter(Ctor: TPersistScheduleInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_PERSIST_SCHEDULE_ADAPTER);
    this.PersistScheduleInstanceCtor = Ctor;
    this.getScheduleStorage.clear();
  }

  public readScheduleData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<IScheduledSignalRow | null> => {
    LOGGER_SERVICE.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_READ_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getScheduleStorage.has(key);
    const instance = this.getScheduleStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readScheduleData();
  };

  public writeScheduleData = async (
    scheduledSignalRow: IScheduledSignalRow | null,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getScheduleStorage.has(key);
    const instance = this.getScheduleStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeScheduleData(scheduledSignalRow);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_CLEAR);
    this.getScheduleStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistScheduleAdapter(PersistScheduleInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistScheduleAdapter(PersistScheduleDummyInstance);
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

export interface IPersistPartialInstance {
  waitForInit(initial: boolean): Promise<void>;
  readPartialData(signalId: string): Promise<PartialData>;
  writePartialData(data: PartialData, signalId: string): Promise<void>;
}

export class PersistPartialInstance implements IPersistPartialInstance {
  private readonly _storage: IPersistBase<PartialData>;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${symbol}_${strategyName}_${exchangeName}`,
      `./dump/data/partial/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readPartialData(signalId: string): Promise<PartialData> {
    if (await this._storage.hasValue(signalId)) {
      return await this._storage.readValue(signalId);
    }
    return {};
  }

  async writePartialData(data: PartialData, signalId: string): Promise<void> {
    await this._storage.writeValue(signalId, data);
  }
}

class PersistPartialDummyInstance implements IPersistPartialInstance {
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readPartialData(_signalId: string): Promise<PartialData> { return {}; }
  async writePartialData(_data: PartialData, _signalId: string): Promise<void> { void 0; }
}

export type TPersistPartialInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
) => IPersistPartialInstance;

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
  private PersistPartialInstanceCtor: TPersistPartialInstanceCtor = PersistPartialInstance;

  private getPartialStorage = memoize(
    ([symbol, strategyName, exchangeName]: [
      string,
      StrategyName,
      ExchangeName
    ]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName
    ): IPersistPartialInstance =>
      Reflect.construct(this.PersistPartialInstanceCtor, [symbol, strategyName, exchangeName])
  );

  public usePersistPartialAdapter(Ctor: TPersistPartialInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_PERSIST_PARTIAL_ADAPTER);
    this.PersistPartialInstanceCtor = Ctor;
    this.getPartialStorage.clear();
  }

  public readPartialData = async (
    symbol: string,
    strategyName: StrategyName,
    signalId: string,
    exchangeName: ExchangeName
  ): Promise<PartialData> => {
    LOGGER_SERVICE.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_READ_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getPartialStorage.has(key);
    const instance = this.getPartialStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readPartialData(signalId);
  };

  public writePartialData = async (
    partialData: PartialData,
    symbol: string,
    strategyName: StrategyName,
    signalId: string,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getPartialStorage.has(key);
    const instance = this.getPartialStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writePartialData(partialData, signalId);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_CLEAR);
    this.getPartialStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistPartialAdapter(PersistPartialInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistPartialAdapter(PersistPartialDummyInstance);
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

export interface IPersistBreakevenInstance {
  waitForInit(initial: boolean): Promise<void>;
  readBreakevenData(signalId: string): Promise<BreakevenData>;
  writeBreakevenData(data: BreakevenData, signalId: string): Promise<void>;
}

export class PersistBreakevenInstance implements IPersistBreakevenInstance {
  private readonly _storage: IPersistBase<BreakevenData>;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${symbol}_${strategyName}_${exchangeName}`,
      `./dump/data/breakeven/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readBreakevenData(signalId: string): Promise<BreakevenData> {
    if (await this._storage.hasValue(signalId)) {
      return await this._storage.readValue(signalId);
    }
    return {};
  }

  async writeBreakevenData(data: BreakevenData, signalId: string): Promise<void> {
    await this._storage.writeValue(signalId, data);
  }
}

class PersistBreakevenDummyInstance implements IPersistBreakevenInstance {
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readBreakevenData(_signalId: string): Promise<BreakevenData> { return {}; }
  async writeBreakevenData(_data: BreakevenData, _signalId: string): Promise<void> { void 0; }
}

export type TPersistBreakevenInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
) => IPersistBreakevenInstance;

/**
 * Persistence utility class for breakeven state management.
 *
 * Handles reading and writing breakeven state to disk.
 * Uses memoized PersistBreakevenInstance instances per symbol-strategy pair.
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
  private PersistBreakevenInstanceCtor: TPersistBreakevenInstanceCtor = PersistBreakevenInstance;

  private getBreakevenStorage = memoize(
    ([symbol, strategyName, exchangeName]: [
      string,
      StrategyName,
      ExchangeName
    ]): string => `${symbol}:${strategyName}:${exchangeName}`,
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName
    ): IPersistBreakevenInstance =>
      Reflect.construct(this.PersistBreakevenInstanceCtor, [symbol, strategyName, exchangeName])
  );

  public usePersistBreakevenAdapter(Ctor: TPersistBreakevenInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_PERSIST_BREAKEVEN_ADAPTER);
    this.PersistBreakevenInstanceCtor = Ctor;
    this.getBreakevenStorage.clear();
  }

  public readBreakevenData = async (
    symbol: string,
    strategyName: StrategyName,
    signalId: string,
    exchangeName: ExchangeName
  ): Promise<BreakevenData> => {
    LOGGER_SERVICE.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_READ_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getBreakevenStorage.has(key);
    const instance = this.getBreakevenStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readBreakevenData(signalId);
  };

  public writeBreakevenData = async (
    breakevenData: BreakevenData,
    symbol: string,
    strategyName: StrategyName,
    signalId: string,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getBreakevenStorage.has(key);
    const instance = this.getBreakevenStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeBreakevenData(breakevenData, signalId);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_CLEAR);
    this.getBreakevenStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistBreakevenAdapter(PersistBreakevenInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistBreakevenAdapter(PersistBreakevenDummyInstance);
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

/**
 * Type for persisted candle cache data.
 * Each candle is stored as a separate JSON file.
 */
export type CandleData = ICandleData;

export interface IPersistCandleInstance {
  waitForInit(initial: boolean): Promise<void>;
  readCandlesData(limit: number, sinceTimestamp: number, untilTimestamp: number): Promise<CandleData[] | null>;
  writeCandlesData(candles: CandleData[]): Promise<void>;
}

export class PersistCandleInstance implements IPersistCandleInstance {
  private readonly _storage: IPersistBase<CandleData>;

  constructor(
    readonly symbol: string,
    readonly interval: CandleInterval,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${exchangeName}/${symbol}/${interval}`,
      `./dump/data/candle/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readCandlesData(limit: number, sinceTimestamp: number, _untilTimestamp: number): Promise<CandleData[] | null> {
    const stepMs = INTERVAL_MINUTES[this.interval] * MS_PER_MINUTE;
    const cachedCandles: CandleData[] = [];

    for (let i = 0; i < limit; i++) {
      const expectedTimestamp = sinceTimestamp + i * stepMs;
      const timestampKey = String(expectedTimestamp);

      if (await not(this._storage.hasValue(timestampKey))) {
        return null;
      }

      try {
        const candle = await this._storage.readValue(timestampKey);
        cachedCandles.push(candle);
      } catch (error) {
        const message = `PersistCandleInstance.readCandlesData found invalid candle symbol=${this.symbol} interval=${this.interval} timestamp=${expectedTimestamp}`;
        const payload = {
          error: errorData(error),
          message: getErrorMessage(error),
        };
        LOGGER_SERVICE.warn(message, payload);
        console.warn(message, payload);
        errorEmitter.next(error);
        return null;
      }
    }

    return cachedCandles;
  }

  async writeCandlesData(candles: CandleData[]): Promise<void> {
    const stepMs = INTERVAL_MINUTES[this.interval] * MS_PER_MINUTE;
    const now = Date.now();

    for (const candle of candles) {
      const candleCloseTime = candle.timestamp + stepMs;
      if (candleCloseTime > now) {
        LOGGER_SERVICE.debug(
          "PersistCandleInstance.writeCandlesData: skipping incomplete candle",
          {
            symbol: this.symbol,
            interval: this.interval,
            exchangeName: this.exchangeName,
            timestamp: candle.timestamp,
            closeTime: candleCloseTime,
            now,
          }
        );
        continue;
      }

      if (await not(this._storage.hasValue(String(candle.timestamp)))) {
        await this._storage.writeValue(String(candle.timestamp), candle);
      }
    }
  }
}

class PersistCandleDummyInstance implements IPersistCandleInstance {
  constructor(_symbol: string, _interval: CandleInterval, _exchangeName: ExchangeName) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readCandlesData(_limit: number, _since: number, _until: number): Promise<CandleData[] | null> { return null; }
  async writeCandlesData(_candles: CandleData[]): Promise<void> { void 0; }
}

export type TPersistCandleInstanceCtor = new (
  symbol: string,
  interval: CandleInterval,
  exchangeName: ExchangeName,
) => IPersistCandleInstance;

/**
 * Utility class for managing candles cache persistence.
 *
 * Features:
 * - Each candle stored as separate JSON file: ${exchangeName}/${symbol}/${interval}/${timestamp}.json
 * - Cache validation: returns cached data if file count matches requested limit
 * - Automatic cache invalidation and refresh when data is incomplete
 * - Atomic read/write operations
 *
 * Used by ClientExchange for candle data caching.
 */
export class PersistCandleUtils {
  private PersistCandleInstanceCtor: TPersistCandleInstanceCtor = PersistCandleInstance;

  private getCandlesStorage = memoize(
    ([symbol, interval, exchangeName]: [string, CandleInterval, ExchangeName]): string =>
      `${symbol}:${interval}:${exchangeName}`,
    (
      symbol: string,
      interval: CandleInterval,
      exchangeName: ExchangeName
    ): IPersistCandleInstance =>
      Reflect.construct(this.PersistCandleInstanceCtor, [symbol, interval, exchangeName])
  );

  public usePersistCandleAdapter(Ctor: TPersistCandleInstanceCtor): void {
    LOGGER_SERVICE.info("PersistCandleUtils.usePersistCandleAdapter");
    this.PersistCandleInstanceCtor = Ctor;
    this.getCandlesStorage.clear();
  }

  public readCandlesData = async (
    symbol: string,
    interval: CandleInterval,
    exchangeName: ExchangeName,
    limit: number,
    sinceTimestamp: number,
    untilTimestamp: number
  ): Promise<CandleData[] | null> => {
    LOGGER_SERVICE.info("PersistCandleUtils.readCandlesData", {
      symbol,
      interval,
      exchangeName,
      limit,
      sinceTimestamp,
    });
    const key = `${symbol}:${interval}:${exchangeName}`;
    const isInitial = !this.getCandlesStorage.has(key);
    const instance = this.getCandlesStorage(symbol, interval, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.readCandlesData(limit, sinceTimestamp, untilTimestamp);
  };

  public writeCandlesData = async (
    candles: CandleData[],
    symbol: string,
    interval: CandleInterval,
    exchangeName: ExchangeName
  ): Promise<void> => {
    LOGGER_SERVICE.info("PersistCandleUtils.writeCandlesData", {
      symbol,
      interval,
      exchangeName,
      candleCount: candles.length,
    });
    const key = `${symbol}:${interval}:${exchangeName}`;
    const isInitial = !this.getCandlesStorage.has(key);
    const instance = this.getCandlesStorage(symbol, interval, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeCandlesData(candles);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_CANDLE_UTILS_METHOD_NAME_CLEAR);
    this.getCandlesStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log("PersistCandleUtils.useJson");
    this.usePersistCandleAdapter(PersistCandleInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log("PersistCandleUtils.useDummy");
    this.usePersistCandleAdapter(PersistCandleDummyInstance);
  }
}

/**
 * Global singleton instance of PersistCandleUtils.
 * Used by ClientExchange for candle data caching.
 *
 * @example
 * ```typescript
 * // Read cached candles
 * const candles = await PersistCandleAdapter.readCandlesData(
 *   "BTCUSDT", "1m", "binance", 100, since.getTime(), until.getTime()
 * );
 *
 * // Write candles to cache
 * await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT", "1m", "binance");
 * ```
 */
export const PersistCandleAdapter = new PersistCandleUtils();


/**
 * Type for persisted signal storage data.
 * Each signal is stored as a separate file keyed by its id.
 */
export type StorageData = IStorageSignalRow[];

export interface IPersistStorageInstance {
  waitForInit(initial: boolean): Promise<void>;
  readStorageData(): Promise<StorageData>;
  writeStorageData(signals: StorageData): Promise<void>;
}

export class PersistStorageInstance implements IPersistStorageInstance {
  private readonly _storage: IPersistBase<IStorageSignalRow>;

  constructor(readonly backtest: boolean) {
    this._storage = new PersistBase(
      backtest ? `backtest` : `live`,
      `./dump/data/storage/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readStorageData(): Promise<StorageData> {
    const signals: IStorageSignalRow[] = [];
    for await (const signalId of this._storage.keys()) {
      const signal = await this._storage.readValue(signalId);
      signals.push(signal);
    }
    return signals;
  }

  async writeStorageData(signals: StorageData): Promise<void> {
    for (const signal of signals) {
      await this._storage.writeValue(signal.id, signal);
    }
  }
}

class PersistStorageDummyInstance implements IPersistStorageInstance {
  constructor(_backtest: boolean) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readStorageData(): Promise<StorageData> { return []; }
  async writeStorageData(_signals: StorageData): Promise<void> { void 0; }
}

export type TPersistStorageInstanceCtor = new (
  backtest: boolean,
) => IPersistStorageInstance;

/**
 * Utility class for managing signal storage persistence.
 *
 * Features:
 * - Memoized storage instances
 * - Custom adapter support
 * - Atomic read/write operations for StorageData
 * - Each signal stored as separate file keyed by id
 * - Crash-safe signal state management
 *
 * Used by SignalLiveUtils for live mode persistence of signals.
 */
export class PersistStorageUtils {
  private PersistStorageInstanceCtor: TPersistStorageInstanceCtor = PersistStorageInstance;

  private getStorage = memoize(
    ([backtest]: [boolean]): string => backtest ? `backtest` : `live`,
    (backtest: boolean): IPersistStorageInstance =>
      Reflect.construct(this.PersistStorageInstanceCtor, [backtest])
  );

  public usePersistStorageAdapter(Ctor: TPersistStorageInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_STORAGE_UTILS_METHOD_NAME_USE_PERSIST_STORAGE_ADAPTER);
    this.PersistStorageInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  public readStorageData = async (backtest: boolean): Promise<StorageData> => {
    LOGGER_SERVICE.info(PERSIST_STORAGE_UTILS_METHOD_NAME_READ_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.readStorageData();
  };

  public writeStorageData = async (
    signalData: StorageData,
    backtest: boolean
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_STORAGE_UTILS_METHOD_NAME_WRITE_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.writeStorageData(signalData);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_STORAGE_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_STORAGE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistStorageAdapter(PersistStorageInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_STORAGE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistStorageAdapter(PersistStorageDummyInstance);
  }
}

/**
 * Global singleton instance of PersistStorageUtils.
 * Used by SignalLiveUtils for signal storage persistence.
 */
export const PersistStorageAdapter = new PersistStorageUtils();

/**
 * Type for persisted notification data.
 * Each notification is stored as a separate file keyed by its id.
 */
export type NotificationData = NotificationModel[];

export interface IPersistNotificationInstance {
  waitForInit(initial: boolean): Promise<void>;
  readNotificationData(): Promise<NotificationData>;
  writeNotificationData(notifications: NotificationData): Promise<void>;
}

export class PersistNotificationInstance implements IPersistNotificationInstance {
  private readonly _storage: IPersistBase<NotificationModel>;

  constructor(readonly backtest: boolean) {
    this._storage = new PersistBase(
      backtest ? `backtest` : `live`,
      `./dump/data/notification/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readNotificationData(): Promise<NotificationData> {
    const notifications: NotificationModel[] = [];
    for await (const notificationId of this._storage.keys()) {
      const notification = await this._storage.readValue(notificationId);
      notifications.push(notification);
    }
    return notifications;
  }

  async writeNotificationData(notifications: NotificationData): Promise<void> {
    for (const notification of notifications) {
      await this._storage.writeValue(notification.id, notification);
    }
  }
}

class PersistNotificationDummyInstance implements IPersistNotificationInstance {
  constructor(_backtest: boolean) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readNotificationData(): Promise<NotificationData> { return []; }
  async writeNotificationData(_notifications: NotificationData): Promise<void> { void 0; }
}

export type TPersistNotificationInstanceCtor = new (
  backtest: boolean,
) => IPersistNotificationInstance;

/**
 * Utility class for managing notification persistence.
 *
 * Features:
 * - Memoized storage instances
 * - Custom adapter support
 * - Atomic read/write operations for NotificationData
 * - Each notification stored as separate file keyed by id
 * - Crash-safe notification state management
 *
 * Used by NotificationPersistLiveUtils/NotificationPersistBacktestUtils for persistence.
 */
export class PersistNotificationUtils {
  private PersistNotificationInstanceCtor: TPersistNotificationInstanceCtor = PersistNotificationInstance;

  private getNotificationStorage = memoize(
    ([backtest]: [boolean]): string => backtest ? `backtest` : `live`,
    (backtest: boolean): IPersistNotificationInstance =>
      Reflect.construct(this.PersistNotificationInstanceCtor, [backtest])
  );

  public usePersistNotificationAdapter(Ctor: TPersistNotificationInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_PERSIST_NOTIFICATION_ADAPTER);
    this.PersistNotificationInstanceCtor = Ctor;
    this.getNotificationStorage.clear();
  }

  public readNotificationData = async (backtest: boolean): Promise<NotificationData> => {
    LOGGER_SERVICE.info(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_READ_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getNotificationStorage.has(key);
    const instance = this.getNotificationStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.readNotificationData();
  };

  public writeNotificationData = async (
    notificationData: NotificationData,
    backtest: boolean
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_WRITE_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getNotificationStorage.has(key);
    const instance = this.getNotificationStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.writeNotificationData(notificationData);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_CLEAR);
    this.getNotificationStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistNotificationAdapter(PersistNotificationInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistNotificationAdapter(PersistNotificationDummyInstance);
  }
}

/**
 * Global singleton instance of PersistNotificationUtils.
 * Used by NotificationPersistLiveUtils/NotificationPersistBacktestUtils for notification persistence.
 */
export const PersistNotificationAdapter = new PersistNotificationUtils();

export { PersistBase }

/**
 * Type for persisted log data.
 * Each log entry is stored as a separate file keyed by its id.
 */
export type LogData = ILogEntry[];

export interface IPersistLogInstance {
  waitForInit(initial: boolean): Promise<void>;
  readLogData(): Promise<LogData>;
  writeLogData(entries: LogData): Promise<void>;
}

export class PersistLogInstance implements IPersistLogInstance {
  private readonly _storage: IPersistBase<ILogEntry>;

  constructor() {
    this._storage = new PersistBase(`log`, `./dump/data/log/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readLogData(): Promise<LogData> {
    const entries: ILogEntry[] = [];
    for await (const entryId of this._storage.keys()) {
      const entry = await this._storage.readValue(entryId);
      entries.push(entry);
    }
    return entries;
  }

  async writeLogData(logData: LogData): Promise<void> {
    for (const entry of logData) {
      if (await this._storage.hasValue(entry.id)) {
        continue;
      }
      await this._storage.writeValue(entry.id, entry);
    }
  }
}

class PersistLogDummyInstance implements IPersistLogInstance {
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readLogData(): Promise<LogData> { return []; }
  async writeLogData(_entries: LogData): Promise<void> { void 0; }
}

export type TPersistLogInstanceCtor = new () => IPersistLogInstance;

/**
 * Utility class for managing log entry persistence.
 *
 * Features:
 * - Cached storage instance
 * - Custom adapter support
 * - Atomic read/write operations for LogData
 * - Each log entry stored as separate file keyed by id
 * - Crash-safe log state management
 *
 * Used by LogPersistUtils for log entry persistence.
 */
export class PersistLogUtils {
  private PersistLogInstanceCtor: TPersistLogInstanceCtor = PersistLogInstance;

  private _logInstance: IPersistLogInstance | null = null;

  private getLogInstance(): IPersistLogInstance {
    if (!this._logInstance) {
      this._logInstance = Reflect.construct(this.PersistLogInstanceCtor, []);
    }
    return this._logInstance!;
  }

  public usePersistLogAdapter(Ctor: TPersistLogInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_USE_PERSIST_LOG_ADAPTER);
    this.PersistLogInstanceCtor = Ctor;
    this._logInstance = null;
  }

  public readLogData = async (): Promise<LogData> => {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_READ_DATA);
    const isInitial = !this._logInstance;
    const instance = this.getLogInstance();
    await instance.waitForInit(isInitial);
    return instance.readLogData();
  };

  public writeLogData = async (logData: LogData): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_WRITE_DATA);
    const isInitial = !this._logInstance;
    const instance = this.getLogInstance();
    await instance.waitForInit(isInitial);
    return instance.writeLogData(logData);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_LOG_UTILS_METHOD_NAME_CLEAR);
    this._logInstance = null;
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_LOG_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistLogAdapter(PersistLogInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_LOG_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistLogAdapter(PersistLogDummyInstance);
  }
}

/**
 * Global singleton instance of PersistLogUtils.
 * Used by LogPersistUtils for log entry persistence.
 */
export const PersistLogAdapter = new PersistLogUtils();

export interface IPersistMeasureInstance {
  waitForInit(initial: boolean): Promise<void>;
  readMeasureData(key: string): Promise<MeasureData | null>;
  writeMeasureData(data: MeasureData, key: string): Promise<void>;
  removeMeasureData(key: string): Promise<void>;
  listMeasureData(): AsyncGenerator<string>;
}

export class PersistMeasureInstance implements IPersistMeasureInstance {
  private readonly _storage: IPersistBase<MeasureData>;

  constructor(readonly bucket: string) {
    this._storage = new PersistBase(bucket, `./dump/data/measure/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readMeasureData(key: string): Promise<MeasureData | null> {
    if (await this._storage.hasValue(key)) {
      const data = await this._storage.readValue(key);
      return data.removed ? null : data;
    }
    return null;
  }

  async writeMeasureData(data: MeasureData, key: string): Promise<void> {
    await this._storage.writeValue(key, data);
  }

  async removeMeasureData(key: string): Promise<void> {
    const data = await this._storage.readValue(key);
    if (data) {
      await this._storage.writeValue(key, Object.assign({}, data, { removed: true }));
    }
  }

  async *listMeasureData(): AsyncGenerator<string> {
    for await (const key of this._storage.keys()) {
      const data = await this._storage.readValue(String(key));
      if (data === null || data.removed) {
        continue;
      }
      yield String(key);
    }
  }
}

class PersistMeasureDummyInstance implements IPersistMeasureInstance {
  constructor(_bucket: string) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readMeasureData(_key: string): Promise<MeasureData | null> { return null; }
  async writeMeasureData(_data: MeasureData, _key: string): Promise<void> { void 0; }
  async removeMeasureData(_key: string): Promise<void> { void 0; }
  async *listMeasureData(): AsyncGenerator<string> { /* empty */ }
}

export type TPersistMeasureInstanceCtor = new (
  bucket: string,
) => IPersistMeasureInstance;

/**
 * Utility class for managing external API response cache persistence.
 *
 * Features:
 * - Memoized storage instances per cache bucket (aligned timestamp + symbol)
 * - Custom adapter support
 * - Atomic read/write operations
 * - Crash-safe cache state management
 *
 * Used by Cache.file for persistent caching of external API responses.
 */
export class PersistMeasureUtils {
  private PersistMeasureInstanceCtor: TPersistMeasureInstanceCtor = PersistMeasureInstance;

  private getMeasureStorage = memoize(
    ([bucket]: [string]): string => bucket,
    (bucket: string): IPersistMeasureInstance =>
      Reflect.construct(this.PersistMeasureInstanceCtor, [bucket])
  );

  public usePersistMeasureAdapter(Ctor: TPersistMeasureInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_USE_PERSIST_MEASURE_ADAPTER);
    this.PersistMeasureInstanceCtor = Ctor;
    this.getMeasureStorage.clear();
  }

  public readMeasureData = async (
    bucket: string,
    key: string
  ): Promise<MeasureData | null> => {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_READ_DATA, { bucket, key });
    const isInitial = !this.getMeasureStorage.has(bucket);
    const instance = this.getMeasureStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.readMeasureData(key);
  };

  public writeMeasureData = async (
    data: MeasureData,
    bucket: string,
    key: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_WRITE_DATA, { bucket, key });
    const isInitial = !this.getMeasureStorage.has(bucket);
    const instance = this.getMeasureStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.writeMeasureData(data, key);
  };

  public removeMeasureData = async (
    bucket: string,
    key: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_REMOVE_DATA, { bucket, key });
    const isInitial = !this.getMeasureStorage.has(bucket);
    const instance = this.getMeasureStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.removeMeasureData(key);
  };

  public async *listMeasureData(bucket: string): AsyncGenerator<string> {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_LIST_DATA, { bucket });
    const isInitial = !this.getMeasureStorage.has(bucket);
    const instance = this.getMeasureStorage(bucket);
    await instance.waitForInit(isInitial);
    yield* instance.listMeasureData();
  }

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_MEASURE_UTILS_METHOD_NAME_CLEAR);
    this.getMeasureStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_MEASURE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistMeasureAdapter(PersistMeasureInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_MEASURE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistMeasureAdapter(PersistMeasureDummyInstance);
  }
}

/**
 * Global singleton instance of PersistMeasureUtils.
 * Used by Cache.file for persistent caching of external API responses.
 */
export const PersistMeasureAdapter = new PersistMeasureUtils();

export interface IPersistIntervalInstance {
  waitForInit(initial: boolean): Promise<void>;
  readIntervalData(key: string): Promise<IntervalData | null>;
  writeIntervalData(data: IntervalData, key: string): Promise<void>;
  removeIntervalData(key: string): Promise<void>;
  listIntervalData(): AsyncGenerator<string>;
}

export class PersistIntervalInstance implements IPersistIntervalInstance {
  private readonly _storage: IPersistBase<IntervalData>;

  constructor(readonly bucket: string) {
    this._storage = new PersistBase(bucket, `./dump/data/interval/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readIntervalData(key: string): Promise<IntervalData | null> {
    if (await this._storage.hasValue(key)) {
      const data = await this._storage.readValue(key);
      return data.removed ? null : data;
    }
    return null;
  }

  async writeIntervalData(data: IntervalData, key: string): Promise<void> {
    await this._storage.writeValue(key, data);
  }

  async removeIntervalData(key: string): Promise<void> {
    const data = await this._storage.readValue(key);
    if (data) {
      await this._storage.writeValue(key, Object.assign({}, data, { removed: true }));
    }
  }

  async *listIntervalData(): AsyncGenerator<string> {
    for await (const key of this._storage.keys()) {
      const data = await this._storage.readValue(String(key));
      if (data === null || data.removed) {
        continue;
      }
      yield String(key);
    }
  }
}

class PersistIntervalDummyInstance implements IPersistIntervalInstance {
  constructor(_bucket: string) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readIntervalData(_key: string): Promise<IntervalData | null> { return null; }
  async writeIntervalData(_data: IntervalData, _key: string): Promise<void> { void 0; }
  async removeIntervalData(_key: string): Promise<void> { void 0; }
  async *listIntervalData(): AsyncGenerator<string> { /* empty */ }
}

export type TPersistIntervalInstanceCtor = new (
  bucket: string,
) => IPersistIntervalInstance;

/**
 * Persistence layer for Interval.file once-per-interval signal firing.
 *
 * Stores fired-interval markers under `./dump/data/interval/`.
 * A record's presence means the interval has already fired for that bucket+key;
 * absence means the function has not yet fired (or returned null last time).
 */
export class PersistIntervalUtils {
  private PersistIntervalInstanceCtor: TPersistIntervalInstanceCtor = PersistIntervalInstance;

  private getIntervalStorage = memoize(
    ([bucket]: [string]): string => bucket,
    (bucket: string): IPersistIntervalInstance =>
      Reflect.construct(this.PersistIntervalInstanceCtor, [bucket])
  );

  public usePersistIntervalAdapter(Ctor: TPersistIntervalInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_PERSIST_INTERVAL_ADAPTER);
    this.PersistIntervalInstanceCtor = Ctor;
    this.getIntervalStorage.clear();
  }

  public readIntervalData = async (
    bucket: string,
    key: string
  ): Promise<IntervalData | null> => {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_READ_DATA, { bucket, key });
    const isInitial = !this.getIntervalStorage.has(bucket);
    const instance = this.getIntervalStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.readIntervalData(key);
  };

  public writeIntervalData = async (
    data: IntervalData,
    bucket: string,
    key: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_WRITE_DATA, { bucket, key });
    const isInitial = !this.getIntervalStorage.has(bucket);
    const instance = this.getIntervalStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.writeIntervalData(data, key);
  };

  public removeIntervalData = async (
    bucket: string,
    key: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_REMOVE_DATA, { bucket, key });
    const isInitial = !this.getIntervalStorage.has(bucket);
    const instance = this.getIntervalStorage(bucket);
    await instance.waitForInit(isInitial);
    return instance.removeIntervalData(key);
  };

  public async *listIntervalData(bucket: string): AsyncGenerator<string> {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_LIST_DATA, { bucket });
    const isInitial = !this.getIntervalStorage.has(bucket);
    const instance = this.getIntervalStorage(bucket);
    await instance.waitForInit(isInitial);
    yield* instance.listIntervalData();
  }

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_INTERVAL_UTILS_METHOD_NAME_CLEAR);
    this.getIntervalStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistIntervalAdapter(PersistIntervalInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistIntervalAdapter(PersistIntervalDummyInstance);
  }
}

/**
 * Global singleton instance of PersistIntervalUtils.
 * Used by Interval.file for persistent once-per-interval signal firing.
 */
export const PersistIntervalAdapter = new PersistIntervalUtils();

/**
 * Type for persisted memory entry data.
 * Each memory entry is an arbitrary JSON-serializable object.
 */
export type MemoryData = {
  priority: number;
  data: object;
  removed: boolean;
  index: string;
};

export interface IPersistMemoryInstance {
  waitForInit(initial: boolean): Promise<void>;
  readMemoryData(memoryId: string): Promise<MemoryData | null>;
  hasMemoryData(memoryId: string): Promise<boolean>;
  writeMemoryData(data: MemoryData, memoryId: string): Promise<void>;
  removeMemoryData(memoryId: string): Promise<void>;
  listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }>;
  dispose(): void;
}

export class PersistMemoryInstance implements IPersistMemoryInstance {
  private readonly _storage: IPersistBase<MemoryData>;

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {
    this._storage = new PersistBase(bucketName, `./dump/memory/${signalId}/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readMemoryData(memoryId: string): Promise<MemoryData | null> {
    if (await this._storage.hasValue(memoryId)) {
      const data = await this._storage.readValue(memoryId);
      return data.removed ? null : data;
    }
    return null;
  }

  async hasMemoryData(memoryId: string): Promise<boolean> {
    return await this._storage.hasValue(memoryId);
  }

  async writeMemoryData(data: MemoryData, memoryId: string): Promise<void> {
    await this._storage.writeValue(memoryId, data);
  }

  async removeMemoryData(memoryId: string): Promise<void> {
    const data = await this._storage.readValue(memoryId);
    if (data) {
      await this._storage.writeValue(memoryId, Object.assign({}, data, { removed: true }));
    }
  }

  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> {
    for await (const memoryId of this._storage.keys()) {
      const data = await this._storage.readValue(String(memoryId));
      if (data === null || data.removed) {
        continue;
      }
      yield { memoryId: String(memoryId), data };
    }
  }

  dispose(): void { void 0; }
}

class PersistMemoryDummyInstance implements IPersistMemoryInstance {
  constructor(_signalId: string, _bucketName: string) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readMemoryData(_memoryId: string): Promise<MemoryData | null> { return null; }
  async hasMemoryData(_memoryId: string): Promise<boolean> { return false; }
  async writeMemoryData(_data: MemoryData, _memoryId: string): Promise<void> { void 0; }
  async removeMemoryData(_memoryId: string): Promise<void> { void 0; }
  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> { /* empty */ }
  dispose(): void { void 0; }
}

export type TPersistMemoryInstanceCtor = new (
  signalId: string,
  bucketName: string,
) => IPersistMemoryInstance;

/**
 * Utility class for managing memory entry persistence.
 *
 * Features:
 * - Memoized storage instances per (signalId, bucketName) pair
 * - Custom adapter support
 * - Atomic read/write/remove operations
 * - Async iteration over stored keys for index rebuilding
 *
 * Storage layout: ./dump/memory/<signalId>/<bucketName>/<memoryId>.json
 *
 * Used by MemoryPersistInstance for crash-safe memory persistence.
 */
export class PersistMemoryUtils {
  private PersistMemoryInstanceCtor: TPersistMemoryInstanceCtor = PersistMemoryInstance;

  private getMemoryStorage = memoize(
    ([signalId, bucketName]: [string, string]): string =>
      `${signalId}:${bucketName}`,
    (signalId: string, bucketName: string): IPersistMemoryInstance =>
      Reflect.construct(this.PersistMemoryInstanceCtor, [signalId, bucketName])
  );

  public usePersistMemoryAdapter(Ctor: TPersistMemoryInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_USE_PERSIST_MEMORY_ADAPTER);
    this.PersistMemoryInstanceCtor = Ctor;
    this.getMemoryStorage.clear();
  }

  public waitForInit = async (
    signalId: string,
    bucketName: string,
    initial: boolean
  ): Promise<void> => {
    const key = `${signalId}:${bucketName}`;
    const isInitial = initial && !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
  };

  public readMemoryData = async (
    signalId: string,
    bucketName: string,
    memoryId: string
  ): Promise<MemoryData | null> => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_READ_DATA, { signalId, bucketName, memoryId });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.readMemoryData(memoryId);
  };

  public hasMemoryData = async (
    signalId: string,
    bucketName: string,
    memoryId: string
  ): Promise<boolean> => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_HAS_DATA, { signalId, bucketName, memoryId });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.hasMemoryData(memoryId);
  };

  public writeMemoryData = async (
    data: MemoryData,
    signalId: string,
    bucketName: string,
    memoryId: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_WRITE_DATA, { signalId, bucketName, memoryId });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.writeMemoryData(data, memoryId);
  };

  public removeMemoryData = async (
    signalId: string,
    bucketName: string,
    memoryId: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_REMOVE_DATA, { signalId, bucketName, memoryId });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.removeMemoryData(memoryId);
  };

  public async *listMemoryData(
    signalId: string,
    bucketName: string
  ): AsyncGenerator<{ memoryId: string; data: MemoryData }> {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_LIST_DATA, { signalId, bucketName });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getMemoryStorage.has(key);
    const instance = this.getMemoryStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    yield* instance.listMemoryData();
  }

  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_CLEAR);
    this.getMemoryStorage.clear();
  }

  public dispose = (signalId: string, bucketName: string) => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_DISPOSE);
    const key = `${signalId}:${bucketName}`;
    this.getMemoryStorage.clear(key);
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistMemoryAdapter(PersistMemoryInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistMemoryAdapter(PersistMemoryDummyInstance);
  }
}

/**
 * Global singleton instance of PersistMemoryUtils.
 * Used by MemoryPersistInstance for crash-safe memory entry persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistMemoryAdapter.usePersistMemoryAdapter(RedisPersist);
 *
 * // Write entry
 * await PersistMemoryAdapter.writeMemoryData({ foo: "bar" }, "sig-1", "strategy", "context");
 *
 * // Read entry
 * const data = await PersistMemoryAdapter.readMemoryData("sig-1", "strategy", "context");
 * ```
 */
export const PersistMemoryAdapter = new PersistMemoryUtils();

/**
 * Type for persisted recent signal data.
 * Stores the latest active signal per context key.
 */
export type RecentData = IPublicSignalRow | null;

export interface IPersistRecentInstance {
  waitForInit(initial: boolean): Promise<void>;
  readRecentData(): Promise<IPublicSignalRow | null>;
  writeRecentData(signalRow: IPublicSignalRow): Promise<void>;
}

export class PersistRecentInstance implements IPersistRecentInstance {
  private readonly _storage: IPersistBase<IPublicSignalRow>;

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
  ) {
    const parts = [symbol, strategyName, exchangeName];
    if (frameName) parts.push(frameName);
    parts.push(backtest ? "backtest" : "live");
    this._storage = new PersistBase(parts.join("_"), `./dump/data/recent/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readRecentData(): Promise<IPublicSignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  async writeRecentData(signalRow: IPublicSignalRow): Promise<void> {
    await this._storage.writeValue(this.symbol, signalRow);
  }
}

class PersistRecentDummyInstance implements IPersistRecentInstance {
  constructor(
    _symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName,
    _frameName: FrameName, _backtest: boolean,
  ) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readRecentData(): Promise<IPublicSignalRow | null> { return null; }
  async writeRecentData(_signalRow: IPublicSignalRow): Promise<void> { void 0; }
}

export type TPersistRecentInstanceCtor = new (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
) => IPersistRecentInstance;

/**
 * Utility class for managing recent signal persistence.
 *
 * Features:
 * - Memoized storage instances per (symbol, strategyName, exchangeName, frameName) context
 * - Custom adapter support
 * - Atomic read/write operations
 * - Crash-safe recent signal state management
 *
 * Used by RecentPersistBacktestUtils/RecentPersistLiveUtils for recent signal persistence.
 */
export class PersistRecentUtils {
  private PersistRecentInstanceCtor: TPersistRecentInstanceCtor = PersistRecentInstance;

  private createKey(
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): string {
    const parts = [symbol, strategyName, exchangeName];
    if (frameName) parts.push(frameName);
    parts.push(backtest ? "backtest" : "live");
    return parts.join(":");
  }

  private getStorage = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]: [string, StrategyName, ExchangeName, FrameName, boolean]) =>
      this.createKey(symbol, strategyName, exchangeName, frameName, backtest),
    (
      symbol: string,
      strategyName: StrategyName,
      exchangeName: ExchangeName,
      frameName: FrameName,
      backtest: boolean,
    ): IPersistRecentInstance =>
      Reflect.construct(this.PersistRecentInstanceCtor, [symbol, strategyName, exchangeName, frameName, backtest])
  );

  public usePersistRecentAdapter(Ctor: TPersistRecentInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_RECENT_UTILS_METHOD_NAME_USE_PERSIST_RECENT_ADAPTER);
    this.PersistRecentInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  public readRecentData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<IPublicSignalRow | null> => {
    LOGGER_SERVICE.info(PERSIST_RECENT_UTILS_METHOD_NAME_READ_DATA);
    const key = this.createKey(symbol, strategyName, exchangeName, frameName, backtest);
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await instance.waitForInit(isInitial);
    return instance.readRecentData();
  };

  public writeRecentData = async (
    signalRow: IPublicSignalRow,
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_RECENT_UTILS_METHOD_NAME_WRITE_DATA);
    const key = this.createKey(symbol, strategyName, exchangeName, frameName, backtest);
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await instance.waitForInit(isInitial);
    return instance.writeRecentData(signalRow);
  };

  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_RECENT_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  public useJson() {
    LOGGER_SERVICE.log(PERSIST_RECENT_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistRecentAdapter(PersistRecentInstance);
  }

  public useDummy() {
    LOGGER_SERVICE.log(PERSIST_RECENT_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistRecentAdapter(PersistRecentDummyInstance);
  }
}

/**
 * Global singleton instance of PersistRecentUtils.
 * Used by RecentPersistBacktestUtils/RecentPersistLiveUtils for recent signal persistence.
 */
export const PersistRecentAdapter = new PersistRecentUtils();

/**
 * Type for persisted state entry data.
 * Wraps an arbitrary JSON-serializable object with a unique id.
 */
export type StateData = {
  id: string;
  data: object;
};

export interface IPersistStateInstance {
  waitForInit(initial: boolean): Promise<void>;
  readStateData(): Promise<StateData | null>;
  writeStateData(data: StateData): Promise<void>;
  dispose(): void;
}

export class PersistStateInstance implements IPersistStateInstance {
  private readonly _storage: IPersistBase<StateData>;

  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {
    this._storage = new PersistBase(bucketName, `./dump/state/${signalId}/`);
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readStateData(): Promise<StateData | null> {
    if (await this._storage.hasValue(this.bucketName)) {
      return await this._storage.readValue(this.bucketName);
    }
    return null;
  }

  async writeStateData(data: StateData): Promise<void> {
    await this._storage.writeValue(this.bucketName, data);
  }

  dispose(): void { void 0; }
}

class PersistStateDummyInstance implements IPersistStateInstance {
  constructor(_signalId: string, _bucketName: string) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readStateData(): Promise<StateData | null> { return null; }
  async writeStateData(_data: StateData): Promise<void> { void 0; }
  dispose(): void { void 0; }
}

export type TPersistStateInstanceCtor = new (
  signalId: string,
  bucketName: string,
) => IPersistStateInstance;

/**
 * Utility class for managing state persistence.
 *
 * Features:
 * - Memoized storage instances per (signalId, bucketName) pair
 * - Custom adapter support
 * - Atomic read/write operations
 *
 * Storage layout: ./dump/state/<signalId>/<bucketName>.json
 *
 * Used by StatePersistInstance for crash-safe state persistence.
 */
export class PersistStateUtils {
  private PersistStateInstanceCtor: TPersistStateInstanceCtor = PersistStateInstance;

  private getStateStorage = memoize(
    ([signalId, bucketName]: [string, string]): string =>
      `${signalId}:${bucketName}`,
    (signalId: string, bucketName: string): IPersistStateInstance =>
      Reflect.construct(this.PersistStateInstanceCtor, [signalId, bucketName])
  );

  public usePersistStateAdapter(Ctor: TPersistStateInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_USE_PERSIST_STATE_ADAPTER);
    this.PersistStateInstanceCtor = Ctor;
    this.getStateStorage.clear();
  }

  public waitForInit = async (
    signalId: string,
    bucketName: string,
    initial: boolean
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_WAIT_FOR_INIT, { signalId, bucketName, initial });
    const key = `${signalId}:${bucketName}`;
    const isInitial = initial && !this.getStateStorage.has(key);
    const instance = this.getStateStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
  };

  public readStateData = async (
    signalId: string,
    bucketName: string
  ): Promise<StateData | null> => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_READ_DATA, { signalId, bucketName });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getStateStorage.has(key);
    const instance = this.getStateStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.readStateData();
  };

  public writeStateData = async (
    data: StateData,
    signalId: string,
    bucketName: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_WRITE_DATA, { signalId, bucketName });
    const key = `${signalId}:${bucketName}`;
    const isInitial = !this.getStateStorage.has(key);
    const instance = this.getStateStorage(signalId, bucketName);
    await instance.waitForInit(isInitial);
    return instance.writeStateData(data);
  };

  public useDummy = () => {
    LOGGER_SERVICE.log(PERSIST_STATE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistStateAdapter(PersistStateDummyInstance);
  }

  public useJson = () => {
    LOGGER_SERVICE.log(PERSIST_STATE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistStateAdapter(PersistStateInstance);
  }

  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_CLEAR);
    this.getStateStorage.clear();
  };

  public dispose = (signalId: string, bucketName: string) => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_DISPOSE);
    const key = `${signalId}:${bucketName}`;
    this.getStateStorage.clear(key);
  };
}

/**
 * Global singleton instance of PersistStateUtils.
 * Used by StatePersistInstance for crash-safe state persistence.
 */
export const PersistStateAdapter = new PersistStateUtils();

/**
 * Session data structure for session persistence.
 * Each session is identified by a unique id and contains an arbitrary JSON-serializable data object.
 */
export type SessionData = {
  id: string;
  data: object | null;
};

export interface IPersistSessionInstance {
  waitForInit(initial: boolean): Promise<void>;
  readSessionData(): Promise<SessionData | null>;
  writeSessionData(data: SessionData): Promise<void>;
  dispose(): void;
}

export class PersistSessionInstance implements IPersistSessionInstance {
  private readonly _storage: IPersistBase<SessionData>;

  constructor(
    readonly strategyName: string,
    readonly exchangeName: string,
    readonly frameName: string,
  ) {
    this._storage = new PersistBase(
      frameName,
      `./dump/session/${strategyName}/${exchangeName}/`
    );
  }

  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  async readSessionData(): Promise<SessionData | null> {
    if (await this._storage.hasValue(this.frameName)) {
      return await this._storage.readValue(this.frameName);
    }
    return null;
  }

  async writeSessionData(data: SessionData): Promise<void> {
    await this._storage.writeValue(this.frameName, data);
  }

  dispose(): void { void 0; }
}

class PersistSessionDummyInstance implements IPersistSessionInstance {
  constructor(_strategyName: string, _exchangeName: string, _frameName: string) {}
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  async readSessionData(): Promise<SessionData | null> { return null; }
  async writeSessionData(_data: SessionData): Promise<void> { void 0; }
  dispose(): void { void 0; }
}

export type TPersistSessionInstanceCtor = new (
  strategyName: string,
  exchangeName: string,
  frameName: string,
) => IPersistSessionInstance;

/**
 * Utility class for managing session persistence.
 *
 * Features:
 * - Memoized storage instances per (strategyName, exchangeName, frameName) key
 * - Custom adapter support
 * - Atomic read/write operations
 *
 * Storage layout: ./dump/session/<strategyName>/<exchangeName>/<frameName>.json
 *
 * Used by SessionPersistInstance for crash-safe session persistence.
 */
export class PersistSessionUtils {
  private PersistSessionInstanceCtor: TPersistSessionInstanceCtor = PersistSessionInstance;

  private getSessionStorage = memoize(
    ([strategyName, exchangeName, frameName]: [string, string, string]): string =>
      `${strategyName}:${exchangeName}:${frameName}`,
    (strategyName: string, exchangeName: string, frameName: string): IPersistSessionInstance =>
      Reflect.construct(this.PersistSessionInstanceCtor, [strategyName, exchangeName, frameName])
  );

  public usePersistSessionAdapter(Ctor: TPersistSessionInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_USE_PERSIST_SESSION_ADAPTER);
    this.PersistSessionInstanceCtor = Ctor;
    this.getSessionStorage.clear();
  }

  public waitForInit = async (
    strategyName: string,
    exchangeName: string,
    frameName: string,
    initial: boolean
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_WAIT_FOR_INIT, { strategyName, exchangeName, frameName, initial });
    const key = `${strategyName}:${exchangeName}:${frameName}`;
    const isInitial = initial && !this.getSessionStorage.has(key);
    const instance = this.getSessionStorage(strategyName, exchangeName, frameName);
    await instance.waitForInit(isInitial);
  };

  public readSessionData = async (
    strategyName: string,
    exchangeName: string,
    frameName: string
  ): Promise<SessionData | null> => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_READ_DATA, { strategyName, exchangeName, frameName });
    const key = `${strategyName}:${exchangeName}:${frameName}`;
    const isInitial = !this.getSessionStorage.has(key);
    const instance = this.getSessionStorage(strategyName, exchangeName, frameName);
    await instance.waitForInit(isInitial);
    return instance.readSessionData();
  };

  public writeSessionData = async (
    data: SessionData,
    strategyName: string,
    exchangeName: string,
    frameName: string
  ): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_WRITE_DATA, { strategyName, exchangeName, frameName });
    const key = `${strategyName}:${exchangeName}:${frameName}`;
    const isInitial = !this.getSessionStorage.has(key);
    const instance = this.getSessionStorage(strategyName, exchangeName, frameName);
    await instance.waitForInit(isInitial);
    return instance.writeSessionData(data);
  };

  public useDummy = () => {
    LOGGER_SERVICE.log(PERSIST_SESSION_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistSessionAdapter(PersistSessionDummyInstance);
  };

  public useJson = () => {
    LOGGER_SERVICE.log(PERSIST_SESSION_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistSessionAdapter(PersistSessionInstance);
  }

  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_CLEAR);
    this.getSessionStorage.clear();
  };

  public dispose = (strategyName: string, exchangeName: string, frameName: string) => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_DISPOSE);
    const key = `${strategyName}:${exchangeName}:${frameName}`;
    this.getSessionStorage.clear(key);
  };
}

/**
 * Global singleton instance of PersistSessionUtils.
 * Used by SessionPersistInstance for crash-safe session persistence.
 */
export const PersistSessionAdapter = new PersistSessionUtils();
