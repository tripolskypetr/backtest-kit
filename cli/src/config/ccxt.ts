import { singleshot } from "functools-kit";

export const getExchange = singleshot(async () => {
  const ccxt = await import("ccxt");
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});
