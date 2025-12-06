# ClientSizing

ClientSizing implements position size calculation logic for trading signals. It provides three distinct sizing methods: fixed percentage allocation, Kelly criterion optimization, and ATR-based volatility scaling. This class belongs to the Client Classes layer (Layer 4) and operates without dependency injection, accepting all dependencies through constructor parameters.

For information about risk validation and portfolio limits, see [ClientRisk](./35_ClientRisk.md). For strategy-level signal generation, see [ClientStrategy](./47_Signal_States.md).

## Purpose and Scope

ClientSizing calculates the quantity of an asset to trade based on portfolio state and signal parameters. It consumes a sizing schema (registered via `addSizing()`) and execution context, then returns a formatted position size via the `calculatePositionSize()` method. The calculation considers:

- Portfolio balance
- Signal parameters (entry price, stop loss)
- Historical price data (for ATR calculations)
- Risk tolerance parameters from the sizing schema

ClientSizing does not validate signals, track positions, or interact with exchanges. These responsibilities belong to ClientStrategy, ClientRisk, and ClientExchange respectively.

**Sources:** [types.d.ts:535-632]()

## Architecture Context

ClientSizing sits in the Client Classes layer and is instantiated by SizingConnectionService. The connection service memoizes one ClientSizing instance per sizing schema name.

![Mermaid Diagram](./diagrams/36_ClientSizing_0.svg)

**Sources:** [types.d.ts:535-632](), High-Level Architecture Diagrams (Diagram 4)

## Sizing Schema Types

ClientSizing supports three sizing methods, each defined by a discriminated union type. The `method` field serves as the discriminator.

### Schema Comparison Table

| Method | Discriminator | Key Parameters | Use Case |
|--------|---------------|----------------|----------|
| Fixed Percentage | `"fixed-percentage"` | `percentage` | Simple constant allocation |
| Kelly Criterion | `"kelly-criterion"` | `winRate`, `avgWinPnl`, `avgLossPnl` | Optimal allocation based on edge |
| ATR-Based | `"atr-based"` | `atrMultiplier`, `atrPeriod` | Volatility-adjusted sizing |

**Sources:** [types.d.ts:548-632]()

## Fixed Percentage Method

Fixed percentage sizing allocates a constant percentage of the portfolio to each trade. This is the simplest method and requires no historical data or performance statistics.

### Schema Interface

The schema for fixed percentage sizing:

```typescript
interface ISizingSchemaFixedPercentage {
  sizingName: string;
  method: "fixed-percentage";
  params: {
    percentage: number;  // e.g., 0.02 for 2% of portfolio
  };
}
```

### Calculation Parameters

When ClientStrategy calls `calculatePositionSize()` for a fixed percentage signal:

```typescript
interface ISizingCalculateParamsFixedPercentage {
  method: "fixed-percentage";
  params: {
    portfolioBalance: number;  // Current account balance
    entryPrice: number;        // Signal's priceOpen
  };
}
```

### Calculation Logic

The position size formula:

```
positionSize = (portfolioBalance × percentage) / entryPrice
```

**Example:**
- Portfolio balance: $10,000
- Percentage: 2% (0.02)
- Entry price: $50,000 (BTC)
- Position size: (10,000 × 0.02) / 50,000 = 0.004 BTC

**Sources:** [types.d.ts:548-566](), [types.d.ts:577-583]()

## Kelly Criterion Method

Kelly criterion sizing maximizes long-term growth by calculating optimal position size based on historical win rate and average profit/loss ratios.

### Schema Interface

```typescript
interface ISizingSchemaKelly {
  sizingName: string;
  method: "kelly-criterion";
  params: {
    winRate: number;      // Win rate as decimal (e.g., 0.55 for 55%)
    avgWinPnl: number;    // Average winning PNL percentage
    avgLossPnl: number;   // Average losing PNL percentage (absolute value)
  };
}
```

### Calculation Parameters

```typescript
interface ISizingCalculateParamsKelly {
  method: "kelly-criterion";
  params: {
    portfolioBalance: number;
    entryPrice: number;
  };
}
```

### Calculation Logic

The Kelly formula:

```
kellyPercentage = (winRate × avgWinPnl - (1 - winRate) × avgLossPnl) / avgWinPnl
positionSize = (portfolioBalance × kellyPercentage) / entryPrice
```

**Example:**
- Win rate: 60% (0.60)
- Average win: 5% (0.05)
- Average loss: 3% (0.03)
- Kelly percentage: (0.60 × 0.05 - 0.40 × 0.03) / 0.05 = 0.36 (36%)
- Portfolio balance: $10,000
- Entry price: $50,000
- Position size: (10,000 × 0.36) / 50,000 = 0.072 BTC

**Note:** ClientSizing may apply a fractional Kelly (e.g., half-Kelly) to reduce risk.

**Sources:** [types.d.ts:567-576](), [types.d.ts:584-590]()

## ATR-Based Method

ATR (Average True Range) sizing adjusts position size based on market volatility. Higher volatility results in smaller positions, maintaining consistent risk exposure.

### Schema Interface

```typescript
interface ISizingSchemaATR {
  sizingName: string;
  method: "atr-based";
  params: {
    atrMultiplier: number;  // Multiplier for ATR (e.g., 2.0)
    atrPeriod: number;      // Number of periods for ATR calculation (e.g., 14)
  };
}
```

### Calculation Parameters

```typescript
interface ISizingCalculateParamsATR {
  method: "atr-based";
  params: {
    portfolioBalance: number;
    entryPrice: number;
    stopLoss: number;           // Signal's priceStopLoss
    historicalCandles: ICandleData[];  // Candles for ATR calculation
  };
}
```

### Calculation Logic

The ATR-based formula:

```
1. Calculate ATR from historicalCandles using atrPeriod
2. stopDistance = |entryPrice - stopLoss|
3. riskPerUnit = atrMultiplier × ATR
4. positionSize = (portfolioBalance × riskPercentage) / riskPerUnit
```

**Example:**
- ATR (14 periods): $500
- ATR multiplier: 2.0
- Entry price: $50,000
- Stop loss: $49,000
- Portfolio balance: $10,000
- Risk percentage: 2%
- Risk per unit: 2.0 × $500 = $1,000
- Position size: (10,000 × 0.02) / 1,000 = 0.2 BTC

**Sources:** [types.d.ts:591-608](), [types.d.ts:609-617]()

## Calculation Flow

The diagram below shows how ClientSizing integrates into the signal generation flow:

![Mermaid Diagram](./diagrams/36_ClientSizing_1.svg)

**Sources:** [types.d.ts:609-632]()

## ISizing Interface

ClientSizing implements the `ISizing` interface, which defines the contract for position size calculation:

```typescript
interface ISizing {
  calculatePositionSize(
    params: ISizingCalculateParams
  ): Promise<string>;
}
```

### Parameter Discriminated Union

The `ISizingCalculateParams` type is a discriminated union matching the sizing method:

```typescript
type ISizingCalculateParams = 
  | ISizingCalculateParamsFixedPercentage
  | ISizingCalculateParamsKelly
  | ISizingCalculateParamsATR;
```

Each variant contains the `method` discriminator and method-specific `params` object.

### Return Value

The `calculatePositionSize()` method returns a `Promise<string>` containing the formatted quantity. This string is formatted according to the exchange's precision rules via `ClientExchange.formatQuantity()`.

**Example:**
- Input: `{ method: "fixed-percentage", params: { portfolioBalance: 10000, entryPrice: 50000 } }`
- Schema percentage: 2% (0.02)
- Calculated size: 0.004 BTC
- Formatted output: `"0.004"` (8 decimal places for BTC)

**Sources:** [types.d.ts:609-632]()

## Schema Registration and Retrieval

Sizing schemas are registered via the `addSizing()` function and stored in `SizingSchemaService`:

### Registration Flow

![Mermaid Diagram](./diagrams/36_ClientSizing_2.svg)

### Memoization

SizingConnectionService memoizes ClientSizing instances:
- One instance per `sizingName`
- Lazy instantiation on first use
- Shared across all strategies using the same `sizingName`

**Sources:** [types.d.ts:535-632](), [src/index.ts:58-70]()

## Integration with Strategy Schema

Strategies reference sizing via the optional `sizingName` field in `IStrategySchema`:

```typescript
interface IStrategySchema {
  strategyName: string;
  // ... other fields
  sizingName?: string;  // Optional reference to sizing schema
}
```

If `sizingName` is omitted, ClientStrategy uses a default sizing method (typically fixed percentage at 100% of portfolio).

### Context Resolution

When ClientStrategy needs to calculate position size:

1. Retrieve sizing schema via `methodContext.sizingName`
2. Get ClientSizing instance from SizingConnectionService
3. Build `ISizingCalculateParams` based on schema method
4. Call `calculatePositionSize()` with constructed parameters
5. Use returned formatted quantity in signal

**Sources:** [types.d.ts:616-633]()

## Callbacks and Lifecycle Events

Sizing schemas support optional callbacks for tracking calculation events:

```typescript
interface ISizingCallbacks {
  onCalculate?: (
    params: ISizingCalculateParams,
    result: string
  ) => void;
}
```

The `onCalculate` callback fires after each position size calculation, receiving the input parameters and formatted result. This enables logging, debugging, and custom analytics.

**Example usage:**
```typescript
addSizing({
  sizingName: "my-sizing",
  method: "kelly-criterion",
  params: { winRate: 0.6, avgWinPnl: 0.05, avgLossPnl: 0.03 },
  callbacks: {
    onCalculate: (params, result) => {
      console.log(`Calculated position size: ${result}`);
    }
  }
});
```

**Sources:** [types.d.ts:618-626]()

## Dependencies and Parameters

ClientSizing constructor accepts parameters conforming to a schema-based interface:

### Constructor Parameters Pattern

```typescript
interface ISizingParams extends ISizingSchema {
  logger: ILogger;
  execution: TExecutionContextService;
  exchange: IExchange;
}
```

The parameters combine:
- The sizing schema (registered via `addSizing()`)
- Logger service for debug output
- Execution context service (symbol, when, backtest flag)
- Exchange instance for `formatQuantity()` calls

**Note:** Unlike other client classes, ClientSizing requires `IExchange` because it must format the calculated quantity according to exchange-specific precision rules.

**Sources:** [types.d.ts:535-632]()

## Usage in Execution Modes

ClientSizing operates identically in all execution modes (Backtest, Live, Walker):

### Backtest Mode
- Uses historical portfolio balance snapshots
- ATR calculations use historical candles from the frame
- Position sizes are deterministic and repeatable

### Live Mode
- Uses current real-time portfolio balance
- ATR calculations use recent candles from exchange
- Position sizes adjust dynamically to account volatility

### Walker Mode
- Each strategy backtest uses its own sizing calculation
- Results are comparable if strategies use the same sizing method
- Enables comparison of strategy edge independent of sizing

**Sources:** High-Level Architecture Diagrams (Diagram 3)