---
title: design/21_data-and-exchanges
group: design
---

# Data and Exchanges

# Data and Exchanges

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [README.md](README.md)
- [src/config/emitters.ts](src/config/emitters.ts)
- [src/config/params.ts](src/config/params.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/function/setup.ts](src/function/setup.ts)
- [src/helpers/toProfitLossDto.ts](src/helpers/toProfitLossDto.ts)
- [src/index.ts](src/index.ts)
- [src/interfaces/Heatmap.interface.ts](src/interfaces/Heatmap.interface.ts)
- [src/lib/services/validation/ConfigValidationService.ts](src/lib/services/validation/ConfigValidationService.ts)
- [test/config/setup.mjs](test/config/setup.mjs)
- [test/e2e/config.test.mjs](test/e2e/config.test.mjs)
- [test/e2e/defend.test.mjs](test/e2e/defend.test.mjs)
- [test/e2e/risk.test.mjs](test/e2e/risk.test.mjs)
- [test/e2e/sanitize.test.mjs](test/e2e/sanitize.test.mjs)
- [test/index.mjs](test/index.mjs)
- [test/mock/getMockCandles.mjs](test/mock/getMockCandles.mjs)
- [test/spec/config.test.mjs](test/spec/config.test.mjs)
- [test/spec/heat.test.mjs](test/spec/heat.test.mjs)
- [test/spec/list.test.mjs](test/spec/list.test.mjs)
- [types.d.ts](types.d.ts)

</details>



This page documents how the backtest-kit framework integrates with external data sources, fetches historical market data, calculates price metrics like VWAP, and manages timeframes for backtesting. It covers the Exchange system (data source abstraction), Frame system (timeframe generation), and the candle data structures used throughout the framework.

**Scope**: This page focuses on data acquisition and time management. For strategy execution logic, see [Strategy System](./11-strategy-system.md). For execution mode details (how Backtest/Live modes consume this data), see [Execution Modes (Detailed)](./16-execution-modes-detailed.md).

---

## Exchange System Architecture

The Exchange system provides an abstraction layer for fetching historical candle data from any source (CCXT, custom APIs, databases). The framework uses a three-tier architecture for exchange operations:

```mermaid
graph TB
    subgraph "User Registration API"
        ADD_EXCH["addExchange()<br/>(src/function/add.ts)"]
    end
    
    subgraph "Schema Storage"
        EXCH_SCHEMA["ExchangeSchemaService<br/>ToolRegistry pattern<br/>stores IExchangeSchema"]
    end
    
    subgraph "Validation Layer"
        EXCH_VAL["ExchangeValidationService<br/>validates schema structure<br/>memoized checks"]
    end
    
    subgraph "Connection Factory"
        EXCH_CONN["ExchangeConnectionService<br/>memoized by exchangeName<br/>creates ClientExchange"]
    end
    
    subgraph "Client Layer"
        CLIENT_EXCH["ClientExchange<br/>implements IExchange<br/>getCandles, getNextCandles<br/>getAveragePrice (VWAP)"]
    end
    
    subgraph "Core Logic"
        EXCH_CORE["ExchangeCoreService<br/>orchestrates operations<br/>delegates to ClientExchange"]
    end
    
    subgraph "Data Source"
        USER_IMPL["User-provided getCandles<br/>CCXT, REST API, Database"]
    end
    
    ADD_EXCH -->|"registers"| EXCH_SCHEMA
    EXCH_SCHEMA -->|"reads"| EXCH_VAL
    EXCH_VAL -->|"validates"| EXCH_SCHEMA
    EXCH_SCHEMA -->|"provides schema"| EXCH_CONN
    EXCH_CONN -->|"instantiates with IExchangeParams"| CLIENT_EXCH
    EXCH_CORE -->|"calls methods"| CLIENT_EXCH
    CLIENT_EXCH -->|"invokes user callback"| USER_IMPL
    
    style CLIENT_EXCH fill:#e1f5ff,stroke:#333,stroke-width:3px
    style EXCH_SCHEMA fill:#fff4e1,stroke:#333,stroke-width:2px
```

**Key Components**:

| Component | File Path | Responsibility |
|-----------|-----------|----------------|
| `IExchangeSchema` | [types.d.ts:327-363]() | Schema interface for exchange registration |
| `ExchangeSchemaService` | [src/lib/services/schema/ExchangeSchemaService.ts]() | ToolRegistry for storing exchange schemas |
| `ExchangeValidationService` | [src/lib/services/validation/ExchangeValidationService.ts]() | Validates exchange schema structure |
| `ExchangeConnectionService` | [src/lib/services/connection/ExchangeConnectionService.ts]() | Memoized factory for `ClientExchange` instances |
| `ClientExchange` | [src/lib/client/ClientExchange.ts]() | Business logic for candle fetching and VWAP |
| `ExchangeCoreService` | [src/lib/services/core/ExchangeCoreService.ts]() | High-level orchestration of exchange operations |

**Sources**: [types.d.ts:327-363](), [src/index.ts:1-195](), Diagram 1 from high-level architecture

---

## Exchange Configuration

### IExchangeSchema Structure

Exchanges are registered via `addExchange()` with a schema defining four required callbacks:

```mermaid
graph LR
    SCHEMA["IExchangeSchema"]
    
    GET_CANDLES["getCandles()<br/>fetch historical OHLCV<br/>returns Promise&lt;ICandleData[]&gt;"]
    FORMAT_PRICE["formatPrice()<br/>exchange precision rules<br/>returns Promise&lt;string&gt;"]
    FORMAT_QTY["formatQuantity()<br/>exchange precision rules<br/>returns Promise&lt;string&gt;"]
    CALLBACKS["callbacks.onCandleData<br/>(optional)<br/>event emitted after fetch"]
    
    SCHEMA -->|"required"| GET_CANDLES
    SCHEMA -->|"required"| FORMAT_PRICE
    SCHEMA -->|"required"| FORMAT_QTY
    SCHEMA -->|"optional"| CALLBACKS
    
    style SCHEMA fill:#fff4e1,stroke:#333,stroke-width:2px
```

**Schema Definition** ([types.d.ts:327-363]()):

```typescript
interface IExchangeSchema {
    exchangeName: ExchangeName;  // Unique identifier
    note?: string;               // Documentation
    
    // Fetch candles from data source
    getCandles: (
        symbol: string,
        interval: CandleInterval,  // "1m" | "3m" | "5m" | ... | "8h"
        since: Date,
        limit: number
    ) => Promise<ICandleData[]>;
    
    // Format values per exchange precision
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    
    // Optional lifecycle callback
    callbacks?: Partial<IExchangeCallbacks>;
}
```

### Registration Example

```typescript
import ccxt from 'ccxt';
import { addExchange } from 'backtest-kit';

addExchange({
    exchangeName: 'binance',
    note: 'CCXT-based Binance integration',
    
    getCandles: async (symbol, interval, since, limit) => {
        const exchange = new ccxt.binance();
        const ohlcv = await exchange.fetchOHLCV(
            symbol,
            interval,
            since.getTime(),
            limit
        );
        
        return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
            timestamp, open, high, low, close, volume
        }));
    },
    
    formatPrice: async (symbol, price) => {
        const exchange = new ccxt.binance();
        await exchange.loadMarkets();
        return exchange.priceToPrecision(symbol, price);
    },
    
    formatQuantity: async (symbol, quantity) => {
        const exchange = new ccxt.binance();
        await exchange.loadMarkets();
        return exchange.amountToPrecision(symbol, quantity);
    },
    
    callbacks: {
        onCandleData: (symbol, interval, since, limit, data) => {
            console.log(`Fetched ${data.length} candles for ${symbol}`);
        }
    }
});
```

### Validation Rules

`ExchangeValidationService` enforces:
- `exchangeName` must be non-empty string
- `getCandles` must be a function
- `formatPrice` must be a function
- `formatQuantity` must be a function
- Exchange name must not already exist (checked during registration)

**Sources**: [types.d.ts:327-363](), [src/function/add.ts](), [test/spec/exchange.test.mjs](), [README.md:60-75]()

---

## Candle Data and VWAP

### ICandleData Structure

The framework uses a standard OHLCV candle structure:

```typescript
interface ICandleData {
    timestamp: number;  // Unix timestamp in milliseconds
    open: number;       // Opening price
    high: number;       // Highest price
    low: number;        // Lowest price
    close: number;      // Closing price
    volume: number;     // Trading volume
}
```

**Sources**: [types.d.ts:295-308]()

### VWAP Calculation

`ClientExchange.getAveragePrice()` calculates Volume-Weighted Average Price (VWAP) using the last N 1-minute candles, where N is configured via `CC_AVG_PRICE_CANDLES_COUNT` (default: 5).

```mermaid
graph TD
    START["getAveragePrice(symbol)"]
    
    FETCH["fetch last N 1m candles<br/>getCandles(symbol, '1m', limit=N)"]
    
    VALIDATE["VALIDATE_NO_INCOMPLETE_CANDLES_FN<br/>check for price anomalies<br/>threshold: referencePrice / 1000"]
    
    CALC_TYPICAL["for each candle:<br/>typicalPrice = (high + low + close) / 3"]
    
    CALC_VWAP["VWAP = Σ(typicalPrice × volume) / Σ(volume)"]
    
    RETRY["retry logic<br/>CC_GET_CANDLES_RETRY_COUNT<br/>delay: CC_GET_CANDLES_RETRY_DELAY_MS"]
    
    START --> FETCH
    FETCH --> VALIDATE
    VALIDATE -->|"pass"| CALC_TYPICAL
    VALIDATE -->|"fail"| RETRY
    RETRY --> FETCH
    CALC_TYPICAL --> CALC_VWAP
    
    style VALIDATE fill:#ffe1e1,stroke:#333,stroke-width:2px
    style CALC_VWAP fill:#e1f5ff,stroke:#333,stroke-width:2px
```

**Implementation Details**:

1. **Fetching**: Calls `getCandles(symbol, "1m", limit)` where limit = `CC_AVG_PRICE_CANDLES_COUNT`
2. **Anomaly Detection**: Validates candles using `VALIDATE_NO_INCOMPLETE_CANDLES_FN` to detect incomplete candles from exchange APIs (e.g., Binance returning prices near $0 for incomplete candles)
3. **Typical Price**: For each candle, calculates `(high + low + close) / 3`
4. **VWAP**: `Σ(typicalPrice × volume) / Σ(volume)`
5. **Retry Logic**: On failure, retries up to `CC_GET_CANDLES_RETRY_COUNT` times with `CC_GET_CANDLES_RETRY_DELAY_MS` delay

**Configuration Parameters** ([src/config/params.ts:1-122]()):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | Number of 1m candles for VWAP |
| `CC_GET_CANDLES_RETRY_COUNT` | 3 | Max retries for failed fetches |
| `CC_GET_CANDLES_RETRY_DELAY_MS` | 5000 | Delay between retries (ms) |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` | 1000 | Anomaly detection threshold |
| `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | 5 | Min candles for median vs average |

### Price Anomaly Detection

`VALIDATE_NO_INCOMPLETE_CANDLES_FN` protects against incomplete candles from exchange APIs:

**Algorithm** ([src/lib/client/ClientExchange.ts]()):
1. Extract all price points (OHLC) from candles
2. Calculate reference price:
   - If `candles.length >= CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN`: use median
   - Else: use simple average
3. For each price, check: `price < referencePrice / CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR`
4. If anomaly detected, throw error

**Example**: BTC at $50,000 median → threshold $50. Catches incomplete candles with prices like $0.01-$1.

**Sources**: [types.d.ts:14-106](), [src/lib/client/ClientExchange.ts](), [test/e2e/sanitize.test.mjs:666-784](), [src/config/params.ts:76-104]()

---

## ClientExchange Methods

`ClientExchange` implements the `IExchange` interface with four primary methods:

```mermaid
graph TB
    IEXCHANGE["IExchange interface"]
    
    GET_CANDLES["getCandles(symbol, interval, limit)<br/>fetch historical candles<br/>backwards from ExecutionContext.when"]
    
    GET_NEXT["getNextCandles(symbol, interval, limit)<br/>fetch future candles<br/>forward from ExecutionContext.when<br/>(backtest mode only)"]
    
    GET_AVG["getAveragePrice(symbol)<br/>calculate VWAP<br/>last CC_AVG_PRICE_CANDLES_COUNT candles"]
    
    FORMAT_PRICE["formatPrice(symbol, price)<br/>delegate to schema callback"]
    
    FORMAT_QTY["formatQuantity(symbol, quantity)<br/>delegate to schema callback"]
    
    IEXCHANGE -->|"implements"| GET_CANDLES
    IEXCHANGE -->|"implements"| GET_NEXT
    IEXCHANGE -->|"implements"| GET_AVG
    IEXCHANGE -->|"implements"| FORMAT_PRICE
    IEXCHANGE -->|"implements"| FORMAT_QTY
    
    style GET_AVG fill:#e1f5ff,stroke:#333,stroke-width:2px
```

### getCandles vs getNextCandles

| Method | Direction | Use Case | Context |
|--------|-----------|----------|---------|
| `getCandles` | Backwards from `when` | Indicator calculation, VWAP | Backtest + Live |
| `getNextCandles` | Forward from `when` | Fast candle processing | Backtest only |

**Implementation** ([src/lib/client/ClientExchange.ts]()):
- Both methods call the user-provided `IExchangeSchema.getCandles` callback
- `getCandles`: `since = when - (limit * interval)`
- `getNextCandles`: `since = when`
- `ExecutionContext.when` is injected via `ExecutionContextService` (see [System Architecture](./06-system-architecture.md))

**Sources**: [types.d.ts:368-413](), [src/lib/client/ClientExchange.ts]()

---

## Timeframes and Frames

The Frame system generates timestamp arrays for backtest iteration. Each frame defines a date range and interval for generating tick timestamps.

```mermaid
graph TB
    subgraph "User Registration"
        ADD_FRAME["addFrame()<br/>(src/function/add.ts)"]
    end
    
    subgraph "Schema Storage"
        FRAME_SCHEMA["FrameSchemaService<br/>stores IFrameSchema"]
    end
    
    subgraph "Validation"
        FRAME_VAL["FrameValidationService<br/>validates date range<br/>interval validation"]
    end
    
    subgraph "Connection Factory"
        FRAME_CONN["FrameConnectionService<br/>memoized by frameName<br/>creates ClientFrame"]
    end
    
    subgraph "Client Layer"
        CLIENT_FRAME["ClientFrame<br/>implements IFrame<br/>getTimeframe()"]
    end
    
    subgraph "Core Logic"
        FRAME_CORE["FrameCoreService<br/>orchestrates timeframe<br/>generation"]
    end
    
    subgraph "Backtest Execution"
        BACKTEST_LOGIC["BacktestLogicPrivateService<br/>iterates timestamps<br/>for strategy.tick()"]
    end
    
    ADD_FRAME --> FRAME_SCHEMA
    FRAME_SCHEMA --> FRAME_VAL
    FRAME_VAL --> FRAME_SCHEMA
    FRAME_SCHEMA --> FRAME_CONN
    FRAME_CONN --> CLIENT_FRAME
    FRAME_CORE --> CLIENT_FRAME
    CLIENT_FRAME -->|"generates Date[]"| BACKTEST_LOGIC
    
    style CLIENT_FRAME fill:#e1f5ff,stroke:#333,stroke-width:3px
```

### IFrameSchema Structure

```typescript
interface IFrameSchema {
    frameName: FrameName;       // Unique identifier
    note?: string;              // Documentation
    interval: FrameInterval;    // Timestamp granularity
    startDate: Date;            // Backtest start (inclusive)
    endDate: Date;              // Backtest end (inclusive)
    callbacks?: Partial<IFrameCallbacks>;  // onTimeframe event
}

type FrameInterval = 
    | "1m" | "3m" | "5m" | "15m" | "30m"      // Minutes
    | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" // Hours
    | "1d" | "3d";                             // Days
```

**Sources**: [types.d.ts:420-502]()

### Timeframe Generation Algorithm

`ClientFrame.getTimeframe()` generates an array of `Date` objects:

**Implementation** ([src/lib/client/ClientFrame.ts]()):
```typescript
1. Parse interval to milliseconds (e.g., "1m" → 60000ms)
2. current = startDate
3. timestamps = []
4. while (current <= endDate):
       timestamps.push(new Date(current))
       current += interval_ms
5. return timestamps
```

**Example**: `interval="1m"`, `startDate="2024-01-01T00:00:00Z"`, `endDate="2024-01-01T01:00:00Z"`
- Generates 61 timestamps: 00:00, 00:01, 00:02, ..., 01:00

### Frame Registration Example

```typescript
import { addFrame } from 'backtest-kit';

addFrame({
    frameName: '30d-backtest',
    note: 'January 2024 full month',
    interval: '1m',
    startDate: new Date('2024-01-01T00:00:00Z'),
    endDate: new Date('2024-01-31T23:59:59Z'),
    callbacks: {
        onTimeframe: (timeframe, startDate, endDate, interval) => {
            console.log(`Generated ${timeframe.length} timestamps`);
            console.log(`Range: ${startDate} to ${endDate}`);
            console.log(`Interval: ${interval}`);
        }
    }
});
```

### Validation Rules

`FrameValidationService` enforces:
- `frameName` must be non-empty string
- `interval` must be valid `FrameInterval` type
- `startDate` must be valid Date
- `endDate` must be valid Date
- `endDate` must be greater than `startDate`

**Sources**: [types.d.ts:420-502](), [src/lib/client/ClientFrame.ts](), [test/spec/exchange.test.mjs]()

---

## Exchange and Frame Integration Flow

The following diagram shows how Exchange and Frame components integrate during backtest execution:

```mermaid
sequenceDiagram
    participant User
    participant BacktestLogic as BacktestLogicPrivateService
    participant FrameCore as FrameCoreService
    participant ClientFrame
    participant StrategyCore as StrategyCoreService
    participant ExchCore as ExchangeCoreService
    participant ClientExch as ClientExchange
    participant UserGetCandles as User getCandles
    
    User->>BacktestLogic: Backtest.run(symbol, {strategyName, exchangeName, frameName})
    
    BacktestLogic->>FrameCore: getTimeframe(symbol, frameName)
    FrameCore->>ClientFrame: getTimeframe()
    ClientFrame-->>FrameCore: Date[] (timestamps)
    FrameCore-->>BacktestLogic: Date[] timeframes
    
    loop for each timestamp in timeframes
        BacktestLogic->>StrategyCore: tick(symbol, timestamp)
        StrategyCore->>ExchCore: getAveragePrice(symbol)
        ExchCore->>ClientExch: getAveragePrice(symbol)
        ClientExch->>UserGetCandles: getCandles(symbol, "1m", 5)
        UserGetCandles-->>ClientExch: ICandleData[]
        ClientExch-->>ExchCore: VWAP price
        ExchCore-->>StrategyCore: price
        StrategyCore-->>BacktestLogic: IStrategyTickResult
    end
    
    BacktestLogic-->>User: generator yields results
```

**Execution Context Injection**:
- `BacktestLogicPrivateService` sets `ExecutionContextService.when = timestamp` before each `tick()` call
- `ClientExchange.getCandles()` reads `ExecutionContext.when` to calculate `since` parameter
- This ensures all operations are scoped to the current backtest timestamp

**Sources**: [src/lib/services/logic/private/BacktestLogicPrivateService.ts](), [src/lib/services/core/ExchangeCoreService.ts](), [src/lib/services/core/FrameCoreService.ts]()

---

## Exchange Data Flow and Caching

```mermaid
graph TB
    subgraph "Public API"
        GET_CANDLES_FN["getCandles(symbol, interval, limit)<br/>(src/function/exchange.ts)"]
        GET_AVG_FN["getAveragePrice(symbol)<br/>(src/function/exchange.ts)"]
    end
    
    subgraph "Service Layer"
        EXCH_CORE["ExchangeCoreService<br/>orchestrates calls"]
    end
    
    subgraph "Connection Layer"
        EXCH_CONN["ExchangeConnectionService<br/>Map&lt;exchangeName, ClientExchange&gt;<br/>memoized instances"]
    end
    
    subgraph "Client Layer"
        CLIENT_EXCH["ClientExchange<br/>business logic<br/>anomaly detection<br/>VWAP calculation"]
    end
    
    subgraph "Schema Storage"
        SCHEMA["ExchangeSchemaService<br/>IExchangeSchema registry"]
    end
    
    subgraph "User Implementation"
        USER_IMPL["User getCandles callback<br/>CCXT, API, Database"]
    end
    
    GET_CANDLES_FN --> EXCH_CORE
    GET_AVG_FN --> EXCH_CORE
    EXCH_CORE --> EXCH_CONN
    EXCH_CONN -->|"cache miss: instantiate"| CLIENT_EXCH
    EXCH_CONN -->|"cache hit: reuse"| CLIENT_EXCH
    CLIENT_EXCH -->|"reads schema"| SCHEMA
    CLIENT_EXCH -->|"invokes"| USER_IMPL
    
    style EXCH_CONN fill:#fff4e1,stroke:#333,stroke-width:2px
    style CLIENT_EXCH fill:#e1f5ff,stroke:#333,stroke-width:3px
```

**Memoization Strategy** ([src/lib/services/connection/ExchangeConnectionService.ts]()):
- `ClientExchange` instances are cached by `exchangeName`
- Cache key: `exchangeName` (string)
- Cache invalidation: None (instances live for application lifetime)
- Benefit: Avoids repeated schema lookups and instance creation

**Sources**: [src/function/exchange.ts](), [src/lib/services/connection/ExchangeConnectionService.ts](), [src/lib/services/core/ExchangeCoreService.ts]()

---

## Configuration Parameters Summary

All exchange and candle-related parameters are configurable via `setConfig()`:

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `CC_AVG_PRICE_CANDLES_COUNT` | 5 | Integer > 0 | VWAP candle count (1m interval) |
| `CC_GET_CANDLES_RETRY_COUNT` | 3 | Integer ≥ 0 | Max retries on fetch failure |
| `CC_GET_CANDLES_RETRY_DELAY_MS` | 5000 | Integer > 0 | Delay between retries (ms) |
| `CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR` | 1000 | Number > 0 | Anomaly detection divisor |
| `CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN` | 5 | Integer > 0 | Threshold for median vs average |

**Usage**:
```typescript
import { setConfig } from 'backtest-kit';

setConfig({
    CC_AVG_PRICE_CANDLES_COUNT: 10,  // Use 10 candles for VWAP
    CC_GET_CANDLES_RETRY_COUNT: 5,   // More retries for unstable APIs
});
```

**Sources**: [src/config/params.ts:1-122](), [types.d.ts:5-239](), [test/e2e/config.test.mjs]()

---

## Error Handling and Retry Logic

Exchange operations implement robust error handling:

**Retry Mechanism** ([src/lib/client/ClientExchange.ts]()):
1. Wrap `getCandles()` call in try-catch
2. On error, log via `LoggerService`
3. Wait `CC_GET_CANDLES_RETRY_DELAY_MS` milliseconds
4. Retry up to `CC_GET_CANDLES_RETRY_COUNT` times
5. If all retries exhausted, propagate error to caller

**Error Scenarios**:
- **Network Timeout**: Retried automatically
- **Rate Limit**: User should implement exponential backoff in `getCandles` callback
- **Invalid Symbol**: Not retried (validation error)
- **Anomalous Prices**: Throws error after validation, triggers retry

**Test Coverage**: [test/e2e/sanitize.test.mjs:666-784]() demonstrates incomplete candle detection and rejection

**Sources**: [src/lib/client/ClientExchange.ts](), [src/config/params.ts:66-104]()

---

## Testing Examples

### Mock Exchange for Testing

```typescript
import { addExchange } from 'backtest-kit';

addExchange({
    exchangeName: 'mock-exchange',
    getCandles: async (symbol, interval, since, limit) => {
        const candles = [];
        const intervalMs = 60000; // 1 minute
        
        for (let i = 0; i < limit; i++) {
            const timestamp = since.getTime() + i * intervalMs;
            candles.push({
                timestamp,
                open: 42000 + i * 100,
                high: 42100 + i * 100,
                low: 41900 + i * 100,
                close: 42000 + i * 100,
                volume: 100,
            });
        }
        
        return candles;
    },
    formatPrice: async (symbol, price) => price.toFixed(8),
    formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});
```

### Anomaly Detection Test

From [test/e2e/sanitize.test.mjs:666-784]():
- Mock exchange returns incomplete candle with `open: 0.1` (anomaly)
- Normal candles have `open: 42000`
- `VALIDATE_NO_INCOMPLETE_CANDLES_FN` detects 0.1 < 42000 / 1000 = 42
- Error emitted via `errorEmitter`
- Test verifies error message contains "anomalously low price"

**Sources**: [test/mock/getMockCandles.mjs:1-42](), [test/e2e/sanitize.test.mjs:666-784](), [test/spec/exchange.test.mjs]()