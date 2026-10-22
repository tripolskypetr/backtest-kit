import mongoose, { Document, Schema } from "mongoose";
import { BudgetData } from "backtest-kit";

interface IBudgetDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  name: string;
  payload: BudgetData;
  when: number;
}

interface BudgetDocument extends IBudgetDto, Document {}

interface IBudgetRow extends IBudgetDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const BudgetSchema: Schema<BudgetDocument> = new Schema(
  {
    strategyName: { type: String, required: true, index: true },
    exchangeName: { type: String, required: true, index: true },
    frameName: { type: String, required: true, index: true },
    backtest: { type: Boolean, required: true, index: true },
    name: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

BudgetSchema.index({ strategyName: 1, exchangeName: 1, frameName: 1, backtest: 1, name: 1 }, { unique: true });

const BudgetModel = mongoose.model<BudgetDocument>("budget-items", BudgetSchema);

export { BudgetModel, IBudgetDto, IBudgetRow };
