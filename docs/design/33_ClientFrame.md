# ClientFrame


## Purpose and Scope

`ClientFrame` is responsible for generating timeframe arrays used in backtesting operations. It produces an ordered sequence of timestamps from a start date to an end date at specified intervals (e.g., 1m, 1h, 1d). These timestamps serve as the iteration points for the backtesting engine, allowing strategies to be evaluated at each discrete time step.

This document covers the implementation details of `ClientFrame`, its integration with the service orchestration layer, and the timeframe generation algorithm. For information about how timeframes are consumed during backtest execution, see [Backtest Execution Flow](./51_Backtest_Execution_Flow.md). For frame configuration and registration, see [Configuration Functions](./15_Configuration_Functions.md).

**Sources:** [src/client/ClientFrame.ts:1-93]()

## Overview

In backtesting, strategies need to be evaluated at regular intervals across a historical date range. Rather than manually managing these timestamps, `ClientFrame` generates them programmatically based on three parameters:

- **startDate**: Beginning of the backtest period
- **endDate**: End of the backtest period  
- **interval**: Time spacing between evaluations (1m, 5m, 1h, etc.)

The generated timeframe array is then consumed by `BacktestLogicPrivateService`, which iterates through each timestamp and triggers strategy evaluation.

**Sources:** [src/client/ClientFrame.ts:64-74]()

## Architecture Integration

![Mermaid Diagram](./diagrams/33_ClientFrame_0.svg)

**ClientFrame Position in Service Hierarchy**

`ClientFrame` sits at the bottom of the frame service stack. The orchestration flow is:

1. `BacktestLogicPrivateService` requests timeframe via `FrameGlobalService`
2. `FrameGlobalService` sets execution context and delegates to `FrameConnectionService`
3. `FrameConnectionService` creates or retrieves cached `ClientFrame` instance
4. `ClientFrame` generates timestamp array and returns it upstream

This layered approach separates configuration (schema layer), context management (global layer), and pure business logic (client layer).

**Sources:** [src/client/ClientFrame.ts:75-90](), High-Level System Architecture Diagram 1

## IFrame Interface

`ClientFrame` implements the `IFrame` interface, which defines a single method:

```typescript
getTimeframe(symbol: string): Promise<Date[]>
```

The `symbol` parameter exists for API consistency but is not used in timeframe generation. This design allows future extensions where different symbols might require different timeframes.

**Sources:** [src/client/ClientFrame.ts:75-90]()

## Constructor Parameters

`ClientFrame` receives an `IFrameParams` object containing:

| Parameter | Type | Description |
|-----------|------|-------------|
| `interval` | `FrameInterval` | Time spacing between timestamps (1m, 5m, 1h, etc.) |
| `startDate` | `Date` | Beginning of backtest period |
| `endDate` | `Date` | End of backtest period |
| `logger` | `ILoggerService` | Logger instance for debug output |
| `callbacks` | `Partial<IFrameCallbacks>` | Optional callbacks (e.g., `onTimeframe`) |

**Sources:** [src/client/ClientFrame.ts:1-6]()

## Supported Intervals

The `INTERVAL_MINUTES` constant maps each `FrameInterval` to its minute equivalent:

| Interval | Minutes | Typical Use Case |
|----------|---------|------------------|
| 1m | 1 | High-frequency strategies |
| 3m | 3 | Short-term strategies |
| 5m | 5 | Intraday strategies |
| 15m | 15 | Swing strategies |
| 30m | 30 | Multi-hour strategies |
| 1h | 60 | Hourly evaluation |
| 2h | 120 | 2-hour evaluation |
| 4h | 240 | 4-hour evaluation |
| 6h | 360 | 6-hour evaluation |
| 8h | 480 | 8-hour evaluation |
| 12h | 720 | Daily boundary tracking |
| 1d | 1440 | Daily strategies |
| 3d | 4320 | Multi-day strategies |

**Sources:** [src/client/ClientFrame.ts:12-26]()

## Timeframe Generation Algorithm

![Mermaid Diagram](./diagrams/33_ClientFrame_1.svg)

**Algorithm Steps**

The `GET_TIMEFRAME_FN` function [src/client/ClientFrame.ts:37-62]() performs the following steps:

1. **Logging**: Debug log the request with symbol
2. **Parameter Extraction**: Extract `interval`, `startDate`, `endDate` from `params`
3. **Interval Lookup**: Map `interval` to minutes using `INTERVAL_MINUTES`
4. **Validation**: Throw error if interval is unknown
5. **Initialization**: Create empty array and set `currentDate` to `startDate`
6. **Iteration Loop**: While `currentDate <= endDate`:
   - Clone `currentDate` and push to array
   - Increment `currentDate` by `intervalMinutes * 60 * 1000` milliseconds
7. **Callback Invocation**: If `onTimeframe` callback exists, invoke it
8. **Return**: Return generated timeframe array

**Sources:** [src/client/ClientFrame.ts:37-62]()

## Singleshot Caching Pattern

The `getTimeframe` method uses the `singleshot` pattern from `functools-kit`:

```typescript
public getTimeframe = singleshot(
  async (symbol: string): Promise<Date[]> =>
    await GET_TIMEFRAME_FN(symbol, this)
);
```

**Caching Behavior**

The `singleshot` decorator ensures that:
- First call to `getTimeframe(symbol)` executes `GET_TIMEFRAME_FN` and caches the result
- Subsequent calls return the cached value without re-execution
- Cache key is the `symbol` parameter

This optimization prevents redundant timeframe generation when multiple components request the same symbol's timeframe. Since timeframes are deterministic (same inputs always produce same output), caching is safe and improves performance.

**Sources:** [src/client/ClientFrame.ts:86-89]()

## Callback System

The `IFrameCallbacks` interface provides hooks for observing timeframe generation:

```typescript
callbacks?: {
  onTimeframe?: (
    timeframes: Date[],
    startDate: Date,
    endDate: Date,
    interval: FrameInterval
  ) => void;
}
```

**Usage Scenarios**

- **Validation**: Verify expected number of timestamps
- **Logging**: Track timeframe size for performance monitoring
- **Testing**: Assert correct timestamp spacing in unit tests

The callback is invoked after timeframe generation completes [src/client/ClientFrame.ts:57-59]().

**Sources:** [src/client/ClientFrame.ts:57-59]()

## Integration with Backtest Flow

![Mermaid Diagram](./diagrams/33_ClientFrame_2.svg)

**Backtest Orchestration**

`BacktestLogicPrivateService` uses the timeframe as the outer loop for backtesting:

1. Request timeframe via `FrameGlobalService.getTimeframe(symbol)`
2. Receive array of timestamps
3. For each timestamp:
   - Set execution context to timestamp
   - Trigger strategy evaluation
   - Process signals

The timeframe array is generated once and reused for the entire backtest run, thanks to singleshot caching.

**Sources:** [src/client/ClientFrame.ts:1-93](), High-Level System Architecture Diagram 2

## Memory Efficiency Considerations

**Array Size Calculation**

For a 1-year backtest with 1m intervals:
- Days: 365
- Minutes per day: 1440
- Total timestamps: ~525,600

Each `Date` object is approximately 24 bytes in JavaScript. Total memory for timeframe array:
- 525,600 × 24 bytes = ~12 MB

**Prototype Function Pattern**

The implementation uses a separate `GET_TIMEFRAME_FN` function instead of defining logic inline in the method [src/client/ClientFrame.ts:37-62](). This pattern:
- Defines the function once in memory
- Shares the function across all `ClientFrame` instances
- Reduces memory overhead when multiple frame instances exist

**Alternative Approaches**

For extremely large backtests (e.g., 10+ years at 1m intervals), consider:
- Generator functions that yield timestamps on-demand
- Chunked timeframe processing
- Reducing interval granularity (e.g., 5m instead of 1m)

However, for typical use cases (months to years of data at 1m-1h intervals), the current array-based approach provides optimal performance.

**Sources:** [src/client/ClientFrame.ts:29-30](), [src/client/ClientFrame.ts:37-62]()

## Comparison with ClientExchange

Both `ClientFrame` and `ClientExchange` are client-layer components, but serve different purposes:

| Aspect | ClientFrame | ClientExchange |
|--------|-------------|----------------|
| **Purpose** | Generate timeframe for iteration | Fetch candle data for strategy evaluation |
| **Input** | `startDate`, `endDate`, `interval` | `symbol`, `interval`, `limit` |
| **Output** | `Date[]` | `ICandleData[]` |
| **Caching** | Singleshot (permanent) | No caching (each request fetches fresh data) |
| **Context Dependency** | Uses `startDate`/`endDate` from params | Uses `execution.context.when` for time reference |
| **Backtest Role** | Defines outer loop timestamps | Provides data for each timestamp |

`ClientFrame` establishes *when* to evaluate, while `ClientExchange` provides *what data* to evaluate. Both are orchestrated by `BacktestLogicPrivateService`.

**Sources:** [src/client/ClientFrame.ts:1-93](), [src/client/ClientExchange.ts:1-223]()

## Error Handling

The only error condition is an unknown interval:

```typescript
if (!intervalMinutes) {
  throw new Error(`ClientFrame unknown interval: ${interval}`);
}
```

This error occurs if:
- An invalid `FrameInterval` is passed (should be caught by TypeScript)
- The `INTERVAL_MINUTES` mapping is incomplete (developer error)

Since `FrameInterval` is a type union, TypeScript prevents invalid intervals at compile time. The runtime check serves as a defensive safeguard.

**Sources:** [src/client/ClientFrame.ts:45-47]()

## Testing Considerations

**Unit Test Scenarios**

1. **Basic Generation**: Verify correct number of timestamps for known date ranges
2. **Interval Spacing**: Assert timestamps are spaced by exact interval
3. **Boundary Conditions**: Test when `startDate === endDate`
4. **Multiple Intervals**: Verify different intervals produce correct spacing
5. **Callback Invocation**: Ensure `onTimeframe` is called with correct parameters
6. **Caching**: Verify singleshot prevents re-execution
7. **Unknown Interval**: Assert error thrown for invalid intervals

**Example Test Structure**

```typescript
describe('ClientFrame', () => {
  it('generates correct timestamps for 1m interval', async () => {
    const frame = new ClientFrame({
      interval: '1m',
      startDate: new Date('2024-01-01T00:00:00Z'),
      endDate: new Date('2024-01-01T00:05:00Z'),
      logger: mockLogger,
    });
    
    const timeframe = await frame.getTimeframe('BTCUSDT');
    
    expect(timeframe.length).toBe(6); // 00:00, 00:01, 00:02, 00:03, 00:04, 00:05
    expect(timeframe[1].getTime() - timeframe[0].getTime()).toBe(60_000);
  });
});
```

**Sources:** [src/client/ClientFrame.ts:1-93]()

## Configuration Example

Frames are registered via `addFrame` in the configuration phase:

```typescript
import { addFrame } from 'backtest-kit';

addFrame({
  frameName: 'daily-2024',
  interval: '1d',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
});
```

This schema is stored in `FrameSchemaService` and later used by `FrameConnectionService` to instantiate `ClientFrame` with the specified parameters.

**Sources:** [src/client/ClientFrame.ts:1-93]()