import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import {
  BreakevenCommit,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  PartialLossCommit,
  PartialProfitCommit,
  TrailingStopCommit,
  TrailingTakeCommit,
} from "backtest-kit";

export class TelegramTemplateService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getTrailingTakeMarkdown = async (event: TrailingTakeCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingTakeMarkdown", {
      event,
    });
    return "";
  };

  public getTrailingStopMarkdown = async (event: TrailingStopCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingStopMarkdown", {
      event,
    });
    return "";
  };

  public getBreakevenMarkdown = async (event: BreakevenCommit) => {
    this.loggerService.log("telegramTemplateService getBreakevenMarkdown", {
      event,
    });
    return "";
  };

  public getPartialProfitMarkdown = async (event: PartialProfitCommit) => {
    this.loggerService.log("telegramTemplateService getPartialProfitMarkdown", {
      event,
    });
    return "";
  };

  public getPartialLossMarkdown = async (event: PartialLossCommit) => {
    this.loggerService.log("telegramTemplateService getPartialLossMarkdown", {
      event,
    });
    return "";
  };

  public getScheduledMarkdown = async (
    event: IStrategyTickResultScheduled,
  ) => {
    this.loggerService.log("telegramTemplateService getScheduledMarkdown", {
      event,
    });
    return "";
  };

  public getCancelledMarkdown = async (
    event: IStrategyTickResultCancelled,
  ) => {
    this.loggerService.log("telegramTemplateService getCancelledMarkdown", {
      event,
    });
    return "";
  };

  public getOpenedMarkdown = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("telegramTemplateService getOpenedMarkdown", {
      event,
    });
    return "";
  };

  public getClosedMarkdown = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("telegramTemplateService getClosedMarkdown", {
      event,
    });
    return "";
  };
}

export default TelegramTemplateService;
