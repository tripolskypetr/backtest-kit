import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import PaperMainService from "./services/main/PaperMainService";
import LiveMainService from "./services/main/LiveMainService";
import BacktestMainService from "./services/main/BacktestMainService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const mainServices = {
  backtestMainService: inject<BacktestMainService>(TYPES.backtestMainService),
  paperMainService: inject<PaperMainService>(TYPES.paperMainService),
  liveMainService: inject<LiveMainService>(TYPES.liveMainService),
}

export const backtest = {
  ...baseServices,
  ...mainServices,
};

init();

export default backtest;
