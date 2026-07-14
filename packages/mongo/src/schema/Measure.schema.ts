import mongoose, { Document, Schema } from "mongoose";
import { MeasureData } from "backtest-kit";

interface IMeasureDto {
  bucket: string;
  entryKey: string;
  payload: MeasureData;
  removed: boolean;
}

interface MeasureDocument extends IMeasureDto, Document {}

interface IMeasureRow extends IMeasureDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const MeasureSchema: Schema<MeasureDocument> = new Schema(
  {
    bucket: { type: String, required: true, index: true },
    entryKey: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    removed: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

MeasureSchema.index({ bucket: 1, entryKey: 1 }, { unique: true });

MeasureSchema.index({ bucket: 1, removed: 1 });

const MeasureModel = mongoose.model<MeasureDocument>("measure-items", MeasureSchema);

export { MeasureModel, IMeasureDto, IMeasureRow };
