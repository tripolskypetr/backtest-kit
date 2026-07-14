import { ISignalRow } from "backtest-kit";

interface ISignalDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: ISignalRow;
}

interface ISignalRowDoc extends ISignalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { ISignalDto, ISignalRowDoc };
