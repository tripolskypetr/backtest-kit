---
title: docs/function/getPositionWaitingMinutes
group: docs
---

# getPositionWaitingMinutes

```ts
declare function getPositionWaitingMinutes(symbol: string): Promise<number>;
```

Returns the number of minutes the scheduled signal has been waiting for activation.

Returns null if no scheduled signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
