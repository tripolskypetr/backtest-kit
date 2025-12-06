# ClientOptimizer

## Purpose and Scope

`ClientOptimizer` is the core business logic class that implements AI-powered trading strategy generation through LLM integration. This class orchestrates data collection from multiple sources, builds conversation histories for language models, generates executable strategy code, and exports the results to files.

This document covers the internal implementation of the `ClientOptimizer` class, including its methods, helper functions, and data flow. For configuration of optimizer schemas, see [Optimizer Schemas](./30_Optimizer_Schemas.md). For higher-level concepts about AI optimization architecture and workflow, see [AI-Powered Strategy Optimization](./87_AI-Powered_Strategy_Optimization.md).

## Class Structure

`ClientOptimizer` implements the `IOptimizer` interface and provides three primary operations: data collection (`getData`), code generation (`getCode`), and file export (`dump`). The class is instantiated by `OptimizerConnectionService` with merged templates and injected dependencies.

### Class Definition

![Mermaid Diagram](./diagrams/37_ClientOptimizer_0.svg)


## Constructor and Parameters

The `ClientOptimizer` constructor accepts two arguments: `params` of type `IOptimizerParams` and an `onProgress` callback function for emitting progress events.

### IOptimizerParams Structure

| Field | Type | Description |
|-------|------|-------------|
| `optimizerName` | `OptimizerName` | Unique identifier for the optimizer |
| `logger` | `ILogger` | Logger instance injected by `OptimizerConnectionService` |
| `rangeTrain` | `IOptimizerRange[]` | Array of training time ranges |
| `rangeTest` | `IOptimizerRange` | Testing time range for validation |
| `source` | `Source[]` | Array of data sources (functions or configurations) |
| `getPrompt` | `Function` | Function to generate strategy prompt from messages |
| `template` | `IOptimizerTemplate` | Complete template with all code generation methods |
| `callbacks` | `Partial<IOptimizerCallbacks>` | Optional lifecycle callbacks |

The `params` object is constructed by `OptimizerConnectionService`, which merges custom templates from the optimizer schema with defaults from `OptimizerTemplateService`.


## Data Collection Flow

The `getData` method orchestrates the entire data collection and strategy generation pipeline. It processes each training range, fetches data from all sources, builds LLM conversation histories, and generates strategy prompts.

### getData Sequence Diagram

![Mermaid Diagram](./diagrams/37_ClientOptimizer_1.svg)


### Pagination Handling

The `RESOLVE_PAGINATION_FN` helper uses `functools-kit` utilities to handle paginated data sources automatically:

![Mermaid Diagram](./diagrams/37_ClientOptimizer_2.svg)

The pagination loop uses `ITERATION_LIMIT = 25` records per request. Data is deduplicated using the `id` field from `IOptimizerData`.


### Progress Event Emission

Progress events are emitted twice for each source: at the start of processing and after all sources complete (100%). The event structure follows `ProgressOptimizerContract`:

| Field | Type | Description |
|-------|------|-------------|
| `optimizerName` | `string` | Optimizer identifier |
| `symbol` | `string` | Trading pair symbol |
| `totalSources` | `number` | Total source count |
| `processedSources` | `number` | Completed sources |
| `progress` | `number` | Decimal 0-1 completion ratio |


## Code Generation Flow

The `getCode` method assembles a complete executable Node.js script by calling template methods in a specific order. The generated code includes all necessary imports, helper functions, component configurations, and launcher code.

### Code Assembly Pipeline

![Mermaid Diagram](./diagrams/37_ClientOptimizer_3.svg)


### Template Method Call Order

The code assembly follows this precise 11-step sequence:

1. **getTopBanner** - Shebang, imports, constants
2. **getJsonDumpTemplate** - Debug output function
3. **getTextTemplate** - LLM text generation helper
4. **getJsonTemplate** - LLM JSON generation helper
5. **getExchangeTemplate** - CCXT exchange configuration
6. **getFrameTemplate** (loop) - Training frame configurations
7. **getFrameTemplate** - Test frame configuration
8. **getStrategyTemplate** (loop) - Strategy configurations with LLM
9. **getWalkerTemplate** - Walker comparison setup
10. **getLauncherTemplate** - Execution and event listeners
11. **Join and return** - Concatenate all sections

Each section is separated by an empty line for readability.


### Naming Convention

All generated component names use a random prefix to avoid collisions:

![Mermaid Diagram](./diagrams/37_ClientOptimizer_4.svg)

The prefix is generated using: `(Math.random() + 1).toString(36).substring(7)`, producing strings like `"x8k2p9f"`.


## File Export

The `dump` method writes the generated code to a `.mjs` file in the specified directory, creating the directory if it doesn't exist.

### File Path Construction

| Component | Value | Example |
|-----------|-------|---------|
| Directory | `join(process.cwd(), path)` | `/home/user/project/strategies` |
| Filename | `{optimizerName}_{symbol}.mjs` | `optimizer1_BTCUSDT.mjs` |
| Full path | `join(dir, filename)` | `/home/user/project/strategies/optimizer1_BTCUSDT.mjs` |

### Dump Flow

![Mermaid Diagram](./diagrams/37_ClientOptimizer_5.svg)


## Helper Functions

`ClientOptimizer` uses four internal helper functions that are not class methods but operate on a `ClientOptimizer` instance passed as the `self` parameter.

### Helper Function Reference

| Function | Purpose | Key Operations |
|----------|---------|----------------|
| `DEFAULT_USER_FN` | Format user messages | Delegates to `template.getUserMessage` |
| `DEFAULT_ASSISTANT_FN` | Format assistant messages | Delegates to `template.getAssistantMessage` |
| `RESOLVE_PAGINATION_FN` | Handle paginated data | Uses `iterateDocuments`, `distinctDocuments`, `resolveDocuments` |
| `GET_STRATEGY_DATA_FN` | Collect data and generate strategies | Orchestrates entire data pipeline |
| `GET_STRATEGY_CODE_FN` | Assemble executable code | Calls all 11 template methods in sequence |
| `GET_STRATEGY_DUMP_FN` | Write code to file | Uses `fs/promises` for file operations |

### Message Formatter Pattern

The user and assistant formatters allow customization per source while providing sensible defaults:

![Mermaid Diagram](./diagrams/37_ClientOptimizer_6.svg)


## Integration with Services

`ClientOptimizer` is never instantiated directly by users. Instead, `OptimizerConnectionService` creates and caches instances, handling dependency injection and template merging.

### Service Integration Architecture

![Mermaid Diagram](./diagrams/37_ClientOptimizer_7.svg)


### Template Merging Logic

`OptimizerConnectionService.getOptimizer` merges custom templates from the schema with defaults:

![Mermaid Diagram](./diagrams/37_ClientOptimizer_8.svg)

All 11 template methods are resolved using this pattern, ensuring `ClientOptimizer` always receives a complete `IOptimizerTemplate` implementation.


### Memoization

The `getOptimizer` method is memoized by `optimizerName`, creating only one `ClientOptimizer` instance per registered optimizer. This ensures template merging and dependency injection occur only once per optimizer configuration.


## Data Structures

### IOptimizerStrategy

The `getData` method returns an array of `IOptimizerStrategy` objects, one per training range:

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | `string` | Trading pair symbol |
| `name` | `string` | Source name from configuration |
| `messages` | `MessageModel[]` | Complete conversation history |
| `strategy` | `string` | Generated strategy prompt from `getPrompt()` |


### Source Type Union

The `source` array accepts two types:

1. **IOptimizerSourceFn** - Simple fetch function: `(args: IOptimizerFetchArgs) => Data[]`
2. **IOptimizerSource** - Full configuration with custom formatters:
   - `name: string` - Source identifier
   - `fetch: IOptimizerSourceFn` - Data fetch function
   - `user?: Function` - Custom user message formatter
   - `assistant?: Function` - Custom assistant message formatter

When using a plain function, the source name defaults to `"unknown"`.


### MessageModel

Conversation history uses `MessageModel` from the shared model layer:

| Field | Type | Values |
|-------|------|--------|
| `role` | `string` | `"user"`, `"assistant"`, `"system"` |
| `content` | `string` | Message text content |


## Error Handling

The `dump` method includes try-catch error handling:

![Mermaid Diagram](./diagrams/37_ClientOptimizer_9.svg)

Errors during file operations are logged and re-thrown to the caller.
