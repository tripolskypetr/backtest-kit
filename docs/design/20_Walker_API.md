# Walker API

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/classes/BacktestUtils.md](docs/classes/BacktestUtils.md)
- [docs/classes/LiveUtils.md](docs/classes/LiveUtils.md)
- [docs/classes/StrategyConnectionService.md](docs/classes/StrategyConnectionService.md)
- [docs/classes/WalkerUtils.md](docs/classes/WalkerUtils.md)
- [docs/index.md](docs/index.md)
- [docs/interfaces/IStrategySchema.md](docs/interfaces/IStrategySchema.md)
- [docs/interfaces/WalkerStopContract.md](docs/interfaces/WalkerStopContract.md)
- [docs/types/IStrategyBacktestResult.md](docs/types/IStrategyBacktestResult.md)
- [docs/types/TPersistBaseCtor.md](docs/types/TPersistBaseCtor.md)
- [src/classes/Backtest.ts](src/classes/Backtest.ts)
- [src/classes/Live.ts](src/classes/Live.ts)
- [src/classes/Walker.ts](src/classes/Walker.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)

</details>



The Walker API provides methods for running comparative strategy backtests across multiple strategies on the same symbol. It orchestrates sequential backtest execution, aggregates results, and ranks strategies by configurable metrics (Sharpe ratio, win rate, etc.). This API reuses the backtest infrastructure internally while providing specialized methods for multi-strategy comparison and reporting.

**Related Pages**: For running individual strategy backtests, see [Backtest API](#4.3). For live trading execution, see [Live Trading API](#4.4). For detailed walker execution flow and comparison logic, see [Walker Mode](#11). For walker schema configuration, see [Walker Schemas](#5.6).

---

## Architecture Overview

The Walker API follows the same architectural pattern as Backtest and Live APIs, consisting of an instance class for isolated execution and a utility class providing convenient singleton access.

```mermaid
graph TB
    subgraph "Public API Layer"
        WALKER_SINGLETON["Walker<br/>(singleton)"]
        WALKER_UTILS["WalkerUtils<br/>(utility class)"]
    end
    
    subgraph "Instance Layer"
        GET_INSTANCE["_getInstance()<br/>(memoized)"]
        WALKER_INST["WalkerInstance<br/>(per symbol-walker)"]
    end
    
    subgraph "Internal Execution"
        TASK["task()<br/>(singlerun wrapper)"]
        TASK_FN["INSTANCE_TASK_FN<br/>(task implementation)"]
    end
    
    subgraph "Service Layer"
        WALKER_CMD["walkerCommandService"]
        WALKER_LOGIC["WalkerLogicPublicService"]
        BACKTEST_LOGIC["BacktestLogicPublicService"]
    end
    
    subgraph "Schema & Validation"
        WALKER_SCHEMA["walkerSchemaService"]
        WALKER_VAL["walkerValidationService"]
        STRATEGY_VAL["strategyValidationService"]
        EXCHANGE_VAL["exchangeValidationService"]
    end
    
    subgraph "Reporting"
        WALKER_MD["walkerMarkdownService"]
        BACKTEST_MD["backtestMarkdownService"]
    end
    
    WALKER_SINGLETON -->|"exports"| WALKER_UTILS
    WALKER_UTILS -->|"uses"| GET_INSTANCE
    GET_INSTANCE -->|"creates/caches"| WALKER_INST
    
    WALKER_INST -->|"run()"| WALKER_CMD
    WALKER_INST -->|"background()"| TASK
    TASK -->|"executes"| TASK_FN
    TASK_FN -->|"consumes"| WALKER_INST
    
    WALKER_CMD --> WALKER_LOGIC
    WALKER_LOGIC -->|"sequential backtests"| BACKTEST_LOGIC
    
    WALKER_UTILS -->|"validates"| WALKER_VAL
    WALKER_UTILS -->|"validates"| STRATEGY_VAL
    WALKER_UTILS -->|"validates"| EXCHANGE_VAL
    WALKER_UTILS -->|"retrieves"| WALKER_SCHEMA
    
    WALKER_INST -->|"getData/getReport"| WALKER_MD
    WALKER_INST -->|"clears"| BACKTEST_MD
```

**Sources**: [src/classes/Walker.ts:1-677]()

---

## Class Structure

### WalkerInstance

The `WalkerInstance` class provides isolated walker execution for a specific symbol-walker pair. Each instance maintains its own state including stop flags and completion status.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Randomly generated unique identifier |
| `symbol` | `string` | Trading pair symbol (e.g., "BTCUSDT") |
| `walkerName` | `WalkerName` | Walker configuration name |
| `_isStopped` | `boolean` | Internal flag indicating manual stop |
| `_isDone` | `boolean` | Internal flag indicating task completion |

**Sources**: [src/classes/Walker.ts:71-90]()

### WalkerUtils

The `WalkerUtils` class provides simplified access to walker functionality with automatic validation and schema resolution. The singleton instance `Walker` is exported for convenient usage.

| Method | Return Type | Description |
|--------|-------------|-------------|
| `run()` | `AsyncGenerator<WalkerContract>` | Runs walker with progress updates |
| `background()` | `() => void` | Runs walker in background, returns cancellation |
| `stop()` | `Promise<void>` | Stops all strategies in walker |
| `getData()` | `Promise<WalkerCompleteContract>` | Gets aggregated comparison results |
| `getReport()` | `Promise<string>` | Generates markdown report |
| `dump()` | `Promise<void>` | Saves report to disk |
| `list()` | `Promise<Array<Status>>` | Lists all active walker instances |

**Sources**: [src/classes/Walker.ts:460-838]()

---

## Core Methods

### run()

Runs walker comparison for a symbol, yielding progress updates after each strategy completes its backtest.

**Signature**:
```typescript
run(
  symbol: string,
  context: { walkerName: string }
): AsyncGenerator<WalkerContract, any, any>
```

**Parameters**:
- `symbol` - Trading pair symbol (e.g., "BTCUSDT")
- `context.walkerName` - Name of registered walker configuration

**Yields**: `WalkerContract` objects containing:
- `strategiesTested` - Number of strategies completed
- `totalStrategies` - Total strategies to test
- `bestStrategy` - Current best strategy by metric
- `bestMetric` - Best metric value achieved

**Behavior**:
1. Validates walker, exchange, frame, and all strategy registrations
2. Validates risk profiles for strategies that use them
3. Clears cached data for walker and all strategies
4. Orchestrates sequential backtest execution via `walkerCommandService`
5. Yields progress after each strategy completes
6. Emits `doneWalkerSubject` event upon completion

**Example**:
```typescript
for await (const progress of Walker.run("BTCUSDT", {
  walkerName: "momentum-comparison"
})) {
  console.log(
    `Progress: ${progress.strategiesTested}/${progress.totalStrategies}`
  );
  console.log(
    `Best: ${progress.bestStrategy} (${progress.bestMetric})`
  );
}
```

**Sources**: [src/classes/Walker.ts:480-525](), [src/classes/Walker.ts:156-219]()

---

### background()

Runs walker comparison in background without yielding results. Useful for running walker for side effects only (callbacks, logging, report generation).

**Signature**:
```typescript
background(
  symbol: string,
  context: { walkerName: string }
): () => void
```

**Parameters**:
- `symbol` - Trading pair symbol
- `context.walkerName` - Name of registered walker configuration

**Returns**: Cancellation function that stops all strategies and emits completion event

**Behavior**:
1. Validates walker and all component registrations
2. Spawns background task wrapped with `singlerun` to prevent duplicate execution
3. Returns immediately with cancellation closure
4. Task executes asynchronously, consuming all progress updates
5. Errors are caught and emitted via `exitEmitter`

**Cancellation Behavior**:
- Stops all strategies in walker via `strategyCoreService.stop()`
- Emits stop signal via `walkerStopSubject` for each strategy
- Emits `doneWalkerSubject` if not already done
- Sets instance `_isStopped` and `_isDone` flags

**Example**:
```typescript
const cancel = Walker.background("BTCUSDT", {
  walkerName: "momentum-comparison"
});

// Later, to stop:
cancel();
```

**Sources**: [src/classes/Walker.ts:546-591](), [src/classes/Walker.ts:239-275]()

---

### stop()

Stops all strategies in the walker from generating new signals. Current active signals will complete normally. Walker will stop at the next safe point.

**Signature**:
```typescript
stop(symbol: string, walkerName: WalkerName): Promise<void>
```

**Parameters**:
- `symbol` - Trading pair symbol
- `walkerName` - Walker name to stop

**Behavior**:
1. Validates walker and all strategy registrations
2. Iterates through all strategies in walker schema
3. For each strategy:
   - Emits stop signal via `walkerStopSubject`
   - Calls `strategyCoreService.stop()` to set internal stop flag
4. Does NOT force-close active signals
5. Supports multiple walkers on same symbol (filtered by `walkerName`)

**Stop Signal Flow**:
```mermaid
sequenceDiagram
    participant API as "Walker.stop()"
    participant Schema as "walkerSchemaService"
    participant Subject as "walkerStopSubject"
    participant Strategy as "strategyCoreService"
    
    API->>Schema: "get(walkerName)"
    Schema-->>API: "{ strategies: [...] }"
    
    loop "For each strategy"
        API->>Subject: "next({ symbol, strategyName, walkerName })"
        API->>Strategy: "stop({ symbol, strategyName }, true)"
        Note over Strategy: "Sets _isStopped flag"
        Note over Strategy: "Backtest mode: true"
    end
    
    Note over API: "Returns after all stops set"
    Note over Strategy: "Active signals complete naturally"
```

**Example**:
```typescript
// Stop walker gracefully
await Walker.stop("BTCUSDT", "momentum-comparison");

// Active signals will reach TP/SL/timeout normally
// No new signals will be generated
```

**Sources**: [src/classes/Walker.ts:616-650](), [src/classes/Walker.ts:300-315]()

---

### getData()

Retrieves aggregated walker results data from all strategy comparisons. Data is computed by `walkerMarkdownService` based on backtest results for each strategy.

**Signature**:
```typescript
getData(
  symbol: string,
  walkerName: WalkerName
): Promise<WalkerCompleteContract>
```

**Parameters**:
- `symbol` - Trading symbol
- `walkerName` - Walker name to get data for

**Returns**: `WalkerCompleteContract` containing:
- `bestStrategy` - Best strategy by configured metric
- `bestMetric` - Best metric value
- `strategies` - Array of strategy results with per-strategy statistics
- Aggregated portfolio metrics

**Data Structure**:
```typescript
interface WalkerCompleteContract {
  bestStrategy: string;
  bestMetric: number;
  strategies: IWalkerStrategyResult[];
  // Plus aggregated portfolio stats
}

interface IWalkerStrategyResult {
  strategyName: string;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  pnlPercentage: number;
  // Plus other metrics
}
```

**Example**:
```typescript
const results = await Walker.getData("BTCUSDT", "momentum-comparison");

console.log(`Best: ${results.bestStrategy}`);
console.log(`Sharpe Ratio: ${results.bestMetric}`);

results.strategies.forEach(s => {
  console.log(`${s.strategyName}: ${s.sharpeRatio.toFixed(2)}`);
});
```

**Sources**: [src/classes/Walker.ts:665-696](), [src/classes/Walker.ts:331-348]()

---

### getReport()

Generates comprehensive markdown report with all strategy comparisons, statistics, and rankings. Report includes strategy-by-strategy breakdown and aggregated metrics.

**Signature**:
```typescript
getReport(
  symbol: string,
  walkerName: WalkerName
): Promise<string>
```

**Parameters**:
- `symbol` - Trading symbol
- `walkerName` - Walker name to generate report for

**Returns**: Markdown formatted report string

**Report Contents**:
- Walker configuration summary
- Strategy rankings by metric
- Per-strategy statistics tables
- Aggregated portfolio metrics
- Best/worst performing strategies

**Example**:
```typescript
const markdown = await Walker.getReport("BTCUSDT", "momentum-comparison");
console.log(markdown);

// Output format:
// # Walker: momentum-comparison
// Symbol: BTCUSDT
// Metric: sharpeRatio
// 
// ## Rankings
// 1. ema-cross: 2.34
// 2. rsi-reversal: 1.87
// ...
```

**Sources**: [src/classes/Walker.ts:713-754](), [src/classes/Walker.ts:366-390]()

---

### dump()

Saves walker report to disk. Default location is `./dump/walker/{walkerName}.md`.

**Signature**:
```typescript
dump(
  symbol: string,
  walkerName: WalkerName,
  path?: string
): Promise<void>
```

**Parameters**:
- `symbol` - Trading symbol
- `walkerName` - Walker name to save report for
- `path` - Optional custom directory path (default: "./dump/walker")

**File Naming**: `{walkerName}.md` in specified directory

**Example**:
```typescript
// Save to default path: ./dump/walker/momentum-comparison.md
await Walker.dump("BTCUSDT", "momentum-comparison");

// Save to custom path: ./reports/walker/momentum-comparison.md
await Walker.dump("BTCUSDT", "momentum-comparison", "./reports/walker");
```

**Sources**: [src/classes/Walker.ts:774-817](), [src/classes/Walker.ts:411-438]()

---

### list()

Lists all active walker instances with their current execution status. Useful for monitoring multiple concurrent walker executions.

**Signature**:
```typescript
list(): Promise<Array<{
  id: string;
  symbol: string;
  walkerName: string;
  status: "ready" | "pending" | "fulfilled" | "rejected";
}>>
```

**Returns**: Array of status objects, one per active walker instance

**Status Values**:
- `"ready"` - Instance created but task not started
- `"pending"` - Task currently executing
- `"fulfilled"` - Task completed successfully
- `"rejected"` - Task failed with error

**Example**:
```typescript
const statusList = await Walker.list();

statusList.forEach(status => {
  console.log(
    `${status.symbol} - ${status.walkerName}: ${status.status}`
  );
});

// Output:
// BTCUSDT - momentum-comparison: pending
// ETHUSDT - trend-following: fulfilled
```

**Sources**: [src/classes/Walker.ts:832-837](), [src/classes/Walker.ts:139-147]()

---

## Execution Flow

The walker orchestrates multiple strategy backtests sequentially, aggregating results and tracking the best performer by configured metric.

```mermaid
graph TB
    START["Walker.run()<br/>or Walker.background()"]
    VALIDATE["Validate Components"]
    CLEAR["Clear Cached Data"]
    SCHEMA["Load Walker Schema"]
    LOOP_START["For Each Strategy"]
    BACKTEST["Run Backtest"]
    AGGREGATE["Aggregate Results"]
    COMPARE["Compare Metrics"]
    UPDATE["Update Best"]
    YIELD["Yield Progress"]
    LOOP_END{"More<br/>Strategies?"}
    DONE["Emit Done Event"]
    END["Complete"]
    
    START --> VALIDATE
    VALIDATE -->|"walker, exchange,<br/>frame, strategies"| CLEAR
    CLEAR -->|"walker markdown,<br/>backtest markdown,<br/>strategy core"| SCHEMA
    SCHEMA --> LOOP_START
    LOOP_START --> BACKTEST
    BACKTEST -->|"BacktestLogicPublicService"| AGGREGATE
    AGGREGATE -->|"Collect closed signals"| COMPARE
    COMPARE -->|"Calculate metric"| UPDATE
    UPDATE --> YIELD
    YIELD --> LOOP_END
    LOOP_END -->|"Yes"| LOOP_START
    LOOP_END -->|"No"| DONE
    DONE --> END
    
    subgraph "Per Strategy"
        BACKTEST
        AGGREGATE
        COMPARE
        UPDATE
    end
```

**Sequential Processing**: Strategies are tested one at a time to ensure deterministic results and consistent resource usage. Each backtest completes fully before the next begins.

**Sources**: [src/classes/Walker.ts:156-219](), [src/classes/Walker.ts:39-65]()

---

## Instance Management

Walker instances are memoized by `symbol:walkerName` key to ensure isolation and prevent duplicate execution.

### Memoization Pattern

```mermaid
graph LR
    CALL1["Walker.run<br/>(BTCUSDT, walker1)"]
    CALL2["Walker.background<br/>(BTCUSDT, walker1)"]
    CALL3["Walker.run<br/>(ETHUSDT, walker1)"]
    
    MEMO["_getInstance<br/>(memoized)"]
    
    INST1["WalkerInstance<br/>BTCUSDT:walker1"]
    INST2["WalkerInstance<br/>ETHUSDT:walker1"]
    
    CALL1 --> MEMO
    CALL2 --> MEMO
    CALL3 --> MEMO
    
    MEMO -->|"key: BTCUSDT:walker1"| INST1
    MEMO -->|"key: ETHUSDT:walker1"| INST2
    
    CALL1 -.->|"same instance"| INST1
    CALL2 -.->|"same instance"| INST1
```

**Benefits**:
- Each symbol-walker combination maintains isolated state
- Multiple walkers can run on same symbol without interference
- Prevents duplicate execution via `singlerun` wrapper
- Efficient resource usage through instance reuse

**Sources**: [src/classes/Walker.ts:465-471](), [src/classes/Walker.ts:100-100]()

---

## Task Management

The `task` method wraps walker execution with `singlerun` to prevent concurrent execution of the same walker instance.

```mermaid
stateDiagram-v2
    [*] --> Ready: "new WalkerInstance()"
    
    Ready --> Pending: "task() called"
    Pending --> Fulfilled: "Execution succeeds"
    Pending --> Rejected: "Execution fails"
    
    Fulfilled --> Ready: "task() called again"
    Rejected --> Ready: "task() called again"
    
    Pending --> Pending: "task() called<br/>(returns same promise)"
    
    note right of Pending
        singlerun ensures only
        one execution at a time
    end note
    
    note right of Ready
        Multiple calls create
        new promises
    end note
```

**Sources**: [src/classes/Walker.ts:112-125]()

---

## Validation Chain

Before execution, walker validates all component registrations to ensure configuration integrity.

| Component | Service | Validates |
|-----------|---------|-----------|
| Walker | `walkerValidationService` | Walker schema exists |
| Exchange | `exchangeValidationService` | Exchange schema exists |
| Frame | `frameValidationService` | Frame schema exists |
| Strategies | `strategyValidationService` | Each strategy schema exists |
| Risk Profiles | `riskValidationService` | Risk schemas for strategies that use them |

**Validation Example**:
```typescript
// Walker validates:
// 1. Walker schema "momentum-comparison" exists
// 2. Exchange schema "binance" exists (from walker schema)
// 3. Frame schema "1d-backtest" exists (from walker schema)
// 4. Strategy schemas ["ema-cross", "rsi-reversal"] exist
// 5. Risk schemas for strategies that define riskName

Walker.run("BTCUSDT", { walkerName: "momentum-comparison" });
```

**Sources**: [src/classes/Walker.ts:486-521](), [src/classes/Walker.ts:167-188]()

---

## State Management

Each `WalkerInstance` maintains internal state flags to coordinate execution and stopping.

```typescript
// Instance state
class WalkerInstance {
  readonly id = randomString();      // Unique identifier
  _isStopped = false;                // Manual stop requested
  _isDone = false;                   // Execution completed
}
```

**State Transitions**:
1. **Construction**: `_isStopped = false`, `_isDone = false`
2. **Task Start**: Flags reset at beginning of execution
3. **Stop Called**: `_isStopped = true`
4. **Completion**: `_isDone = true`

**Stop Behavior**:
- Setting `_isStopped` interrupts the walker loop
- Current strategy backtest completes before stopping
- Stop signals propagate to all strategies via `walkerStopSubject`

**Sources**: [src/classes/Walker.ts:84-100](), [src/classes/Walker.ts:39-65]()

---

## Progress Events

Walker emits progress events after each strategy completes, enabling real-time monitoring of comparison execution.

### WalkerContract Structure

```typescript
interface WalkerContract {
  strategiesTested: number;    // Strategies completed
  totalStrategies: number;     // Total to test
  currentStrategy: string;     // Currently executing
  bestStrategy: string;        // Best so far
  bestMetric: number;          // Best metric value
  // Plus additional context
}
```

### Event Flow

```mermaid
sequenceDiagram
    participant Walker as "Walker.run()"
    participant Logic as "WalkerLogicPrivateService"
    participant Backtest as "BacktestLogicPublicService"
    participant Subject as "walkerEmitter"
    
    Walker->>Logic: "Execute walker"
    
    loop "For each strategy"
        Logic->>Backtest: "Run backtest"
        Backtest-->>Logic: "Results"
        Logic->>Logic: "Calculate metrics"
        Logic->>Logic: "Update best"
        Logic->>Subject: "emit progress"
        Subject-->>Walker: "yield WalkerContract"
    end
    
    Logic-->>Walker: "Complete"
```

**Sources**: [src/classes/Walker.ts:156-219](), [docs/interfaces/WalkerStopContract.md:1-41]()

---

## Comparison Metrics

Walker ranks strategies using configurable metrics defined in the walker schema. The default metric is `sharpeRatio`.

| Metric | Description | Formula |
|--------|-------------|---------|
| `sharpeRatio` | Risk-adjusted return | `(avgReturn - riskFreeRate) / stdDev` |
| `winRate` | Percentage of winning trades | `wins / totalTrades` |
| `totalPnL` | Absolute profit/loss | Sum of all trade PnL |
| `pnlPercentage` | Percentage return | `(finalCapital - initialCapital) / initialCapital` |

**Metric Selection**:
```typescript
// Configure in walker schema
addWalker({
  name: "momentum-comparison",
  strategies: ["ema-cross", "rsi-reversal", "macd-divergence"],
  exchangeName: "binance",
  frameName: "1d-backtest",
  metric: "sharpeRatio"  // <-- Ranking metric
});
```

**Sources**: [src/classes/Walker.ts:337-347](), [src/classes/Walker.ts:377-389]()

---

## Practical Examples

### Basic Walker Execution

```typescript
import { Walker } from "backtest-kit";

// Run walker and monitor progress
for await (const progress of Walker.run("BTCUSDT", {
  walkerName: "momentum-comparison"
})) {
  console.log(`Testing: ${progress.currentStrategy}`);
  console.log(`Progress: ${progress.strategiesTested}/${progress.totalStrategies}`);
  console.log(`Best: ${progress.bestStrategy} (${progress.bestMetric.toFixed(2)})`);
}

// Get final results
const results = await Walker.getData("BTCUSDT", "momentum-comparison");
console.log(`Winner: ${results.bestStrategy}`);
```

### Background Execution with Cancellation

```typescript
import { Walker } from "backtest-kit";

// Start walker in background
const cancel = Walker.background("BTCUSDT", {
  walkerName: "momentum-comparison"
});

// Listen for completion
listenDoneWalker((event) => {
  if (event.symbol === "BTCUSDT") {
    console.log("Walker completed!");
  }
});

// Cancel if needed
setTimeout(() => {
  cancel();
  console.log("Walker stopped");
}, 60000); // Stop after 1 minute
```

### Multiple Walkers on Different Symbols

```typescript
import { Walker } from "backtest-kit";

const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT"];

// Start walkers for each symbol
const cancels = symbols.map(symbol => 
  Walker.background(symbol, {
    walkerName: "momentum-comparison"
  })
);

// Monitor all instances
setInterval(async () => {
  const statusList = await Walker.list();
  console.log("Active walkers:", statusList.length);
  
  statusList.forEach(status => {
    console.log(`${status.symbol}: ${status.status}`);
  });
}, 5000);

// Stop all on shutdown
process.on("SIGINT", () => {
  cancels.forEach(cancel => cancel());
});
```

### Generating Comparison Report

```typescript
import { Walker } from "backtest-kit";

// Run walker
Walker.background("BTCUSDT", {
  walkerName: "momentum-comparison"
});

// Wait for completion
listenDoneWalker(async (event) => {
  if (event.symbol === "BTCUSDT") {
    // Generate and save report
    await Walker.dump("BTCUSDT", "momentum-comparison");
    
    // Also get structured data
    const results = await Walker.getData("BTCUSDT", "momentum-comparison");
    
    console.log(`Best: ${results.bestStrategy}`);
    console.log(`Strategies tested: ${results.strategies.length}`);
    
    // Show top 3
    results.strategies
      .slice(0, 3)
      .forEach((s, i) => {
        console.log(`${i + 1}. ${s.strategyName}: ${s.sharpeRatio}`);
      });
  }
});
```

### Conditional Stopping

```typescript
import { Walker, listenWalker } from "backtest-kit";

Walker.background("BTCUSDT", {
  walkerName: "momentum-comparison"
});

// Stop if best strategy exceeds threshold
listenWalker((progress) => {
  if (progress.bestMetric > 3.0) {
    console.log(`Excellent strategy found: ${progress.bestStrategy}`);
    Walker.stop("BTCUSDT", "momentum-comparison");
  }
});
```

**Sources**: [src/classes/Walker.ts:460-838](), [docs/classes/WalkerUtils.md:1-99]()

---

## Error Handling

Walker execution can fail at multiple points. Errors are handled through the framework's event system.

### Error Sources

| Error Type | Cause | Handler |
|------------|-------|---------|
| Validation Error | Component not registered | Thrown synchronously |
| Backtest Error | Strategy execution fails | `errorEmitter` |
| Fatal Error | Unrecoverable failure | `exitEmitter` |

### Error Handling Pattern

```typescript
import { Walker, listenError, listenExit } from "backtest-kit";

// Handle recoverable errors
listenError((error) => {
  console.error("Walker error:", error.message);
  // Log and continue
});

// Handle fatal errors
listenExit((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});

// Run walker
try {
  Walker.background("BTCUSDT", {
    walkerName: "momentum-comparison"
  });
} catch (error) {
  // Validation errors thrown synchronously
  console.error("Configuration error:", error.message);
}
```

**Sources**: [src/classes/Walker.ts:252-254](), [src/classes/Walker.ts:239-275]()

---

## Relationship to Backtest API

Walker internally uses the Backtest API for each strategy execution. Understanding this relationship clarifies the architecture.

```mermaid
graph TB
    WALKER["Walker.run()"]
    WALKER_LOGIC["WalkerLogicPrivateService"]
    BACKTEST_LOGIC["BacktestLogicPublicService"]
    BACKTEST_PRIVATE["BacktestLogicPrivateService"]
    STRATEGY["ClientStrategy"]
    
    WALKER --> WALKER_LOGIC
    WALKER_LOGIC -->|"Sequential loop"| BACKTEST_LOGIC
    BACKTEST_LOGIC --> BACKTEST_PRIVATE
    BACKTEST_PRIVATE --> STRATEGY
    
    WALKER_LOGIC -.->|"Aggregates results"| WALKER_LOGIC
    WALKER_LOGIC -.->|"Compares metrics"| WALKER_LOGIC
    WALKER_LOGIC -.->|"Tracks best"| WALKER_LOGIC
    
    note1["Walker orchestrates"]
    note2["Backtest executes"]
    note3["Strategy generates signals"]
    
    WALKER_LOGIC -.-> note1
    BACKTEST_PRIVATE -.-> note2
    STRATEGY -.-> note3
```

**Key Differences**:
- **Backtest**: Single strategy, yields all closed signals
- **Walker**: Multiple strategies, yields progress updates
- **Backtest**: Returns `IStrategyBacktestResult[]`
- **Walker**: Returns `WalkerContract` with aggregated metrics

**Sources**: [src/classes/Walker.ts:1-677](), [src/classes/Backtest.ts:1-587]()