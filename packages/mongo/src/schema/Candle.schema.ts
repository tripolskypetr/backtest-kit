import { CandleInterval } from "backtest-kit";
import mongoose, { Document, Schema } from "mongoose";

const INTERVAL_ENUM = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "1d",
] as const;

interface ICandleDto {
  symbol: string;
  interval: CandleInterval;
  exchangeName: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandleDocument extends ICandleDto, Document {}

interface ICandleRow extends ICandleDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const CandleSchema: Schema<CandleDocument> = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    interval: { type: String, required: true, enum: INTERVAL_ENUM, index: true },
    timestamp: { type: Number, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" } }
);

CandleSchema.index({ exchangeName: 1, symbol: 1, interval: 1, timestamp: 1 }, { unique: true });

const CandleModel = mongoose.model<CandleDocument>("candle-items", CandleSchema);

export { CandleModel, ICandleDto, ICandleRow };
