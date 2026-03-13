import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { fetchApi, inject, randomString } from "react-declarative";
import {
  CC_CLIENT_ID,
  CC_ENABLE_MOCK,
  CC_SERVICE_NAME,
  CC_USER_ID,
} from "../../../config/params";
import MarkdownMockService from "../mock/MarkdownMockService";

export class MarkdownViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly markdownMockService = inject<MarkdownMockService>(TYPES.markdownMockService);

  // Backtest

  public getBacktestData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownViewService getBacktestData", { symbol, strategyName, exchangeName, frameName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBacktestData(symbol, strategyName, exchangeName, frameName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/backtest_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getBacktestReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getBacktestReport", { symbol, strategyName, exchangeName, frameName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBacktestReport(symbol, strategyName, exchangeName, frameName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/backtest_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Live

  public getLiveData = async (symbol: string, strategyName: string, exchangeName: string) => {
    this.loggerService.log("markdownViewService getLiveData", { symbol, strategyName, exchangeName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getLiveData(symbol, strategyName, exchangeName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/live_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getLiveReport = async (symbol: string, strategyName: string, exchangeName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getLiveReport", { symbol, strategyName, exchangeName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getLiveReport(symbol, strategyName, exchangeName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/live_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Breakeven

  public getBreakevenData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getBreakevenData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBreakevenData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/breakeven_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getBreakevenReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getBreakevenReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getBreakevenReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/breakeven_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Risk

  public getRiskData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getRiskData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getRiskData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/risk_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getRiskReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getRiskReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getRiskReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/risk_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Partial

  public getPartialData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getPartialData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPartialData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/partial_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getPartialReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getPartialReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPartialReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/partial_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // HighestProfit

  public getHighestProfitData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getHighestProfitData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHighestProfitData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/highest_profit_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getHighestProfitReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getHighestProfitReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHighestProfitReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/highest_profit_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Schedule

  public getScheduleData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getScheduleData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getScheduleData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/schedule_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getScheduleReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getScheduleReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getScheduleReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/schedule_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Performance

  public getPerformanceData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getPerformanceData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPerformanceData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/performance_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getPerformanceReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getPerformanceReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getPerformanceReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/performance_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Sync

  public getSyncData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getSyncData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getSyncData(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/sync_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getSyncReport = async (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getSyncReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getSyncReport(symbol, strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/sync_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Heat

  public getHeatData = async (strategyName: string, exchangeName: string, frameName: string, backtest = false) => {
    this.loggerService.log("markdownViewService getHeatData", { strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHeatData(strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/heat_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getHeatReport = async (strategyName: string, exchangeName: string, frameName: string, backtest = false): Promise<string> => {
    this.loggerService.log("markdownViewService getHeatReport", { strategyName, exchangeName, frameName, backtest });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getHeatReport(strategyName, exchangeName, frameName, backtest);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/heat_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        strategyName,
        exchangeName,
        frameName,
        backtest,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  // Walker

  public getWalkerData = async (symbol: string, walkerName: string) => {
    this.loggerService.log("markdownViewService getWalkerData", { symbol, walkerName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getWalkerData(symbol, walkerName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/walker_data", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        walkerName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getWalkerReport = async (symbol: string, walkerName: string): Promise<string> => {
    this.loggerService.log("markdownViewService getWalkerReport", { symbol, walkerName });
    if (CC_ENABLE_MOCK) {
      return await this.markdownMockService.getWalkerReport(symbol, walkerName);
    }
    const { data, error } = await fetchApi("/api/v1/markdown_view/walker_report", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        walkerName,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default MarkdownViewService;
