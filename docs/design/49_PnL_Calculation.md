# PnL Calculation


This page documents the profit and loss (PnL) calculation system used to determine trading performance. PnL is calculated when a signal closes, incorporating realistic trading costs including slippage and fees. This ensures backtest results accurately reflect real-world trading conditions.

For information about signal states and transitions, see [Signal States](./45_Signal_States.md). For details on when PnL is calculated during signal closure, see [Signal Lifecycle](./44_Signal_Lifecycle.md).

---

## Overview

The PnL calculation system provides realistic profit/loss metrics by simulating market conditions that affect actual trading:

- **Slippage**: Models worse execution prices due to market impact and order book depth (0.1%)
- **Fees**: Accounts for exchange transaction costs charged at entry and exit (0.1% each)
- **Position-aware**: Different formulas for LONG and SHORT positions
- **Type-safe**: Returns structured `IStrategyPnL` interface with all price points

PnL is calculated in the `toProfitLossDto` helper function and invoked by `ClientStrategy` when a signal closes for any reason (take profit, stop loss, or time expiration).

**Sources**: [src/helpers/toProfitLossDto.ts:1-93](), [README.md:600-616]()

---

## Constants and Configuration

The framework uses fixed percentage constants to simulate realistic trading costs:

| Constant | Value | Description | Applied When |
|----------|-------|-------------|--------------|
| `PERCENT_SLIPPAGE` | 0.1% | Market impact and order book depth simulation | Entry and exit (opposite directions) |
| `PERCENT_FEE` | 0.1% | Exchange transaction fee per trade | Entry and exit (total 0.2%) |

```typescript
// src/helpers/toProfitLossDto.ts
const PERCENT_SLIPPAGE = 0.1;  // Line 7
const PERCENT_FEE = 0.1;       // Line 13
```

These constants ensure that:
- Backtested results are conservative and account for real-world costs
- Live trading expectations align with backtest performance
- Signal validation includes realistic entry/exit conditions

**Sources**: [src/helpers/toProfitLossDto.ts:7-13](), [README.md:604-606]()

---

## Calculation Formula

### Function Signature

The `toProfitLossDto` function accepts a closed signal and its closing price, returning a PnL data structure:

```typescript
// Input
interface ISignalRow {
  position: "long" | "short";
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  // ... other fields
}

// Output
interface IStrategyPnL {
  pnlPercentage: number;      // Net PnL after costs
  priceOpen: number;          // Original open price
  priceClose: number;         // Actual close price
}
```

**Sources**: [src/helpers/toProfitLossDto.ts:44-47](), [src/interfaces/Strategy.interface.ts]()

---

### PnL Calculation Flow

The following diagram shows how `toProfitLossDto` processes a closed signal:

![Mermaid Diagram](./diagrams/49_PnL_Calculation_0.svg)

**Sources**: [src/helpers/toProfitLossDto.ts:44-90]()

---

### LONG Position PnL

For LONG positions, traders profit when price increases. The calculation accounts for buying at a worse price (higher) and selling at a worse price (lower):

**Step 1: Apply Slippage**
```typescript
// Buy at slightly higher price (worse execution)
priceOpenWithSlippage = priceOpen * (1 + PERCENT_SLIPPAGE / 100)
// Example: 50000 * 1.001 = 50050

// Sell at slightly lower price (worse execution)  
priceCloseWithSlippage = priceClose * (1 - PERCENT_SLIPPAGE / 100)
// Example: 51000 * 0.999 = 50949
```

**Step 2: Calculate Raw PnL**
```typescript
pnlPercentage = ((priceCloseWithSlippage - priceOpenWithSlippage) / priceOpenWithSlippage) * 100
// Example: ((50949 - 50050) / 50050) * 100 = 1.796%
```

**Step 3: Subtract Fees**
```typescript
totalFee = PERCENT_FEE * 2  // 0.2% (entry + exit)
pnlPercentage -= totalFee
// Example: 1.796% - 0.2% = 1.596%
```

**Sources**: [src/helpers/toProfitLossDto.ts:53-73](), [README.md:608-610]()

---

### SHORT Position PnL

For SHORT positions, traders profit when price decreases. The calculation accounts for selling at a worse price (lower) and buying back at a worse price (higher):

**Step 1: Apply Slippage**
```typescript
// Sell at slightly lower price (worse execution)
priceOpenWithSlippage = priceOpen * (1 - PERCENT_SLIPPAGE / 100)
// Example: 50000 * 0.999 = 49950

// Buy back at slightly higher price (worse execution)
priceCloseWithSlippage = priceClose * (1 + PERCENT_SLIPPAGE / 100)
// Example: 49000 * 1.001 = 49049
```

**Step 2: Calculate Raw PnL**
```typescript
pnlPercentage = ((priceOpenWithSlippage - priceCloseWithSlippage) / priceOpenWithSlippage) * 100
// Example: ((49950 - 49049) / 49950) * 100 = 1.804%
```

**Step 3: Subtract Fees**
```typescript
totalFee = PERCENT_FEE * 2  // 0.2% (entry + exit)
pnlPercentage -= totalFee
// Example: 1.804% - 0.2% = 1.604%
```

**Sources**: [src/helpers/toProfitLossDto.ts:58-80](), [README.md:612-615]()

---

## Slippage Simulation

Slippage simulates the reality that orders don't execute at ideal prices. The framework applies slippage in opposite directions for entry and exit:

### LONG Position Slippage

| Action | Ideal Price | Slippage Direction | Adjusted Price | Rationale |
|--------|-------------|-------------------|----------------|-----------|
| Entry (Buy) | `priceOpen` | +0.1% | `priceOpen * 1.001` | Buy orders fill at higher prices |
| Exit (Sell) | `priceClose` | -0.1% | `priceClose * 0.999` | Sell orders fill at lower prices |

### SHORT Position Slippage

| Action | Ideal Price | Slippage Direction | Adjusted Price | Rationale |
|--------|-------------|-------------------|----------------|-----------|
| Entry (Sell) | `priceOpen` | -0.1% | `priceOpen * 0.999` | Sell orders fill at lower prices |
| Exit (Buy) | `priceClose` | +0.1% | `priceClose * 1.001` | Buy orders fill at higher prices |

This bi-directional slippage ensures both entry and exit are penalized, providing conservative estimates that better match real trading outcomes.

**Sources**: [src/helpers/toProfitLossDto.ts:50-61]()

---

## Fee Application

Exchange fees are applied twice per trade (entry and exit), resulting in a total fee of 0.2%:

```typescript
const totalFee = PERCENT_FEE * 2;  // 0.1% + 0.1% = 0.2%
pnlPercentage -= totalFee;
```

This models the reality that:
- Opening a position incurs a transaction fee (typically 0.05-0.1% on spot markets)
- Closing a position incurs another transaction fee
- Fees reduce net profit or increase net loss

The fee is subtracted **after** slippage-adjusted PnL calculation, ensuring both cost factors are accounted for independently.

**Sources**: [src/helpers/toProfitLossDto.ts:63-83]()

---

## Integration with Signal Lifecycle

The `toProfitLossDto` function is called by `ClientStrategy` when a signal transitions to the `closed` state. The following diagram shows where PnL calculation fits in the system:

![Mermaid Diagram](./diagrams/49_PnL_Calculation_1.svg)

**Call Chain**:
1. `ClientStrategy.tick()` detects close condition (TP/SL/time)
2. `ClientExchange.getAveragePrice()` fetches current VWAP
3. `toProfitLossDto(signal, vwap)` calculates PnL
4. `IStrategyTickResultClosed` is yielded with PnL data
5. `PersistSignalAdapter` clears signal from disk
6. Markdown services accumulate statistics

**Sources**: [src/client/ClientStrategy.ts](), [src/helpers/toProfitLossDto.ts:44-90](), [src/client/ClientExchange.ts:172-203]()

---

## Worked Examples

### Example 1: Profitable LONG Position

**Setup:**
- Position: LONG
- Entry Price: 50,000 USDT
- Exit Price: 51,000 USDT (Take Profit hit)
- Price Change: +2.0%

**Calculation:**
```typescript
// Step 1: Apply slippage
priceOpenWithSlippage = 50000 * 1.001 = 50,050
priceCloseWithSlippage = 51000 * 0.999 = 50,949

// Step 2: Calculate raw PnL
rawPnL = ((50949 - 50050) / 50050) * 100 = 1.796%

// Step 3: Subtract fees
netPnL = 1.796% - 0.2% = 1.596%
```

**Result**: +1.596% profit (reduced from +2.0% ideal)

---

### Example 2: Loss-Making SHORT Position

**Setup:**
- Position: SHORT
- Entry Price: 50,000 USDT
- Exit Price: 51,000 USDT (Stop Loss hit)
- Price Change: +2.0%

**Calculation:**
```typescript
// Step 1: Apply slippage
priceOpenWithSlippage = 50000 * 0.999 = 49,950
priceCloseWithSlippage = 51000 * 1.001 = 51,051

// Step 2: Calculate raw PnL
rawPnL = ((49950 - 51051) / 49950) * 100 = -2.204%

// Step 3: Subtract fees
netPnL = -2.204% - 0.2% = -2.404%
```

**Result**: -2.404% loss (worse than -2.0% ideal due to slippage and fees)

---

### Example 3: Small Profit Becoming Loss

**Setup:**
- Position: LONG
- Entry Price: 50,000 USDT
- Exit Price: 50,100 USDT (Time expired)
- Price Change: +0.2%

**Calculation:**
```typescript
// Step 1: Apply slippage
priceOpenWithSlippage = 50000 * 1.001 = 50,050
priceCloseWithSlippage = 50100 * 0.999 = 50,049.9

// Step 2: Calculate raw PnL
rawPnL = ((50049.9 - 50050) / 50050) * 100 = -0.0002%

// Step 3: Subtract fees
netPnL = -0.0002% - 0.2% = -0.2002%
```

**Result**: -0.2002% loss (slippage eliminated the small profit, fees made it negative)

This demonstrates why the framework's realistic cost modeling is important—strategies that appear profitable without costs may actually lose money in practice.

**Sources**: [src/helpers/toProfitLossDto.ts:44-90](), [README.md:117-122]()

---

## PnL in Reports

Calculated PnL values appear in markdown reports generated by `BacktestMarkdownService` and `LiveMarkdownService`:

**Backtest Report Format:**
```markdown
| Timestamp | Action | Symbol | Signal ID | Position | ... | PNL (net) | Close Reason |
|-----------|--------|--------|-----------|----------|-----|-----------|--------------|
| ...       | CLOSED | BTCUSD | abc-123   | LONG     | ... | +1.596%   | take_profit  |
| ...       | CLOSED | BTCUSD | def-456   | SHORT    | ... | -2.404%   | stop_loss    |
```

**Live Report Statistics:**
```markdown
# Live Trading Report: my-strategy

Total events: 15
Closed signals: 5
Win rate: 60.00% (3W / 2L)
Average PNL: +1.23%
```

The average PNL statistic is calculated from all closed signal PnL percentages, providing a performance summary across all trades.

**Sources**: [src/lib/services/markdown/BacktestMarkdownService.ts](), [src/lib/services/markdown/LiveMarkdownService.ts](), [README.md:320-332]()

---

## Summary

The PnL calculation system ensures realistic trading performance metrics through:

- **Slippage modeling**: 0.1% penalty on entry and exit in opposite directions
- **Fee accounting**: 0.2% total (0.1% entry + 0.1% exit)
- **Position-specific logic**: Different formulas for LONG vs SHORT
- **Type-safe output**: Structured `IStrategyPnL` interface

This conservative approach ensures backtest results translate more accurately to live trading, preventing over-optimistic strategy validation.

**Sources**: [src/helpers/toProfitLossDto.ts:1-93](), [README.md:600-616]()