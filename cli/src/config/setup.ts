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
  Markdown.enable();
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

{
  Markdown.useDummy();
}

setConfig({
  CC_MAX_NOTIFICATIONS: 5_000,
  CC_MAX_SIGNALS: 750,
})

setConfig({
  CC_ENABLE_DCA_EVERYWHERE: true,
  CC_ENABLE_PPPL_EVERYWHERE: true,
})

setConfig({
  CC_MAX_SIGNAL_GENERATION_SECONDS: 15 * 60,
})

Log.useJsonl();
