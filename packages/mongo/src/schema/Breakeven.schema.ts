import mongoose, { Document, Schema } from "mongoose";
import { BreakevenData } from "tradeforge";

interface IBreakevenDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: BreakevenData;
  when: number;
}

interface BreakevenDocument extends IBreakevenDto, Document {}

interface IBreakevenRow extends IBreakevenDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const BreakevenSchema: Schema<BreakevenDocument> = new Schema(
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

BreakevenSchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1, signalId: 1 },
  { unique: true }
);

const BreakevenModel = mongoose.model<BreakevenDocument>("breakeven-items", BreakevenSchema);

export { BreakevenModel, IBreakevenDto, IBreakevenRow };
