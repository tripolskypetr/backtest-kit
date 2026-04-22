import { memoize, singleshot, str } from "functools-kit";
import { createRequire } from "module";
import path from "path";
import { SymbolModel } from "../../../model/Symbol.model";
import symbol_list_default from "../../../assets/symbol_list";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { serveSubject } from "../../../config/emitters";

const require = createRequire(import.meta.url);

const getSymbolList = singleshot((cwd: string): SymbolModel[] => {
  try {
    const modulePath = require.resolve(
      path.join(cwd, `./config/symbol.config.cjs`)
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

    if (!serveSubject.data) {
      throw new Error("Make sure to call serve() before getSymbolList().");
    }

    const symbolListRaw = await getSymbolList(serveSubject.data);

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

  protected init = singleshot(async () => {
    this.loggerService.log("symbolConnectionService init");
    serveSubject.once((cwd) => {
      if (this.getSymbolList.hasValue()) {
        return;
      }
      getSymbolList(cwd);
    });
  });
}

export default SymbolConnectionService;
