---
title: design/78_cross-cutting_concerns
group: design
---

# Cross-Cutting Concerns

This page documents infrastructure components that span multiple layers of the architecture: logging, error handling, and persistence. These concerns are injected throughout the system via dependency injection and provide foundational services for observability, reliability, and crash-safe state management.

For component-specific context propagation (ExecutionContext, MethodContext), see [Context Propagation](./12_Context_Propagation.md).
For event-driven signal flow, see [Event System](./13_Event_System.md).
For global configuration parameters, see [Configuration](./74_Configuration.md).

---

## System Overview

Cross-cutting concerns provide infrastructure services that are consumed by all layers.


---

## Logging System

### ILogger Interface

The framework accepts any logger implementing the `ILogger` interface, which defines four severity levels:

| Method | Purpose | Usage |
|--------|---------|-------|
| `log()` | General-purpose messages | Strategy execution, signal generation |
| `debug()` | Detailed diagnostics | Intermediate states, candle fetching |
| `info()` | Informational updates | Successful completions, validations |
| `warn()` | Potentially problematic situations | Missing data, deprecated usage |


### Logger Registration

Users register a custom logger via `setLogger()`, which binds the implementation to the dependency injection container:

```typescript
setLogger({
  log: (topic, ...args) => console.log(topic, args),
  debug: (topic, ...args) => console.debug(topic, args),
  info: (topic, ...args) => console.info(topic, args),
  warn: (topic, ...args) => console.warn(topic, args),
});
```


### Automatic Context Injection

The framework automatically injects contextual information into log messages. Services access the logger through dependency injection and include strategy/exchange/symbol context:

![Mermaid Diagram](./diagrams/78_Cross-Cutting_Concerns_1.svg)

**Example log output with automatic context:**
```
[ClientStrategy] strategyName=my-strategy, exchangeName=binance, symbol=BTCUSDT - Generating signal
[PersistBase] entityName=my-strategy - Writing signal state
```


### LoggerService Integration

The logger is accessed throughout the codebase via the DI token `LoggerService`. All services inject this token to receive the user's logger implementation:

**File:** [src/classes/Persist.ts:192-196]()
```typescript
constructor(
  readonly entityName: EntityName,
  readonly baseDir = join(process.cwd(), "logs/data")
) {
  swarm.loggerService.debug(PERSIST_BASE_METHOD_NAME_CTOR, {
    entityName: this.entityName,
    baseDir,
  });
}
```


---

## Error Handling

### Error Emission Architecture

The framework distinguishes between recoverable errors (`errorEmitter`) and fatal errors (`exitEmitter`), allowing users to implement appropriate handling for each:

![Mermaid Diagram](./diagrams/78_Cross-Cutting_Concerns_2.svg)


### Error Listener Registration

Users subscribe to errors via `listenError()`, which registers a callback to receive all emitted errors:

```typescript
listenError((error) => {
  console.error("Framework error:", error.message);
  // Custom error handling: alerts, logging, etc.
});
```


### Recoverable vs Fatal Error Handling

The framework provides two error channels with distinct semantics:

| Error Channel | Subject | Listener | Purpose | Handling |
|---------------|---------|----------|---------|----------|
| **Recoverable** | `errorEmitter` | `listenError()` | Validation failures, API timeouts | Logged, execution continues |
| **Fatal** | `exitEmitter` | `listenExit()` | Unhandled exceptions in background tasks | Logged, terminates execution |

#### Execution Mode Behavior

| Mode | Method | Recoverable Error | Fatal Error |
|------|--------|-------------------|-------------|
| **Foreground** | `Backtest.run()`, `Live.run()` | Throws to caller | Throws to caller |
| **Background** | `Backtest.background()`, `Live.background()` | Emits to `errorEmitter` | Emits to `exitEmitter`, halts |

**Example showing error handling in background mode:**

**File:** [test/e2e/defend.test.mjs:615-640]()
```javascript
try {
  Backtest.background("BTCUSDT", {
    strategyName: "test-defend-invalid-long",
    exchangeName: "binance-defend-invalid-long",
    frameName: "10m-defend-invalid-long",
  });

  await awaitSubject.toPromise();

  // If we reach here, validation failed to reject the signal
  if (scheduledCount === 0 && openedCount === 0) {
    pass("MONEY SAFE: Invalid signal rejected");
  } else {
    fail("CRITICAL BUG: Invalid signal was NOT rejected");
  }
} catch (error) {
  // Error thrown indicates validation worked
  const errMsg = error.message || String(error);
  if (errMsg.includes("priceTakeProfit") || errMsg.includes("Invalid signal")) {
    pass(`MONEY SAFE: Invalid signal rejected: ${errMsg}`);
  }
}
```


### exitEmitter Usage

The `exitEmitter` Subject handles fatal errors that should terminate execution. This includes unhandled exceptions in background tasks and critical system failures:

```typescript
// Subscribe to fatal errors
listenExit((error) => {
  console.error("Fatal error - execution terminated:", error.message);
  // Alert monitoring system
  // Perform cleanup
  // Exit process if needed
});
```

The `exitEmitter` is distinct from `errorEmitter` because it signals that execution cannot safely continue. Background tasks that catch an `exitEmitter` event should gracefully shut down.


### Validation Error Emission

Signal validation errors are thrown from `VALIDATE_SIGNAL_FN` and caught by logic services, which emit them to `errorEmitter`. This prevents invalid trades while providing observability:

**Common validation errors:**
- TP too close to priceOpen (< `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT`)
- SL too far from priceOpen (> `CC_MAX_STOPLOSS_DISTANCE_PERCENT`)
- Negative or NaN prices
- Inverted long/short logic (e.g., long with TP < priceOpen)


---

## Persistence Layer

### Persistence Architecture

The persistence layer provides crash-safe state management for live trading via atomic file writes and abstract base classes supporting custom adapters:

![Mermaid Diagram](./diagrams/78_Cross-Cutting_Concerns_3.svg)


### PersistBase Abstract Class

`PersistBase<EntityName, Entity>` provides a file-based persistence implementation with CRUD operations, iteration support, and automatic corruption handling:

| Method | Purpose | Return Type |
|--------|---------|-------------|
| `waitForInit(initial)` | Initialize directory, validate files | `Promise<void>` |
| `readValue(entityId)` | Read entity from storage | `Promise<Entity>` |
| `writeValue(entityId, entity)` | Write entity with atomic file operation | `Promise<void>` |
| `hasValue(entityId)` | Check entity existence | `Promise<boolean>` |
| `removeValue(entityId)` | Delete entity | `Promise<void>` |
| `keys()` | Async generator yielding entity IDs | `AsyncGenerator<EntityId>` |
| `values()` | Async generator yielding entities | `AsyncGenerator<Entity>` |

The `IPersistBase<Entity>` interface defines the contract that custom adapters must implement. The generic type parameters allow type-safe persistence of different entity types (signals, risk positions, scheduled signals, partial data).

**Default file structure:**
```
./logs/data/
├── signal/
│   ├── my-strategy/
│   │   ├── BTCUSDT.json
│   │   └── ETHUSDT.json
├── risk/
│   └── my-risk/
│       └── positions.json
├── schedule/
│   └── my-strategy/
│       └── BTCUSDT.json
└── partial/
    └── partial.json
```


### PersistSignalAdapter

`PersistSignalAdapter` manages per-strategy, per-symbol signal persistence for crash recovery in live trading:

**Key characteristics:**
- **Entity Name:** `strategyName`
- **Entity ID:** `symbol` (e.g., "BTCUSDT")
- **Entity Data:** `ISignalRow | null`
- **Storage Path:** `./logs/data/signal/{strategyName}/{symbol}.json`

**Memoization pattern:** One storage instance per `strategyName`, retrieved via `getSignalStorage(strategyName)`.

**API:**
```typescript
// Read signal state on strategy initialization
const signal = await PersistSignalAdapter.readSignalData(
  "my-strategy", 
  "BTCUSDT"
);

// Write signal state after tick
await PersistSignalAdapter.writeSignalData(
  signalRow, 
  "my-strategy", 
  "BTCUSDT"
);
```


### PersistRiskAdapter

`PersistRiskAdapter` manages per-risk-profile active positions for portfolio-level risk tracking across strategies:

**Key characteristics:**
- **Entity Name:** `riskName`
- **Entity ID:** `"positions"` (fixed key)
- **Entity Data:** `RiskData` (array of `[string, IRiskActivePosition]` tuples)
- **Storage Path:** `./logs/data/risk/{riskName}/positions.json`

**Data format:**
```typescript
type RiskData = Array<[string, IRiskActivePosition]>;

// Persisted as JSON array of tuples:
[
  ["my-strategy:BTCUSDT", { signal: {...}, strategyName: "my-strategy", ... }],
  ["other-strategy:ETHUSDT", { signal: {...}, strategyName: "other-strategy", ... }]
]
```

**API:**
```typescript
// Read active positions on risk profile initialization
const positions = await PersistRiskAdapter.readPositionData("my-risk");

// Write active positions after addSignal/removeSignal
await PersistRiskAdapter.writePositionData(positionsArray, "my-risk");
```


### PersistScheduleAdapter

`PersistScheduleAdapter` manages scheduled signals awaiting activation (signals where `priceOpen` differs from current price):

**Key characteristics:**
- **Entity Name:** `strategyName`
- **Entity ID:** `symbol` (e.g., "BTCUSDT")
- **Entity Data:** `ScheduleData` (`IScheduledSignalRow | null`)
- **Storage Path:** `./logs/data/schedule/{strategyName}/{symbol}.json`

This adapter enables crash recovery for scheduled signals that have not yet opened, tracking their timeout countdown and pre-activation state.


### PersistPartialAdapter

`PersistPartialAdapter` manages partial profit/loss milestone tracking across all strategies:

**Key characteristics:**
- **Entity Name:** `"partial"` (fixed)
- **Entity ID:** `"partial"` (fixed key)
- **Entity Data:** `PartialData` (map of signal IDs to milestone arrays)
- **Storage Path:** `./logs/data/partial/partial.json`

This adapter tracks which profit/loss levels (10%, 20%, 30%, etc.) have been reached for each active signal, preventing duplicate emissions of partial milestone events.


### Atomic File Writes

`writeFileAtomic()` ensures crash-safe writes using platform-specific strategies:

**POSIX strategy (Linux, macOS):**
1. Generate unique temp filename: `.tmp-{random}-{filename}`
2. Write data to temp file
3. Sync data to disk via `fileHandle.sync()`
4. Atomically rename temp file to target file via `fs.rename()`
5. On failure, clean up temp file

**Windows strategy:**
1. Write directly to target file
2. Sync data to disk via `fileHandle.sync()`
3. Close file handle

**Critical properties:**
- **Atomicity (POSIX):** Rename is atomic operation—file is either fully written or untouched
- **Durability (both):** `sync()` ensures data is flushed to disk before rename/close
- **Isolation:** Temp filename uses crypto-random bytes to prevent collisions


### Custom Persistence Adapters

Users can replace the file-based backend with custom implementations (Redis, MongoDB, PostgreSQL) by extending `PersistBase` and registering the adapter:

**Example Redis adapter:**
```typescript
class RedisPersist extends PersistBase {
  private redis = createRedisClient();

  async readValue(entityId) {
    const data = await this.redis.get(`${this.entityName}:${entityId}`);
    return JSON.parse(data);
  }

  async writeValue(entityId, entity) {
    await this.redis.set(
      `${this.entityName}:${entityId}`, 
      JSON.stringify(entity)
    );
  }

  async hasValue(entityId) {
    return await this.redis.exists(`${this.entityName}:${entityId}`);
  }

  async waitForInit(initial) {
    await this.redis.connect();
  }
}

// Register adapter
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
```


### Crash Recovery Pattern

The `waitForInit()` method implements crash recovery by validating all persisted files on startup:

**File:** [src/classes/Persist.ts:113-134]()
```typescript
const BASE_WAIT_FOR_INIT_FN = async (self: TPersistBase): Promise<void> => {
  await fs.mkdir(self._directory, { recursive: true });
  for await (const key of self.keys()) {
    try {
      await self.readValue(key);  // Validate JSON parsing
    } catch {
      const filePath = self._getFilePath(key);
      console.error(`PersistBase found invalid document for filePath=${filePath}`);
      // Retry deletion with exponential backoff
      if (await not(BASE_WAIT_FOR_INIT_UNLINK_FN(filePath))) {
        console.error(`PersistBase failed to remove invalid document`);
      }
    }
  }
};
```

**Retry logic for file deletion:** [src/classes/Persist.ts:136-158]()



---

## Integration Points

### Cross-Cutting Services in Dependency Injection

The DI container provides singletons for cross-cutting concerns that are injected into all service classes:

![Mermaid Diagram](./diagrams/78_Cross-Cutting_Concerns_4.svg)


### Context Injection Flow

Logging context is automatically injected via the context propagation system (see [Context Propagation](./12_Context_Propagation.md)):

1. **MethodContextService** provides `strategyName`, `exchangeName`, `frameName`
2. **ExecutionContextService** provides `symbol`, `when`, `backtest` flag
3. Services access these via DI-scoped tokens
4. Logger calls include context parameters automatically


---

## Best Practices

### Logging Guidelines

1. **Use appropriate severity levels:**
   - `debug()` for detailed state dumps (candle data, intermediate values)
   - `info()` for lifecycle events (signal opened, strategy started)
   - `log()` for significant events (backtest completed, report generated)
   - `warn()` for recoverable issues (missing data, deprecated usage)

2. **Include context in custom messages:**
   ```typescript
   logger.info("strategy-execution", { 
     strategyName, 
     symbol, 
     action: "signal-generated" 
   });
   ```


### Error Handling Guidelines

1. **Always subscribe to `errorEmitter` in production:**
   ```typescript
   listenError((error) => {
     // Alert monitoring system
     // Log to error tracking service
     // Record metrics
   });
   ```

2. **Use background mode for resilient execution:**
   - Background mode continues on errors, emits to `errorEmitter`
   - Foreground mode halts immediately, suitable for testing

3. **Handle validation errors gracefully:**
   - Validation errors indicate configuration issues
   - Check `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` and related parameters
   - Review signal generation logic for price calculation bugs


### Persistence Guidelines

1. **Use custom adapters for production:**
   - File-based persistence is suitable for testing and single-instance deployments
   - Redis/MongoDB adapters recommended for distributed systems
   - Implement retry logic in custom adapters for network failures

2. **Test crash recovery:**
   ```typescript
   // Verify waitForInit() handles corrupted files
   await PersistSignalAdapter.readSignalData(strategyName, symbol);
   ```

3. **Monitor persistence metrics:**
   - Track write latency (should be < 10ms for local files)
   - Monitor disk space usage (especially for high-frequency strategies)
   - Alert on repeated write failures


### Configuration Guidelines

1. **Set conservative defaults for production:**
   ```typescript
   setConfig({
     CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 0.3,  // Cover fees + profit
     CC_MAX_STOPLOSS_DISTANCE_PERCENT: 5,      // Limit max loss per trade
     CC_MAX_SIGNAL_LIFETIME_MINUTES: 480,      // 8 hours max
   });
   ```

2. **Test parameter changes in backtest first:**
   - Run backtest with new parameters
   - Verify signals are not over-filtered
   - Check that invalid signals are properly rejected

3. **Document configuration rationale:**
   - Include comments explaining why specific values are chosen
   - Reference trading fees and slippage assumptions
   - Note asset-specific considerations (e.g., crypto vs stocks)
