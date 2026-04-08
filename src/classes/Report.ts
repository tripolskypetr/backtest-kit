import * as fs from "fs/promises";
import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import {
  compose,
  getErrorMessage,
  makeExtendable,
  memoize,
  singleshot,
  timeout,
  TIMEOUT_SYMBOL,
} from "functools-kit";
import { exitEmitter, shutdownEmitter } from "../config/emitters";
import { getContextTimestamp } from "../helpers/getContextTimestamp";
import LoggerService from "../lib/services/base/LoggerService";
import BacktestReportService from "src/lib/services/report/BacktestReportService";
import BreakevenReportService from "src/lib/services/report/BreakevenReportService";
import HeatReportService from "src/lib/services/report/HeatReportService";
import LiveReportService from "src/lib/services/report/LiveReportService";
import PartialReportService from "src/lib/services/report/PartialReportService";
import PerformanceReportService from "src/lib/services/report/PerformanceReportService";
import RiskReportService from "src/lib/services/report/RiskReportService";
import StrategyReportService from "src/lib/services/report/StrategyReportService";
import ScheduleReportService from "src/lib/services/report/ScheduleReportService";
import WalkerReportService from "src/lib/services/report/WalkerReportService";
import SyncReportService from "src/lib/services/report/SyncReportService";
import HighestProfitReportService from "src/lib/services/report/HighestProfitReportService";
import MaxDrawdownReportService from "src/lib/services/report/MaxDrawdownReportService";
import { IReportTarget, ReportWriter, TReportBaseCtor } from "./Writer";

const REPORT_UTILS_METHOD_NAME_USE_REPORT_ADAPTER =
  "ReportUtils.useReportAdapter";
const REPORT_UTILS_METHOD_NAME_ENABLE = "ReportUtils.enable";
const REPORT_UTILS_METHOD_NAME_DISABLE = "ReportUtils.disable";
const REPORT_UTILS_METHOD_NAME_USE_DUMMY = "ReportUtils.useDummy";
const REPORT_UTILS_METHOD_NAME_USE_JSONL = "ReportUtils.useJsonl";
const REPORT_UTILS_METHOD_NAME_CLEAR = "ReportUtils.clear";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/** Backtest report service injected as DI singleton */
const BACKTEST_REPORT_SERVICE = new BacktestReportService();
/** Breakeven report service injected as DI singleton */
const BREAKEVEN_REPORT_SERVICE = new BreakevenReportService();
/** Heat report service injected as DI singleton */
const HEAT_REPORT_SERVICE = new HeatReportService();
/** Live report service injected as DI singleton */
const LIVE_REPORT_SERVICE = new LiveReportService();
/** Partial report service injected as DI singleton */
const PARTIAL_REPORT_SERVICE = new PartialReportService();
/** Performance report service injected as DI singleton */
const PERFORMANCE_REPORT_SERVICE = new PerformanceReportService();
/** Risk report service injected as DI singleton */
const RISK_REPORT_SERVICE = new RiskReportService();
/** Strategy report service injected as DI singleton */
const STRATEGY_REPORT_SERVICE = new StrategyReportService();
/** Schedule report service injected as DI singleton */
const SCHEDULE_REPORT_SERVICE = new ScheduleReportService();
/** Walker report service injected as DI singleton */
const WALKER_REPORT_SERVICE = new WalkerReportService();
/** Sync report service injected as DI singleton */
const SYNC_REPORT_SERVICE = new SyncReportService();
/** Highest profit report service injected as DI singleton */
const HIGHEST_PROFIT_REPORT_SERVICE = new HighestProfitReportService();
/** Max drawdown report service injected as DI singleton */
const MAX_DRAWDOWN_REPORT_SERVICE = new MaxDrawdownReportService();

/**
 * Default configuration that enables all report services.
 * Used when no specific configuration is provided to enable().
 */
const WILDCARD_TARGET: IReportTarget = {
  backtest: true,
  strategy: true,
  breakeven: true,
  heat: true,
  live: true,
  partial: true,
  performance: true,
  risk: true,
  schedule: true,
  walker: true,
  sync: true,
  highest_profit: true,
  max_drawdown: true,
};

/**
 * Utility class for managing report services.
 *
 * Provides methods to enable/disable JSONL event logging across
 * different service types (backtest, live, walker, performance, etc.).
 *
 * Typically extended by ReportAdapter for additional functionality.
 */
export class ReportUtils {
  /**
   * Enables report services selectively.
   *
   * Subscribes to specified report services and returns a cleanup function
   * that unsubscribes from all enabled services at once.
   *
   * Each enabled service will:
   * - Start listening to relevant events
   * - Write events to JSONL files in real-time
   * - Include metadata for filtering and analytics
   *
   * IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.
   *
   * @param config - Service configuration object. Defaults to enabling all services.
   * @param config.backtest - Enable backtest closed signal logging
   * @param config.breakeven - Enable breakeven event logging
   * @param config.partial - Enable partial close event logging
   * @param config.heat - Enable heatmap data logging
   * @param config.walker - Enable walker iteration logging
   * @param config.performance - Enable performance metrics logging
   * @param config.risk - Enable risk rejection logging
   * @param config.schedule - Enable scheduled signal logging
   * @param config.live - Enable live trading event logging
   *
   * @returns Cleanup function that unsubscribes from all enabled services
   */
  public enable = ({
    backtest: bt = false,
    breakeven = false,
    heat = false,
    live = false,
    partial = false,
    performance = false,
    risk = false,
    schedule = false,
    walker = false,
    strategy = false,
    sync = false,
    highest_profit = false,
    max_drawdown = false,
  }: Partial<IReportTarget> = WILDCARD_TARGET) => {
    LOGGER_SERVICE.debug(REPORT_UTILS_METHOD_NAME_ENABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      schedule,
      walker,
      strategy,
      sync,
    });
    const unList: Function[] = [];
    if (bt) {
      unList.push(BACKTEST_REPORT_SERVICE.subscribe());
    }
    if (breakeven) {
      unList.push(BREAKEVEN_REPORT_SERVICE.subscribe());
    }
    if (heat) {
      unList.push(HEAT_REPORT_SERVICE.subscribe());
    }
    if (live) {
      unList.push(LIVE_REPORT_SERVICE.subscribe());
    }
    if (partial) {
      unList.push(PARTIAL_REPORT_SERVICE.subscribe());
    }
    if (performance) {
      unList.push(PERFORMANCE_REPORT_SERVICE.subscribe());
    }
    if (risk) {
      unList.push(RISK_REPORT_SERVICE.subscribe());
    }
    if (schedule) {
      unList.push(SCHEDULE_REPORT_SERVICE.subscribe());
    }
    if (walker) {
      unList.push(WALKER_REPORT_SERVICE.subscribe());
    }
    if (strategy) {
      unList.push(STRATEGY_REPORT_SERVICE.subscribe());
    }
    if (sync) {
      unList.push(SYNC_REPORT_SERVICE.subscribe());
    }
    if (highest_profit) {
      unList.push(HIGHEST_PROFIT_REPORT_SERVICE.subscribe());
    }
    if (max_drawdown) {
      unList.push(MAX_DRAWDOWN_REPORT_SERVICE.subscribe());
    }
    return compose(...unList.map((un) => () => void un()));
  };

  /**
   * Disables report services selectively.
   *
   * Unsubscribes from specified report services to stop event logging.
   * Use this method to stop JSONL logging for specific services while keeping others active.
   *
   * Each disabled service will:
   * - Stop listening to events immediately
   * - Stop writing to JSONL files
   * - Free up event listener resources
   *
   * Unlike enable(), this method does NOT return an unsubscribe function.
   * Services are unsubscribed immediately upon calling this method.
   *
   * @param config - Service configuration object specifying which services to disable. Defaults to disabling all services.
   * @param config.backtest - Disable backtest closed signal logging
   * @param config.breakeven - Disable breakeven event logging
   * @param config.partial - Disable partial close event logging
   * @param config.heat - Disable heatmap data logging
   * @param config.walker - Disable walker iteration logging
   * @param config.performance - Disable performance metrics logging
   * @param config.risk - Disable risk rejection logging
   * @param config.schedule - Disable scheduled signal logging
   * @param config.live - Disable live trading event logging
   *
   * @example
   * ```typescript
   * import { Report } from "backtest-kit";
   *
   * // Disable specific services
   * Report.disable({ backtest: true, live: true });
   *
   * // Disable all services
   * Report.disable();
   * ```
   */
  public disable = ({
    backtest: bt = false,
    breakeven = false,
    heat = false,
    live = false,
    partial = false,
    performance = false,
    risk = false,
    schedule = false,
    walker = false,
    strategy = false,
    sync = false,
    highest_profit = false,
    max_drawdown = false,
  }: Partial<IReportTarget> = WILDCARD_TARGET) => {
    LOGGER_SERVICE.debug(REPORT_UTILS_METHOD_NAME_DISABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      schedule,
      walker,
      strategy,
      sync,
    });
    if (bt) {
      BACKTEST_REPORT_SERVICE.unsubscribe();
    }
    if (breakeven) {
      BREAKEVEN_REPORT_SERVICE.unsubscribe();
    }
    if (heat) {
      HEAT_REPORT_SERVICE.unsubscribe();
    }
    if (live) {
      LIVE_REPORT_SERVICE.unsubscribe();
    }
    if (partial) {
      PARTIAL_REPORT_SERVICE.unsubscribe();
    }
    if (performance) {
      PERFORMANCE_REPORT_SERVICE.unsubscribe();
    }
    if (risk) {
      RISK_REPORT_SERVICE.unsubscribe();
    }
    if (schedule) {
      SCHEDULE_REPORT_SERVICE.unsubscribe();
    }
    if (walker) {
      WALKER_REPORT_SERVICE.unsubscribe();
    }
    if (strategy) {
      STRATEGY_REPORT_SERVICE.unsubscribe();
    }
    if (sync) {
      SYNC_REPORT_SERVICE.unsubscribe();
    }
    if (highest_profit) {
      HIGHEST_PROFIT_REPORT_SERVICE.unsubscribe();
    }
    if (max_drawdown) {
      MAX_DRAWDOWN_REPORT_SERVICE.unsubscribe();
    }
  };
}

/**
 * Report adapter with pluggable storage backend and instance memoization.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Memoized storage instances (one per report type)
 * - Default adapter: ReportBase (JSONL append)
 * - Lazy initialization on first write
 * - Real-time event logging to JSONL files
 *
 * Used for structured event logging and analytics pipelines.
 */
export class ReportAdapter extends ReportUtils {
  /**
   * Sets the report storage adapter constructor.
   * All future report instances will use this adapter.
   *
   * @param Ctor - Constructor for report storage adapter
   */
  public useReportAdapter(Ctor: TReportBaseCtor): void {
    LOGGER_SERVICE.info(REPORT_UTILS_METHOD_NAME_USE_REPORT_ADAPTER);
    ReportWriter.useReportAdapter(Ctor);
  }

  /**
   * Clears the memoized storage cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new storage instances are created with the updated base path.
   */
  public clear(): void {
    LOGGER_SERVICE.log(REPORT_UTILS_METHOD_NAME_CLEAR);
    ReportWriter.clear();
  }

  /**
   * Switches to a dummy report adapter that discards all writes.
   * All future report writes will be no-ops.
   */
  public useDummy() {
    LOGGER_SERVICE.log(REPORT_UTILS_METHOD_NAME_USE_DUMMY);
    ReportWriter.useDummy();
  }

  /**
   * Switches to the default JSONL report adapter.
   * All future report writes will use JSONL storage.
   */
  public useJsonl() {
    LOGGER_SERVICE.log(REPORT_UTILS_METHOD_NAME_USE_JSONL);
    ReportWriter.useJsonl();
  }
}

/**
 * Global singleton instance of ReportAdapter.
 * Provides JSONL event logging with pluggable storage backends.
 */
export const Report = new ReportAdapter();

