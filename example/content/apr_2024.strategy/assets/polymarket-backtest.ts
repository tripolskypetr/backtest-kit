/**
 * polymarket-backtest.ts  v3
 *
 * Фиксы v3 vs v2:
 *  - Поиск рынков через Events API (tag_slug=crypto-prices), фильтр ТОЛЬКО по question
 *  - fidelity=720 по умолчанию — fidelity=60 возвращает [] для resolved рынков (баг Polymarket)
 *  - keyword матчится только по полю question, не по всему JSON-объекту
 *  - Агрегированная cross-correlation по всем рынкам
 *
 * Запуск:
 *   npx ts-node polymarket-backtest.ts
 *   npx ts-node polymarket-backtest.ts --keyword "btc" --tf 1h --lag 48
 *   npx ts-node polymarket-backtest.ts --tokenId <id>
 *   npx ts-node polymarket-backtest.ts --listMarkets
 */

import * as fs from "fs";
import * as https from "https";
import * as url from "url";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (flag: string, def = ""): string => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};
const hasFlag = (f: string) => argv.includes(f);

const KEYWORD        = arg("--keyword", "bitcoin").toLowerCase();
const EXPLICIT_TOKEN = arg("--tokenId", "");
const BTC_TF         = arg("--tf", "1h");
const MAX_LAG_H      = parseInt(arg("--lag", "48"));
const THRESHOLD      = parseFloat(arg("--threshold", "0.01"));
// fidelity=720 — единственное значение, которое работает для resolved рынков (баг Polymarket CLOB)
const FIDELITY       = parseInt(arg("--fidelity", "720"));
const POLY_INTERVAL  = arg("--interval", "max");
const OUT_FILE       = arg("--out", "polymarket-backtest-result.json");
const LIST_ONLY      = hasFlag("--listMarkets");
const MAX_MARKETS    = parseInt(arg("--maxMarkets", "10"));
const MIN_SIGNALS    = parseInt(arg("--minSignals", "3"));

const TF_HOURS: Record<string, number> = {
  "1m": 1/60, "5m": 5/60, "15m": 0.25, "30m": 0.5,
  "1h": 1, "2h": 2, "4h": 4, "6h": 6, "12h": 12, "1d": 24, "1w": 168,
};
const TF_H = TF_HOURS[BTC_TF] ?? 1;
const MAX_LAG_STEPS = Math.ceil(MAX_LAG_H / TF_H);

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function get(rawUrl: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(rawUrl);
    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { "User-Agent": "polymarket-backtest/3.0", Accept: "application/json" },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} — ${rawUrl}`));
          return;
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout: ${rawUrl}`)); });
    req.on("error", reject);
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ─── MARKET DISCOVERY via Events API ─────────────────────────────────────────

interface MarketInfo {
  question: string;
  slug: string;
  endDate: string;
  yesTokenId: string;
  noTokenId: string;
  yesPrice: number;
  volumeUsd: number;
  volume24h: number;
  liquidityUsd: number;
}

async function discoverMarkets(keyword: string): Promise<MarketInfo[]> {
  // Events API с тегом crypto-prices — содержит все BTC/ETH/SOL price markets
  const params = new URLSearchParams({ tag_slug: "crypto-prices", limit: "100" });
  const u = `https://gamma-api.polymarket.com/events?${params}`;
  console.log(`[gamma] GET ${u}`);

  const raw    = await get(u);
  const events = JSON.parse(raw) as any[];
  const result: MarketInfo[] = [];

  for (const ev of events) {
    for (const m of (ev.markets || []) as any[]) {
      // Фильтр ТОЛЬКО по question — не по всему JSON
      const question: string = m.question || "";
      if (!keyword.split(" ").some((kw) => question.toLowerCase().includes(kw))) continue;

      let tokenIds: string[] = [];
      let prices: string[]   = [];
      let outcomes: string[] = [];
      try { tokenIds = JSON.parse(m.clobTokenIds || "[]"); } catch {}
      try { prices   = JSON.parse(m.outcomePrices || "[]"); } catch {}
      try { outcomes = JSON.parse(m.outcomes || "[]"); } catch {}

      if (!tokenIds[0]) continue;

      const yesIdx   = outcomes.findIndex((o: string) => /yes/i.test(o));
      const yesToken = yesIdx >= 0 ? tokenIds[yesIdx] : tokenIds[0];
      const noToken  = yesIdx >= 0 ? (tokenIds[1 - yesIdx] ?? "") : (tokenIds[1] ?? "");
      const yesPrice = parseFloat(prices[yesIdx >= 0 ? yesIdx : 0] || "0");
      const endDate  = m.endDate || ev.endDate || "";

      result.push({
        question,
        slug:         m.slug || ev.slug || "",
        endDate,
        yesTokenId:   yesToken,
        noTokenId:    noToken,
        yesPrice,
        volumeUsd:    parseFloat(m.volumeNum ?? m.volume ?? "0"),
        volume24h:    parseFloat(m.volume24hr ?? "0"),
        liquidityUsd: parseFloat(m.liquidityNum ?? m.liquidity ?? "0"),
      });
    }
  }

  // Сортировка по объёму
  result.sort((a, b) => b.volumeUsd - a.volumeUsd);
  return result;
}

// ─── POLYMARKET CLOB ──────────────────────────────────────────────────────────

interface PolyPoint { t: number; p: number; }

async function fetchClobHistory(tokenId: string): Promise<PolyPoint[]> {
  const params = new URLSearchParams({
    market:   tokenId,
    interval: POLY_INTERVAL,
    fidelity: String(FIDELITY),
  });
  const u = `https://clob.polymarket.com/prices-history?${params}`;
  console.log(`  [clob] GET ${u}`);

  const raw  = await get(u);
  const json = JSON.parse(raw);
  const history = (json.history ?? []) as Array<{ t: number | string; p: number | string }>;
  return history.map((d) => ({ t: Number(d.t), p: parseFloat(String(d.p)) }));
}

// ─── BINANCE ──────────────────────────────────────────────────────────────────

interface Kline { t: number; o: number; h: number; l: number; c: number; v: number; }

async function fetchBinanceRange(startMs: number, endMs: number): Promise<Kline[]> {
  const stepMs = 1000 * TF_H * 3_600_000; // 1000 свечей за запрос
  const all: Kline[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const pageEnd = Math.min(cursor + stepMs, endMs);
    const params = new URLSearchParams({
      symbol: "BTCUSDT", interval: BTC_TF, limit: "1000",
      startTime: String(cursor), endTime: String(pageEnd),
    });
    const u = `https://api.binance.com/api/v3/klines?${params}`;
    console.log(`[binance] GET ${new Date(cursor).toISOString().slice(0,10)} → ${new Date(pageEnd).toISOString().slice(0,10)}`);
    const raw = await get(u);
    const arr = JSON.parse(raw) as any[][];
    if (!arr.length) break;
    all.push(...arr.map((k) => ({
      t: Number(k[0]), o: parseFloat(k[1]), h: parseFloat(k[2]),
      l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
    })));
    cursor = all[all.length - 1].t + TF_H * 3_600_000;
    if (arr.length < 1000) break;
    await sleep(120);
  }
  return all;
}

async function fetchBinance(markets: MarketInfo[]): Promise<Kline[]> {
  // Вычисляем диапазон дат по всем рынкам
  const endDates = markets.map((m) => new Date(m.endDate).getTime()).filter(Boolean);
  if (!endDates.length) {
    // Фолбэк: последние 1000 свечей
    const u = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${BTC_TF}&limit=1000`;
    console.log(`[binance] GET ${u} (fallback)`);
    const raw = await get(u);
    const arr = JSON.parse(raw) as any[][];
    return arr.map((k) => ({
      t: Number(k[0]), o: parseFloat(k[1]), h: parseFloat(k[2]),
      l: parseFloat(k[3]), c: parseFloat(k[4]), v: parseFloat(k[5]),
    }));
  }

  const latestEnd  = Math.max(...endDates);
  const earliestEnd = Math.min(...endDates);
  // Начинаем за 90 дней до самого раннего рынка
  const startMs = earliestEnd - 90 * 86400_000;
  const endMs   = Math.min(latestEnd + 7 * 86400_000, Date.now());

  console.log(`[binance] Диапазон: ${new Date(startMs).toISOString().slice(0,10)} → ${new Date(endMs).toISOString().slice(0,10)}`);
  const klines = await fetchBinanceRange(startMs, endMs);
  console.log(`[binance] ${klines.length} klines total (BTCUSDT ${BTC_TF})`);
  return klines;
}

// ─── ALIGNMENT ────────────────────────────────────────────────────────────────

interface AlignedPoint { t: number; prob: number; btcClose: number; klineIdx: number; }

function align(poly: PolyPoint[], klines: Kline[]): AlignedPoint[] {
  const windowMs = TF_H * 3_600_000;
  const result: AlignedPoint[] = [];
  for (const p of poly) {
    const tMs = p.t * 1000;
    const idx = klines.findIndex((k) => Math.abs(k.t - tMs) <= windowMs);
    if (idx !== -1) result.push({ t: tMs, prob: p.p, btcClose: klines[idx].c, klineIdx: idx });
  }
  return result;
}

// ─── STATISTICS ───────────────────────────────────────────────────────────────

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let num = 0, da2 = 0, db2 = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    num += da * db; da2 += da * da; db2 += db * db;
  }
  return da2 * db2 < 1e-14 ? 0 : num / Math.sqrt(da2 * db2);
}

interface CorrPoint { lag: number; lagH: number; rho: number; }

function crossCorrelation(pChanges: number[], bReturns: number[]): CorrPoint[] {
  const n = pChanges.length;
  return Array.from({ length: MAX_LAG_STEPS * 2 + 1 }, (_, idx) => {
    const lag = idx - MAX_LAG_STEPS;
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      if (j >= 0 && j < n) { a.push(pChanges[i]); b.push(bReturns[j]); }
    }
    return { lag, lagH: +(lag * TF_H).toFixed(2), rho: pearson(a, b) };
  });
}

// ─── SIGNALS & BACKTEST ───────────────────────────────────────────────────────

interface Signal {
  dateISO: string; t: number; dprob: number;
  direction: "long" | "short";
  entryPrice: number; exitPrice: number;
  returnPct: number; win: boolean;
}

function buildSignals(aligned: AlignedPoint[], optLag: number, klines: Kline[]): Signal[] {
  const lag = Math.max(1, Math.abs(optLag));
  const signals: Signal[] = [];
  for (let i = 1; i < aligned.length - lag; i++) {
    const dp = aligned[i].prob - aligned[i - 1].prob;
    if (Math.abs(dp) < THRESHOLD) continue;

    const entryKlineIdx = aligned[i].klineIdx;
    // Берём свечу через lag шагов от entry-свечи, а не от aligned-индекса
    const exitKlineIdx  = entryKlineIdx + lag;
    if (exitKlineIdx >= klines.length) continue;

    const entry = klines[entryKlineIdx].c;
    const exit  = klines[exitKlineIdx].c;

    // Пропускаем если entry и exit — одна и та же свеча (артефакт fidelity)
    if (entryKlineIdx === aligned[i - 1].klineIdx) continue; // Polymarket точки на одной свече
    if (entry === exit) continue; // дополнительная защита

    const dir: "long" | "short" = dp > 0 ? "long" : "short";
    const ret = dir === "long"
      ? (exit - entry) / entry * 100
      : (entry - exit) / entry * 100;
    signals.push({
      dateISO: new Date(aligned[i].t).toISOString(),
      t: aligned[i].t, dprob: dp, direction: dir,
      entryPrice: entry, exitPrice: exit,
      returnPct: +ret.toFixed(4), win: ret > 0,
    });
  }
  return signals;
}

function calcStats(signals: Signal[]) {
  const n = signals.length;
  if (!n) return { n, winRate: 0, cumPnl: 0, avgWin: 0, avgLoss: 0, profitFactor: null as number | null, sharpe: 0 };
  const wins   = signals.filter((s) => s.win);
  const losses = signals.filter((s) => !s.win);
  const cumPnl = signals.reduce((s, x) => s + x.returnPct, 0);
  const avgWin  = wins.length   ? wins.reduce((s, x)   => s + x.returnPct, 0) / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s, x) => s + x.returnPct, 0) / losses.length : 0;
  const gsum    = wins.reduce((s, x)   => s + x.returnPct, 0);
  const lsum    = Math.abs(losses.reduce((s, x) => s + x.returnPct, 0));
  const pf      = lsum > 0 ? gsum / lsum : Infinity;
  const mean    = cumPnl / n;
  const variance = signals.reduce((s, x) => s + (x.returnPct - mean) ** 2, 0) / n;
  return {
    n,
    winRate:      +(wins.length / n).toFixed(4),
    cumPnl:       +cumPnl.toFixed(4),
    avgWin:       +avgWin.toFixed(4),
    avgLoss:      +avgLoss.toFixed(4),
    profitFactor: isFinite(pf) ? +pf.toFixed(4) : (null as number | null),
    sharpe:       +(variance > 0 ? mean / Math.sqrt(variance) : 0).toFixed(4),
  };
}

// ─── PER-MARKET ───────────────────────────────────────────────────────────────

interface MarketResult {
  market: MarketInfo; dataPoints: number;
  optimalLag: CorrPoint; top5Lags: CorrPoint[];
  stats: ReturnType<typeof calcStats>;
  signals: Signal[]; corrData: CorrPoint[];
}

async function processMarket(market: MarketInfo, klines: Kline[]): Promise<MarketResult | null> {
  console.log(`\n  → ${market.question}`);
  console.log(`    end=${market.endDate.slice(0, 10)}  vol=$${market.volumeUsd.toFixed(0)}`);

  const polyRaw = await fetchClobHistory(market.yesTokenId);

  if (polyRaw.length < 5) {
    console.log(`    [skip] CLOB: ${polyRaw.length} точек`);
    return null;
  }
  console.log(`    [clob] ${polyRaw.length} точек`);

  const aligned = align(polyRaw, klines);
  if (aligned.length < 8) {
    console.log(`    [skip] aligned: ${aligned.length} точек (рынок за пределами Binance окна)`);
    return null;
  }

  // Дедупликация: убираем Polymarket-точки попавшие на одну Binance-свечу
  const deduped = aligned.filter((p, i) =>
    i === 0 || p.klineIdx !== aligned[i - 1].klineIdx
  );

  const pChanges = deduped.slice(1).map((p, i) => p.prob - deduped[i].prob);
  const bReturns = deduped.slice(1).map((p, i) =>
    (klines[p.klineIdx].c - klines[deduped[i].klineIdx].c) / klines[deduped[i].klineIdx].c * 100
  );

  const corrData = crossCorrelation(pChanges, bReturns);
  const optLag   = corrData.reduce((b, d) => Math.abs(d.rho) > Math.abs(b.rho) ? d : b, corrData[0]);
  const top5     = [...corrData].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).slice(0, 5);
  const signals  = buildSignals(deduped, optLag.lag, klines);
  const stats    = calcStats(signals);

  if (stats.n < MIN_SIGNALS) {
    console.log(`    [skip] сигналов: ${stats.n} < ${MIN_SIGNALS}`);
    return null;
  }

  console.log(`    [corr] opt lag=${optLag.lag} (${optLag.lagH}h)  ρ=${optLag.rho.toFixed(4)}`);
  console.log(`    [bt]   signals=${stats.n}  wr=${(stats.winRate * 100).toFixed(1)}%  cumPnL=${stats.cumPnl.toFixed(2)}%  PF=${stats.profitFactor ?? "∞"}`);

  return { market, dataPoints: deduped.length, optimalLag: optLag, top5Lags: top5, stats, signals, corrData };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Polymarket → BTC Correlation Backtest v3 ===");
  console.log(`Keyword:   "${KEYWORD}"`);
  console.log(`BTC tf:    ${BTC_TF}  |  Max lag: ±${MAX_LAG_H}h  |  Threshold: Δprob≥${(THRESHOLD * 100).toFixed(1)}%`);
  console.log(`CLOB:      interval=${POLY_INTERVAL}  fidelity=${FIDELITY}min\n`);

  let markets: MarketInfo[] = [];

  if (EXPLICIT_TOKEN) {
    markets = [{
      question: "Custom token", slug: "custom",
      endDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
      yesTokenId: EXPLICIT_TOKEN, noTokenId: "",
      yesPrice: 0, volumeUsd: 0, volume24h: 0, liquidityUsd: 0,
    }];
  } else {
    markets = await discoverMarkets(KEYWORD);
  }

  console.log(`[gamma] BTC markets найдено: ${markets.length}`);
  markets.forEach((m, i) =>
    console.log(`  ${i + 1}. [vol=$${m.volumeUsd.toFixed(0)}] ${m.question}  (${m.endDate.slice(0, 10)})`)
  );

  if (LIST_ONLY) {
    fs.writeFileSync(OUT_FILE, JSON.stringify({ markets }, null, 2));
    console.log(`\n[out] → ${OUT_FILE}`);
    return;
  }

  if (!markets.length) {
    console.error("[error] Рынков не найдено.");
    process.exit(1);
  }

  const toProcess = markets.slice(0, MAX_MARKETS);
  console.log(`\n[run] Обрабатываем ${toProcess.length} рынков...`);

  const klines = await fetchBinance(toProcess);

  const results: MarketResult[] = [];
  for (const m of toProcess) {
    try {
      const r = await processMarket(m, klines);
      if (r) results.push(r);
    } catch (e: any) {
      console.log(`    [error] ${e.message}`);
    }
    await sleep(150);
  }

  if (!results.length) {
    console.error("\n[error] Ни один рынок не прошёл фильтры.");
    process.exit(1);
  }

  // ─── Aggregated cross-correlation ─────────────────────────────────────────

  const lagMap: Map<number, number[]> = new Map();
  for (const r of results) {
    for (const c of r.corrData) {
      if (!lagMap.has(c.lag)) lagMap.set(c.lag, []);
      lagMap.get(c.lag)!.push(c.rho);
    }
  }
  const aggCorr = Array.from(lagMap.entries())
    .map(([lag, rhos]) => ({
      lag,
      lagH: +(lag * TF_H).toFixed(2),
      rho: +(rhos.reduce((s, x) => s + x, 0) / rhos.length).toFixed(4),
    }))
    .sort((a, b) => a.lag - b.lag);

  const aggOpt = aggCorr.reduce((b, d) => Math.abs(d.rho) > Math.abs(b.rho) ? d : b, aggCorr[0]);

  // ─── Print summary ─────────────────────────────────────────────────────────

  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║                    ИТОГИ                         ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`\n  Агрегированный оптимальный лаг: ${aggOpt.lag} шагов (${aggOpt.lagH}h)  ρ=${aggOpt.rho.toFixed(4)}`);
  console.log(`  Рынков в агрегации: ${results.length}\n`);

  for (const r of results) {
    const { stats: s, optimalLag: lag } = r;
    console.log(`  ${r.market.question}`);
    console.log(`  Точек: ${r.dataPoints}  |  Лаг: ${lag.lag} (${lag.lagH}h)  ρ=${lag.rho.toFixed(4)}`);
    console.log(`  Top-5: ${r.top5Lags.map((c) => `${c.lagH}h(${c.rho.toFixed(3)})`).join("  ")}`);
    console.log(`  n=${s.n}  WR=${(s.winRate * 100).toFixed(1)}%  cumPnL=${s.cumPnl.toFixed(2)}%  PF=${s.profitFactor ?? "∞"}  Sharpe=${s.sharpe.toFixed(3)}\n`);
  }

  // ─── Save JSON ─────────────────────────────────────────────────────────────

  fs.writeFileSync(OUT_FILE, JSON.stringify({
    meta: {
      keyword: KEYWORD, btcTf: BTC_TF, maxLagH: MAX_LAG_H,
      threshold: THRESHOLD, polyInterval: POLY_INTERVAL,
      polyFidelity: FIDELITY, generatedAt: new Date().toISOString(),
    },
    marketsFound: markets.length,
    marketsProcessed: results.length,
    aggregatedOptimalLag: aggOpt,
    aggregatedCorrData: aggCorr,
    results: results.map((r) => ({
      question:     r.market.question,
      endDate:      r.market.endDate,
      yesPrice:     r.market.yesPrice,
      volumeUsd:    r.market.volumeUsd,
      dataPoints:   r.dataPoints,
      optimalLag:   r.optimalLag,
      top5Lags:     r.top5Lags,
      stats:        r.stats,
      corrData:     r.corrData,
      signals:      r.signals,
    })),
  }, null, 2));

  console.log(`[out] → ${OUT_FILE}\n`);
}

main().catch((e) => {
  console.error("[fatal]", e.message);
  process.exit(1);
});