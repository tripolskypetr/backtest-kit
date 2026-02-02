---
title: docs/interface/IStorageSignalRowClosed
group: docs
---

# IStorageSignalRowClosed

Storage signal row for closed status.
Only closed signals have PNL data.

## Properties

### status

```ts
status: "closed"
```

Current status of the signal

### pnl

```ts
pnl: IStrategyPnL
```

Profit and loss value for the signal when closed
