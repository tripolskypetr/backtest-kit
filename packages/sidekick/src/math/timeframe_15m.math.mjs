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
  position: "Signal",
  priceOpen: "Close",
  priceTakeProfit: "TakeProfit",
  priceStopLoss: "StopLoss",
  minuteEstimatedTime: "EstimatedTime",
  d_RSI: "d_RSI",
  d_EmaFast: "d_EmaFast",
  d_EmaSlow: "d_EmaSlow",
  d_EmaTrend: "d_EmaTrend",
  d_ATR: "d_ATR",
  d_Volume: "d_Volume",
  d_VolMA: "d_VolMA",
  d_VolSpike: "d_VolSpike",
  d_Mom: "d_Mom",
  d_MomUp: "d_MomUp",
  d_MomDown: "d_MomDown",
  d_TrendUp: "d_TrendUp",
  d_TrendDown: "d_TrendDown",
  d_LongCond: "d_LongCond",
  d_ShortCond: "d_ShortCond",
  d_BarsSinceSignal: "d_BarsSinceSignal",
};

export const getPlot = Cache.fn(
  async (symbol) =>
    await run(File.fromPath("timeframe_15m.pine"), {
      symbol,
      timeframe: "15m",
      limit: 100,
    }),
  {
    interval: "15m",
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

export const getSignal = async (signalId, symbol) => {
  const plots = await getPlot(symbol);
  const result = await extract(plots, SIGNAL_SCHEMA);
  return toSignalDto(signalId, result, null);
};

export const dumpPlot = async (signalId, symbol) => {
  const plots = await getPlot(symbol);
  dumpPlotData(signalId, plots, SIGNAL_SCHEMA, "math_15m");
};
