---
title: design/55_logger-configuration
group: design
---

# Logger Configuration

This page documents the logging system in Backtest Kit, covering the `ILogger` interface, the `setLogger` function, and how logging integrates with the framework's dependency injection system. For general configuration parameters, see [GLOBAL_CONFIG Parameters](./52_configuration-reference.md).

---

## Purpose and Scope

The logger configuration system provides centralized, structured logging throughout Backtest Kit. It allows developers to:

- Capture execution events from all framework components
- Route log output to custom destinations (files, monitoring services, databases)
- Filter logs by level (log, debug, info, warn)
- Maintain consistent log formatting across the codebase

The logger is implemented as a singleton service (`LoggerService`) injected throughout the framework via the dependency injection container. All internal operations use this service, ensuring uniform logging behavior.

---

## The ILogger Interface

The `ILogger` interface defines four logging methods corresponding to standard log levels:

```typescript
interface ILogger {
  log: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
}
```

Each method accepts variadic arguments, allowing flexible logging of primitives, objects, and error instances. The framework does not enforce a specific log format or structure—implementations can serialize arguments as needed.


---

## Setting Up Logging with setLogger

The `setLogger` function configures the global logger instance. It accepts an `ILogger` implementation and replaces the default logger (typically a no-op or console logger).

### Basic Console Logging

```typescript
import { setLogger } from 'backtest-kit';

setLogger({
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
});
```

This routes all framework logs to the console using native `console` methods.

### Custom Logger Implementation

```typescript
import fs from 'fs';
import { setLogger } from 'backtest-kit';

const logStream = fs.createWriteStream('./backtest.log', { flags: 'a' });

setLogger({
  log: (...args) => logStream.write(`[LOG] ${JSON.stringify(args)}\n`),
  debug: (...args) => logStream.write(`[DEBUG] ${JSON.stringify(args)}\n`),
  info: (...args) => logStream.write(`[INFO] ${JSON.stringify(args)}\n`),
  warn: (...args) => logStream.write(`[WARN] ${JSON.stringify(args)}\n`),
});
```

This example writes structured JSON logs to a file with log level prefixes.

### Integration with Third-Party Loggers

```typescript
import winston from 'winston';
import { setLogger } from 'backtest-kit';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'warn' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

setLogger({
  log: (...args) => logger.log('info', ...args),
  debug: (...args) => logger.debug(...args),
  info: (...args) => logger.info(...args),
  warn: (...args) => logger.warn(...args),
});
```

This routes framework logs to Winston, enabling features like log rotation, remote transports, and structured metadata.


---

## LoggerService Architecture

### Dependency Injection Integration

The logger is registered in the DI container as `LoggerService` and accessed via the `TYPES.loggerService` symbol. This ensures a single logger instance is shared across all services.

#### Logger Service Registration Diagram

![Mermaid Diagram](./diagrams\55_logger-configuration_0.svg)


### Logger Service Injection Pattern

All services access the logger through the `backtest` object exported from `src/lib/index.ts`:

```typescript
// Inside any service or function
backtest.loggerService.info(METHOD_NAME, { ...context });
```

This pattern ensures:
- Single source of truth for logger configuration
- Consistent access pattern across 11 service categories
- Easy mocking in tests


---

## Logging Usage Patterns

### Method Name Constants

The framework defines string constants for each logged method, enabling log filtering and tracing:

```typescript
const ADD_STRATEGY_METHOD_NAME = "add.addStrategy";
const ADD_EXCHANGE_METHOD_NAME = "add.addExchange";
const LIST_EXCHANGES_METHOD_NAME = "list.listExchanges";
```

These constants follow a `namespace.methodName` pattern, grouping related operations.


### Logging in Configuration Functions

#### addStrategy Example

```typescript
export function addStrategy(strategySchema: IStrategySchema) {
  backtest.loggerService.info(ADD_STRATEGY_METHOD_NAME, {
    strategySchema,
  });
  backtest.strategyValidationService.addStrategy(
    strategySchema.strategyName,
    strategySchema
  );
  backtest.strategySchemaService.register(
    strategySchema.strategyName,
    strategySchema
  );
}
```

**Log Output Structure:**
- **Method Name:** `"add.addStrategy"`
- **Level:** `info`
- **Payload:** Full `strategySchema` object with `strategyName`, `interval`, `getSignal`, callbacks, etc.


#### addExchange Example

```typescript
export function addExchange(exchangeSchema: IExchangeSchema) {
  backtest.loggerService.info(ADD_EXCHANGE_METHOD_NAME, {
    exchangeSchema,
  });
  backtest.exchangeValidationService.addExchange(
    exchangeSchema.exchangeName,
    exchangeSchema
  );
  backtest.exchangeSchemaService.register(
    exchangeSchema.exchangeName,
    exchangeSchema
  );
}
```

**Log Output Structure:**
- **Method Name:** `"add.addExchange"`
- **Level:** `info`
- **Payload:** Full `exchangeSchema` object with `exchangeName`, `getCandles`, `formatPrice`, callbacks, etc.


### Logging in List Functions

```typescript
export async function listExchanges(): Promise<IExchangeSchema[]> {
  backtest.loggerService.log(LIST_EXCHANGES_METHOD_NAME);
  return await backtest.exchangeValidationService.list();
}
```

**Log Output Structure:**
- **Method Name:** `"list.listExchanges"`
- **Level:** `log`
- **Payload:** None (informational only)


### Log Level Usage Patterns

| Level | Usage | Examples |
|-------|-------|----------|
| `log` | General execution trace | `listExchanges()`, `listStrategies()` |
| `debug` | Detailed internal state | (Not observed in provided code) |
| `info` | Configuration changes | `addStrategy()`, `addExchange()`, `addFrame()` |
| `warn` | Non-fatal issues | (Not observed in provided code) |


---

## Logging Flow Diagram

### Execution Path from User Code to Logger Output

![Mermaid Diagram](./diagrams\55_logger-configuration_1.svg)


---

## Logged Method Names Reference

The following table lists all method name constants defined in the configuration and list functions:

| Constant | Value | Function | Level | File |
|----------|-------|----------|-------|------|
| `ADD_STRATEGY_METHOD_NAME` | `"add.addStrategy"` | `addStrategy()` | info | `src/function/add.ts:10, 53` |
| `ADD_EXCHANGE_METHOD_NAME` | `"add.addExchange"` | `addExchange()` | info | `src/function/add.ts:11, 102` |
| `ADD_FRAME_METHOD_NAME` | `"add.addFrame"` | `addFrame()` | info | `src/function/add.ts:12, 146` |
| `ADD_WALKER_METHOD_NAME` | `"add.addWalker"` | `addWalker()` | info | `src/function/add.ts:13, 191` |
| `ADD_SIZING_METHOD_NAME` | `"add.addSizing"` | `addSizing()` | info | `src/function/add.ts:14, 257` |
| `ADD_RISK_METHOD_NAME` | `"add.addRisk"` | `addRisk()` | info | `src/function/add.ts:15, 332` |
| `ADD_OPTIMIZER_METHOD_NAME` | `"add.addOptimizer"` | `addOptimizer()` | info | `src/function/add.ts:16, 433` |
| `LIST_EXCHANGES_METHOD_NAME` | `"list.listExchanges"` | `listExchanges()` | log | `src/function/list.ts:10, 44` |
| `LIST_STRATEGIES_METHOD_NAME` | `"list.listStrategies"` | `listStrategies()` | log | `src/function/list.ts:11, 79` |
| `LIST_FRAMES_METHOD_NAME` | `"list.listFrames"` | `listFrames()` | log | `src/function/list.ts:12, 109` |
| `LIST_WALKERS_METHOD_NAME` | `"list.listWalkers"` | `listWalkers()` | log | `src/function/list.ts:13, 140` |
| `LIST_SIZINGS_METHOD_NAME` | `"list.listSizings"` | `listSizings()` | log | `src/function/list.ts:14, 180` |
| `LIST_RISKS_METHOD_NAME` | `"list.listRisks"` | `listRisks()` | log | `src/function/list.ts:15, 217` |
| `LIST_OPTIMIZERS_METHOD_NAME` | `"list.listOptimizers"` | `listOptimizers()` | log | `src/function/list.ts:16, 258` |


---

## Custom Logger Implementation Examples

### Silent Logger (Production)

```typescript
import { setLogger } from 'backtest-kit';

setLogger({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
});
```

Disables all logging output. Useful for production environments where logging overhead is undesirable.

### Conditional Logger (Debug Mode)

```typescript
import { setLogger } from 'backtest-kit';

const DEBUG = process.env.DEBUG === 'true';

setLogger({
  log: (...args) => DEBUG && console.log('[LOG]', ...args),
  debug: (...args) => DEBUG && console.debug('[DEBUG]', ...args),
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
});
```

Only logs `debug` and `log` entries when `DEBUG=true` environment variable is set. Always logs `info` and `warn`.

### Structured Logger with Timestamps

```typescript
import { setLogger } from 'backtest-kit';

const timestamp = () => new Date().toISOString();

setLogger({
  log: (...args) => console.log(`[${timestamp()}] [LOG]`, ...args),
  debug: (...args) => console.debug(`[${timestamp()}] [DEBUG]`, ...args),
  info: (...args) => console.info(`[${timestamp()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${timestamp()}] [WARN]`, ...args),
});
```

Prepends ISO 8601 timestamps to all log entries.

### Logger with Remote Monitoring

```typescript
import { setLogger } from 'backtest-kit';
import axios from 'axios';

const sendToMonitoring = async (level: string, data: any) => {
  try {
    await axios.post('https://monitoring.example.com/logs', {
      level,
      timestamp: Date.now(),
      data,
    });
  } catch (error) {
    console.error('Failed to send log to monitoring:', error);
  }
};

setLogger({
  log: (...args) => {
    console.log(...args);
    sendToMonitoring('log', args);
  },
  debug: (...args) => {
    console.debug(...args);
    sendToMonitoring('debug', args);
  },
  info: (...args) => {
    console.info(...args);
    sendToMonitoring('info', args);
  },
  warn: (...args) => {
    console.warn(...args);
    sendToMonitoring('warn', args);
  },
});
```

Dual-writes logs to console and a remote monitoring service.


---

## Logger Service in Backtest Object

The `backtest` object exported from `src/lib/index.ts` aggregates all services, including `loggerService`:

```typescript
export const backtest = {
  ...baseServices,        // Contains loggerService
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...coreServices,
  ...globalServices,
  ...commandServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
  ...templateServices,
};
```

The `baseServices` object contains the injected `LoggerService` instance:

```typescript
const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};
```

This makes the logger accessible to all internal services via `backtest.loggerService`.


---

## Best Practices

### When to Use Each Log Level

| Level | Purpose | Examples |
|-------|---------|----------|
| `log` | Trace function calls | List operations, queries |
| `debug` | Internal state inspection | Variable values, loop iterations |
| `info` | State changes | Configuration registration, mode switches |
| `warn` | Recoverable issues | Validation warnings, retries |

### Logging Sensitive Data

Avoid logging sensitive information in production:

```typescript
// Bad: Logs API keys
backtest.loggerService.info('exchange.connect', { apiKey, apiSecret });

// Good: Logs non-sensitive metadata
backtest.loggerService.info('exchange.connect', { exchangeName, userId });
```

### Structured Logging

Pass objects rather than concatenating strings:

```typescript
// Bad: String concatenation
backtest.loggerService.info(`Adding strategy: ${strategyName}`);

// Good: Structured object
backtest.loggerService.info(METHOD_NAME, { strategyName, interval });
```

Structured logs are easier to parse, filter, and index in log aggregation systems.

### Performance Considerations

Logger calls are synchronous and block execution. For high-frequency operations:

1. Use conditional logging (only log in debug mode)
2. Implement async loggers that queue writes
3. Disable logging entirely in production


---

## Integration with Other Systems

### Relationship to Context Services

While the logger does not appear to directly integrate with `ExecutionContextService` or `MethodContextService` in the provided code, custom logger implementations can access these services to enrich logs with contextual metadata (symbol, timestamp, strategy name).

For more on context propagation, see [Execution Contexts](./08_core-concepts.md).

### Relationship to Event System

The logger operates independently of the event system (`signalEmitter`, `errorEmitter`, etc.). Events are designed for **reactive** data flow, while logging is for **observability**. Custom loggers can subscribe to event emitters to log signal lifecycle events.

For more on events, see [Event System Architecture](./14_architecture-deep-dive.md).


---

## Summary

The logger configuration system in Backtest Kit provides:

1. **Flexible Output:** Route logs to console, files, or remote services via `setLogger()`
2. **Structured Logging:** Pass objects with context rather than concatenated strings
3. **Dependency Injection:** Single logger instance shared across all services via `LoggerService`
4. **Method Name Tracing:** Consistent `namespace.methodName` constants for filtering logs
5. **Custom Implementations:** Support for third-party loggers (Winston, Bunyan, etc.)

The logger is foundational to debugging and monitoring Backtest Kit applications, enabling visibility into framework operations without modifying internal code.