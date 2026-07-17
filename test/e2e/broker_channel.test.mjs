import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  commitCreateSignal,
  getStrategyStatus,
  runInMockContext,
  Backtest,
  Broker,
  OrderRejectedError,
  OrderTransientError,
  lib,
  MethodContextService,
} from "../../build/index.mjs";

// Контракт самого Broker-канала (прокси/подписка), а не логика ретраев:
// - хуки объявлены Promise<void>: общение ТОЛЬКО через throw, return игнорируется
//   (футган для мигрирующих с action-канала, где `return false` = отказ);
// - частичный адаптер: отсутствующий хук = warn + skip = confirm (НЕ transient);
// - enable() идемпотентен (singleshot), без адаптера кидает сразу, disable()
//   реально отписывает и возвращает гейты к default-confirm;
// - waitForInit ленивый singleshot: завершается ДО первого хук-вызова, ровно 1 раз;
//   orphan sweep из waitForInit может усыновить биржевую позицию (commitCreateSignal);
// - полнота маппинга payload'ов enable() для всех 4 хуков;
// - backtest-тишина: event.backtest short-circuit'ится ДО syncSubject — адаптер нем.

const MIN = 60_000;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

const makeExchange = (exchangeName, getPrice) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < limit; i++) {
        const price = getPrice();
        candles.push({
          timestamp: alignedSince + i * MIN,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 100,
        });
      }
      return candles;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

const makeRunTick = (context) => (when) =>
  MethodContextService.runInContext(
    async () => await lib.strategyCoreService.tick("BTCUSDT", when, false, context),
    context,
  );

const inMock = (fn, whenMs, context) =>
  runInMockContext(fn, {
    when: new Date(whenMs),
    strategyName: context.strategyName,
    exchangeName: context.exchangeName,
    frameName: context.frameName,
    symbol: "BTCUSDT",
    backtest: false,
  });

const BASE_PRICE = 50000;

const makeStrategy = (context, { minuteEstimatedTime, once }) => {
  let issued = false;
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (once && issued) return null;
      issued = true;
      return {
        position: "long",
        note: "broker channel",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime,
      };
    },
  });
};

/**
 * CHANNEL: контракт хуков — Promise<void>. `return false` НЕ отказ: возврат
 * игнорируется, событие подтверждается. Отказ выражается ТОЛЬКО throw'ом
 * (в отличие от action-канала, где false = transient).
 */
test("CHANNEL: hook return values are ignored — `return false` still confirms (void contract)", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-void-strategy",
    exchangeName: "binance-ch-void",
    frameName: "",
  };

  let openCalls = 0;
  let closeCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 1, once: true });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async () => {
      openCalls += 1;
      return false; // мигрант с action-канала ожидает отказ — но контракт void
    },
    onOrderCloseCommit: async () => {
      closeCalls += 1;
      return false;
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened" (return value ignored, confirm), got "${tick1.action}"`);
      return;
    }
    if (openCalls !== 1) {
      fail(`expected exactly 1 open call (no retry armed by the ignored return), got ${openCalls}`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 2 * MIN));
    if (tick2.action !== "closed" || tick2.closeReason !== "time_expired") {
      fail(`tick #2 expected closed/time_expired (return value ignored, confirm), got "${tick2.action}"/"${tick2.closeReason}"`);
      return;
    }
    if (closeCalls !== 1) {
      fail(`expected exactly 1 close call (no retry armed by the ignored return), got ${closeCalls}`);
      return;
    }

    pass(`\`return false\` from both gates was ignored: opened and closed on first attempts (void contract)`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: частичный адаптер — отсутствующие хуки пропускаются с warn и
 * СЧИТАЮТСЯ подтверждением (не transient): открытие и чеки проходят, реализованный
 * onOrderCloseCommit вызывается штатно с attempt 0.
 */
test("CHANNEL: a partial adapter defaults missing hooks to confirm", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-partial-strategy",
    exchangeName: "binance-ch-partial",
    frameName: "",
  };

  const closes = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 2, once: true });

  // ТОЛЬКО close-хук: open/check отсутствуют и обязаны дефолтиться в confirm
  Broker.useBrokerAdapter({
    onOrderCloseCommit: async (payload) => {
      closes.push({ id: payload.signalId, attempt: payload.attempt });
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "opened") {
      fail(`tick #1 expected "opened" (missing onOrderOpenCommit = confirm), got "${tick1.action}"`);
      return;
    }

    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "active") {
      fail(`tick #2 expected "active" (missing onOrderActiveCheck = confirm), got "${tick2.action}"`);
      return;
    }

    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick3.action !== "closed" || tick3.closeReason !== "time_expired") {
      fail(`tick #3 expected closed/time_expired, got "${tick3.action}"/"${tick3.closeReason}"`);
      return;
    }
    if (closes.length !== 1 || closes[0].attempt !== 0 || closes[0].id !== tick1.signal.id) {
      fail(`the implemented close hook must fire once with attempt 0 for the opened id, got ${JSON.stringify(closes)}`);
      return;
    }

    pass(`partial adapter: missing open/check hooks confirmed silently, close hook fired (attempt 0)`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: enable() идемпотентен (singleshot — двойной вызов не дублирует
 * доставку), а disable() реально отписывает: события больше не доходят до
 * адаптера и гейты возвращаются к default-confirm.
 */
test("CHANNEL: enable is idempotent and disable truly unsubscribes", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-lifecycle-strategy",
    exchangeName: "binance-ch-lifecycle",
    frameName: "",
  };

  let openCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 120, once: false });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async () => {
      openCalls += 1;
      throw new OrderTransientError("ch-lifecycle: adapter rejects while subscribed");
    },
  });
  Broker.enable();
  Broker.enable(); // повторный вызов НЕ должен создать вторую подписку

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (adapter rejected), got "${tick1.action}"`);
      return;
    }
    if (openCalls !== 1) {
      fail(`double enable() must NOT double-deliver: expected 1 hook call, got ${openCalls}`);
      return;
    }

    Broker.disable();

    // Адаптер отписан: ретрай того же id проходит default-confirm, хук молчит
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 after disable expected "opened" (gate back to default-confirm), got "${tick2.action}"`);
      return;
    }
    if (openCalls !== 1) {
      fail(`disabled adapter must not receive events, got ${openCalls} calls`);
      return;
    }

    pass(`double enable delivered once; after disable the adapter went silent and the gate confirmed`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: enable() без зарегистрированного адаптера кидает сразу (и очищает
 * singleshot — повторный вызов кидает снова, а не возвращает кэш).
 */
test("CHANNEL: enable without a registered adapter throws immediately", async ({ pass, fail }) => {
  let firstError = null;
  let secondError = null;

  try {
    Broker.enable();
  } catch (error) {
    firstError = error;
  }
  try {
    Broker.enable();
  } catch (error) {
    secondError = error;
  }

  if (!firstError) {
    fail(`enable() without an adapter must throw immediately`);
    return;
  }
  if (!secondError) {
    fail(`repeated enable() without an adapter must throw again (singleshot cleared on failure)`);
    return;
  }

  pass(`enable() without an adapter threw both times: "${firstError.message}"`);
});

/**
 * CHANNEL: waitForInit — ленивый singleshot: завершается ДО первого хук-вызова
 * (медленная инициализация не даёт гейту стартовать раньше) и вызывается ровно
 * один раз на всю жизнь адаптера.
 */
test("CHANNEL: waitForInit completes before the first hook call and runs exactly once", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-init-strategy",
    exchangeName: "binance-ch-init",
    frameName: "",
  };

  let initCalls = 0;
  let initDone = false;
  const hookSawInit = [];

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 2, once: true });

  Broker.useBrokerAdapter({
    waitForInit: async () => {
      initCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      initDone = true;
    },
    onOrderOpenCommit: async () => { hookSawInit.push(initDone); },
    onOrderActiveCheck: async () => { hookSawInit.push(initDone); },
    onOrderCloseCommit: async () => { hookSawInit.push(initDone); },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 3 * MIN));

    if (tick1.action !== "opened" || tick2.action !== "active" || tick3.action !== "closed") {
      fail(`expected opened, active, closed — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }
    if (hookSawInit.length < 3 || !hookSawInit.every(Boolean)) {
      fail(`every hook call must observe a COMPLETED waitForInit, got [${hookSawInit.join(",")}]`);
      return;
    }
    if (initCalls !== 1) {
      fail(`waitForInit must run exactly once (singleshot), got ${initCalls} calls`);
      return;
    }

    pass(`slow waitForInit finished before the first of ${hookSawInit.length} hook calls and ran once`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: ORPHAN SWEEP из waitForInit — усыновление биржевой позиции на
 * BOOTSTRAP'е: движок стартует idle (getSignal=null), первый idle-пинг лениво
 * триггерит waitForInit, sweep сверяет getStrategyStatus (движок чист) и
 * подсовывает усыновляющий DTO через commitCreateSignal; следующий tick
 * открывает позицию с БИРЖЕВЫМ id, open-гейт реконсилирует (attempt 0, confirm).
 *
 * ДВА НЮАНСА (проверены отдельными попытками):
 * 1. waitForInit ленивый — если стратегия гонит сигнал первым же tick'ом, он
 *    бежит ВНУТРИ open-гейта с уже pre-arm'ленным слотом, и createSignal кидает
 *    "a rejected open is awaiting retry".
 * 2. idle-тик ≠ пустой движок: RETURN_IDLE_FN (единственный эмиттер
 *    idlePingSubject) вызывается и из окон отказов — отвергнутый open (слот
 *    взведён) и отвергнутый user-close drain (позиция ЖИВА) тоже возвращают
 *    idle. Поэтому канонический sweep обязан сверяться с getStrategyStatus
 *    (pendingSignalId / retryOpenSignal / closedSignal), а не полагаться на
 *    сам факт idle-пинга — что адаптер этого теста и делает.
 */
test("CHANNEL: waitForInit orphan sweep re-adopts an exchange position via commitCreateSignal", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-adopt-strategy",
    exchangeName: "binance-ch-adopt",
    frameName: "",
  };

  const ORPHAN_ID = "ch-adopt-orphan-1";
  // Fake-биржа: позиция-сирота от «прошлой жизни» процесса
  const fakeOrders = new Map([[ORPHAN_ID, { filled: true }]]);
  const opens = [];
  let initCalls = 0;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    // Стратегия сама не торгует — позицию даёт только усыновление
    getSignal: async () => null,
  });

  Broker.useBrokerAdapter({
    waitForInit: async () => {
      initCalls += 1;
      // КАНОН: сперва убедиться, что движок действительно чист — idle-пинг сам
      // по себе этого НЕ гарантирует (см. нюанс №2 в докстринге)
      const status = await inMock(() => getStrategyStatus("BTCUSDT"), t0, context);
      if (status.pendingSignalId || status.retryOpenSignal || status.closedSignal || status.createdSignal) {
        throw new Error(`ch-adopt: engine is NOT clean, adoption is unsafe: ${JSON.stringify(status)}`);
      }
      // ORPHAN SWEEP по рецепту из JSDoc: нашли филл без позиции в движке — усыновляем
      const [orphanId] = [...fakeOrders.keys()];
      await inMock(
        () => commitCreateSignal("BTCUSDT", {
          id: orphanId,
          position: "long",
          note: "adopted by the orphan sweep",
          priceTakeProfit: BASE_PRICE + 15000,
          priceStopLoss: BASE_PRICE - 15000,
          minuteEstimatedTime: 600,
        }),
        t0,
        context,
      );
    },
    // Присутствие хука гарантирует прокси-вызов (и ленивый waitForInit) на idle-пинге
    onSignalIdlePing: async () => {},
    onOrderOpenCommit: async (payload) => {
      if (payload.type !== "active") return;
      opens.push({ id: payload.signalId, attempt: payload.attempt });
      // Усыновление: ордер УЖЕ на бирже (reconcile по clientOrderId) — подтверждаем
      if (!fakeOrders.get(payload.signalId)?.filled) {
        throw new OrderRejectedError("ch-adopt: unknown order, nothing to adopt");
      }
    },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    // tick1: движок idle → idle-пинг → ленивый waitForInit → sweep ставит усыновление
    const tick1 = await runTick(new Date(t0));
    if (tick1.action !== "idle") {
      fail(`tick #1 expected "idle" (bootstrap, nothing to trade yet), got "${tick1.action}"`);
      return;
    }
    if (initCalls !== 1) {
      fail(`the idle ping must lazily trigger waitForInit exactly once, got ${initCalls}`);
      return;
    }

    // tick2: createdSignal (усыновляющий DTO) потребляется ВМЕСТО getSignal
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick2.action !== "opened") {
      fail(`tick #2 expected "opened" (adopted signal), got "${tick2.action}"`);
      return;
    }
    if (tick2.signal.id !== ORPHAN_ID) {
      fail(`adopted position must carry the EXCHANGE id "${ORPHAN_ID}", got "${tick2.signal.id}"`);
      return;
    }
    if (opens.length !== 1 || opens[0].id !== ORPHAN_ID || opens[0].attempt !== 0) {
      fail(`expected a single confirmed open of the orphan id at attempt 0, got ${JSON.stringify(opens)}`);
      return;
    }

    pass(`orphan sweep adopted ${ORPHAN_ID} during the idle bootstrap: opened with attempt 0`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: полнота маппинга payload'ов активного жизненного цикла — enable()
 * обязан прокидывать ВСЕ поля BrokerOrderOpen/Check/ClosePayload (attempt
 * добавлялся руками — регрессия любого другого поля без этого теста невидима).
 */
test("CHANNEL: active lifecycle payloads carry the complete field set", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const context = {
    strategyName: "ch-payload-strategy",
    exchangeName: "binance-ch-payload",
    frameName: "",
  };

  let openPayload = null;
  let checkPayload = null;
  let closePayload = null;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  makeStrategy(context, { minuteEstimatedTime: 2, once: true });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => { openPayload ??= payload; },
    onOrderActiveCheck: async (payload) => { checkPayload ??= payload; },
    onOrderCloseCommit: async (payload) => { closePayload ??= payload; },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    const tick3 = await runTick(new Date(t0 + 3 * MIN));
    if (tick1.action !== "opened" || tick2.action !== "active" || tick3.action !== "closed") {
      fail(`expected opened, active, closed — got ${tick1.action}, ${tick2.action}, ${tick3.action}`);
      return;
    }

    const OPEN_KEYS = ["type", "symbol", "signalId", "cost", "position", "priceOpen", "priceTakeProfit", "priceStopLoss", "pnl", "peakProfit", "maxDrawdown", "attempt", "context", "when", "backtest"];
    const CHECK_KEYS = ["type", "symbol", "signalId", "position", "currentPrice", "priceOpen", "priceTakeProfit", "priceStopLoss", "pnl", "peakProfit", "maxDrawdown", "totalEntries", "totalPartials", "attempt", "context", "when", "backtest"];
    const CLOSE_KEYS = ["symbol", "signalId", "cost", "position", "currentPrice", "priceOpen", "priceTakeProfit", "priceStopLoss", "totalEntries", "totalPartials", "pnl", "peakProfit", "maxDrawdown", "attempt", "context", "when", "backtest"];

    for (const [name, payload, keys] of [
      ["open", openPayload, OPEN_KEYS],
      ["check", checkPayload, CHECK_KEYS],
      ["close", closePayload, CLOSE_KEYS],
    ]) {
      if (!payload) {
        fail(`${name} payload was never delivered`);
        return;
      }
      const missing = keys.filter((key) => !(key in payload));
      if (missing.length) {
        fail(`${name} payload is missing mapped fields: [${missing.join(", ")}]`);
        return;
      }
    }

    const id = tick1.signal.id;
    if (openPayload.type !== "active" || openPayload.signalId !== id || openPayload.symbol !== "BTCUSDT" || openPayload.backtest !== false || openPayload.attempt !== 0 || openPayload.position !== "long") {
      fail(`open payload values mismatch: ${JSON.stringify({ type: openPayload.type, signalId: openPayload.signalId, symbol: openPayload.symbol, backtest: openPayload.backtest, attempt: openPayload.attempt, position: openPayload.position })}`);
      return;
    }
    if (openPayload.context.strategyName !== context.strategyName || openPayload.context.exchangeName !== context.exchangeName || !(openPayload.when instanceof Date)) {
      fail(`open payload routing mismatch: context=${JSON.stringify(openPayload.context)} when=${openPayload.when}`);
      return;
    }
    if (checkPayload.type !== "active" || checkPayload.signalId !== id || checkPayload.currentPrice !== BASE_PRICE) {
      fail(`check payload values mismatch: ${JSON.stringify({ type: checkPayload.type, signalId: checkPayload.signalId, currentPrice: checkPayload.currentPrice })}`);
      return;
    }
    if (closePayload.signalId !== id || closePayload.totalEntries !== 1 || closePayload.totalPartials !== 0 || closePayload.attempt !== 0) {
      fail(`close payload values mismatch: ${JSON.stringify({ signalId: closePayload.signalId, totalEntries: closePayload.totalEntries, totalPartials: closePayload.totalPartials, attempt: closePayload.attempt })}`);
      return;
    }

    pass(`open/check/close payloads carried the complete field sets with consistent values`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: payload'ы scheduled-жизненного цикла — размещение (open type
 * "schedule") и schedule-чек несут полный набор полей и корректный routing.
 */
test("CHANNEL: scheduled lifecycle payloads carry the complete field set", async ({ pass, fail }) => {
  const t0 = new Date("2024-01-01T00:00:00Z").getTime();
  const priceOpen = 40000;
  const context = {
    strategyName: "ch-sched-payload-strategy",
    exchangeName: "binance-ch-sched-payload",
    frameName: "",
  };

  let placePayload = null;
  let checkPayload = null;
  let issued = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "ch sched payload",
        priceOpen,
        priceTakeProfit: priceOpen + 4000,
        priceStopLoss: priceOpen - 2000,
        minuteEstimatedTime: 120,
      };
    },
  });

  Broker.useBrokerAdapter({
    onOrderOpenCommit: async (payload) => { placePayload ??= payload; },
    onOrderScheduleCheck: async (payload) => { checkPayload ??= payload; },
  });
  Broker.enable();

  try {
    const runTick = makeRunTick(context);

    const tick1 = await runTick(new Date(t0));
    const tick2 = await runTick(new Date(t0 + 1 * MIN));
    if (tick1.action !== "scheduled" || tick2.action !== "waiting") {
      fail(`expected scheduled, waiting — got ${tick1.action}, ${tick2.action}`);
      return;
    }

    if (!placePayload || !checkPayload) {
      fail(`payloads were not delivered: place=${!!placePayload} check=${!!checkPayload}`);
      return;
    }
    if (placePayload.type !== "schedule" || checkPayload.type !== "schedule") {
      fail(`both payloads must carry type "schedule", got "${placePayload.type}"/"${checkPayload.type}"`);
      return;
    }
    if (placePayload.priceOpen !== priceOpen || placePayload.attempt !== 0 || placePayload.backtest !== false) {
      fail(`placement payload mismatch: ${JSON.stringify({ priceOpen: placePayload.priceOpen, attempt: placePayload.attempt, backtest: placePayload.backtest })}`);
      return;
    }
    if (checkPayload.signalId !== placePayload.signalId || checkPayload.attempt !== 0) {
      fail(`schedule check must target the placed order: ${JSON.stringify({ placed: placePayload.signalId, checked: checkPayload.signalId, attempt: checkPayload.attempt })}`);
      return;
    }
    if (checkPayload.context.strategyName !== context.strategyName || checkPayload.context.exchangeName !== context.exchangeName) {
      fail(`schedule check routing mismatch: ${JSON.stringify(checkPayload.context)}`);
      return;
    }

    pass(`schedule placement and check payloads consistent: id ${placePayload.signalId}, both attempt 0`);
  } finally {
    Broker.disable();
  }
});

/**
 * CHANNEL: backtest-тишина — event.backtest short-circuit'ится в confirmed ДО
 * syncSubject, хуки адаптера не вызываются вовсе: даже кидающий OrderRejectedError
 * адаптер не влияет на прогон Backtest.run.
 */
test("CHANNEL: the four order hooks stay silent during a backtest run", async ({ pass, fail }) => {
  const context = {
    strategyName: "ch-btsilence-strategy",
    exchangeName: "binance-ch-btsilence",
    frameName: "ch-btsilence-frame",
  };

  let hookCalls = 0;
  let issued = false;

  makeExchange(context.exchangeName, () => BASE_PRICE);
  addStrategySchema({
    strategyName: context.strategyName,
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return {
        position: "long",
        note: "ch btsilence",
        priceTakeProfit: BASE_PRICE + 15000,
        priceStopLoss: BASE_PRICE - 15000,
        minuteEstimatedTime: 5,
      };
    },
  });
  addFrameSchema({
    frameName: context.frameName,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const poison = async () => {
    hookCalls += 1;
    throw new OrderRejectedError("ch-btsilence: must never be reached in backtest");
  };
  Broker.useBrokerAdapter({
    onOrderOpenCommit: poison,
    onOrderCloseCommit: poison,
    onOrderActiveCheck: poison,
    onOrderScheduleCheck: poison,
  });
  Broker.enable();

  try {
    const results = [];
    for await (const result of Backtest.run("BTCUSDT", context)) {
      results.push(`${result.action}${result.closeReason ? `/${result.closeReason}` : ""}`);
    }

    if (!results.includes("closed/time_expired")) {
      fail(`backtest must complete normally despite the poisoned adapter, got ${JSON.stringify(results)}`);
      return;
    }
    if (hookCalls !== 0) {
      fail(`REGRESSION: adapter hooks fired ${hookCalls} times during a backtest (must short-circuit before syncSubject)`);
      return;
    }

    pass(`backtest closed time_expired with the poisoned adapter completely silent (0 hook calls)`);
  } finally {
    Broker.disable();
  }
});
