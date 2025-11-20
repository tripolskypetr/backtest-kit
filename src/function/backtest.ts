import backtest from "../lib/index";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";
import Table from "cli-table3";

/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Result of runBacktest operation.
 */
export interface IBacktestResult {
  /** Trading pair symbol */
  symbol: string;
  /** Array of closed tick results */
  results: IStrategyTickResult[];
}

/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Runs backtest by iterating through timeframes and collecting closed results.
 *
 * Legacy API - replaced by async generator approach for better
 * memory efficiency and streaming support.
 *
 * @param symbol - Trading pair symbol
 * @param timeframes - Array of timestamps to iterate
 * @returns Promise resolving to backtest result with all closed signals
 */
export async function runBacktest(
  symbol: string,
  timeframes: Date[]
): Promise<IBacktestResult> {
  const results: IStrategyTickResult[] = [];

  for (const when of timeframes) {
    const result = await backtest.strategyGlobalService.tick(
      symbol,
      when,
      true
    );

    // Сохраняем только результаты closed
    if (result.action === "closed") {
      results.push(result);
    }
  }

  return {
    symbol,
    results,
  };
}

/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Runs backtest and displays results in formatted terminal table.
 *
 * Shows trade-by-trade results with PNL, close reasons, and summary statistics
 * including win rate and total PNL.
 *
 * Legacy API - replaced by async generator approach.
 *
 * @param symbol - Trading pair symbol
 * @param timeframes - Array of timestamps to iterate
 */
export async function runBacktestGUI(
  symbol: string,
  timeframes: Date[]
) {
  const backtestResult = await runBacktest(symbol, timeframes);
  const { results } = backtestResult;

  // Таблица для терминала
  const table = new Table({
    head: ["#", "Time", "Note", "Price", "Reason", "PNL %"],
  });

  let totalPnl = 0;
  let winCount = 0;
  let lossCount = 0;

  results.forEach((result, index) => {
    if (result.action === "closed") {
      const pnl = result.pnl.pnlPercentage;
      totalPnl += pnl;

      if (pnl > 0) winCount++;
      else if (pnl < 0) lossCount++;

      const pnlFormatted =
        pnl > 0 ? `+${pnl.toFixed(2)}%` : `${pnl.toFixed(2)}%`;
      const emoji = pnl > 0 ? "🟢" : pnl < 0 ? "🔴" : "⚪";

      table.push([
        index + 1,
        new Date(result.signal.timestamp).toISOString(),
        result.signal.note,
        result.currentPrice.toFixed(2),
        result.closeReason,
        `${emoji} ${pnlFormatted}`,
      ]);
    }
  });

  // Добавляем статистику
  const closedCount = results.length;
  table.push([]);
  table.push([
    "TOTAL",
    `${closedCount} trades`,
    `Win: ${winCount}`,
    `Loss: ${lossCount}`,
    "-",
    `WR: ${closedCount > 0 ? ((winCount / closedCount) * 100).toFixed(1) : 0}%`,
    `${totalPnl > 0 ? "+" : ""}${totalPnl.toFixed(2)}%`,
  ]);

  console.log("\n");
  console.log(table.toString());
  console.log("\n");

};

export default { runBacktest, runBacktestGUI };
