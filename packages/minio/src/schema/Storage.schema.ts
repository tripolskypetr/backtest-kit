import { IStorageSignalRow } from "tradeforge";

interface IStorageDto {
  backtest: boolean;
  signalId: string;
  payload: IStorageSignalRow;
}

interface IStorageRow extends IStorageDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IStorageDto, IStorageRow };
