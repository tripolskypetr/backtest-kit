---
title: design/14_risk-management
group: design
---

# Risk Management

This document describes the risk management system that validates trading signals before execution. Risk profiles define portfolio-level controls such as position limits, time windows, and custom validation logic. For strategy-level signal validation (TP/SL distances, price checks), see [Strategy Execution Flow](./13-strategy-execution-flow.md). For position sizing calculations, see [Position Sizing](./15-position-sizing.md).

---

## Overview

The risk management system enforces portfolio-level constraints on signal creation through custom validation functions. Risk profiles are registered via `addRisk()` and referenced by strategies through `riskName` or `riskList` fields. Risk checks execute **before** signals are created or activated, preventing invalid positions from entering the portfolio.

**Key Features:**
- Custom validation functions with access to portfolio state
- Position tracking across multiple strategies
- Multi-risk composition via `MergeRisk`
- Event emission for rejected signals
- Strategy-level or portfolio-level scoping

---

## Risk Schema Registration

Risk profiles are registered using `addRisk()` and stored in `RiskSchemaService`. Each profile contains a unique identifier, optional callbacks, and an array of validation functions.

### IRiskSchema Structure

```typescript
interface IRiskSchema {
  riskName: RiskName;                                  // Unique identifier
  note?: string;                                       // Documentation
  callbacks?: Partial<IRiskCallbacks>;                 // Event hooks
  validations: (IRiskValidation | IRiskValidationFn)[]; // Validation array
}

interface IRiskValidation {
  validate: IRiskValidationFn;  // Validation function
  note?: string;                 // Description for rejection message
}
```

### Registration Example

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `riskName` | `string` | Yes | Unique risk profile identifier |
| `note` | `string` | No | Developer documentation |
| `validations` | `Array` | Yes | Array of validation functions or validation objects |
| `callbacks` | `Object` | No | `onRejected`, `onAllowed` event hooks |

---

## Validation Function Interface

Validation functions receive `IRiskValidationPayload` containing signal details, portfolio state, and active positions. Functions should throw an error to reject the signal, or return `void`/`Promise<void>` to allow it.

### IRiskValidationPayload Structure

```typescript
interface IRiskValidationPayload {
  symbol: string;                     // Trading pair (e.g., "BTCUSDT")
  pendingSignal: ISignalDto;          // Signal to validate
  strategyName: StrategyName;         // Strategy requesting position
  exchangeName: ExchangeName;         // Exchange name
  currentPrice: number;               // Current VWAP price
  timestamp: number;                  // Request timestamp (ms)
  activePositionCount: number;        // Total active positions
  activePositions: IRiskActivePosition[]; // List of active positions
}

interface IRiskActivePosition {
  signal: ISignalRow;       // Active signal details
  strategyName: string;     // Owning strategy
  exchangeName: string;     // Exchange name
  openTimestamp: number;    // Position open time (ms)
}
```

### Common Validation Patterns

**Maximum Position Limit:**
```typescript
({ activePositionCount }) => {
  if (activePositionCount >= 3) {
    throw new Error("Maximum 3 concurrent positions");
  }
}
```

**Symbol Filter:**
```typescript
({ symbol }) => {
  if (symbol === "BTCUSDT") {
    throw new Error("BTC trading not allowed");
  }
}
```

**Time Window:**
```typescript
({ timestamp }) => {
  const hour = new Date(timestamp).getHours();
  if (hour < 9 || hour > 16) {
    throw new Error("Trading only allowed 9am-4pm");
  }
}
```

**Risk/Reward Ratio:**
```typescript
({ pendingSignal, currentPrice }) => {
  const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
  const reward = position === "long" ? priceTakeProfit - priceOpen : priceOpen - priceTakeProfit;
  const risk = position === "long" ? priceOpen - priceStopLoss : priceStopLoss - priceOpen;
  if (reward / risk < 2) {
    throw new Error("R/R ratio must be >= 2:1");
  }
}
```

---

## Risk Check Lifecycle

Risk validation occurs at two points in the signal lifecycle: (1) when `getSignal()` returns a new signal, and (2) when a scheduled signal activates at `priceOpen`. The validation process is identical in both cases.

### Risk Validation Flow

![Mermaid Diagram](./diagrams\14-risk-management_0.svg)

---

## Risk Check Arguments

The `IRiskCheckArgs` interface defines the parameters passed from `ClientStrategy` to `ClientRisk.checkSignal()`. These are **passthrough arguments** from the strategy context, without portfolio state.

### IRiskCheckArgs vs IRiskValidationPayload

![Mermaid Diagram](./diagrams\14-risk-management_1.svg)

**Key Distinction:**
- `IRiskCheckArgs` - Input to `checkSignal()` from strategy
- `IRiskValidationPayload` - Extended payload passed to validation functions, includes `activePositionCount` and `activePositions[]`

---

## Position Tracking

The risk system maintains a registry of active positions to enable cross-strategy validation. Positions are tracked in `PersistRiskAdapter` (crash-safe JSON storage) and loaded on demand during risk checks.

### Position Lifecycle

![Mermaid Diagram](./diagrams\14-risk-management_2.svg)

### RiskData Structure

```typescript
interface RiskData {
  positions: IRiskActivePosition[];  // Array of active positions
}

interface IRiskActivePosition {
  signal: ISignalRow;      // Full signal details
  strategyName: string;    // Owning strategy
  exchangeName: string;    // Exchange name
  openTimestamp: number;   // When position opened (ms)
}
```

**Persistence Details:**
- Storage: `./dump/{symbol}_{riskName}_risk.json`
- Format: `{ positions: IRiskActivePosition[] }`
- Atomic writes via `singleshot` pattern
- Loaded during `checkSignal()` to populate `activePositions`

---

## Component Architecture

The risk system uses dependency injection to route risk checks through memoized `ClientRisk` instances. Strategies reference risk profiles by `riskName`, and `RiskConnectionService` ensures singleton instances per risk profile.

![Mermaid Diagram](./diagrams\14-risk-management_3.svg)

**Key Components:**

| Component | File Path | Purpose |
|-----------|-----------|---------|
| `addRisk()` | [src/function/add.ts]() | Public registration API |
| `RiskSchemaService` | [src/lib/services/schema/RiskSchemaService.ts]() | Schema storage and retrieval |
| `RiskValidationService` | [src/lib/services/validation/RiskValidationService.ts]() | Schema validation |
| `RiskConnectionService` | [src/lib/services/connection/RiskConnectionService.ts]() | Memoized ClientRisk factory |
| `ClientRisk` | [src/client/ClientRisk.ts]() | Risk checking implementation |
| `PersistRiskAdapter` | [src/classes/Persist.ts]() | Position persistence (JSON) |
| `riskSubject` | [src/config/emitters.ts:131]() | Rejection event emitter |
| `MergeRisk` | [src/classes/Risk.ts]() | Multi-risk composition |

---

## Multi-Risk Composition

Strategies can reference multiple risk profiles using `riskList` (array) or combine `riskName` with `riskList`. The `MergeRisk` class executes validations sequentially across all profiles.

### Risk Resolution Logic

```typescript
// From StrategyConnectionService.ts
const GET_RISK_FN = (dto, self) => {
  const hasRiskName = !!dto.riskName;
  const hasRiskList = !!(dto.riskList?.length);
  
  // No risk management
  if (!hasRiskName && !hasRiskList) {
    return NOOP_RISK;
  }
  
  // Single risk profile
  if (hasRiskName && !hasRiskList) {
    return self.riskConnectionService.getRisk(dto.riskName);
  }
  
  // Multiple risk profiles (riskList only)
  if (!hasRiskName && hasRiskList) {
    return new MergeRisk(
      dto.riskList.map((riskName) => self.riskConnectionService.getRisk(riskName))
    );
  }
  
  // Combined (riskName + riskList)
  return new MergeRisk([
    self.riskConnectionService.getRisk(dto.riskName),
    ...dto.riskList.map((riskName) => self.riskConnectionService.getRisk(riskName))
  ]);
};
```

### MergeRisk Behavior

![Mermaid Diagram](./diagrams\14-risk-management_4.svg)

**Usage Example:**
```typescript
addStrategy({
  strategyName: "multi-risk-strategy",
  interval: "1m",
  riskName: "max-3-positions",     // Primary risk profile
  riskList: ["symbol-filter", "time-window"], // Additional profiles
  getSignal: async () => { /* ... */ }
});
```

**Validation Order:**
1. `max-3-positions` validations (from `riskName`)
2. `symbol-filter` validations (from `riskList[0]`)
3. `time-window` validations (from `riskList[1]`)

**Short-Circuit:** If any validation fails, remaining profiles are not checked and signal is rejected.

---

## Event System Integration

Risk rejections emit events via `riskSubject` for monitoring and alerting. Subscribers can track rejection frequency, reasons, and portfolio state at rejection time.

### Risk Events

![Mermaid Diagram](./diagrams\14-risk-management_5.svg)

### RiskContract Structure

```typescript
interface RiskContract {
  symbol: string;              // Trading pair
  strategyName: string;        // Strategy that was rejected
  exchangeName: string;        // Exchange name
  activePositionCount: number; // Portfolio state at rejection
  comment: string;             // Rejection reason (from validation note or "N/A")
  timestamp: number;           // Event timestamp (ms)
}
```

### Listening for Rejections

```typescript
import { listenRisk, listenRiskOnce } from "backtest-kit";

// Subscribe to all rejections
const unsubscribe = listenRisk((event) => {
  console.log(`Signal rejected: ${event.comment}`);
  console.log(`Active positions: ${event.activePositionCount}`);
  console.log(`Strategy: ${event.strategyName}`);
  // Send alert to monitoring service
});

// Wait for first rejection on BTCUSDT
listenRiskOnce(
  (event) => event.symbol === "BTCUSDT",
  (event) => console.log(`BTCUSDT rejection: ${event.comment}`)
);
```

**Callback Hooks:**
- `callbacks.onRejected(symbol, params)` - Called when signal rejected (before event emission)
- `callbacks.onAllowed(symbol, params)` - Called when signal passes all validations

---

## Risk Statistics and Reporting

The `RiskMarkdownService` accumulates rejection events to generate statistics reports. Use `Risk.getData()` to retrieve aggregated metrics or `Risk.dump()` to write markdown files.

### Risk Statistics

```typescript
interface RiskStatistics {
  totalRejections: number;       // Total rejection count
  rejectionsByReason: Map<string, number>; // Group by comment
  rejectionsByStrategy: Map<string, number>; // Group by strategyName
  rejectionsBySymbol: Map<string, number>;   // Group by symbol
  avgActivePositions: number;    // Average positions at rejection
}
```

### Report Generation

```typescript
import { Risk, listenRisk } from "backtest-kit";

// Collect rejection events
listenRisk((event) => {
  // Events are automatically collected by RiskMarkdownService
});

// After backtest/live execution
const stats = await Risk.getData("my-risk-profile");
console.log(`Total rejections: ${stats.totalRejections}`);

// Generate markdown report
await Risk.dump("my-risk-profile");
// Writes to: ./dump/my-risk-profile_risk.md
```

**Report Contents:**
- Rejection count by reason
- Rejection count by strategy
- Rejection count by symbol
- Average active positions at rejection
- Full rejection event table (timestamp, symbol, strategy, reason, positions)

---

## Configuration Parameters

Risk-related global configuration parameters control validation behavior and timeouts.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `CC_MIN_TAKEPROFIT_DISTANCE_PERCENT` | `number` | `0.5` | Minimum TP distance from priceOpen (%) |
| `CC_MIN_STOPLOSS_DISTANCE_PERCENT` | `number` | `0.5` | Minimum SL distance from priceOpen (%) |
| `CC_MAX_STOPLOSS_DISTANCE_PERCENT` | `number` | `20` | Maximum SL distance from priceOpen (%) |
| `CC_MAX_SIGNAL_LIFETIME_MINUTES` | `number` | `1440` | Maximum signal lifetime (minutes) |
| `CC_SCHEDULE_AWAIT_MINUTES` | `number` | `120` | Scheduled signal timeout (minutes) |

**Note:** These parameters are enforced by `VALIDATE_SIGNAL_FN()` in `ClientStrategy`, not by risk validations. They define **strategy-level** constraints. Custom risk validations can enforce additional **portfolio-level** constraints.

**Configuration API:**
```typescript
import { setConfig } from "backtest-kit";

setConfig({
  CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: 1.0,  // Require 1% min TP
  CC_MAX_SIGNAL_LIFETIME_MINUTES: 720,      // Max 12 hours per signal
});
```

---

## Common Use Cases

### Portfolio Position Limit

```typescript
addRisk({
  riskName: "max-3-positions",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 3) {
        throw new Error("Maximum 3 concurrent positions");
      }
    }
  ]
});
```

### Per-Symbol Position Limit

```typescript
addRisk({
  riskName: "max-1-per-symbol",
  validations: [
    ({ symbol, activePositions }) => {
      const symbolPositions = activePositions.filter(p => p.signal.symbol === symbol);
      if (symbolPositions.length >= 1) {
        throw new Error(`Maximum 1 position for ${symbol}`);
      }
    }
  ]
});
```

### Time-Based Trading Window

```typescript
addRisk({
  riskName: "trading-hours",
  validations: [
    ({ timestamp }) => {
      const hour = new Date(timestamp).getUTCHours();
      if (hour < 9 || hour > 16) {
        throw new Error("Trading only allowed 09:00-16:00 UTC");
      }
    }
  ]
});
```

### Minimum Risk/Reward Ratio

```typescript
addRisk({
  riskName: "rr-2to1",
  validations: [
    {
      validate: ({ pendingSignal, currentPrice }) => {
        const { priceOpen = currentPrice, priceTakeProfit, priceStopLoss, position } = pendingSignal;
        const reward = position === "long" 
          ? priceTakeProfit - priceOpen 
          : priceOpen - priceTakeProfit;
        const risk = position === "long" 
          ? priceOpen - priceStopLoss 
          : priceStopLoss - priceOpen;
        if (reward / risk < 2) {
          throw new Error("Risk/Reward ratio must be >= 2:1");
        }
      },
      note: "R/R ratio validation"
    }
  ]
});
```

### Strategy-Specific Limits

```typescript
addRisk({
  riskName: "strategy-limits",
  validations: [
    ({ strategyName, activePositions }) => {
      const strategyPositions = activePositions.filter(
        p => p.strategyName === strategyName
      );
      if (strategyPositions.length >= 2) {
        throw new Error(`Strategy ${strategyName} has max 2 positions`);
      }
    }
  ]
});
```

