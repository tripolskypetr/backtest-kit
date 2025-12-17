# Core Interfaces

This page documents the schema interfaces that define the core configuration contracts for Backtest Kit. These interfaces are used to register strategies, exchanges, timeframes, risk profiles, walkers, position sizing rules, and optimizer configurations via the `add*` family of functions (see [Global Functions](./56_api-reference.md)).

For information about runtime result types (signals, statistics, contracts), see [Signal & Result Types](./56_api-reference.md) and [Statistics & Contract Types](./56_api-reference.md). For internal service interfaces, see [Service Layer Interfaces](./56_api-reference.md).

---

## Schema Registration Overview

All schema interfaces follow a consistent registration pattern: define a configuration object implementing the schema interface, then register it using the corresponding `add*` function.

**Schema Registration Flow**

```mermaid
graph LR
    User["User Code"]
    
    subgraph "Public API"
        AddStrategy["addStrategy()"]
        AddExchange["addExchange()"]
        AddFrame["addFrame()"]
        AddRisk["addRisk()"]
        AddWalker["addWalker()"]
        AddSizing["addSizing()"]
        AddOptimizer["addOptimizer()"]
    end
    
    subgraph "Schema Services"
        StrategySchema["StrategySchemaService<br/>ToolRegistry"]
        ExchangeSchema["ExchangeSchemaService<br/>ToolRegistry"]
        FrameSchema["FrameSchemaService<br/>ToolRegistry"]
        RiskSchema["RiskSchemaService<br/>ToolRegistry"]
        WalkerSchema["WalkerSchemaService<br/>ToolRegistry"]
        SizingSchema["SizingSchemaService<br/>ToolRegistry"]
        OptimizerSchema["OptimizerSchemaService<br/>ToolRegistry"]
    end
    
    subgraph "Connection Services"
        StrategyConn["StrategyConnectionService<br/>Memoized ClientStrategy"]
        ExchangeConn["ExchangeConnectionService<br/>Memoized ClientExchange"]
        FrameConn["FrameConnectionService<br/>Memoized ClientFrame"]
        RiskConn["RiskConnectionService<br/>Memoized ClientRisk"]
        SizingConn["SizingConnectionService<br/>Memoized ClientSizing"]
        OptimizerConn["OptimizerConnectionService<br/>Memoized ClientOptimizer"]
    end
    
    User -->|"IStrategySchema"| AddStrategy
    User -->|"IExchangeSchema"| AddExchange
    User -->|"IFrameSchema"| AddFrame
    User -->|"IRiskSchema"| AddRisk
    User -->|"IWalkerSchema"| AddWalker
    User -->|"ISizingSchema"| AddSizing
    User -->|"IOptimizerSchema"| AddOptimizer
    
    AddStrategy --> StrategySchema
    AddExchange --> ExchangeSchema
    AddFrame --> FrameSchema
    AddRisk --> RiskSchema
    AddWalker --> WalkerSchema
    AddSizing --> SizingSchema
    AddOptimizer --> OptimizerSchema
    
    StrategyConn -.->|"reads"| StrategySchema
    ExchangeConn -.->|"reads"| ExchangeSchema
    FrameConn -.->|"reads"| FrameSchema
    RiskConn -.->|"reads"| RiskSchema
    SizingConn -.->|"reads"| SizingSchema
    OptimizerConn -.->|"reads"| OptimizerSchema
```

Sources: [types.d.ts:728-969](), [src/index.ts:10-18]()

**Schema Interface Categories**

| Category | Interface | Registered Via | Purpose |
|----------|-----------|----------------|---------|
| **Strategy** | `IStrategySchema` | `addStrategy()` | Defines signal generation logic and interval throttling |
| **Exchange** | `IExchangeSchema` | `addExchange()` | Defines candle data source and price/quantity formatting |
| **Frame** | `IFrameSchema` | `addFrame()` | Defines backtest time period and iteration interval |
| **Risk** | `IRiskSchema` | `addRisk()` | Defines portfolio-level risk validations |
| **Walker** | `IWalkerSchema` | `addWalker()` | Defines strategy comparison configuration |
| **Sizing** | `ISizingSchema` | `addSizing()` | Defines position sizing calculation method |
| **Optimizer** | `IOptimizerSchema` | `addOptimizer()` | Defines LLM-based strategy generation parameters |

Sources: [types.d.ts:728-969](), [src/index.ts:10-18]()

---

## IStrategySchema

Defines a trading strategy including signal generation logic, execution interval, and lifecycle callbacks. Registered via `addStrategy()` (see [Global Functions](./56_api-reference.md)).

**Interface Definition**

```typescript
interface IStrategySchema {
    strategyName: StrategyName;
    note?: string;
    interval: SignalInterval;
    getSignal: (symbol: string, when: Date) => Promise<ISignalDto | null>;
    callbacks?: Partial<IStrategyCallbacks>;
    riskName?: RiskName;
    riskList?: RiskName[];
}

type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
type StrategyName = string;
```

Sources: [types.d.ts:728-747](), [types.d.ts:645](), [types.d.ts:896]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `strategyName` | `StrategyName` | ✓ | Unique identifier for strategy registration and retrieval |
| `note` | `string` | ✗ | Optional documentation comment for developer reference |
| `interval` | `SignalInterval` | ✓ | Minimum time between `getSignal()` calls (throttling) |
| `getSignal` | `function` | ✓ | Signal generation function returning `ISignalDto` or `null` |
| `callbacks` | `Partial<IStrategyCallbacks>` | ✗ | Lifecycle event hooks (onOpen, onClose, onActive, etc.) |
| `riskName` | `RiskName` | ✗ | Single risk profile to apply before signal creation |
| `riskList` | `RiskName[]` | ✗ | Multiple risk profiles to merge and apply (alternative to `riskName`) |

Sources: [types.d.ts:728-747]()

**getSignal Function Contract**

The `getSignal` function is the core of strategy logic. It receives the current symbol and timestamp, and returns either a signal or `null`.

```typescript
getSignal: (symbol: string, when: Date) => Promise<ISignalDto | null>
```

- **Parameters:**
  - `symbol`: Trading pair (e.g., "BTCUSDT")
  - `when`: Current execution timestamp (ExecutionContext.when)
- **Returns:**
  - `ISignalDto` with `priceOpen` set: Creates **scheduled signal** waiting for price to reach entry
  - `ISignalDto` with `priceOpen` omitted: Creates **immediate signal** at current VWAP price
  - `null`: No signal generated (idle state)

Inside `getSignal`, use `getCandles()` to fetch historical data for analysis (see [Exchange Functions](./56_api-reference.md)).

Sources: [types.d.ts:740]()

**Signal Generation Flow**

```mermaid
graph TD
    Tick["ClientStrategy.tick()"]
    Throttle{"Throttled?<br/>interval check"}
    GetSignal["Call getSignal()<br/>user function"]
    Result{"Result?"}
    Validate["Multi-stage validation<br/>prices, TP/SL logic, distance"]
    RiskCheck{"Risk validation<br/>if riskName/riskList"}
    PriceOpen{"priceOpen<br/>provided?"}
    Scheduled["Create IScheduledSignalRow<br/>action: scheduled"]
    Opened["Create ISignalRow<br/>action: opened<br/>Persist to storage"]
    Idle["Return IStrategyTickResultIdle<br/>action: idle"]
    
    Tick --> Throttle
    Throttle -->|"Yes, skip"| Idle
    Throttle -->|"No, proceed"| GetSignal
    GetSignal --> Result
    Result -->|"null"| Idle
    Result -->|"ISignalDto"| Validate
    Validate --> RiskCheck
    RiskCheck -->|"Rejected"| Idle
    RiskCheck -->|"Allowed"| PriceOpen
    PriceOpen -->|"Yes"| Scheduled
    PriceOpen -->|"No, use VWAP"| Opened
```

Sources: [types.d.ts:728-747]()

**Strategy Callbacks**

The `IStrategyCallbacks` interface defines lifecycle hooks invoked during signal execution:

```typescript
interface IStrategyCallbacks {
    onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void;
    onOpen: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
    onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
    onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void;
    onClose: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => void;
    onSchedule: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
    onCancel: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
    onWrite: (symbol: string, data: ISignalRow | null, backtest: boolean) => void;
    onPartialProfit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void;
    onPartialLoss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void;
}
```

| Callback | When Called | Use Case |
|----------|-------------|----------|
| `onTick` | Every tick regardless of state | General monitoring, logging all ticks |
| `onOpen` | Signal activated at `priceOpen` | Track entry execution |
| `onActive` | Signal being monitored (TP/SL/time) | Track active position progress |
| `onIdle` | No active signal | Track idle periods |
| `onClose` | Signal closed (TP/SL/time_expired) | Track exit execution and PNL |
| `onSchedule` | Scheduled signal created | Track pending orders |
| `onCancel` | Scheduled signal cancelled | Track cancelled limit orders |
| `onWrite` | Signal persisted to storage | Testing persistence layer |
| `onPartialProfit` | Profit milestone reached (10%, 20%, etc.) | Track unrealized gains |
| `onPartialLoss` | Loss milestone reached (-10%, -20%, etc.) | Track unrealized losses |

Sources: [types.d.ts:702-723]()

**Example: Simple Moving Average Crossover Strategy**

```typescript
import { addStrategy, getCandles } from "backtest-kit";

addStrategy({
  strategyName: "ma-crossover",
  interval: "5m",
  
  getSignal: async (symbol, when) => {
    // Fetch last 50 candles at 1-hour interval
    const candles = await getCandles(symbol, "1h", 50);
    
    // Calculate 20-period and 50-period moving averages
    const ma20 = candles.slice(-20).reduce((sum, c) => sum + c.close, 0) / 20;
    const ma50 = candles.slice(-50).reduce((sum, c) => sum + c.close, 0) / 50;
    
    const currentPrice = candles[candles.length - 1].close;
    
    // Bullish crossover: MA20 > MA50
    if (ma20 > ma50) {
      return {
        position: "long",
        priceTakeProfit: currentPrice * 1.03,  // 3% profit target
        priceStopLoss: currentPrice * 0.98,     // 2% stop loss
        minuteEstimatedTime: 240,               // 4 hours max duration
        note: `MA20: ${ma20.toFixed(2)}, MA50: ${ma50.toFixed(2)}`
      };
    }
    
    return null;  // No signal
  },
  
  callbacks: {
    onOpen: (symbol, data, currentPrice) => {
      console.log(`[OPEN] ${symbol} at ${currentPrice}`);
    },
    onClose: (symbol, data, priceClose) => {
      console.log(`[CLOSE] ${symbol} at ${priceClose}`);
    }
  },
  
  riskName: "conservative"  // Apply risk validation
});
```

Sources: [types.d.ts:728-747]()

---

## IExchangeSchema

Defines a data source for market data including candle fetching and price/quantity formatting. Registered via `addExchange()`.

**Interface Definition**

```typescript
interface IExchangeSchema {
    exchangeName: ExchangeName;
    note?: string;
    getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>;
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    formatPrice: (symbol: string, price: number) => Promise<string>;
    callbacks?: Partial<IExchangeCallbacks>;
}

type ExchangeName = string;
type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h";

interface ICandleData {
    timestamp: number;  // Unix timestamp in milliseconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
```

Sources: [types.d.ts:122-155](), [types.d.ts:82](), [types.d.ts:87-100]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `exchangeName` | `ExchangeName` | ✓ | Unique identifier for exchange registration |
| `note` | `string` | ✗ | Optional documentation comment |
| `getCandles` | `function` | ✓ | Fetch historical OHLCV candles from data source |
| `formatQuantity` | `function` | ✓ | Format quantity according to exchange precision rules |
| `formatPrice` | `function` | ✓ | Format price according to exchange precision rules |
| `callbacks` | `Partial<IExchangeCallbacks>` | ✗ | Event hooks (onCandleData) |

Sources: [types.d.ts:122-155]()

**getCandles Function Contract**

```typescript
getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>
```

- **Parameters:**
  - `symbol`: Trading pair (e.g., "BTCUSDT")
  - `interval`: Candle timeframe ("1m", "5m", "1h", etc.)
  - `since`: Start date for candle fetching (inclusive)
  - `limit`: Maximum number of candles to return
- **Returns:** Array of `ICandleData` sorted by timestamp ascending
- **Requirements:**
  - Must return complete candles only (no partial candles)
  - Must detect and handle anomalous prices (validated by ClientExchange)
  - Should implement retry logic for API failures

Sources: [types.d.ts:136]()

**Data Flow: Exchange to VWAP Calculation**

```mermaid
graph LR
    User["getSignal() or tick()"]
    Global["getCandles() global function"]
    ExchConn["ExchangeConnectionService"]
    ClientExch["ClientExchange"]
    Schema["IExchangeSchema.getCandles()"]
    Buffer["Candle Buffer<br/>Last 5x 1m candles"]
    VWAP["VWAP Calculation<br/>Σ(typical price × volume) / Σ(volume)"]
    
    User -->|"calls"| Global
    Global --> ExchConn
    ExchConn -->|"routes by exchangeName"| ClientExch
    ClientExch -->|"invokes"| Schema
    Schema -->|"returns ICandleData[]"| ClientExch
    ClientExch --> Buffer
    Buffer --> VWAP
```

Sources: [types.d.ts:122-155]()

**Example: CCXT Integration**

```typescript
import { addExchange } from "backtest-kit";
import ccxt from "ccxt";

const exchange = new ccxt.binance();

addExchange({
  exchangeName: "binance",
  
  getCandles: async (symbol, interval, since, limit) => {
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));
  },
  
  formatQuantity: async (symbol, quantity) => {
    await exchange.loadMarkets();
    return exchange.amountToPrecision(symbol, quantity);
  },
  
  formatPrice: async (symbol, price) => {
    await exchange.loadMarkets();
    return exchange.priceToPrecision(symbol, price);
  },
  
  callbacks: {
    onCandleData: (symbol, interval, since, limit, data) => {
      console.log(`Fetched ${data.length} candles for ${symbol} ${interval}`);
    }
  }
});
```

Sources: [types.d.ts:122-155]()

---

## IFrameSchema

Defines a backtest time period and iteration interval for generating timeframes. Registered via `addFrame()`.

**Interface Definition**

```typescript
interface IFrameSchema {
    frameName: FrameName;
    note?: string;
    interval: FrameInterval;
    startDate: Date;
    endDate: Date;
    callbacks?: Partial<IFrameCallbacks>;
}

type FrameName = string;
type FrameInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d";
```

Sources: [types.d.ts:262-275](), [types.d.ts:219]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `frameName` | `FrameName` | ✓ | Unique identifier for frame registration |
| `note` | `string` | ✗ | Optional documentation comment |
| `interval` | `FrameInterval` | ✓ | Spacing between generated timestamps |
| `startDate` | `Date` | ✓ | Beginning of backtest period (inclusive) |
| `endDate` | `Date` | ✓ | End of backtest period (inclusive) |
| `callbacks` | `Partial<IFrameCallbacks>` | ✗ | Event hooks (onTimeframe) |

Sources: [types.d.ts:262-275]()

**Timeframe Generation**

ClientFrame generates an array of `Date` objects from `startDate` to `endDate` spaced by `interval`. BacktestLogicPrivateService iterates through these timestamps, setting `ExecutionContext.when` for each tick.

```mermaid
graph LR
    Frame["IFrameSchema<br/>startDate: 2024-01-01<br/>endDate: 2024-01-02<br/>interval: 1m"]
    Generate["ClientFrame.getTimeframe()"]
    Timeframe["Date[]<br/>1440 timestamps<br/>spaced 1 minute apart"]
    Backtest["BacktestLogicPrivateService"]
    Loop["for each timestamp:<br/>ExecutionContext.when = timestamp<br/>StrategyCore.tick()"]
    
    Frame --> Generate
    Generate --> Timeframe
    Timeframe --> Backtest
    Backtest --> Loop
```

Sources: [types.d.ts:262-275]()

**Example: Multiple Time Ranges**

```typescript
import { addFrame } from "backtest-kit";

// Short-term test (1 day, 1-minute granularity)
addFrame({
  frameName: "1d-test",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
  note: "Quick test with high resolution"
});

// Medium-term backtest (1 month, 5-minute granularity)
addFrame({
  frameName: "1m-backtest",
  interval: "5m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-02-01T00:00:00Z"),
  note: "Standard backtest period"
});

// Long-term analysis (1 year, 1-hour granularity)
addFrame({
  frameName: "1y-analysis",
  interval: "1h",
  startDate: new Date("2023-01-01T00:00:00Z"),
  endDate: new Date("2024-01-01T00:00:00Z"),
  note: "Long-term performance evaluation"
});
```

Sources: [types.d.ts:262-275]()

---

## IRiskSchema

Defines portfolio-level risk validation rules applied before signal creation. Registered via `addRisk()`.

**Interface Definition**

```typescript
interface IRiskSchema {
    riskName: RiskName;
    note?: string;
    callbacks?: Partial<IRiskCallbacks>;
    validations: (IRiskValidation | IRiskValidationFn)[];
}

type RiskName = string;

interface IRiskValidation {
    validate: IRiskValidationFn;
    note?: string;
}

interface IRiskValidationFn {
    (payload: IRiskValidationPayload): void | Promise<void>;
}

interface IRiskValidationPayload extends IRiskCheckArgs {
    pendingSignal: ISignalDto;
    activePositionCount: number;
    activePositions: IRiskActivePosition[];
}
```

Sources: [types.d.ts:417-426](), [types.d.ts:395-411]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `riskName` | `RiskName` | ✓ | Unique identifier for risk profile registration |
| `note` | `string` | ✗ | Optional documentation comment |
| `callbacks` | `Partial<IRiskCallbacks>` | ✗ | Event hooks (onRejected, onAllowed) |
| `validations` | Array | ✓ | Validation functions or objects with `validate` function and `note` |

Sources: [types.d.ts:417-426]()

**Validation Function Contract**

```typescript
interface IRiskValidationFn {
    (payload: IRiskValidationPayload): void | Promise<void>;
}
```

Validation functions receive a payload with:
- `symbol`: Trading pair
- `pendingSignal`: The signal to validate
- `strategyName`: Strategy requesting the signal
- `exchangeName`: Exchange name
- `currentPrice`: Current VWAP price
- `timestamp`: Current timestamp
- `activePositionCount`: Number of currently open positions
- `activePositions`: Array of active position details

**Validation behavior:**
- **Throw error**: Signal is rejected, `riskSubject` emits rejection event
- **Return void**: Signal is allowed to proceed

Sources: [types.d.ts:395-411]()

**Risk Validation Pipeline**

```mermaid
graph TD
    GetSignal["getSignal() returns ISignalDto"]
    Validate["Multi-stage validation<br/>GLOBAL_CONFIG checks"]
    HasRisk{"riskName or<br/>riskList?"}
    RiskConn["RiskConnectionService"]
    ClientRisk["ClientRisk or MergeRisk"]
    Loop["For each validation function"]
    Execute["Execute validation(payload)"]
    Throws{"Throws error?"}
    Reject["Emit riskSubject<br/>Return action: idle"]
    Allow["Proceed to signal creation"]
    
    GetSignal --> Validate
    Validate --> HasRisk
    HasRisk -->|"No"| Allow
    HasRisk -->|"Yes"| RiskConn
    RiskConn --> ClientRisk
    ClientRisk --> Loop
    Loop --> Execute
    Execute --> Throws
    Throws -->|"Yes"| Reject
    Throws -->|"No, continue"| Loop
    Loop -->|"All passed"| Allow
```

Sources: [types.d.ts:417-426]()

**Example: Conservative Risk Profile**

```typescript
import { addRisk } from "backtest-kit";

addRisk({
  riskName: "conservative",
  note: "Max 3 concurrent positions, no crypto pairs during weekends",
  
  validations: [
    // Validation 1: Maximum concurrent positions
    {
      validate: (payload) => {
        if (payload.activePositionCount >= 3) {
          throw new Error(`Max 3 concurrent positions (current: ${payload.activePositionCount})`);
        }
      },
      note: "Limit portfolio exposure"
    },
    
    // Validation 2: No crypto trading on weekends
    {
      validate: (payload) => {
        const day = new Date(payload.timestamp).getDay();
        const isWeekend = day === 0 || day === 6;
        if (isWeekend && payload.symbol.includes("USD")) {
          throw new Error("No crypto trading on weekends");
        }
      },
      note: "Reduce weekend volatility exposure"
    },
    
    // Validation 3: No overlapping symbols
    {
      validate: (payload) => {
        const hasSymbol = payload.activePositions.some(pos => pos.signal.symbol === payload.symbol);
        if (hasSymbol) {
          throw new Error(`Already have active position for ${payload.symbol}`);
        }
      },
      note: "One position per symbol"
    }
  ],
  
  callbacks: {
    onRejected: (symbol, params) => {
      console.log(`[RISK REJECTED] ${symbol}: ${params.strategyName}`);
    }
  }
});
```

Sources: [types.d.ts:417-426]()

**MergeRisk Pattern**

When a strategy specifies `riskList` instead of `riskName`, the system creates a `MergeRisk` instance that combines multiple risk profiles. All validations from all profiles must pass.

```typescript
addStrategy({
  strategyName: "aggressive-strategy",
  riskList: ["conservative", "volatility-filter", "drawdown-limit"],
  // ... other properties
});
```

Sources: [types.d.ts:746]()

---

## IWalkerSchema

Defines a strategy comparison configuration for A/B testing multiple strategies. Registered via `addWalker()`.

**Interface Definition**

```typescript
interface IWalkerSchema {
    walkerName: WalkerName;
    note?: string;
    exchangeName: ExchangeName;
    frameName: FrameName;
    strategies: StrategyName[];
    metric?: WalkerMetric;
    callbacks?: Partial<IWalkerCallbacks>;
}

type WalkerName = string;
type WalkerMetric = "sharpeRatio" | "annualizedSharpeRatio" | "winRate" | "totalPnl" | "certaintyRatio" | "avgPnl" | "expectedYearlyReturns";
```

Sources: [types.d.ts:954-969](), [types.d.ts:949]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `walkerName` | `WalkerName` | ✓ | Unique identifier for walker registration |
| `note` | `string` | ✗ | Optional documentation comment |
| `exchangeName` | `ExchangeName` | ✓ | Exchange to use for all strategy backtests |
| `frameName` | `FrameName` | ✓ | Timeframe to use for all strategy backtests |
| `strategies` | `StrategyName[]` | ✓ | List of strategy names to compare |
| `metric` | `WalkerMetric` | ✗ | Optimization metric (default: "sharpeRatio") |
| `callbacks` | `Partial<IWalkerCallbacks>` | ✗ | Event hooks (onStrategyStart, onStrategyComplete) |

Sources: [types.d.ts:954-969]()

**Walker Execution Flow**

```mermaid
graph TD
    WalkerRun["Walker.run(symbol, { walkerName })"]
    LoadSchema["Load IWalkerSchema"]
    Init["best = null<br/>results = []"]
    Loop["For each strategy in strategies"]
    RunBacktest["Backtest.run(symbol, {<br/>strategyName,<br/>exchangeName,<br/>frameName<br/>})"]
    GetStats["BacktestMarkdownService.getData()"]
    Extract["Extract metric value<br/>e.g., stats.sharpeRatio"]
    Compare{"metric > best?"}
    UpdateBest["best = metric<br/>bestStrategy = strategyName"]
    Emit["Emit walkerEmitter<br/>with progress"]
    Done["Emit walkerCompleteSubject<br/>Return IWalkerResults"]
    
    WalkerRun --> LoadSchema
    LoadSchema --> Init
    Init --> Loop
    Loop --> RunBacktest
    RunBacktest --> GetStats
    GetStats --> Extract
    Extract --> Compare
    Compare -->|"Yes"| UpdateBest
    Compare -->|"No"| Emit
    UpdateBest --> Emit
    Emit --> Loop
    Loop -->|"All complete"| Done
```

Sources: [types.d.ts:954-969]()

**Optimization Metrics**

| Metric | Formula / Description | Higher is Better |
|--------|----------------------|------------------|
| `sharpeRatio` | `avgPnl / stdDev` | ✓ |
| `annualizedSharpeRatio` | `sharpeRatio × √365` | ✓ |
| `winRate` | `(winCount / totalSignals) × 100` | ✓ |
| `totalPnl` | `Σ(pnlPercentage)` | ✓ |
| `certaintyRatio` | `avgWin / \|avgLoss\|` | ✓ |
| `avgPnl` | `totalPnl / totalSignals` | ✓ |
| `expectedYearlyReturns` | Based on avg trade duration and PNL | ✓ |

Sources: [types.d.ts:949]()

**Example: Strategy Comparison**

```typescript
import { addWalker } from "backtest-kit";

addWalker({
  walkerName: "ma-comparison",
  exchangeName: "binance",
  frameName: "1m-backtest",
  
  strategies: [
    "ma-crossover-fast",   // 10/20 MA
    "ma-crossover-slow",   // 20/50 MA
    "ma-crossover-ultra",  // 50/200 MA
  ],
  
  metric: "sharpeRatio",  // Optimize for risk-adjusted returns
  
  callbacks: {
    onStrategyStart: (strategyName, symbol) => {
      console.log(`Testing ${strategyName} on ${symbol}...`);
    },
    
    onStrategyComplete: (strategyName, symbol, stats, metric) => {
      console.log(`${strategyName}: Sharpe Ratio = ${metric}`);
    }
  }
});

// Run comparison
const results = await Walker.run("BTCUSDT", { walkerName: "ma-comparison" });
console.log(`Best strategy: ${results.bestStrategy} (${results.bestMetric})`);
```

Sources: [types.d.ts:954-969]()

---

## ISizingSchema

Defines position sizing calculation methods. Registered via `addSizing()`. Three sizing strategies are supported: fixed percentage, Kelly Criterion, and ATR-based.

**Base Interface**

```typescript
interface ISizingSchemaBase {
    sizingName: SizingName;
    note?: string;
    callbacks?: Partial<ISizingCallbacks>;
}

type SizingName = string;
```

**Fixed Percentage Sizing**

```typescript
interface ISizingSchemaFixedPercentage extends ISizingSchemaBase {
    strategy: "fixed-percentage";
    params: IPositionSizeFixedPercentageParams;
}

interface IPositionSizeFixedPercentageParams {
    portfolioPercent: number;  // Percentage of portfolio to risk per trade (e.g., 2 = 2%)
}
```

**Kelly Criterion Sizing**

```typescript
interface ISizingSchemaKelly extends ISizingSchemaBase {
    strategy: "kelly";
    params: IPositionSizeKellyParams;
}

interface IPositionSizeKellyParams {
    winRate: number;           // Historical win rate (0-1, e.g., 0.55 = 55%)
    avgWinPercent: number;     // Average win percentage
    avgLossPercent: number;    // Average loss percentage
    kellyFraction?: number;    // Fraction of Kelly to use (default: 0.5 for half-Kelly)
}
```

**ATR-Based Sizing**

```typescript
interface ISizingSchemaATR extends ISizingSchemaBase {
    strategy: "atr";
    params: IPositionSizeATRParams;
}

interface IPositionSizeATRParams {
    atrMultiplier: number;     // Stop loss distance in ATR units (e.g., 2 = 2×ATR)
    riskPercent: number;       // Percentage of portfolio to risk (e.g., 1 = 1%)
}
```

**Example: Multiple Sizing Profiles**

```typescript
import { addSizing } from "backtest-kit";

// Conservative fixed percentage
addSizing({
  sizingName: "conservative",
  strategy: "fixed-percentage",
  params: {
    portfolioPercent: 1  // Risk 1% per trade
  }
});

// Aggressive Kelly Criterion
addSizing({
  sizingName: "kelly-aggressive",
  strategy: "kelly",
  params: {
    winRate: 0.58,
    avgWinPercent: 3.2,
    avgLossPercent: 1.8,
    kellyFraction: 0.75  // Use 75% of full Kelly
  }
});

// Volatility-based ATR sizing
addSizing({
  sizingName: "atr-adaptive",
  strategy: "atr",
  params: {
    atrMultiplier: 2,   // Stop loss at 2×ATR
    riskPercent: 2      // Risk 2% per trade
  }
});
```

Sources: Referenced in [src/index.ts:93-103]()

---

## IOptimizerSchema

Defines configuration for LLM-powered strategy generation. Registered via `addOptimizer()`.

**Interface Definition**

```typescript
interface IOptimizerSchema {
    optimizerName: OptimizerName;
    note?: string;
    sources: IOptimizerSource[];
    prompt: string;
    template?: IOptimizerTemplate;
    callbacks?: Partial<IOptimizerCallbacks>;
}

type OptimizerName = string;

interface IOptimizerSource {
    exchangeName: ExchangeName;
    frameName: FrameName;
    walkerName?: WalkerName;
    strategies: IOptimizerStrategy[];
}

interface IOptimizerStrategy {
    strategyName: StrategyName;
    range?: IOptimizerRange;
    filter?: (args: IOptimizerFilterArgs) => boolean;
}
```

Sources: Referenced in [src/index.ts:124-134]()

**Property Reference**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `optimizerName` | `OptimizerName` | ✓ | Unique identifier for optimizer registration |
| `note` | `string` | ✗ | Optional documentation comment |
| `sources` | `IOptimizerSource[]` | ✓ | Data sources (backtest results) to analyze |
| `prompt` | `string` | ✓ | System prompt for LLM strategy generation |
| `template` | `IOptimizerTemplate` | ✗ | Custom code generation template (default: OptimizerTemplateService) |
| `callbacks` | `Partial<IOptimizerCallbacks>` | ✗ | Event hooks (onDataFetch, onGenerate, onSave) |

**Optimizer Data Flow**

```mermaid
graph TD
    OptimizerRun["Optimizer.run(symbol, { optimizerName })"]
    LoadSchema["Load IOptimizerSchema"]
    FetchData["For each source:<br/>Backtest.run()<br/>Collect stats"]
    Aggregate["Aggregate data<br/>IOptimizerData[]"]
    LLM["Call Ollama LLM<br/>deepseek-v3.1:671b<br/>with prompt + data"]
    Response["LLM returns<br/>strategy code"]
    Template["OptimizerTemplateService<br/>Wrap in executable template"]
    SaveFile["Save to .mjs file<br/>./dump/optimizer/"]
    
    OptimizerRun --> LoadSchema
    LoadSchema --> FetchData
    FetchData --> Aggregate
    Aggregate --> LLM
    LLM --> Response
    Response --> Template
    Template --> SaveFile
```

Sources: Referenced in [src/index.ts:124-134]()

**Example: Strategy Evolution**

```typescript
import { addOptimizer } from "backtest-kit";

addOptimizer({
  optimizerName: "evolve-ma-strategy",
  
  sources: [
    {
      exchangeName: "binance",
      frameName: "1m-backtest",
      strategies: [
        { strategyName: "ma-crossover-fast" },
        { strategyName: "ma-crossover-slow" },
        { strategyName: "ma-crossover-ultra" }
      ]
    }
  ],
  
  prompt: `
    Analyze the provided moving average crossover strategies.
    Generate an improved version that combines the best characteristics.
    
    Requirements:
    - Use multiple timeframe analysis
    - Add volume confirmation
    - Implement dynamic take profit based on volatility
    - Return a complete strategy implementation
  `,
  
  callbacks: {
    onDataFetch: (data) => {
      console.log(`Fetched ${data.length} strategy results`);
    },
    onGenerate: (code) => {
      console.log(`Generated ${code.length} characters of code`);
    },
    onSave: (filepath) => {
      console.log(`Saved to ${filepath}`);
    }
  }
});
```

Sources: Referenced in [src/index.ts:124-134]()

---

## Schema Interface Relationships

**Type Hierarchy**

```mermaid
graph TB
    subgraph "Schema Interfaces"
        Strategy["IStrategySchema<br/>Signal generation"]
        Exchange["IExchangeSchema<br/>Data source"]
        Frame["IFrameSchema<br/>Timeframe"]
        Risk["IRiskSchema<br/>Validation"]
        Walker["IWalkerSchema<br/>Comparison"]
        Sizing["ISizingSchema<br/>Position size"]
        Optimizer["IOptimizerSchema<br/>LLM generation"]
    end
    
    subgraph "Core Types"
        SignalDto["ISignalDto"]
        SignalRow["ISignalRow"]
        TickResult["IStrategyTickResult"]
        Candle["ICandleData"]
        Stats["BacktestStatisticsModel"]
    end
    
    subgraph "Context Services"
        ExecCtx["ExecutionContext<br/>symbol, when, backtest"]
        MethodCtx["MethodContext<br/>strategyName, exchangeName, frameName"]
    end
    
    Strategy -->|"returns"| SignalDto
    Strategy -->|"references"| Risk
    Strategy -->|"uses"| Exchange
    
    Exchange -->|"returns"| Candle
    
    Frame -->|"sets"| ExecCtx
    
    Walker -->|"tests"| Strategy
    Walker -->|"uses"| Exchange
    Walker -->|"uses"| Frame
    Walker -->|"produces"| Stats
    
    Optimizer -->|"analyzes"| Stats
    Optimizer -->|"generates"| Strategy
    
    MethodCtx -->|"identifies"| Strategy
    MethodCtx -->|"identifies"| Exchange
    MethodCtx -->|"identifies"| Frame
    
    SignalDto -->|"validated to"| SignalRow
    SignalRow -->|"wrapped in"| TickResult
```

Sources: [types.d.ts:11-969]()

**Registration and Retrieval Pattern**

All schemas follow a consistent pattern:

```mermaid
graph LR
    Register["add*() function"]
    Validate["*ValidationService<br/>Check for duplicates"]
    Store["*SchemaService<br/>ToolRegistry storage"]
    Retrieve["*ConnectionService<br/>Memoized factory"]
    Client["Client*<br/>Implementation"]
    
    Register --> Validate
    Validate --> Store
    Store --> Retrieve
    Retrieve --> Client
```

| Step | Strategy | Exchange | Frame | Risk | Walker | Sizing | Optimizer |
|------|----------|----------|-------|------|--------|--------|-----------|
| **Register** | `addStrategy()` | `addExchange()` | `addFrame()` | `addRisk()` | `addWalker()` | `addSizing()` | `addOptimizer()` |
| **Validate** | `StrategyValidationService` | `ExchangeValidationService` | `FrameValidationService` | `RiskValidationService` | `WalkerValidationService` | `SizingValidationService` | `OptimizerValidationService` |
| **Store** | `StrategySchemaService` | `ExchangeSchemaService` | `FrameSchemaService` | `RiskSchemaService` | `WalkerSchemaService` | `SizingSchemaService` | `OptimizerSchemaService` |
| **Connect** | `StrategyConnectionService` | `ExchangeConnectionService` | `FrameConnectionService` | `RiskConnectionService` | — | `SizingConnectionService` | `OptimizerConnectionService` |
| **Client** | `ClientStrategy` | `ClientExchange` | `ClientFrame` | `ClientRisk` | — | `ClientSizing` | `ClientOptimizer` |

Sources: [src/index.ts:10-18](), [types.d.ts:728-969]()

---

## Related Pages

- **[Global Functions](./56_api-reference.md)**: `addStrategy()`, `addExchange()`, and other registration functions
- **[Execution Classes API](./56_api-reference.md)**: `Backtest`, `Live`, `Walker` classes that consume these schemas
- **[Signal & Result Types](./56_api-reference.md)**: `ISignalDto`, `ISignalRow`, `IStrategyTickResult` interfaces
- **[Statistics & Contract Types](./56_api-reference.md)**: Result models and event contracts
- **[Service Layer Interfaces](./56_api-reference.md)**: Internal service interfaces for advanced usage

Sources: [types.d.ts:1-969](), [src/index.ts:1-199]()