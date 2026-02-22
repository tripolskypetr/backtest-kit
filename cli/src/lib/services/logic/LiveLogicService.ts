import { compose, singleshot } from "functools-kit";
import {
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
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ModuleConnectionService from "../connection/ModuleConnectionService";
import { LiveModule } from "src/interfaces/Module.interface";

const LOAD_INSTANCE_FN = singleshot(async (self: LiveLogicService) => {
    const module = <LiveModule>(
      await self.moduleConnectionService.getInstance("./live.module")
    );
    return module;
});

export class LiveLogicService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  readonly moduleConnectionService = inject<ModuleConnectionService>(
    TYPES.moduleConnectionService,
  );

  private handleTrailingTake = async (event: TrailingTakeCommit) => {
    this.loggerService.log("liveLogicService handleTrailingTake", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onTrailingTake) {
        await instance.onTrailingTake(event);
    }
  };

  private handleTrailingStop = async (event: TrailingStopCommit) => {
    this.loggerService.log("liveLogicService handleTrailingStop", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onTrailingStop) {
        await instance.onTrailingStop(event);
    }
  };

  private handleBreakeven = async (event: BreakevenCommit) => {
    this.loggerService.log("liveLogicService handleBreakeven", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onBreakeven) {
        await instance.onBreakeven(event);
    }
  };

  private handlePartialProfit = async (event: PartialProfitCommit) => {
    this.loggerService.log("liveLogicService handlePartialProfit", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onPartialProfit) {
        await instance.onPartialProfit(event);
    }
  };

  private handlePartialLoss = async (event: PartialLossCommit) => {
    this.loggerService.log("liveLogicService handlePartialLoss", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onPartialLoss) {
        await instance.onPartialLoss(event);
    }
  };

  private handleScheduled = async (event: IStrategyTickResultScheduled) => {
    this.loggerService.log("liveLogicService handleScheduled", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onScheduled) {
        await instance.onScheduled(event);
    }
  };

  private handleCancelled = async (event: IStrategyTickResultCancelled) => {
    this.loggerService.log("liveLogicService handleCancelled", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onCancelled) {
        await instance.onCancelled(event);
    }
  };

  private handleOpened = async (event: IStrategyTickResultOpened) => {
    this.loggerService.log("liveLogicService handleOpened", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onOpened) {
        await instance.onOpened(event);
    }
  };

  private handleClosed = async (event: IStrategyTickResultClosed) => {
    this.loggerService.log("liveLogicService handleClosed", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onClosed) {
        await instance.onClosed(event);
    }
  };

  private handleRisk = async (event: RiskContract) => {
    this.loggerService.log("liveLogicService handleClosed", {
      event,
    });
    const instance = await LOAD_INSTANCE_FN(this);
    if (instance.onRisk) {
        await instance.onRisk(event);
    }
  };

  public connect = singleshot(() => {
    this.loggerService.log("liveLogicService connect");

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
    });

    return compose(
      () => unRisk(),
      () => unSignal(),
      () => unCommit(),
    );
  });
}

export default LiveLogicService;
