import { test } from "worker-testbed";

import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Пиннинг двух живучестей Live.run из полевых репортов paperhands (DECISIONS
// п.74 / фидбек №3 п.6, tavily-feedback п.6):
// 1. HEADLESS-смерть: свечные часы намеренно unref() («пассивные часы — не
//    повод жить»), но АКТИВНЫЙ await waitForCandle в headless-прогоне (без UI/
//    сокетов) оставался без единого ref-источника — event loop дренировался и
//    процесс тихо выходил с кодом 0 через ~30с (супервизор насчитал 3941
//    «рестарт» за неделю). Фикс: keepalive на время самого await.
// 2. Кидающий getCandles (ccxt RequestTimeout) не роняет Live.run: цикл ловит,
//    шлёт errorEmitter и ретраит со следующей свечи.
//
// Оба свойства проверяются ОДНИМ дочерним node-процессом: headless-ребёнок с
// getCandles, кидающим до первой минутной границы, обязан пережить ожидание
// свечи (~до 60с реального времени) и дожить до успешного idle-тика.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CHILD_SCRIPT = `
import "${REPO_ROOT}/test/config/setup.mjs";
import {
  addExchangeSchema, addStrategySchema, listenError, listenIdlePing, Live,
} from "${REPO_ROOT}/build/index.mjs";

const MIN = 60_000;
const BASE_PRICE = 50000;

// Кидаем до ближайшей минутной границы: первый tick (немедленный) гарантированно
// падает "сетевым таймаутом", после границы свечи сеть "оживает"
const recoverAt = Math.floor(Date.now() / MIN) * MIN + MIN;

addExchangeSchema({
  exchangeName: "liveloop-ex",
  getCandles: async (_symbol, _interval, since, limit) => {
    if (Date.now() < recoverAt) {
      throw new Error("liveloop: RequestTimeout fetch failed (simulated ccxt)");
    }
    const aligned = Math.floor(since.getTime() / MIN) * MIN;
    return Array.from({ length: limit }, (_, i) => ({
      timestamp: aligned + i * MIN,
      open: BASE_PRICE, high: BASE_PRICE, low: BASE_PRICE, close: BASE_PRICE,
      volume: 100,
    }));
  },
  formatPrice: async (_symbol, price) => price.toFixed(8),
  formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
});

addStrategySchema({
  strategyName: "liveloop-strategy",
  interval: "1m",
  getSignal: async () => null,
});

listenError((error) => {
  console.log("CHILD_ERR " + String(error?.message ?? error));
});
listenIdlePing(() => {
  // Успешный idle-тик ПОСЛЕ пережитого ожидания свечи — обе живучести доказаны
  console.log("CHILD_SURVIVED");
  setTimeout(() => process.exit(0), 100);
});

// Страховка от вечного зависания теста
const watchdog = setTimeout(() => {
  console.log("CHILD_TIMEOUT");
  process.exit(3);
}, 150_000);
watchdog.unref?.();

// Headless: НИКАКИХ UI/сокетов — до фикса процесс тихо умирал (exit 0) на
// await waitForCandle, не дожив до этого принта
(async () => {
  for await (const _result of Live.run("BTCUSDT", {
    strategyName: "liveloop-strategy",
    exchangeName: "liveloop-ex",
  })) {
    // Live.run отдаёт только opened/closed — idle-цикл сюда не заходит
  }
})();
`;

/**
 * LIVE LOOP: headless-прогон переживает ожидание свечи (keepalive на время
 * await waitForCandle), а кидающий getCandles не роняет цикл — ошибка уходит в
 * errorEmitter и Live.run ретраит со следующей свечи.
 */
test("LIVE LOOP: a headless run survives the candle wait and a throwing getCandles does not kill it", async ({ pass, fail }) => {
  const scriptPath = join(tmpdir(), `backtest-kit-liveloop-${process.pid}-${Math.floor(Math.random() * 1e9)}.mjs`);
  writeFileSync(scriptPath, CHILD_SCRIPT);

  let child = null;
  try {
    const outcome = await new Promise((resolvePromise) => {
      const chunks = [];
      child = spawn(process.execPath, [scriptPath], { stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
      child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolvePromise({ code: -1, output: chunks.join(""), timedOut: true });
      }, 160_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolvePromise({ code, output: chunks.join(""), timedOut: false });
      });
    });

    if (outcome.timedOut) {
      fail(`the child process hung past 160s (no exit): output=${JSON.stringify(outcome.output.slice(-500))}`);
      return;
    }
    // РЕГРЕССИЯ headless-смерти: до фикса ребёнок выходил с кодом 0, но БЕЗ
    // CHILD_SURVIVED — умирал посреди await waitForCandle
    if (!outcome.output.includes("CHILD_SURVIVED")) {
      fail(`HEADLESS DEATH: the child exited (code=${outcome.code}) without surviving the candle wait: output=${JSON.stringify(outcome.output.slice(-500))}`);
      return;
    }
    if (!outcome.output.includes("CHILD_ERR")) {
      fail(`the throwing getCandles must surface via errorEmitter before the recovery, got output=${JSON.stringify(outcome.output.slice(-500))}`);
      return;
    }
    if (outcome.code !== 0) {
      fail(`expected a clean exit 0 after survival, got code=${outcome.code}`);
      return;
    }

    pass(`headless child survived the candle wait after a simulated RequestTimeout and reached a healthy tick (exit 0)`);
  } finally {
    try { child?.kill("SIGKILL"); } catch { /* already dead */ }
    rmSync(scriptPath, { force: true });
  }
});
