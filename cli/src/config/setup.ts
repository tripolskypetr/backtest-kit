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

setConfig({
  CC_MAX_BACKTEST_MARKDOWN_ROWS: 1_000,
  CC_MAX_BREAKEVEN_MARKDOWN_ROWS: 1_000,
  CC_MAX_HEATMAP_MARKDOWN_ROWS: 1_000,
  CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS: 1_000,
  CC_MAX_LIVE_MARKDOWN_ROWS: 1_000,
  CC_MAX_PARTIAL_MARKDOWN_ROWS: 1_000,
  CC_MAX_RISK_MARKDOWN_ROWS: 1_000,
  CC_MAX_SCHEDULE_MARKDOWN_ROWS: 1_000,
  CC_MAX_STRATEGY_MARKDOWN_ROWS: 1_000,
  CC_MAX_SYNC_MARKDOWN_ROWS: 1_000,
  CC_MAX_PERFORMANCE_MARKDOWN_ROWS: 1_000,
})

setConfig({
  CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity,
})

setConfig({
  CC_WALKER_MARKDOWN_TOP_N: 10,
})

Log.useJsonl();
