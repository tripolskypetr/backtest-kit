import mongoose, { Document, Schema } from "mongoose";
import { SessionData } from "backtest-kit";

interface ISessionDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  symbol: string;
  backtest: boolean;
  payload: SessionData;
  when: number;
}

interface SessionDocument extends ISessionDto, Document {}

interface ISessionRow extends ISessionDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const SessionSchema: Schema<SessionDocument> = new Schema(
  {
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    frameName: { type: String, required: true, index: true },
    symbol: { type: String, required: true, index: true },
    backtest: { type: Boolean, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

// Symbol and backtest are part of the uniqueness key: without them two
// symbols running the same strategy shared one record and restored each
// other's session state after a restart.
// Migration note: existing deployments carry the legacy unique index
// (strategyName, exchangeName, frameName) — drop it manually, otherwise
// upserts for a second symbol of the same context will fail with E11000.
SessionSchema.index(
  { strategyName: 1, exchangeName: 1, frameName: 1, symbol: 1, backtest: 1 },
  { unique: true }
);

const SessionModel = mongoose.model<SessionDocument>("session-items", SessionSchema);

export { SessionModel, ISessionDto, ISessionRow };
