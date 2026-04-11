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

This interface describes the information passed when a walker is being stopped. 

Think of it as a notification that a specific trading strategy, running on a particular market like BTCUSDT, needs to be halted. 

It's especially helpful when you have several strategies operating at once, as it identifies exactly which strategy and walker should be paused, using the walkerName to make sure you're stopping the right one. The notification includes the trading symbol, the name of the strategy to stop, and the walker's name for clarity.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a consolidated view of your backtesting results. Think of it as a way to easily organize and understand how different strategies performed against each other.

It builds upon the existing WalkerResults data and adds information about comparing different strategies.

The core of this model is the `strategyResults` property, which is simply a list of results for each strategy you tested. This makes it easy to analyze and compare various strategies side-by-side.


## Interface WalkerContract

The WalkerContract describes the updates you'll receive as backtest-kit runs comparisons between different trading strategies. Think of it as a progress report—it lets you know when a strategy finishes testing and how it performed. Each report contains details like the strategy's name, the exchange and symbol it was tested on, and key statistics about its performance, such as its metric value and overall ranking. You’ll also see how this strategy's performance compares to the best strategy found so far, along with the total number of strategies being evaluated. This information helps track the backtest process and understand which strategies are showing the most promise.


## Interface WalkerCompleteContract

The WalkerCompleteContract represents the end of a backtesting process where all strategies have been evaluated. It holds a comprehensive set of results for a specific backtest run.

You'll find details like the name of the walker that performed the tests, the symbol being traded, and the exchange and timeframe used. 

It also includes information about the optimization metric used, the total number of strategies tested, and crucially, which strategy performed the best.

Finally, it provides the specific metric value achieved by the best strategy, alongside detailed statistics about that top-performing strategy.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the backtesting process. 

It's like a warning light saying something isn't quite right with how your trading logic is set up.

Each notification has a unique ID and a detailed error message to help you understand the problem. 

The `error` property contains extra information about the error, including a stack trace which can be useful for debugging. 

Importantly, the `backtest` flag will always be false, indicating that the error arose from conditions existing outside of the backtest itself.

## Interface ValidateArgs

This interface, `ValidateArgs`, is like a set of rules for making sure the names you use in your backtesting setup are correct. 

Think of it as a checklist for things like the exchange you're trading on, the timeframe you’re using, the strategy you've chosen, and even the way you’re managing risk.

Each property within this interface—like `ExchangeName`, `FrameName`, or `StrategyName`—expects a specific type of value that represents a valid option.

Essentially, it’s there to catch any typos or mistakes in your configurations, preventing unexpected behavior and keeping your backtests reliable. It ensures that the names you're using line up with what the system recognizes.


## Interface TrailingTakeCommitNotification

This notification is triggered when a trailing take profit action is executed within a trading strategy, whether it's running in backtest or live mode. It provides a comprehensive snapshot of the trade’s details at the moment the trailing take profit was activated.

The notification includes a unique identifier, a timestamp, and flags indicating whether it’s from a backtest or live environment. You'll find key information like the trading symbol, strategy name, exchange used, and a unique signal ID.

Detailed price information is available, including the original and adjusted take profit and stop-loss prices, as well as the entry price and the current market price. The trade direction (long or short) is also specified.

For strategies using DCA, you can find the number of entries and partial closes. Profit and loss data, including absolute and percentage values, as well as the entry and exit prices used for the calculation, are also provided. Timestamps for signal creation, pending status, and notification creation are included for complete tracking.

## Interface TrailingTakeCommit

This interface describes a trailing take event within the backtest-kit framework. It represents a situation where a trailing stop mechanism has triggered a take profit order.

The `action` property definitively identifies this event as a "trailing-take."

The `percentShift` indicates how much the take profit level has been adjusted based on the trailing strategy.

You’ll also find details about the market conditions at the time of the event, including the `currentPrice` and the current `pnl`.

The `position` tells you whether the trade was a long (buy) or a short (sell) position.

Key pricing information is also included: `priceOpen` represents the initial entry price, while `priceTakeProfit` shows the current, adjusted take profit price.  The original take profit price, `originalPriceTakeProfit`, is stored for reference.  Similarly, the current `priceStopLoss`, along with its original value `originalPriceStopLoss`, provides a complete picture of the risk management parameters.

Finally, the `scheduledAt` and `pendingAt` timestamps provide the chronological context of when the signal was generated and when the position became active.

## Interface TrailingStopCommitNotification

This notification provides details whenever a trailing stop order is triggered and executed. It’s essentially a record of when your trailing stop mechanism kicks in and closes a position.

The notification includes a unique identifier and timestamp for tracking purposes, along with whether it occurred during a backtest or in live trading. It also specifies the trading pair, the strategy that generated the signal, and the exchange used.

You'll find a wealth of information regarding the trade itself: the signal ID, percentage shift of the original stop loss distance, current market price, position direction (long or short), and the original entry and stop-loss prices. Details about any take profit levels are also present.

For strategies utilizing DCA or partial closes, the notification includes the total number of entries and partial closes executed. A comprehensive profit and loss breakdown is also provided, including PNL in USD, as a percentage, and adjusted entry and exit prices. Finally, timestamps mark key moments in the signal’s lifecycle: when it was first created, when it went pending, and when the notification was generated.

## Interface TrailingStopCommit

This describes an event that happens when a trailing stop order is triggered within a trading strategy. It contains all the important details about that specific trailing stop event. 

You'll find information like the direction of the trade (whether it's a long or short position) and the original entry price. It also provides the current market price at the time the trailing stop was adjusted.

Crucially, it includes the updated stop-loss price, which has been modified by the trailing mechanism, along with the original stop-loss and take-profit prices before any adjustments. 

The event records the unrealized profit and loss (pnl) at the time of the trailing stop. Timestamps indicate when the signal was generated and when the position was activated. This allows for a full audit trail and understanding of the trailing stop's effect on the position.

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all kinds of events happening during a trading process. Think of it as a single data structure that holds all the important information about an event, whether it's a trade being opened, closed, scheduled, or even cancelled.

It includes details like the exact time the event occurred (`timestamp`), what action was taken (`action`), and key information relevant to that action. For example, if it's a trade, you'll find the trading pair (`symbol`), the signal ID, and pricing details like the open price, take profit, and stop loss.

The data structure also keeps track of more detailed information like the progress towards take profit and stop loss, the profit or loss figures, and reasons for closure or cancellation.  Specific fields like `pendingAt` and `scheduledAt` clarify when certain stages were reached. This unified format makes it much easier to analyze and report on trading activity, regardless of the specific action involved.


## Interface SyncStatisticsModel

This model helps you understand how often signals are being opened and closed. It keeps track of every sync event, providing a complete history of signal lifecycle activity. You'll find a detailed list of each event, along with the total number of syncs performed, and separate counts for signals that were opened and signals that were closed. This information is valuable for monitoring the health and responsiveness of your trading system.

## Interface SyncEvent

This data structure holds all the important information about events happening during a trading signal’s lifecycle, designed to be easily used for generating reports. It bundles things like when the event occurred, the trading symbol involved, the strategy and exchange used, and the direction of the trade (long or short). You'll find details about order prices, including the original and adjusted take profit and stop loss levels, as well as information about partial closes and DCA entries. It also includes the timestamp when the signal was initially created and when the position became active. Finally, it provides profit and loss information and a reason why a signal might have been closed, along with an indicator to show if the data comes from a backtest.

## Interface StrategyStatisticsModel

This model holds all the statistical information gathered during a strategy's backtest or live operation. Think of it as a detailed report card for your trading strategy.

It includes a complete list of every event that occurred, allowing for in-depth analysis. 

Beyond that, it summarizes the total number of events, and breaks down the counts for different actions like canceling scheduled orders, closing pending orders, taking partial profits or losses, using trailing stops, setting breakeven points, activating scheduled orders, and employing average buy (DCA) strategies. This lets you quickly understand the strategy’s behavior and identify areas for improvement.

## Interface StrategyEvent

This object holds all the important details about events happening within your trading strategy, making it easy to understand what's going on and create clear reports. It records when actions like buying, selling, or adjusting stop-loss orders occur, along with key information like the trading pair, strategy name, and the price at which the action happened. You'll find details about whether the strategy is in backtest or live mode, the trade direction (long or short), and even information about DCA averaging if it's being used. The object also tracks timestamps for various stages of the trade, from initial signal creation to when the position becomes pending and ultimately executed. Finally, it includes profit and loss information related to the trade.

## Interface SignalSyncOpenNotification

This notification tells you when a pre-planned trading signal has been triggered and a position has been opened. It's like a confirmation that your strategy's instructions have been executed.

Each notification has a unique ID and timestamp, along with details about whether it happened during a backtest or live trading. You'll see the trading symbol, the strategy that generated the signal, and the exchange used.

The notification also provides a snapshot of the trade's financial details at the moment it was opened. This includes information about profit and loss, entry and exit prices, and the total cost of the position. 

You can also find details about stop-loss and take-profit prices, how they were originally set, and whether any averaging (DCA) or partial closes were involved. Finally, you'll see when the signal was initially created and when the position actually started.

## Interface SignalSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiring, or being manually closed. It provides a wealth of information about the closed signal, including a unique identifier, the exact time it was closed, and whether it occurred during a backtest or live trading.

You'll find details about the trading symbol, the strategy that generated the signal, and the exchange used. The notification also includes essential data for analyzing performance, like the current price at close, profit and loss figures (both in USD and as a percentage), and the entry and exit prices used in the calculation.

Further details outline the trade's specifics – whether it was a long or short position, the original and adjusted take profit and stop loss prices, and information about any dollar-cost averaging (DCA) or partial closes that occurred. Timestamps for when the signal was created, when the position was activated, and when the notification itself was generated, are also provided to build a complete picture of the signal’s lifecycle. The `closeReason` field tells you exactly *why* the signal closed.

## Interface SignalSyncBase

This defines the core information you'll find in every signal synchronization event within the backtest-kit framework. Think of it as a common foundation for understanding where a signal came from and the context surrounding it.

Each event will include the trading symbol, like "BTCUSDT," the name of the strategy that generated the signal, and the exchange it originated from. You'll also see the timeframe used (important during backtesting) and whether the signal is from a backtest or live trading session. A unique identifier, timestamp, and the full signal data itself are also included for comprehensive tracking.

## Interface SignalScheduledNotification

This notification type, `SignalScheduledNotification`, informs you when a trading signal has been planned for future execution. It’s essentially a heads-up about a pending trade.

Each notification includes a unique identifier (`id`) and a timestamp (`timestamp`) indicating precisely when the signal was scheduled. You'll also see whether the signal originates from a backtest (`backtest`) or live trading environment.

The notification provides details about the trade itself, like the symbol being traded (`symbol`), the strategy that generated the signal (`strategyName`), and the exchange where it will be executed (`exchangeName`). It identifies the signal itself with a unique ID (`signalId`) and specifies the trade direction - whether it's a long (buy) or short (sell) position.

You'll find key price levels too: the intended entry price (`priceOpen`), the take profit target (`priceTakeProfit`), and the stop loss level (`priceStopLoss`), along with their original values before any adjustments were made (`originalPriceTakeProfit`, `originalPriceStopLoss`, `originalPriceOpen`).

If the signal involves averaging (DCA) or partial closing of positions, you’ll see details about the number of entries (`totalEntries`) and partial closes (`totalPartials`). The total cost of entering the position (`cost`), and unrealized profit and loss information (`pnl`, `pnlPercentage`, `pnlPriceOpen`, `pnlPriceClose`, `pnlCost`, `pnlEntries`), are also included. Finally, the current market price at the time of scheduling (`currentPrice`) and the creation time of the notification (`createdAt`) are provided for context.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It’s like a confirmation that a trading signal has been acted upon and a position is now active. 

The notification includes a lot of detail about the trade, such as a unique identifier and the exact time it was opened. You’ll find information about whether the trade happened in a backtest environment or live trading, the symbol being traded (like BTCUSDT), and the name of the strategy that initiated the trade.

The notification also provides key details about the position itself: whether it’s a long (buy) or short (sell) trade, the entry price, take profit and stop loss levels, and even the original values of those prices before any adjustments. 

You'll also find financial information related to the trade, including the cost, unrealized profit and loss (both in USD and as a percentage), and how the entry and exit prices were calculated considering fees and slippage. Lastly, there's a field for an optional note, allowing the strategy to provide a human-readable explanation for the trade. Several timestamps are provided including when the signal was scheduled, when it became pending, and when the notification itself was generated.

## Interface SignalOpenContract

This event signifies that a previously scheduled trade signal has been activated, meaning the exchange has filled the limit order you placed. It's like a confirmation that your order to buy or sell at a specific price has gone through.

You'll receive this event either when the conditions for the trade are met during a backtest (like the candle's low being below your desired buy price) or when the exchange confirms the order fill in a live trading environment.

The event provides a wealth of information about the trade, including the current market price, the overall profit and loss (pnl), the total cost of entering the position, and the original take profit and stop loss prices before any adjustments were made. You'll also find details on the trade's direction (long or short) and the original entry price, especially helpful if you're using dollar-cost averaging (DCA).

Timestamps are also included, showing when the signal was initially created and when the position was activated. Finally, it tells you how many entries and partial closes were involved, giving you a complete picture of the trade's history up to this point. This is particularly valuable for syncing external order management systems or building robust audit trails.

## Interface SignalData$1

This interface describes the data used to track a single trading signal’s performance, particularly for creating profit and loss (PNL) reports. Each signal is identified by a unique ID and associated with a specific strategy. 

It contains information about the asset being traded (symbol), whether the position was long or short, and the percentage profit or loss achieved.  You'll also find the reason the signal was closed and the times it was opened and closed, allowing you to analyze signal behavior over time. Essentially, it packages all the vital details needed to understand the outcome of a single trading signal.

## Interface SignalCommitBase

This defines the basic information included in every signal commit event within the backtest-kit framework. Each signal commit will include details like the trading pair's symbol, the name of the strategy that generated it, and the exchange used. It also indicates whether the signal originates from a backtest or a live trading environment. 

You’ll find a unique ID for the signal, a timestamp reflecting when it occurred (either from a tick or a candle in backtesting), and counts representing the number of entries and partial closes related to the signal. Finally, it tracks the original entry price, ensuring this value isn't altered by any subsequent DCA averaging.

## Interface SignalClosedNotification

This notification provides detailed information when a trading position is closed, whether it's due to hitting a take profit or stop loss, or because of time expiration. It includes identifiers like a unique ID and timestamps marking when the signal was closed and initially created.

You’ll find specifics about the trade itself, such as the symbol being traded, the strategy that generated the signal, and whether it occurred in backtest or live mode. The notification details entry and exit prices, take profit and stop loss levels (both original and potentially adjusted), and importantly, the trade direction (long or short).

Beyond just the basics, the notification reports DCA details like the number of entries and partial closes. You can also see the profit/loss in percentage and absolute terms, along with the specific prices used for PNL calculations. Finally, it provides insights into *why* the position closed and how long it was held, along with any optional notes for extra context.

## Interface SignalCloseContract

This event, `SignalCloseContract`, lets you track when a trading signal is closed. It's triggered whenever a signal stops being active, whether that's because it hit a profit target, a stop-loss, expired, or a user manually closed it.

It’s particularly useful for systems that need to keep external order management tools in sync – for instance, cancelling any linked orders or recording the final profit and loss in a separate database.

The event provides a wealth of detail about the closure, including:

*   The market price at the time of closure.
*   The total profit and loss generated by the position.
*   The trade direction (long or short).
*   The entry and exit prices, including both the initial and potentially adjusted prices (due to trailing or averaging).
*   The reason the signal was closed, like a profit target or time expiration.
*   Details on any DCA averaging or partial closures that occurred.

The `scheduledAt` and `pendingAt` properties provide timestamps for signal creation and position activation, offering a complete timeline of the trade.

## Interface SignalCancelledNotification

This notification lets you know a scheduled trading signal has been cancelled. It provides detailed information about the signal and the reason for its cancellation.

You'll find a unique identifier for the cancelled signal and its associated timestamp, as well as whether it originated from a backtest or live trading environment. The notification includes all the standard signal details like the trading pair, strategy name, exchange, position direction (long or short), and price levels (take profit, stop loss, entry price, and original values).

It also tells you how many DCA entries were planned and how many partial closes were executed, and a description of *why* the signal was cancelled—whether due to a timeout, price rejection, or user action. Further details include the duration the signal was scheduled for, when it was initially created, when it entered a pending state, and when the notification itself was generated. This thorough set of information helps you understand and debug any issues related to cancelled signals.

## Interface Signal

The `Signal` object holds all the critical data related to a single trading position. 

It tracks the opening price of the trade through the `priceOpen` property.

Internally, it maintains a history of entry points using the `_entry` array. Each entry records the price, associated cost, and timestamp.

Similarly, `_partial` stores details about any partial exits from the position, noting the type (profit or loss), percentage, price at the time of exit, cost basis, and entry count at that point, along with the timestamp. This allows for in-depth analysis of how the position was managed over time.

## Interface Signal$2

This `Signal` object represents a trading signal and holds key information about a position. It includes the opening price (`priceOpen`), which is the price at which the position was initially entered.

You'll also find historical records of entries (`_entry`), detailing the price, cost, and timestamp for each entry event.

Similarly, the `_partial` property tracks partial exits from the position, noting whether they were profit-taking or loss-mitigation actions, the percentage of the position closed, the closing price, the cost basis at the time of the partial exit, and the number of units remaining. These records help understand the evolution of the position and its overall performance.

## Interface Signal$1

The `Signal` object in backtest-kit holds information about a trading signal. 

It keeps track of the entry price for a position, which is the `priceOpen`.

You'll also find details about individual entries made, stored in the `_entry` array. Each entry includes the price at which the position was opened, the cost of the position, and the timestamp of the entry.

Similarly, the `_partial` array holds details about partial exits from a position, specifying whether the exit was for profit or loss, the percentage of the position exited, the price at which it was exited, the cost basis at the time of the exit, the number of units held at the time of the exit, and the timestamp.


## Interface ScheduledEvent

This data structure holds all the key information about trading events – when they were scheduled, opened, or cancelled. Think of it as a single record summarizing a specific signal's journey.

Each event is marked with a timestamp and categorized by its action: whether it was scheduled, opened, or cancelled. You'll find details like the trading symbol, a unique signal ID, and the position type involved.

For each event, the structure includes the prices used – the intended entry price, take profit, and stop loss, along with their original values before any adjustments. If a DCA strategy was used, the number of entries and the original entry price are also recorded.

Beyond just the initial setup, the record contains information about partial closes, the unrealized profit and loss (PNL) at the time of the event, and specific details related to cancellations, like the reason and an ID if the cancellation was initiated by a user. Finally, it also captures when the position became active and when the signal was initially created.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` gives you a quick look at how your scheduled trading signals are performing. It tracks all the events related to your signals – when they were scheduled, activated, or cancelled – and provides key metrics to evaluate their effectiveness.

You'll find a detailed list of every scheduled event, along with the total number of signals scheduled, successfully activated, and cancelled.

To help you fine-tune your strategies, the model also includes important performance indicators like the cancellation rate (ideally low) and activation rate (ideally high).  It also provides the average time signals waited before cancellation or activation, giving you insights into potential delays or inefficiencies in your process.

## Interface SchedulePingContract

This contract defines events that occur regularly while a scheduled signal is being monitored, giving you insights into its ongoing status. Think of it as a heartbeat signal indicating the signal is active and being watched.

These events provide information about the trading pair (symbol), the strategy involved, and the exchange being used. You'll receive details like the signal's ID, position size, open price, take profit, and stop-loss levels – essentially a snapshot of the signal’s data.

The `currentPrice` allows you to make decisions based on how the market is moving, perhaps canceling the signal if the price drifts too far from where it initially opened. A flag called `backtest` tells you whether this event is from a historical simulation or live trading.

Finally, a timestamp is provided, which represents the exact moment the ping occurred, whether that's in real-time or during a backtest.  You can listen for these events repeatedly or just once to build custom checks or automate actions based on the signal's ongoing state.

## Interface RiskStatisticsModel

This model holds the results of risk rejection analysis, giving you a clear picture of your risk management performance. 

It contains a detailed list of all the risk events that occurred, allowing you to examine each one individually. 

You'll also find the total number of risk rejections, providing a simple overview of how often your risk controls triggered.

To help you pinpoint areas needing attention, the data is also broken down by the trading symbol involved and by the strategy that was executing the trade. This helps identify specific symbols or strategies with recurring risk issues.

## Interface RiskRejectionNotification

This notification informs you when a trading signal was blocked by your risk management rules. It provides details about the rejected signal, including a unique identifier and the exact time it was rejected. You'll also see whether this rejection happened during a backtest or in live trading.

The notification identifies the trading symbol (like BTCUSDT), the strategy that generated the signal, and the exchange involved. It gives you a clear explanation – the `rejectionNote` – for why the signal was rejected. 

Further information like the number of active positions, the market price at the time, and specific order details such as the take profit and stop-loss prices are included, along with signal-specific details if available. You can use the `rejectionId` for tracking specific rejections, and the signal's creation timestamp is also logged.

## Interface RiskEvent

This data structure holds the details of a trading signal that was blocked due to risk management rules. Each time a signal is rejected, a `RiskEvent` is created to record what happened.

It includes important information like when the rejection occurred (`timestamp`), the trading pair involved (`symbol`), and the specifics of the signal that was blocked (`currentSignal`).  You'll also find the name of the strategy and exchange responsible, the time frame used, and the current market price at the time. 

The `activePositionCount` tells you how many positions were already open when the signal was rejected, while `rejectionId` gives a unique reference for tracking the event.  The `rejectionNote` provides the reason for the rejection. Finally, `backtest` indicates whether this event happened during a backtesting simulation or a live trading session.


## Interface RiskContract

The RiskContract represents a signal that was blocked because it violated your defined risk rules. Think of it as a notification that a potential trade was rejected to protect your portfolio.

This contract provides details about the rejected trade, including the trading pair (symbol), the specifics of the signal itself (like order size and prices), and the strategy that initiated it.  It also includes information about the timeframe used, the exchange involved, the current market price when the rejection occurred, and the total number of active positions you had at the time.

Each rejection has a unique ID and a human-readable explanation for why it was blocked.  You'll find a timestamp indicating exactly when the rejection happened, and a flag to distinguish between rejections during backtesting and those in live trading.

These rejection events are useful for services like report generation or for directly notifying you about risk violations, helping you monitor and refine your risk management strategies.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep an eye on what's happening as your backtest kit walker is running in the background. It provides updates on the overall process, breaking down how many strategies are involved, how many have already been processed, and the current percentage of completion. 

Think of it as a progress report.

Each update contains the name of the walker, the exchange being used, the frame, and the symbol being traded. 

This information lets you monitor the execution and get a sense of how long it might take to finish. You'll see properties like `walkerName`, `exchangeName`, `frameName`, `symbol`, `totalStrategies`, `processedStrategies`, and `progress` – all contributing to a clear picture of the walker's advancement.

## Interface ProgressBacktestContract

This interface provides updates on the progress of a backtest as it runs. It gives you insight into what's happening behind the scenes, letting you monitor the backtest's advancement.

Each update includes details like the exchange and strategy being used, the specific trading symbol involved, and the total number of historical data points (frames) the backtest will analyze.  You'll also see how many frames have already been processed and a percentage indicating how close the backtest is to completion. Think of it as a live status report for your backtest.

## Interface PerformanceStatisticsModel

This model holds performance statistics gathered from a trading strategy. It provides a structured way to understand how a strategy performed.

You’ll find the strategy’s name listed, along with the total count of performance events that were tracked. 

It also includes the total time it took to calculate these performance metrics.

The `metricStats` property bundles statistics by the type of metric being measured, and the `events` property provides access to the raw, detailed performance data for each event. This lets you dig into specifics if needed.

## Interface PerformanceContract

The PerformanceContract provides a way to monitor how your trading strategies are performing during execution. It records key details about different operations, like how long they take to complete. This information is extremely valuable for understanding where your strategy might be slow or inefficient, and for optimizing its performance.

Each performance event includes a timestamp, the time of the previous event (if applicable), the type of operation being measured, and the duration of that operation. You’ll also find information about the specific strategy, exchange, frame (if in backtest mode), and trading symbol related to the measurement. Finally, the contract indicates whether the performance data originates from a backtest or live trading environment.

## Interface PartialStatisticsModel

This data model holds information about how a trading strategy performed when considering partial profit or loss milestones. It essentially breaks down the results into specific events, allowing you to analyze when and how the strategy achieved profits and losses. You'll find a list of all those events, along with the total count of both profit and loss occurrences, providing a clear view of the strategy's partial performance. It allows you to monitor and evaluate the performance of a trading strategy that utilizes partial profit/loss mechanisms.


## Interface PartialProfitContract

The `PartialProfitContract` represents a signal hitting a predefined profit milestone during trading. Think of it as a notification that a trading strategy has reached, for example, 10% or 20% profit. This information is crucial for understanding how a strategy performs – tracking when and where it hits these profit levels helps analyze its effectiveness.

Each event includes key details like the trading symbol, the strategy name, and the exchange being used. You'll also find the original signal data, the current price at the time of the milestone, and the specific profit level reached (like 10%, 20%, or 50%).

The `backtest` flag indicates whether the signal came from a historical backtest or a live trading environment.  A timestamp precisely marks when this profit level was achieved, which differs slightly between live and backtest modes - live mode uses the exact time, while backtest utilizes the candle timestamp. These events are designed to be used by services building performance reports and by developers who want to react to profit level changes in real-time. The system avoids duplicate notifications for each signal, ensuring a clean stream of information.

## Interface PartialProfitCommitNotification

This notification is triggered whenever a partial profit-taking action happens within your trading system. It provides a wealth of information about that specific action, useful for monitoring and analyzing your strategies. You'll find details like a unique identifier for the notification, the exact time it occurred, and whether it was part of a backtest or a live trade. 

The notification includes key trading parameters: the symbol being traded, the strategy that generated the signal, and the exchange used. You'll also get access to signal-specific data, like the percentage of the position closed, the current market price at the time of the partial commit, and the original entry price. 

Crucially, it includes detailed profit and loss (PNL) information, calculated with considerations for slippage and fees, allowing you to track the performance of your strategies in granular detail. There’s also information on how many DCA entries were made and how many partials have already been executed. Finally, timestamps related to the signal's creation and activation are included for complete context.

## Interface PartialProfitCommit

This interface represents a partial profit-taking action within a trading strategy. It describes the event where a portion of a position (long or short) is closed to secure some gains. The `action` property clearly identifies this as a partial profit event.

You'll find details about the percentage of the position being closed (`percentToClose`) and the current market price at the time of the action (`currentPrice`). The interface also provides insight into the position's performance, including the unrealized profit and loss (`pnl`), the entry price (`priceOpen`), and the take profit and stop-loss prices—both the adjusted versions (`priceTakeProfit`, `priceStopLoss`) and the original values before any trailing adjustments were applied (`originalPriceTakeProfit`, `originalPriceStopLoss`). 

Finally, timestamps indicate when the action was scheduled (`scheduledAt`) and when the position was initially activated (`pendingAt`). These details allow for a comprehensive understanding of the partial profit event within the trading strategy's execution.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has hit a profit milestone, like reaching 10%, 20%, or 30% profit. It’s designed to provide detailed information about the trade at that specific moment. Each notification has a unique ID and timestamp, and will indicate whether it originated from a backtest or a live trading environment.

You'll receive information about the symbol being traded, the strategy used, and the exchange where the trade occurred. The notification includes key details like the entry price, the current market price, the take profit and stop loss prices (both original and adjusted for trailing), and the total number of DCA entries and partial closes.

The included P&L data gives a snapshot of the trade's profitability, including both realized and unrealized gains, as well as the entry and exit prices used in the P&L calculation.  You also get the original creation timestamp and when the position went pending. This comprehensive information helps you understand the performance of your strategies and fine-tune your parameters.

## Interface PartialLossContract

The PartialLossContract represents when a trading strategy hits a pre-defined loss level, like a 10%, 20%, or 30% drawdown. These events are triggered by the partial stop-loss mechanism and help you track how your strategy is performing and where it's experiencing losses.

Each event provides a lot of detail, including the symbol being traded, the name of the strategy, the exchange and frame used, and the original signal data.  It also includes the current market price at the time of the event, and most importantly, the specific loss level reached (e.g., -20% loss).

The `backtest` flag tells you whether the event came from a historical backtest or a live trade, and the `timestamp` marks precisely when that loss level was detected. You'll use this information to build reports, monitor strategy behavior, or even trigger custom actions when certain loss thresholds are breached. The system ensures that you only receive each level event once per signal, even if the price moves quickly.

## Interface PartialLossCommitNotification

This notification is triggered whenever a partial loss of a position is executed, whether it's during a backtest or in live trading. It provides a wealth of information about the trade that just happened, like a detailed report card.

You'll find key details like a unique identifier for the notification, the exact time it occurred, and whether it happened during a backtest. The notification also specifies the trading pair, the strategy that generated the signal, and the exchange used.

The notification includes comprehensive information about the position itself, including the entry and take profit/stop-loss prices, both original and adjusted for trailing. You can see the percentage of the position that was closed and the current market price at the time of execution.

It also breaks down the profit and loss (PNL) situation, including absolute and percentage values, along with the prices used for the PNL calculation, and total invested capital. Finally, you can trace the position’s journey with timestamps for signal creation, when the position became pending, and when the notification itself was created. This information is invaluable for debugging, performance analysis, and understanding the intricacies of your automated trading strategy.

## Interface PartialLossCommit

This data structure represents a partial loss event within the backtest framework. It details the circumstances surrounding a decision to close a portion of a position, rather than the entire holding.

You’ll find information here about the action type, which is always "partial-loss". The `percentToClose` tells you what percentage of the position was closed. 

The data includes the `currentPrice` at the time of the action, as well as the current unrealized Profit and Loss (`pnl`).  You can also see the trade direction (`position`), the entry price (`priceOpen`), and the take profit and stop loss prices, both as they were initially set and as they currently exist after any trailing adjustments. Finally, timestamps for the signal’s creation (`scheduledAt`) and the position's activation (`pendingAt`) are included to provide a complete picture of the event’s timeline.

## Interface PartialLossAvailableNotification

This notification lets you know when a trading strategy has reached a predefined loss milestone, like a 10% or 20% drawdown. It's a signal that something's happening with your trade, whether it's a backtest simulation or a live trade. You'll receive this notification when the strategy hits one of these loss levels.

The notification provides detailed information about the trade, including a unique identifier, the exact timestamp of the event, and whether it's happening in backtest or live mode. You'll also see the trading symbol, the strategy’s name, and the exchange it’s running on.

It includes key price points like the entry price, current price, and original stop-loss and take-profit levels, plus data about any partial closures or averaging performed.  You get comprehensive profit and loss information too, including unrealized P&L, profit/loss as a percentage, and details about slippage and fees. Finally, the notification also includes timestamps for when the signal was scheduled, when the position became pending, and when the notification itself was created.

## Interface PartialEvent

This data structure captures key information about profit and loss milestones during a trade. It's designed to provide a complete picture of a trade's progress, including when and why profit or loss levels were reached.

Each `PartialEvent` includes details such as the exact time of the event, whether it's a profit or loss, the trading pair involved, and the strategy and signal responsible.

You'll also find information about the trade's entry and exit prices, along with the original take profit and stop loss levels set when the signal was initially generated.  If the strategy used a dollar-cost averaging (DCA) approach, the total number of entries and the original entry price will be present.

Additionally, it contains details on partial closes executed, the unrealized profit and loss at the time of the event, a description of the signal, and timestamps indicating when the position became active and when the signal was initially created. A flag indicates whether the trade occurred during a backtest or live trading.

## Interface MetricStats

This data structure helps you understand the performance of a specific metric during a backtest. It bundles together several key statistics, giving you a complete picture of how long things took and how consistent they were.

You'll find the type of metric being measured here, along with how many times it was recorded. 

The structure also provides details on durations, including the average, minimum, maximum, and standard deviation. Percentiles like the 95th and 99th are included to show how durations spread out.

Finally, it captures wait times between events, offering insights into the spacing of actions or requests within the backtest.

## Interface MessageModel

This defines the structure of a single message within a conversation, like you’d see in a chatbot interaction. Every message has a `role` indicating who sent it – whether it's a system instruction, your input, the assistant's response, or a result from a tool.

The message also contains the actual `content`, which is the text of what's being said.  Some assistants might include `reasoning_content`, which lets you see the steps the assistant took to arrive at its answer. 

If the assistant used any tools, you'll find those listed in the `tool_calls` array.  Messages can also contain `images`, supporting various image formats.  Finally, a `tool_call_id` helps link a message back to a specific tool request.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading backtest.

It essentially keeps track of how much your portfolio lost at its worst points.

The `eventList` property gives you a detailed history of these drawdown events, showing them in chronological order, with the most recent ones first.

You can also easily see the total number of drawdown events that occurred using the `totalEvents` property.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown event that occurred during a trading simulation or live trade. It provides detailed information about when and how the drawdown happened.

You'll find the exact time the drawdown occurred (timestamp), the trading pair involved (symbol), and the name of the strategy that generated the trade. 

The event also includes the signal identifier, whether the position was long or short, and the unrealized profit and loss (pnl) at that moment. 

Crucially, it captures the price at which the drawdown was recorded, as well as the original entry price, take profit level, and stop-loss level. A flag indicates if the event was part of a backtesting process.

## Interface MaxDrawdownContract

This interface describes the data you receive when a maximum drawdown is reached during trading. It’s essentially a notification that a position has experienced a significant loss from its highest point.

The information includes details like the trading symbol, the current price, and when the drawdown occurred. You’ll also see the name of the strategy and exchange involved, along with the timeframe being used. 

Crucially, it provides the signal data that triggered the position, and a flag to tell you whether this is happening during a historical backtest or in live trading. 

You can use this data to build custom logic like automatically adjusting stop-loss orders or adjusting risk management strategies as drawdown levels are hit. It’s a key tool for monitoring risk and reacting to changes in how your positions are performing.

## Interface LiveStatisticsModel

This model gives you a detailed snapshot of your live trading performance. It collects data from every event, whether it's a period of inactivity, an order being placed, an order being active, or an order being closed.

You'll find key metrics like the total number of events, the number of winning and losing trades, and the overall win rate, expressed as a percentage.  It calculates average and total profit and loss values to understand profitability.

Beyond simple wins and losses, the model also provides insights into risk and volatility, showing standard deviation, Sharpe Ratio (both regular and annualized) and Certainty Ratio.  You can use these to assess the risk-adjusted performance of your strategy.  Finally, the model tracks peak and fall percentages to help you understand maximum profit and potential drawdowns. Keep in mind that any numerical value can be null if the calculation isn't safe or reliable.

## Interface InfoErrorNotification

This component handles notifications about recoverable errors that happen while background tasks are running. It's designed to give you information about problems without stopping the whole process. Each notification has a unique identifier and a detailed error message you can understand. 

You'll also find information about the error itself, including a stack trace and any extra details related to it. It's important to note that these notifications always indicate issues occurring outside of a backtest environment.


## Interface IWalkerStrategyResult

This interface describes the output for a single trading strategy when you're comparing multiple strategies. It holds the strategy's name, along with a collection of detailed statistics from its backtest.  You'll also find a key metric value used to rank the strategy's performance and the strategy’s rank within the comparison group.  Essentially, it packages all the essential information needed to understand and evaluate a strategy’s contribution to a backtesting comparison.


## Interface IWalkerSchema

The Walker Schema defines how to run A/B tests comparing different trading strategies. 

Each schema has a unique identifier, `walkerName`, which helps keep track of different tests. You can also add a descriptive note, `note`, to explain the purpose of the test.

A crucial part is specifying the `exchangeName` and `frameName`—these determine the market and timeframe all strategies within the test will be evaluated on. 

The `strategies` property is a list of the strategy names you want to compare against each other; these must have been registered beforehand.

You can also tell the system what `metric` to optimize for, like Sharpe Ratio, though it defaults to Sharpe Ratio if you don’t specify it.

Finally, `callbacks` provide a way for you to hook into different phases of the walker's execution.


## Interface IWalkerResults

This interface holds all the information gathered when a walker – essentially a comparison tool – has finished evaluating different trading strategies. 

It provides details about the specific asset (symbol) being tested, the exchange used for trading, and the name of the walker itself. You'll also find the name of the timeframe, like '1m' for one-minute candles, used during the strategy comparisons. Think of it as a report card summarizing the walker’s complete run.


## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and perform actions at key moments. Think of it as a way to listen in on what's happening as different strategies are tested.

You can be notified when a new strategy begins testing (`onStrategyStart`), when a particular strategy finishes running (`onStrategyComplete`), or if a strategy encounters an error (`onStrategyError`). Finally, `onComplete` gets called when all the strategies have been assessed, providing a summary of the results. This allows for custom reporting, logging, or even real-time monitoring of your backtest runs.

## Interface ITrailingTakeCommitRow

This interface represents a single step in a sequence of actions related to a trailing take profit and commit strategy. Think of it as a record of what needs to happen – specifically, to initiate a trailing take action.

It holds three key pieces of information:

*   The `action` field clearly identifies this as a "trailing-take" action.
*   `percentShift` defines how much the price should shift when triggering the take.
*   `currentPrice` indicates the price level at which the trailing mechanism was initially set.


## Interface ITrailingStopCommitRow

This describes a record representing a queued action to adjust a trailing stop loss. 

Essentially, it tells the system to perform a "trailing-stop" action. 

The `percentShift` property specifies the percentage change to apply to the trailing stop price. 

Finally, `currentPrice` remembers the price when the trailing stop was initially set, which is useful for context.

## Interface IStrategyTickResultWaiting

This interface describes what happens when a trading signal is set up and is waiting for the price to reach a specific entry point. It's a recurring notification, unlike the initial signal creation.

The notification includes details like the signal itself, the current price being monitored, the strategy and exchange names, the timeframe being used, and the trading symbol.

You'll also find information about the progress towards take profit and stop-loss levels (which are always zero in this 'waiting' state), unrealized profit and loss calculations for the position, and whether the event is part of a backtest or live trading. 

Finally, a timestamp indicates when the result was generated, based on the candle’s time in a backtest or the execution context in live trading.


## Interface IStrategyTickResultScheduled

This interface represents a specific type of event that happens during a trading strategy's execution - when a signal is generated and scheduled, meaning it’s waiting for the price to reach a certain point before an order is placed. It provides information about the signal itself, which includes details like the strategy and exchange involved, the trading symbol (e.g., BTCUSDT), and the current price at the time the signal was scheduled. The `createdAt` timestamp gives you a precise record of when this scheduled signal came into existence, useful for debugging and understanding the timing of your strategy. The `backtest` flag tells you if the event occurred during a simulated backtest or in a live trading environment.


## Interface IStrategyTickResultOpened

This interface describes a specific event in the backtest-kit framework: when a new trading signal is created. It’s like an alert saying, “Hey, a new signal just popped up and is ready to go!”

The `action` property simply confirms that this is an "opened" signal event. 

You'll find the details of that new signal, including its ID, neatly packaged in the `signal` property.  

Along with this information, you get key details about where this signal came from, like the name of the strategy that generated it, the exchange it's associated with, and the timeframe used for analysis. You'll also see the symbol of the trading pair (e.g., BTCUSDT) and the price at which the signal was opened.

Finally, it tells you if this event occurred during a backtest or in a live trading environment and when the event happened.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a state of inactivity – essentially, it's "idle." It provides details about the context of this idle period. 

You'll see information like the strategy's name, the exchange it's connected to, and the timeframe being used (like 1-minute or 5-minute candles). It also includes the symbol being traded (e.g., BTCUSDT), the current price, and whether this is part of a backtest or a live trading session. The `createdAt` field tells you precisely when this idle state was recorded. Crucially, there's no active signal associated with this type of result.

## Interface IStrategyTickResultClosed

This interface represents the outcome when a trading signal is closed, providing a complete picture of what happened. It includes all the essential details for evaluating the signal's performance, such as the reason for the closure (whether it was due to a time limit, profit target, stop-loss, or a manual closure).

You'll find information about the original signal parameters, the closing price, and the profit or loss generated, taking into account fees and slippage. The interface also tracks important identifiers like the strategy name, exchange, time frame, and the trading symbol. A flag indicates whether the event occurred during a backtest or in a live trading environment.  For user-initiated closures, a unique close ID is provided, and a timestamp marks when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a previously scheduled trading signal is cancelled before it can lead to a trade. It's used when a signal is no longer relevant, perhaps because it was cancelled manually, or because the conditions for it to trigger weren't met before a stop loss was hit.

The data provided includes the signal that was cancelled, the current price at the time of cancellation, and important contextual information. You’ll find details like the strategy and exchange names involved, the timeframe used, the trading symbol, and whether this cancellation occurred during a backtest. A reason for the cancellation is also provided, along with an optional ID if the cancellation was initiated by a user action. Finally, it includes the timestamp when this cancellation event was recorded.

## Interface IStrategyTickResultActive

This represents a trading situation where a strategy is actively monitoring a signal and waiting for a specific event like a take profit, stop loss, or a time expiration. The `action` property clearly indicates this "active" state.

You'll find details about the signal being monitored, along with the current price used for tracking. Information about the strategy itself, including its name, the exchange it’s operating on, and the timeframe being used, is also provided.

The current progress toward the take profit and stop loss targets are represented as percentages. You can also see the unrealized profit and loss (PNL) for the position, factoring in fees and slippage. It's marked whether the data comes from a backtest or live trading environment. Timestamps, including when the tick result was created and the last processed candle, are included for tracking and synchronization purposes.

## Interface IStrategySchema

This schema describes how a trading strategy is defined and registered within the backtest-kit framework. 

Each strategy needs a unique name to be recognized. 

You can also add a note for yourself or others to explain the strategy's purpose.

The `interval` property controls how frequently the strategy can generate trading signals—think of it as a built-in way to prevent overwhelming the system.

The core of the strategy lies in the `getSignal` function, which determines when and what kind of trade to make, and this can be configured to wait for a specific price.

Optional callbacks let you execute custom logic when a position is opened or closed.

For managing risk, you can assign a risk profile identifier or even a list of identifiers to the strategy.

Finally, you can attach action identifiers to signal-related actions.

## Interface IStrategyResult

This interface represents a single result from running a trading strategy backtest. Each result holds the name of the strategy, a comprehensive set of statistics detailing its performance, and the value of a key metric used for ranking strategies. It also includes the timestamps of the first and last signals generated by the strategy, which can be helpful for understanding its activity during the backtest period. If a strategy doesn't generate any signals, these timestamp values will be null.


## Interface IStrategyPnL

This interface describes the profit and loss (PnL) result for a trading strategy. It gives you a breakdown of how your trades performed, taking into account factors like fees and slippage.

You'll find the percentage change in your profit or loss (positive or negative), along with the entry and exit prices adjusted for those fees and slippage. 

The interface also provides the actual dollar amount of profit or loss you made, calculated from the percentage change and the total amount invested. Finally, you can see the total capital invested – the sum of the costs of all your entries.


## Interface IStrategyCallbacks

This interface lets you add custom actions that happen at key points in a trading strategy's lifecycle. Think of it as a way to be notified and react to what's going on with your strategy.

You can receive notifications for every market tick with `onTick`, providing you with real-time data.

Specific events trigger other callbacks: `onOpen` when a new signal is initiated, `onActive` when a signal is being monitored, `onIdle` when there's no active signal, and `onClose` when a signal is closed.

For signals with planned entries, you'll get `onSchedule` when a signal is created and `onCancel` if a scheduled signal is cancelled.

`onWrite` is useful for writing signal data to storage during testing.

You’re also notified of profit/loss scenarios: `onPartialProfit`, `onPartialLoss`, and `onBreakeven`.  `onSchedulePing` and `onActivePing` offer opportunities for minute-by-minute monitoring of scheduled and active signals respectively.

## Interface IStrategy

This interface, `IStrategy`, defines the core methods a trading strategy must have within the backtest-kit framework. It's like a contract ensuring strategies can be executed and monitored consistently.

The `tick` method is the heart of the strategy, handling each price update and checking for signals, profit targets (TP), and stop-loss (SL) conditions.  `getPendingSignal` and `getScheduledSignal` retrieve any active signals, which are used to manage TP/SLs and expiry times.

Several methods (`getBreakeven`, `getTotalPercentClosed`, `getTotalCostClosed`, etc.) provide insights into the current state of a trade, like how much is still open, the cost basis, and the effectiveness of the entry price. `getPositionEffectivePrice` and related methods help understand the cost-averaged entry price and related details for positions.

For risk management, `getStopped` confirms if a strategy is paused, while `trailingStop` and related methods dynamically adjust stop-loss levels. The `breakeven` method automatically moves the stop-loss to the entry price when a certain profit level is reached. `averageBuy` allows for adding to a position at a lower price.

The `backtest` method lets you test a strategy against historical data.  `stopStrategy`, `cancelScheduled`, `activateScheduled`, `closePending` are functions for controlling the strategy's activity - essentially pausing it, canceling scheduled entries, or forcing a close. Finally, `dispose` cleans up when a strategy is no longer needed. These methods together give a wide range of control and information for managing and understanding trading strategies.

## Interface IStorageUtils

This interface defines the essential functions that any storage adapter used by backtest-kit must provide. Think of it as a contract – each storage system (like a database or file system) needs to implement these methods to work with the framework.

The adapter needs to be able to react to different signal lifecycle events: when a position is opened, closed, scheduled, or cancelled. These `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods allow the adapter to record or process these events.

You'll also need ways to retrieve signals. The `findById` method lets you look up a specific signal using its ID, while `list` provides a way to get all signals currently stored.

Finally, the `handleActivePing` and `handleSchedulePing` functions allow for updating signal timestamps when ping events are received. These are specifically used to keep track of how long signals have been active or scheduled.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for execution. 

It’s quite simple – it just confirms that the signal's current status is "scheduled." Essentially, it's a flag indicating that this signal is awaiting a future execution time.


## Interface IStorageSignalRowOpened

This interface represents a trading signal that has been opened. It simply indicates that the signal is currently in an "opened" state. The `status` property confirms this, providing a clear indication of the signal's active status. Think of it as a flag saying, "This signal is live and active."

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade associated with it has finished. 

It contains information specific to closed signals, unlike signals that are still open.

The `status` property confirms the signal is indeed in a closed state. 

Crucially, closed signals have a `pnl` property, which contains the profit and loss data generated by that completed trade – essentially, how much money was made or lost.

## Interface IStorageSignalRowCancelled

This interface defines a signal row that represents a cancelled status within the backtest-kit framework. It's a straightforward way to mark a signal as having been cancelled, which is essential for accurately reflecting trading decisions during backtesting. The `status` property, which is always set to "cancelled", clearly identifies the signal’s condition. This allows the system to track and account for signals that were initially considered but ultimately not acted upon.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored. Every signal, whether it's being generated live or during a backtest, will have these core pieces of information.

You'll find a `createdAt` timestamp, which records precisely when the signal was initially created, pulled directly from the strategy tick result.

There's also an `updatedAt` timestamp for tracking any subsequent modifications.

Finally, the `priority` field helps manage how signals are processed – it's assigned a timestamp representing its order of importance, ensuring signals are handled in a predictable sequence, regardless of whether it's a live or backtested scenario.

## Interface ISizingSchemaKelly

This schema defines a sizing method based on the Kelly Criterion, a popular approach for determining optimal bet sizes. It essentially tells the backtest-kit how to calculate how much of your capital to allocate to each trade.

The `method` property is fixed to "kelly-criterion," indicating that this is a Kelly Criterion sizing strategy.

The `kellyMultiplier` property controls how aggressively the Kelly Criterion is applied – a lower value like 0.25 (the default) represents a more conservative approach, while a higher value increases potential gains but also risk. This value is a number between 0 and 1, influencing the proportion of capital risked on each trade.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. The `method` property explicitly states that this is a "fixed-percentage" sizing approach. You'll need to specify the `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on a single trade – for example, a value of 1 would mean risking 1% of your capital per trade.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing schemas used within the backtest-kit framework. Each sizing schema needs a unique identifier, `sizingName`, and can optionally include a `note` for developer documentation. 

You’ll also specify limits on position sizes through `maxPositionPercentage`, `minPositionSize`, and `maxPositionSize`, controlling how much of your account capital is used and defining the smallest and largest trade sizes allowed. Finally, the `callbacks` property allows you to hook into specific events within the sizing process, offering a way to customize its behavior.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR). 

It's designed for strategies that want to adjust position sizes based on market volatility, as measured by ATR.

You’ll specify a risk percentage, representing the portion of your capital you’re willing to risk on each trade. 

The `atrMultiplier` determines how far away from the entry price your stop-loss order will be placed, relative to the ATR value. A higher multiplier results in a wider stop-loss, allowing for more price fluctuation before the trade is stopped out.

## Interface ISizingParamsKelly

This interface defines the parameters needed to calculate trade sizes using the Kelly Criterion method. It allows you to integrate a logger for debugging purposes. The `logger` property lets you specify a logging service to receive messages during the sizing process. You'll provide an instance of `ILogger` to track what's happening.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to consistently size your trades using a fixed percentage of your available capital. It requires a logger to help track and debug the sizing process, ensuring you can understand how trades are being sized. Think of it as providing a way to automatically determine the size of each trade based on a predetermined percentage of your total capital. This is useful for maintaining consistent risk exposure across different trading opportunities.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining how much of an asset to trade, specifically using Average True Range (ATR) as a guide. It's primarily used when setting up a sizing strategy.

The `logger` property is crucial; it allows you to track what's happening behind the scenes – useful for debugging and understanding how your sizing parameters are affecting your trades. It's a way to get feedback on your strategy’s behavior.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process of your trading strategy. You can use the `onCalculate` callback to observe and potentially adjust the calculated position size after it's been determined. This is great for things like logging the size and the parameters used in the calculation, or even verifying that the size is within acceptable limits. Essentially, it allows you to peek into and potentially influence how your positions are sized.

## Interface ISizingCalculateParamsKelly

When calculating your trade size using the Kelly Criterion, you'll need to provide a few key pieces of information. This `ISizingCalculateParamsKelly` object helps structure that. 

It requires you to specify the calculation method as "kelly-criterion". 

You’ll also need to input your win rate – a value representing the probability of a successful trade, expressed as a number between 0 and 1. Finally, provide the average win/loss ratio to accurately determine your optimal bet size.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage approach. It’s all about allocating a consistent portion of your capital to each trade. 

The `method` property simply confirms that you're using the "fixed-percentage" sizing strategy.  You’ll also need to specify the `priceStopLoss`, which represents the price level at which your stop-loss order will be triggered. This value is crucial for managing risk when sizing your trades with this method.

## Interface ISizingCalculateParamsBase

This defines the basic information needed for calculating how much of a trading pair to buy or sell.

Every sizing calculation – whether it’s for a specific strategy or a complex system – relies on knowing the trading symbol, like "BTCUSDT". It also needs to know your current account balance, so the sizing can be appropriate for your available funds.  Finally, the planned entry price is essential to accurately determine the size of the position.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining position size based on the Average True Range (ATR). 

Essentially, you'll use this to specify that your sizing strategy relies on ATR and provide the current ATR value to use in those calculations. The `method` property is fixed to “atr-based”, indicating the type of sizing calculation being performed. The `atr` property is the numerical value of the ATR, which is crucial for calculating the appropriate position size.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade. It's a core piece of how the backtest kit actually executes strategies. 

The main method, `calculate`, takes in information about your risk preferences and market conditions and then returns the suggested position size – essentially, how many shares or contracts to buy or sell. This function will be used during the backtest execution to decide on the position sizes.

## Interface ISignalRow

This describes the structure of a signal record within the backtest-kit framework. Each signal represents a potential trading opportunity and contains a wealth of information about it, from its unique ID and cost to details about its execution and performance tracking. The signal’s properties include things like the price at which the position was opened, the expected duration, and identifiers for the exchange, strategy, and timeframe involved. 

It also tracks crucial details like partial profit/loss closures, a trailing stop-loss and take-profit mechanism, and a DCA entry history, which is particularly useful for averaging buy-in prices. Performance tracking is built-in, with records of the highest and lowest prices seen, along with associated profit/loss percentages and costs. Finally, it includes a timestamp to mark when the signal was created or retrieved. This comprehensive data structure facilitates detailed backtesting, analysis, and performance monitoring of trading strategies.

## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to retrieve them in batches over time. Think of it as a way to group signals together and release them at specific intervals. Each signal has a unique ID to keep track of it. This is useful for coordinating trading actions and ensuring they happen at the right moments.

## Interface ISignalDto

The ISignalDto represents a trading signal, providing all the information needed to execute a trade. Each signal includes a unique identifier, which is automatically generated if not provided initially. It specifies whether the trade should be a "long" (buy) or "short" (sell) position, and includes a note explaining the reasoning behind the signal. 

You'll also find the entry price, take profit target, stop-loss level, and an estimated duration in minutes for the trade. The cost of entering the position is also included, defaulting to a global setting. This structure ensures consistency and facilitates automated validation of signal parameters.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, represents a trading signal that's designed to be executed at a specific price in the future. Think of it as a signal that's "on hold" until the market reaches a certain price level.

It builds upon the basic `ISignalRow` to add the concept of delayed execution.  When a scheduled signal is triggered, it transforms into a standard, pending signal.

The crucial part is `priceOpen`: this defines the price that the market must reach before the signal is activated and converted to a regular pending order.  The system keeps track of when it was initially scheduled and when it's actually pending, offering insights into potential delays.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that can be canceled by the user. It builds upon the base signal information, adding a `cancelId` property. This `cancelId` is specifically used when a user wants to cancel a previously scheduled signal, allowing for tracking and management of those user-initiated cancellations. If a signal wasn't canceled by the user, this property will not be present.

## Interface IRunContext

The `IRunContext` is like a central hub of information when your code needs to run within the backtest-kit framework. It packages together two key pieces of data: how your strategy should be routed (things like the exchange, strategy name, and frame name) and the current runtime state – including the symbol being traded and the exact time. Think of it as a container that holds everything needed to execute a particular piece of logic within your trading strategy. It's used internally to share this data efficiently, separating routing information from runtime details.

## Interface IRiskValidationPayload

This object holds the information needed when you're checking if a trade is risky. It builds upon a base set of arguments and includes details about the current trading signal and what’s already happening in your portfolio. 

You'll find the `currentSignal` property which represents the signal that's being evaluated; it includes price data that's essential for the validation.  It also provides the `activePositionCount`, giving you a simple number representing how many positions are currently open.  

Finally, `activePositions` contains a detailed list of all the currently active trades, allowing for a more granular risk assessment.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and sound. Think of it as a quality check for your risk parameters. The function receives input and decides whether it's acceptable – if it is, it simply moves on. However, if it spots a problem (like unrealistic order sizes or insufficient margin), it either returns a specific rejection object detailing the issue or throws an error, both of which are handled to provide clear feedback.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you set up rules to check if your trading strategies are operating within acceptable risk levels. Think of it as a way to define your own quality control for your risk parameters.  It has two parts: `validate`, which is the actual function that does the checking – it takes your risk parameters and determines if they're okay – and `note`, which is a helpful description to explain *why* you’re performing that validation. The `note` is purely for documentation and won't affect the actual validation process itself.

## Interface IRiskSignalRow

The `IRiskSignalRow` interface represents a row of data used internally for risk management within the backtest kit. It builds upon the existing `ISignalDto` by adding specific price-related information. Think of it as a way to access the initial entry price of a trade, along with the original stop-loss and take-profit levels that were set when the trade signal was first generated. This data helps validate risk parameters and ensure the trading system operates within defined boundaries.

## Interface IRiskSchema

The IRiskSchema lets you define and register custom risk controls for your portfolio. Think of it as setting up rules to manage risk at a portfolio level, ensuring your trades align with your strategy. Each risk schema has a unique name for identification and can include notes for documentation.

You can also provide callbacks to handle specific events, like when a trade is rejected or allowed.

The most important part is the validations - this is where you put in your custom logic to check if a trade meets your risk requirements. You can specify multiple validations, allowing for complex risk management rules.

## Interface IRiskRejectionResult

This interface defines the information you get when a risk check fails during your trading strategy's validation. It’s essentially a report card for why something didn’t pass the rules.  Each rejection has a unique `id` to help track it, and a clear `note` explaining the reason for the failure in a way that a person can understand.  This allows you to pinpoint exactly what needs to be adjusted in your strategy to ensure it meets all the required criteria.

## Interface IRiskParams

This interface defines the settings you provide when setting up your risk management system. It includes important details like the exchange you’re working with, a logger for tracking what's happening, and information about the execution environment - whether you're in a simulated backtest or a live trading situation. 

You can also specify a function to be called when a trading signal is blocked due to risk limits; this function allows for custom actions or notifications related to risk rejections. Think of it as your safety net for making sure trades are within acceptable risk boundaries.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide whether a trading strategy should be allowed to place a new order. Think of it as a gatekeeper; it’s checked before a signal is created, making sure the conditions are right. The arguments passed include details like the trading pair's symbol, the signal being considered, the name of the strategy wanting to trade, and the exchange being used. You'll also find information like the current price, a timestamp, and the name of the risk profile being applied. Basically, it's a snapshot of the situation at the moment the strategy is asking to execute.

## Interface IRiskCallbacks

This interface defines optional functions you can use to respond to specific risk-related events within the backtesting framework. Think of them as notification hooks – when certain risk checks happen, these functions get triggered.

If a trading signal is blocked because it exceeds your defined risk limits, the `onRejected` function will be called, allowing you to log the event or take some other action.

Conversely, if a signal successfully passes all the risk checks, the `onAllowed` function will be invoked, signaling that the signal is considered safe to execute. Both functions receive information about the symbol and the risk check parameters that were involved.

## Interface IRiskActivePosition

This interface describes an active trading position that a risk management system is tracking. It bundles together essential information about a trade, like which strategy created it, what exchange it's on, and the specific symbol being traded (e.g., BTCUSDT). You’ll find details like the direction of the trade – whether it's a long or short position – along with the entry price and any stop-loss or take-profit levels set.

The interface also includes information about when the position was opened and an estimate of how long it's been active. This data allows for a more complete picture of the risk exposure across different trading strategies.


## Interface IRisk

This interface, IRisk, is like a gatekeeper for your trading strategies, making sure they don't take on too much risk. It allows you to define and enforce limits on how much you're willing to risk on any given trade. 

It offers a few key functions: 

First, `checkSignal` lets you evaluate whether a potential trade is acceptable based on your pre-defined risk rules. It returns a promise indicating whether the signal is approved.

Then, `addSignal` allows you to register when a new trade is opened, keeping track of its details like entry price, stop-loss, take-profit, and more. This helps to monitor open positions against your risk parameters.

Finally, `removeSignal` is used when a trade is closed, so the system knows to stop tracking that position and any associated risk calculations.

## Interface IReportTarget

This interface lets you pick and choose what kinds of information you want to see when your trading strategy is running. Think of it like a checklist; each option represents a specific type of event or data point that you can enable for logging. For example, you can turn on logging for strategy decisions, risk rejections, or even performance metrics, allowing you to fine-tune your backtesting and understand exactly what's happening behind the scenes. You control the level of detail you receive, helping you focus on the most important aspects of your trading process. The available options include things like tracking breakeven points, partial closes, heatmaps, walker iterations, schedules, live trading events, and milestones related to profit and drawdown.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you control what information gets saved when creating reports during a backtest. Think of it as a set of labels that describe a specific event or data point you’re interested in. It lets you specify things like the trading pair (like BTCUSDT), the name of the strategy used, the exchange it ran on, the timeframe used (e.g., 1 minute, 1 hour), and even a unique identifier for the signal that triggered a trade. By providing these details, you can filter and organize your backtest results to focus on what's most important to your analysis.

## Interface IPublicSignalRow

This interface defines the data provided publicly for each trading signal, ensuring users have a clear understanding of the initial setup. It builds upon the basic signal information with the addition of `originalPriceStopLoss` and `originalPriceTakeProfit`, which show the prices you initially set for your stop-loss and take-profit orders. 

These original values are important because they remain constant, even if your stop-loss or take-profit orders are adjusted using trailing methods. You'll also find information about how much of the position has been closed through partial executions, the total number of entries (useful for understanding dollar-cost averaging), and the original entry price. Finally, it includes the unrealized profit and loss (PNL) at the time the signal was generated.

## Interface IPublicCandleData

This interface defines the structure of a single candle, representing a specific period in trading data. Each candle contains key information like the exact time it started (timestamp), the price when trading began (open), the highest and lowest prices reached during that time (high and low), the final price when the period ended (close), and the total volume of trading activity (volume) that occurred. Essentially, it's a snapshot of market activity over a given interval.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you define the parameters for calculating position sizes based on the Kelly Criterion. It's all about setting the right expectations for your trading strategy. You’ll need to specify `winRate`, which represents the probability of a winning trade, expressed as a number between 0 and 1.  Then, you’ll provide the `winLossRatio`, representing the average profit you make on a winning trade compared to the average loss on a losing trade. These values are the foundation for determining how much capital to risk on each trade.

## Interface IPositionSizeFixedPercentageParams

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your capital to determine the size of each trade. It focuses on setting a stop-loss price to manage potential losses. The `priceStopLoss` property specifies the price at which you want to place a stop-loss order – this helps to automatically limit your risk if the trade moves against you.

## Interface IPositionSizeATRParams

This parameter defines the current Average True Range (ATR) value that's being used to determine position size. The ATR helps measure volatility, and a higher ATR generally indicates more risk, which can influence how much capital you allocate to a trade. Think of it as a key indicator of market fluctuation that the framework considers when sizing your positions.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface helps you define how sensitive your backtesting is to detecting overlapping positions when using dollar-cost averaging (DCA). It essentially sets up a "buffer zone" around each DCA price level.

You use `upperPercent` to specify how much higher than a DCA level will trigger an overlap warning – think of it as a safety margin above the price.

Similarly, `lowerPercent` defines how much lower than a DCA level is considered an overlap.

These percentages, expressed as values between 0 and 100, allow you to fine-tune how aggressively your backtest identifies potential issues with overlapping positions.

## Interface IPersistBase

This interface outlines the core operations needed for any custom storage system you build to work with backtest-kit. It's the foundation for how backtest-kit interacts with persistence, like databases or files.

You'll use `waitForInit` to set up and confirm your storage is ready when things start. `readValue` and `hasValue` let you retrieve existing data and check if a piece of data is present. `writeValue` handles storing new data securely. Finally, `keys` provides a way to list all the IDs of the data you have stored, which is useful for verifying and looping through everything. 

Essentially, this interface provides a consistent way for backtest-kit to read, write, and manage data within your custom storage adapter.

## Interface IPartialProfitCommitRow

This object represents a specific instruction to take a partial profit on a trade. It's essentially a record of what happened when a portion of a position was closed out.

The `action` will always be "partial-profit", clearly identifying this as a partial profit instruction. 

`percentToClose` tells you exactly what percentage of the original position was closed – for example, 25% or 50%.  Finally, `currentPrice` captures the price at which that partial profit transaction was actually executed, which is important for accurate record-keeping.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, queued up for execution. It includes the type of action being performed, which is specifically a "partial-loss."  You’ll also find the percentage of the position that needs to be closed, and the price at which that partial closure actually happened. This data is used to track and confirm the details of the partial position closure.

## Interface IPartialData

This data structure, called `IPartialData`, is designed to save and load information about a trading signal. It's specifically used to store key pieces of data – namely, the profit and loss levels – in a format that can easily be saved to a database or file. Think of it as a snapshot of the progress of a trade, where the `profitLevels` and `lossLevels` represent the price points where the trade has achieved certain gains or losses. Because some data formats have trouble with certain data types, like sets, these levels are converted into arrays to make sure everything can be saved properly.

## Interface IPartial

This interface, `IPartial`, is all about keeping track of how your trades are performing – whether they're making money or losing it. It's used internally by the framework to monitor trading signals and let you know when they hit important milestones like 10%, 20%, or 30% profit or loss.

When a signal is doing well (making a profit), the `profit` method steps in to analyze the situation, see if any new profit levels have been reached, and then notify you. Similarly, when a signal is losing money, the `loss` method does the same, identifying new loss levels. 

To ensure you're not overwhelmed with notifications, it makes sure you only receive updates for newly reached levels. When a signal finishes, the `clear` method cleans up the accumulated data, removing it from memory and saving any necessary changes. It effectively resets the tracking for that signal.

## Interface IParseArgsResult

The `IParseArgsResult` represents what you get back after parsing command-line arguments used to control how your trading system runs. It essentially tells you which mode your system is operating in. 

You'll find properties indicating whether you're in backtest mode – simulating trading using historical data – or paper trading mode, which uses live data for a simulated trading environment.  There's also a flag to confirm if the system is running in a live, real-money trading environment.


## Interface IParseArgsParams

This interface describes the information needed to run a trading strategy from the command line. Think of it as a blueprint for how to tell the system what to trade, which strategy to use, where to trade it (which exchange), and what timeframe of data to analyze.  It specifies that you'll need to provide the trading symbol like "BTCUSDT", a name for your strategy, the name of the exchange you're using (like Binance), and the timeframe for the price data (like 1-hour candles).  Essentially, it's a quick way to configure a backtest without needing to write a lot of code.

## Interface IOrderBookData

This interface holds the information about an order book, which is essentially a snapshot of what buyers and sellers are offering for a particular trading pair. It contains the `symbol` representing the trading pair (like BTCUSDT), a list of `bids` – those are buy orders indicating what prices buyers are willing to pay, and a list of `asks` – what prices sellers are offering to sell at. Think of it as a live view of the market's price discovery process. You can use this to understand the immediate supply and demand for an asset.


## Interface INotificationUtils

This interface serves as the foundation for how your backtest-kit trading system communicates important events. Think of it as a central point for delivering information about trades and system status.

It defines a set of methods to handle various occurrences, such as when a trade is opened or closed, or when a partial profit or loss opportunity arises. You'll also find methods to deal with synchronization events, potential risks, and different types of errors, from simple issues to critical ones.

The `getData` method allows you to retrieve a list of all notifications that have been stored, and `dispose` provides a way to clear out these notifications when they're no longer needed. Essentially, it provides the structure for broadcasting and managing information relevant to your trading strategy's execution.

## Interface IMethodContext

The `IMethodContext` interface helps your backtesting strategies keep track of which specific components they're working with. Think of it as a little bundle of information that gets passed around, telling your code which exchange, strategy, and frame to use. This is super helpful because it means you don’t have to explicitly specify these details everywhere in your code. It’s like a shortcut that makes things simpler and more organized. The `exchangeName`, `strategyName`, and `frameName` properties within this context hold the names of the schemas for each of those elements. If you’re running a live test, the `frameName` will be empty.

## Interface IMemoryInstance

This interface outlines how different memory systems—whether they store data locally, persistently, or are just for testing—should behave. It provides a common set of actions you can perform on that memory.

You can initialize the memory system using `waitForInit`. `writeMemory` lets you save information, associating it with a unique ID and a helpful description.  Need to find something?  `searchMemory` uses a powerful search technique to find entries that match your query. If you need to see everything, `listMemory` displays all the stored entries.  Of course, `removeMemory` deletes specific entries, while `readMemory` retrieves a single item.  Finally, `dispose` helps clean up any resources the memory system is using when you’re finished with it.

## Interface IMarkdownTarget

This interface lets you fine-tune which detailed reports are generated by the backtest-kit framework. You can choose to focus on specific areas like strategy performance, risk management, or even how signals are handled within the system. Each property, such as `strategy`, `risk`, or `performance`, corresponds to a type of report. Turning a property to `true` activates the corresponding report, offering more insight into that aspect of your trading. It gives you precise control over the level of detail you receive, helping you pinpoint areas for improvement without being overwhelmed by data.

## Interface IMarkdownDumpOptions

This interface helps organize and specify where and what data to extract when creating documentation. Think of it as a set of labels that identify exactly which parts of your backtesting results you want to include. It contains information like the directory path, file name, and details about the trading symbol, strategy, exchange, timeframe, and even a unique identifier for the signal being used. By defining these properties, you can precisely target and document specific aspects of your backtesting process.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s a central tool for tracking what's going on inside the system – from the actions of individual agents to how the entire swarm is behaving.

You can use it to record different types of messages to help understand how things work. 

It offers several logging levels:

*   `log`: For general, important messages.
*   `debug`: For very detailed information used mainly when troubleshooting.
*   `info`: For routine status updates and confirmations.
*   `warn`: For potential problems that don’t stop the system, but should be investigated.

Essentially, it’s your window into the system’s workings, allowing you to debug, monitor, and keep a record of events.

## Interface ILogEntry

Each log entry, or `ILogEntry`, represents a single event recorded during a backtest. Every entry gets a unique ID, a level indicating its severity (like "log," "debug," or "warn"), and a timestamp showing when it occurred. The `createdAt` and `timestamp` properties provide different time references to enhance user understanding and tracking.

To give more context, log entries can also include information about the method (`methodContext`) and the broader execution environment (`executionContext`) where the log originated. Finally, any extra arguments passed with the log call are captured in the `args` property, offering a complete picture of the event.

## Interface ILog

The `ILog` interface provides a way to keep track of what’s happening during your backtesting or trading simulations. It allows you to retrieve a complete list of log entries, giving you a historical record of events, errors, or important messages that occurred during the process. This is particularly helpful for debugging and analyzing how your strategies performed. You can call the `getList` method to access this entire history.

## Interface IHeatmapRow

The `IHeatmapRow` interface represents a single row of data displayed in a portfolio heatmap. It summarizes key trading performance metrics for a specific trading pair, like BTCUSDT. You'll find information here like the total profit or loss percentage generated across all strategies using that pair.

The interface provides a comprehensive overview, including the Sharpe Ratio (a measure of risk-adjusted return), the maximum drawdown (the biggest loss experienced), and the total number of trades executed.  It breaks down the trading activity with details like the number of winning and losing trades, win rate, and average profit/loss per trade.

You can also see statistics on trade performance, such as average win and loss amounts, the longest winning and losing streaks in a row, and expectancy (a calculation of potential profit based on win/loss probabilities).  Finally, it includes details on average peak and fall percentages related to trade performance, offering further insight into risk and reward.

## Interface IFrameSchema

The `IFrameSchema` defines a specific period and frequency for generating data points during a backtest. Think of it as setting the stage for your trading simulation – you specify the start and end dates, and how often data should be created (e.g., every minute, hour, or day). Each schema has a unique name for easy identification and can include notes for developers to clarify its purpose. You can also customize the process with optional lifecycle callbacks to perform actions at different stages.

## Interface IFrameParams

The `IFramesParams` object holds the settings you provide when setting up a connection to a trading environment. It builds upon the `IFramesSchema` and crucially includes a `logger`. This `logger` allows you to monitor and debug what's happening behind the scenes, providing valuable insights into the framework's operation. It's your window into internal workings, helping you troubleshoot and understand the flow of data and commands.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into the different stages of a timeframe generation process within the backtest-kit framework.

Specifically, the `onTimeframe` function gets called right after the system creates the array of timeframes it will use for the backtest. Think of it as a signal that the timeframe data is ready – you can use this to check the data, log it for debugging, or perform any other actions you need related to those timeframes. The function receives the array of timeframes, the start and end dates for the timeframe, and the interval used to generate them.

## Interface IFrame

The `IFrames` interface is all about managing the timeline for your backtesting. It helps orchestrate how your trading strategies are tested against historical data. 

The core function, `getTimeframe`, allows you to request a list of specific dates and times for a given trading symbol and timeframe (like 'daily' or 'hourly'). Think of it as creating the precise sequence of moments you want to analyze. It's used under the hood by the backtest kit to build the iterative process of evaluating your trading decisions.

## Interface IExecutionContext

The `IExecutionContext` interface represents the environment in which your trading strategies and exchange operations run. Think of it as a package of information passed along to your code to provide necessary context.

It holds crucial details like the trading symbol – which asset pair you're dealing with (like "BTCUSDT").

You'll also find the current timestamp, representing the precise moment the operation is happening.

Finally, it indicates whether the code is running a backtest – a simulation of past market data – or operating in a live trading environment. This distinction affects how certain functions behave.


## Interface IExchangeSchema

This interface describes how to connect backtest-kit to different exchanges and data sources. Think of it as a blueprint for telling the framework where to get your historical data and how to interpret it.

Each exchange you want to use needs its own schema defining things like its unique identifier, a description for developers, and most importantly, how to retrieve candle data (open, high, low, close prices). You’ll also specify a function to fetch order book data and aggregated trades if you require them.

To handle the nuances of each exchange, you can define how to correctly format trade quantities and prices, ensuring they match the exchange's specific precision rules. If you don't provide formatting functions, it will default to Bitcoin precision.

Finally, you have the option to define callback functions for lifecycle events, like when new candle data arrives. This allows you to react to data as it comes in.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It’s a set of functions that allow the testing environment to mimic the behavior of a real exchange.

You'll provide a logger for debugging purposes and an execution context that holds information like the trading symbol and the test backtest flag.

The core functionality revolves around data retrieval:

*   You must implement a way to fetch historical candlestick data (`getCandles`) for a given symbol and time period.
*   You'll also need functions to format quantities and prices (`formatQuantity`, `formatPrice`) to match the exchange’s precision rules.
*   Finally, you'll need to retrieve order book data (`getOrderBook`) and aggregated trade data (`getAggregatedTrades`) to simulate market conditions.

All these methods are crucial for accurate backtesting and default values are applied during the initialization if you don't define them.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit is pulling data from an exchange. Specifically, the `onCandleData` callback is triggered whenever the system retrieves new candlestick data. You can use this to monitor when new data arrives, potentially log it, or perform calculations based on the incoming price information for a given symbol and timeframe. The data provided includes the symbol, interval, starting date, number of candles requested, and an array of the actual candlestick data.

## Interface IExchange

The `IExchange` interface defines how your backtest interacts with a cryptocurrency exchange. It gives you tools to retrieve historical and future price data (candles) – crucial for simulating trades. You can also request order book information and aggregated trade history to understand market depth and activity. 

The framework helps you format trade quantities and prices to match the exchange's specific requirements.  It even includes a function to calculate the VWAP (Volume Weighted Average Price) based on recent price action.

Importantly, all data retrieval functions are designed to prevent "look-ahead bias" – meaning the backtest only uses information available at a given point in time.  You have a lot of flexibility in how you fetch candles, specifying start and end dates, or simply a limit of candles to retrieve relative to the backtest's execution time.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point – anything that's saved to a database or file will likely implement this interface. It ensures a degree of consistency and allows the framework to work with different entity types in a predictable way. While the specific properties within `IEntity` aren't defined here (they'll be different depending on the entity type), it establishes the fundamental contract for anything considered a persistent object within the system.

## Interface IDumpInstance

This interface defines how to save different types of data during a backtesting process. Think of it as a way to record important snapshots of what's happening. You can use it to store full conversation histories, simple key-value data, tables of information, raw text, error messages, or even complex JSON objects. Each piece of data you save is associated with a unique identifier (dumpId) and a short description to help you understand its purpose later. When you're finished with the data saving, you have a `dispose` method to clean up any resources that were used.

## Interface IDumpContext

The `IDumpContext` provides essential information for each dump of data generated during a backtest. Think of it as a label that helps organize and understand the data. It includes a `signalId` to identify the specific trade the data relates to, a `bucketName` which groups data from the same strategy or agent, and a unique `dumpId` to distinguish one dump from another. Finally, a `description` field offers a human-readable explanation of what the dump contains, making it easier to search and understand the data's purpose.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, provides the foundational information for events that need to be recorded and processed later, specifically when a trading system is executing trades. Think of it as a way to hold onto details like the trading symbol and whether a backtest is in progress. It ensures that this critical data is available in the right context, even if the immediate processing environment isn’t quite ready. The symbol tells you *what* was traded, and the backtest flag indicates *how* it was executed.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your cached candlestick data is consistent and complete. You’ll provide details like the trading pair (symbol, like "BTCUSDT"), the exchange you're using, the time interval for the candles (like "1m" for one-minute candles), and a start and end date to specify the range you want to check.  It also lets you customize the location where your candle data is stored if it’s not in the default location. This helps ensure the accuracy of your backtesting results by verifying that you have the expected historical data.

## Interface ICandleData

This interface represents a single candlestick, which is a standard way to organize price data over a specific timeframe. Each candlestick contains information about the opening price, the highest price reached, the lowest price reached, the closing price, and the volume traded during that period. The `timestamp` property tells you exactly when that candle's time window began. You'll find this data structure used frequently when calculating things like VWAP (Volume Weighted Average Price) and when building backtests for trading strategies.

## Interface ICacheCandlesParams

This interface defines the data needed to pre-load historical candle data for backtesting. Think of it as a recipe for downloading the past price action of a specific trading pair. It specifies the trading symbol, the exchange where the data comes from, the timeframe of the candles (like 1-minute or 4-hour), and the start and end dates for which you want to download that data. This allows you to have all the necessary historical data ready before your backtest begins, speeding up the process and ensuring consistency.

## Interface IBroker

The `IBroker` interface defines how the backtesting framework interacts with a real brokerage or exchange. Think of it as a bridge connecting the simulation to live trading. It's essential if you want to execute trades in a real-world environment, as the framework will call methods within this interface to place orders.

Importantly, these calls happen *before* the framework’s internal state changes, so any errors during this process won't affect the backtest's recorded data. During backtesting, these calls are ignored – the adapter doesn’t receive any backtest information.

Here's a breakdown of what each method handles:

*   `waitForInit`:  This is called once at the beginning to set up the connection, like loading your API keys or establishing a link to the exchange.
*   `onSignalCloseCommit`: This function is invoked when a trade is closed, whether it's hitting a take-profit, stop-loss, or a manual closeout.
*   `onSignalOpenCommit`: It signals that a new trade has been successfully opened.
*   `onPartialProfitCommit`:  Used when a portion of a trade's profits are taken.
*   `onPartialLossCommit`:  Used when a portion of a trade's losses are realized.
*   `onTrailingStopCommit`:  Handles updates to trailing stop-loss orders.
*   `onTrailingTakeCommit`:  Manages updates to trailing take-profit orders.
*   `onBreakevenCommit`:  Called when a breakeven stop (moving the stop-loss to the entry price) is executed.
*   `onAverageBuyCommit`:  This is for triggering a dollar-cost averaging (DCA) buy order.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to hold simple information about whether a breakeven point has been achieved for a particular trading signal. It’s used primarily for saving and loading breakeven status, allowing your backtesting results to be preserved. Think of it as a compact way to represent the ‘reached’ status of a breakeven target - it's just a true or false value. The framework uses this to efficiently store and retrieve breakeven information.

## Interface IBreakevenCommitRow

This describes a record representing a breakeven event that's been queued for processing. It's essentially a notification that a trade needs to adjust to reach a breakeven point.

The record tells you what action is needed – in this case, it’s a “breakeven” adjustment. It also includes the `currentPrice`, which is the price at the moment the breakeven calculation was made, providing context for the adjustment.


## Interface IBreakeven

This interface helps keep track of when a trade has reached a breakeven point – that's when the price has moved enough to cover any fees and initial costs. It's used in conjunction with trading strategies to automatically adjust stop-loss orders to lock in profits.

The `check` method is used to determine if breakeven has been achieved, considering the current price and transaction costs. It will then notify the trading system, and save the updated state.

The `clear` method resets the breakeven state when a trade is finished, essentially wiping the slate clean for the next potential trade. This ensures accurate tracking and prevents confusion with previously closed positions.

## Interface IBidData

This interface describes a single bid or ask price within an order book. Each bid or ask is represented with two key pieces of information: the price at which the order is placed, and the quantity of assets available at that price. Both the price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step within a strategy that uses a recurring average buy (DCA) approach. It describes a commitment to buy a certain amount of an asset as part of a larger DCA plan. The `action` property identifies this as an average-buy commitment. You'll find the `currentPrice` – the price at which the buy was made – and the `cost` of that particular buy. Finally, `totalEntries` tracks how many average-buy attempts have been made so far within the overall strategy.

## Interface IAggregatedTradeData

IAggregatedTradeData holds all the important details about a single trade. Think of it as a record of a transaction, containing the price at which it happened, how much was traded, and when it occurred. It also tells you whether the buyer or seller initiated the trade, which is useful for understanding market dynamics. Each trade record has a unique ID to identify it precisely.

## Interface IActivateScheduledCommitRow

This interface represents a message that's used to trigger the activation of a scheduled commitment within the backtest-kit framework. Essentially, it's a notification that a previously planned action needs to happen now. The `action` property always confirms it's an activation request. It includes a `signalId` which identifies the specific signal that's being activated, and optionally an `activateId` that can be used to track user-initiated activations.

## Interface IActionStrategy

This interface helps your trading actions make smart decisions by letting them peek at the current state of signals. Think of it as a way for your actions to know if a trade is still open or if a signal is waiting in the wings. 

Specifically, it provides methods to check if there's an active, pending signal or a signal that's scheduled to happen. This is useful for actions like adjusting stop-loss orders or checking for profit-taking opportunities – they can skip unnecessary steps if there’s nothing to act on. The checks account for whether you're in backtest mode and provide information about the strategy, exchange, and timeframe involved.

## Interface IActionSchema

The `IActionSchema` lets you customize how your trading strategies react to events and integrate with other systems. Think of it as a way to hook into your strategy's execution and do things like log data, send notifications, or update external state management tools like Redux.

You define these customizations through an action schema, which includes a unique identifier for the action, a helpful note for developers, and the actual code that will run when an event happens. 

Each action runs within a specific strategy and timeframe, ensuring the context is always clear. You can attach multiple actions to a strategy to create complex and interconnected systems. The action handler is essentially a class that gets created specifically for each strategy run, while callbacks let you precisely control when certain parts of the action are triggered.

## Interface IActionParams

The `IActionParams` interface defines the information passed to your actions within the backtest-kit framework. It essentially packages together everything an action needs to know about its environment.

You'll find logging capabilities through the `logger` property, allowing you to track what your actions are doing and debug any issues.  It also includes details about the specific strategy and timeframe the action belongs to, like `strategyName` and `frameName`. 

Knowing whether you're in a backtest or live trading environment is crucial, and `backtest` flag indicates that. Crucially, the `strategy` property gives you access to current information like signals and positions, so you can make informed decisions within your actions.  Think of it as the complete picture for a single action's execution.


## Interface IActionCallbacks

This interface lets you hook into the lifecycle and key events of your automated trading actions. Think of it as a way to add custom logic around when your trading actions start, finish, or receive signals. You can use these hooks to manage resources like database connections, log events, or even persist your state.

Initialization (`onInit`) runs when an action starts, letting you prepare things like loading data or setting up connections. `onDispose` is called when the action stops, so you can clean up, save data, or unsubscribe from anything you set up earlier.

For signal events, `onSignal` is a general callback that triggers in both live and backtest modes. More specific callbacks—`onSignalLive` for live trading and `onSignalBacktest` for backtesting—allow you to tailor your logic to each environment.

Several other callbacks alert you to specific events, such as breakeven triggers (`onBreakevenAvailable`), partial profit/loss levels (`onPartialProfitAvailable`, `onPartialLossAvailable`), or risk management rejections (`onRiskRejection`).  `onPingScheduled` and `onPingActive` monitor signals waiting for activation or in active position, while `onSignalSync` handles position opening/closing via limit orders. You have special control with `onSignalSync`: rejecting the action with an error allows the framework to retry.

## Interface IAction

This interface, `IAction`, acts as a central hub for managing events within the backtest-kit framework. Think of it as a way to plug in your own custom logic to react to what's happening during a trading simulation or live trade. It provides different methods, each triggered by a specific type of event – like a new trading signal, a breakeven level being reached, or a signal being rejected due to risk constraints. 

You can use this to do things like send signals to a Redux store, log events to a file, update a real-time dashboard, or track performance metrics.  There are dedicated methods for handling signals generated during backtesting, live trading, or scheduled events.  A `signalSync` method allows you to control order execution via limit orders, and the `dispose` method ensures resources are cleaned up when you're done. By implementing this interface, you can tailor the framework to your specific needs and integrate it seamlessly with your own systems.

## Interface HighestProfitStatisticsModel

This model keeps track of the most profitable events in a backtest. 

It holds a list of these profitable events, ordered from most recent to oldest. You'll find the total count of recorded events alongside the individual event details. This is useful for understanding where the biggest gains were generated during a trading simulation.

## Interface HighestProfitEvent

This event represents the point when a trading position reached its highest profit level during a backtest or live trading session. It captures key details like the exact time (timestamp), the trading pair (symbol), the name of the strategy used, and a unique identifier for the signal that triggered the trade.  You'll also find the direction of the trade (long or short), the unrealized profit and loss (PNL) at that peak, and the prices involved – the price when the trade was opened, the take profit level, and the stop loss level.  Finally, it indicates whether this highest profit event happened during a backtest simulation.

## Interface HighestProfitContract

The HighestProfitContract provides information when a trading position reaches a new peak profit. It bundles together key details like the trading symbol, the current price, and the exact time of the profit milestone. You'll also find information about the strategy, exchange, and timeframe involved, along with the data related to the signal that triggered the position. Importantly, it also indicates whether the update comes from a historical backtest or from live trading, so you can react differently depending on the context.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for your portfolio's heatmap, giving you a broad picture of its performance. It breaks down the aggregated data for each symbol you're tracking. 

You'll find a list of individual symbol statistics within the `symbols` array. 

The `totalSymbols` property tells you exactly how many symbols are included in this overall calculation. 

Other key metrics like total portfolio profit/loss (`portfolioTotalPnl`), Sharpe Ratio (`portfolioSharpeRatio`), and total trades (`portfolioTotalTrades`) are also provided.

To understand how well your portfolio performed relative to its risk, you can look at `portfolioAvgPeakPnl` (a higher number is good) and `portfolioAvgFallPnl` (a lower number is better).

## Interface DoneContract

This interface describes the information you receive when a background task, whether it's a backtest or a live trading session, finishes running. It provides details about the completed execution, including the exchange used, the name of the strategy, and whether it was a backtest or live execution. You’ll find the trading symbol, like "BTCUSDT," included so you know exactly what asset was involved in the process. Essentially, it's a notification that something wrapped up and a summary of what it was.

## Interface CriticalErrorNotification

This notification signals a critical error that demands the trading process stops immediately. It’s essentially an emergency alert indicating something went seriously wrong. Each notification has a unique ID, a clear explanation of the error in human-readable terms, and the full error details including its stack trace to help pinpoint the problem. Importantly, these critical error notifications always come from the live trading environment, not a backtest.

## Interface ColumnModel

This defines a blueprint for how to structure and display data in a table. Think of it as a way to tell the system how to pull information from your data, what to call that information in the table header, and how to make it look nice.  Each column has a unique identifier, a display name for the header, and a function to transform the raw data into a readable string.  You can even control whether a column should be shown or hidden based on certain conditions.

## Interface ClosePendingCommitNotification

This notification lets you know when a pending signal is closed before a trade actually happens. It's specifically for situations where a signal gets canceled or shut down before a position is fully activated.

The notification includes a unique ID and timestamp for tracking. You’ll find details about where the signal came from, like the strategy name, exchange, and a unique signal identifier.  It tells you which symbol was involved, whether the event happened during a backtest or live trading, and even a user-defined identifier for the reason the signal was closed.

You also get information about the signal itself, like the total number of entries, partial closes, the original entry price, and important P&L details.  This includes not only the profit/loss amount, percentage, and effective prices used in the calculation, but also the overall invested capital and when the notification was created.

## Interface ClosePendingCommit

This signal event signifies the completion of a previously initiated action, specifically related to closing a pending order. It's used to communicate that a planned order execution has been finalized. 

You'll find a unique identifier, `closeId`, associated with this event, allowing you to track the reason or context behind the closure – it's there for your own record-keeping. 

Finally, the `pnl` property provides a snapshot of the profit and loss at the precise moment the pending order was closed, giving you insight into the outcome of that particular trade.

## Interface CancelScheduledCommitNotification

This notification tells you when a previously scheduled trading signal has been cancelled before it was actually executed. It’s useful for understanding why a signal didn't go through, especially in automated systems.

Each notification includes a unique identifier (`id`) and a timestamp (`timestamp`) to track cancellations. You’ll also find details like whether the cancellation occurred during backtesting (`backtest`) or live trading, the trading pair involved (`symbol`), and the name of the strategy (`strategyName`) that generated the signal.

The notification provides important context like the original entry price (`originalPriceOpen`), the number of entries and partial closes involved (`totalEntries`, `totalPartials`), and a breakdown of the potential profit and loss (`pnl`, `pnlPercentage`, `pnlPriceOpen`, `pnlPriceClose`, `pnlCost`, `pnlEntries`).  A user can also provide a reason for the cancellation using the `cancelId` field. Finally, the notification includes the creation timestamp (`createdAt`) for comprehensive auditing.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event, providing a way to retract a planned action. When you cancel, you can optionally include a `cancelId` to help you track why the cancellation happened – this is just a descriptive label you provide. You'll also include the unrealized profit and loss (`pnl`) information that was relevant to the canceled event, giving you context for the decision. Essentially, it's a way to undo a signal and record the state at the time it was scheduled.

## Interface BreakevenStatisticsModel

This model holds the information about breakeven events encountered during a trading simulation. It gives you a breakdown of when and how often breakeven points were reached. You'll find a list of all the individual breakeven events, each with its own details, alongside the total count of these events. Essentially, it helps you understand the frequency and nature of breakeven occurrences in your backtesting results.

## Interface BreakevenEvent

This data structure holds all the important details when a trading signal reaches its breakeven point. Think of it as a snapshot of the situation at that moment, perfect for generating reports and analyzing performance. It includes things like the exact time, the trading pair involved, the name of the strategy used, and a unique ID for the signal. 

You'll also find key price data such as the current market price, the original entry price, take profit and stop loss levels, and even the original values set when the signal was first created. If the strategy used dollar-cost averaging (DCA), this event will also record information about those averaging entries and partial exits.  Furthermore, it captures the profit and loss (PNL) at the breakeven point, a description of why the signal was triggered, and timestamps for when the position became active and when the signal was scheduled. A flag indicates whether this event occurred during a backtest or live trading.

## Interface BreakevenContract

This describes a special event that happens when a trading signal's stop-loss is adjusted to the original entry price, a point where the trade has essentially recovered its initial risk. Think of it as a milestone indicating a reduction in risk for the trade.

It’s designed to help keep track of how a strategy is managing risk and can be used to generate reports.

Here's what the event tells you:

*   **symbol:** Which cryptocurrency pair is involved (like BTCUSDT).
*   **strategyName:**  The name of the trading strategy that created the signal.
*   **exchangeName:** The exchange where the trade is taking place.
*   **frameName:** A label related to the timeframe used (not applicable in live trading).
*   **data:** All the original details of the trading signal, including the original stop-loss and take-profit prices.
*   **currentPrice:** The price at which breakeven was achieved.
*   **backtest:** Whether the event occurred during a backtest (historical data) or live trading.
*   **timestamp:**  The exact time the event occurred – either the moment of the breakeven in live trading or the timestamp of the candle that triggered it in a backtest.

This event only happens once for each signal, so you don’t have to worry about it being repeated.

## Interface BreakevenCommitNotification

This notification signals that a breakeven action has been executed within your trading strategy. It provides detailed information about the trade that triggered this event. Think of it as a confirmation that the strategy has reached a point where it's adjusting the trade to cover initial costs.

The notification includes a unique ID and timestamp for tracking, along with details like whether the action occurred during backtesting or live trading, the trading symbol, and the strategy’s name. You’ll find specifics about the trade itself, such as the entry price, take profit, stop loss, and how they may have been adjusted. It also provides a breakdown of the trade's performance, including profit/loss metrics in both absolute and percentage terms, and information about the DCA (Dollar Cost Averaging) entries involved. You’ll also see timestamps related to when the signal was created and when the position became active.

## Interface BreakevenCommit

The `BreakevenCommit` represents a specific event within the trading system – when a breakeven adjustment is triggered. This occurs when the system decides to adjust the take profit and stop-loss prices to lock in some profit and protect against further losses.

It provides details about the event itself, including the fact that it's a "breakeven" action.

You'll find the current market price at the time the adjustment was made, along with the unrealized profit and loss (PNL) of the position.

The `BreakevenCommit` also specifies whether the position is a long (buy) or short (sell) trade and includes the original entry price. Crucially, it outlines the adjusted take profit and stop-loss prices, as well as the original take profit and stop-loss levels before any trailing adjustments were applied.

Finally, timestamps related to the signal generation and position activation offer a timeline of the event.

## Interface BreakevenAvailableNotification

This notification signals that your trading strategy's stop-loss has reached a point where it can be moved to your initial entry price, essentially breaking even on the trade. It provides a wealth of information about the trade that triggered this event, including a unique identifier for the notification and the signal that generated it.

You'll find details about the trade itself, like the trading pair, the strategy and exchange used, the direction of the position (long or short), and the current market price. It also gives you access to the original and adjusted take profit and stop-loss prices, along with information about any averaging (DCA) or partial closing strategies employed.

Beyond just the price points, the notification includes comprehensive Profit and Loss (P&L) data, showing your unrealized P&L, profit/loss percentage, and the capital invested. Timestamps for the signal’s creation, pending status, and the notification's creation are also available, offering a full timeline of the trade's lifecycle. This comprehensive data helps you understand the context and performance of the trade that reached breakeven.

## Interface BacktestStatisticsModel

The BacktestStatisticsModel provides a detailed breakdown of your trading strategy's performance after a backtest. It gathers data from every closed trade, giving you a complete picture of how well your strategy is doing.

You'll find information like the total number of trades, how many were winners versus losers, and the overall profit or loss generated.

Key metrics like win rate, average profit per trade, and total profit are included, all expressed as percentages. It also incorporates volatility measurements (standard deviation, Sharpe Ratio, and annualized Sharpe Ratio), helping you understand the risk involved. Finally, other metrics like certainty ratio, expected yearly returns, and drawdown information (peak and fall PNL) provide additional insight into strategy behavior. Importantly, if a calculation results in an unstable value (like division by zero), that statistic will show as null.

## Interface AverageBuyCommitNotification

This notification is triggered when a new purchase is made as part of a dollar-cost averaging (DCA) strategy on an existing position. It provides detailed information about that specific averaging purchase, including a unique identifier and timestamp. 

The notification reveals specifics like the trading symbol, the strategy and exchange involved, and a unique signal ID. You'll find the price at which the averaging purchase occurred, along with the cost in USD. 

It also shows how the averaged entry price changes with each additional purchase, along with the total number of averaging entries made so far. Furthermore, the notification contains details related to potential take profit and stop loss orders, original prices, and the current profit and loss figures, providing a comprehensive view of the DCA process. You can also see when the signal was originally scheduled and when the position became pending.

## Interface AverageBuyCommit

This event, `AverageBuyCommit`, signals a new average-buy (DCA) action has occurred within a trading strategy. It’s triggered when a new averaging entry is added to an existing position.

The event provides details about the averaging action, including the price at which the new entry was executed (`currentPrice`), the cost of that entry in USD (`cost`), and how the averaging affects the overall position.

You'll find the current effective entry price (`effectivePriceOpen`), which represents the averaged price of all entries so far.  The event also gives you the unrealized profit and loss (`pnl`) at the moment of the average-buy.

Other important information includes the trade direction (`position`), the original entry price (`priceOpen`), and the updated take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`).

Finally, the timestamps (`scheduledAt`, `pendingAt`) offer insight into when the signal was created and when the position became active.

## Interface ActivePingContract

This defines a way for your trading strategies to receive updates about active pending signals. Think of it as a heartbeat signal confirming that a pending order is still open and being watched. 

You'll get these "active ping" events roughly every minute while a pending signal remains active.  Each ping includes details like the trading pair ("BTCUSDT"), the name of the strategy involved, the exchange being used, and all the original signal data.

Crucially, there's also the current market price at the time of the ping, which is valuable for building custom logic—for example, automatically closing a pending signal if the price moves significantly. You can tell if the event originates from a backtest run or live trading, and the timestamp will represent when the ping occurred, either a real-time event or the time of the historical candle.

You can subscribe to these events using `listenActivePing()` or `listenActivePingOnce()`.

## Interface ActivateScheduledCommitNotification

This notification tells you when a scheduled trading signal has been activated, meaning the system is now taking action based on it. It's triggered when a user manually confirms a signal, bypassing the usual price check.

The notification provides a wealth of information about the trade, including a unique ID, the exact time of activation, and whether it’s happening in a backtest or live trading environment. You'll find details about the trading pair, the strategy used, and the exchange involved.

It also outlines the specifics of the trade itself: the direction (long or short), entry price, take profit and stop loss levels (both original and adjusted), and how any averaging or partial closing has affected the pricing.

Crucially, the notification includes the P&L data at the time of activation. You'll see the total investment, profit/loss in both absolute and percentage terms, and how prices were adjusted for fees. Finally, the notification details when the signal was initially scheduled and when it went pending.

## Interface ActivateScheduledCommit

This interface describes the data needed to activate a previously scheduled trading signal. Think of it as the framework confirming and executing a plan that was already set up. 

It includes details like the activation reason (identified by `activateId`), the current market price, and the profit and loss (PNL) at the time of activation.

You'll also find information about the trade direction (long or short), entry price, and the initially set take profit and stop-loss prices, alongside their values before any adjustments. 

Finally, the data specifies when the signal was originally created (`scheduledAt`) and when the position will actually be active (`pendingAt`). This allows for tracking and verifying the timing of scheduled trades.
