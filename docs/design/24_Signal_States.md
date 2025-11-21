# Signal States

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/interfaces/IStrategyTickResultActive.md](docs/interfaces/IStrategyTickResultActive.md)
- [docs/interfaces/IStrategyTickResultClosed.md](docs/interfaces/IStrategyTickResultClosed.md)
- [docs/interfaces/IStrategyTickResultIdle.md](docs/interfaces/IStrategyTickResultIdle.md)
- [docs/interfaces/IStrategyTickResultOpened.md](docs/interfaces/IStrategyTickResultOpened.md)
- [src/client/ClientStrategy.ts](src/client/ClientStrategy.ts)
- [src/interfaces/Frame.interface.ts](src/interfaces/Frame.interface.ts)
- [src/interfaces/Strategy.interface.ts](src/interfaces/Strategy.interface.ts)

</details>



This page documents the four signal states in the backtest-kit framework and their corresponding TypeScript interfaces. Each state is represented by a distinct interface in a discriminated union, enabling type-safe signal lifecycle management.

For information about how signals are generated and validated, see [Signal Generation and Validation](#6.2). For details on state persistence between crashes, see [Signal Persistence](#6.3). For PnL calculation logic in the closed state, see [PnL Calculation](#6.4).

## Overview

Signals progress through four distinct states during their lifecycle. The framework uses a discriminated union pattern with an `action` property as the type discriminator. All state interfaces are defined in [src/interfaces/Strategy.interface.ts:127-208]() and returned by `ClientStrategy.tick()` in [src/client/ClientStrategy.ts:258-464]().

| State | Action Value | Description | Signal Present | Price Monitoring |
|-------|-------------|-------------|----------------|------------------|
| **Idle** | `"idle"` | No active signal exists | No (`null`) | Current VWAP only |
| **Opened** | `"opened"` | Signal just created and validated | Yes | Entry price |
| **Active** | `"active"` | Signal monitoring TP/SL conditions | Yes | Continuous VWAP |
| **Closed** | `"closed"` | Signal completed with PnL result | Yes | Final close price |

**Sources:** [src/interfaces/Strategy.interface.ts:127-208](), [src/client/ClientStrategy.ts]()

## State Discriminated Union Type System

![Mermaid Diagram](./diagrams\24_Signal_States_0.svg)

The `IStrategyTickResult` type is a discriminated union defined at [src/interfaces/Strategy.interface.ts:204-208](). TypeScript uses the `action` property to narrow types in conditional blocks:

```typescript
// Type narrowing with discriminator
const result: IStrategyTickResult = await strategy.tick();

if (result.action === "closed") {
  // TypeScript knows result is IStrategyTickResultClosed
  console.log(result.pnl.pnlPercentage); // OK
  console.log(result.closeReason); // OK
}

if (result.action === "idle") {
  // TypeScript knows result is IStrategyTickResultIdle
  console.log(result.signal); // null
}
```

**Sources:** [src/interfaces/Strategy.interface.ts:204-208](), [src/interfaces/Strategy.interface.ts:127-198]()

## State Transition Flow

![Mermaid Diagram](./diagrams\24_Signal_States_1.svg)

The state machine is implemented in `ClientStrategy.tick()` at [src/client/ClientStrategy.ts:258-464](). The `_pendingSignal` field at [src/client/ClientStrategy.ts:195]() tracks the current signal state.

**Sources:** [src/client/ClientStrategy.ts:258-464](), [src/client/ClientStrategy.ts:195]()

## Idle State

The idle state indicates no active signal exists. This is the default state when `ClientStrategy._pendingSignal` is `null`.

### IStrategyTickResultIdle Interface

Defined at [src/interfaces/Strategy.interface.ts:129-141]():

```typescript
interface IStrategyTickResultIdle {
  action: "idle";
  signal: null;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  currentPrice: number;
}
```

### Idle State Behavior

Implementation at [src/client/ClientStrategy.ts:261-323]():

1. **Signal Generation Check**: Calls `GET_SIGNAL_FN()` at [src/client/ClientStrategy.ts:262]() to check if a new signal should be generated
2. **Throttling**: `GET_SIGNAL_FN` enforces interval-based throttling at [src/client/ClientStrategy.ts:98-106]() using `_lastSignalTimestamp`
3. **Price Fetch**: If no signal, fetches current VWAP via `exchange.getAveragePrice()` at [src/client/ClientStrategy.ts:294-296]()
4. **Callbacks**: Triggers `callbacks.onIdle` if configured at [src/client/ClientStrategy.ts:298-304]()
5. **Return**: Constructs `IStrategyTickResultIdle` with current price at [src/client/ClientStrategy.ts:306-312]()

The idle state is returned when `_pendingSignal` remains `null` after attempting signal generation.

**Sources:** [src/interfaces/Strategy.interface.ts:129-141](), [src/client/ClientStrategy.ts:261-323](), [src/client/ClientStrategy.ts:90-131]()

## Opened State

The opened state occurs immediately after a new signal passes validation and is persisted. This state is yielded exactly once per signal.

### IStrategyTickResultOpened Interface

Defined at [src/interfaces/Strategy.interface.ts:147-158]():

```typescript
interface IStrategyTickResultOpened {
  action: "opened";
  signal: ISignalRow;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  currentPrice: number;
}
```

### Opened State Behavior

Implementation at [src/client/ClientStrategy.ts:265-292]():

1. **Signal Creation**: `GET_SIGNAL_FN()` returns non-null `ISignalDto` at [src/client/ClientStrategy.ts:107-127]()
2. **ID Generation**: Assigns random UUID via `randomString()` at [src/client/ClientStrategy.ts:115]()
3. **Validation**: `VALIDATE_SIGNAL_FN()` checks prices, TP/SL logic, and timestamps at [src/client/ClientStrategy.ts:28-88]()
4. **Persistence**: `setPendingSignal(signal)` atomically writes to disk in live mode at [src/client/ClientStrategy.ts:220-233]()
5. **Callbacks**: Triggers `callbacks.onOpen` at [src/client/ClientStrategy.ts:266-273]()
6. **Return**: Constructs `IStrategyTickResultOpened` with `priceOpen` as `currentPrice` at [src/client/ClientStrategy.ts:275-281]()

After returning opened state, the next `tick()` call transitions to active state since `_pendingSignal` now exists.

**Sources:** [src/interfaces/Strategy.interface.ts:147-158](), [src/client/ClientStrategy.ts:265-292](), [src/client/ClientStrategy.ts:90-131](), [src/client/ClientStrategy.ts:28-88]()

## Active State

The active state represents ongoing monitoring of take profit, stop loss, and time expiration conditions. This state can repeat across multiple ticks.

### IStrategyTickResultActive Interface

Defined at [src/interfaces/Strategy.interface.ts:164-175]():

```typescript
interface IStrategyTickResultActive {
  action: "active";
  signal: ISignalRow;
  currentPrice: number;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
}
```

### Active State Behavior

Implementation at [src/client/ClientStrategy.ts:324-463](), specifically the path where conditions are not met:

1. **Signal Existence**: Checks `if (_pendingSignal)` at [src/client/ClientStrategy.ts:261]() evaluates to true
2. **Price Monitoring**: Fetches current VWAP via `exchange.getAveragePrice()` at [src/client/ClientStrategy.ts:329-331]()
3. **Condition Checks**: Evaluates TP/SL and time expiration at [src/client/ClientStrategy.ts:340-371]() but none trigger
4. **Callbacks**: Triggers `callbacks.onActive` at [src/client/ClientStrategy.ts:438-445]()
5. **Return**: Constructs `IStrategyTickResultActive` with current VWAP at [src/client/ClientStrategy.ts:447-453]()

### Monitoring Logic

The condition checks at [src/client/ClientStrategy.ts:340-371]() evaluate:

- **Time Expiration**: `when >= (signal.timestamp + signal.minuteEstimatedTime * 60 * 1000)`
- **Long TP**: `averagePrice >= signal.priceTakeProfit`
- **Long SL**: `averagePrice <= signal.priceStopLoss`
- **Short TP**: `averagePrice <= signal.priceTakeProfit`
- **Short SL**: `averagePrice >= signal.priceStopLoss`

If any condition is true, `shouldClose` is set and state transitions to closed instead of active.

**Sources:** [src/interfaces/Strategy.interface.ts:164-175](), [src/client/ClientStrategy.ts:324-463](), [src/client/ClientStrategy.ts:340-371]()

## Closed State

The closed state represents signal completion with calculated profit/loss. This is the terminal state for a signal before returning to idle.

### IStrategyTickResultClosed Interface

Defined at [src/interfaces/Strategy.interface.ts:181-198]():

```typescript
interface IStrategyTickResultClosed {
  action: "closed";
  signal: ISignalRow;
  currentPrice: number;
  closeReason: StrategyCloseReason;
  closeTimestamp: number;
  pnl: IStrategyPnL;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
}
```

### Close Reason Types

The `StrategyCloseReason` type at [src/interfaces/Strategy.interface.ts:112]() has three possible values:

| Close Reason | Condition | Example |
|--------------|-----------|---------|
| `"take_profit"` | VWAP reached `priceTakeProfit` | Long: price rises to TP, Short: price falls to TP |
| `"stop_loss"` | VWAP reached `priceStopLoss` | Long: price falls to SL, Short: price rises to SL |
| `"time_expired"` | Current time exceeds `timestamp + minuteEstimatedTime` | Signal duration elapsed |

### Closed State Behavior

Implementation at [src/client/ClientStrategy.ts:374-435]():

1. **Condition Detection**: One of the monitoring conditions at [src/client/ClientStrategy.ts:340-371]() evaluates to true
2. **PnL Calculation**: Calls `toProfitLossDto(signal, averagePrice)` at [src/client/ClientStrategy.ts:375]() to compute adjusted profit/loss
3. **Timestamp Capture**: Records close time from `execution.context.when` at [src/client/ClientStrategy.ts:376]()
4. **Loss Warnings**: Logs warnings for stop loss or negative time expiration at [src/client/ClientStrategy.ts:379-394]()
5. **Callbacks**: Triggers `callbacks.onClose` at [src/client/ClientStrategy.ts:405-412]()
6. **State Clearing**: Calls `setPendingSignal(null)` at [src/client/ClientStrategy.ts:414]() to clear persistence
7. **Return**: Constructs `IStrategyTickResultClosed` with all metadata at [src/client/ClientStrategy.ts:416-425]()

### Backtest Fast-Forward

The `ClientStrategy.backtest()` method at [src/client/ClientStrategy.ts:485-656]() always returns `IStrategyTickResultClosed`. It iterates through future candles checking TP/SL on each, or returns `time_expired` if duration elapses without hitting TP/SL.

**Sources:** [src/interfaces/Strategy.interface.ts:181-198](), [src/interfaces/Strategy.interface.ts:112](), [src/client/ClientStrategy.ts:374-435](), [src/client/ClientStrategy.ts:485-656]()

## Type-Safe State Handling

![Mermaid Diagram](./diagrams\24_Signal_States_2.svg)

### Usage Example

The discriminated union enables exhaustive type checking:

```typescript
async function handleTick(strategy: ClientStrategy) {
  const result = await strategy.tick();
  
  switch (result.action) {
    case "idle":
      // result is IStrategyTickResultIdle
      console.log(`No signal, price: ${result.currentPrice}`);
      break;
      
    case "opened":
      // result is IStrategyTickResultOpened
      console.log(`Signal opened: ${result.signal.id}`);
      console.log(`Entry price: ${result.currentPrice}`);
      break;
      
    case "active":
      // result is IStrategyTickResultActive
      console.log(`Monitoring signal: ${result.signal.id}`);
      console.log(`Current VWAP: ${result.currentPrice}`);
      break;
      
    case "closed":
      // result is IStrategyTickResultClosed
      console.log(`Signal closed: ${result.closeReason}`);
      console.log(`PnL: ${result.pnl.pnlPercentage}%`);
      console.log(`Close timestamp: ${result.closeTimestamp}`);
      break;
      
    default:
      // TypeScript ensures exhaustiveness
      const _exhaustive: never = result;
  }
}
```

### State Filtering in Live Mode

The `LiveLogicPrivateService` at [src/lib/services/logic/LiveLogicPrivateService.ts]() filters active states to reduce noise. Only `opened` and `closed` states are yielded to the user in live trading, while backtest mode yields all states for analysis.

**Sources:** [src/interfaces/Strategy.interface.ts:204-208](), [src/client/ClientStrategy.ts:258-464]()