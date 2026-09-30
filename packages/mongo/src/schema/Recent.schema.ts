import mongoose, { Document, Schema } from "mongoose";
import { IPublicSignalRow } from "tradeforge";

interface IRecentDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  payload: IPublicSignalRow;
  when: number;
}

interface RecentDocument extends IRecentDto, Document {}

interface IRecentRow extends IRecentDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const RecentSchema: Schema<RecentDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    frameName: { type: String, required: true, index: true },
    backtest: { type: Boolean, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

RecentSchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1, frameName: 1, backtest: 1 },
  { unique: true }
);

const RecentModel = mongoose.model<RecentDocument>("recent-items", RecentSchema);

export { RecentModel, IRecentDto, IRecentRow };
