import { EntitySchema } from "typeorm";
import { IPublicSignalRow } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IRecentDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  payload: IPublicSignalRow;
  when: number;
}

interface IRecentRow extends IRecentDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const RecentModel = new EntitySchema<IRecentRow>({
  name: "recent-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    symbol: { type: String },
    strategyName: { type: String },
    exchangeName: { type: String },
    frameName: { type: String },
    backtest: { type: "boolean" },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "recent_items_uq",
      columns: ["symbol", "strategyName", "exchangeName", "frameName", "backtest"],
      unique: true,
    },
  ],
});

export { RecentModel, IRecentDto, IRecentRow };
