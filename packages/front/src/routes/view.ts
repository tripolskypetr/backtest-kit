import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";
import { CandleInterval } from "backtest-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

interface CandlesRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  signalId: string;
  interval: CandleInterval;
}

interface NotificationRequest {
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
router.post("/api/v1/view/candles", async (req, res) => {
  try {
    const request = <CandlesRequest>await micro.json(req);
    const { signalId, interval, requestId, serviceName } = request;
    const data = await ioc.exchangeViewService.getCandles(signalId, interval);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/candles ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/candles error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

// NotificationViewService endpoints
router.post("/api/v1/view/notification", async (req, res) => {
  try {
    const request = <NotificationRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.notificationViewService.getData();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/view/notification ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/view/notification error", {
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
