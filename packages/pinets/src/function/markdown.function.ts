import { CandleInterval, ExecutionContextService } from "backtest-kit";
import { str } from "functools-kit";

import { File } from "../classes/File";
import { Code } from "../classes/Code";

import ExchangeContextService, {
  ExchangeName,
} from "../lib/services/context/ExchangeContextService";
import { PlotMapping } from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";

import lib from "../lib";

const TO_MARKDOWN_METHOD_NAME = "markdown.toMarkdown";
const MARKDOWN_METHOD_NAME = "markdown.markdown";

type ResultId = string | number;

interface IRunParams {
  symbol: string;
  timeframe: CandleInterval;
  limit: number;
  inputs?: Record<string, any>,
}

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
  inputs: Record<string, any>
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
};

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

export async function toMarkdown<M extends PlotMapping>(
  signalId: ResultId,
  plots: PlotModel,
  mapping: M,
  limit = Number.POSITIVE_INFINITY,
): Promise<string> {
  lib.loggerService.log(TO_MARKDOWN_METHOD_NAME, {
    signalId,
    plotCount: Object.keys(plots).length,
    mapping,
    limit,
  });
  return await lib.pineMarkdownService.getReport(
    signalId,
    plots,
    mapping,
    limit,
  );
}

export async function markdown<M extends PlotMapping>(
  signalId: ResultId,
  source: File | Code,
  { symbol, timeframe, limit, inputs = {} }: IRunParams,
  mapping: M,
  exchangeName?: ExchangeName,
  when?: Date,
) {
  lib.loggerService.log(MARKDOWN_METHOD_NAME, {
    signalId,
    mapping,
    limit,
    exchangeName,
    when,
  });
  const { plots } = await RUN_INFERENCE_FN(
    await GET_SOURCE_FN(source),
    symbol,
    timeframe,
    limit,
    inputs,
    exchangeName,
    when,
  );
  return await lib.pineMarkdownService.getReport(
    signalId,
    plots,
    mapping,
    Number.POSITIVE_INFINITY,
  );
}
