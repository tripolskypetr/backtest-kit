import {
    downloadBlank,
    useAlert,
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

interface ILayoutModalProviderProps {
    children: React.ReactNode;
}

export const LayoutModalProvider = ({
    children,
}: ILayoutModalProviderProps) => {
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

    return (
        <>
            {children}
            {renderOpenDocument()}
        </>
    );
};

export default LayoutModalProvider;
