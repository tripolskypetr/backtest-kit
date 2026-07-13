import { MeasureData } from "backtest-kit";

interface IMeasureDto {
  bucket: string;
  entryKey: string;
  payload: MeasureData;
  removed: boolean;
}

interface IMeasureRow extends IMeasureDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IMeasureDto, IMeasureRow };
