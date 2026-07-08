import { EntitySchema } from "typeorm";
import { BreakevenData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IBreakevenDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: BreakevenData;
  when: number;
}

interface IBreakevenRow extends IBreakevenDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const BreakevenModel = new EntitySchema<IBreakevenRow>({
  name: "breakeven-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    symbol: { type: String },
    strategyName: { type: String },
    exchangeName: { type: String },
    signalId: { type: String },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "breakeven_items_uq",
      columns: ["symbol", "strategyName", "exchangeName", "signalId"],
      unique: true,
    },
  ],
});

export { BreakevenModel, IBreakevenDto, IBreakevenRow };
