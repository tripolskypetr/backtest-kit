import mongoose, { Document, Schema } from "mongoose";
import { IntervalData } from "backtest-kit";

interface IIntervalDto {
  bucket: string;
  entryKey: string;
  payload: IntervalData;
  removed: boolean;
  when: number;
}

interface IntervalDocument extends IIntervalDto, Document {}

interface IIntervalRow extends IIntervalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const IntervalSchema: Schema<IntervalDocument> = new Schema(
  {
    bucket: { type: String, required: true, index: true },
    entryKey: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    removed: { type: Boolean, required: true, default: false, index: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

IntervalSchema.index({ bucket: 1, entryKey: 1 }, { unique: true });

IntervalSchema.index({ bucket: 1, removed: 1 });

const IntervalModel = mongoose.model<IntervalDocument>("interval-items", IntervalSchema);

export { IntervalModel, IIntervalDto, IIntervalRow };
