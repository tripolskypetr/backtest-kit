import { memoize, singleshot, str } from "functools-kit";
import { createRequire } from "module";
import path from "path";
import { SymbolModel } from "src/model/Symbol.model";
import symbol_list_default from "src/assets/symbol_list";
import { inject } from "src/lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "src/lib/core/types";

const require = createRequire(import.meta.url);

const getSymbolList = singleshot((): SymbolModel[] => {
  try {
    const modulePath = require.resolve(
      path.join(process.cwd(), `./config/symbol.config.cjs`)
    );
    console.log(`Using ${modulePath} implementation as symbol.config.cjs`);
    return require(modulePath);
  } catch (error) {
    console.log(`Using default implementation for symbol.config.cjs`, error);
    return symbol_list_default;
  }
});

export class SymbolConnectionService {

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getSymbolList = singleshot(async () => {
    this.loggerService.log("symbolConnectionService getSymbolList");
    const symbolListRaw = await getSymbolList();

    const uniqueSymbols = new Set<string>();

    const symbolList = symbolListRaw
      .filter((item) => {
        if (uniqueSymbols.has(item.symbol)) {
          return false;
        }
        uniqueSymbols.add(item.symbol);
        return true;
      })
      .map(({ priority, displayName, symbol, logo, icon, ...other }, idx) => ({
        symbol,
        icon,
        logo: logo ?? icon,
        priority: priority ?? idx,
        displayName: displayName ?? symbol,
        index: idx,
        ...other,
      }));
    symbolList.sort(
      ({ priority: a_p, index: a_x }, { priority: b_p, index: b_x }) =>
        b_p - a_p || a_x - b_x
    );
    return symbolList;
  });

  public getSymbol = memoize(
    ([symbol]) => `${symbol}`,
    async (symbol: string) => {
      this.loggerService.log("symbolConnectionService getSymbol", {
        symbol,
      });
      const symbolList = await this.getSymbolList();
      const target = symbolList.find((item) => item.symbol === symbol);
      if (!target) {
        throw new Error(
          `symbolConnectionService getSymbol no item found symbol=${symbol}`
        );
      }
      return target;
    }
  );

  protected init = singleshot(async () => {
    this.loggerService.log("symbolConnectionService init");
    getSymbolList();
  });
}

export default SymbolConnectionService;
