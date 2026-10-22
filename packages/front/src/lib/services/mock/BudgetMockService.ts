import fs from "fs/promises";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { Budget } from "backtest-kit";

const MOCK_BUDGET_PATH = "./mock/budget.json";

/** Context of the budget statics: record key, name and the logical time of the read */
export type TBudgetContext = Parameters<typeof Budget._getBalance>[0];

/** Balance of a budget as of a logical time */
export type TBudgetBalance = Awaited<ReturnType<typeof Budget._getBalance>>;

/** One journal row of a budget */
export type TBudgetHistoryRow = Awaited<ReturnType<typeof Budget._getHistory>>[number];

/** Record key of a budget journal as the dashboard sends it: a strategy run (the budget name is resolved on the backend) */
export type IBudgetViewContext = Pick<TBudgetContext, "strategyName" | "exchangeName" | "frameName" | "backtest">;

/** Mock layout: one record per mode, the journal already folded with balances after every row */
interface IBudgetMock {
    backtest: { balance: TBudgetBalance; history: TBudgetHistoryRow[] };
    live: { balance: TBudgetBalance; history: TBudgetHistoryRow[] };
}

const READ_BUDGET_FN = singleshot(
    async (): Promise<IBudgetMock> => {
        const data = await fs.readFile(MOCK_BUDGET_PATH, "utf-8");
        return JSON.parse(data);
    },
);

export class BudgetMockService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public getBalance = async (context: IBudgetViewContext, when: number): Promise<TBudgetBalance> => {
        this.loggerService.log("budgetMockService getBalance", {
            context,
            when,
        })
        const mock = await READ_BUDGET_FN();
        const record = context.backtest ? mock.backtest : mock.live;
        const history = record.history.filter((row) => row.timestamp <= when);
        const last = history[history.length - 1];
        if (!last) {
            return {
                name: record.balance.name,
                when: new Date(when),
                capital: record.balance.capital,
                deployed: 0,
                free: record.balance.capital,
                assets: {},
            };
        }
        return {
            name: record.balance.name,
            when: new Date(when),
            ...last.balance,
        };
    }

    public getHistory = async (context: IBudgetViewContext, when: number): Promise<TBudgetHistoryRow[]> => {
        this.loggerService.log("budgetMockService getHistory", {
            context,
            when,
        })
        const mock = await READ_BUDGET_FN();
        const record = context.backtest ? mock.backtest : mock.live;
        return record.history.filter((row) => row.timestamp <= when);
    }
}

export default BudgetMockService;
