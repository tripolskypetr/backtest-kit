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

This interface describes a signal that's sent when a walker needs to be stopped. Think of a walker as a process that executes a trading strategy. 

Sometimes you need to pause or halt these processes, and this signal is how that information is communicated. 

It includes key details like the trading symbol involved, the name of the specific strategy that needs to be stopped, and the name of the walker itself. This last bit is really useful when you have several walkers running at the same time for different strategies. It lets you pinpoint exactly which walker needs to be interrupted.

## Interface WalkerStatisticsModel

WalkerStatisticsModel helps organize and understand the results of backtesting trading strategies. It builds on the existing WalkerResults data structure but adds extra information specifically for comparing different strategies against each other. 

The key piece of information it holds is strategyResults – a list of results, each representing a strategy that was tested. This allows you to see how each strategy performed and easily compare them to find the best performer.


## Interface WalkerContract

The WalkerContract lets you track the progress of backtesting strategies. It sends updates as each strategy finishes its test, providing a snapshot of what's happening during the comparison.

You'll get details like the walker's name, the exchange and frame being used, the symbol being tested, and the name of the strategy that just completed.

Along with the results, you’ll receive key statistics for that strategy and its performance on a specific metric.

The updates also tell you the best metric value seen so far, which strategy currently holds that title, and how far along the backtest process you are—namely, how many strategies have been tested and how many remain.

## Interface WalkerCompleteContract

The WalkerCompleteContract represents the conclusion of a backtesting process using the backtest-kit framework. It signals that all strategies have been run and evaluated, and provides a comprehensive summary of the results.

You'll find details like the name of the walker that performed the test, the asset (symbol) being analyzed, and the exchange and timeframe used for the backtest. 

The contract also includes the optimization metric used to judge performance, the number of strategies tested, and identifies the strategy that performed the best. 

Finally, it provides access to the detailed statistics for that top-performing strategy, giving you a complete picture of its performance.

## Interface ValidationErrorNotification

This notification signals that a problem occurred during risk validation. 
It’s specifically triggered when the validation functions encounter an error.

Each notification has a unique ID to help track it.
You’ll also find a descriptive message explaining the validation failure, making it easier to understand what went wrong.
The error details, including a stack trace and related information, are included for debugging. 
Importantly, this notification always indicates an error originating from a live context, not a backtest.


## Interface ValidateArgs

The `ValidateArgs` interface helps ensure that the names you use for different components of your backtesting setup – like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweep configurations – are all valid.

Think of it as a checklist for your names. 

Each property within `ValidateArgs` (like `ExchangeName`, `FrameName`, etc.) expects an enum object, and the framework uses this to make sure the names you're using actually exist within your system. 

This helps prevent errors by catching incorrect names early on, leading to more reliable backtesting results.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's a detailed record of what happened during that action, whether it occurred during a backtest or in live trading. 

The notification includes a unique identifier and timestamp for tracking purposes. You'll find information about the trading symbol, the strategy involved, and the exchange used. It also provides all the critical pricing details, like entry price, take profit price (both original and adjusted by trailing), and stop loss prices.

You can also see details about any averaging or partial closing strategies used, the total number of entries and partials. Crucially, it provides comprehensive Profit and Loss (PNL) information, including the calculated costs, invested capital, and percentages. Finally, there are timestamps associated with signal creation and the position’s pending state, giving you a complete picture of the trade's lifecycle.

## Interface TrailingTakeCommit

This object represents an event triggered when a trailing take profit mechanism adjusts a trade's take profit level. It provides a snapshot of the trade’s state at the time of the adjustment. 

You'll find details here like the current market price, the percentage shift used to modify the take profit, and the position's direction (long or short).

The `priceTakeProfit` field shows the new, adjusted take profit price, while `priceStopLoss` reflects the current state of the stop loss, which might also have been moved. The original take profit and stop loss prices, before any trailing adjustments, are also included.

You can also access the trade's entry price, unrealized profit and loss (PNL), and timestamps related to when the signal was created and the position was activated. Essentially, it captures everything you need to understand how and when a trailing take profit event occurred.

## Interface TrailingStopCommitNotification

This notification provides details about when a trailing stop order is triggered and executed. It’s a signal that a trailing stop has done its job and a trade is closing based on price movement. 

The notification includes a unique identifier, the timestamp of the event, and whether it happened during a backtest or live trading. It also specifies the trading pair, the strategy responsible for the signal, and the exchange used.

You’ll find essential information about the trade itself – the signal ID, percentage shift from the original stop loss, the current market price, the position direction (long or short), and the original entry and stop-loss prices. There’s also data about DCA averaging if it was used (total entries), and partial closes if any occurred.

Profit and loss information is provided, including the total P&L, percentage gain or loss, and breakdowns related to entry and exit prices, as well as the investment cost. Finally, timing details like when the signal was created, when the position went pending, and when the notification itself was created are also included.

## Interface TrailingStopCommit

This describes a trailing stop event, which happens when a trailing stop-loss order is triggered or adjusted. It contains all the details about what's happening with the trade at that moment.

You’ll find information about the specific action that occurred – in this case, a trailing stop. The `percentShift` tells you how much the stop loss moved, based on a percentage.

The event also includes the current market price, the unrealized profit and loss (PNL) of the trade, and whether the position is long or short. 

Critically, it holds both the original take profit and stop loss prices before any trailing adjustments occurred, alongside the current, adjusted take profit and stop loss prices. Finally, timestamps indicate when the signal was created and when the position was initially activated.

## Interface TickEvent

This describes the `TickEvent` object, which acts as a central container for all data related to a trading event. Think of it as a single record capturing everything that happened during a trade, regardless of whether it was scheduled, opened, closed, or cancelled.

The event includes details like the exact time it occurred (`timestamp`), the type of action taken (`action`), and specifics about the trade itself, such as the trading pair (`symbol`), the signal used (`signalId`), and the position type.

For trades that involve take profit and stop loss orders, you'll find details about the target prices, both as initially set and as they may have been modified. Information about DCA averaging is available, showing the total number of entries and partial closes.

Profit and loss information is also captured, distinguishing between unrealized and realized profits, along with progress towards take profit and stop-loss targets. If a position was closed or cancelled, reasons for the action are included. Finally, timing information, like when the position became active or was scheduled, and performance metrics like peak and fall PNL, are also recorded. Essentially, this object aims to provide a complete history of each trade within your backtesting framework.

## Interface SyncStatisticsModel

The `SyncStatisticsModel` helps you understand how often your signals are being synced. It keeps track of all the syncing events that have happened, giving you a complete list of each one along with all its details. You can easily see the total number of sync events that occurred, and it breaks down those events into how many times signals were opened and how many times they were closed. This model provides valuable insights into the lifecycle of your signals and how they’re being managed.

## Interface SyncEvent

The `SyncEvent` object provides a complete record of what happened during a trading signal's lifecycle. It bundles together all the important details, making it easy to generate reports and analyze performance.

Think of it as a snapshot in time, capturing things like the exact time the event occurred, which trading pair was involved, the name of the strategy and exchange used, and even the direction of the trade (long or short).

You’ll also find crucial pricing information, including entry prices, take profit levels, and stop-loss orders – both the original values and any adjusted values due to trailing stops.

It also tracks the number of entries and partial closes for signals using dollar-cost averaging or partial profit taking, and details of the profit and loss (PNL) at that specific moment. If a signal has been closed, the `closeReason` explains why it happened. Finally, `createdAt` provides the exact moment the event was created, while `backtest` tells you if the signal was part of a simulation.

## Interface StrategyStatisticsModel

This model holds the statistical information gathered during a backtest, giving you insights into how your trading strategy performed. It essentially organizes all the events generated by your strategy, allowing you to analyze its behavior.

You'll find a complete list of all strategy events recorded, alongside the total number of events processed. The model also breaks down the events by type: how many times the strategy canceled scheduled actions, closed pending orders, took partial profits, cut losses, used trailing stops, or set breakeven points. Finally, it provides the number of average buy (DCA) actions taken.


## Interface StrategyEvent

This data structure holds all the information about actions taken by your trading strategy, whether you're backtesting or live trading. It’s designed to be used for creating reports that explain what your strategy is doing.

Each event includes details like the exact time it happened, the trading pair involved, the strategy's name, and the exchange being used. You’ll also find specifics about the signal that triggered the action, the type of action taken (like buying, selling, or canceling), and the current market price at the time.

For actions involving partial exits or adjustments to stop-loss/take-profit levels, you’ll find relevant percentages and price adjustments. It keeps track of unique IDs for actions like cancellations or pending orders, along with creation timestamps.

When dealing with strategies that use dollar-cost averaging (DCA), you'll see information about the total entries made and the overall cost. Finally, a PNL object is included, giving you the profit and loss at the moment of the event.

## Interface SignalSyncOpenNotification

This notification tells you when a signal, typically a limit order, has been activated and a trade has begun. It’s essentially a confirmation that the system has started working on a trade based on a pre-defined signal.

The notification includes a unique ID to track the specific event, as well as the exact time it occurred. It tells you whether the trade was executed during a backtest or in live trading.

You’ll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where the trade took place. There’s also a unique identifier for the signal itself.

The notification provides valuable information about the trade’s financials, including the current market price at the time of activation, initial profit and loss, and the entry price. You can see the position direction, whether it's a long (buy) or short (sell) trade.

It contains specifics about price targets—take profit and stop loss levels—both as they stand after any adjustments (trailing stops) and their original values before modifications. Details about any DCA averaging (multiple entry prices) and partial position closures are included. Finally, you have timestamps for when the signal was created, when the position became active, and when the notification was generated.

## Interface SignalSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was due to a take profit or stop loss being triggered, time expiring, or manual closure. It provides a detailed record of what happened, including a unique identifier for the notification, the exact time the signal closed, and whether it occurred during a backtest or live trading.

You'll find important details like the trading pair involved, the strategy that generated the signal, and the exchange where the trade took place. The notification also gives you key performance indicators (KPIs) such as profit and loss, both absolute and as a percentage, along with entry and exit prices. 

It specifies the trade direction (long or short) and provides the original and effective prices for entry, take profit, and stop loss. You can also track details like the number of DCA entries and partial closes, the original scheduling time, and a clear explanation of why the signal was closed. Finally, it includes a timestamp of when the notification itself was created.

## Interface SignalSyncBase

This defines the core information you'll find in every signal synchronization event within the backtest-kit framework. Each signal event, whether it's from a backtest or live trading, includes details like the trading pair's symbol – for example, "BTCUSDT" – and the name of the strategy that created it. 

You'll also find the exchange where the signal was triggered, the timeframe used (important for backtesting), and confirmation of whether the signal originates from a backtest or a live trading environment. A unique identifier and timestamp are provided for each signal, and the full signal data itself is also included for complete context.


## Interface SignalScheduledNotification

This notification type, `SignalScheduledNotification`, lets you know when a trading signal has been prepared for execution in the future. It’s essentially a heads-up that the system is about to place a trade.

Each notification contains a lot of details about the upcoming trade, including a unique identifier, the exact time it was scheduled, and whether it's happening in a backtest or a live environment.

You'll find information about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange it will be executed on.  The notification specifies whether it's a long (buy) or short (sell) position, and outlines key pricing details: the intended entry price, take profit target, and stop loss levels, along with their original values before any trailing stop adjustments.

Beyond the basics, it also provides insight into the financial aspects of the trade, like the cost, P&L (profit and loss) information, invested capital and current market price at the time of scheduling.  The `totalEntries` and `totalPartials` fields indicate whether and how much of a DCA (Dollar-Cost Averaging) strategy was used, and how many partial closes have been performed. Finally, it includes timestamps for when the notification was created and when the underlying candle data was generated.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened, whether it's part of a backtest or a live trade. It provides a wealth of details about the trade itself, like the trading symbol (e.g., BTCUSDT), the strategy that triggered it, and the exchange used. You’ll find key information like the entry price, take profit and stop-loss levels, and how many times the position has been averaged down (through DCA) or partially closed.

It also includes profitability metrics such as unrealized profit and loss, expressed both in USD and as a percentage. The notification identifies the exact time the trade was scheduled, when it became pending, and when the notification itself was generated. A descriptive note field lets you add a human-readable explanation for the signal's reasoning, and a unique ID helps in tracking specific signals. You can see the original entry price before any adjustments, as well as the cost and total capital invested in the trade.

## Interface SignalOpenContract

This event, `SignalOpenContract`, is triggered when a pre-arranged trading signal—specifically, a limit order—is actually executed by the exchange. Think of it as confirmation that your order to buy or sell at a specific price has been filled.

It's a crucial signal for systems outside of the core backtest-kit framework. It allows external order management systems to keep track of what’s happening on the exchange and ensure trades are accurately reflected.

The event provides a wealth of information about the trade, including the current market price, the price at which the order was filled (`priceOpen`), profit and loss information (`pnl`), and all the prices related to stop losses and take profits.  You'll also find details about how many times the position was averaged down or partially closed.

Essentially, `SignalOpenContract` acts as a bridge between the automated trading framework and other systems that need to know when and how a trade was executed.

## Interface SignalData$1

This data structure holds information about a single trading signal after it has been closed. Think of it as a record of one completed trade. 

It includes details like which strategy created the signal, a unique ID for the signal itself, the symbol being traded (like BTC/USD), whether the trade was a long or short position, and the percentage profit or loss (PNL) generated. You'll also find the reasons for closing the trade, along with the times it was opened and closed. Essentially, it’s a snapshot of a finished signal’s performance.

## Interface SignalCommitBase

This describes the common information you'll find in events related to signals, like when a trade is initiated. Every signal commit event will have these details.

You'll see the trading pair involved, the name of the strategy that generated the signal, and the exchange used. 

There's also information indicating if the signal came from a backtest (simulated trading) or a live trading environment. A unique ID identifies each signal, and a timestamp marks exactly when it occurred.

The total entries and partials show how a position is being managed; a higher number means the position is being actively adjusted. Finally, `originalPriceOpen` keeps track of the initial price used when the trade was first set up.

## Interface SignalClosedNotification

This notification details when a trading position is closed, whether it's because a take profit or stop loss was hit, or due to other reasons. It provides a wealth of information about the closed position, including when it was opened and closed, the prices involved, and the strategy that generated the signal. You'll find details like the entry and exit prices, the original take profit and stop loss levels, and how many DCA entries were used.

It also includes financial information, like the profit or loss (both as a percentage and in USD), the total capital invested, and the effective prices used for PNL calculations. The notification specifies the reason for the closure (like take profit, stop loss, or time expiration), along with the position’s duration and any additional notes. Finally, the notification includes timestamps for key events – signal creation, pending status, and closure – making it valuable for analyzing the entire trading lifecycle. It also clearly indicates if the event occurred during a backtest or a live trading session.

## Interface SignalCloseContract

This event lets you track when a signal is closed, whether it's because of a take profit, stop loss, time expiration, or a manual closure. It’s designed to help systems outside of the core trading framework stay in sync, for example, canceling any remaining orders or recording the profit and loss in a separate database.

The event provides a lot of details about the closure, including the current market price, the total profit or loss generated, the trade direction (long or short), and the prices used for entry, take profit, and stop loss – both the original values and the final values after any adjustments.

You'll also find information about when the signal was created, when the position was activated, and the reason for the closure. Lastly, it gives you insights into any averaging or partial closures that occurred during the trade.

## Interface SignalCancelledNotification

This notification informs you that a previously scheduled trading signal was cancelled before it could be executed. It provides a wealth of information about the cancelled signal, helping you understand why it wasn't activated.

The notification includes the unique identifier of the signal, the time it was cancelled, and whether it originated from a backtest or live trading environment. You'll find details like the trading pair, the strategy that created the signal, and the exchange it was associated with.

It also gives you the intended trade direction (long or short), along with the planned take profit and stop loss prices. Crucially, it includes the original prices before any adjustments were made, and details about any planned DCA averaging or partial closes. A `cancelReason` field explains precisely why the signal was cancelled, whether it was due to a timeout, price rejection, or a user action. Finally, the notification includes timestamps indicating when the signal was scheduled, when it became pending, and when the notification itself was generated.

## Interface Signal

This `Signal` object holds crucial information about a trading position.

It tracks the initial entry price using `priceOpen`, giving you the price at which the trade began. 

You'll also find a record of all entry events, stored in the `_entry` array, detailing the price, cost, and time for each entry.

Finally, `_partial` keeps track of any partial exits from the position, noting the type (profit or loss), percentage, current price, cost basis, entry count at the time of exit, and the timestamp.

## Interface Signal$2

This `Signal` object holds the key data related to a single trading signal. It's essentially a record of what happened when a trade was initiated.

The `priceOpen` property tells you the price at which the position was first opened – the initial entry point.

The `_entry` array keeps track of each individual entry made within this signal.  Each entry includes the price, the cost, the time it occurred.

The `_partial` array records any partial exits from the position, detailing the type of exit (profit or loss), the percentage of the position closed, the price at the time of exit, and other relevant financial details like cost basis and entry count.  This allows you to see how a position was managed over time, not just the initial entry.

## Interface Signal$1

This `Signal` object holds essential information about a trading position.

It tracks the original entry price and cost of the trade through the `priceOpen` property.

The `_entry` array stores details of each entry point, including price, cost, and when it occurred.

To monitor partial exits, the `_partial` array records details of profit-taking or loss-limiting actions, along with relevant prices, costs, and quantities at the time.

## Interface ScheduledEvent

This data structure represents a single event related to a trading signal, whether it was scheduled, opened, or cancelled. It bundles together all the key details about that event for reporting and analysis.

You’ll find things like the exact time the event occurred, the type of action taken (scheduled, opened, or cancelled), and the symbol being traded. It also includes information like the signal ID, position type, a note about the signal, and pricing details like entry, take profit, and stop loss prices – both as originally set and as they may have been adjusted. 

If the signal involved DCA (Dollar Cost Averaging) or partial closes, you'll also see counts of entries and partial executions, as well as the original entry price before averaging.  For cancelled events, there’s a reason code indicating why it was cancelled, along with a unique ID for user-initiated cancellations.  Finally, it tracks the unrealized profit and loss (PNL) at the time of the event, and timing details like when a position became active or how long it ran before cancellation.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled trading signals are performing. It provides a set of data points that let you see how many signals you've scheduled, how many have been activated (turned into trades), and how many have been cancelled.

You'll find a detailed list of all events – when they were scheduled, activated, or cancelled – within the `eventList` property.  The `totalEvents`, `totalScheduled`, `totalOpened`, and `totalCancelled` properties give you the raw counts for each of these states.

To gauge efficiency, you can look at the `cancellationRate` (a lower percentage is good, indicating fewer signals are being cancelled) and the `activationRate` (a higher percentage means more scheduled signals are becoming live trades). Finally, the `avgWaitTime` and `avgActivationTime` properties help you understand how long signals are waiting before being cancelled or activated, respectively.

## Interface SchedulePingContract

This contract defines what happens when a scheduled signal is actively being monitored, sending out a "ping" event every minute. Think of it as a heartbeat to let you know the signal is still running.

These ping events include important details like the trading pair (symbol), the strategy name, and the exchange being used.  You'll also receive the full data associated with the signal itself, like its entry price, take profit, and stop loss levels. 

The ping also contains the current market price at the time of the ping, which is super helpful for building custom checks.  For example, you can use this to automatically cancel a signal if the price moves too far from your initial entry.

Finally, a flag indicates whether the ping is coming from a backtest (historical data) or live trading, and includes a timestamp that represents when the event occurred. You can listen for these ping events to implement your own custom monitoring or cancellation logic.

## Interface RiskStatisticsModel

This model holds statistical information related to risk rejection events, giving you a clear view of how your risk management is performing. It contains a list of all the individual risk events, along with the total count of rejections that occurred. 

You can also break down these rejections to see which symbols or trading strategies are triggering the most frequent interventions. This breakdown helps pinpoint areas where adjustments to your risk controls might be needed. Essentially, it’s a central place to track and analyze your risk rejection activity.


## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked by your risk management rules. It helps you understand why a signal didn't result in a trade.

Each notification has a unique ID and timestamp to track when the rejection happened. It also specifies whether this occurred during a backtest or in live trading.

You’ll find details about the trading symbol, the strategy that generated the signal, and the exchange involved. The `rejectionNote` provides a clear explanation of why the signal was rejected.

The notification also includes information about your current open positions, the price at the time of rejection, and optional details about the signal itself, such as the signal ID, trade direction, entry price, take profit, stop loss, expected duration, and a note explaining the signal's purpose. Finally, the notification records when it was created.

## Interface RiskEvent

The `RiskEvent` data structure holds details about signals that were blocked due to risk management rules. It’s essentially a record of when the system decided *not* to execute a trade because of a pre-defined safety limit.

Each `RiskEvent` includes a timestamp, the symbol involved (like BTC/USDT), the specific signal that was rejected, and the name of the strategy that generated it. You'll also find the exchange and time frame associated with the signal, along with the current market price at the time of the rejection.

Crucially, it also provides information about any existing positions and a unique ID for the rejection.  A rejection note will explain *why* the signal was rejected – for example, it might be due to exceeding a maximum position size.  Finally, a flag indicates whether the event occurred during a backtest or a live trading session.

## Interface RiskContract

This object represents a rejected trading signal due to risk validation. It's a record of when the system prevented a trade from happening because it violated a risk limit.

Think of it as an audit trail for risk management – it only appears when something goes wrong and a trade is blocked.

Here's what the information tells you:

*   **symbol:** The specific trading pair involved, like BTCUSDT.
*   **currentSignal:** All the details of the trade attempt that was rejected (how much to buy, target prices, etc.).
*   **strategyName:**  Which automated trading strategy tried to make the trade.
*   **frameName:** The timeframe the strategy was using (e.g., 5-minute chart).
*   **exchangeName:** The exchange the trade was intended for.
*   **currentPrice:** The price of the asset at the moment the trade was rejected.
*   **activePositionCount:** How many other trades the strategy currently had open.
*   **rejectionId:** A unique ID for this specific rejection, helpful for tracking down the issue.
*   **rejectionNote:** A clear explanation of why the trade was rejected.
*   **timestamp:**  The exact time the rejection occurred.
*   **backtest:**  Indicates whether this rejection happened during a simulated backtest or in live trading.



It's useful for services that generate risk reports and for developers who want to be notified when trades are rejected due to risk limits.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` provides a way to monitor the progress of a background task, specifically when running a walker in the backtest-kit framework. It's like getting updates as your strategies are being tested.

Each update contains key details such as the name of the walker, the exchange being used, and the frame. 

You'll also see information about how many strategies are left to process (`totalStrategies`), how many have already been handled (`processedStrategies`), and the overall percentage of completion (`progress`). This allows you to gauge how long the testing process might take.

## Interface ProgressBacktestContract

This contract provides updates on the progress of a backtest as it's running. You'll receive these updates during the background execution of a backtest. Each update tells you which exchange and strategy are being tested, the trading symbol involved, the total number of historical data points (frames) the backtest will analyze, and how many frames have already been processed. It also gives you a percentage indicating how close the backtest is to completion, expressed as a value between 0.0 and 1.0. Think of it as a report card for the backtest, letting you know how far along it is and what it's working on.

## Interface PerformanceStatisticsModel

This model holds performance data aggregated for a specific trading strategy. It essentially gives you a high-level overview of how a strategy performed.

The `strategyName` tells you which strategy the statistics belong to. 

`totalEvents` represents the overall count of performance events that were tracked. `totalDuration` indicates the combined time spent calculating all the performance metrics.

The `metricStats` property provides a breakdown of performance data, organized by different types of metrics used.

Finally, `events` contains a complete list of the raw, individual performance measurements collected during the backtest. This allows for deeper analysis if needed.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how quickly different parts of your trading system are running. It records events during execution, providing a timeline of performance metrics. 

Think of it as a way to pinpoint slowdowns or bottlenecks. Each event includes when it happened (`timestamp` and `previousTimestamp`), what was being measured (`metricType`), how long it took (`duration`), and the context it occurred within – like the trading strategy, exchange, frame, and symbol involved. 

You can see if the metrics originate from a backtest or live trading environment (`backtest` property). This lets you closely examine how your system behaves in both simulated and real-world conditions, aiding in optimization and efficiency.


## Interface PartialStatisticsModel

This object holds data about partial profit and loss events within a backtest. Think of it as a snapshot of how frequently your trading strategy experienced wins and losses at specific milestones. 

It includes a detailed list of each individual event, alongside counts of the total number of events, total profits, and total losses. You can use these metrics to analyze performance and identify potential areas for improvement in your trading strategy. Specifically, it lets you see not just overall results, but also how results break down during partial events.

## Interface PartialProfitContract

The `PartialProfitContract` describes events that occur when a trading strategy reaches specific profit milestones, like 10%, 20%, or 30% profit. These events help you track how well your strategy is performing and when partial take-profit orders are executed.

Each event includes details like the trading symbol (e.g., BTCUSDT), the strategy name, the exchange and frame used, and the original signal data. You'll also find the current market price at the time of the profit level, the specific level reached (e.g., 50%), and whether it happened during a backtest or live trading session.  The timestamp provides the precise time this profit level was detected, based on either real-time data or historical candle information. These signals are deduplicated to avoid repeated notifications.


## Interface PartialProfitCommitNotification

This notification provides detailed information when a partial profit commitment is made during a trading process. It's a signal emitted whenever a portion of a position is closed to realize some profit. The notification includes a unique identifier, a timestamp, and indicates whether the action happened during a backtest or live trading. 

You'll find specific details about the trade, such as the trading pair, strategy name, exchange used, and the unique ID of the signal that triggered the action. The notification also specifies the percentage of the position that was closed, the current market price at the time, and the direction of the trade (long or short). 

Furthermore, it contains a wealth of historical price data related to the trade, including entry price, take profit and stop loss levels, and their original values before any trailing adjustments. For strategies employing dollar-cost averaging (DCA), you'll see the number of entries.

Finally, the notification provides comprehensive profit and loss (PNL) data, including percentages, adjusted prices considering slippage and fees, cost, invested capital, and timestamps for key events in the trade lifecycle – creation, pending activation, and the notification’s creation. This provides a complete picture of the partial profit commitment event.

## Interface PartialProfitCommit

This describes a partial profit event within the trading framework. It's essentially a notification that a portion of your trade is being closed for profit.

The `action` property confirms this is a partial profit event.

You'll find the `percentToClose` which tells you what percentage of the trade is being closed.  The `currentPrice` shows the price at the moment the action was triggered.

The `pnl` provides a snapshot of the unrealized profit (or loss) at that time.

Knowing the `position` (long or short) clarifies the trade direction.

You also get access to key price points: the `priceOpen` (entry price), the `priceTakeProfit` (current target price, potentially adjusted), and the `priceStopLoss` (current stop-loss price, also potentially adjusted).

For reference, `originalPriceTakeProfit` and `originalPriceStopLoss` store the initial take profit and stop-loss levels, before any trailing modifications.

Finally, `scheduledAt` and `pendingAt` provide timestamps of when the signal to take the action was created and the position was activated, respectively.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy hits a predefined profit milestone, like 10%, 20%, or 30% gain. It's a signal that things are going well!

The notification includes a lot of useful information, like a unique ID, when it happened, and whether it occurred during a backtest or live trading. You'll also see details about the specific trade: the trading pair, the strategy used, the exchange, and the signal ID.

It provides the current market price, the original entry price, and the take profit and stop-loss prices, both as initially set and after any trailing adjustments. You can find information about any DCA averaging performed and partial closes executed. 

It also gives you a snapshot of the current profit/loss, both in percentage and absolute terms, along with the effective prices used for those calculations. Finally, timestamps related to signal creation and position activation are included for comprehensive tracking.

## Interface PartialLossContract

This interface, `PartialLossContract`, describes when a trading strategy hits a predefined loss level, like a 10%, 20%, or 30% drawdown. It's used to keep track of how much a strategy is losing and when those loss milestones are reached.

Each event emitted contains key information: the trading symbol, the strategy's name, the exchange and frame used, the original signal data, the current price, the specific loss level reached, and whether the event occurred during a backtest or live trading.  It also provides a timestamp, which reflects either the live tick time or the historical candle’s timestamp, depending on the execution mode.  These events are designed to be used for generating reports and for notifying users about significant strategy drawdowns.  Events for a given signal are only emitted once, even if multiple loss levels are triggered in quick succession.

## Interface PartialLossCommitNotification

This notification lets you know when a partial position has been closed, providing a wealth of detail about the trade. It's triggered when a strategy decides to close only a portion of an existing position, rather than the entire thing.

You'll find a unique identifier for the notification, along with the exact timestamp it occurred. Crucially, it indicates whether the trade happened in a backtest simulation or in live trading.

The notification includes the trading symbol, the strategy’s name, and the exchange used. It also contains the unique ID of the signal that triggered the action, along with the percentage of the position that was closed.

Beyond the basics, you get comprehensive data related to the position itself – the current market price, the original entry price, take profit and stop loss levels (both original and adjusted), and the number of DCA entries and partials.

A detailed P&L breakdown is also provided, including the profit/loss in various forms (absolute, percentage, entry and close prices), invested capital, and timestamps for signal creation and pending status. Essentially, it gives you a complete picture of what happened during this partial position closure.

## Interface PartialLossCommit

This object represents a partial loss event within the backtest. It signifies a situation where a portion of a trading position is being closed due to a predefined loss threshold. 

The `action` property clearly identifies this as a "partial-loss" event. 

You'll find the `percentToClose` which indicates what fraction of the position is being closed, ranging from 0 to 100.  

Crucially, the `currentPrice` reflects the market price when the partial loss decision was made, alongside the `pnl` – your unrealized profit and loss at that specific moment. 

The object also includes essential details about the original trade, like the `position` direction (long or short), the `priceOpen` (entry price), and the `priceStopLoss` – the effective stop-loss price applied. Original take profit and stop-loss prices are also available alongside, to see the initial levels you set.

Finally, timestamps, `scheduledAt` and `pendingAt`, record when the signal and the position’s activation occurred, offering insight into the timing of the partial loss execution.


## Interface PartialLossAvailableNotification

This notification informs you when a trading strategy has reached a predefined loss level, such as a 10% or 20% drawdown. It's a way to monitor your strategy's performance and potentially react to significant losses during backtesting or live trading. Each notification includes details like a unique identifier, the exact timestamp of the event, and whether it occurred during a backtest or in a live trading environment.

You’ll find crucial information about the trade itself, including the symbol being traded, the strategy name, the exchange used, and the signal's unique ID. The notification also specifies the loss level reached (e.g., 10%, 20%), along with the current market price, the original entry price, and the trade direction (long or short). 

It provides key pricing details like take profit, stop loss, and their original values before any trailing adjustments. For strategies using dollar-cost averaging (DCA), you'll see the total number of entries and partial closes executed. Finally, comprehensive profit and loss data, including percentage, cost in USD, and the prices used in those calculations, are included to help you assess the trade's impact. Timestamps for signal creation and position pending are also available for complete context.

## Interface PartialEvent

This `PartialEvent` object holds all the important details whenever your trading strategy hits a profit or loss milestone. Think of it as a snapshot of what happened during a trade – like reaching the 10% profit level or hitting the stop-loss.

It contains information like the exact time of the event, whether it's a profit or loss, the trading pair involved, and the name of the strategy that triggered it. You’ll also find details about the entry and exit prices, stop-loss and take-profit levels, and even the original settings used when the trade was started.

For strategies that use dollar-cost averaging (DCA), it tracks the number of entries made and the overall progress of partial exits.  It also includes the current unrealized profit and loss and any notes explaining the reason behind a trade. Finally, it indicates whether the trade is part of a backtest or a live trading scenario.

## Interface MetricStats

This object provides a summary of statistics for a specific performance metric. Think of it as a report card for how a certain action or process is performing. 

It includes details like the total number of times that metric was recorded, the overall time spent, and average durations. You'll also find information on the shortest and longest durations observed, as well as the standard deviation to understand the spread of the data.

Furthermore, it captures percentiles (like the 95th and 99th) giving you insights into how durations are distributed. Finally, it outlines information about the wait times between events to give a full picture.

## Interface MessageModel

This describes a single message within a conversation, like the ones you’d see in a chatbot interaction. Each message has a `role` indicating who sent it – whether it’s a system instruction, something the user typed, a response from the AI, or the result of a tool being used.

The core of the message is its `content`, which is the text of what was said. Sometimes, a message might only include information about tools used, and in these cases, the `content` can be empty.  The `reasoning_content` field is a special addition for some AI systems that show their thought process, allowing you to see how they arrived at their answer.

If the AI uses tools, those actions are listed in the `tool_calls` array.  Images can also be included in a message and are supported in several formats, like base64 strings or raw image data. Finally, the `tool_call_id` identifies which specific tool call this message is connected to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading backtest. 

It keeps track of each drawdown event in a list, ordered from most recent to oldest. You can access this list through the `eventList` property, which contains detailed information about each drawdown, like the date, drawdown amount, and other relevant data. 

Additionally, the `totalEvents` property simply tells you how many drawdown events were recorded during the backtest period.

## Interface MaxDrawdownEvent

This data structure represents a single instance of a maximum drawdown event that occurred during trading. Each event captures details like the exact time it happened, the trading symbol involved, and the name of the strategy used. You'll also find information about the signal that triggered the trade, whether the position was long or short, and the unrealized profit and loss (PNL) at that moment.

Along with that, the record includes the price at which the drawdown occurred, the original entry price, and any predefined take profit or stop loss levels. Finally, it indicates whether the event occurred during a backtesting simulation or in live trading.

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides information when a new maximum drawdown is recorded for a trading position. 

It gives you details like the trading symbol, the current price, and when the update happened. You'll also see the name of the strategy being used, the exchange, and the timeframe (like 1m or 5m).

The `signal` property provides the data associated with the position causing the drawdown. 

Crucially, a `backtest` flag tells you if this drawdown update comes from a historical simulation or a live trading environment, so you can handle it appropriately. 

This data is valuable for keeping track of risk, adjusting strategies, and protecting your capital.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed view of your live trading performance. It tracks various metrics derived from every trade event, from initial setup to final closure.

You’ll find a complete list of all events, including idle periods and trade actions, within the `eventList`.  It also gives you the total count of all events and just the closed trades. 

Key performance indicators like the number of winning and losing trades, win rate, and average profit per trade are readily available. You can monitor your overall profitability with the `totalPnl` and understand the consistency of your results with the `stdDev`. 

More advanced metrics such as Sharpe Ratio and annualized Sharpe Ratio allow for a more sophisticated evaluation of risk-adjusted returns.  The `certaintyRatio` helps gauge the relative strength of winning trades compared to losses, while `expectedYearlyReturns` provides an estimate of potential annual gains. Finally, metrics like `avgPeakPnl` and `avgFallPnl` offer insights into the highest and lowest points during each trade. Remember that any value flagged as "null" indicates an unsafe calculation.

## Interface InfoErrorNotification

This interface handles notifications about errors encountered during background processes. These aren't critical errors that halt everything – they're issues that can be handled and the system can continue running. Each notification has a specific type, a unique identifier, and a detailed error object containing a message that's easy to understand. The `backtest` property will always be false, indicating the error originated in a live trading environment, not a simulated backtest.

## Interface IWalkerStrategyResult

This interface describes the result you get when running a trading strategy within a larger comparison. 

It holds the name of the strategy that was tested.

You’ll also find detailed statistics about how the strategy performed, including key metrics.

A single number representing the strategy's score for comparison purposes is included, and if the strategy isn't valid for comparison, this value will be null.

Finally, it tells you the strategy's rank within the overall comparison – a lower number signifies a better rank.


## Interface IWalkerSchema

The Walker schema lets you define and manage A/B tests between different trading strategies. 

Think of it as setting up a controlled experiment to see which strategy performs best. 

Each walker represents a single test setup, and you give it a unique name and an optional note to help you remember what it's for.

It specifies which exchange and timeframe to use for all strategies within the test, as well as a list of the strategies you want to compare.

You can also choose a specific metric, like Sharpe Ratio, to optimize during the backtest. 

Finally, you have the option to provide callbacks for different stages of the walker's lifecycle, letting you customize its behavior.


## Interface IWalkerResults

The `IWalkerResults` interface holds all the information collected after a complete backtest run, comparing multiple strategies. 

It provides details about the specific asset, identified by `symbol`, that was tested.

You’ll also find the name of the `exchangeName` used for the trades and the `walkerName` which identifies the testing methodology employed.

Finally, the `frameName` tells you which timeframe was used for the backtest calculations.

## Interface IWalkerCallbacks

This interface lets you listen in on what's happening during the backtesting process when comparing different strategies. Think of it as a way to get notified at key milestones.

You'll receive a notification when a specific strategy begins testing, and another when that strategy’s testing is finished, providing statistics and a performance metric. 

If a strategy encounters an error during testing, you’ll be alerted to that as well. Finally, once all strategies have been tested, a final notification is sent with all the results compiled together. This allows you to track progress, log events, or perform custom actions based on the backtest's events.

## Interface ITrailingTakeCommitRow

This interface represents a specific type of action within a trading strategy—a "trailing take" action. It's used to queue up instructions for adjusting a trade based on a trailing stop-loss or take-profit order. 

When a trailing take action is triggered, it defines the percentage shift needed to update the stop or take price. It also remembers the price at which the trailing action was initially set, which is valuable for calculations and tracking. Essentially, it’s a way to specify how much the price should move before a trade's protective orders are adjusted.


## Interface ITrailingStopCommitRow

This interface represents a single action queued for a trailing stop order. It's essentially a record of a change related to a trailing stop, specifically detailing a shift in the percentage. 

The `action` property always identifies this as a "trailing-stop" action, helping to distinguish it from other types of actions. 

You'll find the `percentShift` indicates how much the percentage has changed, and `currentPrice` signifies the price level when the trailing stop was initially configured. Together, these pieces of information describe a precise update to a trailing stop's settings.

## Interface IStrategyTickResultWaiting

This describes a specific type of result you might get when a trading strategy is waiting for a signal to become active. It happens after a signal is initially created and the strategy is monitoring its conditions. 

Think of it as the strategy saying, "I have a plan (a signal) to trade, but the price hasn't reached the right level yet."

The result provides details like the strategy's name, the exchange being used, the timeframe of the data, the trading symbol, and the current price. Importantly, it also includes information about potential profit and loss, although this is currently theoretical as the trade hasn't actually happened. You'll notice that progress towards the take profit and stop loss are always zero at this stage, as the position doesn't exist yet. Finally, it tracks whether the event originates from a backtest or live trading environment.

## Interface IStrategyTickResultScheduled

This interface represents a specific kind of event within the trading framework – when a signal is generated and scheduled, meaning it's waiting for the price to reach a predetermined entry point. It’s triggered when the strategy decides to create a scheduled signal.

The information included provides context about the signal itself, including the signal details, the strategy and exchange it originated from, and the timeframe being used. You'll find details like the strategy's name, the exchange, the timeframe, the trading symbol, and the price at the time the signal was scheduled. 

Knowing whether the event occurred during a backtest or in live trading is also part of this data. Finally, a timestamp indicates when this scheduled signal was created.

## Interface IStrategyTickResultOpened

This interface describes a result indicating a new trading signal has been generated. It's specifically triggered after a signal has been validated and saved.

The result provides key details about the newly created signal, including its unique identifier, the name of the strategy that generated it, and the exchange and timeframe being used. 

You’ll also find the trading symbol involved (like "BTCUSDT"), the current price at the time the signal opened, and a flag indicating whether this event occurred during a backtest or a live trading session. A timestamp is also included, marking when the result was created, related to either the candle time in backtest or the execution time in live.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an "idle" state – meaning no trading signal is currently active. 

It provides information about the context of that idle state.

You'll find details like the strategy name, the exchange it's running on, and the timeframe being used.

It also records the symbol being traded (like BTCUSDT), the current price, whether the test is happening in backtest mode, and a timestamp of when this idle state was recorded. Essentially, it's a snapshot of the trading environment while nothing is actively being traded.

## Interface IStrategyTickResultClosed

This interface describes the information returned when a trading signal is closed, providing a comprehensive snapshot of what happened. It includes details like the reason for closure—whether it was due to a time expiry, a profit or loss target being hit, or a manual close. 

You'll find data on the signal itself, the closing price, and the profit/loss generated, complete with calculations for fees and slippage.  

The record also tracks key identifiers: the strategy's name, the exchange used, the timeframe of the data, and the trading symbol. You can also tell if the data represents a backtest or live trade.  

A unique close ID is available for manually closed signals, and a timestamp indicates when the result was initially created. Essentially, this interface offers a complete picture of a closed trading signal.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trade signal is cancelled. It's used to report when a signal was scheduled to trigger a trade but didn't ultimately lead to an open position, perhaps because it was cancelled or because the signal conditions weren't met before a stop-loss was hit.

The `action` property always confirms this is a 'cancelled' event.

You'll find details about the cancelled signal itself in the `signal` property, along with the price at the time of the cancellation (`currentPrice`) and the exact time the cancellation occurred (`closeTimestamp`).  The `strategyName`, `exchangeName`, `frameName`, and `symbol` provide context about which strategy, exchange, timeframe, and trading pair were involved.

The `backtest` flag indicates whether this cancellation happened during a backtest or a live trading session. The `reason` property tells you *why* the signal was cancelled, and `cancelId` provides a unique identifier if the cancellation was initiated by a manual cancellation request. The `createdAt` timestamp offers a record of when the result was generated.


## Interface IStrategyTickResultActive

This data represents a trading signal that's currently being monitored, essentially in a waiting state for a take profit, stop loss, or time expiration. It provides detailed information about the signal, including the signal itself and the trading instrument involved, like the symbol and exchange. You'll also find information for tracking purposes, like the strategy and frame name.

Key details like progress toward take profit and stop loss are included as percentages.

Crucially, it includes the unrealized profit and loss (PNL) for the position, accounting for fees and slippage. 

A flag indicates whether this data originates from a backtest or a live trading environment. The timestamps associated with the data track when it was created and the last candle processed, which is helpful for backtesting processes.

## Interface IStrategySchema

This schema describes the structure of a trading strategy you'll register within the backtest-kit framework. Think of it as a blueprint for how your strategy generates trading signals.

Each strategy needs a unique name to identify it within the system. You can also add a note to help document what the strategy does.

The `interval` property controls how frequently the strategy attempts to generate signals, preventing it from overwhelming the system.

The heart of the strategy is the `getSignal` function. It takes the symbol you're trading and a timestamp and returns a signal (or nothing if no signal is generated).  If you provide an "entry point," the strategy will wait for the price to reach that level before acting.

You have the option to define callbacks, like `onOpen` and `onClose`, to trigger specific actions at certain points in the strategy's lifecycle.

For more sophisticated risk management, you can assign a `riskName` or list of `riskList` identifiers to your strategy.

Finally, an optional list of `actions` can be associated with the strategy to link it to specific behaviors within the framework.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the important information about a single strategy run during a backtest. Think of it as a complete report card for each strategy you test.

It includes the strategy's name so you know which strategy the results belong to.

You'll also find a detailed set of statistics (`BacktestStatisticsModel`) summarizing how the strategy performed - things like profit, drawdown, and win rate.

Finally, it stores the value of the metric you're optimizing for, which helps rank strategies against each other.  If the strategy didn't generate any trades, the metric value will be null.

The `firstEventTime` and `lastEventTime` properties indicate when the first and last signals occurred, respectively, giving you a sense of the strategy's activity during the backtest. If no signals were generated, those values will be null.


## Interface IStrategyPnL

This data structure holds the results of a strategy's profit and loss calculation. It breaks down how much money you made or lost during a trade, considering both fees and slippage – that tiny difference between the expected price and the actual execution price.

You'll find the profit/loss expressed as a percentage, which makes comparing different strategies easier. 

The `priceOpen` and `priceClose` values show you the actual entry and exit prices after those fees and slippage adjustments have been applied.

The `pnlCost` represents the total profit or loss in US dollars, directly calculated from the percentage and the initial investment.  Finally, `pnlEntries` tells you the total amount of capital you initially put into the trade.

## Interface IStrategyCallbacks

This interface provides a way to hook into different stages of a trading strategy's lifecycle. You can use these callbacks to react to key events like when a new signal is opened, becomes active, or is closed. There are also callbacks for signals that are scheduled for later entry or cancelled before execution.

You'll get notified on every price tick with `onTick`, and specific callbacks cover signal states: `onOpen`, `onActive`, `onIdle`, `onClose`, `onSchedule`, and `onCancel`.

The `onWrite` callback helps when testing and persisting signal data.

Furthermore, the framework provides callbacks for specific profit/loss scenarios: `onPartialProfit`, `onPartialLoss`, and `onBreakeven`.

Finally, `onSchedulePing` and `onActivePing` offer a way to receive regular updates for scheduled and active signals, respectively, even outside of the normal strategy interval – useful for more advanced monitoring or adjustments.

## Interface IStrategy

The `IStrategy` interface defines the core methods that a trading strategy must implement. It's essentially a contract ensuring strategies behave consistently within the backtest framework.

Let's break down what each method does:

*   **`tick`**: This is the most important one – it’s called for every price update (tick) and handles the strategy's logic like checking for buy/sell signals and adjusting stop-loss/take-profit levels.
*   **`getPendingSignal` & `getScheduledSignal`**: These methods retrieve active signals for a symbol, helping monitor TP/SL and expiration times.
*   **`getBreakeven`**: Determines if the price has moved far enough to cover transaction costs, allowing for a potential breakeven trigger.
*   **`getStopped`**: Checks if the strategy is paused, preventing new ticks or signals.
*   **`getTotalPercentClosed` & `getTotalCostClosed`**: These methods provide insights into how much of the position has been closed, considering partial closes and DCA entries.
*   **`getPositionEffectivePrice`, `getPositionInvestedCount`, `getPositionInvestedCost`, `getPositionPnlPercent`, `getPositionPnlCost`**: These provide details about the position's entry price, number of entries, invested cost, and profit/loss.
*   **`getPositionEntries` & `getPositionPartials`**: These allow access to the history of entries and partial closes for analysis.
*   **`backtest`**: Executes a quick test of the strategy against historical price data.
*   **`stopStrategy`**:  Pauses the strategy without closing open positions - useful for a graceful shutdown.
*   **`cancelScheduled` & `activateScheduled`**: These control scheduled entries, either cancelling a pending one or forcing early activation.
*   **`closePending`**:  Closes the existing position without affecting other signals.
*   **`partialProfit` & `partialLoss`**: Allows closing a portion of the position at profit or loss levels.
*   **`trailingStop` & `validateTrailingStop`**: Adjusts the trailing stop-loss based on price movement.
*   **`trailingTake` & `validateTrailingTake`**: Adjusts the trailing take-profit target.
*   **`breakeven` & `validateBreakeven`**: Moves the stop-loss to breakeven point when the price has moved far enough.
*   **`averageBuy` & `validateAverageBuy`**: Allows for adding DCA (Dollar Cost Average) entries.
*   **`hasPendingSignal` & `hasScheduledSignal`**: Check for the presence of active signals.
*   **`getPositionEstimateMinutes` - `getPositionMaxDrawdownPnlCost`**: These methods provide detailed metrics about the position's performance and risk characteristics over its lifespan.
*   **`dispose`**: Cleans up the strategy's resources when it's no longer needed.



Essentially, `IStrategy` defines a blueprint for how trading strategies will interact with the backtesting environment.

## Interface IStorageUtils

This interface outlines the fundamental methods that any storage adapter used by the backtest-kit trading framework must provide. It essentially defines how the framework interacts with your chosen storage solution, whether that's a database, file system, or something else.

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods are called whenever a trading signal enters or exits these states – providing a way to record this information within your storage.

You can use the `findById` method to retrieve a specific signal based on its unique identifier, and the `list` method allows you to retrieve all signals currently stored.

The `handleActivePing` and `handleSchedulePing` methods are for keeping track of signals that have active or scheduled status, ensuring that their "last updated" timestamps remain accurate. These ping events trigger updates to the signals’ `updatedAt` field.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for a future action. 

It's quite simple – it mainly tells you that the signal's current state is "scheduled". Think of it as a flag indicating the signal is waiting to be executed at a specific time.


## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, likely in a trading or backtesting context. It’s straightforward – it just confirms that a signal is currently in an "opened" state. The single property, `status`, explicitly indicates this opened condition, providing a clear signal status. Essentially, it’s a marker to show that something is active and being tracked.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed, meaning it’s no longer active. It contains information specifically related to the signal's final performance.

The `status` property confirms that the signal is indeed in a closed state.

The `pnl` property holds the profit and loss data for that signal, detailing its financial outcome upon closure. This is where you’ll find the performance metrics for that particular trade.


## Interface IStorageSignalRowCancelled

This interface defines a signal record that represents a cancelled signal. It's a simple way to mark a signal as no longer active or valid. 

The `status` property is set to "cancelled," clearly indicating the signal's current state. This provides a straightforward mechanism for tracking signals that have been terminated or retracted.

## Interface IStorageSignalRowBase

This interface defines the fundamental properties shared by all signal storage rows, regardless of their specific status. It's designed to ensure that every stored signal has a record of when it was created and last updated. The `createdAt` and `updatedAt` properties store timestamps derived from the strategy tick results, providing valuable context about the signal’s lifecycle. Finally, `priority` dictates the order in which signals are processed when retrieved from storage, using the current timestamp as its value.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a method for determining optimal bet sizes. It essentially tells the backtest-kit how aggressively to size your trades.

The `method` property is fixed as "kelly-criterion" to confirm you're using this specific sizing approach. 

The `kellyMultiplier` controls how much of the Kelly Criterion to apply; a smaller multiplier (like the default of 0.25) is more conservative, while a larger multiplier takes on more risk. It's a value between 0 and 1.


## Interface ISizingSchemaFixedPercentage

This schema lets you size your trades based on a fixed percentage of your capital. You define a `riskPercentage`, which represents the maximum percentage of your portfolio you're willing to risk on each trade. For example, setting `riskPercentage` to 2 would mean that each trade risks 2% of your total capital. This provides a consistent approach to position sizing, ensuring your risk exposure remains relatively stable regardless of price fluctuations. This is a simple and straightforward sizing method, ideal for those wanting to maintain a predictable level of risk.


## Interface ISizingSchemaBase

This interface defines the basic structure for sizing strategies within the backtest-kit framework. Every sizing schema starts with a unique identifier, `sizingName`, for easy recognition. 

You can also add a descriptive `note` to explain how the sizing strategy works. 

To control risk, you can set limits on the position size using `maxPositionPercentage`, which specifies the maximum percentage of your account to use, and absolute limits using `minPositionSize` and `maxPositionSize`. 

Finally, the `callbacks` field allows you to hook into certain events within the sizing process, if needed, providing flexibility in how sizing is applied.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR) indicator. 

Essentially, it tells the backtest kit to calculate your position size based on a percentage of your capital you're willing to risk on each trade.  

The `riskPercentage` property determines that risk – for example, 1% would risk 1% of your total portfolio on each trade.  

The `atrMultiplier` then scales the stop-loss distance using the ATR value, helping to manage risk and account for market volatility. It's a key number that influences how much the stop-loss will be placed away from the entry price. 


## Interface ISizingParamsKelly

This interface defines a single order placed during a backtest or live trading scenario.

It details the specifics of each trade, including the `symbol` being traded (like "AAPL" or "BTC"), the `side` of the trade – whether it's a `buy` or a `sell`. The `quantity` specifies how much of the asset to trade, and the `price` represents the desired price for the order. Finally, the `timestamp` records when the order was generated.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to set up a sizing strategy that uses a fixed percentage of available capital for each trade. It requires a logger to help track and debug the sizing process. The logger allows you to see what’s happening behind the scenes and troubleshoot any issues with your sizing logic.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR).

It requires a logger to help with debugging and tracking what's happening during the backtesting process. This logger is your way to get informative messages about the sizing calculations. 


## Interface ISizingCallbacks

This section details the functions you can use to monitor and potentially influence how your trading system determines the size of each trade. Specifically, `onCalculate` lets you observe the calculated position size and the parameters used to determine it. Think of it as a hook to check if the sizing makes sense or to record what’s happening during size calculations. It's called right after the size has been computed.


## Interface ISizingCalculateParamsKelly

When determining the size of your trades using the Kelly Criterion, these parameters define the key information needed for the calculation. 

You’ll need to specify that you are using the "kelly-criterion" method.

Then, provide your win rate, which represents the proportion of winning trades, expressed as a number between 0 and 1. 

Finally, define the average win/loss ratio, representing the average profit earned for each losing trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate trade sizes using a fixed percentage approach. 

It requires you to specify the sizing method, which will always be "fixed-percentage". 

You’ll also need to provide a `priceStopLoss`, which represents the price level at which your stop-loss order will be triggered. This value is crucial for the sizing calculation.

## Interface ISizingCalculateParamsBase

This defines the foundational information needed to determine how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," representing the asset being traded. You'll also find the current account balance, which dictates the maximum amount available for trading, and the intended entry price for the trade, crucial for calculating potential profit or loss. These parameters provide the context for sizing decisions within the backtest-kit framework.

## Interface ISizingCalculateParamsATR

To calculate your trade sizes using an ATR-based approach, you'll need to provide these parameters. The `method` must be explicitly set to "atr-based" to indicate you're using this sizing technique. You’ll also need to specify the current Average True Range (ATR) value, which represents market volatility, to help determine an appropriate position size. This value is critical for correctly scaling your trades based on risk.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade – essentially, position sizing. It’s a core piece behind the scenes of how a trading strategy actually executes trades.

The `calculate` property is the key here. It's a function that takes information about the trade and your risk preferences (`ISizingCalculateParams`) and figures out the optimal size for the position. The result of this calculation, a number, represents the quantity to trade.


## Interface ISignalRow

This describes the structure of a signal record within the backtest-kit trading framework. Each signal, once validated, is represented by this `ISignalRow` object, containing a wealth of information about the trade. It includes a unique identifier (`id`) and details such as the cost, entry price, expected duration, and the specific strategy and exchange involved.

The record also tracks key performance metrics like profit and loss, using partial close history (`_partial`) to precisely calculate returns.  It incorporates dynamic price management through trailing stop-loss (`_trailingPriceStopLoss`) and trailing take-profit (`_trailingPriceTakeProfit`) mechanisms.

Furthermore, the record preserves a history of entries for dollar-cost averaging (`_entry`), and tracks peak and fall prices (`_peak`, `_fall`) to capture the best and worst price points throughout the position's life. Finally, a `timestamp` records when the signal was created or accessed, essential for both backtesting and live trading contexts.

## Interface ISignalDto

The ISignalDto represents a trading signal, the information needed to initiate a trade. It’s a data structure that holds all the details about a potential trade, like whether it's a long (buy) or short (sell) position.

Each signal includes a human-readable note explaining the reasoning behind the trade, the entry price, and target prices for both taking profit and setting a stop-loss.

You can optionally provide an ID for the signal, but if you don’t, one will be automatically generated.  

The `minuteEstimatedTime` field lets you specify how long the position should remain open before automatically expiring, although you can set it to infinity for indefinite duration.  A cost value is assigned to each entry.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that isn't acted upon immediately. It's like a signal on hold, waiting for the market price to reach a specific level, `priceOpen`. Think of it as a planned entry point.

Once the market price hits that `priceOpen` level, this scheduled signal transforms into a regular pending signal, ready to be executed. 

A key feature is the `priceOpen` property which defines the target price the signal is waiting for.

## Interface IScheduledSignalCancelRow

This interface defines a scheduled signal that includes a way to identify it for cancellation. It builds upon the existing `IScheduledSignalRow` structure, adding a `cancelId` property. This `cancelId` allows you to specifically request the cancellation of a particular scheduled signal that was initiated by a user action. Essentially, it provides a mechanism to track and manage user-driven signal cancellations.

## Interface IRunContext

The `IRunContext` object provides everything a function needs to operate within the backtest-kit framework. Think of it as a container holding both the strategic planning information – like which exchange, strategy, and data frame you're working with – and the real-time details of the simulation, such as the symbol being analyzed and the current timestamp.  It's a single point of access for all necessary information, and the system automatically handles distributing the different parts to the appropriate services for processing. This allows functions to be executed consistently regardless of where they're called from within the backtest process.


## Interface IRiskValidationPayload

This interface holds all the data needed when checking if a trading signal is safe to execute. 

It builds upon the information already provided in `IRiskCheckArgs` and adds details about the current market situation.

Specifically, you'll find the `currentSignal` itself, which includes things like the open price, along with the number of positions already held (`activePositionCount`). 

You also get a list of all the `activePositions`, offering a complete picture of what’s already in your portfolio.


## Interface IRiskValidationFn

This type defines a function used to validate risk parameters before a trading strategy is executed. Think of it as a gatekeeper ensuring your trading setup is sound. The function should either allow the trade to proceed (by returning nothing or null) or signal a problem (by returning an object detailing the rejection or by throwing an error, which will be handled). Essentially, it provides a way to catch potential issues with your risk configuration *before* any trades are made.


## Interface IRiskValidation

This interface helps you define how to check if a trading risk is acceptable. 

It's essentially a way to put rules and explanations around your risk assessments.

You'll provide a function – `validate` – that performs the actual risk check, receiving the risk parameters as input.

Alongside the function, you can add a `note` – a short description – to clarify why this specific risk check is important or how it works. This helps others (and your future self!) understand the reasoning behind your risk management strategies.


## Interface IRiskSignalRow

This interface, IRiskSignalRow, provides extra information needed for risk management purposes. It builds upon the existing SignalDto by adding details about the entry price, the initial stop-loss level, and the original take-profit target that were set when the trading signal was created. These properties – priceOpen, originalPriceStopLoss, and originalPriceTakeProfit – are essential for validating risk parameters and ensuring proper risk control throughout the backtesting process. Essentially, it gives you access to the original pricing details tied to a particular trading signal.

## Interface IRiskSchema

The `IRiskSchema` interface describes how to set up risk controls for your trading portfolio. Think of it as a way to define rules that your trading system needs to follow. 

Each risk control is given a unique name to identify it. 

You can add a note to describe the purpose of the risk control for clarity.

You can also hook into different stages of the risk control process with callbacks, such as when a trade is initially rejected or when it’s ultimately approved.

The most important part is the `validations` array. This is where you define the actual checks – the logic that determines whether a trade should be allowed or not, using custom validation functions.

## Interface IRiskRejectionResult

This interface represents the result when a risk validation check fails. It provides information to help understand why the validation didn’t pass.  Each rejection has a unique identifier (`id`) to track it specifically.  Alongside the ID, a descriptive `note` explains the reason for the rejection in plain language, aiding in debugging and resolving the issue.

## Interface IRiskParams

The `IRiskParams` object defines the core configuration for managing risk in your trading system. It bundles together essential pieces of information like the exchange you're interacting with (e.g., Binance), a logger for troubleshooting, and details about the current trading environment – whether it's a backtest or live trading session. 

It also provides a mechanism to respond to rejected trading signals. When a trading signal is blocked due to risk constraints, the `onRejected` callback gets triggered, allowing you to record or react to this event before the system takes further action. Think of it as a notification that a trade didn’t happen due to risk checks.


## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the data needed to determine if a new trade should be allowed. Think of it as a safety check performed *before* a trading signal is actually executed. It’s used by your trading strategy to assess whether conditions are suitable for opening a position, ensuring your system operates within defined risk parameters.

The data includes information like the trading pair (`symbol`), the signal being considered (`currentSignal`), the name of the strategy initiating the request (`strategyName`), and details about the exchange and risk management setup.  You’ll also find the current price of the asset and a timestamp for reference. Essentially, it’s a snapshot of the context surrounding a potential trade, allowing you to implement custom risk checks.


## Interface IRiskCallbacks

This interface defines callbacks that allow you to react to risk management decisions within your trading system. 

Essentially, you can register functions to be notified when a trading signal is blocked because it exceeds predefined risk limits (the `onRejected` callback). 

Alternatively, you can use the `onAllowed` callback to be informed when a signal successfully passes all risk checks and is approved for execution. These callbacks provide a way to monitor and potentially adjust your risk parameters based on real-time trading conditions.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, describes a single trading position that's being monitored for risk assessment. It holds all the key details about a position, like the name of the strategy that created it, the exchange it's on, and the trading pair involved. You'll find information about whether it's a long or short position, the entry price, and any stop-loss or take-profit levels that are in place. 

It also keeps track of how long the position is expected to last and the precise moment it was opened. Think of it as a snapshot of a live trade, packaged for risk management purposes.


## Interface IRisk

This interface, `IRisk`, helps manage the risk involved in trading. It allows you to verify if a trading signal aligns with your pre-defined risk parameters.

You can use `checkSignal` to determine if a signal is permissible based on your risk limits, returning a promise indicating whether it's allowed.

To keep track of active trades, `addSignal` registers new positions, recording details like direction (long or short), entry price, stop-loss and take-profit levels, and estimated execution time.

Conversely, `removeSignal` lets you remove a position from the system when it's closed, ensuring your risk tracking remains accurate.


## Interface IReportTarget

This interface lets you finely control what kinds of data are logged during your backtesting and live trading sessions. Think of it as a way to turn on or off specific reporting features.

Each property represents a different type of event or data point – for example, strategy commits, risk rejections, or breakeven points. 

You can enable or disable these reports individually to focus on the data most important for your analysis and to manage the volume of logged information. 

It provides granular control over what gets recorded, enabling you to optimize both your insights and performance.

## Interface IReportDumpOptions

This interface helps you control what data gets written to your reports during backtesting. Think of it as a way to specify exactly which trading symbol, strategy, exchange, timeframe, and signal you're interested in analyzing.  You can use these properties to filter your reports and focus on specific areas of your backtest results, making it easier to understand performance. The walker name identifies the optimization run you're looking at, crucial when testing different parameter sets.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share information about a trading signal with users, especially regarding stop-loss and take-profit levels. It builds upon a base signal row and adds key details about the initial stop-loss and take-profit prices that were set when the signal was first created.

Even if those stop-loss and take-profit levels are adjusted later, perhaps through a trailing strategy, these original values are preserved and displayed. This transparency is helpful for users to understand how the trade was initially set up and how it has evolved.

Beyond the original prices, the interface also includes information about the trade's cost, the percentage that has been partially executed, how many times the position has been averaged, the number of partial closes performed, the original entry price, and the current unrealized profit and loss. Essentially, it's a comprehensive snapshot of the trade's status, designed for clear communication and reporting.

## Interface IPublicCandleData

This interface describes a single candlestick, a common way to represent price data over time. Each candlestick contains key information like when it began (timestamp), the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trades that occurred. Think of it as a snapshot of price activity – useful for analyzing trends and making decisions. The timestamp is in milliseconds since the Unix epoch.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It focuses on the core values required for the calculation. 

You'll need to provide a `winRate`, which represents the probability of a winning trade, expressed as a number between 0 and 1. Also essential is the `winLossRatio`, this describes the average profit you make on a winning trade compared to the average loss on a losing trade. Together, these values help determine the optimal amount of capital to risk on each trade to maximize long-term growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your capital for each trade, with a stop-loss price. You'll specify a `priceStopLoss` value, which represents the price at which your stop-loss order will be triggered, helping to manage potential losses. This parameter is crucial for defining risk management rules within the strategy.

## Interface IPositionSizeATRParams

This section defines the parameters used when calculating position size based on the Average True Range (ATR). The `atr` property simply represents the current ATR value being used in the calculation. This value essentially reflects the volatility of the asset being traded.

## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA). Think of it as setting a "buffer zone" around each DCA price.

`upperPercent` controls how much higher than each DCA price we consider an overlap—a percentage above the level where a new position is flagged. 

`lowerPercent` similarly dictates how much lower than each DCA price triggers an overlap alert—a percentage below the level.

By adjusting these percentages, you can fine-tune the sensitivity of your overlap detection, balancing between catching potential issues and avoiding false positives.

## Interface IPersistBase

This interface outlines the basic operations needed for any system that wants to store and retrieve data, like entity information. Think of it as a contract – if you're building a custom storage solution, you’ll need to make sure it can perform these five actions: initialize, read, check for existence, write, and list all the keys. 

The `waitForInit` method handles setup, ensuring things are ready before you start working with the data.  `readValue` is for pulling data back, while `hasValue` quickly checks if something is there to begin with. `writeValue` is how you save data, and it's designed to do so safely. Finally, `keys` gives you a way to get a list of everything that's stored, sorted in a predictable order, which is useful for checks and looping through data.


## Interface IPartialProfitCommitRow

This object represents a request to take a partial profit on a trade. It's used internally when the backtest kit is executing a trading strategy.

The `action` property confirms this is a partial profit instruction.

`percentToClose` tells the system what portion of the position to close – a number representing the percentage.

`currentPrice` records the price at which the partial profit was actually taken, which is important for accurate backtesting results.

## Interface IPartialLossCommitRow

This object represents a request to partially close a trading position. Think of it as a message queued up to execute a portion of your holdings.

It tells the system you want to close a specific percentage of your current position, and it records the price at which that partial closure actually happened. 

The `action` property confirms this is a partial loss request. The `percentToClose` indicates how much of the position should be closed (e.g., 50 for 50%). `currentPrice` captures the price used when completing that partial closure.


## Interface IPartialData

IPartialData holds a snapshot of some trading information that can be saved and restored. Think of it as a simplified version of the full trading state. 

It’s designed to be easily stored, for example, in a database, and later loaded back into the system.

Specifically, it keeps track of the profit and loss levels that have been hit during a trade. These levels are represented as arrays, because some storage systems work better with arrays instead of sets.


## Interface IPartial

The `IPartial` interface helps track how profitable or loss-making a trading signal is. It's used by components that monitor signals and need to know when milestones like 10%, 20%, or 30% profit/loss are hit.

The `profit` method handles scenarios where a signal is making money. It figures out which profit levels have been achieved and announces them.  The `loss` method does a similar job, but for when signals are experiencing losses.

Finally, when a signal finishes – perhaps due to a stop-loss, take-profit, or time expiry – the `clear` method cleans up the related data, removing it from the system's memory and saving the changes. This ensures that old signal data doesn’t clutter the system.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of processing command-line arguments. It essentially combines your initial input parameters with additional flags that determine the trading environment.

You'll see properties indicating whether the system should operate in backtest mode – simulating trades using historical data – paper trading mode – a simulated environment using live data – or live trading mode – real-time trading with actual funds.

These flags directly influence how your trading strategy is executed and the data it interacts with.


## Interface IParseArgsParams

This interface outlines the essential information needed to run a trading strategy. Think of it as a blueprint for telling the system what to do - specifying which cryptocurrency pair to trade (like BTCUSDT), which specific strategy you want to use, which exchange to connect to (like Binance or Bybit), and the timeframe for analyzing price data (such as 15-minute candles).  It provides default values for these key settings, helping to streamline the process of starting a backtest.


## Interface IOrderBookData

The `IOrderBookData` interface defines the structure for representing order book information. It holds the symbol of the trading pair, along with lists of bids and asks. Each bid represents a buy order, while each ask represents a sell order. This data structure provides a snapshot of the current market depth for a specific asset.

## Interface INotificationUtils

This interface, `INotificationUtils`, provides a standard way for different systems to be notified about events happening during a backtest or live trading. Think of it as a central communication hub for important updates.

It defines a set of methods for responding to various signals and events: trades being opened or closed, partial profit or loss opportunities arising, strategies being adjusted, and synchronization events. It also provides ways to handle different types of errors, from simple mistakes to critical system failures.

You can retrieve a list of all notifications that have been recorded, and when you're finished, you can clear the notification history. Essentially, any component interacting with the backtest-kit needs to implement this interface to ensure consistent and reliable communication of significant events.

## Interface IMethodContext

The `IMethodContext` interface is like a little package of information that travels around within the backtest-kit framework. Think of it as a way to keep track of which specific versions of your trading strategy, exchange, and data frame are being used in a particular test run. It holds the names of these versions, allowing the system to automatically load the right components – ensuring everything works together correctly. The `frameName` property is especially important; when it's empty, it signifies you're running in a live, non-historical environment.

## Interface IMemoryInstance

This interface outlines how different memory storage systems should behave within the backtest-kit framework. Think of it as a common blueprint for memory, whether it’s held in local storage, saved persistently, or just used for testing purposes.

It provides core functionalities for interacting with memory:

*   Initialization: A `waitForInit` method allows you to ensure the memory is ready before starting any operations.
*   Writing:  You can use `writeMemory` to store new data, associating it with an ID and a helpful description.
*   Searching: `searchMemory` lets you find data based on keywords, ranking results using a sophisticated scoring system.
*   Listing:  `listMemory` provides a way to view all the data currently stored.
*   Reading:  `readMemory` retrieves a specific piece of data by its unique ID.
*   Deletion:  `removeMemory` allows you to delete data.
*   Cleanup:  The `dispose` method is used to release any resources used by the memory system.

## Interface IMarkdownTarget

This interface lets you fine-tune the reporting features within the backtest-kit framework. Think of it as a way to pick and choose exactly what details you want to see in your markdown reports. 

You can turn on or off specific reports like those detailing strategy signals (entry and exit), risk rejections, breakeven points, partial profits, portfolio heatmaps, strategy comparisons, performance bottlenecks, scheduled signals, live trading events, comprehensive backtest results, signal lifecycle events, or milestone tracking for the highest profit and maximum drawdown. Enabling the right reports helps you gain a deeper understanding of your trading system's behavior and identify areas for improvement. Essentially, it provides granular control over the level of detail in your reports.

## Interface IMarkdownDumpOptions

This interface defines the options you can use when exporting data to Markdown, particularly for things like backtesting results. Think of it as a structured way to specify exactly which data you want to see and where you want it saved. Each property represents a piece of information about the data source, such as the directory path, the filename, the trading symbol (like BTCUSDT), the name of the strategy used, the exchange platform, the timeframe, and a unique identifier for the signal generated. It allows you to pinpoint and organize specific backtest information for documentation or analysis.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s essentially a standard way to record messages about events, data, and potential issues.

You can use it to leave notes about things like agent actions, connection status, successful validations, and anything else you might want to track.

There are different levels of logging available – `log` for general events, `debug` for very detailed information helpful in development, `info` for informational updates, and `warn` for situations that aren't critical but deserve a second look.

This logging system helps you understand how the system works, identify problems, and keep a record of what's happening.


## Interface ILogEntry

Each log entry, which is part of the history of your backtest, has a unique identifier and a level indicating its importance—log, debug, info, or warn.  These entries are also stamped with several timestamps, including when they were created and the current Unix time, to help with organization and rotation. To help you understand where the log came from, you'll find optional details about the method and execution environment attached to each log entry.  Finally, any extra arguments you passed when creating the log will also be included.

## Interface ILog

The `ILog` interface provides a way to keep track of what's happening during your backtesting or trading simulations. It's essentially a more detailed logging system.

You can use `getList` to retrieve a complete record of all the logs that have been saved, allowing you to review the sequence of events and understand how decisions were made. This is incredibly useful for debugging, analyzing performance, or simply understanding the rationale behind trades.

## Interface IHeatmapRow

This interface represents a row of data within a heatmap visualization, specifically focusing on the performance of a single trading symbol like BTCUSDT. It bundles together a range of key metrics to give you a quick overview of how different trading strategies have performed on that symbol. You'll find essential figures like total profit or loss, a Sharpe Ratio indicating risk-adjusted return, and the maximum drawdown to understand potential downside.

The data also breaks down trade performance with the total number of trades, wins, losses, and the calculated win rate. You’ll also see average profit and loss per trade, along with measures of volatility like standard deviation.

Further details provide insights into factors like profit factor, average winning and losing trade sizes, and streaks of consecutive wins or losses. Finally, it includes average peak and fall PNL percentages, providing a more nuanced view of trade success and recovery.


## Interface IFrameSchema

The `IFrameSchema` defines a reusable building block for backtesting, specifying the time period and frequency of data used. Each schema has a unique name to identify it, and you can add a note to describe its purpose. It dictates when your backtest starts and ends, and how often data points are generated within that timeframe – for example, daily or hourly. You can also provide optional callbacks to be executed at different stages of the frame's lifecycle. 

Think of it as setting up the foundation for your backtest, controlling the flow of data and defining the scope of your analysis.


## Interface IFrameParams

The `IFramesParams` object holds the configuration needed to set up a frame within the backtest-kit framework. It's designed to allow you to inject specific settings and a logging mechanism for monitoring and debugging your trading strategies. Primarily, it includes a `logger` – this is a tool to help you track what's happening inside your frame as it's running, allowing you to pinpoint issues or understand behavior more clearly. Think of it as a way to add detailed notes to your code's execution.


## Interface IFrameCallbacks

This function is called whenever the timeframe array is created, giving you a chance to examine or log the resulting dates. It passes in the array of dates for the timeframe, the start and end dates used for generation, and the interval used (like daily, weekly, etc.). You can use this to verify that the timeframes are what you expect or to perform any necessary calculations based on them. It’s your opportunity to react to the creation of the timeframe data.


## Interface IFrame

The `IFrames` interface is a core component, working behind the scenes to manage the timing of your backtest. Think of it as the system responsible for creating the schedule of events your trading strategy will be evaluated against.

Its main function, `getTimeframe`, allows you to request a specific set of dates and times for a particular trading symbol and timeframe (like daily, weekly, or monthly data). This method returns an array of these timestamps, which will then be used to drive the backtest process, ensuring your strategy is tested on a consistent time interval. Essentially, it provides the sequence of moments in time your strategy will be simulated on.


## Interface IExecutionContext

The `IExecutionContext` object provides essential information to your trading strategies and exchange interactions during execution. Think of it as a package of runtime details that's automatically passed around. It tells your code *what* trading pair is involved, *when* the current operation is happening in time, and crucially, *whether* it's running in a backtesting simulation or a live trading environment. This object helps ensure your strategies operate correctly and have the context they need to make decisions.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. It's used to register an exchange and tells the system where to find data like price candles, order books, and trades.

Each exchange needs a unique identifier, and you can add a note for your own reference.

The core function, `getCandles`, is responsible for retrieving historical price data.  You'll also define how to format trade quantities and prices to match the exchange's rules; otherwise, it falls back to a Bitcoin-based default.

Fetching order book and aggregated trades are optional; if you don't provide them, the system will indicate you need to.

Finally, there's a place for optional callbacks to handle events during data retrieval.


## Interface IExchangeParams

This interface defines the configuration needed to connect to a cryptocurrency exchange within the backtest-kit framework. Think of it as a blueprint for how the framework interacts with a specific exchange.

It's essential to provide all the methods listed here when setting up an exchange connection; default values are applied if you don't specify certain details.

The `logger` property allows for debugging and monitoring, while `execution` provides contextual information like the trading symbol, timestamp, and whether it's a backtest run.

Crucially, you'll need to provide functions to retrieve historical candle data (`getCandles`), format trade quantities and prices to meet the exchange’s requirements (`formatQuantity`, `formatPrice`), fetch order book data (`getOrderBook`), and retrieve aggregated trade information (`getAggregatedTrades`). Each of these functions is responsible for interacting with the exchange’s API.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you define functions that your backtest kit can use to react to specific events happening with your data feed. 

One key function you can provide is `onCandleData`. This is called whenever the framework retrieves candle data for a particular trading symbol and time interval. You can use this callback to process or log this data as it becomes available. It receives the symbol, the interval (like 1 minute or 1 hour), the `since` timestamp for the data, the `limit` requested, and the actual candle data.

## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with a specific cryptocurrency exchange. It provides methods for retrieving historical and future price data (candles) which is crucial for simulating trading strategies. You can request candles from a specific time range, and the system ensures that you don't peek into the future, preventing biased backtest results.

The interface also allows you to format order quantities and prices to match the exchange’s specific rules.

It can calculate the Volume Weighted Average Price (VWAP) based on recent trading activity. You can also access order book data and aggregated trade information for a given trading pair. Finally, there’s a way to fetch raw candle data with much more flexibility in defining the date range and quantity of candles you need.


## Interface IEntity

This interface, IEntity, serves as the foundation for all objects that are saved and retrieved from storage within the system. Think of it as the common blueprint ensuring all persistent data structures have a unique identifier. Every entity you create will inherit from this, guaranteeing consistency in how they're managed. It primarily establishes the expectation of an `id` property.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save different kinds of data related to a backtesting run. Think of it as a way to capture snapshots of information at specific points during the process.

You can use it to record entire conversations between agents, store simple key-value pairs, save data organized as a table with multiple columns, or preserve plain text outputs.  It also lets you log error messages and even dump complex JSON objects in a readable format.

The `dispose` method is crucial for cleaning up after the backtest is complete and freeing any resources that the dumping instance was using. Each dump instance is tied to a specific signal and a bucket name, and it handles storing data associated with a given `dumpId`.

## Interface IDumpContext

This interface defines the information needed to identify a specific data dump within the backtest-kit framework. Think of it as a way to tag and organize your data points for later analysis. Each dump gets a unique signal identifier, a bucket name (often reflecting the strategy or agent generating the data), a unique ID, and a descriptive label to make it easier to understand what the data represents. This context helps keep your data organized and searchable.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as a foundation for events related to committing data, especially when you need to delay those commitments until the environment is ready. It defines essential information about each commit, including the `symbol` which is the trading pair involved (like BTC-USDT) and a boolean `backtest` flag indicating whether the process is a simulation or live trading. Think of it as a standardized way to represent a commit event, ensuring consistent data is available when it's finally processed.


## Interface ICheckCandlesParams

This interface defines the information needed to check the validity of your historical candle data. Think of it as a set of instructions telling the system where to look for candle data, which trading pair you're interested in, and over what time period. 

You'll provide the symbol like "BTCUSDT", the name of the exchange providing the data, and the timeframe of the candles you're using, such as "1m" for one-minute candles or "4h" for four-hour candles. 

You also need to specify a start and end date to define the range of candles being checked. Finally, there’s a setting for where the system looks for your stored candle data, though there’s a default location if you don’t specify it.

## Interface ICandleData

This interface defines the structure for a single candlestick, representing a snapshot of price and volume data over a specific time interval. Each candlestick contains essential information like the time it began (timestamp), the opening price, the highest and lowest prices reached, the closing price, and the total volume traded during that period. Think of it as a standardized way to represent a bar of data on a price chart, useful for things like calculating moving averages or running simulations of trading strategies. It's a fundamental building block for analyzing historical market data.

## Interface ICacheCandlesParams

This interface defines the information needed to prepare historical candle data for backtesting. Think of it as a recipe for downloading the past price action of a specific trading pair. You'll specify the symbol like "BTCUSDT," the exchange providing the data, the timeframe (like 1-minute or 4-hour candles), and the start and end dates for the data you want to retrieve. By providing these details, the system knows exactly which candles to fetch and store for later use in your backtest.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework interacts with a live brokerage or exchange. Think of it as the bridge between your trading strategies and the real market.

Before anything happens in the live trading environment, `waitForInit` lets you set things up – connect to the exchange, load your API keys, and so on.

The framework then calls specific methods to handle different trading actions. For example, `onSignalCloseCommit` is called when a trade is closed, `onSignalOpenCommit` when a new trade is opened, and methods like `onPartialProfitCommit` and `onPartialLossCommit` handle partial profit or loss adjustments. Similar calls exist for trailing stops, trailing take-profit orders, breakeven stops, and average-buy (DCA) entries.

Importantly, these calls always happen *before* any changes are made to the trading state. If something goes wrong in your broker adapter's implementation of these functions, the framework's internal state remains untouched. 

During backtesting, this entire interface is skipped – the framework doesn't send any requests to your broker adapter, allowing it to run without actually executing any trades.

## Interface IBreakevenData

This interface, IBreakevenData, holds the essential information about whether a breakeven point has been achieved for a particular trading signal. It’s designed to be easily saved and loaded, which is crucial for preserving trading progress.  Think of it as a simplified snapshot of the more complex breakeven state.

Specifically, it only contains one piece of information: a boolean value indicating if breakeven has been reached. This makes it perfect for storing in formats like JSON. 

It’s used within the backtest-kit framework to track and persist breakeven status across sessions.


## Interface IBreakevenCommitRow

This record represents a notification that a breakeven calculation has been performed. It’s essentially a message informing your system that a breakeven point has been determined. 

The `action` property always indicates "breakeven," confirming the type of event.  The `currentPrice` tells you the price level where the breakeven was calculated – it’s the price in effect when that calculation ran.

## Interface IBreakeven

The `IBreakeven` interface manages the tracking of when a trade's stop-loss should be moved to the entry price, essentially aiming to protect profits. 

It works by periodically checking if a trade has moved favorably enough to cover any transaction costs, and if so, it declares that breakeven has been reached.

When breakeven is triggered, a notification is sent, and the state of that event is saved.

Conversely, when a trade is closed, this interface handles clearing the breakeven state, ensuring that it doesn’t interfere with future trades.


## Interface IBidData

This interface represents a single bid or ask price point within an order book. Each bid or ask is described by two key pieces of information: the price at which the order is placed, and the quantity of the asset available at that price. Both price and quantity are stored as strings.

This represents an order to be placed, containing details like the trading symbol, whether it's a buy or sell order, the price per unit, the quantity of units, and a unique identifier for the order. All data fields are strings.

This interface describes a ticker, which includes the trading symbol, the current bid and ask prices and quantities, the last traded price and quantity, and the total volume bid and asked. It provides a snapshot of market activity for a given symbol.

This interface defines the structure of data used during a backtest.  It holds arrays of trades and orders, allowing the backtest to simulate market activity and track order execution.

The `BacktestKit` class is the core component for running backtests. You can configure it with settings like the trading symbol and initial account balance, add data feeds to simulate market data, and set a trading strategy to execute trades. It provides the `run` method to start the backtest, and `addFeed` to incorporate data.

This interface holds the configuration settings for a backtest, specifying details like the trading symbol, the starting account balance, and any trading fees to be applied.

This interface outlines the structure for a trading strategy. Strategies must provide a name and implement a `run` method that reacts to incoming market data (a `Ticker` object) by generating trading decisions.

This type describes the output of a trading strategy’s decision-making process. It specifies the desired order to be placed – including its direction (buy or sell) and quantity - along with a unique order identifier. The quantity is represented as a string.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. It describes a commitment to buy a certain amount of an asset at a specific price.

Each `IAverageBuyCommitRow` tells the backtest engine how much to buy and at what price, contributing to a larger, automated purchase over time. 

The `currentPrice` indicates the price at which the latest buy order was executed.  The `cost` represents the USD value of that purchase. Finally, `totalEntries` tracks the cumulative number of buy entries accumulated so far within the strategy, which is useful for calculating averages and tracking progress.


## Interface IAggregatedTradeData

This data structure holds information about a single trade that happened. It's designed to help you analyze trading activity in detail, especially when backtesting strategies. 

Each trade record includes the price at which it took place, the quantity of assets involved, and the exact time the trade occurred. You'll also find a flag indicating whether the buyer or seller initiated the trade – this helps understand the trade's direction.

Here's what each part represents:

*   **id:** A unique code to identify this specific trade.
*   **price:** The price paid for the assets.
*   **qty:** How many assets were traded.
*   **timestamp:**  The date and time of the trade, recorded in milliseconds since January 1, 1970.
*   **isBuyerMaker:**  A true/false value showing if the buyer placed the initial order.

## Interface IActivateScheduledCommitRow

This interface describes a message used to trigger the activation of a scheduled commit within the backtest-kit framework. Essentially, it's a notification that a pre-defined action needs to happen at a specific time during the backtest. The `action` property always indicates that this is an "activate-scheduled" event. You'll also find the `signalId`, which identifies the signal that's being activated, and an optional `activateId` that can be used to specify a user-initiated activation.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current signal state. Think of it as a read-only window into what the trading strategy is anticipating. 

It's particularly useful for things like deciding whether to adjust stop losses or take profits, or when to ping the system. 

The interface provides two key checks:

*   `hasPendingSignal`: This method tells you if there’s an existing order or signal waiting for execution for a specific symbol.
*   `hasScheduledSignal`:  This method tells you if a signal is scheduled to happen in the future.

Essentially, it ensures that actions are only triggered when they're appropriate given the trading strategy's current expectations.

## Interface IActionSchema

The `IActionSchema` defines how custom event handlers, called "actions," are integrated into your backtesting strategies. Think of actions as a way to hook into the strategy's execution flow at specific points.

They're useful for things like managing state with tools like Redux, tracking performance through logging, sending notifications, or triggering custom business logic based on events.

Each action is created fresh for every strategy run and receives all the data generated during that run. You can add multiple actions to a single strategy, allowing for a variety of extensions and monitoring capabilities.

The `actionName` property gives each action a unique identifier, making it easy to manage and register them. A `note` allows you to add documentation for clarity.

The `handler` specifies how the action is implemented – it’s either a constructor for your custom class or a subset of pre-defined functions you can implement directly. Finally, `callbacks` lets you define specific lifecycle events where your action should be invoked, providing even more granular control.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to function within the backtest-kit framework. Think of it as a package of essential tools and context for your trading logic. 

It includes a `logger` to help you track what your action is doing and diagnose any issues. You'll also find details about the strategy and timeframe it belongs to, like its name and the timeframe being used (e.g., 1 minute, 1 hour).

Knowing whether it’s running a backtest is crucial, and `IActionParams` provides that information too. Finally, it provides a `strategy` object, giving your action direct access to important information like the current trading signal and any existing positions.


## Interface IActionCallbacks

This interface provides a way to hook into various stages of an action handler's lifecycle, allowing you to add custom logic for things like resource management, monitoring, and state persistence. Think of these callbacks as event listeners for different moments in the trading process.

You can use `onInit` to set things up when the handler starts, such as connecting to a database or loading initial data. Conversely, `onDispose` lets you clean up resources when the handler is done, like closing connections or saving state.

There's also a suite of callbacks related to signal events, with `onSignal` providing a general way to react to signals whether you're live or backtesting. `onSignalLive` and `onSignalBacktest` give you more targeted responses to live trading and backtest scenarios, respectively.

Beyond simple signal handling, callbacks like `onBreakevenAvailable`, `onPartialProfitAvailable`, and `onPartialLossAvailable` enable you to react to specific profit and loss thresholds.

For monitoring and ensuring things are running smoothly, `onPingScheduled` and `onPingActive` are triggered during signal monitoring, and `onRiskRejection` notifies you when a signal is blocked by risk management.

Finally, `onSignalSync` gives you a unique opportunity to intervene when the framework is trying to execute a trade using a limit order.  This callback is special; errors aren’t swallowed, so throwing an error will reject the trade, causing it to be retried later.

## Interface IAction

The `IAction` interface is your central point for connecting your custom logic to the backtest-kit framework. Think of it as a set of hooks that let you react to different events happening during a trading simulation or live trading. You can use these hooks to do things like log actions, update a dashboard, or even feed data into a third-party analytics system.

It provides several methods, each responding to a specific type of event. For example, the `signal` method is triggered every time the strategy produces a signal, whether you're backtesting or trading live. There are separate methods – `signalLive` and `signalBacktest` – to handle live and backtest signals independently.

Other methods handle specialized events like breakeven adjustments, partial profit/loss events, scheduled ping notifications, and risk rejections. The `signalSync` method lets you control how the framework attempts to execute trades via limit orders, offering a chance to reject and retry those attempts. Finally, the `dispose` method is critical for cleaning up resources and ensuring a smooth shutdown of your custom logic when it's no longer needed. Essentially, `IAction` empowers you to build your own custom extensions within the framework’s operation.

## Interface HighestProfitStatisticsModel

This model holds information about the most profitable events recorded during a trading backtest. Think of it as a summary of when your strategy made the most money. 

It includes a complete, ordered list of those high-profit events, showing them from the most recent to the oldest.  You can also see the total number of high-profit events that were tracked.

## Interface HighestProfitEvent

This object represents the single most profitable moment achieved during a trading position. It stores key details about that peak performance, helping you understand what contributed to it. 

You'll find information like the exact time (timestamp) it happened, which asset (symbol) was involved, and the name of the strategy that generated the trade. The position direction – whether it was a long or short trade – is also recorded.

Crucially, it includes the unrealized profit and loss (PNL) at the time, the price at which the record was reached, and the take profit and stop loss levels that were in place.  Finally, a flag indicates whether this record occurred during a backtesting simulation or live trading.

## Interface HighestProfitContract

This data structure represents notifications when a trading strategy reaches a new peak profit level. It provides details like the trading symbol involved (e.g., "BTC/USDT"), the current price, and the exact time the profit milestone was achieved. You'll also find information about the strategy's name, the exchange being used, the timeframe (like "1m" or "5m"), and the signal that triggered the trade. Importantly, it includes a flag indicating whether this update comes from a backtest simulation or live trading, allowing you to adjust your response accordingly. This information can be used to trigger actions such as setting trailing stops or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds the overall performance statistics for your entire portfolio, giving you a high-level view of how your investments are doing. It breaks down key metrics like the total number of symbols you're tracking and the overall profit and loss (PNL) for the whole portfolio. 

You'll find essential ratios like the Sharpe Ratio, which measures risk-adjusted return, and the total number of trades executed. The `symbols` property contains a detailed list of statistics for each individual asset within your portfolio. Finally, it presents average peak and fall PNL values, weighted by the number of trades, allowing you to gauge the typical best and worst performance experiences across your holdings.

## Interface DoneContract

This interface defines what information is provided when a background process, whether it's a backtest or a live execution, finishes running. You’ll get details like the exchange used, the name of the strategy that ran, and whether it was a backtest or live execution. It also includes the trading symbol involved and the frame name, which is empty when running live. Essentially, it gives you a snapshot of the completed task's context.

## Interface CriticalErrorNotification

This notification signals a severe, unrecoverable error that requires the trading process to stop immediately. It's a way for the system to tell you something went fundamentally wrong and needs attention. Each notification has a unique identifier, a descriptive message to help you understand the problem, and detailed information about the error itself, including a stack trace. Importantly, these notifications originate from the live trading environment, so the `backtest` flag will always be false.

## Interface ColumnModel

This defines how your data is presented in a table. Think of it as a blueprint for each column, telling the system what information to display and how to format it.  Each column needs a unique `key` to identify it, and a `label` that users will see as the column header.  You can use the `format` function to transform your data into a readable string – for example, converting a date or number. Finally, `isVisible` lets you conditionally hide or show a column based on certain conditions.

## Interface ClosePendingCommitNotification

This notification lets you know when a pending trade signal has been closed before it actually became an active position. It's useful for understanding why a signal didn't fully execute, perhaps due to adjustments or external factors. The notification provides a lot of details about the signal – its unique ID, the trading symbol, the strategy that generated it, and where it was executed. 

You'll find information about the signal’s financial performance, like profit/loss (both in percentage and absolute terms), as well as the entry and exit prices used for that calculation. The notification also includes specifics like the number of entries and partial closes that were involved, along with the original entry price and the total capital invested. It also tells you when the signal was created, its unique identifiers, and whether it originated from a backtest or live trading environment.

## Interface ClosePendingCommit

This event signals that a previously opened position is being closed. It's essentially a confirmation that a trade is wrapping up.

You can optionally include a `closeId` to provide more context, like a reason for the closure, which is useful for tracking and analysis.

The `pnl` property provides the profit and loss data associated with the position at the exact time the closure is initiated.

## Interface CancelScheduledCommitNotification

This notification tells you that a scheduled trading signal has been canceled before it was actually executed. It’s a way to keep track of signals that were planned but didn't go through.

Each notification has a unique ID and timestamp indicating exactly when the cancellation happened. It also tells you whether the cancellation occurred during a backtest (simulated trading) or in a live trading environment.

The notification details include the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange used.  You'll also find a unique identifier for the signal itself, and optionally, a reason for the cancellation if one was provided.

The message also provides comprehensive details about the potential trade, including details like the number of entries and partials, the original entry price, and a snapshot of the potential profit and loss (PNL) information at the time of cancellation. This information includes entries for average price, percentage and cost. Finally, the notification includes a timestamp of when the notification was generated.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event, providing a way to undo an action that was set to happen later. When you cancel, you can optionally include a `cancelId` to give a specific reason for the cancellation – helpful for tracking purposes. You’ll also need to provide the unrealized Profit and Loss (PNL) at the time the event was scheduled, so the system can accurately reflect the changes. Think of it as a way to say, “Don’t do that thing we planned, and here's the financial situation related to it.”

## Interface BreakevenStatisticsModel

This model holds all the information related to breakeven points encountered during a trading simulation. Think of it as a log of every time a trade reached a breakeven state.

It keeps track of each individual breakeven event, storing all the details associated with it in the `eventList` property.  You'll find a comprehensive record of when and how these breakeven milestones were achieved.

The `totalEvents` property simply tells you how many breakeven events occurred overall, giving you a quick summary of the frequency of these milestones.

## Interface BreakevenEvent

This data structure holds all the key information about when a trade reaches its breakeven point during a backtest or live trading session. Each `BreakevenEvent` describes a specific moment a signal hit breakeven, including the exact time and price. It captures details like the trading pair, the strategy used, the signal's ID, and the type of position taken.

You'll find crucial pricing information here, such as the entry price, take profit level, and stop-loss orders, along with their original values when the signal was first created. If a dollar-cost averaging (DCA) strategy was used, you can find the total number of entries and the original entry price before averaging.

The data also tracks partial closes, the unrealized profit and loss (PNL) at breakeven, and a human-readable note explaining why the signal was triggered. Finally, timestamps related to when the position was activated and initially scheduled are included, along with a flag indicating whether the event occurred in backtest or live mode.

## Interface BreakevenContract

This interface represents a breakeven event – a moment when a trading signal's stop-loss is adjusted to the entry price, signifying a reduction in risk. Think of it as a signal saying, "I’ve made enough profit to cover my initial costs, so I'm reducing my risk." 

Each breakeven event is specific to a particular trading pair, strategy, exchange, and timeframe.  It includes all the original details of the signal, the current price that triggered the breakeven, and whether it occurred during a backtest or live trading session. The timestamp records precisely when this event happened – either at the moment of adjustment in live trading, or based on the historical candle data during a backtest. Services and user callbacks can then use this information to track strategy safety, analyze performance, and generate reports. These events are designed to be unique – they only happen once per signal.

## Interface BreakevenCommitNotification

This notification is sent whenever a breakeven action is triggered during a trade. It provides a detailed snapshot of the trade’s status at the time the breakeven was executed. You'll find key information like a unique ID for the notification, the exact timestamp it occurred, and whether it's from a backtest or a live trade. 

The notification includes details about the trading pair, the strategy that generated the signal, and the exchange used. Crucially, it reports the current market price, the trade direction (long or short), and the initial entry and stop-loss prices. It also breaks down how the pricing evolved, including original take profit and stop-loss values before any trailing adjustments were applied.

For trades involving DCA (Dollar Cost Averaging), the total number of entries and partial closes are provided. You'll also receive a comprehensive profit and loss breakdown, including PNL in USD, percentage, and the prices used for the PNL calculation, which accounts for slippage and fees. Finally, the notification includes timestamps for when the signal was scheduled and became pending, offering a complete timeline of the trade.

## Interface BreakevenCommit

The `BreakevenCommit` event signals that a breakeven adjustment has occurred during a trading strategy's execution. 

It provides details about the current market conditions at the time of the adjustment, including the current price and the unrealized profit and loss (PNL). 

You’ll find information about the trade’s direction (long or short), the original entry price, and the effective take profit and stop-loss prices, which may have been modified by trailing mechanisms.

Importantly, this event also preserves the original take profit and stop-loss prices set before any trailing adjustments were applied, along with timestamps indicating when the signal was created and the position was activated. This data helps in reconstructing the trade's history and understanding the context of the breakeven decision.


## Interface BreakevenAvailableNotification

This notification tells you when a trade's stop-loss can be moved to the entry price, essentially meaning the trade has reached a breakeven point. It provides a wealth of information about the trade, including a unique ID, the exact timestamp when this happened, and whether it occurred during a backtest or live trading.

You'll also find details about the trading pair (like BTCUSDT), the strategy used, the exchange, and the signal itself. The notification includes the current market price, the original entry price, and information about any take profit and stop-loss levels, both as initially set and after any trailing adjustments.

For trades involving averaging (DCA), it breaks down the number of entries and partial closes. It also contains detailed profit and loss information, including the total capital invested and unrealized PNL, along with the prices used in those calculations. Finally, it provides timestamps marking the signal's creation and when the position became active.

## Interface BacktestStatisticsModel

This model holds all the key statistical information gathered from a backtest. It gives you a complete picture of how your trading strategy performed.

You'll find a detailed list of every closed trade, along with the total number of trades, wins, and losses.
It also provides critical metrics like win rate, average profit per trade, and total profit.

Beyond simple profitability, you can assess risk with measures like standard deviation (volatility) and the Sharpe Ratio, which combines profit and risk. 
The annualized Sharpe Ratio provides a yearly equivalent for comparison.

Certainty Ratio indicates how much better your winning trades perform compared to your losing ones, while expected yearly returns helps project potential long-term gains.
Finally, it includes peak and fall PNL figures to assess the magnitude of your best and worst trades. Note that if any calculation would result in an undefined or infinite value, that specific statistic will be recorded as null.

## Interface AverageBuyCommitNotification

This notification is triggered whenever a new averaging (DCA) order is executed within a trading strategy. It provides a detailed snapshot of that averaging action, including the unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading session.

You'll find important information like the trading symbol, strategy name, and exchange used for the trade. The notification also contains critical pricing data, including the price at which the averaging buy occurred, the cost of that buy, and the resulting effective average entry price.

The notification includes insights into the current position, like its direction (long or short), and all related price levels – original entry price, take profit, and stop loss - alongside their adjusted values if trailing is enabled. It also incorporates the current profit and loss metrics, total investment, and timestamps related to signal creation and execution. Ultimately, this notification gives you a comprehensive view of each averaging step and its impact on the overall position.

## Interface AverageBuyCommit

This event signals that a new buy order has been executed as part of a dollar-cost averaging (DCA) strategy for an existing position. 

It provides detailed information about the averaging event, including the price at which the new order was filled (`currentPrice`). You'll also find the cost of this specific averaging buy in USD (`cost`). 

Crucially, it tells you how this averaging buy impacts the overall position, calculating the new, effective average entry price (`effectivePriceOpen`), and updating the unrealized profit and loss (`pnl`). 

The event also includes the original entry price, stop-loss, and take-profit prices, along with their original values before any trailing adjustments. Lastly, it includes timestamps of when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface ActivePingContract

This contract represents periodic updates – essentially “ping” events – related to active, pending trading signals. These signals are those that haven’t been closed yet.

Each ping provides information about the symbol being monitored, the name of the strategy managing it, and the exchange involved.  You'll also receive the full signal data, including details like entry price, take profit, and stop loss levels.

Critically, the current price is included, allowing you to build custom logic based on price movements. 

Finally, you'll know if the event originates from a backtest (historical data) or live trading. The timestamp reflects the moment the ping occurred, either during live trading or during the backtest's candle processing. Users can subscribe to these pings using `listenActivePing()` or `listenActivePingOnce()` to build reactive systems.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been manually activated. It's triggered when you, the user, decide to execute a trade before the anticipated price point (priceOpen).

The notification provides a wealth of information about the trade, including a unique identifier, the timestamp of activation, and whether it originates from a backtest or live trading environment. You'll find details about the trading pair, the strategy used, and the exchange involved.

Crucially, it outlines the specifics of the trade itself: the direction (long or short), entry and take profit/stop-loss prices, and the original pricing before any adjustments. You'll also see details about any dollar-cost averaging (DCA) strategy applied, along with current profitability metrics including P&L, percentage gains/losses, and relevant price points used in those calculations. Lastly, it includes timestamps marking when the signal was initially created and when it went pending.

## Interface ActivateScheduledCommit

This interface describes what happens when a pre-planned trade, scheduled to occur at a specific time, is actually executed. It bundles together all the relevant details about that trade, like whether it's a long (buy) or short (sell) position, the entry price, and the take profit and stop loss levels – both the original values and any adjustments that might have been made. You’ll also find information about the current market price when the trade was activated, the profit and loss generated up to that point, and timestamps marking when the signal was initially created and when the position was activated.  A user can also provide an identifier to explain why the trade was activated.
