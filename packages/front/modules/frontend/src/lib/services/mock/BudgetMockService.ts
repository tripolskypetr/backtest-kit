import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";
import { IBudgetViewContext, TBudgetBalance, TBudgetHistoryRow } from "../../../model/Budget.model";

export class BudgetMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getBalance = async (
    context: IBudgetViewContext,
    when: number,
  ): Promise<TBudgetBalance | null> => {
    this.loggerService.log("budgetMockService getBalance", { context, when });
    const { data, error } = await fetchApi("/api/v1/mock/budget_balance", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        context,
        when,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getHistory = async (
    context: IBudgetViewContext,
    when: number,
  ): Promise<TBudgetHistoryRow[]> => {
    this.loggerService.log("budgetMockService getHistory", { context, when });
    const { data, error } = await fetchApi("/api/v1/mock/budget_history", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        context,
        when,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default BudgetMockService;
