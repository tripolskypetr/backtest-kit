import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Точная граница занятости слота: busyUntil = exitTimestamp + 1 минута.
 *
 * Сделка идеи A: вход на минуте 1, hold=60 -> выход на минуте 60,
 * слот занят ДО минуты 61 исключительно:
 *  - идея B (публикация м59, вход м60): entry < busyUntil -> поглощена;
 *  - идея C (публикация м60, вход м61): entry == busyUntil -> торгуется.
 *
 * Один off-by-one здесь тихо меняет население сделок всей сетки —
 * граница фиксируется поимённо через absorbedIdeaIds.
 */

const START = 1704067200000;
const MINUTE = 60_000;

test("SIM: slot frees exactly one minute after exit — boundary idea trades, earlier one is absorbed", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-slot-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => ({
        timestamp: alignedSince + i * MINUTE,
        open: 1000,
        high: 1000,
        low: 1000,
        close: 1000,
        volume: 100,
      }));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_slot",
    exchangeName: "sim-slot-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_slot",
    ideas: [
      { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "X" },
      { id: 2, ts: START + 59 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "Y" },
      { id: 3, ts: START + 60 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "Z" },
    ],
  });

  const [{ report, trades }] = captured;

  if (report.trades !== 2 || report.skippedBusy !== 1) {
    fail(`expected 2 trades + 1 absorbed, got ${report.trades}/${report.skippedBusy}`);
    return;
  }
  if (trades[0].ideaId !== 1 || trades[1].ideaId !== 3) {
    fail(`trades must be ideas 1 and 3, got ${trades.map((t) => t.ideaId)}`);
    return;
  }
  // поглощённая — именно идея 2, и приписана сделке A
  if (JSON.stringify(trades[0].absorbedIdeaIds) !== JSON.stringify([2])) {
    fail(`trade A must absorb exactly idea 2, got ${JSON.stringify(trades[0].absorbedIdeaIds)}`);
    return;
  }
  // временнáя арифметика границы: вход C ровно через минуту после выхода A
  const exitA = trades[0].exitTimestamp;
  const entryC = trades[1].entryTimestamp;
  if (entryC !== exitA + MINUTE) {
    fail(`boundary broken: entryC=${entryC} must equal exitA+1m=${exitA + MINUTE}`);
    return;
  }

  pass(`boundary exact: idea@59m absorbed by A, idea@60m entered at exitA+1m`);
});
