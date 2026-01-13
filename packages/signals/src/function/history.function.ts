import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache } from "backtest-kit";

const fetchHourHistory = Cache.fn(lib.hourCandleHistoryService.getReport, {
  interval: "30m",
});

const fetchThirtyMinuteHistory = Cache.fn(
  lib.thirtyMinuteCandleHistoryService.getReport,
  {
    interval: "15m",
  }
);

const fetchFifteenMinuteHistory = Cache.fn(
  lib.fifteenMinuteCandleHistoryService.getReport,
  {
    interval: "5m",
  }
);

const fetchOneMinuteHistory = Cache.fn(
  lib.oneMinuteCandleHistoryService.getReport,
  {
    interval: "1m",
  }
);

const commitHourHistory = trycatch(
  async (symbol: string, history: History) => {
    const hourHistory = await fetchHourHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== HOURLY CANDLES HISTORY (LAST 6) ===",
          "",
          hourHistory
        ),
      },
      {
        role: "assistant",
        content: "Hourly candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchHourHistory),
  }
);

const commitThirtyMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const thirtyMinuteHistory = await fetchThirtyMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 30-MIN CANDLES HISTORY (LAST 6) ===",
          "",
          thirtyMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "30-min candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchThirtyMinuteHistory),
  }
);

const commitFifteenMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const fifteenMinuteHistory = await fetchFifteenMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 15-MINUTE CANDLES HISTORY (LAST 8) ===",
          "",
          fifteenMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "15-minute candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchFifteenMinuteHistory),
  }
);

const commitOneMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const oneMinuteHistory = await fetchOneMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== ONE-MINUTE CANDLES HISTORY (LAST 15) ===",
          "",
          oneMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "One-minute candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchOneMinuteHistory),
  }
);

export {
  commitFifteenMinuteHistory,
  commitHourHistory,
  commitOneMinuteHistory,
  commitThirtyMinuteHistory,
};
