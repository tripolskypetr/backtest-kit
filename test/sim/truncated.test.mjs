import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Обрезка горизонта концом данных (truncated):
 *  1) профиль, чей 5-дневный горизонт упирается в конец свечей,
 *     помечается truncated, а его сделка при холде больше остатка
 *     данных закрывается с exitReason = "data_truncated";
 *  2) truncated-профили НЕ считаются доказательством в треке автора:
 *     автор, у которого все идеи обрезаны, имеет 0 подтверждённых
 *     идей и банится как недоказанный — даже если постов много.
 *
 * Мир: дрейф вверх, свечи существуют только до END (дальше пустые
 * чанки). Автор cut: 3 полных идеи + 1 обрезанная -> трек 3, допущен,
 * его обрезанная идея торгуется и режется концом данных. Автор
 * shadow: 3 идеи в самом конце — все обрезаны -> трек 0, бан.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 7220; // > hold 7200: слот всегда свободен к следующей идее
// у 4-й идеи cut остаётся 3030 минут данных. Контракт Exchange строг
// (ровно limit свечей, иначе исключение), поэтому конец истории
// приходит ошибкой на неполном чанке, симулятор гасит её и обрезает
// профиль по границе последнего ПОЛНОГО чанка: 3030 -> 3000 минут.
const END_M = 3 * SPACING + 3031;
const END_TS = START + END_M * MINUTE;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: end-of-data truncation — data_truncated exit and no track credit for unfinished ideas", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-trunc-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        if (timestamp >= END_TS) {
          break; // мир свечей закончился
        }
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        result.push({ timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_trunc",
    exchangeName: "sim-trunc-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [7200],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  const ideas = [
    // cut: 3 полных горизонта + 1 обрезанный
    ...Array.from({ length: 4 }, (_, k) => idea(10 + k, k * SPACING, "LONG", "cut")),
    // shadow: все идеи в последних минутах мира — каждая обрезана
    // (остатки 1990/1509/1028 минут — не кратны чанку)
    ...Array.from({ length: 3 }, (_, k) => idea(20 + k, END_M - 1990 + k * 481, "LONG", "shadow")),
  ];

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_trunc",
    ideas,
  });

  // 4 обрезанных профиля: последняя идея cut + все три shadow
  if (result.profileCount !== 7 || result.truncatedCount !== 4) {
    fail(`expected 7 profiles / 4 truncated, got ${result.profileCount}/${result.truncatedCount}`);
    return;
  }

  const stats = Object.fromEntries(result.authorStats.map((s) => [s.author, s]));
  // cut: только 3 полных идеи в треке (обрезанная — не доказательство)
  if (stats.cut.ideas !== 3 || stats.cut.banned) {
    fail(`cut must have track=3 (truncated idea excluded) and be allowed, got ${JSON.stringify(stats.cut)}`);
    return;
  }
  // shadow: постов 3, доказательств 0 — бан за недоказанность
  if (stats.shadow.ideas !== 0 || !stats.shadow.banned) {
    fail(`shadow must have zero proven ideas and be banned, got ${JSON.stringify(stats.shadow)}`);
    return;
  }

  // сделки: 4 идеи cut торгуются, последняя режется концом данных
  const [{ trades }] = captured;
  if (trades.length !== 4) {
    fail(`expected 4 trades from cut, got ${trades.length}`);
    return;
  }
  const last = trades[trades.length - 1];
  if (last.exitReason !== "data_truncated") {
    fail(`last trade must exit as data_truncated, got ${last.exitReason}`);
    return;
  }
  // 3030 минут остатка обрезаются до последнего полного чанка (3000)
  if (last.holdMinutesActual !== 3000) {
    fail(`truncated trade hold must be the last full chunk boundary 3000m, got ${last.holdMinutesActual}`);
    return;
  }
  for (const trade of trades.slice(0, 3)) {
    if (trade.exitReason !== "time_expired") {
      fail(`full-horizon trades must exit by time, got ${trade.exitReason}`);
      return;
    }
  }

  pass(
    `truncation: 4/7 profiles truncated, cut track=3 allowed (truncated idea uncredited), ` +
    `shadow 0-proof banned, last trade data_truncated at ${last.holdMinutesActual}m`
  );
});
