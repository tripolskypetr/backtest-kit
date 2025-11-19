import backtest from "../lib/index";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";

export interface IBacktestResult {
  symbol: string;
  results: IStrategyTickResult[];
  totalTicks: number;
}

export const runBacktest = async (
  symbol: string,
  timeframes: Date[],
): Promise<IBacktestResult> => {
  const results: IStrategyTickResult[] = [];

  for (const when of timeframes) {
    const result = await backtest.strategyPublicService.tick(
      symbol,
      when,
      true
    );
    results.push(result);
  }

  return {
    symbol,
    results,
    totalTicks: timeframes.length,
  };
};

export default runBacktest;
