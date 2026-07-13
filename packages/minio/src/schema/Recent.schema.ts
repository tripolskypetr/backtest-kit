import { IPublicSignalRow } from "backtest-kit";

interface IRecentDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  payload: IPublicSignalRow;
  when: number;
}

interface IRecentRow extends IRecentDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IRecentDto, IRecentRow };
