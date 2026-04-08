import { IPublicSignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { highestProfitSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE = "HighestProfitReportService.subscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE = "HighestProfitReportService.unsubscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK = "HighestProfitReportService.tick";

/**
 * Service for logging highest profit events to the JSONL report database.
 *
 * Listens to highestProfitSubject and writes each new price record to
 * ReportWriter.writeData() for persistence and analytics.
 */
export class HighestProfitReportService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Handles a single `HighestProfitContract` event emitted by `highestProfitSubject`.
   *
   * Writes a JSONL record to the `"highest_profit"` report database via
   * `ReportWriter.writeData`, capturing the full signal snapshot at the moment
   * the new profit record was set:
   * - `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
   * - `signalId`, `position`, `currentPrice`
   * - `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)
   *
   * `strategyName` and signal-level fields are sourced from `data.signal`
   * rather than the contract root.
   *
   * @param data - `HighestProfitContract` payload containing `symbol`,
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
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK, { data });

    await ReportWriter.writeData("highest_profit", {
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
   * Subscribes to `highestProfitSubject` to start persisting profit records.
   * Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state and
   * detaches from `highestProfitSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription
   *
   * @example
   * ```typescript
   * const service = new HighestProfitReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = highestProfitSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  /**
   * Detaches from `highestProfitSubject`, stopping further JSONL writes.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HighestProfitReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default HighestProfitReportService;
