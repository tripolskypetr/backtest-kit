import { addActionSchema } from "backtest-kit";
import ActionName from "../../enum/ActionName.mjs";
import { BacktestLowerStopOnBreakevenAction } from "../../classes/BacktestLowerStopOnBreakevenAction.mjs";

addActionSchema({
  actionName: ActionName.BacktestLowerStopOnBreakevenAction,
  handler: BacktestLowerStopOnBreakevenAction,
  note: "Lower trailing-stop by 3 points when breakeven is reached",
});
