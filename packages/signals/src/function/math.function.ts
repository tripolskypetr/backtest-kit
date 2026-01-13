import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache } from "backtest-kit";

const fetchMicroTermMath = Cache.fn(lib.microTermMathService.getReport, {
  interval: "1m",
});

const fetchShortTermMath = Cache.fn(lib.shortTermMathService.getReport, {
  interval: "5m",
});

const fetchSwingTermMath = Cache.fn(lib.swingTermMathService.getReport, {
  interval: "15m",
});

const fetchLongTermMath = Cache.fn(lib.longTermMathService.getReport, {
  interval: "30m",
});

const commitMicroTermMath = trycatch(
  async (symbol: string, history: History) => {
    const microTermMath = await fetchMicroTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 1-MINUTE CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "1-minute candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchMicroTermMath),
  }
);

const commitLongTermMath = trycatch(
  async (symbol: string, history: History) => {
    const longTermMath = await fetchLongTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 1-HOUR CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          longTermMath
        ),
      },
      {
        role: "assistant",
        content: "1-hour candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchLongTermMath),
  }
);

const commitShortTermMath = trycatch(
  async (symbol: string, history: History) => {
    const shortTermMath = await fetchShortTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 15-MINUTE CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          shortTermMath
        ),
      },
      {
        role: "assistant",
        content: "15-minute candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchShortTermMath),
  }
);

const commitSwingTermMath = trycatch(
  async (symbol: string, history: History) => {
    const swingTermMath = await fetchSwingTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 30-MIN CANDLES ANALYSIS (HISTORICAL DATA) ===",
          "",
          swingTermMath
        ),
      },
      {
        role: "assistant",
        content: "30-min candles analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchSwingTermMath),
  }
);

export {
  commitLongTermMath,
  commitMicroTermMath,
  commitShortTermMath,
  commitSwingTermMath,
};
