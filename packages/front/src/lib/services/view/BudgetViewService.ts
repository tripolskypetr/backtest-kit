import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Budget, BudgetMissingError } from "backtest-kit";
import BudgetMockService, { IBudgetViewContext, TBudgetBalance, TBudgetContext, TBudgetHistoryRow } from "../mock/BudgetMockService";
import { getConfig as getParamsConfig } from "../../../config/params";

/** Record key from the request, the budget name from the strategy, the logical time the caller reads at */
const TO_BUDGET_CONTEXT_FN = (context: IBudgetViewContext, name: string, when: number): TBudgetContext => ({
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    backtest: context.backtest,
    name,
    when: new Date(when),
});

/** The budget the dashboard shows: the first one the strategy constructed, null when the strategy declared none */
const GET_BUDGET_NAME_FN = (method: string): string | null => {
    if (!Budget.enable.hasValue()) {
        console.warn(`@backtest-kit/ui budgetViewService ${method} budget not enabled`);
        return null;
    }
    const [name] = Budget._getNames();
    if (!name) {
        console.warn(`@backtest-kit/ui budgetViewService ${method} no budget constructed`);
        return null;
    }
    return name;
};

export class BudgetViewService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly budgetMockService = inject<BudgetMockService>(TYPES.budgetMockService);

    public getBalance = async (context: IBudgetViewContext, when: number): Promise<TBudgetBalance | null> => {
        this.loggerService.log("budgetViewService getBalance", {
            context,
            when,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.budgetMockService.getBalance(context, when);
        }
        const name = GET_BUDGET_NAME_FN("getBalance");
        if (!name) {
            return null;
        }
        try {
            return await Budget._getBalance(TO_BUDGET_CONTEXT_FN(context, name, when));
        } catch (error) {
            // the strategy constructed the budget but nothing touched the record yet: no journal to show
            if (BudgetMissingError.isBudgetMissingError(error as object)) {
                return null;
            }
            throw error;
        }
    }

    public getHistory = async (context: IBudgetViewContext, when: number): Promise<TBudgetHistoryRow[]> => {
        this.loggerService.log("budgetViewService getHistory", {
            context,
            when,
        })
        if (getParamsConfig().CC_ENABLE_MOCK) {
            return await this.budgetMockService.getHistory(context, when);
        }
        const name = GET_BUDGET_NAME_FN("getHistory");
        if (!name) {
            return [];
        }
        try {
            return await Budget._getHistory(TO_BUDGET_CONTEXT_FN(context, name, when));
        } catch (error) {
            if (BudgetMissingError.isBudgetMissingError(error as object)) {
                return [];
            }
            throw error;
        }
    }
}

export default BudgetViewService;
