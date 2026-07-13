import { EntitySchema } from "typeorm";
import { IScheduledSignalRow } from "backtest-kit";

interface IScheduleDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: IScheduledSignalRow | null;
}

interface IScheduleRow extends IScheduleDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const ScheduleModel = new EntitySchema<IScheduleRow>({
  name: "schedule-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    symbol: { type: String },
    strategyName: { type: String },
    exchangeName: { type: String },
    payload: { type: "jsonb", nullable: true },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "schedule_items_uq",
      columns: ["symbol", "strategyName", "exchangeName"],
      unique: true,
    },
  ],
});

export { ScheduleModel, IScheduleDto, IScheduleRow };
