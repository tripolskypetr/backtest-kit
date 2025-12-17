---
title: design/46_advanced-features
group: design
---

# Advanced Features

This page documents advanced capabilities in Backtest Kit that extend beyond basic strategy backtesting. These features enable AI-driven strategy development, automated code generation, crash-safe persistence, and custom storage backends.

**Scope**: This page covers:
- LLM-powered strategy generation using Ollama
- Optimizer system for data-driven strategy synthesis
- Template-based code generation
- Crash recovery mechanisms and persistence
- Custom persistence backend implementation

For basic strategy development, see [Strategy Development](./25_strategy-development.md). For risk management, see [Risk Management](./31_risk-management.md). For execution modes, see [Execution Modes](./20_execution-modes.md).

---

## LLM-Powered Strategy Generation

Backtest Kit integrates with Large Language Models (specifically Ollama) to generate trading strategies from historical data. The framework provides utilities to build LLM conversation histories, format market data, and synthesize executable strategy code.

### Integration Architecture

![Mermaid Diagram](./diagrams\46_advanced-features_0.svg)


### Message Model Structure

The framework uses a conversation-based approach with three message roles:

| Role | Purpose | Example Usage |
|------|---------|---------------|
| `system` | System instructions, context | "You are a trading strategy expert" |
| `user` | User prompts, market data | "Analyze these 1h candles: ..." |
| `assistant` | LLM responses | "Trend 1h analyzed" |

Messages are accumulated as `MessageModel[]` arrays, where each message contains:
- `role`: `"assistant" | "system" | "user"`
- `content`: String content of the message


### Data Source Configuration

Data sources define how to fetch training data for the LLM. Each source must implement `IOptimizerSourceFn` with pagination support:

```typescript
interface IOptimizerFetchArgs {
  symbol: string;
  startDate: Date;
  endDate: Date;
  limit: number;   // Records per page (default: 25)
  offset: number;  // Skip count for pagination
}

type IOptimizerSourceFn<Data extends IOptimizerData> = 
  (args: IOptimizerFetchArgs) => Data[] | Promise<Data[]>;
```

Data must include unique `id` field for deduplication. The system automatically handles pagination using `iterateDocuments` and deduplicates using `distinctDocuments`.


### Custom Message Formatters

Sources can provide custom formatters for LLM messages:

```typescript
interface IOptimizerSource<Data> {
  name: string;
  fetch: IOptimizerSourceFn<Data>;
  user?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
  assistant?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
}
```

If not provided, defaults to `OptimizerTemplateService.getUserMessage` and `getAssistantMessage`.


---

## Optimizer System Architecture

The Optimizer system coordinates data collection, LLM interaction, and code generation through a multi-layer service architecture.

### Service Layer Hierarchy

![Mermaid Diagram](./diagrams\46_advanced-features_1.svg)


### Optimizer Schema Definition

An optimizer is configured via `IOptimizerSchema`:

| Field | Type | Purpose |
|-------|------|---------|
| `optimizerName` | `string` | Unique identifier |
| `rangeTrain` | `IOptimizerRange[]` | Training time periods |
| `rangeTest` | `IOptimizerRange[]` | Testing time periods |
| `source` | `Source[]` | Data source configurations |
| `getPrompt` | `(symbol, messages) => string` | Synthesizes strategy from conversation |
| `template?` | `Partial<IOptimizerTemplate>` | Custom code generators |
| `callbacks?` | `IOptimizerCallbacks` | Lifecycle hooks |

Each `IOptimizerRange` defines:
- `startDate`: Start of time range (inclusive)
- `endDate`: End of time range (inclusive)
- `note?`: Optional description


### Data Collection Flow

![Mermaid Diagram](./diagrams\46_advanced-features_2.svg)


### Progress Tracking

The optimizer emits progress events via `progressOptimizerEmitter`:

```typescript
interface ProgressOptimizerContract {
  optimizerName: string;
  symbol: string;
  totalSources: number;      // rangeTrain.length × source.length
  processedSources: number;  // Current count
  progress: number;          // 0.0 to 1.0
}
```

Events are emitted:
1. At start of each source processing (processedSources = current)
2. After all sources complete (progress = 1.0)

Subscribe via `listenOptimizerProgress((event) => { ... })`.


---

## Code Generation & Templates

The template system generates executable strategy code by assembling TypeScript/JavaScript components.

### Template Interface Structure

`IOptimizerTemplate` defines 11 code generator methods:

| Method | Returns | Purpose |
|--------|---------|---------|
| `getTopBanner` | Import statements, setup | File header with dependencies |
| `getUserMessage` | String | Default user message formatter |
| `getAssistantMessage` | String | Default assistant message formatter |
| `getWalkerTemplate` | `addWalker()` call | Strategy comparison config |
| `getStrategyTemplate` | `addStrategy()` call | Strategy with LLM integration |
| `getExchangeTemplate` | `addExchange()` call | CCXT exchange config |
| `getFrameTemplate` | `addFrame()` call | Timeframe config |
| `getLauncherTemplate` | `Walker.background()` call | Execution launcher with listeners |
| `getJsonDumpTemplate` | `dumpJson()` function | Debug output helper |
| `getTextTemplate` | `text()` function | LLM text wrapper |
| `getJsonTemplate` | `json()` function | LLM JSON wrapper |

All methods are `async` and return `string | Promise<string>`.


### Generated Code Structure

![Mermaid Diagram](./diagrams\46_advanced-features_3.svg)


### Strategy Template Composition

The `getStrategyTemplate` method generates a complete strategy with:

1. **Multi-timeframe data loading**: Fetches 1m, 5m, 15m, 1h candles via `getCandles`
2. **Message building**: Constructs user/assistant pairs for each timeframe
3. **LLM invocation**: Calls `json(messages)` with embedded strategy prompt
4. **Debug output**: Saves conversation to `./dump/strategy/{resultId}/`
5. **Signal return**: Returns validated `ISignalDto` or `null`

The generated strategy includes automatic candle formatting, progressive timeframe analysis, and unique signal ID assignment.


### Template Customization

Users can override any template method in `IOptimizerSchema.template`:

```typescript
addOptimizer({
  optimizerName: "custom",
  // ... other fields
  template: {
    // Override strategy generation
    getStrategyTemplate: async (strategyName, interval, prompt) => {
      return `addStrategy({ /* custom */ });`;
    },
    // Use defaults for other methods
  }
});
```

The system merges custom templates with defaults from `OptimizerTemplateService`.


### Security: Code Injection Prevention

All template methods escape user-provided strings to prevent code injection:

```typescript
// Example from getStrategyTemplate
const escapedPrompt = String(plainPrompt)
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');
```

Applied to: `strategyName`, `exchangeName`, `frameName`, `interval`, `prompt`, etc.


---

## Crash Recovery & Persistence

Backtest Kit implements crash-safe persistence to recover state after system failures. This is critical for live trading where signals must not be lost or duplicated.

### Persistence Architecture

![Mermaid Diagram](./diagrams\46_advanced-features_4.svg)


### PersistBase Interface

The abstract base class defines the persistence contract:

```typescript
interface IPersistBase<Value extends object = any> {
  readonly directory: string;        // Storage directory path
  readonly extension: string;        // File extension (default: ".json")
  
  write(entityId: EntityId, value: Value): Promise<void>;
  read(entityId: EntityId): Promise<Value | null>;
  delete(entityId: EntityId): Promise<void>;
  clear(): Promise<void>;
  waitForInit(entityId: EntityId): Promise<void>;
}
```

All operations are async. `waitForInit` ensures storage is ready before operations.


### Signal Persistence

Signals are persisted when opened and deleted when closed:

| Event | Action | Data Structure |
|-------|--------|----------------|
| `onOpen` | Write `SignalData` | `{ symbol, data: ISignalRow }` |
| `onClose` | Delete `SignalData` | Delete file |
| `onSchedule` | No write | Scheduled signals NOT persisted |
| `onCancel` | No action | Never written |

**Key Design Decision**: Only **opened** signals are persisted. Scheduled signals remain in memory. This prevents bloat and ensures only active positions are recovered.


### Partial Profit/Loss Persistence

Partial tracking persists milestone levels reached:

```typescript
interface IPartialData {
  profitLevels: PartialLevel[];  // [10, 20, 30, ...]
  lossLevels: PartialLevel[];    // [10, 20, 30, ...]
}
```

Stored by `signalId` to track which profit/loss milestones have been emitted. Prevents duplicate partial events after crashes.


### Risk Position Tracking

Active positions are tracked for portfolio-wide risk management:

```typescript
interface RiskData {
  [strategyName: string]: {
    signal: ISignalRow;
    strategyName: string;
    exchangeName: string;
    openTimestamp: number;
  }
}
```

Stored by `symbol` to maintain cross-strategy position limits. Enables recovery of risk state after crashes.


### Atomic Write Implementation

File writes use a two-phase commit pattern:

1. **Write to temporary file**: `{entityId}.tmp.json`
2. **Atomic rename**: `rename()` to `{entityId}.json`

This ensures:
- No partial writes visible to readers
- Crash during write leaves old file intact
- POSIX filesystem guarantees atomic rename


### Initialization Flow

![Mermaid Diagram](./diagrams\46_advanced-features_5.svg)


---

## Custom Persistence Backends

The framework supports custom persistence implementations for Redis, MongoDB, or other storage systems.

### Implementation Steps

To create a custom backend:

1. **Extend PersistBase abstract class**
2. **Implement required methods**: `write`, `read`, `delete`, `clear`, `waitForInit`
3. **Inject into adapters**: Create custom adapters extending the base adapters

### Example: Redis Backend

```typescript
class PersistRedis extends PersistBase<any> {
  private client: RedisClient;
  
  constructor(directory: string, extension: string = ".json") {
    super(directory, extension);
    this.client = createRedisClient();
  }
  
  async write(entityId: EntityId, value: any): Promise<void> {
    const key = `${this.directory}:${entityId}`;
    await this.client.set(key, JSON.stringify(value));
  }
  
  async read(entityId: EntityId): Promise<any | null> {
    const key = `${this.directory}:${entityId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  async delete(entityId: EntityId): Promise<void> {
    const key = `${this.directory}:${entityId}`;
    await this.client.del(key);
  }
  
  async clear(): Promise<void> {
    const pattern = `${this.directory}:*`;
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
  
  async waitForInit(entityId: EntityId): Promise<void> {
    if (!this.client.isReady) {
      await this.client.connect();
    }
  }
}
```


### Custom Adapter Example

```typescript
class PersistSignalAdapterRedis extends PersistSignalAdapter {
  constructor() {
    const backend = new PersistRedis("./persist/signal");
    super(backend);
  }
}

// Inject into system
const customAdapter = new PersistSignalAdapterRedis();
// Use in ClientStrategy initialization
```


### Storage Backend Requirements

Any custom backend must guarantee:

| Requirement | Rationale |
|-------------|-----------|
| **Atomic writes** | Prevent partial state visibility |
| **Read-after-write consistency** | Ensure state recovery accuracy |
| **Durability** | Survive process crashes |
| **Per-entity isolation** | No cross-contamination between symbols/strategies |
| **Async initialization** | Support connection pools, authentication |


### Performance Considerations

The default file-based implementation provides:
- **Fast local reads**: Direct filesystem access
- **Atomic guarantees**: POSIX rename semantics
- **No external dependencies**: Self-contained
- **Debuggable**: JSON files human-readable

For distributed systems, consider:
- **Redis**: Fast in-memory cache with persistence
- **MongoDB**: Document storage with transactions
- **PostgreSQL**: JSONB columns with ACID guarantees

Trade-offs:
- Network latency vs local filesystem speed
- External dependency vs self-contained
- Scalability vs simplicity


---

## Summary

Backtest Kit's advanced features enable:

1. **AI-Driven Development**: LLM integration for strategy synthesis from historical data
2. **Automated Code Generation**: Template system produces executable strategy files
3. **Production Safety**: Crash-safe persistence ensures no signal loss or duplication
4. **Extensibility**: Custom persistence backends for Redis, MongoDB, or other storage

The optimizer system coordinates data collection, LLM interaction, and code generation through a layered service architecture. The template system assembles code components into executable strategies. The persistence layer provides crash recovery with atomic writes and async initialization.

For optimizer usage examples, see `demo/optimization/` directory. For persistence patterns, see type definitions in `types.d.ts:1655-1843`. For template customization, see `IOptimizerTemplate interface`.