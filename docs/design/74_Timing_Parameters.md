# Timing Parameters


## Purpose and Scope

This page documents the three timing configuration parameters that control signal lifecycle timing constraints and price monitoring behavior in the backtest-kit framework. These parameters define temporal boundaries for scheduled signal activation (`CC_SCHEDULE_AWAIT_MINUTES`), maximum signal duration (`CC_MAX_SIGNAL_LIFETIME_MINUTES`), and the window for VWAP price calculation (`CC_AVG_PRICE_CANDLES_COUNT`).

For general configuration management and the `setConfig` function, see [Global Configuration](./72_Global_Configuration.md). For price distance validation parameters (take profit and stop loss constraints), see [Validation Parameters](./73_Validation_Parameters.md). For signal state transitions and lifecycle management, see [Signal Lifecycle Overview](./07_Signal_Lifecycle_Overview.md).

---

## Overview of Timing Parameters

The framework provides three timing parameters that are stored in the `GLOBAL_CONFIG` object and can be modified via `setConfig()`:

| Parameter | Default Value | Unit | Purpose |
|-----------|--------------|------|---------|
| `CC_SCHEDULE_AWAIT_MINUTES` | 120 | minutes | Maximum time to wait for scheduled signal activation before cancellation |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | 1440 | minutes | Maximum signal lifetime to prevent eternal signals blocking risk limits |
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | candles | Number of recent candles used for VWAP calculation in price monitoring |

These parameters affect:
- **Scheduled Signal Lifecycle**: Timeout behavior for signals awaiting price activation
- **Signal Validation**: Rejection of signals with excessive estimated time
- **Price Monitoring**: Window size for VWAP-based average price calculation

**Sources**: [src/config/params.ts:1-36]()

---

## CC_SCHEDULE_AWAIT_MINUTES: Scheduled Signal Timeout

### Description

`CC_SCHEDULE_AWAIT_MINUTES` defines the maximum time (in minutes) that a scheduled signal can wait for price to reach its `priceOpen` activation level before being automatically cancelled. This parameter prevents scheduled signals from blocking risk limits indefinitely when market conditions never trigger activation.

**Default Value**: 120 minutes (2 hours)

### Code Usage

The parameter is consumed in two locations within `ClientStrategy`:

1. **Live Mode Timeout Check** (`CHECK_SCHEDULED_SIGNAL_TIMEOUT_FN`):
   ```typescript
   const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
   const elapsedTime = currentTime - signalTime;
   if (elapsedTime >= maxTimeToWait) {
     // Cancel signal
   }
   ```

2. **Backtest Mode Candle Processing** (`PROCESS_SCHEDULED_SIGNAL_CANDLES_FN`):
   ```typescript
   const maxTimeToWait = GLOBAL_CONFIG.CC_SCHEDULE_AWAIT_MINUTES * 60 * 1000;
   if (elapsedTime >= maxTimeToWait) {
     // Cancel scheduled signal in backtest
   }
   ```

**Sources**: [src/client/ClientStrategy.ts:332-386](), [src/client/ClientStrategy.ts:1048-1134]()

### Timeout Behavior Flow

![Mermaid Diagram](./diagrams/74_Timing_Parameters_0.svg)

**Sources**: [src/client/ClientStrategy.ts:332-386](), [src/client/ClientStrategy.ts:1048-1134]()

### Cancellation vs Activation Priority

When a scheduled signal's timeout period is reached, cancellation takes precedence over price-based activation checks. The framework evaluates timeout **before** checking whether `priceOpen` was reached, ensuring deterministic behavior at the boundary condition.

**Example**: If `CC_SCHEDULE_AWAIT_MINUTES=120` and a scheduled signal has been waiting for 120 minutes, it will be cancelled even if the current candle's price briefly touched `priceOpen`. This prevents ambiguous state where both activation and timeout conditions are met simultaneously.

**Sources**: [src/client/ClientStrategy.ts:1066-1077]()

### Test Validation

The framework includes boundary condition tests that verify exact timeout behavior:

```typescript
// Test: Timeout exactly at CC_SCHEDULE_AWAIT_MINUTES boundary (120min)
// Verifies cancellation occurs at elapsedTime === maxTimeToWait
// Tolerance: ±1 minute
```

The test creates a 121-minute backtest frame where scheduled signal never activates, confirming cancellation occurs precisely at the 120-minute mark.

**Sources**: [test/e2e/defend.test.mjs:444-536]()

---

## CC_MAX_SIGNAL_LIFETIME_MINUTES: Maximum Signal Duration

### Description

`CC_MAX_SIGNAL_LIFETIME_MINUTES` defines the maximum allowed value for `minuteEstimatedTime` in signal generation. This parameter prevents "eternal signals" that would monopolize risk limits for extended periods (days, weeks, or months), effectively deadlocking the strategy.

**Default Value**: 1440 minutes (1 day)

**Rationale**: Signals with excessive lifetimes prevent new trades by permanently occupying risk limit slots. A signal lasting 30+ days blocks concurrent positions and makes the strategy non-operational.

### Validation Flow

The parameter is enforced during signal validation within `VALIDATE_SIGNAL_FN`:

![Mermaid Diagram](./diagrams/74_Timing_Parameters_1.svg)

**Sources**: [src/client/ClientStrategy.ts:160-171]()

### Code Implementation

The validation check in `VALIDATE_SIGNAL_FN`:

```typescript
if (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES && 
    GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
  if (signal.minuteEstimatedTime > GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES) {
    const days = (signal.minuteEstimatedTime / 60 / 24).toFixed(1);
    const maxDays = (GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES / 60 / 24).toFixed(0);
    errors.push(
      `minuteEstimatedTime too large (${signal.minuteEstimatedTime} minutes = ${days} days). ` +
      `Maximum: ${GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES} minutes (${maxDays} days) to prevent strategy deadlock. ` +
      `Eternal signals block risk limits and prevent new trades.`
    );
  }
}
```

**Sources**: [src/client/ClientStrategy.ts:160-171]()

### Impact on Risk Management

Signals with excessive lifetimes create cascading problems:

1. **Risk Limit Deadlock**: Active signals occupy slots in `ClientRisk._activePositions` Map
2. **Strategy Paralysis**: No new signals can be generated if `maxConcurrentPositions` is reached
3. **Capital Inefficiency**: Positions remain open without closure, preventing capital reallocation

**Example Scenario**:
- Risk profile: `maxConcurrentPositions = 3`
- Signal 1: `minuteEstimatedTime = 50000` (34.7 days) - occupies slot for a month
- Signals 2-3: Normal 60-minute signals - fill remaining slots
- Result: Strategy cannot generate new signals for 34+ days even if market conditions are favorable

**Sources**: [src/client/ClientStrategy.ts:160-171]()

### Test Coverage

The sanitize test suite validates rejection of excessive lifetimes:

```typescript
// Test: Excessive minuteEstimatedTime rejected (>30 days)
// Signal with minuteEstimatedTime=50000 (>34 days) must be rejected
// Verifies strategy deadlock prevention
```

**Sources**: [test/e2e/sanitize.test.mjs:250-348]()

---

## CC_AVG_PRICE_CANDLES_COUNT: VWAP Window Size

### Description

`CC_AVG_PRICE_CANDLES_COUNT` specifies the number of recent candles used to calculate the Volume-Weighted Average Price (VWAP) for signal monitoring. This parameter affects price precision in both live tick monitoring and backtest fast-forward simulation.

**Default Value**: 5 candles

**Impact**: Larger values smooth out price volatility but introduce lag. Smaller values respond faster to price changes but are more susceptible to noise.

### VWAP Calculation Implementation

The `GET_AVG_PRICE_FN` function computes VWAP using the most recent N candles:

![Mermaid Diagram](./diagrams/74_Timing_Parameters_2.svg)

**Sources**: [src/client/ClientStrategy.ts:285-296]()

### Code Implementation

The VWAP function with typical price calculation:

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

**Note**: The fallback to simple average (when `totalVolume === 0`) ensures the function never returns NaN, but this should rarely occur with real market data.

**Sources**: [src/client/ClientStrategy.ts:285-296]()

### Usage in Backtest Mode

During backtest fast-forward simulation, the framework maintains a sliding window:

```typescript
// PROCESS_PENDING_SIGNAL_CANDLES_FN
const candlesCount = GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT;

for (let i = candlesCount - 1; i < candles.length; i++) {
  const recentCandles = candles.slice(i - (candlesCount - 1), i + 1);
  const averagePrice = GET_AVG_PRICE_FN(recentCandles);
  // Check TP/SL against averagePrice
}
```

This ensures that TP/SL checks are performed using the same VWAP window as live mode, maintaining consistency between backtesting and live execution.

**Sources**: [src/client/ClientStrategy.ts:1136-1196]()

### Usage in Live Mode

In live trading, `ClientExchange.getAveragePrice` fetches candles and computes VWAP:

```typescript
// Called by ClientStrategy during tick()
const currentPrice = await self.params.exchange.getAveragePrice(
  self.params.execution.context.symbol
);
```

The exchange connection service handles fetching the exact number of candles specified by `CC_AVG_PRICE_CANDLES_COUNT`.

**Sources**: [src/client/ClientStrategy.ts:209-211]()

### Window Size Trade-offs

| Candles | Characteristics | Use Cases |
|---------|----------------|-----------|
| 1-3 | High responsiveness, noisy, sensitive to wicks | High-frequency strategies, scalping |
| 5 (default) | Balanced smoothing, typical for 1m intervals | General strategies, medium-term signals |
| 10-20 | Heavily smoothed, lagging, stable | Conservative strategies, low-volatility assets |

**Important**: The window size interacts with signal interval. A 5-candle window on 1m intervals = 5 minutes of data, but on 5m intervals = 25 minutes of data.

**Sources**: [src/config/params.ts:8-11]()

---

## Configuration via setConfig

All three timing parameters can be modified at runtime using the `setConfig` function:

```typescript
import { setConfig } from 'backtest-kit';

setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 60,        // Reduce timeout to 1 hour
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 720,  // Limit signals to 12 hours
  CC_AVG_PRICE_CANDLES_COUNT: 10,       // Increase VWAP window to 10 candles
});
```

### Configuration Timing

**Best Practice**: Call `setConfig()` immediately after imports, before any strategy or exchange registration. Changes to `GLOBAL_CONFIG` affect all subsequent operations but do not retroactively modify existing instances.

**Test Mode Override**: Test suites commonly disable timing validations to test edge cases:

```typescript
setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0,  // Disable TP distance check
  CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100,  // Allow any SL distance
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999, // Allow eternal signals for testing
});
```

**Sources**: [test/config/setup.mjs:36-41]()

---

## Parameter Interaction Matrix

The three timing parameters interact with other system components:

| Parameter | Affects | Interaction With | Failure Mode |
|-----------|---------|------------------|--------------|
| `CC_SCHEDULE_AWAIT_MINUTES` | Scheduled signal cancellation | Signal interval, frame duration | Timeout before activation possible |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | Signal validation | `minuteEstimatedTime` field | Rejection in `VALIDATE_SIGNAL_FN` |
| `CC_AVG_PRICE_CANDLES_COUNT` | VWAP calculation | Candle interval, exchange latency | Insufficient historical data |

### Scheduled Signal Timeout and Frame Duration

If backtesting a short timeframe, ensure the frame is longer than `CC_SCHEDULE_AWAIT_MINUTES`:

```typescript
addFrame({
  frameName: "test-frame",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-01T03:00:00Z"), // 180 minutes (> 120min timeout)
});
```

Otherwise, scheduled signals will always timeout before the frame ends.

**Sources**: [test/e2e/defend.test.mjs:496-500]()

### VWAP Window and Data Availability

In backtest mode, the first `CC_AVG_PRICE_CANDLES_COUNT - 1` candles cannot calculate full VWAP. The framework handles this by starting iteration at index `candlesCount - 1`:

```typescript
for (let i = candlesCount - 1; i < candles.length; i++) {
  // First iteration has exactly candlesCount candles available
}
```

This ensures VWAP is always calculated from the full window.

**Sources**: [src/client/ClientStrategy.ts:1143]()

---

## Common Configuration Scenarios

### Scenario 1: High-Frequency Scalping Strategy

```typescript
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 5,        // Fast timeout for rapid rejection
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 60,  // Signals close within 1 hour
  CC_AVG_PRICE_CANDLES_COUNT: 3,       // Minimal smoothing, fast response
});
```

**Rationale**: Scalping requires quick entry/exit with minimal lag. Short timeouts prevent stale scheduled signals. Small VWAP window responds to immediate price action.

### Scenario 2: Conservative Swing Trading

```typescript
setConfig({
  CC_SCHEDULE_AWAIT_MINUTES: 480,      // Wait up to 8 hours for activation
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 10080, // Signals can last 7 days
  CC_AVG_PRICE_CANDLES_COUNT: 15,      // Heavy smoothing for stability
});
```

**Rationale**: Swing trading tolerates longer signal lifetimes. Large VWAP window filters out intraday noise. Extended timeout allows scheduled signals to activate during overnight sessions.

### Scenario 3: Backtest Performance Optimization

```typescript
setConfig({
  CC_AVG_PRICE_CANDLES_COUNT: 1,       // Minimal VWAP calculation overhead
  // Keep default timeout/lifetime for realistic behavior
});
```

**Rationale**: Backtesting thousands of signals benefits from reduced VWAP computation. Using 1 candle (close price) is faster but sacrifices volume-weighted accuracy.

**Warning**: Live trading should restore higher `CC_AVG_PRICE_CANDLES_COUNT` for production reliability.

---

## Timing Parameter Validation Summary

![Mermaid Diagram](./diagrams/74_Timing_Parameters_3.svg)

**Sources**: [src/client/ClientStrategy.ts:40-185](), [src/client/ClientStrategy.ts:332-386](), [src/client/ClientStrategy.ts:285-296]()

---

**Sources for this document**: [src/config/params.ts:1-36](), [src/client/ClientStrategy.ts:40-296](), [src/client/ClientStrategy.ts:332-386](), [src/client/ClientStrategy.ts:1048-1196](), [test/e2e/defend.test.mjs:444-536](), [test/e2e/sanitize.test.mjs:250-348](), [test/config/setup.mjs:36-41]()