---
title: docs/type/NotificationModel
group: docs
---

# NotificationModel

```ts
type NotificationModel = SignalOpenedNotification | SignalClosedNotification | PartialProfitAvailableNotification | PartialLossAvailableNotification | BreakevenAvailableNotification | PartialProfitCommitNotification | PartialLossCommitNotification | BreakevenCommitNotification | AverageBuyCommitNotification | ActivateScheduledCommitNotification | TrailingStopCommitNotification | TrailingTakeCommitNotification | CancelScheduledCommitNotification | ClosePendingCommitNotification | OrderSyncOpenNotification | OrderSyncCloseNotification | OrderSyncCheckNotification | RiskRejectionNotification | SignalScheduledNotification | SignalCancelledNotification | InfoErrorNotification | CriticalErrorNotification | ValidationErrorNotification | StrategyPauseNotification | SignalInfoNotification;
```

Root discriminated union of all notification types.
Type discrimination is done via the `type` field.
