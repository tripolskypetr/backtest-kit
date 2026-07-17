---
title: docs/type/BrokerOrderOpenPayload
group: docs
---

# BrokerOrderOpenPayload

```ts
type BrokerOrderOpenPayload = {
    type: "schedule" | "active";
    symbol: string;
    signalId: string;
    cost: number;
    position: "long" | "short";
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    pnl: IStrategyPnL;
    peakProfit: IStrategyPnL;
    maxDrawdown: IStrategyPnL;
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

Payload for the signal-open broker event.

Emitted automatically via syncSubject and forwarded to the registered IBroker adapter via
`onOrderOpenCommit`. Discriminated by `type`:
- "active" — a pending signal is being opened (immediate entry or activation fill of the
  resting order);
- "schedule" — the resting entry order is being PLACED (scheduled signal creation).

Throw semantics (see IBrokerOrderVerdict): a plain Error / OrderTransientError rolls the
open back and retries identity-stably (same signalId, `attempt` increments) up to
CC_ORDER_OPEN_RETRY_ATTEMPTS; OrderRejectedError drops the open terminally without
arming the retry.
