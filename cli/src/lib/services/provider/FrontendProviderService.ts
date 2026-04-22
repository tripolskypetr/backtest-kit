import { singleshot } from "functools-kit";
import { serve, lib } from "@backtest-kit/ui";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getArgs } from "../../../helpers/getArgs";
import { entrySubject } from "../../../config/emitters";
import { getEnv } from "../../../helpers/getEnv";
import ResolveService from "../base/ResolveService";
import ConfigConnectionService from "../connection/ConfigConnectionService";

const GET_SYMBOL_EXPORTS_FN = async (self: FrontendProviderService) => {
  const exports = await self.configConnectionService.loadConfig("symbol.config");
  if (!exports) {
    return null;
  }
  return "default" in exports
    ? exports.default
    : exports;
};

const GET_SYMBOL_CONFIG_FN = async (self: FrontendProviderService) => {
  const config = await GET_SYMBOL_EXPORTS_FN(self);
  if (!config) {
    return null;
  }
  if (Array.isArray(config)) {
    return config;
  }
  if ("symbol_list" in config) {
    return config.symbol_list;
  }
  return null;
};

export class FrontendProviderService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly resolveService = inject<ResolveService>(TYPES.resolveService);

  readonly configConnectionService = inject<ConfigConnectionService>(TYPES.configConnectionService);

  public enable = singleshot(() => {
    this.loggerService.log("frontendProviderService enable");
    const { CC_WWWROOT_HOST, CC_WWWROOT_PORT } = getEnv();
    let unServer: Function;

    const init = async () => {
      {
        const config = await GET_SYMBOL_CONFIG_FN(this);
        if (config) {
          lib.symbolConnectionService.getSymbolList.setValue(config)
        }
      }
      unServer = serve(CC_WWWROOT_HOST, CC_WWWROOT_PORT, this.resolveService.PROJECT_ROOT_DIR);
    }
    init();

    return () => {
      unServer && unServer();
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
