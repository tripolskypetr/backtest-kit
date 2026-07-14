---
title: docs/type/BrokerPendingClosePayload
group: docs
---

# BrokerPendingClosePayload

```ts
type BrokerPendingClosePayload = {
    symbol: string;
    signalId: string;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    closeReason?: StrategyCloseReason;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the pending-signal-close broker event.

Emitted automatically via signalEventSubject (action "closed") when a pending position is closed.
Forwarded to the registered IBroker adapter via `onSignalPendingClose`. The `closeReason`
distinguishes take_profit / stop_loss / time_expired / user-close / broker fill / order gone.
