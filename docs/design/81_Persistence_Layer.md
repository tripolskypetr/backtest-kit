# Persistence Layer

## Purpose and Scope

The Persistence Layer provides crash-safe storage for signal state, scheduled signals, risk positions, and partial profit/loss tracking in the backtest-kit framework. This layer implements atomic file writes to ensure no data loss during crashes, automatic recovery from corrupted files, and support for custom storage backends (Redis, MongoDB, PostgreSQL).

For signal lifecycle management, see [Signal Lifecycle](#8). For risk management data structures, see [Risk Management](#12). For partial profit/loss tracking, see [Partial Profit/Loss Tracking](#13.4). For logging infrastructure, see [Logging System](#15.1).

**Sources:** [README.md:17](), [README.md:260-261](), [src/client/ClientStrategy.ts:27]()

## Architecture Overview

The persistence layer consists of three main components: the abstract `PersistBase` class, specialized adapters for signals and risk data, and the atomic file writing utility.

![Mermaid Diagram](./diagrams/81_Persistence_Layer_0.svg)

**Sources:** [src/client/ClientStrategy.ts:27](), [README.md:260-261]()

## PersistBase Abstract Class

`PersistBase` is the foundation for all persistence implementations. It provides a file-based default implementation that can be overridden for custom backends.

### Core Interface

The `IPersistBase` interface defines the contract all persistence implementations must fulfill:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_1.svg)

**Sources:** [src/classes/Persist.ts:69-111](), [src/classes/Persist.ts:160-177]()

### Constructor and Directory Setup

The constructor accepts an `entityName` (e.g., "signal", "risk") and optional `baseDir` (default: `./logs/data`). It computes the storage directory as `baseDir/entityName`:

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `entityName` | `string` | required | Unique identifier for entity type |
| `baseDir` | `string` | `./logs/data` | Base directory for all persistence |
| `_directory` | `string` | computed | Full path: `baseDir/entityName` |

**Sources:** [src/classes/Persist.ts:178-197]()

### CRUD Operations

#### Read Operations

![Mermaid Diagram](./diagrams/81_Persistence_Layer_2.svg)

**Sources:** [src/classes/Persist.ts:232-253]()

#### Write Operations

Write operations use `writeFileAtomic` to ensure crash safety (see [Atomic File Writes](#atomic-file-writes)):

![Mermaid Diagram](./diagrams/81_Persistence_Layer_3.svg)

**Sources:** [src/classes/Persist.ts:276-295](), [src/utils/writeFileAtomic.ts:63-140]()

#### Existence Check

The `hasValue` method checks if an entity exists without reading its contents:

| Method | Returns | Error Handling |
|--------|---------|----------------|
| `hasValue(entityId)` | `true` if exists | Returns `false` on ENOENT |
| | `false` if not exists | Throws on other errors |

**Sources:** [src/classes/Persist.ts:255-274]()

#### Delete Operations

```typescript
// Remove single entity
await persist.removeValue("BTCUSDT");

// Remove all entities for this type
await persist.removeAll();
```

**Sources:** [src/classes/Persist.ts:304-349]()

### Async Iteration Support

`PersistBase` implements `AsyncIterableIterator` for convenient iteration over all stored entities:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_4.svg)

Entities are sorted alphanumerically by ID using `localeCompare` with numeric sensitivity.

**Sources:** [src/classes/Persist.ts:358-430]()

## Atomic File Writes

The `writeFileAtomic` function ensures that file writes either complete fully or leave the original file unchanged, preventing data corruption during crashes.

### Platform-Specific Behavior

![Mermaid Diagram](./diagrams/81_Persistence_Layer_5.svg)

| Platform | Strategy | Atomicity | Temp File |
|----------|----------|-----------|-----------|
| POSIX | Temp file + rename | Full atomic replacement | `.tmp-{random}-{filename}` |
| Windows | Direct write + sync | Minimizes corruption risk | None |

**Sources:** [src/utils/writeFileAtomic.ts:6-140]()

### Error Handling and Cleanup

On POSIX systems, if any step fails, the temporary file is cleaned up before rethrowing the error:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_6.svg)

**Sources:** [src/utils/writeFileAtomic.ts:109-140]()

### Configuration Options

```typescript
interface Options {
  encoding?: BufferEncoding | undefined;  // Default: "utf8"
  mode?: number | undefined;              // Default: 0o666
  tmpPrefix?: string;                     // Default: ".tmp-"
}
```

**Sources:** [src/utils/writeFileAtomic.ts:9-18]()

## Default File-Based Persistence

The default implementation stores entities as JSON files in a hierarchical directory structure.

### Directory Structure

```
./logs/data/
├── signal/
│   ├── strategy-a/
│   │   ├── BTCUSDT.json
│   │   ├── ETHUSDT.json
│   │   └── SOLUSDT.json
│   └── strategy-b/
│       └── BTCUSDT.json
├── schedule/
│   ├── strategy-a/
│   │   ├── BTCUSDT.json
│   │   └── ETHUSDT.json
│   └── strategy-b/
│       └── BTCUSDT.json
├── risk/
│   ├── conservative/
│   │   └── positions.json
│   └── aggressive/
│       └── positions.json
└── partial/
    ├── BTCUSDT/
    │   └── data.json
    └── ETHUSDT/
        └── data.json
```

| Entity Type | Entity Name | Entity ID | File Path |
|------------|-------------|-----------|-----------|
| `signal` | `strategy-a` | `BTCUSDT` | `./logs/data/signal/strategy-a/BTCUSDT.json` |
| `schedule` | `strategy-a` | `BTCUSDT` | `./logs/data/schedule/strategy-a/BTCUSDT.json` |
| `risk` | `conservative` | `positions` | `./logs/data/risk/conservative/positions.json` |
| `partial` | `BTCUSDT` | `data` | `./logs/data/partial/BTCUSDT/data.json` |

**Sources:** [src/client/ClientStrategy.ts:27](), [README.md:260-261]()

### JSON Serialization

All entities are serialized using `JSON.stringify` and deserialized using `JSON.parse`:

```typescript
// Write: Entity → JSON string → File
const serializedData = JSON.stringify(entity);
await writeFileAtomic(filePath, serializedData, "utf-8");

// Read: File → JSON string → Entity
const fileContent = await fs.readFile(filePath, "utf-8");
return JSON.parse(fileContent) as T;
```

**Sources:** [src/classes/Persist.ts:239-242](), [src/classes/Persist.ts:286-287]()

### File Validation and Cleanup

During `waitForInit`, the system validates all existing files and removes corrupted ones. The cleanup uses retry logic with configurable parameters:

| Constant | Value | Purpose |
|----------|-------|---------|
| `BASE_UNLINK_RETRY_COUNT` | 5 | Number of retry attempts |
| `BASE_UNLINK_RETRY_DELAY` | 1000ms | Delay between retries |

**Sources:** [src/classes/Persist.ts:113-158](), [src/classes/Persist.ts:38-40]()

## Persistence Adapters

The framework provides four specialized adapter classes for different data types: signals, scheduled signals, risk positions, and partial profit/loss states.

### PersistSignalAdapter

Manages active signal state persistence for live trading. Each strategy-symbol combination gets its own file:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_8.svg)

**Entity Name Pattern:** `signal/{strategyName}`  
**Entity ID Pattern:** `{symbol}` (e.g., "BTCUSDT")  
**Data Structure:** `ISignalRow | null` - single active signal per symbol

**Sources:** [src/client/ClientStrategy.ts:27](), [src/client/ClientStrategy.ts:411-429]()

### PersistScheduleAdapter

Manages scheduled signal state persistence for delayed entry orders. Each strategy-symbol combination stores one scheduled signal awaiting activation:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_9.svg)

**Entity Name Pattern:** `schedule/{strategyName}`  
**Entity ID Pattern:** `{symbol}` (e.g., "BTCUSDT")  
**Data Structure:** `IScheduledSignalRow | null` - single scheduled signal per symbol

**Sources:** [src/client/ClientStrategy.ts:27](), [src/client/ClientStrategy.ts:445-471]()

### PersistRiskAdapter

Manages active position tracking for risk management. Each risk profile stores all positions across all strategies in a single file:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_10.svg)

**Entity Name Pattern:** `risk/{riskName}`  
**Entity ID Pattern:** Always `"positions"`  
**Data Structure:** `Record<string, IRiskActivePosition[]>` - symbol-indexed position array

**Sources:** [README.md:648-684]()

### PersistPartialAdapter

Manages partial profit/loss milestone tracking. Each symbol stores which profit/loss levels (10%, 20%, 30%, etc.) have been reached for each active signal:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_11.svg)

**Entity Name Pattern:** `partial/{symbol}`  
**Entity ID Pattern:** Always `"data"`  
**Data Structure:** `Record<signalId, IPartialData>` - signal-indexed milestone tracking

**Sources:** [types.d.ts:586-604](), [README.md:254]()

### Custom Adapter Registration

Custom adapters are registered before running any strategies:

```typescript
import { 
  PersistSignalAdapter, 
  PersistScheduleAdapter,
  PersistRiskAdapter,
  PersistPartialAdapter 
} from "backtest-kit";

// Register custom signal adapter
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);

// Register custom schedule adapter
PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);

// Register custom risk adapter
PersistRiskAdapter.usePersistRiskAdapter(MongoPersist);

// Register custom partial adapter
PersistPartialAdapter.usePersistPartialAdapter(MongoPersist);

// Now run strategies - they will use custom adapters
Live.background("BTCUSDT", { ... });
```

**Sources:** [README.md:260-261](), [README.md:863-877]()

## Crash Recovery and waitForInit

The `waitForInit` method implements crash recovery by validating existing data and cleaning up corrupted files.

### Initialization Pattern

![Mermaid Diagram](./diagrams/81_Persistence_Layer_12.svg)

The `singleshot` decorator ensures initialization happens only once, even if called multiple times.

**Sources:** [src/classes/Persist.ts:209-219](), [src/classes/Persist.ts:113-134]()

### Validation Logic

Error messages logged:

1. **Invalid document:** `"backtest-kit PersistBase found invalid document for filePath={path} entityName={name}"`
2. **Failed removal:** `"backtest-kit PersistBase failed to remove invalid document for filePath={path} entityName={name}"`

**Sources:** [src/classes/Persist.ts:113-158]()

## Custom Persistence Backends

Custom persistence implementations must implement the `IPersistBase` interface with four required methods.

### Interface Requirements

```typescript
interface IPersistBase<Entity extends IEntity = IEntity> {
  // Initialize connection/storage
  waitForInit(initial: boolean): Promise<void>;
  
  // Read entity by ID
  readValue(entityId: EntityId): Promise<Entity>;
  
  // Check if entity exists
  hasValue(entityId: EntityId): Promise<boolean>;
  
  // Write entity atomically
  writeValue(entityId: EntityId, entity: Entity): Promise<void>;
}
```

### Redis Implementation Example

![Mermaid Diagram](./diagrams/81_Persistence_Layer_14.svg)

Key implementation details:

| Method | Redis Operation | Key Pattern |
|--------|-----------------|-------------|
| `readValue` | `redis.get(key)` | `{entityName}:{entityId}` |
| `hasValue` | `redis.exists(key)` | `{entityName}:{entityId}` |
| `writeValue` | `redis.set(key, data)` | `{entityName}:{entityId}` |
| `removeValue` | `redis.del(key)` | `{entityName}:{entityId}` |
| `removeAll` | `redis.keys()` + `redis.del()` | `{entityName}:*` |

**Sources:** [README.md:762-868]()

### MongoDB Implementation Example

MongoDB implementation uses a collection per entity type with documents containing `entityId` and `data` fields:

```typescript
// Collection schema
{
  entityId: string,      // e.g., "BTCUSDT"
  data: Entity,          // Serialized entity
  updatedAt: Date        // Last update timestamp
}
```

Key operations:

| Method | MongoDB Operation | Query Filter |
|--------|------------------|--------------|
| `readValue` | `collection.findOne()` | `{ entityId }` |
| `hasValue` | `collection.countDocuments()` | `{ entityId }` |
| `writeValue` | `collection.updateOne()` (upsert) | `{ entityId }` |
| `removeValue` | `collection.deleteOne()` | `{ entityId }` |
| `removeAll` | `collection.deleteMany()` | `{}` |

**Sources:** [README.md:888-965]()

### Adapter Selection Criteria

![Mermaid Diagram](./diagrams/81_Persistence_Layer_15.svg)

**Sources:** [README.md:1023-1043]()

## Usage Patterns

### Direct Usage

Users can instantiate `PersistBase` directly for custom data storage:

```typescript
import { PersistBase } from "backtest-kit";

// Create persistence for custom entity type
const tradingLogs = new PersistBase("trading-logs", "./logs/custom");

// Initialize
await tradingLogs.waitForInit(true);

// Write log entry
await tradingLogs.writeValue("log-1", {
  timestamp: Date.now(),
  message: "Strategy started",
  metadata: { symbol: "BTCUSDT" }
});

// Read log entry
const log = await tradingLogs.readValue("log-1");

// Iterate over all logs
for await (const log of tradingLogs.values()) {
  console.log("Log:", log);
}

// Filter logs (helper method)
for await (const log of tradingLogs.filter((l) => 
  l.metadata.symbol === "BTCUSDT"
)) {
  console.log("BTC Log:", log);
}
```

**Sources:** [README.md:971-1020]()

### Service Layer Integration

Services use persistence adapters through the dependency injection system:

![Mermaid Diagram](./diagrams/81_Persistence_Layer_16.svg)

**Sources:** [src/classes/Persist.ts:1-60]()

### Testing with Mock Adapters

Tests use mock adapters to avoid file system operations:

```typescript
// test/config/setup.mjs
PersistSignalAdaper.usePersistSignalAdapter(class {
  async waitForInit() { /* no-op */ }
  async readValue() { 
    throw new Error("Should not be called in tests");
  }
  async hasValue() { return false; }
  async writeValue() { /* no-op */ }
});
```

This pattern ensures tests run fast and don't leave artifacts on disk.

**Sources:** [test/config/setup.mjs:6-34]()

## Summary

The Persistence Layer provides:

1. **Crash-safe storage** via atomic file writes with platform-specific optimizations
2. **Automatic recovery** through file validation and cleanup during initialization
3. **Pluggable backends** supporting Redis, MongoDB, PostgreSQL, or custom implementations
4. **Simple API** with async iteration, filtering, and standard CRUD operations
5. **Zero data loss** guarantees for signal state and risk positions in live trading

**Key Classes:**
- `PersistBase` - Abstract base class with file-based default implementation
- `IPersistBase` - Interface for custom persistence backends
- `writeFileAtomic` - Atomic file writing utility
- `PersistSignalAdaper` - Adapter registry for signal persistence
- `PersistRiskAdapter` - Adapter registry for risk persistence

**Sources:** [src/classes/Persist.ts:1-177](), [src/utils/writeFileAtomic.ts:1-141](), [README.md:733-1070]()