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

This interface defines the information shared when a walker is being stopped. It's used to signal that a particular walker, running a specific strategy on a given trading symbol, needs to be interrupted. This is especially useful when you have multiple walkers running at the same time – the `walkerName` allows you to precisely target which walker should halt its operations. The signal includes the trading symbol, the name of the strategy involved, and the name of the walker itself.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to understand the results of a backtesting process. It combines basic backtest results with additional data that allows for comparing different trading strategies against each other. Think of it as a container for all the information you need to evaluate how well your strategies performed and how they stack up against alternatives. Specifically, it holds an array detailing the results of each strategy you tested.


## Interface WalkerContract

WalkerContract defines the information shared during strategy backtesting comparisons. It’s like a report card passed along as each strategy finishes its test run.

This report card includes details like the walker's name, the exchange being used, the frame, the specific symbol being tested, and the name of the strategy that just completed.

You'll also get key performance statistics for the strategy, a single number representing its performance on the chosen metric, and information about the top-performing strategy seen so far, including its name and metric value. 

Finally, the contract tells you how many strategies have been tested so far, and how many more are left to go. Think of it as a progress tracker for your backtesting process.

## Interface WalkerCompleteContract

The WalkerCompleteContract signals that a backtesting process is finished. It’s a notification saying all the strategies have run and the final analysis is ready.

This contract bundles together a lot of important information about the backtest. It includes details like the name of the walker that performed the test, the trading symbol used, the exchange and timeframe involved, and the metric used to evaluate the strategies.

You'll also find the total number of strategies that were tested, the name of the strategy that performed the best, and its corresponding metric value. Finally, the contract provides the full statistics for that top-performing strategy.

## Interface ValidationErrorNotification

This notification signals that a validation check has failed during the backtesting process. It’s essentially a heads-up that something went wrong with your risk management rules or constraints.

Each notification includes a unique ID to help track it, along with a detailed error message that's easy to understand. You'll also find the full error object, complete with a stack trace and extra information to pinpoint the exact cause of the problem. 

Importantly, the `backtest` property is always false because these errors occur during live context validations, not the backtest simulation itself.


## Interface ValidateArgs

This interface, ValidateArgs, serves as a blueprint for ensuring the names of different components in your backtesting process are correct. Think of it as a way to double-check that you're using the right labels for your exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweep configurations. 

Each property within ValidateArgs represents a specific type of component, and expects a value that can be checked against a predefined list of options (an enum). This helps prevent errors by making sure everything is properly identified and working together harmoniously. It promotes a structured and reliable backtesting environment.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's like a confirmation that your trailing stop has hit its target and a trade has been closed. 

The notification includes a unique ID and timestamp for tracking purposes, along with whether it happened during a backtest or live trading. You'll find details about the traded pair, the strategy that triggered the action, and the exchange used. 

It breaks down the specifics of the trade: the original and adjusted take profit and stop-loss prices, the entry price, and the number of entries and partial closes involved.  You’ll also see a comprehensive profit and loss (PNL) report, including peak profit, maximum drawdown, and all the relevant pricing information used in those calculations. Finally, there’s a field for a human-readable note describing why the signal was triggered and timestamps indicating when the signal was created, scheduled, and put into a pending state.

## Interface TrailingTakeCommit

This interface describes a trailing take event, which happens when a trading strategy adjusts its take profit price based on market movements. It tells you exactly what happened – that a trailing take adjustment occurred – and provides a wealth of information about the trade at that moment. You’ll find details like the current market price, the percentage shift used for the adjustment, and the position's performance so far, including total profit and loss, peak profit achieved, and maximum drawdown.

The event also holds the original take profit and stop-loss prices before any trailing adjustments were made, along with the effective, adjusted prices currently in place. You’ll also see the trade direction (long or short), the entry price, and timestamps indicating when the signal was created and when the position was activated. This data allows you to understand the complete picture of a trailing take event and assess how the strategy is managing risk and profit.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of detail about the trade, including whether it happened during a backtest or live trading. You’ll find information like the trading pair, the strategy involved, and a unique identifier for both the signal and the notification itself.

The notification also includes key pricing information – the entry price, the original and adjusted stop-loss and take-profit prices – allowing you to understand how the trailing stop influenced the trade.  You can see the total number of entries and partial closes executed, alongside a comprehensive breakdown of the position's profit and loss, including peak profit and maximum drawdown metrics, all with relevant pricing and percentage values. Finally, it includes optional notes to describe the reasoning behind the signal and timestamps for signal creation and notification generation.

## Interface TrailingStopCommit

This describes a trailing stop event, a signal that occurs when a trailing stop-loss order is triggered. It provides detailed information about the trade and the conditions that led to the stop being activated.

The `action` property simply confirms that this is a trailing-stop event.

You'll find key price data, including `currentPrice` which reflects the market price when the adjustment happened. Crucially, it also includes `priceTakeProfit` and `priceStopLoss` representing the current, adjusted stop-loss and take-profit levels.

The record also outlines performance metrics for the position.  `peakProfit` and `maxDrawdown` reveal the highest profit and largest loss experienced during the trade's lifetime.  It also shows the initial entry price (`priceOpen`), original take profit and stop loss values (`originalPriceTakeProfit`, `originalPriceStopLoss`), and timestamps (`scheduledAt`, `pendingAt`) to help understand the order's history and timing. Finally, the `position` property specifies whether this is a long (buy) or short (sell) trade.

## Interface TickEvent

This describes the structure of a `TickEvent`, which is used to record everything that happens during a trade. Think of it as a single data point representing an important event in the life of a trade, like when it's opened, closed, or modified.

The `TickEvent` holds all sorts of information about that event: when it happened (`timestamp`), what type of event it was (`action`), and details specific to that action. For example, when a position is opened, it stores the opening price, take profit, and stop loss levels. When a position is closed, you’ll find the close reason and the duration it was held.

It also keeps track of key performance indicators (KPIs) like profit and loss (`pnlCost`, `pnl`), and metrics related to the take profit and stop loss levels, like `percentTp` and `percentSl`, to understand how the trade progressed. Certain data fields are only relevant depending on the type of action performed. This allows backtest-kit to analyze and report on trade history comprehensively.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are syncing and behaving over time. It gives you a collection of all the individual sync events, allowing you to examine them in detail. You'll also find the total number of sync events, as well as counts specifically for signals that were opened and signals that were closed. It's useful for monitoring the lifecycle of your signals and identifying any potential issues.

## Interface SyncEvent

This data structure consolidates all the important information related to a signal's lifecycle, making it easier to generate reports, particularly in markdown format. Think of it as a comprehensive snapshot of what happened during a trade.

Each event includes details like the exact time it occurred (`timestamp`), which trading pair was involved (`symbol`), and the name of the strategy and exchange used. It tracks whether the trade was a long or short position (`position`) and provides entry, take profit, and stop loss prices – both the original values and any adjusted versions (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`, `originalPriceOpen`).

You’ll also find data concerning partial closes (`totalPartials`) and the total number of entries for any DCA strategies (`totalEntries`). Critically, it also includes profit and loss data (`pnl`), along with the highest profit and largest drawdown experienced throughout the trade (`peakProfit`, `maxDrawdown`), offering insight into the risk and reward profile.

The `closeReason` clarifies why a signal was closed, while `backtest` indicates whether the data originates from a simulated environment. Finally, `createdAt` provides a timestamp for when the event record itself was created, and `scheduledAt` and `pendingAt` log key timing elements of the signal's execution.

## Interface StrategyStatisticsModel

This model holds the statistics gathered during a backtest, giving you a detailed view of your strategy's actions. It includes a complete list of all events that occurred, allowing for deep inspection. You’ll find counts for various event types like canceled schedules, pending closes, partial profits and losses, trailing stops, trailing take profits, breakeven actions, and activated schedules. It also tracks the number of average buy (Dollar Cost Averaging) events your strategy executed. Essentially, it's a breakdown of how your trading strategy behaved over time.

## Interface StrategyEvent

This object holds all the important details about actions taken by your trading strategy, like buys, sells, and modifications. It's designed to provide a complete record for generating reports and understanding strategy behavior. Each event includes a timestamp, the trading pair involved, the strategy and exchange names, and whether it’s a backtest or live trade.

You'll find information about the specific signal that triggered the action, along with the current market price and any profit/loss targets set. If you’re using partial closes or trailing stops, the percentages and original prices are included. 

For scheduled or pending actions, unique IDs are provided, along with timestamps marking when the action was created and when the position became active.  When using DCA (Dollar Cost Averaging), the effective entry price and the total number of entries are recorded.  The overall profit and loss at the time of the action is also included, alongside any optional notes associated with the event.

## Interface SignalSyncOpenNotification

This notification tells you when a trading signal, specifically a limit order, has been activated and a position has been opened. It’s like getting a confirmation that your pre-set order has been executed. The notification includes a unique ID, the time it happened, and whether it occurred during a backtest or in live trading.

You'll find details about the trade itself, like the trading pair (e.g., BTCUSDT), the strategy that triggered the signal, and the price at which the order was filled. It also provides a lot of performance data related to the new position – including profit/loss (both absolute and percentage), peak profit, maximum drawdown, and associated prices.

Finally, the notification gives you insights into how the trade was constructed, such as the original take profit and stop loss levels, the number of entries and partials, and any notes attached to the signal itself. This helps in understanding the signal's rationale and tracking its performance.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was a take profit, a stop loss, time expiration, or a manual closure. It provides a wealth of detail about the trade, including the unique identifiers for the signal, the trading pair involved, and the strategy that generated it. You'll find information about the position’s performance like profit and loss, peak profit, and maximum drawdown, along with the specific prices used for entry, take profit, and stop loss. The notification also specifies the trade direction (long or short), number of entries and partial closes, and the reason for the signal’s closure. It indicates whether the trade happened during a backtest or in live trading mode, and includes timestamps for key events like signal creation, activation, and closure.

## Interface SignalSyncBase

This interface defines the core information you'll find in any signal synchronization event within the backtest-kit framework. Every signal, whether it originates from a backtest or live trading, will have these properties.

You'll see the trading symbol, like "BTCUSDT," along with the name of the strategy that created the signal and the exchange it was executed on. 

Knowing whether the signal came from a backtest or live trading is also provided.  A unique ID, a timestamp indicating when the signal occurred, and the full details of the signal itself are included as well. Essentially, it gives you the essential context for understanding and working with signals during backtesting and live trading.

## Interface SignalScheduledNotification

This notification lets you know that a trading signal has been set up for future execution. It's like a heads-up that a trade is going to happen later. 

Each notification has a unique ID and a timestamp indicating when the signal was scheduled. You'll see whether it's part of a backtest or a live trading scenario, along with details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange it will be executed on.

The notification includes crucial information about the trade itself – the signal ID, trade direction (long or short), target entry price, take profit levels, and stop loss levels. It also holds information about any trailing adjustments that might have been applied to the stop-loss or take-profit.

If the strategy uses dollar-cost averaging (DCA), you’ll find details on the total number of entries and partial closes. There's a breakdown of the trade's cost and potential profit/loss (PNL), including peak profit, maximum drawdown, and relevant price points and percentages.  You’ll also get timestamps on when the signal was created and when the notification was generated. Finally, a note field allows for a brief explanation of the signal’s reasoning.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened by a strategy, whether it's a backtest or a live trade. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it's a long (buy) or short (sell) position. You'll find details like the entry price, take profit and stop-loss levels, and how much it cost to enter the trade.

Beyond the basics, the notification includes performance metrics like peak profit, maximum drawdown, and profit/loss percentages, helping you analyze the trade's potential. It also provides information about any averaging or partial closing strategies that were applied, including the number of entries and partial closures.  Finally, it includes optional notes and timestamps that describe the signal's creation and execution details.

## Interface SignalOpenContract

This event, `SignalOpenContract`, signifies that a pre-planned trading signal has been activated. Think of it as confirmation that your limit order – the order you placed earlier – has been filled by the exchange. 

It’s particularly useful for synchronizing your trading system with external tools like order management systems or audit logs. Whether you're backtesting strategies or trading live, this event tells you when a position has officially started.

The event provides a wealth of information, including the current market price, the entry price (priceOpen), and details about take profit and stop-loss levels both as initially set and after any adjustments. You'll also find data about the position's performance so far, like peak profit, maximum drawdown, and total profit and loss. The event also tells you if the position is a long (buy) or short (sell) trade, the timestamp when the signal was scheduled, and when the position was activated. Finally, it will list how many entries were used (if the position was averaged) and any partial closes that have occurred.

## Interface SignalInfoNotification

This notification type lets you receive detailed information about a trading position as it's being managed by a strategy. It’s like getting a snapshot of what’s happening with your trades, directly from the strategy itself. You'll see key data points like the entry price, take profit, stop loss, and the strategy's performance metrics like peak profit and maximum drawdown.

The notification includes details like the strategy's name, the exchange used, and a unique identifier for the signal. You'll also get information about DCA (Dollar Cost Averaging), including the total number of entries and partial closes.

It provides a comprehensive view of a position's journey, from its creation to its current state, including performance indicators and original pricing details that may have been adjusted by trailing stops. The inclusion of timestamps allows for tracking the sequence of events and linking these notifications to other systems. Finally, a user-defined note allows strategies to provide custom explanations or context for the position.

## Interface SignalInfoContract

This structure helps communicate informational messages from your trading strategies. When a strategy wants to share details about an open position – perhaps a custom annotation or a debugging message – it uses this to broadcast that information.

The information includes the trading symbol, the strategy's name, the exchange used, and the timeframe it's operating within. Crucially, it also provides the full signal data, the current price, a user-defined note, and an optional ID for tracking.

You can register to receive these messages, allowing you to build custom notifications or integrate your strategies with external systems. Knowing whether the event originates from a backtest (historical data) or live trading is also included. The timestamp reflects the moment of the event – either the current time in live mode or the candle's timestamp during backtesting.

## Interface SignalData$1

This data structure holds all the key information about a single, completed trading signal. Think of it as a record of one trade that has finished. 

It tells you which strategy created the signal, a unique ID for that signal, and the symbol being traded.

You'll also find details like whether it was a long or short position, the percentage profit or loss (PNL), and the reason the signal was closed. Finally, timestamps mark when the signal was first opened and when it was closed, giving you a complete timeline of the trade.


## Interface SignalCommitBase

This describes the core information you'll find in any signal commitment event within the backtest-kit framework. Each signal commitment, whether it's part of a backtest or live trading, will include details like the trading pair's symbol, the name of the strategy that generated the signal, and the exchange where the signal was executed. 

You'll also see information related to the timeframe being used (important for backtesting) and whether the event originates from a backtest or live environment. A unique ID is assigned to each signal, alongside a timestamp marking the moment of execution.

To track the trade’s progress, there are fields for the total number of entries (indicating averaging levels) and partial closes. The original entry price, untouched by any averaging, is also recorded. 

Finally, the signal itself – its data at the time – is included, along with an optional note to describe the signal's reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was stopped out by a stop-loss, hit a take-profit target, or expired. It provides a wealth of information about the trade, including its unique identifier, when it closed, and whether it was part of a backtest or a live trade. 

You'll find details like the entry and exit prices, the original take-profit and stop-loss levels, and how many entries or partial closes were involved. The notification also includes detailed profit and loss (PNL) information, showcasing peak profit achieved and maximum drawdown experienced.  

Finally, it explains *why* the position closed, how long it lasted, and a free-text note that might provide additional context or explanation for the closure. This data is invaluable for analyzing strategy performance and understanding the behavior of your trading systems.

## Interface SignalCloseContract

This event signals that a trading signal has been closed, whether due to hitting a profit target, a stop-loss, time expiration, or manual intervention. It's designed to help external systems, like order management tools or audit logs, stay in sync with what's happening in the trading process.

The event provides a wealth of information about the closed position, including the current market price at the time of closure, the overall profit and loss (PNL), the highest profit reached, and the largest drawdown experienced. You'll also find details about the original and effective entry, take profit, and stop-loss prices, along with timestamps marking when the signal was created and the position was activated.

Crucially, it includes the reason for the closure, the trade direction (long or short), and information about any averaging (DCA) or partial closures that occurred. All of this data enables a complete understanding of the signal’s lifecycle and facilitates accurate record-keeping and external system synchronization.

## Interface SignalCancelledNotification

This notification informs you when a scheduled trading signal has been cancelled before it could be activated. It provides detailed information about the cancelled signal, including its unique identifier, when it was cancelled, and whether it occurred during a backtest or live trading.

You'll find specifics about the strategy that generated the signal, the exchange it was intended for, and the trade direction (long or short).

The notification also includes details about the intended trade parameters like take profit, stop loss, and entry prices, along with their original values before any adjustments. You can also see information relating to any DCA averaging or partial closes that were planned.

A crucial piece of information is the `cancelReason`, explaining why the signal was cancelled – whether it was due to a timeout, a price rejection, or a user action. An optional `cancelId` helps track signals cancelled by a user. Further, it includes timestamps associated with the signal’s lifecycle, helping you understand the sequence of events.

## Interface Signal

This `Signal` object represents a trading signal and holds key information about its execution. It tracks the initial entry price of a position with the `priceOpen` property.

The `_entry` array details each entry made for the signal, noting the price, associated cost, and the exact time of the entry.

The `_partial` array keeps records of any partial exits from the position. For each partial exit, it specifies whether it was taken for profit or loss, the percentage of the position closed, the price at the time of closure, the cost basis at the time, the number of units closed, and the timestamp.

## Interface Signal$2

This section describes the `Signal$2` object, which represents a trading signal within the backtest-kit framework. 

It holds essential details about a trade, including the initial entry price (`priceOpen`).

You'll also find a record of all entry points, each noting the price, cost, and timestamp.

Finally, it tracks any partial exits from the position, specifying the type (profit or loss), percentage, price, cost basis at the time of the partial exit, the number of shares at the time, and a timestamp.

## Interface Signal$1

This `Signal` object holds information about a specific trading signal. It keeps track of the initial entry price for a position, allowing you to understand the starting point of a trade.

It also stores a record of all entries made for this signal, including the price paid, the total cost, and the timestamp of each entry.

Finally, it logs any partial exits that have occurred, detailing whether they were profit-taking or loss-limiting actions, along with the percentage, price, cost basis, entry count, and timestamp of each partial exit.


## Interface ScheduledEvent

This data structure, `ScheduledEvent`, acts as a central hub for all information related to trading events—whether they were scheduled, opened, or cancelled. Think of it as a comprehensive record of what happened during a trade.

It includes details like the exact timestamp of the event, what action was taken (opened, scheduled, or cancelled), and the specifics of the trade itself, such as the symbol, signal ID, and position type.

You'll also find crucial price points like the entry price, take profit, and stop loss, along with their original values before any modifications. 

If the trade involved averaging strategies, it keeps track of the number of entries and partial closes.  For cancelled trades, you'll learn the reason for the cancellation, whether it was due to a timeout, price rejection, or user intervention. It even logs the ID of user-initiated cancellations.

Finally, the record holds performance data like unrealized profit and loss (PNL) and duration, providing a complete picture of the trade's lifecycle.

## Interface ScheduleStatisticsModel

The ScheduleStatisticsModel helps you understand how your scheduled signals are performing. It collects key data about the signals you schedule, how many of those signals actually activate, and how many get cancelled.

You'll find a detailed list of all the scheduled events, along with counts for total events, signals that were scheduled, and signals that were opened or cancelled.

The model also tracks important ratios, like the cancellation rate (how often signals are cancelled) and the activation rate (how often signals actually trigger). It even calculates average waiting times for cancelled and opened signals, giving you insights into potential delays. This information helps you fine-tune your scheduling strategies for better results.

## Interface SchedulePingContract

This contract represents periodic updates during the lifecycle of a scheduled trading signal, sent out every minute. It’s mainly used to keep track of what’s happening with your scheduled signals and to give you a way to react to them.

These updates happen while the signal is active – neither cancelled nor fully activated.

Here's what information you get with each update:

*   The trading symbol (like BTCUSDT).
*   The name of the strategy that created the signal.
*   The exchange where the signal is being monitored.
*   The complete data associated with that signal, including details like entry price, take profit, and stop loss levels.
*   The current market price at the time the update is sent.
*   Whether this update comes from a backtest (using historical data) or live trading.
*   A timestamp marking exactly when the update was generated.

You can use this information to monitor the signal and add your own cancellation logic.

## Interface RiskStatisticsModel

This model holds data about risk rejection events, helping you understand where and why your risk controls are being triggered. 

It breaks down the events into a detailed list, the overall total of rejections, and then categorizes them by the symbol involved and the strategy that initiated them. 

Think of it as a report card for your risk management system, showing you what’s being flagged and where. 

You can see the raw event data, the total count of rejected events, how many rejections are happening for each trading symbol, and how many are related to each specific trading strategy.


## Interface RiskRejectionNotification

This notification informs you when a trading signal has been blocked by your risk management rules. It's essentially a heads-up that a potential trade didn’t go through because of safety measures you’ve set in place. 

Each rejection notification includes a unique ID and a timestamp to track when it happened. You’ll find details about the trade itself, such as the symbol being traded (like BTCUSDT), the strategy that tried to initiate it, and the exchange involved.

The most important part is the `rejectionNote`, which gives you a clear explanation of why the signal was rejected - so you understand what rule was triggered.  You'll also see information like the number of active positions you had at the time, the current price, and the planned entry price, take profit, and stop loss levels if they were defined. 

The notification also tells you whether this rejection happened during a backtest (simulated trading) or live trading, and may even provide a description of the signal itself with `signalNote`. This comprehensive data helps you fine-tune your risk rules and understand exactly what’s happening in your trading system.

## Interface RiskEvent

This data structure holds the details when a trading signal is blocked due to risk management rules. Think of it as a record of why a trade didn't happen.

It includes things like the exact time of the event, which trading pair was involved, and the signal that was being considered. 

You'll also find the names of the strategy and exchange, the timeframe being used, and the current market price at the time of rejection.

The data also tracks how many positions were already open, a unique ID for the rejection, a descriptive note explaining why it was rejected, and whether the event occurred during a backtest or a live trading session. This information helps you understand and refine your risk management settings.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. It’s a way for the system to tell you when a trade was blocked because it broke a risk rule.

You’ll find important details included, such as the symbol (like BTCUSDT) of the market involved, the specifics of the signal that was rejected, and the name of the strategy that tried to execute it.

It also includes details about the backtest execution itself, the exchange used, the current market price at the time of rejection, and the number of other active positions.

A unique ID and a human-readable explanation are provided to help with debugging and understanding why the signal was rejected. Finally, a timestamp indicates precisely when the rejection occurred, and a flag tells you whether it happened during a backtest or live trading.

## Interface ProgressWalkerContract

This contract lets you keep an eye on how a backtest walker is doing. It sends out updates while the walker is running, giving you details about its progress.

You'll see the walker's name, the exchange being used, and the frame it's operating within. 

It also tells you how many strategies the walker needs to evaluate overall, how many it's already checked, and the percentage of completion. This helps you understand exactly where the backtesting process is at.

## Interface ProgressBacktestContract

This describes the information shared when a backtest is running and providing updates. It lets you know which exchange and strategy are being tested, and the specific trading symbol involved.  You'll receive updates with the total number of historical data points being analyzed, the number of those points that have already been processed, and a percentage indicating how far along the backtest is.  Think of it as a progress report showing you exactly what's happening during the backtest's execution.

## Interface PerformanceStatisticsModel

This model holds the combined performance data for a single trading strategy. It gives you a high-level overview of how a strategy performed.

You’ll find the strategy's name, the total number of performance events it generated, and the total time it took to run all its performance checks.

The `metricStats` property organizes performance data by the type of metric being tracked, allowing you to easily compare different aspects of the strategy's performance. 

Finally, the `events` array contains all the individual, raw performance events that contributed to these summarized statistics, giving you access to the detailed history of the strategy's performance.

## Interface PerformanceContract

The PerformanceContract helps you understand how your trading strategies are performing. It records key events during the backtesting or live trading process. Think of it as a detailed log that tells you how long different parts of your system take to run.

Each entry contains information like when the event happened, when the previous event occurred, what operation was being done, and how long it took.

You'll also find the name of the strategy, the exchange it's running on, the specific frame, and the trading symbol involved. Finally, it indicates whether the performance data comes from a backtest or live trading session, letting you compare performance in different environments. This data is invaluable for identifying slow spots and improving overall efficiency.

## Interface PartialStatisticsModel

This model holds statistics related to partial profit and loss events within a backtest. Think of it as a snapshot of how frequently your strategy achieved profits versus losses during a specific period. 

It breaks down the data into a few key pieces of information:

*   A detailed list of all the profit and loss events that occurred.
*   The total count of all events, including both profits and losses.
*   The number of times your strategy resulted in a profit.
*   The number of times your strategy resulted in a loss.

Essentially, it allows you to understand the frequency of profit and loss milestones during your backtest.

## Interface PartialProfitContract

This describes a `PartialProfitContract`, which is essentially a notification that a trading strategy has reached a specific profit milestone during execution. Think of it as a progress report on how well a trade is doing.

Each notification contains details like the trading symbol, the name of the strategy being used, and where the trade is happening (the exchange and frame). You’ll also find the original data that triggered the trade, the current price when the milestone was hit, and the specific profit level achieved (like 10%, 20%, etc.).

It also tells you whether this event came from a backtest (simulated trading) or a live trade. Finally, it includes a timestamp indicating when the profit level was reached, which is based on the live trade’s time or the candle's timestamp during backtesting. This data is useful for tracking strategy performance, monitoring how much profit is being realized, and generating reports.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed within a trading strategy. It's like a detailed report card for a small piece of a larger trade.

You'll see important details like a unique ID for the notification, a timestamp for when it happened, and whether it’s from a backtest or live trading. The notification also includes the trading pair (like BTCUSDT), the name of the strategy that triggered the action, and the exchange used.

It provides insights into the position itself:  the signal ID, how much of the position was closed, the current market price at the time, and whether the trade was a long (buy) or short (sell) position. 

Beyond that, you'll get the entry price, take profit, and stop-loss prices, both the original values and those after any adjustments. It will also show the history of the position, like the number of entries made (DCA averaging) and any previous partial closes.

Finally, it includes performance data like total profit and loss (PNL), peak profit achieved, maximum drawdown, and percentages related to all of these, all the way down to individual prices and costs, plus notes for any specific reason or explanation. This lets you really understand what happened and why.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within your trading strategy. It provides a snapshot of the position's performance and details leading up to this partial closure.

The `action` property confirms this is a partial profit event.

You'll find the `percentToClose` value, indicating what percentage of the position is being closed off.

Crucially, the event includes the `currentPrice` at the time of the action.  Detailed performance metrics like total profit and loss (`pnl`), peak profit, and maximum drawdown are also provided.

Information about the trade's direction (`position`), entry price (`priceOpen`), and the original and adjusted take profit and stop loss prices (`priceTakeProfit`, `originalPriceTakeProfit`, `priceStopLoss`, `originalPriceStopLoss`) are all available.

Finally, timestamps, `scheduledAt` and `pendingAt`, record when the signal was generated and when the position was initially activated.

## Interface PartialProfitAvailableNotification

This notification signals that a profit milestone has been reached during a trade, like hitting 10%, 20%, or 30% profit. It’s essentially a progress report on how a trade is performing. 

The notification includes a lot of detailed information, such as a unique ID, the exact time it happened, and whether it’s from a backtest or live trade. It breaks down the specifics of the trade, including the trading pair, the strategy used, where it was executed, and the original entry price. 

You'll also find data about the current price, take profit and stop-loss levels, and how the position was set up – whether it's a long (buy) or short (sell) trade. The notification also gives insight into the performance of the trade, like the total profit and loss, peak profit achieved, and maximum drawdown experienced. This can help you understand how the strategy is performing and identify potential areas for improvement. There are also details related to the DCA averaging process and total entries. Finally, it provides additional context like the reason behind the signal and when it was scheduled and created.

## Interface PartialLossContract

The PartialLossContract represents notifications when a trading strategy hits pre-defined loss levels, like -10%, -20%, or -30% drawdown. These events are triggered when a signal encounters a loss level milestone.

It's designed to help you track how your strategies are performing and to monitor potential stop-loss executions.

Each event includes details like the trading symbol, the strategy name, the exchange, the frame (if applicable), and the price at which the loss level was reached. You’ll also find the specific loss level (e.g., 20% loss), the current price, whether it’s a backtest or live trade, and a timestamp. 

The data property gives you access to the original signal data, including stop-loss and take-profit prices, which is useful for in-depth analysis. Importantly, these events are only sent once for each loss level per signal.

## Interface PartialLossCommitNotification

This notification lets you know when a partial closing of a trading position has happened. It provides a ton of detail about the trade, including a unique ID, when it occurred, and whether it was a backtest or a live trade. You'll find information about the trading pair, the strategy and exchange involved, and specifics about the signal that triggered the action.

The notification includes rich data like the percentage of the position closed, the current market price, the original entry and stop-loss prices, and how many entries and partials have been executed. You also get key performance indicators (KPIs) like total profit and loss (PNL), peak profit, and maximum drawdown, all with detailed price and cost breakdowns. Finally, there are optional fields for notes and timestamps marking different stages of the signal's lifecycle. This allows for a complete picture of the trade and its performance.

## Interface PartialLossCommit

This interface represents a partial loss event within a trading strategy. It details what happened when a portion of a position was closed out, providing key information about the trade's performance and characteristics.

You'll find details like the percentage of the position that was closed, the current market price at the time of the action, and the profit and loss (PNL) generated from that specific partial closure.

The record also includes the position's overall history, such as its peak profit, maximum drawdown, and the original entry and exit prices, as well as the adjusted prices if trailing stop-loss or take-profit orders were used. 

Finally, it specifies the trade direction (long or short), along with timestamps indicating when the signal was created and the position was initially activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a pre-defined loss level, like -10%, -20%, or -30% of its initial value. It's a way to track how a trade is performing and potentially adjust strategy.

The notification includes details like a unique ID, the exact timestamp of the loss, and whether it occurred during a backtest or live trading. You’ll find the trading pair symbol, the name of the strategy responsible for the signal, and the exchange where the trade happened.

Crucially, it provides information about the position itself: the entry price, the current price, the stop-loss and take-profit levels (both original and adjusted), the number of entries made (especially relevant if using dollar-cost averaging), and the overall P&L of the position. It also tracks the peak profit and maximum drawdown experienced so far, along with associated prices and percentages. 

Finally, there’s space for a human-readable note describing the reason behind the signal, along with timestamps related to the signal’s lifecycle. This comprehensive data helps you understand and analyze the position's performance in detail, from its inception to this specific loss milestone.

## Interface PartialEvent

This data structure helps organize information about profit and loss milestones during trading. Each event represents a point where a profit or loss level was hit, like reaching 10%, 20%, or 30% profit. You'll find details like the exact time, whether it was a profit or loss, the trading pair involved, and the name of the strategy that generated the trade.

It also includes key pricing information, such as the entry price, take profit, and stop-loss levels, both as initially set and as they might have been modified. If a dollar-cost averaging (DCA) strategy was used, information about the total number of entries and the original entry price is included.

Beyond the core data, the structure holds details about partial closes, unrealized profit and loss (PNL), a human-readable note explaining the trade's reasoning, and timestamps for when the position became active and the signal was created. Finally, a flag indicates whether the trade occurred during a backtest or live trading.

## Interface MetricStats

This object bundles together a collection of statistics related to a particular performance metric. It essentially gives you a snapshot of how that metric behaved over a series of measurements.

You'll find details like the total number of times the metric was recorded, the total time it took across all instances, and the average duration. 

It also includes information about the extremes – the shortest and longest durations – and statistical measures like the standard deviation, median, and percentiles (like the 95th and 99th).

If the metric involves wait times, you'll also get those summarized with average, minimum, and maximum values. It's a complete package for understanding the performance characteristics of a specific metric.

## Interface MessageModel

This framework defines a `MessageModel` to represent individual messages within a conversational history for large language models. Each message has a `role` indicating who sent it—whether it's a system instruction, a user input, an assistant's response, or the result of a tool being used.  The core of the message is its `content`, which is the text of the message itself; for some assistants, a `reasoning_content` might also be present, revealing the model's thought process. 

Assistant messages can include `tool_calls`, detailing actions taken, and may also contain `images` attached as blobs, raw bytes, or base64 strings.  If a message is a response specifically to a tool call, it will have a `tool_call_id` linking it back to that tool's request.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown events that occurred during a trading simulation. 

It keeps track of each drawdown event in a list, showing them in chronological order, with the most recent one appearing first. 

You also get the total count of all drawdown events recorded. This allows you to quickly see how many times your strategy experienced significant losses.

## Interface MaxDrawdownEvent

This event represents a single instance where a position experienced its maximum drawdown. It provides detailed information about the drawdown event itself.

You’ll find the exact time the drawdown occurred (timestamp), the trading pair involved (symbol), and the name of the strategy that generated the trade (strategyName). 

The event also tracks the unique identifier of the signal that triggered the trade (signalId), whether the position was a long or short (position), and the profit and loss (pnl) of the entire position. 

It records the highest profit achieved (peakProfit) along with the maximum drawdown experienced (maxDrawdown).

Other key details captured include the price at which the drawdown was realized (currentPrice), the entry price (priceOpen), and any set take profit or stop loss levels (priceTakeProfit, priceStopLoss). Finally, it indicates whether the event occurred during a backtest simulation (backtest).

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides updates whenever a new maximum drawdown is encountered for a trading position. It delivers key details like the trading symbol, the current price, and when the update occurred. You'll also find information about the strategy, exchange, and timeframe involved, alongside the data related to the specific trade signal that triggered the drawdown. A flag indicates whether the update is from a backtest or live trading.

This information is invaluable for monitoring risk and dynamically adjusting your trading approach – for example, you could automatically adjust stop-loss levels or other risk management parameters. By tracking these drawdown events, you can get real-time insight into your position's performance and respond quickly to shifting market conditions.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance. It gathers data from every event – from idle periods to trade openings, activity, and closures – allowing for in-depth analysis. You'll find the total number of events, as well as a breakdown of winning and losing trades.

Key metrics like win rate, average P&L, and total cumulative P&L are presented, all helping to gauge profitability. It also incorporates volatility and risk-adjusted return measures like standard deviation, Sharpe Ratio, and Sortino Ratio. Finally, it calculates indicators that assess the potential returns and drawdown recovery capabilities of your strategy, giving you a comprehensive view of its strengths and weaknesses. It’s important to note that many of these values might be null if the calculation is not reliable.

## Interface InfoErrorNotification

This component handles notifications about errors that pop up during background tasks, but aren't critical enough to stop the whole process. Think of it as a way to flag issues that need attention but don't require immediate intervention. Each notification has a unique identifier, a detailed error message for humans to understand, and information about the error itself, including its stack trace and other helpful details. Importantly, these notifications always indicate that the error occurred outside of a live trading context, specifically during a backtest.

## Interface IdlePingContract

The `IdlePingContract` helps you track when your trading strategies aren't actively making moves. It's like a notification saying, "Hey, the strategy isn't doing anything right now."

This notification, called an idle ping, happens regularly when a strategy isn't responding to any signals.

You can subscribe to these events to understand the lifecycle of your strategies and get details like the trading pair involved (symbol), the strategy's name, the exchange it's running on, and whether it's a backtest or live trade.

The message also includes the current market price and a timestamp which is crucial—in live trading it’s when the ping occurred, and in backtesting it relates to the candle being analyzed. This data is all packaged within the `IdlePingContract` to keep you informed about your strategy's idle periods.

## Interface IWarmCandlesParams

This interface defines the information needed to prepare historical candle data for backtesting. Think of it as a recipe for downloading the past price movements of a specific asset. 

You'll specify the trading pair (like BTCUSDT), the exchange where the data originates, the timeframe (like 1-minute candles or 4-hour candles), and the start and end dates for the data you want to download. This allows the backtest framework to quickly access the needed historical data without repeatedly fetching it during the backtest itself, significantly speeding up the process.


## Interface IWalkerStrategyResult

This describes the results you get when running a strategy within the backtest-kit framework. Each result represents a single strategy that was tested. 

The `strategyName` simply tells you the name of the strategy that was run.

The `stats` provide a detailed breakdown of how the strategy performed, including things like total returns, maximum drawdown, and Sharpe ratio.

The `metric` represents the value being used to compare strategies – it might be a profit metric, or another key performance indicator. If the metric couldn't be calculated for some reason, this value will be null.

Finally, the `rank` shows you where this strategy stands in comparison to other strategies; the best performing strategy will have a rank of 1.

## Interface IWalkerSchema

The IWalkerSchema lets you define how to run A/B tests comparing different trading strategies. It’s essentially a configuration that tells the backtest-kit what strategies to test against each other.

You’ll give it a unique name for easy identification, and can add a note for yourself to remember what it’s for.

It specifies which exchange and timeframe your strategies will use for testing.

The core of the schema is the list of strategy names you want to compare. These strategies *must* have already been registered in your backtest-kit setup.

You can choose which metric – like Sharpe Ratio – you want to optimize for in the test.

Finally, you can provide callbacks to hook into specific points of the walker lifecycle, if you need extra control or want to perform custom actions.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered when a trading strategy is tested across different scenarios. It essentially represents the final output of a backtest run. 

You’ll find details like the specific financial instrument (the `symbol`) being analyzed, the `exchangeName` where the data originated, and the name of the `walker` used to perform the testing.  Finally, it includes the `frameName` which specifies the time frame used for the backtest, for example, daily or hourly data.


## Interface IWalkerCallbacks

This interface lets you tap into the backtest process at key moments, giving you opportunities to monitor progress and react to events. You can use these callbacks to track which strategy is being tested, what asset it's working with, and when a strategy finishes, whether successfully or with an error. Finally, there's a callback that fires once all the strategies have been run.

Here's a breakdown of what each callback does:

*   `onStrategyStart`: Notifies you when a strategy begins testing.
*   `onStrategyComplete`: Provides information about a completed strategy, including statistics and a metric value.
*   `onStrategyError`: Alerts you if a strategy encounters and fails to resolve an error during backtesting.
*   `onComplete`: Signals the end of the entire backtest process, passing along a collection of results.

## Interface ITrailingTakeCommitRow

This interface describes a single action related to a trailing take profit and commit order. Think of it as a record of a specific instruction to adjust a trade based on a trailing stop.

It specifies that the action being performed is a "trailing-take," indicating a trailing take profit action. 

The `percentShift` property defines the percentage amount by which the trailing stop will be adjusted.  Finally, `currentPrice` captures the price at the time the trailing stop was initially established.

## Interface ITrailingStopCommitRow

This interface represents a single action request for a trailing stop order, and it's used when queuing up changes to your trading strategy.

It tells the system that a trailing stop needs to be adjusted.

The `action` property confirms the specific type of action being performed – in this case, a "trailing-stop" adjustment.  You'll also see the `percentShift` which defines the percentage change to apply to the stop price, and `currentPrice` indicating the price level that the trailing stop was initially set at. Essentially, it packages the necessary data for modifying a trailing stop.

## Interface IStrategyTickResultWaiting

This result type, `IStrategyTickResultWaiting`, appears when a trading signal has been scheduled but hasn't yet triggered – it’s essentially waiting for the price to reach the specified entry point.  You'll see this repeatedly while the system monitors a scheduled signal.

It provides details about the signal, including the current price being monitored, the strategy and exchange names, the timeframe used, the trading pair, and progress toward take profit and stop-loss levels (which are always zero in this waiting state). 

You'll also find unrealized profit and loss (P&L) information for the theoretical position, plus an indicator of whether the event originates from a backtest or a live trading environment. Finally, the record includes a timestamp noting when the tick result was created.

## Interface IStrategyTickResultScheduled

This interface represents a specific event in your trading strategy – when a signal is generated and scheduled, awaiting the right price to trigger an action. It's like setting a conditional order.

The `action` property tells you this is a "scheduled" action. The `signal` property contains all the details about that signal that was created. 

You'll also find information about the strategy, exchange, timeframe, and trading pair involved, so you can track where the signal originated.

The `currentPrice` notes the price at the moment the signal was scheduled. The `backtest` flag tells you if this happened during a backtest or a live trading session. Finally, `createdAt` records the precise time the scheduled signal was created, helpful for performance analysis and debugging.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created. It’s triggered after a signal has been checked for validity and saved, and it provides a wealth of information about that new signal.

You'll get details like the signal's ID, the name of the strategy that generated it, which exchange and timeframe it applies to, and the trading symbol involved.

Crucially, it also includes the current price at the time the signal was opened, and a flag indicating whether the signal originated from a backtest or a live trading environment. The `action` property confirms the event type is "opened," making it easy to distinguish from other tick events. A timestamp is also provided for accurate tracking.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state, meaning there's no active trading signal. It provides information about the situation at the time, allowing you to monitor and understand when the strategy isn't actively trading. You'll see details like the strategy's name, the exchange it's connected to, the timeframe being used, and the trading pair involved.

The current price, a VWAP value, is also included, along with whether the data comes from a backtest or a live trading environment. A timestamp is present for accurate tracking and logging of these idle events. Basically, it’s a record of when the strategy is just observing the market.


## Interface IStrategyTickResultClosed

This data structure represents the outcome when a trading signal is closed, providing a comprehensive snapshot of the event. It includes details about why the signal closed – whether it was due to a time limit expiring, a profit target being reached, a stop-loss trigger, or a manual closure. You'll find the closing price, the exact time of the closure, and a breakdown of the profit or loss, factoring in any fees and slippage. The information also identifies the specific strategy, exchange, and timeframe involved, along with whether the event occurred in a backtest or live trading environment. A unique ID is assigned for user-initiated closures, and a timestamp records when the result was generated. It contains the signal details that originally triggered the trade.

## Interface IStrategyTickResultCancelled

This interface, IStrategyTickResultCancelled, describes what happens when a planned trading signal doesn't go through – specifically, when it's cancelled before a trade actually begins. This could be because the signal never triggered or because it hit a stop-loss condition before a position was opened.

It provides detailed information about the cancellation, including:

*   The cancelled signal itself (IPublicSignalRow).
*   The current price at the time of cancellation.
*   Timestamps indicating when the cancellation occurred and when the data was created.
*   Identification details for the strategy, exchange, and trading symbol involved.
*   A reason for the cancellation.
*   An optional ID associated with a manual cancellation request.
*   A flag indicating whether this event occurred during a backtest or live trading.

## Interface IStrategyTickResultActive

This interface describes the data you receive when a trading strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL), or time expiration. 

It provides a snapshot of the current situation, including the signal being watched, the current price being used for monitoring, and the strategy's name and the exchange and timeframe involved.

You'll also find information about the progress towards the take profit and stop loss targets as percentages, as well as the current unrealized profit and loss (PNL) for the position.

The `backtest` property indicates whether the data originates from a backtest simulation or a live trading environment. A timestamp tracks when the result was created, and another timestamp remembers the last processed candle, which is important for backtesting processes.

## Interface IStrategySchema

This schema describes a trading strategy you register within the backtest-kit framework. Each strategy gets a unique name to identify it.

You can add a note to the schema to help document the strategy's purpose for yourself or others.

The `interval` property dictates how often the strategy can generate a signal, helping to prevent excessively frequent trades. It defaults to one minute.

The core of a strategy is the `getSignal` function, which calculates signals based on the current symbol's price and a given timestamp. You can even schedule a signal to trigger when a specific price level is reached.

You can also include callbacks for specific lifecycle events, like when a trade opens or closes, for more granular control.

Finally, the schema allows for specifying risk profiles, and even multiple profiles, to manage risk associated with the strategy. You can also associate actions with the strategy.

## Interface IStrategyResult

This interface represents a single result from a backtesting run, designed to be easily compared against other strategies. It holds the name of the strategy being evaluated, a detailed set of statistics generated during the backtest (covering things like profit, drawdown, and win rate), and the value of a key metric used to rank the strategies.  You'll also find the timestamps marking when the first and last trading signals were generated, which helps understand the active period of the strategy. If a strategy didn't produce any signals, these timestamps will be null.

## Interface IStrategyPnL

This interface, IStrategyPnL, helps you understand the profit and loss of a trading strategy. It provides a breakdown of your performance, accounting for realistic trading conditions like fees and slippage. 

You'll find the profit or loss expressed as a percentage (pnlPercentage), making it easy to quickly grasp your overall return. 

The interface also details the entry (priceOpen) and exit (priceClose) prices, both adjusted to reflect the impact of those fees and slippage.

Finally, you can see the actual dollar amount profit or loss (pnlCost) and the total capital you put into the trades (pnlEntries).


## Interface IStrategyCallbacks

This interface defines optional notification hooks that your trading strategy can use to respond to different lifecycle events of a signal. Think of them as event listeners that allow your strategy to react to changes in a signal's status.

For example, `onOpen` is triggered when a new signal is initiated, while `onClose` fires when a signal is finished. You can use `onActive` to monitor a signal that's currently being tracked and `onIdle` to know when there are no active signals.

There are also callbacks for signals that are scheduled for later entry, like `onSchedule` and `onCancel`, and helpful notifications for signals in progress, such as `onPartialProfit`, `onPartialLoss`, and `onBreakeven`.

Finally, `onSchedulePing` and `onActivePing` provide recurring notifications for scheduled and active signals, respectively, which are useful for custom monitoring and potentially adjusting strategies on a minute-by-minute basis. The `onTick` event lets you respond to every price change.

## Interface IStrategy

The `IStrategy` interface defines the core methods for how a trading strategy operates within the backtest framework. It outlines how the strategy reacts to price changes (`tick`), retrieves information about signals (`getPendingSignal`, `getScheduledSignal`), and manages risk (`getBreakeven`, `getStopped`).

You can check how much of your position remains (`getTotalPercentClosed`, `getTotalCostClosed`) and get insights into the effective entry price and cost (`getPositionEffectivePrice`, `getPositionInvestedCount`, `getPositionInvestedCost`).  Furthermore, it allows you to assess performance metrics like PnL (`getPositionPnlPercent`, `getPositionPnlCost`) and details about entries and partial exits (`getPositionEntries`, `getPositionPartials`).

For backtesting, the `backtest` method lets you evaluate the strategy against historical data.  The `stopStrategy` and `cancelScheduled` methods provide ways to pause or modify the strategy's behavior.

The interface also offers methods for manually manipulating signals like `closePending`, `partialProfit`, and `trailingStop`, along with utilities for validation and assessing performance metrics related to profit and loss over the strategy's lifecycle. Finally, `dispose` is used for cleanup when the strategy is no longer needed.


## Interface IStorageUtils

This interface outlines the core functions any storage adapter used within the backtest-kit trading framework must provide. It defines how the system interacts with the storage mechanism for signals, encompassing events like when a signal is opened, closed, scheduled, or cancelled. 

The adapter needs to be able to respond to specific signal events, retrieving and potentially updating signal data. Methods like `findById` allow you to look up a signal based on its unique identifier, while `list` provides a way to view all stored signals. 

Furthermore, the adapter handles "ping" events related to active and scheduled signals, ensuring the data remains current by updating timestamps when those signals are actively in those states. Essentially, it’s the contract between the backtest-kit and your chosen way of persisting signal information.


## Interface IStorageSignalRowScheduled

This interface describes a signal that is scheduled for future execution. It’s used to represent signals that won't be acted upon immediately, but rather at a specific point in time. The key property here is `status`, which will always be set to "scheduled" to indicate its nature. Think of it as a placeholder for a future trade.

## Interface IStorageSignalRowOpened

This interface represents a trading signal that has been triggered and is currently open, meaning a trade is active based on that signal.  It's a simple way to track the state of a signal – specifically, that it's been "opened" or activated.  The `status` property clearly indicates this open status, ensuring consistent understanding across your backtesting or trading systems. It helps to distinguish between signals that are pending, active, or closed.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed and finalized. 

It holds information specifically about signals that have reached a conclusion, unlike signals that are still active.

The `status` property confirms that the signal is indeed in a 'closed' state. 

Crucially, it includes `pnl`, which provides the profit and loss data accumulated for that signal during its lifespan – this data isn’t available for open signals.


## Interface IStorageSignalRowCancelled

This interface represents a storage signal row specifically indicating that a signal has been cancelled. It's used to track the state of a signal within the backtest-kit trading framework.

The only property it defines is `status`, which will always be the string "cancelled". This clearly communicates the signal’s current, terminated state.

## Interface IStorageSignalRowBase

This interface, `IStorageSignalRowBase`, defines the fundamental information needed to store a trading signal, regardless of its specific status. It ensures that every signal saved includes a record of when it was initially created (`createdAt`) and last updated (`updatedAt`).  Furthermore, a `priority` field is included, which helps determine the order in which signals are processed – essentially acting as a timestamp for prioritizing them. This base ensures consistency and accuracy when handling signals, whether they're generated during live trading or a backtest simulation.


## Interface IStateParams

`IStateParams` helps you define how your trading signals are organized and initialized. Think of it as a way to structure the data associated with each signal.

It lets you specify a `bucketName`, which essentially acts as a folder to keep related signal data together – for example, grouping all trade-related data under a "trade" bucket. 

You also define an `initialValue`, which is the starting point for the signal’s data if no previous data is available. This ensures each signal starts with a known and predictable state.


## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data specific to each trading signal. Think of it as a way to track information about a trade as it unfolds, like how much profit it’s made, how long it’s been open, and when to potentially exit. This is especially useful for strategies that use AI to make decisions and need to keep track of these metrics.

This state is designed to be mutable, meaning it can be changed as the trade progresses.  

It allows for resetting the state when a backtest restarts, ensuring consistency without interfering with live trading data.

Here's a breakdown of the key functions:

*   **waitForInit**: This initializes the state when the backtest starts.
*   **getState**: This retrieves the current state at a specific point in time.  It's designed to prevent "looking ahead" by only returning state data if it's available at or before the requested time.
*   **setState**: This updates the state with new information.  Updates with earlier timestamps will overwrite existing data, making it safe to reset during restarts. The updater function can use the current (look-ahead protected) state.
*   **dispose**: This frees up any resources used by the state instance when it’s no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion. It's a way to calculate how much of your capital to risk on each trade, aiming to maximize long-term growth. 

The `method` property is fixed as "kelly-criterion," indicating that this sizing approach is being used.

The `kellyMultiplier` determines how aggressively the Kelly Criterion is applied; a lower value like 0.25 (the default) is a more conservative approach, risking a smaller portion of your capital per trade. Higher values increase the risk and potential reward.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading sizing strategy based on a fixed percentage of your capital. It's straightforward – you specify a percentage, for example, 2%, that you're willing to risk on each trade. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach. The `riskPercentage` property holds the numerical value of that percentage; a value of 2 would represent a 2% risk per trade.

## Interface ISizingSchemaBase

This interface provides a foundation for defining how much of your trading account to allocate to each trade. 

It includes essential properties like a unique sizing name for identification, a note for developers to add helpful context, and limits on position size—both as a percentage of your account and in absolute terms. 

You can also add optional callbacks to customize how sizing behaves at different points in the trading process. This base schema ensures consistent structure and flexibility in your sizing strategies.


## Interface ISizingSchemaATR

This schema defines how to size trades using Average True Range (ATR) as a key factor. 

It’s designed to automatically determine position sizes based on market volatility.

The `method` property simply confirms that this is an ATR-based sizing approach.

The `riskPercentage` property sets the maximum percentage of your capital you're willing to risk on a single trade, typically between 0 and 100.

Finally, the `atrMultiplier` dictates how much space to give your stop-loss order, using the ATR value to calculate a suitable distance – a higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines the parameters needed for Kelly Criterion sizing when setting up your trading strategy. It's all about how much of your capital you'll risk on each trade.

Specifically, you'll need to provide a logger service to help with debugging and understanding how your sizing is working. The logger allows you to see what's happening behind the scenes.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for sizing trades when using a fixed percentage approach. It’s primarily used when setting up a trading strategy. 

You'll need to provide a logger to help with debugging and monitoring your backtest. This logger allows you to output information about the sizing process, which can be very helpful when you're fine-tuning your strategy.


## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, defines the configuration needed for managing trade sizes when using an ATR (Average True Range) based sizing strategy. It’s essentially a set of rules that determine how much capital you'll allocate to each trade.

The most important part is the `logger` property. This allows you to connect a logging service that will report details about the sizing calculations—helpful for debugging and understanding how your sizing parameters are affecting your trades.  Think of it as a way to keep track of what's happening under the hood.


## Interface ISizingCallbacks

This section defines a set of functions you can use to observe and potentially influence the process of determining how much of an asset to trade. 

The `onCalculate` function is triggered immediately after the backtest kit figures out the right size for a trade. You can use this to keep track of the sizes being calculated, or to double-check that the calculations are producing the results you expect. It receives the proposed trade quantity and details about the sizing process as arguments.

## Interface ISizingCalculateParamsKelly

This defines the information needed to calculate trade sizing using the Kelly Criterion. You’ll need to provide the win rate, which represents the probability of a successful trade, expressed as a number between 0 and 1.  You also specify the average win/loss ratio, telling the system how much you typically make on a winning trade compared to how much you lose on a losing one.  These two values are combined to determine an optimal sizing strategy.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed when you're calculating trade sizes using a fixed percentage approach. Essentially, it tells the backtest framework that you want to size your trades based on a predetermined percentage of your available capital.

It requires two key pieces of information:

*   `method`: This confirms you're using the "fixed-percentage" sizing method.
*   `priceStopLoss`: This specifies the stop-loss price you're using for risk management purposes when sizing your trades.

## Interface ISizingCalculateParamsBase

This defines the basic information needed when figuring out how much of an asset to trade. 

It includes the trading symbol, like "BTCUSDT," so you know which asset you're dealing with. 

You also need to know your current account balance to ensure you don't over-trade and the planned entry price, which is crucial for calculating position size.

## Interface ISizingCalculateParamsATR

This interface defines the parameters used when calculating position sizes using an ATR (Average True Range) based method. 

It requires you to specify that the sizing method being used is "atr-based."

You'll also need to provide the current ATR value, which represents the average volatility of the asset. This value will be incorporated into the sizing calculation.

## Interface ISizing

The `ISizing` interface is a core component that handles determining how much of an asset to trade. It's the mechanism that figures out your position size.

The `calculate` property is where the magic happens – it's a function that takes some input parameters and returns a promise that resolves to the calculated position size. This function determines the size of each trade based on your specified risk management rules and other factors.


## Interface ISignalRow

This describes a `SignalRow` object, which represents a single trading signal within the backtest framework. Each signal gets a unique ID assigned automatically. 

It contains all the essential information about a trade, including its cost, entry price, expected duration, and identifiers related to the exchange, strategy, and the timeframe used.  It also includes key timestamps marking when the signal was created, became pending, and the expected duration.

Beyond the basic information, the `SignalRow` tracks details for more advanced features. This includes partial profit and loss calculations, trailing stop-loss/take-profit levels, and a history of any dollar-cost averaging (DCA) entries. It also keeps track of the highest profit and lowest loss points seen for the position. Finally, the signal has a timestamp that records when it was created or requested.

The `_` prefixed properties are used for internal calculations and management of things like trailing prices and partial closes, and aren’t generally used directly. The `_entry` property is used for dollar cost averaging, remembering the original entry price and subsequent averages.


## Interface ISignalIntervalDto

This data transfer object, or DTO, helps manage signals within the backtest-kit framework, especially when dealing with time intervals. It's designed to let you retrieve multiple signals at once, pausing the next signal until a specified time has passed. Each signal has a unique identifier, like a serial number, ensuring you can track it accurately.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a container for all the information needed to execute a trade. It’s the data you’ll receive when requesting a signal and will be automatically assigned a unique ID. The signal specifies whether you should go long (buy) or short (sell) and includes details like the entry price, take profit target, and stop-loss level.  You’ll also provide a short note explaining the reasoning behind the signal. To manage how long a position stays open, you can specify an estimated duration in minutes; otherwise, it will default to a system-defined maximum lifetime. Finally, the signal will include an associated cost representing the trade entry expense.

## Interface ISessionInstance

This interface provides a way to manage temporary data associated with each individual trading decision. Think of it as a container for storing information that's needed during a single backtest run, specifically for a particular symbol, strategy, exchange, and timeframe. This might include things like the results of complex calculations, intermediate steps in indicator setups, or information that needs to be remembered across multiple price updates. 

The `waitForInit` method sets up the session at the beginning, while `setData` allows you to store new data points along with a timestamp.  `getData` lets you retrieve that data at a specific point in time, ensuring you aren't looking ahead at future information. Finally, `dispose` cleans up any resources used by the session when it's no longer needed. It's designed to be a flexible way to handle small, temporary datasets during the backtesting process.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's designed to be executed when a specific price level is reached. Think of it as a signal that's 'waiting' for the market to move to a certain price before triggering.

It builds upon a base signal (`ISignalRow`) and represents a signal that’s pending until the market reaches a target price.

Once the price hits the `priceOpen` value, it transforms into a standard, active signal.

The `priceOpen` property simply defines that target price – the level the market needs to reach for the signal to activate.


## Interface IScheduledSignalCancelRow

This interface, `IScheduledSignalCancelRow`, represents a scheduled signal that might have been cancelled by a user. It builds upon the existing `IScheduledSignalRow` and adds information specifically related to user-initiated cancellations. If a user cancels a scheduled signal, the `cancelId` property stores a unique identifier for that cancellation action, and `cancelNote` holds any additional notes the user provided during the cancellation process. These properties only apply when a signal has been cancelled by a user.

## Interface IRunContext

This interface, `IRunContext`, acts like a central hub of information whenever a function needs to be executed within the backtest-kit framework. Think of it as a single package containing everything a function needs to know – details about the trading strategy and exchange it’s running on, alongside the current market conditions like the symbol and timestamp. It bundles together separate pieces of information, routing details and runtime state, so you don't have to pass them individually.  The framework then unpacks this combined context, distributing its components to specialized services for handling.

## Interface IRiskValidationPayload

This object holds the data needed to assess risk when a trading signal comes in. It builds upon a foundation of basic signal arguments and adds details about your portfolio's current state.

Specifically, you'll find the `currentSignal` itself, which represents the signal being evaluated, and information about your open positions.

The `activePositionCount` tells you how many positions are currently open.

The `activePositions` array provides a list of those open positions, allowing you to understand the specifics of what's already in your portfolio.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and sound. Think of it as a gatekeeper – it checks if certain conditions are met before a trade is allowed. If everything looks good, it lets the trade proceed. If something's amiss, it signals a rejection, providing a reason why the trade was blocked. This rejection can be a specific object detailing the problem, or it can be triggered by an error that the system catches and converts into that rejection object.

## Interface IRiskValidation

This interface helps you define and document how you want to validate risks in your trading strategies. It's essentially a way to specify a function (`validate`) that performs the actual risk check, and a helpful note (`note`) to explain what that check is for. Think of it as providing both the 'how' and the 'why' for your risk validation process. You'll use this to clearly outline the criteria used to assess risk.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps with managing risk during trading. It builds upon existing signal data by adding key pricing information. Specifically, it stores the entry price (`priceOpen`) for a position, along with the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels. This data is essential for validating risk parameters and ensuring proper risk controls are in place.

## Interface IRiskSchema

The IRiskSchema lets you set up custom risk controls for your portfolio, essentially defining rules to ensure your trading stays within acceptable boundaries. Think of it as creating a personalized safety net for your investments.

Each schema has a unique name to identify it, and you can add notes to explain the purpose of the risk control to other developers. You can also specify callbacks, which are like event listeners that trigger actions when a risk check is rejected or allowed.

The most important part is the validations – this is where you define the specific checks and rules your portfolio will follow. These validations can be simple functions or more complex objects, allowing for a wide range of risk management strategies.

## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details to help you understand why the validation didn’t pass. Each rejection has a unique identifier (`id`) to track it specifically.  A human-readable explanation (`note`) is included to clearly explain the reason for the rejection, making it easier to debug and fix the underlying issue.

## Interface IRiskParams

The `IRiskParams` object defines the configuration settings for managing risk within the backtesting or live trading environment. It includes essential information like the name of the exchange being used, a logger for debugging, and a time service to ensure accurate and unbiased calculations. This object also determines whether the system is in backtest or live mode, and provides a callback function (`onRejected`) that gets triggered whenever a trading signal is blocked due to risk constraints. This callback lets you emit custom events related to risk rejections.

## Interface IRiskCheckOptions

This section defines options for managing risk during concurrent trading operations. Specifically, the `reserve` option provides a mechanism to ensure that multiple trading checks happening at the same time see a consistent view of existing positions. When `reserve` is set to true, the system temporarily marks a position as reserved, which prevents other checks from over-allocating until the actual trade execution happens. This avoids potential conflicts and ensures the integrity of your trading strategy.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to assess whether a new trade should be allowed. Think of it as a checklist run before a trading signal is actually executed – it helps ensure conditions are right for the trade. It bundles together essential data from the broader trading environment, like the trading pair's symbol ("BTCUSDT"), the signal being considered, and details about the strategy making the request. You'll find details like the exchange being used, a name for the risk management setup, and even the current price and timestamp involved. Essentially, it's a snapshot of the situation to help make informed decisions about risk.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategies can use to respond to risk-related events during backtesting. Think of them as notification points that let you know when a trade is either approved or blocked by your risk management system.

The `onRejected` function is triggered when a trading signal fails a risk check – essentially, when the risk management system prevents a trade from happening. It receives the symbol being traded and details about the risk check that failed.

Conversely, the `onAllowed` function is called when a trading signal successfully passes all the risk checks, indicating that the trade is approved. Again, you'll receive the symbol and details about the successful check. 

These callbacks allow you to monitor and potentially react to these risk-related decisions within your backtesting process.

## Interface IRiskActivePosition

This interface describes an active trading position that's being monitored to understand risk across different strategies. It essentially holds all the key details of a trade.

You’ll find information like the name of the trading strategy that initiated the position, which exchange it's on, and the timeframe used for analysis.  It also includes specifics about the trade itself: the symbol being traded (like BTCUSDT), whether it’s a long or short position, the entry price, and the levels for stop-loss and take-profit orders.

Finally, it keeps track of estimated duration and when the position was initially opened, helping to analyze the trade's timeline.


## Interface IRisk

The `IRisk` interface is responsible for managing risk and tracking positions in your trading strategies. It allows you to ensure that your trades stay within predefined risk limits.

`checkSignal` is a function that assesses whether a proposed trade is acceptable based on your risk rules – it returns a simple yes or no.  `checkSignalAndReserve` is a safer version of `checkSignal`; it confirms the trade is okay and immediately sets aside a space for the trade in the system's records.  This prevents multiple strategies from exceeding the risk limits when they’re all trying to trade at the same time. Remember to always follow up on a successful `checkSignalAndReserve` by either fully adding the trade with `addSignal` or completely canceling it with `removeSignal`.

`addSignal` formally registers an opened position, adding its details to the system’s records. Finally, `removeSignal` cleans up the system when a trade is closed, removing its record.

## Interface IReportTarget

This interface lets you fine-tune which detailed reports are generated during your trading simulations. It’s a way to control the level of detail in your JSONL event logs.

You can choose to activate logging for specific events like strategy commits, risk rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading activity, backtest signal closures, synchronization of signals, and milestones like reaching the highest profit or maximum drawdown. Think of it as a checklist to choose what information you want to keep track of. Enabling certain flags will provide more detailed information about specific aspects of your trading activity.

## Interface IReportDumpOptions

This interface lets you control what information gets written to reports when analyzing your trading strategies. Think of it as a way to filter and label your data. You can specify the symbol, like BTCUSDT, the name of your strategy, the exchange used, the timeframe (like a 1-minute chart), a unique ID for a signal, and a name for the optimization walker.  By providing these details, you ensure your reports are organized and easy to understand, especially when dealing with many different strategies and setups.

## Interface IRecentUtils

This interface defines how different storage systems can manage and provide recent trading signals. It's all about keeping track of the most up-to-date information for a particular trading strategy and symbol.

The `handleActivePing` method is how the system updates the signal storage when a new signal comes in.

`getLatestSignal` fetches the most recent signal, but it's designed to be careful about looking into the future; it ensures signals aren't used before their actual time.

Finally, `getMinutesSinceLatestSignalCreated` helps you determine how long ago the last signal was generated, which is useful for timing and analysis.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, is designed to provide external users with a clear view of a trading signal's original settings and performance. It builds upon the standard signal data by including the original stop-loss and take-profit prices that were initially set when the signal was created. This is important because even if those prices are adjusted later through trailing stops or other mechanisms, users still need to know the initial values for transparency and understanding.

Think of it as a way to show the "blueprint" of the trade alongside the "current state."  You'll find information like the initial cost of the trade, how much of the position has been partially closed, and the total number of entries or partials that have occurred.

It also provides key performance metrics, such as the current unrealized profit and loss (pnl), the highest profit achieved (peakProfit), and the largest drawdown experienced.  These figures are calculated relative to the original entry price, giving a complete picture of the trade’s journey so far. The original entry price itself is also preserved, allowing for auditing and verification.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick, representing a specific time window in trading data. Each candlestick includes the precise timestamp indicating when the period began, the opening price, the highest and lowest prices reached, the closing price, and the total trading volume for that time. Think of it as a snapshot of market activity during a defined interval. Essentially, it's the data that lets you visualize and analyze price movements and trading activity over time.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the essential information needed to calculate position sizes using the Kelly Criterion. It focuses on the core inputs required for this sizing method.

You’ll need to provide a `winRate`, representing the probability of a winning trade, expressed as a value between 0 and 1.

Also, specify the `winLossRatio`, which describes the average profit you make on a winning trade compared to the loss on a losing one. These two values allow the framework to determine a suggested position size based on your trading performance.


## Interface IPositionSizeFixedPercentageParams

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your available capital for each trade, and incorporates a stop-loss order. Specifically, `priceStopLoss` tells the system at what price to place your stop-loss order to protect your investment. You'll use this to ensure that losing trades don't significantly impact your overall portfolio.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` object holds the settings you'll use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR). 

It currently only contains one piece of information:

*   `atr`: This represents the current ATR value, which is used in the position sizing calculation. It tells you how much the price has been fluctuating recently.

## Interface IPositionOverlapLadder

This interface helps you define a safety zone around your Dollar-Cost Averaging (DCA) levels when backtesting. It lets you specify how much above and below each DCA price point is considered an overlap.

Think of it as setting a buffer – `upperPercent` tells you how high above a DCA price is before it's flagged as overlapping, and `lowerPercent` does the same for prices below the DCA.  These percentages are expressed as values from 0 to 100, so 5 represents 5%. This allows you to fine-tune how sensitive your overlap detection is during backtesting.

## Interface IPersistStorageInstance

This interface defines how to manage persistent storage for trading signals, specifically for either backtesting or live trading scenarios. It lets you customize how signal data is saved and loaded, instead of relying on the default file-based system.

The `waitForInit` method prepares the storage area when the system starts up, indicating whether it's a fresh initialization.

The `readStorageData` method retrieves all previously saved signals and organizes them into a structured format.

Finally, `writeStorageData` saves a collection of signals, associating each signal with a unique identifier for easy retrieval.

## Interface IPersistStateInstance

This interface defines how to manage persistent state for a trading strategy, ensuring that information isn't lost even if things go wrong. Think of it as a way to save and load the current status of your strategy, specifically tied to a combination of a signal and a bucket (like a timeframe). 

If you're building a custom way to store this data—perhaps using a database instead of files—you’ll need to implement this interface.

Here's a breakdown of what the methods do:

*   `waitForInit`: This lets you set up the storage when it first starts up, essentially giving it a heads-up.
*   `readStateData`: This fetches any saved state data related to your strategy's current situation.
*   `writeStateData`: This is how you save the current state of your strategy, including a timestamp of when the update occurred.
*   `dispose`:  This is a cleanup function. You can use it to release any resources your custom storage is holding. If you don't need to do anything special, it can simply do nothing.

## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a particular strategy. It essentially provides a way to manage the signal data – things like buy/sell decisions – for a specific combination of asset (symbol), trading strategy, and exchange. 

If you want to store signals in a database instead of a file, or use a different method for persistence, you can build a system that follows this interface.

The `waitForInit` method lets you prepare the storage space before anything happens. The `readSignalData` method retrieves previously saved signal data, and the `writeSignalData` method lets you save the current signal data, or clear it entirely.

## Interface IPersistSessionInstance

This interface defines how to manage persistent data specifically for a trading strategy, exchange, and frame combination. It's a way to make sure your session data—like settings or intermediate results—survives unexpected interruptions like crashes.

If you need more control over where and how this data is stored (beyond the default file-based approach), you can create your own implementation of this interface.

The methods provided handle initialization, reading existing data, saving new data with a timestamp, and cleaning up resources when the session is done. Think of it as a standardized way to load, save, and release data tied to a particular trading scenario.


## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit stores and retrieves scheduled signals for a specific trading setup – think of it as managing the records of when to execute certain actions. It’s designed to work with a particular combination of the asset you're trading (symbol), the trading strategy you're using (strategyName), and the exchange where you're operating (exchangeName).

If you want to avoid the default file-based storage and instead use something different, like a database, you’ll need to create a class that implements this interface.

The `waitForInit` method allows you to set up the storage space before anything happens.  `readScheduleData` fetches the previously saved signal information. Finally, `writeScheduleData` saves new or updated signal information – or clears it completely if you provide `null`.


## Interface IPersistRiskInstance

This interface helps manage how trading activity data, specifically risk positions, is stored for a particular trading context. Think of a context as a specific combination of a risk profile and an exchange – like “high-risk strategy on Binance.”

If you want to customize how this data is saved (perhaps using a database instead of a file), you can create a class that implements this interface.

The `waitForInit` method allows you to prepare the storage area when things start up. The `readPositionData` method retrieves previously saved positions for a given point in time, and the `writePositionData` method is responsible for saving the current risk positions to storage.

## Interface IPersistRecentInstance

This interface defines how to manage the most recent trading signal for a specific setup – think of it as remembering what you were doing last time for a particular strategy and market. It helps keep track of your signals separately for backtesting and live trading, so your historical records aren't mixed with your current activity. 

If you want to customize how these signals are saved (instead of using the default file storage), you can build your own adapter that follows this interface.

Here’s what the interface requires:

*   **waitForInit:** A way to prepare the storage when things start up.
*   **readRecentData:**  A function to load the last saved signal.
*   **writeRecentData:** A function to save the current signal, along with the time it occurred.

## Interface IPersistPartialInstance

This interface defines how to save and load partial profit and loss information for a specific trading setup—think of it as a way to remember where you were in a trade. It’s tied to a particular combination of asset (symbol), trading strategy (strategyName), and exchange (exchangeName).

Essentially, for each trading signal, the system keeps track of its progress and stores that information separately.

If you want to change how this data is stored – maybe you want to use a database instead of a file – you can create a custom adapter that follows this interface.

The `waitForInit` method sets things up for a particular trading context.

`readPartialData` lets you retrieve the saved progress for a specific signal at a given point in time.

Finally, `writePartialData` is how you save the current progress of a trading signal.

## Interface IPersistNotificationInstance

This interface provides a way to manage and store notifications specifically for either backtesting or live trading. Think of it as a customizable storage system for important events that need to be remembered.

If you want to change how notifications are saved (instead of using the default file storage), you can build your own adapter that follows this interface. 

The `waitForInit` method sets things up when the storage is first needed. `readNotificationData` retrieves all the notifications that have been saved. Finally, `writeNotificationData` is used to save new notifications or update existing ones, linking them by a unique ID.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context, like a particular trading signal and bucket. It's designed to let you customize how memory entries – the information your trading system remembers – are saved, typically to disk. 

You can use this to manage the lifecycle of memory entries, including reading them by ID, checking if they exist, and writing new ones. Importantly, it supports a "soft delete" feature, allowing you to mark entries as removed without permanently deleting them from storage. The `listMemoryData` method provides a way to access all active memory entries, which is useful for rebuilding indexes. Finally, `dispose` lets you clean up any resources this storage uses when it's no longer needed.


## Interface IPersistMeasureInstance

This interface defines how to handle storing and retrieving cached data for each trading strategy bucket. Think of it as a way to save responses from external APIs so you don’t have to repeatedly fetch them.

It includes methods for initializing the storage, reading cached data by a unique key, writing new data to the cache, and removing data – which is done as a "soft delete" (meaning the file remains on disk but is ignored).

The `waitForInit` method prepares the storage space.

The `readMeasureData` function lets you get a specific cached entry.

`writeMeasureData` saves a new entry to the cache, along with a timestamp.

`removeMeasureData` acts like deleting data but keeps the file around, still accessible but ignored.

Finally, `listMeasureData` provides a way to see all the available keys of entries that haven't been "soft deleted."

If you need to customize how this caching happens (like using a different storage method than the default file-based system), you can create your own adapter that implements this interface.

## Interface IPersistLogInstance

This interface defines how to manage the global log storage used by the backtest-kit. It's designed for situations where you want to customize how log data is saved, moving away from the default file-based approach.

Think of it as a central place to hold all log entries, accessible throughout the process, and it doesn't rely on any specific context.

If you want to store logs in a database or some other system, you can create your own adapter that implements this interface.

The `waitForInit` method lets you ensure the log storage is ready before you start using it. `readLogData` retrieves all the existing log entries, and `writeLogData` is used to add new log entries, ensuring no duplicates are added by checking the entry’s ID.


## Interface IPersistIntervalInstance

This interface defines how to persist information about when a specific time interval has already been processed for a particular data bucket. It's used internally by the backtest-kit to ensure certain actions only happen once per interval.

Think of it like a flag that says "we've already done this for this time and data combination."

If you're building a custom adapter to handle persistence differently (like using a database instead of a file), you'll need to implement this interface.

Here's what the methods do:

*   `waitForInit`: Sets up the storage for the data related to a bucket.
*   `readIntervalData`: Retrieves existing information about a specific interval.
*   `writeIntervalData`: Creates or updates the record indicating an interval has fired.
*   `removeIntervalData`: Essentially "unmarks" an interval, allowing it to be processed again later.
*   `listIntervalData`: Provides a way to get a list of all the intervals that have been processed and haven’t been marked as removed.

## Interface IPersistCandleInstance

This interface provides a way to store and retrieve candle data for a specific trading symbol, timeframe, and exchange, acting like a dedicated memory space for that combination. Think of it as a local storage area tailored to a particular set of conditions. 

It's designed so that you can customize how this data is persisted, whether that’s to a file, a database, or some other storage mechanism. 

The `waitForInit` method sets up the storage space when needed. `readCandlesData` lets you get a batch of candles within a specific time range; if even one candle is missing, it signals a cache miss, prompting a retrieval from the original data source.  Finally, `writeCandlesData` allows you to save new candle data, keeping in mind that incomplete data or existing data might be skipped to maintain the integrity of the cache.


## Interface IPersistBreakevenInstance

This interface defines how your trading system can save and retrieve breakeven data for individual trades. Think of it as a way to remember the crucial information needed to calculate when a trade becomes profitable. 

It organizes this data based on the specific asset (symbol), trading strategy, and exchange being used – so each combination has its own dedicated storage space.

Each individual trade "signal" has its own record within that storage.

If you want to use a different way of storing this data – perhaps in a database instead of a file – you can build a custom adapter that implements this interface.

The `waitForInit` method lets you prepare the storage area when the system starts up.

`readBreakevenData` retrieves the saved breakeven information for a particular trade signal at a specific date.

`writeBreakevenData` saves the breakeven details for a trade signal.

## Interface IPersistBase

This interface provides a standard way for your custom storage solutions to interact with the backtest-kit framework. It outlines the basic functions needed to read, write, and manage data – think of it as the foundation for persistence. 

Specifically, you'll find methods to initialize and validate data, retrieve individual entities by their ID, check if an entity already exists, and write data safely. 

A helpful `keys` method lists all the entity IDs, sorted for easy iteration and verification, letting you quickly see what’s stored. If you're building a custom persistence adapter, you'll implement this interface to ensure compatibility with the rest of the system.


## Interface IPartialProfitCommitRow

This interface describes a single action to take regarding a partial profit commitment during a backtest. Essentially, it represents one step in a plan to close a portion of your trading position.

It includes details like the percentage of the position that should be closed ( `percentToClose`), the price at which the action was executed (`currentPrice`), and a confirmation that this is indeed a partial profit action (`action`). 

Think of it as a record of one specific instruction to take some profits from a trade.

## Interface IPartialLossCommitRow

This describes a record representing a partial loss order that's been queued for execution. 

It's essentially a notification that a portion of your position needs to be closed out.

The `action` property clearly indicates this is a "partial-loss" action.

The `percentToClose` tells you what percentage of your current position will be closed.

Finally, `currentPrice` gives you the price at which the partial loss order was executed, useful for verifying the trade.

## Interface IPartialData

IPartialData helps save important information about a trading signal so it can be restored later. It's like a snapshot of key details.

It contains arrays of profit and loss levels, which are basically the points where the trade has become more or less profitable. These levels are stored as arrays instead of sets to make saving and loading the data easier.

Think of it as a way to remember the progress of a trade even if the system restarts. The data is structured to be easily saved and then rebuilt into a complete trading state.

## Interface IPartial

The `IPartial` interface manages how trading signals track their profit or loss. It’s the foundation for components like `ClientPartial` and `PartialConnectionService`.

When a signal is making money, the `profit` method steps in to monitor its progress, noting when it hits milestones like 10%, 20%, or 30% profit. Similarly, the `loss` method handles situations where a signal is losing, flagging those loss percentage thresholds. 

Both methods make sure you only get notified about *new* profit or loss levels.

Finally, the `clear` method comes into play when a signal is finished – whether it hits a target price, a stop-loss, or simply runs out of time. It wipes the signal's profit/loss record, saves the changes, and prepares for the next signal.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered when command-line arguments are processed. It's essentially a way to understand how the application should be run – whether it’s a backtest using historical data, a paper trading simulation using live data, or a live trading session with real money. The object contains three key properties: `backtest`, `paper`, and `live`, each being a boolean value that indicates whether that particular mode should be active.

## Interface IParseArgsParams

The `IParseArgsParams` interface helps define what information is needed to run a trading strategy. Think of it as a checklist of essential details. It specifies properties like the trading symbol (like BTCUSDT), the name of the strategy you want to use, which exchange you're connecting to (like Binance or Bybit), and the timeframe for the data, for example, one-hour candles. Providing these values ensures the backtest knows exactly what to analyze and how.

## Interface IOrderBookData

The `IOrderBookData` interface describes the structure of order book information. It holds data related to a specific trading pair, identified by its `symbol`.

This data includes the current bids, which represent buy orders, and the asks, which represent sell orders. Both bids and asks are arrays of objects with similar structures containing price and quantity details. Essentially, it's a snapshot of what buyers and sellers are currently offering for a particular asset.

## Interface INotificationUtils

This interface serves as a foundation for different ways your backtesting system can communicate and receive updates. Think of it as a central hub for notifications about what's happening in your strategy.

It defines a set of methods to handle various events, such as when a trade opens or closes, when partial profit or loss opportunities arise, or when there are any errors encountered. 

You’ll find methods for handling signal events, strategy adjustments, synchronization tasks, and different types of error conditions.  

The `getData` method allows you to retrieve a history of these notifications, while `dispose` provides a way to clear them out when you're finished. Essentially, this interface allows you to plug in different notification mechanisms to keep you informed about your backtest’s progress and any issues it encounters.

## Interface INotificationTarget

The `INotificationTarget` interface lets you finely control which updates your backtest or live trading system sends you. Instead of receiving every possible notification, you can pick and choose just the ones you're interested in, making the information flow more manageable.

Think of it as a filter for the different types of messages the system generates.

Here's a breakdown of what you can subscribe to:

*   **Signal Events:** Get notified about signals being created, scheduled, closed, or canceled.
*   **Partial Profit/Loss Notifications:** Receive updates when the price hits pre-defined partial profit or loss levels.
*   **Breakeven Notifications:** Be alerted when the price reaches the breakeven point.
*   **Strategy Commit Confirmations:** Track when the strategy actually executes actions like taking partial profits, losses, or activating schedules.
*   **Signal Synchronization:** Stay informed about when orders are confirmed filled or positions are exited via the exchange sync layer.
*   **Risk Rejections:** Understand when the risk manager prevents new signals from being opened.
*   **Informational Signals:** Receive custom messages or notes that are linked to active trading signals.
*   **Errors:**  Get notified of non-fatal errors (recoverable) and critical, unrecoverable errors that might stop the backtest.
*   **Validation Errors:** Be alerted if there are problems with your strategy's setup or input data.

If you don't specify an `INotificationTarget`, you'll receive all these notifications by default.

## Interface IMethodContext

The `IMethodContext` object acts as a central piece of information for your backtesting or trading processes. It essentially tells the system *where* to find the specific configurations it needs to run. Think of it as a guide, containing the names of the strategy, exchange, and frame schemas being used. 

This context is automatically passed around within the backtest-kit framework, so you typically won't have to handle it directly.

It holds three key pieces of information:

*   `exchangeName`: Identifies which exchange setup to use.
*   `strategyName`: Identifies which trading strategy to employ.
*   `frameName`:  Specifies the time frame for analysis – if this is empty, it signifies a live trading mode.

## Interface IMemoryInstance

The `IMemoryInstance` interface provides a standardized way to interact with memory storage, whether it's a local, persistent, or test-based setup. It allows you to initialize the memory instance, write data to it with a timestamp and description, and retrieve that data later.

You can search through your stored data using a search term and a timestamp to find relevant entries. 

Furthermore, you can list all entries up to a specific timestamp, remove individual entries, or read a single entry by its ID and timestamp. 

Finally, the `dispose` method allows you to clean up any resources used by the memory instance when you're finished with it.


## Interface IMarkdownTarget

This interface lets you fine-tune what kinds of reports are generated during your backtesting process. Think of it as a way to control which aspects of your trading strategy you want detailed information about.

You can choose to activate reports for things like strategy signals (entry and exit points), risk management decisions, breakeven events, partial profits, portfolio performance visuals, strategy comparisons, performance bottlenecks, and scheduled signal tracking. 

There are also options for reports related to live trading, backtest results, signal synchronization, and milestones like the highest profit achieved or maximum drawdown experienced. You essentially pick and choose the reports that are most valuable for understanding and optimizing your trading strategy.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps organize and control how information is exported into Markdown documents. Think of it as a set of instructions for generating reports.

It bundles together details like the directory where the report should be saved, the specific file name, and key identifiers such as the trading pair (like BTCUSDT), the name of the strategy being used, the exchange platform, the timeframe, and a unique ID for the signal.  These properties allow you to easily target and filter the information included in the generated Markdown documentation.


## Interface ILogger

The `ILogger` interface is all about keeping a record of what's happening inside the backtest-kit system. Think of it as a way to track events, errors, and important details so you can understand how everything is working. 

It provides different levels of logging to suit various needs:

*   `log`:  For recording standard events and changes.
*   `debug`: For really detailed information used mostly when debugging or troubleshooting.
*   `info`: For keeping track of successful actions and high-level system activity.
*   `warn`: For noting potential problems that don’t stop the system, but might need a look.

These logs help with debugging, monitoring performance, and ensuring the system is working as expected.

## Interface ILogEntry

This interface defines what a single log entry looks like within the backtest-kit framework. Each log entry has a unique ID and a level indicating its importance, such as "log", "debug", "info", or "warn."  Timestamps are included to help with organizing and managing log data, and they're related to the context of the backtest. 

Beyond the basics, you can also associate extra information with each log entry, like the specific method or execution context it came from, which is very useful for debugging complex trading strategies. Finally, any additional arguments passed when creating the log are also stored within the entry.

## Interface ILog

The `ILog` interface lets you keep track of what's happening in your backtests and easily review them later. It provides a way to collect log messages and, crucially, gives you the ability to retrieve a complete history of those messages. You can use this to debug issues, understand the sequence of events during a trade, or simply verify that everything ran as expected. The `getList` method is the key – it’s how you grab that full history of log entries all at once.

## Interface IHeatmapRow

This interface defines the data presented in a single row of a heatmap, summarizing the performance of all strategies for a specific trading pair like BTCUSDT. It provides a comprehensive overview of the trading results, including key metrics such as total profit or loss, the Sharpe Ratio which measures risk-adjusted return, and the maximum drawdown representing the largest potential loss.

You'll find details on the number of trades, how many were wins versus losses, and the win rate. It also includes insights into the average profit per trade, the volatility of those profits, and the average size of both winning and losing trades.

Further metrics like maximum winning and losing streaks, expectancy, and several risk-adjusted performance ratios (Sortino, Calmar, and Recovery Factors) are available, providing a detailed picture of the trading pair’s profitability and risk profile. The average peak and fall PNL give an idea of how high and low the trading performance typically goes.

## Interface IFrameSchema

The `IFrameSchema` describes a distinct period and frequency for generating data within your backtest. Think of it as defining a specific lens through which you want to view your trading strategy’s performance. Each schema has a unique `frameName` to identify it, and can include a `note` for your own records.

You specify the `interval` – like daily, hourly, or minute-by-minute – to control the granularity of the data.  The `startDate` and `endDate` clearly mark the beginning and end of this period for testing.  Finally, you can add `callbacks` to hook into different points of the frame lifecycle for custom logic or debugging purposes.

## Interface IFrameParams

The `IFrameParams` object holds the settings you pass when creating a ClientFrame, which is a core component for running trading simulations. It builds upon the `IFrameschema` definition and crucially includes a `logger` – this is how you'll see detailed messages about what the backtest is doing, helping you troubleshoot and understand its behavior. Think of the logger as your window into the backtest's inner workings.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you listen in on key moments in the timeframe creation process. Specifically, the `onTimeframe` function allows you to be notified when a new set of timeframes is generated. This is a great place to check if the timeframes look right, record information about them, or make sure they align with your expectations. You'll receive the actual array of dates, the start and end dates defining the period, and the interval used to create them.

## Interface IFrame

The `IFrame` interface is a core component that handles the creation of timeframes for backtesting. Think of it as the engine that determines *when* your trading simulations will run.

It's primarily used behind the scenes by the backtest-kit, so you usually won’t interact with it directly.

The main function is `getTimeframe`, which takes a symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour intervals) and returns an array of timestamps.  These timestamps will be used to drive each step of the backtesting process, ensuring your strategy is tested at regular intervals. It uses a defined spacing between each timestamp to accurately represent the chosen timeframe.

## Interface IExecutionContext

The IExecutionContext interface provides the information your trading strategies and exchange interactions need to function correctly. Think of it as a shared understanding of the current situation. It includes details like the trading symbol, such as "BTCUSDT," and the precise current timestamp. Importantly, it also indicates whether the strategy is running in a backtesting environment (simulated historical data) or a live trading scenario. This context is passed around automatically, so you don't have to worry about constantly passing these values manually.


## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific exchange. It's essentially a blueprint that tells the framework where to find candle data, order books, and trades, and how to format numerical values.

You'll use it to register an exchange, giving it a unique name for identification.  There's a field for optional notes, useful for developers to add clarifying details.

The most important part is `getCandles`, which tells the framework exactly how to retrieve historical price data – it needs to know the symbol, time interval, start date, a limit on the number of candles to retrieve, and whether it's a backtest.

`formatQuantity` and `formatPrice` are for ensuring that trade sizes and prices are displayed correctly according to the exchange's rules. If you don’t provide these, the framework will use default Bitcoin precision.

If you need order book data or aggregated trades, you can also supply `getOrderBook` and `getAggregatedTrades` functions, although they're optional and will cause an error if you try to use them without defining them.

Finally, you can register callbacks to handle events like new candle data arrival.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect and interact with an exchange within the backtest-kit framework. It acts as a blueprint for how the framework will communicate with the exchange, providing necessary functionalities.

Think of it as providing the framework with the tools it needs to talk to and retrieve data from an exchange.

It requires you to supply services for fetching historical data like candles, aggregated trades, and order books, along with tools to handle formatting quantities and prices in a way that's compatible with the exchange's rules.  You'll also provide a logger to track and debug the process. Importantly, all these methods are mandatory; the framework relies on them to function correctly, though sensible defaults are available if you need them. The execution context provides crucial information like the symbol being traded, the trading time, and whether it's a backtest run.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening while the system is getting data from an exchange. Specifically, it’s about receiving information related to price movements and historical data. 

You can provide a function called `onCandleData` to be notified whenever the framework retrieves candlestick data. This function will give you details like the trading symbol, the time interval of the data (e.g., 1 minute, 1 hour), the starting date for the data retrieval, how many data points were requested, and the actual candlestick data itself. You can use this to perform custom actions as new data becomes available.

## Interface IExchange

The `IExchange` interface defines how your backtest kit interacts with a simulated or real cryptocurrency exchange. It provides tools to retrieve historical and future market data, format order quantities and prices to match the exchange's requirements, and calculate key indicators.

You can easily fetch historical candle data (like open, high, low, close prices and volume) for a specific trading pair and timeframe, looking backward from the current point in time. There's also a way to peek into the future – useful for backtesting scenarios.

To help with order placement, the interface includes methods for correctly formatting the quantity and price of your trades to match the exchange’s precision rules.

Calculating the Volume Weighted Average Price (VWAP) is straightforward, using the data from recent candles.

You can also grab the latest close price for a given interval, retrieve the current order book for a trading pair, or get aggregated trade data.

The raw candle data retrieval method is flexible, allowing you to specify start and end dates along with a limit to precisely control the data range you receive. The system carefully respects the execution context to avoid issues like looking into the future.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for any data object that's saved or retrieved from storage within the backtest-kit framework. Think of it as a common starting point, ensuring all persistent objects have a consistent structure. It’s designed to make managing and working with data more predictable and organized.

## Interface IDumpInstance

This interface defines how you save data snapshots during a backtesting run. Think of it as a way to capture specific pieces of information at different points in time, like the conversation history with an AI agent or the results of a calculation. Each snapshot, or "dump," is tied to a particular signal and data bucket, ensuring context. 

You’ll use methods like `dumpAgentAnswer` to save the full messages from an agent interaction, `dumpRecord` to store simple key-value pairs, `dumpTable` for storing data in a structured table format, and `dumpText` for general text output. Errors can be saved with `dumpError`, and complex data structures can be stored as JSON with `dumpJson`. Finally, `dispose` is a way to clean up any resources the instance is holding when you're done with it.

## Interface IDumpContext

The IDumpContext provides essential information for each data entry being recorded, particularly during the dumping process. Think of it as a label attached to each piece of data, helping organize and understand it later. It includes a unique signal identifier, linking the data to a specific trade, and a bucket name to group data by strategy or agent. 

Each dump also gets a unique ID and a descriptive label that’s helpful for understanding its contents and for searching. Finally, a flag indicates whether the data originates from a backtest or live trading environment.

## Interface ICommitRowBase

This interface defines the basic structure for events related to committing data, especially when dealing with situations where timing is critical. Think of it as a building block for more complex commit events. 

It holds two key pieces of information: the trading symbol involved, and a flag indicating whether the event happened during a backtesting simulation. This helps to ensure that commits are processed correctly, even when the system's environment changes.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your trading data (candles) are available and stored correctly. It’s how the system verifies if it has the necessary historical data for backtesting. You’ll provide the symbol of the trading pair, the exchange name, the time interval for the candles (like 1-minute or 4-hour), and a date range to specify which candles you’re checking. Essentially, it lets you confirm that your historical data is in place before running a backtest.

## Interface ICandleData

This interface defines a single candle, representing a period of time in trading data. Each candle contains key information like the time it started (timestamp), the opening price, the highest and lowest prices reached during that time, the closing price, and the total volume of trades that occurred. This structure is essential for tasks like calculating VWAP and running backtests to evaluate trading strategies. Think of it as a snapshot of market activity over a specific interval.

## Interface ICacheCandlesParams

This interface defines the settings you can use to control how caching works within the backtest-kit framework. It lets you hook into the process at different stages, giving you the opportunity to run custom logic. Specifically, you can provide functions that are triggered right before the initial validation check begins, and again before the warm-up phase starts if validation fails. These functions provide information about the symbol, interval, and the date range being processed.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework interacts with a live trading broker. Think of it as the bridge connecting the simulation to a real exchange.

Before the framework takes any actions, it calls methods defined in this interface. This means that if something goes wrong during these calls, the framework's internal state remains unchanged, ensuring a reliable and consistent process.

Importantly, during backtesting, these broker calls are essentially ignored—the adapter doesn't receive any trading instructions.

Here's a breakdown of the individual methods:

*   `waitForInit`: This method is called at the beginning to set up the connection to the broker, load any required credentials, or perform any initial setup tasks.
*   `onSignalCloseCommit`: This method is invoked when a trade is closed, whether it’s because of a take-profit order, a stop-loss trigger, or a manual action.
*   `onSignalOpenCommit`: This gets called when a new trade is opened and confirmed.
*   `onPartialProfitCommit`:  Used to handle partial profit-taking actions.
*   `onPartialLossCommit`: Handles partial loss events.
*   `onTrailingStopCommit`: Called to update trailing stop orders.
*   `onTrailingTakeCommit`: Called to adjust trailing take-profit levels.
*   `onBreakevenCommit`:  Handles setting or adjusting breakeven stops (moving a stop-loss to the entry price).
*   `onAverageBuyCommit`:  Used for DCA (dollar-cost averaging) entries.

## Interface IBreakevenData

This interface, `IBreakevenData`, holds simple information about whether a breakeven point has been achieved for a trading signal. It's designed to be easily saved and loaded, particularly when dealing with persistent data storage. Think of it as a snapshot of the breakeven status – just a 'yes' or 'no' (true or false) indicating if the target has been met. The data is stored alongside other signal information, and when loaded, it's transformed into a more complete breakeven state representation.

## Interface IBreakevenCommitRow

This represents a single entry in a queue of actions related to breaking even on a trade. Specifically, it signifies that a breakeven point needs to be adjusted. 

It holds two key pieces of information: the action being performed, which is always "breakeven," and the current price of the asset at the time the breakeven adjustment is needed. This price is used to recalculate the breakeven level.

## Interface IBreakeven

This interface manages the tracking of breakeven points for trading signals. It's used by components to monitor a signal's price movement and automatically adjust the stop-loss to the entry price when conditions are met.

The `check` method is responsible for determining if breakeven should be triggered, considering factors like transaction costs and whether breakeven has already been reached. When triggered, it updates the signal’s state and notifies listeners.

The `clear` method resets the breakeven state when a signal is closed, ensuring that the system is cleaned up and data is properly persisted.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book. It’s a simple way to describe the price and volume at a specific level. Each `IBidData` object has a `price` property, which is the price level expressed as a string, and a `quantity` property, also a string, which indicates how many units are offered at that price. Essentially, it’s a concise record of "this much is being offered at this price."

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (often called DCA - Dollar Cost Averaging) strategy. 

Each time a buy order is executed as part of your averaging plan, a record like this is created.

It tells you the current price at which the buy was made, the cost of that particular buy, and how many averaging entries are now in the overall plan. Think of it as one brick in building your DCA strategy.


## Interface IAggregatedTradeData

This data structure holds information about a single trade that took place. Think of it as a detailed record of one transaction. Each trade includes the price at which it happened, how much was traded (quantity), and the exact time it occurred.  A crucial piece of information is whether the buyer was the market maker – this tells you which side of the trade initiated the transaction.  Each trade also has a unique ID for easy tracking and reference.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit. Think of it as a trigger to execute a pre-planned action.

It includes the action type, which is always "activate-scheduled," to clearly indicate the intention.

You'll also provide the unique identifier of the signal that's being activated, along with an optional activation ID if the activation was initiated by a user.


## Interface IActionStrategy

This interface, `IActionStrategy`, lets your action handlers peek at the current signal state without directly accessing the entire trading system. Think of it as a way to quickly check if a signal is pending or scheduled before your custom actions are triggered. 

It's primarily used by the `ActionProxy` to decide whether to run certain actions – like adjusting stop-loss levels or checking for profit targets.

Specifically, `hasPendingSignal` tells you if there’s an open position already in place for a given symbol, and `hasScheduledSignal` tells you if a signal is waiting to be executed. 

You provide details like whether it's a backtest, the symbol, and some context to these methods. They then return a promise that resolves to `true` or `false`, indicating the presence of a pending or scheduled signal, respectively.

## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy with custom logic triggered by events. Think of it as a way to hook into the strategy's execution flow to do things like log events, send notifications, or manage the state of your application.

You register these actions using `addActionSchema`, giving each one a unique identifier.  You can also add a note to document what the action does.

The core of an action is its handler, which is essentially a piece of code that gets run for each frame within a strategy.  Alternatively, you can provide a partial implementation of `IPublicAction` directly if you don't need a constructor.

Finally, you have the option of including lifecycle callbacks, which allow you to control when certain actions are performed, like initialization or cleanup. This gives you very precise control over how your custom actions interact with the trading strategy.

## Interface IActionParams

The `IActionParams` interface defines the information passed when creating an action within the backtest-kit framework. It builds upon a basic schema and provides essential context for executing actions.

You'll find a `logger` to help you track what's happening during action execution, useful for debugging and observing performance.  The `strategyName` and `frameName` tell you which strategy and timeframe the action belongs to.

It also includes the `exchangeName` to identify the exchange being used and a `backtest` flag to indicate if the action is being run in a backtesting scenario.

Finally, the `strategy` property gives you access to the current signal and position state for the strategy, allowing actions to react to changing conditions.


## Interface IActionCallbacks

This interface provides a way to hook into different stages of an action handler's lifecycle, allowing you to customize its behavior and monitor its activities. Think of it as a set of customizable events that fire at specific points, like when the handler is set up, taken down, or when certain trading events occur. You can use these callbacks for things like connecting to databases, logging events, saving state, or handling special trading conditions like hitting a breakeven point.

Here's a breakdown of what each callback does:

*   **onInit:** This is called when the action handler is first created – a perfect place to initialize resources like database connections or subscriptions.
*   **onDispose:** This runs when the action handler is no longer needed, allowing you to clean up resources like closing database connections and saving any accumulated data.
*   **onSignal, onSignalLive, onSignalBacktest:** These callbacks fire whenever a trading signal is generated. The live and backtest versions let you differentiate between the two modes.
*   **onBreakevenAvailable:**  Notifies you when a stop-loss is moved to the entry price, a common risk management technique.
*   **onPartialProfitAvailable & onPartialLossAvailable:** These are triggered when partial profit or loss levels are reached, helpful for managing partial exits.
*   **onPingScheduled & onPingActive & onPingIdle:** These deal with signal monitoring during scheduled and active states, and when there's no active signal. They provide insight into the framework’s internal state.
*   **onRiskRejection:**  Alerts you when a trading signal is blocked by risk management.
*   **onSignalSync:** This is special—it's called when the framework tries to execute a trade using a limit order, and you have the power to either allow or reject the trade by returning `false` (or throwing an error), which will cause the framework to retry on the next tick. Any exceptions thrown here won't be ignored.

## Interface IAction

The `IAction` interface is designed to help you manage and react to events generated by different parts of the backtest-kit trading framework. Think of it as a central hub for handling updates about your trading strategy’s performance, signal generation, and risk management.

You can use this interface to create custom logic that responds to various events – for instance, you could use it to log signals, update a dashboard, or adjust your risk exposure based on real-time information.

Here's a breakdown of the events you can react to:

*   **General Signal Events:** The `signal` method handles events from both live and backtesting modes, while `signalLive` and `signalBacktest` are specifically for live and backtest scenarios respectively.
*   **Breakeven, Profit & Loss:**  `breakevenAvailable`, `partialProfitAvailable`, and `partialLossAvailable` handle notifications related to profit-taking and loss-limiting strategies.
*   **Ping Events:** `pingScheduled`, `pingActive`, and `pingIdle` handle events during the stages of signal monitoring involving scheduled, active, and idle signal states.
*   **Risk Rejection:**  `riskRejection` is triggered when a signal doesn't pass the risk validation.
*   **Signal Synchronization:** `signalSync` is invoked when the system attempts to open or close positions with limit orders, allowing you to influence the process.
*   **Cleanup:** The `dispose` method is crucial for cleaning up any resources and subscriptions when the action handler is no longer needed, ensuring proper framework shutdown.

## Interface HighestProfitStatisticsModel

This model holds the results of a backtest's highest profit events. It keeps track of every instance where a significant profit occurred, storing them in a list called `eventList`, ordered from most recent to oldest.  Alongside this detailed history, it also provides a simple count, `totalEvents`, indicating the total number of profitable events recorded during the backtest. Think of it as a logbook of all the times your trading strategy made a substantial gain.

## Interface HighestProfitEvent

This object represents the single best profit event observed for a particular trading position. It provides a snapshot of the conditions that led to the highest profit achieved.

You'll find details such as the exact timestamp of the record, the trading symbol involved, and the name of the strategy used. The position direction (long or short) is clearly indicated.

Crucially, it includes information about the profit and loss (PNL) of the entire position, as well as the peak profit achieved and the maximum drawdown experienced. Knowing the entry and exit prices, along with the stop-loss and take-profit levels, provides a complete picture of the trade. 

Finally, a flag indicates if this event took place during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` helps you track when a trading strategy reaches a new peak in profit. It provides essential details about what’s happening: the trading symbol, the current price at that moment, and when the update occurred. You’ll also find information about the strategy being used, the exchange it’s on, and the timeframe involved. Crucially, it includes the signal data that triggered the position and indicates whether the event occurred during a backtest or live trading. This information lets you build custom features like automatic trailing stops or partial profit bookings based on significant profit milestones.

## Interface HeatmapStatisticsModel

This structure organizes key statistics for your entire portfolio, giving you a broad view of its performance. It breaks down the aggregated results for each symbol you're tracking.

You'll find a list of individual symbol statistics, along with the total count of symbols in your portfolio. The structure also summarizes overall portfolio metrics like total profit and loss, the Sharpe Ratio, and the total number of trades executed. Finally, it highlights the average peak and fall PNL, weighted by trade count, providing insights into the typical best and worst performance across your holdings.

## Interface DoneContract

This interface defines the data you'll receive when a background process, either a backtest or a live trading session, finishes running. It gives you key information about what just concluded, like the name of the exchange used, the strategy that ran, and whether it was a backtest or live execution.  You'll find details such as the trading symbol involved, allowing you to track which asset was being traded. The frame name is included, but it will be empty if you’re running in live mode. This provides a clear signal and context for understanding the completion of these potentially long-running operations.

## Interface CriticalErrorNotification

This notification signals a severe problem that requires stopping the current process. It’s specifically designed for critical errors, not minor issues.

Each notification has a unique ID to help track occurrences. 

A human-readable message explains the error, and detailed information including a stack trace is included for debugging. The `backtest` flag will always be false because these errors occur in live environments, not during backtesting.

## Interface ColumnModel

This describes how to set up columns when generating tables, especially useful for displaying data clearly. Each column has a unique `key` to identify it, and a user-friendly `label` that appears as the header in the table. You can use the `format` function to customize how the data in each cell is displayed – it takes the raw data and turns it into a readable string. Finally, `isVisible` lets you control whether a column is shown at all, potentially based on dynamic conditions.

## Interface ClosePendingCommitNotification

This notification tells you about a signal that was canceled before it could fully activate a trade. It provides a comprehensive breakdown of what happened, including when it occurred (`timestamp`), whether it was during a backtest or live trading (`backtest`), and the details of the related trade (`symbol`, `strategyName`, `exchangeName`, `signalId`). You’ll find key information like the original entry price (`originalPriceOpen`), the overall profit/loss (`pnl`), and peak performance metrics (`peakProfit`, `maxDrawdown`). The notification also dives into granular details such as DCA entries, partial closes, slippage, fees, and the prices at which profit and losses were realized, giving a complete picture of the signal's journey from creation to cancellation. A human-readable note (`note`) may offer additional context for the signal’s cancellation.

## Interface ClosePendingCommit

This signal tells the backtest system that a previously opened position needs to be closed. It's used when you want to finalize a trade and account for its performance.

The `action` clearly identifies this as a closing action.  You can optionally add a `closeId` to help you track why the position was closed.

Crucially, the signal also includes performance data: `pnl` represents the total profit or loss from the position, `peakProfit` shows the highest profit reached, and `maxDrawdown` reflects the largest loss experienced during its life. This allows you to analyze the trade's behavior in detail.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was activated. It provides a wealth of information about the cancelled signal, including a unique identifier, the timestamp of the cancellation, and whether it occurred during backtesting or live trading. The notification details the trading symbol, the strategy and exchange involved, and the unique ID of the signal itself.

You'll find extensive data relating to the original trade setup, such as the intended DCA (Dollar-Cost Averaging) entries and partial closes, as well as the original entry price.  It also contains detailed performance metrics for the position, including total profit & loss (PNL), peak profit, and maximum drawdown, along with the prices and USD values associated with these metrics. Further details about the reason for cancellation, if provided, are included in a note field, and finally, the creation timestamp of this cancellation notification. This allows for in-depth analysis of why a signal didn’t execute and its potential impact.

## Interface CancelScheduledCommit

This interface lets you signal that a previously scheduled event should be cancelled. It’s used when you need to stop something that was planned to happen later, like a trade execution.

You’ll need to specify that the action being taken is a "cancel-scheduled" event. 

You can optionally provide a `cancelId` to give a reason for the cancellation – this is useful for tracking why events were cancelled.

Along with the cancellation request, you can include details about the closed position, like the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown (`maxDrawdown`).  This provides a snapshot of the position's performance at the time the cancellation signal was generated.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a backtest. It gives you a way to understand when trades reached a breakeven point.

The `eventList` property contains a complete record of each individual breakeven event, including all its details.  You can examine this list to get a granular view of how often breakeven was achieved.

`totalEvents` simply tells you how many breakeven events were recorded during the backtest, providing a quick overview of breakeven frequency.

## Interface BreakevenEvent

This data structure holds all the key details whenever a trading signal hits its breakeven point. It’s designed to provide a complete picture for reporting and analysis purposes.

You'll find the exact time of the breakeven event, the trading symbol involved, the name of the strategy used, and a unique ID for the signal itself. It also includes details about the position (long or short), the current market price, and the original entry and exit prices (take profit and stop loss).

For strategies using dollar-cost averaging (DCA), it specifies the total number of entries and partial closes. It tracks the initial entry price before any averaging occurred, and details on executed partial closes.

Furthermore, the structure captures the unrealized profit and loss (PNL) at the time of breakeven, a human-readable note explaining the signal's purpose, and timestamps indicating when the position became active and when the signal was initially created. A flag indicates whether the event occurred during a backtest or a live trading session.

## Interface BreakevenContract

This interface represents when a trading signal's stop-loss is moved back to the original entry price, a key milestone for risk management. It's like a notification that the trade has become risk-free, having covered the initial cost.

The notification includes important details like the trading symbol, the name of the strategy that generated the signal, the exchange being used, and the time frame. You’ll also get all the original signal data, the current price at the time of breakeven, and whether the event occurred during a backtest or live trading. Think of it as a record of a successful risk mitigation step in your automated trading. It helps you monitor how your strategy is performing and build reports about its safety and profitability.

## Interface BreakevenCommitNotification

This notification signals that a breakeven action has been executed for a trading position. It provides a wealth of information about the trade, including a unique ID, the exact time it occurred, and whether it happened in backtest or live mode. You'll find details like the trading pair, the strategy and exchange involved, and the signal identifier.

The notification details the position’s parameters, such as the entry and take profit/stop loss prices, along with their original values before any trailing adjustments. It also includes extensive performance data, revealing the position's total profit/loss, peak profit, maximum drawdown, and key prices associated with those metrics.

Furthermore, you’ll get insights into how the position was built, including the number of DCA entries and partial closes, along with the total capital invested and the effective prices used for PNL calculations. A free-text note field allows for additional context about the reason for the action. Timestamps track the signal’s lifecycle, from creation and pending status to the final execution.

## Interface BreakevenCommit

This event signals that a breakeven adjustment has occurred during a trading strategy's execution. It provides key details about the position at the time of the adjustment, including the current market price. You'll find information about the overall profit and loss (PNL) realized on the position, as well as the highest profit and largest drawdown experienced throughout its lifespan.

The event also outlines the trade's direction (long or short), the original entry price, and the take profit and stop loss prices – both as originally set and after any trailing adjustments.  A timestamp indicates when the signal was generated, and another shows when the position was initially activated. Essentially, it's a snapshot of a position’s performance and settings at a critical point where the strategy has opted to adjust its risk management.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss order can be adjusted to the entry price – essentially, you've covered your initial risk. It’s a positive event, indicating the trade has moved favorably.

The notification provides detailed information about the trade, including a unique identifier, when it occurred, whether it's from a backtest or live trading, the trading pair involved, and the specific strategy that generated the signal. You'll also find key pricing data like the current market price, the entry price, and the take profit/stop-loss levels, both original and adjusted.

Beyond the basics, it dives into performance metrics, showcasing the position's profit and loss (both in absolute and percentage terms), peak profit achieved, and maximum drawdown experienced. You'll see details about the number of entries and partial closes executed, plus specific pricing used for PNL calculations. A note field allows for a description of the reason behind the signal. Finally, timestamps track the signal’s creation, scheduling, and pending states.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtest results, giving you a clear picture of how your trading strategy performed. It includes a complete list of all the trades that were closed, along with essential data like price and profit/loss.

You'll find key statistics such as the total number of trades, how many were winners versus losers, and the win rate – essentially, the percentage of profitable trades. 

The model also calculates vital performance metrics. Average and total profit/loss figures show overall strategy profitability. Volatility is measured with standard deviation, while the Sharpe and Sortino ratios assess risk-adjusted returns. You’ll also see metrics like certainty ratio, expected yearly returns, and drawdown measures (peak and fall PNL), all helping you fine-tune and understand your strategy's behavior. Keep in mind that any number labeled as 'null' indicates the calculation wasn’t reliable due to potential data issues.

## Interface AverageBuyCommitNotification

This notification signals that a new purchase has been made as part of a dollar-cost averaging (DCA) strategy. It provides detailed information about this specific purchase, including a unique identifier, the exact time it occurred, and whether it's happening in a test or live environment. You’ll find specifics like the trading pair, the strategy that triggered the buy, and the exchange used. 

The notification includes price data for the averaging entry, the current effective average price, and the total number of averaging steps taken so far. It also provides crucial details about the position, such as the entry price, stop-loss and take-profit levels, and the overall profit and loss (PNL) of the entire position, including maximum drawdown and peak profit metrics. Finally, there’s an optional note field for a human-readable explanation of why the signal was generated.

## Interface AverageBuyCommit

This describes an "average-buy" event, which occurs when a new purchase is made as part of a dollar-cost averaging (DCA) strategy on an existing position. The event provides detailed information about this particular averaging buy.

It includes the price at which the purchase happened, the cost of that specific buy, and how it changes your overall average entry price. You’ll also find information about your current profit and loss, the highest profit you've seen so far, and the biggest drawdown (loss) experienced.

The event also retains the original entry price, as well as the original and effective take profit and stop-loss prices, alongside timestamps indicating when the signal was created and when the position became active. This complete set of data allows for thorough analysis of how the DCA strategy is affecting the position's performance.


## Interface ActivePingContract

The ActivePingContract is a way to keep track of pending signals that are still active during the monitoring process. It sends out a notification every minute for each active pending signal, providing information about its lifecycle and letting you customize how it's managed.

This notification includes details like the trading pair symbol, the strategy name being used, and the exchange where the signal is monitored. You'll also receive the complete data for the signal itself, including things like open price, take profit, and stop loss levels.

The notification also gives you the current price of the trading pair at the time of the ping and whether the signal is part of a backtest or live trading execution. Finally, a timestamp is included to indicate exactly when the event occurred.

## Interface ActivateScheduledCommitNotification

This notification signals that a trading signal has been activated, typically triggered manually by a user. It provides a wealth of information about the trade, including a unique identifier, the exact time it was activated, and whether it occurred in backtest or live mode. You'll find details about the trading pair, the strategy that generated the signal, and the exchange it was executed on.

The notification also outlines the specifics of the trade itself: the position type (long or short), entry and stop-loss prices, and details about any averaging or partial closes that may have occurred.

Importantly, it includes comprehensive profit and loss data, tracing the position's performance from inception to activation. This includes metrics like peak profit, maximum drawdown, and profit percentages, all broken down with associated prices, costs, and entry counts.  The notification also contains the original parameters set when the signal was initially created, and timestamps of key events like scheduling and pending status. A human-readable note might also be provided to explain the rationale behind the signal.

## Interface ActivateScheduledCommit

This data represents the activation of a previously scheduled trading signal. It provides details about the trade being executed, including whether it's a long or short position, the entry and exit prices (take profit and stop loss), and the original values of those prices before any adjustments were made. 

You’ll also find information about the position's performance so far - specifically, the total profit and loss (PNL), the highest profit achieved (peak profit), and the largest drawdown experienced. The `scheduledAt` field notes the time when the signal was initially created, while `pendingAt` marks the moment the position was actually activated.  A user-provided identifier, `activateId`, can be included to track the reason for the activation. Finally, `currentPrice` reflects the prevailing market price at the time of activation.

