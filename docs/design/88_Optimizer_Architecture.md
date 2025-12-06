# Optimizer Architecture

## Purpose and Scope

This page documents the architecture of the Optimizer system, which generates AI-powered trading strategies through LLM integration. It covers the core components (`ClientOptimizer`, `OptimizerConnectionService`, `OptimizerTemplateService`), their relationships, the template merging pattern, and the execution flow of the three main operations: `getData`, `getCode`, and `dump`.

For details on data collection and pagination, see [Data Collection Pipeline](#16.5.2). For LLM integration specifics, see [LLM Integration](#16.5.3). For code generation details, see [Strategy Code Generation](#16.5.4). For training/testing range configuration, see [Training vs Testing Ranges](#16.5.5).

## Component Overview

The Optimizer system consists of four primary components organized in a layered architecture:

```mermaid
graph TB
    User["User Code"]
    
    subgraph "Public API Layer"
        OptimizerAPI["Optimizer.getData()<br/>Optimizer.getCode()<br/>Optimizer.dump()"]
    end
    
    subgraph "Service Layer"
        OptimizerConnectionService["OptimizerConnectionService<br/>getOptimizer() [memoized]<br/>getData()<br/>getCode()<br/>dump()"]
        OptimizerSchemaService["OptimizerSchemaService<br/>Registry: optimizerName → IOptimizerSchema"]
        OptimizerTemplateService["OptimizerTemplateService<br/>11 default template methods"]
    end
    
    subgraph "Client Layer"
        ClientOptimizer["ClientOptimizer<br/>IOptimizerParams<br/>getData()<br/>getCode()<br/>dump()"]
    end
    
    subgraph "Internal Functions"
        GET_STRATEGY_DATA_FN["GET_STRATEGY_DATA_FN<br/>Data collection + LLM conversation"]
        GET_STRATEGY_CODE_FN["GET_STRATEGY_CODE_FN<br/>11-section code assembly"]
        GET_STRATEGY_DUMP_FN["GET_STRATEGY_DUMP_FN<br/>File system write"]
        RESOLVE_PAGINATION_FN["RESOLVE_PAGINATION_FN<br/>Pagination handler"]
    end
    
    User -->|"addOptimizer()"| OptimizerSchemaService
    User -->|"Optimizer.getData/getCode/dump"| OptimizerAPI
    
    OptimizerAPI --> OptimizerConnectionService
    
    OptimizerConnectionService -->|"retrieves schema"| OptimizerSchemaService
    OptimizerConnectionService -->|"retrieves defaults"| OptimizerTemplateService
    OptimizerConnectionService -->|"creates/caches"| ClientOptimizer
    
    ClientOptimizer --> GET_STRATEGY_DATA_FN
    ClientOptimizer --> GET_STRATEGY_CODE_FN
    ClientOptimizer --> GET_STRATEGY_DUMP_FN
    
    GET_STRATEGY_DATA_FN --> RESOLVE_PAGINATION_FN
    GET_STRATEGY_CODE_FN --> GET_STRATEGY_DATA_FN
    GET_STRATEGY_DUMP_FN --> GET_STRATEGY_CODE_FN
```

**Sources:** [src/client/ClientOptimizer.ts:1-448](), [src/lib/services/connection/OptimizerConnectionService.ts:1-175](), [src/lib/services/template/OptimizerTemplateService.ts:1-710]()

## Core Components

### ClientOptimizer

`ClientOptimizer` is the main client class that performs optimizer operations. It accepts `IOptimizerParams` (which extends `IOptimizerSchema` with logger and complete template) and an `onProgress` callback for progress emission.

**Constructor Parameters:**
- `params: IOptimizerParams` - Configuration with resolved dependencies
- `onProgress: (progress: ProgressOptimizerContract) => void` - Progress event emitter

**Public Methods:**

| Method | Parameters | Return Type | Description |
|--------|-----------|-------------|-------------|
| `getData` | `symbol: string` | `Promise<IOptimizerStrategy[]>` | Fetches data from all sources and generates strategy metadata |
| `getCode` | `symbol: string` | `Promise<string>` | Generates complete executable strategy code |
| `dump` | `symbol: string, path?: string` | `Promise<void>` | Generates and saves strategy code to file |

**Key Implementation Details:**

The class delegates to three internal functions for its operations:
- `GET_STRATEGY_DATA_FN` - Handles data collection and LLM conversation building [src/client/ClientOptimizer.ts:99-215]()
- `GET_STRATEGY_CODE_FN` - Handles code assembly from templates [src/client/ClientOptimizer.ts:225-350]()
- `GET_STRATEGY_DUMP_FN` - Handles file system operations [src/client/ClientOptimizer.ts:360-384]()

**Sources:** [src/client/ClientOptimizer.ts:397-447](), [src/interfaces/Optimizer.interface.ts:436-451]()

### OptimizerConnectionService

`OptimizerConnectionService` serves as the service layer between the public API and `ClientOptimizer`. It handles dependency injection, template merging, and instance caching.

**Injected Dependencies:**
- `LoggerService` - For debug and info logging
- `OptimizerSchemaService` - For retrieving registered optimizer schemas
- `OptimizerTemplateService` - For default template implementations

**Key Method: `getOptimizer`**

The `getOptimizer` method is memoized by `optimizerName` to ensure only one `ClientOptimizer` instance exists per optimizer configuration:

```typescript
public getOptimizer = memoize(
  ([optimizerName]) => `${optimizerName}`,
  (optimizerName: OptimizerName) => {
    // Retrieve schema and merge templates
    // Return new ClientOptimizer instance
  }
);
```

This method performs three critical operations:
1. Retrieves the schema from `OptimizerSchemaService` [src/lib/services/connection/OptimizerConnectionService.ts:62-69]()
2. Merges custom templates with defaults from `OptimizerTemplateService` [src/lib/services/connection/OptimizerConnectionService.ts:72-97]()
3. Instantiates `ClientOptimizer` with resolved dependencies [src/lib/services/connection/OptimizerConnectionService.ts:99-112]()

**Delegation Methods:**

The service exposes three methods that delegate to the cached `ClientOptimizer` instance:

| Method | Delegates To | Description |
|--------|--------------|-------------|
| `getData(symbol, optimizerName)` | `optimizer.getData(symbol)` | Returns strategy metadata |
| `getCode(symbol, optimizerName)` | `optimizer.getCode(symbol)` | Returns generated code |
| `dump(symbol, optimizerName, path?)` | `optimizer.dump(symbol, path)` | Saves code to file |

**Sources:** [src/lib/services/connection/OptimizerConnectionService.ts:41-174]()

### OptimizerTemplateService

`OptimizerTemplateService` implements the `IOptimizerTemplate` interface, providing default code generation templates for all 11 required methods:

**Template Methods:**

| Method | Return Type | Purpose |
|--------|-------------|---------|
| `getTopBanner` | `string` | Imports and constants (shebang, ollama, ccxt, backtest-kit) |
| `getUserMessage` | `string` | Default user message format for LLM conversations |
| `getAssistantMessage` | `string` | Default assistant acknowledgment message |
| `getWalkerTemplate` | `string` | `addWalker()` configuration code |
| `getStrategyTemplate` | `string` | `addStrategy()` with `getSignal()` function and LLM integration |
| `getExchangeTemplate` | `string` | `addExchange()` with CCXT Binance integration |
| `getFrameTemplate` | `string` | `addFrame()` timeframe configuration |
| `getLauncherTemplate` | `string` | `Walker.background()` with event listeners |
| `getTextTemplate` | `string` | `text()` helper for LLM text generation |
| `getJsonTemplate` | `string` | `json()` helper for structured signal output |
| `getJsonDumpTemplate` | `string` | `dumpJson()` helper for debug logging |

All methods accept relevant parameters (symbol, name, dates, etc.) and return generated code as strings. The service uses escape functions to prevent code injection from user-provided values.

**Sources:** [src/lib/services/template/OptimizerTemplateService.ts:26-709](), [src/interfaces/Optimizer.interface.ts:242-374]()

### OptimizerSchemaService

`OptimizerSchemaService` is a standard schema service that maintains a registry mapping `optimizerName` to `IOptimizerSchema`. It follows the same pattern as other schema services in the codebase (`StrategySchemaService`, `ExchangeSchemaService`, etc.).

For schema service architecture details, see [Schema Services](#7.3).

## Template Merging Pattern

The template merging pattern allows users to override specific template methods while falling back to defaults for unspecified methods. This provides flexibility without requiring complete reimplementation.

```mermaid
graph LR
    subgraph "User Configuration"
        UserSchema["IOptimizerSchema<br/>template?: Partial&lt;IOptimizerTemplate&gt;"]
    end
    
    subgraph "OptimizerConnectionService.getOptimizer()"
        RetrieveSchema["Retrieve schema<br/>from OptimizerSchemaService"]
        ExtractPartial["Extract rawTemplate<br/>= schema.template || {}"]
        MergeDefaults["For each of 11 methods:<br/>method = rawTemplate.method<br/>|| templateService.method"]
        CreateComplete["Create complete<br/>IOptimizerTemplate object"]
        InstantiateClient["Instantiate ClientOptimizer<br/>with complete template"]
    end
    
    subgraph "OptimizerTemplateService"
        DefaultMethods["11 default template methods<br/>getTopBanner, getUserMessage,<br/>getAssistantMessage, etc."]
    end
    
    subgraph "ClientOptimizer"
        UseTemplate["Use params.template<br/>for code generation"]
    end
    
    UserSchema --> RetrieveSchema
    RetrieveSchema --> ExtractPartial
    ExtractPartial --> MergeDefaults
    DefaultMethods --> MergeDefaults
    MergeDefaults --> CreateComplete
    CreateComplete --> InstantiateClient
    InstantiateClient --> UseTemplate
```

**Implementation Example:**

[src/lib/services/connection/OptimizerConnectionService.ts:62-97]()

```typescript
const {
  getPrompt,
  rangeTest,
  rangeTrain,
  source,
  template: rawTemplate = {},  // Partial user overrides
  callbacks,
} = this.optimizerSchemaService.get(optimizerName);

// Merge with defaults
const {
  getAssistantMessage = this.optimizerTemplateService.getAssistantMessage,
  getExchangeTemplate = this.optimizerTemplateService.getExchangeTemplate,
  // ... 9 more methods
} = rawTemplate;

const template: IOptimizerTemplate = {
  getAssistantMessage,
  getExchangeTemplate,
  // ... complete object with all 11 methods
};
```

This pattern ensures:
1. Users only specify overrides for methods they want to customize
2. All methods are guaranteed to have implementations
3. Type safety is maintained through `IOptimizerTemplate` interface
4. No runtime errors from missing template methods

**Sources:** [src/lib/services/connection/OptimizerConnectionService.ts:59-113](), [src/interfaces/Optimizer.interface.ts:426-427]()

## Execution Flow

### getData Method Flow

The `getData` method collects data from all configured sources and builds LLM conversation histories for strategy generation.

```mermaid
sequenceDiagram
    participant User
    participant API as "Optimizer.getData"
    participant Conn as "OptimizerConnectionService"
    participant Client as "ClientOptimizer"
    participant DataFn as "GET_STRATEGY_DATA_FN"
    participant PageFn as "RESOLVE_PAGINATION_FN"
    participant Source as "IOptimizerSourceFn"
    participant Emitter as "progressOptimizerEmitter"
    
    User->>API: getData(symbol, optimizerName)
    API->>Conn: getData(symbol, optimizerName)
    Conn->>Conn: getOptimizer(optimizerName)<br/>[memoized]
    Conn->>Client: getData(symbol)
    Client->>DataFn: execute
    
    loop For each rangeTrain
        loop For each source
            DataFn->>Emitter: emit progress<br/>(processedSources / totalSources)
            DataFn->>PageFn: RESOLVE_PAGINATION_FN(fetch, filterData)
            
            loop Pagination
                PageFn->>Source: fetch({symbol, startDate, endDate, limit, offset})
                Source-->>PageFn: data page
            end
            
            PageFn-->>DataFn: deduplicated data array
            
            alt Source is IOptimizerSource
                DataFn->>DataFn: source.user(symbol, data, name)
                DataFn->>DataFn: source.assistant(symbol, data, name)
            else Source is IOptimizerSourceFn
                DataFn->>DataFn: DEFAULT_USER_FN(symbol, data, name)
                DataFn->>DataFn: DEFAULT_ASSISTANT_FN(symbol, data, name)
            end
            
            DataFn->>DataFn: messageList.push({role:'user', content})<br/>messageList.push({role:'assistant', content})
        end
        
        DataFn->>DataFn: getPrompt(symbol, messageList)
        DataFn->>DataFn: strategyList.push({symbol, name, messages, strategy})
    end
    
    DataFn->>Emitter: emit final progress (100%)
    DataFn-->>Client: strategyList
    Client-->>User: IOptimizerStrategy[]
```

**Key Steps:**

1. **Progress Initialization**: Calculate `totalSources = rangeTrain.length * source.length` [src/client/ClientOptimizer.ts:101-102]()
2. **Range Iteration**: For each training range, create a fresh `messageList` [src/client/ClientOptimizer.ts:104-105]()
3. **Source Processing**: For each source, emit progress, paginate data, format messages [src/client/ClientOptimizer.ts:107-186]()
4. **Pagination**: Use `iterateDocuments` from `functools-kit` with `distinctDocuments` for deduplication [src/client/ClientOptimizer.ts:70-88]()
5. **Message Formatting**: Call user/assistant formatters, append to conversation history [src/client/ClientOptimizer.ts:132-145]()
6. **Strategy Generation**: Call `getPrompt()` with complete message history [src/client/ClientOptimizer.ts:196]()
7. **Callback Execution**: Invoke `onData` callback if provided [src/client/ClientOptimizer.ts:210-212]()

**Sources:** [src/client/ClientOptimizer.ts:99-215](), [src/client/ClientOptimizer.ts:410-415]()

### getCode Method Flow

The `getCode` method assembles executable strategy code from 11 template sections in a specific order.

```mermaid
graph TD
    Start["getCode(symbol)"] --> GetData["getData(symbol)"]
    GetData --> CreatePrefix["CREATE_PREFIX_FN()<br/>Generate random prefix"]
    CreatePrefix --> InitSections["sections = []"]
    
    InitSections --> S1["1. getTopBanner(symbol)<br/>Imports + constants"]
    S1 --> S2["2. getJsonDumpTemplate(symbol)<br/>dumpJson() function"]
    S2 --> S3["3. getTextTemplate(symbol)<br/>text() LLM helper"]
    S3 --> S4["4. getJsonTemplate(symbol)<br/>json() LLM helper"]
    S4 --> S5["5. getExchangeTemplate(symbol, exchangeName)<br/>addExchange() call"]
    
    S5 --> S6["6. Loop rangeTrain:<br/>getFrameTemplate(symbol, frameName, interval, dates)<br/>addFrame() for training"]
    S6 --> S7["7. getFrameTemplate(symbol, testFrameName, interval, rangeTest)<br/>addFrame() for testing"]
    S7 --> S8["8. Loop strategyData:<br/>getStrategyTemplate(strategyName, interval, prompt)<br/>addStrategy() calls"]
    
    S8 --> S9["9. getWalkerTemplate(walkerName, exchangeName, testFrameName, strategies)<br/>addWalker() call"]
    S9 --> S10["10. getLauncherTemplate(symbol, walkerName)<br/>Walker.background() + listeners"]
    
    S10 --> JoinSections["code = sections.join('\\n')"]
    JoinSections --> CallbackCode["onCode callback<br/>(if provided)"]
    CallbackCode --> ReturnCode["return code"]
```

**Section Assembly Order:**

The code generation follows a strict 11-section sequence defined in [src/client/ClientOptimizer.ts:225-350]():

| Section | Lines | Template Method | Output |
|---------|-------|-----------------|--------|
| 1 | 233-236 | `getTopBanner` | Shebang, imports (ollama, ccxt, backtest-kit), WARN_KB constant |
| 2 | 239-242 | `getJsonDumpTemplate` | `dumpJson(resultId, history, result)` debug function |
| 3 | 245-248 | `getTextTemplate` | `text(messages)` LLM text helper with deepseek-v3.1 |
| 4 | 250-253 | `getJsonTemplate` | `json(messages)` LLM structured output helper |
| 5 | 256-264 | `getExchangeTemplate` | `addExchange()` with CCXT Binance |
| 6 | 267-282 | `getFrameTemplate` (loop) | `addFrame()` for each training range |
| 7 | 285-297 | `getFrameTemplate` | `addFrame()` for testing range |
| 8 | 300-314 | `getStrategyTemplate` (loop) | `addStrategy()` for each generated strategy |
| 9 | 317-332 | `getWalkerTemplate` | `addWalker()` configuration |
| 10 | 335-341 | `getLauncherTemplate` | `Walker.background()` + event listeners |
| 11 | - | - | Final join with newlines |

**Naming Convention:**

Generated code uses a random prefix to avoid naming collisions:
- Exchange: `{prefix}_exchange`
- Training frames: `{prefix}_train_frame-1`, `{prefix}_train_frame-2`, ...
- Test frame: `{prefix}_test_frame`
- Strategies: `{prefix}_strategy-1`, `{prefix}_strategy-2`, ...
- Walker: `{prefix}_walker`

The prefix is generated via `CREATE_PREFIX_FN()` using base36 encoding [src/client/ClientOptimizer.ts:22]().

**Sources:** [src/client/ClientOptimizer.ts:225-350](), [src/client/ClientOptimizer.ts:424-429]()

### dump Method Flow

The `dump` method saves generated code to the file system with error handling and callbacks.

```mermaid
sequenceDiagram
    participant User
    participant Client as "ClientOptimizer"
    participant CodeFn as "GET_STRATEGY_CODE_FN"
    participant DumpFn as "GET_STRATEGY_DUMP_FN"
    participant FS as "fs/promises"
    participant Logger as "LoggerService"
    
    User->>Client: dump(symbol, path)
    Client->>DumpFn: execute
    DumpFn->>CodeFn: getCode(symbol)
    CodeFn-->>DumpFn: generated code string
    
    DumpFn->>DumpFn: dir = join(process.cwd(), path)
    
    DumpFn->>FS: mkdir(dir, {recursive: true})
    FS-->>DumpFn: directory created
    
    DumpFn->>DumpFn: filename = "{optimizerName}_{symbol}.mjs"
    DumpFn->>DumpFn: filepath = join(dir, filename)
    
    DumpFn->>FS: writeFile(filepath, report, "utf-8")
    
    alt Write successful
        FS-->>DumpFn: success
        DumpFn->>Logger: info("Optimizer report saved: {filepath}")
        DumpFn->>DumpFn: onDump callback (if provided)
        DumpFn-->>User: void
    else Write failed
        FS-->>DumpFn: error
        DumpFn->>Logger: warn("Failed to save optimizer report", error)
        DumpFn-->>User: throw error
    end
```

**File Path Construction:**

The dump method constructs file paths using the following pattern [src/client/ClientOptimizer.ts:367-373]():
```typescript
const dir = join(process.cwd(), path);
await mkdir(dir, { recursive: true });

const filename = `${self.params.optimizerName}_${symbol}.mjs`;
const filepath = join(dir, filename);
```

**Example Output:** If `optimizerName = "trend_analyzer"` and `symbol = "BTCUSDT"`, with `path = "./strategies"`, the file would be saved to:
```
{cwd}/strategies/trend_analyzer_BTCUSDT.mjs
```

**Error Handling:**

The dump operation includes comprehensive error handling:
1. Directory creation with `recursive: true` flag (creates parent directories if needed)
2. Try-catch wrapper around file write operation
3. Logger warning on failure with error details
4. Error re-throw to allow upstream handling

**Callbacks:**

The dump method supports an optional `onDump` callback that executes after successful file write [src/client/ClientOptimizer.ts:377-379]():
```typescript
if (self.params.callbacks?.onDump) {
  await self.params.callbacks.onDump(symbol, filepath);
}
```

This enables custom post-processing such as:
- Notification systems
- File permission adjustment
- Git commit automation
- Remote file upload

**Sources:** [src/client/ClientOptimizer.ts:360-384](), [src/client/ClientOptimizer.ts:438-444]()

## Dependency Injection and Service Registration

The Optimizer system integrates with the broader dependency injection architecture through standard TYPES symbols and service registration.

**TYPES Symbols:**

The following symbols identify Optimizer-related services in the dependency injection container:
- `TYPES.optimizerSchemaService` - Schema registry service
- `TYPES.optimizerConnectionService` - Connection service with memoized client instances
- `TYPES.optimizerTemplateService` - Default template implementation

**Service Composition:**

```mermaid
graph TB
    subgraph "TYPES Symbol Registry"
        T1["TYPES.loggerService"]
        T2["TYPES.optimizerSchemaService"]
        T3["TYPES.optimizerConnectionService"]
        T4["TYPES.optimizerTemplateService"]
    end
    
    subgraph "provide.ts Registration"
        P1["LoggerService instance"]
        P2["OptimizerSchemaService instance"]
        P3["OptimizerConnectionService instance"]
        P4["OptimizerTemplateService instance"]
    end
    
    subgraph "OptimizerConnectionService Dependencies"
        D1["inject&lt;LoggerService&gt;<br/>(TYPES.loggerService)"]
        D2["inject&lt;OptimizerSchemaService&gt;<br/>(TYPES.optimizerSchemaService)"]
        D3["inject&lt;OptimizerTemplateService&gt;<br/>(TYPES.optimizerTemplateService)"]
    end
    
    T1 --> P1
    T2 --> P2
    T3 --> P3
    T4 --> P4
    
    P1 --> D1
    P2 --> D2
    P4 --> D3
    
    D1 --> OptimizerConnectionService
    D2 --> OptimizerConnectionService
    D3 --> OptimizerConnectionService
```

The Optimizer services follow the same dependency injection pattern as other framework components. For comprehensive coverage of the DI system, see [Dependency Injection System](#3.2).

**Sources:** [src/lib/services/connection/OptimizerConnectionService.ts:42-48](), [src/lib/services/template/OptimizerTemplateService.ts:27]()