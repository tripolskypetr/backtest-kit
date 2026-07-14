import { SessionData } from "backtest-kit";

interface ISessionDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  backtest: boolean;
  payload: SessionData;
  when: number;
}

interface ISessionRow extends ISessionDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { ISessionDto, ISessionRow };
