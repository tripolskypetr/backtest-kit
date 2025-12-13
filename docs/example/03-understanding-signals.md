---
title: example/03_understanding_signals
group: example
---

# Understanding Trading Signals

This guide explains the complete lifecycle of trading signals in backtest-kit - from generation to closure. Understanding the signal state machine is critical for building reliable trading strategies.

## What is a Trading Signal?

A trading signal is a structured instruction to open a position in the market. Each signal contains:

- **Direction**: LONG (buy) or SHORT (sell)
- **Entry price**: When to open the position
- **Take-profit**: Target price to lock in profit
- **Stop-loss**: Protection level against large losses
- **Lifetime**: Maximum duration of the position

---

## Signal State Machine

Each signal progresses through one of six possible states. The framework strictly controls transitions between states.

![Mermaid Diagram](./diagrams\03-understanding-signals_0.svg)

**Critical constraint**: Only **one** signal can be active for a symbol-strategy pair at any given time. New signals wait until the previous signal reaches `closed` or `cancelled` state.

---

## State Descriptions

### 1. Idle (Waiting)

No active signal. Strategy is waiting for new signal generation.

**When**:
- Strategy just started
- Previous signal closed or cancelled
- `getSignal()` function returned `null`

**Event data**:
```typescript
{
  action: "idle",
  signal: null,
  currentPrice: 50000,
  strategyName: "macd-crossover",
  exchangeName: "binance",
  symbol: "BTCUSDT"
}
```

---

### 2. Scheduled (Pending)

Signal is waiting for price to reach `priceOpen` (limit order behavior).

**When**: `getSignal()` function returns a signal with specified `priceOpen` that hasn't been reached yet.

**Example LONG signal**:
```typescript
{
  position: "long",
  priceOpen: 42000,      // Entry when price drops to 42000
  priceTakeProfit: 45000,
  priceStopLoss: 40000,
  minuteEstimatedTime: 120,
  timestamp: Date.now()
}
```

**What happens**:
1. Signal is saved as "scheduled"
2. Each tick checks if price has reached `priceOpen`
3. If price reaches `priceOpen` → transition to `opened` state
4. If timeout or SL before activation → transition to `cancelled` state

**Important characteristics**:
- **LONG**: activates when `currentPrice <= priceOpen` (price drops to entry)
- **SHORT**: activates when `currentPrice >= priceOpen` (price rises to entry)

---

### 3. Opened (Open)

Position has just been opened. This is an intermediate state that transitions to `active` on the next tick.

**When**:
- Immediate signal: `idle` → `opened` (when `priceOpen` not specified)
- Scheduled signal: `scheduled` → `opened` (when activation price reached)

**Event data**:
```typescript
{
  action: "opened",
  signal: {
    id: "sig_123",
    position: "long",
    priceOpen: 42000,
    priceTakeProfit: 45000,
    priceStopLoss: 40000,
    pendingAt: 1702800000000,
    minuteEstimatedTime: 120
  },
  currentPrice: 42000,
  strategyName: "macd-crossover",
  exchangeName: "binance",
  symbol: "BTCUSDT"
}
```

**Usage**: This moment is ideal for sending notifications about position entry or logging trade start.

---

### 4. Active (Active)

Signal is being monitored for exit conditions (TP, SL, or time expiration).

**Checked exit conditions**:

#### For LONG positions:
1. **Take-profit**: `currentPrice >= signal.priceTakeProfit`
2. **Stop-loss**: `currentPrice <= signal.priceStopLoss`
3. **Time expiration**: `currentTime - signal.pendingAt > signal.minuteEstimatedTime * 60 * 1000`

#### For SHORT positions:
1. **Take-profit**: `currentPrice <= signal.priceTakeProfit`
2. **Stop-loss**: `currentPrice >= signal.priceStopLoss`
3. **Time expiration**: (same as LONG)

**Event data**:
```typescript
{
  action: "active",
  signal: { /* signal data */ },
  currentPrice: 43500,
  percentTp: 50,   // Progress to TP: 50%
  percentSl: 75,   // Distance from SL: 75%
  strategyName: "macd-crossover",
  exchangeName: "binance",
  symbol: "BTCUSDT"
}
```

**Usage**: Monitoring `percentTp` and `percentSl` allows tracking position progress in real-time.

---

### 5. Closed (Closed)

Signal completed with final PNL calculation. This is a terminal state.

**Close reasons**:
- `"take_profit"` - Price reached target profit level
- `"stop_loss"` - Protection level triggered
- `"time_expired"` - Maximum position lifetime expired

**Event data**:
```typescript
{
  action: "closed",
  signal: { /* signal data */ },
  currentPrice: 45000,
  closeReason: "take_profit",
  closeTimestamp: 1702807200000,
  pnl: {
    pnlPercentage: 6.7,      // +6.7% after all costs
    priceOpen: 42000,
    priceClose: 45000,
    priceOpenAdjusted: 42168,  // Including slippage and fees
    priceCloseAdjusted: 44910
  },
  strategyName: "macd-crossover",
  exchangeName: "binance",
  symbol: "BTCUSDT"
}
```

#### PNL Calculation

**For LONG positions**:
```
Adjusted entry price:
  priceOpenAdjusted = priceOpen × (1 + slippage) × (1 + fee)

Adjusted exit price:
  priceCloseAdjusted = priceClose × (1 - slippage) × (1 - fee)

PNL percentage:
  pnlPercentage = ((priceCloseAdjusted - priceOpenAdjusted) / priceOpenAdjusted) × 100
```

**For SHORT positions**:
```
Adjusted entry price:
  priceOpenAdjusted = priceOpen × (1 - slippage) × (1 - fee)

Adjusted exit price:
  priceCloseAdjusted = priceClose × (1 + slippage) × (1 + fee)

PNL percentage:
  pnlPercentage = ((priceOpenAdjusted - priceCloseAdjusted) / priceOpenAdjusted) × 100
```

**Default trading costs**:
- `CC_PERCENT_SLIPPAGE = 0.1%` (market impact)
- `CC_PERCENT_FEE = 0.1%` (exchange commission)
- **Total costs: ~0.4%** (2× slippage + 2× fee)

**Important**: For breakeven, a signal must achieve at least 0.4% gross profit.

---

### 6. Cancelled (Cancelled)

Scheduled signal was cancelled without opening a position. This is a terminal state.

**Cancellation reasons**:

1. **Timeout**: Scheduled signal did not activate within `CC_SCHEDULE_AWAIT_MINUTES` (default 60 minutes)
2. **Stop-loss before activation**: Price reached SL before reaching `priceOpen`

**Event data**:
```typescript
{
  action: "cancelled",
  signal: {
    id: "sig_124",
    position: "long",
    priceOpen: 42000,
    scheduledAt: 1702800000000,
    _isScheduled: true
  },
  currentPrice: 39000,
  closeTimestamp: 1702803600000,
  strategyName: "macd-crossover",
  exchangeName: "binance",
  symbol: "BTCUSDT"
}
```

---

## Scheduled Signals: LONG vs SHORT

Activation and cancellation logic for scheduled signals differs between LONG and SHORT positions due to opposite price movement directions.

### LONG Position Activation

![Mermaid Diagram](./diagrams\03-understanding-signals_1.svg)

**Key rule**: For LONG positions, stop-loss check has **priority** over activation check.

**Rationale**: If price drops to both levels (SL and priceOpen) on the same candle, the position should be cancelled (not opened and immediately closed), preventing unnecessary fees.

---

### SHORT Position Activation

![Mermaid Diagram](./diagrams\03-understanding-signals_2.svg)

**Key rule**: For SHORT positions, stop-loss check has **priority** over activation check.

---

## Cancellation Scenario Examples

### Example 1: LONG signal - timeout

```typescript
// Scheduled LONG signal created
{
  position: "long",
  priceOpen: 42000,
  priceTakeProfit: 45000,
  priceStopLoss: 40000,
  scheduledAt: 10:00
}

// Price does not reach 42000 within 60 minutes
// Time: 11:00 - Timeout!
// Result: CANCELLED (reason: timeout)
```

### Example 2: LONG signal - SL before activation

```typescript
// Scheduled LONG signal created
{
  position: "long",
  priceOpen: 42000,
  priceStopLoss: 41000
}

// Price path: 43000 → 40500 (skips priceOpen, reaches SL)
// Result: CANCELLED (reason: SL before activation)
// Rationale: Opening at 42000 with immediate SL at 41000 wastes fees
```

### Example 3: SHORT signal - SL before activation

```typescript
// Scheduled SHORT signal created
{
  position: "short",
  priceOpen: 42000,
  priceStopLoss: 44000
}

// Price path: 41000 → 45000 (skips priceOpen, reaches SL)
// Result: CANCELLED (reason: SL before activation)
```

---

## Signal Validation Rules

The framework enforces strict validation rules to prevent invalid trades.

### General Validation Rules

| Check | LONG | SHORT | Error if violated |
|----------|------|-------|-------------------------|
| Position TP/SL | `TP > priceOpen > SL` | `SL > priceOpen > TP` | Price logic violated |
| TP distance | `((TP - priceOpen) / priceOpen) × 100 ≥ 0.5%` | `((priceOpen - TP) / priceOpen) × 100 ≥ 0.5%` | TP too close to cover fees |
| Min SL distance | `((priceOpen - SL) / priceOpen) × 100 ≥ 0.5%` | `((SL - priceOpen) / priceOpen) × 100 ≥ 0.5%` | SL too close (instant stop) |
| Max SL distance | `((priceOpen - SL) / priceOpen) × 100 ≤ 20%` | `((SL - priceOpen) / priceOpen) × 100 ≤ 20%` | SL too far (catastrophic loss) |
| Lifetime | `minuteEstimatedTime ≤ 1440 minutes` | Same | Signal lifetime too long |

### Immediate Signal Validation

For signals that open immediately, additional checks prevent instant closure:

**LONG immediate**:
```
currentPrice MUST be between SL and TP:
  priceStopLoss < currentPrice < priceTakeProfit
```

**Error cases**:
- `currentPrice <= priceStopLoss` → "Signal will be immediately closed by stop-loss"
- `currentPrice >= priceTakeProfit` → "Profit opportunity already missed"

**SHORT immediate**:
```
currentPrice MUST be between TP and SL:
  priceTakeProfit < currentPrice < priceStopLoss
```

---

## Monitoring Signals with Events

### Event Listeners

```typescript
import { listenSignalBacktest } from "backtest-kit";

listenSignalBacktest((event) => {
  console.log(`[${event.action}] ${event.symbol}`);

  switch (event.action) {
    case "idle":
      console.log("  Waiting for new signal");
      break;

    case "scheduled":
      console.log(`  Scheduled: entry at ${event.signal.priceOpen}`);
      break;

    case "opened":
      console.log(`  Position opened: ${event.signal.position} @ ${event.currentPrice}`);
      break;

    case "active":
      console.log(`  Monitoring: TP ${event.percentTp}%, SL ${event.percentSl}%`);
      break;

    case "closed":
      console.log(`  Closed: ${event.closeReason}`);
      console.log(`  PNL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
      break;

    case "cancelled":
      console.log(`  Scheduled signal cancelled`);
      break;
  }
});
```

### Strategy Callbacks

Alternatively, use callbacks in the strategy schema:

```typescript
addStrategy({
  strategyName: "macd-crossover",
  interval: "15m",
  getSignal: async (symbol) => {
    // Signal generation logic
  },
  callbacks: {
    onSchedule: (symbol, signal, currentPrice, backtest) => {
      console.log(`Scheduled signal created for ${symbol}`);
    },
    onOpen: (symbol, signal, currentPrice, backtest) => {
      console.log(`Position opened: ${signal.position} @ ${currentPrice}`);
      // Send notification, update UI, etc.
    },
    onActive: (symbol, signal, currentPrice, backtest) => {
      // Called every tick during monitoring
      // Use for progress tracking
    },
    onClose: (symbol, signal, priceClose, backtest) => {
      console.log(`Position closed @ ${priceClose}`);
      // Log trade results
    },
    onCancel: (symbol, signal, currentPrice, backtest) => {
      console.log(`Scheduled signal cancelled @ ${currentPrice}`);
    },
  },
});
```

---

## Signal Persistence (Live Trading)

In live trading mode, active signals are saved to disk for crash protection.

### What Gets Saved

| State | Saved? | Reason |
|-----------|--------------|---------|
| `idle` | ❌ No | No data to save |
| `scheduled` | ✅ Yes | In PersistScheduleAdapter |
| `opened` | ✅ Yes | In PersistSignalAdapter |
| `active` | ✅ Yes | In PersistSignalAdapter |
| `closed` | ❌ No | Position completed, cleared from disk |
| `cancelled` | ❌ No | Scheduled signal cancelled, cleared from disk |

### Crash Recovery

When the live trading process restarts, signals are restored from disk:

```typescript
// On Live.background() startup
1. Read PersistSignalAdapter → restore active position
2. Read PersistScheduleAdapter → restore scheduled signal
3. Call appropriate callbacks (onActive / onSchedule)
4. Continue monitoring from restored state
```

**Key guarantees**:
- No duplicate signals (single source of truth)
- No lost positions (atomic writes prevent corruption)
- Seamless recovery (callbacks notify about restored state)

---

## Exit Condition Check Diagram

![Mermaid Diagram](./diagrams\03-understanding-signals_3.svg)

---

## Practical Example: Full Lifecycle

```typescript
import {
  addStrategy,
  listenSignalBacktest,
  Backtest,
  getCandles
} from "backtest-kit";

// Strategy with scheduled entry
addStrategy({
  strategyName: "breakout-strategy",
  interval: "15m",
  getSignal: async (symbol) => {
    // Fetch recent candles to determine market state
    const candles = await getCandles(symbol, "15m", 20);
    const currentPrice = candles[candles.length - 1].close;

    // Scheduled LONG: wait for breakout down to 48000
    return {
      position: "long",
      priceOpen: 48000,        // Activate on drop
      priceTakeProfit: 50000,  // +4.17% target profit
      priceStopLoss: 46500,    // -3.13% max loss
      minuteEstimatedTime: 240,  // 4 hours
      timestamp: Date.now(),
    };
  },
  callbacks: {
    onSchedule: (symbol, signal) => {
      console.log(`✓ Scheduled signal: entry at ${signal.priceOpen}`);
    },
    onOpen: (symbol, signal, price) => {
      console.log(`✓ Position opened at ${price}`);
    },
    onActive: (symbol, signal, price) => {
      console.log(`→ Monitoring: current price ${price}`);
    },
    onClose: (symbol, signal, price) => {
      console.log(`✓ Position closed at ${price}`);
    },
    onCancel: (symbol, signal) => {
      console.log(`✗ Scheduled signal cancelled`);
    },
  },
});

// Monitor all events
listenSignalBacktest((event) => {
  console.log(`[${event.action}] ${event.symbol} @ ${event.currentPrice}`);

  if (event.action === "closed") {
    console.log(`  Reason: ${event.closeReason}`);
    console.log(`  PNL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
  }
});

// Run backtest
Backtest.background("BTCUSDT", {
  strategyName: "breakout-strategy",
  exchangeName: "binance",
  frameName: "december-2025",
});
```

**Possible output**:
```
✓ Scheduled signal: entry at 48000
[scheduled] BTCUSDT @ 50000
[opened] BTCUSDT @ 48000
✓ Position opened at 48000
[active] BTCUSDT @ 48500
→ Monitoring: current price 48500
[active] BTCUSDT @ 49200
→ Monitoring: current price 49200
[closed] BTCUSDT @ 50000
✓ Position closed at 50000
  Reason: take_profit
  PNL: 3.76%
```

---

## Next Steps

After understanding the signal lifecycle:

1. **[Live Trading Setup](04-live-trading.md)** - transition to real execution with automatic crash recovery
2. **[Risk Management](05-risk-management.md)** - implement portfolio validation rules and position limits
3. **[AI Optimization](06-ai-optimization.md)** - generate strategies using large language models
