import { memoize } from "functools-kit";
import { signalNotifySubject } from "../../../config/emitters";
import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategySchemaService } from "../schema/StrategySchemaService";
import { TYPES } from "../../../lib/core/types";
import { RiskValidationService } from "../validation/RiskValidationService";
import { StrategyValidationService } from "../validation/StrategyValidationService";
import { ExchangeValidationService } from "../validation/ExchangeValidationService";
import { FrameValidationService } from "../validation/FrameValidationService";
import { ActionValidationService } from "../validation/ActionValidationService";
import { StrategyCoreService } from "../core/StrategyCoreService";
import TimeMetaService from "../meta/TimeMetaService";

const METHOD_NAME_COMMIT_SIGNAL_NOTIFY =
  "notificationHelperService.commitSignalNotify";
const METHOD_NAME_VALIDATE = "notificationHelperService.validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "strategyName:exchangeName:frameName"
 * @param context - Execution context with strategyName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: {
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  frameName: FrameName;
}): string => {
  const parts = [context.strategyName, context.exchangeName];
  if (context.frameName) parts.push(context.frameName);
  return parts.join(":");
};

/**
 * Optional payload for signal info notifications.
 * Both fields are optional — omitting notificationNote falls back to the signal's own note.
 */
export type SignalNotificationPayload = {
  /** Optional user-defined identifier for correlating the notification with external systems (e.g. Telegram message ID) */
  notificationId: string;
  /** Human-readable note to attach to the notification. Falls back to signal.note if omitted. */
  notificationNote: string;
};

/**
 * Helper service for emitting signal info notifications.
 *
 * Handles validation (memoized per context) and emission of `signal.info` events
 * via `signalNotifySubject`. Used internally by the framework action pipeline —
 * end users interact with this via `commitSignalNotify()` in `onActivePing` callbacks.
 */
export class NotificationHelperService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService,
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService,
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService,
  );
  private readonly actionValidationService = inject<ActionValidationService>(
    TYPES.actionValidationService,
  );
  private readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService,
  );

  private readonly timeMetaService = inject<TimeMetaService>(
    TYPES.timeMetaService,
  );

  /**
   * Validates strategy, exchange, frame, risk, and action schemas for the given context.
   *
   * Memoized per unique `"strategyName:exchangeName[:frameName]"` key — subsequent calls
   * with the same context are no-ops, so validation runs at most once per context.
   *
   * @param context - Routing context: strategyName, exchangeName, frameName
   * @throws {Error} If any registered schema fails validation
   */
  public validate = memoize(
    ([context]) => CREATE_KEY_FN(context),
    async (context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
      });
      this.strategyValidationService.validate(
        context.strategyName,
        METHOD_NAME_VALIDATE,
      );
      this.exchangeValidationService.validate(
        context.exchangeName,
        METHOD_NAME_VALIDATE,
      );
      const { riskName, riskList, actions } = this.strategySchemaService.get(
        context.strategyName,
      );
      context.frameName &&
        this.frameValidationService.validate(
          context.frameName,
          METHOD_NAME_VALIDATE,
        );
      riskName &&
        this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE);
      riskList &&
        riskList.forEach((riskName) =>
          this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE),
        );
      actions &&
        actions.forEach((actionName) =>
          this.actionValidationService.validate(
            actionName,
            METHOD_NAME_VALIDATE,
          ),
        );
    },
  );

  /**
   * Emits a `signal.info` notification for the currently active pending signal.
   *
   * Validates all schemas (via memoized `validate`), resolves the pending signal
   * for the given symbol, then emits a `SignalInfoContract` via `signalNotifySubject`,
   * which is routed to all registered `listenSignalNotify` callbacks and persisted
   * by `NotificationAdapter`.
   *
   * @param payload - Optional notification fields (notificationId, notificationNote)
   * @param symbol - Trading pair symbol (e.g. "BTCUSDT")
   * @param currentPrice - Market price at the time of the call
   * @param context - Routing context: strategyName, exchangeName, frameName
   * @param backtest - true when called during a backtest run
   *
   * @throws {Error} If no active pending signal is found for the given symbol
   *
   * @example
   * ```typescript
   * // Inside onActivePing callback:
   * await commitSignalNotify("BTCUSDT", {
   *   notificationNote: "RSI crossed 70, consider closing",
   *   notificationId: "msg-123",
   * });
   * ```
   */
  public commitSignalNotify = async (
    payload: Partial<SignalNotificationPayload>,
    symbol: string,
    currentPrice: number,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest: boolean,
  ) => {
    this.loggerService.info(METHOD_NAME_COMMIT_SIGNAL_NOTIFY, {
      symbol,
      context,
      backtest,
      currentPrice,
    });
    this.validate(context);

    const pendingSignal = await this.strategyCoreService.getPendingSignal(
      backtest,
      symbol,
      currentPrice,
      {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: "",
      },
    );
    if (!pendingSignal) {
      throw new Error(
        `SignalUtils notify No pending signal found symbol=${symbol} `,
      );
    }
    const timestamp = await this.timeMetaService.getTimestamp(
      symbol,
      {
        strategyName: context.strategyName,
        exchangeName: context.exchangeName,
        frameName: context.frameName,
      },
      backtest,
    );
    await signalNotifySubject.next({
      backtest,
      symbol,
      currentPrice,
      data: pendingSignal,
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: context.frameName,
      note: payload.notificationNote || pendingSignal.note,
      notificationId: payload.notificationId,
      timestamp,
    });
  };
}

export default NotificationHelperService;
