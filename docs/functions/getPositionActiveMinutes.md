---
title: docs/function/getPositionActiveMinutes
group: docs
---

# getPositionActiveMinutes

```ts
declare function getPositionActiveMinutes(symbol: string): Promise<number>;
```

Returns the number of minutes the position has been active since it opened.

Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
