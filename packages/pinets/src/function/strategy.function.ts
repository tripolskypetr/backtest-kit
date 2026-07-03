import { CandleInterval, ISignalDto } from "backtest-kit";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import lib from "../lib";
import toSignalDto from "../helpers/toSignalDto";
import { getSourceCode } from "../helpers/inference";
import { randomString } from "functools-kit";

const METHOD_NAME_RUN = "strategy.getSignal";

const DEFAULT_ESTIMATED_TIME = 240;

interface IParams {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
  inputs?: Record<string, any>;
}

const SIGNAL_SCHEMA = {
  position: "Signal",
  priceOpen: {
    plot: "Close",
    defaultValue: 0,
    transform: (v: number) => v,
  },
  priceTakeProfit: "TakeProfit",
  priceStopLoss: "StopLoss",
  minuteEstimatedTime: {
    plot: "EstimatedTime",
    defaultValue: 0,
    transform: (v: number) => v || DEFAULT_ESTIMATED_TIME,
  },
} as const;

export async function getSignal(
  source: File | Code,
  { symbol, timeframe, limit, inputs = {} }: IParams,
): Promise<ISignalDto | null> {
  lib.loggerService.info(METHOD_NAME_RUN, {
    source,
    symbol,
    timeframe,
    limit,
  });

  const { plots } = await lib.pineJobService.run(
    await getSourceCode(source),
    symbol,
    timeframe,
    limit,
    inputs,
  );

  const resultId = randomString();
  const data = lib.pineDataService.extract(plots, SIGNAL_SCHEMA);

  return toSignalDto(resultId, data);
}
