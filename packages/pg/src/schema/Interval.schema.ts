import { EntitySchema } from "typeorm";
import { IntervalData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IIntervalDto {
  bucket: string;
  entryKey: string;
  payload: IntervalData;
  removed: boolean;
  when: number;
}

interface IIntervalRow extends IIntervalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const IntervalModel = new EntitySchema<IIntervalRow>({
  name: "interval-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    bucket: { type: String },
    entryKey: { type: String },
    payload: { type: "jsonb" },
    removed: { type: "boolean", default: false },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "interval_items_uq",
      columns: ["bucket", "entryKey"],
      unique: true,
    },
  ],
});

export { IntervalModel, IIntervalDto, IIntervalRow };
