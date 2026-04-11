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

The WalkerValidationService helps you keep track of and make sure your parameter sweep configurations – we call them walkers – are set up correctly. It's like a central place to register your walkers, ensuring they exist before you try to use them in your backtesting process.

It manages a collection of these walker configurations, letting you add new ones. 

Before any backtesting runs, it can validate that the walkers you're using are actually registered, preventing errors.

To speed things up, the service remembers previous validation results, so it doesn't have to repeat the checks unnecessarily.

Finally, you can get a list of all the walkers currently registered in the service.

## Class WalkerUtils

WalkerUtils simplifies running and managing your trading walkers, providing a convenient way to interact with them. It acts as a central hub for controlling walkers, automatically handling details like retrieving the walker’s name and associated exchange.

Think of it as a tool for orchestrating your walkers—it keeps track of them and lets you easily start, stop, and gather information about them.

Here’s a quick look at what you can do:

*   **Run walkers:** You can run a walker for a specific trading symbol and provide additional context.
*   **Run walkers in the background:** If you just want a walker to do something like log progress or trigger callbacks, you can run it in the background without constantly checking its status.
*   **Stop walkers:** This halts a walker's strategies from generating new trading signals, ensuring it doesn't continue making new recommendations. It’s a clean way to pause a walker’s activity.
*   **Get results:** Retrieve comprehensive results from all strategy comparisons run by the walker.
*   **Generate reports:** Create formatted markdown reports summarizing the walker's performance.
*   **Save reports:**  Save those generated reports directly to your disk.
*   **List walkers:**  View a list of all active walker instances, including their status.

WalkerUtils uses a singleton pattern, meaning you’ll always be interacting with the same instance, simplifying access across your application. It ensures that each symbol and walker combination gets its own isolated instance, so walkers don’t interfere with each other.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema definitions, ensuring they're consistent and well-managed. It uses a special system to store these schemas in a way that prevents errors due to incorrect data types.

You can add new schemas using the `addWalker()` function (or more formally, the `register` property), and then find them later by their name with the `get` function.  Before adding a new schema, you can use `validateShallow` to quickly check if it has all the necessary parts. If you need to update an existing schema, `override` lets you modify just the pieces that need changing, rather than the entire definition. The service also has built-in logging for tracking and debugging.

## Class WalkerReportService

The WalkerReportService helps you keep track of your trading strategy optimization progress. It’s designed to automatically record results as your strategies are tested and refined.

Think of it as a digital notebook that captures important data like performance metrics and statistics for each test run. It monitors the optimization process and remembers the best-performing strategies found so far.

To use it, you’ll connect it to your optimization system, and it will silently log events. 

It provides a way to subscribe to the optimization process, but cleverly prevents you from accidentally subscribing multiple times, ensuring clean data. You can also easily unsubscribe when you're finished.

## Class WalkerMarkdownService

This service helps automatically create and save reports about your trading strategies as they’re being tested. It listens for updates from your trading simulations (walkers) and carefully organizes the results.

It uses a clever system to store results for each walker separately, ensuring each one’s performance is tracked independently.

The service then transforms these results into nicely formatted markdown tables, making it easy to compare how different strategies are performing.

Finally, it saves these reports directly to your disk, so you can review them later - these files will be in a `logs/walker/{walkerName}.md` directory.

You can subscribe to receive these updates as the walker runs and unsubscribe when it's complete.  You can also clear out all the accumulated data when you’re finished with a test run or just for a specific walker. Retrieving and generating reports is simple, allowing you to quickly check on the progress of your strategies.

## Class WalkerLogicPublicService

This service helps manage and run walkers, which are essentially automated trading strategies, within the backtest-kit framework. It simplifies things by automatically passing along important information like the strategy name, exchange, and frame to each walker.

Think of it as a coordinator that handles the behind-the-scenes details so you can focus on defining your trading strategies.

It relies on two other components: a private walker logic service and a schema service.

The core function, `run`, lets you specify a symbol (like a stock ticker) and a context object. It then executes all the strategies associated with that symbol, automatically managing the context for each strategy. This function returns an asynchronous generator, allowing you to process the results of each walker one at a time.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService manages the process of comparing different trading strategies. Think of it as an orchestrator that runs each strategy one after the other and keeps track of their performance.

It provides updates as each strategy finishes, allowing you to monitor the progress in real-time. It also identifies the best-performing strategy as the tests proceed.

At the end of the process, you’ll receive a complete report ranking all the strategies based on the specified metric, using the BacktestLogicPublicService to execute each strategy. It also leverages other services for logging, Markdown formatting, and schema management.

To use it, you provide a symbol, an array of strategy names, a metric to optimize for, and some context information regarding the exchange, frame, and walker being used.


## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with the walker functionality within the backtest-kit framework. Think of it as a helper that makes it easier to use the underlying walker logic.

It provides a consistent way to access various services needed for running and validating walkers, including things like logging, schema management, and validation of strategies, exchanges, and the overall framework structure.

The `run` method is its main function: it allows you to execute a walker comparison for a specific trading symbol, while also ensuring that context like the walker's name, the exchange, and the frame are correctly passed along. This provides a streamlined way to test and compare different walker configurations.


## Class TimeMetaService

The TimeMetaService helps you keep track of when candles happen for your trading strategies. It stores the latest timestamp for each combination of symbol, strategy, exchange, and timeframe.

Essentially, it provides a reliable way to get the current candle time even when you're not actively running a strategy tick, like when a command needs to be executed between ticks.

It works by maintaining a record of timestamps, updating them automatically with information from the strategy. If a timestamp hasn’t been received yet, it will wait a short period to see if one arrives.

You can clear these timestamp records to free up memory, either for all combinations or just for a specific one – this is particularly useful when starting a new backtest or live trading session. The service uses a memoized system, meaning it caches these timestamps for quick access.

## Class SyncUtils

SyncUtils provides tools to analyze and report on signal synchronization events that happen during trading. It gathers information from signal openings and closings, letting you see how your strategies are performing.

You can use it to get aggregated statistics like the total number of signals opened and closed, or to generate detailed markdown reports. These reports include tables showing key details for each signal, such as direction, prices, profit/loss, and reasons for closure.

Finally, SyncUtils can create these reports and save them as files, helping you to keep track of your trading activity and easily share it with others. The file names clearly indicate the symbol, strategy, exchange, frame, and whether it's a backtest or live run.

## Class SyncReportService

This service, `SyncReportService`, is designed to keep track of what's happening with your trading signals, specifically when they're created and closed. It listens for these events and records them in a detailed report, making it easier to audit and understand your trading activity.

Think of it as a dedicated log for your signal lifecycle.

It focuses on two key moments: when a signal is first activated (like a limit order being filled) and when it’s closed out (a position being exited). For each event, it saves important information like the signal's details and, when closing, how much profit or loss was made and why the position was closed.

You can start this process by using the `subscribe` function to tell it what to listen for and then stop it with `unsubscribe` when it's no longer needed. The `tick` property handles the actual processing of events, and `loggerService` is there to assist with some output. It ensures you only subscribe once to avoid problems.

## Class SyncMarkdownService

This service is designed to automatically create and save reports detailing signal synchronization events. It listens for signal opening and closing events, meticulously tracks them, and then presents this information in a clear, easy-to-read Markdown format.

You can think of it as a record-keeper for your trading signals, documenting their lifecycle.

Here's a breakdown of what it does and how it works:

*   **Event Tracking:** It tracks all signal synchronization events related to a specific symbol, trading strategy, exchange, and timeframe (backtest or live).
*   **Markdown Reporting:** It automatically compiles these events into well-formatted Markdown tables, making it simple to understand the sequence and details of each signal.
*   **Statistics:** The reports include summary statistics, like the total number of signals, the number of opens, and the number of closes.
*   **Storage:** The reports are saved to disk, organized by symbol, strategy, exchange, and timeframe.
*   **Subscription:** To start receiving and processing events, you need to subscribe.  The subscription is managed to prevent multiple registrations.  Unsubscribing will stop the service and clear all stored data.
*   **Data Retrieval:** You can request the accumulated data or a generated report for specific combinations of symbol, strategy, exchange, and timeframe.
*   **Data Clearing:**  You have the flexibility to clear either a specific set of data (identified by symbol, strategy, etc.) or to completely clear all stored data.



It’s particularly useful for analyzing the performance and behavior of your trading strategies over time.

## Class StrategyValidationService

This service helps you keep track of and make sure your trading strategies are set up correctly. It acts like a central hub for all your strategies, allowing you to register new ones and quickly check if they exist before you use them.

It also verifies that any risk profiles or actions linked to your strategies are also valid. To make things faster, it remembers the results of previous validations, so it doesn’t have to re-check everything every time.

You can easily add new strategies using `addStrategy()`, see if a strategy is valid with `validate()`, and get a full list of registered strategies with `list()`. The service relies on other services like `riskValidationService` and `actionValidationService` to perform specific checks and has a `loggerService` for logging information.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's a tool for gathering and presenting data about your strategy’s activity, like when it took profits, canceled orders, or set stop-loss points.

You can use it to get a statistical overview of your strategy’s actions, giving you insight into its behavior. It also lets you create detailed reports, formatted as readable Markdown documents, that show individual events and summarize key statistics. 

Finally, you can easily save these reports as files, with organized filenames that include the symbol, strategy name, exchange, frame, and timestamp for easy tracking. Think of it as a central place to collect and share reports about your trading strategy's performance.


## Class StrategySchemaService

This service acts as a central place to store and manage information about different trading strategies, ensuring they are consistent and well-defined. It uses a special system for keeping track of these strategies in a way that prevents errors.

You can add new strategies using the `addStrategy()` function (represented by `register`).
To get a strategy's details later, you can use its name to retrieve it using the `get` function.

Before adding a strategy, a quick check (`validateShallow`) makes sure it has all the necessary information in the correct format.

If you need to update a strategy that already exists, the `override` function lets you modify specific parts of it. 

The service also has an internal logger and registry to keep everything organized.

## Class StrategyReportService

This service is responsible for keeping a detailed record of what your trading strategies are doing, specifically for auditing and review purposes. Think of it as a digital logbook for your strategies.

To start using it, you need to "subscribe" to its logging capabilities. Once subscribed, every time your strategy performs actions like cancelling a scheduled order, closing a pending order, taking partial profits or losses, adjusting stop-loss or take-profit levels, or moving to breakeven, this service will write down the details of that event in a separate JSON file.

Unlike other reporting features that might hold everything in memory temporarily, this service writes each event immediately to disk, so you always have a reliable record. When you’re done, you'll "unsubscribe" to stop the logging. This is helpful to ensure you're not generating unnecessary files and impacting performance. It provides a structured way to track and analyze your strategies' behavior over time.

## Class StrategyMarkdownService

This service helps you track and understand what your trading strategies are doing during backtests. It collects information about various strategy actions – like canceling orders, closing positions, taking profits, and setting stop-loss levels – and organizes them. Think of it as a detailed logbook for your strategy's behavior.

Instead of writing each event immediately to a file, it holds onto them temporarily, which makes creating summary reports much faster. You can then use this service to generate reports in a readable Markdown format, which can then be saved to a file.

To start using it, you need to "subscribe" to the service to enable data collection. Events are then collected automatically as your strategy runs. Once you've gathered the data you need, you can retrieve statistics, generate a report, or export everything to a file. When you're finished, you "unsubscribe" to stop the collection and clean up the collected data.

The service offers functions for viewing accumulated data, generating formatted reports (that you can save as files), and selectively or completely clearing the stored data. It keeps track of these events grouped by symbol, strategy name, exchange, and backtest frame, allowing you to analyze specific parts of your strategy’s performance in detail.

## Class StrategyCoreService

StrategyCoreService acts as a central hub for managing and interacting with trading strategies, handling things like validation, signal retrieval, and position calculations. It simplifies operations by automatically injecting relevant context (like symbol, timeframe, and backtest mode) into various processes.

This service is heavily used internally by other core logic components.

**Key Capabilities:**

*   **Validation:** It thoroughly checks strategy configurations and associated risk settings. Validation is cached for efficiency.
*   **Signal Management:** It provides methods to retrieve pending and scheduled signals, crucial for monitoring TP/SL and time expirations.
*   **Position Analysis:**  It offers detailed insights into open positions, including:
    *   Total percentage of the position held.
    *   Cost basis, and effective (DCA-averaged) entry price.
    *   Unrealized PnL in percentage and dollar amounts.
    *   Complete history of entry prices and partial close events.
*   **State Management:** It includes functions for stopping strategies, canceling scheduled signals, and closing positions.
*   **Backtesting Support:** It offers tools for running fast backtests against historical data.
*   **Data Retrieval:** Offers advanced positional information like highest profit/loss prices, timestamps, percentages and cost for an existing position.

Essentially, StrategyCoreService provides a consistent and reliable way to manage and query the state of trading strategies and their associated positions, streamlining development and ensuring data integrity.


## Class StrategyConnectionService

This class, `StrategyConnectionService`, acts as a central router for strategy operations within the backtesting framework. It manages and connects the various components needed for running trading strategies.

Essentially, it ensures that requests to execute trading strategies (like buying, selling, setting stop-loss orders) are directed to the correct strategy implementation, taking into account factors like the trading symbol and the specific strategy being used.

Here's a breakdown of what it does:

*   **Routes strategy calls:** It handles calls to strategy methods and forwards them to the correct `ClientStrategy` instance based on the symbol and strategy name.
*   **Memoization:** It optimizes performance by caching the `ClientStrategy` instances, so they aren't repeatedly created. This speeds up the backtesting process.
*   **Manages Initialization:** It ensures that strategies are initialized properly before any trading actions are taken.
*   **Handles Live and Backtest Operations:**  It supports both real-time trading (`tick`) and historical data backtesting (`backtest`).
*   **Provides data retrieval methods:** Offers various functions to get information about the position, such as current price, cost basis, percentage closed, and more, accounting for DCA entries and partial closures.
*   **Manages Signals:** Has methods to check for pending or scheduled signals, activate scheduled signals, or close pending positions.
*   **Includes various services:** It utilizes different services like `RiskConnectionService`, `ExchangeConnectionService`, and `TimeMetaService` to handle specific functionalities related to risk management, exchange interactions, and time-series data.
*   **Validation methods:** Provides functionalities to validate certain actions, such as partial profit or average buy, before executing them.

## Class StorageLiveAdapter

The `StorageLiveAdapter` is a flexible way to manage how your trading signals are stored. It acts as a bridge, allowing you to easily switch between different storage methods like persistent storage on disk, in-memory storage, or even a dummy storage for testing.

Think of it as a central hub; it handles events like signals being opened, closed, scheduled, or cancelled, and then passes those actions along to the currently selected storage method.

You can choose your storage method by using functions like `usePersist` (for persistent storage – the default), `useMemory` (for storing signals only in memory), or `useDummy` (which effectively does nothing, useful for testing).  There's also `useStorageAdapter` if you want to completely customize the storage backend.

The adapter keeps track of when signals are pinged or scheduled, updating their timestamps. It provides methods to find signals by ID or list all of them, and also includes a `clear` function to reset everything back to the default persistent storage when needed, particularly when the working directory changes.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how backtest signals are stored. It acts as a bridge between your backtesting logic and the actual storage mechanism, allowing you to easily switch between different storage options like persistent storage on disk, in-memory storage, or even a dummy adapter for testing. 

You can choose which storage type to use with handy shortcuts like `usePersist()`, `useMemory()`, and `useDummy()`. This lets you quickly change how data is saved without altering the core backtesting code.

The adapter handles events related to signals – when they’re opened, closed, scheduled, or cancelled – and provides methods for finding signals by their ID or listing all signals. It also keeps track of updates to signals with `handleActivePing` and `handleSchedulePing`. 

The `useStorageAdapter` method gives you even more control by letting you provide your own custom storage adapter. Finally, the `clear` method is vital when the working directory changes during a backtest so it can reset to default adapter.

## Class StorageAdapter

The StorageAdapter is your central hub for managing both historical (backtest) and current (live) trading signals. It automatically keeps track of signals as they come in, ensuring they're stored correctly.

Think of it as a smart listener; it connects to the parts of your system that generate trading signals and saves those signals for you.

You can easily retrieve signals by their ID, or pull lists of all backtest signals or all live signals.

It's designed to be reliable too, preventing it from accidentally subscribing multiple times and providing a simple way to stop the storage process when it's no longer needed.

## Class SizingValidationService

This service helps you keep track of and double-check your position sizing setups. It acts like a central hub for all your sizing strategies, making sure they’re properly registered before you use them. 

Think of it as a way to avoid errors and improve performance – it remembers which sizing strategies you've added and caches validation results to make things faster.

Here’s what you can do:

*   Add new sizing strategies using `addSizing`.
*   Verify a sizing strategy exists using `validate`.
*   Get a complete list of all registered strategies with `list`.

Essentially, it helps organize and ensure the reliability of your sizing configurations within the backtest-kit framework.

## Class SizingSchemaService

This service manages a collection of sizing schemas, ensuring they're stored and accessed in a type-safe manner. It leverages a registry to keep track of these schemas.

You can add new sizing schemas using the `register` method, and update existing ones with `override`. 

To get a specific sizing schema, simply use the `get` method, providing the schema’s name.

Before a sizing schema is added, it's checked using `validateShallow` to make sure it has the necessary properties and types. 

The `loggerService` allows you to easily track and debug what’s happening within the service.

## Class SizingGlobalService

The SizingGlobalService is a central component for determining how much to trade in each operation. It's essentially a manager that uses other services to figure out the right position size. 

Think of it as the brains behind the sizing decisions – it takes in details like risk parameters and then figures out the appropriate size. 

It’s a global service, meaning it’s accessible throughout the backtest-kit system. The service relies on connections and validation services for its calculations.

The `calculate` function is the core of this service. It takes parameters, like how much risk you want to take, and a context to identify the sizing operation, and then it returns the calculated position size.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategies determine position sizes. It acts as a central point for routing sizing calculations to the correct implementation. 

Essentially, it takes a sizing name as input and finds the right sizing logic to use. To make things faster, it remembers (caches) the sizing implementations it’s already used, so it doesn’t have to recreate them every time.

When a sizing name isn't provided – typically for strategies that don't have custom sizing rules – the service will use a default behavior. This service is key for calculating the appropriate position size considering factors like risk management and various sizing techniques like percentage-based or Kelly Criterion methods.


## Class ScheduleUtils

This class helps you easily analyze and report on scheduled trading signals. It acts as a central point for managing and understanding how signals are being processed and delivered. 

You can use it to gather statistics about signals for a specific trading strategy and symbol, like how many are queued or cancelled. 

The class also provides a handy way to generate clear, readable markdown reports detailing the signal schedule. You can save these reports to a file for later review. Think of it as a tool to monitor and improve the reliability of your signal delivery.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals behave over time, specifically for analyzing situations where orders might be delayed. It essentially listens for events related to your scheduled signals—when they're initially scheduled, when they transition to an 'open' state, and when they are cancelled. 

The service automatically calculates how long it takes from the moment a signal is scheduled until it’s either executed or canceled. This information is then carefully recorded in a database, allowing for later investigation of delays and potential adjustments to your strategies.

You can start receiving these signal events by using the `subscribe` function; it will give you a function to stop listening. The `unsubscribe` function cleans things up and stops the service from tracking signal events. It’s designed to prevent accidental duplicate subscriptions, ensuring accurate and reliable data collection. 


## Class ScheduleMarkdownService

The ScheduleMarkdownService keeps track of scheduled and cancelled trading signals, specifically focusing on how often signals are scheduled and then cancelled. It's designed to create readable reports detailing this information for each strategy you're using.

It listens for signal events, then organizes them by strategy, creating markdown tables to summarize what's happening. You'll find statistics like cancellation rates and average wait times in these reports. These reports are automatically saved to disk, providing a record of signal behavior.

You can subscribe to receive these events, and then unsubscribe when you no longer need to monitor them. You can also request data or reports for specific symbol-strategy combinations, or clear all stored data if you need to start fresh. The service isolates its data storage for each unique combination of symbol, strategy, exchange, frame, and backtest to keep everything organized.

## Class RiskValidationService

This service helps you keep track of and double-check your risk management setups. Think of it as a central place to register all your risk profiles, like different strategies for handling potential losses. 

Before your trading system tries to use a risk profile, this service makes sure it actually exists, preventing errors and unexpected behavior. 

It’s designed to be efficient too; once a risk profile is validated, the service remembers the result so it doesn't have to re-check it every time. 

You can add new risk profiles, validate their existence, or view a complete list of all the risk profiles you've registered. This makes managing your risk configurations much easier and more reliable.

## Class RiskUtils

RiskUtils helps you understand and analyze risk rejection events within your trading system. It acts as a central place to gather information about rejected trades, providing both statistical summaries and detailed reports. You can use it to see how many rejections occurred, broken down by symbol, strategy, and other factors.

It creates reports that show each rejection event, including details like the symbol, strategy, position, price, and the reason for the rejection.

You can generate these reports in markdown format, which can then be saved to a file for later review or sharing. The file names are automatically created based on the symbol and strategy being used. This allows for easy organization and tracking of risk rejection events across different trading setups.


## Class RiskSchemaService

The RiskSchemaService helps you manage a collection of risk schemas, ensuring they are consistently structured and available for use. It uses a special system for type safety, making sure the schemas conform to expected formats.

You can add new risk schemas using the `addRisk()` function (represented here as `register`), and retrieve existing ones by their names using the `get()` method.

Before a new schema is added, it’s checked to make sure it has all the necessary components—this is done by the `validateShallow()` function.

If you need to update a risk schema that's already registered, the `override()` function allows you to make partial changes without replacing the entire schema.

The service also includes logging capabilities managed by the `loggerService` property, which provides context information related to operations. The underlying storage is handled by the `_registry` property, however, direct interaction with it is discouraged.

## Class RiskReportService

This service helps track why trades are being rejected by your risk management system. It acts like a digital notebook, recording every time a signal is blocked.

Think of it as a way to analyze and audit your risk decisions. 

The service listens for these rejection events and neatly stores them in a database, complete with the reason for the rejection and details about the signal that was blocked.

You can easily sign up to receive these rejection notices, and just as easily stop when you no longer need them, ensuring you don’t accidentally subscribe multiple times. 

It’s designed to be straightforward to set up and use, providing valuable insight into your risk management processes.


## Class RiskMarkdownService

The RiskMarkdownService helps you create and save detailed reports about rejected trades due to risk management. It keeps track of every rejection event related to a specific symbol and trading strategy.

It listens for these rejection events and organizes them, then generates easy-to-read markdown tables filled with rejection details. You’ll also get summary statistics like the total number of rejections and breakdowns by symbol and strategy.

These reports are automatically saved to a designated directory, making it simple to review and analyze your risk management performance.

You can subscribe to receive these events and later unsubscribe when you no longer need them. Functions are also available to retrieve data and reports, dump reports to disk, and clear out the accumulated data. The service uses a unique storage area for each symbol, strategy, exchange, frame, and backtest combination to keep everything organized.

## Class RiskGlobalService

RiskGlobalService is a central component for managing and validating risk during trading. It acts as a go-between, utilizing a RiskConnectionService to ensure that trading activities comply with defined risk limits.

It keeps track of validations to prevent repeated checks and provides detailed logging of these validation processes.

You can use it to check if a trading signal is permissible based on existing risk parameters. 

The service also facilitates registering and removing trading signals, keeping a record of open and closed positions. 

Finally, it includes a way to clear out all recorded risk data or selectively clear data associated with a specific risk setup.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks and signal validation within the trading framework. It intelligently directs risk-related operations to the correct risk management implementation based on a risk name, ensuring that the right rules are applied in each scenario. To boost efficiency, it remembers previously retrieved risk management instances, avoiding redundant calculations.

It’s designed to handle the intricacies of risk management, incorporating features like validating portfolio drawdown, exposure limits, position counts, and daily loss thresholds. The service is also responsible for tracking opened and closed signals, communicating rejections when limits are breached. 

The service relies on injected components for logging, schema management, and action execution. The `getRisk` method is key – it obtains the appropriate risk management instance, creating it if it doesn’t already exist and caching it for later use. Finally, the `clear` function allows for the deliberate removal of cached risk management instances, enabling refreshes when needed. Strategies that don’t require specific risk configurations can use an empty string as the risk name.

## Class ReportWriterAdapter

This framework provides a flexible way to store and manage data generated during trading backtests and live trading. It uses an adapter pattern, allowing you to easily swap out different storage methods without changing the core backtest-kit code.

The system remembers the storage instances it creates, ensuring that you only have one storage location for each type of report (like backtest results or live trading events).  By default, it stores data in JSONL files.

You can customize the storage mechanism by providing your own adapter.  The `useReportAdapter` method lets you specify a different way to store reports.

If you need to temporarily disable data storage, the `useDummy` method will prevent anything from being written to storage.  Conversely, `useJsonl` resets the system to its default JSONL storage behavior.

The `writeData` function handles actually writing the data to storage, and it automatically sets up the storage if it doesn't already exist.  Finally, if you change your working directory, you should call `clear` to force the system to re-initialize the storage.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework are logging data. It’s designed to be used by other classes, like ReportAdapter, to add more specific reporting capabilities.

You can use `enable` to turn on logging for services like backtesting, live trading, or strategy execution. When you enable services, they'll start recording data in real-time to JSONL files. It's crucial to remember to clean up after yourself; the `enable` function returns a special "unsubscribe" function you *must* call later to prevent memory problems.

Conversely, `disable` lets you stop logging for certain services without affecting others. This is useful if you want to focus on specific data or reduce logging overhead.  Unlike `enable`, `disable` doesn't require a separate cleanup step; it immediately stops logging for the specified services.

## Class ReportBase

This class helps you record trading events, like order executions or strategy updates, in a structured way. It writes each event as a single line in a JSON file, making it easy to later analyze your trading history. The system is designed to handle large amounts of data efficiently and reliably, ensuring that events are written even if things get busy.

The files are organized in a standard location, and the class automatically creates the necessary folders if they don't exist. You can also specify extra information (metadata) with each event, like the trading symbol or strategy used, to make searching and filtering easier.

The class includes built-in safeguards to prevent writing problems, such as handling backpressure and implementing a timeout mechanism to prevent operations from taking too long. It’s initialized once and then ready to use, and the initialization process is handled automatically. You simply provide the data for each event, and the class takes care of writing it to the file along with the relevant information and a timestamp.

## Class ReportAdapter

The `ReportAdapter` helps you manage how trading data is saved and analyzed. Think of it as a flexible system for storing your backtesting results.

It lets you easily change where and how those results are saved, using different storage methods. To make things efficient, it remembers the storage setup for each type of report, so it doesn't have to be reconfigured repeatedly.

By default, it stores data in JSONL files, which is a common format for this kind of data. If you want to test something without actually saving anything, you can switch to a "dummy" adapter that discards all writes.

You can also change the default storage method, allowing different parts of your system to use different storage options. If your working directory changes, clearing the cache ensures that new storage instances are created correctly to account for the updated base path.

## Class PriceMetaService

PriceMetaService helps you get the most recent market price for a particular trading setup. It keeps track of prices for each symbol, strategy, exchange, frame, and whether you're in a backtest or live environment. Think of it as a central place to get the current price, especially when you need it outside of the normal trading execution flow.

It stores these prices in a way that lets you access them quickly and reliably. If a price hasn’t been received yet, it will wait briefly to get it, ensuring you don't proceed with outdated information.

The service automatically updates the prices as new information comes in, and it's designed to be cleared out when a trading strategy starts to avoid using old or incorrect data.

You can clear all the stored prices, or just clear the price for a specific symbol and strategy combination, which is a good practice at the beginning of a new test or live trading session. It’s a useful tool for getting accurate price data outside the normal trading ticks.

## Class PositionSizeUtils

This class helps you figure out how much to trade, offering several different position sizing strategies. 

Think of it as a toolkit for determining your trade size based on various factors.

It includes methods for calculating position size using a fixed percentage of your account, the Kelly Criterion (which aims to maximize growth), and a method that considers the Average True Range (ATR).

Each of these methods performs some checks to make sure the information you provide is appropriate for the chosen strategy. Essentially, it's designed to help you apply these sizing techniques safely and correctly.

## Class Position

The `Position` class provides helpful tools for determining take profit and stop loss prices when you're trading. It simplifies the process by automatically adjusting the direction of these levels based on whether you’re holding a long or short position.

The `moonbag` function calculates take profit and stop loss levels using a specific strategy where the take profit is set to a fixed percentage above the current price.

The `bracket` function offers more flexibility; it allows you to define both a take profit and a stop loss as percentages relative to the current price, giving you precise control over your risk and reward parameters.


## Class PersistStorageUtils

This class helps you manage how signal data is saved and loaded persistently. It's designed to handle saving individual signals as separate files, making sure the data is safe even if there are unexpected interruptions.

The system uses a clever caching mechanism for storage instances, and you can even customize how data is stored by plugging in different adapters. 

It handles reading and writing signal data, ensuring operations are atomic to prevent data corruption.

You can clear the cache to force a refresh if your working directory changes. 

There are also convenient options to switch to a JSON-based storage or a dummy adapter that discards all changes, useful for testing. 

This utility is important for maintaining a reliable, crash-safe state for your signals during backtesting or live operation.

## Class PersistSignalUtils

The `PersistSignalUtils` class helps manage how signal data is saved and loaded, ensuring it's reliable even if there are unexpected interruptions. It keeps track of storage for each strategy individually, allowing for customization with different adapters. 

It handles reading and writing signal data – the information about your trading strategies – and guarantees that these operations are done safely and without data corruption, particularly important if the program crashes.

The class provides a way to swap out the storage method, like using JSON files or even a "dummy" adapter that simply ignores all data, which is useful for testing. You might need to clear the cache if your working directory changes during strategy runs. Essentially, it’s the behind-the-scenes mechanism that keeps your trading strategies' state consistent.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how scheduled signals are saved and loaded, especially for trading strategies. It makes sure that each strategy has its own isolated storage area and provides flexibility by allowing you to plug in different ways of storing the data, like using JSON files or even just discarding the data.

The system focuses on reliably keeping track of these signals – it ensures writes happen in a complete way so data isn't lost if something unexpected occurs. When a strategy starts up, it uses this class to retrieve previously saved signal information, and when a signal is updated, the class handles saving the changes to disk.

You can customize how the signals are persisted using adapters, and if you need to completely reset the stored data, there's a function to clear the cache. There's also an option to temporarily disable persistence altogether using a “dummy” adapter, useful for testing or development. Finally, you can easily switch back to the standard JSON-based persistence if desired.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and reliably save information about your active trading positions, particularly for risk management. It ensures that your position data isn't lost even if there are unexpected interruptions.

It uses a clever system to keep track of different risk profiles and lets you plug in custom ways to store that data. Think of it like having different "containers" for your risk information, each handled in a specific way.

The class offers functions to read and write this position data, doing so safely to prevent data corruption. You'll use `readPositionData` to load previously saved positions, and `writePositionData` to store any changes.  `ClientRisk` relies on these functions.

You have some flexibility in how the data is stored; you can use the default JSON format, a “dummy” adapter which simply ignores write operations (useful for testing), or bring in your own specialized adapter. `usePersistRiskAdapter`, `useJson` and `useDummy` provide this configuration.  It also provides a `clear` method to refresh the storage cache when necessary.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps keep track of your trading progress – specifically, profit and loss – and safely saves that information. It makes sure that even if something goes wrong, your data isn't lost. It does this by remembering where to store this data for each symbol and strategy you're using.

The class is designed to work with different storage methods, allowing you to customize how the data is saved. When your trading system restarts, it can easily retrieve this saved progress.

Here are some key things you can do with it:

*   **Change how data is stored:** You can tell it to use a standard JSON format or even a dummy adapter that doesn’t save anything at all (useful for testing).
*   **Clear the memory:** It provides a way to clear out temporary storage, which is important if your trading environment changes.
*   **Read and save data:** It handles both the reading and writing of this partial data, ensuring that updates are saved securely and reliably. It uses special techniques to ensure the data isn't corrupted, even if there are sudden interruptions.

## Class PersistNotificationUtils

This class helps manage how notifications are saved and retrieved, ensuring that the system can recover even if there are unexpected interruptions. It provides a way to store each notification as a separate file, identified by its unique ID.

You can customize how these notifications are stored by registering different persistence adapters, or revert to the standard JSON format.

If your application's working directory changes, you'll need to clear the cached storage to prevent issues.

This utility is a key component used by other parts of the system for managing notification persistence, particularly during live trading or backtesting. It allows you to read existing notification data and write updates back to disk safely.

## Class PersistMemoryUtils

This class helps manage how your trading strategy's memory data is saved and loaded, making sure things are persistent even if the strategy crashes. It uses a clever system of memoization, which means it avoids creating duplicate storage instances for the same data.

You can customize how the data is stored by using different adapters, like switching to a dummy adapter to temporarily disable saving.

The `waitForInit` function makes sure storage is ready before you start using it. The `readMemoryData` and `hasMemoryData` methods let you retrieve previously saved memory entries. Conversely, `writeMemoryData` saves new data, and `removeMemoryData` marks existing data for deletion (but the file remains on disk for now).

If you need to refresh or clean up, `clear` removes cached storage, and `dispose` releases resources associated with a specific signal. The `listMemoryData` function is designed for rebuilding indexes.  Finally, `useJson` and `useDummy` allow you to switch between JSON-based storage and a no-op adapter.

## Class PersistMeasureUtils

This class, `PersistMeasureUtils`, helps manage how cached data from external APIs is saved and retrieved persistently. Think of it as a tool for ensuring your cached data survives restarts and is easily accessible. It uses a clever system where each cache entry is organized into a 'bucket' based on timestamp and symbol.

The class provides ways to read, write, and delete cached data. When data is deleted, it’s essentially marked as removed instead of physically deleted, allowing you to easily clean up your cache later.

You can even customize how this caching happens by plugging in different persistence adapters, or switch back to a default JSON adapter. There's even a 'dummy' adapter that's useful for testing—it simply ignores any data you try to save. This allows for a clean cache when the working directory changes. Finally, the `listMeasureData` function allows iteration over existing keys.

## Class PersistLogUtils

This class helps manage how log data is saved and retrieved, ensuring it’s reliable even if things go wrong. It uses a special system for storing each log entry as its own separate file, making sure nothing gets lost.

The class is designed to work with different ways of storing data (adapters), and it remembers the storage instance to avoid unnecessary work.

It includes handy functions: one to load all existing log entries, and another to write new entries to disk safely.

You can also customize how data is stored, either by switching back to the standard JSON format or by using a “dummy” adapter that simply discards any new data – useful for testing. 

If your application's working directory changes, it’s important to clear the cached storage to use the new base path.

## Class PersistIntervalUtils

This component manages how trading signals are tracked and remembered across intervals. It’s designed to prevent the same interval from triggering a signal multiple times, ensuring efficiency. It uses files stored in a specific directory (`./dump/data/interval/`) to keep track of which intervals have already fired. 

The system allows for different ways to store this data, including a default JSON-based storage and a “dummy” option that ignores all writes for testing. You can also register your own custom storage methods. 

If an interval has already fired, a file will exist for that interval's unique identifier.  To force a signal to fire again, you can "soft delete" the record—essentially marking it as removed without deleting the file entirely. This allows a strategy to re-evaluate the same interval if needed. 

The `clear` function helps reset the system when the working directory changes. The `listIntervalData` method gives you a way to iterate through all recorded intervals for a specific time bucket.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data for trading. It's designed to store each candle as a separate file, making it organized and allowing for specific candles to be retrieved or updated. The system checks if the entire set of candles you're requesting is present in the cache before returning anything; if even one candle is missing, the whole request fails, indicating a cache miss. 

The cache automatically updates itself when data is incomplete, ensuring accuracy. It's primarily used by the `ClientExchange` to keep track of candle data.

You can customize how the cache is stored by registering different persistence adapters, or simply revert to the default JSON storage. A 'dummy' adapter is also available to temporarily disable writing to the cache, which is useful for testing. The `clear` method helps refresh the cache when the storage location changes, ensuring new data is properly loaded.

## Class PersistBreakevenUtils

This class manages how breakeven data is saved and loaded from files, ensuring a consistent state across different runs. It's designed to handle saving information like whether a signal has been reached for a specific trade, associating this data with a particular symbol, strategy, and exchange.

The system uses a structured file system under a `breakeven` directory to store this data, with each symbol-strategy combination having its own file.  It efficiently reuses persistence objects, creating only one for each unique combination of symbol, strategy, and exchange.

You can customize how data is stored – switching between JSON, a dummy adapter that ignores writes (useful for testing), or using your own custom persistence methods. The class also provides a way to clear the stored data, useful if the working directory changes during a program's execution. When data is written, it's done in a safe, atomic way to avoid corruption.

## Class PersistBase

`PersistBase` provides a foundation for storing and retrieving data to files, ensuring data integrity and efficient handling. It’s designed to work with file-based persistence, automatically managing file creation, validation, and cleanup to prevent corruption.  The framework uses atomic writes, meaning operations either succeed entirely or fail cleanly, avoiding partially written files.

The constructor needs an entity name and a base directory where the files will be stored.  You can then use methods like `readValue` to retrieve data, `hasValue` to check if data exists, and `writeValue` to save it. `keys()` generates a list of all entity IDs, allowing you to iterate over your stored data.

The `waitForInit` method initializes the persistence directory and validates existing files—it's a one-time process.  The directory path is automatically managed and computed by `_directory`. File paths are generated dynamically using `_getFilePath`, creating predictable and organized storage.

## Class PerformanceReportService

This service helps you understand how your trading strategies are performing by tracking how long different parts take to execute. It listens for timing events emitted during strategy runs and saves that data to a SQLite database. 

Think of it as a detective, constantly noting when actions start and finish, so you can pinpoint slow areas that need improvement.

You can easily connect it to your code to start monitoring performance. Once connected, it automatically records timing information.

To stop tracking, simply use the unsubscribe function that's provided when you initially subscribe. If you haven’t subscribed, doing nothing is perfectly safe.

The service uses a logger to help you debug and a mechanism to prevent accidental double-subscriptions to the performance emitter.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing. It gathers data from your backtests and analyzes it to provide insights. 

It keeps track of metrics for each strategy, calculating things like average performance, minimums, maximums, and percentiles. You can then generate easy-to-read reports in markdown format, which includes analysis of potential bottlenecks in your strategy. These reports are saved so you can review them later.

You can subscribe to performance events to start collecting data, and unsubscribe when you no longer need to. It also provides ways to retrieve statistics, generate reports and clear the accumulated data. Each backtest run for a specific trading strategy is tracked independently, ensuring your analysis is accurate and isolated.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to gather and analyze performance metrics for specific symbols and strategies.

You can retrieve detailed statistics like counts, durations, averages, and volatility measures. These metrics are organized by different operation types, allowing you to pinpoint areas for improvement.

The class also generates clear and informative markdown reports. These reports visualize performance data with charts and tables, highlighting potential bottlenecks using percentile analysis.

Finally, you can easily save these reports directly to your disk, with the option to customize the file path and include specific data columns. It also creates the required directory if it doesn’t exist.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data collected during trading. It's designed to work with the PartialMarkdownService, which keeps track of smaller gains and losses that might not be immediately obvious.

You can use it to get overall statistics about your trading performance, like total profit and loss event counts. 

It also lets you create nicely formatted markdown reports that show all the individual partial profit/loss events, presented in a table with details such as the type of action (profit or loss), the symbol traded, the strategy used, the price, and the timestamp.

Finally, you can easily save these reports to a file so you can review them later, with the filename following a clear and consistent naming convention.


## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by recording each time a position is partially exited, whether it's for a profit or a loss. It acts like a diligent observer, listening for these "partial exit" signals from your trading system.

This service captures key details like the price and level at which each partial exit occurs. It then stores this information in a database, allowing for more granular analysis of trading performance.

To get it working, you need to "subscribe" it to the signals that indicate partial profits and losses.  This subscription is designed to only happen once, preventing unwanted duplicate entries.  When you're finished, you can "unsubscribe" to stop the service from receiving those signals. It's like telling it, "Okay, I don't need your updates anymore." 

The `loggerService` is used for debugging purposes, helping to identify any issues. The `tickProfit` and `tickLoss` functions are specifically designed for handling and logging profit and loss events, respectively.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on small profits and losses (partial profits/losses) as your trading system runs. It listens for these events, organizes them by symbol and strategy, and then formats them into easy-to-read markdown reports.

You can subscribe to receive these events and unsubscribe when you no longer need them. The service keeps track of all events, lets you retrieve statistics, and saves reports to files on your computer for later review.

Essentially, it’s designed to give you a detailed, organized view of the smaller gains and losses that contribute to your overall trading performance. You can clear the stored data if you want to start fresh, either for everything or just a specific trading setup. The reports include important information about each event and are organized to help you analyze what's happening.

## Class PartialGlobalService

This service manages and tracks partial profits and losses across your trading strategies. It acts as a central hub, receiving information about profits, losses, and signal closures. Think of it as a logging layer, recording these events globally before passing them on to the connection service that actually handles the details.

It's designed to be injected into your strategies, making it easy to monitor and control partial trading activity. The service relies on several other services for tasks like validating strategies and configurations, and it keeps track of validations to avoid unnecessary checks.

Essentially, it simplifies the process of managing and observing partial trading states within your backtesting environment, giving you more insight into how your strategies are performing.


## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for each trading signal. It acts like a central hub, creating and maintaining individual records for each signal – ensuring there's only one tracking record for each. 

Think of it as a factory that builds and manages these individual signal trackers.  These trackers are cached for efficiency and automatically cleaned up when a signal is finished.

It's integrated into the larger trading system and relies on other services to handle logging and actions. 

The service provides functions for marking profits, losses, and clearing out the tracking information when a trade concludes. These functions find the correct tracker for a signal, configure it, and then pass on the specific profit/loss/clear task to that tracker. The service keeps track of the data and signals the system when new profit or loss milestones are hit.

## Class NotificationLiveAdapter

This class, `NotificationLiveAdapter`, helps you send notifications about your trading activity, like profits, losses, or errors. It's designed to be flexible, allowing you to easily switch between different ways of sending those notifications—like storing them in memory, saving them to a file, or simply ignoring them (using a dummy adapter).

You can think of it as a central hub that handles all your notification events, and then passes them on to the specific notification method you’ve chosen.

It offers a few built-in notification methods to choose from: one that stores notifications in memory (the default), one that persists them to disk, and one that does nothing at all.

You can swap out the notification method at any time by using methods like `useDummy()`, `useMemory()`, and `usePersist()`.  The `useNotificationAdapter` method allows for custom adapter implementations.

The `getData()` method lets you retrieve all the notifications that have been recorded, and `dispose()` clears those notifications out. It’s especially important to call `clear()` when your working directory changes because it resets the notification storage to the default in-memory setup.

## Class NotificationBacktestAdapter

This component provides a flexible way to manage notifications during backtesting. It acts as a middleman, allowing you to easily switch between different notification methods without changing the core backtesting logic.

You can choose how notifications are handled: storing them in memory, persisting them to disk, or completely ignoring them with a dummy adapter. It's designed to be adaptable, letting you plug in different notification implementations as needed.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods all forward events to the currently selected notification method. You can retrieve all stored notifications with `getData`, and clear them with `dispose`.

The `useNotificationAdapter`, `useDummy`, `useMemory`, `usePersist`, and `clear` methods provide convenient shortcuts for changing notification behavior, and `clear` should be used when the working directory changes to ensure a fresh start for notifications.

## Class NotificationAdapter

This component handles managing and storing notifications, both for backtesting and live trading. It automatically keeps track of notifications as they come in, and ensures you can easily access them. 

To prevent unwanted repetition, it only subscribes to the notification sources once. 

You can turn notification storage on and off, and retrieve all stored notifications by specifying whether you want backtest or live data. 

Finally, there's a cleanup function to make sure everything is properly unsubscribed when you're done.

## Class MemoryAdapter

The MemoryAdapter provides a way to manage and store data associated with signals and buckets. It's designed to avoid creating duplicate data stores, instead reusing existing ones whenever possible. You can think of it as a central hub for handling memory instances.

It automatically handles creating and cleaning up these data stores, ensuring that old data doesn't stick around when it's no longer needed. 

You have control over where the data is stored, choosing between keeping it entirely in memory, persisting it to files, or using a dummy adapter that simply ignores writes for testing.

Before using any of its features, you need to activate the adapter with `enable()`, and you can deactivate it later with `disable()`. You can write data with `writeMemory`, search for data with `searchMemory`, list everything with `listMemory`, remove individual entries with `removeMemory`, or retrieve a single entry with `readMemory`. For switching storage backend, use `useLocal`, `usePersist`, or `useDummy`. `clear` clears the internal caches, and `dispose` releases all resources.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced during trading simulations or live trading. Think of it as a tool to pull together and present data about the worst losses encountered.

It offers a central place to access information gathered during backtesting or live trading runs.

You can use it to:

*   Fetch detailed statistics related to max drawdown events, providing numbers and insights into the losses.
*   Create formatted markdown reports that summarize all the max drawdown events for a specific trading setup (symbol, strategy, exchange, timeframe).
*   Save those markdown reports directly to a file for easy sharing or further analysis.


## Class MaxDrawdownReportService

This service keeps track of maximum drawdown events during a backtest and logs them for analysis. It's designed to listen for drawdown signals and record detailed information about each one, like the timestamp, symbol, strategy name, and the specifics of the trading signal (position, price levels, etc.).

Think of it as a dedicated recorder for those potentially concerning drawdown moments.

To begin logging these events, you'll need to use the `subscribe` method. This method ensures that you only subscribe once, preventing duplicate registrations.  A function is returned, which is used later to stop the logging process by calling `unsubscribe`. 

The `unsubscribe` method cleanly stops the recording of drawdown data, ensuring no further records are written. If you haven't subscribed initially, calling `unsubscribe` won't have any effect.


## Class MaxDrawdownMarkdownService

This service is designed to automatically generate and save reports detailing maximum drawdowns, a key risk metric for trading strategies. It listens for drawdown data and organizes it based on the trading symbol, strategy name, exchange, and timeframe.

You can subscribe to start receiving these drawdown events, and unsubscribe to stop the process and clear all collected data.

The `getData` method lets you retrieve the calculated drawdown statistics for a specific symbol, strategy, exchange, timeframe, and whether it’s a backtest or live trade. The `getReport` method creates a markdown-formatted report based on this data, and `dump` writes that report directly to a file.

Finally, you can clear the stored drawdown data to free up memory; you can clear all data or selectively clear data for a specific trading combination.

## Class MarkdownWriterAdapter

This component helps you manage where your trading reports are saved, offering flexibility in how they're stored. You can choose to have each report saved as a separate file, log everything into a single JSONL file, or even completely suppress the generation of reports. It intelligently handles creating and managing the storage locations, so you don't have to worry about that. 

The system uses a default setting that creates individual markdown files for each report, but you can easily change this.  It also keeps track of the storage locations to avoid creating duplicate files.  If you need to change the base location of your files, you can clear the storage cache.  Finally, it provides a "dummy" option that effectively turns off all markdown output, useful during development or when you don't need the reports. You’ll use `useMd()`, `useJsonl()`, and `useDummy()` to control which storage method is active.

## Class MarkdownUtils

The MarkdownUtils class helps you control which parts of the backtest-kit framework generate markdown reports. It's like a switchboard for report creation, letting you turn on or off reports for things like backtests, live trading, strategy analysis, and more.

You use the `enable` method to start generating reports for the services you need. This method also provides a way to clean up later – it gives you a function to unsubscribe from all enabled services at once, so you don't leave listeners running and potentially leak memory.  Remember to call that cleanup function when you're finished with the reports!

If you just want to stop generating reports for a specific area, the `disable` method is the way to go. This immediately stops report generation for the services you specify, without needing a separate cleanup function. It's a quick and direct way to halt markdown report creation for certain aspects of the system.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate markdown reports, organizing each report into its own separate file within a directory structure. It's ideal for creating reports meant for human review and easy navigation.

Each report is written as a `.md` file, with the filename and location determined by the `options.path` and `options.file` parameters you provide. The adapter automatically handles creating the necessary directories to hold your reports.

The `waitForInit` method is essentially a no-operation; it doesn’t require any specific initialization because it directly writes files.

To generate a report, simply use the `dump` method, providing the markdown content and the configuration options to specify the file path and name.

## Class MarkdownFileBase

This component manages writing markdown reports to JSONL files, acting as a central hub for your backtest kit's output. Think of it as a dedicated system for consistently logging your trading results in a structured, machine-readable format. 

It organizes markdown reports into individual JSONL files based on their type (like performance reports or trade details). The files are written in an append-only manner, ensuring that data is added without overwriting previous entries.

The system handles large amounts of data efficiently with stream-based writes and automatically creates the necessary directories. To prevent issues, it has a built-in timeout to avoid stalled writes. 

You can easily search and filter these reports later using metadata like the trading symbol, strategy name, exchange, frame, and signal ID. It's designed to work seamlessly with external JSONL processing tools for further analysis and reporting.

The initialization is handled automatically and can be safely called multiple times. The `dump` method allows you to send markdown content along with associated metadata to be appended to the file.


## Class MarkdownAdapter

The MarkdownAdapter provides a flexible way to manage how your markdown files are stored and organized. It uses a pattern that lets you easily swap out different storage methods without changing your core code. 

You can choose between storing each markdown file as a separate `.md` file, or appending them all to a single `.jsonl` file. 

To ensure data integrity during strategy iterations that involve changing working directories, the `clear` method is useful for resetting the storage cache. 

Finally, a `useDummy` option is available to temporarily disable markdown writing for testing or debugging purposes.

## Class LoggerService

The LoggerService helps ensure your trading strategies and backtests log information consistently and with helpful context. It automatically adds details like the strategy's name, the exchange being used, the specific frame being processed, and the data being analyzed to your log messages.

You can plug in your own logging system by setting a custom logger, or it will fall back to a basic "do nothing" logger if you don’t specify one. 

The service has internal components to manage the method and execution context, making sure the right information is always included in your logs. It provides methods for logging messages at different severity levels: general messages, debug information, informational messages, and warnings. Essentially, it makes sure you're getting the right data in your logs, making it easier to understand what’s happening during your backtests.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store your trading logs. Think of it as a central hub for all your logging needs.

It's designed to be adaptable, letting you easily switch between different logging methods like storing logs in memory, saving them to a file, or even effectively silencing logs altogether. By default, it uses an in-memory storage, but you can easily change this.

You can swap out the logging mechanism by using functions like `usePersist`, `useMemory`, or `useDummy`. `useJsonl` lets you log to JSONL files.  The `log`, `debug`, `info`, `warn` and `getList` methods all pass through to the currently selected logging backend.

The `useLogger` function allows you to completely customize how logging works, providing even more control.  Finally, `clear` resets the adapter to its initial in-memory state, which is useful in certain situations to avoid unexpected behavior.

## Class LiveUtils

LiveUtils provides tools for managing live trading operations within the backtest-kit framework. It acts as a central hub for interacting with live trading, offering convenience and recovery features.

The `run` method initiates live trading for a specific symbol and strategy, continuously generating trading signals. This process is designed to be resilient, automatically recovering from crashes and preserving state. You can also trigger live trading in the background using `background`, which is useful for tasks like persistence or callbacks without directly handling the results.

For retrieving information about a pending or scheduled signal, use `getPendingSignal` and `getScheduledSignal`. The framework also provides methods to calculate position-related metrics such as total percentage closed, total cost closed, and effective entry price, enabling detailed position analysis.

The `stop` method allows for gracefully halting live trading, while `commitCancelScheduled` and `commitClosePending` provide ways to manage signals without fully stopping the trading process. Numerous methods like `commitPartialProfit`, `commitTrailingStop`, and `commitAverageBuy` allow for precise control over position management and adjustments. Finally, `getData` and `getReport` offer reporting and data extraction capabilities to monitor the live trading process.

## Class LiveReportService

The LiveReportService is designed to keep a real-time record of your trading activity. It listens for signals from your trading strategy and meticulously logs every important event – when a signal is idle, when a position is opened, when it's actively trading, and when it's closed. 

This service stores all that data, along with the details of each signal, directly into a SQLite database, making it easy to monitor what's happening and analyze your trading decisions. 

To make sure you don't accidentally overload the system, it prevents multiple subscriptions to the live signal feed. 

You can easily start receiving these live updates with the `subscribe` function, which provides a way to stop listening with its returned unsubscribe function. The `unsubscribe` function ensures that you properly stop the live updates if you're no longer needed them.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save reports about your live trading activity. It listens to every signal event happening during your trades—like when a strategy is idle, a trade is opened, is active, or closed—and carefully records all the details.

It then organizes this information into easy-to-read markdown tables, giving you a clear overview of your trading performance, including statistics like win rate and average profit/loss. These reports are saved automatically as files in a designated folder, making it simple to track and analyze your trading history for each strategy.

You can subscribe to receive these updates in real time, and unsubscribe when you no longer need them. It also provides methods to fetch specific data, generate reports, and clear out accumulated data when needed. The service keeps things organized by storing data separately for each unique combination of symbol, strategy name, exchange, timeframe, and whether it’s a backtest.

## Class LiveLogicPublicService

This service helps manage and execute live trading operations, taking care of the context needed by strategies and exchanges. It's designed to make your trading logic simpler by automatically passing information like the strategy name and exchange identifier to the underlying functions.

Think of it as a conductor orchestrating the live trading process, making sure everything has the right information at the right time.

The service continuously runs, providing a stream of trading signals – openings, closures, and cancellations – and it’s built to be resilient. If there’s a crash, it can recover and pick up where it left off, thanks to stored state. It uses the current time to track the progression of trades in real time.

To start a live trading process, you provide a symbol and a context object. It then generates trading results indefinitely.


## Class LiveLogicPrivateService

This service manages the live trading process for a specific asset, designed to run continuously. It constantly monitors the market and checks for new trading signals.

The core function, `run`, produces a stream of trading results – specifically, when positions are opened or closed. You won't see updates for positions that are simply active or idle.

Because it’s built as an infinite generator, the process runs indefinitely, automatically restarting if it crashes to ensure continuity. It leverages other services to handle logging, strategy execution, and managing the context of the trading operations.

## Class LiveCommandService

This service provides a way to interact with live trading functionality within the backtest-kit framework. It's designed to be easily used for dependency injection, making it straightforward to integrate into different parts of your application.

It handles the complexities of live trading by wrapping another service, `LiveLogicPublicService`.

Essentially, you use this service to start a live trading session for a specific symbol, providing details like the strategy and exchange names.

The `run` method is the core function – it kicks off the live trading process and continuously provides updates (like opened, closed, or cancelled strategy ticks) as they happen. This process is designed to be resilient, automatically recovering from crashes to keep trading running. Think of it as an always-on generator that feeds you live trading data.

## Class IntervalUtils

This utility class, `IntervalUtils`, helps you manage functions that should only run once within a specific time interval. Think of it like scheduling a task, but making sure it doesn’t repeat unnecessarily within a timeframe.

There are two main ways it works: in-memory, where the state is held in the program’s memory, and file-based, where the information about whether the task has run is saved to a file, ensuring it persists even if the program restarts.

The `fn` method lets you wrap a function to ensure it's only executed once per interval. If a function returns `null`, it won't trigger a countdown and will retry later. It uses the function itself as a way to keep track of its state, guaranteeing each unique function has its own isolated behavior.

The `file` method does a similar thing, but stores the "fired" state in a file, making it persistent across restarts. This is helpful for processes that need to remember if they've already completed a task. Like `fn`, it uses the function reference as a unique identifier.

You can also clean up these tracked functions using `dispose` to remove a specific function's state.  `clear` is a more drastic measure that wipes out *all* tracked functions. Finally, `resetCounter` is for advanced scenarios where you need to restart the persistent file tracking from zero.

## Class HighestProfitUtils

This class helps you access and understand the highest profit events recorded during trading simulations or live trading. Think of it as a tool for analyzing which strategies performed best for specific assets. 

It provides easy ways to get summarized data, like overall statistics, or to generate detailed reports.

You can request statistics based on the asset traded, the strategy used, and the trading environment.

The class allows you to generate markdown reports, which are essentially formatted text documents, summarizing these high-profit events. These reports can be viewed directly or saved to a file for later review.

You can specify which columns of data you want to see in the reports.


## Class HighestProfitReportService

This service is designed to keep track of your most profitable trades and store that information for later analysis. It listens for notifications whenever a new highest profit is achieved.

Each time a new highest profit is detected, the service carefully records important details like the timestamp, symbol, strategy name, exchange, frame, backtest information, signal ID, position size, current price, and stop-loss/take-profit levels.

The service uses a special "highest_profit" database to store these records. This allows you to review your best-performing trades and understand what factors contributed to their success.

To get it working, you need to subscribe to the service. Importantly, it only subscribes once; any further attempts simply return the same "unsubscribe" function.

To stop the service from recording further data, you can unsubscribe. This cleans up resources and prevents additional entries from being added to the database.


## Class HighestProfitMarkdownService

This service is designed to collect and report on the highest profit-generating events for your trading strategies. It listens for incoming "HighestProfitContract" events and organizes them based on the symbol, strategy, exchange, and timeframe being used.

You can subscribe to these events to start receiving data, and the service ensures you don't subscribe multiple times.  Unsubscribing will stop the data collection and clear everything.

When it receives an event, it stores it in a specific bucket based on the parameters. You can then retrieve the accumulated data, generate a formatted report (in markdown), or save the report directly to a file.  The file names include the symbol, strategy, exchange, timeframe, and whether it's a backtest or live run.

Finally, you have the option to clear the stored data, either for a specific strategy configuration or completely, effectively resetting the service.

## Class HeatUtils

HeatUtils helps you visualize and understand how your trading strategies are performing across different assets. It's a handy tool that gathers data about your portfolio's performance, like profit/loss, risk metrics, and trade counts, all organized by symbol.

You can request the raw data, or have it automatically formatted into a readable markdown report.

This report presents a sorted table of symbols with key performance indicators, making it easy to see which assets are contributing the most (or least) to your strategy's success.

Finally, you can save these reports directly to your hard drive for later review or sharing, and the tool will even create the necessary folders if they don't already exist. Think of it as a centralized and convenient way to analyze and export portfolio performance insights.


## Class HeatReportService

This service helps you track and analyze your trading performance by recording closed trades. It listens for events related to trades that have finished, specifically capturing information about profits and losses. 

The service saves this data to a database, allowing you to create heatmaps—visual representations of your trading activity across different assets—to gain insights into your portfolio's performance.

You only need to set it up once using the `subscribe` method, and it will automatically begin recording closed trades. When you’re finished, use the `unsubscribe` method to stop the recording. The `tick` property is where the processing happens, making sure only closed trades are logged.

## Class HeatMarkdownService

The Heatmap service helps you understand how your trading strategies are performing by creating a portfolio-wide view of your results. It gathers data from trading signals and organizes them into easily understandable statistics, both for your overall portfolio and for each individual asset you're trading.

It keeps track of closed trades, giving you key metrics like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), maximum drawdown (the biggest loss from a peak), and the total number of trades executed.  This information is broken down by each symbol and then aggregated to give you a high-level view of your strategies' performance.

You can generate reports in Markdown format that provide a clear, tabular view of this data, and it's also able to save these reports directly to files. Critically, the system is designed to handle potential errors in calculations gracefully, avoiding issues with infinite or undefined values.  It also intelligently manages storage, so data is organized efficiently and isn't duplicated unnecessarily. Finally, it provides a way to completely clear all accumulated data if needed.

## Class FrameValidationService

This service helps you keep track of and verify your trading timeframe configurations. Think of it as a central place to register all your allowed timeframes and make sure they're valid before your strategies use them. 

It makes things easier by remembering whether a timeframe is valid or not, so you don't have to check every single time.

Here's what you can do with it:

*   **Register Timeframes:** Use `addFrame` to add new timeframes and their associated details to the system.
*   **Verify Timeframes:** The `validate` function lets you confirm that a specific timeframe exists.
*   **See Registered Timeframes:** `list` provides a complete overview of all the timeframes you’ve registered. 

The service also handles internal details like keeping a record of frames and caching validation results to keep things running smoothly.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas, making sure they're structured correctly and easily accessible. It's like a central library for your frame definitions.

You register new frame schemas using the `register` method, giving them a unique name. If a schema already exists, you can update it using the `override` method, which lets you change only specific parts of the existing definition. 

Need to find a schema? Just use the `get` method and the name of the schema you're looking for. The service also checks that your schemas have the necessary parts before you register them, preventing errors later on. It utilizes a registry to store these schemas in a type-safe manner.

## Class FrameCoreService

FrameCoreService is the central hub for managing timeframes within the backtesting system. It handles the creation and retrieval of timeframe data, essentially providing the timeline against which your trading strategies will be evaluated. 

Think of it as the engine that powers the chronological flow of your backtest. It relies on other services like FrameConnectionService to actually fetch the timeframe data. 

The `getTimeframe` function is its key offering; you'll use this to get an array of dates that define the period your backtest will cover, and this function is essential for any backtest iteration. It’s a core component used internally to manage the overall backtesting process.


## Class FrameConnectionService

The FrameConnectionService helps manage and route operations to the correct frame implementations, essentially acting as a central hub for frame-related tasks. It automatically determines which frame to use based on the current context, making it easier to work with different frames without manual selection. 

To improve performance, it remembers (caches) previously created frame implementations so they don’t need to be recreated repeatedly. The service also provides a way to define and retrieve the timeframe for backtesting, specifying the start and end dates for analysis. 

When operating in live mode, there are no specific frame constraints, indicated by an empty frame name. It utilizes services like loggerService, frameSchemaService, and methodContextService to function correctly. You can get a frame instance using the `getFrame` method, and use the `getTimeframe` method to specify the bounds of your backtest.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and confirm that your exchanges are properly set up and working correctly within your backtesting environment. Think of it as a central manager for your exchange configurations. 

You can add new exchange configurations using `addExchange()`, essentially registering them with the service. 

Before you try to use an exchange in a trade or calculation, it's a good idea to `validate()` it to make sure it's been registered. The service remembers the results of these validations to make things faster.

Finally, `list()` provides a way to see a complete overview of all the exchanges you've configured.

## Class ExchangeUtils

ExchangeUtils provides a set of helpful tools for working with different cryptocurrency exchanges. It acts as a central hub, making common exchange-related tasks easier and more consistent.

It handles tasks like retrieving historical price data (candles), calculating average prices, and formatting trade quantities and prices to match each exchange's specific rules. 

To ensure reliable data, it automatically calculates the correct time ranges when fetching data, mimicking the approach used in the ClientExchange. Getting candles or order books becomes simpler as the framework handles date calculations for you.

You can fetch aggregated trade data, and even request raw candle data with specific start and end dates, giving you great flexibility in how you access and analyze exchange information.  This class is designed to be easily accessible, operating as a single, shared instance for convenient use across your backtesting or trading system.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges in a reliable and organized way. It uses a special system to store this information safely and ensures that each exchange's data follows a consistent format.

You can add new exchanges using `addExchange()` and then find them again later by their names. 

Before adding a new exchange, the service checks that it has all the necessary details, like required fields.  If you need to update an existing exchange's information, you can use `override()` to make changes. Finally, you can use `get()` to fetch the details of a specific exchange.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring the trading context—like the symbol, trading time, and whether it’s a backtest—is always considered. It builds upon the connection to the exchange and the current execution environment.

This service handles several core operations, including retrieving historical and future candle data (for backtesting), calculating average prices, and formatting prices and quantities appropriately for the trading environment. You can also request order books and aggregated trade data through this service.

The validation process for exchanges is handled and cached to prevent unnecessary repeated checks.  All the methods provided accept a 'when' parameter, representing the time, and a 'backtest' boolean to indicate the trading scenario.  Essentially, it provides a unified and context-aware way to access exchange data.


## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or order books – to the correct exchange based on the current context. To make things efficient, it remembers (caches) the connection to each exchange so you don't have to re-establish it every time.

It provides a consistent way to access exchange data, including historical candles, real-time average prices, and order book information. The service also automatically handles formatting prices and quantities to match the specific rules of each exchange. 

The `getAveragePrice` function smartly adapts to whether you're in a backtesting scenario (calculating VWAP from historical data) or live trading (fetching prices directly from the exchange).  You can retrieve raw candle data with flexible date ranges too. Essentially, it simplifies and streamlines your interactions with various exchanges within your trading framework.

## Class DumpAdapter

The `DumpAdapter` helps you save information about your trading strategies, providing a flexible way to store that data for review and analysis. Think of it as a central point for exporting various types of data—messages, records, tables, errors, and more—in a consistent format.

It has several different "backends" you can choose from: the default writes files in Markdown format, one file per data point. Other options include storing data in memory, discarding data entirely, or using a completely custom solution you provide. 

Before using it, you need to "enable" the adapter to listen for signals; disabling it later removes this listening functionality. The adapter creates specific, temporary data containers to handle each piece of information, ensuring efficient management. If you change the directory where your strategy runs (like when switching between different testing scenarios), it’s important to clear the adapter’s internal cache to avoid using outdated data. The `useDumpAdapter` function lets you plug in your own custom methods for handling the data if the built-in options don't quite fit your needs.

## Class ConstantUtils

This class provides a set of pre-defined constants that help manage take-profit and stop-loss levels in a trading strategy, inspired by Kelly Criterion principles and incorporating risk decay. These constants are percentages that represent how far the price needs to move towards the final take-profit or stop-loss target to activate different levels.

For example, TP_LEVEL1 is set at 30%, meaning it triggers when the price reaches 30% of the distance to the ultimate take-profit goal.  This allows for locking in profits early. Similarly, SL_LEVEL1 at 40% provides an early warning signal to reduce risk.

Here's a breakdown of the available levels:

*   **Take Profit Levels (TP_LEVEL1, TP_LEVEL2, TP_LEVEL3):** These progressively trigger at 30%, 60%, and 90% of the distance to the final take-profit target, letting you secure portions of your profit along the way.

*   **Stop Loss Levels (SL_LEVEL1, SL_LEVEL2):** These trigger at 40% and 80% of the distance to the final stop-loss target, helping to manage risk by exiting positions as the price moves against you.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading setup is mathematically sound and has a chance of making a profit. It checks a lot of different settings in your global configuration to catch potential problems *before* you start backtesting. 

It pays special attention to percentages like slippage and fees, making sure they are all positive values. It also verifies that your take-profit distance is set high enough to account for those costs and ensure you’re actually making money when your target is reached. 

Beyond that, it enforces rules for ranges of values, verifies that time-related settings use positive integers, and even checks parameters related to how candles are fetched. Essentially, this service acts as a safety net to prevent configurations that are unlikely to be profitable.

## Class ColumnValidationService

This service, ColumnValidationService, helps ensure your column configurations are set up correctly. It's designed to catch errors early and prevent problems down the line by verifying the structure of your column definitions.

The service checks for several essential things: that each column has the necessary properties (key, label, format, and isVisible), that those properties are the correct data types (strings and functions), and that your keys are unique. This validation process focuses on the configurations defined within COLUMN_CONFIG, helping you maintain consistency and avoid unexpected behavior. Essentially, it's a safeguard to keep your column definitions in good shape.

## Class ClientSizing

The ClientSizing class is your go-to for figuring out how much of an asset to trade in each scenario. It's designed to be flexible, allowing you to choose from several different sizing methods like fixed percentages, the Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum and maximum position size, as well as a cap on the overall percentage of your capital that can be used for any single trade. It lets you add your own custom logic through callbacks for things like double-checking sizing decisions or keeping a record of them. Essentially, it takes the information about a trade opportunity and gives you the size.


## Class ClientRisk

ClientRisk helps manage risk across your entire portfolio, not just within a single strategy. It's like a safety net that prevents your strategies from taking on too much risk at once.

Think of it as a central point for checking if a trading signal is safe to execute, based on limits you set, such as the maximum number of positions you can have open simultaneously. This is particularly useful when you're using multiple strategies at the same time.

ClientRisk keeps track of all active positions across all strategies, so it can make informed decisions about whether a new trade is allowed.  It also allows for custom validation checks, giving you the flexibility to create your own risk management rules.

This system is automatically used by the trading framework to validate signals before they are executed. It has ways to load and save this position data, although this feature is skipped during backtesting.

You can add signals as they’re opened and remove them when they’re closed to keep the position tracking up-to-date.

## Class ClientFrame

The ClientFrame helps manage the timeline of events during a backtest. It’s responsible for creating sequences of timestamps that represent the historical data the backtest will analyze. 

To avoid unnecessary work, it caches these timestamp arrays, ensuring they're only generated once.

You can configure how far apart these timestamps are, from one minute to three days, to match the granularity of your data. 

It also allows you to hook in custom functions to check the validity of the timeframe and log relevant events. Essentially, it provides the backbone for stepping through the historical periods the backtest needs to process. The `getTimeframe` method is the primary way to get this timeline data for a specific symbol, and it's designed to be efficient through caching.

## Class ClientExchange

This component, `ClientExchange`, is designed to provide a consistent way to access exchange data within the backtesting framework. It handles retrieving historical and future candle data, calculating VWAP prices, and formatting trade quantities and prices according to exchange-specific rules. The framework prioritizes efficiency, using prototype functions to minimize memory usage.

To get historical candle data, you can specify a symbol, interval (like 1 minute, 1 hour), and a limit. It intelligently aligns timestamps to the interval boundary to ensure accurate data. To look ahead in time for backtesting, you use `getNextCandles` similarly.

Calculating VWAP is also straightforward—it retrieves a volume-weighted average price based on recent 1-minute candles. Formatting trade quantities and prices ensures they adhere to the exchange's requirements, handling decimal places and rounding correctly. 

`getRawCandles` offers maximum flexibility for candle retrieval, allowing you to specify start and end dates or limits. The system carefully manages these parameters to avoid look-ahead bias, a critical factor in accurate backtesting. 

It also provides methods to retrieve order book data and aggregated trades, also carefully managed to avoid bias. These methods always reference the current time and configurable offsets to retrieve data.

## Class ClientAction

The `ClientAction` class is designed to manage and execute custom action handlers within a trading strategy, whether it's a live trading session or a backtest. Think of it as a central hub that takes care of setting up, routing events to, and cleaning up after your action handlers.

These action handlers are the places where you’ll put your custom logic, such as connecting to external services (like Telegram or Discord for notifications), managing your application state (using Redux or similar), or collecting performance data.

The `ClientAction` makes sure each handler is only initialized and disposed of once, using a "singleshot" approach. It offers specific methods, like `signal`, `signalLive`, and `signalBacktest`, to route different types of events – signals from live trading, backtesting, or general system notifications – to the appropriate action handlers. There are also specialized handlers for things like breakeven updates, partial profit/loss events, and scheduled monitoring pings, all designed to help you build a robust and informed trading system. Notably, `signalSync` is a critical gateway for controlling positions through limit orders, and any errors there will be passed directly to the creation function.

## Class CacheUtils

CacheUtils helps you automatically store and reuse the results of your functions, which can significantly speed up backtesting. Think of it as a way to avoid re-calculating the same things over and over again.

It provides two main ways to do this: one for regular functions and another for functions that work with files. The file-based caching is particularly useful for storing larger datasets or complex calculations that take a long time to generate.

Each function you want to cache gets its own private cache, so changes to one function won't affect others. 

You can also clean up the caches, clear existing data, or reset counters if your environment changes during testing. This ensures that the cache is always using the correct base path and avoids conflicts. Using the `fn` and `file` methods wraps your functions, making them automatically cached based on time intervals or file paths.


## Class BrokerBase

This `BrokerBase` class is designed to help you connect your trading strategy to a real-world exchange. It provides a foundation for building custom adapters that interact with brokers, handling actions like order placement, stop-loss adjustments, and position tracking. Think of it as a blueprint for telling your trading bot *how* to actually trade on an exchange.

It comes with ready-made default behaviors for almost everything, so you only need to override the parts that are specific to your chosen exchange. It keeps track of everything happening with helpful logging, making it easier to debug and understand.

Here’s how it works:

1.  **Initialization:** The `waitForInit()` method is your chance to set everything up – log in to your exchange account, load settings, or establish a connection.
2.  **Event Handling:** As your trading strategy executes, various "commit" methods are triggered to perform actions:
    *   `onSignalOpenCommit`: To place orders when a signal tells you to enter a position.
    *   `onSignalCloseCommit`: To handle closing a position completely, either due to reaching a target or manual intervention.
    *   `onPartialProfitCommit`: To take some profit off the table when things are going well.
    *   `onPartialLossCommit`: To cut losses if a trade isn't performing as expected.
    *   `onTrailingStopCommit` & `onTrailingTakeCommit`: To automatically adjust stop-loss and take-profit levels as the price moves.
    *   `onBreakevenCommit`: To move the stop-loss to the entry price, protecting any profit.
    *   `onAverageBuyCommit`: To add new entries to a position, averaging down the cost (Dollar Cost Averaging).

You don't need to worry about setting up the basic infrastructure or the order of events; `BrokerBase` handles that for you. You simply focus on implementing the exchange-specific logic within these methods.


## Class BrokerAdapter

The `BrokerAdapter` acts as a crucial intermediary between your trading logic and the actual broker. It allows you to control and potentially modify actions like opening, closing, and adjusting positions before they're sent to the broker. Think of it as a safety net and a point of coordination.

During backtesting, these actions are essentially skipped, so your historical data isn't affected. However, when you're trading live, the `BrokerAdapter` handles the actual communication with your broker.

You need to register your specific broker implementation with the `useBrokerAdapter` method. Once registered, you can activate the adapter using `enable()`, which sets up automatic routing of certain signal events. The `disable()` method lets you deactivate this routing.

Various "commit*" methods (like `commitSignalOpen`, `commitPartialProfit`, and others) provide specific hooks for intervening in different trading operations. These functions allow you to validate data or perform additional checks before the action is ultimately executed. If any of these commit methods throws an error, the underlying operation is cancelled, preserving your trading state. The `clear()` function ensures that the adapter is properly reset when necessary, particularly when the environment changes between strategy iterations.

## Class BreakevenUtils

This class provides tools for understanding and analyzing breakeven events within your trading framework. It acts as a central point for gathering and presenting data related to when trades reached their breakeven point. You can use it to get overall statistics about breakeven events, like how many times they occurred, or to generate detailed reports.

The reports themselves present a clear, table-based view of individual breakeven events, including important details such as the symbol, strategy used, entry price, and the timestamp of the event. This makes it easier to review performance and identify trends.

Finally, the class can automatically save these reports to files, making it convenient to archive and share your breakeven analysis. The file names are structured to easily identify the symbol and strategy associated with each report.


## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It listens for these "breakeven" events and records them, including all the details about the signal that triggered them.

Think of it as a dedicated recorder that captures significant milestones in your trading strategy's performance.

You can start this service to begin logging breakeven events. To stop the logging, you'll use an unsubscribe function that's provided when you initially start the service, ensuring you don't accidentally clutter your records. The service also includes logging capabilities for debugging and a mechanism to prevent accidentally subscribing multiple times.


## Class BreakevenMarkdownService

This service helps you create and save reports detailing breakeven events for your trading strategies. It keeps track of these events – essentially, points where a trade reaches a break-even condition – for each symbol and strategy you're using.

It organizes the data and generates readable markdown tables summarizing this information. You can request statistics like the total number of breakeven events.

The service automatically saves these reports to your computer in a structured directory, so you can easily review them later.

You can subscribe to receive updates whenever a breakeven event occurs, and equally important, you can stop these updates when you no longer need them.

The `getData` method lets you extract summary statistics, `getReport` creates the markdown report itself, and `dump` saves that report to a file.  `clear` allows you to remove all accumulated data or selectively remove data for specific strategy and symbol combinations.

## Class BreakevenGlobalService

This service, called BreakevenGlobalService, acts as a central hub for tracking and managing breakeven calculations within the system. It’s designed to be injected into the core trading strategy, simplifying how that strategy interacts with the underlying data connections. Think of it as a middleman, logging everything it does and then passing the work on to a more specialized service.

It keeps track of breakeven points, but it doesn't actually *do* the calculations itself; instead, it relies on another component called BreakevenConnectionService for that. This design allows for consistent logging and a cleaner structure.

Several other services are also brought in to validate aspects of the strategy, risk, and market data involved, ensuring everything is in order before proceeding.  You can expect it to handle checking for breakeven triggers and clearing existing breakeven states when signals close out. This all happens behind the scenes, helping to maintain a centralized and monitored breakeven process.

## Class BreakevenConnectionService

This service manages tracking breakeven points for trading signals. It keeps a record of breakeven calculations for each signal, ensuring that you don't recalculate them unnecessarily.

Think of it as a factory that creates and manages objects responsible for calculating and maintaining breakeven information. These objects are cached to improve performance.

It uses a central system for logging and notifying others when breakeven events occur.

You can request a breakeven check for a signal to see if it's reached its breakeven point, and clear a signal's breakeven when it's closed.

The service is designed to work with a broader strategy system and automatically cleans up old data to prevent issues with memory.

## Class BacktestUtils

This class provides tools for running and analyzing backtests, making the process simpler and more organized. It's designed as a central place to manage backtest operations.

The `_getInstance` property ensures each combination of symbol and strategy gets its own isolated backtest environment, preventing interference.

The `run` function executes a backtest and provides a stream of results.  The `background` function is for running tests in the background without needing to directly view the results—good for automated tasks or silent logging.

You can get details about a pending or scheduled signal using `getPendingSignal` and `getScheduledSignal` respectively. There are also methods to check if signals are missing (`hasNoPendingSignal` and `hasNoScheduledSignal`).

For position analysis, you have tools to get total percent closed, total cost closed, breakeven status, effective entry price, total invested units, total invested cost, unrealized PnL percentages and costs, DCA entry levels, partial close events, and entry prices and costs.

There are utility methods for calculating metrics like maximum drawdown and profit distances.

You can control the backtest process with methods like `stop` (to halt the test), `commitCancelScheduled` (to cancel a scheduled signal), `commitClosePending` (to close a pending position), and various `commit...` methods for managing partial profits, losses, trailing stops and take-profits, as well as average buy entries.

Finally, you can retrieve statistical data, generate reports and save reports to a file. You can also list the currently active backtest instances.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what’s happening during your backtests. It's like a diligent observer, tracking every signal event—when a signal is idle, opened, active, or closed.

It gathers information about each of these events and saves it to a SQLite database, allowing you to review and debug your strategy later. The service listens for these events using a signal emitter and ensures it's only actively listening once, preventing duplicate entries.

You can start receiving these events by calling the `subscribe` method, which will return a function you can use to stop listening. Similarly, the `unsubscribe` method cleanly stops the service from capturing any more events.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for trading signal events as they happen, keeping track of signals that have closed for each strategy you're testing. 

Think of it as a reporting engine that builds tables summarizing the performance of your signals. These reports are saved as markdown files, making them easy to read and share.

Here's a breakdown of what it does:

*   **Data Tracking:** It accumulates information about closed signals for each strategy, using a system that ensures data for different symbols, strategies, exchanges, and timeframes stay separate.
*   **Report Generation:** It can generate complete reports containing all the signal information.
*   **File Saving:** These reports are saved directly to disk in a structured directory, allowing you to easily track results over time.
*   **Clearing Data:** You can clear the accumulated data, either for a specific backtest or all of them, to start fresh.
*   **Event Handling:** It handles tick events, which are essential for tracking signals, and provides ways to subscribe and unsubscribe from these events.



The service utilizes a memoized storage to optimize performance and isolate data for different combinations of symbol, strategy, exchange, frame, and backtest.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests in a straightforward way. It takes care of managing background information like the strategy and exchange names, so you don't have to pass them repeatedly to different functions. 

Think of it as a helper that automatically sets up the necessary context before each step of the backtest process.

It uses a private service underneath, but exposes a public-facing method called `run` which lets you initiate the backtest for a specific symbol.  This `run` method gives you a stream of results—representing signals and order execution—making it easy to process and analyze the backtest outcome. You provide the symbol and some context data which is then used internally.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the process of running a backtest, focusing on efficiency and flexibility. It works by first retrieving the timeframes for the backtest, then stepping through each timeframe. 

When a trading signal appears, the service fetches the necessary historical data (candles) and executes the backtest logic. It then skips ahead in time until that signal is closed.

Importantly, the results are streamed as an asynchronous generator, which means it delivers results one at a time instead of building up a large array in memory – making it more efficient for large backtests. You can also stop the backtest early if needed. 

The `run` method is the primary way to start a backtest, taking a symbol as input and returning a generator that yields results representing the different states of a backtest (scheduled, opened, closed, or cancelled). It relies on several other services like `StrategyCoreService`, `ExchangeCoreService`, and `FrameCoreService` to perform the core tasks.

## Class BacktestCommandService

BacktestCommandService acts as a central access point for running backtests within the framework. Think of it as a helper that makes the backtesting tools available to different parts of your application.

It bundles together several other services—like those responsible for validating strategies, risks, and actions—to ensure everything runs smoothly and correctly.

The `run` method is the main function you’ll use; it kicks off the backtest for a specific trading symbol, providing information about the strategy, exchange, and frame being used. This method returns a sequence of results detailing what happened during each tick of the backtest, such as orders being opened, closed, or cancelled.


## Class ActionValidationService

The ActionValidationService helps you keep track of and confirm that your action handlers are set up correctly. It acts like a central manager for these handlers, allowing you to register new ones with `addAction`. Before you try to use an action, you can use `validate` to make sure it actually exists – this prevents errors and helps with debugging. 

To make things efficient, the service remembers (memoizes) whether an action is valid, so it doesn’t have to re-check unnecessarily.  If you need to see a complete list of all the action handlers you've registered, the `list` function provides that information. This service is a tool to organize, check, and manage your action handlers, ensuring they are properly defined and available when needed.

## Class ActionSchemaService

The ActionSchemaService helps you organize and manage the blueprints for your actions, ensuring they’re set up correctly and consistently. Think of it as a central place to register and verify the details of each action your system performs.

It uses a special registry to hold these blueprints in a type-safe way and makes sure any methods used by your actions are approved and follow the rules.

You can register new action blueprints, validate their structure, or even update existing ones with just a few changes, without having to recreate the entire schema.

The service provides functions to register action schemas, validate them before adding, and retrieve them later when needed. This helps in maintaining a clean and well-defined system for handling actions.


## Class ActionProxy

ActionProxy acts like a safety net around your custom trading logic. It's designed to prevent errors in your code from bringing down the entire trading system. Think of it as a wrapper that catches any mistakes made within your action handlers, logs them, and allows the process to continue running smoothly.

Essentially, it provides a consistent way to handle errors in functions like `init`, `signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `riskRejection`, `dispose`, and even creates a special, unprotected gateway for syncing signals. If any of these functions encounter a problem, ActionProxy ensures it’s recorded without stopping the trading process.

You don't directly create ActionProxy instances – they are built using `fromInstance`, which takes your action handler and parameters, effectively adding this layer of protection around it. It's a crucial component for making sure your trading strategies are robust and reliable.

## Class ActionCoreService

The `ActionCoreService` acts as a central hub for managing and executing actions within your trading strategies. It essentially takes the instructions defined in your strategy's schema and turns them into actions that can be performed.

It handles a lot of behind-the-scenes work, including fetching action lists, validating configurations, and making sure everything is set up correctly.

Here's a breakdown of what it does:

*   **Orchestrates Actions:** It takes a strategy's action list (defined in its schema) and systematically invokes the appropriate handlers for each action.
*   **Validation:** It thoroughly validates the strategy's setup – ensuring the strategy name, exchange, frame, and related risks and actions are all valid. It does this efficiently by remembering previous validations.
*   **Initialization:** It prepares each action for use by loading any persistent data or setting up initial conditions.
*   **Signal Handling:** It distributes various events (like market ticks, breakeven points, partial profit/loss notifications, and ping events) to the appropriate actions for processing.
*   **Resource Cleanup:**  It provides a way to safely shut down and clean up actions when a strategy is finished.
*   **Data Clearing:** Allows for clearing of action data, either for specific actions or globally.

Essentially, `ActionCoreService` is the engine that drives your trading strategies by converting their defined actions into reality, ensuring that all actions are correctly configured and executed.

## Class ActionConnectionService

The ActionConnectionService acts as a central dispatcher for different actions within your trading system. It takes requests for specific actions and makes sure they're handled by the right component, which is a `ClientAction` instance.

To improve performance, it remembers which `ClientAction` instances it’s already created, so it doesn’t have to make them again and again. The “memory” is tied to the strategy, exchange and frame it's operating in.

Essentially, it’s a smart routing system for actions, ensuring that events like breakeven triggers, partial profit adjustments, and scheduled pings all get directed to the correct place. It offers methods to signal events and dispose of action instances when they're no longer needed, and includes ways to clear its cached instances.

## Class ActionBase

This framework provides a base class, `ActionBase`, to help you build custom actions for your trading strategies. Think of it as a starting point for extending functionality like sending notifications, managing state, or collecting data.

It handles the boilerplate for you, logging events automatically and providing context about the strategy and action. You only need to focus on the custom logic you want to add.

The lifecycle is straightforward: initialization (`init`), then events fire during strategy execution (`signal`, `signalLive`, `signalBacktest`, etc.), and finally cleanup (`dispose`). Each event type covers specific scenarios like breakeven, partial profits/losses, and risk rejections.

You can customize actions to handle live trading, backtesting, or both, and the built-in logging makes it easier to understand what's happening within your strategy. The `dispose` method ensures proper resource cleanup when a strategy finishes.

