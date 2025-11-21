# Core Business Logic

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

This document describes the **Business Logic Layer** of the backtest-kit framework, which contains pure TypeScript implementations of trading system functionality without dependency injection concerns. These client classes ([src/client/]()) implement the core algorithms for signal lifecycle management, market data processing, and timeframe generation.

For information about how these clients are instantiated and managed through dependency injection, see [Service Layer](#5). For details on the service orchestration that invokes these clients, see [Architecture](#2). For the public API that end users interact with, see [Public API Reference](#3).

---

## Overview of Business Logic Layer

The Business Logic Layer consists of three client implementations that encapsulate domain logic:

| Client Class | Primary Responsibility | Key Methods | Importance |
|-------------|------------------------|-------------|-----------|
| `ClientStrategy` | Signal lifecycle, validation, PnL calculation | `tick()`, `backtest()`, `setPendingSignal()` | 33.84 |
| `ClientExchange` | Market data fetching, VWAP calculation | `getCandles()`, `getAveragePrice()`, `getNextCandles()` | 12.54 |
| `ClientFrame` | Timeframe generation for backtesting | `getTimeframe()` | 3.04 |

These classes are designed with **prototype function patterns** for memory efficiency and implement interfaces defined in [src/interfaces/]() for type safety. They receive dependencies through constructor parameters but do not use the DI container directly, making them pure and testable.

**Sources:** [src/client/ClientStrategy.ts:1-660](), [src/client/ClientExchange.ts:1-223](), [src/client/ClientFrame.ts:1-93]()

---

### Business Logic Architecture

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_0.svg)

**Sources:** [src/client/ClientStrategy.ts:194-199](), [src/client/ClientExchange.ts:46-47](), [src/client/ClientFrame.ts:75-76](), [src/interfaces/Strategy.interface.ts:219-237]()

---

## ClientStrategy: Signal Lifecycle Management

`ClientStrategy` is the central orchestrator of trading signal logic, implementing the complete lifecycle from signal generation through validation, monitoring, and closure with PnL calculation.

### Class Structure

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_1.svg)

**Sources:** [src/client/ClientStrategy.ts:194-199](), [src/interfaces/Strategy.interface.ts:60-69](), [src/interfaces/Strategy.interface.ts:43-54](), [src/interfaces/Strategy.interface.ts:204-208]()

### Signal Interval Throttling

The framework enforces minimum intervals between `getSignal()` calls to prevent excessive API requests and ensure strategies respect temporal boundaries:

| `SignalInterval` | Minutes | Use Case |
|------------------|---------|----------|
| `"1m"` | 1 | High-frequency scalping |
| `"3m"` | 3 | Short-term momentum |
| `"5m"` | 5 | Standard short-term trading |
| `"15m"` | 15 | Medium-term swing trading |
| `"30m"` | 30 | Position trading |
| `"1h"` | 60 | Long-term position trading |

Throttling logic: [src/client/ClientStrategy.ts:94-106]()

**Sources:** [src/client/ClientStrategy.ts:19-26](), [src/interfaces/Strategy.interface.ts:10-16]()

---

### Signal Validation

The `VALIDATE_SIGNAL_FN` performs comprehensive validation of signal parameters before persistence or execution. Validation occurs at [src/client/ClientStrategy.ts:28-88]():

**Validation Rules:**

1. **Price Positivity** - All prices must be > 0
2. **Long Position Logic** - `priceTakeProfit > priceOpen` and `priceStopLoss < priceOpen`
3. **Short Position Logic** - `priceTakeProfit < priceOpen` and `priceStopLoss > priceOpen`
4. **Time Parameters** - `minuteEstimatedTime > 0` and `timestamp > 0`

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_2.svg)

**Sources:** [src/client/ClientStrategy.ts:28-88](), [src/client/ClientStrategy.ts:124]()

---

### Tick Execution Flow

The `tick()` method implements the main execution loop for signal monitoring. It returns a discriminated union type `IStrategyTickResult` with four possible states:

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_3.svg)

**Implementation Details:**

- **Idle State** ([src/client/ClientStrategy.ts:294-322]()): No signal exists, returns current VWAP
- **Opened State** ([src/client/ClientStrategy.ts:265-292]()): New signal validated and persisted
- **Active State** ([src/client/ClientStrategy.ts:437-463]()): Signal being monitored, not yielded in live mode
- **Closed State** ([src/client/ClientStrategy.ts:374-435]()): Signal completed with PnL calculation

**Sources:** [src/client/ClientStrategy.ts:258-464](), [src/interfaces/Strategy.interface.ts:204-208]()

---

### Backtest Fast-Forward Simulation

The `backtest()` method simulates signal outcomes using historical candle data without iterating through every timestamp. This is a critical performance optimization for backtesting:

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_4.svg)

**Key Implementation Details:**

- **VWAP Window**: Uses sliding window of 5 candles ([src/client/ClientStrategy.ts:512-516]())
- **Start Index**: Begins at index 4 to ensure 5 candles available ([src/client/ClientStrategy.ts:512]())
- **Long Position**: Checks if `averagePrice >= priceTakeProfit` or `averagePrice <= priceStopLoss` ([src/client/ClientStrategy.ts:521-528]())
- **Short Position**: Checks if `averagePrice <= priceTakeProfit` or `averagePrice >= priceStopLoss` ([src/client/ClientStrategy.ts:533-540]())
- **Time Expiration**: If no TP/SL hit, uses last 5 candles VWAP ([src/client/ClientStrategy.ts:601-606]())

**Sources:** [src/client/ClientStrategy.ts:485-656]()

---

### Crash-Safe Persistence Integration

`ClientStrategy` integrates with `PersistSignalAdapter` to ensure signal state survives process crashes in live trading mode:

| Operation | Method | Persistence Behavior |
|-----------|--------|---------------------|
| Initialize | `waitForInit()` | Reads persisted signal from disk ([src/client/ClientStrategy.ts:151-164]()) |
| Signal Opened | `setPendingSignal(signal)` | Atomic write before yielding result ([src/client/ClientStrategy.ts:228-232]()) |
| Signal Closed | `setPendingSignal(null)` | Atomic write to clear state ([src/client/ClientStrategy.ts:228-232]()) |
| Backtest Mode | All operations | Persistence skipped ([src/client/ClientStrategy.ts:225-227]()) |

**Singleshot Pattern**: `waitForInit()` uses `singleshot` from `functools-kit` to ensure initialization happens exactly once ([src/client/ClientStrategy.ts:209]()).

**Sources:** [src/client/ClientStrategy.ts:146-165](), [src/client/ClientStrategy.ts:220-233](), [src/client/ClientStrategy.ts:209]()

---

## ClientExchange: Market Data Provider

`ClientExchange` abstracts market data access, providing historical and future candle fetching, VWAP calculation, and price/quantity formatting.

### Candle Interval Mapping

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_5.svg)

**Sources:** [src/client/ClientExchange.ts:7-18]()

---

### Historical Candle Fetching

The `getCandles()` method fetches historical candles **backwards** from the execution context time:

**Algorithm:**
1. Calculate time adjustment: `adjust = (interval_minutes * limit) - interval_minutes`
2. Compute `since = execution.context.when - adjust`
3. Call user-provided `getCandles(symbol, interval, since, limit)`
4. Filter results to strict range: `sinceTimestamp <= candle.timestamp <= whenTimestamp`
5. Warn if fewer than requested candles returned

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_6.svg)

**Implementation:** [src/client/ClientExchange.ts:57-101]()

**Sources:** [src/client/ClientExchange.ts:57-101]()

---

### Future Candle Fetching (Backtest Only)

The `getNextCandles()` method fetches candles **forwards** from execution context time. This is used in backtest mode to get future candles for signal simulation:

**Safety Check:** Returns empty array if requested `endTime > Date.now()` to prevent fetching unavailable data ([src/client/ClientExchange.ts:132-134]()).

**Algorithm:**
1. `since = execution.context.when` (current timestamp)
2. `endTime = since + (limit * interval_minutes * 60 * 1000)`
3. If `endTime > Date.now()`, return `[]`
4. Call user-provided `getCandles(symbol, interval, since, limit)`
5. Filter: `sinceTimestamp <= candle.timestamp <= endTime`

**Implementation:** [src/client/ClientExchange.ts:113-157]()

**Sources:** [src/client/ClientExchange.ts:113-157]()

---

### VWAP Calculation

`getAveragePrice()` calculates Volume Weighted Average Price using the last 5 one-minute candles:

**Formula:**
```
Typical Price = (high + low + close) / 3
VWAP = Σ(typical_price × volume) / Σ(volume)

Fallback (if total volume = 0):
Simple Average = Σ(close) / count
```

**Implementation Steps:**
1. Fetch last 5 candles with `getCandles(symbol, "1m", 5)`
2. Calculate typical price for each candle: `(high + low + close) / 3`
3. Sum `typical_price * volume` across all candles
4. Sum total volume
5. Return `sum_price_volume / total_volume`
6. If total volume is zero, return simple average of close prices

**Code:** [src/client/ClientExchange.ts:172-203]()

**Sources:** [src/client/ClientExchange.ts:172-203](), [src/client/ClientStrategy.ts:133-144]()

---

## ClientFrame: Timeframe Generation

`ClientFrame` generates arrays of `Date` objects representing tick timestamps for backtest iteration.

### Timeframe Generation Algorithm

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_7.svg)

**Example:**
- `startDate`: `2024-01-01T00:00:00Z`
- `endDate`: `2024-01-01T01:00:00Z`
- `interval`: `"15m"`
- **Result**: `[00:00, 00:15, 00:30, 00:45, 01:00]` (5 timestamps)

**Implementation:** [src/client/ClientFrame.ts:37-62]()

**Singleshot Caching:** The `getTimeframe()` method is wrapped with `singleshot` to cache results and prevent redundant generation ([src/client/ClientFrame.ts:86-89]()).

**Sources:** [src/client/ClientFrame.ts:12-26](), [src/client/ClientFrame.ts:37-62](), [src/client/ClientFrame.ts:86-89]()

---

## PnL Calculation with Fees and Slippage

The `toProfitLossDto` helper calculates realistic profit/loss including market impact simulation:

### Constants

| Constant | Value | Applied When |
|----------|-------|--------------|
| `PERCENT_SLIPPAGE` | 0.1% | Entry and exit (worse execution) |
| `PERCENT_FEE` | 0.1% | Entry and exit (total 0.2%) |

**Sources:** [src/helpers/toProfitLossDto.ts:7-13]()

---

### Slippage Application Logic

![Mermaid Diagram](./diagrams\14_Core_Business_Logic_8.svg)

**Rationale:**
- **Long positions**: Buy at higher price (slippage hurts entry), sell at lower price (slippage hurts exit)
- **Short positions**: Sell at lower price (slippage hurts entry), buy at higher price (slippage hurts exit)
- **Fees**: Applied twice (0.1% entry + 0.1% exit = 0.2% total)

**Implementation:** [src/helpers/toProfitLossDto.ts:44-90]()

**Sources:** [src/helpers/toProfitLossDto.ts:1-93]()

---

## Business Logic Integration Points

The Business Logic Layer integrates with the rest of the system through well-defined interfaces:

| Integration Point | Interface | Provided By | Used By |
|-------------------|-----------|-------------|---------|
| Signal Generation | `getSignal(symbol)` | User strategy implementation | `ClientStrategy` |
| Candle Data | `getCandles(symbol, interval, since, limit)` | User exchange implementation | `ClientExchange` |
| Price Formatting | `formatPrice(symbol, price)` | User exchange implementation | `ClientExchange` |
| Quantity Formatting | `formatQuantity(symbol, quantity)` | User exchange implementation | `ClientExchange` |
| Logging | `ILogger` | DI container | All clients |
| Execution Context | `ExecutionContextService` | DI container | All clients |
| Method Context | `MethodContextService` | DI container | `ClientStrategy` |

**Sources:** [src/interfaces/Strategy.interface.ts:60-69](), [src/interfaces/Exchange.interface.ts:1-150]()

---

## Memory Efficiency Patterns

All client classes use **prototype function patterns** to minimize memory overhead:

**Pattern Example from ClientStrategy:**
```typescript
// Private function declared outside class
const GET_SIGNAL_FN = trycatch(
  async (self: ClientStrategy): Promise<ISignalRow | null> => {
    // Implementation uses 'self' instead of 'this'
  }
);

// Public method delegates to private function
public async tick(): Promise<IStrategyTickResult> {
  const pendingSignal = await GET_SIGNAL_FN(this);
  // ...
}
```

**Benefits:**
- Function defined once in prototype, not per instance
- Reduces memory when many strategy/exchange instances exist
- Maintains clean separation between public API and implementation

**Sources:** [src/client/ClientStrategy.ts:90-131](), [src/client/ClientExchange.ts:1-223](), [src/client/ClientFrame.ts:37-62]()