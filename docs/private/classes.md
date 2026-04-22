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

The WalkerValidationService helps you keep track of and make sure your parameter sweep setups – we call them "walkers" – are working correctly. It's like a central manager for these configurations, ensuring they exist before you try to use them.

You can add new walker configurations using `addWalker()`, and the service will keep a record of them. To confirm a walker is set up properly before running a process, use `validate()`. 

If you need to see all the walkers you've defined, `list()` will give you a complete list. The service also cleverly remembers validation results to speed things up.

## Class WalkerUtils

WalkerUtils helps you run and manage your trading walkers, which are essentially sets of strategies designed to test different approaches. It simplifies the process of running these walkers and provides tools for monitoring and reporting on their performance.

Think of it as a helper class that handles the complexities of running walkers, pulling in relevant information automatically.

Here's a breakdown of what you can do with WalkerUtils:

*   **Run walkers:** Easily start walker comparisons for specific trading symbols, passing along information like the walker's name.
*   **Run in the background:** Execute walkers without needing to see the immediate results, ideal for tasks like logging or triggering callbacks.
*   **Stop walkers:** Gracefully halt a walker's signal generation, preventing new signals while allowing existing ones to finish.
*   **Retrieve data:** Fetch complete results from all strategies within a walker.
*   **Generate reports:** Create comprehensive markdown reports summarizing a walker's performance.
*   **Save reports:**  Save those reports as files directly.
*   **List walkers:** See a list of all active walkers and their current status (like pending, running, or finished).

WalkerUtils is designed to be easy to use, providing a single, readily available instance to manage your walkers effectively. It keeps track of individual walker instances for each symbol to ensure proper isolation and prevent interference.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema definitions for walkers. It's designed to store these schemas in a way that's safe and reliable, using a specialized storage system. 

You can add new walker schemas using `addWalker`, and find them again later by their name using `get`.  Before adding a schema, `validateShallow` checks that it has the essential properties and that they're the right types. If you need to update an existing schema, `override` lets you make changes without replacing the entire definition.  Essentially, it's a central place to manage and access your walker schemas.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for updates as your strategies are tested and records the results in a database. 

This service helps you monitor your optimization process, track the best strategies you've found, and analyze how your strategies are improving over time.

You can use the `subscribe` method to start receiving updates and the `unsubscribe` method to stop. The service makes sure you don’t accidentally subscribe multiple times, which could cause problems. It also uses a logger to provide helpful debugging information.

## Class WalkerMarkdownService

WalkerMarkdownService helps create and store reports about your trading strategies, specifically for walkers—automated processes that test and analyze trading ideas. It listens for updates from the walker and keeps track of the results for each strategy being tested.

It provides functions to retrieve data, generate markdown tables to compare strategies, and save these reports to your logs directory.

You can subscribe to walker events to receive updates and later unsubscribe when you no longer need them. The service also lets you clear out old data, either for a specific walker or for all of them. It uses a special kind of memory to store the results, making sure each walker has its own separate space.

## Class WalkerLogicPublicService

This service helps manage and run walkers, which are essentially automated processes for analyzing trading strategies. It builds on a private service to automatically pass along important information like the strategy name, exchange, frame, and walker name – this makes it easier to keep track of what’s happening in your backtests.

The `run` method is the main way to use this service. You give it a symbol (like a stock ticker) and some context information, and it will execute the backtests for all your strategies, automatically passing the context data along. Think of it as a central hub for orchestrating and monitoring your trading strategy tests.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService is designed to manage and coordinate comparisons between different trading strategies. It handles the entire process, step by step, and keeps you informed along the way.

First, it begins running each strategy one after another. As each strategy finishes, you'll receive updates showing its progress. The service also continuously monitors the performance of each strategy, tracking the best metric observed so far. Finally, once all strategies have been executed, the service provides a complete report that ranks all strategies based on their performance.

Internally, it utilizes the BacktestLogicPublicService to perform the actual backtesting for each strategy.

The service has properties for logging, backtest logic, markdown formatting, and schema management.

The `run` method is the main entry point, taking a symbol, a list of strategies to compare, the metric to optimize for, and some context information. It then starts the comparison process and yields results for each completed strategy.

## Class WalkerCommandService

WalkerCommandService acts as a central point of access for interacting with the walker functionality within the backtest-kit framework. It's designed to be easily integrated into your application using dependency injection.

Think of it as a helpful layer that provides a straightforward way to work with the core walker logic.

It has several internal services like logger and validation services, which help in various operations.

The `run` method is the primary way to use the service. You give it a symbol to analyze, along with context details about the walker, exchange, and frame being used, and it will return a sequence of walker results. It allows you to trigger the core comparison logic and retrieve results in an asynchronous manner.

## Class TimeMetaService

The TimeMetaService helps you reliably get the current candle timestamp for your trading strategies, even when you're not directly inside the normal trading loop. It essentially keeps track of the latest timestamp received from your strategy for each symbol, strategy, exchange, and timeframe combination.

Think of it as a handy reference point for knowing what time it is in your trading world. 

It's designed to be simple to use: you request a timestamp, and it either provides it immediately if it knows it, or waits briefly for the information to become available. 

This service is automatically updated after each tick by the StrategyConnectionService and is registered as a singleton for easy access. To keep things clean, you'll want to clear the cached timestamps at the beginning of each new trading session.

## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals by providing reports and statistics. It gathers information from signal-open and signal-close events to give you insights into your trading activity.

You can use it to get overall statistics about your signals, like the total number of opens and closes.
It can also generate detailed markdown reports that show a history of your signals, including key details like entry and exit prices, take profit/stop loss levels, and profit/loss information.

These reports can be saved as files for later review and analysis. The class handles creating the necessary file directories for you.
Essentially, it provides a way to track and visualize the lifecycle of your trading signals.

## Class SyncReportService

The SyncReportService helps you keep a record of when your trading signals are created and closed. It listens for events related to signals – when they're initially set up (signal-open) and when they're exited (signal-close). 

Essentially, it’s designed to create a detailed audit trail for your trading activities, useful for tracking and review.

The service captures all the important details at each stage, like signal information when opened, and profit/loss and reason for closure when exited. It then stores these events so you can access them later.

You can tell the service to start listening for these events with `subscribe`, and to stop with `unsubscribe`. It ensures that it doesn't accidentally subscribe multiple times, and it handles the process of starting and stopping cleanly. A logger service is also available for debugging.

## Class SyncMarkdownService

This service is designed to automatically create and save detailed reports about your trading signals, specifically focusing on when signals are opened and closed. It listens for signal events and organizes them based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these signal events, and the service will automatically build markdown tables summarizing the lifecycle of each signal. It also keeps track of key statistics like the total number of signals, how many were opened, and how many were closed.

The reports are saved as markdown files, making them easy to read and share.  You can request reports for specific trading contexts or clear all the accumulated data when needed.  The service offers a convenient way to monitor and analyze the performance of your trading signals over time.

You can subscribe to start receiving and processing signal events. When you are done, you can unsubscribe to stop the processing and clear all data.

The `tick` method is the engine that processes each incoming signal event, adding it to the relevant storage and enriching it with helpful information like timestamps.

You can request reports, retrieve statistics, or clear all accumulated data for a specific combination of symbol, strategy, exchange, frame, and backtest.

## Class StrategyValidationService

This service acts as a central hub for managing and checking your trading strategies. It keeps track of all the strategies you've defined, ensuring they exist before you try to use them. 

You can use it to register new strategies with the `addStrategy()` function, which basically adds them to the system's internal registry.  The `validate()` function is a handy tool to verify that a strategy and any connected risk profiles or actions are all properly set up. To see a list of all your registered strategies, you can call `list()`. To help things run smoothly, the service also remembers previous validation results to avoid unnecessary checks.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's like a central hub for gathering data about strategy events, such as when a trade is closed, partially profits are taken, or stop-loss orders are triggered.

You can use it to pull out key statistics like how many times each action occurred, providing a high-level overview of your strategy's behavior.

It can also create detailed reports in Markdown format, showing you a table of all events with information like the price, percentages, and timestamps.  These reports offer a line-by-line breakdown of what happened during trading.

Finally, you can have it automatically save these reports to files, making it easy to track performance over time and share them if needed.  The files are named in a way that clearly identifies the symbol, strategy, exchange, and timeframe.


## Class StrategySchemaService

This service helps you organize and manage the blueprints, or schemas, for your trading strategies. It uses a special system to ensure these schemas are stored and handled in a reliable and type-safe way.

You can add new strategy schemas using `addStrategy()`, and then find them again later by their assigned name.

Here's a breakdown of what it offers:

*   It uses a logging system to track actions and help with debugging.
*   It keeps track of your strategy schemas in a structured way.
*   `register()` adds a new strategy schema to the system.
*   `validateShallow()` quickly checks if a new schema has all the necessary parts before it's officially saved.
*   `override()` allows you to update an existing strategy schema with only the changes you need.
*   `get()` lets you find a specific strategy schema by its name.

## Class StrategyReportService

This service helps you keep a detailed record of your trading strategy's actions, writing each event directly to a JSON file. Think of it as an audit trail for your strategy. 

To start logging events, you need to call `subscribe()`.  Once subscribed, each significant event – like canceling a scheduled trade, closing a pending order, taking partial profits or losses, adjusting trailing stops or take profits, setting a breakeven, activating a scheduled signal early, or making an average buy – is automatically logged.

The `unsubscribe()` function stops this logging and cleans things up.  It's safe to call even if you haven't subscribed yet. It’s designed to write information immediately, unlike other services that might hold data in memory. The `loggerService` property provides access to essential context information for logging.

## Class StrategyMarkdownService

This service helps you track and report on the actions your trading strategies take during backtesting or live trading. It collects data like when signals are canceled, positions are closed, or profit/loss targets are adjusted.

Think of it as a detailed log of what your strategy is doing. Instead of writing each event immediately to a file, it temporarily stores them in memory—up to 250 events per strategy and symbol—for more efficient reporting.

To start using it, you need to “subscribe” to begin collecting events.  Events are recorded automatically by other functions like `cancelScheduled` or `partialProfit`.  You can then use `getData` to retrieve statistics or `getReport` to create a nicely formatted markdown report summarizing those events.  `dump` is used to save these reports to a file.

When you're done, you'll “unsubscribe” to stop collecting events and clear all the temporary data.  This service provides a controlled way to analyze how your strategies perform.


## Class StrategyCoreService

This service acts as a central hub for managing trading strategies, providing various utilities for backtesting and live trading. It handles strategy validation, retrieves key position data like pending signals, costs, and PnL, and offers functions for actions like closing positions or canceling scheduled orders. It’s designed to inject relevant information into the trading process, ensuring that operations are executed within a consistent and controlled context. The service also provides methods for retrieving performance metrics like drawdown, profit distances, and durations, offering comprehensive insights into a strategy's behavior. It’s a critical component, used internally by other core services within the backtest-kit framework.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router, directing strategy-related actions to the correct trading strategy implementation. It intelligently manages and caches these strategies to optimize performance, ensuring that operations are directed to the right strategy based on the symbol, exchange, and trading frame.

Here's a breakdown of its key functions:

*   **Smart Routing:** When you call a strategy method (like `tick()` or `backtest()`), this service figures out which specific strategy implementation is responsible for handling it.
*   **Performance Boost:** It keeps a record of frequently used strategy implementations, avoiding the overhead of repeatedly creating them.
*   **Preparation is Key:** Before any operations, it ensures the strategies are fully initialized.
*   **Handles Both Live and Historical Data:** It supports both live trading (`tick()`) and historical analysis (`backtest()`).

The service provides several helpful methods for inspecting the state of a strategy's active position, including:

*   **Signal Details:** You can fetch pending or scheduled signals, along with information like estimated duration, countdown, and profit/loss metrics.
*   **Position Information:** It provides data like cost basis, entry prices, partial close details, and drawdown metrics.
*   **Control Actions:** You can manually close positions (`closePending`), adjust trailing stops (`trailingStop`), or activate scheduled signals early.

The service is built with several supporting services to handle tasks like logging, risk management, exchange connections, and time/price data management.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage and store data related to trading signals. Think of it as a central hub for how your trading framework keeps track of signals—whether they're open, closed, scheduled, or canceled.

It's designed to be adaptable, allowing you to easily switch between different storage methods.  You can choose to persist signals to disk, store them only in memory for a quick test, or even use a dummy adapter that does nothing at all – great for isolating specific parts of your strategy.

The adapter handles common events like signals being opened, closed, scheduled, or canceled, relaying these actions to your chosen storage method. You can also retrieve signals by their ID or list all stored signals. 

There are several built-in options for storage: persistent storage, in-memory storage, and a dummy adapter for testing. If you need something custom, you can also supply your own storage adapter. It's important to clear the cached instance when the working directory changes, ensuring a fresh start for your strategy.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` helps manage how your backtest data is stored, giving you flexibility in where that data lives. It’s designed to be adaptable, allowing you to easily switch between different storage methods like persistent storage on disk, keeping data in memory only, or even using a dummy adapter that doesn't actually save anything.

This adapter acts as a middleman, handling events like signals being opened, closed, scheduled, or canceled, and forwarding these actions to the currently selected storage method.

You can change the storage backend on the fly using functions like `usePersist`, `useMemory`, or `useDummy` to suit your testing needs.  The `useStorageAdapter` function lets you provide a custom storage implementation if you want something really specialized.  The `clear` function ensures a fresh start, particularly when your working directory changes, preventing unexpected behavior across different backtest runs. Essentially, it makes data handling during backtesting configurable and reliable.

## Class StorageAdapter

The StorageAdapter is your central hub for managing both backtest and live trading signals. It automatically keeps track of signals as they come in, making sure everything's stored correctly.

You can easily access signals, whether they're from your backtesting simulations or from live market data. 

To prevent any issues with duplicate storage, it uses a special mechanism to ensure that subscriptions only happen once.

If you need to stop the signal storage, you can disable it, and it’s safe to disable it multiple times.

Need to find a specific signal?  You can search by its unique ID.

You can also view all the signals generated during backtesting separately, or all the live signals.

## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies, ensuring they're properly set up before your backtests run.

Think of it as a central hub for your sizing rules. You can register new sizing strategies using `addSizing`, so the service knows about them.

Before running calculations, `validate` checks if a sizing strategy actually exists – preventing errors and making sure everything is in order. To make things fast, the validation results are cached so you don’t have to repeatedly check. 

Finally, if you want to see what sizing strategies you've registered, `list` gives you a complete overview.

## Class SizingSchemaService

The SizingSchemaService helps you manage and store sizing schemas in a safe and organized way. It uses a special registry to keep track of your schemas, ensuring they're consistently structured.

You add new sizing schemas using the `addSizing` function (or `register` method), and you can retrieve them later by their assigned names using `get`.

If you need to update an existing sizing schema, the `override` function allows you to make changes without replacing the entire schema.

Before a sizing schema is added, `validateShallow` checks it to make sure it has all the necessary properties and the correct data types, ensuring everything is set up correctly from the start. The service utilizes logging capabilities for monitoring and debugging.

## Class SizingGlobalService

The SizingGlobalService is a central tool for determining how much to trade in each operation. It acts as a wrapper around other services to perform position size calculations.

Think of it as the engine that figures out how much capital to allocate to a trade, considering various factors.

It relies on services for logging, validating sizing rules, and connecting to the necessary infrastructure.

The `calculate` method is the core functionality, taking parameters like risk tolerance and market conditions to return a calculated position size. This is the method used both internally and by the public API to determine trade sizes.


## Class SizingConnectionService

This service acts as a central point for performing sizing calculations within the backtest kit. It intelligently directs sizing requests to the correct sizing implementation based on a name you provide.

To optimize performance, it remembers the sizing implementations it's already created, so it doesn't have to recreate them every time you need them.

You’ll use it to get a `ClientSizing` instance for a specific sizing method and calculate the appropriate position size, taking into account your risk parameters. When no sizing configuration is available, you can use an empty string for the sizing name. It uses a `sizingName` parameter to determine which sizing method to apply and handles the underlying calculations.

## Class SessionUtils

The `SessionUtils` class helps keep your backtest sessions independent of each other. It's designed to prevent data or events from one backtest affecting another.

Think of it as creating a clean slate for each test.

The `createSnapshot` property lets you essentially "freeze" the existing event listeners for global subjects. This creates a temporary backup, clearing the current listeners so a new session can operate without interference. You can then restore these listeners later to revert back to the original state.

## Class ScheduleUtils

This class offers handy tools for understanding and reporting on how your trading signals are being scheduled. It keeps track of signals waiting to be executed, any that are cancelled, and provides insights into cancellation rates and wait times.

Think of it as a central place to view and export data related to signal scheduling for a specific strategy and trading symbol.

You can request data directly, such as statistics for a particular symbol and strategy combination.

It also lets you generate nicely formatted markdown reports summarizing the scheduling activity.

Finally, you can easily save these reports as files for later review. The class is designed to be easily accessible throughout your backtesting framework.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing. It monitors signals as they're scheduled, activated, and potentially cancelled, recording important details in a database. 

Think of it as a detective for your trading system, investigating delays and potential issues related to scheduled orders.

It works by listening for signal events and logging them, calculating how long each signal takes to go from scheduled to active or cancelled. This lets you analyze and optimize your trading strategy.

You can subscribe to the service to start monitoring signals and unsubscribe when you no longer need it. The service also ensures you don't accidentally subscribe multiple times. 

Finally, it uses a logger service for helpful debugging messages, which helps you understand what the service is doing.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and analyze the timing of your trading signals. It monitors when signals are scheduled and cancelled, keeping a record of each event for specific strategies. This service automatically generates nicely formatted markdown reports summarizing these events, including helpful statistics like cancellation rates and average wait times.

You can subscribe to receive these events in real time, and the service ensures you don't get overloaded with duplicate subscriptions.

The service stores data in isolated storage areas, so each combination of symbol, strategy, exchange, frame, and backtest has its own dedicated record.  You can retrieve specific data or reports for any combination, or clear out the entire history.  These reports are saved to disk, making it easy to review performance and identify potential areas for optimization.


## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management setups and make sure they're all valid. It's like a central registry for your risk profiles, ensuring you don't try to use ones that don't exist.

Think of it as a guardian for your risk configurations – it remembers them and checks if they're good to go before you proceed. To speed things up, it remembers the results of previous checks, so it doesn’t need to do the same validation over and over.

Here’s what you can do with it:

*   You can register new risk profiles using `addRisk`.
*   You can check if a specific risk profile exists using `validate`.
*   You can see a complete list of registered profiles with the `list` function.

The service also keeps a record of what's going on with a logger service and stores risk profiles in a special map called `_riskMap`.

## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejection events within your trading system. It acts like a central hub for gathering and presenting data related to these rejections.

Think of it as a tool that collects information about when and why trades were rejected, providing statistics and generating easy-to-read reports. You can request summarized data like the total number of rejections, broken down by symbol and strategy.

It can also produce detailed markdown reports showing each individual rejection event, including the symbol, strategy, position, price, and reason for the rejection. These reports are useful for identifying patterns and understanding potential issues.

Finally, the class lets you automatically save these reports to files, organized by symbol and strategy, making it easy to track and review risk rejection history. It essentially turns raw rejection data into actionable insights.

## Class RiskSchemaService

This service helps you keep track of and manage different risk schemas in a safe and organized way. 

It uses a special system to store these schemas, making sure they are consistent and predictable.

You can add new risk schemas using the `addRisk()` method, and find them again by their name using `get()`.

If you need to update an existing schema, the `override()` method lets you make changes without replacing the entire schema.

Before adding a new schema, `validateShallow()` checks that it has all the necessary information in the correct format.

The `register()` method is used to formally add a risk schema to the system. 

Behind the scenes, it relies on a logging system to track its actions and a registry to store the schemas.

## Class RiskReportService

This service is designed to keep a record of when risk controls reject trading signals. It acts like a detective, noting down every time a signal is blocked by the risk management system.

The service listens for these rejection events and stores details such as why the signal was rejected and what the signal was.

This data is then saved so it can be reviewed later for analysis and auditing – helping to understand and improve the risk controls.

You can tell the service to start listening for rejection events using `subscribe()`, which will give you a way to stop listening later.  Similarly, `unsubscribe()` lets you stop listening if you no longer need to record rejected signals. It's built to prevent accidental double-subscriptions, ensuring things stay under control.

## Class RiskMarkdownService

The RiskMarkdownService helps automatically create and save reports detailing risk rejections in your trading system. It keeps track of every time a rejection occurs, organizing them by the symbol and strategy being used.

The service generates nicely formatted markdown tables showing the specifics of each rejection, and also provides useful statistics like the total number of rejections, broken down by symbol and strategy. These reports are saved to your disk in a designated directory.

To use it, you subscribe to a stream of risk rejection events, and the service handles the rest – accumulating data and generating the reports. You can then request data, generate reports, or clear out the accumulated data as needed. You also have the option to clear data for a specific combination of symbol, strategy, exchange, frame, and backtest, or clear everything at once.

## Class RiskGlobalService

RiskGlobalService is a central component responsible for managing risk-related operations within the trading framework. It handles the validation of risk configurations and acts as a bridge between the trading strategy and the underlying risk management system. 

Think of it as a gatekeeper that ensures trades stay within defined limits. 

It leverages several services for specific tasks, including validating risk, exchange, and frame configurations. It also caches validation results to avoid unnecessary repetitive checks.

Key functions include checking if a trading signal is permissible based on risk rules, registering new open positions with the risk system, removing closed positions, and providing a way to completely reset all risk data or clear data for a specific risk configuration. This service is crucial for safe and controlled trading within the backtest-kit environment.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It intelligently directs risk-related operations to the correct risk management component, ensuring that each trading strategy and exchange adheres to its defined risk limits. 

Think of it as a traffic controller for risk, making sure each signal gets evaluated by the appropriate risk rules.  It remembers which risk rules apply to which exchanges and trading frames, avoiding repetitive calculations by storing frequently used risk rules in a cache.

The `getRisk` function is key—it’s how the service retrieves the correct risk rules based on the specific trading scenario. This function utilizes a caching mechanism to improve efficiency.

The `checkSignal` function is responsible for validating signals against those risk rules, considering factors like portfolio drawdown and position exposure. If a signal violates the rules, it will trigger a notification to inform the system.

The `addSignal` and `removeSignal` functions manage the lifecycle of trading signals within the risk management system, essentially registering and de-registering them. Finally, the `clear` function provides a way to flush the cached risk rules, useful for refreshing or resetting risk configurations.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage and store your trading data in a structured way. It’s designed to be flexible, letting you easily swap out different storage methods without changing your core code.

It keeps track of your reports – like backtest results, live trading data, or walker runs – and makes sure you're only using one storage instance for each type of report. This helps prevent conflicts and ensures consistency.

The adapter uses a "ReportFactory" to create these storage instances, defaulting to a simple JSONL (JSON lines) append method. You can change this factory if you want to use a different storage system.

When you first write data for a particular report type, the adapter automatically sets up the necessary storage.

There's a handy `writeData` method that handles writing the data to the correct storage location.

You can easily change the storage adapter using `useReportAdapter`, or temporarily disable writing to storage entirely with `useDummy`. It’s also possible to revert to the default JSONL storage with `useJsonl`.

If your working directory changes, it's recommended to call `clear` to refresh the storage instances.

## Class ReportUtils

ReportUtils helps you control which parts of the trading system generate log files. It lets you turn on and off logging for things like backtests, live trading, strategy analysis, and performance monitoring.

The `enable` function lets you pick and choose which log streams you want active. When you use `enable`, the system starts recording events and writing them to JSONL files, adding useful information to each entry.  It’s really important to remember to call the function it gives you back to stop the logging later, otherwise you could run into memory problems.

Conversely, `disable` lets you stop logging for specific areas without affecting the rest.  It’s a quick way to pause logging, but it doesn’t return anything for you to clean up afterwards – it just stops the logging immediately.

This class is designed to be expanded upon by other parts of the system that need customized reporting.

## Class ReportBase

The ReportBase class helps you record events in a standardized JSONL format, making it easy to analyze trading activity later. It creates a single file for each type of report, appending new data as it goes.  The writing process is designed to be reliable, handling potential slowdowns and automatically creating necessary directories.

You can search the recorded data based on criteria like the trading symbol, strategy, exchange, timeframe, signal ID, or walker name. 

Initialization happens only once, ensuring the directory and write stream are set up correctly. The write function itself includes safeguards, preventing data loss due to timeouts or buffer issues. Essentially, this provides a structured and dependable way to log your backtesting events for detailed analysis.


## Class ReportAdapter

The ReportAdapter helps manage and store your trading reports in a flexible way. It acts as a central point for handling where those reports are saved, allowing you to easily switch between different storage methods.

You can customize how reports are saved by providing your own adapter constructor. The system intelligently caches these storage connections, ensuring you don't create too many open files. 

The system defaults to storing reports in JSONL files, and it only starts creating those files when you first write a report.  It also automatically logs events related to report generation. 

If you need to temporarily stop saving reports – perhaps during development or testing – you can switch to a dummy adapter that simply discards any writes. Finally, you can clear the cached adapters to force a refresh when things like your working directory change.

## Class ReflectUtils

This utility class provides a way to easily track key performance metrics for your trading strategies, such as profit and loss, peak profit, and drawdown, during both backtesting and live trading. It acts as a central point to access this information, handling the underlying complexity of calculations and validations. Think of it as a convenient tool for understanding how your strategies are performing.

It offers a suite of functions to query various position-related statistics:

*   **Profit & Loss (PnL):** You can retrieve the unrealized PnL in both percentage and dollar terms.
*   **Peak Performance:** Get the highest profit price, timestamp, and PnL achieved, along with whether breakeven was reachable at that point.
*   **Time-Based Metrics:**  Track how long a position has been active, waiting, or in drawdown.
*   **Drawdown Analysis:** Discover the worst drawdown (loss) experienced, including the price, timestamp, PnL, and how long ago it occurred.
*   **Distance Metrics:** Determine the distance between the current price and the highest profit or worst drawdown, expressed as PnL percentage or cost.

These methods all work in both backtest and live environments, and require you to specify the strategy, exchange, and frame names, along with a backtest boolean. The `backtest` parameter allows you to distinguish between live and historical data when calculating. It's designed as a singleton, meaning there's only one instance of this class, making it easy to access anywhere in your code.

## Class RecentLiveAdapter

This component helps manage and retrieve recent trading signals, providing flexibility in how that data is stored. It allows you to choose between storing signals persistently (on disk) or just in memory, letting you easily switch depending on your needs. The core functionality revolves around a storage adapter that can be swapped out, making it adaptable to different storage solutions.

You can control which storage method is used with commands like `usePersist` for disk-based storage or `useMemory` for temporary storage.  The `useRecentAdapter` function gives you even finer control by letting you specify the exact class to use for managing the signals.

The component also provides straightforward ways to get the latest signal for a particular trading context, figure out how long ago a signal was created, and respond to activity pings. Essentially, it acts as a convenient layer for accessing and managing recent trading signals while offering customization in how those signals are stored.


## Class RecentBacktestAdapter

This component, `RecentBacktestAdapter`, provides a flexible way to manage and access recent trading signals. It acts as a bridge, allowing you to easily swap out how and where those signals are stored. By default, it uses an in-memory storage, which is simple and fast. 

However, you can also switch to a persistent storage option that saves signals to disk. This provides more durability and allows you to retrieve signals even after your application restarts. 

The adapter handles retrieving signals, calculating how long ago they were created, and responding to ping events—it all passes these requests along to the currently selected storage method. You can change the storage being used at any time, and it remembers this choice for future operations. It also offers a convenient way to clear the entire system and go back to the default in-memory storage.

## Class RecentAdapter

The RecentAdapter is the central hub for managing and accessing recent trading signals, whether you're running a backtest or a live trading system. It automatically keeps track of the latest signals received, ensuring you always have the most up-to-date information.

It subscribes to updates and uses a clever mechanism to prevent redundant subscriptions, keeping things efficient.

You can easily retrieve the most recent signal for a specific trading pair and strategy using `getLatestSignal`.  Need to know how long ago that signal was generated? `getMinutesSinceLatestSignalCreated` provides that detail.

Finally, `enable` and `disable` functions control the signal storage process – enabling starts the subscription, while disabling safely cleans up and unsubscribes.

## Class PriceMetaService

The PriceMetaService helps you get the current market price for a specific trading setup – think symbol, strategy, exchange, and timeframe – without being directly in the middle of a trade execution. It keeps track of these prices and updates them automatically as new data comes in.

Essentially, it's a central place to look up prices when you need them outside of the normal trading process.

It ensures you're always working with the most recent price information, with a built-in timeout to wait for the first price if needed. If you're already in a trading execution, it uses a different method for obtaining the price, but otherwise it gets the price from its stored cache.

You can clear this service's memory of prices to refresh the data and ensure accuracy, either for all prices or just for a specific trading setup. This cleanup is especially useful when starting a new trading strategy.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade in your backtests. 

It includes several pre-built methods to calculate position sizes, like a fixed percentage risk approach, the Kelly Criterion (which aims to maximize growth), and a method based on Average True Range (ATR) to account for volatility. 

Each of these methods has built-in checks to make sure the information you provide is appropriate for the calculation being performed. The calculations themselves are designed to work within the backtest-kit trading framework, and they take into consideration factors like your account balance, the asset's price, and relevant parameters specific to the chosen sizing method.


## Class Position

The Position class offers tools to help you determine where to place your take profit and stop loss orders when trading. It simplifies the process by automatically adjusting the direction of your calculations based on whether you're holding a long or short position.

There are two primary functions available:

*   **moonbag:** This function calculates take profit and stop loss levels for a strategy where your take profit is set at a fixed percentage above (for long positions) or below (for short positions) the current price.

*   **bracket:** This function allows for more customization. It computes take profit and stop loss levels based on percentages you specify for both your take profit and stop loss targets.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, ensuring data integrity and making it easy to resume work later. It's designed to keep track of signals and their state, storing each one as a separate file.

The class utilizes a clever system to avoid creating duplicate storage instances, and it’s adaptable to different storage methods if needed.

You can easily swap between different storage mechanisms, like using the built-in JSON format or a dummy adapter for testing purposes.

When the underlying storage location changes, the `clear` function can be used to refresh the storage.

The `readStorageData` function recovers your signal data from disk, while `writeStorageData` saves changes reliably, even if the application crashes mid-write. These methods are key parts of how the live and backtest modes maintain their states.

## Class PersistSignalUtils

This class provides tools for safely managing and saving your trading signals, ensuring they're not lost even if something goes wrong. It keeps track of signals for each strategy individually, using a special system that remembers where to store them.

You can customize how these signals are stored using adapters, or use the built-in JSON format.

The class also offers ways to clear the saved data or, for testing purposes, pretend like it's saving data when it's actually doing nothing.

Specifically, the `readSignalData` method retrieves saved signals, and `writeSignalData` saves them, with built-in protections to prevent data corruption during unexpected interruptions. If the signal doesn't exist, reading will return nothing.


## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps keep track of scheduled signals, especially when dealing with automated trading strategies. It's designed to make sure those signals are saved reliably, even if your program crashes.

It uses a clever system to manage where this information is stored, creating separate storage locations for each strategy you're using. You can even customize how this storage works by plugging in your own adapters.

The class provides methods for retrieving and saving this data, ensuring changes are made safely and consistently. It automatically handles reading the data to restore previous states and writing data in a way that prevents corruption.

For strategies, you might need to clear the saved data when the working directory changes, and the `clear` method is for just that. You can also choose between different persistence methods, like using standard JSON files or a "dummy" adapter that simply ignores any saves.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and loaded, particularly for risk management. It’s designed to keep track of your active positions and ensure that data isn't lost, even if something goes wrong.

It keeps track of different risk profiles and uses a special system to make sure your data is stored reliably.

You can even customize how it stores the data – for example, you can choose to use a JSON file, or even just discard the data for testing purposes.

The `readPositionData` method retrieves your saved positions, while `writePositionData` stores any changes. These methods handle writing data safely to prevent corruption. If the base directory changes, be sure to clear the cache to ensure new storage instances are created.

## Class PersistRecentUtils

This utility class helps manage how recently generated trading signals are saved, particularly for backtesting and live trading scenarios. It ensures that the saved signals are stored in a consistent and reliable way, even if there are unexpected interruptions.

The class keeps track of storage locations based on factors like the traded asset (symbol), the trading strategy used, the exchange involved, and the timeframe of the data.

It lets you customize how the data is stored, giving options to use standard JSON files or even a dummy adapter that just ignores write requests for testing purposes.

You can also clear the cache of storage locations if needed, which is helpful when the working directory changes.

The `readRecentData` method retrieves the last saved signal for a specific trading context, and if no signal has been saved it will return null. The `writeRecentData` method ensures signals are saved securely to disk using atomic operations to prevent data loss.

## Class PersistPartialUtils

This class helps manage and safely store information about partial profits and losses, particularly useful when you need to keep track of progress across different sessions. It remembers where to store this data for each symbol and strategy combination, so you don’t have to re-compute it every time.

It supports different ways of storing this data, allowing you to plug in your own custom storage solutions. The data is written in a way that ensures it's protected even if the application crashes unexpectedly.

You can use it to switch between a standard JSON format for storage, a dummy adapter that ignores writes for testing, or a custom adapter you build yourself. The `clear` method is helpful for refreshing this stored data when the program's working directory changes. It reads data from disk to restore the state, and writes data back to disk when changes are made.

## Class PersistNotificationUtils

This class provides tools for managing how notification data is saved and loaded. It handles creating storage instances, allows you to customize how data is stored, and ensures that changes are written safely, even if the program crashes. Each notification is saved as its own file, making it easy to manage individual pieces of data.

The `readNotificationData` function retrieves all the saved notification information, and `writeNotificationData` saves new or updated information to disk, doing so in a way that prevents data loss. You can also change how data is persisted by using custom adapters or switching between JSON, a dummy adapter (which effectively discards changes), or other options. Finally, the `clear` method can be used to refresh the storage if the working directory changes.



The `PersistNotificationFactory` and `getNotificationStorage` properties give access to core storage functionalities, while `usePersistNotificationAdapter` allows you to integrate your own custom storage solutions.

## Class PersistMemoryUtils

This utility class helps manage how your trading memory is saved and loaded persistently, ensuring your data survives crashes. It cleverly keeps track of storage locations based on signal identifiers and bucket names, organizing data in JSON files within a specific directory structure. 

You can customize how this data is stored by plugging in your own storage adapters, allowing for different persistence mechanisms. The class provides methods to read, write, and delete memory data, all handled carefully to avoid data corruption. 

It also includes a handy way to clear the storage cache when needed, like after changes to the working directory. Finally, there’s a way to temporarily use a "dummy" adapter that just ignores all write attempts, useful for testing or preventing accidental data persistence. It allows listing all memory entries, which is crucial for rebuilding search indexes.

## Class PersistMeasureUtils

This class, `PersistMeasureUtils`, helps manage how cached data from external APIs is stored persistently, like on disk. Think of it as a way to remember API responses so you don't have to constantly re-fetch them.

It uses a system where each piece of cached data is organized into a "bucket" based on a timestamp and symbol.  You can even provide your own custom way of storing and retrieving this data through adapters.

Key functionalities include reading and writing cached data, ensuring operations are handled safely, and managing the cache's overall state.  It allows you to remove cached entries without actually deleting them from disk (a "soft delete").

The `listMeasureData` function allows you to see all the cached keys within a specific bucket, while `clear` resets the entire cache.  For quick testing or debugging, a dummy adapter is available that simply discards any data written. Finally, you can switch back to the standard JSON adapter whenever needed.

## Class PersistLogUtils

This class provides tools for reliably saving and retrieving log data. Think of it as the behind-the-scenes engine that makes sure your trading logs don’t get lost, even if something unexpected happens.

It handles the storage of log entries, creating a separate file for each entry to ensure individual data integrity. It also allows you to plug in different ways of storing the logs – you can use the built-in JSON method, a custom solution, or even a dummy adapter that just throws away the data for testing purposes.

The `readLogData` function retrieves the persisted logs, while `writeLogData` saves them to disk using a technique that helps protect against data corruption. It's important to clear the cached storage if your working directory changes, like when restarting a strategy, to ensure a fresh start with the new location. The system's also built to be "crash-safe," meaning it tries to keep your logs secure even if the program has unexpected issues.


## Class PersistIntervalUtils

This framework component manages how information about completed intervals is saved and retrieved, helping to prevent repeated actions for the same time period. It keeps track of which intervals have already fired, storing this information in files within a designated directory (`./dump/data/interval/`). 

The system uses a persistence layer to record whether an interval has fired for a specific combination of factors. If a record exists, it means the interval is considered done; if it doesn't, the function will run again.

You can customize how this information is stored, choosing from options like a JSON-based system or a dummy adapter that simply discards changes. A "soft delete" mechanism allows intervals to be marked as cleared without permanently removing the data, ensuring they can be re-evaluated later. The `clear` method helps refresh the system's memory when the working directory changes. It also provides a way to list all existing recorded intervals for a specific time bucket.

## Class PersistCandleUtils

This utility class helps manage and store historical candle data for trading strategies, acting as a cache. It organizes each candle as a separate JSON file, making it easy to locate and retrieve specific data. To ensure data reliability, it only returns cached data if the complete set of requested candles is available; otherwise, it indicates a cache miss.

The system automatically refreshes the cache when data is incomplete, keeping it up-to-date. It's designed to work reliably, using techniques that ensure file operations are handled safely and consistently.

You can customize how data is stored by registering different persistence adapters. There's also a helpful function to clear the cache, which is useful when the base storage directory changes during a trading strategy. Finally, you can choose to use a dummy adapter for testing purposes, which effectively ignores any data being written.

## Class PersistBreakevenUtils

This utility class manages how breakeven data is saved and loaded from disk, making sure your strategy's progress isn't lost. It handles the underlying file storage, creating directories and files as needed, and importantly, uses a safe writing process to prevent data corruption. The class keeps track of storage for each symbol, strategy, and exchange combination, and it remembers these storage locations to avoid creating them repeatedly.

You can customize how the data is saved, either by reverting to the standard JSON format or by using a 'dummy' adapter that doesn’t actually save anything—useful for testing. If your working directory changes, you can clear the storage to force a refresh. Finally, it's designed to be a single, globally accessible component, ensuring consistency across your backtesting environment.

## Class PersistBase

This class provides a foundation for saving data to files in a reliable way. It handles the mechanics of writing to files safely, even if there are interruptions, and automatically checks for and cleans up any damaged files. 

It organizes your data by entity name, storing each entity's information in a dedicated file within a specified base directory. The class ensures that the directory exists and is valid before you start saving or retrieving data. 

You can easily check if a particular piece of data exists, read it back out, and write new data, all while knowing the underlying file operations are handled securely. It also provides a way to list all the entity IDs that are currently stored.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to execute. It works by listening for timing signals, recording details like how long each step takes, and saving this information to a database.

Think of it as a detective for performance bottlenecks, helping you identify slow areas in your code. 

You can tell it to start listening for these signals, and it will automatically begin recording. When you're done, you can tell it to stop listening. 

The system prevents you from accidentally subscribing multiple times, which could lead to confusion. It gives you a function to easily stop listening when you no longer need it. It uses a logger to output debugging information as well.

## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you understand how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like average, minimum, maximum, and percentiles. It then creates detailed reports in Markdown format, which are saved to your disk, making it easy to analyze bottlenecks and identify areas for improvement.

You can subscribe to receive performance events, and there's a way to unsubscribe when you no longer need them. The `track` method is used to record performance data as it happens.

You can retrieve performance statistics for a specific trading strategy and symbol, and generate reports to see how it's doing. There’s also a way to clear all accumulated performance data if you want to start fresh. Finally, you can choose which data columns to include in the generated reports.

## Class Performance

The Performance class is your tool for understanding how your trading strategies are performing. It allows you to gather key statistics about a specific strategy and symbol combination, giving you a deep dive into metrics like duration, volatility, and percentile ranges to spot potential bottlenecks.

You can retrieve performance data as a structured object, enabling custom analysis or integration into other systems.

Furthermore, this class simplifies report generation, automatically creating readable markdown reports that summarize the performance analysis and identify areas where your strategy might need optimization.

Finally, you can easily save these comprehensive reports to your hard drive, making it simple to track progress and share your findings. The reports will be saved in a dedicated performance folder, automatically created if it doesn't exist.

## Class PartialUtils

This class offers handy tools for analyzing and reporting on partial profit and loss data. It helps you understand how your trading strategies are performing by providing statistics and detailed reports.

You can use it to get aggregated data like total profit/loss counts for specific symbols and strategies. It also generates easy-to-read markdown reports that show a breakdown of individual profit and loss events, including details such as the trade action, symbol, strategy, signal ID, position, level, price, and timestamp.

Furthermore, this class simplifies the process of saving these reports to files, automatically creating the necessary directories and using a consistent naming convention. It's a great way to keep track of your strategy's progress and share results.

The data comes from events tracked by another component, so it’s essentially pulling information and formatting it in a useful way. You’ll specify the symbol, strategy name, exchange, and frame when requesting data or generating reports.

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are performing by recording every time you take a partial profit or loss. 

It listens for signals whenever a partial position is closed, whether it's a gain or a loss. This allows you to analyze your trading strategy and see exactly where profits and losses are occurring.

You can easily set it up to receive these signals and automatically log the details of each partial exit, including the price and level at which it happened. The service handles saving this information to a database for later review.

To prevent accidental duplicate subscriptions, it uses a system that ensures it only listens once. You can subscribe to these signals, and when you are done, an unsubscribe function stops the service from receiving further updates.

## Class PartialMarkdownService

The PartialMarkdownService helps you create reports detailing your trading performance, specifically focusing on partial profits and losses. It listens for signals indicating profits or losses and keeps track of these events for each symbol and strategy you're using.

It automatically generates nicely formatted markdown tables summarizing these events and provides overall statistics like total profit and loss counts. These reports are saved to disk, making it easy to review your trading activity over time.

You can subscribe to receive these events, and the service ensures you won’t be subscribed multiple times. The service also allows you to retrieve accumulated data, generate reports, save them to a specified location, or clear the stored data, either for specific trading setups or everything at once. It uses a storage system that isolates data for each unique combination of symbol, strategy, exchange, frame, and backtest.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profit and loss information within the trading framework. Think of it as a middleman that sits between your trading strategy and the underlying connection layer, ensuring everything is logged and validated.

It's designed to be injected into your trading strategies, making it easy to monitor and control how partial profits and losses are handled. 

The service relies on several other components for tasks like validating strategy configurations and managing connections, and it logs all actions for greater transparency.

Specifically, it provides functions to record when profit or loss levels are reached, and to clear the partial state when a trade closes. It ensures these operations are logged before passing them on to the connection layer for execution.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for each trading signal. It acts as a central hub, creating and maintaining records for each signal's performance.

Think of it like a registry that keeps track of each signal, ensuring there's only one record for each. These records, called ClientPartial instances, are cached for efficiency and are automatically cleaned up when a signal is closed, preventing unnecessary memory usage.

The service provides methods for recording profits, losses, and clearing the state of a signal. When a profit or loss is triggered, the service finds the corresponding record, if it doesn't exist, creates it, and then passes the information along.  Similarly, when a trade closes, it handles the final clearing of the profit/loss record.

This system is integrated with other parts of the trading framework, specifically through the ClientStrategy, and uses caching to optimize performance. It also keeps track of events related to profit and loss, allowing for monitoring and analysis.


## Class NotificationLiveAdapter

The `NotificationLiveAdapter` provides a flexible way to manage and send notifications related to your trading strategies. It acts as a central point, allowing you to easily swap out different notification methods without modifying your core strategy logic.

Think of it as a pluggable system: you can choose how your notifications are handled—whether they're stored in memory, persisted to disk, or simply ignored (using the dummy adapter).

The adapter handles various events like signal updates, profit/loss notifications, strategy commits, and errors, forwarding these to the currently selected notification method.

You can easily change the notification backend using methods like `useDummy`, `useMemory`, and `usePersist`, which switch between different notification implementations. `useNotificationAdapter` lets you completely customize the notification backend. If the underlying directory where notifications are stored changes, it's important to call `clear` to reset the adapter and ensure it uses the correct base path. `getData` allows you to retrieve the notifications currently stored and `dispose` clears them.

## Class NotificationHelperService

This service helps manage and send out notifications related to signals, particularly within the backtesting environment. It's designed to ensure that validations happen efficiently—it remembers results to avoid repeating checks for the same situation.

You'll find it working behind the scenes when your active ping callbacks (`onActivePing`) need to communicate information.

Here's a breakdown of what it does:

*   **Validation:** It checks the strategy, exchange, frame, risk, and action setups to make sure everything is configured correctly.  This validation is optimized so it only runs once for each unique combination of strategy, exchange, and frame.
*   **Notification Emission:** When it needs to send a signal notification, it first validates the configurations (using its memoized validation), then figures out the details of the pending signal, and finally sends that notification out to anyone who's listening.

## Class NotificationBacktestAdapter

This component manages notifications during backtesting, offering a flexible way to handle them. It uses an adapter pattern, letting you easily swap out how and where notifications are stored or sent.

By default, notifications are kept in memory, but you can switch to storing them persistently on disk or to a dummy adapter that does nothing – perfect for testing or when you don't need to save notifications.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods all pass notification data to the currently selected adapter. The `getData` method retrieves any stored notifications, and `dispose` clears them.

If your backtesting environment changes (like when the working directory updates), calling `clear` ensures you're using a fresh, default in-memory adapter. You can easily change the adapter being used with `useNotificationAdapter`, `useDummy`, `useMemory`, and `usePersist` methods.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for handling notifications, whether you're running a backtest or a live trading environment. It automatically keeps track of signal updates, offering a single place to access both backtest and live notifications. To prevent unnecessary subscriptions, it uses a feature that ensures each signal source is only subscribed to once.

You can start tracking notifications by enabling the adapter, which subscribes to signal updates.  Conversely, disabling the adapter stops this tracking and removes subscriptions.  

Retrieving notifications is straightforward; simply request the data for either the backtest or live environment.  When you're finished, the `dispose` function lets you clear the stored notifications for the specified backtest or live environment. This cleanup ensures resources are released properly.

## Class MemoryAdapter

The `MemoryAdapter` helps manage and store data related to signals, acting as a central point for accessing and updating that information. Think of it as a smart container for your data, ensuring the right data is available when you need it.

It keeps track of these data containers for each signal and bucket combination, creating them only when necessary. This prevents you from having too many data containers cluttering your system.

You can easily switch how this data is stored: use an in-memory system for speed, save data to files for persistence, or use a dummy adapter for testing. The default is a hybrid approach that combines in-memory storage with file persistence.

Before you start using the adapter, you need to "enable" it, which makes it listen for signal lifecycle changes. When a signal is no longer needed, the adapter automatically cleans up the related data. The `disable` function does the opposite, stopping this monitoring.

You can then use functions to write, search, list, remove, and read data from memory. The search function uses a powerful text-scoring system (BM25) to find relevant results.

Finally, you have options to clear the cached data or completely release the adapter's resources when it's no longer needed.

## Class MaxDrawdownUtils

This class offers helpful tools for understanding and analyzing maximum drawdown events in your trading strategies. Think of it as a way to collect and present data about the worst drops in your portfolio's value.

It provides a single, easy-to-use spot to access this information, gathered from events triggered during backtesting or live trading.

Here's what you can do:

*   **Get Statistics:** Fetch key statistics related to maximum drawdowns, allowing you to quickly assess performance. You specify the trading symbol, strategy name, exchange, and timeframe to target your analysis.
*   **Generate Reports:** Create detailed markdown reports summarizing all drawdown events for a specific symbol and strategy combination. You can customize the columns displayed in the report.
*   **Save Reports to File:** Automatically generate and save those markdown reports as text files, making it convenient to share or archive your findings. Again, you specify the symbol, strategy, exchange and timeframe, and can also include desired columns.

## Class MaxDrawdownReportService

This service is responsible for recording instances of maximum drawdown events and saving them for later analysis. It monitors a specific data stream for these drawdown events. 

Each time a drawdown event is detected, the service creates a detailed record containing information such as the timestamp, the asset involved, the trading strategy used, the exchange, the timeframe, and details about the signal that triggered the drawdown, including position size and price levels.

To begin recording these events, you need to subscribe to the data stream. This sets up the monitoring process. Importantly, it's designed to only subscribe once, preventing multiple subscriptions.

You can also stop the monitoring process by unsubscribing, which disconnects the service from the data stream and prevents further records from being saved. If you haven't subscribed initially, unsubscribing won’t have any effect.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and store reports detailing the maximum drawdown experienced during backtesting or live trading. It listens for data updates related to drawdown and organizes this information based on factors like the trading symbol, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown updates, and unsubscribing will stop the data collection and clear any accumulated information. The `tick` function handles individual drawdown data points as they arrive.

To retrieve the accumulated data, use the `getData` method, which provides statistics for a specific trading context. You can then generate a markdown report using `getReport` or directly write it to a file using `dump`.

Finally, the `clear` method lets you reset the collected data; it can clear everything or just the data for a specific symbol, strategy, exchange, and timeframe combination.

## Class MarkdownWriterAdapter

This component helps manage how your trading reports are saved, giving you flexibility in where and how they’re stored. It acts as a central point to control whether reports are written to individual files, appended to a single log file, or even suppressed entirely. The system remembers your storage choices, so you don't have to configure them repeatedly.

You can easily switch between different storage methods: 
*   `useMd()` creates standard markdown files, one for each report.
*   `useJsonl()` combines all reports into a single, continuously updated JSONL file.
*   `useDummy()` prevents any markdown output at all.

It also allows you to customize the underlying storage mechanism if you need something beyond the standard options. If your working directory changes during a strategy run, `clear()` can be used to refresh the storage settings. This ensures the storage instance is created with the updated base path.

## Class MarkdownUtils

This class helps you control when and where markdown reports are generated within the backtest-kit framework. It allows you to turn on markdown reporting for things like backtests, live trading, or performance analysis, choosing exactly which aspects you want documented.

You can enable markdown for several report types, and it’s important to remember to unsubscribe from those services when you’re done to avoid memory problems. Conversely, you can disable specific markdown services without affecting others.

Finally, there's a way to clear out the data that’s already been collected for a report without stopping the generation process itself, allowing you to essentially start fresh with a clean slate.

## Class MarkdownFolderBase

This adapter is designed to create well-organized, human-readable reports by saving each report as a distinct markdown file. 

Think of it as the default choice when you want a clear directory structure of reports for easy review. 

It works by directly writing markdown content to files, automatically creating any necessary folders along the way, based on specified paths and filenames. 

The `waitForInit` method doesn't actually do anything since this adapter doesn't require any initial setup. 

Essentially, the `dump` method handles the process of writing your report content to a specific file within the configured directory.


## Class MarkdownFileBase

This component handles writing markdown reports to files in a standardized JSONL format. Think of it as a central place to collect all your markdown outputs, like trade confirmations or performance summaries. It writes each report as a single entry in a JSONL file, making it easy to process those reports later with standard JSON tools.

The system automatically creates directories for these files and provides a timeout mechanism to prevent write operations from hanging indefinitely. 

You can control what reports are saved by specifying metadata like the symbol, strategy, exchange, frame and signalId, allowing you to filter reports later. The initialization process happens only once, ensuring that the directory and file stream are set up correctly.

The `dump` method is used to write the actual markdown content to the file, incorporating the specified metadata and a timestamp. This offers a structured and centralized way to manage and analyze your trading reports.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility through an adapter pattern. Think of it as a way to switch between different storage methods without changing your core code.

It remembers the storage you're using, ensuring you don't have to reconfigure it constantly. 

You can easily choose between a standard folder-based approach (where each markdown entry gets its own file) and a JSONL method (where everything is appended to a single file).

There's even a "dummy" adapter available, useful for testing where you want to simulate writes without actually saving anything to disk.

Finally, methods like `useMd` and `useJsonl` provide shortcuts to switch between the most common storage options.

## Class LoggerService

The LoggerService helps ensure your trading strategies log messages consistently and with helpful context. It’s designed to work alongside any existing logging system you might be using. 

You can plug in your own logger, or if you don’t specify one, it’ll use a basic "no-op" logger that doesn't actually log anything. 

This service automatically adds information about the strategy, exchange, and specific frame being processed to your log messages. It also includes details about the symbol, timestamp, and whether the process is a backtest.

The `setLogger()` method allows you to customize the underlying logging mechanism, letting you connect to services like the console, files, or external logging platforms. You can use the `log`, `debug`, `info`, and `warn` methods to record different levels of information about your trading activity, all while benefiting from that automatically injected context.

## Class LogAdapter

The `LogAdapter` is a flexible way to manage and store logs within the backtest-kit framework. It allows you to easily switch between different logging methods, like storing logs in memory, writing them to a file, or even disabling logging entirely.

You can choose to use the default in-memory logging, persist logs to disk, use a dummy logger that doesn’t record anything, or log to a JSONL file. The `useLogger` function gives you ultimate control, allowing you to define your own custom logging implementations. If you ever need to refresh your logging setup, especially when running multiple strategies, `clear` ensures you start with a fresh, default configuration. It’s essentially a pluggable system for handling all your logging needs.

## Class LiveUtils

LiveUtils provides tools for running and managing live trading operations. It acts as a central point for interacting with the live trading system, offering convenient functions for running strategies and retrieving information about their status.

It simplifies running live trading with built-in logging and crash recovery by persisting state. You can kick off a live trading run for a specific symbol and strategy, or run it in the background for tasks like persistent data collection.

LiveUtils allows you to check for pending or scheduled signals, as well as various aspects of the current position like percentage held, cost basis, and potential profit/loss metrics.  You can retrieve details about the position's history, like entry prices and partial close events.

The system allows for actions like cancelling scheduled signals or closing a pending position, as well as adjusting trailing stop-loss and take-profit levels. Furthermore, it offers methods for generating reports and accessing live trading statistics.  It essentially streamlines the process of managing and monitoring your live trading activities.


## Class LiveReportService

The LiveReportService is designed to track and record your live trading activity in a SQLite database. It essentially listens for events throughout the entire lifecycle of your trading signals – from when they're initially idle, to when trades are opened and active, and finally when they’re closed.

It diligently captures all of these events and stores them, complete with detailed information about each signal. The data is then written to the database to allow you to monitor your trading performance in real-time and perform in-depth analysis.

To ensure it’s working correctly, the service uses a logger to provide debugging information. It prevents accidental multiple subscriptions to the signal emitter, safeguarding against redundant data.

You can subscribe to receive these live events, and crucially, an unsubscribe function is provided, allowing you to easily stop the service when it’s no longer needed. If you haven't subscribed, unsubscribing will simply do nothing.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create reports about your live trading activities. It monitors your strategies and gathers information about each trade – when it starts, is active, and when it closes.

This service keeps track of all these events and compiles them into nicely formatted Markdown tables, making it easy to understand what's happening with your trading. You can also see key trading statistics like win rate and average profit.

It automatically saves these reports as Markdown files, organized by strategy name, in a designated "logs/live" directory.

Here's a breakdown of how it works:

*   **Subscription:** You subscribe to the service to start receiving trading updates, and can easily unsubscribe when you no longer need the reports.
*   **Data Accumulation:** The `tick` method processes each trading event and records the details. It’s intended to be called within your strategy’s callback function.
*   **Report Generation:** You can request data or generate reports for specific strategies and symbols, or clear out all the accumulated data if needed.
*   **Storage:** The service uses isolated storage for each combination of symbol, strategy, exchange, frame, and backtest, ensuring data is kept separate.

## Class LiveLogicPublicService

This service helps manage and execute live trading operations, streamlining the process by automatically handling the context needed by your strategies. It builds upon a private service, making it easier to use by automatically passing along information like the strategy and exchange names.

Think of it as a continuous, never-ending stream of trading events (opened signals, closed positions, cancelled orders). 

Even if the process unexpectedly stops and restarts, the system remembers its state and picks up where it left off thanks to saved data. The engine keeps track of time accurately, which is crucial for real-time trading.

You can initiate trading for a specific symbol, and the service will automatically manage the necessary background details, making it so you don't have to pass those details around every time you need to use a framework function.


## Class LiveLogicPrivateService

This service manages live trading operations, constantly monitoring and reacting to signals. It operates as an unending generator, providing a continuous stream of trading results.

The process involves continuously checking for new signals, recovering from potential crashes thanks to the ClientStrategy, and efficiently managing memory through its streaming approach. 

Essentially, it’s a persistent, real-time engine for your trading strategy, keeping things running and delivering results without ever stopping. 

You can specify which symbol to trade when you start the engine. The results provided are only for opened and closed signals.


## Class LiveCommandService

The LiveCommandService is a central hub for live trading operations within the backtest-kit framework. It acts as a simplified interface to the more complex LiveLogicPublicService, making it easier to integrate into your applications. 

Think of it as a convenient way to get things done in real-time, providing a single point of access for live trading functionality.

It’s designed to be used with dependency injection, streamlining the setup of your live trading environment. 

The core of this service is the `run` method. This method allows you to start live trading for a specific asset, providing context information about your strategy and exchange. It works continuously, automatically attempting to recover from any crashes that might occur during live execution, making the process more robust. Essentially, it’s an infinite loop that continuously provides results from the live trading process.

## Class IntervalUtils

IntervalUtils helps you manage functions that should only run once within a defined time period, like a trading strategy that shouldn't recalculate indicators too frequently. It offers two ways to do this: keeping track of the firing in memory, or persisting the information to a file so the system remembers even if it restarts.

You can use `fn` to wrap a function and ensure it runs at most once per interval. It will retry if the function initially returns `null`.  Each function you wrap gets its own private tracking, so modifications to one won’t impact others.

Similarly, `file` wraps asynchronous functions, saving the state to disk, so that it can be persisted across process restarts. This is useful for actions that absolutely need to only happen once per interval, even if the system crashes.

If you need to clean up the system, `dispose` lets you remove specific tracked functions, and `clear` wipes everything clean. The `resetCounter` function is especially helpful when you're changing the working directory between strategy runs to prevent conflicts with previously saved data.


## Class HighestProfitUtils

This class helps you analyze and report on the highest profit-generating trades. Think of it as a tool for summarizing and understanding what drove the best performance.

It gathers information about those top-performing trades, storing it internally.

You can ask it to provide detailed statistics about the highest profits for a specific trading symbol and strategy.

It also lets you generate reports, either in markdown format that you can view or save as a file, showcasing the highest profit events. You can customize which data points appear in the report, choosing from a selection of available columns.

## Class HighestProfitReportService

This service is designed to keep track of the most profitable trades and store that information for later review and analysis.

It monitors a specific data stream – `highestProfitSubject` – and whenever a new high-profit record is detected, it saves a snapshot of the related data to a JSONL database.

This snapshot includes important details like the timestamp, the symbol being traded, the strategy used, exchange information, and the specifics of the trade itself (position, current price, stop-loss and take-profit levels). 

To start saving these records, you’ll use the `subscribe` function, and to stop, you'll use `unsubscribe`. The subscription system prevents accidental multiple subscriptions, ensuring it only operates once.

## Class HighestProfitMarkdownService

This service helps you create reports summarizing the highest profits generated by your trading strategies. It listens for incoming data about profitable trades and organizes them based on the symbol, strategy, exchange, and timeframe you're tracking.

You can subscribe to receive these "highest profit" events, and the system ensures you won’t accidentally resubscribe, preventing unnecessary data processing.  Unsubscribing detaches the service and clears any accumulated data, effectively resetting it.

Whenever a new profitable trade event comes in, the service routes it to the correct storage area for processing.  You can then retrieve the accumulated profit statistics for a specific symbol, strategy, exchange, timeframe, and whether it’s a backtest or live trade.

The service can generate a formatted markdown report showing a table of the newest events and the total number of events recorded.  It can also write this report directly to a file on your disk, with filenames that include the symbol, strategy, exchange, timeframe, and whether it’s a backtest or live run.

Finally, you can clear the stored data, either for a specific combination of symbol, strategy, exchange, timeframe, and backtest, or clear everything completely, effectively starting fresh.

## Class HeatUtils

HeatUtils helps you create and manage visual representations of your portfolio’s performance, like heatmaps. Think of it as a handy tool to quickly understand how different assets are contributing to your overall strategy.

It gathers data across all your closed trades for a specific strategy, combining individual symbol performance with portfolio-level metrics.

You can easily get the raw data for creating your own visualizations.

It also lets you generate a ready-to-use markdown report – a table showing key metrics like profit, Sharpe Ratio, and maximum drawdown, sorted to highlight the best-performing assets.

Finally, you can save these reports directly to your computer, automatically creating the necessary folders if they don't already exist, making it simple to share your results or keep a record of your backtesting. 


## Class HeatReportService

This service helps you keep track of your trading activity by recording closed trades. It focuses on capturing the details of when a trade is finished, along with the profit or loss associated with it.

The service listens for these "closed trade" events across all your trading symbols. It then stores this information in a database, allowing you to analyze your performance and identify patterns.

You can easily start and stop the service’s monitoring of trade events. Once stopped, it won't record any further closed trade information. It's designed to ensure you don't accidentally subscribe multiple times, which could lead to unexpected behavior.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and analyze your trading performance. It gathers data from your trading strategies and creates a comprehensive, real-time view of how your portfolio is doing.

It's like having a dashboard that displays key metrics for each strategy and symbol you're trading, allowing you to quickly identify strengths and weaknesses.

You can subscribe to receive updates as trades close, and the service generates clear, markdown-formatted reports for easy sharing or documentation. 

The service also takes care of potential math errors, ensuring reliable calculations even with unusual data.

It's designed to be efficient, storing data separately for each exchange, time frame, and backtest mode to avoid conflicts. 

If you need to start fresh, it provides a way to clear all the accumulated data or specific data sets.


## Class FrameValidationService

The FrameValidationService helps you keep track of and verify your trading timeframe configurations. Think of it as a central authority for knowing which timeframes are available and valid. 

You can use it to register new timeframes with `addFrame()`, providing a name and a description of what that timeframe represents.

Before performing any actions that rely on a specific timeframe, you should use `validate()` to make sure it exists.  This helps prevent errors.

The service is designed to be efficient – it remembers the results of previous validations and reuses them to speed things up.

Finally, `list()` gives you a quick overview of all the timeframes that the service knows about.

## Class FrameSchemaService

The FrameSchemaService helps keep track of different "frame" structures used in your trading strategies. It's like a central place to store and manage these structures, ensuring they're consistent and well-defined.

It uses a specialized registry to safely store these frame schemas, preventing errors due to incorrect data types.

You can add new frame schemas using the `register` method, and if a schema already exists, you can update parts of it with the `override` method. Need to access a frame's details? Just use the `get` method and provide its name.

Before a frame is stored, a quick check (`validateShallow`) ensures it has the expected basic structure.


## Class FrameCoreService

The FrameCoreService acts as the central hub for managing timeframes within the backtesting environment. It leverages a connection service to fetch the necessary data and a validation service to ensure accuracy. Think of it as the engine that provides the sequence of dates you'll be analyzing during your backtest. 

Specifically, it's responsible for creating arrays of dates that represent the timeframe for a particular trading symbol and a designated frame name. This service works behind the scenes, powering other core components of the backtesting process. You won't typically interact with it directly, but it's crucial for generating the data backbone of your backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for handling different trading frames, like minute, hourly, or daily data. It intelligently directs requests to the correct frame implementation based on the current trading context.

To improve performance, it remembers (caches) these frame implementations so it doesn’t have to recreate them every time you need them.

This service also manages the timeframe for backtesting, allowing you to specify the start and end dates for your tests.  When in live mode, the "frameName" is empty, indicating no specific frame constraints.

Here's a breakdown of what it does and how it works:

*   **Automatic Routing:** It figures out which frame to use based on the active trading context.
*   **Caching:** It saves previously created frames to avoid unnecessary re-creation.
*   **Timeframe Management:**  It helps define the date range for backtesting.
*   **Retrieves Frames:** The `getFrame` method efficiently finds or creates the appropriate ClientFrame.
*   **Gets Time Boundaries:** The `getTimeframe` method retrieves the start and end dates for backtesting, taken from the frame configuration.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and confirm that your trading exchanges are properly set up. Think of it as a central manager for your exchange configurations. It lets you register new exchanges, quickly check if an exchange is valid before you try to use it, and provides a simple way to see all the exchanges you’ve registered. The service even remembers previous validation checks to make things run faster. 

Here's what you can do:

*   **Register exchanges:** Use `addExchange` to tell the service about each exchange you’re using.
*   **Validate exchanges:** The `validate` function confirms that an exchange actually exists before you attempt any trading actions.
*   **Get a list of exchanges:** Use `list` to see all exchanges you've registered in one go. 

Essentially, this service ensures you're working with valid exchanges, preventing potential errors and streamlining your trading setup.

## Class ExchangeUtils

ExchangeUtils provides helpful tools for working with different cryptocurrency exchanges. It acts as a central point for common tasks, ensuring consistency and simplifying interactions.

This utility handles retrieving historical data like candles and aggregated trades, as well as fetching real-time order book information. It automatically manages date calculations when retrieving candles to maintain compatibility and prevent errors.

You can use it to calculate the average price based on recent trading activity, format trade quantities and prices to match exchange-specific rules, and obtain order book snapshots. Essentially, it simplifies the complexities of interfacing with various exchanges, offering a unified and reliable approach. The utility maintains isolated instances for each exchange to avoid conflicts.

## Class ExchangeSchemaService

This service helps you keep track of information about different cryptocurrency exchanges, ensuring everything is consistent and well-organized. It uses a special system for storing this information safely and reliably.

You can add new exchanges using the `addExchange()` method and find them again later by their name using `get()`. 

Before adding an exchange, the service checks that it has all the necessary details with `validateShallow()`.

If you need to update an existing exchange’s information, you can use `override()` to make changes – only providing the parts that need updating. 

The service also uses logging to help with troubleshooting and understanding what’s happening behind the scenes.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the trading framework. It combines the capabilities of connection and execution services to ensure the correct context – like the trading symbol, time, and whether it's a backtest – is always applied to exchange operations. 

This service is used internally by other core components of the framework.

It provides methods for retrieving various market data, including:

*   Historical candles
*   Future candles (for backtesting scenarios)
*   Average prices (VWAP)
*   Order books
*   Aggregated trades
*   Raw candles, with options for specifying date ranges and limits

Each of these methods takes into account the current execution context, allowing exchanges to react appropriately depending on whether they're operating in a live or backtest environment.  The service also includes validation functionality to ensure exchange configurations are correct, and avoids repeated validations when possible.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests – like fetching candles or order books – to the correct exchange based on information provided in the current context. To make things efficient, it remembers which exchanges it has already connected to, so it doesn't have to recreate those connections repeatedly.

It provides functions for common trading tasks: retrieving historical and future candles, calculating the average price (differently depending on whether you're in a live or backtesting environment), and fetching order books and aggregated trades. The service also handles formatting prices and quantities to meet the specific rules of each exchange, ensuring your orders are valid. It simplifies working with various exchanges by abstracting away the complexities of individual exchange APIs.

## Class DumpAdapter

The DumpAdapter helps you save different pieces of information during a backtest, like messages, records, tables, errors, and more. It's designed to be flexible, allowing you to choose where that data is stored – by default, it saves everything as Markdown files.

You can easily change the storage location to memory (for quick access), discard the data entirely (for testing or debugging), or even create your own custom storage method.

Before you start dumping data, you need to activate the adapter, which ensures it's listening for the right events.  Deactivating it cleans up those listeners.

The adapter keeps track of its internal state to avoid issues with stale data, and it's important to clear its cache if your working directory changes. This ensures new data is handled correctly.

## Class ConstantUtils

The `ConstantUtils` class provides a set of pre-defined percentages used for managing take-profit and stop-loss levels in your trading strategies, designed around a Kelly Criterion approach with a focus on risk decay. These constants help automate how your profit targets and loss limits are adjusted as the price moves.

Think of it this way: if you’re aiming for a 10% profit, the `TP_LEVEL1` constant (30%) triggers when the price has moved 3% in your favor, `TP_LEVEL2` triggers at 6%, and `TP_LEVEL3` triggers at 9%. Similarly, the stop-loss levels alert you to potential reversals and help you manage risk, with `SL_LEVEL1` at 40% of the loss distance and `SL_LEVEL2` at 80%.  These different levels allow for a progressive exit from a trade, locking in some profit or cutting losses early while still allowing the potential for further gains.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading configurations are mathematically sound and have the potential to be profitable. It acts as a safety net, checking your settings before they're used.

It scrutinizes several areas of your configuration: percentages like slippage and fees must be positive values, ensuring your trades aren't immediately eaten up by costs. It also makes sure your take-profit distance is sufficient to cover those costs and guarantee a profit when the target is hit. 

The service also validates the relationships between parameters – like ensuring a stop-loss is set at a reasonable distance. Finally, it confirms time-related and candle-related parameters have valid, positive integer values. This service helps prevent accidentally setting up a trading system that's doomed to lose money from the start.


## Class ColumnValidationService

The ColumnValidationService is designed to help ensure your column configurations are set up correctly. It acts as a safety net, double-checking that each column definition adheres to the expected structure and rules. 

Specifically, it verifies that every column has all the necessary pieces – a key, a label, a format, and a visibility setting.  It also makes sure the keys used are unique and that the format and visibility settings are actually functions that can be executed. Finally, the service confirms that the keys and labels are strings and aren't empty. 

This service does its work by examining the configurations stored in COLUMN_CONFIG.

## Class ClientSizing

ClientSizing helps determine how much of your assets to allocate to each trade. It offers different sizing approaches, like using a fixed percentage, Kelly Criterion, or Average True Range (ATR). You can also set limits on the minimum or maximum position size, and a cap on the overall percentage of your capital used. ClientSizing also allows you to include custom logic through callbacks for validation and logging, providing flexibility in your sizing strategy. Ultimately, it takes your trade parameters and returns the calculated position size.

## Class ClientRisk

ClientRisk helps manage the overall risk of your trading portfolio, acting as a safeguard against signals that could exceed your predefined limits. It's designed to work with multiple strategies simultaneously, allowing it to consider the combined impact of all your trading activity. 

This component focuses on two main things: ensuring you don't hold too many positions at once, and allowing you to define custom risk checks that consider all currently open positions. 

It keeps track of all active positions across all strategies in a central location.
It’s used during the execution of your strategies to ensure any new signal fits within the defined risk parameters.

The ClientRisk class is initialized with configuration settings.
It handles the initialization of active positions from persistent storage, ensuring this only happens once. It also manages saving the current positions to storage.

You can add signals as they're opened, and remove them as they’re closed, ensuring the risk calculations are always up-to-date. The `checkSignal` method is the core logic to validate whether a signal can be executed.

## Class ClientFrame

The ClientFrame class is responsible for creating the timeline of data used in backtesting trading strategies. Think of it as the engine that builds the sequence of timestamps your backtest will analyze. 

It avoids repeating work by caching generated timeframes, so it doesn't rebuild the timeline every time it’s needed. You can adjust the spacing between timestamps—from one minute to a whole day—to match the granularity of your data. 

It also allows you to add custom logic to verify the timeframes and record events during generation, which can be helpful for debugging or analysis. This class works closely with the core backtesting engine to provide the historical data needed for evaluation.



The `getTimeframe` function is the key method; it's how you get the timeframe array, and it uses that singleshot caching.

## Class ClientExchange

The `ClientExchange` class is designed to provide a standardized way to access exchange data within the backtest-kit framework. It handles fetching historical and future candle data, calculating VWAP (volume-weighted average price), and formatting quantities and prices according to exchange-specific rules. The system prioritizes memory efficiency by using prototype functions.

To get historical candle data, you can use `getCandles`, which aligns timestamps to the nearest interval boundary and fetches a specified number of candles backward in time. `getNextCandles` is used to fetch future candles, typically for backtesting purposes, starting from the current time.  `getAveragePrice` calculates VWAP based on a configurable number of recent 1-minute candles, falling back to a simple average of closing prices if volume data is unavailable.

For accurate trade representation, `formatQuantity` and `formatPrice` adjust these values based on the specific exchange's rules. `getRawCandles` offers flexible retrieval of candles by specifying start and end dates and a limit, with robust checks to prevent look-ahead bias.  You can also get order book data with `getOrderBook`, and aggregated trades with `getAggregatedTrades`, both designed to respect the execution context and avoid look-ahead bias.

## Class ClientAction

The ClientAction class manages the lifecycle of action handlers, which are custom pieces of code that extend the core functionality of your trading strategy. Think of them as plugins that let you add things like logging, notifications, or custom analytics.

It handles setting up the handler, making sure it's initialized only once, and then routes different types of events—signals from live trading, signals from backtesting, breakeven notifications, partial profit/loss updates, and more—to the appropriate handler functions. It also takes care of cleaning up when the handler is no longer needed.

The `signalLive`, `signalBacktest`, and `signal` methods specifically handle different modes of event routing, while the other methods cater to particular events like partial profit/loss and risk rejections. The `signalSync` method provides a crucial gateway for order management, ensuring exceptions are handled appropriately.

## Class CacheUtils

CacheUtils helps you easily cache the results of your functions, particularly those used in trading strategies, so you don't have to recalculate them unnecessarily. It acts as a central manager for these cached functions.

The `fn` method is used to wrap regular functions, automatically storing their results based on a timeframe (like 1-minute or 1-hour candles). This makes sure you only calculate a value once per timeframe.

For functions that handle data files, the `file` method provides persistent caching by saving data to disk. This is super useful for storing complex calculations or large datasets, ensuring fast access even across strategy restarts.

If you need to completely discard a function’s cached data, `dispose` lets you clear the cache specifically for that function.

`clear` clears *all* cached functions and file data, which is important to use when your working directory changes.  This forces the system to recreate caches with potentially updated paths.

Finally, `resetCounter` keeps track of indexes for file-based caching and resets it when the working directory changes to avoid conflicts.

## Class BrokerBase

This `BrokerBase` class acts as a foundation for connecting your trading strategy to a real-world exchange. Think of it as a customizable bridge between your automated trading logic and the actual trading platform. It provides a framework to handle actions like placing orders, managing stop-loss and take-profit levels, and tracking your position’s status.

You can extend this class to create adapters for specific exchanges like Binance or Coinbase. The base class already takes care of the heavy lifting: it sets up a consistent way to log events and implements all the required functions for interacting with an exchange.

The lifecycle of a broker involves initializing (using `waitForInit`), and then reacting to various trading signals.  Events like opening a position (`onSignalOpenCommit`), closing it (`onSignalCloseCommit`), and adjusting stop-loss levels (`onTrailingStopCommit`, `onTrailingTakeCommit`) trigger actions on the exchange. You'll override these event handlers to actually execute those actions on your chosen platform. Partial profit and loss handling (`onPartialProfitCommit`, `onPartialLossCommit`) are also included for more sophisticated strategies. There's even a handler for adding entries to a dollar-cost averaging (DCA) position (`onAverageBuyCommit`). Because it's designed for flexibility, you don't need to implement every function; the default implementations simply log events.

## Class BrokerAdapter

The `BrokerAdapter` acts as a crucial intermediary between your trading logic and the actual broker. Think of it as a safety net, ensuring that every action taken – like opening or closing positions, setting take profits, or averaging in – is handled correctly and consistently.

When running tests or simulations (backtest mode), the broker interactions are skipped entirely, allowing you to analyze your strategies without real-world consequences. When you're trading live, the `BrokerAdapter` forwards these actions to your registered broker.

You'll use `useBrokerAdapter` to tell the framework which broker to interact with, and `enable` to activate the connection. The `enable` function also handles automatic signal events. Crucially, `enable` provides a way to disconnect with the returned dispose function.

If something goes wrong during any of these actions, the `BrokerAdapter` intercepts them and prevents unintended changes to your core trading data, acting like a transaction controller. There are specific methods for each common trading operation – partial profits, trailing stops, breakeven, and average buy – all of which are handled in this way. The `clear` method is there to reset if your environment changes, making sure the adapter is ready for a new trading context.

## Class BreakevenUtils

BreakevenUtils is a tool that helps you understand and analyze your breakeven events – those times when your trading strategy hit its breakeven point. It gathers data about these events, like when they happened, which symbol was involved, and the details of the trade.

You can use this tool to get a quick summary of your breakeven statistics, showing you how many events occurred. It also generates detailed reports in markdown format, creating tables showing each breakeven event with important information such as entry price, breakeven price, and position details.

Finally, BreakevenUtils can save these reports directly to files, making it easy to share your analysis or keep a record of your performance. The reports are named clearly using the symbol and strategy name, so you can easily identify them later.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals become profitable. It monitors for "breakeven" moments – when a signal has recovered its initial investment – and records these events.

Think of it as a dedicated record keeper for your trading performance.

It listens for these breakeven signals and stores them, along with all the details of the signal that triggered it. This data is then saved to a database, allowing you to analyze and understand how your signals are performing over time.

You can easily start and stop the service by subscribing and unsubscribing from the signal emitter, ensuring you're only collecting data when needed, and preventing accidental duplicate entries. The service handles the details of connecting and disconnecting, making the process straightforward.

## Class BreakevenMarkdownService

This service helps generate and save reports detailing breakeven events for your trading strategies. It keeps track of these events for each symbol and strategy you're using.

It listens for "breakeven" signals, gathers information about each event, and then creates nicely formatted markdown tables summarizing the data. The service also provides overall statistics like the total number of breakeven events recorded.

You can request statistical summaries or full reports for specific symbol-strategy combinations. The reports are saved as markdown files, organized by symbol and strategy, making them easy to review and share.

The service also gives you the ability to clear out all the accumulated data or just clear the data for a specific trading setup. It uses a storage system that keeps data for different combinations of symbols, strategies, exchanges, frames, and backtest types entirely separate.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven calculations within the backtest-kit framework. It's designed to be a single point of access for ClientStrategies, simplifying how they interact with the underlying breakeven functionality.

It’s essentially a middleman, taking requests and forwarding them to the BreakevenConnectionService, while also keeping a record of these operations through global logging. This makes it easier to monitor and troubleshoot breakeven-related issues.

The service relies on several other services injected through dependency injection, including those for validating strategies, schemas, risk, exchanges, and frames.

It has two primary functions: `check`, which determines if a breakeven trigger should occur, and `clear`, which resets the breakeven state when a signal closes. Both functions are carefully logged to provide transparency.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and tracks breakeven points for trading signals. It's designed to efficiently handle multiple signals without creating unnecessary overhead.

Think of it as a central hub; whenever a signal needs to track its breakeven, this service creates and manages a specialized "ClientBreakeven" object just for that signal. It remembers these objects to avoid recreating them, making the process faster.

This service works closely with other parts of the trading system, receiving information from various services and notifying other components when a breakeven event occurs. When a signal is finished, the service cleans up any associated data, ensuring a clean and efficient system.

Specifically, the `getBreakeven` function is its key feature - it’s how it generates and remembers the "ClientBreakeven" instances. The `check` function determines if a breakeven condition has been met, and the `clear` function cleans up the data when the signal is closed.

## Class BacktestUtils

This class offers tools to run and analyze backtests within the trading framework. Think of it as a central hub for backtesting operations, providing convenient shortcuts and extra insights.

It handles running backtests – both normally and in the background for tasks like logging. You can also get details about pending and scheduled signals like their price, profit/loss, and more.

Here’s a breakdown of what you can do:

*   **Run backtests:** Easily start backtests for a specific trading symbol and strategy. It also allows running in the background without detailed results.
*   **Signal insights:** Access details about pending signals, including pending/scheduled signals, breakeven points, entry prices, and profit/loss calculations.
*   **Position management:** Get information about position size, costs, and even manipulate stop-loss and take-profit levels.
*   **Reporting and analysis:** Generate detailed reports about your backtest results, including performance statistics and breakdowns.
*   **Control & Reset**: Cancel or activate scheduled signals and commit actions like partial profit/loss closes or new entry orders.

Essentially, it simplifies working with backtests and gives you a deeper understanding of what's happening under the hood. The singleton pattern means there's just one instance of this utility class available, making it easy to access anywhere in your code.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what your trading strategies are doing during backtesting. It acts as a listener, catching every key event – when a signal is idle, opened, active, or closed. 

This service diligently logs these events, along with all the relevant details, and saves them to a SQLite database. This allows you to later analyze the strategy's behavior and debug any issues.

To make sure you don't accidentally log the same events multiple times, it prevents duplicate subscriptions. When you want to stop tracking events, you can use the `unsubscribe` function to gracefully stop the logging process. The `subscribe` method provides the function you'll use to stop receiving events later.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports of your backtest results. It works by listening to the data coming in during a backtest and tracking the signals generated by your trading strategies.

It keeps a record of closed signals for each strategy, organized by symbol, strategy name, exchange, frame, and whether it's a backtest. This information is then used to create easy-to-read markdown tables that clearly show the signal information.

These reports are saved as markdown files in a designated folder, allowing you to analyze and review your backtest performance. You can also clear the accumulated data when needed, either for a specific combination of parameters or all data at once.

To make sure you're receiving the relevant data, you'll need to subscribe to the backtest signal emitter; a function is returned that allows you to unsubscribe later. This service relies on a logger for debugging and a memoized storage function to manage data efficiently.

## Class BacktestLogicPublicService

This service helps you run backtests for your trading strategies. It handles the underlying mechanics of the backtest, automatically managing important details like the strategy name, exchange, and time frame – so you don't have to pass them repeatedly.

Essentially, it streamlines the process of running a backtest, making it easier to focus on the strategy itself.

The `run` function is the main entry point, taking a symbol as input and returning a stream of results, which represents the signals generated during the backtest. This stream includes information about opened, closed, cancelled, and scheduled trades.


## Class BacktestLogicPrivateService

BacktestLogicPrivateService helps manage and run backtests in a way that's efficient and doesn't consume a lot of memory. It works by getting a sequence of time periods, then processing each one to see if a trading signal appears. When a signal is triggered, it fetches the necessary data and runs the backtest logic. 

The system skips over time periods where no signal exists and reports on signals as they close. This process streams results, sending them one at a time instead of building up a large array, which is especially helpful for long backtests. You can even stop the backtest early if needed.

To make everything work, it relies on several other services including handling logs, managing strategy execution, interfacing with the exchange, fetching timeframes, and dealing with actions. 

The `run` method is the main way to start a backtest, and it returns a stream of results, allowing you to process them as they become available. You provide the symbol you want to backtest, and the method sends back a series of signals—either signals that are scheduled, opened, closed, or cancelled.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. It provides an easy way to access backtesting capabilities and is designed to be used when you need to integrate backtesting into your application.

Think of it as a gatekeeper to the core backtesting logic, ensuring everything is set up correctly before a backtest begins.

Several internal services, such as those for validating strategy, risk, actions, and exchange configurations, are connected to this service, providing checks and balances.

The primary function is `run`, which initiates a backtest. You provide the symbol you want to test, alongside context details like the names of the strategy, exchange, and frame being used.  This function returns a sequence of results, giving you a timeline of how the strategy performed, including scheduled, opened, closed, and cancelled orders.

## Class ActionValidationService

This service helps keep track of your action handlers, ensuring they're all properly registered and exist when you need them. Think of it as a central place to manage and double-check your actions. It lets you add new action schemas, validate if a specific action exists, and even list all the actions you've registered. To improve performance, the service remembers the results of previous validations, so it doesn't have to repeat checks unnecessarily. It also has a logger service and an internal map to manage and store action schemas.

## Class ActionSchemaService

The ActionSchemaService helps you manage and organize the blueprints for actions in your system. Think of it as a central place to define how actions work, ensuring they're consistent and safe.

It uses a type-safe system to store these blueprints, preventing errors.  When you define an action, the service checks to make sure it follows the rules, like confirming it uses only approved methods.

You can add new action blueprints, update existing ones with just the changes you need, or retrieve a complete blueprint when you need it. 

It keeps track of these action blueprints, using a logging system and a registry to make sure everything works together correctly. The service also validates the structure of action schemas and checks the methods available in handlers.


## Class ActionProxy

The ActionProxy acts as a safety net when you're using custom actions in your trading strategies. Think of it as a protective layer that catches any errors occurring within your code, preventing those errors from crashing the entire system. It's designed to gracefully handle situations where your custom code might have issues, logging those errors and allowing the trading process to continue without interruption.

It's built around the idea of "wrapping" your action handlers—things like `init`, `signal`, `breakevenAvailable`, and so on—with extra safeguards. This means that even if a particular action handler is missing or throws an error, the system won’t break.

Essentially, if you provide a handler that isn't fully implemented, or if something goes wrong inside that handler, the ActionProxy steps in to log the problem and keep things running smoothly.  The `fromInstance` method is the designated way to create instances of `ActionProxy`, making sure that all your user-provided actions are properly wrapped for safety. Certain key methods like `signalSync` are intentionally left unwrapped to ensure critical errors are surfaced.


## Class ActionCoreService

The ActionCoreService acts as a central hub for managing and executing actions within your trading strategies. It's responsible for coordinating how actions are handled, ensuring they're validated and executed in the correct order.

Think of it as a conductor leading an orchestra of actions – it fetches the list of actions defined in your strategy, checks they are valid, and then triggers them one by one.

Here's a breakdown of its key features:

*   **Action Management:** It retrieves action lists directly from strategy definitions, streamlining the process of deploying and managing trading actions.
*   **Validation:** It thoroughly checks the context and configurations of your strategies – including the strategy name, exchange, frame, and associated risks and actions – to prevent errors.
*   **Initialization:**  It ensures all actions are properly initialized by loading any persistent data they require.
*   **Event Routing:** It routes various signals and events (like ticks, breakeven events, partial profits, pings, and risk rejections) to the appropriate actions within the strategy. Different methods exist for backtesting, live trading, and specific event types.
*   **Synchronization:** The `signalSync` function ensures that all actions agree on whether to open or close a position.
*   **Cleanup:** The `dispose` function provides a way to properly shut down all actions when a strategy is finished.
*   **Data Clearing:** It allows you to clear out action data, either for a specific action or across all strategies.

Essentially, this service handles the behind-the-scenes work of coordinating actions, freeing you to focus on designing and building your trading strategies.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions within your trading strategies. It figures out which specific action implementation to use based on a given name, strategy, exchange, and frame. To improve performance, it remembers (caches) these action instances so it doesn't have to recreate them every time.

Think of it as a smart router – you tell it what kind of action you want (like "order placement" or "risk management"), and it sends the request to the right place.

Here’s a breakdown of how it works:

*   **Action Routing:** It directs events – like new market data or risk updates – to the appropriate action based on its name.
*   **Caching:** It stores frequently used actions to avoid repeated creation, leading to faster operations.  The cache is organized by strategy and frame, so actions are isolated for each strategy-frame combination.
*   **Initialization:** When a new action is requested, it’s initialized, potentially loading any necessary data.
*   **Disposal:** Actions are cleaned up when they’re no longer needed to free up resources.

The service offers a variety of specialized methods, each handling a different type of event (signals, breakeven calculations, scheduled tasks, etc.). These methods all route the event to the correct action instance. The `getAction` property is the core of the caching system, allowing you to retrieve previously created actions efficiently. Finally, the `clear` method allows you to flush the cache when needed.

## Class ActionBase

This class, `ActionBase`, is your starting point for creating custom actions within the backtest-kit framework. Think of it as a foundation you build upon to extend the system’s functionality. It simplifies the process of handling events related to trading signals and strategy execution.

The class automatically handles basic logging of all events, so you don’t have to worry about that repetitive work. It also gives you access to key information about the strategy, like its name, the timeframe it's operating on, and the specific action being executed.

When you extend `ActionBase`, you can create your own logic to deal with things like managing your trading positions, sending notifications via platforms like Telegram or Discord, or tracking performance metrics.

The `init` method lets you set up things like database connections or API clients when the action starts. The `dispose` method provides a chance to clean up when the action finishes.

The class offers specific methods triggered by events throughout the trading process. These include signal generation (`signal`, `signalLive`, `signalBacktest`), profit and loss milestones (`partialProfitAvailable`, `partialLossAvailable`), and risk management rejections (`riskRejection`). You can choose to override these methods to tailor your actions to your specific needs. It essentially gives you a central point to customize how the system reacts to different occurrences in the backtesting or live trading environment.

