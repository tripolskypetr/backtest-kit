import mongoose, { Document, Schema } from "mongoose";
import { RiskData } from "tradeforge";

interface IRiskDto {
  riskName: string;
  exchangeName: string;
  positions: RiskData;
  when: number;
}

interface RiskDocument extends IRiskDto, Document {}

interface IRiskRow extends IRiskDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const RiskSchema: Schema<RiskDocument> = new Schema(
  {
    riskName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    positions: { type: Schema.Types.Mixed, required: true, default: [] },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

RiskSchema.index({ riskName: 1, exchangeName: 1 }, { unique: true });

const RiskModel = mongoose.model<RiskDocument>("risk-items", RiskSchema);

export { RiskModel, IRiskDto, IRiskRow };
