import { EntitySchema } from "typeorm";
import { BudgetData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IBudgetDto {
  strategyName: string;
  exchangeName: string;
  frameName: string;
  backtest: boolean;
  name: string;
  payload: BudgetData;
  when: number;
}

interface IBudgetRow extends IBudgetDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const BudgetModel = new EntitySchema<IBudgetRow>({
  name: "budget-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    strategyName: { type: String },
    exchangeName: { type: String },
    frameName: { type: String },
    backtest: { type: "boolean" },
    name: { type: String },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "budget_items_uq",
      columns: ["strategyName", "exchangeName", "frameName", "backtest", "name"],
      unique: true,
    },
  ],
});

export { BudgetModel, IBudgetDto, IBudgetRow };
