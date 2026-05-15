import { Config, DEFAULT_CONFIG, GLOBAL_CONFIG } from "../config/params";

import {
  PersistCandleAdapter,
  PersistSignalAdapter,
  PersistRiskAdapter,
  PersistScheduleAdapter,
  PersistPartialAdapter,
  PersistBreakevenAdapter,
  PersistStorageAdapter,
  PersistNotificationAdapter,
  PersistLogAdapter,
  PersistMeasureAdapter,
  PersistIntervalAdapter,
  PersistMemoryAdapter,
  PersistRecentAdapter,
  PersistStateAdapter,
  PersistSessionAdapter,
} from "backtest-kit";

import PersistCandleInstance from "../classes/PersistCandleInstance";
import PersistSignalInstance from "../classes/PersistSignalInstance";
import PersistRiskInstance from "../classes/PersistRiskInstance";
import PersistScheduleInstance from "../classes/PersistScheduleInstance";
import PersistPartialInstance from "../classes/PersistPartialInstance";
import PersistBreakevenInstance from "../classes/PersistBreakevenInstance";
import PersistStorageInstance from "../classes/PersistStorageInstance";
import PersistNotificationInstance from "../classes/PersistNotificationInstance";
import PersistLogInstance from "../classes/PersistLogInstance";
import PersistMeasureInstance from "../classes/PersistMeasureInstance";
import PersistIntervalInstance from "../classes/PersistIntervalInstance";
import PersistMemoryInstance from "../classes/PersistMemoryInstance";
import PersistRecentInstance from "../classes/PersistRecentInstance";
import PersistStateInstance from "../classes/PersistStateInstance";
import PersistSessionInstance from "../classes/PersistSessionInstance";

import { ILogger } from "../interfaces/Logger.interface";

import ioc from "../lib";

/**
 * Initializes the `@backtest-kit/mongo` package: applies user-provided configuration
 * and registers all MongoDB/Redis persistence adapters into the global `backtest-kit` registries.
 *
 * Should be called **once** at application startup — before any trading data operations.
 * Internally calls {@link setConfig} followed by {@link install}.
 *
 * @param config - Connection parameters. If omitted, {@link DEFAULT_CONFIG} is used,
 *   which reads values from environment variables:
 *   - `CC_MONGO_CONNECTION_STRING` — MongoDB connection string (default: `mongodb://localhost:27017/backtest-kit`)
 *   - `CC_REDIS_HOST` — Redis host (default: `127.0.0.1`)
 *   - `CC_REDIS_PORT` — Redis port (default: `6379`)
 *   - `CC_REDIS_USER` — Redis username (default: empty string)
 *   - `CC_REDIS_PASSWORD` — Redis password (default: empty string)
 *
 * @example
 * // Minimal — everything is read from env variables
 * setup();
 *
 * @example
 * // Explicit configuration
 * setup({
 *   CC_MONGO_CONNECTION_STRING: "mongodb://mongo:27017/mydb",
 *   CC_REDIS_HOST: "redis",
 *   CC_REDIS_PORT: 6379,
 *   CC_REDIS_USER: "",
 *   CC_REDIS_PASSWORD: "secret",
 * });
 */
export function setup(config: Partial<Config> = DEFAULT_CONFIG) {
    Object.assign(GLOBAL_CONFIG, config);
    install();
}

/**
 * Registers MongoDB implementations of all `backtest-kit` persistence adapters
 * without modifying the global connection configuration.
 *
 * Use directly when the configuration has already been applied via {@link setConfig}
 * or is provided through environment variables and does not need to be overridden.
 * In the typical scenario, calling {@link setup} is sufficient — it calls `install` internally.
 *
 * Registered adapters:
 * - **Candle** — OHLCV candle data (`PersistCandleAdapter`)
 * - **Signal** — strategy signals (`PersistSignalAdapter`)
 * - **Risk** — risk manager positions (`PersistRiskAdapter`)
 * - **Schedule** — deferred signals (`PersistScheduleAdapter`)
 * - **Partial** — partial close data (`PersistPartialAdapter`)
 * - **Breakeven** — breakeven data (`PersistBreakevenAdapter`)
 * - **Storage** — general signal storage (`PersistStorageAdapter`)
 * - **Notification** — notifications (`PersistNotificationAdapter`)
 * - **Log** — log entries (`PersistLogAdapter`)
 * - **Measure** — arbitrary metrics keyed by bucket/key (`PersistMeasureAdapter`)
 * - **Interval** — interval task data (`PersistIntervalAdapter`)
 * - **Memory** — long-term signal memory (`PersistMemoryAdapter`)
 * - **Recent** — latest strategy frame result (`PersistRecentAdapter`)
 * - **State** — signal state (`PersistStateAdapter`)
 * - **Session** — strategy session data (`PersistSessionAdapter`)
 *
 * @example
 * // Configuration is provided via env variables, adapters are installed manually
 * install();
 */
export function install() {
    PersistCandleAdapter.usePersistCandleAdapter(PersistCandleInstance);
    PersistSignalAdapter.usePersistSignalAdapter(PersistSignalInstance);
    PersistRiskAdapter.usePersistRiskAdapter(PersistRiskInstance);
    PersistScheduleAdapter.usePersistScheduleAdapter(PersistScheduleInstance);
    PersistPartialAdapter.usePersistPartialAdapter(PersistPartialInstance);
    PersistBreakevenAdapter.usePersistBreakevenAdapter(PersistBreakevenInstance);
    PersistStorageAdapter.usePersistStorageAdapter(PersistStorageInstance);
    PersistNotificationAdapter.usePersistNotificationAdapter(PersistNotificationInstance);
    PersistLogAdapter.usePersistLogAdapter(PersistLogInstance);
    PersistMeasureAdapter.usePersistMeasureAdapter(PersistMeasureInstance);
    PersistIntervalAdapter.usePersistIntervalAdapter(PersistIntervalInstance);
    PersistMemoryAdapter.usePersistMemoryAdapter(PersistMemoryInstance);
    PersistRecentAdapter.usePersistRecentAdapter(PersistRecentInstance);
    PersistStateAdapter.usePersistStateAdapter(PersistStateInstance);
    PersistSessionAdapter.usePersistSessionAdapter(PersistSessionInstance);
}

/**
 * Attaches a custom logger to the internal `LoggerService`.
 *
 * By default the package logs to `console`. Pass your own {@link ILogger} implementation
 * to redirect output to an external logging system (Winston, Pino, Datadog, etc.).
 *
 * @param logger - Object with `log`, `debug`, `info`, and `warn` methods.
 *   Each method receives a string topic followed by arbitrary arguments.
 *
 * @example
 * import winston from "winston";
 *
 * setLogger({
 *   log:   (topic, ...args) => winston.verbose(topic, ...args),
 *   debug: (topic, ...args) => winston.debug(topic, ...args),
 *   info:  (topic, ...args) => winston.info(topic, ...args),
 *   warn:  (topic, ...args) => winston.warn(topic, ...args),
 * });
 */
export function setLogger(logger: ILogger) {
    ioc.loggerService.setLogger(logger);
}

/**
 * Updates the global connection configuration without registering adapters.
 *
 * Useful when only the connection parameters need to change (e.g. in tests)
 * without re-registering adapters. Changes take effect on the next connection attempt
 * to MongoDB or Redis (lazy initialization via `waitForInfra`).
 *
 * @param config - New connection parameters. Merged into the current {@link GLOBAL_CONFIG}
 *   via `Object.assign`, so only the fields that need to change can be passed.
 *   If omitted, resets the configuration to values from environment variables ({@link DEFAULT_CONFIG}).
 *
 * @example
 * // Switch MongoDB to a test database
 * setConfig({ CC_MONGO_CONNECTION_STRING: "mongodb://localhost:27017/test" });
 */
export function setConfig(config: Partial<Config> = DEFAULT_CONFIG) {
    Object.assign(GLOBAL_CONFIG, config);
}
