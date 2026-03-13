import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import {
  Backtest,
  Live,
  Breakeven,
  Risk,
  Partial,
  HighestProfit,
  Schedule,
  Performance,
  Sync,
  Heat,
  Walker,
} from "backtest-kit";
import MarkdownMockService from "../mock/MarkdownMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class MarkdownViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly markdownMockService = inject<MarkdownMockService>(TYPES.markdownMockService);

  // Backtest

  public getBacktestData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownViewService getBacktestData", { symbol, strategyName, exchangeName, frameName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBacktestData(symbol, strategyName, exchangeName, frameName);
    }
    return await Backtest.getData(symbol, { strategyName, exchangeName, frameName });
  };

  public getBacktestReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getBacktestReport", { symbol, strategyName, exchangeName, frameName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBacktestReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Backtest.getReport(symbol, { strategyName, exchangeName, frameName });
  };

  // Live

  public getLiveData = async (symbol: string, strategyName: string, exchangeName: string) => {
    this.loggerService.log("markdownViewService getLiveData", { symbol, strategyName, exchangeName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getLiveData(symbol, strategyName, exchangeName);
    }
    return await Live.getData(symbol, { strategyName, exchangeName });
  };

  public getLiveReport = async (symbol: string, strategyName: string, exchangeName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getLiveReport", { symbol, strategyName, exchangeName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getLiveReport(symbol, strategyName, exchangeName);
    }
    return await Live.getReport(symbol, { strategyName, exchangeName });
  };

  // Breakeven

  public getBreakevenData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getBreakevenData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBreakevenData(symbol, strategyName, exchangeName, frameName);
    }
    return await Breakeven.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getBreakevenReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getBreakevenReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBreakevenReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Breakeven.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Risk

  public getRiskData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getRiskData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getRiskData(symbol, strategyName, exchangeName, frameName);
    }
    return await Risk.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getRiskReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getRiskReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getRiskReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Risk.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Partial

  public getPartialData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getPartialData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPartialData(symbol, strategyName, exchangeName, frameName);
    }
    return await Partial.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getPartialReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getPartialReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPartialReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Partial.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // HighestProfit

  public getHighestProfitData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getHighestProfitData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHighestProfitData(symbol, strategyName, exchangeName, frameName);
    }
    return await HighestProfit.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getHighestProfitReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getHighestProfitReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHighestProfitReport(symbol, strategyName, exchangeName, frameName);
    }
    return await HighestProfit.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Schedule

  public getScheduleData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getScheduleData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getScheduleData(symbol, strategyName, exchangeName, frameName);
    }
    return await Schedule.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getScheduleReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getScheduleReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getScheduleReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Schedule.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Performance

  public getPerformanceData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getPerformanceData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPerformanceData(symbol, strategyName, exchangeName, frameName);
    }
    return await Performance.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getPerformanceReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getPerformanceReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPerformanceReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Performance.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Sync

  public getSyncData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getSyncData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getSyncData(symbol, strategyName, exchangeName, frameName);
    }
    return await Sync.getData(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  public getSyncReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getSyncReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getSyncReport(symbol, strategyName, exchangeName, frameName);
    }
    return await Sync.getReport(symbol, { strategyName, exchangeName, frameName }, backtest);
  };

  // Heat

  public getHeatData = async (strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getHeatData", { strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHeatData(strategyName, exchangeName, frameName);
    }
    return await Heat.getData({ strategyName, exchangeName, frameName }, backtest);
  };

  public getHeatReport = async (strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getHeatReport", { strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHeatReport(strategyName, exchangeName, frameName);
    }
    return await Heat.getReport({ strategyName, exchangeName, frameName }, backtest);
  };

  // Walker

  public getWalkerData = async (symbol: string, walkerName: string) => {
    this.loggerService.log("markdownViewService getWalkerData", { symbol, walkerName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getWalkerData(symbol, walkerName);
    }
    return await Walker.getData(symbol, { walkerName });
  };

  public getWalkerReport = async (symbol: string, walkerName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getWalkerReport", { symbol, walkerName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getWalkerReport(symbol, walkerName);
    }
    return await Walker.getReport(symbol, { walkerName });
  };
}

export default MarkdownViewService;
