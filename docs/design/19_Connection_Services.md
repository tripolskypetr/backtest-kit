# Connection Services

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/interfaces/Exchange.interface.ts](src/interfaces/Exchange.interface.ts)
- [src/lib/services/connection/ExchangeConnectionService.ts](src/lib/services/connection/ExchangeConnectionService.ts)
- [src/lib/services/connection/FrameConnectionService.ts](src/lib/services/connection/FrameConnectionService.ts)
- [src/lib/services/connection/StrategyConnectionService.ts](src/lib/services/connection/StrategyConnectionService.ts)

</details>



## Purpose and Scope

Connection Services form the routing layer within the Service Orchestration architecture, responsible for directing method calls to the appropriate client instances (ClientStrategy, ClientExchange, ClientFrame) based on runtime context. These services implement memoized factory patterns to ensure efficient instance reuse while maintaining clean separation between configuration registration and execution.

This document covers the three Connection Services: `StrategyConnectionService`, `ExchangeConnectionService`, and `FrameConnectionService`. For configuration registration mechanisms, see [Schema Services](#5.2). For the client implementations that Connection Services route to, see [Core Business Logic](#4). For the context services that enable routing, see [Context Propagation](#2.3).

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-143](), [src/lib/services/connection/ExchangeConnectionService.ts:1-185](), [src/lib/services/connection/FrameConnectionService.ts:1-86]()

---

## Architecture Overview

Connection Services act as intelligent routers that bridge the Service Orchestration Layer with the Business Logic Layer. Each Connection Service implements its corresponding interface (`IStrategy`, `IExchange`, `IFrame`) and delegates method calls to memoized client instances.

### Connection Layer Architecture

![Mermaid Diagram](./diagrams\19_Connection_Services_0.svg)

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:44-143](), [src/lib/services/connection/ExchangeConnectionService.ts:38-185](), [src/lib/services/connection/FrameConnectionService.ts:32-86]()

---

## Routing Mechanism

Connection Services use `MethodContextService` to determine which client instance to route to at runtime. The context contains three routing keys:

| Context Property | Purpose | Used By |
|-----------------|---------|---------|
| `strategyName` | Identifies which strategy schema to use | StrategyConnectionService |
| `exchangeName` | Identifies which exchange schema to use | ExchangeConnectionService |
| `frameName` | Identifies which frame schema to use | FrameConnectionService |

### Context-Based Routing Flow

![Mermaid Diagram](./diagrams\19_Connection_Services_1.svg)

**Example:** When `StrategyConnectionService.tick()` is called, it reads `methodContextService.context.strategyName` to determine which `ClientStrategy` instance to use.

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:93-110](), [src/lib/services/connection/ExchangeConnectionService.ts:86-99](), [src/lib/services/connection/FrameConnectionService.ts:75-82]()

---

## Memoization Pattern

All three Connection Services use the `memoize` function from `functools-kit` to cache client instances. This pattern ensures:

1. **Performance**: Client instances are created once per schema name
2. **State preservation**: Client instances maintain internal state across calls
3. **Memory efficiency**: Automatic caching without manual cache management

### Memoization Structure

| Component | Cache Key | Cached Value | Lifecycle |
|-----------|-----------|--------------|-----------|
| `getStrategy()` | `strategyName` string | `ClientStrategy` instance | Application lifetime |
| `getExchange()` | `exchangeName` string | `ClientExchange` instance | Application lifetime |
| `getFrame()` | `frameName` string | `ClientFrame` instance | Application lifetime |

### Memoization Implementation Pattern

![Mermaid Diagram](./diagrams\19_Connection_Services_2.svg)

**Example from StrategyConnectionService:**

The `getStrategy` method [src/lib/services/connection/StrategyConnectionService.ts:67-83]() demonstrates this pattern:

- **Cache key function**: `([strategyName]) => \`${strategyName}\`` - Creates unique key from strategy name
- **Factory function**: Creates `new ClientStrategy()` with schema config from `StrategySchemaService`
- **First call**: Creates instance, caches it, returns it
- **Subsequent calls**: Returns cached instance immediately

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:67-83](), [src/lib/services/connection/ExchangeConnectionService.ts:59-74](), [src/lib/services/connection/FrameConnectionService.ts:50-64]()

---

## StrategyConnectionService

`StrategyConnectionService` implements the `IStrategy` interface and routes strategy operations to `ClientStrategy` instances. It is responsible for signal lifecycle management including tick evaluation, backtest execution, and event emission.

### Dependency Injection

The service injects five core dependencies:

![Mermaid Diagram](./diagrams\19_Connection_Services_3.svg)

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:45-56]()

### Methods

#### tick()

Routes live trading tick evaluation to the appropriate `ClientStrategy` instance.

**Execution flow:**
1. Retrieves strategy name from `methodContextService.context.strategyName` [src/lib/services/connection/StrategyConnectionService.ts:95-97]()
2. Gets memoized `ClientStrategy` instance via `getStrategy()` [src/lib/services/connection/StrategyConnectionService.ts:95-97]()
3. Waits for strategy initialization with `waitForInit()` [src/lib/services/connection/StrategyConnectionService.ts:98]()
4. Calls `strategy.tick()` [src/lib/services/connection/StrategyConnectionService.ts:99]()
5. Emits result to event listeners [src/lib/services/connection/StrategyConnectionService.ts:100-108]():
   - `signalBacktestEmitter` if in backtest mode
   - `signalLiveEmitter` if in live mode
   - `signalEmitter` always

**Returns:** `Promise<IStrategyTickResult>` - Signal state (idle, opened, active, closed)

#### backtest()

Routes backtest simulation to the appropriate `ClientStrategy` instance with provided candle data.

**Parameters:**
- `candles: ICandleData[]` - Historical candle data for fast-forward simulation

**Execution flow:**
1. Retrieves strategy name from context [src/lib/services/connection/StrategyConnectionService.ts:127-129]()
2. Gets memoized `ClientStrategy` instance [src/lib/services/connection/StrategyConnectionService.ts:127-129]()
3. Waits for strategy initialization [src/lib/services/connection/StrategyConnectionService.ts:130]()
4. Calls `strategy.backtest(candles)` [src/lib/services/connection/StrategyConnectionService.ts:131]()
5. Emits result to event listeners [src/lib/services/connection/StrategyConnectionService.ts:132-137]()

**Returns:** `Promise<IStrategyBacktestResult>` - Backtest outcome (signal or idle)

### Event Emission

`StrategyConnectionService` emits tick and backtest results to three event emitters [src/lib/services/connection/StrategyConnectionService.ts:17-21]():

| Emitter | When | Purpose |
|---------|------|---------|
| `signalEmitter` | All results | Generic signal observer |
| `signalBacktestEmitter` | Backtest mode only | Backtest-specific observers |
| `signalLiveEmitter` | Live mode only | Live trading observers |

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-143]()

---

## ExchangeConnectionService

`ExchangeConnectionService` implements the `IExchange` interface and routes exchange operations to `ClientExchange` instances. It handles candle data fetching, price formatting, and VWAP calculation.

### Dependency Injection

![Mermaid Diagram](./diagrams\19_Connection_Services_4.svg)

**Sources:** [src/lib/services/connection/ExchangeConnectionService.ts:39-48]()

### Methods

#### getCandles()

Fetches historical candles backwards from `executionContextService.context.when`.

**Parameters:**
- `symbol: string` - Trading pair (e.g., "BTCUSDT")
- `interval: CandleInterval` - Time interval (e.g., "1h", "1d")
- `limit: number` - Maximum candles to fetch

**Implementation:** [src/lib/services/connection/ExchangeConnectionService.ts:86-99]()
- Logs operation with parameters
- Routes to `getExchange(exchangeName).getCandles()`
- Exchange name from `methodContextService.context.exchangeName`

**Returns:** `Promise<ICandleData[]>` - Array of OHLCV candle data

#### getNextCandles()

Fetches future candles forward from `executionContextService.context.when` (backtest only).

**Parameters:** Same as `getCandles()`

**Implementation:** [src/lib/services/connection/ExchangeConnectionService.ts:112-125]()
- Used for backtest fast-forward simulation
- Routes to `getExchange(exchangeName).getNextCandles()`

**Returns:** `Promise<ICandleData[]>` - Array of future candle data

#### getAveragePrice()

Calculates Volume-Weighted Average Price (VWAP) for symbol.

**Parameters:**
- `symbol: string` - Trading pair

**Implementation:** [src/lib/services/connection/ExchangeConnectionService.ts:136-143]()
- **Live mode**: Fetches real-time average from exchange API
- **Backtest mode**: Calculates VWAP from last 5 one-minute candles

**Returns:** `Promise<number>` - VWAP price

#### formatPrice()

Formats price value according to exchange-specific precision rules.

**Parameters:**
- `symbol: string` - Trading pair
- `price: number` - Raw price value

**Implementation:** [src/lib/services/connection/ExchangeConnectionService.ts:154-162]()
- Routes to exchange-specific formatter
- Ensures compliance with tick size requirements

**Returns:** `Promise<string>` - Formatted price string

#### formatQuantity()

Formats quantity value according to exchange-specific precision rules.

**Parameters:**
- `symbol: string` - Trading pair
- `quantity: number` - Raw quantity value

**Implementation:** [src/lib/services/connection/ExchangeConnectionService.ts:173-181]()
- Routes to exchange-specific formatter
- Ensures compliance with lot size requirements

**Returns:** `Promise<string>` - Formatted quantity string

**Sources:** [src/lib/services/connection/ExchangeConnectionService.ts:1-185](), [src/interfaces/Exchange.interface.ts:109-166]()

---

## FrameConnectionService

`FrameConnectionService` implements the `IFrame` interface and routes frame operations to `ClientFrame` instances. It manages backtest timeframe boundaries (start date, end date, interval).

### Dependency Injection

![Mermaid Diagram](./diagrams\19_Connection_Services_5.svg)

**Sources:** [src/lib/services/connection/FrameConnectionService.ts:33-39]()

### Methods

#### getTimeframe()

Retrieves backtest timeframe boundaries for symbol from registered frame schema.

**Parameters:**
- `symbol: string` - Trading pair (e.g., "BTCUSDT")

**Implementation:** [src/lib/services/connection/FrameConnectionService.ts:75-82]()
- Routes to `getFrame(frameName).getTimeframe()`
- Frame name from `methodContextService.context.frameName`
- Returns `{ startDate: Date, endDate: Date }` from schema configuration

**Returns:** `Promise<{ startDate: Date, endDate: Date }>` - Timeframe boundaries

### Live Mode Behavior

In live trading mode, `frameName` is set to empty string `""` [src/lib/services/connection/FrameConnectionService.ts:23]() because there are no timeframe constraints. The `FrameConnectionService` is not used during live execution.

**Sources:** [src/lib/services/connection/FrameConnectionService.ts:1-86]()

---

## Integration Points

Connection Services integrate with multiple layers of the architecture, serving as the critical routing infrastructure.

### Service Dependencies

![Mermaid Diagram](./diagrams\19_Connection_Services_6.svg)

### Data Flow Through Connection Layer

| Source | Connection Service | Destination | Purpose |
|--------|-------------------|-------------|---------|
| Logic Services | StrategyConnectionService | ClientStrategy | Signal evaluation and backtest |
| ClientStrategy | ExchangeConnectionService | ClientExchange | Candle data and VWAP |
| Logic Services | ExchangeConnectionService | ClientExchange | Price formatting |
| Logic Services | FrameConnectionService | ClientFrame | Timeframe generation |

### Logging Integration

All Connection Services inject `LoggerService` and log operations with context-enriched metadata [src/lib/services/connection/StrategyConnectionService.ts:45](), [src/lib/services/connection/ExchangeConnectionService.ts:39](), [src/lib/services/connection/FrameConnectionService.ts:33]():

- `StrategyConnectionService`: Logs tick and backtest operations with candle counts
- `ExchangeConnectionService`: Logs all data fetching with symbol, interval, and limits
- `FrameConnectionService`: Logs timeframe retrieval with symbol

**Sources:** [src/lib/services/connection/StrategyConnectionService.ts:1-143](), [src/lib/services/connection/ExchangeConnectionService.ts:1-185](), [src/lib/services/connection/FrameConnectionService.ts:1-86]()