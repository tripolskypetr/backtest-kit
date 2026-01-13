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
          "=== ИСТОРИЧЕСКИЕ ДАННЫЕ 1-МИНУТНЫХ СВЕЧЕЙ ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "Исторические данные 1-минутных свечей получены.",
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
          "=== ИСТОРИЧЕСКИЕ ДАННЫЕ 1-ЧАСОВЫХ СВЕЧЕЙ ===",
          "",
          longTermMath
        ),
      },
      {
        role: "assistant",
        content: "Исторические данные 1-часовых свечей получены.",
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
          "=== ИСТОРИЧЕСКИЕ ДАННЫЕ 15-МИНУТНЫХ СВЕЧЕЙ ===",
          "",
          shortTermMath
        ),
      },
      {
        role: "assistant",
        content: "Исторические данные 15-минутных свечей получены.",
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
          "=== ИСТОРИЧЕСКИЕ ДАННЫЕ 30-МИНУТНЫХ СВЕЧЕЙ ===",
          "",
          swingTermMath
        ),
      },
      {
        role: "assistant",
        content: "Исторические данные 30-минутных свечей получены.",
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
