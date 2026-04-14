import { FrameName } from "src/interfaces/Frame.interface";
import { backtest as lib } from "../lib";
import { StrategyName } from "src/interfaces/Strategy.interface";
import { ExchangeName } from "src/interfaces/Exchange.interface";
import { signalNotifySubject } from "src/config/emitters";

const METHOD_NAME_COMMIT_SIGNAL_NOTIFY = "SignalUtils.commitSignalNotify";

/**
 * Optional payload for signal info notifications.
 * Both fields are optional — omitting notificationNote falls back to the signal's own note.
 */
export type SignalNotificationPayload = {
    /** Optional user-defined identifier for correlating the notification with external systems (e.g. Telegram message ID) */
    notificationId: string;
    /** Human-readable note to attach to the notification. Falls back to signal.note if omitted. */
    notificationNote: string;
}

/**
 * Low-level utilities for emitting signal info notifications.
 *
 * Consumed internally by the framework action pipeline.
 * End users interact with this via `commitSignalNotify()` in `onActivePing` callbacks.
 */
export class SignalUtils {

    /**
     * Emits a `signal.info` notification for the currently active pending signal.
     *
     * Validates strategy, exchange, risk, and action schemas before emitting.
     * Resolves the pending signal for the given symbol and emits a `SignalInfoContract`
     * via `signalNotifySubject`, which is then routed to all registered `listenSignalNotify` callbacks
     * and persisted by `NotificationAdapter`.
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
        context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
        backtest: boolean,
    ) => {
        lib.loggerService.info(METHOD_NAME_COMMIT_SIGNAL_NOTIFY, {
            symbol,
            context,
            backtest,
            currentPrice,
        });
        lib.strategyValidationService.validate(
            context.strategyName,
            METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
        );
        lib.exchangeValidationService.validate(
            context.exchangeName,
            METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
        );
        {
            const { riskName, riskList, actions } =
            lib.strategySchemaService.get(context.strategyName);
            riskName &&
            lib.riskValidationService.validate(
                riskName,
                METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
            );
            riskList &&
            riskList.forEach((riskName) =>
                lib.riskValidationService.validate(
                riskName,
                METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
                ),
            );
            actions &&
            actions.forEach((actionName) =>
                lib.actionValidationService.validate(
                actionName,
                METHOD_NAME_COMMIT_SIGNAL_NOTIFY,
                ),
            );
        }
        const pendingSignal = await lib.strategyCoreService.getPendingSignal(
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
        const timestamp = await lib.timeMetaService.getTimestamp(
            symbol, {
                strategyName: context.strategyName,
                exchangeName: context.exchangeName,
                frameName: context.frameName,
            },
            backtest
        )
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
    }

}

export const Signal = new SignalUtils();
