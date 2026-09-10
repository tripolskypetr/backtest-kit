import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  toProfitLossDto,
  listenWorstStale,
  listenActivePing,
  getPositionWorstStaleGivebackPnlPercentage,
  getPositionWorstStalePnlPercentage,
  getPositionWorstStaleMinutes,
  getPositionWorstStaleHoldMinutes,
  getPositionWorstStalePeakPnlPercentage,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// _stale — рекорд худшего ПЕРЕЖИТОГО эпизода «пик -> откат» (аналитика для
// калибровки trailingTake / profitLock / holdMinutes / peak-staleness,
// ведётся так же, как maxDrawdown/peakProfit):
//
//   1) «пик -> откат -> добор до TP»: эпизод коммитится в момент
//      восстановления к пику и НЕ перетирается финальным ростом;
//      согласованность: PNL пика/дна == toProfitLossDto по их ценам;
//      точка безубытка обновляется закрытием в плюс;
//   2) SL ПОСЛЕ пережитого отката: worstStale хранит пережитый эпизод (не
//      терминальный обвал — тот описан maxDrawdown/pnl), смертельный пролив
//      остаётся эпизодом-в-полёте в _staleCandidate, а точка безубытка
//      говорит, до какого момента profitLock ещё спасал;
//   3) гейт «эпизод только после реального пика»: монотонный проход к TP и
//      чистый пролив к SL без плюса оставляют нулевой эпизод (у пролива и
//      нулевую точку безубытка);
//   4) live-паритет: коммит происходит на тике восстановления — геттеры
//      getPositionWorstStale* и событие listenWorstStale видят его сразу,
//      а до восстановления откат виден только в _staleCandidate.
// ---------------------------------------------------------------------------

const MIN = 60_000;
const EPS = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < EPS;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * Биржа с плоскими свечами по карте minute -> price (минуты вне карты — basePrice).
 * Плоские свечи (open=high=low=close) делают VWAP равным цене свечи на плато.
 */
const makeFlatExchange = (exchangeName, startTime, basePrice, priceByMinute) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MIN;
        const minute = Math.floor((timestamp - startTime) / MIN);
        const price = priceByMinute(minute);
        candles.push({ timestamp, open: price, high: price, low: price, close: price, volume: 100 });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

const runBacktestScenario = async (name, { basePrice, signal, priceByMinute, frameMinutes = 120 }) => {
  const context = {
    strategyName: `stale-${name}-strategy`,
    exchangeName: `binance-stale-${name}`,
    frameName: `stale-${name}-frame`,
  };
  const startTime = new Date("2024-07-01T00:00:00Z").getTime();

  makeFlatExchange(context.exchangeName, startTime, basePrice, priceByMinute);

  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return signal;
    },
  });

  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date(startTime),
    endDate: new Date(startTime + frameMinutes * MIN),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", context)) {
    if (result.action === "closed") closed.push(result);
  }
  return { closed, startTime };
};

test("STALE: peak -> rollback -> TP commits the survived episode at the recovery moment", async ({ pass, fail }) => {
  const basePrice = 50000;
  const peakPrice = 51500;   // ~ +3% над входом
  const troughPrice = 50050; // откат почти к входу
  const tpPrice = 52000;

  // Плато >= 6 минут: VWAP (5-свечное окно) успевает дойти до уровня плато
  const priceByMinute = (m) => {
    if (m < 5) return basePrice;        // вход и удержание
    if (m < 15) return peakPrice;       // пик (плато)
    if (m < 30) return troughPrice;     // откат (плато) — дно эпизода
    return tpPrice;                     // восстановление (коммит) и добор до TP
  };

  const { closed } = await runBacktestScenario("episode", {
    basePrice,
    signal: {
      position: "long",
      note: "stale episode",
      priceTakeProfit: tpPrice,
      priceStopLoss: basePrice * 0.9,
      minuteEstimatedTime: 120,
      multiplier: 1,
    },
    priceByMinute,
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  const result = closed[0];
  if (result.closeReason !== "take_profit") {
    fail(`expected take_profit close, got "${result.closeReason}"`);
    return;
  }
  const stale = result.signal.worstStale;
  if (!stale) {
    fail("closed signal must carry worstStale");
    return;
  }
  if (!approxEqual(stale.peakPrice, peakPrice)) {
    fail(`episode peak must be recorded at the ${peakPrice} plateau, got ${stale.peakPrice}`);
    return;
  }
  if (!approxEqual(stale.price, troughPrice)) {
    fail(`episode trough must be recorded at the ${troughPrice} plateau, got ${stale.price}`);
    return;
  }
  // Согласованность PNL: значения эпизода == toProfitLossDto по его же ценам
  const expectedPeakPnl = toProfitLossDto(result.signal, stale.peakPrice).pnlPercentage;
  const expectedTroughPnl = toProfitLossDto(result.signal, stale.price).pnlPercentage;
  if (!approxEqual(stale.peakPnlPercentage, expectedPeakPnl)) {
    fail(`episode peak pnl mismatch: expected ${expectedPeakPnl}, got ${stale.peakPnlPercentage}`);
    return;
  }
  if (!approxEqual(stale.pnlPercentage, expectedTroughPnl)) {
    fail(`episode trough pnl mismatch: expected ${expectedTroughPnl}, got ${stale.pnlPercentage}`);
    return;
  }
  if (stale.peakPnlPercentage <= 0) {
    fail(`episode peak pnl must be positive, got ${stale.peakPnlPercentage}`);
    return;
  }
  if (!(stale.peakTimestamp < stale.timestamp)) {
    fail(`episode peak must precede the trough: ${stale.peakTimestamp} vs ${stale.timestamp}`);
    return;
  }
  const giveback = stale.peakPnlPercentage - stale.pnlPercentage;
  if (giveback <= 0) {
    fail(`episode giveback must be positive, got ${giveback}`);
    return;
  }
  // Точка безубытка: TP-закрытие в плюс — последний безубыточный момент сделки
  if (stale.breakevenTimestamp !== result.closeTimestamp) {
    fail(`breakeven point must be refreshed by the profitable close: ${stale.breakevenTimestamp} vs ${result.closeTimestamp}`);
    return;
  }

  pass(`survived episode committed: peak ${stale.peakPnlPercentage.toFixed(4)}% @ ${stale.peakPrice} -> trough ${stale.pnlPercentage.toFixed(4)}% @ ${stale.price}, giveback ${giveback.toFixed(4)}%, breakeven refreshed at close`);
});

test("STALE: SL after a survived rollback keeps the episode informative — fatal dive stays in candidate/maxDrawdown", async ({ pass, fail }) => {
  const basePrice = 50000;
  const peakPrice = 51500;     // пик первого (пережитого) отката
  const troughPrice = 50050;   // дно первого отката
  const recoveryPrice = 51600; // восстановление выше пика -> коммит эпизода
  const preDivePrice = 49500;  // незакоммиченный откат перед смертью
  const priceStopLoss = 49000;

  const priceByMinute = (m) => {
    if (m < 5) return basePrice;
    if (m < 15) return peakPrice;      // пик
    if (m < 30) return troughPrice;    // пережитый откат
    if (m < 45) return recoveryPrice;  // восстановление (коммит эпизода)
    if (m < 50) return preDivePrice;   // новый откат (кандидат), SL ещё не тронут
    return priceStopLoss - 50;         // смертельный пролив сквозь SL
  };

  const { closed } = await runBacktestScenario("sl-informative", {
    basePrice,
    signal: {
      position: "long",
      note: "stale sl informative",
      priceTakeProfit: basePrice * 1.2,
      priceStopLoss,
      minuteEstimatedTime: 120,
      multiplier: 1,
    },
    priceByMinute,
  });

  if (closed.length !== 1) {
    fail(`expected exactly 1 closed trade, got ${closed.length}`);
    return;
  }
  const result = closed[0];
  if (result.closeReason !== "stop_loss") {
    fail(`expected stop_loss close, got "${result.closeReason}"`);
    return;
  }
  if (!approxEqual(result.currentPrice, priceStopLoss)) {
    fail(`stop must close at the exact SL price ${priceStopLoss}, got ${result.currentPrice}`);
    return;
  }
  const stale = result.signal.worstStale;
  // worstStale = ПЕРЕЖИТЫЙ эпизод, а не терминальный обвал
  if (!approxEqual(stale.peakPrice, peakPrice)) {
    fail(`episode peak must stay at the survived rollback's peak ${peakPrice}, got ${stale.peakPrice}`);
    return;
  }
  if (!approxEqual(stale.price, troughPrice)) {
    fail(`episode trough must stay at the survived rollback's trough ${troughPrice}, got ${stale.price}`);
    return;
  }
  if (approxEqual(stale.price, priceStopLoss)) {
    fail("episode trough must NOT be the SL close price — the terminal collapse belongs to maxDrawdown");
    return;
  }
  // Терминальный обвал описан maxDrawdown (финальная точка закрытия)
  if (!approxEqual(result.signal.maxDrawdown.pnlPercentage, result.pnl.pnlPercentage)) {
    fail(`maxDrawdown must carry the terminal collapse ${result.pnl.pnlPercentage}, got ${result.signal.maxDrawdown.pnlPercentage}`);
    return;
  }
  // Смертельный пролив остался эпизодом-в-полёте: кандидат с пиком восстановления
  const candidate = result.signal._staleCandidate;
  if (!candidate) {
    fail("the fatal dive must remain in _staleCandidate (episode-in-flight, not survived)");
    return;
  }
  if (!approxEqual(candidate.peakPrice, recoveryPrice)) {
    fail(`candidate peak must be the recovery plateau ${recoveryPrice}, got ${candidate.peakPrice}`);
    return;
  }
  if (!approxEqual(candidate.price, preDivePrice)) {
    fail(`candidate trough must freeze at the last monitored plateau ${preDivePrice}, got ${candidate.price}`);
    return;
  }
  // Точка безубытка: последний момент PNL >= 0 — на пути вниз, до закрытия
  if (!(stale.breakevenTimestamp > 0)) {
    fail("breakeven point must be recorded (the position was in profit)");
    return;
  }
  if (!(stale.breakevenTimestamp < result.closeTimestamp)) {
    fail(`breakeven point must precede the losing close: ${stale.breakevenTimestamp} vs ${result.closeTimestamp}`);
    return;
  }
  if (!(stale.breakevenPrice > basePrice)) {
    fail(`breakeven price must sit above the entry (costs included), got ${stale.breakevenPrice}`);
    return;
  }

  pass(`SL stays informative: survived episode peak ${stale.peakPnlPercentage.toFixed(4)}% -> trough ${stale.pnlPercentage.toFixed(4)}%, fatal dive in candidate (peak @ ${candidate.peakPrice}, frozen @ ${candidate.price}), breakeven at ${new Date(stale.breakevenTimestamp).toISOString()}`);
});

test("STALE: no real peak means a zero episode — monotonic TP run and a straight dive to SL", async ({ pass, fail }) => {
  const basePrice = 50000;

  // Кейс A: монотонный проход к TP — откатов нет, эпизод нулевой,
  // точка безубытка обновлена закрытием в плюс
  const tpRun = await runBacktestScenario("monotonic", {
    basePrice,
    signal: {
      position: "long",
      note: "stale monotonic",
      priceTakeProfit: basePrice * 1.04,
      priceStopLoss: basePrice * 0.9,
      minuteEstimatedTime: 120,
      multiplier: 1,
    },
    priceByMinute: (m) => basePrice * (1 + Math.min(m, 40) * 0.002),
  });
  if (tpRun.closed.length !== 1 || tpRun.closed[0].closeReason !== "take_profit") {
    fail(`monotonic run: expected a take_profit close, got ${tpRun.closed[0]?.closeReason}`);
    return;
  }
  {
    const stale = tpRun.closed[0].signal.worstStale;
    const giveback = stale.peakPnlPercentage - stale.pnlPercentage;
    if (!approxEqual(giveback, 0)) {
      fail(`monotonic run must keep a zero-giveback episode, got ${giveback}`);
      return;
    }
    if (!(stale.breakevenTimestamp > 0)) {
      fail("monotonic run must record the breakeven point (closed in profit)");
      return;
    }
  }

  // Кейс B: чистый пролив к SL без плюса — эпизод нулевой (гейт «только
  // после реального пика»), точка безубытка нулевая (PNL никогда >= 0),
  // просадка при этом глубокая
  const slRun = await runBacktestScenario("dive", {
    basePrice,
    signal: {
      position: "long",
      note: "stale dive",
      priceTakeProfit: basePrice * 1.2,
      priceStopLoss: basePrice * 0.98,
      minuteEstimatedTime: 120,
      multiplier: 1,
    },
    priceByMinute: (m) => (m < 5 ? basePrice : basePrice * 0.975),
  });
  if (slRun.closed.length !== 1 || slRun.closed[0].closeReason !== "stop_loss") {
    fail(`dive run: expected a stop_loss close, got ${slRun.closed[0]?.closeReason}`);
    return;
  }
  {
    const stale = slRun.closed[0].signal.worstStale;
    if (!approxEqual(stale.peakPnlPercentage, 0) || !approxEqual(stale.pnlPercentage, 0)) {
      fail(`dive run must keep the zero episode (no real peak), got peak ${stale.peakPnlPercentage} / trough ${stale.pnlPercentage}`);
      return;
    }
    if (stale.breakevenTimestamp !== 0 || stale.breakevenPrice !== 0) {
      fail(`dive run must keep the zero breakeven point (PNL never >= 0), got ${stale.breakevenPrice} @ ${stale.breakevenTimestamp}`);
      return;
    }
    if (slRun.closed[0].signal.maxDrawdown.pnlPercentage >= 0) {
      fail(`sanity: dive run must still record a negative maxDrawdown, got ${slRun.closed[0].signal.maxDrawdown.pnlPercentage}`);
      return;
    }
  }

  pass("zero episode preserved: monotonic TP run has zero giveback with a breakeven point; a straight dive keeps zero episode and zero breakeven while maxDrawdown goes negative");
});

test("STALE: live tick commits on recovery — getters and listenWorstStale see the episode", async ({ pass, fail }) => {
  const basePrice = 50000;
  const peakPrice = 51500;
  const troughPrice = 50100;
  const recoveryPrice = 52000;
  const t0 = new Date("2024-07-02T00:00:00Z").getTime();
  const context = {
    strategyName: "stale-live-strategy",
    exchangeName: "binance-stale-live",
    frameName: "",
  };

  // Все свечи ответа держат текущее плато — VWAP равен плато на каждом тике
  let plateau = basePrice;
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: plateau, high: plateau, low: plateau, close: plateau, volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "stale live",
        priceTakeProfit: basePrice * 1.2,
        priceStopLoss: basePrice * 0.9,
        minuteEstimatedTime: 60,
        multiplier: 1,
      };
    },
  });

  const worstStaleEvents = [];
  const unsubscribe = listenWorstStale((event) => {
    if (event.strategyName === context.strategyName) {
      worstStaleEvents.push(event);
    }
  });

  // Геттеры getPositionWorstStale* читаются из лайфцикла позиции (execution
  // context) — как в example/content/jan_2026.strategy: внутри listenActivePing
  const gettersBySample = [];
  const unsubscribePing = listenActivePing(async ({ symbol, strategyName }) => {
    if (strategyName !== context.strategyName) return;
    gettersBySample.push({
      giveback: await getPositionWorstStaleGivebackPnlPercentage(symbol),
      trough: await getPositionWorstStalePnlPercentage(symbol),
      staleMinutes: await getPositionWorstStaleMinutes(symbol),
      holdMinutes: await getPositionWorstStaleHoldMinutes(symbol),
      peakPnl: await getPositionWorstStalePeakPnlPercentage(symbol),
    });
  });

  const runTick = (when) =>
    MethodContextService.runInContext(
      async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
      context,
    );

  try {
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened", got "${tick1.action}"`);
      return;
    }

    plateau = peakPrice;
    const tick2 = await runTick(new Date(t0 + 10 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 (peak plateau) expected "active", got "${tick2.action}"`);
      return;
    }

    plateau = troughPrice;
    const tick3 = await runTick(new Date(t0 + 25 * MIN));
    if (tick3.action !== "active") {
      fail(`tick #3 (rollback plateau) expected "active", got "${tick3.action}"`);
      return;
    }
    // Откат в полёте: коммита ещё нет, но кандидат уже виден в снапшоте тика
    if (!tick3.signal._staleCandidate) {
      fail("tick #3 must carry the episode-in-flight in _staleCandidate");
      return;
    }
    if (worstStaleEvents.length !== 0) {
      fail(`listenWorstStale must NOT fire before the recovery, got ${worstStaleEvents.length} event(s)`);
      return;
    }

    plateau = recoveryPrice;
    const tick4 = await runTick(new Date(t0 + 40 * MIN));
    if (tick4.action !== "active") {
      fail(`tick #4 (recovery plateau) expected "active", got "${tick4.action}"`);
      return;
    }

    if (gettersBySample.length < 3) {
      fail(`expected getter samples from 3 active pings, got ${gettersBySample.length}`);
      return;
    }
    const atPeak = gettersBySample[gettersBySample.length - 3];
    const atTrough = gettersBySample[gettersBySample.length - 2];
    const atRecovery = gettersBySample[gettersBySample.length - 1];
    if (!approxEqual(atPeak.giveback, 0)) {
      fail(`giveback at the fresh peak must be 0, got ${atPeak.giveback}`);
      return;
    }
    if (!approxEqual(atTrough.giveback, 0)) {
      fail(`giveback mid-rollback must still be 0 (not committed yet), got ${atTrough.giveback}`);
      return;
    }
    if (!(atRecovery.giveback > 0)) {
      fail(`giveback after the recovery commit must be positive, got ${atRecovery.giveback}`);
      return;
    }
    if (!(atRecovery.peakPnl > 0)) {
      fail(`episode peak pnl must be positive, got ${atRecovery.peakPnl}`);
      return;
    }
    if (atRecovery.staleMinutes !== 15) {
      fail(`staleness minutes must be 15 (peak tick -> trough tick), got ${atRecovery.staleMinutes}`);
      return;
    }
    if (atRecovery.holdMinutes !== 10) {
      fail(`hold minutes must be 10 (open -> peak tick), got ${atRecovery.holdMinutes}`);
      return;
    }
    if (worstStaleEvents.length !== 1) {
      fail(`listenWorstStale must fire exactly once at the recovery commit, got ${worstStaleEvents.length}`);
      return;
    }
    const event = worstStaleEvents[0];
    if (!approxEqual(event.signal.worstStale.price, troughPrice)) {
      fail(`worst-stale event must carry the trough price ${troughPrice}, got ${event.signal.worstStale.price}`);
      return;
    }

    pass(`live commit-on-recovery verified: giveback ${atRecovery.giveback.toFixed(4)}%, trough ${atRecovery.trough.toFixed(4)}%, stale 15m, hold 10m, single event at the recovery tick`);
  } finally {
    unsubscribe && unsubscribe();
    unsubscribePing && unsubscribePing();
    await MethodContextService.runInContext(
      async () => await lib.strategyConnectionService.clear({ symbol: "BTCUSDT", ...context, backtest: false }),
      context,
    );
  }
});
