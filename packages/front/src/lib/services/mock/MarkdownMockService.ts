import fs from "fs/promises";
import path from "path";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

const MOCK_DIR = "./mock/markdown";

const makeReader = (fileName: string) =>
  singleshot(() => fs.readFile(path.join(MOCK_DIR, fileName), "utf-8"));

const makeDataReader = <T>(fileName: string) =>
  singleshot(async () => JSON.parse(await fs.readFile(path.join(MOCK_DIR, "data", fileName), "utf-8")) as T);

const readBacktest = makeReader("backtest.md");
const readLive = makeReader("live.md");
const readBreakeven = makeReader("breakeven.md");
const readRisk = makeReader("risk.md");
const readPartial = makeReader("partial.md");
const readHighestProfit = makeReader("highest_profit.md");
const readSchedule = makeReader("schedule.md");
const readPerformance = makeReader("performance.md");
const readSync = makeReader("sync.md");
const readHeat = makeReader("heat.md");
const readWalker = makeReader("walker.md");

const readBacktestData = makeDataReader("backtest.json");
const readLiveData = makeDataReader("live.json");
const readBreakevenData = makeDataReader("breakeven.json");
const readRiskData = makeDataReader("risk.json");
const readPartialData = makeDataReader("partial.json");
const readHighestProfitData = makeDataReader("highest_profit.json");
const readScheduleData = makeDataReader("schedule.json");
const readPerformanceData = makeDataReader("performance.json");
const readSyncData = makeDataReader("sync.json");
const readHeatData = makeDataReader("heat.json");
const readWalkerData = makeDataReader("walker.json");

export class MarkdownMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  // Backtest

  public getBacktestData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getBacktestData", { symbol, strategyName, exchangeName, frameName });
    return readBacktestData();
  };

  public getBacktestReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getBacktestReport", { symbol, strategyName, exchangeName, frameName });
    return readBacktest();
  };

  // Live

  public getLiveData = async (symbol: string, strategyName: string, exchangeName: string) => {
    this.loggerService.log("markdownMockService getLiveData", { symbol, strategyName, exchangeName });
    return readLiveData();
  };

  public getLiveReport = async (symbol: string, strategyName: string, exchangeName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getLiveReport", { symbol, strategyName, exchangeName });
    return readLive();
  };

  // Breakeven

  public getBreakevenData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getBreakevenData", { symbol, strategyName, exchangeName, frameName });
    return readBreakevenData();
  };

  public getBreakevenReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getBreakevenReport", { symbol, strategyName, exchangeName, frameName });
    return readBreakeven();
  };

  // Risk

  public getRiskData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getRiskData", { symbol, strategyName, exchangeName, frameName });
    return readRiskData();
  };

  public getRiskReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getRiskReport", { symbol, strategyName, exchangeName, frameName });
    return readRisk();
  };

  // Partial

  public getPartialData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getPartialData", { symbol, strategyName, exchangeName, frameName });
    return readPartialData();
  };

  public getPartialReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getPartialReport", { symbol, strategyName, exchangeName, frameName });
    return readPartial();
  };

  // HighestProfit

  public getHighestProfitData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getHighestProfitData", { symbol, strategyName, exchangeName, frameName });
    return readHighestProfitData();
  };

  public getHighestProfitReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getHighestProfitReport", { symbol, strategyName, exchangeName, frameName });
    return readHighestProfit();
  };

  // Schedule

  public getScheduleData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getScheduleData", { symbol, strategyName, exchangeName, frameName });
    return readScheduleData();
  };

  public getScheduleReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getScheduleReport", { symbol, strategyName, exchangeName, frameName });
    return readSchedule();
  };

  // Performance

  public getPerformanceData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getPerformanceData", { symbol, strategyName, exchangeName, frameName });
    return readPerformanceData();
  };

  public getPerformanceReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getPerformanceReport", { symbol, strategyName, exchangeName, frameName });
    return readPerformance();
  };

  // Sync

  public getSyncData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getSyncData", { symbol, strategyName, exchangeName, frameName });
    return readSyncData();
  };

  public getSyncReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getSyncReport", { symbol, strategyName, exchangeName, frameName });
    return readSync();
  };

  // Heat

  public getHeatData = async (strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getHeatData", { strategyName, exchangeName, frameName });
    return readHeatData();
  };

  public getHeatReport = async (strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getHeatReport", { strategyName, exchangeName, frameName });
    return readHeat();
  };

  // Walker

  public getWalkerData = async (symbol: string, walkerName: string) => {
    this.loggerService.log("markdownMockService getWalkerData", { symbol, walkerName });
    return readWalkerData();
  };

  public getWalkerReport = async (symbol: string, walkerName: string): Promise<string> => {
    this.loggerService.log("markdownMockService getWalkerReport", { symbol, walkerName });
    return readWalker();
  };
}

export default MarkdownMockService;
