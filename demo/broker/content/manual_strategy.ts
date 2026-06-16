import { addStrategySchema } from "backtest-kit";

addStrategySchema({
  strategyName: "main_strategy",
  callbacks: {
    onOpen(symbol, { priceOpen, priceStopLoss, priceTakeProfit, position }) {
      console.log("Position opened", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
      });
    },
    onClose(symbol, { priceOpen, priceStopLoss, priceTakeProfit, position }) {
      console.log("Position closed", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
      });
    },
    onActivePing(
      symbol,
      { priceOpen, priceStopLoss, priceTakeProfit, position },
    ) {
      console.log("Position active", {
        symbol,
        position,
        priceOpen,
        priceTakeProfit,
        priceStopLoss,
      });
    },
  },
});
