---
title: docs/type/BrokerOrderClosePayload
group: docs
---

# BrokerOrderClosePayload

```ts
type BrokerOrderClosePayload = {
    symbol: string;
    signalId: string;
    cost: number;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    totalEntries: number;
    totalPartials: number;
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

Payload for the signal-close broker event.

Emitted automatically via syncSubject when a pending signal is closed (SL/TP hit or manual close).
Forwarded to the registered IBroker adapter via `onOrderCloseCommit`.
