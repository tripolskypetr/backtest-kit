---
title: docs/type/BrokerPendingOpenPayload
group: docs
---

# BrokerPendingOpenPayload

```ts
type BrokerPendingOpenPayload = {
    symbol: string;
    signalId: string;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the pending-signal-open broker event.

Emitted automatically via signalEventSubject (action "opened") when a pending position is opened
(new signal / immediate entry / scheduled or user activation). Forwarded to the registered IBroker
adapter via `onSignalPendingOpen`.
