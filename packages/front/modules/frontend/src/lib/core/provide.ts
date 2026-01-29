import { provide } from "react-declarative";
import TYPES from "./TYPES";

import ErrorService from "../services/base/ErrorService";
import LayoutService from "../services/base/LayoutService";
import LoggerService from "../services/base/LoggerService";
import RouterService from "../services/base/RouterService";
import AlertService from "../services/base/AlertService";

{
    provide(TYPES.errorService, () => new ErrorService());
    provide(TYPES.alertService, () => new AlertService());
    provide(TYPES.layoutService, () => new LayoutService());
    provide(TYPES.loggerService, () => new LoggerService());
    provide(TYPES.routerService, () => new RouterService());
}
