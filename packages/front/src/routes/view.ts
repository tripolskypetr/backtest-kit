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

export default router;
