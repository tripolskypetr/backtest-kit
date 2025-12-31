# Exchange Functions

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [docs/classes/BacktestUtils.md](docs/classes/BacktestUtils.md)
- [docs/classes/LiveUtils.md](docs/classes/LiveUtils.md)
- [docs/classes/StrategyConnectionService.md](docs/classes/StrategyConnectionService.md)
- [docs/classes/WalkerUtils.md](docs/classes/WalkerUtils.md)
- [docs/index.md](docs/index.md)
- [docs/interfaces/IStrategySchema.md](docs/interfaces/IStrategySchema.md)
- [docs/interfaces/WalkerStopContract.md](docs/interfaces/WalkerStopContract.md)
- [docs/types/IStrategyBacktestResult.md](docs/types/IStrategyBacktestResult.md)
- [docs/types/TPersistBaseCtor.md](docs/types/TPersistBaseCtor.md)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [types.d.ts](types.d.ts)

</details>



This page documents the exchange helper functions provided by the framework for working with exchange data within strategy code. The primary focus is on the formatting functions `formatPrice` and `formatQuantity`, which enable strategies to display prices and quantities according to exchange-specific precision rules.

For information about implementing custom exchange integrations, see [Custom Exchange Integration](#16.1). For information about the Exchange client implementation, see [ClientExchange](#6.2). For information about exchange schemas and registration, see [Exchange Schemas](#5.2).

---

## Overview

The framework exports six helper functions from [src/function/exchange.ts]() that strategies can call to interact with exchange data:

| Function | Category | Purpose |
|----------|----------|---------|
| `formatPrice` | Formatting | Format price values for display |
| `formatQuantity` | Formatting | Format quantity values for display |
| `getCandles` | Market Data | Fetch historical candle data |
| `getAveragePrice` | Price Calculation | Calculate VWAP from recent candles |
| `getDate` | Context | Get current execution timestamp |
| `getMode` | Context | Check if running in backtest mode |

All functions respect **temporal isolation** via `ExecutionContextService` and **schema routing** via `MethodContextService`, ensuring strategies access the correct exchange instance and cannot peek into future data during backtests.

**Sources**: [src/index.ts:59-65](), [types.d.ts:159-205]()

---

## Formatting Functions

The formatting functions delegate to exchange-specific implementations registered via `IExchangeSchema`. Each exchange defines its own precision rules (e.g., Bitcoin might display as "50123.45" while some altcoins use different decimal places).

### formatPrice Function

```typescript
formatPrice(symbol: string, price: number): Promise<string>
```

Formats a price value according to the exchange's precision rules for the specified trading pair.

**Parameters**:
- `symbol`: Trading pair symbol (e.g., "BTCUSDT")
- `price`: Raw price value to format

**Returns**: Promise resolving to formatted price string

**Example Usage**:
```typescript
import { formatPrice, getAveragePrice } from "backtest-kit";

async function myStrategy(symbol: string) {
  const currentPrice = await getAveragePrice(symbol);
  const formatted = await formatPrice(symbol, currentPrice);
  console.log(`Current price: ${formatted}`); // e.g., "50123.45"
}
```

**Implementation Flow**:
1. Reads `exchangeName` from `MethodContextService.context`
2. Routes to `ExchangeGlobalService.formatPrice()`
3. Delegates to `ClientExchange.formatPrice()`
4. Calls the `formatPrice` function from the registered `IExchangeSchema`

**Sources**: [src/index.ts:64](), [types.d.ts:147-152]()

### formatQuantity Function

```typescript
formatQuantity(symbol: string, quantity: number): Promise<string>
```

Formats a quantity value according to the exchange's precision rules for the specified trading pair.

**Parameters**:
- `symbol`: Trading pair symbol (e.g., "BTCUSDT")
- `quantity`: Raw quantity value to format

**Returns**: Promise resolving to formatted quantity string

**Example Usage**:
```typescript
import { formatQuantity } from "backtest-kit";

async function myStrategy(symbol: string) {
  const positionSize = 0.12345678;
  const formatted = await formatQuantity(symbol, positionSize);
  console.log(`Position size: ${formatted}`); // e.g., "0.1234" (4 decimals)
}
```

**Implementation Flow**: Same as `formatPrice`, but routes to the `formatQuantity` function from `IExchangeSchema`.

**Sources**: [src/index.ts:64](), [types.d.ts:139-145]()

---

## Service Layer Architecture

The diagram below shows how exchange helper functions integrate with the service layer and maintain temporal isolation.

**Diagram: Exchange Function Call Flow**

```mermaid
graph TB
    Strategy["Strategy Code<br/>(getSignal function)"]
    FormatPrice["formatPrice()<br/>formatQuantity()"]
    GetCandles["getCandles()"]
    GetAvgPrice["getAveragePrice()"]
    GetDate["getDate()"]
    GetMode["getMode()"]
    
    ExecContext["ExecutionContextService<br/>(symbol, when, backtest)"]
    MethodContext["MethodContextService<br/>(strategyName, exchangeName, frameName)"]
    
    ExchangeGlobal["ExchangeGlobalService"]
    ExchangeConnection["ExchangeConnectionService"]
    ClientExchange["ClientExchange"]
    
    ExchangeSchema["IExchangeSchema<br/>(user-defined functions)"]
    
    Strategy --> FormatPrice
    Strategy --> GetCandles
    Strategy --> GetAvgPrice
    Strategy --> GetDate
    Strategy --> GetMode
    
    FormatPrice --> MethodContext
    GetCandles --> MethodContext
    GetAvgPrice --> MethodContext
    
    GetDate --> ExecContext
    GetMode --> ExecContext
    
    MethodContext --> ExchangeGlobal
    ExchangeGlobal --> ExchangeConnection
    ExchangeConnection --> ClientExchange
    
    ClientExchange --> ExecContext
    ClientExchange --> ExchangeSchema
    
    Note1["Formatting functions<br/>delegate to exchange schema"]
    Note2["Context functions<br/>read from AsyncLocalStorage"]
    Note3["All data access respects<br/>temporal isolation"]
    
    FormatPrice -.-> Note1
    GetDate -.-> Note2
    ClientExchange -.-> Note3
```

**Sources**: [types.d.ts:6-49]() (ExecutionContextService), [types.d.ts:296-336]() (MethodContextService), Diagram 1 from high-level overview

---

## Market Data Access Functions

These functions are documented in detail on separate pages but are mentioned here for completeness.

### getCandles

Fetches historical candle data backwards from the current execution context time. Used for technical indicator calculations.

See detailed documentation for `getCandles` function reference.

**Key Features**:
- Respects temporal isolation (cannot fetch future data in backtests)
- Returns OHLCV data (`ICandleData[]`)
- Delegates to exchange-specific implementation

**Sources**: [types.d.ts:162-169]()

### getAveragePrice

Calculates Volume Weighted Average Price (VWAP) from the last 5 one-minute candles. This is the price used for all entry/exit decisions in the framework to simulate realistic execution.

See detailed documentation for `getAveragePrice` function reference.

**Formula**: VWAP = Σ(Typical Price × Volume) / Σ(Volume)  
where Typical Price = (High + Low + Close) / 3

**Sources**: [types.d.ts:196-204](), Diagram 2 from high-level overview (Signal Lifecycle)

---

## Context Utility Functions

These functions provide read access to the current execution context without requiring explicit parameter passing.

### getDate

```typescript
getDate(): Date
```

Returns the current execution timestamp from `ExecutionContextService`. In live mode, this is `Date.now()`. In backtest mode, this is the current candle timestamp being processed.

**Returns**: Current execution timestamp as Date object

**Use Case**: Logging, calculating time-based conditions, or debugging temporal issues.

**Sources**: [types.d.ts:11-18]() (IExecutionContext)

### getMode

```typescript
getMode(): boolean
```

Returns whether the current execution is running in backtest mode (`true`) or live mode (`false`).

**Returns**: Boolean indicating backtest mode

**Use Case**: Conditional logic that should behave differently in live vs backtest (e.g., reduced logging in backtest).

**Sources**: [types.d.ts:11-18]() (IExecutionContext)

---

## Temporal Isolation Mechanism

The diagram below illustrates how temporal isolation is maintained when exchange functions are called during strategy execution.

**Diagram: Temporal Isolation in Exchange Functions**

```mermaid
graph TB
    subgraph "Backtest Execution at T=2024-01-15"
        BacktestLogic["BacktestLogicPrivateService<br/>Processing timeframe[100]"]
        ContextSet["ExecutionContextService.runInContext()<br/>symbol='BTCUSDT'<br/>when=2024-01-15<br/>backtest=true"]
    end
    
    subgraph "Strategy Execution"
        GetSignal["strategy.getSignal()<br/>(user code)"]
        CallGetCandles["getCandles('BTCUSDT', '1h', 24)"]
        CallGetAvgPrice["getAveragePrice('BTCUSDT')"]
    end
    
    subgraph "Service Layer"
        ClientExchangeGetCandles["ClientExchange.getCandles()"]
        CheckContext["Read ExecutionContextService.context.when<br/>= 2024-01-15"]
        FetchBackwards["Fetch candles BEFORE 2024-01-15<br/>(24 hours back)"]
    end
    
    subgraph "Data Source"
        ExchangeSchemaGetCandles["IExchangeSchema.getCandles()<br/>(user-defined API call)"]
        HistoricalData["Historical candle data<br/>2024-01-14 to 2024-01-15"]
    end
    
    BacktestLogic --> ContextSet
    ContextSet --> GetSignal
    GetSignal --> CallGetCandles
    GetSignal --> CallGetAvgPrice
    
    CallGetCandles --> ClientExchangeGetCandles
    CallGetAvgPrice --> ClientExchangeGetCandles
    
    ClientExchangeGetCandles --> CheckContext
    CheckContext --> FetchBackwards
    FetchBackwards --> ExchangeSchemaGetCandles
    
    ExchangeSchemaGetCandles --> HistoricalData
    
    Note1["Temporal isolation ensures<br/>strategies cannot access<br/>data after 'when' timestamp"]
    
    CheckContext -.-> Note1
```

**Key Points**:

1. **Context Propagation**: `ExecutionContextService` uses `AsyncLocalStorage` to propagate the current execution timestamp implicitly without manual parameter passing.

2. **Backwards Fetching**: `ClientExchange.getCandles()` always fetches data **backwards** from the current `when` timestamp, preventing look-ahead bias.

3. **Forward Fetching (Backtest Only)**: `ClientExchange.getNextCandles()` is used internally during backtests to fast-forward through candles but is not exposed to user strategy code.

**Sources**: [types.d.ts:6-49]() (ExecutionContextService), [types.d.ts:159-178]() (IExchange methods), Diagram 1 from high-level overview

---

## Memoization and Instance Management

The `ExchangeConnectionService` uses memoization to cache `ClientExchange` instances, ensuring each symbol-exchange combination has a single shared instance across all strategy executions.

**Memoization Key Format**: `{symbol}:{exchangeName}:{backtest ? 'backtest' : 'live'}`

**Example**:
- `"BTCUSDT:binance:backtest"` - Separate instance for backtesting
- `"BTCUSDT:binance:live"` - Separate instance for live trading

This separation ensures backtest and live executions maintain independent state and cannot interfere with each other.

**Sources**: [types.d.ts:102-110]() (IExchangeParams), Diagram 4 from high-level overview (Service Layer Architecture)

---

## Integration with IExchangeSchema

When users register an exchange via `addExchange()`, they provide implementations for three required functions:

```typescript
interface IExchangeSchema {
  exchangeName: string;
  getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>;
  formatPrice: (symbol: string, price: number) => Promise<string>;
  formatQuantity: (symbol: string, quantity: number) => Promise<string>;
  callbacks?: Partial<IExchangeCallbacks>;
}
```

The helper functions documented on this page ultimately delegate to these user-defined implementations:

| Helper Function | Delegates To |
|-----------------|--------------|
| `formatPrice()` | `IExchangeSchema.formatPrice` |
| `formatQuantity()` | `IExchangeSchema.formatQuantity` |
| `getCandles()` | `IExchangeSchema.getCandles` (via `ClientExchange`) |
| `getAveragePrice()` | Uses `getCandles()` + VWAP calculation |

**Sources**: [types.d.ts:122-155]() (IExchangeSchema), [src/index.ts:11-18]() (addExchange export)

---

## Summary Table

| Function | Input | Output | Use Case | Temporal Isolated |
|----------|-------|--------|----------|-------------------|
| `formatPrice` | symbol, price | formatted string | Display prices in logs/reports | N/A |
| `formatQuantity` | symbol, quantity | formatted string | Display quantities in logs/reports | N/A |
| `getCandles` | symbol, interval, limit | ICandleData[] | Technical indicators | Yes |
| `getAveragePrice` | symbol | number (VWAP) | Current market price | Yes |
| `getDate` | none | Date | Current execution time | N/A |
| `getMode` | none | boolean | Check if backtesting | N/A |

**Sources**: [src/index.ts:59-65](), [types.d.ts:159-205]()