---
title: docs/type/BrokerTrailingStopPayload
group: docs
---

# BrokerTrailingStopPayload

```ts
type BrokerTrailingStopPayload = {
    symbol: string;
    percentShift: number;
    currentPrice: number;
    newStopLossPrice: number;
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

Payload for a trailing stop-loss update broker event.

Forwarded to the registered IBroker adapter via `onTrailingStopCommit`.
Called explicitly after all validations pass, before `strategyCoreService.trailingStop()`.
`newStopLossPrice` is the absolute SL price computed from percentShift + original SL + effectivePriceOpen.
