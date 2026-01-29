import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { memoize, singleshot, ttl } from "functools-kit";
import SymbolConnectionService from "../connection/SymbolConnectionService";
import LoggerService from "../base/LoggerService";

export class SymbolMetaService {
  private readonly symbolConnectionService = inject<SymbolConnectionService>(
    TYPES.symbolConnectionService,
  );
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getSymbolList = singleshot(async () => {
    this.loggerService.log("symbolMetaService getSymbolList");
    const symbolList = await this.symbolConnectionService.getSymbolList();
    return symbolList.map(({ symbol }) => symbol);
  });

  public getSymbolMap = singleshot(async () => {
    this.loggerService.log("symbolMetaService getSymbolMap");
    const symbolList = await this.symbolConnectionService.getSymbolList();
    return symbolList.reduce(
      (acm, { symbol, ...other }) => ({
        ...acm,
        [symbol]: { symbol, ...other },
      }),
      {},
    );
  });

  public getSymbol = memoize(
    ([symbol]) => `${symbol}`,
    async (symbol: string) => {
      this.loggerService.log("symbolMetaService getSymbol", {
        symbol,
      });
      const symbolList = await this.symbolConnectionService.getSymbolList();
      const target = symbolList.find((item) => item.symbol === symbol);
      if (!target) {
        throw new Error(
          `symbolMetaService getSymbol no item found symbol=${symbol}`,
        );
      }
      return target;
    },
  );
}

export default SymbolMetaService;
