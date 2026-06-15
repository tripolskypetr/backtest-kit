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

// SetupMockService endpoints
router.post("/api/v1/mock/setup_data", async (req, res) => {
  try {
    const request = <SetupRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.setupMockService.getSetupData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/setup_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/setup_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// ExchangeMockService endpoints
router.post("/api/v1/mock/candles_signal", async (req, res) => {
  try {
    const request = <SignalCandlesRequest>await micro.json(req);
    const { signalId, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeMockService.getSignalCandles(signalId, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/candles_signal ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/candles_signal error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});


router.post("/api/v1/mock/candles_point", async (req, res) => {
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
    ioc.loggerService.log("/api/v1/mock/candles_point ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/candles_point error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/candles_range", async (req, res) => {
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
    ioc.loggerService.log("/api/v1/mock/candles_range ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/candles_range error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// NotificationMockService endpoints
router.post("/api/v1/mock/notification_list", async (req, res) => {
  try {
    const request = <NotificationListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.notificationMockService.getList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/notification_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/notification_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/notification_one/:id", async (req, res) => {
  try {
    const request = <NotificationOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.notificationMockService.getOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/notification_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/notification_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/notification_filter", async (req, res) => {
  try {
    const request = <NotificationFilterRequest>await micro.json(req);
    const { requestId, serviceName, filterData, limit, offset } = request;
    const data = await ioc.notificationMockService.findByFilter(filterData, limit, offset);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/notification_filter ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/notification_filter error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// StorageMockService endpoints
router.post("/api/v1/mock/storage_one/:id", async (req, res) => {
  try {
    const request = <StorageOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const signalId = req.params.id;
    const data = await ioc.storageMockService.findSignalById(signalId);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/storage_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/storage_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/storage_list/live", async (req, res) => {
  try {
    const request = <StorageListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.storageMockService.listSignalLive();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/storage_list/live ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/storage_list/live error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/storage_list/backtest", async (req, res) => {
  try {
    const request = <StorageListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.storageMockService.listSignalBacktest();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/storage_list/backtest ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/storage_list/backtest error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// LogMockService endpoints
router.post("/api/v1/mock/log_list", async (req, res) => {
  try {
    const request = <LogListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.logMockService.getList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/log_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/log_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/log_one/:id", async (req, res) => {
  try {
    const request = <LogOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.logMockService.getOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/log_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/log_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/log_filter", async (req, res) => {
  try {
    const request = <LogFilterRequest>await micro.json(req);
    const { requestId, serviceName, filterData, limit, offset } = request;
    const data = await ioc.logMockService.findByFilter(filterData, limit, offset);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/log_filter ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/log_filter error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/candles_live", async (req, res) => {
  try {
    const request = <SignalCandlesRequest>await micro.json(req);
    const { signalId, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeMockService.getLiveCandles(signalId, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/candles_live ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/candles_live error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/candles_last", async (req, res) => {
  try {
    const request = <LastCandlesRequest>await micro.json(req);
    const { symbol, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeMockService.getLastCandles(symbol, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/candles_last ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/candles_last error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// SignalMockService endpoints
router.post("/api/v1/mock/signal_last_update/:id", async (req, res) => {
  try {
    const request = <StorageOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const signalId = req.params.id;
    const data = await ioc.signalMockService.getLastUpdateTimestamp(signalId);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/signal_last_update/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/signal_last_update/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/signal_pending", async (req, res) => {
  try {
    const request = <SignalPendingRequest>await micro.json(req);
    const { symbol, requestId, serviceName } = request;
    const data = await ioc.signalMockService.getPendingSignal(symbol);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/signal_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/signal_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// StatusMockService endpoints
router.post("/api/v1/mock/status_list", async (req, res) => {
  try {
    const request = <StatusListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.statusMockService.getStatusList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/status_list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/status_list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/status_one/:id", async (req, res) => {
  try {
    const request = <StatusOneRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const id = req.params.id;
    const data = await ioc.statusMockService.getStatusOne(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/status_one/:id ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/status_one/:id error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// ControlMockService endpoints
router.post("/api/v1/mock/control_status", async (req, res) => {
  try {
    const request = <ControlStatusRequest>await micro.json(req);
    const { symbol, context, requestId, serviceName } = request;
    const data = await ioc.controlMockService.getStatus(symbol, context);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/control_status ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/control_status error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/control_open_pending", async (req, res) => {
  try {
    const request = <ControlOpenPendingRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlMockService.commitOpenPending(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/control_open_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/control_open_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/control_average_buy", async (req, res) => {
  try {
    const request = <ControlAverageBuyRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlMockService.commitAverageBuy(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/control_average_buy ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/control_average_buy error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/control_close_pending", async (req, res) => {
  try {
    const request = <ControlClosePendingRequest>await micro.json(req);
    const { symbol, context, dto, requestId, serviceName } = request;
    const data = await ioc.controlMockService.commitClosePending(symbol, context, dto);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/control_close_pending ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/control_close_pending error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/control_breakeven", async (req, res) => {
  try {
    const request = <ControlBreakevenRequest>await micro.json(req);
    const { symbol, context, requestId, serviceName } = request;
    const data = await ioc.controlMockService.commitBreakeven(symbol, context);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/control_breakeven ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/control_breakeven error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// HeatMockService endpoints
router.post("/api/v1/mock/heat_data", async (req, res) => {
  try {
    const request = <HeatRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.heatMockService.getStrategyHeatData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/heat_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/heat_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/heat_report", async (req, res) => {
  try {
    const request = <HeatRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.heatMockService.getStrategyHeatReport();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/heat_report ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/heat_report error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/status_info", async (req, res) => {
  try {
    const request = <StatusInfoRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.statusMockService.getStatusInfo();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/status_info ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/status_info error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// PerformanceMockService endpoints
router.post("/api/v1/mock/performance_data", async (req, res) => {
  try {
    const request = <PerformanceRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.performanceMockService.getPerformanceData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/performance_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/performance_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/mock/performance_report", async (req, res) => {
  try {
    const request = <PerformanceRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.performanceMockService.getPerformanceReport();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/performance_report ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/performance_report error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// EnvironmentMockService endpoints
router.post("/api/v1/mock/environment_data", async (req, res) => {
  try {
    const request = <EnvironmentRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.environmentMockService.getEnvironmentData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/environment_data ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/environment_data error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// RuntimeMockService endpoints
router.post("/api/v1/mock/runtime_info", async (req, res) => {
  try {
    const request = <RuntimeRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.runtimeMockService.getRuntimeInfo();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/mock/runtime_info ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/mock/runtime_info error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

export default router;
