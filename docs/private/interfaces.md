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

This interface defines the information shared when a walker needs to be stopped. It’s used when you want to pause a specific trading strategy within a larger automated system. 

The message includes the trading symbol, the name of the strategy being stopped, and the name of the walker that initiated the stop request. This is important because you might have several walkers running different strategies on the same symbol, and you need to be able to target the exact one you want to interrupt. Think of it as a precise way to tell a specific process "pause!" within your automated trading environment.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to organize and understand the results of your backtesting experiments. Think of it as a container holding all the data from multiple strategies you've tested. 

Specifically, it includes a list of `strategyResults`, where each entry represents the performance of a single strategy, giving you everything you need to compare and analyze them side-by-side. This is particularly helpful when you want to see how different trading approaches stack up against each other.


## Interface WalkerContract

The WalkerContract lets you track the progress of a backtesting comparison. It sends updates as each strategy finishes its test run, giving you a snapshot of where things stand.

You'll find details like the strategy's name, the exchange and symbol being tested, and the key performance statistics calculated during the backtest.

The contract also highlights the metric the system is trying to improve, along with the current best value seen and the strategy that achieved it. 

Finally, it tells you how many strategies have been evaluated and how many remain, allowing you to gauge the remaining time to completion of the entire process.

## Interface WalkerCompleteContract

This interface represents the culmination of a backtesting process, signaling that all strategies have been evaluated and a comprehensive set of results is ready. It bundles together key details about the backtest, including the name of the walker that ran the tests, the trading symbol being analyzed, and the exchange and timeframe used.

You’ll find information about the optimization metric, the total number of strategies tested, and importantly, the name of the best-performing strategy. Along with the strategy’s name, you'll get its best metric value and detailed statistics about its performance. This single object provides a complete picture of the backtest results and identifies the top performer.

## Interface ValidationErrorNotification

This notification lets you know when a risk validation check has failed. It's essentially a signal that something went wrong during the validation process. 

Each notification has a unique identifier (`id`) so you can track it if needed. 

The notification includes a detailed error message (`message`) to help you understand what went wrong.  You'll also find technical details about the error including a stack trace, contained within the `error` property. 

It’s important to note that the `backtest` property will always be false because these validation errors originate from the live trading environment, not a backtesting simulation.


## Interface ValidateArgs

This interface, ValidateArgs, provides a standardized way to make sure the names you're using for different parts of your backtesting setup are valid. Think of it as a checklist to prevent errors.

It outlines properties like ExchangeName, FrameName, StrategyName, RiskName, ActionName, SizingName, and WalkerName. 

Each of these properties expects an enum – essentially a defined list of acceptable names.  The backtest-kit uses this to confirm that the names you've chosen for your exchange, timeframe, strategy, risk profile, action, sizing, and parameter sweep are actually recognized within the system. This helps catch typos or incorrect references early on.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It’s essentially confirmation that your trailing stop-loss has hit its take profit level.

The `type` field confirms this is a trailing take commit notification. Each notification has a unique `id` and a `timestamp` indicating when it happened. You’ll also see whether this occurred during a `backtest` or in live trading.

The notification provides details about the trade, including the `symbol` (like BTCUSDT), the `strategyName` that triggered it, and the `exchangeName` used.  It also includes a `signalId` for tracking purposes.

You'll find details about how the trailing stop adjusted, like the `percentShift` from the original take profit price.  The current market `price` at execution, the `position` (long or short), and original prices (`priceOpen`, `priceTakeProfit`, `priceStopLoss`) are also included.

Beyond the basics, you get a comprehensive performance breakdown.  This includes information about DCA averaging through `totalEntries` and `totalPartials`, as well as the total profit and loss (`pnl`), `peakProfit`, and `maxDrawdown`.  You'll see these metrics as both absolute values and percentages.

There's a `note` field for any special information about the signal, and timestamps for when the signal was scheduled, went pending, and when this notification was created.

## Interface TrailingTakeCommit

This interface describes an event triggered when a trailing take profit mechanism adjusts a trade's take profit level. 

It provides detailed information about the adjustment, including the percentage shift applied and the current market price at the time. You'll find data related to the trade's performance, such as its total profit and loss (pnl), the highest profit achieved (peakProfit), and the maximum drawdown experienced. 

The event also specifies the trade's direction (long or short), its initial entry price, and the original and adjusted take profit and stop-loss prices. Finally, it includes timestamps indicating when the event was scheduled and when the position was activated. This data allows you to understand how your trailing take profit strategy is impacting your trades.

## Interface TrailingStopCommitNotification

This notification lets you know a trailing stop order has been triggered. It provides a wealth of detail about the trade that just happened, whether it's part of a backtest or live trading. You'll find key information like the unique ID of the trade, when it occurred, and whether it was a long or short position.

The notification also breaks down the price points involved, from the original entry price to the adjusted stop-loss and take-profit levels. 

Crucially, it includes comprehensive profit and loss (PNL) data, detailing the total PNL, peak profit, maximum drawdown, and all the relevant prices and costs associated with the trade.  You'll also see how many entries and partial closes were involved in the trade, and even find details like the scheduled and pending timestamps. Finally, an optional note field can provide extra context for why the signal was generated.

## Interface TrailingStopCommit

This object represents a trailing stop event that occurred during a trade. It provides a snapshot of the position's state when the trailing stop mechanism adjusted the stop-loss price. 

You’ll find details like the direction of the trade (long or short), the original entry price, and the effective take profit and stop-loss prices, which might have been altered by the trailing stop. It also includes information about the position’s performance, like its current profit and loss (pnl), the highest profit achieved (peakProfit), and the maximum drawdown experienced. 

Crucially, you can see the original, untouched take profit and stop-loss prices before any trailing adjustments were applied.  Timestamps show when the signal was generated and when the position became active. The `percentShift` property reveals the percentage used to adjust the stop-loss.

## Interface TickEvent

This describes the `TickEvent` object, which is a standardized way to represent different kinds of events happening within a trading system. Think of it as a single data structure that holds all the relevant information, no matter if a trade was opened, closed, scheduled, or canceled.

The `TickEvent` contains details like the event's timestamp, the type of action that occurred (like 'opened', 'closed', or 'scheduled'), and key data related to the trade, such as the symbol, signal ID, position type, and price levels (take profit, stop loss). It also tracks information important for averaging strategies like total entries and partial executions.

For active positions, you'll find progress indicators like percentage towards take profit and stop loss, and profit/loss details. When a trade closes, you'll get information about the close reason and duration.  If a signal was scheduled, you have the original entry price and associated notes. Finally, it provides information on peak and fall PNL during the position's lifetime for analysis.

## Interface SyncStatisticsModel

This model helps you understand how often signals are being opened and closed during a backtest. It essentially tracks the lifecycle of signals.

You’ll find a complete list of all the sync events, including detailed information about each one, stored within the `eventList` property. 

The `totalEvents` property simply tells you the overall number of sync events recorded.

If you're interested in specifically how often signals are initiated, the `openCount` property gives you that number. Similarly, `closeCount` shows you how many signals are being closed.

## Interface SyncEvent

This data structure holds all the key details about events that happen during a trading signal's lifecycle, designed to be easily understandable when generating reports. Think of it as a comprehensive record of what's happening with a trade.

It includes information like when the event occurred (timestamp), which asset was involved (symbol), the name of the strategy and exchange used, and if it's a live or historical simulation (frameName). 

You'll find a unique ID for each signal (signalId), the type of action taken (action), and details about the price at that moment (currentPrice) and the direction of the trade (position).

For orders, it tracks entry, take profit, and stop-loss prices, both as initially set and as they were adjusted.  If the signal uses averaging or partial closes, the data shows the number of entries and partials. 

Profit and loss information (pnl), the highest profit achieved (peakProfit), and the largest loss encountered (maxDrawdown) are also included. If a signal is closed, the reason for closure is also provided. This structure also denotes if it's from a backtest and the creation date of the event.

## Interface StrategyStatisticsModel

This model holds a collection of statistics gathered during a strategy's execution, giving you insight into its behavior. It contains a detailed list of every event that occurred, along with the total count of all events.

You'll also find counts for specific types of events like canceled or pending orders, and partial profit or loss adjustments. 

It tracks trailing stop and take events, along with breakeven actions. Finally, the statistics include counts for scheduled activations and average buy (dollar-cost averaging) events.

## Interface StrategyEvent

The StrategyEvent object is designed to hold all the key information about actions taken by a trading strategy, making it easy to generate reports and understand what's happening. It includes details like when the event occurred (timestamp), which asset was involved (symbol), the strategy and exchange used, and whether it was part of a backtest or live trading.

You'll find information about specific signals, like their IDs, and the type of action that was executed – whether it was a buy, sell, or some other management action. The event also records the current market price at the time of the action and any percentages used for profit/loss targets or trailing stops.

For actions that involve scheduling or canceling, there are IDs associated with them. You can also track details of open positions, including entry and stop-loss prices, and even prices adjusted by trailing strategies. If the strategy uses dollar-cost averaging, you'll see details about the number of entries and their averaged price. Finally, the object captures profit and loss data, and notes from any associated commits, giving you a complete picture of each trading event.

## Interface SignalSyncOpenNotification

This notification tells you when a pre-planned trade (a limit order) has actually been triggered and a position has been opened. It provides a wealth of details about the trade, including a unique identifier, the exact time it happened, and whether it occurred during backtesting or live trading. You'll find the trading pair, the strategy that initiated the signal, and the exchange where the trade took place, alongside vital performance metrics like profit and loss, peak profit achieved, and maximum drawdown experienced by the position so far.

The notification also breaks down key pricing information, such as the entry price, take profit, and stop-loss levels, and provides details about any averaging or partial closures that may have occurred. Finally, you’ll see timestamps for when the signal was initially created and when the position went live, as well as an optional description explaining the reasoning behind the trade.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was a take profit, a stop loss, timed out, or manually closed. It provides a wealth of information about the trade's performance, including the unique identifier of the signal, the timestamp of when it closed, and whether it was a backtest or a live trade.

You'll find details about the trading pair, the strategy that generated the signal, and the exchange used. Crucially, it provides key performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown, along with their corresponding entry and exit prices and percentage values. 

The notification also includes information on entry prices, stop-loss levels, and the number of entries and partial closes.  Finally, you'll see when the signal was originally scheduled and when the position was activated, along with the reason for the closure and any optional notes. This comprehensive data allows for detailed analysis and a full understanding of each closed signal's journey.

## Interface SignalSyncBase

This interface defines the common information shared across all signal synchronization events within the backtest-kit framework. Every signal-related event, whether it’s from a backtest or live trading, will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange involved. 

You'll also find the timeframe being used, a flag to indicate if the data is from a backtest versus live trading, a unique identifier for the signal itself, and a timestamp marking when the signal was generated or the related tick occurred. Finally, a complete record of the public signal data is included with each event, giving you all the relevant signal details at the time of the synchronization.

## Interface SignalScheduledNotification

This notification tells you when a trading signal has been planned for future execution. It’s like a heads-up that a trade is going to happen, but not right now.

Each notification has a unique ID and a timestamp indicating when the signal was scheduled. It tells you if the signal originated from a backtest or a live trading environment.

The notification provides detailed information about the trade itself, including the symbol being traded, the strategy that generated the signal, and the exchange where the trade will be executed. You'll see the intended trade direction (long or short), along with the planned entry price, take profit levels, and stop-loss levels.

It includes details on DCA averaging (how many entries are planned), partial closing strategies, and the total cost of the planned position. Crucially, it also includes performance metrics related to the potential trade, such as profit/loss (pnl), peak profit, and maximum drawdown.

Finally, you'll find information related to the signal’s scheduling – when it was scheduled, the current market price at the time, and any optional notes explaining the reasoning behind the signal. There's also a timestamp indicating when the notification itself was created.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It's fired whenever a trading position is initiated, whether in a backtest or live trading environment.  The notification includes a lot of details about the trade, like a unique ID and timestamp of when it started.

You'll find information about the trading pair (symbol), the strategy that generated the signal, and the exchange used. It also provides specifics about the trade itself - like the direction (long or short), entry price, take profit and stop-loss levels, and details related to DCA averaging if used. 

The notification provides extensive performance data, like peak profit, maximum drawdown, and profit/loss calculations, including how those figures relate to entry and exit prices.  Finally, there's a field for an optional note explaining the signal's reasoning, and timestamps marking the signal's creation, pending status, and the time the data was recorded.

## Interface SignalOpenContract

This event tells you when a pre-planned trade signal, like a limit order, has been activated because the exchange confirmed the order fill. Think of it as a notification that your order to buy or sell at a specific price has been executed.

This is particularly useful if you're connecting your trading system to external tools, such as order management systems or logging services. It confirms that a trade has happened on the exchange.

During backtesting, this event triggers based on price movements – a low price for long positions or a high price for short positions. In live trading, it’s triggered when the exchange confirms the order.

The event provides a wealth of information about the trade, including the price at which the order was filled, the trade direction (long or short), the overall profit and loss (PNL) for the position, and details about any take profit and stop-loss orders. You’ll also find information about how many times the position was averaged down (or up) using DCA and how many times the position was partially closed. It also includes timestamps of when the signal was initially created and when the position started.

## Interface SignalInfoNotification

This notification type is how strategies communicate informational messages about open positions, letting you know about events as they happen. It's like a strategy sharing a quick update – maybe explaining a specific decision or highlighting a key factor influencing the trade.

Each notification includes details like the strategy's name, the trading symbol, whether it’s a backtest or live signal, and a unique identifier for tracking. You'll also find important pricing data, the position's direction (long or short), and the take profit/stop loss levels, both as initially set and with any trailing adjustments applied.

Beyond the basics, the notification provides a comprehensive picture of the position's performance, including profit/loss, peak profit, and maximum drawdown, all displayed in both absolute and percentage terms. It breaks down how those numbers are calculated, looking at entry and exit prices. Furthermore, it also contains the number of DCA entries or partial closes. The `note` property lets the strategy provide a custom explanation of the situation.  Finally, timing information – when the signal was scheduled, became pending, and when the notification itself was created – is available for detailed analysis.

## Interface SignalInfoContract

This interface, `SignalInfoContract`, allows strategies to send custom informational messages during trading. Think of it as a way for your strategy to "shout out" important details about its actions.

These messages are triggered when a strategy uses the `commitSignalInfo()` function, and they contain valuable information like the trading symbol, strategy name, and the exchange being used.

You'll find details about the signal itself, like the original entry prices and execution status, along with the current market price and any user-defined notes.

There’s also a unique identifier that you can use to link these messages to external systems, and a flag to specify whether the signal originated from a backtest or live trading.

Finally, each message is timestamped, providing a clear record of when the event occurred – either at the exact time of emission in live mode, or tied to the candle that triggered the event during backtesting.

## Interface SignalData$1

This data structure holds all the key details for a single trading signal that has been closed. Think of it as a record of one completed trade. Each record contains information like which strategy created the signal, a unique ID for that signal, the asset being traded (like BTC/USD), whether it was a long or short position, the profit or loss expressed as a percentage, and a description of why the signal was closed. You'll also find the exact times the signal was opened and closed, recorded as timestamps. Essentially, it's a snapshot of a finished trading signal’s performance. 

It's used to build tables or reports that show how different strategies are performing.


## Interface SignalCommitBase

This describes the core information included in every signal commitment event, whether it's from a backtest or a live trading scenario. Each signal commitment will always contain details like the trading pair's symbol, the name of the strategy that generated the signal, and the exchange used. You'll also find information about the timeframe being used (important for backtesting) and a confirmation of whether the signal originated from a backtest or live environment. 

It also tracks things like a unique signal ID, the exact timestamp, and details related to any dollar-cost averaging (DCA) entries or partial closes that occurred.  The original entry price, the complete signal data at that moment, and a free-text note to explain the signal’s reason are included too. This gives you a complete picture of what happened when a signal was committed.

## Interface SignalClosedNotification

This notification provides detailed information when a trading position is closed, whether it’s due to hitting a take profit or stop loss. It includes a unique ID, the time the position closed, and whether it occurred during a backtest or live trading. You'll find specifics about the trading pair, the strategy used, the direction of the trade (long or short), and the entry and exit prices.

The notification also provides comprehensive performance data, like total profit/loss, peak profit, maximum drawdown, and the number of entries involved. You can see details about slippage and fees, and a breakdown of the position’s history, including original prices, partial closes, and the reason for closure. Additional data gives insight into position timing and creation, which can be valuable for analyzing performance and debugging strategies.

## Interface SignalCloseContract

This event, called `SignalCloseContract`, lets you know when a trading signal has been closed, whether that's because a take profit or stop loss was triggered, time ran out, or a user manually closed it. It’s designed to help external systems stay in sync with the trading process.

Think of it as a notification sent when a trade is finished.

The event provides a wealth of information, including the current market price, the total profit and loss (PNL) for the trade, the highest profit and biggest loss experienced during the trade's lifetime, and the original take profit and stop-loss prices. You'll also find details like the entry price, the trade direction (long or short), and the reason for the close.

It also includes data about the trade's history, such as the timestamps when the signal was created and activated, as well as the number of times the position was averaged or partially closed. This data is invaluable for synchronizing order management systems and keeping audit logs.

## Interface SignalCancelledNotification

This notification type indicates that a scheduled trading signal has been cancelled before it could be executed. It provides a wealth of information about the cancelled signal, helping you understand why it was stopped.

You'll find details like the unique identifier of the signal, the trading pair involved, the strategy that created it, and the exchange it was scheduled on. The notification also includes specifics about the intended trade, such as the direction (long or short), take profit and stop-loss prices, and the initial entry price.

For signals involving DCA (Dollar-Cost Averaging), you'll see details about the number of entries and partial closes.  The reason for cancellation, whether it was due to a timeout, price rejection, or a user action, is also specified.  Crucially, the notification includes timestamps for when the signal was created, scheduled, and ultimately cancelled, along with whether the cancellation was triggered by a user action. This data assists in troubleshooting and refining your trading strategies.

## Interface Signal

The `Signal` object holds key information about a trading signal, representing a single trade idea. It contains the opening price (`priceOpen`) at which the position was initiated.

You can also access the history of entries made for this signal; it's stored in the `_entry` array, providing details like the price, cost, and timestamp of each entry.

Finally, `_partial` tracks partial exits from the position, recording the type (profit or loss), percentage, current price, cost basis, number of shares/contracts closed, and timestamp for each partial exit.

## Interface Signal$2

This `Signal` object represents a trading signal and keeps track of important details about a position.

It includes the `priceOpen`, which tells you the initial price at which the position was opened.

The `_entry` array stores a history of each entry made within the position, noting the price, cost, and when it occurred.

Finally, `_partial` logs any partial exits from the position, indicating whether the exit was for profit or loss, along with the percentage, price, cost basis, entry count, and timestamp.

## Interface Signal$1

This `Signal` object keeps track of a single trading position. 

It stores the price at which you entered the position, represented by `priceOpen`.

You'll also find a history of entries within the `_entry` array, noting the price, cost, and time of each.

Finally, `_partial` logs any partial exits from the position, detailing the type of exit (profit or loss), percentage, current price, cost basis, entry count, and timestamp.

## Interface ScheduledEvent

This data structure holds all the key information about trading events – whether they were scheduled, opened, or cancelled. Think of it as a standardized way to record everything that happens with a trade, making it easier to analyze and report on performance.

Each event includes details like when it occurred, the action taken (opened, scheduled, or cancelled), the trading pair involved, and a unique signal ID. You'll also find the position type, any notes associated with the signal, and the current market price at the time.

For orders that involved entries, take profit, or stop loss levels, the original and current prices are all captured, along with details about any partial closes and a breakdown of DCA entries if applicable. Unrealized profit and loss (PNL) are also included, alongside timestamps for when positions were closed or cancelled, and the reason for cancellation if it occurred. Finally, you'll see when a position became active and the initial scheduling time for the signal.

## Interface ScheduleStatisticsModel

This model holds a collection of statistics related to signals scheduled for later execution. It's designed to help you understand how effectively your scheduled signals are performing.

You'll find details about every scheduled event, including when it was created, opened, or cancelled. 

Key metrics include the total number of signals scheduled, those that were opened (activated), and those that were cancelled. 

The model also provides important ratios like the cancellation rate (how often signals are cancelled) and the activation rate (how often they are opened), both expressed as percentages. Finally, you can track average waiting times for cancelled and opened signals to identify potential bottlenecks.

## Interface SchedulePingContract

The `SchedulePingContract` helps you keep an eye on your active, scheduled trading signals. Think of it as a regular heartbeat from the system while a signal is running – it’s sent every minute.

You can use these pings to monitor the signal's lifecycle and build your own custom checks or actions.

Here's what each ping tells you:

*   The trading symbol, like BTCUSDT.
*   The name of the strategy that’s using the signal.
*   The exchange where the signal is being tracked.
*   All the details of the signal itself (like open price, take profit, stop loss).
*   The current market price at the time of the ping.
*   Whether it's a backtest (historical data) or live trading situation.
*   The exact timestamp of the ping.

This information allows you to react to signal conditions and even potentially cancel signals if needed. You can listen for these pings using `listenSchedulePing()` or `listenSchedulePingOnce()` to implement these checks.

## Interface RiskStatisticsModel

This model holds information about risk events, helping you understand and track your risk management performance. It keeps a list of individual risk events, each containing complete details about what happened. You’ll also find a total count of all risk rejections and breakdowns of those rejections, grouped both by the trading symbol involved and by the specific strategy used. This allows you to identify potential areas of concern within your trading system.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked by your risk management rules. It's like a warning that something your strategy wanted to do couldn't happen due to safety checks.

Each notification has a unique ID and a timestamp to show exactly when the rejection occurred. You'll also see if it happened during a backtest (simulated trading) or live trading.

The notification clearly states which strategy tried to execute the signal, which exchange it was targeting, and importantly, *why* the signal was rejected – a human-readable explanation of the problem.

You can track rejections with a unique ID, and get details like how many positions were already open, the current market price, and details about the signal itself. This includes the intended trade direction (long or short), take profit and stop loss levels, and even the reason the signal was generated. A timestamp indicates when the notification was created.

## Interface RiskEvent

This data structure holds information about situations where a trading signal was blocked due to risk management rules. Think of it as a record of why a trade didn't happen.

Each entry includes details like when the event occurred, the trading pair involved, and the specifics of the signal that was rejected.

You’ll also find the name of the strategy that generated the signal, the exchange it was intended for, the timeframe used, and the current market price at the time.

Furthermore, it notes the number of existing open positions, a unique ID for tracking the rejection, and the specific reason it was blocked, along with whether this was a backtest or live trade scenario. This information is vital for analyzing risk management effectiveness and identifying potential issues.

## Interface RiskContract

The RiskContract represents a rejected trading signal due to risk validation. Think of it as a notification that a trade couldn't happen because it broke a pre-defined risk rule. It's specifically designed to only alert you to actual risk violations, not every single signal.

This contract includes vital details about the rejected signal: the symbol (like BTCUSDT), the signal itself (including order specifics like price levels), the strategy that attempted the trade, the timeframe used, the exchange involved, and the current market price. You'll also find information about the current portfolio exposure, a unique ID for tracking, a human-readable explanation for the rejection, the exact time of the rejection, and whether it happened during a backtest. Services like report generation and user callbacks use this information to monitor and understand risk management activity.

## Interface ProgressWalkerContract

The ProgressWalkerContract lets you keep tabs on how a background process is doing. Think of it as a heartbeat signal from a long-running task, like analyzing many trading strategies.

It tells you which walker, exchange, and frame are currently being worked on, along with the symbol being analyzed.

Crucially, it shows you how much is left to do: the total number of strategies, how many have already been processed, and the overall percentage completed. This allows you to monitor progress and understand when the process is nearing completion.

## Interface ProgressBacktestContract

This contract provides a way to monitor the progress of your backtesting runs. As your backtest executes, you'll receive updates containing key details like the exchange and strategy being used, the trading symbol, and how far along the backtest is. You'll know the total number of historical data points (frames) being analyzed, how many have already been processed, and a percentage indicating how close you are to completion. This allows you to track the backtest’s advancement and estimate its remaining duration.


## Interface PerformanceStatisticsModel

This model holds the combined performance data for a specific trading strategy. It breaks down how a strategy performed, giving you a high-level view of its efficiency and results.

You'll find the strategy's name clearly labeled, along with the total number of performance events that were tracked. The `totalDuration` tells you how long the strategy took to run across all its calculations.

The `metricStats` section organizes performance data by the type of metric being measured, allowing for targeted analysis. Finally, the `events` array contains all the individual, raw performance measurements – the detailed records behind the overall statistics.


## Interface PerformanceContract

The `PerformanceContract` helps you keep an eye on how your trading strategies are performing. It records important details like when an action happened, how long it took to complete, and which strategy, exchange, and symbol were involved.  You can think of it as a series of checkpoints during your backtest or live trading, allowing you to identify slow parts of your code and understand where your strategies are spending their time. The `timestamp` and `previousTimestamp` let you track durations over time, while `strategyName`, `exchangeName`, `frameName`, and `symbol` pinpoint the context of the performance data.  Finally, `backtest` tells you if the data comes from a simulated environment or live trading.

## Interface PartialStatisticsModel

This model holds key statistics related to partial profit and loss events during a backtest. It allows you to analyze the frequency and details of these milestones.

You'll find a comprehensive list of each partial event recorded in the `eventList` property, giving you a detailed view of what happened. The `totalEvents` property simply counts every single profit or loss event that occurred. `totalProfit` tells you how many events resulted in a profit, and `totalLoss` shows you the count of events that resulted in a loss.

## Interface PartialProfitContract

This describes a `PartialProfitContract`, which is a notification about a strategy reaching a specific profit milestone during a trade. Think of it as a progress report on how well a trade is doing.

When a trading strategy hits certain profit levels – like 10%, 20%, or 30% – this contract is sent out. It contains lots of helpful information.

You’ll find details like the trading pair (e.g., BTCUSDT), the name of the strategy being used, and where the trade is happening (exchange and frame). The `data` property gives you access to the original signal details. The current price and level achieved are also included, alongside whether it's a backtest or live trade and the event's timestamp. This helps you track performance and monitor how strategies are executing.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed, whether it's during a backtest or live trading. It provides a wealth of information about the trade, including a unique ID, when it happened, and whether it was part of a backtest. You'll find details like the trading pair, the strategy used, and the exchange involved, along with identifiers for the signal itself.

The notification breaks down the specifics of the partial close, detailing the percentage closed, the current price at the time, and the trade direction. It also gives you the original entry price, take profit, and stop-loss levels, as well as any adjustments made through trailing.

Beyond just the immediate details, you get a comprehensive financial picture of the trade, including total profit and loss (PNL), peak profit, maximum drawdown, and various price points related to these metrics. The notification also tracks details about the trade's history, like the number of DCA entries and partial closes, as well as a note describing the trade’s reasoning. Finally, timestamps detailing when the signal was created, pending, and this notification was generated are available.

## Interface PartialProfitCommit

This event signifies a partial profit-taking action within a trading strategy. It details the specifics of how much of the position is being closed – a percentage determined by the strategy. You'll find the current market price at the time the action occurred, as well as a comprehensive view of the position's profit and loss (both total and peak), and its maximum drawdown.

The event also provides information about the initial position details: whether it was a long (buy) or short (sell) trade, the entry price, and the original and adjusted take profit and stop-loss prices. Timestamps, indicating when the signal was created and the position activated, are also included. Essentially, this event gives a full snapshot of a partial profit-taking maneuver and its associated performance metrics.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has hit a profit milestone, like reaching 10%, 20%, or 30% profit. It's a way to track your strategy's progress and understand when it's achieving partial profit goals. The notification includes a unique ID, a timestamp, and whether it originated from a backtest or live trade. 

You'll find details about the trading pair, the strategy used, and the exchange involved, along with the signal identifier. Critically, it provides information about the entry price, current market price, take profit and stop-loss levels (both original and adjusted), and the number of DCA entries and partial closes executed. 

The notification also provides a comprehensive view of the position's performance, including total profit and loss (both in USD and as a percentage), peak profit and maximum drawdown metrics with their corresponding prices and percentages. Finally, it might include a descriptive note to explain the signal's reasoning, along with timestamps related to the signal’s lifecycle, from scheduling to creation.

## Interface PartialLossContract

The PartialLossContract represents a notification when a trading strategy hits a predefined loss level, like a 10%, 20%, or 30% drawdown. It's used to keep track of how a strategy is performing and when it's approaching stop-loss levels.

You'll see these notifications triggered when a strategy's losses reach specific milestones. These events are only sent once for each loss level per trade, even if prices fluctuate a lot.

The contract includes details like the trading pair (symbol), the name of the strategy generating the signal, the exchange being used, and the specific frame (or live trading environment) where it's happening. You'll also get the original signal data, the current price at the time of the loss, the exact loss level reached, and whether it's from a backtest or live trading. 

A timestamp tells you precisely when the loss level was detected, either based on the live tick time or the historical candle's timestamp during a backtest. This information helps services build reports and allows you to set up custom alerts based on loss levels.

## Interface PartialLossCommitNotification

This notification lets you know when a partial closing of a trading position has happened. It provides a wealth of information about that partial close, including a unique identifier and the exact time it occurred. You’ll find details like whether it was a backtest or live trade, the trading pair involved, the strategy and exchange responsible, and the percentage of the position that was closed.

Beyond the basics, you get a complete picture of the position's history: its entry price, take profit and stop-loss levels (both original and adjusted), the total number of entries and partial closes, and crucial performance metrics like total profit/loss (PNL), peak profit, and maximum drawdown. Detailed price points and costs associated with these metrics are also available. Finally, it includes optional notes to explain the reasoning behind the signal and timestamps for creation, scheduling, and pending status.

## Interface PartialLossCommit

This interface describes a partial loss event that occurs during backtesting. It represents a situation where a portion of a position is closed, rather than the entire position.

The `action` property definitively identifies this event as a partial loss. The `percentToClose` indicates what percentage of the original position size is being closed.

You'll find important price data, like the `currentPrice` at the time of the partial loss, as well as the `priceOpen`—the original entry price. Also included is information about the position itself: whether it was a `long` (buy) or `short` (sell) trade.

Performance metrics are also captured, including the total Profit and Loss (`pnl`) of the closed portion of the position. It tracks the `peakProfit`, `maxDrawdown`, `priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, and `originalPriceStopLoss` for complete context. Finally, `scheduledAt` and `pendingAt` indicate the timestamps of signal creation and position activation.


## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a predefined loss milestone, such as a 10% or 20% drawdown. It provides a wealth of information about the trade, including a unique ID, the exact time it occurred, and whether it's part of a backtest or a live trade.  You'll find details about the trading pair, the strategy that triggered the signal, and the exchange involved.

The notification includes comprehensive details about the position itself: entry and exit prices, stop-loss and take-profit levels (both original and adjusted for trailing), and information about any averaging or partial closing strategies used.

Furthermore, it gives a complete picture of the position's financial performance: profit and loss (both absolute and percentage), peak profit, maximum drawdown, and detailed breakdowns of costs and prices used in those calculations. You can also see the number of entries and partial closes executed. Finally, an optional note field allows for a human-readable explanation of the signal's reasoning, along with timestamps related to signal creation and execution.

## Interface PartialEvent

This data structure represents a specific point in time during a trading strategy's performance, marking a profit or loss milestone. It provides a comprehensive snapshot of what happened – whether it was a profit or loss, the trading pair involved, the strategy and signal IDs used, and the position being held. 

You'll find details about the current market price, the profit/loss level achieved (like 10%, 20%, etc.), and the original entry, take profit, and stop-loss prices set when the trade was initiated. 

If the strategy uses dollar-cost averaging (DCA), information about the number of entries and the original entry price before averaging will be included. It also tracks partial closes, if any were executed. 

Furthermore, the structure holds the unrealized profit and loss (PNL) at that point, a human-readable note explaining the signal’s reasoning, and timestamps detailing when the position became active and when the signal was initially scheduled. Finally, a flag indicates whether the trading activity occurred during a backtest or live trading environment.

## Interface MetricStats

This data structure helps you understand the performance of a specific metric during a backtest. It gathers statistics like the total number of times a metric occurred and how long each instance took. You'll find key measures like the average, minimum, and maximum durations, alongside statistics that show the distribution of those durations, such as the median, standard deviation, and percentiles (95th and 99th). The structure also tracks wait times between events related to the metric, giving you insight into the spacing of those events. Essentially, it’s a complete statistical summary of a single metric's performance over the course of a trading simulation.

## Interface MessageModel

The MessageModel represents a single message within a conversation history used by large language models. Each message has a defined role, like a system instruction, a user's question, or the assistant's response. 

The core of the message is its content, which is the actual text being exchanged. Sometimes, assistant responses will include tool calls, which detail actions taken by tools.  You can also attach images to messages, represented as Blobs, raw bytes, or base64 encoded strings. Finally, if a message is a response to a specific tool call, it will have a unique ID identifying that connection. Reasoning content can also be included to expose the reasoning process behind some providers' answers.

## Interface MaxDrawdownStatisticsModel

This model keeps track of maximum drawdown events during a trading backtest. 

It provides two key pieces of information. 

First, `eventList` holds a chronological record of each drawdown event, starting with the most recent one.  Think of it as a detailed history of how low the portfolio went and when. 

Second, `totalEvents` simply gives you the overall count of all drawdown events that were recorded.

## Interface MaxDrawdownEvent

This data represents a single instance of a maximum drawdown event experienced during a trading simulation or live trade. It provides detailed information about the circumstances surrounding that drawdown. 

You'll find details like the exact time (timestamp) the drawdown occurred, the trading pair involved (symbol), and the name of the strategy or signal that triggered the trade. It also includes the position direction (long or short), the profit and loss (PNL) of the trade, and the highest profit achieved before the drawdown.

Crucially, it specifies the price at which the drawdown occurred (currentPrice), the entry price (priceOpen), and any pre-defined take profit and stop loss levels that were in place. Finally, it indicates whether the event happened during a backtest or a live trading session.

## Interface MaxDrawdownContract

The MaxDrawdownContract provides updates when a new maximum drawdown occurs for a trading position. It's a way for the system to tell you when a position has experienced its biggest loss from a peak value.

This information includes details like the trading symbol, the current price, the time of the update, the strategy and exchange being used, and the timeframe involved. The contract also provides the signal data related to the position and a flag to tell you if this drawdown event happened during a backtest or in live trading.

Essentially, it’s a notification system for risk management—allowing you to react to significant losses in real-time. You can use this data to adjust strategies, tighten stop-loss orders, or implement other risk mitigation techniques.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed breakdown of your live trading performance. It tracks everything from the total number of trades to specific metrics like win rate and average profit.

You'll find a comprehensive list of individual trading events in the `eventList` property, giving you access to all the underlying data. The framework calculates several key statistics, including the number of winning and losing trades, your overall profit, and volatility measures like standard deviation and Sharpe Ratio.

These metrics, such as win rate, average PNL, and Sharpe Ratio, are all expressed as percentages and are marked as potentially unsafe (null) if the calculations are unreliable. This helps you quickly assess the health and consistency of your trading strategy, with higher values generally indicating better performance for most metrics.  You can also analyze trade risk with metrics like `avgPeakPnl` and `avgFallPnl`.

## Interface InfoErrorNotification

This interface defines a notification used when something goes wrong during a background process, but the issue isn't severe enough to halt everything. It's designed to help you understand and potentially address problems without interrupting the core backtest. Each notification has a unique identifier, a clear error message for humans to understand, and details about the underlying error, including a stack trace and other helpful information. Importantly, these notifications signify errors occurring within the live context and are not related to the backtest itself. 


## Interface IdlePingContract

This defines a special event, `IdlePingContract`, that's triggered when a trading strategy isn't actively responding to signals. It's a way to keep track of periods where your strategy is just waiting for opportunities.

The event includes important details like the trading symbol (e.g., BTCUSDT), the name of the strategy that's idle, the exchange it's running on, and the current market price at the time. You’ll also see whether this event came from a live trading session or from a historical backtest simulation.

Finally, a timestamp tells you precisely when the event occurred, either marking the moment of the ping in live mode or the candle's timestamp during backtesting. You can use this information to monitor how often your strategy enters and exits idle periods.


## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest comparison. It provides key details about the strategy itself, like its name, and a set of statistics generated during the backtest.

You'll also find a calculated metric value, which is used to evaluate and compare the strategy against others. Finally, a rank is assigned to each strategy, indicating its relative performance with the highest-performing strategy receiving a rank of 1. 

Essentially, it's a structured way to understand how a particular strategy performed in relation to the others being tested.


## Interface IWalkerSchema

The Walker Schema allows you to set up A/B tests, comparing different trading strategies against each other. It’s how you tell the backtest-kit what strategies to run, what exchange and timeframe to use for all of them, and what metric you'll use to judge their performance. Each walker needs a unique name to identify it.

You can add a note for yourself or other developers to explain the walker’s purpose. 

The `strategies` property is a crucial list of the strategies you want to evaluate—make sure they've already been registered in the system.  

The `metric` determines how the strategies will be ranked; a common choice is "sharpeRatio," but you can customize this. Finally, optional `callbacks` let you hook into various stages of the walker's lifecycle, if needed.

## Interface IWalkerResults

This object holds all the information collected when a trading strategy "walker" has run and compared different approaches. It tells you which financial instrument (the `symbol`) was being tested, and which exchange was used for the trades. You'll also find the name of the specific walker process that performed the tests and the timeframe used for analysis (the `frameName`). Think of it as a complete report card for a single walker execution.

## Interface IWalkerCallbacks

This interface lets you hook into the backtest process and respond to key events. Think of it as a way to get notified about what's happening behind the scenes when comparing different trading strategies.

You can get a notification when a new strategy begins testing, allowing you to log it or prepare for the results. 

When a strategy's testing is finished, you’ll be notified again, along with statistics and a key performance metric to analyze.

If a strategy encounters a problem during its backtest, you’ll receive an error notification—helpful for identifying and debugging issues.

Finally, once all strategies have been tested, you'll be notified with the overall results, giving you a complete picture of the comparison.

## Interface ITrailingTakeCommitRow

This interface represents a single action queued for a trailing take commit strategy. It essentially describes a specific adjustment to be made, likely related to profit-taking or managing risk.

The `action` property confirms that this is a trailing take action.  You'll also find a `percentShift` value, which indicates the percentage change from the initial price to trigger the action. Finally, `currentPrice` holds the price at which the trailing mechanism was initially activated, providing context for the shift.

## Interface ITrailingStopCommitRow

This interface describes a single action that needs to be taken regarding a trailing stop order. Think of it as a record of a specific adjustment that's been queued.

It includes details like the type of action being performed – which is always a "trailing-stop" in this case – and the percentage shift that needs to be applied to the stop price. It also remembers the price at which the trailing stop was originally set. This information is vital for accurately executing the trailing stop logic.

## Interface IStrategyTickResultWaiting

This type, `IStrategyTickResultWaiting`, represents a specific situation in your trading strategy: a signal has been scheduled but is currently waiting for the price to reach a specific entry point. You'll receive this type of result repeatedly as the system monitors the price. 

It provides details about the signal that's waiting, like the signal itself (`signal`), the current price being monitored (`currentPrice`), and important identifiers like the strategy name, exchange, timeframe, and trading symbol. You’ll also find information about potential profit and loss (`pnl`), whether the trade is in backtest mode (`backtest`), and a timestamp for when the event occurred (`createdAt`).  Importantly, the progress towards take profit and stop loss percentages are always zero in this "waiting" state because the position isn’t yet active.

## Interface IStrategyTickResultScheduled

This interface describes a specific event in the trading process: when a strategy generates a signal that's scheduled to be executed later, waiting for the price to reach a certain level. It contains all the details about that signal, including the strategy and exchange that created it, the trading symbol, the timeframe being used, and the current price at the moment the signal was scheduled. The `createdAt` timestamp indicates exactly when this scheduled signal was created, a useful marker for tracking events and debugging. Knowing whether the event occurred during a backtest or live trading is also included for context.

## Interface IStrategyTickResultOpened

This interface describes the information available when a new trading signal is created. It's a notification that a signal has been generated, validated, and stored.

You'll receive this notification after the signal's details are confirmed.

The information includes the signal itself, identified by a newly generated ID, along with important context like the strategy, exchange, time frame, and trading pair involved. You'll also see the price at the moment the signal opened and whether this event originates from a backtest or live trading environment. A timestamp indicates when the signal creation process was completed.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in a state of inactivity – essentially, it's “idle.” It provides information about the context of this idle state, like the strategy's name, the exchange it's connected to, the timeframe being used (like 1-minute or 5-minute candles), and the symbol being traded (e.g., BTCUSDT).

You'll find the current price at the moment of idleness, a flag indicating whether this is a backtest or a live trading situation, and a timestamp marking exactly when this idle state was recorded. The core of this interface signifies that no active trading signal is present, and offers a snapshot of the market conditions during the period of inactivity.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, giving you a complete picture of the outcome. It contains all the important details about the closure, including why it happened – whether it was due to a time limit, a stop-loss, a take-profit, or a manual closure.

You’ll find information like the closing price, the exact time of closure, and a breakdown of the profit and loss, accounting for fees and slippage.  The data also includes the strategy's name, the exchange used, and the timeframe for the trade, offering valuable context for analysis.

Crucially, it identifies whether the trade occurred during a backtest or in live trading. A unique ID is available for manually closed trades, along with a timestamp of when the result was first recorded. Everything you need to understand a closed signal is right here.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, represents a situation where a planned trading signal was cancelled before a trade could actually be executed. Think of it as a signal that was scheduled to trigger, but something happened – perhaps the price moved too far, or a stop-loss was hit – preventing the trade from going through.

It provides detailed information about why and when the signal was cancelled. You’ll find the signal itself, the final price at the time of cancellation, and a timestamp marking the exact moment.

You can also see details such as the strategy and exchange involved, the timeframe being used, and whether the event occurred during a backtest or live trading.  A `reason` property explains the specific cause of the cancellation, and an optional `cancelId` helps track cancellations initiated by a user request. Finally, `createdAt` provides the timestamp of when the result was generated.


## Interface IStrategyTickResultActive

This data represents a trading signal that's currently being actively monitored, awaiting either a take profit (TP), stop loss (SL) trigger, or a time expiration. It holds key details about the situation, including the signal itself, the current price used for monitoring (usually a VWAP), and the name of the strategy, exchange, and timeframe involved.

You’ll also find the symbol of the trading pair (like BTCUSDT), along with progress percentages towards the TP and SL targets.

The `pnl` property provides the current unrealized profit and loss, taking into account fees, slippage, and any partial position closures.

A flag indicates whether this data originates from a backtest or a live trading scenario.  Timestamps are included for tracking when the data was created and when the last candle was processed, useful for synchronization and managing data flow during backtesting.

## Interface IStrategySchema

This interface describes the blueprint for a trading strategy within the backtest-kit framework. Think of it as the instruction manual for how a particular trading approach will behave.

Each strategy needs a unique name to identify it. You can also add a note for yourself or others to explain the strategy's purpose or how it works.

The `interval` property sets a minimum time gap between signal requests, preventing overwhelming the system. 

The core of the strategy is the `getSignal` function – this is where the actual trading logic resides, determining when and what kind of signal to generate based on current data. This function considers price and can even be used for delayed entry based on price thresholds.

For more advanced control, callbacks allow you to define actions that run at key points in the strategy’s lifecycle (like when a trade opens or closes).

You can also assign a risk profile to a strategy, or even multiple profiles, to manage risk exposure. Finally, you can tag strategies with specific actions for easier filtering and management.

## Interface IStrategyResult

The `IStrategyResult` represents a single strategy's performance during a backtest. It bundles together the strategy's name, a comprehensive set of backtest statistics detailing its behavior, and a numerical value reflecting how well it performed based on an optimization metric. This value is used to rank strategies against each other.  It also tracks the timing of the first and last trading signals generated by the strategy, which can be helpful for analyzing its activity within the backtest period. If a strategy didn't produce any signals, these timestamp fields will be null.

## Interface IStrategyPnL

This interface represents the profit and loss (PnL) result for a trading strategy. It gives you a clear picture of how your strategy performed, taking into account real-world factors.

The `pnlPercentage` tells you the percentage change in your investment – a positive number means profit, and a negative number means loss. 

The `priceOpen` and `priceClose` values are the actual prices used for your trades, adjusted to reflect transaction costs like slippage and fees, which are both assumed to be 0.1%.

You'll find the `pnlCost` which is the total profit or loss in dollars.  Finally, `pnlEntries` represents the total amount of money you invested initially.

## Interface IStrategyCallbacks

This interface lets you customize how your trading strategy reacts to different signal events during a backtest or live trading. You can define functions to be triggered when a signal is opened, becomes active, goes idle, is closed, is scheduled for later, or gets cancelled. There are also callbacks for specific conditions like partial profits, partial losses, reaching breakeven, and scheduled or active signal pings, which allow for customized monitoring and adjustments. Each callback receives information like the symbol, signal data, current price, and a flag indicating whether it’s a backtest scenario. This provides fine-grained control over your strategy's behavior and allows for sophisticated logic beyond basic entry and exit rules. The `onWrite` callback is used to interact with the persistent storage for testing purposes.

## Interface IStrategy

This interface, `IStrategy`, defines the essential methods a trading strategy needs to function within the backtest-kit framework.  It’s the core of how strategies interact with the testing environment.

Think of it as a blueprint for how a trading strategy behaves – how it reacts to market ticks, checks for signals, and manages positions.

Here's a breakdown of what each method does:

*   **`tick`**:  This is the heart of the strategy's execution. It’s called for each market update and handles signal generation, checks for take-profit (TP) and stop-loss (SL) triggers.
*   **`getPendingSignal` / `getScheduledSignal`**: These methods retrieve the signal currently controlling the strategy's position, used for monitoring and expiration.
*   **`getBreakeven`**: Determines if the price has moved enough to cover transaction costs, allowing for breakeven to be set.
*   **`getStopped`**: Checks if the strategy is paused.
*   **`getTotalPercentClosed` / `getTotalCostClosed`**:  These methods provide insight into how much of the initial position has already been closed out, especially useful when dealing with partial profits/losses.
*   **`getPositionEffectivePrice`**: This method finds the average entry price for the position, which is crucial for accurate calculations during DCA.
*   **`getPositionInvestedCount` / `getPositionInvestedCost`**:  These expose details about the number of entries and total cost for the position.
*   **`getPositionPnlPercent` / `getPositionPnlCost`**: These calculate the current profit or loss percentage and amount.
*   **`getPositionEntries` / `getPositionPartials`**:  Give a detailed history of the position's entry points and partial closes.
*   **`backtest`**:  This is a fast way to simulate the strategy’s performance using historical data.
*   **`stopStrategy`**:  Pauses the strategy, preventing new signals but allowing existing positions to close.
*   **`cancelScheduled`**: Cancels a scheduled entry without stopping the entire strategy.
*   **`activateScheduled`**:  Forces immediate activation of a scheduled entry.
*   **`closePending`**: Closes an existing position without halting the strategy.
*   **`partialProfit` / `partialLoss` / `validatePartialProfit` / `validatePartialLoss`**: These allow for partial position closures, which can be user-controlled and validated.
*   **`trailingStop` / `validateTrailingStop`**: Implement a trailing stop-loss, dynamically adjusting the stop based on market movement.
*   **`trailingTake` / `validateTrailingTake`**:  Implement a trailing take-profit, moving the profit target as the price moves favorably.
*   **`breakeven` / `validateBreakeven`**: Moves the stop-loss to breakeven when the price reaches a profit threshold.
*   **`averageBuy` / `validateAverageBuy`**: Allows for adding new entries to a position, enabling dollar-cost averaging.
*   **The remaining methods (`hasPendingSignal`, `hasScheduledSignal`, `getPositionEstimateMinutes`, etc.)** provide valuable information about the status of the current position, its performance history, and estimated timeframes.
*   **`dispose`**:  Properly cleans up and releases resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality needed for any storage adapter used within the backtest-kit trading framework. Think of it as a blueprint for how different storage systems (like databases or files) will interact with the backtesting process. 

The methods outline key events the storage needs to react to - when a position is opened, closed, scheduled, or cancelled – allowing the system to record and manage those actions. You’ll also find functions for retrieving signals by their unique identifier or listing all stored signals.

There are also methods for handling "ping" events, which are used to keep track of the status of opened or scheduled signals and update their timestamps. These ensure the system maintains accurate records of ongoing positions.

## Interface IStorageSignalRowScheduled

This interface represents a signal that has been scheduled for execution. 

It indicates that the signal is in a "scheduled" state. 

Essentially, it’s a marker to show that a trading signal is planned and waiting to be put into action.

## Interface IStorageSignalRowOpened

This interface represents a signal's status when it's considered "opened." It essentially confirms that a trading signal has been initiated and is active. The core piece of information here is the `status` property, which is always set to "opened" to clearly indicate the signal's current state. Think of it as a simple way to track when a signal is live and ready for potential trading actions.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade related to that signal has been completed. 

It contains information specifically about the closed signal, including its status, which is confirmed as "closed". 

Most importantly, it includes the `pnl` property, which holds the profit and loss data calculated for that signal at the time of its closure. This data is only available for closed signals, allowing you to analyze the performance of those trades.

## Interface IStorageSignalRowCancelled

This interface defines a signal row that has been cancelled. 

It's quite simple – it tells you the signal's status is "cancelled."  You’ll use this when you need to specifically identify a signal that’s no longer active or valid. It’s a clear marker to distinguish cancelled signals from others.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored, regardless of its specific status. 

It includes essential information like the exact time the signal was created (`createdAt`) and when it was last updated (`updatedAt`). 

Each signal also gets a `priority` value, which determines the order in which it's processed when data is being rewritten. This priority is based on the current time, ensuring signals are handled in a sensible sequence. Think of it as a timestamp used to order signals during storage updates.

## Interface IStateParams

The `IStateParams` interface helps define how your trading signals manage their internal data. Think of it as setting up a container, or "bucket," to organize related pieces of information, like trade details or performance metrics. You specify a `bucketName` to logically group these pieces together.  Then, you provide an `initialValue` – this is the starting point for the signal's data when nothing has been saved yet.

## Interface IStateInstance

This interface outlines how state instances should behave within the backtest-kit framework. Think of it as a blueprint for managing data related to individual trading signals.

It’s particularly useful for strategies that leverage LLMs, allowing you to track key metrics for each trade, like the highest unrealized profit, how long the trade has been open, and any capitulation thresholds. This lets you monitor performance and make decisions based on those metrics.

The state itself is mutable, meaning it can be changed as the trade progresses, and it's designed to be local, persistent, or even dummy-based depending on the needs of your backtest.

Here's a look at the methods provided:

*   `waitForInit`:  This method initializes the state instance, essentially setting it up to receive data.
*   `getState`: Allows you to retrieve the current value of the state – grabbing the information you’ve been tracking.
*   `setState`:  This is how you update the state, either with a new value or a function to modify it.
*   `dispose`:  This ensures any resources used by the state instance are properly released when it's no longer needed, keeping your backtest clean.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a formula for determining optimal bet size. It dictates that you'll be using the Kelly Criterion method for sizing your trades.  You'll also need to specify a `kellyMultiplier`, which controls how aggressively you apply the Kelly Criterion; a lower number, like 0.25, represents a more conservative approach (often called "quarter Kelly"). The multiplier should be a value between 0 and 1.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. 

It's straightforward to use – you just specify the `riskPercentage`, which represents the maximum percentage of your portfolio you're willing to risk on any single trade. For example, a `riskPercentage` of 1 would mean risking 1% of your capital per trade. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.


## Interface ISizingSchemaBase

This interface defines a base structure for sizing schemas used within the backtest-kit framework. 

Each sizing schema needs a unique identifier, `sizingName`, to distinguish it from others. 

You can also add a `note` to provide additional details or context for developers.

The `maxPositionPercentage` dictates the maximum percentage of your account that can be used for a single position, ensuring you don’t over-leverage.  There are also limits on the absolute size of a position with `minPositionSize` and `maxPositionSize`. 

Finally, `callbacks` allow you to hook into different points in the sizing process for custom logic or advanced configurations.

## Interface ISizingSchemaATR

This schema defines a sizing strategy that relies on the Average True Range (ATR) to determine trade size. 

It's designed for situations where you want to manage risk based on the volatility of the asset.

The `riskPercentage` property dictates what portion of your capital you're willing to risk on each trade, expressed as a percentage. 

The `atrMultiplier` then uses the current ATR value to calculate the stop-loss distance, effectively scaling your position size according to volatility. This means more volatile assets will result in smaller positions.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining trade sizes.

It includes a `logger` property, which is used for logging debugging information and tracking the sizing process. This logger allows you to monitor how the Kelly Criterion is being applied and helps in troubleshooting any potential issues.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed for sizing trades when using a fixed percentage approach. It requires a logger to help with debugging and monitoring the backtesting process. The logger allows you to track important events and potential issues during the backtest.


## Interface ISizingParamsATR

This interface, `ISizingParamsATR`, helps you set up how much of your capital you'll use for each trade when using an ATR (Average True Range) based sizing strategy. It’s all about controlling your risk. 

The `logger` property allows you to connect a logging service. This is helpful for debugging and monitoring your trading system, letting you see what's happening behind the scenes.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. You can use it to monitor or adjust how position sizes are determined. Specifically, the `onCalculate` function is called after the framework computes a potential position size; this is a handy spot to log the size, perform checks, or even potentially influence the size calculation process if needed.

## Interface ISizingCalculateParamsKelly

When calculating your trade sizes using the Kelly Criterion, you'll need to provide some information about your strategy's performance. This set of parameters lets you specify how you're defining your win rate – that is, the percentage of profitable trades you typically see. You also need to provide the average ratio of how much you win compared to how much you lose on each trade. Providing these two values allows the framework to determine an appropriate bet size based on the Kelly Criterion formula.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage approach. It requires you to specify that the sizing method is "fixed-percentage". Additionally, you’ll need to provide the `priceStopLoss` which represents the price at which a stop-loss order will be triggered. This allows the framework to incorporate a stop-loss level into the sizing calculation.

## Interface ISizingCalculateParamsBase

This interface defines the fundamental information needed to determine how much of an asset to trade. 

It includes the symbol of the trading pair, like BTCUSDT, so the system knows which assets are involved. 

You'll also find the current account balance, which is crucial for understanding how much capital is available for trading.

Finally, the planned entry price is included, which is essential to calculate the sizing based on your intended entry point.


## Interface ISizingCalculateParamsATR

This interface defines the settings needed when calculating position sizes using an ATR (Average True Range) based approach. You’ll specify this when you want your trading strategy to determine how much to trade based on the ATR value. The `method` property is always set to "atr-based" to indicate this sizing strategy.  The `atr` property represents the actual ATR value that’s being used in the sizing calculation.

## Interface ISizing

The `ISizing` interface is how your trading strategy determines how much of an asset to buy or sell. It's a core part of how backtest-kit executes strategies.

The crucial method within this interface is `calculate`. This method takes a set of parameters related to risk and your strategy’s rules, and it returns a promise that resolves to the calculated position size—essentially the number of shares or contracts to trade. It's where the logic for determining your bet size lives.

## Interface ISignalRow

This `ISignalRow` represents a complete trading signal, acting as the core data structure after a signal has been validated and prepared for execution. Each signal gets a unique identifier, or `id`, to track it throughout the system. It contains all the necessary information to execute a trade, including the `cost` of the position, the `priceOpen` at which the trade should occur, and the `exchangeName` and `strategyName` used for execution.

The signal also stores metadata like the `frameName` (which is blank when trading live) and timestamps for creation (`scheduledAt`), pending status (`pendingAt`), and original scheduling (`timestamp`). It specifies the `symbol` being traded and flags whether the signal was scheduled (`_isScheduled`).

To calculate profitability, the signal tracks any partial closes of the position within the `_partial` array, detailing the type of close (profit or loss), percentage closed, and the price at which it occurred. Further profitability calculations are maintained in `_tpClosed`, `_slClosed`, and `_totalClosed`.

For more advanced strategies, trailing stop-loss (`_trailingPriceStopLoss`) and take-profit (`_trailingPriceTakeProfit`) prices can be dynamically adjusted. If these are set, they override the original target prices used for checks. The `_entry` array records the DCA (Dollar Cost Averaging) entry history, and `_peak` and `_fall` store the highest and lowest prices seen during the trade’s life, respectively.


## Interface ISignalIntervalDto

This data structure helps manage signals that need to be delivered at specific time intervals. It's designed to be used with a utility function that allows you to request multiple signals at once, rather than one at a time.  Think of it as a way to batch up signal requests to improve efficiency. Each signal request within this structure will be held back until the specified time interval has passed before being processed.  The `id` property simply provides a unique identifier for each individual signal request, making it easy to track them.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a standardized way to share signal information. It includes essential details like a unique identifier (generated automatically if you don’t provide one), whether the trade is a long (buy) or short (sell) position, and a descriptive note explaining the reasoning behind the signal.

You’ll find the entry price, take profit target, stop loss price, and an estimated duration (in minutes) for the trade. Importantly, the take profit price should be higher than the entry price for long positions and lower for short positions, and the stop loss should follow the opposite rule. The cost associated with entering the position is also specified. You can set the duration to infinity to keep the position open until the take profit or stop loss is hit, or until you manually close it.

## Interface ISessionInstance

The `ISessionInstance` interface provides a way to manage temporary data during backtesting runs. Think of it as a container for information that’s specific to a particular symbol, strategy, exchange, and timeframe, and needs to be accessible across multiple calculations. It's meant for storing things that change during a single run, like results from machine learning models, indicator calculations, or running totals that need to be tracked over time.

The interface offers a few key functions: `waitForInit` to set up the session when it starts, `setData` to store new data, `getData` to retrieve existing data, and `dispose` to clean up and release any resources when the session is over. This helps keep your backtesting process organized and efficient by providing a dedicated space for temporary, mutable data.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's designed to be executed when a specific price level is reached. Think of it as a signal that's on hold, waiting for the market to move to a certain price before it's put into action. It builds upon a standard signal representation and introduces the concept of a delayed entry. 

When the market price hits the `priceOpen` level, this signal will transform into a typical pending signal, ready to be executed. A key feature is how the pending time is tracked; initially, it's the time the signal was scheduled, but updates to reflect the actual time it starts waiting. The `priceOpen` property simply tells you what price level needs to be reached before the signal is active.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal, but with added information specifically for when a user decides to cancel that signal. If a user cancels a signal manually, this interface includes a unique `cancelId` to identify the cancellation and a `cancelNote` to provide a reason for the cancellation. Essentially, it's a standard scheduled signal, but with extra fields that appear only when a user requests the signal’s cancellation.

## Interface IRunContext

This interface, `IRunContext`, is essentially a container holding all the information needed when you're running code within the backtest-kit framework. Think of it as a complete package – it merges details about *how* your strategy is being executed (like which exchange and strategy it's linked to) with the *actual* runtime data (like the symbol being traded and the timestamp). 

It's designed to be passed to a core function that then separates these pieces of information and distributes them to specialized services to handle them. This centralized approach ensures everything that a function needs to operate correctly is readily available.


## Interface IRiskValidationPayload

This object holds the information needed when checking if a trade is risky. It builds upon the basic trade arguments and adds details about your portfolio's current state. Specifically, it tells you the current signal being evaluated, how many positions you currently have open, and a list of those active positions. Knowing these details helps the risk validation process determine if proceeding with a trade is appropriate.

## Interface IRiskValidationFn

This defines a function that helps ensure your trading strategies are safe and sound. Think of it as a gatekeeper – it checks if certain conditions are met before a trade is allowed. If everything looks good, the function simply lets the trade proceed. However, if something isn't right, like a risk limit being exceeded, it provides a reason why the trade is being rejected, allowing you to understand and potentially adjust your strategy. You can either return a specific rejection reason or raise an error; both are handled to provide a clear explanation for the trade's failure.

## Interface IRiskValidation

This interface helps you define how to check the risk parameters in your trading strategies. It's all about setting up rules to ensure your trades are safe and sound.

You specify the actual validation logic using the `validate` function, which takes your risk parameters and determines if they’re acceptable. 

The `note` property lets you add a description to explain what the validation is doing; it’s great for making your code more understandable, especially when working with others. Think of it as a little note to yourself and your team about why that specific validation exists.

## Interface IRiskSignalRow

The `IRiskSignalRow` interface represents a row of data used internally for risk management calculations. It builds upon the existing `ISignalDto` data structure by adding specific price points: the entry price of a trade (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the initially set take-profit price (`originalPriceTakeProfit`). These extra details are crucial for validating risk parameters and ensuring trading positions adhere to predefined safety measures.

## Interface IRiskSchema

The IRiskSchema lets you define and register custom risk controls for your portfolio. Think of it as a way to set up rules that automatically manage risk at a portfolio level.

Each schema has a unique identifier, a `riskName`, and you can add notes to document why you set it up a certain way. You can also add callbacks, which are functions that get triggered at specific points in the risk assessment process – for example, when a trade is rejected or allowed.

The core of the schema lies in its validations. These are functions you provide that define the actual risk logic; they’re what dictates how your portfolio behaves based on defined conditions. You can add multiple validations to create a layered risk control system.


## Interface IRiskRejectionResult

This interface describes the result when a risk validation check fails. It provides details to help you understand *why* the validation failed. Each rejection has a unique `id` to track it specifically, and a `note` explains the reason in plain language so you can easily diagnose and fix the problem.

## Interface IRiskParams

This interface defines the settings used when setting up risk management for your trading strategies. It's essentially a collection of tools and information that help control how much risk you're taking on.

You'll specify the exchange you're trading on, like Binance or Coinbase. A logger is included for tracking debugging information.

There's also a service providing details about the trading environment, such as the symbol being traded, the current time, and whether you’re in a backtesting or live trading mode.

The `onRejected` callback is especially important; it's triggered when a trading signal is blocked because of risk limits and gives you a chance to react – for example, to log the event or alert someone.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a checklist run before a signal is actually executed. It provides details about the trading pair involved (the `symbol`), the signal itself (`currentSignal`), which strategy wants to make the trade (`strategyName`), and where the trade would happen (`exchangeName`). The `riskName` and `frameName` offer further context about the risk management and timeframe associated with the trade, and you also get the current price (`currentPrice`) and timestamp (`timestamp`) for reference. All of these arguments are passed directly from the client strategy context.

## Interface IRiskCallbacks

This interface provides a way to receive notifications about the outcome of your risk checks. If a trading signal is blocked because it exceeds your risk limits, the `onRejected` callback will be triggered, letting you know which symbol was affected and why. Conversely, if a signal passes all risk checks, the `onAllowed` callback will be invoked, confirming that the signal is safe to execute. You can use these callbacks to log events, adjust strategies, or implement other custom logic based on risk assessments.

## Interface IRiskActivePosition

This interface represents a single trading position being actively managed, used for analyzing risk across different trading strategies. It contains details about the position, such as the name of the strategy that created it, the exchange it’s on, and the timeframe it's associated with. You'll find key information here, including the symbol being traded (like BTCUSDT), whether it's a long or short position, and the entry price. It also includes risk management parameters like stop-loss and take-profit prices, along with the estimated duration and timestamp of when the position was initiated.


## Interface IRisk

This interface, called IRisk, helps you manage and control the risks associated with your trading strategies. It acts as a gatekeeper, ensuring that trades align with your predefined risk limits.

It offers a way to verify whether a signal should be executed, preventing potentially harmful trades.  You'll also use it to keep track of open positions, registering new ones and removing them when they're closed. Think of it as a central record of your active trades and a safety net for your overall trading plan. 

Specifically, `checkSignal` evaluates a trade against your risk parameters. `addSignal` logs a new trade to your position record, and `removeSignal` cleans up your records when a trade is closed.

## Interface IReportTarget

This interface lets you pick and choose which details to track when running your trading tests. Think of it as a way to fine-tune the level of information you want logged. Each property – like `strategy`, `risk`, or `breakeven` – controls whether specific types of events are recorded, allowing you to focus on what's most important for your analysis. For example, if you're primarily interested in how your strategy performs, you'd enable the `strategy` property. This helps keep your logs manageable and highlights the key aspects of your trading process.

## Interface IReportDumpOptions

This section defines how to customize the data included in your backtesting reports. You can specify exactly which trading symbols, strategies, exchanges, timeframes, signals, and optimization walkers should be represented in the report. Think of it as a filter – it lets you target specific aspects of your backtesting process for more focused analysis. Providing values for each property allows you to precisely control what data is captured and how it's organized within your reports.

## Interface IRecentUtils

This interface defines how different systems manage and access recent trading signals. Think of it as a contract for tools that need to keep track of the most recent signal generated by a strategy.  The `handleActivePing` method is responsible for saving incoming signal updates. You can then use `getLatestSignal` to find the most recent signal for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. Finally, `getMinutesSinceLatestSignalCreated` tells you how long ago that latest signal was generated, useful for understanding signal freshness.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share signal data with users in a clear and transparent manner. It builds upon the existing `ISignalRow` but specifically includes the original stop-loss and take-profit prices that were set when the signal was created. Even if your trading strategy dynamically adjusts these prices (like using trailing stop-loss or take-profit), the original values remain accessible, ensuring users always know the initial parameters.

The data it holds represents various aspects of a trade, including the cost of entry, the number of entries and partial exits, and crucial information about profit and loss. You’ll find details like the original entry price, unrealized profit/loss (pnl), and peak profit/drawdown – all calculated based on the position's history up to the moment the signal was generated. The `partialExecuted` property shows what percentage of the position has been closed through partial exits. The `totalEntries` property reveals if and how positions are being averaged.

## Interface IPublicCandleData

This interface, IPublicCandleData, describes the structure of a single candlestick data point. Each candlestick represents a specific timeframe and contains information about the price action during that period. You'll find properties for the timestamp, indicating when the candle began, the opening price, the highest and lowest prices reached, the closing price, and the trading volume for that timeframe. This data provides a concise view of price movement and trading activity over a defined interval.

## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface defines the settings you'll use to calculate position sizes based on the Kelly Criterion. It’s all about understanding how your trades perform – specifically, how often you win (`winRate`) and how much you typically win compared to how much you lose (`winLossRatio`). These two values are essential for determining an appropriate bet size based on the Kelly Criterion principles. By providing these numbers, the framework can help you intelligently manage your risk and potentially maximize returns.

## Interface IPositionSizeFixedPercentageParams

This section describes the parameters needed when using a fixed percentage sizing strategy for your trades. 

Specifically, you'll need to define a `priceStopLoss`. This value represents the price at which you'll set your stop-loss order to limit potential losses.

## Interface IPositionSizeATRParams

This defines the settings you use to calculate your position size based on the Average True Range (ATR). The core of these settings is the `atr` value, which represents the current ATR reading. This number helps determine how much of your capital should be allocated to a trade, adjusting position size based on market volatility. A higher ATR generally means a larger position size to account for increased price swings.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface helps you define a safety zone when checking for overlapping positions, which is important for strategies like dollar-cost averaging (DCA). It lets you specify how much price movement above and below your DCA levels should still be considered part of the same, potentially overlapping, position. You control this with two percentages: `upperPercent` defines how high above each DCA level constitutes overlap, and `lowerPercent` defines how low below. Think of it as setting a buffer around your DCA points to avoid mistakenly flagging small price fluctuations as problematic overlaps.

## Interface IPersistBase

This interface provides a basic set of operations for storing and retrieving data, designed to be used by custom adapters. Think of it as a contract that ensures different storage solutions can be used consistently within the backtest-kit framework. 

It includes functions for initializing storage, reading individual data items, checking if a data item exists, writing data, and getting a list of all available data items. The list of data items is always sorted, making it simple to iterate through them or verify their contents. This interface aims to keep the persistence layer flexible and adaptable to various storage methods.


## Interface IPartialProfitCommitRow

This describes a record representing a partial profit-taking action that’s been queued up within a backtest. 

Think of it as a single instruction to close a portion of your position.

It includes the type of action – which is always "partial-profit" – the percentage of the position you want to close (represented by `percentToClose`), and the price at which that partial closing happened (`currentPrice`).


## Interface IPartialLossCommitRow

This represents a request to partially close a position. 

Think of it as a single instruction to reduce the size of your trading position. 

It specifies that the action is a "partial-loss" – meaning you're selling a portion of your holdings.

You'll also find the percentage of the position to be closed, represented as a number.

Finally, it includes the price at which this partial trade occurred, giving context to the transaction.

## Interface IPartialData

IPartialData helps save and load important pieces of information about a trading signal, especially when dealing with large amounts of data. It focuses on capturing key data points – specifically, the profit and loss levels reached.

Think of it as a simplified snapshot of the signal's progress, designed to be easily stored and retrieved. The `profitLevels` and `lossLevels` properties contain arrays of levels, which are essentially the points where the signal has hit certain profit or loss targets. These arrays are created from sets of data, making them compatible for saving as files or sending over a network. When you load this data back, it’s used to reconstruct the full state of the signal.


## Interface IPartial

The `IPartial` interface is designed to keep track of how much profit or loss a trading signal is generating. It's a central piece of how backtest-kit manages signals, with `ClientPartial` and `PartialConnectionService` using it.

When a signal is making money, the `profit` method is called to see if it's hit milestones like 10%, 20%, or 30% profit. It then announces these milestones. When a signal is losing money, the `loss` method does the same for loss levels.

Finally, when a signal finishes – whether it hits a take-profit or stop-loss – the `clear` method cleans up the record of that signal, removing it from memory and saving the changes.

## Interface IParseArgsResult

The `IParseArgsResult` interface represents the outcome when you parse command-line arguments for your trading setup. It bundles together crucial information about how your trading system will operate. Specifically, it tells you whether you're running a backtest (simulating past performance), a paper trading session (practicing with simulated funds), or live trading (actual trading with real money). These flags – `backtest`, `paper`, and `live` – directly dictate the behavior of your trading framework.

## Interface IParseArgsParams

The `IParseArgsParams` interface defines the standard inputs expected when setting up a backtest. Think of it as a way to specify the core details for your trading simulation. 

You'll use it to tell the system which asset you're trading (the `symbol`, like BTCUSDT), what trading strategy you want to run (`strategyName`), which exchange the strategy interacts with (`exchangeName`), and the timeframe of the price data you're using (`frameName`, like 15 minutes or daily). Essentially, it’s a blueprint for defining the context of your backtest.


## Interface IOrderBookData

The `IOrderBookData` interface represents the data you receive from an order book, which shows the current buying and selling interest for a specific trading pair. It has a `symbol` property that identifies the trading pair, like "BTCUSDT".  The `bids` property is an array holding details of the best prices buyers are offering to pay, while the `asks` property holds the best prices sellers are offering to sell at. Each bid and ask within these arrays is described by the `IBidData` interface, which isn't defined here but would contain details like price and quantity.

## Interface INotificationUtils

This interface provides the foundation for components that send out notifications about your trading strategies. Think of it as a contract that ensures any system sending alerts – whether that's email, Slack, or a custom webhook – behaves in a consistent way.

It defines a set of methods for handling various events that occur during backtesting and live trading. These include signals being opened or closed, partial profit or loss opportunities arising, and important updates related to strategy execution. 

You’ll also find methods for handling errors, from simple mistakes to critical failures, ensuring those issues are appropriately communicated. Finally, you can retrieve and clear all stored notifications, allowing you to manage the history of events. It's designed to make it easy to build notification systems that integrate seamlessly with the backtest-kit framework.

## Interface INotificationTarget

This interface helps you fine-tune which notifications your backtest or live trading session provides. Instead of receiving every possible update, you can pick and choose the specific event types that are relevant to your analysis.

Think of it as a way to subscribe to only the information you need. If you don't specify this interface, you'll get all notifications by default.

Here's a breakdown of the available notification categories:

*   **Signal events:** These cover actions related to signals like opening, scheduling, closing, and cancellation.
*   **Partial profit/loss:** You can be notified when prices reach pre-defined partial profit or loss levels.
*   **Breakeven:** Get notified when the price hits your breakeven point.
*   **Strategy Commitments:** Track confirmations of actions taken by the strategy.
*   **Signal Synchronization:** Stay informed about the confirmations from the exchange for live trades (opening and closing positions).
*   **Risk management:** Receive alerts if the risk manager blocks a signal.
*   **Informational signals:** Access manual or strategy-generated messages related to active signals.
*   **Errors:** Differentiate between common, recoverable errors and critical, unrecoverable errors, and also validation errors related to strategy setup.



By carefully selecting which properties you enable in this interface, you can create a more focused and efficient backtesting or live trading experience.

## Interface IMethodContext

The `IMethodContext` object acts like a guide, providing essential information to your backtesting code. Think of it as a set of labels – `exchangeName`, `strategyName`, and `frameName` – that tell your program exactly which data and configurations to use. It's automatically passed around within the backtest kit, so you don't need to manually manage it. The `frameName` is particularly important, and when it's empty, it signifies that the backtest is running in live mode.

## Interface IMemoryInstance

This interface outlines how different memory backends – whether they’re stored locally, persistently, or just for testing – should behave.

`waitForInit` lets you ensure the memory is ready before you start using it.

`writeMemory` is how you add new data to the memory, letting you specify what you're storing and a description.

`searchMemory` lets you find specific pieces of information within the memory using a search query, and it ranks results by relevance.

`listMemory` gives you a complete view of everything currently stored in the memory.

`removeMemory` lets you delete individual entries.

`readMemory` is used to retrieve a specific piece of data.

Finally, `dispose` is for cleaning up and releasing any resources used by the memory instance when you're finished with it.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see when running your backtests. Think of it as a way to control the level of detail in your analysis.

You can toggle on or off reports for things like strategy signals, risk rejections, breakeven points, partial profits, portfolio heatmaps, strategy comparison, performance bottlenecks, scheduled signals, live trading events, full backtest results, signal lifecycle events, and milestone tracking for maximum profit and drawdown. 

By selectively enabling these reports, you can focus on the information that's most important for understanding and improving your trading strategy.

## Interface IMarkdownDumpOptions

This interface defines the settings used when generating markdown documentation within the backtest-kit framework. Think of it as a blueprint for organizing and filtering the information that gets written out. 

It bundles together important details like the directory where the markdown will be saved, the specific file name, and the trading-related context of the data, such as the trading pair (like BTCUSDT), the name of the strategy being analyzed, the exchange it's on, and the timeframe being used. The signalId is a unique identifier for each trading signal. This allows for precise targeting of documentation for specific components and scenarios.

## Interface ILogger

The `ILogger` interface is how different parts of the backtest-kit framework communicate about what's happening. Think of it as a central record-keeping system.

It offers several ways to record messages: `log` for general events, `debug` for very detailed information that's helpful for developers, `info` for routine updates and confirmations, and `warn` to highlight potential issues that need a second look. 

These logs capture important things like when components start or stop, how tools are used, whether validations pass, and any problems with saving data. Having these logs helps with understanding what happened, keeping an eye on performance, and making sure things are working correctly.


## Interface ILogEntry

ILogEntry represents a single entry within the backtest kit's log history. Each entry has a unique identifier, a level (log, debug, info, or warn), and a timestamp indicating when it was created.  It also includes a creation date for user convenience.

To give more context, you'll find information about the method and execution environment related to the log – like which function it came from and the current state of the test. 

Finally, it can also hold additional arguments that were passed when the log message was originally generated.

## Interface ILog

The `ILog` interface provides a way to keep track of what's happening during your backtests and simulations. It allows you to see a complete history of all the events and messages that occurred.

The key feature is `getList`, which returns a comprehensive list of all the log entries, giving you a full picture of the backtest's execution from start to finish. This helps with debugging, analysis, and understanding the decision-making process during your trading simulations.

## Interface IHeatmapRow

This interface represents a row of data for a heatmap visualization, summarizing the performance of all strategies applied to a specific trading pair, like BTCUSDT. It provides key performance indicators for a single symbol, giving you a quick overview of its trading history.

You'll find metrics like total profit and loss, the Sharpe Ratio which assesses risk-adjusted returns, and the maximum drawdown to understand potential losses. The interface also details the number of trades, the win/loss ratio, and average profit/loss per trade. 

Furthermore, it includes stats like average winning and losing trade sizes, maximum winning/losing streaks, and expectancy which is a prediction of average profit per trade. You’ll also see metrics that capture how well a trade performed at its peak and how much it fell from that peak, aiding in a more detailed assessment.

## Interface IFrameSchema

The `IFrameSchema` helps define distinct periods within your backtesting strategy. Think of it as specifying a particular segment of time and the frequency of data you want to analyze. Each frame has a unique name for identification and can include a note for your own records.

You’ll set the `startDate` and `endDate` to mark the beginning and end of the period, and the `interval` determines how often data points are generated within that timeframe.  

Optional callbacks allow you to hook into the frame's lifecycle, giving you opportunities to perform custom actions at key moments. This offers a flexible way to tailor your backtesting process.

## Interface IFrameParams

The `IFrameParams` object holds the setup information needed when creating a ClientFrame, which is a key part of running backtests. It builds upon the `IFrameschema` and includes a `logger` – think of this as a tool for observing what's happening during the backtest, helping you troubleshoot and understand the results. The `logger` property provides a way to record and review debugging information during the backtest execution.

## Interface IFrameCallbacks

This function gets called whenever a set of trading timeframes is created. It's a chance to check if those timeframes look right, maybe log some details about them, or perform any other actions you need to do when new timeframes are available. The timeframe data includes the array of dates, the start and end dates of the timeframe set, and the interval used to define the timeframes (like daily, weekly, etc.). You can either return nothing or return a promise that resolves to nothing.

## Interface IFrame

The `IFrames` interface is a core component for managing the timeline of your backtesting process. It's essentially how the framework understands and generates the sequence of dates it will use to simulate trades. 

The `getTimeframe` function is the key method here; it takes a trading symbol and a "frame name" (like "daily" or "hourly") and returns a promise that resolves to an array of dates. Think of it as requesting a list of specific dates for your backtest, spaced out according to how frequently you want your data. This array will guide the backtest through time.

## Interface IExecutionContext

The `IExecutionContext` provides the necessary information for your trading strategies and exchange interactions to function correctly. Think of it as a package of data that’s passed around to give your code the context it needs.

It tells your strategy things like which trading pair you’re working with – like "BTCUSDT" – and the precise current timestamp.

Importantly, it indicates whether you're running a backtest (testing your strategy on historical data) or operating in a live trading environment. This is crucial for adjusting behavior based on the mode you're in.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with different cryptocurrency exchanges. It outlines the essential information and functions needed to retrieve historical and real-time data.

Each exchange you want to use with backtest-kit needs to be registered using this schema. It includes a unique identifier for the exchange itself, and an optional note for developers.

The core of the schema is `getCandles`, which tells backtest-kit how to fetch historical price data (candles) for a specific trading pair and time range.  It also defines `formatQuantity` and `formatPrice`, which handle converting quantities and prices to the correct format for each exchange, ensuring accuracy.

Beyond just candles, you can also provide functions to fetch order book data (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), though these are optional – if not provided, the system will let you know they are needed. Finally, there’s a section for optional callbacks, like `onCandleData`, that allow you to respond to events as data arrives.

## Interface IExchangeParams

The `IExchangeParams` interface defines the configuration your exchange integration needs to function within the backtest-kit framework. Think of it as a blueprint for how the system interacts with a specific exchange like Binance or Coinbase.

It’s crucial to provide all the listed methods during the setup, as they handle essential tasks.

Here's a breakdown of what each part does:

*   **logger:** This allows you to log debugging information, helping you understand what's happening during your backtesting process.
*   **execution:**  This context provides vital information like the trading symbol, the timestamp, and whether you're in a backtesting environment.
*   **getCandles:** This is your connection to historical price data.  It’s how you pull the OHLCV (Open, High, Low, Close, Volume) data needed for backtesting.
*   **formatQuantity:**  This ensures that trade quantities are represented correctly according to the exchange’s rules.
*   **formatPrice:** This ensures that prices are formatted correctly, according to the exchange’s rules.
*   **getOrderBook:**  This allows you to retrieve the order book, which shows the current bids and asks for a trading pair.
*   **getAggregatedTrades:**  This allows you to retrieve trade data.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you define functions to be executed when the backtest-kit framework receives new candle data from an exchange. You can use this to react to incoming data, perhaps to log it or perform calculations as it arrives. The `onCandleData` callback specifically receives the symbol, interval, starting date/time, number of candles requested, and the actual array of candle data. This provides a way to monitor or modify the data stream as it’s received.


## Interface IExchange

The `IExchange` interface defines how your backtesting environment interacts with an exchange. It gives you ways to retrieve historical and future candle data, essential for simulating trades.

You can request candles from the past (`getCandles`) and even peek into the future for backtesting purposes (`getNextCandles`). The framework also helps you with the technicalities of trading by formatting quantities and prices to match the exchange's requirements.

To aid in analysis, you can calculate the VWAP (Volume Weighted Average Price) using recent price data.

The interface also allows you to fetch order book information and aggregated trades to understand market depth and recent activity.

Retrieving historical candle data is flexible – you can specify a limit, start and end dates, or a combination of these to get the data you need while ensuring the backtest is accurate and avoids looking into the future.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for any data that's saved and retrieved within the backtest-kit framework. Think of it as a common blueprint; if a piece of information needs to be stored – like a trade, an indicator value, or a portfolio snapshot – it should likely implement this interface. It’s designed to ensure consistency and makes working with different types of saved data much easier. Essentially, it’s the starting point for persistent data objects within the system.

## Interface IDumpInstance

The `IDumpInstance` interface defines how components can save data related to backtesting runs. Think of it as a way to record detailed snapshots of what’s happening during a simulation.

It provides several methods for saving different types of information: message histories, simple key-value pairs, tables of data, raw text, error descriptions, and even complex JSON objects. Each method takes the data you want to save, a unique identifier for that data (the `dumpId`), and a description to help you understand what the data represents.

Finally, the `dispose` method is used to clean up any resources the dumping component might be using when it's no longer needed. Essentially, it’s a standardized way to capture and store a wide range of data for analysis and debugging your backtests.

## Interface IDumpContext

The `IDumpContext` helps organize and identify pieces of data being saved, particularly within the data dumping process. Think of it as a set of labels attached to each piece of data. 

It includes a `signalId` to specify which trade the data relates to, and a `bucketName` to categorize data by strategy or agent. Each dump gets a unique `dumpId` for easy tracking. 

There's also a `description` field that lets you add a helpful note to describe what the data represents - this makes searching and understanding the data easier. Finally, a `backtest` flag indicates if the data originates from a backtesting simulation or a live trading environment.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as a foundation for how your trading actions are recorded and processed. It represents a single action that needs to be 'committed' – essentially, it’s a record of what happened during a trade. Think of it as a log entry for your trading activity.

Each entry includes the `symbol` of the trading pair involved, telling you exactly which asset was traded. It also indicates whether the trade occurred during a `backtest`, which is a simulated trading scenario. These properties allow the framework to ensure these actions are handled correctly when the execution environment is ready.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. It's used to make sure your candles are in the right place and time.

You’ll need to specify the trading symbol, the exchange where the data came from, and the candle interval (like 1 minute or 4 hours).

The interface also requires a start and end date to define the range of candles being validated, as well as the location where your candle data is stored. The default location is `./dump/data/candle`, but you can change it if your data is somewhere else.


## Interface ICandleData

This interface defines the structure for a single candlestick, representing a specific time interval in trading data. Each candlestick contains information about the opening price, the highest price reached, the lowest price reached, the closing price, the volume traded, and the exact time it represents. This data is crucial for calculating things like volume-weighted average prices and for running backtests to evaluate trading strategies. Essentially, it's a snapshot of price action and trading activity over a defined period.


## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candle data. Think of it as a set of instructions telling the system *what* data to fetch and store for later use in a backtest. You'll specify the trading symbol, the exchange where the data resides, the timeframe for the candles (like 1-minute or 4-hour bars), and the start and end dates to cover the period you want to download. This helps speed up backtests by ensuring all the necessary data is readily available.

## Interface IBroker

The `IBroker` interface defines how the backtest-kit framework interacts with a live trading platform. Think of it as the bridge between the simulation and real-world order execution.

You'll need to create a class that implements this interface to connect to your specific broker or exchange.

Crucially, the framework calls these methods *before* making changes to its internal state, so any errors during these calls won’t corrupt the backtest.  The broker adapter is bypassed entirely during backtesting – it won't receive any data.

Here's a breakdown of what each method represents:

*   `waitForInit`: This is a one-time setup call to initialize the connection to your broker – things like authentication, loading credentials, or establishing a WebSocket connection.

*   `onSignalCloseCommit`: This is triggered whenever a trading signal is closed, whether it's due to a take-profit, stop-loss, or a manual closure.

*   `onSignalOpenCommit`: This happens when a new trading position is opened and confirmed.

*   `onPartialProfitCommit`: This is used when you're taking partial profits from a position.

*   `onPartialLossCommit`: Similar to partial profits, this triggers when you're closing a portion of a position to cut losses.

*   `onTrailingStopCommit`: This handles updates to trailing stop-loss orders.

*   `onTrailingTakeCommit`: This deals with updates to trailing take-profit orders.

*   `onBreakevenCommit`:  This is called when you're setting a breakeven stop – essentially moving your stop-loss to your entry price.

*   `onAverageBuyCommit`:  Finally, this is for implementing dollar-cost averaging (DCA) strategies, specifically when a new average-buy order is placed.

## Interface IBreakevenData

This data structure holds information about whether a breakeven point has been achieved for a particular trading signal. It's designed to be easily saved and loaded, making it suitable for persisting data across sessions. Think of it as a simple flag that indicates if the initial investment has been recovered. The `reached` property is a boolean that directly represents the `reached` state of a more complex breakeven calculation.

## Interface IBreakevenCommitRow

This object represents a specific action taken during a backtest related to breakeven points. It signals that a breakeven adjustment occurred. The `currentPrice` property tells you the price level at which this breakeven calculation was performed. Essentially, it’s a record of a breakeven event and the price that triggered it.

## Interface IBreakeven

The `IBreakeven` interface helps manage when a trading signal’s stop-loss order is adjusted to the original entry price, essentially protecting profits. It’s used by components that track and react to this breakeven point.

The `check` method is the core of the system; it determines if the price movement warrants moving the stop-loss to breakeven, considering transaction costs. This happens during the regular monitoring of a signal.

The `clear` method ensures that when a signal finishes (whether through a take-profit, stop-loss hit, or time expiration), any associated breakeven tracking is removed and the state is properly saved.

## Interface IBidData

This data structure represents a single bid or ask price point within the order book. It contains two pieces of key information: the price at which the bid or ask is offered, and the quantity of assets available at that price. Both the price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy strategy, sometimes called Dollar-Cost Averaging (DCA). Think of it as one purchase within a larger plan to gradually acquire an asset.

Each entry records the price you bought at, the cost of that specific purchase, and how many total purchases have been made so far. This information allows you to track the progress and overall cost of your average-buy strategy.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that took place. Think of it as a snapshot of a transaction including what price it happened at, how much was traded, and when. Each trade has a unique ID to easily identify it later.  You can also tell whether the buyer or seller initiated the trade thanks to the `isBuyerMaker` flag. This data is invaluable for analyzing trading patterns and for backtesting strategies.

## Interface IActivateScheduledCommitRow

This interface represents a message placed in a queue to trigger the activation of a scheduled commit. Think of it as a notification that a specific, pre-planned commit needs to be put into action.

It includes essential details like the type of action being performed – in this case, “activate-scheduled” – and the unique identifier of the signal involved.  There's also an optional identifier for activations started directly by a user.

## Interface IActionStrategy

This interface gives you a way to peek at whether a trading signal is waiting or scheduled. Think of it as a way to check if something's about to happen before you take action.

It’s used within the system to determine if certain actions, like adjusting stop-loss or take-profit levels, should be skipped because there’s no signal actively in play.

Specifically, you can use it to see if there’s a pending order open, or if a signal is scheduled to trigger in the future. It provides a read-only view of this information, so you can’t modify anything.

The `hasPendingSignal` method tells you if there's an open position waiting for a signal.

The `hasScheduledSignal` method tells you if a signal is queued up to be triggered later.

## Interface IActionSchema

This describes how to add custom actions to your trading strategy using backtest-kit. Actions let you hook into the strategy execution process to do things like manage state, log events, send notifications, or even trigger custom logic.

Think of them as event handlers that are attached to your strategy. Each action gets its own instance for every strategy run and receives all the data generated during that run. You can add several actions to a single strategy.

To define an action, you’ll specify a unique identifier, an optional note for documentation, the action's core logic (either a constructor or a set of functions), and optional callbacks for specific lifecycle events. This allows for flexible integration with various systems and adds powerful extensibility to your strategies.

## Interface IActionParams

The `IActionParams` interface describes the information given to an action when it's created. Think of it as a package containing everything the action needs to understand its role and environment.

It builds upon a base schema, adding vital details like a `logger` for keeping track of what's happening and debugging, plus information about the overall strategy – its name, the timeframe it's operating on, and whether it's a backtest.

The `strategy` property is particularly important, giving the action direct access to current trading signals and details about existing positions. It also includes whether the execution is happening in backtest mode, enabling different behaviors based on the environment.

## Interface IActionCallbacks

This interface lets you hook into different lifecycle events and events related to your trading actions, offering flexibility in how you build and manage your trading strategies. Think of it as a way to listen in on what's happening behind the scenes and react accordingly.

You can use `onInit` to set up resources like database connections when your action handler starts, and `onDispose` to clean everything up when it’s done.

There are several signal-related callbacks, too.  `onSignal` is a general one, while `onSignalLive` and `onSignalBacktest` are specifically for live trading and backtesting respectively.  You can also listen for events related to profit/loss management with `onBreakevenAvailable`, `onPartialProfitAvailable`, and `onPartialLossAvailable`.

Furthermore, you can monitor the status of scheduled and active signals using `onPingScheduled`, `onPingActive`, and `onPingIdle`.

If your signals are rejected by risk management, `onRiskRejection` will be triggered.

Finally, `onSignalSync` allows you to control the execution of limit orders – critically, any errors you throw here will halt the process and retry on the next tick.

## Interface IAction

The `IAction` interface is your central point for managing events and actions within the backtest-kit framework. Think of it as a way to plug in your own logic to react to what's happening during a trading simulation or live trade. It provides a set of methods, each corresponding to a specific event like a new signal, a breakeven reached, or a risk rejection.  You can use these methods to build things like custom dashboards, log trading activity, or even integrate with external services to manage your trades.  Most importantly, the `dispose` method lets you clean up after yourself when your logic is no longer needed, ensuring a clean and stable trading environment. There are specific methods for handling signals during backtests versus live trading, plus methods to track partial profits, losses, and pings for scheduled and active signals. This allows very granular control over how your framework responds to different trading scenarios.

## Interface HighestProfitStatisticsModel

This model holds information about the highest profit events observed during a trading backtest. It keeps track of every profit-generating event in a list, sorted from the most recent to the oldest. You can also find the total number of these profitable events recorded here. Essentially, it provides a comprehensive view of the periods where the highest profits were achieved.

## Interface HighestProfitEvent

This data represents the single most profitable moment recorded for a particular trade. It holds key details about that peak performance. 

You'll find information like the exact time it happened (timestamp), the trading pair involved (symbol), and the name of the strategy that made the trade. Each event also notes a unique signal identifier and whether the position was a long or short. 

Crucially, it includes the total profit earned on the trade (pnl), as well as the highest profit and maximum drawdown achieved during the trade's lifetime.  The record price at the time of peak profit, along with the entry, take profit, and stop-loss prices are all available. Finally, a flag indicates whether this event happened during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading strategy hits a new peak profit. It's like a notification that something good happened in your trading. You'll get details like the trading symbol involved (e.g., BTC/USDT), the current price at that moment, and when the event occurred. 

It also includes important context: the name of the trading strategy, the exchange being used, and the timeframe being analyzed. The `signal` property gives you the underlying data that triggered the trade. 

Finally, a `backtest` flag tells you whether this profit milestone was reached during a historical simulation or a live trade, allowing you to handle these scenarios differently.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for a portfolio's performance, visualized as a heatmap. It breaks down key metrics across all the assets within the portfolio. 

You'll find an array detailing the statistics for each individual symbol, allowing you to see how each asset contributed to the overall portfolio result. 

Alongside this, it provides aggregate numbers like the total number of symbols, total profit and loss (PNL) across the entire portfolio, and the Sharpe Ratio, a measure of risk-adjusted return. 

It also includes the total number of trades executed and provides average peak and fall PNL figures, weighted by the number of trades, to offer a more nuanced view of risk and reward.

## Interface DoneContract

This interface describes what gets passed to you when a background process, either a backtest or a live execution, finishes. It tells you key details about the finished process, such as the exchange used, the name of the strategy that ran, and whether it was a backtest or a live trade.  You’ll find information like the trading symbol involved and, if it’s a backtest, the specific frame that was processed. Basically, it’s a notification package with all the important identifying information for a completed background task.

## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable error that requires the trading process to stop immediately. It's a way for the system to alert you when something goes wrong that can't be handled within the normal flow. Each notification has a unique ID, a clear error message to help understand the problem, and detailed information about the error itself including a stack trace. You'll find that the `backtest` flag is always false with these notifications, indicating they originate from a live trading context, not a simulation.

## Interface ColumnModel

This section describes how to define the structure of columns when creating tables, especially useful for displaying data in reports. Think of it as defining what each column represents and how it should look. 

Each column needs a unique identifier, a human-readable label for the header, and a function to transform the underlying data into a string for display. You can also specify whether a column should be shown or hidden, giving you control over what appears in the table. The format function allows for flexible data conversion, even handling asynchronous operations if needed.

## Interface ClosePendingCommitNotification

This notification tells you when a pending trade signal is closed before it's fully activated. It’s useful for understanding why a signal didn’t result in a trade and for debugging your trading strategy. The notification includes a unique ID, a timestamp, and whether it originated from a backtest or live trading environment. It also provides details about the trade, like the symbol, strategy name, exchange used, and the original signal’s ID.

You'll find information about the trade’s performance, including profit/loss (both in USD and percentage), peak profit, maximum drawdown, and the prices involved in those calculations.  A breakdown of the individual entries and partial closes is available too, alongside reasons for the closure if provided.  Finally, a creation timestamp is available to track when the notification itself was generated.

## Interface ClosePendingCommit

This signal lets you know a pending order has been closed. 

It includes details about the closure, like a unique identifier for the reason behind it, which is helpful for tracking and understanding why the order was closed.

You’ll also find information about the position's performance, specifically its total profit and loss (PNL), the highest profit it reached, and its maximum drawdown – essentially, the biggest loss it suffered. These figures give you a clear picture of the position's profitability and risk profile throughout its lifespan.

## Interface CancelScheduledCommitNotification

This notification appears when a scheduled trading signal is cancelled before it actually executes. It provides a detailed snapshot of the signal's state at the time of cancellation, including identifiers like a unique notification ID and a timestamp indicating when the cancellation happened. You'll find key information about the trading pair (symbol), the strategy and exchange involved, and the signal itself (signal ID and cancel ID, if provided).

The notification also includes performance metrics like total entries, partial closes, original entry price, and comprehensive P&L data, peak profit, and maximum drawdown figures.  It details the costs, percentages, and prices associated with these performance indicators, alongside information about the number of entries made during those points. A note field allows for an optional human-readable explanation of why the signal was cancelled. Finally, you'll see when the notification was created. This data helps you understand why a scheduled trade was cancelled and assess the conditions surrounding the intended trade.

## Interface CancelScheduledCommit

This interface defines how to cancel a previously scheduled signal event within the backtest-kit framework. It's used when you want to stop a signal that's already been planned for execution.

You provide a `cancelId` to clearly identify why you're cancelling the event, which helps with tracking and debugging.

Alongside the cancellation details, you can also include performance information related to the position being affected. Specifically, you'll find data about the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the maximum loss experienced (`maxDrawdown`) during the position's lifetime. This allows for more comprehensive reporting and analysis of the cancellation.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading simulation.

Think of it as a record of when trades have potentially reached a point where they’re neither profitable nor losing money.

The `eventList` property gives you a detailed view of each individual breakeven event, allowing you to examine them one by one.

`totalEvents` simply tells you how many breakeven events occurred overall.

## Interface BreakevenEvent

This data structure holds all the important details whenever a trading signal hits its breakeven point. Think of it as a snapshot of what happened at that specific moment.

It includes things like the exact time, the symbol being traded, the strategy used, and the signal's unique identifier.

You'll also find key price information, such as the entry price, take profit target, and stop-loss levels, both as originally set and as they may have changed.

If the strategy involved averaging entries (DCA), you'll see details about the number of entries and partial exits. Other useful information is included like the unrealized profit and loss (PNL), a description of the signal's reasoning, and timestamps for when the position became active and when the signal was initially created. Finally, a flag indicates whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents when a trading signal's stop-loss is moved back to its original entry price, signifying a reduction in risk. It's a notification sent when the price has moved favorably enough to cover the costs associated with the trade.

This event is only sent once for each signal to prevent duplicates.

The event includes details like the trading pair’s symbol, the name of the strategy that generated the signal, the exchange being used, and the timeframe. You’ll also find the full original signal data, including the initial stop-loss and take-profit prices.

The contract also contains the current price that triggered the breakeven, a flag to indicate whether the event came from a backtest or live trading, and the exact timestamp of the event. This information is used by reporting services and allows users to track milestones in strategy performance.

## Interface BreakevenCommitNotification

This notification gets fired when a breakeven point is reached in a trade, letting you know that the position has recovered its initial investment. It's packed with details about the trade, like the symbol being traded (e.g., BTCUSDT), the name of the strategy that made the decision, and whether it happened in a live or backtest environment. 

You'll find a unique ID for the notification and a timestamp indicating precisely when the breakeven occurred. The notification also provides all the key price points involved – the entry price, take profit, and stop loss levels, both their original values and any adjusted ones due to trailing.

Beyond the basics, you get a complete picture of the trade's performance so far, including profit and loss figures, peak profit achieved, maximum drawdown, and various price points associated with those milestones.  You'll also learn about how many entries and partial closes were involved, and the total capital invested. Finally, there's a space for a note explaining *why* the breakeven happened – useful for understanding the strategy's logic. The notification includes timestamps for when the signal was scheduled and became pending as well.

## Interface BreakevenCommit

This object represents a breakeven event that occurs during a trading strategy's backtest. It details the state of the position when the breakeven was triggered, providing key information about the trade.

You’ll find the current market price at the time the breakeven adjustment happened, along with the overall profit and loss (pnl), the highest profit achieved, and the largest drawdown experienced by the position.

The object also specifies whether the trade was a long (buy) or short (sell) position, and it records the original entry price, as well as the take profit and stop-loss prices, both in their initial form and after any trailing adjustments.

Timestamps indicate when the signal was created and when the position initially became active. Essentially, this object provides a snapshot of a position's performance and details when a breakeven adjustment took place.


## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be moved to the entry price – essentially, you're at breakeven. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it's from a backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange where the trade occurred. It also includes all the critical pricing information like the current price, entry price, take profit, and stop-loss levels, both original and adjusted.

Beyond just the immediate trade details, this notification also includes comprehensive performance data like total profit and loss, peak profit and drawdown figures, and metrics like percentage profit/loss and costs. You can also see information related to DCA averaging, partial closes, and the number of entries made. Finally, a note field allows for an optional human-readable explanation of the signal.

## Interface BacktestStatisticsModel

This model gathers all the key statistical data from your backtesting runs, giving you a clear picture of how your strategy performed. You’ll find a detailed list of every trade signal, including price data and profit/loss information, along with the total number of signals generated.

It also provides fundamental metrics to assess your strategy’s effectiveness. You can see the number of winning and losing trades, and calculate the win rate to understand the frequency of success. The average and total profit/loss provide insight into overall profitability, while standard deviation measures the volatility of your returns.

More sophisticated metrics like Sharpe Ratio and annualized Sharpe Ratio help evaluate your strategy's risk-adjusted performance. Certainty Ratio assesses the consistency of wins and losses. Finally, the model estimates expected yearly returns and analyzes the peak and fall profit/loss percentages to evaluate potential drawdown risks. Note that many of these values might be null if the calculations involve unsafe values like infinity or NaN.

## Interface AverageBuyCommitNotification

This notification alerts you when a new average-buy (DCA) entry has been added to an existing position. It provides detailed information about this addition, including the price, cost, and the current effective average price. You’ll find identifiers like a unique notification ID, timestamp, and whether it originated from a backtest or live trading environment.

The notification breaks down the specifics of the trade, such as the symbol, strategy name, and exchange used. It also outlines key pricing data like the execution price, the cost of the averaging entry, and the overall effective entry price after incorporating the new buy.  You can track the total number of DCA entries and partial closes executed.

Beyond the immediate details, the notification also includes performance data like the total profit and loss (PNL), peak profit, and maximum drawdown, all with associated price points and percentages. It also provides insights into the original entry price, take profit and stop loss levels, and other relevant metrics. A note field may contain a human-readable explanation of the trading decision. Finally, there are timestamps related to the signal’s creation and pending status.

## Interface AverageBuyCommit

This event, called AverageBuyCommit, signals that a new averaging (DCA) buy order has been executed within a trading position. It provides a snapshot of the position's state after this averaging purchase.

You’ll see this event whenever your strategy adds more to a long or short position to lower the average entry price. The `currentPrice` tells you the price at which the new averaging entry was bought.

The `cost` property reveals how much USD was spent on this particular averaging purchase.

Crucially, the `effectivePriceOpen` provides the new, averaged entry price for the position after this buy.

Beyond the details of the averaging action, the event also includes key performance indicators like `pnl` (unrealized profit and loss), `peakProfit`, and `maxDrawdown`, giving you a view into the position’s overall health.

You can access original price points, such as `priceOpen`, alongside adjusted prices like `priceTakeProfit` and `priceStopLoss`, which might have been modified by trailing stop mechanisms. Timestamps, `scheduledAt` and `pendingAt`, are provided to track the order's lifecycle.


## Interface ActivePingContract

This describes the `ActivePingContract`, a tool for keeping track of active pending signals during monitoring. You'll receive these updates roughly every minute while a pending signal remains open. 

The ping provides valuable information, like the trading symbol (e.g., BTCUSDT), the strategy and exchange involved, and the full signal data – including details like entry price, take profit, and stop loss. It also includes the current market price at the time of the ping, and whether the ping originates from a backtest or live trading environment.

You can use this data to create custom logic and management processes to respond to the ongoing state of your pending signals. Think of it as a heartbeat, allowing you to react to a signal's lifecycle as it progresses. 


## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, meaning a trade is about to happen. It provides a wealth of information about the upcoming or executed trade, including a unique identifier, the exact time of activation, and whether it's happening in a live or backtesting environment.

You'll find details about the trading pair (like BTCUSDT), the strategy responsible, and the exchange involved. Crucially, it outlines the trade's parameters: whether it’s a long or short position, the entry price, and any take profit or stop loss levels.

The notification also breaks down the trade's financial characteristics: potential profit and loss, peak profit achieved so far, maximum drawdown experienced, and performance metrics calculated in both USD and as a percentage. You'll also see details on any DCA averaging that might have been applied and partial closes executed. Finally, it provides timestamps for signal creation and pending states, along with the current market price and an optional note to explain the reasoning behind the trade.

## Interface ActivateScheduledCommit

This interface describes a signal event that activates a previously scheduled trade. It contains all the details about that trade, including whether it's a long or short position and the entry price. You'll also find information about the trade's performance, like its profit and loss (pnl), peak profit, and maximum drawdown. 

It provides a record of the current market price, the original and adjusted take profit and stop loss levels, and timestamps indicating when the signal was created and when it's being activated.  The `activateId` field allows for an optional custom identifier to be added to help track why the activation is happening.
