import { singleshot } from "functools-kit";
import { parseArgs } from "tradeforge";

import ExchangeName from "../enum/ExchangeName.mjs";
import StrategyName from "../enum/StrategyName.mjs";
import FrameName from "../enum/FrameName.mjs";

const DEFAULT_SYMBOL = "BTCUSDT";

export const getArgs = singleshot(() => 
  parseArgs({
    exchangeName: ExchangeName.BinanceExchange,
    strategyName: StrategyName.MainStrategy,
    frameName: FrameName.October2025,
    symbol: DEFAULT_SYMBOL,
  })
);
