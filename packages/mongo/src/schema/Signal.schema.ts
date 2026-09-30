import mongoose, { Document, Schema } from "mongoose";
import { ISignalRow } from "tradeforge";

interface ISignalDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: ISignalRow;
}

interface SignalDocument extends ISignalDto, Document {}

interface ISignalRowDoc extends ISignalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const SignalSchema: Schema<SignalDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

SignalSchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1 },
  { unique: true }
);

const SignalModel = mongoose.model<SignalDocument>("signal-items", SignalSchema);

export { SignalModel, ISignalDto, ISignalRowDoc };
