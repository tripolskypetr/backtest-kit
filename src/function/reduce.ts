import backtest from "../lib/index";
import { IStrategyTickResult } from "../interfaces/Strategy.interface";

export interface IReduceBacktestResult<T> {
  symbol: string;
  results: IStrategyTickResult[];
  accumulator: T;
  totalTicks: number;
}

export type ReduceCallback<T> = (
  accumulator: T,
  currentResult: IStrategyTickResult,
  index: number,
  symbol: string,
  when: Date
) => T | Promise<T>;

export const reduceBacktest = async <T>(
  symbol: string,
  timeframes: Date[],
  callback: ReduceCallback<T>,
  initialValue?: T
): Promise<IReduceBacktestResult<T>> => {
  const results: IStrategyTickResult[] = [];
  let accumulator = initialValue || null;

  for (let i = 0; i < timeframes.length; i++) {
    const when = timeframes[i];

    const result = await backtest.strategyPublicService.tick(
      symbol,
      when,
      true
    );

    results.push(result);

    accumulator = await callback(accumulator, result, i, symbol, when);
  }

  return {
    symbol,
    results,
    accumulator,
    totalTicks: timeframes.length,
  };
};

export default reduceBacktest;
