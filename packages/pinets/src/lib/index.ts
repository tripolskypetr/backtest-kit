import "./core/provide";

import { init, inject } from "./core/di";
import { TYPES } from "./core/types";

import LoggerService from "./services/base/LoggerService";
import AxisProviderService from "./services/provider/AxisProviderService";
import CandleProviderService from "./services/provider/CandleProviderService";
import PineJobService from "./services/job/PineJobService";
import PineDataService from "./services/data/PineDataService";
import PineCacheService from "./services/cache/PineCacheService";
import PineConnectionService from "./services/connection/PineConnectionService";
import PineMarkdownService from "./services/markdown/PineMarkdownService";
import { TExchangeContextService } from "./services/context/ExchangeContextService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const contextServices = {
  exchangeContextService: inject<TExchangeContextService>(TYPES.exchangeContextService),
}

const providerServices = {
  axisProviderService: inject<AxisProviderService>(TYPES.axisProviderService),
  candleProviderService: inject<CandleProviderService>(TYPES.candleProviderService),
};

const jobServices = {
  pineJobService: inject<PineJobService>(TYPES.pineJobService),
};

const dataServices = {
  pineDataService: inject<PineDataService>(TYPES.pineDataService),
};

const cacheServices = {
  pineCacheService: inject<PineCacheService>(TYPES.pineCacheService),
};

const connectionServices = {
  pineConnectionService: inject<PineConnectionService>(TYPES.pineConnectionService),
};

const markdownServices = {
  pineMarkdownService: inject<PineMarkdownService>(TYPES.pineMarkdownService),
};

const pine = {
  ...contextServices,
  ...baseServices,
  ...providerServices,
  ...jobServices,
  ...dataServices,
  ...cacheServices,
  ...connectionServices,
  ...markdownServices,
};

init();

export { pine };

export default pine;
