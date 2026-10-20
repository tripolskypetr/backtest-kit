import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  commitAverageBuy,
  commitPartialLossCost,
  commitPartialProfit,
  getPositionEntries,
  getPositionPartials,
  listenStrategyCommit,
} from "../../build/index.mjs";

const MIN = 60_000;

const alignTimestamp = (ts, intervalMinutes) => {
  const ms = intervalMinutes * MIN;
  return Math.floor(ts / ms) * ms;
};

/** Entry at 1000, a two-step dip 950 -> 940 (DCA + partial loss window), then a ramp above entry (partial profit window) */
const addRampExchange = (exchangeName, start) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const first = alignTimestamp(since.getTime(), 1);
      const out = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = first + i * MIN;
        const minutes = (timestamp - start) / MIN;
        const price = minutes < 8 ? 1000 : minutes < 18 ? 950 : minutes < 30 ? 940 : 1000 + Math.min(100, (minutes - 30) * 2);
        out.push({ timestamp, open: price, high: price, low: price, close: price, volume: 100 });
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
};

test("PARTIAL NOTE: partial / averaging DTOs store a note on the rows, published as entries[] / partials[] on the public row and notifications", async ({ pass, fail }) => {
  const start = new Date("2024-03-01T00:00:00Z").getTime();
  addRampExchange("binance-partial-note", start);

  const commits = [];
  const unCommit = listenStrategyCommit((event) => {
    if (event.action === "partial-profit" || event.action === "partial-loss" || event.action === "average-buy") commits.push(event);
  });

  let issued = false;
  let pings = 0;
  const seen = {};
  addStrategySchema({
    strategyName: "test-strategy-partial-note",
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceTakeProfit: 2000, priceStopLoss: 500, minuteEstimatedTime: 60 };
    },
    callbacks: {
      onActivePing: async (symbol) => {
        pings += 1;
        if (pings === 14) {
          // first dip step (950 < entry 1000): DCA with a note
          seen.avgDto = await commitAverageBuy(symbol, { cost: 50, note: "ladder step 2" });
        }
        if (pings === 24) {
          // second dip step (940 < min entry 950): the plain-number form must keep working
          seen.avgNumber = await commitAverageBuy(symbol, 25);
        }
        if (pings === 27) {
          // still below the effective entry (~978): a loss partial with a note
          seen.lossCost = await commitPartialLossCost(symbol, { cost: 20, note: "de-risk" });
        }
        if (pings === 45) {
          // on the ramp (>1000): profit partials, DTO and plain number
          seen.profitDto = await commitPartialProfit(symbol, { percent: 25, note: "RSI > 70" });
          seen.profitNumber = await commitPartialProfit(symbol, 10);
          seen.partials = await getPositionPartials(symbol);
          seen.entries = await getPositionEntries(symbol);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "partial-note-frame",
    interval: "1m",
    startDate: new Date(start),
    endDate: new Date(start + 90 * MIN),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-partial-note",
    exchangeName: "binance-partial-note",
    frameName: "partial-note-frame",
  })) {
    if (result.action === "closed") closed.push(result);
  }
  unCommit();

  for (const [k, v] of Object.entries({ avgDto: seen.avgDto, avgNumber: seen.avgNumber, profitDto: seen.profitDto, profitNumber: seen.profitNumber, lossCost: seen.lossCost })) {
    if (v !== true) return fail(`${k} must succeed, got ${v}`);
  }

  // getters expose the notes
  if (!Array.isArray(seen.entries) || seen.entries.length !== 3) return fail(`expected 3 entries (initial + 2 DCA), got ${JSON.stringify(seen.entries)}`);
  if (seen.entries[0].note !== undefined) return fail("the initial entry carries no note");
  if (seen.entries[1].note !== "ladder step 2" || seen.entries[1].cost !== 50) return fail(`DCA entry must keep its note and cost: ${JSON.stringify(seen.entries[1])}`);
  if (seen.entries[2].note !== undefined || seen.entries[2].cost !== 25) return fail(`plain-number DCA must store no note: ${JSON.stringify(seen.entries[2])}`);
  if (!Array.isArray(seen.partials) || seen.partials.length !== 3) return fail(`expected 3 partials, got ${JSON.stringify(seen.partials)}`);
  if (seen.partials[0].type !== "loss" || seen.partials[0].note !== "de-risk") return fail(`cost partial wrong: ${JSON.stringify(seen.partials[0])}`);
  if (seen.partials[1].type !== "profit" || seen.partials[1].percent !== 25 || seen.partials[1].note !== "RSI > 70") return fail(`DTO partial wrong: ${JSON.stringify(seen.partials[1])}`);
  if (seen.partials[2].note !== undefined || seen.partials[2].percent !== 10) return fail(`plain-number partial must store no note: ${JSON.stringify(seen.partials[2])}`);

  // public row of the closed result
  if (closed.length !== 1) return fail(`expected one closed result, got ${closed.length}`);
  const { signal } = closed[0];
  if (!Array.isArray(signal.entries) || signal.entries.length !== 3 || signal.entries[1].note !== "ladder step 2") return fail(`closed signal.entries wrong: ${JSON.stringify(signal.entries)}`);
  if (!Array.isArray(signal.partials) || signal.partials.length !== 3 || signal.partials[0].note !== "de-risk" || signal.partials[1].note !== "RSI > 70") return fail(`closed signal.partials wrong: ${JSON.stringify(signal.partials)}`);
  if (signal.totalEntries !== 3 || signal.totalPartials !== 3) return fail("totals must match the arrays");

  // commit events carry the public row with the arrays (what notifications are built from)
  const avg = commits.find((c) => c.action === "average-buy");
  if (!avg || avg.signal.entries.length < 2 || avg.signal.entries[1].note !== "ladder step 2") return fail(`average-buy commit must carry entries with the note: ${JSON.stringify(avg && avg.signal.entries)}`);
  const pp = commits.find((c) => c.action === "partial-profit");
  if (!pp || pp.signal.partials[1].note !== "RSI > 70") return fail(`partial-profit commit must carry partials with the note: ${JSON.stringify(pp && pp.signal.partials)}`);
  const pl = commits.find((c) => c.action === "partial-loss");
  if (!pl || pl.signal.partials[0].note !== "de-risk") return fail(`partial-loss commit must carry the cost partial note: ${JSON.stringify(pl && pl.signal.partials)}`);

  pass("notes stored on entry/partial rows via DTOs, plain numbers still accepted, entries[]/partials[] published on the public row and commit events");
});
