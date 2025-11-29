# Interval Throttling


## Purpose and Scope

This document explains the interval throttling mechanism that prevents signal spam by enforcing minimum time gaps between `getSignal` calls. The throttling system uses `INTERVAL_MINUTES` mapping and `_lastSignalTimestamp` tracking to ensure strategies respect their configured signal generation intervals.

For information about the broader live trading execution loop, see [Live Execution Flow](#10.1). For details on signal generation and validation, see [Signal Generation and Validation](#8.2).

---

## Overview

Interval throttling is a critical mechanism that prevents strategies from generating signals too frequently. Each strategy declares a `SignalInterval` (e.g., "1m", "5m", "1h") which determines the minimum time between consecutive `getSignal` function calls. The framework enforces this interval by tracking the timestamp of the last signal generation attempt and rejecting premature calls.

**Key Benefits:**
- **Prevents signal spam** that could overwhelm risk limits
- **Reduces computational overhead** by limiting strategy evaluations
- **Enforces consistent strategy behavior** between backtest and live modes
- **Protects against bugs** in user-defined `getSignal` functions

Sources: [src/client/ClientStrategy.ts:31-38](), [src/interfaces/Strategy.interface.ts:7-17]()

---

## SignalInterval Type

The `SignalInterval` type defines the allowed throttling intervals:

```typescript
type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h"
```

This interval is specified in the strategy schema during registration:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `interval` | `SignalInterval` | Yes | Minimum time between `getSignal` calls |
| `strategyName` | `string` | Yes | Unique strategy identifier |
| `getSignal` | `function` | Yes | Signal generation function (throttled) |

**Example Strategy Registration:**

```typescript
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",  // Throttle to maximum one signal per 5 minutes
  getSignal: async (symbol) => {
    // This function will only be called every 5 minutes
    return { /* signal data */ };
  }
});
```

Sources: [src/interfaces/Strategy.interface.ts:7-17](), [src/interfaces/Strategy.interface.ts:121-138]()

---

## INTERVAL_MINUTES Mapping

The framework converts `SignalInterval` strings to millisecond durations via the `INTERVAL_MINUTES` constant:

![Mermaid Diagram](./diagrams/58_Interval_Throttling_0.svg)

**Mapping Definition:**

The mapping is defined at [src/client/ClientStrategy.ts:31-38]():

```typescript
const INTERVAL_MINUTES: Record<SignalInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
};
```

**Usage in Throttling Check:**

```typescript
const intervalMinutes = INTERVAL_MINUTES[self.params.interval];
const intervalMs = intervalMinutes * 60 * 1000;
```

This conversion happens during every throttling check within `GET_SIGNAL_FN`.

Sources: [src/client/ClientStrategy.ts:31-38]()

---

## _lastSignalTimestamp Tracking

Each `ClientStrategy` instance maintains a private field `_lastSignalTimestamp` that records when `getSignal` was last called:

![Mermaid Diagram](./diagrams/58_Interval_Throttling_1.svg)

**Field Declaration:**

The field is declared in `ClientStrategy` class (not shown in provided excerpts, but referenced at [src/client/ClientStrategy.ts:201-207]()):

```typescript
private _lastSignalTimestamp: number | null = null;
```

**Update Logic:**

```typescript
self._lastSignalTimestamp = currentTime;
```

This assignment occurs immediately before calling the user's `getSignal` function, ensuring that the timestamp reflects the most recent signal generation attempt.

Sources: [src/client/ClientStrategy.ts:194-208]()

---

## Throttling Decision Flow

The throttling check occurs in `GET_SIGNAL_FN` before calling the user-defined `getSignal` function:

![Mermaid Diagram](./diagrams/58_Interval_Throttling_2.svg)

**Implementation at [src/client/ClientStrategy.ts:194-208]():**

```typescript
const currentTime = self.params.execution.context.when.getTime();
{
  const intervalMinutes = INTERVAL_MINUTES[self.params.interval];
  const intervalMs = intervalMinutes * 60 * 1000;

  // Check that enough time has passed since last getSignal
  if (
    self._lastSignalTimestamp !== null &&
    currentTime - self._lastSignalTimestamp < intervalMs
  ) {
    return null;
  }

  self._lastSignalTimestamp = currentTime;
}
```

**Key Observations:**

1. **First call bypass**: When `_lastSignalTimestamp` is `null`, the check is skipped (no delay on strategy startup)
2. **Early return**: If interval hasn't passed, immediately return `null` without calling `getSignal`
3. **Timestamp update**: Always update before calling `getSignal` to prevent race conditions
4. **Execution context time**: Uses `execution.context.when` which is either `Date.now()` (live) or historical timestamp (backtest)

Sources: [src/client/ClientStrategy.ts:187-283]()

---

## Throttling in Signal Generation Pipeline

The throttling check is the first gate in the signal generation pipeline:

![Mermaid Diagram](./diagrams/58_Interval_Throttling_3.svg)

**Position in Call Stack:**

1. **Entry Point**: `ClientStrategy.tick(symbol)` or `ClientStrategy.backtest(candles)`
2. **Throttle Gate**: `GET_SIGNAL_FN` checks `_lastSignalTimestamp` immediately
3. **Downstream Gates**: VWAP fetch → Risk check → User `getSignal` → Validation
4. **Result**: Returns `IStrategyTickResult` (idle if throttled)

Sources: [src/client/ClientStrategy.ts:187-283]()

---

## Integration with Live Trading Mode

In live trading, throttling operates on real-time clock progression. The live execution loop repeatedly calls `tick()` with `Date.now()` as the context timestamp. Throttling prevents excessive `getSignal` calls during this infinite loop:

```typescript
while (true) {
  // ExecutionContext.when = Date.now()
  const result = await this.strategyConnectionService.tick();
  // Throttling happens inside tick() → GET_SIGNAL_FN
  
  await sleep(TICK_TTL);
}
```

Sources: [src/client/ClientStrategy.ts:194-208]()

---

## Integration with Backtesting Mode

In backtesting, throttling operates on historical timestamp progression. The backtest loop iterates through discrete timestamps from `Frame.getTimeframe()`. Throttling ensures that even if the frame interval is "1m" (one tick per minute), a strategy with interval "5m" only evaluates `getSignal` every 5 minutes:

| Frame Timestamp | Throttle Check | Result |
|----------------|----------------|--------|
| 2024-01-01 00:00 | First call (null) | **Allow** → getSignal() |
| 2024-01-01 00:01 | 1 min < 5 min | Block → return idle |
| 2024-01-01 00:02 | 2 min < 5 min | Block → return idle |
| 2024-01-01 00:03 | 3 min < 5 min | Block → return idle |
| 2024-01-01 00:04 | 4 min < 5 min | Block → return idle |
| 2024-01-01 00:05 | 5 min >= 5 min | **Allow** → getSignal() |
| 2024-01-01 00:06 | 1 min < 5 min | Block → return idle |

Sources: [src/client/ClientStrategy.ts:194-208]()

---

## Throttling Bypass Conditions

The throttling mechanism has two bypass conditions where `getSignal` is **not** called, regardless of interval:

### 1. Strategy Stopped

```typescript
if (self._isStopped) {
  return null;
}
```

When `ClientStrategy.stop()` is called (e.g., during graceful shutdown), the `_isStopped` flag prevents all future `getSignal` calls. This check occurs **before** the throttling check at [src/client/ClientStrategy.ts:191-193]().

### 2. Scheduled Signal Active

When a scheduled signal is waiting for activation (`self._scheduledSignal !== null`), the strategy does not generate new signals. This prevents multiple concurrent signals from the same strategy.

**Check Location:**

The scheduled signal check happens in `ClientStrategy.tick()` before calling `GET_SIGNAL_FN`. See [Signal Lifecycle Overview](#2.2) for details on scheduled signal behavior.

Sources: [src/client/ClientStrategy.ts:191-193]()

---

## Throttling vs. Risk Limits

Throttling and risk management serve different purposes:

| Aspect | Throttling | Risk Management |
|--------|-----------|-----------------|
| **Purpose** | Rate limit signal generation | Portfolio position limits |
| **Scope** | Per-strategy, per-symbol | Cross-strategy, portfolio-level |
| **Timing** | Before `getSignal` call | After signal generation |
| **Configuration** | `interval` in strategy schema | `riskName` and validations |
| **Bypass** | None (always enforced) | Can be disabled (no riskName) |
| **Failure Mode** | Silent (return null) | Logged rejection |

**Example Scenario:**

```typescript
addStrategy({
  strategyName: "scalper",
  interval: "1m",      // Throttling: max 1 signal/minute
  riskName: "aggressive", // Risk: check position limits
  getSignal: async (symbol) => { /* ... */ }
});

addRisk({
  riskName: "aggressive",
  validations: [
    (payload) => {
      // Risk: max 5 concurrent positions across all strategies
      if (payload.activePositionCount >= 5) {
        throw new Error("Portfolio limit reached");
      }
    }
  ]
});
```

**Execution Flow:**

1. **00:00:00**: Throttle allows → Risk allows → Signal generated
2. **00:00:30**: Throttle blocks (30s < 60s) → `getSignal` not called
3. **00:01:00**: Throttle allows → Risk blocks (5 positions active) → Signal rejected
4. **00:02:00**: Throttle allows → Risk allows (4 positions now) → Signal generated

Sources: [src/client/ClientStrategy.ts:194-283]()

---

## Code Entity Reference

| Entity | Type | Location | Role |
|--------|------|----------|------|
| `SignalInterval` | Type | [src/interfaces/Strategy.interface.ts:11-17]() | Defines allowed throttling intervals |
| `INTERVAL_MINUTES` | Constant | [src/client/ClientStrategy.ts:31-38]() | Maps interval strings to minute durations |
| `_lastSignalTimestamp` | Field | `ClientStrategy` class | Tracks last signal generation time |
| `GET_SIGNAL_FN` | Function | [src/client/ClientStrategy.ts:187-283]() | Implements throttling logic |
| `IStrategySchema.interval` | Property | [src/interfaces/Strategy.interface.ts:126]() | Strategy's configured throttle interval |
| `ExecutionContextService.context.when` | Property | [src/lib/services/context/ExecutionContextService.ts]() | Current timestamp (live or backtest) |

Sources: [src/client/ClientStrategy.ts:31-38](), [src/interfaces/Strategy.interface.ts:7-17]()