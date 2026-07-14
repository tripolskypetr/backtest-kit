---
title: docs/interface/INotificationTarget
group: docs
---

# INotificationTarget

Defines which notification categories are enabled when calling `NotificationAdapter.enable()`.

Pass an instance of this interface to selectively subscribe to only the event types you need.
When omitted, all categories default to `true` via `WILDCARD_TARGET`.

## Properties

### signal

```ts
signal: boolean
```

Signal lifecycle events emitted by the strategy engine.
Covers four actions: `signal.opened`, `signal.scheduled`, `signal.closed`, `signal.cancelled`.
Source: `signalBacktestEmitter` / `signalLiveEmitter` (IStrategyTickResult).

### partial_profit

```ts
partial_profit: boolean
```

Partial profit availability notifications (`partial_profit.available`).
Fired when the price reaches a partial-profit level defined in the strategy,
before the commit decision is made.
Source: `partialProfitSubject` (PartialProfitContract).

### partial_loss

```ts
partial_loss: boolean
```

Partial loss availability notifications (`partial_loss.available`).
Fired when the price reaches a partial-loss level defined in the strategy,
before the commit decision is made.
Source: `partialLossSubject` (PartialLossContract).

### breakeven

```ts
breakeven: boolean
```

Breakeven availability notifications (`breakeven.available`).
Fired when the price reaches the breakeven level, before the commit is applied.
Source: `breakevenSubject` (BreakevenContract).

### strategy_commit

```ts
strategy_commit: boolean
```

Strategy commit confirmations.
Covers all committed actions: `partial_profit.commit`, `partial_loss.commit`,
`breakeven.commit`, `trailing_stop.commit`, `trailing_take.commit`,
`activate_scheduled.commit`, `average_buy.commit`, `cancel_scheduled.commit`,
`close_pending.commit`.
Source: `strategyCommitSubject` (StrategyCommitContract).

### order_sync

```ts
order_sync: boolean
```

Signal synchronization events for live trading (`order_sync.open`, `order_sync.close`).
Fired when the position order is filled (`signal-open` with `orderType: "active"`),
when the resting entry order is placed at scheduled-signal creation (`signal-open`
with `orderType: "schedule"`), or when an open position is confirmed exited
(`signal-close`) by the exchange sync layer.
Source: `syncSubject` (OrderSyncContract).

### order_check

```ts
order_check: boolean
```

Order-ping check notifications (`order_sync.check`).
Fired while a signal is monitored in live mode, when the framework asks the
external order management system whether the order is still open on the
exchange. Throttled to at most one notification per signalId per
`CC_NOTIFICATION_ORDER_CHECK_TTL` (default 15 minutes); the throttle entry is
dropped when the signal is closed or cancelled.
Source: `syncPendingSubject` (OrderCheckContract).

### risk

```ts
risk: boolean
```

Risk manager rejection notifications (`risk.rejection`).
Fired when the risk manager blocks a new signal from opening due to
active position count limits or other risk rules.
Source: `riskSubject` (RiskContract).

### info

```ts
info: boolean
```

Informational signal notifications (`signal.info`).
Manual or strategy-triggered messages attached to an active signal,
carrying a `note` and optional `notificationId`.
Source: `signalNotifySubject` (SignalInfoContract).

### common_error

```ts
common_error: boolean
```

Non-fatal runtime errors (`error.info`).
Emitted by the global `errorEmitter` for recoverable errors that are
caught and logged but do not terminate the process.

### critical_error

```ts
critical_error: boolean
```

Critical (fatal) errors (`error.critical`).
Emitted by the global `exitEmitter` when an unrecoverable error
causes the backtest or live session to terminate.

### validation_error

```ts
validation_error: boolean
```

Validation errors (`error.validation`).
Emitted by `validationSubject` when strategy configuration or
input data fails schema/business-rule validation.
