import micro from "micro";
import Router from "router";
import { errorData, getErrorMessage } from "functools-kit";

import omit from "../utils/omit";

import { ioc } from "../lib";

const router = Router({
  params: true,
});

interface SignalPendingPriceRequest {
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

router.post("/api/v1/global/signal_pending_price", async (req, res) => {
  try {
    const request = <SignalPendingPriceRequest>await micro.json(req);
    const { symbol, strategyName, exchangeName, frameName, backtest, requestId, serviceName } = request;
    const data = await ioc.priceConnectionService.getSignalPendingPrice(
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    );
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/global/signal_pending_price ok", {
      request,
      result: omit(result, "data"),
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/global/signal_pending_price error", {
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
    });
  }
});

export default router;
