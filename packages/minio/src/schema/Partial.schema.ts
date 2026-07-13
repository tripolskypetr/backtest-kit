import { PartialData } from "backtest-kit";

interface IPartialDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: PartialData;
  when: number;
}

interface IPartialRow extends IPartialDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IPartialDto, IPartialRow };
