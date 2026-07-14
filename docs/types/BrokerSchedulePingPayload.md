---
title: docs/type/BrokerSchedulePingPayload
group: docs
---

# BrokerSchedulePingPayload

```ts
type BrokerSchedulePingPayload = {
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

Payload for the schedule-ping broker event.

Emitted automatically via schedulePingSubject on every live tick while a scheduled signal is
monitored (waiting for priceOpen activation). Forwarded to the registered IBroker adapter via
`onSignalSchedulePing`. Purely informational.
