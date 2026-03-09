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

setConfig({
  CC_ENABLE_DCA_EVERYWHERE: true,
  CC_ENABLE_PPPL_EVERYWHERE: true,
})

Log.useJsonl();
