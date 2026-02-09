import { ActionBase } from "backtest-kit";

/**
 * Monitors position lifecycle and logs open/close events in backtest mode
 * @implements {bt.IPublicAction}
 */
export class BacktestPositionMonitorAction extends ActionBase {
  /**
   * @param {bt.IStrategyTickResult} event 
   */
  async signalBacktest(event) {
    switch (event.action) {
      case "scheduled":
        console.log(`[POSITION SCHEDULED] ${event.symbol}`);
        console.log(`  Strategy: ${event.strategyName}`);
        console.log(`  Current Price: ${event.currentPrice}`);
        console.log(`  Entry Price: ${event.signal.priceOpen}`);
        console.log(`  Signal ID: ${event.signal.id}`);
        console.log(`  Direction: ${event.signal.position}`);
        console.log(`  Stop Loss: ${event.signal.priceStopLoss}`);
        console.log(`  Take Profit: ${event.signal.priceTakeProfit}`);
        break;

      case "opened":
        console.log(`[POSITION OPENED] ${event.symbol}`);
        console.log(`  Strategy: ${event.strategyName}`);
        console.log(`  Entry Price: ${event.currentPrice}`);
        console.log(`  Signal ID: ${event.signal.id}`);
        console.log(`  Direction: ${event.signal.position}`);
        console.log(`  Stop Loss: ${event.signal.priceStopLoss}`);
        console.log(`  Take Profit: ${event.signal.priceTakeProfit}`);
        break;

      case "closed":
        console.log(`[POSITION CLOSED] ${event.symbol}`);
        console.log(`  Strategy: ${event.strategyName}`);
        console.log(`  Entry Price (adj): ${event.pnl.priceOpen}`);
        console.log(`  Exit Price (adj): ${event.pnl.priceClose}`);
        console.log(`  Signal ID: ${event.signal.id}`);
        console.log(`  Close Reason: ${event.closeReason}`);
        console.log(`  PnL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
        console.log(`  Win: ${event.pnl.pnlPercentage > 0 ? "YES" : "NO"}`);
        break;

      case "cancelled":
        console.log(`[POSITION CANCELLED] ${event.symbol}`);
        console.log(`  Strategy: ${event.strategyName}`);
        console.log(`  Signal ID: ${event.signal.id}`);
        console.log(`  Current Price: ${event.currentPrice}`);
        console.log(`  Cancel Reason: ${event.reason}`);
        console.log(`  Cancelled At: ${new Date(event.closeTimestamp).toISOString()}`);
        break;
    }
  }
}

export default BacktestPositionMonitorAction;
