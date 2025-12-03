import backtest from "../lib";

const PARTIAL_METHOD_NAME_GET_DATA = "PartialUtils.getData";
const PARTIAL_METHOD_NAME_GET_REPORT = "PartialUtils.getReport";
const PARTIAL_METHOD_NAME_DUMP = "PartialUtils.dump";

export class PartialUtils {
  public getData = async (symbol: string) => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_GET_DATA, { symbol });
    return await backtest.partialMarkdownService.getData(symbol);
  };

  public getReport = async (symbol: string): Promise<string> => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_GET_REPORT, { symbol });
    return await backtest.partialMarkdownService.getReport(symbol);
  };

  public dump = async (symbol: string, path?: string): Promise<void> => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_DUMP, { symbol, path });
    await backtest.partialMarkdownService.dump(symbol, path);
  };
}

export const Partial = new PartialUtils();
