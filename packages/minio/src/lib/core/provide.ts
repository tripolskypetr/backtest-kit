import LoggerService from "../services/base/LoggerService";
import RedisService from "../services/base/RedisService";
import MinioService from "../services/base/MinioService";

import CandleDataService from "../services/data/CandleDataService";
import SignalDataService from "../services/data/SignalDataService";
import ScheduleDataService from "../services/data/ScheduleDataService";
import StrategyDataService from "../services/data/StrategyDataService";
import RiskDataService from "../services/data/RiskDataService";
import PartialDataService from "../services/data/PartialDataService";
import BreakevenDataService from "../services/data/BreakevenDataService";
import StorageDataService from "../services/data/StorageDataService";
import NotificationDataService from "../services/data/NotificationDataService";
import LogDataService from "../services/data/LogDataService";
import MeasureDataService from "../services/data/MeasureDataService";
import IntervalDataService from "../services/data/IntervalDataService";
import MemoryDataService from "../services/data/MemoryDataService";
import RecentDataService from "../services/data/RecentDataService";
import StateDataService from "../services/data/StateDataService";
import SessionDataService from "../services/data/SessionDataService";

import LogConnectionService from "../services/connection/LogConnectionService";
import NotificationConnectionService from "../services/connection/NotificationConnectionService";
import StorageConnectionService from "../services/connection/StorageConnectionService";

import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.redisService, () => new RedisService());
    provide(TYPES.minioService, () => new MinioService());
}

{
    provide(TYPES.candleDataService, () => new CandleDataService());
    provide(TYPES.signalDataService, () => new SignalDataService());
    provide(TYPES.scheduleDataService, () => new ScheduleDataService());
    provide(TYPES.strategyDataService, () => new StrategyDataService());
    provide(TYPES.riskDataService, () => new RiskDataService());
    provide(TYPES.partialDataService, () => new PartialDataService());
    provide(TYPES.breakevenDataService, () => new BreakevenDataService());
    provide(TYPES.storageDataService, () => new StorageDataService());
    provide(TYPES.notificationDataService, () => new NotificationDataService());
    provide(TYPES.logDataService, () => new LogDataService());
    provide(TYPES.measureDataService, () => new MeasureDataService());
    provide(TYPES.intervalDataService, () => new IntervalDataService());
    provide(TYPES.memoryDataService, () => new MemoryDataService());
    provide(TYPES.recentDataService, () => new RecentDataService());
    provide(TYPES.stateDataService, () => new StateDataService());
    provide(TYPES.sessionDataService, () => new SessionDataService());
}

{
    provide(TYPES.logConnectionService, () => new LogConnectionService());
    provide(TYPES.notificationConnectionService, () => new NotificationConnectionService());
    provide(TYPES.storageConnectionService, () => new StorageConnectionService());
}
