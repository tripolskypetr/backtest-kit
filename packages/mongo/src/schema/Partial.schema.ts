import mongoose, { Document, Schema } from "mongoose";
import { PartialData } from "tradeforge";

interface IPartialDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: PartialData;
  when: number;
}

interface PartialDocument extends IPartialDto, Document {}

interface IPartialRow extends IPartialDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const PartialSchema: Schema<PartialDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    signalId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

PartialSchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1, signalId: 1 },
  { unique: true }
);

const PartialModel = mongoose.model<PartialDocument>("partial-items", PartialSchema);

export { PartialModel, IPartialDto, IPartialRow };
