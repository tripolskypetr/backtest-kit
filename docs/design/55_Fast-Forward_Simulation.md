---
title: design/55_fast-forward_simulation
group: design
---

# Fast-Forward Simulation

## Purpose and Scope

Fast-forward simulation is the core optimization that enables efficient backtesting. Instead of calling `ClientStrategy.tick()` at every timeframe timestamp, the framework calls `ClientStrategy.backtest()` once per signal with a pre-fetched array of future candles. This method processes the entire signal lifecycle in a single pass through the candle array.

This page documents:
- The `backtest()` method implementation in `ClientStrategy`
- Candle array processing via `PROCESS_PENDING_SIGNAL_CANDLES_FN` and `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN`
- Future data fetching via `ExchangeGlobalService.getNextCandles()`
- Skip-ahead optimization in `BacktestLogicPrivateService`
- VWAP calculation using `GET_AVG_PRICE_FN`

**Key Benefits:**
- **Performance**: 100-1000x faster than tick-by-tick (processes ~100 signals vs ~43,000 ticks per month)
- **Determinism**: Uses `candle.high`/`candle.low` for exact TP/SL detection
- **Memory Efficiency**: Streams results via `AsyncGenerator`, no intermediate state accumulation
- **Accuracy**: VWAP calculation accounts for volume-weighted intra-candle movements


---

## Fast-Forward vs. Tick-by-Tick Execution

The framework supports two execution modes for strategy evaluation:

| Mode | Method | Use Case | Time Progression | Result Type |
|------|--------|----------|------------------|-------------|
| **Tick** | `strategy.tick()` | Live trading | Real-time (`Date.now()`) | `IStrategyTickResult` (idle/opened/active/closed) |
| **Backtest** | `strategy.backtest(candles)` | Historical simulation | Fast-forward via candle array | `IStrategyBacktestResult` (closed/cancelled) |

**Backtest Execution Flow**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_0.svg)


---

## Core Backtest Method

The `ClientStrategy.backtest()` method processes a signal's complete lifecycle using a pre-fetched candle array. It iterates through candles checking for activation (scheduled signals) and closure conditions (TP/SL/time expiration).

**Method Signature:**

```typescript
// From IStrategy interface
backtest: (
  symbol: string,
  strategyName: StrategyName,
  candles: ICandleData[]
) => Promise<IStrategyBacktestResult>
```

**Return Types:**
- `IStrategyTickResultClosed`: Signal closed via `take_profit`, `stop_loss`, or `time_expired`
- `IStrategyTickResultCancelled`: Scheduled signal cancelled before activation

**Signal Lifecycle Processing Flow**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_1.svg)


---

## Candle-Based TP/SL Detection

Fast-forward simulation achieves accuracy by checking Take Profit and Stop Loss conditions against **candle high/low prices** rather than just close prices. This captures intra-candle price movements.

**Detection Logic for Long Positions:**

```typescript
// PROCESS_PENDING_SIGNAL_CANDLES_FN logic
if (signal.position === "long") {
  if (currentCandle.high >= signal.priceTakeProfit) {
    closeReason = "take_profit";
    // Use exact TP price, not candle high
  } else if (currentCandle.low <= signal.priceStopLoss) {
    closeReason = "stop_loss";
    // Use exact SL price, not candle low
  }
}
```

**Detection Logic for Short Positions:**

```typescript
if (signal.position === "short") {
  if (currentCandle.low <= signal.priceTakeProfit) {
    closeReason = "take_profit";
  } else if (currentCandle.high >= signal.priceStopLoss) {
    closeReason = "stop_loss";
  }
}
```

**Price Resolution Diagram:**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_2.svg)

**Key Implementation Details:**

1. **Exact Price Usage**: When TP/SL is hit, the result uses the exact `priceTakeProfit` or `priceStopLoss` value, not the candle's high/low. This ensures consistent PNL calculations.

2. **Priority Order**: Time expiration is checked first, then TP/SL. If `minuteEstimatedTime` expires, the signal closes at current VWAP price regardless of TP/SL proximity.

3. **VWAP Calculation**: Average price is calculated using volume-weighted average of recent candles (controlled by `CC_AVG_PRICE_CANDLES_COUNT`).


---

## VWAP-Based Average Price Calculation

The framework calculates Volume-Weighted Average Price (VWAP) for each candle to determine current market conditions. This provides more accurate pricing than simple close price.

**VWAP Formula:**

```typescript
const GET_AVG_PRICE_FN = (candles: ICandleData[]): number => {
  const sumPriceVolume = candles.reduce((acc, c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    return acc + typicalPrice * c.volume;
  }, 0);

  const totalVolume = candles.reduce((acc, c) => acc + c.volume, 0);

  return totalVolume === 0
    ? candles.reduce((acc, c) => acc + c.close, 0) / candles.length
    : sumPriceVolume / totalVolume;
};
```

**VWAP Calculation Process**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_3.svg)

**Window Size and Usage:**

The VWAP window size is configured via `GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT` (default: 5).

```typescript
// From PROCESS_PENDING_SIGNAL_CANDLES_FN
const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;

for (let i = candlesCount - 1; i < candles.length; i++) {
  // Sliding window: always use last N candles
  const recentCandles = candles.slice(i - (candlesCount - 1), i + 1);
  const averagePrice = GET_AVG_PRICE_FN(recentCandles);
  
  // Check TP/SL against averagePrice
}
```


---

## Scheduled Signal Processing

Scheduled signals require a two-phase fast-forward simulation: first monitoring for price activation (or cancellation), then monitoring TP/SL if activated.

**Two-Phase Process Diagram:**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_4.svg)

**Phase 1: Activation Monitoring (`PROCESS_SCHEDULED_SIGNAL_CANDLES_FN`)**

This function iterates through candles looking for:
1. **Timeout**: `candle.timestamp - scheduled.scheduledAt >= CC_SCHEDULE_AWAIT_MINUTES`
2. **Stop Loss Hit**: Price moves against position before activation
3. **Price Activation**: Price reaches `priceOpen`

**Priority Logic:**

```typescript
// Timeout checked FIRST
const elapsedTime = candle.timestamp - scheduled.scheduledAt;
if (elapsedTime >= maxTimeToWait) {
  return { cancelled: true, result: CancelledResult };
}

// Then check SL (cancel prioritized over activation)
if (scheduled.position === "long") {
  if (candle.low <= scheduled.priceStopLoss) {
    shouldCancel = true;
  } else if (candle.low <= scheduled.priceOpen) {
    shouldActivate = true;
  }
}
```

**Phase 2: TP/SL Monitoring**

If the scheduled signal activates, the function:
1. Updates `pendingAt` to activation timestamp
2. Adds signal to risk tracker
3. Continues processing remaining candles for TP/SL detection

**Future Candle Fetching Strategy:**

`BacktestLogicPrivateService` calculates candle count based on signal type:

```typescript
// For opened signals (immediate entry)
const candles = await exchangeGlobalService.getNextCandles(
  symbol,
  "1m",
  tickResult.signal.minuteEstimatedTime,
  when,
  true
);

// For scheduled signals (delayed entry)
const candles = await exchangeGlobalService.getNextCandles(
  symbol,
  "1m",
  GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES + tickResult.signal.minuteEstimatedTime + 1,
  when,
  true
);
```

**Candle Count Rationale:**

| Signal Type | Candles Needed | Reason |
|-------------|----------------|--------|
| Opened | `minuteEstimatedTime` | Signal already active, only need TP/SL monitoring duration |
| Scheduled | `CC_SCHEDULE_AWAIT_MINUTES + minuteEstimatedTime + 1` | Need activation window + TP/SL duration + 1 for inclusive range |


---

## Pending Signal Processing

For immediate signals (no `priceOpen` specified) or after scheduled signal activation, the framework processes the pending signal by monitoring TP/SL conditions.

**Processing Flow (`PROCESS_PENDING_SIGNAL_CANDLES_FN`):**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_5.svg)

**Critical Timing Detail:**

The `minuteEstimatedTime` countdown starts from `signal.pendingAt`, **not** `signal.scheduledAt`. This distinction is critical for scheduled signals where activation occurs after creation:

```typescript
// Time expiration check uses pendingAt
const signalTime = signal.pendingAt; // NOT scheduledAt!
const maxTimeToWait = signal.minuteEstimatedTime * 60 * 1000;
const elapsedTime = currentCandleTimestamp - signalTime;

if (elapsedTime >= maxTimeToWait) {
  shouldClose = true;
  closeReason = "time_expired";
}
```

**Why This Matters:**

For a scheduled signal:
- `scheduledAt`: Timestamp when signal was created
- `pendingAt`: Timestamp when price reached `priceOpen` and position activated

If `minuteEstimatedTime` counted from `scheduledAt`, the signal would close prematurely, incurring trading fees without adequate time to reach TP.


---

## Integration with Backtest Execution

The fast-forward mechanism integrates tightly with `BacktestLogicPrivateService`, which orchestrates the backtest loop.

**Execution Context and Skip-Ahead Flow**

![Mermaid Diagram](./diagrams/55_Fast-Forward_Simulation_6.svg)

**Skip-Ahead Optimization Logic:**

After `backtest()` completes, `BacktestLogicPrivateService` advances the loop counter to skip all intermediate timeframes:

```typescript
// From BacktestLogicPrivateService.run()
const backtestResult = await strategyGlobalService.backtest(
  symbol,
  strategyName,
  frameName,
  candles,
  when,
  true
);

// Skip ahead to closeTimestamp
while (
  i < timeframes.length &&
  timeframes[i].getTime() < backtestResult.closeTimestamp
) {
  i++;
}

yield backtestResult;
```

This prevents thousands of redundant `tick()` calls during the signal's active period.


---

## Performance Characteristics

Fast-forward simulation provides significant performance advantages over tick-by-tick iteration:

**Performance Comparison:**

| Aspect | Tick-by-Tick | Fast-Forward | Improvement |
|--------|--------------|--------------|-------------|
| **Function Calls** | O(timeframes) = 1440 calls/day | O(signals) ≈ 10-100 calls/day | 10-100x reduction |
| **Candle Fetches** | None (uses frame timestamps) | 1 per signal | Batch fetch efficiency |
| **State Management** | Persist every tick (live) | No persistence (backtest) | No I/O overhead |
| **Memory Usage** | 1 timestamp at a time | N candles (typically 30-1440) | Minimal impact |

**Timing Metrics:**

The framework emits performance events via `performanceEmitter` to track execution times:

```typescript
// Tracked metric types
"backtest_total"      // Total backtest duration
"backtest_timeframe"  // Single timeframe processing
"backtest_signal"     // Single signal backtest() call
"live_tick"           // Single tick() call in live mode
```

**Example Measurements:**

For a 30-day backtest with 15-minute signals:
- **Tick-by-tick**: ~43,200 tick calls (30 days × 24 hours × 60 minutes)
- **Fast-forward**: ~100 backtest calls (assuming ~3 signals/day)
- **Speedup**: ~430x fewer function calls


---

## Determinism and Reproducibility

Fast-forward simulation produces deterministic results because:

1. **Fixed Candle Data**: Backtests use historical data from `Frame.getTimeframe()`, which returns a static array
2. **Timestamp Progression**: Time advances in discrete intervals (frame timestamps), not real-time
3. **No External State**: All state is encapsulated in `ClientStrategy` instance
4. **Exact Price Matching**: TP/SL detection uses exact prices, not approximations

**Reproducibility Guarantee:**

Running the same backtest with identical parameters produces identical results:

```typescript
// Same inputs
const config = {
  strategyName: "my-strategy",
  exchangeName: "my-exchange",
  frameName: "2024-backtest",
};

// Run 1
const results1 = await Backtest.run("BTCUSDT", config);

// Run 2
const results2 = await Backtest.run("BTCUSDT", config);

// results1 === results2 (deep equality)
// - Same signals generated
// - Same TP/SL/time_expired outcomes
// - Same PNL percentages
// - Same closeTimestamps
```

This determinism is critical for:
- **Strategy Development**: Iterative testing without environmental noise
- **Walker Optimization**: Fair comparison between strategy variants
- **Regression Testing**: Verify framework changes don't alter outcomes


---

## Code Entity Reference

**Primary Classes and Functions:**

| Entity | Location | Role |
|--------|----------|------|
| `ClientStrategy.backtest()` | [src/client/ClientStrategy.ts:1188-1318]() | Main fast-forward entry point |
| `PROCESS_SCHEDULED_SIGNAL_CANDLES_FN` | [src/client/ClientStrategy.ts:1048-1134]() | Phase 1: Activation monitoring |
| `PROCESS_PENDING_SIGNAL_CANDLES_FN` | [src/client/ClientStrategy.ts:1136-1186]() | Phase 2: TP/SL monitoring |
| `GET_AVG_PRICE_FN` | [src/client/ClientStrategy.ts:285-296]() | VWAP calculation |
| `BacktestLogicPrivateService.run()` | [src/lib/services/logic/private/BacktestLogicPrivateService.ts:59-300]() | Orchestration loop |
| `StrategyConnectionService.backtest()` | [src/lib/services/connection/StrategyConnectionService.ts:132-150]() | DI routing layer |

**Configuration Parameters:**

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `CC_AVG_PRICE_CANDLES_COUNT` | 3 | VWAP window size |
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | Scheduled signal timeout |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 10080 | Maximum signal duration (7 days) |
