import { StrategyData } from "backtest-kit";

interface IStrategyDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: StrategyData;
}

interface IStrategyRow extends IStrategyDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IStrategyDto, IStrategyRow };
