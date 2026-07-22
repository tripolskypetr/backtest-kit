import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import Mustache from "mustache";
import {
  AverageBuyCommit,
  BreakevenCommit,
  CancelScheduledCommit,
  ClosePendingCommit,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  PartialLossCommit,
  PartialProfitCommit,
  RiskContract,
  TrailingStopCommit,
  TrailingTakeCommit,
  OrderFillOpenContract,
  OrderFillCloseContract,
  OrderRejectContract,
  OrderContinueContract,
  OrderStopContract,
  SignalInfoContract,
} from "backtest-kit";
import ResolveService from "../core/ResolveService";
import { memoize, singleshot } from "functools-kit";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import { TelegramConfig } from "../../../model/Config.model";
import ConfigConnectionService from "../connection/ConfigConnectionService";

type Data =
  | BreakevenCommit
  | CancelScheduledCommit
  | ClosePendingCommit
  | IStrategyTickResultCancelled
  | IStrategyTickResultClosed
  | IStrategyTickResultOpened
  | IStrategyTickResultScheduled
  | PartialLossCommit
  | PartialProfitCommit
  | TrailingStopCommit
  | TrailingTakeCommit
  | AverageBuyCommit
  | RiskContract
  | OrderFillOpenContract
  | OrderFillCloseContract
  | OrderRejectContract
  | OrderContinueContract
  | OrderStopContract
  | SignalInfoContract;

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

const GET_TELEGRAM_CONFIG_FN = async (self: TelegramTemplateService) => {
  const exports = await self.configConnectionService.loadConfig("telegram.config");
  if (!exports) {
    return null;
  }
  return "default" in exports
    ? exports.default
    : exports;
};

export class TelegramTemplateService implements TelegramConfig {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);
  readonly configConnectionService = inject<ConfigConnectionService>(TYPES.configConnectionService);

  private getTelegramAdapter = singleshot(async (): Promise<TelegramConfig | null> => {
    this.loggerService.log("telegramTemplateService getTelegramAdapter");
    return await GET_TELEGRAM_CONFIG_FN(this);
  });

  public getTrailingTakeMarkdown = async (event: TrailingTakeCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingTakeMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getTrailingTakeMarkdown) {
      return await adapter.getTrailingTakeMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("trailing-take.mustache", event, this);
  };

  public getTrailingStopMarkdown = async (event: TrailingStopCommit) => {
    this.loggerService.log("telegramTemplateService getTrailingStopMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getTrailingStopMarkdown) {
      return await adapter.getTrailingStopMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("trailing-stop.mustache", event, this);
  };

  public getBreakevenMarkdown = async (event: BreakevenCommit) => {
    this.loggerService.log("telegramTemplateService getBreakevenMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getBreakevenMarkdown) {
      return await adapter.getBreakevenMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("breakeven.mustache", event, this);
  };

  public getPartialProfitMarkdown = async (event: PartialProfitCommit) => {
    this.loggerService.log("telegramTemplateService getPartialProfitMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getPartialProfitMarkdown) {
      return await adapter.getPartialProfitMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("partial-profit.mustache", event, this);
  };

  public getPartialLossMarkdown = async (event: PartialLossCommit) => {
    this.loggerService.log("telegramTemplateService getPartialLossMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getPartialLossMarkdown) {
      return await adapter.getPartialLossMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("partial-loss.mustache", event, this);
  };

  public getScheduledMarkdown = async (event: IStrategyTickResultScheduled) => {
    this.loggerService.log("telegramTemplateService getScheduledMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getScheduledMarkdown) {
      return await adapter.getScheduledMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("scheduled.mustache", event, this);
  };

  public getCancelledMarkdown = async (event: IStrategyTickResultCancelled) => {
    this.loggerService.log("telegramTemplateService getCancelledMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getCancelledMarkdown) {
      return await adapter.getCancelledMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("cancelled.mustache", event, this);
  };

  public getOpenedMarkdown = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("telegramTemplateService getOpenedMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOpenedMarkdown) {
      return await adapter.getOpenedMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("opened.mustache", event, this);
  };

  public getClosedMarkdown = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("telegramTemplateService getClosedMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getClosedMarkdown) {
      return await adapter.getClosedMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("closed.mustache", event, this);
  };

  public getRiskMarkdown = async (event: RiskContract) => {
    this.loggerService.log("telegramTemplateService getRiskMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getRiskMarkdown) {
      return await adapter.getRiskMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("risk.mustache", event, this);
  };

  public getAverageBuyMarkdown = async (event: AverageBuyCommit) => {
    this.loggerService.log("telegramTemplateService getAverageBuyMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getAverageBuyMarkdown) {
      return await adapter.getAverageBuyMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("average-buy.mustache", event, this);
  };

  public getOrderOpenMarkdown = async (event: OrderFillOpenContract) => {
    this.loggerService.log("telegramTemplateService getOrderOpenMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOrderOpenMarkdown) {
      return await adapter.getOrderOpenMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("order-open.mustache", event, this);
  };

  public getOrderCloseMarkdown = async (event: OrderFillCloseContract) => {
    this.loggerService.log("telegramTemplateService getOrderCloseMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOrderCloseMarkdown) {
      return await adapter.getOrderCloseMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("order-close.mustache", event, this);
  };

  public getOrderRejectedMarkdown = async (event: OrderRejectContract) => {
    this.loggerService.log("telegramTemplateService getOrderRejectedMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOrderRejectedMarkdown) {
      return await adapter.getOrderRejectedMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("order-rejected.mustache", event, this);
  };

  public getOrderContinueMarkdown = async (event: OrderContinueContract) => {
    this.loggerService.log("telegramTemplateService getOrderContinueMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOrderContinueMarkdown) {
      return await adapter.getOrderContinueMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("order-continue.mustache", event, this);
  };

  public getOrderStopMarkdown = async (event: OrderStopContract) => {
    this.loggerService.log("telegramTemplateService getOrderStopMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getOrderStopMarkdown) {
      return await adapter.getOrderStopMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("order-stop.mustache", event, this);
  };

  public getCancelScheduledMarkdown = async (event: CancelScheduledCommit) => {
    this.loggerService.log("telegramTemplateService getCancelScheduledMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getCancelScheduledMarkdown) {
      return await adapter.getCancelScheduledMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("cancel-scheduled.mustache", event, this);
  };

  public getClosePendingMarkdown = async (event: ClosePendingCommit) => {
    this.loggerService.log("telegramTemplateService getClosePendingMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getClosePendingMarkdown) {
      return await adapter.getClosePendingMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("close-pending.mustache", event, this);
  };

  public getSignalInfoMarkdown = async (event: SignalInfoContract) => {
    this.loggerService.log("telegramTemplateService getSignalInfoMarkdown", {
      event,
    });
    const adapter = await this.getTelegramAdapter();
    if (adapter?.getSignalInfoMarkdown) {
      return await adapter.getSignalInfoMarkdown(event);
    }
    return await RENDER_TEMPLATE_FN("signal-info.mustache", event, this);
  };
}

export default TelegramTemplateService;
