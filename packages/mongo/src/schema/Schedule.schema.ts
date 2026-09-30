import mongoose, { Document, Schema } from "mongoose";
import { IScheduledSignalRow } from "tradeforge";

interface IScheduleDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: IScheduledSignalRow;
}

interface ScheduleDocument extends IScheduleDto, Document {}

interface IScheduleRow extends IScheduleDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const ScheduleSchema: Schema<ScheduleDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

ScheduleSchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1 },
  { unique: true }
);

const ScheduleModel = mongoose.model<ScheduleDocument>("schedule-items", ScheduleSchema);

export { ScheduleModel, IScheduleDto, IScheduleRow };
