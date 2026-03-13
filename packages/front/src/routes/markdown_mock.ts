import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

// MarkdownMockService endpoints

interface MarkdownBacktestRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
}

interface MarkdownLiveRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  strategyName: string;
  exchangeName: string;
}

interface MarkdownSymbolStrategyRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
}

interface MarkdownHeatRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
}

interface MarkdownWalkerRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  walkerName: string;
}

router.post("/api/v1/markdown_mock/backtest_data", async (req, res) => {
  try {
    const request = <MarkdownBacktestRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getBacktestData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/backtest_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/backtest_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/backtest_report", async (req, res) => {
  try {
    const request = <MarkdownBacktestRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getBacktestReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/backtest_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/backtest_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/live_data", async (req, res) => {
  try {
    const request = <MarkdownLiveRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName } = request;
    const data = await ioc.markdownMockService.getLiveData(symbol, strategyName, exchangeName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/live_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/live_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/live_report", async (req, res) => {
  try {
    const request = <MarkdownLiveRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName } = request;
    const data = await ioc.markdownMockService.getLiveReport(symbol, strategyName, exchangeName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/live_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/live_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/breakeven_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getBreakevenData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/breakeven_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/breakeven_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/breakeven_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getBreakevenReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/breakeven_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/breakeven_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/risk_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getRiskData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/risk_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/risk_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/risk_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getRiskReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/risk_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/risk_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/partial_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getPartialData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/partial_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/partial_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/partial_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getPartialReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/partial_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/partial_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/highest_profit_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getHighestProfitData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/highest_profit_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/highest_profit_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/highest_profit_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getHighestProfitReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/highest_profit_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/highest_profit_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/schedule_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getScheduleData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/schedule_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/schedule_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/schedule_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getScheduleReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/schedule_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/schedule_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/performance_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getPerformanceData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/performance_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/performance_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/performance_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getPerformanceReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/performance_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/performance_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/sync_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getSyncData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/sync_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/sync_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/sync_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getSyncReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/sync_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/sync_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/heat_data", async (req, res) => {
  try {
    const request = <MarkdownHeatRequest>await micro.json(req);
    const { requestId, serviceName, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getHeatData(strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/heat_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/heat_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/heat_report", async (req, res) => {
  try {
    const request = <MarkdownHeatRequest>await micro.json(req);
    const { requestId, serviceName, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownMockService.getHeatReport(strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/heat_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/heat_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/walker_data", async (req, res) => {
  try {
    const request = <MarkdownWalkerRequest>await micro.json(req);
    const { requestId, serviceName, symbol, walkerName } = request;
    const data = await ioc.markdownMockService.getWalkerData(symbol, walkerName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/walker_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/walker_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_mock/walker_report", async (req, res) => {
  try {
    const request = <MarkdownWalkerRequest>await micro.json(req);
    const { requestId, serviceName, symbol, walkerName } = request;
    const data = await ioc.markdownMockService.getWalkerReport(symbol, walkerName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_mock/walker_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_mock/walker_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

export default router;
