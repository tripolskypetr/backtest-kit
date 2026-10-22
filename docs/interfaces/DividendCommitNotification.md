---
title: docs/interface/DividendCommitNotification
group: docs
---

# DividendCommitNotification

Dividend / staking accrual recorded notification (commitDividend).
The accrual value (signed: negative = charge) is folded into pnl.pnlCost and
published as pnlDividends.

## Properties

### type

```ts
type: "dividend.commit"
```

Discriminator for type-safe union

### id

```ts
id: string
```

Unique notification identifier

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when the accrual was recorded

### backtest

```ts
backtest: boolean
```

Whether this notification is from backtest mode (true) or live mode (false)

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal

### exchangeName

```ts
exchangeName: string
```

Exchange name where signal was executed

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### accrualType

```ts
accrualType: AccrualType
```

"cash" (USD) or "asset" (units of the traded asset)

### amount

```ts
amount: number
```

Signed amount of the accrual (positive = credit, negative = charge): USD for "cash", asset units for "asset"

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of the event (values "asset" accruals)

### pnlDividends

```ts
pnlDividends: number
```

USD value of all accruals of the position after this event

### entries

```ts
entries: ISignalEntry[]
```

DCA entry history of the position (IPublicSignalRow.entries; notes included)

### partials

```ts
partials: ISignalPartial[]
```

Partial close history of the position (IPublicSignalRow.partials; notes included)

### accruals

```ts
accruals: ISignalAccrual[]
```

Dividend / staking accruals of the position (IPublicSignalRow.accruals; signed amounts)

### totalAccruals

```ts
totalAccruals: number
```

Total number of accruals on the position after this event

### cost

```ts
cost: number
```

Cost of the initial position entry in USD

### multiplier

```ts
multiplier: number
```

PNL multiplier (leverage) applied to pnlPercentage. Default: GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER

### isolated

```ts
isolated: boolean
```

Isolated-margin mode: position force-closes with closeReason "liquidation" at -100% leveraged PNL. Default: GLOBAL_CONFIG.CC_SIGNAL_ISOLATED_MARGIN

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries (_entry.length)

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective (DCA-averaged) entry price

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price (with trailing if set)

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price (with trailing if set)

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price before any trailing adjustments

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price before any trailing adjustments

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price at signal creation (unchanged by DCA averaging)

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the moment of the event (accruals included)

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment this public signal was created

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment this public signal was created

### pnlPercentage

```ts
pnlPercentage: number
```

Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%)

### pnlPriceOpen

```ts
pnlPriceOpen: number
```

Entry price from PNL calculation (effective price adjusted with slippage and fees)

### pnlPriceClose

```ts
pnlPriceClose: number
```

Exit price from PNL calculation (adjusted with slippage and fees)

### pnlCost

```ts
pnlCost: number
```

Absolute profit/loss in USD (accruals included)

### pnlEntries

```ts
pnlEntries: number
```

Total invested capital in USD

### peakProfitPriceOpen

```ts
peakProfitPriceOpen: number
```

Peak price reached in profit direction during the life of this position

### peakProfitPriceClose

```ts
peakProfitPriceClose: number
```

Close price used for the peak profit calculation

### peakProfitPercentage

```ts
peakProfitPercentage: number
```

Peak profit as percentage

### peakProfitCost

```ts
peakProfitCost: number
```

Peak profit in USD

### peakProfitEntries

```ts
peakProfitEntries: number
```

Invested capital used for the peak profit calculation

### maxDrawdownPriceOpen

```ts
maxDrawdownPriceOpen: number
```

Worst price reached in loss direction during the life of this position

### maxDrawdownPriceClose

```ts
maxDrawdownPriceClose: number
```

Close price used for the max drawdown calculation

### maxDrawdownPercentage

```ts
maxDrawdownPercentage: number
```

Max drawdown as percentage

### maxDrawdownCost

```ts
maxDrawdownCost: number
```

Max drawdown in USD

### maxDrawdownEntries

```ts
maxDrawdownEntries: number
```

Invested capital used for the max drawdown calculation

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds

### note

```ts
note: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created
