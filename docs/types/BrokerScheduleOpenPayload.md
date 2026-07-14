---
title: docs/type/BrokerScheduleOpenPayload
group: docs
---

# BrokerScheduleOpenPayload

```ts
type BrokerScheduleOpenPayload = {
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

Payload for the scheduled-signal-open broker event.

Emitted automatically via scheduleEventSubject (action "scheduled") when a new scheduled signal is
created and starts waiting for priceOpen activation. Forwarded to the registered IBroker adapter
via `onSignalScheduleOpen`. The scheduled -&gt; active transition is NOT reported here — activation
arrives through `onOrderOpenCommit`.
