# 🧿 @backtest-kit/sidekick

> The fastest way to start a [backtest-kit](https://www.npmjs.com/package/backtest-kit) trading bot — but the *full-control* one. Scaffolds a complete multi-timeframe crypto strategy where every wire (exchange, frames, risk, actions, runner) is editable source in **your** project: a 4H trend filter + 15m signal generator in Pine Script, partial profit taking, breakeven trailing stops, and risk validation.

![screenshot](https://raw.githubusercontent.com/tripolskypetr/backtest-kit/HEAD/assets/screenshots/screenshot16.png)

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@backtest-kit/sidekick.svg?style=flat-square)](https://npmjs.org/package/@backtest-kit/sidekick)
[![License](https://img.shields.io/npm/l/@backtest-kit/sidekick.svg)](https://github.com/tripolskypetr/backtest-kit/blob/master/LICENSE)

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npx -y @backtest-kit/sidekick my-trading-bot
cd my-trading-bot && npm start
```

---

## Init vs. Sidekick — pick your level of control

`@backtest-kit/cli --init` keeps the boilerplate *inside* the CLI; your repo holds only strategy files. **Sidekick is the "eject":** it writes the entire wiring — exchange adapter, frames, risk rules, actions, bootstrap, runner — as plain, editable source in your project, with no CLI in the loop and nothing hidden. Choose Sidekick when you want to read and own every line, not just the strategy.

What you get out of the box: a working multi-timeframe Pine Script strategy (4H trend + 15m signals), SL/TP distance risk validation, partial profit taking + breakeven trailing stops, cache utilities and debug scripts, a `CLAUDE.md` for AI-assisted iteration, and environment config.

- 🚀 **Zero config** — one command, no setup.
- 📊 **Multi-timeframe** — 4H trend filter (RSI+MACD+ADX) + 15m entries (EMA crossover + volume spike + momentum).
- 📜 **Pine Script v5** — strategies run locally via `@backtest-kit/pinets`, no TradingView.
- 🛡️ **Risk management** — SL/TP distance validation, 33/33/34 partial profit, breakeven trailing.
- 🔄 **Full lifecycle** — scheduled/opened/closed/cancelled event logging.
- 🔌 **Binance via CCXT** — OHLCV, order-book depth, tick-precise formatting.
- 🕐 **Historical frames** — bull, sharp-drop, and sideways periods predefined.
- 🎨 **Web dashboard** — `@backtest-kit/ui` charting.
- 💾 **Crash-safe storage** — atomic persistence for backtest and live.

---

## The strategy it scaffolds

<details>
<summary>4H trend filter (timeframe_4h.pine)</summary>

Classifies the market regime from three indicators:

| Regime | Condition |
|--------|-----------|
| **AllowLong** | ADX > 25, MACD histogram > 0, DI+ > DI−, RSI > 50 |
| **AllowShort** | ADX > 25, MACD histogram < 0, DI− > DI+, RSI < 50 |
| **AllowBoth** | Strong trend, no clear bull/bear regime |
| **NoTrades** | ADX ≤ 25 (weak trend) |

</details>

<details>
<summary>15m signal generator (timeframe_15m.pine)</summary>

EMA crossover confirmed by volume and momentum:

- **Long** — EMA(5) crosses above EMA(13), RSI 40–65, price above EMA(50), volume spike (>1.5× MA), positive momentum.
- **Short** — EMA(5) crosses below EMA(13), RSI 35–60, price below EMA(50), volume spike, negative momentum.
- **SL/TP** — static 2% / 3% from entry. **Signal expiry** — 5 bars.

</details>

<details>
<summary>Risk filters & position management</summary>

**Risk filters:** reject signals with SL distance < 0.2% or TP distance < 0.2% (slippage protection); enforce trend alignment (longs rejected in a bear regime, shorts in a bull regime).

**Position management:** partial profit taking scales out at three levels — 33% at TP3, 33% at TP2, 34% at TP1; when breakeven is reached, the trailing stop is lowered by 3 points.

</details>

<details>
<summary>Backtest frames</summary>

| Frame | Period | Market note |
|-------|--------|-------------|
| `February2024` | Feb 1–29, 2024 | Bull run |
| `October2025` | Oct 1–31, 2025 | Sharp drop Oct 9–11 |
| `November2025` | Nov 1–30, 2025 | Sideways with downtrend |
| `December2025` | Dec 1–31, 2025 | Sideways, no clear direction |

</details>

---

## Generated project structure

Everything below lands as editable source in your project — this *is* the package's deliverable.

<details>
<summary>Full tree</summary>

```
my-trading-bot/
├── src/
│   ├── index.mjs                  # Entry point — loads config, logic, bootstrap
│   ├── main/bootstrap.mjs         # Mode dispatcher (backtest / paper / live)
│   ├── config/
│   │   ├── setup.mjs              # Logger, storage, notifications, UI server
│   │   ├── validate.mjs          # Schema validation for all enums
│   │   ├── params.mjs            # Environment variables (Ollama API key)
│   │   └── ccxt.mjs              # Binance exchange singleton via CCXT
│   ├── logic/
│   │   ├── strategy/main.strategy.mjs    # Main strategy — multi-TF signal logic
│   │   ├── exchange/binance.exchange.mjs # Exchange schema — candles, order book, formatting
│   │   ├── frame/*.frame.mjs             # Backtest time frames (Feb 2024, Oct–Dec 2025)
│   │   ├── risk/sl_distance.risk.mjs     # Stop-loss distance validation (≥0.2%)
│   │   ├── risk/tp_distance.risk.mjs     # Take-profit distance validation (≥0.2%)
│   │   └── action/
│   │       ├── backtest_partial_profit_taking.action.mjs
│   │       ├── backtest_lower_stop_on_breakeven.action.mjs
│   │       └── backtest_position_monitor.action.mjs
│   ├── classes/
│   │   ├── BacktestPartialProfitTakingAction.mjs  # Scale out at 3 TP levels
│   │   ├── BacktestLowerStopOnBreakevenAction.mjs # Trailing stop on breakeven
│   │   └── BacktestPositionMonitorAction.mjs      # Position event logger
│   ├── math/
│   │   ├── timeframe_4h.math.mjs   # 4H trend data — RSI, MACD, ADX, DI+/DI−
│   │   └── timeframe_15m.math.mjs  # 15m signal data — EMA, ATR, volume, momentum
│   ├── enum/                       # String constants for type-safe schema refs
│   └── utils/getArgs.mjs           # CLI argument parser with defaults
├── config/source/
│   ├── timeframe_4h.pine    # Pine Script v5 — Daily Trend Filter (RSI/MACD/ADX)
│   └── timeframe_15m.pine   # Pine Script v5 — Signal Strategy (EMA/ATR/Volume)
├── scripts/
│   ├── run_timeframe_15m.mjs # Standalone 15m Pine Script runner
│   ├── run_timeframe_4h.mjs  # Standalone 4H Pine Script runner
│   └── cache/
│       ├── cache_candles.mjs     # Pre-download OHLCV candles (1m/15m/4h)
│       ├── validate_candles.mjs  # Verify cached candle data integrity
│       └── cache_model.mjs       # Pull Ollama LLM model with progress bar
├── docker/ollama/
│   ├── docker-compose.yaml   # Ollama GPU container setup
│   └── watch.sh              # nvidia-smi monitor
├── CLAUDE.md                 # AI strategy development guide
├── .env                      # Environment variables
└── package.json
```

</details>

---

## CLI options & dependencies

```bash
npx -y @backtest-kit/sidekick my-bot   # named project
npx -y @backtest-kit/sidekick .        # current directory (must be empty)
```

<details>
<summary>Dependencies installed</summary>

| Package | Purpose |
|---------|---------|
| [backtest-kit](https://www.npmjs.com/package/backtest-kit) | Core backtesting / trading framework |
| [@backtest-kit/pinets](https://www.npmjs.com/package/@backtest-kit/pinets) | Pine Script v5 runtime for Node.js |
| [@backtest-kit/ui](https://www.npmjs.com/package/@backtest-kit/ui) | Interactive charting dashboard |
| [@backtest-kit/ollama](https://www.npmjs.com/package/@backtest-kit/ollama) | LLM inference integration |
| [ccxt](https://github.com/ccxt/ccxt) | Binance exchange connectivity |
| [functools-kit](https://www.npmjs.com/package/functools-kit) | `singleshot`, `randomString` utilities |
| [pinolog](https://www.npmjs.com/package/pinolog) | File-based structured logging |
| [openai](https://www.npmjs.com/package/openai) | OpenAI API client |
| [ollama](https://www.npmjs.com/package/ollama) | Ollama local LLM client |

</details>

## 🔗 Links

[Documentation](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html) · [GitHub](https://github.com/tripolskypetr/backtest-kit) · [Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)

## 🤝 Contribute

Found a bug or want a feature? [Open an issue](https://github.com/tripolskypetr/backtest-kit/issues) or submit a PR.

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
