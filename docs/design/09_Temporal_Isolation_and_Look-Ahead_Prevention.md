---
title: design/09_temporal_isolation_and_look-ahead_prevention
group: design
---

# Temporal Isolation and Look-Ahead Prevention

## Purpose and Scope

This page explains how backtest-kit prevents look-ahead bias—the critical flaw where backtesting code accidentally uses future data that wouldn't be available in real-time trading. The system achieves this through **temporal isolation** using Node.js `AsyncLocalStorage` to enforce strict time boundaries during strategy execution.

For information about the three execution modes (Backtest, Live, Walker) and how they handle data differently, see [Execution Modes](./06_Execution_Modes.md). For details about the overall component registration pattern, see [Component Registration](./08_Component_Registration.md).

---

## The Look-Ahead Bias Problem

Look-ahead bias occurs when backtesting code accesses data from the future, producing unrealistically profitable results that fail in live trading. Common scenarios include:

| Bias Type | Example | Impact |
|-----------|---------|--------|
| **Direct Future Access** | Fetching tomorrow's price to decide today's trade | Strategy appears profitable but impossible to execute live |
| **Multi-Timeframe Misalignment** | Using 1-hour candle that includes next 30 minutes while making 1-minute decisions | Signals generated with information not yet available |
| **Indicator Calculation** | Computing moving average using data points from the future | Indicators predict with perfect foresight |
| **VWAP Contamination** | Calculating volume-weighted average price including future volume | Entry/exit prices artificially favorable |

Traditional backtesting frameworks require manual timestamp management, making it easy to introduce subtle look-ahead bugs. backtest-kit makes look-ahead bias **architecturally impossible** through automatic temporal isolation.

**Sources**: README.md:190-199, types.d.ts:5-18

---

## Architecture Overview: Context Propagation

![Mermaid Diagram](./diagrams/09_Temporal_Isolation_and_Look-Ahead_Prevention_0.svg)

**Key Components**:

1. **ExecutionContextService** ([types.d.ts:38-44]()): Scoped service wrapping AsyncLocalStorage for implicit context passing
2. **IExecutionContext** ([types.d.ts:11-18]()): Contains `symbol` (trading pair), `when` (current timestamp), `backtest` (mode flag)
3. **BacktestLogicPrivateService**: Sets `when` to each frame timestamp during historical iteration
4. **LiveLogicPrivateService**: Sets `when` to `Date.now()` for real-time execution
5. **ClientExchange.getCandles()**: Filters candle data to only return records with `timestamp <= context.when`

**Sources**: types.d.ts:11-18, types.d.ts:38-44, README.md:190-199, src/client/ClientStrategy.ts:339

---

## Temporal Filtering Mechanism

### Data Access Timeline

![Mermaid Diagram](./diagrams/09_Temporal_Isolation_and_Look-Ahead_Prevention_1.svg)

### Filtering Logic Sequence

At each backtest tick, the following sequence executes:

1. **Context Establishment**: `BacktestLogicPrivateService` calls `ExecutionContextService.runInContext()` with current frame timestamp
2. **AsyncLocalStorage Activation**: Context stored in Node.js async context for the duration of the callback
3. **Strategy Invocation**: `ClientStrategy.tick()` calls user's `getSignal(symbol, when)` function
4. **Data Requests**: Strategy code calls `getCandles()`, `getAveragePrice()`, etc.
5. **Context Retrieval**: Data access functions read `execution.context.when` from AsyncLocalStorage
6. **Temporal Filtering**: Exchange implementation filters: `candles.filter(c => c.timestamp <= context.when)`
7. **Historical Data Only**: Only past data returned to strategy

**Sources**: types.d.ts:38-44, README.md:190-199

---

## Implementation: ExecutionContextService

### Type Definition

```typescript
// From types.d.ts:11-18
interface IExecutionContext {
    symbol: string;      // Trading pair (e.g., "BTCUSDT")
    when: Date;          // Current timestamp for operation
    backtest: boolean;   // true = backtest, false = live
}
```

### Service Declaration

```typescript
// From types.d.ts:38-44
declare const ExecutionContextService: 
    (new () => { readonly context: IExecutionContext }) 
    & di_scoped.IScopedClassRun<[context: IExecutionContext]>;
```

The `IScopedClassRun` interface from `di-scoped` provides:
- **runInContext(callback, context)**: Executes callback with context in AsyncLocalStorage
- **Automatic propagation**: Context available in all nested async calls without explicit parameter passing
- **Isolation**: Different execution branches have separate contexts

### Usage Pattern

```typescript
// Backtest mode: iterate through historical timestamps
for (const timestamp of timeframes) {
    await ExecutionContextService.runInContext(
        async () => {
            // Strategy executes here
            // All data access automatically filtered to <= timestamp
            const result = await strategy.tick(symbol, strategyName);
            return result;
        },
        { symbol: "BTCUSDT", when: timestamp, backtest: true }
    );
}

// Live mode: use current time
await ExecutionContextService.runInContext(
    async () => {
        const result = await strategy.tick(symbol, strategyName);
        return result;
    },
    { symbol: "BTCUSDT", when: new Date(), backtest: false }
);
```

**Sources**: types.d.ts:11-18, types.d.ts:38-44

---

## Public API Functions with Temporal Context

### getCandles()

![Mermaid Diagram](./diagrams/09_Temporal_Isolation_and_Look-Ahead_Prevention_2.svg)

**Function Signature**:
```typescript
getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>
```

**Behavior**:
- **Backtest Mode**: Returns last `limit` candles up to `context.when`
- **Live Mode**: Returns last `limit` candles up to `Date.now()` (same as backtest behavior)
- **No timestamp parameter needed**: Context provides it implicitly

**Example**:
```typescript
// In strategy code - no explicit timestamp needed
const candles1h = await getCandles("BTCUSDT", "1h", 24);  // Last 24 hours
const candles5m = await getCandles("BTCUSDT", "5m", 60);  // Last 60 periods
```

**Sources**: README.md:123-127, types.d.ts:169

---

### getAveragePrice()

```typescript
getAveragePrice(symbol: string): Promise<number>
```

**Behavior**:
- Fetches last 5 1-minute candles (configurable via `CC_AVG_PRICE_CANDLES_COUNT`)
- Calculates VWAP: `Σ(Typical Price × Volume) / Σ(Volume)`
- Where Typical Price = `(High + Low + Close) / 3`
- **Temporal filtering**: Only uses candles with `timestamp <= context.when`

**Usage in ClientStrategy** ([src/client/ClientStrategy.ts:354-356]()):
```typescript
const currentPrice = await self.params.exchange.getAveragePrice(
    self.params.execution.context.symbol
);
```

**Sources**: types.d.ts:196-204, src/client/ClientStrategy.ts:354

---

### getDate() and getMode()

```typescript
getDate(): Date        // Returns execution.context.when
getMode(): boolean     // Returns execution.context.backtest
```

**Purpose**:
- **getDate()**: Access current "simulation time" in backtest or real time in live mode
- **getMode()**: Conditional logic based on execution mode

**Example**:
```typescript
const currentTime = getDate();
const isBacktest = getMode();

if (isBacktest) {
    // Backtest-specific logic (e.g., logging without API calls)
} else {
    // Live trading logic (e.g., send alerts)
}
```

**Sources**: src/index.ts:59-63, types.d.ts:11-18

---

## Multi-Timeframe Data Synchronization

### The Challenge

Strategies often analyze multiple timeframes simultaneously:
```typescript
const candles1m = await getCandles(symbol, "1m", 30);  // Last 30 minutes
const candles5m = await getCandles(symbol, "5m", 24);  // Last 2 hours
const candles1h = await getCandles(symbol, "1h", 24);  // Last 24 hours
```

**Problem in traditional systems**: Each call could return data from different time points if not carefully synchronized.

### Automatic Synchronization

![Mermaid Diagram](./diagrams/09_Temporal_Isolation_and_Look-Ahead_Prevention_3.svg)

**Guarantee**: All data fetched within a single `runInContext()` callback shares the same temporal boundary. Look-ahead bias across timeframes is architecturally impossible.

**Sources**: README.md:195-198

---

## Backtest vs Live Mode Behavior

### Identical Code, Different Time Sources

| Aspect | Backtest Mode | Live Mode |
|--------|---------------|-----------|
| **Context Source** | `BacktestLogicPrivateService` | `LiveLogicPrivateService` |
| **when Value** | Frame timestamp (historical) | `Date.now()` (current time) |
| **backtest Flag** | `true` | `false` |
| **Data Access** | Filtered to historical | Filtered to current (same logic) |
| **Persistence** | In-memory only | Atomic file writes (crash recovery) |
| **Iteration** | Fast-forward through frames | Real-time tick loop |

### Code Example: Mode-Agnostic Strategy

```typescript
// This exact code runs in both backtest and live mode
addStrategy({
    strategyName: "my-strategy",
    interval: "5m",
    getSignal: async (symbol) => {
        // getDate() returns frame timestamp (backtest) or Date.now() (live)
        const currentTime = getDate();
        
        // getCandles() filters to <= currentTime automatically
        const candles1h = await getCandles(symbol, "1h", 24);
        const candles5m = await getCandles(symbol, "5m", 60);
        
        // Calculate indicators using historical data only
        const sma20 = calculateSMA(candles5m, 20);
        const rsi = calculateRSI(candles1h, 14);
        
        // Generate signal (same logic for both modes)
        if (rsi < 30 && sma20 > candles5m[0].close) {
            return {
                position: "long",
                priceTakeProfit: candles5m[0].close * 1.02,
                priceStopLoss: candles5m[0].close * 0.98,
                minuteEstimatedTime: 60,
            };
        }
        
        return null;
    },
});

// Run backtest
Backtest.background("BTCUSDT", {
    strategyName: "my-strategy",
    exchangeName: "binance",
    frameName: "1d-test",  // Historical period
});

// Run live (same strategy code)
Live.background("BTCUSDT", {
    strategyName: "my-strategy",
    exchangeName: "binance",  // Live API
});
```

**Key Insight**: The strategy code never explicitly handles timestamps. Temporal isolation is enforced by the execution engine, not by user code discipline.

**Sources**: README.md:146-171, types.d.ts:11-18

---

## Context Propagation Through Call Stack

### AsyncLocalStorage Behavior

![Mermaid Diagram](./diagrams/09_Temporal_Isolation_and_Look-Ahead_Prevention_4.svg)

**Key Characteristics**:
1. **No explicit parameter passing**: `when` timestamp never appears in user function signatures
2. **Automatic propagation**: Context flows through `await`, `Promise.then()`, `async` functions automatically
3. **Call stack isolation**: Nested contexts don't interfere (important for parallel execution)
4. **Memory efficiency**: Context destroyed after callback completes

**Sources**: types.d.ts:38-44

---

## Validation and Testing

### Test Case: Look-Ahead Protection

From [test/e2e/defend.test.mjs:1519-1653](), a test verifies extreme volatility scenarios where both TP and SL are hit on a single candle:

```typescript
test("DEFEND: Extreme volatility - price crosses both TP and SL in single candle", 
    async ({ pass, fail }) => {
    // Candle with: low=40500 (< SL), high=43500 (> TP)
    // Strategy: priceOpen=42000, TP=43000, SL=41000
    
    // Expected: Closes at TP (not SL)
    // Because temporal ordering: price rises first (TP), then falls (SL)
    // Confirms temporal filtering respects candle internal structure
});
```

**What This Tests**:
- Context provides single timestamp per candle
- Both TP and SL conditions checked within that timestamp
- Correct exit selection based on candle data
- No access to "future" candles during decision

### Test Case: Scheduled Signal Temporal Isolation

From [test/e2e/defend.test.mjs:1393-1507](), a test verifies scheduled signals cannot access future data:

```typescript
test("DEFEND: Scheduled LONG cancelled by SL BEFORE activation", 
    async ({ pass, fail }) => {
    // Price: 45000 → 39000 (skips priceOpen=42000)
    // StopLoss=40000 hit without activation
    
    // Expected: Signal cancelled (not opened)
    // Confirms context enforces activation timing
});
```

**Sources**: test/e2e/defend.test.mjs:1519-1653, test/e2e/defend.test.mjs:1393-1507

---

## Performance Considerations

### Context Overhead

| Operation | Overhead | Impact |
|-----------|----------|--------|
| **AsyncLocalStorage creation** | ~1µs per context | Negligible (once per tick) |
| **Context read** | ~100ns | Negligible (cached in V8) |
| **Call stack propagation** | 0ns | No cost (native async_hooks) |
| **Memory per context** | ~200 bytes | Minimal (short-lived) |

**Benchmark**: 10,000 ticks/second sustainable on modern hardware with full context propagation.

### Optimization: Context Caching

The `ExecutionContextService` instance is memoized per execution, avoiding repeated DI lookups:

```typescript
// From connection service pattern
const getExchange = memoize((symbol: string, exchangeName: string) => {
    return new ClientExchange({
        execution: ExecutionContextService,  // Same instance reused
        // ...
    });
});
```

**Sources**: README.md:190-199

---

## Common Patterns and Anti-Patterns

### ✅ Correct: Implicit Context Usage

```typescript
getSignal: async (symbol) => {
    // CORRECT: No timestamp parameters
    const candles = await getCandles(symbol, "1h", 24);
    const price = await getAveragePrice(symbol);
    const now = getDate();
    
    // Strategy logic using historical data only
}
```

### ❌ Anti-Pattern: Manual Timestamp Management

```typescript
getSignal: async (symbol, when) => {
    // WRONG: Don't manage timestamps manually
    // This bypasses temporal isolation
    const candles = await fetchCandlesDirect(symbol, when);  // Bad!
    
    // CORRECT: Use provided functions
    const candles = await getCandles(symbol, "1h", 24);  // Good!
}
```

### ✅ Correct: Multi-Timeframe Analysis

```typescript
getSignal: async (symbol) => {
    // All fetches automatically synchronized to same 'when'
    const [candles1m, candles5m, candles1h] = await Promise.all([
        getCandles(symbol, "1m", 30),
        getCandles(symbol, "5m", 24),
        getCandles(symbol, "1h", 24),
    ]);
    
    // All data aligned to same temporal boundary
}
```

### ❌ Anti-Pattern: Storing Context Reference

```typescript
let savedContext;

getSignal: async (symbol) => {
    // WRONG: Don't store context across ticks
    if (!savedContext) {
        savedContext = ExecutionContextService;  // Bad!
    }
    
    // CORRECT: Context is ephemeral, accessed per-call
    const now = getDate();  // Good!
}
```

**Sources**: README.md:111-143, types.d.ts:144

---

## Integration with Other Systems

### ClientStrategy Context Usage

From [src/client/ClientStrategy.ts:339]():
```typescript
const currentTime = self.params.execution.context.when.getTime();
```

The strategy client directly reads `execution.context.when` for:
- Signal throttling (interval enforcement)
- Timestamp assignment (`scheduledAt`, `pendingAt`)
- Time-based validation

### ClientExchange Temporal Filtering

The exchange client implements filtering in `getCandles()`:
```typescript
getCandles: async (symbol, interval, limit) => {
    const execution = inject(ExecutionContextService);
    const rawCandles = await schema.getCandles(symbol, interval, since, limit);
    
    // Temporal filter
    return rawCandles.filter(c => c.timestamp <= execution.context.when.getTime());
}
```

### Risk Management Integration

Risk validation receives current price via `getAveragePrice()`, which automatically respects temporal boundaries:

```typescript
// From IRiskValidationPayload
interface IRiskValidationPayload {
    currentPrice: number;  // Always historical in backtest
    // ...
}
```

**Sources**: src/client/ClientStrategy.ts:339, types.d.ts:382-390

---

## Limitations and Edge Cases

### 1. External API Calls

If strategy code makes direct HTTP requests (bypassing `getCandles()`), temporal isolation **does not apply**:

```typescript
getSignal: async (symbol) => {
    // UNSAFE: External API bypasses context
    const news = await fetch(`https://api.example.com/news?symbol=${symbol}`);
    
    // In backtest: receives current/future news (look-ahead bias!)
    // In live: works correctly
}
```

**Mitigation**: Use `IOptimizerSource` pattern for external data with proper date filtering.

### 2. File System Access

Reading from disk files directly does not respect temporal context:

```typescript
getSignal: async (symbol) => {
    // UNSAFE: File contains all-time data
    const allData = await fs.readFile(`./data/${symbol}.json`);
    
    // Must manually filter by getDate()
    const filteredData = allData.filter(d => d.timestamp <= getDate());
}
```

### 3. Shared State Across Ticks

Mutable state persisted across ticks can leak future information:

```typescript
let globalCache = {};  // DANGEROUS!

getSignal: async (symbol) => {
    // In backtest: cache may contain future data from previous ticks
    if (globalCache[symbol]) {
        // Potentially using future data
    }
    
    // SAFE: Clear cache or use tick-local state
    const localCache = {};
}
```

**Sources**: types.d.ts:144, README.md:190-199

---

## Summary

| Feature | Implementation | Benefit |
|---------|----------------|---------|
| **Temporal Isolation** | `ExecutionContextService` + AsyncLocalStorage | Architecturally prevents look-ahead bias |
| **Implicit Context** | No timestamp parameters in user code | Simpler API, fewer bugs |
| **Multi-Timeframe Sync** | Shared `when` across all data fetches | Automatic alignment, no manual coordination |
| **Mode Independence** | Same context pattern for backtest/live | Write once, run anywhere |
| **Zero Overhead** | Native async_hooks, ~100ns reads | Production-grade performance |

The temporal isolation system makes it **impossible** to accidentally introduce look-ahead bias through normal API usage. The `when` timestamp is enforced at the framework level, not relying on developer discipline.

**Sources**: types.d.ts:11-18, types.d.ts:38-44, README.md:190-199, src/client/ClientStrategy.ts:339