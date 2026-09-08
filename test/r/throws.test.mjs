import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  Reflect,
  Live,
  Backtest,
  Recent,
  RecentLive,
  RecentBacktest,
} from "../../build/index.mjs";

// ---------------------------------------------------------------------------
// Position getters throw instead of resolving null when no signal exists.
//
// A nullable return was a footgun in the shape the README itself documents:
//
//   if (await getPositionPnlPercent(symbol) < 3) return;
//
// With null the comparison is false, so the guard silently inverted and the
// caller acted on a position that was not there. Every getter that used to
// resolve `null` for "no signal" now throws, and these tests pin that.
//
// The full e2e suite never exercises this branch - it always calls these getters
// with a live position - so without this file the throwing path is unprotected
// against a silent revert to nullable.
// ---------------------------------------------------------------------------

const EXCHANGE = "throws-exchange";
const STRATEGY = "throws-strategy";
const PRICE = 100;
const NOW = 1700000000000;

const REGISTERED =
  (globalThis.__rSuiteRegistered ??= { exchanges: new Set(), strategies: new Set() });

if (!REGISTERED.exchanges.has(EXCHANGE)) {
  REGISTERED.exchanges.add(EXCHANGE);
  addExchangeSchema({
    exchangeName: EXCHANGE,
    getCandles: async () => [],
    formatPrice: async (_symbol, price) => price.toFixed(2),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(2),
  });
}
if (!REGISTERED.strategies.has(STRATEGY)) {
  REGISTERED.strategies.add(STRATEGY);
  addStrategySchema({
    strategyName: STRATEGY,
    interval: "1m",
    getSignal: async () => null,
  });
}

const FRAMED = { strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: "" };
const UNFRAMED = { strategyName: STRATEGY, exchangeName: EXCHANGE };

/**
 * Runs every call and reports the ones that did NOT throw. Collecting all
 * offenders in one pass beats bailing on the first, since a partial revert
 * usually touches a whole family of getters at once.
 */
const expectAllThrow = async (label, calls) => {
  const survived = [];
  for (const [name, fn] of calls) {
    try {
      const value = await fn();
      survived.push(`${name} -> ${JSON.stringify(value)}`);
    } catch {
      // throwing is the contract
    }
  }
  return survived.length
    ? `${label}: ${survived.length} getter(s) resolved instead of throwing without a position:\n  ${survived.join("\n  ")}`
    : null;
};

// ---------------------------------------------------------------------------
// 1. Reflect — 22 guarded getters
// ---------------------------------------------------------------------------
test("Reflect position getters throw when no pending signal exists", async ({ pass, fail }) => {
  const withPrice = [
    "getPositionPnlPercent",
    "getPositionPnlCost",
    "getPositionHighestProfitDistancePnlPercentage",
    "getPositionHighestProfitDistancePnlCost",
    "getMaxDrawdownDistancePnlPercentage",
    "getMaxDrawdownDistancePnlCost",
  ];
  const withTimestamp = [
    "getPositionActiveMinutes",
    "getPositionWaitingMinutes",
    "getPositionDrawdownMinutes",
    "getPositionHighestProfitMinutes",
    "getPositionMaxDrawdownMinutes",
  ];
  const plain = [
    "getPositionHighestProfitPrice",
    "getPositionHighestProfitTimestamp",
    "getPositionHighestPnlPercentage",
    "getPositionHighestPnlCost",
    "getPositionHighestProfitBreakeven",
    "getPositionMaxDrawdownPrice",
    "getPositionMaxDrawdownTimestamp",
    "getPositionMaxDrawdownPnlPercentage",
    "getPositionMaxDrawdownPnlCost",
    "getPositionHighestMaxDrawdownPnlPercentage",
    "getPositionHighestMaxDrawdownPnlCost",
  ];

  const calls = [
    ...withPrice.map((name) => [name, () => Reflect[name]("BTCUSDT", PRICE, FRAMED, false)]),
    ...withTimestamp.map((name) => [name, () => Reflect[name]("BTCUSDT", NOW, FRAMED, false)]),
    ...plain.map((name) => [name, () => Reflect[name]("BTCUSDT", FRAMED, false)]),
  ];

  // Guard against the list drifting out of sync with the implementation.
  if (calls.length !== 22) {
    fail(`expected 22 guarded Reflect getters, listed ${calls.length}`);
    return;
  }

  const error = await expectAllThrow("Reflect", calls);
  if (error) {
    fail(error);
    return;
  }
  pass(`all ${calls.length} Reflect position getters threw without a position`);
});

// ---------------------------------------------------------------------------
// 4. The thrown error names the method and the context
//
// These getters are called deep inside strategy code, so a bare "no signal"
// would be useless in a log. The message must identify what asked and for which
// execution.
// ---------------------------------------------------------------------------
test("the thrown error identifies the method, symbol and context", async ({ pass, fail }) => {
  let message = "";
  try {
    await Reflect.getPositionPnlPercent("BTCUSDT", PRICE, FRAMED, false);
    fail("expected a throw");
    return;
  } catch (error) {
    message = error.message;
  }

  const missing = [
    "getPositionPnlPercent",
    "BTCUSDT",
    STRATEGY,
    EXCHANGE,
  ].filter((part) => !message.includes(part));

  if (missing.length) {
    fail(`error message is missing ${JSON.stringify(missing)}: "${message}"`);
    return;
  }
  pass(`error message carries method, symbol and context: "${message}"`);
});

// ---------------------------------------------------------------------------
// 6. Recent still searches BOTH stores
//
// This is the one place where the null -> throw change altered control flow, not
// just a type. RecentAdapter probes backtest storage first, then live; once the
// first probe started throwing, a naive edit would have made the live branch
// unreachable. A signal present ONLY in live storage must still be found.
// ---------------------------------------------------------------------------
test("Recent falls through to live storage after a backtest miss", async ({ pass, fail }) => {
  RecentLive.useMemory();
  RecentBacktest.useMemory();
  Recent.enable();

  const symbol = "CASCADE-USDT";
  const createdAt = NOW - 16 * 60 * 1000;
  const context = { strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: "" };
  const when = new Date(NOW);

  // Written to LIVE storage only, so the backtest probe is guaranteed to miss.
  await RecentLive.handleActivePing({
    symbol,
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: "",
    backtest: false,
    currentPrice: PRICE,
    timestamp: createdAt,
    data: {
      id: "CASCADE-1",
      timestamp: createdAt,
      strategyName: STRATEGY,
      exchangeName: EXCHANGE,
      frameName: "",
      symbol,
      position: "long",
      priceOpen: PRICE,
      priceTakeProfit: PRICE + 10,
      priceStopLoss: PRICE - 10,
    },
  });

  let signal;
  try {
    signal = await Recent.getLatestSignal(symbol, context, when);
  } catch (error) {
    fail(
      `cascade broke: a backtest miss must fall through to live storage, got "${error.message}"`,
    );
    return;
  }
  if (signal.id !== "CASCADE-1") {
    fail(`found the wrong signal: ${JSON.stringify(signal.id)} expected "CASCADE-1"`);
    return;
  }

  let minutes;
  try {
    minutes = await Recent.getMinutesSinceLatestSignalCreated(symbol, context, when);
  } catch (error) {
    fail(`minutes cascade broke: "${error.message}"`);
    return;
  }
  if (minutes !== 16) {
    fail(`elapsed minutes ${minutes} expected 16`);
    return;
  }

  pass("live-only signal found after the backtest probe missed, elapsed = 16 min");
});
