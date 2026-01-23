import { CandleInterval } from "backtest-kit";
import lib from "src/lib";
import { Code } from "src/classes/Code";
import { File } from "src/classes/File";
import {
  ExtractedData,
  PlotMapping,
} from "src/lib/services/data/PineDataService";

const METHOD_NAME_RUN = "run.run";

const GET_SOURCE_FN = async (source: File | Code) => {
  if (File.isFile(source)) {
    return await lib.pineCacheService.readFile(source.path, source.baseDir);
  }
  if (Code.isCode(source)) {
    return source.source;
  }
  throw new Error("Source must be a File or Code instance");
};

interface IRunParams<M extends PlotMapping> {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
  mapping: M;
}

export async function run<M extends PlotMapping>(
  source: File | Code,
  { symbol, timeframe, mapping, limit }: IRunParams<M>,
): Promise<ExtractedData<M>> {
  lib.loggerService.info(METHOD_NAME_RUN, {
    source,
    symbol,
    timeframe,
    mapping,
    limit,
  });
  const script = await GET_SOURCE_FN(source);
  const { plots } = await lib.pineJobService.run(
    script,
    symbol,
    timeframe,
    limit,
  );
  return lib.pineDataService.extract(plots, mapping);
}


