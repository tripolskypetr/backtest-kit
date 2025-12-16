import { WalkerName, WalkerMetric } from "../interfaces/Walker.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { BacktestStatisticsModel } from "../model/BacktestStatistics.model";

/**
 * Contract for walker completion events.
 *
 * Emitted when all strategies have been tested and final results are available.
 * Contains complete results of the walker comparison including the best strategy.
 *
 * @example
 * ```typescript
 * import { walkerCompleteSubject } from "backtest-kit";
 *
 * walkerCompleteSubject
 *   .filter((event) => event.symbol === "BTCUSDT")
 *   .connect((event) => {
 *     console.log("Walker completed:", event.walkerName);
 *     console.log("Best strategy:", event.bestStrategy);
 *     console.log("Best metric:", event.bestMetric);
 *   });
 * ```
 */
export interface WalkerCompleteContract {
    /** walkerName - Walker name */
    walkerName: WalkerName;

    /** symbol - Symbol tested */
    symbol: string;

    /** exchangeName - Exchange used */
    exchangeName: ExchangeName;

    /** frameName - Frame used */
    frameName: FrameName;

    /** metric - Metric used for optimization */
    metric: WalkerMetric;

    /** totalStrategies - Total number of strategies tested */
    totalStrategies: number;

    /** bestStrategy - Best performing strategy name */
    bestStrategy: StrategyName | null;

    /** bestMetric - Best metric value achieved */
    bestMetric: number | null;

    /** bestStats - Best strategy statistics */
    bestStats: BacktestStatisticsModel | null;
}

export default WalkerCompleteContract;
