import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache, formatPrice, getAveragePrice, getDate, getMode } from "backtest-kit";
import { commitFifteenMinuteHistory, commitHourHistory, commitOneMinuteHistory, commitThirtyMinuteHistory } from "./history.function";
import { commitLongTermMath, commitMicroTermMath, commitShortTermMath, commitSwingTermMath } from "./math.function";

const fetchBookData = Cache.fn(lib.bookDataMathService.getReport, {
  interval: "5m",
});

const commitBookDataReport = trycatch(
  async (symbol: string, history: History) => {
    const mode = await getMode();
    if (mode === "backtest") {
      return;
    }
    const bookDataReport = await fetchBookData(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== ORDER BOOK ANALYSIS (TOP 20 LARGEST LEVELS BY VOLUME %, BEST BID/ASK, MID PRICE, SPREAD, DEPTH IMBALANCE) ===",
          "",
          bookDataReport
        ),
      },
      {
        role: "assistant",
        content:
          "Order book analysis received. Will use for short-term liquidity assessment, market pressure direction (depth imbalance), and major support/resistance levels.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchBookData),
  }
);

const commitHistorySetup = async (symbol: string, history: History) => {
  // Новости и стакан сделок
  await commitBookDataReport(symbol, history);

  // Данные свечей отдельными блоками
  await commitOneMinuteHistory(symbol, history);
  await commitFifteenMinuteHistory(symbol, history);
  await commitThirtyMinuteHistory(symbol, history);
  await commitHourHistory(symbol, history);

  // Данные индикаторов и осцилляторов
  await commitMicroTermMath(symbol, history);
  await commitShortTermMath(symbol, history);
  await commitSwingTermMath(symbol, history);
  await commitLongTermMath(symbol, history);

  const displayName = await String(symbol).toUpperCase();

  const currentPrice = await getAveragePrice(symbol);
  const currentData = await getDate();


    await history.push({
    role: "system",
    content: str.newline(
      `Trading symbol: ${displayName}`,
      `Current price: ${await formatPrice(symbol, currentPrice)} USD`,
      `Current time: ${currentData.toISOString()}`
    ),
  });
};


export { commitBookDataReport, commitHistorySetup };
