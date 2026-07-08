import { EntitySchema } from "typeorm";
import { ISignalRow } from "backtest-kit";

interface ISignalDto {
  symbol: string;
  strategyName: string;
  exchangeName: string;
  payload: ISignalRow | null;
}

interface ISignalRowDoc extends ISignalDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const SignalModel = new EntitySchema<ISignalRowDoc>({
  name: "signal-items",
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
      name: "signal_items_uq",
      columns: ["symbol", "strategyName", "exchangeName"],
      unique: true,
    },
  ],
});

export { SignalModel, ISignalDto, ISignalRowDoc };
