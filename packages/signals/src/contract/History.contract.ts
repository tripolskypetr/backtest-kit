import { IBaseMessage, IOutlineHistory } from "agent-swarm-kit";

/**
 * Type representing the history container for technical analysis reports.
 *
 * Defines the contract for accumulating and organizing market analysis data
 * for consumption by LLM-based trading strategies. Supports both message array
 * format and outline history format from agent-swarm-kit.
 *
 * @example
 * ```typescript
 * import { commitHistorySetup } from '@backtest-kit/signals';
 *
 * // Using as message array
 * const messages: IBaseMessage[] = [];
 * await commitHistorySetup('BTCUSDT', messages);
 * // messages now contains all technical analysis reports
 *
 * // Using with outline history
 * const outline: IOutlineHistory = createOutline();
 * await commitMicroTermMath('BTCUSDT', outline);
 * ```
 */
export type HistoryContract = IBaseMessage[] | IOutlineHistory;

export default HistoryContract;
