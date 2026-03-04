import { IStorageSignalRow } from "backtest-kit";
import ITradePerfomance from "../../../model/TradePerfomance.model";
import ISuccessRate from "../../../model/SuccessRate.model";
import IDailyTrades from "../../../model/DailyTrades.model";
import IRevenueCount from "../../../model/RevenueCount.model";
import ioc from "../../../lib";
import { dayjs, getMomentStamp, ttl } from "react-declarative";

type Mode = "live" | "backtest";
type ClosedSignal = Extract<IStorageSignalRow, { status: "closed" }>;

const CACHE_TTL = 45_000;

export const fetchSignals = ttl(
    async (mode: Mode): Promise<IStorageSignalRow[]> => {
        return mode === "live"
            ? await ioc.storageViewService.listSignalLive()
            : await ioc.storageViewService.listSignalBacktest();
    },
    {
        key: ([mode]) => `${mode}`,
        timeout: CACHE_TTL,
    },
);

/** Clear cache before a forced refresh */
export const clearSignalCache = () => fetchSignals.clear();

// ── Symbols ───────────────────────────────────────────────────────────────────

export const fetchSymbolList = (): Promise<string[]> =>
    ioc.symbolGlobalService.getSymbolList();

export const fetchSymbolMap = (): Promise<Record<string, any>> =>
    ioc.symbolGlobalService.getSymbolMap();

// ── Helpers ───────────────────────────────────────────────────────────────────

const getClosedBySymbol = async (
    symbol: string,
    mode: Mode,
): Promise<ClosedSignal[]> => {
    const all = await fetchSignals(mode);
    return all.filter(
        (s): s is ClosedSignal => s.status === "closed" && s.symbol === symbol,
    );
};

// ── Metrics ───────────────────────────────────────────────────────────────────

export const fetchTradePerfomanceMeasure = async (
    symbol: string,
    mode: Mode,
): Promise<ITradePerfomance> => {
    const closed = await getClosedBySymbol(symbol, mode);
    return {
        total: closed.length,
        resolvedCount: closed.filter((s) => s.pnl.pnlPercentage > 0).length,
        rejectedCount: closed.filter((s) => s.pnl.pnlPercentage <= 0).length,
    };
};

export const fetchSuccessRateMeasure = async (
    symbol: string,
    mode: Mode,
): Promise<ISuccessRate> => {
    const closed = await getClosedBySymbol(symbol, mode);

    // 0.5% tolerance for slippage and fees when comparing against TP/SL
    const TOLERANCE = 0.005;

    const isAtTP = (s: ClosedSignal): boolean =>
        Math.abs(s.pnl.priceClose - s.priceTakeProfit) /
            s.priceTakeProfit <
        TOLERANCE;

    const isAtSL = (s: ClosedSignal): boolean =>
        Math.abs(s.pnl.priceClose - s.priceStopLoss) /
            s.priceStopLoss <
        TOLERANCE;

    return {
        resolvedTakeProfitCount: closed.filter(
            (s) => s.pnl.pnlPercentage > 0 && isAtTP(s),
        ).length,
        rejectedStopLossCount: closed.filter(
            (s) => s.pnl.pnlPercentage <= 0 && isAtSL(s),
        ).length,
        resolvedCloseCount: closed.filter(
            (s) => s.pnl.pnlPercentage > 0 && !isAtTP(s),
        ).length,
        rejectedCloseCount: closed.filter(
            (s) => s.pnl.pnlPercentage <= 0 && !isAtSL(s),
        ).length,
    };
};

export const fetchDailyTradesMeasure = async (
    symbol: string,
    mode: Mode,
): Promise<IDailyTrades[]> => {
    const closed = await getClosedBySymbol(symbol, mode);

    const map = new Map<number, { resolved: number; rejected: number }>();

    for (const s of closed) {
        const stamp = getMomentStamp(dayjs(s.updatedAt));
        const current = map.get(stamp) ?? { resolved: 0, rejected: 0 };
        if (s.pnl.pnlPercentage > 0) {
            map.set(stamp, { ...current, resolved: current.resolved + 1 });
        } else {
            map.set(stamp, { ...current, rejected: current.rejected + 1 });
        }
    }

    return Array.from(map.entries()).map(([stamp, { resolved, rejected }]) => ({
        stamp,
        count: resolved + rejected,
        resolved,
        rejected,
    }));
};

export const fetchRevenueCountMeasure = async (
    symbol: string,
    mode: Mode,
): Promise<IRevenueCount> => {
    const closed = await getClosedBySymbol(symbol, mode);

    // "Today" anchor — start of the day of the most recent signal.
    // For backtests this ensures windows (today/yesterday/7d/31d) are computed
    // relative to the end of the run, not the current wall-clock date.
    const latestUpdatedAt = mode === "backtest"
        ? closed.length ? closed.reduce((acm, cur) => Math.max(acm, cur.updatedAt), 0) : Date.now()
        : Date.now();

    const todayStart = dayjs(latestUpdatedAt).startOf("day").valueOf();
    const yesterdayStart = todayStart - 86400000;
    const sevenDaysStart = todayStart - 7 * 86400000;
    const thirtyOneDaysStart = todayStart - 31 * 86400000;

    const isToday = (s: ClosedSignal) => s.updatedAt >= todayStart;
    const isYesterday = (s: ClosedSignal) =>
        s.updatedAt >= yesterdayStart && s.updatedAt < todayStart;
    const isSevenDays = (s: ClosedSignal) => s.updatedAt >= sevenDaysStart;
    const isThirtyOneDays = (s: ClosedSignal) =>
        s.updatedAt >= thirtyOneDaysStart;

    const sumPnl = (arr: ClosedSignal[]) =>
        arr.reduce((acc, s) => acc + s.pnl.pnlCost, 0);

    const todaySignals = closed.filter(isToday);
    const yesterdaySignals = closed.filter(isYesterday);
    const sevenDaysSignals = closed.filter(isSevenDays);
    const thirtyOneDaysSignals = closed.filter(isThirtyOneDays);

    return {
        symbol,
        todayRevenue: sumPnl(todaySignals),
        yesterdayRevenue: sumPnl(yesterdaySignals),
        sevenDaysRevenue: sumPnl(sevenDaysSignals),
        thirtyOneDaysRevenue: sumPnl(thirtyOneDaysSignals),
        todayCount: todaySignals.length,
        yesterdayCount: yesterdaySignals.length,
        sevenDaysCount: sevenDaysSignals.length,
        thirtyOneDaysCount: thirtyOneDaysSignals.length,
    };
};
