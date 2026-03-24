---
title: private/interfaces
group: private
---

# backtest-kit api reference

![schema](../../assets/uml.svg)

**Overview:**

Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.

**Core Concepts:**

* **Signal Lifecycle:** Type-safe state machine (idle → opened → active → closed) with discriminated unions
* **Execution Modes:** Backtest mode (historical data) and Live mode (real-time with crash recovery)
* **VWAP Pricing:** Volume Weighted Average Price from last 5 1-minute candles for all entry/exit decisions
* **Signal Validation:** Comprehensive validation ensures TP/SL logic, positive prices, and valid timestamps
* **Interval Throttling:** Prevents signal spam with configurable intervals (1m, 3m, 5m, 15m, 30m, 1h)
* **Crash-Safe Persistence:** Atomic file writes with automatic state recovery for live trading
* **Async Generators:** Memory-efficient streaming for backtest and live execution
* **Accurate PNL:** Calculation with fees (0.1%) and slippage (0.1%) for realistic simulations
* **Event System:** Signal emitters for backtest/live/global signals, errors, and completion events
* **Graceful Shutdown:** Live.background() waits for open positions to close before stopping
* **Pluggable Persistence:** Custom adapters for Redis, MongoDB, or any storage backend

**Architecture Layers:**

* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency
* **Service Layer:** DI-based services organized by responsibility:
  * **Schema Services:** Registry pattern for configuration with shallow validation (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)
  * **Validation Services:** Runtime existence validation with memoization (StrategyValidationService, ExchangeValidationService, FrameValidationService)
  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)
  * **Markdown Services:** Auto-generated reports with tick-based event log (BacktestMarkdownService, LiveMarkdownService)
* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper, extensible via PersistBase
* **Event Layer:** Subject-based emitters (signalEmitter, errorEmitter, doneEmitter) with queued async processing

**Key Design Patterns:**

* **Discriminated Unions:** Type-safe state machines without optional fields
* **Async Generators:** Stream results without memory accumulation, enable early termination
* **Dependency Injection:** Custom DI container with Symbol-based tokens
* **Memoization:** Client instances cached by schema name using functools-kit
* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)
* **Registry Pattern:** Schema services use ToolRegistry for configuration management
* **Singleshot Initialization:** One-time operations with cached promise results
* **Persist-and-Restart:** Stateless process design with disk-based state recovery
* **Pluggable Adapters:** PersistBase as base class for custom storage backends
* **Queued Processing:** Sequential event handling with functools-kit queued wrapper

**Data Flow (Backtest):**

1. User calls Backtest.background(symbol, context) or Backtest.run(symbol, context)
2. Validation services check strategyName, exchangeName, frameName existence
3. BacktestLogicPrivateService.run(symbol) creates async generator with yield
4. MethodContextService.runInContext sets strategyName, exchangeName, frameName
5. Loop through timeframes, call StrategyGlobalService.tick()
6. ExecutionContextService.runInContext sets symbol, when, backtest=true
7. ClientStrategy.tick() checks VWAP against TP/SL conditions
8. If opened: fetch candles and call ClientStrategy.backtest(candles)
9. Yield closed result and skip timeframes until closeTimestamp
10. Emit signals via signalEmitter, signalBacktestEmitter
11. On completion emit doneEmitter with { backtest: true, symbol, strategyName, exchangeName }

**Data Flow (Live):**

1. User calls Live.background(symbol, context) or Live.run(symbol, context)
2. Validation services check strategyName, exchangeName existence
3. LiveLogicPrivateService.run(symbol) creates infinite async generator with while(true)
4. MethodContextService.runInContext sets schema names
5. Loop: create when = new Date(), call StrategyGlobalService.tick()
6. ClientStrategy.waitForInit() loads persisted signal state from PersistSignalAdaper
7. ClientStrategy.tick() with interval throttling and validation
8. setPendingSignal() persists state via PersistSignalAdaper.writeSignalData()
9. Yield opened and closed results, sleep(TICK_TTL) between ticks
10. Emit signals via signalEmitter, signalLiveEmitter
11. On stop() call: wait for lastValue?.action === 'closed' before breaking loop (graceful shutdown)
12. On completion emit doneEmitter with { backtest: false, symbol, strategyName, exchangeName }

**Event System:**

* **Signal Events:** listenSignal, listenSignalBacktest, listenSignalLive for tick results (idle/opened/active/closed)
* **Error Events:** listenError for background execution errors (Live.background, Backtest.background)
* **Completion Events:** listenDone, listenDoneOnce for background execution completion with DoneContract
* **Queued Processing:** All listeners use queued wrapper from functools-kit for sequential async execution
* **Filter Predicates:** Once listeners (listenSignalOnce, listenDoneOnce) accept filter function for conditional triggering

**Performance Optimizations:**

* Memoization of client instances by schema name
* Prototype methods (not arrow functions) for memory efficiency
* Fast backtest method skips individual ticks
* Timeframe skipping after signal closes
* VWAP caching per tick/candle
* Async generators stream without array accumulation
* Interval throttling prevents excessive signal generation
* Singleshot initialization runs exactly once per instance
* LiveMarkdownService bounded queue (MAX_EVENTS = 25) prevents memory leaks
* Smart idle event replacement (only replaces if no open/active signals after last idle)

**Use Cases:**

* Algorithmic trading with backtest validation and live deployment
* Strategy research and hypothesis testing on historical data
* Signal generation with ML models or technical indicators
* Portfolio management tracking multiple strategies across symbols
* Educational projects for learning trading system architecture
* Event-driven trading bots with real-time notifications (Telegram, Discord, email)
* Multi-exchange trading with pluggable exchange adapters

**Test Coverage:**

The framework includes comprehensive unit tests using worker-testbed (tape-based testing):

* **exchange.test.mjs:** Tests exchange helper functions (getCandles, getAveragePrice, getDate, getMode, formatPrice, formatQuantity) with mock candle data and VWAP calculations
* **event.test.mjs:** Tests Live.background() execution and event listener system (listenSignalLive, listenSignalLiveOnce, listenDone, listenDoneOnce) for async coordination
* **validation.test.mjs:** Tests signal validation logic (valid long/short positions, invalid TP/SL relationships, negative price detection, timestamp validation) using listenError for error handling
* **pnl.test.mjs:** Tests PNL calculation accuracy with realistic fees (0.1%) and slippage (0.1%) simulation
* **backtest.test.mjs:** Tests Backtest.run() and Backtest.background() with signal lifecycle verification (idle → opened → active → closed), listenDone events, early termination, and all close reasons (take_profit, stop_loss, time_expired)
* **callbacks.test.mjs:** Tests strategy lifecycle callbacks (onOpen, onClose, onTimeframe) with correct parameter passing, backtest flag verification, and signal object integrity
* **report.test.mjs:** Tests markdown report generation (Backtest.getReport, Live.getReport) with statistics validation (win rate, average PNL, total PNL, closed signals count) and table formatting

All tests follow consistent patterns:
* Unique exchange/strategy/frame names per test to prevent cross-contamination
* Mock candle generator (getMockCandles.mjs) with forward timestamp progression
* createAwaiter from functools-kit for async coordination
* Background execution with Backtest.background() and event-driven completion detection


# backtest-kit interfaces

## Interface WalkerStopContract

This interface describes a signal that's sent when a walker needs to be stopped within the backtest-kit framework. Think of a walker as a process running a trading strategy – sometimes you need to halt it. This signal tells you which strategy and specific walker instance to stop, identified by its name. This is particularly useful when you have several strategies running concurrently on the same trading symbol, allowing you to selectively stop just the one you want. The signal includes the symbol being traded, the name of the strategy involved, and the name of the walker that should be stopped.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a clear way to understand the results of backtesting strategies. Think of it as a container holding all the data you need to compare how different trading approaches performed. It builds upon the existing IWalkerResults, but adds extra information to help you directly analyze and contrast the results of various strategies against each other. Inside, you'll find an array listing the outcomes of each strategy that was tested.

## Interface WalkerContract

The WalkerContract helps you track the progress of your backtesting comparisons. It's like a report card given after each strategy finishes running, letting you know how it performed relative to others. 

Each time a strategy completes its test, you'll receive an update containing key information: the walker's name, the exchange and frame it's running on, the symbol being tested, the strategy’s name, its performance statistics, and the metric value it achieved.

You’ll also see how this strategy stacks up against the best performer so far - its ranking, the name of the best strategy, and the number of strategies that have been tested against the total. This allows you to monitor the optimization process and get a sense of which strategies are showing the most promise.

## Interface WalkerCompleteContract

This interface represents the final notification you receive when a backtest walker has finished its process. It signals that all strategies have been run and the analysis is complete.

It bundles together all the crucial information about the backtest, including the walker's name, the trading symbol being tested, the exchange and timeframe used.

You’ll find details about the optimization metric that guided the process, the total number of strategies that were evaluated and, most importantly, the name of the strategy that performed the best. 

The notification also gives you the specific metric value that the winning strategy achieved and a comprehensive set of statistics detailing its performance. This allows you to easily assess and interpret the results of your backtesting efforts.


## Interface ValidationErrorNotification

This notification lets you know when a validation check during your backtesting or live trading process fails. It's triggered when a risk validation function encounters an issue and throws an error. The notification includes a unique ID, a detailed error object (complete with a stack trace for debugging), and a clear, human-readable message explaining what went wrong. Importantly, the `backtest` property will always be false because these errors typically surface in a live trading context, not during backtesting.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure that the names you're using for different parts of your backtesting setup – like exchanges, timeframes, strategies, and risk profiles – are all valid. Think of it as a checklist to prevent errors. 

Each property in this interface represents a specific component: `ExchangeName` verifies your exchange names, `FrameName` checks your timeframe names, `StrategyName` confirms your strategy names are correct, and so on. 

Each property accepts an enum, which is essentially a list of allowed names, and it uses that list to validate what you’ve provided. This makes sure everything is set up correctly before the backtesting process begins, avoiding potential issues down the line. It’s designed to make your backtesting more reliable and less prone to typos or incorrect configurations.

## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique ID and timestamp for tracking. You'll see details like the strategy that triggered it, the exchange used, and the trading pair involved.

The notification also breaks down the specifics of the trailing take, such as the percentage shift from the original take profit distance and the current market price at execution. It outlines the adjusted take profit and stop-loss prices, as well as their original values before any trailing adjustments.

For positions built with DCA, you'll find information on the number of entries and partial closes.  The notification includes comprehensive P&L data, like total profit/loss, percentage gain/loss, and the effective entry and exit prices used for the calculation, complete with cost and total invested capital.  Finally, it contains timestamps for when the signal was initially created and when the position became pending.

## Interface TrailingTakeCommit

This interface describes what happens when a trailing take profit order is triggered within the backtest kit. It’s essentially a notification that the price has moved enough to activate the take profit based on your trailing strategy.

The `action` property clearly identifies this as a trailing take event. You'll find details about how the take profit price was adjusted with `percentShift`, along with the `currentPrice` that triggered the action.

Key information about the trade itself is included too, like the `position` (long or short), `priceOpen` (the original entry price), and the updated `priceTakeProfit` and `priceStopLoss`. You can also see the original take profit and stop loss prices (`originalPriceTakeProfit`, `originalPriceStopLoss`) to understand how trailing has modified them.

Finally, timestamps (`scheduledAt`, `pendingAt`) tell you when this event was planned and when the position became active, helpful for debugging and understanding timing within your backtest. The `pnl` property gives you the unrealized profit or loss at the time of the trailing take.

## Interface TrailingStopCommitNotification

This notification lets you know when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You’ll find details about the trading pair, the strategy that generated the signal, and the exchange used.

The notification also outlines the specifics of the trade itself: the percentage shift from the original stop-loss distance, the current market price, and the direction of the trade (long or short). It includes both the original and adjusted prices for entry, take profit, and stop loss, allowing you to track how the trailing stop modified the initial order.

Beyond the basics, you'll also get details on any DCA averaging applied (total entries), partial closes (total partials), and a complete picture of the trade's profitability - including PNL in USD, percentage gain/loss, and the prices used for those calculations. Finally, timestamps for when the signal was created, became pending, and when this notification was generated are provided for complete traceability.

## Interface TrailingStopCommit

This interface describes a trailing stop event within the backtest-kit framework. It represents a specific action taken to adjust a trade's stop-loss price based on a trailing strategy.

The `action` property simply identifies this as a trailing-stop event. The `percentShift` indicates how much the stop-loss price is adjusted as a percentage of the current price.

You'll find the `currentPrice` records the market price at the time of the trailing stop adjustment.  The `pnl` property provides the unrealized profit and loss at that precise moment.

Key details about the trade itself are also included, such as the `position` (long or short), `priceOpen` (the entry price), and the original and adjusted `priceTakeProfit` and `priceStopLoss` values.  The `originalPriceTakeProfit` and `originalPriceStopLoss` let you see the initial take profit and stop loss levels.

Finally, `scheduledAt` tells you when the trailing stop signal was initially generated, and `pendingAt` marks when the position was actually activated.

## Interface TickEvent

This interface, `TickEvent`, is designed to be a central container for all the data you need when analyzing or reporting on trading activity. Think of it as a standardized format that captures everything happening during a trade, regardless of whether it's a new position being opened, a trade being closed, or a signal being scheduled.

It includes core details like the exact time of the event (`timestamp`), what type of action occurred (`action`), and the trading pair involved (`symbol`). You’ll find signal-specific information like `signalId`, `position`, and any notes associated with the signal.

For positions that are open or actively trading, you'll see key price points like `currentPrice`, `priceTakeProfit`, and `priceStopLoss`, along with details related to averaging strategies (`totalEntries`, `totalPartials`). Performance metrics like `pnlCost`, `pnl`, and percentage progress toward take profit and stop loss are also included.

When a trade is closed or cancelled, specific reasons and durations are recorded. The `pendingAt` and `scheduledAt` properties provide context regarding when a position entered different states within the trading process.  Essentially, `TickEvent` bundles together a wealth of information, simplifying the process of analyzing your trading history.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are syncing with the system. It gathers data from all the sync events that happen. 

You'll find a detailed list of each event in the `eventList` property, giving you a complete picture of what's happening. The `totalEvents` property simply tells you how many sync events have occurred overall.

To track the activity, it also counts how many times signals have been opened (`openCount`) and closed (`closeCount`). This lets you monitor the lifecycle of your signals and spot any potential issues.

## Interface SyncEvent

This data structure, `SyncEvent`, acts as a central hub for all the key information related to a trading signal’s lifecycle. Think of it as a detailed log entry for each significant event – from when the signal is created to when a trade is opened, modified, or closed.  It gathers information like the exact timestamp, the trading pair involved, the strategy and exchange used, and the trade direction (long or short). 

You’ll find details about order placement, like the entry price and stop-loss/take-profit levels, including their original values before any adjustments.  It also tracks important timing information like when the signal was scheduled and when the position actually activated.  For strategies utilizing DCA, the total number of entries and partial closes is recorded. Profit and loss (PNL) is captured at each event, and for closed signals, the reason for closure is provided.  Finally, it identifies if the event originates from a backtest simulation. The `createdAt` field provides a standardized ISO timestamp for consistent record-keeping.

## Interface StrategyStatisticsModel

This model holds all the statistical information collected about a trading strategy’s actions. Think of it as a record of what your strategy has been doing.

It includes a detailed list of every event that occurred, allowing you to examine individual actions. You'll also find the total number of events, as well as counts for specific types of actions like canceling scheduled orders, closing pending orders, taking partial profits or losses, and using trailing stop or take profit techniques. 

It breaks down events into categories like breakeven hits, scheduled activations, and even average buy (DCA) occurrences, giving you a comprehensive view of your strategy's behavior.

## Interface StrategyEvent

This interface holds all the important details about actions your trading strategy takes, whether it’s a buy, sell, or something else. It's designed to create clear reports that explain exactly what happened and when.

Each event includes things like the timestamp of the action, the trading symbol involved, and the name of the strategy being used. You’ll also find information about the exchange, the timeframe, and a unique ID for each action.

The data contains information about the current market price, how much of the position is being closed (if any), and any trailing stop or take profit adjustments. For scheduled or pending actions, it tracks the IDs associated with them.

For backtesting, it indicates whether the event occurred during a test or live trading. The direction of the trade (long or short) is also noted, alongside the entry, take profit, and stop loss prices, both as they are currently set and as they were originally defined.

If your strategy uses dollar-cost averaging (DCA), you’ll find information about the total entries and the average entry price. Other useful data includes the position’s profit and loss (PNL) at the time of the event, and the cost of entry for DCA strategies.

## Interface SignalSyncOpenNotification

This notification tells you when a signal, specifically a limit order signal, has been triggered and a position has been opened. It's like a confirmation that your trading strategy has taken action.

Each notification has a unique ID and timestamp, letting you track its history.  You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange used.  The notification also includes the original entry price and any take profit or stop loss levels that were set. 

A lot of information about the position's profitability is included too, such as the current P&L, cost of entry, and key prices used in those calculations. You can see whether the signal came from a backtest (simulated trading) or live trading.  Finally, the notification will show you when the signal was originally created and when the position actually went live.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, expiring, or being closed manually. It provides a wealth of information about the closed signal, like a unique ID, when it was created and closed, and whether it happened during a backtest or live trading. You’ll find details about the strategy that generated the signal, the exchange used, and key prices like the entry and exit prices. 

The notification also includes important data for profit and loss (PNL) calculation, including total investment, profit/loss percentage, and the prices used for those calculations. It outlines the original take profit and stop loss levels, information on any DCA averaging used, and the reasons behind the signal’s closure. Essentially, this notification acts as a comprehensive record of a completed signal, useful for analysis and understanding performance.

## Interface SignalSyncBase

This interface defines the common information you'll find in every signal synchronization event within the backtest-kit framework. Think of it as the basic building block for understanding where a signal came from and its context. Each signal event includes the trading symbol like "BTCUSDT", the name of the strategy that generated it, and the exchange where it's being used. 

You'll also see the timeframe involved – this is relevant during backtesting and will be empty when running live. A flag indicates whether the signal originated from a backtest or a live trading environment.  A unique ID identifies each signal, along with a timestamp pinpointing when it occurred. Finally, the complete signal data itself is included, giving you all the details about the signal at that moment.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been scheduled for a future time. It's like getting a heads-up that a trade is about to happen, whether you’re running a backtest or trading live.

Each notification contains lots of important details. You’ll find a unique ID, the exact time the signal was scheduled, and whether it's a backtest or live trade. It also specifies the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange being used.

Beyond that, you get information about the trade itself: its direction (long or short), the intended entry price, take profit and stop loss levels, and details about any DCA averaging or partial closes that might be involved. You can also see the initial cost, potential profit/loss figures, and the current market price at the time of scheduling. Finally, there’s a timestamp for when the notification itself was created. This provides a comprehensive snapshot of a scheduled trading opportunity.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened within the backtest or live trading environment. It provides a wealth of information about the trade, like a detailed report card. You'll find its unique identifier, the time it was opened, and whether it occurred during a backtest or live execution.

The notification specifies the trading pair (e.g., BTCUSDT), the strategy that initiated the trade, and the exchange used. It includes details about the trade itself – whether it's a long (buy) or short (sell) position, the entry price, and the take profit and stop-loss levels. You can also see the original price levels before any adjustments like trailing stops were applied.

For trades involving averaging (DCA), it reveals the number of entries made.  You'll also see if any partial position closures have occurred. Crucially, the notification includes financial data such as the trade's cost, unrealized profit and loss (PNL), and the prices used to calculate that PNL. Finally, there’s an optional note field that provides a human-readable explanation of why the signal was triggered, along with timestamps for signal creation, pending status, and data creation.

## Interface SignalOpenContract

This event signals that a pre-arranged trade, using a limit order, has been executed. It's triggered when the trading framework successfully enters a position – either buying (long) or selling (short) – based on a previously scheduled order.

During backtesting, this event happens when the candle price meets your specified entry condition (lower than your entry price for a long, higher for a short). In live trading, it confirms that the exchange actually filled your limit order.

The event provides a wealth of information about the trade, including the entry price, current market price, the total profit/loss so far, the cost of entering the position, and the initially set take profit and stop-loss levels. You’ll also find details about any trailing adjustments that may have been applied to those stop-loss and take-profit prices.

It also includes information about the number of times the position was averaged using dollar-cost averaging (DCA) or partially closed out. This event is designed for external systems that need to track and confirm order executions, such as audit logs or order management tools.

## Interface SignalData$1

This interface, SignalData$1, is designed to hold all the key details about a completed trading signal, specifically for calculating and displaying performance metrics. Think of it as a record of a single trade. It tells you which strategy created the signal, gives it a unique ID, and identifies the asset being traded. 

You'll find information about the trade's direction (long or short), the profit or loss as a percentage, and the reason it was closed. It also provides timestamps marking when the trade began and ended, allowing you to track the signal's lifespan. This data is really useful for understanding how your trading strategies are performing.


## Interface SignalCommitBase

This describes the fundamental information shared by all signal commitment events, whether they originate from a backtest or live trading environment. Each signal commitment will include details like the trading pair's symbol, the name of the strategy that generated it, and the exchange it's associated with. Backtesting events will also specify the timeframe used, while live events will leave this blank. You’ll find a unique identifier for each signal, a timestamp marking when it occurred, and data about any averaging or partial closing operations that were performed. Importantly, it stores the initial entry price, which remains constant even if the position is later adjusted through averaging.

## Interface SignalClosedNotification

This notification tells you when a trading position, generated by a strategy, has been closed – whether it hit a take profit or stop loss, or was closed for another reason. It provides a wealth of information about the trade, including the strategy's name, the exchange used, and the specific trade direction (long or short).

You'll find details about the entry and exit prices, as well as the original take profit and stop loss levels before any adjustments were made. The notification also includes information about any DCA averaging or partial closes that occurred.

It breaks down the profit or loss, both as a percentage and in absolute USD terms, and reveals the effective entry and exit prices used in the P&L calculation. You can learn how long the position was held, a note explaining the reason for the closure, and timestamps indicating when the signal was created and when it became active. This comprehensive data allows you to analyze and understand the performance of your trading strategies in detail.

## Interface SignalCloseContract

This event signals when a trading signal has been closed, whether it reached a take profit or stop loss level, expired, or was manually closed. It’s designed to help external systems, like order management or auditing tools, stay in sync with what's happening in the backtest.

The event provides details about the close, including the current market price, the total profit and loss (PNL) for the position, and the trade direction (long or short). It also gives you information about the original and effective prices for entry, take profit, and stop loss, alongside when the signal was created and the position was activated. 

You’ll also find specifics about how the position was built: the number of times the entry price was averaged (DCA) and the number of partial closes that occurred. The `closeReason` field explains precisely why the signal was closed, which is crucial for understanding the trading outcome.

## Interface SignalCancelledNotification

This notification tells you when a signal that was scheduled to be executed has been cancelled before it actually happened. It provides a lot of detail about the cancelled signal, including a unique identifier and the reason for the cancellation, such as a timeout or a manual user cancellation. You'll find information about the trading pair, the strategy that generated the signal, and the intended trade direction (long or short). 

The notification also includes details about the original price levels – entry, take profit, and stop loss – before any adjustments were made. It also includes data about DCA entries and partial closes, if applicable. Finally, you can see when the signal was scheduled, when it started pending, and when the notification itself was created, allowing you to track the signal’s lifecycle.

## Interface Signal

This section describes the `Signal` object, which represents a trading signal generated by your backtest strategy. 

It holds important information about a trade, including the initial entry price (`priceOpen`).

The `_entry` property is a record of all entry points for the signal, detailing the price, cost, and timestamp of each entry.

You can also find details on partial exits in the `_partial` property. This stores information about profit-taking or loss-limiting actions, including the percentage of the position closed, the price at the time of exit, and the cost basis at the time of close.

## Interface Signal$2

This `Signal$2` object holds key information about a trading position. It tracks the initial entry price, represented by `priceOpen`. 

You'll also find detailed records of entry events stored in the `_entry` array; each entry includes the price, total cost, and the exact time it occurred.

Finally, the `_partial` array logs any partial exits from the position, noting whether they were profit-taking or loss-limiting actions, along with relevant details like percentages, prices, and cost basis at the time of the partial exit.

## Interface Signal$1

This section describes the `Signal` object, a core component within the backtest-kit framework. Each `Signal` represents a single trade execution. 

It stores vital information about that trade, including the `priceOpen`, which is the price at which the position was initially entered. 

The `_entry` property is an array containing details of each entry point for the signal, recording the price, cost, and timestamp of each individual entry.  

Similarly, `_partial` tracks any partial exits from the position, noting the type (profit or loss), percentage, current price, cost basis, entry count, and timestamp of each partial transaction.

## Interface ScheduledEvent

This data structure holds all the important details about trading events – whether they were scheduled, opened, or cancelled – making it easy to generate reports and analyze performance. Think of it as a complete record of what happened with a trade.

Each event has a timestamp, indicating when it occurred. You'll find information about the trade's action, the symbol being traded, and a unique signal ID. It includes details like the entry and exit prices (take profit and stop loss), as well as any original values before modifications.

For trades that involve multiple entries (DCA) or partial closes, you'll also find counts and percentages related to those actions. The structure also tracks the position's P&L and, for cancelled events, provides a reason for the cancellation, along with duration and specific IDs. Finally, there's a timestamp noting when the position became active, and a timestamp of when the signal was initially created.

## Interface ScheduleStatisticsModel

This model holds statistical information related to signals that are scheduled, opened, or cancelled within your backtesting framework. It allows you to monitor and analyze the performance of your scheduled signal strategies.

You’ll find a detailed list of all events, including when they were scheduled, opened, or cancelled, within the `eventList` property. 

The model also provides summarized counts of total events, specifically scheduled, opened, and cancelled signals. 

Key performance indicators like cancellation rate and activation rate are also included, expressed as percentages to help you quickly assess the effectiveness of your scheduling. Finally, it calculates average waiting times for both cancelled and opened signals to provide insights into delays and efficiency.

## Interface SchedulePingContract

This describes what happens when a scheduled trading signal is actively being watched – think of it as a heartbeat signal. Every minute, while a signal is running, a `SchedulePingContract` is sent out. It provides key details like the trading pair involved (symbol), the strategy that created it, and the exchange it’s on.

You'll find the full details of the signal included, such as entry price, take profit, and stop loss levels. A current price is also provided for each ping, allowing you to build custom checks – maybe you want to automatically cancel a signal if the price moves too much.

Finally, a flag tells you whether this ping is coming from a backtest (using historical data) or a live trading situation. A timestamp lets you precisely track when the ping occurred. You can set up listeners to receive these pings and react to them as needed.

## Interface RiskStatisticsModel

This model holds statistical information about risk rejections, helping you monitor and understand your risk management performance. It contains a list of individual risk rejection events, allowing you to examine specific incidents. You'll also find the total number of rejections, a breakdown of rejections by the trading symbol involved, and a breakdown of rejections attributed to different trading strategies. This information provides valuable insights into potential problem areas and helps you refine your risk controls.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It’s like a heads-up that a potential trade didn't go through because it triggered a safety check. Each notification has a unique ID and a timestamp so you can track exactly when and why the signal was rejected.

You’ll see details like the strategy that generated the signal, the exchange involved, and a clear explanation of the reason for the rejection.  It also provides information about your current open positions, the market price at the time, and the specifics of the signal itself, like its direction (long or short), entry price, take profit, and stop loss levels. Backtest mode signals are clearly marked, so you can differentiate between test runs and live trading activity.  The optional signal note provides more context about the signal’s logic.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked due to risk management rules. It's used to create reports and understand why certain trades didn't happen. 

Each `RiskEvent` includes details like the exact time of the rejection, the trading pair involved (symbol), and the specifics of the signal that was rejected. You’ll also find the strategy’s name, the exchange it's using, and the timeframe considered.

The event also provides the current market price, the number of open positions at the time, and a unique ID for the rejection. A note explains the reason for the rejection, and it indicates whether the event occurred during a backtest or in live trading. Essentially, it’s a record of any risk-related interference with your trading signals.

## Interface RiskContract

The RiskContract provides information about signals that were blocked due to risk management rules. Think of it as a notification when a trading signal couldn't be executed because it exceeded a pre-defined risk limit.

It includes details like the trading pair involved (symbol), the specifics of the signal itself (currentSignal), which trading strategy requested it (strategyName), the timeframe considered (frameName), and the exchange it was intended for (exchangeName).

You’ll also find the price at the time of the rejection (currentPrice), the number of existing open positions (activePositionCount), a unique ID for tracking the rejection (rejectionId), and a clear explanation of why it was rejected (rejectionNote).  A timestamp tells you exactly when the rejection occurred, and a flag indicates whether it happened during a backtest or in a live trading environment (backtest).

Services like risk reporting tools or custom user notifications can leverage this data to understand and monitor risk management performance.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive as a background process, like analyzing trading strategies, runs. It tells you what's happening with a particular analysis – which exchange and symbol are being worked on, and importantly, how many strategies are left to go. You'll see the total number of strategies initially, then updates showing how many have been processed, and a percentage indicating how close the process is to finishing. This allows you to monitor the progress of potentially long-running tasks.

## Interface ProgressBacktestContract

This interface helps you monitor the progress of a backtest as it runs. It provides key details like the exchange, strategy, and trading symbol being used. You'll also see how many data points (frames) the backtest needs to analyze in total and how many it has already processed. Finally, a percentage value indicates overall completion, allowing you to understand roughly how long the backtest will take.

## Interface PerformanceStatisticsModel

This model holds the overall performance data for a trading strategy after a backtest. It provides a summary of how the strategy performed, including the strategy's name, the total number of events analyzed, and the total time it took to run. 

You’ll find detailed statistics broken down by specific metrics, allowing you to examine different aspects of performance. 

Finally, it includes a complete list of all the individual performance events recorded, giving you access to the raw data if you need it for more in-depth analysis.


## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies are performing. It's like a little report card that gets generated as your strategies run, telling you how long different parts of the process take.  You can use this information to find areas that might be slowing things down or taking longer than expected. 

Each report card includes details like when the action happened, how long it took, what strategy and exchange was involved, and whether it was part of a backtest or live trading.  The `previousTimestamp` lets you compare performance between steps, and the `frameName` helps track things specifically during backtesting. Think of it as a way to diagnose and improve the efficiency of your trading system.

## Interface PartialStatisticsModel

This model holds key statistics about your backtesting results when you're using partial profit/loss strategies. It essentially tracks how many times your trades hit profit or loss milestones.

You'll find a detailed list of each event—profit or loss—within the `eventList` property, giving you a full record of what happened. The `totalEvents` property simply tells you the overall count of all profit and loss events.  `totalProfit` and `totalLoss` specifically count how many times your strategy realized a profit or a loss, respectively.

## Interface PartialProfitContract

This describes events that happen when a trading strategy hits certain profit milestones, like 10%, 20%, or 30% gain. These events, called `PartialProfitContract` objects, give you details about what's happening during a trade.

Each event tells you which trading pair (like BTCUSDT) is involved, the name of the strategy that made the trade, and the exchange and frame being used. You'll also get the full signal data, the current price at the time the milestone was reached, and the exact profit level achieved.

The `backtest` property lets you know if the event came from a historical simulation or a live trade. A timestamp indicates precisely when this profit level was detected, which can vary slightly between live and backtest environments. Essentially, it's a way to keep track of how your strategies are performing and when they're achieving profit targets.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit has been taken during a trade. It provides a wealth of information about the trade, including details like the strategy that triggered it, the exchange used, and the specific symbol being traded. You'll find key data points like the percentage of the position closed, the current price at the time of the action, and the original entry and take profit/stop loss prices.

The notification also includes crucial financial data, such as the profit and loss (P&L) – both in absolute USD and as a percentage – along with details about the entry and exit prices used in the P&L calculation and the total invested capital.  Timestamps are provided to track the signal's lifecycle, from creation to pending and ultimately, the partial profit commitment.  Knowing the total number of entries and partials allows you to understand the nuances of strategies utilizing averaging or partial exits. Whether this occurred during backtesting or live trading is also indicated.

## Interface PartialProfitCommit

This describes an event that happens when your trading strategy takes a partial profit. It tells you exactly what happened – the action was “partial-profit” – and how much of the position was closed, expressed as a percentage. You’ll also find the current market price at the time, along with the unrealized profit and loss (pnl) recorded. 

The information includes details about the trade itself: whether it was a long (buy) or short (sell) position, the original entry price, and both the effective and original take profit and stop loss prices. You can see when the signal was generated and when the position initially went live. This data helps you understand the context behind taking that partial profit and evaluate your strategy's performance.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy reaches a profit milestone, like 10%, 20%, or 30% gain. It's a signal that something important happened during a trade.

Each notification includes a unique ID and timestamp, and it tells you whether it came from a backtest or a live trade. You'll see the symbol (like BTCUSDT), the strategy’s name, and the exchange used.

The notification breaks down details of the trade: the signal's ID, the specific profit level reached, the current price at that point, and the original entry price.  You'll find information on the take profit and stop loss prices, both as they are currently set, and what they were originally before any trailing adjustments.

It also includes details about any dollar-cost averaging (DCA) strategy used, the number of partial closes, and a breakdown of the profit and loss, including the amounts in USD and as a percentage. You get timestamps for when the signal was created, when it became pending, and when the notification itself was generated. Finally, it provides data related to slippage and fees.

## Interface PartialLossContract

This describes what happens when a trading strategy hits a predefined loss level, like a 10% or 20% drawdown. Think of it as a notification that a strategy is losing money, and how much it's down.

Each notification, or event, gives you detailed information about what’s going on: the trading pair involved (like BTCUSDT), which strategy generated the signal, the exchange and frame it's running on, and the original data associated with the signal. You’ll also see the current market price, the specific loss level reached, and whether it occurred during a backtest (simulated trading) or live trading.  The timestamp tells you precisely when this loss level was detected, whether it's a live tick or a historical candle.

This information is useful for keeping track of strategy performance, especially when setting up partial stop-loss orders or for generating reports about how your strategies are behaving.  The system only sends these notifications once for each level, even if the price moves rapidly.

## Interface PartialLossCommitNotification

This notification tells you when a partial closing of a position has happened, whether it's during a backtest or live trading. It provides a lot of detail about the trade, including a unique ID for tracking, the exact time it occurred, and whether it was part of a backtest.

You’ll find information about the trading symbol, the strategy that initiated the trade, and the exchange used. The notification also contains important data regarding the position itself, such as its entry price, take profit levels, stop loss levels, and the percentage of the position that was closed.

Furthermore, it gives a comprehensive view of the trade's performance, including profit and loss figures (both absolute and as a percentage), entry and exit prices used for PNL calculations, and timestamps marking key events in the trade's lifecycle, such as signal creation and when the position went pending. The notification also provides insight into DCA averaging by showing the total number of entries and partial closes executed.


## Interface PartialLossCommit

This object represents a partial loss event within the backtest framework. It details the specifics of a situation where a portion of a trading position is being closed due to a loss.

The `action` property confirms that this is indeed a partial loss event. You'll also find information about what percentage of the position is being closed (`percentToClose`), the current market price at the time (`currentPrice`), and the unrealized profit and loss (`pnl`).

It includes details about the trade itself: whether it was a long (buy) or short (sell) position, the original entry price (`priceOpen`), and the take profit and stop loss prices – both their effective values and their original, untrailed values.

Finally, timestamps (`scheduledAt` and `pendingAt`) provide a record of when the signal was created and when the position became active.

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy hits a pre-defined loss level, like a 10% or 20% drawdown. It's a signal that things might be getting a bit risky, and you can use this information to adjust your strategy or risk management. 

The notification includes a lot of useful details, like a unique ID, the exact timestamp it occurred, and whether it’s from a backtest or live trading. You’ll also find information about the trading symbol, strategy name, and exchange involved.

Crucially, it breaks down the specifics of the trade: the entry price, current price, take profit, stop loss levels (both original and adjusted for trailing), the direction of the trade (long or short), and the number of entries and partial closes that have happened.  You’ll also see profit and loss data, including unrealized PNL and percentage profit/loss, along with key timestamps related to signal creation and pending orders. It is extremely detailed, giving a full picture of the situation at the moment the loss level was triggered.

## Interface PartialEvent

This interface, `PartialEvent`, acts like a record of significant profit and loss milestones during a trade. It bundles together all the key details needed to understand how a trade is performing, such as when it happened (`timestamp`), whether it’s a profit or loss (`action`), and what the current market price is (`currentPrice`). You’ll find information about the trade's setup, like the entry price (`priceOpen`), take profit target (`priceTakeProfit`), and stop loss (`priceStopLoss`), along with details about any partial closes that may have occurred (`totalPartials`). It also keeps track of things like the signal ID (`signalId`), strategy name (`strategyName`), and even notes about why the signal was triggered (`note`), making it easier to analyze trading decisions.  The `backtest` property indicates whether the event happened during a historical simulation or a live trade.

## Interface MetricStats

This interface holds a collection of statistics calculated for a particular performance metric. Think of it as a summary report detailing how a specific action or process performed over a series of runs. 

It includes basic information like the total number of times the metric was recorded, and the overall duration of those recordings. 

You’ll also find key measurements like average duration, minimum and maximum durations, standard deviation, and percentiles (like the 95th and 99th).

Finally, it captures details about timing between events, providing minimum, maximum, and average wait times. This allows for a comprehensive understanding of performance characteristics.

## Interface MessageModel

This describes what a message looks like within a conversation handled by a large language model. Each message represents a turn in the chat, whether it's an instruction given to the model (the "system" role), a question from the user, the model's response, or the results of a tool the model used.

A message always has a `role` to specify who sent it, and `content` which holds the actual text of the message. Some models provide additional context with `reasoning_content`, showing the model's thought process.

Assistant messages can also include `tool_calls` if the assistant used a tool, or a `tool_call_id` to identify which tool call the message is related to. Finally, messages can include `images`—you can provide these as Blob objects, raw byte arrays, or base64 encoded strings.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed view of your live trading performance. It tracks everything from the total number of trades to individual win and loss counts, giving you a comprehensive understanding of how your strategy is doing.

You’ll find key metrics like win rate, average profit per trade, and total profit displayed, all as percentages.  It also incorporates more advanced measures like standard deviation (to assess volatility), Sharpe Ratio (a measure of risk-adjusted return), and expected yearly returns.

The model includes a list of all trading events, offering granular insights into each trade's lifecycle.  It’s worth noting that any calculations resulting in potentially unreliable values (like infinity or "not a number") will be represented as null.

## Interface InfoErrorNotification

This notification lets you know about problems that happened while background tasks were running, but aren't critical enough to stop everything. It provides a unique identifier (`id`) to track each specific issue. You'll also get a clear, human-readable explanation of what went wrong in the `message` field, along with technical details like the error stack trace and extra data in the `error` property.  Keep in mind that these errors originate outside of the main backtest simulation, so the `backtest` flag will always be false.

## Interface IWalkerStrategyResult

This interface describes the outcome of running a trading strategy within a backtest comparison. It holds key information about a single strategy's performance.

You’ll find the strategy's name clearly listed, along with detailed statistics about its backtest results, like total profit and drawdown.  A specific metric, used to rank the strategies against each other, is provided; it might be null if the strategy’s results were unusable for comparison. Finally, the `rank` property tells you where the strategy stands in the overall comparison, with the best performer ranked as number 1.

## Interface IWalkerSchema

The IWalkerSchema is like a blueprint for setting up A/B tests comparing different trading strategies. Think of it as defining a controlled experiment where you’re evaluating how various strategies perform against each other. 

Each Walker has a unique name to identify it, and you can add a note to help yourself or others understand its purpose. 

You'll specify the exchange and timeframe that all strategies within the Walker will use for backtesting, ensuring a level playing field. The Walker lists the specific strategy names you want to compare, making sure they've been registered beforehand. 

The metric, such as Sharpe Ratio, dictates what you're optimizing for in the comparison. Optionally, you can add callbacks to be notified at different stages of the Walker's execution.

## Interface IWalkerResults

This interface holds all the information gathered after a backtest-kit walker has finished its job, which is essentially comparing different trading strategies. It tells you exactly what asset – the `symbol` – was tested, which `exchangeName` was used for the data, and the specific `walkerName` that ran the comparison. Finally, it also identifies the `frameName`, referring to the time period or data frequency used during the backtesting process. Essentially, it's a package containing the key details about a completed backtesting run.

## Interface IWalkerCallbacks

These callbacks let you tap into different points during the backtest process, allowing you to monitor what's happening and react accordingly. You can use `onStrategyStart` to know when a particular trading strategy is beginning its evaluation. Once a strategy’s backtest is finished, `onStrategyComplete` gives you the results, including key statistics and a specific metric you’re tracking.

If a strategy encounters an issue and the backtest fails, `onStrategyError` will be triggered, providing information about the error. Finally, `onComplete` signals that all the strategies have been assessed, and you’ll receive a summary of all the results. 


## Interface ITrailingTakeCommitRow

This interface describes a row representing a trailing take commit action that's been queued up for execution. Think of it as a planned instruction for your trading system. 

It tells the system to adjust a trailing stop-loss order, shifting it by a specific percentage (`percentShift`) from the current price (`currentPrice`) when the order was initially established. The `action` property simply confirms this is a trailing take commit instruction.


## Interface ITrailingStopCommitRow

This interface describes a single instruction to adjust a trailing stop order. Think of it as a record of what needs to happen to a trailing stop, including the type of action ("trailing-stop"), how much the percentage needs to shift, and the price at which the trailing stop was initially set. This data is used when queuing changes to trailing stops within the backtest framework. It’s essentially a snapshot of the specific adjustment required for one trailing stop order.


## Interface IStrategyTickResultWaiting

This interface describes what happens when a trading strategy is actively watching for a signal to become ready. Think of it as a status update while the strategy is patiently waiting for the price to reach a specific point to trigger a trade.

It contains information like the name of the strategy, the exchange it's operating on, the trading pair (symbol), and the current price being monitored. You'll also find details about the signal itself, along with how far along the strategy is towards take profit and stop-loss levels – these will always be zero while it's waiting.

The result includes unrealized profit and loss calculations, which are currently theoretical because the trade hasn’t been executed yet. A timestamp indicates when the information was generated, and a flag indicates whether the data is coming from a backtest simulation or live trading.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy generates a signal that’s set to activate when a certain price is reached. Think of it as a signal that's "on hold" waiting for a specific price condition to be met.

It includes all the relevant details about that signal, like the strategy and exchange it came from, the trading symbol involved, the current price at the time the signal was scheduled, and whether it's part of a backtest or a live trade.  The `action` property specifically identifies this as a scheduled signal, helping to differentiate it from other types of trading events.  You'll also find timestamps to track when the signal was created, which is important for accurate record-keeping and analysis.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within your backtesting or live trading system. It's a notification that a signal has been successfully generated and is now active.

You'll see this result after your strategy's signal generation logic has run and the signal has been saved.

The information included provides context: you'll know the name of the strategy that generated the signal, the exchange and timeframe it applies to, the symbol being traded, the price at the time the signal opened, and whether the event is part of a backtest. Importantly, it also includes the full details of the newly created signal itself, including a unique ID assigned to it. Finally, a timestamp marks exactly when the signal was created, helpful for auditing and debugging.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a waiting or "idle" state. It's like a notification letting you know the strategy isn't actively making trades right now.

The `action` property confirms that the strategy is indeed idle. You’ll also see details like the strategy’s name, the exchange being used, the timeframe (like 1-minute or 5-minute candles), and the trading symbol (e.g., BTCUSDT).

The `currentPrice` represents the current price being observed while the strategy is idle, and `backtest` flags whether this is happening during a simulated backtest or in a live trading environment. Finally, `createdAt` records precisely when this idle state was detected.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing a complete picture of the event. It includes details like the reason for closure – whether it was a time limit, a take-profit/stop-loss trigger, or a manual close.

You'll find the original signal parameters, the final price used to calculate profits, and a detailed breakdown of the profit and loss, including any fees or slippage.  It also records important metadata, such as the strategy and exchange names, the time frame used, and whether the closure occurred during a backtest or live trading. A unique identifier is provided for user-initiated closes, and a timestamp indicates when the result was generated.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, describes what happens when a scheduled trading signal is cancelled. It's used to represent situations where a signal doesn't actually lead to a trade being opened – perhaps it was cancelled directly, or it triggered a stop-loss before a position could be entered.

The `action` property clearly identifies this as a cancellation event. The `signal` property provides all the details about the signal that was cancelled. You’ll also find key information like the final price (`currentPrice`), the exact time of cancellation (`closeTimestamp`), and identifiers for the strategy, exchange, and trading symbol. 

It also includes flags to differentiate between backtesting and live trading (`backtest`), and provides a `reason` property to explain why the signal was cancelled.  If a user manually cancelled the signal using a `cancel()` function, the `cancelId` field will contain the ID of that cancellation. Finally, `createdAt` records when the result itself was generated.

## Interface IStrategyTickResultActive

This interface describes a tick result within the backtest-kit framework, specifically when a trading strategy is actively monitoring a signal and awaiting a take profit (TP), stop loss (SL), or time expiration. It contains information about the signal being monitored, including its current price and the names of the strategy, exchange, and timeframe involved. 

You'll also find details about the progress towards TP and SL, represented as percentages. The `pnl` property provides the unrealized profit and loss data for the active position, considering factors like fees and slippage. The `backtest` flag distinguishes between backtesting and live trading scenarios. Timestamps indicate when the result was created and the last processed candle, useful for tracking and synchronization.

## Interface IStrategySchema

This schema outlines the structure for defining your trading strategies within the backtest-kit framework. Think of it as a blueprint that tells the system how your strategy will generate trading signals and how it should behave. 

Each strategy needs a unique name to identify it. You can also add a note for yourself or other developers to explain the strategy's logic.

The `getSignal` function is the heart of your strategy – it's where the signal generation happens. It determines when to buy or sell, and it can be configured to wait for a specific price to be reached.  You can also define how often the system should check for signals with the `interval` property.

Furthermore, you can customize the strategy’s lifecycle using optional callbacks, associate it with specific risk profiles, and tag it with actions. These additions help manage the strategy within a larger trading system.

## Interface IStrategyResult

This interface, `IStrategyResult`, holds all the information needed to display and compare the results of different trading strategies. Think of it as a single row in a table showcasing how each strategy performed. It includes the strategy's name so you know which one you're looking at, a detailed set of statistics providing a comprehensive performance overview, and a key metric value used to rank the strategies against each other. This metric value can sometimes be missing if the strategy's results were invalid.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, neatly packages the results of a trading strategy’s performance. It gives you a clear picture of how much money your strategy made or lost. You'll find the profit or loss expressed as a percentage, reflecting the overall gain or decline. 

The interface also provides the adjusted entry and exit prices, taking into account typical trading costs like fees and slippage – those little price movements that happen when you actually execute a trade.  Finally, you can see the actual dollar amounts involved: the total capital invested and the absolute profit or loss in US dollars.


## Interface IStrategyCallbacks

This interface provides a way to hook into key moments in a trading strategy's lifecycle during backtesting or live trading. You can define functions that get triggered when a signal opens, becomes active, goes idle, closes, is scheduled for later, or is cancelled.  There are also callbacks for specific situations like reaching partial profit or loss, hitting breakeven, and for scheduled and active signals that require minute-by-minute monitoring. Each callback receives information about the symbol, signal data, current price, and whether the event occurred during a backtest. This lets you observe, log, or react to these events programmatically. The `onWrite` callback is specifically for persisting signal data during testing.

## Interface IStrategy

The `IStrategy` interface defines the core methods for how a trading strategy operates within the backtest framework. It’s essentially a blueprint for how your strategy interacts with the system.

At its heart, the strategy receives `tick` events, which process each price update, checking for signals and managing stop-loss and take-profit orders. It has functions to fetch pending and scheduled signals—signals that are waiting to be activated or are planned for future execution.

You can check if a trade has reached its breakeven point or if the strategy has been stopped. The framework also keeps track of how much of the position has been closed, the total costs associated with closures, and the average entry price.

The `backtest` method allows you to test your strategy against historical data.  You can also manually control the strategy, stopping it, canceling scheduled orders, activating them early, or closing existing positions.

The interface also provides tools for managing partial profit and loss closures, and for adjusting trailing stops and take profit levels – all with validation checks to ensure they're safe and effective. Finally, there are methods for tracking performance metrics like highest profit, drawdown, and remaining time before a position expires. The `dispose` method allows for graceful shutdown and cleanup when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the basic functions any storage system needs to provide when used with the backtest-kit framework. Think of it as a contract – any system that wants to store and manage trading signals must implement these methods. 

It includes functions for responding to signal events like when a signal is opened, closed, scheduled, or cancelled. There are also methods for looking up a signal by its unique ID and retrieving a complete list of all stored signals. 

Finally, the interface provides ways to handle “ping” events, which allow the system to keep track of how long signals have been active or scheduled, ensuring the data remains up-to-date.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for execution. It’s a simple way to track signals that aren’t immediately acted upon, but are planned for future use.  The key piece of information it holds is the `status`, which will always be "scheduled" for this type of signal. Essentially, it’s a marker indicating that the signal is waiting to be processed at a later time.

## Interface IStorageSignalRowOpened

This interface represents a signal that's currently active, or "opened." It's a simple way to track when a trading signal has been triggered and is in use. 

The `status` property clearly indicates that the signal is in the "opened" state, making it easy to identify active signals within your backtesting or trading system. Think of it as a flag saying "this signal is live."

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade has been executed and the position is no longer active. It contains information specifically related to closed signals, which is where you’ll find profit and loss data.  The `status` property will always be set to "closed" for these records.  The `pnl` property holds the `IStrategyPnL` object detailing the profit and loss realized when the signal was closed.

## Interface IStorageSignalRowCancelled

This interface defines a record representing a trading signal that has been cancelled. It's a simple way to mark a signal as no longer active. The `status` property is the only information contained, and it’s always set to "cancelled" to clearly indicate the signal’s state. Think of it as a flag saying, "This signal is not to be used."

## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, acts as the foundation for how trading signals are stored, regardless of their specific status. It ensures that every signal record includes important details like when it was created (`createdAt`), when it was last updated (`updatedAt`), and a priority level (`priority`) to help manage the order in which signals are processed. Think of it as the essential blueprint for all signal records saved to your backtest kit. The `createdAt` and `updatedAt` timestamps are captured from the results of your trading strategy's ticks, and the `priority` helps the system handle signals in a consistent order.


## Interface ISizingSchemaKelly

This interface defines how to calculate position sizes using the Kelly Criterion, a method for optimizing bet sizes based on expected return. It essentially specifies that you're employing the Kelly Criterion formula.

The `kellyMultiplier` property controls how aggressively the Kelly Criterion is applied – a smaller number (like the default of 0.25) means a more conservative approach, while a larger number could increase potential gains but also risk. You’ll use this multiplier to adjust the size of your trades based on the signals generated by your strategy.

## Interface ISizingSchemaFixedPercentage

This schema lets you define a trading strategy where the size of each trade is based on a fixed percentage of your available capital. It's simple to use: you just specify the `riskPercentage` you're comfortable with, which represents the maximum percentage of your portfolio you're willing to risk on a single trade. For example, a `riskPercentage` of 2 would mean each trade risks 2% of your total capital. The `method` property is always set to "fixed-percentage" to identify this specific sizing strategy.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, provides a foundation for defining how much of your trading account to use for each trade. Think of it as a blueprint for sizing strategies.

Each sizing configuration gets a unique `sizingName` to easily identify it. 

You can also add a `note` to explain the purpose or logic behind the sizing configuration.

The `maxPositionPercentage` limits the portion of your account risked on any single trade, expressed as a percentage.  `minPositionSize` and `maxPositionSize` set absolute limits for the position size, ensuring trades aren’t too small or too large. 

Finally, `callbacks` allow you to hook into different points in the sizing process if you need custom logic.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR). It's designed to automatically adjust your position size based on market volatility, as measured by the ATR.

The `method` is always set to "atr-based" to indicate this sizing strategy.

You specify the `riskPercentage`, which represents the portion of your account you're willing to risk on each trade – a value between 0 and 100.  The `atrMultiplier` controls how the ATR value is used to determine the stop-loss distance, and therefore, the overall size of the trade; a higher multiplier means a wider stop-loss and potentially a smaller position size.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes within the backtest-kit framework. It's primarily used when setting up how much capital your trading strategy will risk on each trade.

The `logger` property allows you to specify a logging service, which is helpful for debugging and understanding how your sizing parameters are affecting your backtest results. This lets you see what's happening under the hood, especially when experimenting with different Kelly Criterion settings.

## Interface ISizingParamsFixedPercentage

This interface defines the settings you use to control how much of your available capital is used for each trade when employing a fixed percentage sizing strategy. It’s primarily used when setting up your trading system. 

The core of this interface is the `logger` property. This lets you hook in a logging system so you can monitor what's happening behind the scenes, such as debugging sizing calculations or tracking errors. It's useful for understanding and troubleshooting your trading logic.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of an asset to trade, specifically when using an Average True Range (ATR) based sizing strategy. It lets you control how the framework handles logging information during the trading process. You’ll provide a logger object that allows the system to record details and potentially help with debugging.

## Interface ISizingCallbacks

This interface lets you tap into the sizing process of your backtest. The `onCalculate` callback gives you a chance to peek at the calculated position size and any related parameters after the sizing logic has run. You can use this to check if the size looks reasonable, maybe log the value for later review, or do some other custom validation. It’s a good spot to ensure your sizing decisions are behaving as expected.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate position sizes using the Kelly Criterion. To use this, you'll need to specify the calculation method, which is always "kelly-criterion" in this context.  You also need to provide the win rate, expressed as a number between 0 and 1, and the average win-loss ratio, representing how much you typically win compared to how much you lose on a trade. These values feed into the formula to help determine an optimal bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizes using a fixed percentage-based approach. It's simple – you specify that the sizing method is "fixed-percentage" and provide a `priceStopLoss` value. This `priceStopLoss` represents the price level at which your stop-loss order will be placed, and is used in the sizing calculation, likely to determine how much of your capital to allocate to the trade. Essentially, it's about using a consistent percentage of your account for each trade, factoring in your stop-loss price.

## Interface ISizingCalculateParamsBase

This interface, `ISizingCalculateParamsBase`, provides the foundational information needed when figuring out how much of an asset to buy or sell. Think of it as the bare minimum you need to know. It includes the trading pair you’re working with, represented by its symbol like "BTCUSDT," the amount of money currently available in your account, and the price at which you intend to initially enter the trade. These basic parameters are shared across all the different sizing calculations within the backtest-kit framework.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when calculating your trade size based on the Average True Range (ATR). It's really straightforward: you'll specify that you're using the "atr-based" sizing method, and then provide the actual ATR value to factor into your sizing decision. Think of the ATR as a measure of market volatility – the higher the ATR, the wider the range of price fluctuations. Providing this number lets your trading strategy adjust its position size accordingly.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset your trading strategy should buy or sell. It's a core part of the backtest-kit framework, helping to determine your position sizes.

The `calculate` property is the key – it's a function your sizing implementation will provide. This function takes in some parameters describing the trade and risk profile and then calculates the optimal position size, returning that value as a promise. Basically, it's where the logic for determining your trade size lives.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal that’s been validated and is ready to be used within the backtest-kit framework. Think of it as a single, packaged instruction for a trade.

Each signal contains vital details, starting with a unique `id` for easy tracking. You’ll also find information about the cost of the trade (`cost`), the entry price (`priceOpen`), and how long the position is expected to last (`minuteEstimatedTime`).

Important identifiers like the `exchangeName`, `strategyName`, and `frameName` specify where and how the trade should be executed. A timestamp (`scheduledAt`) notes when the signal was initially created, and `pendingAt` marks when it became active.

The signal includes key trading details like the `symbol` (e.g., "BTCUSDT") and flags like `_isScheduled` to indicate if it's pre-planned.

For complex strategies, you'll find history tracking. `_partial` records any partial profit or loss closures, used for precise P&L calculations. `_entry` stores a history of entry prices for strategies using Dollar Cost Averaging (DCA).

Dynamic take-profit and stop-loss management is supported through `_trailingPriceStopLoss` and `_trailingPriceTakeProfit`, which override the initial take-profit and stop-loss values.  The `_peak` property holds the best price seen in a profitable direction, helping you analyze performance. Finally, `timestamp` provides a general creation time. This row acts as the central source of truth for how a trade should be managed.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, providing all the necessary details for a trade execution. It's used when requesting signals and will automatically receive a unique identifier if one isn't already provided. 

The signal defines whether it's a "long" (buy) or "short" (sell) position, along with a human-readable note explaining the reasoning behind the trade.  You’ll specify the entry price, take profit target, and stop-loss level, ensuring that the take profit is higher than the entry for long positions and lower for short positions, and the stop loss is the opposite. 

You can also set an estimated duration for the signal's validity, or use `Infinity` to keep the position open indefinitely. Finally, the signal includes a cost value associated with entering the position.


## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that's waiting for a specific price to be reached before it's activated. Think of it as a signal on hold – it's not acted upon immediately.

It builds upon the `ISignalRow` interface, adding the element of a delayed execution based on price.

The `priceOpen` property defines the price level that must be hit for the signal to become active and trigger a trade. 

Until that price is reached, the signal remains in a 'pending' state, and a timestamp called `scheduledAt` tracks when the signal was initially created. Once the price is hit and the signal activates, a new timestamp, `pendingAt`, records the actual time it started waiting, reflecting the delay.


## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that can be cancelled. It builds upon the basic scheduled signal information by adding a unique identifier, `cancelId`, specifically used when a user decides to cancel a previously scheduled signal. Think of it as a way to track and manage cancellations initiated directly by the user, allowing for more granular control over your trading plan. The `cancelId` is only present when a cancellation has been requested.

## Interface IRiskValidationPayload

This data structure holds all the information needed to evaluate risk during a trade. It combines the usual trade signals with details about your current portfolio. You'll find the signal being considered, represented as `currentSignal`, which includes all the necessary price data. 

It also gives you a snapshot of your overall exposure: the number of open positions (`activePositionCount`) and a complete list of those active positions (`activePositions`). This lets your risk checks account for the broader impact of a trade.

## Interface IRiskValidationFn

This defines a special function used to check if a trade is safe to make. It's designed to ensure your trading strategy doesn't take on too much risk.

If the check passes (meaning the trade *is* safe), the function doesn't do anything and simply finishes.  If the check fails (the trade is too risky), the function needs to either return a specific object indicating why the trade was rejected, or raise an error; both of these actions will lead to the trade being blocked.  Essentially, it's a gatekeeper for your trades, ensuring they meet your predefined risk criteria.

## Interface IRiskValidation

This interface lets you define how to check if a trading risk is acceptable. Think of it as setting up rules to make sure trades are safe. 

You provide a function – `validate` – that actually performs the risk assessment based on the given data. This function is the core of your validation logic.

You can also add a `note` to explain what the validation does; this helps others (or yourself later!) understand the reasoning behind the check. It's a great way to document your risk management strategy.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading by providing key pricing information. It builds upon the `ISignalDto` to include the entry price (`priceOpen`), the initial stop-loss price (`originalPriceStopLoss`), and the initial take-profit price (`originalPriceTakeProfit`) that were set when the trading signal was created.  These values are crucial for validating risk parameters and ensuring the health of your backtesting or live trading system. Think of it as a record of the original pricing intended for a trade, useful for later checks and adjustments.

## Interface IRiskSchema

This interface lets you create and register custom risk profiles within the backtest-kit framework. Think of it as a way to define your own rules for how a portfolio behaves, ensuring it stays within acceptable boundaries. 

You give each risk profile a unique name and can add a note to explain its purpose.

You can also specify callbacks to react to specific events, like when a trade is rejected or allowed.  The heart of the risk profile are the validations – these are the custom functions or objects that actually enforce your risk controls.  You provide an array of these validations to define the specific checks your portfolio needs to pass.


## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a risk validation check failed. It’s essentially a notification that something went wrong during the risk assessment process. 

Each rejection result has a unique `id` to track it specifically, and a `note` that explains, in plain language, what caused the rejection. This information is invaluable for debugging and improving your trading strategies.

## Interface IRiskParams

This interface, `IRiskParams`, defines the core settings for managing risk within the backtest-kit framework. Think of it as the initial configuration you give to the risk management system. It includes essential details like the exchange you're working with (e.g., Binance), a logger for keeping track of what’s happening, and a flag to indicate whether you're in backtesting or live trading mode.

Crucially, you also get to specify a callback function, `onRejected`, which gets triggered when a trading signal is blocked by risk limits. This allows you to react to those rejections and potentially log events or perform other actions before the system officially acknowledges the rejection. It’s a powerful way to customize the risk management behavior.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds all the necessary information a strategy needs when it’s time to make sure opening a new trade is actually allowed. Think of it as a set of checks run *before* a signal is generated – a final safety net to prevent unwanted trades. It bundles data like the trading pair's symbol, the signal itself, the strategy's name, and the exchange being used.  You'll also find details like the current price, a timestamp, and information about the risk profile and timeframe being considered. Essentially, it's a convenient package of context for performing risk-related validations.

## Interface IRiskCallbacks

This interface defines functions that your trading strategy can use to respond to risk-related events. Think of them as notifications – your code gets called when a trade is allowed or when it's blocked due to risk limits. The `onRejected` function is triggered when a trade signal fails a risk check, signaling a potential problem. Conversely, the `onAllowed` function lets you know when a trade successfully passes all the risk assessments, confirming it's safe to proceed. You can use these callbacks to log information, adjust parameters, or take other actions based on these risk decisions.

## Interface IRiskActivePosition

This interface describes a single, active trade that's being monitored for risk analysis across different trading strategies. It gives you information about where and when a position was opened – including the strategy name, the exchange used, the trading symbol like "BTCUSDT," and whether it's a long or short position. 

You’ll find details about the entry price, as well as any stop-loss and take-profit levels that were set.  The interface also includes estimated duration and a timestamp indicating precisely when the trade was initiated. This data helps you get a complete picture of active positions and understand how they contribute to overall risk.

## Interface IRisk

The `IRisk` interface helps manage and control the risk associated with your trading strategies. It's like a gatekeeper, ensuring your signals don't violate predefined risk limits. 

You can use `checkSignal` to evaluate if a potential trade should be executed, based on your risk parameters.

The `addSignal` function lets you register when a new trade is opened, keeping track of its details like entry price, stop-loss, and take-profit levels. This helps monitor exposure and potential losses. 

Finally, `removeSignal` is used to clean up when a trade closes, so the risk calculations stay accurate.

## Interface IReportTarget

The `IReportTarget` interface lets you fine-tune what information gets recorded during your backtesting or live trading sessions. Think of it as a control panel for your logging – you can pick and choose exactly which events you want to see in your JSONL logs.

It offers a series of boolean flags, each representing a different area of activity: strategy executions, risk management, breakeven calculations, partial order fills, heatmap data, walker iterations, performance measurements, scheduled signals, live trading events, backtest closures, signal synchronization, and even milestones related to maximum profit.

By setting these flags to `true`, you'll capture detailed logs for that specific area. Setting them to `false` suppresses those logs, allowing you to focus on the data that's most important to you. This is really helpful for debugging, performance analysis, and understanding your trading system's behavior.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you fine-tune how backtest-kit reports data. Think of it as a set of labels you can attach to your data to make it easier to find and analyze later. You can specify things like the trading pair ("BTCUSDT"), the name of the strategy you're using, the exchange involved, the timeframe (like 1 minute or 1 hour), a unique ID for a specific trading signal, and the name of any walker optimizations you've applied.  These details allow for much more organized and searchable reports when reviewing your backtesting results.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to give users a clear view of how a trading signal has evolved. It builds upon the standard signal information by adding the original stop-loss and take-profit prices that were initially set. 

Even if those stop-loss or take-profit levels change later due to trailing or other adjustments, the original values remain visible. This is really useful for transparency and making sure users understand the initial parameters of a trade.

Here's a quick rundown of what you'll find:

*   **Cost:** The initial cost of getting into the position.
*   **originalPriceStopLoss:** The original stop-loss price when the signal was first created.
*   **originalPriceTakeProfit:** The original take-profit price.
*   **partialExecuted:** Shows what percentage of the position has been closed through partial trades.
*   **totalEntries:** How many times the position was entered, helping to understand if and how it was averaged.
*   **totalPartials:** The number of partial trades that have been executed.
*   **originalPriceOpen:** The original price at which the position was opened.
*   **pnl:** Shows the unrealized profit or loss at the time the signal was generated.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick data point, representing price action over a specific time interval. Each candlestick holds key information like the exact time it began (timestamp), the price when trading started (open), the highest price reached (high), the lowest price seen (low), the price when trading ended (close), and the total volume of trades that occurred during that period. Essentially, it’s a standardized way to represent a moment in time for a financial instrument’s price history.


## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you'll use when calculating position sizes based on the Kelly Criterion. It's all about figuring out how much to bet or trade based on your expected performance.

You’ll specify two key pieces of information: `winRate`, which represents the percentage of times you expect to win, and `winLossRatio`, representing the average profit you make on winning trades compared to the average loss on losing trades. Think of it as a way to translate your trading strategy's historical data into a calculated position size.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital to size each trade, but also includes a stop-loss price. The `priceStopLoss` property tells the system what price level you want to set your stop-loss order at to help manage potential losses. You'll provide a numerical value representing the price.

## Interface IPositionSizeATRParams

This interface defines the parameters needed for calculating position sizes using an Average True Range (ATR) method. It focuses on the core ATR value itself.  Specifically, you'll provide the current ATR value, which is a measure of volatility used to determine how much capital to allocate to a trade. Think of it as a key ingredient in a formula that adjusts your position size based on how much the price is likely to move.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface helps you define a safety zone around your Dollar-Cost Averaging (DCA) levels. It lets you specify how much price movement above and below each DCA level should still be considered an overlap, preventing unwanted trades. You set this using `upperPercent` and `lowerPercent`, both expressed as percentages – for example, 5% means 5 percent above or below. This interface gives you fine-grained control over how aggressively your backtest identifies potential overlap situations.

## Interface IPersistBase

This interface outlines the basic building blocks for any custom storage solution used within the backtest-kit framework. Think of it as a contract – if you want to connect your own database or file system to the framework, you'll need to implement these functions. It provides core operations like reading, writing, and checking for the existence of data, along with a way to list all the available data identifiers. The `waitForInit` method ensures your storage is properly set up and ready to go before anything else happens, and `keys` lets you iterate through everything stored. This promotes flexibility by allowing different persistence mechanisms without changing the core backtest-kit logic.

## Interface IPartialProfitCommitRow

This interface describes a single instruction to take a partial profit on a trade. Think of it as one step in a plan to gradually close out a position. It tells the system to sell a certain percentage of your holdings, and records the price at which that sale actually happened. The `action` property always confirms this is a partial profit instruction, while `percentToClose` specifies what portion of the position should be sold. Finally, `currentPrice` keeps track of the actual price used when executing that partial sale.

## Interface IPartialLossCommitRow

This interface represents a single instruction to partially close a trading position. Think of it as one step in a sequence to reduce your exposure.

It contains information about what action is being taken ("partial-loss"), the percentage of the position that should be closed (e.g., 50% to close half the position), and the price at which the partial closure happened. This data helps track the execution of your trading strategy and calculate performance metrics accurately.

## Interface IPartialData

This interface, `IPartialData`, helps store and retrieve data related to a trading signal. Think of it as a snapshot of key information needed to resume a backtest. It primarily focuses on the profit and loss levels that have been hit during a trading session.

The `profitLevels` property holds an array representing the profit levels achieved, while `lossLevels` does the same for loss levels. These arrays are designed to be easily saved and loaded, as they convert data structures that are difficult to serialize directly into a format suitable for persistence. The data is used within the backtest-kit framework to allow for pausing and resuming backtesting processes.

## Interface IPartial

This interface, `IPartial`, is designed to keep track of how well your trading signals are performing – whether they're making money or losing it. It helps you monitor progress and get notified when a signal hits certain profit or loss milestones, like 10%, 20%, or 30%.

The `profit` method handles situations where a signal is generating gains. It calculates the profit level and then sends out notifications only for new levels reached, avoiding repeated alerts.  Similarly, the `loss` method does the same for when signals are experiencing losses.

Finally, the `clear` method is used when a signal finishes trading – whether it hits a take profit, stop loss, or its time expires.  It removes the signal's record, saves changes, and cleans up related resources to keep things organized.

## Interface IParseArgsResult

The `IParseArgsResult` interface holds the outcome of parsing command-line arguments. It combines the original input parameters with important flags that control how your trading system operates. Specifically, it tells you whether you’re running a backtest (simulating trades using historical data), paper trading (practicing with live market data but not real money), or live trading (actual trading with real funds). This information is crucial for configuring your trading strategy's behavior.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for setting up a test – it tells the system which cryptocurrency pair to trade (like BTCUSDT), which specific strategy to use, which exchange to connect to (like Binance or Bybit), and the timeframe for the price data (such as hourly or daily). It essentially defines the starting point for your backtesting process. Each property specifies a vital detail about the backtest you want to perform.

## Interface IOrderBookData

This interface describes the structure of order book data, which is essentially a snapshot of buy and sell orders for a particular trading pair.  It includes the `symbol` representing the trading pair, like "BTCUSDT". You'll also find arrays of `bids` and `asks`.  The `bids` array contains details about orders to buy, while the `asks` array holds details about orders to sell. Each bid and ask within those arrays will be defined by the `IBidData` interface (not detailed here but containing price and quantity information).

## Interface INotificationUtils

This interface defines the core functionality for any system that wants to receive updates and notifications from the backtest-kit trading framework. Think of it as a central hub for receiving information about what's happening in your strategy – signals being generated, profit targets being met, or even errors that need to be addressed.

It provides methods for handling specific events, such as when a trade is opened or closed, partial profits or losses become available, or when the strategy needs to be adjusted. There's also a way to handle various error conditions, ensuring you're aware of any issues that arise during the backtesting process.

If you need to build a system that displays these notifications, logs them, or reacts to them in some way, you’ll implement this interface. It also offers functions to retrieve and clear all stored notifications.

## Interface IMethodContext

This interface, `IMethodContext`, acts as a little messenger, carrying important information about which parts of your backtesting setup to use. Think of it as a shortcut so you don't have to repeatedly specify things like which exchange, strategy, or timeframe you're working with. It's automatically passed around within the backtest-kit, providing a convenient way to ensure the correct components are loaded and used. 

It contains three key pieces of information: the name of the exchange, the name of the strategy, and the name of the timeframe – the last one being empty when you're running a live test. This makes your code cleaner and more organized by avoiding constant repetition of these identifiers.


## Interface IMemoryInstance

This interface outlines how different memory storage systems—whether they’re local files, persistent databases, or simple test setups—should behave within the backtest-kit framework.

The `waitForInit` method allows you to ensure the memory system is ready before you start using it.

`writeMemory` lets you store data with a unique identifier and a description, making it easy to record observations or information during your backtesting process.

Need to find something specific?  `searchMemory` provides a powerful way to locate entries using keywords, leveraging a full-text search algorithm for relevant results.

If you want to see everything that's been stored, `listMemory` will retrieve all entries and their associated data.

Of course, you can also delete specific entries with `removeMemory` using their unique ID.

For retrieving a single piece of data, `readMemory` gives you direct access to an entry based on its ID.

Finally, when you're done with the memory system, `dispose` ensures any resources it's using are properly released.

## Interface IMarkdownTarget

This interface lets you fine-tune what kinds of reports your backtest generates. Think of it as a way to control the level of detail in your analysis.

You can choose to track things like strategy signals, risk rejections, when your stop loss hits your entry price, or even partial profit/loss events.

There are options to visualize portfolio performance with a heatmap, compare different strategies, analyze performance bottlenecks, and monitor signals waiting for their triggers.

For more in-depth insights, you can enable reports covering the entire backtest process, signal synchronization, and key milestones like the highest profit achieved. Essentially, it gives you control over which aspects of the trading process you want to examine in detail.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown reports, like those you might see after a backtest. Think of it as a container holding all the details needed to identify precisely what data should be included in that report. It includes things like the directory where the report will be saved, the specific file name, and crucial information about the trading strategy itself – the symbol being traded, the strategy’s name, the exchange used, and the timeframe analyzed. The signal ID helps pinpoint a specific trading signal within the backtest data. Essentially, it's a structured way to specify exactly which backtest results you want to document.

## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what's happening. It provides a way to record messages about important events, from the basic operations to detailed debugging information.

You can use it to track things like agent actions, successful validations, or potential issues.  There are different levels of logging available:

*   `log`: For general messages about significant events.
*   `debug`: For very detailed information used mostly when you're developing or troubleshooting.
*   `info`:  For routine updates and confirmations of successful actions.
*   `warn`: For situations that aren’t critical errors but still deserve a look.

This helps with debugging, monitoring, and keeping a record of what the system is doing.

## Interface ILogEntry

This interface represents a single entry in the backtest-kit's log history. Each log entry has a unique ID, a type indicating its severity (like "log", "debug", "info", or "warn"), and a priority based on the current time. To make logs more useful, they also store the date and time when they were created, along with optional contextual information about where the log originated – specifically, details about the method and execution environment. Finally, each entry can include additional arguments passed along with the logging call.

## Interface ILog

The `ILog` interface provides a way to keep track of what's happening during your backtesting or trading simulations. It's like having a detailed record of all the events.

The `getList` method is your window into this record; it allows you to retrieve all the log entries that have been saved, giving you a complete timeline of your simulation's activity.  You can use this information for debugging, analysis, or simply understanding how your strategies performed.

## Interface IHeatmapRow

This interface represents a single row in the portfolio heatmap, giving you a consolidated view of how a specific trading pair, like BTCUSDT, performed across all your strategies. It summarizes key performance indicators, including total profit or loss as a percentage, a measure of risk-adjusted return (Sharpe Ratio), and the largest potential loss experienced (Max Drawdown). 

You'll also find details on the volume of trading activity, such as the total number of trades and how they were distributed between wins and losses. Metrics like average profit per trade, standard deviation, and profit factor help assess the consistency and potential of the trading pair. Finally, streaks of wins and losses, and expectancy, offer insights into the momentum and long-term viability of trading this symbol.

## Interface IFrameSchema

This describes a blueprint for how backtest-kit organizes historical data into manageable chunks called "frames." Think of it as defining a specific window of time and the frequency of data points within that window for your backtesting. 

Each frame has a unique name to identify it, a place for developers to add notes for clarity, and crucially, specifies the interval (like daily, hourly, or weekly) at which data is generated. 

You also define the start and end dates for the period this frame represents, essentially bounding the historical data you’ll be working with. Finally, you can optionally hook into certain events within the frame’s lifecycle with custom callbacks for more intricate control.

## Interface IFrameParams

The `IFrameParams` interface defines the information needed when setting up a core component of the backtest-kit framework, essentially configuring how the simulation runs. It builds upon a base schema for frame-related settings and importantly includes a `logger`—a tool to help you track what's happening during the backtest and pinpoint any issues. Think of the `logger` as a debugging assistant, providing insights into the backtest’s operations. It allows you to see messages and error details that can be vital for understanding and improving your trading strategies.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface provides a way to react to events happening within your backtesting framework. Specifically, you can use the `onTimeframe` callback to be notified whenever a new set of timeframes is created. This is handy if you need to check those timeframes, log information about them, or perform other actions when they're ready.  You'll receive the timeframes themselves, along with the start and end dates and the interval used for their creation.

## Interface IFrame

The `IFrame` interface helps generate the timeline of data your backtest will use. Think of it as the mechanism that figures out when each data point should be considered during your trading simulation. It has one main function, `getTimeframe`, which you can use to create an array of dates and times based on a specific trading symbol and timeframe name. This array represents the sequence in which your trading strategy will be tested.

## Interface IExecutionContext

The `IExecutionContext` interface holds important information about the current state of your trading operations. Think of it as a little package of data that's automatically passed around during backtesting and live trading. It contains details like the trading pair you're working with (e.g., BTCUSDT), the precise time the operation is happening, and whether you're in backtest mode or running live. This context helps your strategies and exchange interactions know what's going on and makes things work smoothly.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a particular cryptocurrency exchange. It essentially tells the framework where to get historical data like candles (price charts), order books, and trades, and how to correctly format quantities and prices to match that exchange’s rules. Each exchange needs its own schema registered with the system to work properly.

You’ll define a unique name for each exchange using `exchangeName` and can add a developer note with `note` for documentation purposes. 

The most important part is `getCandles`, which is responsible for retrieving historical price data.  You'll also find functions to handle things like `formatQuantity` and `formatPrice`, ensuring orders and trades are correctly represented. If you don't provide methods for order books (`getOrderBook`) or aggregated trades (`getAggregatedTrades`), the system will know not to use them. Finally, you can include lifecycle `callbacks` for custom actions that happen while data is being processed.

## Interface IExchangeParams

This interface defines the necessary configuration for connecting to an exchange within the backtest-kit framework. It provides a set of functions that allow the framework to interact with the exchange's data.

You'll need to provide a logger for debugging, an execution context that holds information like the trading symbol and backtest status, and a way to retrieve historical candle data.

Crucially, you also need to implement functions for formatting order quantities and prices to comply with the exchange's specific rules.

Finally, the interface requires methods for fetching order book data and aggregated trade data, allowing the backtest to simulate real-time market conditions. All these methods are essential and have default implementations that you can customize if needed.

## Interface IExchangeCallbacks

This interface defines functions your custom exchange can use to notify backtest-kit about incoming data. Specifically, `onCandleData` is triggered whenever the exchange provides new candlestick data. This allows backtest-kit to update its state and continue the backtesting process. The function receives details such as the symbol being traded, the candlestick interval (e.g., 1 minute, 1 hour), the starting date of the data, the number of candles received, and an array containing the actual candle data. You can use this callback to handle and process the incoming price information.

## Interface IExchange

This interface defines how a trading exchange interacts with the backtesting framework. It allows you to retrieve historical and future candlestick data, crucial for analyzing past performance and simulating future trades. You can also format trade quantities and prices to match the exchange’s specific requirements, ensuring your orders are correctly submitted. 

The framework provides methods to calculate the VWAP (Volume Weighted Average Price) – a common indicator – and access order book and aggregated trade data to understand market depth and recent trading activity.  A particularly useful function lets you retrieve raw candle data with considerable flexibility in terms of date ranges and limits, giving you fine-grained control over your data pulls while preventing any look-ahead bias that could skew your backtest results. The framework intelligently handles date and limit combinations to ensure data accuracy within the backtest environment.

## Interface IEntity

This interface, `IEntity`, acts as a foundation for anything your backtest kit stores and later retrieves. Think of it as a common blueprint – any data you want to keep around, like trades or portfolio snapshots, should probably implement it. It ensures all those stored objects have a consistent structure, making it easier to work with them later on.

## Interface IDumpInstance

The `IDumpInstance` interface defines how you can save different kinds of data during a backtesting process. Think of it as a way to record important information for later analysis or debugging.

You can use it to save conversations between agents, which are essentially lists of messages. It also allows you to store simple records – just key-value pairs.  Need to save a table of data? You can pass it in as an array of objects, and the system will automatically figure out the column headers. 

There are methods to save raw text, error messages, and complex JSON objects as well.  Finally, when you’re finished with a dump instance, the `dispose` method lets you clean up any resources it might be using. The instance is tied to specific signal and bucket names when it’s created.

## Interface IDumpContext

This interface, `IDumpContext`, helps keep track of where data came from when it's being recorded. Think of it as a label attached to each piece of information, letting you know which trade it relates to and which strategy or agent generated it. Each dump gets a unique identifier, and you can add a description to make it easier to understand what the data represents – this description even shows up in searches and reports.  It’s primarily used behind the scenes by the DumpAdapter to organize and identify your trading data.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as the foundation for handling commit events within the backtest-kit. Think of it as a way to hold essential information about a trade before it's officially processed. It ensures that commit actions happen at the right time, especially when dealing with asynchronous operations.

Each commit event carries details like the `symbol` being traded (e.g., "BTC-USD") and a flag, `backtest`, indicating whether the trade occurred during a simulation or in live trading. This provides context for how the trade should be handled.


## Interface ICheckCandlesParams

This interface defines the information needed to check if your cached candle data is consistent. It's used to verify that the timestamps of your historical candle data match what you expect, which is crucial for reliable backtesting. You'll provide the trading symbol like "BTCUSDT," the name of the exchange, the candle timeframe (like 1-minute or 4-hour candles), and a date range to examine.  Finally, you can specify where your candle data is stored on your system, though there’s a default location if you don't.

## Interface ICandleData

This interface defines the structure for a single candlestick, which is a fundamental building block for analyzing price movements and testing trading strategies. Each candlestick represents a specific time period and contains key information like the opening price, the highest and lowest prices reached, the closing price, and the total trading volume during that time. The `timestamp` tells you precisely when this candle began, allowing you to sequence the data chronologically. This data is crucial for tasks like calculating VWAP and running backtests to evaluate trading strategies.

## Interface ICacheCandlesParams

This interface defines the settings needed to download and store historical price data, also known as candles, for a trading backtest. You'll use these settings to tell the system which trading pair (like BTCUSDT), which exchange to pull data from, the time frame of the candles (like 1-minute or 4-hour intervals), and the specific date range you want to download. Essentially, it's a blueprint for gathering the historical data your backtest will need to analyze.

## Interface IBroker

This interface defines how your trading framework connects to a live brokerage account. Think of it as the bridge between your automated trading logic and the actual exchange. It ensures that actions like opening, closing, and adjusting positions are properly communicated to the broker.

Importantly, these calls happen *before* any changes are made within the trading framework itself, so any errors are caught and the system remains consistent. During backtesting, these methods are ignored because the framework simulates the trades internally.

Here’s a breakdown of what each method does:

*   `waitForInit`: This is a one-time setup call to connect to your broker, authenticate, and get everything ready to go.
*   `onSignalCloseCommit`:  This is triggered when a trade is closed, whether by a take-profit, stop-loss, or manual intervention.
*   `onSignalOpenCommit`:  This signifies that a new trade has been successfully opened.
*   `onPartialProfitCommit`: This handles closing a portion of a trade to secure profits.
*   `onPartialLossCommit`: Similar to partial profit, this deals with closing a portion of a trade to limit losses.
*   `onTrailingStopCommit`: Used for adjusting trailing stop-loss orders.
*   `onTrailingTakeCommit`:  Manages updates to trailing take-profit orders.
*   `onBreakevenCommit`:  Deals with setting or adjusting a breakeven stop-loss.
*   `onAverageBuyCommit`: This is called when you’re using a dollar-cost averaging (DCA) strategy to build a position.



By implementing this interface, you can adapt the framework to work with various brokers and exchanges.

## Interface IBreakevenData

This interface, `IBreakevenData`, helps store information about whether a trading breakeven point has been achieved. Think of it as a simplified record of a trading signal's progress, specifically designed to be easily saved and loaded from a database or file. It contains just one crucial piece of information: a `reached` flag which is a simple true/false value indicating if the breakeven has been met. This makes it easy to handle the data when you need to persist it, and then convert it back into a more complete trading state when you're ready to use it again.

## Interface IBreakevenCommitRow

This interface represents a single event related to adjusting a trade to breakeven. It’s used internally within the backtest-kit framework when a trade's stop-loss order is automatically moved to the current price.

The `action` property simply identifies this as a “breakeven” action, helping the system understand what type of event this is. The `currentPrice` property holds the price at which the breakeven adjustment was made - it's the price the trade is now protected at. These pieces of information are valuable for logging, analysis, and potentially visualizing trading strategies.

## Interface IBreakeven

This interface helps keep track of when a trade's stop-loss should be adjusted to breakeven, essentially covering the initial transaction costs. It's used by components that manage trading signals and their associated actions.

The `check` method is the core of this process, running periodically to see if the price has moved enough to justify moving the stop-loss to the original entry price.  It considers whether breakeven has already been achieved, accounts for trading fees, and ensures the stop-loss can realistically be adjusted.

When breakeven is reached, the `check` method records that, notifies interested components, and saves that information. The `clear` method is called when a trade is finished – whether by hitting a take profit, stop-loss, or expiration – to clean up the breakeven tracking and remove the signal's data.

## Interface IBidData

This describes a single bid or ask price within an order book. Each bid or ask is represented by an `IBidData` object, which tells you the price at which someone is willing to buy or sell.  The `price` property holds that price as a string, and the `quantity` property indicates how much is available at that price, also as a string. Essentially, it's a snapshot of one level within the order book, showing both the price and the volume being offered.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy, also known as a DCA (Dollar-Cost Averaging) strategy.  Each time a new average-buy order is executed, a row like this is created to track the details. You'll find the price at which the trade happened (`currentPrice`), the USD cost of that specific trade (`cost`), and the total number of averaging entries that exist so far (`totalEntries`).  The `action` property simply confirms that this row relates to an average-buy transaction.

## Interface IAggregatedTradeData

This data structure holds information about a single trade that took place. Think of it as a record of a transaction, containing details like the price, how many units were exchanged, and when it happened. A key piece of information is whether the buyer was acting as a market maker, which helps understand the trade's direction and influence. Each trade record has a unique ID so it can be easily tracked and referenced.

## Interface IActivateScheduledCommitRow

This interface represents a queued request to activate a scheduled commit within the backtest-kit framework. Think of it as a notification that a previously planned action should now be executed. It includes the type of action being performed – in this case, "activate-scheduled" – alongside the unique identifier of the signal involved. Optionally, it can also contain an activation ID, useful if the activation was triggered directly by a user instead of automatically. Essentially, it's a structured message telling the system to go ahead and carry out a scheduled action.

## Interface IActionSchema

This defines a blueprint for creating custom actions that can be attached to your trading strategies within backtest-kit. Think of actions as hooks that allow you to inject your own logic into the trading process. You can use them to track what's happening, manage state, send notifications, or trigger other business processes. 

Each action is given a unique name for easy identification and can be annotated with a helpful note for documentation.  The core of an action is its handler, which is essentially a function or a class constructor that gets called whenever relevant events occur during strategy execution. You also have the option to define lifecycle callbacks for more fine-grained control over when and how your action behaves. Actions are created and run separately for each strategy and each time frame you're analyzing.

## Interface IActionParams

This interface, `IActionParams`, bundles together all the information an action needs to run smoothly within the backtest-kit framework. Think of it as a package deal: it contains a logger to help you track what's happening, details about which strategy and timeframe the action belongs to, and flags that indicate whether it's running in a simulated backtesting environment.  It includes the strategy’s name, the name of the exchange being used (like Binance), and the timeframe the action is associated with.  Finally, a `backtest` flag tells the action if it’s running against historical data or in a live trading setting.

## Interface IActionCallbacks

This interface lets you hook into different stages of your trading action's lifecycle, offering a way to customize its behavior and monitor its activity. Think of it as a set of event listeners you can use to respond to what's happening behind the scenes.

You can use `onInit` to prepare things when your action starts, like connecting to a database or loading saved data.  Conversely, `onDispose` lets you clean up when it's done, closing connections and saving state.

Several `onSignal` callbacks provide insights into the trading process. `onSignalLive` and `onSignalBacktest` are specific to live and backtest modes respectively, while `onSignal` covers both.  There are also callbacks for breakeven, partial profit/loss, and ping monitoring, offering fine-grained control.  `onRiskRejection` alerts you when a signal doesn't pass risk management checks.  Finally, `onSignalSync` allows you to influence order placement attempts using limit orders, with an important caveat: errors here will halt the process, prompting a retry.

## Interface IAction

This interface, `IAction`, is your central hub for connecting your own custom logic to the backtest-kit framework. Think of it as a way to tap into the framework's internal events and react to them.

It provides a set of methods, each representing a specific event that might occur during a trading simulation or live trading session. These events range from core signal generation (`signal`, `signalLive`, `signalBacktest`) to notifications about breakeven points, partial profits/losses, scheduled pings, risk rejections, and even synchronization events when orders are being placed.

You can use these methods to build things like custom dashboards, logging systems, or even integrate with external analytics platforms to track your strategy’s performance.  The `dispose` method is crucial for cleanup – make sure you unsubscribe from any resources and close connections when the action handler is no longer active. The `signalSync` method deserves special attention as throwing an error here can reject a limit order attempt and trigger a retry.

## Interface HighestProfitStatisticsModel

This model helps you keep track of the most profitable trading events within your backtest. It stores a list of these high-profit events, displayed in chronological order with the most recent ones first. You'll also find the total count of all recorded high-profit events, giving you a quick overview of how often these profitable situations occurred during your backtesting. Think of it as a summary of your best-performing trades.


## Interface HighestProfitEvent

This object holds information about the single most profitable moment for a trading position. It tracks when the highest profit was achieved, including the exact timestamp and the trading symbol involved. You’ll find details like the strategy and signal that triggered the trade, the position direction (long or short), and the unrealized profit (PNL) at that peak. 

Crucially, it also records the price at which the profit record was set, along with the entry price, take profit level, and stop loss levels. Finally, a flag indicates whether this profit event happened during a backtesting simulation.

## Interface HighestProfitContract

The HighestProfitContract provides information when a trading position reaches a new peak profit. It's like a notification letting you know a position is performing exceptionally well.

You’ll get details like the trading symbol (e.g., BTC/USDT), the current price, and precisely when this profit milestone was hit. 

The notification also includes context: the name of the trading strategy used, the exchange involved, and the timeframe being analyzed. The signal data tied to the position is also included.

Finally, a flag tells you if this update came from a historical backtest or from live trading, which is useful for adjusting how you respond to the news. This allows you to build custom actions, like automatically adjusting a stop loss, when a position hits a certain profit level.

## Interface HeatmapStatisticsModel

This model organizes data for creating a portfolio heatmap, giving you a snapshot of how your investments performed. It presents key information about each symbol you're tracking, along with overall portfolio metrics. 

You'll find an array of individual symbol statistics within the `symbols` property, allowing you to drill down into specific assets.  `totalSymbols` simply tells you how many symbols are included in the data. 

Beyond individual symbols, you’ll also see aggregated portfolio-level data such as the total profit and loss (`portfolioTotalPnl`), the Sharpe Ratio which assesses risk-adjusted returns (`portfolioSharpeRatio`), and the total number of trades executed (`portfolioTotalTrades`). This provides a quick, high-level view of your portfolio’s overall health.

## Interface DoneContract

This interface describes what's sent when a background task finishes, whether it's a backtest or a live trading session. You’ll receive an event like this when a background process in your strategy concludes. It tells you which exchange was used, the name of the strategy that ran, and whether it was a backtest or live run.  You'll also find the trading symbol involved, and the name of the frame if it’s a backtest.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest-kit framework, indicating a problem so severe that the process needs to be stopped. Each critical error notification has a unique identifier and includes a detailed error object, complete with a stack trace and any relevant metadata to help diagnose the issue.  You'll also find a human-readable message explaining what went wrong. Importantly, these notifications always come from the live context and won't be related to the backtesting simulation itself, as indicated by the `backtest` property always being false.

## Interface ColumnModel

This interface helps you define how data should be displayed in a table. Think of it as a blueprint for each column you want to create. You specify a unique `key` to identify the column, a user-friendly `label` for the header, and a `format` function to transform your data into a readable string. 

You can also control whether a column is shown or hidden using the `isVisible` function, which allows for dynamic column visibility. Essentially, it gives you a lot of control over how your data is presented in a structured table format.

## Interface ClosePendingCommitNotification

This notification informs you when a pending trade signal is closed before it actually becomes an active position. It's particularly useful if you're experimenting with strategies and want to understand why signals might be closing without being fully executed.

The notification includes a lot of details to help you investigate: a unique identifier for the notification and the signal itself, the timestamp of when the close was committed, and whether it happened during a backtest or in live trading. You'll find information about the trading pair, the strategy that generated the signal, and the exchange where the signal originated.

It also provides crucial data points about the trade itself, like the original entry price, the total number of entries and partial closes, and comprehensive profit/loss information, including percentages, costs, and the prices used in the PNL calculation. Finally, there's a timestamp indicating when the notification itself was created.


## Interface ClosePendingCommit

This signal lets the backtest kit know you're closing out a pending order. It's used when a pending order, like a limit or stop order, gets filled unexpectedly. The `action` field confirms this is a closing action. You can optionally provide a `closeId` to help you track why the order closed – maybe it was due to a specific market event or user intervention. Finally, the `pnl` details show the profit and loss associated with closing that pending order at that specific moment.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it could be activated. It provides detailed information about the cancelled signal, including a unique identifier, the timestamp of the cancellation, and whether it occurred during a backtest or live trading.

You'll find details like the trading symbol, the name of the strategy that generated the signal, and the exchange it was intended for. The notification also includes specific identifiers like `signalId` and a provided `cancelId` if a reason for cancellation was given. 

Crucially, it outlines the specifics of the order being cancelled, such as the total entries, partial closes, and original entry price.  You'll also see performance data attached, like the Profit and Loss (PNL) metrics at the time of cancellation, including percentages, costs, and the calculated entry and exit prices. This comprehensive data allows you to understand why a scheduled signal didn’t execute and evaluate the impact of the cancellation.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event within the backtest-kit framework. Think of it as a way to undo a planned action. You’ll specify that you want to "cancel-scheduled," and you can optionally provide a `cancelId` to help track why the cancellation occurred.  Importantly, it also includes the unrealized Profit and Loss (`pnl`) at the time you're cancelling the scheduled event, offering context for the change.

## Interface BreakevenStatisticsModel

This model helps you understand how often and when breakeven points are being reached during a trading backtest. It tracks individual breakeven events, giving you a detailed list of each one. You'll also find a simple count of the total number of breakeven events that occurred, providing a quick overview of their frequency.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized way to track when trading signals have reached their breakeven point during a backtest or live trade. It bundles together all the key details about that event, making it easier to analyze and report on your trading strategy's performance.

You'll find information like the exact time, the trading symbol involved, and the name of the strategy that generated the signal. It includes the original entry price, take profit and stop loss levels, as well as any adjustments made through DCA (Dollar Cost Averaging) strategies.  It also keeps track of partial closes, the unrealized profit and loss (PNL), and any notes related to the signal’s reasoning. The event also records the creation and activation timestamps, along with whether the trade occurred in backtest or live mode.

## Interface BreakevenContract

This interface, `BreakevenContract`, represents a specific event in your trading system: when a signal's stop-loss is adjusted to the entry price, effectively reaching a breakeven point. Think of it as a milestone marking reduced risk for a trade.

It's a way to keep track of when strategies are successfully minimizing potential losses. This event is only triggered once for each signal to avoid duplicates.

The data included in this event gives you a complete picture of the signal’s details, including the original stop-loss and take-profit levels, and whether it’s a backtest or live trade. You’ll find information like the trading symbol, the name of the strategy that created the signal, the exchange used, and the timestamp of the event. The current price at the time of breakeven is also provided for verification.

Services like report generation and user callbacks can leverage this information to understand strategy performance and risk management.

## Interface BreakevenCommitNotification

This notification tells you when a breakeven action has been executed, essentially when a trade has reached a point where it's neither profitable nor at a loss. It's a detailed report, offering a snapshot of the trade's key details at that moment.

You’ll find information like a unique ID for the notification and the exact time it occurred, whether it happened during a backtest or a live trade, and the symbol being traded. It also includes specifics about the strategy that triggered the action, the exchange used, and the signal's identifier. 

The notification unpacks the trade itself, listing the entry price, take profit, stop loss levels—both their effective values and the original levels before any trailing adjustments. It provides a breakdown of the trade’s structure, like how many DCA entries were used and if any partial closes were executed.

Crucially, it provides P&L information, including the profit/loss amount, percentage, and the prices used in that calculation. Finally, it contains timestamps tracking the signal's lifecycle: when it was created, when it became pending, and when the breakeven action was committed.

## Interface BreakevenCommit

The BreakevenCommit represents an event triggered when a strategy adjusts a trade to break even. It contains all the relevant information about the trade at the moment of this adjustment.

You'll find details like the current market price, the unrealized profit and loss (PNL) of the position, and whether it’s a long (buy) or short (sell) trade.

Crucially, it also holds the original entry price, the original and current take profit and stop loss prices, along with timestamps indicating when the signal was created and when the position was activated. This allows you to fully understand the context and sequence of events leading to the breakeven adjustment.

## Interface BreakevenAvailableNotification

This notification tells you when a trading signal has reached a point where its stop-loss order can be moved to breakeven – meaning it's at the original entry price. It's a signal that the trade has potentially recovered its initial risk.

The notification includes a lot of details about the trade, such as the trading symbol, the strategy that generated the signal, and the exchange used. You’ll also find information about the current price, entry price, trade direction (long or short), and even the original stop-loss and take-profit prices before any trailing adjustments were applied.

It also provides information about the trade’s history, like the number of DCA entries and partial closes that have occurred. Finally, it provides a snapshot of the trade's profitability at that moment, including P&L, percentage gain/loss, and related prices used in the calculation. This helps understand the performance context surrounding this breakeven availability.

## Interface BacktestStatisticsModel

This model holds all the important statistical data generated after running a backtest. Think of it as a report card for your trading strategy. 

It includes a detailed list of every trade that was closed, along with key information like price and profit/loss. You'll also find the total number of trades, and how many were winners versus losers.

To help you understand performance, it provides metrics like win rate (the percentage of winning trades), average profit per trade, and total profit across all trades. It also calculates volatility using standard deviation and a refined risk-adjusted return called the Sharpe Ratio, both annualized for a clearer picture of yearly performance. Finally, it includes certainty ratio and expected yearly returns to further assess the strategy’s reliability and potential. All numeric values are carefully checked, and will be marked as unavailable if calculations are unreliable.

## Interface AverageBuyCommitNotification

This notification is sent whenever a new averaging (DCA) buy order is executed within a trading strategy. It provides a detailed snapshot of the averaging process and the current state of the position. You'll find information like the unique ID of the notification, the exact timestamp of the averaging buy, and whether it occurred during a backtest or live trading. 

The notification includes specifics about the trade itself, such as the symbol being traded, the strategy that generated the signal, and the exchange used. It also contains vital pricing information - the price at which the averaging buy was executed, the total cost of that buy, and the updated effective entry price after adding this new average. 

Beyond just the buy itself, the notification reveals the overall progress of the DCA strategy – the total number of averaging entries made, any partial closes executed, and the current position direction. You can track the performance of the trade with metrics like P&L, percentage profit/loss, and entry/exit prices used for P&L calculations, as well as the initial signal and pending timestamps. Essentially, this notification offers a comprehensive view of the averaging buy event and its impact on the trade.

## Interface AverageBuyCommit

This event signals a new average-buy (DCA) action has occurred within a trading strategy. It’s triggered when a new buy or sell order is added to an existing position to gradually lower the average entry price. The event provides details like the price at which the new order was executed, the cost of that specific buy/sell, and the updated, averaged entry price for the overall position. You’ll also find information about the unrealized profit and loss, the original entry price that started the position, and any adjustments made to the take profit and stop loss levels. It contains timestamps indicating when the signal was created and when the position became active.

## Interface ActivePingContract

This interface, `ActivePingContract`, helps you keep track of what’s happening with your pending signals while they're active. Think of it as regular check-ins from your trading system. It sends out a signal every minute for each pending signal that's still open, providing updates on its status.

You can use these updates to build custom logic – for example, to automatically adjust signals based on changing market conditions or to monitor their overall health.

Each ping event includes details like the trading symbol, the strategy involved, the exchange it’s on, and the full signal data, including things like entry price and stop-loss levels.  You also get the current price at the moment the ping was sent, and a flag to tell you if it’s coming from a backtest or a live trade.  The timestamp tells you exactly when the ping occurred, either at the time of the ping in live mode or from the candle being processed during backtesting.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been manually activated, letting you know a trade is about to happen. It provides a wealth of details about the upcoming trade, including a unique identifier, the exact time of activation, and whether it's happening during a backtest or live trading.

You'll find key information like the strategy and exchange involved, the trade direction (long or short), and the prices that will be used for entry, take profit, and stop loss. The notification also includes details about any averaging or partial closes that might have occurred, along with detailed P&L information. This comprehensive data helps you understand the context of the trade and track its performance. A timestamp indicates when the signal was initially created, and another when it moved into a pending state. Finally, there’s the current market price at the time of activation and a timestamp of when the notification itself was generated.

## Interface ActivateScheduledCommit

This interface describes what happens when a previously scheduled trading signal is put into action. Think of it as the system confirming and executing a plan that was set up earlier. It carries a lot of important information about the trade, including the direction (long or short), the entry price, and the initially set take profit and stop loss levels.

You'll find details about the current market price at the moment of activation, along with the current profit and loss (PNL) associated with the trade. A key part is the timestamp of when the signal was originally created and when the trade actually starts. There’s also a field for an optional user-provided identifier, allowing for tracking or reasons for the activation. It also includes original take profit and stop loss prices before any adjustments were made.
