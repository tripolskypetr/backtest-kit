import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * banCriteria (gridAxes, НЕ ось перебора) — какие победители
 * рейтингов формируют ран-левел артефакт авторов.
 *
 * Мир с расхождением победителей: prophet даёт 9 гладких +1%-сделок,
 * coin — 8 размашистых (4 x +5%, 4 x -3%). Ось трека [2, 9]:
 *  - STRICT (track 9): только prophet -> мало PnL, гладко -> sharpe;
 *  - SOFT (track 2): prophet+coin -> больше PnL, волатильно -> pnl.
 * Победители расходятся, и списки авторов у них разные.
 *
 * Проверяется:
 *  1) banCriteria ["sharpe"] — BC-ручка: ран-левел списки РОВНО
 *     равны артефакту sharpe-победителя (coin забанен);
 *  2) banCriteria ["sharpe", "pnl"] (дефолт) — union: coin допущен
 *     pnl-победителем, banned пуст.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / CYCLE);
  const p = m % CYCLE;
  // гладкий всплеск prophet: +1% на фазах 2..61
  if (p >= 2 && p <= 61) return 1010;
  // размашистый всплеск coin: фазы 242..301, чётный цикл +5%, нечётный -3%
  if (p >= 242 && p <= 301) return cycle % 2 === 0 ? 1050 : 970;
  return 1000;
};

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const IDEAS = [
  ...Array.from({ length: 9 }, (_, k) => idea(1 + k, k * CYCLE, "prophet")),
  ...Array.from({ length: 8 }, (_, k) => idea(100 + k, k * CYCLE + 240, "coin")),
];

const AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  minAuthorTrack: [2, 9],
  minAuthorHitRate: [0],
  profitLockPercent: [0],
};

const registerWorld = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
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
};

test("SIM: banCriteria gates the run-level author artifact — sharpe-only vs union with pnl", async ({ pass, fail }) => {
  registerWorld("sim-bancrit-exchange");

  addSimulatorSchema({
    simulatorName: "sim_bancrit_sharpe",
    exchangeName: "sim-bancrit-exchange",
    gridAxes: { ...AXES, banCriteria: ["sharpe"] },
  });
  addSimulatorSchema({
    simulatorName: "sim_bancrit_union",
    exchangeName: "sim-bancrit-exchange",
    gridAxes: { ...AXES, banCriteria: ["sharpe", "pnl"] },
  });
  addSimulatorSchema({
    simulatorName: "sim_bancrit_infinity",
    exchangeName: "sim-bancrit-exchange",
    gridAxes: { ...AXES, banCriteria: ["recovery"] },
  });
  addSimulatorSchema({
    simulatorName: "sim_bancrit_empty",
    exchangeName: "sim-bancrit-exchange",
    gridAxes: { ...AXES, banCriteria: [] },
  });

  const runSharpe = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_bancrit_sharpe", ideas: IDEAS });

  // предусловие мира: победители расходятся — sharpe берёт STRICT
  // (track 9, только prophet), pnl берёт SOFT (track 2, оба)
  const bestSharpe = runSharpe.best.find(({ criterion }) => criterion === "sharpe");
  const bestPnl = runSharpe.best.find(({ criterion }) => criterion === "pnl");
  if (bestSharpe.report.point.minAuthorTrack !== 9 || bestPnl.report.point.minAuthorTrack !== 2) {
    fail(
      `world must split winners: sharpe->track9, pnl->track2; got sharpe->track${bestSharpe.report.point.minAuthorTrack} ` +
      `(sharpe ${bestSharpe.report.sharpe.toFixed(2)} pnl ${bestSharpe.report.totalPnlPercent.toFixed(2)}), ` +
      `pnl->track${bestPnl.report.point.minAuthorTrack} (pnl ${bestPnl.report.totalPnlPercent.toFixed(2)})`
    );
    return;
  }

  // 1) BC-ручка: ран-левел == артефакт sharpe-победителя, coin в бане
  if (
    JSON.stringify([...runSharpe.allowedAuthors].sort()) !== JSON.stringify([...bestSharpe.allowedAuthors].sort()) ||
    JSON.stringify([...runSharpe.bannedAuthors].sort()) !== JSON.stringify([...bestSharpe.bannedAuthors].sort())
  ) {
    fail(
      `banCriteria ["sharpe"] must mirror the sharpe winner artifact, got run=${JSON.stringify(runSharpe.allowedAuthors)}/` +
      `${JSON.stringify(runSharpe.bannedAuthors)} vs best=${JSON.stringify(bestSharpe.allowedAuthors)}/${JSON.stringify(bestSharpe.bannedAuthors)}`
    );
    return;
  }
  if (!runSharpe.allowedAuthors.includes("prophet") || !runSharpe.bannedAuthors.includes("coin")) {
    fail(`sharpe-only artifact must allow prophet and ban coin, got ${JSON.stringify(runSharpe.allowedAuthors)}`);
    return;
  }

  // 2) union с pnl: coin допущен pnl-победителем, бан пуст
  const runUnion = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_bancrit_union", ideas: IDEAS });
  const unionAllowed = [...runUnion.allowedAuthors].sort();
  if (JSON.stringify(unionAllowed) !== JSON.stringify(["coin", "prophet"]) || runUnion.bannedAuthors.length !== 0) {
    fail(
      `banCriteria ["sharpe","pnl"] must union to prophet+coin with empty ban, ` +
      `got ${JSON.stringify(unionAllowed)} / ${JSON.stringify(runUnion.bannedAuthors)}`
    );
    return;
  }

  // 3) Infinity-гард: recovery-победитель здесь — STRICT без единого
  // минуса (dd 0 -> recoveryFactor = Infinity, победа порядком ничьих).
  // Хуй-пойми-какое число — не основание раздавать допуски: allowed
  // пуст, а авторы пула остаются в бане по умолчанию
  const bestRecovery = runSharpe.best.find(({ criterion }) => criterion === "recovery");
  if (bestRecovery.report.maxSeriesDrawdownPercent !== 0 || Number.isFinite(bestRecovery.report.recoveryFactor)) {
    fail(
      `precondition: recovery winner must be the drawdown-free Infinity point, got dd=${bestRecovery.report.maxSeriesDrawdownPercent} ` +
      `recovery=${bestRecovery.report.recoveryFactor}`
    );
    return;
  }
  const runInfinity = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_bancrit_infinity", ideas: IDEAS });
  if (runInfinity.allowedAuthors.length !== 0) {
    fail(`Infinity winner must grant NO allowances, got ${JSON.stringify(runInfinity.allowedAuthors)}`);
    return;
  }
  const bannedByDefault = [...runInfinity.bannedAuthors].sort();
  if (JSON.stringify(bannedByDefault) !== JSON.stringify(["coin", "prophet"])) {
    fail(`Infinity winner's author pool must stay banned by default, got ${JSON.stringify(bannedByDefault)}`);
    return;
  }

  // 4) вырожденный banCriteria []: агрегация без участников — оба
  // списка пусты, прогон жив, per-best артефакты полны как обычно
  const runEmpty = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_bancrit_empty", ideas: IDEAS });
  if (runEmpty.allowedAuthors.length !== 0 || runEmpty.bannedAuthors.length !== 0) {
    fail(`banCriteria [] must yield empty run-level lists, got ${JSON.stringify(runEmpty.allowedAuthors)}/${JSON.stringify(runEmpty.bannedAuthors)}`);
    return;
  }
  if (runEmpty.best.some((b) => b.authorStats.length === 0)) {
    fail(`per-best artifacts must stay complete with banCriteria []`);
    return;
  }

  pass(
    `banCriteria works: winners split (sharpe->strict track9: ${bestSharpe.report.sharpe.toFixed(2)} vs pnl->soft track2: ` +
    `+${bestPnl.report.totalPnlPercent.toFixed(2)}%), ["sharpe"] mirrors the sharpe artifact (coin banned), ` +
    `["sharpe","pnl"] unions coin back in, Infinity recovery winner grants nothing, [] degrades to empty lists`
  );
});
