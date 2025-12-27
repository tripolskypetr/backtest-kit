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

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification that a specific trading strategy, running under a particular walker's control, needs to be paused or halted. It’s useful when you have several strategies running concurrently, allowing you to precisely target which one should be interrupted. The message includes the trading symbol, the name of the strategy, and the name of the walker responsible, providing clear identification for the system to act upon.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the outcomes of backtesting different trading strategies. Think of it as a container for comparing how various strategies performed. Inside, you’ll find a list of strategy results, each detailing the performance metrics for a specific strategy. This makes it easier to analyze and draw conclusions about which strategies are most effective.

## Interface WalkerContract

The WalkerContract describes updates as your backtesting framework runs comparisons between different strategies. Think of it as a progress report during the testing process. It tells you which strategy just finished running, along with key details like the exchange, symbol being tested, and the name of the strategy itself. 

You’ll also see performance statistics for that strategy, along with the metric it was trying to optimize. Crucially, this contract also keeps track of the best-performing strategy found *so far*, how many strategies have been tested, and the total number of strategies planned for evaluation. This lets you monitor the ranking and progress of your strategy comparison.

## Interface WalkerCompleteContract

This interface represents the final notification you receive after a backtesting process has finished. It bundles together all the key information about the completed test, giving you a clear picture of the overall results. You'll find details like the name of the backtesting setup (the "walker"), the financial instrument being tested (the "symbol"), and the data source used.

It also tells you which metric was used to judge the strategies, how many strategies were evaluated, and crucially, which strategy performed the best. You'll get the specific metric value of that winning strategy, along with a full set of statistics detailing its performance. Essentially, it’s a one-stop shop for understanding the outcome of your backtest run.

## Interface ValidateArgs

This interface, `ValidateArgs`, acts as a blueprint for ensuring the names you're using in your backtesting setup are correct. Think of it as a safety net to prevent errors caused by typos or incorrect references to your exchanges, timeframes, strategies, risk profiles, sizing methods, optimizers, and parameter sweep configurations. Each property within `ValidateArgs` represents one of these components, and it expects you to provide an enum object for that specific component, which will be used to confirm the name is valid.  Essentially, it helps you make sure all the pieces of your backtest fit together properly by verifying the names of the key components.

## Interface TickEvent

The `TickEvent` provides a single, consistent format for all tick-related data generated during backtesting. Think of it as a standardized record of everything that happens during a trade, from the initial signal to the final close. 

Each event includes details such as the exact time it occurred (`timestamp`), the type of action being performed (`action`), and the specific trading pair involved (`symbol`). Signals are identified by a unique `signalId`, and you'll find information about the trade’s `position`, any notes associated with the signal (`note`), and the price at which the trade was opened (`openPrice`). 

For active trades, you can track progress towards take profit and stop loss with `percentTp` and `percentSl`, respectively. When a trade is closed, the `closeReason` and `duration` help explain the outcome, along with the percentage profit or loss (`pnl`). This unified structure makes it much easier to analyze and report on backtest results.

## Interface SignalData$1

This object holds the details of a completed trading signal, perfect for analyzing performance and understanding why trades were taken. Each signal is identified by a unique ID and associated with a specific trading strategy. You'll find information about the asset being traded (the symbol), whether the trade was a long or short position, and the percentage profit or loss (PNL) generated. It also explains why the signal was closed, and crucially, the exact timestamps of when the trade began and ended, allowing you to correlate it with other market data. Essentially, this is a snapshot of a single trade's lifecycle, captured for detailed review.


## Interface ScheduleStatisticsModel

The `ScheduleStatisticsModel` helps you understand how your scheduled signals are performing. It gives you a complete picture of your scheduled events, showing you how many signals were scheduled, how many were activated, and how many were cancelled. 

You can track overall activity with the total event counts. The model also calculates key performance indicators like the cancellation rate (how often signals are cancelled) and activation rate (how often signals become active), presented as percentages. It also measures the average wait times for both cancelled and opened signals, giving you insights into delays or efficiency in your scheduling process. Think of it as a dashboard for understanding the health and effectiveness of your scheduled signal management.

## Interface ScheduledEvent

This data structure neatly packages all the important details about scheduled, opened, or cancelled trading events, making it easy to generate reports and analyze performance. Each event includes a timestamp marking when it occurred, along with the specific action taken – whether it was scheduled, opened, or cancelled. You'll find key information like the trading pair (symbol), a unique signal ID, the type of position, and any notes associated with the signal.

Furthermore, for each event, you can access details like the current market price, the planned entry price, take profit and stop loss levels. If an event was cancelled or opened, the duration of the trade and the close timestamp are also provided. Essentially, it's a single place to find everything you need to understand what happened with a given trade.

## Interface RiskStatisticsModel

This model holds statistics about risk rejections, helping you monitor and understand your risk management system's performance. It gathers data from individual risk events, giving you a detailed breakdown of what triggered those rejections.

You'll find a complete list of all the risk events that occurred, along with the total number of rejections.  The model also categorizes these rejections, showing you how many happened for each trading symbol and which strategies were most often involved in triggering them. This helps pinpoint areas where your risk controls might need adjustment.

## Interface RiskEvent

This data structure holds information about situations where a trading signal was blocked due to risk management rules. Each time a signal is rejected, a `RiskEvent` is created to record the details. 

You’ll find things like the exact time the rejection happened, the symbol being traded (e.g., BTC/USDT), and specifics about the signal that was rejected. It also includes the name of the trading strategy involved, the exchange used, the current market price at the time, and how many positions were already open. 

A unique ID is assigned to each rejection, along with a reason explaining why the signal was rejected.  Finally, a flag indicates whether the event occurred during a backtest or in live trading conditions.

## Interface RiskContract

The RiskContract provides information about signals that were blocked due to risk management checks. It's a record of when the system prevented a trade from happening because it exceeded defined risk limits.

Think of it as a log of risk interventions – it only appears when a signal is actively rejected, not just when it’s within acceptable boundaries.

Each RiskContract contains details like the trading pair (symbol), the specifics of the signal that was blocked (pendingSignal), the name of the trading strategy that initiated the signal (strategyName), and the exchange involved (exchangeName). You’ll also find the price at the time of rejection (currentPrice), how many other positions were already open (activePositionCount), and a unique ID for tracking (rejectionId).

Crucially, there’s a human-readable explanation (rejectionNote) describing *why* the signal was rejected, and a timestamp (timestamp) to pinpoint when it happened.  A flag indicates whether the event occurred during a backtest or in live trading (backtest). This allows different systems, like reporting services or user notifications, to react to and learn from these rejected signals.

## Interface ProgressWalkerContract

This interface, `ProgressWalkerContract`, helps you keep an eye on how a background process is going within the backtest-kit framework. It’s like a progress report, letting you know what’s happening as strategies are being analyzed. 

You'll see details like the walker's name, the exchange and frame being used, and the specific trading symbol involved. Crucially, it tells you the total number of strategies being processed, how many have been handled already, and the overall percentage of completion. This allows you to monitor and potentially react to long-running tasks without waiting for them to finish.


## Interface ProgressOptimizerContract

This interface helps you keep an eye on how your optimization process is going. It provides updates during the execution, letting you know which optimizer is running, what symbol it's working on, and how much is left to do. You’ll see the total number of data sources the optimizer needs to handle, the number it has already processed, and a percentage indicating the overall completion progress – all expressed as a value between 0.0 and 1.0. This allows for better monitoring and understanding of the optimizer's workflow.

## Interface ProgressBacktestContract

This contract helps you keep an eye on how your backtest is running. It provides updates during the backtesting process, letting you know which exchange and strategy are being used, and for what symbol. You'll see the total number of historical data points (frames) the backtest will analyze, as well as how many have already been processed.  A completion percentage is also included, giving you a quick visual indication of how much longer the backtest is expected to take.

## Interface PerformanceStatisticsModel

This model holds all the performance data collected during a backtest run, organized by the strategy being tested. You’ll find the strategy's name here, along with the total number of performance events and the overall time it took to calculate these statistics. The `metricStats` property breaks down the data even further, grouping statistics based on the type of metric being tracked. Finally, `events` contains the complete list of raw performance data points that were recorded.

## Interface PerformanceContract

This interface, `PerformanceContract`, helps you keep tabs on how quickly different parts of your trading system are running. Think of it as a way to measure and profile your code.

Each time a significant operation happens – like placing an order or calculating an indicator – a `PerformanceContract` event is generated, giving you a snapshot of that process. 

You'll find details like when the event occurred (timestamps), how long the operation took (duration), and which strategy, exchange, and symbol were involved. It also tells you whether the operation happened during a backtest or in a live trading environment. This information allows you to pinpoint slow areas and optimize your system for better overall performance.

## Interface PartialStatisticsModel

This data model holds information about partial profit and loss events during a backtest. It essentially gives you a breakdown of how many times your trading strategy made a profit, how many times it experienced a loss, and a complete list of all those individual events. You'll find the total count of events, including both profits and losses, alongside the specific number of profitable and losing trades. The `eventList` property provides all the details of each profit/loss event encountered.

## Interface PartialProfitContract

This interface describes what happens when a trading strategy reaches a profit milestone, like 10%, 20%, or 30% profit. It's used to keep track of how a strategy is performing and when take-profit orders might be executed. 

Each time a profit level is hit, this information is packaged up and sent out, including details like the trading pair (e.g., BTCUSDT), the strategy's name, and the current price.  You'll see the percentage profit achieved (10%, 20%, etc.) and whether the event occurred during a backtest (using historical data) or live trading.

The information provided includes the full details of the trading signal that triggered the event, as well as the exact time the milestone was reached.  The system makes sure you only receive each profit level event once for each trading signal, even if prices jump significantly. Various components, like reporting tools and user-defined functions, can subscribe to these events to monitor and analyze trading activity.

## Interface PartialLossContract

The PartialLossContract represents notifications about when a trading strategy experiences a partial loss – like reaching a -10%, -20%, or -30% drawdown. Think of it as a way to keep track of how much a strategy is losing before a full stop-loss is triggered.

Each notification includes important details such as the trading pair involved (symbol), the name of the strategy generating the signal, the exchange being used, and comprehensive information about the signal itself. It also tells you the current market price at the time of the loss, the specific loss level reached (e.g., -20%), and whether the event occurred during a backtest or live trading.

These notifications are designed to be used by services that create reports and by users who want to monitor their strategy's performance in real-time. The system avoids sending duplicate notifications for the same loss level, even if prices drop very quickly, ensuring you only receive relevant updates. Timestamp information provides critical context for when the event occurred – either the exact real-time moment in live trading or the timestamp of the candle that triggered the level during a backtest.

## Interface PartialEvent

This interface represents a snapshot of a profit or loss milestone reached during a trading simulation or live trade. It bundles together key pieces of information so you can easily create reports and analyze performance.  You'll find details like the exact time the event occurred, whether it was a profit or loss, the trading pair involved, and the strategy that triggered it.  It also includes the signal ID, the position type (long or short), the current market price at the time, and the specific profit/loss level achieved (like 10%, 20%, etc.).  Finally, it indicates whether the event happened during a backtest or in a live trading environment.

## Interface MetricStats

This object helps you understand how a particular performance measurement is behaving over time. It gathers a bunch of key statistics about that measurement, like how often it happens (count), how long it takes (total duration, average duration, minimum and maximum durations), and how spread out those durations are (standard deviation, median, and percentiles like p95 and p99). 

You'll also find details on timing between events, like average, minimum, and maximum wait times. Essentially, it’s a comprehensive snapshot of a metric's performance characteristics. Each property gives you a different angle on understanding the behavior you're tracking.

## Interface MessageModel

This `MessageModel` helps keep track of the conversation happening between a user and an AI. Think of it as a way to record each turn in the chat.

Every message has a `role` which tells you who sent it – whether it's the system providing instructions, the user asking a question, or the AI responding.  The `content` property simply holds the actual text of that message, the words that were spoken or typed. It's designed to be used within the Optimizer to build prompts and remember what's already been said.

## Interface LiveStatisticsModel

This model provides a detailed view of your trading performance while the system is live. It tracks everything from the total number of events, like when signals are opened or closed, to more complex metrics that help you understand risk and return. You'll find a list of every event with its specifics, along with key statistics such as the win rate, average profit per trade, and total profit generated.

Several metrics are calculated to assess the quality of the trading, including the Sharpe Ratio and Annualized Sharpe Ratio, which factor in volatility. The Certainty Ratio helps evaluate the consistency of winning versus losing trades. Finally, the model also estimates your expected yearly returns based on trading patterns.  All numerical values are carefully managed; if a calculation is unreliable, it will be represented as null, ensuring you're only working with solid data.

## Interface IWalkerStrategyResult

This interface defines the structure for the results you get back when running a strategy through a backtest comparison. Each strategy you test will produce a result object following this pattern. 

It includes the strategy's name so you know which strategy the results belong to. 

You'll also find a set of statistics – things like total return, Sharpe ratio, and drawdown – which gives a detailed view of the strategy's performance.

A key value, `metric`, represents the score used to compare strategies against each other, and it might be null if something went wrong during the calculation. Finally, the `rank` property tells you where the strategy sits in the overall comparison, with the highest-performing strategy ranked as number 1.

## Interface IWalkerSchema

The `IWalkerSchema` helps you set up A/B testing for different trading strategies within backtest-kit. Think of it as a blueprint that tells the framework how to run comparisons between several strategies.

You give it a unique name to identify the testing setup, and can add a note for your own reference. It also specifies which exchange and timeframe to use for all the strategies involved in the test.

The core of the schema is the list of strategy names you want to compare—these strategies need to be registered beforehand. You can also choose which metric, like Sharpe Ratio, to optimize for, and optionally provide callbacks for certain events during the backtesting process. Essentially, this structure ensures a consistent and controlled comparison of your trading strategies.

## Interface IWalkerResults

This interface holds all the information gathered after a backtest kit walker has finished its comparisons of different trading strategies. It essentially packages up the results of the entire process. You’ll find details like the specific trading symbol that was tested, the exchange used for the backtest, the name of the walker itself (which defines the testing parameters), and the name of the frame, which outlines the data and calculations used. It’s a central place to find a summary of a backtest run.

## Interface IWalkerCallbacks

This interface lets you listen in on what's happening as your trading strategies are being tested. You can use it to track the progress and get notified about important events. 

Specifically, you'll get a notification when each strategy begins (`onStrategyStart`), when it finishes (`onStrategyComplete`), or if it encounters a problem (`onStrategyError`). Finally, `onComplete` will let you know when the entire testing process is done and provides you with a summary of the results. This allows you to build custom reporting or monitoring around your backtesting runs.

## Interface IStrategyTickResultScheduled

This interface represents a special kind of tick result, indicating that a trading strategy has generated a signal that's been scheduled to execute when a specific price is reached. Think of it as a "wait and see" moment – the strategy has decided it wants to trade, but it's holding off until the price hits a certain level.

The result includes details like the strategy's name, the exchange being used, the symbol (like BTCUSDT), the current price at the time the signal was created, and whether this is happening during a backtest or a live trade. The core piece of information is the `signal` itself, which contains all the specifics about the scheduled trade. It's a key notification for strategies that operate on delayed or scheduled execution logic.

## Interface IStrategyTickResultOpened

This interface represents a notification you receive when a new trading signal is created within your backtest or live trading system. It tells you that a signal has just been generated and validated, and is now ready to be used. 

You'll find important details about this signal, like its unique identifier, the name of the strategy that created it, the exchange it's associated with, and the trading symbol (e.g., BTCUSDT).  The current price at the time the signal opened is also included, as well as whether this event originated from a backtest or a live trading environment. Think of it as confirmation that a new trade opportunity has been identified and prepared.

## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an idle state – meaning it's not currently generating a trading signal. It provides information about the context of that idle period, letting you track when and why your strategy isn’t actively trading. You'll see the strategy's name, the exchange it's connected to, the trading symbol (like BTCUSDT), and the current price at the time of the idle state. There's also a flag to indicate whether this is happening during a backtest or in a live trading environment, and crucially, the signal itself is recorded as null, confirming the idle condition.

## Interface IStrategyTickResultClosed

This interface, `IStrategyTickResultClosed`, represents what happens when a trading signal is closed, providing a complete picture of the event. It essentially tells you how a trade concluded, including why it was closed (like reaching a profit target or a stop-loss level), the price at which it closed, and how much profit or loss was made. You’ll see details like the original signal parameters, the strategy and exchange involved, and whether this event occurred during a backtest or live trading. It also provides a profit and loss breakdown, which is crucial for analyzing strategy performance.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – meaning it didn't result in a trade being placed. This might happen because the signal didn't activate as expected, or because it triggered a stop-loss before a position could even be opened. 

The data included tells you exactly *why* the signal was cancelled, the details of the signal itself, the price at the time of cancellation, and the timestamp of the event. You'll also find information like the strategy name, exchange, and trading symbol to help you track and analyze these cancellations within your backtesting or live trading environment. The `backtest` property indicates whether this cancellation occurred during a backtest or in a live trading scenario.

## Interface IStrategyTickResultActive

This interface represents a tick event in the backtest-kit framework, specifically when a strategy is actively monitoring a signal and waiting for a take profit (TP), stop loss (SL), or time expiration. It provides detailed information about the situation, including the strategy's name, the exchange and symbol being traded, and the current price being monitored. You'll see the progress towards both the take profit and stop loss targets as percentages. Knowing whether this event is part of a backtest simulation or a live trade is also included. The `action` property clearly indicates this is an "active" monitoring state.

## Interface IStrategySchema

This interface describes the structure of a trading strategy you register within the backtest-kit framework. Think of it as a blueprint for how a strategy generates trading signals.

Each strategy needs a unique name to identify it. You can also add a note for yourself or others documenting the strategy’s logic.

The `interval` property lets you control how often the strategy generates signals, preventing it from overwhelming the system.

The core of the strategy is the `getSignal` function. This function takes the symbol (asset) and a date as input and returns a trading signal, or nothing if no signal is available.  If you want to delay a trade until a specific price is reached, you can provide an open price; otherwise, the trade executes immediately.

You can also specify optional callbacks to be triggered at key points in a trade, such as when a position is opened or closed.  

Finally, you can associate the strategy with specific risk profiles, either a single one or a list of them, to help manage potential risks.

## Interface IStrategyResult

This interface, `IStrategyResult`, is designed to hold all the key information about a trading strategy after it's been tested. Think of it as a single row in a table comparing different strategies.  Each result will have a name, identifying which strategy it represents. It also includes a comprehensive set of statistics detailing how the strategy performed during the backtest. Finally, it stores a numerical value representing the metric used to optimize the strategy, which helps in ranking strategies against one another.

## Interface IStrategyPnL

This interface, `IStrategyPnL`, represents the result of a trading strategy's profit and loss calculation. It gives you key details about how much your strategy made or lost, and importantly, factors in realistic trading costs. 

You'll find the overall profit or loss expressed as a percentage, showing whether it's a gain or loss and its magnitude.  The `priceOpen` property tells you the actual price at which your strategy entered a trade, already adjusted to account for fees and slippage. Similarly, `priceClose` shows the price at which the trade exited, also reflecting those costs. This lets you see the true impact of your trades beyond just the raw price movements.

## Interface IStrategyCallbacks

This interface lets you hook into important events happening during a trading strategy's lifecycle. Think of it as a way to be notified about what’s going on – when a signal starts, when it's actively being watched, when there's nothing happening, or when a signal finally closes.

You can register functions to be called at specific moments, such as when a new signal is opened, when a signal is being actively monitored, or when a scheduled signal is cancelled. Each callback gives you access to relevant data, like the symbol being traded, signal details, current prices, and whether you're in a backtesting mode.

There are also callbacks for more specialized situations like partial profits, partial losses, or writing signal data for persistence during testing. This allows for custom logic to be triggered at these key milestones, enabling greater control and flexibility in your strategies.

## Interface ISizingSchemaKelly

This defines a way to calculate trade sizes using the Kelly Criterion, a method that aims to maximize growth rate.  If you're using this, it means you want your system to determine how much to invest in each trade based on your perceived edge. The `kellyMultiplier` property controls how aggressively the Kelly Criterion is applied – a lower value like 0.25 (the default) is a more conservative approach, while a higher value would risk larger drawdowns in exchange for potentially higher returns. Essentially, it’s a setting to fine-tune the risk level of your automated trading strategy.

## Interface ISizingSchemaFixedPercentage

This schema defines a very straightforward way to size your trades: you'll always risk a fixed percentage of your capital on each one. The `method` property simply confirms you're using the fixed-percentage sizing approach.  The key setting is `riskPercentage`, which dictates what that percentage is – for example, a value of `2` means you'll risk 2% of your account balance per trade. This is useful when you want consistent risk exposure regardless of price fluctuations.

## Interface ISizingSchemaBase

This interface, ISizingSchemaBase, defines the fundamental structure for sizing configurations within the backtest-kit framework. Think of it as a template for how much of your capital you'll risk on each trade. 

It includes key properties like `sizingName`, which acts as a unique ID for the sizing strategy, and a `note` field for adding any helpful developer commentary.  You’ll find settings for controlling position size, including `maxPositionPercentage` to limit risk as a percentage of your account balance, and `minPositionSize` and `maxPositionSize` to specify absolute size boundaries.  Finally, `callbacks` allow you to hook into different points in the sizing process for custom logic.

## Interface ISizingSchemaATR

This schema defines how your trading strategy determines the size of each trade based on the Average True Range (ATR). It’s designed for strategies that want to manage risk by scaling position sizes according to market volatility.

You'll specify a `method` of "atr-based" to indicate that this sizing approach is being used.  Then, `riskPercentage` lets you define what portion of your capital you're willing to risk on each trade—usually expressed as a percentage between 0 and 100. Finally, `atrMultiplier` controls how the ATR value is used to calculate the distance for your stop-loss orders, effectively linking position size to volatility. Higher multipliers will result in wider stops and potentially larger positions when the market is very volatile.

## Interface ISizingParamsKelly

This interface defines the parameters needed to calculate trade sizes using the Kelly Criterion method. It's used when setting up how much of your capital to risk on each trade. 

You’ll need to provide a logger, which helps track and debug the sizing process – essentially, it’s a tool for seeing what's happening behind the scenes.

## Interface ISizingParamsFixedPercentage

This interface defines how to set up your trading strategy's sizing – specifically, how much of your capital to use for each trade – using a fixed percentage. It’s all about consistently risking a certain proportion of your funds with every trade.

The `logger` property allows you to connect a logging service so you can keep track of what's happening and debug any issues. You'll want this to help monitor your sizing calculations and ensure they're working as expected.


## Interface ISizingParamsATR

This interface defines the settings you can use to control how much of your capital is used for each trade when employing an Average True Range (ATR) based sizing strategy. It's designed for use when setting up your trading parameters within the backtest-kit framework. You'll provide a logger object here to receive helpful debugging information about the sizing calculations. The logger helps you monitor and understand how your ATR sizing is working during backtesting.

## Interface ISizingCallbacks

This section describes callbacks you can use to monitor and potentially influence how your trading strategy determines the size of each trade. The `onCalculate` callback is triggered right after the framework calculates the position size. Think of it as a notification – it allows you to peek inside the calculation process, perhaps to log the size being taken or to make sure it's behaving as expected. You receive the calculated quantity and parameters used in the size calculation, letting you understand what led to that particular size.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizes using the Kelly Criterion. It’s all about determining how much to risk on each trade based on your historical performance. You’ll need to provide your win rate, which is the proportion of winning trades, and your average win/loss ratio - essentially, how much you win compared to how much you lose on each trade. These values are used to compute an optimal sizing strategy.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the settings needed for a trading strategy that uses a fixed percentage of your available capital for each trade.  You specify the calculation method as "fixed-percentage" and also provide the price at which you want to place a stop-loss order.  Essentially, it tells the backtest system how to determine the trade size based on a percentage and sets a stop-loss price for risk management.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed when figuring out how much to trade. It includes the trading pair you're working with, like "BTCUSDT," your current account balance, and the price at which you plan to initially buy or sell. Think of it as the foundational data for any sizing calculation – it's a shared starting point for determining trade sizes across different strategies. It ensures all sizing methods have access to the same essential data.

## Interface ISizingCalculateParamsATR

This interface defines the information needed when calculating trade sizes using an ATR (Average True Range) based method. To use this approach, you’ll specify that your sizing method is "atr-based" and provide a numerical value representing the current ATR. Think of the ATR as a measure of volatility – the higher the ATR, the more the price is fluctuating, and this value helps determine an appropriate trade size.

## Interface ISizing

The `ISizing` interface is all about figuring out how much of an asset your trading strategy should buy or sell. It's a core part of how backtest-kit executes trades.

Specifically, the `calculate` property is the key here. It’s a function that receives information about your trade – things like your risk tolerance, the price of the asset, and the amount you're willing to risk – and then it returns the size of the position you should take. Think of it as the engine that determines "how much to trade" based on your strategy's rules.


## Interface ISignalRow

This interface represents a complete trading signal, the kind you'd work with after a signal has been verified and is ready to be used. Each signal gets a unique ID, a universally recognizable code, to track it throughout the system. You'll also find the entry price, the exchange being used, and which strategy generated the signal. 

Important details like when the signal was initially created and when it entered a pending state are also stored here.  Finally, it includes the trading pair symbol, like "BTCUSDT," and an internal flag to indicate if the signal was scheduled.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, the information used to initiate a trade.  It defines the core elements of a signal, like whether you should buy ("long") or sell ("short"). You’ll find details about the entry price, the target price for taking profits, and the price at which to cut your losses (stop loss).  A human-readable note field lets you record *why* you generated the signal. The system automatically creates a unique ID for each signal, but you can also provide one. Finally, `minuteEstimatedTime` gives an idea of how long the trade is expected to last.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's waiting for a specific price to be reached before a trade can be executed. Think of it as a signal on hold – it’s not active yet. It builds upon the basic `ISignalRow` structure.

Essentially, the system will hold onto this signal until the market price hits the `priceOpen` value. When that happens, the pending signal becomes a regular, active signal. 

A key detail is that the time the signal was initially scheduled (`scheduledAt`) will be used as its pending time until the price is triggered; then, the actual pending time is updated. The `priceOpen` property simply defines the target price the market needs to reach for the signal to activate.

## Interface IRiskValidationPayload

This interface, `IRiskValidationPayload`, holds the information needed to assess risk when a trade is about to happen. Think of it as a package delivered to your risk management functions. 

It includes the signal that triggered the potential trade (`pendingSignal`), so you know what's being considered.  You also get details about the overall portfolio, specifically how many positions are already open (`activePositionCount`) and a list of those existing positions (`activePositions`). This allows for a complete picture when deciding if the new trade is safe and aligned with your risk policies.

## Interface IRiskValidationFn

This defines a special function that's used to check if a trade request is safe and reasonable. Think of it as a gatekeeper for your trading strategies. If the function thinks everything looks good, it doesn’t do anything – the trade proceeds. However, if it spots a problem, like a potential over-exposure or a violation of a rule, it either returns a specific object indicating the reason for rejection or throws an error, which is then handled in a standardized way to explain why the trade was blocked.

## Interface IRiskValidation

This interface helps you define how to check if your trading risks are acceptable. Think of it as a way to create rules that your backtest system follows to make sure you're not taking on too much risk.

You specify the actual validation logic using a function, which is the `validate` property. This function will do the heavy lifting of checking your risk parameters.

To make things clearer, you can add a `note` to explain what the validation rule is for and why it's important. This is great for keeping track of your validation logic and making sure others (or your future self!) understand it.

## Interface IRiskSchema

This interface, `IRiskSchema`, is how you define and register custom risk controls within the backtest-kit framework. Think of it as a blueprint for how you want to manage risk at the portfolio level. 

It allows you to create unique risk profiles with a specific identifier and add descriptive notes for other developers. You can also specify callback functions to be triggered during the risk assessment process, like when a trade is rejected or allowed. The core of the schema lies in its validations, where you'll define the actual rules and logic that govern your risk management strategy – these are custom functions or objects that check the feasibility of a trade.


## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a trading strategy's risk validation failed. It's like a detailed explanation when something goes wrong during the risk check. Each failure gets a unique `id` so you can track it. The `note` property provides a clear, human-friendly message describing the specific reason for the rejection, making it easier to troubleshoot and fix the issue.

## Interface IRiskParams

This interface defines the settings you provide when setting up your risk management system. It includes a logger for tracking and debugging, a flag to indicate whether you're in a testing environment (backtest) or live trading, and a special callback function. This callback gets triggered when a trading signal is blocked due to risk limits, allowing you to react to these rejections and potentially emit custom events. Essentially, it lets you customize how your system handles situations where trades are prevented by risk constraints.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to decide whether a new trade should be allowed. Think of it as a gatekeeper, consulted before a signal is actually created. It bundles together essential data about the potential trade, including the symbol being traded (like "BTCUSDT"), the details of the signal itself, the name of the strategy making the request, the exchange involved, the current price, and the time of the check.  Essentially, it's a collection of parameters passed from the client strategy to perform a safety check and ensure that the trade aligns with pre-defined risk rules.

## Interface IRiskCallbacks

This section defines optional functions you can use to get notified about risk-related events during trading. If a trade signal fails a risk check, the `onRejected` function will be triggered, letting you know which symbol was rejected and providing details about the risk check. Conversely, if a trade signal successfully passes all risk checks, the `onAllowed` function will be called, telling you which symbol was approved and offering the same detailed information. These callbacks allow you to monitor and potentially react to risk assessments in real-time.

## Interface IRiskActivePosition

This interface, `IRiskActivePosition`, describes a single trading position that's being monitored for risk management purposes. Think of it as a snapshot of a trade – it tells you who initiated it (the strategy name), where it was placed (the exchange), and when it started.  It also includes details about the signal that triggered the trade itself.  Essentially, this provides a standardized way to track positions across different trading strategies for a more complete risk assessment. You'll find information like the opening timestamp and the exchange used to place the trade all neatly organized here.

## Interface IRisk

This interface, `IRisk`, is your gatekeeper for managing risk during trading. It allows your strategies to check if a trade is permissible based on pre-defined risk rules. You'll use it to ensure your trading stays within acceptable boundaries.

The `checkSignal` method is how you verify if a potential trade should proceed, providing details about the trade and receiving a yes or no answer. To keep track of what’s happening, you’ll use `addSignal` to register when a new position is opened and `removeSignal` when a position closes, updating the system’s understanding of your exposure. These methods help maintain a clear picture of risk exposure throughout your backtesting process.


## Interface IPositionSizeKellyParams

The `IPositionSizeKellyParams` interface helps you define how much to size your trades using the Kelly Criterion. It’s all about figuring out your bet size based on how often you win and how much you win compared to how much you lose. You’ll provide a `winRate`, which represents the percentage of times you expect to win a trade, and a `winLossRatio`, reflecting your average profit compared to your average loss. These two values together help the framework calculate a safe and potentially profitable position size.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital for each trade, and includes a stop-loss price. Specifically, `priceStopLoss` tells the system at what price to place your stop-loss order to protect against losses. You'll use these parameters to configure how much of your portfolio is allocated to a trade and how to manage risk.

## Interface IPositionSizeATRParams

This interface defines the settings needed for calculating position size using the Average True Range (ATR) method.  It contains a single, crucial piece of information: the current ATR value. This value, represented by the `atr` property, is a number reflecting the average price volatility over a specific period and is used directly in the position sizing calculation. Think of it as a key ingredient in determining how much capital to allocate to a trade based on the current level of market risk.


## Interface IPersistBase

This interface defines the basic operations needed to store and retrieve data persistently. Think of it as a foundation for managing your trading data – whether that's historical prices, trade records, or configuration settings. 

The `waitForInit` method sets up the storage area initially and makes sure this only happens once.  `readValue` lets you fetch an entity by its ID, while `hasValue` simply checks if something exists at a specific ID. Finally, `writeValue` is used to save entities to storage, ensuring that the writing process is reliable and consistent. This whole system helps keep your backtesting environment organized and reliable.

## Interface IPartialData

This interface, `IPartialData`, is designed to save and load trading data, specifically the profit and loss levels, in a way that can be easily stored and retrieved. It takes the data usually held in sets within the trading system and transforms it into arrays so that it can be saved as JSON. Think of it as a snapshot of key data points, like where profit and loss targets have been hit, allowing the system to remember its progress even after being shut down. The `profitLevels` property holds the profit levels reached, while `lossLevels` tracks the loss levels hit – both are represented as arrays of `PartialLevel` objects.

## Interface IPartial

The `IPartial` interface is all about keeping track of how your trading signals are performing financially. It helps you monitor progress towards profit or loss milestones, like hitting 10%, 20%, or 30% gains or losses.

The `profit` method handles situations when a signal is making money, ensuring you're notified when it reaches those key profit levels and avoiding duplicate notifications. Similarly, the `loss` method does the same for when a signal is losing money.

Finally, the `clear` method cleans up the records when a signal finishes trading, whether it's due to a take profit, stop loss, or time expiry. This ensures the system stays tidy and efficient.

## Interface IOptimizerTemplate

This interface, IOptimizerTemplate, acts as a blueprint for creating code snippets and messages used within the backtest-kit framework. Think of it as a set of tools to help you build and structure your trading experiments.

It provides methods for generating different pieces of code, such as initialization banners, user and assistant messages for interacting with Large Language Models, and configurations for key components like Walkers, Exchanges, Frames, and Strategies. These methods allow you to customize the structure and content of your backtesting setup.

Specifically, you can use these tools to create helper functions for debugging (dumpJson, text, json), define how your system will interact with exchanges and timeframes, and set up the logic for your trading strategies, potentially integrating them with LLMs for more advanced decision-making. Finally, it handles generating the launcher code that brings everything together to run your backtest.

## Interface IOptimizerStrategy

This interface describes the data structure representing a trading strategy created using an LLM (Large Language Model). Think of it as a container holding everything needed to understand how a particular strategy was formed.  It includes the trading symbol the strategy is intended for, a unique name for easy identification and tracking, and the complete conversation history with the LLM that led to the strategy's creation – including the user's initial requests and the LLM’s responses.  Crucially, it also holds the actual strategy description or code, the result of the LLM’s generation process, which you’ll use to define the trading logic.

## Interface IOptimizerSourceFn

The `IOptimizerSourceFn` is a function that provides the data needed to train and optimize your trading strategies. Think of it as a connection to your historical trading data. It's designed to handle large datasets efficiently by fetching data in smaller chunks, a process called pagination. Crucially, each piece of data it delivers must have a unique identifier so the backtest-kit can keep track of everything.

## Interface IOptimizerSource

This interface helps you define where your backtest data comes from and how it’s presented to a language model. Think of it as a blueprint for connecting to your data and preparing it for analysis. 

You’ll give it a unique name so you can easily identify the data source, and provide a description if you like.  The core is the `fetch` function, which tells the backtest-kit how to retrieve the data – it needs to handle getting data in chunks.

You can customize how the data looks in the conversation with the LLM by using the `user` and `assistant` formatters. These let you shape the messages sent from the user and the assistant, although default templates are available if you don't need custom formatting.

## Interface IOptimizerSchema

This defines the structure for setting up an optimizer within the backtest-kit framework. Think of it as a blueprint for how your optimization process will work. 

It lets you give your optimizer a unique name and a helpful description.

You specify training periods – different chunks of historical data used to generate various strategy versions for comparison.  There's also a dedicated testing period to evaluate how well those strategies perform.

The system pulls data from multiple sources, which contribute information to the process of creating strategies. 

A key part is defining how to create a prompt that guides the strategy generation process based on the conversation history.

You can customize the template used to build the strategies, or rely on default settings.

Finally, you have the option to hook in custom monitoring callbacks for more detailed insights into the optimizer's lifecycle.

## Interface IOptimizerRange

This interface helps you define specific time periods for backtesting or optimizing your trading strategies. Think of it as setting the boundaries for the data your strategy will learn from or be tested against. You'll specify a `startDate` and an `endDate` representing the beginning and end of the timeframe you're interested in. Optionally, you can add a `note` – a brief description – to help you remember what this time range represents, like "Bear market 2023-H2".

## Interface IOptimizerParams

This interface defines the core settings needed to create and run an optimizer within the backtest-kit framework. Think of it as the blueprint for how the optimization process will behave. 

It includes a `logger` to help you track what's happening during optimization – important for debugging and understanding the results.

Also, it specifies a `template` which combines your custom settings with the framework’s default behaviors, providing a complete set of actions and methods for the optimization process. This template determines things like how data is processed and how strategies are evaluated.

## Interface IOptimizerFilterArgs

This interface, `IOptimizerFilterArgs`, helps define the criteria for retrieving data needed for backtesting. Think of it as a way to specify exactly which trading pair and timeframe you're interested in. It lets you pinpoint the data—like price history—necessary for your backtesting experiments by providing a symbol (like "BTCUSDT"), a start date, and an end date. This ensures you're working with the specific data slice relevant to your strategy.


## Interface IOptimizerFetchArgs

This interface defines the information needed when requesting data in batches, like when you're pulling a large dataset for optimization. Think of it as a way to break down a huge list into smaller, more manageable chunks. The `limit` property specifies how many items you want in each chunk, and `offset` tells you where to start fetching from the full list, allowing you to navigate through pages of data. By default, each request will grab 25 items at a time.

## Interface IOptimizerData

This interface defines the basic structure for data sources used in optimization processes. Every data point provided must have a unique identifier, known as a `RowId`, which is crucial for preventing duplicate entries when dealing with large datasets or paginated sources. Think of this ID as a fingerprint for each piece of data, ensuring each one is distinct and can be tracked properly.

## Interface IOptimizerCallbacks

This interface lets you listen in on what's happening during the optimization process. Think of it as a way to get notified about key steps and potentially check things out along the way.

You can receive notifications when data is ready for a particular trading symbol and strategy, allowing you to log it or confirm it looks right. A similar notification happens after the code for your strategy is generated, enabling you to review it. You'll also be alerted when the generated code is saved to a file, which could be helpful for tracking or performing post-save tasks. Finally, when data is retrieved from a data source, you'll get a call so you can log or validate it.


## Interface IOptimizer

The `IOptimizer` interface is your way to interact with the backtest-kit framework for creating and exporting trading strategies. Think of it as a central point for getting data, generating code, and saving your work.

First, you can use `getData` to pull information and build the foundation for your strategy, essentially gathering everything needed for the process.  Then, `getCode` lets you create the full, runnable trading strategy code – it compiles all the necessary pieces together. Finally, `dump` gives you the power to save that generated code to a file, organizing it neatly for later use and deployment; it will even make sure the necessary folders exist.

## Interface IMethodContext

This interface, `IMethodContext`, acts as a little helper, carrying key information about which systems are involved in a trading operation. Think of it as a way to keep track of which exchange, strategy, and frame should be used – essentially, it provides context. It's automatically passed around within the backtest-kit framework, so you don't typically need to create it directly. It tells the system which specific versions of your strategy, exchange, and trading frame to utilize for the current operation. When running in "live" mode, the frame name will be empty, indicating no frame is actively being used.


## Interface ILogger

The `ILogger` interface is the central way different parts of the backtest-kit framework communicate about what's happening. It gives you tools to record events, from simple messages to detailed debugging information, that helps you understand and fix problems, monitor performance, and keep track of what your system is doing. 

You can use the `log` method to record important events, like agent actions or storage changes. `debug` is for when you need to see very detailed information during development or when troubleshooting, like what's going on inside a tool call. `info` lets you track successful operations and confirmations – a good way to get a general sense of what the system is doing. Finally, `warn` flags situations that might be a problem later, like missing data or using older features that might be removed in the future.

## Interface IHeatmapRow

This interface describes the key performance statistics for a single trading symbol, as seen in a portfolio heatmap. It provides a consolidated view of how various strategies performed on that symbol.

You'll find information like the total profit or loss percentage achieved, the Sharpe Ratio which measures risk-adjusted returns, and the maximum drawdown, which shows the largest potential loss.

The interface also breaks down the trading activity, telling you the total number of trades, the number of wins and losses, and the win rate.

Further details include the average profit per trade, how volatile the results were (standard deviation), and metrics like profit factor, average win size, average loss size, and the longest winning and losing streaks. Finally, expectancy gives an idea of the expected return per trade.


## Interface IFrameSchema

The `IFrameSchema` helps define specific periods and frequencies for your backtesting simulations. Think of it as a blueprint for how your historical data will be organized and processed. Each schema has a unique name to identify it, and you can add a note to explain its purpose.

It specifies the `interval` – like daily, hourly, or minute-by-minute – used to create the timestamps within the backtest. The `startDate` and `endDate` mark the beginning and end of the time range being analyzed.

Finally, you can optionally include lifecycle `callbacks` to execute custom code at key points during frame creation. This allows you to customize how your data is prepared for the backtest.

## Interface IFrameParams

The `IFramesParams` interface describes the information needed when setting up a frame within the backtest-kit trading framework. Think of a frame as a container for your trading logic – this interface provides the necessary configuration. It builds upon the `IFramesSchema` interface, and crucially, includes a `logger` property. This `logger` allows you to easily add debug statements to your frame's code to help understand what's happening during backtesting. It’s your tool for observing and troubleshooting the behavior of your trading strategy.

## Interface IFrameCallbacks

This section describes callbacks that let you react to events happening within the backtest framework's timeframe management. Specifically, the `onTimeframe` callback is triggered whenever a new set of timeframes is created. You can use this opportunity to check that the timeframes look correct, or to record information about them for debugging or analysis purposes. The callback provides you with the array of dates, the start and end dates of the entire timeframe period, and the interval used to generate those timeframes.

## Interface IFrame

The `IFrames` interface is a core piece of backtest-kit, working behind the scenes to provide the timeline for your backtesting simulations. It’s responsible for creating the sequence of dates and times that your trading strategies will be evaluated against. Think of it as the backbone that defines *when* your strategy will make decisions.

The primary function, `getTimeframe`, is how you get this timeline. You give it a stock symbol and a specific timeframe name (like "daily" or "hourly"), and it returns an array of timestamps representing the dates and times for that backtest period. These timestamps are spaced according to how often your timeframe occurs - hourly timestamps will be one hour apart, daily will be one day, and so on.

## Interface IExecutionContext

The `IExecutionContext` helps your trading strategies and exchanges understand the environment they're operating in. Think of it as a little package of information passed around during execution. It tells your code things like what trading pair (symbol) you’re working with, the exact timestamp of the current operation, and whether you’re in a backtesting simulation or running live. This context is automatically managed and shared, so you don't have to constantly pass this data around manually. It makes things cleaner and easier to understand.

It includes:

*   `symbol`: The trading pair, like "BTCUSDT".
*   `when`: The current date and time.
*   `backtest`: A simple flag indicating if this is a backtest or a live trade.

## Interface IExchangeSchema

This interface outlines the structure needed to connect backtest-kit to a specific cryptocurrency exchange. Think of it as a blueprint for how backtest-kit understands and interacts with each exchange’s data.

It requires a unique name to identify the exchange and allows for an optional note to provide extra context for developers. 

The most critical part is `getCandles`, which dictates how backtest-kit retrieves historical price data – essentially the trading history – from the exchange.  You'll provide the logic here to fetch candles based on the symbol, timeframe, and desired date range.

Additionally, `formatQuantity` and `formatPrice` handle the precise formatting of trade quantities and prices to match the exchange's specific rules, ensuring accuracy in simulations. 

Finally, `callbacks` offer optional functions that can be triggered during the data fetching process, such as receiving candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the information needed when setting up an exchange connection within the backtest-kit framework. Think of it as a blueprint for how the exchange will operate during a backtest. It requires a logger to provide helpful debugging messages, allowing you to track what's happening during the backtesting process.  It also needs an execution context, which dictates things like the trading symbol, the time period being tested, and whether it's a backtest or live trading. Essentially, this interface ensures the exchange is properly configured with the right environment and logging capabilities.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when your backtest kit interacts with an exchange. Specifically, you can register a function to be notified whenever new candle data (like open, high, low, close prices over a certain time period) arrives from the exchange. This `onCandleData` callback receives details such as the trading symbol, the candle timeframe, the start date, the number of candles requested, and an array of the actual candle data itself, allowing you to react to incoming market information.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with a simulated exchange during backtesting. It allows you to retrieve historical and future candle data, crucial for analyzing past performance and simulating trading scenarios.

You can use `getCandles` to pull historical price data for a specific symbol and time interval, while `getNextCandles` lets you peek ahead to future data (important for backtesting scenarios that need to anticipate future prices).

The `formatQuantity` and `formatPrice` methods handle the tricky part of converting quantities and prices to the specific format required by the exchange you're simulating.

Finally, `getAveragePrice` provides a quick way to calculate the Volume Weighted Average Price (VWAP) based on recent trading activity – essentially, the average price a large order would have been filled at. This is based on the last five one-minute candles.


## Interface IEntity

This interface serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as the common blueprint that ensures all persisted entities share a consistent structure and behavior. It's the starting point for defining how data is handled and interacted with, guaranteeing a unified approach to working with entities throughout the system.

## Interface ICandleData

This interface defines the structure for a single candlestick, which is a common way to represent price data over a specific time interval.  Each candlestick contains key information like the time it started (`timestamp`), the price when it opened (`open`), the highest price seen (`high`), the lowest price reached (`low`), the price when it closed (`close`), and the total trading volume (`volume`) during that period.  This data is essential for tasks like calculating Volume Weighted Average Prices (VWAP) and running backtests to evaluate trading strategies. Think of it as a snapshot of price action and trading activity for a defined timeframe.

## Interface HeatmapStatisticsModel

This model holds all the key statistics for your portfolio's performance, presented in a way that's easy to visualize on a heatmap. It breaks down the overall results by individual symbols, giving you a detailed view of what's working and what's not. 

You’ll find an array of data, each row representing a symbol and its associated metrics.  Alongside this, the model also provides summary figures: the total number of symbols in your portfolio, the overall profit and loss (PNL), the Sharpe Ratio which indicates risk-adjusted return, and the total number of trades executed across the entire portfolio.

## Interface DoneContract

The DoneContract provides information when a background task, either a backtest or a live trading session, finishes running. It tells you which exchange was used, the name of the trading strategy that completed, and whether it was a backtest or live execution.  You'll also find the trading symbol, like "BTCUSDT," included in the information. Essentially, it's a notification with details about what just finished.


## Interface ColumnModel

This interface helps you define how data should be presented in a table. Think of it as a blueprint for each column you want to display. 

You’ll specify a unique `key` for each column, a `label` that users will see as the column header, and a `format` function that transforms your raw data into a readable string. 

Finally, `isVisible` lets you control whether a column is shown based on certain conditions, giving you flexibility in how you present your information. It allows you to customize the look and feel of your data tables.

## Interface BacktestStatisticsModel

This model holds all the key statistical information generated during a backtest. It's designed to give you a complete picture of how your trading strategy performed.

You'll find details on every closed trade within the `signalList`, and the total number of trades overall. It also breaks down the trades into wins and losses, allowing you to calculate the win rate – the percentage of profitable trades.

Beyond simple win/loss counts, you'll see metrics like average P&L per trade and total P&L across all trades. Risk is assessed through the standard deviation and Sharpe Ratio, both of which help gauge the volatility and risk-adjusted performance. The Certainty Ratio illustrates the relationship between average winning and losing trade sizes, while expected yearly returns provide a longer-term performance outlook. Keep in mind that some values might be null if the calculations couldn't be reliably performed.
