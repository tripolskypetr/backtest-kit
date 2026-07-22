import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Ось minAuthorWilson — бан по нижней границе 95%-интервала Вильсона:
 *  1) порог 0 выключает границу полностью: поведение бит-в-бит равно
 *     чистой паре track/hitRate (оба автора допущены);
 *  2) порог 0.6 различает авторов с ОДИНАКОВЫМ наблюдаемым hit rate
 *     100%: новичок 3/3 (LB ~0.44) банится, ветеран 15/15 (LB ~0.80)
 *     проходит — пара такое различить не может в принципе;
 *  3) заморозка (Simulator.test) применяет ту же арифметику к
 *     замороженному треку: новичок банится и out-of-sample.
 * Сверка — независимым зеркалом формулы Вильсона в тесте.
 */

const START = 1704067200000;
const MINUTE = 60_000;
// > окна дедупа 8h: все идеи автора выживают
const SPACING = 500;

const Z = 1.96;
const wilsonLB = (hits, n) => {
  if (!n) return 0;
  const p = hits / n;
  const z2 = Z * Z;
  const center = p + z2 / (2 * n);
  const spread = Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (center - spread) / (1 + z2 / n));
};

// вечный дрейф вверх: каждый полный профиль лонга — hit по close
const rampPrice = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return 1000 * (1 + 1e-6 * Math.max(m, 0));
};

const IDEAS = [];
let nextId = 1;
for (let i = 0; i < 15; i++) {
  IDEAS.push({ id: nextId++, ts: START + i * SPACING * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "veteran" });
}
for (let i = 0; i < 3; i++) {
  IDEAS.push({ id: nextId++, ts: START + (i * SPACING + 100) * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "newbie" });
}

test("SIM: Wilson lower bound bans a 3/3 newcomer where a 15/15 veteran passes", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-wilson-exchange",
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

  const trained = [];
  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_wilson",
    exchangeName: "sim-wilson-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [10],
      minIdeasAligned: [1],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
      profitLockPercent: [0],
      minAuthorWilson: [0, 0.6],
      authorMetric: ["close"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_wilson",
    ideas: IDEAS,
  });

  if (result.profileCount !== 18 || result.truncatedCount !== 0) {
    fail(`expected 18 full profiles, got ${result.profileCount} (truncated ${result.truncatedCount})`);
    return;
  }
  // два уникальных правила бана -> две тренировки
  if (trained.length !== 2 || captured.length !== 2) {
    fail(`expected 2 rules / 2 points, got trained=${trained.length}, points=${captured.length}`);
    return;
  }
  // независимое зеркало: LB(3/3) < 0.6 <= LB(15/15)
  if (!(wilsonLB(3, 3) < 0.6 && wilsonLB(15, 15) >= 0.6)) {
    fail(`test premise broken: LB(3/3)=${wilsonLB(3, 3)}, LB(15/15)=${wilsonLB(15, 15)}`);
    return;
  }

  const byWilson = new Map(
    captured.map((entry) => [entry.report.point.minAuthorWilson, entry]),
  );
  const bannedOf = (stats) =>
    stats.filter(({ banned }) => banned).map(({ author }) => author);

  // порог 0: граница выключена, оба допущены — чистая пара
  const baseline = trained.find((stats) => bannedOf(stats).length === 0);
  if (!baseline) {
    fail(`wilson=0 must allow both authors: ${trained.map((s) => JSON.stringify(bannedOf(s))).join(" vs ")}`);
    return;
  }
  if (byWilson.get(0).trades.length !== 18) {
    fail(`wilson=0 must trade all 18 ideas, got ${byWilson.get(0).trades.length}`);
    return;
  }

  // порог 0.6: новичок 3/3 забанен, ветеран 15/15 допущен
  const strict = trained.find((stats) => bannedOf(stats).length > 0);
  if (!strict || bannedOf(strict).join() !== "newbie") {
    fail(`wilson=0.6 must ban exactly the newbie, got ${strict ? JSON.stringify(bannedOf(strict)) : "no strict rule"}`);
    return;
  }
  const newbieStat = strict.find(({ author }) => author === "newbie");
  const veteranStat = strict.find(({ author }) => author === "veteran");
  if (newbieStat.hitRate !== 1 || veteranStat.hitRate !== 1) {
    fail(`both must observe a 100% hit rate: newbie=${newbieStat.hitRate}, veteran=${veteranStat.hitRate}`);
    return;
  }
  if (byWilson.get(0.6).trades.length !== 15) {
    fail(`wilson=0.6 must trade only the veteran's 15 ideas, got ${byWilson.get(0.6).trades.length}`);
    return;
  }

  // заморозка: та же арифметика по замороженному треку out-of-sample
  const winner = result.best.find(({ criterion }) => criterion === "sharpe");
  const frozenPoint = { ...winner.report.point, minAuthorWilson: 0.6 };
  const oos = await Simulator.test({
    symbol: "TESTUSDT",
    simulatorName: "sim_wilson",
    ideas: IDEAS,
    point: frozenPoint,
    authorStats: strict.map(({ author, ideas, hits }) => ({ author, ideas, hits })),
  });
  if (!oos.allowedAuthors.includes("veteran") || !oos.bannedAuthors.includes("newbie")) {
    fail(`frozen wilson rule mismatch: allowed=${JSON.stringify(oos.allowedAuthors)}, banned=${JSON.stringify(oos.bannedAuthors)}`);
    return;
  }

  pass("wilson 0.6: newbie 3/3 (LB~0.44) banned, veteran 15/15 (LB~0.80) allowed at equal 100% hit rates; wilson 0 = pair baseline; freeze applies the same arithmetic");
});
