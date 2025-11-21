# Real-time Monitoring

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/client/ClientExchange.ts](src/client/ClientExchange.ts)
- [src/client/ClientFrame.ts](src/client/ClientFrame.ts)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/helpers/toProfitLossDto.ts](src/helpers/toProfitLossDto.ts)
- [src/interfaces/Frame.interface.ts](src/interfaces/Frame.interface.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)

</details>



## Purpose and Scope

This document describes how the backtest-kit framework monitors active trading signals in real-time by continuously checking market prices against take profit (TP), stop loss (SL), and time expiration conditions. This monitoring occurs during the "active" state of the signal lifecycle and determines when signals should close.

For information about the complete signal lifecycle and state transitions, see [Signal Lifecycle](#6). For details on how signals are generated and validated, see [Signal Generation and Validation](#6.2). For PnL calculation specifics, see [PnL Calculation](#6.4).

---

## Signal Monitoring States

When a signal is opened, it enters an "active" monitoring phase where the system continuously evaluates whether closing conditions have been met. The monitoring logic differs between backtest and live modes but follows the same core principles.

### State Transition Overview

![Mermaid Diagram](./diagrams\35_Real-time_Monitoring_0.svg)

**Monitoring Flow in ClientStrategy.tick()**

During the active state, the `tick()` method performs these checks on each invocation:

1. **Fetch Current Price**: Calls `ClientExchange.getAveragePrice()` to get VWAP
2. **Check Time Expiration**: Compares `Date.now()` against signal timestamp + duration
3. **Check Take Profit**: Compares VWAP against `priceTakeProfit` (direction-dependent)
4. **Check Stop Loss**: Compares VWAP against `priceStopLoss` (direction-dependent)
5. **Close or Continue**: Either closes signal with reason, or returns active result

Sources: [src/client/ClientStrategy.ts:258-464]()

---

## Monitoring Conditions

The framework evaluates three distinct conditions that can trigger signal closure. Each condition has position-specific logic for long vs short trades.

### Condition Evaluation Table

| Condition | Long Position | Short Position | Close Reason |
|-----------|--------------|----------------|--------------|
| **Take Profit** | `averagePrice >= priceTakeProfit` | `averagePrice <= priceTakeProfit` | `"take_profit"` |
| **Stop Loss** | `averagePrice <= priceStopLoss` | `averagePrice >= priceStopLoss` | `"stop_loss"` |
| **Time Expired** | `when.getTime() >= signal.timestamp + signal.minuteEstimatedTime * 60 * 1000` | Same | `"time_expired"` |

### Implementation Details

**Time Expiration Check**

```typescript
// Excerpt from ClientStrategy.tick()
const signalEndTime = signal.timestamp + signal.minuteEstimatedTime * 60 * 1000;
if (when.getTime() >= signalEndTime) {
    shouldClose = true;
    closeReason = "time_expired";
}
```

This check occurs first and takes priority. The signal's `timestamp` field records when it was created, and `minuteEstimatedTime` defines the maximum duration.

Sources: [src/client/ClientStrategy.ts:343-349]()

**Long Position TP/SL Logic**

```typescript
if (signal.position === "long") {
    if (averagePrice >= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
    } else if (averagePrice <= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
    }
}
```

For long positions:
- Take profit triggers when price rises above target
- Stop loss triggers when price falls below threshold

Sources: [src/client/ClientStrategy.ts:351-360]()

**Short Position TP/SL Logic**

```typescript
if (signal.position === "short") {
    if (averagePrice <= signal.priceTakeProfit) {
        shouldClose = true;
        closeReason = "take_profit";
    } else if (averagePrice >= signal.priceStopLoss) {
        shouldClose = true;
        closeReason = "stop_loss";
    }
}
```

For short positions:
- Take profit triggers when price falls below target
- Stop loss triggers when price rises above threshold

Sources: [src/client/ClientStrategy.ts:362-371]()

---

## VWAP-Based Price Monitoring

The framework uses Volume Weighted Average Price (VWAP) as the current market price for all monitoring decisions. This provides a more accurate representation of market conditions than simple spot prices.

### VWAP Calculation Flow

![Mermaid Diagram](./diagrams\35_Real-time_Monitoring_1.svg)

### VWAP Implementation

The `ClientExchange.getAveragePrice()` method implements VWAP calculation:

1. **Fetch Recent Candles**: Retrieves last 5 one-minute candles
2. **Calculate Typical Price**: For each candle: `(high + low + close) / 3`
3. **Weight by Volume**: `sum(typicalPrice * volume)`
4. **Normalize**: Divide by total volume
5. **Fallback**: If volume is zero, uses simple average of close prices

Sources: [src/client/ClientExchange.ts:172-203]()

### Why VWAP?

VWAP provides several advantages for monitoring:

- **Volume Weighting**: Reflects actual trading activity, not just price movements
- **Noise Reduction**: Smooths out short-term price spikes
- **Realistic Execution**: Better approximates actual fill prices
- **Market Depth**: Incorporates information from high/low/close range

The 5-candle window provides a 5-minute rolling average, balancing responsiveness with stability.

Sources: [src/client/ClientExchange.ts:185-202]()

---

## Signal Closure Process

When a monitoring condition is met, the framework executes a multi-step closure process that includes PnL calculation, persistence updates, callback invocation, and result streaming.

### Closure Sequence Diagram

![Mermaid Diagram](./diagrams\35_Real-time_Monitoring_2.svg)

### Closure Implementation Steps

**Step 1: PnL Calculation**

When closure conditions are met, the framework calculates profit/loss with realistic fees and slippage:

```typescript
const pnl = toProfitLossDto(signal, averagePrice);
```

The `toProfitLossDto()` helper applies:
- **Slippage**: 0.1% on entry and exit (worse execution simulation)
- **Fees**: 0.1% per transaction (0.2% total)

Sources: [src/client/ClientStrategy.ts:375](), [src/helpers/toProfitLossDto.ts:44-90]()

**Step 2: Loss Warning Logs**

The system logs warnings for unprofitable closures:

```typescript
if (closeReason === "stop_loss") {
    this.params.logger.warn(
        `ClientStrategy tick: Signal closed with loss (stop_loss), PNL: ${pnl.pnlPercentage.toFixed(2)}%`
    );
}

if (closeReason === "time_expired" && pnl.pnlPercentage < 0) {
    this.params.logger.warn(
        `ClientStrategy tick: Signal closed with loss (time_expired), PNL: ${pnl.pnlPercentage.toFixed(2)}%`
    );
}
```

Sources: [src/client/ClientStrategy.ts:379-394]()

**Step 3: Callback Invocation**

User-defined callbacks receive closure notifications:

```typescript
if (this.params.callbacks?.onClose) {
    this.params.callbacks.onClose(
        this.params.execution.context.symbol,
        signal,
        averagePrice,
        this.params.execution.context.backtest
    );
}
```

Sources: [src/client/ClientStrategy.ts:405-412]()

**Step 4: Persistence Update**

The pending signal is cleared atomically:

```typescript
await this.setPendingSignal(null);
```

In live mode, this writes `null` to disk via `PersistSignalAdapter`, ensuring crash recovery won't resurrect the closed signal.

Sources: [src/client/ClientStrategy.ts:414]()

**Step 5: Result Construction**

A `IStrategyTickResultClosed` object is created and returned:

```typescript
const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: signal,
    currentPrice: averagePrice,
    closeReason: closeReason,
    closeTimestamp: closeTimestamp,
    pnl: pnl,
    strategyName: this.params.method.context.strategyName,
    exchangeName: this.params.method.context.exchangeName,
};
```

Sources: [src/client/ClientStrategy.ts:416-425](), [src/interfaces/Strategy.interface.ts:181-198]()

---

## Active State Result

If no closing conditions are met, the `tick()` method returns an `IStrategyTickResultActive` object indicating the signal is still being monitored.

### Active State Flow

![Mermaid Diagram](./diagrams\35_Real-time_Monitoring_3.svg)

### Active Result Structure

When monitoring continues without closure:

```typescript
const result: IStrategyTickResultActive = {
    action: "active",
    signal: signal,
    currentPrice: averagePrice,
    strategyName: this.params.method.context.strategyName,
    exchangeName: this.params.method.context.exchangeName,
};
```

The `onActive` callback fires if configured:

```typescript
if (this.params.callbacks?.onActive) {
    this.params.callbacks.onActive(
        this.params.execution.context.symbol,
        signal,
        averagePrice,
        this.params.execution.context.backtest
    );
}
```

Sources: [src/client/ClientStrategy.ts:438-463](), [src/interfaces/Strategy.interface.ts:164-175]()

### Live Mode Filtering

In live trading, `LiveLogicPrivateService` filters out active results to reduce noise:

```typescript
// Only opened and closed results are yielded in live mode
if (result.action === "opened" || result.action === "closed") {
    yield result;
}
```

This prevents flooding the user with continuous monitoring updates every minute. Backtest mode yields all states for analysis.

---

## Backtest Monitoring (Fast-Forward)

Backtesting uses an optimized monitoring approach that processes historical candles in batch rather than simulating each timestamp individually.

### Backtest Monitoring Flow

![Mermaid Diagram](./diagrams\35_Real-time_Monitoring_4.svg)

### Fast-Forward Implementation

The `ClientStrategy.backtest()` method implements fast-forward monitoring:

**Candle Iteration**

```typescript
// Start at index 4 (5th candle) for VWAP calculation
for (let i = 4; i < candles.length; i++) {
    // Get last 5 candles for current timepoint
    const recentCandles = candles.slice(i - 4, i + 1);
    const averagePrice = GET_AVG_PRICE_FN(recentCandles);
    
    // Check TP/SL conditions
    // ...
}
```

Starting at index 4 ensures there are always 5 candles available for VWAP calculation.

Sources: [src/client/ClientStrategy.ts:512-598]()

**Early Exit on TP/SL**

When take profit or stop loss is hit, the method immediately returns without processing remaining candles:

```typescript
if (shouldClose) {
    const pnl = toProfitLossDto(signal, averagePrice);
    const closeTimestamp = recentCandles[recentCandles.length - 1].timestamp;
    
    // ... logging and callbacks ...
    
    await this.setPendingSignal(null);
    return result; // Early exit
}
```

Sources: [src/client/ClientStrategy.ts:543-597]()

**Time Expiration Fallback**

If no TP/SL is hit after iterating all candles:

```typescript
// Use last 5 candles for final VWAP
const lastFiveCandles = candles.slice(-5);
const lastPrice = GET_AVG_PRICE_FN(lastFiveCandles);

const pnl = toProfitLossDto(signal, lastPrice);

const result: IStrategyTickResultClosed = {
    action: "closed",
    signal: signal,
    currentPrice: lastPrice,
    closeReason: "time_expired",
    // ...
};
```

Sources: [src/client/ClientStrategy.ts:600-646]()

### Performance Benefits

The backtest fast-forward approach provides significant performance advantages:

| Aspect | Real-time Tick Simulation | Fast-Forward Backtest |
|--------|---------------------------|----------------------|
| **Candles Processed** | 1 per tick (1 per minute) | Batch of N candles |
| **Network Calls** | N calls to exchange | 1 call for entire duration |
| **Memory** | Minimal (streaming) | Small (candle array) |
| **Speed** | Slow (1 call per minute) | Fast (array iteration) |

For a 60-minute signal, fast-forward processes 60 candles in one batch instead of making 60 separate exchange calls.

---

## Monitoring Accuracy and Trade-offs

The framework balances accuracy with performance through several design choices:

### VWAP Window Size

**Current**: 5 one-minute candles (5-minute rolling window)

**Trade-offs**:
- Smaller window: More responsive to price changes, more noise
- Larger window: Smoother but less responsive, may miss quick TP/SL hits

The 5-candle window was chosen to balance real-time responsiveness with stability.

Sources: [src/client/ClientExchange.ts:177]()

### Slippage and Fees

**Current**: 0.1% slippage + 0.2% total fees (0.1% entry + 0.1% exit)

**Purpose**: Simulates realistic execution costs

These values are conservative estimates for liquid cryptocurrency markets. Less liquid markets may experience higher slippage.

Sources: [src/helpers/toProfitLossDto.ts:7-13]()

### Backtest Candle Resolution

**Current**: 1-minute candles

**Limitation**: Cannot detect intra-minute TP/SL hits

If price briefly hits TP/SL mid-candle but closes elsewhere, the backtest won't detect it. Using tick data would be more accurate but significantly slower.

---

## Error Handling and Edge Cases

The monitoring system handles several edge cases to ensure robustness:

### No Candle Data

If `ClientExchange.getAveragePrice()` receives no candles:

```typescript
if (candles.length === 0) {
    throw new Error(
        `ClientExchange getAveragePrice: no candles data for symbol=${symbol}`
    );
}
```

This prevents NaN values from propagating through monitoring logic.

Sources: [src/client/ClientExchange.ts:179-183]()

### Zero Volume Candles

If all candles have zero volume (unusual but possible):

```typescript
if (totalVolume === 0) {
    // Fallback to simple average of close prices
    const sum = candles.reduce((acc, candle) => acc + candle.close, 0);
    return sum / candles.length;
}
```

This ensures VWAP calculation always returns a valid price.

Sources: [src/client/ClientExchange.ts:194-198]()

### Insufficient Backtest Candles

If fewer than 5 candles are available for backtest VWAP:

```typescript
if (candles.length < 5) {
    this.params.logger.warn(
        `ClientStrategy backtest: Expected at least 5 candles for VWAP, got ${candles.length}`
    );
}
```

The method logs a warning but continues processing with available data.

Sources: [src/client/ClientStrategy.ts:504-508]()

### Context Validation

The backtest method validates it's running in backtest mode:

```typescript
if (!this.params.execution.context.backtest) {
    throw new Error("ClientStrategy backtest: running in live context");
}
```

This prevents accidental fast-forward execution in live trading.

Sources: [src/client/ClientStrategy.ts:499-501]()

---

## Monitoring Configuration

Users configure monitoring behavior through the strategy schema and signal generation:

### Strategy Schema Callbacks

```typescript
interface IStrategyCallbacks {
    onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
    onClose: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => void;
    // ...
}
```

These callbacks receive notifications during monitoring and closure.

Sources: [src/interfaces/Strategy.interface.ts:74-91]()

### Signal Parameters

The `ISignalDto` returned by `getSignal()` controls monitoring behavior:

```typescript
interface ISignalDto {
    position: "long" | "short";          // Determines TP/SL direction
    priceOpen: number;                   // Entry price (for reference)
    priceTakeProfit: number;             // TP threshold
    priceStopLoss: number;               // SL threshold
    minuteEstimatedTime: number;         // Time expiration duration
}
```

All monitoring decisions flow from these five parameters.

Sources: [src/interfaces/Strategy.interface.ts:22-37]()

---

## Summary

The real-time monitoring system in backtest-kit provides continuous evaluation of active signals through VWAP-based price tracking and condition checking. Key characteristics:

- **VWAP Pricing**: 5-minute rolling average for stable price representation
- **Three Conditions**: Take profit, stop loss, and time expiration
- **Position-Aware**: Different logic for long vs short trades
- **Dual Modes**: Real-time tick monitoring (live) and fast-forward batch processing (backtest)
- **Crash-Safe**: Atomically persists state changes before yielding results
- **Realistic Costs**: Includes slippage and fees in PnL calculations

The monitoring loop executes in `ClientStrategy.tick()` for live trading and `ClientStrategy.backtest()` for backtesting, with both implementations sharing core logic for TP/SL/time condition evaluation.

Sources: [src/client/ClientStrategy.ts:258-656]()