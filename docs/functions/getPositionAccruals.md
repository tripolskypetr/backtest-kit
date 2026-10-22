---
title: docs/function/getPositionAccruals
group: docs
---

# getPositionAccruals

```ts
declare function getPositionAccruals(symbol: string): Promise<ISignalAccrual[]>;
```

Returns the dividend / staking accruals recorded on the current pending signal
(see commitDividend). Each record carries type ("cash" &vert; "asset"), signed
amount, the market price at the moment of the commit, timestamp and an
optional note.

Returns null if no pending signal exists, an empty array when none were recorded.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
