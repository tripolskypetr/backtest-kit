import mongoose, { Document, Schema } from "mongoose";
import { StrategyData } from "backtest-kit";

interface IStrategyDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: StrategyData;
}

interface StrategyDocument extends IStrategyDto, Document {}

interface IStrategyRow extends IStrategyDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StrategySchema: Schema<StrategyDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

StrategySchema.index(
  { symbol: 1, strategyName: 1, exchangeName: 1 },
  { unique: true }
);

const StrategyModel = mongoose.model<StrategyDocument>("strategy-items", StrategySchema);

export { StrategyModel, IStrategyDto, IStrategyRow };
