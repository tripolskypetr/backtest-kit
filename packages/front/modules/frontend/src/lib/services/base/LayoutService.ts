import { Subject } from "react-declarative";

export class LayoutService {
    public readonly appbarSubject = new Subject<boolean>();
    public readonly modalSubject = new Subject<boolean>();

    public readonly pickSignalSubject = new Subject<string>();
    public readonly pickRiskSubject = new Subject<string>();

    // Signal notification subjects (4 types)
    public readonly pickSignalOpenedSubject = new Subject<string>();
    public readonly pickSignalClosedSubject = new Subject<string>();
    public readonly pickSignalScheduledSubject = new Subject<string>();
    public readonly pickSignalCancelledSubject = new Subject<string>();

    // Partial profit subjects (2 types)
    public readonly pickPartialProfitAvailableSubject = new Subject<string>();
    public readonly pickPartialProfitCommitSubject = new Subject<string>();

    // Partial loss subjects (2 types)
    public readonly pickPartialLossAvailableSubject = new Subject<string>();
    public readonly pickPartialLossCommitSubject = new Subject<string>();

    // Breakeven subjects (2 types)
    public readonly pickBreakevenAvailableSubject = new Subject<string>();
    public readonly pickBreakevenCommitSubject = new Subject<string>();

    // Trailing subjects (2 types)
    public readonly pickTrailingStopSubject = new Subject<string>();
    public readonly pickTrailingTakeSubject = new Subject<string>();

    // Activate scheduled subject
    public readonly pickActivateScheduledSubject = new Subject<string>();

    public readonly reloadOutletSubject = new Subject<void>();

    public readonly openDocumentSubject = new Subject<{
        fileName: string;
        url: string;
        sizeOriginal?: number;
    }>();

    public readonly promptOutgoing = new Subject<{
        title: string;
        value: string;
    }>();

    public readonly promptIncoming = new Subject<string | null>();

    public readonly alertOutgoung = new Subject<{
        title: string;
        description: string;
    }>();

    private _modalLoading = 0;

    private _appbarLoading = 0;

    get hasModalLoader() {
        return !!this._modalLoading;
    }

    get hasAppbarLoader() {
        return !!this._appbarLoading;
    }

    setModalLoader = (loading: boolean) => {
        this._modalLoading = Math.max(
            this._modalLoading + (loading ? 1 : -1),
            0,
        );
        this.modalSubject.next(loading);
    };

    setAppbarLoader = (loading: boolean) => {
        this._appbarLoading = Math.max(
            this._appbarLoading + (loading ? 1 : -1),
            0,
        );
        this.appbarSubject.next(loading);
    };

    dropModalLoader = () => {
        this._modalLoading = 0;
        this.modalSubject.next(false);
    };

    dropAppbarLoader = () => {
        this._appbarLoading = 0;
        this.appbarSubject.next(false);
    };

    reloadOutlet = () => {
        this.reloadOutletSubject.next();
    };

    prompt = async (title: string, value = "") => {
        this.promptOutgoing.next({ title, value });
        return await this.promptIncoming.toPromise();
    };

    downloadFile = (url: string, fileName: string, sizeOriginal?: number) => {
        this.openDocumentSubject.next({
            url,
            fileName,
            sizeOriginal,
        });
    };

    pickAlert = async (title: string, description: string) => {
        await this.alertOutgoung.next({
            title,
            description,
        });
    };

    pickSignal = async (signalId: string) => {
        await this.pickSignalSubject.next(signalId);
    };

    pickRisk = async (notificationId: string) => {
        await this.pickRiskSubject.next(notificationId);
    };

    // Signal notification methods (4 types)
    pickSignalOpened = async (notificationId: string) => {
        await this.pickSignalOpenedSubject.next(notificationId);
    };

    pickSignalClosed = async (notificationId: string) => {
        await this.pickSignalClosedSubject.next(notificationId);
    };

    pickSignalScheduled = async (notificationId: string) => {
        await this.pickSignalScheduledSubject.next(notificationId);
    };

    pickSignalCancelled = async (notificationId: string) => {
        await this.pickSignalCancelledSubject.next(notificationId);
    };

    // Partial profit methods (2 types)
    pickPartialProfitAvailable = async (notificationId: string) => {
        await this.pickPartialProfitAvailableSubject.next(notificationId);
    };

    pickPartialProfitCommit = async (notificationId: string) => {
        await this.pickPartialProfitCommitSubject.next(notificationId);
    };

    // Partial loss methods (2 types)
    pickPartialLossAvailable = async (notificationId: string) => {
        await this.pickPartialLossAvailableSubject.next(notificationId);
    };

    pickPartialLossCommit = async (notificationId: string) => {
        await this.pickPartialLossCommitSubject.next(notificationId);
    };

    // Breakeven methods (2 types)
    pickBreakevenAvailable = async (notificationId: string) => {
        await this.pickBreakevenAvailableSubject.next(notificationId);
    };

    pickBreakevenCommit = async (notificationId: string) => {
        await this.pickBreakevenCommitSubject.next(notificationId);
    };

    // Trailing methods (2 types)
    pickTrailingStop = async (notificationId: string) => {
        await this.pickTrailingStopSubject.next(notificationId);
    };

    pickTrailingTake = async (notificationId: string) => {
        await this.pickTrailingTakeSubject.next(notificationId);
    };

    // Activate scheduled method
    pickActivateScheduled = async (notificationId: string) => {
        await this.pickActivateScheduledSubject.next(notificationId);
    };
}

export default LayoutService;
