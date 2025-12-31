# Exchange Schemas

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [demo/backtest/package-lock.json](demo/backtest/package-lock.json)
- [demo/backtest/package.json](demo/backtest/package.json)
- [demo/backtest/src/index.mjs](demo/backtest/src/index.mjs)
- [demo/live/package-lock.json](demo/live/package-lock.json)
- [demo/live/package.json](demo/live/package.json)
- [demo/live/src/index.mjs](demo/live/src/index.mjs)
- [demo/optimization/package-lock.json](demo/optimization/package-lock.json)
- [demo/optimization/package.json](demo/optimization/package.json)
- [package-lock.json](package-lock.json)
- [package.json](package.json)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [types.d.ts](types.d.ts)

</details>



Exchange schemas define market data sources for backtesting and live trading. An exchange provides historical candle data (OHLCV) and formatting functions for prices and quantities. Exchanges are registered via `addExchange()` and instantiated as `ClientExchange` instances by the connection service layer.

For information about strategy schemas that consume exchange data, see [Strategy Schemas](#5.1). For frame schemas that define backtest time ranges, see [Frame Schemas](#5.3).

---

## Interface Definition

The `IExchangeSchema` interface specifies the contract for all exchange implementations. It consists of three core functions and optional lifecycle callbacks.

```mermaid
classDiagram
    class IExchangeSchema {
        +string exchangeName
        +string? note
        +getCandles(symbol, interval, since, limit) Promise~ICandleData[]~
        +formatQuantity(symbol, quantity) Promise~string~
        +formatPrice(symbol, price) Promise~string~
        +Partial~IExchangeCallbacks~? callbacks
    }
    
    class IExchangeCallbacks {
        +onCandleData(symbol, interval, since, limit, data) void
    }
    
    class ICandleData {
        +number timestamp
        +number open
        +number high
        +number low
        +number close
        +number volume
    }
    
    class CandleInterval {
        <<enumeration>>
        1m
        3m
        5m
        15m
        30m
        1h
        2h
        4h
        6h
        8h
    }
    
    IExchangeSchema --> IExchangeCallbacks : callbacks
    IExchangeSchema --> ICandleData : returns
    IExchangeSchema --> CandleInterval : uses
```

**Sources:** [types.d.ts:80-155]()

---

## Required Fields

### exchangeName

Unique identifier for the exchange. Used throughout the system to reference this exchange configuration via dependency injection.

| Property | Type | Description |
|----------|------|-------------|
| `exchangeName` | `ExchangeName` (string) | Unique exchange identifier |
| `note` | `string?` | Optional developer documentation |

### getCandles Function

Fetches historical OHLCV candle data from the exchange data source (API, database, or custom provider).

**Signature:**
```typescript
getCandles: (
    symbol: string,        // Trading pair (e.g., "BTCUSDT")
    interval: CandleInterval,  // Candle time interval
    since: Date,           // Start date for data fetch
    limit: number          // Maximum candles to return
) => Promise<ICandleData[]>
```

**Returns:** Array of `ICandleData` objects sorted by timestamp ascending.

**Temporal Isolation:** The `since` parameter is automatically determined by `ExecutionContextService.context.when` to prevent look-ahead bias during backtesting. Strategies cannot access future data.

### formatPrice Function

Formats price values according to exchange precision rules (e.g., 2 decimal places for USDT pairs).

**Signature:**
```typescript
formatPrice: (
    symbol: string,    // Trading pair
    price: number      // Raw price value
) => Promise<string>   // Formatted price string
```

### formatQuantity Function

Formats quantity/amount values according to exchange precision rules (e.g., 8 decimal places for BTC).

**Signature:**
```typescript
formatQuantity: (
    symbol: string,     // Trading pair
    quantity: number    // Raw quantity value
) => Promise<string>    // Formatted quantity string
```

**Sources:** [types.d.ts:119-155](), [src/interfaces/Exchange.interface.ts:1-100]()

---

## Candle Data Structure

Each candle represents aggregated trading data for a specific time interval.

```mermaid
graph LR
    subgraph ICandleData["ICandleData Structure"]
        timestamp["timestamp<br/>(Unix milliseconds)"]
        open["open<br/>(Opening price)"]
        high["high<br/>(Highest price)"]
        low["low<br/>(Lowest price)"]
        close["close<br/>(Closing price)"]
        volume["volume<br/>(Trading volume)"]
    end
    
    timestamp --> VWAP["VWAP Calculation"]
    open --> VWAP
    high --> VWAP
    low --> VWAP
    close --> VWAP
    volume --> VWAP
    
    VWAP --> TypicalPrice["Typical Price = (H + L + C) / 3"]
    VWAP --> WeightedSum["Σ(Typical Price × Volume)"]
    VWAP --> TotalVolume["Σ(Volume)"]
    
    WeightedSum --> Result["VWAP = Weighted Sum / Total Volume"]
    TotalVolume --> Result
```

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | `number` | Unix timestamp in milliseconds when candle opened |
| `open` | `number` | Opening price at candle start |
| `high` | `number` | Highest price during candle period |
| `low` | `number` | Lowest price during candle period |
| `close` | `number` | Closing price at candle end |
| `volume` | `number` | Trading volume during candle period |

**VWAP Formula:** The system uses the last 5 1-minute candles to calculate Volume Weighted Average Price for realistic entry/exit pricing:

```
Typical Price = (High + Low + Close) / 3
VWAP = Σ(Typical Price × Volume) / Σ(Volume)
```

**Sources:** [types.d.ts:84-100](), [src/client/ClientExchange.ts:140-167]()

---

## Registration Flow

Exchange schemas are registered via `addExchange()` and stored in `ExchangeSchemaService` using the `ToolRegistry` pattern.

```mermaid
sequenceDiagram
    participant User
    participant addExchange["addExchange()"]
    participant ExchangeGlobalService
    participant ExchangeValidationService
    participant ExchangeSchemaService
    participant ToolRegistry
    
    User->>addExchange: IExchangeSchema
    addExchange->>ExchangeGlobalService: addExchange(schema)
    ExchangeGlobalService->>ExchangeValidationService: validate(schema)
    
    alt Validation fails
        ExchangeValidationService-->>User: throw Error
    end
    
    ExchangeValidationService->>ExchangeSchemaService: addExchange(schema)
    ExchangeSchemaService->>ToolRegistry: set(exchangeName, schema)
    ToolRegistry-->>ExchangeSchemaService: stored
    ExchangeSchemaService-->>User: void
    
    Note over ToolRegistry: Schema stored for later<br/>ClientExchange instantiation
```

**Sources:** [src/function/add.ts:1-50](), [src/lib/services/global/ExchangeGlobalService.ts:1-100](), [src/lib/services/schema/ExchangeSchemaService.ts:1-50]()

---

## Exchange Instance Lifecycle

`ExchangeConnectionService` creates and memoizes `ClientExchange` instances using a composite key strategy.

```mermaid
graph TB
    subgraph Registration["1. Registration Phase"]
        addExchange["addExchange()"]
        ExchangeSchemaService["ExchangeSchemaService<br/>ToolRegistry storage"]
        
        addExchange -->|store| ExchangeSchemaService
    end
    
    subgraph Connection["2. Connection Phase"]
        ExchangeConnectionService["ExchangeConnectionService<br/>getExchange()"]
        CompositeKey["Composite Key:<br/>symbol:exchangeName:backtest"]
        Memoize["memoize() cache"]
        
        ExchangeConnectionService -->|generate| CompositeKey
        CompositeKey -->|lookup| Memoize
    end
    
    subgraph Instantiation["3. Instantiation Phase"]
        ExchangeSchemaService2["ExchangeSchemaService<br/>retrieve schema"]
        ClientExchange["new ClientExchange(params)"]
        IExchange["IExchange instance"]
        
        ExchangeSchemaService2 -->|schema| ClientExchange
        ClientExchange -->|implements| IExchange
    end
    
    subgraph Usage["4. Usage Phase"]
        Strategy["ClientStrategy.tick()"]
        getCandles["exchange.getCandles()"]
        getAveragePrice["exchange.getAveragePrice()"]
        VWAP["VWAP calculation"]
        
        Strategy -->|calls| getCandles
        Strategy -->|calls| getAveragePrice
        getAveragePrice -->|uses| VWAP
    end
    
    ExchangeSchemaService -.->|provides schema| ExchangeSchemaService2
    Memoize -->|cache miss| ClientExchange
    Memoize -->|cache hit| IExchange
    IExchange -->|used by| Strategy
```

**Memoization Key:** `${symbol}:${exchangeName}:${backtest}`

This ensures separate exchange instances for:
- Different symbols (e.g., BTCUSDT vs ETHUSDT)
- Different exchanges (e.g., binance vs coinbase)
- Different execution modes (backtest vs live)

**Sources:** [src/lib/services/connection/ExchangeConnectionService.ts:1-100](), [src/client/ClientExchange.ts:1-50]()

---

## Candle Data Flow

Exchange candles flow through multiple layers before reaching strategies.

```mermaid
sequenceDiagram
    participant Strategy["ClientStrategy.tick()"]
    participant ExchangeConnection["ExchangeConnectionService"]
    participant ClientExchange
    participant ExecutionContext["ExecutionContextService"]
    participant UserGetCandles["IExchangeSchema.getCandles"]
    participant ExternalAPI["External API<br/>(CCXT, Database, etc.)"]
    
    Strategy->>ExchangeConnection: getExchange(symbol, exchangeName)
    ExchangeConnection->>ClientExchange: new ClientExchange(params)
    
    Strategy->>ClientExchange: getCandles(symbol, "1m", 30)
    
    ClientExchange->>ExecutionContext: context.when
    ExecutionContext-->>ClientExchange: Date (current execution time)
    
    Note over ClientExchange: Calculate 'since' date<br/>when - (limit × interval)
    
    ClientExchange->>UserGetCandles: getCandles(symbol, "1m", since, 30)
    UserGetCandles->>ExternalAPI: fetchOHLCV(symbol, "1m", since.getTime(), 30)
    ExternalAPI-->>UserGetCandles: OHLCV array
    UserGetCandles-->>ClientExchange: ICandleData[]
    
    Note over ClientExchange: Temporal validation:<br/>Filter candles where<br/>timestamp <= context.when
    
    ClientExchange-->>Strategy: ICandleData[] (filtered)
    
    Strategy->>ClientExchange: getAveragePrice(symbol)
    
    Note over ClientExchange: Fetch last 5 1-minute candles
    
    ClientExchange->>UserGetCandles: getCandles(symbol, "1m", since, 5)
    UserGetCandles-->>ClientExchange: ICandleData[]
    
    Note over ClientExchange: Calculate VWAP:<br/>Σ(((H+L+C)/3) × Vol) / Σ(Vol)
    
    ClientExchange-->>Strategy: number (VWAP price)
```

**Temporal Isolation:** `ClientExchange` automatically filters candles to ensure `candle.timestamp <= ExecutionContextService.context.when`. This prevents look-ahead bias in backtesting.

**Sources:** [src/client/ClientExchange.ts:50-200](), [src/lib/services/context/ExecutionContextService.ts:1-50]()

---

## Callbacks

Optional lifecycle callbacks for monitoring candle data fetching.

### onCandleData

Invoked after candle data is successfully fetched from the exchange. Useful for logging, caching, or debugging.

```typescript
callbacks: {
    onCandleData: (
        symbol: string,          // Trading pair
        interval: CandleInterval, // Candle interval
        since: Date,             // Start date requested
        limit: number,           // Limit requested
        data: ICandleData[]      // Fetched candles
    ) => void
}
```

**Sources:** [types.d.ts:113-118]()

---

## Integration Example

Typical exchange schema using CCXT for Binance data:

```typescript
import ccxt from "ccxt";
import { addExchange } from "backtest-kit";

addExchange({
    exchangeName: "binance",
    note: "Binance exchange via CCXT",
    
    getCandles: async (symbol, interval, since, limit) => {
        const exchange = new ccxt.binance();
        const ohlcv = await exchange.fetchOHLCV(
            symbol, 
            interval, 
            since.getTime(), 
            limit
        );
        
        return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
            timestamp,
            open,
            high,
            low,
            close,
            volume
        }));
    },
    
    formatPrice: async (symbol, price) => {
        // USDT pairs: 2 decimals
        return price.toFixed(2);
    },
    
    formatQuantity: async (symbol, quantity) => {
        // BTC: 8 decimals
        return quantity.toFixed(8);
    },
    
    callbacks: {
        onCandleData: (symbol, interval, since, limit, data) => {
            console.log(`Fetched ${data.length} ${interval} candles for ${symbol}`);
        }
    }
});
```

**Sources:** [demo/backtest/src/index.mjs:24-35](), [demo/live/src/index.mjs:24-35]()

---

## Validation Rules

`ExchangeValidationService` enforces the following constraints during registration:

| Rule | Description |
|------|-------------|
| **Unique Name** | `exchangeName` must be unique across all registered exchanges |
| **Required Functions** | `getCandles`, `formatPrice`, `formatQuantity` must be provided |
| **Valid Return Types** | `getCandles` must return `Promise<ICandleData[]>` |
| **Valid Intervals** | All `CandleInterval` values must be supported |

**Sources:** [src/lib/services/validation/ExchangeValidationService.ts:1-100]()

---

## ClientExchange Implementation

The `ClientExchange` class implements the `IExchange` interface and provides additional functionality:

```mermaid
classDiagram
    class IExchange {
        <<interface>>
        +getCandles(symbol, interval, limit) Promise~ICandleData[]~
        +getNextCandles(symbol, interval, limit) Promise~ICandleData[]~
        +formatQuantity(symbol, quantity) Promise~string~
        +formatPrice(symbol, price) Promise~string~
        +getAveragePrice(symbol) Promise~number~
    }
    
    class ClientExchange {
        -IExchangeParams params
        -ILogger logger
        -TExecutionContextService execution
        +getCandles(symbol, interval, limit) Promise~ICandleData[]~
        +getNextCandles(symbol, interval, limit) Promise~ICandleData[]~
        +formatQuantity(symbol, quantity) Promise~string~
        +formatPrice(symbol, price) Promise~string~
        +getAveragePrice(symbol) Promise~number~
        -_calculateSince(interval, limit, when) Date
        -_filterCandlesByTime(candles, when) ICandleData[]
    }
    
    class IExchangeParams {
        +string exchangeName
        +getCandles function
        +formatQuantity function
        +formatPrice function
        +ILogger logger
        +TExecutionContextService execution
    }
    
    IExchange <|.. ClientExchange : implements
    ClientExchange --> IExchangeParams : uses
```

**Additional Methods:**

### getNextCandles

Fetches future candles for backtest fast-forwarding. Only used in backtest mode.

```typescript
getNextCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
) => Promise<ICandleData[]>
```

Calculates `since` as `context.when + (interval duration)` to fetch candles starting after the current execution time.

### getAveragePrice

Calculates VWAP from the last 5 1-minute candles. This is the price used for all signal entry/exit calculations to provide realistic execution pricing.

```typescript
getAveragePrice: (symbol: string) => Promise<number>
```

**Formula Implementation:**
```typescript
const candles = await this.getCandles(symbol, "1m", 5);
const totalValue = candles.reduce((sum, c) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    return sum + (typicalPrice * c.volume);
}, 0);
const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
return totalValue / totalVolume;
```

**Sources:** [src/client/ClientExchange.ts:1-250](), [types.d.ts:159-205]()

---

## Temporal Isolation

`ClientExchange` enforces temporal isolation to prevent look-ahead bias during backtesting.

```mermaid
graph TB
    subgraph Input["Input Parameters"]
        When["ExecutionContextService.context.when<br/>(Current execution time)"]
        Interval["CandleInterval (e.g., '1m')"]
        Limit["limit (e.g., 30)"]
    end
    
    subgraph Calculation["Since Calculation"]
        IntervalMs["Convert interval to milliseconds<br/>(1m = 60000ms)"]
        Duration["duration = limit × intervalMs"]
        Since["since = when - duration"]
    end
    
    subgraph Fetch["Data Fetch"]
        GetCandles["IExchangeSchema.getCandles(symbol, interval, since, limit)"]
        RawCandles["Raw ICandleData[]"]
    end
    
    subgraph Filter["Temporal Filter"]
        FilterLogic["Filter: candle.timestamp <= when"]
        FilteredCandles["Filtered ICandleData[]"]
    end
    
    When --> Since
    Interval --> IntervalMs
    Limit --> Duration
    IntervalMs --> Duration
    Duration --> Since
    
    Since --> GetCandles
    GetCandles --> RawCandles
    
    RawCandles --> FilterLogic
    When --> FilterLogic
    FilterLogic --> FilteredCandles
    
    Note1["Prevents accessing future data<br/>in backtest execution"]
    FilterLogic -.-> Note1
```

**Implementation:** [src/client/ClientExchange.ts:70-120]()

This ensures that strategies only see historical data up to the current backtest timestamp, preventing look-ahead bias and ensuring realistic strategy testing.

**Sources:** [src/client/ClientExchange.ts:70-120](), [src/lib/services/context/ExecutionContextService.ts:1-50]()

---

## Public API Functions

Helper functions for accessing exchange functionality from user code:

### getCandles

```typescript
import { getCandles } from "backtest-kit";

const candles = await getCandles("BTCUSDT", "1m", 30);
```

Retrieves candles using the current execution context (symbol, exchange, timestamp).

### getAveragePrice

```typescript
import { getAveragePrice } from "backtest-kit";

const vwapPrice = await getAveragePrice("BTCUSDT");
```

Calculates VWAP from the last 5 1-minute candles.

### formatPrice / formatQuantity

```typescript
import { formatPrice, formatQuantity } from "backtest-kit";

const priceStr = await formatPrice("BTCUSDT", 50000.123);  // "50000.12"
const qtyStr = await formatQuantity("BTCUSDT", 0.123456789);  // "0.12345679"
```

Formats values according to exchange precision rules.

**Sources:** [src/function/exchange.ts:1-150](), [src/index.ts:58-65]()