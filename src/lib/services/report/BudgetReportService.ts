import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { budgetSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { BudgetContract } from "../../../contract/Budget.contract";

const BUDGET_REPORT_METHOD_NAME_SUBSCRIBE = "BudgetReportService.subscribe";
const BUDGET_REPORT_METHOD_NAME_UNSUBSCRIBE = "BudgetReportService.unsubscribe";
const BUDGET_REPORT_METHOD_NAME_TICK = "BudgetReportService.tick";

/**
 * Service for logging budget journal rows to the JSONL report database.
 *
 * Listens to budgetSubject and writes every inserted row (reserve / release /
 * reject / deposit / withdraw) to ReportWriter.writeData("budget") for
 * persistence and analytics (`./dump/report/budget.jsonl`).
 */
export class BudgetReportService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Handles a single `BudgetContract` event emitted by `budgetSubject`.
   *
   * Writes a JSONL record to the `"budget"` report database via
   * `ReportWriter.writeData`: the record key (`strategyName`, `exchangeName`,
   * `frameName`, `backtest`), the budget `name`, the authoring `symbol`, and
   * the journal row fields spread flat (`type`, `timestamp`, `seq`, `id` /
   * `asset`, `amount`, `pnl`, `requested`, `available`, `overdraft`, `note`,
   * `balance` after the row).
   *
   * The search keys use the authoring symbol (empty string when the call had
   * none); `signalId` is empty — a budget record is not bound to a signal.
   *
   * @param data - `BudgetContract` payload
   */
  private tick = async (data: BudgetContract) => {
    this.loggerService.log(BUDGET_REPORT_METHOD_NAME_TICK, { data });

    const { row } = data;

    await ReportWriter.writeData("budget", {
      ...row,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      name: data.name,
      symbol: data.symbol,
      timestamp: data.timestamp,
    }, {
      symbol: data.symbol ?? "",
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: "",
      walkerName: "",
    });
  };

  /**
   * Subscribes to `budgetSubject` to start persisting journal rows.
   * Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state and
   * detaches from `budgetSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription
   *
   * @example
   * ```typescript
   * const service = new BudgetReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(BUDGET_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = budgetSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  /**
   * Detaches from `budgetSubject`, stopping further JSONL writes.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new BudgetReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(BUDGET_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default BudgetReportService;
