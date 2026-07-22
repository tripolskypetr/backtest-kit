import {
    downloadBlank,
    useAlert,
    useModalManager,
    useOnce,
    useOpenDocument,
    usePrompt,
} from "react-declarative";
import { ioc } from "../lib";
import useSignalView from "../hooks/useSignalView";
import useRiskView from "../hooks/useRiskView";

// Signal notification hooks (4 types)
import useSignalOpenedView from "../hooks/useSignalOpenedView";
import useSignalClosedView from "../hooks/useSignalClosedView";
import useSignalScheduledView from "../hooks/useSignalScheduledView";
import useSignalCancelledView from "../hooks/useSignalCancelledView";

// Signal info notification hook
import useSignalNotifyView from "../hooks/useSignalNotifyView";

// Partial profit hooks (2 types)
import usePartialProfitAvailableView from "../hooks/usePartialProfitAvailableView";
import usePartialProfitCommitView from "../hooks/usePartialProfitCommitView";

// Partial loss hooks (2 types)
import usePartialLossAvailableView from "../hooks/usePartialLossAvailableView";
import usePartialLossCommitView from "../hooks/usePartialLossCommitView";

// Breakeven hooks (2 types)
import useBreakevenAvailableView from "../hooks/useBreakevenAvailableView";
import useBreakevenCommitView from "../hooks/useBreakevenCommitView";

// Trailing hooks (2 types)
import useTrailingStopView from "../hooks/useTrailingStopView";
import useTrailingTakeView from "../hooks/useTrailingTakeView";

// Activate scheduled hook
import useActivateScheduledView from "../hooks/useActivateScheduledView";

// Average buy hook
import useAverageBuyCommitView from "../hooks/useAverageBuyCommitView";

// Order sync hooks (3 types)
import useOrderSyncOpenView from "../hooks/useOrderSyncOpenView";
import useOrderSyncCloseView from "../hooks/useOrderSyncCloseView";
import useOrderSyncCheckView from "../hooks/useOrderSyncCheckView";

// Order fill hooks (2 types, broker-confirmed post-verdict)
import useOrderFillOpenView from "../hooks/useOrderFillOpenView";
import useOrderFillCloseView from "../hooks/useOrderFillCloseView";

// Order reject hooks (2 types, terminal post-verdict)
import useOrderRejectOpenView from "../hooks/useOrderRejectOpenView";
import useOrderRejectCloseView from "../hooks/useOrderRejectCloseView";

// Order check decision hooks (continue / stop)
import useOrderContinueView from "../hooks/useOrderContinueView";
import useOrderStopView from "../hooks/useOrderStopView";

// Cancel scheduled / close pending hooks
import useCancelScheduledView from "../hooks/useCancelScheduledView";
import useClosePendingView from "../hooks/useClosePendingView";

// Strategy pause hook
import useStrategyPauseView from "../hooks/useStrategyPauseView";

// Dump content hook
import useDumpContentView from "../hooks/useDumpContentView";

interface ILayoutModalProviderProps {
    children: React.ReactNode;
}

export const LayoutModalProvider = ({
    children,
}: ILayoutModalProviderProps) => {

    const { clear: closeModal } = useModalManager();

    const pickPrompt = usePrompt();
    const pickAlert = useAlert();

    const { pickData: pickOpenDocument, render: renderOpenDocument } =
        useOpenDocument({
            async onSubmit(url, data) {
                if (data?.main.blob) {
                    const url = URL.createObjectURL(data.main.blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = data.main.fileName;
                    a.style.display = "none";
                    a.target = "_blank";
                    document.body.appendChild(a);
                    a.addEventListener(
                        "click",
                        () =>
                            queueMicrotask(() => {
                                URL.revokeObjectURL(url);
                            }),
                        {
                            once: true,
                        },
                    );
                    a.click();
                } else if (data) {
                    await downloadBlank(url, data.main.fileName);
                }
                return true;
            },
        });

    const pickSignal = useSignalView();
    const pickRisk = useRiskView();

    // Signal notification hooks (4 types)
    const pickSignalOpened = useSignalOpenedView();
    const pickSignalClosed = useSignalClosedView();
    const pickSignalScheduled = useSignalScheduledView();
    const pickSignalCancelled = useSignalCancelledView();

    // Signal info notification hook
    const pickSignalNotify = useSignalNotifyView();

    // Partial profit hooks (2 types)
    const pickPartialProfitAvailable = usePartialProfitAvailableView();
    const pickPartialProfitCommit = usePartialProfitCommitView();

    // Partial loss hooks (2 types)
    const pickPartialLossAvailable = usePartialLossAvailableView();
    const pickPartialLossCommit = usePartialLossCommitView();

    // Breakeven hooks (2 types)
    const pickBreakevenAvailable = useBreakevenAvailableView();
    const pickBreakevenCommit = useBreakevenCommitView();

    // Trailing hooks (2 types)
    const pickTrailingStop = useTrailingStopView();
    const pickTrailingTake = useTrailingTakeView();

    // Activate scheduled hook
    const pickActivateScheduled = useActivateScheduledView();

    // Average buy hook
    const pickAverageBuyCommit = useAverageBuyCommitView();

    // Order sync hooks (3 types)
    const pickOrderSyncOpen = useOrderSyncOpenView();
    const pickOrderSyncClose = useOrderSyncCloseView();
    const pickOrderSyncCheck = useOrderSyncCheckView();

    // Order fill hooks (2 types)
    const pickOrderFillOpen = useOrderFillOpenView();
    const pickOrderFillClose = useOrderFillCloseView();

    // Order reject hooks (2 types)
    const pickOrderRejectOpen = useOrderRejectOpenView();
    const pickOrderRejectClose = useOrderRejectCloseView();

    // Order check decision hooks (continue / stop)
    const pickOrderContinue = useOrderContinueView();
    const pickOrderStop = useOrderStopView();

    // Cancel scheduled / close pending hooks
    const pickCancelScheduled = useCancelScheduledView();
    const pickClosePending = useClosePendingView();

    // Strategy pause hook
    const pickStrategyPause = useStrategyPauseView();

    // Dump content hook
    const pickDumpContent = useDumpContentView();

    useOnce(() => 
        ioc.layoutService.closeModalSubject.subscribe(() => {
            closeModal();
        })
    );

    useOnce(() =>
        ioc.layoutService.promptOutgoing.subscribe(async ({ title, value }) => {
            const result = await pickPrompt({ title, value }).toPromise();
            ioc.layoutService.promptIncoming.next(result);
        }),
    );

    useOnce(() =>
        ioc.layoutService.openDocumentSubject.subscribe(
            ({ fileName, url, sizeOriginal }) => {
                pickOpenDocument({
                    fileName,
                    url,
                    sizeOriginal,
                });
            },
        ),
    );

    useOnce(() => ioc.layoutService.alertOutgoung.subscribe(pickAlert));

    useOnce(() => ioc.layoutService.pickSignalSubject.subscribe(pickSignal));

    useOnce(() => ioc.layoutService.pickRiskSubject.subscribe(pickRisk));

    // Signal notification subscriptions (4 types)
    useOnce(() => ioc.layoutService.pickSignalOpenedSubject.subscribe(pickSignalOpened));
    useOnce(() => ioc.layoutService.pickSignalNotifySubject.subscribe(pickSignalNotify));
    useOnce(() => ioc.layoutService.pickSignalClosedSubject.subscribe(pickSignalClosed));
    useOnce(() => ioc.layoutService.pickSignalScheduledSubject.subscribe(pickSignalScheduled));
    useOnce(() => ioc.layoutService.pickSignalCancelledSubject.subscribe(pickSignalCancelled));

    // Partial profit subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickPartialProfitAvailableSubject.subscribe(pickPartialProfitAvailable));
    useOnce(() => ioc.layoutService.pickPartialProfitCommitSubject.subscribe(pickPartialProfitCommit));

    // Partial loss subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickPartialLossAvailableSubject.subscribe(pickPartialLossAvailable));
    useOnce(() => ioc.layoutService.pickPartialLossCommitSubject.subscribe(pickPartialLossCommit));

    // Breakeven subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickBreakevenAvailableSubject.subscribe(pickBreakevenAvailable));
    useOnce(() => ioc.layoutService.pickBreakevenCommitSubject.subscribe(pickBreakevenCommit));

    // Trailing subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickTrailingStopSubject.subscribe(pickTrailingStop));
    useOnce(() => ioc.layoutService.pickTrailingTakeSubject.subscribe(pickTrailingTake));

    // Activate scheduled subscription
    useOnce(() => ioc.layoutService.pickActivateScheduledSubject.subscribe(pickActivateScheduled));

    // Average buy subscription
    useOnce(() => ioc.layoutService.pickAverageBuyCommitSubject.subscribe(pickAverageBuyCommit));

    // Order sync subscriptions (3 types)
    useOnce(() => ioc.layoutService.pickOrderSyncOpenSubject.subscribe(pickOrderSyncOpen));
    useOnce(() => ioc.layoutService.pickOrderSyncCloseSubject.subscribe(pickOrderSyncClose));
    useOnce(() => ioc.layoutService.pickOrderSyncCheckSubject.subscribe(pickOrderSyncCheck));

    // Order fill subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickOrderFillOpenSubject.subscribe(pickOrderFillOpen));
    useOnce(() => ioc.layoutService.pickOrderFillCloseSubject.subscribe(pickOrderFillClose));

    // Order reject subscriptions (2 types)
    useOnce(() => ioc.layoutService.pickOrderRejectOpenSubject.subscribe(pickOrderRejectOpen));
    useOnce(() => ioc.layoutService.pickOrderRejectCloseSubject.subscribe(pickOrderRejectClose));

    // Order check decision subscriptions (continue / stop)
    useOnce(() => ioc.layoutService.pickOrderContinueSubject.subscribe(pickOrderContinue));
    useOnce(() => ioc.layoutService.pickOrderStopSubject.subscribe(pickOrderStop));

    // Cancel scheduled / close pending subscriptions
    useOnce(() => ioc.layoutService.pickCancelScheduledSubject.subscribe(pickCancelScheduled));
    useOnce(() => ioc.layoutService.pickClosePendingSubject.subscribe(pickClosePending));

    // Strategy pause subscription
    useOnce(() => ioc.layoutService.pickStrategyPauseSubject.subscribe(pickStrategyPause));

    // Dump content subscription
    useOnce(() => ioc.layoutService.pickDumpContentSubject.subscribe(pickDumpContent));

    return (
        <>
            {children}
            {renderOpenDocument()}
        </>
    );
};

export default LayoutModalProvider;
