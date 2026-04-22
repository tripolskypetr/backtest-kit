---
title: docs/type/BrokerSignalOpenPayload
group: docs
---

# BrokerSignalOpenPayload

```ts
type BrokerSignalOpenPayload = {
    symbol: string;
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

Emitted automatically via syncSubject when a new pending signal is activated.
Forwarded to the registered IBroker adapter via `onSignalOpenCommit`.
