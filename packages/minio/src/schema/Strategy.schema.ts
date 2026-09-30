import { StrategyData } from "tradeforge";

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
