import { Subject } from "react-declarative";

export class LayoutService {
    public readonly appbarSubject = new Subject<boolean>();
    public readonly modalSubject = new Subject<boolean>();

    public readonly pickSignalSubject = new Subject<string>();
    public readonly pickRiskSubject = new Subject<string>();

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
    }
}

export default LayoutService;
