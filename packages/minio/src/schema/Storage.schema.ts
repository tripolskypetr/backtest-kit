import { EntitySchema } from "typeorm";
import { IStorageSignalRow } from "backtest-kit";

interface IStorageDto {
  backtest: boolean;
  signalId: string;
  payload: IStorageSignalRow;
}

interface IStorageRow extends IStorageDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StorageModel = new EntitySchema<IStorageRow>({
  name: "storage-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    backtest: { type: "boolean" },
    signalId: { type: String },
    payload: { type: "jsonb" },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "storage_items_uq",
      columns: ["backtest", "signalId"],
      unique: true,
    },
  ],
});

export { StorageModel, IStorageDto, IStorageRow };
