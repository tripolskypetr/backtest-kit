import ioc from "../../../../lib";
import { ttl } from "../../../../utils/ttl";
import {
    BudgetMode,
    IBalanceAsset,
    IBalanceKpi,
    IBalanceMeasure,
    IBalancePoint,
    IBudgetViewContext,
    TBudgetBalance,
    TBudgetHistoryRow,
} from "../../../../model/Budget.model";

const CACHE_TTL = 45_000;

// ── Runtime ───────────────────────────────────────────────────────────────────

/**
 * Record key and logical time of the budget read, both from the running
 * strategy: `getRuntimeInfo` carries the context (strategy / exchange / frame),
 * the mode and `when` of the current tick. The page never invents a time.
 */
export const fetchBudgetScope = ttl(
    async (): Promise<{ context: IBudgetViewContext; when: number; mode: BudgetMode }> => {
        const runtime = await ioc.runtimeViewService.getRuntimeInfo();
        return {
            context: {
                strategyName: runtime.context.strategyName,
                exchangeName: runtime.context.exchangeName,
                frameName: runtime.context.frameName,
                backtest: runtime.backtest,
            },
            when: new Date(runtime.when).getTime(),
            mode: runtime.backtest ? "backtest" : "live",
        };
    },
    {
        timeout: CACHE_TTL,
    },
);

// ── Journal ───────────────────────────────────────────────────────────────────

export const fetchBudgetBalance = ttl(
    async (): Promise<TBudgetBalance> => {
        const { context, when } = await fetchBudgetScope();
        return await ioc.budgetViewService.getBalance(context, when);
    },
    {
        timeout: CACHE_TTL,
    },
);

export const fetchBudgetHistory = ttl(
    async (): Promise<TBudgetHistoryRow[]> => {
        const { context, when } = await fetchBudgetScope();
        return await ioc.budgetViewService.getHistory(context, when);
    },
    {
        timeout: CACHE_TTL,
    },
);

/** Clear cache before a forced refresh */
export const clearBudgetCache = () => {
    fetchBudgetScope.clear();
    fetchBudgetBalance.clear();
    fetchBudgetHistory.clear();
};

// ── Measures ──────────────────────────────────────────────────────────────────

/** Initial capital of the record: the balance before the first row, or the current capital when the journal is empty */
const getInitialCapital = (balance: TBudgetBalance, history: TBudgetHistoryRow[]): number => {
    const first = history[0];
    if (!first) {
        return balance.capital;
    }
    if (first.type === "release") {
        return first.balance.capital - first.pnl;
    }
    return first.balance.capital;
};

export const fetchBalanceKpiMeasure = async (): Promise<IBalanceKpi> => {
    const balance = await fetchBudgetBalance();
    const history = await fetchBudgetHistory();
    const overdrafts = history.filter(
        (row): row is Extract<TBudgetHistoryRow, { type: "reserve" }> =>
            row.type === "reserve" && row.overdraft !== undefined,
    );
    return {
        capital: balance.capital,
        deployed: balance.deployed,
        free: balance.free,
        realized: balance.capital - getInitialCapital(balance, history),
        rejectCount: history.filter((row) => row.type === "reject").length,
        overdraftCount: overdrafts.length,
        overdraftTotal: overdrafts.reduce((acc, row) => acc + (row.overdraft ?? 0), 0),
        actionCount: history.length,
    };
};

/**
 * One point per timestamp: the balance after the last row at that time, so a
 * chart with strictly ascending times shows what every reader at `timestamp`
 * would see.
 */
export const fetchBalanceCurveMeasure = async (): Promise<IBalancePoint[]> => {
    const history = await fetchBudgetHistory();
    const map = new Map<number, IBalancePoint>();
    for (const row of history) {
        map.set(row.timestamp, {
            timestamp: row.timestamp,
            capital: row.balance.capital,
            gross: row.balance.capital + row.balance.deployed,
            free: row.balance.free,
        });
    }
    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
};

export const fetchBalanceAssetsMeasure = async (): Promise<IBalanceAsset[]> => {
    const balance = await fetchBudgetBalance();
    return Object.keys(balance.assets)
        .map((asset) => ({ asset, amount: balance.assets[asset] }))
        .sort((a, b) => a.asset.localeCompare(b.asset));
};

// ── Page ──────────────────────────────────────────────────────────────────────

export const fetchBalanceMeasure = async (): Promise<IBalanceMeasure> => {
    const { when, mode } = await fetchBudgetScope();
    const [balance, history, kpi, curve, assets] = await Promise.all([
        fetchBudgetBalance(),
        fetchBudgetHistory(),
        fetchBalanceKpiMeasure(),
        fetchBalanceCurveMeasure(),
        fetchBalanceAssetsMeasure(),
    ]);
    return {
        mode,
        name: balance.name,
        when,
        balance,
        history,
        kpi,
        curve,
        assets,
    };
};
