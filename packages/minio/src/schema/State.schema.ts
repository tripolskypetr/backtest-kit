import { EntitySchema } from "typeorm";
import { StateData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IStateDto {
  signalId: string;
  bucketName: string;
  payload: StateData;
  when: number;
}

interface IStateRow extends IStateDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StateModel = new EntitySchema<IStateRow>({
  name: "state-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    signalId: { type: String },
    bucketName: { type: String },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "state_items_uq",
      columns: ["signalId", "bucketName"],
      unique: true,
    },
  ],
});

export { StateModel, IStateDto, IStateRow };
