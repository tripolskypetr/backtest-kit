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

The adapter should query the exchange by `signalId` and THROW ONLY when the order is
definitively NOT FOUND by that id (filled, cancelled, or liquidated externally). A throw
propagates to CREATE_SYNC_PENDING_FN, which makes the framework close the pending signal with
closeReason "closed" (type "active") or cancel the scheduled signal with reason "user"
(type "schedule"). Returning normally keeps the signal under normal monitoring.

NOTE for type "schedule": if the resting entry order actually FILLED, confirm the fill via
`commitActivateScheduled` instead of throwing — a throw here is a terminal cancel, not an
activation.

CRITICAL: transient/network errors (timeout, 5xx, rate limit, disconnect) must be SWALLOWED —
return normally instead of throwing. A thrown network error would wrongly close an open
position. Only a confirmed "order not found by id" response is a valid reason to throw.
