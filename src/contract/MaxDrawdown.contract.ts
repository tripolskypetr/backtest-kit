import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IPublicSignalRow, StrategyName } from "../interfaces/Strategy.interface";

export interface MaxDrawdownContract {
    /** Trading symbol (e.g. "BTC/USDT") */
    symbol: string;
    /** Current price at the time of the max drawdown update */
    currentPrice: number;
    /** Timestamp of the max drawdown update (milliseconds since epoch) */
    timestamp: number;
    /** Strategy name for context */
    strategyName: StrategyName;
    /** Exchange name for context */
    exchangeName: ExchangeName;
    /** Frame name for context (e.g. "1m", "5m") */
    frameName: FrameName;
    /** Public signal data for the position associated with this max drawdown update */
    signal: IPublicSignalRow;
    /** Indicates if the update is from a backtest or live trading (true for backtest, false for live) */
    backtest: boolean;
}
