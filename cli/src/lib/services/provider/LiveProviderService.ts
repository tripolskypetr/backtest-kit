import { compose, singleshot, trycatch } from "functools-kit";
import {
  AverageBuyCommit,
  BreakevenCommit,
  IStrategyTickResultCancelled,
  IStrategyTickResultClosed,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  listenRisk,
  listenSignal,
  listenStrategyCommit,
  PartialLossCommit,
  PartialProfitCommit,
  RiskContract,
  TrailingStopCommit,
  TrailingTakeCommit,
} from "backtest-kit";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ModuleConnectionService from "../connection/ModuleConnectionService";
import { LiveModule } from "../../../interfaces/Module.interface";
import { getArgs } from "../../../helpers/getArgs";
import { entrySubject } from "../../../config/emitters";

const LOAD_INSTANCE_FN = singleshot(
  trycatch(
    async (self: LiveProviderService) => {
      const module = <LiveModule>(
        await self.moduleConnectionService.getInstance("./live.module")
      );
      return module;
    },
    { defaultValue: null },
  ),
);

export class LiveProviderService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  readonly moduleConnectionService = inject<ModuleConnectionService>(
    TYPES.moduleConnectionService,
  );

  private handleTrailingTake = async (event: TrailingTakeCommit) => {
    this.loggerService.log("liveProviderService handleTrailingTake", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onTrailingTake) {
      await instance.onTrailingTake(event);
    }
  };

  private handleTrailingStop = async (event: TrailingStopCommit) => {
    this.loggerService.log("liveProviderService handleTrailingStop", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onTrailingStop) {
      await instance.onTrailingStop(event);
    }
  };

  private handleBreakeven = async (event: BreakevenCommit) => {
    this.loggerService.log("liveProviderService handleBreakeven", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onBreakeven) {
      await instance.onBreakeven(event);
    }
  };

  private handlePartialProfit = async (event: PartialProfitCommit) => {
    this.loggerService.log("liveProviderService handlePartialProfit", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onPartialProfit) {
      await instance.onPartialProfit(event);
    }
  };

  private handlePartialLoss = async (event: PartialLossCommit) => {
    this.loggerService.log("liveProviderService handlePartialLoss", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onPartialLoss) {
      await instance.onPartialLoss(event);
    }
  };

  private handleScheduled = async (event: IStrategyTickResultScheduled) => {
    this.loggerService.log("liveProviderService handleScheduled", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onScheduled) {
      await instance.onScheduled(event);
    }
  };

  private handleCancelled = async (event: IStrategyTickResultCancelled) => {
    this.loggerService.log("liveProviderService handleCancelled", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onCancelled) {
      await instance.onCancelled(event);
    }
  };

  private handleOpened = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("liveProviderService handleOpened", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onOpened) {
      await instance.onOpened(event);
    }
  };

  private handleClosed = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("liveProviderService handleClosed", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onClosed) {
      await instance.onClosed(event);
    }
  };

  private handleRisk = async (event: RiskContract) => {
    this.loggerService.log("liveProviderService handleClosed", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onRisk) {
      await instance.onRisk(event);
    }
  };

  private handleAverageBuy = async (event: AverageBuyCommit) => {
    this.loggerService.log("liveProviderService handleAverageBuy", {
      event,  
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance?.onAverageBuy) {
      await instance.onAverageBuy(event);
    } 
  };

  public enable = singleshot(() => {
    this.loggerService.log("liveProviderService enable");

    LOAD_INSTANCE_FN(this).then((module) => {
      if (module) {
        this.loggerService.log(
          "Live trading initialized successfully with ./modules/live.module.mjs",
        );
        return;
      }
      console.log(
        "No ./modules/live.module.mjs found, live trading failed to initialize",
      );
      process.exit(-1);
    });

    const unRisk = listenRisk(async (event) => {
      await this.handleRisk(event);
    });

    const unSignal = listenSignal(async (event) => {
      if (event.action === "scheduled") {
        await this.handleScheduled(event);
        return;
      }
      if (event.action === "cancelled") {
        await this.handleCancelled(event);
        return;
      }
      if (event.action === "opened") {
        await this.handleOpened(event);
        return;
      }
      if (event.action === "closed") {
        await this.handleClosed(event);
        return;
      }
    });

    const unCommit = listenStrategyCommit(async (event) => {
      if (event.action === "trailing-take") {
        await this.handleTrailingTake(event);
        return;
      }
      if (event.action === "trailing-stop") {
        await this.handleTrailingStop(event);
        return;
      }
      if (event.action === "breakeven") {
        await this.handleBreakeven(event);
        return;
      }
      if (event.action === "partial-profit") {
        await this.handlePartialProfit(event);
        return;
      }
      if (event.action === "partial-loss") {
        await this.handlePartialLoss(event);
        return;
      }
      if (event.action === "average-buy") {
        await this.handleAverageBuy(event);
        return;
      }
    });

    const unConnect = () => this.enable.clear();

    return compose(
      () => unRisk(),
      () => unSignal(),
      () => unCommit(),
      () => unConnect(),
    );
  });

  public disable = () => {
    this.loggerService.log("liveProviderService disable");
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public connect = singleshot(async () => {
    this.loggerService.log("liveProviderService connect");
    if (!getArgs().values.live) {
      return;
    }
    return entrySubject.subscribe(this.enable);
  });
}

export default LiveProviderService;
