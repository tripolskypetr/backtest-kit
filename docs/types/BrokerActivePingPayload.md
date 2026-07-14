---
title: docs/type/BrokerActivePingPayload
group: docs
---

# BrokerActivePingPayload

```ts
type BrokerActivePingPayload = {
    symbol: string;
    signalId: string;
    position: "long" | "short";
    currentPrice: number;
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    pnl: IStrategyPnL;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the active-ping broker event.

Emitted automatically via activePingSubject on every live tick while a pending (open) signal is
monitored. Forwarded to the registered IBroker adapter via `onSignalActivePing`. Purely
informational — unlike `onOrderActiveCheck` a throw here does NOT close the position.
