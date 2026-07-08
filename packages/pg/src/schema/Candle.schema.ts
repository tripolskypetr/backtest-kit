import { EntitySchema } from "typeorm";
import { CandleInterval } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface ICandleDto {
  symbol: string;
  interval: CandleInterval;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ICandleRow extends ICandleDto {
  id: string;
  exchangeName: string;
  createDate: Date;
  updatedDate: Date;
}

const CandleModel = new EntitySchema<ICandleRow>({
  name: "candle-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    symbol: { type: String },
    interval: { type: String },
    timestamp: { type: "bigint", transformer: epochTransformer },
    exchangeName: { type: String },
    open: { type: "double precision" },
    high: { type: "double precision" },
    low: { type: "double precision" },
    close: { type: "double precision" },
    volume: { type: "double precision" },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "candle_items_uq",
      columns: ["symbol", "interval", "timestamp"],
      unique: true,
    },
  ],
});

export { CandleModel, ICandleDto, ICandleRow };
