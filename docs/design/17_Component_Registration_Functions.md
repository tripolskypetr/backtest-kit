# Component Registration Functions

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
- [src/function/add.ts](src/function/add.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)

</details>



## Purpose and Scope

This page documents the public API functions used to register components in backtest-kit. These functions (`addStrategy`, `addExchange`, `addFrame`, `addRisk`, `addSizing`, `addWalker`, `addOptimizer`) provide the primary interface for configuring trading strategies, data sources, risk management, and optimization workflows.

For detailed schema interface definitions, see [Component Schemas](#5). For information about the registration pattern and schema storage mechanism, see [Component Registration](#2.3). For the underlying schema service implementations, see [Schema Services](#7.3).

**Sources:** [src/function/add.ts:1-445]()

---

## Registration Flow Architecture

All component registration functions follow a uniform three-step pattern: logging, validation, and schema storage. This ensures consistent behavior and error handling across all component types.

### Common Registration Pattern

```mermaid
graph TB
    USER["User Code<br/>add* function call"]
    LOGGER["LoggerService<br/>loggerService.info()"]
    VALIDATOR["Validation Service<br/>*ValidationService.add*()"]
    SCHEMA["Schema Service<br/>*SchemaService.register()"]
    REGISTRY["ToolRegistry<br/>In-memory storage"]
    
    USER -->|"1. Call with schema"| LOGGER
    LOGGER -->|"2. Log method name + schema"| VALIDATOR
    VALIDATOR -->|"3. Validate schema structure"| SCHEMA
    SCHEMA -->|"4. Store in registry"| REGISTRY
    
    VALIDATOR -.->|"Throws error if invalid"| ERROR["Error emitted<br/>errorEmitter"]
    
    note1["Example: addStrategy()"]
    note2["All add* functions use<br/>identical flow"]
    
    USER -.-> note1
    note1 -.-> note2
```

**Sources:** [src/function/add.ts:52-64](), [src/function/add.ts:101-113](), [src/lib/index.ts:1-246]()

---

## Component Registration Functions

### addStrategy

Registers a trading strategy that generates signals at specified intervals. Strategies are validated for signal correctness, interval throttling, and persistence configuration.

**Function Signature:**
```typescript
function addStrategy(strategySchema: IStrategySchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `strategySchema.strategyName` | `string` | Unique identifier for the strategy |
| `strategySchema.interval` | `"1m" \| "3m" \| "5m" \| "15m" \| "30m" \| "1h"` | Signal generation interval (throttling) |
| `strategySchema.getSignal` | `(symbol: string) => Promise<ISignalDto>` | Async function that generates trading signals |
| `strategySchema.riskName` | `string` (optional) | Single risk profile to apply |
| `strategySchema.riskList` | `string[]` (optional) | Multiple risk profiles (all must pass) |
| `strategySchema.callbacks` | `IStrategyCallbacks` (optional) | Lifecycle event handlers |

**Registration Flow:**

```mermaid
sequenceDiagram
    participant U as User Code
    participant AS as addStrategy
    participant SV as StrategyValidationService
    participant SS as StrategySchemaService
    participant TR as ToolRegistry

    U->>AS: addStrategy(strategySchema)
    AS->>SV: addStrategy(name, schema)
    SV->>SV: Validate interval
    SV->>SV: Validate getSignal function
    SV->>SV: Validate riskName/riskList
    SV->>SV: Validate callbacks structure
    SV-->>AS: Validation passed
    AS->>SS: register(name, schema)
    SS->>TR: Store schema by name
    TR-->>SS: Stored
    SS-->>AS: Registered
    AS-->>U: Complete
```

**Usage Example:**
```typescript
addStrategy({
  strategyName: "test_strategy",
  interval: "5m",
  riskName: "demo_risk",
  getSignal: async (symbol) => ({
    position: "long",
    priceOpen: 50000,
    priceTakeProfit: 51000,
    priceStopLoss: 49000,
    minuteEstimatedTime: 60,
    timestamp: Date.now(),
  }),
  callbacks: {
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log("Position opened");
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log("Position closed");
    },
  },
});
```

**Validation Performed:**
- Strategy name uniqueness
- Valid interval value
- `getSignal` is an async function
- Either `riskName` or `riskList` provided (not both)
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:52-64](), [demo/backtest/src/index.mjs:91-107](), [demo/live/src/index.mjs:87-103]()

---

### addExchange

Registers an exchange data source that provides candle data and price formatting. Exchanges must implement temporal isolation to prevent look-ahead bias in backtesting.

**Function Signature:**
```typescript
function addExchange(exchangeSchema: IExchangeSchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `exchangeSchema.exchangeName` | `string` | Unique identifier for the exchange |
| `exchangeSchema.getCandles` | `(symbol: string, interval: string, since: Date, limit: number) => Promise<ICandle[]>` | Fetches historical candle data |
| `exchangeSchema.formatPrice` | `(symbol: string, price: number) => Promise<string>` | Formats prices for display |
| `exchangeSchema.formatQuantity` | `(symbol: string, quantity: number) => Promise<string>` | Formats quantities for display |
| `exchangeSchema.callbacks` | `IExchangeCallbacks` (optional) | Event handlers for candle fetching |

**Integration with CCXT:**

```mermaid
graph LR
    AE["addExchange()<br/>Registration"]
    GC["getCandles()<br/>User implementation"]
    CCXT["ccxt.binance()<br/>Exchange API"]
    OHLCV["fetchOHLCV()<br/>Raw data"]
    MAP["Array.map()<br/>Transform to ICandle"]
    
    AE -->|"Stores"| GC
    GC -->|"1. Create instance"| CCXT
    CCXT -->|"2. Fetch OHLCV"| OHLCV
    OHLCV -->|"3. Transform"| MAP
    MAP -->|"4. Return ICandle[]"| GC
    
    note["Format: [timestamp, open,<br/>high, low, close, volume]"]
    OHLCV -.-> note
```

**Usage Example:**
```typescript
addExchange({
  exchangeName: "test_exchange",
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
  formatPrice: async (symbol, price) => price.toFixed(2),
  formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
});
```

**Validation Performed:**
- Exchange name uniqueness
- `getCandles` is an async function
- `formatPrice` is an async function
- `formatQuantity` is an async function
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:101-113](), [demo/backtest/src/index.mjs:24-35](), [demo/live/src/index.mjs:24-35]()

---

### addFrame

Registers a timeframe generator for backtesting. Frames define the start/end dates and interval for historical simulation.

**Function Signature:**
```typescript
function addFrame(frameSchema: IFrameSchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `frameSchema.frameName` | `string` | Unique identifier for the frame |
| `frameSchema.interval` | `string` | Timeframe generation interval (`"1m"`, `"5m"`, `"1h"`, `"1d"`, etc.) |
| `frameSchema.startDate` | `Date` | Beginning of backtest period |
| `frameSchema.endDate` | `Date` | End of backtest period |
| `frameSchema.callbacks` | `IFrameCallbacks` (optional) | Event handlers for timeframe generation |

**Timeframe Generation Flow:**

```mermaid
graph TB
    AF["addFrame()<br/>frameName: test_frame"]
    FCS["FrameCoreService<br/>generateTimeframe()"]
    START["startDate<br/>2025-12-01 00:00:00"]
    END["endDate<br/>2025-12-01 23:59:59"]
    INTERVAL["interval: 1m"]
    
    TF["Timeframe Array<br/>[timestamp1, timestamp2, ...]"]
    
    AF -->|"Stores schema"| FCS
    FCS -->|"Uses"| START
    FCS -->|"Uses"| END
    FCS -->|"Uses"| INTERVAL
    
    FCS -->|"Generates"| TF
    
    note["Each timestamp is 1 minute apart<br/>Total: 1440 timeframes (24h)"]
    TF -.-> note
```

**Usage Example:**
```typescript
addFrame({
  frameName: "test_frame",
  interval: "1m",
  startDate: new Date("2025-12-01T00:00:00.000Z"),
  endDate: new Date("2025-12-01T23:59:59.000Z"),
  callbacks: {
    onTimeframe: (timeframe, startDate, endDate, interval) => {
      console.log(`Generated ${timeframe.length} timeframes`);
    },
  },
});
```

**Validation Performed:**
- Frame name uniqueness
- Valid interval format
- `startDate` is before `endDate`
- Dates are valid Date objects
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:145-151](), [demo/backtest/src/index.mjs:84-89](), [demo/live/src/index.mjs:80-85]()

---

### addRisk

Registers a risk management profile with portfolio-level constraints and custom validation functions. Risk profiles are shared across multiple strategies.

**Function Signature:**
```typescript
function addRisk(riskSchema: IRiskSchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `riskSchema.riskName` | `string` | Unique identifier for risk profile |
| `riskSchema.maxConcurrentPositions` | `number` (optional) | Maximum open positions across all strategies |
| `riskSchema.validations` | `IRiskValidation[]` (optional) | Custom validation functions |
| `riskSchema.callbacks` | `IRiskCallbacks` (optional) | Event handlers for risk events |

**Risk Validation Structure:**

```mermaid
graph TB
    AR["addRisk()<br/>riskName: demo_risk"]
    VAL1["Validation 1<br/>TP distance >= 1%"]
    VAL2["Validation 2<br/>RR ratio >= 2:1"]
    VAL3["Validation 3<br/>Max concurrent positions"]
    
    CS["ClientStrategy<br/>getSignal()"]
    CR["ClientRisk<br/>checkSignal()"]
    
    AR -->|"Stores"| VAL1
    AR -->|"Stores"| VAL2
    AR -->|"Stores"| VAL3
    
    CS -->|"1. Generate signal"| CR
    CR -->|"2. Validate"| VAL1
    VAL1 -->|"3. If pass"| VAL2
    VAL2 -->|"4. If pass"| VAL3
    VAL3 -->|"5. If pass"| ALLOW["Signal allowed"]
    
    VAL1 -.->|"Throw error"| REJECT["Signal rejected"]
    VAL2 -.->|"Throw error"| REJECT
    VAL3 -.->|"Throw error"| REJECT
```

**IRiskValidation Types:**

| Type | Structure | Description |
|------|-----------|-------------|
| Function | `(payload: IRiskValidationPayload) => void \| Promise<void>` | Inline validation function |
| Object | `{ validate: Function, note?: string }` | Validation with documentation |

**Usage Example:**
```typescript
addRisk({
  riskName: "demo_risk",
  maxConcurrentPositions: 5,
  validations: [
    {
      validate: ({ pendingSignal, currentPrice }) => {
        const { priceOpen = currentPrice, priceTakeProfit, position } = pendingSignal;
        const tpDistance = position === "long"
          ? ((priceTakeProfit - priceOpen) / priceOpen) * 100
          : ((priceOpen - priceTakeProfit) / priceOpen) * 100;
        if (tpDistance < 1) {
          throw new Error(`TP distance ${tpDistance.toFixed(2)}% < 1%`);
        }
      },
      note: "TP distance must be at least 1%",
    },
    ({ pendingSignal, currentPrice }) => {
      const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
      const reward = position === "long"
        ? priceTakeProfit - priceOpen
        : priceOpen - priceTakeProfit;
      const risk = position === "long"
        ? priceOpen - priceStopLoss
        : priceStopLoss - priceOpen;
      const rrRatio = reward / risk;
      if (rrRatio < 2) {
        throw new Error(`RR ratio ${rrRatio.toFixed(2)} < 2:1`);
      }
    },
  ],
  callbacks: {
    onRejected: (symbol, reason, limit, params) => {
      console.log(`[RISK] Signal rejected: ${reason}`);
    },
    onAllowed: (symbol, params) => {
      console.log(`[RISK] Signal allowed`);
    },
  },
});
```

**Validation Performed:**
- Risk name uniqueness
- `maxConcurrentPositions` is positive integer (if provided)
- Validation functions have correct signatures
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:331-343](), [demo/backtest/src/index.mjs:37-82](), [demo/live/src/index.mjs:37-78]()

---

### addSizing

Registers a position sizing configuration. Sizing schemas are discriminated unions based on the `method` field.

**Function Signature:**
```typescript
function addSizing(sizingSchema: ISizingSchema): void
```

**Discriminated Union Structure:**

```mermaid
graph TB
    AS["addSizing()<br/>sizingSchema"]
    
    METHOD{"method field"}
    
    FIXED["fixed-percentage<br/>riskPercentage"]
    KELLY["kelly-criterion<br/>kellyMultiplier"]
    ATR["atr-based<br/>riskPercentage + atrMultiplier"]
    
    COMMON["Common fields:<br/>sizingName<br/>maxPositionPercentage<br/>minPositionSize<br/>maxPositionSize<br/>callbacks"]
    
    AS --> METHOD
    METHOD -->|"fixed-percentage"| FIXED
    METHOD -->|"kelly-criterion"| KELLY
    METHOD -->|"atr-based"| ATR
    
    FIXED --> COMMON
    KELLY --> COMMON
    ATR --> COMMON
```

**Parameters by Method:**

| Method | Required Fields | Optional Fields |
|--------|----------------|-----------------|
| `fixed-percentage` | `sizingName`, `method`, `riskPercentage` | `maxPositionPercentage`, `minPositionSize`, `maxPositionSize`, `callbacks` |
| `kelly-criterion` | `sizingName`, `method` | `kellyMultiplier` (default: 0.25), `maxPositionPercentage`, `minPositionSize`, `maxPositionSize`, `callbacks` |
| `atr-based` | `sizingName`, `method`, `riskPercentage` | `atrMultiplier` (default: 2), `maxPositionPercentage`, `minPositionSize`, `maxPositionSize`, `callbacks` |

**Usage Example:**
```typescript
// Fixed percentage sizing
addSizing({
  sizingName: "conservative",
  method: "fixed-percentage",
  riskPercentage: 1,
  maxPositionPercentage: 10,
  minPositionSize: 0.001,
});

// Kelly Criterion sizing
addSizing({
  sizingName: "kelly",
  method: "kelly-criterion",
  kellyMultiplier: 0.25,
  maxPositionPercentage: 20,
});

// ATR-based sizing
addSizing({
  sizingName: "atr-dynamic",
  method: "atr-based",
  riskPercentage: 2,
  atrMultiplier: 2,
  callbacks: {
    onCalculate: (quantity, params) => {
      console.log(`Calculated size: ${quantity}`);
    },
  },
});
```

**Validation Performed:**
- Sizing name uniqueness
- Valid method value
- Method-specific required fields present
- Numeric fields are positive
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:256-268]()

---

### addWalker

Registers a walker configuration for comparing multiple strategies on the same historical data. Walkers orchestrate sequential backtests and rank results by a specified metric.

**Function Signature:**
```typescript
function addWalker(walkerSchema: IWalkerSchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `walkerSchema.walkerName` | `string` | Unique identifier for walker |
| `walkerSchema.exchangeName` | `string` | Exchange to use for all strategies |
| `walkerSchema.frameName` | `string` | Timeframe to use for all strategies |
| `walkerSchema.strategies` | `string[]` | Array of strategy names to compare |
| `walkerSchema.metric` | `string` (optional) | Metric for ranking (default: `"sharpeRatio"`) |
| `walkerSchema.callbacks` | `IWalkerCallbacks` (optional) | Event handlers for walker progress |

**Walker Execution Flow:**

```mermaid
sequenceDiagram
    participant U as User Code
    participant W as Walker.run()
    participant WLP as WalkerLogicPrivateService
    participant BLP as BacktestLogicPrivateService
    participant WMS as WalkerMarkdownService

    U->>W: Walker.run(symbol, walkerName)
    W->>WLP: execute(symbol, walkerName)
    
    loop For each strategy
        WLP->>BLP: execute(symbol, strategyName, exchangeName, frameName)
        BLP-->>WLP: BacktestCompleteContract
        WLP->>WLP: Extract metric value
        WLP->>WLP: Store result
    end
    
    WLP->>WLP: Sort by metric
    WLP->>WLP: Identify best performer
    WLP-->>W: WalkerCompleteContract
    W->>WMS: Generate comparison report
    WMS-->>U: Report available
```

**Available Metrics:**

| Metric | Description |
|--------|-------------|
| `sharpeRatio` | Risk-adjusted return (default) |
| `totalPnl` | Total profit/loss |
| `winRate` | Percentage of profitable trades |
| `maxDrawdown` | Maximum portfolio decline |
| `totalTrades` | Number of completed trades |

**Usage Example:**
```typescript
addWalker({
  walkerName: "llm-prompt-optimizer",
  exchangeName: "binance",
  frameName: "1d-backtest",
  strategies: [
    "my-strategy-v1",
    "my-strategy-v2",
    "my-strategy-v3"
  ],
  metric: "sharpeRatio",
  callbacks: {
    onStrategyComplete: (strategyName, symbol, stats, metric) => {
      console.log(`${strategyName}: Sharpe ${metric.toFixed(2)}`);
    },
    onComplete: (results) => {
      console.log(`Best: ${results.bestStrategy}`);
    },
  },
});
```

**Validation Performed:**
- Walker name uniqueness
- Exchange exists in registry
- Frame exists in registry
- All strategy names exist in registry
- Strategies array is non-empty
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:190-202]()

---

### addOptimizer

Registers an optimizer configuration for LLM-based strategy generation. Optimizers collect historical data, build conversation history, generate strategy prompts, and produce executable code.

**Function Signature:**
```typescript
function addOptimizer(optimizerSchema: IOptimizerSchema): void
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `optimizerSchema.optimizerName` | `string` | Unique identifier for optimizer |
| `optimizerSchema.rangeTrain` | `IOptimizerRange[]` | Training time ranges (each generates a strategy variant) |
| `optimizerSchema.rangeTest` | `IOptimizerRange` | Testing time range for validation |
| `optimizerSchema.source` | `IOptimizerSource[]` | Data sources for LLM context |
| `optimizerSchema.getPrompt` | `(symbol: string, messages: MessageModel[]) => Promise<string>` | Generates strategy prompt from conversation |
| `optimizerSchema.template` | `IOptimizerTemplate` (optional) | Custom code generation templates |
| `optimizerSchema.callbacks` | `IOptimizerCallbacks` (optional) | Event handlers for optimizer stages |

**Optimizer Data Collection Flow:**

```mermaid
graph TB
    AO["addOptimizer()<br/>optimizerName"]
    RANGE1["rangeTrain[0]<br/>Bull market period"]
    RANGE2["rangeTrain[1]<br/>Bear market period"]
    
    SOURCE1["source[0]<br/>Historical backtests"]
    SOURCE2["source[1]<br/>Market indicators"]
    
    FETCH1["fetch()<br/>Paginated data"]
    FETCH2["fetch()<br/>Paginated data"]
    
    FORMAT1["user() / assistant()<br/>Message formatting"]
    FORMAT2["user() / assistant()<br/>Message formatting"]
    
    MESSAGES["MessageModel[]<br/>Conversation history"]
    
    PROMPT["getPrompt()<br/>Strategy specification"]
    
    TEMPLATE["OptimizerTemplateService<br/>Code generation"]
    
    CODE["Executable .mjs file<br/>Complete backtest"]
    
    AO --> RANGE1
    AO --> RANGE2
    AO --> SOURCE1
    AO --> SOURCE2
    
    RANGE1 --> FETCH1
    RANGE2 --> FETCH2
    
    SOURCE1 --> FETCH1
    SOURCE2 --> FETCH2
    
    FETCH1 --> FORMAT1
    FETCH2 --> FORMAT2
    
    FORMAT1 --> MESSAGES
    FORMAT2 --> MESSAGES
    
    MESSAGES --> PROMPT
    PROMPT --> TEMPLATE
    TEMPLATE --> CODE
```

**IOptimizerSource Types:**

| Type | Structure | Description |
|------|-----------|-------------|
| Function | `(params: IOptimizerSourceParams) => Promise<any[]>` | Simple data fetcher |
| Object | `{ name, fetch, user?, assistant? }` | Data fetcher with custom message formatters |

**Usage Example:**
```typescript
addOptimizer({
  optimizerName: "llm-strategy-generator",
  rangeTrain: [
    {
      note: "Bull market period",
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    },
    {
      note: "Bear market period",
      startDate: new Date("2024-02-01"),
      endDate: new Date("2024-02-28"),
    },
  ],
  rangeTest: {
    note: "Validation period",
    startDate: new Date("2024-03-01"),
    endDate: new Date("2024-03-31"),
  },
  source: [
    {
      name: "historical-backtests",
      fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
        return await db.backtests.find({
          symbol,
          date: { $gte: startDate, $lte: endDate },
        })
        .skip(offset)
        .limit(limit);
      },
      user: async (symbol, data, name) => {
        return `Analyze ${data.length} backtests for ${symbol}:\n${JSON.stringify(data)}`;
      },
      assistant: async (symbol, data, name) => {
        return "Historical data analyzed successfully";
      },
    },
  ],
  getPrompt: async (symbol, messages) => {
    return `Analyze ${symbol} using RSI and MACD. Enter LONG when RSI < 30.`;
  },
  callbacks: {
    onData: (symbol, strategyData) => {
      console.log(`Generated ${strategyData.length} strategies`);
    },
    onCode: (symbol, code) => {
      console.log(`Generated ${code.length} chars of code`);
    },
  },
});
```

**Validation Performed:**
- Optimizer name uniqueness
- `rangeTrain` array is non-empty
- All date ranges are valid
- `rangeTest` has valid dates
- `source` array is non-empty
- `getPrompt` is an async function
- Callback functions have correct signatures

**Sources:** [src/function/add.ts:432-444]()

---

## Registration Dependencies

Components must be registered in a specific order due to inter-component references. The dependency graph ensures that referenced components exist before dependent components are registered.

```mermaid
graph TB
    EXCHANGE["addExchange()<br/>No dependencies"]
    FRAME["addFrame()<br/>No dependencies"]
    RISK["addRisk()<br/>No dependencies"]
    SIZING["addSizing()<br/>No dependencies"]
    
    STRATEGY["addStrategy()<br/>Requires: riskName"]
    
    WALKER["addWalker()<br/>Requires: exchangeName,<br/>frameName, strategies[]"]
    
    OPTIMIZER["addOptimizer()<br/>No dependencies<br/>(generates strategies)"]
    
    EXCHANGE -.->|"Optional"| STRATEGY
    RISK -->|"Required"| STRATEGY
    SIZING -.->|"Optional"| STRATEGY
    
    EXCHANGE -->|"Required"| WALKER
    FRAME -->|"Required"| WALKER
    STRATEGY -->|"Required"| WALKER
    
    style EXCHANGE fill:#e1f5ff
    style FRAME fill:#e1f5ff
    style RISK fill:#e1f5ff
    style SIZING fill:#e1f5ff
    style STRATEGY fill:#fff4e1
    style WALKER fill:#ffe1e1
    style OPTIMIZER fill:#f0e1ff
```

**Registration Order Requirements:**

| Component | Must Register Before | Reason |
|-----------|---------------------|--------|
| Exchange | Strategy (if used) | Strategy may reference exchange for data |
| Frame | Walker | Walker references frame for timeframe |
| Risk | Strategy | Strategy requires risk profile |
| Sizing | Strategy (if used) | Strategy may reference sizing configuration |
| Strategy | Walker | Walker references strategies for comparison |

**Sources:** [src/function/add.ts:1-445](), [demo/backtest/src/index.mjs:24-113](), [demo/live/src/index.mjs:24-109]()

---

## Validation Pipeline

Component registration performs validation in two phases: **registration-time validation** (immediate) and **runtime validation** (during execution).

### Registration-Time Validation

```mermaid
graph TB
    ADD["add* function call"]
    VS["Validation Service<br/>*ValidationService.add*()"]
    
    STRUCT["Structural validation<br/>Required fields present<br/>Correct types"]
    
    REF["Reference validation<br/>Linked components exist<br/>Names are unique"]
    
    LOGIC["Logical validation<br/>Numeric constraints<br/>Valid enums"]
    
    STORE["Schema Service<br/>register()"]
    
    ERROR["Throw error<br/>Registration fails"]
    
    ADD --> VS
    VS --> STRUCT
    STRUCT -->|"Pass"| REF
    STRUCT -.->|"Fail"| ERROR
    REF -->|"Pass"| LOGIC
    REF -.->|"Fail"| ERROR
    LOGIC -->|"Pass"| STORE
    LOGIC -.->|"Fail"| ERROR
```

**Registration-Time Checks:**

| Component | Validation Performed |
|-----------|---------------------|
| Strategy | `strategyName` unique, valid `interval`, `getSignal` is async function, risk profile exists |
| Exchange | `exchangeName` unique, `getCandles` is async function, format functions are async |
| Frame | `frameName` unique, valid `interval`, `startDate < endDate` |
| Risk | `riskName` unique, `maxConcurrentPositions > 0`, validation functions are functions |
| Sizing | `sizingName` unique, valid `method`, method-specific fields present |
| Walker | `walkerName` unique, exchange/frame exist, all strategies exist |
| Optimizer | `optimizerName` unique, non-empty `rangeTrain`, `getPrompt` is async function |

### Runtime Validation

```mermaid
graph TB
    SIGNAL["getSignal() called<br/>Returns ISignalDto"]
    
    TYPE["Type validation<br/>position: long/short/wait<br/>Prices are numbers"]
    
    PRICE["Price validation<br/>TP > Open (long)<br/>SL < Open (long)"]
    
    DISTANCE["Distance validation<br/>TP >= CC_MIN_TAKEPROFIT_DISTANCE_PERCENT<br/>SL within bounds"]
    
    TIME["Time validation<br/>minuteEstimatedTime reasonable<br/>scheduledAt recent"]
    
    RISK["Risk validation<br/>Custom validations<br/>Portfolio constraints"]
    
    ALLOW["Signal allowed<br/>Proceed to opening"]
    
    REJECT["Signal rejected<br/>Emit validation error"]
    
    SIGNAL --> TYPE
    TYPE -->|"Pass"| PRICE
    TYPE -.->|"Fail"| REJECT
    PRICE -->|"Pass"| DISTANCE
    PRICE -.->|"Fail"| REJECT
    DISTANCE -->|"Pass"| TIME
    DISTANCE -.->|"Fail"| REJECT
    TIME -->|"Pass"| RISK
    TIME -.->|"Fail"| REJECT
    RISK -->|"Pass"| ALLOW
    RISK -.->|"Fail"| REJECT
```

**Runtime Checks:**

| Stage | Validation Performed |
|-------|---------------------|
| Type | `position` is valid enum, prices are numbers, timestamps valid |
| Price | TP/SL direction correct for position type, TP ≠ SL |
| Distance | TP distance ≥ `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT`, SL within bounds |
| Time | `minuteEstimatedTime` within limits, signal not expired |
| Risk | Custom validation functions pass, concurrent position limit not exceeded |

**Sources:** [src/function/add.ts:1-445](), [src/lib/core/provide.ts:128-138]()

---

## Schema Storage Mechanism

All registered schemas are stored in `ToolRegistry` instances within their respective schema services. The registry provides in-memory storage with validation and override capabilities.

### ToolRegistry Pattern

```mermaid
graph TB
    ADD["add* function call"]
    SS["Schema Service<br/>*SchemaService"]
    TR["ToolRegistry<br/>Map<string, Schema>"]
    
    REG["register(name, schema)"]
    GET["has(name)<br/>get(name)"]
    KEYS["keys()<br/>values()"]
    
    ADD --> SS
    SS --> REG
    REG --> TR
    
    TR -.-> GET
    TR -.-> KEYS
    
    note1["Singleton per schema type<br/>Shared across execution modes"]
    note2["No persistence<br/>Lost on process exit"]
    
    TR -.-> note1
    TR -.-> note2
```

**ToolRegistry Methods:**

| Method | Purpose |
|--------|---------|
| `register(name, tool)` | Store schema by unique name |
| `has(name)` | Check if schema exists |
| `get(name)` | Retrieve schema by name |
| `keys()` | Get all registered names |
| `values()` | Get all registered schemas |

**Schema Service Implementation Pattern:**

All schema services follow identical structure:

```typescript
class *SchemaService {
  private registry = new ToolRegistry<*Schema>();
  
  register(name: string, schema: *Schema): void {
    this.registry.register(name, schema);
  }
  
  has(name: string): boolean {
    return this.registry.has(name);
  }
  
  get(name: string): *Schema {
    return this.registry.get(name);
  }
}
```

**Schema Service Instances:**

| Service | Stores | Injected As |
|---------|--------|-------------|
| `StrategySchemaService` | `IStrategySchema` | `TYPES.strategySchemaService` |
| `ExchangeSchemaService` | `IExchangeSchema` | `TYPES.exchangeSchemaService` |
| `FrameSchemaService` | `IFrameSchema` | `TYPES.frameSchemaService` |
| `RiskSchemaService` | `IRiskSchema` | `TYPES.riskSchemaService` |
| `SizingSchemaService` | `ISizingSchema` | `TYPES.sizingSchemaService` |
| `WalkerSchemaService` | `IWalkerSchema` | `TYPES.walkerSchemaService` |
| `OptimizerSchemaService` | `IOptimizerSchema` | `TYPES.optimizerSchemaService` |

**Sources:** [src/lib/index.ts:98-112](), [src/lib/core/types.ts:20-28](), [src/lib/core/provide.ts:75-83]()