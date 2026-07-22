import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { compose, singleshot, trycatch } from "functools-kit";
import { getTelegram } from "../../../config/telegram";
import {
  BreakevenCommit,
  CancelScheduledCommit,
  ClosePendingCommit,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  listenRisk,
  listenSignal,
  listenStrategyCommit,
  listenOrderFill,
  listenOrderReject,
  PartialLossCommit,
  PartialProfitCommit,
  RiskContract,
  TrailingStopCommit,
  TrailingTakeCommit,
  AverageBuyCommit,
  OrderFillOpenContract,
  OrderFillCloseContract,
  OrderRejectContract,
  SignalInfoContract,
  listenSignalNotify,
} from "backtest-kit";
import TelegramTemplateService from "../template/TelegramTemplateService";
import TelegramWebService from "../web/TelegramWebService";

const STOP_BOT_FN = singleshot(async () => {
  const { stopBot } = await getTelegram();
  stopBot();
});

export class TelegramLogicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly telegramTemplateService = inject<TelegramTemplateService>(
    TYPES.telegramTemplateService,
  );
  private readonly telegramWebService = inject<TelegramWebService>(
    TYPES.telegramWebService,
  );

  private notifyTrailingTake = async (event: TrailingTakeCommit) => {
    this.loggerService.log("telegramLogicService notifyTrailingTake", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getTrailingTakeMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyTrailingStop = async (event: TrailingStopCommit) => {
    this.loggerService.log("telegramLogicService notifyTrailingStop", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getTrailingStopMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyBreakeven = async (event: BreakevenCommit) => {
    this.loggerService.log("telegramLogicService notifyBreakeven", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getBreakevenMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyPartialProfit = async (event: PartialProfitCommit) => {
    this.loggerService.log("telegramLogicService notifyPartialProfit", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getPartialProfitMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyPartialLoss = async (event: PartialLossCommit) => {
    this.loggerService.log("telegramLogicService notifyPartialLoss", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getPartialLossMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyScheduled = async (event: IStrategyTickResultScheduled) => {
    this.loggerService.log("telegramLogicService notifyScheduled", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getScheduledMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyCancelled = async (event: IStrategyTickResultCancelled) => {
    this.loggerService.log("telegramLogicService notifyCancelled", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getCancelledMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyOpened = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("telegramLogicService notifyOpened", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getOpenedMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyClosed = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("telegramLogicService notifyClosed", {
      event,
    });
    const markdown =
      await this.telegramTemplateService.getClosedMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyRisk = async (event: RiskContract) => {
    this.loggerService.log("telegramLogicService notifyRisk", {
      event,
    });
    const markdown = await this.telegramTemplateService.getRiskMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyAverageBuy = async (event: AverageBuyCommit) => {
    this.loggerService.log("telegramLogicService notifyAverageBuy", {
      event,
    });
    const markdown = await this.telegramTemplateService.getAverageBuyMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifySignalOpen = trycatch(async (event: OrderFillOpenContract) => {
    this.loggerService.log("telegramLogicService notifySignalOpen", {
      event,
    });
    const markdown = await this.telegramTemplateService.getSignalOpenMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  });

  private notifySignalClose = trycatch(async (event: OrderFillCloseContract) => {
    this.loggerService.log("telegramLogicService notifySignalClose", {
      event,
    });
    const markdown = await this.telegramTemplateService.getSignalCloseMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  });

  private notifyOrderRejected = trycatch(async (event: OrderRejectContract) => {
    this.loggerService.log("telegramLogicService notifyOrderRejected", {
      event,
    });
    const markdown = await this.telegramTemplateService.getOrderRejectedMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  });

  private notifySignalInfo = trycatch(async (event: SignalInfoContract) => {
    this.loggerService.log("telegramLogicService notifySignalInfo", {
      event,
    });
    const markdown = await this.telegramTemplateService.getSignalInfoMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  });

  private notifyCancelScheduled = async (event: CancelScheduledCommit) => {
    this.loggerService.log("telegramLogicService notifyCancelScheduled", {
      event,
    });
    const markdown = await this.telegramTemplateService.getCancelScheduledMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  private notifyClosePending = async (event: ClosePendingCommit) => {
    this.loggerService.log("telegramLogicService notifyClosePending", {
      event,
    });
    const markdown = await this.telegramTemplateService.getClosePendingMarkdown(event);
    if (!markdown) {
      return;
    }
    await this.telegramWebService.publishNotify({
      symbol: event.symbol,
      markdown,
    });
  };

  public connect = singleshot(() => {
    this.loggerService.log("telegramLogicService connect");

    const unRisk = listenRisk(async (event) => {
      await this.notifyRisk(event);
    });

    const unSignal = listenSignal(async (event) => {
      if (event.action === "scheduled") {
        await this.notifyScheduled(event);
        return;
      }
      if (event.action === "cancelled") {
        await this.notifyCancelled(event);
        return;
      }
      if (event.action === "opened") {
        await this.notifyOpened(event);
        return;
      }
      if (event.action === "closed") {
        await this.notifyClosed(event);
        return;
      }
    });

    const unCommit = listenStrategyCommit(async (event) => {
      if (event.action === "trailing-take") {
        await this.notifyTrailingTake(event);
        return;
      }
      if (event.action === "trailing-stop") {
        await this.notifyTrailingStop(event);
        return;
      }
      if (event.action === "breakeven") {
        await this.notifyBreakeven(event);
        return;
      }
      if (event.action === "partial-profit") {
        await this.notifyPartialProfit(event);
        return;
      }
      if (event.action === "partial-loss") {
        await this.notifyPartialLoss(event);
        return;
      }
      if (event.action === "average-buy") {
        await this.notifyAverageBuy(event);
        return;
      }
      if (event.action === "cancel-scheduled") {
        await this.notifyCancelScheduled(event);
        return;
      }
      if (event.action === "close-pending") {
        await this.notifyClosePending(event);
        return;
      }
    });

    // Broker-CONFIRMED fills only (post-verdict orderFillSubject): a rejected or
    // transient gate attempt never reaches this channel, so "Order Filled" is
    // guaranteed truthful. The pre-verdict syncSubject is NOT consumed here.
    const unOrderFill = listenOrderFill(async (event) => {
      if (event.action === "signal-open") {
        // type "schedule" is a resting-order PLACEMENT, not a position fill:
        // the user already got the "scheduled" notification from listenSignal
        if (event.type !== "active") {
          return;
        }
        await this.notifySignalOpen(event);
        return;
      }
      if (event.action === "signal-close") {
        await this.notifySignalClose(event);
        return;
      }
    });

    // Terminal broker rejection (post-verdict orderRejectSubject): exactly one
    // event per dropped order attempt — the engine consumes the rejected signal
    // id, so this cannot repeat per-tick for the same signal.
    const unOrderReject = listenOrderReject(async (event) => {
      await this.notifyOrderRejected(event);
    });

    const unSignalNotify = listenSignalNotify(async (event) => {
      await this.notifySignalInfo(event);
    });

    const unConnect = () => this.connect.clear();

    const unListen = compose(
      () => unRisk(),
      () => unSignal(),
      () => unCommit(),
      () => unOrderFill(),
      () => unOrderReject(),
      () => unSignalNotify(),
      () => unConnect(),
    );

    return () => {
      STOP_BOT_FN();
      unListen();
    };
  });
}

export default TelegramLogicService;
