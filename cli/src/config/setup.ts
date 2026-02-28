import {
  Storage,
  Notification,
  Markdown,
  Report,
  StorageLive,
  StorageBacktest,
  NotificationLive,
  NotificationBacktest,
  Log,
  setConfig,
} from "backtest-kit";

{
  Storage.enable();
  Notification.enable();
}

{
  Markdown.disable();
  Report.enable();
}

{
  StorageLive.usePersist();
  StorageBacktest.useMemory();
}

{
  NotificationLive.usePersist();
  NotificationBacktest.useMemory();
}

setConfig({
  CC_MAX_NOTIFICATIONS: 5_000,
  CC_MAX_SIGNALS: 750,
})

Log.useJsonl();
