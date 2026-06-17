---
title: docs/type/BrokerSignalPendingPayload
group: docs
---

# BrokerSignalPendingPayload

```ts
type BrokerSignalPendingPayload = {
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
    backtest: boolean;
};
```

Payload for the pending-order synchronization broker event.

Emitted automatically via syncPendingSubject on every live tick while a pending signal is
monitored, BEFORE the framework evaluates TP/SL/time. Forwarded to the registered IBroker
adapter via `onOrderPing`.

The adapter should query the exchange by `signalId` and THROW ONLY when the order is
definitively NOT FOUND by that id (filled, cancelled, or liquidated externally). A throw
propagates to CREATE_SYNC_PENDING_FN, which makes the framework close the pending signal with
closeReason "closed". Returning normally keeps the position under normal TP/SL monitoring.

CRITICAL: transient/network errors (timeout, 5xx, rate limit, disconnect) must be SWALLOWED —
return normally instead of throwing. A thrown network error would wrongly close an open
position. Only a confirmed "order not found by id" response is a valid reason to throw.
