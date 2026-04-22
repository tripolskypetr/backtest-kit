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
  SignalOpenContract,
  SignalCloseContract,
  SignalInfoContract,
} from "backtest-kit";

export interface SymbolConfig {
  icon: string;
  logo: string;
  symbol: string;
  displayName: string;
  color: string;
  priority: number;
  description: string;
}

export interface NotificationConfig {
  signal: boolean;
  risk: boolean;
  info: boolean;
  breakeven: boolean;
  common_error: boolean;
  critical_error: boolean;
  validation_error: boolean;
  partial_loss: boolean;
  partial_profit: boolean;
  signal_sync: boolean;
  strategy_commit: boolean;
}

export interface TelegramConfig {
  getTrailingTakeMarkdown(event: TrailingTakeCommit): Promise<string>;
  getTrailingStopMarkdown(event: TrailingStopCommit): Promise<string>;
  getBreakevenMarkdown(event: BreakevenCommit): Promise<string>;
  getPartialProfitMarkdown(event: PartialProfitCommit): Promise<string>;
  getPartialLossMarkdown(event: PartialLossCommit): Promise<string>;
  getScheduledMarkdown(event: IStrategyTickResultScheduled): Promise<string>;
  getCancelledMarkdown(event: IStrategyTickResultCancelled): Promise<string>;
  getOpenedMarkdown(event: IStrategyTickResultOpened): Promise<string>;
  getClosedMarkdown(event: IStrategyTickResultClosed): Promise<string>;
  getRiskMarkdown(event: RiskContract): Promise<string>;
  getAverageBuyMarkdown(event: AverageBuyCommit): Promise<string>;
  getSignalOpenMarkdown(event: SignalOpenContract): Promise<string>;
  getSignalCloseMarkdown(event: SignalCloseContract): Promise<string>;
  getCancelScheduledMarkdown(event: CancelScheduledCommit): Promise<string>;
  getClosePendingMarkdown(event: ClosePendingCommit): Promise<string>;
  getSignalInfoMarkdown(event: SignalInfoContract): Promise<string>;
}
