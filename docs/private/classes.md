---
title: private/classes
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


# backtest-kit classes

## Class WalkerValidationService

The Walker Validation Service helps you keep track of and verify your parameter sweep configurations, which are used for things like optimizing trading strategies or fine-tuning hyperparameters. Think of it as a central place to register your different exploration setups.

It ensures that the configurations you're using actually exist, preventing errors down the line. 

Here's what you can do with it:

*   **Register walkers:** Use `addWalker` to tell the service about each of your parameter sweep configurations.
*   **Validate walkers:** `validate` checks to make sure a walker exists before you try to use it, so you'll know immediately if there's a problem.
*   **List walkers:**  `list` gives you a complete overview of all the configurations you’ve registered.

The service also cleverly remembers previous validation results to speed things up, which is especially helpful when dealing with lots of configurations.

## Class WalkerUtils

WalkerUtils provides helpful tools for managing and running walkers, which are sets of strategies used for backtesting and analysis.

Think of it as a central hub for working with your walkers, simplifying common tasks.

It handles the often complex process of running walkers, including automatically figuring out the relevant details like the exchange and frame name. You can access it easily as a single, shared instance.

Here's what you can do with WalkerUtils:

*   **Run Walkers:** Easily start walker comparisons for specific symbols, automatically passing along important context information.
*   **Run in the Background:** Launch walker comparisons without needing to wait for the results, great for logging or triggering other actions.
*   **Stop Walkers:**  Gracefully halt a walker's signal generation – it stops new signals but lets existing ones finish properly. This is crucial for controlled shutdowns.
*   **Retrieve Data:** Get all the results and data collected from your walker comparisons.
*   **Generate Reports:** Create detailed markdown reports summarizing your walker comparisons, and optionally customize the displayed columns.
*   **Save Reports:** Save those generated reports directly to a file.
*   **List Walkers:** See a list of all currently active walkers and their statuses (pending, completed, failed, ready).

WalkerUtils makes it easier to interact with your walkers, keeps things organized, and provides a convenient way to perform common tasks.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies' configurations in a structured and organized way. It’s like a central library for your strategy blueprints. 

This service uses a special type-safe system to store these blueprints, making sure they’re consistent and reliable. You can add new strategy blueprints using the `addWalker()` function, and then easily find them again by name.

Before adding a new strategy, the service quickly checks to ensure it has all the necessary information. 

You can also update existing strategy blueprints, providing only the changes you need to make. Finally, the `get` function lets you easily retrieve a strategy blueprint by its name when you need it.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It’s designed to record the results of experiments—things like how different parameter settings affect your strategy's success—and store them in a database.

Think of it as a logbook for your strategy development. It listens for updates as your strategies are tested, saving key data and metrics about each run. This service also keeps tabs on which strategy performed the best and tracks the overall optimization process.

To get started, you’ll subscribe to receive these updates. The service prevents you from subscribing more than once, which could cause issues. When you’re done, you can unsubscribe to stop receiving updates. The service then safely clears the subscription.

## Class WalkerMarkdownService

This service helps automatically create and save reports about your trading strategies as they're being tested. It keeps track of the results for each strategy and walker, using a special memory-saving technique.

The service listens for updates during the testing process and compiles them into nicely formatted markdown tables, making it easy to compare different strategies. These reports are then saved as files on your computer, organized by walker name.

You can subscribe to receive these updates as they happen, and easily unsubscribe when you're finished. There are also methods to retrieve specific data, generate full reports, and clear out old results when you need to start fresh. If you're running tests for multiple strategies, this service helps you organize and understand the outcome.

## Class WalkerLogicPublicService

WalkerLogicPublicService helps coordinate and run your trading strategies, acting as a public interface for the underlying logic. It automatically passes along important information like the strategy name, exchange, frame, and walker name, so you don't have to worry about manually managing that context. 

Think of it as a conductor ensuring all the pieces of your backtesting process work together smoothly. It uses a private service to handle the actual work and leverages MethodContextService to streamline the process. 

The `run` method is your main tool for initiating a backtest, telling it which symbol and context to use, and it will provide results.

## Class WalkerLogicPrivateService

This service helps manage and compare different trading strategies, essentially acting as a coordinator for your backtesting process. It runs each strategy one after another and keeps you informed about the progress, highlighting the best-performing strategy as it goes.  Finally, it presents a complete ranked list of all strategies you tested, making it easy to see which ones performed best.

Inside, it relies on other services to handle the actual backtesting calculations and formatting results for easy understanding.

To use it, you provide the symbol you want to test, a list of strategies to compare, the metric you want to use to evaluate them (like total return or Sharpe ratio), and some contextual information about your trading environment. 

The `run` method is the main entry point and returns updates as each strategy finishes, allowing you to track the process in real-time.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with walker functionality within the backtest-kit framework. It's designed to make it easier to incorporate walkers into your applications by providing a straightforward way to access them, especially when using dependency injection. 

Think of it as a convenient layer on top of the more complex `WalkerLogicPublicService`.

It manages several services responsible for validation and logic related to walkers, strategies, exchanges, and frames, allowing for a structured and reliable testing process.

The `run` method is its key feature, letting you execute walker comparisons for a specific symbol while providing important information like the walker's name, exchange it's connected to, and the frame it's operating within. It returns a generator, which means the results are processed in chunks as they become available.


## Class StrategyValidationService

This service helps you keep track of and verify your trading strategies. It acts as a central place to register your strategies, making sure they exist and their related settings—like risk profiles and actions—are also correctly configured. The service remembers previous validation results to speed things up.

You can add new strategies using `addStrategy`, and then use `validate` to ensure everything is set up correctly. Need to see what strategies you've registered? The `list` function gives you a straightforward list of all your defined strategies. 

The service relies on other services for risk and action validation. It also keeps a record of the strategies it manages internally.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It gathers information about events like order cancellations, profit-taking, and loss adjustments that happen during trading.

Think of it as a central place to get reports and statistics about your strategies. You can ask it to:

*   Pull together key statistics from your strategy’s trading activity.
*   Create easy-to-read reports in Markdown format, showing a detailed table of events, including prices, percentages, and timestamps.
*   Save those reports directly to files on your computer.

This tool uses data collected from the StrategyMarkdownService and organizes it to provide a clear picture of what's happening with your strategies. It's useful for reviewing performance and identifying areas for improvement.

## Class StrategySchemaService

This service helps you keep track of different trading strategy blueprints, ensuring they're well-defined and consistent. Think of it as a central place to store and manage the templates for your trading strategies.

You can register new strategy templates using `addStrategy()` and then retrieve them later by their name.  Before a new strategy template is added, it's checked to make sure it has all the necessary parts and that those parts are the correct types.

If you need to update an existing strategy template, you can do so by partially modifying it.  Finally, you can easily fetch a strategy template using its name when you need to use it. The service uses a special type of storage to make sure everything stays organized and error-free.


## Class StrategyReportService

The StrategyReportService maintains a persistent record of your trading strategy's actions, creating an audit trail of every key event. To begin, you need to "subscribe" to activate the logging process. As your strategy runs—whether it's canceling orders, closing positions for profit or loss, or adjusting stop-loss and take-profit levels—dedicated functions like `cancelScheduled`, `closePending`, and `partialProfit` will automatically capture these actions and log them to JSON report files. When you're finished, simply "unsubscribe" to stop the logging and release resources. This system offers a clear and reliable way to track your strategy's decisions for analysis and troubleshooting.

## Class StrategyMarkdownService

This service helps you track and analyze your trading strategy's actions. It acts like a temporary memory, collecting events like cancellations, closes, and adjustments to stop-loss and take-profit levels. Instead of writing each event immediately, it holds them until you're ready to generate a report.

Think of it as a way to build up a detailed history of your strategy's behavior before creating a report.  You need to "subscribe" to start collecting these events, and "unsubscribe" when you're finished.

Here's a breakdown of what it does:

*   **Collects Data:** It remembers things like when a scheduled order is cancelled, a pending order is closed, or a trailing stop is adjusted.
*   **Generates Reports:**  It can create markdown documents summarizing these actions, letting you see the overall pattern of your strategy's execution. You can customize which details are included in the report.
*   **Saves Reports:** You can save the reports as files.
*   **Memory Management:** It stores events temporarily, and you can clear this memory whenever you need to.
*   **Clear and Subscribe:** You enable event collection using `subscribe()` and disable using `unsubscribe()`.



Key features include:

*   A way to generate statistics and reports about your strategies.
*   Accumulates data in memory before reporting.
*   Provides options for clearing all or specific data.
*   Generates markdown reports with configurable details and the ability to save to disk.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for managing trading strategies within the system, particularly for backtesting and live trading scenarios. It coordinates several other services to handle strategy operations and inject relevant information like the trading symbol, timestamp, and backtest mode. This service is crucial for internal workings of both backtesting and live trading logic.

It provides several key functions:

*   **Validation:** It checks strategy configurations and associated risk settings, caching the results to avoid repetitive checks.
*   **Signal Retrieval:** It can fetch either the pending or scheduled signals for a specific symbol, which is important for monitoring and controlling trades (like TP/SL or scheduled activations).
*   **State Checks:** Functions like `getBreakeven`, `getStopped` offer ways to query the current state of a strategy’s trade.
*   **Tick and Backtest Execution:** It handles the core execution of strategy logic, wrapping the `tick()` and `backtest()` methods with the necessary context.  The `backtest` function allows you to run a strategy against historical candle data.
*   **Control Functions:** You can stop, cancel scheduled signals, close pending signals, or dispose of a strategy instance through these functions.
*   **Partial Adjustments:**  `partialProfit`, `partialLoss`, and `trailingStop/Take` functions provide mechanisms to dynamically adjust active strategies (e.g., closing a portion of a trade at profit/loss levels or adjusting stop-loss/take-profit targets).
*   **Cleanup:** The `clear` and `dispose` functions manage the lifecycle of strategies, cleaning up resources and removing them from the system.



Essentially, `StrategyCoreService` is the conductor, coordinating and managing the various aspects of strategy execution and control.

## Class StrategyConnectionService

This service acts as a central hub for managing and executing trading strategies. It intelligently routes requests to the correct strategy implementation based on the trading symbol and strategy name. To improve efficiency, it caches these strategies, avoiding repeated creation and destruction.

Here's a breakdown of its key functionalities:

*   **Strategy Routing:** It directs calls to specific strategies based on the symbol and name.
*   **Caching:** It stores frequently used strategies to speed up operations.
*   **Initialization:** Ensures strategies are fully ready before any trading actions occur.
*   **Handles Live and Historical Data:** Supports both real-time trading (`tick()`) and backtesting (`backtest()`) scenarios.

**Key methods and their purposes:**

*   `getStrategy()`: Fetches a cached strategy implementation.
*   `getPendingSignal()`, `getScheduledSignal()`: Retrieves information about active signals.
*   `tick()`: Processes real-time trading data.
*   `backtest()`: Evaluates the strategy's performance on historical data.
*   `stopStrategy()`: Pauses a strategy's signal generation.
*   `dispose()`: Releases resources associated with a strategy.
*   `cancelScheduled()`: Cancels a previously scheduled signal.
*   `closePending()`: Closes an active position without stopping the strategy.
*   `partialProfit()`, `partialLoss()`, `trailingStop()`, `trailingTake()`: Manage partial profit/loss takings and trailing stop adjustments.
*   `breakeven()`:  Manages breakeven levels for positions.
*   `activateScheduled()`: Activates scheduled signals prematurely.



Essentially, this service provides a structured and optimized way to manage and execute your trading strategies within the framework.

## Class StorageLiveAdapter

This component, called StorageLiveAdapter, is designed to manage how trading signals are stored, offering flexibility in choosing where that data lives. It acts as a middleman, allowing you to easily swap between different storage methods without changing the rest of your system.

It comes with a default persistent storage option that saves data to disk, but you can also switch to memory-based storage (for testing or temporary data) or even a dummy storage that does absolutely nothing.

The adapter handles events like signal openings, closings, scheduling, and cancellations, passing these along to the chosen storage method. You can search for specific signals by their ID or retrieve a complete list of stored signals.  The `useStorageAdapter` method lets you completely customize the storage backend by providing your own storage class.  Simple functions like `useDummy`, `usePersist`, and `useMemory` provide shortcuts to quickly change the storage type being used.

## Class StorageBacktestAdapter

This component acts as a flexible bridge for managing how backtest data is stored. It allows you to choose different storage methods, like saving data to a file, keeping it in memory, or even using a "dummy" adapter that does nothing. You can easily switch between these options to suit your testing needs. 

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods handle different events related to signals and pass these onto the currently selected storage adapter. You can also search for a specific signal by its ID or list all the signals that are stored.

The `useStorageAdapter` method lets you specify the exact type of storage you want to use. Convenient shortcuts like `useDummy`, `usePersist`, `useMemory`, and `useMemory` provide quick ways to switch between common storage configurations, with `usePersist` being the default.

## Class StorageAdapter

The StorageAdapter is the central component for managing your trading signals, handling both the data from backtesting and live trading. It automatically keeps track of new signals as they are generated, ensuring everything is stored correctly.

You can think of it as a single point of access for all your signal data, whether it’s from past simulations or current trading activity. To start tracking signals, you "enable" the adapter, and it will subscribe to relevant data sources.  If you need to stop tracking, you can simply "disable" it; it's safe to call this even if the adapter is already disabled.

Need to retrieve a specific signal? The `findSignalById` method lets you locate a signal using its unique ID. Want to review your backtest results? `listSignalBacktest` gives you an array of all signals from backtesting. Similarly, `listSignalLive` provides access to the signals generated during live trading.


## Class SizingValidationService

The SizingValidationService helps you keep track of and verify your position sizing rules. Think of it as a central place to register your sizing strategies – the different ways you determine how much to trade. 

It makes sure your sizing strategies are properly set up before you try to use them, preventing errors and ensuring consistency. The service also keeps a record of all your registered strategies, allowing you to easily see what's available. 

To start, you'll use `addSizing` to register each of your sizing approaches. Then, `validate` checks if a sizing strategy exists when you need it, and `list` provides a handy overview of all registered sizing schemas. It's designed to be efficient, remembering past validations to speed up the process.

## Class SizingSchemaService

This service helps you keep track of different ways to determine how much to trade – we call those "sizing schemas." It’s designed to be safe and organized, ensuring you're using the right methods for your strategies.

Think of it as a central place to store and manage these sizing rules. You add new rules using `register`, update existing ones with `override`, and easily find the right rule when you need it with `get`.

The service automatically checks to make sure your sizing schemas have the necessary components before it stores them, preventing errors down the line. It relies on a tool registry to keep everything neatly organized and type-safe.


## Class SizingGlobalService

This service handles the calculations needed to determine how much to trade. It's a central point for figuring out position sizes, taking into account various risk considerations. 

Think of it as a bridge between the strategy and the actual order placement, making sure the trade size aligns with your risk management rules. 

It relies on other services to help with this process, including those dealing with connection and validation. The `calculate` function is the core - it’s what you'd use to actually get a size based on your inputs and the current trading environment.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within the backtest kit. It acts as a central point, directing sizing requests to the right tool based on a specified sizing name.

Think of it like a traffic controller, sending sizing calculations to the appropriate specialist.

It's designed to be efficient, remembering previously used sizing methods (memoization) so it doesn’t have to recreate them unnecessarily.

The service handles things like calculating position sizes with consideration for risk management and offers various sizing approaches like fixed percentages or Kelly Criterion. 

If a strategy doesn't have specific sizing configurations, the sizing name will be an empty string. 

It relies on other services like a logger and a sizing schema service to function properly.


## Class ScheduleUtils

ScheduleUtils is a helper tool designed to make it easier to monitor and understand how scheduled signals are performing within your backtesting or live trading environment. Think of it as a central place to gather information about signals that are waiting to be executed.

It allows you to track signals that are queued up, signals that have been cancelled, and calculate metrics like cancellation rates and average waiting times to highlight potential issues.  It can also create readable markdown reports summarizing the signal execution history for specific strategies and symbols. 

You can request data about a particular symbol and strategy combination, generate a comprehensive markdown report detailing signal events, or save these reports directly to a file for later review. This is a single, easy-to-access component designed to keep you informed about your scheduled signal operations.

## Class ScheduleReportService

This service helps you keep track of your scheduled trading signals by recording important events like when a signal is scheduled, when it's activated, or when it’s cancelled. It's designed to monitor these signals and automatically store that data in a SQLite database, which is really useful for analyzing how long signals take to execute.

The service listens for these events, calculates how long it takes for a signal to move from scheduled to active or cancelled, and then saves that information.  You can subscribe to receive these events, and the system ensures you're not accidentally subscribed multiple times.  When you're done, you can unsubscribe to stop receiving events. It uses a 'loggerService' to provide debug messages.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals, specifically those that are scheduled in advance. It listens for when signals are planned and when they are cancelled, organizing the information for each strategy you use. 

It automatically creates reports in a readable Markdown format, detailing each event and providing helpful statistics like cancellation rates and average wait times. These reports are saved to your logs directory, making it easy to review your strategy's performance.

You can subscribe to receive these signal events, unsubscribe when you no longer need them, and clear the accumulated data whenever necessary. The service also allows you to retrieve statistical data and reports for specific symbols and strategies, as well as save reports to disk. The storage is organized to keep each symbol, strategy, exchange, frame and backtest combination isolated.


## Class RiskValidationService

This service helps you keep track of and make sure your risk management setups are correct. It essentially acts as a central place to register your different risk profiles, ensuring they exist before you try to use them. To speed things up, it remembers the results of past validations, so it doesn't have to re-check everything every time. 

You can add new risk profiles using `addRisk`, confirm a profile exists with `validate`, and get a complete list of registered profiles with `list`. It uses a `loggerService` to handle logging, and internally stores risk profiles in a `_riskMap`.


## Class RiskUtils

This class helps you understand and analyze risk rejection events in your trading system. It's like a central hub for gathering and presenting information about when and why trades were rejected due to risk controls.

Think of it as a way to create reports and statistics on those rejections. You can pull out key data like the total number of rejections, broken down by the symbol being traded and the strategy used.

You can easily generate reports that list all the rejection events in a readable markdown format, showing details like the symbol, strategy, position, price, and reason for the rejection. This report includes a summary of the rejection statistics.

Finally, it allows you to save these reports directly to files on your computer for later review. The filename will be based on the symbol and strategy name, making it easy to organize.

## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they're structured correctly and easily accessible. It uses a special system to store these schemas safely and consistently. 

You can add new risk profiles using the `addRisk()` method, and find them again later by their names. Before adding a new risk profile, the service checks to make sure it has all the necessary parts. 

If a risk profile already exists, you can update it with just the changes you need, rather than the whole thing. Finally, there's a simple way to look up a risk profile by its name when you need it.

## Class RiskReportService

This service helps you keep a record of when your risk management system blocks trades. It's designed to capture those rejection events – the signals that didn't get through – and save them in a database.

The service listens for these rejections and records them, including why the trade was blocked and details about the original signal. This history is invaluable for analyzing your risk controls and making sure everything is working as expected.

You can easily set up the service to receive these rejection events, and it ensures you don't accidentally subscribe multiple times which could cause issues.  When you no longer need the service to track rejections, you can unsubscribe to stop it from listening.




The `loggerService` property is used for displaying helpful debugging messages. `tickRejection` handles the actual process of receiving and logging rejection events. The `subscribe` method is how you tell the service to start monitoring for rejections, and it provides a way to stop it.  Finally, `unsubscribe` provides a clean way to stop receiving those rejection notifications.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically create reports about rejected trades due to risk checks. It listens for these rejection events and organizes them by the trading symbol and strategy used. It then turns this information into nicely formatted markdown tables, complete with statistics like the total number of rejections.

You can subscribe to receive these rejection events and the service will keep track of them. When you’re done, you can unsubscribe.

The service allows you to retrieve statistics and generate reports for specific symbol-strategy combinations. You can also save these reports directly to your hard drive, creating a well-organized record of your risk rejections. 

For a complete cleanup, you can clear all stored data. If you only want to clear data for one symbol-strategy pair, you can provide specific details when clearing.

## Class RiskGlobalService

RiskGlobalService acts as a central point for managing and enforcing risk-related rules within the backtesting framework. It handles checks and validations related to risk limits, working closely with other services like RiskConnectionService. 

Think of it as the gatekeeper that ensures trading signals adhere to predefined risk constraints. It keeps track of open signals and offers ways to clear out old or irrelevant data, either for specific risk setups or a complete reset. 

Here's a quick breakdown of what it does:

*   **Validation:** It checks that your risk configurations are set up correctly and remembers previous checks to avoid unnecessary repeats.
*   **Signal Approval:**  `checkSignal` determines whether a trading signal is allowed based on risk limits.
*   **Signal Registration:** `addSignal` records when a new trade is opened, along with important details like price and timeframe.
*   **Signal Removal:** `removeSignal` updates the system when a trade is closed.
*   **Data Clearing:** `clear` allows you to wipe out risk data, either a targeted cleanup or a full reset.

## Class RiskConnectionService

The RiskConnectionService acts as a central point for managing risk checks and ensuring trading signals comply with predefined risk limits. It intelligently routes risk-related operations to the correct client-specific risk implementation, making sure each trading strategy's risk is handled appropriately.

To improve efficiency, it remembers previously retrieved risk configurations, so it doesn't have to recreate them repeatedly. This caching is key to performance. The service also takes into account things like the specific exchange and timeframe being used, ensuring risk rules are correctly applied in different contexts.

When evaluating a trading signal, the service checks several factors like portfolio drawdown, exposure to specific symbols, overall position count, and potential daily losses. If a signal fails these checks, it notifies the system that it should be rejected.

The service also handles keeping track of open and closed trading signals within the risk management system.  You can even clear out the cached risk configurations if needed, although this isn't typically necessary.

## Class ReportUtils

ReportUtils helps you control which parts of your backtesting and trading processes generate detailed log files. Think of it as a way to turn on and off specific monitoring features.

You can selectively enable logging for things like backtest runs, live trading, walker activities, or performance analysis. When you enable a service, it starts recording events in real-time as JSONL files, which include extra information to help you analyze the data later. Remember to always stop the logging when you're done to avoid problems.

Conversely, you can disable these logging features as needed to reduce overhead or focus on particular areas. This allows you to stop certain logging while leaving others running. This is particularly useful if you only want certain parts of your system to log.

ReportUtils is designed to be expanded upon by other classes, offering a foundation for customized reporting.


## Class ReportBase

This component handles writing data to files in a specific JSONL format, designed for tracking and analyzing trading activity. It creates a single file for each type of report, ensuring data is only added (never overwritten). The data is written in a stream, which means it handles large amounts of information efficiently and prevents bottlenecks.

The system takes care of creating the necessary directories and includes safeguards to prevent errors, including a timeout mechanism for write operations and a way to deal with errors. You can easily search through the data later based on criteria like the trading symbol, strategy used, exchange, timeframe, signal ID, and walker name. The initial setup only happens once to ensure everything is configured correctly. Writing data is simple - you provide the data and some options, and it handles the rest, automatically adding essential metadata like timestamps and search flags.

## Class ReportAdapter

The ReportAdapter helps manage and store structured event data, like those generated during backtesting or live trading. It’s designed to be flexible, allowing you to easily switch between different storage methods. 

It uses a pattern that lets you plug in different ways of saving data – the default is storing everything in JSONL files. Importantly, it ensures there's only one storage instance for each type of report, like backtest results or walker data, which improves efficiency.

The adapter automatically sets up the storage the first time you write data, and it provides a way to log events in real-time to JSONL files. You can customize the storage mechanism by providing your own adapter or even use a dummy adapter to temporarily disable data recording. It also provides shortcuts to easily switch back to the default JSONL storage.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade based on different strategies. Think of it as a toolbox for deciding your position size.

It offers several pre-built methods for calculating this, including:

*   **Fixed Percentage:** This method calculates your position size based on a percentage of your account balance.
*   **Kelly Criterion:** A more complex method designed to maximize growth rate by balancing risk and reward. It considers factors like win rate and win/loss ratio.
*   **ATR-based:** This sizing strategy uses the Average True Range (ATR) to determine a position size that adapts to market volatility.

Each method includes checks to ensure the sizing settings you're using are compatible with the strategy itself, helping prevent errors. These methods take information like your account balance, the current price, and relevant parameters as input and return the suggested position size.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded, making sure it's reliable even if things go wrong. It automatically handles creating storage areas and offers ways to customize how the data is stored.

Each signal’s data is kept in its own file, identified by a unique ID. The system is designed to be crash-safe, preventing data loss if there’s an unexpected interruption.

You can choose different storage methods – including a default JSON format and a "dummy" method that effectively ignores any changes.  There's also a way to plug in your own custom storage solutions.

To load existing signal data, `readStorageData` pulls information from the saved files.  `writeStorageData` is responsible for saving new data or updates to these files, making sure the process is protected from interruptions. These functions are essential for restoring the state of signals when starting a backtest or live trading session.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps to reliably store and retrieve signal data for your trading strategies. It’s particularly important for keeping track of the signals that strategies are generating, even if your system unexpectedly shuts down.

The class provides a way to manage how signal data is stored, allowing you to customize that storage using different adapters. 

Here's a breakdown of its capabilities:

*   **Automatic storage:** It creates and manages storage locations for each strategy.
*   **Custom storage options:** You can use built-in storage methods like JSON or switch to a "dummy" adapter for testing purposes. This dummy adapter simply ignores all writes.
*   **Reliable data handling:** When reading signals, it fetches the information safely. When writing signals, it uses a process that prevents data corruption.
*   **Signal restoration:** ClientStrategy uses it to recover and resume from a previous state.

The `readSignalData` method is used to retrieve previously stored signals; use `writeSignalData` to save new signals. You can choose how signal data is stored using `usePersistSignalAdapter`, `useJson`, or `useDummy`.

## Class PersistScheduleUtils

PersistScheduleUtils helps keep track of scheduled signals, especially important when you're running automated trading strategies. It’s designed to ensure that even if your system crashes, the scheduled signals aren’t lost.

This class manages how those signals are stored for each strategy, offering flexibility with custom storage options. It handles reading and writing these signals, doing so in a way that minimizes the risk of data corruption.

You’ll find it working behind the scenes with ClientStrategy, particularly when the system is running live and needs to remember what signals are scheduled.

It offers several ways to control how data is persisted:

*   You can register your own specialized storage adapter to handle signals in a unique way.
*   It comes with a built-in JSON adapter for standard storage.
*   For testing or debugging, there’s a dummy adapter that simply ignores any write attempts.

## Class PersistRiskUtils

This class helps manage how active trading positions are saved and loaded, particularly for risk management systems. It's designed to be reliable, even if your program crashes unexpectedly.

The system keeps track of different risk profiles and uses specialized adapters to handle the actual storage. 

You can read existing position data using `readPositionData`, which will return an empty record if nothing is found.  `writePositionData` ensures that when you update those positions – like adding or removing signals – the information is saved to disk safely.

If you need to change how data is stored, you can register custom adapters with `usePersistRiskAdapter`.  For testing or development, `useJson` provides the standard JSON storage, while `useDummy` acts as a placeholder, discarding any write operations.


## Class PersistPartialUtils

This class helps manage how partial profit/loss information is saved and loaded, especially for strategies running live. It keeps track of these partials separately for each symbol and strategy combination.

The system uses a special storage mechanism that's designed to be reliable even if things go wrong, like your computer crashing.  It also allows you to customize how these partials are saved.

You can read existing partial data back using `readPartialData`, which is how the system recovers its state when starting up.  If no data is found, it simply returns an empty object.

When the partial data needs to be updated, `writePartialData` handles saving it to disk in a way that protects against data corruption.

It’s possible to tell this class to use different ways of saving this information, like using a custom adapter or even just ignoring the saves altogether with the dummy adapter.  `usePersistPartialAdapter` lets you plug in your own way of saving data, while `useJson` and `useDummy` switch to built-in options.

## Class PersistNotificationUtils

This class provides tools for safely saving and loading notification data, ensuring that your application's notification state isn't lost even if something unexpected happens. It's used internally by other parts of the system responsible for live and backtesting environments. 

It automatically manages where the notification data is stored, and can even use different storage methods if needed. The data is stored as individual files, each identified by a unique ID, and changes are written in a way that prevents data corruption.

You can switch between different storage options, like using a standard JSON file format or even a "dummy" adapter that just ignores write requests for testing or development purposes.  The class also handles reading the initial notification data when your application starts up.

## Class PersistCandleUtils

This class helps manage and store candles, which are data points representing market prices over time. It keeps these candles in individual files, making it organized and easy to access. The system checks if all the requested candles are available before returning them – if even one is missing, it signals a cache miss.

The class is designed to automatically update and refresh the cached data when it's not complete. It's mainly used behind the scenes by the ClientExchange to streamline how candle data is handled.

Here's a bit more detail:

*   **How it stores data:** Each candle is saved as a separate JSON file, using a specific naming convention that includes the exchange, symbol, interval, and timestamp.
*   **Validation:**  It makes sure the candles being written are valid, ensuring that the first candle aligns with the starting timestamp, the correct number of candles are present, and they are completely closed within the expected timeframe.
*   **Persistence Adapters:** You can even customize how data is persisted by registering different adapters. It also provides options to switch between using a regular JSON storage, or a “dummy” adapter that essentially ignores all write operations – useful for testing.


## Class PersistBreakevenUtils

This class helps manage and save the breakeven state of your trading strategies. It's designed to safely store and retrieve this data, so your progress isn't lost.

Think of it as a central place to keep track of things like whether a specific signal has been reached for a particular trade.

Here’s a breakdown of how it works:

*   It handles reading and writing data to files located in a specific folder structure (dump/data/breakeven).
*   It makes sure writes are done reliably and prevents data loss.
*   It remembers the state of your strategies for each symbol and strategy, and only creates the necessary files when needed.
*   You can even customize how the data is stored (like using JSON or even a dummy adapter that ignores writes for testing).

You don't usually need to interact with this class directly; it's mainly used internally to power the ClientBreakeven feature. It’s a behind-the-scenes helper for managing your trading data.

## Class PersistBase

This class provides a foundational way to store and retrieve data to files, ensuring data integrity and reliability. It's designed to handle situations where you want to save information persistently, like historical trading data or configuration settings.

The framework automatically manages the storage directory and will try to fix any corrupted files it finds.  It uses a technique called "atomic writes" to make sure that even if something goes wrong during a save, your data remains safe and consistent.

You can easily iterate over all the saved items, and the system will retry if it encounters problems deleting files. The `waitForInit` method ensures the storage area is set up correctly when you first start using it. Finally, the process for locating the file for a given entity is handled internally.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your backtesting process take. It essentially listens for timing events during strategy execution and carefully records them. The goal is to help you identify bottlenecks and optimize your code for better performance.

You can think of it as a detective for your backtesting runs, gathering clues about where time is being spent.

Here’s a quick rundown of what it does:

*   It uses a "logger" to give you debugging output.
*   It handles tracking performance events.
*   It lets you subscribe to performance events, but makes sure you don't accidentally subscribe multiple times.
*   You can unsubscribe to stop receiving those events.



The service saves the timing data so you can later analyze it and find areas for improvement.

## Class PerformanceMarkdownService

This service is responsible for gathering and analyzing how well your trading strategies are performing. It listens for performance updates and keeps track of metrics for each strategy you're testing. It then calculates overall statistics like averages, minimums, maximums, and percentiles to give you a comprehensive picture of performance.

The service creates separate storage areas for each combination of symbol, strategy, exchange, frame and backtest, ensuring data isolation.

You can subscribe to receive these performance updates, and importantly, unsubscribe when you no longer need them. The `track` method is the key to sending performance information to the service.

Need to see the results?  The `getData` method allows you to retrieve aggregated statistics, and `getReport` generates a nicely formatted markdown report that includes bottleneck analysis.  You can also save these reports to disk using the `dump` method.  Finally, if you need to start fresh, `clear` will wipe out the accumulated data.

## Class Performance

The Performance class is your toolkit for understanding how well your trading strategies are performing. It offers tools to gather and analyze performance data, identify bottlenecks, and generate clear reports.

You can use it to get specific performance statistics for a particular symbol and strategy combination, giving you a detailed breakdown of key metrics like execution time, volatility, and outliers.

The class can also create well-formatted markdown reports that clearly visualize time spent on different tasks, highlighting areas where improvements could be made.

Finally, it allows you to save these reports directly to your file system, making it easy to track progress and share results.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss events that occur during trading. It acts as a central point to access and organize information collected by the system regarding partial profits and losses.

You can use it to get summarized statistics about your trading performance, like total profit/loss counts. It also lets you create detailed reports in markdown format, displaying individual profit/loss events in a clear, table-like structure, including details like symbol, strategy, price, and timestamp.

Finally, this class can automatically save those reports to files on your computer, making it easy to review your trading history and share results. The reports include a summary section at the bottom, providing key performance metrics.

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by logging every partial profit and loss. It’s designed to capture those moments when you close out a position partially – whether it’s a gain or a loss. 

This service listens for signals indicating partial profits and losses and records details like the price and level at which these partial exits occurred. It saves this information into a database so you can analyze your trading performance more precisely.

To get started, you’ll subscribe it to receive these profit and loss signals.  The `subscribe` function handles making sure you don’t accidentally subscribe multiple times. Remember to use the unsubscribe function that's returned when you subscribe to stop listening for events. If you're finished with the service, `unsubscribe` cleans things up.

## Class PartialMarkdownService

The PartialMarkdownService helps you create detailed reports about your trading performance, specifically focusing on partial profits and losses. It keeps track of these events as they happen for each symbol and strategy you're using, building up a record over time.

The service automatically generates nicely formatted markdown tables showing each partial profit or loss event, allowing you to easily review the details. It also provides overall statistics, like the total number of profits and losses recorded.

These reports are then saved to disk in an organized directory structure, making it easy to find and analyze them later. You can choose to save reports for specific symbol-strategy combinations or clear out all the accumulated data when needed.  The service makes sure it's only listening for new events once, and provides a simple way to stop listening. The underlying storage ensures each symbol-strategy-exchange-frame-backtest combination gets its own private place to store the data.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within your trading strategy. It’s designed to be injected into your strategy, making it easy to manage and monitor how your strategy handles partial profits and losses. Think of it as a gatekeeper, ensuring everything related to partials goes through a single, controlled point.

It handles logging for these operations at a global level, which makes it much easier to keep an eye on what’s happening in your strategy. Behind the scenes, it delegates the actual work to another service, the `PartialConnectionService`.

This service relies on several other validation services to confirm the validity of your strategy, risk settings, exchange, and the timeframe you’re using.  It also stores strategy configuration data.

The `profit`, `loss`, and `clear` functions are the primary methods you’ll interact with; they handle recording and clearing partial profit/loss states while ensuring proper logging and delegation. These functions take information like the symbol, signal data, current price, and whether the test is a backtest.


## Class PartialConnectionService

This service handles tracking partial profits and losses for your trading signals. It's designed to manage individual profit/loss records associated with each signal, and it does this efficiently by remembering (memoizing) these records so it doesn't have to recreate them every time.

Think of it as a factory and manager for "ClientPartial" objects, each representing a single signal's progress.

Here’s how it works:

*   It creates a unique record (a ClientPartial) for each signal you're tracking.
*   It keeps these records cached, so they are quickly accessible.
*   When a signal reaches a profit or loss level, it updates the corresponding record.
*   When a signal closes, it cleans up the record, freeing up resources.

This service is automatically provided to other parts of the system and takes care of the behind-the-scenes work of managing these partial profit/loss records, allowing other components to focus on the core trading logic. The service relies on injected components like a logger and action core service. The "getPartial" method provides a fast way to get the cached ClientPartial object based on the signal ID.

## Class NotificationLiveAdapter

This class helps manage notifications during live trading, giving you flexibility in how those notifications are handled. It acts as a central point for sending out updates about strategy performance, errors, and risk events.

You can easily swap out different notification methods – like using an in-memory store, persisting notifications to disk, or even using a dummy adapter for testing. The adapter pattern allows you to choose the best approach for your needs.

There are several methods for handling different types of events: signals, profit/loss updates, strategy commitments, errors, and more. Each method simply passes the event data to the currently selected notification adapter.

The `useNotificationAdapter` method gives you direct control over which adapter is used. Shorter, convenient methods (`useDummy`, `useMemory`, `usePersist`) provide quick switches to the most common adapter options. Finally, you can retrieve all notifications or clear them out using `getData` and `clear`.

## Class NotificationBacktestAdapter

This component helps manage and send notifications during backtesting, giving you flexibility in how those notifications are handled. You can think of it as a central point for all notification-related actions during a backtest.

It's designed to be adaptable, allowing you to easily switch between different ways of storing or processing notifications. You have a few options for the "backend" of this adapter: 

*   A memory-based system (the default) keeps notifications only in the backtest’s memory.
*   A persistent option saves notifications to disk, so you can review them later.
*   A dummy option simply ignores notifications, which is useful for testing or when notifications aren’t needed.

The `handleSignal`, `handlePartialProfit`, and similar methods are the main points where notifications are generated during the backtest. These methods pass the notification details to the currently selected adapter. You can also retrieve all notifications or clear them out entirely. To change the notification backend, use methods like `useDummy`, `useMemory`, or `usePersist`.

## Class NotificationAdapter

This component handles all your notifications, whether you're running a backtest or a live trading session. It automatically updates notifications as they come in, and provides a single place to access both backtest and live notifications. To prevent unwanted duplicates, it uses a clever system that ensures a signal is only subscribed to once.  You can easily turn notification tracking on and off, and you’ll find functions to retrieve all notifications or clear them out entirely, with options to specify whether you're dealing with backtest or live data.

## Class MarkdownUtils

This class helps you control whether or not your trading framework generates markdown reports for different parts of the process, like backtesting or live trading. 

You can use it to turn on markdown report generation for specific areas, like just the backtest or just the strategy analysis. When you enable a service, it starts gathering data and preparing reports – think of it as telling the system to keep an eye on things and record the details.  It's really important to remember to tell the system when you're done with those reports by using the unsubscribe function it gives you, otherwise things might linger in memory.

Conversely, you can also turn off markdown reporting for certain areas without affecting others. This is useful if you only need reports for some parts of your workflow.  Disabling a service stops it from recording data or generating reports, freeing up system resources. Unlike enabling, disabling doesn’t require a special "unsubscribe" step; it stops immediately.

## Class MarkdownFolderBase

This adapter helps you create well-organized reports by saving each report as its own individual markdown file. Think of it as the standard way to generate reports – it's designed for easy reading and manual inspection. 

The adapter doesn’t handle any complex setup; it simply writes the markdown content directly to a file based on the paths you provide. Each report will be saved in a directory structure that you define.

When you create an instance, you specify a name to identify the report type. The `waitForInit` method is essentially a no-operation, as this adapter doesn't require any initialization. The core function is `dump`, which takes the markdown content and writes it to a file, automatically creating the necessary directories.

## Class MarkdownFileBase

This class helps you write your markdown reports in a structured way, storing them as JSONL entries in a dedicated file. It’s designed for efficient, append-only writing to a single file for each report type, managing the writing process to prevent issues like buffer overflows.

The system automatically creates the necessary directories and handles errors by sending them to an exit emitter.  You can also include important metadata like the symbol, strategy name, exchange, frame, and signal ID with each entry, allowing you to easily filter and search your reports later.

The class initializes the file and stream only once, even if you call the initialization function multiple times. When you need to write data, the `dump` method handles it, adding a timestamp and the metadata you specify. It includes safeguards to ensure the write operations are reliable and don’t take too long, using a 15-second timeout. The file path follows a predictable pattern: `./dump/markdown/{markdownName}.jsonl`.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data (like backtest results or walker data) is stored. It's designed to be flexible, letting you choose different ways to store the data—either as individual files or appended to a single JSONL file.  It also makes sure that you only have one instance of each type of markdown storage running at a time, optimizing performance.

You can easily switch between storage methods using shortcuts like `useMd()` for individual files and `useJsonl()` for a single, appendable file. If you need something different, you can also set your own custom storage constructor.  The adapter handles creating the storage space the first time you write data, so you don’t have to worry about initialization.  There's even a "dummy" mode that's handy for testing where it discards any writes.

## Class LoggerService

The LoggerService helps keep your trading framework’s logging consistent and informative. It provides a central place for handling logs and automatically adds useful details to each message, like which strategy is running, which exchange is involved, and the specific symbol and timeframe being used.

You can customize the logging behavior by providing your own logger implementation through the `setLogger` method. If you don’t set a custom logger, the service will use a basic "no-op" logger that doesn’t actually output anything.

The service is structured around two core services: `methodContextService` and `executionContextService`, which manage the details added to each log entry. It also provides methods like `log`, `debug`, `info`, and `warn` for different levels of logging, all with automatic context injection.

## Class LiveUtils

LiveUtils provides tools for managing live trading operations, acting as a central hub for common actions. It's designed to simplify interactions with the live trading system and includes features for recovery and real-time monitoring.

To start live trading, you can use the `run` method, which generates a stream of trading results – it's designed to run continuously and handles crashes by automatically restoring its state.  For background operations like callbacks or data persistence, the `background` method lets you run trading processes without directly collecting their results, essentially running the trade indefinitely until you stop it.

You can also check the current status of signals using `getPendingSignal` and `getScheduledSignal` to see what's currently active. To see if you’ve reached a point where you can close your position without losses, use `getBreakeven`.

If you need to halt a strategy's signal generation, the `stop` method will pause new signals but allows any current activity to finish.  There are also methods to manage individual signals: `commitCancelScheduled` to cancel a scheduled signal, and `commitClosePending` to close a pending position without pausing the overall strategy.

For fine-grained control, you can adjust profit and loss targets with `commitPartialProfit` and `commitPartialLoss`, or dynamically adjust stop-loss and take-profit levels using `commitTrailingStop` and `commitTrailingTake`.  You can also manually move the breakeven point with `commitBreakeven` or activate a scheduled signal prematurely with `commitActivateScheduled`.

Finally, `getData` and `getReport` allow you to retrieve and analyze trading statistics and performance data, while `list` shows you the status of all running live trading instances.

## Class LiveReportService

The LiveReportService helps you track what’s happening with your trading strategy as it runs live. It’s designed to record every significant event—when the strategy is waiting, when a trade is started, when it's actively trading, and when a trade is finished. 

Think of it as a detailed logbook for your live trades. It listens for signals from your trading strategy and saves all the important data to a database. 

To prevent any confusion, it ensures that it only subscribes to the signal once. You can subscribe to receive these live updates, and when you're done, you can unsubscribe to stop the flow of data. It also provides a convenient way to see what's going on with your strategy in real-time, which is great for keeping an eye on things and later analyzing how well it’s performing.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save detailed reports about your live trading activity. It listens for every trading event – from when a strategy is idle to when a trade is opened, active, or closed – and organizes this information. 

It generates easy-to-read markdown tables that summarize these events and calculates key trading statistics like win rate and average profit/loss. These reports are automatically saved to files, making it simple to review your trading performance over time.

Here's a breakdown of what it offers:

*   **Automatic Report Generation:** It handles the report creation process automatically, saving you time and effort.
*   **Detailed Event Tracking:** Keeps track of all stages of a trade, providing a comprehensive view of your strategy's behavior.
*   **Key Statistics:**  Calculates important metrics to help you assess your trading strategy's effectiveness.
*   **Organized Storage:** Stores reports neatly in a dedicated folder, making them easy to find and analyze.
*   **Selective Clearing:** You can clear all accumulated data or just the data for a specific trading setup (symbol, strategy, exchange, frame, and backtest status).



You can subscribe to receive tick events and then use the `tick` function within your strategy’s `onTick` callback to process events. The `dump` function saves the report to a file. You can retrieve data and reports with `getData` and `getReport` methods.

## Class LiveLogicPublicService

This service manages live trading operations, making it easier to execute strategies. It automatically handles the necessary context, like the strategy and exchange names, so you don't have to pass them repeatedly to functions. 

Think of it as a central coordinator for your trading logic.

It continuously runs and provides a stream of trading results (signals to open, close, or cancel positions). If something goes wrong and the process crashes, it can recover from saved data.  It utilizes the underlying `LiveLogicPrivateService` while adding extra convenience.  The `run` method is the main entry point, and you provide the symbol to trade and any relevant context.

## Class LiveLogicPrivateService

This service is designed to orchestrate live trading in a continuous, resilient manner. It operates as an infinite loop, constantly checking for new trading signals.

Think of it as a tireless worker, continuously monitoring the market.

The service streams updates – specifically when trades are opened or closed – so you get only the most relevant information without being overwhelmed by constant activity.

It's built to be reliable; if something goes wrong, it can recover and pick up where it left off.

Essentially, it provides a real-time flow of trading activity, managed efficiently and with built-in crash protection.

It requires three components to function: a logger service for recording events, a core service for the trading strategy itself, and a method context service for handling method calls.

The `run` method is the main entry point; you provide a symbol, and it generates a continuous stream of `IStrategyTickResultOpened` and `IStrategyTickResultClosed` objects.


## Class LiveCommandService

This service helps connect to and manage live trading functionality. Think of it as a convenient gateway for accessing the core live trading logic. It’s designed to be easily integrated into your applications using dependency injection.

It relies on several other services for tasks like validating strategies, exchanges, and risks, ensuring everything is set up correctly before trading begins.

The key feature is the `run` method. This method handles the live trading process for a specific symbol and automatically restarts if things go wrong, providing a continuous stream of trading results. This stream includes information about opened, closed, and cancelled trades.


## Class HeatUtils

HeatUtils helps you create and manage portfolio heatmaps to visualize your trading strategy's performance. It's like having a handy tool that automatically gathers data about how each symbol is performing within a strategy. 

You can use it to:

*   Get a snapshot of aggregated statistics like total profit/loss, Sharpe ratio, and maximum drawdown for each symbol and the overall portfolio.
*   Generate a nicely formatted markdown report that shows a table with key metrics for each symbol, sorted to easily spot the best performers.
*   Save that report directly to a file on your computer, creating the necessary folders if they don't already exist.

Essentially, it simplifies the process of understanding your strategy’s portfolio performance by providing convenient methods for data retrieval, report generation, and file saving. It’s designed to be easily accessible throughout your backtesting process.

## Class HeatReportService

This service helps you keep track of your trading activity by recording when signals close, specifically focusing on the profit and loss (PNL) associated with those closures. It's designed to gather data across all your symbols, providing a portfolio-wide view for heatmap analysis.

Think of it as a silent observer, constantly listening for signals and only noting down when they’ve finished – when they've closed.

Here’s a breakdown of what it does:

*   It listens for these closing signal events.
*   It only records the important details: when the signal closed and how much profit or loss resulted.
*   It stores this data in a database, ready for you to create visualizations and analyze patterns.
*   To prevent it from getting overwhelmed, it ensures it only subscribes once.

To start using it, you’ll subscribe to it to receive the signal events. You’ll get back a function to unsubscribe when you’re finished.  If you happen to forget to unsubscribe, it’s safe—it won't cause any problems.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand your trading strategy’s performance across different symbols and timeframes. It listens for trading signals and automatically gathers key statistics like profit/loss, Sharpe ratio, and maximum drawdown for each symbol you’re trading.

It organizes this data by strategy, exchange, and timeframe, making it easy to compare performance. The service creates a dedicated storage space for each unique combination of exchange, timeframe, and backtest mode, ensuring your data stays neatly separated.

You can subscribe to receive these updates in real-time.  The service then transforms this data into a user-friendly markdown report that you can view or save to a file. It is designed to handle potentially problematic numbers (like infinity or 'not a number') and also provides a handy way to navigate between strategies. 

You can clear the stored data if you want to start fresh or if you need to reset your analysis.

## Class FrameValidationService

The FrameValidationService helps you keep track of your different timeframes or configurations within your backtesting system. It's like a central registry where you register each timeframe you're using, along with its specific details.

Before you try to use a timeframe, you can use this service to double-check it exists, preventing errors. It remembers the results of these checks, so it doesn't have to do the same work repeatedly, making things faster.

You can add new timeframes using `addFrame`, confirm a timeframe exists with `validate`, and get a full list of all registered timeframes using `list`. It simplifies management and ensures your system is working with valid configurations.


## Class FrameSchemaService

The FrameSchemaService helps you keep track of different blueprints, or "frames," that define how your trading strategies work. It's like a central place to store and manage these blueprints.

It uses a special system to ensure these blueprints are consistent and well-defined.

You can add new blueprints using `register`, update existing ones with `override`, and easily find them again using `get`.

Before a blueprint is added, it's checked to make sure it has all the necessary parts using a process called `validateShallow`, ensuring everything is set up correctly. This helps prevent errors later on. The service also has a built-in way to keep track of any errors that might occur.

## Class FrameCoreService

This service, `FrameCoreService`, handles all the behind-the-scenes work related to timeframes during a backtest. Think of it as the engine that provides the data points—the dates and times—your trading strategy will be tested against.

It relies on other services to manage connections and validate the frames being used. The `getTimeframe` function is its key feature; you'll use it to get an array of specific dates for a given trading symbol and timeframe (like 1-minute, 1-hour, etc.). This is a core component used internally to manage the timing of the backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing different trading frames within the backtest-kit. It automatically directs requests for frame-specific operations to the correct ClientFrame implementation, making your code cleaner and more organized.

It's designed to be efficient by caching those ClientFrame instances, so you don't have to recreate them every time. The service uses the 'frameName' from the method context to determine which frame is needed; if the 'frameName' is empty, it operates in a live (non-frame-constrained) mode.

You can easily retrieve a ClientFrame instance using `getFrame`, which handles both creating and caching them.  The `getTimeframe` function provides the start and end dates for a backtest, allowing you to define the specific time period you want to analyze.  It uses the frame configuration to determine these timeframe boundaries.

## Class ExchangeValidationService

This service helps keep track of your trading exchanges and makes sure they're properly set up before you start trading. Think of it as a gatekeeper for your exchange configurations.

It lets you register new exchanges, allowing you to add them to its internal list.  You can then use it to check if an exchange actually exists, which prevents errors down the line. 

The service is designed to be efficient; it remembers the results of previous validations, so it doesn't have to repeatedly check the same exchanges. Finally, it provides a way to see a list of all the exchanges you've registered.

Here's a quick rundown of what you can do:

*   `addExchange()`:  Register a new exchange.
*   `validate()`:  Confirm that an exchange is set up correctly.
*   `list()`:  View all registered exchanges.

## Class ExchangeUtils

The ExchangeUtils class is like a helpful assistant for working with different cryptocurrency exchanges. It's designed to make common tasks easier and more reliable.

Think of it as a single, always-available helper – it’s a singleton instance.

Here’s what it can do:

*   **Fetch Historical Data:** Easily retrieve candle data (like open, high, low, close prices) from exchanges, calculating the appropriate time range for you.
*   **Calculate Average Price:**  Determine the volume-weighted average price (VWAP) to understand the average price of a coin traded.
*   **Format Values:**  It ensures quantity and price values are formatted correctly for each specific exchange, handling the details like decimal places.
*   **Get Order Book Data:**  Retrieve the order book, which shows current buy and sell orders, with options to specify depth.
*   **Retrieve Raw Candle Data:**  Pull raw candle data with extra control over the date range and number of candles. It's careful about how it handles dates to prevent look-ahead bias.



Essentially, ExchangeUtils takes care of the tricky behind-the-scenes details of interacting with various exchanges, so you can focus on your trading strategy.

## Class ExchangeSchemaService

This service is responsible for keeping track of information about different cryptocurrency exchanges, ensuring that the data is consistent and reliable. It uses a special system to store these exchange details in a way that helps prevent errors.

You can add new exchanges using `addExchange()`, which essentially registers them with the service. To find information about a specific exchange, you can use the `get()` method, providing the exchange's name.

Before a new exchange is added, the service checks to make sure it has all the necessary details, a process called `validateShallow`. If you need to update an existing exchange's information, you can use `override()` to modify specific parts of it. The service relies on a logging system (`loggerService`) for tracking what's happening and handles the storage of exchange data using `_registry`.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest framework. It combines connection management with information about the specific backtest or live trading scenario. Think of it as a layer that prepares and passes along crucial details like the trading symbol, the exact time, and whether it's a backtest or a live trade.

It leverages several helper services to manage logging, validation, and connection handling. 

Here's a breakdown of what it can do:

*   **Retrieving Historical Data:** It provides methods to fetch historical candle data (both standard and future – for backtesting purposes), average prices, and order book information.
*   **Formatting Data:** It handles formatting prices and quantities appropriately, considering the execution context.
*   **Flexible Data Retrieval:** The `getRawCandles` method gives you the most control, allowing you to specify date ranges and limits for your candle requests.
*   **Validation:** It includes a validation mechanism to ensure exchange configurations are correct, and this validation is cached to improve performance.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests—like fetching candles or order book data—to the correct exchange implementation based on the current context. To improve efficiency, it keeps a cached record of these exchange connections, so it doesn't have to repeatedly create them.

This service provides several key functions:

*   It gets historical candle data (past prices), and also the next set of candles based on when the simulation or trade is happening.
*   It can determine the current average price, using real-time data when live and calculated based on past data when backtesting.
*   It ensures that prices and order quantities are formatted correctly, according to the specific requirements of the exchange being used.
*   It retrieves order book information, which shows the current buy and sell orders for a trading pair.
*   It has a way to get raw candle data with flexibility on the date range and the number of candles desired.

Essentially, it handles the complexity of communicating with various exchanges, providing a simplified interface for your trading logic.

## Class ConstantUtils

This class provides a set of constants designed to help manage take-profit and stop-loss levels in your trading strategies, all based on a Kelly Criterion approach with exponential risk decay. It’s meant to help you intelligently scale out of positions, rather than just setting a single, fixed target.

Think of these constants as representing percentage milestones along the path to your ultimate profit or loss targets. For example, if you’re aiming for a 10% profit, TP_LEVEL1 triggers when the price reaches 3% of that goal, letting you lock in some early gains.

Here's a breakdown of the constants:

*   **TP_LEVEL1 (30):** A first take-profit level, designed to capture early profits.
*   **TP_LEVEL2 (60):** A mid-level take-profit, securing the bulk of potential gains.
*   **TP_LEVEL3 (90):** A final take-profit level, exiting nearly the entire position.

*   **SL_LEVEL1 (40):** An early stop-loss trigger, helping to reduce risk if the trade isn't performing as expected.
*   **SL_LEVEL2 (80):** A final stop-loss, protecting against significant losses.



Essentially, these constants provide a framework for systematically scaling out of trades.

## Class ConfigValidationService

The ConfigValidationService helps ensure your trading setup is mathematically sound and has a chance of being profitable. It's like a quality control check for your configuration settings. 

It digs into various settings, making sure percentages like slippage and fees are non-negative. Critically, it verifies that your minimum take-profit distance is large enough to account for all costs, guaranteeing a profit when a take-profit order is filled.

Beyond that, it checks for logical relationships between parameters like stop-loss distances, confirms that time-based values are positive integers, and validates the settings related to candle data requests.  The `validate` function is the core of this process, performing all these checks to keep your backtesting framework working correctly.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly and consistently. It's designed to catch common errors before they cause problems in your application.

It checks several things about your column definitions:

*   Each column needs a `key`, `label`, `format`, and `isVisible` property.
*   The `key` and `label` values must be strings and can’t be empty.
*   The `format` and `isVisible` properties need to be actual functions, not just plain values.
*   It makes sure that each `key` is unique within a group of columns.

The `validate` method runs these checks across all your column configurations, giving you a way to proactively identify and fix issues.

## Class ClientSizing

This component handles the crucial task of figuring out how much of an asset to trade. It provides different ways to calculate position sizes, like using a fixed percentage, the Kelly Criterion, or Average True Range (ATR). You can also set limits on the minimum and maximum position size, and a percentage cap to prevent overly large trades.

It’s designed to work seamlessly with trading strategies, ensuring that position sizes are calculated appropriately and consistently.

The calculation process involves several factors and can be customized using the configuration parameters. The `calculate` method performs the actual position sizing calculation, considering all configured parameters and constraints.


## Class ClientRisk

ClientRisk helps manage risk across your entire trading portfolio. It's designed to prevent trades that might break your risk limits, like having too many positions open at once.

Think of it as a safety net that sits between your trading strategies and the market. It ensures that no individual strategy can exceed the defined risk boundaries.

Multiple strategies can share the same ClientRisk instance, allowing it to analyze the combined risk of all your strategies.

It uses a record of active positions to make these decisions, and it automatically saves and loads this record, though this feature is skipped when you're running a backtest.

ClientRisk checks new trading signals – basically, potential trades – against these limits.  If a signal isn't safe, ClientRisk will block it.  It also lets you define custom risk checks, providing information about the potential trade and all your existing positions to help you make informed decisions.

When a trade is opened, `addSignal` registers it. When a trade is closed, `removeSignal` removes it from the system’s record.

## Class ClientFrame

The ClientFrame is responsible for creating the timeline of data that your backtest will use. Think of it as the engine that prepares the historical data for analysis. It ensures that timestamps are generated efficiently, avoiding unnecessary repetition, and allows you to customize the intervals between those timestamps, from minutes to days. 

You can also hook into the process to add your own checks or record information as the timeframe is being built. This component is a core part of how backtests are run and managed.

Specifically, the `getTimeframe` method is the key tool here. It's the method you'll use to get the array of dates for a particular trading symbol, and it cleverly remembers the results to speed up future requests.

## Class ClientExchange

This component handles communication with an exchange to retrieve market data. It provides methods to fetch historical and future candles, calculate VWAP, and format price and quantity data according to exchange specifications.  It's designed for efficiency, using prototype functions to minimize memory usage.

You can use it to retrieve past candle data (`getCandles`), get candles for future simulations (`getNextCandles`), or calculate the volume-weighted average price (`getAveragePrice`). It also has utilities for formatting quantities and prices (`formatQuantity`, `formatPrice`) to match the exchange's rules. 

Need a large batch of raw candles with custom date ranges?  `getRawCandles` gives you that flexibility, ensuring the data respects the execution context and avoids look-ahead bias.  Finally, `getOrderBook` allows fetching order book data, dynamically adjusting the time range based on system configuration.


## Class ClientAction

ClientAction helps you manage and run the custom logic that your trading strategies need to execute. It's like a central hub for handling events and connecting your strategy to the outside world – things like sending notifications, logging data, or managing state.

Think of it as a way to plug in your strategy's specific behaviors, whether you're using Redux for state, or want to send alerts to Telegram. This framework takes care of initializing and cleaning up those custom pieces, ensuring they only run once and are properly disposed of when they're no longer needed.

It provides specialized methods for handling different types of events, like signals from live trading, backtesting, reaching breakeven points, hitting profit/loss targets, or dealing with risk rejections. Each of these methods allows your strategy to react and take actions accordingly. Essentially, it streamlines how your strategy interacts with its environment.


## Class CacheUtils

This class provides a way to easily cache the results of your functions, which can significantly speed up your backtesting process. Think of it like a memory for your code – it remembers previous calculations so it doesn’t have to do them again.

It's a singleton, meaning there's only one instance of it, making it readily available wherever you need it.

The core function `fn` is how you apply caching. You give it a function and a timeframe (like a candle interval), and it returns a modified version of that function that caches its results based on that timeframe.  Essentially, it remembers the function's output for a given timeframe and reuses it if the timeframe hasn't changed.

If you need to force a recalculation of a cached value, `clear` is useful. It clears the cache only for the current testing conditions.

`flush` is more drastic.  It completely removes the cached data for a function, forcing a full recalculation every time. This is handy if the function's logic has changed or you need to free up memory.

Finally, `gc` acts as a cleaner, removing outdated cached data that's no longer relevant based on the current time. Regularly using `gc` helps keep your memory usage in check.

## Class BreakevenUtils

This class provides tools for analyzing and reporting on breakeven events, helping you understand how your trading strategies perform. Think of it as a way to compile data about when your trades reached a breakeven point.

It gathers information from breakeven events – including when they happened, the symbol traded, the strategy used, and the trade details like position size and prices. 

You can use this class to:

*   Get overall statistics about your breakeven events.
*   Generate detailed markdown reports showing all breakeven events in a structured table format, including key details for each event.
*   Save those reports directly to files on your computer for later review and sharing.

The data used comes from a separate service that's listening for breakeven events and storing them, so it's ready for you to analyze. The reports can be customized to include specific columns of data.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It's like a little recorder that listens for these "breakeven" moments.

It gathers information about each successful trade reaching breakeven – details like the signal itself.

This information is then safely stored in a database so you can review it later.

You can easily start listening for these breakeven events, and it makes sure you don’t accidentally start listening multiple times which could cause problems. You’ll get a way to stop the listening process too. If you're not listening, trying to unsubscribe doesn’t do anything.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create reports summarizing breakeven events for your trading strategies. It keeps track of these events for each symbol and strategy you're using. 

It listens for breakeven signals, neatly organizes the data, and generates readable markdown tables that you can easily share or review. You can get overall statistics like the total number of breakeven events.

The service saves these reports to your computer, organizing them into folders based on the symbol, strategy, exchange, frame, and whether it's a backtest.  You have the option to clear out the accumulated data when it's no longer needed, either for specific combinations or everything at once. The service provides functions to subscribe and unsubscribe from the breakeven events and manage storage related to different setups.

## Class BreakevenGlobalService

This service, the BreakevenGlobalService, acts as a central hub for tracking breakeven points within the system. It's designed to simplify how different parts of the application interact with breakeven data and provides a way to monitor these interactions.

Think of it as a middleman: it receives requests related to breakeven calculations, logs them for monitoring purposes, and then passes them on to another service responsible for the actual work. This ensures all breakeven operations go through a single point, making it easier to manage and debug.

Several other services are used by BreakevenGlobalService to validate various aspects of the trading environment, ensuring that everything is set up correctly before processing any breakeven data. 

The `check` function determines if a breakeven trigger is needed, while `clear` resets the breakeven state when a signal is closed. Both functions log their activities before forwarding the task elsewhere.

## Class BreakevenConnectionService

The BreakevenConnectionService manages the tracking of breakeven points for your trading signals. It ensures that you don't create unnecessary instances of the ClientBreakeven object, instead caching them based on the signal ID and whether you're in backtest or live mode.

Think of it as a central hub that creates and manages these breakeven trackers. It's given important tools like a logger and a system for handling events, and it makes sure these trackers are properly cleaned up when signals are no longer needed.

The service gets injected into your trading strategy and uses a clever caching mechanism to efficiently handle breakeven calculations. You can use the `check` method to determine if a breakeven condition is met, and the `clear` method to reset the state when a signal closes, preventing memory problems. The `getBreakeven` property provides a convenient way to access the cached ClientBreakeven instances.

## Class BacktestUtils

BacktestUtils provides helpful tools for running and managing backtests within the trading framework. It's designed to simplify the process and offers several utilities for common backtesting tasks.

To run a backtest, you can use the `run` method, which will generate a sequence of results. If you only need to run a backtest for side effects like logging, use the `background` method, which runs the test without returning any data.

You can also retrieve information about pending signals with `getPendingSignal` and scheduled signals with `getScheduledSignal`.  To see if a pending signal has reached breakeven, use `getBreakeven`.

For more control, `stop` lets you halt a backtest, while `commitCancelScheduled`, `commitClosePending`, and `commitTrailingTake` provide methods to manipulate signals directly. The `commitTrailingStop` and `commitTrailingTake` functions offer a way to adjust stop-loss and take-profit levels using a percentage shift, while `commitBreakeven` will move stop loss to breakeven. `commitActivateScheduled` allows early activation of scheduled signals.

Finally, `getData` and `getReport` allow you to gather performance statistics and generate reports, and `dump` saves those reports to a file. `list` lets you view the status of all active backtest instances. The `_getInstance` property manages backtest instances to ensure isolation between strategy and symbol pairs.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtest strategy runs. It essentially acts as a log for your strategy's signal lifecycle – when it's waiting, opening a position, actively trading, or closing a position.

This service connects to your backtest and listens for important events related to the signals your strategy generates. Every time a tick event occurs – whether it's the signal going idle, opening, being active, or closing – the service captures all the relevant information and stores it in a SQLite database.

The service provides a way to subscribe to signal events, ensuring you only receive updates once.  You can then stop listening by using the unsubscribe function it provides. The service also uses a logger to output debugging information for troubleshooting purposes.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It monitors your trading strategies as they run and keeps track of when signals are closed. This information is then used to generate nicely formatted Markdown reports that you can easily read and share.

The service uses a clever system to organize data, making sure each strategy and symbol has its own dedicated storage area. This allows for clean and efficient data management.

You can request data, generate reports, or save them directly to files within the `logs/backtest/` directory. There’s also a way to clear out old data if you want to start fresh.

To keep things organized, the service lets you subscribe to receive updates as your backtests run and provides a simple unsubscribe function when you no longer need those updates.

## Class BacktestLogicPublicService

This service handles the core execution of backtests. Think of it as the conductor of the backtesting process, managing everything behind the scenes. It automatically passes along important information like the strategy name, exchange, and frame, so you don’t have to keep repeating them in every function call.

The `run` method is your primary way to start a backtest; it takes a symbol and lets the service handle the rest. This method streams back the results of each trading decision (like orders being opened, closed, or canceled) as a continuous flow of data. Essentially, it simplifies the process of running a backtest by taking care of passing context information, making your code cleaner and more manageable.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is designed to efficiently run backtests, especially when dealing with large datasets. It works by pulling timeframes, processing ticks, and generating signals in a continuous stream, avoiding the need to store everything in memory at once. When a trading signal arises, it fetches the necessary historical data and runs the backtest logic.

The service keeps running until all signals are processed or you choose to stop it.  You can think of it as a pipeline: it takes the symbol you want to backtest and provides a flow of results – signals that have been opened, closed, or canceled – as it goes. It’s built to be flexible and responsive, so the backtest can stop early if needed.

Internally, it relies on several core services like the frame service, strategy core, exchange core, method context, and action core to handle data fetching, signal generation, and execution.

## Class BacktestCommandService

BacktestCommandService is essentially a central point for starting and managing backtests within the system. Think of it as a gateway to all the backtesting features. It's designed to be easily used with dependency injection, making it simple to integrate into your application.

This service relies on several other services to handle things like logging, validating strategy and exchange configurations, and processing the actual backtest logic.

The `run` method is the main way to kick off a backtest. You provide it with a symbol (like a stock ticker) and some context, which includes the names of the strategy, exchange, and frame you want to use. It returns a sequence of results—like what happened at each "tick" of the backtest, whether a trade was opened, closed, cancelled, or scheduled—allowing you to analyze how the strategy performed.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers – those pieces of code that respond to specific events in your trading strategy. It's like a central directory that knows about all your actions and makes sure they're still around before your strategy tries to use them. Adding a new action handler is simple: you just register it with the service. 

You can then use the `validate` function to double-check that a handler exists before it's called.  The service is designed to be fast, remembering the results of its checks so it doesn’t have to re-validate unnecessarily. Finally, you can get a complete list of all registered actions if you need to inspect or manage them.



Essentially, it provides a way to organize and verify your action handlers, preventing errors and keeping your backtest running smoothly.

## Class ActionSchemaService

The ActionSchemaService is like a librarian for your trading actions, keeping track of their blueprints. It ensures all your actions are structured correctly and only use approved methods.

It uses a type-safe system for storing action schemas, making sure everything fits together nicely. 

Here’s what it does:

*   **Registers new actions:** It adds new action schemas to the system, checking for errors along the way and preventing duplicates.
*   **Validates action structure:** Before adding an action, it checks to make sure all the necessary parts are present and of the right type.
*   **Allows for updates:** It lets you make small changes to existing action schemas without completely re-registering them.
*   **Provides access to schemas:** It offers a way to retrieve the full details of an action schema when needed.

Essentially, it’s the central place to define and manage how your trading actions work.

## Class ActionProxy

The `ActionProxy` is a safety net for your custom trading actions. It's designed to ensure that errors in your code don't bring down the entire trading system. Think of it as a wrapper that catches any mistakes made during your action's execution, logs them, and keeps the trading process moving forward.

It's created using a factory pattern, meaning you don't directly create an instance; you use the `fromInstance()` method. This lets you wrap your existing action handlers (those that implement the `IPublicAction` interface) in this protective layer.

The `ActionProxy` handles several key events during the trading lifecycle. It provides error-safe versions of methods like `init`, `signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `riskRejection`, and `dispose`.  Essentially, any time your custom logic is called during a trading cycle, `ActionProxy` is there to ensure it doesn’t crash the system, just keeps track of any errors that occur.



If some methods are missing from your implementation it will simply return `null`.


## Class ActionCoreService

The ActionCoreService is like a central traffic controller for your trading strategy's actions. It takes care of figuring out what actions need to be executed, making sure everything is valid, and then sending those actions to the appropriate places.

It's responsible for getting the list of actions from your strategy's blueprint, confirming that your strategy's setup and the actions themselves are all correct, and then triggering those actions in the right order. It uses several helper services to manage logging, validation, and communication.

When a new strategy is set up, the `initFn` method initializes all the actions, loading any necessary information. Throughout the strategy's execution, methods like `signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled`, `pingActive`, `riskRejection`, and `dispose` all route specific events and data to the relevant actions in a sequential manner.  Think of them as event messengers, each handling a different type of trigger.

Finally, the `clear` method allows you to wipe out action data, either specifically for a single action or globally across all strategies, acting as a cleanup tool. The `validate` method ensures everything is in order before execution and avoids redundant checks.

## Class ActionConnectionService

The `ActionConnectionService` acts as a central hub for directing different actions related to your trading strategies. It takes action requests and routes them to the correct, specialized "ClientAction" handler. To improve performance, it remembers previously created actions so it doesn't need to recreate them every time.

Think of it like a switchboard operator, but for your trading logic.

Here's a breakdown of what it does:

*   **Action Routing:** It decides which specific action handler (ClientAction) should handle a particular event (like a signal, breakeven update, or scheduled ping). This routing is based on things like the action's name, the strategy being used, and the exchange it's related to.
*   **Memoization:** It stores frequently used `ClientAction` instances to avoid creating new ones repeatedly, boosting efficiency.  The storage key considers the strategy and frame being used, so actions are isolated for each combination.
*   **Initialization:** It ensures that each `ClientAction` is properly set up before it's used, including loading any necessary persistent data.
*   **Event Handling:**  It has dedicated functions (`signal`, `signalLive`, `signalBacktest`, etc.) for handling specific types of events and forwarding them to the appropriate action handler.
*   **Cleanup:** It includes methods to properly dispose of and clear out cached actions when they're no longer needed.



Essentially, this service simplifies how different parts of your trading system communicate and interact with each other, all while keeping things performant.

## Class ActionBase

This base class, `ActionBase`, is your starting point for creating custom actions within the backtest-kit framework. Think of it as a foundation for handling events like signals, profit milestones, and risk rejections. It provides pre-built logging and context access, so you don't have to reinvent the wheel for those basic functionalities.

You can extend this class to build components for various purposes, such as managing state, sending notifications (email, Discord, Telegram), or collecting analytics and custom data.

Here's how it works:

1.  **Initialization:** When the framework starts, it calls `init()` to set up your action (like connecting to a database).
2.  **Events:** As the strategy runs, different methods like `signal()`, `breakevenAvailable()`, `partialProfitAvailable()`, and `riskRejection()` are triggered. Each method handles specific events.  `signalLive()` is for live trading only, and `signalBacktest()` is for backtesting.
3.  **Cleanup:**  When the process is finished, `dispose()` is called to release resources and ensure everything is cleaned up properly.

Each method has a default implementation that logs the event, giving you immediate visibility into what's happening. You can override these methods with your own code to perform custom actions based on the events. You get access to details like the strategy name, frame name, and the name of the action itself to further customize your logic.
