---
title: design/08_core-concepts
group: design
---

# Core Concepts

This document explains the fundamental concepts that underpin the entire backtest-kit framework. Understanding these concepts is essential for developing strategies, managing risk, and interpreting results.

For information about running backtests or live trading, see [Execution Modes](./20_execution-modes.md). For details on the internal architecture and service layer, see [Architecture Deep Dive](./14_architecture-deep-dive.md). For practical examples, see [Getting Started](./04_getting-started.md).

---

## Signals: The Fundamental Trading Unit

A **signal** represents a single trading position with defined entry, take profit (TP), stop loss (SL), and time parameters. Signals are the atomic unit of execution in backtest-kit.

### Signal Structure

Every signal contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Auto-generated UUID v4 identifier |
| `position` | `"long" \| "short"` | Trade direction |
| `priceOpen` | `number` | Entry price for the position |
| `priceTakeProfit` | `number` | Target exit price (profit) |
| `priceStopLoss` | `number` | Maximum loss exit price |
| `minuteEstimatedTime` | `number` | Duration before time-based exit |
| `note` | `string` (optional) | Human-readable description |

**Signal DTO vs Signal Row**

Strategies return `ISignalDto` objects `types.d.ts:650-665` where `id` and `priceOpen` are optional. The framework augments these into `ISignalRow` objects `types.d.ts:670-687` with:
- Auto-generated `id` (UUID v4)
- Defaulted `priceOpen` (current VWAP if omitted)
- Metadata: `exchangeName`, `strategyName`, `scheduledAt`, `pendingAt`, `symbol`, `_isScheduled`

![Mermaid Diagram](./diagrams\08_core-concepts_0.svg)

**Immediate vs Scheduled Signals**

- **Immediate signals**: `priceOpen` omitted or equals current price → opens immediately at VWAP
- **Scheduled signals**: `priceOpen` specified and differs from current price → enters "scheduled" state `types.d.ts:694-697`


---

## Signal Lifecycle State Machine

Signals progress through a multi-stage lifecycle with comprehensive validation before activation. The state machine ensures data integrity and prevents invalid trades.

### Lifecycle Diagram

![Mermaid Diagram](./diagrams\08_core-concepts_1.svg)

### Validation Stages

Before any signal activates, it passes through 7 validation checks enforced by `GLOBAL_CONFIG`:

1. **Schema Validation**: Fields match `ISignalDto` interface `types.d.ts:650-665`
2. **Positive Price Check**: All prices > 0, finite, not NaN
3. **TP/SL Logic**: 
   - LONG: `priceTakeProfit > priceOpen > priceStopLoss`
   - SHORT: `priceStopLoss > priceOpen > priceTakeProfit`
4. **TP Distance**: `(|priceTakeProfit - priceOpen| / priceOpen) >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT`
5. **SL Range**: `(|priceStopLoss - priceOpen| / priceOpen) <= CC_MAX_STOPLOSS_DISTANCE_PERCENT`
6. **Lifetime Limit**: `minuteEstimatedTime <= CC_MAX_SIGNAL_LIFETIME_MINUTES`
7. **Risk Validation**: Custom validations from `IRiskSchema` `types.d.ts:417-426`

### State Transitions

| Current State | Trigger | Next State | Notes |
|--------------|---------|------------|-------|
| `Idle` | `getSignal()` returns signal | `ValidateSchema` | Begin validation pipeline |
| `ValidateSchema` → ... → `CheckRisk` | All checks pass + `priceOpen` not reached | `Scheduled` | Limit order waiting for entry |
| `ValidateSchema` → ... → `CheckRisk` | All checks pass + `priceOpen` reached | `Opened` | Market order, enter immediately |
| `CheckRisk` | Risk validation fails | `Rejected` | Signal discarded, emit `riskSubject` |
| `Scheduled` | Current price reaches `priceOpen` (before SL) | `Opened` | Activation successful |
| `Scheduled` | `priceStopLoss` hit OR timeout | `Cancelled` | Activation failed, emit cancel event |
| `Opened` | Signal persisted | `Active` | Begin TP/SL/time monitoring |
| `Active` | Price reaches `priceTakeProfit` | `Closed_TP` | Exit with profit |
| `Active` | Price reaches `priceStopLoss` | `Closed_SL` | Exit with loss |
| `Active` | `minuteEstimatedTime` expires | `Closed_Time` | Exit at current price |

**Key Safety Rule**: Scheduled signals check for SL breach **before** checking for activation. This prevents "open-and-immediately-stop" scenarios.


---

## Tick Results: Discriminated Union Type System

Every call to `ClientStrategy.tick()` returns a discriminated union result `types.d.ts:888` that encodes the current signal state. This design enables type-safe handling without optional fields.

### Result Types

![Mermaid Diagram](./diagrams\08_core-concepts_2.svg)

### Type-Safe Pattern Matching

Use the `action` discriminator for type-safe handling:

```typescript
const result = await strategy.tick(symbol, when);

switch (result.action) {
  case "idle":
    // result.signal is null
    console.log("No active position");
    break;
    
  case "scheduled":
    // result.signal is IScheduledSignalRow
    console.log(`Waiting for ${result.signal.priceOpen}`);
    break;
    
  case "opened":
    // result.signal is ISignalRow
    console.log(`Position opened: ${result.signal.id}`);
    break;
    
  case "active":
    // result.signal is ISignalRow, percentTp/percentSl available
    console.log(`Active: ${result.percentTp}% to TP`);
    break;
    
  case "closed":
    // result.signal is ISignalRow, closeReason and pnl available
    console.log(`Closed: ${result.closeReason}, PNL ${result.pnl.pnlPercentage}%`);
    break;
    
  case "cancelled":
    // result.signal is IScheduledSignalRow
    console.log(`Cancelled without opening`);
    break;
}
```


---

## Strategies: Signal Generation Logic

Strategies define **how** signals are generated from market data. A strategy is registered via `addStrategy()` and implements the `IStrategySchema` interface `types.d.ts:728-747`.

### Strategy Schema

```typescript
interface IStrategySchema {
  strategyName: string;                    // Unique identifier
  interval: SignalInterval;                 // Throttling interval
  getSignal: (symbol: string, when: Date) => Promise<ISignalDto | null>;
  callbacks?: Partial<IStrategyCallbacks>; // Lifecycle hooks
  riskName?: string;                        // Single risk profile
  riskList?: string[];                      // Multiple risk profiles
}
```

**The `getSignal` Function**

This is the core strategy logic. It receives:
- `symbol`: Trading pair (e.g., "BTCUSDT")
- `when`: Current timestamp (execution context)

It returns:
- `ISignalDto` object if conditions met
- `null` if no signal

![Mermaid Diagram](./diagrams\08_core-concepts_3.svg)

**Interval Throttling**

The `interval` field `types.d.ts:734` prevents `getSignal` from being called too frequently:

| Interval | Minimum Time Between Calls |
|----------|---------------------------|
| `"1m"` | 1 minute |
| `"3m"` | 3 minutes |
| `"5m"` | 5 minutes |
| `"15m"` | 15 minutes |
| `"30m"` | 30 minutes |
| `"1h"` | 1 hour |

Throttling is implemented in `ClientStrategy.tick()` `src/client/ClientStrategy.ts` by tracking last call timestamp.

**Strategy Callbacks**

Optional lifecycle hooks `types.d.ts:702-723`:

| Callback | When Called | Parameters |
|----------|-------------|------------|
| `onTick` | Every tick | `result: IStrategyTickResult` |
| `onOpen` | Signal opens | `data: ISignalRow, currentPrice` |
| `onActive` | Signal monitoring | `data: ISignalRow, currentPrice` |
| `onIdle` | No active signal | `currentPrice` |
| `onClose` | Signal closes | `data: ISignalRow, priceClose` |
| `onSchedule` | Signal scheduled | `data: IScheduledSignalRow, currentPrice` |
| `onCancel` | Scheduled signal cancelled | `data: IScheduledSignalRow, currentPrice` |
| `onPartialProfit` | Profit milestone reached | `data: ISignalRow, revenuePercent` |
| `onPartialLoss` | Loss milestone reached | `data: ISignalRow, lossPercent` |


---

## Execution Contexts: Ambient Information Propagation

Backtest-kit uses **scoped context services** to propagate ambient information throughout the call stack without explicit parameter passing. This is implemented via `di-scoped` library using Node.js `AsyncLocalStorage`.

### Context Architecture

![Mermaid Diagram](./diagrams\08_core-concepts_4.svg)

### ExecutionContext

Provides **runtime execution parameters** `types.d.ts:11-18`:

```typescript
interface IExecutionContext {
  symbol: string;      // Trading pair (e.g., "BTCUSDT")
  when: Date;          // Current timestamp
  backtest: boolean;   // true = backtest mode, false = live mode
}
```

**Usage**: Set once per tick, consumed by:
- `ClientExchange.getCandles()` - fetches data up to `when` timestamp
- `ClientExchange.getAveragePrice()` - calculates VWAP at `when`
- `ClientStrategy.tick()` - processes signal at `when`

**Access**: Via `ExecutionContextService` `types.d.ts:38-44`:

```typescript
ExecutionContextService.runInContext(
  async () => {
    // Inside this callback, context is automatically available
    const candles = await getCandles(symbol, "1m", 100);
    // candles are fetched up to ExecutionContext.when timestamp
  },
  { symbol: "BTCUSDT", when: new Date(), backtest: true }
);
```

### MethodContext

Provides **schema identifiers** for dependency routing `types.d.ts:302-309`:

```typescript
interface IMethodContext {
  exchangeName: string;  // Which exchange schema to use
  strategyName: string;  // Which strategy schema to use
  frameName: string;     // Which frame schema to use (empty for live)
}
```

**Usage**: Set once per execution run, consumed by:
- `StrategyConnectionService` - routes to correct `ClientStrategy` instance
- `ExchangeConnectionService` - routes to correct `ClientExchange` instance
- `FrameConnectionService` - routes to correct `ClientFrame` instance

**Access**: Via `MethodContextService` `types.d.ts:330-336`:

```typescript
MethodContextService.runAsyncIterator(
  backtestGenerator,
  {
    strategyName: "my-strategy",
    exchangeName: "my-exchange",
    frameName: "1d-backtest"
  }
);
```

### Context Propagation Flow

| Layer | Sets Context | Reads Context | Purpose |
|-------|--------------|---------------|---------|
| Public API | Neither | Neither | Entry point |
| Logic Services | Both | Neither | Orchestration |
| Connection Services | Neither | `MethodContext` | Route to correct client |
| Client Layer | Neither | `ExecutionContext` | Access runtime params |


---

## Time Execution Engine: The Core Architectural Concept

Backtest-kit is fundamentally a **time execution engine**, not a data-processing library. This architectural choice makes look-ahead bias architecturally impossible.

### Conceptual Model

![Mermaid Diagram](./diagrams\08_core-concepts_5.svg)

**Key Principle**: At timestamp `t`, all operations see only data from timestamps `≤ t`. The `ExecutionContextService` enforces this constraint throughout the call stack.

### How It Works

1. **Backtest Mode**: `BacktestLogicPrivateService` `src/lib/services/backtest/BacktestLogicPrivateService.ts` iterates through a pre-generated timeframe:
   ```typescript
   for (const when of timeframes) {
     ExecutionContextService.runInContext(
       async () => {
         const result = await strategy.tick(symbol, when);
         yield result;
       },
       { symbol, when, backtest: true }
     );
   }
   ```

2. **Live Mode**: `LiveLogicPrivateService` `src/lib/services/live/LiveLogicPrivateService.ts` creates timestamps in real-time:
   ```typescript
   while (true) {
     const when = new Date();
     ExecutionContextService.runInContext(
       async () => {
         const result = await strategy.tick(symbol, when);
         yield result;
       },
       { symbol, when, backtest: false }
     );
     await sleep(TICK_TTL);
   }
   ```

3. **Data Fetching**: `ClientExchange.getCandles()` `src/client/ClientExchange.ts` reads `ExecutionContext.when` and ensures returned data ≤ `when`:
   ```typescript
   async getCandles(symbol, interval, limit) {
     const { when } = this.execution.context;
     // Fetch candles from exchange, filtered by when timestamp
     const candles = await this.schema.getCandles(symbol, interval, since, limit);
     return candles.filter(c => c.timestamp <= when.getTime());
   }
   ```

### Async Stream of Time

The framework models execution as an **async generator** that yields results progressively:

![Mermaid Diagram](./diagrams\08_core-concepts_6.svg)

This design enables:
- **Memory efficiency**: No accumulation of results in memory
- **Early termination**: Consumer can stop iteration at any point
- **Streaming**: Real-time processing of results
- **Backpressure**: Generator only produces when consumer is ready


---

## VWAP Pricing: Realistic Price Simulation

All entry and exit prices use **Volume Weighted Average Price (VWAP)** calculated from the last 5 one-minute candles. This simulates realistic market execution better than using raw close prices.

### VWAP Calculation

![Mermaid Diagram](./diagrams\08_core-concepts_7.svg)

**Formula**:

```
Typical Price_i = (High_i + Low_i + Close_i) / 3
VWAP = Σ(Typical Price_i × Volume_i) / Σ(Volume_i)
```

Where `i` ranges over the last 5 one-minute candles.

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | Number of candles for VWAP calculation |
| Candle interval | `"1m"` | Fixed at one minute (hardcoded) |

### Usage in Signal Processing

![Mermaid Diagram](./diagrams\08_core-concepts_8.svg)

**Price Application**:
- **Signal creation**: If `priceOpen` omitted, defaults to current VWAP
- **TP/SL monitoring**: Compare current VWAP against `priceTakeProfit` and `priceStopLoss`
- **Scheduled activation**: Compare current VWAP against `priceOpen` for scheduled signals
- **Final closure**: Exit price is current VWAP at close timestamp

### PNL Calculation with Fees and Slippage

Final profit/loss includes realistic trading costs `types.d.ts:757-764`:

```typescript
interface IStrategyPnL {
  pnlPercentage: number;  // Net profit/loss as percentage
  priceOpen: number;      // Entry price adjusted with slippage + fees
  priceClose: number;     // Exit price adjusted with slippage + fees
}
```

**Cost Model**:
- **Fee**: 0.1% on entry and exit (configurable via `CC_PERCENT_FEE`)
- **Slippage**: 0.1% on entry and exit (configurable via `CC_PERCENT_SLIPPAGE`)
- **Total cost**: ~0.4% per round trip

**Example**:
- Entry VWAP: $50,000
- Exit VWAP: $52,000
- Gross profit: 4%
- Costs: 0.4%
- Net PNL: **3.6%**


---

## Sequential Signal Processing

Backtest-kit enforces a critical constraint: **only ONE active signal per symbol at any time**. This prevents position size explosions and ensures predictable behavior.

### Constraint Enforcement

![Mermaid Diagram](./diagrams\08_core-concepts_9.svg)

**Implementation**: `ClientStrategy` `src/client/ClientStrategy.ts` maintains `_pendingSignal` field. If non-null, `getSignal()` is never called.

### Backtest Fast-Forward Optimization

After a signal opens in backtest mode, the system uses `ClientStrategy.backtest()` method to efficiently process the signal until closure:

![Mermaid Diagram](./diagrams\08_core-concepts_10.svg)

This optimization prevents thousands of unnecessary ticks while a signal is active.


---

## Summary Table

| Concept | Key Type/Interface | Purpose | Related Pages |
|---------|-------------------|---------|---------------|
| **Signal** | `ISignalDto`, `ISignalRow` | Atomic trading position | [Signals & Signal Lifecycle](./08_core-concepts.md) |
| **Signal Lifecycle** | `IStrategyTickResult` (discriminated union) | State machine for signal processing | [Signals & Signal Lifecycle](./08_core-concepts.md) |
| **Strategy** | `IStrategySchema`, `getSignal` function | Logic for generating signals | [Strategies](./08_core-concepts.md), [Strategy Development](./25_strategy-development.md) |
| **Execution Context** | `ExecutionContextService`, `IExecutionContext` | Runtime parameters (symbol, when, mode) | [Execution Contexts](./08_core-concepts.md) |
| **Method Context** | `MethodContextService`, `IMethodContext` | Schema routing (strategy/exchange/frame names) | [Execution Contexts](./08_core-concepts.md) |
| **Time Execution** | Async generators, context propagation | Stream of time preventing look-ahead bias | [Time Execution Engine](./08_core-concepts.md) |
| **VWAP Pricing** | `ClientExchange.getAveragePrice()` | Realistic entry/exit pricing | [VWAP Pricing & Data Handling](./08_core-concepts.md) |
