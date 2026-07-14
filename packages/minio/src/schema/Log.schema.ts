import { ILogEntry } from "backtest-kit";

interface ILogDto {
  entryId: string;
  payload: ILogEntry;
}

interface ILogRow extends ILogDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { ILogDto, ILogRow };
