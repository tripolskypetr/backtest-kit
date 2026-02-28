import { CandleInterval, ExecutionContextService } from "backtest-kit";
import lib from "../lib";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import { PlotModel } from "../model/Plot.model";
import ExchangeContextService, {
  ExchangeName,
} from "../lib/services/context/ExchangeContextService";
import { str } from "functools-kit";

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
  inputs: Record<string, any>,
) => await lib.pineJobService.run(script, symbol, timeframe, limit, inputs);

const VALIDATE_NO_TRADING_FN = () => {
  if (ExecutionContextService.hasContext()) {
    throw new Error(
      str.newline(
        "Time overrides are not allowed when running scripts in a trading context.",
        "Please remove the 'when' parameter from the run function call.",
      ),
    );
  }
}

const CREATE_INFERENCE_FN = (
  script: Code,
  symbol: string,
  timeframe: CandleInterval,
  limit: number,
  inputs: Record<string, any>,
  exchangeName?: ExchangeName,
  when?: Date,
) => {
  let fn = () => BASE_RUNNER_FN(script, symbol, timeframe, limit, inputs);

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
  inputs: Record<string, any>,
  exchangeName?: ExchangeName,
  when?: Date,
) => {
  if (when) {
    VALIDATE_NO_TRADING_FN();
  }
  const inference = CREATE_INFERENCE_FN(
    script,
    symbol,
    timeframe,
    limit,
    inputs,
    exchangeName,
    when,
  );
  return await inference();
};

interface IRunParams {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
  inputs?: Record<string, any>;
}

export async function run(
  source: File | Code,
  { symbol, timeframe, limit, inputs = {} }: IRunParams,
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
    inputs,
    exchangeName,
    when,
  );
  return plots;
}
