import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class MarkdownMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  // Backtest

  public getBacktestData = async (symbol: string, strategyName: string, exchangeName: string, frameName: string) => {
    this.loggerService.log("markdownMockService getBacktestData", { symbol, strategyName, exchangeName, frameName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/backtest_data", {
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
    this.loggerService.log("markdownMockService getBacktestReport", { symbol, strategyName, exchangeName, frameName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/backtest_report", {
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
    this.loggerService.log("markdownMockService getLiveData", { symbol, strategyName, exchangeName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/live_data", {
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
    this.loggerService.log("markdownMockService getLiveReport", { symbol, strategyName, exchangeName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/live_report", {
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
    this.loggerService.log("markdownMockService getBreakevenData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/breakeven_data", {
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
    this.loggerService.log("markdownMockService getBreakevenReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/breakeven_report", {
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
    this.loggerService.log("markdownMockService getRiskData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/risk_data", {
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
    this.loggerService.log("markdownMockService getRiskReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/risk_report", {
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
    this.loggerService.log("markdownMockService getPartialData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/partial_data", {
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
    this.loggerService.log("markdownMockService getPartialReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/partial_report", {
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
    this.loggerService.log("markdownMockService getHighestProfitData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/highest_profit_data", {
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
    this.loggerService.log("markdownMockService getHighestProfitReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/highest_profit_report", {
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
    this.loggerService.log("markdownMockService getScheduleData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/schedule_data", {
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
    this.loggerService.log("markdownMockService getScheduleReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/schedule_report", {
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
    this.loggerService.log("markdownMockService getPerformanceData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/performance_data", {
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
    this.loggerService.log("markdownMockService getPerformanceReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/performance_report", {
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
    this.loggerService.log("markdownMockService getSyncData", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/sync_data", {
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
    this.loggerService.log("markdownMockService getSyncReport", { symbol, strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/sync_report", {
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
    this.loggerService.log("markdownMockService getHeatData", { strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/heat_data", {
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
    this.loggerService.log("markdownMockService getHeatReport", { strategyName, exchangeName, frameName, backtest });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/heat_report", {
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
    this.loggerService.log("markdownMockService getWalkerData", { symbol, walkerName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/walker_data", {
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
    this.loggerService.log("markdownMockService getWalkerReport", { symbol, walkerName });
    const { data, error } = await fetchApi("/api/v1/markdown_mock/walker_report", {
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

export default MarkdownMockService;
