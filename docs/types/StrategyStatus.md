---
title: docs/type/StrategyStatus
group: docs
---

# StrategyStatus

```ts
type StrategyStatus = {
    pendingSignalId: string | null;
    createdSignal: ISignalDto | null;
    commitQueue: ICommitRow[];
    closedSignal: ISignalCloseRow | null;
    cancelledSignal: IScheduledSignalCancelRow | null;
    activatedSignal: IScheduledSignalActivateRow | null;
    takeProfitSignal: ISignalCloseRow | null;
    stopLossSignal: ISignalCloseRow | null;
    retryOpenSignal: ISignalRow | IScheduledSignalRow | null;
    retryOpenCount: number;
};
```

Type for persisted deferred strategy state.
Snapshot of the in-flight commit queue and deferred user actions that have not yet
been forwarded to the broker. Restored on waitForInit after a live crash so the
pending broker operations are not silently lost.
