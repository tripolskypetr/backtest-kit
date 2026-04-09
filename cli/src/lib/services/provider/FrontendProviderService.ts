import { singleshot } from "functools-kit";
import { serve } from "@backtest-kit/ui";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getArgs } from "../../../helpers/getArgs";
import { entrySubject } from "../../../config/emitters";
import { getEnv } from "../../../helpers/getEnv";
import ResolveService from "../base/ResolveService";

export class FrontendProviderService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  public enable = singleshot(() => {
    this.loggerService.log("frontendProviderService enable");
    const { CC_WWWROOT_HOST, CC_WWWROOT_PORT } = getEnv();
    const unServer = serve(CC_WWWROOT_HOST, CC_WWWROOT_PORT, this.resolveService.PROJECT_ROOT_DIR);
    return () => {
      unServer();
      this.enable.clear();
    };
  });

  public disable = () => {
    this.loggerService.log("frontendProviderService disable");
    if (this.enable.hasValue()) {
      const lastSubscription = this.enable();
      lastSubscription();
    }
  };

  public connect = singleshot(async () => {
    this.loggerService.log("frontendProviderService connect");
    if (!getArgs().values.ui) {
      return;
    }
    return entrySubject.subscribe(this.enable);
  });
}

export default FrontendProviderService;
