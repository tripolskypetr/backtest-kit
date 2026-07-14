---
title: docs/type/BrokerPartialLossPayload
group: docs
---

# BrokerPartialLossPayload

```ts
type BrokerPartialLossPayload = {
    symbol: string;
    signalId: string;
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
    when: Date;
    backtest: boolean;
};
```

Payload for a partial-loss close broker event.

Forwarded to the registered IBroker adapter via `onPartialLossCommit`.
Called explicitly after all validations pass, before `strategyCoreService.partialLoss()`.
