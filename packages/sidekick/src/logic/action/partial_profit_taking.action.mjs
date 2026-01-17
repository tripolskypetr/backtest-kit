import { addActionSchema } from "backtest-kit";
import ActionName from "../../enum/ActionName.mjs";
import { PartialProfitTakingAction } from "../../classes/PartialProfitTakingAction.mjs";

addActionSchema({
  actionName: ActionName.PartialProfitTakingAction,
  handler: PartialProfitTakingAction,
});
