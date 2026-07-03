import { CandleInterval, ExecutionContextService } from "backtest-kit";
import { str } from "functools-kit";

import lib from "../lib";
import { Code } from "../classes/Code";
import { File } from "../classes/File";
import ExchangeContextService, {
  ExchangeName,
} from "../lib/services/context/ExchangeContextService";
import { PlotRecord } from "../model/Plot.model";

/**
 * Resolves a script source (File reference or inline Code) into Code.
 * Shared by run(), markdown() and getSignal().
 */
export const getSourceCode = async (source: File | Code): Promise<Code> => {
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

/**
 * Runs a Pine script through PineJobService, optionally scoped to an
 * exchange context and/or a fixed point in time (backtest-style override).
 * Shared by run() and markdown().
 */
export const runInference = async (
  script: Code,
  symbol: string,
  timeframe: CandleInterval,
  limit: number,
  inputs: Record<string, any>,
  exchangeName?: ExchangeName,
  when?: Date,
): Promise<PlotRecord> => {
  if (when) {
    VALIDATE_NO_TRADING_FN();
  }

  let fn = () =>
    lib.pineJobService.run(script, symbol, timeframe, limit, inputs);

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

  return await fn();
};
