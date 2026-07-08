import { EntitySchema } from "typeorm";
import { StrategyData } from "backtest-kit";

interface IStrategyDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: StrategyData | null;
}

interface IStrategyRow extends IStrategyDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StrategyModel = new EntitySchema<IStrategyRow>({
  name: "strategy-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    symbol: { type: String },
    strategyName: { type: String },
    exchangeName: { type: String },
    payload: { type: "jsonb", nullable: true },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "strategy_items_uq",
      columns: ["symbol", "strategyName", "exchangeName"],
      unique: true,
    },
  ],
});

export { StrategyModel, IStrategyDto, IStrategyRow };
