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

interface IBudgetRow extends IBudgetDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IBudgetDto, IBudgetRow };
