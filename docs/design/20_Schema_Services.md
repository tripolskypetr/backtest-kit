# Schema Services

Schema Services implement the registry pattern for storing configuration schemas in the backtest-kit framework. These services act as in-memory storage for strategy, exchange, and frame configurations registered at application startup via `addStrategy()`, `addExchange()`, and `addFrame()` functions. They provide lookup capabilities for Connection Services (see [5.1](19_Connection_Services.md)) which create runtime instances based on registered schemas.

For information about how registered schemas are instantiated into client objects, see [Connection Services](19_Connection_Services.md). For details on schema interfaces and registration functions, see [Configuration Functions](09_Configuration_Functions.md).

---

## Overview

The framework provides three schema services, each managing a specific domain's configuration registry:

| Service | Purpose | Schema Interface | Registration Function | Storage Key |
|---------|---------|------------------|----------------------|-------------|
| `StrategySchemaService` | Stores strategy configurations | `IStrategySchema` | `addStrategy()` | `strategyName` |
| `ExchangeSchemaService` | Stores exchange configurations | `IExchangeSchema` | `addExchange()` | `exchangeName` |
| `FrameSchemaService` | Stores frame configurations | `IFrameSchema` | `addFrame()` | `frameName` |

All schema services follow identical patterns: singleton registration, Map-based storage, and name-based lookup. They are instantiated once during framework initialization and shared across all execution contexts.


---

## Schema Service Architecture

The following diagram illustrates the relationship between registration functions, schema services, and connection services:

![Mermaid Diagram](./diagrams/20_Schema_Services_0.svg)

**Diagram: Schema Service Registry Pattern**

This architecture separates registration (startup time) from instantiation (runtime). Users register schemas once during application initialization. Connection Services query these registries on-demand to create memoized client instances.


---

## StrategySchemaService

`StrategySchemaService` manages the registry of strategy configurations. Each strategy is identified by a unique `strategyName` and contains signal generation logic and lifecycle callbacks.

### Storage Structure

The service uses a `Map<StrategyName, IStrategySchema>` to store registered strategies. The map key is the strategy name, and the value is the complete schema object.

### IStrategySchema Interface

The strategy schema interface defines:

```typescript
interface IStrategySchema {
    strategyName: StrategyName;           // Unique identifier
    interval: SignalInterval;             // Throttling interval (1m, 5m, 1h, etc.)
    getSignal: (symbol: string) => Promise<ISignalDto | null>;  // Signal generator
    callbacks?: Partial<IStrategyCallbacks>;  // Optional lifecycle hooks
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `strategyName` | `string` | Unique identifier used for registry lookup and routing |
| `interval` | `SignalInterval` | Minimum time between `getSignal()` calls for throttling |
| `getSignal` | `async function` | Signal generation logic, returns `null` or validated `ISignalDto` |
| `callbacks` | `object` (optional) | Lifecycle hooks: `onTick`, `onOpen`, `onActive`, `onIdle`, `onClose` |

### Registration via addStrategy()

The `addStrategy()` function registers a strategy schema into `StrategySchemaService`:

![Mermaid Diagram](./diagrams/20_Schema_Services_1.svg)

**Diagram: Strategy Schema Registration Flow**

The registration process validates that `strategyName` is unique and stores the schema for later retrieval by `StrategyConnectionService`.


---

## ExchangeSchemaService

`ExchangeSchemaService` manages the registry of exchange data sources. Each exchange provides candle data fetching, price formatting, and quantity formatting logic.

### Storage Structure

The service uses a `Map<ExchangeName, IExchangeSchema>` to store registered exchanges. The map key is the exchange name, and the value is the complete schema object.

### IExchangeSchema Interface

The exchange schema interface defines:

```typescript
interface IExchangeSchema {
    exchangeName: ExchangeName;  // Unique identifier
    getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) 
        => Promise<ICandleData[]>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    callbacks?: Partial<IExchangeCallbacks>;  // Optional onCandleData hook
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `exchangeName` | `string` | Unique identifier used for registry lookup and routing |
| `getCandles` | `async function` | Fetches historical OHLCV candle data from exchange/database |
| `formatQuantity` | `async function` | Formats quantity values to exchange precision rules |
| `formatPrice` | `async function` | Formats price values to exchange precision rules |
| `callbacks` | `object` (optional) | Lifecycle hooks: `onCandleData` for logging/monitoring |

### Registration via addExchange()

The `addExchange()` function registers an exchange schema into `ExchangeSchemaService`:

![Mermaid Diagram](./diagrams/20_Schema_Services_2.svg)

**Diagram: Exchange Schema Registration Flow**

The registration process validates that `exchangeName` is unique and stores the schema for later retrieval by `ExchangeConnectionService`.


---

## FrameSchemaService

`FrameSchemaService` manages the registry of timeframe configurations for backtesting. Each frame defines the start date, end date, and interval for timestamp generation.

### Storage Structure

The service uses a `Map<FrameName, IFrameSchema>` to store registered frames. The map key is the frame name, and the value is the complete schema object.

### IFrameSchema Interface

The frame schema interface defines:

```typescript
interface IFrameSchema {
    frameName: FrameName;       // Unique identifier
    interval: FrameInterval;    // Timestamp interval (1m, 1h, 1d, etc.)
    startDate: Date;            // Backtest period start (inclusive)
    endDate: Date;              // Backtest period end (inclusive)
    callbacks?: Partial<IFrameCallbacks>;  // Optional onTimeframe hook
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `frameName` | `string` | Unique identifier used for registry lookup and routing |
| `interval` | `FrameInterval` | Time spacing between generated timestamps |
| `startDate` | `Date` | Beginning of backtest period (inclusive boundary) |
| `endDate` | `Date` | End of backtest period (inclusive boundary) |
| `callbacks` | `object` (optional) | Lifecycle hooks: `onTimeframe` called after generation |

### Registration via addFrame()

The `addFrame()` function registers a frame schema into `FrameSchemaService`:

![Mermaid Diagram](./diagrams/20_Schema_Services_3.svg)

**Diagram: Frame Schema Registration Flow**

The registration process validates that `frameName` is unique and stores the schema for later retrieval by `FrameConnectionService`.


---

## Schema Lookup and Retrieval

Schema Services provide lookup methods that Connection Services call to retrieve registered configurations. The lookup pattern is identical across all three services.

### Lookup Pattern

![Mermaid Diagram](./diagrams/20_Schema_Services_4.svg)

**Diagram: Schema Lookup Flow**

The `MethodContextService` (see [2.3](07_Context_Propagation.md)) provides the schema name as a routing key. Connection Services query Schema Services by name, retrieve the schema, and pass it to client constructors for instantiation.

### Common Schema Service Methods

All schema services implement these methods:

| Method | Parameters | Return Type | Purpose |
|--------|------------|-------------|---------|
| `addSchema()` | `schema: ISchema` | `void` | Registers a new schema in the internal Map |
| `getSchema()` | `name: string` | `ISchema` | Retrieves a registered schema by name |
| `hasSchema()` | `name: string` | `boolean` | Checks if a schema name is registered |
| `getAllSchemas()` | none | `ISchema[]` | Returns all registered schemas (used for introspection) |

**Error Handling:** If `getSchema()` is called with an unregistered name, it throws an error indicating the missing configuration. This fail-fast behavior ensures configuration errors are detected early in the application lifecycle.


---

## Integration with Dependency Injection

Schema Services are registered in the DI container as singletons, ensuring a single registry instance is shared across the entire application.

### Service Registration

The `provide.ts` file registers schema services in the DI container:

```typescript
// src/lib/core/provide.ts
provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
provide(TYPES.strategySchemaService, () => new StrategySchemaService());
provide(TYPES.frameSchemaService, () => new FrameSchemaService());
```

Each factory function creates a new service instance. The DI container (`di-kit`) ensures these factories are called only once, implementing the singleton pattern.

### Symbol Definitions

The `types.ts` file defines unique symbols for each schema service:

```typescript
// src/lib/core/types.ts
const schemaServices = {
    exchangeSchemaService: Symbol('exchangeSchemaService'),
    strategySchemaService: Symbol('strategySchemaService'),
    frameSchemaService: Symbol('frameSchemaService'),
}
```

These symbols serve as keys in the DI container, preventing naming collisions and enabling type-safe injection.

### Service Injection

The `index.ts` file injects schema services into the `backtest` aggregator object:

```typescript
// src/lib/index.ts
const schemaServices = {
  exchangeSchemaService: inject<ExchangeSchemaService>(TYPES.exchangeSchemaService),
  strategySchemaService: inject<StrategySchemaService>(TYPES.strategySchemaService),
  frameSchemaService: inject<FrameSchemaService>(TYPES.frameSchemaService),
};

export const backtest = {
  ...schemaServices,
  // ... other services
};
```

This makes schema services accessible via `backtest.strategySchemaService`, `backtest.exchangeSchemaService`, and `backtest.frameSchemaService` for advanced use cases requiring direct registry access.


---

## Complete Registration and Instantiation Flow

The following diagram shows the complete lifecycle from user registration to client instantiation:

![Mermaid Diagram](./diagrams/20_Schema_Services_5.svg)

**Diagram: Complete Schema Registration and Instantiation Flow**

The registration phase occurs at application startup, storing schemas in the registry. The instantiation phase occurs at runtime when Logic Services require client instances. Connection Services query Schema Services, create clients, and memoize them for reuse.


---

## Design Rationale

### Registry Pattern Benefits

The registry pattern provides several architectural advantages:

1. **Separation of Configuration and Execution**: Schemas are registered at startup, instances created on-demand at runtime
2. **Multiple Configurations**: Multiple strategies/exchanges/frames can coexist without conflicts
3. **Dynamic Routing**: `MethodContextService` provides routing keys to select the correct schema at runtime
4. **Testability**: Services can be instantiated with mock schemas for unit testing
5. **Hot-Swapping**: New schemas can be registered without restarting (though not currently exposed)

### Singleton Registry Instances

Schema Services are singletons because:

1. **Global State**: Configuration registries must be shared across all execution contexts
2. **Performance**: Single Map instance avoids redundant storage overhead
3. **Consistency**: All Connection Services see the same registered schemas
4. **Thread Safety**: JavaScript's single-threaded model ensures no race conditions

### Map Data Structure

The `Map<string, ISchema>` data structure is chosen because:

1. **O(1) Lookup**: Fast retrieval by name during runtime execution
2. **Key Type Safety**: String keys match schema name types
3. **Iteration Support**: `getAllSchemas()` can iterate over values
4. **Uniqueness Guarantee**: Map keys enforce unique schema names


---

## Usage Patterns

### Basic Schema Registration

Register schemas during application initialization before calling `Backtest.run()` or `Live.run()`:

```typescript
// Register exchange data source
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    // Fetch from API or database
    return candleData;
  },
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});

// Register strategy
addStrategy({
  strategyName: "momentum",
  interval: "5m",
  getSignal: async (symbol) => {
    // Signal generation logic
    return signalDto;
  },
});

// Register backtest frame
addFrame({
  frameName: "jan-2024",
  interval: "1m",
  startDate: new Date("2024-01-01"),
  endDate: new Date("2024-01-31"),
});
```

### Multi-Strategy Pattern

Register multiple strategies to run different logic on the same data:

```typescript
addStrategy({
  strategyName: "momentum-long",
  interval: "5m",
  getSignal: async (symbol) => {
    // Long-only momentum logic
  },
});

addStrategy({
  strategyName: "momentum-short",
  interval: "5m",
  getSignal: async (symbol) => {
    // Short-only momentum logic
  },
});

// Run both strategies in parallel
for await (const result of Backtest.run("BTCUSDT", {
  strategy: "momentum-long",
  exchange: "binance",
  frame: "jan-2024",
})) {
  // Process momentum-long results
}

for await (const result of Backtest.run("BTCUSDT", {
  strategy: "momentum-short",
  exchange: "binance",
  frame: "jan-2024",
})) {
  // Process momentum-short results
}
```

### Multi-Exchange Pattern

Register multiple exchanges for different data sources:

```typescript
addExchange({
  exchangeName: "binance",
  getCandles: async (...) => fetchFromBinance(...),
  // ...
});

addExchange({
  exchangeName: "coinbase",
  getCandles: async (...) => fetchFromCoinbase(...),
  // ...
});

// Compare strategy performance across exchanges
for await (const result of Backtest.run("BTCUSDT", {
  strategy: "momentum",
  exchange: "binance",
  frame: "jan-2024",
})) {
  // Binance results
}

for await (const result of Backtest.run("BTCUSDT", {
  strategy: "momentum",
  exchange: "coinbase",
  frame: "jan-2024",
})) {
  // Coinbase results
}
```


---

## Error Handling

Schema Services implement validation to prevent common configuration errors:

### Duplicate Name Detection

Attempting to register a schema with an existing name throws an error:

```typescript
addStrategy({
  strategyName: "momentum",
  // ...
});

// Error: Strategy "momentum" already registered
addStrategy({
  strategyName: "momentum",  // Duplicate name
  // ...
});
```

### Missing Schema Detection

Attempting to instantiate a client with an unregistered schema name throws an error:

```typescript
// No strategy registered with name "nonexistent"
for await (const result of Backtest.run("BTCUSDT", {
  strategy: "nonexistent",  // Error thrown here
  exchange: "binance",
  frame: "jan-2024",
})) {
  // ...
}
```

### Schema Validation

Each schema service validates required fields during registration:

- `StrategySchemaService`: Validates `strategyName`, `interval`, `getSignal` are present
- `ExchangeSchemaService`: Validates `exchangeName`, `getCandles`, `formatPrice`, `formatQuantity` are present
- `FrameSchemaService`: Validates `frameName`, `interval`, `startDate`, `endDate` are present and dates are valid


---

## Relationship with Other Services

Schema Services interact with multiple layers of the architecture:

| Service Layer | Relationship | Direction |
|---------------|-------------|-----------|
| **Connection Services** | Consumers of schema registries | Connection Services query Schema Services |
| **Public API Functions** | Producers to schema registries | `add*()` functions register schemas |
| **Logic Services** | Indirect consumers via Connection layer | Logic Services use Connection Services, which query Schema Services |
| **Global Services** | Indirect consumers via Connection layer | Global Services use Connection Services, which query Schema Services |

Schema Services have no dependencies on other services—they are pure registries with no outbound calls to other components. This makes them the foundational layer of the service architecture.

For more information:
- Connection Services usage: [Connection Services](19_Connection_Services.md)
- Registration API details: [Configuration Functions](09_Configuration_Functions.md)
- Runtime orchestration: [Logic Services](22_Logic_Services.md)

