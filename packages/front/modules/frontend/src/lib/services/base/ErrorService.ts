import { Subject, inject } from "react-declarative";

import RouterService from "./RouterService";
import LoggerService from "./LoggerService";

import TYPES from "../../core/TYPES";

export class ErrorService {
    private readonly routerService = inject<RouterService>(TYPES.routerService);

    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public readonly errorSubject = new Subject<void>();

    handleGlobalError = (e: Error) => {
        console.error(e);
        this.loggerService.error(e);
        this.routerService.push("/error_page");
        this.errorSubject.next();
    };
}

export default ErrorService;
