# Breakeven Protection (v1.10.1, 09/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.10.1)

**Breakeven Stop-Loss Protection** 🛡️📈

New breakeven protection automatically moves stop-loss to entry price when profit threshold is reached! When the price moves far enough in profit direction, the system locks in a zero-risk position by moving SL to breakeven. The threshold is calculated as `(CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2` to account for trading costs. Breakeven is triggered exactly once per signal with crash-safe persistence and memory-optimized instance management. ✨

```ts
import {
  listenBreakeven,
  Backtest,
  Live,
} from "backtest-kit";

// Listen to breakeven events
listenBreakeven(({ symbol, signal, currentPrice, backtest }) => {
  console.log(`${symbol} signal #${signal.id} moved to breakeven at ${currentPrice}`);
  console.log(`Entry: ${signal.priceOpen}, Position: ${signal.position}`);
});

// Manual breakeven trigger (optional)
await Backtest.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

await Live.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

**Breakeven Statistics & Reports** 📊

```ts
import { Breakeven } from "backtest-kit";

// Get statistical data
const stats = await Breakeven.getData("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});
console.log(stats);
// {
//   totalBreakeven: 42,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Breakeven.getReport("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Save to disk
await Breakeven.dump("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
}); // ./dump/breakeven/BTCUSDT_my-strategy.md
```

**Architecture** 🏗️

- **BreakevenGlobalService**: Global service layer with validation and logging
- **BreakevenConnectionService**: Connection layer with memoized ClientBreakeven instances
- **ClientBreakeven**: Core breakeven logic with state persistence
- **PersistBreakevenUtils**: Crash-safe state persistence to disk
- **BreakevenMarkdownService**: Event accumulation and report generation

Features:
- One ClientBreakeven instance per signal ID (memoized for performance)
- Automatic cleanup on signal close to prevent memory leaks
- File-based persistence in `./dump/data/breakeven/{symbol}_{strategy}/state.json`
- Real-time event emission via breakevenSubject
- Markdown reports with complete breakeven history


# Enhanced Risk Management (v1.6.1, 28/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.6.1)


**Advanced Risk Reporting & Analysis** 📊🛡️

Comprehensive risk management system with detailed reporting and validation! The new `Risk` utility class provides extensive analytics for risk rejection tracking and exposure monitoring. Generate markdown reports with complete history of rejected signals, risk validations, and detailed statistics. Features include the `MergeRisk` composite pattern for combining multiple risk profiles with logical AND validation. ✨

```ts
import { Risk } from "backtest-kit";

// Get risk rejection statistics for a symbol
const stats = await Risk.getData("BTCUSDT", "my-strategy");

// Generate markdown risk report
const report = await Risk.getReport("BTCUSDT", "my-strategy");

// Save risk report to disk
await Risk.dump("BTCUSDT", "my-strategy"); // ./dump/risk/BTCUSDT_my-strategy.md
```

**Schedule Reporting Enhancements** 📅

Enhanced scheduled signal reporting with detailed statistics! Track cancellation rates, average wait times, and complete history of scheduled orders. The `Schedule` utility class provides access to all schedule events including pending, activated, and cancelled signals. 🎯

```ts
import { Schedule } from "backtest-kit";

// Get schedule statistics
const stats = await Schedule.getData("BTCUSDT", "my-strategy");
console.log(`Cancellation rate: ${stats.cancellationRate}%`);
console.log(`Average wait time: ${stats.avgWaitTime} minutes`);

// Generate markdown schedule report
const report = await Schedule.getReport("BTCUSDT", "my-strategy");

// Save to disk
await Schedule.dump("BTCUSDT", "my-strategy"); // ./dump/schedule/BTCUSDT_my-strategy.md
```

**Caching & Performance** ⚡💾

New `Cache` utility class provides intelligent memoization for expensive operations! Candle data, price calculations, and exchange queries are automatically cached with timeframe-based invalidation. Memory-optimized storage prevents duplicate API calls during backtest and live trading modes. Cache is integrated automatically - no manual configuration needed! 🚀

```ts
import { Cache } from "backtest-kit";

const fetchMicroTermMath = Cache.fn(lib.microTermMathService.getReport, {
  interval: "1m",
});

const commitMicroTermMath = trycatch(
  async (symbol: string, history: History) => {
    const microTermMath = await fetchMicroTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== HISTORICAL 1-MINUTE CANDLE DATA ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "Historical 1-minute candle data has been received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchMicroTermMath),
  }
);
```

**Exchange Utilities** 🔧

New `Exchange` utility class provides helper functions for exchange-specific operations! The `ExchangeInstance` class offers methods for formatting prices and quantities according to exchange precision rules, integrated seamlessly with CCXT. 📈

```ts
import { Exchange } from "backtest-kit";

// Get exchange instance for specific exchange
const binance = Exchange.get("binance");

// Format price with exchange precision
const formattedPrice = await binance.formatPrice("BTCUSDT", 43521.123456);

// Format quantity with exchange precision
const formattedQty = await binance.formatQuantity("BTCUSDT", 0.123456789);
```

**LLM-Powered Signal Cancellation** 🤖🚫

New `listenPing` event enables dynamic signal cancellation based on LLM analysis! Monitor scheduled signals in real-time and cancel them if market conditions change. Perfect for avoiding Second-Order Chaos when thousands of bots trigger the same levels. Integrate with Ollama or OpenAI to analyze market context every minute and cancel signals before they activate. 🎯

```ts
import {
  listenPing,
  Backtest,
  getAveragePrice
} from "backtest-kit";
import { json } from "agent-swarm-kit";

// Listen to ping events for scheduled signals
listenPing(async (event) => {
  if (event.backtest) {
    console.log(`[Backtest] Monitoring ${event.symbol} signal #${event.data.id}`);
    console.log(`Strategy: ${event.strategyName}, Price: ${event.data.priceOpen}`);

    // Get current market conditions
    const currentPrice = await getAveragePrice(event.symbol);

    // Ask LLM to re-evaluate signal validity
    const { data, error } = await json("SignalReview", {
      symbol: event.symbol,
      signalId: event.data.id,
      position: event.data.position,
      priceOpen: event.data.priceOpen,
      currentPrice,
      timestamp: event.timestamp,
    });

    if (error) {
      console.error("LLM validation error:", error);
      return;
    }

    // Cancel signal if LLM detects bot cluster trap
    if (data.recommendation === "cancel") {
      console.log(`🚫 LLM detected trap: ${data.reasoning}`);
      console.log(`Cancelling signal #${event.data.id}...`);

      await Backtest.cancel(
        event.symbol,
        event.strategyName
      );

      console.log(`✅ Signal #${event.data.id} cancelled`);
    }
  }
});
```




# Partial Profit/Loss Tracking (v1.4.0, 03/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.4.0)

**Position Scaling with Fixed Levels** 📊💰

Now you can scale out positions at fixed profit/loss milestones (10%, 20%, 30%, ..., 100%)! The system automatically monitors signals and emits events when they reach specific percentage levels, enabling sophisticated risk management strategies like partial profit taking and dynamic stop-loss adjustments. Each level is triggered **exactly once per signal** with Set-based deduplication and crash-safe persistence. 🎯✨

```ts
import {
  listenPartialProfit,
  listenPartialLoss,
  Constant
} from "backtest-kit";

// Listen to all profit levels (10%, 20%, 30%, ...)
listenPartialProfit(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);

  // Scale out at Kelly-optimized levels
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

// Listen to all loss levels (10%, 20%, 30%, ...)
listenPartialLoss(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});
```

**New Event Listeners** 🎧

- **`listenPartialProfit(callback)`** - Emits for each profit level reached (10%, 20%, 30%, etc.)
- **`listenPartialLoss(callback)`** - Emits for each loss level reached (10%, 20%, 30%, etc.)
- **`listenPartialProfitOnce(filter, callback)`** - Fires once for first profit level
- **`listenPartialLossOnce(filter, callback)`** - Fires once for first loss level

**Constant Utility** 📐

Kelly Criterion-based constants for optimal position sizing:

```ts
import { Constant } from "backtest-kit";

// Take Profit Levels
Constant.TP_LEVEL1  // 100% (aggressive target)
Constant.TP_LEVEL2  // 50%  (moderate target)
Constant.TP_LEVEL3  // 25%  (conservative target)

// Stop Loss Levels
Constant.SL_LEVEL1  // 100% (maximum risk)
Constant.SL_LEVEL2  // 50%  (standard stop)
```

**Partial Statistics & Reports** 📈

```ts
import { Partial } from "backtest-kit";

// Get statistical data
const stats = await Partial.getData("BTCUSDT");
console.log(stats);
// {
//   totalEvents: 15,
//   totalProfit: 10,
//   totalLoss: 5,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Partial.getReport("BTCUSDT");

// Save to disk
await Partial.dump("BTCUSDT"); // ./dump/partial/BTCUSDT.md
```

**Strategy-Level Callbacks** 🎯

```ts
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
  callbacks: {
    onPartialProfit: (symbol, data, currentPrice, revenuePercent, backtest) => {
      console.log(`Signal ${data.id} at ${revenuePercent.toFixed(2)}% profit`);
    },
    onPartialLoss: (symbol, data, currentPrice, lossPercent, backtest) => {
      console.log(`Signal ${data.id} at ${lossPercent.toFixed(2)}% loss`);
    },
  },
});
```




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



