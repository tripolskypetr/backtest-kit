import { createLogger } from "pinolog";
import { app } from "../config/app";
import { errorData, getErrorMessage } from "functools-kit";
import signal from "../lib/signal";

const logger = createLogger(`http_dict.log`);

interface ListRequest {
  requestId: string;
  serviceName: string;
}

interface OneRequest {
  requestId: string;
  serviceName: string;
  id: string;
}

app.post("/dict/symbol/list", async (ctx) => {
  const request = await ctx.req.json<ListRequest>();
  console.time(`/dict/symbol/list ${request.requestId}`);
  try {
    const result = {
      data: await signal.dictMetaService.getSymbolList(),
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/dict/symbol/list ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/dict/symbol/list error", {
      request,
      error: errorData(error),
    });
    return ctx.json(
      {
        status: "error",
        error: getErrorMessage(error),
        requestId: request.requestId,
        serviceName: request.serviceName,
      },
      200
    );
  } finally {
    console.timeEnd(`/dict/symbol/list ${request.requestId}`);
  }
});

app.post("/dict/symbol/map", async (ctx) => {
  const request = await ctx.req.json<ListRequest>();
  console.time(`/dict/symbol/map ${request.requestId}`);
  try {
    const result = {
      data: await signal.dictMetaService.getSymbolMap(),
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/dict/symbol/map ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/dict/symbol/map error", {
      request,
      error: errorData(error),
    });
    return ctx.json(
      {
        status: "error",
        error: getErrorMessage(error),
        requestId: request.requestId,
        serviceName: request.serviceName,
      },
      200
    );
  } finally {
    console.timeEnd(`/dict/symbol/map ${request.requestId}`);
  }
});

app.post("/dict/symbol/one", async (ctx) => {
  const request = await ctx.req.json<OneRequest>();
  console.time(`/dict/symbol/one ${request.requestId}`);
  try {
    const result = {
      data: await signal.dictMetaService.getSymbol(request.id),
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/dict/symbol/one ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/dict/symbol/one error", {
      request,
      error: errorData(error),
    });
    return ctx.json(
      {
        status: "error",
        error: getErrorMessage(error),
        requestId: request.requestId,
        serviceName: request.serviceName,
      },
      200
    );
  } finally {
    console.timeEnd(`/dict/symbol/one ${request.requestId}`);
  }
});
