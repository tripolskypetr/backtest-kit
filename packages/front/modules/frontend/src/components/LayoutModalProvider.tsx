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

    return (
        <>
            {children}
            {renderOpenDocument()}
        </>
    );
};

export default LayoutModalProvider;
