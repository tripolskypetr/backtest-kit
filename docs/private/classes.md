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

The WalkerValidationService helps you keep track of and confirm the settings for your parameter sweeps, often used for optimizing strategies or tuning hyperparameters. Think of it as a central place to manage your walker configurations.

It lets you register new walkers, allowing you to define the ranges of parameters you'll be testing. 

Before you actually run a sweep, you can use this service to double-check that the walker you're referencing exists, preventing errors. 

To make things faster, it remembers whether walkers are valid, so it doesn't have to re-check them repeatedly. 

You can also get a complete list of all registered walkers if you need to see what's available. 

It uses a map internally to store walkers and a logger for any helpful messages.

## Class WalkerUtils

WalkerUtils provides handy tools for managing and running your walkers, which are essentially automated testing and analysis systems for trading strategies. It simplifies the process of executing walkers and provides convenient access to their results.

Think of it as a central hub for interacting with your walkers. It automatically figures out important details like the exchange and timeframe being used, so you don’t have to. There's only one instance of this utility, making it easy to use throughout your application.

You can:

*   Run walkers to compare strategies and get back data.
*   Kick off walkers in the background if you just want to log progress or trigger other actions without directly using the results.
*   Gracefully stop walkers, preventing new signals from being generated while allowing existing signals to finish. This ensures a clean shutdown.
*   Retrieve detailed results, including performance data, for all strategies within a walker.
*   Generate easy-to-read reports in markdown format and save them to your computer.
*   See a quick list of all your active walkers and their current status.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies' schemas – those blueprints that define how they work. It uses a secure and organized system to store these schemas, ensuring they're always consistent and type-safe.

You add new strategies (walkers) using `addWalker` and find them again later by their name using `get`. 

Before a new strategy is officially registered, the service quickly checks to make sure it has all the necessary components with `validateShallow`.

If you need to update an existing strategy, `override` allows you to apply changes selectively, just replacing the parts that need updating. Essentially, it’s a centralized place to manage and control your trading strategy definitions.

## Class WalkerReportService

WalkerReportService helps you keep track of your optimization experiments. It acts like a recorder, capturing the results of your strategy tests and neatly storing them in a SQLite database. 

This service listens for updates from your optimization process and logs key details like performance metrics and statistics. It remembers the best-performing strategy it's seen so far and allows you to monitor how the optimization is progressing. You can then use this data to analyze and compare different strategies.

To use it, you'll subscribe to receive optimization updates and unsubscribe when you're done. The subscribe function ensures you only listen once, preventing issues with duplicate data.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to create and store reports about your trading strategies, specifically focused on the data produced by "walkers" – likely automated processes running your strategies. It listens for events coming from these walkers, collects the results, and then transforms that data into readable markdown tables.

Think of it as a reporting engine that keeps track of how different strategies perform, generates summary tables, and neatly saves these summaries as markdown files. Each walker gets its own dedicated space to store its results.

Here's a bit more detail:

*   It uses a "loggerService" to write debugging messages.
*   It manages storage for results using a technique called memoization, ensuring each walker's data is isolated.
*   You can subscribe to walker events to receive updates and unsubscribe when you no longer need those updates.
*   The `tick` method is the core component that processes each event as it comes in.
*   You can fetch specific data for a walker, generate a full report, or save the report directly to a file.
*   You have the option to clear data – either for a specific walker or all walkers.

## Class WalkerLogicPublicService

This service helps coordinate and manage the different parts of a walker, which is a key component for running and analyzing trading strategies. It builds upon a private service to automatically pass along important information like the strategy name, exchange, frame, and walker name – so you don’t have to manually handle that.

The `run` method allows you to start a comparison of walkers for a specific symbol, automatically providing the necessary context for each walker to function correctly. Think of it as a streamlined way to execute backtests across multiple strategies. 

You'll also find access to services for logging and managing walker schemas.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other in a structured way. It acts as an orchestrator, managing the execution of each strategy and keeping track of their progress.

You’ll get updates as each strategy finishes running, allowing you to monitor performance in real-time. The service also identifies and tracks the best-performing strategy throughout the entire comparison process.

Finally, it provides a complete report with all strategies ranked based on their results. It relies on other services to handle the actual backtesting and schema management. 

To use it, you provide a symbol, a list of strategies you want to compare, the metric to optimize for (like profit or Sharpe ratio), and some contextual information about the trading environment. The `run` method then executes the backtests sequentially, giving you progress reports along the way.


## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with walker functionality within the backtest-kit framework. Think of it as a friendly interface that makes accessing the walker's capabilities easier and more organized. 

It bundles together several important services, including those for handling walker logic, schemas, validations (for strategies, exchanges, frames, and the walkers themselves), and risk and action management. 

The key feature is the `run` method. This method lets you execute a walker comparison, specifying the trading symbol and providing context like the names of the walker, exchange, and frame involved. The result is a stream of data representing the walker's output.


## Class TimeMetaService

The TimeMetaService helps you reliably get the latest candle timestamp for a specific trading setup – think a particular symbol, strategy, exchange, and timeframe – even outside of the normal trading tick cycle. It’s like a central memory bank for these timestamps, constantly updated.

This service keeps track of timestamps using special streams and makes it easy to retrieve them. If you’re already in the middle of a trading action, it pulls the timestamp directly from the current environment. If you're not, it looks up the most recent value that's been stored.

If a timestamp hasn’t been received yet, it will wait briefly before giving up.

You can also clear out these timestamp records to clean up memory or reset the data when you start a new backtest or trading session. This is important to ensure you're not working with old, inaccurate timestamps. The service is automatically managed within the system and updated behind the scenes.

## Class SyncUtils

The SyncUtils class helps you analyze and understand the lifecycle of your trading signals. It gathers information about signal openings and closings, providing statistical summaries and detailed reports. Think of it as a tool to see how your signals are performing over time.

You can use it to get overall statistics about your signal events, like the total number of opens and closes. It also lets you create markdown reports, which are essentially nicely formatted tables showing the details of each signal—including when it opened, why it closed, and key pricing information. Finally, it’s easy to save these reports to files, so you can review them later or share them with others. The reports can be customized to display specific data points.

## Class SyncReportService

The SyncReportService helps you keep track of what’s happening with your trading signals. It essentially watches for signal events – when a signal is created and when it’s closed – and records all the important details.

This service listens for signals being opened (like when a limit order is filled) and closed (when a position is exited), capturing data like profit and loss (PNL) and the reason for the close. It then stores this information in a report file in a structured format for later review and auditing.

To prevent issues with multiple subscriptions, the service manages its connection to the signal event stream safely. You can easily start and stop the service's monitoring using the `subscribe` and `unsubscribe` methods, guaranteeing that it only listens when you want it to. A logger is included to help you debug any potential problems.

## Class SyncMarkdownService

This service helps you create and save reports detailing the lifecycle of your trading signals. It keeps track of signal openings and closures for each symbol, strategy, exchange, and timeframe you're using in your backtests.

It listens for signal events and organizes them, then generates readable markdown reports with statistics like total events, opens, and closes. These reports are saved to disk, making it easy to review your signal performance.

To start receiving these events, you need to subscribe. Once subscribed, it automatically tracks signal events. To stop tracking and clear all data, you can unsubscribe.  You can also request specific data or reports for a particular symbol, strategy, exchange, or timeframe. Finally, you have the ability to clear the accumulated data for specific combinations or all data.

## Class StrategyValidationService

This service helps you keep track of and confirm that your trading strategies are set up correctly. It acts as a central place to register your strategies, ensuring they exist before you try to use them, and verifying that any related risk profiles and actions are also valid. To help things run smoothly, it remembers the results of previous validations, so it doesn't have to check everything every time. 

You can add new strategies using `addStrategy`, which registers them within the service.  If you need to confirm a strategy's setup, use `validate`.  Finally, `list` gives you a complete overview of all the strategies currently registered with the service. 

The service also relies on other services: `riskValidationService` and `actionValidationService` for verifying risk profiles and actions, respectively.

## Class StrategyUtils

StrategyUtils provides a way to analyze and report on the activity of your trading strategies. It's like a central hub for gathering information about what your strategies are doing, like when they're taking profits, setting stop losses, or canceling orders.

You can use it to get statistical summaries of your strategy’s actions – how many times it’s taken a partial profit, for example. It also allows you to generate detailed reports in markdown format, showing all the events that occurred for a specific trading strategy and symbol, including the price, percentage values, and timestamps.

Finally, you can easily save these reports as files, complete with a descriptive filename based on the symbol, strategy name, and timeframe. This makes it simple to keep track of your strategy’s performance and identify areas for improvement. The data used by this utility is collected and stored by another component called StrategyMarkdownService.

## Class StrategySchemaService

This service helps keep track of different trading strategy blueprints, ensuring they're all structured correctly. Think of it as a central place to store and manage how your trading strategies are defined. 

It uses a special system to store these blueprints in a safe and organized way.

You can add new strategy blueprints using `addStrategy`, and then retrieve them later by their name using `get`.

Before adding a new blueprint, it checks to make sure it has all the necessary parts and they're the right type of data, thanks to `validateShallow`.

If a blueprint already exists, you can update parts of it with `override`. It's designed to make sure your strategy blueprints are consistent and reliable.

## Class StrategyReportService

This service is designed to keep a detailed record of what's happening during your trading strategy's backtests. Think of it as creating an audit trail for every significant action your strategy takes.

To start logging events, you need to call `subscribe()`. This turns on the logging process. When an action occurs, like canceling a signal, closing a position, or taking a partial profit, the corresponding function (`cancelScheduled`, `closePending`, `partialProfit`, etc.) is called. Each of these functions records the specifics of that event to a separate JSON file, creating a complete history.

Unlike other reporting methods that might store events temporarily, this service writes each event directly to disk, making it perfect for creating reliable records for review and analysis. When you’re done, `unsubscribe()` turns off the logging. It’s designed to be safe to call repeatedly even if it hasn't been previously called.

Here's a quick rundown of the different event types it tracks:

*   **cancelScheduled:** Records when a scheduled signal is canceled.
*   **closePending:** Records when a pending signal is closed.
*   **partialProfit:** Records when a portion of the position is closed for profit.
*   **partialLoss:** Records when a portion of the position is closed at a loss.
*   **trailingStop:** Records adjustments to the stop-loss.
*   **trailingTake:** Records adjustments to the take-profit.
*   **breakeven:** Records when the stop-loss is moved to the entry price.
*   **activateScheduled:** Records when a scheduled signal is activated early.
*   **averageBuy:** Records new averaging entries.

The `loggerService` property holds the logging service.


## Class StrategyMarkdownService

This service helps you track and report on strategy activity during backtesting or live trading. It acts like a central hub for events like cancels, closes, and adjustments to stop-loss and take-profit levels.

Think of it as a memory bank that temporarily stores these events before generating reports.  Instead of writing each event to a file immediately, it holds onto them for efficient batch reporting.

To start using it, you need to “subscribe” to event collection.  Then, as your strategy executes, events are automatically recorded.  You can later retrieve statistics or generate a markdown report to analyze the strategy's behavior.  When you're done, you “unsubscribe” to stop collecting events and clear any stored data.

It provides methods to get detailed data, create readable markdown reports, and save those reports as files with timestamps. You also have the option to clear out just specific data or everything if needed.


## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for managing strategy operations within the backtesting and live trading environments. It handles a lot of the behind-the-scenes work, ensuring signals are processed and positions are managed correctly, especially when dealing with partial closes and DCA entries.

Think of it as a helper service that combines data from various sources and provides consistent access to key position information.

Here's a breakdown of what it does:

*   **Signal Management:** It handles retrieving pending and scheduled signals, checking their status, and allowing for early activation or cancellation.
*   **Position Data:**  It provides access to vital details about open positions, including the cost basis, entry prices, percentage held, and potential profit/loss. These calculations account for DCA entries and partial closes.
*   **Validation:** It validates strategies and risk configurations, preventing errors and improving the reliability of the backtesting process.
*   **Operational Functions:**  It allows for actions like stopping a strategy, canceling scheduled signals, and closing pending positions.
*   **Caching:** It uses caching to speed up repeated validations.
*   **DCA Handling:** Key methods accurately track and calculate information related to dollar-cost averaging strategies.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for managing trading strategies within the backtesting framework. It intelligently routes calls to the correct `ClientStrategy` instance, ensuring that each strategy operates with its own isolated data and configuration. Think of it as a dispatcher for your trading logic.

To optimize performance, it employs caching. Whenever a strategy is needed, it first checks its cache; if it’s not there, it creates it and stores it for future use. This avoids redundant initialization and speeds up the backtesting process.

The service provides several methods to access and manage information about strategies and positions. These methods provide details like pending signals, profit/loss, entry prices, and partial closes, all while taking into account factors like DCA entries, slippage, and fees.

Importantly, it handles both live (`tick()`) and backtesting (`backtest()`) operations, ensuring that strategies can be run in either environment.  You can also use it to control strategies, stopping their operation or clearing their data from the cache when necessary.  Furthermore, the service provides ways to interact with signals - activating them early or closing them without immediately affecting the underlying strategy.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how trading signals are stored during backtesting. Think of it as a central hub that connects your backtesting logic with a specific storage method. 

You can easily swap out different storage implementations – persistent storage on disk, in-memory storage for faster testing, or even a dummy storage that does nothing – without changing your core strategy code. It’s like having interchangeable storage engines.

Several methods are provided to handle different signal lifecycle events like when a signal is opened, closed, scheduled, or cancelled, simply forwarding those events to the active storage adapter. You can also retrieve signals by ID or list them all. 

The `useStorageAdapter` method is key; it lets you specify which storage type to use. Shortcuts like `useDummy`, `usePersist`, `useMemory` make it even quicker to switch between storage options. Finally, `clear` is a useful method to reset the adapter and ensure a fresh start with the persistent storage if your working directory changes.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how your backtest kit stores signal data. Think of it as a central point that can connect to different "backends" for storing information, like a database, memory, or even a dummy system for testing. It’s designed to be easily swapped out so you can change how your data is saved without altering the core backtest logic.

You can choose between persistent storage (saving to disk), in-memory storage (keeping data only during the session), or a dummy adapter that does nothing. The `useStorageAdapter`, `useDummy`, `usePersist`, and `useMemory` methods offer simple ways to switch between these options.

The adapter handles various events related to signals, such as when they are opened, closed, scheduled, or cancelled, passing these events on to the currently active storage backend. It also provides functions to find signals by their ID and list all signals. The `handleActivePing` and `handleSchedulePing` methods keep track of when signals are active or scheduled.

Finally, the `clear` method is helpful for resetting the storage to its default state, particularly when you need to ensure a fresh start for each strategy run, especially when the project directory changes.

## Class StorageAdapter

The StorageAdapter is like the central hub for keeping track of all your trading signals, both those from backtesting and those from live trading. It automatically updates its records as new signals arrive and ensures you don't accidentally subscribe to signal sources multiple times.

You can think of it as having two main sections: one for signals generated during testing and one for live, real-time signals.

Here’s what you can do with it:

*   **Enable/Disable:** You can turn the signal storage on or off.  Turning it on tells it to start listening for new signals.  Turning it off stops that process.
*   **Find a Signal:**  If you know the unique ID of a specific signal, you can easily retrieve it.
*   **List Backtest Signals:**  Get a list of all signals that were created during your backtesting runs.
*   **List Live Signals:**  See a list of all signals coming in from your live trading environment.


## Class SizingValidationService

This service helps keep track of your position sizing strategies and makes sure they’re set up correctly before you start trading. It acts like a central registry where you can register new sizing methods. 

The `addSizing()` function allows you to register new sizing strategies. 

Before using a sizing strategy, you can use the `validate()` function to confirm it exists, preventing errors. It even remembers the results of these checks to speed things up.

Finally, `list()` gives you a complete overview of all the sizing strategies currently registered.


## Class SizingSchemaService

This service helps you keep track of different sizing strategies for your trading tests. It's like a central place to store and manage how much of an asset you’ll trade in each scenario.

It uses a special system to ensure your sizing strategies are structured correctly. Before a sizing strategy is added, it checks if it has all the necessary pieces in place.

You can add new sizing strategies using `register`, update existing ones with `override`, or simply get a sizing strategy you've already defined using `get`. This service is designed to keep your sizing strategies organized and easy to access.


## Class SizingGlobalService

The SizingGlobalService is a central tool for determining how much to trade in each operation. It handles the complex calculations involved in sizing positions.

It relies on other services like sizing validation to ensure calculations are sound.

Think of it as the engine that figures out the right amount of assets to allocate based on your risk profile and trading strategy. It’s used both behind the scenes by the system and available for your own custom logic.

The `calculate` method is the core function, accepting parameters about your risk tolerance and returning the calculated position size.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for all position sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the correct sizing implementation based on a specified name. 

To boost performance, it remembers (caches) these sizing implementations, so it doesn't have to recreate them every time they're needed.

When calculating a position size, it considers your risk parameters and the chosen sizing method – options include fixed percentage, Kelly Criterion, and ATR-based sizing.  The sizing name is an empty string when there's no specific sizing configuration applied. 

The service relies on two other services: a logger for tracking activity and a sizing schema service for defining sizing rules.

## Class ScheduleUtils

This class helps you manage and analyze scheduled trading signals. It acts as a central point for accessing information about signals that are waiting to be executed, including those that were cancelled.

You can use it to gather data about signal queue length, cancellation rates, and how long signals typically wait. 

It's designed to make creating reports easier, automatically generating formatted markdown reports that summarize signal activity for specific trading strategies and symbols.

The class provides methods to retrieve data, generate reports, and save those reports as files, allowing for detailed monitoring and analysis of your signal scheduling process. It's available as a single instance, making it simple to use within your backtest kit.


## Class ScheduleReportService

This service helps you keep track of when signals are scheduled, opened, and cancelled, storing that information in a database. It's designed to monitor signals and log their lifecycle events, which is particularly useful for understanding delays in order execution.

The service listens for these events and records the time it takes from when a signal is initially scheduled to when it's either executed or cancelled. This data is then saved so you can analyze it later.

To use it, you subscribe to receive signal events, and it prevents you from accidentally subscribing multiple times.  When you’re finished, you can unsubscribe to stop the monitoring. The service uses a logger to help you debug any issues.

## Class ScheduleMarkdownService

This service automatically generates reports detailing the scheduling and cancellation of signals for your trading strategies. It monitors signal events, tracking when signals are scheduled, opened, and cancelled, organizing this information by strategy. 

The service then compiles this data into clear, readable markdown tables, including useful statistics like cancellation rates and average wait times. These reports are saved as `.md` files in a designated log directory, allowing for easy review and analysis of your strategies' signal behavior.

You can subscribe to receive signal events and control the data accumulating. There's also a way to retrieve statistics or full reports for specific strategies and symbols. The service offers methods for clearing accumulated data, both globally or for specific strategies and configurations. Finally, it provides a `dump` function to save these reports directly to disk.

## Class RiskValidationService

This service helps you keep track of your risk management setups and makes sure they're ready to go before you use them. It essentially acts as a central place to register all your risk profiles, like different sets of rules and checks. 

Before any trading operations, you can use the service to double-check that the necessary risk profiles are properly registered. The service also remembers previous validations to avoid unnecessary checks, making things faster. 

You can add new risk profiles using `addRisk`, confirm their existence with `validate`, and get a complete list of all registered profiles with `list`. It's designed to streamline your risk management workflow and prevent errors.

## Class RiskUtils

This class provides tools for examining and reporting on risk rejection events within your trading system. It gathers information about rejections—like when they happened, which symbol was involved, the strategy used, and why—to help you understand and improve your risk management. 

You can use it to get statistical summaries of rejection data, such as the total number of rejections or breakdowns by symbol and strategy. It can also generate nicely formatted markdown reports detailing each rejection event, including important details like the position, exchange, price, and the reason for the rejection.

Finally, you can easily export these reports to files, making it simple to share rejection analyses or keep a record of risk events for later review. The reports include a summary of key statistics at the end.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a safe and organized way. It uses a special system to store these schemas, ensuring they are consistently structured. 

You can add new risk profiles using the `addRisk()` method, and access them later by their name using the `get()` method.

Before a new risk schema is added, it's checked to make sure it has all the necessary parts with the right types – this is done by `validateShallow()`.  If a risk schema already exists, you can update parts of it using the `override()` method. The service also relies on a logging system (`loggerService`) to track what's happening.

## Class RiskReportService

The RiskReportService helps you keep a record of when trading signals are rejected by your risk management system. It acts like a log, capturing details like why a signal was rejected and what the signal was.

It listens for these rejection events and saves them into a database, making it easier to analyze potential risks and audit your trading process.

You can easily tell it to start watching for these events using `subscribe`, and it makes sure you don't accidentally subscribe multiple times. When you're finished, use `unsubscribe` to stop the service from recording any more rejections. The logger service is for providing debug output, and the tickRejection handles processing the events.

## Class RiskMarkdownService

This service helps you create reports detailing rejected trades due to risk management. It listens for risk rejection events and keeps track of them for each symbol and strategy you're using. 

It can then automatically generate readable markdown tables summarizing those rejections, along with useful statistics like the total number of rejections, broken down by symbol and strategy.

The service saves these reports as files on your disk, organized by symbol and strategy, making it easy to review and analyze your risk management performance.

You can subscribe to receive risk rejection events, and the service uses a clever system to ensure each symbol-strategy combination has its own dedicated storage. The `clear` function lets you wipe the data, either for a specific combination or everything at once. You can also programmatically access the stored data and reports.

## Class RiskGlobalService

This component, RiskGlobalService, handles all the risk-related checks and management needed for trading. It acts as a central point for validating risk configurations and ensuring trades comply with defined limits. 

It leverages several internal services to handle different aspects of risk – from connection to validation. 

Essentially, before a trade is executed, this service verifies that it’s within acceptable risk parameters.

Here’s a breakdown of its functions:

*   **Validation:**  It checks and caches risk configurations to prevent repeated validations.  You’ll also see logging related to these validations.
*   **Signal Checks:** `checkSignal` determines if a trading signal can proceed based on risk limits.
*   **Signal Management:**  `addSignal` records when a new trade (or “signal”) is opened, and `removeSignal` updates the system when a trade is closed.
*   **Data Clearing:** `clear` allows for resetting the risk data, either for all instances or for a specific risk configuration.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the backtest-kit framework. It's responsible for directing risk validation requests to the correct risk implementation based on a specified risk name.

To improve performance, it caches these risk implementations, avoiding the need to recreate them repeatedly. The system uses memoization, essentially remembering previously obtained risk implementations based on the risk name, exchange, frame and backtest mode.

The `checkSignal` method is crucial for determining whether a trading signal is permissible, ensuring it adheres to defined risk limits like portfolio drawdown and position size. If a signal violates these limits, it's rejected, and a notification is triggered.

When a trade is initiated, `addSignal` registers it with the risk system; conversely, `removeSignal` handles the removal of a closed trade. The `clear` method allows you to manually clear the cached risk implementations, useful for resetting the system or troubleshooting. If your strategy doesn't require specific risk configurations, you can use an empty string as the risk name.

## Class ReportUtils

ReportUtils helps you control which parts of your trading system generate report data. It lets you turn on and off logging for different activities like backtesting, live trading, performance analysis, and more.

Think of it as a way to fine-tune what data is collected, which can be useful for focusing on specific areas or conserving resources.

The `enable` function is key – it allows you to subscribe to specific report services and start real-time logging to JSONL files, adding valuable metadata. Remember that you *must* use the cleanup function it returns to stop this logging later, or you risk memory issues.

Conversely, `disable` lets you stop logging for certain services without affecting others, a useful way to temporarily pause data collection. This function doesn't provide a cleanup function because it immediately stops the logging process.

## Class ReportBase

This component handles writing reports to files in a standardized format, making it easy to collect and analyze data from your backtesting framework. It creates a single JSONL file for each report type, appending new data as lines in the file.

The system is designed to be efficient and reliable, with built-in safeguards like backpressure handling to manage write speeds and a timeout to prevent operations from hanging indefinitely. It also includes automatic directory creation and error handling.

You can filter these reports later using metadata like the trading symbol, strategy name, exchange, timeframe, signal ID, or walker name. 

The adapter utilizes a singleshot initialization process, so you don't have to worry about setting everything up multiple times. The `write` method is the main way to add data, and it combines the event data with relevant metadata and a timestamp for easy processing.


## Class ReportAdapter

The ReportAdapter helps manage how your trading data is logged and stored. Think of it as a flexible system that lets you easily change where and how your reports are saved without changing your core trading logic.

It uses a pattern that allows for swapping out different storage methods, keeping things organized.

Crucially, it ensures that you only have one instance of each type of report storage (like one for backtest data, one for live trading data, etc.) to avoid confusion and resource issues.

The system automatically creates these storage instances the first time you write data to them.

You can customize the storage method by setting a new "report factory," which is like choosing a specific type of storage. The default is a simple JSONL format, ideal for creating files that can be easily read and processed.

The `writeData` method is your go-to function for saving data; it handles the writing process and initializes storage as needed.

If you need to refresh your storage locations, perhaps after changing directories, the `clear` method clears the storage cache, making sure new storage instances are created. 

For testing or development, you can even switch to a "dummy" adapter that simply throws away data. And of course, you can easily return to the default JSONL storage whenever needed.

## Class PriceMetaService

The PriceMetaService helps you reliably get the latest market price for a specific trading setup, regardless of when you need it. It keeps track of prices for each symbol, strategy, exchange, and time frame combination, updating them automatically as new data arrives.

Think of it as a memory bank for prices, ensuring you have access to the most recent information even when you're not directly executing a trade. If a price hasn't been received yet, it waits briefly for the data to arrive.

This service is designed to be cleaned up when a strategy begins, preventing outdated information from being used. You can also manually clear the stored prices to free up resources or to ensure a fresh start. It's primarily updated by the system after each trading tick and integrates with other services to fetch live prices if needed.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, also known as position sizing. 

It provides several pre-built methods to calculate the right size, like fixed percentage, Kelly Criterion, and ATR-based approaches. 

Each method includes built-in checks to ensure the sizing settings are appropriate for the method being used, preventing errors. 

You don't need to create an instance of this class to use its functions; they're static methods available directly on the class itself.

Here's a quick breakdown of each method:

*   **fixedPercentage:** Determines position size based on a predetermined percentage of your account balance.
*   **kellyCriterion:** Calculates position size using the Kelly Criterion, which aims to maximize long-term growth based on win rate and win/loss ratio.
*   **atrBased:** Uses the Average True Range (ATR) to size positions, factoring in volatility.

## Class PersistStorageUtils

This class provides tools for safely storing and retrieving signal data, ensuring that your backtest or live trading system doesn't lose information even if something goes wrong. It automatically manages how your signals are stored on disk, creating separate files for each signal to keep things organized.

You can use it to load previously saved signal data when your system starts up, and it also handles saving updates to that data as your system runs. The process uses special techniques to make sure that writes are reliable, even if the system crashes unexpectedly.

It offers some handy options too. You can even customize how your data is stored using custom adapters, or use a “dummy” adapter that simply ignores all write requests—useful for testing. If you're dealing with situations where the root directory of your project changes, you'll want to clear the storage cache to avoid issues. Finally, it lets you easily switch back to the default JSON storage format.

## Class PersistSignalUtils

The `PersistSignalUtils` class helps manage how signal data is saved and loaded for your trading strategies. It automatically handles creating storage locations for each strategy, allowing you to customize how data is stored and ensuring that your signal data remains consistent even if there are unexpected interruptions.

This class is primarily used by `ClientStrategy` to save and retrieve signals—think of it as a way to remember where your strategy was last left off.

Here's a breakdown of what it offers:

*   **Customizable Storage:** You can plug in different ways to store signals using custom adapters.
*   **Safe Data Handling:** It makes sure writes to the signal data happen securely, reducing the risk of corruption.
*   **Signal Restoration:**  `readSignalData` allows you to load previously saved signal data. If no data exists, it returns null.
*   **Persistence:** `writeSignalData` saves signal data, ensuring that changes are written atomically.
*   **Easy Switching:** You can switch between different persistence methods like JSON or even a dummy adapter that ignores writes for testing.
*   **Cache Management:** The `clear` function helps refresh storage locations when the working directory changes, which is useful for longer strategy runs.



The `PersistSignalFactory` and `getStorage` are internal aspects of how the persistence is managed and generally aren’t something you’ll directly interact with.

## Class PersistScheduleUtils

This class provides tools to reliably save and load scheduled signals, which are important for keeping track of actions in your trading strategies. It ensures each strategy has its own storage, allows you to plug in different ways of storing the data (like JSON files or custom adapters), and handles data updates carefully to prevent errors if the process crashes. 

The class is specifically used by the ClientStrategy when it's running in live mode.

It offers these features:

*   You can register custom methods for saving data.
*   A cache is used for storage, and it can be cleared when needed, like when the working directory changes.
*   There's a built-in option to switch to a default JSON storage method.
*   It also includes a dummy mode that pretends to save data but actually does nothing – useful for testing.

The `readScheduleData` method is used to load saved signals, while `writeScheduleData` saves them. These operations are designed to be safe and won’t lose data even if something unexpected happens.


## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save the details of your active trading positions, ensuring they are reliably stored and can be recovered. It keeps track of positions for different risk profiles and uses a clever system to avoid data loss, even if something unexpected happens.

You can customize how this data is stored using different adapters, or revert to the standard JSON format. It also provides a convenient way to clear the saved data when needed, for example when the working directory changes. 

There's even a "dummy" adapter that lets you test without actually saving anything. This class is essential for ClientRisk when it's running in live mode, ensuring that your trading positions are safe and consistent. You can retrieve saved positions using `readPositionData`, and update them using `writePositionData`.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage how your trading strategy remembers its progress – specifically, the profit and loss levels. It keeps track of this data for each symbol and strategy combination, making sure it doesn't get lost if your strategy restarts.

It cleverly caches these data points to avoid repeatedly reading them, and it allows you to plug in different ways of storing them if the default method isn't what you need.

Importantly, it’s designed to be reliable, using techniques to prevent data corruption even if your program crashes unexpectedly.

Here’s a breakdown of its key features:

*   **Custom Storage:** You can define how partial data is stored.
*   **Safe Saving:** It writes data in a way that minimizes the risk of loss due to crashes.
*   **Cache Management:** It manages stored data efficiently.
*   **Easy Reset:** You can clear the cached data if the program's base directory changes.
*   **Testing Mode:** It provides a dummy mode for testing purposes where no actual data is persisted.



To use it, the class provides ways to read existing data, write new data, and switch between different storage methods. It’s a crucial component for strategies needing to remember their state between runs.

## Class PersistNotificationUtils

This class provides tools for safely and reliably saving and loading notification data. It handles storing each notification as a separate file, ensuring that even if something unexpected happens, your data won't be lost or corrupted.

It’s designed to work closely with the NotificationPersistLiveUtils and NotificationPersistBacktestUtils, providing the foundational persistence layer they depend on.

You can even customize how the notifications are stored using a persistence adapter. The class also has built-in mechanisms to manage storage instances and clear caches when needed, like when the working directory changes. It offers options to switch between different storage methods, including using JSON format or a dummy adapter that simply discards any changes – useful for testing.

## Class PersistMemoryUtils

This class provides tools for saving and retrieving memory data, ensuring that information isn't lost even if the application restarts. It intelligently manages storage locations based on identifiers, grouping data for organization. You can customize how this data is stored using different adapters, like JSON or even a "dummy" adapter that simply discards any data written – useful for testing.

The class provides functions to read, write, and delete memory entries, all handled in a way that minimizes data corruption. It also has a way to clear its internal cache and to clean up storage associated with specific data sources when they are no longer needed. Importantly, it includes a method to list all existing memory entries, which is used to rebuild indexes.

## Class PersistMeasureUtils

This class helps manage how cached data from external APIs is stored and retrieved persistently, like saving it to a file. It ensures that each cache is unique based on the timestamp and the symbol being tracked.

You can customize how this caching happens by using different adapters. It also handles reading and writing data safely, even if the system crashes unexpectedly.

Here's a breakdown of what it offers:

*   It creates a way to keep track of cached data separately for each symbol and time.
*   You can choose a specific adapter to control how the cache is stored (e.g., JSON file, or something else).
*   It ensures updates to the cache are reliable.
*   It provides a way to clear the entire cache when needed, such as when the working directory changes.
*   There are built-in options for using a standard JSON adapter or a dummy adapter that just ignores all writes (useful for testing).

The `readMeasureData` method retrieves the data, while `writeMeasureData` saves it.  The `usePersistMeasureAdapter` method allows you to plug in your own way of handling persistence.

## Class PersistLogUtils

This class, `PersistLogUtils`, handles how log data is saved and loaded, ensuring that your trading strategies don't lose important information. It's designed to be reliable, even if your application crashes unexpectedly.

It uses a special storage system to keep track of each log entry individually, associating it with a unique ID.

You can customize how the data is stored – for example, choosing a different format or location.  It also provides a way to switch between different storage methods, like using a standard JSON format or a dummy adapter that simply throws away the data for testing purposes.

The `readLogData` function retrieves all saved log entries, and `writeLogData` persistently saves new entries to disk, using atomic operations to prevent data loss. The `clear` function allows you to reset the storage when your working directory changes, making sure the logs are handled correctly in different environments.

## Class PersistCandleUtils

This utility class helps manage how candle data (like price information) is stored and retrieved from files. It's designed to keep things organized and efficient, especially when dealing with a lot of data.

Each candle is saved as a separate file, making it easy to pinpoint specific data points. The system checks to make sure the cache is complete before returning data, ensuring you get a full picture.

If any data is missing or becomes incomplete, the cache is automatically refreshed.

You can even use different ways to store the data, including a default JSON format or a 'dummy' mode that simply ignores writes for testing purposes. The `clear` function is helpful when the location of your data storage changes, like when a strategy runs multiple times. This ensures fresh data isn't mistakenly used. Lastly, you can register custom persistence adapters for unique storage requirements.

## Class PersistBreakevenUtils

This utility class helps manage and save the breakeven state of your trading strategies, ensuring that your progress isn't lost. It’s designed to handle reading and writing this data to files on your computer. 

The class uses a clever system to avoid creating unnecessary files – it creates a single storage instance for each combination of trading symbol (like BTCUSDT), strategy name, and exchange. If you want to customize how data is stored, you can register your own persistence adapter. 

Data is stored in a specific folder structure under a `dump/data/breakeven` directory, with each strategy getting its own file. When updates happen, it writes data safely to prevent issues.

You can clear the internal storage if you need to, for example when your working directory changes. To test or temporarily disable persistence, it also offers a dummy adapter that simply ignores all write attempts. You can also easily switch back to using the default JSON adapter.

## Class PersistBase

PersistBase provides a foundation for saving and retrieving data to files, ensuring your data remains consistent even if things go wrong. It's designed to reliably store information by automatically handling potential file corruption and using atomic writes to prevent data loss.

The class manages where your data files are stored and provides methods for reading, writing, and checking for the existence of data.  It also offers a way to get a list of all the data identifiers it manages, sorted alphabetically.  You'll find built-in safeguards to make sure the persistence directory is properly set up and that existing files are valid.  It supports asynchronous operations for efficiency, allowing you to work with many files without blocking your program. The initialization process is only run once when needed.

## Class PerformanceReportService

The PerformanceReportService helps you understand where your trading strategies are spending their time. It acts as a listener, capturing timing data from your strategy execution. 

It logs this data, including how long things take and relevant information about them, and stores it in a database. This allows you to analyze performance, identify bottlenecks, and ultimately optimize your strategy.

You can easily subscribe to receive these timing events, and there's a built-in mechanism to prevent multiple subscriptions. When you're done, you can unsubscribe to stop receiving and logging events. A logger service is also available to help with debugging.


## Class PerformanceMarkdownService

This service is designed to gather and analyze performance data during your trading simulations. It listens for performance events, organizes metrics for each strategy you're testing, and then calculates key statistics like averages, minimums, maximums, and percentiles.

It can automatically generate detailed reports in markdown format, which includes insights into potential bottlenecks in your strategies. These reports are saved to disk, making it easy to review your results.

The service uses a storage system that keeps performance data separate for different combinations of symbols, strategies, exchanges, timeframes, and backtest configurations, ensuring clean and isolated analysis. You can subscribe to receive performance updates, and easily unsubscribe when you no longer need them. 

You can retrieve specific performance data, generate reports on demand, or clear all accumulated data when starting fresh. It's like having a dedicated performance analyst working behind the scenes for your backtesting framework.

## Class Performance

The Performance class helps you understand and document how your trading strategies are performing. It provides tools for gathering and analyzing metrics related to your strategies' execution.

You can use it to retrieve detailed performance statistics for specific strategies and symbols, showing things like average execution times and volatility.

It's also great for generating markdown reports that visually break down your strategy’s performance, highlighting potential bottlenecks and areas for optimization.

Finally, this class lets you save these reports directly to disk, making it easy to share and review your findings. You can customize the report's content and file location.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data collected during trading. It’s like a handy tool for examining how your strategies are performing in terms of small gains and losses.

You can use it to get statistical summaries of those partial events, showing things like the total number of profit and loss occurrences.

It also generates detailed markdown reports that present all the partial profit/loss events in a clear, table format, including information like the type of action (profit or loss), symbol traded, strategy used, signal ID, position, level, price, and when the event happened.

Finally, it can automatically save these reports to files, organized by the symbol and strategy name, so you can keep a record of your trading performance. This really simplifies the process of reviewing and understanding how your strategies are performing.

## Class PartialReportService

The PartialReportService helps you keep track of when your trading positions are partially closed, whether it's for a profit or a loss. It listens for those "partial exit" signals and records details like the price and level at which the position was closed. 

Think of it as a diligent scribe, faithfully noting down every partial win or loss event.

To use it, you'll need to subscribe to its streams of profit and loss information, and remember to unsubscribe when you’re done to prevent unwanted data. The service uses a clever mechanism to ensure you only subscribe once. 

It also includes a logger to help you debug any issues and saves all the data securely within your database.

## Class PartialMarkdownService

The PartialMarkdownService helps you create reports detailing your trading performance, specifically focusing on partial profits and losses. It actively monitors events representing these partial gains and losses, keeping track of them for each symbol and strategy you’re using.

You can think of it as a system for automatically generating clear, organized reports in markdown format. These reports break down each event with relevant details and provide overall statistics.

It saves these reports to your disk, organizing them into folders labeled with the symbol and strategy name.

To use it, you'll need to subscribe it to the relevant signals. When you’re done, you can unsubscribe.

The service also lets you retrieve data, generate reports, save them to disk, and clear the accumulated data – either for a specific combination of symbol, strategy, exchange, frame, and backtest settings or clear everything.


## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within your trading strategy. It’s designed to be injected into your strategy, providing a single point of access for these operations. Think of it as a layer that sits between your strategy and the connection layer, ensuring everything is logged and validated properly.

This service doesn't actually *do* the partial tracking itself; it relies on a connection service to handle the specifics. Instead, it focuses on logging important events related to partial profit/loss – like when a profit or loss level is reached, or when a signal is closed – for monitoring and debugging.

The service also handles validation steps, checking to ensure the strategy, associated risk, exchange, and frame exist before proceeding. This validation is optimized, so it doesn't repeat checks unnecessarily.

You'll find properties for things like the logger, connection service, and various validation services, all injected as part of the dependency injection system.  The `profit`, `loss`, and `clear` functions are the main methods you'll interact with, as they handle the logic for processing these events and then forwarding the actual work to the connection service.

## Class PartialConnectionService

This service manages and tracks partial profits and losses for individual trading signals. Think of it as a central hub that keeps track of how each signal is performing.

It creates and maintains a dedicated record for each signal, storing information like its logger and event emitters. This record is cleverly cached so it's readily available when needed.

When a signal reaches a profit or loss level, this service handles the calculations and broadcasts that information. It also cleans up these records when signals are closed, making sure nothing is left behind.

The service works closely with the broader trading strategy and utilizes a caching mechanism for efficiency. You'll find it integrated into the system's core components, ensuring smooth and reliable tracking of partial results for every signal.


## Class NotificationLiveAdapter

The `NotificationLiveAdapter` helps you send notifications about your trading strategy's progress, like when a signal is received or a profit/loss is realized. It's designed to be flexible, letting you choose different ways to send those notifications - whether that's to a database, a log file, or even just discarding them entirely.

You can easily switch between different notification methods. The default is to store notifications in memory, but you can also use persistent storage or a dummy adapter that does nothing. This allows you to test your strategy without actually sending any notifications.

The adapter provides several methods for handling different events: signal events, profit/loss updates, strategy commits, synchronization, risk rejections, and various error conditions.  Each of these methods simply passes the information to the currently selected notification method. 

You can change the notification method at any time using methods like `useDummy`, `useMemory`, `usePersist`, or `useNotificationAdapter`, giving you full control over how notifications are handled. The `clear` method is particularly useful when you need to ensure a fresh start with the default in-memory adapter, especially if your program's working directory changes.

## Class NotificationBacktestAdapter

This component helps you manage and send notifications during backtesting, and it's designed to be flexible so you can choose how those notifications are handled. It uses an adapter pattern, meaning you can easily swap out different ways of sending notifications without changing the core backtesting logic.

Initially, it uses an in-memory storage for notifications, which is great for quick tests. You can easily switch to a persistent storage that saves notifications to disk or use a dummy adapter that simply ignores all notifications for faster testing.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError` and `handleValidationError` methods are how the backtest sends various types of notifications. These methods simply pass the data on to whichever notification adapter you've selected.

You can retrieve all stored notifications using `getData`, and clear them completely with `dispose`.  The `useNotificationAdapter` method lets you completely customize the notification handling by providing your own implementation. Finally, `clear` is useful to reset back to the default in-memory adapter when things like your working directory change during testing.

## Class NotificationAdapter

This component handles all notifications, both from backtesting and live trading environments, keeping them organized and accessible. It automatically listens for updates and ensures you don't get bombarded with duplicate notifications thanks to a clever subscription system. You can easily retrieve all notifications for either backtest data or live data, and when you're finished, it provides a way to completely clear out the notification history. Think of it as the central hub for all your trading notification management. It's designed to be safe to use – even disabling it multiple times won't cause issues. 

Here's a breakdown of what you can do:

*   **Enable:** Start listening for notifications.
*   **Disable:** Stop listening for notifications.
*   **Get Data:** Retrieve a list of all notifications for either backtesting or live trading.
*   **Dispose:** Completely clear out all notifications.

## Class MemoryAdapter

The MemoryAdapter helps manage and store data related to signals and buckets. It ensures that you’re working with the right data by creating memory instances based on the signal and bucket combination you specify. This adapter remembers these instances, so you don’t have to recreate them repeatedly.

It’s designed to be flexible, allowing you to choose different ways to store the data: in memory only, persisted to files, or even just discarded for testing purposes. 

You need to activate the adapter using `enable()` before using its features, and deactivate it with `disable()` when you're finished.  `enable()` handles automatically clearing old data when a signal is closed or cancelled.

You can use it to write data (`writeMemory`), search for information (`searchMemory`), list everything stored (`listMemory`), delete specific entries (`removeMemory`), or retrieve single entries (`readMemory`). If you want to change how the data is stored, you can switch between local, persisted, or dummy storage options. 

The `clear()` function is useful if your application's working directory changes, ensuring a fresh start for memory instances. Finally, `dispose()` cleans up and releases any resources the adapter is using.

## Class MarkdownUtils

This class helps manage the creation of markdown reports for different parts of your backtesting and trading process. You can use it to turn on or off report generation for things like backtests, live trading, performance analysis, and more.

It’s designed to be extended by other classes that need to add their own markdown-related features.

The `enable` function lets you choose which report services you want running, sets them up to collect data, and prepares them to generate markdown reports. It’s crucial to remember to “unsubscribe” from these services when you’re done, because if you don’t, you might end up with memory problems.

The `disable` function allows you to stop generating markdown reports for specific services without affecting the others that are still running. It immediately stops the data collection and reporting, freeing up resources.

## Class MarkdownFolderBase

This adapter provides a simple way to generate backtest reports, with each report saved as its own individual markdown file. It's designed for creating well-organized report directories that are easy for humans to browse and review.

Think of it as the standard way to get your backtest results – each run creates a separate markdown document in a structured folder.

The `waitForInit` method is a placeholder, doing nothing because the adapter doesn’t require any specific initialization steps.

The `dump` method is where the actual writing happens. It takes the markdown content and saves it to a file, automatically creating the necessary directories. The filename and location are controlled by the `options.path` and `options.file` provided to it.

## Class MarkdownFileBase

The `MarkdownFileBase` class provides a way to create and manage markdown report files in a consistent, centralized format. It writes markdown content as JSONL entries to individual files, making it easy to process these reports using standard JSONL tools. 

The adapter uses an append-only approach, writing each markdown report as a separate line in a JSONL file. 

It handles file creation, directory management, and error handling automatically.  A timeout mechanism prevents write operations from getting stuck, and backpressure is managed to prevent overwhelming the writing process.

You can search through these files using metadata like symbol, strategy name, exchange, frame, and signal ID to find the reports you need.

The `waitForInit` method ensures everything is set up correctly, and the `dump` method is used to write the markdown content along with associated metadata. Each time `dump` is called, a new JSONL entry is added to the file.

## Class MarkdownAdapter

The `MarkdownAdapter` provides a flexible way to store markdown data, like your backtest results or walker data. It uses a pattern that lets you easily swap out how the data is actually stored – whether that's in separate files or appended to a single JSONL file.

To make things efficient, it keeps track of only one storage instance for each type of markdown (like "backtest" or "live"), so you don't end up with a bunch of duplicate files.

You can easily switch between different storage methods using `useMd` (for separate files) and `useJsonl` (for appending to a JSONL file). If you need to change how markdown data is stored altogether, `useMarkdownAdapter` lets you specify a custom storage constructor.

The `clear` method is useful when your working directory changes, ensuring fresh storage instances are created. Finally, `useDummy` is a handy way to temporarily disable markdown writing for testing or debugging.

## Class LoggerService

The LoggerService helps you keep your logging organized and informative across the entire backtesting process. It’s designed to automatically add details to your log messages, so you don’t have to manually type in things like the strategy name or the exchange being used. 

Think of it as a central place to manage how your framework logs information.

You can provide your own custom logger to the service, or it will fall back to a basic "do nothing" logger if you don't set one.

The service provides methods for different logging levels: general messages (`log`), debugging information (`debug`), informational messages (`info`), and warnings (`warn`), all enhanced with contextual information. 

You can also set the logger using `setLogger` to use a specific implementation. The service uses `methodContextService` and `executionContextService` internally to provide the contextual data.

## Class LogAdapter

The `LogAdapter` provides a flexible way to handle logging within your backtesting framework. It acts as a central point for logging, allowing you to easily switch between different storage methods like memory, persistent storage to disk, or even a dummy adapter that simply ignores log messages.

You can think of it as having a default logging system that keeps everything in memory, but you can change that to save logs to a file, or disable logging entirely for performance reasons.

The `useLogger` method lets you completely customize how logs are handled by providing your own logging implementation. Methods like `usePersist`, `useMemory`, and `useDummy` offer quick ways to change the storage backend without writing any new code.  If you need to completely reset the logging system, the `clear` method will bring it back to the default, in-memory state – particularly useful when things change during your backtesting process. The `getList` method gives you a way to retrieve all the log entries that have been recorded.

## Class LiveUtils

This class provides tools for running and managing live trading operations, acting as a central hub for interacting with the underlying trading system. It offers a way to initiate, monitor, and control live trading sessions, with features for crash recovery and real-time data.

You can start a live trading session using `run`, which generates data as it progresses – think of it like a continuous stream of updates. If things go wrong and the system crashes, it's designed to recover its state. There's also a background option (`background`) for running trades silently, useful if you just want the trading to happen without actively watching it.

Need to know what’s happening with your position? Functions like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionInvestedCost` provide detailed insights into the current state of a trade, including cost, price, and potential profit/loss.

The `LiveUtils` class also lets you directly control active trades by canceling scheduled orders (`commitCancelScheduled`) or closing positions (`commitClosePending`), and manage DCA entries and trailing stops through functions like `commitAverageBuy`, `commitTrailingStop`, and `commitTrailingTake`. Finally, there are functions to retrieve trading statistics and generate reports for analysis. This class simplifies and provides a consistent way to handle live trading tasks.


## Class LiveReportService

This service helps you track what's happening with your trading strategy in real-time by recording every important event – like when it's waiting, opening a position, actively trading, or closing a position.

It connects to your trading system and captures these "tick" events, storing them in a database so you can monitor performance and analyze how things are going.

You can easily set up this tracking by subscribing to the live signal events. Once you're done, you can unsubscribe to stop the tracking.

It’s designed to prevent accidental double-tracking, ensuring a clean and accurate record of your trades. It uses a logger to help with debugging if needed.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports about your live trading activity. It listens for every event that happens during trading – from when a strategy is idle, to when a trade is opened, active, or closed. 

These events are recorded and used to build organized markdown tables that show exactly what's happening with your strategies. You’ll also get key statistics like your win rate and average profit/loss. 

The service saves these reports as files on your computer, making it easy to review your trading performance over time. It uses a clever system to keep data separate for each strategy and trading environment, ensuring your reports stay organized. 

You can also clear out old data to keep things tidy, and you have the option to save reports to a specific location if you like. Essentially, it's a tool for automatically documenting and analyzing your live trading.

## Class LiveLogicPublicService

This service helps manage and run live trading operations. It simplifies things by automatically handling the context – things like the strategy and exchange names – so you don't have to pass them around explicitly with every function call.

Think of it as a central coordinator for your live trading, seamlessly connecting different parts of the system.

It runs continuously, generating trading signals (both opening and closing positions) as an ongoing stream.  

Importantly, it’s designed to be robust – even if the system crashes, it can recover and resume trading from where it left off, thanks to persistent state storage. The system uses the current time to guide its progression. 

The `run` function is the main way to start a live trading process, taking the symbol to trade and a context object as input.

## Class LiveLogicPrivateService

This service helps manage and orchestrate live trading operations, using a system designed to run continuously. It's like a tireless monitor, constantly checking for trading signals. 

It works by repeatedly checking the status of signals and then sharing results—only the ones that involve opening or closing trades—in a stream of data you can process. 

The service is built to be resilient; if something goes wrong, it automatically recovers and continues where it left off, thanks to its interaction with the ClientStrategy. It uses a special technique to manage memory efficiently and it’s designed to never stop running.

You can initiate this process for a specific trading symbol, and it will provide a continuous flow of trading updates.

Here’s what powers this service:

*   It relies on a `loggerService` for logging.
*   It uses a `strategyCoreService` to handle core trading strategy logic.
*   It leverages a `methodContextService` to manage method context.


## Class LiveCommandService

The LiveCommandService provides a way to access and manage live trading operations within the backtest-kit framework. It acts as a convenient layer on top of the LiveLogicPublicService, making it easier to integrate live trading functionality into your applications.

Think of it as a central hub for live trading commands.

It uses several other services internally, including those for validating strategies, exchanges, and risks, to ensure everything runs smoothly.

The core functionality is the `run` method. This method initiates and continuously monitors live trading for a specific symbol, passing along important information like the strategy and exchange names.  It’s designed to handle potential issues and automatically recover from crashes during the live trading process, essentially running indefinitely.


## Class HighestProfitUtils

This class offers tools for analyzing and reporting on your trading performance, specifically focusing on the highest profit events. Think of it as a way to extract key insights from the data generated during backtesting or live trading.

It's designed to work with data gathered by other parts of the framework, helping you understand which strategies and symbols are consistently achieving the best results.

You can retrieve statistics related to your highest profit trades using `getData`, request a complete report in markdown format with `getReport`, or automatically save that report to a file with `dump`.  These methods allow you to examine the performance of a particular strategy and symbol combination. The `backtest` option lets you specify whether the data relates to a simulated backtest or actual trading.

## Class HighestProfitReportService

This service is responsible for tracking and recording the highest profit achieved during a backtest. It keeps an eye on a specific data stream (`highestProfitSubject`) and whenever a new highest profit is detected, it writes detailed information about that event into a report database. 

Think of it as a diligent scribe, carefully noting down each time a new profit record is broken.

The service keeps track of essential details like the time, symbol, strategy, exchange, and the specifics of the signal that triggered the profit (including price levels). This data is crucial for later analysis and understanding what strategies are working best.

To get it started, you need to subscribe it to the data stream.  It prevents accidentally subscribing multiple times, ensuring resources aren’t wasted.  When you’re finished, you can unsubscribe to stop the recording process.


## Class HighestProfitMarkdownService

This service is responsible for creating and saving reports detailing the highest profit generated by your trading strategies. It listens for incoming data related to highest profits and organizes it based on the symbol, strategy, exchange, and timeframe used. 

You can subscribe to receive these data events, and the service ensures you won't accidentally subscribe multiple times. Unsubscribing completely detaches the service and clears all accumulated data.

The `tick` method processes individual profit events, routing them to the appropriate storage location. You can retrieve the accumulated data, generate a formatted markdown report, or save that report directly to a file. The filename structure includes the symbol, strategy, exchange, timeframe, and a timestamp.

Finally, you can clear the data, either for a specific combination of parameters or for all data collected by the service, effectively resetting the storage.

## Class HeatUtils

HeatUtils is a helper class designed to make working with portfolio heatmaps easier. It gathers and organizes data related to your trading strategies, automatically pulling information from all completed trades.

Think of it as a central place to get summaries of how each of your symbols is performing within a given strategy.

You can request the raw data, generate a nicely formatted markdown report showing key metrics like total profit, Sharpe Ratio, and maximum drawdown, or even save that report directly to a file. The reports organize symbols by their profit, so you can quickly see the top performers.


## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when your signals close and how much profit or loss they generated. It listens for these closed signal events across all your symbols.

It’s designed to store this data in a special database format, making it easy to generate heatmap visualizations that show you where your trading strategy is performing well and where it might need adjustments.

To keep things efficient, it only logs closed signals that include profit and loss information. To prevent accidental duplicate registrations, it uses a mechanism to allow only one subscription at a time. You can easily start and stop the service with the `subscribe` and `unsubscribe` methods. The `subscribe` method provides a function that you can call to stop the service from listening to incoming signal events.

## Class HeatMarkdownService

The Heatmap service helps you understand how your trading strategies are performing by creating a portfolio-wide view. It listens for trading signals and gathers data about each strategy’s results across different exchanges and timeframes.

It organizes and summarizes information, providing a breakdown of metrics like total profit, Sharpe Ratio, and maximum drawdown for each symbol, along with aggregated portfolio-level insights. 

You can easily generate reports in Markdown format to visualize this data or save them to a file. The service is designed to be reliable, handling potential mathematical issues gracefully, and it remembers its data efficiently so it doesn’t have to recalculate everything each time. 

You can clear accumulated data if you want to start fresh or target a specific combination of exchange, timeframe, and backtest mode. Subscribing is straightforward, and you'll get a function to unsubscribe when you're finished.


## Class FrameValidationService

This service helps you keep track of and make sure your trading timeframe configurations are set up correctly. Think of it as a central manager for your timeframes. 

It allows you to register new timeframes and provides a way to double-check that a timeframe actually exists before you try to use it in your trading strategies. 

To improve speed, it remembers its validation results, so it doesn't have to repeat checks unnecessarily. You can also see a complete list of all the timeframes you’ve registered. 

Essentially, it makes managing and verifying your timeframe setup much easier and more efficient. 

The `addFrame` method lets you register new timeframe definitions. `validate` confirms a given timeframe exists. And `list` gives you an overview of all the configured timeframes.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of and manage the structures of your trading frames – think of it as a central place to define and organize how your data is laid out. 

It uses a special system to make sure your frame definitions are type-safe, preventing common errors.

You can add new frame structures using `register`, update existing ones with `override`, and easily find them again using `get`. 

Before a frame is added, the service performs a quick check (`validateShallow`) to ensure it has the necessary components and they're the right types. This helps catch problems early.


## Class FrameCoreService

FrameCoreService manages how your backtest gets its data timelines. Think of it as the central hub for generating the sequence of time periods your trading strategy will analyze. It relies on other services – FrameConnectionService for accessing the raw data, and FrameValidationService to ensure the data's quality. 

Essentially, it takes a symbol (like "BTCUSDT") and a timeframe name (like "1m" for one-minute candles) and returns a promise that resolves to an array of timestamps defining that timeframe. This is the foundation upon which your entire backtest is built. The `getTimeframe` function is the primary way to interact with it, and it's used internally by the core backtesting engine.


## Class FrameConnectionService

The FrameConnectionService helps manage and route requests to the right frame implementation, essentially acting as a central dispatcher for your trading frames. It automatically figures out which frame to use based on the method context, making sure your code interacts with the correct data and logic. 

To improve efficiency, it keeps a record of previously created frames (ClientFrame instances), so it doesn't have to recreate them every time you need one. This caching makes operations faster and more responsive.

The service also handles backtest timeframes, enabling you to define start and end dates for your historical data analysis. When in live mode, it operates without frame constraints, allowing for unrestricted data access.

You can get a specific frame using the `getFrame` function, which handles both creation and caching. And if you need to know the exact timeframe for a particular asset, the `getTimeframe` function retrieves the configured start and end dates.

## Class ExchangeValidationService

The ExchangeValidationService acts as a central hub for managing and verifying your trading exchanges. It keeps track of all the exchanges you’ve set up, making sure they're active and ready to go before your backtests run.

You can easily register new exchanges using the `addExchange` method. To ensure an exchange is properly configured before use, use the `validate` method which checks its existence. 

The service also provides a `list` method so you can quickly see all of the exchanges that are currently registered. The service uses a clever caching system (memoization) to keep things running efficiently, so validations aren’t repeated unnecessarily. 


## Class ExchangeUtils

The ExchangeUtils class helps simplify interacting with different exchanges within the backtest-kit framework. Think of it as a helper that provides easy access to common exchange functions, while making sure everything is validated correctly. It’s designed as a single, central resource you can rely on.

It can retrieve historical candle data, calculate average prices using volume-weighted calculations, and format trade quantities and prices to adhere to the specific rules of each exchange. 

You can also use it to get order book data and aggregated trade information for specific trading pairs. It's even possible to fetch raw candle data, giving you more control over the date ranges and data limits. The way it handles dates for historical data ensures consistent behavior and avoids potential biases.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of your exchange schemas in a safe and organized way. It uses a special storage system to ensure the schemas are consistent and of the expected type.

You can add new exchange schemas using the `addExchange()` function, and then retrieve them later using their names.

Before a schema is added, it's checked to make sure it has all the necessary pieces in place.

If you need to update an existing schema, you can use the `override()` function to make changes, only affecting the specific properties you want to modify. Finally, you can simply fetch a schema using its name to access the information it contains.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central point for interacting with exchanges within the backtesting framework. It intelligently combines connection management with execution context, ensuring that each operation is aware of the specific symbol, time, and whether it's a backtest or live environment.

This service streamlines common exchange tasks like fetching historical and future candles, calculating average prices, and retrieving order books and trades. It handles validation, ensuring the exchange setup is correct and efficient, and formats data like prices and quantities appropriately for the context. 

Essentially, it provides a consistent and informed way to pull data from exchanges, automatically injecting the necessary details for accurate backtesting or live trading. It’s designed to be a core component, used internally by other services to manage exchange-related operations.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests – like fetching candles or order books – to the correct exchange based on the currently selected exchange in your trading context. To avoid unnecessary overhead, it remembers (caches) those exchange connections, making repeated requests faster.

It provides methods for retrieving historical and future candles, calculating average prices (using either real-time data or historical candles), and getting order book information and aggregated trades.  You can also get raw candles, which gives you more flexibility with date ranges. The service also handles formatting prices and quantities to match each exchange’s specific rules. Think of it as a universal adapter for your backtest-kit, translating your commands into the language of various exchanges.

## Class DumpAdapter

The `DumpAdapter` provides a flexible way to save information during your backtesting process, letting you choose where that data is stored. By default, it creates markdown files in a specific directory structure to represent your data.

You can easily change where the data goes, storing it in memory, discarding it entirely (for testing purposes), or plugging in your own custom storage solution. 

Before you start saving data, you need to "enable" the adapter, which sets it up to listen for signals and manage its internal data. When you're done, you can "disable" it to stop listening.

The adapter offers several methods for saving different types of data: full message histories, simple records, tables of data, plain text, error messages, or even complex JSON objects. Each of these methods accepts a `DumpContext` to provide additional information about the data being saved.

You can clear the adapter's memory cache to ensure fresh instances are used if your working directory changes.

## Class ConstantUtils

This class provides a set of pre-calculated values designed to help manage your trading strategies using a Kelly Criterion approach with a focus on minimizing risk. Think of it as a guide for setting take-profit and stop-loss levels.

The take-profit levels (TP_LEVEL1, TP_LEVEL2, and TP_LEVEL3) are percentages of the total distance to your final target profit. For example, TP_LEVEL1 triggers when the price has moved 30% towards your profit goal, allowing you to secure a small profit early on. Similarly, the stop-loss levels (SL_LEVEL1 and SL_LEVEL2) provide safeguards, with SL_LEVEL1 acting as an early warning and SL_LEVEL2 as a final exit point to limit potential losses. These values are intended to provide a structured, risk-aware approach to managing your trades and maximizing potential returns.

## Class ConfigValidationService

The ConfigValidationService helps keep your trading configurations sound by checking for potential errors. It's designed to ensure your global settings are mathematically correct and won’t lead to unprofitable trading.

The service meticulously examines your parameters, focusing on things like percentage values (slippage, fees, and profit margins) to make sure they are positive. It also verifies that your minimum take-profit distance is sufficient to cover all costs like slippage and fees, guaranteeing a potential profit when the take profit is reached.

It makes sure that minimum and maximum values are set up correctly relative to each other – for example, that your stop-loss distance is logically set.  Finally, it ensures that time-related settings and candle parameters, like retry counts and delays, are positive integers. This service acts as a safeguard to catch configuration issues early.


## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It's designed to catch errors early and prevent problems with your data display.

It checks several things about your column definitions:

*   Each column *must* have a key, a label, a format, and a setting to control visibility.
*   The `key` and `label` for each column have to be text strings that aren't empty.
*   The `format` and visibility settings have to be functions that can be executed.
*   It also ensures that all the 'key' values are unique within the same group of columns.

Essentially, it's a safety net to prevent misconfigured columns from causing issues later on.

## Class ClientSizing

The ClientSizing class helps determine how much of an asset to trade in each scenario. It’s a flexible tool that lets you define different sizing methods, like using a fixed percentage, a Kelly Criterion approach, or based on Average True Range (ATR). You can also set limits on the minimum and maximum position sizes, or restrict the overall percentage of your capital used for any single trade. 

The class is designed to be easily integrated into trading strategies, providing a way to automatically calculate position sizes based on your specific rules and risk tolerance. It even allows for custom callbacks, so you can add extra checks or logging for validation or audit trails.

Essentially, it handles the math behind deciding how much to buy or sell, keeping your trading consistent and under control.

The `calculate` method is the core of this class; it's what you call to actually determine the position size based on the input parameters.

## Class ClientRisk

ClientRisk helps manage risk across your entire trading portfolio, ensuring your strategies don't exceed pre-defined limits. It’s like having a safety net that monitors your positions to prevent unwanted trades.

This component keeps track of all active positions, regardless of which strategy opened them, allowing for a holistic view of your overall risk exposure.  It’s especially useful for limiting the total number of positions you hold simultaneously.

You can also define custom validations to enforce your specific risk rules, examining all active positions when making decisions.

ClientRisk is automatically used when your strategies execute trades, validating each signal before it’s implemented, preventing breaches of your risk parameters.  It works together with the ClientStrategy to keep things under control.

The system maintains a record of your active positions, saving them to disk, although this persistence is skipped when running in backtest mode. It ensures that the initial loading of positions happens only once to avoid inconsistencies.

You can register new signals (when a trade is opened) and remove them (when a trade is closed) so ClientRisk always has an accurate view of your portfolio’s state.

## Class ClientFrame

The ClientFrame class is responsible for creating the timeline of data used during backtesting. It essentially builds arrays of timestamps representing specific time periods. 

To avoid unnecessary work, it uses a caching system to prevent generating the same timeline multiple times. 

You can control how frequently the timestamps are spaced, from as short as one minute to as long as three days. 

It also allows you to define custom functions that will be run during the timeline creation, useful for validating the data or keeping track of what's happening.

The `getTimeframe` property is the primary way to interact with the ClientFrame; it's how you request a timeline array for a given symbol, and the caching ensures efficiency.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge between your backtesting framework and the actual exchange data. It provides several key functionalities for retrieving historical and future market data. You can use it to fetch candles (price bars) going backward in time for analysis, or forward for simulating future market conditions during a backtest.

The class offers methods to calculate the Volume Weighted Average Price (VWAP) of an asset using recent trades. It also handles formatting quantities and prices to match the specific rules and precision required by different exchanges.

For more advanced data retrieval, `getRawCandles` allows for fetching candles within a specified date range and limit. The `getOrderBook` method retrieves order book data and `getAggregatedTrades` pulls aggregated trade data. Importantly, all these functions are designed to prevent "look-ahead bias" - ensuring your backtest isn't unfairly influenced by future data.

## Class ClientAction

The ClientAction class is the central piece for managing and running your custom action handlers within the backtest-kit framework. Think of it as a coordinator that makes sure your handlers are properly set up, receive the correct signals, and are cleaned up when they're no longer needed. 

It handles the lifecycle of your action handlers, which are responsible for things like managing your trading state, logging events, sending notifications, and collecting analytics. The ClientAction ensures these handlers receive the right events – whether they’re coming from a live trade or a backtest.

Specifically, it initializes your action handler only once and disposes of it cleanly afterwards, preventing unwanted side effects. The `signal` methods are how you route different types of events to your handler, allowing it to react to changes like reaching breakeven, partial profits or losses, or experiencing risk rejections. The `signalSync` method, importantly, isn't wrapped in error handling, making sure any issues are caught and handled at a higher level.

## Class CacheUtils

CacheUtils helps you easily cache the results of your functions, particularly those used in trading strategies. It's like having a memory for your code, so it doesn't have to re-calculate things it's already figured out.

The `fn` function is your primary tool – you wrap your regular functions with it to enable timeframe-based caching. This means the cache's lifetime is tied to specific time intervals (like 1-minute, 5-minute candles).

If you're dealing with asynchronous functions, the `file` function provides file-based caching. This stores cached results directly on your hard drive, making them persistent even if your program restarts. This is especially useful for computationally expensive calculations you want to avoid repeating frequently.

You can also manually clean up the cache with `dispose` to force a recalculation, or `clear` to wipe the cache entirely and start fresh. `clear` is important if your working directory changes during testing, ensuring the cache is rebuilt with the new base path. Essentially, CacheUtils simplifies managing function caching to improve performance in your backtesting framework.

## Class BrokerBase

This `BrokerBase` class provides a foundation for connecting your trading strategy to a real-world exchange. Think of it as a template; you'll extend this class to build an adapter specifically for the exchange you want to use. It handles many common tasks like placing orders, updating stop-loss and take-profit levels, and even sending notifications.

The class comes with built-in logging, so you can easily track what's happening. You don't need to implement everything; the default implementations are there to handle most actions.

Here’s a breakdown of how it works:

*   **Initialization:** `waitForInit()` is called to connect to the exchange and authenticate.
*   **Event Handling:** The system triggers a series of functions (`onSignalOpenCommit`, `onSignalCloseCommit`, `onPartialProfitCommit`, `onPartialLossCommit`, etc.) when specific actions need to be taken. These methods are where you’d place the actual order instructions for your chosen exchange.
*   **Lifecycle:** There's no explicit cleanup process, so you may want to handle cleanup within `waitForInit` or elsewhere.

Essentially, this framework simplifies the process of integrating your automated trading strategy with a live exchange environment. Each event method gives you a hook to customize how trades are executed and managed, while the base class takes care of the underlying connection and logging.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and your actual brokerage account. Think of it as a safety net – it ensures that any actions your strategy wants to take (like opening or closing positions, adjusting stop-losses, or buying more shares) are validated and handled correctly before they're sent to the broker.

During testing or simulations (backtesting), the `BrokerAdapter` quietly ignores these requests, allowing you to analyze your strategy without real-world consequences. When you're actually trading, it forwards these requests to your connected broker.

It manages events like signals (opening and closing positions) and adjustments to your trades (partial profits, stop-losses, take-profits) by routing them through the broker.  You set up the connection by providing either a blueprint for your broker (a constructor) or a fully built broker object. 

The `enable` and `disable` methods control whether the adapter is actively communicating with the broker, and `clear` is used to refresh the connection when needed. Essentially, it provides a controlled and safe way to integrate your trading strategy with a real brokerage.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events related to your trading strategies. Think of it as a tool to gather and present information about when your strategies reached breakeven points.

It provides ways to access statistical data, generate readable markdown reports, and save these reports as files.

You can retrieve aggregated statistics summarizing breakeven events for a specific symbol and strategy.

It can also build detailed reports showing each individual breakeven event, including things like the symbol, strategy used, entry price, and timestamp.

Finally, you can easily export these reports to files on your computer, with automatic directory creation and clear filenames based on the symbol and strategy name.


## Class BreakevenReportService

The BreakevenReportService is designed to keep track of when your trading signals reach a breakeven point. It's like a dedicated observer, listening for these specific events and recording them.

It takes the information about each breakeven – details about the signal that achieved it – and saves this data into a database.

To get it working, you'll use the `subscribe` method to start listening for breakeven events.  The `unsubscribe` method is then used to stop the service from listening.  This service is built to prevent accidental double-subscription.


## Class BreakevenMarkdownService

This service helps create and store reports detailing when trades reach their breakeven point. It listens for events signaling breakeven occurrences for different trading strategies and symbols.

The service keeps track of these breakeven events, organizes them by symbol and strategy, and then generates nicely formatted markdown tables summarizing the information. You can request overall statistics like the total number of breakeven events or generate specific reports.

The reports are saved as markdown files, making them easy to read and share. You can also clear the stored data, either for a specific combination of symbol, strategy, exchange, frame and backtest or clear everything. The system ensures data for each unique combination is stored separately.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for tracking breakeven points within the trading system. It's designed to make managing these calculations cleaner and easier to monitor.

Think of it as a middleman that receives requests related to breakeven and passes them on to the BreakevenConnectionService, while also keeping a record of everything that’s happening. It’s injected into the ClientStrategy to ensure a consistent way to handle breakeven calculations.

Several validation services—for strategies, risks, exchanges, and frames—are also linked to this service, ensuring the system is working with valid configurations.

The `validate` method prevents repetitive checks, and `check` determines if a breakeven trigger should occur, while `clear` resets the state when a signal is closed.  Essentially, it’s a layer of organization and auditing for breakeven operations.

## Class BreakevenConnectionService

This service manages how we track breakeven points for our trading signals. Think of it as a central hub that keeps track of breakeven calculations for each individual signal.

It avoids redundant calculations by remembering (memoizing) previously computed breakeven data for each signal, using a key based on the signal ID and whether it’s a backtest or live trade.

When it needs to check or clear a breakeven, it either retrieves the existing data or creates a new instance, making sure everything is properly set up and then handing off the actual work.

The service is designed to be integrated with the main trading strategy and uses a logger and an event system to keep things organized and communicate important updates. After a signal is closed, this service cleans up its records, preventing unnecessary memory usage.

## Class BacktestUtils

This class provides tools for running backtests and inspecting their state. It acts as a central hub for backtesting operations, simplifying common tasks.

You can use it to kick off a backtest for a specific symbol and strategy configuration, or to run a backtest in the background without receiving immediate results. It also allows retrieving information about pending signals, like the breakeven point, estimated minutes remaining, and DCA entries.

Here's a breakdown of what you can do with this class:

*   **Running Backtests:** Easily start backtests for different symbols and strategies.
*   **Inspecting Signals:** Get details about active pending signals, including breakeven points, estimated time to completion, and DCA information.
*   **Managing Positions:**  Retrieve information about the current position, like its cost basis, open price, and partial close history.
*   **Controlling Backtests:**  Stop a running backtest or cancel scheduled signals.
*   **Generating Reports:** Create detailed reports summarizing backtest results.
*   **Accessing Data:** Get statistics and data related to previous backtests.



It's designed to be a singleton, meaning there’s only one instance available, making it easy to access these functionalities from anywhere in your code.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what’s happening during your backtest strategy’s execution. It acts like a reporter, capturing every important signal event—when a signal is idle, when it’s opened, actively trading, or when it's closed.

It connects to the backtest environment and listens for these signals, meticulously logging them along with all the relevant details. This information is then saved to a SQLite database, allowing you to analyze your strategy's performance and troubleshoot any issues.

You can easily start and stop this reporting. The `subscribe` function connects to the backtest, and the returned function lets you disconnect. If you've already subscribed, attempting to subscribe again won't cause problems—it's designed to handle that safely. Unsubscribing ensures that the reporting stops when you no longer need it.

## Class BacktestMarkdownService

This service helps you create and save reports about your backtesting results. It keeps track of how your trading strategies performed, specifically focusing on signals that have already closed. 

It works by listening to the data coming in from your backtest and storing information about those closed signals. This information is then used to generate readable markdown reports, which are essentially nicely formatted tables containing details about each signal.

You can request data and reports for specific symbols, strategies, exchanges, and timeframes. The reports are saved to files on your computer, making it easy to review and analyze your backtest results. 

You can also clear out this stored data if you need to start fresh or want to free up space. To get started, you'll need to subscribe to the backtest events so the service can begin collecting data. Don't worry, it ensures you don't accidentally subscribe multiple times. When you're finished, you can unsubscribe to stop the data collection.

## Class BacktestLogicPublicService

This service helps manage and run backtests in a simplified way. It automatically handles the context needed for your backtesting process, like the strategy name, exchange, and frame, so you don’t have to pass it around explicitly.

Think of it as a layer on top of the private backtesting logic that makes things more convenient.

The `run` function is the main method for performing a backtest; you just provide the symbol you want to backtest. 

It returns a stream of results, showing how your strategy would have performed, which you can then analyze and refine.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process, handling the flow of data and actions behind the scenes. It works by first retrieving timeframes from the frame service, then processing each timeframe one by one. 

When a trading signal appears, it fetches the necessary candle data and executes the backtest logic.  The system is designed to intelligently skip over timeframes until a trade is closed.

A key feature is that it delivers backtest results as a continuous stream, rather than building up a large array in memory – this makes it very efficient for handling large datasets. The process can also be stopped prematurely if needed. 

The service relies on several other services like the logger, strategy core, exchange core, frame core, method context, and action core services to handle logging, strategy execution, exchange interactions, frame management, context management, and action processing respectively. The `run` method is how you initiate a backtest for a specific symbol, producing a stream of results that represent the progress and outcome of each trade.

## Class BacktestCommandService

This service acts as a central point for running backtests within the backtest-kit framework. It provides a straightforward way to initiate and manage backtest processes, essentially wrapping around the more detailed `BacktestLogicPublicService`. Think of it as the primary gateway for public access to backtesting capabilities.

The service relies on several other services internally to handle things like logging, validating strategies and exchanges, and checking the overall backtest setup. 

You use the `run` function to kick off a backtest, specifying the symbol you want to backtest and providing context like the strategy and exchange names. This function will then generate a sequence of results, detailing how the strategy performed on each tick during the backtest.


## Class ActionValidationService

The ActionValidationService helps keep track of all your action handlers, ensuring they're available when needed. Think of it as a central registry and quality control system for your actions.

You can use `addAction` to register new action handlers with this service, essentially telling it what actions are available.

Before you try to use an action, `validate` checks if it exists, preventing errors and ensuring smooth operation.

To see all the action handlers you've registered, `list` provides a handy overview.

The service also uses caching (memoization) to make these checks quick and efficient, avoiding unnecessary lookups.


## Class ActionSchemaService

This service keeps track of all your action schemas, making sure they’re correctly structured and compatible. It's like a central librarian for your actions. 

It uses a type-safe system to store these schemas and ensures that the methods used within your action handlers are the ones you've explicitly allowed. 

You can register new action schemas, and this service validates them to prevent errors. If you need to change a schema later, you can override parts of it without having to recreate the whole thing. 

You can also retrieve existing schemas when needed. The service also uses a logger to provide feedback on what's happening.


## Class ActionProxy

The `ActionProxy` acts like a safety net around your custom trading logic, ensuring your entire system doesn't crash if there's an error in your code. It's a wrapper that provides a consistent way to handle errors during various events like signal generation, profit/loss adjustments, and scheduled tasks.

Think of it as a "proxy" that stands between your code and the core trading framework, catching any unexpected errors.

Here's a breakdown of what it does:

*   **Error Handling:**  It automatically catches errors that might occur within your custom action handlers. This prevents those errors from bringing down the entire trading system. Instead, errors are logged and the process continues.
*   **Safe Execution:** If you don’t provide every function your handlers should, it won't break the system - it simply skips that part.
*   **Consistent Behavior:** It uses the same error-handling pattern across all trading events, creating predictable and manageable behavior.
*   **Factory Creation:**  You create `ActionProxy` instances using a special `fromInstance` method, ensuring that all your action handlers are wrapped and protected.

It handles various lifecycle events in a controlled manner: `init`, `signal` (for general ticks), `signalLive` (for live trading), `signalBacktest` (for backtesting), `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `riskRejection`, `signalSync`, and `dispose`.  `signalSync` is a specific exception - errors here are intentionally passed along. The `dispose` method is used for cleanup.


## Class ActionCoreService

The `ActionCoreService` acts as a central hub for managing actions within your trading strategies. It essentially takes the instructions defined in your strategy's schema and executes them in a controlled sequence.

It handles things like retrieving the list of actions to be performed, verifying that your strategy setup is valid, and then sending those actions to the appropriate handlers. 

Here's a breakdown of what it does:

*   **Initialization:** `initFn` sets up each action when a strategy starts.
*   **Signal Handling:**  Functions like `signal`, `signalLive`, `signalBacktest` distribute incoming data (like price ticks) to the registered actions. There are also similar functions for breakeven, partial profit/loss, scheduled pings, and risk rejections.
*   **Synchronization:** `signalSync` ensures all actions agree on things like opening or closing a position.
*   **Cleanup:** `dispose` releases resources when a strategy finishes running.
*   **Validation:** `validate` checks the strategy's configuration to prevent errors.
*   **Data Clearing:** `clear` allows for resetting action data, either for a specific action or globally.

Essentially, it’s the engine that drives the execution of your strategies by orchestrating the actions defined within them.

## Class ActionConnectionService

The `ActionConnectionService` acts as a central dispatcher for different actions within your trading framework. It takes incoming events like signal updates, breakeven triggers, or ping requests and routes them to the correct action handler, ensuring that each action is executed in the right context.

To optimize performance, it cleverly caches these action handlers (called `ClientAction` instances), so it doesn’t have to recreate them every time an event comes in.  The caching is specific to the strategy, exchange, and frame being used, preventing actions from interfering with each other.

The service also handles initialization and cleanup of these action handlers. You can clear the cached actions if needed. Essentially, it provides a streamlined and efficient way to manage and execute actions in your trading system, keeping everything organized and preventing unnecessary overhead.

## Class ActionBase

This framework provides a base class, `ActionBase`, for creating custom actions that integrate with your trading strategies. Think of it as a starting point for handling things like sending notifications, logging events, or implementing custom logic.

It simplifies things by providing default implementations for many common tasks, so you only need to write code for what's unique to your needs. These actions are triggered at various points during a trade's lifecycle – like when a signal is received, a profit milestone is reached, or a risk rejection happens.

The `init` method lets you set up anything you need when the action starts. `dispose` provides a cleanup process when the action is finished. You can customize actions for live trading (`signalLive`), backtesting (`signalBacktest`), or general signal handling (`signal`). Overall, it's designed to make extending the core framework with your own custom behaviors straightforward and manageable.
