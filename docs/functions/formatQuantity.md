---
title: docs/api-reference/function/formatQuantity
group: docs
---

# formatQuantity

```ts
declare function formatQuantity(symbol: string, quantity: number): Promise<string>;
```

Formats a quantity value according to exchange rules.

Uses the exchange's formatQuantity implementation for proper decimal places.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `quantity` | Raw quantity value |
