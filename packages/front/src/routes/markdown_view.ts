import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

// MarkdownViewService endpoints

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

router.post("/api/v1/markdown_view/backtest_data", async (req, res) => {
  try {
    const request = <MarkdownBacktestRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownViewService.getBacktestData(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/backtest_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/backtest_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/backtest_report", async (req, res) => {
  try {
    const request = <MarkdownBacktestRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName } = request;
    const data = await ioc.markdownViewService.getBacktestReport(symbol, strategyName, exchangeName, frameName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/backtest_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/backtest_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/live_data", async (req, res) => {
  try {
    const request = <MarkdownLiveRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName } = request;
    const data = await ioc.markdownViewService.getLiveData(symbol, strategyName, exchangeName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/live_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/live_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/live_report", async (req, res) => {
  try {
    const request = <MarkdownLiveRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName } = request;
    const data = await ioc.markdownViewService.getLiveReport(symbol, strategyName, exchangeName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/live_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/live_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/breakeven_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getBreakevenData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/breakeven_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/breakeven_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/breakeven_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getBreakevenReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/breakeven_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/breakeven_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/risk_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getRiskData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/risk_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/risk_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/risk_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getRiskReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/risk_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/risk_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/partial_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getPartialData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/partial_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/partial_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/partial_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getPartialReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/partial_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/partial_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/highest_profit_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getHighestProfitData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/highest_profit_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/highest_profit_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/highest_profit_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getHighestProfitReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/highest_profit_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/highest_profit_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/schedule_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getScheduleData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/schedule_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/schedule_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/schedule_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getScheduleReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/schedule_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/schedule_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/performance_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getPerformanceData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/performance_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/performance_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/performance_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getPerformanceReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/performance_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/performance_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/sync_data", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getSyncData(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/sync_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/sync_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/sync_report", async (req, res) => {
  try {
    const request = <MarkdownSymbolStrategyRequest>await micro.json(req);
    const { requestId, serviceName, symbol, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getSyncReport(symbol, strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/sync_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/sync_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/heat_data", async (req, res) => {
  try {
    const request = <MarkdownHeatRequest>await micro.json(req);
    const { requestId, serviceName, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getHeatData(strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/heat_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/heat_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/heat_report", async (req, res) => {
  try {
    const request = <MarkdownHeatRequest>await micro.json(req);
    const { requestId, serviceName, strategyName, exchangeName, frameName, backtest } = request;
    const data = await ioc.markdownViewService.getHeatReport(strategyName, exchangeName, frameName, backtest);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/heat_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/heat_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/walker_data", async (req, res) => {
  try {
    const request = <MarkdownWalkerRequest>await micro.json(req);
    const { requestId, serviceName, symbol, walkerName } = request;
    const data = await ioc.markdownViewService.getWalkerData(symbol, walkerName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/walker_data ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/walker_data error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

router.post("/api/v1/markdown_view/walker_report", async (req, res) => {
  try {
    const request = <MarkdownWalkerRequest>await micro.json(req);
    const { requestId, serviceName, symbol, walkerName } = request;
    const data = await ioc.markdownViewService.getWalkerReport(symbol, walkerName);
    const result = { data, status: "ok", error: "", requestId, serviceName };
    ioc.loggerService.log("/api/v1/markdown_view/walker_report ok", { request, result: omit(result, "data") });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/markdown_view/walker_report error", { error: errorData(error) });
    return await micro.send(res, 200, { status: "error", error: getErrorMessage(error) });
  }
});

export default router;
