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

The WalkerValidationService helps you keep track of and confirm your parameter sweep configurations, often used for optimizing trading strategies or tuning hyperparameters. Think of it as a central place to manage your "walkers," which define the ranges of parameters you want to test.

It lets you register new walkers, ensuring they're properly defined before you start any testing.  The service also validates that a walker actually exists before you try to use it, preventing errors. To make things faster, it remembers the results of previous validations so it doesn't have to check repeatedly. Finally, you can easily see a list of all the walkers you’ve registered.


## Class WalkerUtils

WalkerUtils offers a simple way to manage and run your trading walkers, which are essentially sets of strategies you want to test and compare. Think of it as a helper class that makes working with walkers much easier, handling details like automatically figuring out the relevant exchange and framework information.

It provides functions for running walkers, doing so in the background if you only need the side effects like logging, and stopping walkers to prevent them from generating new trading signals. You can also retrieve complete results and generate reports, including saving them as markdown files for easy sharing.

Furthermore, WalkerUtils allows you to list all the walkers currently running and check their status. It manages instances so each symbol-walker combination runs separately, preventing conflicts. The singleton instance ensures easy access to these utility functions throughout your application.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your trading strategies' structures in a safe and organized way. Think of it as a central place to store and manage the blueprints for your trading algorithms – we call these blueprints "walker schemas."

It uses a special system for ensuring that these blueprints are always in the correct format, preventing errors down the line.

You can add new blueprints using `addWalker()`, fetch existing ones by name with `get()`, and even update existing blueprints with `override()`.  Before adding a new blueprint, the `validateShallow` function quickly checks to make sure it has all the essential pieces. This service leverages a tool to maintain type safety, making your development process more reliable.

## Class WalkerReportService

This service helps you keep track of how your trading strategies are improving during optimization. It listens for updates from the optimization process, often called a "walker," and neatly records the results in a database. Think of it as a digital notebook for your strategy experiments.

You can tell it to start monitoring your optimization by subscribing, and it will diligently log each test’s performance metrics. It will also remember the best strategy found so far and track your overall progress. When you’re done, you can unsubscribe to stop the logging. It’s designed to prevent accidentally subscribing multiple times, which could cause problems.



The `loggerService` property allows you to see debugging information. The `tick` property handles the actual processing of the optimization events and logging them to the database.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you create and store reports about your trading strategies as readable Markdown files. It listens for updates as your trading strategies (walkers) run and keeps track of how they're performing.

Think of it as a way to automatically generate comparison tables showing how different strategies stack up against each other. These tables are saved to your logs directory, making it easy to review and share results.

You can subscribe to receive updates as walkers progress, and there's a way to unsubscribe when you're done. The service manages storage for each walker's results individually, so you don't have to worry about data getting mixed up.

You can grab specific data points, generate full reports, or even clear out all the accumulated data if you need to start fresh. It's designed to be flexible, allowing you to control what gets saved and how it's presented.


## Class WalkerLogicPublicService

The WalkerLogicPublicService helps you run and manage automated trading strategies, often called "walkers," in a structured way. It acts as a bridge, simplifying how you interact with the core logic of your trading system. 

Think of it as a conductor orchestrating multiple strategies; it automatically handles important details like identifying the strategy, exchange, frame, and walker being used, so you don’t have to pass them around manually.

You can use it to run comparisons for specific trading symbols, essentially letting it execute backtests across all your available strategies. It relies on other services – a logger for tracking events, a private service for the core logic, and a schema service for defining the structure of your walkers – to do its job. The `run` method is the key here, allowing you to trigger those backtests with a symbol and context.

## Class WalkerLogicPrivateService

This service helps you compare different trading strategies against each other, like a coordinator for a competition. It runs each strategy one after another and keeps you informed of the progress, showing updates as each one finishes. As the strategies run, it tracks the best performing one in real-time. Finally, it gives you a complete report with all the strategies ranked by their performance. To do its job, it relies on other services to handle the actual backtesting and analysis.

## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with walker functionality within the backtest-kit framework. Think of it as a convenient wrapper, making it easy to integrate walker operations into your applications. It handles behind-the-scenes details and provides a simple interface for common tasks.

Inside, it utilizes various services for tasks like logging, handling walker logic, validating strategies and exchanges, and managing schemas.

The key function is `run`, which allows you to execute a walker comparison for a specific trading symbol. You provide context, like the walker, exchange, and frame names, and the function returns a stream of WalkerContract objects, representing the results of the comparison.

## Class TimeMetaService

The TimeMetaService helps you reliably track the latest candle timestamp for a specific trading setup. Think of it as a central record of when candles change, useful when you need that information outside the normal trading loop.

It keeps a log of these timestamps for each combination of symbol, strategy, exchange, frame, and whether it's a backtest. If you need the timestamp while running a trading action, it can quickly retrieve it; otherwise, it waits briefly for the information to become available.

The service is automatically updated after each trading tick, and it’s designed to be cleaned up regularly – usually when a strategy begins – to prevent outdated data. You can also manually clear the timestamp records if needed, either for a single setup or all of them. This ensures data remains fresh and avoids potential issues caused by stale values.

## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals by providing insights into their lifecycle. It gathers information from signal openings and closings, essentially tracking when positions are entered and exited.

You can use it to get statistical summaries, like the total number of signals opened and closed. It also allows you to create detailed reports in Markdown format, showing a table of all your signal events. This table includes key details like the signal ID, direction, prices, take profit/stop loss levels, and profit/loss information.

Finally, you can easily save these reports to a file, which is incredibly useful for reviewing performance and identifying potential areas for improvement.  The reports are organized by symbol, strategy, and other contextual information to make it easy to find what you're looking for.

## Class SyncReportService

This service is designed to keep a detailed record of what's happening with your trading signals. It monitors signal activity, specifically when a signal is created (like a limit order being filled) and when it's closed (a position is exited). 

Think of it as an auditor, meticulously logging key moments.

It captures all the important details for each event, such as the specifics of the signal when it's opened, and profit/loss information along with the reason for closing when it's closed. These records are then stored in a database for later review and analysis, ensuring a clear audit trail.

You can easily subscribe to start tracking these events, and an unsubscribe function is provided to stop the tracking when it's no longer needed. The system prevents you from accidentally subscribing multiple times, keeping things tidy.

## Class SyncMarkdownService

This service helps you create reports detailing how your trading signals are behaving. It monitors signal events (when signals open and close) and organizes this information.

You can subscribe to receive these signal events, and the service accumulates all the data related to each signal, broken down by symbol, strategy, exchange, frame, and whether it’s a backtest or live trade. It then turns this data into nicely formatted markdown tables, giving you a clear overview of the signal lifecycle.

The service also provides statistics like the total number of events, opens, and closes. You can request these statistics or the full report for specific combinations of symbol, strategy, exchange, and frame. You can also save these reports directly to disk for later review.

If you need to reset the data, you can clear specific storage buckets or clear all of them. There's also a way to completely stop the service and clear all data by unsubscribing.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. It acts like a central manager, storing information about each strategy you're using. 

You can add new strategies using `addStrategy`, giving it a name and its configuration details.  Before you start trading, `validate` checks if a strategy exists and if any linked risk profiles or actions are also valid, preventing unexpected errors. 

To see a list of all strategies you've registered, use the `list` function. The service also uses a clever technique called memoization – it remembers the results of validations so it doesn't have to repeat the same checks unnecessarily, making things faster.  It relies on other services like `riskValidationService` and `actionValidationService` to handle those specific validations.


## Class StrategyUtils

StrategyUtils helps you understand how your trading strategies are performing by providing tools to analyze and report on their activity. Think of it as a central place to gather information about events like partial profits, trailing stops, or canceled orders. 

It gathers data from strategy management events and lets you pull out key statistics, like how many times each action type was triggered. You can also generate detailed reports, formatted in Markdown, that show a history of these events, including important details like price, percentages, and timestamps. 

Finally, StrategyUtils can automatically save these reports as files on your computer, making it easy to review performance over time. It essentially consolidates and organizes the data your strategies generate, making it much easier to track and understand their behavior.

## Class StrategySchemaService

This service acts as a central place to store and manage the blueprints, or schemas, for your trading strategies. Think of it as a catalog where you can register new strategy designs and then easily find them later by their name. It leverages a system that ensures type safety, meaning it helps prevent errors by verifying the structure of your strategy definitions. 

You add strategies using `addStrategy()` (though it's called `register` in the code), and retrieve them later using their name with `get()`. Before a strategy is officially added, `validateShallow` checks that it has all the essential building blocks in the right format. If you need to make changes to a strategy that’s already registered, you can use `override` to update specific parts of its definition. The service keeps track of everything internally with its `_registry`, and has a logger to help you debug any issues.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategies are doing. Think of it as a digital logbook for your strategies, writing down every important action like closing a trade, taking profits, or adjusting stop-loss orders.

To start using it, you need to "subscribe" – this essentially turns on the logging. Then, as your strategy executes actions, the service captures those events and saves them as individual JSON files. This is different from other reporting methods because it writes each event immediately, creating a clear audit trail.

When you're finished, "unsubscribe" to turn off the logging. You can call this multiple times without issues.

Here's a breakdown of the different event types it tracks:

*   **cancelScheduled:** Records when a scheduled trade is canceled.
*   **closePending:** Records when a pending trade is closed.
*   **partialProfit:** Records when a portion of a trade is closed for a profit.
*   **partialLoss:** Records when a portion of a trade is closed at a loss.
*   **trailingStop:** Records adjustments to a trailing stop-loss order.
*   **trailingTake:** Records adjustments to a trailing take-profit order.
*   **breakeven:** Records when a stop-loss is moved to the entry price.
*   **activateScheduled:** Records when a scheduled trade is activated early.
*   **averageBuy:** Records a new averaging buy entry in a position.

The `loggerService` property provides access to underlying logging mechanisms. Each event handler (like `cancelScheduled`, `closePending`, etc.) takes specific details about the trade and logs them to a file.

## Class StrategyMarkdownService

This service helps you collect and report on trading strategy events like cancels, closes, and partial profits. Think of it as a way to keep a detailed log of what your strategy is doing during a backtest or live trading.

Instead of writing each event immediately to a file, it temporarily stores them in memory for a given strategy and trading symbol—up to 250 events per combination. This allows for more efficient batch reporting.

To start using it, you need to "subscribe" to begin collecting events. Then, the service automatically tracks actions taken by your strategy. When you're ready, you can request statistics, generate a nicely formatted Markdown report, or save the report to a file.  When you're finished, "unsubscribe" to stop collecting events and clean up the stored data.

You can retrieve data and reports for a specific strategy and symbol, or clear all accumulated data if needed. The service uses a clever system to manage its memory and create report storage efficiently.

## Class StrategyCoreService

The `StrategyCoreService` acts as a central hub for strategy operations within the backtesting framework. It combines the functionality of several other services to manage strategy execution and data retrieval.

Think of it as a coordinator, injecting important information – like the trading symbol, timestamp, and backtest settings – into various strategy components. It's used internally by other core services to handle trading logic.

Here's a breakdown of what it offers:

*   **Validation and Checks:** It can validate strategies, risk configurations, and even partial trade actions before execution. Validation results are cached to avoid repeated checks.
*   **Signal Retrieval:** It provides methods to get the current pending signal, scheduled signals, and details about a position (like percentage closed, cost basis, and DCA history).
*   **Position Details:** Offers a suite of methods (`getTotalPercentClosed`, `getTotalCostClosed`, `getPositionEffectivePrice`, `getPositionInvestedCount`, `getPositionPnlPercent`, etc.) to comprehensively understand the state of a position. These methods consider DCA entries and partial closes.
*   **Partial Trade Management:**  Includes methods to validate and execute partial profit and loss actions (`partialProfit`, `partialLoss`).
*   **Trailing Stops and Take Profits:** Functions to adjust and validate trailing stop-loss and take-profit levels.
*   **Breakeven Handling:** Provides tools to validate and move stop-loss to breakeven.
*   **Scheduling:**  Allows for the cancellation or activation of scheduled signals.
*   **Lifecycle Management:**  Provides methods to stop, dispose, and clear strategy instances.
*   **Tick and Backtest Execution:** Has methods to execute strategy ticks (`tick`) and backtests (`backtest`).
*   **Position History & Metrics:** Provides access to various position metrics such as the highest profit price, PnL percentages, and remaining time until expiration.



The service essentially offers a well-rounded set of tools to monitor, manage, and execute strategies within a backtesting environment, providing key data and control points.

## Class StrategyConnectionService

This service acts as a central hub for managing and routing strategy operations within the backtesting framework. It intelligently selects the correct strategy implementation based on the symbol, strategy name, exchange, and frame used – think of it as a dispatcher for your strategies.

To optimize performance, it caches frequently used strategy instances, so you avoid repeatedly creating them.  This caching considers the exchange and frame to ensure proper isolation between strategies.

It provides a range of methods for interacting with strategies, including retrieving information like pending signals, percentage closed, total costs, and position levels.  You can also use it to trigger actions such as stopping a strategy, canceling scheduled signals, or manually closing positions. Essentially, it simplifies the process of working with multiple strategies in a consistent and efficient manner. It ensures proper initialization and handles both live trading (ticks) and historical backtesting scenarios.

## Class StorageLiveAdapter

The StorageLiveAdapter helps manage how trading signals are stored, giving you flexibility in choosing where that data lives. Think of it as a middleman; it handles events like signals being opened, closed, scheduled, or cancelled, and then passes those actions on to a specific storage system.

You can easily swap out different storage backends – persistent storage to disk, memory-only storage, or even a dummy adapter that does nothing – without changing much of your core trading logic. The default is persistent storage.

It provides helpful shortcuts like `usePersist`, `useMemory`, and `useDummy` to quickly switch between these storage options.  You can also customize the storage adapter yourself by providing your own implementation. It keeps track of when signals were last active and scheduled through ping events, updating the `updatedAt` field accordingly. Finding signals by ID or listing all signals is also handled through this adapter.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how your backtesting framework stores data about signals. Think of it as a middleman that connects your backtest logic to a specific storage system – whether that's a persistent disk storage, in-memory storage, or even a dummy system for testing. 

You can easily switch between different storage backends by using methods like `usePersist`, `useMemory`, and `useDummy`. This lets you change how your data is saved without altering the core backtesting code.

The adapter also handles events like signals being opened, closed, scheduled, or cancelled, forwarding these events to the currently selected storage backend.  Methods like `findById` and `list` allow you to retrieve signals based on their ID or get a complete list of all signals stored. 

The `useStorageAdapter` method gives you the ultimate control – you can even specify your own custom storage adapter if you need something highly specialized.

## Class StorageAdapter

This component handles managing how trading signals are saved and accessed, whether they're from a backtest or from live trading. It automatically keeps track of incoming signals, making sure they are stored correctly. 

To make sure things are efficient, it subscribes to signal updates only once and allows you to easily turn storage on and off. You can find specific signals using their IDs or list all signals related to either backtesting or live trading. This gives you a central place to manage and retrieve your signal data.


## Class SizingValidationService

The SizingValidationService helps you keep track of your position sizing strategies and make sure they're set up correctly. Think of it as a central place to register and verify your sizing methods.

It lets you add new sizing strategies using `addSizing`, so you have a record of all the methods you're using. Before you actually use a sizing strategy in your backtesting, you can use `validate` to confirm it exists, which helps prevent errors.

For efficiency, the service remembers previous validation results, so it doesn't have to check the same thing repeatedly. If you need a full list of all your registered sizing strategies, the `list` function provides that. It’s designed to make sure your sizing configurations are reliable and easy to manage.

## Class SizingSchemaService

This service helps you organize and manage your sizing schemas, which are essentially blueprints for how much to trade. It uses a special type-safe storage system, so you can be confident your schemas are well-defined.

You can add new sizing schemas using the `register` method, and update existing ones with `override`.  If you need to use a sizing schema, you just ask for it by name with `get`.

Before a sizing schema is added, it’s checked to make sure it has all the necessary pieces using a quick check called `validateShallow`. This helps prevent errors later on. Essentially, it's a way to keep your sizing configurations neat and organized.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade based on your risk tolerance and other factors. Think of it as a central hub for position sizing calculations within the backtest-kit framework. It uses a connection service to get the necessary data and a validation service to ensure everything is set up correctly.

It's a key component used behind the scenes by the trading strategies and also offers an API for you to directly calculate sizes.

Here’s a breakdown of what's inside:

*   **loggerService:**  Provides logging capabilities for tracking sizing operations.
*   **sizingConnectionService:** Handles the connection to retrieve data needed for size calculations.
*   **sizingValidationService:** Ensures the sizing parameters are valid.
*   **calculate:** This is the main function you’ll use – it takes your risk parameters and calculates the appropriate position size. It’s asynchronous and returns a promise that resolves to the size.

## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within your trading strategies. It acts as a central point, directing sizing requests to the correct sizing implementation based on a name you provide. 

Think of it as a traffic controller for sizing operations. 

To improve efficiency, it remembers which sizing methods it's already set up, so it doesn't have to recreate them every time you need them. This "remembering" is called memoization. 

The service uses sizingName parameter to identify the specific sizing method you want to use, allowing for flexible and customized sizing approaches. If your strategy doesn't have a specific sizing configuration, the sizingName will be an empty string.

You can get a sizing instance using `getSizing`, and calculate the size with `calculate`, which considers your risk parameters and the selected sizing method (like fixed percentage or Kelly Criterion).

## Class ScheduleUtils

ScheduleUtils helps you keep track of and understand how your scheduled signals are performing. It's designed to make it easier to monitor things like how long signals are waiting, how often they’re cancelled, and to generate reports summarizing this information.

Think of it as a central place to check on the health of your scheduled trading signals.

You can use it to get statistics for a specific trading symbol and strategy, generate detailed markdown reports highlighting signal activity, or save those reports directly to a file. Because it's a singleton, there's only one instance of it, making it easy to access from anywhere in your backtesting framework. 

It simplifies working with scheduled signals by wrapping around the scheduleMarkdownService and including logging for better visibility.

## Class ScheduleReportService

This service helps you keep track of how your scheduled signals are performing by recording their lifecycle events – when they're scheduled, when they're opened, and when they’re cancelled. It acts like a silent observer, listening for these signal events and meticulously noting them in a database. 

It calculates how long signals take from scheduling to either being executed or cancelled, providing insights into potential delays. To prevent accidentally overloading the system, it makes sure only one subscription is active at a time.

You can easily start monitoring by subscribing to the signal emitter, and when you're done, an unsubscribe function is provided to stop the tracking. The service also uses a logger to help with debugging.

## Class ScheduleMarkdownService

This service automatically generates reports detailing scheduled and cancelled trading signals. It keeps track of these events as they happen for each strategy you're using.

The reports are presented in a readable markdown format, including useful statistics like the cancellation rate and average wait times. These reports are saved to your logs directory, organized by strategy.

You can retrieve the accumulated statistics or a full report for a specific trading strategy. It’s also possible to clear out the recorded data when it’s no longer needed, either for a specific strategy or all of them. This service is designed to listen for signal events and manage the data needed for creating these reports without you having to manually collect and organize the information.

## Class RiskValidationService

This service helps you keep track of your risk management setups and make sure they’re all valid before you start trading. Think of it as a central place to register your different risk profiles – like how much risk you're comfortable taking – and a safety net to prevent errors. 

It keeps a list of all the risk profiles you’ve defined, and it checks that they exist before letting your trading strategies use them. To boost speed, it remembers the results of previous checks so it doesn't have to do the same validation over and over. 

You can add new risk profiles using the `addRisk` function, verify that a profile exists with `validate`, and get a complete list of all registered profiles using `list`. It also has a `loggerService` property you can use to monitor its actions and a hidden `_riskMap` where it stores the registered profiles.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejection events within your trading system. Think of it as a tool to review why your trades might have been stopped or adjusted due to risk controls. It provides a central place to gather information and create reports about these rejections.

You can use it to pull together statistical data like the total number of rejections, broken down by the specific asset traded and the strategy used. It also allows you to create detailed markdown reports summarizing these rejection events, presenting them in a table format with key details like the reason for the rejection, the trade’s position, and the current active positions.

Finally, the class can automatically generate these reports and save them as files, which can be really helpful for ongoing monitoring and analysis. This simplifies the process of reviewing your risk management setup and identifying areas for improvement.


## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they’re consistently structured and easily accessible. It uses a special registry to safely store these schemas, making sure you're working with the right types.

You can add new risk profiles using `addRisk()`, and then find them again later by their names.

Before a risk profile is added, it's checked to make sure it has all the necessary parts and is formatted correctly with `validateShallow`.

If a risk profile already exists, you can update specific parts of it using `override`. Finally, `get()` lets you quickly retrieve a risk profile when you need it.

## Class RiskReportService

This service helps you keep a record of when risk management prevents trades from happening. It’s designed to listen for these "risk rejection" events – essentially, times when a trading signal is blocked by the risk system.

The service carefully logs the details of each rejected signal, including why it was rejected and what the signal was. This creates a valuable audit trail for analyzing risk management performance and understanding potential issues. 

You can easily subscribe the service to receive these rejection notifications and it will handle preventing accidental duplicate subscriptions. When you're done needing those notifications, you can unsubscribe just as easily. Essentially, it provides a reliable way to track and understand why trades aren't executed due to risk controls.

## Class RiskMarkdownService

The RiskMarkdownService helps you automatically create detailed reports about rejected trades due to risk management rules. It listens for risk rejection events and keeps track of them for each symbol and strategy you're using.  These events are then organized into easy-to-read markdown tables, providing a clear overview of why trades were rejected.

You can subscribe to receive these rejection events, and when you're done, you can unsubscribe to stop the flow. The service accumulates data and offers statistical summaries – like the total number of rejections and breakdowns by symbol and strategy.  It can then generate a report or save that report as a markdown file to a specified directory, which is useful for reviewing and analyzing risk management performance.  You also have the option to clear out the accumulated data, either for everything or a specific symbol and strategy combination.

## Class RiskGlobalService

This service acts as a central point for managing and validating risk across your trading system. It works hand-in-hand with other services to ensure your strategies operate within defined risk limits.

It keeps track of open trading signals and checks if they are permissible based on your configured risk rules.  You can think of it as a gatekeeper, preventing trades that might exceed your risk thresholds.

The `validate` property efficiently reuses validation results, preventing unnecessary checks. The `checkSignal` method is crucial for pre-trade risk assessment, determining if a trade should proceed.  `addSignal` registers new trades, while `removeSignal` cleans up when a trade closes.  Finally, `clear` offers a way to reset the risk data, either completely or for specific risk configurations.

## Class RiskConnectionService

The RiskConnectionService acts as a central hub for managing risk checks within the trading system. It intelligently directs risk-related operations to the correct risk management implementation based on a given name, ensuring that risk assessments are tailored to specific strategies or scenarios. To improve efficiency, it remembers previously used risk implementations, avoiding redundant creation.

This service offers key functions: it fetches the correct risk management instance, validates signals against predefined limits like portfolio drawdown and exposure, registers and removes signals from the system, and provides a way to clear cached risk implementations when needed. It’s particularly useful for strategies where risk configurations are important, but if a strategy doesn’t have specific risk settings, it can still operate using a default configuration. The service relies on other components like a logger and an action core for its operation.

## Class ReportUtils

ReportUtils helps you control which parts of your backtest-kit system generate detailed reports. It's like a central switchboard for report logging, letting you turn on and off logging for things like backtests, live trading, performance analysis, and more. 

The `enable` function lets you pick which report types you want to monitor, and it automatically sets up the logging and gives you a way to shut it all down at once later – be sure to use that shutdown function to avoid problems!

The `disable` function lets you stop logging for specific report types without affecting others. This is useful if you only need reports sometimes.

## Class ReportBase

The `ReportBase` class provides a way to log trading events in a structured, append-only JSONL file. Think of it as a central place to record what's happening during a backtest. It automatically creates the necessary directories and handles writing data to a single file, ensuring each entry includes important metadata like the symbol, strategy, and exchange involved.

The class uses a stream-based approach to efficiently write data while managing potential backpressure, and includes a timeout to prevent write operations from hanging indefinitely. Initialization only happens once, even if you call it multiple times.  You provide the report name and a base directory, and the class takes care of the details of creating the file and writing data, making it easy to collect and analyze your backtest results.  It also offers built-in error handling by emitting errors to an exit emitter.

## Class ReportAdapter

The ReportAdapter helps manage and store your backtesting data in a structured way, allowing for flexible storage options. It acts as a central point for writing data, like trades, portfolio changes, or performance metrics, to various storage backends.

You can easily swap out the way data is stored—perhaps switching between storing data in JSONL files, a database, or even a dummy adapter that just ignores the writes—without changing much of your core backtesting logic. This is done using the `useReportAdapter` method.

The adapter smartly handles creating storage instances. It only creates them the first time data is written for a particular report type (like "backtest" or "live"), and it keeps those instances around for the entire application to prevent unnecessary creations. 

There's a default adapter that writes data to JSONL files, which is often useful for initial setup.  You can also temporarily switch to a “dummy” adapter to disable data recording, which can be helpful during debugging.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup, like a particular symbol, strategy, exchange, and timeframe. It acts like a memory, storing prices as they come in from your strategies. If you need a current price outside of the usual trading tick cycle, this service is your go-to.

It keeps track of each price in a special container called a BehaviorSubject, and these containers are organized by the unique combination of symbol, strategy, exchange, frame, and whether it’s a backtest. Importantly, it won't give you a price immediately if it hasn't received one yet – it waits a bit to make sure it's not too early.

If you're already in a trading tick, it’ll get the price directly from the exchange. You can clear the memory of stored prices to ensure you’re working with fresh data, either for all prices or just for a specific trading setup. The service is designed to be automatically updated and managed, so it keeps your price information current and reliable.

## Class PositionSizeUtils

This class offers helpful tools for figuring out how much of an asset to trade, based on different strategies. It's designed to make position sizing easier and more reliable by providing pre-built methods and ensuring your inputs align with the chosen method.

You'll find methods for calculating position size using several common techniques, including:

*   **Fixed Percentage:** This method uses a pre-defined percentage of your account balance to determine the position size.
*   **Kelly Criterion:** A more advanced technique that considers your win rate and win-loss ratio to optimize position sizing.
*   **ATR-Based:** This method leverages the Average True Range (ATR) to assess volatility and adjust position size accordingly.

Essentially, it provides a set of ready-to-use functions that do the complex calculations for you, helping you manage risk effectively and consistently.

## Class PersistStorageUtils

This utility class helps manage how signal data is saved and loaded, ensuring a reliable system even if there are unexpected interruptions. It's designed to create and handle storage for signals, keeping track of their state.

The class handles storing each signal as its own separate file, identified by a unique ID, making it easier to manage individual signals. It also provides a mechanism to swap out the way data is stored – you can use the built-in JSON format or plug in your own custom storage solutions.

To ensure data integrity, writes to the storage are performed atomically, meaning they either complete fully or don't happen at all, preventing data corruption. When the system restarts, the `readStorageData` function loads the saved signals, while `writeStorageData` saves changes, making sure your work is preserved. It also lets you test persistence by using a "dummy" adapter that simply ignores all writes, perfect for development or testing.

## Class PersistSignalUtils

This class provides tools to reliably save and load signal data, especially important when a trading strategy is running for a long time or might experience interruptions. It makes sure that your strategy's progress isn't lost due to unexpected crashes or restarts.

It keeps track of storage separately for each trading strategy, allowing for organized data management. You can even customize how the data is stored by using different "adapters."

The `readSignalData` function retrieves previously saved signal information, while `writeSignalData` safely updates that information on disk using a process that prevents data corruption.

If you need more control over how your signals are persisted, you can register your own adapter using `usePersistSignalAdapter`. For quick testing or when you don't want to save data at all, `useDummy` will simply discard any write attempts, and `useJson` will use the built-in JSON storage.

## Class PersistScheduleUtils

The PersistScheduleUtils class helps manage how scheduled trading signals are saved and restored, particularly for strategies running in live mode. It ensures that signal data isn't lost, even if there are unexpected interruptions.

It keeps track of storage instances separately for each strategy you’re using. You can even customize how this storage works by plugging in your own adapters. The class handles reading and writing scheduled signal data in a way that’s designed to be reliable, ensuring your data stays safe and consistent.

To get your trading signals back after a restart, the `readScheduleData` method fetches the saved data. When you need to update a signal, `writeScheduleData` saves it back, making sure the process is protected against crashes.

You can use different persistence strategies, like using the default JSON format or even a dummy adapter that just ignores writes for testing purposes. The `usePersistScheduleAdapter` lets you swap in a custom storage method, and `useJson` and `useDummy` give you quick switches to the built-in options.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage how active trading positions are saved and restored, particularly when dealing with different risk profiles. Think of it as a safe keeper for your trading state. It cleverly remembers where to find these saved positions, using a special storage system that adapts to your needs.

It provides ways to read existing position data from storage, essential for bringing your trading back to where it left off, and equally important methods to write new position data, ensuring everything is reliably saved. The writing process is designed to be crash-safe, meaning if something goes wrong during the save, your data won't get corrupted. 

You can even customize how the data is stored, choosing between a standard JSON format, a dummy adapter for testing (which does nothing), or plugging in your own persistence methods. It works closely with the ClientRisk component to keep things running smoothly.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and save partial profit and loss information for your trading strategies. It’s designed to ensure that even if something unexpected happens, your strategy's progress isn't lost.

It keeps track of partial data for each symbol and strategy combination, making sure each strategy’s progress is separate. You can even plug in your own custom storage methods if the built-in options don't quite fit your needs.

The class handles reading and writing this partial data safely, performing operations in a way that minimizes the risk of data corruption, especially during crashes. It's used internally by ClientPartial to save and restore profit/loss levels while your strategy is running.

You can easily switch between different ways of saving data – using the default JSON format, a dummy adapter for testing purposes that doesn’t save anything, or a custom adapter you provide. This flexibility makes it a robust and adaptable tool for managing your trading data.

## Class PersistNotificationUtils

This class helps manage how notification information is saved and loaded, ensuring a reliable system even if things go wrong. It's a behind-the-scenes tool used by other components for persistence.

The class handles saving notification data as individual files, each identified by a unique ID, and uses a special technique to ensure that writes are completed safely, preventing data loss in case of unexpected crashes.

You can customize how the data is stored by registering different "adapters" to handle the persistence process. For testing or development purposes, it even includes a "dummy" adapter that effectively ignores all write attempts.

Specifically, `readNotificationData` retrieves all saved notification information, while `writeNotificationData` handles saving new or updated notification details to persistent storage.

## Class PersistMemoryUtils

This utility class helps manage how your trading data is saved and loaded, ensuring it's reliable even if things go wrong. It focuses on storing "memory entries," which are likely snapshots of your trading environment at a specific point in time. 

The class smartly handles storage, creating separate areas for each signal and bucket combination, and it allows you to customize how the data is actually stored. It makes sure writes and deletions are done safely and allows you to easily check if a specific memory entry exists. You can even use it to list all the saved entries, which is helpful for rebuilding indexes.

If you want to test without actually saving data, there’s a dummy adapter that acts like a no-op. And if you’re using a custom storage method, you can register it with this class.

## Class PersistMeasureUtils

This class provides tools for safely saving and retrieving data fetched from external APIs, ensuring your backtesting process remains consistent even if things go wrong. It essentially acts as a middleman between your trading logic and the storage of that external data. 

The core idea is to create a way to store API responses (like historical price data) in a reliable manner, making sure each piece of data is associated with a specific time and asset. You can customize how this data is stored using different "adapters," or simply use the built-in JSON adapter. 

If you want to test your system without actually fetching data from external sources, you can switch to a "dummy" adapter that ignores write operations. The class handles the complexities of reading and writing files safely and in a way that prevents data corruption. The `readMeasureData` method retrieves data, while `writeMeasureData` saves it back. Finally, `usePersistMeasureAdapter`, `useJson`, and `useDummy` allow you to manage the persistence mechanism.

## Class PersistLogUtils

PersistLogUtils helps manage how log information is saved and retrieved, ensuring that even if there's an unexpected interruption, the data isn't lost. It's designed to work closely with LogPersistUtils to keep track of what's happening.

The system uses a special storage mechanism, and you can even customize how logs are stored by plugging in your own adapter. Each log entry gets its own individual file, making sure everything is neatly organized and easily accessible.

To get started, you can use the default JSON storage or switch to a "dummy" adapter, which is great for testing purposes as it essentially ignores any log data. Retrieving the log data involves reading entries from storage, and writing involves saving each entry separately using atomic operations to prevent data corruption.

## Class PersistCandleUtils

This utility class helps manage a cache of historical price data (candles) by storing each candle as a separate file. It's designed to keep things organized and efficient, especially for systems that need to quickly access this data.

The system checks if the entire set of requested candles is available before returning them, ensuring data integrity. It also automatically handles situations where the cached data isn’t complete.

You can control how the data is stored, choosing between a standard JSON format or even a dummy adapter that simply ignores write operations – useful for testing. The system uses atomic operations to read and write files safely, preventing data corruption. The `readCandlesData` function performs a precise check to confirm all needed candles are present, guaranteeing complete data sets for analysis.

## Class PersistBreakevenUtils

This utility class manages the saving and loading of breakeven data, ensuring your trading strategies can remember their progress even after your application restarts. It automatically handles storing this information on your computer’s disk, organizing it neatly in a folder structure like `./dump/data/breakeven/`. 

The class uses a clever system where it creates a unique storage location for each combination of trading symbol, strategy name, and exchange.  It’s designed to be flexible; you can even customize how the data is saved if you need something beyond the standard JSON format.

For convenience, it remembers previously used storage locations, so it doesn't have to create them every time. It also makes sure that writing data is reliable, preventing data loss. If you want to test your application without actually saving anything, there’s even a "dummy" mode that simply ignores all write requests.

## Class PersistBase

PersistBase provides a foundation for storing and retrieving data to files, ensuring data integrity and reliability. It's designed for situations where you need to save information persistently, like tracking trading results or strategies.

The system handles file operations carefully, using atomic writes to prevent data corruption and automatically checks for and cleans up any damaged files. It also gives you a way to efficiently loop through all the stored data using an asynchronous generator.

You specify a name for the type of data you’re storing and a directory where those files will be kept. Internally, it manages file paths and validates the storage directory to ensure everything is set up correctly. The `waitForInit` method initializes the persistence directory and checks existing files, running only once. You can then use methods like `readValue`, `hasValue`, and `writeValue` to interact with the stored data, knowing that writes are handled safely. Finally, `keys` allows you to get a list of all entity IDs, sorted alphabetically.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It listens for timing signals during strategy execution and saves that data into a database. This allows you to identify bottlenecks and areas where your strategy might be slow.

You can subscribe to start receiving these timing signals, and it makes sure you don’t accidentally subscribe multiple times.  When you're done, you can unsubscribe to stop collecting the data. The service uses a logger to help you debug and it’s designed to store performance metrics in a way that's useful for analysis.

## Class PerformanceMarkdownService

This service helps you understand how your trading strategies are performing by collecting and analyzing data. It listens for performance updates, keeps track of metrics for each strategy, and calculates things like average performance, minimums, maximums, and percentiles.

It automatically creates reports in markdown format, including a breakdown of potential bottlenecks, and saves them to your logs folder. You can customize what data appears in these reports.

You can subscribe to receive performance data, but be sure to unsubscribe when you no longer need it to avoid unnecessary processing. The service provides functions to retrieve specific performance statistics and clear the accumulated data when needed, ensuring a fresh start for new backtests or analyses. It uses a clever system to isolate data for each trading symbol, strategy, exchange, timeframe, and backtest, preventing your data from getting mixed up.

## Class Performance

The Performance class helps you understand how your trading strategies are performing by offering tools for analysis and reporting. It allows you to gather combined performance data for a specific trading symbol and strategy, giving you insights into things like how long different operations take, how much volatility there is, and potential outliers.

You can generate detailed markdown reports that visually break down the performance, highlighting areas where your strategy might be slow or experiencing unusual behavior. These reports automatically include information about how much time is spent on different tasks and a table of key statistics.

Finally, it’s easy to save these performance reports directly to a file on your computer, making it simple to track progress and share results. The reports are stored in a default `dump/performance/{strategyName}.md` location, but you can customize the file path if needed.

## Class PartialUtils

This utility class helps you understand and share the results of your trading strategies' partial profit and loss events. It acts as a central place to gather and present this data in a clear and organized way.

You can use it to pull out key statistics like total profit/loss event counts. It's also great for creating detailed markdown reports that show individual events in a table format, including things like the action (profit or loss), symbol traded, strategy name, signal ID, position, level, price, and timestamp.

Finally, it allows you to easily save those reports to a file, automatically creating the necessary directories if they don’t already exist, so you can review them later or share them with others. The reports are named based on the symbol and strategy used, making it easy to identify them. It gets its information from a service that collects these events as they happen, storing a limited history for each strategy and symbol.

## Class PartialReportService

The PartialReportService helps you keep track of how your trades are closing out in smaller chunks, like partial profits or losses. It listens for these partial exit events and saves details about them – the level at which they happened and the price – in a database. 

To use it, you’ll need to subscribe to the partial profit and loss signals. This subscription is protected so you don't accidentally subscribe multiple times. When you're finished, you can unsubscribe to stop receiving those signals.

The service includes a logger to provide debugging information. There are also dedicated functions for handling profit and loss events specifically.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on partial profits and losses. It listens for these events as they happen and neatly organizes them based on the symbol being traded, the strategy used, and other details. It then generates well-formatted markdown reports, making it easy to review your results and understand how different strategies are performing.

You can think of it as a record-keeper that automatically builds reports for you. These reports include detailed event information and summary statistics.  The service saves these reports to your disk, so you can easily access them later.

You can subscribe to receive these events, and it will automatically unsubscribe when you're done.  It also provides ways to retrieve data, generate reports, dump them to disk, and even clear out accumulated data if you need to start fresh. The system ensures that each combination of symbol, strategy, exchange, frame, and backtest has its own separate storage for organized reporting.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within the system. It's designed to be injected into the core strategy component, providing a single place to handle these operations. Think of it as a middleman – it logs important activity related to profit, loss, and clearing of partials before passing those actions on to a connection service that actually handles the details. 

It includes several validation services to make sure the strategy, associated risk, exchange, frame and more exists. 

The service uses injected components for logging and connection management, making it flexible and easy to integrate into the larger system. You'll find methods for recording profits, losses, and clearing partials, all with a focus on centralized logging for better monitoring and troubleshooting.

## Class PartialConnectionService

The PartialConnectionService helps track partial profits and losses for your trading strategies. Think of it as a manager that creates and manages smaller components, called ClientPartial instances, for each individual trading signal.

It keeps a record of these ClientPartial instances, making sure it doesn’t create a new one every time – it reuses them for efficiency. When a signal reaches a profit or loss threshold, the service handles the event and lets other parts of your system know. 

When a signal is closed, the service cleans up after itself, removing the associated ClientPartial and preventing unnecessary memory usage. It works closely with the ClientStrategy and uses a caching system to quickly retrieve or create these tracking components as needed. Essentially, it's the behind-the-scenes engine that manages the details of partial profit/loss tracking.

## Class NotificationLiveAdapter

This class, `NotificationLiveAdapter`, helps you send notifications about what's happening during your backtesting or live trading. Think of it as a central hub for delivering information about signals, profits, losses, and errors, but it's designed to be flexible.

You can easily change how those notifications are delivered by swapping out different "adapter" implementations. There are a few options ready to go: one that stores notifications in memory (the default), one that writes them to disk for persistence, and a dummy adapter that simply ignores them – useful for testing or when you don’t want to send any notifications.

The adapter handles different types of events – like when a signal is received, a partial profit becomes available, or an error occurs – and passes them on to the currently selected notification method. You can also retrieve all stored notifications or clear them out.  It provides convenience functions `useDummy`, `useMemory`, and `usePersist` to quickly switch between different notification backends. If you need more customization, `useNotificationAdapter` lets you provide your own notification adapter implementation.

## Class NotificationBacktestAdapter

This component acts as a central hub for handling and sending notifications related to your backtesting process. Think of it as a flexible system that allows you to choose where and how these notifications are stored or processed.

You can easily swap out the notification backend – for example, storing notifications in memory, saving them to a file, or completely ignoring them for testing purposes. It provides some handy shortcuts to switch between these different options, like using a dummy adapter for fast testing or persisting notifications to disk for later review.

The adapter itself doesn't directly handle the notification logic; it simply forwards events like signal updates, profit/loss events, errors, and more to the currently selected backend.  You can also retrieve all stored notifications or clear them out as needed. Essentially, it provides a clean and adaptable way to manage the flow of information during your backtests.

## Class NotificationAdapter

The NotificationAdapter is designed to keep track of trading notifications, both those generated during backtesting and those that would happen in a live trading environment. It automatically updates itself based on signals, giving you a central place to access all notifications. To prevent things from getting messy with duplicate subscriptions, it uses a special mechanism to ensure each signal source is only subscribed to once. 

You can easily turn notification tracking on and off using the `enable` and `disable` functions. The `enable` function subscribes to the necessary signals, and `disable` safely stops that tracking, even if you call it multiple times.

If you need to see all the notifications, the `getData` function lets you retrieve either the backtest notifications or the live notifications. When you're finished, the `clear` function provides a quick way to remove all notifications for either backtest or live mode.

## Class MemoryAdapter

The MemoryAdapter helps manage temporary storage for data related to signals, acting as a central place to store and retrieve information. It keeps track of these storage areas, called "buckets," and makes sure that data is handled efficiently.

Think of it as a way to save information temporarily while a signal is active, and then automatically clear it when the signal is done. This prevents the system from getting cluttered with old, unused data.

You can choose how this data is stored – either entirely in memory for speed, persisted to files for safekeeping, or even discarded for testing purposes. The adapter handles the switching between these storage methods easily. 

Before you start using the adapter, you need to "enable" it to link it to the signal lifecycle, and you can "disable" it when it’s no longer needed. Methods like `writeMemory`, `searchMemory`, `listMemory`, `removeMemory`, and `readMemory` provide ways to interact with the stored data, allowing you to save, find, list, delete, and retrieve entries. Finally, `dispose` clears up any resources when you're finished with the adapter.

## Class MarkdownUtils

The MarkdownUtils class is your go-to helper for controlling how markdown reports are generated within the backtest-kit framework. It lets you turn on and off markdown reporting for different parts of the system, like backtests, live trading, or performance analysis.

Think of it as a central switchboard for markdown.

The `enable` function lets you subscribe to specific markdown services; essentially telling the system to start collecting data and generating reports for those areas. Crucially, it returns a cleanup function - *always* call this cleanup function later to prevent memory leaks.

The `disable` function, on the other hand, lets you stop generating markdown reports for certain services, while potentially leaving others active. It immediately halts the reporting process for those services without requiring a cleanup function.

## Class MarkdownFolderBase

This adapter lets you organize your backtest reports into separate markdown files, each in its own directory. Think of it as the standard way to create easily navigable, human-readable report folders.

It automatically creates the necessary directories based on settings you provide, and each report gets its own .md file. The filename and location are determined by configuration options, so you can customize how your reports are structured.

Essentially, this adapter simplifies generating reports that are easy to browse and understand, making manual review a breeze. It doesn’t manage streams directly; it simply writes files. Because of this, it doesn’t require any special initialization.

## Class MarkdownFileBase

This class helps you write markdown reports – like performance summaries or trade details – to files in a structured, easily processable format. It organizes reports into individual JSONL files, making them simpler to manage and analyze later.

Think of it as a specialized reporter that writes to files, ensuring each report is appended as a single line in a JSONL file. It handles potential delays during writing and automatically creates the necessary directories.

The `waitForInit` method sets everything up initially, but it's safe to call again if needed. The `dump` method is your go-to for adding new reports; it neatly packages the markdown content along with helpful metadata like the symbol, strategy, and timestamp, all bundled into a JSON object. This makes filtering and post-processing much easier, allowing you to easily find specific reports based on criteria like symbol or strategy.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage and store markdown data, like the results of backtests or live trading sessions, in a flexible way. It allows you to choose how the data is stored – either as individual files, appended to a single JSONL file, or even discarded for testing purposes.  The system remembers the storage setup for each type of markdown (like "backtest" or "live") so you don't have to recreate them every time.

You can easily switch between storage methods using shortcuts like `useMd` (for separate files) and `useJsonl` (for appending to a single file).  If you need to change how markdown is stored overall, the `useMarkdownAdapter` method lets you specify a different storage implementation.  The adapter automatically creates storage when you first write data, so you don't have to set it up manually.

## Class LoggerService

The LoggerService helps keep your backtesting logs organized and informative. It's designed to provide consistent logging across the entire backtest-kit framework. You can think of it as a central hub for all your logging needs, automatically adding key information like which strategy, exchange, and frame are being used, as well as details about the specific symbol and time period being tested.

If you don't configure a custom logger, it will default to a "no-op" logger that doesn’t actually do anything, so it won’t interfere with your testing. 

The `setLogger` method allows you to plug in your own logging implementation if you need more specialized behavior.  Inside, it uses `methodContextService` and `executionContextService` to gather all the helpful context to attach to log messages. You have separate methods for different log levels: `log`, `debug`, `info`, and `warn`, all of which automatically include this context.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage your trading framework's logging. Think of it as a central hub that lets you easily switch between different logging methods without changing your core code. By default, it keeps logs in memory, but you can switch to storing them on disk for persistence, using a dummy adapter for testing that doesn't actually log anything, or even logging to a JSONL file.  

You can swap out the underlying logging implementation using `useLogger` to use a custom adapter.  Methods like `log`, `debug`, `info`, `warn` all pass their messages on to whichever adapter you’ve selected. `getList` lets you retrieve all the logs that have been collected. Convenient shortcuts like `usePersist`, `useMemory`, and `useDummy` simplify switching between common logging configurations.

## Class LiveUtils

This class provides tools for live trading operations within the backtest-kit framework. Think of it as a helper for running your trading strategies in real-time.

It's designed to simplify things with features like automatic restarts after crashes and persistent data storage. It's a singleton, meaning you access it in one place and use it everywhere.

Here’s a breakdown of what it can do:

*   **Run Live Trading:**  `run()` starts a continuous trading process for a specific symbol and strategy.  It's like setting up a persistent, automated trader.  `background()` is similar, but it runs silently without sending any output.
*   **Get Signal Information:**  Functions like `getPendingSignal()`, `getScheduledSignal()`, `hasNoPendingSignal()`, and `hasNoScheduledSignal()` let you check on the status of signals.
*   **Position Data:**  You can retrieve details about your current position with functions like `getTotalPercentClosed()`, `getTotalCostClosed()`, `getPositionEffectivePrice()`, and `getPositionPnlCost()`.
*   **Breakeven and Time Management:**  `getBreakeven()` checks if you’ve reached a breakeven point, and functions like `getPositionCountdownMinutes()` provide information about time-based trading.
*   **Control and Modification:**  Methods like `stop()`, `commitCancelScheduled()`, and `commitClosePending()` allow you to control the running strategies.  You can also manually adjust stop-loss and take-profit levels using `commitTrailingStop()`, `commitTrailingTake()`, and related functions.
*   **Data Access & Reporting:** It offers `getData()` for pulling statistics and `getReport()` & `dump()` to generate and save reports about trading activity.
*   **DCA Management:** `commitAverageBuy()` is used to add more entries to your positions, implementing dollar-cost averaging strategies.



Essentially, this class handles the nuts and bolts of keeping your live trading strategies running smoothly, safely, and providing information about their progress.

## Class LiveReportService

The LiveReportService helps you keep a real-time record of your trading strategy's activity. It's designed to capture every key event – from when a signal is idle to when a trade is opened, active, or closed – and save it to a database. 

Think of it as a live monitoring tool that allows you to analyze your strategy's performance as it's running. 

The service connects to a stream of live signal events and logs all the important details about each event, making sure you have a complete picture of what’s happening. You can subscribe and unsubscribe from this stream, ensuring you only receive the data you need and preventing accidental duplicate subscriptions.

## Class LiveMarkdownService

This service helps you automatically generate and save reports about your live trading activity. It listens for every signal event – things like when a strategy is idle, opens a position, is actively trading, or closes a trade. The service then organizes all this information for each strategy and produces easy-to-read markdown tables.

You'll get a detailed overview of your trading, including key stats like win rate and average profit/loss. These reports are saved to your logs directory, making it simple to track your strategies’ performance over time.

The service uses a clever system for managing data; each trading combination (like a specific symbol, strategy, exchange, timeframe, and backtest setting) gets its own isolated storage. You can subscribe to receive tick events, and an unsubscribe function is provided for when you no longer need those updates.

If you need to access or generate reports for a specific trading setup, functions are available to retrieve data and generate markdown reports. You can also clear the accumulated event data if needed, either for a specific setup or all of them.

## Class LiveLogicPublicService

This service helps manage live trading operations, making it easier to execute strategies. It builds upon a private service and automatically handles important context information like the strategy and exchange names, so you don't have to pass them around constantly.

Think of it as a continuous, ongoing process – it runs indefinitely and generates trading signals (open, close, or cancellation) as they happen. It’s designed to be robust too; if something goes wrong, it can recover and pick up where it left off, thanks to saved state. The progression of trades is synchronized with the current time, ensuring accurate real-time operation.

You provide the trading symbol and the context, and it takes care of the rest, delivering a continuous stream of results.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, using a clever approach with asynchronous generators to keep things running smoothly and efficiently. It constantly monitors the trading signals and provides updates as positions are opened or closed, avoiding unnecessary information about positions that are simply active or idle.

The service works in a continuous loop, regularly checking for new signals and yielding results as they happen. Importantly, it's designed to be resilient – if something goes wrong, it automatically recovers and picks up where it left off, thanks to the `ClientStrategy.waitForInit()` feature.

Think of it as an infinite stream of trading events, delivered in real-time, that you can react to as they occur. It’s memory-efficient because it only sends you the important information when there’s a change in position status.

Here’s what it uses under the hood:

*   `loggerService`: For logging important events and debugging.
*   `strategyCoreService`: Handles the core logic of the trading strategy.
*   `methodContextService`: Provides context for the methods being executed.

The `run` method is the key – it’s what starts the whole process for a specific trading symbol.

## Class LiveCommandService

This service provides a way to kick off and manage live trading sessions, essentially acting as the main entry point for interacting with live trading functionality. Think of it as a convenient wrapper, making it easy to integrate live trading into your applications.

It relies on several other services internally for things like validating strategies, exchanges, and handling risks, ensuring everything is set up correctly before trading begins.

The core function `run` is where the magic happens; it initiates a continuous, ongoing trading process for a specific trading symbol. It automatically handles potential issues and keeps the process running, returning results as they become available. This `run` function gives you a stream of data representing the outcome of each trading decision – whether it's an opening, closing, or cancellation of a position.

## Class HighestProfitUtils

This class helps you access and analyze the highest profit data your backtesting or trading system generates. Think of it as a central place to get summaries and reports on which strategies performed best for specific assets.

It gathers information from events recorded during your backtests or live trading. 

You can use it to:

*   **Get statistics:** Easily fetch data like the highest profit achieved by a strategy for a particular asset.
*   **Generate reports:** Create formatted markdown reports detailing all the highest profit events for a strategy and asset combination.
*   **Save reports to files:**  Directly save these reports to files, making it easy to share or archive results.

## Class HighestProfitReportService

This service is designed to keep track of and record your best trading profits. It listens for events indicating a new highest profit has been achieved and saves those moments as detailed records.

These records, written to a special report database, include important information like the time, the asset being traded, the strategy used, and specifics about the trading signal that led to the profit – things like entry price, take profit levels, and stop loss orders.

To get it working, you need to subscribe to it; this starts the process of logging those peak profit events.  You can only subscribe once – subsequent attempts simply return the same way to stop the logging.  When you're done, you can unsubscribe to stop it from writing records.

## Class HighestProfitMarkdownService

This service is responsible for collecting and generating reports on the highest profit achieved for trading strategies. It listens for events related to profit, organizing them based on the asset, strategy, exchange, and timeframe being used.

You can subscribe to these profit events, and the service will ensure you only subscribe once to avoid unnecessary overhead. When you're done, unsubscribing completely clears all collected data.

The `tick` method handles each incoming profit event, storing it in the appropriate category.  You can retrieve the accumulated profit statistics for a specific combination of asset, strategy, exchange and timeframe using `getData`.

To create a formatted markdown report, use the `getReport` method, which generates a nicely presented table of the events, or `dump` to save that report directly to a file.  If you need to clear data, you can selectively clear data for a specific strategy or clear everything completely.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading strategy's performance through heatmaps. It's designed to be easy to use, automatically gathering data from your closed trades and presenting it in a clear, organized way. 

Think of it as a shortcut to getting a comprehensive picture of how your strategy is performing across different assets.

You can retrieve the raw data as a structured object, generate a formatted markdown report summarizing key metrics like total profit, Sharpe Ratio, and maximum drawdown, or directly save that report to a file. The report organizes symbols by their profit performance, making it easy to identify top performers. It's a central place to access portfolio insights.


## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when signals close, especially focusing on the profit and loss (PNL) generated. It listens for these closing signal events across all your trading symbols, allowing you to build a portfolio-wide view of what's working and what's not.

Think of it as a data collector, specifically designed to gather information on closed trades. It saves this information in a format ready for heatmap generation, giving you a visual way to understand your trading patterns. To prevent unwanted duplicates, it ensures that the service only subscribes to the signal events once. 

You can start receiving these signal events by using the `subscribe` method, which will return a function you can call later to stop receiving them. The `unsubscribe` method provides a convenient way to stop the service from tracking new signals.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance, creating a heatmap-like view of your portfolio. It gathers data from trading signals and organizes them, giving you a clear picture of how each strategy and symbol is doing.

You can subscribe to receive updates as new trades happen, and then use the service to generate reports. These reports show key metrics like total profit, Sharpe Ratio (a measure of risk-adjusted return), and maximum drawdown (the largest peak-to-trough decline), all presented in an easy-to-read markdown table.

The service remembers its data efficiently, creating separate storage areas for each exchange, timeframe, and backtesting mode to keep things organized.  It’s designed to handle potential errors in calculations, ensuring you get reliable numbers.  You can also clear this stored data to start fresh, either for a specific combination of settings or completely across the board.  Finally, you can easily save these reports to a file.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframes and make sure they're set up correctly. It acts like a central manager for your frame configurations, storing a list of all defined timeframes and ensuring they exist before you try to use them. To avoid unnecessary checks, it remembers whether a frame is valid, speeding up your processes. 

You can use `addFrame` to register new timeframes, `validate` to confirm a specific timeframe is ready for use, and `list` to see all the timeframes you've defined. It's a handy tool for maintaining order and preventing errors in your trading framework.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the different structures (schemas) your backtesting strategies use. Think of it as a central place to store and manage these blueprints. It uses a system that ensures everything is typed correctly, reducing errors.

You can add new schemas using `register`, which essentially saves a new blueprint. If you need to update an existing schema, `override` lets you change specific parts of it.  And when you need a particular schema for your strategy, `get` retrieves it by its name. 

The service also has built-in checks to make sure the schemas are structurally sound before they're saved, ensuring the overall consistency of your backtesting environment.

## Class FrameCoreService

This service helps manage and generate the timeframes needed for backtesting. It's a central component, working with other services to ensure the time data is accurate and ready to use. Think of it as the engine that provides the timeline for your trading simulations. 

It handles requests for specific timeframes, like getting a list of dates for a particular trading symbol and timeframe.  The `getTimeframe` function is key here, as it's how you request those timeframe arrays. It relies on other services to connect to data sources and validate the time data it produces.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like historical data sets. It automatically figures out which frame to use based on the current context, streamlining your backtesting process. 

To improve performance, it remembers the frames it's already created, so it doesn’t have to rebuild them every time. 

You can retrieve specific frames using `getFrame` and get timeframe boundaries for backtesting with `getTimeframe`, which helps define the start and end dates for your simulations. In live trading, frames aren’t used, so the `frameName` will be empty. 

It relies on other services like `loggerService`, `frameSchemaService`, and `methodContextService` to function correctly.

## Class ExchangeValidationService

This service acts as a central hub for keeping track of your trading exchanges and ensuring they're correctly set up. Think of it as a quality control system for your exchanges – before any trading happens, it confirms that the exchange you're trying to use is actually registered and configured properly. 

It keeps a record of all your exchanges, allowing you to add new ones as needed. When you need to verify an exchange, it quickly checks if it's valid, and it remembers the results to speed things up in the future. If you ever need a full list of all the exchanges you've registered, it provides that too. Basically, it helps prevent errors and streamlines your trading setup by managing and validating your exchange configurations.

## Class ExchangeUtils

The `ExchangeUtils` class is like a helpful assistant for working with different cryptocurrency exchanges within the backtest-kit framework. It provides easy and reliable ways to get data from those exchanges, ensuring everything is validated correctly.

Think of it as a central place to go when you need candles (historical price data), average prices, order books, or trade information. The class handles a lot of the complexity behind the scenes.

It automatically figures out the right date ranges when requesting data, maintaining consistency with how the system was originally built. You can also ask it to format quantities and prices to match the specific rules of each exchange.

The class is designed to be a single, shared resource, making it easy to access without needing to create multiple copies. It’s a really useful tool for anyone building or analyzing trading strategies.

## Class ExchangeSchemaService

This service helps you keep track of the structure and details for different cryptocurrency exchanges. It acts like a central place to store and manage information about each exchange, ensuring consistency and preventing errors.

Think of it as a registry where you can add new exchanges, retrieve existing ones by their names, and even update their information. It uses a special system to ensure the data you store is in the correct format.

You can add a new exchange using `addExchange()`, get details about an existing one using `get()`, and make changes to an exchange's details using `override()`. Before adding a new exchange, the service checks to make sure it has all the necessary information.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It handles requests like fetching historical data (candles, order books, trades) and formatting prices and quantities, making sure to include important contextual information like the specific trading symbol, the time of the trade, and whether it's a backtest or live execution. Think of it as a layer that wraps the connection to the exchange, adding the necessary details for accurate simulation and analysis.

It validates exchange configurations to ensure everything is set up correctly and avoids repeating that validation unnecessarily. Several methods, like `getCandles` and `getOrderBook`, handle requests for data, providing a way to retrieve information with the appropriate context injected. Specifically, `getNextCandles` is designed for backtesting scenarios where you need to peek into the future. Methods like `formatPrice` and `formatQuantity` ensure data is presented in a consistent and meaningful way, taking into account the specific exchange and trading context.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs your requests to the correct exchange based on the current context, essentially handling the complexity of talking to various platforms. It keeps a record of these connections to avoid repeatedly setting them up, making things faster.

You can use it to retrieve historical price data (candles), get the next set of candles moving forward in time, calculate average prices, format prices and quantities to match exchange rules, and access order books and aggregated trade data. The service intelligently decides how to handle these requests, whether pulling real-time data from a live exchange or calculating values based on historical data during a backtest. It provides a consistent way to access data regardless of the underlying exchange.

## Class DumpAdapter

The DumpAdapter acts as a central point for saving data during backtesting, offering different ways to store that information. By default, it creates markdown files to organize your data, but you can easily switch to storing it in memory, discarding it altogether (useful for testing), or even using a custom storage method you define.

Before you start dumping data, you need to "enable" the adapter, which sets it up to listen for signal events. When you're finished, you can "disable" it to clean things up.

The adapter provides several methods for saving different types of data: full message histories, simple records, tables, raw text, error messages, and even complex JSON objects. Each method takes a context object to help organize the data.

You have a lot of flexibility in how data is stored. You can choose markdown (the default), memory, a dummy backend that ignores everything, or supply your own custom class to handle the storage. This allows you to tailor the data persistence to your specific needs.

## Class ConstantUtils

This class provides a set of constants designed to help you manage your take-profit and stop-loss levels in a way that's informed by the Kelly Criterion and risk decay principles. These constants define percentages representing how far the price needs to move towards your ultimate profit or loss target to trigger different levels of partial exits.

Think of it as a way to automatically manage your risk and lock in profits incrementally. For example, TP_LEVEL1 represents an early take-profit point, triggering when the price reaches a small portion of your overall profit goal, while SL_LEVEL1 is an early warning signal for your stop-loss. The constants are carefully calculated to balance early profit-taking with the potential for continued gains, and to minimize losses if the trade moves against you. You can use these levels to automate your trading strategy and reduce the need for constant monitoring.

## Class ConfigValidationService

This service acts as a safety net for your trading configurations, making sure everything adds up mathematically and prevents unintended losses. It carefully checks your settings, paying close attention to percentages like slippage and fees—they need to be non-negative. 

The service also ensures that your take-profit distance is sufficient to cover all costs associated with a trade, guaranteeing some profit even when the take-profit target is reached. 

Beyond that, it confirms that relationships between settings like stop-loss distances are logically sound, and that time-related parameters, like timeouts, are realistic and positive. Finally, it scrutinizes parameters related to how candles are fetched, validating things like retry attempts and anomaly detection thresholds. Basically, it’s there to catch potential errors before they impact your trading performance.

## Class ColumnValidationService

The ColumnValidationService helps keep your column configurations in good shape, making sure they follow the rules defined by the ColumnModel interface. It's designed to catch potential errors early on, preventing problems down the line caused by incorrect column setups.

Essentially, it does a thorough check of your column definitions to confirm they have all the necessary parts—a key, a label, a format, and a visibility setting.  It also ensures that each key is unique, so you don’t accidentally have two columns with the same identifier.  The service also makes sure the format and visibility are properly set as functions.

Think of it as a quality control system for your column data. The `validate` method does this comprehensive check, making sure everything lines up correctly.

## Class ClientSizing

This component, called ClientSizing, figures out how much of your assets to allocate to each trade. It's designed to be flexible, letting you choose from several different sizing strategies like a simple fixed percentage, the Kelly Criterion, or using Average True Range (ATR).

You can also set limits on your position sizes, like a minimum and maximum amount you're willing to risk, and a percentage of your total capital that can be used for any single trade.

The `calculate` method is the heart of it – it takes the current market conditions and your configured parameters and returns the suggested position size for a trade. This is what your trading strategy uses to actually place orders.

## Class ClientRisk

ClientRisk is designed to help manage the risk of your trading portfolio, especially when using multiple strategies simultaneously. It acts as a gatekeeper, ensuring that trades don't exceed your predefined limits, like the maximum number of positions you can hold.

Think of it as a central control point; all your strategies share this risk management component, allowing it to monitor and prevent conflicts between them. It keeps track of all active positions across your strategies and uses this information to validate any new trading signals.

When a signal comes in, ClientRisk checks it against your rules. If a signal breaks a rule, it prevents the trade from happening. It can handle custom validation rules, giving you a lot of flexibility in how you manage risk. 

The system automatically saves and loads position data, though this feature is skipped when you're backtesting. It also provides methods for registering new trades and closing old ones, ensuring the risk management system always has an up-to-date view of your portfolio.


## Class ClientFrame

The ClientFrame is a core component that helps manage the timeline for your backtesting simulations. Think of it as a time machine specifically built for evaluating trading strategies against historical data. It creates sequences of timestamps, spaced out according to your chosen interval (like one minute, one hour, or one day), to represent the period you want to backtest. 

To avoid unnecessary calculations, it keeps a cache of previously generated timeframes. You can also customize how the timeframes are generated through callbacks, allowing you to validate the data or log important events.  It's used internally by the backtest engine to step through each historical period.

The `getTimeframe` property is its most important function – it's responsible for actually producing those timestamp arrays, and it smartly remembers the results to avoid repeating the process.


## Class ClientExchange

This component, `ClientExchange`, acts as a bridge to access real-time and historical market data. It's designed to efficiently handle requests for candle data, order books, and aggregated trades, all while preventing look-ahead bias that could skew backtesting results.

You can use it to retrieve historical candles (past data) from a specific point in time, or to fetch future candles for simulating trading scenarios. It also calculates the VWAP (Volume Weighted Average Price) – a useful indicator – based on recent trading activity.

The `formatQuantity` and `formatPrice` methods ensure that data is presented in the correct format as required by the exchange, considering things like decimal precision.  For more in-depth data retrieval, the `getRawCandles` method allows you to specify start and end dates and limits, offering a lot of flexibility, but it's important to be mindful of the date validation rules. Finally, you can get a snapshot of the order book and historical aggregated trades. The system aims for performance by using efficient methods and is carefully designed to avoid data leakage from the future.

## Class ClientAction

The `ClientAction` component is the central piece for running your custom action handlers within the backtest or live trading environment. Think of it as a manager that sets up, routes events to, and cleans up after your handlers. It’s designed to be flexible, allowing you to connect your handlers to external systems for things like logging, sending notifications (like to Telegram or Discord), or collecting data for analytics.

It uses a special initialization and cleanup process to make sure things happen only once, preventing unexpected behavior. The `signal` methods—`signal`, `signalLive`, and `signalBacktest`—are how events from the trading system get passed to your handlers, differentiating between live and backtest scenarios.  There are also dedicated methods to handle specific events like breakeven and partial profit/loss notifications, and scheduled ping activity. Finally, `signalSync` provides a way to control position opening and closing using limit orders, handling any errors that arise during the process.

## Class CacheUtils

CacheUtils helps you speed up your backtesting by automatically storing and reusing the results of your functions. It's like having a smart assistant that remembers calculations so you don't have to repeat them unnecessarily.

Think of it as a central place where functions are cached, ensuring each function gets its own dedicated storage. There's even a special version for asynchronous functions, saving their results to files for persistence.

You can wrap your functions using `fn` for simple caching based on time intervals, or use `file` for more advanced caching that reads and writes data to disk.  The `file` method keeps each function's cache separate based on its unique reference, so ensure you consistently use the same function reference to share the same cache.

If your function’s logic changes, `flush` lets you completely clear the cache for that function (or all functions), giving you a fresh start. `clear` is a more targeted approach, removing cached values just for the current backtest scenario. Finally, `gc` helps tidy up old, expired cache entries to keep your memory usage under control.

## Class BrokerBase

This `BrokerBase` class is your foundation for connecting your trading strategy to a real exchange. Think of it as a template to build your own custom broker adapter. It handles a lot of the boilerplate work, including logging events and making sure everything is set up correctly.

You'll extend this class to do things like place orders, manage stop-loss and take-profit levels, and even send trade notifications to services like Telegram or Discord. The good news is that it provides default implementations for almost everything, so you only need to override the methods that are specific to the exchange you’re working with.

Here's a quick rundown of the key steps:

1.  **Initialization:** The `waitForInit` method is where you establish the connection to the exchange and authenticate.
2.  **Event Handling:**  Several methods (`onSignalOpenCommit`, `onSignalCloseCommit`, `onPartialProfitCommit`, etc.) are called at specific points in the trading process – when a position is opened, closed, partially closed for profit or loss, and so on.  These are your hooks for interacting with the exchange.
3.  **Lifecycle:** Unlike some classes, you don't need to explicitly clean up resources. The initialization process handles this for you.

Essentially, this base class simplifies the process of integrating your backtest kit strategy with a live trading environment.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, making sure operations are handled safely and consistently. It's like a traffic controller for trade commands. In backtesting mode, these commands are ignored, allowing you to simulate trading without real-world impact. When you’re live trading, the `BrokerAdapter` forwards these commands to your registered broker.

It automatically handles signal opening and closing events, routing them to the broker when activated. Other actions like partial profit taking, loss adjustments, and trailing stops are intercepted before they affect the core trading logic, providing a chance to validate or halt the process.

To use it, you first need to register your broker with `useBrokerAdapter`, then activate it with `enable()`. Once activated, it will automatically send signal events. You can deactivate it using `disable()`, and then reactivate later. Think of it as a safety net and a standardized interface for your broker interactions. It ensures that if something goes wrong during a trade (like a rejected order), the core trading system isn't corrupted.

## Class BreakevenUtils

The BreakevenUtils class helps you analyze breakeven events that have occurred during trading. It's like a central place to gather information about how often breakevens have happened and create reports summarizing them.

You can use it to get overall statistics like the total number of breakeven events. It can also build detailed markdown reports that show each breakeven event, including the symbol, strategy used, signal ID, trade direction, entry price, breakeven price, when it happened, and whether it was a backtest or live trade. 

Finally, this class makes it easy to save these reports to files so you can review them later. The reports are saved as markdown files named after the symbol and strategy, for example, "BTCUSDT_my-strategy.md."

## Class BreakevenReportService

This service helps you keep track of when your trading signals reach their breakeven point. It listens for those "breakeven" moments and records them, along with all the details of the signal involved, in a database.

Think of it as a record-keeper for your trading activity, specifically noting when your trades start to look profitable. 

You can tell it to start listening for these events, and it will send the information to your database for later analysis. If you need to stop it from listening, there’s a simple way to unsubscribe. This ensures you don't accidentally log multiple events from the same signal, keeping your data clean and reliable.

## Class BreakevenMarkdownService

This service helps you create and save reports detailing when your trading strategies hit breakeven points. It listens for breakeven signals and gathers information about each event, organizing them by the symbol and strategy being used. 

The service then compiles this information into neatly formatted markdown tables, complete with useful statistics like the total number of breakeven events. These reports are saved as files on your disk, making it easy to review performance.

You can subscribe to receive these breakeven signals, and unsubscribe when you no longer need them. The `tickBreakeven` function is the key to processing those signals and building up the data for your reports.

You can request overall statistics (`getData`), generate a complete report (`getReport`), or save a report directly to a file (`dump`). If you want to start fresh, the `clear` function allows you to erase the accumulated data – either for a specific symbol and strategy or for everything.

## Class BreakevenGlobalService

This service, named BreakevenGlobalService, acts as a central hub for tracking breakeven points within the trading system. Think of it as a middleman – it receives requests related to breakeven calculations and passes them on to another service responsible for the actual work. A key benefit is that it keeps a log of all breakeven activity, which is helpful for monitoring and troubleshooting. 

The service is designed to be easily integrated into the system, relying on other services for tasks like validating strategy configurations and managing connections. It's a single point where the system plugs in breakeven functionality, making maintenance and updates simpler.

It provides two main functions: `check` to determine if a breakeven should be triggered and `clear` to reset the breakeven state when a trade is closed. Both of these functions ensure that logging occurs before the request is forwarded, providing valuable insight into the system's breakeven behavior.

## Class BreakevenConnectionService

The BreakevenConnectionService is like a helper that keeps track of breakeven points for trading signals. It makes sure that each signal has its own dedicated manager, called a ClientBreakeven, to handle its specific calculations.

Think of it as a factory – it creates and manages these ClientBreakeven instances, reusing them when possible to avoid unnecessary work. It’s designed to be efficient, caching instances based on signal ID and whether it's a backtest or live trade. 

Whenever you need to check if a breakeven condition is met or clear a breakeven, this service handles it, delegating the actual work to the ClientBreakeven manager for that specific signal. It also ensures these managed instances are cleaned up when they are no longer needed. It's injected into the overall trading strategy so it has access to the tools it needs.

## Class BacktestUtils

This class, `BacktestUtils`, provides helpful tools for running and analyzing backtests within the trading framework. It acts as a central point for backtest operations, simplifying things with convenient shortcuts and utility functions.

Think of it as a helper class—you don’t create instances directly; it's designed for easy, repeated use.

Here’s a breakdown of what it does:

*   **Running Backtests:** It provides the `run` and `background` functions to start backtests. `run` gives you the results as it goes, while `background` lets you run tests without blocking your program, ideal for silent logging.
*   **Signal Information:**  It allows you to peek at the signals your strategy is generating with functions like `getPendingSignal` and `getScheduledSignal`. You can also check if a signal exists with `hasNoPendingSignal` and `hasNoScheduledSignal`—useful for preventing unwanted actions.
*   **Position Details:** A lot of functions help you understand the status of an open position: `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionEffectivePrice`, `getPositionInvestedCount`, `getPositionPnlPercent`, and `getPositionLevels` give you details about current holdings.
*   **Trailing Stops & Take Profits:** `commitTrailingStop` and `commitTrailingTake` allow you to dynamically adjust your stop-loss and take-profit levels, and there are convenient cost-based versions too.
*   **Managing Signals:**  You can manually activate or cancel scheduled signals with `commitActivateScheduled` and `commitCancelScheduled`, respectively.  You can also close pending positions with `commitClosePending`.
*   **DCA Management:** `commitAverageBuy` simplifies adding additional DCA entries to your positions.
*   **Reporting:** The `getReport` and `dump` functions let you create and save reports summarizing your backtest results.
*   **Instance Management:** BacktestUtils uses a special system (`_getInstance`) to make sure each combination of symbol and strategy gets its own isolated backtest environment.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtesting experiments. It acts like a diligent observer, capturing every signal event – when a strategy is idle, opens a position, is actively trading, or closes a position.

It stores these events, along with all the relevant details, in a database, so you can analyze your strategy's behavior and debug any issues later on. The service connects to the backtest through a signal emitter, and it makes sure you don’t accidentally subscribe multiple times, which could lead to problems.

You can subscribe to receive these events and unsubscribe when you're done; the `subscribe` property gives you the means to do so, and the `unsubscribe` property cleans up afterward. It also utilizes a logger service to provide helpful debugging output during the process.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create reports about your backtesting results. It works by listening to data updates during a backtest and keeping track of the signals generated by your strategies. 

It organizes this data into separate storage areas for each specific combination of symbol, strategy, exchange, timeframe, and backtest run, ensuring each analysis remains isolated. You can then request these reports as nicely formatted Markdown tables, which the service will generate.

These reports can be saved to disk, neatly organized into a `logs/backtest` folder, making it easy to review and share your backtesting performance. If you want to start fresh, there's also a way to clear all the accumulated data or just the data for a specific backtest configuration. The service provides a way to subscribe to backtest events and unsubscribe when finished, ensuring you only receive the data you need.

## Class BacktestLogicPublicService

This service helps you run backtests in a straightforward way. It manages the overall backtesting process and automatically passes along important information like the strategy name, exchange, and timeframe to the underlying calculations. You don't have to manually specify this context in every function call, which simplifies the process. 

Essentially, it's a layer on top of the core backtesting logic that takes care of setting up the environment so your trading strategies can execute smoothly during a backtest. 

The `run` function is the main entry point and will generate a stream of results as the backtest progresses – these results could include signals to open, close, cancel or record ticks.


## Class BacktestLogicPrivateService

This service manages the complex process of running backtests, making it more efficient and easier to understand. It works by first gathering the necessary timeframes for the backtest, then stepping through each one, checking for signals. When a signal appears, it fetches the required historical data (candles) and executes the backtesting logic.

The service cleverly avoids building up large arrays of results, instead streaming them back to you as an asynchronous generator – meaning you get results as they're ready, saving memory. You can even stop the backtest early if needed by interrupting the generator. This streamlines the workflow, allowing you to focus on analyzing the results rather than managing data storage. The `run` method is the main entry point, taking the symbol you want to backtest as input and providing a stream of results detailing the backtest progress.

## Class BacktestCommandService

BacktestCommandService is like a central hub for running backtests within the backtest-kit framework. It acts as a middleman, providing a straightforward way to access the core backtesting capabilities and making it easy to manage dependencies. Think of it as a convenient package that bundles together various services needed for a successful backtest, including validation and logging. 

It provides a `run` method, which is your main entry point for launching a backtest, allowing you to specify the trading symbol and details about the strategy, exchange, and timeframe you want to use. This method then returns a series of results detailing what happened during the backtest, like trades being opened, closed, or cancelled.

## Class ActionValidationService

This service helps keep track of your action handlers, making sure they’re all set up correctly before your trading strategies try to use them. Think of it as a central place to register and double-check that all your actions are available. 

You can add new action handlers using `addAction`, and it will remember them. The `validate` function is great for confirming an action exists before you run something risky, preventing unexpected errors. 

To help things run smoothly, it caches the validation results so it doesn’t have to check everything every time. Finally, `list` lets you see a full overview of all the actions that are currently registered.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of the different actions your system can perform and how they work. It’s like a central directory where you define what each action does, ensuring everything is consistent and type-safe.

This service provides a way to register new actions, validating that they are set up correctly and use only approved methods. You can update existing actions with new information without having to replace the entire definition.

It also has a handy method for quickly checking if a schema is structurally sound before you register it.  The service uses a registry to store and manage these action schemas.  It's a critical component for making sure your actions are well-defined and reliable.

## Class ActionProxy

ActionProxy acts as a safety net when you're using custom actions within your trading strategy. It's designed to prevent errors in your custom code from bringing down the entire system. Think of it like a wrapper that catches any mistakes, logs them, and allows the trading process to continue smoothly.

It handles all the key lifecycle events of an action, like initialization, signal generation (for backtesting, live trading, and specific modes), and cleanup. For each of these, it wraps your user-defined functions in a `try...catch` block. This means if something goes wrong in your code, the error is caught, logged, and the system moves on – you won’t experience a crash.

You don't directly create an ActionProxy; instead, you use the `fromInstance()` method to create one, providing it with your custom action handler.  It’s designed to be used internally by other parts of the framework, ensuring your custom code is handled safely and consistently. Some methods, like `signalSync`, don't have this error protection because they are critical for synchronization and should directly propagate errors. Essentially, ActionProxy ensures a more robust and reliable trading environment, even if your custom actions aren’t perfect.

## Class ActionCoreService

The `ActionCoreService` is the central hub for managing and distributing actions to your trading strategies. Think of it as a dispatcher that makes sure each action gets executed in the right order and with the correct information.

It works by pulling a list of actions from your strategy's blueprint (schema) and then sequentially running handlers for each one. This service handles everything from initial setup (`initFn`) to responding to market events (like `signal`, `breakevenAvailable`, and even scheduled pings) and finally cleaning up when the strategy is done (`dispose`).

Before anything happens, the service validates that your strategy, exchange, and frame configurations are all correct. This validation is cached to avoid unnecessary checks.  You’ll also find methods for clearing action data, with the option to clear specifics or everything at once. The `signalSync` function is a special gatekeeper, ensuring that all actions agree before a position can be opened or closed.

## Class ActionConnectionService

This service acts as a central hub for directing action calls within your backtesting framework. Think of it as a smart router that ensures the right action gets executed for a specific strategy and environment.

It intelligently manages and reuses `ClientAction` instances, storing them based on the action's name, the strategy using it, the exchange involved, and the specific frame it's running in. This memoization significantly boosts performance by avoiding redundant creation of these action instances.

You interact with this service through methods like `signal`, `signalLive`, `breakevenAvailable`, and more – each of these routes specific events to the appropriate `ClientAction`.  There's also a `dispose` method to clean up resources, and a `clear` method to flush the cached action instances when needed.  Essentially, it simplifies the process of connecting events to the right action implementation and optimizes resource usage.

## Class ActionBase

This class, `ActionBase`, is your foundation for building custom actions within the backtest-kit framework. Think of it as a starting point for things like sending notifications, managing state, or collecting data—anything that needs to happen during a strategy’s execution. It handles the repetitive work of logging events and providing access to key information like the strategy's name and the type of action being performed.

You extend this class to create your own specialized handlers. The framework calls various methods on your extended class at different points during execution, like when a signal is received, a breakeven is reached, or a profit milestone is hit.

The `init` method runs once at the beginning, and `dispose` runs once at the end, providing a place for setup and cleanup. The `signal` method is the most frequently called, triggered with every tick or candle. Separate `signalLive` and `signalBacktest` methods let you tailor actions for live and backtesting environments, respectively. There are also methods for specific events like breakeven availability, partial profit/loss milestones, and risk rejections. Basically, if you want to customize what happens during a strategy's run, extend `ActionBase` and override the methods you need.
