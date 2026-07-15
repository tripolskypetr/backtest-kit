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

WalkerValidationService helps you organize and check your parameter sweep configurations, often used for optimizing trading strategies. It keeps track of all the walkers you've defined, ensuring they’re set up correctly before you start running tests.

Think of it as a central place to manage how you explore different combinations of settings for your trading system. 

Here's what it does:

*   **Registration:** It lets you register new walkers (parameter sets) so the system knows about them.
*   **Validation:** It checks that a walker actually exists before you try to use it, and also validates any strategies, risks, and actions it relies on. This helps catch errors early.
*   **Listing:** It can provide a simple list of all the walkers currently defined.
*   **Performance:** It uses a technique called memoization, which means it remembers the results of validations, making things faster the second time around.

The service relies on several other services to handle validation of strategies, risks, and actions.

## Class WalkerUtils

WalkerUtils provides a convenient way to manage and run walker comparisons, which are essentially automated tests of trading strategies. Think of it as a helper tool to simplify interacting with the core walker comparison engine.

It offers functions to start comparisons, run them in the background (useful for things like logging or callbacks), and stop them gracefully. You can also retrieve the results of a comparison, get a detailed report in Markdown format, and save that report to a file.

WalkerUtils keeps track of each comparison separately, ensuring that different strategies running on the same symbol don't interfere with each other. It also provides a way to list all running comparisons and their current status. The `background` function is a quick way to run comparisons without needing to see the data, ideal for situations where you just want to monitor or log the process. Finally, `stop` provides a way to halt the generation of new signals from a walker, allowing active signals to finish.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different "walker" schemas, which define the structure of data used in your backtesting process. It uses a special storage system to ensure everything is typed correctly and safely.

You can add new walker schemas using the `addWalker()` method (also referred to as `register`), and then find them again later by their name using the `get()` method. 

Before a new schema is officially added, the service checks to make sure it has all the necessary parts with `validateShallow()`.

If you need to update an existing schema, the `override()` function lets you make partial changes without replacing the entire schema. 

The service also has internal components for logging and managing its registry.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It acts like a dedicated record keeper, capturing the results of each test run and storing them in a database. 

Think of it as a system that listens for updates from your optimization process. 

It records key metrics and statistics for each strategy, and tracks which strategy is performing the best overall. This service provides a way to analyze your optimization progress and compare different strategy configurations.

To use it, you'll subscribe to receive optimization events, and when you're done, you can unsubscribe to stop receiving updates. The service ensures you don't accidentally subscribe multiple times. 

The data collected is then ready for further analysis and reporting.


## Class WalkerMarkdownService

The WalkerMarkdownService is responsible for creating and saving reports detailing the performance of your trading strategies. It listens for updates as your strategies run, keeping track of their results for each walker.

It uses a clever system to store this data separately for each walker, ensuring that each one's results are kept distinct. You can subscribe to receive these updates as they happen, and unsubscribe when you no longer need them.

The service then transforms this data into easy-to-read markdown tables, providing a clear comparison of your strategies. Finally, it saves these reports to your disk, neatly organized in the logs/walker directory.

You can retrieve specific data points, generate full reports, or clear all accumulated data, either for a single walker or across the board. It's designed to make understanding and analyzing your backtesting results straightforward.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading processes. It builds upon a private service to handle the core walker logic.

Think of it as a coordinator that makes sure your trading strategies, exchanges, and the specific testing environment are all clearly identified and passed along correctly.

It simplifies running comparisons for a given stock symbol, making sure all the relevant information about the trading strategy, exchange, and testing frame is automatically included.

Essentially, it allows you to run backtests for all your strategies easily and with the right context.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps manage and compare different trading strategies, acting like a conductor for your backtesting process. It orchestrates the execution of multiple strategies one after another, providing updates on their progress as they run. 

During the backtesting, it continuously monitors and tracks the best-performing metric, giving you real-time insights. Finally, it compiles and presents a ranked report of all the strategies, allowing you to easily compare their results.

This service relies on the BacktestLogicPublicService to actually run the individual backtests.

Here's what you'll find within the service:

*   A logger for tracking activity.
*   The BacktestLogicPublicService, which handles the individual backtests.
*   A service for creating backtest markdown reports.
*   A service for validating your backtest setup.

The `run` method is the key to using this service. You provide it with a trading symbol, a list of strategies to compare, the metric you're using to evaluate them, and some context information about your backtest setup. It then returns a stream of results, one for each strategy as it finishes.

## Class WalkerCommandService

WalkerCommandService is a central point for accessing and managing walker functionality within the backtest-kit framework. It acts as a simplified interface, making it easier to incorporate walkers into your applications through dependency injection.

This service relies on several other services like logger, walker logic, schema and validation services to handle various aspects of the walker's operation, including strategy, exchange, frame, and risk assessments.

The `validate` function is a crucial component responsible for verifying the configurations of walkers and associated strategies. It is designed to be efficient by caching results and includes additional, deliberate validation steps to ensure reliability and prevent errors.

Finally, the `run` method initiates the core comparison process, enabling you to execute walkers against a specific symbol while providing context like the walker, exchange, and frame names.

## Class TimeMetaService

The TimeMetaService helps you keep track of the most recent candle timestamps for your trading strategies. It’s designed to provide this information even when you’re not actively in the middle of a trading tick, like when you need to trigger something outside of the normal execution flow.

Think of it as a handy reference for the current time on a candle for a specific trading setup – considering the symbol, strategy, exchange, timeframe, and whether it’s a backtest. The service remembers these timestamps and makes them available, waiting briefly if a timestamp hasn’t arrived yet.

It automatically updates these timestamps after each tick and has a built-in way to clear out old data to prevent confusion. The service is essentially a single point of access for timestamp information, handled behind the scenes and managed by the framework. You can clear all stored timestamps or just the ones related to a specific setup.

## Class SystemUtils

SystemUtils helps keep backtest sessions separate and clean. It prevents one test from affecting another by temporarily disconnecting subscriptions to a central event bus.

The `createSnapshot` method is the key to achieving this isolation. Think of it as taking a picture of how things are currently set up with the event bus. It effectively clears out the current connections, allowing a new backtest session to run without interference. Afterwards, it provides a way to restore things back to the original state, ensuring a pristine environment for the next test.

## Class SyncUtils

SyncUtils helps you understand and analyze the lifecycle of your trading signals. It provides tools to collect and visualize data related to when signals are opened and closed.

Think of it as a report generator that keeps track of signal events like orders being filled and positions being exited.

You can use it to:

*   Get a summary of signal activity, including the total number of signals opened and closed.
*   Generate detailed markdown reports that show a table of all signal events for a specific strategy and symbol. This table includes important details like signal IDs, entry and exit prices, take profit/stop loss levels, and profit/loss information.
*   Save these reports as files on your computer, making it easy to share or review them later. The filenames are descriptive, including the symbol, strategy name, exchange, frame, and whether it's a backtest or live signal.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals. It listens for events related to signals – when they're created and when they're closed.

Think of it as a detailed record-keeper for your trading activity.

It logs important information, such as signal details when a signal starts and profit/loss information when a signal ends, so you can review your trading decisions later. The service ensures that you aren't accidentally subscribed multiple times to receive these events. 

You can start listening for these events with the `subscribe` method and stop listening with the `unsubscribe` method. The `loggerService` property allows you to see more details about the service’s actions.

## Class SyncMarkdownService

This service is designed to automatically create and save reports about signal synchronization events, like when orders are opened or closed. It listens for these events and organizes them based on the symbol, strategy, exchange, timeframe, and whether it's a backtest.

It automatically builds markdown tables summarizing the signal lifecycle, including details about each event. The tables also include helpful statistics such as the total number of events, openings, and closures.

To start receiving events, you need to `subscribe`.  This sets up the service to listen for synchronization updates, and you'll get a function to stop listening when you're done. Subscribing more than once won't re-subscribe—it gives you the same unsubscribe function.

You can use `unsubscribe` to stop receiving events and clear all stored data.

Each time it receives an event, the `tick` function processes it, adds a timestamp, and stores the data in the appropriate place.

`getData` allows you to retrieve statistics for a specific combination of symbol, strategy, exchange, timeframe, and backtest type.  If there's no data yet, it returns an empty report with zero counts.

`getReport` generates the full markdown report for a specific context, including the table and statistics.

`dump` creates the report and saves it as a markdown file. The file's name includes the symbol, strategy, exchange, timeframe, and a timestamp. Backtest reports have a slightly different naming convention.

Finally, `clear` lets you remove all accumulated event data. You can clear everything at once or only data for a specific symbol/strategy/exchange/timeframe/backtest combination.

## Class StrategyValidationService

This service helps keep track of and make sure your trading strategies are set up correctly. It acts like a central hub for all your strategy configurations, ensuring that everything is where it should be before you start trading. 

It lets you register new strategies, and it automatically checks to see if those strategies, along with any related risk profiles and actions, are valid. 

To speed things up, it remembers the results of previous validation checks, so it doesn’t have to re-do them unnecessarily. 

You can also get a list of all the strategies that are currently registered with the service. 

Essentially, it's your go-to place for managing and confirming the health of your strategies.


## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It acts as a central point to gather information about strategy events like closing positions, taking profits, or adjusting stop-loss orders.

You can use it to get aggregated statistics about your strategy’s actions, like how often it's taken profits versus losses.

It can also create detailed reports in Markdown format, which include tables listing all the events that have occurred for a particular strategy, symbol, exchange, and timeframe, with data like price, percentages, and timestamps.

Finally, StrategyUtils makes it easy to save these reports directly to files on your computer, helping you keep a record of your strategy’s history and performance. It organizes these reports with filenames that clearly indicate the symbol, strategy name, exchange, and timeframe.

## Class StrategySchemaService

This service helps keep track of different strategy blueprints, ensuring they are well-defined and consistent. It uses a special system to store these blueprints in a way that’s safe and reliable.

You can add new blueprints using the `addStrategy()` function, and retrieve existing ones by their names.

Before a blueprint is officially added, the system checks it quickly to make sure it has all the necessary components and that they are of the correct type.

If a blueprint already exists, you can update parts of it using the `override()` function.

Finally, the `get()` function allows you to easily find and retrieve a blueprint by its name.

## Class StrategyReportService

This service helps you keep a detailed audit trail of your trading strategy's actions. It's designed to log important events like canceling a scheduled trade, closing a pending order, taking partial profits or losses, adjusting stop-loss orders (trailing stop and take), moving the stop-loss to breakeven, activating scheduled orders early, and adding averaging entries. 

Unlike some other reporting methods that keep everything in memory, this service writes each event to a separate JSON file immediately as it happens, ensuring a reliable record for review.

To start using it, you need to call `subscribe()`.  Once subscribed, the service will automatically log events via the `ReportWriter`, and when you’re finished, call `unsubscribe()` to stop the logging and clean up resources.  It's important to only subscribe once. Calling `unsubscribe()` multiple times is safe and won't cause problems.

## Class StrategyMarkdownService

This service is designed to help you track and analyze your trading strategy's actions during backtesting or live trading. It collects information about events like canceling scheduled signals, closing pending orders, taking partial profits or losses, adjusting trailing stops, and setting breakeven levels. Instead of writing each event immediately to a file, it holds these events temporarily to build a comprehensive report later.

Think of it as a temporary notepad for your strategy’s activity.  It remembers what your strategy is doing and lets you review it later.

Here's a breakdown of what it does:

*   **Collects Data:**  It keeps track of various events that occur during strategy execution.
*   **Generates Reports:**  You can ask it to create markdown reports summarizing these events, including statistics and details about each action.
*   **File Export:**  It can also save these reports to files with timestamps in the names for easy organization.
*   **Memory Management:** It uses a smart system for storing this data, only keeping a limited number of events per strategy and symbol to prevent memory issues.

To use it, you need to "subscribe" to start collecting data, and "unsubscribe" to stop and clear everything out. You can then retrieve data, generate reports, or save the report to file. The system automatically records these actions whenever a strategy takes them.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for strategy operations within the backtesting framework. It essentially wraps other services to provide a unified interface, injecting important information like the trading symbol, time, and backtest parameters.

Here's a breakdown of what it does:

*   **Validation:** It validates strategy configurations and associated risks, caching results to improve performance.
*   **Signal Retrieval:** It can fetch pending and scheduled signals related to a symbol's trading activity, providing details like target prices and expiration times.
*   **Position Information:**  It provides extensive details about the current position, including:
    *   Total amounts invested and closed.
    *   Effective average price.
    *   Number of entries (including any DCA).
    *   Unrealized profit and loss (in both percentage and dollar terms).
    *   The list of entry prices (for DCA).
    *   Partial close history.
*   **Management Operations:** It handles actions such as:
    *   Stopping a strategy from generating new signals.
    *   Cancelling scheduled signals.
    *   Closing a pending position.
    *   Manually triggering average buy entries.
    *   Setting stop-loss and take-profit orders.
*   **Backtesting and Tick Handling:** It facilitates running backtests against historical data and processing individual 'ticks' (price updates) within a strategy.
*   **State Monitoring:** It provides access to a snapshot of the strategy's current state and allows for checking if a strategy is stopped or has a scheduled signal.
*   **Resource Management:** It offers methods for clearing cached strategy instances and disposing of resources when finished.

## Class StrategyConnectionService

The `StrategyConnectionService` is a central routing point for your trading strategies within the backtest-kit framework. Think of it as a dispatcher that ensures the right strategy code gets executed for a specific symbol and trading condition. It cleverly remembers (caches) frequently used strategy instances to avoid unnecessary overhead, boosting performance.

Before you start using strategies, you'll want to initialize it using `waitForInit()`.  This service handles both live trading (`tick()`) and backtesting (`backtest()`) operations.

It provides various methods to monitor and manage your strategies:

*   **Status Checks:** You can check if a strategy is pending, scheduled, or stopped using methods like `hasPendingSignal`, `hasScheduledSignal`, and `getStopped`.
*   **Signal Information:**  It offers ways to retrieve details about pending signals, including their estimated duration, countdown, and even how far they are from breakeven or their profit/loss targets.
*   **Partial Adjustments:**  Methods like `partialProfit` and `partialLoss` let you execute partial position adjustments.
*   **Early Activation:** `activateScheduled` allows you to trigger a scheduled signal prematurely.
*   **Validation:**  Most actions have a `validate` equivalent to see if an action is valid *before* executing it.

Essentially, this service is the intermediary that connects your trading logic to the framework's core execution engine. It manages the lifecycle of strategies, ensuring they're initialized, running correctly, and can be monitored effectively.


## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a flexible middleman for managing how your trading signals are stored, allowing you to easily switch between different storage methods. It's designed to work with various storage solutions, such as persistent disk storage, in-memory storage, or even a dummy adapter for testing.

You can swap out the storage backend by using methods like `usePersist`, `useMemory`, or `useDummy` to choose the desired behavior.  The `getInstance` property provides a cached instance of the storage utility; calling `clear` on it forces a refresh, which is useful when the base directory changes.

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods allow the adapter to process events related to signals, passing these events along to the currently selected storage adapter.  You can also find signals by their ID or list all of them. The adapter also handles ping events to update signal timestamps. Finally, `useStorageAdapter` gives you full control by letting you specify a custom storage adapter constructor.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how your backtest data is stored. It allows you to easily swap between different storage methods, like storing data in memory, saving it to disk, or using a dummy adapter that does nothing at all. By default, it uses in-memory storage, but you can switch to persistent storage for saving data, or a dummy adapter for testing purposes.

The framework keeps track of signal events such as opening, closing, scheduling, and cancellation, and these actions are passed along to the currently selected storage adapter. You can also find signals by their ID or list all of them. The system handles ping events related to active and scheduled signals, keeping update timestamps accurate.

The `useStorageAdapter` method lets you specify which storage adapter to use. You can also conveniently switch between the dummy, persistent, and memory adapters using the `useDummy`, `usePersist`, and `useMemory` methods. To ensure that the storage adapter is reinitialized with the correct configuration (especially when your working directory changes), use the `clear` method to refresh the storage utils instance.

## Class StorageAdapter

The StorageAdapter acts as a central hub for managing your trading signals, keeping track of both past (backtest) and current (live) data. It automatically updates its records when new signals are generated, so you don't have to manually handle storage.

To ensure things run smoothly and efficiently, the adapter uses a "single shot" mechanism that makes sure it only subscribes to signal sources once.  It's designed to be reliable and straightforward to use.

You can easily control the adapter's behavior by enabling it to start listening for signals or disabling it to stop storing new data.  You can also retrieve specific signals by their ID or list all signals from either your backtest or live environment. The adapter is designed to be called multiple times without issues.

## Class StateLiveAdapter

The StateLiveAdapter helps manage the state of your trading strategies, especially when dealing with live trading scenarios. It's designed to be flexible, allowing you to swap out different ways of storing and managing that state – whether it's in memory, on disk, or even just discarded.

Think of it as a central place to keep track of important information, like how a trade is performing, so your strategy can make informed decisions. This is particularly useful for rules that dynamically adjust based on trade behavior.

The adapter offers several pre-built options for how it stores this state: a default file-based storage that survives program restarts, a local in-memory option, and a dummy version for testing. You can also use your own custom storage solutions.

To keep things efficient, the adapter caches state data for each signal, but provides a way to clear this cache when needed, for example when your working directory changes.

It's particularly useful for implementing rules that monitor how trades are doing, like ensuring trades don’t lose too much or aren’t profitable too soon – helping to validate underlying assumptions and react accordingly. Data like the time a trade has been open and its peak performance are saved, even if the application is restarted.

Methods like `disposeSignal` are used to clean up resources associated with a specific signal. `useLocal`, `usePersist`, and `useDummy` simplify switching between different state storage mechanisms.

## Class StateBacktestAdapter

The `StateBacktestAdapter` is a flexible component designed to manage and store state information during backtesting. It allows you to easily swap out different storage methods, giving you options for how and where your data is kept.

By default, it uses an in-memory store, which is quick but doesn't save data between runs. You can easily change it to use a file-based storage for persistence or a dummy adapter for testing purposes without actually saving anything.

The adapter keeps track of things like peak performance and how long a position has been open, specifically to evaluate trading rules based on LLM insights.

The `disposeSignal` method is important; it cleans up memory by removing state data associated with a specific trading signal when that signal is no longer active.

You can update state using `setState` and retrieve it using `getState`.

The `useLocal`, `usePersist`, `useDummy`, and `useStateAdapter` methods provide convenient shortcuts to change the adapter's behavior.  The `clear` function is particularly useful for resetting the storage when your working directory changes.

## Class StateAdapter

The StateAdapter acts as a central manager for your trading state, whether you're running a backtest or a live trade. It keeps things tidy by automatically cleaning up old data when signals are finished, preventing issues from lingering.

You can enable the adapter to start tracking state, and it will subscribe to signal events to handle cleanup. Disabling it is safe even if you’ve already disabled it.

To get the current state of a signal, use the `getState` function, providing details like signal ID, bucket name, initial value, and whether it's a backtest. Similarly, `setState` lets you update the state, again specifying those same details to ensure the correct storage is used.


## Class SizingValidationService

This service helps you keep track of and make sure your position sizing strategies are set up correctly. It acts as a central place to register your sizing approaches, so you know they're available when you need them.

Think of it as a little helper that verifies your sizing strategies exist before you try to use them, preventing potential errors. 

It also remembers its checks to work quickly, which is especially useful if you're dealing with many strategies. You can add new sizing strategies using `addSizing`, check if a strategy exists with `validate`, and see a complete list of registered strategies with `list`.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas, which define how much of an asset to trade. It uses a special system to ensure your schemas are consistent and well-defined.

Think of it as a central place to store and manage different sizing strategies.

You can add new sizing schemas using `register`, update existing ones with `override`, and easily retrieve them by name using `get`. The service also checks that your sizing schemas have the right structure before adding them, making sure everything is set up correctly.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade based on your risk management rules. It's a central component, working behind the scenes to manage position sizing. 

It utilizes a connection service to perform the calculations and also includes a validation service to ensure the sizing is correct. 

Essentially, when you want to execute a trade, this service figures out the appropriate size based on provided parameters and the current context. It provides a `calculate` function that's used to perform the actual sizing calculation.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine the size of positions to take. It acts as a central point for sizing calculations, directing requests to the correct sizing implementation based on a name you provide.

To improve efficiency, it remembers (caches) the sizing implementations it uses, so it doesn't have to recreate them every time.

You can think of it as a dispatcher; you tell it which sizing method you want to use, and it handles the rest.

The `getSizing` property is how you retrieve a sizing implementation – the first time you call it for a specific name, it creates one, and subsequent calls use the cached version.

The `calculate` method is where the actual sizing calculation happens. You give it the necessary parameters like risk tolerance, and it uses the correct sizing method to determine the appropriate position size. It intelligently handles different sizing approaches, such as fixed percentage, Kelly Criterion, or ATR-based sizing. If a strategy doesn't have any specific sizing configuration, you would use an empty string for the sizing name.

## Class SessionLiveAdapter

This component helps manage live trading sessions, offering flexibility in how session data is stored and accessed. It uses an adapter pattern, so you can easily swap out different ways of handling session data without changing your core trading logic.

By default, session data is saved to a file on your computer, meaning it will survive if your program restarts.  However, you can also opt to store the data only in memory (for quick tests) or discard it entirely.

It offers convenient shortcuts to switch between these different storage methods.  Behind the scenes, it efficiently stores these session configurations for various combinations of symbols, strategy names, exchanges, and frame names.

You can also create your own custom storage methods if the built-in options don't quite fit your needs. There’s a way to clear out the stored configurations if your base directory changes, which is useful when running multiple strategies.

## Class SessionBacktestAdapter

This component provides a flexible way to manage and store data during backtesting sessions. Think of it as a central hub for handling session information, allowing you to easily swap out different storage methods.

By default, it keeps data in memory, which is fast but not permanent. You can easily switch to storing data on disk for persistence or use a dummy adapter for testing purposes where data storage isn't needed. 

It keeps track of session data based on the trading symbol, strategy name, exchange, and frame, optimizing performance through memoization.

There are convenience functions to quickly switch between these storage options: `useLocal` for in-memory, `usePersist` for disk-based persistence, `useDummy` for discarding data, and `useSessionAdapter` to plug in your own custom storage solutions. The `clear` function is useful for refreshing the cache when the working directory changes. You can retrieve session data with `getData` and update it with `setData`.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data within your trading sessions, whether you're running a backtest or a live trading environment. It intelligently directs data operations to either the backtest storage or the live storage, depending on whether you're analyzing historical data or trading in real-time.

You can use `getData` to retrieve the current value associated with a particular signal, specifying the symbol, strategy, exchange, frame, and a timestamp. Similarly, `setData` lets you update these values, again with the adapter managing the correct storage location based on the backtest flag. This separation keeps your backtesting data distinct from your live trading data, ensuring accuracy and avoiding interference.


## Class ScheduleUtils

The `ScheduleUtils` class helps you monitor and understand how your scheduled trading signals are performing. Think of it as a central hub for getting a clear picture of your signal schedules.

It lets you gather statistics about signals that are waiting to be executed, signals that have been cancelled, and even calculates how often cancellations occur and how long signals are typically held in the queue.

You can use it to create easy-to-read markdown reports summarizing the activity of your signal schedules for specific trading strategies and symbols.

The class is designed to be simple to use and access, available as a single, readily available instance throughout your backtest kit setup. 

It allows exporting reports to disk for archiving or more in-depth analysis.

## Class ScheduleReportService

This service helps you keep track of when your signals are scheduled, opened, and canceled, storing this information in a SQLite database. It's designed to monitor signals and log important lifecycle events, particularly focusing on potential delays in order execution.

The service listens for signal events and automatically calculates how long it takes for signals to progress from scheduled to either executed or canceled.

You can use the `subscribe` method to start receiving signal events and a corresponding `unsubscribe` method to stop. The `subscribe` function makes sure you only subscribe once, preventing unintended consequences. The `tick` property is what actually handles processing each signal event and recording it.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your scheduled trading signals and create easy-to-read reports. It listens for when signals are scheduled or canceled, keeping a record of each event for every strategy you're using.

These records are then compiled into markdown tables, providing a clear overview of signal activity. You'll also get useful statistics like cancellation rates and how long signals are typically scheduled for.

The service automatically saves these reports as markdown files, organized by strategy, in a designated logs folder. 

You can also retrieve specific data or generate reports on demand, focusing on particular symbols or strategies. Clearing out old data is also simple, either for specific combinations or a complete reset.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management settings. Think of it as a central place to register all your risk profiles – essentially, the rules and guidelines you use to manage potential losses. 

Before you start using a risk profile in your trading strategy, this service can verify that it actually exists, preventing errors and unexpected behavior.

It's designed to be efficient; it remembers the results of its checks so it doesn't have to repeat validation work unnecessarily.

You can add new risk profiles using `addRisk`, check for existence with `validate`, and get a full list of registered profiles with `list`. This helps ensure your risk management configurations are consistent and reliable.


## Class RiskUtils

This class provides tools for analyzing and reporting on risk rejections within your trading system. It essentially acts as a central hub for accessing and summarizing risk-related data that’s being tracked. You can use it to get statistical overviews of rejections—like how many occurred for a specific symbol, strategy, or exchange—or to generate detailed markdown reports outlining each individual rejection event.

The reports include important information such as the rejection timestamp, symbol, strategy, position details, price, active positions at the time, and a description of the reason for the rejection. You can even have these reports saved directly to files to keep a record of your risk events. This helps with identifying trends, debugging issues, and generally understanding how your trading system is handling risk.


## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas, acting like a central repository. It utilizes a type-safe storage system, making sure your schemas are consistent and well-defined.

You can add new risk profiles using the `addRisk()` method (implemented as `register`), and easily retrieve them later by their names with `get()`.

Before adding a new schema, the `validateShallow()` function checks that it has all the necessary properties and they are the correct types.

If a risk schema already exists, you can update parts of it using `override()`. 

The service also has a logger, `loggerService`, to help track what's happening behind the scenes. 


## Class RiskReportService

The RiskReportService helps you keep a record of when trading signals are rejected by the risk management system. It's designed to listen for these rejection events and save them to a database, making it easier to analyze why trades aren't happening and to review past decisions.

Think of it as a safety net that captures those "no" decisions from the risk manager.

It works by subscribing to a stream of risk rejection events and, when a rejection happens, it logs details like why it was rejected and the specifics of the signal that was stopped. This information is then stored so you can review it later.

You can subscribe once to start receiving these rejection events; attempting to subscribe multiple times is prevented. When you're done, you can unsubscribe to stop the service from listening for new events.

## Class RiskMarkdownService

This service helps you create and save reports about rejected trades, which is useful for understanding why your trading strategies aren't executing as expected. It listens for events indicating a trade rejection and keeps track of these rejections for each symbol and strategy you're using.

The service automatically builds easy-to-read markdown tables summarizing these rejections, along with useful statistics like the total number of rejections for each symbol and strategy. It then saves these reports as files on your computer, making it simple to review and analyze your trading performance.

You can subscribe to receive rejection events, unsubscribe when you're done, and clear out the stored rejection data when it's no longer needed.  The service also provides methods to retrieve data and reports for specific combinations of symbol, strategy, exchange, frame, and backtest settings. You have the flexibility to control the columns displayed in the reports. Finally, it ensures that each symbol-strategy combination has its own private storage for data.

## Class RiskGlobalService

This service manages risk-related operations, acting as a central point for validating and tracking trading signals. It connects to a risk connection service to ensure trading decisions comply with established limits.

The service keeps track of validation activities and caches results to avoid unnecessary checks.

Key functions include:

*   **`checkSignal`:** Determines if a trading signal is permissible based on risk rules.
*   **`checkSignalAndReserve`:** A special version of `checkSignal` that also ensures safe handling of concurrent requests, preventing conflicts when multiple strategies try to execute simultaneously.
*   **`addSignal`:** Records a newly initiated trade (signal) with the risk system, capturing details like price, stop-loss, and estimated time.
*   **`removeSignal`:**  Marks a trade as completed and removes its record from the risk management system.
*   **`clear`:** Resets the risk data, either for all instances or for a specific risk setup.

Essentially, this framework provides a reliable system for ensuring that trades are executed responsibly and in accordance with predefined risk parameters.

## Class RiskConnectionService

This service acts as a central hub for handling risk-related operations within your trading framework. Think of it as a smart router that directs risk checks and signal management to the correct specialized risk handler based on the specific risk configuration. 

It efficiently manages these risk handlers, storing them in memory to avoid repeated creation, which speeds up your backtesting and live trading.

Here's a breakdown of what it does:

*   **Risk Routing:** It determines which specific risk handler to use, based on a given identifier, ensuring the right rules are applied.
*   **Caching:** It remembers previously used risk handlers, making things faster overall.
*   **Signal Validation:** It assesses if a trading signal is safe to execute, considering factors like portfolio drawdown and symbol exposure.  If a signal fails the risk check, it alerts the system.
*   **Concurrency Safety:** There’s a special version (`checkSignalAndReserve`) that ensures things run smoothly even when many signals are being processed at the same time. This prevents issues that can arise when multiple signals try to use the same information.
*   **Signal Management:** It registers and removes trading signals from the risk system, maintaining a record of active positions.
*   **Cache Clearing:** You can manually clear the cached risk handlers if necessary.

Essentially, `RiskConnectionService` simplifies risk management by providing a centralized, efficient, and reliable way to handle risk-related processes. It helps keep your trading activities within safe and defined boundaries.

## Class ReportWriterAdapter

This component provides a flexible way to manage and store your trading reports, like backtest results or live trading data. It uses an adapter pattern, meaning you can easily swap out how the data is stored without changing the core code.

It keeps track of your storage instances, ensuring you don't create multiple copies of the same storage for things like backtest results or walker data. The default storage method is to append data to JSONL files.

The `ReportFactory` property lets you change how the storage adapters are created, and `useReportAdapter` is how you actually make that change.  `getReportStorage` is automatically managing those created instances.

You can write data to these storage locations using `writeData`, which also takes care of setting up the storage the first time it's needed.

If you need to reset the storage, `clear` wipes out the stored instances. There are also handy shortcuts: `useDummy` to effectively ignore writes (useful for testing) and `useJsonl` to return to the standard JSONL storage.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit system are sending data to log files. Think of it as a way to turn on or off detailed logging for things like backtest runs, live trading, or performance analysis.

You can selectively enable these logging features, and the system will start recording events in JSONL format, including useful information for later examination. When you’re done with the logging, it’s really important to remember to unsubscribe to avoid problems like memory leaks.

Conversely, you can disable specific logging features without affecting others. This lets you focus on logging only what you need at any given time, conserving resources. Disabling doesn't require a special unsubscribe step because the logging is immediately stopped.



This utility class is usually used by ReportAdapter to add even more customization.

## Class ReportBase

The `ReportBase` class helps you efficiently log and manage event data related to your trading backtests. It creates a single JSONL file for each report type, ensuring that new events are always appended. 

It's designed to handle large amounts of data by writing in a stream format and preventing write buffer overflows.  A built-in timeout mechanism protects against stalled writes, and the system automatically creates the necessary directories to store these files.

You can easily search these logs based on various criteria like symbol, strategy, exchange, frame, signal ID, or walker name. 

The class manages file paths and initializes the writing stream automatically, and it’s safe to call the initialization multiple times without any issues. The `write` method is your primary tool for sending event data to the log file, which includes the data itself, associated metadata, and a timestamp.


## Class ReportAdapter

The `ReportAdapter` helps you manage and store your backtest data in a flexible way. Think of it as a central place to handle how your trading reports are saved.

It allows you to easily swap out different storage methods – like JSONL files or something else entirely – without changing your core trading logic. It intelligently keeps track of these storage methods, so you don’t have to create them every time.

You can also temporarily disable report writing with a "dummy" adapter for testing or debugging. The `clear` method is important to use if your base directory changes, ensuring fresh storage instances are used. This adapter automatically creates and manages storage for different types of reports, simplifying your data logging process.

## Class ReflectUtils

This class, `ReflectUtils`, provides a centralized way to track key performance metrics for your trading strategies, like profit and loss, peak profit, and drawdown, during both backtesting and live trading. It acts as a convenient shortcut to accessing these metrics without having to deal with the underlying complexities of position management.

Think of it as a reporting tool that gives you insights into how a position is performing.

Here’s a breakdown of what it offers:

*   **Real-time Position Data:** It provides access to information like unrealized PnL (both percentage and dollar amount), peak profit prices and timestamps, and drawdown metrics.
*   **Comprehensive Metrics:** You can get information on highest profit, highest PnL, drawdown duration, worst loss, and distances between current price and these key points.
*   **Contextual Information:** It understands the context of the trade—the strategy, exchange, and frame—to give you accurate results.
*   **Backtest Compatibility:**  The framework can be used during backtests to analyze historical performance.
*   **Singleton Instance:**  It’s designed to be used conveniently across your application as a single, shared instance.

Essentially, `ReflectUtils` gives you the tools to monitor and understand the risk and reward profile of your positions at a glance, whether you're simulating past performance or observing live trades.


## Class RecentLiveAdapter

The `RecentLiveAdapter` provides a flexible way to manage and retrieve recent trading signals. It acts as a central point for accessing signal data, allowing you to easily switch between different storage methods without modifying your core logic.

You can choose to persist signals to disk for long-term storage or opt for a fast, in-memory solution if persistence isn't critical. This is done using the `usePersist()` and `useMemory()` methods, letting you adapt to different needs.

The adapter intelligently caches the storage implementation to avoid unnecessary rebuilding, but you can manually clear this cache using `clear()` if you need to ensure a fresh start, like when the working directory changes.

Methods like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` provide access to signal data, while `handleActivePing` handles incoming ping events. You can even customize the adapter by providing your own storage implementation via `useRecentAdapter`.

## Class RecentBacktestAdapter

This component helps you manage and retrieve recent trading signals, offering flexibility in how that data is stored. It acts as a bridge, allowing you to easily switch between storing signals in memory or persistently on disk.

The system keeps track of the most recent signals created for your strategies, and provides a way to check how long ago a signal was generated. 

You can change the storage mechanism without modifying the core logic of your backtesting process. The default is to keep signals in memory, but you can switch to persistent storage if you need to.

The adapter also smartly caches the storage instance to avoid unnecessary work, but it has a "clear" function to ensure a fresh start when needed, for example, when the working directory changes. It handles events and retrieves signals on behalf of the underlying storage implementation.

## Class RecentAdapter

This component handles managing and accessing recent trading signals, whether you're running a backtest or a live trading system. It automatically updates signal storage by monitoring incoming data and provides a single, easy way to retrieve the most recent signal for a specific asset and trading scenario. 

To prevent unnecessary updates, it uses a "singleshot" system that ensures it only subscribes to updates once. 

You can turn the signal storage on with `enable`, off with `disable` (and it's safe to call `disable` even if it's already off), and retrieve the latest signal with `getLatestSignal`. The `getLatestSignal` function is designed to avoid look-ahead bias by only returning signals that occurred before a specified time.

Finally, `getMinutesSinceLatestSignalCreated` lets you check how long ago the latest signal was generated, also considering a time cutoff to prevent future data influence.

## Class PriceMetaService

PriceMetaService helps you get the latest market prices for your trading strategies, keeping track of them in a smart way. Think of it as a central place to find prices, updated automatically as your strategies run.

It stores prices for each specific combination of symbol, strategy, exchange, frame, and backtest environment, so you always have the right data.  If you need a price outside of the normal trading loop, this service provides it.

It's designed to be easy to use: if a price isn't immediately available, it'll wait patiently (up to a certain time) for it to arrive.  You can also clear out old prices to keep things clean and efficient – either for a specific price or all of them.

The service automatically updates the prices as your strategies execute and is managed centrally within the system. It’s crucial to clear these cached prices when starting a new strategy run to avoid using outdated information.

## Class PositionSizeUtils

This class offers tools to help determine how much of an asset to trade, which is crucial for managing risk and potentially maximizing returns. 

It includes pre-built methods for several common position sizing strategies.
These methods, like fixed percentage, Kelly Criterion, and ATR-based sizing, each have their own specific formulas and considerations.

Before calculating a position size, each method will check to ensure the provided information aligns with its requirements, helping prevent errors. 
You simply call the appropriate method, providing the necessary data like account balance, entry price, and potentially other factors like Average True Range or win rate. 
The methods return a promise that resolves to the calculated position size.

## Class Position

The `Position` class provides helpful tools to figure out where to place your take profit and stop loss orders when trading. It handles the logic of automatically adjusting these levels depending on whether you're going long (buying) or short (selling).

The `moonbag` function calculates take profit and stop loss prices based on a simple strategy: your take profit is set at 50% above the current price. 

The `bracket` function allows for more customized take profit and stop loss levels, letting you specify both percentages for each. It determines the appropriate price levels for both your stop loss and take profit based on your input.

## Class PersistStrategyUtils

This class helps manage how strategy information is saved and loaded, especially when a strategy is running. It makes sure each strategy has its own storage space, and it allows you to customize how that storage works.

The system remembers which storage to use based on the trading symbol, strategy name, and the exchange involved, creating only one storage instance for each unique combination. 

It provides simple functions to read and write this saved data, and those functions set up the storage the first time they’re used.  If something goes wrong, this framework helps protect the current state of any operations in progress.

You can choose between different ways to store the data – a regular file, a custom solution you provide, or even a dummy option that does nothing (useful for testing).

If you're changing where your program is running from, you should clear the cache to ensure everything loads correctly.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. It's designed to be reliable, even if your program crashes unexpectedly.

It stores the strategy's data using a specific identifier so that it can reliably find the right data.

You provide the symbol, strategy name, and exchange name when you create an instance, and it takes care of writing and reading the strategy's data to a persistent storage location.

The `waitForInit` method makes sure the storage is ready to use.  The `readStrategyData` method retrieves the saved strategy data, and `writeStrategyData` saves the current strategy state to the storage, allowing you to pick up where you left off. Clearing the strategy state is possible by passing null to `writeStrategyData`.

## Class PersistStorageUtils

This class, PersistStorageUtils, helps manage how your trading signals are saved and loaded, particularly for persistence across sessions. It’s designed to keep track of signal data even if your program restarts.

It uses a clever system where it creates storage instances – think of them as ways to read and write signal data – and remembers which one to use for each mode, like backtesting or live trading. If you want to use a different way to store your signals, you can swap out the default storage mechanism.

The class handles reading and writing all of your signals, and does so in a way that minimizes the risk of data loss. Each signal is treated as a separate file, and changes are written safely.

If you’re changing the directory where your signals are stored, or if you need a completely dummy storage for testing, there are functions for that too. The `clear` function is useful when the working directory changes.

## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals persistently, using files on your computer. It's designed to be reliable, even if your program crashes unexpectedly.

Each signal is saved in its own JSON file, making it easy to manage and identify them.  The system reads all signals by looking at the file names, and ensures data is saved safely through atomic writes.

The `backtest` property indicates whether the storage is for a backtesting scenario.  Internally, it uses a file-based system to manage the signals.

You can use `waitForInit` to make sure the underlying storage is ready to be used.  `readStorageData` fetches all your stored signals, while `writeStorageData` saves a collection of signals to the persistent storage.

## Class PersistStateUtils

The `PersistStateUtils` class helps manage how your trading strategies store and retrieve their data, ensuring consistency even if things go wrong. Think of it as a centralized helper for keeping your strategy's progress safe.

It cleverly memoizes (caches) state storage instances. This means it avoids creating unnecessary objects for each interaction with your data, making things more efficient. You can also plug in your own storage solutions, letting you customize where and how your strategy's data is saved.

It provides functions for initializing storage, reading data, and writing data, handling the underlying storage setup automatically. There are convenient shortcuts for using a dummy (no-op) storage for testing or reverting to a standard file-based system. 

The class also includes features for clearing caches, disposing of resources, and customizing the type of storage instance used, giving you fine-grained control over data persistence. This is particularly useful when dealing with changes in the working directory or removing signals during strategy execution.


## Class PersistStateInstance

This class, `PersistStateInstance`, provides a way to save and load state data related to a specific signal, using files. Think of it as a simple storage system that keeps track of information for each signal you're working with. 

It works by creating a dedicated storage area for each signal, identified by a unique name.  

The `waitForInit` method ensures the storage is ready before you try to read or write data.  `readStateData` retrieves the saved information, while `writeStateData` updates it.  Importantly, the `dispose` function doesn’t actually do anything itself; any necessary cleanup is handled elsewhere.


## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved, ensuring a reliable system even if things go wrong. It automatically creates separate storage areas for each trading strategy, symbol, and exchange, preventing conflicts.

You can customize how the signal data is stored, plugging in your own methods for persistence.  It also provides built-in tools for atomic operations to maintain data integrity.

The `readSignalData` method retrieves existing signal data, and if it doesn't exist, it creates the storage area automatically.  Similarly, `writeSignalData` saves new signal data or clears old data.

There are helper methods to easily switch between different persistence methods: use a custom adapter with `usePersistSignalAdapter`, revert to the standard file-based JSON storage with `useJson`, or use a dummy instance for testing with `useDummy`. The `clear` method helps reset the system when the working directory changes.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, provides a way to reliably save and retrieve signal data to a file. Think of it as a safe keeper for your trading signals. It's designed to work with the broader backtest-kit framework and uses a file-based approach to ensure your data isn't lost.

Each instance is tied to a specific trading symbol, strategy name, and exchange. 

It handles the underlying file storage automatically and protects against crashes by writing data in a safe, atomic way.

Here’s a breakdown of what you can do:

*   **Initialization:** `waitForInit` ensures the storage is ready before you start working with it.
*   **Reading Signals:** `readSignalData` lets you load the saved signal data associated with a symbol.  It returns the data or nothing if no data exists.
*   **Saving Signals:** `writeSignalData` allows you to save a signal (or clear existing data) for a specific symbol.


## Class PersistSessionUtils

The PersistSessionUtils class helps manage how your trading sessions are saved and loaded. It makes sure that session data is consistently stored in files within a specific folder structure: ./dump/session/<strategyName>/<exchangeName>/<frameName>.json.

It intelligently caches these session storage instances, creating new ones only when needed, based on the strategy, exchange, and frame being used. You can easily swap out the default storage method to use a file system, a dummy (no-op) method for testing, or even provide your own custom storage adapter.

The class provides tools to initialize storage, read data from it, and write data back, all while ensuring that these actions happen safely and reliably. There's also a way to clear the cached storage and manually dispose of individual session data when it’s no longer needed, which is helpful when your working directory changes. Finally, it allows you to register and switch between different session storage implementations.

## Class PersistSessionInstance

This class helps you save and load the state of your trading sessions, particularly useful for backtesting or keeping track of progress. It essentially acts as a persistent memory for your strategies, ensuring that things like variables and settings are preserved even when you restart your program.

It stores session data in files, organizing them by the strategy and exchange being used, as well as a unique identifier based on the symbol and whether it's a backtest. The identifier prevents different symbols running the same strategy from interfering with each other’s saved states.

The class provides methods to load and save this data.  Initialization is handled by `waitForInit`.  `readSessionData` retrieves the saved state, and `writeSessionData` saves the current state.  `dispose` doesn't do anything itself; instead, it relies on a separate utility function to manage things like clearing cached data. 

It also provides properties to access information about the strategy, exchange, frame name, symbol and backtest status.


## Class PersistScheduleUtils

This class provides tools for safely saving and restoring scheduled signals, which are used by your trading strategies. It keeps track of where these signals are stored, allowing you to customize the storage location, like using a file or a different data source.

The system automatically creates a storage location for each strategy you're running, based on the symbol being traded, the strategy's name, and the exchange used. It makes sure that reading and writing these signals happens reliably, even if something unexpected occurs.

You can easily change how these signals are saved – for example, switching to a simple file-based storage or using a testing-only dummy storage that doesn't actually save anything. You can also clear the system's memory of these storage locations if your working directory changes. This helps keep your trading data consistent and recoverable.

## Class PersistScheduleInstance

This class helps you save and retrieve data related to scheduled signals, like those generated by a trading strategy. It’s designed to be reliable, even if your application crashes unexpectedly.

Think of it as a dedicated container for storing information about a specific trading strategy on a particular exchange and instrument.

It uses a file on your computer to store this data, making sure the updates happen safely.

Here's what you can do with it:

*   **Initialization:**  `waitForInit` gets the storage ready to use.
*   **Reading Data:** `readScheduleData` retrieves the saved signal data for a given symbol. It returns `null` if nothing is stored.
*   **Saving Data:** `writeScheduleData` allows you to save new signal data or clear out existing data.



The class keeps track of the instrument symbol, the strategy’s name, and the exchange it’s associated with. It handles the underlying file storage to ensure your data persists.

## Class PersistRiskUtils

This utility class helps manage how your trading strategy's risk information is saved and loaded, particularly active positions. It efficiently stores these positions separately for each risk profile you define, making sure the data is handled consistently.

It offers flexibility by allowing you to customize how this data is persisted, whether it's through files, a database, or even a dummy implementation for testing. 

The class makes sure that reading and writing this position data is reliable, even in unexpected situations.  It also keeps a record of these storage instances and refreshes them when needed, such as when your working directory changes. There are built-in shortcuts for using a default file-based storage or a dummy storage for testing purposes.

## Class PersistRiskInstance

This class provides a way to reliably store and retrieve position data, acting as a bridge between your trading strategies and persistent storage. It's designed to be a safe and straightforward method for saving information about your positions to a file.

Essentially, it manages the file operations, making sure data is written securely. 

You provide the risk and exchange names when creating an instance.

Internally, it uses a specific file name ("positions") for consistency and safeguards data using atomic writes to prevent corruption.

The `waitForInit` method makes sure the storage is ready before you start working with it. `readPositionData` lets you load previously saved position data, and `writePositionData` saves new or updated position information.

## Class PersistRecentUtils

This class helps manage how recent trading signals are stored and retrieved. It's designed to be efficient and reliable, ensuring signals aren't lost even if things go wrong. 

The class uses a clever system to create storage instances based on the symbol, strategy name, exchange, and timeframe you're using. You can even swap out the storage mechanism to use your own custom solution.

It simplifies the process of reading and writing these signals, ensuring operations are handled safely.

There's a way to completely clear the stored data when needed, which can be helpful when restarting a process.  You also have options to switch between a standard file-based storage, or a "dummy" version that does nothing, useful for testing. It's used internally by other tools to keep track of recent signal activity.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent data for a particular trading strategy and timeframe. It's designed to work with files, ensuring your data is stored reliably.

Think of it as a way to remember the last signal generated by your strategy, linked to its symbol, strategy name, exchange, and the timeframe you're using. The class handles saving this data as a JSON file, keeping everything consistent.

Here's a breakdown of how it works:

*   **Context Matters:** It identifies data using a unique key that includes whether it’s a backtest or live trading scenario, and the timeframe (e.g., 1-minute, 5-minute).
*   **Initialization:** The `waitForInit` method sets up the storage for your data.
*   **Retrieving Data:** `readRecentData` allows you to get the most recently saved signal.
*   **Saving Data:** `writeRecentData` is how you save the current signal.

The class uses the symbol (like "AAPL" for Apple stock) as the unique identifier for your data within the storage. The `_storage` property is the underlying component that actually handles the file writing.

## Class PersistPartialUtils

This class, `PersistPartialUtils`, helps manage and save information about trading progress—specifically, partial profits and losses—in a reliable way. It's designed to keep track of these values for each trading strategy and symbol, even if something unexpected happens.

It cleverly avoids creating duplicate storage instances for each symbol and strategy combination, optimizing performance.  You can customize how this data is stored by providing your own storage adapter.

This class ensures that updates to partial data happen safely and consistently, minimizing the risk of data loss. It's a critical component for keeping track of trading performance and ensuring a stable trading experience.

Here’s a bit more detail on how it works:

*   **Customizable Storage:** You can plug in your own way of storing this data, or use the built-in JSON file-based storage or a dummy version for testing.
*   **Lazy Loading:**  Storage instances are created only when needed, improving efficiency.
*   **Cache Management:** The `clear()` method is essential to use when your development environment changes, ensuring data consistency across strategy runs.



The `readPartialData` method retrieves the stored partial data for a specific signal and context. The `writePartialData` method updates that data.

## Class PersistPartialInstance

This class helps you save and load temporary data related to your trading strategies, especially when things might go wrong. It's designed to work with files to store this information.

It keeps track of which symbol, strategy, and exchange the data belongs to.

The `waitForInit` method sets up the storage area initially.

`readPartialData` retrieves any existing, incomplete data associated with a particular signal, which is identified by a unique `signalId`. Think of it as finding a partially saved record.

`writePartialData` saves new or updated data for a signal, again using the `signalId` to pinpoint where the information goes. This ensures that updates are written reliably, even if there's a crash during the process. It's meant to keep track of things that aren't fully complete yet.


## Class PersistNotificationUtils

This class provides tools for safely and reliably saving and loading notification data. It’s designed to ensure that notifications are stored consistently, even if there are unexpected interruptions or crashes.

It intelligently manages how notification data is stored, using a system where each notification has its own file. The class uses a technique called memoization to make sure it's only creating the necessary storage mechanisms, and it supports different ways of persisting data, like using standard files, custom adapters, or even a dummy implementation for testing.

You can easily swap out the data storage mechanism by providing your own constructor, or choose to use the default file-based storage or a dummy version for testing purposes.  The class also has a way to completely clear its internal caches, which is useful if the application's working directory changes.  Essentially, it handles the technical details of saving and retrieving notification data so you don’t have to.


## Class PersistNotificationInstance

This class provides a way to store and retrieve notification data persistently, meaning the data survives when your application restarts. It's designed to work reliably even if things go wrong during the saving process.

The notifications are saved as individual JSON files, making it easy to manage and understand the data. When you need to read all the notifications, it goes through each file individually.

This implementation is built to be crash-safe, so you don't have to worry about data loss due to unexpected interruptions. 

The `backtest` property determines whether this is being used in a testing or live environment, and the `_storage` property handles the actual file-based storage. You can initialize the storage with `waitForInit`, read all notifications with `readNotificationData`, and save new notifications using `writeNotificationData`.


## Class PersistMemoryUtils

This class helps manage how data is saved and retrieved for your trading strategies, specifically for things like remembering past calculations or state. It's designed to make sure this data is stored reliably, even if your program crashes unexpectedly.

It keeps track of different storage locations based on identifiers like `signalId` and `bucketName`, and allows you to customize how those locations are handled. 

You can read, write, and delete stored data, and it provides a way to check if data exists before trying to access it.  There's also a function to help rebuild indexes of data when needed. 

To ensure data persistence across different runs, it's important to clear the cache when the working directory changes. Finally, the class allows you to switch between different methods of storage, from using actual files to a dummy implementation that does nothing at all.

## Class PersistMemoryInstance

This component provides a way to persistently store and retrieve memory data using files. It essentially acts as a bridge between your application and the file system, managing how data is saved and loaded.

Each instance is tied to a specific signal and a bucket name, defining where the data will be stored. 

When you need to read data, it can fetch a memory entry by its unique ID. If the entry doesn't exist or has been soft-deleted, it will return null.  You can also check if a particular memory entry exists before attempting to read it.

Writing new data is straightforward; it saves a memory entry with a unique ID and timestamp. If you need to remove an entry, it doesn't permanently delete it—instead, it marks it as removed, allowing you to retain the data for potential recovery or auditing.

When you want to see all the memory entries, you can iterate through them, but only non-removed entries are included. 

Finally, the `dispose` method doesn't actually do anything directly since cleanup is taken care of by another utility function.

## Class PersistMeasureUtils

This utility class, PersistMeasureUtils, helps manage and store data retrieved from external sources, like APIs, in a way that's reliable and efficient. It's designed to work with the Cache.file component for long-term storage of API responses.

Think of it as a smart system for keeping track of API results, organizing them based on things like timestamps and symbols. It's designed to be flexible, allowing you to plug in different ways of storing the data, like using files or a custom solution.

The system avoids unnecessary work by creating storage instances only when needed and ensuring that read and write operations are handled carefully. When a problem occurs and the system needs to restart, this design helps protect the integrity of the cached data.

You can customize how this data is stored by providing your own storage methods, or use pre-built options like a standard file-based system or a dummy version for testing. The `clear` method lets you reset the stored information when needed, for example, if your working directory changes. Ultimately, it's all about keeping your API data organized and accessible.

## Class PersistMeasureInstance

This class provides a way to store and retrieve measure data persistently, often to a file. It acts as a layer on top of a basic file storage system, ensuring that changes are written safely. 

When you need to manage data that needs to be saved between sessions, this class simplifies the process.  It handles things like marking entries as deleted (but not actually removing them) and retrieving only the active data.

The `bucket` property identifies the storage location. 

Here's what you can do with it:

*   Read a specific measure entry using its key.  If the entry doesn't exist or has been "soft-deleted", you'll get `null` back.
*   Write or update a measure entry with associated data and a key.
*   Soft-delete an entry – essentially marking it as removed without actually deleting the file it's stored in. This is useful for keeping a history.
*   List all the active (non-deleted) entries in the bucket, allowing you to iterate over them.
*   You can initialize the storage backend, which is useful in scenarios where the storage is not immediately available.

## Class PersistLogUtils

This class helps manage how log data is saved and retrieved. It keeps track of a single, shared log instance for efficiency, and allows you to customize how that log data is stored using different adapters. 

The system automatically handles reading and writing log entries, making sure data is saved reliably and avoiding duplicates. Each log entry is stored as its own file, and the whole process is designed to be safe even if the application crashes unexpectedly.

You can easily switch between different storage methods, such as using a standard file-based system, a custom adapter you’ve built, or even a dummy version for testing purposes. Clearing the stored log instance is important when the environment changes, like when you move your project directory.

## Class PersistLogInstance

This class helps you store trading logs to files, making sure they're safe even if your program crashes. It essentially creates a collection of individual JSON files, each representing a log entry identified by a unique ID.

The system works by adding new logs to the end of this collection; it won't overwrite existing logs.  It's designed to ensure data integrity, as writes are handled in a way that minimizes the risk of losing information.

To get started, it needs to initialize its file storage. You can read all the stored log entries at once by retrieving them all, and writing new ones will simply add them to the existing files.


## Class PersistIntervalUtils

This component helps manage persistent markers that track when specific intervals have fired within your backtesting system. It essentially keeps track of which intervals have already happened for a given timeframe and identifier.

The data is stored in files located under a `./dump/data/interval/` directory.  Each file represents an interval firing.

You can customize how this persistence layer works by providing your own constructors for interval marker instances, or use built-in options like a file-based system or a dummy implementation for testing purposes. 

The framework handles reading, writing, and deleting these markers, and it automatically sets up the storage for each timeframe only when needed. 

There's also a way to clear out the cached storage if your working directory changes between backtesting runs. This ensures data consistency.


## Class PersistIntervalInstance

This class helps you reliably store and retrieve data related to specific time intervals in your trading strategy. It's designed to work with files, ensuring your data persists even if your program restarts.

Think of it as a way to mark when certain conditions have been met for a particular interval – like a candlestick pattern or a price level being reached.

The system keeps track of these interval markers, allowing you to efficiently manage and re-trigger events when needed. If a marker needs to be temporarily disregarded, it can be "soft-deleted" – the data remains in the file, but is ignored during retrieval, and can be reactivated later.

You provide a "bucket" name to identify where this data is stored, and it handles the underlying storage details for you.

Here's a breakdown of what you can do:

*   **Initialization:** You can make sure the storage is ready.
*   **Read Data:** Retrieve a specific interval marker. If it doesn't exist or is "soft-deleted," you'll get nothing.
*   **Write Data:** Create a new interval marker.
*   **Remove Data:** "Soft-delete" a marker by flagging it as removed.
*   **List Data:** Get a list of the keys of all the interval markers that haven't been removed.

## Class PersistCandleUtils

This class helps manage how your trading strategy’s historical candle data (like open, high, low, close prices) is stored and retrieved. It's designed to keep things organized and efficient by saving each candle as a separate JSON file, making it easy to find what you need. 

The system checks if the cached data is still valid based on the number of files it expects.  It also automatically updates the cache if any data is missing.

You can customize how this storage works by providing your own candle cache implementations. If things change in your environment, like when you restart your program, you can clear the storage to ensure a fresh start.  There's even a "dummy" option that's useful for testing – it doesn’t actually save any data.

## Class PersistCandleInstance

This class provides a way to store and retrieve historical candle data for trading, acting as a persistent layer for your backtesting framework.  It uses files to store each candle's data individually, making it easy to manage and access. 

Think of it as a simple database specifically for your candle data. 

If a candle isn't found when reading, it will be treated as a cache miss, prompting a refresh from the original source.  The writing process is designed to be safe, skipping any candles that aren't fully complete (meaning their `closeTime` is in the future) and preventing overwrites. If a candle is found to be corrupt, it will be skipped and logged as a warning, effectively causing a cache miss for that candle.

It's initialized with the symbol, trading interval (like 1-minute or 1-day), and the exchange name, essentially defining the scope of data it manages.  The `waitForInit` function ensures the underlying storage is ready before any operations.

## Class PersistBreakevenUtils

This utility class manages how your breakeven data is saved and loaded from disk, making sure that your trading strategies can remember important information. It acts like a central hub for handling breakeven states, creating a dedicated storage space for each combination of symbol, strategy, and exchange. 

Think of it as a way to persist the state of your strategies so you don’t have to recreate it every time. It automatically creates and caches these storage spaces, and the first time it needs to access one, it sets it up for you.

You can also customize how the data is stored, choosing between file-based storage or even a dummy instance that doesn't actually save anything, useful for testing. If you’re switching locations or need to refresh the storage, there's a way to clear the cached storage. The data itself is organized in a specific folder structure under `./dump/data/breakeven/`.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, ensuring your backtesting process isn't derailed by unexpected interruptions. It acts as a bridge, using a file-based system to safely manage this data and keeps things organized by associating data with a specific symbol, strategy, and exchange.

The class internally manages a file to store the data, and it’s structured to handle situations where the process might be interrupted.

Here's a breakdown of what you can do with it:

*   **Initialization:** You can use `waitForInit` to ensure the storage is ready.
*   **Retrieving Data:** `readBreakevenData` allows you to fetch breakeven information associated with a particular signal (identified by its ID and a timestamp).
*   **Saving Data:** `writeBreakevenData` lets you save new or updated breakeven data, again using the signal ID and timestamp as identifiers.

Essentially, it takes care of the file-handling complexities so you can focus on the logic of your trading strategy.

## Class PersistBase

This class provides a foundation for saving data to files in a safe and reliable way. It handles the underlying file management, ensuring that writes are atomic (all-or-nothing) to prevent data corruption. The system automatically checks and cleans up any damaged files it finds.

You specify a name for your data ("entityName") and a base directory where the files will be stored. It calculates the exact file paths based on unique identifiers ("entityId").

The `waitForInit` method sets up the initial directory and validates existing data, and only runs once. 

You can read data back using `readValue`, quickly check if a piece of data exists with `hasValue`, and write new data with `writeValue`. The `keys` method lets you iterate through all the unique identifiers of the data being stored, which is helpful for things like validation.


## Class PerformanceReportService

This service helps you understand where your trading strategy is spending its time. It listens for performance events during strategy execution and keeps a record of them.

You can think of it as a performance detective, logging details like how long different parts of your strategy take to run. 

The `subscribe` method allows you to turn on this performance tracking, and it ensures you only subscribe once to prevent issues. Remember to use the returned function to `unsubscribe` when you no longer need to track performance. 

The `loggerService` is used for outputting debugging information, and `track` is responsible for actually processing and logging the performance data. Finally, the `unsubscribe` method provides a guaranteed way to stop listening for those performance events.


## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance data and organizes it, calculating things like average results, the best and worst outcomes, and percentiles to give you a detailed view of your strategy's behavior. 

It creates separate storage spaces for each unique combination of symbol, strategy, exchange, frame, and backtest to ensure data isolation.

You can subscribe to receive performance updates as they happen, and easily unsubscribe when you no longer need them. The `track` function is the key to feeding performance events into the system.

To see the results, you can request the data for a specific strategy, or generate a comprehensive markdown report that identifies potential bottlenecks. The report can be saved as a file for later review. 

Finally, there’s a way to completely clear out the accumulated performance data when you need to start fresh.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to analyze metrics and pinpoint areas for improvement.

You can use it to retrieve detailed performance statistics for specific strategies and symbols, uncovering things like average durations, volatility, and potential bottlenecks. This data is grouped by different operation types, so you can see exactly where time is being spent.

Generating reports is simple – the Performance class can create formatted markdown reports showing performance trends and statistics.  These reports highlight areas that might be slowing down your strategy.

Finally, it's easy to save these reports directly to your hard drive for later review and sharing, with the option to customize the file location and columns shown. The reports automatically include bottleneck analysis to assist in identifying optimization opportunities.

## Class PartialUtils

This class provides tools for analyzing and reporting on partial profit and loss data. It helps you understand how your trading strategies are performing by providing statistics and detailed reports.

You can use it to get aggregated statistics like total profit/loss counts.

It can also generate nicely formatted markdown reports that show individual profit and loss events, including details like the symbol traded, the strategy used, the position taken, price levels, and timestamps.

Finally, you can save these reports directly to files, making it easy to share or archive your performance data. The reports are named in a clear format, such as "BTCUSDT_my-strategy.md," for easy organization.

## Class PartialReportService

The PartialReportService helps you keep track of every time your trades close out partially, whether it's a profit or a loss. It essentially logs these 'partial exit' events, noting the price and level at which they occurred. 

To get started, you'll subscribe to the `partialProfitSubject` and `partialLossSubject` to receive notifications about profit and loss closures.  This subscription is designed to prevent accidental duplicate connections.

You can later stop listening for these events by using the unsubscribe function that the `subscribe` method provides. 

The service uses a logger for debugging purposes and ultimately stores the recorded information for later analysis. The data gets written to a SQLite database through the `ReportWriter`.


## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on smaller, incremental profits and losses. It listens for these profit and loss events as they happen and neatly organizes them by symbol and trading strategy.

It generates readable markdown reports that detail each event, including helpful statistics like total profit and loss. These reports are saved to your disk, making it easy to review and analyze your trading activity.

You can subscribe the service to receive ongoing events, and it ensures you don't accidentally subscribe multiple times. It also provides ways to get the accumulated data, generate reports, and clear out the stored data when you're done. The storage is organized so that each symbol and strategy combination gets its own, separate storage area.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses in your trading strategies. It's designed to be injected into your strategies, providing a single place to handle these operations.

It works by forwarding all its requests – like recording profits, losses, or clearing signals – to a dedicated connection service. This design allows for consistent logging of those actions at a global level, making it easier to monitor and troubleshoot your strategies.

The service also incorporates various validation checks to ensure your strategies and associated configurations (like risk parameters, exchanges, and frames) are set up correctly. This validation is optimized to avoid unnecessary checks. 

Essentially, it’s a structured way to handle partials, maintain logging consistency, and validate configurations within your trading framework.


## Class PartialConnectionService

The PartialConnectionService helps track profit and loss for trading signals. It's like a central manager that makes sure each signal has its own dedicated record-keeper (a ClientPartial).

This service acts as a factory, creating and managing these record-keepers, and it keeps track of them so they’re readily available. It uses a clever caching system to avoid creating new record-keepers every time.

When a signal makes a profit or loss, this service handles the details and sends out notifications.  It also cleans up old records when signals are finished, ensuring everything stays organized and preventing unnecessary clutter.

Think of it as the behind-the-scenes engine that ensures accurate and efficient profit/loss tracking for each signal in your trading system. It’s designed to work closely with the broader strategy and relies on other services to do its job effectively.

## Class NotificationLiveAdapter

This component helps you manage and send notifications related to your trading strategies. It's designed to be flexible, allowing you to easily swap out different ways of sending those notifications – whether it's to memory, a file, or some other system.

You can think of it as a central hub that receives notifications about various events like signals, profits, losses, and errors, and then passes them on to the chosen notification method.

Initially, it uses an in-memory storage for notifications. However, you have options. You can switch to a persistent storage that saves notifications to disk, a dummy adapter that does nothing (useful for testing), or even provide your own custom notification method.

The `getInstance` property is interesting because it ensures that the notification system is only built once and reused, but you can force it to rebuild by calling `clear()` – this is important if your environment changes between strategy runs.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`) are the entry points for different event types. These methods simply forward the information to the currently active notification adapter. The `getData` method lets you retrieve all stored notifications. The `dispose` method cleans up any stored notifications.

Finally, the `use...` methods (`useDummy`, `useMemory`, `usePersist`) provide a convenient way to change the notification backend, while `useNotificationAdapter` allows for more fine-grained control by specifying a custom adapter.

## Class NotificationHelperService

This service helps manage and send out informational notifications related to trading signals within the backtest framework. It's primarily used internally, but developers can trigger notifications by using the `commitSignalNotify` function within their custom logic.

The service validates strategy, exchange, and other related configurations – thankfully, it's designed to be efficient. It remembers previous validation results and avoids re-checking if the context (strategy, exchange, frame) hasn't changed.

The `commitSignalNotify` function is key. It takes information like a signal payload, the trading symbol, the current price, and context details, then it performs validations and sends out the notification to interested listeners and for persistent storage. Essentially, it handles the complete process of creating and distributing signal information.

## Class NotificationBacktestAdapter

This component helps you manage and send notifications during backtesting. It's designed to be flexible, allowing you to easily switch between different ways of handling those notifications, like storing them in memory, saving them to a file, or simply discarding them.

You can choose how your notifications are handled using convenient shortcuts like `useMemory` (the default which keeps notifications only in memory), `useDummy` (for testing when you don’t want any actual notifications sent), and `usePersist` (to save notifications to disk).  The system remembers which notification method you've selected.

It provides a central place (`handleSignal`, `handlePartialProfit`, etc.) to send various event notifications during a backtest.  These methods pass the data to the currently selected notification backend.

There's also a `getData` method to retrieve all stored notifications and `dispose` to clear them, and `clear` which is useful to make sure the notifications are reinitialized after the current working directory has changed. Finally, `useNotificationAdapter` allows for complete customization by letting you specify the exact class to use for notifications.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for handling notifications, both during backtesting and when the strategy is live. It automatically receives updates related to trading signals and various events like profit targets, losses, and errors.

This adapter ensures you don't accidentally subscribe to the same signals multiple times, preventing redundant notifications.

You can easily retrieve all stored notifications, specifying whether you want the backtest or live data. 

When you're finished with the adapter, the `dispose` function clears the notification history, freeing up resources. It's designed to be reliable, even if you call `disable` or `dispose` more than once.

## Class MemoryLiveAdapter

This `MemoryLiveAdapter` acts as a central hub for managing trading memory, allowing you to easily switch between different storage methods. It’s designed to be flexible, letting you choose how your memory data is stored and accessed.

You can pick between several storage options: a default file-system based storage that saves data persistently, a temporary in-memory solution that disappears when the process ends, a dummy adapter which effectively ignores any writes, or even create your own custom memory adapter.

The adapter keeps track of memory instances, and offers convenient methods for searching, listing, reading, writing, and removing data. You can clear this tracking cache whenever your working directory changes to ensure fresh memory instances are created. When a signal is cancelled or closed, the `disposeSignal` method cleans up associated memoized memory instances, freeing up resources.

## Class MemoryBacktestAdapter

This component provides a flexible way to manage memory storage for backtesting, allowing you to choose different storage methods depending on your needs. It acts as a central point for accessing and manipulating memory data, offering various storage backends like in-memory, persistent file storage, or a dummy adapter for testing. 

You can easily switch between these storage options using methods like `useLocal`, `usePersist`, and `useDummy`, or even plug in your own custom memory adapter. The system intelligently caches memory instances to improve performance, and you can clear this cache when necessary, especially if your working directory changes.

The adapter includes functions to write, search, list, remove, and read data from memory, all while leveraging BM25 full-text scoring for efficient searching. When you're finished with a specific signal, you can dispose of its memoized instances using `disposeSignal`.

## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing how your backtesting and live trading environments store and retrieve data. It intelligently directs operations to either the backtest or live memory components depending on the context.

The `enable` property lets you kick off memory storage, which involves subscribing to signal events to automatically clean up old data when signals are finished.  Conversely, `disable` allows you to stop this memory storage and unsubscription.

The `writeMemory`, `searchMemory`, `listMemory`, `removeMemory`, and `readMemory` functions are your primary tools for interacting with the stored data. These functions handle the behind-the-scenes routing to the correct backtest or live memory system, allowing you to focus on the data itself. Searching utilizes powerful BM25 full-text scoring for efficient memory retrieval.

## Class MaxDrawdownUtils

This class helps you understand and analyze the maximum drawdowns experienced during trading. Think of it as a tool to view and export reports summarizing how much your strategies lost at their worst points. 

It gathers information about drawdowns recorded during backtesting or live trading.

You can use it to get detailed statistics on a specific symbol and strategy combination.  It also allows you to create and save markdown reports that clearly outline each drawdown event, which can be very helpful for review and optimization. The reports can be customized to include specific columns of data. The reports can be saved to a file path you specify.

## Class MaxDrawdownReportService

This service helps keep track of your maximum drawdown events, which are key for understanding risk in trading strategies. It actively monitors for new drawdown records and saves them to a database.

The service is designed to be started and stopped easily. Initially, you'll subscribe to receive drawdown data, and later you can unsubscribe to stop the data collection.

When a new drawdown is detected, the service records important details about it, including the time, symbol, strategy name, exchange, frame, signal ID, position, current price, and order levels. This detailed information is essential for analyzing what caused the drawdown and improving your trading system.

The `loggerService` and `tick` properties allow for integration with other components.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and store reports detailing the maximum drawdown experienced during trading. It keeps track of drawdown data for different symbols, strategies, exchanges, and timeframes.

You need to subscribe to start receiving drawdown events and unsubscribe when you're done.

The `tick` method internally handles processing the incoming drawdown data.

You can retrieve the accumulated drawdown statistics using `getData`.

The `getReport` method transforms that data into a nicely formatted markdown report.

`dump` writes that report to a file.

Finally, `clear` lets you wipe the accumulated data – either for a specific trading scenario or completely.

## Class MarkdownWriterAdapter

This component manages how your backtest results and related information are saved as Markdown files. It’s designed to be flexible, allowing you to easily change where and how the Markdown is stored without altering your core testing logic. 

You can choose different storage methods: one option creates a separate Markdown file for each report, another combines all reports into a single JSONL file, or a third completely disables Markdown output for testing purposes. The system remembers which storage method is active, ensuring consistent behavior throughout your backtesting process.

You can also customize the type of storage used by providing your own implementation. The system handles creating and managing these storage instances automatically, and it efficiently reuses them to avoid unnecessary overhead. If your working directory changes during a testing run, you can manually refresh the storage instances to ensure they use the correct path.

## Class MarkdownUtils

This class helps you control how different parts of the backtest-kit framework generate markdown reports. You can pick and choose which areas – like backtesting, risk analysis, or strategy performance – should create these reports.

The `enable` method lets you turn on markdown reporting for certain areas, and it's important to remember to "unsubscribe" afterward to avoid memory issues. It listens for events and starts collecting data.

`disable` allows you to stop markdown generation for specific sections without affecting others, immediately ceasing data collection and event listening.

Finally, `clear` lets you wipe out the data collected for reports without turning off the reporting itself, giving you a fresh start for a particular area.

## Class MarkdownFolderBase

This adapter helps you generate trading reports as individual markdown files, making it easy to browse and understand your backtest results. 

Each report gets its own `.md` file, organized within a directory structure you define. 

It's designed to be straightforward – it simply writes the markdown content directly to a file without needing any special setup or stream management.

You specify where these files should be saved using `options.path` and `options.file`, and it will automatically create the necessary directories.

This is a great choice if you prefer a clear, organized directory of reports for easy manual inspection. 

The `waitForInit` method does nothing, as it doesn't require any specific initialization.

The `dump` method handles writing the actual markdown content to the designated file, including creating any missing directories.

## Class MarkdownFileBase

The `MarkdownFileBase` class is designed to help you create and manage markdown reports in a standardized, append-only format using JSONL files. It simplifies the process of writing reports, particularly when you want to centralize logging and easily process them later with JSONL-compatible tools. 

Each report type gets its own JSONL file, ensuring organized storage. The class handles the creation of these files and directories automatically.

Writing to these files is done in a stream-based way, with built-in mechanisms to prevent issues like buffer overflows and potential timeouts (a maximum of 15 seconds per write operation). It's designed to be robust, including error handling that helps identify and address any problems during the writing process.

You can easily filter and search for specific reports based on criteria like symbol, strategy, exchange, frame, or signal ID, thanks to the metadata included with each entry in the JSONL file. The `dump` method is the core way to add new content, and it ensures each entry includes this crucial metadata. You only need to call `waitForInit` once to set up the file and stream.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility by letting you choose different storage methods. You can easily switch between storing your markdown as individual files (.md) or appending them to a single JSONL file. To make things even simpler, there are shortcuts like `useMd()` and `useJsonl()` that handle the adapter setup for you. 

If you need to test or temporarily avoid writing markdown data, the `useDummy()` method provides a way to discard all writes, making it ideal for development or debugging.  The adapter itself intelligently caches these storage instances to improve performance, ensuring you’re not creating unnecessary connections. You also have the option to define and use your own custom storage adapters.

## Class LookupUtils

The `LookupUtils` class acts as a central memory registry, tracking all ongoing backtests and live trading sessions. Think of it as a log of what's currently happening in your trading framework.

Whenever a backtest is started, a live session begins, or a strategy completes an iteration, an entry is recorded in this registry. Conversely, when these activities finish, their entries are removed.

This registry is accessed through the `Lookup` singleton, and it's designed to be straightforward to use—no complicated setup is needed.

The `addActivity` method adds new entries, and it handles duplicate entries gracefully, ensuring you don’t end up with multiple records for the same activity. `removeActivity` cleans up the records when an activity is complete, which is crucial to prevent errors and stale data. Finally, `listActivity` provides a snapshot of all active activities at a given moment.


## Class LoggerService

The LoggerService is designed to provide consistent logging throughout the backtest-kit framework, automatically adding helpful context to your messages. It works by delegating to a logger you provide, but it smartly adds details like the strategy name, exchange, and the specific part of the code where the log originated. 

If you don't configure a custom logger, it defaults to a "no operation" logger, meaning no logs are actually generated. 

You can customize the logging behavior by setting your own logger implementation. 

The service also handles adding details about the symbol being traded, the time the event occurred, and whether it’s a backtest or live execution. This context helps in debugging and understanding what’s happening during your trading simulations.

## Class LogAdapter

The `LogAdapter` provides a flexible way to handle logging within your backtesting framework. Think of it as a central point for managing where and how your log messages are stored. By default, it keeps logs in memory, but you can easily switch to storing them persistently on disk or even disable logging entirely with a dummy adapter.

The `LogAdapter` uses a pattern that allows you to plug in different logging methods, which can be very useful for different scenarios or debugging.  It caches the logging instance for performance, but provides a `clear` function to force it to rebuild the instance if something changes, such as the current working directory. You can customize the logging level (debug, info, warn, etc.) to suit your needs, and the framework handles the actual logging through the currently selected adapter.  The adapters available include options for in-memory storage, disk persistence, a no-op dummy adapter, and writing logs to JSONL files.

## Class LiveUtils

This class provides tools for running and managing live trading strategies. It simplifies interacting with the core trading engine and offers helpful functions for monitoring and control.

You can start live trading for a symbol using `run()` or `background()`. The `run()` method returns a stream of trading results, while `background()` executes trading in the background without reporting results directly, ideal for logging or persistence tasks.

Several functions allow you to query the status of a live strategy. For example, `getPendingSignal()`, `getTotalPercentClosed()`, and `getBreakeven()` provide insights into the current position and its characteristics.

Other methods let you manipulate ongoing trades: `commitCancelScheduled()` and `commitClosePending()` allow you to cancel or close a live signal respectively. You can also manually adjust stop-loss and take-profit levels with `commitTrailingStop()` and `commitTrailingTake()`. 

The class also has utilities for reporting and analysis, such as `getReport()` and `dump()`, which generate formatted reports for debugging and review. Finally, `stop()` allows you to pause live trading. This is intended for situations needing to halt trading without shutting down the entire system.

## Class LiveReportService

LiveReportService helps you keep a close eye on your trading strategy as it's running live. It diligently records every step of your trading signals – from when the strategy is waiting, to when a trade is opened, actively running, and finally closed. 

Think of it as a detailed logbook for your live trading activity.

It connects to your strategy's event stream and captures all the vital tick events, storing them in a database. This allows you to monitor performance in real-time and analyze how your strategy is behaving.

You can easily start and stop the service’s event monitoring; it prevents accidental duplicate subscriptions. To stop listening, just use the unsubscribe function that's provided when you subscribe. If you're not actively subscribed, unsubscribing won't do anything. 


## Class LiveMarkdownService

The LiveMarkdownService is designed to automatically generate and save reports about your live trading activity. It keeps track of everything that happens during your trades – from initial setup to closing positions – for each strategy you’re running. 

Think of it as a detailed logbook for your trading.

It listens for every trading event, organizes them by strategy, and then creates nicely formatted markdown tables summarizing the information. You’ll get key statistics like win rate and average profit/loss, making it easy to review performance.

The reports are saved to your computer in a structured way, making them easy to find and analyze. You can clear this data whenever needed, either for a specific strategy or completely. The service uses a storage system to keep data separate for different trading setups, ensuring everything is organized. You can subscribe to receive these events and unsubscribe when you no longer want to receive them.

## Class LiveLogicPublicService

LiveLogicPublicService manages the process of live trading, handling things like keeping track of the current state and making sure the right information is available when needed. It builds on top of another service, LiveLogicPrivateService, and automatically passes along key details like the strategy and exchange being used, so you don't have to specify them every time you call a function.

This service continuously runs, producing a stream of trading results, and it's designed to be resilient. If something goes wrong and the process crashes, it can recover its state from a saved file and pick up where it left off.

Here's a breakdown of key parts:

*   It uses a logger service to handle logging.
*   It relies on a `LiveLogicPrivateService` to do the core trading logic.
*   It interacts with an `ExchangeConnectionService` to connect to the exchange.
*   The `run` method is how you start the live trading process for a specific symbol, and it provides a continuous stream of results.


## Class LiveLogicPrivateService

This service manages live trading operations and provides a constant stream of updates. It continuously monitors the market, checking for new trading signals. 

Think of it as a never-ending loop that keeps track of what's happening in your live trading system. 

It delivers only the most important events – when positions are opened or closed – and not just general activity. 

The service is designed to be efficient and reliable, automatically recovering from crashes and keeping memory usage low. You get a steady, real-time flow of trading results through an asynchronous generator.


## Class LiveCommandService

The LiveCommandService acts as a central hub for managing live trading operations. It simplifies access to core functionality, making it easy to integrate into your applications through dependency injection. 

Internally, it relies on several services for validation and execution, including those for strategy, exchange, risk, and action management. The `validate` property provides a way to check the integrity of your trading strategy and risk settings, optimizing performance by remembering previous validation results.

The most important feature is the `run` method. This allows you to initiate live trading for a specific trading pair and propagate context information like the strategy and exchange names. It continuously generates results—either opening, closing, or canceling trades—and automatically handles unexpected crashes to keep the trading process running smoothly.


## Class IntervalUtils

IntervalUtils provides a way to control how often your functions execute, ensuring they run only once per specified time interval. There are two main ways to use this: in-memory, where the state is stored temporarily, or file-based, where the state is saved to disk so it survives restarts. It’s designed to be easy to use with a single, readily available instance called `Interval`.

The `fn` function lets you wrap regular functions for once-per-interval execution, useful for tasks that shouldn’t be repeated unnecessarily within a given time window. If a wrapped function returns `null`, it essentially pauses and will try again later.

The `file` function handles asynchronous functions and provides persistent interval management, making sure that the ‘fired’ state is saved to a file and remains consistent even if your application restarts.

You can release the memory used by wrapped functions using `dispose`, effectively creating fresh instances next time they're called. `clear` provides a way to completely wipe out all the stored interval state, which is helpful when your working directory changes between strategy runs. Finally, `resetCounter` resets the indexing system for file-based intervals, preventing conflicts when you switch directories.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profit-generating trades. It acts as a central place to gather data collected during backtesting or live trading.

You can use it to get detailed statistics about the best performing trades for a specific symbol and strategy.

It also allows you to easily create and save markdown reports that summarize these top-performing trades, making it simple to share and review your results.

The `getData` method gives you a structured data object, `getReport` produces a formatted markdown document, and `dump` writes that report directly to a file.

## Class HighestProfitReportService

This service is designed to keep track of the most profitable trades and record them for later analysis. It constantly monitors for new “highest profit” events happening within your trading system.

Whenever a new highest profit is detected, the service saves a detailed record of that trade – including when it happened, which asset was involved, the trading strategy used, and important pricing information like open price, take profit, and stop loss levels. This information is written to a special report database.

To start logging these records, you need to subscribe to the service. The service ensures that you only subscribe once to avoid unnecessary activity. To stop recording, you simply need to unsubscribe, which disconnects the service from the data stream.


## Class HighestProfitMarkdownService

This service is responsible for creating and storing reports detailing the highest profit achieved for a trading strategy. It listens for events related to these profits and organizes them based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these profit events, and the system ensures you don’t accidentally subscribe multiple times. Unsubscribing completely stops the data collection and clears any accumulated information.

The `tick` method handles individual profit events, routing them to their appropriate storage location.

You can retrieve accumulated profit statistics using `getData` for a specific combination of parameters, or generate a complete report with `getReport` to display this data in a user-friendly markdown format. The `dump` function creates the report and saves it as a file.

Finally, you have the option to clear the stored data, either for a specific set of parameters to reset a particular report's history or to clear all stored data entirely.

## Class HeatUtils

HeatUtils is a helper class designed to make it easier to generate and work with portfolio heatmaps, particularly for analyzing trading strategies. It gathers and organizes statistics from your trading results, like total profit, Sharpe ratio, and maximum drawdown, for each individual asset and for the portfolio as a whole. 

You can use it to retrieve the raw data behind a heatmap, create formatted markdown reports showing these key metrics, or even save those reports directly to files. 

It's built to be simple to use; you get a single, readily available instance for your projects, and it handles automatically collecting the necessary information across all your trades. The reports organize assets by total profit, making it easy to see top performers.

## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording closed trade signals. It focuses on capturing signals that have already resulted in a profit or loss, providing a portfolio-wide view of your trading activity.

The service listens for these closed signal events and neatly stores them in a database, ready for heatmap generation and performance analysis.

To get started, you'll subscribe to receive these events, and you can easily stop listening when it's no longer needed.  The service avoids duplicate subscriptions, ensuring efficient operation.




It uses a logger to help with debugging, and it’s designed to only process closed signal events, so other signal actions are ignored.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand the performance of your trading strategies. It collects data from closed trades and organizes it into useful statistics, offering both a high-level portfolio view and detailed breakdowns for each individual symbol. You can subscribe to receive these updates in real-time.

The service creates a dedicated storage area for each exchange, timeframe, and backtest mode, ensuring data isolation. It generates reports in Markdown format, making it easy to share and review your results.

You can request the current data, create detailed reports, or even save those reports directly to a file. To clean up accumulated data, the service provides a way to clear out the stored statistics, either for a specific setup or a complete reset. It safely handles mathematical calculations to avoid errors caused by unexpected values.

## Class FrameValidationService

This service helps you keep track of your trading timeframes and make sure they're set up correctly. Think of it as a central place to manage and verify that your timeframes (like 1-minute, 5-minute, daily) are properly defined.

It lets you register new timeframes with a name and a description of its structure.  Before you try to use a timeframe in your trading strategy, you can use the validation function to confirm that it exists, preventing errors.

The service also remembers previous validation results, so it doesn't have to check the same things repeatedly, making it faster.  You can get a complete list of all the timeframes you've registered to see what's available.


## Class FrameSchemaService

This service acts as a central place to store and manage the blueprints, or schemas, that define the structure of your trading frames. It uses a special system to ensure that these schemas are typed correctly, reducing errors.

You can add new schemas using the `register` method, and update existing ones with the `override` method.  

If you need to use a schema in your backtest, simply use the `get` method to retrieve it by name.

Before adding a new schema, the system will perform a quick check using `validateShallow` to make sure it has the necessary components in place. The service also includes logging capabilities for tracking its activities and potential issues.

## Class FrameCoreService

This service manages the core functionality for handling timeframes within the backtesting environment. It essentially acts as a central point for retrieving and validating timeframe data.

It relies on a connection service to fetch the timeframe information and a validation service to ensure its accuracy.

The `getTimeframe` function is the primary tool, allowing you to request an array of dates representing a specific timeframe for a given trading symbol. This array is vital for driving the backtesting process, as it defines the sequence of data points being analyzed.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It automatically directs requests to the correct frame implementation based on the active context, making it easier to work with various timeframes.

To improve efficiency, it remembers previously created frame instances, so you don't have to recreate them every time. This is especially helpful when running multiple backtests.

The service provides a way to clear the cached frames, which is vital for ensuring that your backtests are always using the most up-to-date data. Without clearing the cache, the backtest could get stuck using outdated information.

You can use the service to define the start and end dates for your backtest, enabling you to focus on specific periods.  Essentially, it simplifies the handling of timeframes in your backtesting process.

## Class ExchangeValidationService

This service helps you keep track of your trading exchanges and make sure they're set up correctly. It acts as a central place to register your exchanges and quickly check if they’re available before your trading strategies run. 

Think of it as a manager for your exchanges – you can add new ones, verify their existence, and get a complete list of all the exchanges you're using. 

The service remembers previous validation results to speed things up, avoiding redundant checks.

Here’s what you can do:

*   Add a new exchange to the system using `addExchange()`.
*   Check if an exchange exists and is ready to be used with `validate()`.
*   Get a full list of all configured exchanges using `list()`.

## Class ExchangeUtils

This class provides convenient tools for interacting with different cryptocurrency exchanges. It acts as a central hub for common exchange-related tasks, ensuring consistency and validation in your trading logic.

Think of it as a helper for retrieving data like historical price information (candles), calculating average prices, or formatting trade quantities and prices to match the specific rules of each exchange.

Here's a breakdown of what it can do:

*   **Fetching Data:** It simplifies getting candles (price data over time), order books (buy/sell orders), and aggregated trades for a particular trading pair.
*   **Price Calculations:** You can use it to easily calculate VWAP (a volume-weighted average price).
*   **Formatting:** It handles the often-tricky task of formatting trade quantities and prices to ensure they are compliant with the exchange's precision requirements.
*   **Time Management:** When performing backtests, it intelligently calculates the appropriate date range for retrieving historical data. The method for calculating the start date of historical data will be the same that ClientExchange uses so any previous backtests using ClientExchange won't be broken.
*   **Isolated Instances:** It makes sure that each exchange has its own dedicated processing area, preventing conflicts.

## Class ExchangeSchemaService

The ExchangeSchemaService helps manage and store information about different cryptocurrency exchanges in a reliable and type-safe way. It uses a registry to keep track of these exchange details.

You can add new exchange schemas using the `addExchange()` function, or retrieve existing ones by their name using `get()`.

Before an exchange schema is added, it's checked (`validateShallow`) to make sure it has all the necessary information and that the data types are correct.

If an exchange schema already exists, you can update parts of it using `override()`. 

This service leverages a tool registry for consistent and safe storage, making sure everything is handled correctly behind the scenes.


## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that all operations are aware of the current trading context like the symbol, the specific time, and whether it's a backtest or live environment. It combines the functionality of connecting to an exchange and managing the execution context.

Internally, it handles validations of exchange configurations to prevent errors and improve efficiency by remembering previously validated configurations.

The service provides methods to retrieve various data points from the exchange, including historical candles, future candles (for backtesting), average prices, and order books. It also has tools to format prices and quantities, tailoring them to the specific exchange and trading situation. When requesting data, it's designed to be flexible allowing for various levels of data retrieval like the number of candles or depth of the order book.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange implementation based on the currently active exchange specified in the system’s context.

Think of it as a smart router; it figures out *which* exchange to use for a given operation without you needing to explicitly tell it.  It also keeps a record of previously used exchanges to avoid unnecessary setup and speed things up.

Here's what you can do with it:

*   **Fetch historical candle data:** Retrieve past price movements for a specific trading pair and time interval.
*   **Get the next batch of candles:**  Get the next set of price data, taking into account the current point in time, which is particularly useful during backtesting or live trading updates.
*   **Calculate the average price:** Determine the current average price, either pulling it directly from the exchange (live) or calculating it from historical data (backtest).
*   **Get the closing price:** Find the closing price of the most recent completed trading period.
*   **Format prices and quantities:**  Prepare prices and order sizes to match the specific rules of the exchange you're using – ensuring correct precision and lot sizes.
*   **Retrieve order book data:** Access the current order book for a trading pair.
*   **Fetch aggregated trades:** Obtain a summary of recent trading activity.
*   **Retrieve raw candle data:** Get raw candle data with flexible date and limit parameters.

The service relies on other components like the method context service and exchange schema service to manage the exchange connections and ensure proper data handling.

## Class DumpAdapter

The `DumpAdapter` helps you save data related to your trading tests, giving you flexibility in how that data is stored. It acts as a central point for dumping information like messages, records, tables, text, errors, and JSON objects.

By default, it saves data as Markdown files, organized by signal ID, bucket name, and dump ID.  However, you can easily change where the data goes, choosing to store it in memory, discard it entirely (for testing purposes), or even use a custom storage solution.

Before you start dumping data, you need to activate the adapter using `enable`, and when you're finished, deactivate it with `disable`.  The adapter manages its internal state to prevent memory leaks, automatically cleaning up old data when signals are canceled.

To refresh the adapter's state when the base path changes, you can use `clear`. This is particularly useful when running multiple iterations of your tests. The `useMarkdown`, `useMemory`, `useDummy`, and `useDumpAdapter` methods allow you to control the backend used for data persistence.

## Class CronUtils

This utility class, `CronUtils`, helps schedule tasks that run at specific times related to your backtesting environment. It’s like a built-in scheduler for your trading strategies.

Think of it as a way to coordinate tasks across multiple, simultaneous backtest runs – ensuring that even when tests are running in parallel, they handle things at the same time correctly.  It makes sure each boundary is only handled once, avoiding conflicts.

**Here’s a breakdown of what it does:**

*   **Registration:** You register tasks (called “entries”) to run at certain intervals, specifying what should happen at those times.
*   **Coordination:**  It manages when these tasks actually run, especially in environments where backtests are happening simultaneously.
*   **Memory Management:** It helps clean up old data to keep things running smoothly.

**Important Internal Details:**

*   **Generations:**  Each registered task is assigned a generation number. This is like a version number that ensures older, incomplete tasks don't interfere with new ones.
*   **Watermarks:**  The system tracks when a certain time boundary has already been processed to prevent duplicate executions.
*   **In-flight Promises:** These promises ensure only one task runs at a given time and manages tasks running in parallel.
*   **Clear Functions:** There are special functions to wipe out old tasks or marks, so your system can start fresh if needed.

Essentially, `CronUtils` provides a way to reliably schedule and execute tasks within a complex backtesting setup, ensuring they fire precisely when intended and coordinating multiple parallel tests.

## Class ConstantUtils

This class provides a set of pre-defined percentages used to determine take-profit and stop-loss levels based on a Kelly Criterion approach with risk decay. Think of it as a system for incrementally locking in profits and minimizing potential losses. 

The constants represent how far along the price needs to travel towards the final target profit or loss before a partial exit is triggered. For example, `TP_LEVEL1` signifies that the price needs to reach 30% of the distance to the ultimate profit target before a portion of the trade is closed.

Here’s a breakdown:

*   **TP_LEVEL1 (30):**  An early partial take-profit, securing a small portion of the potential gain.
*   **TP_LEVEL2 (60):**  A mid-point take-profit, capturing a larger chunk of the profit while the trend hopefully continues.
*   **TP_LEVEL3 (90):**  A final take-profit, exiting nearly the entire position.

Similarly, the stop-loss levels are designed to protect against significant losses:

*   **SL_LEVEL1 (40):** An early warning stop-loss to reduce exposure if the trade starts to go against you.
*   **SL_LEVEL2 (80):**  A final exit stop-loss to quickly eliminate the remaining position to prevent substantial losses.

## Class ConfigValidationService

The ConfigValidationService helps ensure your trading configurations are mathematically sound and capable of generating profit. It's like a safety net, checking that your settings won't lead to losses due to incorrect parameters.

It verifies several aspects of your global configuration, including percentages like slippage and fees, ensuring they're all non-negative.

Critically, it makes sure your minimum take profit distance accounts for costs like slippage and fees, so any successful trade actually results in a profit. It also checks that relationships between values, like minimum and maximum distances, are correct, and that time-related parameters and candle settings are reasonable.

Think of it as a meticulous checker, making sure all the numbers align to create a viable trading setup. The `validate` method is the core of this service, performing all these checks.

## Class ColumnValidationService

This service helps make sure your column configurations are set up correctly. It's designed to check your column definitions against a set of rules, preventing errors and ensuring everything works together smoothly.

The service checks for several things: that each column has the essential properties (key, label, format, and visibility), that those keys are all unique, and that the format and visibility settings are indeed functions. It also verifies that the key and label fields contain actual text.

Essentially, it's a safety net to catch configuration mistakes before they cause problems in your application. You can use the `validate` method to run these checks on your column configurations.

## Class ClientSizing

This ClientSizing class helps determine how much of an asset to trade based on various factors. Think of it as the engine that figures out your position size.

It offers several different sizing methods, like fixed percentages, the Kelly Criterion, or using Average True Range (ATR) for volatility. 

You can also set limits on how much you can trade, like minimum and maximum position sizes, or a maximum percentage of your capital to risk. 

ClientSizing allows you to hook in your own custom logic for things like validating the sizing results or recording the sizing decisions, making it adaptable to different strategies. Essentially, it takes input data and produces a trade size recommendation.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring no single signal breaks predefined limits. Think of it as a safety net for your portfolio. It keeps track of open positions across all strategies to prevent overexposure and allows for custom risk checks based on real-time data.

The ClientRisk object is shared among multiple strategies, enabling a holistic view of your portfolio's risk profile. It's a key component that validates signals *before* positions are opened.

Here's a breakdown of how it works:

**How it’s Built:**

*   It's configured with a set of rules (IRiskParams) that define your risk tolerance.
*   It maintains a record of all currently active positions.
*   It uses a special system to avoid race conditions when multiple strategies try to open positions at the same time (checkSignalAndReserve).

**Key Actions:**

*   **checkSignal:** Evaluates a potential trade against your risk rules. It returns `true` if the trade is allowed, `false` if it's blocked.
*   **checkSignalAndReserve:** Does the same as `checkSignal` but also temporarily "reserves" a spot in the active positions list to prevent other strategies from exceeding the limit. You *must* follow up this call with either `addSignal` (to finalize the position) or `removeSignal` (to cancel it).
*   **addSignal:** Officially registers a new, open position.
*   **removeSignal:** Removes a closed position from the active positions list.

**Persistence:**

*   It can optionally save the list of active positions to disk and reload them when it starts, ensuring consistency across sessions. This is skipped during backtesting.



In short, ClientRisk acts as a gatekeeper, making sure your trading strategies operate within safe boundaries.

## Class ClientFrame

The ClientFrame is a core component responsible for creating the timeline of data used in backtesting. Think of it as the engine that produces the sequence of timestamps your trading strategy will analyze.

It avoids repetitive work by caching generated timeframes, ensuring that the same timeframe isn't recalculated unnecessarily. You can control how far apart those timestamps are, ranging from very frequent (one minute) to quite sparse (one day).

It also provides hooks to check the validity of the timeframe and log important events during its generation. It works closely with the backtest logic to manage the historical data flow.

The `getTimeframe` property is the primary way you interact with it; it's used to get the actual array of timestamps for a specific trading symbol, always retrieved from the cache.

## Class ClientExchange

The `ClientExchange` class is designed to provide a consistent way to access exchange data, acting as a bridge between your backtesting system and the actual exchange APIs. It handles things like fetching historical and future candle data, calculating the volume-weighted average price (VWAP), and formatting prices and quantities according to the exchange's specific rules.

To get historical candle data, you can use `getCandles`, which retrieves data backward from a specific point in time. `getNextCandles` is used when backtesting to get data needed for signal duration, moving forward in time. For VWAP calculation, `getAveragePrice` analyzes recent 1-minute candles, and `getClosePrice` retrieves the last completed candle's closing price for a given interval.

The class also handles formatting prices and quantities using `formatPrice` and `formatQuantity`, ensuring they adhere to exchange standards. `getRawCandles` provides a flexible way to get historical candles with custom date and limit parameters.  Finally, `getAggregatedTrades` fetches aggregated trade data, making sure it avoids look-ahead bias. The `getOrderBook` function retrieves order book data for a specific trading pair.

This implementation is optimized for memory efficiency by utilizing prototype functions, and it's built to prevent look-ahead bias during backtesting.

## Class ClientAction

The `ClientAction` component acts as a central hub for managing and executing your custom action handlers within the backtest-kit framework. Think of it as a conductor that brings together your strategy's specific logic – whether that's handling real-time notifications, managing your state, or collecting analytics – and delivers the relevant events to the appropriate parts of your system.

It’s designed to initialize your handler only once and ensures cleanup happens reliably when it's no longer needed. This component routes different types of events – like signals from live trading, backtesting, or scheduled events – to the appropriate methods in your custom handler.  

Several of these methods (`orderSync`, `orderCheck`) are critical for order processing and intentionally pass any errors directly to the creation functions for immediate attention.  You can use it to manually control signal lifecycle events, setting up callbacks to drive exchange interactions. Essentially, it provides a structured way to integrate your unique strategies and respond to events within the backtest environment.

## Class CacheUtils

CacheUtils offers a simple way to automatically cache the results of your functions, which is helpful for optimizing backtesting performance. It’s like giving your functions a memory so they don't have to recompute things they've already done.

The `fn` method lets you wrap regular functions to cache their results based on timeframe intervals – think of it as caching data for specific periods. The `file` method does something similar, but it stores the cached results in files, making the caching persistent even across backtest runs. This is especially useful for data that takes a long time to compute.

If you need to manually remove a function’s cache, `dispose` is the tool to use.  You can also completely wipe all caches with `clear` or `resetCounter` when things like your working directory change, ensuring you’re always starting fresh.  Essentially, it's a toolbox for managing how your functions remember and reuse calculations.

## Class BrokerBase

This framework provides a base class, `BrokerBase`, for building custom integrations with exchanges. It handles the complexities of interacting with different brokers, logging events, and managing the lifecycle of trades.

Think of it as a template for connecting your trading strategy to a real exchange. You inherit from this class and override specific methods to implement the actual exchange-specific logic.

The framework provides sensible defaults for many actions like placing orders and updating stops, so you only need to override what's unique to the exchange you're using.

Here's how it works:

1.  **Initialization:** When you start, the `waitForInit()` method is called. This is where you'd log in to the exchange, establish connections, and load any required configurations.

2.  **Events:** As your strategy runs, the framework triggers various event methods. These include things like when an order is placed (`onOrderOpenCommit`), when a position is closed (`onOrderCloseCommit`), or when a partial profit or loss is taken.

3.  **Flexibility:** You can hook into the process at different points. For example, you can use `onSignalActivePing` for continuous monitoring of open positions or `onSignalScheduleOpen` to place initial resting orders.

4.  **Error Handling:** Certain event methods like `onOrderOpenCommit` and `onOrderCloseCommit` allow you to throw errors which gracefully halt a process and retry the operation.  Other methods, like `onOrderActiveCheck`, need to handle network errors without throwing exceptions.

5.  **Logging:**  All relevant actions are logged automatically.

The framework simplifies the process of connecting your trading strategy to various exchanges. It provides a structure for managing different aspects of trading, from order placement to position monitoring, while allowing for custom implementations.

## Class BrokerAdapter

The `BrokerAdapter` acts as a central point for interacting with your brokerage, sitting between your trading logic and the actual broker connection. It's designed to provide a safety net, ensuring trades are handled correctly and consistently, whether you're backtesting or live trading.

During backtesting, the adapter's actions are effectively skipped, allowing for simulated trading without real-world execution. When live trading, it forwards your orders to the connected broker.

Think of it as a transaction controller: if anything goes wrong while sending instructions to the broker, the changes to your trading state are rolled back.

Here's a breakdown of its key functions:

*   **Commit Methods:** It has several "commit" methods (`commitOrderOpen`, `commitOrderClose`, etc.) that handle different trading actions, like opening, closing, and pinging orders. These are called automatically during live trading or explicitly in your code.
*   **Signal Routing:** It automatically manages the sending of "signal" events (open, close, cancellations) to your broker.
*   **Ping Signals:** It sends periodic pings (`activePing`, `schedulePing`, `idlePing`) to the broker to keep the connection alive.
*   **Intercepts:** Some functions, like `commitPartialProfit`, `commitPartialLoss`, `commitTrailingStop`, etc., are intercepted before the core trading logic runs, providing a final check and allowing for rollback.
*   **Registration and Activation:** You register a broker adapter using `useBrokerAdapter()` and activate it with `enable()`.  `enable()` subscribes to internal events to handle signal routing. `disable()` and `clear()` control these subscriptions and reset the adapter's state.

Essentially, the `BrokerAdapter` handles the communication with your broker, providing a safe and consistent way to execute trades and manage your positions.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events, providing insights into your trading strategies. It acts as a central point to access data collected about breakeven occurrences, giving you a view of how your strategies are performing.

You can pull aggregated statistics like the total number of breakeven events.

It also allows you to generate detailed markdown reports that present your breakeven events in a clear, tabular format, including information like entry price, position, and timestamps.

Finally, you can easily save these reports to files, automatically creating the necessary directory structure if it doesn't already exist. The reports are named consistently using the symbol and strategy name.


## Class BreakevenReportService

The BreakevenReportService helps you track when your trading signals reach a breakeven point, which is a key milestone. It essentially listens for these "breakeven" moments and records them.

It stores all the details of each breakeven event – things like the signal itself – in a database. This allows you to later analyze and understand how your strategies are performing.

To get it working, you need to subscribe to its signal; it prevents you from accidentally subscribing multiple times.  When you're finished, you can unsubscribe to stop the service from receiving further updates. It uses a logger service to provide helpful debugging information.

## Class BreakevenMarkdownService

The BreakevenMarkdownService is designed to automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them by symbol and strategy, then transforms this information into easy-to-read markdown tables.

You can subscribe to receive these breakeven events, and the service will safely handle multiple subscriptions. It then accumulates the data and allows you to retrieve statistics like the total number of breakeven events.

The service also provides functions to generate full reports and save them directly to disk, neatly organized into folders based on symbol, strategy, exchange, frame, and whether it's a backtest. 

Finally, it offers a way to clear out the accumulated data when needed, either for a specific strategy or globally.

## Class BreakevenGlobalService

This service acts as a central point for managing and tracking breakeven calculations within the trading system. It sits between the main trading strategy and the underlying connection layer, ensuring everything related to breakeven is handled consistently. Think of it as a gatekeeper – it receives requests, logs them for monitoring purposes, and then passes them on to be processed.

It relies on other services like validation and schema services to confirm the integrity of the trading strategy and related configurations. 

The service delegates the actual breakeven calculations to a separate connection service, but importantly, it maintains a record of all activities through logging, allowing you to monitor how breakeven is being managed.  The `check` function decides if a breakeven event should occur, while `clear` handles cleanup when a trading signal is closed. You'll find this service injected into the trading strategy's setup to streamline dependencies.

## Class BreakevenConnectionService

The BreakevenConnectionService is designed to manage and track breakeven points for trading signals. It ensures that for each signal, there's only one instance actively tracking its breakeven, preventing unnecessary overhead and keeping things organized. 

Think of it as a central hub that creates and manages these "ClientBreakeven" objects, giving them the tools they need like logging and event notifications. 

It's designed to work closely with the broader trading strategy, making sure that when a signal needs a breakeven check or needs to be cleared, the right actions are taken efficiently. The service automatically handles creating, maintaining, and cleaning up these breakeven trackers, making the process seamless for the rest of the system. It's clever system for preventing memory leaks and keeping things performant.

## Class BacktestUtils

This class provides helpful tools for running backtests within the trading framework. It simplifies the process of executing backtests and retrieving related information.

The `run` method is your main entry point for launching a backtest, passing in the symbol and context (strategy, exchange, and frame names).  There's also a `background` method for running tests without receiving immediate results—great for tasks like logging.

You can get details about pending signals using `getPendingSignal`, total position percentage (`getTotalPercentClosed`) or cost (`getTotalCostClosed`), and check if a signal exists with `hasNoPendingSignal` or `hasNoScheduledSignal`.

Several methods allow you to peek into the current state of a position, such as `getBreakeven` to see if a profit target has been reached, and `getPositionEffectivePrice` for the average entry price. You can also find things like number of units (`getPositionInvestedCount`), total cost invested (`getPositionInvestedCost`), and unrealized profit/loss (`getPositionPnlPercent`, `getPositionPnlCost`).  There are also methods to get the entry levels (`getPositionLevels`), partial close events (`getPositionPartials`), and a summary of entries (`getPositionEntries`).

Beyond simple status checks, you can retrieve estimates like time to expiration (`getPositionEstimateMinutes`), remaining time (`getPositionCountdownMinutes`), or the maximum drawdown details (e.g., `getPositionMaxDrawdownPnlPercentage`).

Finally, there are methods for managing the backtest itself:  `stop` allows you to halt a test, and `commit...` methods let you simulate actions like closing positions, adjusting stop-loss levels, and activating scheduled signals. The `getData` and `getReport` methods facilitate performance analysis.

## Class BacktestReportService

This service helps you keep a detailed record of what's happening during your backtests. It listens for events related to your trading signals – when they're inactive, being opened, actively trading, or being closed – and saves all this information. 

Essentially, it acts as a diligent observer, capturing every significant event with complete details.  The recorded data is then written to a database for later review and troubleshooting.

To make sure you’re not accidentally logging the same events multiple times, it prevents multiple subscriptions. You can easily start and stop this logging process using the `subscribe` and `unsubscribe` methods.  The `subscribe` method returns a function you can use to stop the logging.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your trading strategies during backtesting. It listens for incoming market data (ticks) and keeps track of the trading signals generated by your strategies.

It organizes this information, using a clever storage system that separates data for each symbol, strategy, exchange, timeframe, and backtest run. This ensures that each backtest has its own isolated data.

You can then ask the service to create reports in a readable markdown format, showing you important details about the signals that occurred. These reports can be saved directly to disk, making it easy to review and analyze your strategy’s performance.

The service also provides functions to clear out this accumulated data, either for a specific backtest or for all backtests. To get started, you subscribe to the backtest signal emitter to receive the tick events. Remember to unsubscribe when you’re finished!


## Class BacktestLogicPublicService

This service manages and runs backtests, taking care of a lot of the setup behind the scenes. It simplifies the process by automatically handling important details like which strategy, exchange, and frame of data you’re working with.

You don't need to manually pass these details to every function you use during the backtest – the service figures it out for you.

It relies on other services for logging, managing time, defining data structures, and connecting to exchanges.

The `run` method is the primary way to execute a backtest, providing a stream of results representing what happened at each point in time – signals to buy or sell, orders opened, orders closed, or cancellations.  You tell it which symbol to backtest and the context related to the strategy, exchange and frame; the rest is handled automatically.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process, handling data flow and execution in a memory-friendly way. It works by first retrieving the timeframes needed for the backtest. Then, it processes these timeframes one by one, triggering actions and fetching data when a trading signal appears.

The service skips ahead in time when a signal is open, only processing results when the signal closes. Importantly, the results are streamed as an asynchronous generator, meaning they’re delivered as they become available – without storing everything in memory at once. This makes it efficient for backtesting even very long periods.

You can also stop the backtest early if needed by simply interrupting the generator.

Here's a breakdown of the key components it utilizes:

*   **loggerService:** Provides logging capabilities and context information.
*   **strategyCoreService:** Handles the core logic of the trading strategy.
*   **exchangeCoreService:** Interacts with the exchange data.
*   **frameCoreService:** Manages the timeframes used in the backtest.
*   **methodContextService:** Provides context information for the method.
*   **actionCoreService:** Handles the actions taken during the backtest.
*   **timeMetaService:** Deals with time-related metadata.
*   **priceMetaService:** Handles price-related metadata.

The `run` method is the main entry point; it takes a symbol as input and returns an asynchronous generator that yields the backtest results.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the system. It's designed to be easily integrated into other parts of the application using dependency injection.

Essentially, it simplifies interacting with the core backtesting logic.

Here’s a breakdown of what it offers:

*   It handles validation of strategies, risk configurations, exchanges, and frames, avoiding unnecessary repeated checks by remembering previous validations.
*   It provides a method to actually execute a backtest for a specific symbol.  When running a backtest, it needs to know the strategy name, exchange name, and frame name to use.
*   It internally uses several other services to handle logging, schema management, and validation tasks, offering a structured approach to backtesting.

## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your action handlers – those pieces of code that respond to specific events in your trading system. Think of it as a central manager for your actions.

It allows you to register new action handlers, ensuring they’re properly set up before they're used. 

The service also checks if a particular action handler exists before you try to use it, preventing errors and ensuring your system runs smoothly. To improve speed, it remembers the results of previous validation checks.

Finally, it can provide a full list of all the action handlers you've registered, giving you a clear overview of what's available.


## Class ActionSchemaService

This service helps you keep track of and manage the blueprints for your actions, making sure they're consistent and work correctly. It uses a special system to store these blueprints in a way that prevents errors due to incorrect types.

It makes sure that the functions used in your actions only use the methods that are specifically allowed.

You can add new blueprints, check if they’re set up properly before saving them, and even update existing ones without having to create them from scratch again.

Here's a bit more detail about how it works:

*   **Registration:** You can register new action blueprints, and the service will verify their structure and that the functions they use are allowed. It won't let you register the same blueprint twice.
*   **Validation:** Before registration, it quickly checks if the blueprints have all the necessary parts and the right types.
*   **Overrides:** You can modify existing blueprints – like changing a function or callback – by providing only the parts you want to change.
*   **Retrieval:**  When you need a specific blueprint, this service lets you quickly fetch it.



The `loggerService` property is used for internal logging. The `_registry` property is used for storing action schema.

## Class ActionProxy

The `ActionProxy` acts as a safety net for your custom trading logic, ensuring that errors in your code don't crash the entire backtesting or live trading process. Think of it as a wrapper around your actions, catching any errors that might pop up and preventing them from bringing everything down.

It provides a way to implement the `IPublicAction` interface, offering functions like `init`, `signal`, `signalLive`, `signalBacktest`, and several others related to events like breakeven availability, partial profits, scheduled pings, and position lifecycle events. Each of these functions is wrapped in a `try...catch` block, so if an error occurs within your custom code, it’s logged and handled gracefully, allowing the system to continue running.

This design utilizes a factory pattern, meaning you create instances of `ActionProxy` using the `fromInstance` method, which takes your custom action handler and makes sure it's protected from unexpected errors. The system also allows for graceful handling of partial implementations by checking if your class has implemented methods before calling them.  Importantly, some methods like `orderSync` and `orderCheck` are *not* wrapped in error handling to pass errors directly for specific order synchronization functions.  Ultimately, `ActionProxy` helps ensure robust and stable trading operations by isolating and managing errors within custom actions.

## Class ActionCoreService

The ActionCoreService is a central hub for managing actions within a trading strategy. It's responsible for coordinating how actions are executed, ensuring they're valid, and making sure they happen in the correct order.

Think of it as a traffic controller for actions. It gets instructions from the strategy's plan, verifies everything is set up correctly, and then makes sure each action gets triggered at the appropriate time.

Here's a breakdown of what it does:

*   **Action Orchestration:** It takes the list of actions defined in a strategy’s schema and makes sure each one runs in the right sequence.
*   **Validation:** It checks that everything is valid - the strategy itself, the exchanges being used, and the actions themselves. It does this once to avoid repeated checks.
*   **Lifecycle Events:** It handles various lifecycle events related to strategies, such as initialization, signal processing (for backtesting, live trading, and specific scenarios), breakeven calculations, partial profit/loss management, scheduling, and more.  Each of these events triggers the relevant action handlers.
*   **Cleanup:**  The `dispose` function ensures that when a strategy finishes, all related actions are cleaned up properly.
*   **Data Clearing:** The `clear` function provides a way to erase action-related data, either selectively or across the entire system.

Essentially, the ActionCoreService provides a robust framework for safely and reliably executing actions within a trading strategy.

## Class ActionConnectionService

The ActionConnectionService acts like a central dispatcher, directing different actions within your trading strategies to the correct implementation. It ensures that the right "action handler" gets the job done based on its name and the specific strategy and frame it's associated with. 

To boost efficiency, it remembers recently used action handlers (memoization), so it doesn't have to recreate them unnecessarily. This service is responsible for handling a variety of events – signals, profit targets, scheduled tasks, order updates, and more – routing them to the appropriate action for processing. Each routing method—like `signalLive`, `breakevenAvailable`, or `orderSync`—deals with a specific type of event.

You can manually clear these cached action handlers if needed, and the system also includes a way to initialize and dispose of them when they're no longer required. This central routing service helps keep your trading logic organized and performant.

## Class ActionBase

This class, `ActionBase`, is designed to help you extend the backtest-kit framework with custom logic, like sending notifications or managing data. It acts as a foundation for creating "action handlers" – pieces of code that react to events during strategy execution.

Think of it as a starting point for building custom features without having to write a lot of boilerplate code. You don't need to implement every possible event; the base class handles the basic logging for you.

When you extend `ActionBase`, you're essentially defining how your strategy interacts with the outside world—whether that’s sending messages via Telegram, tracking analytics, or performing complex business tasks.

Here’s how it works:

1.  You create a new class that inherits from `ActionBase`, providing information about the strategy name, frame (time window), action name, and whether the process is a backtest.
2.  You can then override specific methods (like `signalLive` for live trading notifications or `signalBacktest` for backtest metrics) to tailor their behavior.
3.  The framework calls these methods automatically as the strategy runs, based on events like signal generation, profit/loss milestones, and risk management decisions.
4.  Finally, the `dispose` method allows you to clean up any resources you used during the execution.



The different `signal` methods (`signal`, `signalLive`, `signalBacktest`) are called at different times based on whether the strategy is running live or in backtest mode.  `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `pingIdle` and `riskRejection` all have specific meanings relating to what is happening in a trading strategy.
