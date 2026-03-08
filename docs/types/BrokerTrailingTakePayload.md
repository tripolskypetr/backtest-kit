---
title: docs/type/BrokerTrailingTakePayload
group: docs
---

# BrokerTrailingTakePayload

```ts
type BrokerTrailingTakePayload = {
    symbol: string;
    percentShift: number;
    currentPrice: number;
    newTakeProfitPrice: number;
    takeProfitPrice: number;
    position: "long" | "short";
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    backtest: boolean;
};
```

Payload for a trailing take-profit update broker event.

Forwarded to the registered IBroker adapter via `onTrailingTakeCommit`.
Called explicitly after all validations pass, before `strategyCoreService.trailingTake()`.
`newTakeProfitPrice` is the absolute TP price computed from percentShift + original TP + effectivePriceOpen.
