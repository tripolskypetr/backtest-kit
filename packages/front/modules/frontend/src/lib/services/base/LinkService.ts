import { inject, openBlank, parseRouteUrl } from "react-declarative";
import LoggerService from "./LoggerService";
import TYPES from "../../core/TYPES";
import { RouterService } from "./RouterService";
import { LayoutService } from "./LayoutService";

type MatchRoute = {
    path: string;
    index: number;
    params: any;
}

export class LinkService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly routerService = inject<RouterService>(TYPES.routerService);
    private readonly layoutService = inject<LayoutService>(TYPES.layoutService);

    openLink = async (href: string) => {
        this.loggerService.log("linkService openLink", {
            href,
        });
        let parsed: MatchRoute | null = null;

        {
            if (parsed = parseRouteUrl("/pick-dump-search/:search", href)) {
                await this.layoutService.closeModal();
                this.routerService.push(`/dump/${parsed.params.search}`);
                return;
            }
        }

        {
            if (parsed = parseRouteUrl("/pick-signal/:signalId", href)) {
                this.layoutService.pickSignal(parsed.params.signalId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-risk/:notificationId", href)) {
                this.layoutService.pickRisk(parsed.params.notificationId);
                return;
            }
        }

        {
            if (parsed = parseRouteUrl("/pick-dump-content/:sessionId", href)) {
                this.layoutService.pickDumpContent(parsed.params.sessionId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-opened/:notificationId", href)) {
                this.layoutService.pickSignalOpened(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-closed/:notificationId", href)) {
                this.layoutService.pickSignalClosed(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-scheduled/:notificationId", href)) {
                this.layoutService.pickSignalScheduled(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-cancelled/:notificationId", href)) {
                this.layoutService.pickSignalCancelled(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-sync-open/:notificationId", href)) {
                this.layoutService.pickSignalSyncOpen(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-signal-sync-close/:notificationId", href)) {
                this.layoutService.pickSignalSyncClose(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-activate-scheduled/:notificationId", href)) {
                this.layoutService.pickActivateScheduled(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-average-buy-commit/:notificationId", href)) {
                this.layoutService.pickAverageBuyCommit(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-cancel-scheduled/:notificationId", href)) {
                this.layoutService.pickCancelScheduled(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-close-pending/:notificationId", href)) {
                this.layoutService.pickClosePending(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-partial-loss-available/:notificationId", href)) {
                this.layoutService.pickPartialLossAvailable(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-partial-loss-commit/:notificationId", href)) {
                this.layoutService.pickPartialLossCommit(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-partial-profit-available/:notificationId", href)) {
                this.layoutService.pickPartialProfitAvailable(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-partial-profit-commit/:notificationId", href)) {
                this.layoutService.pickPartialProfitCommit(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-breakeven-available/:notificationId", href)) {
                this.layoutService.pickBreakevenAvailable(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-breakeven-commit/:notificationId", href)) {
                this.layoutService.pickBreakevenCommit(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-trailing-stop/:notificationId", href)) {
                this.layoutService.pickTrailingStop(parsed.params.notificationId);
                return;
            }
            if (parsed = parseRouteUrl("/pick-trailing-take/:notificationId", href)) {
                this.layoutService.pickTrailingTake(parsed.params.notificationId);
                return;
            }
        }

        openBlank(href);
    };
}

export default LinkService;
