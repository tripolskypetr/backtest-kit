import { MemoryData } from "backtest-kit";

interface IMemoryDto {
  signalId: string;
  bucketName: string;
  memoryId: string;
  payload: MemoryData;
  removed: boolean;
  when: number;
}

interface IMemoryRow extends IMemoryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IMemoryDto, IMemoryRow };
