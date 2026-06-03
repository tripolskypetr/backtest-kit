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

This interface describes the signals sent when a walker is being stopped. 

Think of it as a notification that a particular trading strategy has been asked to pause or halt its operations. 

The signal includes the trading symbol involved, the name of the strategy being stopped, and crucially, the name of the walker that triggered the stop request. This is especially important when you have several strategies running concurrently on the same trading pair.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a clear way to represent the results of a backtesting walk, especially when you're comparing different strategies. It builds upon the existing WalkerResults data and adds information for comparing how each strategy performed. Think of it as a central place to hold all the performance details for each strategy you've tested, allowing you to easily analyze and contrast their strengths and weaknesses. Specifically, it contains an array where you'll find results for each individual strategy, allowing you to examine their performance in detail.

## Interface WalkerContract

The WalkerContract represents updates as your trading strategies are being tested and compared. It's like a progress report, letting you know when a strategy finishes a test run and what its results are.

Each update includes details about the specific trading environment—the exchange, frame, and symbol being tested—as well as the name of the strategy that just completed.

You’ll get key performance statistics (like profit, Sharpe ratio, etc.) for the strategy, along with the value of the metric being optimized. The report also tracks the overall best-performing strategy found so far and how many strategies have been tested out of the total planned. This allows you to monitor the optimization process and understand how each strategy stacks up against the others.

## Interface WalkerCompleteContract

The WalkerCompleteContract signals that a backtesting process is finished and all strategies have been evaluated. It carries a full report of the comparison, letting you know which walker, symbol, exchange, and timeframe were used. 

You'll find details about the optimization metric, the total strategies tested, and most importantly, the name of the best-performing strategy. 

The contract also includes the best metric value achieved and provides detailed statistics for that top-performing strategy, giving you a complete picture of the results.

## Interface ValidationErrorNotification

This notification signals that a validation error has occurred during the backtesting or live trading process. 

It’s essentially a way for the system to tell you something went wrong with the checks and balances you've put in place to ensure your trading logic is sound.

Each notification includes a unique ID to track it, a detailed error message to understand the problem, and a full error object containing technical details like the stack trace. 

Importantly, the `backtest` property will always be false because these errors arise from the live trading context, not the backtest simulation itself.


## Interface ValidateArgs

This interface, ValidateArgs, provides a way to ensure the names you're using for different parts of your trading setup—like exchanges, timeframes, strategies, and risk profiles—are correct. 

Think of it as a checklist to make sure your components are referring to things properly. Each property within ValidateArgs represents a different component (Exchange, Frame, Strategy, etc.), and they all expect an enum value. 

This enum value will be checked against a list of known, valid options for that component, helping to catch errors early and keep your backtesting process reliable. It's a foundational element for ensuring your entire backtesting system is consistent and well-defined.


## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take-profit order has been executed, essentially when your strategy has automatically adjusted its take-profit price based on market movements and then closed the trade. It includes a unique ID and timestamp for tracking purposes.

You'll find details like the trading symbol (e.g., BTCUSDT), the strategy that triggered the trade, and whether it happened in backtest or live mode.  It provides a complete picture of the trade's execution, including the entry price, the final take-profit price after trailing adjustments, and original prices before trailing.

The notification also breaks down performance metrics for the trade, such as total profit/loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. You can see how much capital was invested and at what prices, along with relevant timestamps for when the signal was created, went pending, and when the trailing take profit was committed. Finally, a note field is available for any additional information about the signal.

## Interface TrailingTakeCommit

This interface represents a trailing take profit event within the backtest-kit framework. It details when a trailing stop mechanism adjusts a take profit level. 

The `action` property confirms this is a trailing take event.  `percentShift` indicates the percentage used to calculate the take profit adjustment. 

You'll find the `currentPrice` reflecting the market price when the adjustment occurred. Associated with the trade is profit and loss information, including the total `pnl`, the `peakProfit` reached, and the `maxDrawdown` experienced.

The `position` property clarifies whether the trade is a long (buy) or short (sell) position. Essential entry and pricing data, like the `priceOpen`, `priceTakeProfit`, `priceStopLoss`, and their original values (`originalPriceTakeProfit`, `originalPriceStopLoss`), are also provided.  Finally, `scheduledAt` and `pendingAt` give timestamps related to the event’s creation and the position's activation.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy that generated the signal, and the exchange used.

The notification breaks down the specifics of the trade: entry and stop-loss prices, how they might have been adjusted by trailing, and the total profit or loss realized, including peak profits and maximum drawdown experienced. It also includes details on any DCA (Dollar-Cost Averaging) or partial closes that might have been involved, and critical pricing data used for profit/loss calculations. Finally, there are fields for notes, scheduling details, and timestamps representing various key moments in the trade’s lifecycle.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop order is executed. It contains a lot of detail about the trade that just happened and the position's history.

You'll find the type of action taken, which is specifically a "trailing-stop."  The `percentShift` indicates how much the stop loss was adjusted based on the trailing percentage. 

The event also records key price points: the `currentPrice` when the trailing stop happened, the `priceOpen` at the entry, and the final `priceTakeProfit` and `priceStopLoss` levels.  Importantly, it also preserves the `originalPriceTakeProfit` and `originalPriceStopLoss` to show how the levels have changed.

It also includes performance metrics like `pnl` (profit and loss), `peakProfit`, and `maxDrawdown` calculated throughout the position's lifetime. Finally, the event provides timestamps for when the signal was created (`scheduledAt`) and the position was activated (`pendingAt`), along with the trade's direction (`position`).

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all types of events occurring during trading, ensuring consistent data for reporting and analysis. It bundles together all relevant information about a tick, regardless of whether it’s an opening, closing, scheduling, or cancellation.

The `timestamp` field records precisely when the event occurred, whether it’s the scheduled creation time or when a position became active.  The `action` property clarifies the type of event, allowing you to easily distinguish between a new signal being scheduled, a position being opened, or a trade being closed.

Specific details vary based on the `action`. For example, when a position is open or being scheduled, you'll find properties like `priceTakeProfit` and `priceStopLoss` to define risk management parameters.  When a position closes, `duration`, `closeReason`, and performance metrics like `pnl` and `peakPnl` become available. 

The inclusion of fields like `totalEntries` and `totalPartials` acknowledges the use of strategies involving multiple entries or partial closing, providing a detailed view of those processes.  Finally, properties such as `pendingAt` and `scheduledAt` provide important timeline context for the trade's lifecycle.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are syncing with the system. It provides a collection of all the synchronization events that have occurred, along with the total number of events processed. You can also easily see how many signals have been opened and closed based on these synchronization events, giving you insights into the lifecycle of your signals. Think of it as a snapshot of your signal synchronization activity.

## Interface SyncEvent

This data structure holds all the important information about what happened during a trading signal's lifecycle, useful for generating reports. Think of it as a snapshot of an event – whether it’s a signal being created, filled, closed, or something else.

Each event includes details like when it occurred, which trading pair was involved, the strategy and exchange used, and even the current market price. It tracks things like entry prices, take profit and stop-loss levels (both the originals and any adjusted values), and how many entries or partials were made. 

You’ll also find performance metrics like profit and loss (pnl), peak profit, and maximum drawdown, along with reasons for position closure if applicable. A flag indicates if the event came from a backtest, and a timestamp shows when the event record was created.

## Interface StrategyStatisticsModel

This model holds the statistical results of your trading strategy's performance. It's like a scorecard detailing what actions your strategy took and how many times.

You'll find a complete list of all events that occurred during the backtest in the `eventList`.

The `totalEvents` property simply tells you the total number of actions taken. 

There are also counts for specific action types: cancellations, pending closes, partial profits and losses, trailing stops, take profits, breakeven adjustments, and average-buy (dollar-cost averaging) events. This breakdown lets you quickly see the prevalence of different strategies.

## Interface StrategyEvent

This `StrategyEvent` provides a central collection of data related to strategy actions, designed to be useful for generating reports. It essentially captures everything you need to know about what the strategy did and when.

Each event includes details like the timestamp, the trading pair, the strategy’s name, and the exchange it's operating on. It also tracks the specific action taken – whether it was a new trade, a partial close, or something else.

You'll find price information like the current market price, entry prices, take profit and stop loss levels, and even how those levels have changed due to trailing stops.  For strategies involving DCA (Dollar-Cost Averaging), it tracks details like the total entries and averaged entry price.

The event also provides identifiers for actions like cancellations and closures, along with timing information like when the action was created and when the position went pending. Finally, it includes information regarding Profit and Loss (PNL), cost of the entry, and an optional note for additional context.

## Interface SignalSyncOpenNotification

This notification tells you when a signal, specifically a limit order, has been activated and a position has been opened. It provides a wealth of detail about the trade, including when it happened, the trading pair involved, and the strategy that triggered it. You'll find key information like the entry price, stop-loss and take-profit levels (both original and adjusted), and crucial performance metrics such as peak profit, maximum drawdown, and overall profit/loss, along with the associated prices and costs. This notification is useful for tracking the performance of your strategies and understanding the detailed outcome of each trade, whether it’s running a backtest or a live strategy. It also indicates if the event occurred during backtesting or live trading, which is essential for accurate analysis.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it's from a backtest or a live trade. It provides a wealth of information about the closed position, including when it was created and closed, what strategy generated it, and the exchange it was executed on. You'll find key details like the entry and exit prices, total profit and loss (both absolute and percentage), and peak profit/drawdown metrics, along with the original take profit and stop loss prices before any adjustments. The notification also tells you why the signal closed—whether it was a take profit, stop loss, time expiration, or manual closure—and gives the total number of entries and partials used. Ultimately, it’s a comprehensive record of a completed trade, allowing for in-depth analysis and performance tracking.

## Interface SignalSyncBase

This interface defines the common information shared across all signal synchronization events within the backtest-kit framework. It ensures all signal events, whether from a backtest or live trading environment, have a standardized set of properties. 

You'll find essential details here like the trading symbol (e.g., BTCUSDT), the name of the strategy generating the signal, the exchange used, and the timeframe being analyzed. A key property indicates whether the signal originates from a backtest simulation or actual live trading. 

Each signal also gets a unique identifier and a timestamp corresponding to the moment it was generated or the corresponding tick in a backtest. Finally, the interface provides access to the full details of the public signal data at that point in time.

## Interface SignalScheduledNotification

This notification lets you know a trade has been planned for the future. It's like a heads-up that a signal has been scheduled to execute later.

Each notification includes details like a unique ID, when the signal was scheduled, and whether it's part of a backtest or live trading. You'll see specifics about the trading pair (like BTCUSDT), the strategy that generated it, and the exchange where it will be executed.

It also provides crucial information about the planned trade: the direction (long or short), target prices (entry, take profit, stop loss), and details about any DCA averaging or partial closes involved.

Further, you get performance data associated with the planned trade, like potential profit and loss (both absolute and percentage), peak profit, and maximum drawdown information, giving you insights into the potential risk and reward. Finally, a note field allows for any added context or reasons behind the signal.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of information about the trade, including a unique identifier and timestamp. You'll find details about whether the trade occurred in backtest or live mode, the trading symbol, the strategy and exchange involved, and the trade direction (long or short).

The notification also includes specifics about the entry price, take profit, and stop-loss levels, along with their original values before any adjustments. If the strategy uses dollar-cost averaging (DCA), you’ll see information regarding the total entries and partial closes executed.

Furthermore, it captures detailed performance metrics such as the cost of the trade, profit and loss (PNL) calculations, peak profit, maximum drawdown, and related price points – giving you a comprehensive view of the trade's potential. A human-readable note can sometimes be provided to explain the reasoning behind the signal.  Finally, it includes timestamps for signal creation, pending status, and overall creation of the notification itself.

## Interface SignalOpenContract

This event signifies that a trading signal, specifically a limit order, has been successfully executed. Think of it as confirmation that your order was filled on the exchange.

It's triggered in backtesting when the price meets your pre-defined conditions (like a candle low being below your entry price for a long position). In live trading, it happens when the exchange actually fills the limit order.

The event provides a wealth of information, including the current market price, your profit and loss (both overall and peak values), and the cost of entering the position.

You’ll also find details on the original entry and take profit/stop loss prices, along with timestamps indicating when the signal was initially created and when the position was activated.  It includes details about any averaging (DCA) or partial exits that occurred.

This event is particularly useful for external systems that need to track and synchronize order management, or for logging and auditing purposes.

## Interface SignalInfoNotification

This notification type lets you receive information about open positions broadcasted by your trading strategies, acting as a detailed status update. It's particularly useful for understanding what's happening in backtest or live mode.

Each notification includes key details like the strategy's name, the exchange used, a unique signal ID, and the current market price. You'll also find position specifics like entry price, take profit levels, and stop-loss values – both the original and adjusted (trailing) ones.

Beyond the basics, you gain a deep understanding of performance. The notification includes profit/loss data (both absolute and percentage), peak profit and drawdown metrics, along with associated prices and entry counts.  A helpful note field allows strategies to communicate custom information. Finally, timestamps help track the signal’s lifecycle, from creation to pending and active states. You can use the notification ID to track notifications across different systems.

## Interface SignalInfoContract

This interface, `SignalInfoContract`, helps you broadcast custom messages related to your trading strategies. It's like a notification system built into the backtest-kit framework.

When your strategy needs to communicate something – perhaps a debugging message, a custom annotation, or send a signal to an external system – it uses `commitSignalInfo()` and this contract defines the structure of that information.

The information shared includes details like the trading symbol, strategy name, exchange, and execution frame. You'll also get access to the full signal data, the current price, and a user-defined note or ID to help track the message.

Finally, it indicates whether the signal originated from a backtest (historical data) or a live trading session, along with a timestamp for precise timing. Consumers can listen for these notifications to receive and process the information.

## Interface SignalData$1

This data structure holds all the key details for a single trading signal after it’s been closed. Think of it as a record of one completed trade. 

It tells you which strategy created the signal, gives it a unique ID, and identifies the asset being traded.  You'll find the position taken (long or short), the percentage profit or loss (PNL) realized, and why the signal ended.  Finally, it includes the timestamps marking when the signal was initially opened and when it was closed, providing a complete timeline for the trade.

## Interface SignalCommitBase

This defines the basic information shared by all signal commitment events within the backtest-kit framework. Each signal commit includes details like the trading symbol, the name of the strategy that generated it, and the exchange used. You’ll also find information specific to backtesting, such as the timeframe and a flag indicating whether it’s a backtest event.

A unique ID and timestamp are provided for each signal, alongside figures representing the number of DCA entries and partial closes. Critically, it includes the original entry price, which remains constant even with averaging strategies, and a snapshot of the signal data itself. Finally, there’s an optional field for a human-readable note explaining the signal’s rationale.

## Interface SignalClosedNotification

This notification provides details when a trading position is closed, whether it's due to a take profit, stop loss, or time expiration. It contains a wealth of information about the trade, including a unique identifier, the time it closed, and whether it happened during a backtest or live trading. You'll find specifics about the trading pair, the strategy used, and the direction of the trade (long or short). 

The notification also tracks key performance indicators such as profit/loss percentage and total profit/loss in USD, along with details about peak profit and maximum drawdown during the position's lifespan. It outlines entry and exit prices, original target prices before trailing, and even the total number of entries and partial closes. This data helps you understand the trade’s performance, analyze risk management effectiveness, and debug any strategy issues. Finally, you'll see timestamps for signal creation and pending/active statuses, allowing you to track the full lifecycle of the trade.

## Interface SignalCloseContract

This event, called `SignalCloseContract`, lets other systems know when a trading signal has been closed. This happens when a profit target is hit, a stop loss is triggered, time runs out, or a user manually closes the position.

It's useful for things like updating external order books or recording the final profit and loss in a separate system.

The event provides detailed information about the closed position, including the current market price, the overall profit and loss (including all entries), the highest profit ever reached, the biggest loss, whether it was a long or short trade, and the original and adjusted prices for entry, take profit, and stop loss. You’ll also find information about when the signal was created and when the position was activated, the reason for closure, and details about any averaging or partial closures that occurred.

## Interface SignalCancelledNotification

This notification appears when a previously scheduled trading signal is cancelled before it’s activated. It provides detailed information about the cancelled signal, allowing you to understand why and when the cancellation happened. 

You'll find details like the signal's unique identifier, the trading pair involved (e.g., BTCUSDT), the strategy that generated it, and the intended trade direction (long or short). The notification also includes the planned entry price, take profit and stop-loss levels, both as initially set and after any adjustments. 

Crucially, it specifies the reason for the cancellation, such as a timeout or user intervention, and if the signal was generated in backtest or live mode. You’ll also see timestamps for various stages – when the signal was created, when it was scheduled, and when it was cancelled – along with any notes associated with the signal. This comprehensive data helps in debugging and optimizing your trading strategies.

## Interface Signal

The `Signal` object in backtest-kit represents a trading signal, tracking its key characteristics. It holds the opening price of the trade (`priceOpen`), which is the initial price used when entering the position.

Crucially, it maintains a record of entry events (`_entry`), storing the price, cost, and timestamp for each time a position was initiated.

Additionally, the `_partial` array tracks partial exits from the position, noting whether they were for profit or loss, the percentage of the position closed, the current price at the time of the partial exit, the cost basis at the time of the close, and the entry count at the time of the close, along with the associated timestamp. This allows for detailed analysis of how a position was managed.

## Interface Signal$2

This `Signal` object represents a trading signal and contains important information about a position. It keeps track of the initial entry price for the trade, which is stored in the `priceOpen` property.

The `_entry` array stores a record of each individual entry made within the position, noting the price, cost, and the exact time of each entry. 

Similarly, `_partial` logs any partial exits from the position, detailing the type of exit (profit or loss), the percentage gained or lost, the price at the time of exit, the cost basis at the time, the number of units closed, and the timestamp of the action. These records provide a detailed history of the position's activity.

## Interface Signal$1

The `Signal` object in backtest-kit holds information about a trading signal.

It tracks the entry price for a position using the `priceOpen` property, which is a simple numerical value.

Internally, it maintains records of entry events in the `_entry` array. Each entry includes the price at the time of entry, the total cost (including fees), and a timestamp marking when it happened.

Similarly, it keeps track of partial exits (either profits or losses) in the `_partial` array.  Each partial exit entry indicates the type of exit (profit or loss), the percentage of the position exited, the current price at the time of the partial exit, the cost basis at the time of close, and the number of shares or contracts exited, along with a timestamp.

## Interface ScheduledEvent

This data structure represents a single event related to a trade, whether it was scheduled, opened, or cancelled. It provides a comprehensive record of what happened, including when it occurred (timestamp) and what action was taken (action). You'll find details like the trading symbol (symbol), a unique identifier for the signal (signalId), and the type of position held.

The structure also holds pricing information like the entry price (priceOpen), take profit (priceTakeProfit), and stop loss (priceStopLoss) levels, along with their original values before any changes. For trades that used DCA (Dollar Cost Averaging), you'll see entries for the total number of entries and partial closes.

If a trade was cancelled, you'll find specific cancellation details like the reason (cancelReason) and a unique ID (cancelId). For opened positions, there’s a timestamp indicating when the position became active. The structure also includes profit and loss (pnl) data and the duration of the trade.

## Interface ScheduleStatisticsModel

This model holds statistics about scheduled trading signals, giving you insights into how they perform over time. 

It breaks down the total number of signals scheduled, those that were activated, and those that were cancelled. 

You'll find key performance indicators like the cancellation rate (how often signals are cancelled) and the activation rate (how often they lead to trades). 

It also calculates the average waiting times – how long cancelled signals waited and how long signals waited before being activated.

The `eventList` provides a detailed record of each individual scheduled event, containing comprehensive information about each signal’s lifecycle.

## Interface SchedulePingContract

This defines how the backtest-kit framework communicates about signals that are being actively monitored on a schedule. Think of it as a heartbeat signal confirming a signal is still alive and being watched. These "schedule ping" events are sent out every minute while a signal is active, meaning it hasn't been canceled or triggered.

You can set up your own functions to react to these pings. This allows for building custom checks – perhaps canceling a signal if the price has strayed too far from its initial entry price.

Each ping contains important information:

*   The trading symbol (like BTCUSDT).
*   The name of the strategy involved.
*   The exchange where the signal originates.
*   All the details about the signal itself (position size, take profit, stop loss, etc.).
*   The current market price at the time of the ping.
*   Whether it’s a live trade or a backtest run.
*   A timestamp indicating precisely when the ping occurred.

## Interface RiskStatisticsModel

This model holds information about risk events, helping you understand and monitor your risk management processes. 

It contains a detailed list of all the risk rejection events, so you can examine specific occurrences. 

You'll find the total count of risk rejections, giving you a quick overview of the overall activity.

To analyze risk patterns, the data is also broken down by the symbol involved and by the strategy being used. This allows you to identify areas where risk is concentrated.

## Interface RiskRejectionNotification

This notification informs you when a trading signal has been blocked by risk management rules. It's triggered when the system prevents a trade from happening due to predefined safety measures. 

Each notification includes a unique ID and a timestamp indicating when the rejection occurred. You'll also see if it happened during a backtest or in live trading, along with details like the trading pair, the strategy involved, and the exchange used. 

The `rejectionNote` property provides a clear explanation of why the signal was rejected.  Additional details like the number of open positions, current price, and intended trade direction (long or short) are also provided. You can also find the signal's identifier, entry price, take profit/stop loss levels, and a description of the signal's purpose, if available. Finally, the notification’s creation timestamp is included.

## Interface RiskEvent

This data structure holds information about situations where trading signals were blocked due to risk management rules. It's designed to help you understand why certain trades didn't happen.

Each `RiskEvent` captures key details like when the event occurred (timestamp), the trading pair involved (symbol), and the specifics of the signal that was rejected (currentSignal). You'll also find the strategy's name, the exchange used, and the time frame being analyzed.

The structure includes the current market price, the number of active positions at the time, and a unique ID for the rejection. A note provides a reason for the rejection, and a flag indicates whether the event occurred during a backtest or live trading. This lets you audit your risk parameters and optimize your strategy.


## Interface RiskContract

This interface describes what happens when a trading signal is blocked because it violates risk rules. It's like a notification sent out only when something goes wrong with risk validation – no alerts for signals that pass the checks.

Each notification, or 'RiskContract', gives you details about the rejected signal, including:
*   The trading pair (like BTCUSDT)
*   The specifics of the signal itself (like order size and prices)
*   Which strategy tried to place the order
*   The timeframe used during backtesting
*   The exchange involved
*   The current market price
*   How many other positions were already open
*   A unique ID for the rejection
*   A human-readable explanation of why it was rejected
*   The time the rejection occurred
*   Whether it happened during a backtest or live trading

These notifications help you monitor your risk controls, build reports, and understand why certain trades aren't happening. They're useful for services that track risk and for users who want to be directly notified of rejected signals.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep an eye on how a background task, like testing trading strategies, is going. It provides updates as the process runs, letting you know which walker, exchange, and frame are being used, and what symbol is involved.

You'll see information about the total number of strategies that need to be processed, and how many have already been handled.

The most useful piece of information is the `progress` value - a percentage from 0 to 100 that shows how far along the task is. This allows you to visualize the overall completion of your backtesting process.

## Interface ProgressBacktestContract

This interface provides a way to monitor the progress of your backtesting runs. It allows you to track how far along the backtest is, providing details like the exchange and strategy being used, the trading symbol, and the total number of historical data points (frames) being analyzed.  You'll see the number of frames already processed and a percentage indicating overall completion. Essentially, it's a snapshot of the backtest's current status.


## Interface PerformanceStatisticsModel

This model holds aggregated performance statistics for a specific trading strategy. It tells you the name of the strategy being evaluated.

It also tracks the total number of performance events that were recorded and the total time it took to collect all the performance data.

A key piece of information is the `metricStats` property, which breaks down the statistics further, categorized by the type of metric being measured. Finally, the `events` array contains all the individual performance data points collected, providing a detailed view of the strategy's performance.

## Interface PerformanceContract

The PerformanceContract helps you understand how your trading strategies are performing under the hood. It’s a record of different actions taken during a backtest or live trading session, along with how long those actions took. 

You'll see timestamps for each event and, importantly, how long an operation lasted – this lets you pinpoint slow spots in your code.

Each performance record is tagged with details like the strategy name, the exchange being used, and the trading symbol involved.  It also distinguishes between whether the event occurred during a backtest or a live trading session.  This information is critical for optimizing your strategies and identifying areas where performance bottlenecks might be impacting results.

## Interface PartialStatisticsModel

This model holds key statistical information gathered from your trading backtests, specifically focusing on partial profit and loss events. Think of it as a snapshot of how your strategy performed at different milestones. 

The `eventList` property contains a detailed record of each individual profit or loss event, giving you a granular view.  `totalEvents` simply tells you the overall count of all events that occurred.  `totalProfit` and `totalLoss` give you the raw counts of how many times your strategy generated a profit versus a loss, respectively. This is helpful for assessing the overall balance of your trading.

## Interface PartialProfitContract

The `PartialProfitContract` describes what happens when a trading strategy hits a profit milestone during execution, like reaching 10%, 20%, or 30% profit. It's used to track how well a strategy is performing and to manage how profits are taken along the way.

You'll find details like the trading symbol (e.g., BTCUSDT), the name of the strategy being used, and the exchange it's running on. The contract also includes the original prices and the current market price when the profit level was triggered.

Each milestone is only reported once for each signal, and multiple levels can be reported at once if the price changes rapidly. Information about whether the event came from a backtest or live trading is included, along with the exact time the level was detected. It helps services like report generation and user-defined functions to keep tabs on progress.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It's like getting a status update on how a portion of your position is being closed out.

You'll see details like a unique ID for the notification, the exact time it happened, and whether it's happening in a test or live environment. It includes crucial information about the trade, such as the symbol (e.g., BTCUSDT), the strategy that triggered it, and the exchange used.

The notification also provides key pricing data – the entry price, take profit price, stop loss price, and current market price at the time of the partial close. You can see how much of the position was closed (as a percentage).

Beyond the immediate details, you'll get a comprehensive performance snapshot for the entire position, including total profit/loss, peak profit, maximum drawdown, and a breakdown of costs and percentages. Finally, there's a field for an optional note explaining the reason behind the signal, as well as timestamps for when the signal was created and scheduled.

## Interface PartialProfitCommit

This data represents a partial profit-taking action within a trading strategy. It signifies that a portion of an existing position is being closed, rather than the entire position.

The `action` property confirms this is a partial profit event.  `percentToClose` indicates what percentage of the position is being closed, expressed as a number between 0 and 100.

Along with the current market price (`currentPrice`), this event also provides historical performance metrics for the position up to this point.  You'll find details on the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).

The data also includes the direction of the trade (`position`), the original entry price (`priceOpen`), and the intended take profit and stop loss levels, both as originally set (`priceTakeProfit`, `priceStopLoss`) and after any trailing adjustments (`originalPriceTakeProfit`, `originalPriceStopLoss`).  Finally, timestamps indicate when the signal was generated (`scheduledAt`) and the position was initially activated (`pendingAt`).

## Interface PartialProfitAvailableNotification

This notification tells you when your trading strategy has hit a profit milestone, like reaching 10%, 20%, or 30% profit. It's a way to track progress and understand how your strategy is performing, whether you're testing it in a simulation (backtest) or live trading.

The notification includes a lot of details, such as the unique ID of the signal and the exact time it hit the profit level.  You'll find information about the trading pair (like BTCUSDT), the strategy used, and the exchange where the trade happened.

It also gives you a snapshot of the trade itself: the entry price, the current market price, the take profit and stop-loss levels (both original and adjusted for trailing), and the number of entries and partial closes. You can see a breakdown of the profit and loss, including peak profit and maximum drawdown, all presented in both absolute and percentage terms.  Finally, it captures the reasons for this signal with a note.

## Interface PartialLossContract

The PartialLossContract helps you keep track of when a trading strategy hits certain loss levels, like -10%, -20%, or -30% drawdown. It’s like a notification system that alerts you to how a strategy is performing in terms of potential losses.

These events are triggered when a strategy’s loss reaches these predefined milestones.  It’s important to note that each level is only reported once for a given signal.  If the price moves quickly, you might receive several loss level notifications within a single market tick.

The contract provides a lot of information, including the trading symbol (like BTCUSDT), the strategy’s name, where the trade is happening (exchange and frame), the original data that led to the signal, the current market price, the specific loss level reached (e.g., -20%), and whether the event is from a backtest or live trading.  The timestamp tells you precisely when the loss level was detected – either when it happened in live trading or based on the historical candle during a backtest.

This information is used by services that analyze trading performance and can also be used to set up custom alerts based on drawdown levels.

## Interface PartialLossCommitNotification

This notification signals that a partial closing of a position has occurred, providing a wealth of detail about the trade. It's a key event emitted when a strategy executes a partial closure of a trading position, letting you track the specifics of that action.

The notification includes an identifier, a timestamp, and whether it originated from a backtest or live trading environment. You’ll find details like the trading pair (e.g., BTCUSDT), the strategy involved, and the exchange used.  Crucially, it details the percentage of the position that was closed, the current market price at the time of execution, and the trade direction (long or short).

Furthermore, the notification provides a snapshot of the position’s history, including the entry price, take profit and stop loss levels (both original and adjusted), and details about any DCA averaging that may have been applied. It also summarizes the position's performance with metrics like total profit/loss, peak profit, maximum drawdown, and related price and cost information.  Finally, there's an optional note field for a human-readable explanation of the signal.

## Interface PartialLossCommit

This data represents a partial loss event, which means a portion of an existing trading position is being closed. 

It includes key details about the trade, such as whether it was a long (buy) or short (sell) position, the entry price, and the current market price when the partial loss was triggered.

You'll also find information about the position's performance, including the profit and loss (PNL) accumulated so far, the highest profit reached (peak profit), and the largest drawdown experienced.

The original and adjusted take profit and stop loss prices are provided, as well as timestamps marking when the signal was created and when the position was activated. Finally, the `percentToClose` indicates what fraction of the position is being closed.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading position hits a predefined loss level, like -10%, -20%, or -30% of its initial value. It's like a progress report on how a trade is performing against its loss targets.

Each notification has a unique ID and timestamp, and it tells you if it's from a backtest (simulated trading) or live trading. You’ll also see the trading pair (like BTCUSDT), the name of the trading strategy involved, and the exchange where the trade is happening. 

The notification details include the current price, your entry price, whether you're long (buying) or short (selling), and the take profit and stop-loss prices, both the original ones and any adjusted versions.

It provides a lot of data about the trade’s performance: total entries and partial closes, overall profit and loss (both in USD and as a percentage), peak profit achieved, maximum drawdown (biggest loss), and more. There's even information about the price at which those key moments occurred, and the number of entries involved.  A note field allows for a custom explanation for the signal. Finally, timestamps indicate when the signal was created, scheduled, pending and when the notification itself was created.

## Interface PartialEvent

This `PartialEvent` object bundles all the key details about a profit or loss milestone during a trade. Think of it as a snapshot of a significant moment in a trade's lifecycle. It includes things like the exact time of the event, whether it was a profit or loss, the trading symbol involved, the name of the strategy used, and the signal's unique identifier.

You'll also find information about the current market price, the position type, and the take profit/stop loss levels initially set. It also keeps track of the entry price, the original take profit and stop loss prices, and details related to any dollar-cost averaging (DCA) strategies used, such as the total number of entries and the original entry price.

The object also logs information about partial closes, the unrealized profit and loss (PNL) at that moment, a human-readable explanation for the signal, and timestamps marking when the position became active and when the signal was initially created. Finally, a flag indicates whether the trade is part of a backtest or live trading.

## Interface MetricStats

This object holds a collection of statistics related to a particular performance metric. It essentially summarizes how that metric behaved during a backtest or live period.

You'll find details like the total number of times the metric was recorded, the total time it took across all instances, and key duration measurements.

It provides a breakdown of duration, including average, minimum, and maximum values, along with statistical measures like standard deviation, median, and percentiles (95th and 99th). 

Additionally, it tracks wait times – the intervals between events related to the metric – providing minimum, maximum, and average wait times. This helps understand the timing and spacing of those events.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversational history involving a large language model. Each message has a `role` indicating who sent it – whether it's a system instruction, a user's query, the model's response, or the result of a tool call. The `content` property holds the actual text of the message; if a message is purely related to a tool call, this might be empty.

Some providers also provide a `reasoning_content` field, offering insight into the model's thought process.  Messages from the assistant can also include `tool_calls`, specifying any tools used to generate the response. Furthermore, messages can now incorporate images, which can be provided as Blobs, raw byte arrays, or base64 encoded strings. Finally, a `tool_call_id` identifies the specific tool call a message corresponds to.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown experienced during a trading period. It keeps track of individual drawdown events, providing a detailed history of the worst performance periods.

The `eventList` property contains a chronological record of these drawdown events, with the most recent ones appearing first.  You can examine this list to see the specific dates and magnitudes of each drawdown.

The `totalEvents` property simply tells you how many drawdown events were recorded in total.

## Interface MaxDrawdownEvent

This data represents a single instance of a maximum drawdown that occurred during trading. Each event provides details about when it happened, which asset was involved, and the strategy and signal responsible. You’ll find information about the position direction (long or short), along with the profit and loss (PNL) details for that specific trade.

It also includes information about the highest profit achieved before the drawdown, the extent of the drawdown itself, and the price at which it occurred, along with entry, take profit, and stop loss prices. A flag indicates whether this event happened during a backtesting simulation.

## Interface MaxDrawdownContract

The `MaxDrawdownContract` provides details whenever a new maximum drawdown occurs for a trading position. It’s essentially a notification containing key information about the situation, including the trading symbol, the current price, and when the drawdown happened. 

You'll also find details like the strategy's name, the exchange used, the timeframe involved, and the signal that triggered the position.

A critical piece of information is a flag that tells you whether this drawdown event happened during a backtest or live trading.

This data is designed to help you build systems that automatically react to drawdown events – for instance, adjusting stop-loss orders or managing risk dynamically. Tracking maximum drawdown is a really important way to protect your capital and improve how you handle positions.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed look at the performance of your live trading system. It collects and organizes data from every event, including idle periods, open positions, active trades, and closed signals. You’ll find counts of total events, closed signals, wins, and losses.

Key performance metrics are calculated and presented, such as win rate, average PNL, total PNL, and standard deviation. It also offers risk-adjusted performance measures like the Sharpe Ratio, annualized Sharpe Ratio, and Sortino Ratio, allowing you to evaluate returns in relation to risk. You can analyze volatility with the standard deviation and get an idea of expected yearly returns.

Finally, it tracks metrics like peak and fall PNL, and the recovery factor, providing a comprehensive picture of both profit potential and downside protection.  All numerical values are carefully checked for validity, and will be null if they are unsafe to calculate.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes. These aren't critical, show-stopping errors, but things that need attention.

Each notification has a specific type, identified as "error.info" to ensure correct handling. 

You'll also get a unique identifier for tracking, a detailed error message that's easy to understand, and a serialized error object containing technical details like a stack trace and additional information. Importantly, these notifications always come from the live trading context, not from the backtest itself.

## Interface IdlePingContract

This describes the `IdlePingContract`, a notification you receive when a trading strategy isn't actively working on anything – it's in an idle state. Think of it as a signal that the strategy is waiting for a new opportunity or has finished processing a previous one.

The notification provides important information like the trading symbol (e.g., BTCUSDT), the name of the strategy in idle mode, and the exchange where it’s running. You’ll also get details about the current market price, whether the event came from a backtest (historical data) or live trading, and the exact time the event occurred. This data is useful for monitoring how your strategies cycle through active and idle states. 

You can subscribe to these idle ping events using `listenIdlePing()` or `listenIdlePingOnce()`.

## Interface IWarmCandlesParams

This structure defines the information needed to retrieve historical candlestick data. It's used to prepare your data before a backtest, ensuring the backtesting system has access to the necessary historical information. You'll specify the trading pair (like BTCUSDT), the exchange providing the data, the timeframe for the candles (such as 1-minute or 4-hour), and the start and end dates you want to cover. Essentially, it tells the system what data to download and store for the backtest.

## Interface IWalkerStrategyResult

This describes the results you get when running a trading strategy within the backtest-kit framework. Each strategy’s performance is neatly packaged into this structure.

You’ll find the strategy's name, allowing you to easily identify which strategy produced these results.

Detailed performance statistics, like win rate and drawdown, are included through the `stats` property.

A key metric value is presented for direct comparison against other strategies; if something went wrong during the backtest, this value might be null.

Finally, a ranking is assigned, with the best-performing strategy holding the rank of 1.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up and run A/B tests comparing different trading strategies. 

Think of it as a blueprint for your backtesting experiment. 

You give it a unique name (walkerName) so you can easily identify it, and you can add a note to explain what the test is for. 

It tells the backtest-kit which exchange and timeframe to use for all the strategies you're comparing. 

Crucially, you specify which strategies (strategies) you want to test – these strategies must have already been registered in the system. 

You choose a metric (metric), like Sharpe Ratio, to determine which strategy performs best. Finally, you can optionally add callbacks to trigger actions at different points in the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered when you run a comparison of different trading strategies. It tells you which asset (symbol) was tested, which exchange was used for the backtest, the name of the specific strategy comparison process (the "walker"), and what timeframe (frame) the data was based on.  Essentially, it's a container for the context of the backtest results.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest kit's strategy testing process. Think of it as a way to get notified about what's happening behind the scenes.

You can use `onStrategyStart` to know when a particular trading strategy is beginning its test. `onStrategyComplete` triggers when a strategy's backtest is finished, giving you access to performance statistics and a specific metric.  If something goes wrong during a strategy's test, `onStrategyError` will alert you with details about the error. Finally, `onComplete` signals that all strategies have been evaluated. 

These callbacks help you monitor, debug, or potentially react to events within the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface represents a single instruction to adjust a trailing stop-loss order. It's a record of what happened – specifically, a "trailing-take" action was triggered. 

It tells you how much the price should shift (the `percentShift`) and what the price was when the trailing order was initially set (`currentPrice`). Think of it as a log entry showing one step in the process of a trailing stop-loss being managed.

## Interface ITrailingStopCommitRow

This describes a queued action related to a trailing stop order. Essentially, it represents a single step in adjusting a trailing stop, like when the price moves.

The `action` property confirms this is specifically a trailing stop adjustment.

The `percentShift` tells you how much the percentage of the trailing stop has changed.

Finally, `currentPrice` records the price at which the trailing stop was initially established.

## Interface IStrategyTickResultWaiting

This interface describes what happens when a trading strategy is waiting for a specific price level to be reached before executing a signal. It's a result you’ll receive repeatedly while the strategy is actively monitoring a signal.

Think of it as a “holding pattern” – the strategy has a signal ready to go, but it's paused, waiting for the price to hit a certain point.

The data included gives you a complete picture of the situation:

*   The type of result is confirmed as "waiting".
*   The signal itself is provided, so you know exactly what's waiting.
*   You'll also see the current price being monitored.
*   It includes details about which strategy, exchange, timeframe, and trading pair are involved.
*   The progress towards take profit and stop loss are both zero since the trade hasn’t been executed.
*   You get the theoretical unrealized profit and loss (pnl) calculation.
*   There's an indicator specifying if this result comes from a backtest or live trading.
*   A timestamp tells you when this waiting state began.

## Interface IStrategyTickResultScheduled

This interface describes a specific type of result generated during backtesting or live trading when a strategy has scheduled a trade – meaning it's waiting for the price to reach a certain entry point. Think of it as a notification that a trade plan is in place, but hasn't been executed yet.

It includes details to help you track what’s happening, such as the strategy’s name, the exchange being used, the timeframe, and the symbol being traded. You'll also find the current price at the time the signal was scheduled, and a flag to indicate if the result comes from a backtest or a real-time trading environment. Crucially, it carries the `IPublicSignalRow` representing the signal that triggered this scheduled action. The `action` property simply confirms that the result is indeed a "scheduled" type.

## Interface IStrategyTickResultOpened

This interface represents a notification that a new trading signal has been created. It’s designed to tell you when a signal has been successfully validated and saved, marking the beginning of a potential trade. 

You'll find important details about the signal itself, like the generated ID and the name of the strategy that created it. It also includes information about where and when the signal originated - the exchange, the timeframe, the trading pair, and the price at the time the signal opened. 

A flag indicates if this event comes from a backtest or a live trading environment. Finally, there’s a timestamp recording when the event was created, tied to the candle’s time in backtest mode or the live execution context.


## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state – meaning it’s not currently generating any trading signals. It provides key information about the current market conditions and the strategy's context during this period.

You'll find the strategy's name, the exchange it’s connected to, the timeframe being used (like 1-minute or 5-minute intervals), and the trading pair symbol.  It also includes the current price, a flag to indicate if this is a backtest or a live trade, and a timestamp of when the data was recorded. Essentially, it’s a snapshot of the market and strategy’s status when no action is being taken.

## Interface IStrategyTickResultClosed

This interface represents the result when a trading signal is closed, providing a comprehensive snapshot of the final outcome. It includes information such as the reason for closure (like a time limit expiring, hitting a profit or loss target, or a manual close), the final price used for calculations, and a detailed breakdown of the profit and loss, accounting for fees and slippage. You'll also find tracking information like the strategy and exchange names, timeframe, and the trading symbol. It also clarifies whether the event occurred during a backtest or in live trading. Finally, a unique close ID is provided for manual signal closures and a timestamp indicating when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes a specific outcome during a trading strategy's execution – when a planned signal is cancelled before a trade actually happens. This cancellation might occur because the signal never triggered, or because it was stopped out before a position could be opened.

It provides detailed information about why the signal was cancelled, including the signal itself, the final price at the time of cancellation, and the precise timestamp. You'll also find details about the strategy, exchange, timeframe, and trading symbol involved, making it easier to track and analyze the event.

Crucially, it includes a `reason` property to explain the specific cause of the cancellation, and an optional `cancelId` if the cancellation was initiated manually through a cancellation request. Additionally, it notes whether the event is part of a backtest or live trading scenario, and records the creation timestamp.

## Interface IStrategyTickResultActive

This interface represents a specific state in a trading strategy – when a signal is active and being monitored for a take profit (TP), stop loss (SL), or time expiration. It holds key information about the situation, like the signal itself, the current price being watched, and the names of the strategy, exchange, and timeframe involved in the trade.

You’ll also find details about the symbol being traded and the progress toward the TP and SL targets, expressed as percentages. The unrealized profit and loss (PNL) for the active position, accounting for fees, slippage, and partial closes, is included too.

Whether the strategy is running in a backtest or live environment is also tracked, along with timestamps for when the result was created and when the last candle was processed. This last timestamp is particularly important for managing the backtesting process.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. It's essentially a blueprint that outlines how your strategy will generate trading signals.

Each strategy needs a unique name to identify it. You can also add a note for your own documentation.

The `interval` property helps control how often the strategy checks for signals, preventing it from generating too many too quickly.

The core of the strategy is the `getSignal` function – this is where the logic for determining when to buy or sell lives. This function considers the current price and a specified 'entry price' if you want it to wait for a certain price level.

You can also provide callback functions to handle events like opening and closing positions.

Finally, this schema allows associating risk profiles and action identifiers with your strategies, helping with risk management and order execution.

## Interface IStrategyResult

`IStrategyResult` represents a single row of data when you're comparing different trading strategies. It bundles together everything you need to evaluate a strategy's performance.

Each result includes the strategy's name so you know which one you’re looking at.

It also carries the full set of backtesting statistics, providing a detailed breakdown of how the strategy performed.

A key piece of information is the metric value, which is used to rank strategies based on your chosen optimization goal. This value might be null if the strategy encountered a problem during backtesting.

Finally, it records the timestamps of the first and last trading signals generated by the strategy, giving you insight into its activity over the backtesting period. If no signals were generated, these timestamps will be null.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of a profit and loss calculation for a trading strategy. It gives you the key figures to understand how your strategy performed. 

The `pnlPercentage` tells you the profit or loss as a percentage – positive values mean a profit, and negative values indicate a loss. 

You'll also find the `priceOpen` and `priceClose`, which are the entry and exit prices respectively, but importantly, they've already been adjusted to account for fees and slippage (a small difference between the expected price and the actual price you get).

`pnlCost` shows the actual profit or loss in dollars, calculated based on your initial investment (`pnlEntries`). Finally, `pnlEntries` represents the total amount of money you initially put into the strategy.


## Interface IStrategyCallbacks

This interface provides a way to react to different lifecycle stages of your trading strategies. Think of them as event listeners for key moments in a signal's journey.

You can receive notifications for every tick of the market (`onTick`), when a new signal is opened (`onOpen`), when a signal is actively being monitored (`onActive`), and when there are no active signals (`onIdle`). It also provides callbacks for when a signal is closed (`onClose`), scheduled for later entry (`onSchedule`), or cancelled before opening (`onCancel`).

Furthermore, you can hook into events related to profit taking (`onPartialProfit`), loss mitigation (`onPartialLoss`), and reaching breakeven (`onBreakeven`). There are also specific pings for scheduled signals (`onSchedulePing`) and active pending signals (`onActivePing`), allowing for custom monitoring and dynamic adjustments to your strategies, even between regular strategy intervals. Finally, `onWrite` is for signal persistence testing. Each callback receives data about the symbol, signal, price, and whether it's a backtest.

## Interface IStrategy

This interface, `IStrategy`, outlines the core functions a trading strategy needs to have. Think of it as a blueprint for how your trading logic interacts with the backtest-kit framework.

Each function has a specific job. `tick` handles each price update, checking for signals and stop-loss/take-profit conditions.  `getPendingSignal` and `getScheduledSignal` retrieve the current signal, if any, which is crucial for monitoring.  There are also functions for calculating breakeven points, checking the total position size, and getting various performance metrics like unrealized profit and loss.

The `backtest` function runs a simulated trading test using historical data, while `stopStrategy`, `cancelScheduled`, and `activateScheduled` allow for dynamic control over the strategy’s behavior. Finally, there's a set of functions to manage partial positions and trailing stop-loss/take-profit adjustments, offering fine-grained control over the trading process. This interface is used to control the lifecycle and execution of a strategy.


## Interface IStorageUtils

This interface defines the basic functions any storage adapter used by the backtest-kit trading framework must provide. It outlines how the adapter should respond to various signal events – when a position is opened, closed, scheduled, or cancelled. The adapter also needs to be able to retrieve individual signals based on their ID and list all stored signals. 

Furthermore, the storage adapter must handle special ping events, updating the timestamp for signals that are actively open or scheduled to ensure data freshness. Essentially, this interface provides a standardized way for the backtest-kit to interact with different storage solutions, like databases or files, to manage and track trading signals.


## Interface IStorageSignalRowScheduled

This interface, `IStorageSignalRowScheduled`, represents a signal that's been scheduled for future execution. It's a way to track signals that aren't being acted upon immediately.  The key piece of information is the `status` property, which is always set to "scheduled". This simple designation confirms the signal is awaiting its designated time to be processed.

## Interface IStorageSignalRowOpened

This interface represents a signal row that's currently in an "opened" state. It's a simple way to track when a trading signal has been activated. The key property is `status`, which is always set to "opened" for these types of signal rows. This clearly indicates that a position has been initiated based on the signal.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed, meaning a trade associated with it has finished. It holds specific information related to that closed signal. 

Essentially, it’s used to track the financial performance – the profit and loss or P&L – of a trade after it's completed.

The `status` property confirms the signal is indeed in a "closed" state.  The `pnl` property contains the details of that profit and loss, letting you analyze the trade's outcome.

## Interface IStorageSignalRowCancelled

This interface defines how a signal's status is represented when it's been cancelled. It's really straightforward – the `status` property is always set to "cancelled". This lets you clearly identify within your backtesting data which signals are no longer active or valid. It's a simple way to track the lifecycle of a signal.

## Interface IStorageSignalRowBase

This defines the basic structure for how signal data is stored, regardless of its specific status. Every signal record includes a `createdAt` timestamp marking when it was initially created, an `updatedAt` timestamp reflecting any subsequent updates, and a `priority` value. The `priority` helps determine the order in which signals are processed, using the current time as a reference. This provides a consistent way to manage and track signals over time, especially when dealing with historical backtesting data.

## Interface IStateParams

`IStateParams` helps you organize and manage your trading signal data. Think of it as a blueprint for setting up how your signal's state is stored and retrieved.

It defines two key pieces of information:

First, `bucketName` allows you to categorize your signals, like grouping trade-related signals separately from performance metrics.

Second, `initialValue` provides a starting point for your signal's data; it’s what's used if no prior data is available.

## Interface IStateInstance

This interface, `IStateInstance`, provides a way to manage and track data specific to each trading signal. Think of it as a container for information that changes over time as a trade progresses. It's particularly helpful for strategies that use LLMs (Large Language Models) to make decisions, allowing those models to monitor how a trade is performing – things like the highest unrealized profit, how long the trade has been open, and when to cut losses.

The data stored can be anything you need, but it's designed to track key performance metrics.  

It gives you several important methods:

*   `waitForInit` is used to set up the state when everything's ready.
*   `getState` lets you read the current state at a specific point in time, but it's designed to prevent looking into the future, ensuring a fair and accurate representation of past performance.
*   `setState` is for updating the state.  It's smart about overwriting old data to prevent issues when restarting a backtest.
*   `dispose` cleans up any resources the state instance is using when you’re finished with it.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a formula that helps determine optimal bet sizes. 

It uses the `kelly-criterion` method, indicating the sizing approach.

The `kellyMultiplier` property controls how aggressively the Kelly Criterion is applied; a lower value like 0.25 represents a more conservative "quarter Kelly" strategy, while a higher value would risk more capital per trade. You'll want to adjust this multiplier based on your risk tolerance and the confidence you have in your trading signals.

## Interface ISizingSchemaFixedPercentage

This schema defines a consistent way to size your trades based on a fixed percentage of your capital. It's simple to implement: you specify a `riskPercentage`, which represents the maximum portion of your trading account you’re willing to risk on a single trade. 

The `method` property is always set to "fixed-percentage" to identify this particular sizing strategy. Think of it as a straightforward approach where each trade takes a predetermined bite out of your available funds.

## Interface ISizingSchemaBase

This interface, `ISizingSchemaBase`, acts as a foundational blueprint for how much of your trading account you'll allocate to each trade. It defines core properties like a unique identifier for the sizing strategy (`sizingName`), a place to add notes for clarity (`note`), and limits on position size – both as a percentage of your account (`maxPositionPercentage`) and in absolute terms (`minPositionSize`, `maxPositionSize`). Finally, you can optionally provide callback functions (`callbacks`) to customize how sizing is handled at different stages. Think of it as the starting point for creating your own rules about position sizing.

## Interface ISizingSchemaATR

This defines a strategy for determining the size of your trades based on the Average True Range (ATR). It's designed to manage risk by adjusting position sizes according to market volatility, as reflected in the ATR.

The `method` is always set to "atr-based" to indicate this specific sizing approach.

`riskPercentage` lets you control how much of your capital you're willing to risk on each trade, expressed as a percentage. 

`atrMultiplier` is used to calculate the distance of your stop-loss orders, scaling it proportionally to the current ATR value. Higher values result in wider stops, accommodating larger potential price swings.

## Interface ISizingParamsKelly

This interface defines the parameters needed for sizing trades using the Kelly Criterion. It’s primarily used when setting up how much capital your trading strategy will allocate to each trade. 

The key element here is the `logger`, which allows your sizing logic to output messages for debugging and monitoring. Having a logger helps you understand how your Kelly Criterion calculations are behaving during backtesting.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want your trading strategy to size positions based on a fixed percentage of your available capital. It’s primarily used when setting up the sizing behavior within a trading system. The key component is the `logger`, which allows you to record debugging information and monitor the sizing process. This helps you understand how much capital is being allocated to trades.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining position sizes based on the Average True Range (ATR) indicator. 

It focuses on providing logging capabilities to help you understand and debug the sizing calculations. 

Specifically, you'll need to supply a logger object that can record debug messages related to the sizing process, which assists in monitoring and troubleshooting your trading strategy.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface lets you hook into the sizing process within your backtest. Specifically, the `onCalculate` function is triggered immediately after the framework determines how much to trade.

This is a great spot to check if the size makes sense, record the sizing decision for later analysis, or perform any other validation steps.  You can either provide a simple function that executes immediately or a function that returns a promise, allowing for asynchronous operations. It receives the calculated quantity and sizing parameters as input.

## Interface ISizingCalculateParamsKelly

This interface defines the inputs needed to calculate your trade size using the Kelly Criterion. 

Essentially, it allows you to specify how aggressively you want to size your trades based on your expected profitability. You’ll need to provide your win rate—a value between 0 and 1 representing the percentage of profitable trades—and your average win-loss ratio, which shows how much you typically win compared to how much you lose on each winning trade. These values feed into a formula that helps determine an optimal position size to maximize long-term growth.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed when you're sizing a trade using a fixed percentage of your capital, always tied to a specific stop-loss price. Essentially, it tells the system to calculate how much to trade based on a predetermined percentage and a set stop-loss level.  You'll provide a method indicating it's a fixed-percentage strategy and a numeric value representing the stop-loss price. This helps control risk by ensuring the trade size is always proportional to the potential loss.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to calculate how much of an asset to trade. 

It includes the symbol of the trading pair, like "BTCUSDT", so you know what you're trading. It also provides the current account balance, which is essential for determining how much capital is available. Finally, the planned entry price gives context to the sizing calculation, helping to understand the risk associated with the trade.

## Interface ISizingCalculateParamsATR

To use the ATR (Average True Range) method for determining trade size, you'll need to provide these parameters.  Essentially, you're telling the system to size your trades based on the ATR indicator.  The `method` property must be set to `"atr-based"` to indicate you're using this specific sizing approach.  You also need to supply the current ATR value itself, represented by the `atr` property, which is a numerical value.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade. It's a core part of how the backtest kit executes strategies, determining the size of each position.

The `calculate` property is the heart of this interface. When a trade needs to be placed, this function gets called with some information about the trade, like your risk parameters, and returns the calculated position size as a number. This tells the system exactly how many units of the asset to buy or sell.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal after it's been validated and prepared for execution. Each signal gets a unique ID, and includes details like the cost of the trade, the entry price, and the expected duration. It also tracks which exchange and strategy generated the signal, as well as the timeframe it applies to.

Beyond the basics, the signal tracks key performance metrics. You'll find information about partial profit/loss exits, a trailing stop-loss and take-profit prices which can adjust dynamically, and a history of DCA entries (if applicable). The system keeps track of the highest and lowest prices seen during the trade's life to help analyze performance. Finally, a timestamp records when the signal was initially created or retrieved. The `_isScheduled` flag indicates whether the signal was scheduled, while the `_partial` array and related computed properties are vital for accurately calculating overall profit and loss.


## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to group them together and release them at specific intervals. It's used within the framework to efficiently deliver multiple signals at once, pausing further signals until a set time has passed. Each signal is given a unique identifier, a UUID, to easily track and reference it within the system. Think of it as a way to batch your signals for more controlled delivery.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a standard way to pass signal information around. It contains all the necessary details to execute a trade, including the ticker symbol, whether you're going long (buying) or short (selling), and a brief explanation of why the signal was generated. 

The signal includes pricing information such as the entry price, take profit target, and stop-loss levels to help manage risk.  You can also specify a timeout duration for how long the position should remain open, or leave it open indefinitely. Finally, a cost value represents the expense associated with entering the trade.  An automatically generated ID will be assigned to each signal.

## Interface ISessionInstance

The `ISessionInstance` interface is like a temporary storage space for information that's specific to a particular trading setup. Think of it as a way to hold data that needs to be shared and updated during a backtest run, like intermediate calculations or results from an AI model. 

It's designed to hold information related to a specific combination of symbol, trading strategy, exchange, and timeframe.

The interface provides methods for initializing the session, writing new data with a timestamp, retrieving existing data based on timestamps, and releasing any resources when the session is done. Importantly, it prevents looking into the future by not returning data if the timestamp is later than the requested date. This helps maintain data integrity during backtesting.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that's designed to be executed when a specific price level is reached. Think of it as a signal on hold, waiting for the market to move in a certain direction. 

It builds upon the basic signal representation (`ISignalRow`), and essentially delays the signal’s activation until the `priceOpen` is hit. 

When the price reaches the defined `priceOpen`, this scheduled signal effectively transforms into a regular, pending signal. It's useful for strategies where you want to enter a trade only when a price target is met, even if the initial signal generated earlier. 

The `priceOpen` property defines that target price.

## Interface IScheduledSignalCancelRow

This interface defines a row of data used for scheduled trading signals, but with a special focus on cancellations. If a user cancels a scheduled signal, this interface holds extra information about that cancellation, like a unique ID to identify it and any notes the user provided. It builds upon the standard scheduled signal data, so you'll find all the usual signal details alongside this cancellation information when dealing with canceled signals. Essentially, it's a way to track cancellations and why they happened.

## Interface IRunContext

This interface, `IRunContext`, acts as a central hub for all the information a function needs while it's running within the backtest-kit framework. Think of it as a combined package deal: it bundles together details about which exchange and strategy are being used, alongside essential runtime data like the specific symbol being analyzed and the current timestamp. It's designed to simplify things by providing everything needed in one place, and then separates it into specialized services to handle effectively.

## Interface IRiskValidationPayload

This object holds the data needed when checking if a trade is risky. Think of it as a snapshot of your portfolio's current situation. 

It includes the signal that triggered the potential trade, letting you assess its validity within the context of market conditions. You’ll also find the number of positions you already have open and a detailed list of those active positions, which is crucial for understanding overall exposure. This data helps ensure your trading system remains safe and aligned with your risk management rules.

## Interface IRiskValidationFn

This defines a function that's used to check if a trading decision is safe to make. Think of it as a gatekeeper – it examines a proposed trade and decides whether it's acceptable based on certain rules. If the trade is okay, the function does nothing or returns a simple signal of approval. If it finds a problem, it either provides a detailed reason for rejection or raises an error, which the system will handle to provide a clear explanation.

## Interface IRiskValidation

This interface helps you define rules to check your trading risks. Think of it as setting up specific tests to make sure your risk management is working as expected. 

You’ll provide a `validate` function, which is the core of the test – it's where you put the actual logic to check your parameters.  You can also add a `note` to describe what the validation is doing, making it easier for others (or your future self) to understand its purpose.  Essentially, it's about creating reliable and understandable risk checks.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading. It builds upon the existing `ISignalDto` to add crucial price information needed for risk validation. Specifically, it includes the entry price of the position (`priceOpen`), the original stop-loss price when the signal was created (`originalPriceStopLoss`), and the original take-profit price also set when the signal was generated (`originalPriceTakeProfit`). This extra data allows for a more precise assessment of risk associated with each trade.

## Interface IRiskSchema

This section describes how you can define and register custom risk controls for your trading portfolio. Think of it as setting up rules to keep your trading strategy safe and on track.

Each risk control, or "risk schema," has a unique identifier, a descriptive note for developers, and optional callback functions to trigger actions at specific times – like when a trade is rejected or approved.

The most important part is the `validations` array. This lets you specify a series of checks that your portfolio will run to ensure it's operating within the desired risk parameters. You can define these checks in different ways, allowing for flexible and customized risk management.

## Interface IRiskRejectionResult

This object represents the outcome when a risk validation check fails. It provides details to help you understand *why* the validation didn’t pass. Each rejection has a unique identifier (`id`) so you can track specific issues.  A clear explanation (`note`) is included to describe the reason for the rejection in a way that's easy to understand.

## Interface IRiskParams

The `IRiskParams` object is essentially a set of settings that define how the risk management part of the backtest-kit framework behaves. 

It includes essential details like the name of the exchange you're working with, a way to log debugging information, and a system for tracking time to avoid issues caused by looking into the future during backtesting. 

You'll also find a flag indicating whether you're in backtest or live mode.

Finally, `onRejected` is a function that gets called when the framework decides a trading signal is too risky to execute. This gives you a chance to react to that rejection, perhaps by emitting custom events or notifications.

## Interface IRiskCheckOptions

To help manage situations where multiple parts of your trading strategy might try to use the same position at the same time, `IRiskCheckOptions` provides a way to temporarily hold a spot. The `reserve` property, when set to `true`, essentially marks a position as tentatively in use. This is really useful to ensure that any other checks happening simultaneously see the updated position size before anything else actually makes a change, preventing conflicts and unexpected behavior. Think of it as a quick reservation to avoid collisions when dealing with lots of simultaneous actions.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to perform a risk check before a trading signal is executed. Think of it as a safety gate – it's checked *before* a potential trade is even considered. It gathers data about the trade itself, like the symbol being traded ("BTCUSDT"), the pending signal, and the strategy asking for the trade. You'll also find details like the exchange being used, the name of the risk being applied, and current market data like the price and timestamp. This allows your risk management logic to make informed decisions about whether or not to proceed with a new trading opportunity.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered based on the outcome of your risk checks. Think of it as a way to be notified when a trading signal is either blocked because it exceeds your risk limits, or approved to proceed. The `onRejected` function is called when a signal fails these checks – useful for logging, sending alerts, or taking corrective action. Conversely, `onAllowed` is triggered when a signal passes, letting you know a trade is going ahead as planned.

## Interface IRiskActivePosition

This interface describes a single, active trading position that’s being monitored for risk management purposes. Think of it as a snapshot of a trade – it contains key details about the strategy that opened it, the exchange used, the specific trading pair (like BTCUSDT), and whether it's a long or short position. You’ll find important pricing information here too, including the entry price, stop-loss level, and take-profit target. 

Finally, it records when the position was opened and an estimated duration for how long it’s expected to remain active.  This data is crucial for analyzing how different trading strategies interact and manage risk collectively.


## Interface IRisk

The `IRisk` interface is responsible for managing and enforcing risk limits during trading. It lets your strategies check if a proposed trade is safe based on predefined rules.

The `checkSignal` method allows you to verify if a potential trade aligns with your risk parameters.  A specialized `checkSignalAndReserve` method combines this check with a reservation system that prevents multiple strategies from simultaneously exceeding limits – it locks the process to ensure accuracy in parallel trading scenarios.

When a trade is approved, `addSignal` formally registers the new position, and `removeSignal` is used to clear the record when a trade is closed or cancelled. It's important to always pair these methods – a successful `checkSignalAndReserve` needs to be followed by either `addSignal` to confirm the trade or `removeSignal` to revert the reservation.

## Interface IReportTarget

This interface lets you fine-tune what information gets recorded during your trading tests. Think of it as a way to control the level of detail in your reports.

You can selectively turn on or off logging for various aspects of your trading, such as strategy decisions, risk management, breakeven points, partial order fills, performance metrics, scheduling, live trading activity, and specific milestones like highest profit and maximum drawdown.

Each property, like `strategy` or `risk`, is a simple on/off switch (a boolean value) that determines whether the corresponding event gets logged. This allows you to focus on the data most relevant to your analysis and keep your reports manageable.

## Interface IReportDumpOptions

This interface helps control what data gets written into reports during a backtest. It lets you specify key details like the trading pair (symbol), the name of the trading strategy, the exchange used, the timeframe, and a unique identifier for the signal or optimization being tested. Think of it as a way to tag and organize your backtest results for easier tracking and analysis. By providing these values, you ensure your reports contain the specific information you need to understand your strategy's performance.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It’s designed to provide a consistent way to store and retrieve signal data, ensuring that backtesting and live trading systems work together reliably.

The `handleActivePing` method lets you record new signal activity, automatically updating the stored signal information. `getLatestSignal` allows you to fetch the most recent signal for a specific trading setup, but it’s carefully designed to prevent using future data – it won't return a signal if its timestamp is later than the time you're checking. Finally, `getMinutesSinceLatestSignalCreated` helps you determine how long ago a signal was generated, using a timestamp to ensure you aren't looking too far into the future.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share detailed information about a trading signal with users, especially when dealing with trailing stop-loss and take-profit orders. It builds upon the standard signal data to include the original stop-loss and take-profit prices that were initially set. Even if those prices later change due to trailing adjustments, the original values remain visible, providing transparency for users.

The row includes key details like the cost of entering the position, the total entries and partial executions made, and important performance metrics such as profit and loss (pnl), peak profit, and maximum drawdown. It also presents the original entry price, which stays consistent regardless of any subsequent averaging.  The `partialExecuted` property shows what percentage of the position has been closed via partial orders.  Knowing these original settings and performance data gives a complete picture of the trade's history and current state.

## Interface IPublicCandleData

This interface defines the structure of a single candle data point, which represents a period of time in trading. Each candle contains information like the exact time it started, the opening price, the highest and lowest prices reached, the closing price, and the volume of trades that occurred during that time. Think of it as a snapshot of price action and trading activity for a specific interval. It's a common data format used for analyzing and visualizing market behavior.

## Interface IPositionSizeKellyParams

This defines the parameters needed to calculate position sizes using the Kelly Criterion. 

It focuses on two key values: the win rate, representing the proportion of winning trades, and the win/loss ratio, which describes how much you win compared to how much you lose on each trade. 

These numbers help determine how much of your capital to risk on each trade to optimize for long-term growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed to calculate position sizes using a fixed percentage strategy. 

It includes a `priceStopLoss` value, which represents the price at which a stop-loss order should be placed. 

Essentially, this tells the backtesting system where to set the stop-loss based on your chosen percentage sizing.


## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the data needed to calculate a position size based on the Average True Range (ATR). It's used when you want your trading strategy to adjust its position based on market volatility.

The `atr` property specifically represents the current ATR value, which reflects how much the price has been fluctuating recently. This value is a key input for determining how much to trade.

## Interface IPositionOverlapLadder

This interface helps define a safety zone around your dollar-cost averaging (DCA) levels. Think of it like setting boundaries – a buffer – around each price point where you bought in.

The `upperPercent` property sets how much higher than each DCA level you'll consider to be an overlap. The `lowerPercent` property does the same for how much lower than each DCA level is flagged as an overlap.  These percentages give you control over how sensitive your overlap detection is; smaller values mean a stricter check. Essentially, it allows you to avoid triggering alerts for small fluctuations around your DCA prices.


## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded for a specific trading environment, whether it's a backtest or live trading session. Think of it as a way to replace the default file storage with your own solution, like a database. 

The system keeps track of signals using a unique identifier for each one. 

When you need to retrieve signals, the system scans through all the stored entries and gathers them into a list.

To use this, you'll create your own adapter that implements these methods, handling the actual saving and loading of signals.  The `waitForInit` method sets up the storage when the system starts. `readStorageData` retrieves all the saved signals, and `writeStorageData` handles writing new signals or updating existing ones.

## Interface IPersistStateInstance

This interface helps manage how trading strategy data is saved and loaded, ensuring things don't get lost if your program crashes. It's specifically for a single combination of a signal and a bucket (like a specific timeframe).

Think of it as a way to customize where and how your strategy's state is stored, like settings and important variables.

The `waitForInit` method sets things up when the storage is needed. `readStateData` retrieves previously saved data, `writeStateData` saves new data along with a timestamp, and `dispose` cleans up resources when the storage is no longer needed. You can implement this interface to replace the default file-based storage with your own solution, for example, saving to a database.

## Interface IPersistSignalInstance

This interface defines how to handle saving and loading signal data for a specific trading setup. Think of it as a way to remember what a strategy learned and how it performed in a particular situation.

It's designed for custom adapters, allowing you to replace the default file-based storage with something else, like a database.

The `waitForInit` method lets you prepare the storage area for a new context. The `readSignalData` method retrieves any existing data that was previously saved. Finally, `writeSignalData` lets you store the current data, or clear it out entirely if you no longer need it.

## Interface IPersistSessionInstance

This interface defines how to manage persistent storage for a specific trading strategy, exchange, and frame combination. Think of it as a way to save and load information related to a single trading run, ensuring that even if things go wrong, your progress isn't lost.

If you want to customize how this data is stored – maybe you want to use a database instead of a file – you can create your own adapter that implements this interface.

The `waitForInit` method sets up the storage when needed.  `readSessionData` retrieves previously saved information, and `writeSessionData` saves the current state.  Finally, `dispose` cleans up any resources the storage is using when the trading session is complete.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads signals related to specific trading strategies and exchanges. Think of it as a way to replace the default file storage with your own method, maybe a database or in-memory solution.

The `waitForInit` method is used to set up the storage when a strategy starts.
`readScheduleData` retrieves any previously saved signal information for a given strategy and exchange. 
Finally, `writeScheduleData` saves the current signal data – and you can even clear the data by passing `null` to indicate a signal should be removed. This allows you to tailor the persistence of your scheduled signals to your specific needs.


## Interface IPersistRiskInstance

This interface lets you customize how your trading backtests store and retrieve risk positions. Think of it as a way to control where and how your backtest remembers the current risk exposure for a specific trading strategy and exchange combination.

If you want to use a database instead of files to manage this data, or maybe even a real-time system, you can create a class that implements this interface.

The `waitForInit` method is a signal that the system needs to prepare the storage for the risk context, especially during initialization. The `readPositionData` function retrieves previously saved risk position data for a given time point, while `writePositionData` saves the current risk positions so they can be loaded later.


## Interface IPersistRecentInstance

This interface lets you manage how the most recent trading signal is saved and loaded for a specific setup – think of it as remembering what you were doing last time for a particular strategy on a certain exchange. It’s designed so you can customize where and how this information is stored, perhaps using a database instead of a simple file.

The `waitForInit` method sets things up at the start, letting you indicate if initial data is present.

`readRecentData` fetches the last known signal that was saved.

Finally, `writeRecentData` saves the current signal, along with the timestamp, so you can pick up where you left off. 


## Interface IPersistPartialInstance

This interface lets you manage how trading data, specifically partial profit/loss information, is saved and loaded for a specific setup – think of it as a dedicated space for a particular trading strategy on a particular exchange.

It's designed so you can customize how this data is stored, potentially moving away from the default file-based approach.

The `waitForInit` method sets up the storage area.  Then, `readPartialData` retrieves previously saved data for a certain signal, identifying it by a signal ID and a timestamp.  Finally, `writePartialData` allows you to save new partial data, again linked to a signal ID and timestamp. This setup helps keep your trading history organized and allows for custom solutions.

## Interface IPersistNotificationInstance

This interface lets you customize how notifications are saved and loaded during backtesting or live trading. Think of it as a way to replace the default file storage with your own solution, like a database or an in-memory store. 

It handles notifications – messages related to trades or other events – ensuring they're preserved between sessions. 

The `waitForInit` method prepares the storage area at the start, `readNotificationData` retrieves all previously saved notifications, and `writeNotificationData` saves new or updated notifications. Each notification is identified by a unique ID, making it easy to find specific notifications later.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context within the backtest-kit framework. Think of it as a way to persist information, like LLM interactions, related to a particular trading signal and data bucket. 

It allows you to manage memory entries, checking for their existence, reading them out, writing new ones, and even marking them for soft deletion – effectively hiding them from regular searches while keeping the underlying data file intact. You can use this interface to create your own custom storage solutions, replacing the default file-based approach.

The methods provide functionality for initializing storage, fetching memory entries by ID, verifying if an entry exists, writing and removing entries, listing all available memory data, and releasing any resources used. It’s particularly useful for situations where you need to control precisely how memory is handled during backtesting.

## Interface IPersistMeasureInstance

This interface defines how to persistently store data related to measures, like results from external APIs, for a specific trading bucket. It allows you to customize how this data is handled, moving beyond the default file-based storage.

Think of it as a way to manage a little "memory" for each trading simulation, allowing you to save and retrieve information efficiently. 

The system supports a "soft delete" feature, meaning removed data remains on disk but is ignored during normal operations.

Here's what you can do with this interface:

*   **Initialize:** `waitForInit` sets up the storage for each bucket.
*   **Read:** `readMeasureData` fetches data from the cache using a unique key.
*   **Write:** `writeMeasureData` saves data to the cache with a timestamp.
*   **Remove:** `removeMeasureData` marks data as deleted without actually removing it from storage.
*   **List:** `listMeasureData` provides a way to get a list of all the data keys currently stored.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores log entries. Think of it as a way to replace the default file-based logging with something else, like a database or an in-memory store.

The system uses a single, global log storage for the entire process, meaning all components share the same log data. Each log entry is uniquely identified, and reading logs involves going through all the stored entries.

To build your own custom storage solution, you’ll need to implement `waitForInit` to set up the storage, `readLogData` to retrieve all log entries, and `writeLogData` to add new log entries—making sure not to overwrite existing ones, ensuring the log remains append-only.


## Interface IPersistIntervalInstance

This interface lets you customize how the backtest-kit remembers which time intervals have already been processed for a specific trading bucket. Think of it as a way to mark an interval as "done" so it won't be re-processed.

If you want to use a database or some other storage method instead of the default file system, you can build your own adapter that implements this interface.

The `waitForInit` method is like preparing the storage area for a new set of intervals.

`readIntervalData` retrieves existing marker information.

`writeIntervalData` creates or updates the marker to indicate an interval has been processed. The `when` parameter represents the timestamp of the event.

`removeIntervalData` essentially "unmarks" an interval, allowing it to be re-processed during a subsequent run – this is a soft delete, the record is not physically removed.

Finally, `listIntervalData` provides a way to get a list of all the intervals that have been marked as processed but not yet “forgotten”.

## Interface IPersistCandleInstance

This interface defines how your application can store and retrieve candle data for a specific trading symbol, time interval, and exchange. Think of it as a way to save the historical price information locally, so you don't have to constantly download it from the exchange.

The `waitForInit` method prepares the storage space for your candle data.

`readCandlesData` is the workhorse - it tries to pull a range of candle data from your local storage. Crucially, if even one candle is missing, it returns `null`, signaling that you need to get the data fresh from the exchange.

Finally, `writeCandlesData` lets you save new candle data to your local storage. When saving, you can choose to skip saving candles that are incomplete or already exist, keeping your data clean and efficient.

## Interface IPersistBreakevenInstance

This interface helps manage and save breakeven data for trading strategies. Think of it as a way to remember important information about how a trade should perform, specifically related to when it breaks even. 

This data is organized and tied to a particular combination of symbol, strategy, and exchange, ensuring everything stays neatly categorized. Each trading signal has its own space to store its breakeven details.

If you want to change how this data is stored – perhaps using a database instead of a file – you can create a custom adapter that implements this interface. 

The `waitForInit` method sets up the storage area for your specific trading context. `readBreakevenData` retrieves previously saved breakeven information for a signal at a particular time, and `writeBreakevenData` allows you to save new or updated breakeven data for a signal.


## Interface IPersistBase

This interface provides a basic set of functions for saving and retrieving data, designed for building custom data storage solutions within the backtest-kit framework. Think of it as a contract that your own data storage tools need to follow.

It includes methods for initializing the storage location, reading existing data, confirming if a piece of data exists, writing new or updated data, and getting a list of all the data identifiers. 

The `waitForInit` method handles setup, ensuring the data directory is ready and checking for existing files.  `readValue` and `hasValue` let you fetch and check for specific data entries. `writeValue` securely saves data. Finally, `keys` gives you a way to iterate through all your data, which is useful for things like checking data integrity.

## Interface IPartialProfitCommitRow

This object represents a specific action taken during a backtest – namely, taking a partial profit. 

Think of it as a record of one step in a strategy where you decide to close a portion of your trading position.

It contains three key pieces of information: it confirms that the action taken was a "partial-profit," the percentage of the total position that was closed (e.g., 25% to close a quarter of the position), and the price at which that partial close actually happened. This data helps you understand exactly what happened during the backtest simulation.

## Interface IPartialLossCommitRow

This interface represents a single request to partially close a position. Think of it as a single instruction to sell a portion of your holdings.

It contains details about the action being taken – specifically, a "partial-loss" – and the percentage of the position you want to close. Crucially, it also records the price at which that partial closure actually occurred. This is useful for tracking performance and understanding execution costs.

## Interface IPartialData

IPartialData helps save and restore information about a trading signal. It’s specifically designed to be easily stored and retrieved, even across sessions. 

Think of it as a snapshot of key details, like the profit and loss levels the signal has hit.

It takes the data normally held in sets and turns them into simple arrays, which makes it easier to save as JSON. This allows the system to remember where a signal stood, even if the program is restarted. 

It contains:

*   **profitLevels**: A record of the profit levels the signal has achieved.
*   **lossLevels**: A record of the loss levels the signal has experienced.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how your trading signals are performing, specifically looking at profit and loss milestones. It's used by both the `ClientPartial` and `PartialConnectionService`.

When a signal generates a profit, the `profit` method is called to see if it has reached any predefined thresholds (like 10%, 20%, or 30% profit). If it has, events are triggered to let you know.  A similar process happens with the `loss` method when a signal is experiencing losses, again checking for milestone thresholds and triggering events when they're met.

Finally, the `clear` method comes into play when a signal is finished – whether it hit a take profit, stop loss, or time expiration. It removes all the related profit/loss data, saves changes, and cleans up resources to make sure everything is tidy.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered when parsing command-line arguments. It takes the original input parameters and adds flags to indicate which trading mode is selected – backtest, paper trading, or live trading. These flags—`backtest`, `paper`, and `live`—are boolean values, so they'll be either `true` or `false`, showing you which kind of simulation or real-world execution you're running.

## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a set of default settings you can provide.

It includes the trading symbol, like "BTCUSDT," the name of the strategy you want to use, which exchange you’re connecting to, such as Binance or Bybit, and the timeframe for the price data, like 1-hour candles or 15-minute intervals. Essentially, it's a way to pre-configure your backtest.

## Interface IOrderBookData

The `IOrderBookData` interface represents the data you get from an order book, which shows the current bids (people wanting to buy) and asks (people wanting to sell) for a particular trading pair. 

It contains the `symbol` of the trading pair, like "BTCUSDT".

You'll also find arrays of `bids` and `asks`.  Each of these arrays holds information about individual buy and sell orders, respectively.


## Interface INotificationUtils

This interface defines the core methods that any system for sending notifications—like email, SMS, or push notifications—needs to implement when working with the backtest-kit framework. It provides a standardized way to communicate trading events and important status updates.

The `handleSignal` method receives information about signals like when a trade is opened, closed, or paused. There are also specific methods to handle notifications about partial profit, partial loss, and reaching breakeven points.  `handleStrategyCommit` deals with events related to strategy settings.

The `handleSync` function takes care of signal synchronization events, and `handleRisk` manages notifications when a trade action is rejected due to risk constraints.  Error handling is also covered with methods for regular errors (`handleError`), critical errors (`handleCriticalError`), and validation errors (`handleValidationError`).

Finally, the `getData` method allows you to retrieve a list of all stored notifications, while `dispose` is used to clear them out when no longer needed.


## Interface INotificationTarget

The `INotificationTarget` interface lets you fine-tune which notifications your backtest or live trading system receives. Think of it as a filter for event updates, so you only get the information you actively need. If you don’t specify anything, you'll receive all possible notifications.

You can choose to listen for signal lifecycle changes, like when a signal is opened, scheduled, closed, or cancelled. Notifications about partial profits or losses, when they are available before a commitment is made, are also selectable. Similarly, you can subscribe to breakeven notifications.

The interface also handles confirmations when the strategy makes a commitment to actions like partial profits or losses. You can opt-in to signals related to live trading synchronization, notifications from the risk manager if a signal is rejected, informational messages from the signal, or even errors that occur during the process, distinguishing between recoverable errors and critical, fatal errors. Finally, you can receive notifications if your strategy configuration fails validation.


## Interface IMethodContext

The `IMethodContext` interface holds important information about the current trading environment. Think of it as a little packet of details that gets passed around, telling the system which specific strategy, exchange, and data frame it should be working with. It ensures the right components are used for each trading operation. It includes the names of the exchange, strategy, and the data frame, and the frame name being empty indicates live trading mode.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage solutions—whether they’re in-memory, persistently stored, or just dummy data—should function. It provides a standardized way to interact with memory.

You can use `waitForInit` to get the memory ready for use, telling it whether initial data is present.

`writeMemory` lets you save data to memory, associating it with a unique identifier, a description, and a timestamp.

When you need to find specific information, `searchMemory` performs a full-text search using a ranking system, making sure to only retrieve data recorded before a particular date.

If you want to see everything that’s been stored up to a certain point, `listMemory` retrieves all entries, again filtering by date.

`removeMemory` allows you to delete individual entries from memory, specifying both the identifier and the relevant timestamp.

`readMemory` retrieves a single piece of data by its identifier, and ensures that it's not from the future.

Finally, `dispose` allows you to clean up and release any resources that the memory instance is using.

## Interface IMarkdownTarget

This interface lets you choose which detailed reports you want generated during a backtest or live trading session. Each property corresponds to a specific type of report, like tracking strategy signals, risk rejections, or performance bottlenecks. You can selectively turn these reports on or off to focus on the areas most important to your analysis. For example, enabling "strategy" will give you reports on when trades entered and exited, while "risk" will show you signals that were blocked by risk management. Reports like “heat” will provide visualizations of your portfolio's performance across different symbols.

## Interface IMarkdownDumpOptions

This interface, `IMarkdownDumpOptions`, holds all the details needed to create a report, usually in Markdown format. Think of it as a container for specifying *where* the report should be saved and *what* information it should include.  You use it to define things like the directory path, the specific file name, and crucial identifiers like the trading pair (symbol), strategy name, exchange, timeframe, and even a unique signal ID.  Essentially, it lets you pinpoint exactly which data should be included in a particular report.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework record information about what’s happening. It’s like a central system for keeping track of events.

You can use it to log different types of messages: general events, detailed debugging information, routine updates, and potential issues.

The `log` method is for general recording of important events.

`debug` is for more detailed information used when troubleshooting or developing.

`info` records successful operations and validation checks.

`warn` highlights potential problems that need attention.

Essentially, `ILogger` helps you understand and monitor the framework’s behavior by providing a way to track its lifecycle, operations, and potential errors.

## Interface ILogEntry

ILogEntry represents a single entry within a log history, providing a structured way to record events during a backtesting process. Each entry has a unique ID, a level (log, debug, info, or warn) indicating its importance, and a timestamp for tracking when it occurred.  The createdAt and timestamp properties offer different ways to represent the date and time of the event, useful for user experience and potentially for managing log rotation.

You can also associate each log entry with a method context and an execution context to provide more detail about where and how the log message was generated.  Finally, the topic lets you categorize the log (like identifying which method produced the log) and args provides a space to pass along any extra information.

## Interface ILog

The `ILog` interface provides a way to access and manage log entries generated during backtesting. 

It includes a method called `getList` which allows you to retrieve all the recorded log entries, providing a complete historical record of events that occurred during the backtest. This is useful for debugging, analyzing strategy performance, or auditing trading decisions.

## Interface IHeatmapRow

This interface represents a single row of data within a heatmap visualization for your trading strategies. It summarizes performance metrics for a specific trading pair, like BTCUSDT, across all the strategies you're using. You’ll find key indicators here, such as total profit or loss, how risk-adjusted your returns are (Sharpe Ratio), and the largest potential loss you could have experienced (maxDrawdown). 

It also details the breakdown of your trades: how many you won, how many you lost, and how often you're coming out ahead. Further metrics calculate the average profit per trade, its volatility, the ratio of wins to losses, and how consecutive winning or losing streaks played out. Finally, it includes advanced risk metrics like Sortino and Calmar ratios, providing a comprehensive view of the trading pair’s profitability and risk profile.

## Interface IFrameSchema

The `IFrameSchema` defines the structure for each frame of time your backtest uses. Think of it as setting the boundaries and rhythm of your testing environment. 

Each frame has a unique name to identify it, and you can add a note to describe it for clarity. 

Crucially, it specifies the interval—like daily, hourly, or minute-by-minute—at which data points will be generated, and the start and end dates that encompass the entire backtesting period.

You can also define optional callbacks, which are like special functions that get triggered at specific points in the frame’s lifecycle, allowing for custom actions or data processing.

## Interface IFrameParams

The `IFramesParams` object holds the information needed to set up a ClientFrame, which is a core component for running trading simulations. Think of it as a configuration bundle. It builds upon the `IFramesSchema` and crucially includes a `logger`. This `logger` is your friend for keeping track of what's happening inside the frame – a way to see debug messages and understand how the backtest is progressing.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into important moments in the backtest process related to timeframes. Specifically, the `onTimeframe` property allows you to execute a function whenever a new set of timeframes is created. This is a great place to keep track of what timeframes are being used, verify their accuracy, or perform other validations to ensure your backtest is set up correctly. You can provide a function that either returns a value or resolves a promise to handle these events.

## Interface IFrame

The `IFrames` interface handles how your backtest iterates through time. It's essentially responsible for creating a list of dates that your trading strategies will evaluate. 

You'll use the `getTimeframe` method to generate these dates. This method takes a symbol (like "BTCUSD") and a frame name (like "1h" for one-hour intervals) and returns a promise that resolves to an array of timestamps, spaced out according to your desired interval. This allows the framework to step through time correctly during your backtest.

## Interface IExecutionContext

The `IExecutionContext` provides essential information needed for your trading strategies and exchange interactions. Think of it as a package of details passed along to your code during execution.

It holds key pieces of data like the trading symbol you're working with (like "BTCUSDT") and the precise timestamp of the current operation. 

Crucially, it tells you whether the execution is happening in a backtest scenario (to test your strategy historically) or in a live trading environment. This helps your code behave appropriately in each situation.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with a specific cryptocurrency exchange. It essentially tells the system where to get the historical data (candles, order books, trades) and how to handle quantities and prices according to that exchange's rules. 

Each exchange needs a unique name for identification.

You can also add a note for your own reference, useful for documenting exchange-specific configurations.

The core of the schema is the `getCandles` function, which tells backtest-kit how to retrieve historical price data. 

You can also define how quantities and prices should be formatted, using the `formatQuantity` and `formatPrice` functions respectively, to comply with each exchange’s specifications. If these are not provided, a default format based on Bitcoin’s precision is used.

If you need order book or aggregated trade data, you can provide `getOrderBook` and `getAggregatedTrades` functions. If these are omitted, attempting to use them will result in an error. 

Finally, `callbacks` provide a way to respond to specific events as data arrives, like when a new candle becomes available.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. Think of it as a blueprint for telling the system how to get data and perform actions related to a specific exchange.

You'll need to provide functions for retrieving historical candle data (like OHLCV), formatting order quantities and prices to match the exchange's rules, fetching order books, and obtaining aggregated trade data.  These are core functions the framework relies on to simulate trading.

The `logger` provides a way to send debug messages and track what's happening during backtesting. The `execution` context gives information about the current trading conditions such as the symbol, timestamp, and whether the test is a backtest. 

All methods are considered essential, and the framework will use default behaviors if you don't provide your own implementations.


## Interface IExchangeCallbacks

This interface lets you define functions that your backtest kit application can use to respond to incoming candle data from an exchange. Specifically, the `onCandleData` function is triggered whenever a batch of historical or real-time candle data is retrieved. You provide the symbol (like "BTCUSDT"), the time interval (e.g., "1m" for one-minute candles), the starting date and time for the data, how much data was requested, and an array containing the candle data itself. You can use this to log the data, perform calculations, or react in other ways based on the received candles.

## Interface IExchange

This interface defines how to interact with a cryptocurrency exchange within the backtest-kit framework. It provides a consistent way to retrieve historical and future market data, format trade quantities and prices to match the exchange's requirements, and calculate essential metrics.

You can request historical candle data using `getCandles` to look backward in time, or `getNextCandles` to simulate fetching future data during a backtest. Functions like `formatQuantity` and `formatPrice` handle the exchange's specific rules for trade sizes and pricing.

The framework also offers tools for calculating the VWAP (Volume Weighted Average Price) using recent trade data and retrieving the last close price for a given timeframe. You can access the current order book and aggregated trades for a particular trading pair. Finally, `getRawCandles` gives you a flexible way to fetch candles with custom date ranges and limits, always respecting the execution context to avoid data leakage.


## Interface IEntity

This interface serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point ensuring consistency across different types of persistent data. Any class implementing `IEntity` will inherently have a defined structure for how it's handled and stored. It establishes a contract for how data is represented and handled, which helps keep things organized and predictable.


## Interface IDumpInstance

The `IDumpInstance` interface provides a way to save different kinds of data during a backtesting process. Think of it as a tool for recording details—like messages, records, tables, text, errors, or JSON objects—associated with a specific testing run. Each instance is linked to a unique signal and bucket, ensuring the data is properly categorized.

You can use the methods to store:

*   Full conversations (message histories) from an agent.
*   Simple key-value data records.
*   Arrays of data that can be easily represented as a table.
*   Raw text descriptions or markdown.
*   Descriptions of errors encountered.
*   Complex JSON structures.

Finally, the `dispose` method allows you to clean up and release any resources used by the dump instance when it's no longer needed.

## Interface IDumpContext

The IDumpContext object helps organize and identify data dumps, primarily used within the DumpAdapter. Think of it as a container holding key information about a specific dump. It includes a unique signal identifier to tie the data to a particular trade, a bucket name to categorize it by strategy or agent, and a unique dump ID for individual tracking. You can also add a descriptive label to explain what the dump contains, which helps with searching and understanding the data later. Finally, a flag indicates whether the data originated from a backtest or a live trading session.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as the foundation for how your trading logic reports events that need to be processed later. Think of it as a way to queue up actions – like order fills or trades – so they’re handled at the right time within the backtest or live environment. Each queued event will have a `symbol`, identifying the trading pair involved, and a flag indicating whether the process is running as a backtest.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your historical candle data exists in the system. Think of it as a way to verify that the trading data you're using for backtesting is actually available. You'll specify the trading pair (like BTCUSDT), the exchange it’s from, the time interval (like 1-minute candles or 4-hour candles), and the start and end dates for the data you want to confirm. This helps make sure the backtest has all the data it needs without having to search through every file.

## Interface ICandleData

The `ICandleData` interface defines the structure for a single candlestick, representing a snapshot of price and volume data over a specific time interval. It's the fundamental building block for analyzing historical price action, particularly useful when calculating things like Volume Weighted Average Prices (VWAP) and performing backtests of trading strategies. Each candle contains the precise time it started (timestamp), the opening price, the highest and lowest prices recorded during that period, the closing price, and the total trading volume. This information allows you to recreate and study past market behavior.

## Interface ICacheCandlesParams

This interface defines the settings you can use to control how caching works within the backtest-kit framework. Think of it as a way to fine-tune when and how your data is prepared for backtesting.

It allows you to specify callbacks—special functions that get triggered—at key points during the data preparation process. 

You can define functions to be run right before the initial validation check, and again just before the warm-up phase begins if validation fails. These callbacks give you opportunities to log events, monitor progress, or perform other actions. Essentially, they let you peek into and influence the data preparation process.

## Interface IBroker

The `IBroker` interface defines how backtest-kit connects to real-world trading platforms. Think of it as an adapter that translates the framework's actions into commands your broker understands. 

This interface ensures that your connection to the broker is properly initialized with `waitForInit` before anything else happens.

Specific trading actions, like closing or opening positions, taking profits, or setting stop losses, are communicated to the broker through methods like `onSignalCloseCommit`, `onSignalOpenCommit`, `onPartialProfitCommit`, `onPartialLossCommit`, and others.

Importantly, these calls are made *before* the internal state of the framework is updated, guaranteeing a reliable, transactional process. When running backtests, the framework won't actually send anything to your live broker, so it's safe to develop and test your broker integration in a simulated environment.


## Interface IBreakevenData

This data structure holds basic information about whether a breakeven point has been achieved for a particular trading signal. It's designed to be easily saved and loaded, like when persisting data. Think of it as a simple "yes/no" indicator – has the breakeven been met? The `reached` property is the key here, indicating whether or not that milestone has been passed. It's kept simple to make saving and retrieving this information straightforward.

## Interface IBreakevenCommitRow

This represents a single step in the backtesting process where the strategy aims to determine and adjust its breakeven point. 

Essentially, it captures a moment when the system needs to recalculate or commit to a specific breakeven level.

The `action` property always indicates this is a breakeven-related action.

The `currentPrice` tells you the market price at the time this breakeven adjustment was triggered, providing context for the decision.

## Interface IBreakeven

The `IBreakeven` interface helps manage when a trade's stop-loss is automatically adjusted to the original entry price – a breakeven point. It’s used by components like `ClientBreakeven` and `BreakevenConnectionService` to keep track of this.

The `check` method is the core of the process; it's used during backtesting or live trading to see if the price has moved favorably enough to justify moving the stop-loss to breakeven, taking into account transaction costs. 

It essentially asks: has the price moved enough to cover costs and guarantee a small profit?  If so, it flags the breakeven as reached, notifies anyone listening for that event, and saves the updated status.

The `clear` method is used when a trade closes, whether it hits a target price, a stop-loss, or simply expires. It removes the breakeven tracking from the system and saves the final state.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point within an order book. It contains two essential pieces of information: the `price` at which the bid or ask is offered, and the `quantity` of assets available at that price. Both price and quantity are represented as strings, allowing for a wide range of numerical values, including decimals. This data structure is a building block for understanding the depth and dynamics of market liquidity.

## Interface IAverageBuyCommitRow

This interface represents a single step in a strategy that uses a "dollar-cost averaging" (DCA) approach to buying assets. 

Think of it as a record of one purchase during the DCA process.

It includes details like the current price of the asset when the purchase was made, the total cost of that specific purchase, and the overall number of purchases that have been made in the DCA sequence so far. This information helps track the progress and cost of the DCA strategy.

## Interface IAggregatedTradeData

This data structure holds information about a single trade that happened. Think of it as a record of a transaction. It includes the price at which the trade took place, the amount of the asset that was traded, and a timestamp marking exactly when the trade occurred.  You'll also find a flag indicating whether the buyer or seller initiated the trade - useful for understanding market dynamics. Each trade record has a unique identifier too.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading activity, whether it's a backtest or a live trade. Think of it as a record of what's currently happening.

It's automatically created when a trading process begins – like when a backtest starts or a strategy executes – and then deleted when that process finishes, either successfully or due to an error.

This entry system helps the framework keep track of what's running and prevents conflicts when multiple trading processes are happening at the same time.

The entry contains information like the trading pair's symbol (e.g., BTCUSDT), the strategy and exchange being used, and whether it's a backtest or a live execution.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit, essentially kicking off a process that was planned for later. It’s used when you need to manually trigger an activation that was already set up.

The `action` property always indicates this is an "activate-scheduled" request.

You’ll also need to specify the `signalId` – this identifies the specific signal that the activation applies to.  

Finally, `activateId` is an optional identifier that you can provide if the activation was initiated by a user or specific process, allowing for more granular tracking.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current state of signals, like whether there's an open position or a signal waiting to happen. It’s designed to help you make smart decisions inside your action handlers—for instance, to skip certain actions if there isn't a signal to act upon.

Think of it as a read-only window into what's happening with your signals.

It provides two key methods:

*   `hasPendingSignal`: This tells you if there's an active signal – a position that's already open – for a particular trading symbol.
*   `hasScheduledSignal`: This lets you know if there’s a signal that’s waiting to be triggered at a future time.

You’ll use these methods to determine if an action, like adjusting a stop-loss or taking profit, should be executed.

## Interface IActionSchema

This defines a way to add custom actions to your trading strategies, essentially letting you hook into the trading process at specific moments. Think of actions as personalized "triggers" that execute code based on what's happening during a backtest.

These actions allow you to extend the strategy's functionality, for instance, to log events, send real-time notifications, or integrate with state management libraries like Redux.

You register these actions using a specific name, and each action gets its own instance whenever the strategy runs.

Each action consists of:

*   A unique name to identify it.
*   An optional note for documentation.
*   The core logic – either a constructor function or a set of pre-defined functions – that runs when the action is triggered.
*   Optional lifecycle callbacks that give you more control over when the action runs and what data it receives.

## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run, going beyond just the basic definition of what the action *is*. Think of it as the complete package—it includes tools like a logger for tracking what's happening, identification of the strategy and timeframe it belongs to, and whether it's being tested in a backtest environment. It also gives the action access to details about the current trading signal and any existing positions. This comprehensive set of parameters ensures each action has everything it needs to execute effectively within the backtest-kit framework.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, provides a way to hook into different stages of your trading action handlers. Think of it as a set of customizable events that let you perform specific tasks at key moments.

You can use these callbacks to do things like:

*   Initialize resources when your action handler starts up, like connecting to a database or setting up subscriptions.
*   Clean up resources when the action handler is done, such as closing connections or saving data.
*   Log events and monitor what’s happening during trading.

There are callbacks for different types of events, including initialization (`onInit`), disposal (`onDispose`), and signal generation, broken down by live and backtest modes.  Specific events like breakeven triggers (`onBreakevenAvailable`), partial profit/loss alerts (`onPartialProfitAvailable`, `onPartialLossAvailable`), and ping status updates (`onPingScheduled`, `onPingActive`, `onPingIdle`) offer more granular control. The `onRiskRejection` event informs you when a signal is blocked by risk management, and `onSignalSync` lets you control the execution of limit orders, with the ability to reject and retry them. These callbacks are all optional, and you can use synchronous or asynchronous functions for each.

## Interface IAction

The `IAction` interface is your central hub for reacting to events generated by the backtest-kit framework. Think of it as a way to plug in your custom logic to respond to what's happening during a trading simulation or live trading.  It provides specific methods, each triggered by a different type of event, letting you build things like custom dashboards, log trading activity, or even manage your own risk assessment.

You can use these methods to:

*   Handle signals generated by your trading strategy – whether it’s a general signal, one specific to live trading, or one from a backtest.
*   React to milestones like breakeven points, partial profit or loss levels.
*   Monitor the status of scheduled or active signals via ping events.
*   Deal with situations where a trade gets rejected due to risk checks.
*   Control order placement by responding to synchronization attempts.
*   Clean up any resources your custom logic uses when the framework shuts down.

Essentially, this interface gives you a powerful way to extend the backtest-kit's functionality and integrate it with your preferred tools and systems. Remember to always call the `dispose` method to properly clean up when you’re done.

## Interface HighestProfitStatisticsModel

This model keeps track of the times your trading strategy earned the most profit. It holds a detailed list of those profitable moments, ordered from most recent to oldest. You’ll find the total count of all recorded events as well, giving you a quick overview of how frequently your strategy has achieved peak profit. This data helps you understand and analyze the performance of your backtesting strategy.

## Interface HighestProfitEvent

This describes a single instance where a position achieved the highest profit. It holds key details like when the profit record was set (timestamp), which trading pair was involved (symbol), and the name of the strategy and signal that triggered the trade.

You'll also find information about the position's direction (long or short), and the profit and loss (PNL) associated with it, both overall and at its peak. Importantly, it captures the maximum drawdown experienced, along with the price points relevant to the trade - the entry price, take profit, and stop loss. Lastly, it indicates whether this event happened during a backtesting simulation.

## Interface HighestProfitContract

This interface provides information when a trading strategy reaches a new peak profit. It lets you know what symbol is performing well (like "BTC/USDT"), what the price was at that moment, and when the event occurred. You'll also see details about the strategy itself, including its name, the exchange it's using, the timeframe involved, and the signal that triggered the trade.  A flag indicates whether this update came from a historical simulation (backtest) or a live trading environment. This allows you to build automated actions, like adjusting stop-loss orders or taking partial profits, based on these significant performance milestones.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for your portfolio's heatmap, providing a summary view of how all your assets performed. It includes an array of individual symbol statistics, letting you see performance details for each holding.

You'll also find key portfolio-level metrics here, such as the total profit and loss, Sharpe Ratio (measuring risk-adjusted return), and the total number of trades executed. 

The structure also captures average peak and fall PNL values, weighted by the number of trades for each symbol, giving a sense of typical performance swings. A higher average peak PNL and a value closer to zero for average fall PNL are generally desirable.


## Interface DoneContract

This interface describes what happens when a background task finishes, whether it's a backtest or a live trading session. It provides key information about the completed run, including which exchange was used, the name of the trading strategy, and whether it was a backtest or live execution. You'll find details about the trading symbol involved, like "BTCUSDT" for Bitcoin against USDT. It's helpful for tracking and understanding the context of completed operations.

## Interface CronHandle

This object lets you cancel a scheduled task. Think of it as a way to "unsubscribe" from a regularly occurring event you previously signed up for. When you're done with a task, calling a method on this object will remove it from the scheduling system, ensuring it stops running. It’s a clean way to stop automated processes.


## Interface CronEntry

A CronEntry defines when and how a specific function should be executed within a backtesting environment. Each entry has a unique name, used to identify and manage it.

The `interval` property determines how frequently the function runs, using standard candle intervals like "1m", "5m", or "1h". If you leave this property out, the function executes only once at the very beginning.

You can control the scope of the function's execution with the `symbols` array. If empty, it runs globally, affecting all backtests.  If you provide a list of symbols, it runs only for those symbols.

Finally, a `handler` is the function that actually performs the task when triggered by the cron entry.

## Interface CriticalErrorNotification

This notification signals a critical problem that requires the trading process to stop immediately. It's a way to alert you to serious, unrecoverable errors. Each notification has a unique ID, a descriptive error message to help you understand the issue, and details about the error itself, including a stack trace for debugging. You'll also see that the `backtest` flag is always false because these errors originate from a live trading environment, not a simulated backtest.

## Interface ColumnModel

This section describes how to define the structure of columns when generating tables, particularly for displaying data in a markdown format. It's a flexible way to control what information is shown and how it appears.

Each column has a unique identifier, a user-friendly label for the header, and a function to format the actual data into a string. You also have the ability to conditionally hide columns based on a function that determines visibility. This allows you to tailor the table's presentation to different contexts or user preferences.

## Interface ClosePendingCommitNotification

This notification is triggered when a signal that was waiting to be activated is closed before it actually gets activated. It provides a wealth of information about why the signal was closed and how the related position performed. Key details include a unique identifier for the notification, the exact time of the closure, and whether the event occurred in backtest or live mode.

You’ll find specifics about the trading symbol, the strategy involved, the exchange used, and the signal’s unique ID.  Crucially, the notification includes detailed performance metrics like total profit and loss (PNL), peak profit, maximum drawdown, and associated prices and percentages. It also reports on entry details like the DCA entries, partial closes, and original entry price.  Finally, there's an optional note field for a human-readable explanation of why the signal was closed and a timestamp indicating when the notification itself was created.

## Interface ClosePendingCommit

This signal tells the backtest engine that a pending order has been closed. It provides details about the closure, including a unique identifier you can provide to explain why the position was closed. 

You'll also find information about the position's overall profit and loss (PNL), the highest profit it reached before this closure, and the largest drawdown it experienced during its lifetime. This allows you to track the performance of your closed trades in a meaningful way.

## Interface CancelScheduledCommitNotification

This notification appears when a scheduled trading signal is canceled before it actually activates. It provides a lot of details about the signal that was canceled, allowing you to understand why and how it was handled. You'll see key information like the signal's unique ID, the trading pair involved (e.g., BTCUSDT), the strategy that generated it, and whether it occurred in backtest or live mode.

The notification also includes a breakdown of the potential trade's performance, with metrics like estimated PNL, peak profit, and maximum drawdown. It gives you a look into the trade’s history, including entry prices and slippage estimations.  A user-provided `cancelId` might explain the reason for the cancellation.  Finally, the `createdAt` timestamp tells you exactly when the notification was generated.

## Interface CancelScheduledCommit

This interface represents a signal to cancel a previously scheduled event. It’s primarily used to tell the system to stop a pending action that's already been set up.

To cancel, you’ll specify the `action` as "cancel-scheduled." You can also provide a `cancelId` to help track why the cancellation occurred, which is useful for debugging or auditing purposes.

Alongside the cancellation request, this signal also includes historical performance data related to the position being canceled. You’ll find details on the `pnl` (profit and loss), `peakProfit` (the highest profit achieved), and `maxDrawdown` (the largest loss experienced) up to the point the signal was generated. This information gives you context on the position's history before it was canceled.

## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation.

It tracks individual breakeven events, giving you a detailed list of when those milestones were hit.

You'll also find the total count of all breakeven events recorded.

Essentially, it’s a way to monitor and analyze how often your strategy breaks even during backtesting.


## Interface BreakevenEvent

This data structure holds all the key details whenever a trading signal reaches its breakeven point. Think of it as a snapshot of the trade's state at that specific moment.

It includes things like the exact time it happened, the trading symbol involved, and the name of the strategy that generated the signal. You'll also find information about the signal's ID, whether it was a long or short position, and the current market price.

Crucially, it also stores the original entry price, take profit level, and stop-loss price, along with details of any dollar-cost averaging (DCA) involved, like the total number of entries.  It provides the unrealized profit and loss (PNL) at breakeven, along with a description explaining why the signal was triggered and when the position became active. Finally, it indicates whether this event occurred during a backtest or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents a specific event: when a trading signal's stop-loss is moved back to the original entry price. This signifies a milestone in risk reduction for the trade.

It’s a notification that the trade has moved far enough in profit to cover the initial transaction costs.

Several components use this information, including a reporting service and users who have signed up to receive these updates.

Each `BreakevenContract` includes detailed information: the trading symbol, the name of the strategy that generated the signal, the exchange and frame being used, the full signal data, the price at which breakeven was achieved, whether it's part of a backtest or live trade, and a timestamp.  The timestamp indicates when the breakeven was set – either during a live trade or on the historical candle during a backtest.

## Interface BreakevenCommitNotification

This notification gets fired when a breakeven action is executed, letting you know a position has reached its breakeven point. It contains a wealth of information about the trade, including a unique identifier and a timestamp of when it happened. Whether it's a backtest or a live trade, you'll know the symbol, strategy, and exchange involved.

You'll also get details about the trade itself, like the entry and stop-loss prices, and the total number of entries and partial closes that occurred. Crucially, it includes comprehensive profit and loss (PNL) data, including peak profit, maximum drawdown, and the prices used for those calculations.

Beyond the core trade details, the notification provides historical performance metrics like peak profit and maximum drawdown, giving you insight into the position’s risk profile. Finally, there's an optional note for a human-readable explanation of why the breakeven was triggered, plus timestamps detailing signal creation and pending phases.

## Interface BreakevenCommit

This data represents a breakeven event, signifying a moment where a trading strategy adjusts a position to protect profits.  It includes key details about the trade, such as the current market price and the direction (long or short). 

You’ll find information about the position's performance, including total profit and loss (pnl), the highest profit achieved (peakProfit), and the largest drawdown experienced. 

The data also stores the initial entry price, as well as the take profit and stop loss prices—both their original values and the values after any trailing adjustments. Finally, timestamps indicate when the signal was created and when the position was activated. This information is valuable for understanding the rationale behind a breakeven adjustment and assessing the overall performance of the trade.

## Interface BreakevenAvailableNotification

This notification signals a key event: your trading position has reached a point where your stop-loss can be moved to your initial entry price – essentially breaking even. It's a positive development, indicating the trade is moving favorably and potential losses are minimized.

The notification provides a wealth of detail, including a unique identifier, the exact time it occurred, and whether it’s from a backtest or live trading environment. You’ll find specifics about the trading pair, the strategy used, the exchange involved, and the unique ID of the signal.

It also gives you the current market price, the entry price, the trade direction (long or short), and the current take profit and stop-loss levels, along with their original values before any trailing adjustments.  You can see how many entries were used (for averaging) and partial closes were executed.

Furthermore, it outlines the entire performance of the position so far, including total profit/loss, peak profit, maximum drawdown, and percentage-based performance metrics. Details like the entry and exit prices used for PNL calculations, along with the amount of capital invested, are also provided. There are also specific details around the peak profit and maximum drawdown metrics. Finally, there might be a note providing a brief explanation of why this notification was triggered.

## Interface BeforeStartContract

This interface lets you run custom code right before a trading strategy starts. Think of it as a setup stage – it fires once at the very beginning of each strategy run, before any trading takes place.  It’s designed for tasks like initializing log files, resetting counters, or sending notifications that need to happen just once per run.

You're guaranteed this event will fire and be paired with a corresponding "end" event later, even if something goes wrong during the run.  Errors in your setup code won't stop the run either – they’ll be handled separately.

The information provided includes details like the trading symbol, strategy name, exchange, and the intended start time of the historical data replay (in backtest mode) or the current time (in live mode).  There's also the current price and a timestamp readily available, so you don’t have to query for them separately.


## Interface BacktestStatisticsModel

This model provides a comprehensive set of statistics derived from backtesting results, allowing you to thoroughly evaluate your trading strategy. It contains a detailed list of all closed trades, including information like price and profit/loss. You’ll also find key performance indicators like the total number of trades, win rate, and average profit per trade.

Several metrics help you assess risk and reward, such as standard deviation, Sharpe Ratio (and its annualized version), and Sortino Ratio. The model also incorporates metrics like the certainty ratio and expected yearly returns to further refine your strategy assessment. You can also see average peak and fall profit/loss percentages, along with drawdown-related ratios like recovery factor to understand risk management effectiveness. Note that any value flagged as "unsafe" (typically represented as null) indicates a calculation that was unreliable due to data issues.

## Interface AverageBuyCommitNotification

This notification tells you when a new purchase has been made as part of a dollar-cost averaging (DCA) strategy. It’s essentially a confirmation that another piece of your position has been bought. The notification includes a unique ID, the time it happened, and whether it’s a backtest or a live trade.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that triggered the buy, the exchange used, and the price at which the purchase was made. Crucially, it also provides insights into the overall DCA position: the effective average price, the total number of purchases made so far, and even the total number of partial sales that have occurred.

Beyond the immediate purchase, the notification contains valuable performance metrics like the total profit and loss (pnl) of the position, peak profit achieved, and maximum drawdown experienced. It also breaks down these figures, showing how they relate to individual entries and exit prices, giving you a comprehensive view of the strategy's performance. Finally, there's an optional note that explains the reason behind the purchase.

## Interface AverageBuyCommit

This event signals a new average-buy (often called dollar-cost averaging or DCA) action within a trading position. It's triggered when a new buy or sell order is added to an existing position to lower the average entry price.

The event provides detailed information about the averaging transaction, including the current price at which the order was executed and the total cost of that particular entry. You’ll also find the effective average entry price after incorporating this new order, as well as current profit and loss (PNL) figures. 

It also provides key performance indicators for the entire position, such as peak profit, maximum drawdown, and the original entry price used when the trade was initially opened.  You'll see timestamps indicating when the signal was created and when the position became active. This information is helpful for tracking your dollar-cost averaging strategy and analyzing its impact on your overall position performance.

## Interface AfterEndContract

This interface signals the end of a trading strategy execution, allowing for crucial cleanup tasks. Think of it as a notification that a trading run is complete, regardless of whether it finished normally, encountered an error, or was stopped prematurely.

It’s guaranteed to appear exactly once for each trading run, and it’s always paired with a corresponding `BeforeStartContract` event. This pairing ensures you have the full context of the run’s lifecycle.

The `when` property tells you precisely when the run ended. During backtesting, this reflects the time of the last processed candle or the frame’s start date if nothing was processed. In live trading, it’s the current time, rounded to the nearest minute. The `timestamp` property provides the same information as a numerical value for easy logging or data transmission.

You'll find details about the symbol traded, the strategy used, the exchange providing data, and the timeframe of the run within this event. There’s also a `backtest` flag to differentiate between backtest and live runs, and a `currentPrice` to have the latest price data handy without needing to query the exchange again. This allows you to perform actions such as flushing buffers, closing files, or sending completion notifications in a reliable and predictable way.

## Interface ActivePingContract

This contract defines the information shared when a pending signal is actively being monitored, which happens roughly every minute. It provides details like the trading pair (symbol), the strategy responsible, and the exchange involved.

You'll also receive the complete data for the pending signal itself, including all its parameters, and the current market price at the time of the ping.

A flag indicates whether the event comes from a backtest (historical data) or live trading.

Finally, the event includes a timestamp to precisely mark when the ping occurred, either based on the real-time moment or the candle being processed in a backtest. This allows you to build custom logic to manage these active signals, reacting to conditions like price movements or specific signal lifecycle events. You can set up listeners to receive these ping events and react accordingly.

## Interface ActivateScheduledCommitNotification

This notification tells you when a scheduled trading signal has been activated. It's fired when a user manually triggers a signal, rather than waiting for the price to reach a specific level. The notification provides a wealth of information about the trade, including a unique ID, the exact time of activation, and whether it occurred during a backtest or live trading.

You'll find details about the strategy and exchange that generated the signal, as well as specifics about the trade itself: the symbol, trade direction (long or short), entry and stop-loss/take-profit prices (both original and adjusted), and how many partial executions may have occurred.

The notification also includes performance data for the position, such as total profit and loss (both in USD and as a percentage), peak profit, maximum drawdown, and the prices at which these metrics were achieved. Finally, it details the scheduling history and the current market price at the time of activation, along with an optional note to explain the reasoning behind the signal.

## Interface ActivateScheduledCommit

This interface describes an event that occurs when a previously scheduled trading signal is activated. It contains detailed information about the trade being executed, allowing you to understand its performance and context. You’ll find key metrics like the position direction (long or short), entry price, and take profit/stop loss levels, both as they were initially set and after any adjustments.

The event also captures performance data, including the total profit and loss (PNL), the highest profit achieved, and the maximum drawdown experienced by the position.  A user-provided identifier helps track the reason for the activation. The `scheduledAt` and `pendingAt` timestamps record when the signal was originally created and when it began executing, respectively. Finally, the `currentPrice` represents the market price at the time of activation.
