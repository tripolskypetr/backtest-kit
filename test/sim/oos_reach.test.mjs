import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Out-of-sample с REACH-точкой (прежний OOS-тест ездит на close):
 *  - train: спайкер 5/5 reach-hits (close-метрика дала бы 0/5 —
 *    подтверждается предусловием), точка reach с замком 2.5;
 *  - test: замороженная статистика применяется к reach-точке, hits
 *    теста НЕ пересчитываются (у спайкера в тесте 6 идей — в
 *    замороженных stats остаётся train-цифра 5), невиданный
 *    stranger забанен, все сделки — profit_lock;
 *  - stateless: повторный test() бит-в-бит идентичен первому.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % CYCLE;
  if (p <= 1) return 1000;
  if (p <= 30) return 1000 + (50 * (p - 1)) / 29;
  if (p <= 200) return 1050 - (80 * (p - 30)) / 170;
  return 970;
};

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

test("SIM: out-of-sample with a reach point — frozen reach stats, no recount, stateless repeat", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-oosreach-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addSimulatorSchema({
    simulatorName: "sim_oosreach",
    exchangeName: "sim-oosreach-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      minIdeasAligned: [1],
      minAuthorTrack: [5],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [2.5],
      minAuthorWilson: [0],
      authorMetric: ["reach"],
    },
  });

  // --- train: спайкер, циклы 0..4 ---
  const train = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_oosreach",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, "spiker")),
  });
  const winner = train.best.find(({ criterion }) => criterion === "sharpe");
  const trainStat = winner.authorStats.find(({ author }) => author === "spiker");
  // предусловие: hits посчитаны reach-метрикой (close дал бы 0 —
  // закрытие 5-дневного горизонта у спайкера всегда ниже входа)
  if (!trainStat || trainStat.hits !== 5 || trainStat.banned || winner.report.point.authorMetric !== "reach") {
    fail(`train precondition: spiker must be 5/5 by reach and allowed, got ${JSON.stringify(trainStat)}`);
    return;
  }

  // --- test: циклы 5..10 (6 идей спайкера) + невиданный stranger ---
  const testIdeas = [
    ...Array.from({ length: 6 }, (_, k) => idea(100 + k, (5 + k) * CYCLE, "spiker")),
    ...Array.from({ length: 4 }, (_, k) => idea(200 + k, (5 + k) * CYCLE + 240, "stranger")),
  ];
  const result = await Simulator.test({
    symbol: "TESTUSDT",
    simulatorName: "sim_oosreach",
    ideas: testIdeas,
    point: winner.report.point,
    authorStats: winner.authorStats,
  });

  // сделки: только спайкер, все собраны замком
  if (result.report.trades !== 6 || result.report.exitReasons.profit_lock !== 6) {
    fail(`reach point must harvest 6/6 spiker ideas by profit_lock, got ${JSON.stringify(result.report.exitReasons)}`);
    return;
  }
  // заморозка: train-цифры (5 идей), не тестовые (6); теста-пересчёта нет
  const frozen = result.authorStats.find(({ author }) => author === "spiker");
  if (!frozen || frozen.ideas !== 5 || frozen.hits !== 5) {
    fail(`frozen stats must keep train reach numbers 5/5, got ${JSON.stringify(frozen)}`);
    return;
  }
  if (!result.bannedAuthors.includes("stranger") || result.allowedAuthors.includes("stranger")) {
    fail(`stranger (unseen in train) must be banned, got ${JSON.stringify(result.bannedAuthors)}`);
    return;
  }

  // stateless: повторный вызов бит-в-бит идентичен
  const repeat = await Simulator.test({
    symbol: "TESTUSDT",
    simulatorName: "sim_oosreach",
    ideas: testIdeas,
    point: winner.report.point,
    authorStats: winner.authorStats,
  });
  if (JSON.stringify(repeat) !== JSON.stringify(result)) {
    fail("repeated test() must be bit-identical");
    return;
  }

  pass(
    `oos reach: 6/6 profit_lock trades pnl=${result.report.totalPnlPercent.toFixed(2)}%, ` +
    `frozen 5/5 reach stats intact, stranger banned, repeat bit-identical (${JSON.stringify(result).length} bytes)`
  );
});
