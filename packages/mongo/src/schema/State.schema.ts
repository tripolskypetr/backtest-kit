import mongoose, { Document, Schema } from "mongoose";
import { StateData } from "tradeforge";

interface IStateDto {
  signalId: string;
  bucketName: string;
  payload: StateData;
  when: number;
}

interface StateDocument extends IStateDto, Document {}

interface IStateRow extends IStateDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const StateSchema: Schema<StateDocument> = new Schema(
  {
    signalId: { type: String, required: true, index: true },
    bucketName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

StateSchema.index({ signalId: 1, bucketName: 1 }, { unique: true });

const StateModel = mongoose.model<StateDocument>("state-items", StateSchema);

export { StateModel, IStateDto, IStateRow };
