import { CandleInterval } from "backtest-kit";
import lib from "../lib";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import { PlotModel } from "../model/Plot.model";
import { ExchangeName } from "../lib/services/context/ExchangeContextService";
import { getSourceCode, runInference } from "../helpers/inference";

const METHOD_NAME_RUN = "run.run";

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
  const script = await getSourceCode(source);
  const { plots } = await runInference(
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
