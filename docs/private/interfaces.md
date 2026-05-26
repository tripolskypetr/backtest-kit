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

This interface defines the information shared when a walker is instructed to stop its operations. It's used to signal a halt to a specific walker and strategy, allowing for precise control when multiple walkers are active on the same trading symbol. The signal includes the trading symbol, the name of the strategy to stop, and crucially, the name of the walker itself, which enables you to target specific walkers when you need to interrupt their execution. Think of it as a precise instruction to pause a particular trading process within your system.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the outcomes of backtesting different trading strategies. 
It builds upon the basic WalkerResults data, adding information that lets you directly compare the performance of each strategy you tested. 
Specifically, it bundles all the individual strategy results into a single list, making it easier to analyze which strategies performed best and why.

## Interface WalkerContract

The WalkerContract represents updates you receive as backtest-kit runs comparisons between different trading strategies. Think of it as a progress report—it tells you when a particular strategy finishes its test and provides key information about that run.

Each time a strategy completes testing, you'll get a WalkerContract event. It includes details like the strategy’s name, the trading symbol being tested, and the exchange and timeframe being used. 

You'll also see performance statistics like total profit, Sharpe ratio, and maximum drawdown.  Critically, the contract provides the metric the system is trying to optimize, the value of that metric for the completed strategy, and the best value seen so far among all tested strategies. 

Finally, the contract keeps you informed about overall progress, telling you how many strategies have been tested and how many are left to go.


## Interface WalkerCompleteContract

This interface describes the final notification you receive when a complete backtesting walk is finished. It bundles all the key results from the testing process into one place.

You'll find details about the walker itself – its name, the symbol being traded, the exchange and timeframe used. 

It also includes the metric that was used to evaluate the strategies.

Critically, it tells you how many strategies were tested, identifies the best-performing strategy, and provides its metric value and associated statistics. Essentially, this is your summary of who won the backtesting competition.

## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during your trading simulations. 

It's triggered when risk validation functions encounter problems.

Each notification includes a unique identifier, a detailed error object that includes the stack trace, and a human-readable message to help you understand what went wrong. 

You can also see that these errors originated from the live trading context, as the `backtest` property is always false. Essentially, it's a signal that a validation rule is preventing a trade from happening, and you should investigate the error details.

## Interface ValidateArgs

This interface, ValidateArgs, helps ensure that all the key names used within the backtest-kit framework are correct and consistent. It acts as a checklist, guaranteeing that things like the exchange you’re using, the timeframe, your trading strategy, risk profile, the action you’re taking, sizing methods, and even parameter sweep configurations are all valid.

Each property in this interface represents one of these areas—ExchangeName, FrameName, StrategyName, RiskName, ActionName, SizingName, and WalkerName. 

For each, you'll provide an enum that lists the acceptable values.  The backtest-kit then uses this information to verify that you’re using a supported name for each component of your trading setup. This helps prevent errors and makes your backtests more reliable.


## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take-profit order has been executed. It's essentially a confirmation that your trailing take action has triggered and closed a position.

The notification includes a bunch of important details about the trade, such as a unique identifier, the exact time it happened, and whether it's from a backtest or live trading. You'll find the trading pair, the strategy that generated the signal, and key pricing information like the entry price, take profit price (after trailing adjustments), and stop-loss prices.

It also provides a complete picture of the position’s performance including total profit/loss, peak profit, maximum drawdown, and related pricing details. You can access info on the number of entries used for averaging and partial closes executed. A human-readable note might be included for context about the signal's reasoning. Finally, it contains timestamps for when the signal was created, became pending, and the notification itself was generated.

## Interface TrailingTakeCommit

This interface describes an event that occurs when a trailing take profit is triggered. It represents a specific action taken by the trading strategy, indicating a price adjustment based on a trailing stop-loss mechanism.

The `action` property clearly identifies the event type as a "trailing-take," confirming it's related to a trailing stop-loss adjustment.

You’ll find details like the `percentShift` which dictates how much the take profit moves with the price. The `currentPrice` tells you the market price at the moment this adjustment was made.

Crucially, it also provides performance data for the position, including the `pnl` (profit and loss), `peakProfit`, and `maxDrawdown` experienced since the trade's inception.

The `position` property specifies whether it’s a long (buy) or short (sell) trade, while `priceOpen` provides the original entry price. 

You’ll also see the `priceTakeProfit` which is the current, adjusted take profit price, and the `priceStopLoss`, which might have also moved due to trailing.  The original, unadjusted prices – `originalPriceTakeProfit` and `originalPriceStopLoss` – are also included for reference.

Finally, timestamps like `scheduledAt` and `pendingAt` provide details about when the signal was created and when the position was activated.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It's a detailed record of what happened, including whether it occurred during a backtest or live trading. You'll find key information like the trading pair involved, the strategy that generated the signal, and the exact prices at which the position was opened, adjusted, and closed. 

The notification contains comprehensive data about the trade's performance, such as the total profit/loss, peak profit, and maximum drawdown, along with related prices and entry counts.  It even includes details about any DCA averaging or partial closes that occurred.  Essentially, it provides a complete picture of the trailing stop event and its financial impact. You can use this information for analysis, reporting, and understanding how your strategies are performing.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop order is executed. It contains detailed information about the trade that just occurred.

You'll find the type of action performed, which is specifically a "trailing-stop" in this case.

The `percentShift` tells you how much the stop loss was adjusted, expressed as a percentage.

Key price points are included: the current market price when the trailing stop happened (`currentPrice`), the entry price (`priceOpen`), and the adjusted take profit and stop loss prices. The original, pre-trailing values for these prices are also available.

Performance metrics like profit and loss (`pnl`), peak profit, and maximum drawdown are recorded, giving you a complete picture of the position's lifecycle.

The direction of the trade (long or short) is clearly indicated.

Finally, timestamps show when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface TickEvent

This describes the `TickEvent` data structure, which provides a standardized way to represent all kinds of events happening within the trading system. Think of it as a single container holding all the relevant information about a trade, whether it’s being scheduled, opened, closed, or cancelled.

The `timestamp` tells you precisely when the event occurred.  The `action` property clarifies what type of event it is – scheduled, opened, closed, etc. You’ll find details specific to the action within other properties, such as the `symbol` for trades and `closeReason` for closed positions.

For active or scheduled trades, you'll also find details like `priceTakeProfit` and `priceStopLoss`, reflecting the target prices for profit and loss.  The `totalEntries` and `totalPartials` properties offer insight into DCA (Dollar Cost Averaging) strategies, indicating how many entries or partial closes were involved. Finally, financial metrics like `pnlCost` (profit/loss) and `percentTp` (progress toward take profit) are included to track performance.

## Interface SyncStatisticsModel

This model holds data about how your signals are syncing, giving you insights into their lifecycle. It collects information from all sync events, providing a detailed list of each one. You'll also find the total number of syncs that occurred, as well as separate counts for when signals are opened and when they are closed. This data helps you understand the flow of your signals and identify potential issues.


## Interface SyncEvent

This data structure neatly packages all the essential information about events happening during a trading signal’s lifecycle, designed specifically for creating clear, readable reports. It holds details like the exact time of the event, the trading pair involved, and which strategy and exchange were used. You’ll find information about the signal itself, including a unique ID and the action that was taken.

It goes into specifics about pricing – entry prices, take profit levels, and stop loss levels - including their original values and any adjustments made. It also tracks important performance metrics like the number of entries and partial closes, and vital profit and loss (P&L) information including peak profit and maximum drawdown. A reason for closing the trade is also available, alongside a flag to indicate if the event originated from a backtest. Finally, a creation timestamp and an activation timestamp provide a complete timeline of the signal's journey.

## Interface StrategyStatisticsModel

This model holds a collection of statistics generated during a backtest to help you understand how your trading strategy is performing. You'll find a detailed list of every event your strategy triggered, allowing for in-depth analysis. 

Beyond the event list itself, the model also summarizes key actions: how many times your strategy canceled scheduled orders, closed pending orders, took partial profits, cut losses, adjusted trailing stops, set trailing take profits, and managed breakeven points. You can also see how often average buy (Dollar-Cost Averaging) orders were placed. The total number of events provides a baseline for assessing the frequency of your strategy's actions.

## Interface StrategyEvent

This `StrategyEvent` provides a standardized way to track everything that happens during a trading strategy's execution, whether it's a backtest or live trading. It bundles together a lot of information about each action, making it easier to generate reports and understand the strategy's behavior.

Each event includes details like when it occurred (`timestamp`), which trading pair was involved (`symbol`), the strategy's name (`strategyName`), and whether it's a backtest or live trade (`backtest`). It also records key pricing information like the current market price (`currentPrice`), entry price (`priceOpen`), and any take profit or stop loss levels (`priceTakeProfit`, `priceStopLoss`), potentially reflecting trailing adjustments.

For actions involving position management, you'll find details about the trade direction (`position`), the percentage to close (`percentToClose`), and unique IDs for scheduled, pending, or canceled actions.  Specifically for strategies utilizing Dollar Cost Averaging (DCA), you’ll see information about accumulated entries (`totalEntries`), partial closes (`totalPartials`), and the averaged entry price (`effectivePriceOpen`). Profit and loss (`pnl`) is also included, along with any notes added during the action. Finally, it stores the original pricing data before any adjustments like trailing stops or DCA.

## Interface SignalSyncOpenNotification

This notification signals that a pre-planned trading signal (like a limit order) has been triggered and a position has been opened. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during backtesting or live trading. You'll find details like the symbol being traded, the strategy that generated the signal, and the exchange it was executed on.

The notification also provides crucial performance metrics for the position, such as its current profit/loss, the highest profit achieved, the largest drawdown experienced, and entry and exit prices used for those calculations.  It breaks down these metrics into absolute dollar amounts, percentages, and even details about the individual entries and partial exits that occurred.

Beyond the core performance, it gives specifics on the original take profit and stop loss levels, the number of entries and partials, and a timestamp of when the signal was created and the position was activated. Finally, an optional note field lets you add a human-readable explanation for the signal.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it's from a live trade or a backtest. It provides a lot of detail about what happened, including the signal's unique ID, the timestamp of the closure, and whether it was part of a backtest or a live trade.

You'll find information about the trading pair, the strategy that generated the signal, and the exchange used.

Crucially, it includes performance metrics like profit and loss (both absolute and as a percentage), peak profit achieved, and maximum drawdown experienced, along with the prices at which these occurred.  Details on entry, take profit, and stop loss prices, along with original values before adjustments, are also provided.

The notification also specifies the trade direction (long or short), the number of entries and partials executed, and the reason for the closure, like hitting a take profit target, a stop loss, or time expiration. Additional notes can provide a more human-readable explanation. Finally, it tracks the signal creation and activation timestamps, along with when the notification itself was generated.

## Interface SignalSyncBase

This interface describes the common information found in events related to trading signals, regardless of whether they come from a backtest or a live trading environment. Every signal event will include details like the trading pair's symbol, the name of the strategy that generated the signal, and the exchange used. You’ll also find information about the timeframe used (relevant in backtesting) and a confirmation of whether it's a backtest or live signal.

Each signal event has a unique identifier, a timestamp reflecting when it occurred, and a comprehensive data row containing all the details of the public signal. Think of it as the core, shared data package for all signal-related events.


## Interface SignalScheduledNotification

This notification type lets you know when a trading signal has been set to execute in the future. Think of it as a heads-up that a trade is planned, not happening immediately. It includes a unique ID, the time the signal was scheduled, and whether it's part of a backtest or live trading.

You'll find key details about the planned trade, like the trading pair (e.g., BTCUSDT), the strategy that generated it, and the exchange where it will be executed. The notification specifies the trade direction (long or short), the intended entry price, and the take profit and stop-loss levels.

It also gives insight into the potential trade's performance, including details like the initial cost, projected profit and loss, peak profit, and maximum drawdown, along with important pricing details and the number of entries or partial closes involved. A final note field allows for providing further context about the signal's reasoning.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It provides a wealth of information about that trade, including a unique identifier and when it happened. You'll see details about whether the trade occurred in a backtest or live environment, which exchange and strategy were involved, and the specifics of the trade itself – the symbol, direction (long or short), entry and target prices, and how many entries were used.

Beyond the basics, the notification also gives a breakdown of the position's performance. It includes metrics like total profit and loss (both in USD and percentage), peak profit and maximum drawdown figures, and the prices associated with those milestones. It also tracks details regarding partial closes and the original signal cost. The notification can also include a human-readable note describing the reason for the trade, along with timestamps for signal creation, pending status, and creation of the notification itself.

## Interface SignalOpenContract

This event signals that a pre-planned trade, using a limit order, has been successfully executed. It's triggered either when the trading framework fills that limit order in live mode, or when the conditions of the order are met during a backtest – for example, when the candle's low is below the expected entry price for a long position.

Think of it as confirmation that your order went through.

This event provides a wealth of information about the trade, including the market price at the time of execution, the overall profit and loss (P&L), the highest profit achieved, and the biggest loss experienced. You'll also find details about the original entry price, take profit and stop-loss levels, and how many times the position was averaged or partially closed. This is particularly useful for synchronizing with external order management systems, confirming trades, and for detailed auditing and logging purposes.

## Interface SignalInfoNotification

This notification type lets your trading strategies communicate informational updates about open positions. Think of it as a way for your strategies to "speak" and provide helpful notes about what's happening. Each notification includes a unique ID, a timestamp, and whether it's from a backtest or live environment.

It details important information such as the trading symbol, the strategy responsible, and the exchange involved. You'll find specifics about the trade, including direction (long or short), entry and stop-loss/take-profit prices (both original and adjusted for trailing), and details on any DCA averaging or partial closes.

The notification also provides a comprehensive picture of the position's performance, including profit/loss (both in USD and percentage), peak profit metrics, maximum drawdown details, and insights into the prices and number of entries at those key points. Finally, a strategy can include its own custom note for added context, along with an optional notification ID for tracking purposes, and timestamps marking the signal's creation and activation.

## Interface SignalInfoContract

This interface describes the information broadcast when a trading strategy wants to send a custom notification about a trading signal. It’s like a way for strategies to "speak" to the outside world, providing extra details about what’s happening.

The notification includes details like the trading pair (symbol), the name of the strategy generating it, and the exchange being used.  You’ll also get access to the full data associated with the signal itself, the current market price at the time, and any notes or identifiers the strategy wants to add.

Crucially, it indicates whether the event is part of a backtest (historical data) or live trading. A timestamp accompanies each event, reflecting when the notification was generated. This lets you track what’s happening, debug strategies, or route information to external systems.


## Interface SignalData$1

This data structure holds all the key details about a single, completed trading signal. Think of it as a record of one trade – it tells you which strategy created the signal, a unique ID for that signal, and the symbol being traded (like BTC/USDT).

It also includes information about whether the trade was a long or short position, the percentage profit or loss (PNL), and the reason the signal closed.

Finally, it tracks the exact times the signal was opened and closed, giving a complete timeline of the trade's lifecycle. This is useful for analyzing performance and understanding why signals perform as they do.


## Interface SignalCommitBase

This interface defines the common information shared by all signal commit events within the backtest-kit framework. Each signal commit carries details like the trading pair symbol ("BTCUSDT"), the name of the strategy that generated it, and the exchange used.  It also indicates whether the signal came from a backtest or live trading environment, providing a unique identifier and timestamp.

The signal commit also keeps track of entries and partial closes, letting you see how many steps the trading strategy took – whether it was a single, immediate trade or a more complex process with multiple entries and partial exits. You can find the original entry price, the complete signal data at that point in time, and a custom note offering additional context or a reason for the signal.


## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was stopped out by a stop-loss, hit a take-profit target, or expired. It provides a wealth of information about the trade, including its unique identifier, when it closed, and whether it was part of a backtest or live trade. You'll find details like the entry and exit prices, the original take-profit and stop-loss levels, and the total number of entries and partial closes executed during the trade's lifetime.

The notification also includes comprehensive profit and loss (PNL) data, showing the total profit or loss, peak profit achieved, and maximum drawdown experienced. Further details are available, such as the price at which peak profit and maximum drawdown occurred, and the amount of capital invested. A `closeReason` field explains why the position was closed, and a `note` field allows for additional human-readable explanations. Finally, timestamps are provided for creation, scheduling, and pending states.

## Interface SignalCloseContract

This event, called `SignalCloseContract`, lets you know when a trading signal has been closed, whether that's due to hitting a take profit or stop loss, time expiration, or a manual closure. It's designed for systems that need to keep track of trades happening outside of the core framework, like managing orders or recording profit and loss.

The event provides detailed information about the closed position. You’ll find the current market price at the time of closure, the total profit and loss for the position, and key metrics like peak profit and maximum drawdown. It also includes the original and effective take profit and stop-loss prices, as well as the original entry price and timestamps for when the signal was created and the position was activated. 

Crucially, the event specifies the trade direction (long or short), the reason for the closure, and details about any DCA (dollar-cost averaging) entries or partial closes that occurred during the position's lifespan. This complete picture helps you accurately reconcile trading activity and maintain consistent records.

## Interface SignalCancelledNotification

This notification type lets you know a previously scheduled trading signal has been cancelled before it could be executed. It provides a lot of detailed information about the cancelled signal, including a unique identifier, the time of cancellation, and whether the cancellation occurred during a backtest or in live trading. You'll find details about the strategy that created the signal, the trading pair involved, and the intended trade direction (long or short).

The notification also includes important price levels like the take profit and stop loss, along with their original values before any adjustments. If the signal involved dollar-cost averaging (DCA), you'll see the total number of entries and partial closes. A `cancelReason` explains why the signal was cancelled – whether it was due to a timeout, price rejection, or a manual cancellation. You can also access the original scheduling time, the pending time, and an optional descriptive note. Finally, the notification includes the timestamp when the underlying tick data used to create the signal was generated.

## Interface Signal

The `Signal` object represents a single trading signal generated by your strategy. It holds key information about a trade, including the opening price.

Inside a `Signal`, you'll find details of the initial entry point, listing the price, cost, and timestamp of that action.

You’ll also discover a record of any partial exits taken during the trade, specifying whether they were profit or loss takers, the percentage of the position closed, the closing price, the cost basis at the time of the close, and the number of units held at that point.

## Interface Signal$2

The `Signal` object holds information about a trading signal. 

It keeps track of the entry price, represented by `priceOpen`, which is the price at which the position was initiated.

Internally, it maintains records of all entry events in the `_entry` array, noting the price, cost, and timestamp for each. 

Similarly, `_partial` records information regarding any partial exits taken, including the type of exit (profit or loss), percentage, price, cost basis, entry count, and timestamp.

## Interface Signal$1

This `Signal` object holds key information about a trading signal. 

It includes the opening price used when the position was initiated.

You'll also find records of entry details, like the price, cost, and timestamp of each entry.

Partial exits, whether they’re for profit or loss, are tracked with details like the percentage gained or lost, the price at the time of exit, and the cost basis at that point. This allows for a complete view of how the signal performed over time.

## Interface ScheduledEvent

This data structure holds all the key details about trading events – when they happened, what type of event it was (opened, scheduled, or cancelled), and all the related prices and parameters.  You'll find information like the trading symbol and a unique signal ID.

It includes details on entry and exit prices (take profit and stop loss), along with their original values before any modifications.  For positions using DCA (Dollar-Cost Averaging), you can track the number of entries and partial closes. 

For cancelled events, you can also determine the reason for cancellation, a unique cancellation ID if the user initiated it, and how long the trade lasted.  Finally, there's the unrealized profit and loss (PNL) at the time of the event, along with the time the trade became active or was scheduled.

## Interface ScheduleStatisticsModel

This model holds key statistics related to how your scheduled signals are performing. 

It essentially gives you a snapshot of your scheduled trading activity.

You’ll find details about every scheduled event, including when they were scheduled, opened, or cancelled. 

The model also provides overall counts of scheduled, opened, and cancelled signals.

It calculates important performance indicators, like the cancellation rate (how often signals are cancelled) and the activation rate (how often scheduled signals become active).

Finally, it shows you the average waiting times for both cancelled and activated signals, which can help you understand signal timing and efficiency.

## Interface SchedulePingContract

This contract describes the "schedule ping" events that occur while a scheduled signal is actively being monitored – think of it as a heartbeat confirming the signal is still in play. These pings happen roughly every minute and provide valuable information about the signal's status.

You can use these events to keep track of the signal's lifecycle or build your own custom monitoring systems.

Here’s what you’ll find in each ping:

*   **symbol:** The market being traded (like BTCUSDT)
*   **strategyName:** The name of the strategy running the signal
*   **exchangeName:** The exchange where the signal originates
*   **data:** A full set of details about the scheduled signal, including things like its ID, initial position, and stop-loss prices
*   **currentPrice:** The market price at the moment the ping was sent. This is vital for any price-based monitoring rules you might have.
*   **backtest:** A flag indicating whether this ping came from a backtest (historical data) or live trading
*   **timestamp:** The precise time the ping occurred, which varies slightly depending on whether it's live or backtest mode.

The events are only sent while the signal is actively monitored—not when it's cancelled or activated. You can subscribe to these pings using `listenSchedulePing()` or `listenSchedulePingOnce()` to implement custom monitoring or cancellation logic.

## Interface RiskStatisticsModel

This model holds information about risk events, specifically focusing on rejections. It's designed to help you monitor and understand your risk management processes. 

You'll find a complete list of risk events, each with its own detailed information, stored within the `eventList` property. 

The `totalRejections` property gives you a quick overview of the overall number of rejections.

To see where risks are concentrated, the `bySymbol` property breaks down rejections by the specific symbols involved, while `byStrategy` groups them by the strategies used.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked by your risk management rules. It's like a heads-up that something didn't go as planned.

Each notification has a unique ID and timestamp, so you can track when it happened. It also tells you whether the event occurred during a backtest or in live trading.

The notification includes key details like the trading pair (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange involved. 

It provides a clear explanation – the `rejectionNote` – describing *why* the signal was rejected. There's also a unique rejection ID for advanced tracking.

You’ll find information about your active positions at the time, the current market price, and potentially details about the signal itself, including its ID, trade direction (long or short), and price targets like take profit and stop loss. 

Finally, it offers an estimated duration and a description of the signal for context. The creation timestamp is also included for comprehensive logging.

## Interface RiskEvent

This data structure helps you understand why signals were blocked due to risk management rules. Each entry represents a situation where a trade couldn't proceed because of a risk limit being hit.

It contains detailed information about the rejected trade, including when it happened (timestamp), which asset was involved (symbol), and the specifics of the signal that was blocked (currentSignal). You’ll also find the name of the strategy and exchange, along with the time frame used for the analysis.

Important details like the current market price, how many positions were already open, and a unique ID for the rejection are included. You'll also get a reason (rejectionNote) explaining *why* the signal was rejected, and whether it occurred during a backtest or live trading.


## Interface RiskContract

The RiskContract is a record of when a trading signal was blocked because it violated a risk rule. It's like an audit trail for rejected trades.

This record will only appear when a signal *fails* a risk check, so you're only seeing actual problems, not just routine signals.

Here's what information you get with each rejection:

*   **symbol:** The trading pair involved, like BTCUSDT.
*   **currentSignal:** All the details of the trade that was attempted (price, position size, etc.).
*   **strategyName:** The name of the trading strategy that tried to place the order.
*   **frameName:**  The time frame the strategy was using (e.g., 1-minute, 1-hour).
*   **exchangeName:** The exchange the trade would have been placed on.
*   **currentPrice:** The price of the asset at the moment the risk check failed.
*   **activePositionCount:**  How many other positions were already open across all strategies.
*   **rejectionId:** A unique ID to help trace the specific rejection.
*   **rejectionNote:** A human-readable explanation of why the signal was rejected.
*   **timestamp:** When the rejection occurred.
*   **backtest:**  Indicates whether this rejection happened during a backtest or in live trading.

Systems like the RiskMarkdownService use this information to create reports, and developers can use it to monitor their strategies and risk rules.

## Interface ProgressWalkerContract

This interface defines how progress updates are reported during a background process, like when evaluating multiple trading strategies. It gives you insights into what's happening behind the scenes.

You'll see the name of the specific process running (the walker), the exchange it's using, and the frame it's operating within.

Each update includes the symbol being traded, the total number of strategies it needs to evaluate, how many it has finished, and a percentage representing overall completion. This allows you to monitor the process and understand how close it is to finishing.

## Interface ProgressBacktestContract

This interface provides updates on the progress of a backtest. It’s essentially a way to see how far along your trading strategy's historical simulation has reached.

Each update includes details like the exchange and strategy being used, the specific trading symbol being analyzed, the total number of historical data points the backtest will cover, and how many have been processed already. You’ll also see a percentage completion value to easily gauge how much longer the backtest will take. It helps you monitor the backtest process and confirm it’s running as expected.


## Interface PerformanceStatisticsModel

This model holds the performance data collected from a strategy during a backtest. It organizes information about a strategy, like its name, and provides details on the overall number of events and the total time taken for the metrics to run. 

Inside, you'll find `metricStats`, which breaks down the performance data further based on different metric types. 

Finally, it includes a list of all the raw performance events, offering a detailed look at each individual event that occurred.


## Interface PerformanceContract

The `PerformanceContract` provides a way to monitor how long different parts of your trading system take to execute. It's essentially a series of events that log details about the time spent on operations like order placement, data fetching, or strategy calculations.

Each event contains information like when it happened, when the previous event occurred (if any), what kind of operation was being performed (like order execution or data loading), and how long that operation took.  It also tells you which strategy, exchange, and trading symbol were involved, as well as whether it's happening during a backtest or in live trading.

By collecting these performance snapshots, you can identify slow areas in your system and optimize them, leading to a more efficient trading framework. This is extremely useful for pinpointing bottlenecks and improving overall performance.

## Interface PartialStatisticsModel

This model holds statistical information gathered from partial profit and loss events during a backtest. It's like a scorecard detailing how many times your trading strategy experienced a profit, a loss, and the total number of events that occurred.

The `eventList` property contains a complete record of each profit or loss event, offering detailed information about each one. 

`totalEvents` simply counts the overall number of profit and loss events that happened. 

`totalProfit` tracks the number of times your strategy made a profit, and `totalLoss` counts the losses.


## Interface PartialProfitContract

This describes events that happen when a trading strategy reaches certain profit milestones, like 10%, 20%, or 30% profit. These events help track how well your strategy is performing and when it's achieving take-profit targets.

Each event includes details about the trading symbol, the strategy used, the exchange and frame it’s running on, and all the original signal data.  You'll also find the current market price at the time of the event, the specific profit level reached, and whether it’s coming from a backtest or live trading. The timestamp tells you exactly when this profit level was hit – either at the moment of the real-time tick or during the backtest. It’s useful for generating reports or connecting your own custom logic to these progress points.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit target has been reached and executed, whether it's during a backtest or a live trade. It provides a ton of detail about the trade, including a unique ID, the exact time it happened, and whether it was a simulation.

You'll find key information like the trading pair (e.g., BTCUSDT), the name of the strategy that triggered the action, and the exchange involved.  It also gives you the signal ID, how much of the position was closed, and the current market price at the time.

The notification breaks down the position details: entry price, take profit and stop loss levels (both initial and adjusted), and how many entries were involved in the position.  Critically, it shows the total profit and loss (both in USD and percentage), alongside the peak profit and maximum drawdown experienced.  You also see the prices and costs associated with those metrics.

Finally, there’s a field for any notes explaining why the signal was generated and timestamps for when the signal was created, scheduled, and pending.

## Interface PartialProfitCommit

This represents a partial profit-taking event within your trading strategy's backtest. It details that a portion of an existing position is being closed, specifying the percentage of the position to be taken off the market. You'll find key data points here, including the current market price when the action occurred, the total profit and loss (both overall and at its peak), and the maximum drawdown the position has experienced.

The event also provides information about the original position itself: its direction (long or short), the entry price, the intended and actual take profit and stop-loss levels, and the timestamps indicating when the signal was created and the position was initially activated. This gives you a complete picture of the partial profit event and its context within the larger trade lifecycle.

## Interface PartialProfitAvailableNotification

This notification alerts you when a trading strategy reaches a predefined profit milestone, like 10%, 20%, or 30% gain. It’s a way to track progress and understand how your strategy performs over time. The notification includes a unique identifier and timestamp, as well as whether it's from a test run or live trading. 

You'll find details about the trading pair, strategy name, exchange used, and signal ID. Critically, it provides information about the entry price, the current market price at the milestone, and the position direction (long or short).

Furthermore, the notification provides crucial performance data, including the take profit and stop loss prices (both original and adjusted for trailing), and information about DCA averaging (the number of entries made).  You’ll also see the accumulated profit and loss (pnl) data, including peak profit, maximum drawdown, and all the associated prices and percentages.

Finally, the notification includes optional notes to explain the signal's reasoning, along with timestamps indicating when the signal was scheduled, became pending, and when the notification itself was created.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. These events are triggered when a signal reaches a loss milestone.

You'll see these events emitted for each loss level reached by a particular trading strategy, and they won't repeat – each signal gets only one notification per level. If the price moves significantly, multiple levels can be reported at once.

The notification includes details like the trading symbol (e.g., BTCUSDT), the strategy's name, the exchange used, and the frame it’s running on. You'll also find the complete signal data, the current market price at the time, the specific loss level achieved, whether it’s from a backtest or live trading, and a timestamp.

Think of it as a way to monitor how a strategy is performing and to track its potential stop-loss executions. It's used by systems to generate reports and to allow users to be notified when losses reach certain thresholds. The loss level, while stored as a positive number, signifies a negative percentage loss from the initial entry price – for example, a level of 20 means a -20% loss.

## Interface PartialLossCommitNotification

This notification signals that a portion of a trading position has been closed. It provides a wealth of detail about the trade, including a unique identifier, when it happened, and whether it occurred during a backtest or live trading. You'll find information about the specific trading pair, the strategy and exchange involved, and the percentage of the position that was closed.

The notification also includes comprehensive price information like the entry price, take profit, stop loss, and how they were originally set versus their adjusted values. It breaks down the performance of the position, detailing total profit and loss, peak profit, maximum drawdown, and related prices and costs. 

Further details cover DCA entries, the total capital invested, and a textual note that might explain the reasoning behind the partial closure. Finally, it records timestamps related to signal creation and execution.

## Interface PartialLossCommit

This describes an event representing a partial closing of a trading position. It provides detailed information about why and how the partial closing occurred. 

You’ll find data like the percentage of the position being closed, the current market price at the time, and the overall profit and loss (pnl) associated with the position. 

The framework also tracks performance metrics, including the highest profit reached (peakProfit), the largest drawdown experienced (maxDrawdown), and the original take profit and stop loss prices before any adjustments. 

Finally, the record includes timestamps noting when the closing action was scheduled and when the position was initially activated. This helps to understand the position's lifecycle and trading decisions.

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy has hit a predefined loss milestone, like -10%, -20%, or -30% of its initial investment. It's a signal that something might be happening with your position, whether you’re testing the strategy in a simulated environment (backtest) or actively trading.

The notification contains a lot of details. You'll see a unique identifier and timestamp marking exactly when this loss level was reached. It tells you which trading pair is involved (like BTCUSDT) and identifies the strategy responsible. You'll also get critical information about the trade, including your entry price, the take profit and stop loss levels (both the original and adjusted amounts if trailing is enabled), and the total number of entries and partial closes.

Detailed performance metrics are included too, like total profit and loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. The notification breaks down how these values were calculated, including price points and the number of entries involved.  Finally, there's an optional note providing a human-readable explanation for the signal. Timestamps show when the signal was initially created, when the position became active, and when this notification was generated.

## Interface PartialEvent

This `PartialEvent` object bundles together all the key details about a profit or loss milestone during a trade. Think of it as a snapshot of what happened at a specific point in time concerning a trade's performance.

It includes things like the exact time of the event, whether it's a profit or a loss, the trading pair involved, and the name of the strategy and signal that triggered it.

You'll also find information about the position type, the current market price, and the levels of profit or loss achieved (like 10%, 20%, etc.). 

Beyond that, it contains important pricing information like the entry price, take profit target, and stop-loss levels, as well as the original prices set when the signal was created. 

If you're using a Dollar-Cost Averaging (DCA) strategy, it tracks the total number of entries and the original entry price before averaging.

Finally, it records details about any partial closes executed, the total unrealized profit and loss at that point, and a human-readable note explaining the signal’s reasoning, along with timestamps for when the position became active and when the signal was initially created. A flag is also present to indicate if the event occurred during a backtest or in live trading.

## Interface MetricStats

This object helps you understand the overall performance of a specific measurement within your trading system. It gathers data like how many times something happened, how long it took each time, and provides key statistics.

You’ll find information about the average duration, the shortest and longest durations, and how spread out the durations are (using standard deviation). 

It also calculates percentiles like the 95th and 99th, showing you the durations at those points in the data. Finally, it provides details about the waiting time between events. Essentially, it's a central place to review the aggregated behavior of a particular performance metric.

## Interface MessageModel

This describes a single message within a chat history when working with Large Language Models. Each message has a defined role, like a system instruction, a user's question, or the assistant's response. The core of the message is the content – the actual text being exchanged. 

Sometimes, the assistant might explain its reasoning process, and that's captured in a separate `reasoning_content` field. If the assistant is using tools to respond, details about those tool interactions are listed under `tool_calls`. 

Images can also be included within a message, supported in various formats. Finally, a `tool_call_id` identifies which tool call a specific message is a response to.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown events that have occurred during a backtest. It keeps track of each drawdown event, storing them in a list called `eventList`, where the most recent events appear first.  You can also see the total number of drawdown events recorded through the `totalEvents` property. Essentially, it provides a detailed view of the worst performance periods in your trading strategy’s history.

## Interface MaxDrawdownEvent

This data represents a single instance of a maximum drawdown event that occurred during a trading position. It provides detailed information about the event, including when it happened (timestamp) and which trading pair (symbol) was involved. 

You'll also find details about the strategy used, a unique identifier for the signal, and whether the position was a long or short trade.

The record includes key performance metrics like the position's total profit and loss (pnl), the highest profit ever reached (peakProfit), and the maximum drawdown experienced (maxDrawdown). 

Finally, it captures the price at which the drawdown occurred (currentPrice), along with the entry price, take profit price, and stop loss price that were set for that position, and whether the event happened during backtesting.

## Interface MaxDrawdownContract

This describes the data you'll receive whenever a new maximum drawdown occurs for a trading position. It provides details like the trading symbol, the current price at the time of the drawdown, and a timestamp for tracking. 

You'll also see the name of the strategy being used, the exchange involved, and the timeframe of the data. Critically, it includes the signal data related to the position, and a flag that tells you whether this is a backtest result or data from a live trade. 

This information is meant to help you build custom systems that respond to drawdown events, like adjusting stop-losses or implementing other risk management techniques.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a comprehensive set of metrics to evaluate the performance of your live trading system. It tracks various aspects of your trades, including every event that occurred (idle, open, active, and closed) and calculates key performance indicators. You'll find information like the total number of trades, the number of winning and losing trades, and the win rate – essentially, how often your trades are profitable.

The model also offers insights into profitability, with metrics like average PNL (profit per trade), total PNL across all trades, and standard deviation to measure volatility. More advanced indicators like Sharpe Ratio, Sortino Ratio, and Calmar Ratio are included to assess risk-adjusted returns.  Additionally, it provides details on peak and fall PNL, giving you a sense of the best and worst points of your trading performance. Because some calculations can be unreliable, many values are null when they are unsafe.

## Interface InfoErrorNotification

This component handles notifications about errors encountered during background processes. These aren't critical errors that halt everything, but rather issues that can be handled and logged.

Each notification carries a unique identifier (`id`) to help track it. 

You'll also find a detailed explanation of the problem in the `message` field, along with more technical details about the error itself, including a stack trace, within the `error` field.

Importantly, these notifications always come from a live context, indicated by `backtest` being false. The `type` field clearly labels these as "error.info" notifications for clarity and safe code handling.

## Interface IdlePingContract

The `IdlePingContract` represents a notification that a trading strategy is currently inactive, meaning it's not actively responding to any signals. 

Think of it as a heartbeat signal confirming the strategy isn't doing anything at the moment.

It provides key details about this idle state, including the trading symbol (like BTCUSDT), the strategy's name, the exchange it’s running on, and whether it's part of a backtest or live trading.

You’ll also find the current price of the asset, a timestamp indicating when this idle state was observed, and a flag to differentiate between backtest and live data.

This contract is primarily intended for applications that need to monitor the lifecycle of trading strategies, allowing them to react to periods of inactivity. You can use functions like `listenIdlePing()` or `listenIdlePingOnce()` to receive these notifications.

## Interface IWarmCandlesParams

This object defines the details needed to fetch and store historical candle data. Think of it as a recipe for downloading past price charts for a specific trading pair, exchange, and timeframe. You'll use this to prepare your data before running a backtest, ensuring you have enough historical information. It includes the trading symbol like "BTCUSDT", the exchange name, the candle timeframe (like 1 minute or 4 hours), and the start and end dates for the data you want to retrieve.

## Interface IWalkerStrategyResult

This object holds the results for a single trading strategy you've tested. It tells you the name of the strategy, along with a set of statistics summarizing its performance during the backtest. 

You'll also find a specific metric value used to compare it against other strategies, and its overall ranking based on that metric. If the metric isn't valid for a particular strategy, this value will be null. Essentially, it’s a package of information to help you understand and compare how each strategy did.


## Interface IWalkerSchema

The IWalkerSchema defines how to set up and run comparisons between different trading strategies, like an A/B test. It’s essentially a blueprint for organizing your backtesting experiments.

You give it a unique name for identification, and a note for your own reference. It specifies which exchange and timeframe you'll be using to test all the strategies.

The core of the schema is the `strategies` list – this tells the backtest-kit which strategies you want to pit against each other. You'll need to make sure those strategies have already been registered.

You can also choose which metric you want to optimize, defaulting to "sharpeRatio," and optionally provide callback functions to react to events during the testing process. This helps you monitor and control the backtesting workflow.

## Interface IWalkerResults

This object holds all the information gathered when you've run a comparison of different trading strategies. It tells you which asset (the `symbol`) was tested, which marketplace or exchange (`exchangeName`) was used, the name of the specific comparison method or "walker" (`walkerName`), and the timeframe for the test (`frameName`). Think of it as a container for all the details about a completed backtesting comparison.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you customize what happens during the backtesting process, specifically when comparing different strategies. It’s like setting up event listeners to react to key moments in the backtest run.

You can define functions to be executed when a strategy begins its testing (`onStrategyStart`), when a strategy finishes its test (`onStrategyComplete`), or if a strategy encounters an error (`onStrategyError`).  Finally, `onComplete` gets called when all the strategies have been evaluated. These callbacks provide opportunities for logging, real-time monitoring, or custom analysis of your backtesting results.

## Interface ITrailingTakeCommitRow

This interface represents a queued action to adjust a trailing stop-loss or take-profit order. 

It signifies a request to move the order based on a percentage shift from the current price.

The `action` property specifies this is a "trailing-take" action.

`percentShift` defines how much the price can move before the order is adjusted.

`currentPrice` stores the price when the trailing was initially established.

## Interface ITrailingStopCommitRow

This interface represents a queued action for a trailing stop order. Think of it as a record of a pending adjustment to your trading strategy. 

It details what kind of action is being taken – in this case, a trailing stop – and includes the percentage shift that will be applied. The interface also stores the current price at which the trailing stop was initially established, giving you context for the adjustment being made. Essentially, it’s a structured way to track and manage changes to trailing stop orders within the backtest.

## Interface IStrategyTickResultWaiting

This interface describes a situation where a trading strategy is waiting for a specific price level to be reached before executing a signal. Think of it as the strategy holding back, observing the market.

It provides information about the signal that's on hold, the current price being monitored, and details like the strategy and exchange names.

You’ll find details about the trading pair (symbol), the percentage progress towards take profit and stop-loss (though these are always zero when waiting), and the unrealized profit/loss of the potential trade.

The information also includes whether this is a backtest simulation or live trading, and a timestamp indicating when the result was generated. 


## Interface IStrategyTickResultScheduled

This data represents a signal that's been scheduled – meaning it's waiting for the price to reach a specific entry point. It's triggered when your trading strategy calculates a signal that includes a specified price. 

The data includes key details for tracking, such as the strategy and exchange names, the timeframe used, and the symbol being traded. You'll also find the current price at the time the signal was scheduled, along with information on whether the event is part of a backtest or live trading. Lastly, it provides a timestamp indicating when the scheduled signal was created, referencing either the candle's timestamp during backtesting or the execution context in live mode. 


## Interface IStrategyTickResultOpened

This describes what happens when a new trading signal is created within your strategy. You'll receive this result immediately after the signal is validated and saved.

It provides key details about the signal, including its ID, the strategy and exchange that generated it, and the timeframe it applies to.

You'll also see the symbol being traded, the price at the moment the signal opened, and whether this event occurred during a backtest or in a live trading environment.  This information allows you to understand the context of the signal’s creation and track its performance. 

The `createdAt` timestamp helps relate the event to the underlying candle or execution time.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an idle state – meaning it’s not currently generating any trading signals. 

It provides details about the conditions during this idle period. You’ll see the strategy's name, the exchange it's connected to, the timeframe being analyzed (like 1-minute or 5-minute), and the trading symbol involved. 

The current price, whether it's a backtest or live execution, and a timestamp of when the event occurred are also included, giving you a complete record of the idle state. Essentially, it's a snapshot of what was happening when your strategy wasn't actively trading.

## Interface IStrategyTickResultClosed

This interface represents the result you receive when a trading signal is closed, providing a complete picture of what happened. It bundles together details like the reason for the closure - whether it was due to a time limit, a stop-loss trigger, a take-profit target, or a manual close - along with crucial performance data.

You'll find the original signal parameters, the final price used for calculations, and a detailed breakdown of the profit and loss, including fees and slippage. The interface also logs information for tracking purposes such as the strategy name, exchange, timeframe, and trading symbol. 

It also indicates whether the signal's closure occurred during a backtest or in a live trading environment, and includes a unique close ID if the close was initiated by the user. Finally, it tracks the creation time of the result itself, linked to the candle or execution context.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – essentially, it didn’t lead to a trade being opened. This can happen if the signal never activates, or if it’s stopped out before a position can be entered.

It provides information about why the signal was cancelled, including the signal itself, the final price at the time of cancellation, and timestamps marking when the signal was scheduled and when it was cancelled. You'll also find details about the strategy, exchange, timeframe, and symbol involved in the trading attempt, along with whether it's a backtest or live trading scenario.

A unique cancellation ID is available if the cancellation was initiated through a manual cancellation request. Finally, it tracks the creation time of the result itself.

## Interface IStrategyTickResultActive

This interface represents a tick result when a strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL) trigger, or time expiration. It holds information about the ongoing situation, including the signal being watched, the current price used for monitoring, and the names of the strategy, exchange, and timeframe involved. 

You'll find details about the trading symbol, progress toward TP and SL (expressed as percentages), and the unrealized profit and loss (PNL) for the active position, taking into account fees, slippage, and potential partial closes. A flag indicates whether the data comes from a backtest or live trading environment. The creation timestamp and a timestamp for the last processed candle (specifically used in backtesting) are also included.

## Interface IStrategySchema

This schema defines how a trading strategy is registered within the backtest-kit framework. 

It essentially describes the logic and setup for generating trading signals. 

Each strategy gets a unique name for identification and can include a note for developers.

The `interval` property controls how often the strategy can generate signals, preventing it from overwhelming the system.

The core of the strategy is the `getSignal` function, which takes market data and decides whether to generate a buy or sell signal.  It can even be configured to wait for a specific price to be reached before executing a trade.

You can also add lifecycle callbacks to be notified when a strategy opens or closes a position.

Finally, the schema allows associating risk profiles and action identifiers for integrated risk management and strategy functionality.

## Interface IStrategyResult

The `IStrategyResult` represents a single row in a comparison table when backtesting different strategies. It holds all the crucial information needed to evaluate a strategy's performance.

You’ll find the strategy's name clearly listed, alongside its comprehensive backtest statistics which detail its behavior over the test period. 

A key element is the metric value - this is the value the optimizer uses to rank strategies, and it might be null if the strategy's run was problematic or invalid.

Finally, it tracks the timing of signals generated by the strategy, indicating when the first and last signals were produced during the backtest period. These timestamps can be helpful for analyzing strategy responsiveness.


## Interface IStrategyPnL

This interface describes the profit and loss (PNL) result of a trading strategy. It provides a breakdown of how much money was made or lost, considering the impact of trading fees and slippage. 

The `pnlPercentage` shows the profit or loss as a percentage change – positive values mean profit, negative values mean loss. The `priceOpen` and `priceClose` properties tell you the entry and exit prices respectively, but remember these are adjusted to account for those pesky fees and slippage. 

You can find the absolute profit or loss amount in USD using the `pnlCost`, which is calculated based on the total capital invested (`pnlEntries`).

## Interface IStrategyCallbacks

This interface lets you define callbacks to be notified about key events during a trading strategy's lifecycle. Think of it as a way to hook into specific moments in a trade's journey, like when a signal is first opened, becomes active, or is eventually closed.

You can listen for things like every market tick (`onTick`), when a new signal is initiated (`onOpen`), or when the strategy is in an idle state (`onIdle`).  There are also callbacks for scheduled signals like when they are created (`onSchedule`) or cancelled (`onCancel`). You’ll receive details about the symbol, relevant data, current prices, and whether it's a backtest.

Beyond the core trade stages, you can react to partial profit (`onPartialProfit`), partial loss (`onPartialLoss`), or breakeven (`onBreakeven`) situations, as well as receive regular ping notifications for scheduled (`onSchedulePing`) or active (`onActivePing`) signals, offering opportunities for custom monitoring or adjustments. There’s also an `onWrite` callback for persisting test data and one to observe signals being written to storage.

## Interface IStrategy

This interface defines the core functions for any strategy used in the backtest framework.

The `tick` function is run on each price update, handling signal generation, profit taking, and stop losses.

There are separate functions to retrieve pending and scheduled signals, allowing for monitoring and activation.

The framework provides ways to check for breakeven, and to determine how much of the initial investment remains in the position (`getTotalPercentClosed`) and its cost (`getTotalCostClosed`).

You can also determine the entry price (`getPositionEffectivePrice`), the number of entries (`getPositionInvestedCount`) and the overall cost (`getPositionInvestedCost`).  The potential profit/loss can be calculated in percentage and cost format (`getPositionPnlPercent`, `getPositionPnlCost`).

Detailed information about each entry, partial closes, and the position's history is accessible through various getter functions, including entry prices (`getPositionEntries`) and partial close history (`getPositionPartials`).

`backtest` provides a way to run a strategy against historical data.  There are also methods for manually stopping, canceling scheduled signals, or forcing activation/closure of pending signals.

Finally, there are functions for managing partial closes (`partialProfit`, `partialLoss`), adjusting stop-loss levels (`trailingStop`, `trailingTake`), and automatically moving to breakeven (`breakeven`).  These functions include validation methods to check if they can be executed.  The `dispose` function is for cleanup when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality needed for any storage adapter used within the backtest-kit trading framework. It provides a standard way to interact with storage, whether that's a database, a file system, or another method.

The framework uses these methods to keep track of signals and their status – when a trade is opened, closed, scheduled, or cancelled. Each of these events triggers a corresponding `handle...` method to update the storage.

You can also retrieve signals, either by searching for a specific signal using its ID or by listing all stored signals.

Finally, there are dedicated methods for handling "ping" events related to active or scheduled signals, which are used to ensure the stored data remains up-to-date.

## Interface IStorageSignalRowScheduled

This interface, `IStorageSignalRowScheduled`, represents a signal that's been scheduled for a future action. It essentially confirms that a particular signal is in a "scheduled" state, meaning it’s planned to be executed at a specific time. The `status` property is the key here—it's set to "scheduled," providing clear indication of the signal's current processing stage.

## Interface IStorageSignalRowOpened

This interface represents a signal row that is currently in the "opened" state. It's a simple way to track when a signal has been triggered and is active. The key property, `status`, confirms that the signal is currently open, providing clarity on its current operational phase. It’s useful for monitoring and managing signals that are actively being used.


## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade associated with it has been completed. 

It includes information specific to closed signals, most notably the P&L (profit and loss) data, which isn't available for open signals. 

The `status` property confirms the signal is in a "closed" state.

The `pnl` property holds detailed information about the financial outcome of that closed trade, allowing you to analyze its performance.

## Interface IStorageSignalRowCancelled

This interface defines a signal row specifically marked as "cancelled." It's a straightforward way to indicate that a signal has been invalidated or removed. The `status` property is the core of this interface, and it's fixed to the value "cancelled," ensuring clarity about the signal's state. Essentially, it's a simple record to track when a signal is no longer active.

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signal data, ensuring consistency across different signal states. Every signal record will have a `createdAt` timestamp, marking precisely when it was initially created.  There's also an `updatedAt` timestamp to track when the signal was last modified.  Finally, a `priority` field is included, dictating the order in which signals are processed – this is assigned a timestamp using `Date.now` for both live trading and backtesting scenarios.


## Interface IStateParams

The `IStateParams` interface helps you define how your trading signals store and manage their data. Think of it as setting up the organizational structure for your signal's state. It requires two key pieces of information: `bucketName`, which acts like a folder name to group related state data together, and `initialValue`, the starting point for your signal’s data when it’s first created. This ensures consistent and organized storage of your signals’ information.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data specific to individual trading signals. Think of it as a place to store and update information like peak unrealized profit and how long a trade has been open. This is particularly useful for strategies that use AI (LLMs) to make decisions, allowing the system to track and adjust based on real-time performance.

It's designed to work with different storage methods – local, persistent, or even dummy data – to keep track of this signal-specific data.

The `waitForInit` method is used to get things started, while `getState` lets you read the current values, but with a built-in safeguard to prevent looking into the future. The `setState` method updates this data, allowing earlier data to be overwritten, which is helpful for restarting backtests. Finally, `dispose` cleans up any resources associated with the instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines how to size trades using the Kelly Criterion, a method for maximizing long-term growth. 

It requires you to specify that you're using the "kelly-criterion" sizing method.

You also need to set a `kellyMultiplier`, which controls how aggressively you apply the Kelly Criterion; a smaller multiplier (like the default 0.25) is generally safer and represents a fraction of the Kelly amount. Higher multipliers can lead to faster growth but also carry a greater risk of significant losses.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple sizing strategy where you risk a fixed percentage of your capital on each trade. 

It's straightforward to implement and provides a consistent approach to position sizing. 

The `method` property identifies this as a "fixed-percentage" sizing method, and the `riskPercentage` property dictates the percentage of your portfolio you're willing to lose on a single trade – for example, 1% would mean risking 1% of your total capital.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, often referred to as `sizingName`, to distinguish it from others. You can also add a descriptive `note` to explain the purpose of the sizing strategy.

It also includes constraints on position sizes: `maxPositionPercentage` limits the size based on the account balance, while `minPositionSize` and `maxPositionSize` set absolute limits for the number of units or shares. Finally, `callbacks` provide a way to hook into different stages of the sizing process for more customized behavior.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

It requires you to specify that the sizing method is "atr-based". 

You'll also need to define the percentage of your capital you're willing to risk on each trade – typically somewhere between 0 and 100. Finally, it involves setting a multiplier for the ATR value; this multiplier is used to calculate the stop-loss distance for the trade, ensuring it’s proportional to the asset's volatility.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how to configure sizing strategies based on the Kelly Criterion. It allows you to inject a logger to help track and debug the sizing process. Essentially, you can use it to specify how much of your capital you want to risk on each trade, guided by the Kelly formula, and provide a way to see what's happening behind the scenes. The key part is providing a logger to receive debugging information.

## Interface ISizingParamsFixedPercentage

Okay, here's a revised version, removing the disallowed symbols:

This interface defines how to set up sizing parameters that use a fixed percentage for trade sizing. It includes a `logger` property, which is used to provide useful debug information during the backtesting process. Think of the logger as a way to see what's happening behind the scenes – it helps you understand how your sizing strategy is affecting trade sizes.

This represents a single bar of data.

*   The `time` is when the bar occurred.
*   `open` is the opening price.
*   `high` is the highest price.
*   `low` is the lowest price.
*   `close` is the closing price.
*   `volume` is the trading volume.

Defines how a client sizing strategy calculates trade size.

This method is the core of the sizing strategy – it determines how much to trade based on market data (`bar`), your available capital (`currentPortfolio`), and the planned trade (`trade`). The return value is the number of units to trade.

Defines the interface for an exchange.

*   `getOrderBook` retrieves the order book, showing current bid and ask prices and volumes. The `limit` parameter controls how many price levels are returned.
*   `getCandles` pulls historical price data.  `symbol` specifies the asset, `interval` sets the time frame (e.g., 1 minute or 1 day), and `limit` controls the number of bars retrieved.
*   `placeOrder` executes a trade, specifying the asset, side (buy/sell), order type, quantity, and optional price for limit orders. It returns an `IOrder` representing the placed order.

Represents an order placed on an exchange.

*   `id` is the order's unique identifier.
*   `status` indicates the order's current state (e.g., open, filled, canceled).
*   `side` is whether the order is to buy or sell.
*   `symbol` is the asset being traded.
*   `type` is the order type (market or limit).
*   `quantity` is the amount being traded.
*   `price` applies only to limit orders.

Represents an order book.

*   `bids` is an array of prices and sizes for buy orders.
*   `asks` is an array of prices and sizes for sell orders.

Defines the interface for a trading environment.

*   `getExchange` retrieves the exchange for a given asset.
*   `getSymbolMetadata` fetches information about an asset like contract size.

Represents a time interval for historical data.

Possible values include: OneMinute, FiveMinutes, TenMinutes, ThirtyMinutes, OneHour, FourHours, OneDay, OneWeek, OneMonth.

Represents the type of order.

Possible values: Market, Limit.

Represents the side of an order.

Possible values: Buy, Sell.

Represents the status of an order.

Possible values: Open, Filled, Canceled, Rejected.

Represents a timestamp, typically in milliseconds since the epoch.

Represents metadata for a trading symbol.

*   `contractSize` specifies the size of a single contract.
*   `expiryDate` is the date the contract expires, if applicable.

Represents a position held in a trading symbol.

*   `symbol` is the asset held.
*   `side` is whether the position is long or short.
*   `quantity` is the amount held.

Represents a portfolio of assets.

*   `equity` is the total value of the portfolio.
*   `positions` is a list of assets held in the portfolio.

## Interface ISizingParamsATR

To help understand how your trading strategies are performing, you can use a logger to record important events and data. This `logger` component allows you to receive messages for debugging and monitoring purposes. Think of it as a tool to track what's happening behind the scenes as your trades execute.

## Interface ISizingCallbacks

This section defines callbacks used to manage how your trading strategy determines the size of each trade. Specifically, the `onCalculate` callback lets you observe and potentially influence the size calculation process. You can use this to log the calculated size or even perform checks to ensure the size aligns with your strategy's rules. The callback receives the calculated quantity and parameters used in the calculation, giving you full visibility into the process.

## Interface ISizingCalculateParamsKelly

To help determine how much to bet, you can use the Kelly Criterion, a strategy that adjusts your bet size based on your win rate and average win/loss ratio.

The `ISizingCalculateParamsKelly` interface holds the information needed for this calculation.

You'll need to specify the method as "kelly-criterion".  Then, you'll need to input your win rate, which is a number between 0 and 1 representing the percentage of winning trades. Lastly, you'll define your average win/loss ratio - how much you typically win compared to how much you lose on a single trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades based on a fixed percentage. It's straightforward: you specify that you’re using the "fixed-percentage" sizing method, and you provide a `priceStopLoss` value. This `priceStopLoss` essentially sets the price level where your stop-loss order will be placed.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed when figuring out how much to trade. 

It includes the symbol of the asset you're trading, like BTCUSDT, and your current account balance. You’ll also need the anticipated entry price for the trade to help determine the size. Essentially, these are the essential building blocks for calculating trade sizes across different strategies.


## Interface ISizingCalculateParamsATR

This interface defines the settings used when calculating position sizes based on the Average True Range (ATR). 

It's a straightforward setup: you specify that the sizing method is "atr-based" and then provide the current ATR value, which acts as the foundation for determining how much to trade. The ATR value itself is a crucial input to the sizing algorithm.

## Interface ISizing

The `ISizing` interface defines how a trading strategy determines how much to buy or sell in each trade. Think of it as the core logic for deciding your position size.

It provides a single method, `calculate`, which takes in parameters related to risk and market conditions. This method then returns a number representing the calculated position size. It’s the internal engine powering how your strategy manages its exposure.


## Interface ISignalRow

This `ISignalRow` object represents a complete trading signal within the backtest-kit framework. Think of it as a single, validated order ready to be executed. Each signal has a unique identifier (`id`) and a clearly defined cost (`cost`) associated with it.

It contains all the necessary details for execution, including the intended exchange (`exchangeName`), the strategy used (`strategyName`), and the timeframe (`frameName`). It also tracks when the signal was initially created (`scheduledAt`) and when the position became active (`pendingAt`).

Crucially, it holds key information like the trading pair (`symbol`), entry price (`priceOpen`), and the expected holding time (`minuteEstimatedTime`).

Internally, the system uses flags like `_isScheduled` to manage the signal's status.  For more complex strategies, you might see partial closing records (`_partial`) which help calculate precise profit and loss.  Trailing stop-loss and take-profit prices (`_trailingPriceStopLoss`, `_trailingPriceTakeProfit`) allow for dynamic adjustments to your risk management. 

The `_entry` property holds a history of pricing if using a DCA approach and the `_peak` and `_fall` records track the highest profit and lowest loss experienced by the position, respectively, providing valuable insight into performance. Finally, `timestamp` records the creation or scheduling time of the signal.

## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to bundle them together and release them at specific intervals. Think of it as a way to group related signals and delay their delivery until a certain time has passed. Each signal gets a unique identifier, like a serial number, making it easy to track.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, providing all the necessary information to initiate a trade. It contains details like the trade direction (long or short), a descriptive note explaining the reasoning behind the signal, and entry and exit prices (take profit and stop loss).  You can optionally provide an ID for the signal; if not, one will be automatically generated.  Signals also include an estimated duration in minutes and the cost of entering the position, both of which have default values if not specified. This structure ensures all critical parameters are present and consistent when placing a trade.

## Interface ISessionInstance

This interface acts as a central hub for managing data during a backtest run. Think of it as a container holding temporary information specific to a particular symbol, trading strategy, exchange, and timeframe. It's designed to share data efficiently between different parts of your strategy, for things like caching calculations or tracking indicator values across multiple candles.

The `waitForInit` method makes sure the session is ready before anything else starts. You can use `setData` to store new data points along with a timestamp, and `getData` to retrieve them.  The `dispose` method cleans up anything the session is holding onto when it's no longer needed, ensuring resources are released properly. This helps keep things organized and prevents unexpected behavior during your backtests.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a signal that's not executed immediately. Think of it as a signal waiting for a specific price to be reached before a trade is placed. It builds upon the basic signal representation (`ISignalRow`), adding the concept of a "delayed" signal.

The `priceOpen` property defines the price level that needs to be hit before this scheduled signal becomes active and triggers a trade. Until that price is reached, it essentially sits in a queue. This allows for strategies that want to enter a position only when a certain price target is achieved.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal, but with an important addition: it allows for cancellations. Think of it as a way to mark a previously scheduled signal as no longer needed, typically because someone manually requested it. The `cancelId` property uniquely identifies that cancellation, useful for tracking and reference. There’s also a `cancelNote` field which can store a short explanation for *why* the signal was cancelled, helpful for auditing or understanding the reason behind the change. This addition is specifically for cancellations that are initiated by the user, not system-triggered events.

## Interface IRunContext

This interface, `IRunContext`, is like a comprehensive package of information needed when running a piece of code within the backtest-kit trading framework. It essentially merges two pieces of context: how your strategy relates to the exchange and broader strategy setup (`IMethodContext`), and the real-time details of the market data and trading situation (`IExecutionContext`). Think of it as a way to ensure that functions always have all the necessary information about the market environment, the trading strategy, and the current time. The framework then cleverly unpacks this combined context and distributes the data to the appropriate services for handling.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess risk during a trading backtest. It builds upon the existing `IRiskCheckArgs` and adds details about the current trading signals and the state of your portfolio.

You’ll find the `currentSignal` property which represents the signal being evaluated – it always includes price data, which simplifies your checks. 

The `activePositionCount` tells you how many positions are currently open, giving you a quick overview of your exposure.  Finally, `activePositions` provides a detailed list of those active positions, letting you examine them individually.


## Interface IRiskValidationFn

This defines the structure for functions that check if a trade request is safe to execute. Think of it as a gatekeeper for your trades. The function either confirms a trade is good to go (by returning nothing) or signals a problem (by returning a detailed rejection message or throwing an error). These errors or messages will then be converted into a standardized rejection result.

## Interface IRiskValidation

This interface lets you define how to validate risk parameters, ensuring your trading strategies are safe and sound.  Essentially, you provide a function (`validate`) that does the actual checking – think of it as the core logic to see if things are okay.  You can also add a `note` to explain what that validation function is doing, which is really helpful for keeping your code clear and understandable, especially when collaborating with others or revisiting your work later. This note acts like a little comment to remind you (and anyone else reading the code) why that specific validation step is important.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon the existing SignalDto, adding essential details like the entry price (priceOpen) and the initially set stop-loss and take-profit levels (originalPriceStopLoss and originalPriceTakeProfit).  These values are crucial for validating risk parameters and ensuring positions are handled safely. It allows the system to keep track of the original price points for risk validation purposes.

## Interface IRiskSchema

This defines a way to set up rules and checks for managing risk at the portfolio level. Think of it as creating custom guardrails for your trading strategies.

Each risk schema has a unique identifier, allowing you to easily manage multiple risk profiles. You can also add notes to describe the purpose of each risk schema for clarity.

You can define callbacks to be triggered under specific circumstances like a rejected trade or an allowed trade. 

The heart of the risk schema lies in its validations. These validations are functions or objects that you can create to implement your custom risk-checking logic. They define exactly how and when your portfolio is protected.

## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details about why the validation didn’t pass, helping you understand and fix the issue. Each rejection has a unique identifier (`id`) so you can track it specifically.  A clear explanation (`note`) is also included, giving you a human-readable reason for the rejection – think of it as a friendly message explaining what went wrong.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed to set up the risk management system. It includes the name of the exchange you're trading on, a way to log messages for debugging, and a time service to handle time-sensitive operations and prevent issues like looking ahead. You’ll also specify whether the system is running in backtesting mode or in live trading. Finally, there’s a special callback function that gets triggered when a trading signal is blocked due to risk restrictions, allowing you to handle those rejections and publish them.


## Interface IRiskCheckOptions

To help prevent problems with multiple trading signals trying to act on the same position at the same time, this option lets you temporarily mark a position as being used. This "reservation" ensures that other signals see the updated position size before any changes are actually made, avoiding conflicts and unexpected behavior. Think of it as putting a hold on the position so everyone knows it's being handled. You can enable this reservation by setting the `reserve` property to `true`.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide whether a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually put into action. It provides details about the trading pair involved, the signal itself, and information about the strategy and exchange requesting the trade. You'll find the current price and timestamp included, allowing for a complete picture of the market conditions at the time of the check. Essentially, it's a package of data to help ensure trades align with established risk parameters.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategies can use to react to risk management decisions. Specifically, it provides a way to be notified when a trading signal is blocked because it exceeds risk limits (`onRejected`) and when a signal is approved after passing all risk checks (`onAllowed`). These callbacks receive the symbol being traded and details about the risk check process, allowing for custom logging, alerts, or other actions based on the risk assessment. Essentially, you can use these to listen in on what your risk engine is deciding and respond accordingly.

## Interface IRiskActivePosition

This interface describes a single trading position that’s being actively managed, allowing for analysis across different trading strategies. It holds all the key details about a position, including which strategy created it, on which exchange, and the specific symbol being traded. You’ll find information here about the direction of the trade (long or short), the entry price, and any risk management parameters like stop-loss and take-profit levels. The interface also tracks timing information like when the position was opened and an estimated duration. Essentially, it’s a snapshot of a live trade.


## Interface IRisk

The `IRisk` interface is responsible for managing the risk associated with your trading strategies and ensuring you stay within defined limits. It lets you check if a trading signal is safe to execute based on your risk rules, offering two ways to do so. The `checkSignal` method performs a standard risk check. A special, thread-safe version, `checkSignalAndReserve`, goes further—it validates the signal and immediately sets aside a placeholder for the potential new position, all within a protected lock. This prevents multiple strategies from exceeding limits if they all pass the initial check concurrently.

To complete the process after `checkSignalAndReserve` (or `checkSignal`), you need to either add the actual position data using `addSignal` or cancel the operation and remove the placeholder with `removeSignal`. Failing to do so leaves the system with inaccurate information about your risk exposure. Finally, `addSignal` registers a new position when a trade is opened and `removeSignal` cleans up when a position is closed.

## Interface IReportTarget

The `IReportTarget` interface lets you choose exactly what kinds of data your backtest kit should record. Think of it as a way to fine-tune the logging process.

You can turn on or off logging for things like strategy executions, risk rejections, breakeven points, partial order closures, heatmaps, walker iterations, performance metrics, scheduled signals, live trading events, backtest signal closures, signal synchronization, or milestones like reaching the highest profit or experiencing a maximum drawdown.

By controlling these flags, you can keep your logs focused on the most important aspects of your trading strategy.


## Interface IReportDumpOptions

This interface lets you control what information gets written into your backtest reports. Think of it as a way to tag and categorize your data so you can easily find and analyze specific events. You can specify things like the trading symbol (like BTCUSDT), the name of the strategy you’re testing, the exchange being used, the timeframe (e.g., 1 minute, 1 hour), a unique identifier for the signal generated, and the name of the optimization walker. This allows you to filter and search your reports based on these criteria, making it much easier to understand what's happening during your backtests.


## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It allows for recording new signal events and retrieving the most recent signal available for a specific trading context like a symbol, strategy, exchange, and timeframe. A key feature is preventing look-ahead bias – it ensures that signals retrieved are not from the future. You can also easily determine how long ago the most recent signal was generated, which can be useful for various analysis and optimization tasks.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, gives you a clear view of a trading signal's original settings, even as those settings might change over time. It builds on the standard signal information, adding in the original stop-loss and take-profit prices that were set when the signal was first created.

Think of it as a way to show users exactly what they signed up for, even if their strategy is now dynamically adjusting those prices. The original values stay put, while the strategy might be doing things like trailing your stop-loss.

Here's a breakdown of what you get with each property:

*   `cost`: The upfront cost to get into the trade.
*   `originalPriceStopLoss`: The initial stop-loss price.
*   `originalPriceTakeProfit`: The initial take-profit price.
*   `partialExecuted`: How much of the position has been closed out through partial orders.
*   `totalEntries`: How many times the position has been entered, useful for understanding DCA strategies.
*   `totalPartials`: The number of times partial orders have been used.
*   `originalPriceOpen`: The price when you initially entered the trade.
*   `pnl`: The current unrealized profit or loss.
*   `peakProfit`: The highest profit the trade has reached.
*   `maxDrawdown`: The largest loss the trade has seen.



Essentially, it's designed to give transparency and a complete picture of a trade's journey, from its beginning to its current state.

## Interface IPublicCandleData

This interface defines the structure of a single candle data point, which is a standard way to represent price action over a specific time interval. Each candle contains information about when it began, its opening price, the highest and lowest prices reached during that period, its closing price, and the volume of trades that occurred. Think of it as a snapshot of market activity over a defined timeframe, providing key details for analysis and trading strategies. The timestamp is given in milliseconds since the Unix epoch, providing a precise marker for when the candle began.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It's used when you want to determine how much to bet or trade based on expected profitability. 

You'll provide two key pieces of information: `winRate`, which represents the percentage of times you expect a trade to be successful, and `winLossRatio`, which is the average profit you expect for each winning trade compared to the loss for each losing trade. These values help the framework automatically adjust your position sizes to optimize for growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital to determine the size of each trade. It's all about controlling risk by limiting potential losses.

The `priceStopLoss` property tells the system at what price to place a stop-loss order, helping you automatically exit a trade if it moves against you and protects your capital.


## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed for calculating position sizes based on the Average True Range (ATR). 

It focuses specifically on the ATR value itself.

The `atr` property represents the current ATR value, which is a key factor in determining how much capital to allocate to a trade.

## Interface IPositionOverlapLadder

This interface defines how to set up a range around each dollar-cost averaging (DCA) level to detect potential overlaps. Think of it as creating a buffer zone. The `upperPercent` property lets you specify a percentage above each DCA level—if a new buy happens within this zone, it's considered an overlap. Similarly, `lowerPercent` defines a percentage below each DCA level; if a purchase falls below this, it also triggers an overlap detection. These percentages help you fine-tune how strictly you want to identify overlapping purchases in your DCA strategy.

## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded for backtesting or live trading. Think of it as a way to replace the default file storage with your own method, like a database. 

It ensures that signal data is managed separately for backtesting and live trading sessions.

When you read data, all saved signals are retrieved and presented as a list. Writing data involves associating each signal with a unique identifier.

To use this, you’d build your own storage system that implements these methods to handle initialization, reading, and writing signals.

## Interface IPersistStateInstance

This interface helps your trading strategies safely save and load their data, even if things go wrong unexpectedly. Think of it as a way to keep track of your strategy's progress and settings without losing them.

It's designed to work with a specific combination of data streams (signalId) and storage locations (bucketName), ensuring your data is organized.

If you're building your own custom way to store strategy information – perhaps using a database instead of files – you can implement this interface.

The `waitForInit` method gets things started, `readStateData` retrieves saved data, `writeStateData` saves new data along with a timestamp, and `dispose` cleans up any resources when the strategy is done.

## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a specific setup. Think of it as a way to control the persistence of signal data, like the information used to generate trades, for a particular symbol, strategy, and exchange. If you want to avoid the default file-based storage, you can build your own adapter that implements this interface.

The `waitForInit` method handles getting the storage ready.
`readSignalData` retrieves the previously saved signal data.
Finally, `writeSignalData` saves the current signal data, and can be used to clear the stored data by providing null.

## Interface IPersistSessionInstance

This interface defines how to manage persistent session data for a specific trading setup—think of it as a way to remember things like order history or settings for a particular strategy, exchange, and timeframe. 

It’s used internally to make sure that even if things go wrong, your session information isn't lost.

If you want to customize how this information is stored (maybe not in a file), you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage. `readSessionData` retrieves existing data. `writeSessionData` saves new or updated data, along with a timestamp. Finally, `dispose` cleans up any resources used by the storage mechanism, although it might not always do anything specific.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads signals that are scheduled for specific trading strategies. Think of it as a way to control where and how the framework remembers what a strategy should be doing at a particular time. 

It’s designed for situations where you might want to store signals in a database, use a different file format, or implement a more complex persistence mechanism instead of the default file-based system.

If you implement this interface, you'll provide methods to:

*   Initialize the storage – telling the system whether this is the first time it's seeing this combination of symbol, strategy, and exchange.
*   Load any previously saved signal data for the specific trading scenario.
*   Save a new signal or clear out existing data when a signal is triggered or needs to be removed. 

Essentially, it provides a hook to tailor the persistence behavior to your specific needs and data storage solutions.

## Interface IPersistRiskInstance

This interface helps you manage how trading positions for a specific risk profile are saved and loaded. Think of it as a way to customize where and how information about open positions is stored, instead of relying on the default file storage. 

The `waitForInit` method prepares the storage for a particular risk context, essentially getting things ready to go. 

`readPositionData` retrieves the existing data about active positions for a given point in time. This allows you to load the positions as they were at that moment.

Finally, `writePositionData` saves the current state of active positions for a risk context, preserving them for later use.


## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent trading signal for a specific setup – think of it as remembering the last signal you used for a particular symbol, strategy, and exchange. It's designed to keep backtesting and live trading separate by allowing you to customize how that signal is saved.

If you want to control where and how these recent signals are stored (instead of the default file-based approach), you can build a custom adapter that implements this interface.

The `waitForInit` method prepares the storage area for a new signal.

`readRecentData` retrieves the last saved signal.

`writeRecentData` saves a new signal along with the timestamp of when it was generated.


## Interface IPersistPartialInstance

This interface helps manage how partial profit and loss information is saved and retrieved. Think of it as a way to keep track of a trade's progress for specific trading setups, like a particular strategy applied to a certain asset on a specific exchange. 

Each trading setup gets its own space to store these partial data points.
The data is organized by a unique signal ID, like a timestamped record of a trade's activity.

If you need more control over where and how this information is stored – perhaps in a database or a cloud service instead of a file – you can create a custom adapter that follows this interface. 

The `waitForInit` method sets up the storage space for a particular trading setup.
`readPartialData` fetches the saved data for a specific trade.
Finally, `writePartialData` saves the latest information about a trade's progress.

## Interface IPersistNotificationInstance

This interface lets you customize how notification data is saved and loaded for backtesting or live trading. Think of notifications as important events or messages – this lets you control where they're stored, like in a file or a database.

You can use it to build your own storage system if the default file storage isn’t what you need.

The `waitForInit` method prepares the storage when the system starts, either for a backtest or for live trading.  `readNotificationData` retrieves all previously saved notifications. Finally, `writeNotificationData` saves new notifications, making sure each one is easily identifiable.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context within the backtest-kit framework. Think of it as a way to manage temporary storage related to a particular trading scenario, especially useful when working with large language models (LLMs). 

It allows for soft-deleting memory entries – marking them as removed, but keeping the data on disk so it isn’t completely lost. This lets you easily revert or analyze past decisions without actually deleting files.

If you need a custom way to handle this memory persistence, you can create your own adapter that conforms to this interface, overriding the default file-based approach.

The methods available let you initialize the storage, read specific memory entries by their ID, check for their existence, write new data, remove entries, and list all the currently active memory entries. Finally, `dispose` gives you a chance to clean up any resources used by your memory storage.

## Interface IPersistMeasureInstance

This interface helps you manage how cached data is stored and retrieved for each trading bucket. Think of it as a way to customize how your backtest kit keeps track of historical information.

It allows you to persist data to disk, and importantly, includes a "soft delete" feature – when you remove data, it doesn’t actually disappear from disk right away, it’s just marked as removed and won’t be shown in normal searches.

If you want to use a different storage method than the default file-based system, you can create your own adapter that implements this interface.

Here's a breakdown of what the interface methods do:

*   `waitForInit`: Prepares the storage for a bucket, ensuring everything is ready to go.
*   `readMeasureData`: Fetches a specific piece of cached data based on a unique key.
*   `writeMeasureData`: Stores a new piece of data or updates an existing one.
*   `removeMeasureData`:  Removes a piece of data by marking it as deleted (soft delete).
*   `listMeasureData`:  Provides a way to look at all the keys of the data that haven't been marked for removal.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its log data. Think of it as a way to replace the default file-based storage with something else, like a database or an in-memory solution.

The `waitForInit` method is used to kick off the initialization process for the log storage – it’s how you tell the system if the initial state is already loaded.

`readLogData` fetches all the stored log entries, allowing you to access the entire history.

Finally, `writeLogData` is responsible for saving new log entries; it's vital that you prevent duplicates by skipping any entries that already have an existing ID, ensuring a chronological, append-only log.

## Interface IPersistIntervalInstance

This interface defines how your custom code interacts with the backtest-kit framework to manage interval markers – essentially, records that track when a specific trading period has already been processed. Think of it as a way to prevent a certain action from happening multiple times within the same trading bucket.

It's used to ensure that events or calculations only happen once per interval for a given key, which is crucial for accurate backtesting.

If you’re building a highly customized backtesting system, you can implement this interface to replace the default file-based storage with your own preferred method, like a database or in-memory store.

The `waitForInit` method lets you prepare the storage for a new bucket. `readIntervalData` fetches existing marker information.  `writeIntervalData` saves a new marker record, and `removeIntervalData` effectively "soft deletes" a record, allowing it to be fired again. Finally, `listIntervalData` gives you a way to see what markers currently exist for that bucket.

## Interface IPersistCandleInstance

This interface defines how your trading system can persistently store and retrieve candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to save your historical candle data so you don’t have to download it again every time you run a backtest.

It allows you to load a range of candles for a given timeframe, and also to save new candles.

The `waitForInit` method lets you prepare the storage when needed.

Crucially, `readCandlesData` will return `null` if any candle within your requested timeframe isn't found, signaling that your system needs to fetch them from the original data source. This ensures you're always working with complete data. The `writeCandlesData` method allows to save candles to the cache, but implementations can choose to skip those candles that are not yet complete.

## Interface IPersistBreakevenInstance

This interface helps manage and save the breakeven information for your trading strategies. Think of it as a way to keep track of important data points related to each trade, specifically the breakeven point, for a particular symbol, strategy, and exchange. 

It’s organized so that each signal you generate has its own dedicated storage space. This allows you to customize how this breakeven data is stored, potentially moving away from the default file-based approach.

The `waitForInit` method sets up the initial storage when needed.  `readBreakevenData` retrieves previously saved breakeven data for a specific signal and time. `writeBreakevenData` is used to save new or updated breakeven information.

## Interface IPersistBase

This interface provides the basic tools for any custom storage system that backtest-kit uses to save and load data. Think of it as a contract—if you build a way to store your trading data (like a database, a file system, or something else), this interface dictates the essential actions your system needs to support. 

It outlines how to initialize the storage, read a specific item, check if an item exists, write a new or updated item, and list all the items your storage holds. The keys method, in particular, is used to make sure all your data is consistent and can be processed in a predictable order. This framework expects you to implement this interface if you’re creating your own way to manage persistent data.

## Interface IPartialProfitCommitRow

This interface describes a single instruction to take a partial profit on a trade. 

Think of it as one step in a plan to close off a portion of your position.

It specifies that the action is a "partial-profit" and details how much of the position should be closed—represented as a percentage.  The `currentPrice` records the price at which the partial profit was actually taken.

## Interface IPartialLossCommitRow

This represents a record of a partial loss order that's been submitted for processing. It essentially details a request to close a portion of an existing position. 

The `action` property confirms this is a partial loss operation.  You’ll find the `percentToClose` value tells you what percentage of the position is being closed – for instance, 50% would close half. Finally, `currentPrice` records the price at which that partial loss was executed, giving you a clear picture of the transaction's financial details.

## Interface IPartialData

IPartialData is a way to save bits and pieces of your trading data, especially the important levels where your signal hit profits or losses. It’s designed to be easily stored and retrieved, even if you’re using a system that needs everything to be in a standard format like JSON.

Think of it as a simplified snapshot – it focuses on the profitLevels and lossLevels that have been recorded. These levels are presented as arrays, which is convenient for saving and loading.

The framework uses this structure to keep track of your signal's history, saving the profit and loss levels as they occur. When you load this data back in, it's converted into a more complete view of your trading state.

## Interface IPartial

The `IPartial` interface is designed to keep track of how your trades are performing – whether they're making a profit or a loss. It's used by the system to monitor trading signals and let you know when significant milestones are hit, like reaching 10%, 20%, or 30% profit or loss.

When a trading signal starts generating profit, the `profit` method steps in to analyze the situation. It looks at things like the symbol, current price, and how much money has been made, and then signals when new profit milestones are achieved.  It avoids sending redundant updates.

Similarly, the `loss` method handles situations where a signal is losing money, identifying and reporting new loss levels.

Finally, when a trading signal closes – whether it hits a target profit, a stop-loss, or a time limit – the `clear` method cleans up the record. This removes the trading signal's information from the system and prepares it for the next trade.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. It takes your initial input parameters and adds flags indicating the trading mode you've selected. 

Specifically, it includes properties to tell you if you're running in backtest mode (simulating trading on historical data), paper trading mode (practicing with live data but no real money), or live trading mode (actual trading with real funds). These flags are essential for configuring how the backtest-kit framework operates.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for the arguments you'd pass in to tell the system what to trade, which strategy to use, where to trade it (the exchange), and how frequently to look at data (the timeframe). You'll specify things like the trading pair, like BTCUSDT, the name of the strategy you want to run, which exchange you're using (like Binance or Bybit), and the candle timeframe, such as 1-hour or 1-day. It sets the stage for a successful backtest.

## Interface IOrderBookData

The `IOrderBookData` interface represents the snapshot of an order book, giving you the current state of bids and asks for a specific trading pair. It contains the `symbol` which identifies the trading pair, like "BTCUSDT".  You'll also find arrays of `bids` and `asks`, where each element describes a single buy or sell order with its price and quantity. Essentially, this data provides a picture of the market's current supply and demand.


## Interface INotificationUtils

This interface defines the basic structure for systems that send out notifications about your trading strategies. Think of it as a central point for how your backtest kit communicates important events – like a trade opening, hitting a profit target, or encountering an error.

It provides methods for handling a wide range of events:

*   Signals being generated (opened, closed, scheduled, cancelled).
*   Notifications about partial profits, losses, or reaching breakeven points.
*   Strategy settings being applied (like setting up trailing stops).
*   Signal synchronization events.
*   Risk rejection events and various types of errors.

You can also retrieve all stored notifications or clear them out when you're done. Any system that wants to alert you about what's happening during a backtest needs to follow this interface.

## Interface INotificationTarget

This interface lets you fine-tune which updates your backtest kit receives, so you're not overwhelmed with information you don’t need. Think of it as a filter for notifications – you only subscribe to the categories you care about. If you don't specify anything, you'll get everything.

Here’s a breakdown of what each option controls:

*   **signal:**  Keeps you informed about the lifecycle of trading signals, including when they're created, scheduled, closed, or canceled.
*   **partial\_profit:** Alerts you when a partial profit level is hit before a final decision is made.
*   **partial\_loss:**  Notifies you when a partial loss level is reached before a final decision.
*   **breakeven:** Informs you when the price hits the breakeven point.
*   **strategy\_commit:** Confirms that actions taken by the strategy, like partial profits or cancellations, have been executed.
*   **signal\_sync:** Provides updates when trading signals are confirmed and filled or exited through the exchange.
*   **risk:** Alerts you when the risk manager prevents a new signal from being opened.
*   **info:** Delivers informational messages from the strategy or manual entries.
*   **common\_error:** Lets you know about non-critical errors that are handled during the process.
*   **critical\_error:**  Signals a severe, unrecoverable error that stops the backtest.
*   **validation\_error:**  Informs you if there are problems with your strategy configuration or input data.



By enabling only the relevant categories, you can keep your backtest running smoothly and focus on the information that matters most.

## Interface IMethodContext

This object, called `IMethodContext`, acts like a little guide for your backtesting code. It carries important labels – the names of the exchange, strategy, and frame you're working with. Think of it as a way to tell your code exactly which set of rules and data to use for a specific backtest run. The `frameName` being empty signifies that the code operates in live mode, meaning it doesn't rely on historical data frames. This context is automatically passed around within the backtest framework, so you don’t usually need to manually handle it.


## Interface IMemoryInstance

The `IMemoryInstance` interface provides a way to manage data within the backtest-kit framework. It's the foundation for different types of storage, whether that’s a simple in-memory store, a persistent database, or even a mock implementation.

You can use `waitForInit` to ensure the memory is ready before you start working with it.

`writeMemory` allows you to save data, associating it with a unique ID, a description, and a timestamp.  Think of it like creating a record in a log.

When you need to find specific information, `searchMemory` lets you use text-based searching to quickly locate entries. It uses a scoring system to rank the results by relevance, and automatically filters out anything that happened *after* a specified date.

If you just need to see everything that's been recorded, `listMemory` will give you a list of entries, again filtered by date.

`removeMemory` provides a way to delete specific records from the memory.

To retrieve a particular record, `readMemory` lets you fetch it by its unique ID, and it respects the date filter.

Finally, `dispose` is for cleaning up – releasing any resources used by the memory instance when you no longer need it.

## Interface IMarkdownTarget

The IMarkdownTarget interface lets you choose which detailed reports you want to generate during a backtest or live trading session. Think of it as a way to fine-tune what information you see, helping you focus on specific areas of interest.

You can turn on reports for things like strategy events (entry and exit signals), risk rejections (signals blocked by rules), or breakeven points.

It also allows you to track portfolio performance analysis, signal scheduling, live trading events, and comprehensive backtest results.

You can even enable reports to monitor milestones like highest profit and maximum drawdown. Ultimately, this interface gives you control over the level of detail in your reports, allowing for deeper insights into your trading system.

## Interface IMarkdownDumpOptions

This interface defines the settings used when exporting information to Markdown files, letting you specify exactly what to include. Think of it as a set of labels to pinpoint the specific data you want to see in your reports. You can use the `path` property to dictate where the report file is saved, while `file`, `symbol`, `strategyName`, `exchangeName`, `frameName`, and `signalId` properties help you zero in on just the data for a particular trade or strategy. This makes it easy to create focused and organized documentation about your backtesting results.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework can record information about what's happening. It’s like a central place to keep track of events and details throughout the system.

You can use it to note down general happenings, detailed debugging information, informational updates, and even warnings about potential issues. This helps in understanding how the system works, finding problems, and keeping an audit trail.

The `log` method is for recording important events, `debug` is for very detailed information useful during development, `info` covers standard updates, and `warn` flags things that might need attention. Each method allows you to provide a topic to categorize the message and any arguments you want to include.

## Interface ILogEntry

This describes a single entry within a log history, helping you track what's happening during your backtests. Each entry gets a unique ID and is categorized by its severity level – log, debug, info, or warning.  A timestamp and creation date are included to make it easier to understand when the event occurred.

You'll also find context information like the method that triggered the log, and details about the environment where it ran. Finally, the entry can hold additional arguments that were passed when the log was created, allowing for more descriptive messages.

## Interface ILog

The `ILog` interface provides a way to access and review the history of logged messages within your backtesting or trading system. It’s designed to give you a complete picture of what happened during a simulation or live trade.

The `getList` method is your key to retrieving this information.  It returns a promise that resolves to an array of `ILogEntry` objects, each representing a single log event. This lets you examine past errors, warnings, or informational messages.

## Interface IHeatmapRow

This interface describes a single row in a portfolio heatmap, representing performance statistics for one specific trading pair like BTCUSDT. It bundles together key metrics to give you a quick view of how a strategy performed on that pair.

You’ll find information like the total profit or loss percentage, a Sharpe Ratio measuring risk-adjusted returns, and the maximum drawdown— essentially, the biggest loss from a peak. It also includes details on trade frequency, win/loss rates, and average profit/loss per trade. 

Further metrics like expectancy and Sortino/Calmar ratios provide more nuanced insights into the strategy’s effectiveness, while averages of peak and fall PNL percentages can highlight performance patterns. Finally, information about consecutive win/loss streaks offers a glimpse into the strategy's momentum.

## Interface IFrameSchema

This defines a blueprint for how your backtest will be structured, essentially setting up the timeline and frequency of data. Think of it as defining a specific "window" in time for your backtest.

Each frame has a unique name to identify it, and you can add notes for yourself to document its purpose.

The `interval` determines how often your data points will be generated (e.g., every minute, hour, or day).  The `startDate` and `endDate` precisely define the beginning and end dates of the backtest period.  You can also include optional callback functions to perform actions at specific points in the frame’s lifecycle.

## Interface IFrameParams

The `IFrameParams` object is how you set up the environment for a backtest. Think of it as the configuration details passed when creating the core testing environment. It builds upon the `IFrameschema` to include a `logger` which helps in tracking what's happening during the backtest, providing valuable insights and debugging information. The `logger` is your friend for keeping an eye on the backtest’s internal workings.

## Interface IFrameCallbacks

This function lets you react when a new set of timeframes has been created for your backtest. You'll get the array of dates, the start and end dates of the timeframe, and the interval used (like daily, weekly, etc.). It's perfect for checking if the timeframe generation looks correct or for simply keeping a record of what time periods are being tested.


## Interface IFrame

The `IFrames` interface is a core part of how backtest-kit organizes and generates the data it uses for testing trading strategies. It’s responsible for creating a sequence of specific timestamps, like daily, hourly, or minute-by-minute, for a given asset. 

Essentially, it provides a way to tell the system "give me all the dates and times for this stock, using this particular timeframe." This is how backtest-kit knows when to evaluate strategy decisions and measure performance. The `getTimeframe` function does the heavy lifting, producing an array of dates and times that form the backbone of the backtesting process.

## Interface IExecutionContext

The `IExecutionContext` provides the necessary information for your trading strategies and exchange interactions to function correctly. Think of it as a package of runtime details passed along to your code.

It includes the `symbol`, which is the trading pair you're working with, like "BTCUSDT."

You’ll also find the `when` property, representing the current timestamp.

Finally, the `backtest` property indicates whether the code is running in a simulated backtesting environment or in live trading mode. This helps your strategy adapt its behavior accordingly.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with an exchange to retrieve data. It essentially acts as a blueprint for connecting to a specific exchange, defining where to get candle data (like open, high, low, close prices) and how to format quantities and prices to match the exchange's rules. 

You’ll use this to tell backtest-kit which exchange you’re using and how to fetch the data it needs to run your trading strategies. 

The `exchangeName` is a unique identifier. The `getCandles` function is the most crucial – it's responsible for actually pulling the historical data. You can optionally specify how to format quantities and prices for correct trade execution, or provide functions for retrieving order books and aggregated trades.  Finally, the `callbacks` property lets you hook into certain lifecycle events within the exchange interaction.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configurations needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It acts as a blueprint for how the framework will communicate with a specific exchange.

Think of it as providing the building blocks for the framework to understand and use a particular exchange's data and functionality.

You need to supply functions to retrieve data, like historical candles, order books, and trades, and also functions to correctly format order quantities and prices to match the exchange's standards.  All of these functions are necessary for the framework to operate.

The `logger` allows for tracking debug information, and `execution` provides context like the trading symbol, timestamp, and whether the process is a backtest.


## Interface IExchangeCallbacks

This lets you react when new candlestick data arrives for a specific trading symbol and timeframe. You can define a function to handle this data, like updating a chart or triggering an alert. The function receives the symbol, interval (like 1m, 5m, 1h), the start date for the data, the number of candles requested, and an array of the actual candlestick data points. It's helpful for visualizing data or setting up real-time monitoring.

This callback is triggered when new trade (or order book) data is received. It's similar to `onCandleData`, but handles trade events instead of candlestick charts. You receive the symbol, the start date/time for the trades, the number of trades requested, and an array of trade data objects. Use it to track recent trades, analyze order book changes, or implement other real-time trading logic.

## Interface IExchange

This interface defines how backtest-kit interacts with different exchanges. It allows you to retrieve historical and future price data (candles), format trade quantities and prices to match the exchange's rules, and calculate indicators like VWAP. You can also access order book and trade information.

The framework provides flexible ways to fetch historical candles, allowing you to specify start and end dates, or just a limit of candles from the present. Future candles can be retrieved for backtesting scenarios.

Getting the average price helps in understanding the typical trading price for a symbol, calculated based on recent price and volume data. The ability to get the close price for a specific time interval provides valuable information for strategy evaluation. Finally, it allows you to fetch order book and aggregated trade data for a given symbol.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for anything you store and retrieve persistently within the backtest-kit framework. Think of it as the common ancestor for all your data objects – whether it's trade records, account information, or anything else you need to keep track of. It ensures that all your persistent entities share a consistent structure.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data snapshots during a backtest. Think of it as a way to record key events and information, like chat histories, simple data records, tables of information, text notes, error messages, or even complex JSON objects, related to a specific part of your backtest run. Each snapshot is linked to a unique identifier (dumpId) and a short description for context.  When you're finished with a dump instance, the `dispose` method lets you free up any resources it might be using. The implementation of this interface is tightly linked to a specific signal and bucket name.

## Interface IDumpContext

The `IDumpContext` helps organize and identify data dumps, particularly when using a `DumpAdapter`. Think of it as a container holding key information about a specific dump entry. It includes things like a `signalId` to pinpoint the trade it relates to, and a `bucketName` which groups dumps by strategy or agent. 

Each dump also has a unique `dumpId` for easy referencing, a `description` to explain what's in the dump (and used for searching), and a `backtest` flag to indicate whether the data comes from a backtest or live trading environment. This context is automatically provided when creating dump entries.

## Interface ICommitRowBase

This interface defines the basic structure for events that represent queued commits, which are used to handle actions that need to happen later in the process. Every commit event will have a `symbol` property, which tells you which trading pair the commit relates to. You'll also find a `backtest` property indicating whether the commit occurred during a backtesting simulation. This foundational interface ensures that all commit events share this core information.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candlestick data exists in the system's storage. It’s used to quickly verify if data is available without having to scan through all the files. You’ll specify the trading symbol, the exchange the data comes from, the time interval of the candles (like 1 minute or 4 hours), and the start and end dates you're interested in validating. Think of it as a targeted query to see if the necessary data files are present.

## Interface ICandleData

This interface represents a single candlestick, a common way to organize price data over time. It contains all the key information for each period – when it started (timestamp), the opening price, the highest and lowest prices reached, the closing price, and the volume of trades that occurred. You'll find this structure vital for performing backtests and calculating things like VWAP. Essentially, it’s a snapshot of market activity during a specific timeframe.

## Interface ICacheCandlesParams

This interface defines the options you can set when caching historical candlestick data, allowing you to customize the process. It's designed to handle a combined validation and warm-up approach to ensure data accuracy and completeness.

You can provide callback functions that execute at key points:

*   `onWarmStart`: This function runs right before the initial warm-up phase, giving you a chance to log or prepare for the caching process. It tells you which symbol, interval, and date range are being warmed.
*   `onCheckStart`: This function is called just before the validation check. It’s triggered when the validation step fails, and the system needs to "warm up" the cache with more data. You'll receive the symbol, interval, and date range for this validation.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework communicates with a real brokerage for order execution. Think of it as a bridge connecting the simulated trading environment to a live exchange. It’s designed so that you can plug in your preferred broker and have the framework execute trades in the real world.

Before the framework makes any changes to its internal state (like opening or closing a position), it calls the methods defined in this interface. If any of these calls fail, the framework rolls back any changes, ensuring data consistency. Critically, when running backtests, these brokerage calls are skipped entirely; the adapter never receives trading requests, so it only handles live execution.

Here's a breakdown of the individual methods:

*   `waitForInit`: This is called once at the beginning to handle initial setup like connecting to the broker or loading API credentials.
*   `onSignalCloseCommit`: Notifies the broker that a trading signal has been closed – whether that’s due to a take-profit, stop-loss, or manual intervention.
*   `onSignalOpenCommit`:  Signals that a new trading position has been successfully entered.
*   `onPartialProfitCommit`: Used to execute a partial profit-taking action.
*   `onPartialLossCommit`: Used to execute a partial loss-taking action.
*   `onTrailingStopCommit`: Used to adjust a trailing stop-loss order.
*   `onTrailingTakeCommit`: Used to adjust a trailing take-profit order.
*   `onBreakevenCommit`:  Handles setting or adjusting a breakeven stop-loss (where the stop-loss is set at the entry price).
*   `onAverageBuyCommit`:  Used when executing a dollar-cost averaging (DCA) strategy where a new buy order is placed.

## Interface IBreakevenData

This interface defines the data needed to save and load information about whether a breakeven point has been achieved for a specific trading signal. Think of it as a snapshot – a simple "yes" or "no" (represented as a boolean) indicating if the breakeven target has been hit. This data is stored persistently, allowing your backtesting results to be saved and reloaded later. It's designed to be easily converted to and from a JSON format for storage and retrieval.

## Interface IBreakevenCommitRow

This object represents a step in a trading backtest where the strategy adjusts its breakeven point. Specifically, it signifies a "breakeven" action being taken. It contains the current price of the asset at the moment the breakeven adjustment is triggered, which is essential for accurately reconstructing the trade history.

## Interface IBreakeven

This interface helps track when a trade's stop-loss should be moved to the entry price, essentially aiming to protect profits. It's used by components that manage and monitor trading signals.

The `check` method determines if the conditions for reaching breakeven are met – ensuring the price has moved favorably enough to cover fees and that breakeven hasn't already been triggered. If everything lines up, it records the breakeven event and notifies interested parties.

The `clear` method resets the breakeven state when a trade finishes, cleaning up the data and ensuring a fresh start for the next signal. It ensures a clean slate when a trade closes out.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book. It contains two key pieces of information: the `price` at which the bid or ask is offered, and the `quantity` of the asset available at that price. Both the price and quantity are stored as strings. Essentially, this data defines a single level within the larger order book.

## Interface IAverageBuyCommitRow

This interface represents a single step in a recurring average-buy (DCA) strategy. It details one instance where funds were used to buy assets, contributing to your average purchase price. Each time an average-buy is triggered, a record like this is created, containing the price you bought at, how much it cost, and the total number of entries you’ve made in your DCA plan so far. This information is used to track the progress of your DCA and understand its impact on your overall investment.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. Think of it as a record of one transaction, complete with details like the price, how much was traded, and when it happened. Each trade has a unique ID for easy tracking.  You can tell whether the buyer or seller initiated the trade using the `isBuyerMaker` property - it's true if the buyer was the one providing liquidity. This data is essential for analyzing trading patterns and building backtests.

## Interface IActivityEntry

An `IActivityEntry` represents a single instance of a trading activity, whether it's a backtest or a live trade. Think of it as a record of what's currently happening.

These entries are automatically created when an activity begins and removed when it finishes, either successfully or with an error. 

They help the system keep track of ongoing operations and ensure things aren't running in parallel unintentionally.

Each entry includes details like the trading symbol (e.g., BTCUSDT), information about the strategy and exchange involved, and whether it's a backtest or a live execution.


## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commitment. Think of it as a signal that something that was planned to happen is now being put into motion. 

It includes the type of action, which is always "activate-scheduled." It also specifies the `signalId` – a unique identifier for the signal being activated.  You can also provide an `activateId` if the activation is happening as a direct result of a user’s action.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current trading signal situation. Think of it as a read-only window into whether a signal is actively waiting. 

It’s used to prevent certain actions from happening if there isn't a signal to work with—for example, it stops actions related to profit targets or stop-losses if nothing is waiting.

Specifically, it lets you check:

*   If there's a pending signal (an open position) for a particular trading symbol.
*   If a signal is scheduled to arrive in the future for that symbol.

These checks help ensure your actions only happen when they’re relevant to the trading strategy.

## Interface IActionSchema

The `IActionSchema` allows you to extend your backtesting strategies with custom actions, essentially letting you hook into the strategy’s execution flow. Think of it as a way to add your own custom logic that reacts to events happening within the strategy.

You can use actions to manage state, log events, send notifications, collect data, or trigger specific business logic.

Each action is tied to a specific strategy and a frame of time, meaning it gets a unique view of what's happening at that moment. You can add many actions to a single strategy to tailor it to your needs.

The schema itself defines a unique name for the action, a note for developers, a handler—which is either a constructor for your action logic or a set of pre-defined functions—and optional lifecycle callbacks that let you control when the action is executed.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run effectively. It builds on a basic structure, adding essential tools for tracking and context.

You'll find a `logger` included, so you can easily see what's happening during the action's execution and spot any potential problems.

It also provides the names of the strategy and timeframe this action is part of, as well as the exchange being used. 

There's a flag indicating if the action is running as part of a backtest, and a special `strategy` object.  This `strategy` object gives you access to vital information about the current market signals and your existing positions.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, gives you a way to hook into the important moments in your trading action handler's lifecycle. Think of it as a set of event listeners you can use to customize how your actions behave.

You can use `onInit` to set things up when an action handler starts, like connecting to a database or subscribing to data feeds. Conversely, `onDispose` lets you clean up when an action handler finishes, closing connections and saving data.

Several callbacks provide ways to react to signals – `onSignal` covers all situations, while `onSignalLive` and `onSignalBacktest` let you handle live and backtesting scenarios separately.

Beyond signals, you have hooks for managing profit and loss targets (`onBreakevenAvailable`, `onPartialProfitAvailable`, `onPartialLossAvailable`), monitoring ping schedules (`onPingScheduled`, `onPingActive`, `onPingIdle`), and dealing with risk rejections (`onRiskRejection`).

Finally, `onSignalSync` gives you a unique opportunity to directly influence order placement – you can even reject a signal and have the framework retry it later.  Be careful though, errors here aren’t handled internally, so your code needs to be robust.

## Interface IAction

The `IAction` interface is your central hub for connecting your custom logic to the backtest-kit trading framework. Think of it as a way to react to events happening within the trading process – signals being generated, profit/loss thresholds being hit, or the system checking in on pending orders. You can use it to build dashboards, log activity, manage your own state, or even customize how the system handles certain situations.

Here's a breakdown of what you can do with these events:

*   **signal:** This is the most general event, triggered every time the strategy produces a signal, whether you’re backtesting or live trading.
*   **signalLive & signalBacktest:** If you need to handle live and backtest signals differently, these specific methods let you do just that.
*   **breakevenAvailable:** Get notified when a stop-loss reaches the entry price.
*   **partialProfitAvailable & partialLossAvailable:** Respond to events when profit or loss targets are achieved.
*   **pingScheduled, pingActive, pingIdle:** These handle notifications related to scheduled or active pending signals, giving you insights into the waiting process.
*   **riskRejection:**  React to signals that fail a risk validation check.
*   **signalSync:**  This is a critical event when the framework tries to place a limit order. You can prevent this order by throwing an error, and the system will retry.
*   **dispose:**  Always clean up any resources you've used when you're done, like unsubscribing from subscriptions.



By implementing this interface, you can extend and customize the framework’s behavior to fit your exact needs.

## Interface HighestProfitStatisticsModel

This model helps you keep track of the events that resulted in the highest profits during a trading simulation. It stores a complete, ordered list of these profitable events, with the most recent ones appearing first. You’ll also find a simple count indicating the total number of high-profit events that were recorded. Essentially, it's designed to give you a clear picture of when and how your strategy achieved its greatest gains.

## Interface HighestProfitEvent

This data structure represents the single most profitable moment observed for a trading position. It bundles together all the key information about that peak performance.

You’ll find details like the exact timestamp it occurred, the trading symbol involved, and the name of the strategy that generated the trade. 

It also includes identifiers for the signal that triggered the trade and whether the position was long or short. Crucially, it tracks the total profit and loss (PNL), the highest profit ever achieved, and the maximum drawdown experienced during the trade's lifetime. 

Further details like the price at which the profit record was set, the original entry price, and the configured take profit and stop loss levels are also recorded. Finally, a flag indicates if this event happened during a backtesting simulation.

## Interface HighestProfitContract

This contract lets you track when a trading strategy reaches a new peak in profit. It provides details about the trade, including the symbol being traded, its current price, and the exact time the profit milestone was hit. You'll also get information about the strategy itself—its name, the exchange used, the timeframe being analyzed—and the signal that triggered the trade. Crucially, it tells you whether this is a result of a backtest or a live trade, so you can handle the information differently depending on the situation. This helps you build custom strategies, like automatically setting trailing stops or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for your portfolio's performance, visualized as a heatmap. 

It breaks down the key metrics across all the symbols you're tracking. 

You'll find details like the total number of symbols in your portfolio, the overall profit and loss, and the Sharpe Ratio which measures risk-adjusted return.

The structure also includes important performance indicators like the average peak and fall PNL, weighted by the number of trades, to give you a sense of how your portfolio behaves under different market conditions. Finally, it includes the total number of trades executed across all symbols.

## Interface DoneContract

This interface, `DoneContract`, signals when a background task finishes, whether it's part of a backtest or a live trading session.  It gives you details about what just completed, including the exchange used, the name of the strategy, and whether it was a backtest or live execution. You'll see this event when Live.background() or Backtest.background() has finished running. The information includes the trading symbol, such as "BTCUSDT", and the name of the frame being used (which will be empty if the task ran in live mode).

## Interface CriticalErrorNotification

This notification signals a serious, critical error that demands the immediate stopping of the current process. It's your warning sign that something has gone wrong in a way that requires a complete reset. Each notification carries a unique identifier, a clear explanation of the error, and detailed information about the error itself, including a stack trace and any relevant data. Importantly, these notifications always indicate an issue arising from the live trading environment, not from the backtesting process itself.

## Interface ColumnModel

This defines how your data will appear in a table. Think of it as a blueprint for each column, letting you control what gets shown and how it's presented. You'll assign a unique `key` to identify each column.  A `label` provides the user-friendly name that will appear as the column header.  The `format` function is really powerful – it lets you transform your raw data into a nicely formatted string for display, like changing a date to a specific format or rounding a number.  Finally, the `isVisible` function allows you to conditionally hide or show columns based on certain conditions, making your tables dynamic and adaptable.

## Interface ClosePendingCommitNotification

This notification provides detailed information when a pending trade signal is closed before it's fully activated. It's a way to understand why a signal didn't result in a full trade.

The notification includes a unique identifier, a timestamp, and indicates whether it originated from a backtest or live trading environment. You’ll also see details like the trading symbol, the strategy that generated the signal, and the exchange involved.

It gives a complete picture of the potential trade, including the total number of entries and partial closes that might have been involved, the original price the signal was based on, and comprehensive profit and loss (PNL) data. This includes peak profit, maximum drawdown, and the pricing used for those calculations. You'll find a breakdown of costs and percentages, along with information about pricing at peak profit and maximum drawdown points. Finally, a human-readable note can give context to the signal's closing.

## Interface ClosePendingCommit

This event signifies the closing of a previously opened position. 

It provides detailed information about the closed trade, including the reason for closure, identified by a user-provided ID. 

You'll also find comprehensive profit and loss data, such as the total profit/loss for the position, the highest profit achieved, and the largest drawdown encountered during its lifespan. This allows for a complete picture of the position's performance.


## Interface CancelScheduledCommitNotification

This notification lets you know that a previously scheduled trading signal has been cancelled before it was activated. It contains a wealth of information about the signal and its potential performance, including its unique identifier, the timestamp of the cancellation, and whether it occurred during backtesting or live trading. You’ll find details like the trading pair involved (e.g., BTCUSDT), the strategy and exchange that generated the signal, and a unique ID for both the original signal and this cancellation. 

The notification also provides a snapshot of the potential position's financial performance, covering key metrics like total P&L, peak profit, maximum drawdown, and their respective price points and cost calculations. You'll even find information about the number of entries and partial closes that *would have* been executed. Finally, an optional note can provide extra context for why the signal was cancelled. This data is invaluable for understanding why a signal didn't execute and for refining your trading strategies.

## Interface CancelScheduledCommit

This interface represents a signal to cancel a previously scheduled event. It’s used to communicate that a planned action should be stopped.

The `action` field simply identifies this as a cancellation request. 

You can include a `cancelId` to provide a reason or identifier for the cancellation—this is helpful for tracking and debugging.

Finally, the signal provides details about the closed position being cancelled, including its total profit and loss (`pnl`), the highest profit ever reached (`peakProfit`), and the largest loss encountered (`maxDrawdown`). This information can be useful for understanding the context of the cancellation.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation. 

It tracks individual breakeven events, giving you a detailed list of when those milestones were hit. 

You can also see the total number of times a breakeven was achieved, providing a quick overview of how often this key milestone occurred. Essentially, it helps you analyze and understand the performance related to reaching breakeven.


## Interface BreakevenEvent

This data structure holds all the essential details whenever a trading signal reaches its breakeven point. It's designed to be used when creating reports and analyzing performance.

The event includes information like the exact time it happened, the trading symbol involved, the name of the strategy used, and the unique identifier of the signal.  You'll also find details about the position type, the current market price, and the initial entry price.

Further details capture the take profit and stop-loss levels, their original values when the signal was first created, and information regarding any dollar-cost averaging (DCA) strategies used, such as the total number of entries and partial closes.  It also provides insights into the profit and loss (PNL), a human-readable note explaining the signal's logic, and timestamps for when the position became active and the signal was initially scheduled. A flag indicates whether the trade occurred during a backtest or a live trading session.

## Interface BreakevenContract

This interface represents a breakeven event, which occurs when a trading signal's stop-loss is moved back to the initial entry price. Think of it as a milestone showing a strategy successfully reducing its risk. These events are designed to be unique for each signal and are triggered when the price moves enough to cover transaction costs.

Several components use this information: a service for generating reports and user callbacks for real-time monitoring.

Here's what information is included in each event:

*   The trading symbol (like BTCUSDT)
*   The name of the strategy that generated the signal
*   The name of the exchange used
*   The frame being used (this will be blank for live trading)
*   Full details about the original signal, including stop-loss and take-profit prices
*   The current price at the time of the breakeven event
*   Indicates whether this is from a backtest or live trading
*   A timestamp indicating when the breakeven occurred, with different meanings depending on whether it’s live or backtest mode

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trade has been closed. It provides a wealth of details about the trade, including when it happened (timestamp), whether it occurred in a backtest or live environment, and the specifics of the trading pair and strategy involved. You'll find a unique ID for the notification itself, as well as identifiers for the signal and the exchange.

The notification details all the key price points related to the trade, from the initial entry price to the take profit and stop loss levels, both as originally set and as they were adjusted. It also reveals information about any dollar-cost averaging (DCA) used and any partial closes that were executed.

Crucially, it breaks down the profit and loss (PNL) for the position, including peak profit, maximum drawdown, and corresponding prices and costs.  There's also a wealth of data related to the individual entries and partials, like number of entries and partials executed. A note field allows for adding a short explanation. Timestamps related to signal creation and pending states are also included, offering a complete picture of the trade’s lifecycle.

## Interface BreakevenCommit

The `BreakevenCommit` event signifies a breakeven adjustment has been triggered within the trading strategy. It provides a snapshot of the position's state at the moment the adjustment was made.

You'll find details like the current market price (`currentPrice`) and the overall profit and loss (`pnl`) of the trade, including any previous entries or partial exits. The event also captures the highest profit (`peakProfit`) and the largest loss (`maxDrawdown`) experienced by the position.

Important information about the trade’s direction (`position`), initial entry price (`priceOpen`), and originally set take profit (`priceTakeProfit`) and stop loss (`priceStopLoss`) levels are included. The original take profit and stop loss values, *before* any trailing adjustments, are also available (`originalPriceTakeProfit`, `originalPriceStopLoss`).

Finally, the event records when the signal was generated (`scheduledAt`) and when the position was initially activated (`pendingAt`).

## Interface BreakevenAvailableNotification

This notification signals that a trading position has reached a point where the stop-loss order can be adjusted to the entry price, essentially breaking even. It provides a wealth of information about the trade, including a unique ID, when it happened, and whether it occurred during a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange involved. Crucially, it shows the current market price, the original entry price, and the direction of the trade (long or short).

Beyond just the basic details, the notification also exposes the take profit and stop-loss prices, both current and original (before any trailing adjustments). It dives deep into the position’s performance, including total entries, partial closes, profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown information including the prices and timestamps associated with those events. This comprehensive data allows for in-depth analysis of the trade's lifecycle. Finally, it includes optional notes for explanations and timestamps covering signal creation and pending statuses.

## Interface BeforeStartContract

This interface, `BeforeStartContract`, signals the very beginning of a trading strategy's execution for a specific trading symbol. It's a crucial point where you can set up things that need to happen only once per run, like preparing log files, resetting counters, or sending notifications that the run has started.  You're guaranteed this event will happen just once at the beginning, and it will always be followed by a corresponding `AfterEndContract` event, even if the run encounters problems.

The event provides key details about the run, including the trading symbol, the name of the strategy being used, and the exchange providing data. You'll also find information about the timeframe and whether the run is a backtest or live trading.  A helpful price snapshot is also included to avoid needing to query the exchange directly.  Importantly, the `when` property tells you the intended start time – in backtests, it's the planned historical replay start time, while in live trading, it reflects the current wall-clock time. Both `when` and `timestamp` provide the same time information, allowing you to work with the data efficiently.

## Interface BacktestStatisticsModel

The BacktestStatisticsModel provides a detailed breakdown of how your trading strategy performed during a backtest. It's a collection of key metrics that help you understand its strengths and weaknesses.

You'll find a list of every trade signal that was closed, along with its specifics like price and profit/loss. The model also tracks the total number of trades, and separately counts the winning and losing trades.

Several performance ratios are included, such as the win rate (percentage of winning trades), average profit/loss per trade, and overall cumulative profit/loss. Volatility is measured using standard deviation, and risk-adjusted performance is assessed through Sharpe and Sortino ratios, along with related annualized versions.

Further insights into trade characteristics are available, including average peak profit and average fall profit – allowing assessment of potential high points and how deep drawdowns can get. Finally, the model offers metrics such as recovery factor and Calmar ratio, indicating potential and resilience against losses.

Keep in mind that any numerical value that's deemed potentially unreliable (like encountering a division by zero) will be represented as null.

## Interface AverageBuyCommitNotification

This notification provides detailed information about a new averaging (DCA) entry being added to an existing trade. It's triggered whenever your strategy takes another step in its DCA plan.

The notification includes a unique ID, a timestamp, and indicates whether it's from a backtest or live trading. You'll see the trading pair, the strategy and exchange involved, and a unique signal identifier.

It also gives you key pricing information like the execution price, the cost of this particular averaging entry, and the updated average entry price. You can also track the total number of DCA entries and partial closes executed.

Furthermore, it provides comprehensive performance metrics for the trade, including total profit and loss, peak profit, maximum drawdown, and various price points related to those metrics.  A note field allows for a brief explanation of why the averaging entry was taken. Finally, you’ll find timestamps related to the signal's creation and pending status.

## Interface AverageBuyCommit

This event signals a new average-buy action has occurred within a trading position, a core part of dollar-cost averaging (DCA) strategies. It provides a snapshot of the position's state after the averaging entry.

The event tells you the price at which the new averaging purchase was made, along with the cost of that particular buy. It also recalculates and shows you the effective average entry price, which is what the position’s entry price now is after factoring in the new buy.

You’ll also find information about the position’s performance, including unrealized profit and loss (PNL), the highest profit achieved, and the largest drawdown experienced so far. It includes the original entry price, and any adjusted take profit and stop loss prices. The timestamp of when the signal was created and when the position was activated is also included.

## Interface AfterEndContract

This interface signals the end of a trading strategy's execution, regardless of how it concluded – whether it finished normally, encountered an error, or was stopped prematurely. It's designed to ensure critical cleanup tasks are performed reliably after each run.

You're guaranteed to receive this event exactly once for each strategy run, and it will always be paired with a corresponding `BeforeStartContract` event. Any errors that occur while handling this event are safely caught to prevent them from disrupting the broader system.

The `when` property represents the event's time, differing based on whether you’re in backtest or live mode. In backtest mode, it reflects the time of the last processed candle, or the frame’s start date if nothing was processed.  In live mode, it's the current time, rounded to the nearest minute.

The information provided includes the trading symbol, strategy name, exchange and frame used. Knowing whether it’s a backtest or live run is also available.  For convenience, the event includes the average price observed at the time, preventing you from needing to query the exchange directly.

## Interface ActivePingContract

The `ActivePingContract` represents periodic updates while a pending signal is actively being monitored. These updates, sent every minute, provide information about the signal's lifecycle and allow for custom logic. 

It includes details like the trading symbol ("BTCUSDT"), the name of the strategy managing the signal, and the exchange where it's being monitored. 

You’ll also receive the full data associated with the pending signal, including its ID, position details, and price levels.  The current market price at the time of the ping is provided, which is useful for triggering actions based on price movements. 

Finally, a flag indicates whether the event originates from a backtest (historical data) or live trading.  The timestamp indicates when the ping occurred - either the real-time ping moment in live mode, or the candle timestamp during backtesting. You can listen for these events using `listenActivePing()` or `listenActivePingOnce()` to build custom management behaviors.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been manually activated. It provides a wealth of details about the trade, including its unique identifier, when it was activated, and whether it's part of a backtest or live trading. You'll find information about the trade's direction (long or short), entry and stop-loss prices, as well as the strategy and exchange involved.

The notification includes key performance indicators (KPIs) like peak profit, maximum drawdown, and profit/loss percentages, all calculated up to the point of activation.  Detailed breakdowns of the position's history are available too, such as the number of DCA entries, partial closes, and prices used for P&L calculations.  Furthermore, it contains the original signal creation timestamp and the time it transitioned to a pending state, helping you understand the full lifecycle of the trade. A note field allows for a custom description of the signal's reasoning.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a scheduled signal is activated. It’s used to communicate details about a trade that’s being executed based on a pre-defined schedule.

The `action` field confirms that this is specifically an activation of a scheduled signal.

The `activateId` provides a way to identify *why* the activation occurred, which can be helpful for tracking and debugging. 

The data includes key performance metrics of the position, like the current price and accumulated profit and loss (`pnl`), alongside the peak profit and maximum drawdown observed since the trade began.

You'll also find the trade’s direction (`position`), entry price (`priceOpen`), and target prices for take profit and stop loss, both in their initially set values and any adjustments made to them.  Finally, the `scheduledAt` indicates when the signal was first created, and `pendingAt` marks the time the position actually began.
