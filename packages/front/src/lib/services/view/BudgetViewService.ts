import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Budget } from "backtest-kit";
import BudgetMockService, { IBudgetViewContext, TBudgetBalance, TBudgetContext, TBudgetHistoryRow } from "../mock/BudgetMockService";
import { getConfig as getParamsConfig } from "../../../config/params";

/** Record key and name from the request plus the logical time the caller reads at */
const TO_BUDGET_CONTEXT_FN = (context: IBudgetViewContext, when: number): TBudgetContext => ({
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    backtest: context.backtest,
    name: context.name,
    when: new Date(when),
});

export class BudgetViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly budgetMockService = inject<BudgetMockService>(TYPES.budgetMockService);

    public getBalance = async (context: IBudgetViewContext, when: number): Promise<TBudgetBalance> => {
        this.loggerService.log("budgetViewService getBalance", {
            context,
            when,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.budgetMockService.getBalance(context, when);
        }
        if (!Budget.enable.hasValue()) {
            throw new Error("BudgetViewService getBalance budget not enabled");
        }
        return await Budget._getBalance(TO_BUDGET_CONTEXT_FN(context, when));
    }

    public getHistory = async (context: IBudgetViewContext, when: number): Promise<TBudgetHistoryRow[]> => {
        this.loggerService.log("budgetViewService getHistory", {
            context,
            when,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.budgetMockService.getHistory(context, when);
        }
        if (!Budget.enable.hasValue()) {
            throw new Error("BudgetViewService getHistory budget not enabled");
        }
        return await Budget._getHistory(TO_BUDGET_CONTEXT_FN(context, when));
    }
}

export default BudgetViewService;
