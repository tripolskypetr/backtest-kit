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

This interface defines the structure of signals sent when a walker needs to be stopped. Think of it as a notification that a specific trading strategy, running within a particular walker, should be paused or halted. It’s particularly useful when you have several strategies running at the same time – the `walkerName` helps you precisely target the one you want to stop, ensuring you don't accidentally interrupt the wrong process. The signal includes the trading symbol, the name of the strategy, and the name of the walker associated with the stop request.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps you understand how different trading strategies performed during a backtest. It’s like a report card for your strategies, built on top of the basic WalkerResults. 

Essentially, it gives you a list – called `strategyResults` – containing detailed performance data for each strategy you tested, making it easier to compare them side-by-side and draw meaningful conclusions. This is particularly helpful when you're trying to decide which strategy might be best for your needs.

## Interface WalkerContract

The WalkerContract acts as a messenger, letting you know when a strategy has finished being tested and its results are available. It provides updates during the comparison process, detailing which strategy just completed, the symbol it was tested on, and the exchange and frame it used.  You’ll find key information about the strategy's performance, including statistics and a calculated metric value used for optimization.  The contract also keeps track of the overall progress, letting you know how many strategies have been tested, the total number of strategies to be tested, and what the best-performing strategy has been so far. This allows you to monitor the backtesting process and potentially react to results in real time.

## Interface WalkerCompleteContract

This interface represents the conclusion of a backtesting process using the Walker framework. It signals that all strategies have been evaluated and the final results are ready. You’ll find key details within this object, such as the name of the Walker, the trading symbol being analyzed, and the exchange and timeframe used. 

It provides information about the optimization metric, the total number of strategies tested, and crucially, identifies the best-performing strategy alongside its metric score and detailed statistical information. Essentially, it's a comprehensive summary of the entire backtesting run.


## Interface ValidationErrorNotification

This notification tells you when something went wrong during risk validation—basically, when the system detected a problem with your trading rules or setup. It's emitted whenever a validation function runs into an error and stops.

The `type` property will always be "error.validation" so you know exactly what kind of problem it is. You'll also get an `id` for tracking, an `error` object containing details about the error itself, a human-readable `message` explaining what happened, a `timestamp` to pinpoint when the error occurred, and a `backtest` flag indicating whether this happened during a backtest. 


## Interface ValidateArgs

This interface, `ValidateArgs`, acts as a standardized way to ensure your configurations are correct when setting up backtests. Think of it as a checklist for your backtest components.

It defines properties for key parts of a backtest, like the exchange you're using, the timeframe, the strategy, the risk profile, sizing strategy, optimizer, and even the parameter sweep (walker). 

Each of these properties expects an enum – a set of predefined values.  This lets backtest-kit double-check that the names you're using actually exist and are valid within the system, preventing errors later on. It’s all about making sure everything is spelled correctly and matches what backtest-kit recognizes.

## Interface TickEvent

This data structure represents a single tick event during a backtest, providing a consistent format for all types of events, whether the system is idle, opening a trade, actively trading, or closing a position. It bundles together key information like the time the event occurred, the action that took place (idle, opened, active, or closed), and details specific to the trade itself.  For opened, active, and closed trades, you’ll find information such as the signal ID, position type, note, entry and exit prices, profit targets, stop losses, and progress towards those targets. Closed trades also include details like the profit/loss percentage and the reason the trade was closed, along with its duration. The current price is always included, regardless of the action type.

## Interface SignalScheduledNotification

This notification lets you know when a trading signal has been planned for execution at a later time. It contains all the key details about that signal, so you can track and understand what's happening behind the scenes.

You'll find information like the signal's unique identifier, the exact time it's scheduled to run, and whether it’s related to a backtest. The notification also specifies the asset (symbol) being traded, the strategy used, the exchange involved, and the intended position (long or short). 

Crucially, it includes the planned entry price, the time the signal should actually be executed, and the current market price at the time of scheduling. This allows you to monitor for any unexpected discrepancies or potential adjustments needed.

## Interface SignalOpenedNotification

This notification tells you when a new trade has started. It provides all the key details about the trade, like the unique ID of the signal that triggered it, the timestamp of when it happened, and whether it's a backtest or live trade. You’ll find information about the asset being traded (symbol), the name of the strategy that initiated the trade, and the exchange being used.

The notification also includes specifics about the trade itself: whether it’s a long or short position, the opening price, and the take profit and stop loss levels, along with any notes associated with the trade. This data is invaluable for monitoring and analyzing your trading activity.

## Interface SignalData$1

This data structure holds all the key details about a single, completed trading signal. Think of it as a snapshot of a trade after it’s finished. It tells you which strategy created the signal, assigns it a unique ID, and specifies what was traded (the symbol and whether it was a long or short position). 

You’ll also find the profit and loss (PNL) for that trade, expressed as a percentage, along with a description of why the signal was closed. Crucially, it includes timestamps marking exactly when the trade was opened and closed, allowing you to track its duration and timing. Essentially, it’s the information needed to analyze the performance of a specific trading signal.


## Interface SignalClosedNotification

This notification tells you when a trading position, initiated by a signal, has been closed. It's fired when a trade reaches a take-profit or stop-loss level.

The notification provides a lot of detail about the closed position, including a unique identifier for the signal that started it, the trading symbol, the name of the strategy and exchange involved, and whether the backtest run is live or historical. You’ll find the opening and closing prices, the percentage profit or loss, and the reason why the position was closed. It also includes information like how long the position lasted and any notes associated with the trade. Essentially, it gives you a complete picture of a closed trading position within the backtest-kit framework.

## Interface SignalCancelledNotification

This notification lets you know when a scheduled trading signal has been canceled before it was actually executed. It provides details about the canceled signal, including a unique ID, the timestamp of the cancellation, and whether the backtest was running. You’ll also find information about the asset being traded (symbol), the strategy and exchange involved, and the reason for the cancellation, along with an ID specifically for the cancellation itself. The notification also includes information about the intended position (long or short) and the duration of the signal. This is helpful for debugging and understanding why a signal didn't go through as planned.


## Interface ScheduleStatisticsModel

This model gives you a clear picture of how your scheduled signals are performing. It collects data about all the events related to your signals – when they're scheduled, activated, or cancelled. 

You’ll find a detailed list of each event, along with totals for scheduled, opened, and cancelled signals.  It also provides key metrics to assess your scheduling strategy, such as cancellation and activation rates, expressed as percentages.  Finally, you can track average wait times to understand how long signals typically linger before being cancelled or activated.

## Interface ScheduledEvent

This interface, `ScheduledEvent`, acts as a central hub for all information related to scheduled, opened, and cancelled trading signals. It bundles together details like when an event occurred (`timestamp`), what type of event it was (`action`), and specifics about the trade itself, such as the symbol being traded (`symbol`), the signal’s ID (`signalId`), and the position being taken (`position`).

You’ll find details about price targets too, like the intended entry price (`priceOpen`), take profit level (`takeProfit`), and stop loss level (`stopLoss`). For cancelled events, it records the reason for cancellation (`cancelReason`) and, if it was a user-initiated cancellation, a unique cancellation ID (`cancelId`).  The `duration` property provides the length of time a signal was open or active. Finally, `currentPrice` reflects the market price at the time of the event.

## Interface RiskStatisticsModel

This model helps you understand and track risk management performance. It collects information about risk rejections, providing a clear picture of where and why those rejections occur. 

You’ll find a detailed list of each rejection event, including all the relevant information.  It also offers summarized counts – the total number of rejections, and breakdowns of rejections organized by the trading symbol and by the strategy used. This makes it easier to identify trends and potential areas for improvement in your risk management practices.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked by your risk management system. It provides key details about why the signal wasn’t executed.

You'll find information like a unique ID for the rejection, a timestamp marking when it happened, and whether it occurred during a backtest. It also includes the symbol involved, the name of the strategy and exchange, and a descriptive note explaining the reason for the rejection – super helpful for understanding your risk rules in action.

The notification even gives you the current price of the asset and the rejected signal itself, along with details about how many active positions you had at the time. This allows you to investigate exactly what triggered the rejection and refine your risk parameters.

## Interface RiskEvent

This data structure represents an event that occurs when a trading signal is rejected due to risk management rules. It holds all the details surrounding that rejection, making it useful for reporting and analysis.

You’ll find information like when the event happened (timestamp), the trading pair involved (symbol), and the specifics of the signal that was blocked (pendingSignal). It also includes the name of the strategy, the exchange, the time frame, and the current market price at the time of rejection.

Further, it tracks how many positions were already open (activePositionCount), a unique identifier for the rejection (rejectionId), the reason for the rejection (rejectionNote), and whether the event originated from a backtest or live trading environment (backtest). This complete picture helps understand why signals are being rejected and optimize risk parameters.

## Interface RiskContract

The RiskContract provides information about trading signals that were blocked due to risk management rules. It’s like a notification when the system says “no” to a trade.

Each time a signal is rejected, this contract bundles together key details about why it was stopped – what trading pair was involved, what strategy wanted to make the trade, what the proposed trade looked like, and the current market price.

You’ll find details like the symbol (e.g., BTCUSDT), the specific signal being attempted (price targets, position size), the strategy’s name, and the current price.  A unique ID helps with tracking and debugging, and a human-readable note explains *why* the signal was rejected.

The record also includes the number of active positions at the time of the rejection, providing a view of the overall portfolio exposure.  A timestamp and a flag indicating whether the event occurred during a backtest are also included for comprehensive tracking. This helps you monitor your risk controls and understand when and why trades are being prevented.

## Interface ProgressWalkerContract

This interface defines how progress updates are reported during a backtesting process. Think of it as a way to get notified about how far along a backtest is, particularly when it’s running in the background. 

You'll see these updates when a Walker, which handles a set of backtests, is running. The updates contain key details such as the name of the backtest being run, the exchange being used, the specific trading symbol (like BTCUSDT), and how many strategies are left to process out of the total. 

Essentially, it gives you a snapshot of the progress, expressed as a percentage, allowing you to monitor the backtest’s status.

## Interface ProgressOptimizerContract

This contract helps you keep an eye on how your optimization process is going. It provides updates as your backtest-kit framework works through different data sources. You'll see the name of the optimizer running, the trading symbol it’s focused on, and how much data it has left to process. 

It tells you the total number of sources being used, how many have already been handled, and a percentage showing overall completion. This lets you monitor progress and get a sense of how long the optimization might take.


## Interface ProgressBacktestNotification

This notification lets you track the progress of your backtest as it runs. It provides key details like the exchange and strategy being used, the symbol being backtested, and the overall number of data points being processed. You’ll find information about the current frame being analyzed, the total number of frames in the backtest, and a percentage representing how far along the backtest has completed. The notification includes a unique ID and timestamp for each update, offering a clear record of the backtest's advancement.

## Interface ProgressBacktestContract

This contract helps you monitor the progress of a backtest as it runs. It provides updates on how far along the backtest is, including the exchange and strategy being used, the trading symbol, the total number of historical data points (frames) the backtest will analyze, and how many frames have already been processed. You'll see a percentage representing the overall completion of the backtest, making it easy to understand its status. Essentially, it's your window into the backtest's journey.

## Interface PingContract

The `PingContract` helps you keep track of what's happening with your scheduled trading signals. Think of it as a regular heartbeat signal emitted every minute while a signal is actively being monitored. It's particularly useful for knowing when a signal is in the monitoring phase, meaning it’s neither canceled nor activated yet.

You can use this signal to build custom logic – maybe you want to automatically cancel a signal based on certain conditions.

Here's what information you get with each ping:

*   **symbol:** The trading pair, like BTCUSDT, telling you which market it’s for.
*   **strategyName:** The name of the strategy that’s currently monitoring the signal.
*   **exchangeName:** The exchange where the signal is being tracked.
*   **data:** A complete set of information about the scheduled signal, including details like entry price, take profit, and stop loss levels.
*   **backtest:** A flag indicating whether this ping is from a backtest (historical data) or live trading.
*   **timestamp:** When the ping occurred – either the real-time time during live trading or the candle timestamp during a backtest.

You can listen for these ping events to implement your custom monitoring and control logic.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest. Think of it as a report card for your trading strategy. 

It includes the strategy's name, the total number of events that occurred, and the overall time it took to run. 

The `metricStats` property breaks down the performance into different categories, allowing you to analyze specific aspects of your strategy. Finally, the `events` array contains all the individual performance data points, giving you the raw details behind the summarized statistics.


## Interface PerformanceContract

The `PerformanceContract` helps you keep an eye on how your trading system is performing. It records details about different operations, like how long they take to complete. 

Think of it as a performance log. 

Each entry in this log includes things like when the operation started and ended (timestamps), what type of operation it was, how long it ran, which strategy and exchange it was related to, and whether it was part of a backtest or live trading. This information is valuable for finding slow spots and optimizing your system. The `frameName` property is useful for backtest analysis and will be empty during live trading.

## Interface PartialStatisticsModel

This data structure helps you understand the results of a trading backtest when you're tracking partial profits and losses. It breaks down the events that occurred during the backtest, giving you a clear picture of how many times the trade resulted in a profit versus a loss. You’ll find a detailed list of each individual profit/loss event, along with the total number of events, the total number of profitable trades, and the total number of losing trades. Think of it as a simple scorecard for your trading strategy, focusing specifically on the partial profit/loss milestones.

## Interface PartialProfitNotification

This notification lets you know when a trading signal has reached a pre-defined profit milestone during a backtest or live trading. It’s triggered when the signal hits levels like 10%, 20%, or any custom level you’ve set up. 

The notification contains details like the symbol being traded, the strategy’s name, the exchange used, and a unique identifier for the signal. It also provides the current price, the opening price, and the direction of the trade (long or short). You'll see the profit level reached, along with a timestamp and confirmation that this event occurred during a backtest. Think of it as a progress report for your trading strategy's profitability.

## Interface PartialProfitContract

The `PartialProfitContract` represents when a trading strategy hits a predefined profit milestone during execution, like reaching 10%, 20%, or 30% profit. This event provides valuable information for monitoring how a strategy is performing and for managing partial take-profit actions.

Each event includes details like the trading pair symbol, the name of the strategy that triggered it, and the exchange being used. It also gives you the current price at the time the profit level was reached, the level achieved (e.g., 10%, 50%), and whether the event happened during a backtest or live trading.

You'll find comprehensive signal data included as well, allowing you to see all the details of the signal that led to this profit level. The timestamp helps track exactly when this event occurred, whether it's from a real-time tick or a historical candle during backtesting. Various services, like reporting tools, and user callbacks utilize these events to build reports and react to profit milestones.

## Interface PartialLossNotification

This notification lets you know when a trading signal has reached a predefined loss level, like a 10% or 20% decline. It's a signal that something isn't going as planned and helps you monitor the performance of your strategy. 

The notification includes key details such as the time it occurred, the specific loss level reached, the trading symbol involved, the name of the strategy and the exchange it's running on, and the ID of the signal. You'll also find the current price of the asset, the opening price, and whether the position is long or short, giving you a complete picture of the situation. It also distinguishes between live and backtest environments.

## Interface PartialLossContract

This describes what happens when a trading strategy experiences a loss – but not a complete one. The `PartialLossContract` is triggered when a strategy hits predefined loss levels, like a 10%, 20%, or 30% drop from its initial entry price. It's a way to keep track of how a strategy is performing and when it's nearing stop-loss thresholds.

Think of it as a notification system for potential trouble. Each notification contains details like which trading pair is affected ("BTCUSDT"), the name of the strategy causing it, the exchange and frame involved, and the complete signal data. You'll also get the current market price and the specific loss level that triggered the event (e.g., -20%).

The `backtest` flag lets you know if this loss event occurred during a historical simulation or in live trading. The `timestamp` provides an important marker of *when* that loss level was hit – either the real-time detection in live trading or the candle's timestamp during backtesting. This information is used to create reports, monitor strategy performance and allow users to react to the signals.

## Interface PartialEvent

This interface represents a snapshot of a profit or loss event during a trading simulation or live trade. It bundles together key details like when the event happened, whether it was a profit or a loss, the trading pair involved, the name of the strategy that triggered it, and the signal identifier. You’ll also find information about the position (long or short), the current market price at the time, and the profit/loss level that was achieved. Finally, it indicates whether the trade occurred during a backtest or in a live trading environment.

## Interface MetricStats

This object neatly summarizes the performance statistics for a particular type of metric within your backtesting system. It provides a comprehensive view of how that metric behaved over time, giving you key insights into its performance. 

You'll find details like the total number of times the metric was recorded, the overall duration it took, and its average duration. To give you a more complete picture, it also includes important statistical measures, such as the minimum and maximum durations, the standard deviation, and various percentiles (like the 95th and 99th).

Furthermore, it breaks down the timing between events, offering average, minimum, and maximum wait times. This allows you to understand not just how long things took, but also the variability in the timing of those events.

## Interface MessageModel

The MessageModel helps keep track of conversations, especially when working with AI language models. It's like a simple way to represent each turn in a chat. 

Every message has a `role` which tells you who sent it – whether it's the system setting the scene, the user asking a question, or the AI responding. 

The `content` property holds the actual text of that message, the words being exchanged. Think of it as capturing both the instructions and the conversation itself.

## Interface LiveStatisticsModel

This model gives you a detailed look at how your live trading is performing. It tracks everything from the number of trades executed to key performance indicators like win rate and average profit per trade. You’ll find a complete history of each trade event, along with totals for all trades, wins, and losses. 

Several important metrics are calculated to help you assess your strategy's effectiveness, including average profit, total profit, volatility (standard deviation), and risk-adjusted returns (Sharpe Ratio and annualized Sharpe Ratio). A certainty ratio gauges the consistency between winning and losing trades, and expected yearly returns provide a longer-term performance projection. Keep in mind that if any of these calculations encounter unreliable data, the value will be displayed as null.


## Interface LiveDoneNotification

This notification signals the successful completion of a live trading session. When a live trade finishes running, this notification is sent out. It provides key information about the trade, including a unique identifier (`id`), the precise time of completion (`timestamp`), and confirms that it was a live execution (`backtest: false`). You’ll also find details about the traded asset (`symbol`), the strategy used (`strategyName`), and the exchange facilitating the trade (`exchangeName`). This information can be useful for tracking live trading performance and analyzing results.

## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest comparison. It bundles together key information about that strategy’s performance.

You'll find the strategy's name clearly labeled, alongside detailed statistics generated from its backtest—things like total profit, drawdown, and win rate. A single, important 'metric' value is provided, and this is what's used to rank the strategies against each other. Finally, the 'rank' property tells you where this strategy sits in the overall performance order, with the best performer being ranked as number 1.

## Interface IWalkerSchema

The IWalkerSchema defines how to set up A/B testing for your trading strategies within the backtest-kit framework. Think of it as a blueprint for comparing different approaches.

Each Walker, identified by a unique name, specifies which exchange and timeframe to use when running backtests. 

It lists the strategies you want to test against each other – these strategies need to be registered separately within the system. 

You can choose the metric to optimize, like Sharpe Ratio, but it defaults to Sharpe Ratio if you don’t specify one.  

Finally, you have the option to add callbacks for custom actions during the Walker’s lifecycle, which can be useful for advanced scenarios and monitoring.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after running a backtest comparison. It tells you which asset, represented by its `symbol`, was tested. You'll also find the `exchangeName` used for trading, the specific `walkerName` that performed the tests, and the `frameName` defining the backtesting period. Essentially, this object summarizes the entire backtesting process in a single, organized structure.

## Interface IWalkerCallbacks

These callbacks give you a way to hook into the backtest process as it runs. You can use them to monitor progress and react to events during strategy testing.

`onStrategyStart` lets you know when a particular strategy is beginning its backtest, telling you the strategy's name and the symbol being tested. 

`onStrategyComplete` is triggered when a strategy backtest finishes, providing you with performance statistics and a specific metric for analysis.

If a strategy backtest encounters an error, `onStrategyError` will be called, giving you details about the error that occurred, including the strategy and symbol involved.

Finally, `onComplete` is called when the entire backtest process is finished, giving you access to a summary of the results from all tested strategies.

## Interface IStrategyTickResultScheduled

This interface describes what happens when a trading strategy generates a signal that's set to activate later, once the price hits a certain level. Think of it as a signal being "on hold" waiting for the right moment.

It includes details like the strategy's name, the exchange it's running on, the timeframe being used (like 1-minute or 5-minute charts), and the specific trading pair involved. 

You’ll also find the price at the time the signal was scheduled, and a flag indicating whether this event happened during a backtest or in a live trading environment. Essentially, it's a record of a signal patiently awaiting its chance to be executed.

## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is created within the backtest-kit framework. It's triggered after a signal has been validated and saved, essentially marking its initial creation. 

The result provides key details about the signal, including its ID, the name of the strategy that generated it, and the exchange and timeframe involved. You'll also find information like the trading symbol and the price at the time the signal opened. Finally, it indicates whether this event occurred during a backtest or in a live trading environment. This information helps you monitor and understand how signals are being generated and used.


## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an “idle” state – meaning there’s no active trading signal at the moment. It's a record of the conditions when the strategy isn't taking action.

The information included details the strategy's name, the exchange it's connected to, the timeframe being analyzed (like 1-minute or 5-minute candles), and the trading pair being monitored. You'll also find the current price during this idle period, and whether the data is coming from a backtest simulation or live trading. Essentially, it provides a snapshot of the market conditions and strategy state when nothing is actively happening.

## Interface IStrategyTickResultClosed

This interface, `IStrategyTickResultClosed`, represents the outcome when a trading signal is closed. It provides all the details about the closing event, including why the signal was closed—whether it was due to a time limit, reaching a take-profit target, or a stop-loss trigger. 

You'll find information like the closing price, the exact timestamp of the closure, and a comprehensive profit and loss (PNL) calculation, accounting for fees and slippage. The interface also logs key identifiers like the strategy name, the exchange used, the timeframe, and the trading symbol, which is very useful for tracking and analysis. A flag indicates if the event originated from a backtest simulation. Finally, it includes the original signal data for reference.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, represents what happens when a planned trading signal is cancelled before a trade actually takes place. Think of it as a notification that a signal you were expecting to execute didn’t go through, perhaps because the market moved against you or because you specifically cancelled it.

It gives you details about *why* the signal was cancelled, the price at the time of cancellation, and important context such as the strategy name, the exchange, the timeframe used, and the trading symbol involved.  You’ll also see whether it’s a backtest scenario or a live trading situation.

Key pieces of information include:

*   The `reason` for cancellation, helping you understand the cause.
*   A `cancelId`, which is useful if you manually cancelled the signal.
*   The `currentPrice` which is the VWAP price when cancellation happened.



Essentially, it's a record of a planned trade that didn't happen, offering valuable insights for analysis and optimization.

## Interface IStrategyTickResultActive

This interface represents a tick event within the backtest-kit framework, specifically when a trading strategy is actively monitoring a signal and waiting for a specific event like a take profit, stop loss, or time expiration. It provides detailed information about the signal being watched, including the current price, the strategy and exchange involved, and the timeframe being used. You'll find details about the trading pair (symbol), as well as progress indicators showing how close the trade is to reaching its take profit or stop loss targets. Finally, it indicates whether the event originates from a backtesting simulation or live trading environment.

## Interface IStrategySchema

This schema defines how a trading strategy is registered within the backtest-kit framework. Think of it as a blueprint for how your strategy generates trading signals.

Each strategy needs a unique name for identification. You can also add a note to describe your strategy for yourself or others.

The `interval` property controls how often your strategy is checked for new signals; it helps prevent overwhelming the system.

The core of the strategy is the `getSignal` function, which is responsible for calculating whether to buy or sell. It receives market data and a timestamp, and returns a signal object, or nothing if no action is needed. It has special functionality if you want to delay the opening based on price.

You can also define optional callbacks to be triggered at key points in the trading process, like when a position is opened or closed.

Finally, you can associate your strategy with specific risk profiles to ensure it aligns with your overall risk management plan, possibly even assigning multiple profiles.

## Interface IStrategyResult

The `IStrategyResult` interface holds all the information about a single trading strategy after it's been backtested. Think of it as a container for one row in a comparison table of strategies. It includes the strategy's name, a comprehensive set of statistics about its performance during the backtest, and the value of a specific metric used to rank the strategies. This metric helps you easily compare different strategies and see which ones performed the best based on your chosen criteria.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the profit and loss results for a trading strategy. It gives you a clear picture of how your strategy performed, accounting for real-world factors. The `pnlPercentage` property shows the profit or loss as a percentage change, making it easy to quickly assess performance.  You'll also find `priceOpen` and `priceClose`, which display the actual prices used for entering and exiting trades, already adjusted for both fees (0.1%) and slippage (0.1%). This lets you see exactly what prices the strategy interacted with.

## Interface IStrategyCallbacks

This interface lets you hook into different points in a trading strategy's lifecycle. Think of them as event listeners that notify you when something interesting happens, like a signal being opened, becoming active, or being closed. 

You can receive updates on every tick of the market with the `onTick` callback, giving you a constant stream of data.  

Specific callbacks like `onOpen`, `onActive`, and `onClose` tell you exactly when a signal starts, is being monitored, or finishes, respectively. The `onIdle` callback signals when no signals are actively being tracked.

For signals that are scheduled or cancelled, `onSchedule` and `onCancel` provide notifications. The `onWrite` callback is useful if you’re testing and need to see when signal data is being saved.

There are also callbacks for profit and loss states: `onPartialProfit`, `onPartialLoss`, and `onBreakeven` alert you when a trade is making progress or needs adjustments. Finally, `onPing` provides a regular heartbeat for custom monitoring and checks. These callbacks all receive information about the symbol, signal data, current price, and whether the event is part of a backtest.

## Interface IStrategy

This interface defines the core functions a trading strategy needs to implement within the backtest-kit framework. It's essentially a blueprint for how your strategy interacts with the testing environment.

The `tick` method is the heart of the strategy, processing each incoming market update and checking for potential trading signals or adjustments to existing orders. It's designed to be efficient and not overly intensive per tick.

`getPendingSignal` and `getScheduledSignal` allow the system to monitor signals that are waiting to be triggered or have a future activation time. These are used internally to manage things like take profit, stop loss and expiration times.

`getStopped` is a simple check to see if the strategy has been halted.

The `backtest` method enables rapid testing of the strategy against historical data.  It simulates trading based on candles, recalculating VWAP and adjusting stop-loss and take-profit levels.

`stop` provides a way to gracefully pause the strategy from generating further signals, without closing currently open positions. It's ideal for controlled shutdowns.

`cancel` lets you discard a scheduled signal without stopping the entire strategy. This is useful for modifying a planned entry without impacting other aspects of the strategy.

`partialProfit` allows you to take partial profits from your position, moving closer to a target profit level.  It includes checks to prevent errors and ensure you don't close more than your available position.

`partialLoss` is the counterpart to `partialProfit`, enabling you to reduce potential losses by closing a portion of your position at a loss level.  Like `partialProfit`, it has built-in validations.

`trailingStop` dynamically adjusts the stop-loss level based on price movement, protecting profits. The `percentShift` parameter controls how aggressively the stop-loss adjusts.

Finally, `breakeven` automatically moves the stop-loss to the entry price when the price has moved sufficiently in your favor, essentially guaranteeing no loss on the trade.

## Interface ISizingSchemaKelly

This interface defines how to size trades using the Kelly Criterion, a popular method for maximizing growth rate. It lets you specify that you're using the Kelly Criterion sizing method and then set a multiplier. This multiplier essentially controls how aggressively you're applying the Kelly formula; a lower multiplier (like the default 0.25) is generally considered safer, while a higher one is riskier but potentially more rewarding. Think of it as a way to temper the potentially very aggressive sizing suggested by a full Kelly calculation.

## Interface ISizingSchemaFixedPercentage

This schema defines a trading strategy where the size of each trade is determined by a fixed percentage of your available capital. It’s a simple approach to risk management where you specify the maximum percentage of your portfolio you're willing to risk on any single trade. The `riskPercentage` property, expressed as a number between 0 and 100, dictates that percentage.  For example, a `riskPercentage` of 10 means each trade will risk 10% of your capital. The `method` property is always set to "fixed-percentage" to identify the sizing strategy being used.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing schemas within the backtest-kit framework. It ensures each sizing configuration has a unique identifier, a place for developer notes, and clear limits on position sizes – both as a percentage of your account and as absolute values. You can also add optional callbacks to customize how the sizing logic behaves at different stages. Think of it as the foundational blueprint for controlling how much of your capital is used in each trade.

## Interface ISizingSchemaATR

This schema defines how to size trades using the Average True Range (ATR) as a key factor. It's designed for strategies where you want to manage risk dynamically based on market volatility. 

You'll specify a `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on any single trade – a common practice for responsible trading. 

The `atrMultiplier` dictates how the ATR value is used to determine the stop-loss distance for your trades; a higher multiplier means a wider stop, accommodating more volatility. This method helps adapt trade sizes to changing market conditions.

## Interface ISizingParamsKelly

This interface, `ISizingParamsKelly`, helps define how much to trade based on the Kelly Criterion. Think of it as a way to control the sizing of your trades – how much of your capital you risk on each trade.

It primarily focuses on providing a logger, which is important for tracking and debugging the sizing process. The logger allows you to see what's happening under the hood and troubleshoot any issues with your trading strategy. Essentially, it ensures you have visibility into how your trades are being sized.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage of your available capital. It’s all about consistently risking a certain portion of your funds with each trade.

You’ll need to provide a logger to help with debugging and understanding what’s happening behind the scenes. This logger allows you to see messages about the sizing calculations.

The `percentage` property specifies what portion of your capital you're willing to risk on each trade; it must be a number between 0 and 1.

## Interface ISizingParamsATR

This interface defines how to calculate trade sizes using the Average True Range (ATR). It's used when setting up the sizing logic within the backtest-kit framework.

The `logger` property allows you to connect a logging service, enabling you to track and debug the sizing calculations as your backtest runs. This helps you understand how trade sizes are being determined.

## Interface ISizingCallbacks

This interface provides a way to be notified about what's happening during the sizing process – that is, when the framework figures out how much of an asset to trade. Specifically, the `onCalculate` callback gets triggered immediately after the framework calculates a potential trade size.  You can use this to inspect the calculated size, log the details for review, or even ensure the size makes sense according to your specific rules before proceeding. It receives the calculated quantity and some parameters related to the sizing calculation.


## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate position sizes using the Kelly Criterion. 

It requires you to specify the calculation method, which must be "kelly-criterion". 

You’ll also need to provide your win rate, a number between 0 and 1 representing the percentage of winning trades, and your average win/loss ratio, which indicates how much you typically win compared to how much you lose on a single trade. These inputs help determine an optimal bet size based on your historical trading performance.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate the size of a trade using a fixed percentage approach. Essentially, it tells the backtest system how much of your capital to risk on each trade based on a pre-determined percentage. 

You'll provide a `method` indicating you're using the "fixed-percentage" sizing strategy.  The `priceStopLoss` property is crucial - it represents the price at which your stop-loss order would be placed, directly influencing how that percentage is calculated. It's the price that dictates the risk level for the sizing.

## Interface ISizingCalculateParamsBase

This interface defines the core information needed when figuring out how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," so you know what you're dealing with.  You'll also find the current balance of your account, which is critical for determining how much you can realistically risk. Finally, it provides the planned entry price for the trade, helping to calculate potential profit or loss. These parameters act as the foundation for all sizing calculations within the backtest-kit framework.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed when you're calculating your trade size using the Average True Range (ATR) method. It's a simple way to determine how much to trade based on market volatility, as measured by the ATR. 

You'll provide an `atr` value, which represents the current ATR reading, and confirm that you’re using the "atr-based" sizing calculation method. This gives backtest-kit the information it needs to adjust your trade size proportionally to the ATR.

## Interface ISizing

The `ISizing` interface is all about figuring out how much to trade – essentially, how many shares or contracts a strategy should buy or sell. It's a core part of how backtest-kit executes trading strategies.

The key function here is `calculate`. It takes a set of parameters that describe the risk profile and current market conditions, and then returns a number representing the calculated position size. Think of it as the brain of the sizing logic, determining the right amount to trade based on the strategy’s rules and the current situation. This calculation happens as a promise, allowing for asynchronous operations if needed.

## Interface ISignalRow

An `ISignalRow` represents a complete trading signal, and it's the standard format used throughout the backtest-kit system after a signal has been validated. Each signal gets a unique ID, automatically generated to help track it.

The signal includes details like the entry price (`priceOpen`), the exchange and strategy used to generate it, and the timeframe it applies to. You'll also find the timestamps for when the signal was initially created (`scheduledAt`) and when the position went pending (`pendingAt`).

Crucially, it specifies the trading pair (`symbol`) being used.  A flag (`_isScheduled`) indicates whether the signal was pre-planned.

For more complex positions, a history of partial closes (`_partial`) is recorded to accurately calculate profit and loss, especially when considering partial exits. This allows for a weighted PNL calculation taking into account each partial close's contribution. 

Finally, a trailing stop-loss price (`_trailingPriceStopLoss`) can be used, dynamically adjusting based on price movement and overriding any previously set stop-loss price during execution.

## Interface ISignalDto

This interface, `ISignalDto`, defines the structure for signal data used within the backtest-kit framework. Think of it as a standardized way to represent a trading signal, whether it’s generated by a strategy or a human trader.  It includes key information like the trade direction (long or short), a brief explanation of why the signal was generated, and the entry price.  You'll also find details about target prices for taking profits and setting stop-loss orders, with constraints to ensure they align with the trade direction. Finally, it includes an estimated duration for the trade in minutes.  The system automatically generates a unique ID for each signal if one isn’t provided initially.


## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, helps you manage signals that need to wait for a specific price to be reached before they're executed. Think of it as a signal that's on hold, waiting for a particular price level. It builds upon the basic `ISignalRow` and represents a signal that's currently pending until the market price hits a certain target. Once that target price, `priceOpen`, is achieved, the signal transforms into a standard pending signal.  A key feature is that the `pendingAt` timestamp reflects the initial scheduling time until the signal activates, and then updates to show the actual time it started pending. The `priceOpen` property simply defines the price that needs to be met to trigger the signal.

## Interface IScheduledSignalCancelRow

This interface describes a scheduled signal that can be canceled by the user. It builds upon the standard scheduled signal information by adding a `cancelId`. This `cancelId` serves as a unique identifier specifically for signals that were canceled through user action, allowing for tracking and management of those cancellations. Think of it as a reference number you'd get if you requested a cancellation—this interface is how that reference is represented in the system.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, is designed to provide all the necessary information when you're performing risk checks within your backtesting strategy. It builds upon `IRiskCheckArgs` and adds crucial data about the current portfolio state.

You'll find details about a `pendingSignal` – a signal that's about to be applied, which includes price information.  The payload also provides the `activePositionCount`, telling you how many positions are currently open. Finally, it includes a list of all `activePositions`, giving you detailed insight into what's already in your portfolio. This comprehensive data allows for more informed and robust risk validation decisions.

## Interface IRiskValidationFn

This defines the structure for functions that check if a trade idea or order is safe to execute. Think of it as a gatekeeper for your trading strategy. These functions receive information about a potential trade and decide whether to allow it to proceed. If everything looks good, the function doesn't do anything – it simply lets the trade go ahead. However, if it detects a problem, like a violation of your risk rules, it needs to signal that issue. It can do this by either returning a specific "rejection result" object that explains the problem, or by throwing an error, which the system will then convert into that same rejection result object.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you set up checks to make sure your trading strategies are behaving responsibly. Think of it as a way to define rules that your backtesting system follows.

You provide a `validate` function, which is the core of the check – it's where you put the actual logic to assess if things look right.  Alongside the validation function, you can add a `note` – a short description explaining what this particular validation is intended to do; this makes it easier for others (or yourself later!) to understand the purpose of the check.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, represents a row of data used internally for managing risk during trading. It builds upon the `ISignalDto` interface, adding specific details crucial for risk assessment.  Specifically, it holds the `priceOpen`, which is the entry price for a trade, and `originalPriceStopLoss`, which represents the initial stop-loss level set when the trade signal was generated. This information allows the backtest framework to validate risk parameters against the original trade setup.

## Interface IRiskSchema

This interface, `IRiskSchema`, lets you create and manage custom risk controls for your trading portfolio. Think of it as defining rules to keep your trading within safe boundaries.

Each risk schema has a unique `riskName` to identify it, and you can add a `note` for yourself to remember what it does.  You can also add optional callbacks, `callbacks`, to be triggered when a risk control is rejected or allowed, which is useful for logging or more complex reactions.

The core of a risk schema are the `validations`. This is an array of functions or objects that contain the actual logic for checking if a trade meets your risk criteria, like maximum position size or diversification rules.  These validations ensure your trading strategy adheres to your defined risk limits.


## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, pops up when a risk check fails during a backtest. Think of it as a notification letting you know something didn’t pass the rules. It provides two key pieces of information: a unique `id` to track the specific rejection and a `note` which is a simple explanation in plain language describing *why* the check failed. This helps you quickly understand and fix any issues arising from your trading strategy’s risk parameters.

## Interface IRiskParams

This interface, `IRiskParams`, defines the configuration needed when setting up the risk management system. It includes essential details like the name of the exchange you’re working with, a logger to help track what's happening, and a flag to indicate whether you're in backtesting mode (simulated trading) or live trading. 

Crucially, it also provides a callback function, `onRejected`, that’s triggered when a trading signal is blocked because it exceeds pre-defined risk limits. This callback allows you to react to these rejections, potentially log the event, or emit notifications related to the risk check.  It’s used as a key point for handling risk-related events before they are ultimately processed further.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds all the necessary information for a risk check – essentially, it’s a set of data passed to a function to determine if opening a new trade is safe and permissible. This check happens *before* a trading signal is actually created, providing a safety net. Think of it as a validation process to make sure everything aligns before committing to a trade.

It includes details like the trading pair's symbol (e.g., BTCUSDT), the specific signal being considered, the name of the strategy making the request, the exchange involved, the timeframe being used, the current price, and a timestamp.  All this information allows the risk check logic to assess the situation and decide whether to proceed. It's purely a data container pulled from the broader ClientStrategy environment.

## Interface IRiskCallbacks

This interface provides a way to be notified when risk checks happen during trading. You can implement it to react to signals that either fail or pass your defined risk limits. The `onRejected` callback is triggered when a trade signal is blocked because it exceeds risk thresholds, giving you the opportunity to log the event or take corrective action. Conversely, `onAllowed` is called when a trade signal is approved and can proceed, allowing you to track successful risk assessments.

## Interface IRiskActivePosition

This interface represents a position that a trading strategy holds, and that's being monitored for risk management purposes. It tells you which strategy created the position, what exchange it’s on, and when the position was initially opened. Think of it as a snapshot of a position’s basic details as the risk system sees it. Having this information lets you analyze risk across different strategies and exchanges.

## Interface IRisk

This interface, `IRisk`, is all about managing and controlling risk while you're trading. It allows your trading strategies to stay within predefined safety boundaries. 

Think of it as a gatekeeper – before a signal triggers a trade, `checkSignal` assesses whether it's safe to proceed, considering various risk factors you’ve set up. 

When a trade *does* happen, `addSignal` keeps track of it, logging the details like which strategy and risk profile are involved.  Conversely, when a trade closes, `removeSignal` cleans up the record, making sure your system always knows exactly what's currently exposed to risk.

## Interface IPublicSignalRow

This interface, IPublicSignalRow, helps make trading signals more understandable for users. It builds upon the standard signal information to include the original stop-loss price that was initially set. Even if the stop-loss is adjusted later, like with a trailing stop-loss, this original value remains visible. Think of it as a way to show users the initial parameters of a trade alongside any changes that may have occurred. This provides better transparency in reports and user interfaces, ensuring clarity about the trade's starting point. The `originalPriceStopLoss` property simply holds that original stop-loss value, and it never changes.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It helps you determine how much of your capital to allocate to a trade based on your expected win rate and the typical ratio of your wins to your losses.  You'll provide values for `winRate`, representing the percentage of time you expect to win, and `winLossRatio`, which describes the average profit you make on a winning trade compared to the average loss on a losing trade. These values allow backtest-kit to automatically adjust trade sizes to optimize for growth.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, but also incorporates a stop-loss order. The `priceStopLoss` property tells the system the price at which to place a stop-loss order to limit potential losses on the trade. Think of it as specifying the level at which you're comfortable cutting your losses.

## Interface IPositionSizeATRParams

This interface defines the parameters needed when calculating position size based on the Average True Range (ATR). It's all about controlling how much of your capital you allocate to a trade based on the ATR's volatility measurement. The most important parameter is `atr`, which represents the current ATR value you're using for your calculations. Think of it as the volatility benchmark that dictates your position size.

## Interface IPersistBase

The `IPersistBase` interface defines how to manage data persistence within the backtest-kit framework. It’s all about creating, reading, updating, and deleting (CRUD) entities. 

First, `waitForInit` ensures your persistence directory is ready and any existing files are valid—it's a one-time setup process.  Then, `readValue` lets you retrieve a specific entity by its ID.  If you just need to know if an entity exists, `hasValue` quickly checks without loading the entire entity. `writeValue` provides a way to store entities, guaranteeing data consistency through atomic writes. Finally, `keys` is a handy way to get a list of all the entity IDs currently stored.

## Interface IPartialData

This data structure holds a snapshot of key information about a trading signal, designed to be easily saved and restored. Think of it as a simplified version of the full signal state, perfect for persisting data across sessions. It focuses on the profit and loss levels that have been hit, representing them as arrays instead of sets to make saving them straightforward. This allows the framework to remember where a signal has progressed, even if the system restarts.

## Interface IPartial

The `IPartial` interface helps keep track of how well a trading signal is performing, focusing on key milestones like reaching 10%, 20%, or 30% profit or loss. It's used internally by components that manage and monitor trading signals.

When a signal is making money, the `profit` method is triggered to see if any new profit levels have been hit and to share that information. A similar process happens with the `loss` method when a signal is losing money, highlighting significant loss percentages.

Finally, when a signal closes—whether it hits a target profit or loss, or simply expires—the `clear` method cleans up the tracking data and prepares the system for the next signal. This ensures that old information isn't lingering and that resources are managed efficiently.

## Interface IOptimizerTemplate

This interface helps you create the basic building blocks for your backtesting scripts. Think of it as a set of tools for generating code snippets. It provides methods for creating things like initial setup banners, messages to use with Large Language Models (LLMs), and configurations for different parts of your backtesting system – exchanges, frames (time periods), strategies, and the overall launcher. You can use these methods to quickly assemble the foundational code needed to run your trading simulations and integrate with LLMs for more advanced analysis. There are also helper functions for debugging (dumpJson) and producing text or JSON formatted output from LLMs. Each method is designed to produce TypeScript or JavaScript code as a string.

## Interface IOptimizerStrategy

This interface represents a trading strategy that’s been created using an LLM (Large Language Model), essentially capturing the full conversation that led to its creation. It holds vital information like the trading symbol the strategy is for, a unique name to identify it, and the complete history of the conversation with the LLM – including both your prompts and the LLM's responses.  You'll find the actual strategy logic itself here, which is the text output from the LLM’s prompt. Think of it as a record of how the strategy was conceived, making it easier to understand and potentially recreate or adjust.

## Interface IOptimizerSourceFn

This function is how backtest-kit gets the data it needs to run optimization tests. Think of it as a way to feed the system historical data for training purposes. It's designed to handle large datasets efficiently by allowing the system to fetch data in smaller chunks, a process called pagination. Crucially, each piece of data provided must have a unique identifier, so the system can track it properly during the optimization process.

## Interface IOptimizerSource

This interface, `IOptimizerSource`, helps you set up how your backtest data is accessed and prepared for use, particularly when working with large language models. Think of it as defining a pipeline for getting data into a format that an LLM can understand.

You give it a `name` to easily identify the data source, and an optional `note` to provide a short description. The crucial part is the `fetch` function, which is responsible for retrieving the data, and it needs to handle getting data in chunks (pagination).

You have the flexibility to customize how the messages look – both what's presented as the "user" and what’s presented as the "assistant." If you don't specify these custom formatters, the system will use pre-defined templates.

## Interface IOptimizerSchema

This schema defines the configuration needed to register an optimizer within the backtest-kit trading framework. Think of it as a blueprint for creating and evaluating trading strategies using AI.

The `note` property allows you to add a descriptive label for easy identification. `optimizerName` gives your optimizer a unique name, making it easy to reference later.

`rangeTrain` lets you specify multiple training periods, effectively creating different versions of your strategy for comparison against each other. `rangeTest` defines the timeframe you’ll use to assess how well those strategies perform in a real-world scenario.

`source` is a list of data sources—things like historical price data or news feeds—that contribute information to the AI model used to generate strategies.  `getPrompt` is a crucial function; it’s responsible for crafting the specific instruction sent to the AI based on the conversation history and data sources. 

`template` provides a way to customize the look and feel of the generated strategies, and `callbacks` allow you to monitor the optimizer's progress and performance during the process.

## Interface IOptimizerRange

This interface, `IOptimizerRange`, helps you specify the timeframe you want to use for testing or training your trading strategies. It's all about defining the beginning and end dates for your historical data. You’ll provide a `startDate` and `endDate`, both represented as dates, to clearly mark the boundaries of the period you’re interested in.  It’s also helpful to add a descriptive `note` to easily identify different time ranges later on, like "Bear market 2020" or "2023 recovery".

## Interface IOptimizerParams

This interface defines the internal configuration needed when setting up a ClientOptimizer. Think of it as a blueprint for how the optimizer will operate.

It includes a `logger` which is used to record important events and provide debugging information—essentially, it helps you understand what the optimizer is doing. 

Also, the `template` property holds the complete set of rules and methods that the optimizer will use to evaluate and adjust trading strategies. It combines your custom settings with default behaviors to ensure everything runs smoothly.

## Interface IOptimizerFilterArgs

This interface, `IOptimizerFilterArgs`, helps to specify which data to pull for backtesting. Think of it as a way to tell the system exactly which trading pairs and time periods you're interested in analyzing. You’ll define the `symbol` – like "BTCUSDT" for Bitcoin against USDT – to focus on a specific trading pair. You'll also set a `startDate` and `endDate` to limit the data to a particular range of dates. This allows you to examine performance over specific periods.

## Interface IOptimizerFetchArgs

This interface defines the information needed to retrieve data in batches, perfect for working with large datasets. It builds upon existing filter arguments by adding details for pagination. You specify how many records you want to fetch at once with the `limit` property – think of this as the page size. Then, `offset` tells the system how many records to skip, allowing you to move through the data in manageable chunks, like navigating pages. The default limit is set to 25, but you can adjust it as needed.

## Interface IOptimizerData

This interface, `IOptimizerData`, serves as the foundation for how data is provided to the backtest-kit optimizer. Think of it as a standard format for the information that fuels the optimization process. Every piece of data passed to the optimizer *must* have a unique identifier, called `id`. This `id` is crucial; it allows the system to avoid processing the same data multiple times, especially when dealing with large datasets that are retrieved in chunks.

## Interface IOptimizerCallbacks

This interface lets you listen in on what's happening during the optimization process. Think of it as a way to get notified and potentially react to key events.

You can use `onData` to check or record the strategies that have been created for a particular asset. `onCode` is your hook for observing and verifying the generated code itself.  If you're saving the code to a file, `onDump` tells you when that's done, so you can do things like track the file creation. Finally, `onSourceData` gives you a notification whenever data is pulled from a data source, allowing you to monitor or confirm that data.


## Interface IOptimizer

The `IOptimizer` interface lets you generate and retrieve strategy code for your trading bots. Think of it as a way to automate the creation of your trading logic.  You can use `getData` to pull information and prepare the groundwork for your strategies – it gathers data and sets up the building blocks for the LLM to work with.  Then, `getCode` builds the complete, runnable trading strategy code, combining all the necessary components. Finally, `dump` takes that code and saves it to a file, automatically creating any required folders, making it easy to deploy.

## Interface InfoErrorNotification

This notification lets you know about issues that pop up during background processes, but aren’t critical enough to stop everything. It's designed to keep you informed about potential problems without halting the backtesting process.

Each notification has a unique identifier (`id`) and a timestamp (`timestamp`) to help you track when it occurred.  You’ll also receive details about the error itself (`error`) and a descriptive message (`message`) explaining what happened. A `backtest` flag indicates whether the error occurred during a backtest. Think of it as a way to be alerted to smaller hiccups in your trading simulations.

## Interface IMethodContext

The `IMethodContext` interface acts like a little guide for your backtesting code, telling it exactly which configurations to use. Think of it as a set of instructions that gets passed around to ensure everything operates correctly. It holds the names of the exchange, strategy, and frame – essentially, the specific blueprints for your trading setup.  When running a backtest, this context helps the system find the right strategy, exchange, and historical data framework to work with. The frame name will be empty when running live trading, signifying that the live environment's configuration is used.

## Interface ILogger

The `ILogger` interface is your way to keep track of what's happening within the backtest-kit trading framework. It's a core tool for understanding and debugging your strategies.

You can use it to record different types of messages, from general events to detailed debugging information. 

Think of it as a system for leaving notes about what your agents are doing, how sessions are connecting, or any problems you might encounter.

The `log` method is for important events, `debug` is for detailed info when troubleshooting, `info` keeps you informed of overall progress, and `warn` alerts you to potential issues you should investigate. It's a really helpful way to monitor and audit your trading environment.

## Interface IHeatmapRow

This interface represents a row of data for the portfolio heatmap, providing a snapshot of performance for a specific trading pair. It bundles together key statistics calculated across all strategies employed for that pair. You’ll find metrics like total profit and loss, a measure of risk-adjusted return (Sharpe Ratio), and the maximum drawdown – indicating the largest potential loss.

It also includes trade-specific details, such as the total number of trades, the number of winning and losing trades, and the win rate. Other important performance indicators like average profit/loss per trade, standard deviation, and profit factor are also included. Finally, it tracks streaks of wins and losses, along with the expectancy which aims to show the average profit expected per trade.

## Interface IFrameSchema

This interface, `IFrameSchema`, acts like a blueprint for defining a specific trading timeframe within backtest-kit. Think of it as setting up the rules for how your historical data will be organized and processed. You'll use it to specify the name of your frame, add a descriptive note for yourself, and most importantly, define the start and end dates of your backtest period.  It also dictates the frequency of the data – whether you're working with daily, hourly, or minute-by-minute data, for example. You can even hook in custom functions to run at certain points in the frame’s lifecycle if you need more control.

## Interface IFrameParams

The `IFramesParams` interface helps you configure a ClientFrame, which is a core part of backtest-kit. Think of it as a set of instructions for setting up your trading environment. 

It builds upon the `IFramesSchema` and importantly includes a `logger`. This logger lets you keep an eye on what's happening inside your frame – useful for debugging and understanding how your backtest is running. It’s a way to track messages and errors, helping you troubleshoot any issues.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface helps you react to important moments in the backtest process. Specifically, you can use the `onTimeframe` callback to be notified whenever a new set of timeframes is created. This is a great spot to check if the timeframes look correct or to log some information about them for debugging. The callback will give you the generated timeframes, the start and end dates of the backtest period, and the interval used for creating the timeframes.

## Interface IFrame

The `IFrames` interface is a core piece of how backtest-kit organizes and manages data across different time periods. Think of it as the system's way of generating the timeline for your backtesting.

The key function, `getTimeframe`, is responsible for creating a list of dates—these are the specific points in time that your backtest will analyze.  It takes a symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour intervals) and returns an array of dates representing that timeframe. This function is automatically used by the backtest engine, so you generally won't interact with it directly.

## Interface IExecutionContext

The `IExecutionContext` object acts as a shared container of information during your trading strategy's execution. Think of it as a set of important details passed along to various functions, like when fetching historical data (candles), receiving market updates (ticks), or running a backtest. It tells your code things like which trading pair you're working with (the `symbol`), the precise point in time (`when`) for that operation, and crucially, whether you're simulating past performance (`backtest`) or actually trading live. This context is managed and distributed by the `ExecutionContextService`, ensuring that all related code has access to the same, up-to-date information.

## Interface IExchangeSchema

This interface describes how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to a data source and understanding how that exchange handles its data.

Each exchange you want to use will need to conform to this schema. You’ll provide functions to fetch historical candle data – like open, high, low, and close prices – and tell backtest-kit how to correctly format trade quantities and prices to align with the exchange’s specific rules.

You can also add a short note to help others understand your exchange setup. Finally, you can optionally define callbacks that allow your code to react to events, such as when new candle data becomes available. This helps backtest-kit understand how to retrieve and interpret data from the exchange.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed to set up a connection to a trading exchange within the backtest-kit framework. Think of it as the configuration details you provide to tell the system how to interact with the simulated exchange. 

It requires a logger to help track what's happening during backtesting and provide debugging information. You'll also need to supply an execution context, which provides essential details like the trading symbol, the date and time of the backtest, and whether it's a backtest or a live execution. These parameters ensure the backtest accurately reflects the conditions of the market you're analyzing.

## Interface IExchangeCallbacks

This interface lets you listen for incoming candle data from an exchange. You can provide a function that gets called whenever new candle information arrives – it will be given the symbol, the time interval (like 1 minute or 1 day), a timestamp indicating when the data started, the number of candles requested, and an array of actual candle data points. This allows you to react to data updates in real time within your backtesting environment. You can use this to perform custom processing or trigger other actions based on the incoming data.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It’s designed to provide access to historical and future candle data, essential for recreating trading scenarios. 

You can use `getCandles` to retrieve past price data for a specific trading pair and time interval, and `getNextCandles` to simulate fetching future data during a backtest. 

The interface also handles the complexities of trading by including functions to format order quantities and prices to match the exchange’s specific requirements, using `formatQuantity` and `formatPrice`. Finally, `getAveragePrice` lets you calculate the Volume Weighted Average Price (VWAP) based on recent trading activity, helping to understand market trends.


## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as the common blueprint that ensures all persistent objects share a consistent structure. It's designed to provide a standardized way to represent and interact with data that needs to be saved and retrieved, ensuring consistency across different types of entities.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard way to visualize price movements over time.  Each candlestick contains information about the opening price, the highest price, the lowest price, the closing price, and the trading volume during a specific time interval. The `timestamp` tells you exactly when that time interval began. This data is crucial for tasks like calculating VWAP and running backtests to evaluate trading strategies.

## Interface IBreakevenData

This interface, `IBreakevenData`, helps save and load information about whether a trading signal has reached its breakeven point. Think of it as a simple way to store a "yes or no" answer about breakeven status, making it easy to save and retrieve that information. When backtest-kit needs to save its state, it uses this data to create a simple boolean value for JSON storage. When things are loaded again, this saved data is used to rebuild the full breakeven state. It contains a single property, `reached`, which indicates whether breakeven has been achieved – it’s essentially a simplified version of a more complex breakeven status.

## Interface IBreakeven

This interface, IBreakeven, helps keep track of when a trading signal's stop-loss should be adjusted to the entry price – essentially, when it reaches a breakeven point. It's used by the framework to automatically move stop-losses once the trade has covered its costs.

The `check` method is what actively determines if breakeven should be triggered, looking at things like whether the price has moved enough to cover fees and if a breakeven point hasn't already been reached. It then updates the system, fires a notification, and saves the information.

Conversely, the `clear` method handles cleaning up the breakeven state when a signal is finished, making sure everything is reset and any temporary data is removed. This ensures the system is prepared for the next trading signal.

## Interface HeatmapStatisticsModel

This structure organizes the overall performance statistics for your trading portfolio, visualized as a heatmap. It breaks down key metrics across all the assets you're tracking.

You'll find an array called `symbols`, which holds the individual performance data for each asset in your portfolio, arranged in a way suitable for heatmap display. `totalSymbols` simply tells you how many different assets are included in this calculation. 

Beyond that, it provides aggregated numbers like the total profit and loss (`portfolioTotalPnl`) for your entire portfolio, the Sharpe Ratio which measures risk-adjusted return (`portfolioSharpeRatio`), and the total number of trades executed (`portfolioTotalTrades`). This gives you a quick, high-level view of your portfolio’s health.

## Interface DoneContract

This `DoneContract` acts as a notification when a background task finishes, whether it’s a backtest or a live trade execution. It gives you key information about what just completed, like the exchange it used, the name of the strategy involved, and whether it was a backtest or a live run. You'll find details like the trading symbol, ensuring you know exactly which asset was being traded. Think of it as a confirmation message detailing the successful completion of a background process.

## Interface CriticalErrorNotification

This notification signals a really serious problem that needs to stop the backtest or trading process entirely. When something goes critically wrong, you’ll receive a `CriticalErrorNotification`.

It includes details to help you understand what happened: a unique identifier (`id`) for tracking, the actual error object itself (`error`), a descriptive message (`message`) explaining the issue, a timestamp (`timestamp`) indicating when it occurred, and a flag (`backtest`) to show if it happened during a backtest. Think of it as a last resort alert – it means something significant needs to be investigated and addressed.

## Interface ColumnModel

This interface, `ColumnModel`, helps you define how data should be presented in a table. Think of it as a blueprint for each column you want to display. 

You’ll use it to specify a unique `key` for each column, a user-friendly `label` to show as the column header, and a `format` function that transforms your data into a readable string. Finally, the `isVisible` function allows you to control whether a column is shown or hidden, potentially based on some condition. This gives you a lot of flexibility in customizing your table's appearance.

## Interface BreakevenStatisticsModel

This model holds all the information about breakeven events that occurred during a backtest. It essentially gives you a detailed look at how often your trading strategy reached breakeven and what those events looked like. You'll find a complete list of individual breakeven events, each with its own specific details, alongside a simple count of the total number of breakeven events. Think of it as a report card for your strategy’s breakeven performance.

## Interface BreakevenEvent

The BreakevenEvent provides a standardized way to track when trading signals have reached their breakeven point, which is a crucial moment in evaluating a strategy's performance. It bundles together key details about this event, such as the exact time it occurred, the trading symbol involved, the name of the strategy that generated the signal, and a unique identifier for that signal. You'll also find information like the position type (long or short), the current market price at breakeven, and the original entry price that marks the breakeven level itself. Finally, a flag indicates whether the event occurred during a backtest or in a live trading environment.

## Interface BreakevenContract

The `BreakevenContract` represents a significant milestone in a trading strategy – when the signal’s stop-loss is moved back to the original entry price. Think of it as a risk reduction event; the price has moved favorably enough to cover the initial transaction costs. This notification is designed to help track how strategies are managing risk and performing over time.

Each breakeven event contains detailed information, including the trading pair’s symbol, the strategy’s name, the exchange and timeframe it’s running on, and comprehensive data about the signal itself. You'll also find the current price at which breakeven was achieved and whether the event occurred during a backtest or live trading. 

Essentially, the `BreakevenContract` is a focused data package that’s used for generating reports and allowing users to be notified when these important risk-reducing moments happen within their strategies. It's a reliable signal, only occurring once per signal to prevent redundant information.

## Interface BootstrapNotification

This notification signals that the notification system is ready to go. Think of it as the starting gun for tracking events. It includes a unique identifier for the notification session and a timestamp indicating when the system became active. It essentially marks the beginning of the notification tracking period.

## Interface BacktestStatisticsModel

This model holds all the key statistical information generated during a backtest, giving you a clear picture of how your trading strategy performed. You'll find a detailed list of every trade that was closed, along with the total number of trades executed. It tracks wins and losses, calculating important metrics like win rate (the percentage of profitable trades) and average P&L per trade. 

Beyond simple win/loss, it provides insights into overall profitability with the total P&L across all trades. Risk is assessed through standard deviation (volatility) and the Sharpe Ratio, which measures risk-adjusted returns – allowing you to compare your strategy's performance against benchmarks.  The certainty ratio highlights the balance between average winning and losing trade sizes, while expected yearly returns give a sense of potential annual gains.  Keep in mind that if any calculation encounters issues (like dividing by zero), the corresponding value will be null, indicating that the metric isn't reliable.

## Interface BacktestDoneNotification

This notification signals that a backtest has finished running. It's sent when the backtesting process is complete, providing key details about the test. You'll find information like a unique ID for the backtest, the exact time it concluded, and confirmation that it was indeed a backtest. It also includes specifics about the trading symbol, the strategy used, and the exchange involved in the backtest. This notification gives you all the essential information you need to track and understand the results of a completed backtest.
