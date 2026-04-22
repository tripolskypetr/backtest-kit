---
title: docs/type/BrokerSignalClosePayload
group: docs
---

# BrokerSignalClosePayload

```ts
type BrokerSignalClosePayload = {
    symbol: string;
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
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    backtest: boolean;
};
```

Payload for the signal-close broker event.

Emitted automatically via syncSubject when a pending signal is closed (SL/TP hit or manual close).
Forwarded to the registered IBroker adapter via `onSignalCloseCommit`.
