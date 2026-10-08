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

This interface defines a signal event that occurs when a trading walker needs to be stopped, often during backtesting or simulations. It's used to interrupt a running walker and strategy.

The signal includes details such as the trading symbol involved (like "BTCUSDT"), the specific name of the strategy to halt, and the walker's name, allowing for targeted stops when multiple walkers are active.

Importantly, these stop signals are exclusively used within a backtesting environment.

The `when` property records the virtual time of the strategy at the point of interruption, based on the candle data processed – it's not real-world time.

## Interface WalkerStatisticsModel

This interface, WalkerStatisticsModel, is designed to hold the results of a backtesting process, providing a clear way to organize and understand the performance of different strategies. It builds upon the existing IWalkerResults interface and adds extra details specifically for comparing strategies against each other. The core of this model is the strategyResults property, which is a list containing all the results generated during the backtest—allowing you to see how each strategy performed.

## Interface WalkerContract

The WalkerContract defines what happens as your trading strategies are being compared against each other. Think of it as a report card delivered at the end of each strategy’s test run.

Each time a strategy finishes its backtest, this contract provides a snapshot of the results.

You'll find information like the strategy's name, the exchange and symbol being used, and detailed performance statistics.

It also keeps track of the overall progress of the strategy comparison, including the current best-performing strategy and how many strategies have been tested.

The `when` property tells you when the test happened within the simulation – it's not actual time, but rather the time of the last candle processed. This is useful for understanding the sequence of events.  The `backtest` flag simply confirms that the information comes from a backtest.


## Interface WalkerCompleteContract

This contract, `WalkerCompleteContract`, signals the conclusion of a backtesting process for a set of trading strategies. It's triggered when all strategies have been evaluated and the final results are ready. 

Think of it as a notification saying, "We're done testing these strategies!"

The contract bundles together important information about the backtest, including the name of the walker (the testing process), the symbol being traded, the exchange and timeframe used, the optimization metric, and the number of strategies tested.  It also highlights the best-performing strategy, its metric score, and detailed statistics. 

Crucially, this event is exclusive to backtesting operations and includes a timestamp representing the last candle processed during the entire backtest, not a real-world time.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your trading strategy's setup or execution. It's designed to help you pinpoint and fix issues related to risk checks and constraints. 

The notification includes a unique identifier, a detailed error object (complete with a stack trace to help with debugging), and a clear, human-readable explanation of what went wrong. The `backtest` flag will always be false, indicating that the error originated from your live trading context rather than a simulation. Use this information to understand and resolve any problems with your validation rules.

## Interface ValidateArgs

This interface, `ValidateArgs`, acts like a central blueprint for making sure the names of things – like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweeps – are all valid within your backtesting setup.  Think of it as a quality control check.

Each property within `ValidateArgs` represents one of these names, and they all follow the same pattern:  they expect an enum object.  This enum object holds the permissible values for that particular name (e.g., what valid exchange names exist in your system).  The backtest-kit uses this to verify that you're using recognized names and avoid errors.

It makes sure everything aligns and works together correctly.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It provides a wealth of information about the trade, including when it happened, the trading pair involved, and whether it occurred during a backtest or live trading. You'll find details about the original take profit and stop loss levels, the current price at execution, and key performance metrics like peak profit and maximum drawdown. 

The notification breaks down the trade's financials, detailing costs, multipliers, and the total number of entries and partial closures. It also gives you a complete picture of the position’s P&L, including entry and exit prices and percentages.  A helpful 'note' field allows for a more descriptive explanation of the trade's reasoning. Timestamps are included for creation, scheduling, pending, and execution, enabling a full timeline of the trade's lifecycle.

## Interface TrailingTakeCommit

This interface describes a trailing take event, which happens when a trading strategy adjusts a take profit level based on price movement. It contains details about the event itself, including confirmation that it's a "trailing-take" action.

You’ll find information about how much the take profit was adjusted by, the current price when the adjustment occurred, and the overall profit and loss (pnl) achieved so far for this trade. The record also provides insight into the trade's performance, showing the highest profit attained (peak profit), the largest loss experienced (max drawdown), and whether the original trade was a long (buy) or short (sell) position.

Crucially, it includes the initial take profit and stop loss prices, along with any adjustments made through trailing, and timestamps indicating when the signal was created and the position activated. This data is essential for understanding the progression and performance of a trailing take profit strategy.

## Interface TrailingStopCommitNotification

This notification signals that a trailing stop has been triggered and a trade has been executed. It provides detailed information about the trade, including a unique identifier, the timestamp of the event, and whether it occurred during a backtest or live trading. You'll find specifics about the trading pair, the strategy used, and the exchange involved.

The notification includes key price points like the entry price, take profit, and stop-loss levels, both original and adjusted by the trailing stop. It also breaks down the cost of the trade and details the position size.

Furthermore, it gives you a comprehensive picture of the trade’s performance with metrics like profit and loss, peak profit, maximum drawdown, and associated prices and costs. It also captures details like the number of entries and partial closes and gives extra notes if provided. Finally, there are timestamps to track when the signal was scheduled, went pending, and when this notification was generated.

## Interface TrailingStopCommit

This describes a trailing stop event within the backtest-kit framework, specifically when a trailing stop mechanism triggers a trade. It contains all the details about what happened during that event. 

The `action` property confirms that this is indeed a trailing stop event. 

The `percentShift` tells you the percentage used to adjust the stop loss.

You'll find the `currentPrice` which is the market price when the trailing stop adjustment occurred, along with the `pnl` representing the total profit or loss for the closed position. Also provided is the `peakProfit` and `maxDrawdown` to see the best and worst performance of the position so far.

The `position` property specifies if it's a long (buy) or short (sell) trade.

Further details include the initial `priceOpen` (entry price), the `priceTakeProfit` and `priceStopLoss` (which might have changed due to trailing), their original values (`originalPriceTakeProfit`, `originalPriceStopLoss`), the `scheduledAt` timestamp of the signal, and the `pendingAt` timestamp when the position became active.

## Interface TickEvent

This describes a standardized way to represent events happening within the trading system, like when a trade is scheduled, opened, closed, or cancelled.  The `TickEvent` object bundles all the relevant details about a single event into one place, making it easier to generate reports and analyze trading activity. Think of it as a comprehensive record of what happened and when, including price data, order details like take profit and stop loss levels, and performance metrics like profit and loss.  Different event types (like "scheduled", "opened", or "closed") have different sets of properties that are relevant to that specific stage of the trading process. It also includes information about averaging (DCA) and partial closes.

## Interface SyncStatisticsModel

This model holds statistics about sync events within your trading system. Think of it as a way to monitor the lifecycle of your signals.

You'll find a detailed list of individual sync events in the `eventList` property, allowing you to examine each one closely.

The `totalEvents` property tells you just how many sync events have occurred.

Separate counts of signal openings (`openCount`) and signal closures (`closeCount`) are also provided, giving you insights into signal activity.

## Interface SyncEvent

This data structure holds all the key information about events that happen during a trading signal's lifecycle, particularly useful for creating reports. It includes details like the exact time of the event (timestamp), the trading pair involved (symbol), which strategy was used (strategyName), and where the trade took place (exchangeName).

You'll find information about the signal itself, such as a unique identifier (signalId) and the specific action that occurred (action). Crucially, it captures pricing information – the current market price, the entry price (priceOpen), and any take profit or stop loss levels, both as initially set and after any adjustments.

The data also tracks information related to dollar-cost averaging (DCA) through entries and partial closes, and provides a performance snapshot, including total profit and loss (pnl), peak profit, and maximum drawdown. It will tell you why a signal was closed (closeReason) and whether the event is part of a backtest. Finally, it holds the time when the signal was created and when it started (scheduledAt, pendingAt) and when the event was actually created (createdAt).

## Interface StrategyStatisticsModel

This model holds the statistics generated during a strategy backtest. It allows you to easily track various actions your strategy took, such as canceling scheduled orders, closing pending orders, or adjusting positions with partial profits or losses. 

You'll find a comprehensive list of events in the `eventList` property, providing details for each action. 

The model also gives you aggregate counts for different event types, like trailing stops, breakeven adjustments, and average buy orders, providing a quick overview of your strategy's behavior. It's like a scorecard summarizing what your strategy did during the backtest.


## Interface StrategyPauseNotification

This notification lets you know when a trading strategy has been paused or resumed. When a strategy is paused, it stops opening new trades, but any existing trades still being managed continue as normal. The `type` property confirms it's a pause notification, while `id` gives it a unique identifier. 

You’ll find essential details like the timestamp of the change, whether it happened during a backtest or live trading, the trading pair involved (like BTCUSDT), the name of the strategy, the exchange used, and the frame used for trading.  Critically, the `paused` property tells you the current pause state – true means paused, and false means resumed – and `createdAt` provides the notification’s creation timestamp.

## Interface StrategyEvent

This object holds all the details about events that happen within your trading strategy, like when a trade is opened, closed, or modified. It's designed to provide a complete record of what's happening so you can understand and analyze your strategy's performance.

Each event includes information like the exact time it occurred, the trading pair involved, the name of the strategy, and the exchange used. You'll also find specifics about the trade itself – whether it's a long or short position, the entry price, and any take profit or stop loss levels that are in effect, showing both the initially set and the currently adjusted prices. 

For strategies using dollar-cost averaging (DCA), it tracks entries and partials, along with the running profit and loss. There’s even a field to add notes, which allows you to record any relevant context about the event. It's particularly useful for backtesting, but also relevant for live trading, as it clearly distinguishes between backtest and live modes.

## Interface SignalScheduledNotification

This notification tells you about a signal that's been set up to execute in the future. It's like a heads-up that a trade is going to happen, whether you're running a backtest or live trading.

Each notification has a unique identifier, a timestamp indicating when the signal was scheduled, and details about whether it's a backtest or live trade.

You'll find details like the trading symbol (e.g., BTCUSDT), the strategy that generated the signal, and which exchange it will be executed on. It also includes the specifics of the trade itself: the position (long or short), target entry price, take profit, and stop loss levels.

Beyond the basics, you'll also get information on potential trailing adjustments to take profit and stop loss, original prices, the number of entries and partial closes, the cost of the trade, and leverage details.

The notification also provides a wealth of performance metrics related to this signal, including total profit/loss (in USD and percentage), peak profit, maximum drawdown, and associated prices and entry counts. Finally, a 'note' field allows for optional descriptive text related to the signal's reasoning.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of information about the trade, including a unique identifier and a timestamp indicating when it happened. You'll find details like whether it's a backtest or live trade, which exchange and strategy were involved, and the direction of the trade (long or short).

The notification outlines crucial price points – the entry price, take profit, and stop loss – along with their original values before any adjustments like trailing stops. It also includes details about any DCA averaging or partial closes that occurred.

Beyond the basic trade details, it delves into performance metrics like total profit and loss (PNL), maximum drawdown, and peak profit.  Each of these metrics is broken down further, offering insights into the price levels and entry counts associated with these key events.

Finally, the notification contains optional notes and timestamps related to the signal’s scheduling, pending, and creation.  It’s a comprehensive record of a trading position's initiation, useful for tracking performance and analyzing trading behavior.

## Interface SignalInfoNotification

This framework provides a way for trading strategies to share informational updates about open positions. When a strategy generates a note – essentially a helpful message about what’s happening – this notification structure carries all the details. It includes everything from the strategy's name and the exchange being used to key details like the entry price, take profit levels, stop-loss orders, and the current market price.

You'll also find performance metrics within the notification, like peak profit, maximum drawdown, and overall profit/loss, broken down into percentages and USD values.  It provides a comprehensive snapshot of the position's history and performance, including data about DCA entries and partial closes.

Each notification has a unique identifier and a timestamp, making it easy to track and reference.  The framework also indicates whether the signal originated from a backtest or live trading environment, helping with analysis and debugging. Finally, there’s a field for custom notes provided by the strategy, along with an optional user-defined ID for linking to external systems.

## Interface SignalInfoContract

This defines how information signals are communicated within the trading framework. When a strategy wants to share a custom message related to an open trade, it uses this structure to broadcast that information. 

The signal includes details like the trading symbol, the name of the strategy generating the signal, the exchange being used, and the frame it's running in. 

You’ll also find important data points like the original signal prices, the current market price, and a note that the strategy can provide. A unique identifier helps link signals to external systems, and a flag indicates whether the signal originated from a backtest or live trading session. Finally, a timestamp and `Date` object pinpoint exactly when the event occurred, representing either the virtual time during backtesting or the real-time clock during live execution. It's essentially a structured notification system for strategies to communicate details about their actions.

## Interface SignalEventContract

This interface describes events related to pending trading signals, specifically when a position is opened or closed. It allows you to track the lifecycle of a signal without needing to monitor the entire signal stream.

The events are triggered during the backtesting or live trading process. They provide information about the signal's action (opened or closed), the trading symbol, the strategy managing the signal, the exchange used, and the timeframe.

You'll receive this data when a new position is initiated or an existing one is closed, covering various scenarios like take-profit, stop-loss, time expiration, user actions, or broker fills.  The `data` property offers comprehensive details about the signal, including entry and exit prices, and potential profit/loss.  When a position closes, the `closeReason` property explains why it was closed. The `currentPrice` indicates the effective price at the time of the event. You also get information regarding whether the event occurred during a backtest or live execution and the exact timestamp of the event.

## Interface SignalData$1

This interface, `SignalData`, helps organize the data used to track performance during backtesting. It describes a single trading signal that has already been closed.

Each `SignalData` object contains details like the strategy that created it, a unique ID for the signal, the symbol being traded (like BTC/USDT), whether it was a long or short position, and the percentage profit or loss (PNL). You’ll also find information about why the signal closed and the times it was opened and closed. Essentially, it’s a snapshot of a completed trade for analysis.


## Interface SignalCommitBase

This defines the common information shared by all signal commit events within the backtest kit. Every signal event, whether it's part of a backtest or a live trading session, will include details like the trading pair symbol, the name of the strategy that generated the signal, the exchange used, and the timeframe involved. 

You'll also find information about whether the event came from a backtest (allowing for historical simulation) or live trading, a unique ID for the signal, and the precise time it occurred.

Beyond that, the event tracks the number of entries and partial closes executed, the original entry price, the signal’s data at that moment, and an optional note for human explanation of the signal’s reasoning. This base structure ensures consistent and understandable reporting across all signal events.

## Interface SignalClosedNotification

This notification signals that a trading position has been closed, whether it was due to hitting a take profit or stop loss, or some other reason. It provides a ton of details about the closed trade, including when it happened, whether it was a backtest or live trade, and which strategy was responsible.

You'll find information about the symbol traded, the entry and exit prices, and the original target prices set for profit and loss. The notification also breaks down the details of any DCA (Dollar-Cost Averaging) used, and any partial closes executed. 

Beyond the basic metrics like profit/loss and cost, it also tracks peak profit and maximum drawdown, offering insights into the trade's performance throughout its lifecycle. Finally, it includes timestamps for key events – creation, pending, and closure – and a reason for why the position was closed.

## Interface SignalCancelledNotification

This notification indicates that a trading signal was cancelled before it could be activated. It provides a wealth of information about the signal and the circumstances surrounding its cancellation, including a unique identifier, the time it was cancelled, and whether it occurred during a backtest or live trading. You'll find details about the intended trade – its direction (long or short), target prices (take profit and stop loss), and original entry price – along with information about costs, leverage, and DCA averaging if it was used.

The notification also includes key performance indicators (KPIs) like P&L, peak profit, and maximum drawdown, although these are typically zero values for a cancelled signal. A `cancelReason` field explains why the signal was cancelled, whether it was due to a timeout, price rejection, or user intervention.  Finally, it contains details about the signal's scheduling timeline, including when it was created and when it was intended to be active, alongside an optional note for added context. This comprehensive data enables you to understand why a signal wasn't executed and identify potential issues with your trading strategy.

## Interface Signal

The `Signal` object holds information about a single trading signal generated during a backtest.

It includes the opening price at which the position was initiated.

You'll also find a record of all entry points, detailing each entry's price, associated cost, and the time it occurred.

Additionally, a history of partial exits is tracked, listing details like whether it was a profit or loss, the percentage of the position closed, the closing price at the time of the partial exit, the cost basis at that time, the number of shares/contracts at the time, and the timestamp.

## Interface Signal$3

This section describes the `Signal$3` object, which is a core component of the backtest-kit framework. It represents a trading signal and tracks key information about a position.

The `priceOpen` property simply holds the initial price at which the position was opened.

The `_entry` array stores a record of each entry made within the position, detailing the price, total cost, and the timestamp of the entry.

Finally, `_partial` logs any partial exits from the position, noting the type (profit or loss), percentage of position closed, closing price, cost basis at the time of closure, the number of units held at closure, and the associated timestamp.

## Interface Signal$2

The `Signal$2` object keeps track of information related to a trading signal's execution. It holds the initial entry price for the position, allowing you to easily reference the starting point of the trade.

You'll also find a record of all entry events, detailing each time the signal triggered a position opening, including the price, cost, and timestamp.

Finally, it tracks any partial exits or adjustments made to the position, noting the type (profit or loss), percentage, current price, cost basis, entry count, and timestamp of each event. This gives you a full history of how the signal’s position evolved over time.

## Interface Signal$1

This `Signal` object holds key information about a trading position. 

It tracks the initial entry price of the trade using the `priceOpen` property, a simple number representing that value.

The `_entry` property is an array that logs every instance of when a position was initiated, detailing the price, associated cost, and the time of the entry.

For partial exits, the `_partial` property keeps a record of when and why a portion of the position was closed, including metrics like the profit/loss type, percentage, current price, cost basis, entry count, and timestamp.

## Interface ScheduledEvent

The `ScheduledEvent` object provides a consolidated view of trading events, whether they were scheduled, opened, or cancelled. It's designed to be a central source of information when you're generating reports about your trading activity.

Each event record includes details like when it happened (timestamp), what type of event it was (scheduled, cancelled, or opened), the trading pair involved (symbol), and a unique identifier for the signal (signalId).

You’ll also find important price points, like the intended entry price (priceOpen), take profit level (priceTakeProfit), and stop loss level (priceStopLoss), as well as their original values before any adjustments.

For events involving multiple entries (like a DCA strategy), the total number of entries and partial closes are included. It also tracks unrealized profit and loss (pnl), and additional information such as reason for cancellation and duration. Finally, the timestamp when the position became active or was created (scheduledAt) is also available.

## Interface ScheduleStatisticsModel

This model holds key statistics related to signals that are scheduled for future execution. Think of it as a report card for your scheduled trading strategies.

It breaks down the data into several categories:

*   **eventList:** A comprehensive list of every scheduled event, including when it was planned, executed, or cancelled.
*   **totalEvents:** The overall number of scheduled events, encompassing all stages.
*   **totalScheduled:** Simply, the total number of signals you’ve scheduled.
*   **totalOpened:** The number of signals that have actually been activated from those scheduled.
*   **totalCancelled:** The count of signals that were cancelled before activation.

The model also calculates important performance indicators:

*   **cancellationRate:** A percentage representing how often scheduled signals are cancelled; a lower rate is generally desirable.
*   **activationRate:** A percentage reflecting how often scheduled signals are successfully activated; a higher rate is better.
*   **avgWaitTime:** The average time (in minutes) that cancelled signals waited before being cancelled.
*   **avgActivationTime:** The average time (in minutes) that signals waited before being activated.

## Interface SchedulePingContract

This describes the data you receive when a scheduled signal is actively being monitored. Think of it as a regular check-in event that happens roughly every minute while a signal is live.

It provides details about the signal itself - the trading pair, the strategy using it, the exchange it's connected to, and the timeframe it applies to. You’ll also see the full data associated with that signal, including things like entry price, take profit, and stop loss levels.

Importantly, it includes the current market price at the time of the ping, and tells you whether this is a backtest (historical data) or live trading situation. The `when` property contains the exact time of the ping, which is critical for understanding the context of the event, especially in backtest mode. This allows you to build custom logic to manage or react to signals based on these recurring updates.

## Interface ScheduleEventContract

This contract helps you keep track of when signals are scheduled and cancelled within the trading framework, without needing to watch every signal. It’s like a notification system specifically for signals that are waiting to be activated or have been removed before activation.

You can use this to know when a signal is being prepared or when one is being discarded – for example, if it timed out or was manually cancelled.

The events are triggered during backtesting or live trading and contain detailed information about the signal:

*   Which symbol it relates to (e.g., BTCUSDT).
*   The strategy that created it.
*   The exchange and timeframe.
*   All the details of the signal itself, like its price levels and position size.
*   If the signal was cancelled, you'll also know why.

The timing of these events depends on whether you're backtesting (based on the candle’s timestamp) or live trading (based on the real-time clock). This allows your code to react to the scheduling or cancellation of signals in a controlled way.

## Interface RiskStatisticsModel

This model holds statistics about risk rejections, helping you understand where your risk management is triggered. 

It contains a complete list of the risk rejection events themselves. 

You’ll also find the total count of rejections, and breakdowns of those rejections organized by the symbols involved and the strategies that caused them. This lets you quickly pinpoint areas needing attention in your trading system.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It's a heads-up that something prevented a trade from happening.

The notification includes details like the unique ID of the rejected signal, when it occurred, and whether it was during a backtest or live trading. You'll see the trading pair involved (like BTCUSDT), the name of the strategy that tried to execute the trade, and the exchange where it was rejected.

Crucially, it explains *why* the signal was rejected with a human-readable reason. Additional information like the number of open positions, the current market price, and details about the proposed trade (entry price, take profit, stop loss) are also provided. 

If a signal had specific notes attached, they'll be included too, along with the creation timestamp of the rejection notification itself.

## Interface RiskEvent

This data structure holds information about signals that were blocked due to risk management rules. 

It's designed to help you understand *why* a trade didn't happen.

Each `RiskEvent` includes details like when the event occurred (`timestamp`), the trading pair involved (`symbol`), the specific signal that was rejected (`currentSignal`), and the name of the strategy and exchange that generated it. You'll also find the current market price at the time of the rejection, how many other positions the strategy held, and a unique ID to track each rejection. A note explains the reason for the rejection, and a flag indicates whether the event happened during backtesting or live trading.

## Interface RiskContract

The RiskContract represents a signal that was blocked due to risk validation. It's a record of when a trading signal couldn't be executed because it violated a defined risk limit.

This record includes vital details like the trading pair involved (symbol), the specifics of the signal itself (currentSignal), which strategy tried to execute it (strategyName), and the timeframe it was associated with (frameName). You'll also find information about the exchange, the current market price, and the total number of open positions at the time.

Each rejection has a unique ID (rejectionId) and a human-readable explanation (rejectionNote) for why it was rejected. A timestamp and corresponding Date object (when) indicate precisely when the rejection occurred. Finally, a flag (backtest) specifies whether the event happened during a backtest or in live trading.

This information is valuable for risk management reports and allows users to understand and monitor rejected trading signals.

## Interface ProgressWalkerContract

The ProgressWalkerContract represents updates on the status of a background process, like when running a large number of trading strategies. It gives you insights into what's happening behind the scenes.

You'll find details like the name of the process, the exchange and frame being used, and the specific trading symbol involved.  The contract shows how many strategies are being considered overall, how many have already been processed, and the percentage of completion. 

Importantly, these progress updates are exclusive to backtesting scenarios.  The `when` property provides a virtual timestamp reflecting the timing of the processed trading data. This isn't actual clock time, but rather a reference point in the backtest timeline.

## Interface ProgressBacktestContract

This interface provides updates on the progress of a backtest. 

It’s designed to give you insights into how far along the backtesting process is, offering details like the exchange and strategy being used, the trading symbol, and the total number of historical data points being analyzed. 

You’ll see the number of data points already processed and a percentage indicating overall completion. 

Importantly, the `when` property tells you the virtual time associated with the current progress point, showing the timeframe being evaluated. This helps you understand the context of the progress event within the backtest timeline.

## Interface PerformanceStatisticsModel

This model holds performance statistics gathered from a trading strategy. It allows you to see how a strategy performed, broken down by different metrics. 

You'll find the strategy's name clearly labeled, along with the total number of performance events that were tracked and the overall time it took to gather those statistics. 

The `metricStats` property organizes performance data into groups based on metric type, providing a more structured view. Finally, a list of all individual performance events, with their raw data, is available for in-depth analysis.

## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies are performing. It's like a detailed log that records important events during the trading process.

Each entry in this log includes the exact time the event happened (both as a numerical timestamp and a readable date), as well as the time of the bar or tick being processed. It also specifies what kind of operation was being done (like order placement or data fetching), how long it took to complete, and which strategy, exchange, and symbol were involved. 

You can use this information to identify where your system might be slow or inefficient. The PerformanceContract also tells you whether the data comes from a backtest simulation or a live trading session.

## Interface PauseContract

This interface describes events that happen when a trading strategy is paused or resumed. 

It provides information about when a strategy stops or starts making trades, allowing you to inform users about these changes.

The event includes details like the trading symbol involved, whether the strategy is now paused or running again, and the exact time of the change. 

You'll also find the name of the strategy, the exchange it's using, and the timeframe of the data.

Finally, a flag indicates whether this event is part of a historical simulation (backtest) or live trading.


## Interface PartialStatisticsModel

This model holds the key statistics about partial profit and loss events during a backtest. It’s designed to give you a clear picture of how often your strategy is realizing gains and losses.

You'll find the raw details of each profit or loss event in the `eventList` property – a complete record of each occurrence. 

The `totalEvents` field tells you the overall number of profit and loss events that happened. `totalProfit` and `totalLoss` specifically count how many times your strategy made a profit and a loss respectively.


## Interface PartialProfitContract

The `PartialProfitContract` represents a notification when a trading strategy hits a partial profit milestone, like 10%, 20%, or 30% profit. This helps you track how your strategy is performing and when take-profit orders are being executed.

Each event includes details about the trade, such as the symbol (e.g., BTCUSDT), the name of the strategy being used, and the exchange and frame where the trade is running.  You’ll also find the original data related to the trade signal and the current price when the milestone was reached. 

Crucially, you can identify if the event came from a backtest (using historical data) or from live trading.  The `timestamp` and associated `when` property give you a precise record of when this profit level was achieved, using either a virtual time in backtests or the actual time in live trading. These events are used by services that build reports and also let you create custom callbacks to react to these events.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit target has been achieved during a trade. It provides a detailed snapshot of the trade's status, including the timestamp, whether it's a backtest or live trade, the trading pair, and the strategy involved.

You'll find key information like the signal identifier, percentage of position closed, current market price, and the trade direction (long or short). It also includes details like the entry price, take profit and stop-loss prices, and original pricing before any trailing adjustments.

Beyond the immediate details, you get a complete picture of the trade's performance. See the cost of entry, leverage used, and details about any DCA (Dollar Cost Averaging) employed.

The notification also extensively reports on profit and loss metrics: total PNL, peak profit, maximum drawdown, and related pricing, percentages, and entry counts. A helpful note field allows for human-readable explanations of the trade’s reasoning. Finally, it includes timestamps related to signal creation, pending status, and notification creation.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It provides a snapshot of the position's performance and details surrounding the partial close.

The `action` property clearly identifies this as a partial profit event. 

You’ll find the `percentToClose` indicating what portion of the position is being closed. It also includes the current market price (`currentPrice`) at the time of the action and the total profit and loss (`pnl`) realized from the closed part of the trade.

To understand the broader context of the position’s lifecycle, you also have access to its peak profit, maximum drawdown, and initial entry details including open price, take profit, and stop-loss levels – both as originally set and as they were adjusted.

Finally, the timestamps `scheduledAt` and `pendingAt` help track when the signal was generated and when the position first became active, respectively.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a specific profit milestone, like 10%, 20%, or 30% gain. It’s triggered during both backtesting and live trading.

The notification includes a lot of details to help you understand what happened. You’ll find information like the unique identifier of the trade, the exact time it reached the milestone, the trading pair involved (like BTCUSDT), and the exchange where the trade occurred. 

It also breaks down the key numbers – entry price, current price, the take profit and stop-loss prices, and importantly, how much profit has been made so far. You'll see a complete picture of the position’s performance, including peak profit, maximum drawdown, and all the relevant pricing details, alongside details on any averaging or partial close strategies employed. Finally, there’s an optional note to provide extra context about the trade.

## Interface PartialLossContract

The `PartialLossContract` describes notifications related to when a trading strategy hits predefined loss levels, like -10%, -20%, or -30% drawdown. These notifications, or events, are triggered when a strategy's losses reach these milestones.

Each event contains details about the trading symbol, the name of the strategy that generated the signal, the exchange and frame used, and comprehensive data about the original signal. You’ll also find the current price at the time of the loss, the specific loss level reached, and whether the event came from a backtest or live trading.

The timestamps help synchronize the data, showing when the loss level was detected – either as a virtual time during backtesting or real-time during live trading. This allows for accurate tracking of strategy performance and potential stop-loss triggers. Events are only sent once for each loss level per signal to avoid duplicates.

## Interface PartialLossCommitNotification

This notification is triggered when a partial position closure happens, whether it's part of a backtest or live trading. It provides a detailed breakdown of what happened, including a unique ID, the exact time of the closure, and whether it occurred during a backtest. You'll find all the key details about the trade itself, like the symbol, strategy name, and exchange involved, along with information about the signal that initiated the action.

The notification gives a complete picture of the position, from the initial entry price and take/stop loss levels to the current market price. It also includes a ton of performance metrics – peak profit, maximum drawdown, and profit/loss percentages – along with the prices and costs associated with those milestones. This allows for in-depth analysis of performance and potential improvements to strategies. You can also see details related to DCA, total entries, partials, and even any notes added to the signal. Finally, timestamps related to the signal’s lifecycle are available for tracking its progression.

## Interface PartialLossCommit

This describes a partial loss event within a trading strategy's backtest. It represents a situation where a portion of an existing position is being closed out.

The `action` property definitively identifies this as a "partial-loss" action. The `percentToClose` tells you what percentage of the position is being closed.

Several properties provide context about the position's performance.  You'll find the `currentPrice` at the time of the partial loss, along with the total Profit and Loss (`pnl`), the highest profit achieved (`peakProfit`), and the maximum drawdown experienced (`maxDrawdown`).

The `position` property indicates whether it’s a long (buy) or short (sell) trade.  Key entry details like the `priceOpen`, and take/stop loss prices are also available, including the original values before any trailing adjustments.  Finally, timestamps (`scheduledAt` and `pendingAt`) indicate when the signal was created and when the position was initially activated.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading position hits a pre-defined loss milestone, like -10%, -20%, or -30% of its initial value. It's a way to track potential losses as a trade progresses.

Each notification includes details such as a unique ID, the exact time the loss level was reached, whether it’s from a backtest or live trade, the trading pair involved, and the strategy and exchange used. You’ll also find information about the trade’s entry price, direction (long or short), stop-loss and take-profit levels (original and adjusted), and detailed profit/loss data, including peak profit and maximum drawdown.

The notification also provides insights into the trade’s history, like the number of entries made (especially important for trades using averaging), the number of partial closes executed, and key pricing information used in profit/loss calculations, including slippage and fees.  There's also a field for optional notes which can provide context about the trade's reasoning.

## Interface PartialEvent

This data structure, called `PartialEvent`, provides a consolidated view of profit and loss milestones during a trade. Think of it as a record of significant points in a trade's life, including when it hit a particular profit or loss level.

Each `PartialEvent` includes details like the exact time it happened, whether it was a profit or loss, the trading pair involved, and the name of the strategy used. You'll also find information about the signal that triggered the trade, the position type (long or short), and current market prices.

Crucially, it stores the initial entry price, take profit target, and stop loss levels, along with the original values set when the signal was first created.  If a strategy uses dollar-cost averaging (DCA), the record also tracks the total number of entries and the original entry price before averaging. 

Other important details include the percentage of partials executed, the unrealized profit and loss at that point, a human-readable explanation for the trade, and timestamps indicating when the position became active and when the signal was initially scheduled. Finally, a flag indicates whether the trade is part of a backtest or a live trading situation.

## Interface OrderSyncOpenNotification

This notification tells you about a new trading position being opened by a strategy, either in backtesting or live trading. It provides a wealth of detail about the trade, including when it happened and a lot of performance metrics.

The `type` confirms this is an "order_sync.open" event. A unique `id` identifies the notification, along with a `timestamp` showing exactly when the position opened. You'll find details about the trading pair (`symbol`), the strategy that triggered the trade (`strategyName`), and the exchange used.

The notification distinguishes between immediate orders (`orderType: "active"`) and orders placed in advance (`orderType: "schedule"`).

Detailed performance information is included, like `pnl` (profit and loss), `peakProfit` (highest profit achieved), and `maxDrawdown` (largest loss incurred). It also breaks down the P&L calculations with entry and exit prices.

You can track how the trade progressed with `priceOpen` (entry price), `priceTakeProfit` (take profit price), and `priceStopLoss` (stop loss price), and view original values before any adjustments.  DCA and partial closing details are also available via `totalEntries` and `totalPartials`.

Finally, `scheduledAt` and `pendingAt` give the timing of signal creation and activation, and `note` offers any relevant human-readable context. The `createdAt` field marks when the notification itself was generated.

## Interface OrderSyncCloseNotification

This notification signals that a trading signal has been closed, whether it was due to a profit target being hit, a stop-loss being triggered, time expiring, or a manual closure. It provides a wealth of information about the trade, including when it was closed, the trading pair involved, and the strategy that generated the signal.

You'll find details about the trade’s performance like profit and loss (both in USD and percentage terms), along with metrics tracking the highest profit and the largest drawdown the trade experienced.  The notification also breaks down how many entries and partials were involved, giving a complete picture of the trading activity.

Furthermore, it details the entry and exit prices, original order prices, costs, leverage applied and the reason behind the signal’s closure.  Finally, timestamps related to signal creation, position activation, and notification generation are also included.

## Interface OrderSyncCheckNotification

This notification provides updates on the status of orders associated with signals, primarily used to confirm that the external order management system is still tracking those orders. It’s sent periodically while a signal is active, acting as a "ping" to check for order synchronization.

The framework limits how often these notifications are sent to avoid overwhelming systems, roughly once every 15 minutes per signal.

Each notification contains detailed information about the order, including:

*   **Key identifiers:**  A unique ID for the notification, timestamp, and signal.
*   **Trade details:** The trading symbol, strategy, exchange, order type, position (long or short), and original prices.
*   **Price and PNL information:** Current market price, effective take profit and stop loss prices, and unrealized profit/loss metrics, including peak profit and maximum drawdown.
*   **DCA and Partial Close details:**  The number of entries and partial closes completed, which are helpful for understanding the execution history.
*   **Timing Information:**  timestamps representing signal creation and when the position transitioned to a pending or active state.
*   **Optional note:** A human-readable explanation of why the signal was triggered.

Essentially, these notifications offer a snapshot of the trade’s current state and performance, which is useful for monitoring and troubleshooting order synchronization and potential discrepancies between the backtest kit and external systems.

## Interface OrderSyncBase

OrderSyncBase provides the core information shared across various order synchronization events within the backtest-kit framework. It essentially acts as a common foundation for understanding what's happening with orders, whether they're being actively managed or scheduled for later execution.

The `type` property clarifies whether the event relates to an active order ("active") or a scheduled order ("schedule"), helping to differentiate immediate actions from those planned for the future.  You'll find details about the trading symbol, the strategy that generated the order, the exchange used, and whether it's part of a backtest or live trading environment.

Crucially, `signalId` and `timestamp` provide unique identification and timing for each event, while `attempt` tracks how many times an order has previously failed to execute – a useful indicator for potential issues.  Finally, the `signal` property contains the complete data associated with the signal that triggered the order.

## Interface OrderStopContract

This event signals that a trading order, initially monitored by the system, has reached a terminal state and will no longer be actively managed. Think of it as a notification that the framework has decided the order is effectively closed or canceled, and no further actions will be taken.

There are two main reasons why this might happen: the order was unexpectedly removed from the exchange (perhaps it was filled, canceled, or liquidated elsewhere), or the system encountered too many temporary errors while trying to confirm the order's status.  Crucially, this event only occurs in live trading environments; backtesting doesn't perform these order checks.

The event provides a wealth of detail about the order, the strategy that generated it, the current market conditions, and the position’s performance to date. You can examine the `reason` property to understand the specific cause of the terminal event and analyze the associated properties to gain insights into the order's lifecycle. Several properties detail the order's entry and exit prices, including original values and any adjustments due to averaging or trailing stops. The event also includes information about the total entries and partial closes related to the trade.

## Interface OrderStopCheckNotification

This notification signals a critical event regarding an order being monitored – essentially, the order's check process has reached a terminal state. It's a rare event, happening only when an order is definitively either deleted or has failed repeatedly. You'll receive this notification once per signal.

The notification provides detailed information about the order and its performance, including the trading symbol, strategy used, exchange, and signal details.  It specifies whether the monitored order was an "active" position (to be closed) or a "schedule" order (to be cancelled).  You'll see one of two reasons for the termination: "deleted" (meaning the order was not found) or "exhausted" (meaning retry attempts were exceeded).

The notification includes extensive data about the order's history, such as its original and effective prices (take profit, stop loss, entry), costs, leverage, total entries/partials, P&L data (current, peak, drawdown), and timestamps.  This data paints a complete picture of the trade’s lifecycle up to the point of termination, allowing for comprehensive post-mortem analysis. There's also additional information on signal creation and pending timestamps, and an optional note field for added context.

## Interface OrderRejectOpenNotification

This notification signals that an order couldn't be placed and is a definitive rejection from the exchange – it's not a temporary hiccup that will retry. It’s specifically triggered when the system definitively fails to place an order, meaning further attempts are pointless.

Each rejection event provides a lot of detail to help understand why the order failed. You'll find information like the unique signal ID, the strategy name, the exchange involved, and a human-readable explanation of the rejection reason.  The notification also includes performance snapshots like P&L, peak profit, and maximum drawdown calculated up to that point.

This event offers a comprehensive view of the position’s performance, including key metrics like entry and exit prices, cost, and multiplier. It also contains details such as original prices and trailing stop-loss settings, plus timestamps for signal creation and activation.  Crucially, these notifications only occur in live environments, not during backtesting, ensuring consistency across different system components.

## Interface OrderRejectOpenContract

This describes what happens when a trading order or scheduled entry can't be executed – it's been definitively rejected. 

Essentially, the system won’t attempt the trade again and the signal that triggered the order is considered used up. 

The `action` property tells you *what* was rejected, either an attempt to open a position or a scheduled entry. 

The `cost` property shows you how much the rejected order would have cost.

## Interface OrderRejectCloseNotification

This notification tells you when a closing order for a position was rejected by the broker – essentially, a forced close didn't go through. It only happens when the closing process fails completely, typically due to a broker error, not temporary issues. This is a live-only event, meaning it won't show up in backtest simulations.

It provides a lot of information about the rejection, including a unique ID, a timestamp, the trading symbol, and the reason the broker gave for rejecting the order. You'll see details about the strategy involved, the exchange, and the specific order that failed.

Beyond the rejection details, the notification also gives you a snapshot of the position's performance up to that point, including profit/loss (P&L), peak profit, maximum drawdown, and related prices and costs. 

You'll find information on entry and exit prices used in P&L calculations, plus details on the original take profit, stop-loss, and entry prices before any adjustments. The notification also outlines the number of entries and partial closes executed.

Finally, it includes key timestamps like when the signal was scheduled, when the position activated, and the reason for the close itself, along with any notes providing extra context.

## Interface OrderRejectCloseContract

When an order to close a position is rejected outright, this object signals that the close was definitively refused. It’s used to indicate that the trading engine is forcefully closing the position due to a problem.

The `action` property is always "signal-close" – it's a consistent marker for this specific type of rejection.

The `closeReason` property explains *why* the close order was rejected; it carries the original reason that prompted the engine to take action.

## Interface OrderRejectBase

This event signifies a permanent rejection of an order by the exchange, indicating that retries are not possible. It’s a definitive "no" from the broker, arising from a situation where the exchange directly refused the order. This isn't due to temporary issues or errors that the system might automatically recover from.

There are two main scenarios where you'll see this event: either an order to open a new position was rejected, or an order to close an existing position failed. The `type` property tells you which kind of order was rejected—either an "active" order (for opening or closing a position) or a "schedule" order (related to placing an order when a signal is initially created).

The event contains a wealth of information about the rejected order, including details like the trading symbol, strategy name, exchange name, and the specific reason for the rejection –  which you can find in the `message` field. It also provides a snapshot of the position's performance at the time of rejection, encompassing metrics like P&L, peak profit, and maximum drawdown.

Importantly, these rejection events *only* occur in live trading environments; they don't happen during backtesting. The `backtest` property is always false for these events. Also, the `signalId` is crucial – it guarantees that a specific signal will never trigger another order attempt after this rejection.

## Interface OrderOpenContract

This event, called `OrderOpenContract`, signifies that a previously placed limit order has been filled, allowing the trading framework to enter a position. It's particularly useful for confirming order executions with external systems, like order management tools or audit logs. 

Think of it as a confirmation that your limit buy or sell order was accepted and processed by the exchange. The event provides a wealth of information including the price at which the order was filled, the current market price, and details about the position’s performance so far – like peak profit, maximum drawdown, and overall cost. 

You'll also find details about the original take profit and stop-loss prices, before any adjustments were made, and information about how many entries were made if you’re using a dollar-cost averaging strategy, alongside any partial exits that occurred. The `scheduledAt` and `pendingAt` timestamps track the signal creation and position activation times, offering a complete timeline of the order's journey.

## Interface OrderFillOpenNotification

This notification provides confirmation that a trade has been executed or a resting order has been placed – it's essentially the final word on whether your strategy's instructions were followed by the exchange. It only appears after the system is absolutely sure the order has gone through, making it a reliable signal.

Think of it as a late-arriving message confirming what you already hoped had happened.

The notification includes a wealth of data about the trade including the exact time of confirmation, the trading pair, the strategy responsible, and a unique identifier for the signal.

It also provides detailed performance metrics for the position, such as realized profit/loss, peak profit, maximum drawdown, and the prices involved. You'll find data on entry and exit prices, the number of entries made, and even the initial cost of the position. 

Critically, this notification *only* happens for live trades – it won't appear during backtesting. It represents a concrete confirmation of your strategy's actions in the real world.

## Interface OrderFillOpenContract

This object represents a confirmation from your broker about a new position being opened or an order to open a position being placed. It tells you exactly what happened: either a trade was executed ("signal-open"), or an order to trade was sent to the market ("schedule").

The `action` field tells you the type of confirmation.  The `cost` field indicates the total amount of money spent to establish this position. Essentially, it’s a record of the financial impact of initiating a trade.

## Interface OrderFillCloseNotification

This notification confirms that a trading order has definitively closed on the exchange—it's the final confirmation after a successful execution. It's only received when the trade is truly finished, and won’t appear for temporary or failed attempts.

Here's a breakdown of what you'll find in this notification:

*   **Key Details:** You'll see the trade's unique ID, when it closed, the strategy that initiated it, and the exchange where it occurred.
*   **Performance Metrics:** Detailed information about the trade’s performance is provided, including profit and loss (PNL) figures, peak profit, maximum drawdown, and entry/exit prices.
*   **Order Information:** It outlines the order type, the number of attempts it took to close, and the prices used for the trade.
*   **Trade Context:** You'll find the trade's direction (long or short), the initial entry price, and any original take profit or stop-loss prices that were set.
*   **Additional Data:** It includes details about the cost of the position, leverage applied, the number of entries (for averaging), and the reason for the closure.  A timestamp indicates when the signal was initially created and when the position was activated.



This notification offers a comprehensive snapshot of a completed trade's lifecycle and results.

## Interface OrderFillCloseContract

This data structure represents when a trading position is closed, and confirms that the broker has executed the closing order – whether that's due to a take profit, stop loss, a time-based rule, or a manual closure.  It’s a notification that the exit order has been fulfilled. The `action` property clearly identifies this as a closing event. The `closeReason` provides details about *why* the position was closed, offering valuable insight into the trading logic that triggered the exit.

## Interface OrderFillBase

This document describes the `OrderFillBase` event, a crucial notification within the backtest-kit trading framework. It represents a confirmed order execution—meaning the broker has actually placed the order on an exchange.  It's important to understand that this isn't fired for order attempts or rejections; it only happens when an order is truly confirmed by the broker.

This event provides extensive details about the trade, including the trading pair symbol, the strategy that generated the signal, the exchange used, and the timeframe. The `type` property distinguishes between active (opening or closing a position) and scheduled (initial placement of a resting order).  You’ll also find information like the signal identifier, the exact time of confirmation, and details about the market price and profit/loss snapshots at the time of execution.

Furthermore, the event includes valuable data points related to the order’s lifecycle, such as the number of previous failed attempts, the original and trailing-adjusted stop-loss and take-profit prices, and the number of entries and partial closes.  The `backtest` property is always false, indicating this event only occurs in live trading environments. The event's timestamp is always the time the broker confirmed the order, offering a reliable record of the trade's execution.

## Interface OrderContinueContract

This event signals that the trading framework is continuing to monitor an order – it hasn't been confirmed as filled or cancelled. It's a recurring notification you'll receive while an order remains active, especially in live trading where real-time checks are performed. The `type` property tells you whether it's related to an active position ("active") or a pending order ("schedule").

The `attempt` value is key: a zero value means the order check was successful, resetting any error counters. Values greater than zero indicate temporary issues during the check, but the framework is still assuming the order is open and continuing to monitor it; the higher the number, the more consecutive checks have failed before tolerance is reached.

The event provides a wealth of information about the order and its context, including details about the trading pair, strategy, exchange, timeframe (which is empty during live trading), and a unique identifier for the signal that triggered the order. You’ll also find data on the order's performance, such as PnL, peak profit, drawdown, entry and exit prices (original and adjusted for averaging or trailing), and timestamps related to its lifecycle. This allows for deep analysis of order behavior and performance in real-time. Remember that this event only occurs in live trading – backtests don't perform these checks.

## Interface OrderContinueCheckNotification

This notification lets you know about the ongoing health of an order – think of it as a continuous check-up. It's triggered when an order check isn't immediately resolved, meaning the order is still open or a temporary problem was dealt with, and monitoring continues.

The notification provides a ton of details about the order and its performance, including the trading symbol, strategy name, and the direction of the trade (long or short). You’ll find information about the original and current prices, stop-loss and take-profit levels, and how the position has been performing so far – including profit/loss, peak profits, and maximum drawdowns. 

It also includes data like the number of entries and partials, total cost and multiplier, and creation timestamps, which all contribute to a comprehensive view of the order's status and history. The notification is throttled to avoid overwhelming your system. Remember, these checks are only for live orders – they aren’t used in backtesting.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether it was because of a profit target, a stop-loss, time expiry, or a manual action. It’s designed to help systems outside of the core trading engine stay in sync with what’s happening.

Think of it as a notification that a trade is finished, and you can use it to update external systems that track orders, calculate profit and loss, or keep audit logs.

The event provides a wealth of information about the closed position, including the current market price, the overall profit and loss, the highest profit reached, the largest drawdown, and the original entry and exit prices – all adjusted for things like averaging and trailing stops. You’ll also find details like when the signal was created, when the position was activated, and the reason for the closure. Finally, it indicates if any averaging or partial closures occurred during the trade's lifecycle.

## Interface OrderCheckContract

This event, called "signal-ping," is a crucial check performed by the framework to ensure your orders are still active on the exchange. It's like a periodic confirmation that your buy or sell orders haven’t been filled, canceled, or liquidated unexpectedly. 

The framework sends this ping during live trading, but *not* during backtesting because there's no real exchange connection then.

Essentially, it asks your broker if the order related to an open or pending signal is still present on the exchange. The `type` property tells you whether you're checking an active (open) position or a scheduled (pending) order.

When you receive this ping, you need to respond.

*   If the order is still good, just acknowledge it, and the framework keeps monitoring.
*   If the order is gone (filled, canceled, liquidated), you *must* report it immediately – this stops the framework from endlessly retrying.
*   Transient errors, like network glitches, are tolerated for a few attempts before the framework assumes the order is gone.

The event provides a wealth of information about the signal, including its details, market conditions, realized profit and loss, and the status of any take profit and stop loss orders. The `attempt` property keeps track of how many times the check has failed recently, so you know how urgently you need to respond.

## Interface MetricStats

`MetricStats` provides a collection of statistics related to a particular performance measurement. Think of it as a report card for a specific metric within your trading system.

It tracks how many times a certain event occurred (the `count`), and gives you details about its timing. 

You'll find information about the total time spent, the average time, and the fastest and slowest occurrences. 

It also includes measures like the standard deviation and percentiles (like the 95th and 99th percentile), to help you understand the distribution of those times and identify any unusual patterns.

Finally, the stats will also include wait times which are useful to find out how long events are queued up.

## Interface MessageModel

This describes a message within a conversation handled by a large language model. It's designed to hold all sorts of interactions, from the initial instructions to user prompts, the model's responses, and even when tools are used.

Each message has a `role` which clarifies who sent it – whether it's the system providing instructions, a user making a request, or the assistant answering. The `content` is the actual text of the message, and sometimes there's additional `reasoning_content` that explains how the model arrived at its answer.

If the assistant is calling a tool, you’ll find `tool_calls` detailing that interaction and a `tool_call_id` to identify which tool call this message relates to. Finally, messages can also include images, represented in several formats like Blobs, raw bytes, or base64 strings.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading backtest. It essentially tracks the worst peak-to-trough declines experienced.

The `eventList` property gives you access to a detailed chronological record of each drawdown event, presented in reverse order (most recent first).  Think of it as a complete log of the worst drops.

The `totalEvents` property simply provides a count of how many maximum drawdown events were identified.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown event encountered during trading. It captures key details about the position that experienced the drawdown, including when it occurred (timestamp), which asset was involved (symbol), and the name of the strategy and signal responsible. You'll find information about the position’s direction (long or short), its total profit and loss (pnl), the highest profit ever achieved (peakProfit), and the magnitude of the drawdown itself (maxDrawdown). Additional details like the price at which the drawdown was recorded, the entry price, and any set take profit or stop loss levels are also included. Finally, it indicates whether the event happened during a simulated backtest.

## Interface MaxDrawdownContract

This contract provides information about when a maximum drawdown is reached for a trading position. It's a way for the trading system to tell you the biggest loss experienced by a position, along with important details about the trade.

You'll find details like the trading symbol, the current price, and the exact time the drawdown occurred. The contract also includes information about the strategy, exchange, and timeframe involved, as well as the signal that triggered the position.

Importantly, it tells you whether this drawdown event happened during a backtest or in live trading. This allows you to handle the information differently depending on the context.  By monitoring these drawdown events, you can implement risk management strategies and potentially adjust your trading approach.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance, offering a wide range of statistics to analyze your strategies. It tracks everything from individual trade events to overall portfolio metrics, giving you a complete view of your trading activity.

You'll find information about the total number of events, including wins, losses, and closed trades. Key performance indicators like win rate, average profit and loss, and total profit are all calculated.

Beyond basic profitability, the model dives into risk-adjusted performance with metrics like Sharpe Ratio, Sortino Ratio, and Calmar Ratio, helping you understand the efficiency of your trading. It also offers insights into trade duration, volatility (standard deviation), and even analyzes the pressure from buyers versus sellers in the market.

Finally, trend analysis and confidence levels give you a broader understanding of the market context behind your trades, allowing for more informed decision-making. Keep in mind that many of these values can be null if the calculation is unreliable due to market conditions or data issues.

## Interface InitialDispatchScheduleContract

This describes the data you get when a resting order is first created – that’s an order that waits for a specific price to be reached. Think of it as the initial information package.

The `type` will always be "schedule," confirming it’s a resting order.

The `signal` property holds all the details about the scheduled signal that triggered this order, providing a snapshot of the market conditions at the moment the order was placed. This gives you a full picture of *why* this order is waiting.

## Interface InitialDispatchContractBase

This interface defines the common information shared between different ways of starting a trade execution. It essentially holds the environment details relevant for a trade, like the trading pair (e.g., BTCUSDT), the name of the strategy making the decision, and where that strategy is running.

You’ll also find information about whether this is a backtest (running against historical data) or live trading, the current market price, and the exact time the event occurred. 

The `when` property is particularly important to understand – in backtests, it represents the time of the candle being analyzed, while in live trading, it's the actual real-time clock time of the event. It provides context for the trade’s decisions, giving strategies the data they need to operate correctly.

## Interface InitialDispatchActiveContract

This describes the initial information sent when a trading position first becomes active – essentially, when an order is filled and the system starts tracking it. It's a notification that a position is now open and being monitored.

The message confirms the position type is "active."

It also includes the complete set of data for that position at the time it became active, which is represented by the `IPublicSignalRow` object. This signal row contains all the details about the trade, like price, quantity, and other relevant factors.

## Interface InfoErrorNotification

This component deals with notifications about errors that happen during background processes, but aren't critical enough to stop everything. Think of it as a heads-up about something that needs attention. 

Each notification has a specific type, a unique ID to track it, and a detailed error object containing information like a stack trace and extra data to help diagnose the issue. A human-friendly message explains the problem, and a flag confirms these notifications originate from the live environment, not the backtest itself.

## Interface IdlePingContract

This defines how the backtest-kit framework communicates when a trading strategy isn't actively making decisions. It's like a heartbeat signal, letting you know the strategy is in an idle state, meaning it's not currently responding to any trading signals. This "IdlePingContract" event includes important details like the trading pair involved (e.g., BTCUSDT), the name of the strategy, and the exchange it's operating on. 

You'll also find the current market price at the time of the ping, whether the execution is a backtest (historical data) or live trading, and a timestamp for accurate timing. The timestamp represents the time of the ping – in live trading it's the current time, and in backtesting, it's the timestamp of the candle being analyzed. You can subscribe to these events to monitor the lifecycle of your strategies and understand their periods of inactivity.

## Interface IWorkerRunParams

The `IWorkerRunParams` interface defines the configuration options for running a worker process. Think of it as a way to tell the backtest-kit framework how to set up and execute your trading strategies. 

You don't have to provide every setting – most properties have reasonable defaults, so you can just pass the settings you want to change. Even an empty object works fine!

The `workerPath` specifies where the worker's code lives, which is usually the main script of the process.  If you don't provide it, the framework will automatically use the path to the current script being executed.  The `workerName` selects which specific trading strategy or worker to run; if you skip it, the first available one will be used.

## Interface IWorkerPaperArgs

This interface defines the arguments needed to run a worker process that simulates live trading without actually placing orders. It's specifically used when you want to test your strategies in a "paper trading" environment. 

The `paper` property, set to `true`, signals that the live pipeline should operate in this paper trading mode, allowing you to observe performance and behavior without risking real funds. Think of it as a dress rehearsal for your trading system. All symbols processed by a single worker will share the same underlying child process for efficiency.

## Interface IWorkerLiveArgs

The `IWorkerLiveArgs` interface defines the settings for a worker that processes live market data. Essentially, it's used when you want your backtest-kit to connect to a live data feed and simulate trades in real-time. This setup runs a pipeline for each symbol you're tracking, all within a shared child process for efficiency. The `live` property, set to `true`, signals that this worker should operate in live mode.

## Interface IWorkerCallbacks

The `IWorkerCallbacks` interface lets you hook into the lifecycle of a worker process, giving you opportunities to influence its setup. Think of it as a way to subtly adjust how a worker gets ready for action.

If you need to load extra configuration or schema definitions *before* the worker fully initializes, the `onWaitForInit` callback is your friend.  It’s triggered just before the worker pauses waiting for everything to be ready, giving you a chance to load those resources in the background. This avoids slowing down the initial startup.

## Interface IWorkerBacktestArgs

This defines the arguments used when running a backtest in the background, essentially letting the system handle the process for you. 

The `backtest` property simply confirms that this is a backtest operation.

The `frameName` property specifies the timeframe for the backtest. If you have multiple timeframes available, you'll need to tell the system which one to use here; otherwise, it'll pick one automatically.

The `cache` property allows you to pre-load candle data into memory. Enabling this can speed up the process, especially if you're using a custom data source; however, be aware it can impact performance and resources.


## Interface IWorkerArgs

The `IWorkerArgs` interface defines the core information needed to kick off a backtest worker. Think of it as the initial setup instructions for a simulation run.

It’s designed to be straightforward – you specify a worker identifier, the name of a strategy you want to test, and the exchange you'll be using.

The symbol list you're trading isn't included here; it's provided separately when the worker actually starts running.

If you only have one strategy and one exchange registered, you don't need to specify those – the framework will automatically use them. But if you have multiple, you'll need to tell it exactly which ones you want.

You can also provide callbacks to be notified about different stages of the worker's lifecycle.

## Interface IWarmCandlesParams

This object defines the information needed to fetch and store historical candle data. Think of it as a blueprint for downloading past price charts. It specifies the trading pair (like BTCUSDT), the exchange where the data comes from, the time frame of the candles (like 1-minute or 4-hour), and the start and end dates you want to cover. This data is often pre-loaded before running a backtest to ensure the backtesting process has all the necessary historical information.


## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy within a backtest comparison. It holds key information about the strategy's performance.

You’ll find the strategy's name here, along with a detailed set of statistics summarizing how well it performed – things like profit, drawdown, and Sharpe ratio. 

A key value, the 'metric,' represents the specific measurement used to compare strategies; it might be null if the strategy wasn’t valid for that metric. Finally, the 'rank' indicates the strategy’s position relative to other strategies in the comparison, with the best strategy ranked as 1.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B tests for different trading strategies. Think of it as a blueprint for running experiments to see which strategy performs best.

You'll give it a unique name for identification and can add a note to explain what the test is for.

It specifies the exchange and timeframe to use for all the strategies in the test, ensuring a level playing field.

You also list the names of the strategies you want to compare against each other; these strategies need to be previously registered with the framework.

The schema lets you choose a metric like Sharpe Ratio to optimize, helping you determine the best strategy based on risk-adjusted returns.

Finally, you can optionally provide callbacks for different stages of the testing process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered when backtest-kit compares different trading strategies. It contains key details about the trading environment, including the specific financial symbol that was tested, the exchange used for data, the name of the strategy comparison process (the "walker"), and the timeframe used for the backtest. Think of it as a central record of everything that happened during a strategy comparison run.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtesting process. Think of it as a way to get notified and potentially react to what's happening as the system evaluates various trading strategies.

You'll receive a notification when each strategy begins (`onStrategyStart`), when it finishes (`onStrategyComplete`), and if it encounters any errors (`onStrategyError`). The `onStrategyComplete` callback also gives you access to performance statistics and a metric value calculated during the backtest. 

Finally, when all strategies have been evaluated, the `onComplete` callback will fire, providing a summary of the overall results. This allows you to observe and potentially influence the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface describes a specific action queued within the backtest-kit framework, relating to a trailing take commit strategy. Think of it as a record of an instruction to adjust a trade's stop-loss based on a percentage shift from a defined price. The `action` field clearly identifies this as a "trailing-take" action.  The `percentShift` specifies the amount of the percentage shift to be applied when moving the take profit level. Finally, `currentPrice` holds the price at which the trailing was initially established, providing context for the calculation.

## Interface ITrailingStopCommitRow

This interface represents a single action that needs to be taken related to a trailing stop order. Think of it as a record of a specific trailing stop adjustment that's been queued for execution.

It includes details like the type of action being performed ("trailing-stop"), the percentage change that triggers the stop, and the price at which the trailing stop was initially set.  This information is crucial for accurately recreating and verifying a trading strategy's behavior during backtesting.

## Interface ISweepTrade

The `ISweepTrade` interface defines the structure of a single trade executed within the backtest-kit framework. Each trade has a unique identifier linked to the original idea that prompted it, along with the trading symbol involved.  It also tracks the author of the idea, allowing for easy analysis of performance by individual strategy contributors.

The interface records key details about the trade’s lifecycle, including its entry and exit timestamps, and the reason for its closure. You'll also find the actual holding time of the trade, calculated in minutes. Crucially, it stores the percentage profit or loss (PnL) achieved after considering trading fees.

Finally, the `absorbedIdeas` property provides a valuable record of any other ideas that were 'absorbed' by this trade – essentially, indicating which ideas were superseded by this one. This allows for a detailed audit trail of how the strategy reacts to multiple signals over time.

## Interface ISweepTrack

The `ISweepTrack` represents a detailed record of an author's trading performance under a specific, defined rule set. Think of it as a report card for a trader's strategy, focusing on continuous data rather than simple pass/fail judgments.

Each track includes the crucial parameters of the rule being tested – the holding period (`holdMinutes`), the profit-locking level (`profitLockPercent`), the stop-loss level (`hardStopPercent`), and the trailing take percentage (`trailingTakePercent`) – alongside the author's login.

The track then quantifies the author's activity with key metrics like `ideas` (total directional trading attempts), `hits` (successful trades where the lock or trailing arm triggered before the stop), and `hitRate` (the percentage of successful trades). These raw numbers offer a continuous view of performance, allowing users to filter and assess trust levels without arbitrary thresholds. It captures how the author performs across various conditions defined by the rule.

## Interface ISweepSchema

This schema defines how a sweep, which is a set of trading configurations, is registered and executed. Each sweep needs a unique name for identification.

It also specifies which exchange will be used to fetch historical candle data for creating trading profiles; it's important that the data comes in complete sets.

You can customize the grid axes – these are the parameters that control how trades are placed and managed – by overriding default values. Freezing an axis with a single value prevents it from being adjusted during the sweep.

The order in which sweep results are ranked and reported can be defined.  Callbacks provide optional functions that can be triggered at different points in the sweep's lifecycle; these don't impact the core trading logic but can be used for logging or other actions.


## Interface ISweepResult

The `ISweepResult` object holds the final outcome of a trading simulation. It bundles together key performance indicators and details about the simulation's progress.

You'll find information like the trading symbol involved, the total number of ideas considered, and how many of those were directional trades.

It also tracks how many profiles were created using candle data and how many were cut short due to data limitations.

The result includes statistics about trade holding times, offering insight into the duration of positions held. Specifically, it provides the average holding time and the 95th and 99th percentile holding times, which can highlight unusually long holds.

Finally, the `reports` property contains a comprehensive evaluation of each grid point, using a single "profit-before-stop" metric, and outlines the top-performing points, along with performance data attributed to individual authors.

## Interface ISweepPointReport

This report provides a detailed summary of performance for a single grid point within a backtest. It consolidates key metrics related to trades executed at that specific grid level.

The report identifies how many trades were skipped due to author availability. It presents overall profitability, calculating the total and average profit percentage across all trades executed at the point. Key performance indicators like win rate, profit factor, and drawdown are also included, providing insight into the risk-reward profile.

Furthermore, the report delves into trade durations, offering average holding times and percentile values for how long positions were held. Risk-adjusted return measures like the Calmar and Recovery factors, along with Sharpe and Sortino ratios, offer a comprehensive view of performance relative to risk. A breakdown of trade exit reasons helps understand the common factors leading to position closures. Finally, a complete list of the individual trades at that point is provided, enabling detailed examination of why a particular profit or loss occurred.

## Interface ISweepParams

The `ISweepParams` object holds all the settings needed for a sweep run. It includes a logger to help you track what's happening during the process – think of it as a helpful observer. 

You'll also find the grid axes configuration, which defines how your test parameters are arranged and explored, ensuring all necessary defaults are in place. Finally, the report order dictates how the results will be presented, with default criteria automatically applied.

## Interface ISweepMetricReport

This report holds the results for a single pass of your backtesting grid. It summarizes how each combination of parameters performed, specifically looking at profit before the stop-loss.

The `reports` section gives you a detailed breakdown of each grid point, ranked from best to worst based on a default ranking like Sharpe ratio.

The `best` section highlights the top performers according to four different ranking criteria.  If your grid didn’t generate any results, this section will be empty.

Finally, the `tracks` provide insights into the rules and parameters used by the system. This section is compact and self-contained, allowing you to quickly identify and analyze trends without needing to combine multiple data points. It gives you the raw performance data (hit rate, ideas, etc.) related to a particular rule combination so you can evaluate which rule authors to trust.

## Interface ISweepIdeaProfile

ISweepIdeaProfile represents the performance of a trading idea across a series of candles. It provides a detailed picture of how the idea behaved, including its entry price, the candle data it experienced, and various metrics about its trajectory. Think of it as a historical record of an idea's journey from its inception to its conclusion.

This profile includes information like when the idea was entered, the price at entry, and the complete sequence of candles that influenced its outcome. Critically, these profiles are used for evaluating the idea's success without needing to re-analyze the candle data.

Several key metrics are calculated and stored within each profile. These diagnostics – such as whether the idea was ultimately successful (hit), the maximum favorable and adverse price movements (MFE/MAE), and a measure of how much the price shook out before a positive move (shakeout) – give a complete assessment of the idea's performance across the entire timeframe. A median movement percentage indicates the typical direction of price movement relative to the entry price, offering another insight into the idea's behavior.

## Interface ISweepIdea

This describes a single trading idea – think of it as a public prediction made by someone about a particular asset. Each idea has a unique ID, a timestamp indicating when it was published, and specifies the trading pair (like BTCUSDT) it relates to. It also states the direction the author believes the price will move and identifies the author's username. Importantly, when running simulations, the entire idea is processed for each time step (candle), not individual grid points within a strategy.

## Interface ISweepGridPoint

This describes a single point on a grid used for trading strategies. 

Each point defines specific rules for managing a trade. 

You'll find settings to determine when a trade should be stopped with a hard stop loss, how a trailing stop loss should work, and the maximum time a position should be held. 

It also includes a mechanism for profit locking, which allows you to secure profits once the price reaches a certain level. If the price pulls back, the position will be exited at the locked profit level. Setting this to zero disables the profit lock feature.

## Interface ISweepGridAxes

The `ISweepGridAxes` defines the ranges of values used for key trading parameters like hard stops, trailing takes, hold durations, and profit locks. Think of it as setting up the boundaries for how a trading strategy will react to different market conditions.

Each property – `hardStopPercent`, `trailingTakePercent`, `holdMinutes`, and `profitLockPercent` – represents a different way to control the trade. These values aren’t arbitrary; they're carefully chosen to tune the strategy's behavior concerning risk management (hard stops), profit taking (trailing takes and profit locks), and turnover rate (hold durations).

The 'Ignored' sections clarify situations where a particular axis might not be actively used during a trade, and why those conditions are documented. For example, a trade might ignore the trailing take if the price doesn't reach a certain level.

The holdMinutes property is particularly important as it dictates both the maximum time a trade can stay open and the time window used for assessing performance. The profitLockPercent creates a zone where the strategy can harvest liquidity without prematurely stopping a potentially profitable trade. Ultimately, the ISweepGridAxes is the foundation for a robust and customizable trading framework.

## Interface ISweepCallbacks

This interface, `ISweepCallbacks`, provides a way to monitor the progress of a backtesting simulation. It's essentially a way to get real-time updates on what's happening behind the scenes, similar to the information you’d see printed to the console. 

You can subscribe to callbacks to track the progress of different stages, like processing ideas or grid points. The `onProgress` callback lets you know how many items have been processed within a stage and how many are left to go. 

Specific events trigger other callbacks – you’ll receive an `onIdeas` callback when the simulation receives ideas, and an `onProfiles` callback when all profiles have been built. 

The framework also provides notifications when author tracks are trained for grading rules, when a grid point is evaluated, and when a ranking is computed. Finally, the `onDone` callback signals that the entire simulation has completed, providing the final result. By using these callbacks, you can build custom visualizations or perform actions based on the simulation's real-time status.

## Interface ISweepBest

The `ISweepBest` interface represents the top result for a specific ranking criterion within a trading simulation. It focuses solely on identifying the best result based on that criterion and providing access to the full report associated with it.

Think of it as a pointer to the detailed information about the winning trade— the trades themselves and other track details aren’t included directly within `ISweepBest` to avoid unnecessary repetition; they’re available in the linked report. The `criterion` property tells you which ranking rule determined this result, while the `report` property gives you access to the complete sweep point report, which is essential for understanding the context of this winning result. If no results were found for a particular criterion, the report will be null.


## Interface ISweepAbsorbedIdea

This describes a situation where a trading idea couldn't be acted upon because a previous trade from the same author was already using that slot. Think of it as a signal that got sidelined due to existing commitments.

The information includes the unique ID of the suppressed idea and, crucially, the author who created it. This allows for quick analysis of an author’s trading history without needing to combine separate data streams. It essentially links the absorbed idea directly to the author’s previous trade.

## Interface ISweep

The `ISweep` interface provides a simple way to execute a complete trading simulation, or "sweep." You provide a stock ticker symbol and a list of trading ideas, and the sweep client will handle the rest. It automatically filters ideas based on predefined profiles, evaluates them based on a scoring system, and then ranks them. The result of running a sweep includes detailed information about how each idea performed.

## Interface IStrategyTickResultWaiting

This represents a tick result indicating that a previously scheduled trading signal is currently waiting for the price to reach its entry point. You'll receive this type of result repeatedly as the system monitors the signal.

It contains essential information for tracking the signal's status and context, including the signal itself, the current price being monitored, the strategy and exchange names, and the timeframe being used. 

You’ll also find details like the symbol being traded, progress towards take profit and stop loss (which are always zero in this waiting state), unrealized profit and loss (a theoretical value for the position before activation), whether it's a backtest or live trade, and a timestamp of when the result was generated. This allows you to monitor the signal's progress and understand its environment.


## Interface IStrategyTickResultScheduled

This interface represents a specific type of tick result within the backtest-kit framework. It indicates that a trading signal has been generated and is currently "scheduled," meaning it's waiting for the price to reach a certain point before execution.

Think of it as a notification that the strategy recognized a potential trade and is patiently waiting for the market conditions to align. 

The data provided includes details like the strategy's name, the exchange used, the timeframe, the trading pair, the price at the time the signal was generated, and whether the event occurred during a backtest or in a live trading environment. This information is valuable for monitoring strategy performance and debugging. A timestamp marks precisely when the scheduled signal was created.


## Interface IStrategyTickResultOpened

This data represents the outcome when a new trading signal is generated and successfully saved. 

It tells you that a signal has been created, and provides key details about the signal itself and the circumstances surrounding its creation. 

You'll find information such as the signal's ID, the name of the strategy that generated it, the exchange and timeframe involved, and the symbol being traded. 

Crucially, it includes the current price at the time the signal was opened, and indicates whether the event occurred during a backtest or in a live trading environment. This information is valuable for monitoring, debugging, and analyzing the performance of your trading strategies.


## Interface IStrategyTickResultIdle

This interface represents a specific type of event within the backtest-kit framework: an "idle" state. It signifies that the trading strategy isn't currently generating any buy or sell signals.

The data included with this idle event helps you understand the context of the inactivity. You’ll find details like the strategy’s name, the exchange it’s connected to, the timeframe being used, and the trading pair involved.  The current price at the time of the idle state is also recorded.

Crucially, it indicates whether the event occurred during a backtest or a live trading session. A timestamp provides a precise record of when this idle state began.  The signal itself is explicitly null to confirm there's no active trading instruction.

## Interface IStrategyTickResultClosed

This interface describes the result you receive when a trading signal is closed, providing a comprehensive view of what happened. It bundles together key details like the reason for the closure – whether it was due to a time limit, hitting a profit or loss target, or a manual close – alongside the final price at which the trade was settled. 

You'll also find a breakdown of the profit and loss, taking into account any fees or slippage encountered during the closing process. The information includes identifying details like the strategy name, exchange, timeframe, and trading symbol, allowing for easy tracking and analysis.  A flag indicates whether the event occurred during a backtest or in live trading, and a unique ID is assigned for closes initiated directly by the user. Finally, the timestamp of the result's creation is recorded, linking it to the candle or execution event that triggered it.

## Interface IStrategyTickResultCancelled

This interface describes a scenario where a planned trading signal was cancelled before a trade actually occurred. Think of it as a notification that a signal was scheduled to trigger a trade, but something happened – perhaps the signal itself wasn't activated, or a stop-loss was hit before the trade could even be placed.

The `action` property simply confirms this is a cancellation event.

You’ll find the details of the cancelled signal under the `signal` property.

The `currentPrice` represents the price the market was at when the cancellation took place.

The `closeTimestamp` tells you precisely when the cancellation happened, in milliseconds since the epoch.

Various tracking details like the `strategyName`, `exchangeName`, and the `frameName` (like "1m" or "5m") are also included, providing context for the cancellation.

The `symbol` identifies the trading pair involved, for example, "BTCUSDT".

The `backtest` flag indicates whether this event happened during a simulated backtest or in a live trading environment.

The `reason` property explains why the signal was cancelled, offering insights into the event's cause.

If a user manually cancelled a signal using a cancellation ID, it's stored in the `cancelId` property.

Finally, `createdAt` tracks when this particular cancellation record was generated.

## Interface IStrategyTickResultActive

This interface describes the result when a strategy is actively monitoring a signal, typically waiting for a take profit (TP), stop loss (SL), or time expiration. It provides detailed information about the signal being monitored, including the current price being watched and the strategy's name and origin. You'll also find data about the trading symbol, percentage progress towards TP and SL, and the current unrealized profit and loss (PNL) of the position, accounting for fees and slippage.  Knowing if the data is from a backtest or live trading environment is also included, along with timestamps for tracking and internal processing. The `action` property clearly indicates that the strategy is currently in an "active" state.

## Interface IStrategySchema

This interface outlines the structure for defining a trading strategy within the backtest-kit framework. Think of it as a blueprint for how your strategy will generate trading signals.

Each strategy needs a unique identifier, and you can add notes to help document its purpose.  You can also specify a minimum time interval between signals, helping to control how often your strategy analyzes the market.

The core of the strategy is the `getSignal` function, which takes market data (symbol, timestamp, and current price) and determines whether to generate a buy or sell signal.  This function can also incorporate price targets, allowing signals to be scheduled and triggered when a specific price is reached.

You can also set up callbacks for events like trade opening and closing.  Furthermore, it allows for associating risk profiles and actions to a strategy. Finally, there's space for storing custom runtime data, useful for monitoring and external integrations.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single result from running a trading strategy backtest. Think of it as a row in a table comparing different strategies. It holds the strategy's name so you know which strategy produced the results, and a comprehensive set of backtest statistics detailing its performance. 

Crucially, it includes a metric value used for ranking strategies; this might be Sharpe Ratio or another key indicator.  Finally, it tracks the timing of the first and last signals generated by the strategy, which can be helpful for understanding its activity over the test period. If a strategy didn't generate any signals, these timestamp values will be null.

## Interface IStrategyPnL

This interface, IStrategyPnL, represents the outcome of a trading strategy's profit and loss calculation. It gives you a clear picture of how your trades performed, taking into account realistic factors like transaction fees and slippage. 

Here's what the data tells you:

*   **pnlPercentage:**  This shows your profit or loss as a percentage – a positive number indicates a gain, and a negative number a loss.
*   **priceOpen:** This is the price you initially bought the asset at, but it's been adjusted to account for fees and slippage.
*   **priceClose:** This is the price you sold the asset for, also adjusted for fees and slippage.
*   **pnlCost:** This is the actual dollar amount you gained or lost from the trade.
*   **pnlEntries:** This represents the total amount of money you invested to get into those trades.

## Interface IStrategyCallbacks

This interface allows you to hook into different points in a trading strategy's lifecycle within the backtest-kit framework. Think of them as event listeners that get triggered as your strategy progresses through various stages.

You can receive notifications for every tick with `onTick`, giving you a constant stream of price data.

Specific signals trigger events too: `onOpen` when a new signal is established, `onActive` when it’s actively being monitored, `onIdle` when there are no active signals, and `onClose` when a signal is finalized.

For signals entered on a delayed schedule, `onSchedule` fires when the scheduled signal is created, and `onCancel` is called if a scheduled signal is cancelled.

There are also callbacks for specific profit/loss states: `onPartialProfit`, `onPartialLoss`, and `onBreakeven` letting you react to price movements before reaching the full target or stop-loss.

The `onWrite` event is primarily for testing and backtesting, allowing you to interact with the data persistence.  Finally, `onSchedulePing` and `onActivePing` offer minute-by-minute updates for scheduled and active signals, letting you perform custom monitoring tasks.

## Interface IStrategy

The `IStrategy` interface outlines the core methods a trading strategy needs to execute.  Think of it as a blueprint for how a strategy interacts with the trading framework.

Here's a breakdown of what each method does:

*   **`tick`**: This is the heart of the strategy; it runs with each new price update. It checks for signals, potential profit targets, and stop-loss triggers.
*   **`getPendingSignal`**: Finds any signals that are already active but haven't triggered yet. Used for things like monitoring profit targets and time limits.
*   **`getScheduledSignal`**:  Similar to `getPendingSignal`, but for signals that are set to activate in the future.
*   **`getBreakeven`**:  Determines if the price has moved enough to cover transaction costs, allowing the strategy to set a breakeven point.
*   **`getStopped`**: Checks if the strategy has been paused or halted.
*   **`getPaused`**:  Checks if the strategy is temporarily paused, preventing new trades but keeping existing ones monitored.
*   **`setPaused`**:  Allows pausing and resuming new trades.
*   **`getTotalPercentHeld`**: Calculates the percentage of the initial investment still in the market.
*   **`getRemainingCostBasis`**: Figures out how much money is still needed to cover the initial investment.
*   **`getPositionEffectivePrice`**:  Calculates the average entry price when multiple entries have been made (DCA).
*   **`getPositionInvestedCount`**:  Counts how many times entries have been made.
*   **`getPositionInvestedCost`**:  Calculates the total amount invested.
*   **`getPositionPnlPercent`**: Determines the percentage profit or loss based on current price.
*   **`getPositionPnlCost`**:  Calculates the total profit or loss in dollars.
*   **`getPositionEntries`**:  Lists all the individual entry prices and costs.
*   **`getPositionPartials`**: Shows how the position has been closed partially over time.
*   **`backtest`**:  Simulates how the strategy would have performed with past data.
*   **`stopStrategy`**:  Stops the strategy from generating any new signals.
*   **`cancelScheduled`**: Cancels a signal that's scheduled to happen in the future.
*   **`activateScheduled`**:  Forces a scheduled signal to happen immediately.
*   **`closePending`**: Closes an active position without stopping the strategy.
*   **`createSignal`**: Allows external signals to be added to the strategy queue.
*   **`createTakeProfit`**: Reports when a take-profit order was filled.
*   **`createStopLoss`**: Reports when a stop-loss order was filled.
*   **`getStatus`**: Provides a snapshot of the strategy's current state.
*   **`partialProfit`**:  Closes a portion of the position at a profit.
*   **`validatePartialProfit`**:  Checks if a partial profit close is possible.
*   **`partialLoss`**:  Closes a portion of the position at a loss.
*   **`validatePartialLoss`**: Checks if a partial loss close is possible.
*   **`trailingStop`**: Adjusts the stop-loss based on price movement.
*   **`validateTrailingStop`**: Checks if a trailing stop adjustment is possible.
*   **`trailingTake`**: Adjusts the take-profit level.
*   **`validateTrailingTake`**: Checks if a trailing take adjustment is possible.
*   **`breakeven`**: Moves the stop-loss to the entry price when certain conditions are met.
*   **`validateBreakeven`**: Checks if setting a breakeven is possible.
*   **`averageBuy`**:  Adds another entry to the position (DCA).
*   **`validateAverageBuy`**: Checks if another entry can be added (DCA).
*   **`hasPendingSignal`**: Checks if an active signal exists.
*   **`hasScheduledSignal`**: Checks if a scheduled signal exists.
*   A series of `get...` methods provide information on position status, history, and estimated times.
*   **`dispose`**: Cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the basic operations a storage adapter needs to support within the backtest-kit trading framework. Think of it as a contract for different ways to store and manage trading signals.

The adapter must be able to react to signals being opened, closed, scheduled, or cancelled. Each of these events triggers a corresponding `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` method.

You'll also need a way to retrieve specific signals by their unique ID using `findById`, or to get a list of all signals with `list`.

Finally, the adapter needs to handle 'ping' events—specifically `handleActivePing` for signals that are currently open and `handleSchedulePing` for scheduled signals—to keep track of when they were last updated.

## Interface IStorageSignalRowScheduled

This interface describes a signal's data when it's scheduled for execution. 

It holds two key pieces of information: the `status`, which is always "scheduled" to confirm it's a scheduled signal, and the `currentPrice`. 

The `currentPrice` represents the market price at the time the signal was scheduled—essentially a snapshot of the price from when the decision to execute was made. This helps in later analysis and reconciliation.

## Interface IStorageSignalRowOpened

This interface describes a signal event when a trading strategy opens a position. It tells you the signal has transitioned to an "opened" state, and crucially, provides the current VWAP price at the moment the position was initiated. Think of it as a confirmation that a trade has begun, along with the price level that triggered it. Having this price information is valuable for analyzing trade performance and understanding market conditions at the time of entry.


## Interface IStorageSignalRowClosed

This interface describes the data associated with a trading signal that has been closed. It's specifically for signals where we have information about the profit and loss (PNL) generated during its lifespan.

Each closed signal record includes:

*   Its status, which will always be "closed."
*   The calculated profit and loss (PNL) achieved when the signal was closed.
*   The final price used when the signal was closed.
*   The reason why the signal was closed.
*   The exact timestamp of when the signal was closed.

Essentially, it provides a complete picture of a trading signal’s performance from start to finish.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. It's a simple way to mark a signal as no longer active or valid.

The `status` property clearly indicates that the signal’s current state is "cancelled". This allows you to easily filter and identify signals that should be excluded from further processing.

## Interface IStorageSignalRowBase

This interface defines the basic structure for storing signal data, ensuring that all signal types share core information. It includes the exact time the signal was created (`createdAt`) and last updated (`updatedAt`), which helps in tracking its history. A `priority` field is also included, allowing signals to be rewritten in a specific order, essentially acting as a sort key for storage. This ensures signals are processed in a consistent and predictable way whether they're generated during live trading or a backtest.

## Interface IStateInstance

The `IStateInstance` interface establishes a standard way for managing data related to trading signals. Think of it as a central place to keep track of information specific to each trade, like its unrealized profit and how long it's been open. This is especially useful when using AI or machine learning models to make trading decisions, as it allows you to monitor and adjust strategies based on real-time performance.

The `waitForInit` method is used to get things started, essentially marking the beginning of the data tracking for a particular trade.

The `getState` method lets you retrieve this data at a specific point in time.  It's designed to prevent looking too far into the future, ensuring you're only seeing information that was available at the time the trade was made.

The `setState` method is how you update this data, allowing you to record changes as the trade progresses. Importantly, it prioritizes more recent data, so restarting a backtest won't corrupt ongoing data.  When updating, you have access to the existing data (or a default value if it's unavailable).

Finally, `dispose` cleans up any resources used by the instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines how to size your trades using the Kelly Criterion. It's a strategy for determining how much of your capital to risk on each trade to maximize long-term growth. 

You’ll specify this by setting the `method` to `"kelly-criterion"` and then defining a `kellyMultiplier`. This multiplier essentially controls your aggressiveness; a lower value like 0.25 represents a more conservative "quarter Kelly" approach, while a higher value risks more capital per trade for potentially greater returns. Remember to carefully consider your risk tolerance when choosing this multiplier.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading sizing strategy where you consistently risk a fixed percentage of your capital on each trade. 

The `method` property will always be "fixed-percentage" to identify this specific sizing approach.

The `riskPercentage` property dictates the percentage of your available funds you're willing to lose on a single trade; for example, a value of 2 means you risk 2% of your capital per trade. It’s essential that this value falls between 0 and 100.


## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing schemas within the backtest-kit trading framework. Each sizing schema needs a unique identifier, `sizingName`, to distinguish it from others. You can also add a `note` to provide additional context or documentation for developers. 

The schema also includes controls for position sizing: `maxPositionPercentage` limits the percentage of your account used for any trade, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum position sizes.  Finally, `callbacks` allow for optional lifecycle hooks to be attached to the sizing process, enabling custom logic to be triggered at various points.


## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR). It's designed for strategies where you want your position size to react to market volatility, as measured by the ATR.

The `method` must be explicitly set to "atr-based" to indicate that you're using this sizing approach.

You'll also specify a `riskPercentage`, which represents the portion of your capital you're willing to risk on each trade – think of it as a percentage between 0 and 100.  Finally, the `atrMultiplier` determines how far your stop-loss will be placed relative to the ATR value. A higher multiplier means a wider stop.

## Interface ISizingParamsKelly

This interface defines how to set up sizing parameters based on the Kelly Criterion when building a trading strategy. It focuses on providing a way to log debugging information related to sizing calculations. Specifically, you'll need to include a logger service to help track and understand how the sizing decisions are being made. This logger helps diagnose any issues and understand the strategy's behavior.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to control how much of your capital is used for each trade when using a fixed percentage sizing strategy. It's essentially a way to tell the system how to calculate your position size based on a percentage of your available funds.

The `logger` property lets you connect a logging service to monitor and debug the sizing process, providing helpful output during backtesting or live trading. This can be valuable for understanding how sizing decisions are being made.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining trade sizes based on the Average True Range (ATR) indicator. 

It mainly consists of a `logger` property, which is used to help you debug and understand how the sizing calculations are working. The `logger` allows you to output information and errors, making it easier to troubleshoot your trading strategies.


## Interface ISizingCallbacks

This section outlines the callbacks you can use to monitor and potentially influence the sizing process within the backtest-kit framework. Specifically, `onCalculate` is triggered immediately after the framework determines how much to trade based on your sizing strategy. You can use this callback to record the calculated trade size and the parameters used in the calculation, or to ensure the size makes sense given your strategy’s rules.


## Interface ISizingCalculateParamsKelly

When you're using the Kelly Criterion to determine how much to bet or trade, you'll need to provide certain parameters. This set of parameters defines specifically that you want to use the Kelly Criterion method for sizing. To do this, you need to tell the system your win rate, expressed as a number between 0 and 1 (like 0.6 for 60%), and also your average win-loss ratio - how much you typically win compared to how much you lose on a winning trade. These two values help the system calculate an appropriate sizing amount based on the Kelly Criterion formula.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed to calculate trade size using a fixed percentage approach.  It requires specifying the method as "fixed-percentage" to indicate the sizing strategy.  You’ll also need to provide a `priceStopLoss` value, representing the price level at which a stop-loss order will be triggered. This value helps in determining the risk associated with each trade.


## Interface ISizingCalculateParamsBase

This defines the basic information needed for calculating how much of an asset to trade. 

It includes the symbol of the trading pair, like "BTCUSDT" to identify the asset being traded. 

You’ll also find the current account balance, which is crucial for determining how much capital is available for trading. Finally, the planned entry price, or the price at which you intend to enter the trade, is provided for sizing calculations.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed when you're determining how much of your capital to allocate to a trade based on the Average True Range (ATR). 

You'll provide a `method` which will always be "atr-based" to indicate you’re using this specific sizing technique. 

Then, you need to specify the `atr` value itself – this is the ATR value you've calculated, and it’s crucial for determining your position size. Think of it as a key input that drives how much risk you're taking.

## Interface ISizing

The `ISizing` interface defines how your trading strategy determines the size of each position it takes. Think of it as the engine that figures out how much to buy or sell based on your risk tolerance and the market conditions.

It has a single, crucial method called `calculate`. This method takes a set of parameters – essentially the information it needs to make a sizing decision – and returns a promise that resolves to the calculated position size, representing the quantity of an asset to trade. 


## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal ready to be executed. It bundles a lot of information together, making it easy to handle a signal throughout the trading process.  Each signal gets a unique ID automatically assigned. 

You’ll find details about the trade itself, like its cost, entry price, and the timeframe it's intended to run.  It also includes important settings like leverage (multiplier) and whether it uses isolated margin. 

Custom data can be attached to each signal using the `payload` field. Other information such as the exchange, strategy, frame, and creation/pending timestamps is also included. 

The `ISignalRow` also keeps track of complex details: 

*   It records partial closes (profit or loss) to calculate accurate PNL.
*   It holds trailing stop-loss and take-profit prices, which dynamically adjust based on market movements.
*   It maintains a history of entries if you're using DCA (Dollar Cost Averaging).
*   It tracks the highest profit and lowest loss points achieved during the position's life.

Finally, `timestamp` captures when the signal was initially created, providing a record of its origin.

## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to group them together and release them at specific intervals. Think of it as a way to bundle multiple signals into one request and control when they become active. Each signal has a unique ID, like a serial number, so you can easily identify and track it. This is useful for situations where you want to wait a certain amount of time before processing several signals.

## Interface ISignalDto

This data structure represents a trading signal – essentially, an instruction to buy or sell an asset. It contains all the necessary information to execute a trade, including the ticker symbol, whether it's a long (buy) or short (sell) position, and a description of why the signal was generated. You can provide a unique ID for the signal, but if you don't, the system will automatically create one.

The signal also includes details for managing the trade, such as target take profit and stop-loss prices, and an estimated duration. You can optionally add custom data to the signal through a flexible "payload" section.  Cost and leverage settings allow for fine-tuning how the trade is executed and the potential profits or losses. Finally, it supports isolated margin, which can affect how and when the position might be closed.

## Interface ISignalCloseRow

This interface defines the structure of a signal row when a trade has been closed, specifically when the closure was initiated by the user. It builds upon the basic signal row information, adding details about the closure itself. If a user manually closes a trade, this interface provides fields to record the unique identifier (`closeId`) of that closure and any notes (`closeNote`) the user might have provided during the closure process. These properties are only relevant when a user has explicitly closed the trade.

## Interface ISessionInstance

This interface helps manage temporary data during backtesting, providing a way to store and retrieve information specific to a combination of a trading symbol, strategy, exchange, and timeframe. Think of it as a small, isolated notebook for each of these combinations, letting you keep track of things like calculations from complex models or intermediate results from indicators.

It allows you to initialize the data, write new information with a timestamp, retrieve existing data, and clean up when the testing is done. Importantly, when reading data, it prevents looking into the future, ensuring a fair and accurate backtest. This is particularly useful for things like caching results from computationally expensive processes or keeping track of states that need to be shared across different calculations during a single backtest run.

## Interface IScheduledSignalRow

This interface describes a signal that’s held back until a specific price is reached. Think of it as a signal that’s waiting for a chance to execute – it’s not active yet.  It's based on a standard signal but delayed, waiting for the market to hit a particular price, `priceOpen`.  Once that price is reached, this delayed signal activates and becomes a regular signal ready for trading. A key aspect is that the time it's been pending will be tracked, starting from the initial scheduling time and updating to the actual time it waits. The `priceOpen` property simply defines that target price.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal, but with extra information for cancellations that a user might initiate. When a user cancels a signal, this interface lets you record a unique ID (`cancelId`) associated with that cancellation, along with a note (`cancelNote`) explaining why the cancellation happened. Think of it as a way to track user-driven changes to your scheduled trading signals. If the signal wasn't cancelled by a user, these fields will not be present.

## Interface IScheduledSignalActivateRow

This interface describes a scheduled signal, but with a key addition: it includes information related to how that signal was activated. Specifically, it’s used when a user manually triggers the signal, allowing for tracking and notes. The `activateId` property holds a unique identifier associated with that user-initiated activation, and the `activateNote` field stores any notes the user included when activating the signal. Think of it as a way to link a scheduled signal’s execution back to a specific user action.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, essentially tells you the timeframe you’re working with during a backtest. It defines the start and end dates—the “from” and “to” properties—that bracket the period your trading strategy will be tested on. Think of it as setting the boundaries for your historical data analysis. It lets the backtest know exactly what dates to pull data for and run the strategy against.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides essential details about the current trading scenario. It tells you what symbol you’re trading, like "BTCUSDT," and the timeframe of the backtest if you're analyzing historical data. You'll also get custom information passed in by your strategy, enabling you to track specific metrics. The interface also gives you context about the exchange, the strategy itself, and the data frame being used, and even the precise timestamp of the current candle or tick, along with the current price. A key piece of information is whether the strategy is running in backtest mode or live.

## Interface IRunContext

This interface, `IRunContext`, acts as a central hub of information needed when running code within the backtest-kit trading framework. Think of it as a comprehensive package containing everything a function needs to know about its environment. It merges two key pieces of information: details about the trading strategy and exchange you’re using (like exchange name and frame) along with the real-time state of the backtest, such as the symbol being analyzed and the current timestamp. This `IRunContext` is then used to pass all this relevant information to the appropriate services, keeping things organized and efficient.


## Interface IRiskValidationPayload

This object holds the information needed for risk validation checks. It builds upon the basic arguments for risk checks by adding details about the current trading situation.

You'll find the `currentSignal` which represents the signal that's currently being evaluated - it includes all the necessary price data.

Also included are details about the portfolio's current state: the number of open positions (`activePositionCount`) and a list of those positions (`activePositions`). This allows risk checks to consider how existing positions might interact with new trades.

## Interface IRiskValidationFn

This defines the blueprint for functions that check if a trade or order is acceptable based on specific risk rules. Think of it as a gatekeeper for your trades. If everything looks good – the trade aligns with your risk parameters – the function simply lets it pass through, returning nothing. But, if something is amiss – perhaps the potential loss is too high – it signals a problem. It can either return a detailed explanation of why the trade was rejected or, alternatively, raise an error that the framework will handle and translate into a rejection message.

## Interface IRiskValidation

This interface lets you define how to check if your trading risks are acceptable. Think of it as setting up rules to ensure your trading strategy doesn't take on too much danger.

You specify the actual check with the `validate` function, which performs the risk assessment.

The `note` property is there to add a helpful explanation of what the validation is doing – it’s like a comment to yourself or others to clarify the logic.

## Interface IRiskSignalRow

The `IRiskSignalRow` interface holds information crucial for managing risk during trading. It builds upon the existing `ISignalDto` and adds key details like the entry price (`priceOpen`), the initial stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`). This data is specifically used during risk validation, providing access to the original entry price and initial stop-loss/take-profit levels. Essentially, it allows the system to track and validate risk parameters related to each trade signal.

## Interface IRiskSchema

The `IRiskSchema` lets you define and register specific risk controls for your portfolio. Think of it as setting up guardrails to ensure your trading strategy stays within acceptable boundaries.

Each risk schema has a unique identifier, a `riskName`, which helps you keep track of different risk profiles. You can also add a note to document your intentions.

You can optionally specify callbacks, which are like notifications that trigger at certain points in the risk assessment process (when a trade is blocked or allowed).

Most importantly, the `validations` property is where you define the actual rules—the custom logic that determines if a trade is permitted. This is an array, allowing you to layer multiple validations to create complex risk management strategies.


## Interface IRiskRejectionResult

This object tells you why a risk check failed. It has a unique ID to help track specific rejections and a clear explanation in plain language describing the reason for the failure. Think of it as a friendly notification letting you know what went wrong during a risk assessment and why.

## Interface IRiskParams

The `IRiskParams` object is how you configure the risk management system within backtest-kit. It's essentially a set of settings you provide to ensure your trading decisions are made responsibly.

You'll need to specify the `exchangeName` you're working with, like "binance".  A `logger` allows you to track what’s happening for debugging purposes.  Crucially, you'll get a `time` service that helps keep things accurate – it prevents the system from looking into the future when analyzing past trades or making real-time decisions.

The `backtest` flag indicates whether you're running a simulation (backtest) or live trading. Finally, the `onRejected` callback lets you react when a trading signal gets blocked due to risk constraints; this allows you to perform custom actions or emit additional events.

## Interface IRiskCheckOptions

To help ensure safety when multiple parts of your trading strategy are trying to adjust positions at the same time, the `IRiskCheckOptions` lets you reserve a placeholder in your position map. Think of it like putting a temporary hold on a position size.

This 'reserve' option, when set to `true`, ensures that other checks happening simultaneously will see the updated, reserved size before any actual changes are made. This avoids potential conflicts and ensures a more reliable trading environment, especially in complex strategies. It's all about preventing unexpected overlaps in position adjustments.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, bundles all the information needed to decide whether a new trade should be allowed. Think of it as a set of validation checks run *before* a trading signal is actually generated. It includes details like the trading pair being considered (symbol), the pending signal itself, the name of the strategy initiating the request, and information about the exchange and risk profile involved. You'll also find details like the current price and timestamp, providing context for the risk assessment. Essentially, it’s a snapshot of the situation right before a potential trade happens, ensuring everything aligns with your pre-defined rules.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategies can use to react to risk management decisions. Specifically, you can provide an `onRejected` function that gets called whenever a trading signal is blocked because it exceeds defined risk limits. Conversely, the `onAllowed` function is triggered when a signal successfully passes all risk checks and is approved for execution. These callbacks allow your strategy to log, monitor, or take other actions based on the risk assessment results.

## Interface IRiskActivePosition

This interface describes a single, active trading position that's being monitored for risk management. Think of it as a snapshot of a trade happening right now. It tells you which strategy placed the trade, on which exchange, and what frame (like a 5-minute chart) it was based on. 

You’ll find the symbol being traded (like BTCUSDT), whether the position is a long or short, and the price at which the trade was initiated. It also includes the stop-loss and take-profit prices set for the trade to protect and secure profits. Finally, you can see the estimated duration and a timestamp showing precisely when the trade started.

## Interface IRisk

The `IRisk` interface is responsible for managing and enforcing risk limits when executing trading strategies. It allows you to verify if a proposed trade should be allowed based on predefined risk parameters.

The `checkSignal` function determines if a trade can proceed based on the current risk profile. A safer, atomic version called `checkSignalAndReserve` does this and immediately reserves space for the potential new position – preventing other strategies from exceeding limits concurrently. It’s essential to follow up a successful `checkSignalAndReserve` with either `addSignal` (to finalize the position) or `removeSignal` (to cancel it), to avoid accumulating incorrect reservation data.

You use `addSignal` to register a new, opened trading position within the system. Conversely, `removeSignal` allows you to clean up a closed or cancelled position.

## Interface IReportTarget

This interface lets you fine-tune what information gets logged during your backtesting process. Think of it as a control panel for detailed reporting. You can choose to specifically enable logging for things like strategy execution, risk management decisions, breakeven points, partial trade closures, performance data, scheduled events, live trading activity, or significant milestones like achieving highest profit or hitting maximum drawdown limits. Each property (strategy, risk, breakeven, etc.) is a simple on/off switch for a different type of reporting. By enabling only the reports you need, you keep your logs clean and focused on the aspects most important to you.

## Interface IReportDumpOptions

This interface helps you control how data is written for reports, letting you specify key details about the trading activity. You can use it to define things like the trading pair (like BTCUSDT), the name of the strategy being used, and the exchange where the trades occurred. It also includes the timeframe, a unique identifier for the signal, and the name of the walker used for optimization. By providing these details, you ensure your reports are well-organized and easy to understand.

## Interface IRecentUtils

This interface defines how different systems can store and manage recent trading signals. It's designed to ensure that backtesting and live trading use the same signal data, preventing look-ahead bias.

The `handleActivePing` method lets you receive and save new signal data. 

`getLatestSignal` fetches the most recent signal for a specific trading setup (symbol, strategy, exchange, timeframe, and whether it’s a backtest). Crucially, it avoids using signals from the future – if a signal’s timestamp is later than the date you're requesting, it won’t be returned.

Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the last signal was generated, useful for understanding signal frequency and potential delays.

## Interface IPublicSignalRow

This interface, IPublicSignalRow, is designed to give you a clear view of a trading signal, especially its initial risk management settings. It builds upon the standard signal information by including the original stop-loss and take-profit prices that were set when the signal was first created. This is helpful because even if you’re using trailing stops or take-profits that adjust those levels, you can still see what the initial plan was.

Beyond the basics, it also provides insight into how the position has evolved. You'll find details about the cost of entering the trade, how much of the position has been closed through partial exits, and how many entries and partials were involved. 

The signal’s original entry price is also included, along with its current unrealized profit/loss (PNL), the highest profit reached so far (peak profit), and the maximum drawdown experienced – all calculated at the time the signal was generated. Essentially, IPublicSignalRow offers a comprehensive snapshot of a signal’s history and current status.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick representing price data over a specific time interval. Each candlestick contains key information like when it began (timestamp), the opening price, the highest and lowest prices reached during that period, the closing price, and the total trading volume. Essentially, it’s a snapshot of market activity encapsulated within a single data point for charting and analysis.


## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you'll use when calculating position sizes based on the Kelly Criterion. This criterion helps determine how much of your capital to risk on each trade.

You'll provide two key pieces of information: your win rate, which is a value between 0 and 1 representing the percentage of winning trades, and your win/loss ratio, which describes the average profit you make on a winning trade compared to the average loss on a losing trade. These parameters together let the framework calculate a suggested position size to optimize for long-term growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your capital for each trade, and includes a stop-loss price. Specifically, you'll use this to tell the backtest system how much of your funds to risk on each trade and at what price you want to limit potential losses. The `priceStopLoss` property represents the price at which you'll automatically exit a trade to prevent further losses.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the settings needed to determine your position size using the Average True Range (ATR) method. It's a simple way to manage risk by adjusting your trade size based on market volatility.

The key piece of information it contains is the current ATR value. This number reflects the average range of price movement over a specific period, providing a sense of how volatile the market is. You'll use this ATR value within your trading strategy to calculate the appropriate position size.

## Interface IPositionOverlapLadder

This configuration defines how to detect overlapping positions when using dollar-cost averaging (DCA). It lets you set boundaries, expressed as percentages, around each DCA level. 

The `upperPercent` property specifies a percentage above each DCA level where any position would be considered an overlap. Similarly, the `lowerPercent` property defines a percentage below each DCA level that also triggers an overlap flag. Think of these as zones of tolerance—if a position falls within these zones around a DCA level, it's considered to be overlapping. This helps you fine-tune how strictly you want to identify potential conflicts between your DCA positions.

## Interface IPersistStrategyInstance

This interface helps you manage how strategy data is saved and loaded for specific combinations of a trading symbol, the name of the strategy being used, and the exchange involved. Think of it as a way to customize where and how a strategy remembers its progress between sessions. 

You'll use this if you want to go beyond the default file-based storage.

The `waitForInit` method prepares the storage area specifically for your strategy. 

`readStrategyData` retrieves any previously saved strategy data.

And `writeStrategyData` is how you save the current state of your strategy, which can also be used to erase the saved data by passing null.


## Interface IPersistStorageInstance

This interface defines how your custom storage solutions interact with the backtest-kit framework. Think of it as a way to manage and save the data related to trading signals, but specifically for either the backtesting phase or live trading.

It allows you to replace the default file-based storage with something else, like a database or in-memory store, if you need to.

The `waitForInit` method is used to prepare your storage when the framework starts up, setting everything up correctly for either backtesting or live mode.

`readStorageData` retrieves all the previously saved signals, returning them as a collection.

Finally, `writeStorageData` saves the current set of signals, organizing them by their unique identifier.

## Interface IPersistStateInstance

This interface helps manage how your trading strategy's data is saved and loaded, especially important for strategies that might crash or need to recover. Think of it as a way to ensure your strategy remembers where it left off.

It's specifically tied to a combination of a signal and a bucket, meaning it handles storage separately for different data streams.

If you want to customize how your strategy’s state is stored – maybe you don't want to use files – you can create your own adapter that implements this interface.

The `waitForInit` method is used to get the storage ready to go at the start.
`readStateData` fetches any previously saved state.
`writeStateData` handles saving the current state, including a timestamp.
Finally, `dispose` releases any resources being used, though this might not always need to be customized.

## Interface IPersistSignalInstance

This interface lets you customize how signal data is saved and loaded for a specific trading setup – think of it as a dedicated storage space for signals related to a particular symbol, strategy, and exchange. If you want to move beyond simple file storage, you can create your own adapter that implements this interface.

The `waitForInit` method allows you to prepare the storage area when it's needed, providing an initial state if necessary.  `readSignalData` retrieves any previously saved signal information, and `writeSignalData` lets you store new or updated signal data, or even clear the data entirely by sending null. This gives you control over how your trading system remembers and uses historical signal information.

## Interface IPersistSessionInstance

This interface defines how a system can reliably store and retrieve session information related to a specific trading strategy, exchange, and frame. Think of it as a way to save progress or state for a particular setup, so you can pick up where you left off even if things go wrong.

If you're building a custom solution for managing this data – perhaps not wanting to use a file-based approach – you’ll need to implement this interface.

Here's what you'll need to do:

*   **waitForInit:** A way to prepare the storage space when things start up. You'll tell the system whether it's the first time the storage is being initialized.
*   **readSessionData:** A method to load any previously saved data associated with the current strategy, exchange, and frame combination.
*   **writeSessionData:** A way to save the current state or data related to the current session. This ensures any progress is saved.
*   **dispose:** A way to clean up and release any resources that are being held by your custom solution. This might not be needed if your implementation doesn't actually manage any resources.

## Interface IPersistScheduleInstance

This interface defines how your custom code interacts with the backtest-kit framework to save and load scheduled signals for a specific trading setup. Think of it as a way to manage the data that tells your strategy when to execute, allowing you to use a database or other storage method besides the default file system.

It provides three key functions: `waitForInit` which prepares the storage space, `readScheduleData` which retrieves a previously saved signal, and `writeScheduleData` which stores a new signal.  You’ll need to implement this interface if you’re building a more sophisticated system for persisting your scheduled signals. The context being referred to is determined by the unique combination of symbol, strategy name, and exchange name.


## Interface IPersistRiskInstance

This interface defines how to manage and store the active risk positions for a specific trading context. Think of it as a way to save and load the state of your risk management for a particular combination of risk name and exchange. If you want to use a different storage method than the default file-based system—perhaps a database or in-memory store—you can create an adapter that implements this interface. 

The `waitForInit` method allows you to initialize the storage when needed, providing a way to set up any necessary resources. The `readPositionData` method retrieves the saved risk positions for a given time, letting you load the state from storage. Finally, `writePositionData` is used to save the current risk positions, ensuring that the system remembers the active positions.


## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent trading signal for a specific setup, like a particular symbol, strategy, or exchange. 

It helps keep track of the last signal used so you can easily resume from where you left off, whether you're backtesting or running a live strategy.

If you want to use a different way to store this information – perhaps a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method sets up the storage space for your specific context.

`readRecentData` retrieves the last saved signal.

`writeRecentData` saves the current signal, along with a timestamp.


## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss information is saved and loaded. Think of it as a way to keep track of a trading strategy's progress at specific points in time, but only for a particular combination of asset, strategy name, and exchange.

Each signal, representing a trade or decision, has its own dedicated space for storing this information.

If you want to change where and how this data is stored - for example, using a database instead of files - you can build your own adapter that follows this interface.

The `waitForInit` method prepares the storage area for your specific setup.  `readPartialData` retrieves previously saved partial data for a particular signal and time. Finally, `writePartialData` saves the current partial data for a signal to persist across sessions.


## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are saved and loaded. Think of notifications as important events that happen during a trade, and you want to keep a record of them. 

This interface defines a way for you to create your own system for managing these notifications, rather than relying on the default file-based storage. It essentially provides a set of tools to initialize, read, and write these notifications, ensuring they're available when you need them, whether you're running a backtest or a live trading session. Each trading mode (backtest or live) will have its own separate instance of this.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts within the backtest-kit framework, particularly for Large Language Model (LLM) memory. Think of it as a way to manage individual pieces of information, each labeled with a unique identifier.

It allows you to read, write, and delete memory entries – although deletion is actually a "soft delete," meaning the data remains on disk but is hidden from normal searches. You can also check if a specific memory entry exists.

The `listMemoryData` function provides a way to get all currently available memory entries, which is useful for rebuilding indexes.  Finally, `dispose` allows for releasing any resources used by this storage. 

If you’re creating custom ways of managing this memory, you’ll need to implement this interface to control how memory data is handled.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures. Think of it as a way to save results from external APIs so you don't have to repeatedly fetch them.

It allows for a "soft delete" feature, meaning when you remove data, it's not actually erased from disk, but marked as removed, allowing for potential recovery or auditing.

If you need to customize how this caching works – for example, if you wanted to store data in a database instead of a file – you would implement this interface.

Here’s what the methods do:

*   `waitForInit`: Sets up the storage area for the bucket.
*   `readMeasureData`: Retrieves a cached data entry using a unique key.
*   `writeMeasureData`: Saves a data entry to the cache along with a timestamp.
*   `removeMeasureData`: Marks a data entry as removed, making it unavailable for regular retrieval.
*   `listMeasureData`: Provides a way to see a list of all the keys of the data that haven't been marked as removed.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its log data. Instead of relying on the default file-based storage, you can build your own adapter to persist logs somewhere else, like a database.

The log storage itself is global – meaning there’s only one instance running for the entire backtest-kit process.  Each log entry is identified by a unique ID.

You’ll need to provide an implementation for `waitForInit` to set up your logging mechanism and `writeLogData` to save the log entries, making sure to avoid duplicates based on their IDs.  `readLogData` handles retrieving all the stored log data.

## Interface IPersistIntervalInstance

This interface lets you customize how backtest-kit remembers which intervals have already run for a specific data bucket. Think of it as a way to track whether a particular trading strategy has already executed for a given time period and data. 

If you're building your own storage solution instead of relying on the default file-based system, you'll implement this interface. 

The methods allow you to:

*   Initialize storage when needed.
*   Retrieve existing interval markers based on a unique key.
*   Save new interval markers, associating them with a key and timestamp.
*   "Soft-delete" markers – essentially telling the system that the interval can run again. This is how you'd re-trigger an interval if needed.
*   List all the interval markers that haven’t been soft-deleted.

## Interface IPersistDictionaryInstance

This interface helps manage how dictionaries of data are stored and retrieved, especially when dealing with potentially unstable situations. Think of it as a way to make sure your dictionaries don’t get lost if something unexpected happens during a backtest.

It defines how to initialize, load existing data, save new data, and clean up resources related to a specific dictionary – this is tied to a particular signal and dictionary name.

If you need to change how these dictionaries are stored (perhaps not using files), you can create a custom adapter that follows this interface.

Here's a breakdown of what's involved:

*   `waitForInit`: Sets things up for the storage of the dictionary.
*   `readDictionaryData`: Loads any previously saved dictionary data.
*   `writeDictionaryData`: Saves the current state of the dictionary.
*   `dispose`: Cleans up any resources used by the storage.

## Interface IPersistCandleInstance

This interface defines how to store and retrieve candle data for a specific trading symbol, time interval, and exchange. It’s like a dedicated storage area for candles related to a particular combination of these factors.

The `waitForInit` method prepares the storage space when needed.

The `readCandlesData` method is your way to get a set of cached candles from the storage within a defined time range, and importantly, it returns `null` if even one candle is missing – this signals you need to go back to the source to fetch those missing candles.

The `writeCandlesData` method lets you write new or updated candle data back into this storage. Implementations might choose to ignore incomplete or already existing candles to ensure data integrity.


## Interface IPersistBreakevenInstance

This interface helps manage where your trading strategy's breakeven points are saved – those crucial calculations that tell you when you've recovered your initial investment. Think of it as a personalized storage space for each signal, tied to a specific trading combination like a symbol, strategy, and exchange. 

You don't always need to interact with this directly. The framework has a default way to store this information, usually in a file.

However, if you want to control exactly how these breakeven points are saved, like maybe using a database instead of a file, you can build your own adapter that implements this interface.

Essentially, it provides two key functions:

*   `waitForInit` sets up the storage area for a particular trading context.
*   `readBreakevenData` retrieves a previously saved breakeven point for a specific signal.
*   `writeBreakevenData` saves a new or updated breakeven point.

## Interface IPersistBase

This interface is designed to let you build your own ways of storing and retrieving data for backtesting. Think of it as a set of basic rules for how your storage system should behave. 

It outlines the essential actions you'll need: preparing the storage space, reading data, checking if data exists, writing data, and getting a list of all the data you have.

The `waitForInit` method handles initial setup and makes sure it only runs once. `readValue` and `hasValue` let you fetch existing data. `writeValue` ensures data is saved correctly, and `keys` provides a way to list all the data identifiers in a sorted order, which is useful for checks and looping through everything. 

You'll implement this interface to connect your backtest kit to your specific storage solution, whether it's a file system, a database, or something else entirely.

## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit on a trade. It's like a message saying "close a portion of this position." 

The `action` property confirms this is a partial profit instruction.

`percentToClose` tells you what percentage of the existing position should be closed. 

Finally, `currentPrice` records the price at which this partial profit closing occurred.


## Interface IPartialLossCommitRow

This represents a single instruction to partially close a position as part of a backtesting process. 

Think of it as a record of one specific action: reducing the size of a trade, but not closing it entirely. 

It tells you the percentage of the position to close, the price at which the partial closing occurred, and confirms that the action being taken is a partial loss. These details are crucial for accurately reconstructing the trading logic and analyzing results.

## Interface IPartialData

This data structure helps save and restore important information about a trading signal. Specifically, it stores the profit and loss levels that have been hit.

Think of it as a snapshot of the signal's performance – it remembers how far it’s progressed toward profit or loss.

The `profitLevels` and `lossLevels` properties are lists that hold this data. They're designed to be easily saved to a file or database, and then loaded back into the system later to resume a backtest. These lists represent what were originally sets of levels.


## Interface IPartial

The `IPartial` interface manages how your trading signals track profit and loss. It’s responsible for keeping tabs on milestones like reaching 10%, 20%, or 30% profit or loss.

The `profit` method is triggered when a signal is making money, and it figures out which profit levels have been achieved, sending out notifications for each new level.

Similarly, the `loss` method handles situations where a signal is losing money, identifying and reporting when different loss levels are hit.

Finally, the `clear` method cleans up the tracking when a signal is finished, ensuring that old data is removed and resources are freed. This happens when a signal hits a target price or time limit.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome when you process command-line arguments for your trading application. It essentially combines the original input arguments with flags that determine the trading mode – whether you’re simulating a backtest using historical data, practicing with paper trading, or executing real trades.  The object clearly indicates whether backtest mode, paper trading mode, or live trading mode is enabled based on how you launched the application. This makes it easy to understand the intended operation of your trading system.

## Interface IParseArgsParams

This interface describes the basic information needed to run a backtest. Think of it as a recipe – it tells the backtest-kit what it needs to know to get started. 

It includes things like the trading pair you're interested in (like BTCUSDT), the name of the trading strategy you want to test, which exchange you're connecting to (like Binance or Bybit), and the timeframe of the data you'll be using (like hourly or daily candles). Providing these values helps the system understand exactly what to test and where to get the necessary data.


## Interface IOrderBookData

This interface represents the data you'll receive for an order book, which shows the current buying and selling interest for a specific trading pair. 

It contains three key pieces of information: the `symbol` which identifies the trading pair (like BTC/USD), a list of `bids` representing buy orders, and a list of `asks` representing sell orders. 

Each bid and ask includes details like price and quantity, giving you a snapshot of what buyers and sellers are offering.

## Interface INotificationUtils

This interface defines how different systems can receive updates and notifications from the backtest-kit trading framework. Think of it as a central point for delivering information about strategy events, order status, and potential issues.

It includes methods for reacting to various signals like when a strategy initiates a trade (opens), closes a trade, or needs to adjust profit targets. You'll also find ways to be notified about partial profit or loss opportunities, and when strategies are committed to specific actions.

The framework also keeps you informed about the status of your orders – whether they're being checked, filled, rejected, continuing, or stopped – and about potential risks or pauses in the strategy. Error and validation events have dedicated handlers too.

Finally, you can retrieve a record of all past notifications and clear this history when needed. This is useful for debugging or auditing purposes.

## Interface INotificationTarget

This interface lets you pick and choose exactly which types of notifications you want to receive from the backtest or live trading environment. Instead of getting everything, you can specify which events are important for your needs, making the process cleaner and more efficient.

Here's a breakdown of the different notification categories you can enable:

*   **Signal Events:** These relate to the creation, scheduling, and cancellation of trading signals.
*   **Partial Profit/Loss & Breakeven:**  Get notified when the price hits predefined profit, loss, or breakeven levels before a trade is committed.
*   **Strategy Commitments:** Track when different types of actions (profit taking, loss limiting, order activations) are executed.
*   **Order Synchronization:** Monitor the status of orders placed with the exchange – when they're opened, filled, or confirmed.
*   **Order Checks:**  Verify that orders remain active on the exchange. This is crucial for live trading.
*   **Order Fills & Rejects:** Receive notifications for order confirmations or rejections from the broker.
*   **Order Continuation/Stopping:** Track the resolution of order checks, whether they continue or stop.
*   **Risk Management:** Be alerted if your trades are blocked by risk rules.
*   **Informational Messages:**  Get extra notes and information related to signals.
*   **Strategy Pause:** Know when the strategy is paused and no new trades are being initiated.
*   **Errors:**  Handle both recoverable errors and critical, potentially fatal errors, along with validation errors during configuration.



By selectively enabling these categories, you fine-tune the information flow and avoid being overwhelmed by unnecessary alerts.

## Interface IMethodContext

The `IMethodContext` interface acts like a little packet of information that gets passed around during backtesting. It holds the names of the schemas – think of them as blueprints – for the exchange, strategy, and frame being used. 

Essentially, it ensures that the backtest kit knows *exactly* which strategy, exchange, and data frame it's working with. This helps it pick out the correct versions of those components and run the backtest smoothly. The frame name will be empty if you're running in live mode, not historical.

## Interface IMemoryInstance

The `IMemoryInstance` interface sets the rules for how memory is managed within the backtest-kit framework. Think of it as a blueprint for different ways data can be stored and accessed during a backtest.

It provides methods for initializing the memory, writing new data points, searching for specific information, listing all entries, and removing data. You can use it to build different storage solutions, whether that's storing data in local memory, a persistent database, or even a dummy setup for testing.

The `waitForInit` method lets you ensure the memory is ready before you start.  `writeMemory` lets you add new data, including details like a description and timestamp.  `searchMemory` lets you find what you need using a full-text search, while `listMemory` provides a way to view everything stored up to a certain point in time. If something becomes obsolete, you can remove it with `removeMemory`. `readMemory` is for retrieving specific data points. Finally, `dispose` cleans up any resources when you are finished.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see when using the backtest-kit framework. You can turn on or off reports for things like strategy signals, risk management decisions, breakeven points, partial profits, portfolio heatmaps, strategy comparison, performance bottlenecks, scheduled signals, live trading activity, or the full backtest results. Each property controls a specific type of reporting, so you can focus on the areas most relevant to your analysis. For example, if you’re primarily interested in how your strategy generates signals, you could enable the `strategy` property and disable others.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, helps organize how information is presented when generating documentation. Think of it as a container for details about a specific piece of data you want to document, like a trading strategy’s performance. It provides structured data regarding the location and context of that data, ensuring consistency across your documentation.

It includes things like the path to the file, the filename, the trading pair (symbol) involved, the name of the strategy, the exchange being used, the timeframe (frameName), and a unique identifier for a signal.  Having all this information together makes it easy to locate and understand the source of the documentation being generated.

## Interface IMCPTextMessage

This interface defines a simple text message used within the Model Context Protocol (MCP). Each message has a unique ID to help with tracking and ensuring it's delivered correctly. The `type` property clearly indicates that this is a text message, and the `text` property holds the actual message content – the words being sent. Essentially, it's a standardized way to send plain text within the MCP system.

## Interface IMCPSignalNotifyCommand

This command is used to send a notification related to a specific trading symbol. It's part of a system called MCP, which handles communication and context within the trading framework. Essentially, when a trade is about to happen, this command broadcasts an informational message ("signal.info") about the position being prepared. 

The notification includes the symbol being traded (like "BTCUSDT"), the name of the system that triggered the notification, and a custom note to provide more details about the situation. Think of it as a way to keep everyone informed about what's happening before a trade executes.


## Interface IMCPSchema

This defines a way to connect a specific trading strategy to a control system, called an MCP. Think of it as a blueprint for how a system manages and interacts with a strategy.

Each blueprint (IMCPSchema) gives a unique name to the strategy it controls and links it to specific settings. If multiple strategies are involved, you *must* clearly specify which strategy the blueprint applies to, to avoid confusion.

You can customize how much money is risked on each trade (positionCost) and how much leverage is used (multiplier). There are also default values if you don't provide these.

It’s possible to restrict which actions can be taken by a connected system, setting permissions for different commands.

The system can also generate messages summarizing the portfolio’s status. These messages are sent to the connected system.

Finally, you can specify certain "callbacks" - functions that will run at specific points in the process, though these are completely optional.

## Interface IMCPPositionOpenCommand

This interface defines the information needed to open a new trading position using the backtest-kit framework. It’s used when a strategy wants to execute a trade – either buying (long) or selling (short) a specific cryptocurrency pair.  The command includes the symbol being traded (like BTCUSDT), the direction of the trade, a name identifying which strategy is making the request, and a note to explain why the trade is happening.  Essentially, it's a structured way to tell the system "open a position for this asset, in this direction, with this reason."

## Interface IMCPPositionCloseCommand

This interface defines the data needed to tell the system to close an existing position for a specific trading pair. Think of it as the instruction to shut down a trade.

It includes the symbol of the asset being traded, like "BTCUSDT," and the name of the underlying strategy or system that's initiating the closure request. A descriptive note is also required, allowing you to add a reason for why you're closing the position – useful for record-keeping and understanding your trading decisions.

## Interface IMCPImageMessage

This describes a message used within a system to transmit image data, like a visual chart or graph. Each image message has a unique ID to ensure it's delivered correctly and isn't processed multiple times. The message clearly identifies itself as an "image" type, and includes the image's mime type, such as "image/png," to specify the format of the data. Finally, the message carries the actual image data, which is encoded as a base64 string.

## Interface IMCPContext

The `IMCPContext` is like a quick picture of your trading portfolio at a specific moment. It’s delivered to your strategy's functions so you can make decisions based on what you own. Think of it as a record, organized by the symbol of the asset being traded, providing a snapshot of the portfolio's state for each active trading instance.


## Interface IMCPCallbacks

This section describes callbacks you can use to monitor the actions of a Model Context Protocol (MCP) instance. Think of them as ways to peek under the hood and see what the system is *actually* doing after certain operations complete. They don't change how things work; they just let you observe.

Here's a breakdown of the available callbacks:

*   `onStatus`: This callback is triggered when the status of a portfolio is refreshed. It gives you access to the data the system used to create the snapshot and any messages generated during that process.

*   `onPositionOpen`:  You'll receive this when a new position is opened successfully. The data includes the original signal details and the specific parameters used for the order.

*   `onPositionClose`:  This gets fired when a position is closed. It provides the ID of the signal that prompted the closure.

*   `onAverageBuy`: This callback is invoked when a DCA (Dollar-Cost Averaging) entry is accepted. It includes the signal ID associated with the average buy.

*   `onSignalNotify`:  Triggered when a notification is sent regarding a signal, providing the signal’s ID and any associated data.

If you don’t need a specific callback, you can simply omit it. If a callback encounters an error, it will be logged but won't halt the overall process.

## Interface IMCPAverageBuyCommand

This command lets you add a dollar-cost averaging (DCA) buy order to an existing, active trading position. It's used within the backtest-kit framework to automatically place these orders. 

The `symbol` property specifies which trading pair – like BTCUSDT – the order applies to. 

The `mcpName` identifies the specific trading strategy or model that's issuing the command. Essentially, it tells the system *who* wants to make this buy order.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s a central place to record events and details.

You can use it to keep track of just about anything—from when agents start and stop, to the results of policy checks, to errors that might occur when saving data.

The logger provides several levels of logging:

*   `log`: For general important messages.
*   `debug`: For very detailed information used mostly during development.
*   `info`: For regular updates and successful operations.
*   `warn`: For situations that aren't critical failures but should be investigated.

These logging functions all take a `topic` to describe the event and then any number of arguments to provide details about it.

## Interface ILogEntry

Each log entry, representing a single event recorded during a backtest, has a unique identifier. 

These entries are categorized by their log level – whether they’re standard logs, debug messages, informational updates, warnings, or messages specifically from agents.

A timestamp indicates when the log was generated, and another timestamp is derived from the backtest context, which makes it easier for users to understand the timing of events.

Optionally, you can associate context details with each log, like the method being executed (methodContext) or broader execution details (executionContext).

The topic field clarifies what the log entry is about, often corresponding to the method or function that generated it. 

Finally, any extra arguments passed during the logging process are included as a list, allowing for more detailed information to be captured.

## Interface ILog

The `ILog` interface gives you a way to track and review all the logging events that happen during your backtesting or trading simulations. It builds on the standard logging system and adds the ability to see a complete history of what's been logged.

You can use the `getList` method to retrieve every log entry, which is helpful for debugging, analyzing performance, or just understanding exactly what happened during a trade. Essentially, it allows you to review the full log of events and their severity levels, combined with any agent-related information.


## Interface ILauncherPaperArgs

This interface defines the settings for running the backtest system in a paper trading mode. It essentially instructs the system to simulate live trading conditions.

The `paper` property, always set to `true`, signals that the system should execute the full live pipeline without actually submitting orders to a real exchange. This allows you to observe how your strategies would perform in a realistic environment without risking capital.


## Interface ILauncherLiveArgs

This interface defines the arguments needed to launch the live trading pipeline. It's essentially a flag that tells the system to execute trades in a real-time environment. The `live` property, set to `true`, signifies that the backtest should proceed with actual trading operations, rather than just simulating them. It's designed to ensure type safety when choosing between backtesting and live trading modes.

## Interface ILauncherCallbacks

The `ILauncherCallbacks` interface lets you hook into the lifecycle of a launcher. Think of it as a way to be notified about key moments in the launcher's process.

You don’t have to provide all the callbacks; if you don’t need a specific one, just leave it out, and it won’t be triggered.

Specifically, `onWaitForInit` gets called just before the launcher pauses, waiting for things to be ready. This is a good opportunity to load additional configuration or register components that might not be immediately available, allowing the launcher to wait without blocking on those slower tasks.

## Interface ILauncherBacktestArgs

The `ILauncherBacktestArgs` interface defines the settings for running a backtest across multiple symbols. It essentially tells the backtest system how to execute and what timeframe to use.

You can specify whether you want to initiate a full backtest by setting `backtest` to `true`. 

The `frameName` property lets you define the timeframe for the backtest; if you have multiple timeframes available, you need to explicitly tell the system which one to use.  Otherwise, it will default to the first registered timeframe.

Finally, you can choose to pre-populate the 1-minute candle cache before the backtest starts, which is helpful for quicker results, with `cache` defaulting to `true`.

## Interface ILauncherArgs

ILauncherArgs defines the core information needed to kick off a backtest or live trading run. Think of it as a set of instructions for the system.

It specifies which symbols (like BTCUSDT) the system will trade.

You can optionally tell it which specific strategy and exchange to use. If you have only one of each registered, the system will pick them automatically.

Finally, you can provide callbacks to hook into certain events happening during the run, like when the run starts or ends, but these are not required. The `launcherName` uniquely identifies the launcher itself, linking it to its configuration in the schema registry.

## Interface IHeatmapRow

This interface represents a row of data within a portfolio heatmap, providing a comprehensive snapshot of a single trading symbol's performance. It bundles together a wealth of metrics to give you a clear picture of how a trading strategy is performing.

You’ll find key indicators like total profit/loss, Sharpe Ratio (measuring risk-adjusted return), and maximum drawdown (the biggest loss from peak to trough). It also breaks down the performance with details like the number of winning and losing trades, win rate, and average profit/loss per trade.

Beyond the basics, it offers deeper insights with metrics like expectancy (the average profit you’d make if you executed the strategy many times), duration of trades, and various ratios to assess risk and reward.  You can also see how frequently prices are moving up versus down, and how strong those trends are.

Finally, it includes a trend classification – whether the market is generally bullish, bearish, sideways, or neutral – along with a measure of its strength and confidence. This gives a good overview of the trading conditions.

## Interface IGetCandlesFilledParams

This interface defines the parameters needed to request historical candlestick data. To get candles, you'll need to specify the trading symbol, the time interval (like 1 minute, 1 hour, or 1 day), and the starting date you want data from.  You can also set a limit to control how many candles are returned in a single request, useful for managing large datasets. Think of it as building blocks to fetch the past price action for a particular asset.

## Interface IFrameSchema

The `IFrameSchema` helps you define the boundaries and structure of your backtesting periods. Think of it as setting up the stage for your trading simulation – you specify the start and end dates, and how frequently data points (like prices) will be generated. Each frame gets a unique name to identify it, and you can add notes to explain its purpose. You can also customize the interval (e.g., 1 minute, 1 hour) at which data is generated, and even include lifecycle callbacks to trigger specific actions during the backtest process.



It includes details like:

*   **frameName:** A unique name to identify your frame.
*   **note:** An optional description to explain what this frame represents.
*   **interval:** How often data will be generated within the frame (defaults to 1 minute).
*   **startDate:** The first date your backtest will cover.
*   **endDate:** The last date your backtest will cover.
*   **callbacks:** Functions you can use to react to events happening within the frame.

## Interface IFrameParams

The `IFramesParams` object is what you pass when you create a frame within the backtest-kit framework. Think of a frame as a self-contained unit of work during your backtest. It bundles together things like a logger to help you keep track of what's going on, and a unique identifier called an interval that clearly labels this particular frame. This interval is like a name tag for your frame, making it easier to manage and understand its purpose in the larger backtest process.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into key moments in how your backtest framework handles time periods for trading. Specifically, you can register a function to be run when a new set of timeframes is created. This is a great opportunity to check that the timeframes look right or to record information about them for later analysis. The function receives the generated timeframes, the start and end dates of the backtest, and the interval used, allowing for detailed inspection and potential adjustments.

## Interface IFrame

The `IFrames` interface is a key part of how backtest-kit manages the timing of your trading simulations. Think of it as the system's way of knowing when each piece of data should be used.

Specifically, the `getTimeframe` function is what generates the list of dates and times your backtest will run through.  You give it a symbol (like "AAPL") and a timeframe name (like "daily"), and it returns an array of timestamps, spaced according to your defined interval. These timestamps drive the backtest process, ensuring data is processed in the correct order.


## Interface IExecutionContext

The `IExecutionContext` provides the necessary information for your trading strategies and exchange interactions to run correctly. Think of it as a shared container of data that’s passed around to give your code a sense of time and context. It includes the symbol you're trading, like "BTCUSDT," the current timestamp of the operation, and whether the code is running in a backtesting environment or in live trading. This context is automatically supplied, so you don't need to explicitly manage it; it’s readily available when you need it for actions like fetching historical data or processing ticks.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to a data source and understanding its quirks. It tells backtest-kit where to get historical price data (candles), how to format trade quantities and prices to match the exchange’s rules, and potentially how to retrieve order book information or aggregated trades. Each exchange needs its own instance of this schema, outlining its unique features and data formats. You can also add notes to describe exchange specific details. The schema also allows you to specify callbacks for things like receiving candle data as it arrives.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It’s a blueprint for how the framework understands your exchange's capabilities. To use this, you need to provide functions for retrieving historical candle data, formatting order quantities and prices to match the exchange's rules, fetching order books, and retrieving aggregated trades. These functions let the backtest-kit simulate realistic trading scenarios by interacting with your exchange’s data. Also included are mechanisms for logging and managing the context of the backtest execution, helping to track and understand what's happening during the testing process.


## Interface IExchangeCallbacks

If you're building a custom exchange integration, you can define what happens when candle (OHLCV) data arrives. The `onCandleData` callback lets you react to this incoming data, handling things like storing the new candles or triggering other actions based on the symbol, time interval, and the actual candle data received. You'll receive a list of candles fetched, and you can process them synchronously or asynchronously using `Promise`.

## Interface IExchange

The `IExchange` interface defines how your backtesting framework interacts with an exchange to get historical and future market data. It provides functions to retrieve candle data – both looking back in time and into the future for backtesting purposes – and to format order quantities and prices to match the exchange's specific requirements. You can use it to calculate the average price (VWAP) using the most recent trade data, retrieve the closing price for a given time interval, access the order book, and fetch aggregated trades. The `getRawCandles` method gives you extra flexibility in how you retrieve historical candle data, allowing you to specify start and end dates or a limit, and automatically calculating other necessary parameters. It's designed to ensure the backtest doesn't look into the future and avoids any issues related to look-ahead bias.

## Interface IEntity

This interface serves as the foundation for all objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as the common ancestor for all persistent data – whether it's trade records, account details, or other important information. Any class implementing this interface promises to have a consistent structure for storage and retrieval purposes.

## Interface IDumpInstance

The `IDumpInstance` interface defines how different parts of the backtest-kit framework can store information about what's happening during a simulation. Think of it as a set of tools for saving snapshots of key events and data. Each instance is tied to a specific signal and storage location, meaning it's responsible for saving data related to that particular signal.

You can use these tools to capture various types of data:

*   Full conversation histories between agents.
*   Simple key-value records.
*   Tables of data, automatically figuring out the column headers.
*   Raw text or markdown output.
*   Error messages.
*   JSON data, even if it's complex and nested.
*   Status updates from the Model Context Protocol (MCP).

Finally, when you're done, the `dispose` method allows you to clean up any resources used by the dump instance.

## Interface IDumpContext

This `IDumpContext` object provides the necessary information to identify and categorize data dumps. Think of it as a label that attaches to each piece of data being saved. It contains details like a unique signal identifier, a bucket name to group related data, and a unique ID for the dump itself. There's also a descriptive label to help understand the data, and a flag to indicate whether the data originates from a backtest or a live trading environment. This context helps organize and find dumps later on, especially when searching through large datasets.

## Interface IDictionaryInstance

This interface defines a specialized dictionary designed for use within trading strategies, particularly in backtesting scenarios. Think of it as a way to store and retrieve small pieces of information – like annotations from an AI model or flags indicating specific conditions – that are tied to a particular signal and its time. 

Crucially, this dictionary protects against looking into the future: you can only access data that was available at the time you're evaluating it. If a piece of data wasn't known yet, you won't see it. You can initialize it, read values, write new values or update existing ones, and check if a key exists.  It also allows for deletion of individual entries or a complete clear of the dictionary. Furthermore, you can retrieve lists of keys, values, entries (key-value pairs), or count the number of available entries. Finally, when you're finished with the dictionary, you can dispose of it to release any resources it's using.

## Interface ICommitRowBase

This interface defines the basic structure for events that represent commitments, like orders or trades, that are queued up to be processed later. Think of it as a foundational template for tracking actions that need to happen within the trading system. Each commitment includes information about the trading pair, identified by its symbol, and a flag indicating if the operation is part of a backtesting scenario. It ensures that these events are handled correctly and in the right order, even if they initially occur outside the main execution flow.

## Interface ICheckCandlesParams

This interface defines the information needed to check if we have the necessary historical candle data already stored. Think of it as a way to quickly verify if your backtesting data is complete for a specific trading pair, exchange, and timeframe. You'll specify the symbol like "BTCUSDT," the exchange name, the candle interval (like 1-minute or 4-hour candles), and a date range to cover. This helps avoid unnecessary file scanning and speeds up the process of confirming your data's availability.

## Interface ICandleData

This interface describes a single candlestick, which is a standard way to represent price data over a specific time interval. Each candlestick includes the timestamp of when it started, the opening price, the highest and lowest prices reached during that time, the closing price, and the total trading volume. You'll find this data structure essential when working with VWAP calculations and when performing backtests of trading strategies. It's the basic building block for historical price information.

## Interface ICandle

This interface describes a single candlestick, a common way to represent price data over a specific time period. Each candlestick contains key information: the time it represents (timestamp), the price at which it opened (open), the highest price reached (high), the lowest price reached (low), the price at which it closed (close), and the volume of trading during that time. Think of it as a snapshot of market activity for a given interval. It’s a foundational structure for analyzing price movements and building trading strategies.

## Interface ICacheCandlesParams

The `ICacheCandlesParams` object helps manage how your backtesting framework handles cached historical data. It lets you define specific settings for validation and pre-warming the cache, and crucially, includes callback functions you can use to respond to different stages of this process. Think of it as a way to customize what happens before validation and warm-up begin, allowing you to log events, perform checks, or adjust configurations as needed.  You can specify functions that will be called right before the validation check begins, and again before the warm-up process starts if validation fails.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary setback encountered while trying to place or manage an order. It’s used internally by the backtest-kit framework to handle situations like brief network issues or temporary problems on an exchange. Think of it as a signal that something went wrong, but it's not necessarily a permanent problem.

The system will automatically attempt to retry the order a limited number of times because it assumes the problem is temporary. 

It contains details about the specific error that occurred, though that detail might not always be clear. If a more specific error like an order rejection or deletion occurs, the framework will handle it differently, but this transient verdict handles the cases where the cause is uncertain.

## Interface IBrokerOrderVerdictRejected

When an order can't be filled due to a business-level issue, this tells you why and provides details about the error. This isn't something you create; instead, the system uses it to communicate a permanent rejection. If an order is rejected, it means there's a problem that prevents it from being filled, and retrying won't help. For open orders, the system simply drops them; for closing orders, the system immediately closes the order. The `error` property contains the specific reason for the rejection, so you can understand what went wrong.

## Interface IBrokerOrderVerdictDeleted

This object signals that an order has been removed – essentially, the system knows the order doesn't exist anymore. 

It's used when an order check or synchronization fails because the order was already deleted, like if a user canceled it directly on the exchange. 

Crucially, your adapters and listeners don't create this object directly; they just let the backtest-kit know about the deletion through error handling. The framework then packages this information into the `IBrokerOrderVerdictDeleted` object.

The `reason` property will always be "deleted" in this case, and it carries the original `OrderDeletedError` that triggered the removal.

## Interface IBrokerOrderVerdictConfirmed

This interface represents a decision made about an order, either allowing it to proceed or confirming its status. Think of it as a signal from the trading system saying "yes, this order is good to go" or "this order is still valid." It's not something you build directly; instead, it's a message passed along within the framework to indicate the outcome of a check or gate.

The `reason` property is simple: it just tells you that the order was confirmed, meaning the system approves of the order's current state.


## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` acts as a foundational building block when your trading strategy interacts with the broker. It's used to signal the outcome of a request to the broker, whether that’s confirming an order can proceed or verifying its details. This base type ensures consistency in how the framework handles these decisions, focusing on the 'why' behind the verdict – the reason for approval or rejection – rather than the verdict itself. The `__type__` property is a special identifier that helps the framework understand the specific type of verdict being returned.

## Interface IBroker

This interface, `IBroker`, is how the backtest-kit framework connects to live trading platforms like exchanges or brokers. It's essentially a translator between the framework's internal logic and the actual trading environment.

The `waitForInit` method is crucial for initial setup – think connecting to the exchange, loading credentials, and most importantly, cleaning up any old, lingering orders or positions that might have been left over from previous sessions. This prevents trading against potentially mismatched data.

`onOrderCloseCommit` handles closing trades (take-profit, stop-loss, or manual close).  It's a critical gatekeeper – you place the real closing order here and handle potential errors. If an error happens during closing, the framework will retry the close, but it can force-close if retries fail.

Similarly, `onOrderOpenCommit` manages opening new positions. This is the gate for placing real orders, and errors are handled with retries.  The `clientOrderId` needs to be carefully managed to prevent duplicate orders.

`onOrderActiveCheck` regularly polls the exchange to confirm a position's status. Errors here are tolerated with retries, but repeated failures can lead to forced position closure. `onOrderScheduleCheck` does the same for pending, scheduled orders.

`onSignalActivePing` and `onSignalSchedulePing` are purely informational hooks; they let you react to real-time exchange data and adjust your strategy accordingly.

`onSignalIdlePing` provides a periodic pulse when nothing is actively happening - use it for housekeeping.

The `onSignalScheduleOpen`, `onSignalPendingClose`, `onSignalPendingOpen`, and their counterparts (schedule/cancelled) are lifecycle hooks for signaling transitions - used for placing and clearing orders.

Finally,  the `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit` and `onAverageBuyCommit` hooks are used for handling specific profit-taking and DCA strategies.

## Interface IBreakevenData

This interface defines a simple data structure used to store whether a breakeven point has been achieved for a particular trading signal. It's designed to be easily saved and loaded, typically as a boolean value, making it compatible with JSON serialization. Think of it as a snapshot of the breakeven status – just a true or false indicating if the target has been hit. The data is used within the framework to track progress and can be retrieved later for analysis or restoration.

## Interface IBreakevenCommitRow

This object represents a commitment related to breakeven calculations during a backtest. It signifies an action, specifically a "breakeven" event. The `currentPrice` field within this object tells you the price level at which the breakeven point was determined. Essentially, it's a record of a breakeven calculation occurring at a specific price.

## Interface IBreakeven

The `IBreakeven` interface helps track when a trade's stop-loss order should be moved to the entry price, essentially breaking even on the trade. It's used by different components to manage this process.

The `check` method is responsible for determining if the breakeven point has been reached. It verifies if breakeven hasn’t already been triggered, if the price has moved enough to cover transaction fees, and if it's safe to move the stop-loss. If everything lines up, it marks the trade as having reached breakeven, notifies interested listeners, and saves this status.

The `clear` method resets the breakeven state when a signal is closed, whether it’s due to hitting a take-profit, stop-loss, or time expiry. This ensures that the breakeven tracking is cleaned up and memory is freed.

## Interface IBidData

This interface defines the structure of a single bid or ask price point within an order book. It includes two key pieces of information: the `price` at which the order is available, and the `quantity` of orders currently present at that price. Both price and quantity are represented as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (DCA) process. It tracks a purchase made as part of a larger averaging strategy.

Each record includes the price at which the purchase was made (`currentPrice`), the total cost of that specific purchase in dollars (`cost`), and the cumulative number of purchases (`totalEntries`) that have been made up to that point. Essentially, it's a snapshot of a single averaging transaction.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. Think of it as a record of one transaction, containing details like the price at which it happened, how much was traded, and precisely when it occurred. The `id` gives this record a unique identifier, while the `price` and `qty` properties tell you the value and volume of the trade.  The `timestamp` tells you exactly when it occurred, and `isBuyerMaker` indicates whether the buyer was the one setting the price – this can be helpful for understanding the flow of trading.

## Interface IAgentLogger

The `IAgentLogger` interface provides a way to log information specifically about what your AI agent is doing. Think of it as a separate channel for recording the agent's actions, like its reasoning process, any tools it uses, and the final results. This is distinct from general framework logging, which focuses on the health and stability of the backtest-kit itself. Keeping these separate ensures that user-provided logging implementations aren't affected by agent-specific logging, giving you more control over how you track your agent's behavior.

You'll primarily use the `agent` method to send these agent-related log messages, providing a topic and any relevant details you want to record.

## Interface IActivityEntry

An `IActivityEntry` represents a single instance of a trading activity, whether it's a backtest or a live trade. Think of it as a record keeping track of what's currently running.

These entries are automatically created when an activity begins and removed when it finishes, whether successfully or with an error.

They’re crucial for managing workloads and ensuring that multiple activities don't run at the same time, preventing conflicts.

Each entry contains key information: the trading symbol (like "BTCUSDT"), details about the strategy and exchange being used (including the timeframe), and a flag indicating whether it’s a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a task that's been added to a queue to activate a previously scheduled commitment. Essentially, it's a notification that something that was planned to happen in the future is now being triggered.

The `action` property simply confirms this is an activation-related task.

You’ll find the unique identifier of the signal being activated in the `signalId` property.

If a user manually initiated the activation, the `activateId` will contain the ID associated with that action; otherwise, it will be omitted.

## Interface IActionStrategy

The `IActionStrategy` interface allows your action handlers to peek at the current signal state before they take action. Think of it as a way to check if a signal is ready to be used.

It lets you know if there's an active signal currently affecting a trade – like whether a breakeven, profit target, or loss stop is waiting.

You can also use it to see if a signal is scheduled to appear in the future. 

Essentially, this interface provides a safe way to prevent actions from happening prematurely or unnecessarily when the signal isn't quite ready. It’s used by components like `ActionProxy` to avoid executing certain actions when no signal is present.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom functionality, like connecting to external services or adding logging. Think of it as a way to hook into the core strategy execution and react to events in a personalized way.

You define these custom pieces, called "actions," using this schema to register them with the backtest kit.  Each action has a unique name for identification and optionally, a note for documentation. 

The most important part is the `handler`, which determines how your action will function—it's essentially a blueprint for creating your custom logic. Finally, `callbacks` allow you to specify lifecycle methods that run at different points during the strategy's operation.

These actions are created separately for each strategy and the timeframe it's running on, providing a highly tailored experience. You can add several of these actions to a single strategy to build complex integrations.

## Interface IActionParams

The `IActionParams` object is what gets passed to your actions, essentially containing all the important information they need to function correctly. Think of it as a package of context.

It includes a `logger` to help you track what your actions are doing and spot any issues. You’ll also find the `strategyName` and `frameName` to identify the specific strategy and timeframe the action belongs to.

Crucially, it tells you whether you’re in a `backtest` or live trading environment.  Finally, the `strategy` property provides access to the current market signals and any existing positions, giving your actions the information they need to make informed decisions.

## Interface IActionCallbacks

This API provides a way to hook into different stages of a trading strategy’s lifecycle, giving you fine-grained control over what happens at various points. Think of it as a series of event listeners for your trading bot.

You can set up initialization and cleanup routines with `onInit` and `onDispose` to manage resources like database connections or buffers. These run when the action handler is started and stopped, respectively.

Several callbacks handle signal events. `onSignal`, `onSignalLive`, and `onSignalBacktest` are triggered when a strategy generates a signal, with the latter two specific to live trading and backtesting. You can use these to log events or monitor performance.

Specialized callbacks exist for specific events like breakeven, partial profit/loss, scheduled events, and risk rejections. These provide data-rich notifications related to those specific conditions.

For scheduled events, `onPingScheduled` lets you monitor a pending order, while `onScheduleEvent` alerts you to the creation or cancellation of scheduled signals.  `onPendingEvent` provides insights into the opening and closing of pending positions. `onPingActive` monitors active positions and `onPingIdle` is triggered when nothing’s happening.

`onOrderSync` and `onOrderCheck` are crucial for managing order flow and handling potential errors. `onOrderSync` allows you to influence order openings and closings, while `onOrderCheck` is designed to proactively verify order status, preventing unexpected shutdowns. These callbacks use exception-based logic, offering strong error handling capabilities.

Essentially, these callbacks provide the building blocks to customize your trading system’s behavior in response to a wide range of events and conditions.

## Interface IAction

This interface, `IAction`, is your central hub for integrating custom logic into the backtesting and live trading framework. Think of it as a set of event listeners – it provides methods that get triggered by various occurrences within the system.  You can use these methods to connect your own systems, like a dashboard, logging system, or to manage your trading state using tools like Redux or Zustand.

The framework will "call" these methods to notify you about different events.  There's a method for nearly everything – from when a signal is generated (`signal`, `signalLive`, `signalBacktest`) to when profit or loss levels are triggered (`partialProfitAvailable`, `partialLossAvailable`) or even when a scheduled signal is about to activate (`pingScheduled`).

You'll find specific methods dealing with order management too, like `orderSync` which lets you react to attempts to open or close positions via limit orders, and `orderCheck` which verifies pending orders still exist on the exchange.  Finally, the `dispose` method ensures clean cleanup when your integration is no longer needed. Using these callbacks helps you react to what’s happening in your strategy execution.

## Interface HighestProfitStatisticsModel

This model keeps track of all the times your trading strategy achieved the highest profit. It stores a complete list of these profitable events, sorted from the most recent to the oldest. You can also see the total number of times your strategy reached this peak profit level, giving you a sense of how frequently it happens. Essentially, it's a record of your best-performing moments.

## Interface HighestProfitEvent

This data represents the single most profitable moment observed for a specific trade. It tells you exactly when that highest profit was achieved, what asset was being traded (the symbol), and which strategy was responsible. You'll find a unique identifier for the signal that triggered the trade, along with details on whether it was a long or short position. 

The record includes a breakdown of the position's overall profit and loss (PNL), along with the highest profit point reached and the largest drawdown experienced during the trade.  You'll also see the price at which the peak profit occurred, the initial entry price, and the designated take profit and stop-loss prices. Finally, it indicates if this event happened during a simulated backtest.

## Interface HighestProfitContract

The HighestProfitContract provides information when a trading strategy reaches a new peak profit level. It gives you details like the trading symbol involved (e.g., "BTC/USDT"), the price at that moment, and the exact time it happened. You’ll also get the strategy's name, the exchange used, and the timeframe (like "1m" or "5m"). 

Critically, it includes the signal data that triggered the trade, helping you understand the conditions leading to the profit. A key piece of information is whether this profit update comes from a backtest (historical data) or a live trading scenario.

This contract lets you build custom actions based on these profit milestones, like setting trailing stops or taking partial profits. The 'when' property will represent either the virtual time during a backtest or the real-time clock when the event happens.

## Interface HeatmapStatisticsModel

This data structure provides a comprehensive overview of your portfolio's performance across all the assets it holds. It aggregates key metrics to give you a holistic view of how your trading strategy is performing.

You'll find details like the total number of assets in your portfolio, the overall profit and loss, and key risk-adjusted return measures such as the Sharpe and Sortino ratios. The structure also includes metrics related to peak profit, maximum drawdown, and average trade durations, allowing you to understand the risk profile of your portfolio.

Beyond these standard measures, it also provides insights into win and loss streaks, durations of winning and losing trades, and more advanced ratios like the Calmar and Recovery Factor, offering a deeper understanding of your portfolio’s efficiency and resilience. Finally, it delivers annualized returns and expected yearly returns projections for a long-term perspective.

## Interface DoneContract

This interface represents the information passed when a background process finishes, whether it's a backtest or a live trading session. 

It tells you which exchange and strategy were involved, and importantly, whether it was a backtest or a live execution.

You’ll also get the trading symbol and a timestamp indicating when the process concluded.

For backtests, this timestamp marks the end of the last candle analyzed; for live environments, it's based on the last tick processed.


## Interface CronHandle

The `CronHandle` is like a ticket you get when you schedule a task using the cron functionality. Think of it as a way to keep track of your scheduled job.  When you’re done with the job, or want to cancel it, you use this handle to tell the system to remove it – it's essentially the same as manually removing the task from the cron schedule. It gives you a simple way to manage your scheduled events.

## Interface CronEntry

This describes how to schedule tasks within your backtesting framework. Each scheduled task, or "CronEntry," needs a unique name to identify it, and this name can't contain colons.

You specify the time interval for the task to run, like every minute or every hour. If you skip the interval, the task will execute just once immediately.

A whitelist of symbols controls how the task is distributed across different backtests. If the whitelist is empty, the task runs only once for all backtests at each interval. If you provide symbols, the task runs once for each symbol on the list at each interval.

Finally, there’s a handler function that actually performs the task.  The handler will run whenever the task's conditions are met, and if an error occurs, it will retry.

## Interface CriticalErrorNotification

This notification signals a critical error that requires the trading process to stop immediately. 

It's a special kind of notification designed to ensure you're aware of severe problems.

Each notification has a unique identifier (`id`) and a human-friendly explanation (`message`) to help you understand the issue. 

The `error` property provides detailed information about the error, including its stack trace and any related data. 

Importantly, the `backtest` flag will always be false because these errors originate from the live trading environment, not a simulated backtest.


## Interface ColumnModel

This describes how to define a column when you're creating a table to display data. Think of it as setting up a blueprint for each column you want to show.

You'll need to give each column a unique identifier, which is its `key`.  A friendly `label` lets you choose what to show as the column header.

The `format` function is where you tell the system how to turn your data into a readable string for that specific column – it handles the transformation. Finally, `isVisible` allows you to control whether a column is shown or hidden based on some condition, giving you flexible table customization.

## Interface ClosePendingCommitNotification

This notification signals that a pending trade was closed before it fully activated. It provides a wealth of information about the trade, including a unique ID, the exact time of the closure, and whether it occurred during backtesting or live trading.

You'll find details like the trading pair, the strategy and exchange involved, and a unique identifier for the signal itself.  The notification breaks down the specifics of the trade, revealing the trade direction (long or short), the original and effective entry, take profit, and stop-loss prices, and the number of entries and partial closes.

It also includes comprehensive performance data: total profit and loss (PNL), peak profit achieved, maximum drawdown, and related prices and percentages.  You'll see the original entry price, the cost of the initial position, and various flags indicating settings like leverage and margin isolation. Timestamps pinpoint the signal's creation and activation. A field allows for a custom note to describe the reason for the closure. Finally, a creation timestamp for the notification itself is also present.

## Interface ClosePendingCommit

This signal indicates that a previously opened position is now being closed. It provides details about the closing event, including a user-defined identifier for the reason behind the closure. 

You’ll also find comprehensive information about the position's performance, such as the total profit or loss (PNL) accumulated throughout its existence.

The signal also reports the highest profit reached by the position and the largest loss experienced at any point during its lifecycle. This helps in understanding the risk and reward profile of the closed trade.

## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trade signal has been cancelled before it could be executed. It provides a wealth of information about the cancelled signal, allowing you to understand why it wasn't triggered and analyze its potential impact.

The notification includes details like a unique ID, the timestamp of the cancellation, and whether it occurred during backtesting or live trading. You’ll find specifics about the trading pair, the strategy involved, and the exchange used.

It breaks down the planned trade, detailing the intended position (long or short), the target entry price, and the planned take profit and stop-loss levels – both as originally set and as they would have adjusted with trailing.

Furthermore, it provides a comprehensive view of the potential trade's performance, including PNL calculations, peak profit, maximum drawdown, and cost information. A user-provided note can offer additional context for the cancellation, and the creation timestamp gives a full timeline of the signal's lifecycle. This allows you to debug signal behavior or understand trade flow issues.

## Interface CancelScheduledCommit

This interface represents a request to cancel a previously scheduled signal event. It's used when you need to retract a signal that was planned for future execution. 

The `action` property confirms that the intention is to cancel a scheduled event.  You can provide a `cancelId` to help track why the cancellation happened, which is useful for debugging or user feedback. 

Along with the cancellation request, it also includes data about the position being closed, such as total profit and loss (`pnl`), the highest profit ever reached (`peakProfit`), and the largest loss experienced (`maxDrawdown`). This information gives context to the cancellation and helps assess the impact of the change.

## Interface BreakevenStatisticsModel

This model gives you a breakdown of breakeven events that occurred during a backtest.

Think of it as a record of when your trading strategy reached a point where it could have potentially broken even.

It includes a list of all the individual breakeven events, each with its own specific information, and a count of just how many such events took place. You can use this to understand how frequently your strategy hits these critical milestones.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized record whenever a trading signal reaches its breakeven point. This event gathers key details about the trade, including the exact time it happened, the symbol being traded, the name of the strategy used, and the unique identifier of the signal.

It also tracks critical pricing information like the current market price, the initial entry price, and both take profit and stop loss levels, along with their original values set when the signal was created. If a dollar-cost averaging (DCA) strategy was used, the event includes details about the number of entries and partial closes. 

Furthermore, it captures the profit and loss (PNL) status at the time of breakeven, a human-readable explanation of why the signal was triggered, timestamps for activation and signal creation, and an indicator of whether the trade occurred during a backtest or live trading session. This comprehensive data allows for detailed analysis and reporting of trading performance.

## Interface BreakevenContract

This interface represents a breakeven event, which occurs when a trading signal's stop-loss is adjusted to the original entry price. It's a way to track when a strategy has reduced its risk by covering transaction costs and reaching a point where no further loss can occur.

Each breakeven event is specific to a trading pair (symbol), a strategy, an exchange, and a timeframe. It also includes all the original data of the signal that triggered it, along with the current price at which breakeven was achieved.

You'll find a flag indicating if the event is from a backtest (using historical data) or live trading. A timestamp and date are provided to indicate precisely when the event occurred, using either the candle time in backtests or the real-time clock during live trading. This information helps in building reports or responding to breakeven milestones.


## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a commitment action has been executed, like closing a position. It provides a wealth of information about the trade, including a unique identifier, the timestamp of the event, and whether it occurred during backtesting or live trading.

You'll find details about the trading pair, the strategy involved, and the exchange where the trade happened.  The notification also includes specifics about the trade itself: entry price, take profit levels, stop-loss levels, and the position direction (long or short).

Detailed financial information is included, such as the cost of the trade, the applied leverage (multiplier), and potentially relevant margin settings.  The notification also gives insights into performance metrics like peak profit, maximum drawdown, and profit/loss expressed as both percentages and in USD. 

Additional properties like `note` offer optional context, while `scheduledAt`, `pendingAt`, and `createdAt` track the signal’s lifecycle from creation to notification.  This notification provides a comprehensive snapshot of a breakeven trade.


## Interface BreakevenCommit

This interface represents an event triggered when a breakeven action is taken within a trading strategy. It signals that the strategy has adjusted a position to break even, protecting some initial capital.

The event provides detailed information about the position at the time of this adjustment. You'll find the current market price, the overall profit and loss (pnl) of the trade, and details of the peak profit and maximum drawdown it experienced.

It also includes key price points like the original entry price, the initial take profit and stop-loss levels, and how those levels have potentially changed due to trailing mechanisms. The trade direction (long or short) is specified along with timestamps for when the signal and position were initiated. Essentially, it's a snapshot of a position’s state when a breakeven was triggered, useful for analysis and understanding the strategy’s behavior.


## Interface BreakevenAvailableNotification

This notification signals that your trading position's stop-loss can now be moved to your entry price, essentially allowing you to break even. It provides a wealth of details about the position, including its unique identifier, the timestamp of the event, whether it's from a backtest or live trading, and the trading pair involved.

You'll find important information like the strategy name, exchange, signal ID, current price, and your initial entry price.  The notification also includes information about take profit and stop loss levels, both original and adjusted.

The notification details the cost of the initial position, leverage (multiplier), and margin type (isolated), alongside the number of entries and partial closes. It offers a comprehensive view of the position’s performance including P&L, peak profit, maximum drawdown, and associated prices. Finally, it includes optional notes and timestamps to give full context to the event.

## Interface BeforeStartContract

This event signals the very beginning of a trading strategy's run, right before the actual trading simulation or live execution begins. Think of it as a "get ready" signal for your strategy. It's a crucial point to set things up, like initializing logs, resetting counters, or sending a notification that a new run has started.

You're guaranteed this event will only happen once per run and will always be followed by a corresponding event marking the end of the run, even if something goes wrong during the process. Any errors that occur during your setup will be handled separately so they won’t interrupt the overall run.

The information included provides details about the trading symbol, the strategy being used, the exchange providing data, the timeframe, and whether it's a backtest or live run. A current price for the symbol and a timestamp are also given for convenience. In backtest mode, the timestamp represents the intended start of the historical data; in live mode, it’s the current time.

## Interface BacktestStatisticsModel

This model encapsulates all the key statistical data generated from a backtest, offering a comprehensive view of your trading strategy's performance. It organizes information into categories like total signals, win/loss metrics, and risk-adjusted return ratios. You'll find details on individual trade performance in the `signalList` array, and higher-level summaries like average P&L, standard deviation, and Sharpe Ratio, all of which help gauge profitability and risk.

The framework also provides insights into trade durations, consecutive win/loss streaks, and market pressure – helping you understand not just *if* you're making money, but *how* and *why*. It includes metrics like expectancy and Calmar Ratio to evaluate overall trading efficiency. Finally, the trend analysis provides a broad market direction indicator based on price action. Many of these values will be null if the calculation couldn't be performed safely due to data issues.

## Interface AverageBuyCommitNotification

This notification lets you know when a new averaging (DCA) order has been added to an existing position. It provides a wealth of information about that averaging step, including the price it was executed at, the total cost, and how it impacts the overall position. You’ll find details like the current price, the number of averaging entries made so far, and the strategy that generated the signal.

The notification also includes comprehensive performance metrics for the entire position, such as peak profit, maximum drawdown, and overall profit/loss – both in percentage and dollar terms. It also shows the original entry price, and how the effective entry price has changed as more averaging orders are placed. Crucially, it helps track how the position has evolved over time with signals such as the schedule and pending timestamps. This provides a complete view of your DCA strategy's progress and performance.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, signals a new average-buy (often referred to as dollar-cost averaging or DCA) has been added to an existing position. It provides a snapshot of the position's status immediately after this averaging purchase.

You’ll find details about the price at which the new buy occurred (`currentPrice`), and the overall cost of that specific averaging transaction (`cost`). The `effectivePriceOpen` property tells you the new, averaged entry price after this purchase.

The event also contains comprehensive information about the position's performance, including unrealized profit and loss (`pnl`), the highest profit ever achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).

You can access information like the original entry price (`priceOpen`), the current take profit and stop loss levels (`priceTakeProfit`, `priceStopLoss`), and their original values before any trailing adjustments were applied. Finally, timestamps (`scheduledAt`, `pendingAt`) show when the signal was created and the position was activated.

## Interface AfterEndContract

This interface signals the completion of a trading strategy run, providing essential information for cleanup and reporting. It’s designed to be triggered exactly once for each strategy execution, ensuring reliable teardown processes. Think of it as a notification that the strategy has finished, whether it ran successfully, encountered an error, or was stopped early.

The `when` property, representing the event time, has different meanings depending on whether you're in backtest or live trading mode. In backtest mode, it reflects the time of the last candle processed, or the frame's start time if no candles were processed. In live mode, it's the current time rounded to the nearest minute.

You’ll find key details like the trading symbol, the strategy's name, the exchange, and the timeframe used. A `backtest` flag indicates if the run was a simulation or a live trade. The `currentPrice` offers a quick reference to the average price observed during the run.  The `timestamp` provides the same information as `when` but as a number, simplifying data serialization and logging. This lets you perform tasks like flushing data buffers, finalizing calculations, or notifying other systems about the run's completion, all with confidence that these actions happen reliably at the end of each run.

## Interface ActivePingContract

This describes a special notification, called an "active ping," that your trading system sends out regularly while it's actively waiting for a trading signal to become a confirmed trade. Think of it as a heartbeat signal confirming the signal is still active and being watched.

Each active ping contains a lot of useful information about the signal being monitored, including the trading pair (like BTCUSDT), the strategy name, the exchange involved, and the timeframe being considered.  You'll get the full details of the pending signal itself, along with the current price of the asset.

The `backtest` property tells you whether the ping is coming from a historical simulation (backtest) or from live trading. Importantly, the `when` timestamp represents either the candle timestamp during a backtest or the actual time during live trading.

You can use these active ping notifications to create custom logic – for example, to adjust your strategy based on how the price moves, or to handle signals in a specific way. The system provides ways to listen for these pings – either continuously or just once – allowing you to react to the signal’s lifecycle.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning the trading plan is now in motion. It provides a wealth of detail about the trade, including when it was activated, the specific strategy and exchange involved, and the trade's parameters like position size, take profit, and stop loss levels.  You’ll find information about the trade’s cost, leverage, and any partial closes that have occurred. 

The notification also contains extensive performance metrics, such as peak profit, maximum drawdown, and profit/loss percentages. You can see how the position has performed since its inception, including the entry and exit prices used for PNL calculations.  Finally, timestamps indicate when the signal was originally created and when it transitioned into a pending state.  A note field allows for a short, human-readable explanation for the trade’s activation.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a scheduled signal is activated, marking the start of a trade. It provides a snapshot of the trade’s key details at the moment of activation. 

You'll find information like the activation reason identifier provided by the user, the current market price, and crucial performance metrics for the position like total profit and loss (PNL), peak profit, and maximum drawdown. 

It also outlines fundamental aspects of the trade, including its direction (long or short), entry price, take profit levels (both original and adjusted), stop-loss levels (original and adjusted), when the signal was initially created, and the time the position was actually activated. This comprehensive set of data gives a complete picture of the activated trade and its associated context.
