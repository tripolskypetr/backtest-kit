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

The WalkerValidationService helps you keep track of and make sure your parameter sweep setups – we call them "walkers" – are working correctly. It's like a central place to register your walkers, define what they are, and check that they exist before you try to use them. 

This service remembers how often it validates walkers, so things run smoothly and quickly.

Here's what you can do with it:

*   **Register walkers:** Use `addWalker` to tell the service about your parameter sweep configurations.
*   **Verify walkers:**  `validate` makes sure a walker exists before you proceed, preventing errors.
*   **See your walkers:**  `list` provides a simple way to see all the walkers you've registered.

The service also uses a `loggerService` to keep track of what's happening and has an internal `_walkerMap` to organize everything.

## Class WalkerUtils

WalkerUtils provides helpful tools for working with walkers, which are essentially automated trading systems. It simplifies the process of running and managing these systems, making it easier to execute comparisons and analyze results.

Think of it as a central hub for interacting with your walkers. You can trigger a walker to run, execute it in the background without constantly monitoring the progress, or stop it entirely.

You can also retrieve complete data sets from your walkers, generate reports summarizing their performance, or save those reports directly to a file.

To keep things organized, WalkerUtils automatically keeps track of each walker running for a specific trading symbol, ensuring each one operates independently. It also offers a way to view a list of all currently active walkers and their status. This singleton instance ensures easy access to these helpful functions throughout your system.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema definitions for walkers, ensuring consistency and type safety. It’s like a central place to store and manage these schemas.

It uses a registry to store these schemas, and you add new ones using the `addWalker` (or `register`) method.

You can then easily find a specific schema by its name using the `get` method.

Before a new schema is added, `validateShallow` checks that it has the essential building blocks in place.

If a schema already exists, you can update parts of it using the `override` method, which lets you make changes without completely replacing the original. 

The service also has internal components for logging and managing context, which are used behind the scenes.

## Class WalkerReportService

WalkerReportService helps you keep track of your strategy optimization efforts. It's designed to capture the results of your backtesting experiments and store them neatly in a SQLite database.

Think of it as a recorder that listens for updates from your optimization process – it takes notes on each test run, including important metrics and performance data. This allows you to compare different strategy configurations and see how your optimization is progressing.

You can easily sign up to receive these updates, and there's a built-in safeguard to prevent accidental double-subscriptions. When you're finished, simply unsubscribe to stop receiving updates. The service uses a logger to provide some helpful debugging output too.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies. It listens for updates as your trading strategies run (called "walker" events) and keeps track of how each strategy is performing.

It organizes this information, using a special memoization technique to keep things efficient, and then formats it into easy-to-read markdown tables. These reports are saved as files on your computer, specifically in the `logs/walker/{walkerName}.md` directory.

You can control when the service starts and stops listening for updates, ensuring you're only collecting the data you need. It also allows you to retrieve specific data points, generate customized reports, and clear out the accumulated results when needed, either for a single strategy or all of them. The service uses a logger to provide debug information.

## Class WalkerLogicPublicService

This service helps manage and run the "walkers" that perform trading simulations. Think of walkers as individual trading strategies. It automatically passes along important information like the strategy's name, the exchange used, the simulation's name, and the walker's own name to each simulation.

Essentially, it acts as a middleman between your trading logic and the underlying engine, ensuring that all the necessary context is provided without you having to manually manage it.

The `run` method is the key function. It takes a stock symbol and a context object – which provides the walker's identity – and then kicks off the simulations, returning a stream of results. This method orchestrates running your trading strategies on a given symbol, ensuring they all have the correct setup and context.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies against each other. It orchestrates the process, providing updates as each strategy finishes running.

Think of it as a conductor leading an orchestra of backtests.

It keeps track of the best performing strategy as things progress, and finally delivers a complete ranking of all strategies tested. 

Behind the scenes, it relies on BacktestLogicPublicService to actually run each individual strategy.

You use it by giving it a symbol to trade, a list of strategy names to test, the metric you want to optimize for, and some contextual information.

The `run` method then executes these strategies one after another and gives you progress updates along the way.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for interacting with the walker functionality within the backtest-kit framework. It's designed to make using the walker logic easier by providing a simple way to inject dependencies. 

Think of it as a helpful intermediary that manages different services involved in the walker process.

It includes access to services for managing walker logic, schemas, validations (for strategies, exchanges, frames, walkers, risks and actions) and strategy schemas.

The `run` method is the main way you'll interact with the service; it allows you to execute a walker comparison for a specific trading symbol, while also providing context about which walker, exchange, and frame are being used. This allows for running complex tests and comparisons across different setups.


## Class TimeMetaService

The TimeMetaService keeps track of the most recent candle timestamp for each trading setup – considering the symbol, strategy, exchange, and timeframe – so you can reliably get the current candle time even when you're not actively executing trades. It's designed to be used when you need the time outside of the typical trading tick cycle, like when triggering commands between trades.

Essentially, it creates a snapshot of the latest timestamp for each unique combination of those factors. If a timestamp hasn't been recorded yet, it will wait a short time to see if one arrives.

Think of it as a helper that stores and provides the candle time, automatically updating it as your strategies run. If you're already in the middle of a trade, it'll grab the timestamp from a related service; otherwise, it looks up the cached value.

It’s managed centrally within the system, updated automatically by the strategy connection service, and can be cleared to free up resources or reset the data when you start a new backtest or trading session. You can clear everything at once or just specific time setups.

## Class SystemUtils

SystemUtils helps keep backtest sessions independent of each other. It prevents one session's actions from accidentally affecting another.

Think of it as creating a temporary "clean slate" for each backtest.

The `createSnapshot` function lets you freeze the current state of all the global event listeners. This is useful because it allows you to take a look at what's currently happening without being affected by any running tests. After you're done, you can easily restore everything to its original state.

## Class SyncUtils

SyncUtils helps you understand how your trading signals are working by providing a way to track and report on their lifecycle. It gathers information about signal openings and closings, providing statistics and detailed reports.

You can use it to get aggregated data about your signals, showing things like the total number of events, opens, and closes.  It can also generate nicely formatted markdown reports.

These reports will give you a clear picture of what’s happening with your signals, including details like the signal ID, direction, entry/exit prices, and profit/loss.

Finally, you can easily save these reports as files for later analysis or sharing. The file names clearly indicate the symbol, strategy, exchange, frame, and whether it’s a backtest or live data.

## Class SyncReportService

The SyncReportService is designed to keep a record of signal synchronization events, specifically when a signal is opened (like a limit order being filled) or closed (when a position is exited). It listens for these events and diligently logs them, including important details like the signal specifics, profit/loss, and the reason for closing. This creates an audit trail useful for managing orders and understanding trading activity.

You can think of it as a data keeper that ensures you have a history of what's happening with your signals.

The service uses a logger to help with debugging and it has a built-in mechanism to prevent accidental duplicate subscriptions.

To make it work, you need to subscribe to listen for signal events and you can unsubscribe when you no longer need to track those events. The `subscribe` method provides a function to unsubscribe, ensuring you don’t continue receiving updates unnecessarily.


## Class SyncMarkdownService

This service is designed to create and save reports detailing the lifecycle of trading signals. It keeps track of signal events like openings and closings.

It listens for these signal events and organizes them, keeping track of data for each unique combination of symbol, strategy, exchange, frame, and whether the backtest is live or historical.

The core function is to generate reports in markdown format, providing a clear and readable record of signal activity including statistics like the total number of events and how many signals were opened or closed.

You can subscribe to receive these signal events, and when you're finished, you can unsubscribe to stop listening and clear out the accumulated data.

You can request data for a specific combination of symbol, strategy, exchange, frame, and backtest to see accumulated statistics or to get the full report as a markdown string. The reports can also be saved directly to disk.

Finally, it's possible to clear the stored data, either for a specific signal combination or for all signal combinations, essentially resetting the tracking.

## Class StrategyValidationService

The StrategyValidationService helps you manage and double-check your trading strategy setups. It keeps track of all your defined strategies and makes sure everything is in order before you start trading.

Think of it as a central place to register your strategies using `addStrategy`, allowing you to give them names and configurations.

When you need to use a strategy, `validate` will confirm that the strategy exists and that any related risk profiles or actions are set up correctly. This service also remembers validation results, speeding things up with memoization.

Finally, if you need a quick overview, `list` provides a handy list of all the strategies currently registered with the service.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. Think of it as a reporting tool that gathers information about events like closing trades, taking profits, or setting stop-loss orders. It provides ways to get summaries of this data, create detailed reports, and even save those reports to files.

You can request statistical information about a strategy's actions, like how many times it took profits versus how many times it closed pending orders.

It can also generate comprehensive markdown reports, showing you a table of all the events that occurred, including details like the price, percentage values, and timestamps.

Finally, StrategyUtils can automatically save these reports to files, organizing them by symbol, strategy name, exchange, and frame, making it easy to track performance over time. These reports are formatted to be human-readable and provide useful insights into your strategies.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're consistent and well-defined. It uses a special system to store these blueprints in a way that catches errors early on.

You can add new strategy blueprints using the `addStrategy()` method, and then retrieve them later using their names. 

Before a new blueprint is added, it's quickly checked to make sure it has all the necessary parts and that those parts are the right types. This helps prevent problems down the road.

If a blueprint already exists, you can update it with new information using the `override()` method.  Finally, the `get()` method lets you find a specific strategy blueprint by its name.

## Class StrategyReportService

This service is designed to keep a detailed audit trail of what's happening with your trading strategies. It focuses on recording key events like canceling scheduled trades, closing pending orders, taking partial profits or losses, adjusting stop-loss orders (trailing stops and take profits), and setting breakeven points.

Think of it as a way to ensure you have a permanent, verifiable record of your strategy's actions, written directly to JSON files as they happen.

To start using it, you need to "subscribe" to the service. After subscribing, each trading event (cancel, close, profit, loss, etc.) will automatically be logged. When you're finished, "unsubscribe" to stop the logging process.

Each event type has its own specific function (cancelScheduled, closePending, partialProfit, etc.) that you'll call whenever that event occurs within your strategy. These functions record the details of the event, including the symbol traded, prices, profitability metrics, and other relevant context. It’s important to note that this service is different from services that accumulate data in memory for reports - it writes everything directly to disk for continuous auditing.

## Class StrategyMarkdownService

This service helps you track and report on what's happening in your trading strategies during backtesting or live trading. Think of it as a detailed event logger and reporter.

It gathers information about key actions within your strategy, like canceling orders, closing positions, and adjusting stop-loss or take-profit levels. Instead of writing each of these events immediately to a file, it temporarily holds them in memory for efficiency.

You can then use this service to generate summaries and detailed markdown reports, customize the information displayed, and save them to files with descriptive names.  It offers options to clear the data—either specific parts or everything—and it has a clear lifecycle: you subscribe to start collecting data, and unsubscribe to stop and clear everything.

The `cancelScheduled`, `closePending`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, `breakeven`, `activateScheduled`, and `averageBuy` methods essentially act as "event listeners" that record these different types of trading actions.

The `getData` method lets you retrieve the raw event data, `getReport` generates formatted markdown reports, and `dump` saves those reports to files.  Finally, `clear` lets you wipe the collected data, and `subscribe`/`unsubscribe` manage the service's active state.

## Class StrategyCoreService

This service acts as a central hub for managing strategy execution and provides tools for inspecting a live or backtested position. It leverages other services to handle things like logging, connecting to exchanges, and validating strategies.

It offers a wide range of methods for querying the status of a pending or scheduled signal, including information on profit/loss, position size, entry prices, and time-related metrics (like estimated duration and waiting time).

You can use it to validate strategies, retrieve signals, check if a strategy is stopped or breakeven, and even execute actions like closing a position or canceling a scheduled order. It also offers functions for partial profit or loss management and getting historical data points regarding peak profit and maximum drawdown. Finally, it includes methods for disposal, clearing caches, and handling edge-cases like backtesting.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for trading strategies within the backtest-kit framework. It's designed to efficiently manage and execute strategies by ensuring the right strategy implementation handles requests based on the trading symbol and strategy name.

Here's a breakdown:

*   **Smart Routing:** It automatically directs calls to the correct strategy implementation, based on the symbol and strategy name.
*   **Performance Boost:** It uses a caching system to store and reuse strategy implementations, minimizing overhead.
*   **Initialization:**  It ensures that strategies are properly initialized before any trading actions are performed.
*   **Handles Both Live and Backtesting:** It's equipped to manage both live trading (`tick`) and historical backtesting (`backtest`) scenarios.

The service relies on several other services, like `loggerService`, `exchangeConnectionService`, and `timeMetaService`, to manage logging, communication with exchanges, and time-related operations.

Key functions allow for actions such as getting pending signals, calculating position costs, managing partial closes, and executing various trading commands like `partialProfit`, `trailingStop`, and `averageBuy`. It also provides methods to stop, cancel, or close strategies, and to check their status and performance metrics.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored, allowing you to easily switch between different storage methods. It acts as a middleman, adapting to various storage implementations like persistent storage on disk, in-memory storage, or even a dummy adapter for testing.

You can choose your storage method using convenient functions like `usePersist`, `useMemory`, and `useDummy`, and the adapter will remember your choice for future operations. If you need to change your storage location, like when running a new test with a different working directory, calling `clear` ensures a fresh start.

The adapter handles events like signals being opened, closed, scheduled, or cancelled, forwarding these actions to the selected storage backend. You can also retrieve signals by their ID or list all stored signals through this adapter. It also manages "ping" events to update signal timestamps when they are actively scheduled or running. If you want to use a completely custom storage solution, you can register a new adapter.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. It uses a design pattern that allows you to easily switch between different storage methods – like persistent storage to disk, memory-only storage, or even a dummy storage for testing – without changing your core backtesting logic.

The adapter itself doesn't directly handle storage; it delegates that to a chosen "storage utils" implementation.  You can configure which storage method is used by calling methods like `usePersist()`, `useMemory()`, or `useDummy()`. The `useStorageAdapter` method offers even more control, allowing you to specify a custom storage implementation.

Several methods, such as `handleOpened`, `handleClosed`, and `findById`, provide ways to interact with the underlying storage, essentially acting as a middleman between your backtesting code and the actual storage mechanism. These methods proxy requests to the currently active storage adapter.  The `clear()` method is important to call if your working directory changes, ensuring a fresh storage instance is used. The adapter uses caching to improve performance, rebuilding the storage utils only when needed.

## Class StorageAdapter

The StorageAdapter handles the storage of both your backtesting data and live trading signals, keeping everything organized in one place. It automatically updates the storage as new signals are generated.

To start using the storage, you need to "enable" it, which subscribes it to the signal emitters, and it's designed to only subscribe once. Conversely, you can "disable" the storage at any time to unsubscribe from these signals, and you can safely call disable multiple times.

You can easily find a specific signal using its ID, or retrieve lists of all backtest signals and all live signals stored. This adapter provides a straightforward way to manage your signal data.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage the ongoing state of your trading strategies, particularly useful for complex logic like LLM-driven capitulation rules. Think of it as a central place to track information about each trade, like its peak performance and how long it’s been open.

It's designed to be flexible, letting you choose where that trade data is stored – in memory for quick access, on disk for persistence across restarts, or even a dummy adapter if you just want to test things out without saving anything. The system remembers these settings to avoid needing to recreate them frequently.

Importantly, this adapter saves critical data like peak profit and the duration a trade has been open, so it can be used to inform decisions. For example, if a trade hasn’t performed as expected after a certain amount of time, the system can automatically react.

When a signal is finished, like when a trade is closed, the `disposeSignal` method ensures that associated data is properly cleaned up. The `clear` method is important to call when things like your working directory change to prevent issues with how the adapter functions. You can easily switch between the different storage methods using the helper functions like `useLocal()`, `usePersist()`, and `useDummy()`.


## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage and store the state information used during backtesting. It lets you easily switch between different storage methods, like keeping data only in memory, saving it to files, or using a dummy adapter that simply ignores all data. This adaptability is achieved through an adapter pattern, allowing for swappable state implementations.

The adapter automatically creates and manages state instances, remembering them for each signal and bucket combination to avoid unnecessary re-creation. When a signal is finished, you can use `disposeSignal` to clear these cached instances.

You can quickly switch to the default in-memory storage using `useLocal()`, persist data to disk with `usePersist()`, or discard data entirely with `useDummy()`. For advanced users, `useStateAdapter()` lets you plug in your own custom state adapter implementations.  If your working directory changes, `clear()` will remove the memoized caches so that new instances are initialized with the updated path. 

This framework is particularly useful for implementing complex trading rules, such as those involving monitoring trade performance over time and using LLMs to evaluate market confirmations – where you need to track metrics like peak percentage and minutes open for each trade.

## Class StateAdapter

The StateAdapter is the central piece for managing how your backtest and live trading data is stored and accessed. It's designed to keep things clean and efficient.

It automatically handles subscribing and unsubscribing from signals, ensuring old data is removed when signals are no longer active, which prevents issues with outdated information.

You can use `enable` to get things started and `disable` to stop the storage. Calling `disable` multiple times won't cause problems.

`getState` lets you retrieve the current value of a signal, figuring out whether to pull from the backtest or live data based on your settings.

Finally, `setState` provides a way to update the stored values of a signal, again intelligently routing to the correct backtest or live location.


## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and make sure they're set up correctly before you start trading. Think of it as a central place to register and check your sizing methods.

It allows you to add new sizing strategies using `addSizing`, so you have a complete record of all your available options.

The `validate` function is your safety net; it verifies that a sizing strategy exists before you try to use it, preventing potential errors. 

To speed things up, the service caches the results of these validations.

Finally, `list` provides a simple way to see all the sizing strategies you've registered.

## Class SizingSchemaService

The SizingSchemaService helps you manage and store sizing schema definitions in a safe and organized way. It uses a registry to keep track of these schemas, ensuring type correctness. 

You can add new sizing schemas using the `register` method, and update existing ones using `override`. 

To use a specific sizing schema, simply retrieve it by its name with the `get` method. 

Before a schema is added, `validateShallow` checks its basic structure to make sure it has all the necessary properties and they are of the right type. This helps to prevent errors later on.


## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, managing the sizing process. It relies on other services – a connection service for actual size calculations and a validation service to ensure sizing requests are correct. Think of it as the central hub for figuring out the right size for each trade, providing a consistent and reliable approach used both behind the scenes and by the tools you use directly. It keeps track of important things like logging and validation to help maintain a clear picture of sizing operations.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for calculating trade sizes. It figures out which specific sizing method to use based on a name you provide. 

Think of it as a dispatcher; it directs sizing requests to the right implementation.

To improve speed, it remembers (caches) which sizing methods it’s already set up, so it doesn't have to recreate them every time. 

The service uses sizingName to route sizing method calls to the right sizing implementation. 

When no sizing configuration is needed, the sizingName is simply left blank. 

The `getSizing` property handles retrieving the correct sizing method, using caching to avoid unnecessary setup.

The `calculate` method performs the actual sizing calculation, taking into account risk management and the chosen sizing method like fixed percentage or Kelly Criterion.

## Class SessionLiveAdapter

The SessionLiveAdapter helps manage and store data during live trading sessions, making it easy to swap out different storage methods. It acts as a central point for accessing and modifying session data, allowing you to use various storage backends depending on your needs.

You can choose between several storage options: a file-system based persistent storage (the default), an in-memory solution, or even a dummy adapter that simply discards any data written to it. 

The `useLocal`, `usePersist`, and `useDummy` methods provide simple ways to switch between these storage options. If you need more flexibility, `useSessionAdapter` allows you to plug in your own custom storage implementation. 

The adapter intelligently caches session instances to avoid unnecessary reloads, and the `clear` method lets you refresh that cache, which is particularly useful when the working directory changes. Ultimately, this component simplifies how you handle and persist data throughout your trading sessions.

## Class SessionBacktestAdapter

This component provides a flexible way to manage session data during backtesting. It acts as a bridge, allowing you to easily swap out different storage mechanisms for your session information.

By default, it uses an in-memory storage, which is fast but doesn't save data between runs. You can switch to a file-based storage to persist your session data to disk, or a dummy storage for testing purposes where data isn’t saved.

The `getData` and `setData` methods allow you to read and write session values, identified by a symbol, strategy name, exchange, and frame name.

Convenience methods like `useLocal`, `usePersist`, `useDummy`, and `useSessionAdapter` simplify switching between these different storage options. The `clear` method helps refresh the stored data when the working directory changes.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both simulated (backtest) and live trading sessions. It intelligently directs data requests and updates to the appropriate storage mechanism – either the backtest storage or the live storage – depending on whether you're running a test or a real-time trade. 

You can use `getData` to retrieve existing data, specifying the symbol, the context of the trade (strategy, exchange, frame), whether it’s a backtest, and the timestamp. Similarly, `setData` allows you to update the data, sending the information to the correct storage based on whether it's a backtest or live scenario. This adapter simplifies managing your data across different operational modes.


## Class ScheduleUtils

The `ScheduleUtils` class helps you understand how your scheduled signals are performing. It's a single, easy-to-use resource for getting insights into signal scheduling.

You can retrieve data about scheduled signals for specific symbols and strategies, allowing you to monitor their queue status, cancellations, and wait times. 

It also generates detailed markdown reports summarizing signal events, making it simple to identify potential bottlenecks or issues. 

Finally, you can save these reports directly to a file for later analysis or sharing.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of when signals are scheduled, opened, and cancelled. It listens for these signal events and records them in a database, allowing you to analyze how long it takes for signals to be acted upon.

Think of it as a detective, diligently noting down the milestones of a signal’s journey.

It calculates the time elapsed between a signal being scheduled and when it's either executed or cancelled.

The service uses a logger to output debug information and prevents accidental double-subscription to signal events.

To start using it, you’ll subscribe to signal events, and when you're done, you’ll unsubscribe to stop listening. The `subscribe` method gives you a function that you can call to stop listening.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your automated trading signals. It watches for signals that are scheduled or cancelled and organizes them by strategy.

It automatically creates easy-to-read reports in Markdown format, displaying details about each signal, like when it was scheduled and if it was later cancelled. The service even calculates useful statistics, like the cancellation rate and how long signals typically wait before being executed.

These reports are saved as files on your computer, making it simple to review your automated trading system's performance. You can also request specific data or generate reports on demand. It also offers a convenient way to clear out the historical data when it is no longer needed.

## Class RiskValidationService

The RiskValidationService helps you keep track of and verify your risk management settings. It acts like a central record keeper for your risk profiles, ensuring they're all accounted for before you start trading. 

It lets you register new risk profiles, a process that involves providing a name and a set of rules. 

Before any operation that uses a risk profile, you can ask the service to validate it, which quickly checks if the profile actually exists.

To speed things up, the service remembers the results of these validations, so it doesn't have to re-check profiles repeatedly.

Finally, you can get a complete list of all the risk profiles that are currently registered with the system.

## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejection events within your trading system. Think of it as a tool for inspecting what went wrong and why. It gathers information about rejections – like the symbol involved, the trading strategy used, the position taken, and the reason for the rejection – and provides ways to view and export this data.

You can use it to get overall statistics on the rejections, such as how many occurred, broken down by symbol and strategy. It can also create detailed reports in markdown format, presenting each rejection event in an organized table.  These reports include details like the price at the time of rejection, the number of positions held, and a description of the reason for the rejection.

Finally, this class provides a simple way to save those detailed reports to a file, so you can review them later or share them with others. The file names are automatically generated, combining the symbol and strategy name for easy organization.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a structured and reliable way. 

It uses a special system for storing these schemas, ensuring that the data types are correct and consistent.

You can add new risk schemas using the `addRisk()` method (represented by the `register` property) and easily find existing ones by their names using the `get` method. 

Before adding a schema, it checks the basic structure to make sure everything is set up properly (`validateShallow`).

If a risk schema already exists, you can update parts of it without replacing the whole thing using the `override` method. 

The service also has a logger to help you debug and monitor how it's working.


## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system blocks trades. It listens for these rejections and saves details like why the trade was rejected and what the trade was supposed to be.

Think of it as an audit log specifically for risk-related decisions.

It uses a logger to help with debugging.

To start using it, you'll subscribe to the risk rejection events. This gives you a function to later stop the service.  If you try to subscribe multiple times, it prevents that to ensure things are handled correctly. The unsubscribe function makes sure you’re not needlessly processing events when you don’t need to.

## Class RiskMarkdownService

This service helps you automatically generate and save reports about rejected trades, which is useful for understanding why your trading strategies aren't executing as expected. It listens for "risk rejection" events, essentially tracking when trades are blocked.

It organizes these rejections by symbol (the asset being traded) and strategy (the trading rule being used). The service then creates easy-to-read markdown tables summarizing these rejected trades, including overall statistics like the total number of rejections. 

You can retrieve data and reports for specific symbol-strategy combinations or clear all accumulated data. These reports are saved as markdown files on your system, making it simple to review and analyze rejection patterns. You can also customize the columns shown in the reports. The service keeps data for each combination of symbol, strategy, exchange, frame, and backtest separate, preventing data mixing.

## Class RiskGlobalService

This service acts as a central hub for managing risk during trading. It's responsible for ensuring that trades adhere to predefined risk limits and works closely with a connection service to validate those limits.

It keeps track of validations to avoid unnecessary repetition and provides logging for these activities.

The core functionality involves checking if a trading signal is permissible based on risk rules, with a special version that guarantees safety in concurrent scenarios. When a signal is approved, it registers the trade with the risk system, and when a trade closes, it removes the signal. Finally, it offers the ability to clear existing risk data, either for a specific risk setup or a complete reset.

## Class RiskConnectionService

This service acts as a central point for managing risk checks during trading, ensuring that all risk-related operations are handled by the correct, specialized risk implementation. It intelligently caches these risk implementations to improve performance, avoiding repeated creation of the same risk checks.

The service receives instructions on which risk rules to apply through a `riskName` parameter, and the specific risk implementation is selected based on this parameter. To handle different trading environments, it also considers the exchange and frame names alongside whether the test is a backtest or live trade.

Several key functions are provided: `getRisk` fetches cached risk implementations, `checkSignal` validates trading signals against predefined limits, and `checkSignalAndReserve` is a safe version used when placing trades. The `addSignal` and `removeSignal` functions manage the lifecycle of open and closed trades respectively, and `clear` allows for invalidating the cache when necessary. This service provides a structured and efficient way to manage risk within the trading framework.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you collect and store data from your trading strategies, offering flexibility in how that data is saved. It uses a pattern that allows you to easily swap out different storage methods without changing your core code. 

It keeps track of your storage instances, ensuring that you only have one storage instance for each type of report (like backtest results or live trading data) throughout the program's lifecycle.  The default storage method saves data in JSONL format.

You can customize the storage method by providing your own adapter, or switch back to the default JSONL method as needed. The adapter handles writing the data, and it will set up the storage automatically the first time it's used. 

There’s also a convenient option to use a dummy adapter which acts as a no-op, effectively discarding all data writes, which is useful for testing or scenarios where you don't need to store data. The adapter also has a `clear` method to reset the storage cache, useful when you change your working directory.


## Class ReportUtils

ReportUtils helps you control which parts of your trading system generate detailed reports. Think of it as a way to turn on or off logging for specific activities like backtesting, live trading, or analyzing your strategies.

It’s designed to be used alongside other components, often extended to provide even more reporting options.

The `enable` function lets you choose which report services to activate. When you use it, it starts listening for events and writing them to JSONL files—these files contain valuable data for analysis. Critically, you *must* remember to call the function it returns to stop the logging and prevent problems.

The `disable` function does the opposite; it stops the logging for services you've previously enabled. It’s useful for temporarily turning off reporting without affecting other areas of your system. This function doesn't need a cleanup function like `enable`.

## Class ReportBase

This class provides a way to save your trading data and analysis results to files in a structured format. It's designed to write events as individual lines within JSON files, making it easy to process and analyze your backtest results later.

The files are organized into directories based on the type of report, and new directories are created automatically.  Writes are handled carefully to avoid errors and ensure data isn't lost, with built-in protections against slow or unresponsive writing.

You can filter the data being written by including metadata like the trading symbol, strategy, exchange, and other identifiers. It's like creating a log file that’s perfectly formatted for searching and analysis. 

Initialization only happens once, even if you call the initialization function multiple times.  The `write` function is your main tool for saving event data, and it automatically adds metadata and a timestamp to each entry.

## Class ReportAdapter

The ReportAdapter helps you manage and store your trading data in a flexible way. Think of it as a central hub for collecting information like trades and performance metrics.

It uses a pluggable design, so you can easily swap out how the data is stored—like switching from a simple file to a database—without changing much of your code.

It keeps track of different types of reports and remembers which storage method to use for each, making things efficient.

You can tell it which storage method to use by default, or temporarily disable storage completely to test things out.

If your working directory changes, clearing the adapter ensures fresh storage is used.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a way to track key metrics like profit, loss, and drawdown for your trading strategies, especially useful during backtesting and live trading. It acts as a central point for accessing and validating position data, ensuring consistency and reducing potential errors.

Think of it as a toolkit for understanding how a position has performed. It lets you query things like:

*   **Profit & Loss (PnL):** Current PnL in percentage and cost (USD).
*   **Peak Performance:** Highest profit price, timestamp, and percentage reached.
*   **Drawdown:**  The extent of losses relative to the peak profit, including timestamps and price/cost values.
*   **Time-based Metrics:** How long a position has been active, waiting for activation, or since its peak profit.

It handles things like partial closes, DCA entries, slippage, and fees in its calculations. The `backtest` parameter lets you tailor the data retrieval to either live trading or historical backtesting scenarios.  The class is structured as a singleton, meaning you'll use one instance across your application for easy access. Essentially, it's designed to give you real-time visibility into position health.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, providing a flexible way to store and retrieve them. It’s designed to work with different storage methods, allowing you to choose between persistent (disk-based) and in-memory storage.

You can easily switch between storage options using `usePersist` for long-term storage and `useMemory` for quicker, temporary access. The adapter remembers the chosen storage method and automatically handles retrieving signals.

If you need to use a custom storage method, `useRecentAdapter` lets you specify your own implementation. To ensure data freshness, `clear` is useful when you need to rebuild the storage adapter, for example, when the working directory changes. The adapter takes care of fetching signals, calculating time elapsed since creation, and responding to "active ping" events, so you can focus on your trading logic.

## Class RecentBacktestAdapter

This component helps manage and store recent trading signals, allowing you to choose between keeping them in memory or persisting them to disk. It provides a flexible way to adapt to different storage needs without changing the core logic of your backtesting framework.

You can easily switch between in-memory and persistent storage using `useMemory` and `usePersist` methods. The `useRecentAdapter` function allows you to customize the storage mechanism entirely by providing your own implementation.

The system keeps a cached version of the storage utilities for efficiency, but you can clear this cache using `clear` to ensure a fresh instance is used when the environment changes, like when your working directory is updated. The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods act as intermediaries, forwarding requests to the currently active storage adapter.

## Class RecentAdapter

The RecentAdapter is a central component responsible for handling and storing recent trading signals, whether you’re running a backtest or a live trading system. It automatically updates its signal storage whenever new data arrives.

You can easily get the most recent signal for a specific asset and situation. It prioritizes backtest data first, and then checks live data if nothing is found in the backtest.

To prevent look-ahead bias, the adapter makes sure the signal's timestamp isn't in the future compared to your specified time.  It will return null if it finds a signal that’s too recent.

The adapter uses a clever system to ensure it only subscribes to data updates once, preventing unnecessary subscriptions and potential issues. It's also designed to be safely disabled and re-enabled as needed, even multiple times.

Finally, you can check how long ago the last signal was generated, also considering a look-ahead cutoff to avoid using future information.

## Class PriceMetaService

PriceMetaService is a system that tracks the most recent market prices for trading strategies. It helps you get the current price even when you're not actively executing trades.

It stores price information for each unique combination of symbol, strategy, exchange, frame, and backtest setting. Think of it as a memory of prices, updated as strategies run.

If you need the current price, PriceMetaService tries to provide it quickly. If it hasn't received a price yet, it'll wait a short while. It also understands that sometimes you need a live price, and will fetch it from another service if needed.

You can clear this memory to release resources and make sure you’re working with fresh data. This is especially important when starting a new trading strategy. The service is designed to work behind the scenes, automatically updating and managing prices as your trading system operates.

## Class PositionSizeUtils

This utility class helps you figure out how much to trade based on different strategies. 

It offers pre-built methods for position sizing, like calculating size using a fixed percentage of your account, or using the Kelly Criterion which considers your win rate and loss ratio.  You can also use an ATR-based method that factors in the Average True Range to gauge volatility.

Each method checks to make sure the information you provide matches the sizing technique you've selected, helping prevent errors. 

The class is straightforward to use because it offers these calculations as readily available functions.


## Class Position

The `Position` class offers helpful tools for figuring out where to set your take profit and stop loss levels when trading. It simplifies the process by automatically adjusting these levels depending on whether you're going long (buying) or short (selling).

You have two main calculation methods available:

*   **moonbag:** This strategy places your take profit point a fixed distance above or below your entry price, based on a percentage. It's a simple way to secure profits quickly.

*   **bracket:** For more control, you can use the bracket method. This allows you to define your own specific take profit and stop loss percentages, letting you tailor your risk and reward. 

These functions take information about your position type, the current price, and the desired stop loss and take profit percentages to provide you with the appropriate price levels.

## Class PersistStorageUtils

This class offers tools to reliably save and retrieve signal data, especially for backtesting and live trading scenarios. It manages storage instances in a smart way, so you don't have to recreate them repeatedly.

You can customize how the data is stored using a custom adapter, or easily switch back to the default file-based storage.  It ensures that your signal data is written safely, even if unexpected interruptions occur.

Signals are stored individually as separate files, making it easier to manage and debug individual signal states.

If your working directory changes during testing, you can clear the cache to force a refresh. There's even a dummy storage option for testing purposes, where nothing is actually saved.


## Class PersistStorageInstance

This component handles saving and loading trading signals to and from files, primarily designed for backtesting scenarios. It's like a digital filing cabinet for your signals, ensuring they're saved individually and safely. Each signal gets its own file, making it easy to manage and retrieve them. 

The `backtest` property simply indicates whether this is being used for a backtest or not.

The `waitForInit` method prepares the underlying file storage for use.

`readStorageData` allows you to load all those stored signals back into your system, essentially gathering all the files and putting their contents back together.

Finally, `writeStorageData` takes your signals and saves them to those individual files, using a signal's ID as the filename to keep things organized. It uses a safe writing process to protect against data loss in case of interruptions.

## Class PersistStateUtils

This class helps manage how your trading strategy's data is saved and loaded, making it more resilient to unexpected interruptions. It's designed to keep track of things like the state of your orders or the progress of a backtest.

It uses a clever system to ensure each piece of data is stored in the right place, and it allows you to easily switch between different storage methods, like saving to files or simulating a no-op for testing.

You can customize how the data is saved and loaded using your own storage adapters. The class handles the complexities of safely reading and writing data, and it automatically cleans up when signals are no longer needed. The `waitForInit` method is helpful to control when this initial setup happens, especially if you have dependencies. Clearing the cache is important when your working directory changes.

## Class PersistStateInstance

This class provides a way to save and load trading state information to a file, ensuring that changes are written reliably. It’s designed to work with a specific trading signal and a bucket name, effectively creating a dedicated storage location for each signal. 

The class handles the complexities of writing data to a file, ensuring that the process is handled safely. 

You can use it to retrieve the saved state or update it with new data, such as parameters or configurations. 

Importantly, when you're finished, there's no need to manually clean up resources; the system takes care of that for you.


## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, ensuring their state is reliable even if things go wrong. It automatically handles creating specialized storage areas for each strategy and trading symbol combination, preventing conflicts. 

You can customize how these signals are persisted, swapping out the default storage method with your own custom solution. The system intelligently creates these storage areas the first time they're needed, so you don’t have to manage them manually. 

If you need to switch to a different storage method or clear existing data, you can do so easily with dedicated functions. This utility is particularly important for strategies running in live mode, where reliable persistence is crucial.


## Class PersistSignalInstance

This class helps you save and retrieve signal data for your trading strategies. It's designed to be reliable, even if your program crashes unexpectedly.

It keeps track of signals associated with a specific trading symbol, strategy name, and exchange. Think of it as a way to remember what your strategy was doing at a particular point in time.

The class uses a file to store this information, ensuring that data isn't lost. 

Here's a breakdown of what it does:

*   **Initialization:**  `waitForInit` makes sure the storage is ready before you try to use it.
*   **Reading Data:** `readSignalData` fetches the saved signal data related to a specific symbol.
*   **Saving Data:** `writeSignalData` allows you to store a new signal or clear the existing one.






## Class PersistSessionUtils

This class provides tools for safely saving and loading session data, making sure your trading strategies don't lose progress even if things go wrong. It acts as a central manager for session storage, automatically handling the details of where and how data is saved.

Think of it as a smart helper that keeps track of different trading setups – like a specific strategy, exchange, and timeframe – and remembers their settings. It uses a specific file structure to organize this data.

It gives you options to customize how these sessions are saved. You can choose to use standard file storage, a dummy adapter that does nothing (useful for testing), or even plug in your own custom storage method.

You can also instruct it to set up the storage initially or skip the setup if it's already done. 

If you need to clean things up, you can tell it to clear its memory or to remove a specific session’s saved data. This is particularly important if your trading environment changes.

## Class PersistSessionInstance

This class provides a way to save and load session data persistently, specifically designed to work with backtest-kit strategies and exchanges. It acts as a bridge between your trading logic and the file system, ensuring your session information is reliably stored.

Essentially, it uses the strategy and exchange names, along with a unique identifier called `frameName`, to organize and locate your session data within files. 

The `waitForInit` method ensures the underlying storage is ready before you try to save anything.  `readSessionData` retrieves your saved session information using the `frameName`, and `writeSessionData` saves new data, again referencing the `frameName`. Finally, `dispose` doesn’t actually do anything itself; it relies on a separate utility function to handle clearing out any cached information. 

Think of it as a convenient container for keeping track of your session details so they’re not lost when the backtest ends.

## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and loaded, particularly for strategies that need to remember their plans across sessions. It ensures that each strategy working with a specific trading symbol, on a particular exchange, uses its own dedicated storage for these signals.

The system automatically creates and manages these storage instances, so you usually don't need to worry about the technical details. It's designed to be reliable, even if the system crashes, and allows for custom storage solutions if you need something beyond the defaults.

You can easily switch between different ways of persisting these signals, such as using a standard file-based storage or even a dummy storage for testing purposes. If you’re using a custom storage option, this utility handles remembering which storage is active for each strategy.

The `readScheduleData` method retrieves a saved signal, while `writeScheduleData` updates it. These functions work together to keep your scheduled signals safe and accessible.


## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, provides a way to reliably save and load scheduled signals for your trading strategies. It's designed to be a concrete implementation of a more general interface, `IPersistScheduleInstance`.

Think of it as managing data related to a specific trading symbol, strategy, and exchange. It uses files to store this data, ensuring that it’s kept safely. The class handles the technical details of writing data to files in a way that prevents data loss, even if your program crashes unexpectedly.

Here's a breakdown of what it does:

*   It stores the trading symbol, strategy name, and exchange name it’s working with.
*   It initializes the storage mechanism, preparing it to hold data.
*   It reads existing scheduled signal data from a file, based on the trading symbol. If there's no data, it returns `null`.
*   It writes new scheduled signal data (or clears existing data) to a file, again using the trading symbol to identify the correct location. 


## Class PersistRiskUtils

This class helps manage how your trading positions are saved and retrieved, especially when dealing with different risk profiles. It keeps track of active positions and makes sure that information is stored consistently and safely.

The system remembers which storage method to use for each risk profile, allowing you to easily switch between different ways of persisting data.  It creates storage instances on demand, only when they're needed.

You can customize how data is stored by providing your own storage constructors, essentially swapping out the default storage with something tailored to your needs.

If you need to reset the system, like when your working directory changes, you can clear the cached storage instances to ensure fresh data. There’s also a convenient way to switch back to the default file-based storage or even a dummy storage for testing purposes where no actual persistence happens.

The `readPositionData` method retrieves the saved active positions at a specific time, while `writePositionData` saves the current positions. Both functions work together to ensure the persistence of your positions.

## Class PersistRiskInstance

This component handles persistently storing position data for risk management, focusing on reliability and safety. It's designed to work alongside other parts of the backtest-kit framework.

It utilizes a file-based system for storing this data, ensuring that changes are written securely and consistently. Think of it as a dedicated place to save and retrieve your risk-related information.

The `PersistRiskInstance` uses a predefined identifier ("positions") for all data, simplifying management and guaranteeing uniformity.

You can kickstart the storage process using `waitForInit`, which sets up the underlying file system.  `readPositionData` lets you load previously saved data, while `writePositionData` is used to update and save the current state. These functions use a fixed key, ensuring the data is always stored in the expected location. 


## Class PersistRecentUtils

This utility class helps manage how recent trading signals are saved and loaded, ensuring that information persists even if there are issues. It's designed to be used in backtesting and live trading scenarios, and it automatically handles storing data based on the specific symbol, strategy, exchange, and timeframe you're working with.

The class remembers which storage method to use – you can plug in your own custom storage, use a default file-based storage, or even use a dummy storage for testing.  It makes sure the reading and writing of these signals happens safely, even if the system crashes, and uses a clever system to avoid creating unnecessary storage instances.  If you need to switch to a new storage mechanism, you can easily do so, and the class will automatically update its behavior. Finally, you can clear the stored information when needed, for instance, when the working directory changes.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal data for a specific strategy and market. 

It’s designed to work with file storage, making sure the data is saved reliably. 

Think of it as a way to remember the last known signal for your trading system.

The class stores details like the trading symbol, strategy name, exchange, frame name, and whether it's a backtest or live run. 

It manages a file-based storage system, organizing data based on this information to keep things separate and organized.

You can use the `readRecentData` method to get the last saved signal and `writeRecentData` to update it whenever a new signal occurs. The `waitForInit` method makes sure the storage is ready before you start reading or writing data.

## Class PersistPartialUtils

This class helps manage and safely store the partial profit and loss information for your trading strategies. It's designed to make sure this data doesn't get lost, even if there are unexpected interruptions.

It smartly creates storage containers for each combination of trading symbol, strategy name, and exchange. These containers ensure that data is stored and retrieved reliably.

You can customize how this data is stored using different adapters, or simply use the default file-based system. There's also a "dummy" mode for testing where no data is actually saved.

The `readPartialData` and `writePartialData` methods allow you to retrieve and save partial data, respectively, and they work together to ensure data integrity. If you change the working directory of your strategy, you'll need to clear the internal cache to keep things running smoothly.


## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you reliably store and retrieve pieces of data related to your trading strategies. It's designed to work with files, ensuring that your data isn't lost even if something unexpected happens during the process. 

Think of it as a safe keeper for partial information about your strategies, identifying each piece of data by a unique signal ID. It's specifically built to handle scenarios where you're working with strategies that run across different exchanges and need to be identified.

The class takes the symbol, strategy name, and exchange name as input during creation to clearly identify what data it manages. Internally, it utilizes a file-based storage system to ensure data persistence, and it handles file writes in a way that minimizes the risk of data corruption. The `waitForInit` method ensures the storage is properly set up before you start writing data, and `readPartialData` and `writePartialData` methods allow you to access and update those pieces of data.


## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved, particularly for backtesting and live trading environments. It provides a way to handle the storage of notifications, ensuring that each notification is treated as a separate, identifiable file. 

It uses a clever system of memoization, meaning it creates and reuses storage instances to avoid unnecessary work.  You can even swap out the storage method to use your own custom solution, a JSON-based system, or a dummy implementation for testing. 

The `readNotificationData` and `writeNotificationData` methods handle the actual loading and saving of notification information, and they only create the necessary storage when they're first needed.  

The `clear` method is important to use when your working directory changes – it refreshes the storage instances to ensure they're using the correct path.

## Class PersistNotificationInstance

This component handles saving and retrieving notification data, particularly useful for persisting information across backtesting sessions. It acts as a bridge between your trading logic and a file system, ensuring that notification details aren't lost. Think of it as a reliable way to keep track of important events.

It stores each notification as its own JSON file, making it easy to manage and locate individual entries. The system is designed to be resilient to crashes, thanks to its atomic write operations.

You can initialize the storage, read all the saved notifications, and write new notifications—all with straightforward methods. The `backtest` property determines the storage mode, and the underlying storage mechanism is managed internally.

## Class PersistMemoryUtils

This class helps manage and persist data related to memory entries, ensuring that information isn't lost even if the application crashes. It intelligently caches these memory instances, creating a new one only when needed for a specific signal and bucket combination. 

You can customize how these memory instances are created using a custom adapter, or stick with the default file-based or dummy options for testing. The class provides methods for reading, writing, deleting, and checking for the existence of these memory entries.

It also allows you to clear the cache when needed, like when the working directory changes, and offers a way to clean up storage associated with signals that are no longer used. A key feature is the ability to iterate through all memory entries to rebuild indexes, and to easily switch between different persistence strategies.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data to files. It's designed to work with the `IPersistMemoryInstance` interface, acting as the default file-based implementation.

It handles saving data to a file, ensuring that updates happen reliably.

Data can be "soft-deleted" by marking entries as removed, which allows for easy recovery if needed. When listing memory data, only the active, non-removed entries are shown.

The `waitForInit` method sets up the underlying storage. You can read individual memory entries using their ID, and `hasMemoryData` lets you quickly check if a particular entry exists. To update data, use `writeMemoryData`, and to remove data, use `removeMemoryData` (which performs a soft delete). Finally, `dispose` does nothing on its own because the memo cache is managed separately.


## Class PersistMeasureUtils

This class, PersistMeasureUtils, helps manage cached data from external APIs, specifically for trading strategies. It provides a way to store and retrieve API responses persistently, ensuring that the same data isn't repeatedly fetched.

It uses a clever system where each cache bucket (identified by a timestamp and symbol) gets its own dedicated storage instance.  You can even customize how these storage instances are created using adapters.

The class handles reading, writing, and deleting cached data reliably, and it's designed to be safe even if the system crashes.  The first time data is accessed for a given bucket, it automatically sets up the storage.

You can easily swap out the default caching mechanism for alternatives like using a dummy adapter for testing purposes or a custom file-based solution.  The `clear` method helps when the underlying storage location changes.

## Class PersistMeasureInstance

This class helps you save and retrieve trading measure data to a file, ensuring your data is handled reliably. It acts as a layer on top of the file storage, making sure writes happen completely or not at all, preventing corrupted data. 

You can mark entries as deleted without actually removing the file – this is called soft deletion and helps with data recovery if needed. When you list your data, the system automatically filters out any entries marked as deleted.

The `waitForInit` method ensures the underlying storage is ready before you try to work with it. The `readMeasureData` method retrieves a specific data entry; if the entry doesn’t exist or is marked as deleted, it returns nothing.  `writeMeasureData` saves a new entry, and `removeMeasureData` flags an entry for deletion. Lastly, `listMeasureData` provides a way to see a list of all existing (not deleted) entries.

## Class PersistLogUtils

This class helps manage how log data is saved and retrieved. It uses a single, persistent log instance that’s created only when needed. You can customize how logs are stored by providing your own log instance creator, essentially swapping out the default behavior.

The class reads and writes log entries, ensuring data is saved in a way that's safe even if the application crashes. Each log entry is stored as its own file, making updates and retrieval more manageable. 

It also offers quick ways to reset the log instance or switch to a dummy implementation for testing purposes. Changing directories, like when running different strategies, should prompt you to clear the existing log.

## Class PersistLogInstance

This component helps manage and store your backtesting logs to disk, ensuring data persistence even if your program crashes. It acts as a central place to keep track of your trading history and decisions.

Think of it as a special file that records each log entry as a separate JSON file, using a unique ID to identify each one. 

The system is designed to be safe; once a log is written, it cannot be changed. When you read the logs, it systematically looks at all available files. 

This implementation provides a simple and reliable way to keep your backtesting results secure and accessible.


## Class PersistIntervalUtils

This component handles tracking which intervals have already "fired" or been processed. It keeps records in a specific directory structure under `./dump/data/interval/` to indicate whether an interval has already run for a given combination of a "bucket" and a "key."

You can customize how these records are stored and managed by providing your own constructors. This lets you use different persistence methods like file-based storage or even a dummy implementation for testing purposes. 

The system lazily loads and initializes data for each bucket as needed, meaning it only loads the information it needs when it needs it.  You can retrieve, write, and delete these interval markers using provided functions. The `listIntervalData` function allows you to see all the non-deleted markers associated with a specific bucket. Finally, if your working directory changes during a backtest, you'll need to clear the internal cache to ensure accurate operation.

## Class PersistIntervalInstance

This class helps you reliably store and retrieve data related to specific time intervals, like when a trading strategy should execute. It's designed to work with files to keep everything persistent.

The `bucket` property defines where this data is stored. The system uses an internal storage mechanism (`_storage`) for the actual file operations.

You can use `waitForInit` to make sure the storage is ready before you start using it.

`readIntervalData` lets you get a specific interval marker, and it handles cases where the marker is missing or has been "soft deleted" by returning null.

`writeIntervalData` saves a new interval marker. 

If you need to temporarily disable an interval, `removeIntervalData` marks it as soft-deleted – it doesn't physically delete the file, but the system treats it as if it’s gone.

Finally, `listIntervalData` provides a way to go through all the active interval markers in the bucket, ignoring the ones that have been soft-deleted.

## Class PersistCandleUtils

This class helps manage how candle data (like open, high, low, close prices) is stored and retrieved from files. Think of it as a system for keeping a local, cached copy of your trading data.

Each candle is saved as a separate file, making organization easier. The system checks if the cached data is still valid before using it, and it automatically updates the cache if data is missing.  The reading and writing of these files happen in a way that prevents data corruption.

You can customize how the data is stored by swapping out the underlying storage mechanism – for example, using a different type of file storage or even using a dummy instance for testing.

The class also has a clear function to wipe out the current storage, which is handy if you're restarting your application or moving to a different working directory. Finally, it provides methods for switching back to the default file-based storage or using a dummy storage for testing purposes.

## Class PersistCandleInstance

This class helps you save and retrieve historical candle data, like open, high, low, and close prices, for a specific trading symbol and time interval. It stores each candle's information as a separate file, making it easy to manage and access.

Think of it as a simple database for your historical price data.

It's designed to be persistent, meaning your data isn't lost when your application restarts.

Here’s a breakdown of how it works:

*   **Initialization:** It needs to be initialized before you can read or write any data.
*   **Reading Data:** When you request candles, it checks if they’re available. If a candle is missing, it will treat this as a chance to refresh it. If a candle is found but is invalid, a warning is raised and it's treated as a miss.
*   **Writing Data:**  It only saves complete candles (those with a closing time in the past) and avoids overwriting existing data, ensuring a historical record. This means the cache is always in order and append-only.
*   **Underlying Storage:** This class manages the details of saving data to files. 
*   **waitForInit:**  Used to make sure the underlying storage is ready.
*   **readCandlesData:** Fetches a range of candles from the saved data.
*   **writeCandlesData:** Saves a set of candles to the file storage.

## Class PersistBreakevenUtils

This class helps manage and save breakeven data, ensuring it's reliably stored for your trading strategies. It's designed to work with different strategies and symbols, keeping track of the breakeven points for each.

Essentially, it handles the behind-the-scenes process of reading and writing this data to files, so you don't have to. The system uses a smart caching mechanism, creating a storage instance only when needed and reusing it for the same symbol and strategy combination.

You can even customize how the data is stored, either by using the default file-based approach or opting for a dummy instance that doesn't actually save anything - useful for testing. If you’re switching environments or need to refresh the stored data, you can clear the cache. This class takes care of safely saving and retrieving the breakeven information, making it a handy tool for keeping track of your trading progress.

## Class PersistBreakevenInstance

This class provides a way to store and retrieve breakeven data persistently, using files for storage. It's designed to be reliable, even if your program crashes unexpectedly.

The class is built to work with a specific trading symbol, strategy name, and exchange name, essentially creating a dedicated storage space for that combination. It uses a unique identifier (signalId) to pinpoint each individual piece of breakeven data.

Initialization is handled by `waitForInit`, which sets up the underlying storage.  You can then use `readBreakevenData` to fetch stored data or `writeBreakevenData` to save new or updated information.  This helps in keeping track of breakeven points over time, allowing for analysis and adjustments to your trading strategies.


## Class PersistBase

This class provides a foundation for storing and retrieving data to files in a reliable way. It handles file operations safely, ensuring that writes are completed fully and that corrupted files are detected and cleaned up. The class manages a base directory where your data files are stored and keeps track of the type of data being persisted.

It offers methods to read, write, and check for the existence of data, all while dealing with potential issues like file corruption or deletion failures.  You can easily get a list of all the data identifiers (IDs) being managed. The initialization process validates existing files and sets up the directory, and this only happens once. The file paths are constructed automatically based on the entity ID.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It essentially acts as a performance monitor.

It listens for timing signals emitted during your strategy's execution and records them, allowing you to identify potential bottlenecks and areas for optimization.

You can think of it as a way to profile your strategy's performance.

To start monitoring, you subscribe to the performance events.  This returns a function you can call later to stop the monitoring.

If you don't need to monitor performance anymore, you can unsubscribe to ensure you aren’t accumulating unnecessary data. The service handles ensuring only one subscription exists at a time. 


## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you understand how your trading strategies are performing. It listens for performance data and keeps track of key metrics for each strategy you're using. 

It automatically calculates statistics like average, minimum, and maximum values, providing a comprehensive overview. You can request a report that's formatted in Markdown, making it easy to read and share. 

This service also analyzes potential bottlenecks in your strategies, and it can save these reports directly to your disk. It manages storage for each strategy to keep data organized and separate. You can subscribe to receive performance updates, and unsubscribe when you no longer need them. Finally, it allows you to clear the accumulated data if you want to start fresh.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to collect and analyze performance data, allowing you to pinpoint areas for improvement.

You can retrieve detailed performance statistics for specific strategies and symbols, including counts, durations, averages, and percentiles. This data helps identify which parts of your strategy are taking the most time and exhibiting the most volatility.

It also lets you generate easy-to-read markdown reports that visually represent your performance metrics, making it simple to share results or document progress. 

Finally, you can save these performance reports directly to your file system for later review, with a sensible default location.


## Class PartialUtils

This utility class helps you analyze and understand your partial profit and loss data, particularly useful when backtesting or evaluating trading strategies. It provides easy ways to get aggregated statistics and generate detailed reports of your partial profits and losses.

You can retrieve summarized data like total profit/loss event counts for a specific symbol and strategy.

It also allows you to create markdown reports that clearly show all the partial profit and loss events, neatly organized into a table with details such as action type, symbol, strategy, price, and timestamp.

Finally, you can easily save these reports to files, automatically creating the necessary directory structure if it doesn't already exist, so you can share or preserve your analysis.

## Class PartialReportService

The PartialReportService helps you keep track of when your trading positions are partially closed, either with a profit or a loss. It listens for signals indicating these partial exits and saves details like the price and level at which they occurred into a database. 

Think of it as a meticulous record-keeper for your trading activity, specifically focused on those moments when you're not fully exiting a position.

You can tell it to start listening for these events using the `subscribe` method, which will return a function you can call to stop listening (`unsubscribe`).  It’s designed to prevent accidentally subscribing multiple times, ensuring your system doesn't get overwhelmed. If you're using a logging service, you can also set that up through the `loggerService` property.

## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on your trading performance, specifically focusing on profits and losses. It listens for profit and loss events happening during your backtests or live trading and keeps a record of them for each symbol and strategy you're using.

It automatically organizes these events and generates clear, readable markdown reports that you can save to your computer. These reports provide detailed information about each profit and loss event, along with overall statistics.

You can subscribe the service to receive these events, and when you're finished, you can unsubscribe. The `dump` function lets you save those reports as files, making it easy to review your progress and identify areas for improvement. It’s designed to keep data isolated for each combination of symbol, strategy, exchange, timeframe, and backtest to ensure accuracy and organization. The `clear` function offers a way to reset the accumulated data when necessary.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the system. Think of it as a gatekeeper that sits between your trading strategy and the underlying connection layer.

It keeps a record of all partial operations, like profits and losses, and provides a convenient place to log and monitor these activities. The service receives information from your strategy and passes it along to another component (PartialConnectionService) for the actual handling.

It’s injected into your trading strategy to ensure consistent management of partials. You won't directly interact with this service; it handles the details behind the scenes.

Key features include validation of your strategy and its associated configurations, and it uses caching to make sure validations aren't repeated unnecessarily.  The `profit`, `loss`, and `clear` functions are the primary methods used to track and reset partial states, all while maintaining a log of what's happening.

## Class PartialConnectionService

The PartialConnectionService manages how your trading system tracks profit and loss for individual signals. It's designed to efficiently handle a potentially large number of signals without consuming excessive resources.

Think of it as a smart factory that creates and manages "ClientPartial" objects, each responsible for tracking the P&L of a specific signal. It remembers these ClientPartial objects so it doesn’t need to recreate them every time, using a technique called memoization.

When a signal reaches a profit or loss threshold, this service handles the process: it either finds an existing ClientPartial or creates one, updates its state, and then alerts other parts of the system via event emissions. When a signal is closed out, this service cleans up the associated ClientPartial, ensuring nothing is left behind.

The service is injected into the core trading strategy to integrate with its functionality, and it utilizes other services for logging and managing actions within the trading environment. It makes sure things like profit calculations and clearing of positions are handled consistently for each signal.

## Class NotificationLiveAdapter

This component manages notifications related to your trading strategies. It's designed to be flexible, allowing you to easily swap out how notifications are handled, whether that's in memory, persistently to disk, or even as dummy notifications for testing.

The `NotificationLiveAdapter` acts as a central point for all notification events, like signal changes, profit/loss updates, and errors. It forwards these events to the currently configured notification backend.

You can quickly change the backend by using convenience methods like `useDummy`, `useMemory`, or `usePersist`. `useMemory` is the default, keeping notifications in the program's memory. `usePersist` saves them to a file, while `useDummy` effectively silences all notifications.

The `getInstance` property holds the currently active notification handler and it is created only once and cached for efficiency, but can be reset if the underlying environment changes (like when the working directory changes during a backtest).

The `handleSignal`, `handlePartialProfit`, `handleRisk`, and similar methods are the entry points for triggering notifications, and they simply pass the event data to the current notification backend. The `getData` method retrieves the stored notifications, while `dispose` clears them.

Finally, `useNotificationAdapter` lets you provide your own custom notification handler.  The `clear` method forces a recreation of the notification handling instance, which is particularly useful when the environment changes.


## Class NotificationHelperService

This service helps manage and send out notifications about important signals within the trading framework. It's like a central hub for ensuring that notifications are accurate and consistent.

It validates the strategy, exchange, frame, risk, and action configurations to make sure everything is set up correctly, and it cleverly remembers these validations so it doesn't have to repeat the work unnecessarily.

If you're working with `onActivePing` callbacks, you’ll use `commitSignalNotify` to actually trigger and send these notifications, bundling in details like the symbol, price, and relevant context. Think of it as the button you press to send out a signal notification after validating everything is in order. The service handles the rest, ensuring the notification reaches the right places.

## Class NotificationBacktestAdapter

This component helps you manage and send notifications during backtests, offering a flexible way to log important events. It acts as a central hub for various notification types like trade signals, profits, losses, and errors.

You can easily swap out different notification methods – it comes with built-in options for in-memory storage, persisting notifications to disk, or simply discarding them (a dummy option for testing). The `useMemory()`, `usePersist()`, and `useDummy()` functions make switching between these methods straightforward.

The `handleSignal()`, `handlePartialProfit()`, and similar functions are the entry points for various events, relaying them to the currently selected notification method.  `getData()` retrieves all stored notifications, while `dispose()` clears them.  If you need to use a custom notification method, the `useNotificationAdapter()` function lets you provide your own notification implementation. The `clear()` function is particularly useful when the working directory changes during a backtest.

## Class NotificationAdapter

The NotificationAdapter is the central hub for managing and accessing notifications, whether you're running a backtest or a live trading session. It automatically keeps track of notifications by listening for signals emitted by the trading system. 

This adapter ensures that you don't accidentally subscribe to the same signals multiple times, preventing unnecessary data duplication. It's designed to be easy to use – you can enable it to start receiving notifications, disable it to stop, and retrieve all the stored notifications for either backtest or live data. Finally, when you're finished, the `dispose` function cleans up and removes all stored notifications.


## Class MemoryLiveAdapter

This component acts as a central hub for managing your trading memory, allowing you to easily switch between different storage methods. It's designed to be flexible, letting you choose how your data is stored—whether it's in memory, persistently on your file system, or even discarded entirely for testing purposes.

You can quickly change the storage backend using convenient functions like `useLocal`, `usePersist` (the default, which saves data to files), `useDummy`, and `useMemoryAdapter` to integrate custom storage solutions.  The adapter keeps things organized by memoizing instances based on signal and bucket combinations, and you can clear these memoized instances with `disposeSignal` when signals are closed, or `clear` to refresh everything when your working directory changes.

The framework provides methods for writing, reading, searching, listing, and deleting memory entries, all structured around signal IDs and bucket names.  You'll use `writeMemory` to save data, `readMemory` to retrieve it, `searchMemory` to find specific entries using full-text search, `listMemory` to view all entries, and `removeMemory` to delete entries.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for your backtests. Think of it as a central point for how your backtest remembers and retrieves data.

It offers different storage options, like keeping everything in memory for speed, persisting data to files, or even using a dummy adapter to just discard data for testing. You can easily switch between these options with simple commands like `useLocal`, `usePersist`, or `useDummy`.

It intelligently caches data based on signal IDs and bucket names, which helps optimize performance. If you need to clear out old cached data, you can use `disposeSignal`.

There are methods for writing, searching, listing, removing, and reading data from memory, giving you full control over how your backtest interacts with stored information. For more complex setups, it also allows you to provide your own custom memory adapter implementations. The `clear` function is useful when the base path for file storage changes.

## Class MemoryAdapter

This component, the MemoryAdapter, acts as a central hub for managing how your backtesting and live trading environments store and retrieve data. It intelligently directs memory-related operations – writing, searching, listing, removing, and reading – to either the backtest or live memory system depending on the context.

To ensure efficient and clean operation, it automatically subscribes to signal lifecycle events to automatically clean up old data.  This subscription happens only once, preventing unnecessary overhead.

You can control the adapter's activity by enabling or disabling it, which manages those lifecycle subscriptions. It's safe to disable it multiple times without any issues.

The adapter provides methods for writing data to memory, searching through existing data using a powerful full-text search, listing all entries, removing specific entries, and reading individual entries. All these functions are aware of whether they're working within a backtest or live trading scenario, routing the request to the appropriate system.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced during trading simulations or live trading. It acts as a central place to gather information about those periods of significant loss.

You can think of it as a tool to create reports and get statistics about the worst performance of a trading strategy on a specific asset.

Specifically, it offers a few key functions:

*   **`getData`**: This gets a summary of max drawdown statistics, including things like the largest drawdown and when it occurred. You specify the asset, the trading strategy and context to get the data.
*   **`getReport`**: This function generates a detailed report in markdown format, listing all the maximum drawdown events.  You can choose which data points (columns) to include in the report.
*   **`dump`**:  Similar to `getReport`, this creates a markdown report but saves it directly to a file on your computer instead of displaying it in the console. Again, you can control what information appears in the report.

## Class MaxDrawdownReportService

This service is designed to track and record maximum drawdown events, which are crucial for evaluating trading strategy performance. It monitors for drawdown events and systematically saves this data to a report database in a JSONL format, ready for analysis.

The service relies on a `maxDrawdownSubject` to receive these drawdown notifications.

It also includes a handy way to ensure you only subscribe once – subsequent subscription attempts won’t re-subscribe, preventing unwanted behavior.

To stop the service from recording further drawdown events, you can unsubscribe, which effectively disconnects it from the data stream. 

The logged data includes detailed information about each drawdown event such as timestamp, symbol, strategy name, exchange, frame, signal ID, position, current price, and order parameters.


## Class MaxDrawdownMarkdownService

This service helps you create and save reports about maximum drawdowns, which are important for understanding risk in trading. It listens for drawdown events and organizes them based on the symbol, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown events, and unsubscribe to stop them.  It’s designed so you don’t accidentally subscribe multiple times.

The `getData` method retrieves the accumulated drawdown statistics for a specific combination of symbol, strategy, exchange, timeframe, and whether it's a backtest.  `getReport` generates a nicely formatted markdown report from those statistics, and `dump` writes that report directly to a file. 

Finally, there's a `clear` method to remove the accumulated data; you can either clear everything or just clear the data for a specific symbol/strategy/exchange/timeframe combination.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter provides a flexible way to manage and store markdown output from your backtesting process. It allows you to easily switch between different storage methods, such as saving each report as a separate file, accumulating everything into a single JSONL file, or completely disabling markdown output. You can customize the markdown adapter used by setting a custom constructor, ensuring that storage instances are unique and efficient. The adapter lazily initializes storage the first time data is written, simplifying setup. To write markdown data, simply call `writeData` with the appropriate content and options.

## Class MarkdownUtils

The MarkdownUtils class helps you control when and how markdown reports are generated for your trading activities. It lets you turn on or off report generation for different areas like backtesting, live trading, or performance analysis.

To use it, you’ll specify which report types you want active. When you enable a report type, it starts collecting data and generating markdown files – be sure to clean up (unsubscribe) when you’re done to avoid memory problems.

You can also disable individual report types to pause their generation without impacting others. If you only want to clear data, the `clear` method lets you reset the data collected for a particular report type, without stopping the reporting process itself. This allows for data resets while keeping reporting functionality active.

## Class MarkdownFolderBase

This adapter is designed to generate trading reports with each report saved as its own individual markdown file. Think of it as creating a well-organized folder full of readable reports. 

It’s the default choice for generating reports that you want to easily browse and review manually.

The adapter writes directly to files without managing any streams, making the process straightforward.

The name of each file is constructed using settings you provide, typically combining a base path and a unique file name.

You don’t need to do anything special to prepare this adapter for use – it's ready to go.

Essentially, the `dump` method takes your report content and saves it to a file based on the specified options, automatically creating any necessary directories.

## Class MarkdownFileBase

The MarkdownFileBase class helps you manage and write markdown reports in a structured way, specifically for backtesting and trading systems. It creates a single JSONL file for each type of markdown report, making it easy to process and analyze your data later using standard JSONL tools.

Think of it as a centralized logging system for your markdown reports.

It handles the technical details like creating directories, managing the writing process (even when things get busy), and ensuring writes don't take too long. You can also easily filter these reports by things like the trading symbol, strategy, or exchange used.

The `dump` method is your primary way to add markdown content; it takes the markdown text and adds important metadata like timestamps and search tags to each line.  Initialization is handled automatically and safely, so you don't need to worry about manual setup.


## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility and efficiency. It lets you easily switch between different storage methods without changing your core code. 

You can choose to store your markdown as individual files, each in its own .md file, or append everything to a single .jsonl file. 

There’s even a “dummy” adapter for testing purposes, which prevents any actual data from being saved. The system only creates one storage instance for each type of markdown, preventing unnecessary overhead. It also delays creating storage until the first time you need to write data, optimizing performance.

## Class LookupUtils

The `LookupUtils` class acts like a central record keeper, tracking all currently running backtests and live trading sessions. It maintains a list of these activities, noting when they start and when they finish. 

This tracking helps manage resources and optimize performance, particularly concerning how data is handled during backtesting.

You don't need to create an instance of `LookupUtils`; it’s available as a singleton.

Here's a breakdown of what it does:

*   **Adding Activities:** When a backtest or live run begins, information about it is added to the registry. If you try to add the same activity again, it simply updates the existing entry.
*   **Removing Activities:** When a backtest or live run concludes (successfully or with an error), the registry is updated to remove the activity.  It’s important to always remove activities to avoid leaving outdated information.
*   **Listing Activities:** The system can request a snapshot of all the active backtests and live runs at any given time.



Essentially, it provides a way to monitor and control the status of ongoing trading activities.

## Class LoggerService

The LoggerService helps ensure consistent and informative logging throughout your trading strategies and backtests. It acts as a central point for logging, automatically adding important details to each message, like which strategy, exchange, or frame is being used, and relevant execution context such as the symbol being traded and the time of the trade.

You can configure a custom logger to use, or it will fall back to a basic "no-op" logger if you don't set one. The service provides methods for different logging levels like general messages, debug information, warnings, and more. The `setLogger` method is your way to plug in your preferred logging mechanism.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage log messages within your backtesting environment. Think of it as a central hub for all logging activities, allowing you to easily swap out different logging methods without changing your code. It defaults to storing logs in memory, but you can switch to persistent storage on disk, a dummy adapter that essentially ignores logs, or a JSONL file adapter for detailed record keeping.

The adapter uses a factory system, and to keep things efficient, it remembers the current logging method for reuse. The `clear` method is handy when your working directory changes, ensuring a fresh logging setup. You can use `log`, `debug`, `info`, and `warn` to record different types of information, and `getList` to retrieve all stored logs. It also allows setting a custom logging implementation through `useLogger` if you have unique requirements.

## Class LiveUtils

The `LiveUtils` class simplifies live trading operations and provides tools for managing live strategies. It offers features like crash recovery, real-time status updates, and convenient methods for interacting with live trading instances.

You can easily start live trading for a specific symbol and strategy using the `run` method, which acts like an infinite generator that automatically handles potential crashes and data recovery.  There's also a `background` method for running live trades silently without directly receiving their results, useful for things like persistence or callbacks.

Need to know the current signal or position details? `getPendingSignal`, `getTotalPercentClosed`, `getPositionEffectivePrice`, and related methods provide access to essential data.  You can also check if signals are active with `hasNoPendingSignal` and `hasNoScheduledSignal`.

Managing positions is straightforward with functions like `commitPartialProfit`, `commitTrailingStop`, and `commitAverageBuy`, allowing you to adjust stop-loss levels, take-profit targets, and add DCA entries.  The class also offers utilities for generating reports (`getReport`, `dump`) and listing active trading instances (`list`). Finally, `commitClosePending` allows you to shut down a live trade immediately, while `commitCancelScheduled` can cancel a signal without halting the process.


## Class LiveReportService

The LiveReportService helps you keep a detailed record of what your trading strategy is doing in real-time. It's designed to capture every stage of a trade – from when it’s just waiting for an opportunity to when it’s finally closed – and save that information to a database.

Think of it as a live logbook for your strategy, providing valuable insights into its performance.

It connects to your trading system and listens for signals, then automatically records each event like when a trade is initiated, is active, or is closed. 

You can easily subscribe to start receiving these live events and unsubscribe when you're done. Importantly, it prevents you from accidentally subscribing multiple times.


## Class LiveMarkdownService

This service helps you automatically create reports documenting your live trading activity. It keeps track of everything that happens during your trades – from when a strategy is idle to when positions are opened, active, and eventually closed.

The service generates easy-to-read markdown tables summarizing these events and provides useful trading statistics like win rate and average profit/loss. These reports are saved as files, making it simple to review your strategy's performance over time.

You tell the service to start watching your strategy's ticks, and it takes care of the rest. It uses a system to isolate data for each trading combination you set up, so your reports stay organized. There's also a way to stop the service from tracking data when you no longer need it.

You can request data, generate reports, save them to disk, or even completely clear the accumulated data if needed. You can customize what information is included in the report.

## Class LiveLogicPublicService

LiveLogicPublicService helps manage live trading operations, handling things like automatically passing along information about the trading strategy and exchange being used.

It's designed to continuously run – think of it as a never-ending stream of trading updates – and is built to recover from crashes, ensuring your trading doesn't lose progress.

The `run` method is its core function. It takes a symbol (the asset being traded) and some context information.

It then streams data back to you, delivering signals related to opening, closing, or canceling trades.

Essentially, it simplifies the process of running and monitoring live trades by taking care of context management and recovery.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, continuously monitoring and reacting to market conditions. It operates as an infinite loop, constantly checking for new signals and processing trades.

The system builds its timeline using the current date and time to ensure accuracy. It delivers results – specifically, when trades are opened or closed – in a memory-efficient, streaming format. 

If the process encounters an issue and needs to restart, it automatically recovers the trading state, so you don’t lose progress. The `run` method is the key entry point, taking a symbol as input and returning an async generator that streams those trading results.

## Class LiveCommandService

This service lets you interact with live trading features within the backtest-kit framework. It's a central point for accessing live trading functionality and is designed to be easily used when you're setting up your application's dependencies.

Essentially, it acts as a bridge, wrapping another service to make things cleaner and easier to manage.

Here's a breakdown of what it provides:

*   **`run()` method:** This is the key to running live trading. You tell it which symbol (like a stock ticker) you want to trade and provide some context like the strategy and exchange names.  It continuously generates results – a stream of data about how the trading is progressing, including when a trade opens, closes, or is canceled. If things go wrong, it attempts to recover and keep the trading going, making it quite resilient. 
*   **Various validation services:** It includes services for validating strategies, exchanges, risk factors, and actions – these help ensure everything is set up correctly before trading begins.
*   **Logging:** It has a built-in logger service to track events and help with debugging.

## Class IntervalUtils

IntervalUtils helps you control how often functions are executed, particularly in trading strategies where you want to avoid overwhelming the system. Think of it as a way to ensure a task runs only once within a defined time period, like once per minute or once per hour. 

There are two main ways to use it: in-memory, where the information is stored in the program’s memory, or file-based, where it persists even if the program restarts. The file-based version is particularly handy for strategies that need to remember whether a function has already run, even after a system reboot.

It's accessed through a single, easy-to-use instance named `Interval`. 

You can manage these function executions using methods to clear out old data or reset counters, which is useful when your environment changes. Essentially, it provides a clean way to manage tasks and ensure they don't run unnecessarily.


## Class HighestProfitUtils

This class helps you understand and analyze the highest profit moments achieved during your trading simulations or live trading. Think of it as a tool to review and gain insights from when your strategies performed exceptionally well.

It provides a few key functions:

*   **getData**: This function lets you pull out specific statistical information related to the highest profit events for a particular trading strategy and symbol. It returns a detailed data model containing various statistics.
*   **getReport**: This is your go-to for creating a readable markdown report that summarizes all the highest profit events for a specific strategy and symbol.  You can also customize which pieces of information are included in the report.
*   **dump**:  If you want to permanently save that markdown report, this function will do it for you, writing the report to a file.  You can specify the file path where you want the report saved.

Essentially, this utility class gives you the tools to examine and document your most profitable trading moments.

## Class HighestProfitReportService

This service is designed to keep track of and record the highest profit events achieved during a trading backtest. It actively monitors a data stream, specifically `highestProfitSubject`, and whenever a new highest profit record is detected, it creates a detailed log entry.

These log entries, formatted as JSONL, contain a wealth of information about the profitable trade, including timestamps, the traded symbol, the strategy used, the exchange, the timeframe, and details of the signal that triggered the trade – like its ID, position, current price, and original order parameters (take profit and stop loss).

To begin tracking these events, you need to subscribe to the `highestProfitSubject`.  Importantly, subscribing only happens once; subsequent attempts simply return the same unsubscribe function.  To stop the service from logging further profit records, you must call the unsubscribe function that was returned when you initially subscribed.

## Class HighestProfitMarkdownService

This service helps generate and store reports about the highest profit achieved in your trading strategies. It listens for data about those profits and organizes them based on the symbol, strategy, exchange, and timeframe you're using.

You can subscribe to receive profit data, and the system ensures you don't accidentally subscribe multiple times.  Unsubscribing completely stops data collection and clears everything.

The `tick` method handles each incoming profit event, carefully categorizing it for storage.

You can request specific data—like the highest profit statistics for a particular symbol and strategy—or generate a full report in Markdown format. The report includes a table of recent events and a total count.

It can also write these reports directly to files, naming them according to the symbol, strategy, exchange, timeframe, and whether it's a backtest or live trade.

Finally, you can completely clear all accumulated data or selectively clear data for a single symbol/strategy/exchange/timeframe combination, effectively resetting the system for that specific scenario.

## Class HeatUtils

HeatUtils offers a simple way to create and manage portfolio heatmaps for your trading strategies. Think of it as a tool that gathers performance data – like profit, risk metrics, and trade counts – for each symbol your strategy has traded. It then organizes this data into a clear, visual report, typically in Markdown format.

You can easily retrieve this aggregated data using `getData`, which combines statistics from all closed trades for a specific strategy.

The `getReport` function builds a readable markdown table summarizing this portfolio performance, allowing you to quickly identify your top and bottom performers. You can also specify which columns to include in the report.

Finally, `dump` lets you save these reports directly to your hard drive, creating organized records of your strategy’s past performance.  The report is saved as a Markdown file, named after your strategy, for easy sharing or archiving.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when signals close and generate profit or loss. It listens for these "closed signal" events across all your symbols and saves the details to a database. 

This service focuses specifically on closed signals – those that have resulted in a profit or loss. 

To use it, you'll subscribe to receive these signal events, and when you're done, you can unsubscribe to stop the service.  The subscription process prevents accidental multiple registrations.  The stored data is then used to create heatmaps, giving you a portfolio-wide view of your trading activity. A logger helps with debugging, and a tick object handles processing and logging the closed signals.


## Class HeatMarkdownService

This service creates a visual heatmap of your trading activity, aggregating data across all symbols and strategies. It’s designed to give you a quick, at-a-glance understanding of how your portfolio is performing.

The service listens for updates about closed trades. It then calculates key metrics for each individual symbol like total profit/loss, Sharpe Ratio, and maximum drawdown, as well as portfolio-level aggregates.

You can request these statistics using the `getData` method, which provides a snapshot of the aggregated data, or generate a nicely formatted markdown report with `getReport` or save it to a file with `dump`. 

To reset the data, use `clear`— you can clear all data or target specific exchanges, frames, or backtest modes. The service also handles potential errors gracefully, especially mathematical ones, preventing issues like `NaN` or `Infinity` from breaking the calculations. Finally, subscribing to receive updates is managed through the `subscribe` and `unsubscribe` methods, ensuring you only receive the data you need and can stop when you choose.


## Class FrameValidationService

This service helps you keep track of and confirm your trading timeframe configurations. Think of it as a central place to register and check if your timeframes are set up correctly. 

It allows you to add new timeframes, ensuring they’re known to the system.

Before you try to use a timeframe in your backtest, you can use this service to verify it actually exists and is properly defined, which prevents errors. The service is designed to be efficient by remembering previous validation results. 

Finally, you can easily get a complete list of all the timeframes you’ve registered.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas, which are essentially blueprints for your trading strategies. It's designed to be type-safe, ensuring your schemas are consistent.

You can think of it as a central place to register and manage these schemas.

To add a new schema, use the `register` method. If a schema already exists, you can update it using the `override` method to change specific parts of it.

If you need to access a schema, simply use the `get` method, providing the schema's name.

Before a schema is added, it’s checked using `validateShallow` to make sure it has all the necessary properties and they are of the expected type. This helps catch errors early.

## Class FrameCoreService

FrameCoreService is a central tool for managing timeframes within the backtesting process. It handles the creation of these timeframes, essentially providing the sequence of dates that your trading strategy will be tested against. Think of it as the engine that delivers the historical data for your backtest. It relies on other services to manage the connections and validation of this data. The `getTimeframe` function is its key feature – you use it to request a specific set of dates for a particular asset, which are then used as the basis for your backtest runs.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames. It intelligently routes your requests to the correct frame implementation based on the active context. 

To improve performance, it remembers previously created frames, so you don't have to recreate them every time. This service also handles the timeframe associated with a frame, defining the start and end dates for backtesting.

When operating in live mode, there are no frame constraints, and the `frameName` will be an empty string.

The `getFrame` function is the primary way to obtain a frame; it creates one if it doesn't already exist and caches it for later use. The `getTimeframe` function allows you to retrieve the specific dates used for backtesting a given symbol and frame.

It relies on several services: a logger for tracking activity, a schema service for defining frame structures, and a method context service to determine the active frame.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they’re set up correctly before you start trading. It acts like a central directory, letting you register new exchanges and quickly confirm that an exchange exists when you need it. 

To help things run smoothly, it caches validation results so you don’t have to repeatedly check if an exchange is valid. You can add exchanges using `addExchange`, verify their existence with `validate`, and get a complete list of registered exchanges using `list`. Essentially, it's a tool for organizing and verifying your exchange configurations, preventing potential issues down the line.

## Class ExchangeUtils

ExchangeUtils helps you interact with different exchanges in a consistent way. It acts as a central hub, ensuring that requests to exchanges are handled correctly and validated.

Think of it as a helper that simplifies retrieving data like candles, average prices, and order books from exchanges. It’s designed to be easily used throughout your trading strategies.

Here's what it can do:

*   It can fetch historical candle data for a specific trading pair, automatically calculating the right timeframe.
*   It calculates the VWAP (volume-weighted average price) based on recent trades.
*   It can retrieve the closing price of the most recent candle.
*   It formats trade quantities and prices to match the specific rules of each exchange, preventing errors.
*   It fetches order books and aggregated trades.
*   It retrieves raw candle data with more control over the date range and number of candles.

Importantly, this utility operates as a single, shared instance, making it very convenient to use within your backtesting framework.

## Class ExchangeSchemaService

This service helps you keep track of and manage the information about different cryptocurrency exchanges. It's designed to be reliable and type-safe, ensuring the data you're using is consistent.

You can add new exchange details using `addExchange()`, and find them later by their name using `get()`.

Before adding a new exchange, `validateShallow()` checks that it has all the necessary information and the correct format. 

If an exchange already exists in the system, you can update specific parts of its details using `override()`. 

The service uses a registry to store these exchange schemas, and relies on other supporting services to log activity.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the trading framework. It combines the connection to the exchange with the ability to inject important contextual information like the symbol being traded, the precise time of the trade, and whether it’s a backtest or live environment. 

It handles tasks like retrieving historical price data (candles), obtaining future price data specifically for backtesting, calculating average prices, and fetching order book information. 

This service also provides methods for formatting prices and quantities, ensuring consistency and accuracy based on the trading context.  It's designed to simplify common exchange operations and ensure the correct parameters are passed to the exchange for both historical analysis and real-time trading. The validation process for the exchange is optimized to avoid unnecessary repetition.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently directs requests to the correct exchange implementation based on the current context. To optimize performance, it remembers (caches) frequently used exchange connections, so you don't have to repeatedly create them.

This service provides a comprehensive set of methods for retrieving market data, including historical and future candles, average prices, order books, and aggregated trades. It handles formatting prices and quantities to match the specific rules of each exchange, ensuring compatibility and accuracy.

Key functionalities include fetching candles, retrieving average prices (differing between backtesting and live modes), and accessing order book and trade data. It intelligently routes requests using the currently configured exchange based on the execution context, providing a unified and consistent interface for all exchange operations. You can also request raw candle data with specific date ranges.

## Class DumpAdapter

The DumpAdapter helps you save important data generated during your backtesting process. Think of it as a flexible system for capturing information like messages, records, tables, text, errors, and JSON objects. By default, it saves this data as individual Markdown files, organized by signal ID, bucket name, and a unique identifier.

You have options for where this data is stored: you can choose to keep it in memory, discard it entirely (useful for testing), or even plug in your own custom storage solutions.  Before using it, you need to activate the adapter; afterwards, you can deactivate it.

The adapter keeps track of its instances to avoid memory issues and clears these when a signal is cancelled. It’s also designed to handle changes in your working directory, ensuring that it uses the correct file paths for saving data. You can clear all the cached instances by calling the `clear` method.

## Class CronUtils

The `CronUtils` class provides a way to schedule tasks that run at specific intervals, especially useful when running multiple backtests in parallel. It ensures that these tasks fire only once, even if multiple backtests attempt to execute them simultaneously.

Think of it as a traffic controller for scheduled events, making sure each task runs exactly once, even if several tests are trying to run it at the same time.

Here's a breakdown of how it works:

*   **Registration:** You register tasks with names and intervals.  If you register the same name again, the previous entry is replaced, but any handlers currently running for that name will complete first.

*   **Single-Shot Coordination:** This is key. When multiple backtests try to trigger the same task at the same time, `CronUtils` makes sure only one handler actually runs.  The others wait.

*   **Watermark Feature:** It tracks the last boundary reached, preventing tasks from being triggered multiple times on the same interval, even if virtual time jumps around.

*   **Memory Management:** It includes utilities to clean up old entries to free up memory, though this doesn't impact correctness – it’s more about performance.

*   **Lifecycle Integration:** It can be enabled to automatically integrate with backtesting lifecycle events like start, idle time, and scheduled tasks, so you don't need to manually wire everything.

*   **Complete Reset:** There's a `dispose` function that completely wipes all registered tasks and lifecycle hooks, useful for completely clearing the system.

## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages designed to help manage your trading strategies using a Kelly Criterion-inspired approach with risk decay. It’s focused on setting Take Profit (TP) and Stop Loss (SL) levels that adapt based on how far the price has moved towards its ultimate goal.

Think of it as having multiple checkpoints along the way.

For example, TP_LEVEL1 triggers when the price reaches 30% of the total distance to your final profit target, allowing you to lock in a smaller profit quickly. TP_LEVEL3 triggers closer to the end, at 90% of the distance, ensuring nearly all profits are secured.

Similarly, SL_LEVEL1 is an early warning at 40% of the way to your potential loss, helping to minimize risk, while SL_LEVEL2 at 80% ensures you exit completely before a major downturn. 

These percentages are fixed values within the class and designed to be used as reference points for determining when to adjust your position.

## Class ConfigValidationService

The ConfigValidationService is like a safety net for your trading setup. It meticulously checks your global configuration parameters to make sure everything is mathematically sound and designed to actually make money. 

It verifies that percentages like slippage and fees are non-negative, ensuring you’re not unintentionally losing money. It also makes sure your take-profit distance is large enough to cover those costs, guaranteeing a profit when your target is reached.

Beyond the basics, it ensures relationships between parameters make sense – like stop-loss distances being properly ordered – and that time-related settings and candle data requests are reasonable. Essentially, it's designed to catch potential errors before they impact your backtesting results.

## Class ColumnValidationService

This service, ColumnValidationService, helps keep your column configurations clean and reliable. It ensures that each column definition follows a specific set of rules, preventing common errors and making your data more consistent.

Essentially, it checks if all your column definitions have the necessary information – a key, a label, a format, and visibility settings – and verifies that these values are of the correct type and unique where they need to be. Think of it as a safeguard against typos or incorrect configurations that could cause problems later on. 

The service performs this validation on your column configurations and flags any issues it finds. It uses a logger service to record any validation problems encountered.

## Class ClientSizing

The ClientSizing class helps determine how much of an asset to trade in each situation. It provides several ways to calculate position sizes, including fixed percentages, Kelly criterion, and using Average True Range (ATR). You can also set limits on the minimum or maximum position size and a percentage of your capital that can be used for any single trade. 

It’s designed to work alongside your trading strategy, and it even allows for custom callbacks so you can validate the sizing or log the results.

The `calculate` method is the core function – it takes input parameters and returns the calculated position size.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring they don't exceed pre-defined limits. It acts as a central control point for portfolio-level risk, preventing signals that could lead to unwanted exposure.

Think of it as a gatekeeper that validates trading signals before they're executed. It can restrict the total number of simultaneous positions and allows for custom risk checks, giving you fine-grained control. Multiple strategies can share the same ClientRisk instance, which enables cross-strategy risk analysis and coordinated risk management.

The ClientRisk system tracks active positions using a map that dynamically updates. This map helps determine if a new signal should be allowed. There’s an initialization process, and it attempts to persist the active positions (though this is skipped during backtesting).

The `checkSignal` method is the core validation process, examining signals against configured rules and providing callbacks for both allowed and rejected signals. `checkSignalAndReserve` is a specialized, thread-safe version that secures a place in the position map *before* validation, preventing race conditions when strategies run concurrently. It's important to follow up on a successful `checkSignalAndReserve` with either adding the signal (`addSignal`) or removing the placeholder (`removeSignal`).

Finally, `addSignal` is used to register a newly opened position, while `removeSignal` cleans up when a position is closed, ensuring the risk map remains accurate.

## Class ClientFrame

The ClientFrame helps generate the timeline of data your backtest will use. Think of it as creating a schedule of when your trading decisions will be made.

It's designed to efficiently create these timelines, avoiding unnecessary repetition by remembering previously generated timelines.

You can customize how far apart these timeline points are, from short intervals like one minute to longer ones like a day. 

It also allows you to add custom checks or record important events during this timeline creation.  Essentially, it's a core component that ensures your backtest runs smoothly through the historical data. The `getTimeframe` property is the main function you'll use to actually generate this timeline for a specific asset.

## Class ClientExchange

The `ClientExchange` class acts as a bridge, providing a way to access and format exchange data for your backtesting framework. It handles fetching historical and future candle data, calculates VWAP prices, and formats prices and quantities according to exchange-specific rules. Think of it as a standardized interface for interacting with different exchanges.

You can use it to retrieve candles from the past (`getCandles`) or into the future (`getNextCandles`), which is particularly useful for simulating trades in a backtest. It also offers a method to calculate the Volume Weighted Average Price (`getAveragePrice`) based on recent trading activity.

Beyond just data retrieval, the `ClientExchange` also helps with presentation.  `formatPrice` and `formatQuantity` ensure that data is displayed in the correct format for the specific exchange you are working with. 

The `getRawCandles` method is powerful, allowing for flexible candle fetching with custom start and end dates and limits, all while carefully preventing look-ahead bias. Finally, it provides functionalities to retrieve order book data (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), ensuring the framework gets the information it needs to simulate realistic trading conditions. The entire class is designed to be efficient and prevent common issues like look-ahead bias.

## Class ClientAction

The `ClientAction` class is designed to manage and execute custom action handlers within the backtest-kit framework. Think of it as a central hub that brings together your custom logic with the core trading engine. It sets up and manages the lifecycle of these handlers, ensuring they're initialized only once and properly cleaned up when they're no longer needed.

It routes different types of events – signals from live or backtesting, breakeven updates, profit/loss milestones, and ping activity – to the appropriate methods within your action handler. This allows you to easily incorporate things like logging, notifications (via Telegram, Discord, or email), and analytics into your trading strategy. 

The `waitForInit` and `dispose` methods use a special pattern to guarantee that initialization and cleanup only happen once.  The `signalSync` method provides a crucial gate for managing positions using limit orders, ensuring any errors are handled appropriately. Essentially, `ClientAction` provides a structured way to plug in your custom functions to respond to various trading events.

## Class CacheUtils

CacheUtils helps you automatically store and reuse the results of your functions, making your trading strategies run faster and more efficiently. It acts as a central helper, making sure each function gets its own dedicated caching space.

The `fn` method is the main tool: it lets you wrap any function so it remembers its previous results based on time intervals. This is perfect for calculations that depend on historical data.

If your functions work asynchronously, the `file` method provides persistent caching – results are read from and written to disk, acting like a memory that lasts beyond the program's run. This is especially helpful for long-running tasks.

Sometimes you need a fresh start for your caching. `dispose` lets you completely remove the cached data for a specific function, forcing it to recalculate.  `clear` resets all caching, which can be useful when your working directory changes. Lastly, `resetCounter` ensures file indices are reset if your working directory shifts.


## Class BrokerBase

This `BrokerBase` class is your starting point for connecting your trading strategy to a real exchange. Think of it as a template you customize to interact with platforms like Binance, Coinbase, or your own proprietary system. It handles the low-level details of sending orders, managing stop-loss and take-profit levels, and tracking your positions.

It comes with pre-built "no-op" functions that simply log what’s happening, meaning you only need to override the functions that are specific to your exchange's API. You'll customize this class to place orders, track position changes, and send notifications—whether that’s via Telegram, Discord, email, or a database.

The initialization process happens within the `waitForInit()` method, where you'll connect to your exchange and authenticate.  Then, as your trading strategy runs, various event methods will be triggered:

*   `onSignalOpenCommit`: Used when opening a new trade.
*   `onSignalCloseCommit`: Used when closing a trade completely.
*   `onPartialProfitCommit`, `onPartialLossCommit`: Used for taking partial profits or limiting losses.
*   `onTrailingStopCommit`, `onTrailingTakeCommit`: Used to adjust stop-loss and take-profit levels dynamically.
*   `onBreakevenCommit`: Used to move the stop-loss to the entry price.
*   `onAverageBuyCommit`: Used when adding a new buy order in a DCA strategy.

You don't need to handle event handling in backtest mode, as it's automatically skipped.  There's no explicit cleanup process - any necessary teardown should happen within `waitForInit()` or handled externally.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper for interactions with your broker, ensuring that all trading actions are handled safely and consistently. It sits between your trading logic and the actual broker connection.  Think of it as a transaction manager – if anything goes wrong during a trade, it prevents changes to your core data.

During backtesting, these broker interactions are skipped entirely to speed things up. When you're live trading, the `BrokerAdapter` forwards the information to your actual broker connection.

Here's what it does:

*   **Connects to your broker:** You register your broker adapter using `useBrokerAdapter`.
*   **Handles key trading actions:** It intercepts and controls common actions like opening/closing signals, setting profit/loss targets, trailing stops, take profits, breakeven points, and average buy entries, before applying them.  If an error occurs during any of these actions, the trade doesn’t actually happen.
*   **Manages Events:**  Automatically passes opening and closing signal events to your broker.
*   **Enables/Disables Connection:** `enable()` activates the connection, while `disable()` disconnects. `clear()` resets the broker connection, useful if you’re switching between different environments (like different test folders).
*   **Lazy Initialization:** The connection to your broker isn't created until it's actually needed, and it's cached to avoid unnecessary work.

## Class BreakevenUtils

The BreakevenUtils class helps you analyze and report on breakeven events in your trading system. Think of it as a central place to gather and present information about when your trades reached their breakeven points.

It gathers data from breakeven events and provides tools to view that data in different ways.

You can retrieve statistical summaries of breakeven events to understand trends and patterns.
It can create detailed markdown reports that show individual breakeven events in a table, including key details like symbol, strategy, entry price, and when they occurred.
Finally, you can easily save these reports to files for later review or sharing. This is especially useful for documenting backtest results or tracking performance.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It's designed to listen for these "breakeven" moments and record them, including all the relevant details about the signal that achieved it. 

Think of it as a dedicated reporter for your profitable trades – it makes sure you don't miss any significant milestones.

To get it working, you'll use the `subscribe` method to connect it to your signal source. This also prevents accidental duplicate subscriptions.  When you’re done monitoring, use the `unsubscribe` method to stop the service. This ensures your resources aren't unnecessarily used. The `tickBreakeven` property handles the actual processing and logging of these breakeven events to a database. A logger service is also integrated to help you debug if needed.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports detailing breakeven events for your trading strategies. It listens for breakeven signals and organizes the information received for each symbol and strategy you're tracking. 

The service generates clear, readable markdown tables that summarize these events, including statistics like the total number of breakeven occurrences. These reports are then saved as files, making it easy to review and analyze your strategy's performance.

You can subscribe to receive these signals and unsubscribe when you no longer need them. The service manages the data storage effectively, ensuring each combination of symbol, strategy, exchange, frame, and backtest has its own isolated space. 

Functions are provided to retrieve data and reports, and to clear the accumulated data—either for a specific combination or everything at once. Finally, the service automatically saves the generated reports to disk, organizing them in a dedicated directory.

## Class BreakevenGlobalService

This service, the BreakevenGlobalService, acts as a central point for managing and tracking breakeven calculations within the system. It's designed to be a single place where strategies can access these calculations, making the overall architecture cleaner and more organized.

Essentially, it sits between the strategies and the actual connection layer that handles the breakeven logic. Every time a breakeven calculation happens, it's logged here first, offering a clear audit trail of what's going on.

The service relies on several other services (like validation and schema services) to ensure everything is set up correctly, and it gets these dependencies from the system's dependency injection container. It delegates the heavy lifting – creating and managing the ClientBreakeven – to a separate connection service.

You’ll find it injected into the ClientStrategy with specific parameters. The `check` function decides if a breakeven should trigger, and the `clear` function resets the breakeven state when a signal ends. These actions are always logged through this global service before being passed on to the connection service.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for your trading signals. It keeps track of these calculations, creating a special object for each signal to avoid redundant work. 

Think of it as a smart factory: it builds and manages these signal-specific breakeven objects, ensuring they’re properly set up with logging and notification capabilities. 

It’s designed to work alongside other parts of the system, automatically creating and cleaning up these breakeven objects as signals are used and closed. The service is key for keeping track of your trading strategy's performance and risk.

Here's a quick rundown of what it does:

*   It creates and caches a breakeven tracking object for each signal.
*   It handles the actual calculations and checks for breakeven conditions.
*   It cleans up when signals are no longer needed, preventing memory issues.
*   It integrates with logging and event systems to keep you informed.

## Class BacktestUtils

This class provides helpful tools for running and analyzing backtests within the framework. It acts as a central point for common backtesting operations, simplifying tasks like starting tests and retrieving data.

You can easily run backtests for specific symbols and strategies, or execute them in the background for tasks like logging without immediate feedback.  It also allows you to check for the existence of pending or scheduled signals, and calculate important metrics like position cost, potential profit, and time remaining.

The framework provides several methods to manipulate an active position – partially closing it, adjusting stop-loss or take-profit levels, or moving the stop to breakeven. This makes it easy to experiment with different risk management strategies during backtesting.

Finally, this class can generate comprehensive reports, export data, and list currently running backtest instances for monitoring and analysis. It's designed to be a convenient resource for anyone working with backtests.


## Class BacktestReportService

The BacktestReportService is designed to keep a detailed record of what's happening during your backtests. It listens for signals generated by your trading strategies and saves information about them—when a signal is idle, when it’s opened, active, or closed—into a database. 

Think of it as a way to create a logbook for your backtests. 

You can use this log to analyze how your strategies performed and to find any bugs or unexpected behavior. 

To use it, you'll subscribe to receive these signals, and then you can unsubscribe when you’re finished. The system prevents accidentally subscribing multiple times, ensuring efficient operation.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports detailing the performance of your trading strategies during backtesting. It listens for updates as your strategies trade, carefully recording how each trade closes. 

It organizes this information, building tables that show detailed signal information. These reports are then saved as markdown files, making them easy to read and share, located in the logs/backtest directory.

The service uses a clever storage system that keeps data separate for each symbol, strategy, exchange, timeframe, and backtest run, ensuring that your reports are accurate and organized.

You can request data, generate reports, or clear out old data as needed. It also provides ways to subscribe to and unsubscribe from real-time updates during backtesting.

## Class BacktestLogicPublicService

This service helps you run backtests, handling the behind-the-scenes details of managing context. It simplifies the backtesting process by automatically providing information about your strategy, exchange, and data frame to the various functions used during the test.

The `BacktestLogicPublicService` relies on a private service to perform the actual backtesting logic.

It also includes services for handling time, frame schemas, and exchange connections.

The `run` method is the main way to start a backtest. You tell it which symbol to test and the name of the strategy, exchange and data frame you are using, and it will stream back the results, taking care of passing along all necessary context.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService handles the complex process of running a backtest, particularly when dealing with asynchronous operations. It works by first retrieving the timeframes from a frame service, then processing each timeframe one at a time.

When a trading signal appears (e.g., a buy or sell opportunity), the service fetches the necessary historical price data (candles) and executes the backtest logic. It then pauses the process until that signal is resolved (closed).

Importantly, the service delivers results in a stream, meaning it doesn't store everything in memory at once – this is efficient for backtests involving large datasets. You can also stop the backtest early if needed.

The `run` method is the main entry point; you provide a symbol (like "BTCUSDT"), and it returns an async generator that yields results representing the tick results - opened, closed, cancelled or scheduled. The service relies on other core services for managing things like logging, strategy execution, exchange interactions, frame management, action execution and context.

## Class BacktestCommandService

The BacktestCommandService acts as a central point for running backtests within the system. It provides a straightforward way to access and execute backtesting operations, essentially simplifying how you trigger and manage backtest processes.

It relies on several other services for its work, including logging, schema handling, validation of risk, actions, strategies, exchanges, and frames. These services ensure that the backtest is properly configured and adheres to the defined rules.

The core functionality lies in the `run` method, which allows you to initiate a backtest for a specific trading symbol. When you run a backtest, you also provide information about the strategy, exchange, and frame being used, which helps contextualize the simulation. The method returns a series of results, detailing the outcomes of each tick, including scheduled, opened, closed, and cancelled orders.

## Class ActionValidationService

The ActionValidationService helps keep track of your action handlers—those pieces of code that respond to different events or actions in your system. Think of it as a central place to register and confirm that your handlers are properly set up. 

You can use it to add new action handlers using `addAction`, essentially telling the service about a new handler and its configuration.  Before you actually use a handler, `validate` makes sure it's there, preventing errors later on. 

To speed things up, the service remembers the results of previous validations – this is called memoization – so it doesn’t have to repeatedly check the same handlers.  Finally, `list` gives you a complete overview of all the action handlers currently registered, which is useful for debugging or understanding your system’s setup. It is important to note that it has properties like `loggerService` and `_actionMap` to manage its internal workings.

## Class ActionSchemaService

The ActionSchemaService acts as a central place to manage and keep track of the different actions your application can perform. It makes sure your action definitions are consistent and follow the rules you've set.

It uses a type-safe system to store these action definitions, ensuring they’re structured correctly. When you define an action, this service checks that it only uses the allowed public methods, helping to prevent errors.

You can register new actions, making sure they're valid before they're added to the system. If you need to make small changes to an existing action, you can override specific parts of it without having to redefine the entire action. Finally, it provides a way to easily retrieve the full configuration for an action when needed. 

Here's a quick breakdown of what it does:

*   **Registration:**  Adds new action definitions and validates them.
*   **Validation:** Checks that action handlers are structured correctly and using approved methods.
*   **Overrides:** Allows you to update parts of existing actions.
*   **Retrieval:**  Provides a way to get the full action definition.



The `loggerService` property lets you hook into the service’s logging. `_registry` is an internal storage for the action schemas.

## Class ActionProxy

The ActionProxy acts as a safety net when using custom trading logic within the backtest framework. It's designed to prevent errors in your custom code from bringing down the entire backtesting process. Think of it as a protective layer around your code.

It handles important events like signal generation, profit/loss adjustments, scheduled tasks, and more.  Whenever these events are triggered, ActionProxy steps in and wraps your code in a “try-catch” block.

If any errors occur within your custom code during these events, they are logged, reported, and the system keeps running without crashing. The errors don’t halt the backtest, allowing you to identify and fix issues later.

Crucially, it uses a factory pattern for creating instances, ensuring all your action handlers are properly wrapped for safety.  Some actions like `signalSync` bypass this error capture to allow more direct error propagation.  The `dispose` method also cleans up resources safely, just like the other methods.


## Class ActionCoreService

The ActionCoreService is like a central dispatcher for your trading strategies. It's responsible for orchestrating how actions (like buying, selling, or adjusting positions) are handled by your strategies.

It gathers action lists from strategy definitions and then systematically invokes the appropriate handlers for each action. This ensures actions are processed in the intended order and in response to different events.

Here's a breakdown of its key functions:

*   **Validation:** Before anything happens, it carefully checks that your strategy setup (name, exchange, frame) and all related actions and risks are valid. It avoids repeated checks by caching these validations.
*   **Initialization:** When a strategy starts, the service prepares all the individual action components by loading any persisted data they may have.
*   **Signal Routing:** It routes various signals (market data, timer events, risk events) to the correct actions, differentiating between backtesting, live trading, and scheduled activities. Different signal types have distinct handling functions (`signal`, `signalLive`, `signalBacktest`).
*   **Event Handling:** It also manages specific events like breakeven confirmations, partial profit/loss adjustments, and ping notifications, passing them to appropriate actions.
*   **Synchronization:** The `signalSync` function acts as a gatekeeper, making sure all actions agree before a key step (like opening or closing a position).
*   **Cleanup:** When a strategy finishes, the `dispose` function cleans up all action components and releases resources.
*   **Data Clearing:** The `clear` function allows you to clean out action data, either for a specific action or for all actions across all strategies.

Essentially, the ActionCoreService handles the complex logistics of managing and executing actions within your trading strategies, keeping everything organized and consistent.

## Class ActionConnectionService

The `ActionConnectionService` acts as a central dispatcher, directing different types of events to the correct action handlers within your trading strategy. It intelligently routes signals—like new ticks, breakeven updates, partial profit/loss adjustments, and scheduled pings—to the corresponding `ClientAction` based on the action's name, the strategy and frame it belongs to, and whether it's a backtest or live run. 

To optimize performance, it utilizes caching; once an action is created, it’s stored and reused for subsequent requests with the same action name, strategy, exchange, and frame. This ensures that action instances aren't repeatedly initialized, saving valuable resources.

The service relies on several other services like `loggerService`, `actionSchemaService`, and `strategyCoreService` to function correctly, and provides methods for initializing, disposing, and clearing these cached actions when needed. Specifically, the `getAction` method is key—it’s responsible for retrieving or creating these action handlers, and its caching mechanism is crucial for efficiency.  Each event type—`signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, and so on—has its dedicated routing method.

## Class ActionBase

This class, `ActionBase`, is designed to help you easily extend the trading framework with custom actions. Think of it as a starting point for adding extra functionality without having to write a lot of boilerplate code. It handles things like logging events automatically, so you don't need to implement those parts yourself.

You can use it to build custom logic for managing things like state, sending notifications (via email, Discord, etc.), tracking performance, or responding to specific trading conditions.

The class follows a specific lifecycle: it initializes when created, receives various event notifications as the strategy runs (like signals, breakeven points, profit milestones, etc.), and then cleans up when the strategy is finished.  Each of these events is triggered based on what's happening in the trading process.

Specifically, there are distinct events for live vs. backtest modes. You'll get `signalLive` for actions that should only run in live trading, and `signalBacktest` for actions specific to backtesting. You also have methods for handling events related to risk management and monitoring the state of the strategy. The `dispose` method is vital for cleaning up any resources you might use in your custom actions.
