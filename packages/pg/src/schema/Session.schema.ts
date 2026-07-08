import { EntitySchema } from "typeorm";
import { SessionData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface ISessionDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  backtest: boolean;
  payload: SessionData;
  when: number;
}

interface ISessionRow extends ISessionDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

// Symbol and backtest are part of the uniqueness key: without them two
// symbols running the same strategy shared one record and restored each
// other's session state after a restart.
const SessionModel = new EntitySchema<ISessionRow>({
  name: "session-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    strategyName: { type: String },
    exchangeName: { type: String },
    frameName: { type: String },
    symbol: { type: String },
    backtest: { type: "boolean" },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "session_items_uq",
      columns: ["strategyName", "exchangeName", "frameName", "symbol", "backtest"],
      unique: true,
    },
  ],
});

export { SessionModel, ISessionDto, ISessionRow };
