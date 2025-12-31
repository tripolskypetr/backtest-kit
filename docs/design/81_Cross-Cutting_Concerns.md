# Cross-Cutting Concerns

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Persist.ts](src/classes/Persist.ts)
- [src/client/ClientPartial.ts](src/client/ClientPartial.ts)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/contract/PartialLoss.contract.ts](src/contract/PartialLoss.contract.ts)
- [src/contract/PartialProfit.contract.ts](src/contract/PartialProfit.contract.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/interfaces/Partial.interface.ts](src/interfaces/Partial.interface.ts)
- [src/lib/services/connection/PartialConnectionService.ts](src/lib/services/connection/PartialConnectionService.ts)
- [src/lib/services/global/PartialGlobalService.ts](src/lib/services/global/PartialGlobalService.ts)
- [types.d.ts](types.d.ts)

</details>



This page documents system-wide concerns that affect multiple components across the backtest-kit architecture. These concerns include logging, error handling, and persistence, which are not specific to any single component but are fundamental to the system's operation.

For component-specific logging, error handling, or persistence behavior, see the individual component documentation in [Client Implementations](#6), [Service Layer](#7), or [Signal Lifecycle](#8).

---

## 15.1 Logging System

The logging system provides a standardized interface for recording diagnostic information across all components. It uses dependency injection to ensure all services have access to logging capabilities without tight coupling.

### ILogger Interface

The `ILogger` interface defines four severity levels for logging operations:

| Method | Severity | Use Case |
|--------|----------|----------|
| `log()` | General | Significant events or state changes |
| `debug()` | Diagnostic | Detailed information for troubleshooting |
| `info()` | Informational | High-level overview of system activity |
| `warn()` | Warning | Potentially problematic situations |

[types.d.ts:52-77]()

### Configuration

Users configure the logger implementation via `setLogger()`:

```typescript
import { setLogger } from 'backtest-kit';

const customLogger = {
  log: (topic, ...args) => console.log(`[LOG] ${topic}`, ...args),
  debug: (topic, ...args) => console.debug(`[DEBUG] ${topic}`, ...args),
  info: (topic, ...args) => console.info(`[INFO] ${topic}`, ...args),
  warn: (topic, ...args) => console.warn(`[WARN] ${topic}`, ...args),
};

setLogger(customLogger);
```

The logger is stored in `LoggerService` and injected throughout the system via the dependency injection container.

[src/function/setup.ts](), [src/lib/services/base/LoggerService.ts]()

### Dependency Injection Pattern

```mermaid
graph TB
    USER["User Code<br/>setLogger(customLogger)"]
    LOGGER_SVC["LoggerService<br/>Singleton instance<br/>TYPES.loggerService"]
    
    subgraph "Service Layer Injection"
        STRAT_SVC["StrategyGlobalService<br/>inject(TYPES.loggerService)"]
        EXCH_SVC["ExchangeGlobalService<br/>inject(TYPES.loggerService)"]
        RISK_SVC["RiskGlobalService<br/>inject(TYPES.loggerService)"]
        PARTIAL_SVC["PartialConnectionService<br/>inject(TYPES.loggerService)"]
    end
    
    subgraph "Client Layer Injection"
        CLIENT_STRAT["ClientStrategy<br/>params.logger"]
        CLIENT_EXCH["ClientExchange<br/>params.logger"]
        CLIENT_RISK["ClientRisk<br/>params.logger"]
        CLIENT_PARTIAL["ClientPartial<br/>params.logger"]
    end
    
    USER --> LOGGER_SVC
    
    LOGGER_SVC --> STRAT_SVC
    LOGGER_SVC --> EXCH_SVC
    LOGGER_SVC --> RISK_SVC
    LOGGER_SVC --> PARTIAL_SVC
    
    STRAT_SVC --> CLIENT_STRAT
    EXCH_SVC --> CLIENT_EXCH
    RISK_SVC --> CLIENT_RISK
    PARTIAL_SVC --> CLIENT_PARTIAL
    
    CLIENT_STRAT -.logs.-> LOGGER_SVC
    CLIENT_EXCH -.logs.-> LOGGER_SVC
    CLIENT_RISK -.logs.-> LOGGER_SVC
    CLIENT_PARTIAL -.logs.-> LOGGER_SVC
```

**Sources:** [types.d.ts:52-77](), [src/lib/services/base/LoggerService.ts](), [src/lib/core/types.ts]()

### Logging Conventions

Each component logs with a consistent topic format:

| Component | Log Topic Format | Example |
|-----------|------------------|---------|
| Global Services | `{serviceName} {methodName}` | `"strategyGlobalService tick"` |
| Connection Services | `{serviceName} {methodName}` | `"strategyConnectionService getStrategy"` |
| Client Implementations | `{className} {methodName}` | `"ClientStrategy tick"` |
| Persistence Layer | `{className}.{methodName}` | `"PersistBase.waitForInit"` |

[src/client/ClientStrategy.ts](), [src/lib/services/global/StrategyGlobalService.ts](), [src/classes/Persist.ts:45-53]()

### Usage Examples

```typescript
// Service layer logging
this.loggerService.log("strategyGlobalService tick", {
  symbol,
  strategyName,
  backtest
});

// Client layer logging with structured data
this.params.logger.debug("ClientPartial profit level reached", {
  symbol,
  signalId: data.id,
  level,
  revenuePercent,
  backtest
});

// Persistence layer logging with entity context
swarm.loggerService.debug("PersistBase.readValue", {
  entityName: this.entityName,
  entityId
});
```

**Sources:** [src/client/ClientPartial.ts:81-87](), [src/classes/Persist.ts:254-257]()

---

## 15.2 Error Handling

The error handling system distinguishes between recoverable and fatal errors, providing appropriate mechanisms for each scenario.

### Error Classification

```mermaid
graph TB
    ERROR["Error Occurs"]
    
    RECOVERABLE{"Recoverable?"}
    FATAL{"Fatal?"}
    
    ERROR_EMIT["errorEmitter.next(error)<br/>Background task continues"]
    EXIT_EMIT["exitEmitter.next(error)<br/>Execution terminates"]
    VALIDATION_EMIT["validationSubject.next(error)<br/>Signal rejected"]
    
    LISTEN_ERROR["listenError()<br/>User callback<br/>Logging, alerts, monitoring"]
    LISTEN_EXIT["listenExit()<br/>User callback<br/>Critical alerts, cleanup"]
    LISTEN_VALIDATION["listenValidation()<br/>User callback<br/>Risk monitoring"]
    
    ERROR --> RECOVERABLE
    
    RECOVERABLE -->|Yes| ERROR_EMIT
    RECOVERABLE -->|No| FATAL
    
    FATAL -->|Yes| EXIT_EMIT
    FATAL -->|Risk Validation| VALIDATION_EMIT
    
    ERROR_EMIT --> LISTEN_ERROR
    EXIT_EMIT --> LISTEN_EXIT
    VALIDATION_EMIT --> LISTEN_VALIDATION
    
    LISTEN_ERROR -.->|Continues| BG_TASK["Background Task<br/>Live.background()<br/>Backtest.background()"]
    LISTEN_EXIT -.->|Terminates| BG_TASK
```

**Sources:** [src/config/emitters.ts:36-44](), [src/config/emitters.ts:109-112](), [src/function/event.ts:223-279]()

### Error Emitters

| Emitter | Purpose | When to Use | Execution Impact |
|---------|---------|-------------|------------------|
| `errorEmitter` | Recoverable errors | API failures, transient issues | Continues execution |
| `exitEmitter` | Fatal errors | System failures, unrecoverable states | Terminates execution |
| `validationSubject` | Validation errors | Risk rule violations | Rejects signal only |

[src/config/emitters.ts:36-44](), [src/config/emitters.ts:109-112]()

### Event Listeners

```typescript
import { listenError, listenExit, listenValidation } from 'backtest-kit';

// Recoverable errors - execution continues
listenError((error) => {
  console.error('Recoverable error:', error.message);
  // Log to monitoring, send non-critical alerts
});

// Fatal errors - execution terminates
listenExit((error) => {
  console.error('FATAL ERROR:', error.message);
  // Send critical alerts, trigger restart logic
});

// Risk validation errors - signal rejected
listenValidation((error) => {
  console.warn('Risk validation failed:', error.message);
  // Track rejection patterns, adjust parameters
});
```

**Sources:** [src/function/event.ts:223-250](), [src/function/event.ts:252-279]()

### Try-Catch Patterns

#### Pattern 1: Graceful Degradation with Default Value

```typescript
// From PersistBase - retry with fallback
const success = await trycatch(
  retry(
    async () => {
      await fs.unlink(filePath);
      return true;
    },
    BASE_UNLINK_RETRY_COUNT,  // 5 attempts
    BASE_UNLINK_RETRY_DELAY   // 1000ms between attempts
  ),
  {
    defaultValue: false  // Return false if all retries fail
  }
);
```

[src/classes/Persist.ts:155-177]()

#### Pattern 2: Error Transformation

```typescript
// From ClientExchange - transform to user-friendly message
try {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(fileContent);
} catch (error: any) {
  if (error?.code === 'ENOENT') {
    throw new Error(`Entity ${this.entityName}:${entityId} not found`);
  }
  throw new Error(
    `Failed to read entity: ${getErrorMessage(error)}`
  );
}
```

[src/classes/Persist.ts:258-272]()

#### Pattern 3: Background Error Emission

```typescript
// Background execution wraps async generators
try {
  for await (const result of generator) {
    // Process result
  }
} catch (error) {
  errorEmitter.next(error);  // Emit recoverable error
  // Continue execution
}
```

[src/classes/Backtest.ts](), [src/classes/Live.ts]()

### Validation Error Handling

```mermaid
graph TB
    SIGNAL["Signal Generation<br/>getSignal() returns ISignalDto"]
    
    VALIDATE["Validation Chain"]
    
    TYPE_VAL["Type Validation<br/>Schema validation"]
    PRICE_VAL["Price Validation<br/>TP/SL distances"]
    LOGIC_VAL["Logic Validation<br/>Price relationships"]
    RISK_VAL["Risk Validation<br/>Portfolio limits"]
    
    SUCCESS["Signal Accepted<br/>State: opened"]
    REJECT["Signal Rejected<br/>validationSubject.next(error)"]
    
    CALLBACK_REJECT["schema.callbacks.onRejected()"]
    LISTEN_VAL["listenValidation() subscribers"]
    
    SIGNAL --> VALIDATE
    VALIDATE --> TYPE_VAL
    TYPE_VAL -->|Pass| PRICE_VAL
    PRICE_VAL -->|Pass| LOGIC_VAL
    LOGIC_VAL -->|Pass| RISK_VAL
    RISK_VAL -->|Pass| SUCCESS
    
    TYPE_VAL -->|Fail| REJECT
    PRICE_VAL -->|Fail| REJECT
    LOGIC_VAL -->|Fail| REJECT
    RISK_VAL -->|Fail| REJECT
    
    REJECT --> CALLBACK_REJECT
    REJECT --> LISTEN_VAL
```

**Sources:** [src/client/ClientRisk.ts](), [src/lib/services/validation/RiskValidationService.ts](), [src/config/emitters.ts:109-112]()

---

## 15.3 Persistence Layer

The persistence layer provides crash-safe storage for live trading state using atomic file operations and automatic validation.

### PersistBase Abstract Class

`PersistBase` is the foundation for all persistence adapters, implementing CRUD operations with automatic directory management and corruption recovery.

```mermaid
graph TB
    subgraph "PersistBase Core"
        CTOR["constructor(entityName, baseDir)<br/>_directory = baseDir/entityName"]
        WAIT_INIT["waitForInit(initial)<br/>Create directory<br/>Validate existing files<br/>Auto-cleanup corrupted"]
        
        READ["readValue(entityId)<br/>Read JSON file<br/>Parse and return"]
        WRITE["writeValue(entityId, entity)<br/>Atomic write<br/>tmp → rename"]
        HAS["hasValue(entityId)<br/>Check file existence"]
        REMOVE["removeValue(entityId)<br/>Delete file"]
        
        KEYS["keys() AsyncGenerator<br/>Yield sorted entity IDs"]
        VALUES["values() AsyncGenerator<br/>Yield sorted entities"]
    end
    
    subgraph "Concrete Adapters"
        SIGNAL["PersistSignalAdapter<br/>./dump/data/signal/{symbol}_{strategy}/<br/>SignalData = ISignalRow | null"]
        RISK["PersistRiskAdapter<br/>./dump/data/risk/{riskName}/<br/>RiskData = IRiskActivePosition[]"]
        SCHEDULE["PersistScheduleAdapter<br/>./dump/data/schedule/{symbol}_{strategy}/<br/>ScheduleData = IScheduledSignalRow[]"]
        PARTIAL["PersistPartialAdapter<br/>./dump/data/partial/{symbol}_{strategy}/<br/>PartialData = Record<signalId, IPartialData>"]
    end
    
    CTOR --> WAIT_INIT
    WAIT_INIT --> READ
    WAIT_INIT --> WRITE
    WAIT_INIT --> HAS
    WAIT_INIT --> REMOVE
    WAIT_INIT --> KEYS
    WAIT_INIT --> VALUES
    
    PersistBase --> SIGNAL
    PersistBase --> RISK
    PersistBase --> SCHEDULE
    PersistBase --> PARTIAL
```

**Sources:** [src/classes/Persist.ts:179-501]()

### Directory Structure

| Adapter | Directory Pattern | Entity ID | Data Type |
|---------|------------------|-----------|-----------|
| `PersistSignalAdapter` | `./dump/data/signal/{symbol}_{strategy}/` | `symbol` | `ISignalRow \| null` |
| `PersistRiskAdapter` | `./dump/data/risk/{riskName}/` | `riskName` | `IRiskActivePosition[]` |
| `PersistScheduleAdapter` | `./dump/data/schedule/{symbol}_{strategy}/` | `symbol` | `IScheduledSignalRow[]` |
| `PersistPartialAdapter` | `./dump/data/partial/{symbol}_{strategy}/` | `symbol` | `Record<signalId, IPartialData>` |

[src/classes/Persist.ts:514-783]()

### Atomic Write Pattern

The atomic write pattern ensures that files are never left in a corrupted state, even if the process crashes during write operations.

```mermaid
sequenceDiagram
    participant Client
    participant PersistBase
    participant writeFileAtomic
    participant FileSystem
    
    Client->>PersistBase: writeValue(entityId, entity)
    PersistBase->>PersistBase: JSON.stringify(entity)
    PersistBase->>writeFileAtomic: writeFileAtomic(filePath, data)
    
    writeFileAtomic->>FileSystem: Write to temp file<br/>filePath.tmp
    FileSystem-->>writeFileAtomic: Write complete
    
    writeFileAtomic->>FileSystem: fsync()<br/>Force disk write
    FileSystem-->>writeFileAtomic: Sync complete
    
    writeFileAtomic->>FileSystem: rename(tmp, final)<br/>Atomic operation
    FileSystem-->>writeFileAtomic: Rename complete
    
    writeFileAtomic-->>PersistBase: Success
    PersistBase-->>Client: Write complete
    
    Note over FileSystem: If crash occurs before rename:<br/>Old file remains intact<br/>Temp file is orphaned<br/>If crash during rename:<br/>OS guarantees atomicity
```

**Sources:** [src/classes/Persist.ts:295-314](), [src/utils/writeFileAtomic.ts]()

### Initialization and Validation

On initialization, `PersistBase` validates all existing files and automatically removes corrupted ones:

```typescript
// From PersistBase.waitForInit implementation
await fs.mkdir(self._directory, { recursive: true });

for await (const key of self.keys()) {
  try {
    await self.readValue(key);  // Validate by attempting to read
  } catch {
    const filePath = self._getFilePath(key);
    console.error(
      `backtest-kit PersistBase found invalid document for filePath=${filePath}`
    );
    
    // Retry deletion up to 5 times with 1s delay
    const success = await retry(
      async () => {
        await fs.unlink(filePath);
        return true;
      },
      BASE_UNLINK_RETRY_COUNT,    // 5
      BASE_UNLINK_RETRY_DELAY     // 1000ms
    );
    
    if (!success) {
      console.error(
        `backtest-kit PersistBase failed to remove invalid document`
      );
    }
  }
}
```

[src/classes/Persist.ts:132-153]()

### Crash Recovery Integration

```mermaid
graph TB
    CRASH["Process Crashes<br/>SIGKILL, OOM, power loss"]
    
    RESTART["Process Restarts<br/>Live.background() called"]
    
    subgraph "State Recovery"
        SIGNAL_INIT["ClientStrategy.waitForInit()<br/>PersistSignalAdapter.readSignalData()"]
        RISK_INIT["ClientRisk.waitForInit()<br/>PersistRiskAdapter.readPositionData()"]
        SCHEDULE_INIT["ClientStrategy.waitForInit()<br/>PersistScheduleAdapter.readScheduleData()"]
        PARTIAL_INIT["ClientPartial.waitForInit()<br/>PersistPartialAdapter.readPartialData()"]
    end
    
    RECOVERED["State Restored<br/>Execution resumes<br/>from last persisted state"]
    
    CRASH --> RESTART
    
    RESTART --> SIGNAL_INIT
    RESTART --> RISK_INIT
    RESTART --> SCHEDULE_INIT
    RESTART --> PARTIAL_INIT
    
    SIGNAL_INIT --> RECOVERED
    RISK_INIT --> RECOVERED
    SCHEDULE_INIT --> RECOVERED
    PARTIAL_INIT --> RECOVERED
    
    NOTE1["Files validated on init<br/>Corrupted files auto-removed<br/>Valid state always loaded"]
    
    SIGNAL_INIT -.-> NOTE1
```

**Sources:** [src/client/ClientStrategy.ts](), [src/client/ClientRisk.ts](), [src/client/ClientPartial.ts](), [src/classes/Persist.ts:132-153]()

### Custom Persistence Adapters

Users can replace the default file-based persistence with custom implementations (e.g., Redis, MongoDB):

```typescript
import { PersistBase, PersistSignalAdapter } from 'backtest-kit';

class RedisPersist extends PersistBase {
  private redis: RedisClient;
  
  constructor(entityName: string, baseDir: string) {
    super(entityName, baseDir);
    this.redis = createRedisClient();
  }
  
  async readValue(entityId: string) {
    const data = await this.redis.get(`${this.entityName}:${entityId}`);
    return JSON.parse(data);
  }
  
  async writeValue(entityId: string, entity: any) {
    const data = JSON.stringify(entity);
    await this.redis.set(`${this.entityName}:${entityId}`, data);
  }
  
  async hasValue(entityId: string) {
    return await this.redis.exists(`${this.entityName}:${entityId}`);
  }
  
  // Implement other required methods...
}

// Register custom adapter
PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
```

**Sources:** [src/classes/Persist.ts:541-548](), [src/classes/Persist.ts:69-78]()

### Persistence Adapter Comparison

| Adapter | Purpose | Write Frequency | Data Size | Backtest Mode |
|---------|---------|-----------------|-----------|---------------|
| `PersistSignalAdapter` | Active signal state | Every signal state change | ~1KB per signal | Disabled |
| `PersistRiskAdapter` | Portfolio positions | Every position add/remove | ~5-50KB per risk profile | Disabled |
| `PersistScheduleAdapter` | Scheduled signals | Every scheduled signal update | ~5-50KB per strategy | Disabled |
| `PersistPartialAdapter` | Profit/loss levels | Every level milestone | ~1-5KB per signal | Disabled |

All adapters skip persistence in backtest mode (`backtest=true`) for performance, as crash recovery is unnecessary for historical simulations.

[src/client/ClientPartial.ts:214-218](), [src/classes/Persist.ts]()

### Async Iteration Support

`PersistBase` implements async iteration for convenient data access:

```typescript
// Iterate all entities
for await (const entity of persistAdapter.values()) {
  console.log(entity);
}

// Iterate all keys
for await (const key of persistAdapter.keys()) {
  console.log(key);
}

// Filter entities
for await (const entity of persistAdapter.filter(e => e.status === 'active')) {
  console.log(entity);
}

// Take first N entities
for await (const entity of persistAdapter.take(10)) {
  console.log(entity);
}
```

**Sources:** [src/classes/Persist.ts:377-499]()