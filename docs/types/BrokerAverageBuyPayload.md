---
title: docs/type/BrokerAverageBuyPayload
group: docs
---

# BrokerAverageBuyPayload

```ts
type BrokerAverageBuyPayload = {
    symbol: string;
    currentPrice: number;
    cost: number;
    position: "long" | "short";
    priceTakeProfit: number;
    priceStopLoss: number;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    backtest: boolean;
};
```

Payload for a DCA average-buy entry broker event.

Forwarded to the registered IBroker adapter via `onAverageBuyCommit`.
Called explicitly after all validations pass, before `strategyCoreService.averageBuy()`.
`currentPrice` is the market price at which the new DCA entry is added.
