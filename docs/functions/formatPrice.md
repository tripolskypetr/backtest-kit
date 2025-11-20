---
title: docs/api-reference/function/formatPrice
group: docs
---

# formatPrice

```ts
declare function formatPrice(symbol: string, price: number): Promise<string>;
```

Formats a price value according to exchange rules.

Uses the exchange's formatPrice implementation for proper decimal places.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `price` | Raw price value |
