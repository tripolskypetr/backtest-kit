---
title: docs/type/BrokerSignalOpenPayload
group: docs
---

# BrokerSignalOpenPayload

```ts
type BrokerSignalOpenPayload = {
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
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    backtest: boolean;
};
```

Payload for the signal-open broker event.

Emitted automatically via syncSubject and forwarded to the registered IBroker adapter via
`onSignalOpenCommit`. Discriminated by `type`:
- "active" — a pending signal is being opened (immediate entry or activation fill of the
  resting order); throw = the exchange did not fill the entry, the framework rolls back the
  open and retries on the next tick;
- "schedule" — the resting entry order is being PLACED (scheduled signal creation); throw =
  the exchange did not accept the resting order, the scheduled signal is NOT registered and
  the placement retries on the next tick.
