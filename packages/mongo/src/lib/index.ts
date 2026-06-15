import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";

import LoggerService from "./services/base/LoggerService";
import MongooseService from "./services/base/MongoService";
import RedisService from "./services/base/RedisService";

import CandleCacheService from "./services/cache/CandleCacheService";
import SignalCacheService from "./services/cache/SignalCacheService";
import ScheduleCacheService from "./services/cache/ScheduleCacheService";
import StrategyCacheService from "./services/cache/StrategyCacheService";
import RiskCacheService from "./services/cache/RiskCacheService";
import PartialCacheService from "./services/cache/PartialCacheService";
import BreakevenCacheService from "./services/cache/BreakevenCacheService";
import StorageCacheService from "./services/cache/StorageCacheService";
import NotificationCacheService from "./services/cache/NotificationCacheService";
import LogCacheService from "./services/cache/LogCacheService";
import MeasureCacheService from "./services/cache/MeasureCacheService";
import IntervalCacheService from "./services/cache/IntervalCacheService";
import MemoryCacheService from "./services/cache/MemoryCacheService";
import RecentCacheService from "./services/cache/RecentCacheService";
import StateCacheService from "./services/cache/StateCacheService";
import SessionCacheService from "./services/cache/SessionCacheService";

import CandleDbService from "./services/db/CandleDbService";
import SignalDbService from "./services/db/SignalDbService";
import ScheduleDbService from "./services/db/ScheduleDbService";
import StrategyDbService from "./services/db/StrategyDbService";
import RiskDbService from "./services/db/RiskDbService";
import PartialDbService from "./services/db/PartialDbService";
import BreakevenDbService from "./services/db/BreakevenDbService";
import StorageDbService from "./services/db/StorageDbService";
import NotificationDbService from "./services/db/NotificationDbService";
import LogDbService from "./services/db/LogDbService";
import MeasureDbService from "./services/db/MeasureDbService";
import IntervalDbService from "./services/db/IntervalDbService";
import MemoryDbService from "./services/db/MemoryDbService";
import RecentDbService from "./services/db/RecentDbService";
import StateDbService from "./services/db/StateDbService";
import SessionDbService from "./services/db/SessionDbService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
  mongoService: inject<MongooseService>(TYPES.mongoService),
  redisService: inject<RedisService>(TYPES.redisService),
};

const cacheServices = {
  candleCacheService: inject<CandleCacheService>(TYPES.candleCacheService),
  signalCacheService: inject<SignalCacheService>(TYPES.signalCacheService),
  scheduleCacheService: inject<ScheduleCacheService>(TYPES.scheduleCacheService),
  strategyCacheService: inject<StrategyCacheService>(TYPES.strategyCacheService),
  riskCacheService: inject<RiskCacheService>(TYPES.riskCacheService),
  partialCacheService: inject<PartialCacheService>(TYPES.partialCacheService),
  breakevenCacheService: inject<BreakevenCacheService>(TYPES.breakevenCacheService),
  storageCacheService: inject<StorageCacheService>(TYPES.storageCacheService),
  notificationCacheService: inject<NotificationCacheService>(TYPES.notificationCacheService),
  logCacheService: inject<LogCacheService>(TYPES.logCacheService),
  measureCacheService: inject<MeasureCacheService>(TYPES.measureCacheService),
  intervalCacheService: inject<IntervalCacheService>(TYPES.intervalCacheService),
  memoryCacheService: inject<MemoryCacheService>(TYPES.memoryCacheService),
  recentCacheService: inject<RecentCacheService>(TYPES.recentCacheService),
  stateCacheService: inject<StateCacheService>(TYPES.stateCacheService),
  sessionCacheService: inject<SessionCacheService>(TYPES.sessionCacheService),
};

const dbServices = {
  candleDbService: inject<CandleDbService>(TYPES.candleDbService),
  signalDbService: inject<SignalDbService>(TYPES.signalDbService),
  scheduleDbService: inject<ScheduleDbService>(TYPES.scheduleDbService),
  strategyDbService: inject<StrategyDbService>(TYPES.strategyDbService),
  riskDbService: inject<RiskDbService>(TYPES.riskDbService),
  partialDbService: inject<PartialDbService>(TYPES.partialDbService),
  breakevenDbService: inject<BreakevenDbService>(TYPES.breakevenDbService),
  storageDbService: inject<StorageDbService>(TYPES.storageDbService),
  notificationDbService: inject<NotificationDbService>(TYPES.notificationDbService),
  logDbService: inject<LogDbService>(TYPES.logDbService),
  measureDbService: inject<MeasureDbService>(TYPES.measureDbService),
  intervalDbService: inject<IntervalDbService>(TYPES.intervalDbService),
  memoryDbService: inject<MemoryDbService>(TYPES.memoryDbService),
  recentDbService: inject<RecentDbService>(TYPES.recentDbService),
  stateDbService: inject<StateDbService>(TYPES.stateDbService),
  sessionDbService: inject<SessionDbService>(TYPES.sessionDbService),
};

export const ioc = {
  ...baseServices,
  ...cacheServices,
  ...dbServices,
};

init();

export default ioc;
