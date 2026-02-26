import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import Mustache from "mustache";
import {
  AverageBuyCommit,
  BreakevenCommit,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  PartialLossCommit,
  PartialProfitCommit,
  RiskContract,
  TrailingStopCommit,
  TrailingTakeCommit,
} from "backtest-kit";
import ResolveService from "../base/ResolveService";
import { memoize } from "functools-kit";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";

type Data =
  | BreakevenCommit
  | IStrategyTickResultCancelled
  | IStrategyTickResultClosed
  | IStrategyTickResultOpened
  | IStrategyTickResultScheduled
  | PartialLossCommit
  | PartialProfitCommit
  | TrailingStopCommit
  | TrailingTakeCommit
  | AverageBuyCommit
  | RiskContract;

const READ_TEMPLATE_FN = memoize(
  ([fileName]) => `${fileName}`,
  async (fileName: string, self: TelegramTemplateService) => {
    const overridePath = path.join(
      self.resolveService.OVERRIDE_TEMPLATE_DIR,
      fileName,
    );
    const hasOverride = await fs
      .access(overridePath, constants.F_OK | constants.R_OK)
      .then(() => true)
      .catch(() => false);
    if (hasOverride) {
      return await fs.readFile(overridePath, "utf-8");
    }
    const defaultPath = path.join(
      self.resolveService.DEFAULT_TEMPLATE_DIR,
      fileName,
    );
    return await fs.readFile(defaultPath, "utf-8");
  },
);

const RENDER_TEMPLATE_FN = async (
  fileName: string,
  event: Data,
  self: TelegramTemplateService,
) => {
  const template = await READ_TEMPLATE_FN(fileName, self);
  return Mustache.render(template, event);
};

export class TelegramTemplateService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  public getTrailingTakeMarkdown = async (event: TrailingTakeCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingTakeMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("trailing-take.mustache", event, this);
  };

  public getTrailingStopMarkdown = async (event: TrailingStopCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingStopMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("trailing-stop.mustache", event, this);
  };

  public getBreakevenMarkdown = async (event: BreakevenCommit) => {
    this.loggerService.log("telegramTemplateService getBreakevenMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("breakeven.mustache", event, this);
  };

  public getPartialProfitMarkdown = async (event: PartialProfitCommit) => {
    this.loggerService.log("telegramTemplateService getPartialProfitMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("partial-profit.mustache", event, this);
  };

  public getPartialLossMarkdown = async (event: PartialLossCommit) => {
    this.loggerService.log("telegramTemplateService getPartialLossMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("partial-loss.mustache", event, this);
  };

  public getScheduledMarkdown = async (event: IStrategyTickResultScheduled) => {
    this.loggerService.log("telegramTemplateService getScheduledMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("scheduled.mustache", event, this);
  };

  public getCancelledMarkdown = async (event: IStrategyTickResultCancelled) => {
    this.loggerService.log("telegramTemplateService getCancelledMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("cancelled.mustache", event, this);
  };

  public getOpenedMarkdown = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("telegramTemplateService getOpenedMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("opened.mustache", event, this);
  };

  public getClosedMarkdown = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("telegramTemplateService getClosedMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("closed.mustache", event, this);
  };

  public getRiskMarkdown = async (event: RiskContract) => {
    this.loggerService.log("telegramTemplateService getRiskMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("risk.mustache", event, this);
  };

  public getAverageBuyMarkdown = async (event: AverageBuyCommit) => {
    this.loggerService.log("telegramTemplateService getAverageBuyMarkdown", {
      event,
    });
    return await RENDER_TEMPLATE_FN("average-buy.mustache", event, this);
  };
}

export default TelegramTemplateService;
