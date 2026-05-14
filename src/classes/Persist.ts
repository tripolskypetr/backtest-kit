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

/**
 * Per-context signal persistence instance interface.
 * Scoped to a specific (symbol, strategyName, exchangeName) triple.
 *
 * Custom adapters should implement this interface to override the default
 * file-based signal persistence behavior.
 */
export interface IPersistSignalInstance {
  /**
   * Initialize storage for this signal context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted signal data for this context.
   *
   * @returns Promise resolving to signal or null if none persisted
   */
  readSignalData(): Promise<ISignalRow | null>;

  /**
   * Write signal data for this context (null to clear).
   *
   * @param signalRow - Signal data to persist, or null to clear
   * @returns Promise that resolves when write is complete
   */
  writeSignalData(signalRow: ISignalRow | null): Promise<void>;
}

/**
 * Default file-based implementation of IPersistSignalInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses symbol as entity ID within a per-context PersistBase
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistSignalInstance("BTCUSDT", "my-strategy", "binance");
 * await instance.waitForInit(true);
 * await instance.writeSignalData(signalRow);
 * const restored = await instance.readSignalData();
 * ```
 */
export class PersistSignalInstance implements IPersistSignalInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<SignalData>;

  /**
   * Creates new signal persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   * Delegates to PersistBase.waitForInit which uses singleshot.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted signal using `symbol` as the entity key.
   *
   * @returns Promise resolving to the signal or null if not found
   */
  async readSignalData(): Promise<ISignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  /**
   * Writes the signal (or null to clear) using `symbol` as the entity key.
   *
   * @param signalRow - Signal data to persist, or null to clear
   * @returns Promise that resolves when write is complete
   */
  async writeSignalData(signalRow: ISignalRow | null): Promise<void> {
    await this._storage.writeValue(this.symbol, signalRow);
  }
}

/**
 * No-op IPersistSignalInstance implementation used by PersistSignalUtils.useDummy().
 * All reads return null, all writes are discarded.
 */
class PersistSignalDummyInstance implements IPersistSignalInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistSignalInstanceCtor.
   */
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no persisted signal).
   * @returns Promise resolving to null
   */
  async readSignalData(): Promise<ISignalRow | null> { return null; }
  /**
   * No-op write (discards data).
   * @returns Promise that resolves immediately
   */
  async writeSignalData(_signalRow: ISignalRow | null): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistSignalInstance.
 * Used by PersistSignalUtils.usePersistSignalAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context signal instances.
   * Replaceable via usePersistSignalAdapter() / useJson() / useDummy().
   */
  private PersistSignalInstanceCtor: TPersistSignalInstanceCtor = PersistSignalInstance;

  /**
   * Memoized factory creating one IPersistSignalInstance per (symbol, strategy, exchange) triple.
   */
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

  /**
   * Registers a custom IPersistSignalInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistSignalInstance constructor
   */
  public usePersistSignalAdapter(Ctor: TPersistSignalInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_PERSIST_SIGNAL_ADAPTER);
    this.PersistSignalInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  /**
   * Reads persisted signal for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to signal or null if none persisted
   */
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

  /**
   * Writes signal data (or null to clear) for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param signalRow - Signal data to persist, or null to clear
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
    LOGGER_SERVICE.info(PERSIST_SIGNAL_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeSignalData(signalRow);
  };

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  /**
   * Switches to the default file-based PersistSignalInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistSignalAdapter(PersistSignalInstance);
  }

  /**
   * Switches to PersistSignalDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context risk positions persistence instance interface.
 * Scoped to a specific (riskName, exchangeName) pair.
 *
 * Custom adapters should implement this interface to override the default
 * file-based active positions persistence behavior.
 */
export interface IPersistRiskInstance {
  /**
   * Initialize storage for this risk context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted active positions for this context.
   *
   * @returns Promise resolving to position entries (empty array if none persisted)
   */
  readPositionData(): Promise<RiskData>;

  /**
   * Write active positions for this context.
   *
   * @param riskRow - Position entries to persist
   * @returns Promise that resolves when write is complete
   */
  writePositionData(riskRow: RiskData): Promise<void>;
}

/**
 * Default file-based implementation of IPersistRiskInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses fixed entity ID "positions" within a per-context PersistBase
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistRiskInstance("my-risk", "binance");
 * await instance.waitForInit(true);
 * await instance.writePositionData([["strategy:BTCUSDT", positionData]]);
 * const positions = await instance.readPositionData();
 * ```
 */
export class PersistRiskInstance implements IPersistRiskInstance {
  /** Fixed entity key for storing the positions array */
  private static readonly STORAGE_KEY = "positions";
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<RiskData>;

  /**
   * Creates new risk positions persistence instance.
   *
   * @param riskName - Risk profile identifier
   * @param exchangeName - Exchange identifier
   */
  constructor(
    readonly riskName: RiskName,
    readonly exchangeName: ExchangeName,
  ) {
    this._storage = new PersistBase(
      `${riskName}_${exchangeName}`,
      `./dump/data/risk/`
    );
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted positions array using the fixed STORAGE_KEY.
   *
   * @returns Promise resolving to positions (empty array if none persisted)
   */
  async readPositionData(): Promise<RiskData> {
    if (await this._storage.hasValue(PersistRiskInstance.STORAGE_KEY)) {
      return await this._storage.readValue(PersistRiskInstance.STORAGE_KEY);
    }
    return [];
  }

  /**
   * Writes the positions array using the fixed STORAGE_KEY.
   *
   * @param riskRow - Position entries to persist
   * @returns Promise that resolves when write is complete
   */
  async writePositionData(riskRow: RiskData): Promise<void> {
    await this._storage.writeValue(PersistRiskInstance.STORAGE_KEY, riskRow);
  }
}

/**
 * No-op IPersistRiskInstance implementation used by PersistRiskUtils.useDummy().
 * All reads return empty array, all writes are discarded.
 */
class PersistRiskDummyInstance implements IPersistRiskInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistRiskInstanceCtor.
   */
  constructor(_riskName: RiskName, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty positions array.
   * @returns Promise resolving to []
   */
  async readPositionData(): Promise<RiskData> { return []; }
  /**
   * No-op write (discards positions).
   * @returns Promise that resolves immediately
   */
  async writePositionData(_riskRow: RiskData): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistRiskInstance.
 * Used by PersistRiskUtils.usePersistRiskAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context risk instances.
   * Replaceable via usePersistRiskAdapter() / useJson() / useDummy().
   */
  private PersistRiskInstanceCtor: TPersistRiskInstanceCtor = PersistRiskInstance;

  /**
   * Memoized factory creating one IPersistRiskInstance per (riskName, exchange) pair.
   */
  private getRiskStorage = memoize(
    ([riskName, exchangeName]: [RiskName, ExchangeName]): string =>
      `${riskName}:${exchangeName}`,
    (riskName: RiskName, exchangeName: ExchangeName): IPersistRiskInstance =>
      Reflect.construct(this.PersistRiskInstanceCtor, [riskName, exchangeName])
  );

  /**
   * Registers a custom IPersistRiskInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistRiskInstance constructor
   */
  public usePersistRiskAdapter(Ctor: TPersistRiskInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_RISK_UTILS_METHOD_NAME_USE_PERSIST_RISK_ADAPTER);
    this.PersistRiskInstanceCtor = Ctor;
    this.getRiskStorage.clear();
  }

  /**
   * Reads persisted active positions for the given risk context.
   * Lazily initializes the instance on first access.
   *
   * @param riskName - Risk profile identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to position entries (empty array if none)
   */
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

  /**
   * Writes active positions for the given risk context.
   * Lazily initializes the instance on first access.
   *
   * @param riskRow - Position entries to persist
   * @param riskName - Risk profile identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_RISK_UTILS_METHOD_NAME_CLEAR);
    this.getRiskStorage.clear();
  }

  /**
   * Switches to the default file-based PersistRiskInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_RISK_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistRiskAdapter(PersistRiskInstance);
  }

  /**
   * Switches to PersistRiskDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context scheduled signal persistence instance interface.
 * Scoped to a specific (symbol, strategyName, exchangeName) triple.
 *
 * Custom adapters should implement this interface to override the default
 * file-based scheduled signal persistence behavior.
 */
export interface IPersistScheduleInstance {
  /**
   * Initialize storage for this scheduled signal context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted scheduled signal for this context.
   *
   * @returns Promise resolving to scheduled signal or null if none persisted
   */
  readScheduleData(): Promise<IScheduledSignalRow | null>;

  /**
   * Write scheduled signal for this context (null to clear).
   *
   * @param row - Scheduled signal data to persist, or null to clear
   * @returns Promise that resolves when write is complete
   */
  writeScheduleData(row: IScheduledSignalRow | null): Promise<void>;
}

/**
 * Default file-based implementation of IPersistScheduleInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses symbol as entity ID within a per-context PersistBase
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistScheduleInstance("BTCUSDT", "my-strategy", "binance");
 * await instance.waitForInit(true);
 * await instance.writeScheduleData(scheduledRow);
 * const restored = await instance.readScheduleData();
 * ```
 */
export class PersistScheduleInstance implements IPersistScheduleInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<ScheduleData>;

  /**
   * Creates new scheduled signal persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted scheduled signal using `symbol` as the entity key.
   *
   * @returns Promise resolving to scheduled signal or null if not found
   */
  async readScheduleData(): Promise<IScheduledSignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  /**
   * Writes the scheduled signal (or null to clear) using `symbol` as the entity key.
   *
   * @param row - Scheduled signal data to persist, or null to clear
   * @returns Promise that resolves when write is complete
   */
  async writeScheduleData(row: IScheduledSignalRow | null): Promise<void> {
    await this._storage.writeValue(this.symbol, row);
  }
}

/**
 * No-op IPersistScheduleInstance implementation used by PersistScheduleUtils.useDummy().
 * All reads return null, all writes are discarded.
 */
class PersistScheduleDummyInstance implements IPersistScheduleInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistScheduleInstanceCtor.
   */
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no persisted scheduled signal).
   * @returns Promise resolving to null
   */
  async readScheduleData(): Promise<IScheduledSignalRow | null> { return null; }
  /**
   * No-op write (discards scheduled signal).
   * @returns Promise that resolves immediately
   */
  async writeScheduleData(_row: IScheduledSignalRow | null): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistScheduleInstance.
 * Used by PersistScheduleUtils.usePersistScheduleAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context scheduled signal instances.
   * Replaceable via usePersistScheduleAdapter() / useJson() / useDummy().
   */
  private PersistScheduleInstanceCtor: TPersistScheduleInstanceCtor = PersistScheduleInstance;

  /**
   * Memoized factory creating one IPersistScheduleInstance per (symbol, strategy, exchange) triple.
   */
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

  /**
   * Registers a custom IPersistScheduleInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistScheduleInstance constructor
   */
  public usePersistScheduleAdapter(Ctor: TPersistScheduleInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_PERSIST_SCHEDULE_ADAPTER);
    this.PersistScheduleInstanceCtor = Ctor;
    this.getScheduleStorage.clear();
  }

  /**
   * Reads persisted scheduled signal for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to scheduled signal or null if none persisted
   */
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

  /**
   * Writes scheduled signal (or null to clear) for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param scheduledSignalRow - Scheduled signal data to persist, or null to clear
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
    LOGGER_SERVICE.info(PERSIST_SCHEDULE_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getScheduleStorage.has(key);
    const instance = this.getScheduleStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writeScheduleData(scheduledSignalRow);
  };

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_CLEAR);
    this.getScheduleStorage.clear();
  }

  /**
   * Switches to the default file-based PersistScheduleInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SCHEDULE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistScheduleAdapter(PersistScheduleInstance);
  }

  /**
   * Switches to PersistScheduleDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context partial profit/loss levels persistence instance interface.
 * Scoped to a specific (symbol, strategyName, exchangeName) triple.
 *
 * Each signal's partial data is stored under its own signalId key within
 * the context-scoped storage.
 *
 * Custom adapters should implement this interface to override the default
 * file-based partial data persistence behavior.
 */
export interface IPersistPartialInstance {
  /**
   * Initialize storage for this partial context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted partial data for a specific signal.
   *
   * @param signalId - Signal identifier
   * @returns Promise resolving to partial data record (empty object if none persisted)
   */
  readPartialData(signalId: string): Promise<PartialData>;

  /**
   * Write partial data for a specific signal.
   *
   * @param data - Partial data record to persist
   * @param signalId - Signal identifier
   * @returns Promise that resolves when write is complete
   */
  writePartialData(data: PartialData, signalId: string): Promise<void>;
}

/**
 * Default file-based implementation of IPersistPartialInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses signalId as entity ID within a per-context PersistBase
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistPartialInstance("BTCUSDT", "my-strategy", "binance");
 * await instance.waitForInit(true);
 * await instance.writePartialData(partialData, "signal-id-1");
 * const restored = await instance.readPartialData("signal-id-1");
 * ```
 */
export class PersistPartialInstance implements IPersistPartialInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<PartialData>;

  /**
   * Creates new partial data persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the partial data for the given signal using `signalId` as the entity key.
   *
   * @param signalId - Signal identifier
   * @returns Promise resolving to partial data record (empty object if not found)
   */
  async readPartialData(signalId: string): Promise<PartialData> {
    if (await this._storage.hasValue(signalId)) {
      return await this._storage.readValue(signalId);
    }
    return {};
  }

  /**
   * Writes the partial data for the given signal using `signalId` as the entity key.
   *
   * @param data - Partial data record to persist
   * @param signalId - Signal identifier
   * @returns Promise that resolves when write is complete
   */
  async writePartialData(data: PartialData, signalId: string): Promise<void> {
    await this._storage.writeValue(signalId, data);
  }
}

/**
 * No-op IPersistPartialInstance implementation used by PersistPartialUtils.useDummy().
 * All reads return empty object, all writes are discarded.
 */
class PersistPartialDummyInstance implements IPersistPartialInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistPartialInstanceCtor.
   */
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty partial data record.
   * @returns Promise resolving to {}
   */
  async readPartialData(_signalId: string): Promise<PartialData> { return {}; }
  /**
   * No-op write (discards partial data).
   * @returns Promise that resolves immediately
   */
  async writePartialData(_data: PartialData, _signalId: string): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistPartialInstance.
 * Used by PersistPartialUtils.usePersistPartialAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context partial data instances.
   * Replaceable via usePersistPartialAdapter() / useJson() / useDummy().
   */
  private PersistPartialInstanceCtor: TPersistPartialInstanceCtor = PersistPartialInstance;

  /**
   * Memoized factory creating one IPersistPartialInstance per (symbol, strategy, exchange) triple.
   * Each signal's partial data is stored under its own signalId within the instance.
   */
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

  /**
   * Registers a custom IPersistPartialInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistPartialInstance constructor
   */
  public usePersistPartialAdapter(Ctor: TPersistPartialInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_PERSIST_PARTIAL_ADAPTER);
    this.PersistPartialInstanceCtor = Ctor;
    this.getPartialStorage.clear();
  }

  /**
   * Reads partial data for the given context and signalId.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to partial data record (empty object if none)
   */
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

  /**
   * Writes partial data for the given context and signalId.
   * Lazily initializes the instance on first access.
   *
   * @param partialData - Partial data record to persist
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
    LOGGER_SERVICE.info(PERSIST_PARTIAL_UTILS_METHOD_NAME_WRITE_DATA);
    const key = `${symbol}:${strategyName}:${exchangeName}`;
    const isInitial = !this.getPartialStorage.has(key);
    const instance = this.getPartialStorage(symbol, strategyName, exchangeName);
    await instance.waitForInit(isInitial);
    return instance.writePartialData(partialData, signalId);
  };

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_CLEAR);
    this.getPartialStorage.clear();
  }

  /**
   * Switches to the default file-based PersistPartialInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_PARTIAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistPartialAdapter(PersistPartialInstance);
  }

  /**
   * Switches to PersistPartialDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context breakeven state persistence instance interface.
 * Scoped to a specific (symbol, strategyName, exchangeName) triple.
 *
 * Each signal's breakeven data is stored under its own signalId key within
 * the context-scoped storage.
 *
 * Custom adapters should implement this interface to override the default
 * file-based breakeven persistence behavior.
 */
export interface IPersistBreakevenInstance {
  /**
   * Initialize storage for this breakeven context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted breakeven data for a specific signal.
   *
   * @param signalId - Signal identifier
   * @returns Promise resolving to breakeven data record (empty object if none persisted)
   */
  readBreakevenData(signalId: string): Promise<BreakevenData>;

  /**
   * Write breakeven data for a specific signal.
   *
   * @param data - Breakeven data record to persist
   * @param signalId - Signal identifier
   * @returns Promise that resolves when write is complete
   */
  writeBreakevenData(data: BreakevenData, signalId: string): Promise<void>;
}

/**
 * Default file-based implementation of IPersistBreakevenInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses signalId as entity ID within a per-context PersistBase
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistBreakevenInstance("BTCUSDT", "my-strategy", "binance");
 * await instance.waitForInit(true);
 * await instance.writeBreakevenData(breakevenData, "signal-id-1");
 * const restored = await instance.readBreakevenData("signal-id-1");
 * ```
 */
export class PersistBreakevenInstance implements IPersistBreakevenInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<BreakevenData>;

  /**
   * Creates new breakeven persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the breakeven data for the given signal using `signalId` as the entity key.
   *
   * @param signalId - Signal identifier
   * @returns Promise resolving to breakeven data record (empty object if not found)
   */
  async readBreakevenData(signalId: string): Promise<BreakevenData> {
    if (await this._storage.hasValue(signalId)) {
      return await this._storage.readValue(signalId);
    }
    return {};
  }

  /**
   * Writes the breakeven data for the given signal using `signalId` as the entity key.
   *
   * @param data - Breakeven data record to persist
   * @param signalId - Signal identifier
   * @returns Promise that resolves when write is complete
   */
  async writeBreakevenData(data: BreakevenData, signalId: string): Promise<void> {
    await this._storage.writeValue(signalId, data);
  }
}

/**
 * No-op IPersistBreakevenInstance implementation used by PersistBreakevenUtils.useDummy().
 * All reads return empty object, all writes are discarded.
 */
class PersistBreakevenDummyInstance implements IPersistBreakevenInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistBreakevenInstanceCtor.
   */
  constructor(_symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty breakeven data record.
   * @returns Promise resolving to {}
   */
  async readBreakevenData(_signalId: string): Promise<BreakevenData> { return {}; }
  /**
   * No-op write (discards breakeven data).
   * @returns Promise that resolves immediately
   */
  async writeBreakevenData(_data: BreakevenData, _signalId: string): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistBreakevenInstance.
 * Used by PersistBreakevenUtils.usePersistBreakevenAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context breakeven instances.
   * Replaceable via usePersistBreakevenAdapter() / useJson() / useDummy().
   */
  private PersistBreakevenInstanceCtor: TPersistBreakevenInstanceCtor = PersistBreakevenInstance;

  /**
   * Memoized factory creating one IPersistBreakevenInstance per (symbol, strategy, exchange) triple.
   * Each signal's breakeven data is stored under its own signalId within the instance.
   */
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

  /**
   * Registers a custom IPersistBreakevenInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistBreakevenInstance constructor
   */
  public usePersistBreakevenAdapter(Ctor: TPersistBreakevenInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_PERSIST_BREAKEVEN_ADAPTER);
    this.PersistBreakevenInstanceCtor = Ctor;
    this.getBreakevenStorage.clear();
  }

  /**
   * Reads breakeven data for the given context and signalId.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise resolving to breakeven data record (empty object if none)
   */
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

  /**
   * Writes breakeven data for the given context and signalId.
   * Lazily initializes the instance on first access.
   *
   * @param breakevenData - Breakeven data record to persist
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param signalId - Signal identifier
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_CLEAR);
    this.getBreakevenStorage.clear();
  }

  /**
   * Switches to the default file-based PersistBreakevenInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_BREAKEVEN_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistBreakevenAdapter(PersistBreakevenInstance);
  }

  /**
   * Switches to PersistBreakevenDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context candle cache persistence instance interface.
 * Scoped to a specific (symbol, interval, exchangeName) triple.
 *
 * Each candle is keyed by its timestamp inside the context-scoped storage.
 * `readCandlesData` returns `null` when ANY of the expected timestamps is
 * missing (cache miss), so the caller can refetch from the exchange.
 *
 * Custom adapters should implement this interface to override the default
 * file-based candle cache behavior.
 */
export interface IPersistCandleInstance {
  /**
   * Initialize storage for this candle context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read cached candles for the requested time window.
   * Returns null if any candle in the window is missing (cache miss).
   *
   * @param limit - Number of candles requested
   * @param sinceTimestamp - Aligned start timestamp (openTime of first candle)
   * @param untilTimestamp - Reserved for API compatibility, not used by default
   * @returns Promise resolving to candles in order, or null on cache miss
   */
  readCandlesData(limit: number, sinceTimestamp: number, untilTimestamp: number): Promise<CandleData[] | null>;

  /**
   * Write candles to cache.
   * Implementations may skip incomplete candles (closeTime > now) and
   * existing keys to avoid overwriting fully closed candles.
   *
   * @param candles - Array of candle data to cache
   * @returns Promise that resolves when all writes are complete
   */
  writeCandlesData(candles: CandleData[]): Promise<void>;
}

/**
 * Default file-based implementation of IPersistCandleInstance.
 *
 * Features:
 * - Each candle stored as a separate JSON file keyed by its timestamp
 * - Read returns null on any missing timestamp (cache miss → refetch)
 * - Write skips incomplete candles (closeTime > now) and existing keys
 * - Invalid cached candles emit warnings via errorEmitter and treated as miss
 *
 * @example
 * ```typescript
 * const instance = new PersistCandleInstance("BTCUSDT", "1m", "binance");
 * await instance.waitForInit(true);
 * await instance.writeCandlesData(candles);
 * const cached = await instance.readCandlesData(100, since, until);
 * ```
 */
export class PersistCandleInstance implements IPersistCandleInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<CandleData>;

  /**
   * Creates new candle cache persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval (1m, 5m, 1h, etc.)
   * @param exchangeName - Exchange identifier
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads cached candles for the requested window.
   * Computes expected timestamps (sinceTimestamp + i * stepMs) and reads each
   * by timestamp key. Returns null on ANY missing timestamp (cache miss).
   * Invalid cached candles emit a warning via errorEmitter and are treated as miss.
   *
   * @param limit - Number of candles requested
   * @param sinceTimestamp - Aligned start timestamp (openTime of first candle)
   * @param _untilTimestamp - Reserved for API compatibility, unused
   * @returns Promise resolving to candles in order, or null on cache miss
   */
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

  /**
   * Writes candles to cache.
   * Skips incomplete candles (closeTime > now) and existing keys to keep
   * the cache append-only for fully closed candles.
   *
   * @param candles - Array of candle data to cache
   * @returns Promise that resolves when all writes are complete
   */
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

/**
 * No-op IPersistCandleInstance implementation used by PersistCandleUtils.useDummy().
 * Always returns null on read (forces refetch), discards writes.
 */
class PersistCandleDummyInstance implements IPersistCandleInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistCandleInstanceCtor.
   */
  constructor(_symbol: string, _interval: CandleInterval, _exchangeName: ExchangeName) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (forces refetch via cache miss).
   * @returns Promise resolving to null
   */
  async readCandlesData(_limit: number, _since: number, _until: number): Promise<CandleData[] | null> { return null; }
  /**
   * No-op write (discards candles).
   * @returns Promise that resolves immediately
   */
  async writeCandlesData(_candles: CandleData[]): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistCandleInstance.
 * Used by PersistCandleUtils.usePersistCandleAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context candle cache instances.
   * Replaceable via usePersistCandleAdapter() / useJson() / useDummy().
   */
  private PersistCandleInstanceCtor: TPersistCandleInstanceCtor = PersistCandleInstance;

  /**
   * Memoized factory creating one IPersistCandleInstance per (symbol, interval, exchange) triple.
   */
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

  /**
   * Registers a custom IPersistCandleInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistCandleInstance constructor
   */
  public usePersistCandleAdapter(Ctor: TPersistCandleInstanceCtor): void {
    LOGGER_SERVICE.info("PersistCandleUtils.usePersistCandleAdapter");
    this.PersistCandleInstanceCtor = Ctor;
    this.getCandlesStorage.clear();
  }

  /**
   * Reads cached candles for the given context and time window.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param exchangeName - Exchange identifier
   * @param limit - Number of candles requested
   * @param sinceTimestamp - Aligned start timestamp (openTime of first candle)
   * @param untilTimestamp - Reserved for API compatibility
   * @returns Promise resolving to candles in order, or null on cache miss
   */
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

  /**
   * Writes candles to cache for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param candles - Array of candle data to cache
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param exchangeName - Exchange identifier
   * @returns Promise that resolves when all writes are complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_CANDLE_UTILS_METHOD_NAME_CLEAR);
    this.getCandlesStorage.clear();
  }

  /**
   * Switches to the default file-based PersistCandleInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log("PersistCandleUtils.useJson");
    this.usePersistCandleAdapter(PersistCandleInstance);
  }

  /**
   * Switches to PersistCandleDummyInstance (always returns null on read, discards writes).
   */
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

/**
 * Per-context signal storage persistence instance interface.
 * Scoped to either backtest or live mode (one instance per mode).
 *
 * Each stored signal is keyed by its `signal.id` and the read operation
 * iterates over all stored entries to return them as an array.
 *
 * Custom adapters should implement this interface to override the default
 * file-based signal storage behavior.
 */
export interface IPersistStorageInstance {
  /**
   * Initialize storage for this mode.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read all persisted signals by iterating storage keys.
   *
   * @returns Promise resolving to array of signal entries
   */
  readStorageData(): Promise<StorageData>;

  /**
   * Write signals to storage. Each signal is keyed by its `signal.id`.
   *
   * @param signals - Signal entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  writeStorageData(signals: StorageData): Promise<void>;
}

/**
 * Default file-based implementation of IPersistStorageInstance.
 *
 * Features:
 * - Each signal stored as separate JSON file keyed by signal.id
 * - Read iterates all keys via PersistBase.keys()
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistStorageInstance(false);
 * await instance.waitForInit(true);
 * await instance.writeStorageData(signals);
 * const all = await instance.readStorageData();
 * ```
 */
export class PersistStorageInstance implements IPersistStorageInstance {
  /** Underlying file-based storage for this mode */
  private readonly _storage: IPersistBase<IStorageSignalRow>;

  /**
   * Creates new signal storage persistence instance.
   *
   * @param backtest - True for backtest mode storage, false for live mode
   */
  constructor(readonly backtest: boolean) {
    this._storage = new PersistBase(
      backtest ? `backtest` : `live`,
      `./dump/data/storage/`
    );
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads all persisted signals by iterating storage keys.
   *
   * @returns Promise resolving to array of signal entries
   */
  async readStorageData(): Promise<StorageData> {
    const signals: IStorageSignalRow[] = [];
    for await (const signalId of this._storage.keys()) {
      const signal = await this._storage.readValue(signalId);
      signals.push(signal);
    }
    return signals;
  }

  /**
   * Writes each signal as a separate entity keyed by `signal.id`.
   *
   * @param signals - Signal entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  async writeStorageData(signals: StorageData): Promise<void> {
    for (const signal of signals) {
      await this._storage.writeValue(signal.id, signal);
    }
  }
}

/**
 * No-op IPersistStorageInstance implementation used by PersistStorageUtils.useDummy().
 * All reads return empty array, all writes are discarded.
 */
class PersistStorageDummyInstance implements IPersistStorageInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistStorageInstanceCtor.
   */
  constructor(_backtest: boolean) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty signals array.
   * @returns Promise resolving to []
   */
  async readStorageData(): Promise<StorageData> { return []; }
  /**
   * No-op write (discards signals).
   * @returns Promise that resolves immediately
   */
  async writeStorageData(_signals: StorageData): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistStorageInstance.
 * Used by PersistStorageUtils.usePersistStorageAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-mode signal storage instances.
   * Replaceable via usePersistStorageAdapter() / useJson() / useDummy().
   */
  private PersistStorageInstanceCtor: TPersistStorageInstanceCtor = PersistStorageInstance;

  /**
   * Memoized factory creating one IPersistStorageInstance per mode (backtest/live).
   * Key: "backtest" or "live".
   */
  private getStorage = memoize(
    ([backtest]: [boolean]): string => backtest ? `backtest` : `live`,
    (backtest: boolean): IPersistStorageInstance =>
      Reflect.construct(this.PersistStorageInstanceCtor, [backtest])
  );

  /**
   * Registers a custom IPersistStorageInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistStorageInstance constructor
   */
  public usePersistStorageAdapter(Ctor: TPersistStorageInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_STORAGE_UTILS_METHOD_NAME_USE_PERSIST_STORAGE_ADAPTER);
    this.PersistStorageInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  /**
   * Reads all persisted signals for the given mode.
   * Lazily initializes the instance on first access.
   *
   * @param backtest - True for backtest mode storage, false for live mode
   * @returns Promise resolving to array of signal entries
   */
  public readStorageData = async (backtest: boolean): Promise<StorageData> => {
    LOGGER_SERVICE.info(PERSIST_STORAGE_UTILS_METHOD_NAME_READ_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getStorage.has(key);
    const instance = this.getStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.readStorageData();
  };

  /**
   * Writes signals for the given mode.
   * Lazily initializes the instance on first access.
   *
   * @param signalData - Signal entries to persist
   * @param backtest - True for backtest mode storage, false for live mode
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_STORAGE_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  /**
   * Switches to the default file-based PersistStorageInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_STORAGE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistStorageAdapter(PersistStorageInstance);
  }

  /**
   * Switches to PersistStorageDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context notification persistence instance interface.
 * Scoped to either backtest or live mode (one instance per mode).
 *
 * Each notification is keyed by its id and the read operation iterates over
 * all stored notifications.
 *
 * Custom adapters should implement this interface to override the default
 * file-based notification storage behavior.
 */
export interface IPersistNotificationInstance {
  /**
   * Initialize storage for this mode.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read all persisted notifications by iterating storage keys.
   *
   * @returns Promise resolving to array of notification entries
   */
  readNotificationData(): Promise<NotificationData>;

  /**
   * Write notifications to storage. Each notification is keyed by its id.
   *
   * @param notifications - Notification entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  writeNotificationData(notifications: NotificationData): Promise<void>;
}

/**
 * Default file-based implementation of IPersistNotificationInstance.
 *
 * Features:
 * - Each notification stored as separate JSON file keyed by id
 * - Read iterates all keys via PersistBase.keys()
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistNotificationInstance(false);
 * await instance.waitForInit(true);
 * await instance.writeNotificationData(notifications);
 * const all = await instance.readNotificationData();
 * ```
 */
export class PersistNotificationInstance implements IPersistNotificationInstance {
  /** Underlying file-based storage for this mode */
  private readonly _storage: IPersistBase<NotificationModel>;

  /**
   * Creates new notification persistence instance.
   *
   * @param backtest - True for backtest mode storage, false for live mode
   */
  constructor(readonly backtest: boolean) {
    this._storage = new PersistBase(
      backtest ? `backtest` : `live`,
      `./dump/data/notification/`
    );
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads all persisted notifications by iterating storage keys.
   *
   * @returns Promise resolving to array of notification entries
   */
  async readNotificationData(): Promise<NotificationData> {
    const notifications: NotificationModel[] = [];
    for await (const notificationId of this._storage.keys()) {
      const notification = await this._storage.readValue(notificationId);
      notifications.push(notification);
    }
    return notifications;
  }

  /**
   * Writes each notification as a separate entity keyed by `notification.id`.
   *
   * @param notifications - Notification entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  async writeNotificationData(notifications: NotificationData): Promise<void> {
    for (const notification of notifications) {
      await this._storage.writeValue(notification.id, notification);
    }
  }
}

/**
 * No-op IPersistNotificationInstance implementation used by PersistNotificationUtils.useDummy().
 * All reads return empty array, all writes are discarded.
 */
class PersistNotificationDummyInstance implements IPersistNotificationInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistNotificationInstanceCtor.
   */
  constructor(_backtest: boolean) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty notifications array.
   * @returns Promise resolving to []
   */
  async readNotificationData(): Promise<NotificationData> { return []; }
  /**
   * No-op write (discards notifications).
   * @returns Promise that resolves immediately
   */
  async writeNotificationData(_notifications: NotificationData): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistNotificationInstance.
 * Used by PersistNotificationUtils.usePersistNotificationAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-mode notification instances.
   * Replaceable via usePersistNotificationAdapter() / useJson() / useDummy().
   */
  private PersistNotificationInstanceCtor: TPersistNotificationInstanceCtor = PersistNotificationInstance;

  /**
   * Memoized factory creating one IPersistNotificationInstance per mode (backtest/live).
   * Key: "backtest" or "live".
   */
  private getNotificationStorage = memoize(
    ([backtest]: [boolean]): string => backtest ? `backtest` : `live`,
    (backtest: boolean): IPersistNotificationInstance =>
      Reflect.construct(this.PersistNotificationInstanceCtor, [backtest])
  );

  /**
   * Registers a custom IPersistNotificationInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistNotificationInstance constructor
   */
  public usePersistNotificationAdapter(Ctor: TPersistNotificationInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_PERSIST_NOTIFICATION_ADAPTER);
    this.PersistNotificationInstanceCtor = Ctor;
    this.getNotificationStorage.clear();
  }

  /**
   * Reads persisted notifications for the given mode.
   * Lazily initializes the instance on first access.
   *
   * @param backtest - True for backtest mode storage, false for live mode
   * @returns Promise resolving to array of notification entries
   */
  public readNotificationData = async (backtest: boolean): Promise<NotificationData> => {
    LOGGER_SERVICE.info(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_READ_DATA);
    const key = backtest ? `backtest` : `live`;
    const isInitial = !this.getNotificationStorage.has(key);
    const instance = this.getNotificationStorage(backtest);
    await instance.waitForInit(isInitial);
    return instance.readNotificationData();
  };

  /**
   * Writes notifications for the given mode.
   * Lazily initializes the instance on first access.
   *
   * @param notificationData - Notification entries to persist
   * @param backtest - True for backtest mode storage, false for live mode
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations so new
   * instances are created with the updated base path.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_CLEAR);
    this.getNotificationStorage.clear();
  }

  /**
   * Switches to the default file-based PersistNotificationInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_NOTIFICATION_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistNotificationAdapter(PersistNotificationInstance);
  }

  /**
   * Switches to PersistNotificationDummyInstance (all operations are no-ops).
   */
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

/**
 * Global log entry persistence instance interface.
 * Unlike other Persist instances, log storage has no context — there is
 * a single global instance per process.
 *
 * Each log entry is keyed by its id and the read operation iterates over
 * all stored entries.
 *
 * Custom adapters should implement this interface to override the default
 * file-based log storage behavior.
 */
export interface IPersistLogInstance {
  /**
   * Initialize the global log storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read all persisted log entries by iterating storage keys.
   *
   * @returns Promise resolving to array of log entries
   */
  readLogData(): Promise<LogData>;

  /**
   * Write log entries to storage. Each entry is keyed by its id.
   * Implementations should skip entries whose id already exists to keep
   * the log append-only.
   *
   * @param entries - Log entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  writeLogData(entries: LogData): Promise<void>;
}

/**
 * Default file-based implementation of IPersistLogInstance.
 *
 * Features:
 * - Each log entry stored as separate JSON file keyed by entry.id
 * - Read iterates all keys via PersistBase.keys()
 * - Append-only: existing keys are skipped on write
 * - Crash-safe via atomic writes
 *
 * @example
 * ```typescript
 * const instance = new PersistLogInstance();
 * await instance.waitForInit(true);
 * await instance.writeLogData(entries);
 * const all = await instance.readLogData();
 * ```
 */
export class PersistLogInstance implements IPersistLogInstance {
  /** Underlying file-based storage for log entries */
  private readonly _storage: IPersistBase<ILogEntry>;

  /**
   * Creates new log persistence instance.
   * No context parameters — there is a single global log storage.
   */
  constructor() {
    this._storage = new PersistBase(`log`, `./dump/data/log/`);
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads all persisted log entries by iterating storage keys.
   *
   * @returns Promise resolving to array of log entries
   */
  async readLogData(): Promise<LogData> {
    const entries: ILogEntry[] = [];
    for await (const entryId of this._storage.keys()) {
      const entry = await this._storage.readValue(entryId);
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Writes log entries append-only — skips entries whose id already exists
   * so the log file is never overwritten.
   *
   * @param logData - Log entries to persist
   * @returns Promise that resolves when all writes are complete
   */
  async writeLogData(logData: LogData): Promise<void> {
    for (const entry of logData) {
      if (await this._storage.hasValue(entry.id)) {
        continue;
      }
      await this._storage.writeValue(entry.id, entry);
    }
  }
}

/**
 * No-op IPersistLogInstance implementation used by PersistLogUtils.useDummy().
 * All reads return empty array, all writes are discarded.
 */
class PersistLogDummyInstance implements IPersistLogInstance {
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns empty log entries array.
   * @returns Promise resolving to []
   */
  async readLogData(): Promise<LogData> { return []; }
  /**
   * No-op write (discards log entries).
   * @returns Promise that resolves immediately
   */
  async writeLogData(_entries: LogData): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistLogInstance.
 * Used by PersistLogUtils.usePersistLogAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create the global log instance.
   * Replaceable via usePersistLogAdapter() / useJson() / useDummy().
   */
  private PersistLogInstanceCtor: TPersistLogInstanceCtor = PersistLogInstance;

  /**
   * Cached singleton log instance. Lazily created on first access.
   * Reset to null by clear() and usePersistLogAdapter().
   */
  private _logInstance: IPersistLogInstance | null = null;

  /**
   * Returns the cached log instance, creating it on first access.
   *
   * @returns The IPersistLogInstance singleton
   */
  private getLogInstance(): IPersistLogInstance {
    if (!this._logInstance) {
      this._logInstance = Reflect.construct(this.PersistLogInstanceCtor, []);
    }
    return this._logInstance!;
  }

  /**
   * Registers a custom IPersistLogInstance constructor.
   * Drops the cached instance so the next access uses the new adapter.
   *
   * @param Ctor - Custom IPersistLogInstance constructor
   */
  public usePersistLogAdapter(Ctor: TPersistLogInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_USE_PERSIST_LOG_ADAPTER);
    this.PersistLogInstanceCtor = Ctor;
    this._logInstance = null;
  }

  /**
   * Reads all persisted log entries.
   * Lazily initializes the instance on first access.
   *
   * @returns Promise resolving to array of log entries
   */
  public readLogData = async (): Promise<LogData> => {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_READ_DATA);
    const isInitial = !this._logInstance;
    const instance = this.getLogInstance();
    await instance.waitForInit(isInitial);
    return instance.readLogData();
  };

  /**
   * Writes log entries (append-only — duplicates by id are skipped).
   * Lazily initializes the instance on first access.
   *
   * @param logData - Log entries to persist
   * @returns Promise that resolves when write is complete
   */
  public writeLogData = async (logData: LogData): Promise<void> => {
    LOGGER_SERVICE.info(PERSIST_LOG_UTILS_METHOD_NAME_WRITE_DATA);
    const isInitial = !this._logInstance;
    const instance = this.getLogInstance();
    await instance.waitForInit(isInitial);
    return instance.writeLogData(logData);
  };

  /**
   * Drops the cached log instance.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_LOG_UTILS_METHOD_NAME_CLEAR);
    this._logInstance = null;
  }

  /**
   * Switches to the default file-based PersistLogInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_LOG_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistLogAdapter(PersistLogInstance);
  }

  /**
   * Switches to PersistLogDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-bucket measure cache persistence instance interface.
 * Used by Cache.file for caching external API responses.
 *
 * Supports soft delete: removed entries stay on disk with `removed: true`
 * flag and are filtered out by read/list operations.
 *
 * Custom adapters should implement this interface to override the default
 * file-based measure cache behavior.
 */
export interface IPersistMeasureInstance {
  /**
   * Initialize storage for this bucket.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read cached entry by key.
   *
   * @param key - Cache key within the bucket
   * @returns Promise resolving to cached value, or null if not found or soft-deleted
   */
  readMeasureData(key: string): Promise<MeasureData | null>;

  /**
   * Write entry to cache.
   *
   * @param data - Data to cache
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when write is complete
   */
  writeMeasureData(data: MeasureData, key: string): Promise<void>;

  /**
   * Soft-delete an entry by setting its `removed` flag.
   * File stays on disk, but subsequent reads return null.
   *
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when removal is complete
   */
  removeMeasureData(key: string): Promise<void>;

  /**
   * Iterate all non-removed entry keys for this bucket.
   *
   * @returns AsyncGenerator yielding entry keys
   */
  listMeasureData(): AsyncGenerator<string>;
}

/**
 * Default file-based implementation of IPersistMeasureInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Soft delete via `removed: true` flag
 * - listMeasureData filters out removed entries
 *
 * @example
 * ```typescript
 * const instance = new PersistMeasureInstance("my-bucket");
 * await instance.waitForInit(true);
 * await instance.writeMeasureData({ id: "x", data: {}, removed: false }, "key1");
 * const data = await instance.readMeasureData("key1");
 * await instance.removeMeasureData("key1");
 * ```
 */
export class PersistMeasureInstance implements IPersistMeasureInstance {
  /** Underlying file-based storage for this bucket */
  private readonly _storage: IPersistBase<MeasureData>;

  /**
   * Creates new measure cache persistence instance.
   *
   * @param bucket - Cache bucket identifier
   */
  constructor(readonly bucket: string) {
    this._storage = new PersistBase(bucket, `./dump/data/measure/`);
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads a measure entry by key. Returns null if entry is missing or soft-deleted.
   *
   * @param key - Cache key within the bucket
   * @returns Promise resolving to entry data, or null
   */
  async readMeasureData(key: string): Promise<MeasureData | null> {
    if (await this._storage.hasValue(key)) {
      const data = await this._storage.readValue(key);
      return data.removed ? null : data;
    }
    return null;
  }

  /**
   * Writes a measure entry under the given key.
   *
   * @param data - Data to cache
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when write is complete
   */
  async writeMeasureData(data: MeasureData, key: string): Promise<void> {
    await this._storage.writeValue(key, data);
  }

  /**
   * Soft-deletes an entry by writing `removed: true` flag while preserving the file.
   *
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when removal is complete
   */
  async removeMeasureData(key: string): Promise<void> {
    const data = await this._storage.readValue(key);
    if (data) {
      await this._storage.writeValue(key, Object.assign({}, data, { removed: true }));
    }
  }

  /**
   * Iterates all entries in the bucket, yielding keys of non-removed entries only.
   *
   * @returns AsyncGenerator yielding entry keys
   */
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

/**
 * No-op IPersistMeasureInstance implementation used by PersistMeasureUtils.useDummy().
 * All reads return null, all writes/removes are discarded, list yields nothing.
 */
class PersistMeasureDummyInstance implements IPersistMeasureInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistMeasureInstanceCtor.
   */
  constructor(_bucket: string) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no cached entries).
   * @returns Promise resolving to null
   */
  async readMeasureData(_key: string): Promise<MeasureData | null> { return null; }
  /**
   * No-op write (discards entry).
   * @returns Promise that resolves immediately
   */
  async writeMeasureData(_data: MeasureData, _key: string): Promise<void> { void 0; }
  /**
   * No-op remove.
   * @returns Promise that resolves immediately
   */
  async removeMeasureData(_key: string): Promise<void> { void 0; }
  /**
   * Empty generator — yields no entries.
   * @returns AsyncGenerator that immediately completes
   */
  async *listMeasureData(): AsyncGenerator<string> { /* empty */ }
}

/**
 * Constructor type for IPersistMeasureInstance.
 * Used by PersistMeasureUtils.usePersistMeasureAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-bucket measure cache instances.
   * Replaceable via usePersistMeasureAdapter() / useJson() / useDummy().
   */
  private PersistMeasureInstanceCtor: TPersistMeasureInstanceCtor = PersistMeasureInstance;

  /**
   * Memoized factory creating one IPersistMeasureInstance per bucket.
   */
  private getMeasureStorage = memoize(
    ([bucket]: [string]): string => bucket,
    (bucket: string): IPersistMeasureInstance =>
      Reflect.construct(this.PersistMeasureInstanceCtor, [bucket])
  );

  /**
   * Registers a custom IPersistMeasureInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistMeasureInstance constructor
   */
  public usePersistMeasureAdapter(Ctor: TPersistMeasureInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_USE_PERSIST_MEASURE_ADAPTER);
    this.PersistMeasureInstanceCtor = Ctor;
    this.getMeasureStorage.clear();
  }

  /**
   * Reads a measure entry from the given bucket by key.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @param key - Cache key within the bucket
   * @returns Promise resolving to cached value, or null if not found / soft-deleted
   */
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

  /**
   * Writes a measure entry to the given bucket under the given key.
   * Lazily initializes the bucket instance on first access.
   *
   * @param data - Data to cache
   * @param bucket - Storage bucket identifier
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Soft-deletes a measure entry in the given bucket by setting `removed: true`.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @param key - Cache key within the bucket
   * @returns Promise that resolves when removal is complete
   */
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

  /**
   * Iterates all non-removed measure entries for the given bucket.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @returns AsyncGenerator yielding entry keys
   */
  public async *listMeasureData(bucket: string): AsyncGenerator<string> {
    LOGGER_SERVICE.info(PERSIST_MEASURE_UTILS_METHOD_NAME_LIST_DATA, { bucket });
    const isInitial = !this.getMeasureStorage.has(bucket);
    const instance = this.getMeasureStorage(bucket);
    await instance.waitForInit(isInitial);
    yield* instance.listMeasureData();
  }

  /**
   * Clears the memoized bucket instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_MEASURE_UTILS_METHOD_NAME_CLEAR);
    this.getMeasureStorage.clear();
  }

  /**
   * Switches to the default file-based PersistMeasureInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_MEASURE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistMeasureAdapter(PersistMeasureInstance);
  }

  /**
   * Switches to PersistMeasureDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-bucket interval marker persistence instance interface.
 * Used by Interval.file for once-per-interval signal firing.
 *
 * A record's presence means the interval has already fired for that
 * bucket+key. Soft-deleted records (removed=true) act as if absent,
 * allowing the function to fire again.
 *
 * Custom adapters should implement this interface to override the default
 * file-based interval marker behavior.
 */
export interface IPersistIntervalInstance {
  /**
   * Initialize storage for this bucket.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read interval marker by key.
   *
   * @param key - Marker key within the bucket
   * @returns Promise resolving to stored value, or null if not found or soft-deleted
   */
  readIntervalData(key: string): Promise<IntervalData | null>;

  /**
   * Write interval marker.
   *
   * @param data - Data to store
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when write is complete
   */
  writeIntervalData(data: IntervalData, key: string): Promise<void>;

  /**
   * Soft-delete a marker. After this call the function will fire again
   * on the next IntervalFileInstance.run call for the same key.
   *
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when removal is complete
   */
  removeIntervalData(key: string): Promise<void>;

  /**
   * Iterate all non-removed marker keys for this bucket.
   *
   * @returns AsyncGenerator yielding marker keys
   */
  listIntervalData(): AsyncGenerator<string>;
}

/**
 * Default file-based implementation of IPersistIntervalInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Soft delete via `removed: true` flag
 * - listIntervalData filters out removed markers
 *
 * @example
 * ```typescript
 * const instance = new PersistIntervalInstance("my-interval-bucket");
 * await instance.waitForInit(true);
 * await instance.writeIntervalData({ id: "x", data: {}, removed: false }, "key1");
 * const marker = await instance.readIntervalData("key1");
 * await instance.removeIntervalData("key1");
 * ```
 */
export class PersistIntervalInstance implements IPersistIntervalInstance {
  /** Underlying file-based storage for this bucket */
  private readonly _storage: IPersistBase<IntervalData>;

  /**
   * Creates new interval marker persistence instance.
   *
   * @param bucket - Marker bucket identifier
   */
  constructor(readonly bucket: string) {
    this._storage = new PersistBase(bucket, `./dump/data/interval/`);
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads an interval marker by key. Returns null if marker is missing or soft-deleted.
   *
   * @param key - Marker key within the bucket
   * @returns Promise resolving to stored data, or null
   */
  async readIntervalData(key: string): Promise<IntervalData | null> {
    if (await this._storage.hasValue(key)) {
      const data = await this._storage.readValue(key);
      return data.removed ? null : data;
    }
    return null;
  }

  /**
   * Writes an interval marker under the given key.
   *
   * @param data - Data to store
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when write is complete
   */
  async writeIntervalData(data: IntervalData, key: string): Promise<void> {
    await this._storage.writeValue(key, data);
  }

  /**
   * Soft-deletes a marker by writing `removed: true` flag while preserving the file.
   * Subsequent reads will return null, allowing the interval to fire again.
   *
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when removal is complete
   */
  async removeIntervalData(key: string): Promise<void> {
    const data = await this._storage.readValue(key);
    if (data) {
      await this._storage.writeValue(key, Object.assign({}, data, { removed: true }));
    }
  }

  /**
   * Iterates all markers in the bucket, yielding keys of non-removed markers only.
   *
   * @returns AsyncGenerator yielding marker keys
   */
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

/**
 * No-op IPersistIntervalInstance implementation used by PersistIntervalUtils.useDummy().
 * All reads return null, all writes/removes are discarded, list yields nothing.
 */
class PersistIntervalDummyInstance implements IPersistIntervalInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistIntervalInstanceCtor.
   */
  constructor(_bucket: string) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no interval markers).
   * @returns Promise resolving to null
   */
  async readIntervalData(_key: string): Promise<IntervalData | null> { return null; }
  /**
   * No-op write (discards marker).
   * @returns Promise that resolves immediately
   */
  async writeIntervalData(_data: IntervalData, _key: string): Promise<void> { void 0; }
  /**
   * No-op remove.
   * @returns Promise that resolves immediately
   */
  async removeIntervalData(_key: string): Promise<void> { void 0; }
  /**
   * Empty generator — yields no markers.
   * @returns AsyncGenerator that immediately completes
   */
  async *listIntervalData(): AsyncGenerator<string> { /* empty */ }
}

/**
 * Constructor type for IPersistIntervalInstance.
 * Used by PersistIntervalUtils.usePersistIntervalAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-bucket interval marker instances.
   * Replaceable via usePersistIntervalAdapter() / useJson() / useDummy().
   */
  private PersistIntervalInstanceCtor: TPersistIntervalInstanceCtor = PersistIntervalInstance;

  /**
   * Memoized factory creating one IPersistIntervalInstance per bucket.
   */
  private getIntervalStorage = memoize(
    ([bucket]: [string]): string => bucket,
    (bucket: string): IPersistIntervalInstance =>
      Reflect.construct(this.PersistIntervalInstanceCtor, [bucket])
  );

  /**
   * Registers a custom IPersistIntervalInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistIntervalInstance constructor
   */
  public usePersistIntervalAdapter(Ctor: TPersistIntervalInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_PERSIST_INTERVAL_ADAPTER);
    this.PersistIntervalInstanceCtor = Ctor;
    this.getIntervalStorage.clear();
  }

  /**
   * Reads an interval marker from the given bucket by key.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @param key - Marker key within the bucket
   * @returns Promise resolving to marker data, or null if not found / soft-deleted
   */
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

  /**
   * Writes an interval marker to the given bucket under the given key.
   * Lazily initializes the bucket instance on first access.
   *
   * @param data - Data to store
   * @param bucket - Storage bucket identifier
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Soft-deletes a marker in the given bucket by setting `removed: true`.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @param key - Marker key within the bucket
   * @returns Promise that resolves when removal is complete
   */
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

  /**
   * Iterates all non-removed markers for the given bucket.
   * Lazily initializes the bucket instance on first access.
   *
   * @param bucket - Storage bucket identifier
   * @returns AsyncGenerator yielding marker keys
   */
  public async *listIntervalData(bucket: string): AsyncGenerator<string> {
    LOGGER_SERVICE.info(PERSIST_INTERVAL_UTILS_METHOD_NAME_LIST_DATA, { bucket });
    const isInitial = !this.getIntervalStorage.has(bucket);
    const instance = this.getIntervalStorage(bucket);
    await instance.waitForInit(isInitial);
    yield* instance.listIntervalData();
  }

  /**
   * Clears the memoized bucket instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_INTERVAL_UTILS_METHOD_NAME_CLEAR);
    this.getIntervalStorage.clear();
  }

  /**
   * Switches to the default file-based PersistIntervalInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_INTERVAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistIntervalAdapter(PersistIntervalInstance);
  }

  /**
   * Switches to PersistIntervalDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context memory entry persistence instance interface.
 * Scoped to a specific (signalId, bucketName) pair.
 *
 * Used by MemoryPersistInstance for LLM memory storage. Supports soft delete
 * via `removed: true` flag — soft-deleted entries stay on disk but are
 * filtered out by read/list operations.
 *
 * Custom adapters should implement this interface to override the default
 * file-based memory entry behavior.
 */
export interface IPersistMemoryInstance {
  /**
   * Initialize storage for this memory context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read a memory entry by id.
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to entry data, or null if not found or soft-deleted
   */
  readMemoryData(memoryId: string): Promise<MemoryData | null>;

  /**
   * Check whether a memory entry exists (regardless of removed flag).
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to true if entry exists on disk
   */
  hasMemoryData(memoryId: string): Promise<boolean>;

  /**
   * Write a memory entry.
   *
   * @param data - Entry data to persist
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when write is complete
   */
  writeMemoryData(data: MemoryData, memoryId: string): Promise<void>;

  /**
   * Soft-delete a memory entry. File stays on disk; subsequent reads return null.
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when removal is complete
   */
  removeMemoryData(memoryId: string): Promise<void>;

  /**
   * Iterate all non-removed memory entries for this context.
   * Used by MemoryPersistInstance to rebuild the BM25 index on init.
   *
   * @returns AsyncGenerator yielding entry id + data tuples
   */
  listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }>;

  /**
   * Release any resources held by this instance.
   * Default implementations may treat this as a no-op.
   */
  dispose(): void;
}

/**
 * Default file-based implementation of IPersistMemoryInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Soft delete via `removed: true` flag
 * - listMemoryData filters out removed entries
 * - dispose is a no-op (memo cache is managed by PersistMemoryUtils)
 *
 * @example
 * ```typescript
 * const instance = new PersistMemoryInstance("signal-1", "context-bucket");
 * await instance.waitForInit(true);
 * await instance.writeMemoryData(entryData, "memory-id-1");
 * const data = await instance.readMemoryData("memory-id-1");
 * ```
 */
export class PersistMemoryInstance implements IPersistMemoryInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<MemoryData>;

  /**
   * Creates new memory persistence instance.
   *
   * @param signalId - Signal identifier (entity folder name)
   * @param bucketName - Bucket name (subfolder under memory/)
   */
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {
    this._storage = new PersistBase(bucketName, `./dump/memory/${signalId}/`);
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads a memory entry by id. Returns null if entry is missing or soft-deleted.
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to entry data, or null
   */
  async readMemoryData(memoryId: string): Promise<MemoryData | null> {
    if (await this._storage.hasValue(memoryId)) {
      const data = await this._storage.readValue(memoryId);
      return data.removed ? null : data;
    }
    return null;
  }

  /**
   * Checks whether a memory entry exists on disk (regardless of removed flag).
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to true if entry file exists
   */
  async hasMemoryData(memoryId: string): Promise<boolean> {
    return await this._storage.hasValue(memoryId);
  }

  /**
   * Writes a memory entry under the given id.
   *
   * @param data - Entry data to persist
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when write is complete
   */
  async writeMemoryData(data: MemoryData, memoryId: string): Promise<void> {
    await this._storage.writeValue(memoryId, data);
  }

  /**
   * Soft-deletes a memory entry by writing `removed: true` flag.
   *
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when removal is complete
   */
  async removeMemoryData(memoryId: string): Promise<void> {
    const data = await this._storage.readValue(memoryId);
    if (data) {
      await this._storage.writeValue(memoryId, Object.assign({}, data, { removed: true }));
    }
  }

  /**
   * Iterates all memory entries in the bucket, yielding id + data tuples
   * for non-removed entries only.
   *
   * @returns AsyncGenerator yielding `{ memoryId, data }` tuples
   */
  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> {
    for await (const memoryId of this._storage.keys()) {
      const data = await this._storage.readValue(String(memoryId));
      if (data === null || data.removed) {
        continue;
      }
      yield { memoryId: String(memoryId), data };
    }
  }

  /**
   * No-op for the default file-based implementation.
   * Resource cleanup (memo cache invalidation) is handled by PersistMemoryUtils.dispose().
   */
  dispose(): void { void 0; }
}

/**
 * No-op IPersistMemoryInstance implementation used by PersistMemoryUtils.useDummy().
 * All reads return null/false, all writes/removes are discarded, list yields nothing.
 */
class PersistMemoryDummyInstance implements IPersistMemoryInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistMemoryInstanceCtor.
   */
  constructor(_signalId: string, _bucketName: string) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no memory entries).
   * @returns Promise resolving to null
   */
  async readMemoryData(_memoryId: string): Promise<MemoryData | null> { return null; }
  /**
   * Always returns false (no memory entries exist).
   * @returns Promise resolving to false
   */
  async hasMemoryData(_memoryId: string): Promise<boolean> { return false; }
  /**
   * No-op write (discards entry).
   * @returns Promise that resolves immediately
   */
  async writeMemoryData(_data: MemoryData, _memoryId: string): Promise<void> { void 0; }
  /**
   * No-op remove.
   * @returns Promise that resolves immediately
   */
  async removeMemoryData(_memoryId: string): Promise<void> { void 0; }
  /**
   * Empty generator — yields no entries.
   * @returns AsyncGenerator that immediately completes
   */
  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> { /* empty */ }
  /**
   * No-op dispose.
   */
  dispose(): void { void 0; }
}

/**
 * Constructor type for IPersistMemoryInstance.
 * Used by PersistMemoryUtils.usePersistMemoryAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context memory instances.
   * Replaceable via usePersistMemoryAdapter() / useJson() / useDummy().
   */
  private PersistMemoryInstanceCtor: TPersistMemoryInstanceCtor = PersistMemoryInstance;

  /**
   * Memoized factory creating one IPersistMemoryInstance per (signalId, bucketName) pair.
   */
  private getMemoryStorage = memoize(
    ([signalId, bucketName]: [string, string]): string =>
      `${signalId}:${bucketName}`,
    (signalId: string, bucketName: string): IPersistMemoryInstance =>
      Reflect.construct(this.PersistMemoryInstanceCtor, [signalId, bucketName])
  );

  /**
   * Registers a custom IPersistMemoryInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistMemoryInstance constructor
   */
  public usePersistMemoryAdapter(Ctor: TPersistMemoryInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_USE_PERSIST_MEMORY_ADAPTER);
    this.PersistMemoryInstanceCtor = Ctor;
    this.getMemoryStorage.clear();
  }

  /**
   * Initializes the memory storage for the given context.
   * Skips initialization when `initial` is false (used to gate first-time setup).
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
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

  /**
   * Reads a memory entry for the given context and id.
   * Lazily initializes the instance on first access.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to entry data, or null if not found / soft-deleted
   */
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

  /**
   * Checks whether a memory entry exists on disk for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param memoryId - Memory entry identifier
   * @returns Promise resolving to true if entry exists
   */
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

  /**
   * Writes a memory entry for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param data - Entry data to persist
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Soft-deletes a memory entry for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param memoryId - Memory entry identifier
   * @returns Promise that resolves when removal is complete
   */
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

  /**
   * Iterates all non-removed memory entries for the given context.
   * Used by MemoryPersistInstance to rebuild the BM25 index on init.
   * Lazily initializes the instance on first access.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @returns AsyncGenerator yielding `{ memoryId, data }` tuples
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_CLEAR);
    this.getMemoryStorage.clear();
  }

  /**
   * Drops the memoized instance for the given context.
   * Call when a signal is removed to clean up its associated storage entry.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   */
  public dispose = (signalId: string, bucketName: string) => {
    LOGGER_SERVICE.info(PERSIST_MEMORY_UTILS_METHOD_NAME_DISPOSE);
    const key = `${signalId}:${bucketName}`;
    this.getMemoryStorage.clear(key);
  }

  /**
   * Switches to the default file-based PersistMemoryInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_SIGNAL_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistMemoryAdapter(PersistMemoryInstance);
  }

  /**
   * Switches to PersistMemoryDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context recent signal persistence instance interface.
 * Scoped to a specific (symbol, strategyName, exchangeName, frameName, backtest) tuple.
 *
 * Stores the latest active signal for the given context, allowing live/backtest
 * separation. Custom adapters should implement this interface to override the
 * default file-based recent signal behavior.
 */
export interface IPersistRecentInstance {
  /**
   * Initialize storage for this recent signal context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read the latest persisted recent signal for this context.
   *
   * @returns Promise resolving to recent signal or null if none persisted
   */
  readRecentData(): Promise<IPublicSignalRow | null>;

  /**
   * Write the latest recent signal for this context.
   *
   * @param signalRow - Recent signal data to persist
   * @returns Promise that resolves when write is complete
   */
  writeRecentData(signalRow: IPublicSignalRow): Promise<void>;
}

/**
 * Default file-based implementation of IPersistRecentInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses symbol as entity ID within a per-context PersistBase
 * - Context key includes backtest/live mode and optional frameName
 *
 * @example
 * ```typescript
 * const instance = new PersistRecentInstance("BTCUSDT", "my-strategy", "binance", "frame-1", false);
 * await instance.waitForInit(true);
 * await instance.writeRecentData(publicSignalRow);
 * const recent = await instance.readRecentData();
 * ```
 */
export class PersistRecentInstance implements IPersistRecentInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<IPublicSignalRow>;

  /**
   * Creates new recent signal persistence instance.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier (may be empty for live mode)
   * @param backtest - True for backtest mode, false for live mode
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted recent signal using `symbol` as the entity key.
   *
   * @returns Promise resolving to recent signal or null if not found
   */
  async readRecentData(): Promise<IPublicSignalRow | null> {
    if (await this._storage.hasValue(this.symbol)) {
      return await this._storage.readValue(this.symbol);
    }
    return null;
  }

  /**
   * Writes the recent signal using `symbol` as the entity key.
   *
   * @param signalRow - Recent signal data to persist
   * @returns Promise that resolves when write is complete
   */
  async writeRecentData(signalRow: IPublicSignalRow): Promise<void> {
    await this._storage.writeValue(this.symbol, signalRow);
  }
}

/**
 * No-op IPersistRecentInstance implementation used by PersistRecentUtils.useDummy().
 * All reads return null, all writes are discarded.
 */
class PersistRecentDummyInstance implements IPersistRecentInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistRecentInstanceCtor.
   */
  constructor(
    _symbol: string, _strategyName: StrategyName, _exchangeName: ExchangeName,
    _frameName: FrameName, _backtest: boolean,
  ) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no recent signal).
   * @returns Promise resolving to null
   */
  async readRecentData(): Promise<IPublicSignalRow | null> { return null; }
  /**
   * No-op write (discards recent signal).
   * @returns Promise that resolves immediately
   */
  async writeRecentData(_signalRow: IPublicSignalRow): Promise<void> { void 0; }
}

/**
 * Constructor type for IPersistRecentInstance.
 * Used by PersistRecentUtils.usePersistRecentAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context recent signal instances.
   * Replaceable via usePersistRecentAdapter() / useJson() / useDummy().
   */
  private PersistRecentInstanceCtor: TPersistRecentInstanceCtor = PersistRecentInstance;

  /**
   * Builds the composite memoization key for a recent signal context.
   * Includes optional frameName and the backtest/live mode flag.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier (omitted from key if empty)
   * @param backtest - True for backtest mode, false for live mode
   * @returns Composite key string
   */
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

  /**
   * Memoized factory creating one IPersistRecentInstance per context tuple.
   */
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

  /**
   * Registers a custom IPersistRecentInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistRecentInstance constructor
   */
  public usePersistRecentAdapter(Ctor: TPersistRecentInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_RECENT_UTILS_METHOD_NAME_USE_PERSIST_RECENT_ADAPTER);
    this.PersistRecentInstanceCtor = Ctor;
    this.getStorage.clear();
  }

  /**
   * Reads the latest recent signal for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier (may be empty)
   * @param backtest - True for backtest mode, false for live mode
   * @returns Promise resolving to recent signal or null if none persisted
   */
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

  /**
   * Writes the latest recent signal for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param signalRow - Recent signal data to persist
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier (may be empty)
   * @param backtest - True for backtest mode, false for live mode
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear(): void {
    LOGGER_SERVICE.log(PERSIST_RECENT_UTILS_METHOD_NAME_CLEAR);
    this.getStorage.clear();
  }

  /**
   * Switches to the default file-based PersistRecentInstance.
   */
  public useJson() {
    LOGGER_SERVICE.log(PERSIST_RECENT_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistRecentAdapter(PersistRecentInstance);
  }

  /**
   * Switches to PersistRecentDummyInstance (all operations are no-ops).
   */
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

/**
 * Per-context state persistence instance interface.
 * Scoped to a specific (signalId, bucketName) pair.
 *
 * Used by StatePersistInstance for crash-safe strategy state storage.
 * Custom adapters should implement this interface to override the default
 * file-based state behavior.
 */
export interface IPersistStateInstance {
  /**
   * Initialize storage for this state context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted state for this context.
   *
   * @returns Promise resolving to state data or null if none persisted
   */
  readStateData(): Promise<StateData | null>;

  /**
   * Write state for this context.
   *
   * @param data - State data to persist
   * @returns Promise that resolves when write is complete
   */
  writeStateData(data: StateData): Promise<void>;

  /**
   * Release any resources held by this instance.
   * Default implementations may treat this as a no-op.
   */
  dispose(): void;
}

/**
 * Default file-based implementation of IPersistStateInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses bucketName as entity ID within a per-signal PersistBase
 * - dispose is a no-op (memo cache is managed by PersistStateUtils)
 *
 * @example
 * ```typescript
 * const instance = new PersistStateInstance("signal-1", "counter");
 * await instance.waitForInit(true);
 * await instance.writeStateData({ id: "counter", data: { count: 1 } });
 * const state = await instance.readStateData();
 * ```
 */
export class PersistStateInstance implements IPersistStateInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<StateData>;

  /**
   * Creates new state persistence instance.
   *
   * @param signalId - Signal identifier (folder name under state/)
   * @param bucketName - Bucket name (file name)
   */
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {
    this._storage = new PersistBase(bucketName, `./dump/state/${signalId}/`);
  }

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted state using `bucketName` as the entity key.
   *
   * @returns Promise resolving to state data or null if not found
   */
  async readStateData(): Promise<StateData | null> {
    if (await this._storage.hasValue(this.bucketName)) {
      return await this._storage.readValue(this.bucketName);
    }
    return null;
  }

  /**
   * Writes the state using `bucketName` as the entity key.
   *
   * @param data - State data to persist
   * @returns Promise that resolves when write is complete
   */
  async writeStateData(data: StateData): Promise<void> {
    await this._storage.writeValue(this.bucketName, data);
  }

  /**
   * No-op for the default file-based implementation.
   * Resource cleanup (memo cache invalidation) is handled by PersistStateUtils.dispose().
   */
  dispose(): void { void 0; }
}

/**
 * No-op IPersistStateInstance implementation used by PersistStateUtils.useDummy().
 * All reads return null, all writes are discarded.
 */
class PersistStateDummyInstance implements IPersistStateInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistStateInstanceCtor.
   */
  constructor(_signalId: string, _bucketName: string) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no persisted state).
   * @returns Promise resolving to null
   */
  async readStateData(): Promise<StateData | null> { return null; }
  /**
   * No-op write (discards state).
   * @returns Promise that resolves immediately
   */
  async writeStateData(_data: StateData): Promise<void> { void 0; }
  /**
   * No-op dispose.
   */
  dispose(): void { void 0; }
}

/**
 * Constructor type for IPersistStateInstance.
 * Used by PersistStateUtils.usePersistStateAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context state instances.
   * Replaceable via usePersistStateAdapter() / useJson() / useDummy().
   */
  private PersistStateInstanceCtor: TPersistStateInstanceCtor = PersistStateInstance;

  /**
   * Memoized factory creating one IPersistStateInstance per (signalId, bucketName) pair.
   */
  private getStateStorage = memoize(
    ([signalId, bucketName]: [string, string]): string =>
      `${signalId}:${bucketName}`,
    (signalId: string, bucketName: string): IPersistStateInstance =>
      Reflect.construct(this.PersistStateInstanceCtor, [signalId, bucketName])
  );

  /**
   * Registers a custom IPersistStateInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistStateInstance constructor
   */
  public usePersistStateAdapter(Ctor: TPersistStateInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_USE_PERSIST_STATE_ADAPTER);
    this.PersistStateInstanceCtor = Ctor;
    this.getStateStorage.clear();
  }

  /**
   * Initializes the state storage for the given context.
   * Skips initialization when `initial` is false (used to gate first-time setup).
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
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

  /**
   * Reads persisted state for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @returns Promise resolving to state data or null if none persisted
   */
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

  /**
   * Writes state for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param data - State data to persist
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Switches to PersistStateDummyInstance (all operations are no-ops).
   */
  public useDummy = () => {
    LOGGER_SERVICE.log(PERSIST_STATE_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistStateAdapter(PersistStateDummyInstance);
  }

  /**
   * Switches to the default file-based PersistStateInstance.
   */
  public useJson = () => {
    LOGGER_SERVICE.log(PERSIST_STATE_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistStateAdapter(PersistStateInstance);
  }

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_STATE_UTILS_METHOD_NAME_CLEAR);
    this.getStateStorage.clear();
  };

  /**
   * Drops the memoized instance for the given context.
   * Call when a signal is removed to clean up its associated storage entry.
   *
   * @param signalId - Signal identifier
   * @param bucketName - Bucket name
   */
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

/**
 * Per-context session persistence instance interface.
 * Scoped to a specific (strategyName, exchangeName, frameName) triple.
 *
 * Used by SessionPersistInstance for crash-safe session storage.
 * Custom adapters should implement this interface to override the default
 * file-based session behavior.
 */
export interface IPersistSessionInstance {
  /**
   * Initialize storage for this session context.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read persisted session data for this context.
   *
   * @returns Promise resolving to session data or null if none persisted
   */
  readSessionData(): Promise<SessionData | null>;

  /**
   * Write session data for this context.
   *
   * @param data - Session data to persist
   * @returns Promise that resolves when write is complete
   */
  writeSessionData(data: SessionData): Promise<void>;

  /**
   * Release any resources held by this instance.
   * Default implementations may treat this as a no-op.
   */
  dispose(): void;
}

/**
 * Default file-based implementation of IPersistSessionInstance.
 *
 * Features:
 * - Wraps PersistBase for atomic JSON writes
 * - Uses frameName as entity ID within a per-strategy/exchange PersistBase
 * - dispose is a no-op (memo cache is managed by PersistSessionUtils)
 *
 * @example
 * ```typescript
 * const instance = new PersistSessionInstance("my-strategy", "binance", "frame-1");
 * await instance.waitForInit(true);
 * await instance.writeSessionData({ id: "frame-1", data: { session: "state" } });
 * const session = await instance.readSessionData();
 * ```
 */
export class PersistSessionInstance implements IPersistSessionInstance {
  /** Underlying file-based storage scoped to this context */
  private readonly _storage: IPersistBase<SessionData>;

  /**
   * Creates new session persistence instance.
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier (also used as entity ID)
   */
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

  /**
   * Initializes the underlying PersistBase storage.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    await this._storage.waitForInit(initial);
  }

  /**
   * Reads the persisted session data using `frameName` as the entity key.
   *
   * @returns Promise resolving to session data or null if not found
   */
  async readSessionData(): Promise<SessionData | null> {
    if (await this._storage.hasValue(this.frameName)) {
      return await this._storage.readValue(this.frameName);
    }
    return null;
  }

  /**
   * Writes the session data using `frameName` as the entity key.
   *
   * @param data - Session data to persist
   * @returns Promise that resolves when write is complete
   */
  async writeSessionData(data: SessionData): Promise<void> {
    await this._storage.writeValue(this.frameName, data);
  }

  /**
   * No-op for the default file-based implementation.
   * Resource cleanup (memo cache invalidation) is handled by PersistSessionUtils.dispose().
   */
  dispose(): void { void 0; }
}

/**
 * No-op IPersistSessionInstance implementation used by PersistSessionUtils.useDummy().
 * All reads return null, all writes are discarded.
 */
class PersistSessionDummyInstance implements IPersistSessionInstance {
  /**
   * No-op constructor.
   * Context arguments are accepted to satisfy TPersistSessionInstanceCtor.
   */
  constructor(_strategyName: string, _exchangeName: string, _frameName: string) {}
  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  async waitForInit(_initial: boolean): Promise<void> { void 0; }
  /**
   * Always returns null (no persisted session).
   * @returns Promise resolving to null
   */
  async readSessionData(): Promise<SessionData | null> { return null; }
  /**
   * No-op write (discards session data).
   * @returns Promise that resolves immediately
   */
  async writeSessionData(_data: SessionData): Promise<void> { void 0; }
  /**
   * No-op dispose.
   */
  dispose(): void { void 0; }
}

/**
 * Constructor type for IPersistSessionInstance.
 * Used by PersistSessionUtils.usePersistSessionAdapter() to register custom adapters.
 */
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
  /**
   * Constructor used to create per-context session instances.
   * Replaceable via usePersistSessionAdapter() / useJson() / useDummy().
   */
  private PersistSessionInstanceCtor: TPersistSessionInstanceCtor = PersistSessionInstance;

  /**
   * Memoized factory creating one IPersistSessionInstance per
   * (strategyName, exchangeName, frameName) triple.
   */
  private getSessionStorage = memoize(
    ([strategyName, exchangeName, frameName]: [string, string, string]): string =>
      `${strategyName}:${exchangeName}:${frameName}`,
    (strategyName: string, exchangeName: string, frameName: string): IPersistSessionInstance =>
      Reflect.construct(this.PersistSessionInstanceCtor, [strategyName, exchangeName, frameName])
  );

  /**
   * Registers a custom IPersistSessionInstance constructor.
   * Clears the memoization cache so subsequent calls use the new adapter.
   *
   * @param Ctor - Custom IPersistSessionInstance constructor
   */
  public usePersistSessionAdapter(Ctor: TPersistSessionInstanceCtor): void {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_USE_PERSIST_SESSION_ADAPTER);
    this.PersistSessionInstanceCtor = Ctor;
    this.getSessionStorage.clear();
  }

  /**
   * Initializes the session storage for the given context.
   * Skips initialization when `initial` is false (used to gate first-time setup).
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
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

  /**
   * Reads persisted session data for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier
   * @returns Promise resolving to session data or null if none persisted
   */
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

  /**
   * Writes session data for the given context.
   * Lazily initializes the instance on first access.
   *
   * @param data - Session data to persist
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier
   * @returns Promise that resolves when write is complete
   */
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

  /**
   * Switches to PersistSessionDummyInstance (all operations are no-ops).
   */
  public useDummy = () => {
    LOGGER_SERVICE.log(PERSIST_SESSION_UTILS_METHOD_NAME_USE_DUMMY);
    this.usePersistSessionAdapter(PersistSessionDummyInstance);
  };

  /**
   * Switches to the default file-based PersistSessionInstance.
   */
  public useJson = () => {
    LOGGER_SERVICE.log(PERSIST_SESSION_UTILS_METHOD_NAME_USE_JSON);
    this.usePersistSessionAdapter(PersistSessionInstance);
  }

  /**
   * Clears the memoized instance cache.
   * Call when process.cwd() changes between strategy iterations.
   */
  public clear = () => {
    LOGGER_SERVICE.info(PERSIST_SESSION_UTILS_METHOD_NAME_CLEAR);
    this.getSessionStorage.clear();
  };

  /**
   * Drops the memoized instance for the given context.
   * Call when a session is removed to clean up its associated storage entry.
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier
   * @param frameName - Frame identifier
   */
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
