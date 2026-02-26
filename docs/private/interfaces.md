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

This interface defines a signal that's sent when a walker, which is a component managing a trading strategy, needs to be stopped. Think of it as a notification that something’s interrupting the automated trading process. 

It provides key information about what's being stopped, specifically the trading symbol involved, the name of the strategy being paused, and the specific walker that’s being halted. This allows different parts of the system to react to a stop signal and ensure the correct trading activity is interrupted. Because systems might run multiple strategies at once, the walker name lets you target specific walkers within a symbol.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and present the results of your backtesting experiments. Think of it as a container holding all the information you need to compare different trading strategies. It builds upon the existing IWalkerResults interface and adds extra details specifically for comparing strategy performance. Inside, you’ll find `strategyResults`, which is simply a list of all the results generated by the different strategies you tested—giving you a clear view of how they stack up against each other.

## Interface WalkerContract

The `WalkerContract` represents updates during a comparison of different trading strategies. Think of it as a notification that a strategy has finished its test run and its results are available. Each notification includes details like the name of the strategy, the exchange and frame it was tested on, the trading symbol, and the specific statistic calculated (like Sharpe Ratio or drawdown). 

You’ll also find the strategy’s performance metrics, along with the overall best performance seen so far and how many strategies have been tested in total. This allows you to monitor the progress of strategy comparisons and see which ones are performing the best as the testing progresses. It essentially provides a running commentary on the backtesting process.

## Interface WalkerCompleteContract

This interface describes the event that signals the completion of a backtesting process. It’s triggered when all the strategies being compared have finished running and the final results are ready.

The event package contains vital details about the backtest, like the name of the walker that ran it, the trading symbol being analyzed, the exchange and timeframe used.

You'll also find information about the optimization metric, the total number of strategies tested, and, crucially, which strategy performed the best. This includes the best metric value achieved and the full statistical breakdown for that top-performing strategy. Essentially, it gives you a complete picture of the backtest's outcome.


## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during your backtesting or live trading. It's essentially a signal that something went wrong with the rules you've set up to ensure your trades are safe and reasonable.

Each notification includes a unique ID to help you track it, a detailed error message you can understand, and all the technical information about the error—like the stack trace—to help you diagnose the problem.  Importantly, this notification always indicates it originated from the live context, meaning it isn't specific to a backtest simulation.

## Interface ValidateArgs

This interface, `ValidateArgs`, is like a checklist for ensuring the names you’re using in your backtesting setup are correct. It outlines all the key names – like the exchange you're trading on, the timeframe you’re using, the strategy you’ve chosen, and even the risk profile and sizing methods – that need to be valid. 

Think of it as a way to double-check that you haven't misspelled anything or are trying to use a name that doesn’t exist in your system. 

Each property within `ValidateArgs` expects an enum object, which provides a limited, pre-defined set of acceptable names.  This keeps things consistent and helps prevent errors.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's fired whenever the trailing take action happens, whether you're backtesting or trading live. 

You'll find key details included, like a unique ID for the notification, the exact time it occurred, and whether it happened during a backtest. The notification provides information about the trade itself – the symbol, the strategy that triggered it, and the exchange used.

It also gives you a breakdown of the price points involved, including the original take profit and stop loss prices before any trailing adjustments, as well as the effective prices after the trailing has been applied. The notification also shares details about the position, entry price, and any DCA averaging that may have occurred, along with timestamps for when the signal was initially created and when the position was activated.

## Interface TrailingTakeCommit

This data represents an event related to a trailing take profit strategy being executed. It tells you that the system is adjusting a take profit price based on the market's movement. 

You'll find details like the percentage shift used to adjust the price, the current market price when the adjustment happened, and the direction of the trade – whether it's a long (buy) or short (sell) position. 

Crucially, it includes both the updated take profit and stop-loss prices, alongside their original values *before* any trailing adjustments were made. You can also track when this event was planned and when the associated position was activated. Essentially, this provides a complete picture of a trailing take profit adjustment event, documenting all the key values involved.

## Interface TrailingStopCommitNotification

This notification lets you know when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade that just happened, including a unique identifier for the notification itself, the exact time it occurred, and whether it was part of a backtest or a live trade. You'll find details like the trading symbol, the name of the strategy that generated the signal, and the exchange where the trade took place.

The notification also includes all the crucial pricing information, like the current market price, entry price, take profit, and stop loss levels - both their current adjusted values and their original values before any trailing adjustments. You can also see the number of entries if the position was created using a DCA (dollar cost averaging) strategy. Finally, timestamps related to signal scheduling and pending status provide a full timeline of the trade's lifecycle.

## Interface TrailingStopCommit

This describes an event related to a trailing stop order being triggered. It provides details about how the stop loss price has been adjusted.

The `action` property confirms that this event specifically concerns a trailing stop. 

You’ll find the `percentShift` which indicates how much the stop loss price has moved, based on a percentage. The `currentPrice` shows the market price at the moment the trailing adjustment happened.

The event also includes essential information about the trade itself, like whether it's a `position` of "long" (buying) or "short" (selling), and the `priceOpen` where the trade was initiated.

You can track the current `priceTakeProfit` and `priceStopLoss`, along with their `original` values before any trailing adjustments occurred. Finally, `scheduledAt` tells you when the signal was initially created and `pendingAt` marks when the position actually started.

## Interface TickEvent

This interface, `TickEvent`, acts as a central container for all the data related to a trading event. Think of it as a single record describing what happened – whether a trade was opened, closed, scheduled, or cancelled. It brings together key pieces of information like the timestamp of the event, the type of action taken (opened, scheduled, etc.), and details about the trade itself, such as the symbol being traded, the signal ID, and associated prices.

Many properties are specific to certain actions – for example, take profit and stop loss prices are mainly relevant for scheduled, waiting, opened, active, closed and cancelled events. The interface also provides details about DCA averaging through the `totalEntries` field and allows tracking modifications to prices with `originalPriceTakeProfit` and `originalPriceStopLoss`.  For completed trades, you'll find information like the close reason, duration, and realized PNL.  Finally, `pendingAt` and `scheduledAt` give context to when specific states were reached.

## Interface StrategyStatisticsModel

This model holds a collection of statistics related to your trading strategy's actions. Think of it as a detailed report card for your strategy, showing how many times it performed certain actions.

You’ll find a comprehensive list of every event that occurred, along with the total number of events recorded. 

It breaks down the counts of specific event types, such as canceling scheduled orders, closing pending orders, taking partial profits or losses, using trailing stops, setting breakeven prices, and activating scheduled actions. 

There’s also a count for average buy (dollar-cost averaging) events. This information helps you analyze your strategy's behavior and identify areas for optimization.

## Interface StrategyEvent

This data structure holds all the important details about actions your trading strategy takes, making it easy to create reports and understand what happened during a backtest or live trading. Each event contains a timestamp and identifies the specific strategy, symbol, and exchange involved. You’ll find information about the signal that triggered the action, along with the price at which the action was executed, like the current market price. 

For actions like partial profit taking or trailing stops, it includes the percentage used for those calculations.  If an action was scheduled or pending, it provides unique IDs to track its status. 

You'll also get key details about the trade itself, such as the trade direction (long or short), entry price, and the take profit and stop loss prices—both the initially set values and the adjusted values if trailing was in use.  For strategies using dollar-cost averaging (DCA), it tracks the total entries and the final, averaged entry price. Lastly, timestamps denote when the signal was first created and when the position became pending, giving a complete picture of the trading timeline.

## Interface SignalScheduledNotification

This notification tells you when a trading signal has been planned for execution in the future. It's like getting a heads-up that a trade is going to happen, but not *right now*. Each notification has a unique ID and timestamp indicating exactly when the signal was scheduled.

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange it’s intended for. It also includes key price points – the target entry price, take profit, and stop loss levels – along with their original values before any adjustments. 

If you're backtesting, the notification will clearly indicate that.  You'll also see information about any dollar-cost averaging (DCA) strategy used, with the total number of planned entries. Finally, the notification shares the current market price at the time of scheduling, alongside the timestamp of its creation.

## Interface SignalOpenedNotification

This notification lets you know when a new trade has started within your backtest kit system. It provides a wealth of information about the trade, including a unique ID for tracking purposes and the exact time it was opened. You’ll find details like the trading symbol (e.g., BTCUSDT), the strategy that triggered the trade, and whether it’s a "long" (buy) or "short" (sell) position. 

The notification also breaks down the price points, including the entry price, take profit, and stop loss levels, and even gives you the original prices before any adjustments were made.  For trades using dollar-cost averaging (DCA), the number of entries is included.  Finally, a note field lets the strategy author add a short description for extra context. The timestamps provide a complete timeline from signal creation to the position becoming active.

## Interface SignalData$1

This data structure holds all the important details about a completed trading signal. Think of it as a record of one specific trade. 

It tells you which strategy created the signal, a unique ID for that signal, and the symbol being traded (like BTC/USD). You’ll also find information about whether the trade was a long or short position, the profit and loss (PNL) as a percentage, and why the signal was closed. Finally, it records the exact times the signal was opened and closed, allowing you to track its duration and performance.

## Interface SignalCommitBase

This interface defines the core information shared by all signal commitment events within the backtest-kit framework. Every signal, whether generated during a backtest or in a live trading environment, will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange being used. 

Backtesting signals have a 'frameName' associated with them, indicating the timeframe used during the backtest, while live signals won’t. You’ll also find a unique identifier for each signal, a timestamp marking when it occurred, and information about how many entries were involved in a potential DCA strategy. Importantly, the 'originalPriceOpen' field captures the initial entry price, allowing you to track how it relates to subsequent price movements and any DCA averaging that might have occurred.

## Interface SignalClosedNotification

This notification tells you when a trading position, initiated by a strategy, has been closed, whether that was due to a take profit, stop loss, or other reason. It provides a wealth of information about the trade, from its unique identifiers to the specific prices at which it was opened and closed. You’ll find details like the strategy's name, the exchange used, and whether the trade occurred in backtest or live mode. 

The notification includes data about the original signal parameters like take profit and stop loss prices, as well as information about any DCA averaging that might have occurred. It also calculates the profit or loss as a percentage, the duration of the position, and offers an optional note for a human-readable explanation of the closure. Finally, you get timestamps for when the signal was created, when it started pending, and when the tick result was created, giving a complete timeline of the trade’s lifecycle.

## Interface SignalCancelledNotification

This notification tells you when a signal that was planned to be executed was cancelled before it actually happened. It provides a lot of details about the cancelled signal, so you can understand why it didn't go through.

You'll find information like the unique ID of the signal, the trading symbol involved (e.g., BTCUSDT), and the strategy that generated it. It also includes specifics about the planned trade, such as the intended take profit and stop-loss prices, the trade direction (long or short), and the original entry price.

Importantly, the notification details the reason for cancellation— whether it was due to a timeout, a price rejection, or a manual cancellation by a user. You can also see when the signal was originally scheduled and how long it waited before being cancelled. Backtest mode vs live mode is also indicated.

## Interface ScheduledEvent

This describes the data you'll find when looking at events related to trading signals – things like when a signal was scheduled, opened, or cancelled. Think of it as a standardized way to represent all the key details about a signal's lifecycle. 

Each event record includes a timestamp, what action was taken (scheduled, opened, or cancelled), and the specifics of the trade itself, like the symbol, signal ID, position, and prices. You’ll see details about entry prices, take profit levels, stop losses, and even how those prices might have changed.

If the signal involved a series of entries (like a DCA strategy), you'll find information about the total number of entries and the original entry price before averaging. For cancelled signals, you’ll also learn the reason for cancellation and a unique ID if a user initiated it. Finally, there are fields related to when the position became active, and a duration measurement for cancelled and opened signals.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` gives you a clear picture of how your scheduled signals are performing. It summarizes all the scheduled signals, tracking how many were scheduled, how many were activated, and how many were cancelled. 

You can see the overall number of events and key performance indicators like cancellation and activation rates, expressed as percentages. It also calculates the average wait times for both cancelled and activated signals, allowing you to understand potential delays in your trading process. The `eventList` property provides a complete history of each individual scheduled event.

## Interface SchedulePingContract

This defines how the backtest-kit framework communicates about scheduled signals during their active monitoring period – that's when a signal is running but hasn't been cancelled or activated yet. Every minute, a "ping" event is sent out to let you know a signal is still being watched. 

You can use these pings to keep track of what's happening with your signals, and even build custom logic to manage them. 

Each ping includes important details like the trading symbol, the name of the strategy using it, the exchange involved, and the full data associated with the scheduled signal. You’ll also find a flag indicating whether the ping originates from a backtest (historical data) or a live trading environment, along with a timestamp for precise timing information. 

The framework provides ways to "listen" for these pings, allowing you to react to them as they arrive.

## Interface RiskStatisticsModel

This model holds important information about risk rejections that have occurred during backtesting. It essentially gives you a breakdown of how often your risk controls are being triggered. 

You'll find a complete list of the risk rejection events, including all the details associated with each one. The model also provides a simple count of the total number of rejections.

To help you understand where the rejections are coming from, you can view them grouped by the trading symbol or by the strategy being used. This lets you easily pinpoint potential problem areas in your system.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It's a way to understand why a signal didn't make it through, whether you're running a backtest or live trading. Each notification has a unique ID and a timestamp to help you track events.

You’ll find important details like the strategy that generated the signal, the exchange involved, and a clear explanation of why the signal was rejected. The notification also includes information about your current open positions, the market price at the time, and the proposed trade details (entry price, take profit, stop loss). If a signal ID was provided, it’s included for traceability. It also shows the intended position direction (long or short) and the estimated time until the trade expires.

## Interface RiskEvent

This data structure, `RiskEvent`, holds all the details whenever a trading signal is blocked by risk management rules. Think of it as a record of why a trade didn't happen. 

Each `RiskEvent` includes information like when the rejection occurred (timestamp), which trading pair was involved (symbol), and the specifics of the signal that was rejected (`currentSignal`). 

You'll also find details about the strategy and exchange used, along with the current market price, the number of existing open positions at the time, and a unique ID for tracking this specific rejection. A reason for the rejection (`rejectionNote`) is also included. Finally, it tells you whether this event happened during a backtest or live trading.

## Interface RiskContract

This interface, RiskContract, describes what happens when a trading signal is blocked due to a risk check. Think of it as a notification that a strategy wanted to make a trade, but the system said "no" because of pre-defined risk limits.

It provides details about the rejected trade, including the trading pair involved (symbol), the specifics of the signal itself (currentSignal), the name of the strategy that attempted the trade (strategyName), and the timeframe it was intended for (frameName). You’ll also find information like the exchange involved (exchangeName), the market price at the time (currentPrice), and how many other positions were already open (activePositionCount).

To help with tracking and troubleshooting, each rejection gets a unique ID (rejectionId) and a human-readable explanation (rejectionNote). The timestamp tells you exactly when the rejection occurred, and a flag indicates whether the rejection happened during a backtest or in live trading. This is really useful for understanding why certain trades weren’t executed and for improving your risk management rules.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep an eye on how a backtest is progressing. It's like a little report card that's sent out while a large backtesting process is running in the background.

You'll see details like the name of the backtest, the exchange it's using, and the specific trading symbol being analyzed.

The report also tells you how many total trading strategies are involved in the backtest, how many have already been processed, and a percentage showing how close the backtest is to finishing. This allows you to understand the current state and estimate the remaining time.

## Interface ProgressBacktestContract

This interface helps you monitor the progress of a backtest as it runs. It provides details like the exchange and strategy being used, the trading symbol, and how many historical data points (frames) are being processed. You'll see the total number of frames the backtest needs to analyze, how many it has already completed, and a percentage indicating overall progress. This allows you to keep an eye on long-running backtests and get a sense of how much time is left. 

Essentially, it's a way to peek into the backtest's internal workings while it's calculating results.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest, organized by the strategy that generated it. You'll find the strategy's name clearly labeled, along with the overall count of performance events and the total time it took to gather all the statistics. 

A key part of this model is `metricStats`, which breaks down the data further, grouping performance figures by the type of metric being tracked. Finally, the raw performance events themselves are stored in the `events` array, giving you access to the detailed data points that make up the aggregated statistics.


## Interface PerformanceContract

The PerformanceContract helps you understand how quickly different parts of your trading system are running. It's like a detailed log of what’s taking time, allowing you to spot and fix slowdowns.

Each entry in this contract records when something happened (timestamp), how long it took (duration), and what specifically was being done (metricType). You'll also find details connecting the metric to a particular strategy, exchange, trading symbol, and whether it's happening during a backtest or in a live trading environment.  The previous timestamp lets you track how times change over time. This is valuable for optimizing your trading setup and making sure everything runs efficiently.


## Interface PartialStatisticsModel

This model holds statistical information about partial trades, giving you a snapshot of how partial profits and losses are performing. It’s essentially a record of each partial event that occurred during a backtest, along with key counts and totals. You’ll find a detailed list of each partial event in the `eventList` property. The `totalEvents` property simply tells you the overall number of partial events.  You can then check `totalProfit` and `totalLoss` to see how many partial trades resulted in a profit versus a loss.

## Interface PartialProfitContract

This interface describes events that happen when a trading strategy hits a partial profit milestone, like 10%, 20%, or 30% profit.  You’ll see these events when a strategy is making money, and they’re useful for keeping track of how well it’s performing. Each event tells you which trading pair it's related to, the name of the strategy that triggered it, and the exchange and frame being used.

It also includes the original signal details, like the initial stop-loss and take-profit prices, along with the current market price at the time the profit level was reached. You'll find the specific profit level (10%, 20%, etc.) included as well.

Finally, it indicates whether the event happened during a backtest (using historical data) or live trading, and provides a timestamp to show precisely when the level was achieved. The timestamp’s meaning depends on whether it’s live or backtest mode.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit has been taken in your trading strategy. It’s triggered whenever a portion of your position is closed to secure profits.

The notification includes a unique ID and timestamp to track when it happened. You’ll also see details like the trading symbol, the strategy's name, the exchange used, and a unique identifier for the signal that triggered the action.

It specifies what percentage of the position was closed, along with the current market price at the time. You'll find details about the trade itself – whether it was a long or short position, the original entry price, and any take profit or stop-loss prices that were in effect, both before and after any trailing adjustments. 

You also get information on how the position was built, including the total number of DCA entries and timestamps related to signal creation, pending status, and notification generation. This comprehensive data helps you understand precisely how and when profits were secured.

## Interface PartialProfitCommit

This describes an event that happens when a partial profit is taken during a backtest. It tells you exactly what happened – a portion of the position was closed – and provides all the important details around that action. You'll find information like the percentage of the position that was closed, the current market price at the time, and the trade's direction (whether it was a long or short position).

It also includes key pricing information, such as the original entry price, the take profit and stop loss prices (both their original values and how they've been adjusted), and timestamps indicating when the signal was created and the position was activated. This gives you a complete picture of the conditions that led to the partial profit being realized.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a specific profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress during backtesting or live trading.

Each notification includes a unique identifier and timestamp, along with details like the trading symbol, the strategy's name, and the exchange it was executed on. You’ll also find information about the trade itself, including the entry price, the trade direction (long or short), and the effective take profit and stop-loss prices, along with their original values before any adjustments were made.

The notification also contains details about how the trade was entered, such as the total number of DCA entries if averaging was used, and timestamps related to signal creation and the position going pending. This detailed information allows for comprehensive analysis and monitoring of strategy performance.

## Interface PartialLossContract

The `PartialLossContract` represents when a trading strategy hits a predefined loss level during either backtesting or live trading. Think of it as a notification that the strategy's performance has degraded to a specific point, such as a 10% or 20% loss from its initial entry price.

It provides key details about this loss event, including the trading pair involved (symbol), the name of the strategy generating the signal, the exchange and frame it’s running on, and the current market price at the time the loss level was triggered. Crucially, it also includes all the original signal data, like the initial stop-loss and take-profit prices.

Each level (like 10%, 20%, etc.) is only reported once per signal, even if multiple levels are reached quickly. You can use these events to monitor how your strategies are performing, track potential stop-loss executions, and generate reports on drawdown. The `backtest` flag tells you if the event came from a historical simulation or live trading. Finally, the timestamp indicates precisely when the loss level was detected – either the real-time moment in live trading or the timestamp of the candle in backtesting.

## Interface PartialLossCommitNotification

This notification lets you know when a partial loss of a position has been executed. It provides a detailed snapshot of the trade at the moment the partial loss occurred. You'll find information like a unique ID for the notification, the exact time it happened, and whether it's happening in a backtest or live trading environment.

The notification also includes specifics about the trade itself – the trading pair (like BTCUSDT), the strategy that triggered it, the exchange used, and the signal's unique identifier.  You’ll see details like the percentage of the position that was closed, the current market price, and the trade direction (long or short).

Beyond just the immediate action, the notification also includes the original entry price, take profit, stop loss levels, and details about any DCA averaging that might have been applied.  Timestamps for when the signal was created, pending, and ultimately executed help provide a complete timeline of the trade’s lifecycle.

## Interface PartialLossCommit

This describes an event representing a partial closing of a trading position due to a loss. It tells you exactly what happened: a portion of the position was closed, and provides all the relevant details surrounding that action. You’ll find information like the percentage of the position that was closed, the current market price at the time, and whether it was a long or short position. 

Crucially, it also includes both the original and adjusted take profit and stop loss prices, letting you see how trailing might have influenced those levels. The `scheduledAt` and `pendingAt` timestamps allow you to track when the signal was created and when the position initially became active. Overall, it’s a complete snapshot of a partial loss event within your backtest.

## Interface PartialLossAvailableNotification

This notification tells you when a trading strategy has reached a pre-defined loss level, such as a 10% or 20% loss. It's a signal that something might be happening with your trade and could be useful for risk management or further analysis.

Each notification includes a unique ID and timestamp, along with details like the trading symbol, strategy name, and the exchange it originated from. You'll find important information about the trade itself, including the entry price, take profit and stop loss levels (both original and adjusted), trade direction (long or short), and how many DCA entries were involved. It also indicates whether the notification is coming from a backtest or live trading environment. The notification includes the original entry price, and timestamps tracking when the signal was initially created, when it went pending, and when the notification itself was generated.

## Interface PartialEvent

This interface, `PartialEvent`, acts as a central place to store information about profit and loss milestones during a trade. Think of it as a snapshot of key data points captured whenever a trade hits a profit or loss level, like 10%, 20%, or 30%.  It bundles details such as the exact time the event occurred, whether it was a profit or loss, the trading pair involved, and the strategy that generated the signal.

You'll find crucial information here, including the current market price, entry price, take profit target, stop loss levels, and even the original prices set when the trade was first initiated. If you’re using dollar-cost averaging (DCA), it keeps track of the number of entries and the original entry price before averaging.  There's also a field for a human-readable note explaining the reasoning behind the signal and timestamps for when the position became active and when the signal was scheduled. Finally, a flag indicates whether the trade is happening in backtest or live mode.

## Interface MetricStats

This data structure neatly organizes statistics calculated for a particular performance metric, such as order execution time or message processing duration. It tells you how many times a specific event was recorded, the total time it took across all instances, and key duration-related metrics. You'll find the average, minimum, and maximum durations, alongside measures of variability like standard deviation and percentiles (p95 and p99), providing a detailed view of performance spread.

Furthermore, it includes details about the time spent waiting between events, with the average, minimum, and maximum wait times also provided. Essentially, it gives you a comprehensive picture of how long things take and how consistent they are. 

The `metricType` property identifies the specific metric these numbers represent.

## Interface Message

Each message within the chat history represents a single turn in the conversation. It tells you who sent the message – whether it was a system instruction, something the user typed, or a response from the AI assistant. The `role` property clearly identifies the sender, and the `content` property holds the actual text of the message itself. Essentially, this structure provides a way to track and understand the flow of the entire conversation.

## Interface LiveStatisticsModel

This model holds a collection of statistical data derived from live trading activity, giving you a detailed view of your performance. It keeps track of every event – from idle periods to signal openings, activity, and closures – storing them in the eventList. You'll find key numbers like the total number of events processed, the total closed signals, and the counts of winning and losing trades. 

It also calculates crucial metrics to assess profitability and risk. The win rate shows the percentage of successful trades, while the average PNL and total PNL reflect overall profitability. To gauge risk, you can examine the standard deviation, Sharpe Ratio, and annualized Sharpe Ratio. Finally, metrics like certainty ratio and expected yearly returns offer further insights into the reliability and potential of your trading strategy. Keep in mind that many of these numbers will be null if the calculations are unreliable.

## Interface InfoErrorNotification

This notification helps you keep track of issues that happen during background processes, like data loading or calculations. It signals that something went wrong, but it's usually something you can recover from – the system won’t completely stop.

Each notification has a unique identifier (`id`) so you can pinpoint exactly what happened. It also includes a human-readable explanation of the problem (`message`) and the technical details of the error itself (`error`), which might contain a stack trace and extra information for debugging. 

Importantly, these notifications always indicate errors occurring outside of the main backtesting process (`backtest` is always false), meaning they're related to things happening in the background.


## Interface IWalkerStrategyResult

This interface describes the outcome of running a trading strategy within a backtest comparison. Each strategy's result is packaged into this structure, providing a clear way to understand its performance. It includes the strategy's name, a detailed set of statistics summarizing its backtest results, and a specific metric value used for comparing it against other strategies.  Finally, a rank is assigned to each strategy, indicating its position relative to the others based on the chosen metric – with a rank of 1 representing the best performing strategy.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests to compare different trading strategies. Think of it as a recipe for running a controlled experiment on your trading algorithms.

You give it a unique name so you can identify it, and optionally a note for yourself to remember what it's for.

Crucially, you specify the exchange and timeframe you want to use for *all* the strategies in the test, ensuring a level playing field. 

The schema lists the names of the strategies you want to compare – these strategies need to be registered separately beforehand.

You also select a metric, like Sharpe Ratio, that you'll use to determine which strategy performs best.  You can even provide callbacks to be notified at various points during the backtesting process.

## Interface IWalkerResults

This object holds all the information gathered after running a complete backtest comparison – think of it as the final report card for your trading strategies. It tells you exactly which asset (symbol) was tested, what exchange was used for the backtest, which specific testing process (walker) was employed, and what timeframe (frame) was used for the analysis. Essentially, it provides context for understanding the results you'll find elsewhere in the backtest-kit system. You can use this to quickly identify the scope and parameters of a particular backtesting run.


## Interface IWalkerCallbacks

This interface lets you tap into the backtesting process and react to what’s happening. You can use it to monitor the progress of your strategy comparisons and handle different outcomes.

Specifically, `onStrategyStart` is triggered when a new strategy's backtest begins, allowing you to log the start or prepare for data processing. `onStrategyComplete` is called once a strategy's backtest is finished, giving you access to key statistics and metrics for that run. If a strategy encounters a problem, `onStrategyError` will notify you with details about the error. Finally, `onComplete` signals the end of the entire backtesting session, providing the combined results from all strategies. 




These callbacks give you fine-grained control and visibility into the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface represents a single step in a sequence for managing trailing take profit and commitment orders. Think of it as a record of what needs to happen—whether it's adjusting a trailing stop or executing a commitment—and how much to change it based on price movement.  It stores the type of action being taken ("trailing-take"), the percentage shift needed (like moving the stop loss up or down by a certain percentage), and the price at which the trailing was initially established.  Essentially, it’s a snapshot of a specific trailing take profit/commitment adjustment.

## Interface ITrailingStopCommitRow

This interface describes a record representing a trailing stop order that needs to be executed. It’s essentially a message telling the system to adjust a trade based on a trailing stop loss.

The `action` property always indicates that this is a trailing stop related action.

`percentShift` defines the percentage amount to shift the stop loss, so it dictates how much the stop loss moves alongside the price.

Finally, `currentPrice` stores the price level when the trailing stop was initially set, providing context for the shift calculation.

## Interface IStrategyTickResultWaiting

This interface, `IStrategyTickResultWaiting`, describes what happens when a trading strategy is actively waiting for a signal to activate. Think of it as a holding pattern – the strategy has a signal set to trigger, but the market price hasn't reached the entry point yet.

You’ll receive this type of result repeatedly while the strategy is monitoring for that trigger.

It provides key information about the situation: the strategy's name, the exchange being used, the timeframe, the symbol being traded, and the current price being watched. Importantly, it also includes details about the scheduled signal itself and the theoretical profit and loss if the position were to be active. The `percentTp` and `percentSl` will always be zero because the position hasn’t been opened yet. Finally, it tells you whether the event is from a backtest or live trading.

## Interface IStrategyTickResultScheduled

This interface describes what happens within the backtest-kit framework when a trading strategy generates a signal that needs to wait for a specific price to be reached before executing. Think of it as a notification that a strategy wants to enter a trade but is patiently waiting for the market conditions to align. It provides key details about the signal, like the strategy and exchange involved, the trading pair, the current price at the time the signal was generated, and whether this is part of a backtest or a live trade. The `action` property clearly flags this as a "scheduled" signal, indicating this waiting period. You’ll find information useful for debugging and understanding the sequence of events leading up to a trade.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It’s essentially a notification that a signal has been successfully generated, validated, and saved. 

The notification includes important details about the signal itself, like the signal’s data (`signal`) and a unique ID that was assigned to it. You'll also find information for tracking purposes, such as the name of the strategy that generated the signal, the exchange and timeframe used, and the symbol being traded. 

Crucially, the `currentPrice` property provides the VWAP price at the moment the signal was opened, and `backtest` flags whether this event happened during a backtest simulation or in a live trading environment. Finally, `createdAt` tells you precisely when this event occurred, based on the candle timestamp during backtesting or the time of execution during live trading.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an idle state, meaning it's not currently generating any trading signals. It provides details about the context of that idle period, like the strategy's name, the exchange being used, the timeframe being analyzed (like one-minute or five-minute intervals), and the trading pair involved. You'll also find the current price at that moment, whether the data is from a backtest or live trading, and a timestamp marking when the idle state was recorded. Think of it as a log entry that shows things were quiet for a little while, with all the relevant information attached.

## Interface IStrategyTickResultClosed

This interface represents the result of a trading signal being closed, providing a complete picture of what happened and the outcome. It tells you when the signal ended, why it was closed – whether due to a time limit, take profit, stop loss, or a manual action – and the final price used for calculations.

You'll find key information like the original signal parameters, the calculated profit and loss, and details about the strategy, exchange, timeframe, and trading symbol involved.  The `closeId` property is specific to situations where the signal was manually closed by a user.  Finally, the timestamp indicates when the signal was closed and when the result was recorded. This information is invaluable for analyzing strategy performance and understanding closure events.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, describes what happens when a signal you’ve scheduled doesn’t actually trigger a trade – maybe it was cancelled or it hit a stop-loss before a position could be opened. It gives you details about the cancelled signal, like the signal itself, the price at the time it was cancelled, and the exact timestamp.

You’ll find information for tracking purposes as well, including the strategy and exchange names, the timeframe being used, and the trading symbol.  A flag indicates whether this cancellation occurred during a backtest or a live trading session.

The `reason` property tells you *why* the signal was cancelled, and there’s even an optional `cancelId` if the cancellation was initiated by a user request. Finally, it includes a timestamp indicating when the result itself was created.

## Interface IStrategyTickResultActive

This interface describes what happens when a trading strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It’s essentially a snapshot of the position's status at a specific moment.

The `action` property clearly identifies this as an "active" state. You'll find the `signal` that triggered the position, along with the `currentPrice` being used for monitoring, the name of the `strategy`, the `exchange`, and the `frameName` it's all associated with.

To help understand where you are in relation to your profit and loss targets, there are `percentTp` and `percentSl` properties that show your progress towards take profit and stop loss, respectively. 

The `pnl` property gives you the unrealized profit and loss, taking into account fees, slippage, and any partial position closures.  A `backtest` flag tells you whether the data is from a simulation or live trading. Lastly, `createdAt` marks the exact time this status was recorded.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. Each strategy needs a unique name to identify it. 

You can add a note to provide extra details for other developers using your strategy.

The `interval` property controls how often the strategy generates trading signals, preventing it from sending signals too frequently.

The core of the strategy is the `getSignal` function, which is responsible for calculating whether to buy or sell an asset at a given time. This function can generate signals immediately or schedule them to execute when the price reaches a specific point.

You can also include optional callback functions for events like when a trade is opened or closed, and assign risk profiles and actions to the strategy for better risk management and organization.

## Interface IStrategyResult

The `IStrategyResult` helps you organize and compare the performance of different trading strategies. It bundles together everything you need to see how a strategy did – its name, a detailed set of statistics covering its performance, and a key metric value used to rank strategies against each other. Think of it as a scorecard for each strategy you run.  The `strategyName` simply identifies the strategy.  The `stats` property holds all the comprehensive data about the backtest, and `metricValue` represents the score used to determine which strategies performed best.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the outcome of a trading strategy’s performance, specifically focusing on profit and loss. It tells you how much your strategy made or lost, expressed as a percentage. Crucially, the prices used in this calculation—both the entry price (`priceOpen`) and the exit price (`priceClose`)—have already been adjusted to account for common trading costs like fees and slippage, making it a more realistic picture of your strategy's true profitability. Think of it as the net result after all the little costs are factored in.

## Interface IStrategyCallbacks

This interface defines a set of optional callbacks that your trading strategy can use to respond to different events during a backtest or live trade. Think of them as hooks that allow your strategy to react to what's happening – like a signal opening, becoming active, or being closed.

You can use `onTick` to get notified on every price update. `onOpen` triggers when a new signal is validated and initiated. `onActive` lets you know when a signal is actively being monitored, while `onIdle` signals when there are no active signals. When a signal finally closes, `onClose` is called.

For signals that are scheduled for future entry, `onSchedule` provides a notification when they're created, and `onCancel` tells you when a scheduled signal is cancelled. There's also `onWrite` for persisting signal data during testing, and `onPartialProfit` & `onPartialLoss` to be informed about favorable or unfavorable price movements before reaching take profit or stop loss levels. `onBreakeven` is called when the signal reaches its initial entry price.

Finally, `onSchedulePing` and `onActivePing` offer opportunities for minute-by-minute checks on scheduled and active signals, respectively, which is helpful for custom monitoring or managing signals dynamically.  These callbacks give you fine-grained control and visibility into your strategy's behavior.

## Interface IStrategy

This interface defines the core methods for a trading strategy within the backtest-kit framework. Think of it as the blueprint for how a strategy interacts with the system.

The `tick` method is the heart of the strategy, executed on each price update. It checks for trading signals and monitors take-profit and stop-loss levels.

You can use `getPendingSignal` and `getScheduledSignal` to see what signals are currently active for a specific asset – useful for understanding the strategy’s current state.

`getBreakeven` determines if the price has moved enough to cover transaction costs, allowing a potential move to a breakeven stop-loss. `getStopped` simply tells you if the strategy is paused.

The `backtest` function lets you quickly run simulations using historical price data to evaluate a strategy’s performance.

`stopStrategy` lets you halt the strategy's signal generation without closing existing trades—good for controlled shutdowns. `cancelScheduled` and `activateScheduled` provide ways to manage scheduled entries without fully stopping the strategy.

`closePending` allows you to manually close an existing trade.  You can also manage partial position closures with `partialProfit` and `partialLoss`.

`trailingStop` and `trailingTake` adjust your stop-loss and take-profit levels dynamically as the price moves, protecting profits and limiting losses. The `breakeven` method moves your stop-loss to the entry price once a profit target is reached.

Finally, `averageBuy` allows you to implement a dollar-cost averaging strategy by adding new entries to an open position.  `dispose` is used to clean up when a strategy is no longer needed.

## Interface IStorageUtils

This interface, `IStorageUtils`, acts as a blueprint for how different storage systems – like databases or files – should interact with the backtest-kit framework. Think of it as a contract: any storage system wanting to be used with backtest-kit needs to provide methods that follow this structure.

It defines how the system should react to events like a signal being opened, closed, scheduled, or cancelled.  There are dedicated methods for these events, allowing storage to track and potentially manage these states.

The interface also includes essential functions for retrieving data.  `findById` lets you look up a specific signal using its unique ID, while `list` provides a way to see all the signals currently stored. Essentially, this interface ensures a consistent way to manage signals within the backtesting environment, no matter where the data is stored.

## Interface IStorageSignalRowScheduled

This interface describes a signal row that's been scheduled for execution. It's a way to track signals that are planned but haven't yet been processed. The key piece of information here is the `status` property, which will always be set to "scheduled" to indicate the signal's state. Essentially, it represents a signal waiting in a queue to be acted upon.

## Interface IStorageSignalRowOpened

This interface represents a signal row specifically when a trade is open. It’s a simple way to track that a position has been initiated. The `status` property is always set to "opened," clearly indicating the trade’s current state – it's actively running. This provides a straightforward signal for tracking and managing open positions within your backtesting or trading system.

## Interface IStorageSignalRowClosed

This interface represents a signal row when a trading signal has been closed. It's specifically used to store information about signals that have already completed, because only closed signals have associated profit and loss data. The `status` property will always be "closed", confirming its final state. Crucially, it includes a `pnl` property, which contains details about the profit and loss achieved during that trade.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to track when a signal is no longer valid or needs to be disregarded. The key piece of information here is the `status` property, which will always be set to "cancelled" to clearly indicate the signal’s state. Think of it as a flag saying, "This signal is not active anymore."

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signals within the backtest-kit framework. It ensures that every signal, regardless of its status, has a record of when it was created and last updated. The `createdAt` and `updatedAt` properties use timestamps to provide accurate timing information. The `priority` field helps manage the order in which signals are processed, guaranteeing consistent handling across both live and backtesting environments.

## Interface ISizingSchemaKelly

This interface defines a sizing strategy based on the Kelly Criterion, a formula used to determine optimal bet sizes. When you use this schema, it tells backtest-kit that you're employing the Kelly Criterion approach for position sizing.

The `method` property is fixed and simply confirms that this is indeed a Kelly Criterion sizing scheme.

The `kellyMultiplier` property is the most important part - it’s a number between 0 and 1 that controls how aggressively your positions are sized. A value of 0.25, the default, means you're using a "quarter Kelly" approach, which is a more conservative strategy. Higher values increase potential returns but also raise the risk of significant losses.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading strategy where the size of each trade is determined by a fixed percentage of your capital. It's a straightforward approach for managing risk, ensuring each trade exposes you to a consistent level of potential loss relative to your total holdings. 

The `method` property simply identifies this sizing strategy as "fixed-percentage". The `riskPercentage` property is the key setting here; it's a number between 0 and 100 that dictates what percentage of your capital will be used for each trade. For example, a `riskPercentage` of 1 would mean 1% of your capital is risked on every trade.


## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, acts as a foundation for defining how much of your account to allocate to each trade. Think of it as a blueprint for sizing strategies. It includes essential details like a unique name to identify the sizing configuration, a place for developers to add notes for clarity, and limits on the maximum and minimum position sizes—both as percentages of your total capital and in absolute terms.  You can also optionally add callbacks to react to different sizing events.

## Interface ISizingSchemaATR

This interface describes how to determine the size of your trades using the Average True Range (ATR). It’s a way to manage risk by basing your position size on the volatility of the asset you're trading. 

You'll specify a `riskPercentage`, which represents the maximum percentage of your capital you're willing to lose on a single trade. An `atrMultiplier` is also set; this value is used to calculate the stop-loss distance based on the ATR value – essentially, the higher the ATR, the wider your stop-loss will be, reflecting greater market volatility. It's a straightforward approach for adapting your trade sizes to changing market conditions.

## Interface ISizingParamsKelly

This interface defines the settings you can use to control how much of your capital a trading strategy risks on each trade when using the Kelly Criterion method. It’s primarily used when setting up the sizing behavior within the backtest-kit framework. You'll find it useful when you want to add logging to track the sizing decisions being made. The `logger` property allows you to connect a logging service to monitor what’s happening during sizing calculations, which can be beneficial for debugging or understanding the strategy's risk profile.


## Interface ISizingParamsFixedPercentage

This interface defines how to set up a trading strategy that uses a fixed percentage of your capital for each trade. Think of it as a way to consistently risk a certain portion of your funds with every decision. 

It requires a `logger` to help you keep track of what's happening – you can use it for debugging and understanding the strategy's behavior. This ensures you have visibility into the sizing process.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of an asset to trade based on the Average True Range (ATR). It’s all about controlling your position size relative to market volatility. 

The `logger` property allows you to integrate a logging service, which is helpful for debugging and understanding how your sizing calculations are working. This lets you keep track of what's happening behind the scenes and troubleshoot any issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into important moments during the sizing process, which is how your trading strategy determines how much to buy or sell. Specifically, the `onCalculate` callback gets triggered immediately after the framework computes the size of your position. This provides a chance to log the calculated size, verify that it makes sense, or potentially make adjustments based on specific conditions. Essentially, it’s a convenient way to keep an eye on the sizing process and ensure things are working as expected.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. It’s all about figuring out how much to risk based on your historical trading performance. 

You'll need to provide the calculation method, which in this case is specifically "kelly-criterion".  Then, tell the system your win rate - the proportion of trades that result in a profit. Finally, you’ll specify your average win-loss ratio, essentially the average amount you win compared to what you lose on a losing trade. This combination of information allows backtest-kit to determine an optimal position size to maximize long-term growth.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed when you want to size your trades using a fixed percentage approach. You'll specify that the sizing method is "fixed-percentage" and also provide a stop-loss price. The stop-loss price is crucial because the percentage of your capital to risk is based on this level. It helps to automate trade sizing based on a pre-defined risk level tied to your stop-loss.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed when figuring out how much to trade. It includes the symbol of the asset you’re trading, like "BTCUSDT," your current account balance, and the price at which you plan to initially buy or sell. Think of it as a foundation – all sizing calculations build upon these core details. Having these values available ensures that trade sizing decisions are grounded in the realities of your account and the market conditions.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when calculating trade sizes based on the Average True Range (ATR). To use ATR for sizing, you'll specify that your method is "atr-based".  You also need to provide the current ATR value, which represents the average price volatility over a specific period. This value is crucial for determining how much capital you'll risk on each trade.

## Interface ISizing

The `ISizing` interface is the heart of how backtest-kit determines how much of an asset to trade. Think of it as the logic that figures out your position size based on your risk tolerance and other factors.

It's primarily used behind the scenes by the trading strategy execution engine.

The key to this interface is the `calculate` method. This method takes in a set of parameters (`ISizingCalculateParams`) and then returns a promise that resolves to the calculated position size, essentially telling the system how much to buy or sell.


## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal within the backtest-kit framework. Think of it as a signal that's ready to be executed – it contains all the necessary information. Each signal gets a unique ID to track it throughout the system.

It holds key details like the entry price, which exchange to use, the strategy that generated it, and the timeframe it applies to. Crucially, it includes timestamps for when the signal was created and when it went pending.

The signal also incorporates information about partial position closures, letting you accurately calculate profit and loss, as well as trailing stop-loss and take-profit prices which dynamically adjust based on market movement.  A record of entry prices for dollar cost averaging is also stored, ensuring an accurate calculation of the overall entry price. Finally, it includes some internal flags used during runtime to manage signal lifecycle.

## Interface ISignalDto

The ISignalDto defines the structure for signals used within the backtest-kit framework. Think of it as a standardized way to represent a trading idea—it encapsulates everything needed to execute a trade. Each signal includes details like whether you're going long (buying) or short (selling), the entry price, target take profit price, a stop-loss level for managing risk, and an estimated duration.  You can provide an ID for the signal, but if you don't, the system will automatically generate one.  A descriptive note helps explain the reasoning behind the signal.

## Interface IScheduledSignalRow

This interface describes a signal that's waiting for the market to reach a specific price before it's executed. Think of it as a signal that’s on hold until a certain price level is hit. It builds upon the basic signal representation and includes information about the target price. Once the price reaches this target, the signal transforms into a regular pending signal, ready to be triggered. Initially, the time it's been waiting (pendingAt) will match the original scheduled time, and it will be updated to the actual wait time when the signal activates. The `priceOpen` property specifies that price level.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that has been cancelled by the user. It builds upon the existing `IScheduledSignalRow` to add a way to identify the specific cancellation request. The `cancelId` property holds the unique identifier associated with that user-initiated cancellation. Think of it as a reference number you can use to track why a signal was stopped.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, holds all the information a risk validation function needs to make a decision. It combines the usual signal data with a snapshot of your current portfolio’s health. 

You'll find details about the signal being evaluated, represented by `currentSignal`, which is already prepared for you with essential data like the opening price. 

It also provides a count (`activePositionCount`) and a list (`activePositions`) of all your open positions, letting you factor in existing exposure when assessing new trades. Think of it as a complete picture of your trading activity for risk assessment.

## Interface IRiskValidationFn

This defines the shape of a function used to check if a trading decision is safe to execute. Think of it as a gatekeeper for your trades. If the function approves the trade (by returning nothing or `null`), everything proceeds as normal. If it flags a problem (by returning a rejection result or throwing an error), the trade is blocked, and you'll get information about *why* it was rejected. This lets you build rules to prevent risky trading behavior.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you set up checks to make sure your trading strategies are behaving responsibly. Think of it as defining rules to keep your backtesting safe and sound. 

It has two key parts:

*   `validate`: This is where you put the actual code that performs the validation. It's a function that checks your risk parameters and decides whether they're acceptable.
*   `note`: This is an optional description. It's a helpful way to explain *why* you've set up a particular validation rule, making it easier for others (or your future self!) to understand.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading by providing key details about a position. It builds upon the existing `ISignalDto` and adds important pricing information. Specifically, it includes the entry price (`priceOpen`), the initial stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`) that were set when the trade signal was created. These values are used during risk validation processes to ensure trades are handled responsibly.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you define and register custom risk controls for your trading portfolio. Think of it as a way to build your own rules to ensure your trades stay within defined boundaries.  Each risk schema has a unique identifier, `riskName`, and you can add a `note` to explain what the schema is for.  You can also attach optional `callbacks` to be notified when a trade is rejected or allowed based on your risk rules. The core of the schema lies in the `validations` array, which holds the actual rules that will be applied. These validations can be individual functions or pre-defined validation objects, letting you create a sophisticated system for managing risk.

## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading strategy's risk validation failed. When a risk check doesn't pass, this object will be returned, giving you details about the specific problem.  It includes a unique `id` to track the rejection and a helpful `note` explaining the reason in plain language. Think of it as a clear message letting you know exactly what needs to be adjusted in your strategy to ensure it's within acceptable risk parameters.

## Interface IRiskParams

The `IRiskParams` object is how you configure the risk management system when it's being set up. It essentially holds all the important settings needed for the risk calculations to work correctly.

You'll need to provide the name of the exchange you're working with, like "binance" or "coinbase".  A logger is also required; this allows the system to output debugging information to help you understand what's happening.

It's critical to specify whether you're running in backtest (historical data) mode or live trading mode.  Finally, you have the option to define a callback function called `onRejected`. This function is triggered when a trading signal is blocked by the risk controls, giving you a chance to react to the rejection, potentially for logging or further analysis.


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a safety check performed *before* a trading signal is actually created. It passes along key details like the trading pair's symbol, the signal itself, the name of the strategy requesting the trade, and information about the exchange, risk profile, and timeframe involved. You'll also find the current price and timestamp, giving you a full picture of the trading environment at that moment. It's designed to ensure trades align with established risk parameters.

## Interface IRiskCallbacks

This interface lets you plug in functions to be notified about risk checks happening during your trading backtests. 

Think of it as a way to get alerts about when a trade is blocked by risk rules, or conversely, when a trade is approved to proceed. 

Specifically, `onRejected` will be triggered when a trade signal fails a risk check, while `onAllowed` is called when a trade signal successfully passes the risk checks. You can use these callbacks to monitor your risk settings and how they're impacting your trades.

## Interface IRiskActivePosition

This interface describes a single active trading position that's being monitored for risk analysis across different trading strategies. Think of it as a snapshot of a trade in progress. 

It includes details like which strategy opened the position, the exchange used, the trading symbol (like BTCUSDT), and whether it's a long or short trade. You'll also find key pricing information – the entry price, stop-loss, and take-profit levels – as well as estimates of how long the position has been open and the time it was initially entered. This information allows for a deeper understanding of risk exposure when combining multiple strategies.


## Interface IRisk

This interface defines how a trading system manages risk and tracks positions. It allows you to determine if a trading signal is safe to execute based on predefined risk limits. 

You can use it to register new trades, essentially telling the system you’ve opened a position, providing details like entry price, stop-loss levels, and estimated time. When a trade closes, you need to inform the system to remove it from tracking. 

Think of it as a way to keep the system aware of all open positions and ensure they stay within acceptable risk boundaries.


## Interface IReportTarget

This interface lets you fine-tune what information gets recorded during your backtesting process. Think of it as a way to selectively turn on or off different types of logging. You can choose to log details about your trading strategy, risk management decisions, breakeven points, partial order fills, heatmap data, walker iterations, performance, scheduled signals, live trading events, or closed backtest signals – or any combination of these. By enabling only the logging you need, you can keep your data cleaner and more focused on the areas you’re investigating. Each property (like `strategy`, `risk`, `breakeven`, etc.) is a simple boolean: `true` to enable logging, `false` to disable it.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you control how backtest data is recorded and organized. Think of it as a set of labels that go along with each piece of information saved during a backtest. It lets you specify things like the trading pair being used (e.g., BTCUSDT), the name of the trading strategy, which exchange is involved, and even the timeframe of the data.  You can also use it to track unique signal identifiers and the name of the optimization walker being used. This detailed information makes it much easier to filter, search, and analyze your backtest results later on.


## Interface IPublicSignalRow

The `IPublicSignalRow` interface provides a way to share signal information with users while maintaining transparency around how those signals are managed. It builds upon the standard signal row data by adding the original stop-loss and take-profit prices – the values set when the signal was initially created.

Even if the stop-loss or take-profit levels are adjusted later through trailing stop mechanisms, these original prices remain visible, allowing users to see both the initial settings and the current, potentially modified, values. This feature is great for reports and user interfaces that need to display a complete picture of a trade's parameters.

You’ll also find information about how much of a position has been closed through partial executions, the number of times the position has been averaged (useful for understanding dollar-cost averaging strategies), and the original entry price, which stays constant even with averaging. These extra details contribute to a more complete and understandable signal record.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you calculate position sizes based on the Kelly Criterion, a popular strategy for managing risk and maximizing growth. It's a set of parameters you provide to the backtest-kit framework.

You'll define two key values: `winRate`, representing the proportion of winning trades, and `winLossRatio`, which reflects the average gain compared to the average loss on each trade. These values allow the framework to automatically determine how much of your capital to allocate to each trade, aiming for optimal long-term performance while considering potential drawdowns.


## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital to determine position size. It's designed to let you control how much of your available funds are used for each trade, based on a predetermined percentage.

The key parameter is `priceStopLoss`, which specifies the price at which you'll place a stop-loss order to limit potential losses on the trade. This value is crucial for risk management when using percentage-based sizing.

## Interface IPositionSizeATRParams

This interface holds the parameters needed for calculating your position size using an Average True Range (ATR) approach. Specifically, it defines the `atr` property, which represents the current ATR value – essentially, a measure of market volatility. You'll use this value within your trading strategy to determine how much capital to allocate to a trade, adjusting position size based on the level of market volatility. Think of it as telling the system, "Here's the ATR value I'm working with."

## Interface IPersistBase

This interface provides a simple set of tools for any custom storage solutions you build to interact with backtest-kit. It focuses on the core actions of reading, writing, and checking for the existence of data. 

The `waitForInit` method is used to set up your storage and make sure it's ready to go, and it only runs once.  `readValue` retrieves an entity from storage, while `hasValue` tells you whether a particular entity is even present. `writeValue` saves an entity to storage, ensuring the save happens reliably. Finally, `keys` lets you get a list of all the entity IDs stored, ordered alphabetically, which is useful for checking and processing everything.


## Interface IPartialProfitCommitRow

This interface describes a single instruction to take a partial profit during a backtest. Think of it as a line item telling the system to sell a portion of your holdings. 

It includes the action type, which will always be "partial-profit" to identify it as such. You also specify the percentage of your position you want to sell with `percentToClose`. Finally, the `currentPrice` records the price at which this partial profit was actually executed, providing valuable information for analysis.


## Interface IPartialLossCommitRow

This interface describes a single instruction for closing a portion of a trading position, specifically for partial loss scenarios. Think of it as a row in a queue, detailing exactly how much of the position should be closed and at what price.  It clearly states the action being taken is a "partial-loss," the percentage of the position to close (represented as a number), and the price at which that closure occurred. This information is crucial for accurately reflecting the trade's impact within a backtesting system.


## Interface IPartialData

This data structure, `IPartialData`, is designed to save and load progress for a trading signal. It’s a simplified version of the full signal state, focusing on the crucial information needed to resume where you left off.  Specifically, it stores the profit and loss levels that have been hit, representing key milestones in the signal's execution. Because some data types aren't easily saved, this uses arrays instead of sets to make saving and loading easier. This partial data is used by the persistence layer to keep track of signals, making it possible to restart backtesting or live trading from a saved point.

## Interface IPartial

This interface, `IPartial`, helps keep track of how well trading signals are performing. It’s used internally by the backtest-kit to monitor profit and loss milestones, like when a signal hits 10%, 20%, or 30% gains or losses.

The `profit` method handles situations where a signal is making money, checking for new profit levels and sending out notifications. Similarly, the `loss` method does the same for signals experiencing losses.  Both methods avoid sending duplicate notifications by remembering which levels have already been reported.

Finally, the `clear` method is used to clean up the record of a signal when it's finished trading, whether it's hit a target profit, a stop-loss, or simply expired. This ensures the system doesn’t hold onto unnecessary information.

## Interface IParseArgsResult

This interface, `IParseArgsResult`, represents the outcome when you're setting up your trading environment. It’s essentially a collection of flags that tell the backtest-kit framework how you want to run your trading strategy. 

You'll see properties like `backtest`, `paper`, and `live` – these indicate whether you want to test your strategy against historical data, simulate trading with live data, or actually trade with real money. These flags are automatically determined when you provide command-line arguments to the framework.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for setting up your backtest – it specifies things like which cryptocurrency pair you're trading (the `symbol`), what strategy you want to use (`strategyName`), which exchange you're connecting to (`exchangeName`), and the timeframe of the historical data you'll be using (`frameName`).  Essentially, it gathers all the essential details to kick off a backtest run. You'll use these properties to configure the backtest parameters.

## Interface IOrderBookData

This interface describes the structure of order book data, which represents the current buy and sell offers for a trading pair. It contains the `symbol` representing the trading pair, like 'BTCUSDT'.  You'll also find arrays called `bids` and `asks`.  The `bids` array lists all the buy orders, and the `asks` array lists all the sell orders, providing a snapshot of the market's depth. Each element within these arrays follows the `IBidData` structure (not defined here, but assumed to contain price and quantity).

## Interface INotificationUtils

This interface, `INotificationUtils`, acts as a blueprint for how different systems can report backtest events. Think of it as a common language for notifications – it ensures that whatever is sending information about your backtest (like a database, a logging system, or a user interface) can communicate in a consistent way.

It defines methods for handling key moments during a backtest, such as when a trade opens, closes, or encounters partial profits or losses. You'll also find methods for dealing with errors, both regular and critical ones, and for retrieving or clearing a log of notifications. Essentially, it's the foundation for keeping track of and responding to what’s happening within your backtest.

Here's a breakdown of the key functionalities:

*   `handleSignal`: Reports events related to trade actions (opening, closing, scheduling).
*   `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`: Alerts you when opportunities for partial profit-taking or loss mitigation arise.
*   `handleStrategyCommit`:  Signals when aspects of your strategy are put into effect.
*   `handleRisk`:  Notifies you when the backtest rejects a risk parameter.
*   `handleError`, `handleCriticalError`, `handleValidationError`: Provides error handling capabilities.
*   `getData`: Retrieves a history of all notifications.
*   `clear`:  Empties the notification log.

## Interface IMethodContext

The `IMethodContext` interface is like a little roadmap for your backtesting code. It carries crucial information, specifically the names of your exchange, strategy, and frame setups. Think of it as a messenger, quietly passing along these names so your code knows exactly which components to use for a particular trading simulation. It's automatically managed behind the scenes, simplifying how you reference and work with your trading strategies and infrastructure. When running live, the frame name will be empty, signaling that you're not in backtest mode.

## Interface IMarkdownTarget

This interface lets you choose exactly which reports you want generated when running backtests. Think of it as a way to control the level of detail in your reporting.

You can enable reports for specific events like entry and exit signals from your strategy, or those rejected by risk limits.

There are also options to track things like when stop losses adjust to your entry price, partial profit taking, portfolio heatmaps, strategy comparisons, performance bottlenecks, signals waiting to be triggered, and even all live trading activity. 

Finally, you can get a comprehensive backtest report summarizing your results and showing the complete trade history. By toggling these properties, you fine-tune the information you receive about your trading system's behavior.

## Interface IMarkdownDumpOptions

This interface helps control how data is exported to Markdown files. Think of it as a set of instructions for organizing and labeling your backtest results. It specifies where the files should be saved, what to name them, and what information—like the trading pair, strategy, exchange, timeframe, and signal ID—should be included in their names. This allows you to easily find and sort through your backtesting reports.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework record information. It provides a consistent way to track what's happening, from initial setups to errors and everything in between. Think of it as a system-wide journal for debugging and monitoring.

The `log` method is for general messages about important events. `debug` is for very detailed information, usually helpful when you’re trying to figure something out. `info` messages give you a higher-level summary of what's going on, while `warn` messages highlight things that might be a problem later.

## Interface IHeatmapRow

This interface represents a row of data within a portfolio heatmap, summarizing performance for a specific trading pair like BTCUSDT. It provides a comprehensive overview of how a trading strategy performed on that particular symbol, aggregating results across all strategies used. 

You'll find key metrics like total profit or loss percentage, risk-adjusted return (Sharpe Ratio), and maximum drawdown to understand the overall profitability and risk profile. It also includes trade-specific data, such as the total number of trades, win/loss counts, win rate, and average profit/loss per trade. 

Further insights are available through indicators like standard deviation, profit factor, and average win/loss amounts, along with information about the longest winning and losing streaks. Finally, expectancy gives you an idea of the expected return per trade, incorporating both win rate and average win/loss amounts.

## Interface IFrameSchema

This schema defines a reusable building block for your backtesting scenarios, essentially specifying a time period and frequency for data. Think of it as a blueprint for how you want your backtest data organized. 

Each schema has a unique name to identify it, and you can add a note to help you remember what it's for.  You’ll define the interval, like daily or hourly, and the start and end dates of your backtest. 

You can also attach optional lifecycle callbacks to this frame schema to execute custom code at different points during the backtest process, if you need to. This allows for greater flexibility in how your backtest operates.


## Interface IFrameParams

The `IFrameParams` interface defines the information needed to set up a trading frame within the backtest-kit framework. Think of it as the initial configuration for your simulated trading environment.

It builds upon the `IFrameSchema`, incorporating additional details.

Most importantly, it includes a `logger` property, which allows you to monitor and debug what’s happening during the backtest – essentially, it’s your window into the frame’s internal workings. This logger helps you understand the decisions the trading strategy is making and identify potential issues.

## Interface IFrameCallbacks

This interface defines functions that your custom backtest environment can use to respond to specific events happening within the backtest framework. 

Specifically, `onTimeframe` is called whenever the backtest generates a set of timeframes (like daily or weekly data). Think of it as a notification – you can use it to log information about the timeframe data being created, or to double-check that the timeframe generation is working as expected. It gives you a chance to inspect the generated dates and the interval used, allowing you to ensure data integrity or track performance metrics.


## Interface IFrame

The `IFrames` interface is a core component that handles how your backtesting data is organized by time. Think of it as the engine that creates the timeline your trading strategies will run against. 

Specifically, `getTimeframe` is the most important function – it takes a stock symbol and a timeframe name (like "daily" or "hourly") and then figures out all the dates and times needed for your backtest.  This method provides an array of timestamps that are evenly spaced according to the timeframe you've selected.  It’s a behind-the-scenes tool used by the backtest kit to manage the flow of data and ensure consistency.

## Interface IExecutionContext

The `IExecutionContext` object provides essential information about the current trading environment. Think of it as a package of details passed around to your trading strategies and exchanges during execution. It includes the trading symbol, like "BTCUSDT", the precise timestamp of the current operation, and a flag indicating whether the code is running in a backtesting simulation or live trading. This context helps your code adapt its behavior depending on whether it's analyzing historical data or actively executing trades.

## Interface IExchangeSchema

This interface describes how backtest-kit connects to and understands data from different cryptocurrency exchanges. Think of it as a blueprint for integrating a new exchange.

It requires you to define a unique name for the exchange and provides an optional space for notes.

The most important part is `getCandles`, which tells backtest-kit how to retrieve historical price data (candles) for a specific trading pair and time period.  You’ll also likely need to provide `formatQuantity` and `formatPrice` to correctly handle the specific decimal places used by the exchange, although sensible defaults are available.

`getOrderBook` lets you fetch the current order book, and although it's optional, omitting it will prevent its usage.

Finally, `callbacks` allows you to hook into certain events related to data processing, letting you customize the system's behavior if needed.

## Interface IExchangeParams

This interface defines the necessary components to connect to an exchange within the backtest-kit framework. Think of it as a blueprint for how the framework interacts with a specific trading platform.

It requires you to provide a way to log debug information, a context for the backtest (like knowing the symbol and time period), and most importantly, functions to retrieve historical data and format trade details. Specifically, you'll need to implement fetching candles (OHLCV data), formatting quantities and prices to match the exchange's rules, and obtaining order book data. The framework handles setting up some defaults, but you must provide the core functionality for interacting with your chosen exchange.

## Interface IExchangeCallbacks

This interface defines functions that your application can use to react to data coming from an exchange. Specifically, `onCandleData` lets you handle newly received candlestick data – you'll be notified whenever a set of candles for a particular trading symbol and time interval are available. The data includes details like the symbol, the interval (e.g., 1 minute, 1 hour), the starting date and time of the data, the number of candles received, and the actual candlestick data itself. You can use this callback to update your charts, trigger alerts, or perform other actions based on the latest market data.

## Interface IExchange

This interface defines how backtest-kit interacts with different cryptocurrency exchanges. It gives you tools to retrieve historical and future price data (candles) for a specific trading pair and time frame. You can also request the order book to see current buy and sell orders, and format quantities and prices to match the exchange's requirements.

To help with strategy analysis, it calculates the Volume Weighted Average Price (VWAP) based on recent trading activity. The system is designed to avoid looking into the future, ensuring a fair and accurate backtesting environment. 

When retrieving candle data, you have a lot of flexibility, specifying start and end dates, or just a number of candles to fetch, all while respecting the backtesting context.

## Interface IEntity

This interface, IEntity, serves as a foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point, ensuring that every piece of data you persist has a consistent structure. It establishes a basic contract for how these data objects should behave and interact within the system, promoting cleaner and more organized code.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that involve committing data, particularly when those commits need to be handled at the right time within your trading system. Think of it as a way to queue up actions that need to be recorded – like a trade execution – and ensure they're processed correctly even if they happen during a brief interruption. It holds the basic information needed for these queued events: the trading symbol involved and a flag indicating whether the system is in backtesting mode.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your cached candle data is valid. You'll provide details like the trading pair (symbol), the exchange you're using, the timeframe of the candles (interval), and the date range you want to verify. It also lets you specify where your candle data is stored on your computer, defaulting to a common location if you don't provide it. Think of it as a way to make sure your historical price data is in the right place and covers the dates you expect.


## Interface ICandleData

This interface defines the structure of a single candlestick, representing a snapshot of price action and volume over a specific time interval. Think of it as a standardized way to represent one bar of data on a price chart. Each candlestick holds information about when it began (`timestamp`), the price when it opened (`open`), the highest and lowest prices reached (`high`, `low`), the price when it closed (`close`), and the total trading volume during that period (`volume`). This data is essential for backtesting trading strategies and performing calculations like VWAP.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candlestick data for your backtests. Think of it as a blueprint for telling the system *what* data to download and store. 

You'll specify the trading pair (like "BTCUSDT"), the exchange you're using, the timeframe of the candles (e.g., 1-minute or 4-hour), and the date range you want to cover. By providing these details, backtest-kit can efficiently fetch and save the candles you need, so your backtesting runs smoothly without constantly downloading data.

## Interface IBreakevenData

This interface, `IBreakevenData`, is designed to store information about whether a breakeven point has been hit for a specific trading signal. It's a simplified version of the more complex `IBreakevenState`, made specifically for saving and loading data, like when persisting your backtest results. Think of it as a snapshot – it tells you if the breakeven condition was met, and that’s all. The `reached` property is a simple `true` or `false` value indicating whether breakeven was achieved. It’s used to efficiently store and retrieve this crucial state information.

## Interface IBreakevenCommitRow

This interface represents a single row of data related to a breakeven commit, which is a process used in trading strategies. Each row describes an action taken – specifically, a "breakeven" action – along with the price at the time that action was triggered. The `currentPrice` tells you the market price when the breakeven point was established. Essentially, it tracks when and at what price a trader adjusted their strategy to reach a breakeven position.

## Interface IBreakeven

This interface helps track when a trade's stop-loss can be moved to the entry price, essentially hitting a breakeven point. It's used by components that manage trading signals.

The `check` method is responsible for determining if breakeven has been reached, considering factors like transaction costs and whether the stop-loss can safely move. If breakeven is triggered, it records this and notifies listeners, also saving the state.

The `clear` method resets the breakeven status when a trade is finished, cleaning up any related data and ensuring that records are updated.

## Interface IBidData

This interface represents a single bid or ask found within an order book. It contains two key pieces of information: the price at which the order is placed, and the quantity of the asset available at that price. Both the price and quantity are stored as strings, allowing for flexibility in representing different data formats. Think of it as a snapshot of a specific price point and its associated volume in the market.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy, also known as a Dollar-Cost Averaging (DCA) strategy. Think of it as a record of one buy order within a larger averaging plan. It tells you that an average-buy action took place, and importantly, it stores the price at which that buy happened.  You'll also find the total number of buy entries accumulated so far after adding this new one. This data is helpful for tracking the progress and costs of your DCA strategy.

## Interface IActivateScheduledCommitRow

This interface represents a queued action for activating a scheduled commit within the backtest-kit framework. Think of it as a message saying, "Hey, we need to trigger a specific scheduled commit." 

It includes the type of action, which is always "activate-scheduled", and crucially, a `signalId` which identifies the particular signal that's being activated. There's also an optional `activateId` which can be used when an activation is manually triggered by the user. This allows for more controlled activation processes.

## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy with custom logic that responds to events happening during backtesting. Think of it as a way to plug in your own functions to do things like track performance, send notifications, or integrate with external systems.

You define these custom actions by giving them a unique name, optionally adding a note to explain what they do, and providing either a constructor function or pre-defined methods that will be executed when certain events occur.

These actions are created fresh for each strategy and timeframe combination, so they have access to all the data generated during the backtest. You can add multiple actions to a single strategy, letting you build a really customized and comprehensive system. Finally, you can specify callbacks to control exactly when your action's code runs, allowing for precise timing and interaction.

## Interface IActionParams

This interface defines the information given to actions when they're run within the backtest-kit framework. Think of it as a package of details that helps the action understand its surroundings and behave correctly. It includes a logger to track what's happening, information about the strategy and timeframe it’s part of, and flags indicating whether the action is running a simulation (backtest) or live trading. You'll find things like the strategy’s name, the exchange being used, and a way to record messages for debugging purposes inside this bundle of data.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into different stages of an action handler's lifecycle within the backtest-kit framework. Think of it as a set of customizable events that let you perform specific tasks at crucial moments. You can use these callbacks to manage resources, track events, or even persist state.

Here’s a breakdown of what each callback offers:

*   **`onInit`:** This function runs when the action handler starts up. It's the perfect place to set up connections to databases or external services, load any saved data, or prepare for processing.
*   **`onDispose`:** When the action handler shuts down, `onDispose` is called. Use this to clean up any resources you created during initialization, like closing connections or saving data.
*   **`onSignal`:** This callback receives information about every signal generated – whether you're backtesting or trading live.
*   **`onSignalLive`:**  Similar to `onSignal`, but specifically for live trading scenarios.
*   **`onSignalBacktest`:**  Specifically for backtesting, this callback provides signal data during historical analysis.
*   **`onBreakevenAvailable`:**  Alerted when the breakeven point is reached.
*   **`onPartialProfitAvailable`:**  Notified when a partial profit level is hit.
*   **`onPartialLossAvailable`:**  Notified when a partial loss level is reached.
*   **`onPingScheduled`:**  Called regularly while a signal is waiting to be activated.
*   **`onPingActive`:**  Called regularly while a signal is actively trading.
*   **`onRiskRejection`:**  Called when a signal is blocked by the risk management system.

All of these callbacks are optional.  You can choose to implement only the ones that are relevant to your specific needs. They can either return a normal value or a promise, enabling both synchronous and asynchronous operations.

## Interface IAction

The `IAction` interface is your central hub for reacting to events happening within the backtest-kit framework. Think of it as a way to plug in your own custom logic to respond to what’s going on.

You can use this interface to build things like:

*   Dispatching actions to a state management library like Redux or Zustand.
*   Logging events for debugging or auditing.
*   Sending data to real-time dashboards.
*   Collecting analytics and metrics about your trading strategies.

It provides several methods for different event types. `signal` handles events from both live and backtest modes, while `signalLive` and `signalBacktest` are specifically for live and backtest environments respectively.

There are also methods for handling breakeven events, partial profit/loss events, scheduled and active ping events, and risk rejections.

Finally, `dispose` is an important method to clean up any resources or subscriptions when you’re finished with your action handler, ensuring a clean shutdown.

## Interface HeatmapStatisticsModel

This model organizes the data you see in a portfolio heatmap, giving you a quick view of how your investments are performing overall. It breaks down the information into key areas, starting with an array of individual symbol statistics, each representing a different asset in your portfolio. Alongside this, you'll find the total number of symbols being tracked, the overall profit and loss (PNL) for the entire portfolio, a Sharpe Ratio indicating risk-adjusted performance, and the total number of trades executed across all symbols. Essentially, this structure provides a consolidated snapshot of your portfolio's health.

## Interface DoneContract

This `DoneContract` acts like a notification when a background task finishes, whether it's a backtest or a live trading execution. It provides details about what just completed, including the exchange used, the name of the trading strategy, and whether it was a backtest or a live run. You'll also find the trading symbol involved, like "BTCUSDT", and the name of the frame used if applicable. Essentially, it gives you a concise summary of the finished operation.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest-kit framework, indicating a problem so severe that the process needs to be stopped. Each notification has a unique identifier and a human-readable message to help understand what went wrong. It also includes detailed information about the error itself, like a stack trace and any related data. Importantly, these notifications always come from the live context, meaning they aren't generated during the backtesting simulation itself.

## Interface ColumnModel

This describes how to set up columns for displaying data in tables, particularly when generating markdown tables. Each column has a unique identifier, a user-friendly label that appears as the header, and a function to format the data within that column into a readable string. You can also specify a function to control whether a particular column should be displayed at all, offering flexibility in what information is shown. Essentially, it's all about defining how your data is presented in a tabular format.

## Interface ClosePendingCommit

This signal lets your backtest know that a pending order should be closed. It's used when you want to manually intervene and shut down a pending order, perhaps because of a change in strategy or unexpected market conditions. The `action` property is always set to "close-pending" to identify the signal type. You can also include a `closeId` to give a specific reason for closing the order, which can be useful for tracking and analysis.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event. Think of it as a way to reverse a future action that's already been planned within the backtest-kit system. You’ll need to specify the action as "cancel-scheduled" to indicate what you’re doing. Optionally, you can provide a `cancelId` – a string that helps you identify the reason for the cancellation, useful for tracking or debugging.

## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading backtest. It keeps track of every single breakeven event, giving you a detailed list of when those milestones were hit. You can also easily see the total number of breakeven events that occurred throughout the backtest. Essentially, it's your go-to place to understand how frequently and when your strategy reached breakeven.

## Interface BreakevenEvent

This data structure holds all the details about when a trade reached its breakeven point. Think of it as a snapshot of a trade's progress.

It includes information like the exact time, the trading pair involved, the strategy used, and a unique identifier for the signal that triggered the trade.

You’ll find key price points here too, such as the entry price (breakeven level), take profit target, and stop-loss levels, along with their original values set when the trade was initially created.

If the trade involved averaging your buys (DCA), you'll see the total number of entries and the original entry price before averaging took place. There’s also information about partial closes, along with a human-readable note describing why the signal was generated, when the position became active, and when the signal was initially created. Finally, it indicates whether the trade occurred during a backtest or a live trading session.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is adjusted back to the entry price. It's a way to track when a strategy has reduced its risk, effectively covering transaction costs and potentially locking in some profit. These events are only triggered once for each signal and are designed to be reliable.

The information included in a breakeven event tells you what trading pair, strategy, and exchange it relates to, along with details about the original signal and the current market price at the time of the event. You’ll also find information about whether this event is from a backtest or live trading, and the precise timestamp of when it occurred. Services like reporting tools and user callbacks use this data to understand strategy performance and risk management.

## Interface BreakevenCommitNotification

This notification tells you when a breakeven action has been taken within your trading strategy. It’s like getting a confirmation that your strategy has adjusted its take profit or stop loss to reach a breakeven point.

Each notification has a unique ID and timestamp, so you can track these events precisely. You’ll also see details about the trade itself, including the symbol being traded, the strategy that triggered the action, the exchange used, and the direction of the trade (long or short).

The notification provides the entry price, original and adjusted take profit and stop loss prices, along with information about any DCA (dollar-cost averaging) that might have been involved. It also includes timestamps related to the signal's creation and when the position became active, giving you a full timeline of the trade's lifecycle. It also indicates whether the event occurred during a backtest or live trading.

## Interface BreakevenCommit

The `BreakevenCommit` represents a breakeven event triggered within the backtest system. It signifies a moment when the system automatically adjusts a trade's stop-loss price to be equal to its entry price, aiming to protect profits and limit potential losses. 

This event includes key details about the trade, such as its direction (long or short), the entry price, the original and adjusted take profit and stop-loss prices, and the current market price when the breakeven adjustment occurred. You’ll also find timestamps indicating when the breakeven signal was generated and when the position was initially activated. Essentially, it’s a record of a crucial risk management action taken during a trade.

## Interface BreakevenAvailableNotification

This notification lets you know when a signal’s stop-loss order has reached the breakeven point – meaning it can now be moved to your original entry price. It's triggered when the market moves favorably enough to allow this.

The notification includes a lot of useful information, like a unique ID for the notification and the signal, the trading symbol (e.g., BTCUSDT), and the name of the strategy that generated the signal. You’ll also find details about the current market price, your original entry price, and the current take profit and stop-loss levels.

It also tells you whether this event happened during a backtest or in a live trading environment, and includes timestamps for when the signal was created, went pending, and when this particular breakeven notification was generated. If you're using dollar-cost averaging (DCA), the notification also provides information about the total number of entries.

## Interface BacktestStatisticsModel

This model collects a wide range of statistics after you run a backtest, giving you a clear picture of how your trading strategy performed. It stores every closed trade's details in a list, along with the total number of trades, how many were winners and losers, and the win rate. 

You’ll also find key performance indicators like average profit per trade, overall cumulative profit, and measures of risk like standard deviation and the Sharpe Ratio – which helps assess risk-adjusted returns.  There are even more specialized metrics like the certainty ratio and expected yearly returns. If any of these calculations encounter potentially unreliable data, the value will be marked as null to avoid misleading interpretations.

## Interface AverageBuyCommitNotification

This notification is sent whenever a new averaging buy (DCA) is added to an existing position. It provides a detailed snapshot of the trade at the moment the averaging buy executes. 

You’ll find key information here like a unique identifier, the timestamp of the action, and whether it happened during a backtest or a live trade. It tells you which symbol was traded, the name of the strategy that triggered it, and the exchange used. 

The notification also gives you specifics about the trade itself, including the current price, the new effective average entry price, the total number of averaging entries now in the position, and the direction of the trade (long or short). 

Importantly, it retains the original entry price and provides both the current, potentially trailing-adjusted, take profit and stop loss prices, along with their original values before any trailing adjustments were applied. Finally, timestamps related to signal creation and pending status are also included for comprehensive tracking.

## Interface AverageBuyCommit

This interface represents an average-buy event within the backtest-kit framework. It’s triggered whenever a new buy (or sell for short positions) is added to a position that's already using a dollar-cost averaging strategy. 

The event provides details about the trade, including the price at which the averaging buy was executed (`currentPrice`), the new, averaged entry price (`effectivePriceOpen`), and the original entry price when the position was initially opened (`priceOpen`).  You'll also find information about the take profit and stop loss prices – both the original values and the effective values after any trailing adjustments have been applied. 

The `scheduledAt` property tells you when the signal that triggered the entire process was originally created, and `pendingAt` indicates when the position actually became active. This data helps you analyze the performance of your averaging strategy and understand how price movements are affecting your position.


## Interface ActivePingContract

The ActivePingContract helps you keep track of what's happening when a trading signal is active and being monitored. Think of it as a heartbeat signal, sent every minute while a signal is still open.

This signal contains important details like the trading pair (symbol), the strategy that’s using it, and the exchange involved. You'll also receive the full details of the signal itself, including all the pricing information.

It tells you whether the event originates from a backtest (historical data) or live trading. Finally, it includes a timestamp to show exactly when the ping occurred, either the real-time moment for live trading or the candle timestamp during backtesting.

You can use this data to build custom logic to manage active signals, reacting to these "ping" events as they happen.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trade has been activated by a user, meaning it's been triggered without waiting for the price to reach the initially planned entry point. It provides a wealth of details about the trade, including a unique identifier, when it was activated, and whether it occurred during a backtest or live trading. You'll find information about the specific trading pair, the strategy that generated the signal, the exchange used, and the trade direction (long or short).

The notification also contains key pricing information like the entry price, take profit, and stop loss levels, both as they currently stand and as they were originally set before any adjustments.  Details on any dollar-cost averaging (DCA) used are included, showing the total number of entries. Crucially, the notification includes timestamps for when the signal was initially created, when it went pending, and when the notification itself was generated, giving you a complete timeline. Finally, it includes the current market price at the time of activation.

## Interface ActivateScheduledCommit

This interface defines the data needed to activate a trading signal that was previously scheduled. It's used when a pre-planned trade is triggered, letting the system know to execute it now. 

The `action` property clearly identifies this as an "activate-scheduled" event. You can optionally provide an `activateId` to track why the activation happened, useful for user-specific reasons.

The interface also carries essential details about the trade itself, including the `position` (long or short), `priceOpen` (entry price), `priceTakeProfit` (take profit price), and `priceStopLoss` (stop loss price). It also includes the original values of the take profit and stop loss prices, before any automatic adjustments were applied.

Finally, the `scheduledAt` property records when the signal was initially created, and `pendingAt` records the exact moment the activation occurs, crucial for timing and reconciliation.
