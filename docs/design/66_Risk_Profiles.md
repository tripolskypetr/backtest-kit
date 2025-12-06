---
title: design/66_risk_profiles
group: design
---

# Risk Profiles

This page documents the risk profile system in backtest-kit, explaining how `IRiskSchema` structures define portfolio-level risk controls, how risk profiles are isolated by `riskName`, and how multiple strategies share risk limits through custom validation functions. For risk validation execution flow, see [Risk Validation](./67_Risk_Validation.md). For position tracking implementation details, see [Position Tracking](./68_Position_Tracking.md). For risk schema registration API, see [Risk Schemas](./27_Risk_Schemas.md).

---

## Purpose and Scope

Risk profiles provide portfolio-level risk management across multiple strategies. A risk profile is identified by a unique `riskName` and defines custom validation functions that can reject signals based on active positions, portfolio state, or any custom logic. Multiple strategies can reference the same `riskName` to share risk limits (e.g., maximum 5 concurrent positions across all strategies using "conservative-risk").

Risk profiles are **not** per-strategy limits. They are shared constraints that strategies opt into by specifying `riskName` in their schema.

---

## Risk Schema Structure

The `IRiskSchema` interface defines a risk profile registered via `addRisk()`:

```typescript
interface IRiskSchema {
  riskName: RiskName;                                    // Unique identifier
  note?: string;                                         // Optional documentation
  callbacks?: Partial<IRiskCallbacks>;                   // onRejected, onAllowed
  validations: (IRiskValidation | IRiskValidationFn)[]; // Custom validation logic
}
```

**Key Components:**

| Field | Type | Purpose |
|-------|------|---------|
| `riskName` | `string` | Unique identifier for this risk profile (e.g., "conservative", "aggressive") |
| `note` | `string` (optional) | Developer documentation explaining risk profile purpose |
| `callbacks` | `Partial<IRiskCallbacks>` (optional) | Event handlers for rejected/allowed signals |
| `validations` | `Array` | Custom validation functions that throw errors to reject signals |

**Validation Array Format:**

Validations can be provided as:
1. **Function**: `(payload: IRiskValidationPayload) => void | Promise<void>`
2. **Object**: `{ validate: Function, note?: string }` for documentation


---

## Risk Profile Isolation

Each `riskName` creates an **isolated risk profile** with its own:
- Active position tracking
- Persistence storage
- ClientRisk instance (memoized)

### Isolation Mechanism

![Mermaid Diagram](./diagrams/66_Risk_Profiles_0.svg)

**Diagram: Risk Profile Isolation Architecture**

Multiple strategies sharing `riskName: "conservative"` all contribute to the same `activePositionCount`. Strategies using different risk profiles have independent position tracking.


---

## Custom Validation Functions

Validation functions receive `IRiskValidationPayload` and **throw errors to reject signals**:

```typescript
interface IRiskValidationPayload extends IRiskCheckArgs {
  activePositionCount: number;        // Total positions in this risk profile
  activePositions: IRiskActivePosition[]; // Full position details
  // From IRiskCheckArgs:
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  currentPrice: number;
  timestamp: number;
}
```

### Validation Patterns

**Pattern 1: Limit Concurrent Positions**

```typescript
addRisk({
  riskName: "max-5-positions",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 5) {
        throw new Error("Maximum 5 concurrent positions exceeded");
      }
    }
  ]
});
```

**Pattern 2: Symbol-Based Filtering**

```typescript
addRisk({
  riskName: "no-doge",
  validations: [
    ({ symbol }) => {
      if (symbol === "DOGEUSDT") {
        throw new Error("DOGE trading not allowed");
      }
    }
  ]
});
```

**Pattern 3: Cross-Position Analysis**

```typescript
addRisk({
  riskName: "diversified",
  validations: [
    ({ activePositions, symbol }) => {
      const symbolCount = activePositions.filter(p => p.signal.symbol === symbol).length;
      if (symbolCount >= 2) {
        throw new Error(`Already have ${symbolCount} positions on ${symbol}`);
      }
    }
  ]
});
```

**Pattern 4: Documented Validation**

```typescript
addRisk({
  riskName: "complex",
  validations: [
    {
      validate: async ({ activePositionCount, currentPrice }) => {
        // Custom async logic
        if (activePositionCount >= 10 && currentPrice > 50000) {
          throw new Error("Too many high-value positions");
        }
      },
      note: "Prevents excessive exposure during high-price periods"
    }
  ]
});
```


---

## Validation Execution Flow

![Mermaid Diagram](./diagrams/66_Risk_Profiles_1.svg)

**Diagram: Risk Validation and Position Tracking Flow**

The `DO_VALIDATION_FN` wrapper catches errors and converts them to `false` return values, preventing exceptions from propagating. Validation errors are also emitted to `validationSubject` for observability.


---

## Position Tracking System

### Active Position Map

`ClientRisk` tracks positions using `Map<string, IRiskActivePosition>` with keys generated by `GET_KEY_FN`:

```typescript
const GET_KEY_FN = (strategyName: string, symbol: string) => `${strategyName}:${symbol}`;
```

**Key Structure:** `strategyName:symbol` (e.g., `"momentum-strategy:BTCUSDT"`)

This allows:
- Same symbol across different strategies (tracked separately)
- Different symbols for same strategy (tracked separately)
- Precise removal when signals close

### Position Lifecycle Operations

![Mermaid Diagram](./diagrams/66_Risk_Profiles_2.svg)

**Diagram: Position Tracking State Machine**

### Position Data Structure

```typescript
interface IRiskActivePosition {
  signal: ISignalRow;         // Signal details (id, prices, timestamps)
  strategyName: string;       // Owning strategy
  exchangeName: string;       // Exchange name
  openTimestamp: number;      // When position opened (Date.now())
}
```

**Note:** The `signal` field is stored as `null` in the actual implementation ([src/client/ClientRisk.ts:121]()) since detailed signal information isn't needed for risk validation - only counts and keys matter.


---

## Cross-Strategy Risk Management

### Shared Risk Profile Example

![Mermaid Diagram](./diagrams/66_Risk_Profiles_3.svg)

**Diagram: Cross-Strategy Position Limit Enforcement**

When `macd-long` attempts to open a new signal, it sees positions from `rsi-long` and `macd-short` because they all share `riskName: "shared-5"`. The validation `activePositionCount >= 5` checks the **combined count** across all strategies.

### Isolation vs Sharing Trade-offs

| Approach | Use Case | Position Count |
|----------|----------|----------------|
| **One riskName per strategy** | Independent limits per strategy | Each strategy has its own `activePositionCount` |
| **Shared riskName** | Portfolio-level limit | All strategies contribute to same `activePositionCount` |
| **Multiple risk profiles** | Different risk tiers (conservative, aggressive) | Separate tracking per risk profile |

**Example:**
```typescript
// Isolated risk per strategy
addStrategy({ strategyName: "strat-1", riskName: "risk-1" }); // max 5 positions
addStrategy({ strategyName: "strat-2", riskName: "risk-2" }); // max 5 positions
// Total possible positions: 10 (5 + 5)

// Shared risk across strategies
addStrategy({ strategyName: "strat-1", riskName: "shared" }); // max 5 positions
addStrategy({ strategyName: "strat-2", riskName: "shared" }); // max 5 positions
// Total possible positions: 5 (shared limit)
```


---

## Persistence and Crash Recovery

### Persistence Adapter

`PersistRiskAdapter` provides crash-safe position tracking for live trading:

```typescript
// Position data format
type RiskData = Array<[string, IRiskActivePosition]>;

// Adapter methods
PersistRiskAdapter.writePositionData(positions, riskName);
PersistRiskAdapter.readPositionData(riskName);
```

**File Location:** `risk-{riskName}.json` (configurable via custom adapter)

**Isolation:** Each `riskName` has its own persistence file, ensuring data isolation between risk profiles.

### Initialization Pattern

![Mermaid Diagram](./diagrams/66_Risk_Profiles_4.svg)

**Diagram: Crash Recovery Initialization Flow**

The `singleshot` pattern ensures `waitForInit()` only executes once per `ClientRisk` instance, even if called multiple times concurrently.


---

## Risk Callbacks

Callbacks provide observability into risk decisions:

```typescript
interface IRiskCallbacks {
  onRejected: (symbol: string, params: IRiskCheckArgs) => void;
  onAllowed: (symbol: string, params: IRiskCheckArgs) => void;
}
```

### Usage Example

```typescript
addRisk({
  riskName: "monitored",
  validations: [
    ({ activePositionCount }) => {
      if (activePositionCount >= 3) {
        throw new Error("Max 3 positions");
      }
    }
  ],
  callbacks: {
    onRejected: (symbol, params) => {
      console.log(`Signal rejected for ${symbol}:`, params);
      // Log to monitoring system, send alert, etc.
    },
    onAllowed: (symbol, params) => {
      console.log(`Signal allowed for ${symbol}:`, params);
      // Track allowed signals for analytics
    }
  }
});
```

**Callback Execution Points:**

1. **onRejected**: Called when any validation throws an error ([src/client/ClientRisk.ts:203-206]())
2. **onAllowed**: Called when all validations pass ([src/client/ClientRisk.ts:212-214]())


---

## Complete Risk Profile Example

```typescript
import { addRisk, addStrategy } from "backtest-kit";

// Define shared risk profile
addRisk({
  riskName: "portfolio-conservative",
  note: "Conservative risk with max 5 positions and symbol limits",
  validations: [
    {
      validate: ({ activePositionCount }) => {
        if (activePositionCount >= 5) {
          throw new Error("Maximum 5 concurrent positions");
        }
      },
      note: "Portfolio-level position limit"
    },
    {
      validate: ({ activePositions, symbol }) => {
        const symbolPositions = activePositions.filter(
          p => p.signal.symbol === symbol
        );
        if (symbolPositions.length >= 2) {
          throw new Error(`Already have ${symbolPositions.length} positions on ${symbol}`);
        }
      },
      note: "Per-symbol concentration limit"
    },
    ({ currentPrice, symbol }) => {
      // Block high-risk symbols
      const volatileSymbols = ["DOGEUSDT", "SHIBAINU"];
      if (volatileSymbols.includes(symbol)) {
        throw new Error(`Symbol ${symbol} blocked due to volatility`);
      }
    }
  ],
  callbacks: {
    onRejected: (symbol, params) => {
      console.warn(`Risk rejected ${symbol} for ${params.strategyName}`);
    },
    onAllowed: (symbol, params) => {
      console.log(`Risk allowed ${symbol} for ${params.strategyName}`);
    }
  }
});

// Multiple strategies share this risk profile
addStrategy({
  strategyName: "momentum-long",
  riskName: "portfolio-conservative",  // Shares limits
  // ... strategy config
});

addStrategy({
  strategyName: "mean-reversion-short",
  riskName: "portfolio-conservative",  // Shares limits
  // ... strategy config
});
```


---

## Key Takeaways

1. **Risk Profiles Are Shared:** Multiple strategies referencing the same `riskName` share position limits
2. **Validation Controls Access:** Throw errors in validation functions to reject signals
3. **Position Tracking Is Automatic:** Framework manages `addSignal`/`removeSignal` lifecycle
4. **Persistence Enables Recovery:** Live mode restores active positions from disk on restart
5. **Isolation By riskName:** Each risk profile has independent position tracking and persistence
6. **Cross-Strategy Analysis:** Validations see all active positions across strategies using this risk profile
