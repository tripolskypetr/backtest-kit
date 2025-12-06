---
title: design/79_logging_system
group: design
---

# Logging System

The logging system provides consistent, context-aware logging throughout the backtest-kit framework. It automatically enriches log messages with execution context (symbol, timestamp, mode) and method context (strategy name, exchange name, frame name) without requiring explicit parameter passing. The system uses a pluggable architecture that defaults to silent operation and allows users to configure custom logger implementations.

For information about the broader dependency injection architecture, see [Dependency Injection System](./07_Signal_Lifecycle_Overview.md). For context propagation mechanisms, see [Context Propagation](./08_Component_Registration.md).

## Architecture Overview

The logging system consists of three primary components: the `ILogger` interface defining the contract, the `LoggerService` implementation providing context-aware logging, and the context services that supply metadata automatically.

### Component Architecture

![Mermaid Diagram](./diagrams/79_Logging_System_0.svg)


## ILogger Interface

The `ILogger` interface defines the contract for all logger implementations. It provides four severity levels with consistent method signatures.

| Method | Severity | Purpose |
|--------|----------|---------|
| `log()` | General | Record significant events or state changes |
| `debug()` | Debug | Detailed diagnostic information for troubleshooting |
| `info()` | Info | Informational updates about system activity |
| `warn()` | Warning | Potentially problematic situations requiring attention |

### Method Signature

All methods follow the same signature pattern:

```
method(topic: string, ...args: any[]): void
```

- **topic**: Log category or subject
- **args**: Variable number of additional arguments to log

The interface is intentionally simple, allowing any logging library (Winston, Pino, Bunyan, console) to be adapted with minimal wrapper code.


## LoggerService Implementation

`LoggerService` is the core logging implementation that wraps user-provided loggers and automatically enriches messages with context metadata.

### Key Responsibilities

| Responsibility | Implementation |
|---------------|----------------|
| Logger Delegation | Forwards all calls to user-configured logger via `_commonLogger` |
| Context Injection | Automatically appends `methodContext` and `executionContext` to every log call |
| Default Behavior | Uses `NOOP_LOGGER` when no custom logger configured |
| DI Integration | Injects `MethodContextService` and `ExecutionContextService` |

### Internal Structure

![Mermaid Diagram](./diagrams/79_Logging_System_1.svg)


### NOOP_LOGGER Default

The framework defaults to `NOOP_LOGGER`, a silent logger that discards all messages. This design ensures the framework operates without logging overhead unless explicitly configured.

```typescript
// Implementation discards all messages
const NOOP_LOGGER: ILogger = {
  log() { void 0; },
  debug() { void 0; },
  info() { void 0; },
  warn() { void 0; },
};
```


## Automatic Context Enrichment

`LoggerService` automatically appends context metadata to every log call without requiring explicit parameter passing. This is the system's most important feature.

### Context Enrichment Flow

![Mermaid Diagram](./diagrams/79_Logging_System_2.svg)


### Method Context

Method context provides information about which strategy, exchange, and frame are currently executing. Retrieved from `MethodContextService` using scoped DI.

| Property | Type | Description |
|----------|------|-------------|
| `strategyName` | string | Name of the active strategy |
| `exchangeName` | string | Name of the active exchange |
| `frameName` | string | Name of the active timeframe generator |

Context availability is checked via `MethodContextService.hasContext()` before retrieval. If no context exists, an empty object is appended.


### Execution Context

Execution context provides information about the current execution state, including trading pair, timestamp, and mode. Retrieved from `ExecutionContextService` using scoped DI.

| Property | Type | Description |
|----------|------|-------------|
| `symbol` | string | Trading pair (e.g., "BTCUSDT") |
| `when` | number | Current timestamp in milliseconds |
| `backtest` | boolean | True if backtesting, false if live trading |

Context availability is checked via `ExecutionContextService.hasContext()` before retrieval. If no context exists, an empty object is appended.


## Configuration

### Setting a Custom Logger

Users configure custom loggers by calling `setLogger()` on the `LoggerService` instance. This replaces the default `NOOP_LOGGER`.

```typescript
import backtest from 'backtest-kit';

// Configure custom logger
backtest.loggerService.setLogger({
  log: (topic, ...args) => console.log(`[LOG] ${topic}`, ...args),
  debug: (topic, ...args) => console.debug(`[DEBUG] ${topic}`, ...args),
  info: (topic, ...args) => console.info(`[INFO] ${topic}`, ...args),
  warn: (topic, ...args) => console.warn(`[WARN] ${topic}`, ...args),
});
```


### Integration with Third-Party Loggers

The `ILogger` interface can wrap any logging library. Example with Winston:

```typescript
import winston from 'winston';
import backtest from 'backtest-kit';

const winstonLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

backtest.loggerService.setLogger({
  log: (topic, ...args) => winstonLogger.log('info', topic, ...args),
  debug: (topic, ...args) => winstonLogger.debug(topic, ...args),
  info: (topic, ...args) => winstonLogger.info(topic, ...args),
  warn: (topic, ...args) => winstonLogger.warn(topic, ...args),
});
```

## Dependency Injection Integration

`LoggerService` is registered in the DI container and injected into services throughout the framework.

### Registration Flow

![Mermaid Diagram](./diagrams/79_Logging_System_3.svg)


### Service Registration

The logger is registered as a singleton in the DI container during framework initialization:

- **Symbol Definition**: `TYPES.loggerService` in [src/lib/core/types.ts:2]()
- **Factory Registration**: `provide(TYPES.loggerService, () => new LoggerService())` in [src/lib/core/provide.ts:25]()
- **Public Export**: `backtest.loggerService` in [src/lib/index.ts:30]()

### Injection Pattern

Services throughout the framework inject `LoggerService` using the standard DI pattern:

```typescript
private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
```

This pattern appears in:
- Logic services (BacktestLogicPrivateService, LiveLogicPrivateService)
- Global services (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
- Connection services (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
- Schema services (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)


## Usage Patterns

### Basic Logging

Services log using the injected `LoggerService` instance. Context is automatically appended:

```typescript
// In BacktestLogicPrivateService
await this.loggerService.info(
  'backtest-start',
  { symbol, totalTimeframes: timeframes.length }
);
```

The resulting log output includes automatic context:
```
topic: "backtest-start"
args: [
  { symbol: "BTCUSDT", totalTimeframes: 1000 },
  { strategyName: "momentum", exchangeName: "binance", frameName: "daily" },
  { symbol: "BTCUSDT", when: 1704067200000, backtest: true }
]
```

### Method Name Constants

The framework follows a consistent pattern of defining string constants for method names used in logging. This provides structured, searchable log topics throughout the codebase.

#### Constant Naming Convention

Method name constants follow the pattern: `[MODULE]_[ENTITY]_METHOD_NAME`

Examples from the registration API:

| Constant | Value | Usage Context |
|----------|-------|---------------|
| `ADD_STRATEGY_METHOD_NAME` | `"add.addStrategy"` | Strategy registration in `addStrategy()` |
| `ADD_EXCHANGE_METHOD_NAME` | `"add.addExchange"` | Exchange registration in `addExchange()` |
| `ADD_FRAME_METHOD_NAME` | `"add.addFrame"` | Frame registration in `addFrame()` |
| `ADD_WALKER_METHOD_NAME` | `"add.addWalker"` | Walker registration in `addWalker()` |
| `ADD_SIZING_METHOD_NAME` | `"add.addSizing"` | Sizing registration in `addSizing()` |
| `ADD_RISK_METHOD_NAME` | `"add.addRisk"` | Risk registration in `addRisk()` |
| `ADD_OPTIMIZER_METHOD_NAME` | `"add.addOptimizer"` | Optimizer registration in `addOptimizer()` |


#### Usage Pattern

The constants are used as the `topic` parameter in logging calls:

```typescript
const ADD_STRATEGY_METHOD_NAME = "add.addStrategy";

export function addStrategy(strategySchema: IStrategySchema) {
  backtest.loggerService.info(ADD_STRATEGY_METHOD_NAME, {
    strategySchema,
  });
  // ... validation and registration logic
}
```

This pattern provides several benefits:

1. **Searchability**: Log messages can be traced back to source code by searching for the constant value
2. **Consistency**: All invocations of the same method produce identical topic strings
3. **Type Safety**: Constants prevent typos in log topic strings
4. **Documentation**: Constant names serve as inline documentation of the logging structure


### Log Levels

Different severity levels serve different purposes:

| Level | Use Case | Example |
|-------|----------|---------|
| `log()` | General events | Signal state changes, execution milestones |
| `debug()` | Diagnostic details | Validation results, intermediate calculations |
| `info()` | Operational updates | Successful completions, configuration changes |
| `warn()` | Potential issues | Missing data, unexpected conditions |

Note: The framework does not provide a dedicated `error()` method. Error conditions are typically logged using `warn()` and then propagated through error emitters or thrown as exceptions.

### Async Logging

All `LoggerService` methods return `Promise<void>`, allowing asynchronous logger implementations:

```typescript
// Logger can perform async operations
public log = async (topic: string, ...args: any[]) => {
  await this._commonLogger.log(
    topic,
    ...args,
    this.methodContext,
    this.executionContext
  );
};
```

This design supports remote logging services, database writes, or file I/O without blocking execution.


## Service Integration Matrix

The following table shows which framework services inject `LoggerService`:

| Service Layer | Services Using Logger |
|---------------|----------------------|
| Logic Services | BacktestLogicPrivateService, BacktestLogicPublicService, LiveLogicPrivateService, LiveLogicPublicService |
| Global Services | StrategyGlobalService, ExchangeGlobalService, FrameGlobalService, LiveGlobalService, BacktestGlobalService |
| Connection Services | StrategyConnectionService, ExchangeConnectionService, FrameConnectionService |
| Schema Services | StrategySchemaService, ExchangeSchemaService, FrameSchemaService |
| Markdown Services | BacktestMarkdownService, LiveMarkdownService |

This pervasive integration ensures consistent logging behavior across all framework components.
