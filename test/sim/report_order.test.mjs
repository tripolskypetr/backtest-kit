import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Порядок result.reports — контракт потребителя run() (reportOrder):
 *  1) reportOrder: "pnl" отдаёт reports по убыванию totalPnlPercent;
 *  2) дефолт (поле не задано) — прежний порядок по sharpe;
 *  3) сортировка не падает и не рвёт массив на Infinity-значениях
 *     (sortino серий без убыточных дней) — защищённый компаратор.
 */

const START = 1704067200000;
const MINUTE = 60_000;

// вечный дрейф вверх: длиннее холд = больше PnL, убыточных дней нет.
// Наклон 0.01%/мин: даже часовой холд (+0.6% гросс) отбивает
// издержки (~0.4%), все точки прибыльны -> sortino = inf у всех
const rampPrice = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return 1000 * (1 + 1e-4 * Math.max(m, 0));
};

const registerExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = rampPrice(timestamp);
        const close = rampPrice(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

const AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  // три холда = три точки с разным PnL в дрейф-мире
  holdMinutes: [60, 600, 3000],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  profitLockPercent: [0],
  authorMetric: ["close"],
};

const IDEAS = [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" }];

const isSortedDesc = (values) =>
  values.every((value, index) => index === 0 || values[index - 1] >= value);

test("SIM: reportOrder orders result.reports by the declared criterion, default stays sharpe", async ({ pass, fail }) => {
  registerExchange("sim-order-exchange");

  addSimulatorSchema({
    simulatorName: "sim_order_pnl",
    exchangeName: "sim-order-exchange",
    gridAxes: AXES,
    reportOrder: "pnl",
  });
  addSimulatorSchema({
    simulatorName: "sim_order_default",
    exchangeName: "sim-order-exchange",
    gridAxes: AXES,
  });

  const byPnl = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_order_pnl", ideas: IDEAS });
  if (Object.values(byPnl.reports).flat().length !== 3) {
    fail(`expected 3 reports, got ${Object.values(byPnl.reports).flat().length}`);
    return;
  }
  const pnls = Object.values(byPnl.reports).flat().map(({ totalPnlPercent }) => totalPnlPercent);
  if (!isSortedDesc(pnls)) {
    fail(`reportOrder "pnl" must sort by totalPnlPercent desc, got ${JSON.stringify(pnls)}`);
    return;
  }
  // в дрейф-мире PnL растёт с холдом, а sharpe у самой прибыльной
  // точки НЕ максимален (одна жирная сделка = высокая дисперсия
  // суточных приращений) — порядки различимы
  if (Object.values(byPnl.reports).flat()[0].point.holdMinutes !== 3000) {
    fail(`pnl leader must be the longest hold, got ${Object.values(byPnl.reports).flat()[0].point.holdMinutes}`);
    return;
  }
  // Infinity-устойчивость: в мире без убыточных дней sortino = inf,
  // защищённый компаратор не рвёт сортировку (длина и состав целы)
  if (!Object.values(byPnl.reports).flat().every(({ sortino }) => sortino === Infinity)) {
    fail(`ramp world must yield infinite sortino everywhere`);
    return;
  }

  const byDefault = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_order_default", ideas: IDEAS });
  const sharpes = Object.values(byDefault.reports).flat().map(({ sharpe }) => sharpe);
  if (!isSortedDesc(sharpes)) {
    fail(`default must keep sharpe desc, got ${JSON.stringify(sharpes)}`);
    return;
  }

  pass(`reportOrder pnl: ${pnls.map((v) => v.toFixed(2)).join(" >= ")}; default sharpe: ${sharpes.map((v) => v.toFixed(2)).join(" >= ")}; sortino=inf handled`);
});
