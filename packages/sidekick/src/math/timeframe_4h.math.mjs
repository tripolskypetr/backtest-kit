import { Cache } from "backtest-kit";

import {
  run,
  File,
  toMarkdown,
  toSignalDto,
  extract,
  dumpPlotData,
} from "@backtest-kit/pinets";

const SIGNAL_SCHEMA = {
  allowLong: "AllowLong",
  allowShort: "AllowShort",
  allowBoth: "AllowBoth",
  noTrades: "NoTrades",
  rsi: "RSI",
  adx: "ADX",
  d_MACDLine: "d_MACDLine",
  d_SignalLine: "d_SignalLine",
  d_MACDHist: "d_MACDHist",
  d_DIPlus: "d_DIPlus",
  d_DIMinus: "d_DIMinus",
  d_StrongTrend: "d_StrongTrend",
};

export const getPlot = Cache.fn(
  async (symbol) =>
    await run(File.fromPath("timeframe_4h.pine"), {
      symbol,
      timeframe: "4h",
      limit: 100,
    }),
  {
    interval: "4h",
    key: ([symbol]) => `${symbol}`,
  },
);

export const getMarkdown = async (signalId, symbol) => {
  const plots = await getPlot(symbol);
  return await toMarkdown(signalId, plots, SIGNAL_SCHEMA);
};

export const getData = async (signalId, symbol) => {
  const plots = await getPlot(symbol);
  return await extract(plots, SIGNAL_SCHEMA);
};

export const dumpPlot = async (signalId, symbol) => {
  const plots = await getPlot(symbol);
  dumpPlotData(signalId, plots, SIGNAL_SCHEMA, "math_4h");
};
