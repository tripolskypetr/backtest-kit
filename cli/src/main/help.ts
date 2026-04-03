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
  --pine     <entry>    Execute a local .pine indicator file
  --dump                Fetch and save raw OHLCV candles
  --init                Scaffold a new project in the current directory
  --help                Print this help message

Backtest flags:

  --symbol      <string>   Trading pair (default: BTCUSDT)
  --strategy    <string>   Strategy name from addStrategySchema (default: first registered)
  --exchange    <string>   Exchange name from addExchangeSchema (default: first registered)
  --frame       <string>   Frame name from addFrameSchema (default: first registered)
  --cacheInterval <string> Comma-separated intervals to pre-cache (default: "1m, 15m, 30m, 4h")
  --noCache                Skip candle cache warming before the run
  --verbose                Log every candle fetch to stdout
  --ui                     Start web dashboard at http://localhost:60050
  --telegram               Send trade notifications to Telegram

Walker flags (--walker):

  --symbol        <string>   Trading pair (default: BTCUSDT)
  --cacheInterval <string>   Comma-separated intervals to pre-cache (default: "1m, 15m, 30m, 4h")
  --noCache                  Skip candle cache warming before the run
  --verbose                  Log every candle fetch to stdout
  --output        <string>   Output file base name (default: walker_{SYMBOL}_{TIMESTAMP})
  --json                     Save results as JSON to ./dump/<output>.json
  --markdown                 Save report as Markdown to ./dump/<output>.md

  Each positional argument is a strategy entry point. All strategy files are loaded without
  changing process.cwd() — .env is read from the working directory only.
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

  Module file ./modules/dump.module is loaded automatically if it exists.

Init flags (--init):

  --output <string>   Target directory name (default: backtest-kit-project)

  Scaffolds a project and runs scripts/fetch_docs.mjs to download library docs.

Module hooks (loaded automatically by each mode):

  modules/backtest.module   --backtest   Broker adapter for backtest
  modules/walker.module     --walker     Broker adapter for walker comparison
  modules/paper.module      --paper      Broker adapter for paper trading
  modules/live.module       --live       Broker adapter for live trading
  modules/pine.module       --pine       Exchange schema for PineScript runs
  modules/dump.module       --dump       Exchange schema for candle dumps

  Extensions .ts, .mjs, .cjs are tried automatically. Missing module = soft warning.

Environment variables:

  CC_TELEGRAM_TOKEN    Telegram bot token (required for --telegram)
  CC_TELEGRAM_CHANNEL  Telegram channel or chat ID (required for --telegram)
  CC_WWWROOT_HOST      UI server bind address (default: 0.0.0.0)
  CC_WWWROOT_PORT      UI server port (default: 60050)

Examples:

  node ${ENTRY_PATH} --backtest ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --backtest --symbol BTCUSDT --noCache --ui ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --walker ./content/feb_2026_v1.strategy.ts ./content/feb_2026_v2.strategy.ts ./content/feb_2026_v3.strategy.ts
  node ${ENTRY_PATH} --walker --symbol BTCUSDT --noCache --markdown ./content/feb_2026_v1.ts ./content/feb_2026_v2.ts
  node ${ENTRY_PATH} --paper --symbol ETHUSDT ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --live --ui --telegram ./content/feb_2026.strategy.ts
  node ${ENTRY_PATH} --pine ./math/feb_2026.pine --timeframe 15m --limit 500 --jsonl
  node ${ENTRY_PATH} --dump --symbol BTCUSDT --timeframe 15m --limit 500 --jsonl
  node ${ENTRY_PATH} --init --output my-trading-bot
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
