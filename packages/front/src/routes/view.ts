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

export default router;
