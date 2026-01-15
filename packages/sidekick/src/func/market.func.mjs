import {
  commitFifteenMinuteHistory,
  commitHourHistory,
  commitLongTermMath,
  commitMicroTermMath,
  commitOneMinuteHistory,
  commitShortTermMath,
  commitSwingTermMath,
  commitThirtyMinuteHistory,
} from "@backtest-kit/signals";
import { formatPrice, getAveragePrice, getDate } from "backtest-kit";
import { str } from "functools-kit";

const commitHistorySetup = async (symbol, history) => {
  // Candle histories across timeframes
  {
    await commitOneMinuteHistory(symbol, history);
    await commitFifteenMinuteHistory(symbol, history);
    await commitThirtyMinuteHistory(symbol, history);
    await commitHourHistory(symbol, history);
  }

  // Technical indicators across timeframes
  {
    await commitMicroTermMath(symbol, history);
    await commitShortTermMath(symbol, history);
    await commitSwingTermMath(symbol, history);
    await commitLongTermMath(symbol, history);
  }

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

export { commitHistorySetup };
