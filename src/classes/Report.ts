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
import BacktestReportService from "../lib/services/report/BacktestReportService";
import BreakevenReportService from "../lib/services/report/BreakevenReportService";
import HeatReportService from "../lib/services/report/HeatReportService";
import LiveReportService from "../lib/services/report/LiveReportService";
import PartialReportService from "../lib/services/report/PartialReportService";
import PerformanceReportService from "../lib/services/report/PerformanceReportService";
import RiskReportService from "../lib/services/report/RiskReportService";
import StrategyReportService from "../lib/services/report/StrategyReportService";
import ScheduleReportService from "../lib/services/report/ScheduleReportService";
import WalkerReportService from "../lib/services/report/WalkerReportService";
import SyncReportService from "../lib/services/report/SyncReportService";
import HighestProfitReportService from "../lib/services/report/HighestProfitReportService";
import MaxDrawdownReportService from "../lib/services/report/MaxDrawdownReportService";
import { IReportTarget, ReportWriter, TReportBaseCtor } from "./Writer";
import backtest from "src/lib";

const REPORT_UTILS_METHOD_NAME_USE_REPORT_ADAPTER =
  "ReportUtils.useReportAdapter";
const REPORT_UTILS_METHOD_NAME_ENABLE = "ReportUtils.enable";
const REPORT_UTILS_METHOD_NAME_DISABLE = "ReportUtils.disable";
const REPORT_UTILS_METHOD_NAME_USE_DUMMY = "ReportUtils.useDummy";
const REPORT_UTILS_METHOD_NAME_USE_JSONL = "ReportUtils.useJsonl";
const REPORT_UTILS_METHOD_NAME_CLEAR = "ReportUtils.clear";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

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
      unList.push(backtest.backtestReportService.subscribe());
    }
    if (breakeven) {
      unList.push(backtest.breakevenReportService.subscribe());
    }
    if (heat) {
      unList.push(backtest.heatReportService.subscribe());
    }
    if (live) {
      unList.push(backtest.liveReportService.subscribe());
    }
    if (partial) {
      unList.push(backtest.partialReportService.subscribe());
    }
    if (performance) {
      unList.push(backtest.performanceReportService.subscribe());
    }
    if (risk) {
      unList.push(backtest.riskReportService.subscribe());
    }
    if (schedule) {
      unList.push(backtest.scheduleReportService.subscribe());
    }
    if (walker) {
      unList.push(backtest.walkerReportService.subscribe());
    }
    if (strategy) {
      unList.push(backtest.strategyReportService.subscribe());
    }
    if (sync) {
      unList.push(backtest.syncReportService.subscribe());
    }
    if (highest_profit) {
      unList.push(backtest.highestProfitReportService.subscribe());
    }
    if (max_drawdown) {
      unList.push(backtest.maxDrawdownReportService.subscribe());
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
      backtest.backtestReportService.unsubscribe();
    }
    if (breakeven) {
      backtest.breakevenReportService.unsubscribe();
    }
    if (heat) {
      backtest.heatReportService.unsubscribe();
    }
    if (live) {
      backtest.liveReportService.unsubscribe();
    }
    if (partial) {
      backtest.partialReportService.unsubscribe();
    }
    if (performance) {
      backtest.performanceReportService.unsubscribe();
    }
    if (risk) {
      backtest.riskReportService.unsubscribe();
    }
    if (schedule) {
      backtest.scheduleReportService.unsubscribe();
    }
    if (walker) {
      backtest.walkerReportService.unsubscribe();
    }
    if (strategy) {
      backtest.strategyReportService.unsubscribe();
    }
    if (sync) {
      backtest.syncReportService.unsubscribe();
    }
    if (highest_profit) {
      backtest.highestProfitReportService.unsubscribe();
    }
    if (max_drawdown) {
      backtest.maxDrawdownReportService.unsubscribe();
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

