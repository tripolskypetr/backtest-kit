/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Result of reduce operation over timeframes.
 */
export interface IReduceResult<T> {
  /** Trading pair symbol */
  symbol: string;
  /** Final accumulated value */
  accumulator: T;
  /** Total number of ticks processed */
  totalTicks: number;
}

/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Callback for reduce operation.
 */
export type ReduceCallback<T> = (
  accumulator: T,
  index: number,
  when: Date,
  symbol: string
) => T | Promise<T>;

/**
 * @deprecated Use backtestLogicPublicService.run() instead.
 * Reduces timeframes to accumulated value.
 *
 * Legacy API - replaced by async generator approach for better
 * memory efficiency and streaming support.
 *
 * @param symbol - Trading pair symbol
 * @param timeframes - Array of timestamps to iterate
 * @param callback - Reducer callback
 * @param initialValue - Initial accumulator value
 * @returns Reduce result with final accumulator
 */
export async function reduce<T>(
  symbol: string,
  timeframes: Date[],
  callback: ReduceCallback<T>,
  initialValue: T
): Promise<IReduceResult<T>> {
  let accumulator = initialValue;

  for (let i = 0; i < timeframes.length; i++) {
    const when = timeframes[i];
    accumulator = await callback(accumulator, i, when, symbol);
  }

  return {
    symbol,
    accumulator,
    totalTicks: timeframes.length,
  };
}

export default reduce;
