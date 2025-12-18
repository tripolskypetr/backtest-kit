---
title: design/48_optimizer-system
group: design
---

# Optimizer System

## Purpose and Scope

The Optimizer System generates executable trading strategy code using Large Language Model (LLM) analysis of historical data. It collects data from configurable sources, builds conversation histories for LLM context, generates strategy logic via Ollama deepseek-v3.1:671b, and exports complete `.mjs` files with strategies, walker configurations, and test runners.

This document covers data source configuration, pagination handling, template customization, and code generation. For LLM prompt engineering details, see [LLM-Powered Strategy Generation](./46_advanced-features.md). For code template internals, see [Code Generation & Templates](./46_advanced-features.md).

---

## System Overview

The Optimizer System operates in three phases:

1. **Data Collection**: Fetches records from multiple sources with automatic pagination and deduplication
2. **Strategy Generation**: Builds LLM conversation history and generates strategy prompts via `getPrompt()`
3. **Code Export**: Assembles executable `.mjs` files using template methods

The system supports multiple training ranges, custom message formatters, and template overrides for complete customization.

**Key Components:**

| Component | Purpose |
|-----------|---------|
| `IOptimizerSchema` | User configuration with sources, ranges, and prompt generator |
| `ClientOptimizer` | Core implementation handling pagination and LLM conversation building |
| `OptimizerTemplateService` | Default templates for code generation (imports, helpers, strategies, walker) |
| `OptimizerConnectionService` | Memoized factory creating optimizer instances with merged templates |
| `OptimizerGlobalService` | Public entry point with validation |
| `Optimizer` class | Static API exposing `getData()`, `getCode()`, `dump()` |


---

## Architecture Diagram

![Mermaid Diagram](./diagrams\48_optimizer-system_0.svg)

**Architecture Notes:**

- **Memoization**: `OptimizerConnectionService.getOptimizer()` caches instances by `optimizerName` (`src/lib/services/connection/OptimizerConnectionService.ts:59-113`)
- **Template Merging**: Custom templates from schema override defaults from `OptimizerTemplateService` (`src/lib/services/connection/OptimizerConnectionService.ts:67-97`)
- **Validation**: `OptimizerValidationService` maintains a `Map<OptimizerName, IOptimizerSchema>` for existence checks (`src/lib/services/validation/OptimizerValidationService.ts:15-34`)
- **Schema Storage**: `OptimizerSchemaService` uses `ToolRegistry` for immutable schema management (`src/lib/services/schema/OptimizerSchemaService.ts:16-32`)


---

## Data Source Configuration

Data sources provide training data for strategy generation. Each source is queried with pagination and deduplication.

### Source Types

**Function Source:**
```typescript
type IOptimizerSourceFn<Data extends IOptimizerData> = 
  (args: IOptimizerFetchArgs) => Data[] | Promise<Data[]>;
```

**Object Source:**
```typescript
interface IOptimizerSource<Data extends IOptimizerData> {
  name: string;
  fetch: IOptimizerSourceFn<Data>;
  user?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
  assistant?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `fetch` | Function | Paginated query function receiving `{ symbol, startDate, endDate, limit, offset }` |
| `name` | String | Identifier used in callbacks and logging |
| `user` | Function | Custom formatter for user messages (optional, uses template default) |
| `assistant` | Function | Custom formatter for assistant messages (optional, uses template default) |

### Pagination and Deduplication

The system automatically handles pagination using `functools-kit` utilities:

```typescript
const ITERATION_LIMIT = 25; // Records per page

const iterator = iterateDocuments<Data>({
  limit: ITERATION_LIMIT,
  async createRequest({ limit, offset }) {
    return await fetch({ symbol, startDate, endDate, limit, offset });
  },
});
const distinct = distinctDocuments(iterator, (data) => data.id);
const allData = await resolveDocuments(distinct);
```

**Deduplication Key**: All data must implement `IOptimizerData` with unique `id: string | number` (`src/interfaces/Optimizer.interface.ts:38-44`).


---

## LLM Conversation Building

The optimizer builds conversation history by iterating through training ranges and sources. Each source contributes a user/assistant message pair.

### Conversation Flow

![Mermaid Diagram](./diagrams\48_optimizer-system_1.svg)

### Message Formatters

Default formatters delegate to template methods:

```typescript
const DEFAULT_USER_FN = async (symbol, data, name, self) => {
  return await self.params.template.getUserMessage(symbol, data, name);
};

const DEFAULT_ASSISTANT_FN = async (symbol, data, name, self) => {
  return await self.params.template.getAssistantMessage(symbol, data, name);
};
```

**Default Template Output** (`src/lib/services/template/OptimizerTemplateService.ts:77-110`):
- User: `"Прочитай данные и скажи ОК\n\n" + JSON.stringify(data)`
- Assistant: `"ОК"`


---

## Template System

Templates generate executable code sections. Each method returns a string of TypeScript/JavaScript code.

### Template Interface

| Method | Returns | Purpose |
|--------|---------|---------|
| `getTopBanner(symbol)` | Import statements, constants | Shebang, Ollama/CCXT imports, WARN_KB constant |
| `getUserMessage(symbol, data, name)` | Message content string | Default user message format for LLM |
| `getAssistantMessage(symbol, data, name)` | Message content string | Default assistant response format |
| `getWalkerTemplate(walkerName, exchangeName, frameName, strategies[])` | `addWalker()` call | Walker configuration for strategy comparison |
| `getStrategyTemplate(strategyName, interval, prompt)` | `addStrategy()` call | Strategy with LLM-integrated getSignal() |
| `getExchangeTemplate(symbol, exchangeName)` | `addExchange()` call | CCXT Binance integration |
| `getFrameTemplate(symbol, frameName, interval, startDate, endDate)` | `addFrame()` call | Timeframe configuration |
| `getLauncherTemplate(symbol, walkerName)` | `Walker.background()` call | Event listeners and execution |
| `getTextTemplate(symbol)` | `async text(messages)` function | LLM text generation helper |
| `getJsonTemplate(symbol)` | `async json(messages)` function | LLM structured output with signal schema |
| `getJsonDumpTemplate(symbol)` | `async dumpJson()` function | Debug output to ./dump/strategy/{resultId}/ |

### Strategy Template Example

The generated strategy uses multi-timeframe analysis:

```typescript
addStrategy({
    strategyName: "abc123_strategy-1",
    interval: "5m",
    getSignal: async (symbol) => {
        const messages = [];
        
        // Load candles from multiple timeframes
        const microTermCandles = await getCandles(symbol, "1m", 30);
        const mainTermCandles = await getCandles(symbol, "5m", 24);
        const shortTermCandles = await getCandles(symbol, "15m", 24);
        const mediumTermCandles = await getCandles(symbol, "1h", 24);
        
        // Build conversation with 4 timeframe analysis messages
        messages.push(
            { role: "user", content: "Проанализируй свечи 1h:\n..." },
            { role: "assistant", content: "Тренд 1h проанализирован" }
        );
        // ... (3 more timeframe pairs)
        
        // Final message with strategy prompt
        messages.push({
            role: "user",
            content: [
                "Проанализируй все таймфреймы и сгенерируй торговый сигнал...",
                "",
                `${strategy_prompt_from_getPrompt}`,
                "",
                "Если сигналы противоречивы или тренд слабый то position: wait"
            ].join("\n")
        });
        
        const result = await json(messages);
        result.id = uuid();
        return result;
    }
});
```


---

## Code Generation Pipeline

The `getCode()` method assembles all components into a single executable file.

![Mermaid Diagram](./diagrams\48_optimizer-system_2.svg)

### Generated File Structure

The output `.mjs` file contains:

1. **Shebang and Imports**: `#!/usr/bin/env node`, Ollama, CCXT, backtest-kit
2. **Helper Functions**: `dumpJson()`, `text()`, `json()`
3. **Exchange Configuration**: CCXT Binance with `fetchOHLCV()`
4. **Frame Configurations**: N training frames + 1 test frame
5. **Strategy Configurations**: One per `rangeTrain` entry
6. **Walker Configuration**: Compares all strategies on test frame
7. **Launcher Code**: `Walker.background()` with event listeners

**Naming Convention**:
- Prefix: Random 7-character string (e.g., `abc123`)
- Exchange: `{prefix}_exchange`
- Train frames: `{prefix}_train_frame-1`, `{prefix}_train_frame-2`, ...
- Test frame: `{prefix}_test_frame`
- Strategies: `{prefix}_strategy-1`, `{prefix}_strategy-2`, ...
- Walker: `{prefix}_walker`


---

## Public API Usage

### Registration

```typescript
import { addOptimizer } from "backtest-kit";

addOptimizer({
  optimizerName: "my-optimizer",
  rangeTrain: [
    { startDate: new Date("2024-01-01"), endDate: new Date("2024-01-31") },
    { startDate: new Date("2024-02-01"), endDate: new Date("2024-02-28") }
  ],
  rangeTest: { 
    startDate: new Date("2024-03-01"), 
    endDate: new Date("2024-03-31") 
  },
  source: [
    {
      name: "backtest-results",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        // Query database with pagination
        return await db.query(
          "SELECT * FROM results WHERE symbol = ? AND date >= ? AND date <= ? LIMIT ? OFFSET ?",
          [symbol, startDate, endDate, limit, offset]
        );
      },
      user: async (symbol, data, name) => {
        return `Analyze ${data.length} backtest results for ${symbol}:\n${JSON.stringify(data)}`;
      },
      assistant: async (symbol, data, name) => {
        return `Analyzed ${data.length} results. Key patterns identified.`;
      }
    }
  ],
  getPrompt: async (symbol, messages) => {
    // Call LLM to generate strategy description
    const ollama = new Ollama({ host: "https://ollama.com" });
    const response = await ollama.chat({
      model: "deepseek-v3.1:671b",
      messages
    });
    return response.message.content;
  }
});
```

### Execution

```typescript
import { Optimizer, listenOptimizerProgress } from "backtest-kit";

// Monitor progress
listenOptimizerProgress((event) => {
  console.log(`${(event.progress * 100).toFixed(2)}% - ${event.processedSources}/${event.totalSources} sources`);
});

// Generate strategy data
const strategies = await Optimizer.getData("BTCUSDT", {
  optimizerName: "my-optimizer"
});

// Generate code
const code = await Optimizer.getCode("BTCUSDT", {
  optimizerName: "my-optimizer"
});

// Save to file
await Optimizer.dump("BTCUSDT", {
  optimizerName: "my-optimizer"
}, "./output");
// Creates: ./output/my-optimizer_BTCUSDT.mjs
```


---

## Configuration Reference

### IOptimizerSchema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `optimizerName` | `string` | Yes | Unique identifier for this optimizer |
| `rangeTrain` | `IOptimizerRange[]` | Yes | Training time ranges (≥1 required) |
| `rangeTest` | `IOptimizerRange` | Yes | Testing time range for generated walker |
| `source` | `Source[]` | Yes | Data sources (≥1 required) |
| `getPrompt` | `Function` | Yes | Generates strategy prompt from conversation history |
| `template` | `Partial<IOptimizerTemplate>` | No | Custom template method overrides |
| `callbacks` | `Partial<IOptimizerCallbacks>` | No | Lifecycle event hooks |
| `note` | `string` | No | Documentation string |

### IOptimizerRange

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startDate` | `Date` | Yes | Start of time range (inclusive) |
| `endDate` | `Date` | Yes | End of time range (inclusive) |
| `note` | `string` | No | Description of this range |

### IOptimizerCallbacks

| Callback | Parameters | Trigger |
|----------|------------|---------|
| `onData` | `(symbol, strategyData[])` | After all strategies generated |
| `onCode` | `(symbol, code)` | After code generation complete |
| `onDump` | `(symbol, filepath)` | After file written to disk |
| `onSourceData` | `(symbol, sourceName, data[], startDate, endDate)` | After each source fetch |


---

## Progress Tracking

The optimizer emits `ProgressOptimizerContract` events during data collection:

```typescript
interface ProgressOptimizerContract {
  optimizerName: string;
  symbol: string;
  totalSources: number;       // rangeTrain.length × source.length
  processedSources: number;   // Counter incremented after each source
  progress: number;           // processedSources / totalSources (0.0 - 1.0)
}
```

**Emission Points**:
1. At start of each source processing (before `fetch()` call)
2. After all sources complete (progress = 1.0)

Events are emitted via `progressOptimizerEmitter` (`src/config/emitters.ts:80`) and accessible through `listenOptimizerProgress()` (`src/function/event.ts:514-557`).


---

## Service Layer Details

### OptimizerConnectionService

Creates memoized `ClientOptimizer` instances with merged templates:

```typescript
public getOptimizer = memoize(
  ([optimizerName]) => `${optimizerName}`,
  (optimizerName: OptimizerName) => {
    const schema = this.optimizerSchemaService.get(optimizerName);
    const rawTemplate = schema.template || {};
    
    // Merge custom template with defaults
    const template: IOptimizerTemplate = {
      getTopBanner: rawTemplate.getTopBanner || this.optimizerTemplateService.getTopBanner,
      getExchangeTemplate: rawTemplate.getExchangeTemplate || this.optimizerTemplateService.getExchangeTemplate,
      // ... (all 11 template methods)
    };
    
    return new ClientOptimizer({
      optimizerName,
      logger: this.loggerService,
      getPrompt: schema.getPrompt,
      rangeTrain: schema.rangeTrain,
      rangeTest: schema.rangeTest,
      source: schema.source,
      template,
      callbacks: schema.callbacks
    }, COMMIT_PROGRESS_FN);
  }
);
```

**Key Points**:
- One `ClientOptimizer` instance per `optimizerName`
- Template methods use custom implementation or default
- Progress emitted via `COMMIT_PROGRESS_FN` callback


### OptimizerValidationService

Maintains registry and validates optimizer existence:

```typescript
private _optimizerMap = new Map<OptimizerName, IOptimizerSchema>();

public addOptimizer = (optimizerName: OptimizerName, optimizerSchema: IOptimizerSchema): void => {
  if (this._optimizerMap.has(optimizerName)) {
    throw new Error(`optimizer ${optimizerName} already exist`);
  }
  this._optimizerMap.set(optimizerName, optimizerSchema);
};

public validate = memoize(
  ([optimizerName]) => optimizerName,
  (optimizerName: OptimizerName, source: string): void => {
    const optimizer = this._optimizerMap.get(optimizerName);
    if (!optimizer) {
      throw new Error(`optimizer ${optimizerName} not found source=${source}`);
    }
  }
);
```


### OptimizerSchemaService

Uses `ToolRegistry` for immutable schema storage:

```typescript
private _registry = new ToolRegistry<Record<OptimizerName, IOptimizerSchema>>("optimizerSchema");

public register = (key: OptimizerName, value: IOptimizerSchema) => {
  this.validateShallow(value); // Check required fields
  this._registry = this._registry.register(key, value);
};

private validateShallow = (optimizerSchema: IOptimizerSchema) => {
  if (typeof optimizerSchema.optimizerName !== "string") {
    throw new Error(`optimizer template validation failed: missing optimizerName`);
  }
  if (!Array.isArray(optimizerSchema.rangeTrain) || optimizerSchema.rangeTrain.length === 0) {
    throw new Error(`optimizer template validation failed: rangeTrain must be a non-empty array`);
  }
  if (!Array.isArray(optimizerSchema.source) || optimizerSchema.source.length === 0) {
    throw new Error(`optimizer template validation failed: source must be a non-empty array`);
  }
  if (typeof optimizerSchema.getPrompt !== "function") {
    throw new Error(`optimizer template validation failed: getPrompt must be a function`);
  }
};
```


---

## Error Handling

The system throws errors at multiple levels:

**Schema Validation** (throws immediately on `addOptimizer()`):
- Missing `optimizerName`
- Empty `rangeTrain` array
- Empty `source` array
- Missing `getPrompt` function

**Runtime Validation** (throws on API calls):
- Optimizer not found (`OptimizerValidationService.validate()`)
- Source fetch errors (propagated from `fetch()` function)
- LLM errors (propagated from `getPrompt()`)
- File write errors (propagated from `dump()`)

**Pagination Errors**:
- Invalid `limit` or `offset` (handled by `iterateDocuments`)
- Duplicate IDs ignored via `distinctDocuments`
