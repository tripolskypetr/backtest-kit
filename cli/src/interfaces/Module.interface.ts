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

export interface ILiveModule {
  onTrailingTake(event: TrailingTakeCommit): Promise<void> | void;

  onTrailingStop(event: TrailingStopCommit): Promise<void> | void;

  onBreakeven(event: BreakevenCommit): Promise<void> | void;

  onPartialProfit(event: PartialProfitCommit): Promise<void> | void;

  onPartialLoss(event: PartialLossCommit): Promise<void> | void;

  onScheduled(
    event: IStrategyTickResultScheduled,
  ): Promise<void> | void;

  onCancelled(
    event: IStrategyTickResultCancelled,
  ): Promise<void> | void;

  onOpened(event: IStrategyTickResultOpened): Promise<void> | void;

  onClosed(event: IStrategyTickResultClosed): Promise<void> | void;

  onRisk(event: RiskContract): Promise<void> | void;

  onAverageBuy(event: AverageBuyCommit): Promise<void> | void;
}

export type LiveModule = Partial<ILiveModule>;

export type BaseModule = LiveModule;

export type TBaseModuleCtor = new () => BaseModule;
