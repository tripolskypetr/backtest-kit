import LoggerService from "../services/base/LoggerService";
import AxisProviderService from "../services/provider/AxisProviderService";
import CandleProviderService from "../services/provider/CandleProviderService";
import PineJobService from "../services/job/PineJobService";
import PineDataService from "../services/data/PineDataService";
import PineCacheService from "../services/cache/PineCacheService";
import PineConnectionService from "../services/connection/PineConnectionService";
import PineMarkdownService from "../services/markdown/PineMarkdownService";
import { provide } from "./di";
import { TYPES } from "./types";
import ExchangeContextService from "../services/context/ExchangeContextService";

{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.exchangeContextService, () => new ExchangeContextService());
}

{
    provide(TYPES.axisProviderService, () => new AxisProviderService());
    provide(TYPES.candleProviderService, () => new CandleProviderService());
}

{
    provide(TYPES.pineJobService, () => new PineJobService());
}

{
    provide(TYPES.pineDataService, () => new PineDataService());
}

{
    provide(TYPES.pineCacheService, () => new PineCacheService());
}

{
    provide(TYPES.pineConnectionService, () => new PineConnectionService());
}

{
    provide(TYPES.pineMarkdownService, () => new PineMarkdownService());
}
