import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Дефолт-бан фильтра авторов: недоказанная правота = бан.
 *
 * Мир с монотонным дрейфом вверх (+1e-4% в минуту): каждая LONG-идея
 * за 5-дневный горизонт закрывается в плюс (hit), каждая SHORT — в
 * минус (miss). Три автора:
 *  - prophet: 4 LONG -> track 4, hitRate 1.0;
 *  - loser:   4 SHORT -> track 4, hitRate 0.0 (хуже монетки -> бан);
 *  - newbie:  2 LONG -> track 2, hitRate 1.0 (недоказан -> бан).
 *
 * Оси правила бана перебираются: minAuthorTrack [3, 5]. На точке
 * track=3 prophet допущен и торгует; на точке track=5 его трек уже
 * недостаточен — сделок ноль. Правило меняет белый список per-point.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481; // за порогом антифлуда

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) {
    return 1000;
  }
  const base = 1000 * (1 + 1e-6 * m);
  // всплеск +1% на минутах 2..61 каждого цикла prophet: его сделки
  // при hold=60 прибыльны, и точка track=3 честно выигрывает Sharpe
  // (иначе Sharpe-победителем была бы пустая точка track=5 с sharpe 0)
  const phase = m % SPACING;
  const cycle = Math.floor(m / SPACING);
  if (cycle < 4 && phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  return base;
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

const makeIdeas = () => [
  // prophet: 4 LONG на старте цикла — вход ловит всплеск
  ...Array.from({ length: 4 }, (_, k) => idea(10 + k, k * SPACING, "LONG", "prophet")),
  // loser: 4 SHORT вне всплеска (фаза 100): вход по базе, горизонт
  // с дрейфом вверх — каждый прогноз мимо
  ...Array.from({ length: 4 }, (_, k) => idea(20 + k, k * SPACING + 100, "SHORT", "loser")),
  // newbie: 2 LONG вне всплеска (фаза 150): правота есть, трека нет
  ...Array.from({ length: 2 }, (_, k) => idea(30 + k, k * SPACING + 150, "LONG", "newbie")),
];

test("SIM: default-ban — unproven and coin-flipping authors are banned, ban rule swings per grid point", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-ban-exchange",
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

  const trained = [];
  const pointReports = [];
  addSimulatorSchema({
    simulatorName: "sim_ban",
    exchangeName: "sim-ban-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [3, 5],
      minAuthorHitRate: [0.5],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats, bannedIdeas) => {
        trained.push({ stats, bannedIdeas });
      },
      onGridPoint: (_symbol, report) => {
        pointReports.push(report);
      },
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_ban",
    ideas: makeIdeas(),
  });

  // обучение фильтра — по разу на уникальную комбинацию правила
  if (trained.length !== 2) {
    fail(`expected 2 filter trainings (track=3, track=5), got ${trained.length}`);
    return;
  }

  // правило track=3: prophet допущен, loser и newbie в бане
  const byAuthor = (stats) => Object.fromEntries(stats.map((s) => [s.author, s]));
  const relaxed = byAuthor(trained[0].stats);
  if (relaxed.prophet.banned || relaxed.prophet.ideas !== 4 || relaxed.prophet.hitRate !== 1) {
    fail(`track=3: prophet must be allowed with 4/4 hits, got ${JSON.stringify(relaxed.prophet)}`);
    return;
  }
  if (!relaxed.loser.banned || relaxed.loser.hitRate !== 0) {
    fail(`track=3: loser (0/4 hits) must be banned, got ${JSON.stringify(relaxed.loser)}`);
    return;
  }
  if (!relaxed.newbie.banned || relaxed.newbie.ideas !== 2) {
    fail(`track=3: newbie (2 ideas) must be banned as unproven, got ${JSON.stringify(relaxed.newbie)}`);
    return;
  }

  // правило track=5: даже prophet недоказан
  const strict = byAuthor(trained[1].stats);
  if (!strict.prophet.banned) {
    fail(`track=5: prophet (4 ideas) must be banned as unproven`);
    return;
  }

  // сделки: точка track=3 торгует только идеи prophet, track=5 — ничего
  const relaxedPoint = pointReports.find(({ point }) => point.minAuthorTrack === 3);
  const strictPoint = pointReports.find(({ point }) => point.minAuthorTrack === 5);
  if (!relaxedPoint || relaxedPoint.trades !== 4) {
    fail(`track=3 point must trade prophet's 4 ideas, got ${relaxedPoint?.trades}`);
    return;
  }
  if (!strictPoint || strictPoint.trades !== 0) {
    fail(`track=5 point must trade nothing, got ${strictPoint?.trades}`);
    return;
  }

  // итоговый белый список — по правилу Sharpe-победителя (track=3)
  if (JSON.stringify(result.allowedAuthors) !== JSON.stringify(["prophet"])) {
    fail(`allowedAuthors must be ["prophet"], got ${JSON.stringify(result.allowedAuthors)}`);
    return;
  }
  if (!result.bannedAuthors.includes("loser") || !result.bannedAuthors.includes("newbie")) {
    fail(`bannedAuthors must include loser and newbie, got ${JSON.stringify(result.bannedAuthors)}`);
    return;
  }

  pass(
    `track=3: prophet allowed (4 trades), loser 0/4 banned, newbie unproven banned; ` +
    `track=5: prophet banned, 0 trades; whitelist=[prophet]`
  );
});
