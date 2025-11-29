# Timeframe Generation

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/index.ts](src/index.ts)
- [src/lib/services/logic/private/BacktestLogicPrivateService.ts](src/lib/services/logic/private/BacktestLogicPrivateService.ts)
- [src/lib/services/logic/private/LiveLogicPrivateService.ts](src/lib/services/logic/private/LiveLogicPrivateService.ts)
- [src/lib/services/logic/public/BacktestLogicPublicService.ts](src/lib/services/logic/public/BacktestLogicPublicService.ts)
- [src/lib/services/logic/public/LiveLogicPublicService.ts](src/lib/services/logic/public/LiveLogicPublicService.ts)
- [test/e2e/timing.test.mjs](test/e2e/timing.test.mjs)
- [test/index.mjs](test/index.mjs)
- [types.d.ts](types.d.ts)

</details>



This document explains how `ClientFrame` generates timestamp arrays for backtest iteration. The timeframe generation system produces evenly-spaced `Date` objects representing execution points throughout a historical period, configured by interval, start date, and end date.

For information about how these timestamps are used during backtest execution, see [Backtest Execution Flow](#7.1). For details on fast-forward simulation that occurs after signals open, see [Fast-Forward Simulation](#7.3).

---

## Purpose and Scope

`ClientFrame` is responsible for generating the temporal backbone of backtesting—an array of timestamps that determines when the strategy's `tick()` method is evaluated. This generation happens once per backtest run and is cached for performance.

**Sources:** [src/client/ClientFrame.ts:1-93]()

---

## ClientFrame Architecture

`ClientFrame` implements the `IFrame` interface and resides in the Business Logic Layer. It is instantiated by `FrameConnectionService` based on the schema registered via `addFrame()`.

### Component Interaction

```mermaid
graph TB
    User["User Code"]
    AddFrame["addFrame()"]
    Schema["FrameSchemaService<br/>(Registry)"]
    Conn["FrameConnectionService<br/>(Memoized Factory)"]
    Global["FrameGlobalService<br/>(Context Injection)"]
    Client["ClientFrame"]
    Backtest["BacktestLogicPrivateService"]
    
    User -->|"register IFrameSchema"| AddFrame
    AddFrame -->|"store configuration"| Schema
    Backtest -->|"getTimeframe(symbol)"| Global
    Global -->|"inject context"| Conn
    Conn -->|"lookup schema"| Schema
    Conn -->|"instantiate/cache"| Client
    Client -->|"return Date[]"| Backtest
    
    Schema -.->|"frameName<br/>interval<br/>startDate<br/>endDate"| Client
```

**Sources:** [src/client/ClientFrame.ts:1-93]()

---

## Frame Interval Configuration

The `INTERVAL_MINUTES` constant maps `FrameInterval` enum values to their minute durations. These intervals determine the spacing between generated timestamps.

| Interval | Minutes | Use Case |
|----------|---------|----------|
| `"1m"` | 1 | High-frequency strategies, minute-level signals |
| `"3m"` | 3 | Short-term patterns |
| `"5m"` | 5 | Common intraday interval |
| `"15m"` | 15 | Medium-term intraday |
| `"30m"` | 30 | Half-hour cycles |
| `"1h"` | 60 | Hourly strategies |
| `"2h"`, `"4h"`, `"6h"`, `"8h"` | 120, 240, 360, 480 | Multi-hour cycles |
| `"12h"` | 720 | Twice-daily evaluation |
| `"1d"` | 1440 | Daily strategies |
| `"3d"` | 4320 | Multi-day patterns |

**Sources:** [src/client/ClientFrame.ts:12-26]()

---

## Timestamp Generation Algorithm

The `GET_TIMEFRAME_FN` function implements a simple iterative algorithm to produce the timestamp array.

### Algorithm Flow

```mermaid
flowchart TD
    Start["Start: getTimeframe(symbol)"]
    Extract["Extract params:<br/>interval, startDate, endDate"]
    Lookup["Lookup intervalMinutes<br/>from INTERVAL_MINUTES"]
    Validate["Validate interval exists"]
    Init["Initialize:<br/>timeframes = []<br/>currentDate = startDate"]
    Check{"currentDate <= endDate?"}
    Push["Push new Date(currentDate)<br/>to timeframes"]
    Increment["currentDate += intervalMinutes<br/>* 60 * 1000 ms"]
    Callback{"callbacks.onTimeframe?"}
    Call["Call callback(timeframes,<br/>startDate, endDate, interval)"]
    Return["Return timeframes"]
    
    Start --> Extract
    Extract --> Lookup
    Lookup --> Validate
    Validate --> Init
    Init --> Check
    Check -->|Yes| Push
    Push --> Increment
    Increment --> Check
    Check -->|No| Callback
    Callback -->|Yes| Call
    Callback -->|No| Return
    Call --> Return
    
    style Start fill:#e1f5ff
    style Return fill:#e1f5ff
```

**Sources:** [src/client/ClientFrame.ts:37-62]()

### Implementation Details

The core loop creates `Date` objects with millisecond precision:

- **Start**: Initialize `currentDate` to `startDate` from params
- **Iterate**: While `currentDate <= endDate`:
  - Clone `currentDate` and push to `timeframes` array
  - Increment `currentDate` by `intervalMinutes * 60 * 1000` milliseconds
- **Callback**: Optionally invoke `callbacks.onTimeframe` for validation/logging
- **Return**: Final `Date[]` array

The algorithm ensures inclusive boundaries—both `startDate` and `endDate` are included in the result if they align with interval boundaries.

**Sources:** [src/client/ClientFrame.ts:49-62]()

---

## Singleshot Caching

The `getTimeframe` method is wrapped with the `singleshot` decorator from `functools-kit`, ensuring the timestamp array is generated only once per `ClientFrame` instance.

### Caching Behavior

```mermaid
sequenceDiagram
    participant Backtest as BacktestLogicPrivateService
    participant Frame as ClientFrame
    participant Cache as singleshot cache
    participant Gen as GET_TIMEFRAME_FN
    
    Note over Backtest: First call
    Backtest->>Frame: getTimeframe(symbol)
    Frame->>Cache: Check cache
    Cache-->>Frame: Cache miss
    Frame->>Gen: Execute generation
    Gen-->>Frame: Date[] array
    Frame->>Cache: Store result
    Frame-->>Backtest: Return Date[]
    
    Note over Backtest: Subsequent calls
    Backtest->>Frame: getTimeframe(symbol)
    Frame->>Cache: Check cache
    Cache-->>Frame: Cache hit
    Frame-->>Backtest: Return cached Date[]
    Note over Gen: Not executed
```

This optimization prevents redundant timestamp generation when multiple components or iterations request the same timeframe. The cache is scoped to the `ClientFrame` instance, which is itself memoized per `frameName` by `FrameConnectionService`.

**Sources:** [src/client/ClientFrame.ts:86-89]()

---

## Integration with Backtest Execution

The generated timestamp array drives the backtest loop. `BacktestLogicPrivateService` retrieves the timeframe and iterates through each timestamp, setting it as the execution context.

### Execution Flow

```mermaid
sequenceDiagram
    participant Logic as BacktestLogicPrivateService
    participant FrameGlobal as FrameGlobalService
    participant FrameConn as FrameConnectionService
    participant ClientFrame as ClientFrame
    participant ExecCtx as ExecutionContextService
    participant Strategy as StrategyGlobalService
    
    Logic->>FrameGlobal: getTimeframe(symbol)
    FrameGlobal->>FrameConn: Route via methodContext
    FrameConn->>ClientFrame: getTimeframe(symbol)
    ClientFrame-->>Logic: [Date1, Date2, ..., DateN]
    
    loop For each timestamp in array
        Logic->>ExecCtx: Set context.when = timestamp
        Logic->>Strategy: tick(symbol, timestamp, true)
        Strategy-->>Logic: IStrategyTickResult
        Note over Logic: Process result, potentially<br/>call backtest() for simulation
    end
```

The timestamp array length directly determines backtest duration. For example:
- 30 days at 1-minute intervals: ~43,200 timestamps
- 365 days at 1-hour intervals: ~8,760 timestamps

Memory efficiency is maintained because only one timestamp is active in execution context at a time.

**Sources:** [src/client/ClientFrame.ts:1-93]()

---

## Configuration via IFrameSchema

Users configure timeframe generation through the `IFrameSchema` interface passed to `addFrame()`. The schema defines:

| Property | Type | Description |
|----------|------|-------------|
| `frameName` | `string` | Unique identifier for frame configuration |
| `interval` | `FrameInterval` | Spacing between timestamps (`"1m"` to `"3d"`) |
| `startDate` | `Date` | Beginning of backtest period (inclusive) |
| `endDate` | `Date` | End of backtest period (inclusive) |
| `callbacks` | `Partial<IFrameCallbacks>` | Optional `onTimeframe` hook |

### Registration Example

```typescript
import { addFrame } from "backtest-kit";

addFrame({
  frameName: "2024-Q1-daily",
  interval: "1d",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-03-31T23:59:59Z"),
  callbacks: {
    onTimeframe: (timeframes, start, end, interval) => {
      console.log(`Generated ${timeframes.length} timestamps`);
      console.log(`Range: ${start} to ${end}`);
      console.log(`Interval: ${interval}`);
    }
  }
});
```

The `callbacks.onTimeframe` hook receives the generated array and configuration parameters, enabling validation, logging, or custom processing.

**Sources:** [src/client/ClientFrame.ts:57-59]()

---

## Error Handling

`ClientFrame` throws an error if an invalid interval is provided:

```typescript
if (!intervalMinutes) {
  throw new Error(`ClientFrame unknown interval: ${interval}`);
}
```

This validation occurs during the first `getTimeframe()` call. Since the method is wrapped with `singleshot`, the error is thrown only once and propagates through the call stack to the backtest orchestrator.

**Sources:** [src/client/ClientFrame.ts:44-47]()

---

## Implementation Pattern: Prototype Functions

The `GET_TIMEFRAME_FN` is defined as a standalone function accepting `self: ClientFrame` as a parameter. This pattern is used for memory efficiency:

```typescript
const GET_TIMEFRAME_FN = async (symbol: string, self: ClientFrame) => {
  self.params.logger.debug("ClientFrame getTimeframe", { symbol });
  const { interval, startDate, endDate } = self.params;
  // ... implementation
};

export class ClientFrame implements IFrame {
  public getTimeframe = singleshot(
    async (symbol: string): Promise<Date[]> =>
      await GET_TIMEFRAME_FN(symbol, this)
  );
}
```

This approach avoids creating new function closures for each `ClientFrame` instance, reducing memory overhead when multiple frames are registered.

**Sources:** [src/client/ClientFrame.ts:37-89]()

---

## Relationship to Exchange Intervals

While `ClientFrame` uses `FrameInterval` for timestamp generation, `ClientExchange` uses `CandleInterval` for fetching historical data. These two interval systems are separate:

- **`FrameInterval`**: Determines when strategy `tick()` is called
- **`CandleInterval`**: Determines granularity of OHLCV data fetched

The frame interval can be larger than the candle interval. For example, a strategy might evaluate every 1 hour (`frame.interval = "1h"`) while analyzing 100 1-minute candles (`getCandles("BTCUSDT", "1m", 100)`).

**Sources:** [src/client/ClientFrame.ts:12-26](), [src/client/ClientExchange.ts:7-18]()