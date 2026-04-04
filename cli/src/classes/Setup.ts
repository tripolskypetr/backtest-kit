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
  Dump,
  Memory,
  Log,
  Cache,
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
} from "backtest-kit";

import { cli } from "../lib";

export class SetupUtils {

  public enable = singleshot(() => {

    cli.loggerService.debug("SetupUtils enable");

    {
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
      PersistMemoryAdapter.clear();
    }

    {
      Dump.clear();
      Log.clear();
      Markdown.clear();
      Memory.clear();
      Report.clear();
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
      Cache.clear();
    }
  };
}

export const Setup = new SetupUtils();
