import { IPublicSignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { maxDrawdownSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const MAX_DRAWDOWN_REPORT_METHOD_NAME_SUBSCRIBE = "MaxDrawdownReportService.subscribe";
const MAX_DRAWDOWN_REPORT_METHOD_NAME_UNSUBSCRIBE = "MaxDrawdownReportService.unsubscribe";
const MAX_DRAWDOWN_REPORT_METHOD_NAME_TICK = "MaxDrawdownReportService.tick";

/**
 * Service for logging max drawdown events to the JSONL report database.
 *
 * Listens to maxDrawdownSubject and writes each new drawdown record to
 * ReportWriter.writeData() for persistence and analytics.
 */
export class MaxDrawdownReportService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Handles a single `MaxDrawdownContract` event emitted by `maxDrawdownSubject`.
   *
   * Writes a JSONL record to the `"max_drawdown"` report database via
   * `ReportWriter.writeData`, capturing the full signal snapshot at the moment
   * the new drawdown record was set:
   * - `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
   * - `signalId`, `position`, `currentPrice`
   * - `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)
   *
   * `strategyName` and signal-level fields are sourced from `data.signal`
   * rather than the contract root.
   *
   * @param data - `MaxDrawdownContract` payload containing `symbol`,
   *   `signal`, `currentPrice`, `backtest`, `timestamp`, `exchangeName`,
   *   `frameName`
   */
  private tick = async (data: {
    symbol: string;
    signal: IPublicSignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_TICK, { data });

    await ReportWriter.writeData("max_drawdown", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.signal.id,
      position: data.signal.position,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
    }, {
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal.id,
      walkerName: "",
    });
  };

  /**
   * Subscribes to `maxDrawdownSubject` to start persisting drawdown records.
   * Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state and
   * detaches from `maxDrawdownSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = maxDrawdownSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  /**
   * Detaches from `maxDrawdownSubject`, stopping further JSONL writes.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   */
  public unsubscribe = async () => {
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default MaxDrawdownReportService;
