import { CandleInterval } from "backtest-kit";

import { File } from "../classes/File";
import { Code } from "../classes/Code";

import { ExchangeName } from "../lib/services/context/ExchangeContextService";
import { PlotMapping } from "../lib/services/data/PineDataService";
import { PlotModel } from "../model/Plot.model";
import { getSourceCode, runInference } from "../helpers/inference";

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
  const { plots } = await runInference(
    await getSourceCode(source),
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
