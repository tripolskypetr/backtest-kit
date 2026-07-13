import { EntitySchema } from "typeorm";
import { PartialData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IPartialDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  signalId: string;
  payload: PartialData;
  when: number;
}

interface IPartialRow extends IPartialDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const PartialModel = new EntitySchema<IPartialRow>({
  name: "partial-items",
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
      name: "partial_items_uq",
      columns: ["symbol", "strategyName", "exchangeName", "signalId"],
      unique: true,
    },
  ],
});

export { PartialModel, IPartialDto, IPartialRow };
