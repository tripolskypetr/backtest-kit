import { CandleInterval, ExecutionContextService } from "backtest-kit";
import lib from "../lib";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import { PlotModel } from "../model/Plot.model";
import ExchangeContextService, {
  ExchangeName,
} from "../lib/services/context/ExchangeContextService";

const METHOD_NAME_RUN = "run.run";

const GET_SOURCE_FN = async (source: File | Code) => {
  if (File.isFile(source)) {
    const code = await lib.pineCacheService.readFile(
      source.path,
      source.baseDir,
    );
    return Code.fromString(code);
  }
  if (Code.isCode(source)) {
    return source;
  }
  throw new Error("Source must be a File or Code instance");
};

const BASE_RUNNER_FN = async (
  script: Code,
  symbol: string,
  timeframe: CandleInterval,
  limit: number,
) => await lib.pineJobService.run(script, symbol, timeframe, limit);

const CREATE_INFERENCE_FN = (
  script: Code,
  symbol: string,
  timeframe: CandleInterval,
  limit: number,
  exchangeName?: ExchangeName,
  when?: Date,
) => {
  let fn = () => BASE_RUNNER_FN(script, symbol, timeframe, limit);

  if (exchangeName) {
    fn = ExchangeContextService.runWithContext(fn, { exchangeName });
  }

  if (when) {
    fn = ExecutionContextService.runWithContext(fn, {
      when,
      symbol,
      backtest: true,
    });
  }

  return fn;
};

const RUN_INFERENCE_FN = async (
  script: Code,
  symbol: string,
  timeframe: CandleInterval,
  limit: number,
  exchangeName?: ExchangeName,
  when?: Date,
) => {
  const inference = CREATE_INFERENCE_FN(
    script,
    symbol,
    timeframe,
    limit,
    exchangeName,
    when,
  );
  return await inference();
};

interface IRunParams {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
}

export async function run(
  source: File | Code,
  { symbol, timeframe, limit }: IRunParams,
  exchangeName?: ExchangeName,
  when?: Date,
): Promise<PlotModel> {
  lib.loggerService.info(METHOD_NAME_RUN, {
    source,
    symbol,
    timeframe,
    limit,
  });
  const script = await GET_SOURCE_FN(source);
  const { plots } = await RUN_INFERENCE_FN(
    script,
    symbol,
    timeframe,
    limit,
    exchangeName,
    when,
  );
  return plots;
}
