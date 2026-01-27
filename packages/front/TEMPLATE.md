```
import { errorData, getErrorMessage } from "functools-kit";
import { createLogger } from "pinolog";
import { app } from "../config/app";
import signal from "../lib/signal";

const logger = createLogger(`http_state.log`);

interface PendingSignalRequest {
  symbol: string;
  requestId: string;
  serviceName: string;
}

interface ToggleRequest {
  requestId: string;
  serviceName: string;
}


interface CloseRequest {
  requestId: string;
  serviceName: string;
  signalId: string;
  comment: string;
}

interface RemoveRequest {
  requestId: string;
  serviceName: string;
  signalId: string;
  comment: string;
}

interface NewsReportRequest {
  requestId: string;
  serviceName: string;
}

app.post("/state/signal/pending", async (ctx) => {
  const request = await ctx.req.json<PendingSignalRequest>();
  console.time(`/state/signal/pending ${request.requestId}`);
  try {
    const result = {
      data: await signal.signalDbService.getPendingSignals(request.symbol),
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/state/signal/pending ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/state/signal/pending error", {
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
    console.timeEnd(`/state/signal/pending ${request.requestId}`);
  }
});

app.post("/state/signal/toggle/:id", async (ctx) => {
  const signalId = ctx.req.param("id");
  const request = await ctx.req.json<ToggleRequest>();
  console.time(`/state/signal/toggle/:id ${request.requestId}`);
  try {
    const signalData = await signal.signalDbService.findById(signalId);
    const updatedSignal = await signal.signalDbService.update(signalId, {
      ...signalData,
      finished: true,
      updateDate: new Date(),
    });

    const result = {
      data: updatedSignal,
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/state/signal/toggle/:id ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/state/signal/toggle/:id error", {
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
    console.timeEnd(`/state/signal/toggle/:id ${request.requestId}`);
  }
});

app.post("/state/signal/close", async (ctx) => {
  const request = await ctx.req.json<CloseRequest>();
  console.time(`/state/signal/close ${request.requestId}`);
  try {
    const signalRow = await signal.signalDbService.findById(request.signalId);
    await signal.signalLogicService.commitCloseNotify({
      description: request.comment,
      reasoning: "Выполнено администратором вручную",
      signal: signalRow,
      symbol: signalRow.symbol,
      executionId: "",
    });
    const result = {
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/state/signal/close ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/state/signal/close error", {
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
    console.timeEnd(`/state/signal/close ${request.requestId}`);
  }
});

app.post("/state/signal/remove", async (ctx) => {
  const request = await ctx.req.json<RemoveRequest>();
  console.time(`/state/signal/remove ${request.requestId}`);
  try {
    const signalRow = await signal.signalDbService.findById(request.signalId);
    await signal.signalDbService.update(signalRow.id, {
      ...signalRow,
      ignore: true,
    });
    if (await signal.settingsConnectionService.getIsFeatureTradeDelayEnable()) {
      await signal.delayConnectionService.toggleTrade(signalRow.symbol);
    }
    const result = {
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/state/signal/remove ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/state/signal/remove error", {
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
    console.timeEnd(`/state/signal/remove ${request.requestId}`);
  }
});

app.post("/state/news", async (ctx) => {
  const request = await ctx.req.json<NewsReportRequest>();
  console.time(`/state/news ${request.requestId}`);
  try {
    const result = {
      data: await signal.newsReportService.getReport("BTCUSDT"),
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/state/news ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/state/news error", {
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
    console.timeEnd(`/state/news ${request.requestId}`);
  }
});
```
