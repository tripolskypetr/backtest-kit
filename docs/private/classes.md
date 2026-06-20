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

The WalkerValidationService helps you manage and double-check your walker configurations, which are used for things like optimizing strategies and hyperparameter tuning. It keeps track of all your walkers, ensuring they exist before you try to use them. 

To make things efficient, it caches validation results so you don't have to repeat checks.

Here's what you can do with it:

*   **Register walkers:** Use `addWalker()` to add new walker configurations.
*   **Check walker validity:** The `validate()` function confirms a walker exists and that all associated strategies, risks, and actions are also set up correctly.
*   **See all walkers:** `list()` gives you a complete rundown of all registered walkers.

The service uses several other services internally like `StrategyValidationService`, `RiskValidationService`, and `ActionValidationService` to handle more specific validations. It also uses `WalkerSchemaService` and `StrategySchemaService` for schema-related operations.

## Class WalkerUtils

WalkerUtils is a helper tool designed to simplify working with walkers, which are essentially automated systems for analyzing and comparing trading strategies. It provides a convenient way to execute walkers and manage their operations.

The `run` function executes a walker for a specific trading symbol and provides results as a stream of data. You can also run a walker in the background using `background` which is helpful for tasks like logging or triggering side effects without directly handling the results.

If you need to halt a walker's operations, the `stop` function can be used. It gracefully stops strategies from generating new signals, allowing existing ones to finish before stopping completely.

To retrieve comprehensive results or a formatted report summarizing the walker's performance, use `getData` or `getReport`, respectively. `dump` allows you to save the report to a file.

Finally, `list` gives you an overview of all active walkers, showing their status like pending, fulfilled, rejected, or ready. WalkerUtils manages these operations using isolated instances for each symbol-walker combination.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of different trading strategies, or "walkers," and their configurations in a safe and organized way. It acts like a central hub for managing these walker definitions.

You can add new walker schemas using `addWalker`, ensuring they're registered correctly. To find a specific walker, just use its name to retrieve it.

Before a walker is officially added, `validateShallow` checks that it has all the necessary components and that they're the right types.  This helps prevent errors later on.

If you need to update an existing walker's details, `override` lets you make changes while keeping the rest of its definition intact. 

Behind the scenes, it uses a secure storage system from functools-kit to ensure everything stays consistent.

## Class WalkerReportService

WalkerReportService helps you keep track of your strategy optimization efforts. It acts like a dedicated record-keeper, capturing the results of each test run and storing them in a database.

It listens for updates from the optimization process and logs detailed information about each strategy tested, including performance metrics. You can use this information to monitor how your strategies are improving, identify the best-performing configurations, and analyze the optimization process overall.

The service is designed to avoid accidental double-reporting – once you subscribe to receive updates, you’ll get them reliably, and you can easily stop listening when you’re done. 

It works with a logger for helpful debugging messages.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create detailed reports about your trading strategies as they run. It listens for updates from your trading strategies (called "walkers") and keeps track of their performance.

These reports are presented in a readable Markdown format, showing comparisons between different strategies. They're saved to your logs directory, making it easy to review and analyze your trading results.

You can subscribe to the service to receive these updates, and unsubscribe when you no longer need them. The `tick` function is how the service processes the updates it receives.

You can retrieve specific data points, generate reports for particular strategies, and even clear all accumulated data when needed. This simplifies the process of monitoring and understanding how your trading strategies are performing over time. The service uses a special storage system to keep the data for each walker separate and organized.

## Class WalkerLogicPublicService

This service helps manage and run walkers, which are essentially automated trading strategies or simulations. It builds upon a private service to handle the core walker logic, but adds a layer of convenience. 

It automatically passes along important information like the strategy's name, the exchange being used, the frame it's running within, and the walker’s identifier. This avoids having to manually pass this data around each time you run a walker.

The `run` method is the main way to use it. You give it a symbol (like "AAPL") and some contextual information, and it will execute the walker comparison process, effectively running backtests for different strategies.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps orchestrate and compare different trading strategies. It essentially manages the process of running multiple strategies and keeps track of their performance.

The service provides updates as each strategy finishes its backtest, so you can monitor progress. It also identifies and remembers the strategy with the best performance metrics in real-time.

Finally, it delivers a complete report, ranking all the strategies based on their results. 

It relies on BacktestLogicPublicService to perform the actual backtesting for each strategy. 

You can think of it as a conductor, bringing together and organizing different strategies to see how they stack up against each other.

The constructor doesn’t take any parameters.

The service uses several other services internally, including a logger and services for handling backtest logic, markdown formatting, and walker schema.

The `run` method is the primary way to use the service. You provide the symbol you want to backtest, a list of strategies to compare, the metric you’re using to evaluate performance, and some contextual information.  It then runs the backtests one after another and gives you updates as they complete.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for walker-related functionality, making it easier to use within your applications. It's essentially a convenient layer on top of WalkerLogicPublicService, designed for seamless integration through dependency injection.

It bundles together several key services needed for walker operations, including those responsible for handling schemas, validations, and managing the overall workflow.

The `validate` method ensures that your walker and strategy setups are correct, preventing issues by performing checks and caching results to optimize performance.

To actually execute a walker comparison, you can use the `run` method, specifying the trading symbol and relevant context like the walker, exchange, and frame names. This method returns a sequence of results, letting you analyze the comparison step-by-step.

## Class TimeMetaService

The TimeMetaService is designed to provide a reliable way to get the current timestamp for your trading strategies, even when you're not actively running a tick. Think of it as a central record of when each symbol, strategy, exchange, and frame last updated.

It keeps track of these timestamps using a special system that makes sure you always have the most recent data available. If a timestamp hasn't been received yet, it will wait a short time to get it, ensuring you aren't working with old information.

This service is automatically updated by the system after each tick and offers a way to clear out the stored timestamps when needed, ensuring everything stays fresh. You can either clear all the timestamps or just the ones related to a specific combination of symbol, strategy, exchange, and frame. It's especially useful for tasks that need to know the current candle time, but happen *between* those regular tick executions.

## Class SystemUtils

SystemUtils helps keep backtest sessions separate and clean. It prevents one backtest from messing with another by temporarily disconnecting everything that's listening for events.

It provides a way to take a "snapshot" of the current event listeners.  This essentially clears out the event listeners, allowing a new backtest session to run without interference.  After the new session is complete, you can restore the listeners to their original state using the snapshot. 


## Class SyncUtils

SyncUtils helps you analyze and understand the lifecycle of your trading signals. It gathers information about signal openings and closings, giving you insights into how your strategies are performing.

Think of it as a tool for keeping track of your signals and generating reports.

You can request statistical data like total signal events, openings, and closures. It also produces detailed markdown reports, which are essentially nicely formatted tables, that show all your signal activity. These tables include crucial details like signal ID, direction, price points, and profit/loss information.

Finally, you can have these reports automatically saved to files, making it easy to review and share your trading history. The filenames clearly identify the symbol, strategy, exchange, and whether it was a backtest or live trade.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your signals. It listens for signals being opened and closed and records those events. This record keeping is really useful for understanding how your trading strategies are performing and for keeping an audit trail.

It captures details like when a signal is first created (when a limit order is filled), and when it's closed, including information about profits and losses and why it was closed. It then neatly stores this information ready for you to examine later.

To make sure things don't get messy, the service only allows one subscription at a time. You subscribe to receive the signal events, and when you're done, you can unsubscribe to stop receiving them.

## Class SyncMarkdownService

This service is designed to automatically create and save reports detailing the lifecycle of trading signals. It keeps track of signal events like opens and closes, organizes them by symbol, strategy, exchange, and timeframe, and then generates nicely formatted markdown tables.

You can tell it to listen for these signal events, and it will begin collecting data. Once it's listening, it handles each event as it comes in, adding a timestamp to each one. If you stop listening, it cleans up all the accumulated data.

You can request statistics for a specific combination of symbol, strategy, and timeframe, or ask it to generate a complete report in markdown format. It can also write those reports directly to disk, naming them according to whether they represent backtesting or live trading data. Finally, you can clear out the accumulated data, either for a specific set of parameters or completely.

## Class StrategyValidationService

This service helps you keep track of your trading strategies and make sure they're set up correctly. It essentially acts as a central manager for your strategies, keeping a record of them.

You can add new strategies using the `addStrategy` function, providing a name and the details of the strategy.  Before you try to use a strategy, this service verifies it exists and confirms that any linked risk profiles or actions are also valid. To improve performance, validation results are cached, so the service doesn't have to repeat checks unnecessarily.  Finally, you can view a complete list of all registered strategies with the `list` function. 

The service relies on other services like `riskValidationService` and `actionValidationService` to handle those specific validations.

## Class StrategyUtils

StrategyUtils helps you understand and report on how your trading strategies are performing. It's like a central place to gather information about events triggered by your strategies, such as closing positions or adjusting stops.

This utility provides a way to get statistical summaries of strategy activity, like how many times a particular action was taken. 

You can also generate detailed reports in Markdown format, presenting each event in a clear, organized table. This table includes key information like the symbol traded, the action taken, the price at the time, and timestamps.

Finally, StrategyUtils can automatically save these reports to files, creating nicely named documents that you can easily share or review later. The reports include a summary of the events and are structured for easy readability.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're all structured correctly. It acts like a central library for strategy definitions.

You can add new strategy blueprints using the `addStrategy()` method, giving each one a unique name.  Later, you can easily find a specific strategy's blueprint by its name using the `get()` method.

Before a strategy blueprint is added, the `validateShallow()` method checks if it has all the necessary parts and that those parts are of the right type.

If a strategy blueprint already exists, you can update parts of it with the `override()` method, which allows you to make changes without replacing the entire blueprint.

The service relies on a logging system, `loggerService`, to keep track of what's happening, and it uses a secure registry, `_registry`, to store the strategy blueprints safely.

## Class StrategyReportService

This service helps you keep a detailed, persistent audit trail of your trading strategy's actions. It's designed to record events like canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting stop-loss orders (trailing stops and take-profits), and moving stop-loss to breakeven.

To use it, you first need to "subscribe" to start logging. Then, it automatically writes each event as a separate JSON file to disk. When you're done, you "unsubscribe" to stop the logging process.

Unlike other reporting methods, this service immediately writes events to disk, ensuring a reliable record of your strategy's behavior.

Here's a breakdown of the event types it handles:

*   **cancelScheduled:** Records when a scheduled order is cancelled.
*   **closePending:** Records when a pending order is closed.
*   **partialProfit:** Records when a portion of a position is closed for a profit.
*   **partialLoss:** Records when a portion of a position is closed at a loss.
*   **trailingStop:** Records adjustments to the trailing stop-loss.
*   **trailingTake:** Records adjustments to the trailing take-profit.
*   **breakeven:** Records when the stop-loss is moved to the entry price.
*   **activateScheduled:** Records when a scheduled signal is activated before the intended time.
*   **averageBuy:** Records new entries added when using a dollar-cost averaging strategy.

The `subscribe` method ensures that logging starts cleanly and the `unsubscribe` method safely shuts down the logging process.

## Class StrategyMarkdownService

This service helps you track and analyze what's happening in your trading strategies during backtesting or live trading. It's designed to gather information about various actions like canceling orders, closing positions, and adjusting stop-loss levels.

Think of it as a detailed logbook for your strategies. Instead of writing each event to a file immediately, it temporarily stores them to create reports later.

Here's a breakdown of how it works:

First, you need to tell the service to start listening for events by calling `subscribe()`. Then, as your strategy executes, different actions (like partial profit taking or trailing stops) will automatically trigger entries in this logbook.

You can then ask for summaries or full reports using `getData()` or `getReport()`.  `getReport()` lets you customize what details appear in the report.  You can also save the reports directly to files with `dump()`.

Finally, when you're done, `unsubscribe()` stops the collection and clears everything, like closing the logbook.

This service also keeps track of statistics like how many times you took partial profits, allowing you to analyze your strategies in detail. The `getStorage` property handles managing where these temporary logs are kept, creating new storage areas for each unique combination of symbol, strategy, and exchange.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for managing trading strategies within the backtest framework. It provides a way to interact with strategies while ensuring data like the trading symbol, time, and backtest parameters are correctly passed along. Think of it as a middleman that simplifies how strategies are executed and monitored.

It has several key functions:

*   **Retrieving Signals & Data:** You can use it to get the current pending signal, the percentage of the position that's been closed, its cost basis, and other relevant details about a trade.
*   **Managing Strategy State:** It allows you to check if a strategy is stopped, activate scheduled signals early, or even close pending positions without stopping the entire strategy.
*   **Running Backtests & Simulations:** The service facilitates executing strategies against historical data, and quickly validating configurations.
*   **Validation and Caching:** The `validate` method ensures strategies and their configurations are correct, using a caching mechanism to avoid repetitive checks.
*   **Monitoring & Performance:** Functions for retrieving information like the time elapsed since peak profit or the maximum drawdown can be used to monitor how a strategy is performing.

The service relies on other components like `StrategyConnectionService` and `ExecutionContextService` to handle the complexities of connecting to the trading platform and managing execution context. It's the core engine for a lot of the backtest framework's functionality.

## Class StrategyConnectionService

This framework manages strategy execution and provides access to key data and functionalities. It intelligently routes strategy operations to the correct implementation based on the symbol, exchange, and frame.

The service caches strategy instances for efficiency and ensures initialization before any operations are performed. It handles both live trading (ticks) and historical analysis (backtests).

You can retrieve data like pending signals, total closed position percentage, cost, effective price, entry details, partials and scheduled signals.  It also provides methods to manage positions, such as closing pending signals, adjusting stop-loss/take-profit, and adding DCA entries.  The framework allows you to check the status of a strategy, validate actions before execution, and clear cached data when needed. Overall, this component acts as a central hub for orchestrating and managing trading strategies within the system.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored, allowing you to easily swap out different storage methods without changing your core trading logic. It acts as a middleman, letting you choose between persistent storage (saving to disk), in-memory storage (data lost when the application restarts), or a dummy adapter for testing.

The adapter keeps track of a storage utility instance, creating it only when needed and remembering it for future use – this helps improve performance. 

You can easily switch storage types using methods like `useDummy`, `usePersist`, and `useMemory`. If you need to change the underlying storage implementation entirely, use `useStorageAdapter`.  

The adapter also handles various events related to signals like opening, closing, scheduling, and cancellation, passing these events to the currently selected storage method. It provides handy functions to find signals by ID and list all signals. Remember to call `clear()` when the base path changes to ensure a fresh storage instance is created.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how your backtest data is stored. It allows you to easily switch between different storage methods, such as persistent storage on disk, in-memory storage, or even a dummy storage that doesn't actually save anything.

You can choose a default storage method or customize it by selecting one of the available adapters. The `usePersist()`, `useMemory()`, and `useDummy()` methods let you quickly change storage implementations.

The adapter handles various events like signals opening, closing, scheduling, and cancellations, passing these actions onto the selected storage. It also offers methods to find signals by their ID and list all stored signals. The `clear()` method ensures that a fresh storage instance is used when the working directory changes, preventing potential issues across different strategy runs.

## Class StorageAdapter

The StorageAdapter acts as the central hub for managing your trading signals, whether they're from backtesting or live trading. It automatically keeps track of new signals as they arrive. 

It's designed to make it easy to access and work with both backtest and live signals in a consistent way.

To start using the storage, you enable it, and it will subscribe to the signal emitters.  You can safely disable the storage multiple times if needed to unsubscribe.

Need to find a specific signal? You can search for it by its ID. 

Want a complete list? There are functions to list all backtest signals and all live signals separately.


## Class StateLiveAdapter

The StateLiveAdapter helps manage and track the state of your trading signals, allowing you to swap out different storage methods easily. It's designed to be flexible, letting you use file-based storage (the default), in-memory storage, or even a dummy adapter that simply ignores changes – which is useful for testing.

The adapter is particularly useful for implementing automated trading rules, like those driven by large language models, where you want to monitor how trades perform over time and automatically exit those that aren't meeting expectations. It keeps track of things like peak profit and how long a trade has been open, persisting this data even if your application restarts.

When a signal is finished or closed, you need to `disposeSignal` to clean up the memoized data.  You can also clear the entire cache with `clear`, which is handy if your application's working directory changes.

If you need a different way to store your state, you can also use `useStateAdapter` to bring in a custom storage solution. Finally, `useLocal`, `usePersist`, and `useDummy` allow you to quickly change how the state is stored – in memory, to a file, or discarded completely, respectively.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store information about your trading strategies during backtesting. It acts as a flexible layer, allowing you to easily change how and where this data is stored—whether that’s in memory, on disk, or even in a dummy adapter for testing purposes.

Think of it as a central place to track key metrics for each signal, like the highest peak reached and how long a position has been open. This is particularly useful for complex rules, such as automatically exiting a trade if it doesn’t perform as expected after a certain time or if it hasn't reached a certain profit level.

You can easily switch between different storage methods: the default in-memory option, a persistent disk-based solution, or a dummy adapter for testing without saving data. The `disposeSignal` method allows you to clean up old data when a signal is finished. The `clear` function is helpful when the base directory for your project changes during multiple backtesting runs.

## Class StateAdapter

The StateAdapter is the central piece for managing how your backtest and live trading systems store and access data. It automatically handles cleaning up old data when a trading signal is finished, ensuring you don't end up with unnecessary clutter.

You can think of it as a traffic controller, directing data requests to either the backtest storage or the live trading environment based on whether you're in a testing or production scenario. 

There's an `enable` function that activates this storage management, and `disable` to deactivate it – it's perfectly safe to call `disable` multiple times.  You use `getState` to retrieve data and `setState` to update it; both functions will intelligently send the request to the right place. The `enable` function is a bit special because it only runs once to keep things efficient.


## Class SizingValidationService

This service helps you keep track of and confirm your position sizing strategies. Think of it as a central place to register your sizing methods, like fixed percentage or Kelly Criterion, and make sure they're available when you need them. 

It provides a way to add new sizing strategies to a registry, ensuring they're properly registered before use. 

You can use it to check if a sizing strategy exists before applying it, and the service remembers these checks to speed things up. 

If you need to see all the sizing strategies you've registered, you can request a list of them. This helps prevent errors and keeps your sizing configuration organized.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies you're using in your trading system. It acts like a central repository where you store and retrieve these strategies.

It uses a special system to ensure that the sizing strategies you register are structured correctly, checking for essential properties and data types.

You can add new sizing strategies using the `register` method, and if you need to make changes to an existing one, `override` lets you update specific parts. To use a sizing strategy, simply request it by name with the `get` method, and it will be returned for use. The service also has internal components for logging and validation, helping to ensure smooth operation.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, acting as a central point for size calculations within the backtest-kit framework. It relies on other services – a connection service to handle the actual sizing logic and a validation service to ensure sizing requests are valid.  Think of it as the brains behind deciding how much to buy or sell, using information about risk and trading context. 

It’s designed for internal use by strategies and the public API.

Here's a breakdown of its key components:

*   It uses a `loggerService` for logging information.
*   It has a `sizingConnectionService` which is responsible for performing the calculations.
*   A `sizingValidationService` makes sure the sizing requests are correct.
*   The `calculate` method is the core function, taking sizing parameters and context and returning the calculated position size. It's how you get the actual sizing amount.

## Class SizingConnectionService

This service helps manage how your trading strategies determine the size of positions. It acts as a central hub, directing sizing calculations to the correct sizing implementation based on a name you provide.

To improve performance, it remembers previously used sizing implementations, avoiding redundant setup.

Think of it as a smart router for sizing requests, ensuring the right method is used for each strategy and caching results to speed things up.

It allows for flexible sizing methods, supporting techniques like fixed percentages, Kelly Criterion, and ATR-based sizing. 

The service relies on configuration schemas and logging services to function effectively. 

When a strategy doesn't have specific sizing configuration, an empty string is used as the sizing name.


## Class SessionLiveAdapter

This component provides a flexible way to manage and store session data during live trading. Think of it as a central place to hold information that changes as your trading strategy runs, like order history or account balances.

It’s designed to be easily swapped out with different storage methods – you can use a file-based system for persistence, an in-memory solution for speed, or even a dummy adapter to just discard data. The default is to store data in files, meaning your progress will be saved even if the application restarts.

You can quickly change how the session data is stored using methods like `useLocal`, `usePersist`, and `useDummy`. There's also a way to plug in your own custom storage solution using `useSessionAdapter` if you have specific needs.  The system automatically handles caching these session instances to avoid unnecessary creation, but you can clear this cache with `clear` if the working directory changes.  Retrieving and updating session data is done through the `getData` and `setData` functions, respectively, allowing you to access and modify the live trading context.

## Class SessionBacktestAdapter

The SessionBacktestAdapter helps manage and store data during backtesting runs, allowing for flexibility in how that data is handled. It acts as a bridge, or adapter, between your backtest code and different storage solutions.

Initially, it uses an in-memory storage – meaning all data exists only in the computer’s memory, and is lost when the program ends – but you can easily switch to other storage methods.

You can choose to persist your data to files on your hard drive for later retrieval, use a dummy adapter that simply throws away any changes, or even create your own custom adapter.

The adapter cleverly remembers these configurations, avoiding unnecessary re-initialization.

To get data from a backtest run, you can use `getData`, specifying the asset, context (strategy, exchange, frame), and the timestamp. Similarly, `setData` lets you update values during a backtest.

If the underlying file system or working directory changes, `clear` provides a way to refresh the adapter's internal state to ensure data is properly loaded.


## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data within your trading sessions, whether you're running a backtest or a live trading environment. 

It intelligently directs data retrieval and storage requests to the appropriate system – either the backtest-specific storage or the live trading storage – based on whether you're in backtest mode.

You can use `getData` to retrieve existing session values, specifying the symbol, context details (like strategy and exchange names), a backtest flag to indicate the environment, and a timestamp. 

Similarly, `setData` lets you update those session values, again routing the update to the correct storage depending on the backtest flag and providing the necessary context and timestamp information. Essentially, it simplifies working with session data by abstracting away the differences between backtesting and live trading.

## Class ScheduleUtils

The ScheduleUtils class helps you keep track of and report on scheduled trading signals. Think of it as a central place to monitor how signals are being processed and identify potential bottlenecks.

It lets you gather data about signals waiting to be executed, signals that were cancelled, and calculate metrics like cancellation rates and average wait times. 

This class also provides a way to generate clear, readable markdown reports summarizing all these events for a specific trading strategy and symbol.

You can easily get statistical data for a particular strategy, create reports with customizable columns, or even save those reports directly to a file on your system. It’s designed to be simple to use, providing a single, convenient point of access for all these functions.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing by recording their lifecycle events. It listens for signals and logs key moments like when a signal is scheduled, when it starts, and when it's canceled. This service calculates how long it takes from the initial scheduling to when the signal actually executes or is canceled, giving you insight into potential delays.

The service uses a logger to provide debugging information and relies on a "tick" processor for handling signal events.

You can subscribe to the service to receive these signal events; the subscription is designed to prevent you from accidentally subscribing multiple times. When you're done, you can unsubscribe to stop receiving events.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and understand scheduled trading signals by automatically generating reports. It monitors scheduled and cancelled signal events, keeping a record of each one for every strategy you're using.

These records are then compiled into easy-to-read markdown tables, providing a detailed history of signal activity. The service also calculates useful statistics like cancellation rates and average wait times to give you deeper insights into your trading strategies.

You can easily generate and save these reports to disk, organizing them by strategy for quick access. The system uses a unique storage area for each combination of symbol, strategy, exchange, frame, and backtest to ensure data isolation.

You have the option to subscribe to signal events, unsubscribe, clear existing data, retrieve statistics, or generate a report – all of which provide different levels of insight into your scheduled signal performance. You can also customize which columns are displayed in the reports.

## Class RiskValidationService

This service helps you keep track of and verify your risk management configurations. It acts as a central place to register different risk profiles, making sure they exist before you try to use them in your trading strategies. To improve speed, it remembers the results of previous validations, so you don't have to repeat checks unnecessarily.

You can use it to register new risk profiles, validate whether a specific profile exists, and get a full list of all profiles you've registered. Essentially, it provides a way to organize and double-check your risk management setup. It stores all registered risk profiles, validates whether a risk profile exists, and caches results for efficiency.


## Class RiskUtils

This class offers tools for examining and reporting on risk rejections within your trading system. Think of it as a way to easily analyze why trades were rejected, helping you fine-tune your strategies and improve overall risk management.

It collects data about rejections – things like the symbol involved, the strategy used, the position size, and the reason for rejection.  

You can use it to get statistical summaries of these rejections, which will give you a high-level view of problem areas.

It can also generate detailed markdown reports that list each rejection event with key information, allowing you to dig into specifics. Finally, you can save these reports directly to files for later review or sharing. The reports are organized by symbol and strategy, so you can focus on particular areas of concern.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas, acting like a central hub for defining and accessing them. It uses a special system for storing schemas in a type-safe way, ensuring consistency and reducing errors.

You add new risk profiles using the `addRisk()` method (referred to as `register` in the code), and you can later retrieve them using their names with the `get()` method.

Before a new risk schema is added, it's checked with `validateShallow()` to make sure it has all the necessary parts and is structured correctly.

If a risk schema already exists, you can update parts of it using the `override()` method – this allows you to make changes without completely redefining the entire schema. The `loggerService` property gives access to logging and context information for debugging and monitoring.

## Class RiskReportService

This service, RiskReportService, keeps a record of when risk checks reject trading signals. Think of it as a logbook for those situations.

It actively listens for these rejections, capturing the reason why a signal was rejected and the details of the signal itself.

This information is then stored in a database, allowing you to analyze trends, understand the reasons for rejections, and perform audits.

To get it working, you subscribe to the rejection events, and when you're done, you unsubscribe to stop listening. This helps prevent accidental duplicate subscriptions. The service uses a logger to display debugging messages.


## Class RiskMarkdownService

This service helps you create and store reports about rejected trades due to risk management rules. It listens for events indicating a trade was rejected and organizes them.

It keeps track of rejections for each symbol and trading strategy you're using. Then, it generates easy-to-read markdown reports that detail the rejection information.

You'll also get summary statistics, like the total number of rejections and how they're distributed across different symbols and strategies. These reports are saved as files on your computer.

You can subscribe to receive these rejection events, and the service makes it simple to get statistical data, generate reports, and save them to disk. The service also provides a way to clear out the stored data when it's no longer needed, either all at once or for a specific trading setup.

## Class RiskGlobalService

RiskGlobalService is a central component that handles risk management within the trading framework. It acts as a gatekeeper, ensuring that trading signals comply with established risk limits before they are executed.

It utilizes a connection service for risk limit validation and incorporates several services for different aspects of validation, including exchange, frame, and overall risk assessment.

The `validate` method helps ensure the risk configuration is correct and avoids unnecessary checks by remembering previous validations.

The core functions include `checkSignal`, which simply verifies if a trade is allowed based on risk rules, and `checkSignalAndReserve`, a more robust version that guarantees concurrency safety when validating and reserving resources.  This prevents multiple strategies from simultaneously exceeding limits.

To complete a trade, `addSignal` registers the signal with the risk management system, while `removeSignal` cleans up when a trade is closed.  Finally, `clear` provides a way to wipe out the risk data, either completely or for a specific risk configuration.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently directs requests to the correct risk management component based on the specific risk configuration you've defined.

Think of it as a router that makes sure the right risk rules are applied to each trading decision. It also remembers which risk rules it's used before, improving performance by avoiding repeated calculations.

Here’s a breakdown of what it does:

*   **Routes Risk Checks:** It determines which risk implementation to use based on a risk name, exchange, frame, and backtest mode.
*   **Memoizes Risk Instances:**  It keeps a record of frequently used risk configurations, so it doesn't have to recreate them every time you need them. This speeds things up considerably.
*   **Provides Methods for Key Actions:** It provides functions for checking if a signal is valid, reserving resources for a signal, adding a new signal, removing a closed signal, and clearing cached risk configurations.
*   **Concurrency Safe:** The `checkSignalAndReserve` method is designed to handle situations where multiple processes might be checking a signal at the same time, ensuring data integrity.

The service relies on other components, like a risk schema service and time meta service, to function correctly, receiving them through dependency injection.

## Class ReportWriterAdapter

This framework provides a flexible way to store and manage data generated during trading simulations and live trading. It uses an adapter pattern, allowing you to easily swap out different storage methods without changing the core logic. The system intelligently keeps track of storage instances, ensuring only one instance of each type is used throughout the application's lifetime, which helps with efficiency. 

The `ReportFactory` lets you define how reports are created, defaulting to a JSONL storage method. `getReportStorage` keeps a record of these created instances.

You can use `writeData` to write data to the chosen storage, and the system will automatically set up the storage the first time it's used.

You have control over the storage method using `useReportAdapter` to specify a different creation method or to switch to a dummy adapter which just discards the data – useful for testing. `useJsonl` reverts to the standard JSONL method, and `clear` will remove any cached storage instances, which is helpful when the working directory changes.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs. You can turn on logging for specific areas like backtesting, live trading, or performance analysis.

It provides a way to selectively start or stop these logs, creating JSONL files that record events in real-time with helpful information. Think of it as a central switchboard for your data collection.

When you enable logging for a service, it starts listening for events and writing them to files. Be sure to use the provided unsubscribe function when you're done, because this prevents memory issues.

Disabling a service, on the other hand, immediately halts the logging process for that area without needing a separate unsubscribe step.


## Class ReportBase

The `ReportBase` class is designed to efficiently log trading events to files in a standardized JSONL format. It’s particularly useful for keeping track of events during backtesting and for later analysis.

Each report type gets its own file, and data is written as individual lines, each representing a single event with associated metadata like the trading symbol, strategy, exchange, timeframe, and signal identifier. The system is built to handle large volumes of data with backpressure and includes safeguards to prevent write operations from hanging indefinitely. 

It automatically creates the necessary directories and handles errors gracefully. The `waitForInit` method ensures the file and stream are properly set up, and the `write` method is how you actually log the events.  You can safely call `waitForInit` multiple times without issues.

## Class ReportAdapter

The ReportAdapter is designed to help you collect and manage data during backtesting, making it easy to switch between different ways of storing that information. Think of it as a central point for handling report data, allowing you to plug in different storage solutions as needed.

It uses a clever system to avoid creating unnecessary storage instances, remembering which type of storage you're using. By default, it saves data in JSONL format, but you can easily change this if you need to. 

You can even temporarily disable data storage with a "dummy" adapter for testing purposes, ensuring no data is actually written.  If your project's working directory changes, clearing the adapter's cache becomes important to ensure it's using the correct storage location.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a central place to get key performance metrics for your trading positions during backtests or live trading. Think of it as a reporting hub, giving you access to things like unrealized profit/loss (both percentage and dollar amounts), peak profit levels, and drawdown information. 

It's designed to simplify retrieving this data, ensuring consistency and including validation for various aspects like strategy and exchange. It's a singleton, meaning you'll use the same instance throughout your application.

Here's a breakdown of what it offers:

*   **Profit & Loss Metrics:** Easily access unrealized P&L, highest profit levels (price, timestamp, percentage, cost), and the potential for breakeven at those peaks.
*   **Drawdown Analysis:** Track the duration of active positions, waiting times, and the time elapsed since peak profit or worst drawdown. You can also get the price and timestamp associated with those extreme points.
*   **Distance Metrics:**  Calculate the P&L distance (both percentage and cost) between the current price and the highest profit or deepest drawdown points, which gives insight into risk exposure. 
*   **Time-Based Metrics:**  Get the number of minutes the position has been active, waiting, or in drawdown.
*   **Backtest Mode:**  The `backtest` parameter allows you to analyze historical performance accurately.

Essentially, `ReflectUtils` helps you understand the performance characteristics of your trading strategies in a detailed and structured way.

## Class RecentLiveAdapter

RecentLiveAdapter helps you manage and access recent trading signals, offering flexibility in how those signals are stored. Think of it as a central hub for accessing the most recent signals for a specific trading strategy.

It allows you to easily switch between different storage methods—either storing signals persistently on your disk or keeping them only in memory for a quicker, but less durable, solution. This is accomplished through adapters, making it simple to change the underlying storage without modifying the core logic of your trading system.

You can customize which storage method is used through a simple configuration process. It remembers the initial storage implementation and only recreates it when necessary, like when the directory the strategies are located in changes.

The adapter handles requests to retrieve the most recent signal, calculate the time since that signal was created, and react to active ping events, forwarding these actions to the chosen storage backend. If you want to keep things simple, it comes with default options for persistent or memory-based storage.

## Class RecentBacktestAdapter

This component acts as a bridge for managing recent trading signals, allowing you to choose where that data is stored – either in memory or persistently on disk. It uses a flexible design, letting you easily swap out the storage mechanism without changing the rest of your code.

You can easily switch between an in-memory storage solution and a persistent one, which is useful for different testing and production scenarios. 

Think of it as a central point to get recent signal information, like the most recent signal for a specific trading strategy. It provides helpful functions to retrieve that signal or calculate how long ago it was created.

The `useRecentAdapter` method lets you directly specify which storage implementation to use. It also has handy shortcuts like `usePersist` and `useMemory` to quickly switch storage types. Clearing the cached instance ensures a fresh start, especially when your working directory changes.

## Class RecentAdapter

The RecentAdapter is your central hub for managing recent trading signals, both during backtesting and in live trading. It automatically updates its signal storage by listening for incoming data, ensuring you always have the most up-to-date information.

To avoid accidentally creating duplicate subscriptions, it uses a "single shot" system to subscribe only once.

You can easily access the latest signal for a specific symbol and trading context using `getLatestSignal`, which prioritizes backtest data and includes a safeguard to prevent looking into the future. 

Need to know how long ago the last signal was generated? `getMinutesSinceLatestSignalCreated` calculates the elapsed time, again considering backtest data first and providing a look-ahead protection.

When you're finished, `disable` gracefully unsubscribes the adapter, and you can call it safely as many times as needed. You control when the adapter is active through the `enable` property, which guarantees a one-time subscription.

## Class PriceMetaService

PriceMetaService helps track current market prices for trading strategies. It's designed to provide these prices even when you're not actively executing a trade.

Think of it as a memory of recent prices, organized by symbol, strategy, exchange, frame, and whether it’s a backtest.

This service keeps track of prices and updates them as new data comes in from the strategy. If a price isn't immediately available, it will wait a short time to see if one arrives.

You can clear these stored prices if you want to make sure you're starting with fresh data, especially when starting a new backtest or live trading session.

If you're running a trade, it uses a different method to get the live exchange price instead of relying on the cached value. It’s registered as a single, central service and updated automatically after each strategy tick.

## Class PositionSizeUtils

This class helps you determine how much of an asset to trade, based on different sizing strategies. It provides several pre-built methods, each with its own formula for calculating the appropriate position size. 

You’ll find options for fixed percentage risk, the Kelly Criterion (which aims to maximize growth rate), and an ATR-based method (using Average True Range to account for volatility). 

Each method performs checks to ensure the information you provide aligns with the sizing technique being used. Essentially, it’s designed to simplify and validate position sizing calculations, making it easier to apply consistent risk management.


## Class Position

The Position class provides helpful tools for figuring out where to place your take profit and stop loss orders when trading. It automatically adjusts the direction of these orders depending on whether you're going long (buying) or short (selling).

The class offers two main calculation methods:

*   **moonbag:** This strategy sets a take profit level at a fixed percentage above (for long positions) or below (for short positions) your entry price.
*   **bracket:**  This allows for more precise control, letting you define your own custom percentages for both the take profit and stop loss levels.

These methods take information about your position (long or short), the current price, and the desired percentages as input, and return an object with the calculated take profit and stop loss prices.

## Class PersistStrategyUtils

This class helps manage how your trading strategies remember their state between runs, particularly when you're backtesting or running live. It's designed to handle things like pending orders or actions that haven't fully completed.

Think of it as a way to safely store and retrieve a snapshot of your strategy's important data.

The system uses a clever memoization technique, meaning it only creates and manages one storage instance for each unique combination of symbol, strategy, and exchange – this helps improve performance.

You can customize how the data is stored and retrieved by swapping out the default storage mechanism.  There's a default file-based option, a dummy option for testing (where nothing actually gets saved), and the ability to provide your own custom storage solution.

If you're using `ClientStrategy` for live trading, this utility automatically takes care of persisting certain internal data. It also provides ways to clear the stored data, which is useful if your working directory changes during a strategy run.

## Class PersistStrategyInstance

This class provides a way to reliably save and load the state of your trading strategy. It's designed to work with the backtest-kit framework and ensures that your strategy’s data persists even if there are unexpected interruptions.

It essentially acts as a wrapper around a file-based storage system, guaranteeing that writes are done safely and atomically.  Think of it as a secure container for your strategy's data.

The class is initialized with the trading symbol, strategy name, and exchange name to clearly identify the data it’s managing. It uses a specific key ("strategy") for storing this data, keeping things organized.

The `waitForInit` method is used to set up the underlying storage. To retrieve your strategy's saved state, use `readStrategyData`. To save the current state, use `writeStrategyData`, which can also be used to clear the saved state by passing null.


## Class PersistStorageUtils

This class helps manage how your trading signals are saved and loaded persistently, ensuring your data survives restarts and changes. It acts as a central point for handling storage, making it easy to switch between different storage methods. 

The system keeps track of storage instances, creating one for each mode like "backtest" or "live," and it's designed to work reliably even if things crash. 

You can easily customize how data is stored by providing your own storage adapter, or you can use the built-in JSON-based storage or a dummy adapter for testing.  This utility automatically handles writing and reading signals, and each signal is stored as its own file, identified by its unique ID. If the current working directory changes during backtesting, it's a good practice to clear the cached storage instances.


## Class PersistStorageInstance

This class provides a way to persistently store trading signals to files on your computer, making your backtesting data safe and recoverable. It's designed to work well with backtesting scenarios, which is reflected in its constructor. 

Each signal you store will be saved as its own JSON file, identified by a unique ID.  When you read the data back, the system will look through all the files to find them. 

To ensure your data remains safe even if there are unexpected issues, it uses a technique called atomic writes, which helps prevent data corruption.  You'll need to initialize the storage to get started. 

You can read all stored signals at once, and when you want to save changes, they're written back out to the individual signal files.

## Class PersistStateUtils

This class helps manage and save the state of your trading strategies, ensuring data isn't lost even if things go wrong. It acts like a helper for safely storing and retrieving information related to specific signals and buckets.

It remembers which state storage instances it has created, so it doesn't make unnecessary copies. You can also customize how it stores data, whether using a file system or another method entirely.

The `waitForInit` function lets you control when the storage is initially set up, which can be useful for managing initial setup. Reading and writing data is also handled automatically, and it sets up the necessary storage the first time it's needed.

You can even temporarily switch to a "dummy" mode where all operations are ignored for testing purposes. To clean things up, you can clear the stored data or explicitly release storage for individual signals. Lastly, you can change the kind of storage that’s used, allowing you to plug in your own methods of persistence.

## Class PersistStateInstance

This class provides a way to save and load trading state information persistently, usually to a file. It's designed to be a straightforward way to store data like indicator values or order history.

Think of it as a container specifically for a particular trading signal, identified by its `signalId`, and a related "bucket" or named storage area (`bucketName`). It automatically handles writing data to a file in a safe, all-or-nothing manner.

You don't need to worry about managing the file cleanup itself; that's taken care of by other parts of the system.

Here's a breakdown of what you can do with it:

*   You can initialize the storage.
*   You can retrieve previously saved state data.
*   You can save new or updated state data.
*   The `dispose` function simply lets the framework manage caching aspects.

## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved, ensuring it's reliable even if things go wrong. It keeps track of signal information separately for each strategy, symbol, and exchange you’re using.

The system uses a special "adapter" to decide how the signal data is actually stored – you can customize this adapter if you need a different storage method.  The data is written and read in a way that prevents conflicts, and designed to handle unexpected crashes, making sure your signal state remains consistent.

You can tell it which type of storage to use – a custom adapter, a file-based solution, or even a dummy version for testing.  The system automatically creates and manages these storage instances as needed. If the program's working directory changes, clearing the cache ensures data consistency.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, is designed to reliably save and retrieve signal data for your trading strategies. It's a handy tool for keeping track of signals across sessions, even if your program crashes.

It uses a file to store the signal data, ensuring that writes are handled safely and completely.  Think of it as a safe place to store your signal information, linked to a specific trading symbol, strategy, and exchange.

The class takes the trading symbol, strategy name, and exchange name during setup to identify where to store the signal data.  It internally manages a file-based storage system and makes sure the initialization happens correctly.

You can use `readSignalData` to retrieve a signal's information, and `writeSignalData` to save updated signal data, or clear the existing signal.

## Class PersistSessionUtils

This utility class helps manage how session data is saved and loaded, ensuring a consistent and reliable experience. It acts as a central hub for handling session persistence, remembering information related to your trading strategies. 

It intelligently caches session storage instances, creating them only when needed and reusing them for the same strategy, exchange, and data frame combination. This caching avoids unnecessary file operations and improves performance.

You have the flexibility to customize how sessions are persisted, choosing between different storage methods like using a file-based system, a dummy implementation for testing, or providing your own custom adapter.

The class also includes functions to initialize session storage, read and write data, and clear the cache. You can even trigger cleanup processes for specific sessions. It is designed to be crash-safe, ensuring that your session data remains secure.


## Class PersistSessionInstance

This class provides a way to save and load session data for your trading strategies, using files to store the information. It's designed to work with a specific strategy and exchange, identifying each session by a unique frame name. 

Think of it as a safe keeper for your session's important details.

The class automatically handles writing data to a file and reading it back, ensuring that the data is stored reliably. It's meant to be used in conjunction with `PersistSessionUtils` for overall resource management. 

You don't need to worry about cleaning up resources directly; `PersistSessionUtils` takes care of that. 

Essentially, this class simplifies the process of persisting your session data.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how scheduled trading signals are saved and loaded. It ensures each strategy's signals are stored independently and reliably.

It uses a clever system to create storage instances for signals based on the trading symbol, strategy, and exchange, avoiding unnecessary duplication.

You can customize how these signals are stored by providing your own storage solutions, or choose from pre-built options like a file-based system or a dummy for testing.

The `readScheduleData` and `writeScheduleData` methods handle fetching and saving signals, automatically setting up the storage if it doesn't already exist. 

If you need to change how signals are persisted, the `usePersistScheduleAdapter` method allows you to plug in a different storage mechanism, and `clear` will refresh the storage system if needed, like when the working directory changes. It also provides a quick switch to use a default file-based storage or a dummy, no-op storage for testing.

## Class PersistScheduleInstance

This class helps store and retrieve schedule data, like signals, for a specific trading strategy on a particular exchange. Think of it as a way to save the state of your automated trading plan so it doesn't get lost if something goes wrong. 

It uses a file to keep the data safe and ensures that writes happen reliably, even if there are interruptions. Each set of data is uniquely identified by a combination of the symbol (like 'AAPL'), strategy name, and exchange name.

The `waitForInit` method sets up the initial storage. `readScheduleData` fetches the data associated with a specific schedule, and `writeScheduleData` is used to save or clear that data. It essentially provides a simple way to persist data related to scheduled signals.


## Class PersistRiskUtils

This class helps manage and store information about active trading positions, making sure the data is handled consistently and safely. It's specifically designed to work with ClientRisk for real-time trading, ensuring that position data persists even if there are unexpected interruptions.

It uses a clever system to create storage instances for each risk profile, avoiding unnecessary repetition. You can even customize how this storage works by providing your own “adapter” – a special constructor – to control the persistence mechanism. 

The `readPositionData` function retrieves existing position data, while `writePositionData` saves new or updated data. It initializes storage the first time you use those functions.

To help with flexibility, you can easily switch between different persistence methods, such as using a default file-based system or a dummy system for testing. If things change in your environment, the `clear` function lets you refresh the storage system and make sure everything is working correctly.

## Class PersistRiskInstance

This class, `PersistRiskInstance`, helps manage and save your trading positions to a file, ensuring data safety even if things go wrong. It's designed to work specifically within a defined trading context, using a consistent way to identify where the position data is stored. Think of it as a reliable record-keeper for your trading activities.

It automatically handles saving your position data in a way that minimizes the risk of data loss or corruption, even if the application crashes unexpectedly.

Here's a breakdown of how it works:

*   The constructor takes the risk and exchange names to identify the context.
*   `waitForInit` sets up the underlying storage so that the data can be stored reliably.
*   `readPositionData` retrieves the saved positions data at a specific time.
*   `writePositionData` saves your current position data, making sure it's stored safely.

Essentially, it provides a straightforward and dependable way to persist and retrieve your risk and position information.

## Class PersistRecentUtils

This class, `PersistRecentUtils`, helps manage how recent trading signals are stored and retrieved. It's designed to be reliable, even if the system crashes, and remembers signals based on specific criteria like the trading symbol, strategy name, exchange, and timeframe.

It uses a clever system to create and share storage instances—meaning it doesn't have to repeatedly create and destroy them, making it more efficient. You can even plug in your own custom ways of storing signals.

Here’s a breakdown of what you can do:

*   **Choose how to store signals:** Easily switch between different storage methods, like using files, a dummy adapter (for testing), or a custom adapter you create.
*   **Forget and start fresh:** Clear out the existing storage if you need to, for example, when running multiple strategies.
*   **Read recent signals:**  Get the latest signal that was recorded for a specific trading setup.
*   **Save recent signals:**  Record a new signal for a specific trading setup.
*   **Key Generation:** Automatically builds a unique identifier for each signal, including details like timeframe and whether you're in backtest or live mode.



It’s a foundational component used by other parts of the trading framework to keep track of recent signals.

## Class PersistRecentInstance

This component, `PersistRecentInstance`, is designed to reliably save and retrieve the most recent trading signal data for a specific symbol, strategy, and exchange. It essentially provides a way to keep track of the last known signal. 

It works by storing this data in a file, using the symbol as a unique identifier. The location of this file is also influenced by whether the simulation is a backtest or live trading session, and optionally by a frame name.

You can think of it as a system that automatically remembers the most recent signal for each trading setup you define.

**Here's a breakdown of what it does:**

*   It initializes its internal storage mechanism.
*   It reads the latest signal data that’s been saved.
*   It saves a new signal to the storage, associating it with the symbol.

The class constructor sets up the parameters defining the trading context (symbol, strategy, exchange, frame, and backtest mode). You'll specify those when you create an instance of this component to ensure data is saved to the correct location and with the correct context. The internal `_storage` property handles the actual file storage.


## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and store partial profit and loss information for your trading strategies, particularly when dealing with live trading. It's designed to ensure this data is saved reliably, even if there are unexpected interruptions.

It keeps track of these partial data points, organizing them by the trading symbol, the name of your strategy, and a unique identifier for each signal. 

The system uses a clever trick – it only creates and loads these data storage instances when it absolutely needs them. You can also customize how this data is stored using different adapters; for example, you could use a simple file system, a database, or even a dummy adapter for testing.

If your trading environment changes, like when you change directories, you can manually clear the stored data. The class also provides shortcuts for using a standard file-based storage or a dummy (no-op) adapter for testing purposes.

## Class PersistPartialInstance

This component helps you save and retrieve temporary data related to your trading strategies, ensuring that even if things go wrong, you don’t lose progress. Think of it as a safe place to store incomplete information while your strategy is running. 

It uses a file on your computer to store this data, automatically handling the saving process securely. Each instance is tied to a specific trading symbol, strategy name, and exchange to keep your data organized.

The constructor sets up these identifiers. 

The `waitForInit` method prepares the storage space. The `readPartialData` method retrieves a saved piece of data based on a unique signal identifier. Finally, `writePartialData` allows you to store new partial data, again using that unique identifier to pinpoint where the data goes. This helps ensure your data is saved reliably and consistently.


## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved, especially for backtesting and live trading environments. It acts as a central point for handling notification persistence, making sure that notifications are reliably stored and accessible.

It uses a clever system of memoization, meaning it creates and reuses notification storage instances to improve efficiency. You can even customize how notifications are stored by providing your own storage constructors.

The `getNotificationStorage` property provides these storage instances, and the `readNotificationData` and `writeNotificationData` methods handle loading and saving notification information. Each notification is stored as its own file, which improves organization and reliability.

If you need to change how notifications are persisted, the `usePersistNotificationAdapter`, `useJson`, and `useDummy` methods let you easily switch between different storage options, including a dummy option for testing. Clearing the cache with the `clear` method is useful when the working directory changes, like between strategy executions, so the system uses the correct file paths.

## Class PersistNotificationInstance

This class helps manage and save notification data to files, ensuring they are persistent even if your application restarts. It's designed to be reliable, using atomic writes to prevent data corruption. 

Each notification is stored as its own JSON file, making it easy to access and manage individual notifications. 

The `waitForInit` method prepares the storage space, while `readNotificationData` retrieves all saved notifications.  You can use `writeNotificationData` to save new notifications or update existing ones, knowing that each notification's ID will be used to identify and store it. It is configured to be used in backtest scenarios.


## Class PersistMemoryUtils

This utility class helps manage how memory data is saved and retrieved, especially when your application needs to recover from crashes or unexpected events. It ensures that each storage area for your data is created and handled efficiently, based on a unique combination of identifiers.

The class uses a clever system to reuse storage instances, making sure you don't create unnecessary files and slow things down. You can also customize how the storage works by providing your own creation functions.

It provides methods for reading, writing, and deleting memory entries, and checks to see if data exists before attempting to use it. Importantly, it includes a way to clear the system’s internal cache when needed, like when your application's working directory changes. There's also a function to clean up individual storage areas when they are no longer needed.

You can easily swap out the default storage behavior with alternatives – either a file-based system or a dummy version that doesn't actually save anything (useful for testing). Finally, it allows you to iterate through existing data to build indexes or perform other tasks.

## Class PersistMemoryInstance

This class, PersistMemoryInstance, handles saving and retrieving memory data to a file. It’s a reliable way to store information persistently, like settings or cached results.

It manages this storage by writing data to JSON files, ensuring that changes are saved correctly. 

The class provides methods to read, write, and delete memory entries, offering a straightforward interface for data management. Deleted entries aren't physically removed but are marked as "removed," allowing you to easily filter them out when listing data. 

It also includes a method to initialize the underlying storage. 

Finally, the `dispose` method doesn’t actually do anything on its own because the management of related caches is handled elsewhere.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, specifically designed for persistent storage. It keeps track of cached data in a structured way, organizing it by a combination of timestamp and symbol.

The class allows you to customize how the data is stored using different adapter options, ensuring the data is written and read reliably. It handles situations where the data needs to be initialized for the first time, ensuring the process is smooth.

You can also remove data entries, which marks them for removal rather than permanently deleting them. The system remembers which adapter you’re using, and offers convenient options to switch back to a file-based adapter or a dummy adapter that doesn't actually store anything. Finally, it's important to clear the internal cache when the working directory changes to maintain accuracy.

## Class PersistMeasureInstance

This class helps you store and retrieve trading data persistently, like performance metrics or historical results. It acts as a bridge, managing the actual storage and ensuring operations happen reliably.

It uses files to hold your data, organized within a designated "bucket". This allows you to easily separate different types of data.

When you need to retrieve data, it looks for entries, and if a measure has been "soft-deleted" (marked as removed), it won't be returned.

If you want to remove data, it doesn't actually erase the file; instead, it adds a flag to indicate it's removed.

To get a list of all existing measures, it filters out any that have been soft-deleted. 

The class also handles the initial setup of the storage, making sure everything's ready before you start working with it.

## Class PersistLogUtils

This class helps manage how log entries are saved and retrieved. It acts as a central point for accessing a log instance, which can be customized with different storage methods. 

The system uses a cached version of the log instance to avoid repeatedly creating it. You can easily swap out the way the logs are stored, for example, to use a file-based system, a JSON-based system, or even a dummy system that doesn't actually save anything.

To get the log data, you can either read all existing entries or write new entries, with the writes being append-only to prevent duplicates. It's designed to handle situations where the application might crash and ensures the log state remains consistent. If the working directory changes between strategy runs, you’ll need to clear the cached log instance.

## Class PersistLogInstance

This class provides a way to save and load trading logs to files, ensuring your history is preserved. It's like having a digital notebook for your trades.

Each trade or event gets its own separate file, making it easy to manage and review.  The system only adds new entries, it won't overwrite anything already saved.

To use it, you'll need to make sure the storage is initialized before reading or writing. The `readLogData` method pulls all the log entries from the files. When you add new data, `writeLogData` safely adds entries to the storage, preventing any accidental data loss.


## Class PersistIntervalUtils

This component manages how your backtest kit keeps track of which intervals have already fired. It essentially acts as a persistence layer, storing a record for each interval that has run. These records are saved in a directory called `./dump/data/interval/`, and their presence indicates the interval has already been processed.

You can customize how these records are stored and managed by providing your own constructors for the persistence instances.  There’s also a handy `clear` function to reset this tracking when your working directory changes.

The `readIntervalData` function retrieves these records, while `writeIntervalData` creates them, and `removeIntervalData` marks them as deleted. The `listIntervalData` method allows you to iterate through all recorded intervals for a specific bucket. For testing or when you don't need actual persistence, you can switch to a dummy implementation where all operations are ignored.

## Class PersistIntervalInstance

This class provides a way to save and retrieve data related to specific time intervals, like when a certain event happened. It's designed to work with files, so the data persists even if your program closes.

It handles writing data to files in a reliable way, even if things go wrong during the process.  When you want to remove data, it doesn’t actually delete the file; instead, it marks the data as "removed," so you can always bring it back if needed. This allows intervals to be retried after a 'deletion'.

The `bucket` property identifies the storage location for this data. The underlying file storage is managed by `_storage`.

You can initialize the storage with `waitForInit`.  `readIntervalData` lets you fetch the data associated with a particular interval key; if the data is missing or marked as removed, it will return nothing. `writeIntervalData` stores the data. `removeIntervalData` essentially hides the data by marking it as removed.  Finally, `listIntervalData` gives you a way to see all the existing interval keys, but it only shows the ones that haven't been marked for removal.


## Class PersistCandleUtils

This class, PersistCandleUtils, helps manage how your historical candle data (like open, high, low, close prices) is stored and retrieved. It acts as a cache, saving data as individual JSON files organized by exchange, symbol, time interval, and timestamp.

The class intelligently checks if the cached data is complete and up-to-date before using it, automatically refreshing when needed. It ensures data consistency through atomic operations.

You can customize how the cached data is stored, choosing from different implementations such as a standard file-based approach, a custom adapter, or even a dummy implementation for testing.  The `getCandlesStorage` property is a way to control the creation of these storage instances. 

Functions like `readCandlesData` and `writeCandlesData` handle reading and saving data to the cache, creating the storage instance if it doesn't exist yet. If you're changing the directory where your strategy runs, be sure to clear the cache to make sure it re-initializes properly.

## Class PersistCandleInstance

This class provides a way to persistently store and retrieve candle data, acting as a bridge between your trading logic and a file-based storage system. It’s designed to keep track of candles for a specific trading symbol, interval (like 1 minute or 1 hour), and exchange.

Each candle’s data is saved as a separate JSON file, making it easy to manage and access individual candles.  If a candle's timestamp isn’t found, it signals a cache miss, prompting the system to fetch the data again.

The writing process is careful – it will ignore any candles that are still incomplete (meaning they haven't closed yet) or files that already exist to prevent data corruption.  If a candle’s data is found to be invalid, it issues a warning and treats it as a cache miss to ensure you’re always working with reliable information. 

You can use `waitForInit` to ensure the storage system is ready before you start reading or writing data.  The `readCandlesData` method lets you retrieve a range of candles, and `writeCandlesData` handles the storage of new candle information.


## Class PersistBreakevenUtils

This class helps manage and save breakeven data – the point at which a trade becomes profitable – for your trading strategies. It handles the behind-the-scenes work of storing and retrieving this data, so you don't have to.

Think of it as a central hub that keeps track of breakeven states for each symbol (like BTCUSDT) and strategy you're using.  It automatically saves data to files organized by symbol and strategy, making it easy to load them later.

The system uses a clever technique to ensure it's efficient. It only creates a storage instance for each unique combination of symbol, strategy, and exchange once, and reuses it afterward. You can even customize how the data is stored, either by using the default file-based system or switching to a "dummy" mode for testing. If you need to change how data persistence works, you can register custom components to handle the job.

If your working directory changes during a strategy run, you'll need to clear the cached storage.

## Class PersistBreakevenInstance

This class provides a reliable way to save and retrieve breakeven data, a crucial element for backtesting trading strategies. It acts as a bridge, wrapping a file-based storage system to ensure your data is preserved even if something unexpected happens.

Think of it as a safe keeper for your breakeven calculations. It identifies each data point by a unique signal ID, essentially acting like a digital filing cabinet for this information. 

It's designed to work within a specific trading context, using the symbol, strategy name, and exchange name to organize its storage.

Here's a breakdown of what it does:

*   It initializes the storage mechanism, preparing it for use.
*   It can fetch existing breakeven data based on a signal ID and a timestamp.
*   It saves new or updated breakeven data, again using a signal ID and timestamp for organization.
*   It safeguards your data with atomic writes, which means changes are saved completely or not at all, preventing data corruption.

## Class PersistBase

This class provides a foundation for storing and retrieving data to files, ensuring the process is reliable and safe. It's designed to handle situations where file corruption might occur, automatically cleaning up any issues.

The class manages where your data files are stored and organizes them based on a given name.  It handles creating the storage directory if it doesn't already exist and also validates the integrity of existing files during initialization.

You can use it to read data back from storage, check if data exists, and write data securely using a special method that prevents data loss even if something goes wrong during the writing process. Finally, it offers a way to iterate through all the entity IDs (unique identifiers for your data) stored, sorted alphabetically.

## Class PerformanceReportService

This service is designed to monitor and record how long different parts of your trading strategy take to run. It acts like a detective, tracking down bottlenecks and areas where your strategy might be slow.

It listens for performance-related events, capturing details like how long each step takes and associated information. This data is then saved so you can analyze it later to improve your strategy's speed and efficiency.

You can tell it to start listening for these events, and it will automatically stop when you need it to, preventing it from interfering with other parts of your system.  If you try to subscribe more than once, it makes sure only one subscription is active.  Similarly, you can explicitly tell it to stop listening.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance updates, organizes them by strategy, and calculates key statistics like average, minimum, and maximum values.

It automatically creates reports in a readable markdown format, which it saves to a designated folder, making it easy to analyze bottlenecks and understand what's impacting your strategy's performance.

You can subscribe to receive these performance events, and unsubscribe when you no longer need them.  There are also methods to retrieve specific performance data, generate reports on demand, and even clear out all the accumulated data when you want to start fresh. The framework handles the details of organizing data for each unique combination of symbol, strategy, exchange, frame, and whether it’s a backtest.


## Class Performance

The Performance class helps you understand how your trading strategies are performing. It provides tools to analyze metrics and create reports that pinpoint areas for improvement.

You can retrieve aggregated performance statistics for a specific symbol and strategy, giving you a breakdown of key metrics like duration, average time, and volatility. 

It also generates markdown reports that visually summarize your strategy’s performance, highlighting potential bottlenecks and areas where operations take the most time.

Finally, you can save these reports directly to your hard drive for later review, with the option to specify a custom file path. This allows for easy tracking and comparison of different strategies over time.

## Class PartialUtils

This class provides helpful tools for examining partial profit and loss data, which is useful for understanding how your strategies are performing. It acts as a central point to access and visualize these events, allowing you to track metrics and generate reports.

You can use it to retrieve aggregated statistics like total profit/loss counts for specific symbols and strategies.  It can also generate nicely formatted markdown reports, creating tables that show details of each profit/loss event, including the action, symbol, signal ID, position, level, price, timestamp, and whether it was a backtest or live trade.

Finally, this class simplifies the process of saving these reports to a file; it automatically creates the necessary directories and names the file with a clear and descriptive format, such as "BTCUSDT_my-strategy.md."

## Class PartialReportService

The PartialReportService helps you keep track of smaller, partial exits from your trades. It focuses on recording those moments when you take some profit or cut a loss before a position is fully closed.

This service listens for signals indicating these partial exits, both when things are going well (profit) and when they aren't (loss). It gathers details like the price and level at which these partial closures occurred.

The information is then saved persistently, allowing you to analyze your trading behavior regarding partial exits.

You can control whether the service is active by subscribing and unsubscribing – it prevents accidental multiple subscriptions. To stop it, use the unsubscribe function returned when you initially subscribe. If the service hasn't been subscribed, unsubscribing simply does nothing. 

The `tickProfit` and `tickLoss` properties handle the processing of partial profit and loss events respectively. A logger service is also used for debugging output.

## Class PartialMarkdownService

The PartialMarkdownService helps you create and store detailed reports about your trading profits and losses. It listens for events indicating profit or loss, organizes them by symbol and trading strategy, and then compiles them into easy-to-read markdown tables. 

You can subscribe to receive these profit and loss signals, and the service will automatically accumulate the data. It also provides overall statistics like the total number of profit and loss events. The service then saves these reports to files, making it simple to review your trading performance over time.

You can request specific data, generate reports, or clear all accumulated data. The storage for each report is isolated, ensuring that data from different symbols and strategies doesn’t get mixed up. This makes it a useful tool for tracking and analyzing your trading results.

## Class PartialGlobalService

This service manages and tracks partial profits and losses, acting as a central hub for these operations. It’s designed to be injected into your trading strategies, providing a clean way to handle partials and ensuring consistent logging.

Think of it as a middleman; it receives requests related to profits, losses, and clearing partials, logs those actions globally, and then passes them on to the underlying connection service.

It includes several validation services to check the integrity of your strategies, risks, exchanges, frames, and actions. This helps catch potential configuration issues early on.

The `validate` function is a smart shortcut, remembering previous validation results to avoid unnecessary checks. The `profit`, `loss`, and `clear` functions are the main ways you’ll interact with this service, each responsible for handling a specific state change and relaying that information further down the pipeline.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It acts as a central hub, creating and maintaining records for each signal, ensuring that profit and loss information is handled consistently. 

Think of it as a smart cache for signal-specific data. It keeps track of each signal's profit and loss history, creating a new record only once and reusing it whenever that signal is encountered. 

The service allows you to easily record when a signal reaches a profit or loss milestone, and to reset the record when a signal is closed out. It works closely with other parts of the system, automatically cleaning up old data to prevent memory issues. When signals are no longer needed, their records are automatically removed, keeping things tidy.


## Class NotificationLiveAdapter

This component helps manage and send notifications during a backtest or live trading session. It's designed to be flexible, letting you easily swap out how notifications are handled – whether it's to memory, a file, or even nowhere at all (for testing purposes).

You can think of it as a central hub for all notifications related to your trading strategy, like signal events, profit/loss updates, errors, and more.

The system uses a factory pattern, so you can choose different notification methods.  The default keeps notifications in memory.  You can also switch to persistent storage (saving them to disk) or a dummy adapter (which discards them, ideal for testing).

Key features include:

*   **Flexibility:** Easily change how notifications are sent.
*   **Convenience methods:** Simple shortcuts to switch between different notification adapters like `usePersist`, `useMemory`, and `useDummy`.
*   **Memoization:** The notification utility instance is created once and reused, improving performance.  `clear()` can be called to force a refresh when the underlying environment changes.
*   **Comprehensive handling:** Methods exist to manage various events like signals, profits, losses, errors, and synchronization. 
*   **Data Retrieval:** You can retrieve all stored notifications with the `getData` method. 
*   **Cleanup:** The `dispose` function allows you to clear all stored notifications when you're done.

## Class NotificationHelperService

This service helps manage and send out notifications related to trading signals. It's a behind-the-scenes helper used within the system to keep everything running smoothly.

It validates different aspects of your trading setup – strategy, exchange, frame, risk and action schemas – to make sure everything is set up correctly. This validation is smart; it only runs once for each combination of strategy, exchange, and frame, saving processing time.

The main function you'll interact with is `commitSignalNotify`. This is what triggers the notifications you receive about trading signals, combining validation with the actual signal emission. It makes sure that the notification is accurate, properly formatted, and sent out to the right places. Think of it as the final step in confirming and broadcasting a signal event.

## Class NotificationBacktestAdapter

This component lets you manage notifications during backtesting, offering flexibility in how those notifications are handled. It's designed to be adaptable, allowing you to easily swap out different notification methods without changing the core backtesting logic.

You can choose from several pre-built notification methods: an in-memory storage (the default), a persistent storage option that saves notifications to disk, and a dummy option that essentially ignores notifications entirely.

The system uses a factory pattern, meaning you can even create your own custom notification handlers if needed. The `getInstance` property is a smart shortcut – it builds the notification handler once and then reuses it, making things efficient.

The various `handle...` methods (like `handleSignal`, `handlePartialProfit`, `handleRisk`, etc.) all act as messengers, passing data to whichever notification method you've currently selected. There are also methods for retrieving all notifications (`getData`) and clearing them (`dispose`).

Finally, the `use...` methods provide a convenient way to switch between notification methods quickly – `useDummy`, `useMemory`, and `usePersist`. The `clear` method is crucial if your working directory changes during backtesting, ensuring a fresh notification handler is used.

## Class NotificationAdapter

The NotificationAdapter is designed to handle all your notification management needs, both during backtesting and when you're live. It keeps track of notifications, automatically updating as new signals arrive.

You can easily access both backtest and live notifications through a single interface. To prevent unexpected issues, it uses a "singleshot" system, ensuring that you only subscribe to notifications once.

You can enable and disable notification storage, and the `dispose` method offers a clean way to clear out all stored notifications when you're finished with a backtest or a live trading session. The `getData` method lets you retrieve all of your notifications, specifying whether you need backtest or live data.

## Class MemoryLiveAdapter

This component, `MemoryLiveAdapter`, provides a flexible way to manage trading memory, allowing you to choose different storage methods depending on your needs. Think of it as a central hub for storing and retrieving data related to your trading strategies.

You can easily switch between several storage options: a default file-system based storage that saves data persistently, a purely in-memory option for fast but temporary storage, a dummy adapter that simply ignores data, or even create your own custom storage solution.

The adapter keeps track of stored data using memoization, meaning it efficiently reuses instances to avoid unnecessary overhead. You can clear this cache when needed, particularly when your working directory changes.

It offers core functions for writing, reading, searching, listing, and removing memory entries, along with a method to discard data associated with specific signals. The search functionality utilizes a powerful text-scoring algorithm (BM25) to find relevant data quickly.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for your backtests. Think of it as a central point for how your backtest stores and retrieves data. It offers different storage options—like keeping everything in memory, persisting data to files, or even just discarding data—allowing you to tailor the adapter to your specific backtest needs.

You can easily switch between these storage methods using simple commands like `useLocal`, `usePersist`, or `useDummy`.  The adapter automatically handles caching memory instances to improve performance, but you can clear this cache manually if needed, for example, when the working directory changes.

The adapter includes methods to write, search, list, remove, and read data, all structured around a signal ID and bucket name.  It also offers a way to bring in your own custom memory storage implementations, providing maximum control over the backtesting process. Finally, it provides a way to dispose of memoized instances for a specific signal, which is useful when a signal is cancelled or closed.

## Class MemoryAdapter

The MemoryAdapter is the central component for managing memory storage within the backtest and live trading environments. It intelligently directs memory-related operations, like writing, searching, listing, removing, and reading data, to either the backtest or live memory systems based on configuration.

To keep things clean, it automatically handles subscription and unsubscription to signal lifecycle events, ensuring that stale data doesn’t linger and resources are properly released.  You can explicitly enable or disable this memory management functionality, and it’s designed to prevent duplicate subscriptions to avoid unexpected behavior. 

Think of it as a smart router that makes sure your memory operations go to the right place and handles cleanup for you.

## Class MaxDrawdownUtils

This class offers tools to understand and analyze maximum drawdown, a crucial metric for assessing risk in trading. Think of it as a way to get detailed reports and statistics about how much your strategies have lost at their worst points.

It doesn't create new instances; instead, you interact with a single, readily available instance to access its functions.

You can request specific data, like overall drawdown statistics, for a particular trading symbol and strategy, optionally specifying whether it's a backtest scenario.

It can also create formatted markdown reports summarizing all drawdown events for a given symbol and strategy combination, letting you see a chronological view of potential losses.  You can even have these reports automatically saved to a file. Finally, it provides an option to customize which data columns are included in the report.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is designed to track and record maximum drawdown events during a trading backtest. It actively monitors for these drawdown events and saves detailed information about them.

This service keeps a log of each drawdown event, capturing key data points like the timestamp, symbol, strategy name, exchange, frame, and backtest identifier. It also includes specifics about the signal that triggered the drawdown, such as its ID, position, current price, and the effective take profit and stop loss levels.

To get it working, you'll need to subscribe to the `maxDrawdownSubject` to start receiving and logging those drawdown records. To stop the service, simply unsubscribe, which cleanly disconnects it from the subject. It's designed to prevent accidental double-subscriptions, so it’s efficient and reliable.

## Class MaxDrawdownMarkdownService

This service is designed to collect and present information about maximum drawdowns, a key risk metric in trading. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown events, and unsubscribe when you no longer need them.  The service provides methods to retrieve the raw data, generate a formatted markdown report, and save that report to a file.

To clear the collected data, you can either clear everything at once or selectively remove data associated with a specific symbol, strategy, exchange, and timeframe combination. This is useful for resetting the service or focusing on particular trading scenarios.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps manage how trading reports are saved, offering flexibility in where and how they're stored. It uses a pattern that allows you to easily swap out different storage methods, like writing each report to its own file, combining them into a single JSONL file, or even disabling report generation entirely.  The system remembers which storage method is active, so you don’t have to reconfigure it.

You can change the default way reports are saved, or choose to store them as individual files, in a single log file, or not at all. The adapter intelligently creates the necessary storage when you first write a report.

If you need to change your working directory during testing, it’s a good idea to clear the adapter's memory to ensure fresh storage is created using the new path. 


## Class MarkdownUtils

MarkdownUtils helps you control how different parts of the trading framework generate markdown reports. It lets you turn on and off report generation for things like backtests, live trading, and performance analysis.

You can selectively enable or disable reports for specific areas. When you enable reports, the system starts gathering data and producing reports, and it’s *really* important to remember to turn off those reports when you're done to avoid problems.

The `clear` function is useful if you want to reset the data used for a report without stopping the report generation itself. This allows you to start a new report from scratch without disabling the underlying functionality.

## Class MarkdownFolderBase

This adapter lets you generate each report as its own individual markdown file, which is great for keeping your reports organized and easy to browse. It automatically creates the necessary directories to hold these files. 

Think of it as the standard way to create reports when you want a clean, human-readable directory structure.

The adapter doesn't require any special setup or initial steps—it just writes the content directly to the specified file.  You control where these files go using the `options.path` and `options.file` settings. 

Essentially, it's designed for straightforward report generation and manual review.


## Class MarkdownFileBase

This framework component provides a way to generate markdown reports in a structured, append-only JSONL file. It’s designed to help you centralize and easily process your trading backtest reports using standard JSONL tools.

Each report type (like trade details or account history) gets its own file, neatly organized within a directory. The system handles creating this directory for you and ensures that writing to the file is reliable, even if it takes a while.

You don’t have to worry about constantly checking if the file can accept more data; it handles that automatically with backpressure. There’s also a safety net to prevent operations from hanging indefinitely.

The reports are structured with useful metadata like the trading symbol, strategy name, exchange, frame, and signal ID, so you can easily filter and search through them later.

Initializing the adapter is straightforward and safe to do multiple times, and the `dump` method is how you add your markdown content to the JSONL file, along with that valuable metadata.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility and efficiency. It lets you easily switch between different storage methods without changing your core code. 

You can choose to store each markdown file as a separate `.md` file using the standard folder-based approach, or combine them into a single `.jsonl` file. 

For testing or quick experiments, a dummy adapter is available that simply ignores any data you try to write. The adapter remembers which storage method you’ve chosen, so you don’t have to keep specifying it. It also creates storage instances only when they're needed for the first time, saving resources.

## Class LookupUtils

The LookupUtils class acts like a central record keeper for ongoing backtests and live trading sessions. It keeps track of each activity, like a backtest run or a live trade execution, adding a note when it starts and removing it when it finishes.

This system helps manage resources, particularly when dealing with parallel processing. It makes sure that the system doesn't waste effort by checking if yielding to another process is even necessary.

You don’t create instances of this class directly – it’s provided as a singleton called `Lookup`.

Here's what it offers:

*   It maintains a map of active activities.
*   You can add an activity to the map using `addActivity`. If you try to add the same activity again, it simply updates the existing entry.
*   When an activity is complete, `removeActivity` cleans up its record. It's important to use this, even if errors occur, to avoid lingering entries.
*   `listActivity` gives you a snapshot of all the activities currently in progress.

## Class LoggerService

The LoggerService helps you keep your trading logs organized and informative. It's designed to add extra details to your log messages automatically, so you don't have to remember to include things like the trading strategy being used, the exchange, or the execution context.

You can plug in your own custom logger if you want, or the system will fall back to a basic "no-op" logger if you don't set one.

The service provides methods for different logging levels - general messages, debug information, warnings, etc. - all of which include that automatic context. It relies on two services to manage the context information it appends: methodContextService and executionContextService. You can also change the default logger using the `setLogger` function.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage your trading strategy's logging. Think of it as a central hub for how your logs are stored and displayed – you can easily change where they go without altering the rest of your code. It starts with an in-memory log, which is fine for quick testing, but you can swap it out to save logs to a file for later analysis or even disable logging entirely for performance.

You can choose how to store your logs by using functions like `usePersist` for disk storage, `useMemory` for the default in-memory option, or `useDummy` to essentially turn logging off.  `useJsonl` lets you write logs in a standard JSONL format to a file.

The `clear()` function is useful when your working directory changes between tests, ensuring the log adapter re-initializes with the updated directory.  The `log`, `debug`, `info`, `warn` methods let you record different types of events within your trading strategy.  You can even define your own custom log adapter if you need something specialized.

## Class LiveUtils

LiveUtils provides tools to manage live trading operations, simplifying the process and adding resilience. It’s designed to run continuously, recovering from crashes and providing real-time data.

You can start live trading for a specific symbol and strategy using the `run` function, which creates an ongoing stream of results. Alternatively, `background` lets you run trading without directly receiving those results, ideal for tasks like persistence.

To get the current pending or scheduled signal for a trade, use `getPendingSignal` or `getScheduledSignal`.  You can also check if signals exist with `hasNoPendingSignal` and `hasNoScheduledSignal`.

Several functions provide insights into the current position, such as `getTotalPercentClosed`, `getTotalCostClosed`, and `getPositionInvestedCost`.  You can also get the effective entry price (`getPositionEffectivePrice`), and duration estimates (`getPositionEstimateMinutes`, `getPositionCountdownMinutes`).

There are also methods for price-related checks like `getBreakeven`, and calculating Position performance metrics like `getPositionPnlCost`, `getPositionDrawdownMinutes`.

LiveUtils also includes functions for managing the trading process: `stop` to pause trading, `commitCancelScheduled` and `commitClosePending` to manually handle signals, and `commitAverageBuy` to manage DCA entries. Data reporting and diagnostic options are provided through methods like `getReport` and `dump`. The `list` function provides a summary of all active trading instances.

## Class LiveReportService

This service helps you keep a record of what's happening with your live trading strategy. It listens for events related to your signals – when they're inactive, when trades are opened, when they're active, and when they're closed. 

All of these events, along with detailed information about them, are logged and saved to a database. This allows you to monitor your live trading in real-time and analyze its performance.

You can think of it as a constantly running observer that captures every important signal event and saves it for later review. The `subscribe` method allows you to start this recording process and provides a way to stop it with `unsubscribe`. The service uses a mechanism to prevent accidental duplicate subscriptions, ensuring accuracy.

## Class LiveMarkdownService

This service helps you automatically generate and save reports about your live trading activity. It constantly monitors what's happening in your strategies, recording details about events like when a strategy is idle, when a trade is opened or closed, and even the performance of each strategy. 

The service creates easy-to-read markdown tables that summarize these events, also calculating key trading statistics like win rate and average profit/loss. These reports are automatically saved as files, making it simple to track your progress and analyze your strategies.

You can subscribe to receive these live updates, and later unsubscribe when you no longer need them. There are also functions to get specific data, generate reports for particular strategies or clear all accumulated data. The reports are organized by symbol, strategy name, exchange, frame, and whether it's a backtest or live trade, ensuring everything is neatly categorized.

## Class LiveLogicPublicService

LiveLogicPublicService helps manage live trading by automatically handling things like knowing which strategy and exchange are being used. It simplifies things so you don’t have to constantly pass those details around.

This service continuously runs and provides a stream of trading results—signals to open or close positions, or notifications of cancelled orders—that essentially never stops.

If something goes wrong and the process crashes, the system can recover the previous state and continue where it left off.

**Key parts:**

*   It uses a logger for tracking activity and an exchange connection service to talk to the exchange.
*   The `run` method is the main way to start the live trading process, specifying the trading symbol and context.
*   It’s designed for continuous operation and includes crash recovery features.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, working as the central coordinator. It continuously monitors the market, checking for new trading signals. 

The core functionality involves an unending loop, regularly creating a timestamp to ensure accurate data.  It then evaluates the current signals and, crucially, only sends back the results when a trade is actually opened or closed – avoiding unnecessary updates.

To optimize performance, it uses an asynchronous generator to stream results efficiently, meaning it doesn't hold a large volume of data in memory. If the trading process encounters a crash, it automatically recovers and picks up where it left off. This service provides a real-time view of trading activity for a specific symbol and runs indefinitely.

## Class LiveCommandService

The LiveCommandService acts as a central point for interacting with the live trading components of the backtest-kit framework. It's designed to be easily integrated into your application through dependency injection. 

Essentially, it provides a straightforward way to access and utilize the live trading functionality.

Here's a breakdown of its key parts:

*   It relies on several internal services – a logger, a public live logic service, and services for validating strategies, exchanges, schemas, risks, and actions.
*   The `validate` function helps ensure your strategies and risk configurations are correct, and it remembers previous validations to speed things up.
*   The `run` function is the heart of live trading – it starts and manages the live trading process for a specific symbol. This function will continually generate trading results and automatically attempt to recover from any crashes to keep your trading running smoothly.

## Class IntervalUtils

IntervalUtils helps you control when functions are executed, ensuring they only run once within a specific time interval. It provides two ways to manage this: one keeps track of the firing in memory, while the other uses files to remember the state, allowing it to persist even if the application restarts.

The `fn` method wraps your function to make sure it doesn't run more than once per interval. If your function returns `null`, it'll wait and try again later. It smartly creates a separate tracking instance for each unique function you wrap.

Similarly, the `file` method does the same but uses file storage. This means the "fired" state of your function is saved, so it won't re-run unnecessarily after a restart. Like `fn`, it creates a unique persistent instance per function.

You can clean up old tracking instances with `dispose` and `clear`. `dispose` lets you remove a specific function's tracking, forcing it to create a new instance on the next call. `clear` wipes out all tracking, which is helpful when the working directory changes during strategy runs. Lastly, `resetCounter` resets the file-based instance numbering to avoid conflicts when the base path updates.


## Class HighestProfitUtils

This class helps you analyze and report on the highest profits achieved during trading simulations or live trading. It acts as a central place to gather information about the most profitable trades.

You can think of it as a tool to create reports and summaries of your best-performing strategies.

It provides a few key functions:

*   `getData` lets you pull specific statistical information about the highest profits recorded for a particular trading symbol and strategy.
*   `getReport` allows you to create a formatted markdown report detailing all the highest profit events for a given symbol and strategy.
*   `dump` takes that report and saves it directly to a file, so you can easily share or archive it.

These functions work with data collected from “highestProfitSubject” events, offering insights into your most successful trading scenarios.

## Class HighestProfitReportService

This service is responsible for tracking and recording your most profitable trading moments. It keeps an eye on a stream of data called `highestProfitSubject` and whenever a new high-profit record is achieved, it writes that information to a database for later analysis.

The service uses a `loggerService` and `tick` to manage the data and interaction.

Each recorded event includes details like the timestamp, the symbol traded, the strategy used, the exchange, the timeframe, and information related to the signal that generated the profit - including price levels, position size, and stop-loss/take-profit orders.

To start saving this data, you need to "subscribe" to the `highestProfitSubject`.  Because you only want to subscribe once, it uses a system to prevent multiple subscriptions; subsequent calls to `subscribe` will return the same function to stop the process.

You can stop the recording process by calling `unsubscribe`, which disconnects the service from the `highestProfitSubject`.

## Class HighestProfitMarkdownService

This service is designed to gather and present data about the highest profit achieved during trading, creating easily readable reports. It listens for incoming data about profitable trades, organizing them based on the symbol, strategy, exchange, and time frame. 

You can subscribe to receive these updates, although it will only subscribe once to prevent duplicate subscriptions. Unsubscribing completely clears all accumulated data and stops the service from receiving any further updates.

The `tick` method processes individual trade events, directing them to the appropriate storage location.  The `getData` method allows you to retrieve statistics for a specific trading context, showing a summary of the recorded events. `getReport` generates a formatted markdown report showing the most recent profitable trades.  The `dump` method creates these reports and saves them as markdown files with a specific naming convention, indicating whether it's a backtest or live trading scenario. 

Finally, `clear` allows you to reset the data, either for a specific combination of symbol, strategy, exchange and frame, or for all recorded data. This is useful for starting fresh or removing existing records.

## Class HeatUtils

HeatUtils offers helpful tools for creating and managing portfolio heatmaps, making it easier to understand your trading strategy's performance. It essentially gathers and summarizes key statistics for each symbol used by a specific strategy.

You can request the raw data for a strategy's portfolio heatmap, including metrics like total profit, Sharpe ratio, and drawdown.  Alternatively, it can generate a nicely formatted markdown report – a table that displays these same statistics for each symbol, sorted by profitability.

Finally, this data can be easily saved to a file, creating a report you can share or review later, with the file name automatically created based on the strategy’s name. It acts as a single point of access, handling the underlying data gathering and formatting for you.


## Class HeatReportService

HeatReportService helps you track and analyze your trading activity by recording when signals close and how much profit or loss resulted. It listens for these closing events and saves them in a database, allowing you to create heatmaps to visualize your portfolio's performance.

It's designed to be easy to use - it automatically subscribes to signal events and only logs information about closed signals, so you don't have to worry about filtering. 

You can subscribe to the service to start receiving these events, and an unsubscribe function is provided to stop the process when it’s no longer needed. Importantly, it prevents accidentally subscribing multiple times, which could lead to duplicated data.

## Class HeatMarkdownService

This service builds and presents a heatmap of your trading activity, providing a clear visual summary of how your strategies are performing. It listens for signals about trades – specifically when they're closed – and gathers data on a per-symbol and portfolio level.

Think of it as a dashboard that lets you quickly see which strategies and symbols are doing well and which need attention.

You can subscribe to receive these signals, and the service automatically handles the storage and aggregation of data. It keeps things organized by exchange, timeframe, and whether you're in backtest or live mode.

The service offers several ways to interact with the data:

*   **Get Data:** Retrieve the aggregated statistics for a specific exchange, timeframe, and backtest mode.
*   **Generate Reports:** Create a formatted markdown report for a strategy, exchange, timeframe, and backtest mode, presenting the data in a table.
*   **Dump to File:**  Save the heatmap report directly to a file on your system.
*   **Clear Data:**  Reset the data for a specific exchange/timeframe/mode, or clear everything entirely, giving you a fresh start.

The system is designed to handle mathematical calculations carefully, avoiding errors that could arise from unusual data (like infinity or "not a number"). It also remembers which storage buckets it’s using, improving performance and preventing unnecessary data duplication.  Unsubscribing from the signal emitter cleans up the resources.

## Class FrameValidationService

The FrameValidationService helps you keep track of and verify your trading timeframe configurations. Think of it as a central control panel for your frames. 

It allows you to register new timeframes using `addFrame`, ensuring they're properly defined. 

Before you start using a timeframe, the `validate` function checks if it’s registered, preventing errors. 

For efficiency, it remembers the results of validations so it doesn't have to repeat checks.

If you need to see all the timeframes you've set up, the `list` function provides a convenient way to view them. It’s like getting a complete inventory of your configured timeframes.


## Class FrameSchemaService

The FrameSchemaService helps keep track of all your frame schemas in a structured and reliable way. Think of it like a central directory for these schema definitions.

It uses a special system to store these schemas safely and with type checking. 

You add new schemas using the `register` method and find them later using the `get` method – simply provide the name you assigned when you registered it.

If you need to update an existing schema, you can use `override` to provide only the changes you want to make, rather than replacing the whole thing.

Before adding a schema, the system checks it over using `validateShallow` to make sure it has all the necessary parts and they are of the expected types – ensuring consistency.

## Class FrameCoreService

FrameCoreService manages how your trading data is organized into timeframes. Think of it as a central coordinator that fetches and prepares the data your backtesting engine needs. It relies on other services to handle connections and data validation, ensuring that the timeframes used for your tests are accurate and consistent. The core function is `getTimeframe`, which allows you to request a specific timeframe (like daily or weekly data) for a given asset, providing a date array to use in your backtesting loop. It's a foundational piece that keeps everything synchronized and ready for analysis.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames. It automatically directs requests to the correct frame implementation based on the current context. 

To improve efficiency, it caches frequently used frame instances, so they don't need to be recreated repeatedly. 

This service also handles backtesting timeframes, allowing you to define a specific start and end date for your analysis. 

When in live mode, no frame is active, indicated by an empty frame name.

The service relies on other services like the logger service, frame schema service, and method context service to function correctly.

You can use the `getFrame` method to obtain a frame instance, and `getTimeframe` to retrieve the timeframe boundaries for a specific symbol.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your configured exchanges and make sure they're actually valid before you try to use them. It essentially acts as a central registry for your exchanges, storing details about each one.

You can use it to register new exchanges using `addExchange`, allowing the service to manage them. 

The `validate` function checks if an exchange actually exists, preventing potential errors later on. This helps ensure stability.

The service also remembers previous validation results to speed things up—this is known as memoization.

Finally, `list` allows you to see all the exchanges currently registered with the service.

## Class ExchangeUtils

ExchangeUtils offers helpful tools for interacting with different cryptocurrency exchanges. It's designed as a single, readily available resource to simplify common tasks.

It provides a way to retrieve historical candle data, automatically figuring out the correct date range based on the desired interval and the number of candles you need. You can also use it to calculate the VWAP (volume-weighted average price) from recent trade data.

Need the latest closing price for a specific trading pair? ExchangeUtils provides a simple function for that.

It also handles the complexities of formatting trade quantities and prices to match the rules of each exchange.

Want to see the order book?  ExchangeUtils can get that for you.  It also lets you retrieve aggregated trade data, allowing you to analyze trading activity. Finally, it can pull raw candle data with custom start and end dates for maximum flexibility.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, ensuring everything is structured correctly. It uses a special storage system to manage these exchange details in a type-safe way.

You can add new exchanges using the `addExchange` function, and retrieve them later by their name using the `get` function. 

Before adding an exchange, the `validateShallow` function checks to make sure it has all the necessary information in the expected format. 

If you need to update an existing exchange, the `override` function lets you make partial changes. 

The service relies on logging to track its activity and uses a registry to store the exchange schemas.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for handling interactions with an exchange, providing a consistent way to access data and execute operations. It seamlessly combines connection management with contextual information like the trading symbol, timestamp, and whether the operation is part of a backtest. This service is crucial for both backtesting historical strategies and executing live trades.

It offers methods for retrieving various types of data, including historical and future candles (for backtesting), VWAP (volume-weighted average price), order book information, and aggregated trade data. All these methods incorporate execution context, ensuring that data is retrieved with the correct parameters.

The service includes validation capabilities to make sure exchange configurations are sound, and it formats prices and quantities appropriately for display or further processing. It uses memoization for validation, improving efficiency by avoiding repeated checks on the same exchanges. Ultimately, ExchangeCoreService abstracts the complexities of exchange interactions, simplifying data retrieval and trade execution within the trading framework.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes requests for data, like candles or order book information, to the correct exchange implementation based on the currently selected exchange. To improve performance, it caches these exchange connections, so it doesn't need to re-establish them repeatedly.

This service provides a unified way to retrieve various data points: historical candles, the next batch of candles based on the current timestamp, the average price (calculated differently for backtesting and live trading), the closing price of a recent candle, formatted prices and quantities (ensuring they adhere to exchange-specific rules), order book data, and aggregated trade data. It also handles retrieving raw candles, allowing for custom date ranges and limits. The `ExchangeConnectionService` relies on other services like logging, execution context, and exchange schema to function properly.

## Class DumpAdapter

The DumpAdapter helps you save information about your trading tests in various formats. Think of it as a middleman that takes data and puts it where you need it, whether that's a Markdown file, in memory, or nowhere at all (for testing purposes).

It manages how data is stored based on which "backend" you choose. By default, it creates a Markdown file for each dump, organized by signal ID, bucket name, and dump ID.

You can easily change how data is saved. For example, you can switch to using memory for faster access or a dummy backend to completely ignore the data during development.

Before you start dumping data, you need to activate the adapter, and you can deactivate it later.  The adapter keeps track of instances and clears them when signals are cancelled to avoid accumulating stale data.

You can use it to save everything from full message histories and simple records to tables, raw text, JSON objects, and even errors. 

If you need even more control, you can inject your own custom data-saving implementation.  There's also a `clear` function to refresh the adapter’s internal caches when things like the working directory change.

## Class CronUtils

Okay, here's a breakdown of the `CronUtils` class in backtest-kit, explained in plain language.

It's a tool for scheduling tasks to run at specific times during backtesting, especially useful when you need to coordinate actions across multiple simultaneous backtest runs. Think of it as a way to trigger something reliably when a certain time interval passes, even if you’re running many backtests at once.

The key is that it prevents multiple backtests from trying to run the same task at exactly the same time.  It ensures that only one handler runs for a given time slot, even when many backtests hit that same time.

Here's a look at the important parts:

*   **Registration:** You "register" your tasks (called "entries") with this class. Each task specifies the interval at which it should run.
*   **Coordination:** When the scheduled time arrives, the class ensures that only one instance of the task runs, even if several backtests hit that time simultaneously. This prevents conflicts and ensures correct behavior.
*   **Persistence:** It handles situations where backtests might skip time intervals – it will catch up and run the task when the next interval arrives.
*   **Memory Management:** The class has internal mechanisms to clean up old task configurations, preventing memory leaks and ensuring that tasks are re-armed correctly.
*   **Lifecycle Integration:** It can automatically subscribe to engine events so that tasks run without needing manual configuration.
*   **Resetting:** You can clear all scheduled tasks and reset the system to a clean state.

Essentially, it's a reliable, synchronized scheduler specifically designed for backtesting environments.

## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages used for setting take-profit and stop-loss levels, designed around the Kelly Criterion and exponential risk decay. These constants help manage risk and capture profits progressively as a trade moves towards its ultimate target. 

Think of these values as checkpoints along your profit or loss journey.

For example, TP_LEVEL1 at 30% means a partial profit is taken when the price reaches that point, while SL_LEVEL1 at 40% serves as an early warning to adjust your exposure.  Each level offers a chance to lock in some gains or reduce potential losses before the trade reaches its full target. It's a system designed to balance letting profits run with protecting your capital.

## Class ConfigValidationService

The ConfigValidationService is designed to double-check your trading setup to make sure it's mathematically sound and capable of making a profit. It meticulously examines your global configuration parameters, like slippage, fees, and profit margins, ensuring they’re set up correctly.

Specifically, it makes sure your take-profit distance is large enough to cover all potential trading costs – slippage and fees – so you actually make money when a trade hits that target. It also verifies that relationships between parameters, like minimum and maximum values, are logically consistent. 

Finally, the service verifies that time-related settings and candle parameters have sensible values, such as positive integers for timeouts and appropriate thresholds for candle data requests. It’s like having a built-in safety net to catch potential errors in your configuration.


## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It checks your column definitions to make sure they meet the requirements for the ColumnModel interface.

It verifies several things, including:

*   Each column has all the necessary information: a key, a label, a format, and a visibility setting.
*   The key and label properties are actual text strings and aren't empty.
*   The format and visibility settings are functions that can be executed.
*   Each key is unique within the column set, avoiding conflicts.

The `validate` method runs these checks against your column configurations and highlights any problems it finds.

## Class ClientSizing

This component helps you determine how much of an asset to trade based on various strategies. Think of it as a tool for calculating your position sizes.

It offers different methods for calculating sizes, such as a fixed percentage, Kelly Criterion, or using Average True Range (ATR). You can also set limits on the minimum or maximum position size and restrict the percentage of your capital that’s used for any single trade.

The system is flexible; it allows you to add custom logic through callbacks for validation or to keep a record of sizing decisions. Ultimately, this component feeds sizing information to the strategy execution process, so your trades are sized appropriately.

The `calculate` method is the core function, taking parameters and returning the calculated position size, which is a promise.

## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, acting like a safety net to prevent unintended consequences. It's designed to make sure your strategies don't exceed pre-defined limits, such as the maximum number of simultaneous trades. Think of it as a central control point that all your strategies check in with before placing orders.

This system isn’t isolated; multiple strategies can share the same ClientRisk instance, allowing for a holistic view of risk across your entire portfolio.  It’s used internally by the trading execution process to validate signals before a trade is actually made.

The ClientRisk is configured with specific parameters that define those risk limits. It keeps track of active positions, combining data from all strategies to get a complete picture.  It also offers the ability to create custom validation rules, giving you fine-grained control over risk management.

To prevent race conditions and errors, there's a special "reservation" process.  `checkSignalAndReserve` ensures that a trade is only confirmed if a spot is available, preventing scenarios where multiple strategies simultaneously attempt to open positions beyond the allowed limits. It's crucial to either complete the trade (with `addSignal`) or cancel the signal (with `removeSignal`) after this check.

Finally, when a trade *does* happen, `addSignal` registers the new position, while `removeSignal` cleans up when a trade closes.

## Class ClientFrame

The `ClientFrame` is the engine that creates the timelines for your backtesting. It generates arrays of timestamps, essentially defining the sequence of moments your trading strategies will be tested against. To prevent unnecessary work, it remembers previously calculated timelines and reuses them. 

You can adjust how far apart these timestamps are, from as frequent as one minute to as broad as one day. 

The `ClientFrame` also lets you hook into the process, allowing you to verify the generated timelines or record information about them.  It's a core component, used internally by the system to step through historical data.

The `getTimeframe` property is your main way to get these timelines; it takes a symbol (like a stock ticker) and returns a promise that resolves to the array of dates and times.  The singleshot caching ensures it only calculates the timeframe once.


## Class ClientExchange

The `ClientExchange` class is your go-to for getting data from an exchange, designed to be efficient and reliable within the backtest-kit framework. It provides ways to retrieve historical and future candle data, calculate VWAP (volume-weighted average price), and format price/quantity information according to exchange-specific rules. 

You can easily grab past candles using `getCandles`, or look ahead to get future candles with `getNextCandles` – essential for backtesting strategies. `getAveragePrice` calculates the VWAP based on recent, short-term candles. 

Need the latest closing price? `getClosePrice` delivers that. `formatQuantity` and `formatPrice` ensure the data is presented in the right way for the exchange. 

The `getRawCandles` method is very flexible, letting you pull candles from specific start and end dates or using the current time as a reference. It strictly avoids look-ahead bias. Finally, `getOrderBook` retrieves the current order book, and `getAggregatedTrades` gives you historical trade data.

## Class ClientAction

The `ClientAction` class is a central piece for integrating custom logic into your trading strategy. It handles the communication and lifecycle of your action handlers, which can manage things like logging, notifications, analytics, and managing external state (like Redux).

Essentially, it provides a structured way for your code to react to various trading events, such as signals, breakeven adjustments, profit/loss milestones, and scheduled tasks.

**Here's a breakdown of what it does:**

*   **Initialization:** It creates and manages an instance of your action handler, ensuring it's set up properly and only initialized once.
*   **Event Routing:** It listens for different types of events (live trading, backtesting, etc.) and dispatches them to the appropriate methods within your action handler. These events include signal generation, partial profit/loss triggers, and scheduled checks.
*   **Lifecycle Management:** It provides a way to safely clean up resources and subscriptions when the action handler is no longer needed.
*   **Customization:** You can define custom logic through event handling, allowing you to tailor the behavior of your strategy and integrate with external systems.

The `signalLive`, `signalBacktest`, and related methods offer targeted event handling, while `scheduleEvent` and `pendingEvent` handle manual event wiring and advanced lifecycle management. Methods like `signalSync` and `orderCheck` are critical gateways for specific order execution flows.

## Class CacheUtils

CacheUtils is a helper class designed to make caching function results simpler, especially when dealing with trading strategies that need to repeat calculations within specific timeframes. It acts as a central point for managing these caches, making sure they are invalidated when necessary.

The `fn` method lets you wrap regular functions, automatically storing their results based on a timeframe you define. Think of it as a way to avoid recomputing the same data repeatedly during a backtest.

For asynchronous functions, the `file` method provides persistent caching, storing the results in files. This is excellent for caching heavy calculations and reusing them across different backtest runs. The file names include the function name, interval, and a unique index, helping to keep things organized.

If you need to explicitly clean up a function's cache, the `dispose` method lets you do just that, forcing a fresh calculation next time the function is called.

The `clear` and `resetCounter` methods are helpful for situations where your base directory changes between strategy iterations, ensuring that your caches are rebuilt from scratch. This prevents issues from cached data in unexpected locations.

## Class BrokerBase

The `BrokerBase` class is designed to help you create custom adapters that connect your trading strategies to different exchanges. Think of it as a foundation for connecting your code to real-world trading platforms. It handles many of the common tasks like placing orders, managing stop-loss and take-profit levels, and keeping track of your positions.

You don’t need to implement everything yourself – the class has built-in defaults for most functions, so you only need to override the ones you want to customize.  It also automatically logs important events to help with debugging and monitoring.

The process of using this class involves a few key steps: first, you initialize the connection to the exchange in the `waitForInit()` method. Then, as your strategy runs, various “commit” methods are called for events like opening positions (`onSignalOpenCommit`), closing positions (`onSignalCloseCommit`), and adjusting stop-loss levels.  These methods provide points where you can interact with the exchange and record the transactions.  Specifically, `onSignalActivePing` allows you to mirror data from the exchange into your own systems and `onOrderCheck` enables you to proactively manage orders. The whole system is designed to be as safe as possible with exception-based gate mechanisms that prevent unexpected errors from disrupting your trades.


## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker. It ensures that actions like opening or closing positions are handled correctly and provides a controlled way to interact with the broker, especially crucial for things like partial profits or trailing stops.

Essentially, it’s a safety net. If anything goes wrong during these actions, it prevents unwanted changes to your trading data, keeping your state consistent.

During backtesting, these interactions are skipped to speed up the process, focusing solely on the simulated results.

Here’s a breakdown of its key features:

*   **Broker Integration:** It connects your trading system to a real broker.
*   **Controlled Actions:** All trading commands (like opening, closing, adjusting stops) go through it, allowing for checks and safeguards before they reach the broker.
*   **Transaction Safety:** If any of these commands fail, it prevents any changes to the system's internal state.
*   **Backtesting Mode:** During backtests, it acts as a silent observer to speed up the process.
*   **Automatic Events:** Handles certain events like signal openings and closings automatically.
*   **Commit Methods:** It exposes various “commit” methods (like `commitSignalOpen`, `commitPartialProfit`) that are used to trigger broker actions.
*   **Configuration:** You register your broker adapter using `useBrokerAdapter` before enabling the connection.
*   **Enabling/Disabling:** You turn the broker interaction on or off using `enable` and `disable`.  `enable` sets up the automatic event handling.
*   **Clearing:** The `clear` method resets the cached broker connection, useful when your trading environment changes.

## Class BreakevenUtils

This class provides tools to analyze and report on breakeven events, helping you understand your trading strategies’ performance. It gathers data about when breakeven points are hit, including details like the symbol traded, the strategy used, the entry price, and the current price.

You can retrieve statistical summaries of these events, giving you an overview of how often breakevens are being triggered. It can also generate detailed markdown reports presenting each breakeven event in a tabular format. These reports include all relevant information and a summary of the statistics.

Finally, you can easily save these reports to files, named in a consistent way (like "BTCUSDT_my-strategy.md"), for later review and analysis, even creating the necessary folders to store them. The class manages the underlying data storage and formatting, letting you focus on interpreting the results.

## Class BreakevenReportService

The BreakevenReportService is designed to keep track of when your trading signals reach their breakeven point. It’s like a dedicated record-keeper for these significant moments in your backtesting process.

It listens for these "breakeven" events and stores them, along with all the details about the signal that triggered them, in a database. This allows you to analyze how often signals achieve breakeven and understand their performance.

To use it, you’ll subscribe to the breakeven signal emitter, and it will automatically log the events as they happen.  Make sure to unsubscribe when you're finished to stop the logging, and you don’t have to worry about accidentally subscribing multiple times – it handles that for you. The service uses a logger to provide helpful debugging information as well.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you track and report on breakeven events in your trading system. It automatically gathers data about when strategies hit breakeven points, organizing it by symbol and strategy.

The service compiles these events into nicely formatted markdown reports, providing both detailed information and overall statistics like the total number of breakeven events. These reports are saved to disk, making it easy to analyze your trading performance.

You can subscribe to receive breakeven events in real time, and the service handles the subscription process to prevent accidental duplicates.  The `tickBreakeven` method is where the processing of each event happens.

It provides methods for getting statistics, generating reports, and saving those reports to your file system.  You can also clear the accumulated data if you need to start fresh or remove specific data related to a certain symbol, strategy, exchange, frame, and backtest.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for tracking breakeven points within the trading system. It's designed to be easily integrated, receiving necessary services through dependency injection. Think of it as a gatekeeper that logs all breakeven-related actions before passing them on to the actual connection service for handling.

It simplifies how different parts of the system interact with breakeven functionality by providing a single injection point for strategies. 

The service includes various validation tools to ensure strategies, risks, exchanges, frames, and actions are all set up correctly.  It even remembers previous validation checks to avoid unnecessary repetition.

The core functions allow you to check if a breakeven trigger should happen and to clear the breakeven state when a signal closes. These functions always log the activity before directing the actual work to the connection service.

## Class BreakevenConnectionService

The BreakevenConnectionService helps keep track of breakeven points for your trading signals. It's designed to manage and create these tracking objects efficiently, avoiding unnecessary duplication.

Essentially, it creates a dedicated tracking instance for each unique signal you're monitoring, remembering these instances to avoid recreating them.

The service allows you to easily check if a breakeven condition has been met and clear the tracking data when a signal closes, while ensuring everything is properly cleaned up and avoids memory issues. It works closely with other services like the action core and time management components within your trading system.


## Class BacktestUtils

This class provides tools to simplify backtesting in your trading framework. Think of it as a helper for running simulations and getting insights into your strategies.

It offers shortcuts for running backtests, both synchronously and in the background, and gives you ways to retrieve specific information about a position's performance, like pending signals, total costs, and potential profits.  You can also retrieve data like breakeven points and the average entry price.

Key features include:

*   **Easy backtest execution:** Simplifies starting and running backtests with logging.
*   **Background execution:** Runs backtests without interrupting your main process.
*   **Position details:** Access information like pending signals, cost basis, and potential P&L, which help you understand how a strategy is performing.
*   **Signal management:**  Functions to cancel or activate scheduled signals.
*   **Reporting:** Generate reports and save them to disk to analyze results.
*   **Commit functions:** Allow you to programmatically influence the backtest process, adding signals, or adjusting stop losses.



Essentially, this class is your go-to resource for efficiently running and analyzing backtests within the trading framework.

## Class BacktestReportService

The BacktestReportService is designed to keep a detailed record of what's happening during your backtests. It essentially acts as a reporter, meticulously tracking the lifecycle of each trading signal – from when it’s initially idle to when it's opened, active, and finally closed.

This service connects to a central signal emitter to receive updates on these signal events. Every tick, including all its relevant details, is logged and saved to a SQLite database, providing you with a wealth of information for later analysis and debugging.

You can think of it as an observer pattern with logging capabilities. The `subscribe` function lets the service listen for signal events, but it makes sure only one listener is active at a time. When you want the service to stop listening, use `unsubscribe` to gracefully disconnect and prevent any further logging. The `tick` property handles the processing and logging of the events themselves, while `loggerService` handles debugging.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It automatically keeps track of closed trades for each strategy you're testing.

As your strategies run, this service listens for tick events and records information about each closed signal. It organizes this data into separate storage areas for each symbol, strategy, exchange, frame, and backtest run, keeping everything nicely isolated.

You can then request these reports, which are generated as markdown tables filled with details about your signals. These reports are saved as files to your logs/backtest directory.

The service also allows you to clear out all the accumulated data or just data for a specific combination of symbol, strategy, and settings, allowing you to refresh your results. Finally, you can subscribe to receive these tick events or unsubscribe when you no longer need them.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests in a straightforward way, handling a lot of the behind-the-scenes setup for you. It essentially simplifies the process by automatically managing important information like the strategy name, exchange, and frame used during the backtest.

Think of it as a wrapper around a more complex internal service. This wrapper takes care of making sure your trading strategy has the right context without you needing to constantly pass it around in every function call.

Here’s what you can do with it:

*   **Initialization:** It’s created without any specific arguments.
*   **Logging:** It includes tools for logging and managing the execution context.
*   **Core Functionality: `run()`** This method is the heart of the backtest. You give it a symbol (the asset you're trading) and it streams the results of the backtest, one step at a time. It takes care of injecting the necessary context into the strategy functions automatically, so you don't have to worry about it.
*   **Dependencies:** It relies on other services like `TimeMetaService`, `FrameSchemaService`, and `ExchangeConnectionService` to manage time, data structure, and exchange connections.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process, working asynchronously to handle large datasets efficiently. It first retrieves the necessary timeframes and then processes each timeframe one by one. When a trading signal is generated, it fetches the required historical data and executes the backtest logic.

The service then intelligently skips ahead to the timeframe when the signal closes, minimizing unnecessary computations. Importantly, the backtest results are streamed directly as they become available, rather than being stored in a large array, which helps conserve memory.  You can also halt the backtest prematurely by stopping the generator.

The service relies on several core services like the StrategyCoreService, ExchangeCoreService, FrameCoreService, and others to handle specific tasks related to strategy execution, data retrieval, and time management. To operate it needs a symbol to backtest.


## Class BacktestCommandService

This service acts as a central hub for performing backtests within the framework. It provides a straightforward way to access and utilize backtesting capabilities, primarily designed to be used when setting up dependencies within your application.

It bundles together several other services responsible for tasks like logging, validating strategy configurations, and ensuring risks are appropriately managed. 

You can use the `validate` function to confirm your strategy setup and risk parameters are correct – it remembers previous validations to speed things up.

The core function is `run`, which executes the backtest process itself, providing a stream of results representing how the strategy performed with specific context details, like the strategy, exchange, and frame being used.

## Class ActionValidationService

The ActionValidationService helps you keep track of and double-check your action handlers – those pieces of code that actually do something when a trade happens. Think of it as a central place to register all your action handlers, making sure they're available before you try to use them. 

It efficiently manages a list of these handlers, and it's smart about remembering its validation results to avoid repetitive checks.

Here's what it can do:

*   **Register new handlers:**  You can add action schemas (definitions of your handlers) using `addAction`.
*   **Verify existence:**  `validate` confirms an action handler exists before you attempt to run it.
*   **View the registry:**  `list` lets you see all the action handlers you’ve registered.

The service also keeps a record of which handlers are available and performs validation, remembering the results to speed up future checks. It uses a `loggerService` for logging and internally uses a map called `_actionMap` for managing the registered action schemas.

## Class ActionSchemaService

The ActionSchemaService is like a central librarian for your trading actions, keeping track of all the rules and definitions. It ensures your actions are well-defined and work correctly.

It uses a special system to store action definitions in a way that prevents errors related to incorrect data types. 

The service also checks that your action handlers only use approved methods, helping to avoid unexpected behavior. It allows private methods to be used internally.

You can register new action schemas, making sure they are properly structured and validated.

It also allows you to update existing action schemas without having to create them from scratch again.

Finally, you can retrieve existing action schemas whenever you need them.

## Class ActionProxy

The `ActionProxy` acts like a safety net when using custom actions in your trading strategy. It's designed to prevent errors in your custom code from crashing the entire backtest or live trading system. Think of it as a wrapper that catches any mistakes your code might make, logs them, and allows the rest of the system to keep running.

It's built to handle a wide range of events – initialization, signal generation (in different modes like backtest or live), breakeven and profit/loss targets, scheduled events, and even when dealing with risk management. The system is designed so you don't have to worry about your custom actions breaking everything if something goes wrong.

You don’t create `ActionProxy` instances directly; instead, they are created using the `fromInstance` method. This method takes your custom action code and wraps it, ensuring that all the important methods are protected by error handling. If a method isn’t implemented in your custom code, the `ActionProxy` handles it gracefully by returning null, ensuring no unexpected behavior. Every time a signal is generated, the `ActionProxy` catches and logs any errors that might occur, and gracefully continues executing.

## Class ActionCoreService

The `ActionCoreService` is the central hub for managing actions within your trading strategies. It's responsible for coordinating the execution of actions defined within strategy schemas.

Essentially, it takes the list of actions specified in a strategy's configuration and makes sure they get executed at the right time, in the right order, and with the correct data.

Here's a breakdown of what it does:

*   **Action Management:** It retrieves and processes action lists defined within strategy schemas.
*   **Validation:**  It verifies the strategy’s configuration, including names, exchanges, frames, and any associated risks or actions.  It caches these validations to prevent unnecessary repeats.
*   **Event Dispatch:** It handles various events, like market signals, breakeven conditions, partial profit or loss adjustments, scheduled pings, and lifecycle events (opening/closing signals). Each event triggers the corresponding action handler on the registered actions.
*   **Lifecycle Management:** It offers functions to initialize, dispose of, and clear actions related to a strategy.
*   **Synchronization:**  Some events like `signalSync` and `orderCheck` require agreement from all actions before proceeding, crucial for coordinated trading.

Think of it as a traffic controller ensuring all actions related to a specific trading strategy are handled efficiently and consistently.

## Class ActionConnectionService

The ActionConnectionService is responsible for directing different types of events – like signals, breakeven notifications, or scheduled tasks – to the correct action handler within your trading strategies. It's designed to be efficient by remembering (memoizing) which action handlers are needed for specific strategies and frames, so it doesn't have to recreate them every time.

When an event comes in, the service looks up the corresponding action handler based on its name, the strategy it belongs to, the exchange it's operating on, and the current frame. If the handler hasn't been created yet, it creates it and loads any necessary persistent data. Subsequent events with the same parameters will quickly use the already created handler.

It offers various methods for handling different events, including signal updates, profit/loss adjustments, scheduled tasks, and lifecycle events. Each method takes an event, indicates whether the process is in backtest mode, and provides context about the specific action and strategy involved.  Finally, you can clear the remembered handlers if they are no longer needed, freeing up resources.

## Class ActionBase

This framework provides a base class, `ActionBase`, to help you create custom actions within your trading strategies. Think of it as a starting point for handling various events and triggering specific responses, whether you're backtesting or live trading.

It simplifies the process by providing default logging for all events, and automatically passing essential information like strategy and frame names. You can extend `ActionBase` to manage things like state updates, send notifications (like to Discord or email), track metrics, and integrate custom logic.

The lifecycle involves initialization (`init`), event handling (`signal`, `breakevenAvailable`, etc.), and cleanup (`dispose`).  Events like `signalLive` are for live trading only, while `signalBacktest` handles events specifically during backtesting.  You can customize how each of these events are processed to tailor your strategy’s behavior. The `dispose` function is important for releasing resources when your strategy is finished.

The framework handles the technical details of delivering events to your custom actions, allowing you to focus on the strategy's logic. It's designed to be extensible, meaning you can add your own functionality without having to implement the entire interface from scratch.

