---
title: design/12_defining-strategies
group: design
---

# Defining Strategies

This page documents how to define and register trading strategies in the framework. It covers the `IStrategySchema` structure, the `addStrategy()` registration function, the `getSignal` callback for signal generation, interval-based throttling, and lifecycle callbacks for strategy events.

For information about how strategies are executed internally, see [Strategy Execution Flow](./13-strategy-execution-flow.md). For risk management integration, see [Risk Management](./14-risk-management.md). For position sizing integration, see [Position Sizing](./15-position-sizing.md).

---

## Strategy Schema Structure

Strategies are defined using the `IStrategySchema` interface, which specifies all configuration and behavior for a trading strategy. The schema is registered via `addStrategy()` and validated by `StrategyValidationService` before being stored in `StrategySchemaService`.

![Mermaid Diagram](./diagrams\12-defining-strategies_0.svg)

---

## Strategy Registration Flow

Strategies are registered using the `addStrategy()` function, which validates the schema and stores it in the dependency injection container. The registration process ensures that strategy names are unique and all required fields are present.

![Mermaid Diagram](./diagrams\12-defining-strategies_1.svg)

### Registration Example

```typescript
import { addStrategy } from "backtest-kit";

addStrategy({
  strategyName: "momentum-breakout",
  note: "Enters on momentum breakout with volume confirmation",
  interval: "5m",
  getSignal: async (symbol: string, when: Date) => {
    // Signal generation logic
    const shouldEnter = await checkBreakoutConditions(symbol, when);
    
    if (!shouldEnter) {
      return null; // No signal
    }
    
    return {
      position: "long",
      priceOpen: 50000, // Optional - creates scheduled signal
      priceTakeProfit: 52000,
      priceStopLoss: 48500,
      minuteEstimatedTime: 120,
      note: "Volume breakout confirmed",
    };
  },
  riskName: "conservative", // Optional risk profile
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`Signal opened: ${signal.id}`);
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log(`Signal closed at ${priceClose}`);
    },
  },
});
```

---

## Signal Generation Callback

The `getSignal` callback is the core of strategy logic. It is called by `ClientStrategy.tick()` when the interval throttling allows, and must return either a signal DTO or `null` if no signal should be generated.

### getSignal Function Signature

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair symbol (e.g., "BTCUSDT") |
| `when` | `Date` | Current timestamp for signal generation |
| **Returns** | `Promise<ISignalDto \| null>` | Signal DTO if conditions met, `null` otherwise |

![Mermaid Diagram](./diagrams\12-defining-strategies_2.svg)

### Signal Validation Rules

When `getSignal` returns a signal DTO, the framework validates:

| Rule | Description | Configuration |
|------|-------------|---------------|
| **TP Distance** | `priceTakeProfit` must be > `priceOpen` for long, < `priceOpen` for short | `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` |
| **SL Distance** | `priceStopLoss` must be < `priceOpen` for long, > `priceOpen` for short | `CC_MIN_STOPLOSS_DISTANCE_PERCENT`, `CC_MAX_STOPLOSS_DISTANCE_PERCENT` |
| **Economic Viability** | TP distance must cover slippage + fees + minimum profit | Calculated by `ConfigValidationService` |
| **Time Constraints** | `minuteEstimatedTime` must be > 0 and < `CC_MAX_SIGNAL_LIFETIME_MINUTES` | Default: 1440 minutes (1 day) |

---

## Interval Throttling

The `interval` property controls the minimum time between `getSignal` invocations. This prevents signal spam and reduces computational overhead during strategy execution.

### SignalInterval Type

```typescript
type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
```

![Mermaid Diagram](./diagrams\12-defining-strategies_3.svg)

**Interval Behavior:**
- `ClientStrategy` tracks `_lastSignalTime` for each symbol
- On each tick, checks if `(currentTime - _lastSignalTime) >= interval`
- If throttled, skips `getSignal` and returns current signal state (idle/active/closed)
- If allowed, calls `getSignal` and updates `_lastSignalTime`

### Choosing an Interval

| Interval | Use Case | Tick Frequency (Live Mode) |
|----------|----------|---------------------------|
| `"1m"` | High-frequency strategies, scalping | Every 61 seconds |
| `"5m"` | Medium-frequency, momentum strategies | Every 61 seconds (checks every 5 minutes) |
| `"15m"` | Swing trading, trend following | Every 61 seconds (checks every 15 minutes) |
| `"1h"` | Position trading, low-frequency | Every 61 seconds (checks every hour) |

**Note:** Live mode ticks occur every `TICK_TTL` (61 seconds) regardless of interval. The interval only controls how often `getSignal` is invoked during those ticks.

---

## Lifecycle Callbacks

The `callbacks` property provides event hooks for monitoring strategy execution. All callbacks are optional and receive consistent parameters.

### Available Callbacks

![Mermaid Diagram](./diagrams\12-defining-strategies_4.svg)

### Callback Parameters

| Callback | Parameters | When Called |
|----------|-----------|-------------|
| `onTick` | `(symbol, result, backtest)` | Every tick, with full tick result |
| `onOpen` | `(symbol, data, currentPrice, backtest)` | Signal opened at `currentPrice` |
| `onActive` | `(symbol, data, currentPrice, backtest)` | Signal being monitored (each tick) |
| `onIdle` | `(symbol, currentPrice, backtest)` | No active signal exists |
| `onClose` | `(symbol, data, priceClose, backtest)` | Signal closed at `priceClose` |
| `onSchedule` | `(symbol, data, currentPrice, backtest)` | Scheduled signal created |
| `onCancel` | `(symbol, data, currentPrice, backtest)` | Scheduled signal cancelled |
| `onWrite` | `(symbol, data, backtest)` | State persisted to disk (live mode) |
| `onPartialProfit` | `(symbol, data, currentPrice, revenuePercent, backtest)` | Profit milestone reached (10%, 20%, etc.) |
| `onPartialLoss` | `(symbol, data, currentPrice, lossPercent, backtest)` | Loss milestone reached (-10%, -20%, etc.) |

**Common Parameters:**
- `symbol`: Trading pair (e.g., "BTCUSDT")
- `data`: `ISignalRow` with signal details (id, prices, timestamps)
- `currentPrice`: Current VWAP price from `ClientExchange.getAveragePrice()`
- `backtest`: `true` for backtest mode, `false` for live mode

### Callback Example

```typescript
addStrategy({
  strategyName: "monitored-strategy",
  interval: "5m",
  getSignal: async (symbol, when) => {
    // ... signal logic
  },
  callbacks: {
    onTick: (symbol, result, backtest) => {
      console.log(`[TICK] ${symbol} action=${result.action}`);
    },
    
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[OPEN] ${symbol} signal=${signal.id} price=${currentPrice}`);
      // Log to external monitoring system
      logToMonitoring("signal_opened", { symbol, signalId: signal.id, currentPrice });
    },
    
    onActive: (symbol, signal, currentPrice, backtest) => {
      // Monitor signal progress
      const pnl = calculatePnL(signal, currentPrice);
      if (Math.abs(pnl) > 5) {
        console.log(`[ACTIVE] ${symbol} signal=${signal.id} pnl=${pnl}%`);
      }
    },
    
    onClose: (symbol, signal, priceClose, backtest) => {
      const duration = (Date.now() - signal.pendingAt) / 60000;
      console.log(`[CLOSE] ${symbol} signal=${signal.id} price=${priceClose} duration=${duration}m`);
      // Update external tracking
      logToMonitoring("signal_closed", { symbol, signalId: signal.id, priceClose, duration });
    },
    
    onPartialProfit: (symbol, signal, currentPrice, revenuePercent, backtest) => {
      console.log(`[PROFIT] ${symbol} signal=${signal.id} revenue=${revenuePercent}%`);
      // Adjust external trailing stops or alerts
    },
    
    onPartialLoss: (symbol, signal, currentPrice, lossPercent, backtest) => {
      console.log(`[LOSS] ${symbol} signal=${signal.id} loss=${lossPercent}%`);
      // Send alert if loss exceeds threshold
      if (Math.abs(lossPercent) > 15) {
        sendAlert(`High loss detected: ${symbol} at ${lossPercent}%`);
      }
    },
  },
});
```

---

## Risk Integration

Strategies can integrate with the risk management system by specifying `riskName` or `riskList` in the schema. This enables portfolio-level validation before signals are opened.

### Single Risk Profile

```typescript
addStrategy({
  strategyName: "conservative-trend",
  interval: "15m",
  riskName: "conservative", // Single risk profile
  getSignal: async (symbol, when) => {
    // ... signal logic
  },
});
```

### Multiple Risk Profiles

```typescript
addStrategy({
  strategyName: "multi-check-strategy",
  interval: "5m",
  riskList: ["max-positions", "drawdown-limit", "correlation-check"], // Multiple risk profiles
  getSignal: async (symbol, when) => {
    // ... signal logic
  },
});
```

**Risk Check Flow:**
1. `getSignal` returns `ISignalDto`
2. `ClientStrategy` validates signal structure
3. If `riskName` or `riskList` present, calls `ClientRisk.checkSignal()`
4. `ClientRisk` runs all validations from specified risk profiles
5. If any validation throws, signal is rejected and `riskSubject` emits event
6. If all validations pass, signal proceeds to opened/scheduled state

---

## Signal Types: Immediate vs Scheduled

Signals can be either **immediate** (open at current price) or **scheduled** (wait for price to reach `priceOpen`). This is determined by the presence of the `priceOpen` field in `ISignalDto`.

![Mermaid Diagram](./diagrams\12-defining-strategies_5.svg)

### Immediate Signal Example

```typescript
getSignal: async (symbol, when) => {
  return {
    position: "long",
    // priceOpen omitted - opens immediately at current price
    priceTakeProfit: 52000,
    priceStopLoss: 48000,
    minuteEstimatedTime: 120,
  };
}
```

### Scheduled Signal Example

```typescript
getSignal: async (symbol, when) => {
  return {
    position: "long",
    priceOpen: 50500, // Wait for price to reach 50500
    priceTakeProfit: 52000,
    priceStopLoss: 48000,
    minuteEstimatedTime: 120,
    note: "Wait for breakout confirmation at 50500",
  };
}
```

**Scheduled Signal Behavior:**
- Signal created in `scheduled` state with `_isScheduled = true`
- `ClientStrategy.backtest()` monitors each candle for price touching `priceOpen`
- If long: activation when `candle.low <= priceOpen`
- If short: activation when `candle.high >= priceOpen`
- On activation: converts to opened signal, calls `onOpen`, begins TP/SL monitoring
- If not activated within `CC_SCHEDULE_AWAIT_MINUTES`, calls `onCancel` and removes signal

---

## Complete Strategy Definition Example

```typescript
import { addStrategy, getCandles, getAveragePrice } from "backtest-kit";

addStrategy({
  // Basic identification
  strategyName: "rsi-momentum",
  note: "Enters on RSI oversold with volume confirmation",
  
  // Throttling configuration
  interval: "5m", // Check for signals every 5 minutes
  
  // Signal generation logic
  getSignal: async (symbol: string, when: Date) => {
    // Fetch historical data
    const candles = await getCandles(symbol, "15m", 50);
    const currentPrice = await getAveragePrice(symbol);
    
    // Calculate indicators
    const rsi = calculateRSI(candles, 14);
    const volume = candles[candles.length - 1].volume;
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    
    // Entry conditions
    const isOversold = rsi < 30;
    const isVolumeConfirmed = volume > avgVolume * 1.5;
    
    if (!isOversold || !isVolumeConfirmed) {
      return null; // No signal
    }
    
    // Calculate targets
    const atr = calculateATR(candles, 14);
    const stopDistance = atr * 2;
    const profitDistance = atr * 3;
    
    return {
      position: "long",
      // Immediate entry (no priceOpen)
      priceTakeProfit: currentPrice + profitDistance,
      priceStopLoss: currentPrice - stopDistance,
      minuteEstimatedTime: 240, // 4 hours
      note: `RSI=${rsi.toFixed(2)} Volume=${(volume/avgVolume).toFixed(2)}x`,
    };
  },
  
  // Risk management integration
  riskName: "conservative",
  
  // Lifecycle event monitoring
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`[OPEN] ${symbol} @ ${currentPrice}`);
      console.log(`  TP: ${signal.priceTakeProfit} (+${((signal.priceTakeProfit/currentPrice - 1) * 100).toFixed(2)}%)`);
      console.log(`  SL: ${signal.priceStopLoss} (${((signal.priceStopLoss/currentPrice - 1) * 100).toFixed(2)}%)`);
      
      if (!backtest) {
        // Log to external monitoring in live mode
        logToDatabase({ event: "signal_opened", symbol, signal, currentPrice });
      }
    },
    
    onActive: (symbol, signal, currentPrice, backtest) => {
      // Monitor progress (called every tick)
      const pnl = ((currentPrice / signal.priceOpen) - 1) * 100;
      if (Math.abs(pnl) > 3) {
        console.log(`[ACTIVE] ${symbol} PNL: ${pnl.toFixed(2)}%`);
      }
    },
    
    onClose: (symbol, signal, priceClose, backtest) => {
      const pnl = ((priceClose / signal.priceOpen) - 1) * 100;
      const duration = (Date.now() - signal.pendingAt) / 60000;
      
      console.log(`[CLOSE] ${symbol} @ ${priceClose}`);
      console.log(`  PNL: ${pnl.toFixed(2)}%`);
      console.log(`  Duration: ${duration.toFixed(0)} minutes`);
      
      if (!backtest) {
        // Update external tracking
        logToDatabase({ event: "signal_closed", symbol, signal, priceClose, pnl, duration });
      }
    },
    
    onPartialProfit: (symbol, signal, currentPrice, revenuePercent, backtest) => {
      console.log(`[PROFIT] ${symbol} reached ${revenuePercent}% profit`);
      // Could adjust trailing stops or send alerts
    },
    
    onPartialLoss: (symbol, signal, currentPrice, lossPercent, backtest) => {
      console.log(`[LOSS] ${symbol} reached ${lossPercent}% loss`);
      if (Math.abs(lossPercent) > 15 && !backtest) {
        sendAlert(`High loss: ${symbol} at ${lossPercent}%`);
      }
    },
  },
});
```

