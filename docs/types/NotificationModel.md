---
title: docs/type/NotificationModel
group: docs
---

# NotificationModel

```ts
type NotificationModel = SignalOpenedNotification | SignalClosedNotification | PartialProfitAvailableNotification | PartialLossAvailableNotification | BreakevenAvailableNotification | PartialProfitCommitNotification | PartialLossCommitNotification | BreakevenCommitNotification | AverageBuyCommitNotification | ActivateScheduledCommitNotification | TrailingStopCommitNotification | TrailingTakeCommitNotification | CancelScheduledCommitNotification | ClosePendingCommitNotification | OrderSyncOpenNotification | OrderSyncCloseNotification | OrderSyncCheckNotification | OrderContinueCheckNotification | OrderStopCheckNotification | OrderFillOpenNotification | OrderFillCloseNotification | OrderRejectOpenNotification | OrderRejectCloseNotification | RiskRejectionNotification | SignalScheduledNotification | SignalCancelledNotification | InfoErrorNotification | CriticalErrorNotification | ValidationErrorNotification | StrategyPauseNotification | SignalInfoNotification;
```

Root discriminated union of all notification types.
Type discrimination is done via the `type` field.
