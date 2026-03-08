---
title: docs/type/BrokerPartialProfitPayload
group: docs
---

# BrokerPartialProfitPayload

```ts
type BrokerPartialProfitPayload = {
    symbol: string;
    percentToClose: number;
    cost: number;
    currentPrice: number;
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

Payload for a partial-profit close broker event.

Forwarded to the registered IBroker adapter via `onPartialProfitCommit`.
Called explicitly after all validations pass, before `strategyCoreService.partialProfit()`.
