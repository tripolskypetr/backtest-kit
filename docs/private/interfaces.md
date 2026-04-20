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

This interface defines the information sent when a walker needs to be stopped. 

Think of it as a notification that a specific trading strategy, running under a particular walker, needs to be halted. 

It’s useful when you have multiple strategies running at the same time, allowing you to target the stop signal to just the one you want to interrupt. 

The notification includes the trading symbol, the name of the strategy, and the name of the walker that's being stopped, ensuring the correct process is interrupted.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. It bundles together the core results from each strategy, giving you a clear view for comparison. Essentially, it's a list of results, each representing a strategy's performance. This allows you to easily analyze and compare strategies side-by-side.

## Interface WalkerContract

The WalkerContract represents updates during the comparison of different trading strategies. It's like a notification you receive each time a strategy finishes its testing run.

This notification includes details like the strategy's name, the exchange and frame it was tested on, the trading symbol involved, and the specific statistics generated during the backtest. 

You'll also find the strategy's performance metric value, the metric being optimized, and how it stacks up against other strategies tested so far – including the best-performing strategy seen thus far.

Finally, it tells you how many strategies have been tested and the total number planned, giving you a sense of the overall progress of the backtest process.

## Interface WalkerCompleteContract

The `WalkerCompleteContract` provides a way to receive notifications when a full backtesting process is finished. Think of it as a signal that all the strategies have been run and the results are ready.

It bundles together all the important information about the completed backtest, including the name of the walker that ran it, the trading symbol used, the exchange and timeframe involved, and the optimization metric applied.

You'll also get the total number of strategies tested, the name of the strategy that performed the best, the best metric value achieved, and detailed statistics for that top-performing strategy. This contract allows you to easily access a complete picture of the backtest’s outcome.

## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during the backtesting process. 

Think of it as an alert that something went wrong with your trading rules or constraints. 

Each notification includes a unique ID, a detailed error message that's easy to understand, and the full error object, complete with a stack trace to help pinpoint the exact location of the problem. 

The `backtest` flag will always be false because these errors are related to the live environment, not the simulated backtest itself.

## Interface ValidateArgs

This interface, `ValidateArgs`, helps ensure your backtest kit configuration is correct and uses valid names for different components. Think of it as a blueprint for how to check that the names you're using for exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweeps are all recognized and supported by the system. Each property within `ValidateArgs` represents a specific part of your backtest setup and uses a generic type `T`, which is meant to be an enum defining the allowed values for that part. By validating against this interface, you avoid errors and potential problems later on in your backtesting process.

## Interface TrailingTakeCommitNotification

This notification signals that a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it occurred, and whether it happened during a backtest or live trading.

You'll find details about the trading symbol, the strategy that triggered the action, and the exchange where it took place. The notification also gives you the specifics of the trade itself: the entry price, the adjusted take profit and stop-loss prices, and the original prices before any trailing adjustments.

Furthermore, it includes comprehensive data about the position's history, like the number of DCA entries, the number of partial closes, and detailed profit and loss information, including the entry and exit prices used for P&L calculation. A human-readable note can provide context regarding the signal’s reasoning, along with timestamps for when the signal was created, pending, and ultimately executed.

## Interface TrailingTakeCommit

This describes a "trailing take" event within the backtest-kit trading framework. Think of a trailing take as a way to automatically adjust your take profit levels as the price moves in your favor.

This event provides details about the trailing take action, the percentage shift used to adjust the take profit, the current market price when the adjustment happened, and the current profit and loss (PNL) for the trade.

You'll also find information about the trade’s direction (whether it was a long or short position), the initial entry price, and the adjusted take profit and stop-loss prices. It keeps track of the original take profit and stop-loss prices too, showing how much they've been modified.

Finally, timestamps are included to indicate when the signal was created and when the position was activated. Essentially, it's a complete record of a trailing take action, giving you a clear picture of how your strategy's take profit is being dynamically managed.

## Interface TrailingStopCommitNotification

This notification provides detailed information when a trailing stop order is triggered and executed. It's a way to track exactly when and why a trailing stop happened, whether it's during a backtest or a live trade. The notification includes specifics like the trading symbol, the strategy that initiated the signal, and the exchange used.

You'll find key details about the trade itself, such as the entry price, stop-loss and take-profit levels (both original and adjusted for trailing), and the position direction (long or short). It also includes information about any DCA averaging or partial closes that were part of the trade.

Crucially, the notification includes profit and loss data, including the raw P&L numbers and percentages, the prices used for the P&L calculation, and details of the cost basis. Timestamps throughout the notification help precisely pinpoint the timing of events, from the initial signal creation to the final execution. Lastly, there's a field for an optional note that can provide a human-readable explanation for the signal.

## Interface TrailingStopCommit

This describes a trailing stop event, which is a signal generated when a trailing stop-loss mechanism adjusts. 

It tells you exactly what triggered the event – a trailing stop – and provides a lot of detail about the position at the time of adjustment. 

You'll find the current market price, the unrealized profit and loss, and whether the position is a long (buy) or short (sell) trade.

Crucially, it includes both the original take profit and stop loss prices set when the trade was initially entered, as well as the currently effective prices after any trailing adjustments. 

You also get information about when the signal was created and when the position was initially activated.

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all kinds of events happening in your trading system. Think of it as a single container for all the data you need to understand what's going on – whether a trade is being opened, closed, scheduled, or cancelled.

It bundles together key pieces of information like timestamps, the action being performed (like "opened," "closed," or "scheduled"), and relevant details depending on the action. For example, when a position is opened or closed, you’ll have price data (open, take profit, stop loss) and potentially reasons for the closure or cancellation.

If you're dealing with signals, you'll find signal IDs, positions, and notes attached to the event. There are also detailed metrics regarding profits and losses, percentages towards take profit and stop loss, and information about partial closes.  For completed trades, you can see the duration and performance metrics like peak and fall PNL.  Essentially, `TickEvent` aims to give you a complete picture of a trading event, regardless of its type.

## Interface SyncStatisticsModel

The `SyncStatisticsModel` helps you understand how your trading signals are being synchronized across your system. It’s a way to monitor the lifecycle of those signals. 

You’ll find a detailed list of individual synchronization events in the `eventList` property, giving you a complete record.

Beyond that, the model provides summary numbers: the `totalEvents` representing all synchronization actions, and separate counts for signals that are being `open`ed and `close`d. These figures let you quickly assess the overall activity and flow of your signals.


## Interface SyncEvent

This `SyncEvent` holds all the key details about what's happening during a trading signal's lifecycle, designed to be easily understood when generating reports. It bundles information like when the event occurred (`timestamp`), the asset being traded (`symbol`), the strategy in use (`strategyName`), and where it's being traded (`exchangeName`).

You'll also find specifics about the signal itself, including a unique ID (`signalId`), what action was taken (`action`), and the direction of the trade (`position`). For orders, it records entry prices (`priceOpen`), profit and loss targets (`priceTakeProfit`, `priceStopLoss`), and their original values before any adjustments.

Other important data includes when the signal was initially created (`scheduledAt`), when the position was activated (`pendingAt`), details about any DCA averaging (`totalEntries`), how many partial closures occurred (`totalPartials`), the profit and loss so far (`pnl`), and why a signal might have been closed (`closeReason`). Finally, it indicates if the event occurred during a backtest (`backtest`), and provides a creation timestamp (`createdAt`).

## Interface StrategyStatisticsModel

This model holds the statistics gathered during a backtest, giving you a breakdown of different types of strategy actions taken. It includes a detailed list of every event that occurred, allowing for in-depth analysis. You'll also find summaries like the total number of events, and specific counts for actions like canceling orders, closing pending positions, taking partial profits or losses, using trailing stops, setting breakeven points, activating scheduled orders, and executing average-buy orders. Essentially, it provides a comprehensive view of your strategy’s behavior.

## Interface StrategyEvent

This data structure bundles all the key details about what's happening in your trading strategy, whether it's a backtest or live trading. It provides a comprehensive record of actions like opening, closing, or modifying positions. You'll find information such as the exact time of the event, the trading pair involved, the name of the strategy, and the exchange being used. 

The structure also captures critical pricing data, including the current market price, percentages used for profit/loss targets, and details related to trailing stops. If actions are scheduled or pending, you'll see identifiers for tracking them. 

Furthermore, it includes details about the position itself – whether it’s a long (buy) or short (sell) trade – along with entry prices and stop-loss/take-profit levels, both as initially set and as they've been adjusted. For strategies using DCA (Dollar-Cost Averaging), you'll also find data regarding accumulated entries and averaged prices. Finally, P&L information and optional notes are also recorded for a complete picture of each event.

## Interface SignalSyncOpenNotification

This notification lets you know when a pre-planned (limit order) signal has been triggered and a position has been opened. It provides a detailed snapshot of what happened, including a unique ID for tracking and a timestamp marking precisely when the position was initiated. You'll see details like whether it occurred during a backtest or live trading, the trading pair involved (like BTCUSDT), and the name of the strategy that generated the signal.

The notification includes essential financial information such as current price, profit and loss (both absolute and as a percentage), entry and exit prices used for PNL calculation, and the overall cost of opening the position. It also specifies the trade direction (long or short) and the prices for take profit and stop loss, along with their original values before any adjustments. 

Further details are given regarding how the entry price was determined, the number of entries involved in any DCA averaging, and the number of partial closes executed. You’ll also find timestamps indicating when the signal was initially created and when the position actually started. Finally, there's an optional field for a descriptive note to explain the signal's reasoning.

## Interface SignalSyncCloseNotification

This notification lets you know when a pending trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiration, or manual closure. It provides a wealth of information about the closed signal, including a unique identifier, the timestamp of when it closed, and whether it occurred during a backtest or live trading.

You’ll find details about the trade itself, such as the trading pair, the strategy that generated it, and the exchange it was executed on. Crucially, it includes the signal’s identifier, the current market price at the time of closure, and detailed profit and loss (PNL) information, including entry and exit prices, total cost, and percentage gain or loss. 

The notification also gives you the original entry, take profit, and stop loss prices before any adjustments were made, and information about any averaging or partial closures that occurred. Lastly, you’ll see timestamps for when the signal was created, activated, and when this notification was generated, alongside a description explaining why the signal was closed.

## Interface SignalSyncBase

This describes the core information you’ll find in every signal synchronization event used within the backtest-kit framework. Think of it as the foundation for all signal data.

Each signal event includes details like the trading pair symbol—like "BTCUSDT"—the name of the strategy that generated it, and the exchange it was executed on. 

You'll also find information about the timeframe used, which is relevant in backtesting scenarios. 

Crucially, it identifies whether the event originated from a backtest or a live trading session.

A unique identifier, timestamp, and the full signal data itself are also part of this shared base.

## Interface SignalScheduledNotification

This notification type lets you know when a trading signal has been planned for future execution. It's like getting a heads-up that a trade is about to happen, but not right away.

The notification includes a unique identifier, a timestamp indicating when the signal was scheduled, and whether it's part of a backtest or a live trading scenario. You’ll also find the symbol being traded (like BTCUSDT), the strategy responsible for the signal, and the exchange where the trade will occur.

Detailed information about the trade itself is provided: the signal's unique ID, whether it’s a long or short position, the target entry price, take profit levels, and stop-loss prices, including their original values before any adjustments. 

Further details cover DCA (Dollar-Cost Averaging) and partial closing aspects, alongside financial metrics like cost, PnL (profit and loss) data—including unrealized PnL, percentage profit/loss, and price points used in those calculations— and the timestamp of when this scheduled event took place. A human-readable note might explain the signal's logic, and the notification also records when it was created.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened within the backtest or live trading environment. It provides a wealth of information about the trade, including a unique identifier and timestamp of when it happened.

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy that triggered the trade, and the exchange used. It also specifies whether the trade is a long (buy) or short (sell) position, along with the entry price and any take profit or stop-loss levels that were set.

Furthermore, the notification includes information regarding DCA (Dollar-Cost Averaging) entries, partial closes, the cost of the initial trade, profit and loss calculations, and optional notes providing context for the signal's reason. You can also see the creation timestamps of both the signal and the position itself. This comprehensive data lets you track and analyze the performance of your trading strategies in detail.

## Interface SignalOpenContract

This event signals that a pre-planned trade, using a limit order, has been executed. It's triggered either when the market price meets the pre-defined price level during a backtest, or when the exchange confirms the order fill in live trading. 

Think of it as confirmation that your intended trade has actually happened.

The event provides comprehensive details about the trade, including the price at which it was filled (priceOpen), the current market price at the time, the overall profit and loss, and the costs involved. It also includes details about any take profit and stop loss levels, both the original values and the adjusted values if trailing was applied.

You’ll also find information about how the position was built: whether it was a single entry or involved averaging (DCA) and whether any partial closes were executed. Finally, timestamps indicate when the signal was initially created and when the position was activated.

This event is particularly useful for systems that need to track and reconcile trades, like external order management systems or audit logging pipelines.

## Interface SignalInfoNotification

This notification type is used when a trading strategy wants to communicate informational notes about an open position. It's a way for strategies to provide extra context or explanations about what’s happening, beyond just the trade execution itself.

Each notification includes details like a unique ID, the timestamp it was created, whether it originated from a backtest or live trading, and the symbol being traded. You’ll also find information about the strategy that generated it, the exchange used, and specifics about the position – including entry price, take profit, stop loss levels (both original and adjusted for trailing), the number of entries (for strategies using dollar-cost averaging), and any partial closures.

Importantly, it also includes PnL data, showing the profit or loss, both in absolute and percentage terms, along with the prices used in those calculations. The key piece is the 'note' field, which is where the strategy's custom message is displayed. Additional identifiers like `notificationId`, `scheduledAt`, `pendingAt`, and `createdAt` help with tracking and correlation across different systems.

## Interface SignalInfoContract

This defines how information signals are communicated within the backtest-kit framework. When a trading strategy wants to send out custom messages about a position, such as annotations or debugging information, it uses this structure. The signal includes details like the trading pair's symbol, the strategy's name, the exchange being used, and the timeframe.

You’ll also get the full signal data, the current price at the time, a custom note from the strategy, and an optional ID to link the signal to other systems.  Finally, it specifies whether the signal originated from a backtest (historical data) or live trading. This information is delivered to listeners who are registered to receive signal notifications.

## Interface SignalData$1

This data structure holds all the key information about a single, completed trading signal. Think of it as a snapshot of a trade – it tells you which strategy created it, a unique ID for tracking, and what asset was traded (like BTC/USDT). 

It also includes details about whether the trade was a long or short position, the percentage profit or loss (PNL), and the reason the trade was closed. Finally, timestamps indicate precisely when the signal was initiated and when it concluded, providing a complete timeline of the trade's lifecycle.

## Interface SignalCommitBase

This interface defines the essential information included in every signal commit event. It tells you what symbol is being traded, which strategy generated the signal, and on which exchange the action took place. The timeframe used is also specified, which is relevant during backtesting but absent in live trading. 

You'll also find details about whether the signal came from a backtest or live environment, a unique identifier for the signal, and the timestamp of the event.

Crucially, it includes the total number of entries and partial closes that were executed, along with the original entry price – this helps you understand how a position has evolved. Finally, an optional note field lets you add a human-readable explanation for the signal.


## Interface SignalClosedNotification

This notification provides detailed information when a trading position is closed, whether it's due to a take profit, stop loss, or other reason. It’s like a report card for each closed trade, offering a wealth of data to analyze performance. You’ll find specifics like the unique identifier for the signal, the exact timestamps of creation and closure, and whether the trade occurred in backtest or live mode. 

The notification breaks down the details of the trade itself, including the entry and exit prices, original take profit and stop loss levels, and how many DCA entries were involved. Crucially, it also provides the profit and loss figures, both as a percentage and in absolute USD terms, along with the prices used for PNL calculation. You’ll also see the duration of the position and a custom note, if provided, to explain the reason for closure. Finally, it includes timestamps for signal creation and when the position went pending.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a profit target, a stop-loss, expiring, or a manual action. It's designed to help systems outside of the core trading framework stay in sync.

You'll receive details about the closing price, the overall profit or loss for the trade, and the direction of the trade (long or short). 

The event also provides information like the original take profit and stop-loss prices (before any adjustments), the initial entry price, and when the signal was created and activated. If you were using dollar-cost averaging (DCA) or partial closes, you’ll also see how many entries and partials were involved. Finally, a `closeReason` tells you specifically why the signal was closed.

## Interface SignalCancelledNotification

This notification lets you know a signal was cancelled before it could be activated. It provides a lot of detail about the cancelled signal, including when it was scheduled, why it was cancelled (like a timeout or user intervention), and the trade parameters like entry price, stop loss, and take profit levels. You'll find information like the strategy name, exchange, and a unique identifier for the signal itself.

The notification also contains historical information regarding the signal’s pricing and quantity including entries and partials. 

It also includes data related to the signal’s lifecycle such as scheduledAt, pendingAt, and duration. Finally, optional fields like a note offer a place to add additional context.

## Interface Signal

The `Signal` object represents a trading signal, providing details about a position's entry and partial exits. 

It tracks the opening price of the trade with the `priceOpen` property.

The `_entry` array stores information on each entry point within a position, including the price, cost, and timestamp of the entry.

Similarly, `_partial` holds data on any partial profit or loss exits, including the exit type (profit or loss), percentage, price, cost basis at the time of exit, the entry count at that time, and the exit timestamp. 


## Interface Signal$2

This `Signal` object holds information about a trading signal, primarily related to its entry and potential partial exits. 

The `priceOpen` property simply tells you the price at which the position was initially opened.

Inside, you’ll find arrays to track events.  `_entry` stores details about each time a position was started – including the price, associated costs, and the exact timestamp.  Similarly, `_partial` records any partial exits from the position, outlining whether they were profits or losses, the percentage impact, the price at the time of exit, the cost basis at that point, and how many original units were closed, all with their respective timestamps.

## Interface Signal$1

The `Signal` object represents a trading signal and holds important information about a position. It includes the entry price, known as `priceOpen`, which is the price at which the position was initially established.

The `_entry` property is an array that tracks the details of each entry made within the position, containing information like the price, total cost, and the time of the entry.

Additionally, the `_partial` property keeps a record of any partial exits taken during the position's lifecycle. Each entry in this array describes a partial exit, noting its type (profit or loss), percentage, current price, cost basis at the time of the exit, the number of units sold, and the timestamp.

## Interface ScheduledEvent

This data structure holds all the details about trading events – whether they were scheduled, opened, or cancelled. 

Each event will have a timestamp, the type of action taken (opened, scheduled, or cancelled), and information about the trading pair involved, its unique signal ID, and the position type. 

You'll find details like the entry price, take profit and stop-loss levels, along with any modifications made to those prices. It also includes data around partial closes, total entries, and the unrealized profit and loss (PNL) at the time of the event. 

For cancelled events, you'll see the reason for cancellation and a unique ID if the cancellation was user-initiated. Other useful information includes when the position became active and when the signal was initially scheduled.

## Interface ScheduleStatisticsModel

This model gives you a clear view of how your scheduled trading signals are performing. 

It collects data on every scheduled signal, tracking how many were scheduled, how many were activated, and how many were cancelled. 

You'll find a detailed list of each event, alongside key statistics like the total number of signals in each category. 

Important ratios, like cancellation and activation rates, allow you to quickly assess the efficiency of your scheduling strategy – a lower cancellation rate and a higher activation rate are generally desirable. 

Finally, average wait times for both cancelled and activated signals offer insights into the responsiveness of your system.

## Interface SchedulePingContract

This interface, `SchedulePingContract`, represents a recurring event that happens while a scheduled trading signal is active but not yet fully executed or cancelled. Think of it as a heartbeat, indicating that the system is still monitoring the signal.

These pings occur roughly every minute and provide valuable data about the signal, including the trading pair (symbol), the strategy involved, the exchange being used, and all the details of the signal itself.  You also get the current market price at the time of the ping, which is helpful for building custom monitoring logic – perhaps you want to automatically cancel a signal if the price moves significantly.

Finally, a flag tells you whether the ping is happening during a backtest (using historical data) or a live trading session.  A timestamp is included with each ping to indicate precisely when the event happened, with slightly different meanings depending on whether it's a live or backtest execution. You can listen for these pings to build your own custom controls over the automated trading process.

## Interface RiskStatisticsModel

This model holds the results of risk rejection events, helping you understand where your risk controls are being triggered. 

It contains a list of all the individual rejection events, providing detailed information about each one. 

You'll also find the total number of rejections, a breakdown of rejections organized by the trading symbol, and a breakdown grouped by the trading strategy employed. This allows for targeted analysis and adjustments to your risk management setup.


## Interface RiskRejectionNotification

This notification alerts you when a trading signal is blocked because of risk management rules. It’s a way to understand why a signal didn't make it to execution.

Each notification has a unique ID, a timestamp, and indicates whether it came from a backtest or a live trading environment. You’ll find details like the trading symbol, the name of the strategy involved, and the exchange where the rejection happened.

The most valuable part is the `rejectionNote`, which provides a clear explanation of why the signal was rejected. The notification also gives you context, including the number of open positions, the current market price, and optional details about the signal itself like its direction (long or short), entry price, take profit/stop loss levels, and any notes associated with the signal. Finally, there's a creation timestamp for when the notification was generated.

## Interface RiskEvent

The `RiskEvent` object provides detailed information about situations where trading signals were blocked due to risk management rules. Think of it as a report card for rejected trade ideas. Each event includes the exact time it happened, the trading pair involved, and the specifics of the signal that was rejected. You’ll also find the name of the strategy and the exchange used, along with the price at the time and how many positions were already open.

A unique ID identifies each rejection, and a note explains why the signal didn't proceed. Finally, a flag indicates whether the event occurred during a backtest or in live trading. 

This object is incredibly useful for understanding and debugging risk-related issues within your trading system.


## Interface RiskContract

This interface, RiskContract, is designed to keep you informed about when your trading signals are being rejected due to risk management checks. Think of it as a notification when a strategy tries to execute a trade, but the system says, "Hold on, that exceeds our risk limits."

It provides a detailed record of each rejection, including the trading symbol (like BTCUSDT), the specifics of the signal itself (position size, prices), and the name of the strategy that generated it.  You'll also find the timeframe used, the exchange involved, and the current market price at the time of the rejection.

Key details like the number of existing open positions and a unique ID for tracking help you understand the context of the rejection.  Most importantly, a human-readable explanation of *why* the signal was rejected is included, which can be invaluable for refining your risk rules. A timestamp and indicator of whether the event happened during a backtest or live trading are also provided.

This information is primarily intended for risk reporting and for custom user alerts or monitoring systems that need to react to risk-related events.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you monitor the progress of a background task, specifically when backtest-kit is running a set of trading strategies. It provides details about what's happening under the hood, like the name of the walker, exchange, and frame being used. You’ll see the trading symbol involved (like BTCUSDT), and get a count of the total strategies being evaluated and how many have already been processed. Most importantly, it shows you the completion percentage, giving you a clear picture of how close the process is to finishing. This lets you understand how long the process will take and identify potential issues along the way.

## Interface ProgressBacktestContract

This contract provides a way to monitor the progress of a backtest as it runs. You'll receive updates containing key information like the exchange and strategy being used, the trading symbol involved, and the overall scope of the backtest (total frames).  It tells you how many data points have already been analyzed and what percentage of the backtest is complete. Think of it as a real-time report card on how the backtest is advancing.  Each update includes the exchange name, strategy name, symbol, total frames, processed frames, and a percentage representing how far along the backtest is.

## Interface PerformanceStatisticsModel

This model holds a collection of performance statistics related to a specific trading strategy. It tells you the name of the strategy being evaluated.

You can see the total number of performance events recorded and the overall time it took to gather those statistics. The `metricStats` property organizes the statistics by the type of metric being measured. Finally, the `events` array gives you access to all the individual performance data points captured during the backtest.

## Interface PerformanceContract

This interface, `PerformanceContract`, helps you keep tabs on how your trading strategies are performing. It's like a digital stopwatch, recording key moments during execution. 

Each recorded event includes details like when it happened (both the current time and the previous one), what operation was being done, how long it took, and which strategy, exchange, and trading symbol are involved. You'll also find whether the event occurred during a backtest or in live trading. 

This information is incredibly valuable for pinpointing slowdowns and areas for optimization in your trading system – essentially, a way to make your strategies run smoother and more efficiently.

## Interface PartialStatisticsModel

This model holds data about partial profit and loss events during a backtest. Think of it as a record of how your trading strategy performed at specific milestones.

You'll find a list of all the individual profit and loss events, along with their details, in the `eventList` property. 

The `totalEvents` property tells you the overall number of events that occurred. 

To understand the net result, you can look at `totalProfit` to see how many events resulted in a profit and `totalLoss` to see how many resulted in a loss.

## Interface PartialProfitContract

The `PartialProfitContract` represents a notification that a trading strategy has reached a predefined profit level, like 10%, 20%, or 30% profit. This is a key piece of information for tracking how well a strategy is performing and for managing partial take-profit orders. 

Each notification contains details about the trade, including the symbol being traded, the name of the strategy executing it, the exchange and frame used, and the exact price at which the profit level was hit. You’ll also find the initial data from the signal that triggered the trade, the percentage of profit achieved (the 'level'), and whether the event occurred during a backtest or live trading. This data helps you understand the profit progression of the trade and provides a way to monitor strategy behavior. Events are designed to prevent duplicates even if multiple levels are hit within a single tick, and these events are essential for generating reports and enabling custom callbacks.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken, letting you know a portion of a trade has been closed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading.

You'll find details about the specific symbol traded (like BTCUSDT), the strategy that generated the signal, and the exchange used. It also breaks down the specifics of the position – whether it was a long or short trade, the entry price, and the take profit and stop-loss levels, both as they were initially set and after any trailing adjustments.

The notification also gives you a complete picture of the position's history, including the number of DCA entries and partial closes. It includes detailed profit and loss (PNL) information, expressed both numerically and as a percentage, and the prices used for that calculation. Finally, the notification includes the reason for the signal and the timestamps associated with its creation and activation.


## Interface PartialProfitCommit

This describes a partial profit-taking event within a trading strategy. When a strategy decides to close a portion of its position, this object captures all the relevant details. It tells you that a partial profit action occurred, how much of the position was closed (as a percentage), and the current market price at the time of that action. 

You'll also find information about the position's profit and loss, whether it was a long or short trade, and the original entry price. 

It also includes the take profit and stop loss prices, both as they currently exist (after any trailing adjustments) and their original values before any adjustments. Finally, timestamps indicate when the signal for this action was created and when the position initially went active.

## Interface PartialProfitAvailableNotification

This notification lets you know when your trading strategy has hit a specific profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress and understand how your strategy is performing, whether you're backtesting historical data or running it live.

The notification includes details like a unique ID, the exact time the milestone was reached, and whether it’s from a backtest or a live trade. You'll see information about the trading pair (symbol), the strategy that generated the signal, and the exchange it's executing on.

It provides a comprehensive snapshot of the trade's performance at that moment, including the current price, entry price, trade direction (long or short), and both the original and adjusted stop-loss and take-profit prices, accounting for any trailing adjustments.

You'll also get insights into the trade's financial details, such as the profit and loss in USD and as a percentage, the total capital invested, the number of DCA entries (if any), and a possible note describing the reason for the signal. Finally, it captures timestamps related to the signal's creation, pending status, and the creation of the notification itself.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. These notifications, or events, are triggered when a strategy's losses reach these milestones.

You'll see these events to understand how a strategy is performing, particularly its drawdown, and to track when partial stop-loss orders might be executed. Each event includes important details like the trading symbol, the strategy's name, the exchange used, and the current price at the time the loss level was reached.

The `level` property tells you exactly which loss level was triggered; for example, `level: 20` means a 20% loss from the original entry price. Events are generated only once for each loss level and signal, even if the price moves dramatically. You can use these events to build reports or trigger custom actions based on a strategy's performance. The `backtest` flag clarifies whether the event originated from a historical backtest or a live trading session. Finally, the `timestamp` provides a record of when this loss level was detected.

## Interface PartialLossCommitNotification

This notification tells you when a partial position has been closed, giving you detailed information about the trade. It’s like a report card for a specific portion of your trade, letting you see exactly what happened and why.

You'll find a unique ID and timestamp for each partial closure, along with whether it happened during a backtest or a live trade. Key details like the trading symbol, strategy name, and the exchange used are also included. 

The notification breaks down the specifics of the position: the percentage closed, current market price, entry price, and original take profit and stop loss levels. You’ll also see information about any averaging done (DCA) and any partial closures already executed.

Crucially, the notification provides P&L information, showing the profit or loss generated by this specific partial closure, including the entry and exit prices used for the calculation. A helpful note field may provide extra context or reasoning behind the trade. Finally, timestamps detailing signal creation, pending status, and notification creation complete the picture.

## Interface PartialLossCommit

This structure represents a partial loss event within the backtest kit. It essentially details a situation where a portion of a trading position is being closed out.

You'll find key information here like the `action`, confirming it’s a “partial-loss” event. The `percentToClose` tells you what percentage of the position is being reduced.

Crucially, the structure provides details about the trade itself including the `currentPrice`, the `position` direction (long or short), and the original and adjusted `priceOpen`, `priceTakeProfit`, and `priceStopLoss` values. It also includes the unrealized profit and loss (`pnl`) at the time of this event, alongside timestamps indicating when the signal and position were activated (`scheduledAt` and `pendingAt` respectively).

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy has hit a predefined loss level, like -10%, -20%, or -30%. It's a signal that your position is experiencing a specific level of loss.

Each notification provides a lot of detail about the trade, including a unique ID, the exact time it happened, and whether it's happening during a backtest or a live trade. You’ll find information about the trading pair, the strategy used, the exchange involved, and a unique identifier for the signal itself.

The notification also includes specifics about the trade's setup, such as the entry price, trade direction (long or short), take profit and stop-loss prices (both original and adjusted for trailing), and the number of DCA entries made. It details performance metrics too, like the unrealized P&L, profit/loss percentage, and the total capital invested. Finally, it includes optional notes explaining the reasoning behind the signal, as well as timestamps related to signal creation, pending status, and the overall lifecycle of the trade.

## Interface PartialEvent

This data structure, called `PartialEvent`, holds all the key information about profit and loss milestones during a trade. Think of it as a snapshot of important events as a trade reaches different profit or loss levels (like 10%, 20%, etc.).

It includes details like the exact time of the event, whether it was a profit or loss, the trading pair involved, the strategy used, and the signal that triggered the trade. You’ll also find information about the entry price, take profit levels, stop-loss levels, and how many partial closes were executed.

For strategies using Dollar-Cost Averaging (DCA), it tracks the total number of entries and the original entry price before averaging. There’s also a section to record unrealized profit and loss (PNL), a human-readable explanation for the signal, and timestamps indicating when the position became active and when the signal was initially created. Finally, a flag indicates if this data is from a backtest or a live trading scenario.

## Interface MetricStats

This object holds a collection of statistics related to a particular type of performance measurement. Think of it as a report card for how long something takes to complete.

It includes details like the total number of times that measurement was taken, the overall time spent, and various calculations to describe the distribution of that time - including the average, minimum, maximum, and standard deviation. 

You'll also find percentiles like the 95th and 99th, which show how long the process took 95% and 99% of the time, respectively.

Finally, it also provides insights into wait times between events, detailing the minimum, maximum, and average durations between those occurrences.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversation, like you'd see in a chat history with an AI. Each message has a `role` indicating who sent it – whether it's a system instruction, your input, the AI's response, or even the result of a tool the AI used. The main part of the message is its `content`, which is the text of what's being said.

Sometimes, the AI will show its reasoning process, and that’s captured in the `reasoning_content` property.  If the AI used a tool, `tool_calls` will list the details of those calls. You can also attach images to a message, and these can be provided as blobs, raw bytes, or base64 encoded strings. Finally, if the message is a response to a specific tool call, the `tool_call_id` property identifies which call it relates to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading backtest. 

It tracks individual drawdown events, storing them in a list called `eventList`, where the most recent events appear first.  You’ll find the total count of all recorded drawdown events in the `totalEvents` property. Essentially, it allows you to examine the specific drawdown occurrences and understand the overall number of times the strategy experienced significant losses.


## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown event that occurred during a trading simulation or live trade. It captures key details like when the drawdown happened (recorded as a Unix timestamp), the trading pair involved, and the name of the strategy that generated the trade. You'll also find information about the direction of the trade (long or short), the unrealized profit and loss at that point, and the price levels influencing the drawdown. Furthermore, it includes details like the entry price, take profit level, and stop loss price, alongside a flag indicating if this event occurred during a backtest. Essentially, it provides a snapshot of the conditions surrounding a significant drawdown event.

## Interface MaxDrawdownContract

This structure represents updates about maximum drawdown, which helps track the largest loss experienced by a trading position. 

It provides key details like the trading symbol, the current price, and the exact time of the update. You'll also find the strategy name, exchange, and timeframe involved, along with the signal data that triggered the position. 

A crucial flag indicates whether the update comes from a backtest simulation or live trading.

These drawdown events are valuable for managing risk and adjusting trading strategies as they signal significant declines in position value.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed view of your live trading performance, offering key metrics to assess how your strategies are doing. It keeps track of every event, from idle periods to opened, active, and closed trades, giving you a full history to analyze.

You can quickly see the total number of events and the number of winning and losing trades. The model calculates important ratios like the win rate, average profit per trade, and total profit. To help understand risk, it also provides the standard deviation and Sharpe Ratio, which gauges risk-adjusted returns, both in regular and annualized form.  

Beyond basic profitability, you'll find metrics like the Certainty Ratio, Expected Yearly Returns, average peak PNL and average fall PNL, each offering a different perspective on performance and potential. Keep in mind that any metric showing as "null" means the calculation wasn’t safe due to potentially unreliable data.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes, but aren't critical enough to stop everything. Each notification has a specific type to easily identify it as an informational error. 

You'll find a unique ID for each error, along with detailed information about the error itself, including a helpful message to understand what went wrong and a stack trace for debugging.  The `backtest` property will always be false, as these notifications originate from the live trading environment, not a simulation.

## Interface IdlePingContract

The IdlePingContract represents an event that occurs when a trading strategy isn't actively responding to any signals. 

This event happens periodically when a strategy is in a passive, "idle" state.

The event provides valuable information, including the trading symbol, the strategy’s name, the exchange being used, and the current market price at the time the event occurred.

You can also determine whether the event is coming from a live trading environment or a historical backtest.

The timestamp associated with the event will either be the precise time of the event in live mode or the timestamp of the candle being processed in backtest mode. 

This information allows users to monitor and understand the lifecycle of their strategies, even when they aren't actively trading.

## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest comparison. It holds key details about the strategy itself, like its name.

More importantly, it contains the statistical results from the backtest, allowing you to evaluate its performance.

You'll also find a metric value that's used for directly comparing strategies against each other and a rank indicating its position relative to the other strategies in the comparison.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up and run comparisons between different trading strategies, letting you test them against each other systematically. Think of it as a blueprint for a controlled experiment in trading.

Each walker (comparison) needs a unique name so the system can identify it.  You can also add a note to explain what the walker is meant to do.

It specifies which exchange and timeframe will be used for all strategies in the comparison.  A list of strategy names is also required, these strategies must already be registered within the system.

You can choose which metric to optimize, such as Sharpe Ratio, to see which strategy performs best according to that specific measure.  Finally, you can provide optional callbacks to be triggered at various stages of the walker's lifecycle.


## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered when a trading strategy is tested across a range of historical data. It essentially represents the final outcome of a complete backtesting run.

This object includes details like the specific trading symbol that was evaluated, the exchange the data came from, and the name of the strategy (walker) used for testing. You'll also find the name of the timeframe (e.g., 1-minute, daily) used in the backtest. Think of it as a container for everything you need to know about a single backtesting execution.


## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest-kit's strategy testing process, giving you a chance to observe what's happening. You can use it to track the start of each strategy test, get notified when a strategy finishes (successfully or with an error), and see the final results once all strategies are done. Think of it as a way to get updates on the progress and outcome of your backtesting runs.

Here's a breakdown of what each callback does:

*   `onStrategyStart`: Called just as a specific strategy begins its backtest.
*   `onStrategyComplete`:  Triggered after a strategy backtest finishes, providing statistics and a performance metric.
*   `onStrategyError`:  Notified when a strategy encounters an error during the testing process.
*   `onComplete`:  Called once all strategies have been tested, giving you access to the overall results.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing stops and price commitments. It essentially represents an instruction to execute a "trailing-take" action.

You'll find details about the action type, the percentage shift to apply, and the price level that triggered the trailing stop. This helps you understand precisely what price movement caused the action and how much the price will shift as a consequence.


## Interface ITrailingStopCommitRow

This interface represents a single action queued for execution related to a trailing stop order. Think of it as a record of a specific change to be made concerning a trailing stop. 

It includes information about the type of action being taken ("trailing-stop"), the percentage shift that needs to be applied, and the price at which the trailing stop was initially established. These details help the backtest engine accurately replicate the trailing stop behavior during the simulation.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` represents a situation where a trading signal is set up and actively awaiting the price to reach a specific entry point. It's a recurring notification you'll receive as the system monitors the price.

This result provides details about the signal, including the current price being monitored, the trading pair, the strategy and exchange involved, and the timeframe used.

You'll also find information about potential profit and loss calculations based on the theoretical position, and whether this is part of a backtest or live trading scenario. Essentially, it's a snapshot of the signal’s status while it's waiting for activation. The take profit and stop loss percentages are always zero in this waiting state.

## Interface IStrategyTickResultScheduled

This interface describes a specific event that occurs within a trading strategy when a signal is generated but isn't immediately executed. It signifies that the strategy has identified a potential trade opportunity ("scheduled") and is waiting for the price to reach a predetermined entry point. The event provides key information about the signal, including the strategy and exchange names, trading symbol, the price at the time of scheduling, and whether the process is happening in backtest or live mode. This allows you to track and analyze the conditions that lead to these "waiting" signals as part of your overall trading strategy evaluation. You'll find details about the signal itself, like its public row data, alongside important identifiers such as the timeframe and strategy name.

## Interface IStrategyTickResultOpened

This data represents a new trading signal being created. It's a notification you'll receive when a signal is successfully generated and saved. 

You'll find details about the signal itself, including its unique ID, along with information about where and when it was created. 

The information includes the strategy and exchange that generated the signal, the trading symbol involved, the current price, and whether this event originates from a backtest or live trading environment. A timestamp marks precisely when the notification was generated, linking it to either the candle's timestamp (in backtests) or the real-time execution moment (in live trading).

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy isn't actively making decisions – it's in an "idle" state. It provides information about the context of this idle period, like the strategy’s name, the exchange being used, the timeframe being analyzed, and the trading symbol. You’ll also see the current price at that moment, whether the strategy is running in backtest or live mode, and a timestamp indicating when the idle event occurred. Essentially, it's a record that shows things were quiet for a bit, and gives you the necessary details to understand the situation.


## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing a complete picture of the event. It includes details like the reason for closing – whether it was due to a time limit, a profit or loss target being hit, or a manual closure.

You’ll find information about the signal itself, the price at the time of the close, and crucial profit/loss calculations, including considerations for fees and slippage. This also captures identifying information, like the strategy and exchange names, the timeframe used, and whether the event occurred during a backtest or in live trading. Finally, a unique ID identifies user-initiated closures.  The timestamp of the result's creation is also stored, linked to the candle's timestamp during backtesting or the execution context in live mode.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, describes what happens when a scheduled trading signal is cancelled – meaning it didn't lead to a trade being opened. This could be because the signal conditions weren’t met or a stop-loss was triggered before the signal could activate.

It includes details about the cancelled signal itself (`signal`), the current price at the time of cancellation (`currentPrice`), and the exact timestamp (`closeTimestamp`) when this cancellation occurred.  You’ll also find information about which strategy, exchange, time frame, and trading pair were involved (`strategyName`, `exchangeName`, `frameName`, `symbol`).

A flag, `backtest`, tells you whether the event happened during a backtest or a live trading session. The `reason` property explains *why* the signal was cancelled.  There’s also an optional `cancelId` that’s used when a user specifically cancels a scheduled signal via the API. Finally, `createdAt` provides a record of when the tick result itself was generated.

## Interface IStrategyTickResultActive

This data represents a trading situation where a strategy is actively monitoring a signal and waiting for a specific event like a take profit, stop loss, or time expiration. It holds key information about the current trade, including the signal being tracked, the current price used for monitoring, and the strategy and exchange involved. You'll also find details like the symbol being traded, progress towards take profit and stop loss, and the unrealized profit and loss (pnl) for the position. The record also indicates whether the data originates from a backtest or live trading environment, along with timestamps showing when the data was created and the last candle processed.

## Interface IStrategySchema

This interface describes the blueprint for a trading strategy that you register with the backtest-kit framework. It's essentially a way to define how your strategy makes trading decisions. 

Each strategy needs a unique name to identify it. You can also add a note for yourself or other developers to explain the strategy's logic. 

The `getSignal` function is the heart of your strategy; it's the code that determines when and how to trade, taking into account the current price and time. It returns a signal if a trade should be made, or nothing if no action is required.  You can even create "scheduled" signals, which wait for the price to reach a specific level.

There's also a way to define callbacks for specific events like when a trade opens or closes. You can associate risk profiles with your strategy to manage risk effectively, potentially using multiple profiles for more complex situations. Finally, you can attach action identifiers to your strategy for specific actions to be performed.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the information needed to compare the performance of different trading strategies. It essentially bundles together a strategy's name, a detailed set of statistics about its backtest results, and the value of the metric used to rank its performance.  You'll also find timestamps representing when the strategy first and last generated trading signals. This is helpful for understanding the period over which the strategy was active. Think of it as a single record representing one strategy's backtest run, ready for comparison and analysis.


## Interface IStrategyPnL

This interface defines the result of a profit and loss (P&L) calculation for a trading strategy. It breaks down how your strategy performed, taking into account typical trading costs.

The `pnlPercentage` tells you the overall percentage gain or loss – a positive number means profit, and a negative number means loss.

The `priceOpen` and `priceClose` values show the prices used for entering and exiting positions, but importantly, these prices have already been adjusted to reflect fees and slippage, giving you a more realistic view of your performance.

You'll also find `pnlCost`, which represents the total actual profit or loss in dollars, calculated from your invested capital (`pnlEntries`). Essentially, it’s the raw dollar amount you gained or lost.

## Interface IStrategyCallbacks

This interface lets you hook into key events within your trading strategy, allowing you to build custom logic around signal lifecycle. You can receive notifications when a new signal is opened, when a signal becomes active and is being monitored, or when a signal goes idle because no active positions exist. 

The framework also provides callbacks for when a signal is closed, scheduled for later entry, or cancelled entirely. You’ll get notified when a scheduled signal is created or pinged at regular intervals. 

Furthermore, you can receive events for partial profits or losses, when a signal reaches breakeven, and when data is written to persistent storage for testing purposes. There are also periodic ping callbacks for active and scheduled signals, enabling custom monitoring and adjustments. These callbacks offer a flexible way to tailor your strategy's behavior to specific situations.

## Interface IStrategy

The `IStrategy` interface outlines the core methods for a trading strategy within the backtest-kit framework. It allows a strategy to react to market ticks, manage pending signals (both scheduled and immediate), and track its performance.

Here's a breakdown of what these methods do:

*   **`tick`**: This is the heart of the strategy—it's called on each market tick to monitor for potential signals and trade adjustments.
*   **`getPendingSignal` & `getScheduledSignal`**:  These functions look for active signals, which might trigger trade entries or adjustments to stop-loss/take-profit levels.
*   **`getBreakeven`**: This checks if a position has reached a point where it can cover its costs and become profitable.
*   **`getStopped`**: Determines if the strategy should continue processing ticks.
*   **`getTotalPercentClosed` & `getTotalCostClosed`**: These provide insights into how much of the initial position has been closed, factoring in partial profits or losses.
*   **`getPositionEffectivePrice`, `getPositionInvestedCount`, `getPositionInvestedCost`, `getPositionPnlPercent`, `getPositionPnlCost`**: These methods all provide details about the current position – entry price, investment count, costs, potential profits, and losses.
*   **`getPositionEntries`, `getPositionPartials`**:  These provide the history of how the position was built and partially closed.
*   **`backtest`**: This allows you to test your strategy against historical market data.
*   **`stopStrategy`**: Allows you to halt a strategy from generating new signals, but keeps existing positions open.
*   **`cancelScheduled` & `activateScheduled`**:  These functions give you control over pre-planned trades—either removing or immediately triggering them.
*   **`closePending`**:  Allows you to close a currently active trade.
*   **`partialProfit` & `partialLoss`**: Lets you close a portion of your position based on profit or loss targets.  `validatePartialProfit` and `validatePartialLoss`  are checks to see if these actions are valid before executing.
*   **`trailingStop` & `validateTrailingStop`**:  Adjusts the stop-loss based on price movement.
*   **`trailingTake` & `validateTrailingTake`**:  Similar to trailing stop, it dynamically adjusts the take-profit level.
*   **`breakeven` & `validateBreakeven`**:  Moves the stop-loss to break-even point.
*   **`averageBuy` & `validateAverageBuy`**:  Adds to your position when the price has moved against you.
*   **`hasPendingSignal` & `hasScheduledSignal`**: Simple checks to see if there are pending or scheduled signals.
*   **Several `get...Minutes` methods**: These methods track the duration of various stages of the trading process.
*   **`dispose`**: Releases any resources held by the strategy.

Essentially, this interface defines how a strategy interacts with the backtest-kit system, allowing for automated trading, risk management, and performance analysis.

## Interface IStorageUtils

This interface defines the essential functions that any storage adapter used within the backtest-kit framework must provide. Think of it as a blueprint for how your storage system communicates with the backtesting engine.

It outlines methods for reacting to different signal events like when a trade is opened, closed, scheduled, or cancelled.  These functions allow your storage to record and track the state of each trade as it progresses through the backtest.

You can also use these functions to retrieve specific trades by their ID, or get a complete list of all stored trades.

Finally, the adapter needs to handle special “ping” events to keep track of signal activity. One ping type is for trades that are actively open, while another is for those that are scheduled, allowing for updates to signal information.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for future execution within the backtest-kit framework. It's a simple way to track signals that aren't happening immediately but are planned for a specific time. 

The `status` property is always "scheduled," confirming the signal's intended timing. This helps in organizing and managing signals based on when they should be triggered.


## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, indicating it's active and potentially being used for trading. It's a simple way to track the state of a signal. The key piece of information is the `status` property, which will always be set to "opened" when a signal is in this state. Think of it as confirming that a trading signal is live and ready to be acted upon.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed and finalized. It holds specific information about the signal's closed state and its resulting profit and loss. 

Essentially, if a signal is marked as "closed," this interface is used to store details about its performance, including the calculated profit and loss (pnl).  You'll find the `status` will always be "closed" for these records, and it includes the `pnl` data reflecting the financial outcome of the trade.

## Interface IStorageSignalRowCancelled

This interface defines the structure for a storage signal row when its status is marked as "cancelled." It's essentially a way to represent signals that have been invalidated or removed. 

The `status` property is the key here, and it’s always set to the string "cancelled", clearly indicating the signal’s current state.

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signal data, regardless of its specific status. It ensures that every signal has a record of when it was created and last updated, using timestamps derived from the strategy's tick results. Each signal also gets a priority value, useful for controlling the order in which signals are processed, and this priority is set to the current time. This provides a consistent foundation for managing signals within the backtest-kit framework.

## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size your trades using the Kelly Criterion, a strategy that aims to maximize long-term growth. It requires you to specify that you're using the "kelly-criterion" method.  You also need to provide a `kellyMultiplier`, which controls how aggressively you apply the Kelly formula. A smaller multiplier, like the default of 0.25, represents a more conservative approach, while larger numbers increase risk but potentially higher returns.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. You specify that percentage, known as the `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on a single trade. The `method` property is simply set to "fixed-percentage" to identify this particular sizing approach. This method provides a straightforward way to consistently size trades based on a predefined risk level.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, or sizingName. 

You can also add a note to document the sizing configuration. 

To manage risk, you'll set limits on position size using maxPositionPercentage, which represents the percentage of your account to use. You can also specify absolute minimum and maximum position sizes with minPositionSize and maxPositionSize respectively. 

Finally, callbacks can be used to hook into different stages of the sizing process, allowing for more customized behavior.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR), a common volatility indicator. 

It's specifically designed for strategies that adapt position size to market volatility.

The `method` property is fixed and indicates that this is an ATR-based sizing approach.

You'll specify `riskPercentage` to set the maximum percentage of your capital you're willing to risk on each trade, typically a value between 0 and 100. 

The `atrMultiplier` controls how the ATR value is used to determine the stop-loss distance, allowing you to fine-tune the sizing based on volatility. A higher multiplier means wider stops and potentially smaller positions.


## Interface ISizingParamsKelly

This interface defines the parameters needed for sizing trades using the Kelly Criterion within the backtest-kit framework. It's primarily used when setting up how much capital will be allocated to each trade.

The `logger` property is where you provide a logger service. This allows you to track and debug the sizing process, which is useful for understanding how your sizing strategy is behaving during backtesting. It helps you diagnose any unexpected outcomes.


## Interface ISizingParamsFixedPercentage

This interface defines the settings you’ll use when your trading strategy needs to size positions based on a fixed percentage of your available capital. It's primarily used within the `ClientSizing` constructor.  You'll provide a `logger` – essentially a tool for recording and analyzing what your sizing strategy is doing. Think of it as a way to keep track of how much capital is being allocated to trades.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of your capital to allocate to a trade, specifically using Average True Range (ATR) as a guide. It’s all about controlling your risk.

The `logger` property is simply a way to receive messages for debugging purposes, helping you understand what the sizing calculations are doing. Think of it as a tool to troubleshoot.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, you can use the `onCalculate` callback to observe and potentially influence the size of each trade as it's being determined. This function gets called after the size has been calculated, giving you a chance to log the details of the calculation, perform checks to ensure the size is valid, or even make minor adjustments if needed. You'll receive the calculated trade quantity and parameters related to the sizing calculation as input.


## Interface ISizingCalculateParamsKelly

This interface defines the data needed to calculate bet sizes using the Kelly Criterion. 

It specifies that the sizing method will be the Kelly Criterion.

You'll also need to provide your win rate, represented as a number between 0 and 1, and your average win/loss ratio. These values are essential for the Kelly Criterion to determine the optimal fraction of your capital to risk on each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed to calculate trade sizes using a fixed percentage of your capital. 

Essentially, it's how you tell the system to size your trades based on a percentage of your available funds, using a specific price as a stop-loss. 

The `method` property confirms we're using the "fixed-percentage" sizing strategy.  The `priceStopLoss` property represents the price at which you'll want to place a stop-loss order to limit potential losses.

## Interface ISizingCalculateParamsBase

This defines the basic information needed for calculating how much to trade. 

Every sizing calculation, whether it's for initial positions or adjustments, needs to know the trading symbol – like "BTCUSDT" – to identify the asset being traded. It also requires the current account balance to understand how much capital is available. Finally, the intended entry price is crucial for determining appropriate position size.

## Interface ISizingCalculateParamsATR

This defines the settings used when sizing trades based on the Average True Range (ATR). The `method` property must be set to "atr-based" to indicate that this sizing strategy is being used.  Crucially, you'll also need to provide an `atr` value, which represents the current ATR reading; this number is used to determine the size of each trade.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade. It's a core piece of how the backtest-kit framework executes trading strategies.

The `calculate` property is the heart of this interface – it’s a function that takes a set of parameters describing the risk and market conditions, and then returns the calculated position size. Think of it as the brain determining exactly how many shares or contracts to buy or sell.

## Interface ISignalRow

This describes a `SignalRow` object, which represents a trading signal within the backtest-kit framework. Each signal is given a unique ID for easy tracking. It holds all the details needed to execute and manage a trade, including the price, cost, and the specific strategy and exchange being used.

The signal keeps track of important events like when it was scheduled, when it went pending, and even records partial profit or loss closures.  It also supports DCA (Dollar Cost Averaging) by storing a history of entry prices. 

Advanced features like trailing stop-loss and take-profit prices are also managed within the signal, dynamically adjusting as the trade progresses. Finally, the signal records the best and worst prices seen so far, providing insight into the trade's performance.  A timestamp records when the signal was initially created or retrieved.

## Interface ISignalIntervalDto

This data structure lets you request signals at specific time intervals. It's designed to efficiently retrieve multiple signals with a single request, pausing the process until the defined interval has passed. Each signal received through this mechanism has a unique identifier, which is a standard UUID version 4.

## Interface ISignalDto

This data structure represents a trading signal, the kind you’d get when requesting a signal from the system. Each signal includes details like whether it’s a long (buy) or short (sell) position. You’ll find a human-readable explanation of why the signal was generated in the `note` field.

The signal specifies the entry price, a target price for taking profits (`priceTakeProfit`), and a price at which to automatically exit the position to limit losses (`priceStopLoss`).

You also indicate how long you anticipate the position will remain open, measured in minutes (`minuteEstimatedTime`). A very large number or infinity indicates no time limit.

Finally, there's a field to record the cost associated with entering this trade, and defaults to a system-wide setting if not provided. The system will assign a unique ID to the signal automatically.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that's not immediately acted upon. It's like a signal on hold, waiting for the market price to reach a specific level – the `priceOpen`.

Think of it as a delayed order. Once the price hits that target, the signal transforms into a standard pending order.

It keeps track of when the signal was initially scheduled (`scheduledAt`) and also when it actually started waiting (`pendingAt`), with the latter updating when the price triggers the activation.



The core of this signal is the `priceOpen`, which defines the price level that needs to be reached before the signal becomes active.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal, but with a special addition for when a user decides to cancel it. Think of it as a regular signal, but with extra information specifically for tracking cancellations that were started by you. If a signal is canceled through the user interface or some other user-controlled mechanism, it will include a `cancelId` to uniquely identify that cancellation and a `cancelNote` to record any reasoning behind the cancellation. These details are not present for signals that are handled automatically by the system.

## Interface IRunContext

This interface, `IRunContext`, acts like a central hub of information when your code runs within the backtest-kit framework. Think of it as a package that holds everything a function needs to know about its environment. It brings together details about *how* a trading strategy is routed (like the exchange and strategy names) and information about *when* and *where* it's running (like the specific symbol and timestamp). Ultimately, it streamlines the process by bundling everything together before splitting it into more specialized services.

## Interface IRiskValidationPayload

This structure holds the information needed to assess risk during trading. It builds upon the existing check arguments, adding details about the current trading signal and what's happening in your portfolio. 

Specifically, you'll find the `currentSignal`, representing the signal being evaluated, allowing access to price data. It also includes the `activePositionCount`, which tells you how many positions are currently open, and a full list of `activePositions` to examine. These details are crucial for ensuring your trading remains within defined risk boundaries.

## Interface IRiskValidationFn

This defines the type of function used to check if a trading strategy's risk parameters are acceptable. Think of it as a gatekeeper for your backtesting process. If the function deems the risk levels okay, it simply lets things proceed. However, if something's amiss – perhaps the leverage is too high or the position size is excessive – the function can either return a specific rejection result outlining the problem, or it can throw an error, which the framework will then convert into a rejection result. Essentially, it's a way to enforce rules and prevent potentially disastrous trades during your backtesting.

## Interface IRiskValidation

This interface helps you define rules to make sure your risk calculations are correct and meaningful. It's all about ensuring the data you’re using is in a good state before you perform calculations.

You specify the actual validation logic using the `validate` property, which is a function that checks your risk parameters.  The `note` property is a handy way to add a description explaining what the validation does, which is incredibly helpful for understanding your system later. Think of it as a comment for your code.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, is used internally to help manage risk during trading. It builds upon the existing SignalDto, adding crucial information like the entry price (priceOpen) and the original stop-loss and take-profit prices that were set when the trading signal was initially generated. This allows for validation checks and provides a clear record of the initial risk parameters for each trade. Essentially, it ensures we have access to the core pricing and risk management details needed for accurate calculations and safety checks throughout the backtesting process.


## Interface IRiskSchema

This interface, `IRiskSchema`, is how you define and register your portfolio's risk controls within the backtest-kit framework. Think of it as creating a personalized rulebook for your trading strategy. Each `riskName` acts as a unique identifier for your risk profile, allowing you to easily manage and track different risk settings. 

You can add a `note` to document your risk controls, making them easier to understand for yourself and others. `callbacks` provide optional hooks – `onRejected` and `onAllowed` – for custom actions triggered when a trade is either blocked or approved. 

The heart of the schema lies in `validations`, an array of functions or objects.  These `validations` are the actual checks and balances you implement to enforce your risk rules, ensuring your portfolio stays within pre-defined boundaries.

## Interface IRiskRejectionResult

When your risk validation fails, you'll receive a result detailing why. This result includes a unique identifier (`id`) to track the specific rejection event. It also provides a clear, human-readable explanation (`note`) so you can understand and address the issue. Essentially, it’s a friendly way of telling you why something didn't pass the risk checks and how to figure out what went wrong.

## Interface IRiskParams

This interface, `IRiskParams`, defines the essential information needed to manage risk during trading, whether you're simulating past performance (backtesting) or live trading. It includes details like the name of the exchange you're using, a way to log debugging information, and the current trading environment (like the symbol being traded and the time). Critically, `IRiskParams` also provides a callback function, `onRejected`, that gets triggered when a trade is blocked due to risk restrictions. This callback lets you handle those rejections, potentially sending out notifications or updating records before the system acknowledges the risk event. The `backtest` property simply indicates whether the system is in backtest or live trading mode.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface provides the necessary information for a risk check—a validation step that runs *before* a trade is actually placed. Think of it as a safety gate, ensuring conditions are right before a signal is acted upon. This interface bundles together data from the client strategy context, including things like the trading symbol ("BTCUSDT"), the signal that's waiting to be executed, the name of the strategy making the request, and details about the exchange, risk profile, timeframe and price.  Essentially, it's a snapshot of the trading environment at the moment a trade is being considered. It also includes the current timestamp and price for reference.

## Interface IRiskCallbacks

This interface defines optional functions you can use to respond to specific risk-related events during trading. If you want to be notified when a trade signal is blocked due to risk limits, you can provide an `onRejected` callback. Similarly, if you want to confirm when a trade signal successfully passes your risk checks, you can provide an `onAllowed` callback. These callbacks give you a way to monitor and react to the risk assessment process in your trading system.

## Interface IRiskActivePosition

This interface describes a single active trade being tracked by the risk management system. It holds all the essential details about a position, including the strategy that created it, the exchange it's on, and the trading symbol. You’ll find information like the direction of the trade (long or short), the price at which it was entered, stop-loss and take-profit levels, and timestamps marking when the position was opened. Essentially, it provides a snapshot of what's currently active and helps analyze risks across different trading strategies.

## Interface IRisk

This interface, `IRisk`, is like a gatekeeper for your trading strategies, ensuring they don't take on too much risk. It defines how your system will monitor and control potential losses.

Essentially, before a trading signal is executed, the `checkSignal` function evaluates it against pre-defined risk limits, deciding whether the trade is permissible. 

When a new trade is opened, `addSignal` records its details – like the asset being traded, the strategy used, position type, entry/exit prices, and timing – so the system can keep track of it. 

Conversely, when a trade closes, `removeSignal` removes it from the system's active risk monitoring. This keeps the risk profile accurate and up-to-date.

## Interface IReportTarget

This interface lets you pick and choose what details you want recorded during your trading simulations. Think of it like controlling the level of detail in your reports. Each property, like `strategy` or `risk`, corresponds to a specific type of event you might want to track. Turning a property 'on' (setting it to `true`) means that related events will be logged, giving you more information for analysis. You can enable logging for strategy actions, risk rejections, breakeven points, partial closes, performance metrics, and more, allowing you to tailor your reporting to focus on the aspects most important to your investigation.

## Interface IReportDumpOptions

This section describes options used when exporting report data. Think of it as a set of labels or tags that help organize and identify the data you're saving. 

Each option represents a piece of information about the trade, like which cryptocurrency pair was being traded ("BTCUSDT"), the name of the trading strategy used, and which exchange facilitated the trade. You’ll also find details like the timeframe (e.g., 1 minute, 1 hour) and a unique ID for the signal that triggered the trade. Finally, there's a field for identifying any optimization process applied to the trading walker. This helps you keep your reports clear and easily searchable.

## Interface IRecentUtils

This interface defines how components interact with recent signal data. It provides methods to manage and retrieve the most recent trading signals. You can use it to register when a new signal is generated and retrieve the latest signal details for a specific trading strategy and timeframe. The framework also offers a way to determine how long ago a signal was last updated, measured in minutes.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, gives you a complete view of a trading signal's information, particularly focusing on the original stop-loss and take-profit levels. It builds upon the core signal data to provide transparency for users or external systems.  You'll find the initial stop-loss and take-profit prices here, which are the ones that were set when the signal was first created – these values don't change even if trailing stop-loss or take-profit mechanisms are in effect.

The interface also includes details about position management, like the cost of entry, the percentage of the position that's been partially closed, and the total number of entries and partial closes. It also shows the original entry price – the price when you first got into the trade – and the current unrealized profit and loss.  Essentially, it’s designed to give a clear and comprehensive snapshot of a signal’s performance and configuration, with a focus on showing the original parameters alongside any adjusted values.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, which represents a period of price activity for an asset. Each candlestick contains key information like the time it started (timestamp), the opening price, the highest and lowest prices reached during that time, the closing price, and the total trading volume. Think of it as a snapshot of price movement over a specific interval, like a minute, hour, or day. This standardized format allows different parts of the backtesting system to easily work with and analyze historical price data.

## Interface IPositionSizeKellyParams

When determining how much of your capital to risk on each trade using the Kelly Criterion, these parameters help define your strategy. The `winRate` tells the system the proportion of trades you expect to win, expressed as a number between 0 and 1.  The `winLossRatio` represents your average profit compared to your average loss for each trade. Using these values, the framework will calculate an appropriate position size.

## Interface IPositionSizeFixedPercentageParams

This defines how much of your capital you'll risk per trade using a fixed percentage sizing strategy. 

Specifically, `priceStopLoss` represents the price at which you'll place a stop-loss order to limit potential losses. It's crucial for managing risk and protecting your investment.

## Interface IPositionSizeATRParams

This parameter defines the Average True Range (ATR) value that's currently being used. Think of it as a measure of volatility; a higher ATR means the market is moving more, and this value helps determine how much of your capital to allocate to a trade. It’s a single number representing the ATR at the time of the position sizing calculation.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface helps you define a range around each DCA (Dollar Cost Average) level to identify potential overlaps in your trading positions. Think of it as setting a buffer zone.

It has two key settings: `upperPercent` and `lowerPercent`.

`upperPercent` specifies how much higher than each DCA level a position needs to be to be considered an overlap.

`lowerPercent` does the same for the lower end—defining how much below each DCA level triggers an overlap flag. These percentages are expressed as values from 0 to 100, so 5 represents 5%.


## Interface IPersistBase

This interface outlines the basic functions needed for any custom storage adapter used within the backtest-kit framework. Think of it as a blueprint for how your storage system should operate, ensuring it can reliably read, write, and keep track of the data your backtesting needs. The adapter needs to be able to initialize and check for existing files, read data by its unique identifier, confirm if a piece of data exists, write data securely, and list all available identifiers in a sorted order. These functions provide a standard way to interact with persistent data, like saving and loading backtest results.

## Interface IPartialProfitCommitRow

This object represents a specific instruction to take a partial profit on a trade. It's essentially a row within a queue of actions to be performed. 

The `action` property always indicates this is a "partial-profit" action.  You’ll specify `percentToClose` to define how much of the position should be closed, represented as a percentage. Finally, `currentPrice` records the price at which this partial profit taking occurred.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, queued up for processing. It tells the system that a portion of the current position should be sold. The `action` property confirms that this is a partial loss instruction. You'll specify the `percentToClose` to indicate what percentage of the position you want to reduce, and `currentPrice` records the price at which the partial loss was executed.

## Interface IPartialData

This structure, `IPartialData`, helps save and load information about a trading signal's progress. It's designed to be easily stored, even when you need to save data for later.

Think of it as a snapshot of key details. Specifically, it keeps track of the profit and loss levels the signal has encountered.

Because some data formats, like Sets, can be tricky to store directly, `IPartialData` transforms these Sets into arrays. This makes it simpler to handle when saving to a database or other persistent storage. This structure will be used to save information about the signal's performance. It's rebuilt into a complete state when you load it again.


## Interface IPartial

The `IPartial` interface is responsible for keeping track of how profitable or loss-making a trading signal is. It’s used by the `ClientPartial` and `PartialConnectionService` to monitor signals and let others know when milestones are hit.

Specifically, it provides methods for handling profit and loss situations. When a signal is making money, the `profit` method calculates progress and announces when it reaches predefined percentages like 10%, 20%, or 30%.  The same applies to the `loss` method when a signal is losing money. To avoid redundant notifications, it only sends events for *new* levels reached.

Finally, the `clear` method is used when a trading signal finishes – perhaps by reaching a target price or expiration – to clean up any recorded data and free up resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the results after parsing command-line arguments used to control how your trading system runs. It tells you whether you're running a backtest using historical data, a paper trading simulation with live data, or actual live trading with real funds. Essentially, it defines the execution environment for your trading strategy. It bundles the flags related to your trading mode together.

## Interface IParseArgsParams

This interface, `IParseArgsParams`, describes the information needed to run a trading strategy. Think of it as a blueprint for what the system needs to know to get started. It specifies things like the trading pair you're interested in (like "BTCUSDT"), the name of the strategy you want to use, which exchange you're connecting to (like "binance"), and the timeframe for the candles you want to analyze (like "1h" for one-hour candles). Essentially, it organizes all the key details to tell the backtest kit what to do.

## Interface IOrderBookData

This interface describes the structure of order book data, which is essential for understanding market depth and price movements. It includes the `symbol` representing the trading pair, like 'BTCUSDT'. You'll also find arrays for `bids` – representing buy orders – and `asks` – representing sell orders. Each of these arrays contains detailed information about the individual orders at those price levels.

## Interface INotificationUtils

This interface defines the core functionality for any system that sends notifications from your backtesting framework. Think of it as a contract that ensures different notification methods – like sending emails, messages, or updating a dashboard – all work consistently together.

It provides methods for handling various events during a backtest, such as when a trade is opened, closed, or a partial profit/loss target is reached. 

You’ll also find methods to deal with errors and retrieve or clear the history of notifications. Implementing this interface allows you to customize how your backtest informs you about its progress and any issues that arise.

## Interface INotificationTarget

This interface lets you finely control which notifications your trading strategy receives during a backtest or live trading session. Think of it as a way to filter out the noise and only get alerts about the events that are most important to you. By default, you'll get *everything*, but this interface allows you to pick and choose.

You can subscribe to updates about signal lifecycle events (opening, scheduling, closing, canceling), partial profit or loss hits, reaching breakeven, strategy commit confirmations, signal synchronization events, risk manager rejections, informational signal messages, common errors, critical errors, and validation errors. This makes it easy to tailor your monitoring and logging to exactly what you need to analyze your strategy's performance and understand its behavior.  You only need to specify the notifications you want to receive, letting you focus on the critical information.

## Interface IMethodContext

The `IMethodContext` object holds important information about the specific trading environment your strategy is operating within. Think of it as a set of labels that tell the backtest-kit exactly which strategy, exchange, and historical data frame to use during a backtest or simulation.

It carries the names of these components – the exchange name, the strategy name, and the data frame name – and is automatically passed around within the framework, so you don't have to manage it directly.  The data frame name will be blank when you're running in live (non-historical) mode. Essentially, it's the key to making sure your strategy connects to the right pieces of the puzzle.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems (like local files, databases, or even temporary placeholders) should behave within the backtest-kit framework. It essentially sets the rules for how you can interact with and manage data.

You can use `waitForInit` to prepare the memory system for use, making sure it’s ready to receive data.

`writeMemory` is how you save new information into memory, associating each piece of data with a unique identifier and a description.

Need to find something specific? `searchMemory` lets you search for entries based on keywords, using a technique called BM25 to rank results.

If you want to see everything that’s currently stored, `listMemory` provides a complete list of entries.

To clear out old or unwanted data, `removeMemory` allows you to delete specific entries.

Retrieving a single entry is easy with `readMemory`, which lets you pull back data using its identifier.

Finally, `dispose` is used to clean up and release any resources used by the memory instance when you’re finished with it.

## Interface IMarkdownTarget

The IMarkdownTarget interface lets you pick and choose which reports your backtest kit generates. Think of it as a way to customize the level of detail in your analysis.

You can enable specific reports like those focused on strategy performance, risk management, or even how your portfolio performs across different assets with a heatmap. 

It also offers options for tracking things like signals waiting to be triggered, live trading events, and milestone achievements like reaching a peak profit or hitting a drawdown limit. Ultimately, you control which data points get extra attention through these configurable flags.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, defines how data is organized when generating reports, particularly in markdown format. Think of it as a container for all the details needed to locate and identify specific pieces of information during a backtest. It holds things like the directory where the data lives, the filename, and crucial identifiers like the trading pair (e.g., BTCUSDT), the name of the trading strategy, the exchange being used, the timeframe (like 1 minute or 1 hour), and a unique signal ID.  Essentially, it's a set of properties that ensures the correct data is pulled and presented for analysis and reporting.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's a central way to record events and information, helping to understand how things are working, diagnose problems, and keep track of system behavior.

You can use the `log` method for general messages about important events.
The `debug` method is for very detailed information, mostly useful when you’re developing or troubleshooting.
`info` is for reporting successful actions and key updates.
And `warn` is for noting potential issues that aren't critical errors but need to be looked into. 

These methods—`log`, `debug`, `info`, and `warn`—are used across many parts of the system, from managing agents and sessions to saving data and verifying policies.

## Interface ILogEntry

ILogEntry represents a single entry in the system's log history. Each log entry has a unique identifier, a level indicating its severity (log, debug, info, or warn), and a timestamp for tracking when it occurred. 

The entry also includes a date and a more precise Unix timestamp for easier sorting and management. 

To give more context, the `methodContext` and `executionContext` properties provide details about where and how the log entry was generated.  You'll also find a `topic` describing what the log is about, and `args` which contain any extra information passed along with the log message.

## Interface ILog

The `ILog` interface helps you keep track of what’s happening during your backtesting process. It provides a way to access a complete history of log messages generated by the framework.

The `getList` method lets you retrieve all the log entries that have been recorded, giving you a full picture of the events that transpired. This is useful for debugging and understanding the behavior of your trading strategies.

## Interface IHeatmapRow

This interface represents a single row in a heatmap visualization, focusing on the performance statistics for a specific trading pair like BTCUSDT. It bundles together key metrics calculated across all trading strategies applied to that symbol.

You’ll find information like the total profit or loss percentage achieved, the Sharpe Ratio which measures risk-adjusted return, and the maximum drawdown which indicates potential downside risk.  It also includes trade-level details such as the total number of trades, the number of wins and losses, and the win rate.

Furthermore, it provides insight into the average profit and loss per trade, volatility (standard deviation), and profitability ratios like the profit factor. Finally, it details streak information (maximum win/loss streaks) and average peak/fall profit percentages which help to understand how successful and stable the trading strategy is for that symbol.

## Interface IFrameSchema

The IFrameSchema defines how your backtest will be structured in terms of time. Think of it as setting up the timeline for your trading simulation. 

It lets you specify a unique name for each timeline segment, add a note for yourself to remember details, and most importantly, define the interval – how frequently data points will be generated (like every minute, hour, or day).

You'll also set the start and end dates to determine the period your backtest will cover. Finally, you can include optional callbacks to run custom code at various points within the frame’s lifecycle.

## Interface IFrameParams

The `IFramesParams` object is what you provide when you create a ClientFrame – think of it as the setup information for the frame. It builds upon `IFramesSchema` and importantly includes a logger, which allows you to monitor what's happening behind the scenes and helps with debugging any issues. Essentially, it’s how you tell the frame how to log information for analysis and troubleshooting.

## Interface IFrameCallbacks

This section describes callbacks triggered during the creation of timeframes for backtesting. The `onTimeframe` callback gives you a chance to inspect or record the generated timeframes – the array of dates, the start and end dates of the timeframe, and the interval used. It's handy for checking that your timeframes look right or simply keeping a record of them.


## Interface IFrame

The `IFrames` interface is a core component that handles the creation of timeframes used during backtesting. Think of it as the engine that produces the sequence of dates your backtest will analyze. 

Specifically, the `getTimeframe` function is what you'll interact with. It takes a trading symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour candles) and then generates a list of timestamps that represent those time intervals. This list of dates will drive how your backtest iterates through historical data.

## Interface IExecutionContext

The `IExecutionContext` interface represents the environment in which your trading strategies and exchange operations run. Think of it as a package of essential information passed around to provide context for various actions. It contains details like the trading symbol, the current timestamp, and whether the code is executing in a backtesting simulation or a live trading environment. This context is automatically provided by the execution context service and is used by functions like fetching historical data, handling real-time events, and performing backtests. 

It provides three key pieces of information:

*   The `symbol` tells you which trading pair you're dealing with, like "BTCUSDT".
*   The `when` property indicates the precise moment in time the operation is happening.
*   The `backtest` flag tells you if the code is running a historical simulation or in a live trading scenario.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to and pulling data from a platform like Binance or Coinbase. 

It includes a unique name to identify the exchange and an optional note for developers.

The most important part is `getCandles`, which tells backtest-kit where and how to get historical price data (candles) for a trading pair. You'll need this to run backtests.

It also defines `formatQuantity` and `formatPrice` which handle converting quantity and price values to the correct format that the exchange expects – helping ensure your orders are understood correctly. These are optional, but useful for accurate representation.

You can also optionally implement `getOrderBook` and `getAggregatedTrades` to fetch order book snapshots or trade history, though these are not essential for basic backtesting.

Finally, `callbacks` allows you to react to specific events like receiving new candle data.

## Interface IExchangeParams

This interface, `IExchangeParams`, defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It's a central set of tools that allow the backtesting engine to simulate trading on a specific exchange. 

Think of it as a blueprint for how the backtest-kit understands and communicates with a particular exchange.

Here's what's included:

*   A logger for tracking and debugging the backtesting process.
*   An execution context, which provides information like the trading symbol, the current time, and whether the test is running in backtest mode.
*   Methods to retrieve historical and real-time data:
    *   `getCandles`:  Gets candlestick data (open, high, low, close prices) for a trading pair.
    *   `getOrderBook`:  Fetches the order book, which shows the buy and sell orders at different price levels.
    *   `getAggregatedTrades`: Retrieves a combined set of trades, useful for analyzing trading activity.
*   Functions for formatting trade details correctly for the exchange:
    *   `formatQuantity`: Converts a numerical quantity into a string that adheres to the exchange's specific formatting rules.
    *   `formatPrice`:  Similarly, formats a price value into the correct string representation.

All of these methods are considered necessary for a functional exchange integration, though sensible defaults are provided if you don't define them explicitly.

## Interface IExchangeCallbacks

The provided code snippets describe callbacks for receiving data from an exchange. They don’t deal with symbols or any list of allowed/disallowed symbols. The descriptions focus on how to react to incoming candle and trade data. They explain the arguments passed to the callbacks (symbol, interval/since/limit, data) and suggest uses like charting, logging, and asynchronous processing.

## Interface IExchange

This interface defines how to interact with a cryptocurrency exchange within the backtest-kit framework. It gives you access to historical and future market data, allowing you to simulate trading scenarios.

You can retrieve past candle data (like open, high, low, close prices and volume) for a specific trading pair and time interval, as well as look ahead to future data during backtesting.

The framework also handles formatting trade quantities and prices to match the exchange's specific requirements, and provides a convenient way to calculate the VWAP (volume-weighted average price) based on recent trading activity. 

You can also fetch order book information and aggregated trade data to get a more complete picture of market conditions. Importantly, all data fetching methods are designed to prevent issues like "look-ahead bias" that could skew backtesting results. Raw candles can be fetched with flexible date ranges and limits for more granular data retrieval.

## Interface IEntity

This interface, IEntity, serves as the foundation for all data objects that are saved and retrieved within the backtest-kit framework. Think of it as the common ground—every entity you define, whether it's a trade, an account balance, or something else, will inherit from this base. It ensures that all persistent data structures have a consistent structure and behavior. Essentially, it provides a reliable starting point for building your data models within the backtest-kit environment.


## Interface IDumpInstance

The IDumpInstance interface defines how to save data related to a backtest run. It’s like having a designated spot to store different types of information – message histories, simple records, tables of data, raw text, error descriptions, and even complex JSON objects. Each piece of data you save is linked to a specific identifier and description. When you’re done using a dump instance, the `dispose` method allows you to clean up any resources it's holding.

## Interface IDumpContext

This `IDumpContext` object helps keep track of where a piece of data came from during a backtest. Think of it as a label – it tells you which trading signal and strategy the data is associated with. It's used internally by a component that handles outputting data, so you generally won't create these objects directly.

Each dump will have a unique ID, a descriptive label to help you understand what it represents, and identifies the signal and bucket (like a strategy name) that created it. This context allows for easy searching and organization of backtest results.


## Interface ICommitRowBase

The `ICommitRowBase` interface defines the basic structure for events that represent queued trading actions. Think of it as a blueprint for rows of data that will eventually be committed or processed. It ensures that trading actions are handled correctly, even when the system isn't immediately ready to execute them.

Each `ICommitRowBase` object contains two key pieces of information:

*   **symbol**: This tells you which trading pair (like BTC-USD or ETH-BTC) the action relates to.
*   **backtest**: A simple flag indicating whether this action happened during a simulated backtest or in a live trading environment.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. It's used to verify that the data you've saved is consistent and accurate. 

You'll provide details like the trading symbol (like "BTCUSDT"), the exchange you're using, the time interval of the candles (like "1m" for one-minute candles, or "4h" for four-hour candles), and a date range to examine.  Finally, you'll tell the system where to find the candle data files on your computer – it defaults to a standard location, but you can customize it if your data is stored elsewhere.

## Interface ICandleData

This interface represents a single candlestick, the standard unit of time-based price data you’ll be working with. Each candlestick contains information about a specific time interval, like an hour or a day. 

You'll find the exact time the candle started (timestamp), the price when trading began (open), the highest and lowest prices reached during that time (high and low), the closing price (close), and the total trading activity (volume). It’s the fundamental building block for analyzing historical price movements and testing trading strategies.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candlestick data. It's used to efficiently prepare your backtesting environment by fetching and storing candles ahead of time. 

You'll specify the trading symbol like "BTCUSDT," the exchange providing the data, the candle timeframe (such as 1-minute or 4-hour candles), and the start and end dates for the historical data you want to retrieve. This ensures your backtest has all the necessary data readily available.

## Interface IBroker

The `IBroker` interface defines how backtest-kit connects to real-world trading platforms. Think of it as a bridge between the simulation and live trading. You'll need to create a class that implements this interface to connect to your specific broker.

The `waitForInit` method is the first thing called, allowing you to establish the connection, load your API keys, and get everything set up before any trading actions happen.

Then, when the framework needs to execute a trade – whether that's opening a new position, closing one entirely, or adjusting profit targets – it calls the corresponding methods on your broker adapter. For example, `onSignalCloseCommit` handles closing existing positions, while `onSignalOpenCommit` takes care of opening new ones.

The framework also has ways to manage risk and optimize trades with partial profits, losses, and trailing stops; each of those actions has a dedicated method for your broker adapter to handle. Similarly, average-buy orders (DCA) trigger a specific method.

Importantly, all of these methods are called *before* any changes are made to the framework's internal state, so any errors will prevent those changes, keeping things consistent. Keep in mind that when running in backtest mode, these broker-related functions won’t actually do anything – they are skipped entirely.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to hold a simple piece of information about whether a trading target has been achieved. Think of it as a snapshot of a more complex state—specifically, whether a breakeven point has been hit. It's designed to be easily saved and loaded, particularly when you need to preserve trading progress.

It’s primarily used to store whether a breakeven target has been reached for a specific signal.

The `reached` property is the key here - a straightforward boolean indicating whether the breakeven has been achieved. This is the data that gets saved and retrieved, translating a potentially more detailed state into something easily storable.


## Interface IBreakevenCommitRow

This represents a specific action related to calculating and managing breakeven points in a trading strategy. Essentially, it's a record of when a breakeven calculation was triggered. 

It includes the `action` which is always “breakeven,” clearly indicating what type of event this record represents. Alongside that, you'll find the `currentPrice`, which is the price at which the breakeven calculation was made. This price is essential for understanding the context of the breakeven calculation.

## Interface IBreakeven

The IBreakeven interface helps manage situations where a trading strategy wants to move a stop-loss to the entry price, essentially aiming for a risk-free position. 

It keeps track of when this "breakeven" point is reached, meaning the price has moved favorably enough to cover any transaction fees.

The `check` method determines if a breakeven move is appropriate, considering the current price, transaction costs, and whether a breakeven has already occurred. If the conditions are right, it triggers a notification and saves the breakeven state.

The `clear` method resets the breakeven tracking when a trading signal is closed, ensuring that information is properly cleaned up and saved.

## Interface IBidData

IBidData represents a single bid or ask price and its corresponding quantity within the order book. It's essentially a snapshot of activity at a specific price point.  Each IBidData object contains two key pieces of information: the 'price' at which the bid or ask exists, and the 'quantity' of assets available at that price. Both the price and quantity are represented as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. It details a specific purchase made as part of the overall averaging process.

Each instance of this interface includes the price at which the purchase was made, the cost of that purchase in USD, and the total number of purchases that will have been made when this step is complete. This allows you to track the progression and cost of your DCA strategy over time.


## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that happened. Think of it as a record of one transaction. Each record includes the price at which the trade took place, the quantity of assets exchanged, the precise time of the transaction, and a flag indicating whether the buyer or seller initiated the trade. This data is valuable for detailed analysis and building backtesting systems to understand trading behavior. The unique ID lets you distinguish this specific trade from others.

## Interface IActivateScheduledCommitRow

This interface describes a message that's used when a previously scheduled action needs to be carried out. It's essentially a notification that something that was planned for later is now ready to happen.

The `action` property always specifies the action being taken - in this case, an "activate-scheduled" operation.

You'll also find the `signalId`, which uniquely identifies the signal that's being activated, and optionally, `activateId` which can be used to track user-initiated activations.


## Interface IActionStrategy

The IActionStrategy interface lets your trading actions peek at the current signal status. Think of it as a way for your actions to quickly check if there's a signal waiting before they proceed – like confirming there's something to act on before taking action.

It provides two key methods:

*   `hasPendingSignal` tells you if there's an existing open position (a signal already in play) for a specific symbol.
*   `hasScheduledSignal` checks if a signal is waiting to be triggered in the future.

These checks help streamline your actions, ensuring they only run when there's an appropriate signal present, preventing unnecessary actions. This interface focuses on providing read-only information about the signals.

## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy with custom logic that responds to events. Think of it as a way to hook into a strategy's execution to do things like log events, send notifications, manage state (using tools like Redux), or trigger specific actions based on what's happening. 

Each strategy can have multiple actions attached, and these actions are created fresh for each frame of data being processed. This allows for tailored responses to each situation.

To register an action, you need to provide a unique identifier (`actionName`), an optional note for documentation, a handler function (`handler`), and you can optionally provide lifecycle callbacks (`callbacks`) to precisely control when the action is executed. Essentially, it’s how you add custom event handlers to your strategies.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to function correctly within the backtest-kit framework. Think of it as a package deal of essential details.

It builds upon the base action schema and includes a logger to help you keep track of what's happening during execution and to quickly debug any issues.  

You’ll also find important context information, such as the name of the strategy and timeframe the action is associated with.  

Knowing whether the action is running in backtest mode is another crucial piece of information included here.

Finally, it provides access to the current strategy context allowing you to understand the current market conditions and the state of your positions.


## Interface IActionCallbacks

This interface, `IActionCallbacks`, gives you hooks to manage the lifecycle and react to events within your trading action handlers. Think of it as a way to plug in your own custom logic at key moments.

You can use `onInit` to set things up when your handler starts – connecting to databases, grabbing initial data, or subscribing to updates.  `onDispose` is its opposite; use it to clean up resources when the handler finishes, like closing connections or saving any changes.

There are several event callbacks that fire depending on what's happening in your trading environment.  `onSignal` gets called for every signal, while `onSignalLive` and `onSignalBacktest` are specific to live and backtesting modes, respectively.  You’ll also get calls related to breakeven, partial profits/losses, and ping monitoring. These callbacks keep you informed about critical events and allow you to respond accordingly.

A special callback is `onSignalSync`. This allows you to control limit orders by potentially rejecting them—the framework will then retry the order on the next tick. Be aware that errors within `onSignalSync` aren't caught, so handle them carefully.

## Interface IAction

The `IAction` interface is your central hub for reacting to events within the trading framework, allowing you to customize how the system behaves. Think of it as a set of hooks that trigger whenever something important happens – a new signal, a breakeven achieved, a partial profit or loss, or even scheduled pings. You can use these hooks to log events, update a dashboard, feed data to a real-time monitoring tool, or integrate with your own custom systems.  The `signal` method is the most common, responding to signals generated whether you're live trading or backtesting. Specialized methods like `signalLive` and `signalBacktest` provide even more granular control, allowing you to handle live and backtest events differently. Crucially, there's a `dispose` method to ensure proper cleanup when you're done –  unsubscribe from observables and release resources.  The `signalSync` method is unique: it lets you actively influence order placement (limit orders) by rejecting them, although exceptions thrown here are not ignored.

## Interface HighestProfitStatisticsModel

This model helps you keep track of the most profitable moments in your backtesting. 

It holds a complete, ordered list of events – think of it like a chronological record of when your trading strategy earned the most. 

You'll also find a simple count of how many of these profitable events occurred overall. This lets you quickly understand the frequency of these high-profit occurrences.

## Interface HighestProfitEvent

This object represents the single best profit moment achieved during a trading simulation or live trade. It captures all the key details surrounding that peak profit.

You’ll find information like the exact time (timestamp), the trading pair involved (symbol), and the name of the strategy that generated the trade. It also includes the unique identifier for the signal that triggered the position and whether the position was a long or short.

Crucially, it records the unrealized profit and loss (PNL) at that moment, along with the price at which the peak profit was reached, the original entry price, and the predefined take profit and stop loss levels. A flag indicates whether this record was from a backtesting run.

## Interface HighestProfitContract

The HighestProfitContract provides information when a trading position reaches a new peak profit level. It’s designed to let you react to these milestones, like setting up trailing stops or taking partial profits. 

Each update includes details like the trading symbol (e.g., BTC/USDT), the current price, and when the update happened. You'll also get the strategy name, the exchange used, the timeframe (like 1-minute or 5-minute), and the signal that triggered the trade.

Finally, there’s a flag to tell you whether this profit update came from a historical backtest simulation or from live trading.

## Interface HeatmapStatisticsModel

This structure holds the overall performance statistics for your entire portfolio, providing a high-level view of how your investments are doing. 

It breaks down the aggregated results across all the symbols you're tracking, giving you a comprehensive picture beyond individual asset performance. 

You'll find key metrics like the total number of symbols, the overall profit and loss (PNL), and the Sharpe Ratio – a measure of risk-adjusted return. 

It also includes details like the total number of trades executed and average peak and fall PNL values, weighted by trade count, which helps to understand typical performance patterns. Essentially, it’s a consolidated report card for your portfolio’s trading activity.


## Interface DoneContract

This interface describes the information passed when a background process finishes, whether it's a backtest or a live trading session. It tells you which exchange was used, the name of the strategy that ran, and whether the execution happened in backtest mode or live mode.  You’ll also find the trading symbol involved, like "BTCUSDT," making it easy to identify precisely what was being traded. Think of it as a confirmation message detailing the completed execution.

## Interface CriticalErrorNotification

This notification signals a critical error that requires the trading process to stop immediately. It’s a way the framework alerts you to serious problems that can’t be recovered from. Each notification has a unique ID and includes a detailed error message to help you understand what went wrong. The notification also provides the full stack trace and any related metadata about the error, essentially giving you a snapshot of the situation at the moment of failure. Importantly, this type of notification always indicates an issue occurring in the live trading environment, not during a simulation.

## Interface ColumnModel

This describes how to set up columns for creating tables, especially when you want to display data in a readable format.  You'll define each column with a unique `key` to identify it, and a user-friendly `label` that will show as the column header. The `format` property lets you customize exactly how the data in each cell appears—you can use a function to transform it into the desired string representation.  Finally, `isVisible` gives you a way to conditionally show or hide columns based on certain conditions.

## Interface ClosePendingCommitNotification

This notification tells you about a pending trading signal that was closed before a position was actually opened. It's a way to keep track of signals that didn't result in a trade due to timing or other factors.

The notification includes a unique ID, the timestamp of when the closing occurred, and whether it came from a backtest simulation or a live trading environment. You’ll also find details like the symbol being traded (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where the signal originated.

Crucially, it breaks down the specifics of the signal itself, including the signal ID, original entry price, and the total number of entries and partial closes involved. It also provides profit and loss information, the cost of the investment, and an optional note for a human-readable explanation of why the signal was closed. Finally, there’s a timestamp indicating when the notification itself was created.

## Interface ClosePendingCommit

This signal is used to tell the backtest system to close out a pending order. It’s like saying, "Forget about that order we were waiting on, let's execute it now."  You can optionally provide a `closeId` to give a specific reason for the closure, which is helpful for tracking why a trade was closed. The signal also includes the profit and loss (`pnl`) calculated up to the moment the closing trade is initiated.

## Interface CancelScheduledCommitNotification

This notification lets you know that a previously scheduled trading signal has been canceled before it was actually executed. It's particularly useful if you're working with strategies that plan trades in advance. The notification includes a lot of important details, such as a unique ID, the exact time of cancellation, and whether it happened during a backtest or live trading.

You’ll also find key information about the strategy and exchange involved, along with identifiers for the signal and the cancellation itself. It even contains details about any DCA entries or partial closes that were planned, as well as the original entry price. 

Finally, you’ll get a snapshot of the potential profit and loss (pnl) as it stood at the time of cancellation, along with helpful notes that might explain why the signal was canceled in the first place. The notification also tracks creation time, allowing you to correlate events and debug issues efficiently.

## Interface CancelScheduledCommit

This object lets you cancel a previously scheduled signal event, effectively undoing a planned action. It's useful when you need to halt a transaction that's been set up for later execution. You'll specify that the action is a "cancel-scheduled" event. Optionally, you can include a `cancelId` to help you track why the cancellation happened. The `pnl` property provides information about the unrealized profit and loss that would have been associated with the canceled signal.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a trading simulation. It gives you a clear picture of how often and when breakeven points were reached. 

You'll find a detailed list of each individual breakeven event, including all related data, stored within the `eventList` property.  The `totalEvents` property simply tells you the total count of breakeven events, offering a quick overview of the simulation's breakeven activity.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized way to track when a trade reaches its breakeven point. It bundles essential details like the exact time, the trading symbol, the strategy used, and a unique identifier for the signal that triggered the trade. You'll find information about the position type (long or short), the current market price, and the originally set take profit and stop-loss levels.

For trades involving dollar-cost averaging (DCA), the event also includes details such as the total number of entries and partial exits. It also shows the unrealized profit and loss (PNL) at the breakeven moment, along with a human-readable note explaining the reason behind the signal. Additionally, you'll find timestamps indicating when the position became active and when the signal was initially created, along with an indicator specifying whether the trade was part of a backtest or live trading.

## Interface BreakevenContract

This represents a specific milestone in a trade: when the stop-loss is moved back to the original entry price, effectively achieving breakeven. It's a signal that the trade has progressed enough to cover transaction costs and reduce risk.

Each breakeven event is unique to a signal and won't be repeated.

The event contains several details:

*   **symbol**: The trading pair involved (like BTCUSDT).
*   **strategyName**: The name of the strategy that created the trade.
*   **exchangeName**: The exchange used for the trade.
*   **frameName**:  Identifies the timeframe of the trade (empty if it’s a live trade).
*   **data**: Contains all the original signal information, like the initial stop-loss and take-profit levels.
*   **currentPrice**: The price at the moment breakeven was reached.
*   **backtest**: Indicates whether this event occurred during a historical simulation or a live trade.
*   **timestamp**: Records precisely when the breakeven event occurred, using the live trading time or the historical candle timestamp depending on the execution mode.

These events are used to track strategy performance and safety and are typically used for reporting or to notify users about risk reduction milestones.

## Interface BreakevenCommitNotification

This notification lets you know when a breakeven action has occurred within the trading system. It's essentially a signal that the strategy has adjusted its position to reach a breakeven point.

The notification includes a unique identifier and a timestamp indicating precisely when the breakeven action took place. You'll also find details like whether this happened during a backtest or live trading, the trading pair involved, and the strategy that triggered the action.

Detailed information about the trade itself is provided, including the open price, take profit and stop loss levels (both original and adjusted), and the number of DCA entries and partial closes.  You'll also get a complete snapshot of the trade’s P&L, including USD values, percentages, and the prices used in those calculations.

Furthermore, the notification captures contextual data such as the signal creation and pending timestamps, along with an optional note providing extra details or rationale for the trade. This comprehensive data allows you to analyze the conditions leading up to and surrounding the breakeven event.

## Interface BreakevenCommit

This interface represents an event triggered when a trade reaches its breakeven point. It contains detailed information about the trade's state at that moment.

Think of it as a notification that a trade has reached a specific milestone, allowing your strategy to react.

The event includes the current market price, your unrealized profit and loss (PNL), and the trade direction (whether you bought or sold). It also remembers the original entry price, the initial take profit and stop-loss prices, and how they might have changed due to trailing. 

You’ll find timestamps indicating when the signal was created and when the position was initially activated, giving you a full timeline of the trade's journey. The `action` property confirms this is a breakeven event, and the stop-loss is reset to the original entry price.

## Interface BreakevenAvailableNotification

This notification tells you when your trade's stop-loss can be moved to breakeven – essentially, when your losses are covered. It's a signal that your trade is performing well enough to potentially protect your initial investment.

The notification includes a lot of important details about the trade: its unique ID, when it happened, whether it's a backtest or live trade, the trading pair involved, the strategy that created the signal, and the exchange used.

You'll find details on the current market price, the entry price, and the position (long or short). It also provides information about your take profit and stop loss levels, both as they currently are and as they were originally set before any trailing adjustments.

The notification will also tell you about any averaging (DCA) used, the number of partial closes, and the current profit/loss situation - how much you've made or lost so far in USD and as a percentage. Finally, there's a timestamp for when the signal was created, when the position was pending, and when the notification itself was generated. A note can give you a brief explanation of why the signal triggered.

## Interface BacktestStatisticsModel

This model holds all the statistical information gathered during a backtest, helping you understand how well your trading strategy performed. It includes a detailed list of every trade taken, allowing for in-depth analysis. You’ll find key metrics like the total number of trades, how many were winners versus losers, and the overall win rate.

Performance is quantified with figures like average profit per trade, total profit across all trades, and volatility measurements like standard deviation. Advanced ratios, such as the Sharpe Ratio and annualized Sharpe Ratio, provide insight into risk-adjusted returns.  Additional details include the certainty ratio (a measure of winning trade size versus losing trade size) and an estimate of yearly returns.  Finally, it tracks the average peak and fall profits to understand potential drawdown risks. Be aware that some of these values might be missing (represented as null) if the calculations aren’t reliable due to data issues.

## Interface AverageBuyCommitNotification

This notification provides information about a new averaging (DCA) buy being executed within a trading strategy. It's triggered whenever a new averaging entry is added to an existing position.

The notification includes details such as a unique identifier, the timestamp of the averaging execution, and whether it occurred during a backtest or live trading. You'll find specifics about the trading pair, the strategy and exchange involved, and a unique signal identifier.

It also reports key price points: the price at which the averaging buy occurred, the current averaged entry price, and the total number of DCA entries made.  You can also see original entry details like the initial price and the original take profit/stop loss levels.

Crucially, it includes profit and loss data related to the trade, including P&L in both USD and percentage terms, along with the cost of the averaging entry. Further timestamps mark the signal's creation and pending states. Lastly, a human-readable note can provide extra context or explanation for the averaging action.

## Interface AverageBuyCommit

This event, named AverageBuyCommit, signifies that a new averaging purchase has been made within an existing trade. It’s specifically triggered when your strategy is accumulating more of an asset at different prices, a technique often called dollar-cost averaging.

The event provides detailed information about this averaging action, including the current market price at which the purchase occurred, the cost of that particular buy.

You'll also find the updated effective entry price—the average price you've paid for the asset—and the unrealized profit and loss (PNL) calculated after incorporating this new purchase.

Additional details included are the original entry price, the current take profit and stop loss prices (potentially adjusted if you’re using trailing stops), the original take profit and stop loss values before any trailing, and timestamps associated with the signal's creation and the position's activation. This comprehensive data helps you understand and analyze the performance of your averaging strategy.

## Interface ActivePingContract

This defines how the backtest-kit framework communicates about active pending signals. Think of it as a heartbeat signal – every minute, when a pending signal is still active, the system sends out this message. It gives you information like the trading pair (symbol), the strategy that created the signal, the exchange it's on, and all the details of the pending signal itself.

You also get the current price and whether the signal is being monitored in backtest mode or live trading.

The framework lets you react to these heartbeats – you can set up callbacks to do custom things like adjust your strategy based on the current price or manage the signal lifecycle differently. This allows for very flexible and customized management of pending signals.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning a trade is being initiated based on a previously planned strategy. It's a confirmation that the system is moving forward with a trade, even before the price reaches a specific target.

The notification includes a unique ID and timestamp to track the activation, along with details about whether it occurred in backtest or live mode. You’ll find key information like the trading symbol, the name of the strategy that triggered the signal, and the exchange where the trade is happening.

Crucially, it provides all the trade parameters: position direction (long or short), entry price, take profit, and stop-loss levels, including both the original and adjusted values after any trailing stops are applied. You can also see details about any averaging or partial closing strategies used, plus a snapshot of the strategy's profit and loss, including how it's been calculated with fees and slippage accounted for.

Finally, it provides timestamps related to when the signal was initially created, when it entered a pending state, and the current market price at the time of activation – offering a complete picture of the signal’s journey. A descriptive note field allows for additional context around the signal’s reason for activation.

## Interface ActivateScheduledCommit

This interface represents an action taken to activate a previously scheduled trading signal. Think of it as the moment a plan is put into motion.

It includes important details about the trade itself, like whether it's a long (buy) or short (sell) position and the price at which the trade was initiated.

You'll also find information about profit and loss (PNL) calculated at the entry price, as well as the initial take profit and stop-loss levels.  There’s even the original take profit and stop-loss prices before any adjustments were made.

The interface also tracks the timestamps of when the signal was initially created and when the activation process took place. Finally, it allows for an optional identifier to provide context or reason for this activation.
