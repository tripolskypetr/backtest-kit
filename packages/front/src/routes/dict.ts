import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

interface ListRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
}

interface OneRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  id: string;
}

router.post("/api/v1/dict/symbol/list", async (req, res) => {
  try {
    const request = <ListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.symbolMetaService.getSymbolList();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/dict/symbol/list ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/dict/symbol/list error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/dict/symbol/map", async (req, res) => {
  try {
    const request = <ListRequest>await micro.json(req);
    const { requestId, serviceName } = request;
    const data = await ioc.symbolMetaService.getSymbolMap();
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/dict/symbol/map ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/dict/symbol/map error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

router.post("/api/v1/dict/symbol/one", async (req, res) => {
  try {
    const request = <OneRequest>await micro.json(req);
    const { requestId, serviceName, id } = request;
    const data = await ioc.symbolMetaService.getSymbol(id);
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/dict/symbol/one ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/dict/symbol/one error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

export default router;
