# Data Collection Pipeline

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/classes/Optimizer.ts](src/classes/Optimizer.ts)
- [src/client/ClientOptimizer.ts](src/client/ClientOptimizer.ts)
- [src/interfaces/Optimizer.interface.ts](src/interfaces/Optimizer.interface.ts)
- [src/lib/services/connection/OptimizerConnectionService.ts](src/lib/services/connection/OptimizerConnectionService.ts)
- [src/lib/services/global/OptimizerGlobalService.ts](src/lib/services/global/OptimizerGlobalService.ts)
- [src/lib/services/schema/OptimizerSchemaService.ts](src/lib/services/schema/OptimizerSchemaService.ts)
- [src/lib/services/template/OptimizerTemplateService.ts](src/lib/services/template/OptimizerTemplateService.ts)
- [src/lib/services/validation/OptimizerValidationService.ts](src/lib/services/validation/OptimizerValidationService.ts)
- [src/model/Message.model.ts](src/model/Message.model.ts)

</details>



## Purpose and Scope

This document describes the data collection phase of the AI-powered optimizer, where historical trading data is fetched from external sources, paginated, formatted into LLM conversation messages, and accumulated across multiple training ranges. For information about the overall optimizer architecture and how components connect, see [Optimizer Architecture](#16.5.1). For details on how the collected data is sent to the LLM after collection, see [LLM Integration](#16.5.3).

The data collection pipeline is implemented primarily in `ClientOptimizer.getData()` and processes sources sequentially for each training date range, building up a conversation history that provides market context for strategy generation.

## Source Configuration

### Source Type Definitions

The optimizer supports two types of data source configurations, both defined in the `IOptimizerSchema.source` array:

**Simple Function Source**

A function implementing `IOptimizerSourceFn` that accepts pagination parameters and returns data:

```typescript
type SimpleSoure = (args: IOptimizerFetchArgs) => Data[] | Promise<Data[]>
```

This form uses default message formatters from `OptimizerTemplateService`.

**Full Configuration Source**

An object implementing `IOptimizerSource` with custom message formatters:

```typescript
interface IOptimizerSource {
  name: string;
  fetch: IOptimizerSourceFn;
  user?: (symbol, data, name) => string | Promise<string>;
  assistant?: (symbol, data, name) => string | Promise<string>;
}
```

This form allows customization of how data is presented to the LLM.

Sources: [src/interfaces/Optimizer.interface.ts:129-177](), [src/interfaces/Optimizer.interface.ts:92-94]()

### Data Source Interface Requirements

All data returned from sources must implement `IOptimizerData` with a unique `id` field:

```typescript
interface IOptimizerData {
  id: string | number;
}
```

The `id` field enables deduplication when paginating through large datasets. Without unique IDs, the same records could be processed multiple times.

```mermaid
graph LR
    Schema["IOptimizerSchema"]
    Source1["source[0]"]
    Source2["source[1]"]
    SourceN["source[n]"]
    
    SimpleFunc["IOptimizerSourceFn<br/>Function only"]
    FullConfig["IOptimizerSource<br/>with name, fetch,<br/>user, assistant"]
    
    FetchArgs["IOptimizerFetchArgs<br/>symbol, startDate,<br/>endDate, limit, offset"]
    DataArray["Data[] extends<br/>IOptimizerData<br/>(must have id field)"]
    
    Schema -->|"source array"| Source1
    Schema --> Source2
    Schema --> SourceN
    
    Source1 -.->|"can be"| SimpleFunc
    Source1 -.->|"or"| FullConfig
    
    SimpleFunc -->|"receives"| FetchArgs
    FullConfig -->|"fetch() receives"| FetchArgs
    
    SimpleFunc -->|"returns"| DataArray
    FullConfig -->|"fetch() returns"| DataArray
```

**Diagram: Source Type Configuration Options**

Sources: [src/interfaces/Optimizer.interface.ts:38-44](), [src/interfaces/Optimizer.interface.ts:129-177](), [src/interfaces/Optimizer.interface.ts:183-185]()

## Pagination Architecture

### Automatic Pagination with functools-kit

The optimizer uses `functools-kit` utilities to handle pagination automatically, eliminating the need for manual offset/limit management in user code. The `RESOLVE_PAGINATION_FN` function at [src/client/ClientOptimizer.ts:70-88]() orchestrates this:

```mermaid
graph TB
    ResolvePagFn["RESOLVE_PAGINATION_FN<br/>(ClientOptimizer.ts:70)"]
    IterDocs["iterateDocuments<br/>(functools-kit)"]
    CreateReq["createRequest callback<br/>calls fetch with limit, offset"]
    DistinctDocs["distinctDocuments<br/>(functools-kit)"]
    DistinctId["(data) => data.id<br/>comparison function"]
    ResolveAll["resolveDocuments<br/>(functools-kit)"]
    
    UserFetch["IOptimizerSourceFn<br/>user-provided fetch"]
    FilterArgs["IOptimizerFilterArgs<br/>symbol, startDate, endDate"]
    
    IterLimit["ITERATION_LIMIT = 25<br/>(ClientOptimizer.ts:19)"]
    
    AsyncGen1["AsyncGenerator<Data[]><br/>paginated batches"]
    AsyncGen2["AsyncGenerator<Data[]><br/>deduplicated"]
    FinalArray["Data[]<br/>complete dataset"]
    
    ResolvePagFn -->|"receives"| FilterArgs
    ResolvePagFn -->|"calls with"| IterDocs
    
    IterLimit -->|"limit parameter"| CreateReq
    
    IterDocs -->|"createRequest:<br/>{limit, offset}"| CreateReq
    CreateReq -->|"invokes"| UserFetch
    UserFetch -->|"returns page"| AsyncGen1
    
    IterDocs -->|"yields until<br/>page.length < limit"| AsyncGen1
    
    AsyncGen1 -->|"pipe to"| DistinctDocs
    DistinctDocs -->|"uses"| DistinctId
    DistinctId -->|"filters duplicates"| AsyncGen2
    
    AsyncGen2 -->|"consume with"| ResolveAll
    ResolveAll -->|"returns"| FinalArray
    FinalArray -->|"complete array"| ResolvePagFn
```

**Diagram: RESOLVE_PAGINATION_FN Pagination Pipeline**

The pagination process consists of three stages implemented via functools-kit:

1. **Iteration**: `iterateDocuments` creates a generator that repeatedly invokes the user's `fetch` function with `createRequest` callback, incrementing `offset` by `ITERATION_LIMIT` (25) each iteration until a page returns fewer items than the limit
2. **Deduplication**: `distinctDocuments` pipes the generator through a filter using `(data) => data.id` as the comparison key to remove duplicate records across pages
3. **Resolution**: `resolveDocuments` consumes the async generator and accumulates all items into a final array

Sources: [src/client/ClientOptimizer.ts:70-88](), [src/client/ClientOptimizer.ts:19]()
</thinking>

### Fetch Arguments Structure

When the pagination system calls the user's fetch function, it provides `IOptimizerFetchArgs`:

| Parameter | Type | Source | Description |
|-----------|------|--------|-------------|
| `symbol` | `string` | from `filterData` | Trading pair identifier (e.g., "BTCUSDT") |
| `startDate` | `Date` | from `filterData` | Range start (inclusive) |
| `endDate` | `Date` | from `filterData` | Range end (inclusive) |
| `limit` | `number` | `ITERATION_LIMIT` | Maximum records per page (25) |
| `offset` | `number` | pagination loop | Number of records to skip |

Sources: [src/interfaces/Optimizer.interface.ts:68-83](), [src/client/ClientOptimizer.ts:76-84]()

### Fetch Arguments Structure

When the pagination system calls the user's fetch function, it provides:

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | `string` | Trading pair identifier (e.g., "BTCUSDT") |
| `startDate` | `Date` | Range start (inclusive) |
| `endDate` | `Date` | Range end (inclusive) |
| `limit` | `number` | Maximum records per page (25) |
| `offset` | `number` | Number of records to skip |

Sources: [src/interfaces/Optimizer.interface.ts:68-83]()

## Data Collection Execution Flow

### Main Collection Function

The `GET_STRATEGY_DATA_FN` function at [src/client/ClientOptimizer.ts:99-215]() implements the complete data collection pipeline. It is called by `ClientOptimizer.getData()` and processes all training ranges sequentially.

```mermaid
sequenceDiagram
    participant UserCode as "User Code"
    participant ClientOpt as "ClientOptimizer.getData()"
    participant GetStratFn as "GET_STRATEGY_DATA_FN<br/>(ClientOptimizer.ts:99)"
    participant OnProgress as "onProgress callback<br/>(progressOptimizerEmitter)"
    participant ResolvePag as "RESOLVE_PAGINATION_FN<br/>(ClientOptimizer.ts:70)"
    participant UserFetch as "source.fetch()<br/>IOptimizerSourceFn"
    
    UserCode->>ClientOpt: getData(symbol)
    ClientOpt->>GetStratFn: Execute (symbol, self)
    
    Note over GetStratFn: strategyList: IOptimizerStrategy[] = []<br/>processedSources = 0<br/>totalSources = rangeTrain.length × source.length
    
    loop for range in params.rangeTrain
        Note over GetStratFn: messageList: MessageModel[] = []
        
        loop for source in params.source
            GetStratFn->>OnProgress: emit ProgressOptimizerContract<br/>{optimizerName, symbol, progress}
            
            GetStratFn->>ResolvePag: RESOLVE_PAGINATION_FN(fetch, filterData)
            
            loop pagination (functools-kit)
                ResolvePag->>UserFetch: fetch({symbol, startDate, endDate, limit, offset})
                UserFetch-->>ResolvePag: Data[] (page)
            end
            
            ResolvePag-->>GetStratFn: Data[] (deduplicated)
            
            opt params.callbacks?.onSourceData
                GetStratFn->>UserCode: onSourceData(symbol, name, data, dates)
            end
            
            GetStratFn->>GetStratFn: DEFAULT_USER_FN or source.user()<br/>→ userContent: string
            GetStratFn->>GetStratFn: DEFAULT_ASSISTANT_FN or source.assistant()<br/>→ assistantContent: string
            
            Note over GetStratFn: messageList.push(<br/>  {role: "user", content: userContent},<br/>  {role: "assistant", content: assistantContent}<br/>)
            
            Note over GetStratFn: processedSources++
        end
        
        GetStratFn->>GetStratFn: params.getPrompt(symbol, messageList)<br/>→ strategy: string
        
        Note over GetStratFn: strategyList.push(<br/>  {symbol, name, messages, strategy}<br/>)
    end
    
    GetStratFn->>OnProgress: emit final progress (1.0)
    
    opt params.callbacks?.onData
        GetStratFn->>UserCode: onData(symbol, strategyList)
    end
    
    GetStratFn-->>ClientOpt: IOptimizerStrategy[]
    ClientOpt-->>UserCode: return strategyList
```

**Diagram: GET_STRATEGY_DATA_FN Execution Flow**

Sources: [src/client/ClientOptimizer.ts:99-215](), [src/client/ClientOptimizer.ts:410-415]()

### Progress Tracking

The optimizer emits `ProgressOptimizerContract` events at two key points:

1. **Before processing each source**: Shows incremental progress through all sources across all training ranges
2. **After completing all sources**: Emits final 100% completion

Progress calculation:

```
totalSources = rangeTrain.length × source.length
progress = processedSources / totalSources
```

The progress events are emitted via `progressOptimizerEmitter` which can be observed using `listenOptimizerProgress()`.

Sources: [src/client/ClientOptimizer.ts:101-114](), [src/client/ClientOptimizer.ts:202-208](), [src/contract/ProgressOptimizer.contract.ts:1-31]()

## Message Formatting System

### Default Message Formatters

The `OptimizerTemplateService` provides default formatters accessible via template delegation:

**User Message Formatter** (`DEFAULT_USER_FN` at [src/client/ClientOptimizer.ts:34-41]())

```typescript
const DEFAULT_USER_FN = async (symbol, data, name, self) => {
  return await self.params.template.getUserMessage(symbol, data, name);
};
```

The default implementation in `OptimizerTemplateService.getUserMessage` at [src/lib/services/template/OptimizerTemplateService.ts:77-88]() returns:

```
"Прочитай данные и скажи ОК\n\n" + JSON.stringify(data)
```

**Assistant Message Formatter** (`DEFAULT_ASSISTANT_FN` at [src/client/ClientOptimizer.ts:53-60]())

```typescript
const DEFAULT_ASSISTANT_FN = async (symbol, data, name, self) => {
  return await self.params.template.getAssistantMessage(symbol, data, name);
};
```

The default implementation in `OptimizerTemplateService.getAssistantMessage` at [src/lib/services/template/OptimizerTemplateService.ts:99-110]() returns:

```
"ОК"
```

These simple defaults acknowledge data receipt without processing, allowing the LLM to focus on later strategy generation prompts.

Sources: [src/client/ClientOptimizer.ts:34-60](), [src/lib/services/template/OptimizerTemplateService.ts:76-110]()

### Custom Message Formatters

Sources can override default formatters by providing `user` and `assistant` functions in the `IOptimizerSource` configuration:

```mermaid
graph TB
    SourceCheck["GET_STRATEGY_DATA_FN<br/>source iteration loop"]
    TypeCheck{"typeof source<br/>=== 'function'?"}
    
    SimpleSource["IOptimizerSourceFn<br/>(function only)"]
    FullSource["IOptimizerSource<br/>(config object)"]
    
    ExtractSimple["name = DEFAULT_SOURCE_NAME<br/>user = DEFAULT_USER_FN<br/>assistant = DEFAULT_ASSISTANT_FN"]
    
    ExtractFull["extract source.name<br/>source.user || DEFAULT_USER_FN<br/>source.assistant || DEFAULT_ASSISTANT_FN"]
    
    CallUser["await user(symbol, data, name, self)<br/>→ userContent"]
    CallAssist["await assistant(symbol, data, name, self)<br/>→ assistantContent"]
    
    PushMsg["messageList.push(<br/>{role: 'user', content: userContent},<br/>{role: 'assistant', content: assistantContent}<br/>)"]
    
    SourceCheck --> TypeCheck
    TypeCheck -->|"true"| SimpleSource
    TypeCheck -->|"false"| FullSource
    
    SimpleSource --> ExtractSimple
    FullSource --> ExtractFull
    
    ExtractSimple --> CallUser
    ExtractSimple --> CallAssist
    ExtractFull --> CallUser
    ExtractFull --> CallAssist
    
    CallUser --> PushMsg
    CallAssist --> PushMsg
```

**Diagram: Message Formatter Selection in GET_STRATEGY_DATA_FN**

Custom formatters (when provided in `IOptimizerSource`) receive:
- `symbol`: Trading pair identifier
- `data`: Complete deduplicated `Data[]` array from `RESOLVE_PAGINATION_FN`
- `name`: Source name from `source.name` or `DEFAULT_SOURCE_NAME`
- `self`: The `ClientOptimizer` instance for accessing `params.template`

They must return `string | Promise<string>` containing the message content.

Sources: [src/client/ClientOptimizer.ts:115-145](), [src/client/ClientOptimizer.ts:148-184](), [src/interfaces/Optimizer.interface.ts:156-176]()

### Message List Structure

For each training range, the optimizer builds a `messageList` array by appending user/assistant pairs for each source:

```typescript
messageList: MessageModel[] = [
  { role: "user", content: "<formatted data from source 1>" },
  { role: "assistant", content: "<acknowledgment for source 1>" },
  { role: "user", content: "<formatted data from source 2>" },
  { role: "assistant", content: "<acknowledgment for source 2>" },
  // ... one pair per source
]
```

This conversation history provides the LLM with sequential context across multiple timeframes or data types before requesting a strategy recommendation.

Sources: [src/client/ClientOptimizer.ts:105](), [src/client/ClientOptimizer.ts:136-145](), [src/interfaces/Optimizer.interface.ts:100-123]()

## Multi-Timeframe Data Collection Example

### CCXT Dumper Integration

The demo implementation shows a real-world pattern for collecting multi-timeframe technical indicator data from a historical database service:

```mermaid
graph TB
    subgraph "Source Configuration"
        LongTerm["long-term-range<br/>1h candles, 48 periods"]
        SwingTerm["swing-term-range<br/>30m candles, 96 periods"]
        ShortTerm["short-term-range<br/>15m candles"]
        MicroTerm["micro-term-range<br/>1m candles, 60 periods"]
    end
    
    subgraph "CCXT Dumper REST API"
        LongAPI["/view/long-term-range"]
        SwingAPI["/view/swing-term-range"]
        ShortAPI["/view/short-term-range"]
        MicroAPI["/view/micro-term-range"]
    end
    
    subgraph "Formatted Data Tables"
        LongMD["1h Markdown Table<br/>RSI, MACD, ADX, ATR,<br/>Bollinger, Stochastic,<br/>EMA, SMA, Support/Resistance"]
        SwingMD["30m Markdown Table<br/>Similar indicators with<br/>30m-specific periods"]
        ShortMD["15m Markdown Table<br/>Faster indicator periods<br/>for short-term signals"]
        MicroMD["1m Markdown Table<br/>Ultra-fast indicators<br/>for scalping signals"]
    end
    
    subgraph "LLM Conversation"
        User1["User: 1h analysis with metadata"]
        Assist1["Assistant: Data acknowledged"]
        User2["User: 30m analysis with metadata"]
        Assist2["Assistant: Data acknowledged"]
        User3["User: 15m analysis with metadata"]
        Assist3["Assistant: Data acknowledged"]
        User4["User: 1m analysis with metadata"]
        Assist4["Assistant: Data acknowledged"]
    end
    
    LongTerm -->|"fetch()"| LongAPI
    SwingTerm -->|"fetch()"| SwingAPI
    ShortTerm -->|"fetch()"| ShortAPI
    MicroTerm -->|"fetch()"| MicroAPI
    
    LongAPI -->|"JSON rows"| LongMD
    SwingAPI -->|"JSON rows"| SwingMD
    ShortAPI -->|"JSON rows"| ShortMD
    MicroAPI -->|"JSON rows"| MicroMD
    
    LongMD -->|"user() formatter"| User1
    LongMD -->|"assistant() formatter"| Assist1
    SwingMD --> User2
    SwingMD --> Assist2
    ShortMD --> User3
    ShortMD --> Assist3
    MicroMD --> User4
    MicroMD --> Assist4
```

**Diagram: Multi-Timeframe Data Source Architecture**

Sources: [demo/optimization/src/index.mjs:66-324]()

### Source Configuration Pattern

Each timeframe source follows this structure:

| Component | Purpose |
|-----------|---------|
| `name` | Identifies the timeframe (e.g., "long-term-range") |
| `fetch()` | Constructs URL with query params, calls REST API |
| `user()` | Formats data as markdown table with indicator metadata |
| `assistant()` | Returns acknowledgment message |

The `user()` formatter typically includes:

1. **Markdown table**: Raw indicator values with timestamps
2. **Data sources section**: Explains each indicator's calculation period and units
3. **Context information**: Lookback periods, timeframe details

This provides the LLM with both numerical data and interpretive context.

Sources: [demo/optimization/src/index.mjs:66-127](), [demo/optimization/src/index.mjs:128-187](), [demo/optimization/src/index.mjs:188-245](), [demo/optimization/src/index.mjs:246-324]()

### Pagination Implementation

The demo sources use `fetchApi` from functools-kit with URL query parameters:

```javascript
const url = new URL(`${process.env.CCXT_DUMPER_URL}/view/long-term-range`);
url.searchParams.set("symbol", symbol);
url.searchParams.set("startDate", startDate.getTime());
url.searchParams.set("endDate", endDate.getTime());
url.searchParams.set("limit", limit || 1000);
url.searchParams.set("offset", offset || 0);
```

The CCXT Dumper service returns paginated results matching the limit/offset semantics expected by `RESOLVE_PAGINATION_FN`.

Sources: [demo/optimization/src/index.mjs:69-84]()

### Training Range Configuration

The demo defines 7 consecutive training days and 1 test day:

```javascript
const TRAIN_RANGE = [
  { note: "24 ноября 2025", startDate: ..., endDate: ... },
  { note: "25 ноября 2025", startDate: ..., endDate: ... },
  // ... 5 more days
];

const TEST_RANGE = {
  note: "1 декабря 2025",
  startDate: new Date("2025-12-01T00:00:00Z"),
  endDate: new Date("2025-12-01T23:59:59Z"),
};
```

For each training day, the optimizer collects all 4 timeframes, generating 7 separate strategy variants (one per day) that will later be compared via Walker on the test range.

Sources: [demo/optimization/src/index.mjs:19-61]()

## Callbacks and Lifecycle Hooks

### Available Callbacks

The optimizer schema supports three callbacks related to data collection:

| Callback | Trigger Point | Parameters |
|----------|---------------|------------|
| `onSourceData` | After each source fetch completes | `symbol, sourceName, data, startDate, endDate` |
| `onData` | After all training ranges complete | `symbol, strategyList` |
| `onCode` | After code generation (not collection phase) | `symbol, code` |
| `onDump` | After file write (not collection phase) | `symbol, filepath` |

The `onSourceData` callback executes during collection and receives the raw deduplicated data array for each source, enabling:
- Data validation
- Logging/debugging
- Custom persistence
- Analytics

Sources: [src/client/ClientOptimizer.ts:122-130](), [src/client/ClientOptimizer.ts:161-169](), [src/client/ClientOptimizer.ts:210-213](), [src/interfaces/Optimizer.interface.ts:191-236]()

### Integration with OptimizerConnectionService

The `OptimizerConnectionService` retrieves the schema, merges templates, and instantiates `ClientOptimizer`:

```mermaid
graph TB
    AddOpt["addOptimizer(schema)<br/>public API"]
    SchemaService["OptimizerSchemaService<br/>.register(optimizerName, schema)"]
    
    GetData["Optimizer.getData(symbol, {optimizerName})"]
    GlobalService["OptimizerGlobalService.getData()"]
    ConnService["OptimizerConnectionService<br/>.getOptimizer(optimizerName)"]
    
    GetSchema["schemaService.get(optimizerName)<br/>returns IOptimizerSchema"]
    
    TemplateService["OptimizerTemplateService<br/>default template methods"]
    
    MergeTemplate["Merge schema.template<br/>with TemplateService defaults<br/>→ IOptimizerTemplate"]
    
    ClientInst["new ClientOptimizer(<br/>IOptimizerParams,<br/>COMMIT_PROGRESS_FN<br/>)"]
    
    Memoized["Memoized by optimizerName<br/>(functools-kit memoize)"]
    
    GetDataMethod["clientOptimizer.getData(symbol)<br/>→ GET_STRATEGY_DATA_FN"]
    
    AddOpt --> SchemaService
    
    GetData --> GlobalService
    GlobalService --> ConnService
    
    ConnService --> GetSchema
    ConnService --> TemplateService
    
    GetSchema --> MergeTemplate
    TemplateService --> MergeTemplate
    
    MergeTemplate --> ClientInst
    ClientInst --> Memoized
    
    Memoized --> GetDataMethod
```

**Diagram: Service Layer Dependency Flow**

The `OptimizerConnectionService.getOptimizer()` method at [src/lib/services/connection/OptimizerConnectionService.ts:59-113]() is responsible for:

1. Calling `optimizerSchemaService.get(optimizerName)` to retrieve `IOptimizerSchema`
2. Extracting `schema.template` partial overrides (if provided)
3. Merging with default methods from `OptimizerTemplateService` to create complete `IOptimizerTemplate`
4. Constructing `ClientOptimizer` with `IOptimizerParams` (includes logger, merged template, callbacks)
5. Passing `COMMIT_PROGRESS_FN` callback for emitting progress events to `progressOptimizerEmitter`
6. Memoizing the instance by `optimizerName` for reuse

Sources: [src/lib/services/connection/OptimizerConnectionService.ts:59-113](), [src/client/ClientOptimizer.ts:397-401](), [src/lib/services/global/OptimizerGlobalService.ts:37-50]()

## Error Handling and Edge Cases

### Empty Data Handling

If a source returns an empty array (no data for the date range), the optimizer still formats and appends message pairs to `messageList`. The LLM receives empty data context, which it may interpret as "no trading activity" or "insufficient data."

### Missing Source Name

When using the simple function source type (`IOptimizerSourceFn` without configuration object), the name defaults to `DEFAULT_SOURCE_NAME = "unknown"` defined at [src/client/ClientOptimizer.ts:20](). This name appears in:
- Progress events (`ProgressOptimizerContract`)
- Callback parameters (`onSourceData`)
- Generated strategy metadata (`IOptimizerStrategy.name`)

The name extraction logic at [src/client/ClientOptimizer.ts:188-191]() handles both source types:

```typescript
const name = "name" in source
  ? source.name || DEFAULT_SOURCE_NAME
  : DEFAULT_SOURCE_NAME;
```

Sources: [src/client/ClientOptimizer.ts:20](), [src/client/ClientOptimizer.ts:188-191]()

### Duplicate ID Handling

The `distinctDocuments` function compares records by their `id` field. If multiple records share the same ID across different pages, only the first occurrence is kept. This prevents double-counting but requires that source IDs are stable and unique.

Sources: [src/client/ClientOptimizer.ts:86]()

### Async Formatter Execution

Both user and assistant formatters support async execution. The optimizer waits for both to resolve using `Promise.all()` before appending to `messageList`:

```typescript
const [userContent, assistantContent] = await Promise.all([
  user(symbol, data, name, self),
  assistant(symbol, data, name, self),
]);
```

This enables formatters to perform async operations like:
- API calls for additional context
- Database lookups
- File I/O for templates

Sources: [src/client/ClientOptimizer.ts:132-135](), [src/client/ClientOptimizer.ts:171-174]()

## Performance Considerations

### Sequential Source Processing

Sources are processed sequentially within each training range (not in parallel). This design choice:
- Simplifies progress tracking
- Preserves message ordering
- Reduces concurrent API load on external services
- Enables early error detection

### Memory Accumulation

The complete `messageList` for each training range is held in memory until `getPrompt()` is called. For large datasets or many sources, this can consume significant memory. Consider:
- Limiting data returned per source
- Using summary statistics instead of raw records
- Processing ranges incrementally

### Pagination Limit

The `ITERATION_LIMIT = 25` controls page size for pagination. Smaller values mean more API calls but less memory per request. Larger values reduce API overhead but require more memory per page.

Sources: [src/client/ClientOptimizer.ts:19]()

## Summary

The data collection pipeline transforms external data sources into structured LLM conversation context through these key operations:

1. **Source registration** via `IOptimizerSchema.source` array
2. **Pagination** via functools-kit utilities for large datasets
3. **Message formatting** with customizable user/assistant functions
4. **Training range iteration** to generate multiple strategy variants
5. **Progress tracking** with `ProgressOptimizerContract` events
6. **Callback hooks** for monitoring and validation

The collected data (represented as `IOptimizerStrategy[]`) serves as input to the LLM integration phase described in [LLM Integration](#16.5.3), where it is combined with system prompts to generate trading strategy recommendations.

Sources: [src/client/ClientOptimizer.ts:99-215](), [src/interfaces/Optimizer.interface.ts:100-123]()