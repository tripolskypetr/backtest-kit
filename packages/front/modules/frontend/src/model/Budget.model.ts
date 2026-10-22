import type { Budget } from "backtest-kit";

/** Context of the budget statics as the backend expects it: record key, name and the logical read time */
export type TBudgetContext = Parameters<typeof Budget._getBalance>[0];

/** Record key of a budget journal: a strategy run (the budget name is resolved on the backend) */
export type IBudgetViewContext = Pick<TBudgetContext, "strategyName" | "exchangeName" | "frameName" | "backtest">;

/** Balance of a budget as of a logical time (`when` arrives as an ISO string over the wire) */
export type TBudgetBalance = Omit<Awaited<ReturnType<typeof Budget._getBalance>>, "when"> & { when: string };

/** One journal row of a budget */
export type TBudgetHistoryRow = Awaited<ReturnType<typeof Budget._getHistory>>[number];

export type BudgetMode = "live" | "backtest";

/** KPI block of the Balance page */
export interface IBalanceKpi {
    capital: number;
    deployed: number;
    free: number;
    /** Realized pnl booked on capital: capital − initial capital */
    realized: number;
    rejectCount: number;
    overdraftCount: number;
    /** Sum of `overdraft` over the reserve rows that carry one */
    overdraftTotal: number;
    /** Rows in the journal as of `when` */
    actionCount: number;
}

/** Point of the capital curve: balance after the last row at this timestamp */
export interface IBalancePoint {
    timestamp: number;
    capital: number;
    /** capital + deployed: what the budget would be worth with every reserve returned at cost */
    gross: number;
    free: number;
}

/** Units of one asset held by the budget */
export interface IBalanceAsset {
    asset: string;
    amount: number;
}

/** Handler of `balance_fields` */
export interface IBalanceMeasure {
    mode: BudgetMode;
    name: string;
    /** Logical time of the read (runtime `when`) */
    when: number;
    balance: TBudgetBalance;
    history: TBudgetHistoryRow[];
    kpi: IBalanceKpi;
    curve: IBalancePoint[];
    assets: IBalanceAsset[];
}

export default IBalanceMeasure;
