import { IntervalData } from "tradeforge";

interface IIntervalDto {
  bucket: string;
  entryKey: string;
  payload: IntervalData;
  removed: boolean;
  when: number;
}

interface IIntervalRow extends IIntervalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IIntervalDto, IIntervalRow };
