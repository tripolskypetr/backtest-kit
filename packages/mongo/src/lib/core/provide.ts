import LoggerService from "../services/base/LoggerService";
import MongooseService from "../services/base/MongoService";
import RedisService from "../services/base/RedisService";

import CandleCacheService from "../services/cache/CandleCacheService";
import SignalCacheService from "../services/cache/SignalCacheService";
import ScheduleCacheService from "../services/cache/ScheduleCacheService";
import StrategyCacheService from "../services/cache/StrategyCacheService";
import RiskCacheService from "../services/cache/RiskCacheService";
import PartialCacheService from "../services/cache/PartialCacheService";
import BreakevenCacheService from "../services/cache/BreakevenCacheService";
import StorageCacheService from "../services/cache/StorageCacheService";
import NotificationCacheService from "../services/cache/NotificationCacheService";
import LogCacheService from "../services/cache/LogCacheService";
import MeasureCacheService from "../services/cache/MeasureCacheService";
import IntervalCacheService from "../services/cache/IntervalCacheService";
import MemoryCacheService from "../services/cache/MemoryCacheService";
import RecentCacheService from "../services/cache/RecentCacheService";
import StateCacheService from "../services/cache/StateCacheService";
import SessionCacheService from "../services/cache/SessionCacheService";

import CandleDbService from "../services/db/CandleDbService";
import SignalDbService from "../services/db/SignalDbService";
import ScheduleDbService from "../services/db/ScheduleDbService";
import StrategyDbService from "../services/db/StrategyDbService";
import RiskDbService from "../services/db/RiskDbService";
import PartialDbService from "../services/db/PartialDbService";
import BreakevenDbService from "../services/db/BreakevenDbService";
import StorageDbService from "../services/db/StorageDbService";
import NotificationDbService from "../services/db/NotificationDbService";
import LogDbService from "../services/db/LogDbService";
import MeasureDbService from "../services/db/MeasureDbService";
import IntervalDbService from "../services/db/IntervalDbService";
import MemoryDbService from "../services/db/MemoryDbService";
import RecentDbService from "../services/db/RecentDbService";
import StateDbService from "../services/db/StateDbService";
import SessionDbService from "../services/db/SessionDbService";

import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.mongoService, () => new MongooseService());
    provide(TYPES.redisService, () => new RedisService());
}

{
    provide(TYPES.candleCacheService, () => new CandleCacheService());
    provide(TYPES.signalCacheService, () => new SignalCacheService());
    provide(TYPES.scheduleCacheService, () => new ScheduleCacheService());
    provide(TYPES.strategyCacheService, () => new StrategyCacheService());
    provide(TYPES.riskCacheService, () => new RiskCacheService());
    provide(TYPES.partialCacheService, () => new PartialCacheService());
    provide(TYPES.breakevenCacheService, () => new BreakevenCacheService());
    provide(TYPES.storageCacheService, () => new StorageCacheService());
    provide(TYPES.notificationCacheService, () => new NotificationCacheService());
    provide(TYPES.logCacheService, () => new LogCacheService());
    provide(TYPES.measureCacheService, () => new MeasureCacheService());
    provide(TYPES.intervalCacheService, () => new IntervalCacheService());
    provide(TYPES.memoryCacheService, () => new MemoryCacheService());
    provide(TYPES.recentCacheService, () => new RecentCacheService());
    provide(TYPES.stateCacheService, () => new StateCacheService());
    provide(TYPES.sessionCacheService, () => new SessionCacheService());
}

{
    provide(TYPES.candleDbService, () => new CandleDbService());
    provide(TYPES.signalDbService, () => new SignalDbService());
    provide(TYPES.scheduleDbService, () => new ScheduleDbService());
    provide(TYPES.strategyDbService, () => new StrategyDbService());
    provide(TYPES.riskDbService, () => new RiskDbService());
    provide(TYPES.partialDbService, () => new PartialDbService());
    provide(TYPES.breakevenDbService, () => new BreakevenDbService());
    provide(TYPES.storageDbService, () => new StorageDbService());
    provide(TYPES.notificationDbService, () => new NotificationDbService());
    provide(TYPES.logDbService, () => new LogDbService());
    provide(TYPES.measureDbService, () => new MeasureDbService());
    provide(TYPES.intervalDbService, () => new IntervalDbService());
    provide(TYPES.memoryDbService, () => new MemoryDbService());
    provide(TYPES.recentDbService, () => new RecentDbService());
    provide(TYPES.stateDbService, () => new StateDbService());
    provide(TYPES.sessionDbService, () => new SessionDbService());
}
