import { listenSignal } from "backtest-kit";
import { singleshot } from "functools-kit";

export const notifyVerbose = singleshot(() => {
  console.log("Using verbose logging...");
  listenSignal((event) => {
    if (event.action === "scheduled") {
      console.log(`[POSITION SCHEDULED] ${event.symbol}`);
      console.log(`  Strategy: ${event.strategyName}`);
      console.log(`  Current Price: ${event.currentPrice}`);
      console.log(`  Entry Price: ${event.signal.priceOpen}`);
      console.log(`  Signal ID: ${event.signal.id}`);
      console.log(`  Direction: ${event.signal.position}`);
      console.log(`  Stop Loss: ${event.signal.priceStopLoss}`);
      console.log(`  Take Profit: ${event.signal.priceTakeProfit}`);
      return;
    }

    if (event.action === "opened") {
      console.log(`[POSITION OPENED] ${event.symbol}`);
      console.log(`  Strategy: ${event.strategyName}`);
      console.log(`  Entry Price: ${event.currentPrice}`);
      console.log(`  Signal ID: ${event.signal.id}`);
      console.log(`  Direction: ${event.signal.position}`);
      console.log(`  Stop Loss: ${event.signal.priceStopLoss}`);
      console.log(`  Take Profit: ${event.signal.priceTakeProfit}`);
      return;
    }

    if (event.action === "closed") {
      console.log(`[POSITION CLOSED] ${event.symbol}`);
      console.log(`  Strategy: ${event.strategyName}`);
      console.log(`  Entry Price (adj): ${event.pnl.priceOpen}`);
      console.log(`  Exit Price (adj): ${event.pnl.priceClose}`);
      console.log(`  Signal ID: ${event.signal.id}`);
      console.log(`  Close Reason: ${event.closeReason}`);
      console.log(`  PnL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
      console.log(`  Win: ${event.pnl.pnlPercentage > 0 ? "YES" : "NO"}`);
      return;
    }

    if (event.action === "cancelled") {
      console.log(`[POSITION CANCELLED] ${event.symbol}`);
      console.log(`  Strategy: ${event.strategyName}`);
      console.log(`  Signal ID: ${event.signal.id}`);
      console.log(`  Current Price: ${event.currentPrice}`);
      console.log(`  Cancel Reason: ${event.reason}`);
      console.log(
        `  Cancelled At: ${new Date(event.closeTimestamp).toISOString()}`,
      );
      return;
    }
  });
});

export default notifyVerbose;
