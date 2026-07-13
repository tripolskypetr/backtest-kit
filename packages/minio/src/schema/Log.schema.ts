import { EntitySchema } from "typeorm";
import { ILogEntry } from "backtest-kit";

interface ILogDto {
  entryId: string;
  payload: ILogEntry;
}

interface ILogRow extends ILogDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const LogModel = new EntitySchema<ILogRow>({
  name: "log-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    entryId: { type: String },
    payload: { type: "jsonb" },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "log_items_uq",
      columns: ["entryId"],
      unique: true,
    },
  ],
});

export { LogModel, ILogDto, ILogRow };
