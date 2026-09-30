import { IScheduledSignalRow } from "tradeforge";

interface IScheduleDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: IScheduledSignalRow;
}

interface IScheduleRow extends IScheduleDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IScheduleDto, IScheduleRow };
