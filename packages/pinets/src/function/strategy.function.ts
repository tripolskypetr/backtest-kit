import { CandleInterval, ISignalDto } from "backtest-kit";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import lib from "../lib";

const METHOD_NAME_RUN = "strategy.getSignal";

const DEFAULT_ESTIMATED_TIME = 240;

const GET_SOURCE_FN = async (source: File | Code) => {
  if (File.isFile(source)) {
    return await lib.pineCacheService.readFile(source.path, source.baseDir);
  }
  if (Code.isCode(source)) {
    return source.source;
  }
  throw new Error("Source must be a File or Code instance");
};

interface IParams {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
}

interface SignalData {
  position: number;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
}

const SIGNAL_SCHEMA = {
  position: "Signal",
  priceOpen: "Close",
  priceTakeProfit: "TakeProfit",
  priceStopLoss: "StopLoss",
  minuteEstimatedTime: {
    plot: "EstimatedTime",
    transform: (v) => v || DEFAULT_ESTIMATED_TIME,
  },
} as const;

function toSignalDto(data: SignalData): ISignalDto | null {
  if (data.position === 1) {
    return {
      position: "long",
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
  }

  if (data.position === -1) {
    return {
      position: "short",
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      minuteEstimatedTime: data.minuteEstimatedTime,
    };
  }

  return null;
}

export async function getSignal(
  source: File | Code,
  { symbol, timeframe, limit }: IParams,
): Promise<ISignalDto | null> {
  lib.loggerService.info(METHOD_NAME_RUN, {
    source,
    symbol,
    timeframe,
    limit,
  });

  const { plots } = await lib.pineJobService.run(
    await GET_SOURCE_FN(source),
    symbol,
    timeframe,
    limit,
  );

  const data = lib.pineDataService.extract(plots, SIGNAL_SCHEMA);

  return toSignalDto(data);
}
