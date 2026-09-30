import mongoose, { Document, Schema } from "mongoose";
import { IStorageSignalRow } from "tradeforge";

interface IStorageDto {
  backtest: boolean;
  signalId: string;
  payload: IStorageSignalRow;
}

interface StorageDocument extends IStorageDto, Document {}

interface IStorageRow extends IStorageDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StorageSchema: Schema<StorageDocument> = new Schema(
  {
    backtest: { type: Boolean, required: true, index: true },
    signalId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

StorageSchema.index({ backtest: 1, signalId: 1 }, { unique: true });

const StorageModel = mongoose.model<StorageDocument>("storage-items", StorageSchema);

export { StorageModel, IStorageDto, IStorageRow };
