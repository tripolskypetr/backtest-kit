---
title: docs/type/NotificationModel
group: docs
---

# NotificationModel

```ts
type NotificationModel = SignalOpenedNotification | SignalClosedNotification | PartialProfitAvailableNotification | PartialLossAvailableNotification | BreakevenAvailableNotification | PartialProfitCommitNotification | PartialLossCommitNotification | BreakevenCommitNotification | TrailingStopCommitNotification | TrailingTakeCommitNotification | RiskRejectionNotification | SignalScheduledNotification | SignalCancelledNotification | InfoErrorNotification | CriticalErrorNotification | ValidationErrorNotification;
```

Root discriminated union of all notification types.
Type discrimination is done via the `type` field.
