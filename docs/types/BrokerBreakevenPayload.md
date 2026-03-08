---
title: docs/type/BrokerBreakevenPayload
group: docs
---

# BrokerBreakevenPayload

```ts
type BrokerBreakevenPayload = {
    symbol: string;
    currentPrice: number;
    newStopLossPrice: number;
    newTakeProfitPrice: number;
    position: "long" | "short";
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    backtest: boolean;
};
```

Payload for a breakeven operation broker event.

Forwarded to the registered IBroker adapter via `onBreakevenCommit`.
Called explicitly after all validations pass, before `strategyCoreService.breakeven()`.
`newStopLossPrice` equals `effectivePriceOpen` (entry price).
`newTakeProfitPrice` equals `_trailingPriceTakeProfit ?? priceTakeProfit` (TP is unchanged).
