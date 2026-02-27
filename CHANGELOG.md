# TypeScript Support for CLI (v3.4.0, 27/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.4.0)

## Native TypeScript Strategy Files

`@backtest-kit/cli` now runs `.ts` strategy files directly — no compilation step required. Pass your TypeScript file to the CLI just like any `.js` file.

### How it works

Under the hood, the CLI uses `@babel/standalone` with the `env` + `typescript` presets to transpile code on the fly into UMD format, then executes it in the current Node.js process. All `backtest-kit` and `@backtest-kit/*` packages are pre-registered as UMD globals, so imports resolve correctly without bundling.

The loader tries three strategies in order:
1. `require()` — for pre-compiled CJS files
2. `import()` — for native ESM files
3. **Babel transpile + eval** — for `.ts`, `.tsx`, and plain `.js` sources

This means existing workflows continue to work unchanged, and TypeScript becomes a first-class option.

### `--debug` flag

Pass `--debug` to write the transpiled output to `./debug.js` for inspection:

```bash
npx backtest-kit run strategy.ts --debug
```



# DCA / Average-Buy Support (v3.3.0, 26/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.3.0)

## 🪓 Dollar Cost Averaging (DCA) Engine

Full DCA support added across the entire stack: engine logic, report generation, Telegram notifications, CLI live module interface, and E2E tests.

### `commitAverageBuy` — new public function

```typescript
import { commitAverageBuy } from "backtest-kit";

const added = await commitAverageBuy("BTCUSDT");
// returns false if price moved in wrong direction (rejection, not error)
```

Context-aware public API function that works in both backtest and live modes. Automatically reads `currentPrice`, `exchangeName`, `frameName`, and `strategyName` from the active execution context. Delegates to `averageBuy()` on the strategy engine.

**Averaging rules:**
- **LONG** — new entry price must be **below** the last recorded entry (averaging down)
- **SHORT** — new entry price must be **above** the last recorded entry (averaging up)

Returns `false` (without throwing) when the price condition is not satisfied. Throws if called outside an execution context.

### `Backtest.commitAverageBuy` and `Live.commitAverageBuy`

Both static utility classes expose `commitAverageBuy(symbol, currentPrice, context)` for use outside strategy callbacks (e.g., test scripts or external automation).

### `StrategyCommitContract` — `AverageBuyCommit` added

New `AverageBuyCommit` variant in the discriminated union emitted on `strategyCommitSubject`:

```typescript
interface AverageBuyCommit extends SignalCommitBase {
  action: "average-buy";
  currentPrice: number;
  effectivePriceOpen: number;  // arithmetic mean of all _entry prices
  totalEntries: number;
  originalPriceOpen: number;
  // + full signal snapshot fields
}
```




# Analytics Dashboard (v3.2.0, 25/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.2.0)


## @backtest-kit/ui — Dashboard Page 📊

<img width="1920" height="1348" alt="image" src="https://github.com/user-attachments/assets/9a8e226e-99cc-4084-bbe3-a07b3102b5f6" />


New `/dashboard/:mode` page that gives a trader a complete, at-a-glance picture of strategy performance — without writing a single query or opening a spreadsheet. Supports two modes: **`live`** (real-time positions and account metrics) and **`backtest`** (historical simulation results). Switch between them from the dashboard's own toolbar.

The page aggregates data across **all registered symbols in parallel**, so multi-symbol strategies are covered automatically. A manual **Refresh** button clears the 45-second cache and forces a full reload. Signals can also be **exported to JSON** straight from the toolbar.

---

### Widget 1 — Revenue Cards (P&L Snapshot)

Four side-by-side cards, each showing accumulated profit/loss for a fixed time window: **Today**, **Yesterday**, **Last 7 days**, **Last 31 days**.

**What a trader reads instantly:**
- Is today green or red? The card background changes automatically — green for profit, red for loss, orange for flat.
- How does this week compare to last month? Two numbers, zero mental math.
- If a strategy degraded after a recent parameter tweak, the 7-day card turns red while the 31-day card is still green — a clear signal to investigate.

**Under the hood:** all P&L values are summed in the quote currency (USDT) across every symbol. Each card also shows the number of trades that contributed to the result, so a suspiciously large profit on one trade versus 50 small ones is immediately visible.

---

### Widget 2 — Trade Performance Gauge (SpeedDonut)

A half-circle gauge (speedometer style) that shows **total trades**, **profitable trades**, and **loss trades** as arc segments. A needle points to the current success ratio, and its color mirrors the segment it lands on — green for good, red for bad, orange in between.

**What a trader reads instantly:**
- Overall win rate at a glance — no numbers needed, the needle says it all.
- Whether the strategy is drifting toward more losses (needle creeps left over refresh cycles).
- If resolved and rejected counts are nearly equal, the orange zone triggers a review of entry conditions.

**Under the hood:** trades are classified as resolved (PnL > 0) or rejected (PnL ≤ 0). The arc segments are scaled proportionally to their max values, so the gauge stays readable regardless of total trade count.

---

### Widget 3 — Daily Trades Chart

A time-series line chart (powered by TradingView's `lightweight-charts`) showing **total trade count per day** over the full history of the dataset.

**What a trader reads instantly:**
- Activity spikes — days with unusually high trade counts often correlate with volatile market sessions or strategy misfires.
- Dead zones — stretches of zero trades may indicate missed opportunities or an overly restrictive filter.
- Trend direction — is the strategy becoming more or less active over time?

**On hover:** a tooltip shows the exact **Total / Resolved / Rejected** breakdown for that day, so a high-activity day with mostly red trades is immediately distinguishable from one with mostly green.

---

### Widget 4 — Success Rate Breakdown (per Symbol)

A scrollable list showing every symbol that has at least one completed trade, with four colored counters per row:

| Color | Meaning |
|-------|---------|
| 🟢 Green | Closed profitably **at Take Profit** price (TP hit within 0.5% tolerance) |
| 🔴 Red | Closed at a loss **at Stop Loss** price (SL hit within 0.5% tolerance) |
| 🔵 Blue | Closed profitably, but **not at TP** (early exit, manual close, partial fill) |
| 🟠 Orange | Closed at a loss, but **not at SL** (force-closed, liquidation, manual stop) |

**What a trader reads instantly:**
- Which symbols are generating clean TP hits versus messy exits — a high orange count means orders aren't reaching their targets.
- Whether stop losses are executing cleanly (high red) or getting overridden (high orange) — the difference matters for risk management.
- Which symbols to tune first: the one with 2 green and 40 orange gets attention before the one with 30 green and 5 red.

**Symbols are color-coded** with the same palette used across all other widgets, making cross-widget correlation trivial.

---

### Widget 5 — Signal Grid (Trade Log)

A paginated, infinite-scroll table of all individual signals, newest first. **Opened (pending) positions are pinned to the top** and highlighted in yellow so they stand out from completed trades.

**Columns per row:**
- Colored dot (symbol identifier)
- Symbol name
- Position direction: **LONG** (blue) or **SHORT** (orange)
- Entry price
- P&L % — green for profit, red for loss

**What a trader reads instantly:**
- Which positions are currently open and whether they are in profit or loss right now.
- The exact entry price and unrealized P&L for live positions (calculated in real time with slippage and fees).
- A quick scan of recent trades to spot patterns — e.g., all SHORT positions losing, all LONGs winning.

**Clicking any row** opens a detail panel with: symbol, position direction, open datetime, entry price, take profit, stop loss, and final P&L. No navigation away, no page reload.

**Unrealized P&L formula (live mode):** accounts for 0.1% slippage on entry and exit plus 0.1% maker/taker fee per leg. Partial closes are weighted correctly — a position closed 30% at one price and 70% at another is not averaged naively.

---

### Layout

The dashboard uses a responsive 12-column grid. On desktop all four P&L cards sit in a single row. The gauge, chart, success rate list, and signal grid each take half the screen width below. On tablet cards collapse to two per row; on mobile everything stacks to a single column. Heights scale to viewport so the key widgets are always fully visible without scrolling on a standard 1080p monitor.




# CLI Runner (v3.1.1, 24/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.1.1)

## @backtest-kit/cli 📟

New `@backtest-kit/cli` package — a zero-boilerplate command-line runner for backtest-kit strategies. Point it at your strategy entry point and run backtests, paper trading, or live bots without writing any infrastructure code.

**Execution Modes:**
- `--backtest` — runs strategy against historical candle data from a registered `FrameSchema`; auto-warms OHLCV cache for all required intervals before execution
- `--paper` — connects to live exchange prices but places no real orders; safe validation before going live
- `--live` — deploys a real trading bot with live order execution; requires exchange API keys in `.env`

**Optional Features:**
- `--ui` — launches `@backtest-kit/ui` web dashboard (configurable via `CC_WWWROOT_HOST` / `CC_WWWROOT_PORT`)
- `--telegram` — sends formatted HTML trade notifications with price charts via Telegram Bot API (requires `CC_TELEGRAM_TOKEN` / `CC_TELEGRAM_CHANNEL`)
- `--verbose` — logs each candle fetch with symbol, interval, and timestamp for cache debugging
- `--noCache` — skips automatic OHLCV cache warming for the backtest mode

**CLI Arguments:**

| Flag | Default | Description |
|------|---------|-------------|
| `--symbol` | `BTCUSDT` | Trading pair |
| `--strategy` | first registered | Strategy name |
| `--exchange` | first registered | Exchange name |
| `--frame` | first registered | Backtest frame name |
| `--cacheInterval` | `1m, 15m, 30m, 4h` | Comma-separated list of intervals to pre-cache |

**Mustache Notification Templates:**

All trade events have overridable templates: `opened`, `closed`, `scheduled`, `cancelled`, `risk`, `trailing-take`, `trailing-stop`, `breakeven`, `partial-profit`, `partial-loss`. Place custom `.mustache` files in `{strategy_dir}/template/` to override defaults.

**Live Module System:**

Optional `modules/live.module.mjs` lifecycle hooks called on every position event:

```javascript
export default class {
  onOpened(event) { ... }
  onClosed(event) { ... }
  onScheduled(event) { ... }
  onCancelled(event) { ... }
  onRisk(event) { ... }
  onPartialProfit(event) { ... }
  onPartialLoss(event) { ... }
  onTrailingTake(event) { ... }
  onTrailingStop(event) { ... }
  onBreakeven(event) { ... }
}
```

Supports both ES modules (`.mjs`) and CommonJS (`.cjs`) with automatic fallback.

**Monorepo Support:**

`ResolveService` changes the working directory to the strategy folder before execution and loads `.env` files in a cascade (root `.env` first, then strategy-specific overrides). All relative paths (`dump/`, `modules/`, `template/`) resolve within the strategy folder, providing complete per-strategy isolation.

**Get Started:**
```bash
npx -y @backtest-kit/cli --init
```

```json
{
  "scripts": {
    "backtest": "@backtest-kit/cli --backtest --symbol ETHUSDT --ui --telegram ./src/index.mjs",
    "paper":    "@backtest-kit/cli --paper ./src/index.mjs",
    "start":    "@backtest-kit/cli --live --ui ./src/index.mjs"
  }
}
```




# Frontend GUI & Pine Script Support (v3.0.0, 04/02/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/3.0.0)

# Frontend GUI Module 🖥️✨

New `@backtest-kit/ui` package delivers a full-stack UI framework for visualizing cryptocurrency trading signals, backtests, and real-time market data. Combines a Node.js backend server with a React dashboard - all in one package! 🚀

**Dashboard Views:**
- **Signal Opened** - Entry details with chart visualization
- **Signal Closed** - Exit details with PnL analysis
- **Signal Scheduled** - Pending orders awaiting activation
- **Signal Cancelled** - Cancelled orders with reasons
- **Risk Rejection** - Signals rejected by risk management
- **Partial Profit/Loss** - Partial position closures
- **Trailing Stop/Take** - Trailing adjustments visualization
- **Breakeven** - Breakeven level adjustments

Each view includes detailed information form, 1m/15m/1h candlestick charts, and JSON export.

```typescript
import { serve } from '@backtest-kit/ui';

// Start the UI server
serve('0.0.0.0', 60050);

// Dashboard available at http://localhost:60050
```

# Pine Script Language Support 📊🌲

New `@backtest-kit/pinets` package runs TradingView Pine Script strategies in Node.js! Execute your existing Pine Script indicators and generate trading signals - pure technical analysis with 1:1 syntax compatibility. Powered by [PineTS](https://github.com/QuantForgeOrg/PineTS). 🎯

**Features:**
- Pine Script v5/v6 with 1:1 TradingView compatibility
- 60+ indicators: SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, and more
- Load `.pine` files or pass code strings directly
- Full TypeScript support with generics for extracted data

**API Functions:**
| Function | Description |
|----------|-------------|
| `getSignal()` | Run Pine Script and get structured `ISignalDto` |
| `run()` | Run Pine Script and return raw plot data |
| `extract()` | Extract values from plots with custom mapping |
| `dumpPlotData()` | Dump plot data to markdown for debugging |
| `usePine()` | Register custom Pine constructor |
| `setLogger()` | Configure custom logger |
| `File.fromPath()` | Load Pine Script from `.pine` file |
| `Code.fromString()` | Use inline Pine Script code |

```typescript
import { File, getSignal } from '@backtest-kit/pinets';
import { addStrategy } from 'backtest-kit';

addStrategy({
  strategyName: 'pine-ema-cross',
  interval: '5m',
  riskName: 'demo',
  getSignal: async (symbol) => {
    const source = File.fromPath('strategy.pine');

    return await getSignal(source, {
      symbol,
      timeframe: '1h',
      limit: 100,
    });
  }
});
```

**Custom Plot Extraction:**

```typescript
import { File, run, extract } from '@backtest-kit/pinets';

const plots = await run(File.fromPath('indicators.pine'), {
  symbol: 'ETHUSDT',
  timeframe: '1h',
  limit: 200,
});

const data = await extract(plots, {
  rsi: 'RSI',
  macd: 'MACD',
  prevRsi: { plot: 'RSI', barsBack: 1 },
  trendStrength: { plot: 'ADX', transform: (v) => v > 25 ? 'strong' : 'weak' },
});
```

# Storage & Persistence Layer 💾

New unified storage API with pluggable adapters for signal data persistence:

```typescript
import { Storage, StorageLive, StorageBacktest } from "backtest-kit";

// Enable storage (subscribes to signal emitters)
const cleanup = Storage.enable();

// Find signal by ID (searches both backtest and live)
const signal = await Storage.findSignalById(signalId);

// List all signals by mode
const backtestSignals = await Storage.listSignalBacktest();
const liveSignals = await Storage.listSignalLive();

// Switch storage adapters
StorageBacktest.usePersist();  // File-based persistence
StorageBacktest.useMemory();   // In-memory (default for backtest)
StorageLive.useDummy();        // No-op storage
```





# API Refactoring (v2.0.3, 17/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/2.0.3)


**Breaking Changes - API Standardization** 🔧

Major API refactoring improves consistency, clarity, and reliability across the framework. Method names now better reflect their purpose and side effects, making code more maintainable and self-documenting.

**Core API Changes:**

1. **Backtest & Live Method Renaming** - All mutation methods now use `commit*` prefix to indicate state changes:
   - `cancel()` → `commitCancel()` - Cancel scheduled signals
   - `partialProfit()` → `commitPartialProfit()` - Close partial position at profit
   - `partialLoss()` → `commitPartialLoss()` - Close partial position at loss
   - `trailingStop()` → `commitTrailingStop()` - Adjust stop-loss trailing
   - `trailingTake()` → `commitTrailingTake()` - Adjust take-profit trailing
   - `breakeven()` → `commitBreakeven()` - Move stop-loss to entry price

2. **Action Handler Method Renaming** - Lifecycle methods use `*Available` suffix for milestone events:
   - `breakeven()` → `breakevenAvailable()` - Triggered when breakeven threshold reached
   - `partialProfit()` → `partialProfitAvailable()` - Triggered on profit milestones
   - `partialLoss()` → `partialLossAvailable()` - Triggered on loss milestones
   - `ping()` → split into `pingScheduled()` + `pingActive()` - Separate scheduled/active signal monitoring

3. **Enhanced Ping Events** - Better signal lifecycle tracking:
   - `pingScheduled()` - Called every minute while scheduled signal waits for activation
   - `pingActive()` - Called every minute while pending signal is active (position open)

**Improvements:**

4. **Ollama Timeout Protection** ⏱️ - All completion handlers now have 30-second inference timeout:
   - `runner.completion.ts` - Standard completion with timeout
   - `runner_outline.completion.ts` - Structured output completion with timeout
   - `runner_stream.completion.ts` - Streaming completion with timeout
   - Throws descriptive error on timeout instead of hanging indefinitely

5. **Exchange Data Deduplication** 🔍 - Candle data now filtered by timestamp:
   - Removes duplicate candles with identical timestamps
   - Logs warning when duplicates detected
   - Ensures data integrity for technical indicators

6. **Improved Method Name Consistency** - Internal method names aligned with public API:
   - `BACKTEST_METHOD_NAME_BREAKEVEN` constant added
   - All `METHOD_NAME_*` constants updated to reflect new naming

**Migration Guide:**

```typescript
// Before (v1.13.x)
await Backtest.cancel(symbol, context);
await Backtest.partialProfit(symbol, 30, price, context);
await Backtest.breakeven(symbol, price, context);

class MyAction extends ActionBase {
  async breakeven(event) { /* ... */ }
  async partialProfit(event) { /* ... */ }
  async ping(event) { /* ... */ }
}

// After (v1.14.0)
await Backtest.commitCancel(symbol, context);
await Backtest.commitPartiaAlProfit(symbol, 30, price, context);
await Backtest.commitBreakeven(symbol, price, context);

class MyAction extends ActionBase {
  async breakevenAvailable(event) { /* ... */ }
  async partialProfitAvailable(event) { /* ... */ }
  async pingScheduled(event) { /* scheduled signals */ }
  async pingActive(event) { /* active pending signals */ }
}
```

**Why These Changes:**

- **Clarity**: `commit*` prefix clearly indicates methods that modify state
- **Intent**: `*Available` suffix shows these are reactive event handlers, not commands
- **Consistency**: Unified naming convention across Backtest/Live classes
- **Separation**: Distinct ping handlers for different signal states improve event handling
- **Reliability**: Timeout protection prevents hanging on slow LLM inference




# 🎯 Event-Driven Trading Automation (v1.13.1, 16/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.13.1)

**Event-Driven Action Handlers** 🔔⚡

Revolutionary action system transforms backtest-kit into a true event bus for trading automation! The new `ActionBase` class provides extensible event handlers that react to all trading lifecycle events: signal state changes, breakeven milestones, partial profit/loss levels, scheduled signal monitoring, and risk rejections. Actions integrate seamlessly with state management (Redux-like, [state-reducer pattern](https://ivanmontiel.medium.com/discovering-the-state-reducer-pattern-3f324bb1a4c4)), real-time notifications (Telegram, Discord), logging systems, and analytics platforms. Each strategy can attach multiple actions with isolated context and guaranteed lifecycle management. 🚀✨

```typescript
import { ActionBase, addAction, addStrategy } from "backtest-kit";

// Create custom action handler by extending ActionBase
class TelegramNotifier extends ActionBase {
  private bot: TelegramBot | null = null;

  // Initialize resources (called once)
  async init() {
    super.init(); // Call parent for logging
    this.bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
    await this.bot.connect();
    console.log(`Telegram notifier initialized for ${this.strategyName}`);
  }

  // Handle all signal events (backtest + live)
  async signal(event: IStrategyTickResult) {
    super.signal(event);
    if (event.action === 'opened') {
      await this.bot.send(
        `🚀 [${this.strategyName}/${this.frameName}] Signal opened!\n` +
        `Position: ${event.signal.position}\n` +
        `Entry: ${event.signal.priceOpen}\n` +
        `TP: ${event.signal.priceTakeProfit}\n` +
        `SL: ${event.signal.priceStopLoss}`
      );
    }
    if (event.action === 'closed') {
      const emoji = event.signal.revenue > 0 ? '✅' : '❌';
      await this.bot.send(
        `${emoji} Signal closed!\n` +
        `PNL: ${event.signal.revenue.toFixed(2)}%`
      );
    }
  }

  // Handle live-only events (production notifications)
  async signalLive(event: IStrategyTickResult) {
    super.signalLive(event);
    if (event.action === 'opened') {
      await this.bot.send('⚠️ REAL TRADE OPENED IN PRODUCTION!');
    }
  }

  // Handle breakeven milestone
  async breakeven(event: BreakevenContract) {
    super.breakeven(event);
    await this.bot.send(
      `🛡️ Breakeven protection activated!\n` +
      `Stop-loss moved to entry: ${event.data.priceOpen}`
    );
  }

  // Handle profit milestones (10%, 20%, 30%...)
  async partialProfit(event: PartialProfitContract) {
    super.partialProfit(event);
    await this.bot.send(
      `💰 Profit milestone reached: ${event.level}%\n` +
      `Current price: ${event.currentPrice}`
    );
  }

  // Handle loss milestones (-10%, -20%, -30%...)
  async partialLoss(event: PartialLossContract) {
    super.partialLoss(event);
    await this.bot.send(
      `⚠️ Loss milestone: -${event.level}%\n` +
      `Current price: ${event.currentPrice}`
    );
  }

  // Monitor scheduled signals (called every minute while waiting)
  async ping(event: PingContract) {
    const waitTime = Date.now() - event.data.timestampScheduled;
    const waitMinutes = Math.floor(waitTime / 60000);
    if (waitMinutes > 30) {
      await this.bot.send(
        `⏰ Scheduled signal waiting ${waitMinutes} minutes\n` +
        `Entry target: ${event.data.priceOpen}`
      );
    }
  }

  // Track risk rejections
  async riskRejection(event: RiskContract) {
    super.riskRejection(event);
    await this.bot.send(
      `🚫 Signal rejected by risk management!\n` +
      `Reason: ${event.rejectionNote}\n` +
      `Active positions: ${event.activePositionCount}`
    );
  }

  // Cleanup resources (called once on disposal)
  async dispose() {
    super.dispose();
    await this.bot?.disconnect();
    this.bot = null;
    console.log('Telegram notifier disposed');
  }
}

// Register the action
addAction({
  actionName: "telegram-notifier",
  handler: TelegramNotifier
});

// Attach to strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "1m",
  actions: ["telegram-notifier"], // ← Attach action
  getSignal: async () => { /* ... */ }
});
```

**ActionBase Event Handler Methods** 📋

All methods have default implementations (only override what you need):

- **`init()`** - Called once after construction. Use for async setup: database connections, API clients, file handles.
- **`signal(event)`** - Called every tick/candle (all modes). Receives all signal states: idle, scheduled, opened, active, closed, cancelled.
- **`signalLive(event)`** - Called only in live mode. Use for production notifications and real order placement.
- **`signalBacktest(event)`** - Called only in backtest mode. Use for backtest metrics and test-specific logic.
- **`breakeven(event)`** - Called once when stop-loss moves to entry price (threshold: fees + slippage × 2).
- **`partialProfit(event)`** - Called at profit levels: 10%, 20%, 30%... Each level triggered exactly once per signal.
- **`partialLoss(event)`** - Called at loss levels: -10%, -20%, -30%... Each level triggered exactly once per signal.
- **`ping(event)`** - Called every minute while scheduled signal is waiting for activation.
- **`riskRejection(event)`** - Called when signal fails risk validation.
- **`dispose()`** - Called once on cleanup. Use to close connections, flush buffers, save state.

**Redux State Management Example** 🏗️

```typescript
import { ActionBase, addAction } from "backtest-kit";

class ReduxAction extends ActionBase {
  constructor(
    strategyName: StrategyName,
    frameName: FrameName,
    actionName: ActionName,
    private store: Store
  ) {
    super(strategyName, frameName, actionName);
  }

  signal(event: IStrategyTickResult) {
    this.store.dispatch({
      type: 'STRATEGY_SIGNAL',
      payload: {
        event,
        strategyName: this.strategyName,
        frameName: this.frameName,
        timestamp: Date.now()
      }
    });
  }

  breakeven(event: BreakevenContract) {
    this.store.dispatch({
      type: 'BREAKEVEN_REACHED',
      payload: { event, strategyName: this.strategyName }
    });
  }

  partialProfit(event: PartialProfitContract) {
    this.store.dispatch({
      type: 'PARTIAL_PROFIT',
      payload: { event, level: event.level }
    });
  }

  riskRejection(event: RiskContract) {
    this.store.dispatch({
      type: 'RISK_REJECTION',
      payload: { event, reason: event.rejectionNote }
    });
  }
}

// Register with dependency injection
addAction({
  actionName: "redux-store",
  handler: (strategyName, frameName, actionName) =>
    new ReduxAction(strategyName, frameName, actionName, store)
});
```

**Callback-Based Actions (No Class Required)** 🎯

```typescript
import { addAction } from "backtest-kit";

// Simple object-based action
addAction({
  actionName: "event-logger",
  handler: {
    init: () => {
      console.log('Logger initialized');
    },
    signal: (event) => {
      if (event.action === 'opened') {
        console.log('Signal opened:', event.signal.id);
      }
    },
    breakeven: (event) => {
      console.log('Breakeven at:', event.currentPrice);
    },
    dispose: () => {
      console.log('Logger disposed');
    }
  },
  callbacks: {
    onInit: (actionName, strategyName, frameName, backtest) => {
      console.log(`[${strategyName}/${frameName}] Logger started`);
    },
    onSignal: (event, actionName, strategyName, frameName, backtest) => {
      console.log(`[${strategyName}] Event: ${event.action}`);
    }
  }
});
```

**Multiple Actions Per Strategy** 🔗

```typescript
addStrategy({
  strategyName: "production-bot",
  interval: "5m",
  actions: [
    "telegram-notifier",  // Real-time notifications
    "redux-store",        // State management
    "event-logger",       // Logging
    "analytics-tracker"   // Metrics collection
  ],
  getSignal: async () => { /* ... */ }
});
```

**Action Context Awareness** 🎯

Every action receives full context via constructor:

```typescript
class MyAction extends ActionBase {
  constructor(
    public readonly strategyName: StrategyName,  // "my-strategy"
    public readonly frameName: FrameName,        // "1d-backtest"
    public readonly actionName: ActionName       // "my-action"
  ) {
    super(strategyName, frameName, actionName);
    console.log(`Action ${actionName} created for ${strategyName}/${frameName}`);
  }
}
```

**Architecture & Lifecycle** 🏗️

```
Registration Flow:
  addAction({ actionName, handler })
    → ActionValidationService (validates & registers)
    → ActionSchemaService (stores schema)

Execution Flow:
  Strategy.tick() or Backtest.run()
    → ActionCoreService.initFn()
      → For each action: ClientAction.waitForInit()
        → handler.init() [once]
    → On each tick/candle:
      → ActionCoreService.signal()
        → For each action: ClientAction.signal()
          → handler.signal() + callbacks
    → On breakeven threshold:
      → ActionCoreService.breakeven()
        → For each action: handler.breakeven()
    → On partial profit/loss levels:
      → ActionCoreService.partialProfit/Loss()
        → For each action: handler.partialProfit/Loss()
    → On scheduled signal ping:
      → ActionCoreService.ping()
        → For each action: handler.ping()
    → On risk rejection:
      → ActionCoreService.riskRejection()
        → For each action: handler.riskRejection()
    → On disposal:
      → ActionCoreService.dispose()
        → For each action: handler.dispose() [once]

Lifecycle Guarantees:
  - init() called exactly once (singleshot pattern)
  - dispose() called exactly once (singleshot pattern)
  - Events auto-initialize handler if needed (lazy loading)
  - Error isolation: one failing action doesn't break others
  - Memoization: one ClientAction instance per strategy-frame-action
```

**Service Architecture** 📦

- **ActionCoreService** - Global dispatcher routing actions to all handlers
- **ActionConnectionService** - Memoized ClientAction instance management
- **ActionValidationService** - Schema registry and validation
- **ActionSchemaService** - Action schema storage
- **ClientAction** - Lifecycle wrapper with lazy initialization and error handling

**Event Sources** 🔔

- **StrategyConnectionService** → signal, signalLive, signalBacktest, ping
- **BreakevenConnectionService** → breakeven
- **PartialConnectionService** → partialProfit, partialLoss
- **RiskConnectionService** → riskRejection




# 🤗 JSONL Event Logging (v1.11.2, 11/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.11.2)

**JSONL Event Logging for Analytics** 📊✨

> P.S. JSONL is the native format for Claude Code, HuggingFace, OpenAI and Llama. That means finally `backtest-kit` can be used as [Claude Code skill](https://code.claude.com/docs/en/skills)

New `Report` utility class provides structured event logging to JSONL (JSON Lines) files for post-processing analytics and data pipelines! All trading events (signals, partial closes, breakeven, risk rejections, etc.) can now be logged to append-only JSONL files with full metadata for filtering and search. Features pluggable storage adapters, automatic backpressure handling, and real-time event streaming. Perfect for building custom analytics dashboards, machine learning datasets, and audit trails. 🚀

```ts
import { Report } from "backtest-kit";

// Enable JSONL logging for all services
const unsubscribe = Report.enable({
  backtest: true,      // Log closed signals
  live: true,          // Log all tick events
  risk: true,          // Log risk rejections
  schedule: true,      // Log scheduled signals
  breakeven: true,     // Log breakeven events
  partial: true,       // Log partial closes
  heat: true,          // Log heatmap data
  walker: true,        // Log walker iterations
  performance: true,   // Log performance metrics
});

// Events are written to ./dump/report/{reportName}.jsonl
// Each line contains: { reportName, data, symbol, strategyName, exchangeName, frameName, signalId, timestamp }

// Disable logging when done
unsubscribe();

// Or switch to dummy adapter (no-op)
Report.useDummy();

// Switch back to JSONL
Report.useJsonl();
```

**Custom Report Storage Adapters** 🔌

Implement custom storage backends with the adapter pattern! Create your own `TReportBase` implementation to send events to databases, message queues, cloud storage, or any other destination. The system automatically handles initialization, memoization, and cleanup. 🏗️

```ts
import { Report, TReportBase, ReportName, IReportDumpOptions } from "backtest-kit";

class PostgresReportAdapter implements TReportBase {
  constructor(readonly reportName: ReportName, readonly baseDir: string) {
    // Connect to PostgreSQL
  }

  async waitForInit(initial: boolean): Promise<void> {
    // Initialize tables
  }

  async write<T = any>(data: T, options: IReportDumpOptions): Promise<void> {
    // INSERT INTO events (report_name, data, symbol, ...) VALUES (...)
  }
}

// Use custom adapter
Report.useReportAdapter(PostgresReportAdapter);
```

**Enhanced Markdown Reports with Column Definitions** 📝

New column definition system provides fine-grained control over markdown table structure! Configure which columns to display, how to format values, and conditional visibility rules. Pre-built column sets for backtest, live, risk, and schedule reports included. 🎨

```ts
import {
  backtest_columns,
  live_columns,
  risk_columns,
  schedule_columns
} from "backtest-kit";

// backtest_columns includes:
// - Signal ID, Symbol, Position, Note
// - Open/Close Price, TP/SL, Original TP/SL
// - PNL (net), Total Executed, Partial Closes
// - Close Reason, Duration, Timestamps

// live_columns includes:
// - Signal ID, Symbol, Position, Note
// - Current Price, TP/SL, Original TP/SL
// - PNL (net), Total Executed, Partial Closes
// - Progress to TP/SL, Active Duration, Timestamps

// risk_columns includes:
// - Symbol, Position, Rejection Reason
// - Price levels and validation errors

// schedule_columns includes:
// - Signal ID, Symbol, Position
// - Price Open, Current Price, TP/SL
// - Wait Time, Event Type, Timestamps
```

**Improved Markdown Service with Dual Adapters** 📂

The `Markdown` utility class now supports two storage strategies: file-based (single markdown file per symbol) and folder-based (one file per signal). Both adapters use the same event listening system and column definitions. Folder-based mode is perfect for large datasets with thousands of signals. 🗂️

```ts
import { Markdown, MarkdownFileBase, MarkdownFolderBase } from "backtest-kit";

// Enable markdown reports (default: file-based)
const unsubscribe = Markdown.enable({
  backtest: true,
  live: true,
  risk: true,
  // ... other services
});

// Switch to folder-based storage
Markdown.useMarkdownAdapter(MarkdownFolderBase);

// Switch back to file-based storage
Markdown.useMarkdownAdapter(MarkdownFileBase);

// Disable markdown generation (dummy adapter)
Markdown.useDummy();
```

**Active Position PNL Tracking** 💰

The `IStrategyTickResultActive` event now includes real-time PNL calculation for open positions! Track unrealized profit/loss with fees, slippage, and partial closes already applied. No need to calculate PNL manually - it's available on every tick. ⚡

```ts
import { listenSignal} from "backtest-kit";

listenSignal((event) => {
  console.log(`Active position PNL: ${event.pnl.pnlPercentage.toFixed(2)}%`);
  console.log(`Gross PNL: ${event.pnl.pnlGross.toFixed(2)}%`);
  console.log(`Fees: ${event.pnl.totalFee.toFixed(2)}%`);
  console.log(`Slippage: ${event.pnl.totalSlippage.toFixed(2)}%`);
});
```

**Total Executed Tracking** 📈

New `totalExecuted` field on signal data tracks the cumulative percentage closed through partial executions! Sums all partial close percentages (both profit and loss types) to show exactly how much of the position remains open. Range: 0-100%, where 0 means no partials and 100 means fully closed via partials. 🎯

```ts
import { listenSignalBacktest } from "backtest-kit";

listenSignalBacktest((event) => {
  if (event.action === "active") {
    console.log(`Total executed: ${event.signal.totalExecuted.toFixed(1)}%`);
    console.log(`Remaining: ${(100 - event.signal.totalExecuted).toFixed(1)}%`);

    // Access partial close history
    const partials = event.signal._partial;
    console.log(`Partial closes: ${partials.length}`);
    partials.forEach(p => {
      console.log(`  ${p.type}: ${p.percent}% at ${p.price}`);
    });
  }
});
```

**Improved Partial Close API** ✅

The `partialProfit()` and `partialLoss()` methods now return `boolean` instead of `void`! Returns `true` if partial close was executed, `false` if skipped (would exceed 100%). Provides clear feedback for validation and logging. No more silent failures! 🛡️

```ts
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async () => { /* ... */ },
  callbacks: {
    onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
      if (percentTp >= 50) {
        const success = await strategy.partialProfit(symbol, 25, currentPrice, backtest);
        if (success) {
          console.log(`✅ Closed 25% at ${percentTp}% profit`);
        } else {
          console.log(`⚠️ Partial close skipped (would exceed 100%)`);
        }
      }
    },
  },
});
```



# Breakeven Protection (v1.10.1, 09/01/2026)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.10.1)

**Breakeven Stop-Loss Protection** 🛡️📈

New breakeven protection automatically moves stop-loss to entry price when profit threshold is reached! When the price moves far enough in profit direction, the system locks in a zero-risk position by moving SL to breakeven. The threshold is calculated as `(CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2` to account for trading costs. Breakeven is triggered exactly once per signal with crash-safe persistence and memory-optimized instance management. ✨

```ts
import {
  listenBreakeven,
  Backtest,
  Live,
} from "backtest-kit";

// Listen to breakeven events
listenBreakeven(({ symbol, signal, currentPrice, backtest }) => {
  console.log(`${symbol} signal #${signal.id} moved to breakeven at ${currentPrice}`);
  console.log(`Entry: ${signal.priceOpen}, Position: ${signal.position}`);
});

// Manual breakeven trigger (optional)
await Backtest.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

await Live.breakeven("BTCUSDT", currentPrice, {
  strategyName: "my-strategy",
  exchangeName: "binance"
});
```

**Breakeven Statistics & Reports** 📊

```ts
import { Breakeven } from "backtest-kit";

// Get statistical data
const stats = await Breakeven.getData("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});
console.log(stats);
// {
//   totalBreakeven: 42,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Breakeven.getReport("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Save to disk
await Breakeven.dump("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
}); // ./dump/breakeven/BTCUSDT_my-strategy.md
```

**Architecture** 🏗️

- **BreakevenGlobalService**: Global service layer with validation and logging
- **BreakevenConnectionService**: Connection layer with memoized ClientBreakeven instances
- **ClientBreakeven**: Core breakeven logic with state persistence
- **PersistBreakevenUtils**: Crash-safe state persistence to disk
- **BreakevenMarkdownService**: Event accumulation and report generation

Features:
- One ClientBreakeven instance per signal ID (memoized for performance)
- Automatic cleanup on signal close to prevent memory leaks
- File-based persistence in `./dump/data/breakeven/{symbol}_{strategy}/state.json`
- Real-time event emission via breakevenSubject
- Markdown reports with complete breakeven history




# Enhanced Risk Management (v1.6.1, 28/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.6.1)


**Advanced Risk Reporting & Analysis** 📊🛡️

Comprehensive risk management system with detailed reporting and validation! The new `Risk` utility class provides extensive analytics for risk rejection tracking and exposure monitoring. Generate markdown reports with complete history of rejected signals, risk validations, and detailed statistics. Features include the `MergeRisk` composite pattern for combining multiple risk profiles with logical AND validation. ✨

```ts
import { Risk } from "backtest-kit";

// Get risk rejection statistics for a symbol
const stats = await Risk.getData("BTCUSDT", "my-strategy");

// Generate markdown risk report
const report = await Risk.getReport("BTCUSDT", "my-strategy");

// Save risk report to disk
await Risk.dump("BTCUSDT", "my-strategy"); // ./dump/risk/BTCUSDT_my-strategy.md
```

**Schedule Reporting Enhancements** 📅

Enhanced scheduled signal reporting with detailed statistics! Track cancellation rates, average wait times, and complete history of scheduled orders. The `Schedule` utility class provides access to all schedule events including pending, activated, and cancelled signals. 🎯

```ts
import { Schedule } from "backtest-kit";

// Get schedule statistics
const stats = await Schedule.getData("BTCUSDT", "my-strategy");
console.log(`Cancellation rate: ${stats.cancellationRate}%`);
console.log(`Average wait time: ${stats.avgWaitTime} minutes`);

// Generate markdown schedule report
const report = await Schedule.getReport("BTCUSDT", "my-strategy");

// Save to disk
await Schedule.dump("BTCUSDT", "my-strategy"); // ./dump/schedule/BTCUSDT_my-strategy.md
```

**Caching & Performance** ⚡💾

New `Cache` utility class provides intelligent memoization for expensive operations! Candle data, price calculations, and exchange queries are automatically cached with timeframe-based invalidation. Memory-optimized storage prevents duplicate API calls during backtest and live trading modes. Cache is integrated automatically - no manual configuration needed! 🚀

```ts
import { Cache } from "backtest-kit";

const fetchMicroTermMath = Cache.fn(lib.microTermMathService.getReport, {
  interval: "1m",
});

const commitMicroTermMath = trycatch(
  async (symbol: string, history: History) => {
    const microTermMath = await fetchMicroTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== HISTORICAL 1-MINUTE CANDLE DATA ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "Historical 1-minute candle data has been received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchMicroTermMath),
  }
);
```

**Exchange Utilities** 🔧

New `Exchange` utility class provides helper functions for exchange-specific operations! The `ExchangeInstance` class offers methods for formatting prices and quantities according to exchange precision rules, integrated seamlessly with CCXT. 📈

```ts
import { Exchange } from "backtest-kit";

// Get exchange instance for specific exchange
const binance = Exchange.get("binance");

// Format price with exchange precision
const formattedPrice = await binance.formatPrice("BTCUSDT", 43521.123456);

// Format quantity with exchange precision
const formattedQty = await binance.formatQuantity("BTCUSDT", 0.123456789);
```

**LLM-Powered Signal Cancellation** 🤖🚫

New `listenPing` event enables dynamic signal cancellation based on LLM analysis! Monitor scheduled signals in real-time and cancel them if market conditions change. Perfect for avoiding Second-Order Chaos when thousands of bots trigger the same levels. Integrate with Ollama or OpenAI to analyze market context every minute and cancel signals before they activate. 🎯

```ts
import {
  listenPing,
  Backtest,
  getAveragePrice
} from "backtest-kit";
import { json } from "agent-swarm-kit";

// Listen to ping events for scheduled signals
listenPing(async (event) => {
  if (event.backtest) {
    console.log(`[Backtest] Monitoring ${event.symbol} signal #${event.data.id}`);
    console.log(`Strategy: ${event.strategyName}, Price: ${event.data.priceOpen}`);

    // Get current market conditions
    const currentPrice = await getAveragePrice(event.symbol);

    // Ask LLM to re-evaluate signal validity
    const { data, error } = await json("SignalReview", {
      symbol: event.symbol,
      signalId: event.data.id,
      position: event.data.position,
      priceOpen: event.data.priceOpen,
      currentPrice,
      timestamp: event.timestamp,
    });

    if (error) {
      console.error("LLM validation error:", error);
      return;
    }

    // Cancel signal if LLM detects bot cluster trap
    if (data.recommendation === "cancel") {
      console.log(`🚫 LLM detected trap: ${data.reasoning}`);
      console.log(`Cancelling signal #${event.data.id}...`);

      await Backtest.cancel(
        event.symbol,
        event.strategyName
      );

      console.log(`✅ Signal #${event.data.id} cancelled`);
    }
  }
});
```




# Partial Profit/Loss Tracking (v1.4.0, 03/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.4.0)

**Position Scaling with Fixed Levels** 📊💰

Now you can scale out positions at fixed profit/loss milestones (10%, 20%, 30%, ..., 100%)! The system automatically monitors signals and emits events when they reach specific percentage levels, enabling sophisticated risk management strategies like partial profit taking and dynamic stop-loss adjustments. Each level is triggered **exactly once per signal** with Set-based deduplication and crash-safe persistence. 🎯✨

```ts
import {
  listenPartialProfit,
  listenPartialLoss,
  Constant
} from "backtest-kit";

// Listen to all profit levels (10%, 20%, 30%, ...)
listenPartialProfit(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached ${level}% profit at ${price}`);

  // Scale out at Kelly-optimized levels
  if (level === Constant.TP_LEVEL3) {
    console.log("Close 33% at 25% profit");
  }
  if (level === Constant.TP_LEVEL2) {
    console.log("Close 33% at 50% profit");
  }
  if (level === Constant.TP_LEVEL1) {
    console.log("Close 34% at 100% profit");
  }
});

// Listen to all loss levels (10%, 20%, 30%, ...)
listenPartialLoss(({ symbol, signal, price, level, backtest }) => {
  console.log(`${symbol} reached -${level}% loss at ${price}`);

  // Scale out at stop levels
  if (level === Constant.SL_LEVEL2) {
    console.log("Close 50% at -50% loss");
  }
  if (level === Constant.SL_LEVEL1) {
    console.log("Close 50% at -100% loss");
  }
});
```

**New Event Listeners** 🎧

- **`listenPartialProfit(callback)`** - Emits for each profit level reached (10%, 20%, 30%, etc.)
- **`listenPartialLoss(callback)`** - Emits for each loss level reached (10%, 20%, 30%, etc.)
- **`listenPartialProfitOnce(filter, callback)`** - Fires once for first profit level
- **`listenPartialLossOnce(filter, callback)`** - Fires once for first loss level

**Constant Utility** 📐

Kelly Criterion-based constants for optimal position sizing:

```ts
import { Constant } from "backtest-kit";

// Take Profit Levels
Constant.TP_LEVEL1  // 100% (aggressive target)
Constant.TP_LEVEL2  // 50%  (moderate target)
Constant.TP_LEVEL3  // 25%  (conservative target)

// Stop Loss Levels
Constant.SL_LEVEL1  // 100% (maximum risk)
Constant.SL_LEVEL2  // 50%  (standard stop)
```

**Partial Statistics & Reports** 📈

```ts
import { Partial } from "backtest-kit";

// Get statistical data
const stats = await Partial.getData("BTCUSDT");
console.log(stats);
// {
//   totalEvents: 15,
//   totalProfit: 10,
//   totalLoss: 5,
//   eventList: [...]
// }

// Generate markdown report
const markdown = await Partial.getReport("BTCUSDT");

// Save to disk
await Partial.dump("BTCUSDT"); // ./dump/partial/BTCUSDT.md
```

**Strategy-Level Callbacks** 🎯

```ts
addStrategy({
  strategyName: "my-strategy",
  interval: "5m",
  getSignal: async (symbol) => { /* ... */ },
  callbacks: {
    onPartialProfit: (symbol, data, currentPrice, revenuePercent, backtest) => {
      console.log(`Signal ${data.id} at ${revenuePercent.toFixed(2)}% profit`);
    },
    onPartialLoss: (symbol, data, currentPrice, lossPercent, backtest) => {
      console.log(`Signal ${data.id} at ${lossPercent.toFixed(2)}% loss`);
    },
  },
});
```




# Immediate Activation (v1.3.0, 01/12/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.3.0)

**Smart Signal Activation** 🚀⚡

Now signals activate **immediately** when `priceOpen` is already in the activation zone — no more waiting for scheduled state when the price has already moved! LONG positions open instantly when current price (VWAP) is below `priceOpen`, and SHORT positions trigger immediately when price is above `priceOpen`. Enhanced validation prevents invalid signals from being created: immediate signals are rejected if current price has already breached StopLoss or TakeProfit levels. Strict boundary checks (`<`/`>` instead of `<=`/`>=`) allow signals when price exactly equals SL/TP boundaries. 🎯✨

```ts
// Example: Immediate LONG activation
{
  position: "long",
  priceOpen: 43000,      // Target entry price
  priceStopLoss: 41000,
  priceTakeProfit: 44000
}

// Current market conditions:
currentPrice (VWAP) = 42000  // Already below priceOpen!

// Before v1.3.0:
→ scheduled → waiting for price to fall to 43000

// After v1.3.0:
→ opened IMMEDIATELY (price already at desired level!)
```

**Validation Enhancements** 🛡️

- **Mandatory `isScheduled` parameter**: Validation now distinguishes between scheduled and immediate signals
- **Immediate signal protection**: Rejects signals if `currentPrice < priceStopLoss` for LONG or `currentPrice > priceStopLoss` for SHORT
- **Boundary-safe validation**: Changed from `<=`/`>=` to `<`/`>` to allow signals when price exactly equals SL/TP
- **No false rejections**: Signals can now be created when current price equals stop-loss or take-profit boundaries

**Breaking Changes** ⚠️

- `VALIDATE_SIGNAL_FN` now requires explicit `isScheduled: boolean` parameter (no default value)
- Test expectations updated to account for immediate activation behavior
- Scheduled signal counts may differ due to immediate activation in certain price conditions

See [test/README.md](./test/README.md) for comprehensive documentation on immediate activation patterns and updated test writing guidelines.




# Scheduled (Limit) Orders (v1.2.1, 29/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.2.1)

**Scheduled Positions with SL Protection** 🚀✨

Now LONG orders activate only when the candle’s low touches or breaks below `priceOpen`, while SHORT orders trigger when the high reaches or exceeds `priceOpen`. Most importantly — StopLoss is checked first on every candle: if a single candle hits both `priceOpen` and `priceStopLoss` at the same time, the signal is instantly cancelled and the position is never opened, protecting you from instant losses even in the wildest volatility spikes. 🛡️⚡ All edge cases are thoroughly tested and documented.

```ts
// Example: LONG scheduled position
{
  position: "long",
  priceOpen: 42000,
  priceStopLoss: 41000,
  priceTakeProfit: 45000
}

// Candle that would previously cause trouble:
{ low: 40500, high: 43000 }  // ← hits both levels!

→ Result: instantly CANCELLED (position never opens)
```




# Backtest & Live Trading (v1.1.1, 22/11/2025)

> Github [release link](https://github.com/tripolskypetr/backtest-kit/releases/tag/1.1.1)

Build robust trading systems with crash-safe state persistence and event-driven architecture! 🚀 Test strategies on historical data or deploy to production with automatic recovery. 💾 Type-safe signal lifecycle prevents invalid trades with comprehensive validation. ✅ Memory-optimized async generators stream execution for backtest and live modes. 🔄 Event emitters provide real-time notifications for signals, errors, and completion. 🔔 Generate markdown reports with win rate and PNL statistics automatically. 📊

```typescript
import {
  addExchange,
  addStrategy,
  addFrame,
  Backtest,
  Live,
  listenSignalBacktest,
  listenSignalLive,
  listenError,
  listenDone,
} from "backtest-kit";

// Register exchange with CCXT
addExchange({
  exchangeName: "binance",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = new ccxt.binance();
    const ohlcv = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
  formatPrice: async (symbol, price) => {
    const exchange = new ccxt.binance();
    return exchange.priceToPrecision(symbol, price);
  },
  formatQuantity: async (symbol, quantity) => {
    const exchange = new ccxt.binance();
    return exchange.amountToPrecision(symbol, quantity);
  },
});

// Register strategy
addStrategy({
  strategyName: "my-strategy",
  interval: "1m",
  getSignal: async ({ getCandles, getAveragePrice }) => {
    const candles = await getCandles("BTCUSDT", "1h", 100);
    const currentPrice = await getAveragePrice("BTCUSDT");

    // Your strategy logic here
    return {
      position: "long",
      note: "BTC breakout",
      priceOpen: currentPrice,
      priceTakeProfit: currentPrice * 1.02,
      priceStopLoss: currentPrice * 0.98,
      minuteEstimatedTime: 60,
      timestamp: Date.now(),
    };
  },
});

// Register timeframe for backtest
addFrame({
  frameName: "1d-backtest",
  interval: "1m",
  startDate: new Date("2024-01-01T00:00:00Z"),
  endDate: new Date("2024-01-02T00:00:00Z"),
});

// Run backtest in background
Backtest.background("BTCUSDT", {
  strategyName: "my-strategy",
  exchangeName: "binance",
  frameName: "1d-backtest"
});

// Listen to signals
listenSignalBacktest((event) => {
  if (event.action === "closed") {
    console.log("PNL:", event.pnl.pnlPercentage);
  }
});

// Listen to completion
listenDone((event) => {
  if (event.backtest) {
    console.log("Backtest completed:", event.symbol);
    Backtest.dump(event.strategyName); // ./logs/backtest/my-strategy.md
  }
});

// Listen to errors
listenError((error) => {
  console.error("Error:", error.message);
});
```



