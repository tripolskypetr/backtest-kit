import { BreakevenData } from "backtest-kit";

interface IBreakevenDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: BreakevenData;
  when: number;
}

interface IBreakevenRow extends IBreakevenDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IBreakevenDto, IBreakevenRow };
