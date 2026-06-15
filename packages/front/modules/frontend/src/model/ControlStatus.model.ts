import { type IPublicSignalRow, type StrategyStatus } from "backtest-kit";

export interface ControlStatusModel {
    strategyInfo: StrategyStatus;
    pendingSignal: IPublicSignalRow | null;
    currentPrice: number;
}

export default ControlStatusModel;
