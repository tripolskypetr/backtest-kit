# Configuration

<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

- [src/config/emitters.ts](src/config/emitters.ts)
- [src/function/add.ts](src/function/add.ts)
- [src/function/event.ts](src/function/event.ts)
- [src/index.ts](src/index.ts)
- [src/lib/core/provide.ts](src/lib/core/provide.ts)
- [src/lib/core/types.ts](src/lib/core/types.ts)
- [src/lib/index.ts](src/lib/index.ts)
- [types.d.ts](types.d.ts)

</details>



This page documents the global configuration system in backtest-kit, including runtime parameters, validation thresholds, timing constants, and report formatting options. These configuration values control core trading logic, risk management boundaries, and output presentation.

For component-specific schemas (strategies, exchanges, risks, etc.), see [Component Schemas](#5). For execution-mode-specific settings, see [Execution Modes](#2.1).

---

## Configuration Functions

The framework provides functions to customize global behavior before executing strategies. All configuration must be set before calling `add*` registration functions or execution methods.

**Configuration API**:

| Function | Purpose | File Reference |
|----------|---------|----------------|
| `setLogger(logger)` | Replace default console logger | [src/index.ts:2]() |
| `setConfig(config)` | Override default global configuration | [src/index.ts:3]() |
| `getConfig()` | Retrieve current global configuration | [src/index.ts:4]() |
| `getDefaultConfig()` | Retrieve factory default configuration | [src/index.ts:5]() |
| `setColumns(columns)` | Customize markdown report columns | [src/index.ts:6]() |
| `getColumns()` | Retrieve current column configuration | [src/index.ts:7]() |
| `getDefaultColumns()` | Retrieve factory default columns | [src/index.ts:8]() |

**Example: Custom Configuration**
```typescript
import { setConfig, setLogger } from 'backtest-kit';

// Custom logger for production monitoring
setLogger({
  log: (topic, ...args) => monitoring.info(topic, args),
  debug: (topic, ...args) => monitoring.debug(topic, args),
  info: (topic, ...args) => monitoring.info(topic, args),
  warn: (topic, ...args) => monitoring.warn(topic, args),
});

// Override slippage and fees for conservative estimates
setConfig({
  slippage: 0.002,  // 0.2% slippage (more conservative)
  fees: 0.002,      // 0.2% trading fees
  vwapCandleCount: 10,  // Use 10 candles for VWAP calculation
});
```

**Sources**: [src/index.ts:1-9](), [types.d.ts:52-77]()

---

## Global Configuration Object

The `GlobalConfig` type defines runtime parameters that affect profit/loss calculations, price execution, and validation logic across all strategies and exchanges.

```mermaid
graph TB
    subgraph "Configuration Inputs"
        USER["setConfig() call"]
        DEFAULT["getDefaultConfig()"]
    end
    
    subgraph "GlobalConfig Properties"
        SLIPPAGE["slippage: number<br/>Price execution impact"]
        FEES["fees: number<br/>Trading commission"]
        VWAP_COUNT["vwapCandleCount: number<br/>Candles for VWAP calc"]
        TP_DIST["minTakeProfitDistancePercent: number<br/>Min TP distance"]
        SL_MIN["minStopLossDistancePercent: number<br/>Min SL distance"]
        SL_MAX["maxStopLossDistancePercent: number<br/>Max SL distance"]
        SCHEDULE_WAIT["scheduleAwaitMinutes: number<br/>Scheduled signal timeout"]
        SIGNAL_LIFE["maxSignalLifetimeMinutes: number<br/>Active signal timeout"]
        TICK_TTL["tickTTL: number<br/>Live mode sleep interval"]
    end
    
    subgraph "System Consumers"
        PNL["IStrategyPnL calculation<br/>ClientStrategy.ts"]
        VWAP["getAveragePrice()<br/>ClientExchange.ts"]
        VAL["Signal validation<br/>StrategyCoreService.ts"]
        LIVE["Live tick loop<br/>LiveLogicPrivateService.ts"]
        SCHEDULE["Scheduled signal timeout<br/>ClientStrategy.ts"]
    end
    
    USER --> SLIPPAGE
    USER --> FEES
    USER --> VWAP_COUNT
    USER --> TP_DIST
    USER --> SL_MIN
    USER --> SL_MAX
    USER --> SCHEDULE_WAIT
    USER --> SIGNAL_LIFE
    USER --> TICK_TTL
    
    DEFAULT -.fallback.-> SLIPPAGE
    DEFAULT -.fallback.-> FEES
    DEFAULT -.fallback.-> VWAP_COUNT
    
    SLIPPAGE --> PNL
    FEES --> PNL
    VWAP_COUNT --> VWAP
    TP_DIST --> VAL
    SL_MIN --> VAL
    SL_MAX --> VAL
    SCHEDULE_WAIT --> SCHEDULE
    SIGNAL_LIFE --> SCHEDULE
    TICK_TTL --> LIVE
```

**Configuration Properties**:

| Property | Type | Default | Purpose | Used By |
|----------|------|---------|---------|---------|
| `slippage` | `number` | `0.001` (0.1%) | Price execution impact applied to entry/exit | `IStrategyPnL` calculation |
| `fees` | `number` | `0.001` (0.1%) | Trading commission per trade | `IStrategyPnL` calculation |
| `vwapCandleCount` | `number` | `5` | Number of 1m candles for VWAP calculation | `ClientExchange.getAveragePrice()` |
| `minTakeProfitDistancePercent` | `number` | `0.5` (0.5%) | Minimum distance from entry to take profit | Signal validation |
| `minStopLossDistancePercent` | `number` | `0.3` (0.3%) | Minimum distance from entry to stop loss | Signal validation |
| `maxStopLossDistancePercent` | `number` | `10.0` (10%) | Maximum distance from entry to stop loss | Signal validation |
| `scheduleAwaitMinutes` | `number` | `60` | Timeout for scheduled signals awaiting activation | Scheduled signal cancellation |
| `maxSignalLifetimeMinutes` | `number` | `1440` (24h) | Maximum duration for active signals | Active signal timeout |
| `tickTTL` | `number` | `60000` (1min) | Sleep interval between live mode ticks | `LiveLogicPrivateService` loop |

**Sources**: [src/index.ts:195](), [types.d.ts:758]()

---

## Profit and Loss Configuration

The `slippage` and `fees` parameters directly affect PNL calculations for closed signals. These values model realistic trading costs and are applied to both entry and exit prices.

**PNL Calculation Formula**:

```
For LONG positions:
  adjustedPriceOpen = priceOpen × (1 + slippage + fees)
  adjustedPriceClose = priceClose × (1 - slippage - fees)
  pnlPercentage = ((adjustedPriceClose - adjustedPriceOpen) / adjustedPriceOpen) × 100

For SHORT positions:
  adjustedPriceOpen = priceOpen × (1 - slippage - fees)
  adjustedPriceClose = priceClose × (1 + slippage + fees)
  pnlPercentage = ((adjustedPriceOpen - adjustedPriceClose) / adjustedPriceOpen) × 100
```

```mermaid
graph LR
    subgraph "Signal Open"
        RAW_OPEN["Raw priceOpen<br/>50000"]
        SLIP_OPEN["Apply slippage<br/>+0.1%"]
        FEES_OPEN["Apply fees<br/>+0.1%"]
        ADJ_OPEN["Adjusted Open<br/>50100"]
    end
    
    subgraph "Signal Close"
        RAW_CLOSE["Raw priceClose<br/>51000"]
        SLIP_CLOSE["Apply slippage<br/>-0.1%"]
        FEES_CLOSE["Apply fees<br/>-0.1%"]
        ADJ_CLOSE["Adjusted Close<br/>50898"]
    end
    
    subgraph "PNL Result"
        CALC["Calculate %<br/>(50898-50100)/50100"]
        RESULT["pnlPercentage<br/>1.59%"]
    end
    
    RAW_OPEN --> SLIP_OPEN
    SLIP_OPEN --> FEES_OPEN
    FEES_OPEN --> ADJ_OPEN
    
    RAW_CLOSE --> SLIP_CLOSE
    SLIP_CLOSE --> FEES_CLOSE
    FEES_CLOSE --> ADJ_CLOSE
    
    ADJ_OPEN --> CALC
    ADJ_CLOSE --> CALC
    CALC --> RESULT
```

**Example: Conservative vs Aggressive Configuration**
```typescript
// Conservative: Higher costs for realistic backtests
setConfig({
  slippage: 0.002,  // 0.2% slippage (market orders in low liquidity)
  fees: 0.002,      // 0.2% fees (non-VIP tier)
});

// Aggressive: Lower costs for limit orders with maker rebates
setConfig({
  slippage: 0.0005, // 0.05% slippage (limit orders)
  fees: 0.0005,     // 0.05% fees (VIP tier with rebates)
});
```

**Sources**: [types.d.ts:756-766]()

---

## VWAP Configuration

The `vwapCandleCount` parameter controls how many 1-minute candles are used to calculate the Volume Weighted Average Price for signal entry/exit prices. VWAP provides more realistic execution pricing than simple close prices.

**VWAP Formula**:
```
VWAP = Σ(Typical Price × Volume) / Σ(Volume)
where Typical Price = (High + Low + Close) / 3
```

```mermaid
graph TB
    subgraph "Candle Fetching"
        REQ["getAveragePrice(symbol)"]
        FETCH["getCandles(symbol, '1m', limit)"]
        LIMIT["limit = vwapCandleCount"]
    end
    
    subgraph "VWAP Calculation"
        CANDLES["Last N candles<br/>[c1, c2, ..., cN]"]
        TYPICAL["Typical Price per candle<br/>(high + low + close) / 3"]
        WEIGHTED["Weighted sum<br/>Σ(typical × volume)"]
        VOLUME_SUM["Volume sum<br/>Σ(volume)"]
        VWAP["VWAP result<br/>weighted / volumeSum"]
    end
    
    subgraph "Signal Processing"
        ENTRY["priceOpen = VWAP"]
        EXIT_TP["priceTakeProfit check"]
        EXIT_SL["priceStopLoss check"]
    end
    
    REQ --> FETCH
    LIMIT --> FETCH
    FETCH --> CANDLES
    CANDLES --> TYPICAL
    TYPICAL --> WEIGHTED
    CANDLES --> VOLUME_SUM
    WEIGHTED --> VWAP
    VOLUME_SUM --> VWAP
    
    VWAP --> ENTRY
    VWAP --> EXIT_TP
    VWAP --> EXIT_SL
```

**Configuration Impact**:

| `vwapCandleCount` | Behavior | Use Case |
|-------------------|----------|----------|
| `5` (default) | Last 5 minutes of data | Standard execution pricing |
| `10` | Last 10 minutes of data | Smoother price averaging for volatile markets |
| `1` | Current candle only | Simpler close-price execution (faster but less realistic) |
| `60` | Last hour of data | Very smooth pricing for illiquid markets |

**Example: Adjust VWAP Window**
```typescript
// Use more candles for smoother VWAP in volatile markets
setConfig({
  vwapCandleCount: 15,  // 15-minute VWAP window
});
```

**Sources**: [types.d.ts:196-204](), [types.d.ts:119-136]()

---

## Validation Parameters

Validation parameters enforce minimum and maximum distances between entry price and take profit/stop loss targets. These prevent unrealistic signals with impossible profit targets or insufficient risk management.

```mermaid
graph TB
    subgraph "Signal DTO Input"
        SIGNAL["ISignalDto<br/>position, priceOpen<br/>priceTakeProfit<br/>priceStopLoss"]
    end
    
    subgraph "Validation Constants"
        MIN_TP["minTakeProfitDistancePercent<br/>Default: 0.5%"]
        MIN_SL["minStopLossDistancePercent<br/>Default: 0.3%"]
        MAX_SL["maxStopLossDistancePercent<br/>Default: 10%"]
    end
    
    subgraph "Distance Calculations"
        CALC_TP["TP Distance %<br/>abs(TP - Open) / Open × 100"]
        CALC_SL["SL Distance %<br/>abs(SL - Open) / Open × 100"]
    end
    
    subgraph "Validation Checks"
        CHECK_MIN_TP["TP Distance >= minTakeProfitDistancePercent"]
        CHECK_MIN_SL["SL Distance >= minStopLossDistancePercent"]
        CHECK_MAX_SL["SL Distance <= maxStopLossDistancePercent"]
        CHECK_DIRECTION["TP direction matches position<br/>LONG: TP > Open<br/>SHORT: TP < Open"]
    end
    
    subgraph "Validation Result"
        PASS["Signal Validated<br/>Proceed to risk check"]
        FAIL["ValidationError<br/>Signal rejected"]
    end
    
    SIGNAL --> CALC_TP
    SIGNAL --> CALC_SL
    
    MIN_TP --> CHECK_MIN_TP
    MIN_SL --> CHECK_MIN_SL
    MAX_SL --> CHECK_MAX_SL
    
    CALC_TP --> CHECK_MIN_TP
    CALC_TP --> CHECK_DIRECTION
    CALC_SL --> CHECK_MIN_SL
    CALC_SL --> CHECK_MAX_SL
    
    CHECK_MIN_TP --> PASS
    CHECK_MIN_SL --> PASS
    CHECK_MAX_SL --> PASS
    CHECK_DIRECTION --> PASS
    
    CHECK_MIN_TP -.reject.-> FAIL
    CHECK_MIN_SL -.reject.-> FAIL
    CHECK_MAX_SL -.reject.-> FAIL
    CHECK_DIRECTION -.reject.-> FAIL
```

**Validation Parameters**:

| Parameter | Default | Purpose | Example Rejection |
|-----------|---------|---------|-------------------|
| `minTakeProfitDistancePercent` | `0.5%` | Ensures meaningful profit targets | TP only 0.2% away from entry |
| `minStopLossDistancePercent` | `0.3%` | Prevents micro stop losses from noise | SL only 0.1% away from entry |
| `maxStopLossDistancePercent` | `10%` | Caps maximum acceptable loss | SL 15% away from entry |

**Example: Adjust Validation Thresholds**
```typescript
// Scalping strategy: Allow tighter targets
setConfig({
  minTakeProfitDistancePercent: 0.2,  // 0.2% minimum TP
  minStopLossDistancePercent: 0.15,   // 0.15% minimum SL
  maxStopLossDistancePercent: 5,      // 5% maximum SL
});

// Swing trading: Require larger targets
setConfig({
  minTakeProfitDistancePercent: 2,    // 2% minimum TP
  minStopLossDistancePercent: 1,      // 1% minimum SL
  maxStopLossDistancePercent: 20,     // 20% maximum SL
});
```

**Validation Errors**:
```typescript
// Example validation error messages
"Take profit distance (0.3%) must be at least 0.5%"
"Stop loss distance (0.2%) must be at least 0.3%"
"Stop loss distance (12%) exceeds maximum of 10%"
"Take profit must be greater than entry price for LONG positions"
"Take profit must be less than entry price for SHORT positions"
```

**Sources**: [types.d.ts:651-667]()

---

## Timing Parameters

Timing parameters control signal lifecycle durations and live mode execution frequency. These prevent signals from remaining active indefinitely and control the rate of market data queries.

```mermaid
graph TB
    subgraph "Scheduled Signal Timing"
        CREATE["Signal created<br/>scheduledAt timestamp"]
        WAIT["Waiting for priceOpen<br/>Price monitoring loop"]
        CHECK_TIMEOUT["Check elapsed time<br/>now - scheduledAt"]
        TIMEOUT_LIMIT["scheduleAwaitMinutes<br/>Default: 60 min"]
        CANCEL["Signal cancelled<br/>action: 'cancelled'"]
        ACTIVATE["Price reached<br/>Signal becomes pending"]
    end
    
    subgraph "Active Signal Timing"
        PENDING["Signal pending<br/>pendingAt timestamp"]
        MONITOR["Monitor TP/SL<br/>Active state loop"]
        CHECK_LIFE["Check elapsed time<br/>now - pendingAt"]
        LIFE_LIMIT["maxSignalLifetimeMinutes<br/>Default: 1440 min (24h)"]
        EXPIRE["Signal closed<br/>closeReason: 'time_expired'"]
        TP_SL["TP/SL reached<br/>closeReason: 'take_profit' | 'stop_loss'"]
    end
    
    subgraph "Live Mode Timing"
        LOOP_START["Live tick loop iteration"]
        TICK["Process all strategies<br/>ClientStrategy.tick()"]
        SLEEP["Sleep interval"]
        TTL["tickTTL<br/>Default: 60000 ms (1 min)"]
        LOOP_END["Next iteration"]
    end
    
    CREATE --> WAIT
    WAIT --> CHECK_TIMEOUT
    CHECK_TIMEOUT --> CANCEL
    CHECK_TIMEOUT --> ACTIVATE
    TIMEOUT_LIMIT --> CHECK_TIMEOUT
    
    PENDING --> MONITOR
    MONITOR --> CHECK_LIFE
    CHECK_LIFE --> EXPIRE
    CHECK_LIFE --> TP_SL
    LIFE_LIMIT --> CHECK_LIFE
    
    LOOP_START --> TICK
    TICK --> SLEEP
    TTL --> SLEEP
    SLEEP --> LOOP_END
    LOOP_END -.loop.-> LOOP_START
```

**Timing Parameters**:

| Parameter | Default | Unit | Purpose | Component |
|-----------|---------|------|---------|-----------|
| `scheduleAwaitMinutes` | `60` | minutes | Timeout for scheduled signals awaiting activation | `ClientStrategy` scheduled signal monitoring |
| `maxSignalLifetimeMinutes` | `1440` (24h) | minutes | Maximum duration for active signals before forced close | `ClientStrategy` active signal monitoring |
| `tickTTL` | `60000` (1min) | milliseconds | Sleep interval between live mode ticks | `LiveLogicPrivateService` loop |

**Scheduled Signal Timeout Behavior**:

When a scheduled signal (with `priceOpen` specified) is created, it waits for the market price to reach `priceOpen`. If `scheduleAwaitMinutes` elapses before activation:

1. Signal transitions to `action: "cancelled"`
2. `IStrategyTickResultCancelled` emitted via `signalEmitter`
3. No PNL impact (position never opened)
4. Callback `onCancel()` invoked (if registered)

**Active Signal Lifetime Behavior**:

When an active signal (pending or monitoring TP/SL) exceeds `maxSignalLifetimeMinutes`:

1. Signal transitions to `action: "closed"`
2. `closeReason: "time_expired"`
3. PNL calculated using current VWAP price
4. `IStrategyTickResultClosed` emitted via `signalEmitter`
5. Callback `onClose()` invoked (if registered)

**Live Mode Tick Rate**:

The `tickTTL` parameter controls the sleep interval between strategy ticks in live mode:

```typescript
// Live mode execution loop (simplified)
while (!stopped) {
  await strategy.tick(symbol, new Date());  // Process strategy logic
  await sleep(config.tickTTL);              // Sleep before next tick
}
```

**Example: Adjust Timing Parameters**
```typescript
// Fast trading: Short timeouts and quick ticks
setConfig({
  scheduleAwaitMinutes: 15,         // 15-minute timeout for scheduled signals
  maxSignalLifetimeMinutes: 360,    // 6-hour maximum signal lifetime
  tickTTL: 30000,                   // 30-second tick interval
});

// Slow trading: Long timeouts and relaxed ticks
setConfig({
  scheduleAwaitMinutes: 240,        // 4-hour timeout for scheduled signals
  maxSignalLifetimeMinutes: 4320,   // 3-day maximum signal lifetime
  tickTTL: 300000,                  // 5-minute tick interval
});
```

**Sources**: [types.d.ts:694-698](), [types.d.ts:686-689]()

---

## Column Configuration

The column configuration controls which fields are displayed in markdown reports. This allows customization of report tables for different analysis needs without modifying report generation code.

**Default Columns**:

```typescript
interface ColumnConfig {
  // Signal identification
  id: boolean;              // Signal UUID
  symbol: boolean;          // Trading pair
  strategyName: boolean;    // Strategy identifier
  exchangeName: boolean;    // Exchange identifier
  
  // Signal parameters
  position: boolean;        // "long" | "short"
  note: boolean;            // Human-readable reason
  priceOpen: boolean;       // Entry price
  priceTakeProfit: boolean; // Take profit target
  priceStopLoss: boolean;   // Stop loss target
  minuteEstimatedTime: boolean; // Expected duration
  
  // Signal lifecycle
  scheduledAt: boolean;     // Signal creation timestamp
  pendingAt: boolean;       // Position open timestamp
  closeTimestamp: boolean;  // Position close timestamp
  closeReason: boolean;     // "take_profit" | "stop_loss" | "time_expired"
  
  // Performance metrics
  pnlPercentage: boolean;   // Profit/loss percentage
  priceClose: boolean;      // Exit price
  currentPrice: boolean;    // Current market price (for active signals)
  percentTp: boolean;       // Progress towards TP (0-100%)
  percentSl: boolean;       // Progress towards SL (0-100%)
}
```

**Example: Minimal Report Columns**
```typescript
import { setColumns } from 'backtest-kit';

// Show only essential trading information
setColumns({
  id: false,                // Hide UUID
  symbol: true,
  strategyName: false,      // Hide strategy name
  exchangeName: false,      // Hide exchange name
  position: true,
  note: false,              // Hide notes
  priceOpen: true,
  priceTakeProfit: true,
  priceStopLoss: true,
  minuteEstimatedTime: false,
  scheduledAt: false,
  pendingAt: true,
  closeTimestamp: true,
  closeReason: true,
  pnlPercentage: true,
  priceClose: true,
  currentPrice: false,
  percentTp: false,
  percentSl: false,
});
```

**Example: Full Diagnostic Columns**
```typescript
import { setColumns, getDefaultColumns } from 'backtest-kit';

// Start with defaults and enable all columns
const allColumns = getDefaultColumns();
Object.keys(allColumns).forEach(key => {
  allColumns[key] = true;
});

setColumns(allColumns);
```

**Report Generation Services**:

| Service | Report Type | Uses Column Config |
|---------|-------------|-------------------|
| `BacktestMarkdownService` | Backtest signal history | Yes |
| `LiveMarkdownService` | Live trading signals | Yes |
| `WalkerMarkdownService` | Strategy comparison results | Yes |
| `ScheduleMarkdownService` | Scheduled signals | Yes |
| `PartialMarkdownService` | Partial profit/loss milestones | Yes |

**Sources**: [src/index.ts:196](), [src/lib/index.ts:182-186]()

---

## Configuration Validation

Configuration values are validated on initialization to prevent invalid system behavior. The `ConfigValidationService` ensures all parameters are within acceptable ranges.

```mermaid
graph TB
    subgraph "Configuration Input"
        USER_CONFIG["setConfig(config)"]
    end
    
    subgraph "ConfigValidationService"
        VALIDATE["validate(config)"]
        
        CHECK_SLIP["Validate slippage<br/>0 <= value <= 1"]
        CHECK_FEES["Validate fees<br/>0 <= value <= 1"]
        CHECK_VWAP["Validate vwapCandleCount<br/>1 <= value <= 60"]
        CHECK_TP["Validate minTakeProfitDistancePercent<br/>0 < value <= 100"]
        CHECK_SL_MIN["Validate minStopLossDistancePercent<br/>0 < value <= 100"]
        CHECK_SL_MAX["Validate maxStopLossDistancePercent<br/>0 < value <= 100"]
        CHECK_SCHEDULE["Validate scheduleAwaitMinutes<br/>value > 0"]
        CHECK_LIFE["Validate maxSignalLifetimeMinutes<br/>value > 0"]
        CHECK_TTL["Validate tickTTL<br/>value >= 1000"]
    end
    
    subgraph "Schema Services"
        STORE["Store validated config<br/>in SchemaService"]
    end
    
    subgraph "Validation Result"
        PASS["Configuration stored<br/>System ready"]
        FAIL["ValidationError thrown<br/>System halts"]
    end
    
    USER_CONFIG --> VALIDATE
    
    VALIDATE --> CHECK_SLIP
    VALIDATE --> CHECK_FEES
    VALIDATE --> CHECK_VWAP
    VALIDATE --> CHECK_TP
    VALIDATE --> CHECK_SL_MIN
    VALIDATE --> CHECK_SL_MAX
    VALIDATE --> CHECK_SCHEDULE
    VALIDATE --> CHECK_LIFE
    VALIDATE --> CHECK_TTL
    
    CHECK_SLIP --> PASS
    CHECK_FEES --> PASS
    CHECK_VWAP --> PASS
    CHECK_TP --> PASS
    CHECK_SL_MIN --> PASS
    CHECK_SL_MAX --> PASS
    CHECK_SCHEDULE --> PASS
    CHECK_LIFE --> PASS
    CHECK_TTL --> PASS
    
    CHECK_SLIP -.invalid.-> FAIL
    CHECK_FEES -.invalid.-> FAIL
    CHECK_VWAP -.invalid.-> FAIL
    
    PASS --> STORE
```

**Validation Ranges**:

| Parameter | Validation Rule | Error Message |
|-----------|----------------|---------------|
| `slippage` | `0 <= value <= 1` | "Slippage must be between 0 and 1 (0% to 100%)" |
| `fees` | `0 <= value <= 1` | "Fees must be between 0 and 1 (0% to 100%)" |
| `vwapCandleCount` | `1 <= value <= 60` | "VWAP candle count must be between 1 and 60" |
| `minTakeProfitDistancePercent` | `0 < value <= 100` | "Min TP distance must be positive and <= 100%" |
| `minStopLossDistancePercent` | `0 < value <= 100` | "Min SL distance must be positive and <= 100%" |
| `maxStopLossDistancePercent` | `0 < value <= 100` | "Max SL distance must be positive and <= 100%" |
| `scheduleAwaitMinutes` | `value > 0` | "Schedule await minutes must be positive" |
| `maxSignalLifetimeMinutes` | `value > 0` | "Max signal lifetime minutes must be positive" |
| `tickTTL` | `value >= 1000` | "Tick TTL must be at least 1000ms (1 second)" |

**Example: Validation Error**
```typescript
import { setConfig } from 'backtest-kit';

// This will throw ValidationError
setConfig({
  slippage: 1.5,  // ERROR: > 1 (100%)
  fees: -0.001,   // ERROR: < 0
  vwapCandleCount: 100, // ERROR: > 60
  tickTTL: 500,   // ERROR: < 1000
});
```

**Sources**: [src/lib/index.ts:212-213](), [src/lib/core/provide.ts:136-137]()

---

## Configuration Best Practices

**Backtesting Configuration**:
- Use conservative `slippage` and `fees` values (0.2% each) for realistic results
- Set `vwapCandleCount` based on market liquidity (higher for illiquid markets)
- Adjust validation parameters to match strategy timeframe (tighter for scalping, looser for swing trading)
- Set `maxSignalLifetimeMinutes` based on expected holding period

**Live Trading Configuration**:
- Use actual exchange fee schedule for `fees` parameter
- Measure actual slippage from paper trading and configure accordingly
- Set `tickTTL` based on strategy requirements (lower for faster strategies)
- Configure `scheduleAwaitMinutes` conservatively to avoid premature cancellations

**Development Configuration**:
- Enable all columns via `setColumns()` for full diagnostic visibility
- Use custom logger with `setLogger()` to integrate with monitoring systems
- Test edge cases with extreme configuration values to verify validation

**Performance Optimization**:
- Increase `vwapCandleCount` cautiously (more candles = more database queries)
- Set `tickTTL` as high as acceptable to reduce CPU usage in live mode
- Use `getDefaultConfig()` as baseline and override only necessary parameters

**Sources**: [src/index.ts:1-9](), [types.d.ts:195-196]()