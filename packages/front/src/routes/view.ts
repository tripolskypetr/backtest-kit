import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";
import { CandleInterval } from "backtest-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

interface SignalCandlesRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  signalId: string;
  interval: CandleInterval;
}

interface LastCandlesRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  interval: CandleInterval;
}

interface PointCandlesRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  currentTime: number;
  interval: CandleInterval;
  symbol: string;
  exchangeName: string;
}

interface RangeCandlesRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  interval: CandleInterval;
  limit?: number;
  sDate?: number;
  eDate?: number;
}

interface NotificationListRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface NotificationFilterRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  filterData: Record<string, string>;
  limit?: number;
  offset?: number;
}

interface NotificationOneRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface StorageOneRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface StorageListRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface LogListRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface LogFilterRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  filterData: Record<string, string>;
  limit?: number;
  offset?: number;
}

interface LogOneRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface SignalPendingRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
}

interface StatusListRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface StatusOneRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface StatusInfoRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface HeatRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface PerformanceRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface EnvironmentRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface SetupRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface RuntimeRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface ControlStatusRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  context: { strategyName: string; exchangeName: string };
}

interface ControlOpenPendingRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  context: { strategyName: string; exchangeName: string };
  dto: { position: "long" | "short"; cost: number; note: string };
}

interface ControlAverageBuyRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  context: { strategyName: string; exchangeName: string };
  dto: { cost: number; note: string };
}

interface ControlClosePendingRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  context: { strategyName: string; exchangeName: string };
  dto: { note: string };
}

interface ControlBreakevenRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  symbol: string;
  context: { strategyName: string; exchangeName: string };
}

// SetupViewService endpoints
router.post("/api/v1/view/setup_data", async (req, res) => {
  try {
    const request = <SetupRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.setupViewService.getSetupData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/setup_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/setup_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// ExchangeViewService endpoints
router.post("/api/v1/view/candles_signal", async (req, res) => {
  try {
    const request = <SignalCandlesRequest>await micro.json(req);
    const { signalId, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeViewService.getSignalCandles(signalId, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles_signal ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles_signal error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/candles_point", async (req, res) => {
  try {
    const request = <PointCandlesRequest>await micro.json(req);
    const { currentTime, interval, requestId, serviceName, symbol, exchangeName } = request;
    const data = await ioc.exchangeService.getPointCandles({
      currentTime,
      interval,
      symbol,
      exchangeName,
    });
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles_point ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles_point error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/candles_range", async (req, res) => {
  try {
    const request = <RangeCandlesRequest>await micro.json(req);
    const { symbol, interval, limit, sDate, eDate, requestId, serviceName } = request;
    const data = await ioc.exchangeService.getRawCandles({
      symbol,
      interval,
      limit,
      sDate,
      eDate,
    });
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles_range ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles_range error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/candles_live", async (req, res) => {
  try {
    const request = <SignalCandlesRequest>await micro.json(req);
    const { signalId, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeViewService.getLiveCandles(signalId, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles_live ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles_live error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/candles_last", async (req, res) => {
  try {
    const request = <LastCandlesRequest>await micro.json(req);
    const { symbol, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeViewService.getLastCandles(symbol, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles_last ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles_last error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// NotificationViewService endpoints
router.post("/api/v1/view/notification_list", async (req, res) => {
  try {
    const request = <NotificationListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.notificationViewService.getList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/notification_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/notification_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/notification_one/:id", async (req, res) => {
  try {
    const request = <NotificationOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.notificationViewService.getOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/notification_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/notification_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/notification_filter", async (req, res) => {
  try {
    const request = <NotificationFilterRequest>await micro.json(req);
    const { requestId, serviceName, filterData, limit, offset } = request;
    const data = await ioc.notificationViewService.findByFilter(filterData, limit, offset);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/notification_filter ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/notification_filter error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// StorageViewService endpoints
router.post("/api/v1/view/storage_one/:id", async (req, res) => {
  try {
    const request = <StorageOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const signalId = req.params.id;
    const data = await ioc.storageViewService.findSignalById(signalId);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/storage_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/storage_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/storage_list/live", async (req, res) => {
  try {
    const request = <StorageListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.storageViewService.listSignalLive();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/storage_list/live ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/storage_list/live error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/storage_list/backtest", async (req, res) => {
  try {
    const request = <StorageListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.storageViewService.listSignalBacktest();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/storage_list/backtest ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/storage_list/backtest error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// LogViewService endpoints
router.post("/api/v1/view/log_list", async (req, res) => {
  try {
    const request = <LogListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.logViewService.getList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/log_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/log_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/log_one/:id", async (req, res) => {
  try {
    const request = <LogOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.logViewService.getOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/log_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/log_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/log_filter", async (req, res) => {
  try {
    const request = <LogFilterRequest>await micro.json(req);
    const { requestId, serviceName, filterData, limit, offset } = request;
    const data = await ioc.logViewService.findByFilter(filterData, limit, offset);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/log_filter ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/log_filter error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// SignalViewService endpoints
router.post("/api/v1/view/signal_last_update/:id", async (req, res) => {
  try {
    const request = <StorageOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const signalId = req.params.id;
    const data = await ioc.signalViewService.getLastUpdateTimestamp(signalId);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/signal_last_update/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/signal_last_update/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/signal_pending", async (req, res) => {
  try {
    const request = <SignalPendingRequest>await micro.json(req);
    const { symbol, requestId, serviceName } = request;
    const data = await ioc.signalViewService.getPendingSignal(symbol);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/signal_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/signal_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// StatusViewService endpoints
router.post("/api/v1/view/status_list", async (req, res) => {
  try {
    const request = <StatusListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.statusViewService.getStatusList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/status_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/status_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/status_one/:id", async (req, res) => {
  try {
    const request = <StatusOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.statusViewService.getStatusOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/status_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/status_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// ControlViewService endpoints
router.post("/api/v1/view/control_status", async (req, res) => {
  try {
    const request = <ControlStatusRequest>await micro.json(req);
    const { symbol, context, requestId, serviceName } = request;
    const data = await ioc.controlViewService.getStatus(symbol, context);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_status ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_status error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/control_average_price", async (req, res) => {
  try {
    const request = <ControlStatusRequest>await micro.json(req);
    const { symbol, context, requestId, serviceName } = request;
    const data = await ioc.controlViewService.getAveragePrice(symbol, context);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_average_price ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_average_price error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/control_open_pending", async (req, res) => {
  try {
    const request = <ControlOpenPendingRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlViewService.commitOpenPending(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_open_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_open_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/control_average_buy", async (req, res) => {
  try {
    const request = <ControlAverageBuyRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlViewService.commitAverageBuy(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_average_buy ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_average_buy error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/control_close_pending", async (req, res) => {
  try {
    const request = <ControlClosePendingRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlViewService.commitClosePending(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_close_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_close_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/control_breakeven", async (req, res) => {
  try {
    const request = <ControlBreakevenRequest>await micro.json(req);
    const { symbol, context, requestId, serviceName } = request;
    const data = await ioc.controlViewService.commitBreakeven(symbol, context);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/control_breakeven ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/control_breakeven error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// HeatViewService endpoints
router.post("/api/v1/view/heat_data", async (req, res) => {
  try {
    const request = <HeatRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.heatViewService.getStrategyHeatData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/heat_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/heat_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/heat_report", async (req, res) => {
  try {
    const request = <HeatRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.heatViewService.getStrategyHeatReport();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/heat_report ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/heat_report error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/status_info", async (req, res) => {
  try {
    const request = <StatusInfoRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.statusViewService.getStatusInfo();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/status_info ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/status_info error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// PerformanceViewService endpoints
router.post("/api/v1/view/performance_data", async (req, res) => {
  try {
    const request = <PerformanceRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.performanceViewService.getPerformanceData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/performance_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/performance_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/view/performance_report", async (req, res) => {
  try {
    const request = <PerformanceRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.performanceViewService.getPerformanceReport();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/performance_report ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/performance_report error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// EnvironmentViewService endpoints
router.post("/api/v1/view/environment_data", async (req, res) => {
  try {
    const request = <EnvironmentRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.environmentViewService.getEnvironmentData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/environment_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/environment_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// RuntimeViewService endpoints
router.post("/api/v1/view/runtime_info", async (req, res) => {
  try {
    const request = <RuntimeRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.runtimeViewService.getRuntimeInfo();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/runtime_info ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/runtime_info error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

export default router;
