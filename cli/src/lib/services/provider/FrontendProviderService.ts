import { singleshot } from "functools-kit";
import { serve, lib } from "@backtest-kit/ui";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { getArgs } from "../../../helpers/getArgs";
import { entrySubject } from "../../../config/emitters";
import { getEnv } from "../../../helpers/getEnv";
import ResolveService from "../core/ResolveService";
import ConfigConnectionService from "../connection/ConfigConnectionService";
import { SymbolConfig } from "../../../model/Config.model";

const GET_SYMBOL_EXPORTS_FN = async (self: FrontendProviderService) => {
  const exports = await self.configConnectionService.loadConfig("symbol.config");
  if (!exports) {
    return null;
  }
  return "default" in exports
    ? exports.default
    : exports;
};

const GET_SYMBOL_CONFIG_FN = async (self: FrontendProviderService): Promise<SymbolConfig[]> => {
  const config = await GET_SYMBOL_EXPORTS_FN(self);
  if (!config) {
    throw new Error("FrontendProviderService getSymbolConfig `symbol.config` is not found");
  }
  if (Array.isArray(config)) {
    return config;
  }
  if ("symbol_list" in config) {
    return config.symbol_list;
  }
  throw new Error("FrontendProviderService getSymbolConfig `symbol.config` is not found");
};

const MAP_SYMBOL_CONFIG_FN = (config: SymbolConfig[]) => {
  const uniqueSymbols = new Set<string>();

  const symbolList = config
    .filter((item) => {
      if (uniqueSymbols.has(item.symbol)) {
        return false;
      }
      uniqueSymbols.add(item.symbol);
      return true;
    })
    .map(({ priority, displayName, symbol, logo, icon, ...other }, idx) => ({
      symbol,
      icon,
      logo: logo ?? icon,
      priority: priority ?? idx,
      displayName: displayName ?? symbol,
      index: idx,
      ...other,
    }));
  symbolList.sort(
    ({ priority: a_p, index: a_x }, { priority: b_p, index: b_x }) =>
      b_p - a_p || a_x - b_x
  );
  return symbolList;
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
          const symbolList = MAP_SYMBOL_CONFIG_FN(config);
          lib.symbolConnectionService.getSymbolList.setValue(Promise.resolve(symbolList));
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
