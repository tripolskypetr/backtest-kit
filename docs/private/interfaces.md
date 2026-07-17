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

This interface describes the information provided when a walker is being stopped. 

It's used to signal that a particular walker, running a specific strategy on a specific trading symbol, needs to be halted. 

Think of it as a notification indicating which walker should pause its operations, especially useful when you have several walkers active at once on the same market. 

The message includes the symbol being traded, the name of the strategy being used, and the specific name of the walker being stopped – allowing you to precisely target the interruption.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. 

It builds upon the existing WalkerResults data, adding extra information to compare how different strategies performed against each other. 

Specifically, it includes an array called strategyResults, which lists all the results you gathered during your backtesting process, making it easy to analyze and draw conclusions about which strategies were most effective.

## Interface WalkerContract

The WalkerContract represents progress updates as backtest-kit evaluates different trading strategies against each other. It's like a notification you get after each strategy finishes being tested. 

Each update includes details about the specific test, such as the walker's name, the exchange and frame used, the symbol being traded, and the name of the strategy that just finished running.

You'll also receive performance data—specifically, the backtest statistics and a key metric value being optimized. The current best strategy and its metric value are shared alongside how many strategies have been tested out of the total. This allows you to monitor the optimization process and see how each strategy ranks.

## Interface WalkerCompleteContract

This interface describes the final notification you receive when a backtesting process is complete. It holds all the results from running and comparing multiple trading strategies. You'll find details like the name of the walker, the trading symbol being tested, the exchange and timeframe used.

It also includes information about the optimization metric, the total number of strategies evaluated, and importantly, the name and value of the best-performing strategy. Finally, it provides detailed statistics for that top strategy, allowing you to thoroughly analyze its performance.

## Interface ValidationErrorNotification

This notification type signals that a validation error occurred during the backtesting process. 

It's emitted when the risk validation functions encounter problems, providing details about the error. 

Each notification has a unique identifier, a human-readable error message, and a serialized error object containing a stack trace and other relevant data. 

You’ll find that the `backtest` property is always false, because these errors originate from the live context, not the backtest itself. This helps differentiate between errors arising from the backtest logic and those happening in the live trading environment.

## Interface ValidateArgs

This interface, `ValidateArgs`, is essentially a blueprint for ensuring the names of different components within the backtest kit are correct and consistent. 

Think of it as a way to double-check that you're using the right names for things like the exchange you’re trading on (ExchangeName), the timeframe of your data (FrameName), or the specific trading strategy you've chosen (StrategyName). 

Each property in the interface represents one of these names, and they all expect a specific type, commonly an enumeration, that holds the allowed values. 

By using this interface, the framework can automatically verify that your names are valid, preventing errors and making sure everything works together smoothly. This helps with maintaining order and accuracy across your backtesting setup.


## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed. It's like a confirmation that your trailing stop-loss or take profit has adjusted and triggered a trade.

The notification includes a unique ID and timestamp for tracking purposes, along with details about whether it happened during a backtest or live trading.  You'll find specifics about the trading pair, the strategy that triggered the action, the exchange used, and the unique signal ID associated with it.

It provides comprehensive details about the trade itself – the percentage shift applied to the original take profit distance, the current market price, the trade direction (long or short), and the entry and adjusted take profit/stop-loss prices. You also get details on the original prices before any trailing adjustments, along with information about any DCA (Dollar Cost Averaging) or partial closing that might have been involved.

Beyond the trade specifics, it presents a full picture of the position's performance, including profit/loss (P&L) calculations, peak profit and maximum drawdown figures, and relevant price points and percentages.  Finally, a note field allows for adding a human-readable explanation for the signal.

## Interface TrailingTakeCommit

This interface represents a trailing take profit event that occurs within the backtest-kit framework. It provides detailed information about a trade's movement as it hits a trailing take profit level. 

The `action` property confirms this is a trailing take event.  You'll also find the `percentShift`, which defines how the take profit price is adjusted based on price movement. 

The event contains key data points about the trade's performance like the `currentPrice` at the time of the adjustment, the total `pnl` of the position, and records of `peakProfit` and `maxDrawdown` achieved.

Further details include the trade's direction (`position`), the `priceOpen` (entry price), and the newly calculated `priceTakeProfit`.  You can also see the `priceStopLoss` which may have been adjusted due to trailing. 

The original, pre-trailing take profit and stop loss prices are accessible via `originalPriceTakeProfit` and `originalPriceStopLoss` respectively. Timestamps for the event creation (`scheduledAt`) and position activation (`pendingAt`) are also included for accurate timeline tracking.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including the unique identifier, when it happened, and whether it occurred during a backtest or live trading. You'll find details about the trading pair, the strategy that generated the signal, and the exchange involved.

The notification also breaks down the specifics of the trailing stop itself, like the percentage shift applied, and the resulting stop-loss and take-profit prices. 

Beyond just the mechanics, you get a comprehensive picture of the trade's performance. This includes profit and loss figures, peak profit, maximum drawdown, and the entry and exit prices used in those calculations.  The 'note' field allows for extra context about *why* the signal was generated. Finally, timestamps help you track the signal's lifecycle - from creation, to pending, and finally execution.

## Interface TrailingStopCommit

This describes an event triggered when a trailing stop mechanism adjusts a trade. It tells you the action taken was a trailing stop, and provides a snapshot of the trade's details at that moment. 

You’ll find the current market price, the direction of the trade (long or short), and the original entry price. Importantly, it shows the *effective* take profit and stop-loss prices after the trailing adjustment, alongside their initial values.

The event also contains performance metrics, like the position’s profit and loss (pnl), the highest profit achieved (peakProfit), and the maximum drawdown encountered. A timestamp indicates when the signal was generated, and another shows when the position initially became active.

## Interface TickEvent

This describes a standardized format for events within the trading framework, ensuring consistent data reporting regardless of the specific action taken. Each event, like a signal being scheduled, a position being opened, or a trade being closed, is represented by this `TickEvent` object.

It provides comprehensive information, including timestamps, the type of action taken (scheduled, cancelled, opened, etc.), and key details related to the trade itself, such as the symbol, signal ID, position type, and pricing information.

For ongoing trades, you’ll find details on take profit, stop loss, and the progress towards those targets, along with profit and loss calculations (both unrealized and realized).  Events like closures and cancellations also include reasons for the actions. It also keeps track of details like DCA entries and partial closes for more complex trading strategies. The data includes values tracking performance like peak and fall PNL to assess trading effectiveness.

## Interface SyncStatisticsModel

This model holds statistics about signal synchronization events, giving you a clear picture of how your signals are being synced. It organizes all the sync events into a detailed list, so you can examine individual instances if needed. 

You'll also find a total count of all sync events, as well as separate counts for signals that were opened and signals that were closed. These numbers help you understand the overall flow and activity related to your signal synchronization process.

## Interface SyncEvent

This `SyncEvent` object holds all the key details about what happened during a trading signal’s lifecycle, making it easy to create reports and understand the complete picture of a trade. It bundles information like the exact time of the event, the trading pair involved, the strategy and exchange used, and the direction of the trade (long or short).

You'll find crucial information about pricing, including entry prices, take profit and stop-loss levels – both the original and any adjusted values due to trailing stops. The object also tracks details about DCA (Dollar Cost Averaging) and partial closes if applicable.

It includes performance metrics like peak profit, maximum drawdown, and the overall profit and loss (PNL) of the trade. For closed signals, it will state the reason for closure. The `createdAt` field gives you an ISO timestamp record of when the event was initially logged. It also indicates whether the signal came from a backtest simulation or live trading.

## Interface StrategyStatisticsModel

This model holds statistics about your trading strategy's performance, specifically focusing on the types of actions it took. You'll find a detailed list of every event that occurred, along with a total count of all events.

It breaks down the actions into categories like canceled scheduled orders, close pending orders, partial profits, partial losses, trailing stop adjustments, trailing take profits, breakeven adjustments, activate-scheduled, and average buy (DCA) actions. This allows you to understand the behavior of your strategy and how often it engages in different types of trading maneuvers.

## Interface StrategyEvent

This `StrategyEvent` object holds all the key information about what's happening within your trading strategy, making it easier to understand and report on its performance. Think of it as a detailed log entry for every significant action your strategy takes. It captures details like when an action occurred (`timestamp`), what trading pair was involved (`symbol`), the strategy's name (`strategyName`), and even if it's a backtest or live trade (`backtest`).

You'll find specifics about the trade itself, such as the direction (`position`), entry price (`priceOpen`), and stop-loss/take-profit levels (`priceStopLoss`, `priceTakeProfit`). If your strategy uses trailing stops or take profits, you'll also see the original and adjusted prices. For strategies that use dollar-cost averaging (DCA), there's information about the effective entry price and the number of entries (`effectivePriceOpen`, `totalEntries`).

Furthermore, this object includes details about any pending or scheduled actions, along with the associated IDs, and provides the profit and loss (`pnl`) at the moment of the action. A helpful `note` field allows you to add custom information to each event, providing context for specific actions.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal is set to execute in the future. It's like a heads-up that a trade is about to happen, whether you're running a simulation (backtest) or live trading. The notification includes a ton of details – a unique ID for the signal, the exact time it’s scheduled, and whether it's a backtest or live trade.

You'll also find information about the specific trading pair (like BTCUSDT), the strategy that generated the signal, the exchange it will use, and the trade direction (long or short).  It breaks down the price targets – the entry price, take profit, and stop loss – and even the original prices before any adjustments were made.

If the strategy uses averaging techniques (DCA), you'll see the total number of entries and partial closes involved.  Crucially, it provides details on the cost of the trade and the potential profit and loss (PNL), including peak profit, maximum drawdown, and performance percentages. There are also records about the prices and costs at those peak and drawdown points.  Finally, you'll find a timestamp of when the entire notification was created and an optional note explaining the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a comprehensive snapshot of the trade, including details like a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find key information such as the trading symbol, the strategy that initiated the trade, the exchange used, and the direction of the trade (long or short).

The notification also breaks down the specifics of the position itself – entry price, take profit, stop loss, and the original prices before any adjustments. It tracks the usage of dollar-cost averaging (DCA) with details on the number of entries and partial closes.

Furthermore, you'll see financial metrics such as the cost of the position, the total profit and loss (PNL), peak profit achieved, maximum drawdown, and percentage-based profit/loss calculations. Additional data points cover prices at peak profit and maximum drawdown, along with relevant costs and percentages at those points. Finally, an optional note field provides a human-readable explanation for the trade.

## Interface SignalInfoNotification

This notification type tells you about informational events broadcast by a trading strategy for an open position. It’s like a strategy sending a quick update about what's happening with a trade.

Here's a breakdown of what the notification contains:

*   **Identification:** Each notification has a unique ID, a timestamp, and indicates whether it's from a backtest or live trading.
*   **Trade Details:** You'll find the trading pair (like BTCUSDT), the strategy’s name, the exchange used, and a unique signal ID.
*   **Position Information:** It includes the current price, trade direction (long or short), and the entry price. You can also see the take profit and stop-loss levels, both the original values and any adjusted values due to trailing.
*   **DCA & Partial Closings:** If the strategy used DCA (Dollar-Cost Averaging), you'll see how many entries were made.  Similarly, if partial closing orders were executed, the number of partials is provided.
*   **Performance Metrics:** It gives you a look at the position’s performance, including total profit and loss (PNL), peak profit, maximum drawdown, and these values as percentages. You'll also find the entry and exit prices used for PNL calculation.
*   **Custom Note:** Importantly, it carries a user-defined note – a message the strategy itself wants to communicate.
*   **Additional Timestamps:** The notification also includes timestamps for when the signal was initially created, became pending, and when the notification itself was generated.



This is very helpful for understanding what a strategy is doing and why, and for tracking a position’s journey in more detail.

## Interface SignalInfoContract

This interface defines the information shared when a strategy sends out a custom notification about its actions. It's like a broadcast message from a strategy, letting other parts of the system know something important happened, such as an order being placed or a trade adjusted. The message includes details like the trading symbol, the strategy’s name, the exchange involved, and the timeframe being used.

You'll also find the complete signal data that triggered the notification, the current price at that moment, and any custom notes or identifiers the strategy might have added. Finally, it tells you whether the event occurred during a backtest (using historical data) or during live trading. This allows you to filter and react to specific events based on their context.

## Interface SignalEventContract

This framework provides a way to monitor the lifecycle of pending trading signals without needing to constantly track the entire signal stream. It lets you know when a position is either opened or closed, giving you visibility into the active phase of your strategies. 

The `SignalEventContract` describes these events, which can happen for various reasons – like when a new signal triggers a trade, or when a position is closed due to a stop-loss or take-profit. It includes key details like the trading pair, the strategy involved, the timeframe being used, and the complete data for the signal itself. 

If a position is closed, you'll also get information about *why* it was closed (take profit, stop loss, time expiry, or user action). It also provides the current price at the time of the event and a flag indicating whether the event occurred during a backtest or live trading session. Finally, it provides a timestamp marking the precise moment the event occurred.

## Interface SignalData$1

This `SignalData` object holds all the important details about a closed trading signal, perfect for analyzing performance. It tells you which strategy created the signal, gives it a unique ID, and identifies the specific symbol being traded. You'll also find information about whether it was a long or short position, how much profit or loss was made (expressed as a percentage), and the reason the signal was closed. Finally, it includes timestamps to show exactly when the signal started and ended, allowing you to track its lifecycle.

## Interface SignalCommitBase

This defines the fundamental information shared by every signal commit event within the backtest-kit framework. Each signal commit will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange it's associated with. 

You’ll also find information about whether the signal came from a backtest or live trading environment, a unique identifier for the signal, and the timestamp of its execution. 

Additional properties explain how many entries and partial closes have occurred, the initial entry price, the complete signal data itself, and an optional note to describe the reasoning behind the signal. This provides context and a record of what happened during a trading decision.

## Interface SignalClosedNotification

This notification details when a trading position is closed, whether due to a take profit, stop loss, or time expiry. It provides a wealth of information about the trade, including a unique identifier, the timestamp of the close, and whether it occurred during backtesting or live trading.

You’ll find details like the trading symbol, strategy name, and exchange used, alongside specifics about the position itself – its entry and exit prices, the initial take profit and stop loss levels, and even any trailing adjustments made.

It also includes crucial performance data such as profit/loss percentage and total profit/loss in USD, peak profit and drawdown metrics, and a breakdown of entries, partial closes, and cost data. Furthermore, you can find information concerning position duration, reason for closure and time when signal was scheduled.

## Interface SignalCancelledNotification

This notification lets you know when a trading signal was cancelled before it had a chance to execute. It provides a lot of details about the cancelled signal, so you can understand what happened and why.

You’ll find information like the signal’s unique ID, the trading symbol involved (e.g., BTCUSDT), and the strategy that created it. 

The notification also includes specifics about the intended trade, such as the planned take profit and stop-loss prices, and details about any potential DCA (Dollar Cost Averaging) setup or partial closes that were considered. The 'cancelReason' field tells you *why* the signal was cancelled – whether it was due to a timeout, a price rejection, or a manual cancellation.  You'll also get timestamps to understand the signal's lifecycle, from its creation to its cancellation.

## Interface Signal

This `Signal` object holds crucial information about a trading position.

It tracks the opening price of the trade (`priceOpen`), which is the price at which you initially entered the position.

The `_entry` property is an array of objects, each representing a specific entry point for the position, detailing the price, cost, and timestamp of that entry.

Finally, `_partial` is an array that captures details about any partial exits or adjustments made to the position, including the type (profit or loss), percentage, current price, cost basis, entry count at the time of the partial exit, and the timestamp. It allows you to analyze how the position was managed over time.

## Interface Signal$2

The `Signal` object in backtest-kit holds key information about a trading signal. 

It tracks the entry price for a position with the `priceOpen` property, giving you the initial price at which the trade was made.

You’ll also find a record of all entry events using the `_entry` array, detailing the price, cost, and timestamp for each entry.

Finally, the `_partial` array stores information about any partial exits, including the reason (profit or loss), percentage, current price, cost basis at the time of the exit, and timestamp. This helps you analyze and understand your partial exit strategies.

## Interface Signal$1

This section describes the `Signal` object, which holds key information about a trading signal.

The `priceOpen` property tells you the price at which the position was initially entered.

The `_entry` array keeps track of each entry made for the position, storing the entry price, associated costs, and the timestamp of the entry.

The `_partial` array records details of any partial exits, including whether they were taken for profit or loss, the percentage of the position closed, the price at which the partial exit occurred, the cost basis at the time of the close, the number of shares/contracts closed and the timestamp.

## Interface ScheduledEvent

The ScheduledEvent object provides a single place to find all the important details about trading events – when they were scheduled, opened, or cancelled. It bundles together a lot of information, making it easy to generate reports and analyze trading activity.

Each event includes a timestamp, indicating when it occurred or was planned. You'll also find the specific action taken (scheduled, cancelled, or opened) along with details like the trading symbol, signal ID, and position type.

Beyond the basics, it contains pricing information like the original entry price, take profit, and stop-loss levels – including any modifications made.  For events involving multiple entries or partial closes, you'll find counts and executed percentages. 

If a trade was cancelled, reasons and IDs are also included, alongside the time elapsed.  For opened positions, you can find the timestamp when the position became active. Finally, the object includes real-time profit and loss (PNL) data, offering a snapshot of the trade’s current financial status.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled trading signals are performing. It gives you a complete picture by tracking every event—signals scheduled, activated, and cancelled—and summarizing them with key metrics.

You’ll find a detailed list of all scheduled events, including their specifics. 

Beyond the raw counts of scheduled, opened, and cancelled signals, it calculates crucial rates: the cancellation rate (how often signals are cancelled) and the activation rate (how often scheduled signals turn into live trades). 

It also provides insights into timing by showing the average waiting times for both cancelled and activated signals, expressed in minutes. This data empowers you to evaluate your scheduling strategy and identify areas for improvement.

## Interface SchedulePingContract

This defines how the backtest-kit framework communicates about scheduled signals that are currently being monitored. It sends out little updates, called "schedule pings," every minute while a signal is active – meaning it's not yet activated or cancelled.

These pings provide information about the signal, including the trading pair, the strategy running it, the exchange being used, and the timeframe involved.  You'll also get the full details of the signal itself, the current market price, and whether this is a backtest run or live trading.

Essentially, it lets you keep track of what's happening with your scheduled signals and even build custom logic to react to those signals – like automatically cancelling a signal if the price moves outside a certain range.  You can listen for these pings to build your own monitoring tools.

## Interface ScheduleEventContract

The `ScheduleEventContract` helps you keep track of signals that are scheduled for potential trading but haven't yet been activated. It lets you know when a signal is initially scheduled and when it's removed before it ever gets a chance to trade.

You can listen for these events to monitor the lifecycle of your signals without needing to constantly check all the regular signal data.

The events tell you whether a signal was added to the schedule or removed, along with key details like the trading symbol, the strategy that created it, and the timeframe it applies to. 

If a signal is cancelled before it's activated, you'll also see the reason why (like a timeout or user cancellation).  The `currentPrice` gives you the market price at the moment the event occurred, and `backtest` indicates whether the event is happening during a backtest or live trading. The `timestamp` tells you exactly when the event happened, using the live tick time or the candle timestamp during backtesting.

## Interface RiskStatisticsModel

This model holds information about risk events encountered during trading. It’s designed to give you a clear picture of how often risk rejections are happening and where they're occurring.

You'll find a detailed list of each individual risk rejection event in the `eventList` property, allowing you to examine specific occurrences. The `totalRejections` property simply tells you the overall number of times a risk rejection was triggered.

To understand patterns, the data is also broken down: `bySymbol` shows you how many rejections happened for each trading symbol, and `byStrategy` indicates how many rejections were associated with each trading strategy. This breakdown helps pinpoint potential problem areas in your trading setup.


## Interface RiskRejectionNotification

This notification informs you when a trading signal has been blocked by risk management rules. It's essentially a heads-up that something prevented a trade from happening.

Each notification has a unique ID, a timestamp, and indicates whether it originated from a backtest or live trading environment. It also specifies the symbol involved (like BTCUSDT), the name of the strategy that generated the signal, and the exchange where the rejection occurred.

The most helpful part is the `rejectionNote`, which gives a clear explanation of *why* the signal was rejected. You’ll also find details about the current market conditions, like the price at the time, and how many positions were already open.

If there was a pending signal, its unique identifier is included, along with the trade direction (long or short), entry price, take profit, stop loss, estimated duration, and a potentially helpful description of the signal itself. Finally, a timestamp records when the notification was created.

## Interface RiskEvent

The `RiskEvent` provides details whenever a trading signal is blocked due to risk management rules. It essentially tells you *why* a trade didn’t happen.

Each `RiskEvent` includes information like when the event occurred (timestamp), which trading pair was involved (symbol), the specifics of the signal that was rejected (currentSignal), the name of the strategy that generated it, and the exchange and timeframe being used.

You'll also find the current price at the time of the rejection, how many positions were already open, and a unique ID to track the specific rejection.  A note explains the reason for the rejection, and indicates whether the event came from a backtest or live trading environment. It’s a valuable resource for understanding and refining your risk management system.


## Interface RiskContract

This interface, RiskContract, is designed to give you detailed information whenever a trading signal is blocked due to risk validation. It only reports events where a signal was actually rejected – not when signals are allowed – so you're only seeing the instances that require attention.

Think of it as an audit trail for your risk management.

It provides information like the symbol of the trading pair involved (e.g., BTCUSDT), the specifics of the signal that was rejected (including position size, prices, etc.), and the name of the strategy that attempted to execute it.  You'll also find details about which frame it was related to, which exchange was being used, and the current market price at the time of the rejection.

The `activePositionCount` tells you how many positions you already had open at the time, helping you understand your portfolio exposure.  A unique `rejectionId` makes tracking and debugging issues easier, and a `rejectionNote` explains why the signal was rejected in plain language. Finally, a timestamp and a flag indicating whether the event occurred during a backtest provide additional context. Components like the report generation service and user callbacks rely on this data to monitor and manage risk effectively.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` provides updates on the progress of a background trading strategy evaluation process. Think of it as a report card during a large-scale backtest.

It tells you which walker, exchange, and frame are currently being worked on, along with the trading symbol involved. 

You'll also see how many total strategies are being evaluated and how many have already been processed. 

Finally, a `progress` value gives you the overall completion percentage, ranging from 0.0 (just starting) to 1.0 (finished). This allows you to monitor long-running evaluations and get a sense of how much longer they'll take.

## Interface ProgressBacktestContract

This contract provides updates on the status of a backtest as it runs. You'll receive these updates while a backtest is in progress, allowing you to monitor its advancement. Each update includes the exchange and strategy names being used, the trading symbol being backtested, the total number of historical data points being analyzed, how many of those points have already been processed, and a percentage representing how much of the backtest is complete. Think of it as a progress bar for your backtest, giving you insight into how far along it is and how much longer it might take.

## Interface PerformanceStatisticsModel

This model represents the overall performance of a trading strategy. It holds key information like the strategy's name, the total number of performance events that were tracked, and the total time it took to calculate those metrics. 

You'll find detailed statistics broken down by metric type within the `metricStats` property, giving you a granular view of how different aspects of the strategy performed.  Finally, the `events` array contains all the individual raw performance data points collected, allowing for in-depth analysis if needed.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how quickly different parts of your trading system are running. It records events like the time taken to execute a trade or process data.

Each event includes a timestamp to show when it happened and a previous timestamp to measure the time difference. 

You'll also see information like the specific trading strategy involved, the exchange it's happening on, the name of the data frame being used (or an empty string if it’s live trading), and the trading symbol.

Knowing whether the metric comes from a backtest or live execution is also included. 

This data is valuable for spotting slow areas in your system and optimizing its performance.

## Interface PartialStatisticsModel

This model holds data about partial profit and loss events during a backtest or trading simulation. It allows you to examine the results of specific milestones or steps in a strategy.

The `eventList` property gives you access to detailed information about each individual profit or loss event that occurred. You can use this to investigate specific occurrences.

`totalEvents` simply tells you the overall number of profit and loss events observed.  `totalProfit` and `totalLoss` represent the counts of how many times a profit or loss event occurred, respectively. These properties give you a quick view of the distribution between profitable and losing events.

## Interface PartialProfitContract

The `PartialProfitContract` represents a signal reaching a predefined profit milestone during trading, like 10%, 20%, or 30% profit. It's a way to track how a strategy's profits are progressing.

This event is triggered by the trading framework and provides a lot of details about the trade. It includes things like the trading pair symbol, the strategy being used, the exchange and frame, and the initial signal data.

You’ll also find the current price at the time the level was reached, the specific profit level achieved, whether the trade is part of a backtest or live trading, and a timestamp to indicate when it occurred. This information is invaluable for performance monitoring and creating reports on strategy execution. The framework ensures these events are not duplicated.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken – essentially, a portion of your trade has been closed. It provides a wealth of details about the trade, including a unique ID, the exact time it happened, and whether it occurred during a backtest or live trading.

You’ll find key information like the trading pair (e.g., BTCUSDT), the strategy that triggered the action, and the current market price at the time of the partial close. It also includes details about the original entry price, take profit, and stop loss levels.

Beyond the basics, this notification dives into performance metrics. You can see the total profit and loss (pnl), the peak profit and maximum drawdown achieved during the position's life, along with the prices and costs associated with those events. It even details how many entries were made and how many partial closes have occurred.  A note field might provide extra context about why the partial profit was taken. Finally, timestamps pinpoint when the signal was created, went pending, and when this notification was generated.

## Interface PartialProfitCommit

This represents a signal to take a partial profit on a trading position. It contains details about the action being taken – specifically, closing a portion of the current position. You'll find information here such as what percentage of the position should be closed, the current market price when the signal was generated, and the total profit and loss realized on the position so far, including all previous entries and partials.

The signal also provides insights into the position's performance, including its peak profit, maximum drawdown, and trade direction (long or short).  You'll also see the entry price, original and adjusted take profit and stop loss prices, as well as timestamps indicating when the signal was created and when the position was initially activated. This comprehensive data allows for a detailed understanding of the reason and context behind the partial profit taking decision.

## Interface PartialProfitAvailableNotification

This notification tells you when your trading strategy has reached a profit milestone, like 10%, 20%, or 30% of its potential. It's a signal that things are going well!

Each notification has a unique ID and a timestamp showing when that milestone was hit. You'll also see if it's from a backtest (simulated trading) or live trading.

It includes key details about the trade itself: the trading pair (like BTCUSDT), the strategy used, the exchange involved, and the signal ID.  You'll find the level reached (e.g., 10%, 20%), the current price, the initial entry price, and the direction of the trade (long or short).

It also provides insight into the position's management: the take profit and stop loss prices, both the original and adjusted values.  You can see how many times the position was averaged (through DCA) and how many partial profit takes have occurred.

Crucially, it shows you the position’s performance – total profit and loss, peak profit, maximum drawdown, and related metrics, all expressed in both percentages and raw dollar values.  Details are also provided about the prices used in these calculations, as well as entry and exit counts.

Finally, a note field lets you add a description for your records and provides the timing related to signal creation and its activation.

## Interface PartialLossContract

The PartialLossContract represents a specific event where a trading strategy experiences a partial loss – hitting predefined loss levels like -10%, -20%, or -30% from its initial entry price.  Think of it as a signal that a strategy is trending unfavorably, and the loss is reaching a certain threshold.

These events are triggered by the trading framework and provide details about the loss, including the symbol being traded, the strategy involved, the exchange and frame used, and the current market price. Importantly, each loss level is only reported once for a given signal.

You'll find crucial information like the original signal data and the precise loss percentage (the "level") within these contracts.  A 'backtest' flag indicates whether the event occurred during a historical simulation or live trading. The timestamp indicates when this level was reached, which differs slightly between live and backtest modes.

This information is used to monitor strategy performance, track stop-loss behavior, and generate detailed reports, allowing you to understand how strategies are performing under different conditions.

## Interface PartialLossCommitNotification

This notification signals that a portion of your trading position has been closed. It provides detailed information about the partial loss, including a unique identifier, the exact time it occurred, and whether it happened during a backtest or live trading. You'll find specifics like the trading pair involved (e.g., BTCUSDT), the strategy that triggered the action, and the exchange used. 

The notification breaks down the specifics of the trade: how much of the position was closed (as a percentage), the current market price, the trade direction (long or short), and the original entry price. It also includes the take profit and stop loss prices, both the original values and any adjusted values due to trailing. 

You'll see a wealth of performance data, including total profit/loss, peak profit, maximum drawdown, and their respective prices and percentages. The notification also includes entry-level details like total capital invested and the number of entries and partial closes executed. Finally, it includes a note field for any extra explanation of why this partial closure was executed.

## Interface PartialLossCommit

This object represents a partial loss event occurring within a trading strategy. It details actions taken to close a portion of an existing position, providing comprehensive information about the trade's lifecycle and performance. 

The `action` property simply identifies this as a partial loss event. The `percentToClose` indicates what percentage of the position was closed.

Key performance metrics are included: `pnl` shows the total profit and loss from the closed portion of the position, while `peakProfit` and `maxDrawdown` report the highest profit and largest loss experienced by the position up to this point. 

You'll also find details about the trade itself, like the `position` direction (long or short), the `priceOpen` at entry, and the `priceTakeProfit` and `priceStopLoss` levels. Both original and adjusted prices for take profit and stop loss are provided for clarity.

Finally, timestamps – `scheduledAt` and `pendingAt` – mark when the signal was created and when the position initially activated.

## Interface PartialLossAvailableNotification

This notification alerts you when a trading position hits a predefined loss milestone, like a -10% or -20% drawdown. It's a signal that things aren't going as planned, and it provides a wealth of information about the situation. 

The notification includes a unique ID, a timestamp, and whether it's from a backtest or live trade.  You'll see details like the trading pair, the strategy involved, and the exchange where the trade took place.

Crucially, it tells you the level of loss reached (10%, 20%, etc.), along with the current price, entry price, and the trade direction (long or short).  You'll also find the original take profit and stop loss levels, before any trailing adjustments were applied.

Beyond the basics, you get a complete picture of the position's history.  This includes how many DCA entries were made, how many partial closes have occurred, and key performance metrics like total profit/loss, peak profit, and maximum drawdown, all expressed both in absolute terms and as percentages.

The notification also provides details about the price points associated with those metrics, along with costs and entry counts.  Finally, there’s a field for an optional note, giving further context about the situation.  Timestamps indicate when the signal was created, scheduled, and when the position became pending, offering a full timeline of events.

## Interface PartialEvent

This data structure holds all the key information about when your trading strategy hits profit or loss milestones. It's designed to give you a detailed picture of your strategy's performance during a backtest or live trade. 

Each `PartialEvent` captures specific events like reaching a 10% profit level, or hitting a loss target. You'll find details like the exact time the event occurred, whether it was a profit or loss, the trading pair involved, and the name of the strategy that triggered it. It also includes crucial information about the trade itself, such as the entry price, take profit levels, stop loss prices, and the total number of entries if you’re using a dollar-cost averaging (DCA) approach.

Beyond the basics, you'll also see data like the total executed percentage from partial closes, the unrealized profit and loss at that moment, and any notes you added to explain the signal’s reasoning. Knowing when a position became active and when the signal was initially created is also included. Finally, a flag indicates whether the event happened during a backtest or a live trade.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or through a scheduled order. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it was part of a backtest or live trading. 

You’ll find details like the trading symbol, the strategy that triggered it, and the exchange used. It also includes key performance indicators (KPIs) like profit & loss (PNL), peak profit, maximum drawdown, and entry/exit prices, helping you understand the trade's performance so far. 

The notification also breaks down specifics like the initial trade price, any stop-loss or take-profit levels, and number of entries or partial closes executed. Finally, timestamps and notes help provide context around the signal’s origin and reason.

## Interface OrderSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it was because a profit target was hit, a stop-loss triggered, the signal expired, or someone manually closed it. It provides a wealth of information about the closed trade, including details like the trading pair, the strategy used, and the exchange where it was executed. You'll find comprehensive performance metrics too, such as total profit and loss, peak profit achieved, maximum drawdown experienced, and key price points throughout the trade's lifecycle.

The notification also includes information about the signal's history - when it was initially created, when the position was activated, and details on any averaging or partial closures that may have occurred. A specific reason is provided, alongside a potentially helpful note explaining the circumstances surrounding the closure, alongside timestamps for creation and scheduling. Ultimately, this notification gives a complete picture of a signal's performance from beginning to end.


## Interface OrderSyncCheckNotification

This notification provides updates about the status of your open orders, specifically designed to ensure they remain synchronized with the exchange. It's a "ping" sent periodically while a trading signal is active, confirming the order is still valid on the exchange. To prevent overload, these pings are limited to once every 15 minutes per signal, unless the signal is closed or cancelled.

The notification includes a wealth of information about the order, such as the trading pair, strategy name, and the signal’s unique identifier. You'll find details about the order type (whether it's an active position or a scheduled order), current market price, and the original order parameters like entry and stop-loss prices. 

Furthermore, it provides insight into the position's performance, including realized and unrealized profit/loss, peak profit, and maximum drawdown, along with the total capital invested and the number of entries made.  The `createdAt` timestamp indicates when the notification itself was generated. This data is crucial for monitoring order health and assessing trading performance.

## Interface OrderSyncBase

This defines the common information shared across different order synchronization events within the backtest-kit framework. It acts as a foundation for understanding what's happening with orders, whether they're being actively managed or scheduled.

Each event carries details like the trading symbol, the name of the strategy that generated the signal, and the exchange used. You’ll also find the timeframe, whether the test is a backtest or live trade, and a unique identifier for the signal itself.

The `attempt` field is important for tracking retries – it shows how many times the system has tried to execute an order before. It helps manage situations where orders fail and need to be retried, with limits to prevent endless attempts. Finally, there’s a timestamp indicating exactly when the event occurred.

## Interface OrderOpenContract

This event tells you when a planned order – like a limit buy or sell – has actually been filled and a position is officially open. It's a confirmation that the framework successfully entered a trade based on a predetermined price.

Think of it as a notification sent out when your pre-set order is executed on the exchange.

The information provided includes the price at which the order was filled, the overall profit and loss (pnl) of the position up to that point, and details about the take profit and stop-loss levels originally set. You’ll also find data about the costs involved, the trade direction (long or short), and the timestamps related to when the order was initially planned and finally activated.

It's particularly useful if you're building external systems to keep track of your trades or need a record of when specific orders were executed. The level of detail also provides insight into the position’s performance, including peak profits and maximum drawdowns experienced so far. The number of entries and partials shows how much averaging has been applied to the position.

## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, expiring, or a manual closure. It's designed to help systems outside the core trading engine keep track of what's happening with orders, like canceling related orders or updating records of profit and loss in external databases.

The event provides a wealth of information about the closed trade: the market price at the time of closure, the overall profit and loss, the highest profit reached, the maximum loss experienced, the trade direction (long or short), and the original and adjusted prices for entry, take profit, and stop loss. You'll also find details about the trade’s history, like the initial entry price, when the position was activated, and how many times the position was averaged or partially closed. Finally, it tells you *why* the signal was closed.

## Interface OrderCheckContract

The `OrderCheckContract` event is a crucial signal the framework uses to ensure your orders are still active on the exchange. It's fired whenever a signal is being monitored, before the framework decides what to do next. Essentially, it's asking your order management system, "Hey, is this order still open?"

There are two main types: `active` (for open positions) and `schedule` (for pending entry orders).  You, as the listener, need to respond to this event. If your system confirms the order is still open, the check is successful, and the framework will retry later.  However, if the order is gone (filled, canceled, or liquidated externally), you *must* throw an `OrderDeletedError` immediately – this prevents the framework from endlessly retrying a nonexistent order.

Transient errors (like network hiccups) are tolerated, but with a retry limit.  Persistent errors trigger an action. This entire process happens outside of backtest mode, as backtests don’t involve a live exchange. The `attempt` property tracks consecutive failures, helping determine when to escalate a problem.

The event contains a wealth of information about the signal, position, and market conditions at the time the check is performed, including price data, profit/loss information, and original order parameters. This information allows your system to make informed decisions about the order status.

## Interface MetricStats

This data structure holds all the key statistics calculated for a particular type of performance metric. Think of it as a summary of how a specific aspect of your trading system behaved during a backtest.

It includes basic counts of how many times the metric was recorded, along with total and average durations. You'll also find important measures like minimum and maximum values, and a standard deviation to understand the spread of the data.

To help you analyze performance, it provides percentile values (95th and 99th) which show the duration at those specific points in the data distribution. Finally, it tracks wait times—the intervals between events—with average, minimum, and maximum values for a more complete picture.

## Interface MessageModel

This describes a single message within a chat history, like the ones you'd see when interacting with a large language model. Each message has a `role`, which tells you who sent it – whether it’s a system instruction, your input, the model’s response, or a result from a tool. The core of the message is its `content`, which is the text itself.

Sometimes, the model provides extra details about its thinking process, stored in the `reasoning_content` field.

If the model uses tools, it can include `tool_calls` – details about which tools were used and how.  You can also attach images to a message, providing several different formats for the image data. Finally, a `tool_call_id` helps to link a message back to a specific tool call it’s responding to.

## Interface MaxDrawdownStatisticsModel

This model provides a way to understand the maximum drawdown experienced during a trading simulation. It keeps track of individual drawdown events in a list, allowing you to examine the timeline and severity of those losses. 

You can access a complete history of drawdown events through the `eventList` property, which shows them in chronological order, from most recent to oldest. The `totalEvents` property simply tells you how many drawdown events were recorded overall.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown event that occurred during a trading position. It holds key information about when the drawdown happened, the symbol being traded, which strategy was used, and a unique identifier for the signal that triggered the trade.

You'll find details about the position's direction (long or short), its total profit and loss (PNL), and the highest profit achieved during its lifetime. It also records the specific price that triggered the drawdown, along with the entry price, take profit level, and stop-loss orders that were in place. Finally, a flag indicates whether the event occurred during a backtest or live trading.

## Interface MaxDrawdownContract

This contract provides information when a new maximum drawdown is reached for a trading position. It gives you details like the trading symbol, the current price at the time, and when the event happened. You’ll also find the name of the strategy, exchange, and timeframe involved, along with the signal data driving the position. 

A key piece of information is whether this event came from a backtest or live trading, letting you adjust your reaction accordingly.

This data is helpful for actively managing risk. It helps you monitor how much a position has lost value from its highest point, allowing you to implement strategies to protect your capital. The framework will send these updates whenever a new drawdown level is reached, so you can react to changing market conditions. 


## Interface LiveStatisticsModel

This model provides a comprehensive set of statistics to evaluate the performance of your live trading strategies. It aggregates data from every trade event, offering insights into profitability, risk, and market behavior.

You can track the total number of trades, wins, losses, and key performance indicators like win rate, average profit per trade, and total profit.  It also calculates more advanced metrics for risk-adjusted return, such as the Sharpe Ratio, Sortino Ratio, and Calmar Ratio, helping you understand how much return you’re getting for the risk you're taking.

Beyond simple profit and loss, the model analyzes trade durations, volatility (standard deviation), and consecutive winning/losing streaks to give a more nuanced picture of your strategy's performance.  You'll also find pressure metrics revealing buyer and seller trends, and a trend analysis classifying market behavior. Each numerical value might be null if it's impossible to compute reliably. The `eventList` provides access to details of each individual trade.

## Interface InfoErrorNotification

This component helps you understand and handle errors that pop up during background processes. Think of it as a gentle alert system—it's letting you know something went wrong, but it's not necessarily a critical, stop-everything kind of problem. Each notification has a unique ID so you can track it, plus a clear error message to help you figure out what happened. The notification also includes detailed information about the error, like a stack trace and any extra data attached to it. Importantly, these notifications always relate to the live trading context, not a backtest simulation.

## Interface IdlePingContract

The IdlePingContract defines what happens when a trading strategy isn't actively making decisions – essentially, a period of inactivity. 

It's a notification sent when there are no signals being monitored, helping you track the lifecycle of your strategies.

The contract includes details like the trading symbol, the strategy's name, the exchange it’s on, and the current price at the time of the ping.

You can also determine if the event originated from a backtest (historical data) or live trading. 

Finally, a timestamp indicates precisely when the idle ping occurred, either during live trading or as part of a backtest simulation.

## Interface IWarmCandlesParams

This interface defines the settings you need to specify when preparing historical candle data for backtesting. Think of it as telling the system exactly what data it needs to download – which trading pair (like BTCUSDT), from which exchange, over what time period (specified by the candle interval), and covering a specific start and end date. It helps you get the data ready before the actual backtest begins, potentially speeding up the process.


## Interface IWalkerStrategyResult

This interface describes the outcome of running a single trading strategy within a backtest comparison. It holds the strategy's name, a set of statistics generated during the backtest (like profit, drawdown, etc.), and a calculated metric value used to evaluate its performance. Finally, it includes a rank representing the strategy's standing relative to other strategies in the comparison, with a lower number indicating a better rank.

## Interface IWalkerSchema

The IWalkerSchema helps you set up and manage A/B tests for your trading strategies. Think of it as a blueprint for defining how you want to compare different strategies against each other. 

It lets you give each test a unique name and add notes for yourself to remember details later.

You specify the exchange and timeframe you want to use for the backtest, and most importantly, list the names of the strategies you're comparing.

The schema also lets you choose which performance metric, like Sharpe Ratio, you want to optimize for.  Finally, you can optionally attach callback functions to trigger actions at different points during the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after running a walker, which is essentially a comparison of different trading strategies. It tells you which symbol was being tested, the specific exchange used for the backtest, the name of the walker that ran the tests, and the timeframe (like 1-minute or daily) used for those tests. Think of it as a report card summarizing the overall execution of a backtesting process.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process, receiving notifications at key moments. Think of it as a way to be informed about what's happening behind the scenes as the framework tests different trading strategies.

You can get notified when each strategy begins testing, providing the strategy’s name and the symbol being traded. You’ll also receive a notification when each strategy finishes, including statistics about its performance and a key metric.

If a strategy encounters a problem during testing and throws an error, you’ll be alerted to that as well. Finally, once all strategies have run, you’ll receive a notification containing the overall results. This lets you monitor progress, log data, or perform custom actions throughout the backtesting workflow.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing take profit and commitment orders. It represents a request to adjust a trailing stop based on a price shift.

The `action` property simply identifies this as a "trailing-take" action.

`percentShift` specifies the percentage amount to adjust the trailing stop by, determining how much the price needs to move to trigger the stop.

`currentPrice` holds the price level at which the trailing stop was initially established, providing context for the adjustment.

## Interface ITrailingStopCommitRow

This interface represents a queued action for managing trailing stops. Think of it as a message telling the system to adjust a trailing stop based on certain conditions. 

It contains information about the specific action being taken – in this case, a trailing stop modification – along with the percentage shift that needs to be applied to the stop price. 

You'll also find the current price at which the trailing stop was initially established, providing context for the adjustment. Essentially, it's a snapshot of the data needed to correctly execute a trailing stop.

## Interface IStrategyTickResultWaiting

The `IStrategyTickResultWaiting` interface represents a specific state in your trading strategy – when a signal has been scheduled but is currently waiting for the price to reach a defined entry point. You'll receive this type of result repeatedly as the strategy monitors the price and checks if it matches the signal's conditions.

It provides detailed information about the waiting signal, including the signal itself (`signal`), the current price being monitored (`currentPrice`), and key identifiers like the strategy and exchange names (`strategyName`, `exchangeName`), and the timeframe being used (`frameName`).

You also get details about the trade's potential progress, even though it hasn't been executed yet, such as the percentage of the take profit and stop loss targets that have been reached (`percentTp`, `percentSl`), and the unrealized profit and loss (`pnl`).  Finally, it indicates whether this is a backtest or live trade (`backtest`) and a timestamp (`createdAt`) for tracking and debugging.

## Interface IStrategyTickResultScheduled

This type defines the information passed when a strategy generates a scheduled signal – that is, a signal that waits for a specific price level to be reached before executing. It's essentially a notification that a signal has been created and is currently on hold, anticipating a price movement.

The data includes details like the strategy and exchange names, the timeframe being used, and the symbol being traded. You’ll also find the current price at the time the signal was scheduled, which is important for understanding the context of the signal.  It also indicates if the event is part of a backtest or a live trade. Finally, a timestamp is included to track when the signal was created.

## Interface IStrategyTickResultOpened

This object represents a signal that has just been created. It’s sent when a new signal is validated and saved.

You’ll find key information about the signal itself, including its unique ID (through the `signal` property). It also provides context – you'll know which strategy, exchange, and timeframe generated the signal, along with the symbol being traded and the price at the time the signal opened. 

This information is really useful for debugging, tracking performance, or understanding the signal generation process, especially since it also tells you if the event came from a backtest or a live trading environment. The `createdAt` timestamp links the signal back to the originating candle's time, ensuring accurate tracking and analysis.


## Interface IStrategyTickResultIdle

This interface represents a tick result when your trading strategy is in an idle state – meaning it's not actively generating any trading signals. It provides information about the context of that idle state, like the strategy’s name, the exchange used, the timeframe, and the symbol being traded. You’ll find details like the current price and whether the event is part of a backtest. It also includes a timestamp indicating when the idle state began, which is crucial for tracking and analysis. Essentially, this gives you a snapshot of what was happening when your strategy wasn't taking action.


## Interface IStrategyTickResultClosed

This interface describes the data you receive when a trading signal is closed, providing a comprehensive view of the final outcome. It includes details like the reason for closure – whether it was due to a time limit, reaching a profit or loss target, or a manual closure – and the exact time the signal was closed.

You'll also find critical financial information, like the final VWAP price, the profit/loss (including fees and potential slippage), and the strategy, exchange, and symbol involved. The data lets you track performance by strategy and timeframe, and clearly distinguishes between backtesting and live trading scenarios. A unique ID is provided for closures that were initiated manually. Finally, a timestamp indicates when this closing event was recorded.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal is cancelled before a trade actually takes place. It’s like a scheduled action didn't go through - perhaps it was cancelled manually, or the price moved away from the signal before a trade could be opened, or a stop loss was triggered instead.

The `action` property is always "cancelled", clearly indicating the type of result.

You’ll also find the details of the cancelled signal itself in the `signal` property.

Other key pieces of information include the final price at the time of cancellation (`currentPrice`), the precise time it happened (`closeTimestamp`), and identifying details like the strategy, exchange, time frame, and trading pair involved (`strategyName`, `exchangeName`, `frameName`, `symbol`).

It also tells you whether this cancellation occurred during a backtest or a live trading session (`backtest`), and *why* it was cancelled (`reason`).

A unique identifier (`cancelId`) might be present if the cancellation was initiated through a specific cancel request, and `createdAt` marks when this result was generated.

## Interface IStrategyTickResultActive

This interface describes a specific scenario during a trade where the strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL) trigger, or a time expiration. It provides detailed information about the ongoing trade, including the signal being watched, the current price used for monitoring, and the strategy and exchange involved.

You’ll find details such as the trading symbol, the timeframe used, and progress indicators showing how close the trade is to either a take profit or a stop loss. 

The system keeps track of unrealized profit and loss (pnl) associated with the active position, factoring in fees and slippage. It also distinguishes between backtest and live trading scenarios. 

Finally, timestamps are included to monitor when the result was created and when the last candle was processed, useful for synchronization and backtesting processes.

## Interface IStrategySchema

The IStrategySchema defines the blueprint for how a trading strategy works within the backtest-kit framework. It's essentially a way to register and configure your strategy’s logic.

Each strategy needs a unique name to be recognized. You can also add a note for yourself or other developers to explain the strategy’s purpose.

The `interval` property controls how often the strategy can generate signals, helping to prevent overwhelming the system.

The core of the strategy is the `getSignal` function; this is where you write the code that determines when and how to trade.  It takes the symbol, current date and time, and price as input, and outputs a signal if one exists. This function can be designed to wait for a specific price level to be reached.

Callbacks allow you to define actions that happen when a trade opens or closes.

You can optionally assign risk profiles and action identifiers to the strategy for risk management and tracking.

Finally, the `info` property allows you to attach custom data to the strategy for monitoring or external processes.

## Interface IStrategyResult

The `IStrategyResult` is how backtest-kit organizes the results of a trading strategy run. Think of it as a single row in a comparison table – it bundles together everything you need to understand how a strategy performed. Each result holds the strategy's name so you know what you're looking at.

It also includes a full set of backtest statistics to give you a detailed breakdown of the strategy's behavior.

Finally, it contains the value of the metric you’re using to evaluate the strategies, helping you rank them against each other. You'll also find the timestamps of the first and last signals the strategy generated, useful for understanding the timing of its activity.

## Interface IStrategyPnL

This interface represents the result of a profit and loss calculation for a trading strategy. It tells you how well a trade performed, taking into account factors that eat into profits, like transaction fees and slippage – about 0.1% each in this system. 

You’ll find the percentage change in profit/loss, so you can quickly see if a strategy is making money or losing it. 

It also provides the entry price and exit price for the trade, but these are adjusted to reflect those fees and slippage. 

Finally, it breaks down the absolute profit/loss amount in USD and the total amount initially invested.

## Interface IStrategyCallbacks

This interface provides a way to hook into key moments in a trading strategy's lifecycle. Think of them as optional notifications that your strategy can listen for and react to as signals are created, change state, or close.

You can subscribe to events that fire when a signal is initially opened, enters an active monitoring phase, or returns to an idle state where no signals are being actively tracked. There are also callbacks for when a signal is closed, scheduled for later entry, or cancelled entirely.

Beyond the core lifecycle, you can get notified about partial profits or losses (when a trade is moving in a favorable or unfavorable direction but hasn't hit the target or stop-loss), breakeven points, and even scheduled pings – a way to monitor signals that are waiting to be triggered. A special ping callback, `onActivePing`, offers custom monitoring capabilities for active pending signals, allowing for dynamic adjustments to your strategy's behavior. The `onWrite` callback is specifically for persisting data during backtesting or testing. Each callback provides information about the symbol, signal data, current price, timestamp, and whether the operation is part of a backtest.

## Interface IStrategy

This interface, `IStrategy`, defines the core methods a trading strategy needs to execute.  It's used by `ClientStrategy` to control how trades are handled.

The `tick` method handles each new price update. It checks if a signal needs to be generated and also monitors take profit and stop loss conditions.

`getPendingSignal` and `getScheduledSignal` are used internally to monitor pending signals, checking for things like time expiration and triggering conditions.

Several methods provide insights into the position's state:

- `getBreakeven` checks if the price has moved enough to cover trading costs.
- `getTotalPercentClosed` shows how much of the position has been closed.
- `getTotalCostClosed` reveals how much of the initial investment has been recovered.
- `getPositionEffectivePrice` calculates the average entry price (DCA).
- `getPositionInvestedCount` counts the number of entries made in the position.
- `getPositionPnlPercent` and `getPositionPnlCost` calculate the unrealized profit or loss.
- `getPositionEntries` lists all the entry prices and costs for the position.
- `getPositionPartials` shows a history of partial profit and loss closures.

The `backtest` method allows you to test the strategy against historical price data.  There are methods for stopping, canceling, or forcing the activation of scheduled signals.

Other utility functions allow you to manipulate the position, such as `partialProfit` (closing a portion of the position) and `trailingStop` (adjusting the stop-loss level).

Finally, `dispose` cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the basic operations any storage adapter used by the backtest-kit framework needs to support. Think of it as the contract that ensures different storage solutions (like databases or files) can all work together seamlessly within the backtest environment.

It provides methods for responding to various signal events - when a position is opened, closed, scheduled, or cancelled – allowing the storage system to track the lifecycle of each trade.  You'll also find functions to retrieve a specific signal by its unique ID or to list all signals that are currently stored.

Finally, the `handleActivePing` and `handleSchedulePing` methods are specifically for keeping the signal data up-to-date when the system sends ping signals related to open or scheduled positions. This ensures the storage reflects the current state of the backtest.

## Interface IStorageSignalRowScheduled

This interface describes a signal row that's been scheduled for a future action. 

It holds two key pieces of information. The `status` is always "scheduled", confirming that this signal is waiting to be executed.  Crucially, it also includes the `currentPrice` at the time the signal was scheduled – this price reflects the market conditions that prompted the signal and helps maintain context for later execution. Think of it as a snapshot of the price when the signal was planned.

## Interface IStorageSignalRowOpened

This interface represents a signal row indicating an open position. 

It contains two key pieces of information: the `status`, which is always "opened" for these rows, and the `currentPrice`, reflecting the VWAP price when the signal was triggered. Think of this as a record confirming a trade has started and the price at which it began. Essentially, it’s a snapshot of the trade's inception.

## Interface IStorageSignalRowClosed

This interface represents a closed trading signal within the backtest-kit framework. It holds all the data relevant to a signal that has finished executing, including financial details. 

You’ll find information about how the signal performed, specifically its profit and loss (PNL).  The `currentPrice` reflects the final price used to calculate that PNL. 

The `closeReason` tells you *why* the signal was closed – whether it was due to a profit target, stop-loss trigger, or another condition. Finally, the `closeTimestamp` accurately records precisely when the signal concluded. This allows for precise analysis of your trading strategies.

## Interface IStorageSignalRowCancelled

This interface defines a signal row that has been marked as cancelled. It's a simple record indicating that a signal has been terminated or invalidated. The core of this interface is the `status` property, which is always set to the string "cancelled". This provides a clear and consistent way to identify cancelled signals within your data storage.

## Interface IStorageSignalRowBase

This interface defines the fundamental structure for storing signals, ensuring they are consistently saved across different signal states. It includes fields to track when the signal was initially created (`createdAt`) and last updated (`updatedAt`), both based on the information from strategy ticks. A `priority` field is also present, helping to manage the order in which signals are processed, using the current timestamp to ensure a clear sequence. This base structure ensures signals have a reliable and timestamped record.


## Interface IStateParams

The `IStateParams` interface helps you set up how your trading signals store and manage their data. Think of it as defining the organizational structure for your signal’s state.

You specify a `bucketName`, which acts like a folder name, grouping related state variables together within the signal. For example, you might use "trade" for trade-related data and "metrics" for performance metrics.

Then, you also provide an `initialValue`, which is the starting point for the data when the signal first begins or when existing data is lost. This ensures your signal always has a known and valid state.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data specific to each trade, allowing strategies to track important details over time. Think of it as a container for information like the highest unrealized profit, how long the trade has been open, and thresholds for when to exit a position.

This interface enables strategies, especially those driven by language models, to monitor performance and make decisions based on these metrics throughout a trade's lifespan.

The `waitForInit` method sets up the initial state. `getState` lets you retrieve the current state, but it prevents looking into the future by only providing data that existed at or before a specific time.  `setState` is used to update the state; it has a mechanism to prevent issues if the backtest restarts. Finally, `dispose` cleans up any resources the instance is using when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines how to size trades using the Kelly Criterion, a method focused on maximizing long-term growth. It essentially tells the backtest kit to calculate the optimal position size based on your expected win rate and profit/loss ratio. The `kellyMultiplier` property lets you control the aggressiveness of the sizing; a lower multiplier (like the default of 0.25) uses a more conservative approach, while a higher value will take larger positions. You can adjust this multiplier to align with your risk tolerance and trading strategy.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple sizing strategy where you consistently risk a fixed percentage of your capital on each trade. The `method` property is always set to "fixed-percentage" to identify this specific sizing approach.  The `riskPercentage` property determines what that percentage is – for example, a value of 1 means you risk 1% of your capital per trade. This provides a straightforward way to control your risk exposure.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing schemas used within the backtest-kit framework. Every sizing schema should have a unique identifier, often called `sizingName`, to distinguish it from others. 

You can also add a `note` field to provide additional information or context for developers. 

The schema also defines limits for position sizing: `maxPositionPercentage` controls the maximum portion of your account that can be used for a position, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum position sizes.

Finally, `callbacks` allows you to attach functions that will be triggered at specific points in the sizing process, offering extra flexibility in how your positions are sized.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR), a common volatility indicator. 

Essentially, it lets you specify a risk percentage for each trade, like 1% or 2% of your account balance.  

The `atrMultiplier` then determines how far your stop-loss will be placed based on the current ATR value – a higher multiplier means a wider stop. This approach automatically adjusts your position size based on market volatility; when the ATR is high, you trade smaller, and when it’s low, you trade larger, always maintaining your defined risk percentage.


## Interface ISizingParamsKelly

This interface defines how to set up sizing parameters based on the Kelly Criterion when you’re creating a new sizing strategy. 

It primarily focuses on logging information during the sizing process, which helps you understand and debug how much capital is being allocated to each trade. You'll provide a logger service to track these details.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades based on a fixed percentage of your capital. It’s really straightforward – you just need a way to log any debugging information that might be helpful. Essentially, it's about having a tool to record what's happening behind the scenes as your sizing calculations run.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of your capital to allocate to each trade based on the Average True Range (ATR). 

It's designed to be passed when setting up your trading sizing logic.

The `logger` property allows you to include a logging service, which is useful for debugging and monitoring how your sizing calculations are behaving. This helps you understand what's happening behind the scenes and identify any potential issues.


## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, the `onCalculate` callback gets triggered immediately after the system determines how much of an asset to trade. This is a fantastic opportunity to observe the calculated size, ensure it falls within expected ranges, or log this information for review and analysis. You can use this callback to make sure your sizing logic is behaving as you expect.


## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. 

It requires you to specify the sizing method, which in this case is the Kelly Criterion.

You’ll also need to provide the win rate, represented as a number between 0 and 1, and the average win/loss ratio for your strategy. These values are essential for determining how much of your capital to allocate to each trade to maximize long-term growth.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the necessary information when you're using a fixed percentage sizing strategy for your trades. It specifies that the sizing method being used is "fixed-percentage".  Additionally, you’ll need to provide the `priceStopLoss` – this is the price level at which you want to place a stop-loss order to manage risk.

## Interface ISizingCalculateParamsBase

This interface defines the fundamental information needed when calculating how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," so the system knows exactly what you’re trading. You'll also find the current balance of your account, crucial for determining affordability, and the anticipated entry price for the trade. These parameters serve as the foundation for any sizing strategy.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed when you’re sizing your trades based on the Average True Range (ATR).  Essentially, it tells the system you want to use an ATR-based sizing approach. You'll need to provide a numerical value for `atr`, representing the current ATR value you've calculated, which will be used to determine your position size. This parameter is crucial for implementing strategies that adapt to market volatility.

## Interface ISizing

The `ISizing` interface defines how a trading strategy determines how much of an asset to buy or sell. Think of it as the part of your strategy that figures out the right size for each trade.

It has a single, crucial function called `calculate`. 

This `calculate` function takes parameters representing things like your risk tolerance, account size, and the potential price movement you're anticipating.  It then returns a number, which is the calculated position size – the amount of the asset you should trade. It operates asynchronously, so it might involve fetching data or performing calculations that take some time.


## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal within the backtest-kit framework. Think of it as a finalized signal ready for execution, built after initial validation. Each signal gets a unique ID, and a cost associated with it – this represents the total investment needed for the position.  The signal also stores essential details like the entry price, the expected duration of the trade, and identifiers for the exchange, strategy, and the timeframe the signal was generated on.

Beyond the basics, `ISignalRow` also tracks internal calculations and history. You'll find records of any partial profit or loss closures, enabling more accurate Profit and Loss calculations. It supports dynamic price adjustments through trailing stop-loss and take-profit mechanisms.

The interface also stores information about DCA entries, which is useful for strategies using average-buying methods, and tracks performance metrics like the highest profit and lowest loss points seen during the trade. Finally, a timestamp indicates when the signal was initially created or generated. This standardized data structure provides a robust foundation for backtesting and live trading activities.

## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you need to bundle several signals together and release them at a specific time. Think of it as a way to delay a set of signals until an interval has passed.

Each signal has a unique identifier, like a serial number, to keep track of it.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for a trade. It describes what to buy or sell, when, and at what price. Each signal has a unique identifier, and specifies the ticker symbol involved, whether it's a long (buy) or short (sell) position, and a human-readable note explaining the reasoning behind the signal. 

You'll define the entry price, the target price for taking profit, and a stop-loss price to limit potential losses.  There’s also a way to set a time limit for the trade, although you can choose to have it run indefinitely. Finally, you can optionally specify the cost associated with entering this trade. If certain properties like the signal ID aren't provided, the system automatically generates them.

## Interface ISignalCloseRow

This interface represents a signal event related to a trade closing. It builds upon the existing signal data by adding information specifically relevant when a trade is closed by the user. 

The `closeId` property holds a unique identifier for the closing action, allowing you to track specific user-triggered closures.  You'll also find a `closeNote` field, which lets you capture any notes or explanations the user provided when initiating the closing. These properties are only used when the signal is related to a user-initiated closure, not automated ones.

## Interface ISessionInstance

This interface helps manage temporary data for each trading decision. Think of it as a way to store information specific to a particular symbol, strategy, exchange, and timeframe – like cached results from a complex calculation or ongoing indicator values. It's designed to be updated and accessed during a single trading run, so it can hold data that needs to be shared between different parts of your strategy.

The `waitForInit` method prepares the session for use. `setData` allows you to save new data along with a timestamp. When you need to retrieve that data, `getData` fetches it, making sure you don’t peek into the future. Finally, `dispose` cleans up any resources associated with the session when it's no longer needed.

## Interface IScheduledSignalRow

This interface defines a signal that's designed to be triggered when a specific price is reached. Imagine it as a signal that's on hold, waiting for the market to move to a particular price level. It's linked to a regular signal, but it only becomes active once the 'priceOpen' is hit. A key characteristic is that it tracks the time it was initially scheduled, and then updates that to reflect when it actually became pending.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled trading signal that might have been cancelled by the user. It builds upon a standard scheduled signal, adding details specifically for when a user intervenes to cancel a pending signal. If a user cancels a scheduled signal, this interface holds information like a unique cancellation ID and a note explaining why the cancellation occurred. Think of it as tracking the reason and reference for a user-triggered cancellation of a previously scheduled trading signal.

## Interface IScheduledSignalActivateRow

This interface represents a scheduled signal, but with an added feature: it allows for activations triggered by the user. When a user manually initiates an activation, a unique identification number, the `activateId`, is assigned. This allows tracking and management of those user-initiated activations. Along with the ID, a brief note, `activateNote`, can be added to record the reason or details behind the manual activation. These extra details aren't present for automatically scheduled signals.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the period of time your backtest will cover. It’s like setting the start and end dates for your historical analysis. You'll find two key pieces of information here: a `from` date that marks the beginning of your backtest, and a `to` date signifying the end. Think of it as defining the window of time you want to use to evaluate your trading strategy.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides crucial details about the current state of your trading simulation or live execution. It tells you what asset you're trading (like "BTCUSDT"), the timeframe of the backtest if you’re running one, and any custom data your strategy might need. 

You’ll also get information about the environment – the exchange and strategy names in use, and even the specific timeframe the data is from. Importantly, it provides the current timestamp, the current price of the asset, and confirms whether the strategy is in backtest mode. This information is essential for monitoring, reporting, and ensuring your strategy behaves as expected.

## Interface IRunContext

The `IRunContext` object holds all the necessary information your code needs when it's running within the backtest-kit framework. Think of it as a container that combines two key pieces of information: how your strategy should be routed (exchange, strategy, frame) and the current runtime state like the symbol being analyzed and the timestamp of the data. It's designed to simplify things by passing everything you need in one go, and the framework then takes care of distributing those pieces to the appropriate services for handling.

## Interface IRiskValidationPayload

This object holds the data needed when checking for potential risks in your trading strategies. It builds upon the information in IRiskCheckArgs and includes details about the current trading signal and the overall portfolio state.

Specifically, it provides the `currentSignal` – which represents the signal being evaluated, ensuring you have access to price information – along with the `activePositionCount`, giving you a quick view of how many positions are currently open.

You'll also find a detailed list of `activePositions`, providing information on each individual position held. This comprehensive view helps you assess and manage risks effectively within your backtesting framework.

## Interface IRiskValidationFn

This defines a special function that's used to check if a trading strategy is safe to run. Think of it as a quality control check before letting a strategy execute. If the function finds everything is okay, it doesn't do anything and lets the strategy proceed. However, if it spots a problem – maybe the risk is too high, or the parameters are incorrect – it either reports the issue with a detailed explanation or raises an error, stopping the strategy from running and explaining what went wrong.

## Interface IRiskValidation

This interface helps you define how to check if your risk parameters are valid. Think of it as a way to ensure your trading decisions are based on sound logic.

It has two main parts:

*   **validate:** This is the core - a function you provide that actually performs the validation. It takes your risk parameters and determines whether they are acceptable.
*   **note:** This is a helpful description. Use it to explain *why* you're validating in a particular way, making it easier for others (or your future self) to understand.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, builds upon the existing `ISignalDto` to provide extra information crucial for risk management. It holds the entry price of a trade (`priceOpen`), alongside the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels.  This allows for a more complete assessment of risk during validation processes, ensuring the trade aligns with intended risk parameters. Essentially, it keeps track of the original pricing details associated with a trade signal.

## Interface IRiskSchema

This section details how you can define and register risk controls for your portfolio, acting as a safety net for your trading strategies. Think of it as setting up rules to protect your portfolio from excessive risk.

You'll be able to give each risk control a unique name and a descriptive note for clarity. You can also include optional callbacks to trigger specific actions based on whether a trade is rejected or allowed.

The core of the risk control lies in its validations – a series of custom checks you define.  These validations will be executed to determine if a trade meets your pre-defined risk criteria. You can use validation functions or pre-defined validation objects to implement these rules.

## Interface IRiskRejectionResult

This object describes why a risk check failed. It’s used to communicate the reason for a rejection in a way that's easy for humans to understand. Each rejection has a unique ID, allowing you to track specific issues. The `note` property provides a clear explanation of why the validation failed, helping you diagnose and fix problems.

## Interface IRiskParams

The `IRiskParams` interface defines the information needed to set up a risk management system. It includes things like the name of the exchange you're working with, a logger for tracking what’s happening, and a time service to ensure accurate calculations, especially during backtesting to avoid looking into the future. You'll also find a flag to indicate whether you're in a backtest or live trading environment. Lastly, there’s a special callback function, `onRejected`, that gets triggered when a trading signal is blocked by risk checks; this allows you to react and emit notifications related to those rejections.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface helps manage potential conflicts when multiple parts of your trading strategy are trying to adjust positions at the same time. It's all about ensuring accuracy and preventing unexpected behavior in complex trading scenarios.

Think of it like this: if you have a system that needs to verify if a trade is safe *before* actually making it, this option can temporarily "reserve" the position size. This helps prevent other parts of your system from seeing an outdated view of the available resources during that critical check, making sure everything stays consistent. 

Specifically, the `reserve` property, when set to `true`, creates a snapshot of the position before the risk check, ensuring that any other concurrent checks or actions see that updated value.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides all the necessary information for a risk check function to determine if a new trade should be allowed. Think of it as a snapshot of the trading environment just before a potential signal is generated. It includes details like the trading pair (`symbol`), the signal itself (`currentSignal`), the strategy requesting the trade (`strategyName`), and the specific exchange and risk profile being used. You'll also find the current price and timestamp for reference. Essentially, it gives you the context needed to validate if opening a position aligns with your defined risk parameters.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface lets you hook into events related to risk management within the backtest framework. Think of it as a way to be notified when a trading signal is either blocked because it exceeds defined risk limits or approved because it passes those checks. Specifically, the `onRejected` callback is triggered when a signal is blocked, and `onAllowed` is triggered when a signal gets the green light. You can use these callbacks for logging, monitoring, or triggering other actions based on the risk assessment of your trading signals.

## Interface IRiskActivePosition

This interface describes a single trading position that's being tracked for risk management purposes, particularly when you're using multiple trading strategies at once. It holds all the essential details about a position, like which strategy created it, which exchange it’s on, and the specific symbol being traded. You'll find information about whether it's a long or short position, the entry price, and any stop-loss or take-profit levels that were set. There's also a time estimate for how long the position is expected to be held, and a timestamp indicating when the position was initially opened. Basically, it’s a snapshot of a position’s key characteristics for monitoring and analysis.

## Interface IRisk

The `IRisk` interface is a critical component for managing risk within the backtest-kit. It’s responsible for ensuring that trading signals don't violate pre-defined risk limits and for keeping track of open positions.

The `checkSignal` method lets you verify if a particular trading signal is safe to execute given your risk parameters. A specialized, thread-safe version, `checkSignalAndReserve`, not only checks the signal but also temporarily "reserves" space for the upcoming position to prevent multiple strategies from exceeding limits simultaneously. This reservation is crucial for scenarios involving parallel strategies and guarantees a consistent view of available positions. Remember that after a successful `checkSignalAndReserve`, you *must* either confirm the trade with `addSignal` or cancel it with `removeSignal` to keep your risk management accurate.

`addSignal` is used to officially register a new, active position—it finalizes the reservation and updates the system's position records. Conversely, `removeSignal` removes a closed position, freeing up resources for new trades and ensuring the system’s risk profile remains current.

## Interface IReportTarget

This interface lets you finely control what details get recorded during your trading simulations. Think of it as a checklist for specific types of events you want to track. You can turn on logging for things like how the strategy is performing, potential risk issues, breakeven points, partial trade closures, performance metrics, scheduling events, live trading data, backtest results, signal synchronization, and important milestones like highest profit and maximum drawdown. Each property represents a different category of event, and setting it to `true` will enable logging for that particular area.

## Interface IReportDumpOptions

This interface defines how to control what data gets written out in reports during backtesting. It allows you to specify key identifiers like the trading symbol (e.g., BTCUSDT), the name of the trading strategy, the exchange being used, the timeframe (like 1 minute or 1 hour), a unique identifier for the signal generated, and the name of any walker optimization used. By setting these properties, you can filter and organize your report data to focus on the specific aspects of your backtesting process you're interested in.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It ensures a consistent way to store signals and retrieve the most relevant information for a given time period.

The `handleActivePing` method lets you record new signals as they come in, updating the system's knowledge of recent activity.  `getLatestSignal` is used to find the most up-to-date signal for a specific asset and trading strategy, ensuring that the signal used isn’t from the future. To prevent look-ahead bias, it won't return signals that occurred after the specified time. Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago a particular signal was generated, which is helpful for understanding how frequently signals are being produced.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, helps you understand the details of a trading signal, especially concerning stop-loss and take-profit levels. It builds on existing signal data to provide extra information for reporting and user interfaces.

Crucially, it includes the *original* stop-loss and take-profit prices that were set when the signal was created.  Even if those stop-loss or take-profit levels are adjusted later (like with trailing stops), you’ll always know what the initial values were.

Here's a breakdown of what else is included:

*   **cost**: The cost to get into the trade initially.
*   **originalPriceStopLoss**: The initial stop-loss price.
*   **originalPriceTakeProfit**: The initial take-profit price.
*   **partialExecuted**:  Shows how much of the position has been closed out using partial orders.
*   **totalEntries**:  Indicates if the position was a single entry or if it involved averaging.
*   **totalPartials**: The number of partial closes that have occurred.
*   **originalPriceOpen**: The initial entry price, unchanged by averaging.
*   **pnl**: The current unrealized profit or loss.
*   **peakProfit**: The highest profit achieved so far.
*   **maxDrawdown**: The largest loss experienced so far.



It's designed to be transparent and give a complete picture of a trade’s history and current status.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick, which is a standard way to represent price data over a specific time interval. Each candlestick contains key information like the time it represents, the opening price, the highest and lowest prices reached during that time, the closing price, and the volume of trades that occurred. The `timestamp` tells you exactly when this data applies, while `open`, `high`, `low`, `close`, and `volume` give you a snapshot of the price action and trading activity. Think of it as a complete picture of what happened with an asset's price within a single timeframe.

## Interface IPositionSizeKellyParams

To help calculate appropriate position sizes using the Kelly Criterion, this interface defines the necessary parameters. You'll need to provide a `winRate`, which represents the probability of a winning trade as a number between 0 and 1. You also need to specify the `winLossRatio`, reflecting the average profit earned for each winning trade relative to the average loss for each losing trade. These values allow the framework to determine how much of your capital to allocate to each trade.

## Interface IPositionSizeFixedPercentageParams

This section details the parameters used when sizing trades based on a fixed percentage of your available capital, and it doesn't include the method of calculation. The `priceStopLoss` property specifies the price at which a stop-loss order will be triggered, helping to manage risk. This value is crucial for limiting potential losses on a trade.

## Interface IPositionSizeATRParams

This defines how much to adjust your position size based on the Average True Range (ATR). 

The `atr` property simply represents the current ATR value, which is used in calculations to determine your position size. A higher ATR might suggest greater volatility, potentially leading to a smaller position size to manage risk.

## Interface IPositionOverlapLadder

The `IPositionOverlapLadder` interface defines how to detect potential overlaps in dollar-cost averaging (DCA) positions. Think of it as setting up a buffer zone around each DCA level to see if later purchases are stepping on earlier ones.

It uses two key settings: `upperPercent` and `lowerPercent`.

`upperPercent` controls how much higher than a given DCA level will trigger a flag for overlap – a value of 5 means a position is flagged if it's 5% above that DCA.

`lowerPercent` does the opposite - it defines how much lower than a DCA level will trigger an overlap flag. A value of 5 here means a position is flagged if it's 5% below the DCA.

These percentages help fine-tune the sensitivity of overlap detection.

## Interface IPersistStrategyInstance

This interface helps you customize how a trading strategy's data is saved and loaded. Think of it as a way to manage the strategy’s memory across different sessions, ensuring it picks up where it left off.

It's specifically designed for a unique combination of a trading symbol, the strategy's name, and the exchange it's running on.

If you need to store strategy data differently than the default file-based approach (perhaps in a database or cloud storage), you can build your own adapter that implements these methods.

The `waitForInit` method sets up the storage area when a strategy is first started. 

The `readStrategyData` method retrieves any previously saved data for the strategy.

Finally, `writeStrategyData` is used to save the current state of the strategy, or to clear it completely.


## Interface IPersistStorageInstance

This interface lets you customize how your backtest or live trading system saves and loads signal data. Think of it as a way to replace the default file storage with something else, like a database or in-memory cache. 

The `waitForInit` method is used to set up the storage when the system starts, telling it whether it’s a fresh initialization.

`readStorageData` retrieves all the previously saved signals, essentially pulling them back into the system.  It does this by looking at all the keys associated with the signals.

Finally, `writeStorageData` handles saving the current state of signals, ensuring they are available for the next session.  Each signal is identified by a unique identifier, making it easy to locate later.

## Interface IPersistStateInstance

This interface defines how to manage persistent data for a specific trading strategy. Think of it as a way to save and load the strategy's memory so that it doesn't lose track of things if it crashes or restarts. 

It's designed to work with the `StatePersistInstance`, which handles the actual saving and loading. If you want to use a different method of storing data, like a database, you can create your own adapter that implements this interface.

The `waitForInit` method lets you set up the storage. `readStateData` loads previously saved information, `writeStateData` saves the current state, and `dispose` releases any resources that are being held. The `dispose` method might not do anything specific by default, but it provides a place to clean up resources if needed.


## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a specific strategy and exchange combination. Think of it as a way to replace the default file storage with your own method.

The `waitForInit` method is called to set up the storage – you'll tell it whether or not there's existing data to load. 

`readSignalData` is how you get the previously saved signal data, allowing you to retrieve the history for a specific context.

Finally, `writeSignalData` is for saving new or updated signal data, and can be used to completely clear the stored data by passing `null`.


## Interface IPersistSessionInstance

This interface helps manage how trading sessions are saved and loaded for specific setups – think of it as a way to remember where you left off in a test run. It’s designed to keep your session information safe even if something unexpected happens.

If you want to change how these sessions are stored (maybe using a database instead of a file), you can create your own adapter that follows this interface.

Here’s what the methods do:

*   `waitForInit`: Gets things ready for the session storage.
*   `readSessionData`: Loads any previously saved data for this session.
*   `writeSessionData`: Saves the current session data.
*   `dispose`: Cleans up any resources used by the session storage.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads signals generated by your scheduled tasks. Think of it as a way to control where your strategy’s data is stored, instead of relying on a standard file. Each storage instance is linked to a specific combination of symbol, strategy name, and exchange – ensuring data is kept organized. 

You'll implement functions to handle initializing the storage, retrieving existing signals, and saving new or updated signals. If you’re happy with the default file-based storage, you don’t need to do anything, but if you want to use a database or some other method, this is the place to make it happen.

Here's what the functions do:

*   `waitForInit`:  Sets up the storage when it's first needed.  You can tell it whether there's existing data to load.
*   `readScheduleData`:  Loads any previously saved signal data for this particular strategy and symbol combination.
*   `writeScheduleData`:  Saves the current signal data.  You can use `null` to remove the signal from storage.

## Interface IPersistRiskInstance

This interface lets you customize how backtest-kit saves and loads your trading positions, specifically for a particular risk profile and exchange combination. Think of it as a way to control where and how information about your open positions is stored.

If you need more than the default file-based storage, you can create a custom adapter and implement this interface. 

The `waitForInit` method allows you to prepare the storage for your risk context, essentially setting things up when needed. `readPositionData` retrieves the saved position data for a specific point in time. Finally, `writePositionData` saves the current state of your positions to storage so you can pick up where you left off.

## Interface IPersistRecentInstance

This interface helps keep track of the most recent trading signal used in a specific situation – think of it as remembering what you did last. It's designed to work with a particular combination of symbol, strategy, exchange, and timeframe, making sure backtesting and live trading don't interfere with each other’s signal history.

If you want to customize how this information is stored (instead of using a standard file), you can build your own adapter that follows this interface. 

The `waitForInit` method prepares the storage space. `readRecentData` retrieves the last recorded signal. And `writeRecentData` saves a new signal along with the timestamp of when it occurred.

## Interface IPersistPartialInstance

This interface defines how to store and retrieve partial profit and loss information for trading strategies. It’s designed to keep track of information specific to a combination of asset, strategy, and exchange. 

Think of it as a way to save the progress of a strategy, so you can resume where you left off.

Each strategy's partial data, like how much profit or loss has been made, is stored separately, identified by a unique signal ID.

You can create your own custom storage solutions by implementing this interface, allowing you to change how this partial data is saved – whether it’s to a file, database, or somewhere else entirely. 

The `waitForInit` method prepares the storage space for a given context. `readPartialData` retrieves the saved data for a particular signal at a specific time. Finally, `writePartialData` is used to save the current partial data for a signal.

## Interface IPersistNotificationInstance

This interface lets you customize how your trading system remembers and reloads notifications – those important messages about events or changes – whether you’re running a backtest or a live trading session. Think of it as a way to control where and how those notifications are saved.

If you want to use something other than the default file storage, you can build your own adapter that implements this interface.

The `waitForInit` method is used to set up the storage when your system starts.  `readNotificationData` fetches all the previously saved notifications, and `writeNotificationData` saves the current notification data. These methods ensure notifications are consistently managed during your trading process.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts, like when using LLM memory. Think of it as a way to manage a small piece of your application's memory – a specific area tied to a signal and a bucket name. 

You can use it to load existing memory entries, check if a particular piece of memory exists, write new data, or even "soft-delete" entries (meaning the file remains, but it's hidden from normal searches).

If you want to customize how this memory is stored – maybe you don't want to use files – you can build your own adapter that implements this interface. 

The `waitForInit` method prepares the storage area when needed, `readMemoryData` gets a memory entry by its ID, `hasMemoryData` checks for existence, `writeMemoryData` adds new data, `removeMemoryData` performs a soft-delete, and `listMemoryData` retrieves all active memory entries. Finally, `dispose` helps clean up any resources used by your custom storage.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures, essentially acting as a persistent memory for your backtesting system. It’s designed for situations where you want to save responses from external APIs to speed up repeated calculations.

The cache allows for "soft deletes," meaning entries aren't permanently erased but marked as removed, keeping the file on disk for potential recovery or analysis.

If you're building a custom caching solution beyond the default file-based one, you’ll need to implement this interface, providing your own methods for initialization, reading, writing, and listing cached entries.

Here’s a breakdown of what the interface does:

*   `waitForInit`: Gets things set up and ready to go for storing data in a specific bucket.
*   `readMeasureData`: Retrieves a specific cached entry using its key.
*   `writeMeasureData`: Saves a new entry or updates an existing one in the cache, along with a timestamp.
*   `removeMeasureData`: Effectively removes an entry from being actively used by marking it as deleted (but keeping the file around).
*   `listMeasureData`: Provides a way to see all the keys of the entries currently considered active (not marked as deleted).

## Interface IPersistLogInstance

This interface defines how to manage the persistent storage for log entries within the backtest-kit framework. Think of it as a way to customize where and how your trading logs are saved – instead of relying on the default file-based storage, you can plug in your own solution. 

The system uses a single, global log storage area for each process, organizing logs by their unique ID.

To use a custom storage method, you’ll need to implement these methods:

*   `waitForInit`:  This method lets you prepare the log storage when the system starts up, setting up any necessary initial conditions.
*   `readLogData`: This retrieves all the stored log entries.
*   `writeLogData`: This is how you write new log entries to the storage. Importantly, you need to make sure you don't overwrite existing entries – the log should only ever grow.

## Interface IPersistIntervalInstance

This interface helps manage records indicating when a specific trading interval has already occurred for a given bucket. Think of it as a way to track which intervals have already been processed.

It’s used to ensure that certain actions, like firing a signal, only happen once per interval and bucket. You can essentially "mark" an interval as completed.

If you want to control how these "fired" markers are stored (instead of using the default file system method), you can create a custom adapter that implements this interface.

Here's what you'll need to do:

*   `waitForInit`: Set up the storage for each bucket.
*   `readIntervalData`: Retrieve the marker data for a specific key.
*   `writeIntervalData`: Create or update a marker to indicate an interval has fired, along with a timestamp.
*   `removeIntervalData`:  "Soft-delete" a marker, making it appear as if the interval hasn't fired yet, allowing the system to trigger it again.
*   `listIntervalData`: Get a list of all keys for which markers exist and haven't been "soft-deleted."

## Interface IPersistCandleInstance

This interface lets you manage how candle data, like open, high, low, and close prices, is stored and retrieved for a specific trading setup (a particular symbol, timeframe, and exchange). It's designed to keep a record of past price action for analysis or backtesting.

Think of it as a way to have a local library of historical price data.

The `waitForInit` method sets things up when the system starts needing data for a particular combination of symbol, timeframe, and exchange.

The `readCandlesData` method is key - it tries to fetch a set of candles (price bars) within a specific time range from the stored data. If even one candle is missing, it returns null, signaling that the data needs to be re-downloaded from its original source.

Finally, the `writeCandlesData` method allows you to save new candles to the local store. This method suggests that you might want to skip any partial candles that aren’t yet complete, and avoid accidentally overwriting data for candles that are already fully recorded.

## Interface IPersistBreakevenInstance

This interface helps manage and save breakeven data for trading strategies. It's designed to work with a specific combination of a financial instrument (symbol), the trading strategy being used, and the exchange it's on.

Think of it as a way to store information about when a trade reached a certain point where it would no longer lose money.

Each trade signal has its own piece of stored data. 

If you want to change how this data is saved (maybe to a different location than the default), you can create your own adapter that implements this interface.

The `waitForInit` method lets you set up the storage area before you start using it.

`readBreakevenData` is used to retrieve previously saved breakeven information for a particular trade signal and date.

And `writeBreakevenData` saves the breakeven information for a specific signal and date.

## Interface IPersistBase

This interface outlines the basic functions needed for any custom storage system used with the backtest-kit framework. Think of it as a contract: if you build your own way to save and load data, you'll need to provide methods for initializing the storage, retrieving a specific piece of data, checking if something exists, writing data, and listing all the data keys. The `waitForInit` method handles setup and verification of your storage space, ensuring it's ready and consistent. `readValue` and `hasValue` let you fetch information and verify existence, while `writeValue` takes care of safely saving data. Finally, `keys` provides a way to get a list of everything stored, which is useful for checking and iterating through your data. 

The framework provides a default implementation and constructor type to help guide your custom storage adapter's development.

## Interface IPartialProfitCommitRow

This describes a single instruction for taking a partial profit during a backtest. It represents one step in a series of actions, specifically indicating that a portion of the trading position should be closed. 

The `action` property confirms this is a partial profit instruction. 

You’ll also find the `percentToClose`, which tells you what percentage of the position to reduce. Finally, `currentPrice` records the price at which this partial profit was actually executed.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, like selling a portion of your holdings. 

It's essentially a message queued up, telling the system to reduce the size of your position.

The `action` property simply confirms that this is a partial loss operation.

`percentToClose` tells the system what percentage of the existing position should be sold.

Finally, `currentPrice` records the price at which this partial sale actually took place.

## Interface IPartialData

IPartialData holds a snapshot of key data points for a trading signal, specifically designed for saving and loading information. It's like a simplified version of the full state, containing only the essential details needed to reconstruct the signal's progress. 

This data includes the profit levels achieved and the loss levels encountered during trading. Think of it as a record of the signal's performance milestones, packaged in a way that's easy to store and retrieve. The framework automatically converts sets of levels into arrays to handle the process of saving this data.

## Interface IPartial

The `IPartial` interface is designed to keep track of how well a trading signal is performing, specifically its profit or loss. It’s used by the `ClientPartial` and `PartialConnectionService` components.

When a signal is making money, the `profit` method calculates the profit level (like 10%, 20%, 30%) and notifies you whenever a new level is reached.  Similarly, when a signal is losing money, the `loss` method does the same, pinpointing loss levels and alerting you to new milestones. It makes sure you only receive notifications for new levels reached.

Finally, the `clear` method is used to reset everything when a signal finishes trading, whether that’s due to a take profit, stop loss, or time expiration. This method cleans up the data and ensures the system is ready for the next signal.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered from command-line arguments when you're setting up a trading session. It essentially combines your initial inputs with flags that determine the type of trading you'll be doing. You'll see properties like `backtest`, `paper`, and `live` which clearly indicate whether the system will be running a historical simulation, a simulated trade with live data, or actual live trading. These flags allow you to easily switch between different trading environments.

## Interface IParseArgsParams

This interface outlines the standard input expected when you're setting up your backtesting environment. Think of it as a blueprint for the core information needed to run a strategy – it defines what we need to know about the asset you're trading, the specific strategy you want to use, where you’re getting the data from, and the timeframe for that data. You’ll provide values for the trading symbol (like BTCUSDT), the name of your strategy, the exchange hosting the market (like Binance), and the candle timeframe (like 1h for one-hour candles). This helps ensure everything is properly configured before the backtest begins.

## Interface IOrderBookData

The `IOrderBookData` interface represents the information contained within an order book. It holds the details of both bids (orders to buy) and asks (orders to sell) for a specific trading pair. You'll find the `symbol` property which indicates the trading pair, like "BTCUSDT". The `bids` property is an array of `IBidData` objects, listing the buy orders with their prices and quantities. Similarly, `asks` provides the details of the sell orders.

## Interface INotificationUtils

This interface is the foundation for any system that wants to send out notifications related to trading activity. Think of it as a standard way to communicate events like when a trade is opened, closed, or when profit-taking opportunities arise. 

It defines a set of methods, each responsible for handling a specific type of event. For example, `handleSignal` deals with general signal events, while others like `handlePartialProfit` and `handleBreakeven` focus on profit and loss management. 

There's also a way to retrieve all stored notifications with `getData`, and a `dispose` method to clear them out when they're no longer needed. Essentially, it provides a structured way to react to and manage notifications within a trading environment.

## Interface INotificationTarget

This interface lets you finely control which notifications your backtest or live trading system generates, helping to reduce noise and focus on the events that matter most. By default, all notifications are enabled, but you can use this to subscribe only to the event types you need.

Here's a breakdown of the available notification categories:

*   **Signal Events:** Get updates on signal lifecycle events like when a signal is opened, scheduled, closed, or cancelled.
*   **Partial Profit/Loss & Breakeven:** Receive notifications when the price reaches predefined partial profit, loss, or breakeven levels. This allows you to react to price movements before a final commitment is made.
*   **Strategy Commit:** Track confirmations of strategy actions, including partial profit/loss takings, trailing stops, and scheduled signal activations.
*   **Order Synchronization:** Monitor the status of orders in live trading.  This includes updates when orders are filled, scheduled, or confirmed as exited.
*   **Order Check:**  Get pings to confirm orders are still active with the exchange.  This acts as a safety check during live trading.
*   **Risk Management:** Be alerted when the risk manager prevents a new signal from being created.
*   **Informational Signals:** Receive manual or strategy-triggered messages associated with active signals.
*   **Common Errors:** Catch and log non-critical errors that happen during the process.
*   **Critical Errors:** Handle unrecoverable errors that cause the backtest or live session to end.
*   **Validation Errors:** Identify issues with strategy configurations or input data that don’t meet the expected standards.



By selectively enabling or disabling these properties, you can tailor the notification flow to your specific needs and improve the efficiency of your trading system.

## Interface IMethodContext

The `IMethodContext` provides essential information for routing operations within the backtest-kit framework. Think of it as a set of clues about which specific configurations – the exchange, strategy, and frame – are relevant for a particular task. It carries these clues, like the names of the exchange, strategy, and frame schemas, throughout the system. This allows the framework to automatically locate and use the appropriate components without needing to explicitly specify them each time. The `frameName` being empty indicates live trading mode.


## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage solutions – like local storage, persistent databases, or even dummy data for testing – should operate.

It allows you to initialize the memory store, write new data to it along with a timestamp and description, and search for specific information based on keywords and a cutoff time. You can also retrieve all entries up to a certain time, delete individual entries, or read a single memory entry. Finally, it provides a way to cleanly release any resources used by the memory store when it's no longer needed. The `waitForInit` method ensures the memory store is ready before any operations occur.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see when running backtests. Think of it as controlling the level of detail in your analysis.

You can turn on reports for things like tracking individual strategy signals, how risk management is affecting trades, or even analyzing portfolio performance with a heatmap. 

There are options to monitor signal scheduling, live trading events, and key milestones like reaching the highest profit or experiencing a maximum drawdown.

The `backtest` property specifically controls the main report containing results and the full history of trades, making it a crucial setting for comprehensive analysis. You can tailor these reports to focus on exactly what you need to understand your trading system’s behavior.

## Interface IMarkdownDumpOptions

This interface defines the options you can use when exporting information to Markdown format. Think of it as a way to specify exactly what you want included in your reports. 

You'll find properties to identify the location of the data – like the directory and file name – and crucial details about the trading information itself.  This includes the trading pair (symbol), the name of the strategy used, the exchange it's on, the timeframe, and even a unique ID for any signals involved. By setting these values, you control which parts of the backtesting results get included in the Markdown output.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework can record information about what's happening. It's essentially a standardized way to keep track of events and issues within the system.

You can use it to log different types of messages, from general notes about what’s going on to specific debugging information.

Here’s a breakdown of the methods:

*   `log`: This is your go-to for recording standard, significant events like agent activity or session changes.
*   `debug`: Use this for very detailed information, often helpful when you're trying to figure out a problem – think of it as the extra verbose level.
*   `info`: This method is for important updates like successful validations or the completion of tasks.
*   `warn`: This is for things that might be a problem, but aren't stopping the system from running - a heads-up that something might need a look.

These logs help with understanding how the system is operating, spotting problems, and keeping a record of what happened.

## Interface ILogEntry

ILogEntry represents a single entry in your backtest's log history. Each entry has a unique ID and a type indicating its severity – log, debug, info, or warn. It also stores the time the event occurred in milliseconds, providing a timestamp and a creation date for better tracking. 

You can associate a log entry with a specific method using `methodContext` or execution environment using `executionContext` for more detailed context.  The `topic` field clarifies which method or process generated the log, and `args` allows you to pass along additional information or data related to the event.

## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtesting process. It's like a detailed record of events. 

It provides a way to retrieve a complete list of log entries, allowing you to review all the actions and messages generated throughout the backtest. This list includes information like timestamps and messages, which is incredibly useful for debugging and understanding your strategy's behavior.


## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a summary of performance data for a single trading symbol, like "BTCUSDT," across all strategies used. It bundles a wealth of metrics to give a complete picture of how a strategy performed.

You'll find information about overall profitability (`totalPnl`), risk-adjusted returns (`sharpeRatio`, `sortinoRatio`, `calmarRatio`), and drawdown (`maxDrawdown`). It also details the number of trades and their outcome – wins, losses, and the win rate.

Beyond the basics, it provides deeper insights, like average profit/loss per trade (`avgPnl`), the average length of winning vs. losing trades (`avgWinDuration`, `avgLossDuration`), and even indicators of market momentum (`buyerPressure`, `sellerPressure`). You can also see how consistent the wins and losses are (`avgConsecutiveWinPnl`, `avgConsecutiveLossPnl`) and get a sense of the overall trend direction (`trend`) along with how reliable that assessment is (`trendConfidence`).  Essentially, it's a comprehensive report card for a single trading pair, enabling you to evaluate its strengths and weaknesses.

## Interface IFrameSchema

The `IFrameSchema` lets you define specific time periods and intervals for your backtesting simulations. Think of it as setting up the "stage" for your trading strategy to perform on.

Each schema has a unique name to identify it, and you can add notes to help explain its purpose.

You'll specify the start and end dates for the backtest period, and also the time interval to use, such as one minute ("1m") or one hour ("1h").  If you don't set an interval, it will default to one minute.

You can also add optional callback functions to run at different points during the frame's lifecycle, allowing for custom actions or data processing.


## Interface IFrameParams

The `IFrameParams` object defines the information needed to set up a frame within the backtest-kit trading framework. Think of a frame as a distinct period or segment within your backtest. It’s essentially a container for your trading logic.

This object includes a logger to help you track what's happening during the backtest and identify any potential issues.  You also specify a unique name for each frame using the `interval` property, making it easy to keep track of different segments of your backtest.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into different stages of how timeframes are created within the backtest kit.

Specifically, the `onTimeframe` function gets called right after a set of timeframes has been calculated. This is a great spot to log the generated timeframes for auditing, or to double-check that they look correct before proceeding with your backtest. You can even use it to perform validation steps. It receives the timeframe array, the start date, end date, and the interval used for those timeframes as arguments.


## Interface IFrame

The `IFrame` interface is a core part of how backtest-kit manages time for your trading simulations. It's essentially responsible for creating the sequence of dates that your backtesting process will run through. 

The `getTimeframe` function is the most important piece. You give it a trading symbol (like 'BTCUSD') and a name for the timeframe you want (like '1h' for one-hour candles), and it will return an array of dates. These dates represent the points in time that your backtest will analyze. The spacing between these dates will be determined by the timeframe you specified.

## Interface IExecutionContext

The `IExecutionContext` object provides the information your trading strategies and exchange integrations need to operate correctly. Think of it as a little package of context passed along to your code.

It tells your strategy what trading pair it's working with, like "BTCUSDT," and precisely what time it is. 

Crucially, it also indicates whether you're running a backtest – a simulation using historical data – or a live trading session. This distinction impacts how your code behaves.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to an exchange and retrieving the necessary data.

It requires a unique identifier for the exchange (`exchangeName`) and a function, `getCandles`, which retrieves historical price data (candles) for a given trading pair and timeframe.

You can optionally add a developer note (`note`) for documentation purposes.

The `formatQuantity` and `formatPrice` functions help ensure that trade sizes and prices adhere to the exchange's specific formatting rules. If these aren't provided, defaults are used.

Additionally, optional functions can be implemented to fetch order book data (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), but if these are omitted, the system will indicate that they aren't supported.

Finally, you can also define optional callbacks (`callbacks`) to respond to events like new candle data.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It outlines the core functions your exchange implementation must provide to fetch market data and handle order formatting. You'll need to supply a logger for debugging, an execution context to track details like the trading symbol and whether it's a backtest, and functions to retrieve candles (historical price data), format order quantities and prices according to the exchange’s rules, and access order books and aggregated trades. All methods are mandatory, though sensible defaults are applied during initialization.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` object lets you plug in functions that get triggered when the trading framework receives new candle data from an exchange. Think of it as a way to be notified whenever the price history updates. Specifically, the `onCandleData` function will be called with details like the symbol (e.g., BTC/USDT), the time interval used for the candles (e.g., 1 hour), the timestamp of the oldest data received, the number of candles requested, and an array containing the actual candle data. This allows you to react to new price information in real-time within your backtesting strategy.


## Interface IExchange

The `IExchange` interface defines how your backtesting system interacts with an exchange. It lets you retrieve historical and future candle data, which are essential for simulating trades.

You can fetch candles from the past using `getCandles`, or look into the future (specifically for backtesting scenarios) with `getNextCandles`. The system ensures data accuracy by preventing "look-ahead bias," meaning you won't accidentally use future information when making decisions.

Formatting functions, `formatQuantity` and `formatPrice`, help you comply with the exchange's specific precision rules.  You can also calculate the VWAP (Volume Weighted Average Price) using `getAveragePrice`, which is a common indicator used by traders. `getClosePrice` gives you the closing price of the most recent candle for a given timeframe.

If you need live market data during backtesting, `getOrderBook` and `getAggregatedTrades` retrieve order book information and trade history, respectively. `getRawCandles` provides a versatile way to fetch candles with custom start and end dates and limits, offering maximum flexibility in your data retrieval.

## Interface IEntity

This interface serves as the foundation for all objects that are saved and retrieved from storage within the backtest-kit framework. Think of it as a common starting point, guaranteeing that anything you persist will have certain basic characteristics. It's a core building block ensuring consistency across your data entities.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data related to a backtest run. Think of it as a way to record important information at different stages.

It provides several methods for different types of data:

*   `dumpAgentAnswer` stores the complete conversation history of an agent's actions.
*   `dumpRecord` lets you save simple key-value pairs.
*   `dumpTable` saves data presented in a table format, automatically figuring out the column headers.
*   `dumpText` is for saving raw text or Markdown content.
*   `dumpError` allows for detailed error descriptions to be captured.
*   `dumpJson` preserves complex, nested data as a formatted JSON block.

Finally, `dispose` provides a way to clean up and release any resources the instance is using when you’re done with it. Each dump instance is specifically tied to a signal and a bucket name, meaning it's focused on a particular area of the backtest.

## Interface IDumpContext

The `IDumpContext` helps organize and identify data being saved, particularly during backtesting or live trading. Think of it as a container that holds essential details about each piece of information being recorded.

It includes the `signalId`, which pinpoints the specific trade the data relates to, and the `bucketName`, which helps group data based on the strategy or agent that generated it. 

Each dump also has a unique `dumpId` for easy reference. A descriptive `description` is included, making it clear what the dump contains and allowing for easy searching. Finally, a `backtest` flag specifies whether the data comes from a backtest simulation or live trading, which impacts how it's handled.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that need to be processed later, ensuring they happen at the right time during execution. Think of it as a way to line up actions to be taken, rather than immediately executing them.

It holds essential details for each of these events.

Specifically, it includes the `symbol` which tells you which trading pair the event relates to, and a `backtest` flag indicating whether the action is part of a historical simulation or a live trade.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to quickly check if your trading data (candles) exist where they should. It's like a checklist to make sure your backtesting system isn't trying to use data that's missing.

You’ll need to specify which trading pair (like BTCUSDT) and exchange you’re working with, along with the timeframe of the candles (like 1-minute or 4-hour intervals). Finally, you provide a date range to verify if the data exists for that specific period. This helps prevent errors during backtesting.

## Interface ICandleData

This interface defines the structure for a single candle of price data, which is fundamental for backtesting and calculating things like VWAP. Each candle represents a specific time interval and contains key information about the trading activity during that period. It includes the timestamp indicating when the candle began, the opening price, the highest and lowest prices reached, the closing price, and the total volume traded. Essentially, it's a snapshot of price movement and trading activity over a defined time.


## Interface ICacheCandlesParams

This interface defines the settings you can use when preparing data for backtesting, specifically when dealing with cached historical data. It lets you control how the system checks and pre-populates its data.

You can provide functions to be executed at key moments:

*   `onWarmStart`: This function runs just before the system begins warming up the cache – meaning it’s fetching extra data to fill any gaps. You’ll know the symbol, interval (like 1 minute or 1 day), and the date range for the data being fetched.

*   `onCheckStart`:  This function is called when the system needs to validate the cache. If the validation fails, a warm-up process will start after this function runs. Again, you get details about the symbol, interval, and date range involved.


## Interface IBrokerOrderVerdictTransient

This object represents a temporary failure encountered while processing an order, like a network glitch or a brief exchange issue. It's how the backtest-kit framework communicates these short-lived problems to adapters. 

You don't build this object yourself; instead, your code signals a transient issue by throwing a generic error or returning a specific value.

The framework handles these signals, creates this `IBrokerOrderVerdictTransient` object, and then manages retries based on pre-defined limits for opening, closing, and checking orders.  The `reason` field always indicates the issue is transient, and the `error` field holds details about the underlying problem if available.

## Interface IBrokerOrderVerdictRejected

When an order can't be fulfilled, this represents a permanent rejection from the system's perspective. It's used to communicate that the order should not be retried, as the underlying issue isn't likely to resolve itself. 

This isn't something adapters or listeners create directly; instead, they signal a rejection through return values or throwing specific errors. 

A "rejected" reason means the order is fundamentally flawed, so a new order is needed.  An open order will be dropped, and a closing order will be closed immediately. The original error that caused the rejection is included for debugging.

## Interface IBrokerOrderVerdictDeleted

This notification indicates that an order has been deleted, typically because it was cancelled on the exchange. 
It's a signal from the framework, not something your adapter creates directly. 

Essentially, it means the order is gone – no further attempts to fulfill it will be made.
The framework handles this automatically based on errors like `OrderDeletedError`.

The `reason` will always be "deleted" to confirm this particular event.
The `error` property provides the specific error that caused the deletion, giving you details about why the order was removed.

## Interface IBrokerOrderVerdictConfirmed

This interface represents a final decision made by the backtest-kit framework regarding an order, either after a gate check or a sync. It's how the framework communicates its verdict to the trading strategy. 

Think of it as the framework saying "yes, this order is good to go" or "this order is still valid".

The strategy itself doesn’t *create* this verdict; it signals its intention (allow, reject, or postpone) through return values or exceptions. The framework then compiles those signals into this `IBrokerOrderVerdictConfirmed` to finalize the order processing.

If you see `reason: "confirmed"`, it means everything is clear – the order can proceed.

## Interface IBrokerOrderVerdictBase

This interface represents the core structure for decisions made about orders within the backtest-kit system. It's the foundation for both when the system confirms an order's validity and when it flags an issue that needs further attention.

The `__type__` property is a special identifier that helps the system understand the specific kind of verdict being returned – essentially, it distinguishes different error or confirmation scenarios. It’s a key part of how the system handles order processing.

## Interface IBroker

The `IBroker` interface defines how your trading framework connects to a live exchange. It's all about adapting the framework to a real broker, with a focus on safety and resilience.

Before anything happens, `waitForInit` lets you establish the connection, load credentials, and crucially, clean up any leftover orders or positions from previous crashes. This ensures a clean slate for trading.

For order closures (`onOrderCloseCommit`), this is where you place the actual exit order and track profit/loss. It’s a critical gate – exceptions here can cause the framework to retry closes or, in extreme cases, force-close the position.

Similarly, `onOrderOpenCommit` is your gate for opening positions, where you submit orders. Errors here trigger retries, so make sure to reconcile with the exchange to avoid duplicate orders.

`onOrderActiveCheck` monitors open positions, verifying their existence; failures are tolerated initially with retries, but persistent issues force a close. `onOrderScheduleCheck` does the same for pending, scheduled orders.

`onSignalActivePing` is your per-tick event handler for open positions. It allows you to react to events like sudden price gaps or liquidity issues, making adjustments and using commit functions to update the strategy state.

`onSignalSchedulePing` is the companion to `onSignalActivePing`, handling scheduled orders and their potential activation or cancellation.

`onSignalScheduleOpen` is called when a scheduled signal is created, enabling you to place the initial resting order.

`onSignalScheduleCancelled` cleans up resting orders when they are cancelled.

`onSignalPendingOpen` provides a hook for placing protective orders (TP/SL) when a new position opens.

`onSignalPendingClose` handles the final cleanup after a position is closed.

Finally, various `on...Commit` hooks cover partial profits, losses, trailing stops, and DCA entries, allowing you to manage these strategies with the actual broker's functions.





## Interface IBreakevenData

This data structure holds information about whether a breakeven point has been achieved for a specific trading signal. It's designed to be easily saved and loaded, making it simple to persist your backtesting results.  Essentially, it’s a way to remember if a trade has met its breakeven target.

The `reached` property is a simple true/false value indicating whether the breakeven condition has been fulfilled. This property allows easy conversion to and from JSON format for saving and restoring your backtesting data. It represents a simplified version of the more detailed breakeven state.


## Interface IBreakevenCommitRow

This object represents a breakeven commitment that has been queued for processing. It essentially tells the system that a trade needs to adjust its breakeven price. 

The `action` property always indicates this is a "breakeven" action. The `currentPrice` represents the price at which the breakeven point was initially calculated or adjusted.

## Interface IBreakeven

The `IBreakeven` interface helps manage when a trading signal's stop-loss is moved to the entry price, essentially achieving a breakeven point. It keeps track of this state and lets you know when the price has moved favorably enough to cover any transaction costs involved.

The `check` method is used to regularly evaluate if the breakeven condition has been met – it ensures breakeven hasn't already been triggered, assesses if the price movement is sufficient to cover costs, and verifies that the stop-loss can be adjusted. If it all checks out, the system records the breakeven, sends out a notification, and saves this information.

When a trading signal is finished, the `clear` method is called to remove the breakeven tracking and update the system's records, ensuring everything is cleaned up properly.

## Interface IBidData

This interface describes a single bid or ask within an order book. It's essentially a snapshot of one price level and how much is available to trade at that price. 

You'll find two key pieces of information here: the `price` itself, represented as a string, and the `quantity` available at that price, also a string. Think of it as a record showing, for example, "there are 100 shares offered at $10.50."

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy strategy, often called a DCA (Dollar-Cost Averaging) commit. It tracks details about a specific buy action taken as part of the larger averaging process. 

Each commit includes the price at which the buy was made (`currentPrice`), the total cost of that buy in USD (`cost`), and the total number of averaging entries accumulated so far (`totalEntries`). Think of it as a record of one small purchase within a plan to buy assets over time at different prices. It's a key piece of information for understanding how a DCA strategy is unfolding.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade, useful for digging into the specifics of your backtesting. Each trade is identified by a unique ID, and you'll find the price at which it happened, the quantity involved, and a timestamp marking precisely when it took place.  A key piece of information is `isBuyerMaker`, which tells you whether the buyer was acting as the market maker – this can be important for understanding the direction of the trade.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading simulation or live execution. It's like a record kept while a backtest or a live trade is happening.

These entries are automatically created when a test or live run begins and are removed when it finishes, either successfully or with an error. 

They help the system keep track of what's currently running and identify if multiple tasks are trying to happen at once. The `symbol` property tells you which trading pair, like "BTCUSDT," is involved. The `context` provides details about the execution environment, including the strategy and exchange names, and optionally a frame name. Finally, the `backtest` property indicates whether this activity is a backtest (true) or a live trade (false).

## Interface IActivateScheduledCommitRow

This interface represents a message that's put in a queue to trigger the activation of a scheduled commit. 

Think of it as a way to tell the system, "Hey, time to activate this particular scheduled commit!"

It includes the type of action, which is always "activate-scheduled", along with the unique identifier of the signal involved. You can also optionally include an activation ID if the activation is coming from a user request.


## Interface IActionStrategy

The `IActionStrategy` interface is designed to give your action handlers a way to peek at the current trading signal situation. It lets you check if there's an open position or a signal waiting to happen before your action logic runs.

Essentially, it's a read-only window into the signal state.

You can use the `hasPendingSignal` method to quickly see if there's an active position for a specific symbol, considering whether you're in backtest mode.

Similarly, `hasScheduledSignal` tells you if a signal is currently queued up and waiting to be triggered for a particular symbol, again taking backtest mode into account. This helps your actions avoid unnecessary executions when nothing's really happening.


## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom logic that responds to events happening during execution. Think of it as a way to hook into your strategy’s activities to do things like manage external state (like using Redux) or send notifications.

You can register these actions, each with a unique name, a developer note for clarity, and a handler that gets created for every strategy run. The handler automatically receives all the events emitted during a strategy frame.

Finally, you can also define optional callbacks to manage the action's lifecycle and receive specific events, providing even more control over how your actions behave. This allows you to tailor your strategy’s behavior beyond just generating trading signals.

## Interface IActionParams

The `IActionParams` object defines the information passed to an action when it's created, essentially bundling everything the action needs to function. It builds upon a base schema, adding crucial details like a logger for tracking what's happening and context about the strategy.

You'll find the names of the strategy and timeframe the action belongs to.

It also includes details about the exchange being used and whether the action is part of a backtest.

Finally, it provides a way to access the current signal and position information within the strategy.

## Interface IActionCallbacks

This API reference details the lifecycle callbacks available when using the backtest-kit trading framework. Think of these callbacks as hooks that let you customize what happens at key points in a trading strategy's execution.

Initialization and Disposal:

*   `onInit`: Called when a trading action starts – a great place to set up connections to databases or external services.
*   `onDispose`:  Called when an action stops – use this to clean up resources like closing database connections or saving state.

Signal Handling:

*   `onSignal`:  A general callback triggered whenever a signal event occurs, applicable to both backtesting and live trading.
*   `onSignalLive`: Specifically for live trading, triggered every tick.
*   `onSignalBacktest`:  Specifically for backtesting, triggered every candle.
*   `onBreakevenAvailable`: Notified when a breakeven price is hit.
*   `onPartialProfitAvailable`: Triggered when a partial profit target is met.
*   `onPartialLossAvailable`:  Triggered when a partial loss target is reached.
*   `onPingScheduled`: Called periodically while a signal is scheduled but not yet active.
*   `onScheduleEvent`:  Provides updates on the lifecycle of a scheduled signal, such as when it's created or canceled.
*   `onPendingEvent`: Signals when a pending position is opened or closed.
*   `onPingActive`: Called every minute while a pending position is active.
*   `onPingIdle`: Triggered every tick when there are no pending or scheduled signals.
*   `onRiskRejection`: Notified when a signal is rejected by the risk management system.
*   `onOrderSync`:  Critical for handling order placement and cancellations; you can reject order attempts by throwing an error.  This is a manual gate for order management.
*   `onOrderCheck`: Called regularly to confirm orders are still active. This is another manual gate for order monitoring.

These callbacks offer a way to customize your trading strategy's behavior beyond the core logic, providing flexibility for tasks like resource management, custom event handling, and exchange integration. They can be implemented asynchronously or synchronously.


## Interface IAction

This interface, `IAction`, acts as a central hub for managing events within the backtesting and live trading framework. Think of it as a way to plug in your own custom logic to respond to what's happening during a strategy's execution.

It provides a series of methods, each corresponding to a specific type of event triggered by the system. These events can range from signals being generated (in both backtest and live modes) to notifications about partial profits, losses, or ping status updates.  You can use these methods to do things like log these events, display them on a dashboard, feed them into a data analytics system, or even modify the strategy's behavior based on them.

To use it, you implement these methods, essentially creating callbacks that execute whenever a particular event occurs. This allows you to tailor your actions to your specific needs.  The `dispose` method is crucial for cleaning up when you’re done with the integration, ensuring no lingering subscriptions or connections. It’s designed to be flexible, enabling integrations with systems like Redux or Zustand, or for creating custom monitoring solutions.

## Interface HighestProfitStatisticsModel

This model holds information about the highest profit events that occurred during a trading simulation. It essentially keeps track of when the most money was made. 

The `eventList` property contains an array of all the recorded highest profit events, presented in chronological order – the most recent events appear first.  You can think of this as a detailed timeline of the profitable moments.

The `totalEvents` property simply tells you how many of these highest profit events were recorded overall.

## Interface HighestProfitEvent

This data represents the single most profitable moment encountered during a trading position. It contains details like the exact time the record was set, the trading symbol involved, and the name of the strategy that generated the trade. You’ll also find information about the position direction (long or short), the overall profit and loss, and the highest profit achieved during the position’s life. 

Alongside profit metrics, it includes the price at which the record profit was achieved, the entry price, and any set take profit or stop loss levels. A flag indicates if this event occurred during a backtesting simulation. This allows for a detailed understanding of the best-case performance for a specific trade.

## Interface HighestProfitContract

The `HighestProfitContract` is a notification you’ll receive when a trading strategy reaches a new peak profit level. Think of it as a signal that something good is happening – a position is performing exceptionally well.

It provides a wealth of information to help you understand *why* that profit is being achieved. You'll see the trading symbol involved, the current price, when the event occurred, and the names of the strategy, exchange, and timeframe being used.

Critically, the notification also includes the specific signal that triggered the trade, allowing you to analyze what factors led to the profit. A flag lets you know whether this is happening in a live trading environment or during a backtest, so you can adjust your reactions accordingly. You can use this to build in custom actions, like automatically adjusting stop-loss orders or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds a comprehensive overview of your portfolio's performance across all the assets you're tracking. It provides aggregated statistics, giving you a high-level view of how your trading strategy is performing overall.

You'll find details about each individual asset in the `symbols` array.  The structure also summarizes key portfolio-wide metrics such as total profit/loss (`portfolioTotalPnl`), risk-adjusted return measures (Sharpe Ratio, Sortino Ratio, Calmar Ratio), and trade characteristics like duration.

It gives you insights into how peak profits and losses are distributed across the portfolio, along with averages for winning and losing trade durations. Several metrics related to consecutive wins and losses help identify patterns.  Furthermore, it offers projections like expected yearly returns and extrapolates the trade frequency to a yearly basis. Essentially, this provides a complete snapshot of your portfolio’s health and performance.

## Interface DoneContract

This interface describes what happens when a background process finishes, whether it's a backtest or a live trading session. It tells you which exchange was used, the name of the strategy that ran, and if it was a backtest or a live execution. You'll also find the trading symbol involved, like "BTCUSDT", and a frame name if the process was part of a larger framework. Essentially, it's a notification about a completed background task and provides details about what just happened.


## Interface CronHandle

This object lets you cancel a scheduled task. Think of it as a way to "undo" registering a cron job. If you no longer want a task to run at a specific time, using this handle will remove it from the schedule. It's a simple way to clean up registered cron entries.

## Interface CronEntry

A CronEntry defines when and how a specific function (the handler) is executed within the backtesting framework. Each entry has a unique name, crucial for managing and preventing duplicate entries.

The `interval` determines how often the handler runs – it's based on standard candle intervals like 1 minute, 5 minutes, hourly, or daily.  If you leave the interval blank, the handler executes only once, immediately upon the very first matching event.

The `symbols` property acts as a filter. If left empty, the handler runs only once for all backtests at each interval. If you specify a list of symbols, the handler runs once for *each* listed symbol at each interval.

Finally, `handler` is the actual function that gets executed based on these settings. It's the core logic you want to run at scheduled times, triggered by specific symbols and intervals.

## Interface CriticalErrorNotification

This notification signals a critical error within the backtest framework, requiring immediate action like stopping the process. 

It’s like a red flag – something has gone seriously wrong.

Each notification has a unique ID for tracking, along with a detailed error object including a stack trace and extra information. You’ll also see a clear message explaining what happened. 

Importantly, the `backtest` property will always be false, because these errors happen in the live context, not during a simulation.

## Interface ColumnModel

This defines how your data gets presented in tables. Think of it as a blueprint for each column. 

Each column has a unique identifier, a human-readable label for the header, and a function to transform the raw data into a nicely formatted string for display.

You can also control the visibility of a column – deciding whether it should appear in the table at all based on some condition. This makes it easy to customize exactly what information is shown.

## Interface ClosePendingCommitNotification

This notification lets you know when a pending signal has been closed before a position is fully activated. It's a special signal, identified by its `type` of "close_pending.commit", and includes a unique identifier (`id`) along with a timestamp (`timestamp`) marking when the closure was confirmed.

The notification details include important information such as whether it originated from a backtest (`backtest`) or live trading environment, the trading pair (`symbol`), the name of the strategy involved (`strategyName`), and the exchange where the signal was executed (`exchangeName`).  It also provides the original signal’s identifier (`signalId`) and an optional explanation for the closure (`closeId`).

You'll find data about the position's performance, like the total number of entries (`totalEntries`), any partial closes (`totalPartials`), and the original entry price (`originalPriceOpen`). Detailed financial information is provided too, including the position's total profit and loss (`pnl`), peak profit (`peakProfit`), and maximum drawdown (`maxDrawdown`), all expressed in both absolute values and percentages.  

Furthermore, the notification breaks down the price points at which profit and loss were calculated (`pnlPriceOpen`, `pnlPriceClose`), and the total capital invested (`pnlEntries`). It even includes details of the peak profit and maximum drawdown events, such as the price levels reached and the number of entries executed at those points. Finally, there's a field for an optional note (`note`) and the creation timestamp (`createdAt`).

## Interface ClosePendingCommit

This signal indicates that a previously opened position is being closed. 

It includes details about the close action itself. 

You’ll also find important performance metrics associated with that position, such as the total profit and loss (PNL), the highest profit achieved, and the maximum drawdown it experienced. The `closeId` provides a way to identify the reason for the closure, which can be helpful for tracking and analysis.

## Interface CancelScheduledCommitNotification

This notification lets you know that a previously scheduled trading signal has been canceled before it was activated. It provides a wealth of information about the signal and its potential performance. You'll see details like a unique identifier for the cancellation, when it happened, and whether it occurred in backtest or live mode.

The notification also includes comprehensive data about the intended trade, such as the trading pair, strategy name, exchange, and signal ID.  It outlines details like planned entries, partial closes, the original entry price, and potential P&L, peak profit, and maximum drawdown.

Further information includes data about pricing, costs, and percentages, as well as the signal's creation time. A human-readable note field might be available to explain the reason for the cancellation. This information is useful for debugging, auditing, and understanding the behavior of your trading strategy.

## Interface CancelScheduledCommit

This interface defines how to cancel a previously scheduled signal event. It’s used when you need to stop a signal from being sent out – perhaps because market conditions changed or the strategy’s logic has evolved.

The `action` property simply identifies this as a cancellation request. 

You can optionally include a `cancelId` to give a reason for the cancellation, which is helpful for tracking and debugging.

The `pnl`, `peakProfit`, and `maxDrawdown` properties are records of the strategy's performance related to the position being closed and give context about the signal's historical performance at the time of cancellation.

## Interface BreakevenStatisticsModel

This model helps you understand the results of your breakeven events during a backtest. It keeps track of every single breakeven event, providing a detailed list of them. You can also quickly see the total number of times breakeven was achieved during the test. Essentially, it gives you a clear picture of how often your strategy reached a breakeven point.

## Interface BreakevenEvent

This data structure holds all the key details whenever a trading signal hits its breakeven point. It’s like a snapshot in time, providing a complete picture of what happened.

You’ll find the exact time of the event, the trading symbol involved, the name of the strategy used, and a unique ID for the signal itself.  It also includes information about whether you're in a backtesting or live trading environment.

The data also stores the entry price, take profit and stop-loss levels, both as originally set and as they currently exist. If you used a dollar-cost averaging (DCA) strategy, you'll see details about the total entries made. 

Other useful information includes the current market price, realized profit/loss, and any notes associated with the signal, alongside when the position became active and when the signal was initially created.

## Interface BreakevenContract

The `BreakevenContract` represents a significant event in your trading strategy – when a signal's stop-loss is moved back to the original entry price, essentially covering the costs of the trade. This signifies a reduction in risk.

Think of it as a milestone indicating your trade has become profitable enough to eliminate the initial loss potential.

This event is carefully managed; it only happens once per signal to avoid duplicates, and it's tied to specific details like the trading symbol, the strategy used, the exchange, and the timeframe. You'll find information within the event about the original signal details, the current market price at the time of the breakeven, whether it’s a live trade or a backtest, and the exact timestamp of the event.

It's useful for generating reports about strategy performance and for setting up notifications when a signal reaches this breakeven stage.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a related action has been executed. It provides a wealth of detail about the trade that reached this milestone, including whether it occurred during a backtest or live trading. 

The notification includes crucial information like the trade's symbol, the strategy and exchange involved, and a unique identifier for both the signal and the notification itself. You'll also find the current price at the time of the breakeven and information about the position's entry and stop-loss/take-profit levels, both original and adjusted.

Beyond the basic trade parameters, it offers a deep dive into the position’s financial performance. This includes the position's profit and loss (PNL), peak profit and maximum drawdown, and associated prices and percentages. You can also see details about the DCA (Dollar-Cost Averaging) strategy, including total entries and partial closes. 

Finally, a note field allows for a human-readable explanation of why the breakeven action was triggered, along with timestamps for signal creation, pending status, and notification creation.

## Interface BreakevenCommit

This event signifies that a position has reached a breakeven point, meaning it's now operating at the original entry price. It provides a snapshot of the position's status at the time of this adjustment, including the current market price and overall profit and loss (pnl). You'll also find details about the highest profit reached during the trade's life (peakProfit), the maximum loss experienced (maxDrawdown), and the original and adjusted take profit and stop-loss prices. The event also specifies whether the trade was a long (buy) or short (sell) position, and when the position was initially opened and activated. Essentially, this data helps you understand the conditions that led to the breakeven trigger and evaluate the position's performance up to that point.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be adjusted to your original entry price, essentially breaking even. It provides a wealth of information about the position's performance, including its unique identifier, the timestamp of the event, and whether it occurred during a backtest or live trading.

You'll find details about the trading pair, the strategy used, the exchange involved, and the signal's specific identifier. Crucially, it includes the current market price, the original entry price, and the current take profit and stop-loss levels.

The notification also gives you a snapshot of the position's financial performance: total profit and loss (PNL), peak profit, maximum drawdown, and key price levels at those points. You can also see how many entries were used (if you used dollar-cost averaging) and if there were any partial closes. Finally, there's an optional note field providing extra context about the signal's reasoning. Signal creation and pending timestamps are also included.

## Interface BeforeStartContract

This interface, `BeforeStartContract`, lets you execute specific actions right before a trading strategy begins its run. Think of it as a preparation stage – it's triggered just once for each strategy execution, before any trading happens. It's a reliable signal to set up things like opening log files, resetting internal counters, or sending notifications that the run has started.

You're guaranteed this event will always be followed by an `AfterEndContract` event, even if the strategy encounters errors or is stopped prematurely. Any errors you encounter while setting up in this stage won’t crash the entire run, but they will be handled elsewhere.

The event provides a lot of useful information, including the trading symbol, strategy name, exchange, frame, whether it's a backtest or live run, the current price, and the time of the event. In backtest mode, the `when` property represents the planned start time of the historical data, while in live mode, it reflects the current time. The `timestamp` property duplicates the `when` property as a numerical value for easier handling and serialization.

## Interface BacktestStatisticsModel

This model provides a comprehensive overview of your trading strategy's performance after a backtest. It gathers a lot of data, including individual trade details and aggregated statistics, to help you understand how well your strategy is working. You'll find details about the number of winning and losing trades, the win rate, and average profit/loss per trade.

It also calculates various risk-adjusted performance metrics like the Sharpe Ratio, Sortino Ratio, and Calmar Ratio, which help you assess the balance between reward and risk. You can analyze the volatility of your strategy using the standard deviation and then see how the expected yearly returns compare to the potential drawdowns.

Beyond the core metrics, the model delves into trade durations, the impact of consecutive wins and losses, and even examines market pressure and trend strength to give you a complete picture of your strategy's behavior. There’s a breakdown of buyer and seller influence, plus a broader trend assessment with confidence levels. It provides a granular look at how trades are performing and the broader market conditions influencing them.

## Interface AverageBuyCommitNotification

This notification tells you when a new "average buy" (DCA) step has been taken in an ongoing trading position. Think of it as an update on your dollar-cost averaging strategy.

Each notification includes details like the unique ID, timestamp, and whether it's from a backtest or live trade. You'll find key information about the trade itself, such as the symbol being traded, the strategy used, and the current price.

It provides a snapshot of the position's state: how much you’ve invested, the running average entry price, the total number of DCA steps taken, and crucial metrics like peak profit, maximum drawdown, and overall profit/loss, all measured in USD and as percentages. You can also see the original entry price, and how take profit and stop loss prices have been adjusted. Finally, there’s an optional note field for any extra explanation about why the signal was generated.

## Interface AverageBuyCommit

This interface represents an event triggered when a new buy order is added to a position as part of a dollar-cost averaging (DCA) strategy. It provides comprehensive details about that specific averaging action, including the price at which the trade was executed and the overall cost.  You'll find information like the current effective entry price, which is the average of all prices paid so far.

The event also tracks the position's performance – unrealized profit and loss, peak profit, and maximum drawdown – at the time of the average buy.  It includes the original entry price, as well as any adjustments made to the take profit and stop loss levels. Timestamps pinpoint when the signal was created and the position was activated.


## Interface AfterEndContract

This interface signals the completion of a trading strategy run. It's designed to provide a reliable way for your code to perform cleanup tasks after a strategy finishes, whether it runs successfully, encounters an error, or is stopped prematurely.

You can expect to receive this event exactly once for each time a strategy run begins. It works in tandem with the `BeforeStartContract` event, ensuring a consistent lifecycle. Any errors that occur within your cleanup logic won't disrupt the overall process; they’ll be handled separately.

When running a backtest, the `when` property reflects the historical time of the last candle processed, or the frame's start date if no candles were processed. In live trading, it represents the current time, rounded to the nearest minute. The `timestamp` property provides the same value as `when` in milliseconds.

The event also gives you key information about the run itself, including the trading symbol, strategy name, exchange, frame, whether it’s a backtest or live run, and the current price. This allows you to easily identify and manage different strategy executions.

## Interface ActivePingContract

The ActivePingContract represents updates related to active pending signals during a trading strategy's monitoring process. Think of it as a heartbeat, sent every minute while a signal is still active and hasn't been closed. It's designed to let you keep track of the signal’s lifecycle and allows for custom, dynamic adjustments to your trading logic.

Each ping provides details like the trading pair (symbol), the name of the strategy involved, the exchange being used, and the timeframe of the analysis. You'll also receive complete data about the pending signal itself, including all its parameters like entry price, take profit, and stop loss levels.

Importantly, the ping also includes the current market price at the time of the event, which can be useful for making decisions based on price movements.  A flag indicates whether the ping originates from a backtest (historical data) or live trading.  Finally, a timestamp records exactly when the ping occurred, aligning with the "when" time for live trading or the candle timestamp during backtesting. You can subscribe to these ping events to build custom management functions.

## Interface ActivateScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been activated, meaning it's now actively being executed. It's triggered when a user manually initiates a signal, bypassing the standard price check. The notification provides a wealth of details about the trade, including a unique ID, the exact time of activation, and whether it’s part of a backtest or live trading.

You'll find essential information like the trading pair (e.g., BTCUSDT), the strategy and exchange used, and specifics about the trade itself - position size, entry/exit prices, stop-loss levels, and whether it’s part of a Dollar-Cost Averaging (DCA) strategy.  Furthermore, it reports on the trade's potential performance, including Profit/Loss (PNL), peak profit, maximum drawdown, and related pricing information. Finally, it details when the signal was initially scheduled and when it transitioned to a pending state.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a scheduled signal is activated. It contains a wealth of information about the trade that's being executed.

Essentially, it tells you *why* the signal was activated (the action), provides a unique identifier if the user provided one, and details the current market conditions at the time of activation, including the price.

You’ll also find key performance indicators like profit and loss (pnl), peak profit, and maximum drawdown, reflecting the trade's historical performance up to this point.

Crucially, it outlines the trade’s specifics: whether it’s a long or short position, the entry price, and the original and adjusted take profit and stop-loss levels.

Finally, timestamps indicate when the signal was originally created and when the position began its activation process, providing a complete timeline of events.
