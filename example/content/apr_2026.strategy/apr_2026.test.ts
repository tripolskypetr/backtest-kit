import {
  addStrategySchema,
  listenError,
  Log,
  getCandles,
  listenIdlePing,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { predict } from "garch";

addStrategySchema({
  strategyName: "apr_2026_strategy",
  getSignal: async () => {
    return null;
  },
});

listenIdlePing(async ({ symbol, currentPrice }) => {
  const candles_1m = await getCandles(symbol, "1m", 1_500);
  const candles_5m = await getCandles(symbol, "5m", 1_500);
  const candles_15m = await getCandles(symbol, "15m", 1_000);
  const candles_30m = await getCandles(symbol, "30m", 1_000);
  const candles_1h = await getCandles(symbol, "1h", 500);
  const candles_4h = await getCandles(symbol, "4h", 500);
  const candles_6h = await getCandles(symbol, "6h", 300);
  const candles_8h = await getCandles(symbol, "8h", 300);

  const { sigma: sigma_1m, reliable: reliable_1m } = await predict(candles_1m, "1m");
  const { sigma: sigma_5m, reliable: reliable_5m } = await predict(candles_5m, "5m");
  const { sigma: sigma_15m, reliable: reliable_15m } = await predict(candles_15m, "15m");
  const { sigma: sigma_30m, reliable: reliable_30m } = await predict(candles_30m, "30m");
  const { sigma: sigma_1h, reliable: reliable_1h } = await predict(candles_1h, "1h");
  const { sigma: sigma_4h, reliable: reliable_4h } = await predict(candles_4h, "4h");
  const { sigma: sigma_6h, reliable: reliable_6h } = await predict(candles_6h, "6h");
  const { sigma: sigma_8h, reliable: reliable_8h } = await predict(candles_8h, "8h");

  const volatility_1m = { sigma_1m, reliable_1m };
  const volatility_5m = { sigma_5m, reliable_5m };
  const volatility_15m = { sigma_15m, reliable_15m };
  const volatility_30m = { sigma_30m, reliable_30m };
  const volatility_1h = { sigma_1h, reliable_1h };
  const volatility_4h = { sigma_4h, reliable_4h };
  const volatility_6h = { sigma_6h, reliable_6h };
  const volatility_8h = { sigma_8h, reliable_8h };

  Log.info("position ping", {
    symbol,
    volatility_1m,
    volatility_5m,
    volatility_15m,
    volatility_30m,
    volatility_1h,
    volatility_4h,
    volatility_6h,
    volatility_8h,
    currentPrice,
  });
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
