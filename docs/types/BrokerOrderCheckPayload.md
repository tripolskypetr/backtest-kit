---
title: docs/type/BrokerOrderCheckPayload
group: docs
---

# BrokerOrderCheckPayload

```ts
type BrokerOrderCheckPayload = {
    type: "schedule" | "active";
    symbol: string;
    signalId: string;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    pnl: IStrategyPnL;
    peakProfit: IStrategyPnL;
    maxDrawdown: IStrategyPnL;
    totalEntries: number;
    totalPartials: number;
    attempt: number;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the order synchronization broker event.

Emitted automatically via syncPendingSubject on every live tick while a signal is monitored,
BEFORE the framework evaluates completion. Forwarded to the registered IBroker adapter,
routed by `type` to the matching callback:
- `type: "active"` — pending signal (open position), before TP/SL/time evaluation —
  delivered to `onOrderActiveCheck`;
- `type: "schedule"` — scheduled signal, before timeout/price-activation evaluation
  (the order in question is the resting entry order) — delivered to `onOrderScheduleCheck`.

The adapter should query the exchange by `signalId`. Returning normally keeps the signal
under normal monitoring. Throw semantics (see IBrokerOrderVerdict):
- OrderDeletedError — the CONFIRMED "order not found by id" (filled, cancelled, or
  liquidated externally): terminal AT ONCE — close the pending signal with closeReason
  "closed" (type "active") or cancel the scheduled signal with reason "user"
  (type "schedule"), bypassing the tolerance counter.
- plain Error / OrderTransientError (timeout, 5xx, rate limit, disconnect) — TOLERATED
  as a transient failure: the order is assumed still open, the next ping carries
  `attempt` incremented, up to CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive failures
  before the framework acts terminally (a successful check resets the streak).
- OrderRejectedError — protocol violation in this channel, degrades to transient.

NOTE for type "schedule": if the resting entry order actually FILLED, confirm the fill via
`commitActivateScheduled` instead of throwing — a throw here is a terminal cancel, not an
activation.
