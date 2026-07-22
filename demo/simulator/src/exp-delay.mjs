// Проба «формы шага толпы»: как ведёт себя цена в первые минуты/часы
// после публикации идеи, и что даёт задержка входа. Только чтение
// готового кеша свечей (exchangeName тот же, что в demo) — сеть не
// нужна, если кеш полон.
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync } from "fs";
import ccxt from "ccxt";

const MINUTE_MS = 60_000;
const SLIP = 0.1; // CC_PERCENT_SLIPPAGE, %
const FEE = 0.1; // CC_PERCENT_FEE, %

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt_exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
});

const PROFILES = [];

addSimulatorSchema({
  simulatorName: "exp_delay",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [5],
    trailingTakePercent: [2],
    holdMinutes: [72 * 60],
    minIdeasAligned: [1],
    minAuthorTrack: [5],
    minAuthorHitRate: [0.5],
    minWeightAligned: [0],
    profitLockPercent: [2.5],
    authorMetric: ["close"],
  },
  callbacks: {
    onProfiles: (_symbol, profiles) => PROFILES.push(...profiles),
  },
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

await Simulator.run({ symbol: "BTCUSDT", simulatorName: "exp_delay", ideas });

const done = JSON.parse(readFileSync("./assets/simulator.done.json", "utf-8"));
const allowed = new Set(done.allowedAuthors);

const dirOf = (p) => (p.idea.direction === "LONG" ? 1 : -1);
const groups = {
  all: PROFILES,
  whitelist: PROFILES.filter((p) => allowed.has(p.idea.author)),
  banned: PROFILES.filter((p) => !allowed.has(p.idea.author)),
};

// A. Средний подписанный ход цены (close против open входа) на смещении t
const OFFSETS = [1, 5, 15, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 7190];
console.log("\n=== A. Средний ход в направлении идеи, % (close[t] vs open[0]) ===");
console.log("offset_min\t" + Object.keys(groups).map((g) => `${g}(n=${groups[g].length})`).join("\t"));
for (const t of OFFSETS) {
  const row = [t];
  for (const list of Object.values(groups)) {
    const vals = list
      .filter((p) => p.candles.length > t)
      .map((p) => (dirOf(p) * (p.candles[t].close - p.entryPrice) * 100) / p.entryPrice);
    row.push(vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : "-");
  }
  console.log(row.join("\t"));
}

// B. Средний MFE внутри первых N минут
console.log("\n=== B. Средний MFE первых N минут, % ===");
console.log("window_min\t" + Object.keys(groups).join("\t"));
for (const t of OFFSETS) {
  const row = [t];
  for (const list of Object.values(groups)) {
    const vals = list.map((p) => {
      let mfe = 0;
      const dir = dirOf(p);
      const upto = Math.min(t, p.candles.length);
      for (let i = 0; i < upto; i++) {
        const fav = dir > 0 ? p.candles[i].high : p.candles[i].low;
        const v = (dir * (fav - p.entryPrice) * 100) / p.entryPrice;
        if (v > mfe) mfe = v;
      }
      return mfe;
    });
    row.push(vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : "-");
  }
  console.log(row.join("\t"));
}

// C. Симуляция замороженного победителя (H=5 TT=2 72h lock=2.5) со
// сдвигом входа: гейт = белый список, слот-семантика (одна позиция).
const POINT = { hardStopPercent: 5, trailingTakePercent: 2, holdMinutes: 72 * 60, profitLockPercent: 2.5 };
const simulateDelayed = (profile, d) => {
  const c = profile.candles;
  if (c.length <= d) return null;
  const dir = dirOf(profile);
  const slip = SLIP / 100;
  const entryFill = c[d].open * (1 + dir * slip);
  const stopLevel = entryFill * (1 - (dir * POINT.hardStopPercent) / 100);
  const trailRatio = POINT.trailingTakePercent / 100;
  const armLevel = entryFill / (1 - dir * trailRatio);
  const lockLevel = entryFill * (1 + (dir * POINT.profitLockPercent) / 100);
  let peak = entryFill;
  let exitLevel = null;
  let exitReason = "time_expired";
  let exitIndex = Math.min(d + POINT.holdMinutes, c.length) - 1;
  for (let i = d; i <= exitIndex; i++) {
    const adverse = dir > 0 ? c[i].low : c[i].high;
    const stopHit = dir > 0 ? adverse <= stopLevel : adverse >= stopLevel;
    const trailLevel = peak * (1 - dir * trailRatio);
    const trailArmed = dir > 0 ? peak >= armLevel : peak <= armLevel;
    const trailHit = trailArmed && (dir > 0 ? adverse <= trailLevel : adverse >= trailLevel);
    const lockArmed = dir > 0 ? peak >= lockLevel : peak <= lockLevel;
    const lockHit = lockArmed && (dir > 0 ? adverse <= lockLevel : adverse >= lockLevel);
    if (stopHit) { exitLevel = stopLevel; exitReason = "hard_stop"; exitIndex = i; break; }
    if (trailHit && lockHit) {
      const trailBetter = dir > 0 ? trailLevel >= lockLevel : trailLevel <= lockLevel;
      exitLevel = trailBetter ? trailLevel : lockLevel;
      exitReason = trailBetter ? "trailing_take" : "profit_lock";
      exitIndex = i; break;
    }
    if (trailHit) { exitLevel = trailLevel; exitReason = "trailing_take"; exitIndex = i; break; }
    if (lockHit) { exitLevel = lockLevel; exitReason = "profit_lock"; exitIndex = i; break; }
    const fav = dir > 0 ? c[i].high : c[i].low;
    peak = dir > 0 ? Math.max(peak, fav) : Math.min(peak, fav);
  }
  if (exitLevel === null) exitLevel = c[exitIndex].close;
  const exitFill = exitLevel * (1 - dir * slip);
  const pnl = dir * ((exitFill - entryFill) / entryFill) * 100 - 2 * FEE;
  return { pnl, exitReason, exitTs: profile.entryTimestamp + exitIndex * MINUTE_MS };
};

console.log("\n=== C. Победитель тюна со сдвигом входа (белый список, слот-семантика) ===");
console.log("delay_min\ttrades\tPnL%\twinRate\tlock\ttrail\tstop\texpired");
for (const d of [0, 5, 15, 30, 60, 120, 240, 480]) {
  let busyUntil = -Infinity;
  const trades = [];
  for (const p of groups.whitelist) {
    const entryTs = p.entryTimestamp + d * MINUTE_MS;
    if (entryTs < busyUntil) continue;
    const trade = simulateDelayed(p, d);
    if (!trade) continue;
    trades.push(trade);
    busyUntil = trade.exitTs + MINUTE_MS;
  }
  const pnl = trades.reduce((a, t) => a + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const reason = (r) => trades.filter((t) => t.exitReason === r).length;
  console.log([
    d, trades.length, pnl.toFixed(2),
    trades.length ? (wins / trades.length).toFixed(2) : "-",
    reason("profit_lock"), reason("trailing_take"), reason("hard_stop"), reason("time_expired"),
  ].join("\t"));
}
process.exit(0);
