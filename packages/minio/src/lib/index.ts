import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";

import LoggerService from "./services/base/LoggerService";
import RedisService from "./services/base/RedisService";
import MinioService from "./services/base/MinioService";

import CandleDataService from "./services/data/CandleDataService";
import SignalDataService from "./services/data/SignalDataService";
import ScheduleDataService from "./services/data/ScheduleDataService";
import StrategyDataService from "./services/data/StrategyDataService";
import RiskDataService from "./services/data/RiskDataService";
import PartialDataService from "./services/data/PartialDataService";
import BreakevenDataService from "./services/data/BreakevenDataService";
import StorageDataService from "./services/data/StorageDataService";
import NotificationDataService from "./services/data/NotificationDataService";
import LogDataService from "./services/data/LogDataService";
import MeasureDataService from "./services/data/MeasureDataService";
import IntervalDataService from "./services/data/IntervalDataService";
import MemoryDataService from "./services/data/MemoryDataService";
import RecentDataService from "./services/data/RecentDataService";
import StateDataService from "./services/data/StateDataService";
import SessionDataService from "./services/data/SessionDataService";

import LogConnectionService from "./services/connection/LogConnectionService";
import NotificationConnectionService from "./services/connection/NotificationConnectionService";
import StorageConnectionService from "./services/connection/StorageConnectionService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
  redisService: inject<RedisService>(TYPES.redisService),
  minioService: inject<MinioService>(TYPES.minioService),
};

const dataServices = {
  candleDataService: inject<CandleDataService>(TYPES.candleDataService),
  signalDataService: inject<SignalDataService>(TYPES.signalDataService),
  scheduleDataService: inject<ScheduleDataService>(TYPES.scheduleDataService),
  strategyDataService: inject<StrategyDataService>(TYPES.strategyDataService),
  riskDataService: inject<RiskDataService>(TYPES.riskDataService),
  partialDataService: inject<PartialDataService>(TYPES.partialDataService),
  breakevenDataService: inject<BreakevenDataService>(TYPES.breakevenDataService),
  storageDataService: inject<StorageDataService>(TYPES.storageDataService),
  notificationDataService: inject<NotificationDataService>(TYPES.notificationDataService),
  logDataService: inject<LogDataService>(TYPES.logDataService),
  measureDataService: inject<MeasureDataService>(TYPES.measureDataService),
  intervalDataService: inject<IntervalDataService>(TYPES.intervalDataService),
  memoryDataService: inject<MemoryDataService>(TYPES.memoryDataService),
  recentDataService: inject<RecentDataService>(TYPES.recentDataService),
  stateDataService: inject<StateDataService>(TYPES.stateDataService),
  sessionDataService: inject<SessionDataService>(TYPES.sessionDataService),
};

const connectionServices = {
  logConnectionService: inject<LogConnectionService>(TYPES.logConnectionService),
  notificationConnectionService: inject<NotificationConnectionService>(TYPES.notificationConnectionService),
  storageConnectionService: inject<StorageConnectionService>(TYPES.storageConnectionService),
};

export const ioc = {
  ...baseServices,
  ...dataServices,
  ...connectionServices,
};

init();

export default ioc;
