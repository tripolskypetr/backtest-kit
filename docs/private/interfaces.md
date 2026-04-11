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

The WalkerStopContract is a notification you receive when a walker, which is essentially a running trading process, is being stopped. Think of it like a signal that something’s being paused. 

It's particularly useful when you have multiple trading strategies active at the same time, as it tells you specifically which strategy and walker is being halted. 

The contract provides details about the symbol being traded (like BTCUSDT), the name of the strategy being stopped, and the unique name of the walker itself. This allows you to easily identify and react to these stop events within your system.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of your backtesting simulations. It’s essentially a collection of data from different trading strategies you've tested. 

Think of it as a way to compare how different strategies performed against each other.

Specifically, it bundles together all the individual results – each representing a single strategy's performance – into one convenient place so you can easily analyze and draw conclusions. It builds upon existing results, adding extra information for comparing strategies.


## Interface WalkerContract

The `WalkerContract` represents updates you receive as a trading strategy backtest progresses. Think of it as a notification that a particular strategy has finished being tested. 

Each time a strategy completes its backtest, this contract provides a snapshot of what happened.

It gives you details like the strategy's name, the asset it was tested on, and the exchange and timeframe used. 

You’ll see performance metrics, like the key statistic being optimized and its value, along with the best-performing strategy seen so far.

Finally, it tells you how far along the backtest process is – how many strategies have been tested out of the total planned. This allows you to monitor the progress of the entire backtest run.

## Interface WalkerCompleteContract

This interface represents the culmination of a backtesting process, signaling that all strategies have been run and the complete results are ready. It bundles together key information about the backtest, including the name of the walker that performed the tests, the trading symbol being analyzed, and the exchange and timeframe used.

You'll find details on the optimization metric and the total number of strategies that were evaluated. Crucially, it identifies the top-performing strategy, along with its metric score and detailed statistics. This lets you quickly understand the overall outcome and best performer of the backtesting run.

## Interface ValidationErrorNotification

This notification tells you when a validation check fails during your trading strategy's setup. It's a signal that something went wrong with how you're defining the rules or conditions for your trades.

Each notification has a unique ID to help track down the specific issue. It includes a detailed error message that should explain what went wrong, along with technical details like a stack trace. 

The `backtest` flag will always be false because these validation errors happen during the setup phase, *before* any actual trading takes place. It’s essentially a heads-up that you need to review your validation rules.


## Interface ValidateArgs

This interface, ValidateArgs, serves as a blueprint for ensuring the data you're using is correct and consistent within the backtest-kit system. Think of it as a way to double-check your names and labels.

Each property within ValidateArgs represents a key component like the exchange you're using, the timeframe you're analyzing, or the strategy you've implemented. 

For each of these components, you provide an enum – a controlled list of allowed values – and the system verifies that whatever you’re using actually exists within that list. This helps prevent errors and ensures everything aligns with the defined framework.

Essentially, it's a way to maintain order and accuracy across your backtesting and trading setups.


## Interface TrailingTakeCommitNotification

This notification is triggered when a trailing take profit order is executed, providing detailed information about the trade. It includes a unique identifier, a timestamp, and flags indicating whether the trade happened in backtest or live mode.

You'll find key details like the trading symbol, the strategy that generated the signal, and the exchange used. The notification also contains specifics about the trade itself, like the signal ID, the percentage shift applied to the original take profit, the current market price at execution, and the position direction (long or short).

Comprehensive price information is included, like the entry price, take profit price after trailing adjustment, stop-loss prices, and original prices before any trailing adjustments. Information related to DCA (Dollar Cost Averaging) is present too, showing the number of entries and partial closes. 

Profit and loss data, including percentage, absolute value, and price points used in the calculation, are available, alongside optional notes explaining the signal's reasoning and various timestamps associated with signal creation and order execution.

## Interface TrailingTakeCommit

This describes a "trailing take" event, which happens when a trading strategy using a trailing stop-loss or take-profit hits a predefined price level. The `action` property simply confirms that this is a trailing take event.

The `percentShift` defines how much the take-profit price moves as the market price changes, this is the core of trailing logic. You’ll find the `currentPrice` which represents the price at which the adjustment occurred.

The event also includes information about the current profit and loss (`pnl`), whether the trade is long or short (`position`), and the original entry price (`priceOpen`). Critically, it shows the `priceTakeProfit` - the take-profit price *after* the trailing adjustment - along with the current `priceStopLoss`. You also have access to the `originalPriceTakeProfit` and `originalPriceStopLoss` – the values set initially.

Finally, `scheduledAt` tells you when the signal was created, and `pendingAt` indicates when the position was actually activated.

## Interface TrailingStopCommitNotification

This notification details when a trailing stop order is triggered, providing a wealth of information about the trade that just occurred. It's a record of a trailing stop action, helping you understand exactly what happened and why.

The notification includes a unique ID and timestamp to precisely identify the event, alongside indicators of whether it happened during a backtest or live trading. You’ll find the symbol being traded, the strategy that generated the signal, and the exchange where the action took place. 

A lot of important pricing data is included, such as the original entry price, take profit and stop loss prices – both before and after any trailing adjustments. It also breaks down details like the number of DCA entries and partial closes.  The profit and loss (PNL) information, expressed in both absolute and percentage terms, gives you a clear picture of the trade's financial performance, along with the prices used for the calculation. 

Finally, it includes additional context like a note explaining the reasoning behind the signal, plus timestamps marking when the signal was created and when the position went pending. This complete set of information is designed to provide a full audit trail and deep insight into the trading process.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop mechanism adjusts a trade. 

The `action` property simply identifies this event as a trailing-stop adjustment. 

It includes details about the adjustment itself, like `percentShift`, which determines how the stop loss moves.

You'll also find the current market price (`currentPrice`) and the unrealized profit and loss (`pnl`) at the moment of the adjustment. 

Other key pieces of information include the trade direction (`position`), the original entry price (`priceOpen`), and the updated take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`). 

Finally, timestamps (`scheduledAt`, `pendingAt`) provide information about when the signal was created and when the position was activated.

## Interface TickEvent

This interface defines a standard way to represent tick events within the backtest kit, ensuring all necessary data is consistently available regardless of the event's type. It's like a universal template for recording what happens during a trade.

You'll find details like the exact time of the event (`timestamp`), what action triggered it (`action`), and specifics about the trade itself, such as the symbol (`symbol`), signal ID (`signalId`), position type (`position`), and any associated notes (`note`). 

For active positions, it also tracks important metrics such as take profit and stop loss prices, as well as tracking modifications made to those values.  Details about DCA averaging (using `totalEntries` and `totalPartials`) and partial closes (`partialExecuted`) are also provided.

Finally, for completed or cancelled trades, you get key performance information like realized profit/loss (`pnlCost`, `pnl`), duration (`duration`), and reasons for closure or cancellation (`closeReason`, `cancelReason`). The inclusion of `peakPnl` and `fallPnl` provide insight into performance extremes for closed positions.

## Interface SyncStatisticsModel

The SyncStatisticsModel helps you understand how your trading signals are syncing up. It gives you a breakdown of the events involved in that process, showing you how many signals were opened and closed. You'll find a complete list of each sync event, along with the total count of all events, allowing you to monitor the overall synchronization lifecycle of your signals. It's a great tool for troubleshooting and understanding the flow of information within your backtesting system.

## Interface SyncEvent

This data structure helps track what's happening during a trading strategy's lifecycle, especially useful for creating reports. It collects all the key details about events, like when they occurred and what action was taken.

You’ll find information like the exact timestamp, the trading symbol, the strategy's name, and where the trade took place (exchange).

For each event, you’ll also see details about the signal itself – its unique ID, the direction of the trade (long or short), and the prices involved – entry price, take profit, and stop loss, both original and adjusted.

It also tracks timing aspects like when the signal was created and when the position started.

If the trade involves DCA (Dollar Cost Averaging), the total number of entries and partial closures are recorded. You'll also see the profit and loss (PNL) at the time of the event. If a position is closed, the reason for the closure is explained. Finally, it indicates whether the event originates from a backtest simulation.

## Interface StrategyStatisticsModel

This model holds all the data that describes how your trading strategy performed during a backtest. It breaks down the strategy's actions into categories, giving you a detailed picture of its behavior.

You’ll find a complete list of events, along with the total number of events that occurred. It also provides counts for specific action types, like cancels, closes, partial profits/losses, trailing stops, breakevens, and activations. Finally, it includes a count for average buy (dollar-cost averaging) events. Essentially, it’s a comprehensive breakdown of your strategy's activity.

## Interface StrategyEvent

This data structure holds all the important information about actions taken by your trading strategy, whether it's a backtest or live trading. It provides a record of everything that happens, from initial signals to closing positions, making it ideal for generating detailed reports.

Each event includes details like the timestamp, the trading pair, the strategy's name, and the exchange being used. You'll also find information about the signal that triggered the action, including its ID and the type of action taken (like buying, selling, or adjusting a stop-loss).

For actions involving closing positions, you'll find IDs related to pending or scheduled closures. It also tracks whether the action occurred during a backtest or live session.

The structure gives you specifics about the position itself, like whether it’s a long or short trade, the entry price, and the take profit and stop-loss levels – both their effective values (after trailing adjustments) and their original values.  For strategies using dollar-cost averaging (DCA), you’ll find details on entries, partial closes, and the effective average price. Finally, profit and loss (PNL) data is included.

## Interface SignalSyncOpenNotification

This notification lets you know when a previously scheduled order (like a limit order) is triggered and a trading position is opened. It provides a detailed snapshot of what happened, including a unique identifier for the notification itself.

You’ll find information about when the signal was opened, whether it happened during a backtest or live trading, and the specific trading pair involved. The notification also specifies which strategy generated the signal and on which exchange it was executed.

It contains vital data like the signal's unique ID, the current market price when the order filled, and the initial Profit and Loss (PNL) information, including entry and exit prices and total investment. Further details pinpoint the trade direction (long or short), the entry price, take profit and stop-loss levels, and information on any DCA averaging or partial closures. The notification includes the original prices before any adjustments and gives the signal creation and activation timestamps, plus an optional note explaining the signal’s reasoning.

## Interface SignalSyncCloseNotification

This notification lets you know when a pending trading signal has been closed, whether it was due to hitting a take profit or stop loss, timing out, or a manual closure. It provides a comprehensive set of details about the closed signal, including a unique identifier, the time it was closed, and whether it occurred during a backtest or live trading.

You'll find information about the trading pair, the strategy that generated the signal, and the exchange used. Crucially, it includes the closing price, the profit and loss (both absolute and percentage), and the entry and exit prices used in the PNL calculation. 

The notification also describes the trade direction (long or short), the original and adjusted take profit and stop-loss prices, and details regarding any DCA averaging or partial closes. You can also see the timestamps related to the signal’s creation and activation, and a reason why the signal was closed along with any optional notes. Finally, a timestamp indicates when the notification itself was generated.

## Interface SignalSyncBase

This interface defines the common information found in all signal synchronization events within the backtest-kit framework. Each signal event, whether generated during backtesting or live trading, includes details like the trading pair's symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange used. You’ll also find information about the timeframe used (relevant for backtesting) and whether the signal originated from a backtest or live trading scenario. A unique identifier, timestamp, and the full details of the signal itself are also included, allowing for easy tracking and analysis of signal behavior.

## Interface SignalScheduledNotification

This notification type signals that a trade has been planned for execution at a future time. It provides comprehensive details about the upcoming trade, allowing you to track and understand the reasoning behind scheduled actions.

Each notification includes a unique identifier, along with the exact time the signal was scheduled. You'll find information about whether this signal originates from a backtest simulation or a live trading environment. 

The notification details the symbol being traded, the strategy that generated the signal, and the exchange where it will be executed. Key trade parameters like position (long or short), entry price, take profit, and stop loss are clearly specified, along with their original values before any trailing adjustments.

For signals involving dollar-cost averaging (DCA), the notification includes the total number of entries and partial closes planned. You'll also get details on the trade's cost, projected profit and loss (both absolute and percentage), and entry and exit prices used for PNL calculations. Finally, a note field allows for adding custom explanations or context to the signal.

## Interface SignalOpenedNotification

This notification lets you know when a new trade has been opened. It provides a wealth of information about the trade, including a unique identifier and the exact time it happened. You'll find details about which strategy initiated the trade, the symbol being traded (like BTCUSDT), and whether it's a long (buy) or short (sell) position. 

The notification also breaks down the trade's parameters – the entry price, take profit, and stop loss levels, along with their original values before any adjustments. It includes details on any dollar-cost averaging (DCA) involved, tracking the number of entries and partial closes.

Beyond just the basic trade details, you get performance information too, like the profit and loss (both absolute and percentage), entry and exit prices used for P&L calculation, and the total capital invested. There's even a field for a note, which can provide extra context or reasoning behind the trade. Timestamps mark significant events, from signal creation and pending time to the time the notification was generated. This comprehensive data allows for thorough analysis and auditing of trading activity.

## Interface SignalOpenContract

This event lets you know when a scheduled trade signal has actually been filled by the exchange. It's essentially confirmation that your limit order (to buy or sell) has been executed.

Think of it as a notification sent when the exchange says, "Okay, we've bought/sold at the price you requested."

The event provides a lot of important details, including the actual entry price, the current market price, and any take profit or stop loss levels that were in place. You'll also find information about any cost averaging or partial closes that might have occurred.

This is particularly useful for systems that need to keep track of order execution externally, like order management platforms or audit logging systems. The timestamp information clarifies when the signal was initially created and when the position was officially activated.


## Interface SignalData$1

This structure holds the details of a completed trading signal, perfect for analyzing performance. It tells you which strategy created the signal, its unique ID, and the asset being traded. 

You'll find the position taken (long or short), the profit or loss expressed as a percentage, and a description of why the signal was closed. 

Finally, the structure records the exact times the signal opened and closed, giving you a complete timeline for each trade.

## Interface SignalCommitBase

This defines the common data you'll find in events related to signals, like when a trade is triggered. Each signal commit includes details such as the trading pair symbol (like BTCUSDT), the name of the strategy that generated the signal, and the exchange it's happening on.

You’ll also see information about whether the signal came from a backtest or live trading, a unique ID for the signal, and the exact time it occurred.

The data includes counts for the number of entries made (useful for understanding DCA strategies) and partial closes executed. You can also find the original entry price and an optional note providing context for the signal.

## Interface SignalClosedNotification

This notification tells you when a trading position, triggered by a signal, has been closed, whether it's from a backtest or a live trade. It provides a wealth of details about the trade's lifecycle, from its initial creation to its eventual closure. You'll find information like the unique identifiers for the signal and position, when it was opened and closed, and the prices involved – both the original entry price and any take profit or stop loss levels.

It also gives you a clear picture of the trade's financial performance, including profit/loss as a percentage and in absolute dollars, along with the capital invested. Crucially, it specifies *why* the position closed – was it a take profit, a stop loss, or something else? 

The notification also includes timestamps for various events: when the signal was created, when the position started pending, and when the trade ultimately closed. Knowing the duration of the trade and a potentially added description or reason for closure can be very helpful in analyzing trading strategy effectiveness. You'll find information related to averaging via DCA and partial closes as well.

## Interface SignalCloseContract

This event notifies you when a pending signal is closed, whether it's because of a take profit or stop loss being triggered, time expiration, or manual closure. It's designed to help external systems stay in sync with your trading activity.

The event provides detailed information about the closure, including the current market price, the total profit and loss (PNL) of the position, the trade direction (long or short), and the effective entry, take profit, and stop-loss prices. You’ll also find the original prices before any adjustments like trailing or averaging.

Furthermore, the event specifies when the signal was initially created and when the position was activated, along with the reason for closure. You can even see how many DCA entries and partial closes were involved in the position. This level of detail is useful for auditing, logging, or managing external order systems.

## Interface SignalCancelledNotification

This describes a notification that's triggered when a scheduled trading signal is cancelled before it's actually executed. It provides a lot of detailed information about why and how the signal was cancelled. 

You'll find a unique ID for the cancellation, along with the timestamp of when it happened. It indicates whether the cancellation occurred during a backtest or in a live trading environment.

The notification also includes details like the trading pair (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange where the signal was scheduled. If the signal involved a trade, you'll see information about the intended position (long or short), stop-loss, take-profit levels, and prices, as well as how they may have been adjusted.

Additionally, there's information about any DCA averaging that may have been involved, partial closes, and the reason for the cancellation – whether it was due to a timeout, price rejection, or a user action. Other helpful details include the time the signal was originally scheduled, when it went pending, and an optional note for human understanding.

## Interface Signal

The `Signal` object represents a single trading signal generated by your strategy. It holds essential details about a potential trade.

Each signal knows its opening price (`priceOpen`), marking the point where the position was initiated. 

It also tracks entries – a record of the price, cost, and timestamp for each position opened within that signal.

Finally, the signal keeps track of any partial exits that occurred, including the type (profit or loss), percentage gain/loss, closing price, cost basis at the time of the exit, and the number of positions closed. This information helps in analyzing the performance of the signal over time.


## Interface Signal$2

The `Signal` object in backtest-kit helps you keep track of a trading position's details as it's being managed. 

It stores the initial `priceOpen` – the price at which you first entered the trade.

To see how the position has evolved, you'll find lists of events. `_entry` records each time you added to the position, noting the price, cost, and when it happened.  `_partial` records any partial exits you've made, tracking details like the reason for the exit (profit or loss), the percentage of the position closed, and prices and costs at the time.

## Interface Signal$1

This `Signal` object holds key information about a trading signal.

It tracks the original entry price for the position through the `priceOpen` property.

You’ll also find a history of entries, including price, cost, and timestamp, stored within the `_entry` array.

Finally, the `_partial` array records any partial exits, noting if they were profit or loss, percentage, current price, cost basis at the time, entry count, and a timestamp.

## Interface ScheduledEvent

This data structure holds all the details about trading events – when they were scheduled, opened, or canceled. It combines information needed to create comprehensive reports about your backtesting results.

Each event includes a timestamp, the type of action taken (opened, scheduled, or canceled), the trading pair involved, and a unique signal ID. You'll also find details specific to the trade, such as the position type, a note, the current market price, and the intended take profit and stop loss prices.

For signals that underwent modifications, the original take profit and stop loss prices are also recorded. If a DCA strategy was used, the number of entries and the original entry price before averaging are present. The amount of partial closes and the percentage of completed partials are available too.

If the trade was canceled, you’ll see cancellation reasons like timeout, price rejection, or user action, along with a cancellation ID for user-initiated cancellations. Timestamps for when the position went active and when the signal was initially created are also included, along with duration if applicable. Finally, a snapshot of the unrealized profit and loss (PNL) is included.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` gives you a clear picture of how your scheduled signals are performing. It bundles together important metrics so you can easily understand how many signals you've scheduled, activated, and cancelled. 

You can see a complete list of all scheduled events, including all the details of each one.

The model also calculates key performance indicators like the cancellation rate (how often signals are cancelled), activation rate (how often signals are activated), and average wait times for both cancellations and activations. This helps you identify potential areas for improvement in your scheduling strategies.

## Interface SchedulePingContract

The `SchedulePingContract` helps you keep an eye on signals that are being actively monitored as part of a schedule. Think of it as regular check-ins while a signal is running, but *before* it's either activated or cancelled.

These events happen roughly every minute and provide a wealth of information.

You'll find details like the trading symbol (e.g., BTCUSDT), the strategy in use, and the exchange where the signal is being monitored.  Importantly, the ping includes all the original signal data, including details like open price, take profit, and stop loss levels.

There’s also a `currentPrice` value that's useful for custom monitoring - for example, you could automatically cancel a signal if the price drifts too much. Finally, a flag indicates whether this ping is from a backtest (historical data) or live trading. The `timestamp` of the ping reflects either the live time or the candle time during backtesting.


## Interface RiskStatisticsModel

This model holds data about risk events, specifically focusing on rejections. It’s designed to help you understand and track how often your risk management systems are intervening.

The `eventList` provides a detailed record of each rejection, giving you all the information associated with that specific event.

`totalRejections` simply tells you the overall number of times a rejection occurred.

To break things down further, `bySymbol` shows how many rejections happened for each trading symbol, while `byStrategy` indicates the number of rejections associated with different trading strategies. This allows you to pinpoint areas needing more scrutiny or adjustment.


## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It's a way for the system to tell you why a trade didn't happen. Each notification has a unique ID and timestamp, so you can track them.

The notification specifies whether it’s from a backtest (simulated trading) or a live trading environment, along with the symbol being traded, the strategy that tried to execute the trade, and the exchange involved. A clear explanation of *why* the trade was rejected is included in the `rejectionNote` field.

You’ll also find details about your current trading positions, including how many are active and the current market price, plus potentially information about the intended trade itself - like the direction (long or short), price targets, and a description of the original signal. The signal's ID, and the entry price are available too.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked because it violated a risk rule. Think of it as a record of a signal that couldn't be executed.

It includes details like when the event occurred, which trading pair was involved, and the specifics of the rejected signal.

You'll also find the name of the strategy and exchange responsible, along with the timeframe used, the current price, and how many positions were already open. A unique ID and explanation of why the signal was rejected are also provided. Finally, it notes whether the event occurred during a backtest or live trading.

## Interface RiskContract

The RiskContract represents a signal that was blocked due to a risk check. It's designed to help you understand when and why your trading strategies are being held back by risk controls. 

Think of it as a notification whenever a trading signal is rejected because it wouldn't be safe to execute.

Here's what's included in the information provided:

*   **symbol:** The market that the signal was intended for (like BTCUSDT).
*   **currentSignal:** All the details about the trading signal itself—what position size, price levels, etc.
*   **strategyName:** The name of the trading strategy that tried to execute the signal.
*   **frameName:** The time frame used for the backtest or live trading.
*   **exchangeName:** The exchange involved.
*   **currentPrice:** The price of the asset at the moment the rejection happened.
*   **activePositionCount:**  How many positions were already open in your portfolio.
*   **rejectionId:** A unique identifier to track specific rejections, useful for debugging.
*   **rejectionNote:**  A human-readable explanation of why the signal was rejected.
*   **timestamp:** The exact time the rejection occurred.
*   **backtest:**  Indicates if this event came from a backtest or live trading.

This contract is used by services that generate reports and by anyone who wants to receive direct notifications about risk rejections.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` lets you keep tabs on how a background process within the backtest-kit framework is going. It's like a status report, giving you key details during a run.

You’ll see the name of the walker, the exchange, and the frame being used. It also tells you the symbol being traded, like BTCUSDT.

Crucially, you'll find out the total number of strategies the process needs to handle, and how many have been completed already.  Finally, a percentage value (from 0 to 100) shows you overall progress. This helps you understand how long the process might take and if anything is potentially stuck.

## Interface ProgressBacktestContract

This contract lets you monitor the progress of a backtest as it runs. It provides key details about the backtest, like the exchange and strategy being used, and the specific trading symbol it’s analyzing. You'll see information about how many total historical data points (frames) the backtest needs to process and how many it has already finished. A percentage value also indicates how far along the backtest is, making it easy to understand how close you are to completion.

## Interface PerformanceStatisticsModel

This model holds the overall performance data for a specific trading strategy. It breaks down how a strategy performed, providing key information like the strategy's name and the total number of events processed.

You'll find the total execution time, which is the combined time taken for all the metrics calculated by the strategy. 

The `metricStats` property organizes statistics by the type of metric being tracked, giving you a detailed view of performance across different areas.

Finally, the `events` array contains a complete list of all the raw performance events that were recorded, allowing for granular analysis.


## Interface PerformanceContract

The PerformanceContract helps you keep an eye on how your trading strategies and system are performing. It's like a little report card that gets updated as things happen. Each entry in this report card records details like when something happened, what kind of operation it was (like placing an order or calculating something), how long it took, and which strategy, exchange, or trading symbol it relates to. If you're running a backtest, this data is invaluable for spotting slowdowns or inefficiencies in your code. It also tells you whether a metric originates from a backtest or from live trading.

## Interface PartialStatisticsModel

This model keeps track of statistics related to partial profits and losses during a trading backtest. It essentially provides a snapshot of how often your trading strategy experienced profits and losses when dealing with partial positions.

The `eventList` holds all the individual profit and loss events, giving you detailed information about each one. 

You'll also find `totalEvents`, the total count of all events, `totalProfit`, the count of profitable events, and `totalLoss`, the count of losing events. These numbers allow you to quickly assess the overall performance of your partial profit/loss milestones.

## Interface PartialProfitContract

This describes events triggered when a trading strategy hits specific profit milestones during execution – like 10%, 20%, or 30% profit. Think of it as a notification saying, "Hey, the strategy just made 20% profit on this Bitcoin trade!"

Each event includes key details to help you understand what's happening, such as the trading pair (e.g., BTCUSDT), the name of the strategy being used, and the exchange where the trade is taking place. It also provides the price at which the profit level was achieved, the level of profit attained, and whether this event originated from a backtest (historical data) or live trading. The data section includes all the original information related to the signal, and a timestamp provides a precise record of when the event occurred. These notifications can be used to track strategy performance and monitor how partial profit targets are being met.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken during a trade. It’s a detailed record of what happened, including a unique ID and the exact time it occurred. Whether it’s happening in a backtest (simulated) or live trading environment is also indicated.

The notification identifies the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange used. You'll find key pricing information like the entry price, take profit price, stop-loss price, and the current price at the time of the partial close. It also specifies whether the trade is a long (buy) or short (sell) position.

Crucially, it includes information about DCA (Dollar Cost Averaging) if it was used – how many entries were made, and how many partial closes have been executed. It provides a comprehensive picture of the trade’s performance, including profit and loss figures in both absolute and percentage terms. There’s also a field for an optional note, which can provide further context or explanation for the signal. Finally, it provides timestamps for when the signal was created, scheduled, and went pending.

## Interface PartialProfitCommit

This describes a partial profit taking action within the backtest. It signifies that a portion of your trading position is being closed to secure some gains.

The `action` property simply confirms this is a partial profit event.

`percentToClose` tells you what percentage of the total position size is being closed.

You'll also find details about the trade itself, including the `currentPrice` at the time of the action, the direction of the trade (`position`), and the original entry price (`priceOpen`).

The `priceTakeProfit` and `priceStopLoss` properties reflect the actual prices used for take profit and stop loss, which might have been adjusted if you were using trailing stop techniques. You can see the original values too, via `originalPriceTakeProfit` and `originalPriceStopLoss`.

Finally, timestamps (`scheduledAt` and `pendingAt`) indicate when the signal to take profit was generated and when the position initially started. This helps you understand the timing of events during the backtest.

## Interface PartialProfitAvailableNotification

This notification alerts you when a trading strategy has reached a specific profit milestone, like 10%, 20%, or 30% gain. It's a signal that things are progressing well with a trade.

The notification provides a lot of details about the trade, including a unique identifier, the exact time the milestone was reached, and whether it's happening during a backtest or live trading. You'll see information like the trading pair involved (e.g., BTCUSDT), the name of the strategy, and the exchange being used.

It also gives you key price points: the entry price, the current market price at the time of the milestone, and the originally set take profit and stop loss levels (before any adjustments from trailing). You can also see details about any dollar-cost averaging (DCA) strategies used, the overall profit/loss figures in both USD and percentage terms, and even a note explaining the reason behind the signal.  Finally, it includes timestamps to track the signal's journey from creation to execution.

## Interface PartialLossContract

The PartialLossContract represents notifications about a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. It's a way to keep track of how much a strategy is losing and when those loss milestones are reached.

These notifications, or events, happen only once for each loss level and a given signal, ensuring you're not overwhelmed with redundant information. When the price drops sharply, you might even receive multiple level notifications within a single price update.

The contract includes details like the trading symbol, the strategy name, the exchange, and the frame (which is blank during live trading).  It also provides the original signal data, the current market price, the specific loss level achieved, whether it's a backtest or live trade, and the exact time the event occurred. This information is valuable for generating reports or for custom actions triggered by the strategy's performance.

## Interface PartialLossCommitNotification

This notification informs you about a partial closing of a position, letting you know exactly what happened and why. It's triggered whenever a strategy decides to close off a portion of its holdings, whether you're running a backtest or live trading.

The notification includes a unique ID and timestamp, and will tell you whether it came from a backtest or a live trading environment, the trading pair involved, and the name of the strategy that initiated the action. You'll also find details like the signal ID, the percentage of the position closed, the current market price at the time of the partial close, and whether the trade was a long or short position.

You can access information like the original entry price, take profit and stop-loss levels, and details about any DCA (Dollar Cost Averaging) strategies used, as well as how the PnL (profit and loss) was calculated, including slippage and fees. A human-readable note can be attached to explain the reasoning behind the signal, alongside timestamps tracking when the signal was created, pending, and the notification itself was generated. This provides a complete picture of the partial loss event and helps in understanding and debugging trading decisions.

## Interface PartialLossCommit

This object represents a partial loss event that occurs during a backtest. It tells you that a portion of a trade was closed to limit potential losses.

The `action` property confirms this is a partial loss.

The `percentToClose` indicates what percentage of the position was closed.

You'll also find the `currentPrice` at the time of the action, along with the unrealized profit and loss (`pnl`) at that moment.

It provides details about the trade itself: whether it was a `long` (buy) or `short` (sell) position, the `priceOpen` (entry price), and the `priceTakeProfit` and `priceStopLoss` levels.

Critically, it includes both the effective and original `priceTakeProfit` and `priceStopLoss` values, which is useful if trailing stop-loss orders were in place.

Finally, you'll see timestamps (`scheduledAt` and `pendingAt`) marking when the signal was generated and the position was activated, respectively.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading strategy experiences a loss milestone, like reaching a -10% or -20% drawdown. It provides a wealth of information about the situation, including a unique ID and timestamp to track it.

You'll find details like the strategy name, exchange, and the specific trading pair involved. It tells you if this notification came from a backtest or live trading environment.

The notification breaks down the trade itself: the entry price, direction (long or short), take profit and stop-loss levels, and how these might have changed with trailing stops. Crucially, it includes the original prices before any trailing adjustments.

For positions built using DCA (Dollar-Cost Averaging), you can see the total number of entries and partial closes made. The notification also provides a snapshot of the portfolio's performance at the time of the loss milestone - including P&L figures in both absolute and percentage terms, and the prices used for those calculations. Finally, it may contain a human-readable note explaining the signal's reasoning and the timeline of its creation and activation.

## Interface PartialEvent

This data structure, called `PartialEvent`, collects all the important information when your trading strategy hits a profit or loss milestone. Think of it as a snapshot of what's happening during a trade.

It includes details like the exact time of the event, whether it's a profit or a loss, and the trading symbol involved. You'll also find the name of the strategy that generated the trade, a unique identifier for the signal, and the type of position taken (long or short). 

Crucially, it provides the current market price, the profit/loss level reached (like 10% or 20%), and the original entry, take profit, and stop-loss prices.  If your strategy uses dollar-cost averaging (DCA), it will track the number of entries and the original entry price before averaging. 

You'll also find information about any partial closes, the total unrealized profit and loss at that moment, a descriptive note about the signal, and timestamps indicating when the position became active and when the signal was created. Finally, a flag tells you if this event occurred during a backtest or a live trade.

## Interface MetricStats

This object holds a collection of statistics for a particular performance metric. It gives you a comprehensive view of how that metric behaved during a backtest or live run.

You'll find basic information like the total number of times the metric was recorded, as well as the total time it took across all instances.

It also provides key measures of central tendency and spread, including the average, minimum, and maximum values, alongside the median and percentiles (95th and 99th).

Furthermore, it details the wait times between events, with minimum, maximum, and average values included to help understand timing patterns. Standard deviation is provided for a measure of data dispersion.

## Interface MessageModel

This describes what a single message looks like in a chat history powered by a large language model. Every message has a role – whether it’s a system instruction, something the user typed, a response from the assistant, or the results from a tool. 

Each message also contains content, which is the actual text of what's being communicated. Sometimes, the assistant's message might only contain tool calls, and in that case the content will be empty.

Some providers give extra details about *how* the assistant arrived at its answer, and that's stored in the reasoning content.

If the assistant used any tools, the tool calls themselves are listed along with the message. 

Finally, messages can include images, provided as blobs, raw bytes or base64 strings. And for messages that are responses to specific tool calls, there's an ID that links them together.

## Interface MaxDrawdownStatisticsModel

This model helps you understand the maximum drawdown experienced during a trading period. It tracks specific drawdown events, providing a detailed list of when and how much the drawdown occurred. 

You can access this list of events through the `eventList` property, which shows them in chronological order, with the most recent drawdown appearing first. The `totalEvents` property simply tells you how many drawdown events were recorded overall.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown event experienced during trading. It contains details about when the drawdown occurred, including the trading symbol, the strategy involved, and a unique identifier for the signal. 

You'll find information about the position taken (long or short) alongside the unrealized profit and loss at that point. 

The record also includes the price at which the drawdown was observed, as well as the entry price, take profit level, and stop-loss price set for that trade. Finally, it indicates whether the event occurred during a backtest or live trading.

## Interface MaxDrawdownContract

This defines how the backtest-kit trading framework communicates when a position hits a new maximum drawdown. It’s essentially a notification package containing key details about what happened. You'll receive these updates whenever a position's value experiences a significant decline from its peak.

The information included helps you understand the context of the drawdown: which trading symbol was involved, the current price at the time, when it happened, the name of the strategy and the exchange, and details about the signal that triggered the trade.

Crucially, there's a flag to indicate if the event occurred during a backtest or in live trading.

You can use these notifications to build systems that respond to drawdown events – perhaps adjusting stop-loss orders or managing risk dynamically. The timestamp provided allows you to precisely track when these events happen.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed snapshot of your trading performance as it's happening. It tracks various key metrics based on your live trading events, giving you insights into how well your strategy is performing.

You'll find a complete record of all trading events, including idle periods and every stage of a trade (open, active, closed).  It counts the total number of events, the number of closed trades, and breaks down those closed trades into wins and losses.

Key performance indicators like win rate (percentage of winning trades), average profit per trade, and total profit are calculated.  Risk-adjusted performance is also assessed with metrics like the Sharpe Ratio and annualized Sharpe Ratio.  You can also see volatility measured by the standard deviation, and a certainty ratio that compares the average win to the average loss.

Several additional metrics provide further insights, including expected yearly returns and average peak and fall PNL percentages. All numerical values are presented as null if they cannot be reliably calculated, ensuring the integrity of the data.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes, but aren't critical enough to stop everything. Think of it as a way to get informed about issues that need attention. Each notification has a unique identifier, a descriptive error message, and details about the error itself including the sequence of events that led to it. It’s specifically designed to let you know about problems without interrupting the trading process, allowing for continued operation while you investigate. The `backtest` property will always be false because these notifications arise from live, active trading contexts.

## Interface IWalkerStrategyResult

This interface represents the result you get when evaluating a single trading strategy within a backtest. It contains key information about that strategy, including its name so you know which strategy the data refers to.

You'll also find detailed statistics about the backtest itself, such as returns, drawdown, and Sharpe ratio.  A numerical metric value is included, which is used to compare the strategy against others. Finally, the `rank` property tells you how this strategy performed relative to the others – a lower rank means a better performance.

## Interface IWalkerSchema

The `IWalkerSchema` defines how to set up a comparison test, or "walker," for different trading strategies. Think of it as a blueprint for running an A/B test on your strategies.

It requires a unique identifier (`walkerName`) to keep track of the test, and an optional note (`note`) for your own records. 

You’ll specify the exchange (`exchangeName`) and timeframe (`frameName`) to use for all the strategies involved in the walker.  Crucially, it lists the strategy names (`strategies`) you want to compare against each other – these strategies must be previously registered.

The `metric` property determines what you’re optimizing for (like Sharpe Ratio, which is the default) to see which strategy performs best.  Finally, you can provide `callbacks` for specific events during the walker's execution, allowing you to customize its behavior.


## Interface IWalkerResults

The `IWalkerResults` object holds all the information collected when a backtest kit walker has finished comparing different trading strategies. It provides details about the specific asset being analyzed, the exchange platform used for the tests, and the name of the walker that performed the evaluation. You’ll also find the name of the time frame used in the backtest. This object is crucial for understanding the context of the results and identifying which strategies performed well under which conditions.


## Interface IWalkerCallbacks

This interface lets you plug in custom functions to monitor the progress of backtest kit’s strategy testing process. Think of it as a way to get notified about key events as the system runs tests.

You can receive a notification when each strategy begins its test, allowing you to track which strategy is currently being evaluated.

Similarly, you’ll be informed when a strategy test finishes, along with some statistics and a performance metric.  

If a strategy test encounters an error, you’ll be notified about it, too.

Finally, you'll be called when the entire testing process concludes, and you’ll get a summary of all the results. These callbacks provide insight into the backtesting journey from start to finish.

## Interface ITrailingTakeCommitRow

This interface represents a single action queued for execution related to a trailing take profit and commitment strategy. Think of it as a specific instruction – like "shift the take profit by this percentage" – that’s waiting to be carried out.

It includes the type of action being performed ("trailing-take"), the percentage change needed to adjust a price level, and the price at which the trailing mechanism was initially established. This information allows the backtest kit to accurately simulate how a trailing take profit and commitment would have played out.


## Interface ITrailingStopCommitRow

This interface represents a single action request related to a trailing stop order. It's part of a queue, signifying a request to adjust or manage a trailing stop.

Each entry in this queue specifies that the action being requested is a "trailing-stop" adjustment.  It also includes the percentage shift you want to apply to the trailing stop, and the price at which the trailing stop was initially set. This data helps the system understand exactly how to modify the trailing stop order.

## Interface IStrategyTickResultWaiting

This interface describes what happens when a trading signal is scheduled and you’re actively waiting for it to become ready to execute. It's a status update you’ll receive periodically as the price moves.

Think of it as a "pending" signal.

The `action` property tells you it's in a "waiting" state. You'll also find details about the signal itself (`signal`), the current market price (`currentPrice`), and identifying information like the strategy’s name, exchange, timeframe, and the trading pair (`strategyName`, `exchangeName`, `frameName`, `symbol`). 

Progress towards your take profit and stop loss are currently at 0% because the position isn't active yet (`percentTp`, `percentSl`). 

You can also see the theoretical unrealized profit and loss (`pnl`) if the position were active, and whether this event is part of a backtest or live trade (`backtest`). Finally, a timestamp (`createdAt`) records when this update was generated.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy generates a signal that's set to wait for a specific price level before executing. It's a notification that a signal has been created and is patiently waiting for the market to reach a predetermined entry point.

The notification includes key details like the name of the strategy that generated it, which exchange and timeframe it relates to, and the symbol being traded. You'll also find the current price at the moment the signal was scheduled, allowing you to track the progress towards the target price. It also indicates whether this is happening during a backtest or a live trading session. Essentially, this provides a record of a delayed trading decision.

## Interface IStrategyTickResultOpened

This interface describes the result you receive when a new trading signal is created. Think of it as a notification that a signal has been successfully generated and is ready to be used. 

It tells you specifically that the action taken was "opened," confirming a new signal’s creation.  You’ll also get the details of that signal, including its unique ID.

The information also includes important context like the strategy and exchange involved, the timeframe used for analysis, and the trading symbol.  The current price at the time the signal was opened is provided for reference, as well as whether the signal was generated during a backtest or a live trading session. A timestamp of the event’s creation is included too.


## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy isn't actively making decisions – it's in an "idle" state. Think of it as a checkpoint indicating the system is simply observing market conditions without taking action.

It provides key information about the environment at that moment, including the strategy's name, the exchange being used, the timeframe being analyzed, and the trading symbol.

You'll also find details like the current price, whether this data is from a backtest or live trading, and the exact time the data was recorded. Essentially, it's a snapshot of the market conditions when the strategy isn't issuing any orders.




The `action` property is always "idle", clearly marking the state.  The `signal` is always `null` because no trading signal is present during an idle period.

## Interface IStrategyTickResultClosed

This data structure represents what happens when a trading signal is closed, providing a comprehensive snapshot of the event. It includes the reason for the closure, such as a time expiry, hitting a profit or loss limit, or a manual closure. You’ll find details like the closing price, the exact time the signal was closed, and the calculated profit or loss, factoring in fees and slippage. The record also stores metadata such as the strategy and exchange names, the time frame used, and whether the event occurred during a backtest. A unique ID is included for closures initiated directly by the user, and a timestamp indicating when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a planned trading signal is cancelled before a trade actually takes place. It's like the signal was scheduled to fire, but something happened – perhaps it was cancelled directly, or it triggered a stop loss before a trade could be entered.

The `action` property simply identifies this as a "cancelled" event. The `signal` property provides all the details about the signal that was scheduled but didn’t execute. You’ll also find the `currentPrice` – the price at the moment the signal was cancelled.

Other important details included are the `closeTimestamp` marking when the cancellation happened, the `strategyName`, `exchangeName`, `frameName`, and `symbol` – all identifiers to track where this cancellation occurred.

It also indicates if the event happened during a backtest (`backtest` property) or in live trading. The `reason` explains why the signal was cancelled, and a `cancelId` is included if the cancellation was initiated by a user action. Finally, the `createdAt` timestamp gives the time the cancellation event was recorded.

## Interface IStrategyTickResultActive

This interface represents a tick result when a trading strategy is actively monitoring a signal, typically waiting for a take profit (TP), stop loss (SL), or a time expiration. It provides detailed information about the current state of the trade, including the signal being monitored, the current VWAP price, and the strategy and exchange names for tracking purposes.

You'll find specifics like the trading symbol, percentage progress towards TP and SL, and the unrealized profit and loss (PNL) for the active position. The `backtest` flag indicates whether this data originates from a backtest simulation or a live trading environment. 

The `createdAt` timestamp marks when the tick result was generated, and `_backtestLastTimestamp` is used internally for backtesting logic to manage candle processing. This allows for precise tracking and analysis of the position's performance throughout its active state.

## Interface IStrategySchema

This schema defines the structure of a trading strategy you register within the backtest-kit framework. It allows you to clearly outline how your strategy generates trading signals and how it should behave.

Each strategy needs a unique identifier, and you can add a note for documentation purposes. 

The `interval` property controls how frequently the strategy generates signals, preventing excessive requests.

The core of the strategy is the `getSignal` function, which is responsible for calculating signals based on the current symbol, date, and price. It can generate signals immediately based on the current price, or schedule signals to activate when a specific entry price is reached.

You can also add optional lifecycle callbacks, like `onOpen` and `onClose`, to execute code at specific points in the strategy’s lifecycle. 

The strategy can also be associated with risk profiles for better risk management and linked to specific actions.

## Interface IStrategyResult

This interface defines the structure of a result entry used when comparing different trading strategies. Each entry represents a single strategy and includes its name, a comprehensive set of statistics generated during backtesting, and the value of the metric used to rank strategies.  It also stores the timestamps of the first and last signals generated by the strategy, which can be helpful for understanding the strategy’s activity during the backtest period.  If a strategy didn't produce any signals, these timestamps will be null.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of calculating a trading strategy's profit and loss. It breaks down how much money a strategy made or lost, taking into account fees and slippage – those little extra costs that pop up when buying and selling. 

You'll see the profit/loss expressed as a percentage (so a positive number means a gain, a negative number a loss), and also the adjusted entry and exit prices reflecting the impact of fees and slippage. 

The interface also tells you the actual dollar amount of the profit/loss and the total amount of money initially invested. It's a complete picture of a trade's financial performance.


## Interface IStrategyCallbacks

This interface defines a set of optional callbacks that your trading strategy can use to respond to various signal lifecycle events. Think of them as hooks that allow your strategy to react to changes in signal status, like when a signal is opened, active, or closed. You can use these callbacks to log events, perform custom calculations, or adjust your strategy’s behavior based on the current state of the signals. 

Here’s a breakdown of what each callback does:

*   `onTick`:  Gets triggered with every price update, giving you a continuous view of market data.
*   `onOpen`: Called when a new trading signal is initiated.
*   `onActive`:  Notifies you when a strategy is actively monitoring a signal.
*   `onIdle`: Signals that no signals are currently being actively monitored.
*   `onClose`: Informs you when a signal has been fully executed and closed out.
*   `onSchedule`:  Gets called when a scheduled signal is created, allowing actions related to delayed entries.
*   `onCancel`: Triggers when a scheduled signal is cancelled before a position is opened.
*   `onWrite`:  Used to record signal information when persistence storage is needed, primarily for testing and historical record keeping.
*   `onPartialProfit`:  Alerts you when a signal is generating profit but hasn't yet hit the target price.
*   `onPartialLoss`: Signals when a position is experiencing a loss, but hasn’t hit the stop-loss level.
*   `onBreakeven`:  Notifies you when a signal has reached the break-even point.
*   `onSchedulePing`:  A regular check-in for scheduled signals, used for monitoring and potential cancellation.
*   `onActivePing`: Similar to `onSchedulePing`, but for active signals, allowing for dynamic adjustments and monitoring.

These callbacks provide a structured way to integrate custom logic into your strategy's response to different signal events.

## Interface IStrategy

The `IStrategy` interface defines the core methods for a trading strategy within the backtest-kit framework. It handles things like reacting to market ticks, managing pending signals (both scheduled and immediate), and calculating various performance metrics.

The `tick` method is the heart of strategy execution, processing each market update and checking for price levels that trigger stop-loss or take-profit orders.  `getPendingSignal` and `getScheduledSignal` allow the system to retrieve current signals or determine if a scheduled entry should activate.

Several methods provide insight into the position's current state, such as `getBreakeven` (checking if a trade has covered costs) and `getTotalPercentClosed` (tracking how much of the initial investment remains).  You can also find the effective entry price (`getPositionEffectivePrice`), the number of positions (`getPositionInvestedCount`), or unrealized profit/loss (`getPositionPnlPercentage` and `getPositionPnlCost`).

`backtest` lets you run simulations against historical data. The `stopStrategy`, `cancelScheduled`, and `closePending` methods allow you to manage active positions, while the various `validate` and `partial` functions deal with specific actions like partial profits, losses, or trailing stops.  Finally, `dispose` handles cleanup when a strategy is no longer needed. These methods offer granular control over signals and positions, with extensive validations to ensure accurate trading.

## Interface IStorageUtils

This interface defines the core functionality needed for any system to store and manage trading signals within the backtest-kit framework. Think of it as a contract that ensures different storage solutions (like databases or files) can interact consistently with the backtesting process.

It provides methods for reacting to various signal lifecycle events – when a signal is opened, closed, scheduled, or cancelled – allowing the storage system to track the signal’s state. The interface also includes ways to retrieve signals by their unique ID or list all available signals. 

Finally, there are specific ping event handlers that keep track of when signals are actively running or scheduled, updating the signal’s timestamp to ensure accurate tracking and management. It’s the foundation for how backtest-kit knows what’s happening with its trading signals.


## Interface IStorageSignalRowScheduled

This interface represents a signal that is scheduled for a specific time. It's essentially a record indicating that a trading signal has been planned and is awaiting execution. The `status` property confirms that the signal's current state is "scheduled." This helps in managing and tracking signals that are not yet active.

## Interface IStorageSignalRowOpened

This interface represents a trading signal that has been opened, meaning a trade has been initiated based on that signal. It's a simple way to track when a signal is active.

The `status` property is the key piece of information, and it’s always set to "opened" to indicate the signal's current state. Essentially, it confirms that a trade is underway following this signal.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed and finalized. It holds information specifically about signals that have reached their end, allowing you to analyze their performance.

Essentially, it contains the crucial financial details – the profit and loss (PNL) – associated with a closed trading signal.

The `status` property confirms that the signal is indeed "closed," while the `pnl` property provides the concrete profit and loss data to evaluate its success.


## Interface IStorageSignalRowCancelled

This interface represents a storage signal row specifically indicating that a signal has been cancelled. It's a simple way to track signals that were initially planned but are no longer active.

The `status` property is fixed and always set to "cancelled," providing a clear indication of the signal's state. This allows you to easily filter and process cancelled signals within your backtesting or trading system.

## Interface IStorageSignalRowBase

This interface defines the core information shared by all signal row variants when they're stored. Think of it as the foundation for how signals are saved. Each signal row will have a `createdAt` timestamp, marking when it was initially created, and an `updatedAt` timestamp to track any later modifications. There’s also a `priority` field which helps ensure signals are processed in the correct order, using the current time as a guide.


## Interface ISizingSchemaKelly

The `ISizingSchemaKelly` interface defines how to size your trades using the Kelly Criterion, a method for maximizing growth rate. It requires you to specify the sizing method as "kelly-criterion".

You also need to set a `kellyMultiplier`, which controls how aggressively you size your trades – a lower value like 0.25 represents a "quarter Kelly" approach, meaning you risk a smaller fraction of your capital per trade. The default value is 0.25.


## Interface ISizingSchemaFixedPercentage

This schema defines a very straightforward way to size your trades. It’s designed for situations where you want to consistently risk a fixed percentage of your capital on each trade.

The core of this sizing approach is the `riskPercentage`, which represents the maximum percentage of your account you're willing to lose on a single trade. This value is always between 0 and 100. 

Effectively, it means your trade size will automatically adjust as your account balance changes, always maintaining that defined risk level.


## Interface ISizingSchemaBase

This interface provides a foundational structure for defining how much of your trading account to allocate to each trade. 

It includes essential details like a unique name to identify the sizing configuration, a place for developer notes, and limits on position size – both as a percentage of your account and in absolute units.

You can also add optional callbacks to trigger specific actions at different stages of the sizing process. This allows for customized sizing behavior beyond the basic parameters.

## Interface ISizingSchemaATR

This schema defines how to size trades using the Average True Range (ATR). It's designed for strategies where risk management is tied to market volatility.

The `method` is always set to "atr-based" to indicate the sizing approach.

You specify the `riskPercentage` to control how much of your capital is risked on each trade, expressed as a percentage between 0 and 100.

The `atrMultiplier` determines how the ATR value is used to calculate the stop-loss distance, essentially scaling the stop based on market volatility – a higher multiplier means a wider stop.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how to configure Kelly Criterion sizing for your trading strategies. It's primarily used when setting up a `ClientSizing` object.

The key component here is the `logger`, which allows you to receive debug messages and track the sizing process. This helps in understanding and fine-tuning your sizing decisions. You’ll provide an implementation of `ILogger` to log relevant information.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades based on a fixed percentage of your capital. It's used within the backtest-kit framework. 

You'll provide a logger to help with debugging and understanding how your sizing strategy is working. This logger allows you to see the decisions your sizing parameters are making.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining trade sizes based on the Average True Range (ATR). It mainly focuses on providing a way to log information for debugging purposes. You'll specify an `ILogger` object here to receive and display any diagnostic messages generated during the sizing process.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, you can define a function that gets triggered right after the system calculates a potential position size. This is a great spot to log what the calculated size is or to run some checks to make sure the size makes sense in your trading strategy. The function receives the calculated quantity and additional parameters related to the sizing calculation.

## Interface ISizingCalculateParamsKelly

To help you determine how much to bet based on the Kelly Criterion, this structure holds the necessary information. 

You'll provide the calculation method, which will always be "kelly-criterion" in this case. 

Then, you’ll define your win rate – the percentage of times your trades are successful – and your average win/loss ratio, which represents the typical profit compared to the loss on each trade. These values are essential for a mathematically sound sizing strategy.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your capital to size each trade. 

It requires you to specify a `method` which is always "fixed-percentage" to indicate this sizing approach. You also need to set a `priceStopLoss`, representing the price at which a stop-loss order would be triggered. This is a key parameter for managing risk when sizing your trades with a fixed percentage.

## Interface ISizingCalculateParamsBase

This interface defines the core information needed to determine how much of an asset to trade. 

It includes the trading symbol, like "BTCUSDT," which identifies the pair being traded.  You'll also find the current account balance, representing how much capital is available, and the intended entry price for the trade. These basic properties are used across all sizing calculations within the backtest-kit framework.

## Interface ISizingCalculateParamsATR

This interface defines the settings you'll use when determining trade size based on the Average True Range (ATR). 

Essentially, it tells the backtest framework you want to size your trades using an ATR-based approach. 

It requires two pieces of information: a confirmation that you're using the "atr-based" method, and a numerical value representing the current ATR. This ATR value is crucial for calculating how much to trade.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to trade – essentially, the position size. It’s a core part of how the backtest kit executes trading strategies.

The `calculate` property is the most important piece; it's a function you provide that takes some parameters and returns a promise resolving to the size you want to trade. This size represents the amount of the asset, allowing the strategy to adapt to risk levels and other factors.

## Interface ISignalRow

This describes the structure of a signal within the backtest-kit framework. Each signal represents a trading opportunity and holds a wealth of information about it. It's assigned a unique ID when it's created and includes key details like the cost of the trade, the entry price, the expected duration, and the exchange and strategy used.

A signal also tracks its lifecycle through timestamps like when it was scheduled and when it became active. It specifies the trading pair, and importantly, flags whether the signal was initially scheduled.

For more complex trading strategies, the signal keeps a history of partial profits or losses, details on any trailing stop-loss or take-profit adjustments, and an entry history if dollar-cost averaging is used. It also keeps track of the highest price seen (peak) and lowest price seen (fall) as the trade progresses, relative to the original entry price. Finally, there's a general timestamp marking when the signal was first created within the backtesting or live context.


## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to retrieve them in batches or intervals. It's designed for efficiency, allowing you to get multiple signals at once and delaying the next signal until a specified time interval has passed. Each signal is uniquely identified by its ID, which is automatically generated.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a standard way to package all the necessary information for a trade. It's essentially a data container that ensures signals are structured correctly before being used. Each signal includes details like its direction (long or short), a description of why the signal was generated, the entry price, target profit price, and a stop-loss price to manage risk.  You can optionally provide an ID, but if you don’t, one will be automatically created.  Signals can also have a timeout, represented by an estimated duration in minutes, and a cost associated with the trade.

## Interface IScheduledSignalRow

This interface describes a signal that's designed to be triggered when a specific price level is reached. Think of it as a signal waiting for a particular price to occur before it acts.  It's essentially a 'pending' signal, waiting for a price target. Once that target price, defined by `priceOpen`, is hit, it transforms into a standard, active signal. It keeps track of when it was initially scheduled and when it actually started pending, which is useful for understanding the timing of your trading strategy. The `priceOpen` property simply tells you the price level that needs to be reached for this pending signal to activate.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might need to be cancelled. It builds upon the standard scheduled signal information by adding a unique identifier, `cancelId`, which is used when a user wants to specifically cancel that signal. Think of it as a way to track and manage cancellations you initiate. The `cancelId` allows for targeted removal of signals from the schedule.

## Interface IRunContext

The `IRunContext` is like a central hub of information needed when you're running code within the backtest-kit framework. It brings together two key pieces of data: details about the method being executed (like which exchange and strategy are involved) and runtime information about the specific trade (like the symbol being traded and the time of the trade). Think of it as a package containing all the necessary context for a calculation or action during the backtest or live trading process. This context is then carefully split and used by different services within the framework to handle their specific responsibilities.

## Interface IRiskValidationPayload

This data structure holds all the information needed when validating a trading signal, building upon the initial arguments. It includes the signal itself, represented as a `currentSignal`, which provides details about the trade opportunity. 

You'll also find the number of open positions (`activePositionCount`) and a list of those open positions (`activePositions`), giving you a complete view of the current portfolio state. This allows your risk validation logic to make informed decisions based on the current trading environment.


## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and sound. It’s used to check if a trade is acceptable based on your risk rules. If everything looks good, the function does nothing (or returns nothing). If something's wrong – like a trade would violate a maximum position size – it provides a clear explanation of why the trade is being rejected, allowing you to debug and adjust your strategy. Essentially, it’s a gatekeeper for your trades, making sure they align with your pre-defined risk parameters.


## Interface IRiskValidation

This interface helps you define how to check if your trading strategy's risk parameters are acceptable. Think of it as a way to set up rules to make sure your strategy isn't going to take on too much risk.

You provide a `validate` function, which is the core logic – this function actually performs the risk check.  You can also add a `note` to explain what the validation is doing and why it's important. This note is really helpful for explaining the validation rules to others or for your own future reference.

## Interface IRiskSignalRow

The `IRiskSignalRow` interface represents a single row of data used for managing risk during trading. It builds upon the existing `ISignalDto` to provide essential pricing information. Specifically, it includes the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the initially set take-profit price (`originalPriceTakeProfit`). This data is crucial for validating risk parameters and tracking the original risk levels associated with a trade.

## Interface IRiskSchema

This defines a way to create reusable risk profiles for your trading strategies. Think of it as a blueprint for how your portfolio will manage risk. Each profile has a unique name to identify it, and you can add notes to describe what it does. 

You can also hook into certain events related to the risk profile, like when a trade is initially rejected or when it's allowed. The core of a risk profile is its validations – these are the rules that dictate whether a trade can proceed. You can provide these as either pre-built functions or more detailed validation objects.


## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details about why the validation failed, helping you understand and fix the issue. Each rejection has a unique `id` to track it specifically, and a `note` field explains the reason for the rejection in plain language.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed to manage risk during trading. It includes essential details like the exchange being used, a logger for tracking activity, and the execution context, which tells the system what symbol is being traded, the current time, and whether it's a backtest or live environment.

You can also specify a callback function (`onRejected`) that gets triggered whenever a trading signal is blocked due to risk constraints.  This allows you to react to and potentially log these rejections before the system sends out a formal notification – it's a chance to understand why a trade wasn't executed.

## Interface IRiskCheckArgs

IRiskCheckArgs holds the information needed to decide if a new trade should be allowed. Think of it as a set of checks run *before* a trading signal is actually executed. It provides details like the trading pair, the signal itself, the strategy that's requesting the trade, and where the trade will be placed. 

Essentially, it's a snapshot of the current trading environment and the signal being considered, allowing for pre-trade validation based on things like risk rules. This includes things like the current price, the time of the check, and which strategy is asking to make the move. It's all passed directly from the ClientStrategy context.


## Interface IRiskCallbacks

This interface defines optional functions you can use to get notified about the results of risk checks during trading. You can provide an `onRejected` function that gets called when a trading signal is blocked because it exceeds predefined risk limits. Alternatively, the `onAllowed` function is triggered when a signal successfully passes all the risk checks and is considered safe to execute. These callbacks allow you to build custom logic or monitoring systems around your risk management process.

## Interface IRiskActivePosition

This interface describes a single, active trading position that's being monitored for risk management. Think of it as a snapshot of a trade currently in progress. It includes details like which strategy created the trade, the exchange it's on, the trading symbol (like BTCUSDT), and whether it's a long or short position. 

You'll also find essential pricing information, such as the entry price, stop-loss level, and take-profit target.  A timestamp indicates when the position was first opened, and an estimated time helps to track its duration. Essentially, it's a complete picture of a live trade, allowing for analysis across different trading strategies.

## Interface IRisk

This interface, `IRisk`, is responsible for managing and controlling the risk involved in your trading strategies. Think of it as a gatekeeper, making sure your signals align with your predefined risk limits.

It offers three key functions: `checkSignal` which evaluates whether a signal is permissible based on your risk parameters, `addSignal` to record the details of a new trade being opened, and `removeSignal` to mark a trade as closed and remove it from active tracking. By using this interface, you can ensure your backtests remain within safe and defined risk boundaries, preventing runaway trades and maintaining a controlled environment for analysis.

## Interface IReportTarget

This interface lets you fine-tune what kinds of data backtest-kit records during a trading simulation. Think of it as a way to control the level of detail you want in your reports.

You can choose to log information about strategy actions, risk rejections, breakeven points, partial trade closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading activity, backtest signal closures, signal synchronization, or milestone events like reaching a highest profit or experiencing a maximum drawdown.

Each property, like `strategy` or `risk`, acts as a switch – turning it on (`true`) means that specific type of event will be recorded, while turning it off (`false`) will suppress it. This gives you precise control over the volume and type of data collected for your reports.

## Interface IReportDumpOptions

This section defines options used when writing reports about your trading activity. Think of it as a way to tag and categorize your data so you can easily find what you're looking for later. You can specify things like the trading pair (like BTCUSDT), the name of the trading strategy used, the exchange platform involved, the timeframe (e.g., 1 minute, 1 hour), and even a unique identifier for the signals that triggered trades.  It also lets you include a name for any optimization processes you ran. This gives you a rich set of metadata to sort and analyze your backtesting results.

## Interface IPublicSignalRow

This interface, IPublicSignalRow, helps you understand the original parameters of a trading signal, even if those parameters have been adjusted later. Think of it as a way to see the initial setup of a trade. It builds on a base structure but adds key information about the original stop-loss and take-profit prices.

It’s designed for publicly facing tools, so users can see the original stop-loss and take-profit levels that were set when the signal was created – useful for transparency. These original values remain constant, even if your strategy is dynamically adjusting the stop-loss or take-profit based on price movement.

You'll also find details about the trade's cost, how much of it has been partially closed, and the overall number of entries and partial closes. The original entry price is also provided, which is the same as the price at signal creation. Finally, the interface includes unrealized profit and loss (PNL) information calculated at the moment the signal was created.

## Interface IPublicCandleData

This interface defines the structure for a single candlestick, the standard unit of time-based price data used in trading. Each candlestick represents a specific time interval, like a minute, hour, or day. It contains information about when the period began (timestamp), the price at which trading started (open), the highest and lowest prices reached (high and low), the price at which the period ended (close), and the total volume of trading activity (volume) that occurred during that time. You'll use this structure when dealing with historical price data for backtesting or analyzing trading strategies.

## Interface IPositionSizeKellyParams

To help you determine how much to bet based on your trading strategy, this interface defines the parameters for calculating position sizes using the Kelly Criterion. It focuses on the essential information needed – your win rate, expressed as a number between 0 and 1, and your average win-loss ratio. By providing these two values, the framework can calculate an appropriate bet size based on your historical performance.


## Interface IPositionSizeFixedPercentageParams

This interface defines the settings for a trading strategy that uses a fixed percentage of your available capital for each trade. 

It includes a single property, `priceStopLoss`, which dictates the price at which a stop-loss order will be placed to limit potential losses. You'll use this value to ensure your trades are managed with a defined risk level.

## Interface IPositionSizeATRParams

This parameter defines the Average True Range (ATR) value that's currently being used to determine the size of your trades. Think of it as a measure of volatility – a higher ATR suggests wider price swings and might influence how much capital you allocate to a position. It's a crucial factor when calculating position sizes based on risk management strategies that use ATR.

## Interface IPositionOverlapLadder

This defines how to detect overlaps when using dollar-cost averaging (DCA) strategies. It's all about setting a buffer zone around each DCA level.

You have two key settings: `upperPercent` and `lowerPercent`. `upperPercent` determines how much above a DCA level is considered an overlap, while `lowerPercent` does the same for below.

Think of it as drawing lines above and below each DCA price point – anything falling between those lines is flagged as a potential overlap. These percentages, represented as numbers between 0 and 100, let you fine-tune how sensitive the overlap detection is.

## Interface IPersistBase

This interface provides the fundamental building blocks for connecting backtest-kit to various storage systems, like files or databases. Think of it as a contract that custom storage adapters must follow.

It outlines five core functions: `waitForInit` handles initial setup and ensures things are ready, `readValue` retrieves existing data, `hasValue` quickly checks if something exists, `writeValue` saves new or updated data, and `keys` lists all the data items you have stored. The `keys` method is particularly important for ensuring data consistency and making sure everything is in order. These methods allow backtest-kit to interact with your chosen storage without needing to know the specifics of how that storage works.

## Interface IPartialProfitCommitRow

This describes a step in your trading plan where you're taking a portion of your profits along the way. Think of it as a way to secure gains and manage risk.

Each entry represents a specific action, indicating that a partial profit commitment is happening. It tells you what percentage of your position is being closed, and the price at which that closing occurred. This information is valuable for understanding how your trading strategy is performing and reviewing the prices at which profits were realized.

## Interface IPartialLossCommitRow

This describes a record representing a request to partially close a position. It's essentially a "to-do" item for executing a partial loss.

The `action` field specifies that this is a partial loss commitment.  The `percentToClose` tells you what portion of the position should be closed, expressed as a percentage. Finally, `currentPrice` captures the price at which the partial closing occurred, important for calculating profits/losses.

## Interface IPartialData

This data structure, called `IPartialData`, is designed to save and load information about trading signals. It focuses on key pieces of data needed for rebuilding a trading system later. 

Specifically, it stores the profit and loss levels that a signal has encountered, represented as arrays of `PartialLevel` objects. These arrays are used because some data formats, like JSON, don't handle sets directly, so this provides a way to persist that information. This data is stored alongside other signal information and used when the system starts up to restore the signal's state.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how much profit or loss a trading signal is generating. Think of it as a milestone tracker for your trades. 

It has methods for handling both profit and loss situations. When a signal is making money, the `profit` method checks if it's hit certain levels like 10%, 20%, or 30% profit, and alerts you when those milestones are reached – but only once for each level.  The same logic applies to losses with the `loss` method, monitoring loss percentages and reporting new levels.

Finally, the `clear` method cleans up the tracking when a signal is finished – whether it hits a take profit, stop loss, or expires. It removes the signal's data, saves this information, and makes sure everything is tidy for the next trade.

## Interface IParseArgsResult

This interface represents the output you get when you process command-line arguments to configure your trading session. It essentially tells you what kind of trading environment you're running.

You'll see three key properties: `backtest`, `paper`, and `live`.  Each of these is a boolean value (true or false) that indicates whether the system is operating in that specific mode – simulating historical data, practicing with simulated funds and live data, or executing real trades with real money, respectively.


## Interface IParseArgsParams

This interface outlines the expected input when you're setting up your backtesting arguments. Think of it as a blueprint for the information your program needs to know – like which cryptocurrency pair you're trading (symbol), the specific trading strategy you want to run, the exchange you're using (Binance, Bybit, etc.), and the timeframe for the data (hourly, 15-minute, daily). It specifies that these properties are all strings, and provides examples to clarify what kind of values should be used.  Essentially, it helps ensure your backtest has all the necessary ingredients to start.


## Interface IOrderBookData

This interface describes the structure of order book data, which is essentially a snapshot of what buyers and sellers are offering for a particular trading pair. It contains the `symbol` of the trading pair (like BTC/USD), along with arrays of `bids` and `asks`.  The `bids` array holds information about orders to buy the asset, while the `asks` array holds information about orders to sell. Each element within the `bids` and `asks` arrays represents a single order and contains details like price and quantity.

## Interface INotificationUtils

This interface defines the core functions needed for any system that wants to send out notifications about your backtesting or trading activity. Think of it as a blueprint for how different notification methods – like email, Slack, or webhooks – should communicate with the backtest-kit framework. 

It includes methods for responding to various events, such as when a trade is opened or closed, when partial profit or loss targets are met, or when the strategy needs to be adjusted.  You'll also find functions for dealing with different types of errors and for retrieving or clearing all the stored notifications. Basically, if you want to get alerts and updates about your trading, you'll need to build a system that follows this interface.

## Interface IMethodContext

The `IMethodContext` object acts as a little roadmap, guiding the backtest-kit framework to the right components during a trading simulation. It holds the names of the strategy, exchange, and frame being used – think of it as telling the system "Hey, use *this* strategy definition, *this* exchange definition, and *this* frame definition." This context is automatically passed around, so you don't have to manually track it.  The frame name will be blank when running in live mode, indicating that no historical data frame is in use. Essentially, this object makes sure the right pieces of your trading setup are always used.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory systems should behave within the backtest-kit framework. Think of it as a common blueprint for how to store and retrieve information related to your trading strategies. It provides a set of methods for managing this information, allowing you to write, search, list, and delete entries. You'll use these methods to interact with different types of memory backends, whether they're local, persistent, or simply for testing purposes. The `waitForInit` method makes sure the memory is ready before you start using it, and `dispose` cleans up when you're done.

## Interface IMarkdownTarget

This interface lets you customize which detailed reports are generated during your trading simulations and analysis. Think of it as a way to choose exactly what aspects of your trading you want a written breakdown of. 

You can select reports focusing on specific events, like entry and exit signals, risk management blocks, or when stop-loss orders adjust. It also allows you to generate reports that analyze portfolio performance across different assets, compare strategy variations, identify performance bottlenecks, and track signal scheduling. 

Furthermore, you can activate detailed reports on live trading events, backtest results, signal synchronization, and specific milestones like reaching peak profit or experiencing maximum drawdown. Each boolean property represents a different report type – toggle them on to get that report, off to suppress it.

## Interface IMarkdownDumpOptions

This interface defines the settings used when exporting data to Markdown format. It essentially bundles together all the details needed to identify a specific piece of information related to a trading strategy. Think of it as a container holding the path, filename, and key identifiers like the trading symbol, strategy name, exchange, timeframe, and signal ID – allowing you to pinpoint exactly what you’re documenting. This structure streamlines the process of organizing and presenting your backtesting results in a readable and understandable format.

## Interface ILogger

The `ILogger` interface is the central way different parts of the backtest-kit framework communicate about what’s happening. It provides a standardized way to record messages at various levels of importance, from basic information to detailed debugging data. Think of it as a built-in way to keep a record of what’s going on inside the system, helping you track down issues, understand system behavior, or simply monitor progress.

The `ILogger` includes several methods for logging:

*   `log`: This is your go-to for general messages about significant events.
*   `debug`: Use this for very detailed information used for troubleshooting or development.
*   `info`:  This method records successful actions and routine updates, like policy checks or saving data.
*   `warn`:  This is for when something isn't quite right, but the system can still continue running. It flags potential issues that might need investigation.

## Interface ILogEntry

Each log entry, whether a general log, a debug message, an informational note, or a warning, is represented by this structure. It includes a unique identifier and a timestamp to help you track when the entry occurred. You'll also find details about the context in which the log was generated, like the method that triggered it, and any extra arguments that were passed along. This allows for richer and more informative logging during your backtesting process.

## Interface ILog

The `ILog` interface provides a way to track and retrieve all the logging messages generated during a backtest. It allows you to access a complete history of what happened during the simulation, which is really useful for debugging or analyzing performance. The `getList` method is your key to getting this historical log data, returning a list of all the individual log entries recorded.

## Interface IHeatmapRow

This interface represents a single row in the portfolio heatmap, giving you a quick overview of how a specific trading pair performed. It bundles together key metrics like total profit, risk-adjusted return (Sharpe Ratio), and maximum drawdown to show the overall health of strategies trading that symbol. You’ll also find details about the trading activity itself, including the number of trades, win/loss counts, and win rate.

The interface includes statistics that highlight trade performance, like average profit and loss per trade, standard deviation, and profit factor. It also provides insight into consecutive winning and losing streaks, and the average peak and fall percentages of profit. All these properties allow for a comprehensive view of a trading pair's performance.

## Interface IFrameSchema

The `IFrameSchema` helps you define a reusable block of time for your backtest. Think of it as setting up a template for a specific time window you want to analyze.

It's essential for specifying the backtest period, for example, "January 2023 to December 2023," and the frequency of data, like daily, hourly, or even minute-by-minute.

Each `IFrameSchema` has a name to identify it, a note for documentation, and precisely defines the start and end dates for the period it represents. You can also add optional callbacks to trigger specific actions at different points during the frame's lifecycle.

## Interface IFrameParams

The `IFramesParams` object holds the settings you provide when creating a `ClientFrame`, which is a core component for running trading strategies. It builds upon `IFramesSchema` and crucially includes a `logger` – a tool for tracking and debugging what your strategies are doing. Think of the logger as a helpful assistant that records important events and errors so you can understand and fix any issues. This logger helps you keep an eye on your backtesting process and troubleshoot any problems that arise.

## Interface IFrameCallbacks

The `IFramesCallbacks` interface lets you hook into key moments in the timeframe generation process. Specifically, the `onTimeframe` function gets called whenever a new set of timeframes is created. This is a great place to add your own checks or logging to make sure the timeframe generation is working as expected. You can use it to confirm the dates and intervals being used are correct.

## Interface IFrame

The `IFrames` interface is how backtest-kit figures out the specific dates and times it needs to run your trading strategy. Think of it as the backbone for setting up your historical data. 

The `getTimeframe` function is the core of this – it’s what you use to get an array of dates and times for a particular trading symbol and a defined timeframe (like "daily" or "hourly"). This function ensures the dates are spaced correctly based on the timeframe you’ve chosen, providing a consistent schedule for your backtest.

## Interface IExecutionContext

The Execution Context provides the necessary information for your trading strategies and exchange interactions to function correctly. Think of it as a package of details passed along to your code, containing the current trading symbol, like "BTCUSDT," and the current timestamp. It also tells your strategy whether it's running a simulation (backtest mode) or live trading. This context helps ensure your code knows exactly what's happening at any given moment during the trading process.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with different cryptocurrency exchanges. It’s essentially a blueprint for connecting to an exchange and retrieving the data needed for backtesting strategies.

You'll need to provide a unique identifier for each exchange you want to use. It's also helpful to add notes for your own documentation.

The most important part is `getCandles`, which tells backtest-kit how to fetch historical price data (candles) for a specific trading pair and time period.

You can also customize how quantity and price values are formatted to match the exchange's specific rules, although defaults are provided for Bitcoin on Binance if you don't.

Optionally, you can provide methods to retrieve order books or aggregated trades, but these are not required and will result in errors if missing.

Finally, you can specify callback functions to react to certain events, like new candle data arriving.

## Interface IExchangeParams

This interface defines the essential settings you need to provide when setting up a connection to an exchange within the backtest-kit framework. It acts as a blueprint for how your exchange interacts with the testing environment. You must supply functions for fetching historical candle data, formatting order quantities and prices to match the exchange's specifications, retrieving order books, and fetching aggregated trade data. A logger and an execution context are also provided to help monitor and manage the backtesting process. The framework automatically handles some default configurations, but you're responsible for providing the core functionality to access your exchange's data.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` object lets you listen for events coming from the exchange data feed. Think of it as a way to react to incoming information about price movements.

Specifically, the `onCandleData` callback is triggered whenever new candlestick data is retrieved. This data includes details like the symbol (e.g., BTC/USD), the time interval (e.g., 1 hour), the starting date and time for the data, the number of candles requested, and an array containing the actual candlestick data points.  You can use this to build visualizations or perform calculations in real-time as new data arrives.

## Interface IExchange

The `IExchange` interface is like a bridge to a cryptocurrency exchange, allowing your backtesting system to interact with real-time or historical market data. It provides ways to retrieve historical and future candle data, essential for analyzing past performance and simulating trades. You can also use it to format order quantities and prices to match the exchange's specific rules.

To understand the market, you can request order books and aggregated trades for a specific trading pair. Calculating the VWAP (Volume Weighted Average Price) is also supported, offering a view of the average price a trade would have happened at.

Retrieving historical candles offers a lot of flexibility – you can specify a time range (start and end dates), a limit on the number of candles, or a combination of both, ensuring your analysis is accurate and avoids looking into the future. This design prioritizes preventing any look-ahead bias.

## Interface IEntity

This interface, `IEntity`, serves as a foundational building block for anything stored persistently within the backtest-kit framework. Think of it as a common contract that all your data objects, like trades or orders, will adhere to. It ensures that all entities have a consistent structure and can be reliably managed within the system. Essentially, if a class represents a piece of data that needs to be saved or retrieved, it should probably implement `IEntity`.

## Interface IDumpInstance

The IDumpInstance interface provides a way to save different kinds of data related to a backtest run. Think of it as a tool for creating detailed logs or reports of what happened during the simulation. You can use it to record everything from simple key-value pairs and text documents to complex tables of data and even entire conversations between agents. 

Each dump instance focuses on a specific signal and storage location, ensuring data is organized correctly. When saving data, you only need to provide the actual information and a unique identifier; the system handles the rest. 

There's a method for nearly every data type you might want to preserve, including errors. And when you're finished with the instance, the `dispose` method allows you to release any resources it was using.

## Interface IDumpContext

This `IDumpContext` object holds the key details needed to understand where a particular piece of data came from during a backtest. Think of it as a label – it tells you which signal triggered the data, which strategy or agent generated it, and a unique ID to track it. There's also a descriptive label that helps with searching and makes the data easier to understand when it's displayed. The `signalId` and `bucketName` are provided when the context is created, while the `dumpId` and `description` are assigned to each individual data point.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that involve committing data, but which are intentionally delayed. Think of it as a way to hold onto information until the system is ready to process it properly. Each event that uses this interface will have a `symbol`, which is simply the ticker of the trading pair involved, and a `backtest` flag that indicates whether the action is happening within a backtesting scenario. It’s a core piece in ensuring that commit actions happen at the right time and in the right environment.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. It’s essentially a way to verify that the candle data you’ve stored is complete and accurate within a specific timeframe. You'll provide the trading pair (like "BTCUSDT"), the exchange you're using, the time interval of the candles (like "1m" for one-minute candles), and the start and end dates you want to check.  Finally, you can specify where your candle data is stored; if you don't, it defaults to a standard location.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard way to organize price data in financial markets. Each candle contains information about the price movement over a specific time period. You'll find properties like the timestamp – when the candle began – the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trading that occurred. This data is crucial for calculating things like the VWAP (Volume Weighted Average Price) and when backtesting trading strategies.

## Interface ICacheCandlesParams

This interface defines the data needed when you want to proactively download historical price data for your backtests. Think of it as a blueprint for requesting a specific set of candles – like asking for all the 4-hour BTCUSDT candles from January 1st to March 1st.  It specifies the trading pair (symbol), the exchange providing the data, the timeframe of the candles (interval), and the starting and ending dates for the download.  Pre-caching this data can significantly speed up your backtests by avoiding real-time data requests during the simulation.


## Interface IBroker

This interface defines how backtest-kit interacts with a live broker. Think of it as a contract—you create an implementation to connect the framework to a real exchange. The framework will call your implementation's functions before making changes to its internal state, ensuring a safe and predictable process. If something goes wrong during these calls, the framework's state isn't altered.

Crucially, during backtesting, these calls are skipped entirely; your broker adapter won't receive any backtest data.

Here's a breakdown of what each method represents:

*   `waitForInit`: A one-time setup to connect to the exchange and load any necessary credentials.
*   `onSignalCloseCommit`: Handles when a trade is closed—whether due to a take-profit, stop-loss, or manual action.
*   `onSignalOpenCommit`: Handles when a new trade is initiated and confirmed.
*   `onPartialProfitCommit`: Handles taking partial profits from a trade.
*   `onPartialLossCommit`: Handles closing a portion of a losing trade.
*   `onTrailingStopCommit`: Deals with updating a trailing stop-loss order.
*   `onTrailingTakeCommit`: Manages updates to a trailing take-profit order.
*   `onBreakevenCommit`: Handles setting or adjusting a breakeven stop-loss.
*   `onAverageBuyCommit`: Deals with committing a Dollar-Cost Averaging (DCA) buy order.

## Interface IBreakevenData

This interface, `IBreakevenData`, is a simple way to save information about whether a trading signal has reached its breakeven point. Think of it as a snapshot used to store this key piece of data, especially when you need to save and reload your backtesting progress. It primarily contains a single, straightforward boolean value indicating if the breakeven has been achieved. This data is designed to be easily stored and retrieved, even when converting data for JSON serialization.

## Interface IBreakevenCommitRow

This interface represents a single action taken during a breakeven process within the backtest. It signifies that a breakeven commitment was made.

Each instance contains the `action` type, which will always be "breakeven", and the `currentPrice` - this is the price at the time the breakeven was triggered. Think of it as the price snapshot when the system decided to adjust to reach breakeven.

## Interface IBreakeven

The breakeven tracking interface helps monitor and manage signals, specifically when a stop-loss order should be adjusted to the entry price. It's used by both the client-side breakeven component and the service that connects to it.

The `check` method is what actually determines if the breakeven point should be triggered. It evaluates if the price has moved sufficiently to cover any trading fees and if the stop-loss can then be moved back to the original entry price. This happens while the signal is active.

The `clear` method handles cleanup when a signal is finished, whether it's reached a take profit, stop loss, or expired. This ensures the breakeven state is removed and any associated memory is cleaned up, ensuring efficient resource management.

## Interface IBidData

This interface defines the structure of a single bid or ask found within an order book. It holds the price at which a trade could potentially occur, represented as a string, and the quantity of assets available at that price, also represented as a string. Essentially, it's a snapshot of one level of buying or selling interest.


## Interface IAverageBuyCommitRow

This interface describes a single step in a queued average-buy, or DCA, process. Each step represents a purchase at a specific price and cost. The `action` property identifies it as an average-buy action, while `currentPrice` tells you the price at which the purchase was made. `cost` represents the USD amount spent for that particular purchase, and `totalEntries` keeps track of the running total of purchases made in the DCA series.

## Interface IAggregatedTradeData

IAggregatedTradeData provides information about a single trade that happened. Think of it as a record of one transaction, containing key details like the price, the amount traded, and when it took place. It also tells you whether the buyer or seller initiated the trade, which can be helpful for understanding trade direction. Each trade has a unique ID, allowing for precise tracking and analysis during backtesting or detailed performance reviews.

## Interface IActivateScheduledCommitRow

This interface represents a queued action to activate a scheduled commit within the backtest-kit framework. Think of it as a message saying, "Hey, we need to run a scheduled commit, and here's the information about it."  Specifically, it tells the system that the action being performed is an "activate-scheduled" operation. It includes the ID of the signal involved in the activation, and optionally an activation ID if the activation was triggered manually. This structure helps coordinate the execution of scheduled tasks in a reliable and controlled manner.

## Interface IActionStrategy

This interface, `IActionStrategy`, gives your trading actions a way to peek at the current state of signals without directly accessing all the underlying data. Think of it as a safe way to check if a signal is active or scheduled before deciding whether to take a particular action.

Specifically, it allows actions to determine if there's an open position (a pending signal) or a signal that's waiting to happen.

There are two key methods: `hasPendingSignal` checks for open positions, while `hasScheduledSignal` checks for signals that are waiting to be triggered. Both methods tell you if a signal exists for a specific symbol, considering whether you're running a backtest and providing context about the strategy, exchange, and timeframe involved.

## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy with your own custom functions that react to events. Think of it as a way to plug in extra functionality, like sending notifications when a trade happens or tracking performance metrics.

You define these custom functions using the `IActionSchema`, giving them a unique name and providing a way to connect them to specific events within the strategy. 

The `handler` property determines how these functions are created and run, and `callbacks` let you control when they execute, such as when the strategy starts or ends. You can use this for things like logging trades, integrating with state management libraries (like Redux), or sending real-time alerts. It’s essentially how you make a trading strategy truly your own, tailored to your specific needs.

## Interface IActionParams

This interface, `IActionParams`, is like a package of important information passed to each action within your trading strategy. Think of it as a set of tools and context needed for the action to function correctly. 

It includes a `logger` to help you track what your action is doing and catch any problems. You'll also find details about the strategy and timeframe the action is part of, like the `strategyName` and `frameName`.

Crucially, it tells you whether you're running a live trade or a simulation (`backtest`).

Finally, the `strategy` object gives you a window into the current state of your strategy, including the signals and positions it’s managing.

## Interface IActionCallbacks

This interface lets you hook into the lifecycle and key events of your trading actions. Think of it as a way to add custom logic at specific moments – like when an action starts, finishes, or reacts to market signals. You can use these callbacks to manage resources like database connections, log important events, or even influence trading decisions. 

Initialization and cleanup (`onInit`, `onDispose`) allow you to set up and tear down resources connected to your actions.  Signal-related callbacks (`onSignal`, `onSignalLive`, `onSignalBacktest`) notify you when the strategy generates a signal, distinguished by whether it’s happening during live trading or a backtest. There are also callbacks for specific events like reaching breakeven points (`onBreakevenAvailable`), partial profit/loss levels (`onPartialProfitAvailable`, `onPartialLossAvailable`), or when risk management rejects a signal (`onRiskRejection`). You can even receive notifications about scheduled pings for pending signals (`onPingScheduled`, `onPingActive`). Finally, `onSignalSync` provides a unique opportunity to intercept and potentially reject synchronous order placement attempts. These callbacks are all optional and can be implemented synchronously or asynchronously.

## Interface IAction

This interface, `IAction`, is your central point for connecting your custom logic to the trading framework's events. Think of it as a way to plug in your own systems to react to what's happening in the trading process, whether it's a backtest or a live trade.

You can use it to do things like update a Redux store, log events, or send data to a dashboard.

The `signal` method is the most common – it's triggered every time a strategy evaluates, regardless of whether it's live or a backtest. There are also specific methods like `signalLive` and `signalBacktest` to handle events only in live or backtest modes respectively.

Beyond just signals, there are methods for things like breakeven adjustments, partial profit/loss events, scheduled ping notifications, and risk rejections. If the framework tries to execute a trade via a limit order, the `signalSync` method lets you control whether that trade happens—you can even reject it and the system will try again. Finally, the `dispose` method is important for cleanup; use it to release resources and unsubscribe when the connection is no longer needed.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a backtest. It keeps track of all the individual events that contributed to those profits, stored in a list called `eventList`, with the most recent events appearing first. Alongside this list, it also provides the total number of events that were recorded as part of the highest profit analysis. This lets you easily examine the sequence and quantity of profitable occurrences.

## Interface HighestProfitEvent

This object represents the single biggest profit achieved during a trading simulation or live trade. 

It holds all the important details about that peak profit moment. You'll find information like the exact time it happened, the trading pair involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade.

It also includes details such as whether the position was a long or short one, the unrealized profit and loss at that point, the price at which the profit was achieved, and the stop-loss and take-profit prices that were set for the trade.  Finally, it indicates if this event happened during a backtesting simulation.

## Interface HighestProfitContract

This interface provides information when a trading strategy hits a new high-profit mark. It gives you details like the trading symbol, the current price, and the exact time this happened. You'll also see which strategy, exchange, and timeframe are involved, alongside the signal data that triggered the trade. Importantly, a flag tells you whether this update came from a simulated backtest or live trading, allowing you to handle each scenario differently – perhaps setting a trailing stop or taking a partial profit.

## Interface HeatmapStatisticsModel

This structure holds overall statistics for your entire portfolio, giving you a high-level view of its performance. It breaks down the aggregated data for all the symbols you're tracking.

You'll find a list of statistics for each individual symbol, alongside key metrics like the total number of symbols in your portfolio.

It also summarizes important portfolio-level figures, such as the total profit and loss, Sharpe Ratio, and total number of trades executed. Finally, it provides insights into typical peak and fall profit and loss values, weighted by the number of trades made for each symbol.

## Interface DoneContract

This interface describes what you get when a background process finishes, whether it's a backtest or a live trade. It gives you key information about the completed run, like which exchange was used, the name of the trading strategy, and whether it was a backtest or a live execution. You'll find details like the trading symbol involved too, making it easy to understand what just happened.

## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable problem within the system that needs to halt operations. It's essentially a "stop everything" alert because the error is critical. Each notification has a unique ID and includes a detailed error message designed for human understanding. The notification also carries the complete error details, including the call stack and any relevant data, which is helpful for diagnosing the root cause. Importantly, these critical errors always originate from the live trading environment, not from a backtesting scenario.

## Interface ColumnModel

This defines how your data will look when displayed in a table. Think of it as a blueprint for each column, telling the system exactly what information to show and how to present it. Each column gets a unique identifier (`key`) and a user-friendly name (`label`).  The `format` function lets you transform your raw data into a readable string – perfect for customizing the display. Finally, `isVisible` allows you to conditionally hide columns based on certain conditions.

## Interface ClosePendingCommitNotification

This notification appears when a pending trade signal is closed before it's fully activated. Think of it as a signal that was created but then canceled or adjusted before a position was opened.

The notification includes a unique identifier and a timestamp indicating when the closure was committed. You'll also find details about whether this happened during a backtest or live trading, and key information like the symbol being traded (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange used.

It provides a wealth of data about the signal itself, including a unique signal ID, the reason for the closure (if provided), and details on how many DCA entries or partial closes were involved. Critically, it also includes profitability metrics like PNL (profit and loss) in USD, percentage, entry price, and exit price, all adjusted for slippage and fees. Finally, there’s an optional note to provide more context about the signal's closure.

## Interface ClosePendingCommit

This signal tells the backtest kit to finalize and close out a pending order. It's used when you want to explicitly manage how a pending order is handled, perhaps due to a specific trading strategy or market condition. You can optionally provide a `closeId` to help you track why the order was closed, like a reason or tag for your records. The signal also includes the current Profit and Loss (PNL) associated with the pending order at the time of closure, providing a snapshot of its performance.

## Interface CancelScheduledCommitNotification

This notification lets you know a scheduled trading signal has been cancelled before it was actually executed. It's particularly useful when you're testing strategies or have automated processes that might need to adjust signals.

The notification includes a lot of detailed information: a unique ID, when the cancellation happened, whether it occurred during a backtest or live trading, and the specifics of the signal itself, like the trading pair, strategy name, and the exchange involved. You'll also find a unique signal identifier, a cancellation identifier (helpful if you want to track *why* something was canceled), and details about any averaging or partial closing strategies that were involved.

Crucially, the notification provides financial information, including the potential profit/loss (PNL), effective entry and exit prices, and total invested capital.  Finally, a note field allows for a human-readable explanation of why the signal was canceled.  The creation timestamp also provides a record of when the notification itself was generated.

## Interface CancelScheduledCommit

This interface lets you cancel a previously scheduled signal event. Think of it as a way to undo a future action you've planned for your trading strategy.

You’ll specify that you’re cancelling a scheduled event by setting the `action` property to "cancel-scheduled".  

To help you track why you're canceling, you can add an optional `cancelId` – a short description or identifier. 

Finally, `pnl` provides the unrealized profit and loss at the time of the cancellation, which can be useful for reconciliation and understanding the impact of the change.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events, which are points where a trade’s losses are recouped. Think of it as a record of how often your trades have reached that crucial recovery point.

The `eventList` property contains a detailed history of each individual breakeven event encountered.  You’ll find all the specifics for each time your trade hit that breakeven mark.

The `totalEvents` property simply tells you how many breakeven events have occurred overall, giving you a quick count of these milestones.

## Interface BreakevenEvent

This data structure holds all the key information about when a trade reaches its breakeven point. It's designed to simplify generating reports and understanding trade performance. You’ll find details like the exact time it happened, the trading pair involved, the strategy used, and the unique identifier of the signal that triggered the trade.

It also includes information about the trade itself – the entry price, target take profit and stop loss levels, and even the original prices set when the signal was initially created. If the trade involved a dollar-cost averaging (DCA) strategy, you'll see information on the number of entries and partial closes. Finally, you'll get an overview of the unrealized profit and loss, plus a short explanation about why the signal was created and when the trade became active and scheduled. The data also indicates whether the trade happened during a backtest or in live trading conditions.

## Interface BreakevenContract

This interface describes what happens when a trading signal's stop-loss is adjusted to the entry price, a milestone signifying reduced risk. It’s a notification that the price has moved favorably enough to cover the initial transaction costs.

Think of it as a checkpoint – it tells you the signal reached a point where it's no longer at risk of immediate loss.

The notification includes details like the trading pair (symbol), the name of the strategy that generated the signal, the exchange used, and the frame it's running on. You'll also get the complete signal data from when the trade was initiated and the current price at the time of this breakeven event.  Finally, it indicates whether this event occurred during a backtest (historical data) or live trading. This helps differentiate between simulated and real-world performance.

## Interface BreakevenCommitNotification

This notification lets you know when a trade has reached its breakeven point and the system has taken action. It's a signal that a trade is essentially back to where it started, and the system is managing it according to its rules.

The notification provides a wealth of details about the trade. You'll see a unique ID for the notification itself, the exact time it happened, and whether it's happening in a backtest or live trading environment. Crucially, it includes the symbol being traded, the strategy that generated the signal, and the exchange used.

You'll find information about the trade’s initial entry price, take profit, stop loss levels—both the original and the adjusted values if trailing was used—and the total number of entries and partial closes executed. The notification also includes a snapshot of the trade's performance including P&L, percentage gain/loss, and price points for calculations. Finally, there are timestamps related to the creation and pending states of the trade, along with an optional note for a human-readable explanation of the trade’s reasoning.

## Interface BreakevenCommit

The `BreakevenCommit` represents a specific event within a trading strategy – when a position's stop-loss is adjusted to be even with the entry price. This typically happens to protect profits and limit potential losses.

It contains detailed information about the situation at the time of this adjustment, including the current market price, the unrealized profit and loss (PNL), and whether the position is a long (buy) or short (sell) trade. You'll find the original and adjusted take profit and stop-loss prices, as well as the entry price used when the position was initially opened.

Finally, timestamps indicate when the signal to create the position was generated and when the position actually became active. These details allow you to understand the specific circumstances surrounding the breakeven adjustment.

## Interface BreakevenAvailableNotification

This notification signals that your trading position's stop-loss can now be adjusted to break even – essentially, protecting the initial investment. It's triggered when market conditions allow the stop-loss to reach the entry price.

The notification includes a unique identifier, the exact time it occurred, and whether it's happening in a backtest or live trading environment. You'll also find details like the trading pair, the strategy that generated the signal, and the exchange used.

It provides a snapshot of the position's key parameters at that moment, including the current price, the original entry price, and the current take profit and stop-loss levels. You'll see details on any DCA averaging applied (the number of entries and partials) and the current profit and loss data, including P&L in both USD and percentage terms. Finally, there are timestamps related to the signal's creation and pending status, along with a potentially descriptive note explaining the signal.

## Interface BacktestStatisticsModel

This model holds all the key statistical results generated from a backtest. It gives you a complete picture of how your trading strategy performed.

You'll find a detailed list of every trade that was closed, along with the total number of trades executed. The model tracks how many trades were profitable and how many resulted in losses.

Several metrics indicate overall performance: the win rate (percentage of profitable trades), the average profit per trade, and the cumulative profit across all trades. It also provides metrics to gauge risk, like the standard deviation and the Sharpe Ratio, which helps assess risk-adjusted returns. The annualized Sharpe Ratio provides a yearly equivalent for better comparison with other investments.

Further analysis includes the certainty ratio indicating the ratio of average winning trade to average losing trade, expected yearly returns, and metrics related to drawdown, which includes average peak PNL and average fall PNL to give a detailed picture of potential gains and losses. Keep in mind that all numeric values are set to null if they're unreliable due to calculations resulting in problematic values.

## Interface AverageBuyCommitNotification

This notification provides details when a new averaging (DCA) buy order is executed within a trading position. It's a signal that a part of your strategy's plan is being carried out to accumulate an asset over time.

The notification includes a unique identifier, timestamp, and flags to indicate whether it originates from a backtest or a live trading environment. It specifies the trading symbol, the name of the strategy involved, and the exchange where the trade occurred.

You'll find key price information like the execution price, cost of the averaging order, and the overall average entry price after this purchase. The notification also tracks the total number of DCA entries made so far and any partial closing orders that have been executed.

Furthermore, it offers details about the trade's direction (long or short), original entry price, and any adjustments made to the take profit and stop-loss levels. You’ll also receive profit and loss (PNL) information related to the trade, including the entry and exit prices used in the calculation, plus the total capital invested. Finally, a note field allows for a human-readable explanation of the trade’s reasoning, and timestamps detail when the signal was created, pending, and the notification itself was generated.

## Interface AverageBuyCommit

This event signifies a new averaging purchase has been made within a trading position, commonly known as a DCA (Dollar-Cost Averaging) strategy. It's triggered when the backtest kit adds a new averaging entry to an existing long or short position.

The event includes details like the current price at which the averaging buy occurred and the total cost of that specific purchase. You'll also find the effective, or averaged, entry price after the new purchase is factored in, which represents the new average price for the position. 

The event provides the unrealized profit and loss (PNL) calculation considering the newly added average buy, the initial entry price, and the current price of the asset. It also contains information on the take profit and stop loss prices, both their current effective values and their original, pre-trailing values. Finally, it gives you the timestamps when the signal was generated and the position was activated.

## Interface ActivePingContract

This interface, `ActivePingContract`, provides a way to track the ongoing status of pending signals during active monitoring. Think of it as a regular heartbeat indicating a signal is still open and being watched. You'll receive these "ping" events roughly every minute while a pending signal remains active.

Each ping includes important details like the trading symbol (e.g., BTCUSDT), the strategy responsible for monitoring it, the exchange involved, and all the underlying data associated with the pending signal itself. The current price is also provided, which you can use to build custom logic, like automatically closing a signal if the price deviates too much from where it was initially opened.

Finally, the ping will tell you whether it's coming from a historical backtest or live trading environment, and the exact timestamp of the ping. This allows you to react to these events and create your own dynamic management systems for signals.

## Interface ActivateScheduledCommitNotification

This notification tells you when a scheduled trading signal has been activated, meaning a trade has begun based on a pre-defined strategy. It’s triggered when a signal is manually activated, bypassing the usual price condition.

The notification contains a wealth of information about the trade. You'll see details like a unique identifier for the notification itself, the timestamp of when it was activated, and whether it occurred during a backtest or live trading.

It provides specifics about the trade itself, including the trading pair (like BTCUSDT), the strategy that generated the signal, the exchange used, and the trade direction (long or short). Crucially, it includes the entry price and any take profit or stop-loss levels that were set.

You'll also find data regarding DCA (Dollar Cost Averaging) if it was used, including the number of entries and partial closes.  Profit and loss (PNL) information is included, both in absolute USD values and as a percentage, along with the prices used in those calculations.

Finally, the notification will also detail the signal's creation and pending times, the current market price at the time of activation, and any notes that might explain the reason for the signal. All this data allows for a comprehensive understanding of why and how a trade was executed.

## Interface ActivateScheduledCommit

This interface describes an event that occurs when a previously scheduled trading signal is activated. It contains all the details about the trade being initiated, including whether it's a long or short position, the entry price, and the initial take profit and stop loss levels.  You'll also find information about the price at the time of activation, the current profit and loss, and the timestamp of when the signal was originally created and when the position is now being activated. The `activateId` allows for a custom reason to be attached to the activation, potentially useful for tracking or debugging purposes. The original take profit and stop loss prices, before any adjustments like trailing, are also included for reference.
