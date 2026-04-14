import { singleshot } from "functools-kit";

import {
  Storage,
  Notification,
  Markdown,
  Report,
  StorageLive,
  StorageBacktest,
  NotificationLive,
  NotificationBacktest,
  RecentLive,
  RecentBacktest,
  Dump,
  Memory,
  Recent,
  Log,
  MarkdownWriter,
  ReportWriter,
} from "backtest-kit";

import {
  PersistSignalAdapter,
  PersistRiskAdapter,
  PersistScheduleAdapter,
  PersistPartialAdapter,
  PersistBreakevenAdapter,
  PersistCandleAdapter,
  PersistStorageAdapter,
  PersistNotificationAdapter,
  PersistLogAdapter,
  PersistMeasureAdapter,
  PersistMemoryAdapter,
  PersistIntervalAdapter,
  PersistRecentAdapter,
} from "backtest-kit";

import { cli } from "../lib";

export class SetupUtils {

  public enable = singleshot(() => {

    cli.loggerService.debug("SetupUtils enable");

    {
      Recent.enable();
      Storage.enable();
      Notification.enable();
    }

    {
      Markdown.enable();
      Report.enable();
      Dump.enable();
      Memory.enable();
    }

    {
      Dump.useMarkdown();
      Memory.usePersist();
    }

    {
      StorageLive.usePersist();
      StorageBacktest.useMemory();
    }

    {
      RecentLive.usePersist();
      RecentBacktest.useMemory();
    }

    {
      NotificationLive.usePersist();
      NotificationBacktest.useMemory();
    }

    {
      Markdown.useDummy();
      Log.useJsonl();
    }
  });

  public clear = () => {

    cli.loggerService.debug("SetupUtils clear");

    if (!this.enable.hasValue()) {
        return;
    }

    this.enable.clear();

    {
      Recent.disable();
      Storage.disable();
      Notification.disable();
    }

    {
      Markdown.disable();
      Report.disable();
      Dump.disable();
      Memory.disable();
    }

    {
      Markdown.clear();
      Report.clear();
      MarkdownWriter.clear();
      ReportWriter.clear();
    }

    {
      PersistSignalAdapter.clear();
      PersistRiskAdapter.clear();
      PersistScheduleAdapter.clear();
      PersistPartialAdapter.clear();
      PersistBreakevenAdapter.clear();
      PersistCandleAdapter.clear();
      PersistStorageAdapter.clear();
      PersistNotificationAdapter.clear();
      PersistLogAdapter.clear();
      PersistMeasureAdapter.clear();
      PersistIntervalAdapter.clear();
      PersistMemoryAdapter.clear();
      PersistRecentAdapter.clear();
    }

    {
      Dump.clear();
      Log.clear();
      Markdown.clear();
    }

    {
      StorageLive.clear();
      StorageBacktest.clear();
    }

    {
      NotificationLive.clear();
      NotificationBacktest.clear();
    }

    {
      RecentLive.clear();
      RecentBacktest.clear();
    }
  };
}

export const Setup = new SetupUtils();
