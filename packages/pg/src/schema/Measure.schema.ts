import { EntitySchema } from "typeorm";
import { MeasureData } from "backtest-kit";

interface IMeasureDto {
  bucket: string;
  entryKey: string;
  payload: MeasureData;
  removed: boolean;
}

interface IMeasureRow extends IMeasureDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const MeasureModel = new EntitySchema<IMeasureRow>({
  name: "measure-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    bucket: { type: String },
    entryKey: { type: String },
    payload: { type: "jsonb" },
    removed: { type: "boolean", default: false },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "measure_items_uq",
      columns: ["bucket", "entryKey"],
      unique: true,
    },
    {
      name: "measure_items_bucket_removed_idx",
      columns: ["bucket", "removed"],
    },
  ],
});

export { MeasureModel, IMeasureDto, IMeasureRow };
