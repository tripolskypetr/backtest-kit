import { Config, DEFAULT_CONFIG, GLOBAL_CONFIG } from "../config/params";

import {
  PersistCandleAdapter,
  PersistSignalAdapter,
  PersistRiskAdapter,
  PersistScheduleAdapter,
  PersistPartialAdapter,
  PersistBreakevenAdapter,
  PersistStorageAdapter,
  PersistNotificationAdapter,
  PersistLogAdapter,
  PersistMeasureAdapter,
  PersistIntervalAdapter,
  PersistMemoryAdapter,
  PersistRecentAdapter,
  PersistStateAdapter,
  PersistSessionAdapter,
} from "backtest-kit";

import PersistCandleInstance from "../classes/PersistCandleInstance";
import PersistSignalInstance from "../classes/PersistSignalInstance";
import PersistRiskInstance from "../classes/PersistRiskInstance";
import PersistScheduleInstance from "../classes/PersistScheduleInstance";
import PersistPartialInstance from "../classes/PersistPartialInstance";
import PersistBreakevenInstance from "../classes/PersistBreakevenInstance";
import PersistStorageInstance from "../classes/PersistStorageInstance";
import PersistNotificationInstance from "../classes/PersistNotificationInstance";
import PersistLogInstance from "../classes/PersistLogInstance";
import PersistMeasureInstance from "../classes/PersistMeasureInstance";
import PersistIntervalInstance from "../classes/PersistIntervalInstance";
import PersistMemoryInstance from "../classes/PersistMemoryInstance";
import PersistRecentInstance from "../classes/PersistRecentInstance";
import PersistStateInstance from "../classes/PersistStateInstance";
import PersistSessionInstance from "../classes/PersistSessionInstance";

import { ILogger } from "../interfaces/Logger.interface";

import ioc from "../lib";

export function setup(config: Config = DEFAULT_CONFIG) {
    Object.assign(GLOBAL_CONFIG, config);
    install();
}

export function install() {
    PersistCandleAdapter.usePersistCandleAdapter(PersistCandleInstance);
    PersistSignalAdapter.usePersistSignalAdapter(PersistSignalInstance);
    PersistRiskAdapter.usePersistRiskAdapter(PersistRiskInstance);
    PersistScheduleAdapter.usePersistScheduleAdapter(PersistScheduleInstance);
    PersistPartialAdapter.usePersistPartialAdapter(PersistPartialInstance);
    PersistBreakevenAdapter.usePersistBreakevenAdapter(PersistBreakevenInstance);
    PersistStorageAdapter.usePersistStorageAdapter(PersistStorageInstance);
    PersistNotificationAdapter.usePersistNotificationAdapter(PersistNotificationInstance);
    PersistLogAdapter.usePersistLogAdapter(PersistLogInstance);
    PersistMeasureAdapter.usePersistMeasureAdapter(PersistMeasureInstance);
    PersistIntervalAdapter.usePersistIntervalAdapter(PersistIntervalInstance);
    PersistMemoryAdapter.usePersistMemoryAdapter(PersistMemoryInstance);
    PersistRecentAdapter.usePersistRecentAdapter(PersistRecentInstance);
    PersistStateAdapter.usePersistStateAdapter(PersistStateInstance);
    PersistSessionAdapter.usePersistSessionAdapter(PersistSessionInstance);
}

export function setLogger(logger: ILogger) {
    ioc.loggerService.setLogger(logger);
}

export function setConfig(config: Config = DEFAULT_CONFIG) {
    Object.assign(GLOBAL_CONFIG, config);
}
