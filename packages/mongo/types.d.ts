import * as functools_kit from 'functools-kit';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';

declare const GLOBAL_CONFIG: {
    CC_REDIS_HOST: string;
    CC_REDIS_PORT: number;
    CC_REDIS_USER: string;
    CC_REDIS_PASSWORD: string;
    CC_MONGO_CONNECTION_STRING: string;
};
type Config = typeof GLOBAL_CONFIG;
declare const getConfig: () => {
    CC_REDIS_HOST: string;
    CC_REDIS_PORT: number;
    CC_REDIS_USER: string;
    CC_REDIS_PASSWORD: string;
    CC_MONGO_CONNECTION_STRING: string;
};
declare const setConfig: (config: Partial<Config>) => void;

interface ILogger {
    log(topic: string, ...args: any[]): void;
    debug(topic: string, ...args: any[]): void;
    info(topic: string, ...args: any[]): void;
    warn(topic: string, ...args: any[]): void;
}

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
declare function setup(config?: Partial<Config>): void;
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
declare function install(): void;
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
declare function setLogger(logger: ILogger): void;

declare const getMongo: (() => Promise<typeof mongoose>) & functools_kit.ISingleshotClearable<() => Promise<typeof mongoose>>;

declare const getRedis: (() => Redis) & functools_kit.ISingleshotClearable<() => Redis>;

export { getConfig, getMongo, getRedis, install, setConfig, setLogger, setup };
