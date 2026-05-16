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

This interface describes the information shared when a walker needs to be stopped. Think of it as a notification sent out when the backtest kit needs to pause or halt a particular trading strategy.

It includes the trading symbol involved, the name of the strategy that's being stopped, and crucially, the name of the walker that triggered the stop. This last piece is vital because you might have multiple strategies running on the same symbol, and this identifies exactly which one to interrupt. It lets you selectively stop specific strategies within a larger backtesting environment.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of your backtesting experiments. It builds upon the standard WalkerResults, adding in extra details to easily compare the performance of different trading strategies against each other. You'll find a list of results for each strategy you tested, allowing you to analyze their strengths and weaknesses side-by-side. This lets you have a clearer picture of which strategies are performing best and why.


## Interface WalkerContract

The WalkerContract represents updates as your trading strategies are being compared against each other. Think of it as a report card showing the progress of your backtesting. It tells you which strategy just finished running, what exchange and symbol it was tested on, and its key performance statistics.

You’ll see information like the strategy's name, the metric being optimized (like Sharpe Ratio or Sortino Ratio), and its calculated value. It also tracks the overall best strategy found so far, along with its metric value, and keeps a count of how many strategies have been tested versus the total number you planned to run. This allows you to monitor the backtest's performance and get a sense of when you might find the best strategy.

## Interface WalkerCompleteContract

The WalkerCompleteContract represents the conclusion of a backtesting process, signaling that all strategies have been evaluated and the final results are ready. It packages up a comprehensive set of data related to that backtest run, giving you a clear picture of what happened. 

You'll find details like the name of the walker that ran the test, the trading symbol being examined, and the exchange and timeframe used for the backtest. The contract also tells you which metric was used to judge the strategies. 

Crucially, it identifies the best-performing strategy, along with its impressive metric value and a full set of statistics describing its performance. This allows you to easily pinpoint the most successful approach from the tests you’ve conducted.


## Interface ValidationErrorNotification

This notification signals that a validation check failed during the backtesting or live trading process. 

It’s essentially a warning that something went wrong with your risk management rules. 

Each notification has a unique ID to track it, and a detailed error object including a stack trace helps pinpoint the exact location of the problem. A clear, human-readable message explains what went wrong, making it easier to understand and fix the validation issue. 

Importantly, the `backtest` flag is always false for these notifications, indicating the error occurred in the live environment.


## Interface ValidateArgs

This interface helps ensure that the names you use for different parts of your backtesting setup – like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweeps – are all valid and recognized by the system.

Think of it as a way to double-check that you haven’t misspelled anything or used a name that isn’t supported.

Each property within the interface represents a specific component of your backtest:

*   `ExchangeName`: Validates the name of the exchange you're using.
*   `FrameName`: Checks the name of the timeframe (e.g., 1 minute, 1 hour).
*   `StrategyName`: Verifies the name of the trading strategy.
*   `RiskName`: Confirms the name of the risk profile.
*   `ActionName`: Validates the name of the action to be taken (like buying or selling).
*   `SizingName`: Checks the name of the sizing strategy for determining trade size.
*   `WalkerName`: Validates the name of the parameter sweep configuration.

Essentially, it provides a standard way to confirm that all these names align with what the backtest-kit framework understands.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's a detailed record of what happened when your strategy's trailing take profit kicked in.

You'll see key details like a unique ID for the notification, the exact time it occurred, and whether it happened during a backtest or live trading. It includes information about the trading pair, the strategy involved, and the exchange where the trade took place.

The notification breaks down the specifics of the trade itself, including the adjusted take profit and stop-loss prices, the original prices, and the number of entries and partial closes. It also provides a comprehensive look at the position's performance, including profit and loss figures, peak profit, maximum drawdown, and important price points related to those metrics. 

Finally, you'll find a timestamp of when the signal was initially created and when the position began. There might even be a note explaining why the signal was triggered, giving you valuable context for understanding the trade.

## Interface TrailingTakeCommit

This interface describes a trailing take profit event, which happens when a trade's take profit level is adjusted based on the market price. 

It provides details about the event, including the type of action taken ("trailing-take"), and the percentage shift used to recalculate the take profit. 

You'll find information about the current price when the adjustment occurred, along with the profit and loss (pnl) information for the position, including its peak profit and maximum drawdown. 

The event also specifies the trade direction (long or short), the original entry price, and the new, adjusted take profit and stop-loss prices. 

Finally, timestamps indicate when the signal was created and when the position was initially activated. This gives a complete picture of how the trade evolved and how the trailing take profit mechanism impacted it.


## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including when it happened (timestamp), whether it was part of a backtest or live trading, and the specific trading pair involved. You'll find details about the strategy that generated the signal, the exchange used, and the unique identifiers for both the signal and the notification itself.

The notification also breaks down the pricing details - the original entry price, the current price at execution, and the adjusted stop-loss and take-profit levels after the trailing stop was applied.  It includes details on any DCA (Dollar-Cost Averaging) or partial closing strategies used, and importantly, a comprehensive breakdown of the position's profit and loss (PNL), including peak profit, maximum drawdown, and associated prices. Finally, you'll find optional notes describing the reasoning behind the signal and timestamps for creation and pending stages.

## Interface TrailingStopCommit

This describes a trailing stop event, a specific type of action taken within a trading strategy. When a trailing stop is triggered, this event provides detailed information about the change.

It tells you that a trailing stop adjustment has occurred, and includes the percentage shift used to modify the stop loss.

You'll also find the current market price at the time of the adjustment, and a comprehensive breakdown of the position’s profit and loss (pnl), including both the total and the peak profit achieved.

This event reveals the maximum drawdown the position has experienced.

Crucially, it includes details about the trade itself, like the trade direction (long or short), the original entry price, and the adjusted take profit and stop loss prices. You can also see the original take profit and stop loss prices before any trailing changes were applied. 

Finally, timestamps indicate when the signal was created and when the position began.

## Interface TickEvent

This describes the `TickEvent` data structure, which is a central piece for generating reports and analyzing trading activity within the backtest framework. It acts as a container holding all the relevant details about a specific event that occurred during a trade. Think of it as a record of what happened, whether it was a new trade opening, a signal being scheduled, or a position being closed.

The `TickEvent` includes information like the exact time the event occurred (`timestamp`), the type of event (`action`), and crucial details about the trade itself such as the symbol being traded (`symbol`), the signal's ID (`signalId`), and position type (`position`).

For trades that are in progress or have been completed, you'll find price-related information like the open price (`priceOpen`), take profit and stop loss levels (`priceTakeProfit`, `priceStopLoss`), and details on any modifications made to those levels. It also tracks information on DCA averaging (`totalEntries`), partial closes (`totalPartials`), and profit/loss calculations (`pnlCost`, `pnl`, `pnlPercentage`).

For closed positions, the `closeReason` and duration of the trade are recorded.  If a signal was cancelled, you'll see the `cancelReason`. Finally, for positions that were active, you can review the `peakPnl` and `fallPnl` to understand the performance highs and lows during its lifespan. The `pendingAt` and `scheduledAt` properties indicate when the position entered the active state or when the signal was initially created, respectively.

## Interface SyncStatisticsModel

This model helps you understand the performance and lifecycle of your signals by tracking sync events. It bundles together information about each individual sync event, provides a total count of all sync events that occurred, and breaks down those events into counts of signals that were opened and signals that were closed. Essentially, it's a way to monitor how frequently signals are starting and stopping within your system. You can see a list of all the sync events and have easy access to counts of opening and closing signals.

## Interface SyncEvent

This data structure holds all the key details about events happening during a trade, designed to make creating easy-to-understand reports. It tracks everything from when an event occurred (timestamp) to the specific trading pair (symbol) and strategy involved (strategyName, exchangeName).

You'll find information about the signal itself like its unique ID (signalId) and what action triggered the event (action). It also includes important pricing data – the current market price, the entry price (priceOpen), and the take profit and stop loss levels.

For trades involving averaging or partial exits, you’ll see details like the number of entries (totalEntries) and partial closes (totalPartials). The structure also keeps track of the position's performance—total profit and loss (pnl), peak profit, and maximum drawdown—and even the reason why the position was closed. If it's a backtest, that's indicated too, and a record of when the event was created is stored (createdAt).

## Interface StrategyStatisticsModel

This model holds a collection of statistics generated from your trading strategy's actions. Think of it as a report card summarizing what your strategy has been doing.

It includes a detailed list of every action the strategy took, along with the total number of actions performed.

You'll also find counts for specific action types like canceling scheduled orders, closing pending orders, taking partial profits or losses, and utilizing trailing stop-loss or take-profit techniques. 

It also records the number of breakeven events and scheduled activation events, as well as the count of average-buy actions, which could indicate a dollar-cost averaging strategy. Essentially, it gives you a breakdown of your strategy's behavior.

## Interface StrategyEvent

The `StrategyEvent` object holds all the important details about what your trading strategy is doing. It's designed to provide a complete picture of each action, whether it's opening a position, closing one, or something in between. You'll find information like the exact time of the event, the trading pair involved, and the name of the strategy and exchange.

It also captures the specifics of the trade itself: the signal that triggered it, the current price, and any percentages used for profit taking or stop-loss adjustments. For orders that are scheduled or pending, you’ll see IDs to track them.

Crucially, it includes details about the trade’s pricing, such as the original entry price, take profit, and stop loss levels, as well as any adjustments made through trailing. For strategies that use dollar-cost averaging (DCA), you’ll also see the effective entry price and the number of entries. The `StrategyEvent` also provides information on profit and loss, total entries, partials and any relevant notes to help you understand the context and performance of your trading strategy.

## Interface SignalSyncOpenNotification

This notification tells you when a scheduled trade (like a limit order) has been activated and a position has been opened. It provides a wealth of information about the trade, including when it happened, whether it was a backtest or a live trade, and the specific details of the strategy that triggered it. You'll find details about the entry price, stop-loss and take-profit levels, and crucially, performance metrics like profit and loss, peak profit, and maximum drawdown, all calculated up to that point in time.

The notification also includes crucial data points related to the position's lifecycle, such as the number of entries and partial exits, and timestamps of when the signal was created and when the position began. A handy note field allows for optional explanations of the signal's reasoning. Essentially, this notification gives you a complete picture of a position's initial activation and immediate performance.

## Interface SignalSyncCloseNotification

This notification lets you know a trading signal has been closed, whether it's from a backtest or live trading. It provides a wealth of information about what happened, including when it closed, the trading pair involved, and the strategy that generated it. You'll find details about the trade's performance, such as the profit and loss, peak profit achieved, and maximum drawdown experienced. 

The notification also breaks down the specifics of the trade, like entry and exit prices, the original take profit and stop loss levels, and how many entries or partial closes were executed. Finally, it explains *why* the signal closed, whether it was a profit target, a stop loss trigger, or due to time expiration, and it includes a space for a descriptive note. It also tracks key timestamps like when the signal was scheduled and activated.

## Interface SignalSyncBase

This `SignalSyncBase` represents the common data found in all signal synchronization events within the backtest-kit framework. It provides key information about the signal's origin and context.

You'll find the trading symbol, like "BTCUSDT", along with the name of the strategy that created the signal and the exchange it was executed on.  The timeframe is specified, becoming particularly relevant when running backtests.

A boolean value indicates whether the signal originates from a backtest or live trading environment. Each signal has a unique identifier, and a timestamp provides a reference point in time. Finally, the complete signal data, as a structured row, is included for detailed analysis.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been scheduled for future execution. It’s like a heads-up that a trade is about to happen, whether it’s part of a backtest or a live trading session.

The notification includes a lot of details about the upcoming trade: a unique ID, when it was scheduled, and whether it’s a backtest or live signal. You’ll also find information like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and where the trade will be executed.

It also provides key data points for the trade, such as the intended entry price, take profit, and stop-loss levels, as well as the original values before any adjustments. Detailed information around DCA averaging and partial closes are present too.

Beyond just the signal itself, you’ll find performance metrics like profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown, giving you insights into the potential risk and reward associated with the signal.  Finally, a "note" field allows for a human-readable explanation of the signal's reasoning.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened by a strategy. It provides a wealth of information about the trade, including a unique identifier and timestamp. You'll know whether the trade happened in a backtest simulation or in live trading conditions, and get details like the trading symbol and the strategy that initiated the trade.

The notification includes key pricing information like the entry price, take profit, and stop-loss levels, as well as original values before any adjustments. It also details how the position was built, whether through a single entry or multiple DCA (Dollar-Cost Averaging) steps.

Beyond the basic trade setup, the notification provides a comprehensive performance snapshot, including total profit/loss, peak profit, maximum drawdown, and associated prices and costs. This allows you to track the trade's performance and understand its risk profile. You can also find details on the trade's construction, like the number of entries and partial closures. Finally, there’s an optional note field that provides context on the reason behind the trade.

## Interface SignalOpenContract

This event, called `SignalOpenContract`, lets you know when a trading signal has been successfully activated, meaning your order has been filled by the exchange. It's like a confirmation that your limit order to buy or sell has gone through.

This event is particularly useful for keeping external systems in sync with what's happening in the trading framework. Think of it as a way to confirm orders with external order management systems or to create audit logs.

The event provides a lot of detail about the trade, including the entry price, stop-loss and take-profit levels (both original and adjusted), profit and loss figures, the number of entries and partial closes, and timestamps for when the signal was scheduled and when the position was activated. You'll also see the current market price at the moment the trade was triggered.  Essentially, it provides a complete snapshot of the position's status at the point of activation, assisting with tracking and reconciliation.

## Interface SignalInfoNotification

This notification type signals that a trading strategy has broadcasted some extra information related to an active position. It’s essentially a way for strategies to communicate custom details – like a brief explanation or status update – about a trade. The notification includes a wealth of details about the position, such as its entry and exit prices, profit/loss figures, and performance metrics like peak profit and maximum drawdown, all relative to the time the notification was sent. It also tells you whether the notification came from a test run (backtest) or a live trading environment, the exchange involved, and a unique ID for both the notification and the signal itself. You’ll find timestamps for various events including when the signal was created, the position went pending, and when the notification was generated, allowing you to track the signal's lifecycle. A user-defined note provides context for the information.

## Interface SignalInfoContract

This interface, `SignalInfoContract`, helps strategies communicate important information about their trading activity. When a strategy wants to share details about an open position – like custom annotations, debug messages, or notifications – it uses this contract to broadcast those messages. The messages contain a wealth of data, including the trading symbol, strategy name, exchange, and the precise timestamp of the event.

You can listen for these messages using `listenSignalNotify()` or `listenSignalNotifyOnce()` to receive notifications and react accordingly.

Here's a breakdown of what's included:

*   **Symbol:** The trading pair (e.g., BTCUSDT).
*   **Strategy Name:** Identifies the strategy generating the notification.
*   **Exchange Name:** The exchange where the trade occurred.
*   **Frame Name:**  Identifies the frame being used (empty if in live mode).
*   **Data:**  The complete signal row with all the original pricing details.
*   **Current Price:** The price at the time the message was sent.
*   **Note:**  A custom message from the strategy.
*   **Notification ID:** An optional identifier for linking to external systems.
*   **Backtest Flag:** Indicates if the notification originates from a backtest or live trading.
*   **Timestamp:**  A record of when the event happened, using the live tick time or the candle timestamp during backtesting.

## Interface SignalData$1

This describes the data you’ll find for each individual trade within a backtest report. Think of it as a record of one completed signal – what it was, when it started, when it ended, and how it performed. Each signal has a name identifying the strategy that created it, a unique ID for tracking, and the symbol being traded. You'll also find details like whether it was a long or short position, the percentage profit or loss (PNL), the reason for closing the trade, and the exact timestamps of when it opened and closed. This data is key to understanding how well your trading strategies are doing.

## Interface SignalCommitBase

This interface defines the fundamental information shared by all signal commitment events within the backtest-kit framework. It's like a common blueprint ensuring consistency in how signals are recorded, whether they originate from a backtest or a live trading environment.

Each signal commitment will include details like the trading pair's symbol, the name of the strategy that generated the signal, and the exchange being used.  You'll also find information about the timeframe, a flag indicating whether it’s a backtest or live event, and a unique identifier for the signal.

The data contains the timestamp of the event, a count of entries and partials (for tracking DCA and partial closes), the original entry price, the actual signal data, and an optional note to describe the reasoning behind the signal. This comprehensive set of properties enables robust analysis and auditing of trading decisions.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was because of a take profit or stop loss, or due to time expiration. It provides a wealth of information about the trade, including the unique identifier, the time it closed, and whether it occurred during a backtest or live trading.

You'll find details about the symbol traded, the strategy used, and the specifics of the trade itself – entry and exit prices, take profit and stop loss levels, and how many entries were involved, plus details about any partial closes.

The notification also includes comprehensive profit and loss (pnl) information. This includes the total pnl, the peak profit achieved, the maximum drawdown experienced, and even the prices and costs associated with those key points. 

Finally, you’ll receive information regarding the reason for the closure and the length of time the position was open, along with optional notes for extra context. It’s designed to provide a full picture of a closed position, from its inception to its termination.


## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether that's due to a profit target being hit, a stop-loss being triggered, time expiring, or a manual closure. It's designed to help external systems, like order management or auditing tools, stay in sync with what's happening in the trading framework.

You'll receive details about the closure, including the current market price, the total profit and loss (PNL) for the position, the highest profit achieved, the biggest drawdown experienced, and whether the trade was a long or short.

The event also provides insights into how the trade was managed, such as the original take profit and stop-loss prices, the entry price, and how many times the position was averaged or partially closed. A timestamp of when the signal was created and when the position was activated are also provided, alongside the reason for the closure.

## Interface SignalCancelledNotification

This notification appears when a trading signal that was scheduled for execution is cancelled before it actually takes place. It provides detailed information about the cancelled signal, allowing you to understand why it wasn’t triggered. The notification includes specifics like the signal's unique identifier, the trading symbol involved (e.g., BTCUSDT), and the strategy that generated it. 

You’ll also find details about the planned trade, such as the intended direction (long or short), take profit and stop-loss prices, and even the original entry price. Crucially, it reveals the reason for cancellation – whether it was due to a timeout, price rejection, or user intervention. Additional data like the cancellation duration, when the signal was initially created, and a descriptive note offer further context, helping you analyze and refine your trading strategies.

## Interface Signal

This section describes the `Signal` object, which represents a trading signal. 

It contains information about when and how a trade was initiated. The `priceOpen` property tells you the price at which the position was initially opened.

The `_entry` array keeps track of all the entry points for a position, including the price, total cost, and timestamp of each entry. This is helpful for understanding the cost basis of your position.

Finally, `_partial` is an array recording any partial exits from the position, noting if they were for profit or loss, the price at the time, the cost basis at the time of closure, the number of units held when the partial exit occurred, and the timestamp.


## Interface Signal$2

This `Signal` object tracks the details of a trading position. 

It holds the initial entry price, which is the `priceOpen` value when the trade began.

Internally, it maintains records of all entry events, storing the price, total cost, and timestamp for each entry.

Similarly, it also keeps track of any partial exits from the position, noting whether they were for profit or loss, the price at the time, cost basis, the number of shares/contracts closed, and the timestamp. 


## Interface Signal$1

This section describes the `Signal$1` object, which represents a trading signal within the backtest-kit framework.

It keeps track of key details about a trade.

Specifically, `priceOpen` stores the price at which the position was initially entered.

The `_entry` property is an array that records each entry made for the signal, including the entry price, total cost, and the time it occurred.

Finally, `_partial` is another array that tracks any partial exits taken from the position, noting whether they were profit or loss exits, the percentage of the position closed, the price at the time of the exit, the cost basis at the time of the exit, the number of entries closed, and the timestamp.

## Interface ScheduledEvent

This data structure, `ScheduledEvent`, brings together all the important details about trading events – whether they were scheduled, opened, or cancelled. Think of it as a single package containing everything needed to understand what happened with a trade.

It includes things like the exact time the event occurred, what type of event it was (opened, scheduled, or cancelled), and the specifics of the trade itself: the symbol, signal ID, position type, and any notes associated with it.

You'll also find key pricing information, like the entry price, take profit, and stop loss levels – and even the original values before any modifications were made. 

For events involving multiple entries or partial closes, it tracks the number of entries and executed partials. 

Furthermore, it incorporates profitability data (PNL), timing information (like close timestamp and duration), and reasons for cancellation. It’s a comprehensive record for analyzing and reporting on trading activity.

## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled trading signals are performing. It keeps track of all scheduled, activated, and cancelled signals, giving you a complete picture of their lifecycle.

You'll find details of each individual event in the `eventList`, including all relevant information.

Beyond the raw counts, this model provides key insights like the cancellation rate – indicating how often signals are cancelled – and the activation rate – showing how often signals lead to actual trades. It also tells you how long signals typically wait before being cancelled or activated, measured in minutes. These metrics are invaluable for fine-tuning your scheduling strategies and improving overall trading efficiency.


## Interface SchedulePingContract

The SchedulePingContract provides a way to track the status of scheduled signals as they're being monitored. These events are sent out every minute while a signal is active – meaning it hasn't been canceled or activated yet. You can use these pings to build your own custom monitoring systems.

Each ping contains detailed information, including the trading symbol (like BTCUSDT), the name of the strategy that’s monitoring it, the exchange it’s on, and all the data related to the signal itself.

The `currentPrice` property is particularly helpful – it's the current market price at the moment the ping is sent, allowing you to react to price changes and potentially cancel signals based on custom rules.  You’ll also find a flag indicating whether the event comes from a backtest (historical data) or live trading.  Finally, the timestamp indicates precisely when the ping occurred, reflecting either the live ping time or the candle timestamp in backtest mode.

## Interface RiskStatisticsModel

This model holds the results of risk rejection analysis, giving you insights into how often and where risks are being triggered. It contains a list of all the individual risk events that occurred, allowing for detailed investigation. You'll also find the total count of rejections, a breakdown of rejections categorized by the trading symbol, and another breakdown showing the number of rejections attributed to each trading strategy. This data helps you monitor risk performance and identify areas needing adjustments.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked because of risk management rules. Each notification has a unique identifier, a timestamp marking when it happened, and whether it occurred during a backtest or live trading. 

You'll find details like the trading symbol, the name of the strategy that tried to execute the signal, and the exchange involved. The `rejectionNote` property provides a clear explanation of why the signal was rejected.

The notification also includes information about the market conditions at the time, such as the current price and the number of existing open positions. If a signal was associated with a pending order, its identifier will be provided, along with the trade direction (long or short), the entry price, take profit and stop loss levels, expected duration, and an optional description. Finally, it records when the notification itself was created.

## Interface RiskEvent

This data structure represents an event that occurs when a trading signal is blocked due to risk management rules. 

It provides details about *why* a signal wasn't executed, including the timestamp, trading pair (symbol), the signal itself, the strategy used, and where the trading would have taken place (exchange and timeframe). You’ll find information about the current market price, how many positions were already open, and a unique ID for the rejection. 

A note explains the reason for the rejection. It also indicates if the event happened during a backtest or a live trading session. This information is vital for creating reports and analyzing risk management performance.


## Interface RiskContract

The RiskContract provides information about situations where a trading signal was blocked because it violated risk rules. It's a way to keep track of when your risk management system steps in and prevents a trade from happening.

You'll see these events only when a signal is actually rejected – not when everything is working within allowed limits. This helps you focus on the situations that require attention and adjustment.

Each RiskContract includes details like the trading pair (symbol), the signal itself (position size, prices, etc.), the strategy that wanted to execute the trade, the time frame used, the exchange involved, and the current market price at the time.  It also logs how many other positions were already open and gives a unique ID for tracking the rejection, along with a human-readable explanation of why the signal was rejected. Finally, it identifies whether this event came from a backtest or live trading environment. This information is useful for generating reports and for custom notifications.

## Interface ProgressWalkerContract

This interface, ProgressWalkerContract, lets you monitor the progress of background tasks within the backtest-kit framework. Think of it as a notification system that provides updates while a process like strategy backtesting is running. 

It gives you key details: the name of the walker, the exchange being used, the frame, and the trading symbol involved.

You'll also see how many strategies are being evaluated in total and how many have already been processed. Finally, the completion percentage provides a clear indication of how far along the process is. This information is particularly helpful for long-running tasks, allowing you to track their status and get a sense of when they might be finished.

## Interface ProgressBacktestContract

This interface provides a way to monitor the progress of a backtest as it runs. You'll receive updates during the backtest execution, letting you know which exchange and strategy are being used, and which symbol is being tested. The updates include the total number of historical data points (frames) being analyzed, how many have already been processed, and a percentage indicating how close the backtest is to completion. This allows for a good understanding of the backtest's status and estimated time remaining.


## Interface PerformanceStatisticsModel

This model holds a collection of performance statistics for a specific trading strategy. It provides a structured way to understand how a strategy performed.

You’ll find the strategy's name, the total number of performance events tracked, and the overall execution time.

The `metricStats` property breaks down the statistics further, organizing them by the type of metric being measured. Finally, a list of individual `PerformanceContract` objects represents all the raw performance data points collected. This allows for detailed analysis and a complete picture of the strategy's performance.

## Interface PerformanceContract

The PerformanceContract helps you monitor and analyze how your trading strategies are performing. It's like a detailed log of what's happening during execution, tracking things like how long different operations take. 

Each entry in this log, a PerformanceContract, contains information such as when the event occurred, when the previous event happened (useful for calculating deltas), what type of action was performed, how long it took, and which strategy, exchange, and trading symbol were involved. 

You'll also find details about the specific testing environment - whether it's a backtest or live trading scenario. This data is invaluable for spotting slowdowns, optimizing your code, and generally understanding the efficiency of your trading system. The `frameName` will be empty when in live mode.

## Interface PartialStatisticsModel

This data model holds key statistics about partial profit and loss events during a trading backtest. Think of it as a snapshot of how your strategy performed at specific milestones. 

It includes the complete details of each individual profit and loss event within the `eventList`.

You'll also find the total count of all events, alongside the specific numbers of profit and loss events, allowing you to quickly grasp the overall performance profile.

## Interface PartialProfitContract

The `PartialProfitContract` represents when a trading strategy reaches a predefined profit milestone, like 10%, 20%, or 30% profit. It's a way to track how well your strategy is performing and when it's hitting those key profit targets.

This contract provides details like the trading symbol, the name of the strategy being used, the exchange, the execution environment (live trading or backtesting), and the exact price at which the milestone was reached. 

You'll also find the original signal data, the specific profit level achieved, and a timestamp indicating precisely when that event occurred. This information is crucial for generating performance reports and allowing users to monitor their trading strategies in real-time or through historical data. Events are designed to avoid duplicates, even if the price jumps around.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It provides a wealth of information about that specific trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading.

You’ll find details like the trading pair (e.g., BTCUSDT), the strategy that triggered it, and the exchange used. Crucially, it includes the percentage of the position that was closed, the current market price at the time, and the direction of the trade (long or short).

The notification also gives you insights into the trade's history, like the original entry price, take profit and stop loss levels, and details about any DCA averaging used. It delivers a complete picture of the position’s performance, including profit/loss numbers, peak profit achieved, and maximum drawdown experienced – all broken down with important pricing details. Finally, it includes a note field for any custom explanation of the trade's rationale and timestamps for different stages of the signal lifecycle.

## Interface PartialProfitCommit

This object represents a signal to take a partial profit on a trade. It provides a snapshot of the position's performance and details surrounding the decision to close a portion of it.

The `action` property clearly identifies this as a partial profit event.  `percentToClose` indicates what percentage of the position should be closed. 

Crucially, it includes information about the trade's history: `priceOpen` is the initial entry price, `priceTakeProfit` and `priceStopLoss` are the final, adjusted prices, and the original prices are also available.

You'll also find key performance metrics like `currentPrice`, `pnl` (profit and loss), `peakProfit`, and `maxDrawdown`, allowing you to understand the trade's behavior leading up to this partial profit signal.

Finally, `position` tells you whether the trade was a long or short, and `scheduledAt` and `pendingAt` provide timestamps for when the signal was created and the position was activated, respectively.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a milestone in achieving profit, like hitting 10%, 20%, or another pre-defined level. It provides a wealth of information about the trade that triggered it, including a unique ID, the exact time it happened, and whether it’s from a backtest or live trading. You’ll find details about the trading pair, the strategy used, the exchange, and the signal itself, alongside key pricing information like entry and take profit/stop loss levels – both the original and any adjusted values due to trailing.

The notification also breaks down the performance of the trade, including the total profit or loss, peak profit achieved, and maximum drawdown experienced.  You can see how much has been invested, the entry and exit prices used in the profit calculation, and even details about any DCA averaging. Finally, there's an optional note field for a human-readable explanation of the trade's logic, and timestamps related to the signal's creation and execution.

## Interface PartialLossContract

The PartialLossContract represents notifications of a trading strategy hitting predefined loss levels, like -10%, -20%, or -30% drawdown. These notifications are triggered when a signal reaches a loss level milestone.

It's important to know that each loss level is only reported once for each signal.  If the price moves significantly, multiple loss levels could be triggered within a single tick.

The information included provides a detailed snapshot of the event: you’ll find the trading symbol, the strategy and exchange involved, the frame name (or empty if it’s a live trade), and the full original signal data. It also includes the current price at the time of the loss and precisely which loss level was reached, presented as a positive number representing a negative percentage. Finally, it tells you whether the event is from a backtest (historical data) or a live trade. The timestamp reflects when the loss was detected, either based on the tick time during live trading or the candle timestamp during backtesting.

## Interface PartialLossCommitNotification

This notification details a partial closure of a trading position. It's triggered whenever a strategy takes a piece of its position off the table.

Each notification has a unique ID and timestamp, alongside details about whether it’s from a live or backtest environment.

You'll find information about the trading pair, the strategy that initiated the action, and the exchange involved. It also includes key technical details like the signal ID, percentage of position closed, current price, and trade direction (long or short).

The notification also provides insight into the position's history, including the entry price, take profit and stop-loss levels, and the original prices before any adjustments. You can also see the number of entries and partials, alongside performance metrics like total profit and loss (PNL), peak profit, and maximum drawdown.

Further details are provided regarding the profit and loss calculations, including entry and exit prices and the cost in USD. You'll also get information about the prices and costs associated with peak profit and maximum drawdown.

Finally, an optional note field can provide a human-readable explanation for the signal and there are timestamps associated with the signal's creation, pending state, and notification creation.

## Interface PartialLossCommit

This data represents a partial loss event within the backtest framework. It details when a portion of a trading position is closed, giving insight into the strategy's risk management.

The `action` property confirms this is a partial loss. The `percentToClose` indicates what percentage of the initial position size is being closed out. 

You'll also find key price points including the `currentPrice` at the time of the partial loss, the `priceOpen` (entry price), and the `priceTakeProfit` & `priceStopLoss` which might have been adjusted with trailing stops. The original take profit and stop loss prices are also available. 

The `pnl`, `peakProfit`, and `maxDrawdown` properties provide a performance snapshot of the position, helping you analyze its profitability and risk exposure throughout its lifecycle. Finally, timestamps like `scheduledAt`, `pendingAt` offer chronological context for the action.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has reached a pre-defined loss milestone, like a 10% or 20% drawdown. It's a way to track how a trade is performing and potentially adjust strategy parameters.

The notification includes a unique ID and timestamp, along with details about whether it's from a backtest or live trade. It tells you which trading pair, strategy, and exchange were involved, along with the signal's unique identifier.

You'll find information about the loss level reached (e.g., 10%, 20%), along with the current market price, the original entry price, and whether the trade is long (buy) or short (sell). It also provides the original and adjusted stop-loss and take-profit prices.

The notification offers a comprehensive snapshot of the position's performance, including the total number of entries and partial closes, as well as profit/loss figures in both percentage and absolute USD amounts.  You’ll also see key metrics like peak profit, maximum drawdown, and the prices and entries associated with those events. A note field allows for additional context. Finally, there are timestamps related to signal creation and status transitions.

## Interface PartialEvent

This `PartialEvent` object holds all the key details about profit or loss milestones during a trade. Think of it as a record of where a trade hit important price levels. 

It includes information like when the event happened (`timestamp`), whether it was a profit or loss (`action`), and which trading pair was involved (`symbol`). You'll also find details specific to the trading strategy used (`strategyName`, `signalId`), including the entry and exit prices (`priceOpen`, `priceTakeProfit`, `priceStopLoss`), and how many entries were made if a DCA strategy was used (`totalEntries`).

Furthermore, it captures important historical data like the initial take profit and stop loss prices (`originalPriceTakeProfit`, `originalPriceStopLoss`) and how much of a partial close was executed (`totalPartials`, `partialExecuted`).  The `pnl` property provides a snapshot of the unrealized profit and loss at that specific point in time. A human-readable `note` can also be included to describe the reason behind the signal. The data also includes the time when the position became active (`pendingAt`) and when the signal was first scheduled (`scheduledAt`). Finally, a flag indicates whether the trade was part of a backtest (`backtest`).

## Interface MetricStats

This data structure holds combined statistics for a particular performance metric. It essentially summarizes a collection of measurements.

You'll find information like the total number of measurements taken, the overall time spent, and calculated averages. 

It also provides details about the range of values, including the minimum and maximum, alongside statistical measures like standard deviation, median, and percentiles (like the 95th and 99th).

For metrics related to event timing, you'll see data about wait times between events, again including averages, minimums, and maximums. This allows for a comprehensive look at the performance characteristics of a specific metric.

## Interface MessageModel

This defines what a single message looks like within a conversation managed by a Large Language Model. Each message has a `role`, which tells you who sent it – whether it's a system instruction, something the user typed, a response from the assistant, or a result from a tool. The core of the message is its `content`, the actual text being communicated.

Sometimes, assistants might use "chain of thought" reasoning, and that’s captured in the `reasoning_content` property. 

If the assistant used a tool to generate a response, you’ll find details about that tool call listed in `tool_calls`.  Images can also be included within messages and are supported in various formats. Finally, `tool_call_id` links a message directly to a specific tool call.


## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred during a backtest or trading simulation. 

It keeps track of each drawdown event individually within the `eventList` property, which provides a detailed chronological record of these significant losses.  You'll find the most recent events at the beginning of this list.

Additionally, the `totalEvents` property gives you a simple count of how many maximum drawdown events have been recorded overall.

## Interface MaxDrawdownEvent

This describes a single instance of a maximum drawdown event that occurred during trading. Each event provides details about when it happened, the trading pair involved, the strategy and signal that triggered it, and whether it occurred during a backtest.

You'll find key information like the position (long or short), the profit and loss (PNL) of the position, and the peak profit reached. Critically, it includes the maximum drawdown experienced, along with the price at which the drawdown occurred, the initial entry price, and the take profit and stop-loss levels that were set. The timestamp indicates precisely when this drawdown record was established.

## Interface MaxDrawdownContract

This interface defines the information shared whenever a maximum drawdown is detected for a trading position. It provides details like the trading symbol, the current price, and a timestamp to understand when the drawdown occurred. You'll also find context about the strategy, exchange, and timeframe involved. 

The included signal data gives insight into the factors influencing the position's performance, and a flag clarifies whether the event happened during a backtest or live trading. Tracking this information helps in managing risk, adjusting strategies, and reacting to significant changes in a position’s value.

## Interface LiveStatisticsModel

The `LiveStatisticsModel` gives you a detailed breakdown of how your live trading system is performing. It collects data from every trade, including idle periods, opened positions, active trades, and closed signals, and presents it in a clear, organized way.

You'll find the raw event data in the `eventList`, along with the total number of events, and the number of signals that have been closed. Key performance indicators such as win count and loss count help you understand your win rate.

Beyond the basics, the model calculates more sophisticated metrics like average profit per trade (`avgPnl`), total cumulative profit (`totalPnl`), and volatility measures (`stdDev`, `sharpeRatio`).  It also provides annualized versions of the Sharpe Ratio to compare your performance on a yearly basis.

Additional ratios such as the Certainty Ratio, Sortino Ratio, and Calmar Ratio offer deeper insights into risk-adjusted returns and potential for future growth. Finally, the model tracks peak and fall PNL values to illustrate potential high and low points of your trading. All numerical values are flagged as potentially unsafe (null) if the calculation would result in an invalid number.

## Interface InfoErrorNotification

This notification is how the backtest-kit framework alerts you to problems encountered during a backtest run. It's specifically for errors that aren't critical enough to halt the entire process – think of them as warnings or issues you might want to investigate. 

Each notification has a unique identifier (`id`) to help you track them. You'll find a friendly explanation of the problem in the `message` field. The `error` property provides more detailed information, including a stack trace and any related data. 

Importantly, these notifications originate from the live trading environment, so `backtest` is always false.

## Interface IdlePingContract

This contract represents events that occur when a trading strategy is in an idle state, meaning it's not actively responding to any signals. 

These "idle ping" events are emitted regularly when a strategy isn't actively being guided by a signal.

The event provides useful information, including the trading symbol involved, the name of the strategy, the exchange it's operating on, and whether it's a backtest or live trading scenario.

You can use functions like `listenIdlePing()` or `listenIdlePingOnce()` to be notified whenever these idle ping events happen. 

Each event includes details like the current market price, a timestamp marking exactly when the ping occurred (either a real-time tick or the candle timestamp in backtest mode).

## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest. It bundles together key information about that strategy's performance.

You’ll find the strategy’s name listed clearly.

Alongside that, it includes comprehensive statistics about the backtest itself, covering things like returns, drawdown, and win rate.

A calculated metric value is provided, which is used to compare the strategy's performance against others.  If the strategy isn't suitable for comparison, this value will be null.

Finally, the rank indicates where the strategy stands relative to others – with a rank of 1 being the top performer.


## Interface IWalkerSchema

The IWalkerSchema defines how to set up comparisons between different trading strategies. Think of it as a blueprint for an A/B test of your strategies.

You'll give it a unique name and an optional note for your own records.

Crucially, you specify the exchange and timeframe to use for testing all the strategies within that setup.

The schema also lists the specific strategies you want to compare – these need to be registered separately.

You can choose which metric, like Sharpe Ratio, to optimize for.

Finally, you can include optional callback functions to react to certain events during the backtesting process.

## Interface IWalkerResults

This interface holds all the information collected when comparing different trading strategies. It tells you which financial instrument, or symbol, was being tested. You’ll also find the name of the exchange where the trading took place, the specific walker that performed the tests, and the frame used for analysis. Essentially, it provides a complete record of the test environment.

## Interface IWalkerCallbacks

This interface lets you hook into the backtest kit's workflow and run custom actions at key moments. You can listen for when a particular strategy begins testing, finish testing, or encounters an error. 

It also gives you a notification when the entire backtesting process is complete, providing you with a summary of all the results. Essentially, it's a way to customize and monitor the backtesting process.

Here's a breakdown of what you can do:

*   **onStrategyStart:**  Get notified when a new strategy starts testing – useful for logging, progress updates, or preparing for data processing.
*   **onStrategyComplete:**  Receive the final results for a completed strategy, including statistics and performance metrics.
*   **onStrategyError:**  Handle any errors that occur during a strategy's backtest, enabling you to debug or log issues.
*   **onComplete:**  Get a summary of all strategies and their results once all backtests are done.

## Interface ITrailingTakeCommitRow

This interface represents a queued action to adjust a trailing take profit order. 

Essentially, it describes a change to a take profit level, triggered by a trailing stop mechanism.

It includes the type of action being performed ("trailing-take"), the percentage shift needed to move the take profit, and the price at which the trailing stop was initially set. This allows you to understand how the take profit is being dynamically adjusted based on market movements.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a record of what needs to happen concerning a trailing stop, waiting to be processed. 

It includes information like the type of action being performed, which in this case is specifically a "trailing-stop" action.  You’ll also find the percentage shift that's been applied and the current price at which the trailing stop was initially established – essential details for correctly executing the order.


## Interface IStrategyTickResultWaiting

This interface describes a specific kind of result you might get when a trading strategy is waiting for a signal to become active. Imagine your strategy has planned a trade, but it's waiting for the price to reach a certain level before executing. This result is sent repeatedly while it's waiting.

It contains details about the signal itself, including the current price being monitored, the name of the strategy, and information about the exchange and timeframe used. You'll also find information about the potential take profit and stop loss levels, though for signals that are currently waiting, these are always at 0%.

Furthermore, it provides a snapshot of the unrealized profit and loss (PNL) if the trade were to be executed right now, and flags whether the situation is from a backtest or a live trading environment. Finally, a timestamp indicates when this specific tick result was created.

## Interface IStrategyTickResultScheduled

This interface represents a specific type of event that occurs within a trading strategy—when a signal is generated and scheduled, waiting for a price condition to be met. Think of it as a "pause" moment where the strategy is anticipating the price to reach a predetermined level.

It carries a lot of information about that event: the name of the strategy executing it, the exchange and timeframe involved, the specific symbol being traded, and the current price at the time the signal was scheduled.

You'll also find whether this scheduled event happened during a backtest or in a live trading environment, and a timestamp marking when this particular event occurred. The `action` property simply identifies this as a "scheduled" event. Essentially, it’s a record of a signal ready to be activated once the price hits a certain point.

## Interface IStrategyTickResultOpened

This interface describes the data you receive when a new trading signal is created. It's a notification that a signal has been successfully generated and saved.

You’ll find details about the signal itself, including the newly assigned ID. 
It also includes information about which strategy, exchange, and timeframe generated the signal, as well as the symbol being traded.

The `currentPrice` represents the price at the moment the signal was opened.
You'll also know if the event occurred during a backtest or in a live trading environment, and when it was created. 


## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state – meaning it's not currently generating a trading signal. 

It provides a snapshot of the situation at that moment, including the strategy's name, the exchange it’s connected to, the timeframe being used (like 1-minute or 5-minute candles), and the trading symbol. You'll also find the current price, whether the data is from a backtest or live trading, and a timestamp indicating when this idle state was recorded. Basically, it’s a record of what was happening when your strategy wasn't actively suggesting a trade.

## Interface IStrategyTickResultClosed

This interface represents the information you receive when a trading signal is closed, providing a complete picture of the event. It includes details like the reason for closure—whether it was due to a time limit, reaching a profit or loss target, or a manual close.

You'll find information about the original signal parameters, the final price at which the trade closed, and a timestamp indicating exactly when the closure happened.

Crucially, it delivers a full profit and loss (PNL) calculation, factoring in fees and slippage to show the true profitability of the trade.

The interface also bundles information for tracking purposes, such as the strategy name, exchange, time frame, and trading symbol, alongside flags indicating whether the event occurred during a backtest or live trading. Finally, specific user-initiated closes have a unique close ID and a creation timestamp.

## Interface IStrategyTickResultCancelled

This interface describes a specific type of result you might get during a backtest or live trading session: when a scheduled signal is cancelled. Think of it as a notification that a planned trade didn't happen – perhaps the signal never triggered, or it was stopped before a position could be opened.

The result includes details about why the signal was cancelled, the signal itself, the price at the time of cancellation, and timestamps to help you track what happened. You’ll also find information like the strategy name, exchange, time frame, symbol being traded, and whether it’s a backtest or live event. 

A `reason` property explains the specific cause of the cancellation, and there’s even an optional `cancelId` if the cancellation was initiated by a manual cancellation request. Finally, there’s a `createdAt` timestamp to provide the context of when the result was generated.


## Interface IStrategyTickResultActive

This interface describes a situation where a trading strategy is actively monitoring a signal, awaiting either a take profit/stop loss trigger or a time expiration. It provides detailed information about the ongoing activity, including the signal being monitored, the current price used for evaluation, and the strategy's name and the exchange and timeframe involved. 

You'll find details like the trading symbol, progress towards take profit and stop loss, and the unrealized profit/loss (PNL) including fees and slippage. The system also indicates whether the data originates from a backtest or live trading environment. A timestamp tracks when the result was generated, and another timestamp helps manage the timing of backtest operations.

## Interface IStrategySchema

This schema describes a trading strategy you'll register within the backtest-kit framework. It's essentially a blueprint for how your strategy will generate trading signals.

Each strategy gets a unique name to keep things organized. You can also add a note for yourself or other developers documenting the strategy’s purpose.

The `interval` property controls how frequently the strategy can generate signals – it helps prevent overwhelming the system. By default, it’s set to once per minute.

The core of the strategy is the `getSignal` function. This function takes current market data and calculates whether to enter or exit a trade.  It can optionally wait for a specific price to be reached, which allows for more precise order placement.

You can also provide optional lifecycle callbacks like `onOpen` and `onClose` to respond to specific events within the strategy's execution.

Finally, strategies can be associated with risk profiles and actions for a more robust and managed trading environment.

## Interface IStrategyResult

The `IStrategyResult` object holds all the key information about a strategy's performance after a backtest. It's designed to be easily compared against other strategies, typically in a table or ranking.

You'll find the strategy's name, along with a comprehensive set of statistics detailing how it performed during the backtest. 

It also includes a numerical value representing the optimization metric used – this helps determine which strategies are the most successful according to the chosen criteria.  

Finally, it records the timestamps of the first and last signals generated by the strategy, providing insight into when the strategy started and stopped making trades. These timestamps are null if no signals were produced.

## Interface IStrategyPnL

This interface, IStrategyPnL, represents the results of a trading strategy's performance, specifically focusing on profit and loss. It provides key information about the financial outcome of trades, considering the impact of fees and slippage. 

The `pnlPercentage` tells you the percentage gain or loss – a positive number means profit, and a negative number indicates a loss. To understand the actual monetary profit or loss, `pnlCost` represents that amount in dollars, calculated based on your total investment (`pnlEntries`). 

You'll also find the `priceOpen` and `priceClose`, which are the prices at which you entered and exited trades, respectively, but adjusted to account for fees and slippage, giving you a more accurate picture of your trading costs. `pnlEntries` indicates the total capital you've committed to all your trades.

## Interface IStrategyCallbacks

This interface defines a set of optional callbacks that your trading strategy can use to respond to different lifecycle events. Think of them as hooks that let your strategy react to what's happening with your signals.

You can receive notifications when a signal is opened, becomes active, goes idle, closes, gets scheduled for later entry, or is cancelled. There are also callbacks for specific states like partial profit, partial loss, or reaching breakeven. The `onTick` callback gives you a chance to react to every price update.

Scheduled signals have their own callbacks for pinging – `onSchedulePing` which checks in every minute, and `onActivePing` for active pending signals which also helps with custom monitoring and dynamic signal management. A callback named `onWrite` lets you interact with the data when it’s being saved for testing purposes.

## Interface IStrategy

The `IStrategy` interface defines the core methods used when running a trading strategy.

The `tick` method is called for each price update, checking for signals, take/stop profit conditions and other important events.  Retrieving pending and scheduled signals (`getPendingSignal`, `getScheduledSignal`) is done internally to monitor TP/SL and expiration.

Several methods provide insight into the state of the strategy and its position: `getBreakeven` checks if breakeven is reached, while `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionInvestedCount`, `getPositionEffectivePrice` and `getPositionPnlPercent` provide detailed information about the current position.

Backtesting is handled by the `backtest` method, processing historical data to evaluate performance.  Control functions like `stopStrategy`, `cancelScheduled`, and `closePending` allow for gracefully exiting positions or scheduled trades.

`partialProfit` and `partialLoss` allow for partial position closures, and `trailingStop` and `trailingTake` adjust stop-loss and take-profit levels respectively. `breakeven` shifts the stop-loss to the entry price when certain conditions are met.

A wide range of getter methods (`getPosition...`) provide access to numerous data points related to the current trade.  Finally, `dispose` cleans up the strategy when it's no longer needed.


## Interface IStorageUtils

This interface defines the core functionality for any system that stores trading signals within the backtest-kit framework. Think of it as a contract that ensures different storage solutions (like databases or files) can all interact with the backtesting process consistently.

The methods describe how to react to different signal events – when a position is opened, closed, scheduled, or cancelled.

It also provides ways to look up individual signals by their ID or retrieve a complete list of all signals.

Finally, there are methods for handling "ping" events which keep track of how long signals remain active or scheduled, keeping the data current.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for a future action.  It's a simple way to track signals that aren't immediately actionable but will be handled later. The `status` property is specifically set to "scheduled" to indicate this type of signal. Essentially, it’s a flag marking a signal as being queued up for processing.

## Interface IStorageSignalRowOpened

This interface represents a signal row specifically when a trade is opened. It's a simple structure indicating that the signal is in an "opened" state. The `status` property explicitly confirms this open status, providing a clear indicator of the trade's current phase. Think of it as a confirmation that a position has been initiated based on the signal.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed, meaning a trade has been executed and the position settled. 

It holds information specifically related to signals that are no longer active. 

The `status` property confirms that the signal is indeed in a "closed" state. 

Crucially, a `pnl` property is included which details the profit and loss realized when the signal was closed – something not available for open signals.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. 

It’s straightforward: a signal is marked as “cancelled,” and this interface simply records that fact. The `status` property is fixed and always indicates a "cancelled" state, providing a clear and consistent way to identify these signal events.

## Interface IStorageSignalRowBase

This interface defines the basic structure for storing signals, ensuring they're preserved with accurate timestamps. 

Every signal record will have a `createdAt` timestamp, marking when it was initially created, and an `updatedAt` timestamp to track any modifications. 

Signals are also prioritized during storage, using a `priority` value which is essentially the current time, helping manage how they are written to storage. This consistent approach applies to both live trading and backtesting scenarios.


## Interface IStateParams

The `IStateParams` interface helps you define how your signals will store and manage their state. Think of it as setting up the organizational structure for your data. You specify a `bucketName`, which acts as a label or namespace to group related state information together – like "trade" for trade-related data or "metrics" for performance metrics.  You also provide an `initialValue`, which is what the signal will start with if there's no saved data available yet. This ensures your signals have a predictable beginning.


## Interface IStateInstance

This interface provides a way to manage and track data specific to each trading signal. It's designed to hold information like peak unrealized profit and how long a trade has been open.

Think of it as a place to store evolving details about a trade as it progresses, particularly useful when using AI-powered strategies.

The `waitForInit` method is used to set up the state when it first starts.

`getState` lets you retrieve the current state data, ensuring that you don’t look into the future by only accessing data from a point in time that has already passed.

`setState` is how you update the state, and it’s cleverly designed so that older data can be overwritten, making it safe for restarting backtests.

Finally, `dispose` cleans up any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines how to size your trades based on the Kelly Criterion, a method that aims to maximize long-term growth. 

It requires you to specify the sizing method as "kelly-criterion."

You also need to set a `kellyMultiplier`, which essentially controls how aggressively you apply the Kelly formula. A value of 0.25, for example, represents a "quarter Kelly" approach, which is a more conservative and common way to use the criterion to avoid risking too much capital on any single trade. Lower values reduce risk, while higher values increase potential but also potential losses.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades using a fixed percentage of your capital. It's straightforward – you specify a percentage, for example, 1%, and each trade will risk that percentage of your total funds. 

The `method` property is always "fixed-percentage", indicating the type of sizing being used. 

You'll also set the `riskPercentage`, which is the specific percentage you want to risk on each trade. This value should be between 0 and 100.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations within the backtest-kit framework. Each sizing configuration needs a unique identifier, which is the `sizingName`.  You can also add a helpful note to document the sizing strategy using the `note` property. 

The sizing configuration specifies the limits for position sizes, including a maximum percentage of the account that can be used (`maxPositionPercentage`), and minimum and maximum absolute sizes (`minPositionSize`, `maxPositionSize`).  Finally, it allows for optional callbacks (`callbacks`) that can be used to extend sizing behavior at different points in the trading lifecycle.

## Interface ISizingSchemaATR

This schema defines how to size trades based on the Average True Range (ATR). It's specifically designed for strategies that use ATR to determine appropriate position sizes. 

You'll define a `riskPercentage` which represents how much of your capital you’re willing to risk on each trade, expressed as a percentage.

The `atrMultiplier` is a key factor—it dictates how much the ATR value will be multiplied to calculate the distance for your stop-loss order. A higher multiplier results in a wider stop-loss.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines how to configure a trading strategy's sizing based on the Kelly Criterion. It's primarily used when setting up a `ClientSizing` object.

The most important property is `logger`, which is a service used for logging debugging information about the sizing calculations. This helps you understand how the Kelly Criterion is applied and diagnose any issues.

The `IStrategyParams` interface outlines all the settings you can provide to configure a backtesting strategy. It includes things like how sizing should be handled (`sizingParams`), how the backtest itself should be run (`backtestParams`), and even how commissions are calculated. You’ll also find options for logging (`logger`), controlling verbosity (`verbose`), managing slippage, and defining where data files are located (`baseDirectory`). Further, you can define custom handlers for various events during the backtest, like trade execution, bar updates, and the end of the process.

The `IBacktestParams` interface contains configurations for how your backtest is executed. This includes details such as the time period (`from` and `to`), the data interval (`interval`), how initial data is handled (`initialQuery` and `finalQuery`), and settings related to data output (`barOutput` and `outputDirectory`). You can control round trips, maximum trades (`maxTrades`), and enable verbose output for more detailed information.

The `ICommissionParams` interface determines how commissions are factored into your backtest results.  You can define a fixed `static` commission amount or a more complex `dynamic` commission structure. If using dynamic commissions, you’ll define the specifics using `IDynamicCommissionParams`.

The `IDynamicCommissionParams` interface allows for a sophisticated commission calculation. It provides two options: a fixed value or a function (`dynamic`) that calculates the commission based on the price and size of the trade. This is useful for exchanges with tiered commission structures.

The `ILogger` interface defines a basic logging service. It provides methods for writing messages at different severity levels: `debug`, `info`, `warn`, and `error`. This allows the framework to output diagnostic information about the process.

## Interface ISizingParamsFixedPercentage

This interface defines how much of your capital you'll use for each trade when using a fixed percentage sizing strategy. 

It's pretty straightforward: you'll need a logger to track what's happening during your backtesting. The logger helps you understand why your trades are happening and to debug any issues.


## Interface ISizingParamsATR

This interface defines how to control the size of your trades when using an Average True Range (ATR) based sizing strategy. It's all about setting up the tools to determine how much capital to allocate to each trade.

The `logger` property lets you specify a logging service to help track what's happening behind the scenes—useful for debugging and understanding your sizing logic. It helps you keep an eye on how the ATR calculations are impacting trade sizes.

## Interface ISizingCallbacks

This section describes functions you can use to monitor and influence how your trading strategy determines the size of its positions. Specifically, `onCalculate` is a function that gets called right after the framework computes the position size. Think of it as a place to record what size was decided, or to double-check if the size makes sense given the current market conditions. You can use it for logging purposes or to implement any extra validation steps.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your position sizes using the Kelly Criterion.

Essentially, it tells the backtest framework how to determine how much of your capital to risk on each trade.

You'll need to provide your win rate, which represents the percentage of winning trades, and your average win/loss ratio – how much you win compared to how much you lose on a single trade. These two values are crucial for a proper Kelly Criterion calculation.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the specific information needed when you're calculating position sizes based on a fixed percentage of your portfolio. It's all about determining how much to trade based on a predetermined percentage. 

You’ll need to specify the `method`, which must be "fixed-percentage" to indicate this type of sizing. 

Also, you’ll provide a `priceStopLoss` value, which represents the price at which your stop-loss order will be triggered.

## Interface ISizingCalculateParamsBase

This interface defines the essential information needed to determine how much of an asset to trade. 

It includes the symbol of the trading pair, like "BTCUSDT," so the system knows what assets are involved. 

You'll also find the current account balance, which is crucial for calculating position sizes based on risk tolerance. Finally, the planned entry price provides context for the potential profit or loss.

## Interface ISizingCalculateParamsATR

This defines the parameters needed when calculating position sizing using an ATR (Average True Range) approach.

Essentially, you're specifying that the sizing method will be based on ATR.

You also need to provide the current ATR value, which represents the average volatility over a specific period. This value is crucial for determining the appropriate size of your trades based on the perceived risk.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset to buy or sell. It's the core of determining your position size during trading.

The key part of this interface is the `calculate` function. This function takes in some information about your risk tolerance and market conditions (`ISizingCalculateParams`) and then figures out the appropriate size of the trade – essentially, how many shares or contracts to deal with. It promises a number representing that calculated size.


## Interface ISignalRow

This `ISignalRow` represents a complete trading signal, packed with all the essential details needed for backtesting and live execution. Think of it as a single, structured record of a trading opportunity. Each signal gets a unique ID for easy tracking.

It contains all the standard information: the price at which you’d enter the position, the cost of the trade, and the exchange and strategy being used.  There's also a timestamp marking when the signal was originally created or scheduled.

The record also captures important details for ongoing management. `minuteEstimatedTime` sets a timeframe for how long the position is expected to last. The system takes note of when a trade becomes pending (`pendingAt`).

Beyond the basics, the `ISignalRow` tracks key profit and loss metrics. The `_partial` array records any partial exits (taking profits or cutting losses) to accurately calculate overall performance.  Trailing stop-loss and take-profit prices are also managed, providing dynamic adjustments to your initial targets. DCA (Dollar Cost Averaging) entries are tracked in the `_entry` array.  The `_peak` and `_fall` values represent the highest and lowest prices seen during the trade's lifetime, useful for analysis. Finally, the `timestamp` provides a record of when the signal was created in a backtest or requested in a live scenario.

## Interface ISignalIntervalDto

This data transfer object, or DTO, helps manage signals within the backtest-kit framework, particularly when you need to group multiple signals together and retrieve them at once. Think of it as a way to bundle signals so that they are delivered as a single unit, rather than individually.

Each signal within this bundle has a unique ID, a string that acts like a fingerprint so you can keep track of it. This ID is automatically generated, meaning you don't have to worry about creating one yourself.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a plan for a trade. It holds all the key details needed to execute a position, like whether to buy ("long") or sell ("short"). Each signal gets a unique ID automatically assigned.

You'll specify the entry price, your target take profit price (where you want to sell for a gain), and a stop-loss price (where you want to exit to limit losses). The take profit must be higher than the entry price for long positions and lower for short positions, and the stop loss is the opposite.

The `minuteEstimatedTime` property lets you set a time limit for the signal; if not set, it defaults to a global setting. You can also set it to `Infinity` for no time limit. Lastly, you include the cost of executing this trade.

## Interface ISessionInstance

The Session Instance acts like a temporary, dedicated storage space for your trading strategies. Think of it as a place to keep information that's specific to a particular combination of symbol, strategy, exchange, and timeframe – essentially, each unique trading scenario. This allows you to store and share data between different parts of your strategy, like caching results from AI models or keeping track of indicator values across multiple candles.

It's designed to be mutable, meaning the information stored can change.  You can write new data using `setData`, retrieve existing data using `getData`, and the `getData` function helps prevent accidentally looking into the future by only returning data available up to the requested time. When you’re done with the session data, `dispose` cleans up any resources used. It's used by different storage options (local, persistent, dummy) to provide this shared storage area.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that's not immediately executed. Think of it as a signal that's waiting for a specific price to be hit before an order is placed.

It builds upon the basic signal representation, adding the concept of a "priceOpen" – the price at which the signal activates. 

When the market price reaches "priceOpen," this scheduled signal transforms into a standard, pending signal. 

Initially, a timestamp "scheduledAt" indicates when the signal was created, but after activation, it's updated to "pendingAt," reflecting the actual time it's waiting to be triggered. The key detail is the `priceOpen`, which dictates when the signal becomes active.

## Interface IScheduledSignalCancelRow

This interface defines a row of data for scheduled signals, with a specific focus on cancellations that were requested by a user. It builds upon a base signal row by adding information about the cancellation itself. If a signal cancellation was initiated by a user, this record includes a unique `cancelId` to identify the cancellation and a `cancelNote` to explain why the cancellation occurred. This allows for tracking and understanding user-driven changes to scheduled signals.

## Interface IRunContext

The `IRunContext` acts as a central hub of information when running code within the backtest-kit framework. Think of it as a package containing everything a function needs to know about its environment.

It merges two key pieces of data: details about the trading strategy and exchange, along with real-time information like the symbol being traded and the current time.

Essentially, when a function needs to execute within the framework, it receives this single `IRunContext` object, which then gets intelligently broken down and delivered to the appropriate services to handle their specific responsibilities.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess risk during the backtesting process. It combines the arguments provided for the risk check with details about your portfolio's current state. Specifically, it includes the latest trading signal being evaluated, represented by `currentSignal`. You'll also find the total number of open positions (`activePositionCount`) and a complete list of those open positions (`activePositions`). This allows risk validation functions to react to and consider the portfolio’s current holdings and signal when making decisions.

## Interface IRiskValidationFn

This function is your gatekeeper for ensuring trades meet certain risk criteria. Think of it as a custom check you apply before a trade is executed. If everything looks good – the trade aligns with your risk rules – the function simply lets it through, returning nothing. However, if something is amiss, like exceeding a maximum position size or violating a diversification rule, it signals a rejection. It can do this by returning a specific rejection object that explains why the trade was blocked, or by raising an error which will be handled and converted to a rejection reason.

## Interface IRiskValidation

This interface helps you define rules to make sure your risk assessments are accurate and reliable. Think of it as setting up checkpoints to double-check your work. 

You specify a `validate` function, which is the core of the rule – it's the logic that actually performs the validation.  Alongside that, you can add a `note` to explain what the validation does; this is really useful for keeping track of why you have the rule in place and for others to understand your system. It's all about ensuring transparency and clarity in your risk management process.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, is designed to hold important information used internally for managing risk during trading. It builds upon the existing SignalDto, adding details crucial for validation processes. Specifically, it includes the entry price of a trade (priceOpen) as well as the initially set stop-loss and take-profit levels (originalPriceStopLoss and originalPriceTakeProfit). This allows for a clear understanding of the trade's original parameters when assessing risk.

## Interface IRiskSchema

This defines a blueprint for how to build risk controls that apply to your entire portfolio, not just individual trades. Think of it as setting up guardrails for your trading strategy.

Each risk schema has a unique identifier, and you can add a note to explain what the risk control does.

You can also include optional callbacks to run code when a trade is initially rejected or ultimately approved, giving you more granular control.

The heart of the risk schema lies in its validations – this is where you define the custom rules and checks that will be applied to ensure your portfolio stays within acceptable risk parameters. These validations can be functions or predefined validation objects.


## Interface IRiskRejectionResult

This object represents the result when a risk validation check fails. It gives you details about why the validation didn't pass, which helps in debugging and understanding the issue. Each rejection has a unique ID so you can track it specifically, and a human-readable note explains the reason for the failure in a way that’s easy to understand.


## Interface IRiskParams

The `IRiskParams` object is how you configure the risk management system. It provides essential information like the exchange you're trading on, a logging mechanism for debugging, and a way to handle time accurately, which is especially important in backtesting to avoid issues like looking into the future. 

You also use this object to define what happens when a trading signal is blocked because it exceeds risk limits; the `onRejected` callback lets you react to these situations and potentially broadcast that information. Essentially, it's the blueprint for how the risk management part of the system operates.


## Interface IRiskCheckOptions

This setting, `reserve`, controls how the framework handles risk checks when multiple things are happening at once.  When `reserve` is set to `true`, the framework makes a special, protected entry for your position before the actual trade happens. This prevents conflicts and ensures that all parts of your system see the same, updated information about your position size, even if several checks are running simultaneously. Essentially, it provides a safety net for more complex trading strategies.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to perform a risk check before a trading signal is executed. Think of it as a set of data passed to a function that determines whether opening a new trade is safe and permissible based on current market conditions and strategy rules. 

It bundles key details like the trading symbol, the signal being considered, the strategy's name, and the exchange it's using. You'll also find the current price and timestamp for reference. This is all about ensuring your trading strategy operates within predefined risk parameters.

## Interface IRiskCallbacks

The `IRiskCallbacks` interface allows you to define functions that your backtest or trading system can use to respond to risk-related events. You can specify a function to be called when a trading signal is blocked because it exceeds defined risk limits - this is handled by `onRejected`. Alternatively, if a signal passes all risk checks, your `onAllowed` function will be triggered. These callbacks give you flexibility to react to risk evaluations in real-time, like logging events or adjusting trading strategies.

## Interface IRiskActivePosition

This interface describes an active trading position that a risk management system is tracking. It holds all the crucial details about a trade, including which strategy initiated it, the exchange used, the timeframe involved, and the specific symbol being traded. You'll find information about the direction of the trade (long or short), the entry price, and any associated stop-loss or take-profit levels.  It also includes an estimated duration and a timestamp to record when the position was first opened. Essentially, it provides a complete snapshot of a single, ongoing trade.

## Interface IRisk

The `IRisk` interface is all about keeping your trading strategy safe and within predefined risk boundaries. It allows you to check if a trade should even be placed based on your risk settings.

The `checkSignal` function lets you verify that a potential trade aligns with your risk limits.  There's also a more advanced version, `checkSignalAndReserve`, designed for situations with multiple strategies trading simultaneously. This function ensures that a trade isn't approved until a placeholder for the position is secured, preventing over-trading. Think of it as a 'reserve a spot' before committing to a trade.

Once a trade is approved and tentatively reserved, `addSignal` officially registers the position, while `removeSignal` clears out a position when it’s closed, guaranteeing that your risk calculations always stay accurate.  It's important to always follow up on a successful `checkSignalAndReserve` with either `addSignal` or `removeSignal` to keep things clean and avoid incorrect risk assessments.

## Interface IReportTarget

This interface lets you fine-tune what kinds of events your backtest kit generates reports for. You can control whether to log information about strategy actions, risk rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading activity, backtest signal closures, synchronization of signals, highest profit milestones, or maximum drawdown events. Each property corresponds to a specific type of report, and setting it to `true` activates that report. Essentially, you choose what detailed information you want to collect during your backtesting process.

## Interface IReportDumpOptions

This interface lets you control what data gets written out in your backtest reports. Think of it as a way to tag specific events during a backtest so you can easily find and analyze them later. Each property represents a piece of information – like the trading pair (symbol), the name of the strategy being used, the exchange involved, the timeframe being used, or a unique ID for a particular signal. By providing values for these properties, you're essentially labeling your data for organized reporting and searching.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It provides a way to record when a signal is generated and retrieve it later.

The `handleActivePing` method is used to store new signal data when it becomes available. 

`getLatestSignal` allows you to fetch the most recent signal for a specific trading setup – think of it as looking up the last known instruction for a particular symbol and strategy. A crucial safety check is built-in: it prevents you from accessing signals from the future, avoiding look-ahead bias.

Finally, `getMinutesSinceLatestSignalCreated` tells you how long ago the most recent signal was generated, which can be helpful for understanding how frequently signals are being produced.


## Interface IPublicSignalRow

The `IPublicSignalRow` interface represents a signal's data as seen by users, providing extra clarity around how the trade has evolved. It builds upon the standard signal information by including the original stop-loss and take-profit prices that were initially set. This is especially helpful if you're using trailing stop-loss or take-profit strategies, because it lets you see both the initial targets and the currently adjusted ones.

Here's what the information within `IPublicSignalRow` tells you:

*   **cost:** The initial cost of getting into the position.
*   **originalPriceStopLoss:** The original stop-loss price you set when the signal was created.
*   **originalPriceTakeProfit:** The original take-profit price you set when the signal was created.
*   **partialExecuted:**  The percentage of the position that has already been closed out through partial closing orders.
*   **totalEntries:** How many times you’ve added to the position (1 means a single, initial entry; more than 1 means averaging).
*   **totalPartials:** How many times you've taken partial profits or losses.
*   **originalPriceOpen:** The initial price when you entered the trade.
*   **pnl:**  The current, unrealized profit or loss on the trade.
*   **peakProfit:** The highest profit the trade has reached so far.
*   **maxDrawdown:** The largest loss the trade has experienced from a peak profit.

## Interface IPublicCandleData

This interface defines the basic structure of a candle data point used within the backtest-kit framework. Each candle represents a specific time interval and contains key price information. 

You’ll find the exact time the candle began, along with the opening price for that period. It also provides the highest and lowest prices reached during that time, and the final closing price. Lastly, the total trading volume during that candle’s period is included.

## Interface IPositionSizeKellyParams

This interface defines the settings you'll use to determine how much of your capital to risk on each trade when using the Kelly Criterion for position sizing. 

It essentially boils down to two key pieces of information: your win rate—the percentage of trades that are winners—and your win/loss ratio—how much you typically win compared to how much you lose on each trade. 

These values help the system calculate a recommended position size that balances potential growth with the risk of losing capital.

## Interface IPositionSizeFixedPercentageParams

This defines how to set up a trading strategy where the position size is determined by a fixed percentage of your available capital. 

You’ll need to specify a stop-loss price, which represents the price at which you'll exit a trade to limit potential losses. This value is crucial for managing risk when using a percentage-based sizing approach.

## Interface IPositionSizeATRParams

This defines the parameters needed to calculate your position size using the Average True Range (ATR) method.  Specifically, you'll provide the current ATR value. This value helps determine how much capital to allocate to a trade, based on market volatility. Think of it as a key ingredient for sizing your trades when you're using ATR as a guide.

## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA). Think of it as setting safety margins around your DCA levels.

`upperPercent` tells you how much higher than each DCA level is considered an overlap. For example, if it's set to 5%, anything 5% above a DCA level will be flagged.

`lowerPercent` does the same for below the DCA level – it dictates how far below a level you'll consider it an overlap. This helps you fine-tune how sensitive the overlap detection is.

## Interface IPersistStorageInstance

This interface lets you customize how trading signals are saved and loaded, specifically for either backtesting or live trading environments. Think of it as a way to replace the default file-based storage with something else, like a database or in-memory solution. 

When you implement this interface, you’ll have a few key responsibilities:

*   First, you’ll initialize the storage when needed.
*   Then, you'll read all the saved signals—they're organized by a unique ID for each signal.
*   Finally, you'll be able to write new signals or update existing ones, again using their IDs to keep things organized.

Essentially, it's your gateway to controlling how your trading signals are persistently stored and retrieved.

## Interface IPersistStateInstance

This interface helps you manage how your trading strategy's data is saved and loaded, especially in situations where things might go wrong unexpectedly. Think of it as a way to make sure your strategy remembers where it left off, even if the program crashes.

It’s designed to be specific to a particular combination of data source and storage location, ensuring that each piece of information is handled correctly. 

If you want more control over how your strategy's information is stored, you can build your own adapter that implements this interface. The methods define how to initialize storage, read previously saved data, write new data, and clean up when you're done. The `waitForInit` method sets up the storage. `readStateData` retrieves the saved information. `writeStateData` saves new information, marking the date/time it was last updated. Finally, `dispose` releases any resources the adapter might be holding.

## Interface IPersistSignalInstance

This interface defines how your custom code can handle saving and loading trading signals for a specific combination of symbol, strategy, and exchange. Think of it as a way to control where and how signal data is stored, moving beyond the default file-based approach.

If you want to build your own persistence mechanism – perhaps storing signals in a database or a different kind of file – you’ll need to create a class that implements these methods.

The `waitForInit` method lets you prepare the storage area when things start up. `readSignalData` retrieves the saved signal data, and `writeSignalData` allows you to save the current signal information.  You can even clear out existing data by passing `null` to `writeSignalData`.


## Interface IPersistSessionInstance

This interface helps manage how session data is saved and loaded for a specific trading setup – think of it as a way to remember things like your settings or progress. It ensures your session information survives unexpected interruptions, preventing data loss.

You can customize this interface to use different storage methods beyond the default file storage.

Here's a breakdown of what it does:

*   `waitForInit`: Sets up the storage area specifically for your trading session.
*   `readSessionData`: Retrieves any previously saved data for your session.
*   `writeSessionData`: Saves your current session's information.
*   `dispose`: Cleans up any resources used by the session storage, though it might not always do anything in its default form.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit stores scheduled signals for a specific trading setup. Think of it as a way to manage the data that tells your strategy when to execute trades. Each scheduled signal is tied to a unique combination of symbol, strategy name, and exchange.

If you want to store this information somewhere other than the default file system (like a database), you can create a custom adapter that implements this interface.

The `waitForInit` method is used to set up the storage when everything is ready. `readScheduleData` retrieves the previously saved signal, and `writeScheduleData` saves a new signal – or clears the existing one by passing `null`.


## Interface IPersistRiskInstance

This interface defines how a component can manage and store risk-related data specifically for a particular trading context, identified by a combination of risk name and exchange name. Think of it as a way to customize how your backtesting system remembers the risk profile of a trading strategy.

If you want to change the default way your data is saved (perhaps to a database instead of a file), you can build a custom adapter that implements this interface.

The `waitForInit` method allows you to set up the storage area for this specific risk context, ensuring everything is ready. `readPositionData` retrieves the previously saved data for a particular point in time.  And finally, `writePositionData` is used to save the current risk data for the context at a given timestamp.

## Interface IPersistRecentInstance

This interface defines how to store and retrieve the most recent signal for a particular trading setup. Think of it as a way to remember what signal was active last time, but specifically for a combination of a symbol, strategy, exchange, and timeframe.

It lets you customize how this information is saved, instead of relying on a default file-based method.

The `waitForInit` method prepares the storage for a new signal.

`readRecentData` fetches that most recent signal, giving you access to the last known activity.

And `writeRecentData` saves the current signal, so it's available next time, along with a timestamp to indicate when it was recorded.

## Interface IPersistPartialInstance

This interface lets you manage how trading data, specifically partial profit and loss information, is saved and loaded for a particular trading setup. Think of it as a way to customize where and how your progress is stored—perhaps you want it in a database instead of a file.

It's designed to be unique to each combination of asset (symbol), the trading plan you’re using (strategyName), and the trading platform (exchangeName).

Each trade’s partial data is kept separate, identified by a unique signal ID, so you can track the details of each trade individually.

To use this, you'd create your own system that implements this interface, providing your own logic for reading and writing this data. The `waitForInit` method sets up the storage initially. `readPartialData` retrieves existing data, and `writePartialData` saves new data.

## Interface IPersistNotificationInstance

This interface defines how backtest-kit manages and stores notifications, those little updates and alerts that happen during a trading simulation or live trading. It allows you to customize where and how these notifications are saved, moving beyond the default file-based approach. 

Think of it as a way to control the long-term memory for your notifications. 

The `waitForInit` method prepares the storage area, essentially getting everything ready to go at the beginning of a backtest or live trading session. `readNotificationData` retrieves all the previously saved notifications, allowing you to load up the history. Finally, `writeNotificationData` is responsible for saving new notifications, associating each one with a unique identifier to keep things organized.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts within the backtest-kit framework. Think of it as a way to persist memory entries—pieces of information—tied to a particular signal and a named bucket. 

It allows for a "soft delete" functionality, where items can be flagged as removed but remain on disk, just not visible in normal operations. 

If you need to customize how memory data is stored (perhaps using a database instead of files), you can create an adapter that implements this interface.

The methods available include initializing storage, reading entries by ID, checking for existence, writing data, removing (soft-deleting) data, listing all available entries, and releasing any resources the storage might be using. It's useful for managing and interacting with memory data within the backtest-kit environment.


## Interface IPersistMeasureInstance

This interface defines how a system can persistently store and retrieve data related to measure instances, like results from API calls. It's designed to be used when you want to cache data and keep it around even when your application restarts.

To handle caching in a custom way, you can create your own adapter that implements this interface.

The adapter can initialize storage, retrieve data based on a key, save new data with a timestamp, softly delete data (marking it for removal without actually deleting the file), and list all available data keys. Importantly, the 'soft delete' feature means data isn't completely removed from disk, allowing for potential recovery or analysis of older data.


## Interface IPersistLogInstance

This interface defines how your application can manage and store log data persistently, essentially providing a way to save trading logs so they aren't lost when the application restarts. It acts as a central place for all log entries within a process.

Think of it as a way to customize how your logs are saved – instead of just writing them to a file, you could save them to a database or another storage system.

The `waitForInit` method lets you signal when the log storage is ready to be used.  `readLogData` retrieves all the currently stored log information, while `writeLogData` handles adding new log entries to the storage, ensuring that existing entries aren't overwritten and the log grows chronologically.

## Interface IPersistIntervalInstance

This interface defines how your custom code interacts with the backtest-kit framework to manage markers representing when an interval has already been processed for a specific data bucket. Think of it as a way to keep track of what's been done, so the system doesn’t repeat actions unnecessarily.

If you want to store this "fired" status in a way that isn't the default file-based method, you can create an adapter that implements this interface.

The `waitForInit` method allows you to set up the storage for each bucket at the beginning.

`readIntervalData` retrieves the existing data for a specific key.

`writeIntervalData` is used to record that an interval has been processed.  You'll specify the data, key, and the timestamp of the event.

`removeIntervalData` provides a way to temporarily "forget" an interval marker.  This is how you can trigger the system to re-run the interval processing for that key.  It’s like a soft delete – the record is gone for the time being, but the system knows it can fire again.

`listIntervalData` allows you to get a list of all the keys for which interval markers exist and haven't been soft-deleted.


## Interface IPersistCandleInstance

This interface defines how your application can store and retrieve historical candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to save and load candle data so you don't have to constantly pull it from external sources.

The `waitForInit` method lets you prepare the storage space for your candle data, setting things up for later use.

The `readCandlesData` method fetches a range of candles based on timestamps. If any of the candles within that range aren’t found in the storage, it returns `null`, signaling that a fresh request from the exchange is needed.

Finally, `writeCandlesData` allows you to save newly retrieved candles to the persistent storage. You can choose to ignore incomplete or duplicate data during writing, which ensures data integrity.

## Interface IPersistBreakevenInstance

This interface helps manage and save information about when a trade reaches its break-even point. It’s designed to work specifically for one trading setup – a combination of a particular asset, a chosen strategy, and a specific exchange.

Think of it as a place to store records, keyed by a unique identifier for each trading signal, detailing when it reached its break-even. 

If you want to customize how this information is saved (perhaps not to a file), you can build your own adapter that implements this interface.

The `waitForInit` method simply lets the system know when it’s ready to start storing this data. 

`readBreakevenData` retrieves the previously saved break-even data for a signal at a given point in time.

`writeBreakevenData` saves the new break-even data for a signal.

## Interface IPersistBase

This interface outlines the basic operations needed for any system that wants to store and retrieve data persistently, like saving trading results or configuration. 

Think of it as a contract: if you're building something that handles data storage, you’ll need to implement these methods.

The methods include initializing the storage, reading an entity by its ID, checking if an entity exists, writing an entity to storage reliably, and getting a list of all the entity IDs currently stored. 

These methods are designed to work together to provide a simple and consistent way to manage persistent data. The keys function is particularly important for making sure your data is consistent and organized.


## Interface IPartialProfitCommitRow

This interface describes a single instruction to take a partial profit during a backtest. Think of it as one step in a plan to gradually reduce your position size. Each instruction specifies the percentage of the position you want to close (percentToClose) and the price at which that partial trade actually happened (currentPrice). The action property simply identifies this as a partial profit action.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, essentially telling the system to sell a portion of what you hold.

It includes the action being performed, which is a "partial-loss."

You'll also specify the percentage of the position you want to close, and the price at which that partial closure happened. This data helps track and understand the details of each partial position closure.


## Interface IPartialData

This data structure holds a snapshot of key information about a trading signal, designed to be easily saved and restored. It's used to preserve progress, particularly the profit and loss levels that have been hit. Think of it as a simplified version of the full trading state.

Specifically, it contains two arrays: `profitLevels` and `lossLevels`. These arrays represent the levels at which profits and losses have been achieved, acting as a record of the signal’s performance. These arrays are created from sets during saving and will be converted back to sets upon loading.

## Interface IPartial

The `IPartial` interface manages how profit and loss milestones are tracked for trading signals. It’s used by components like `ClientPartial` and `PartialConnectionService`.

Whenever a trading signal makes a profit or loss, the `profit` and `loss` methods are used to determine if any new profit/loss levels (like 10%, 20%, 30%) have been achieved. This avoids repeatedly announcing the same milestone.

When a trading signal finishes – whether it hits a target, a stop-loss, or simply runs out of time – the `clear` method is called to clean up the tracking data and ensure everything is saved correctly. It’s responsible for removing old data and managing related system resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered when your command-line arguments are processed. It essentially combines your original input with extra flags that tell the system how to run – whether it should simulate historical data (backtest), trade with simulated funds (paper), or execute real trades (live).  The `backtest`, `paper`, and `live` properties are boolean values that clearly indicate the chosen trading mode.

## Interface IParseArgsParams

This interface describes the settings you can provide to help parse command-line arguments for your backtesting. Think of it as a blueprint for defining the basic information needed to run a backtest. You'll specify things like the trading pair you're interested in ("BTCUSDT" for example), the name of the trading strategy you want to use, which exchange your data comes from (like Binance or Bybit), and the timeframe of the data (such as 1-hour candles). These properties allow the system to understand exactly what you want to backtest.


## Interface IOrderBookData

This interface defines the structure of order book data, which represents the bids and asks for a particular trading pair. It contains the `symbol` of the trading pair, like "BTCUSDT".  You'll also find arrays of `bids` – orders to buy – and `asks` – orders to sell – each bid and ask containing information like price and quantity. This data lets you see the current market depth and potential price movements.

## Interface INotificationUtils

This interface defines the core functionality for any system that wants to send out notifications about your trading strategies. Think of it as a contract that adapters must follow to communicate important events, like when a trade opens, closes, or hits a profit or loss target.

It includes methods for handling various signals and events – from simple trade signals to notifications about partial profits, losses, and even when things go wrong, like errors or rejections.  You'll find methods to retrieve and clear a history of these notifications, providing a log of everything that has happened.  Essentially, it provides a standardized way to receive updates and alerts related to your backtesting and live trading.

## Interface INotificationTarget

The `INotificationTarget` interface lets you fine-tune which notifications your backtest or live trading session generates. Think of it as a filter – you only receive the updates you specifically need, rather than everything.

If you don’t provide this interface, you’ll get all notifications by default.

Here's a breakdown of what each property controls:

*   **signal:** Keeps you informed about the lifecycle of trading signals, including when they are created, scheduled, closed, or canceled.
*   **partial_profit:** Notifies you when the price reaches a partial profit level, helping you monitor progress before a final decision.
*   **partial_loss:**  Similar to partial profit, but alerts you when a partial loss level is hit.
*   **breakeven:** Informs you when the price reaches the breakeven point.
*   **strategy_commit:** Confirms that actions like taking partial profits, stopping losses, or activating schedules have been executed.
*   **signal_sync:** Provides updates when trading signals are synchronized with the live exchange, like when orders are filled or positions are closed.
*   **risk:** Alerts you if the risk manager blocks a trading signal.
*   **info:** Provides manual or strategy-generated messages associated with a signal.
*   **common_error:** Flags non-critical errors that are handled during the process.
*   **critical_error:** Signals severe, unrecoverable errors that halt the entire backtest or live session.
*   **validation_error:** Identifies issues with your strategy configuration or input data.


## Interface IMethodContext

The `IMethodContext` object is a crucial piece of the backtest-kit framework, acting as a shared understanding of the environment for different parts of your backtesting process. Think of it as a little envelope that travels along, carrying the names of the exchange, strategy, and frame you're currently working with. This ensures that the right strategy logic, exchange connection, and data frame are used at each step. When backtesting historical data, it specifies which frame to use; however, in live trading mode, the frame name is intentionally empty.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems should work, whether they’re saving data locally, permanently, or just for testing.

It provides a standard way to interact with memory, ensuring consistency across various implementations.

You can use `waitForInit` to make sure the memory system is ready before starting.

`writeMemory` lets you store data, including the data itself, a description, and a timestamp.

`searchMemory` helps you find data using keywords, ranking results based on relevance and ensuring only past data is returned.

`listMemory` allows you to view all stored entries up to a specific point in time.

`removeMemory` is used to delete individual entries by their ID and timestamp.

`readMemory` retrieves a specific entry based on its ID and timestamp, but won't return anything if it's too recent.

Finally, `dispose` lets you clean up any resources used by the memory system when you're finished with it.

## Interface IMarkdownTarget

This interface lets you fine-tune the reports generated by the backtest kit. You can selectively activate different reporting services to focus on specific areas of interest. 

For example, you might want to turn on strategy reports to examine the entry and exit signals, or risk reports to see when trades were blocked by risk management. 

You can also enable reports for things like breakeven events, partial profits, portfolio heatmaps, strategy optimization, scheduling, live trading, detailed backtest results, signal synchronization, or tracking milestones like highest profit and maximum drawdown. This gives you a lot of control over the level of detail in your analysis.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown reports within the backtest-kit framework. Think of it as a way to specify exactly what data to include in those reports. You can use it to control the location, filename, and specific details like the trading pair, strategy, exchange, timeframe, and signal identifier that are relevant to the report you're creating. Each property allows you to pinpoint the exact slice of information you want to see documented.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's a central point for recording events and important details throughout the system.

You can use it to leave messages at different levels of importance – from general notes (`log`), to very specific debugging information (`debug`), to informative updates (`info`), and finally to flag potential issues that aren't critical errors (`warn`). 

These logs help track the flow of your backtests, diagnose problems, and monitor overall system health. They're used by agents, sessions, and many other components to provide a complete picture of what’s happening.


## Interface ILogEntry

This interface represents a single entry in your backtest’s log history. Each log entry has a unique identifier, a level indicating its severity (like "log", "debug", "info", or "warn"), and a timestamp. 

It also includes helpful information like the creation date and a Unix timestamp for better organization and potential rotation of logs.  To provide even more context, you can associate a method context, execution context, a topic (often the name of the method generating the log), and any additional arguments passed with the log call. This detailed information helps you understand exactly what happened during the backtest and why.

## Interface ILog

The `ILog` interface helps you keep track of what happened during your backtesting or trading simulations. It's like a detailed record of events.

It provides a way to retrieve a complete list of log entries, allowing you to review the sequence of actions and decisions made. This can be super helpful for debugging, analyzing performance, or simply understanding how your strategies played out.

## Interface IHeatmapRow

This interface describes a row in a heatmap displaying portfolio performance for a specific trading pair, like BTCUSDT. It gathers key statistics across all strategies used for that pair.

You'll find information about overall profitability (totalPnl), risk-adjusted returns (sharpeRatio), and potential losses (maxDrawdown). It also breaks down trade performance, detailing the number of wins and losses, win rate, and average profits and losses per trade.

Further metrics show the consistency of returns (stdDev), profitability relative to risk (profitFactor, sortinoRatio, calmarRatio), and how well the strategy recovers from losses (recoveryFactor).  Finally, you can see how long winning and losing streaks lasted (maxWinStreak, maxLossStreak) and how peak and fall PNL values average out.


## Interface IFrameSchema

This defines a reusable building block for backtesting, acting like a template for how data is organized and processed. Think of it as a way to set the stage for your backtest, specifying the time period and frequency of data you'll be working with. 

Each frame has a unique name to identify it, and a place for developer notes to explain its purpose. Crucially, you define the starting and ending dates, and the interval (like daily, hourly, or minute-by-minute) at which data will be generated within that period. You can also add optional callback functions to control specific steps within the frame’s lifecycle.

## Interface IFrameParams

The `IFrameParams` object holds the settings needed when setting up a ClientFrame, which is a core component for running trading strategies. It builds upon the `IFrameschema` definition, and importantly includes a `logger` property.  This logger allows you to see what's happening behind the scenes during your backtesting or live trading, which is invaluable for debugging and understanding strategy behavior. You'll provide this logger when creating a ClientFrame to control the level and destination of debugging information.

## Interface IFrameCallbacks

This lets you react when the timeframe data is created. 

You can use this to check the timeframes that were generated, log them for review, or perform any other actions you need when the timeframe data is ready. The timeframe data includes the dates, the start and end dates of the data, and the interval used to create the timeframes.

## Interface IFrame

The `IFrames` interface is a core component that handles the creation of timeframes used for backtesting. Think of it as the engine that determines *when* your trading strategy will be evaluated.

It defines a method, `getTimeframe`, which you can use to retrieve a list of specific timestamps.  These timestamps will dictate the sequence of steps your backtest will take, ensuring that trades are simulated at appropriate intervals for the asset you’re analyzing.  Essentially, it helps break down your historical data into manageable chunks for testing.


## Interface IExecutionContext

The `IExecutionContext` object is like a little package of information that's passed around during trading simulations or live trades. It holds essential details that your trading strategies and exchanges need to work correctly.

Think of it as a shared understanding of the current situation.

It tells your strategy what trading pair is involved, represented by the `symbol` property (like "BTCUSDT").  It also provides the current timestamp, `when`, so everything happens in the right order of time. Lastly, it indicates whether the execution is part of a backtest (a historical simulation) or a live trade.

## Interface IExchangeSchema

The IExchangeSchema defines how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint for connecting to and retrieving data from an exchange.

You'll need to provide a unique identifier for the exchange.

It also allows for optional notes to help developers understand the exchange's configuration.

Crucially, you must define a function, `getCandles`, which retrieves historical price data (candles) for a given trading pair, time range, and interval.

The `formatQuantity` and `formatPrice` functions are optional; if you don't provide them, the system will use default formatting based on Bitcoin's precision rules on Binance. These functions are useful for tailoring the output to match the specific rules of the exchange.

Furthermore, you can optionally provide functions to fetch order book data (`getOrderBook`) and aggregated trades (`getAggregatedTrades`). If these aren’t implemented, attempting to use them will result in an error.

Finally, `callbacks` allows you to register functions that respond to certain events, like receiving candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the configuration needed to connect to and interact with an exchange within the backtest-kit framework. Think of it as providing the essential building blocks for the exchange’s functionality.

It requires you to supply key methods for retrieving data like historical candles, order books, and aggregated trades, as well as formatting quantities and prices according to the exchange’s specific rules.  A logging service is also needed for debugging. 

Importantly, the `execution` context provides information like the trading symbol, timestamp, and whether the process is running in backtest mode.  While default implementations are available, providing your own tailored methods within this interface is crucial for accurate and realistic backtesting results.  All listed methods are mandatory for a functional integration.

## Interface IExchangeCallbacks

This lets you react when new candlestick data becomes available for a specific trading symbol and timeframe. You'll receive the symbol, the interval (like 1 minute, 1 hour, daily), the timestamp of the oldest data, the number of candles requested, and an array containing the actual candle data.  You can use this to update charts, trigger alerts, or perform other actions based on the incoming candlestick information. The callback can be a function or a promise resolving to void.


## Interface IExchange

This interface defines how to interact with a cryptocurrency exchange within the backtest environment. It provides methods for retrieving historical and future candle data – essentially, the price charts – for a particular trading pair.

You can request past price data, simulate fetching future prices for backtesting purposes, and format trade quantities and prices to match the exchange's specific requirements. The system also helps you calculate the VWAP (Volume Weighted Average Price) based on recent trading activity, giving you an indication of the average price paid during a period.

The `getRawCandles` method is particularly flexible, allowing you to specify start and end dates, or just a number of candles to retrieve, always keeping in mind the current backtesting timeframe to avoid looking into the future. It ensures data consistency and prevents potential inaccuracies in your simulated trades.


## Interface IEntity

This interface, `IEntity`, serves as the foundation for all objects that are stored persistently within the backtest-kit framework. Think of it as a common starting point, ensuring that any data you save or load has a consistent structure. It establishes a basic contract that all other entity types will adhere to, promoting a more organized and predictable data model. It's the bedrock upon which your persistent data objects are built.


## Interface IDumpInstance

This interface defines how a component can save data related to a backtest run. Think of it as a way to export information from the backtest, like detailed message histories, key-value data, or tables of results. Each instance is linked to a specific signal and bucket during creation. 

The interface provides several methods for different data types:

*   `dumpAgentAnswer`: Saves the complete conversation history for a specific agent interaction.
*   `dumpRecord`: Saves simple key-value pairs.
*   `dumpTable`:  Saves data formatted as a table, automatically figuring out the column headers.
*   `dumpText`: Saves plain text or markdown.
*   `dumpError`: Records details about an error that occurred.
*   `dumpJson`: Stores complex data as a JSON formatted block.
*   `dispose`: Cleans up any resources the component might be using. 

All these methods receive the actual data to be saved and a unique identifier (`dumpId`) along with a brief description for context.

## Interface IDumpContext

The `IDumpContext` helps keep track of where your data is coming from. Think of it as a label attached to each piece of information you're saving. 

It includes details like the `signalId` which tells you which trade the data relates to, the `bucketName` that groups data by strategy or agent, and a unique `dumpId` to identify individual entries. A `description` allows you to add a human-readable explanation, which is useful for searching and understanding the data later. Finally, the `backtest` flag indicates whether the data comes from a backtesting simulation or live trading.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, provides a foundational structure for handling queued updates during trading. Think of it as the blueprint for events that need to be processed later, like order confirmations or trade recordings. It ensures these updates are handled correctly within the trading environment.

Each event includes the `symbol`, representing the trading pair involved (e.g., BTC-USDT), and a `backtest` flag indicating whether the operation is occurring within a simulated testing environment.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your saved candlestick data. It’s used to verify that your data is consistent and accurate.

You’ll need to provide the trading symbol (like "BTCUSDT"), the name of the exchange you're using, and the timeframe of the candles (like "1m" for one-minute candles).  You also need to specify the start and end dates for the validation period.

Finally, you can tell the system where your candle data files are stored; if you don’t, it will look in the default location "./dump/data/candle".

## Interface ICandleData

This interface defines a single candlestick, which is a common way to represent price data over a specific timeframe. Each candlestick holds information about the opening price, the highest price reached, the lowest price reached, the closing price, and the total trading volume during that time. The `timestamp` tells you exactly when that particular candle's time period began. This data structure is essential for building trading strategies and analyzing historical price movements.

## Interface ICacheCandlesParams

This interface defines the information needed to prepare your trading data in advance. It specifies the asset you're trading (like BTCUSDT), which exchange you're using, the timeframe of the candles (like 1-minute or 4-hour), and the exact start and end dates for which you want to download and store the historical data. Think of it as a blueprint for retrieving a chunk of historical price data to get ready for a backtest.

## Interface IBroker

The `IBroker` interface defines how backtest-kit connects to a real-world brokerage or exchange. It’s essentially a contract you implement to translate the framework’s actions into actual trades. Think of it as the bridge between the simulated trading environment and the live market.

This interface ensures that actions like opening, closing, or adjusting positions are executed through your broker connection. Importantly, any errors during these actions won’t corrupt the simulated state; the framework will revert, keeping your backtest data clean.

During backtesting, the `IBroker` methods are ignored—they won’t be called—so you only need to implement them when you're ready to trade live. Here’s a breakdown of the methods you’ll need to handle:

*   `waitForInit`: This is your initialization point; it's called once to establish the connection, load credentials, or perform any setup needed for live trading.

*   `onSignalCloseCommit`: Called when a trading signal is closed, whether that's due to a take-profit, stop-loss, or manual intervention.

*   `onSignalOpenCommit`: Notifies you when a new position has been successfully opened.

*   `onPartialProfitCommit`, `onPartialLossCommit`:  These methods handle partial profit or loss adjustments.

*   `onTrailingStopCommit`, `onTrailingTakeCommit`: Used for managing trailing stops and trailing take-profit levels.

*   `onBreakevenCommit`:  Handles updates to breakeven stops.

*   `onAverageBuyCommit`:  Called when a DCA (Dollar-Cost Averaging) order is placed.

## Interface IBreakevenData

This interface, `IBreakevenData`, helps store information about whether a trading strategy has reached its breakeven point. Think of it as a simple snapshot of the breakeven status.

It's designed to be easily saved and loaded, particularly when dealing with JSON data, by only containing a `reached` flag. This flag is a direct representation of the `reached` property within a more complex `IBreakevenState`.

The framework uses this data to persist breakeven information, keeping track of which signals have already hit their breakeven target.

## Interface IBreakevenCommitRow

This object represents a single event related to breakeven calculations during a backtest. 

It indicates that a breakeven commitment has been made, essentially marking a point where a trade's profitability is being reassessed.

The `action` property confirms the type of action occurring—in this case, a breakeven adjustment.

The `currentPrice` provides the price at which this breakeven calculation was triggered, offering context for the change.

## Interface IBreakeven

The `IBreakeven` interface helps manage a trading strategy’s breakeven point—the price where the trade no longer carries risk. It's used by systems that automatically adjust stop-loss orders to the entry price once certain conditions are met.

Essentially, it keeps track of when a trade has become profitable enough to move the stop-loss to the original purchase price. 

The `check` method determines if the price has moved favorably enough to allow this breakeven adjustment, considering transaction costs, and then triggers a notification and updates the system’s records. The `clear` method resets the breakeven state when a trade is closed, cleaning up the system and persisting the changes.

## Interface IBidData

This interface represents a single bid or ask price point within an order book. It contains two essential pieces of information: the price at which the order is placed, and the quantity of orders at that price. Both price and quantity are stored as strings, which allows for the representation of fractional values commonly found in trading.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as dollar-cost averaging or DCA) strategy. It describes a specific purchase made as part of the DCA process.

Each `IAverageBuyCommitRow` contains information about a purchase, including the current market price at the time of the buy, the cost in US dollars, and the total number of entries that will exist in the strategy after this purchase. It's essentially a record of one transaction within a larger DCA plan.

## Interface IAggregatedTradeData

This object holds information about a single trade that happened during backtesting or analysis. It's like a detailed record of one transaction. You'll find the price at which the trade took place, the amount of the asset that was exchanged, and a precise timestamp marking when the trade happened. Importantly, it also tells you whether the buyer was the one providing liquidity to the market at that point, which helps understand the trade's direction and impact. Each trade record has a unique ID for easy referencing.

## Interface IActivateScheduledCommitRow

This interface represents a message used to trigger the activation of a pre-scheduled trading action. Think of it as a notification to begin a plan that's already been set up. 

It includes the type of action, which is always 'activate-scheduled', along with a unique identifier for the signal being activated.  There's also an optional ID that can be provided by the user to explicitly request activation.

## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current state of signals. Think of it as a way to quickly check if a signal is already in progress or waiting to happen.

It's primarily used by the `ActionProxy` to decide whether certain actions, like adjusting profits or checking ping status, should even be considered.

Specifically, it offers two key checks:

*   `hasPendingSignal`: Determines if there's an existing, active signal for a given symbol.
*   `hasScheduledSignal`: Determines if a signal is waiting to be triggered in the future.

These checks help avoid unnecessary calculations and actions when a signal is already being handled. The checks can be performed in backtest or live mode.


## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy's behavior with custom event handlers. Think of actions as hooks that allow you to inject logic into the strategy execution process. 

You can use them to manage external state—like connecting to Redux—or to track what’s happening by logging events or sending notifications (like to Telegram or Discord). They’re flexible enough for custom business logic too.

Each action gets its own instance for every strategy run, ensuring isolated operation. 

The `actionName` gives each action a unique identifier, while `note` lets you add notes for documentation. 

`handler` is where the main logic of your action goes, and `callbacks` offer opportunities to interact at specific points in the strategy's lifecycle.

## Interface IActionParams

This interface, `IActionParams`, bundles everything an action needs to run smoothly. Think of it as a package deal containing information about the action's environment and the strategy it's part of. 

It builds upon a basic schema and includes a handy logger for keeping track of what's happening during execution. You’ll also find details like the strategy's name, the timeframe it's operating on (like "1m" for one-minute candles), and whether you're running a backtest or live trading. 

Crucially, it gives access to the `strategy` context, letting your action check the current signal and the positions currently held. This allows actions to make decisions based on the overall state of the trading strategy.

## Interface IActionCallbacks

This interface provides a way to hook into various lifecycle events and data streams within your trading actions. Think of it as a set of optional listeners that let you customize how your actions behave and respond to different situations.

You can use these callbacks to perform tasks like initializing connections when your action starts, cleaning up resources when it stops, or logging important events.  These callbacks are flexible and can handle both synchronous and asynchronous operations.

Here’s a breakdown of what each callback does:

*   **onInit:** Runs when your action is first set up. Perfect for opening connections or loading initial data.
*   **onDispose:** Runs when your action is taken down.  Ideal for cleaning up resources, like closing connections or saving data.
*   **onSignal:** Called whenever a signal is generated, whether you're in live trading or backtesting.
*   **onSignalLive:** Specifically triggered during live trading for signal events.
*   **onSignalBacktest:**  Specifically triggered during backtesting for signal events.
*   **onBreakevenAvailable:** Notified when your stop-loss is moved to the entry price.
*   **onPartialProfitAvailable:**  Tells you when a partial profit target is hit.
*   **onPartialLossAvailable:**  Informs you when a partial loss level is reached.
*   **onPingScheduled:**  Alerts you when your signal is scheduled to activate.
*   **onPingActive:**  Notified when a signal is active and being monitored.
*   **onPingIdle:**  Called when no signal is pending or active.
*   **onRiskRejection:**  Tells you when a signal is rejected by the risk management system.
*   **onSignalSync:**  Provides an opportunity to approve or reject a limit order for opening or closing a position.  Rejecting the order will trigger a retry on the next tick; be cautious as unhandled errors here will stop the process.



By implementing these callbacks, you can finely tune how your actions function and react to different market conditions.

## Interface IAction

This interface, `IAction`, is your central hub for interacting with the trading framework's state management system. Think of it as a set of event listeners for various happenings within the backtest or live trading environment. You'll implement methods within this interface to handle signals, profit/loss updates, risk rejections, and more.

It allows you to react to changes in real-time. You can use it for things like displaying trade signals on a dashboard, logging trade activity, or updating your own internal metrics.

Here’s a breakdown of what each method does:

*   **`signal`**: A general signal event – it fires for both backtests and live trades.
*   **`signalLive`**: Specifically handles signals when trading live.
*   **`signalBacktest`**: Handles signals specifically during backtesting.
*   **`breakevenAvailable`**:  Notifies you when a stop-loss is moved to the entry price.
*   **`partialProfitAvailable`**:  Alerts you when a partial profit level is reached (e.g., 10%, 20%).
*   **`partialLossAvailable`**:  Signals when a partial loss level is hit.
*   **`pingScheduled`, `pingActive`, `pingIdle`**:  Related to scheduled signal monitoring, providing updates on the ping status.
*   **`riskRejection`**:  Informs you if a potential signal failed a risk check.
*   **`signalSync`**:  This is a critical method that's called when the framework attempts to execute a trade via a limit order – if you throw an error here, you're essentially rejecting that order, and the framework will try again on the next tick.
*   **`dispose`**:  Crucially important for cleaning up – make sure to unsubscribe from any observables and release resources when you're done using the action handler to prevent memory leaks.

## Interface HighestProfitStatisticsModel

This model holds information about the highest profit events that occurred during a trading simulation. It keeps track of every profitable event in a list called `eventList`, displaying them in the order they happened (most recent first).  You’ll also find the total count of all profitable events recorded, represented by `totalEvents`. This gives you a quick view of the overall profitability performance.

## Interface HighestProfitEvent

This data represents the single best profit-making moment for a particular trading position. It tells you exactly when that peak profit occurred (timestamp) and details the specific trade involved, like the trading pair (symbol) and the strategy used. You'll find information about the signal that triggered the trade, whether it was a long or short position, and a breakdown of the profit and loss (PNL) involved, including the highest profit achieved and the maximum drawdown experienced. It also includes the prices at the time of the event: the entry price, the take profit price, and the stop loss price. Finally, a flag indicates if the event occurred during a backtesting simulation.

## Interface HighestProfitContract

This interface describes what's shared whenever a trading strategy reaches a new peak profit level. It provides key details, including the trading symbol involved (like "BTC/USDT"), the current price at that moment, and the exact time of the update. You'll also find information about the strategy's name, the exchange being used, and the timeframe involved, like "1m" or "5m".

The signal data for the trade that triggered this profit milestone is included too, allowing for a deep understanding of the trade's specifics. Finally, a flag indicates whether this update comes from a backtest (simulated trading) or live trading, enabling different reactions based on the environment. This information can be used to build custom features, like automatically adjusting stop-loss orders as profits increase.

## Interface HeatmapStatisticsModel

This structure provides a consolidated view of your portfolio's performance, offering key statistics across all the assets you're tracking. It includes an array detailing the performance of each individual symbol, along with overall portfolio metrics. You'll find the total number of symbols in your portfolio, the overall profit and loss, and the Sharpe Ratio, which measures risk-adjusted return. 

It also summarizes trading activity with the total number of trades executed, and presents weighted average peak and fall PNL values to give you a sense of typical profit and loss patterns. These combined metrics give a broad picture of your portfolio's health and trading effectiveness.

## Interface DoneContract

This interface represents the information available when a background process finishes, whether it's a backtest or a live trading execution. You'll see this data when a `Live.background()` or `Backtest.background()` task is complete. It tells you which exchange was used, the name of the strategy that ran, and whether it was a backtest or live execution.  Crucially, it also includes the trading symbol involved, like "BTCUSDT," letting you know precisely which asset was traded.

## Interface CriticalErrorNotification

This notification signals a very serious problem – a critical error – that requires the trading process to stop immediately. Think of it as an emergency signal.

Each critical error notification is given a unique identifier (`id`) to help track down the specific issue. 

You'll also get a clear explanation of what went wrong in the `message` field, along with the full error details, including where it occurred, in the `error` field. 

Importantly, these critical errors always originate from a live trading environment, so the `backtest` property is always set to `false`.

## Interface ColumnModel

This defines how your data is presented in a table. Think of it as a blueprint for each column you want to display. 

Each column needs a unique identifier, a label that users will see as the column header, and a formatting function. This formatting function takes your raw data and transforms it into a user-friendly string for display. Finally, you can specify whether a column should be visible based on certain conditions, giving you control over what the user sees.

## Interface ClosePendingCommitNotification

This notification informs you about a pending trading signal that was closed before a full position was established. It happens when a signal gets cancelled or adjusted before becoming a fully active trade. The notification includes a unique identifier and timestamp, plus details like the trading symbol, strategy name, and which exchange was involved.

You'll also find key performance indicators like profit and loss (PNL), peak profit, and maximum drawdown, providing a summary of the position's potential before it was closed. This allows you to understand why a signal didn't result in a live trade and analyze its performance characteristics if it had. It also specifies details like total entries, partial closes, and original entry price, alongside helpful notes explaining the reasoning behind the signal. Finally, information about when the notification was created is also included.

## Interface ClosePendingCommit

This signal indicates a position has been closed. 

It provides key details about the closure, including an identifier for the reason behind it. 

You’ll also find information about the position’s overall profit and loss (PNL) throughout its existence, including the highest profit achieved and the largest drawdown experienced. 

Essentially, this signal gives a snapshot of the position’s performance journey from start to finish.


## Interface CancelScheduledCommitNotification

This notification signals that a planned trading action has been canceled before it could actually happen. It’s useful for understanding why a signal didn't execute, especially if you're using scheduled signals. The notification includes a unique ID, the time of the cancellation, and whether it occurred during a backtest or live trading.

You'll find details about the signal itself, like the trading pair, the strategy that generated it, and a unique ID for the signal and cancellation. It also contains information about the trade size, original entry price, and performance metrics like P&L, peak profit, and maximum drawdown – giving you a complete picture of the potential trade and why it was ultimately canceled. An optional note field allows for a brief explanation of the cancellation reason. Finally, a timestamp indicates when the notification was created.


## Interface CancelScheduledCommit

This interface describes a signal event used to cancel a previously scheduled action. It's primarily used when a user wants to abort a planned trading operation, like closing a position.

The `action` field always specifies "cancel-scheduled" to clearly identify the signal's purpose. You can optionally include a `cancelId` to provide context or a reason for the cancellation, which is helpful for tracking or debugging. 

Along with the cancellation request, you can attach information about the closed position, specifically its total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest loss encountered (`maxDrawdown`).  This provides a snapshot of the position's performance up to the point of cancellation.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a trading simulation. Think of it as a record of when trades reached a point where they weren’t losing money anymore.

It keeps track of individual breakeven events, giving you a detailed list of each one. 

You can also quickly see the total number of times these breakeven milestones were reached. This helps you understand how frequently trades are recovering their initial costs.

## Interface BreakevenEvent

This data structure holds all the key information about when a trade reached its breakeven point. It's designed to be used when creating reports and analyzing trading performance.

Each `BreakevenEvent` includes details like the exact time of the event, the trading symbol involved, the name of the strategy used, and the unique identifier of the signal that triggered the trade.

You'll also find information about the position type (long or short), the current price at breakeven, the initial entry price, and the original take profit and stop loss levels. 

It also contains data about how the trade was managed, like the number of DCA entries or partial closes, and the unrealized profit and loss (PNL) at the time. A helpful note field allows you to add custom explanations for the signal. Finally, it tracks the lifecycle of the trade, noting when it was scheduled and when it became active, as well as whether it occurred during a backtest or live trading.

## Interface BreakevenContract

The `BreakevenContract` represents a significant event in your trading strategy: when a signal's stop-loss is moved back to the original entry price. This happens when the price moves favorably enough to cover transaction costs.

It’s a way to monitor your strategy's safety and track how it’s reducing risk over time. You’ll receive these events only once per signal, ensuring no duplicates.

Each `BreakevenContract` includes details like the trading symbol, the strategy's name, the exchange being used, the timeframe, and the full signal data, providing a complete picture of what happened. You also get the price at which breakeven was achieved and whether the event occurred during a backtest or live trade.  Finally, the timestamp indicates precisely when the breakeven was triggered—either the time of the trade for live events or the timestamp of the candle for backtest events.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trade has been closed. It provides comprehensive details about the closed position, useful for understanding how the strategy performed.

The notification includes a unique identifier and a timestamp marking when the breakeven action occurred. It also indicates whether it originated from a backtest or live trading environment, along with the trading symbol and the name of the strategy involved.

You'll find key information like the entry and exit prices, stop-loss and take-profit levels (both original and trailing adjusted), and details about any dollar-cost averaging (DCA) or partial closing strategies used.

Crucially, it includes detailed profit and loss (PNL) data, including peak profit, maximum drawdown, and relevant pricing information used for those calculations.  This allows for a thorough analysis of the trade's performance, including profitability, risk exposure, and the effectiveness of the strategy’s parameters. You'll also see information about the signal's creation and pending times, and a human-readable note can be included for additional context.

## Interface BreakevenCommit

This interface represents an event signaling that a trade has reached a breakeven point. It provides key details about the trade's performance and configuration at the time of the breakeven adjustment.

You'll find information about the trade’s direction (long or short), the initial entry price, and the current market price when the breakeven occurred.

It also includes crucial metrics like total profit and loss (PNL), the highest profit achieved (peak profit), and the largest drawdown experienced during the trade's lifetime. 

Furthermore, you can access the original and adjusted take profit and stop-loss prices, along with timestamps indicating when the signal was created and when the position initially activated. This data helps understand how the trade has progressed and the decisions made along the way.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be adjusted to the entry price, essentially breaking even. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it's from a backtest or live trading.

You'll find details about the trading pair (like BTCUSDT), the strategy used, and the exchange involved. The notification also breaks down key pricing information – the current market price, the original entry price, and the current take profit and stop-loss levels.

It goes even deeper, offering a full picture of the trade's performance, including total profit and loss, peak profits, maximum drawdown, and details about the individual entries and partial exits. The included data helps you analyze the trade's history and understand its risk profile in detail. Finally, it provides timestamps for various stages of the signal's life.

## Interface BacktestStatisticsModel

This model holds all the key statistical data generated from a backtest, giving you a complete picture of your strategy's performance. It includes a detailed list of every closed trade, allowing for deeper investigation. You'll find counts of winning and losing trades, and critical metrics like win rate and average P&L per trade.

The model also provides important risk-adjusted return measures. These include the Sharpe Ratio, annualized Sharpe Ratio, and Sortino Ratio – all helpful for understanding how much risk you're taking for your returns.  You can assess volatility with the standard deviation, and get an idea of potential yearly returns. Finally, it gives insight into the depth of drawdowns with the average peak and fall P&L percentages, alongside the recovery factor that highlights how well the strategy recovers from losses. If any calculation results in an unreliable value, like infinity, that specific metric will be reported as null.

## Interface AverageBuyCommitNotification

This notification tells you about a new step in your dollar-cost averaging (DCA) strategy. It's triggered whenever an additional averaging buy is executed within an existing position.

The notification includes a lot of details about this buy, such as the exact price and cost, along with the accumulated totals for your DCA entries. You'll also find information about the position itself, including its direction (long or short), price levels for take profit and stop loss, and important performance metrics like peak profit, maximum drawdown, and overall profit/loss in both USD and percentage terms. This data gives you a comprehensive view of how your DCA strategy is performing and helps track the progress of your position over time. It also tells you if the signal originated from a backtest or a live trading environment.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, signals that a new purchase has been made to build up your position using a dollar-cost averaging strategy. It provides a snapshot of the trade's details at the time of that purchase.

You’ll find information like the current market price, the cost of this specific averaging purchase, and the resulting effective average entry price for the entire position. The event also includes crucial metrics about the position’s performance so far, such as peak profit, maximum drawdown, and unrealized profit.

You’ll also see the original entry price, and the take profit/stop loss prices, potentially adjusted if trailing strategies are in use. Finally, timestamps show when the signal was created and when the position became active. This complete picture allows you to monitor and analyze how your dollar-cost averaging strategy is performing over time.


## Interface ActivePingContract

The ActivePingContract represents notifications sent regularly while a pending signal is still active and being monitored. Think of it as a heartbeat, sent approximately every minute, to let you know that a specific trading strategy is still tracking a particular pending order.

Each notification contains details about the symbol being traded (like BTCUSDT), the name of the strategy managing the order, and the exchange being used.

You'll also receive the full data associated with the pending signal, including all its parameters, and the current price of the asset at the time of the notification. A flag indicates whether this is from a historical backtest or a live trading environment.  Finally, a timestamp tells you precisely when this ping event occurred, either at the moment of the ping in live trading or tied to the historical candle being processed during backtesting.

You can use this information to build your own custom logic to monitor and react to the state of your pending signals.

## Interface ActivateScheduledCommitNotification

This notification lets you know a scheduled trading signal has been activated, meaning a trade has been initiated based on a previously set plan. It’s triggered when a user manually kicks off a signal, rather than waiting for the price to hit a specific level.

The notification provides a wealth of detail about the trade, including a unique ID, when it happened, and whether it's a backtest or a live trade. You’ll find specifics like the trading pair (e.g., BTCUSDT), the name of the strategy that generated the signal, and the exchange it was executed on.

It breaks down the mechanics of the trade itself, detailing the position size (long or short), entry and stop-loss/take-profit prices, and any trailing adjustments that might have been applied. The notification also includes information about any Dollar-Cost Averaging (DCA) used, showing the number of entries and partial closes.

Importantly, you'll get a full picture of the potential profit and loss, including peak profit, maximum drawdown, and various price points. Finally, details like the creation and pending timestamps, current price, and any user-added notes help provide a complete context for the trade activation.

## Interface ActivateScheduledCommit

This interface represents a signal event triggered to activate a previously scheduled trade. It bundles a significant amount of information related to the trade being activated, giving you a comprehensive view of its performance and parameters.

You'll find details about the trade's direction (long or short), the entry and exit prices (take profit and stop loss, both original and adjusted), and the position's current price. 

Crucially, it includes performance metrics like total profit and loss (pnl), peak profit, and maximum drawdown, providing a snapshot of the trade's profitability up to the activation point. The `scheduledAt` and `pendingAt` fields capture the timing of the signal and activation, useful for analysis. Finally, the `activateId` allows you to associate the activation with a specific user action or request.

