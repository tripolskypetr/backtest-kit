import mongoose, { Document, Schema } from "mongoose";
import { ILogEntry } from "backtest-kit";

interface ILogDto {
  entryId: string;
  payload: ILogEntry;
}

interface LogDocument extends ILogDto, Document {}

interface ILogRow extends ILogDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const LogSchema: Schema<LogDocument> = new Schema(
  {
    entryId: { type: String, required: true, unique: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

LogSchema.index({ createDate: -1 });

const LogModel = mongoose.model<LogDocument>("log-items", LogSchema);

export { LogModel, ILogDto, ILogRow };
