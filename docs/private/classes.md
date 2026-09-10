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

The WalkerValidationService helps you keep track of and verify your parameter sweep configurations, which are crucial for optimizing trading strategies and hyperparameters. It acts as a central place to register your walker setups, making sure they exist before you try to use them.

This service ensures that the walkers, along with the strategies they use, are all correctly set up and functional.

Here’s a quick rundown of what it does:

*   It lets you register new walkers using `addWalker`.
*   It verifies that walkers exist using `validate` – and also checks that the strategies they depend on are valid too.
*   It provides a way to see a list of all registered walkers with `list`.
*   It's designed for speed, using caching to avoid repetitive checks. 

Essentially, it's a safety net and organization tool for your parameter sweeps.

## Class WalkerUtils

WalkerUtils provides a convenient way to manage and run your trading walkers, simplifying the process of comparing different strategies. It acts as a central hub for interacting with your walkers, automatically handling details like pulling the correct settings and logging progress.

You can easily start a walker comparison using the `run` method, which will generate a stream of results.  Alternatively, if you only need the walker to perform actions like logging or triggering callbacks, you can run it in the background with `background`.

If you need to pause a walker's signal generation, use `stop` – this will interrupt the current strategy and prevent further signals, although existing signals will finish normally.  Retrieving the full results of a walker’s analysis is done with `getData`, and generating a comprehensive report is handled by `getReport`, which can be saved to a file using `dump`.  Finally, `list` allows you to see the status of all currently active walkers. The class is designed to be easily accessible, functioning as a single, readily available instance for your application.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of and manage different "walker" schemas, which are essentially blueprints for how your system works. It's designed to be type-safe, meaning it prevents errors related to incorrect data types.

You can add new walker schemas using the `addWalker` function, and then retrieve them later by their assigned name. The service uses a registry to store these schemas, ensuring consistency and organization.

Before a new schema is added, it’s checked to make sure it has all the necessary pieces and that they are the right type, ensuring everything is set up correctly.

If you need to update an existing schema, you can use the `override` function to make changes without replacing the entire schema. 

Finally, you can easily retrieve a specific schema using the `get` function, giving you quick access to the configuration details you need.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies perform during optimization runs. It acts like a dedicated recorder, listening for updates as your strategies are tested and storing the results in a database. 

This service is designed to monitor the progress of your optimization process. It records the performance of each strategy test, along with important metrics and statistics.

You can think of it as a tool for comparing different strategy configurations and identifying which ones are working best. It handles the subscription process safely, preventing you from accidentally subscribing multiple times.

To stop the recording, you use the unsubscribe function. If you haven't subscribed initially, unsubscribing does nothing.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports about your trading strategies. It listens for updates from your trading simulations (walkers) and keeps track of how each strategy is performing. 

It generates easy-to-read markdown tables comparing your strategies, allowing for clear analysis. These reports are then saved as files in a designated directory, making them readily accessible.

You can subscribe to walker events to begin collecting data and unsubscribe when you no longer need the reports. The service accumulates data for each walker individually. 

You can also request specific data or generate reports for particular metrics or strategies. Furthermore, you have the option to clear out all accumulated data or only data for a specific walker.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of "walkers," which are essentially automated trading strategies or analyses. It builds upon a private service to handle the core walker logic. 

A key feature is that it automatically passes along important information like the strategy name, exchange being used, and the name of the analysis frame to the walkers themselves, making it easier to keep track of what's happening.

The `run` method is your main way to interact with this service. You give it a symbol (like a stock ticker) and some contextual information, and it returns a sequence of results from running the walkers. This is how you'd kick off a backtest or analysis.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps manage and track comparisons between different trading strategies. It’s designed to orchestrate the testing process, providing updates as each strategy finishes. 

The service monitors the performance of each strategy in real-time, keeping track of the best-performing metric encountered so far. Once all strategies have been tested, it delivers a comprehensive report, ranking them based on their results. 

Internally, it relies on BacktestLogicPublicService to handle the individual backtests.

The `run` method is your main entry point, allowing you to specify the trading symbol, a list of strategies to compare, the performance metric to optimize for, and relevant context information like exchange and frame details. It then runs these strategies one by one and gives you a stream of results along the way.

## Class WalkerCommandService

WalkerCommandService acts as a central point for accessing and managing walker functionality within the backtest-kit framework. It simplifies how you interact with the core walker logic by providing a straightforward way to inject dependencies.

This service handles validation tasks, ensuring the walker, strategy, exchange, frame and related configurations are correctly set up.  It’s designed to avoid repetitive validation checks, which is a key part of the system's reliability.

To execute a comparison for a specific trading symbol, you can use the `run` method, providing the symbol's identifier and context information – like the names of the walker, exchange, and frame involved.  This method returns a stream of results representing the walker's comparison.


## Class TimeMetaService

The TimeMetaService helps you reliably get the most recent candle timestamp for a specific trading setup, regardless of where you are in your trading logic. It keeps track of these timestamps for each combination of symbol, strategy, exchange, and frame, ensuring you always have the latest information.

Think of it as a central place to look for the current time, particularly useful when you need that information outside of the usual trading cycle, such as when a command is triggered.

This service uses a cached "snapshot" of timestamps that are updated after each trading tick. If a timestamp hasn't been set yet, it will wait a short time to make sure it gets the correct value.

You can clear this cached data to free up memory and prevent using old information, which is important when starting a new trading simulation or live run. It's like hitting a reset button on the timestamps.

## Class SystemUtils

SystemUtils helps keep backtesting sessions separate and clean. It prevents one simulation from affecting another by temporarily disconnecting everything listening for events.

Think of it like creating a temporary bubble around each backtest.

The `createSnapshot` function is particularly useful. It essentially takes a picture of how everything is connected – all the listeners for events – and stores that information. Then, it clears out those connections. After the backtest finishes, you can use a "restore" function (returned by `createSnapshot`) to put everything back exactly as it was before, ensuring a fresh start for the next session.

## Class SyncUtils

The SyncUtils class helps you analyze and understand how your trading signals are behaving over time. It gathers information about signal openings and closures, accumulating statistics and creating detailed reports.

You can use it to get overall stats like the total number of signals opened and closed.

It can also build markdown reports, which are like nicely formatted documents, showing you a chronological list of signals, including key details like entry/exit prices, profit/loss, and timestamps.

Finally, it can automatically save these reports as files so you can easily review them later, with filenames that clearly identify the symbol, strategy, exchange, frame and whether the backtest was live or historical.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals by recording important events to a report file. It's designed to capture when a signal is initiated (like a limit order being filled) and when it's closed (a position being exited). 

This service listens for those "signal" events and saves details like the initial signal information and, when it closes, the profit/loss and reason for closing. It uses a special mechanism to make sure you aren't accidentally subscribing to events more than once.

You can start receiving these signal events by using the `subscribe` function and stop them with the function it returns.  The `unsubscribe` function provides a way to stop listening if you’ve already subscribed. Essentially, it's a tool for creating a reliable record of your signal activity.

## Class SyncMarkdownService

This service is responsible for keeping track of signal events and generating reports about them. Think of it as a record-keeper for your trading signals.

It listens for signal events (when a signal is opened or closed) and organizes them based on factors like the symbol being traded, the trading strategy used, the exchange, and the timeframe.

You can subscribe to receive these events, and the service will generate detailed markdown reports that you can save to disk. These reports provide a lifecycle view of your signals.

You can ask it for statistics like the total number of signals, how many were opened, and how many were closed. It offers options to clear the accumulated data, either for a specific signal configuration or for everything.

The `dump` function creates and saves the report to a file, and the reports are structured with filenames that include the symbol, strategy, exchange, timeframe and whether it's backtest or live data. If you stop listening for events, the `unsubscribe` function cleans everything up.

## Class SweepValidationService

The SweepValidationService helps ensure that your trading strategies are using valid and existing sweeps. It keeps track of all registered sweeps and checks that they still exist and are compatible with the exchanges they rely on whenever they're used.

Think of it as a gatekeeper for your sweeps – if you try to use a sweep that doesn't exist or has a problem, this service will catch it. 

You can register new sweeps with this service, but it won't allow duplicates.

Here's what it lets you do:

*   **Add a sweep:** Records a sweep with its details for later validation.
*   **Validate a sweep:** Checks if a specific sweep is registered and its exchange setup is correct. This is done efficiently; it only validates each sweep once.
*   **List all sweeps:** Provides a list of all sweeps that are currently being tracked.

## Class SweepUtils

SweepUtils helps you evaluate numerous trading ideas simultaneously, like running a competition between different strategies. It simulates each idea just once using a single candle and then analyzes the results to identify the best performers. The framework ranks ideas based on criteria like Sharpe ratio, Sortino ratio, profit, and recovery rate, and provides detailed reports for each trade.

Here's how it works: You define a set of parameters that control the simulation, like stop-loss percentages, trailing stops, and holding times. The framework then tests all combinations of these parameters, effectively exploring a wide range of trading approaches. Importantly, every idea gets a chance to execute, without any initial filtering or bans on authors.

The evaluation focuses on whether a trade was profitable before a stop-loss was triggered, using a strict chronology. Performance is tracked for each author's ideas, giving insights into which strategies are most consistently successful. 

The core functionality is handled by the `run` method, which takes a set of trading ideas and runs a complete simulation, profiling the ideas and then ranking them. The system filters out duplicate or irrelevant ideas to ensure a clean and efficient evaluation process. The framework considers only one idea per author per direction within an eight-hour window. Any ideas with incomplete data are discarded. Ultimately, the results are presented as a combined report, showing rankings and individual trade details. The final verification of parameter selection comes from running a live backtest using the `Backtest.run` function.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to manage and store descriptions of sweep configurations. It keeps track of these configurations, associating them with unique names.

When a new sweep configuration is defined, this service performs a basic check to ensure the most important details are present.

The system uses this service to retrieve and build sweep configurations when needed.

You can add new sweep configurations, update existing ones, or simply look up a configuration by name. If you try to register a configuration with a name that already exists, the existing configuration will be replaced.

## Class SweepGlobalService

SweepGlobalService acts as the central access point for all sweep-related operations. It’s the first stop for any request involving a sweep, ensuring that the sweep exists and is compatible with the exchanges being used. 

Think of it as a gatekeeper that checks everything is in order before passing the request along to handle the actual sweep execution.

It relies on other services – for logging, managing connections to sweep data, and validating sweep details. 

The `run` method is the main function you'll use; you give it information about a symbol and the sweep you want to run, and it takes care of the entire process, from filtering and evaluation to generating the final results. This process includes defining ideas, evaluating a grid, and ranking those ideas.


## Class SweepCoreService

The SweepCoreService acts as the central engine for running sweep simulations. Think of it as the brain that checks everything is in order before kicking off a sweep and then directs the process. 

It verifies that the sweep configuration is valid, ensuring all necessary components exist and are connected correctly. It then passes the simulation work on to other services that handle specific tasks, like evaluating trading strategies and ranking their performance. 

It sits between the initial request and the detailed, pre-calculated results managed elsewhere.

The `run` method is the main entry point – you provide it with information like the symbol you want to test, the sweep name, and a list of trading ideas, and it orchestrates the entire sweep simulation process.


## Class SweepConnectionService

The SweepConnectionService manages the lifecycle of sweep clients, acting as a bridge between incoming data and the sweep logic. It’s responsible for retrieving and creating sweep clients based on their names, ensuring each sweep has a properly configured client with default grid axes.

The service uses memoization, meaning it only creates one client instance per sweep name to optimize performance.

You can request a specific `ClientSweep` using `getSweep`, which will create it if it doesn't already exist. The `run` method executes a complete simulation, taking data and applying filtering, evaluation, and ranking steps.

If you need to refresh the sweep clients – perhaps because the underlying schema has changed – the `clear` method allows you to discard the memoized clients and force them to be re-created. This is useful for ensuring you’re working with the latest configuration.

## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly. It acts like a central manager for all your strategies, allowing you to register new ones and listing the ones you've already defined. 

Before you can use a strategy, this service checks to see if it exists and also verifies any related risk profiles and actions to prevent errors. It’s designed to be efficient; it remembers validation results so it doesn’t have to repeat the process unnecessarily.

You can use this service to:
*   Add new strategies to your system.
*   Validate the setup of an existing strategy.
*   Get a complete list of all your registered strategies.

The service relies on other components for risk and action validation.

## Class StrategyUtils

The StrategyUtils class helps you understand and analyze how your trading strategies are performing. It acts as a central hub for pulling together information about strategy events like closing trades, taking profits, or setting stop losses. 

You can use it to get statistical summaries of your strategies, showing you how often different actions are taken. It also provides a way to create easy-to-read reports in Markdown format, which can include detailed tables showing individual events and overall counts. 

Finally, you can easily save these reports to files so you can review them later or share them with others, with filenames organized by symbol, strategy, exchange, frame, and whether it's a backtest or live run. This utility class simplifies the process of understanding and documenting your strategy's behavior.


## Class StrategySchemaService

The StrategySchemaService acts like a librarian for your trading strategies, keeping track of their blueprints. It ensures that each strategy has the necessary components defined correctly. 

You add new strategy blueprints using `addStrategy()`, and find them again by name using `get()`.  If you need to adjust an existing strategy blueprint, you can use `override()` to make specific changes. Before a strategy blueprint is accepted, `validateShallow()` checks if it has all the expected parts and types. 

The service uses a special system to store these blueprints in a way that prevents errors caused by incorrect data types, and keeps everything organized.  It also logs its actions to help with debugging.


## Class StrategyReportService

This service helps you keep a detailed audit trail of your trading strategy's actions. It records events like canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting trailing stops and take profits, and moving break-even points.

Think of it as a dedicated logbook for your strategy, writing each action down immediately as a separate JSON file.

To start using it, you need to "subscribe" to enable logging. Once subscribed, the service will automatically capture strategy events. When you're finished, you can "unsubscribe" to stop logging.

The service also provides specific functions (like `cancelScheduled`, `closePending`, `partialProfit`, etc.) to log each type of trading action, including relevant details like the symbol, price, and performance metrics. This gives you a complete record of every important decision your strategy makes.

## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing and create detailed reports. Think of it as a detailed logbook for your strategies, but instead of writing everything down by hand, it does it automatically.

It collects important events like when orders are canceled, closed, or when take-profit and stop-loss levels change. This is useful for analyzing strategy performance and identifying areas for improvement.

Unlike some other reporting tools, this one stores events temporarily in memory, bundling them together before generating reports.  This is more efficient than constantly writing to disk.

Here's how it works:

1.  **Start Listening:** You need to tell the service to start listening for events by calling `subscribe()`.
2.  **Events Happen:**  As your strategies execute, events are automatically recorded.
3.  **Get Information:** You can then retrieve this information using `getData()` to get aggregated numbers or `getReport()` to create a formatted markdown report.  The reports can be customized to show specific columns of data.
4.  **Stop Listening:** When you're done, use `unsubscribe()` to stop the service and clear the data.

The service uses a clever caching system to efficiently store these events for each symbol and strategy combination. It offers a `dump()` method to save these reports directly to a file with a descriptive timestamped filename. You can even clear the stored data using the `clear()` method if needed.

## Class StrategyCoreService

This service acts as a central hub for strategy operations, providing a framework for executing strategies and managing their state. It combines the functionality of services for handling strategy connections and execution contexts, injecting relevant information like the symbol, timestamp, and backtest parameters.

It provides methods for retrieving and managing various aspects of a strategy's state, including pending signals, position details like cost, P&L, and entry prices, as well as scheduled signals.

Here’s a breakdown of key functionalities:

*   **Signal Management:** It retrieves pending and scheduled signals, offering details such as P&L, entry prices, and countdown timers.
*   **Position Details:** It calculates and provides position-related data like total cost, invested cost, entry prices, and partial close information.
*   **Validation and Control:** It validates strategy configurations and offers control mechanisms like pausing, stopping, canceling, and closing pending signals.
*   **Backtesting & Execution:**  It facilitates backtesting by injecting necessary data and executes strategies via tick and backtest functions.
*   **State Tracking:**  It tracks and reports on key metrics like the highest profit, maximum drawdown, and remaining time until expiration.



This service aims to provide a reliable and consistent way to manage strategies while abstracting underlying complexities.

## Class StrategyConnectionService

This service acts as a central router for your trading strategies, connecting requests to the correct implementation. It handles strategy logic based on the symbol and strategy name used. To improve performance, it caches strategy implementations, creating them only once and reusing them.

Here's a breakdown of its key features:

*   **Intelligent Routing:** It automatically directs calls to the right strategy based on the symbol and strategy name.
*   **Performance Optimization:** Strategy instances are cached to avoid repeated creation.
*   **Initialization:** It ensures strategies are fully initialized before trading actions.
*   **Trade Handling:** It supports both live trading (tick()) and historical backtesting (backtest()).

The service provides several helper functions to retrieve information about pending signals and positions, like price, cost, and P&L. It also offers methods for managing the strategy's state, such as pausing, stopping, and canceling signals. Finally, it provides validation and execution methods for actions like partial profits and average buys.

## Class StorageLiveAdapter

This component manages how your trading signals are stored, offering flexibility by allowing you to choose different storage methods. It’s designed to be adaptable, letting you easily swap out the underlying storage mechanism – whether you want to persist data to disk, keep it in memory, or use a dummy adapter for testing. 

You can select a storage method like persistent storage (default), in-memory storage, or a dummy adapter that does nothing. The system caches the storage instance to improve performance, but it's important to clear the cache when the working directory changes to ensure it uses the correct storage path. 

It handles events like signals being opened, closed, scheduled, or cancelled, passing these actions on to the selected storage adapter. You can also search for signals by ID or retrieve a list of all stored signals. The `handleActivePing` and `handleSchedulePing` methods keep the “last updated” timestamps accurate for active and scheduled signals. Finally, the `clear()` method is crucial to call when you restart your strategy in a new location.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how trading signals are stored during backtesting. It allows you to easily switch between different storage methods, like keeping data in memory, saving to a file, or using a dummy adapter for testing purposes. 

You can choose the storage method using convenience functions like `usePersist`, `useMemory`, and `useDummy`. It keeps track of signals through various lifecycle events like when a signal opens, closes, gets scheduled, or is cancelled. You can find signals by their unique IDs or retrieve a complete list of all stored signals. 

Importantly, `clear` is helpful when running multiple backtests in a row, especially if the working directory changes – it ensures you get a fresh storage setup each time.  The `handleOpened`, `handleClosed`, and similar methods pass events along to the currently selected storage implementation.

## Class StorageAdapter

The StorageAdapter is the central component for managing how your trading signals are stored, whether they're from backtesting or live trading. It automatically keeps track of signals as they arrive, ensuring they're saved correctly.

You can easily access signals from both your backtest runs and your live trading data through this adapter. To prevent unexpected behavior, it ensures subscriptions to signal sources happen only once.

To start using the storage, you'll enable it, which begins the signal saving process.  Conversely, you can disable it to stop saving signals.

You have several convenient methods for retrieving signals:

*   `findSignalById`:  Locates a specific signal using its unique identifier.
*   `listSignalBacktest`:  Retrieves a list of all signals generated during backtesting.
*   `listSignalLive`:  Retrieves a list of all live trading signals.

It's designed to be safe to disable multiple times if needed.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage the state of your trading strategies, allowing you to easily swap out different storage methods. It’s designed to keep track of important information like peak performance and how long a trade has been open, even if your application restarts.

You can choose where this data is stored: it defaults to a file-based system, but you can also use in-memory storage for testing or a dummy adapter to simply discard changes. 

The adapter is particularly useful for implementing rules based on LLM (Large Language Model) analysis, ensuring trades that aren't performing as expected are automatically closed. It remembers the state of each signal (trade) so the LLM can make informed decisions.

Here's a quick rundown of what you can do:

*   `disposeSignal`: Cleans up old state data associated with a specific signal.
*   `getState`: Retrieves the current state of a trade.
*   `setState`: Updates the state of a trade.
*   `useLocal`, `usePersist`, `useDummy`: Easily switch between storage methods (in-memory, file-based, or dummy).
*   `useStateAdapter`: Lets you plug in your own custom storage solutions.
*   `clear`:  Resets the internal cache, important if your working directory changes between strategy runs.



Essentially, `StateLiveAdapter` provides a flexible way to store and manage the data your trading strategies need to function effectively and reactively.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store information about trading signals during backtesting. Think of it as a flexible system for remembering key details about each trade.

It allows you to easily switch between different storage methods – whether that's keeping data in memory (fast but temporary), saving it to files (for persistence), or using a dummy adapter that simply ignores changes (useful for testing).

The adapter keeps track of things like the highest peak profit and how long a position has been open, which is valuable for testing strategies like ones that automatically close trades if they aren't performing as expected.

The `disposeSignal` function is used to clean up old data when a signal is finished, and `getState` and `setState` are the primary ways to read and update this information. Convenient helper functions exist to quickly change storage backends. Lastly, `clear` can be helpful when the base directory used for persistence changes.

## Class StateAdapter

The StateAdapter acts as a central hub for managing state during backtesting and live trading. It carefully handles subscriptions to ensure resources aren't wasted and stale data doesn't linger.

You can think of it as a smart manager that directs operations either to the backtest environment or the live environment depending on the configuration.

To start using the state storage, you'll enable it, and to stop, you simply disable it – it's safe to disable multiple times.

Need to check the current state?  The `getState` function retrieves the value for a specific signal.  Similarly, `setState` lets you update the value of a signal, and it knows whether it's operating within the backtest or live context. It uses a clever mechanism to make sure subscriptions happen only once.


## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies. It acts as a central place to register all the different ways you calculate how much to trade.

Think of it like a librarian for your sizing rules—you add them with `addSizing`, and the service makes sure they're available before you use them. To prevent errors and speed things up, it remembers whether a sizing rule exists so it doesn't have to check every time.

You can use `validate` to confirm that a sizing strategy exists and, optionally, that it's using the right method.  `list` allows you to see all the sizing strategies you've registered, giving you a complete overview of your setup.


## Class SizingSchemaService

The SizingSchemaService helps you manage and store your sizing schemas in a safe and organized way. It uses a special registry to keep track of these schemas, ensuring they are consistent and typed correctly.

You can add new sizing schemas using the `register` method, or update existing ones with `override`. 

To get a specific sizing schema, simply use the `get` method, providing its name to retrieve it. The service also includes a validation step to make sure your sizing schemas have the necessary components before they are added.

## Class SizingGlobalService

The SizingGlobalService is a central component that figures out how much of an asset to trade based on your defined risk and strategy. 

It uses a connection service to perform the actual size calculations and another service to validate those calculations.

Think of it as the engine determining your trade sizes, working behind the scenes to translate your risk tolerance into concrete positions. 

The `calculate` function is the key method, taking parameters like risk amounts and a context that identifies the sizing operation. This function then returns the calculated position size. 

Essentially, it’s a globally accessible service to handle all the complexities of position sizing.

## Class SizingConnectionService

The SizingConnectionService acts as a central hub for calculating position sizes, directing requests to the right sizing implementation. It’s designed to efficiently handle sizing calculations by caching frequently used sizing configurations.

When you need to determine how much of an asset to trade, this service figures out which sizing method to use – whether it’s a fixed percentage of your capital, a more complex formula like the Kelly Criterion, or something based on Average True Range (ATR). 

It intelligently remembers which sizing methods it’s already used, avoiding unnecessary re-calculations for better performance. If a strategy doesn't have specific sizing rules, it defaults to an empty configuration.

The `getSizing` property is how you retrieve a sizing implementation, and the `calculate` property is the main method to actually compute the size, taking into account risk and the chosen sizing method. It relies on a 'sizingName' to identify the correct sizing implementation to use.

## Class SessionLiveAdapter

The SessionLiveAdapter helps manage and store data during live trading sessions, allowing for flexibility in how that data is handled. It acts as a central point for interacting with different storage methods, making it easy to switch between them.

By default, it uses a file-based storage that keeps your data safe even if the application restarts. You can also choose to use a temporary, in-memory storage for quick testing, or a dummy storage that simply ignores any data changes.

This adapter intelligently caches session data based on factors like the trading symbol, strategy name, exchange, and frame.  If you need to use a completely different storage approach, you can even plug in your own custom storage implementation.

You can easily switch between the available storage options using helper functions like `useLocal`, `usePersist`, `useDummy`, or `useSessionAdapter`.  If the working directory of your application changes, it's helpful to clear the cache with `clear` to ensure that new storage instances are created correctly.

## Class SessionBacktestAdapter

This component provides a flexible way to manage session data during backtesting. It acts as a bridge, allowing you to easily swap out how the session data is stored and handled.

Initially, it uses an in-memory storage solution, which is simple and fast. 

However, you can easily change it to save your data to disk for persistence or even use a dummy adapter that throws away any data written, useful for testing.

The adapter keeps track of session values based on factors like the trading symbol, strategy name, exchange, and the timeframe being used. 

You can read and update these session values during the backtest process.

For more control, you're even able to use a completely custom session adapter implementation. 

Remember to clear the adapter’s cache if your working directory changes, ensuring fresh session instances are created.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both backtesting and live trading. It intelligently directs operations to the appropriate storage mechanism – either for historical data during a backtest or for real-time data in a live environment.

To retrieve existing data, you can use the `getData` function, specifying the symbol, relevant context (like strategy and exchange names), whether you're in a backtest, and the timestamp.

Similarly, the `setData` function lets you update the stored data, also considering the backtest flag and timestamp. This adapter simplifies data management by automatically choosing the right path for either historical analysis or current trading.


## Class ScheduleUtils

The ScheduleUtils class helps you keep track of and understand how your scheduled signals are performing. It's like a central hub for managing signal reporting, offering a convenient way to access and analyze information related to your trading strategies.

You can use it to gather statistics on signals for a specific symbol and strategy combination. 

It also allows you to create clear and readable markdown reports that summarize the scheduled events, making it easier to spot trends and potential issues. 

Finally, the class can save these reports directly to a file, so you can review them later or share them with others. This tool helps you monitor the health and efficiency of your automated trading signals.


## Class ScheduleReportService

This service is designed to keep a record of when signals are scheduled, opened, and cancelled, specifically for tracking delayed order executions. It acts like a detective, constantly listening for these signal events and noting down important details.

The service uses a 'logger' to write debug information and a 'tick' to process signal events, categorizing them as scheduled, opened, or cancelled. 

You can tell it to start listening for these events using `subscribe`, and it will notify you when it’s done with an unsubscribe function.  To stop listening, use `unsubscribe` which essentially reverses what `subscribe` did. If it’s not currently listening, calling `unsubscribe` won’t cause any harm. The service avoids accidentally double-listening to the signal events to maintain accuracy.

## Class ScheduleMarkdownService

The ScheduleMarkdownService is designed to automatically create reports detailing the scheduling and cancellation of trading signals. It keeps track of these events – when signals are scheduled and when they are cancelled – for each strategy you're using. 

The service generates detailed markdown tables containing information about each signal event, along with helpful statistics like cancellation rates and average wait times. These reports are saved as files, making it easy to review signal activity and identify potential issues.

You can subscribe to receive these events in real-time, but if you need to stop, a simple unsubscribe function is provided. The `tick` function handles processing the incoming signal events.

Retrieving data and reports is straightforward – you can get statistical summaries or full markdown reports for specific strategies and symbols. You can also have the service save reports directly to your disk, automatically creating directories as needed. Finally, a `clear` function allows you to wipe the accumulated data, either for a specific combination of symbol, strategy, exchange, frame, and backtest or for everything.

## Class RiskValidationService

This service helps keep track of your risk management rules and makes sure they're set up correctly before you start trading. It acts like a central place to register all your different risk profiles, which define how much risk you're comfortable taking.

Before any operation involving risk, this service checks to confirm those rules actually exist. To make things faster, it remembers the results of these checks so it doesn't have to re-validate repeatedly.

You can add new risk profiles using `addRisk`, confirm the existence of a profile with `validate`, or see a complete list of all registered profiles using `list`. Essentially, it’s a safeguard and organizational tool for your risk management setup.

## Class RiskUtils

This class provides tools for analyzing and reporting on risk rejections that occur during trading. Think of it as a way to understand why your strategies might have been stopped or adjusted.

It gathers information about risk rejection events, like when a trade was blocked or modified, and stores them for later review.

You can use it to get statistical summaries, like the total number of rejections, broken down by the specific asset traded and the strategy used. It also creates nicely formatted reports that include a table of all rejection events, showing details like the price, position size, and the reason for the rejection. Finally, it allows you to easily save these reports to files so you can share them or keep a record of your risk management performance. Essentially, it helps you understand and improve your risk management process.


## Class RiskSchemaService

The RiskSchemaService helps keep track of different risk schemas, acting as a central place to store and manage them. It utilizes a specialized storage system for ensuring everything stays organized and follows the expected data types.

You can add new risk schemas using the `addRisk()`-like `register()` method, and later retrieve them using their assigned names with the `get()` method. 

Before a new schema is added, `validateShallow()` checks it to make sure it has all the necessary properties and they’re the right types. If you need to make changes to a schema that's already registered, you can use `override()` to apply partial updates without replacing the entire schema. 

The service relies on a logger for tracking and debugging, and its internal storage (_registry) handles the actual data.

## Class RiskReportService

The RiskReportService helps you keep a record of when the risk management system rejects trading signals. Think of it as a digital logbook for these rejections.

It monitors for these rejection events and carefully saves details like why the signal was rejected, and what the signal would have looked like if it had been allowed. This information is crucial for understanding and improving your risk controls.

To get it working, you need to tell it to start listening for those rejection events – this is done through the `subscribe` function, and you'll get a way to stop listening with a returned unsubscribe function. If you’ve already subscribed, trying to subscribe again won't cause problems thanks to a feature that prevents multiple registrations.

The `unsubscribe` function is how you tell the service to stop recording risk rejections. It safely stops the monitoring process, ensuring you don’t accumulate unnecessary data. 


## Class RiskMarkdownService

The RiskMarkdownService helps you automatically create and save detailed reports about rejected trades, making it easier to understand why your strategies are being stopped. It listens for "risk rejection" signals and organizes these events, grouping them by the trading symbol and strategy being used.

You'll get well-formatted markdown tables in the reports, along with statistics summarizing the total rejections and breaking them down by symbol and strategy. These reports are saved to disk, making them readily available for review.

To use the service, you'll subscribe to the rejection event stream, and the service will handle accumulating the data. You can then request statistical data or full reports for specific symbol-strategy combinations. The service also provides functions to clear this accumulated data when needed, either for a specific setup or everything at once.

## Class RiskGlobalService

This service acts as a central point for managing risk-related operations within the trading framework. It manages and validates risk configurations, ensuring trades adhere to predefined limits.

It works closely with a connection service for risk limits and uses memoization to avoid repetitive validation processes, improving efficiency.

Key functions include:
*   Verifying risk settings and logging the validation activity.
*   Determining if a trading signal should proceed based on risk constraints.
*   A specialized version of the signal check that also reserves resources to prevent conflicts during concurrent validation.
*   Registering and removing trading signals within the system.
*   Providing the ability to clear all or specific risk data.



The service is designed for internal use by the trading engine and the public API to maintain consistent risk management.

## Class RiskConnectionService

This service acts as a central point for managing risk checks within your trading system. It intelligently directs risk-related requests to the correct specialized risk handler, ensuring that the right rules are applied based on the specific risk configuration. It also remembers previously used risk handlers to improve performance, avoiding repeated setups.

Think of it like a traffic controller, making sure risk assessments go to the right place.

Here's a breakdown of what it does:

*   **Smart Routing:** It uses a `riskName` to determine which risk handler is responsible for a particular operation.
*   **Performance Boost:** It keeps a record of which risk handlers it's already used, so it doesn't have to recreate them unnecessarily.
*   **Signal Validation:** It has a method to check if a trading signal is allowed based on predefined risk limits like portfolio drawdown and exposure.
*   **Concurrency Safety:** A special method provides a safe way to validate signals and reserve resources simultaneously, avoiding issues in concurrent trading environments.
*   **Signal Tracking:** It lets you register new trades and remove completed trades from the risk management system, keeping track of active positions.
*   **Cache Clearing:**  You can manually clear the cached risk handlers if needed.

The service relies on other components like a `RiskSchemaService` and `TimeMetaService` to function properly, and it communicates via a `loggerService` for logging and context management.

## Class ReportWriterAdapter

This component helps you manage where your trading data and analytics are stored, offering flexibility and efficiency. It acts as an intermediary, allowing you to easily swap out different storage methods without changing your core trading logic. 

It keeps track of your storage instances, ensuring you're not creating unnecessary duplicates. By default, it uses a simple JSONL append method for storing data, but you can customize it to use other systems.

The `ReportFactory` property controls which storage method is used, and `getReportStorage` manages those storage instances.  You write data using the `writeData` function, and it automatically sets up the storage the first time you use it.

You can change the default storage method with `useReportAdapter`, temporarily disable data logging with `useDummy`, or revert to the standard JSONL format with `useJsonl`.  If you are switching environments and the base directory changes, `clear` helps to refresh the storage instances.


## Class ReportUtils

ReportUtils helps you control what types of data are being logged during your trading activities, like backtesting, live trading, or performance analysis.

Think of it as a way to turn on and off specific logging features.

The `enable` method allows you to choose which logging features to activate, such as logging data from backtests or live trades.  It gives you a function to call later that will turn off all of those features at once, ensuring you don’t leak resources.  Remember to use that cleanup function when you're done!

The `disable` method lets you stop logging for certain features while keeping others running; it doesn’t need a separate cleanup step.




It's designed to be extended by other parts of the system, like the `ReportAdapter`.

## Class ReportBase

The `ReportBase` class helps you systematically log and store trading events in a JSONL file. Think of it as a dedicated reporter for your backtesting framework. 

It's designed to write data line by line to a file, ensuring that the writes are appended and handled efficiently, even when things get busy. The process is safe, with built-in safeguards to prevent write operations from taking too long.

You can easily filter these event logs later by searching for specific criteria like symbol, strategy, exchange, or frame – making it great for analyzing your trading performance. The class handles the technical details of file creation, directory setup, and error handling, so you can focus on what’s important: capturing and understanding your trading activity.

The initialization of the reporter happens only once, and the writes are protected by timeout mechanisms to avoid issues. It uses a single file per report type, located within a "dump" directory.

## Class ReportAdapter

The ReportAdapter helps you manage and store your backtesting data in a flexible way. It acts as a central point for how reports are saved, allowing you to easily switch between different storage methods like JSONL files or even a dummy adapter that simply throws data away for testing purposes.  It remembers which storage method you've chosen for each type of report, so you don't have to configure it repeatedly.

If your working directory changes during a backtest, you'll need to clear the adapter’s memory to ensure new storage instances are created with the updated base path. The adapter also handles creating storage instances only when needed, and logs events in real-time to JSONL files. 

You can tell it to use a specific adapter constructor, revert to the default JSONL adapter, or switch to a dummy adapter for testing, all with simple commands. Essentially, it provides a clean and adaptable system for logging and analyzing your backtest results.


## Class ReflectUtils

This utility class provides a way to check the performance of a trading position in real-time, whether you're actively trading or running a backtest. It acts as a central point for retrieving key metrics like unrealized profit/loss, peak profit, and drawdown, ensuring consistent calculations and validation. You don't need to instantiate it directly; it's designed to be used as a readily available singleton.

Here's a breakdown of what it offers:

*   **Position Performance:** It allows you to easily find out things like the unrealized P&L percentage or dollar amount for a position.
*   **Peak Performance:** You can track the highest price reached during a position’s life, along with the exact time it occurred, as well as the corresponding P&L at that peak.
*   **Drawdown Analysis:**  It helps to monitor the maximum drawdown experienced, including when it happened and the price and P&L at the lowest point. You can also see how long a position has been pulling back from its peak.
*   **Timing Metrics**: It provides data on how long a position has been active, how long a signal has been waiting, and how much time has passed since key performance events.
*   **Distance Calculations:** You can determine the distance, in P&L percentage or cost, between the current price and the highest profit or maximum drawdown points.

Essentially, it provides a comprehensive toolkit for understanding and monitoring the risk and reward characteristics of a trading position. It simplifies accessing these insights, providing consistency across different environments.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, providing a flexible way to store and retrieve that data. It acts as a bridge, allowing you to easily swap out different storage methods without changing the rest of your code.

You can choose to store signals persistently on disk using the default adapter, or opt for a faster, in-memory solution.

The adapter intelligently caches the storage utility to avoid unnecessary rebuilding, but it provides a `clear()` method to force a refresh when needed, such as when the working directory changes.

The `handleActivePing`, `getLatestSignal`, `getMinutesSinceLatestSignalCreated`, and `useRecentAdapter` methods simply pass requests to whichever storage method you’ve selected. `usePersist` and `useMemory` are shortcuts for choosing between persistent and memory-based storage.

## Class RecentBacktestAdapter

This component provides a way to manage and access recent backtest data, offering flexibility by allowing you to choose different storage methods. Think of it as a bridge between your backtesting logic and where your data is stored. 

It comes with a default in-memory storage option, useful for quick testing, but also supports persistent storage to disk for longer-term data retention.  You can easily switch between these storage types.

The `getInstance` property automatically creates and remembers the storage utility instance, preventing redundant creations. 

The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods are essentially shortcuts that pass your requests to the currently selected storage adapter.  You can influence which adapter is used via the `useRecentAdapter`, `usePersist`, and `useMemory` methods.

The `clear` method is important if your working directory changes during your testing process; it forces the system to rebuild the storage utility, ensuring that it uses the correct data location.

## Class RecentAdapter

The RecentAdapter is responsible for managing and providing access to the most recent trading signals, whether they come from backtesting or live trading environments. It automatically updates itself with new signals and ensures that you always have the latest information available. 

This component prevents duplicate subscriptions and provides a way to easily retrieve the latest signal for a specific trading symbol and situation. You can also determine how much time has passed since the last signal was created, helping you manage cooldown periods or other time-dependent logic. 

Importantly, it includes safeguards to prevent look-ahead bias by only considering signals that occurred before a specified time. A helpful function exists to check if any signals have been recorded at all before attempting to retrieve more detailed information, protecting against errors.

## Class PriceMetaService

PriceMetaService helps track the most recent market prices for your trading strategies. Think of it as a central place to get the current price, even when you're not actively executing a trade. It keeps track of prices for each symbol, strategy, exchange, and timeframe combination, updating them as new ticks come in.

If you need the current price outside of a normal trading tick, this service provides a reliable way to get it. It prioritizes keeping prices up-to-date and avoids stale data.

It intelligently handles different situations: if you’re already in the middle of a trade, it uses the live exchange price. Otherwise, it uses the cached price, and waits briefly for the first price to arrive if it hasn't yet. You can also clear out all cached prices or just the prices for a specific trading setup. This helps to free up memory and ensure you are working with fresh data. The service is automatically updated by the system and can be easily reset when you start a new trading session.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade based on different strategies. It offers several pre-built methods for calculating position sizes, like fixed percentage, Kelly Criterion, and ATR-based approaches.

Each method has its own formula and requirements, and the framework checks to make sure you’re providing the correct inputs for each one. Think of it as a set of tools to automate and standardize your position sizing process, ensuring your risk management is on point. You simply pass in the necessary data, and it calculates the appropriate position size for you.

## Class Position

The Position class helps you figure out where to place your take profit and stop loss orders when trading. It automatically adjusts the direction of these levels depending on whether you're going long (buying) or short (selling).

It offers two main calculation methods:

*   **moonbag:** This strategy sets a simple take profit target – 50% above your entry price for a long position, and 50% below for a short position.
*   **bracket:** This method lets you define your own take profit and stop loss percentages, giving you more control over your risk and reward. It takes the position type (long or short), current price, and your chosen percentages for both take profit and stop loss to determine the actual price levels.

## Class PersistStrategyUtils

This class provides tools for safely saving and retrieving the state of your trading strategies, especially when dealing with situations like paused tests or multiple strategy runs. It essentially acts as a manager for persistent storage related to things like pending orders or signals.

The class intelligently creates and manages storage instances for each strategy based on the symbol, strategy name, and exchange. You can even customize how this storage happens by providing your own methods for creating the storage instance.

If you need to switch between different storage methods – like using a file, a JSON database, or even a "dummy" storage that does nothing – this class offers convenient functions to do so.

There's a built-in mechanism to clear the existing storage cache, which is useful when the working directory of your program changes during a strategy test. It ensures your data isn’t mixed up between different runs.

The `readStrategyData` method retrieves the previously saved strategy state, while `writeStrategyData` saves the current state. These operations are designed to be reliable even if things go wrong unexpectedly.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. It’s designed to be reliable, even if your program crashes unexpectedly.

It focuses on storing the complete state of a single strategy, using a predefined identifier to organize things. This identifier is hardcoded as "strategy," and is used within a specific storage context.

The constructor takes the trading symbol, strategy name, and exchange name as inputs, defining the scope for storing the strategy's data.

You can initialize the storage with `waitForInit`, and then retrieve the saved strategy data using `readStrategyData` or store new data using `writeStrategyData`.  `writeStrategyData` also allows you to completely clear the saved state by providing a null value. 


## Class PersistStorageUtils

This class provides tools for saving and loading signal data, ensuring that your backtesting and live trading processes don't lose information. It intelligently manages storage instances, so you don't have to worry about creating them manually.

You can customize how data is stored by providing your own storage adapter, or use the default file-based storage. The system keeps things organized by storing each signal as a separate file, identified by its unique ID.

To handle unexpected interruptions, it's designed to be crash-safe, meaning it attempts to preserve signal state even if something goes wrong. This is especially important during backtests or when dealing with potentially unstable environments.

Here's a quick rundown of what you can do:

*   **Swap storage methods:** Easily switch between different storage implementations (like using a custom adapter, the default file-based one, or a dummy adapter for testing).
*   **Refresh storage:** Clear the internal cache to ensure you're using the latest storage configuration, particularly when the working directory changes.
*   **Read and Write Data:** Methods to retrieve all saved signals or update them.
*   **Lazy Initialization:** The storage system only initializes when it’s first needed.

## Class PersistStorageInstance

This class provides a way to store trading signals persistently using files. It's designed as the default method for saving and loading signals, ensuring data is kept safe even if something goes wrong during the process.

Each signal gets its own file, making it easy to manage and access them individually. When you need to load all signals, the system looks through all the available files.

The constructor lets you specify whether this is being used in a backtesting scenario.

Internally, it uses a file system to manage the storage, ensuring each write operation is reliable.

You can initialize the storage with `waitForInit`, read all stored data with `readStorageData`, and write new or updated signals using `writeStorageData`.

## Class PersistStateUtils

This class provides tools to reliably store and retrieve state information, particularly when dealing with potentially unstable environments or needing to recover from crashes. It's designed to work with a system that needs to remember things across interruptions, like a trading strategy.

It helps manage how and where state is saved, cleverly reusing storage locations to avoid unnecessary duplication. Think of it as a central organizer for keeping track of crucial details.

You can customize how this storage happens, swapping out the default behavior for alternative methods like using dummy data or a different file format, making it flexible for various testing or production needs.

The system keeps track of which storage locations are in use, and offers ways to clear out old ones or shut down individual instances to ensure resources are cleaned up when no longer needed. This is useful when strategies change and old data becomes irrelevant.

Essentially, it's all about creating a robust and adaptable system for remembering important information and ensuring that data isn't lost unexpectedly.

## Class PersistStateInstance

This class, PersistStateInstance, offers a simple way to store and retrieve data related to a specific trading signal. It uses files to persistently save the data, ensuring that it's available even after your application restarts. Think of it as a dedicated place to keep important information for a particular signal, identified by its signal ID and bucket name.

It automatically handles writing data to files safely and uses a unique identifier for each signal's data. 

When you’re finished using it, the `dispose` method doesn't actually need to do anything itself – it relies on a separate utility function for cleaning up any cached information. 

Here's a breakdown of how it works:

*   **Initialization:** `waitForInit` gets the storage ready.
*   **Reading Data:**  `readStateData` fetches the saved information using the bucket name.
*   **Writing Data:** `writeStateData` saves new or updated information to the file, also using the bucket name.
*   **Cleanup:**  `dispose` does nothing on its own; it's handled elsewhere to clear out any temporary memory.

## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved for your trading strategies. It ensures that each strategy gets its own dedicated storage area, preventing conflicts.

You can customize how the data is stored using different adapters, or revert to a default file-based system, or even a dummy adapter that doesn’t actually save anything, useful for testing. 

The class automatically handles creating the storage needed, making sure everything is initialized only when you need it.

It also makes sure reads and writes happen reliably, even if there are unexpected issues, and ensures that the signal state is handled carefully. This is important for strategies running in live trading mode.

The class keeps track of these storage configurations to ensure things work as expected when your working directory changes.


## Class PersistSignalInstance

This class, `PersistSignalInstance`, is designed to reliably save and retrieve signal data for your trading strategies. It acts as a safe wrapper around a file-based storage system, ensuring that your data isn't lost even if something goes wrong.

Think of it as a dedicated container for a specific strategy's signal data, identified by its symbol, strategy name, and exchange. 

It handles the complex details of writing data to a file, making sure everything happens securely. 

It's especially useful when you want to keep track of signals over time, allowing you to resume trading from where you left off.

**Key Features:**

*   **Safe Storage:**  It stores data atomically, preventing corruption.
*   **Context-Aware:** It keeps signal data organized by strategy and exchange.
*   **Crash-Resistant:** Designed to handle unexpected interruptions gracefully.

**Here's how it works:**

*   **Initialization:**  `waitForInit` ensures the storage area is ready before you start.
*   **Reading:** `readSignalData` retrieves the signal data associated with a particular symbol.
*   **Writing:** `writeSignalData` saves the current state of the signal data; you can even clear it by providing a null value.


## Class PersistSessionUtils

The PersistSessionUtils class is designed to help you safely save and retrieve session data during backtesting. It essentially acts as a smart manager for storing session information, making sure data isn't lost even if things go wrong.

It remembers which session data belongs to which strategy, exchange, and frame, keeping things organized. Importantly, it uses a special technique called memoization – it only creates storage instances when needed, which optimizes performance.

You can customize how this data is stored, choosing between file-based storage, a dummy (no-op) option for testing, or even plugging in your own storage adapters.

The class offers functions to read, write, and clear this session data. There's also a way to skip initial setup if you're testing something specific, and a way to clean up resources when a session is no longer needed. If your working directory changes, clearing the cache is necessary to prevent unexpected behavior. Finally, you can easily swap out the default storage method with your own custom implementation.

## Class PersistSessionInstance

This class helps you save and load session data for your trading strategies, ensuring that your progress isn't lost when you restart your backtest. It acts as a middleman, managing the actual file storage behind the scenes and keeping things organized. Each strategy, exchange, and frame gets its own dedicated storage area, and the specific symbol and whether it's a backtest are used to prevent conflicts when multiple symbols are used with the same strategy.

The constructor sets up the basic information needed to identify where to store and retrieve data. You’ll find properties that detail the strategy name, exchange name, frame name, the trading symbol, and a flag indicating if it's a backtest. The class handles the low-level file writing safely.

To start, `waitForInit` prepares the storage. `readSessionData` retrieves existing data, and `writeSessionData` saves new data.  The `dispose` method doesn't do anything on its own; instead, it relies on a separate utility function to clean up any cached information.


## Class PersistScheduleUtils

This class helps manage how trading signals that are scheduled to happen later are saved and loaded. It ensures that each trading strategy has its own dedicated storage for these signals, allowing for a flexible and reliable way to handle them.

It's designed to work particularly well with the ClientStrategy, which uses it to keep track of scheduled signals while trading live.

You can customize how these signals are stored, choosing from different storage methods or even creating your own. The system intelligently creates these storage "instances" only when needed, and remembers them for later use to improve performance.

If your trading environment changes (like when your working directory shifts), you can clear the memory to ensure everything starts fresh. There's also a "dummy" mode which is useful for testing and prevents any actual saving or loading of signals.

## Class PersistScheduleInstance

This class helps you store and retrieve schedule data, specifically signals, for a trading strategy. It’s designed to be reliable and safe, even if your system crashes.

Essentially, it acts as a bridge between your trading logic and a file on your computer to save important information.

The class keeps track of which trading symbol, strategy, and exchange the data belongs to. 

You’ll use it to read and write the schedule data, and it handles the complexities of ensuring that these operations are done correctly. It has a way to make sure the storage is ready before you try to read or write anything.

## Class PersistRiskUtils

This class helps manage how active trading positions are saved and retrieved, especially important for maintaining consistency and safety. It keeps track of these positions separately for each risk profile, ensuring each one is handled correctly. 

It uses a clever system to create these storage instances, making it easy to swap out different ways of persisting the data – you can use a custom solution, a file-based system, or even a dummy version for testing.

Retrieving and saving position data is handled automatically, and the system is designed to be reliable even if there are unexpected interruptions. This utility is the backbone for keeping track of your positions when actively trading.

To manage its internal storage, you can clear the cache, change the storage constructor, or even switch to a dummy mode for development and testing.

## Class PersistRiskInstance

This class provides a way to save and load trading positions persistently, even if your application crashes. It’s designed to work reliably by using a file to store the data and ensuring that writes happen in a safe, all-or-nothing manner. 

The class keeps track of the risk and exchange names, and it always stores the positions data under a specific, predetermined key. You can trigger the initialization of the storage when needed.

To retrieve the positions, it reads them from the file using a specific timestamp. To update them, it writes the new positions back to the file, again using that timestamp. The underlying storage handles the actual file operations.

## Class PersistRecentUtils

This class helps manage how recently generated trading signals are stored, especially when running backtests or live trading. It’s designed to make sure that this storage is handled reliably and efficiently.

It uses a clever system to create a unique storage area for each trading strategy and market combination (symbol, strategy name, exchange, and timeframe). Think of it as a dedicated filing cabinet for each specific scenario.

You can even customize how this storage works by providing your own storage methods, or switch between built-in options like using files or a dummy storage that doesn’t actually save anything.

The class automatically handles reading and writing the most recent signal for each scenario, and it's built to be crash-safe, ensuring data isn’t lost in unexpected situations. If your working directory changes, you'll need to clear the storage to avoid issues.


## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent trading signal for a specific instrument, strategy, and exchange. It’s designed to work with files, ensuring your data is safely stored. 

Essentially, it combines a few components to handle writing data reliably, even if things go wrong. It uses the instrument's symbol, the strategy name, exchange, and frame name to identify where to store the data, and it keeps track of whether the data relates to a backtest or live trading session. 

The `waitForInit` method makes sure the storage is ready before you try to read or write anything.  You can use `readRecentData` to get the latest signal and `writeRecentData` to save new signals, using the same identifiers to organize your data. The `_storage` property holds the underlying file storage mechanism.


## Class PersistPartialUtils

This class helps manage and store temporary progress information, specifically profit and loss data, for your trading strategies. It ensures this data is saved reliably, even if your system crashes.

The system keeps track of these data points separately for each trading symbol, strategy, and exchange, making sure information is organized. It also allows you to customize how this data is stored, whether it's in a file, a database, or even just a temporary in-memory location for testing.

If you're using a custom storage method, you can easily swap it out, and the system will remember which one to use.  The class also automatically handles saving and retrieving this partial data, making the process simpler. If you need to reset everything, you can clear the storage to start fresh.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and load incomplete trading data to a file, ensuring your progress isn't lost even if something goes wrong. It's designed to work with a specific trading symbol, strategy, and exchange.

It securely handles saving data by writing everything at once, minimizing the risk of corruption. Each piece of data is identified by a unique signal ID, keeping things organized.

The class provides methods to initialize the storage, retrieve partial data using a signal ID, and save partial data, effectively acting as a reliable safety net for your trading information. It automatically manages the underlying file storage. 


## Class PersistNotificationUtils

This class provides tools to handle saving and retrieving notification data, making sure the process is reliable and consistent. It manages how notifications are stored, and it’s designed to work smoothly with other parts of the system that deal with live and backtesting scenarios.

You can customize the storage mechanism by providing your own way of handling notifications, or you can use the built-in defaults like a standard file-based system or a dummy version for testing purposes. 

The system automatically handles initializing the storage when needed and ensures that writing and reading notification data is done carefully to prevent issues. It also includes a way to clear out the stored settings if things change in your environment, like when the working directory gets updated. 


## Class PersistNotificationInstance

This class provides a way to persistently store and retrieve notification data, ensuring that your application's notifications aren't lost even if something goes wrong. It works by saving each notification as a separate JSON file, making it easy to manage and access them individually.

The system is designed to be robust – it uses atomic writes to minimize the risk of data corruption if there's a crash.

To use it, you'll provide a `backtest` flag during creation, and the class handles the underlying file storage automatically.

You can initialize the storage with `waitForInit`.

Retrieving all notifications involves reading them based on the storage keys.

When you need to save notifications, `writeNotificationData` takes a collection of notifications and writes each one as a distinct file identified by its ID.


## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how data is stored and retrieved for your trading strategies, especially when you need that data to survive crashes or restarts. It provides a way to save memory entries to disk and load them back later.

Think of it as a smart storage manager; it keeps track of where each piece of data is saved based on its signal ID and bucket name, ensuring efficient access. You can even customize how this data is stored by providing your own storage adapters.

It initializes storage as needed, so you don't have to worry about setting things up manually. You can read, write, and delete entries, and it handles the details of saving these actions to files.

If you're rebuilding indexes or need to clean up, you can clear the storage cache or dispose of specific storage areas. There's also a handy way to switch between different storage methods, like using a default file-based system or even a dummy system for testing purposes where no actual data is saved. It ensures that the correct storage class is used and re-initializes when needed, providing flexibility and control over data persistence.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data, like snapshots of your trading system’s state, to disk. Think of it as a reliable way to save your progress and potentially recover from errors.

It uses files to keep your data safe.

The `signalId` and `bucketName` identify where your data is stored, allowing you to organize it.

You can read, write, and remove (soft-delete – marking as removed rather than actually deleting) individual memory entries using their unique IDs.  The `listMemoryData` method lets you access all currently valid data entries.

Importantly, cleanup and managing the underlying cache is handled separately, so this class focuses on the storage aspect. Initializing the storage happens through `waitForInit`.

## Class PersistMeasureUtils

This utility class helps manage how data from external APIs is stored and retrieved persistently. It acts like a central hub, creating and managing storage instances for API responses based on factors like timestamps and symbols.  The system intelligently creates these storage instances only when needed, and ensures that the read and write operations are handled reliably.

You can customize how data is stored by providing your own storage "adapter," or use the built-in defaults which use file storage.

Key features include:

*   It remembers which storage instances it has created, avoiding unnecessary creation.
*   It allows you to easily switch between different storage methods.
*   It handles data deletion gracefully by marking entries as removed rather than permanently deleting them.
*   It ensures data integrity even if the process is interrupted.

There's a way to clear out the system's memory of previously used storage instances, which is useful when your working directory changes. You also have the option to use a "dummy" adapter for testing purposes, where all operations have no real effect.

## Class PersistMeasureInstance

This class provides a way to store and retrieve trading measure data persistently, typically to a file. It acts as a layer on top of a more basic storage system, ensuring that updates happen reliably.

Data is managed using a "bucket" - essentially a folder - where each measure is stored as a separate file. When an entry is removed, it's not actually deleted from the file system; instead, a flag (`removed: true`) is added to mark it as soft-deleted. This allows for easy recovery if needed.

To get started, you'll specify a bucket name when you create an instance. The `readMeasureData` method fetches a single measure by its key, and `writeMeasureData` saves it. `removeMeasureData` performs a soft delete, and `listMeasureData` allows you to iterate through the active measure entries (those that haven't been marked as removed).  `waitForInit` ensures the storage is ready for use before performing operations.

## Class PersistLogUtils

This class provides tools for managing how log data is saved and retrieved. It acts as a central point for handling persistence, ensuring logs are reliably stored even if things go wrong.

It keeps a record of the log storage system, allowing you to easily change how the logs are saved, like switching to a different storage method or using a test version. 

The class automatically handles reading and writing log entries, and it makes sure that updates are handled safely. Each log entry is saved as a separate file, which makes it easier to manage individual entries.

You can customize how logs are stored by providing your own storage classes, or you can easily switch back to the default file-based storage. There's even a "dummy" mode that lets you test your code without actually saving any logs. 

This utility is the backbone for persisting log data and is used by the LogPersistUtils component.

## Class PersistLogInstance

This class provides a way to store your backtest results persistently using files on your computer. Think of it as a safe and reliable record keeper for your trading simulations.

Each result, identified by a unique ID, is saved as its own individual JSON file. When you need to review your past performance, this system reads all those files, one by one.

It's designed to be append-only, meaning it only adds new data – it won't modify or delete anything already stored. This ensures your historical data remains untouched.

The storage itself is handled by an underlying file system, and it's built with a crash-safe approach to protect against data loss. Before using it, you'll need to initialize the storage, and you can retrieve all the saved log data or add new entries.

## Class PersistIntervalUtils

This component helps manage a record of when specific intervals have fired within your trading strategies. It keeps track of this information by storing small markers in files located in a `dump/data/interval` directory.

Think of it as a way to ensure certain actions only happen once per interval, or to prevent redundant calculations.

You can configure how these markers are stored and managed using different "adapters" like a standard file-based system, a JSON-based approach, or even a dummy adapter for testing.

The system remembers its state—if a marker exists for a specific interval, it means that interval has already been processed; if it's missing, it hasn't.

It allows you to list all intervals that have been marked as fired for a specific time period, and provides a way to clear the system's memory if the working directory changes during strategy execution.

## Class PersistIntervalInstance

This component handles persisting interval data to a file, providing a reliable way to store and retrieve information related to specific time intervals. It’s designed to be a default solution for managing this data, ensuring that writes are handled safely and consistently. 

The system uses a "bucket" to organize the data, acting as a directory or container for all interval-related files.

To manage data changes, it supports "soft deletes" – instead of removing files entirely, a marker is flagged as removed, allowing it to be re-enabled later if necessary.

Here's a breakdown of what you can do with it:

*   You can initialize the storage.
*   Read data associated with a particular interval key.
*   Write new interval data or update existing ones.
*   Remove interval data by marking it as deleted.
*   List all available interval data, excluding any that have been soft-deleted.



It interacts with a lower-level storage component, wrapping it to provide a more user-friendly and robust interface.

## Class PersistCandleUtils

This class, `PersistCandleUtils`, helps manage how your trading strategy's candle data (like open, high, low, close prices) is stored and accessed. It's designed to save each candle as a separate file, organized by exchange, symbol, interval (like 1 minute, 1 hour), and timestamp.

The system checks if the stored files match the number you're requesting, ensuring you get cached data when appropriate. It also handles automatically updating the cache when data might be missing or incomplete. 

You can customize how these candles are stored using different 'adapters' – you can switch to a default file-based storage, a simple dummy storage that does nothing, or bring in your own custom solution.  Think of it as a way to manage your historical price data efficiently.

If your working directory changes during a strategy run (like when using a container environment), you'll want to clear the cache to ensure fresh data. The class provides a method to easily do that. It's the backbone for how `ClientExchange` handles keeping track of your candle data.

## Class PersistCandleInstance

This class helps you store and retrieve historical candle data for trading, acting as a persistent layer for your backtesting framework. It uses simple JSON files to keep track of each candle, organized by their timestamps.

Think of it as a file-based database for your candlestick data.

If it can't find a candle when you ask for it (a cache miss), it's designed to trigger a fresh fetch. It avoids writing partial or outdated candle information to the storage, ensuring data integrity.  If a candle seems corrupted, it'll warn you and treat it as if it were missing.

The storage is specific to each symbol, interval, and exchange you’re working with.

You can use `waitForInit` to make sure the underlying storage is ready before you start reading or writing data.

`readCandlesData` efficiently retrieves a range of historical candles, and if even one is missing, it signals a complete cache miss.

`writeCandlesData` appends new, complete candles to the cache, guaranteeing that only fully formed data is preserved and preventing overwrites.


## Class PersistBreakevenUtils

This class helps manage and store breakeven data – essentially, the points where a trade becomes profitable – for your trading strategies. It’s designed to make sure this data is saved reliably and accessible.

It handles saving and loading this data to files, organizing it neatly within a directory structure for each symbol and strategy you're using.

Think of it as a central place to keep track of these crucial breakeven points, making sure they're persisted even if your program restarts.

You can customize how this data is stored, for example, switching to a simplified version for testing or using a completely different storage method. It uses a clever system to avoid creating unnecessary files and only loads the data when it’s actually needed. If your working directory changes during your backtesting process, you need to clear the cache to ensure correct data loading.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, which is essential for keeping track of trade performance and making informed decisions. It's designed to work with file-based storage, ensuring your data isn't lost even if something unexpected happens.

The class is built around a unique identifier (signalId) to organize data, and it’s tied to specific parameters like the trading symbol, strategy name, and exchange.

The `waitForInit` method makes sure the storage is ready before you start using it. The `readBreakevenData` method lets you fetch breakeven data associated with a particular signal, while `writeBreakevenData` is used to save new or updated data for that signal. Essentially, it's a safe and organized place to keep your breakeven information.

## Class PersistBase

PersistBase provides a foundation for storing and retrieving data to files, ensuring data integrity and reliability. It's designed to handle files safely, preventing corruption and loss even if things go wrong during writes.

This class automatically manages the directory where your data files are stored and validates them upon initialization, cleaning up any corrupted files it finds. You can easily check if a specific piece of data exists and retrieve it.  Writing data back is handled with atomic operations, meaning the entire process completes successfully or not at all, guaranteeing consistency.

It offers a way to efficiently get a list of all the data items you've stored, one at a time using an asynchronous generator. This is useful for tasks like iterating through all your records.  The system remembers the directory and file names and ensures the directory exists before starting any operations. It makes sure file deletion happens reliably, even if there are temporary issues.

## Class PerformanceReportService

The PerformanceReportService helps you understand where your trading strategies are spending their time. It quietly listens for timing events during strategy execution and records them. Think of it as a detective for bottlenecks, identifying areas where your code might be slow.

You can tell it to start listening for these events, and it will store detailed timing information in a database.  It prevents accidental double-subscription, ensuring data integrity.

To stop it from recording, you can unsubscribe. If it wasn’t subscribed in the first place, nothing happens. It relies on a logger service to output debugging information, and it's designed to track performance data and store it for later analysis.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you monitor and understand how your trading strategies are performing. It gathers performance data as your strategies run, organizing it by symbol, strategy, exchange, frame, and whether it's a backtest or live trading.

You can think of it as a central collector and reporter for performance metrics.

It automatically creates reports in a human-readable markdown format, complete with bottleneck analysis, and saves them to your logs.  

The service provides a way to access overall performance statistics and offers functions to clear out accumulated data when needed. It also manages subscribing to and unsubscribing from performance events to ensure efficient data collection. It uses a unique storage system, so performance data is kept separate for each symbol, strategy, exchange, frame, and backtest.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools for analyzing performance metrics, identifying bottlenecks, and generating clear reports.

You can use `getData` to retrieve a comprehensive summary of performance statistics for a specific trading strategy and symbol. This provides a breakdown of how long operations take, including averages, minimums, maximums, and volatility measurements.

`getReport` creates a readable markdown report that visually presents performance data, highlighting areas that might be slowing down your strategy.

Finally, `dump` allows you to easily save these reports directly to your hard drive, with the option to specify where they should be saved and which data columns to include.

## Class PartialUtils

This utility class helps you analyze and report on partial profit and loss events, like when a trade is adjusted or partially filled. It provides easy ways to get summaries of your trading performance and generate detailed reports.

You can retrieve statistical data, like total profit and loss counts, to understand how your strategies are performing.

It also allows you to create markdown reports that present a clear, table-based view of individual partial profit/loss events, including important details such as the action taken, symbol traded, strategy used, signal ID, position, level, price, and timestamp.

Finally, it can automatically generate these reports and save them as markdown files, making it simple to share your trading analysis. The files are named clearly to identify the symbol and strategy they represent.


## Class PartialReportService

The PartialReportService helps you keep track of your trading progress by recording every time you partially close a position, whether it's a profit or a loss. It essentially listens for signals indicating these partial exits – one for profits and one for losses – and saves that information. This service logs the price and level at which each partial exit occurred, allowing you to analyze your trading decisions and performance later on.

To use it, you’ll subscribe to the relevant profit and loss signals. This subscription is designed to prevent accidental duplicate setups.  When you’re done, you can unsubscribe, which stops the service from receiving those signals. The service uses a logger to provide debugging information.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on partial profits and losses. It listens for events indicating these partial gains and losses and organizes them by symbol and trading strategy. 

It automatically creates reports in a readable markdown format, providing a summary of each event and overall statistics. These reports are saved to disk, allowing you to review your progress over time.

You can subscribe the service to receive these partial profit and loss signals, and it ensures you don’t accidentally subscribe multiple times. You can also clear out the accumulated data if needed, either for everything or just a specific strategy. Finally, the service has a way to retrieve both detailed data and formatted reports for a particular trading symbol and strategy.

## Class PartialGlobalService

The PartialGlobalService acts as a central point for managing and tracking partial profits and losses within the trading system. Think of it as a coordinator that sits between your trading strategy and the actual connection layer handling the data. It simplifies things by providing a single place to inject dependencies and ensuring everything is logged consistently.

This service leverages other services like loggerService, partialConnectionService, and validation services to handle specific tasks.

Specifically, it allows you to register profits and losses, and to clear those states when a signal closes. These actions are logged at a global level for monitoring purposes before they are actually handled by the connection service. The system also validates that the strategy, risk, exchange, frame, action are all valid before proceeding. This helps ensure data integrity and provides a centralized and auditable record of partial trading activity.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It's essentially a central place to create and manage specialized objects, called ClientPartial, that handle the details of profit/loss calculations for each individual signal.

Think of it like this: for every signal you're tracking, this service makes sure there's a dedicated record to keep track of its progress. It remembers these records (memoizes them) to avoid creating new ones unnecessarily.

This service is used by the overall trading strategy, and it ensures that profit and loss events are properly logged and communicated. When a signal is finished, the service cleans up the record, making sure no unnecessary data is stored.

The `getPartial` function is the core of this system, providing a way to get a hold of the record for a specific signal. The `profit`, `loss`, and `clear` methods trigger actions on those records when profits are reached, losses occur, or a signal closes, respectively.

## Class OrderTransientError

This `OrderTransientError` class helps clearly signal when an order attempt fails temporarily, like due to a network issue or a brief exchange problem. It's not a special case for the framework itself – any untyped error is treated the same way – but it's useful for your code to explicitly state that a failure is transient (meaning it *should* be retried). Think of it as a way to communicate intent to other developers reading your code, instead of relying on implicit default behavior.

Here's how it affects what happens next:

*   **Opening an order:** The system will automatically retry the order, using the exact same signal, up to a certain number of attempts.  Before retrying, always check if an order with the same ID already exists on the exchange.
*   **Closing an order:** Similar to opening, the system retries closing the position. If it fails too many times, it can force-close the engine, requiring you to reconcile the position on the exchange.
*   **Checking order status:**  Failed pings are tolerated and monitoring continues, up to a limit. If it fails repeatedly, the engine will terminate.

It's important to know that exhausting the retry attempts for `OrderTransientError` isn't just a failure; it's considered fatal for the trading process and will trigger a shutdown. The counters for open and close attempts are stored persistently, so even if the system crashes, the retry attempts are preserved. Using the `isOrderTransientError` and `fromError` methods allows you to reliably identify these errors, even when dealing with potentially duplicated module instances.  During backtesting, these errors don't actually occur, as gates are short-circuited and checks don't run.

## Class OrderRejectedError

This error signals a definitive and unrecoverable rejection of an order by the exchange – it's a situation where retrying the order won’t work. It's specifically thrown within the order execution pathways, like when interacting with a broker or handling order synchronization.

When this error occurs, the system takes immediate action: open orders are dropped, and close orders force-close the position, bypassing retry attempts. The framework ensures that the same rejected signal isn't repeatedly sent to the broker, allowing a new order signal to be generated.

Importantly, it’s reserved for genuine business rejections, such as insufficient liquidity or account restrictions. Network issues or temporary problems should trigger standard error handling, not this specific `OrderRejectedError`.

Throwing this error from the wrong place (like the order validation channel) will degrade it to a transient error. The error's `message` is for informational purposes only, while the key is its unique identifier. It only matters in live environments or when directly mocking order synchronization during testing. Finally, use the static `isOrderRejectedError` method for type checking instead of `instanceof` to ensure compatibility across different module versions.

## Class OrderDeletedError

This error, `OrderDeletedError`, signifies a definitive confirmation from the exchange that an order you're tracking no longer exists – it's been cancelled, liquidated, or removed in some way. It's a strong signal, not a temporary problem.

You should only throw this error within the order checking processes – when verifying active orders or scheduled orders.

When this error is thrown, the framework immediately acts, effectively shutting down a specific operation. If it's an open position, it's closed immediately. If it's a scheduled order, the scheduled signal is cancelled. Importantly, no further attempts are made to confirm the order’s existence.

It’s vital to use this error *only* when the exchange explicitly indicates the order is gone. A filled order or a network error should trigger a different response.

Be careful where you throw it, as using it outside of the designated checks will lead to a different, less drastic handling within the framework.  Recognize it by its unique brand (`__type__ === Symbol.for("OrderDeletedError")`), not with `instanceof`. Finally, remember that order checks don't occur during backtesting, as there's no live exchange involved.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading strategy's progress and events. It’s designed to be flexible, allowing you to easily switch between different notification methods like storing notifications in memory, saving them to a file, or simply ignoring them altogether (using a "dummy" adapter).

You can choose which notification method to use – a simple in-memory one is the default, but you can also persist notifications to disk or use a dummy adapter for testing. The `handleSignal`, `handlePartialProfit`, and similar methods are the main points of contact for sending notifications about various events like signal generation, profit/loss changes, and errors.

The `useNotificationAdapter` function lets you swap out the notification method entirely, and functions like `useDummy`, `useMemory`, and `usePersist` provide convenient shortcuts for common choices.  Remember to call `clear()` if your working directory changes between strategy runs to ensure a fresh notification adapter is used. It’s a central piece for keeping track of what’s happening with your backtest.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, particularly within the backtest framework. It ensures that the strategy, exchange, frame, risk, and action components are all correctly set up before a notification is sent. 

To avoid unnecessary work, the validation process is memoized, meaning it only runs once for each unique combination of strategy, exchange, and frame names. 

You’ll primarily interact with this through `commitSignalNotify()`, which handles the validation, retrieves the signal information, and sends the notification to interested listeners. This is typically done within `onActivePing` callbacks.

The service relies on a number of other services like `loggerService`, `strategySchemaService`, `strategyCoreService`, and `timeMetaService` to function properly.

## Class NotificationBacktestAdapter

The NotificationBacktestAdapter helps manage and send notifications during backtesting, allowing you to customize how and where those notifications are stored. It's designed to be flexible, letting you easily switch between different notification methods like storing notifications in memory, saving them to a file, or simply ignoring them altogether.

You can choose between several built-in notification methods: a default in-memory storage, a persistent storage option for saving to disk, and a dummy option for testing without actually sending notifications.

The adapter provides methods for handling various events during backtesting, such as signals, profits, losses, order confirmations, rejections, and errors. These methods simply pass the event data to the currently selected notification backend.

To switch notification methods, you can use convenient functions like `useMemory`, `usePersist`, or `useDummy`.  You can also define your own notification adapter by using the `useNotificationAdapter` method.  If your working directory changes, calling `clear()` will ensure the adapter rebuilds the notification utilities with the new working directory.

## Class NotificationAdapter

The NotificationAdapter is designed to handle and manage notifications throughout the trading process, both during backtesting and in live trading environments. It automatically keeps track of notifications by listening for signals and provides a single place to access both backtest and live notification data.

To prevent unnecessary or duplicate subscriptions, it uses a "singleshot" mechanism.

You can enable the notification system to start receiving updates, or disable it to stop receiving notifications.

Retrieving stored notifications is straightforward - just specify whether you want backtest or live data.

Finally, you can clear all stored notifications when they're no longer needed, ensuring a clean slate for new data.

## Class MemoryLiveAdapter

This component, the MemoryLiveAdapter, acts as a central hub for managing your trading memory – where you store and retrieve information during live trading. It’s designed to be flexible, letting you easily swap out the underlying storage mechanism.

By default, it uses a persistent storage option that saves data to files, so your memory isn't lost when your application restarts.  However, you can also switch to a purely in-memory storage for quicker access or a dummy storage for testing purposes.

You can interact with the adapter to write data, search, list, remove, and read entries.  It provides convenient methods to switch between different storage backends, such as using local memory, persisting to files, or using a dummy adapter for testing.  

The `disposeSignal` method is important to clean up old data related to signals that are no longer active.  The `clear` method ensures that data caches are refreshed when the working directory changes.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for backtesting. It lets you choose different ways to store and retrieve data, offering options from simple in-memory storage to persistent file-based storage. The default setup keeps everything in memory for speed, but you can easily switch to other storage methods like saving data to disk or using a dummy adapter for testing.

You can think of it like plugging in different types of memory—each with its own characteristics.

Here's a breakdown of what it offers:

*   **Different Storage Options:** It supports several storage backends: a default in-memory solution, a persistent option that saves data to files, and a dummy adapter for testing purposes.
*   **Easy Switching:** Changing the storage backend is as simple as calling a convenience method like `useLocal()`, `usePersist()`, or `useDummy()`.
*   **Efficient Memory Management:** It caches frequently used memory instances to improve performance, and you can manually clear this cache when needed.
*   **Clean-up:**  The `disposeSignal()` method is used to clear out cached data related to a specific signal, ensuring resources are released when signals are cancelled.
*   **Standard Operations:**  It provides standard functions for writing, searching, listing, removing, and reading memory entries.
*   **Customization:** It allows you to provide your own custom memory adapter implementations for more specialized storage needs.



Essentially, it gives you control over how your backtest data is stored and managed, allowing you to optimize for performance, persistence, or testing.

## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing memory storage within the backtest and live trading environments. It intelligently directs operations to either the backtest memory or the live memory based on the provided configuration.

It automatically handles cleanup by subscribing to signal lifecycle events, ensuring that old data is properly removed when signals are closed, which helps prevent issues with outdated information.  A special feature makes sure that subscriptions only happen once.

You can enable or disable the entire memory storage system, and it's perfectly safe to disable it multiple times.  The adapter provides methods to write, search, list, remove, and read memory entries, and these functions automatically route requests to the appropriate environment (backtest or live) based on the provided parameters. This adapter simplifies working with memory data, ensuring it behaves consistently across different environments.

## Class MaxDrawdownUtils

This class offers tools to understand and visualize potential losses during trading, specifically focusing on maximum drawdown. It acts as a central point for accessing information collected about maximum drawdowns.

You can request statistical summaries of drawdown data for a particular trading symbol, strategy, exchange, and timeframe. These summaries give you a quantitative overview of risk.

It's also possible to generate detailed markdown reports that list every instance of maximum drawdown, helping you analyze specific events.

Finally, you can automatically save these markdown reports directly to a file, making it easy to share and archive drawdown information. Think of it as a way to get organized and analyze potential worst-case scenarios for your trading strategies.

## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is designed to track and record instances of maximum drawdown events as they occur during a backtest. It's essentially a system for automatically logging these important performance metrics.

It keeps an eye on a stream of drawdown events and systematically saves each one to a database. This allows for later analysis and review of how the trading strategy performed.

To get it working, you need to tell it to start listening for drawdown events using the `subscribe` method. Once you're done, the `unsubscribe` method stops the service from logging any further data.

The service creates detailed records for each drawdown, including the timestamp, the traded asset (symbol), strategy name, exchange, timeframe, signal information (like position size, price levels, and signal ID), and more. This comprehensive data captures a complete picture of the situation at the time of each drawdown.

To prevent accidental double-logging, the `subscribe` method only registers the service once – subsequent calls return the same function to stop listening.

## Class MaxDrawdownMarkdownService

This service is responsible for creating and saving reports about maximum drawdowns, which represent the biggest peak-to-trough decline during a trading period. It listens for drawdown events and organizes them based on the traded asset, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown events, and when you're finished, you should unsubscribe to stop the data collection.

The service provides several ways to access and utilize the collected data:

*   `getData()` retrieves the raw drawdown statistics.
*   `getReport()` generates a nicely formatted markdown report.
*   `dump()` creates the report and saves it to a file.

Finally, there’s a `clear()` function which allows you to remove all accumulated data, or selectively clear data for specific asset, strategy, exchange, and timeframe combinations. This is useful for managing memory and resetting the analysis.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved. It lets you choose different ways to store your reports, like saving each one as a separate file, combining them into a single JSON file, or even silencing the output completely. 

You can easily switch between these options using functions like `useMd`, `useJsonl`, and `useDummy`.  The system remembers which storage method you're using, ensuring you don't create duplicate files unexpectedly. 

If you need to change how the reports are stored, you can do so using `useMarkdownAdapter`. The `clear` function allows you to reset this storage if your working directory changes, making sure new reports are saved correctly. It intelligently handles the creation and management of storage instances, ensuring only one for each report type throughout your application’s life.

## Class MarkdownUtils

The MarkdownUtils class helps manage how different parts of the backtest-kit framework generate markdown reports. You can use it to turn on or off report generation for things like backtests, live trading, or performance analysis.

The `enable` method lets you choose which services should generate markdown reports. It’s important to remember to use the unsubscribe function it gives you to clean up and prevent issues later.

If you just want to stop generating reports for some services without affecting others, `disable` is your tool. It stops the report generation immediately. 

Finally, `clear` allows you to wipe the data that’s already been collected for a report, essentially giving you a fresh start without stopping the report generation process itself.

## Class MarkdownFolderBase

This adapter lets you generate each report as its own separate markdown file, making it really easy to browse and review your backtest results. It organizes your reports into a directory structure you define, ensuring everything is neatly organized.

You don't have to worry about managing streams of data, as it directly writes the markdown content to a file.  This is a good choice if you want easily readable report directories.

The adapter is initialized very simply, as it doesn’t require any setup before writing. 

To create a report, you provide the markdown content and some options to specify the file path. The adapter handles creating any necessary directories along the way.

## Class MarkdownFileBase

This component handles writing markdown reports as JSONL (JSON Lines) files, designed for efficient centralized logging and easy processing with standard JSON tools. It creates a single JSONL file for each type of markdown report, ensuring append-only writes to prevent data corruption.

The system manages file creation and directory setup automatically, and includes safeguards like a 15-second timeout to prevent write operations from hanging indefinitely. It also provides error handling and supports filtering reports based on criteria like symbol, strategy, exchange, and frame.

You can initialize the adapter to prepare the file and write stream, although this process is designed to happen only once. The `dump` method is used to actually write your markdown content to the file, along with associated metadata like timestamps and filtering tags. This makes it simple to search and analyze reports later on.


## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods without changing your code. 

You can choose to store each markdown file as a separate file, or combine them into a single JSONL file. 

For testing or development, there's even a "dummy" adapter that simply ignores all markdown writes. 

The adapter automatically creates storage instances only when needed, and it remembers those instances so you don't have to create them repeatedly. The adapter uses the constructor you provide, allowing you to customize its behavior further.

## Class MCPValidationService

This service is responsible for ensuring that the Model Context Protocols (MCPs) your system uses are properly set up and compatible. It keeps track of all registered MCPs, making sure each one exists and its underlying strategy is valid whenever they're needed.

Think of it as a gatekeeper for your MCPs – you register them once, and the service prevents you from accidentally registering the same one again. 

Here’s what it does:

*   **Registration:** You tell the service about your MCPs (their names and schemas) when you register them.  It ensures that no two MCPs have the same name.
*   **Validation:**  When your code tries to use an MCP, this service quickly checks if it’s registered and if the strategy it relies on is also valid.  It’s efficient too, checking only once per MCP name.
*   **Listing:**  You can ask the service to show you a list of all the MCPs it's managing. 

Essentially, it's here to prevent errors caused by missing or incorrect MCP setups, making your system more robust.

## Class MCPUtils

This utility class provides ways for a trading agent to interact with and monitor a live trading strategy. It acts as a bridge, translating strategy data into messages the agent can understand and allowing the agent to influence the strategy's actions.

You can request status updates, which give a snapshot of the current portfolio, including prices, profits/losses, and queued orders. It's also possible to view historical trade data, seeing how past trades played out.

The class also lets the agent view messages generated *by* the strategy itself - these can be proactive notifications about potential issues, warnings, or the strategy's rationale behind certain decisions.

For more detailed information, the `getStatus` method provides a portfolio snapshot.

You can manually open or close positions for a symbol, which influences the live trading. You can also add entries to a pending position via an average buy command.

Finally, the agent can trigger a notification for a pending position, which will be visible in the notification history.

## Class MCPSchemaService

The MCPSchemaService acts as a central hub for managing schemas related to Model Context Protocols (MCPs). Think of it as a library where different MCP definitions are stored, making them readily available when needed.

It keeps track of these MCP schemas, associating each one with a unique name. When a new schema is added or an existing one is updated, it performs a quick check to ensure the basic structure is correct.

This service is crucial because other parts of the system, specifically MCPUtils, rely on it to understand and process information related to trading strategies and messages.

Here’s a breakdown of what you can do:

*   **Register:** Add a new MCP schema to the registry, giving it a specific name.  If a schema with that name already exists, it will be replaced.
*   **Override:** Modify parts of an existing MCP schema, allowing for updates and adjustments without completely replacing the original.
*   **Get:** Retrieve a specific MCP schema by its name.



The `loggerService` helps with tracking and debugging, and the `_registry` and `validateShallow` properties handle the storage and validation logic behind the scenes.

## Class LookupUtils

The `LookupUtils` class manages a record of ongoing backtesting and live trading activities. Think of it as a central registry that keeps track of what’s currently running.

Whenever a backtest is started, or a live trading session begins, or a strategy’s steps are executed, a record is added to this registry. When these processes finish, those records are removed.

This registry is accessed through the `Lookup` singleton, and doesn't require any specific setup.

It's used by the system to efficiently manage resources, particularly when dealing with multiple, potentially parallel, processes.

Here's what you can do with `LookupUtils`:

*   **Add an activity:** You register new activities when they start. This lets the system know something is running.
*   **Remove an activity:** You clean up and remove activity records when they finish. It's crucial to do this, even if errors occur.
*   **List activities:** You can get a snapshot of all currently running activities.



The internal `_lookupMap` stores these activity records, keyed by a specific identifier.

## Class LoggerService

The LoggerService helps you keep your logs organized and informative throughout your trading tests. It's designed to automatically add helpful context to your log messages, like which strategy, exchange, or frame is being used, and details about the symbol, time, and whether it's a backtest.

You can provide your own custom logging solution by setting a logger, or the service will use a basic "no-op" logger if you don't.

It gives you convenient methods like `log`, `debug`, `info`, and `warn` to record different levels of messages, all while ensuring consistent context is included.  It utilizes `methodContextService` and `executionContextService` internally to enrich these log messages.  The `setLogger` method allows you to plug in your preferred logging library.

## Class LogAdapter

The `LogAdapter` provides a flexible way to handle logging within your backtesting framework. Think of it as a central hub for all your log messages, allowing you to easily switch between different storage methods like memory, disk persistence, or even completely disabling logging. By default, it stores logs in memory, but you can change this with simple commands like `usePersist` to save logs to a file, or `useDummy` to silence logging altogether.

The `LogAdapter` keeps track of the currently active logging method, and provides methods like `log`, `debug`, `info`, `warn`, and `agent` to categorize your messages.  It uses a clever caching system to efficiently generate log instances, and a `clear` function ensures a fresh start when necessary, particularly useful when the working directory changes during backtesting runs. You can even create your own custom logging implementations by using the `useLogger` method. Finally, `getList` allows you to retrieve all stored log entries.

## Class LiveUtils

This class provides tools for live trading operations, essentially acting as a central hub for managing and monitoring live strategies. It simplifies the process of running live trades and offers features like crash recovery and real-time progress tracking.

Here's a breakdown of what you can do with it:

*   **Run Live Trading:** You can start live trading for a specific symbol and strategy using `run`. This process is designed to be resilient, recovering from crashes and persisting state.  `background` provides a way to run trading without interrupting the main program flow.

*   **Get Signal Information:**  Retrieve pending or scheduled signals using `getPendingSignal` and `getScheduledSignal`.  You can also check if signals exist with `hasNoPendingSignal` and `hasNoScheduledSignal`.

*   **Monitor Position Details:**  Access crucial information about the active position, such as total percentage closed, cost basis, breakeven point, effective entry price, invested units, PnL, entry levels, partial close history, and more, using a suite of `get...` methods.  These methods correctly account for DCA entries.

*   **Control & Modify Strategies:**  Modify the behavior of ongoing strategies.  You can adjust trailing stops and take profits with `commitTrailingStop` and `commitTrailingTake`.  You can also adjust them by price level using cost variants. Manage scheduled signals with `commitCancelScheduled` and `commitActivateScheduled`.

*   **Manage Strategy State:** Pause or resume a strategy’s ability to execute new trades.

*   **Reporting & Debugging:** Generate reports (`getReport`, `dump`) and statistics (`getData`) to analyze performance and troubleshoot issues.



Essentially, this class gives you a robust and convenient way to manage and monitor your live trading strategies, ensuring reliability and providing key insights into their performance.

## Class LiveReportService

LiveReportService helps you keep a detailed record of your trading activity as it happens. It's designed to capture everything from when a signal is idle to when a position is closed, storing all the signal details. Think of it as a live logbook for your trading strategy, allowing for real-time monitoring and later analysis.

It connects to your signal events and systematically records each tick, ensuring no crucial data is missed. You can think of it as a system that takes the information coming from your trading strategy and securely stores it for review.

To use it, you’ll subscribe to the live signal emitter – this function prevents accidental double-subscription. When you’re done, you can unsubscribe to stop receiving those live updates. The service uses a logger to help debug and track its internal workings.


## Class LiveMarkdownService

The LiveMarkdownService is designed to automatically create and save reports about your live trading activity. It keeps track of all the events that happen during trading – when a strategy is idle, when an order is opened, when it's active, and when it's closed.

It listens for updates as your strategies trade and gathers information about each one. This information is then organized into easy-to-read markdown tables, providing a clear overview of your trading performance. The service also calculates key statistics like win rate and average profit and loss (PNL).

Finally, it saves these reports as markdown files in a dedicated directory, making it simple to review your trading history. You can choose to clear the accumulated data at any time, either for a specific trading setup or to wipe everything clean. It's like having an automated trading journal that does all the work for you.

## Class LiveLogicPublicService

LiveLogicPublicService is a tool that manages and orchestrates live trading, simplifying the process by automatically handling context information like the strategy and exchange being used.

Think of it as a wrapper around a more specialized service, designed to make your trading logic cleaner and easier to work with.

It continuously runs a trading process, providing a stream of results—signals to open, close, or cancel trades—that never stops.

The system is built to be resilient; if it crashes, it can recover and resume where it left off by restoring data from storage.

It keeps track of time using the system clock, ensuring real-time accuracy.

You provide the symbol to trade and some basic context information (strategy and exchange names), and it takes care of the rest, making it much easier to run and manage your live trading strategies.


## Class LiveLogicPrivateService

This service handles the ongoing process of live trading, acting as the central coordinator. It continuously monitors the market, checking for new trading signals.

The core functionality revolves around an infinite loop, ensuring that the system never stops watching for opportunities.

Real-time data is incorporated using the current date and time, and results—specifically when trades are opened or closed—are streamed to you as a generator. Any idle or active trades are skipped.

To manage resources effectively, the system uses a memory-efficient streaming approach. If something goes wrong and the system crashes, it's designed to recover and pick up where it left off thanks to the `ClientStrategy.waitForInit()`.  The `run` method is how you kick off the live trading process for a specific symbol, and it delivers a continuous stream of updates.

## Class LiveCommandService

The LiveCommandService is a central point for interacting with live trading features within the backtest-kit framework. It acts as a convenient bridge, providing easy access to live trading operations through dependency injection. 

Several key services are injected and managed within this service, including those for logging, live logic, strategy validation, exchange validation, schema management, risk assessment, and action validation. 

A validation function is available to thoroughly check strategy and risk configurations, ensuring a robust setup. It smartly remembers previous validations to avoid unnecessary checks.

Most importantly, the `run` function orchestrates the live trading process for a given symbol, incorporating contextual information like the strategy and exchange names. This function operates as a continuous, ongoing process with built-in mechanisms to handle potential crashes during live trading.

## Class IntervalUtils

The `IntervalUtils` class helps manage functions that need to run only once during each time interval, like calculating indicators or executing trades. It's designed to prevent repeated calculations or actions within the same interval, which can save resources and improve accuracy.

You can use it in two main ways: in-memory, where the state is held in the program's memory, or persistently, where the information about whether a function has fired is saved to a file. This persistent mode is beneficial because it means your progress isn't lost if the program restarts.

The class uses a special system to ensure each function you wrap gets its own dedicated instance, preventing unexpected behavior when multiple functions are used.  You can explicitly clear out these instances to force a fresh start, especially when the program's working directory changes. Resetting the counter associated with persistent functions helps ensure fresh file-based instances when you switch working directories.

## Class HighestProfitUtils

This class helps you analyze and report on your highest profit trading events. Think of it as a tool for understanding which strategies performed best.

It gathers information about your profitable trades, using data collected from events. 

You can use this class to get detailed statistics about a specific trading strategy and symbol combination.

You can also generate markdown reports, either in memory or saved to a file, providing a summary of your highest profit events, and even customize the columns included in the report. 

It's designed to be easily accessible, as it functions as a singleton, providing a consistent way to access this profit information.

## Class HighestProfitReportService

This service is designed to track and record the highest profit achieved during a trading backtest. It monitors a designated data stream, specifically looking for "highest profit" events.

Whenever a new highest profit record is detected, the service captures all relevant details – including timestamps, symbols, strategy names, exchange information, and specific price levels (open, take profit, and stop loss).

These details are then written to a JSONL report database, allowing for later analysis and review of peak performance.

To begin tracking, you need to subscribe to the data stream. This sets up the monitoring process.  Trying to subscribe more than once won’t cause issues; it just returns the same "unsubscribe" function.

To stop the service and prevent further record logging, you can unsubscribe, which effectively disconnects it from the data stream. If you haven’t subscribed, unsubscribing does nothing.

## Class HighestProfitMarkdownService

This service is designed to automatically generate and store reports detailing the highest profit performance of your trading strategies. It listens for incoming data about those profits and organizes them based on the symbol traded, the strategy used, the exchange involved, and the timeframe analyzed.

You can subscribe to receive updates or unsubscribe to clear everything. Subscribing ensures it starts collecting data, but subsequent subscriptions won't re-subscribe—they'll just return the original unsubscribe function.

The `tick` method handles each incoming piece of profit data, sorting and storing it internally.

You can then request specific reports using `getData` to get the raw statistics, `getReport` to generate a formatted markdown report, or `dump` to save the report directly to a file. The filename format is informative, clearly indicating the symbol, strategy, exchange, timeframe, and whether it was a backtest or live trade.

Finally, `clear` allows you to wipe the stored data – either for a specific strategy setup, or globally to start fresh.

## Class HeatUtils

HeatUtils is a handy tool for visualizing and understanding your portfolio's performance across different strategies. It essentially gathers data about how each individual asset has contributed to your overall strategy results. 

Think of it as a way to quickly see which symbols are performing well and which ones aren't, providing a clear picture of your portfolio’s health.

It aggregates statistics automatically based on your closed trades, making the process simple.

You can retrieve the data, generate a neatly formatted markdown report, or even save that report directly to a file on your computer, all within the same framework. The report shows key metrics like total profit/loss, Sharpe ratio, maximum drawdown, and the number of trades for each symbol, all sorted to highlight the best performers.


## Class HeatReportService

HeatReportService is designed to track and record closed trading signals, specifically focusing on the profit and loss (PNL) data associated with them. Think of it as a system for creating a portfolio-wide "heatmap" to analyze trading performance.

It listens for signal events, but only cares about the signals that have actually closed – it ignores other actions.

The service logs these closed signals to a SQLite database, storing them in a format ready for heatmap generation.

To start receiving these signal events, use the `subscribe` method which returns a function to stop the subscription. 

If you need to stop receiving those signal events, use the `unsubscribe` method. This will stop the service from logging any further closed signals.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance using heatmaps. It listens for trading signals and gathers data across different strategies, exchanges, and timeframes.

It keeps track of statistics for each individual symbol, such as total profit, Sharpe Ratio, and maximum drawdown, as well as portfolio-wide metrics. 

You can subscribe to receive real-time updates and unsubscribe when you no longer need them. The service generates reports in Markdown format, making it easy to share and review your results. It can also save these reports directly to files.

You can clear the accumulated data to start fresh, either for a specific combination of exchange, timeframe, and backtest mode, or for everything. The service handles calculations carefully to avoid errors caused by unusual values. It uses a clever system to manage its data efficiently, making it quick and responsive.

## Class FrameValidationService

This service helps you keep track of your trading timeframes (also known as frames) and makes sure they’re set up correctly. Think of it as a central place to register and verify your different timeframe configurations.

It provides a simple way to add new timeframes, ensuring they are registered within the system. 

Before any operations happen using a specific timeframe, you can use this service to confirm that timeframe actually exists, preventing errors.

To help speed things up, it remembers the results of validations, so it doesn't have to re-check frequently. 

Finally, you can get a list of all your registered timeframes, allowing you to see what's available.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your trading frame schemas, ensuring they're structured correctly. It acts like a central registry where you store and manage these schemas.

You can add new frame schemas using the `register` method, giving each schema a unique name. If a schema already exists, the `override` method lets you update parts of it.

To get a specific schema, simply use the `get` method and provide the schema's name. This service relies on a secure storage system and performs a quick check to confirm a schema has all the essential building blocks before adding it to the registry.

## Class FrameCoreService

This service acts as a central hub for managing and generating timeframes used within the backtesting process. It relies on a connection service to fetch the timeframe data and a validation service to ensure its correctness. Essentially, it provides a consistent way to get the sequence of dates needed to run a backtest. 

The `getTimeframe` method is the key function here – you give it a symbol (like "BTCUSDT") and a timeframe name (like "1h" or "1d"), and it returns a promise that resolves to an array of dates representing the timeframe for that symbol. Think of it as requesting a specific historical dataset for your backtest. 

It's a core, internal component, so you typically won't interact with it directly but will benefit from its functionality through other parts of the framework.


## Class FrameConnectionService

The FrameConnectionService helps manage and efficiently access different backtest frames. It acts as a central hub, directing requests to the correct ClientFrame based on the current context.

Think of it as a smart router, automatically choosing the right frame implementation for your backtesting needs. It also keeps a record of frequently used frames to avoid unnecessary creation, speeding things up.

This service adheres to the IFrame interface, providing a standard way to interact with frames. It’s particularly important for managing the timeframe used in backtests, allowing you to specify a start date, end date, and interval for your analysis.

A key function is the `clear` method which is essential to periodically refresh the timeframe data, preventing stale data from impacting backtest results. This ensures the backtest accurately reflects the latest available market data. The `getTimeframe` method is how you retrieve the start and end dates for a specific symbol and frame.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and make sure your trading exchanges are properly set up. Think of it as a central place to register your exchanges and double-check they're available before your tests or trading runs. 

It allows you to add new exchanges to a registry, so you have a clear list of what you’re working with. You can then validate each exchange to confirm it exists before attempting any operations. 

To avoid repetitive checks, the service remembers the results of validations, speeding up your process. Finally, it provides a way to list all the exchanges you’ve registered, providing a complete view of your configured environments.

## Class ExchangeUtils

The `ExchangeUtils` class provides convenient tools for working with exchange data, acting as a central helper for your backtesting and live trading setups. Think of it as a utility belt for accessing and manipulating information from different exchanges.

It's designed to be easy to use, ensuring you can retrieve things like historical candles, current prices, and order book data.  A key feature is that it handles the complexities of date calculations and formatting, streamlining your development process.

Specifically, you can use it to:

*   Fetch candles (OHLCV data) for a trading pair, automatically figuring out the correct date range.
*   Calculate the average price (VWAP) based on recent trading activity.
*   Get the last close price for a given time interval.
*   Format quantities and prices to match the precise rules of the exchange you're using.
*   Retrieve order book data and aggregated trades.
*   Access raw candle data with custom start and end dates.

The class is set up as a singleton, which means there's only one instance of it available, making it simple to access these helpful functions throughout your code. The `_getInstance` property manages individual instances for each exchange, preventing conflicts and ensuring accurate data.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you manage and keep track of different exchange configurations. It uses a special system to ensure the configurations are handled correctly and consistently. 

You can add new exchange configurations using the `addExchange()`-like `register()` method, and retrieve them later by their name using `get()`.

Before adding a new configuration, it performs a quick check (`validateShallow()`) to make sure it has all the necessary parts and they're in the right format. 

If a configuration already exists, you can update parts of it using `override()`, which combines the existing configuration with your new changes. 

The service relies on a logging system to keep a record of what's happening and ensures the process has context and information.


## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges, ensuring that crucial information like the trading symbol, time, and whether it’s a backtest or live session is always available. It builds upon other services to provide this context.

It handles core exchange operations like retrieving historical and future candles (for backtesting), calculating average prices, and fetching order books and trades.

Validation is a key feature, verifying exchange configurations and caching the results to improve efficiency.

Several utility methods are provided to format prices and quantities appropriately, taking into account the trading context.

Essentially, it simplifies and standardizes how your trading logic interacts with exchange data, always incorporating the necessary environmental details.


## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or order books – to the correct exchange based on the currently selected exchange name. To avoid repeatedly creating connections, it keeps a cache of these connections, improving performance.

It provides methods for getting historical and future candles, calculating average prices (differently depending on whether you're in backtest or live mode), and formatting prices and quantities to match the specific rules of each exchange. You can also retrieve order books and aggregated trade data. This service offers a unified way to access various exchange functions without needing to manage individual connections directly, and logging ensures you can track its actions.

The service relies on other components like `executionContextService`, `exchangeSchemaService`, and `methodContextService` to function correctly, and it uses a `loggerService` for logging operations. The `getExchange` method is key, as it handles retrieving the appropriate exchange connection and caching it for efficiency.

## Class DumpAdapter

The DumpAdapter helps you save information during testing, acting as a central point for different storage options. It automatically manages how data is organized, creating separate storage areas based on the signal and bucket names.

You can choose where the data goes: by default, it writes to Markdown files, but you can also store it in memory, discard it entirely (for testing purposes), or even plug in your own custom storage method.

Before you start saving data, you need to "enable" the adapter, which sets it up to listen for events.  When you’re finished, you can "disable" it.

It provides methods to save various types of data: entire message histories, simple records, tables, raw text, error descriptions, and even complex JSON objects, as well as MCP status snapshots.

You can change the storage backend dynamically – switching between Markdown, memory, a dummy no-op, or a custom implementation – to suit your needs.  Remember to clear the cache if your working directory changes to ensure fresh storage instances are created.

## Class CronUtils

This utility class, `Cron`, helps schedule tasks that run based on candle boundaries during backtesting. It's designed to coordinate tasks across multiple, parallel backtests, ensuring each task runs only once per boundary, even if multiple backtests are hitting that same point in time.

Think of it as a way to ensure that certain actions, like order placement or data processing, happen reliably at specific intervals across different test runs, avoiding conflicts or duplicated work.

Here's a breakdown of how it works and what its parts do:

**How it Manages Tasks**

`Cron` keeps track of registered tasks using internal data structures like `_entries`, `_inFlight`, `_firedOnce`, and `_lastBoundary`. These structures help manage tasks and coordinate their execution, making sure that tasks are executed in the correct order and only once per boundary.

**Key Components and Their Roles**

*   **`_entries`**: This stores the details of each registered task, along with a generation counter to handle updates to the task definitions.
*   **`_inFlight`**: This acts like a "traffic controller," ensuring that only one task runs for a specific boundary at a time. It uses promises to coordinate execution across parallel backtests.
*   **`_firedOnce`**: Tracks which fire-once tasks have already been executed.
*   **`_lastBoundary`**: This remembers the last boundary that was fired for periodic tasks, helping to ensure tasks are triggered only when a new boundary is reached.
*   **`register()`**:  Adds a new task to be executed periodically.
*   **`unregister()`**: Removes a previously registered task.
*   **`clear()`**: Resets fire-once markers, allowing tasks to be run again.

**Important Considerations**

*   **Singleshot Coordination:** This is the core feature - it prevents duplicate task execution across parallel backtests.
*   **Generation Counters:** These are key to safely updating tasks while preventing conflicts from in-flight handlers.
*   **Watermarks:** Used in periodic tasks to correctly fire tasks even when virtual time jumps boundaries.
*   **`dispose()`**: Completely clears all tasks and their settings.

In essence, `Cron` provides a reliable way to schedule and execute tasks during backtesting, ensuring proper synchronization and preventing unexpected behavior when running multiple tests simultaneously.

## Class ConstantUtils

This class provides a set of pre-calculated percentages designed to help manage your trading take-profit and stop-loss levels based on a Kelly Criterion approach with an exponential risk decay. Think of these as checkpoints along your profit and loss journey.

The `TP_LEVEL1`, `TP_LEVEL2`, and `TP_LEVEL3` properties represent different take-profit levels—the first captures a small portion of profit, the second secures a larger amount, and the third closes out almost the entire position. Similarly, `SL_LEVEL1` and `SL_LEVEL2` are stop-loss checkpoints, with the first serving as an early warning sign and the second ensuring a complete exit if things go badly. These values are percentages of the total distance to your target profit or loss, allowing for dynamic adjustment based on the trade’s progress.

## Class ConfigValidationService

The ConfigValidationService helps ensure your trading strategies are set up correctly and have a chance of being profitable. It checks your global configuration parameters to catch potential errors or unrealistic settings. 

It looks at things like slippage, fees, and profit margins to make sure they're all positive values. A key check is that your take-profit distance is large enough to cover the costs of trading, guaranteeing a profit when the target is reached.

The service also verifies the relationships between different parameters, such as ensuring that stop-loss distances are set up logically, and that time-related settings are valid positive numbers. Finally, it makes sure candle-related parameters, like retry counts and thresholds, are reasonable too.


## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It's designed to check your column definitions against a set of rules to prevent errors and inconsistencies.

It verifies that each column has the necessary information: a unique key, a descriptive label, a formatting function, and a visibility function.  It also makes sure the key and label are actually text and that the visibility and format options are functions that can be executed.

Ultimately, this service ensures that your column configurations are consistent and valid, which simplifies troubleshooting and promotes reliability in your application.


## Class ClientSweep

ClientSweep is a powerful tool designed to help you optimize trading strategies. It efficiently tests different parameter combinations for your ideas without the need for repeated backtests. Think of it as a way to quickly identify promising strategies and author parameters before committing to a full backtest.

It works by simulating each of your trading ideas against a grid of potential settings – things like hard stops, trailing take profits, and holding durations.  The system assesses authors independently, ignoring interaction metrics like consensus or voting. This isolated grading ensures a clear ranking based on individual performance.

The process involves several distinct steps: fetching candle data for each idea, training an author ban list to filter out underperforming authors, evaluating all parameter combinations against the data, and finally, ranking the best-performing strategies based on key metrics like Sharpe ratio and total profit.

Importantly, ClientSweep isn't meant to replace a traditional backtest. It's a screening tool to narrow down the most promising candidates. You'll still need to validate those chosen parameters with a full backtest run. The entire process emits callbacks at each step, allowing you to monitor its progress. Remember, each run is independent and doesn't rely on prior states.

## Class ClientSizing

ClientSizing helps you figure out how much to trade based on various strategies. It provides a flexible way to determine position sizes, letting you use methods like fixed percentages, Kelly Criterion, or ATR (Average True Range).

You can set limits on the minimum or maximum position size, and also control the maximum percentage of your capital that can be used for any single trade.

ClientSizing is used behind the scenes when your strategy is running, to decide how much to invest in each trade. It can even be customized with callbacks so you can validate the sizing calculations or log information about them.

It's configured with a set of parameters that dictate how sizing calculations are performed.

The `calculate` method performs the sizing calculation based on the provided parameters and applies any defined constraints to determine the position size.

## Class ClientRisk

ClientRisk helps manage risk across multiple trading strategies, acting as a central control point to prevent exceeding pre-defined limits. Think of it as a safety net for your portfolio.

It prevents signals that violate rules like maximum positions, and allows you to define your own custom validation checks. Because several strategies can use the same ClientRisk instance, it provides a unified view of risk across all strategies. This framework handles these checks *before* positions are opened, preventing unintended consequences.

The constructor sets up the risk parameters. Key properties track active positions, reserved placeholder slots and handle persistence.

The `checkSignal` method validates if a signal is allowed based on risk limits and triggers callbacks. The `checkSignalAndReserve` method offers a concurrency-safe alternative to `checkSignal` ensuring a placeholder slot is reserved to avoid concurrent signals exceeding the limit.

`addSignal` registers when a position is opened and `removeSignal` handles when a position is closed. These actions are typically handled by the StrategyConnectionService. These operations must be paired - either `addSignal` to fully register a position or `removeSignal` to cancel it, preventing persistent issues with reserved positions.

## Class ClientFrame

The ClientFrame is responsible for creating the sequence of timestamps used when running backtests. Think of it as the engine that provides the timeline for your trading simulations. 

It avoids repeating work by caching the generated timestamps, ensuring that the same timeframe isn't calculated multiple times. You can customize the spacing between these timestamps, ranging from one-minute intervals to daily ones. 

It also allows you to add custom checks and record events as it creates the timeline. This component is a core part of how backtests are run, working closely with the BacktestLogicPrivateService.

The `getTimeframe` property is the main way to access this functionality; it generates the time series for a given asset and uses caching to optimize performance.

## Class ClientExchange

This component handles accessing and formatting data from an exchange, which is crucial for backtesting and live trading. It provides methods to retrieve historical and future candle data, calculate the volume-weighted average price (VWAP) – a useful indicator for price trends – and format quantities and prices according to the exchange's specific rules.  It’s designed for efficiency, using prototype functions to minimize memory usage.

Here's a breakdown of what it does:

*   **Candle Data:** You can fetch historical candles (going back in time) and future candles (for simulating forward movement in backtests).
*   **VWAP Calculation:**  It calculates a VWAP based on recent 1-minute candles, which helps in understanding average trading price.
*   **Price & Quantity Formatting:**  It formats the data to match the exchange's specific format for quantities and prices.
*   **Flexible Data Retrieval:** The `getRawCandles` function is highly versatile, letting you fetch data based on specific start/end dates and limits.
*   **Order Book & Trades:** It provides ways to fetch the current order book and aggregated trades.
*   **Look-Ahead Prevention:** The framework is carefully designed to prevent "look-ahead bias," ensuring backtests are accurate by only using available historical data.

## Class ClientAction

The `ClientAction` class is a central component for managing and executing custom logic within your trading strategies. Think of it as a conductor that orchestrates different parts of your strategy’s behavior – from handling signals to managing risk and order synchronization. It's designed to work seamlessly with action handlers, allowing you to plug in your own code for things like logging, notifications, analytics, or even connecting to external services.

Here’s a breakdown of how it works:

*   **Initialization and Lifecycle:** When you set up your strategy, `ClientAction` creates and manages an instance of your action handler, ensuring it's initialized correctly and cleaned up when no longer needed.
*   **Event Routing:** It acts as a dispatcher, forwarding specific events—like signals, breakeven points, or risk rejections—to the appropriate methods within your action handler.
*   **Manual Event Handling:**  You can manually connect specific events to custom logic using `addActionSchema`. This allows for very granular control over how different events are handled.
*   **Specialized Signals:** It handles signals from different environments: backtesting, live trading, and also allows for a distinction between scheduled and active signals.
*   **Order Management:**  It includes methods for synchronizing and checking the status of orders, particularly when using limit orders.

Essentially, `ClientAction` provides a structured way to integrate your custom logic and monitoring into your trading strategies, making your system more flexible, observable, and manageable.

## Class CacheUtils

CacheUtils helps you speed up your trading strategies by automatically caching function results. Think of it like giving your functions a memory so they don't have to recalculate things they’ve already done.

It provides a simple way to wrap functions, making them remember their results based on time intervals, like a 1-minute or 5-minute candle timeframe.

For functions that fetch data from files (like historical data), CacheUtils can also manage that caching, storing the files on disk to avoid repeated downloads. This is particularly useful for things like complex calculations.

It's designed so each function gets its own dedicated cache, keeping everything organized. You can also clear this cache if you need to force a recalculation or if your environment changes. The `dispose` function allows you to remove a specific function's cache. The `clear` and `resetCounter` functions ensure a fresh start when your project setup changes, preventing conflicts.

## Class BrokerBase

This class serves as a base for building connections to exchanges, like Binance or Coinbase. It's designed to simplify automating your trading strategies.

Think of it as a template you extend to create a real-world interface with an exchange. It provides a structured way to handle events like placing orders, cancelling them, managing stop-loss/take-profit levels, tracking positions, and sending notifications.

The framework handles the heavy lifting of logging events and ensuring the broker interface is fully implemented.  You mostly need to customize it with the specifics of the exchange you're using.

**Here's a breakdown of the key functionalities:**

*   **Initialization (`waitForInit`)**: This is where you’ll set up your exchange connection, log in, and configure any necessary API keys. It's called once at the beginning.
*   **Order Management (`onOrderOpenCommit`, `onOrderCloseCommit`)**: These functions control the placement and closing of trades.
*   **Risk Management (`onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`)**: Manage stop-loss and take-profit levels dynamically.
*   **DCA (`onAverageBuyCommit`)**: Handle adding new DCA entries.
*   **Real-Time Updates (`onSignalActivePing`, `onSignalSchedulePing`)**: Receive and respond to real-time data from the exchange.
*   **Lifecycle events**: Functions like `onSignalScheduleOpen` and `onSignalPendingClose` allow you to react to specific moments in the trading process.

The code is designed to be extensible, meaning you can override only the functions you need to customize, and the rest will work out-of-the-box with default logging. Events are logged automatically, helping with debugging and monitoring. Essentially, this provides a solid foundation for integrating any exchange into your automated trading system.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper between your trading logic and the actual broker. It intercepts order-related actions like opening, closing, and checking orders before they're sent to the broker.  Think of it as a transaction controller – if something goes wrong during these actions, the whole operation is rolled back, keeping your system in a consistent state.  When you're backtesting, these broker calls are skipped entirely.

The adapter provides several methods – `commitOrderOpen`, `commitOrderClose`, `commitOrderCheck`, and others – that are automatically called under certain circumstances when the adapter is enabled.  These methods forward information to your registered broker adapter and are essential for real-time trading.

You register your specific broker adapter using `useBrokerAdapter` and then activate the adapter with `enable`.  Don't forget to `disable` when you’re done, or clear the cache with `clear` if needed, to ensure things work as expected. This framework allows you to customize how your trading strategy interacts with a broker.


## Class BreakevenUtils

The BreakevenUtils class is like a helper for understanding and reporting on breakeven events in your trading. It doesn’t store data itself; instead, it pulls information from another service that’s already been collecting it.

You can use it to get statistical summaries of breakeven events, like how many times they’ve occurred.

It also lets you generate detailed reports that show all the relevant information about each breakeven event, presented in an easy-to-read markdown table. This table includes details like the symbol, strategy, signal ID, position, entry price, breakeven price, and when it happened.

Finally, this class provides a simple way to save those reports to a file, so you can review them later. The files are named in a predictable format, combining the symbol and strategy name.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading strategies reach their breakeven point. It's designed to listen for these "breakeven" events – moments when a signal has recovered its initial investment – and record them along with all the details of the signal.

Think of it as a record-keeping system for your trading, especially useful for understanding how quickly and reliably your strategies become profitable.

It uses a logger to give you some debug output for what’s going on. It stores the breakeven events in a database, so you can analyze them later.

To start using this service, you'll need to subscribe to the breakeven signal. This will ensure that you receive and record any breakeven events that occur. To stop receiving these events, you can unsubscribe. The service is designed to prevent accidental duplicate subscriptions.


## Class BreakevenMarkdownService

The BreakevenMarkdownService is designed to automatically generate and save reports about breakeven events for your trading strategies. It listens for these events, keeps track of them for each symbol and strategy you're using, and then turns that data into easy-to-read markdown tables. 

You can subscribe to receive breakeven events, and the service will accumulate them until you’re ready to generate a report.  It can create reports containing detailed information about each event, along with summary statistics. 

These reports are then saved as markdown files, making them accessible and easy to share, typically within a dump/breakeven folder. You have the flexibility to clear out the accumulated data, either for a specific symbol and strategy or to completely wipe the slate clean. The service also provides ways to retrieve data and reports programmatically.

## Class BreakevenGlobalService

This service acts as a central point for tracking breakeven calculations within the system. It’s designed to be easily integrated into the core trading strategy, receiving information and passing it along for processing.

Essentially, it's a middleman that makes sure breakeven operations are logged and handled consistently across the application.

Think of it as a gatekeeper – it validates that strategies and their associated configurations exist before any calculations happen, and it caches these validations to avoid unnecessary checks. It relies on other services, like a logger and a connection service, to do the heavy lifting. 

The service provides two main actions: it can check if a breakeven event should be triggered, and it can clear a previous breakeven state when a signal closes. Both of these actions are carefully logged before being passed on to another part of the system for completion.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It’s designed to efficiently create and maintain these breakeven calculations, avoiding unnecessary duplication by keeping track of them internally.

Essentially, it acts as a central hub for managing breakeven data related to individual trading signals. When you need to check or clear a breakeven, this service handles the details.

Here’s how it works:

*   It creates a unique breakeven tracking object for each trading signal.
*   It remembers these objects (memoizes them) to avoid recreating them repeatedly.
*   It delegates the actual breakeven checking and clearing to these specialized objects.
*   When a trading signal is finished, it cleans up the tracking data.

This service is connected to other parts of the system, receiving information about trading signals and providing updates on breakeven status. It's responsible for handling and coordinating breakeven calculations in a streamlined and organized manner.

## Class BacktestUtils

The `BacktestUtils` class offers convenient shortcuts for running backtests and inspecting their state. Think of it as a central hub for common backtesting actions.

To run a backtest for a specific trading symbol and strategy, you can use the `run` method – it’s like kicking off the process and listening for results. Alternatively, `background` runs a backtest in the background without providing immediate results; ideal when you need to perform actions like logging without interrupting the main process.

Need to peek at the current pending or scheduled signal? Use `getPendingSignal` or `getScheduledSignal` to retrieve that information.  There are also methods for checking specific conditions, like `hasNoPendingSignal` or `hasNoScheduledSignal`, which helps avoid unexpected behavior.

Beyond simple execution, `BacktestUtils` also provides methods for understanding the state of a running backtest: `getTotalPercentClosed`, `getPositionInvestedCost` or `getPositionPnlCost` give you insights into the position's performance.  If you want to know if a position has reached a breakeven point, use `getBreakeven`.

Other handy functions let you get specifics about a running position – like its entry price (`getPositionEffectivePrice`), total units held (`getPositionInvestedCount`), or the list of entry prices for a DCA strategy (`getPositionLevels`).

The class also allows for interactive control: you can stop a backtest (`stop`), adjust trailing stops and take profits (`commitTrailingStop`, `commitTrailingTake`), or even force a signal to be activated early (`commitActivateScheduled`).  You can trigger partial closes to observe results of different settings (`commitPartialProfit`, `commitPartialLoss`) or even commit specific signals (`commitCreateSignal`).


## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It acts like a diligent observer, capturing every significant change in your trading signals – when they’re idle, when they’re opened, active, or closed.

It works by connecting to your backtest and listening for these signal events. Each time a tick occurs, the service logs the full details of the signal.

These logs are then saved to a SQLite database, which allows you to review and debug your strategy's performance after the backtest is complete.

You can use the `subscribe` method to start listening for events, and it ensures you won't accidentally subscribe multiple times.  Remember to use the `unsubscribe` method to stop the service from listening when you're done.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtest results. It keeps track of closed trades for each strategy you're testing, storing this information in a way that's organized and easy to access.

The service works by listening for trade events during your backtest. It then compiles this data into nicely formatted markdown tables, which are saved as reports to a specific directory.

You can request overall statistics for a particular symbol and strategy, or generate a full report with details of each closed signal. The service also lets you clear out old data if you need to.

To use it, you'll subscribe to the backtest signal emitter to receive tick events, and when you're finished, you can unsubscribe to stop receiving those events. The service is designed to ensure you only subscribe once, preventing unexpected behavior.

## Class BacktestLogicPublicService

BacktestLogicPublicService is designed to make running backtests easier by handling the setup of necessary context information. It works closely with a private service, managing details like strategy and exchange names behind the scenes. 

This means you don’t have to manually pass these details around every time you need data – the system takes care of it for you.

Here's a breakdown of what you'll find:

*   **Logger Service:** Provides access to logging and execution contexts.
*   **Private Service:** The core backtesting logic resides within this private service.
*   **Time and Schema Services:** These handle the temporal aspects and structure of data used in the backtest.
*   **Exchange Connection Service:** Manages communication with the exchange.

The key function is `run()`. This method starts the backtest process for a given symbol and automatically applies the pre-configured strategy and exchange context. It provides results as a stream of scheduled, opened, closed, and cancelled strategy results, streamlining the process of analyzing your trading strategy.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService handles the entire process of running a backtest, focusing on efficiency and using an asynchronous generator to deliver results. It begins by obtaining the timeframes for the backtest and then systematically processes each timeframe.

When a trading signal appears, it fetches the necessary historical data (candles) and executes the backtest logic.  The process then intelligently skips ahead to the point where the signal is closed, preventing unnecessary calculations.

The backtest results, specifically signals that have been closed, are streamed out one by one, rather than being stored in a large array – this significantly reduces memory usage.  You have the flexibility to halt the backtest early if needed by simply breaking the generator.

Essentially, this service manages the flow of data and calculations to keep your backtests running smoothly and efficiently, providing you with results as they become available.

It relies on several other services to function, including those for handling strategy core logic, exchange data, timeframes, actions, and price data.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. It's designed to be easily integrated into your application using dependency injection.

Essentially, it provides a simplified way to access and execute backtesting functionality.

Several key services like logging, schema handling, and validation are used internally.

The `validate` function checks your trading strategy and risk settings, remembering previous checks to speed things up.

To perform a backtest, use the `run` function, specifying the symbol you want to test and context details like the strategy, exchange, and frame names being used. This will produce a sequence of results indicating how the strategy would have performed, including opened, closed, canceled, and scheduled orders.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers and make sure they're all set up correctly. Think of it as a central manager for your actions, preventing errors by verifying they exist before your trading strategies try to use them.  It allows you to register new actions, validates that a given action is available, and provides a way to view all the actions you've registered. To improve performance, it remembers the results of validations so it doesn't have to check the same thing repeatedly.  You can add action schemas using `addAction`, confirm their existence with `validate`, and view a complete list with `list`.

## Class ActionSchemaService

The ActionSchemaService helps manage and organize your action schemas, ensuring they're consistent and reliable. It keeps track of all your action schemas, making it easy to find and use them.

It's designed to be type-safe, meaning it helps prevent errors by verifying the structure of your schemas and the methods they use. The service uses a registry to store these schemas and validates them to make sure they meet your requirements. 

You can register new schemas, update existing ones with partial changes, or simply retrieve a schema when you need it. It verifies method names on your action handlers, guaranteeing they align with what's expected. Private methods are also supported, providing flexibility in your implementation. Essentially, it’s a central place to manage and maintain the configuration for your actions.


## Class ActionProxy

ActionProxy acts as a safety net around your custom trading logic, ensuring your backtest or live trading doesn't crash due to errors in your code. It essentially wraps your action handlers – the functions that respond to various events like signal generation, breakeven, or scheduled events – in a `try...catch` block.

If an error occurs within your action handler, ActionProxy catches it, logs it, and reports it, but importantly, the trading process continues uninterrupted. This is crucial for reliability.

You don't directly create instances of ActionProxy; you use `fromInstance()` to create a proxy, providing your action handler implementation and the relevant parameters.

Here's a breakdown of the different events your action handler might respond to:

*   **init():** Runs when the strategy starts, similar to initialization.
*   **signal():** Handles new signals on every tick or candle.
*   **signalLive():** Specifically for live trading signals.
*   **signalBacktest():** For signals during backtesting.
*   **breakevenAvailable():** Triggered when a stop-loss moves to the entry price.
*   **partialProfitAvailable():** Fires when a profit level is reached (e.g., 10%, 20%).
*   **partialLossAvailable():** Triggered when a loss level is reached (e.g., -10%, -20%).
*   **pingScheduled():**  A ping event occurring while a scheduled signal is waiting.
*   **scheduleEvent():** Handles creation and cancellation of scheduled signals.
*   **pendingEvent():**  Handles events related to pending (open) positions.
*   **pingActive():** A ping event occurring with an active (open) position.
*   **pingIdle():** A ping event when no signals are pending or scheduled.
*   **riskRejection():**  Happens when a signal is rejected by risk management.
*   **dispose():**  Cleans up when the strategy finishes.

There are two specific methods, `orderSync` and `orderCheck`, that are *not* wrapped in error handling. They directly pass any exceptions to other functions, used for order synchronization and checks.

Essentially, ActionProxy provides a robust and error-resistant way to integrate your custom trading logic into the framework, promoting stability and preventing unexpected crashes.

## Class ActionCoreService

The ActionCoreService is a central component that manages how your trading strategies interact with various actions. It's like a traffic controller, ensuring actions are executed in the right order and with the correct context. 

Here's a breakdown of what it does:

*   **Action Dispatching:** It automatically handles the actions defined in your strategy's configuration, making sure they’re executed properly.
*   **Validation:** Before anything happens, it checks to make sure everything is set up correctly – strategy names, exchange details, and the actions themselves. It avoids repeated validation by caching results.
*   **Lifecycle Events:** It routes various events (like signals, breakeven points, and scheduled tasks) to the appropriate actions, ensuring timely responses to different situations. Events include: signal, signalLive, signalBacktest, breakevenAvailable, partialProfitAvailable, partialLossAvailable, pingScheduled, scheduleEvent, pendingEvent, pingActive, pingIdle, riskRejection, orderSync, orderCheck.
*   **Initialization and Cleanup:** It initializes actions when a strategy starts, loading any necessary state, and cleans them up when a strategy finishes. 
*   **Order Synchronization:** It provides mechanisms to synchronize and check orders across different actions, crucial for coordinated trading.
*   **Data Clearing:** It offers a way to clear out all the action data, either for a specific action or for all strategies.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions within your trading strategies. It ensures that requests for actions, like sending signals or handling events, are routed to the correct implementation based on the action's name and the specific strategy and frame being used. To optimize performance, it caches these action implementations, so frequently used actions don't need to be recreated repeatedly.

This service depends on other services to manage logging, schemas, and strategy execution. It provides various methods for handling different types of events, including signal updates, breakeven calculations, partial profit/loss adjustments, scheduled pings, and order synchronization. These methods route the events to the appropriate action handler. Finally, it allows you to manually clear the cached action implementations when necessary, ensuring a clean slate for new strategy executions.

## Class ActionBase

This `ActionBase` class is your foundation for creating custom actions within the backtest framework. Think of it as a template – you extend it to handle things like sending notifications, logging data, or triggering custom logic based on your strategy's signals. It provides default logging for almost every event, saving you from writing repetitive code.

The constructor sets up the basics: the strategy's name, the timeframe it's running on, the action's name, and whether it's a backtest or live run.

The `init` method is for one-time setup, like connecting to databases or APIs. 

There are several event methods like `signal`, `signalLive`, and `signalBacktest`, each handling events specific to live trading, backtesting, or both. These events cover a wide range of situations:

*   `breakevenAvailable`: When your stop-loss moves to the entry price.
*   `partialProfitAvailable`: When you reach profit milestones (10%, 20%).
*   `partialLossAvailable`: When you hit loss milestones (-10%, -20%).
*   `pingScheduled`, `pingActive`, `pingIdle`: These monitor the state of your strategy (waiting, running, idle).
*   `riskRejection`:  When a signal is blocked by risk management.

Finally, `dispose` provides a clean-up opportunity when the action is no longer needed, such as closing connections or releasing resources. Remember that methods dealing with order gates are deprecated, so avoid explicitly implementing them.
