---
title: docs/type/BrokerIdlePingPayload
group: docs
---

# BrokerIdlePingPayload

```ts
type BrokerIdlePingPayload = {
    symbol: string;
    currentPrice: number;
    context: {
        strategyName: StrategyName;
        exchangeName: ExchangeName;
        frameName?: FrameName;
    };
    when: Date;
    backtest: boolean;
};
```

Payload for the idle-ping broker event.

Emitted automatically via idlePingSubject on every live tick while the strategy has no pending or
scheduled signal. Forwarded to the registered IBroker adapter via `onSignalIdlePing`. Purely
informational — carries no signal because none is active.
