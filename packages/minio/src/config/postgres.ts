import { singleshot } from "functools-kit";
import { DataSource } from "typeorm";
import { getConfig } from "./params";

import { BreakevenModel } from "../schema/Breakeven.schema";
import { CandleModel } from "../schema/Candle.schema";
import { IntervalModel } from "../schema/Interval.schema";
import { LogModel } from "../schema/Log.schema";
import { MeasureModel } from "../schema/Measure.schema";
import { MemoryModel } from "../schema/Memory.schema";
import { NotificationModel } from "../schema/Notification.schema";
import { PartialModel } from "../schema/Partial.schema";
import { RecentModel } from "../schema/Recent.schema";
import { RiskModel } from "../schema/Risk.schema";
import { ScheduleModel } from "../schema/Schedule.schema";
import { SessionModel } from "../schema/Session.schema";
import { SignalModel } from "../schema/Signal.schema";
import { StateModel } from "../schema/State.schema";
import { StorageModel } from "../schema/Storage.schema";
import { StrategyModel } from "../schema/Strategy.schema";

export const getPostgres = singleshot(async () => {

  const GLOBAL_CONFIG = getConfig();

  const dataSource = new DataSource({
    type: "postgres",
    url: GLOBAL_CONFIG.CC_POSTGRES_CONNECTION_STRING,
    entities: [
      BreakevenModel,
      CandleModel,
      IntervalModel,
      LogModel,
      MeasureModel,
      MemoryModel,
      NotificationModel,
      PartialModel,
      RecentModel,
      RiskModel,
      ScheduleModel,
      SessionModel,
      SignalModel,
      StateModel,
      StorageModel,
      StrategyModel,
    ],
    synchronize: true,
    logging: false,
  });

  await dataSource.initialize();

  process.on("SIGINT", async () => {
    await dataSource.destroy();
  });

  return dataSource;
});
