import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";

declare const __PACKAGE_VERSION__: string;

const ENTRY_PATH = "./node_modules/@backtest-kit/cli/build/index.mjs";

const HELP_TEXT = `
Usage:
  node index.mjs --<mode> [flags] [entry-point]

Modes:

  --backtest <entry>          Run strategy against historical candle data
  --walker   <entry...>       Run Walker A/B strategy comparison across multiple strategies
  --paper    <entry>          Paper trading (live prices, no real orders)
  --live     <entry>          Live trading with real orders
  --main     <entry>          Run an entry point with prepared environment, no trading harness
  --pine     <entry>    Execute a local .pine indicator file
  --editor              Open the Pine Script visual editor in the browser
  --dump                Fetch and save raw OHLCV candles
  --pnldebug            Simulate PnL per minute for a given entry price and direction
  --brokerdebug         Fire a single broker commit against the live broker adapter
  --simulator <ideas.jsonl> [config.json]  Feasibility probe over crowd ideas: is there a profitable corridor at all
  --tune      <ideas.jsonl> <config.json>   ONE out-of-sample shot of a frozen training artifact (point + author track)
  --flush  <entry...>   Delete report/log/markdown/agent folders from strategy dump dir
  --init                Scaffold a new project in the current directory
  --docker              Scaffold a Docker workspace for running strategies in a container
  --help                Print this help message

Backtest flags:

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --strategy    <string>   Strategy name from addStrategySchema (default: first registered)
  --exchange    <string>   Exchange name from addExchangeSchema (default: first registered)
  --frame       <string>   Frame name from addFrameSchema (default: first registered)
  --cacheInterval <string> Comma-separated intervals to pre-cache (default: "1m, 15m, 30m, 1h, 4h")
  --noCache                Skip candle cache warming before the run
  --noFlush                Skip removing report/log/markdown/agent folders before backtest run
  --verbose                Log every candle fetch to stdout
  --ui                     Start web dashboard at http://localhost:60050
  --telegram               Send trade notifications to Telegram

Walker flags (--walker):

  --symbol        <string>   Trading pair (default: BTCUSDT)
  --cacheInterval <string>   Comma-separated intervals to pre-cache (default: "1m, 15m, 30m, 1h, 4h")
  --noCache                  Skip candle cache warming before the run
  --noFlush                  Skip removing report/log/markdown/agent folders before walker run
  --verbose                  Log every candle fetch to stdout
  --output        <string>   Output file base name (default: walker_{SYMBOL}_{TIMESTAMP})
  --json                     Save results as JSON to ./dump/<output>.json
  --markdown                 Save report as Markdown to ./dump/<output>.md

  Each positional argument is a strategy entry point. While an entry point is loaded
  (and again before its strategy runs) process.cwd() is switched to its directory and
  restored afterwards; .env is read from the launch directory first, then from the
  entry point directory (the latter wins).
  addWalkerSchema is called automatically using the registered exchange and frame.
  After comparison completes the report is printed to stdout (or saved if --json/--markdown).

  Module file ./modules/walker.module is loaded automatically if it exists.

Paper / Live flags:

  --symbol    <string>   Trading pair (default: BTCUSDT)
  --strategy  <string>   Strategy name (default: first registered)
  --exchange  <string>   Exchange name (default: first registered)
  --verbose              Log every candle fetch to stdout
  --ui                   Start web dashboard
  --telegram             Send Telegram notifications

Main flags (--main):

  --noFlush              Skip removing report/log/markdown/agent folders before the run

  Prepares the runtime environment (loads .env, setup.config, loader.config and
  modules/main.module) and runs the single positional entry point — but does NOT
  start any trading harness. Unlike --backtest/--live/--walker, the CLI never calls
  Backtest/Live/Walker.background; the entry point decides what to run.

  Exactly one positional entry point is required. process.cwd() is changed to the
  entry point directory and its local .env is loaded.

  Backtest, Live and Walker runs started from userspace are still tracked: the run
  finishes automatically when one of them completes, Ctrl+C stops any active run,
  and a second Ctrl+C force-quits.

  Module file ./modules/main.module is loaded automatically if it exists.

PineScript flags (--pine):

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --timeframe   <string>   Candle interval (default: 15m)
  --limit       <string>   Number of candles to fetch (default: 250)
  --when        <string>   End date — ISO 8601 or Unix ms (default: now)
  --exchange    <string>   Exchange name (default: first registered)
  --output      <string>   Output file base name without extension
  --json                   Save output as JSON array to <pine-dir>/dump/<output>.json
  --jsonl                  Save output as JSONL to <pine-dir>/dump/<output>.jsonl
  --markdown               Save output as Markdown table to <pine-dir>/dump/<output>.md

  Only plot() calls with display=display.data_window produce output columns.
  Module file ./modules/pine.module is loaded automatically if it exists.

Candle dump flags (--dump):

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --timeframe   <string>   Candle interval (default: 15m)
  --limit       <string>   Number of candles (default: 250)
  --when        <string>   End date — ISO 8601 or Unix ms (default: now)
  --exchange    <string>   Exchange name (default: first registered)
  --output      <string>   Output file base name (default: {SYMBOL}_{LIMIT}_{TIMEFRAME}_{TIMESTAMP})
  --json                   Save as JSON array to ./dump/<output>.json
  --jsonl                  Save as JSONL to ./dump/<output>.jsonl
  --markdown               Save as Markdown table to ./dump/<output>.md

  Module file ./modules/dump.module is loaded automatically if it exists.

PnL debug flags (--pnldebug):

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --priceopen   <number>   Entry price (required)
  --direction   <string>   Position direction: long or short (default: long)
  --when        <string>   Start timestamp — ISO 8601 or Unix ms (default: now)
  --minutes     <string>   Number of 1m candles to simulate (default: 60)
  --exchange    <string>   Exchange name (default: first registered)
  --output      <string>   Output file base name (default: {SYMBOL}_{DIRECTION}_{PRICEOPEN}_{TIMESTAMP})
  --json                   Save as JSON array to ./dump/<output>.json
  --jsonl                  Save as JSONL to ./dump/<output>.jsonl
  --markdown               Save as Markdown table to ./dump/<output>.md

  Module file ./modules/pnldebug.module is loaded automatically if it exists.

Broker debug flags (--brokerdebug):

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --exchange    <string>   Exchange name (default: first registered)
  --commit      <string>   Commit type to fire: signal-open, signal-close, partial-profit,
                           partial-loss, average-buy, trailing-stop, trailing-take, breakeven
                           (default: signal-open)

  Loads ./live.module, fetches the last candle for --symbol/--timeframe, and calls
  the selected broker commit with synthetic payload values derived from current price.

Simulator flags (--simulator):

  --symbol      <string>   Trading pair to simulate (default: BTCUSDT)
  --exchange    <string>   Exchange name (default: first registered)
  --output      <string>   Output file base name (default: simulator_{SYMBOL}_{TIMESTAMP})
  --json                   Save full ISimulatorResult to ./dump/<output>.json
  --markdown               Save summary report to ./dump/<output>.md
  --verbose                Log every simulator lifecycle callback to the console

  Positionals: path to an ideas .jsonl file — one idea per line with the exact shape
  { "id": number, "ts": number, "symbol": string, "direction": "LONG"|"SHORT"|"NEUTRAL",
  "author": string } — and an OPTIONAL config .json with the shape
  { "gridAxes"?: ISimulatorGridAxes, "reportOrder"?: "sharpe"|"sortino"|"pnl"|"recovery" }.
  Both files are validated BEFORE any work; a mismatch aborts the run with an error.
  No config -> an empty object is used and the engine defaults apply (the full
  default grid axes and reportOrder "sharpe" of the connection service).

  A FEASIBILITY PROBE, not an out-of-sample shot (that is --tune): the grid from
  the config (or the engine default) answers one question — does the feed contain
  a profitable corridor at all. One candle pass per idea to the grid's longest
  hold, flood dedupe (one idea per author per direction per 8h), default-ban
  author filter graded inside each point's own hold window, time-based
  Sharpe/Sortino, per-metric buckets with their own ranking winners and ban
  dictionaries. Ideas of other symbols are filtered out — one shared feed serves
  any --symbol.

  No output flag → print the Markdown summary to stdout. With --verbose every
  simulator lifecycle callback (onProgress, onIdeas, onProfiles, onAuthorsTrained,
  onGridPoint, onRanking, onDone) is logged to the console as it fires.

  Module file ./modules/simulator.module is loaded automatically if it exists
  (register your exchange there); without it CCXT Binance is used by default.

Tune flags (--tune):

  --symbol      <string>   Trading pair to test (default: BTCUSDT)
  --exchange    <string>   Exchange name (default: first registered)
  --output      <string>   Output file base name (default: tune_{SYMBOL}_{TIMESTAMP})
  --json                   Save the full ISimulatorTestResult to ./dump/<output>.json
  --markdown               Save the out-of-sample report to ./dump/<output>.md
  --verbose                Log simulator lifecycle callbacks to the console

  Positionals: path to an ideas .jsonl file (same shape and validation as
  --simulator) and a config .json carrying the FROZEN training artifact:
  { "point": ISimulatorGridPoint, "authorStats": [{ "author", "ideas", "hits" }],
  "gridAxes"?, "reportOrder"? }. The point and authorStats are REQUIRED — without
  them there is nothing to test and the run aborts with an error. gridAxes are
  optional: by default they mirror the frozen point one value per axis (the grid
  is inert for a test).

  ONE OUT-OF-SAMPLE SHOT, no training: the CLI never runs the sweep — pick your
  candidate elsewhere (a Simulator.run of your own), freeze its point and raw
  author track record into the config, and fire it once here via Simulator.test.
  Bans are re-derived from the frozen numbers under the point's rule; authors
  unseen in the config are banned by default. The report carries the result with
  the trade list and the frozen track record with re-derived ban flags.

  Module file ./modules/tune.module is loaded automatically if it exists
  (register your exchange there); without it CCXT Binance is used by default.

Flush flags (--flush):

  One or more positional entry points. For each entry point the following
  subdirectories are removed from <entry-dir>/dump/:

    report   log   markdown   agent

Init flags (--init):

  --output <string>   Target directory name (default: backtest-kit-project)

  Scaffolds a project and runs scripts/fetch_docs.mjs to download library docs.

Docker flags (--docker):

  --output <string>   Target directory name (default: backtest-kit-docker)

  Scaffolds a Docker workspace: docker-compose.yaml, .env.example, package.json,
  tsconfig.json, and a sample strategy under content/. Run npm install then
  docker compose up to start the container.

Module hooks (loaded automatically by each mode):

  modules/backtest.module   --backtest   Broker adapter for backtest
  modules/walker.module     --walker     Broker adapter for walker comparison
  modules/paper.module      --paper      Broker adapter for paper trading
  modules/live.module       --live       Broker adapter for live trading
  modules/main.module       --main       Environment setup for a custom entry point
  modules/pine.module       --pine       Exchange schema for PineScript runs
  modules/editor.module     --editor     Exchange schema for the visual Pine editor
  modules/dump.module       --dump       Exchange schema for candle dumps
  modules/pnldebug.module   --pnldebug      Exchange schema for PnL debug runs
  modules/brokerdebug.module  --brokerdebug   Broker adapter used for broker commit testing
  modules/simulator.module  --simulator     Exchange schema for the crowd-ideas feasibility probe
  modules/tune.module       --tune          Exchange schema for the walk-forward parameter search

  --flush has no associated module. It only removes dump subdirectories.

  Extensions .ts, .mjs, .cjs are tried automatically. Missing module = soft warning.

Environment variables:

  CC_TELEGRAM_TOKEN    Telegram bot token (required for --telegram)
  CC_TELEGRAM_CHANNEL  Telegram channel or chat ID (required for --telegram)
  CC_WWWROOT_HOST      UI server bind address (default: 0.0.0.0)
  CC_WWWROOT_PORT      UI server port (default: 60050)

Examples:

  node ${ENTRY_PATH} --backtest ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --backtest --symbol BTCUSDT --noCache --noFlush --ui ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --walker ./content/feb_2026_v1.strategy.ts ./content/feb_2026_v2.strategy.ts ./content/feb_2026_v3.strategy.ts
  node ${ENTRY_PATH} --walker --symbol BTCUSDT --noCache --noFlush --markdown ./content/feb_2026_v1.ts ./content/feb_2026_v2.ts
  node ${ENTRY_PATH} --paper --symbol ETHUSDT ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --live --ui --telegram ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --main ./tools/fetch_fear_and_greed.ts
  node ${ENTRY_PATH} --pine ./math/feb_2026.pine --timeframe 15m --limit 500 --jsonl
  node ${ENTRY_PATH} --editor
  node ${ENTRY_PATH} --dump --symbol BTCUSDT --timeframe 15m --limit 500 --jsonl
  node ${ENTRY_PATH} --pnldebug --symbol BTCUSDT --priceopen 64069.50 --direction short --when "2025-02-25" --minutes 120
  node ${ENTRY_PATH} --pnldebug --priceopen 67956.73 --direction long --when 1772064000000 --minutes 60 --markdown
  node ${ENTRY_PATH} --brokerdebug --commit signal-open --symbol BTCUSDT
  node ${ENTRY_PATH} --brokerdebug --commit partial-profit --symbol ETHUSDT
  node ${ENTRY_PATH} --simulator --symbol BTCUSDT ./assets/tv-ideas.normalized.jsonl
  node ${ENTRY_PATH} --simulator --symbol BTCUSDT --json --output jun_2026_probe ./assets/tv-ideas.normalized.jsonl ./assets/probe.config.json
  node ${ENTRY_PATH} --tune --symbol BTCUSDT ./assets/tv-ideas.normalized.jsonl
  node ${ENTRY_PATH} --tune --symbol BTCUSDT --markdown --output jun_2026_tune ./assets/tv-ideas.normalized.jsonl ./assets/tune.config.json
  node ${ENTRY_PATH} --flush ./content/feb_2026.strategy/feb_2026.strategy.ts
  node ${ENTRY_PATH} --flush ./content/feb_2026.strategy/feb_2026.strategy.ts ./content/feb_2026.strategy/feb_2026.test.ts
  node ${ENTRY_PATH} --init --output my-trading-bot
  node ${ENTRY_PATH} --docker --output my-docker-workspace
`.trimStart();

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.help) {
    return;
  }

  process.stdout.write(`@backtest-kit/cli ${__PACKAGE_VERSION__}\n\n`);
  process.stdout.write(HELP_TEXT);
  process.exit(0);
};

main();
