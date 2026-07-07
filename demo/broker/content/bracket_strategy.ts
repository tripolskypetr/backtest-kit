import { addStrategySchema, Position } from "backtest-kit";

let idx = 0;

addStrategySchema({
  strategyName: "main_strategy",
  getSignal: async (symbol, when, currentPrice) => {
    idx += 1;
    return {
      ...Position.bracket({
        currentPrice,
        percentTakeProfit: 10,
        percentStopLoss: 10,
        position: idx % 2 === 0 ? "short" : 'long',
      }),
      minuteEstimatedTime: 60,
    }
  },
  callbacks: {
    onOpen(
      symbol,
      { priceOpen, priceStopLoss, priceTakeProfit, position },
      currentPrice,
    ) {
      console.log("Position opened", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        currentPrice,
      });
    },
    onClose(
      symbol,
      { priceOpen, priceStopLoss, priceTakeProfit, position },
      currentPrice,
    ) {
      console.log("Position closed", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        currentPrice,
      });
    },
    onActivePing(
      symbol,
      { priceOpen, priceStopLoss, priceTakeProfit, position },
      currentPrice,
    ) {
      console.log("Position active", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
        currentPrice,
      });
    },
  },
});
