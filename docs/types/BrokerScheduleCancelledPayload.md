---
title: docs/type/BrokerScheduleCancelledPayload
group: docs
---

# BrokerScheduleCancelledPayload

```ts
type BrokerScheduleCancelledPayload = {
    symbol: string;
    signalId: string;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    reason?: StrategyCancelReason;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the scheduled-signal-cancelled broker event.

Emitted automatically via scheduleEventSubject (action "cancelled") when a scheduled signal is
removed before it ever activated. Forwarded to the registered IBroker adapter via
`onSignalScheduleCancelled`. The `reason` distinguishes timeout / price reject / user cancel.
