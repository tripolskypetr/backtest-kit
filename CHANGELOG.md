# Immediate Activation (v1.3.0, 01/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.3.0)

**Smart Signal Activation** 🚀⚡

Now signals activate **immediately** when `priceOpen` is already in the activation zone — no more waiting for scheduled state when the price has already moved! LONG positions open instantly when current price (VWAP) is below `priceOpen`, and SHORT positions trigger immediately when price is above `priceOpen`. Enhanced validation prevents invalid signals from being created: immediate signals are rejected if current price has already breached StopLoss or TakeProfit levels. Strict boundary checks (`<`/`>` instead of `<=`/`>=`) allow signals when price exactly equals SL/TP boundaries. 🎯✨

```ts
// Example: Immediate LONG activation
{
  position: "long",
  priceOpen: 43000,      // Target entry price
  priceStopLoss: 41000,
  priceTakeProfit: 44000
}

// Current market conditions:
currentPrice (VWAP) = 42000  // Already below priceOpen!

// Before v1.3.0:
→ scheduled → waiting for price to fall to 43000

// After v1.3.0:
→ opened IMMEDIATELY (price already at desired level!)
```

**Validation Enhancements** 🛡️

- **Mandatory `isScheduled` parameter**: Validation now distinguishes between scheduled and immediate signals
- **Immediate signal protection**: Rejects signals if `currentPrice < priceStopLoss` for LONG or `currentPrice > priceStopLoss` for SHORT
- **Boundary-safe validation**: Changed from `<=`/`>=` to `<`/`>` to allow signals when price exactly equals SL/TP
- **No false rejections**: Signals can now be created when current price equals stop-loss or take-profit boundaries

**Breaking Changes** ⚠️

- `VALIDATE_SIGNAL_FN` now requires explicit `isScheduled: boolean` parameter (no default value)
- Test expectations updated to account for immediate activation behavior
- Scheduled signal counts may differ due to immediate activation in certain price conditions

See [test/README.md](./test/README.md) for comprehensive documentation on immediate activation patterns and updated test writing guidelines.




# Scheduled (Limit) Orders (v1.2.1, 29/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.2.1)

**Scheduled Positions with SL Protection** 🚀✨

Now LONG orders activate only when the candle’s low touches or breaks below `priceOpen`, while SHORT orders trigger when the high reaches or exceeds `priceOpen`. Most importantly — StopLoss is checked first on every candle: if a single candle hits both `priceOpen` and `priceStopLoss` at the same time, the signal is instantly cancelled and the position is never opened, protecting you from instant losses even in the wildest volatility spikes. 🛡️⚡ All edge cases are thoroughly tested and documented.

```ts
// Example: LONG scheduled position
{
  position: "long",
  priceOpen: 42000,
  priceStopLoss: 41000,
  priceTakeProfit: 45000
}

// Candle that would previously cause trouble:
{ low: 40500, high: 43000 }  // ← hits both levels!

→ Result: instantly CANCELLED (position never opens)
```




# Backtest & Live Trading (v1.1.1, 22/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.1.1)

Build robust trading systems with crash-safe state persistence and event-driven architecture! 🚀 Test strategies on historical data or deploy to production with automatic recovery. 💾 Type-safe signal lifecycle prevents invalid trades with comprehensive validation. ✅ Memory-optimized async generators stream execution for backtest and live modes. 🔄 Event emitters provide real-time notifications for signals, errors, and completion. 🔔 Generate markdown reports with win rate and PNL statistics automatically. 📊

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  Backtest,
  Live,
  listenSignalBacktest,
  listenSignalLive,
  listenError,
  listenDone,
} from "backtest-kit";

// Register exchange with CCXT
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: async (symbol, price) => {
    const exchange = new ccxt.binance();
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = new ccxt.binance();
    return exchange.amountToPrecision(symbol, quantity);
  },
});

// Register strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "1m",
  getSignal: async ({ getCandles, getAveragePrice }) => {
    const candles = await getCandles("BTCUSDT", "1h", 100);
    const currentPrice = await getAveragePrice("BTCUSDT");

    // Your strategy logic here
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: currentPrice,
      priceTakeProfit: currentPrice * 1.02,
      priceStopLoss: currentPrice * 0.98,
      minuteEstimatedTime: 60,
      timestamp: Date.now(),
    };
  },
});

// Register timeframe for backtest
addFrame({
  frameName: "1d-backtest",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
});

// Run backtest in background
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to signals
listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

// Listen to completion
listenDone((event) => {
  if (event.backtest) {
    console.log("Backtest completed:", event.symbol);
    Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
  }
});

// Listen to errors
listenError((error) => {
  console.error("Error:", error.message);
});
```



