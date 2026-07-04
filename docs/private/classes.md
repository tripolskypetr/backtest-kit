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

The WalkerValidationService helps you manage and double-check your parameter sweep setups, often used for optimizing trading strategies. 

Think of it as a central place to keep track of all your "walkers" – configurations that define ranges of parameters to test.

It lets you register new walkers, ensuring they're correctly defined. Before you start a backtest or optimization run, you can use this service to confirm that a walker actually exists and that all the strategies it references are also valid.

It's also designed to be efficient; it remembers validation results so it doesn't have to repeat checks unnecessarily. 

You can easily see a complete list of all walkers you've registered. 

The service relies on other validation services for strategies, risks, and actions to ensure the whole system is consistent.


## Class WalkerUtils

WalkerUtils simplifies working with walkers, providing easy ways to execute them and manage their progress. It acts as a central point for interacting with walkers, automatically handling details like the walker's name and the trading symbol. Think of it as a helper tool for running and monitoring your trading strategies.

You can use it to run walkers and get their results, or run them in the background without needing to see every step. It also allows you to stop walkers cleanly, preventing new signals while allowing existing ones to finish.

It can also gather results into reports or save those reports to a file, and gives you a list of all currently running walkers and their status. This utility uses a single, always-available instance to make things convenient.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your walker schemas in a safe and organized way. It uses a special type of storage to ensure everything is consistent.

You add new walker schemas using `addWalker()` and can find them again by name using `get()`.

Before adding a new schema, `validateShallow()` checks it to make sure it has all the necessary pieces and the types are correct.  If you need to update an existing schema, `override()` lets you change specific parts of it.

The service also has a logger for keeping track of what's happening and the underlying registry holds all your walker schema information.

## Class WalkerReportService

The WalkerReportService helps you keep track of your strategy optimization experiments. It's designed to listen for updates from a walker (which is essentially a process testing different strategy configurations) and record the results in a SQLite database. 

Think of it as a digital notebook for your optimization journey.

It carefully logs the performance of each strategy test, including key metrics and statistics. It also keeps track of which strategy is performing best and how the optimization process is progressing over time.

To use it, you subscribe to the walker's events and the service automatically handles logging.  You can unsubscribe whenever you want to stop receiving updates. It’s made to avoid accidentally subscribing multiple times, making the process more reliable.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and store reports about your trading strategies. It listens for updates from your trading simulations (walkers) and keeps track of how each strategy is performing.

It builds detailed comparison tables that are formatted as Markdown, making them easy to read and share. These reports are saved as files, making it simple to review your strategy's progress over time.

You can subscribe to receive updates from the walkers, and unsubscribe when you no longer need them. The service also provides methods to access and clear the accumulated data. You can generate reports for specific walkers or clear all data.


## Class WalkerLogicPublicService

WalkerLogicPublicService acts as a central hub for managing and executing trading strategies, essentially orchestrating the whole process. It builds upon a private service to handle the core logic, but adds a layer of automatic context management. This means crucial information like the strategy's name, the exchange involved, and the specific timeframe are automatically passed along as the strategies run, streamlining the process and reducing potential errors.

Think of it as a conductor of an orchestra – it makes sure all the different parts (strategies) work together harmoniously and efficiently, with all the necessary details available.

The `run` method is the primary way to interact with this service; it takes a symbol (like a stock ticker) and a context object, and then returns a generator that provides results from running all relevant strategies against that symbol. This allows you to easily retrieve and analyze the results of your backtesting efforts.

## Class WalkerLogicPrivateService

This service manages the process of comparing different trading strategies, acting as an orchestrator behind the scenes. It systematically runs each strategy you provide, keeping track of their progress and performance along the way.

You'll receive updates as each strategy finishes, allowing you to monitor how they're doing in real-time. The service also identifies and remembers the best-performing strategy based on a chosen metric.

Finally, it delivers a comprehensive report, ranking all the strategies you tested so it’s easy to see which ones performed best. To do that, it relies on other services to handle things like logging, generating markdown reports, and defining the overall structure of the tests. Essentially, it coordinates the entire strategy comparison process for you.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with walker functionality within the backtest-kit. Think of it as a simplified bridge between the core walker logic and the public-facing API. 

It bundles together various services responsible for different aspects of validation, ensuring that your trading strategies and associated configurations are sound.

Inside, you'll find components for validating strategies, exchanges, frames, walkers themselves, and even assessing risk and actions within your trading plan. 

The `run` method allows you to execute a comparison process for a specific trading symbol, providing context like the walker, exchange, and frame names involved.  The validation process is intentionally checked multiple times to catch any potential issues.

## Class TimeMetaService

The TimeMetaService helps you reliably track the current candle time for your trading strategies, even when you need it outside of the regular trading loop. It essentially remembers the last known candle timestamp for each combination of symbol, strategy, exchange, and timeframe. 

Think of it as a central record-keeper for these timestamps. It uses a special kind of memory (a BehaviorSubject) for each unique combination, updating it automatically as your strategies run.

If you're working within the trading process itself, it conveniently grabs the timestamp from a nearby source. If you need the timestamp from elsewhere, it waits briefly for the information to become available, ensuring you don't get outdated data.

You can clear this "memory" to ensure everything is fresh when you start a new strategy or trading session. It's a helpful tool for coordinating actions and keeping everything synchronized within your trading framework.

## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions separate and clean. It prevents one backtest from accidentally affecting another by temporarily disconnecting all the event listeners that might be shared globally.

Think of it like creating a clean workspace before each test.

The `createSnapshot` method is the key: it takes a picture of how things are currently set up (all those global event listeners) so you can revert back later. This allows you to run multiple backtests without them stepping on each other's toes. Once you're done with a backtest, you can restore the listeners to their original state.

## Class SyncUtils

SyncUtils helps you understand and report on the lifecycle of your trading signals. It collects data about when signals are opened and closed, giving you insights into signal performance.

Think of it as a tool to analyze how your strategies are interacting with signals. It gathers information from signal opening and closing events.

You can use it to:

*   Get statistical summaries of signal activity.
*   Generate detailed reports in markdown format, including tables showing signal details like entry prices, take profit levels, and profit/loss.
*   Save those reports to files for later review or sharing.

The data comes from events tracked by another component that listens for signal activity and stores reports, up to 250 events per signal combination. This information can be used to see how different strategies perform on a specific symbol.

## Class SyncReportService

The SyncReportService helps keep track of what’s happening with your trading signals. It’s designed to record important moments in a signal's lifecycle, specifically when a signal is initially opened (like when a limit order gets filled) and when a position is closed. 

Think of it as a detailed audit trail for your trading activity.

It listens for these "sync" events and saves them to report files. The service logs all the important information about these events, like the signal’s details when it opens and the profit/loss and reason for closing when a position exits.

You can subscribe to receive these events, and there's a way to unsubscribe when you no longer need them. It prevents accidental duplicate subscriptions, ensuring a clean record-keeping process. The service also relies on a logger to provide helpful debugging information.


## Class SyncMarkdownService

This service is responsible for creating and saving reports detailing signal synchronization events during backtesting or live trading. It listens for events like signals opening and closing and organizes them by symbol, strategy, exchange, and timeframe.

You can subscribe to receive these synchronization events. Importantly, you only need to subscribe once; subsequent calls to subscribe will return the same unsubscribe function, preventing multiple subscriptions.  Remember to unsubscribe when you’re finished to properly clean up resources.

The `tick` function processes each incoming synchronization event, adding a timestamp and categorizing it. You can retrieve accumulated statistics for a specific symbol, strategy, exchange, timeframe and backtest status using `getData`.  A formatted markdown report can be generated using `getReport` which includes a table of events and key statistics like total events, opens, and closes.  The `dump` function then writes this report to a file on disk.

Finally, the `clear` function allows you to delete all accumulated synchronization data. You can clear all data, or specifically clear the data for a particular symbol, strategy, exchange and timeframe.

## Class StrategyValidationService

This service helps manage and verify your trading strategies. It keeps track of all your strategies, making sure they exist before you try to use them and confirming that any linked risk profiles or actions are set up correctly. To help things run smoothly, it remembers the results of validations so it doesn't have to repeat the same checks unnecessarily.

You can use it to register new strategies with `addStrategy`.
It offers comprehensive validation with `validate`, ensuring everything related to a strategy is in order.
Finally, `list` provides a way to see a complete overview of all the strategies you've registered.

The service relies on other services, `riskValidationService` and `actionValidationService`, for validating risk profiles and actions respectively. Internally, it uses a `_strategyMap` to store and manage the registered strategy configurations.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's like a tool that gathers all the little events that happen during a strategy's execution – things like taking profits, setting stops, or canceling orders.

You can ask it for a summary of the events, which gives you key statistics like how often each type of action occurred. It also can create detailed reports, presented in a readable markdown format. These reports list each event, including the price, percentage values, and timestamps, to give you a complete picture of what happened.

Finally, you can easily save these reports to a file on your computer, allowing for long-term tracking and review. The filename clearly indicates the symbol, strategy, and settings used.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're all structured correctly. It uses a special system to store these blueprints in a safe and organized way.

You can add new strategy blueprints using the `addStrategy()` function, and then find them again later by their names. 

The service also checks that new blueprints have the necessary components before they're stored, preventing errors down the line. 

If a blueprint already exists, you can update parts of it using the `override()` function. Finally, the `get()` function lets you easily retrieve a blueprint by its name when you need it.

## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions. Instead of building up a report in memory, it writes each event – like cancelling a scheduled order, closing a pending position, taking partial profits or losses, adjusting trailing stops or take-profits, or setting a breakeven – immediately to a separate JSON file.

To start using it, you need to subscribe to the service.  Once subscribed, the system automatically logs specific events with relevant details like the strategy name, exchange, timeframe, signal ID, and profit/loss information.  To stop the logging, you simply need to unsubscribe.

Here's a quick rundown of the different event types it handles:

*   **cancelScheduled:** Records when a scheduled order is cancelled.
*   **closePending:**  Logs when a pending order is executed.
*   **partialProfit:** Details the closing of a portion of the position at a profit.
*   **partialLoss:** Records when a portion of the position is closed at a loss.
*   **trailingStop:** Tracks adjustments to the trailing stop-loss level.
*   **trailingTake:** Records adjustments to the trailing take-profit level.
*   **breakeven:** Logs when the stop-loss is moved to the entry price.
*   **activateScheduled:** Captures early activation of a scheduled signal.
*   **averageBuy:** Records adding a new averaging buy.



Remember, subscribing is essential before logging starts, and unsubscribing stops the process and cleans up resources.

## Class StrategyMarkdownService

This service helps you track and understand what your trading strategies are doing during backtests or live trading. It's like a detailed logbook that gathers information about key actions your strategy takes, such as closing positions, adjusting stops, and more.

Instead of writing each event to a file right away, it temporarily holds these events in memory—up to 250 per strategy and symbol. This allows for more efficient and organized reporting.

To start using it, you need to "subscribe" to begin collecting data. Once subscribed, it automatically records events as your strategy executes.  You can then use methods like `getData()` to get a summary of events, or `getReport()` to create a nicely formatted markdown report, or `dump()` to save that report to a file.

When you're finished, you need to "unsubscribe" to stop the collection and clean up the stored data.

It's organized around a memoized storage system, so it efficiently manages data for each unique combination of symbol, strategy, exchange, frame, and whether it’s a backtest or live run. The `loggerService` property is available for logging.

There are methods for specific events like `cancelScheduled`, `closePending`, `partialProfit`, `trailingStop` and others, which get recorded. You can control how the report looks by specifying which columns to include.  Finally, there's a `clear` method to remove all collected data, or to selectively clear data for specific symbols and strategies.

## Class StrategyCoreService

This service acts as the core for running trading strategies within the backtest framework. It essentially manages the execution of strategies by injecting relevant information like the trading symbol, timeframe, and backtest parameters.

It provides methods to retrieve various details about the current trading position, such as pending signals, total cost, entry prices, P&L information, and partial close details. 

This service also handles actions like validating strategies, cancelling scheduled signals, closing positions, and triggering various events related to trading activities.  It includes features for backtesting, stopping strategies, and managing scheduled signals. It keeps track of numerous position statistics, including profit and loss metrics, durations, and distances between peak profit and drawdown points, all essential for detailed analysis.


## Class StrategyConnectionService

This service acts as a central router for strategy operations within the backtest framework. It connects incoming calls to the correct implementation of a trading strategy, ensuring the right strategy handles a specific symbol. The service intelligently caches these strategy implementations to improve performance.

Before any strategy actions are taken, it makes sure the strategy has initialized properly. It handles both live trading and backtesting scenarios.

The service utilizes several other components for its operations, including logging, risk management, exchange connections, and price data.

To retrieve a strategy, it checks for a cached version based on the trading symbol, strategy name, and exchange. If not found, it creates the strategy and caches it.

It provides methods to check various aspects of a strategy's state, like whether it has a pending or scheduled signal, or if it's stopped.

The service also allows for direct interaction with strategies, including executing trades, adjusting stop-loss/take-profit levels, and canceling scheduled actions. It offers APIs to retrieve information about the current position, such as cost, profit/loss, and entry prices.

It provides methods for backtesting, simulating live trading ticks, and controlling the overall strategy state. It has mechanisms for partial profit/loss closing and managing DCA entries.


## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a flexible middleman for how your trading strategies store information about signals. Think of it as a customizable system that lets you choose where and how those signals are kept—whether that's on your computer's hard drive, in your computer's memory, or even in a "dummy" setup that doesn't actually save anything.

It uses a design pattern that allows you to easily swap out different storage methods without changing the core logic of your trading strategies. The default is to store signals persistently, meaning they are saved to disk. However, you can switch to storing them only in memory for faster access, or use the dummy adapter for testing.

The `getInstance` property is smart—it builds the storage system only once and keeps it ready for use, improving efficiency. It remembers the last configuration and rebuilds it if you change the base directory.

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods are how the adapter reacts to changes in your signals, passing those updates along to the chosen storage. Functions like `findById` and `list` let you retrieve signals based on their ID or see all of them. 

`useStorageAdapter` lets you plug in your own storage implementation entirely. `useDummy`, `usePersist`, and `useMemory` provide quick ways to switch between common storage methods. Finally, `clear` resets the internal memoization, important when your base directory changes.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage signal data during backtesting. It acts as a central point for interacting with different storage solutions, letting you easily switch between in-memory, persistent (disk-based), or dummy storage. By default, it uses in-memory storage for quick experimentation, but you can swap this out for persistent storage to save your data or a dummy adapter to test without writing anything at all.

This adapter handles events related to signals – when they're opened, closed, scheduled, or canceled – and passes these actions on to the currently active storage. You can retrieve signals by their ID or list all of them. It also keeps track of when signals are "pinged" (updated) during active or scheduled states.

You can change the storage backend by using methods like `useDummy`, `usePersist`, or `useMemory`, and it's important to clear the adapter’s internal cache with `clear` if your working directory changes between backtest runs. This ensures that the storage utilities are re-initialized with the correct configuration.

## Class StorageAdapter

The StorageAdapter acts as the central hub for managing your trading signals, handling both historical backtest data and real-time live data. It automatically keeps track of signals as they're generated, ensuring your storage is always up-to-date.

You can easily control when this storage is active – enabling it subscribes to signal updates, and disabling it stops those subscriptions; it’s safe to disable even if it's already disabled.

Need to find a specific signal? The `findSignalById` method lets you locate signals by their unique ID, searching across both backtest and live data.

If you want to review past performance, use `listSignalBacktest` to retrieve a list of all backtest signals. Or, `listSignalLive` will give you a list of all signals currently being tracked in a live environment.

## Class StateLiveAdapter

The `StateLiveAdapter` is a flexible tool for managing and storing trading state, especially useful for strategies that need to react dynamically, like those driven by LLMs. It lets you easily swap out different storage methods – like using memory only, saving data to files, or even discarding all changes – without altering the core strategy logic.

The adapter automatically persists important information like peak performance and how long a trade has been open, even if your application restarts. This is vital for sophisticated rules, such as automatically exiting a trade if it hasn't confirmed an expected market behavior after a certain amount of time.

You can choose between several built-in storage options or provide your own custom implementation. The `disposeSignal` function is important for cleaning up resources when signals are finished. The `useLocal`, `usePersist`, `useDummy`, and `useStateAdapter` methods provide quick ways to change how state is managed. Finally, the `clear` method helps ensure data freshness if your working directory changes.

## Class StateBacktestAdapter

The StateBacktestAdapter helps manage and store the state of your trading strategies, allowing for flexible and adaptable storage options. It acts as a central point for handling state data, letting you easily switch between different storage methods without changing the core strategy logic.

You can choose to use an in-memory store for quick and simple tracking, a persistent storage option that saves data to disk, or a dummy adapter for testing and development purposes. This flexibility is especially useful for tracking metrics like peak performance and trade duration, as demonstrated by the example use case of evaluating LLM-driven trading rules.

The adapter keeps track of specific data points—like peak performance and how long a trade has been open—for each signal, allowing you to monitor and adjust strategies based on real-time data. 

You can also clear the stored data to ensure fresh instances when the base directory changes, and specific functions allow you to read and update the state data. It also provides a way to dispose of old state data when signals are cancelled.

## Class StateAdapter

The StateAdapter acts as a central hub for managing the data used during backtesting and live trading. It keeps track of the signal lifecycle, automatically cleaning up old data when signals are finished. 

To prevent accidental issues, it ensures that subscriptions to signals happen only once. 

You can use `enable` to start tracking a signal's state, and `disable` to stop. 

The `getState` function lets you retrieve the current value of a signal’s state, and `setState` allows you to update that value. The adapter intelligently directs these operations to the correct storage location, whether it's for backtesting or live trading, depending on the signal's settings.

## Class SizingValidationService

The SizingValidationService helps you keep track of and double-check your position sizing strategies. Think of it as a central hub for managing these strategies.

It lets you register new sizing approaches using `addSizing`, ensuring they're known to the system.

Before you try to use a sizing strategy, `validate` confirms it’s actually registered – preventing errors.

The service also remembers its validation results to work faster.

Finally, `list` provides a way to see all the sizing strategies you’ve registered.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of different sizing strategies for your trading system. It's like a central library for these sizing rules.

It uses a special registry to store these sizing schemas in a way that helps prevent errors by ensuring they're of the correct type.

You add new sizing schemas using `addSizing()`, and you can retrieve them later by their assigned name.

Before a sizing schema is added, a quick check (`validateShallow`) makes sure it has all the necessary pieces in the right format.

The service allows you to update existing sizing schemas as well, using the `override()` method.

## Class SizingGlobalService

The SizingGlobalService is a central component responsible for determining how much to trade in each operation. It takes into account various factors and uses a connection service to perform the actual calculations. 

Think of it as the engine that figures out the size of your trades, ensuring they align with your risk management rules.

It relies on other services to validate and perform sizing calculations.

Specifically, it has a `calculate` method that takes parameters related to risk and a context to determine the final position size. This service is used both internally by the trading framework and exposed through its public API.


## Class SizingConnectionService

The SizingConnectionService acts as a central hub for all your sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the specific sizing method you've configured, like fixed percentage or Kelly Criterion.

To improve efficiency, it remembers (memoizes) which sizing methods have already been loaded, so it doesn't need to recreate them every time you need them. 

The service uses a `sizingName` to identify the correct sizing method to use. If your strategy doesn't have specific sizing rules, the `sizingName` will be an empty string.

It calculates the ideal position size based on your risk management parameters and the chosen sizing method. You provide the necessary parameters for the calculation, and the service handles the rest, ensuring accurate sizing throughout your backtesting process.


## Class SessionLiveAdapter

This component helps manage live trading sessions, allowing you to easily switch between different storage methods. It acts as a central hub, letting you plug in various ways to store and retrieve session data, like using a file on your computer, keeping it only in memory, or essentially ignoring the data entirely.

The system automatically saves and loads data based on your chosen method, making it easy to continue where you left off, even after restarting. It remembers the sessions for specific symbols, strategies, exchanges, and frames.

You can quickly switch to using local, persistent (file-based), or dummy adapters for different testing or deployment scenarios. If you have a custom storage solution, you can even plug that in directly. 

There’s a way to clear the data cache – important if your working directory changes frequently, so your sessions always use the correct location.


## Class SessionBacktestAdapter

This framework component, the SessionBacktestAdapter, helps manage and store data during your backtesting runs. Think of it as a flexible container that holds the session information for each trading strategy.

It's designed to be adaptable; you can easily switch between different storage methods. By default, it uses an in-memory storage, which is fast but data isn't saved.  Alternatively, it can save data to disk, or even act as a dummy – useful for testing without actually writing anything.

You can quickly change the storage backend using simple commands like `useLocal()`, `usePersist()`, and `useDummy()`. There's also a way to plug in completely custom storage solutions if you need something specific. 

The adapter keeps track of things like symbol, strategy name, exchange, and frame to organize data effectively.  It also memoizes instances, which means it tries to reuse existing data whenever possible to speed things up. If the working directory of your process changes, you'll want to clear out this memoized cache to ensure fresh instances are created. You can do this using the `clear()` method.  It allows you to read and write data during the backtest process through the `getData()` and `setData()` methods.

## Class SessionAdapter

The `SessionAdapter` acts as a central hub for managing data during both simulated backtesting and live trading. It intelligently directs data storage and retrieval requests to the appropriate system – either a backtest-specific storage or a live trading storage – depending on whether you're running a backtest or a live session.

You can use `getData` to retrieve previously stored data for a particular signal, specifying the symbol, relevant context like the strategy and exchange names, whether you're in a backtest, and a timestamp. Similarly, `setData` lets you update or add new data to the session, again routing the request to the correct storage based on the backtest flag. Essentially, it handles the behind-the-scenes logic of where your data lives.


## Class ScheduleUtils

This class is designed to help you easily understand and monitor scheduled trading signals. It acts as a central point to access and report on the performance of your scheduled signals. 

Think of it as a tool that gathers information about your signals – whether they were successfully processed, cancelled, and how long they took to be handled.

You can retrieve detailed statistics for specific trading strategies and symbols. 

It can also generate clear, readable reports in markdown format, or save those reports directly to a file. This is a single, readily available tool to help keep track of scheduled signal processing.

## Class ScheduleReportService

This service helps you keep track of when signals are scheduled, opened, and cancelled, which is useful for understanding any delays in your trading. 

It acts as a listener for signal events, recording each significant step in the signal's lifecycle. 

The service calculates how long a signal takes from its initial scheduling until it's either executed or cancelled, allowing for performance monitoring and analysis.

You can subscribe to receive these signal events, and crucially, it prevents you from accidentally subscribing multiple times. Remember to unsubscribe when you no longer need the service to stop receiving updates.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps keep track of when signals are scheduled and cancelled, and creates easy-to-read reports about them. It listens for these events, organizes them by strategy, and then compiles them into markdown tables. You'll find helpful statistics like cancellation rates and average wait times in these reports.

Essentially, it gathers information about signal events and generates files, saved as markdown documents, that provide a summary of what's happening.

Here’s what you can do with the service:

*   It manages its data using a special storage system that keeps events separate for each symbol, strategy, exchange, frame, and backtest setup.
*   You can subscribe to receive signal events, and unsubscribe when you no longer need to.
*   The service automatically generates reports, and you can also request reports or clear the collected data as needed.
*   It’s designed to save reports to files on your system, making it easy to review your trading activity.

## Class RiskValidationService

This service helps keep track of your risk management configurations and makes sure they're set up correctly before you use them. Think of it as a central place to register all your risk profiles, ensuring they’re available when needed.  It also remembers past validation checks to speed things up. 

You can add new risk profiles using `addRisk`, check if a profile exists with `validate`, and get a complete list of registered profiles using `list`.  Behind the scenes, it uses a technique called memoization to avoid unnecessary checks, keeping everything efficient. It relies on a logger service to provide informative messages and maintains an internal map to manage risk profiles.

## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejection events within your trading system. It's like having a central place to gather information about when and why your trades were flagged or rejected.

You can use it to get statistical summaries, like the total number of rejections and how they're distributed across different symbols and trading strategies.

It's also designed to create detailed markdown reports, essentially putting all rejection events into a nicely formatted table showing details like the symbol, strategy, position, price, and reason for the rejection.

Finally, it lets you save these reports directly to files, making it easy to share and review them. Think of it as a way to easily document and investigate potential issues in your trading setup. This class uses a singleton pattern, meaning there's only one instance of it available.

## Class RiskSchemaService

The RiskSchemaService helps keep track of your risk schemas in a safe and organized way. It's designed to store and manage these schemas, ensuring they are consistent and well-defined. 

You can add new risk schemas using the `addRisk()` method (though it’s technically called `register` in the code), and then find them again later by their name using `get()`.

If you need to make small changes to an existing schema, you can update it with `override()`. Before you add a new schema, `validateShallow()` checks to make sure it has all the necessary parts and they are the expected types. 

It relies on a system for managing types (`ToolRegistry`) to keep things accurate and prevent errors.


## Class RiskReportService

The RiskReportService helps you keep a record of when trading signals are rejected by your risk management system. It’s designed to listen for these rejection events and store the details – like why the signal was rejected and what it was – in a database.

Think of it as a system for auditing your risk decisions.

It’s built to be easy to use; you subscribe to the service to start receiving and logging rejection events, and you can unsubscribe to stop. The service prevents you from accidentally subscribing multiple times, ensuring your database isn't overwhelmed. It uses a logger to provide helpful messages during operation.

## Class RiskMarkdownService

The RiskMarkdownService helps you create and save reports detailing risk rejections that occur during your trading tests. It monitors for rejection events and organizes them by the trading symbol and strategy being used. 

The service compiles this information into neatly formatted Markdown tables, along with summary statistics like the total number of rejections and breakdowns by symbol and strategy. These reports are saved as files, making it easy to review and analyze what went wrong.

You can subscribe to receive these rejection events, and the service makes sure you don't accidentally subscribe multiple times. To stop receiving events, there's an easy unsubscribe function. 

The service offers functions to retrieve statistical data, generate the full report, save it to a file on your computer, or clear all accumulated data. You can also clear data for a specific symbol and strategy if needed. It uses a storage system that keeps data for each symbol, strategy, exchange, frame and backtest combination separate.

## Class RiskGlobalService

RiskGlobalService is a central component responsible for managing risk controls within the trading system. It acts as a gatekeeper, ensuring trades adhere to pre-defined risk limits and protocols. This service leverages a connection to a risk management system, validating configurations and logging activities for auditing purposes.

It provides methods to verify trading signals, with a specialized function `checkSignalAndReserve` that guarantees safe, concurrent validation and resource allocation, preventing conflicts when multiple strategies attempt to trade simultaneously. When a trade is approved, `addSignal` registers it within the risk management system, while `removeSignal` cleans up when a trade closes. Finally, `clear` allows you to wipe the slate clean, either removing all risk data or just data associated with a specific risk setting.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It directs risk-related operations to the correct risk implementation based on a provided name. Think of it as a router ensuring that risk calculations are done by the right specialist for the job.

To improve performance, it cleverly caches these risk implementations, so it doesn't have to recreate them every time they're needed.

Here's a breakdown of what it can do:

*   **`getRisk`:** This function retrieves the appropriate risk implementation, either from the cache or by creating it if it doesn’t exist yet. It considers the exchange and timeframe used for trading.
*   **`checkSignal`:**  The core function for validating trades. It verifies that a potential signal complies with predefined risk limits, such as portfolio drawdown, symbol exposure, and position counts. If the signal is rejected, it triggers an event.
*   **`checkSignalAndReserve`:**  A special version of `checkSignal` designed for concurrent trading environments. It validates a signal *and* reserves space for it, ensuring that multiple simultaneous requests don't conflict.
*   **`addSignal`:** Used to register a newly opened trade (signal) with the risk management system.
*   **`removeSignal`:** Used to remove a closed trade from the risk management system.
*   **`clear`:** This function clears the cached risk implementation, useful for resetting or refreshing the system.

The service relies on other components like `RiskSchemaService` and `TimeMetaService` for data and time-related operations and operates with services like `loggerService` and `actionCoreService`. It's designed to be injected with these dependencies to keep it flexible and testable.

## Class ReportWriterAdapter

This component helps manage how your trading data and analytics are saved, allowing you to easily switch between different storage methods. It uses a flexible design, so you can plug in various storage solutions like JSON files without changing your core code.

It keeps track of your reports (like backtest results, live trading data, or walker data), making sure there's only one storage instance for each type of report.

You can customize the way reports are stored by setting a new "ReportFactory," which defines the storage mechanism. The default is to store data in JSONL files, which is great for appending data over time.

The `writeData` function is how you actually save your data, and it automatically sets up the storage the first time you use it for a particular report type. 

It’s designed to work in real-time, logging events to files as they happen.

If you need to test or discard data, you can temporarily use a "dummy" adapter which ignores all writing operations, or switch back to the standard JSONL format. Clearing the cache is useful if your working directory changes.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework are generating detailed logs. You can choose to track events from things like backtesting, live trading, or performance analysis, and it will automatically write those events to JSONL files.

Think of it as a way to selectively turn on or off logging for different aspects of your testing and trading activities.

The `enable` method lets you choose which services you want to monitor, and it’s really important to remember that it gives you a function to unsubscribe later – don't forget to call that function to avoid memory issues!

The `disable` method lets you stop logging for specific services without affecting others. It doesn't require a separate unsubscribe function because it stops the logging immediately.

## Class ReportBase

The `ReportBase` class provides a way to log events as JSON data to files, designed for tracking and analyzing trading activity. It creates a single JSONL file for each report type, writing data line by line and managing the writing process efficiently.

This system handles potential bottlenecks by pausing writes when the buffer is full and includes a timeout to prevent writing operations from hanging indefinitely. It automatically organizes the log files into directories, and errors are reported through a defined error handling mechanism.

You can easily search these logs based on criteria like the trading symbol, strategy name, exchange, timeframe, signal ID, or walker name. The `waitForInit` method ensures the file and stream are properly set up, and the `write` method is used to append event data along with helpful metadata and a timestamp for future analysis.


## Class ReportAdapter

This framework component, the ReportAdapter, helps manage and store your trading data in a structured way. It acts as a flexible middleman, allowing you to easily switch between different storage methods like JSONL files or other custom solutions. 

The adapter remembers which storage method you're using, creating only one storage instance for each type of report to keep things efficient. It starts writing data only when needed and provides a way to temporarily disable all data writes using a "dummy" adapter.

You can easily change the default storage method it uses.  If your working directory changes during testing, clearing the adapter's cache ensures fresh storage instances are used with the correct location. It's designed for creating analytics pipelines and consistently logging events related to your trading strategies.


## Class ReflectUtils

This utility class provides a way to easily track key performance metrics for your trading strategies, like profit, losses, and drawdown. It’s designed to work consistently whether you're running a live strategy or backtesting historical data.

Think of it as a central hub for getting real-time position information. You can request things like unrealized profit/loss (in both percentage and dollar amounts), the highest profit price achieved, and metrics related to drawdown (how far your position has fallen from its peak).

It also provides insights into how long a position has been active or waiting to be triggered, and how far it is from its profit peak or drawdown trough.

This class is structured as a singleton, so you only need one instance to access all its functions, making it straightforward to integrate into your trading framework.  It handles the complexity of accessing and validating that data, allowing your strategies to focus on decision-making. The `backtest` parameter allows it to function across various operating modes.


## Class RecentLiveAdapter

This component helps manage and access recent trading signals, allowing you to choose where those signals are stored – either persistently on disk or temporarily in memory. It acts as a central point for retrieving the latest signals and determining how long ago they were created.

You can easily switch between different storage methods using `usePersist` (for disk storage) and `useMemory` (for in-memory storage). The system remembers the stored signals, so you don’t have to load them repeatedly.  If you need to change the underlying storage mechanism, you can specify a custom adapter using `useRecentAdapter`.

The `clear` function is important when running multiple strategies because it ensures a fresh instance of the storage adapter is created whenever the working directory changes, preventing potential issues.  Retrieval functions like `getLatestSignal` and `getMinutesSinceLatestSignalCreated` simply pass requests to the currently selected storage adapter, keeping the logic clean and consistent.

## Class RecentBacktestAdapter

This component helps manage and access recent trading signals, providing flexibility in how that data is stored. It acts as a bridge, letting you choose between keeping signals in memory or saving them persistently to disk.

The system uses a factory pattern, meaning you can easily swap out the underlying storage mechanism without altering the main logic. By default, signals are stored in memory, but you can switch to persistent storage with a simple command. 

It caches the storage instance to improve performance, ensuring it’s only rebuilt when necessary. If you're dealing with changing environments or strategy iterations, you can clear this cache to force a refresh of the storage instance. The adapter handles retrieving signals, calculating time since creation, and responding to ping events, all by passing those requests to the currently configured storage.

## Class RecentAdapter

This component, the RecentAdapter, is responsible for managing and providing access to recent trading signals, whether you're running a backtest or a live trading system. It automatically updates its data by listening for changes and ensures you always have the most recent signal information available.

To avoid unnecessary processing, it only subscribes to data updates once.

You can easily turn on and off the data collection with the `enable` and `disable` methods; disabling is safe to do repeatedly.

The `getLatestSignal` method lets you retrieve the newest signal for a specific asset, strategy, and timeframe. It prioritizes backtest data first, and includes a safeguard to prevent using future signals (look-ahead bias protection).

Finally, `getMinutesSinceLatestSignalCreated` calculates how long ago the latest signal was generated, also respecting the look-ahead bias limitation.

## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup, like a particular symbol, strategy, exchange, and time frame. Think of it as a central place to look up prices when you need them outside of the usual trading tick process.

It keeps track of prices for each unique combination of those settings, updating them with new information as it becomes available. If a price hasn't been received yet, it will wait a little while to see if one arrives.

It’s designed to be simple to use: if you're already in the middle of a trade, it can fetch prices directly from the exchange; otherwise, it pulls from its cached records.  You can either clear out all the stored prices or just clear the price for a specific setup. Importantly, it's cleaned up at the beginning of a new trading period to make sure you’re always working with the most up-to-date data. It’s like a memory for prices, updated by the trading system.

## Class PositionSizeUtils

This class helps you figure out how much to trade – specifically, how many shares or contracts to buy or sell. It provides different ways to calculate your position size, taking into account factors like your account balance and the price of the asset.

Think of it as a toolkit with different strategies:

*   **Fixed Percentage:** This method simply sizes your position based on a fixed percentage of your account balance.
*   **Kelly Criterion:** This more sophisticated method considers your win rate and win-loss ratio to determine an optimal position size – aiming to maximize long-term growth.
*   **ATR-Based:** This strategy uses the Average True Range (ATR) to gauge volatility and size your position accordingly, often incorporating risk management principles.

Each method includes checks to make sure the information provided is suitable for the calculation it’s performing. It's designed to ensure you're using the right sizing technique for the situation and that the input data is valid.

## Class Position

The Position class provides helpful tools for figuring out where to set your take profit and stop loss levels when you’re trading. It cleverly adjusts the direction of these levels depending on whether you're going long (buying) or short (selling). 

There are two main methods available:

The `moonbag` method helps calculate levels based on a simple strategy: your take profit is set at a fixed percentage above or below the current price.

The `bracket` method offers more flexibility, allowing you to define your own custom take profit and stop loss percentages. This lets you tailor your risk management to specific situations.

## Class PersistStrategyUtils

This utility class helps manage how a strategy's state is saved and loaded, especially when dealing with delayed actions or data. It ensures each strategy has its own storage space, and lets you customize how that storage works – whether it's a standard file, a custom system, or even a dummy setup for testing.

The class automatically creates these storage spaces whenever needed and safely handles writes and reads. It's used internally by the ClientStrategy to keep track of actions like submitting orders that haven't been fully processed yet.

You can change the way strategies are persisted using functions like `usePersistStrategyAdapter` to use a custom storage method or `useJson` and `useDummy` for simpler file-based or no-op persistence.  The `clear` function helps ensure everything is fresh if your working directory changes.


## Class PersistStrategyInstance

This class provides a way to save and load the state of your trading strategy to a file. It’s designed to be reliable, even if your program crashes unexpectedly.

It handles the details of safely writing data to a file, so you don't have to worry about data corruption.

The class is built around a fixed identifier ("strategy") which is used to locate the strategy's saved state within the file. 

You specify the trading symbol, strategy name, and exchange name when you create it.

The `waitForInit` method ensures that the underlying storage is ready before you start saving or loading data.

The `readStrategyData` method retrieves the saved strategy data from the file, or returns nothing if no data is found.

Finally, `writeStrategyData` allows you to save the current state of your strategy to the file, or to clear the saved state by passing `null`.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, ensuring signals are preserved across sessions. It provides a convenient way to handle storage, creating specialized storage areas for backtesting and live trading modes. You can think of it as a central hub for keeping your signal data safe.

It automatically manages different storage solutions, allowing you to easily switch between them – from using files to even a dummy storage for testing purposes. 

If you need to use a custom way to store your signal data, you can register your own storage creator with this class. This also lets you swap out the storage method without changing a lot of code.

Importantly, it keeps track of storage instances to avoid creating duplicates and guarantees that read and write operations are done carefully to prevent data loss. It's designed to be reliable, even if things go wrong.

To help with consistent behavior, there's a way to clear out the memory of previously used storage methods when needed, like when your working directory changes.

## Class PersistStorageInstance

This class provides a way to save and load your trading signals to files, making your backtesting process more reliable. It's designed to work with the backtest-kit framework. 

Each signal is stored as a separate JSON file, allowing for easy management and recovery. The system ensures data safety even if unexpected issues occur during saving.

You can initialize the storage with `waitForInit`, and retrieve all saved signals using `readStorageData`. When updating signals, `writeStorageData` handles saving each signal individually, linked to its unique identifier. This implementation focuses on file-based persistence, a suitable choice for many backtesting setups.


## Class PersistStateUtils

This utility class helps manage how your trading strategy’s state is saved and loaded. It focuses on efficiently handling storage, so you don't have to worry about the underlying details. 

Think of it as a smart system that remembers which storage method to use for each piece of data in your strategy, and it ensures that these storage instances are created and handled in a controlled way.

The system caches these storage instances, creating a new one only when needed, and allows you to swap out the storage mechanism (like using a file or a dummy adapter for testing). It also provides ways to clear out old cached instances and clean up when a trading signal is no longer needed. You can initialize storage, read existing data, and save changes, all while the system handles the low-level details to keep things reliable.

## Class PersistStateInstance

This class provides a way to save and load state data persistently, often to a file. It’s designed to work specifically with data related to a signal.

Essentially, it manages the storage of your data, using a unique identifier (the signal ID) and a bucket name to organize the information.  Think of the bucket name as a way to categorize the data within that signal's storage.

It handles the complexities of safely writing data to disk and reading it back. The `waitForInit` method ensures the storage is ready before you start using it. You use `readStateData` to get the saved data and `writeStateData` to save updated information.

Importantly, `dispose` does nothing directly; it relies on a separate utility function (`PersistStateUtils.dispose()`) to clean up any related resources, like cached data.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, especially when a strategy is running. It makes sure each strategy has its own dedicated storage for signal data.

It uses a clever system to avoid creating unnecessary storage objects and supports different ways to store data – you can customize how signals are persisted.

The class ensures that reading and writing signal data happens reliably, even if there are unexpected interruptions.  It's designed to work seamlessly with the `ClientStrategy` when it's actively trading.

You can influence which storage mechanism is used – for example, switching to a file-based system or using a dummy system for testing. If you change your working directory, remember to clear the cache to refresh the stored data.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, provides a way to reliably save and load signal data to disk. Think of it as a safe keeper for your trading signals. It uses a file-based system, meaning it stores data in files on your computer. 

It's designed to work within a specific trading context – defined by a symbol, strategy name, and exchange – and uses the symbol itself to identify each signal.  The class handles the file writing process carefully to prevent data loss even if something unexpected happens during the process.

Here's a quick breakdown of what it does:

*   It initializes itself with the symbol, strategy name, and exchange information.
*   It retrieves signal data from the file using the symbol.
*   It saves signal data to the file, or clears it if you provide a null value.
*   The `waitForInit` method helps to make sure the storage is ready before you start interacting with it.



The `_storage` property is a hidden detail—it’s the actual file-based system doing the work behind the scenes.

## Class PersistSessionUtils

This class helps manage how your trading session data is saved and loaded, ensuring that it's done reliably even if your program crashes. It essentially creates a safe place to store information about your strategy, exchange, and trading frames.

It intelligently handles these storage locations, using a memoization system – meaning it only creates the necessary storage areas once and reuses them. It’s designed to work with different storage methods, offering options like using a standard file-based system or a dummy implementation for testing.

You can also customize how data is persisted by providing your own storage adapters, and the class takes care of clearing and cleaning up these stored session details when they're no longer needed. This is particularly useful when running multiple strategies or switching between different working directories.


## Class PersistSessionInstance

This class provides a way to save and load session data, like settings or intermediate results, for a specific trading strategy and exchange combination.  It acts as a middleman, wrapping a file-based storage system to ensure that data is written reliably.  Each session is identified by its name, the exchange it's used with, a frame name, and the trading symbol it applies to.  The symbol and whether it's a backtest are critical to prevent accidentally overwriting data between different symbols or backtest runs.

The class handles the storage details so you don't have to worry about the underlying file management.  It includes properties to hold these identifying details and the storage itself. Importantly, it's designed to work in conjunction with `PersistSessionUtils`, which handles things like clearing caches when a session is finished. The `dispose` method doesn't do anything itself; it relies on the `PersistSessionUtils` for that task. You use the methods `readSessionData` and `writeSessionData` to load and save the session data. `waitForInit` initializes the underlying storage.

## Class PersistScheduleUtils

This class helps manage how scheduled signals are saved and loaded, especially for trading strategies. It ensures that each strategy’s scheduled signals are stored in a way that's reliable and doesn’t lose data even if there are crashes.

Think of it as a helper that makes sure your signals are saved correctly and consistently.

You can customize how these signals are stored by providing your own storage methods, or you can use the built-in options like file-based storage or a dummy mode for testing.

The `getScheduleStorage` function is smart; it only creates a storage instance once for each trading symbol, strategy, and exchange combination.

The `readScheduleData` function retrieves saved signals, and `writeScheduleData` saves them. If a storage instance doesn't exist yet, it creates one automatically when you first try to read or write.

You can swap out different storage methods with `usePersistScheduleAdapter`, `useJson`, or `useDummy` to change how data is handled. `clear` resets the system if things change, like when your working directory is updated.

## Class PersistScheduleInstance

This class provides a way to reliably store and retrieve data related to scheduled signals, like the ones used in backtesting. It's designed to work with files, ensuring your data isn't lost even if something goes wrong. Each instance of this class is specific to a particular trading symbol, strategy name, and exchange.

The class keeps track of which symbol, strategy, and exchange it's managing.
It uses an internal storage mechanism to handle the file operations.

Before you start using it, you need to initialize the storage.
To get a signal from storage, you call `readScheduleData`, which looks up the data using the trading symbol. 

You can also save signal data using `writeScheduleData`, which uses the symbol to identify where to store the information; setting it to null will clear the stored signal. This implementation focuses on keeping your data safe and consistent.

## Class PersistRiskUtils

This class helps manage how active trading positions are saved and retrieved, specifically for risk management. It ensures that the way positions are stored is consistent and reliable, even if there are interruptions.

It uses a clever system to create specialized storage instances for each risk profile, which can be customized to use different methods for persistence.

You can swap out the default storage mechanism with your own implementations, such as using a file-based system or a testing "dummy" instance that doesn't actually save anything.

The system handles reading and writing position data, and it's designed to be safe – meaning it tries to avoid data loss even if something unexpected happens.

If you’re using a new working directory, the `clear` method can be used to refresh the storage.


## Class PersistRiskInstance

This class helps you reliably save and load trading positions to a file. It's designed to make sure your position data isn't lost, even if something unexpected happens during the saving process. 

It essentially wraps around another storage system to ensure changes are written safely. It always uses the same file name ("positions") for saving position data, making it simple and predictable.

You can use `waitForInit` to make sure the storage is ready before you start interacting with it. `readPositionData` retrieves the stored position data at a specific time, and `writePositionData` saves a new set of positions, again linked to a particular time. This class provides a standardized way to manage your trading positions' history.


## Class PersistRecentUtils

This class, PersistRecentUtils, helps manage how recent trading signals are saved and retrieved. Think of it as a smart storage system specifically designed for keeping track of the most recent signals your trading strategies generate.

It uses a clever technique called memoization – it only creates and manages a storage instance for each unique combination of symbol, strategy name, exchange, and timeframe. This makes it efficient and avoids unnecessary overhead.

You can customize how this storage works by providing your own "adapter," which is essentially a way to tell the class how to handle the signal persistence. This is useful if you want to store signals somewhere other than the default file-based location.

The class also ensures data integrity, making sure reads and writes happen reliably, even if things go wrong. It's used internally by other utilities for both backtesting and live trading.

Here's a breakdown of its key features:

*   **Customizable:** You can plug in your own storage solutions.
*   **Efficient:** It avoids creating redundant storage instances.
*   **Safe:** It protects your data with atomic operations and handles potential crashes.
*   **Easy to Swap:** You can easily switch between different storage methods like file-based storage or a dummy (no-op) adapter.
*   **Cache Clearing:** There's a way to clear the internal cache, important if your working directory changes during strategy iterations.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal data for a specific trading strategy. It automatically handles file storage, ensuring that your data is saved reliably and consistently. The storage is organized by the trading symbol, strategy name, exchange, and the timeframe you're using (like a 1-minute or daily chart). It also distinguishes between backtesting and live trading scenarios.

You can think of it as a way to remember the last important signal your strategy generated, so you can easily access it again later.

Here's a breakdown of how it works:

*   **Configuration:** When you create an instance, you specify the symbol, strategy name, exchange, timeframe, and whether you're backtesting or trading live.
*   **Storage:** It uses a file on your computer to store the signal data.
*   **Reading Data:** `readRecentData()` retrieves the last saved signal.
*   **Saving Data:** `writeRecentData()` saves a new signal, replacing the previous one.  This happens automatically when a new signal is generated.
*   **Initialization:** `waitForInit()` makes sure the storage is ready before you try to read or write data.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and save partial profit and loss information, especially when running trading strategies. It's designed to be reliable, even if your program crashes.

Think of it as a system for remembering where your trades stood at specific moments.

It smartly creates and reuses storage areas for each symbol and strategy combination, making things efficient. You can even customize how this data is stored using adapters.

The `readPartialData` method retrieves previously saved partial data, while `writePartialData` updates it. These operations happen safely, ensuring data integrity.

You can also swap out the underlying storage mechanism – use a standard file-based system, a dummy version for testing, or provide your own custom solution. The `clear` method can be used when the working directory changes, ensuring data consistency.


## Class PersistPartialInstance

This class helps you save and load trading data to files, ensuring it's done safely and reliably. Think of it as a way to store incomplete or temporary pieces of information during a trading backtest.

It's designed to work with a specific trading symbol, strategy, and exchange, keeping data organized. The data is stored in files, and the class handles the complexities of safely writing those files to prevent data loss, even if something goes wrong during the process.

You can use `waitForInit` to make sure the storage is ready before you start saving anything. `readPartialData` lets you retrieve saved data related to a specific trading signal. And `writePartialData` is how you actually save that data back. It uses a unique identifier (signalId) to keep track of each piece of data.


## Class PersistNotificationUtils

This class provides tools for reliably saving and retrieving notification data, especially useful in backtesting and live trading environments. It's designed to handle notification information safely, even if things go wrong unexpectedly.

It automatically manages where the notification data is stored and uses a smart caching system to avoid unnecessary file operations.

You can customize how notifications are persisted – for example, using a file-based system, a custom adapter, or even a "dummy" system that doesn't actually store anything. 

If your project directory changes (like when running multiple backtests), you can tell this class to refresh its settings to ensure proper data handling. It’s a foundational component used by other notification persistence utilities.


## Class PersistNotificationInstance

This class provides a way to save and retrieve notifications persistently, using files on your system. It’s designed to be reliable even if your program unexpectedly closes. Each notification is stored in its own JSON file, identified by a unique ID. 

The `backtest` property indicates whether this is running in a backtesting environment. The `_storage` property handles the actual file storage.

You can use `waitForInit` to ensure the storage is ready before reading or writing. `readNotificationData` fetches all the saved notifications, reading through each file. `writeNotificationData` saves a set of notifications, creating a new file for each one.

## Class PersistMemoryUtils

This class helps manage how your trading strategy's data is stored persistently, ensuring it survives crashes and restarts. It uses a clever system of memoization, meaning it only creates one storage instance for each specific combination of signal ID and bucket name, optimizing performance.

You can customize how this persistence works by providing your own storage constructors, or you can easily switch back to the default file-based or a dummy (no-op) storage for testing.

The class offers methods to read, write, delete, and check for the existence of stored data. It also provides a way to iterate through all stored entries, which is useful for rebuilding indexes. It’s designed to be used by the `MemoryPersistInstance` to keep your memory data safe and consistent. Remember to clear the cache if your working directory changes between strategy runs, and dispose of storage when signals are removed to keep things clean.

## Class PersistMemoryInstance

This class provides a way to store and retrieve memory data to a file, allowing for persistence across sessions. It's designed to work with a specific signal and bucket, essentially organizing your memory entries. 

The class handles saving data to a file and loading it back, using a unique identifier for each entry.  If you need to remove data, it doesn't truly delete it; instead, it marks the entry as removed. When listing memory data, any entries flagged as removed are excluded. 

The `waitForInit` method ensures the underlying storage is ready before you start interacting with it.  The `dispose` method doesn't do anything itself, as cleanup of cached memory is taken care of elsewhere.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, ensuring it's stored reliably and efficiently. It acts like a central manager for how your cached data is handled, especially when using file-based caching. 

Think of it as a way to control how your application remembers API responses to avoid repeatedly fetching the same information.

Here's a breakdown of what it does:

*   It creates specialized storage containers (called "buckets") for your cached data, organized by timestamp and symbol.
*   You can customize how these storage containers work by providing your own “builders”.
*   It makes sure reading and writing data is done safely and consistently.
*   It’s designed to prevent data loss even if your application crashes.

It offers convenient ways to:

*   Read existing cached data.
*   Write new data to the cache.
*   Delete old data (soft-deletes, marking it as removed instead of permanently deleting it).
*   List all the available cached entries in a specific container.
*   Clear the entire cache when needed, like when your working directory changes.
*   Switch between different storage mechanisms, like a standard file-based storage or a dummy storage for testing purposes.

## Class PersistMeasureInstance

This class helps you save and retrieve measure data, like performance metrics or trading signals, to and from files. It's designed to make sure your data is written reliably and consistently. 

Think of it as a safe container for your measure data, using a specific bucket (a folder) to organize things. 

It allows you to:

*   Read existing measure data using a unique key.
*   Write new measure data or update existing entries.
*   Remove data by marking it as deleted (rather than permanently deleting the file).
*   List all available measure data, excluding any that have been marked as deleted.
*   Initialize and ensure the storage is ready before interacting with it.

The system handles the file writing process so you don't have to worry about potential data loss. You can easily filter out entries that have been “soft deleted” when listing data.

## Class PersistLogUtils

This class provides tools for reliably saving and retrieving log data, ensuring that your trading strategies don't lose important information even if things go wrong. It manages a single, shared log instance that can be swapped out for different storage methods if needed.

You can customize how the logs are stored by providing your own adapter, or you can easily switch back to a standard file-based approach. It automatically handles reading and writing log entries, and it's designed to prevent data loss and duplication. The log entries are stored as individual files, each identified by a unique key, and any attempts to write duplicate entries are ignored. Clearing the cached instance is recommended when the current working directory changes.


## Class PersistLogInstance

This component helps you save trading logs to files, ensuring they're kept safely and reliably. Think of it as a persistent memory for your backtesting process.

Each log entry is stored as its own JSON file, making it easy to examine individual events. The system only adds new entries – it never modifies or deletes existing ones, protecting your historical data. 

The `waitForInit` method makes sure the storage is ready before you start writing data. To get all your saved logs, use `readLogData`.  `writeLogData` handles saving new log entries, making sure not to overwrite anything already stored, and provides crash-safe writes. 


## Class PersistIntervalUtils

This component handles tracking when specific time intervals have "fired" or completed within your backtesting process. It keeps records of these events in a persistent storage location, typically a directory named `./dump/data/interval/`. The presence of a file in this location indicates that the interval has already run for a particular bucket and key combination.

You can customize how these records are stored and managed. For example, you can swap out the default file-based storage with a JSON-based system or even a dummy implementation for testing.

The framework manages a cache to optimize access to these records, and it lazily loads the necessary components for each bucket only when needed. You can also clear the cache if your working directory changes during a backtest. The system offers methods for reading, writing, and removing these interval markers, and for listing all markers within a specific bucket.

## Class PersistIntervalInstance

This component provides a way to save and retrieve data related to specific time intervals, like how often a trading strategy should run. It acts as a middleman, using files to store this data persistently.

The data is organized into "buckets," essentially folders where interval information is kept.

When you need to load a previously saved interval setting, this component will fetch it from the file. If the setting is no longer needed, it can be marked as "removed" instead of entirely deleted, allowing the system to re-initialize it later if necessary.

The system has a way to initialize the underlying storage.

You can read individual interval data by a unique key.

You can write new interval data or update existing ones with a key.

To remove interval data, it doesn’t actually delete the file; instead, it adds a flag indicating it's removed.

Finally, it provides a way to list all active interval data within a bucket, ignoring any markers that have been "removed."

## Class PersistCandleUtils

This class helps manage how candle data (like price movements) is stored and retrieved from disk. It's designed to cache this data efficiently, saving you from repeatedly fetching it from data sources.

Each candle’s data is stored as a separate file, making organization simple and allowing for targeted updates. The system checks if the cached data is still valid, preventing unnecessary reloads.

If data is missing or becomes incomplete, the cache automatically refreshes.  The class uses a special factory to create cache instances, and you can customize this factory to change how the data is stored, such as using a file-based system or a dummy instance for testing. 

You can also clear the cache if your working directory changes, and it offers a simple way to switch between different caching methods.

## Class PersistCandleInstance

This class helps you save and retrieve candle data to disk, specifically designed for backtesting. Think of it as a persistent memory for your historical price information. Each candle is stored individually as a JSON file, identified by its timestamp.

If you try to read a candle that isn't available, it will report a "miss" and you'll need to fetch it from somewhere else.

When writing candles, it’s intelligent about avoiding issues – it won't save incomplete candles (those still in progress) and it respects already-existing data to prevent overwrites. It also flags any invalid candle data it finds during reads. 

The constructor requires the symbol (like "BTCUSDT"), the candle interval (like 1 minute or 1 hour), and the exchange name to properly organize the storage. 

You can use `waitForInit` to make sure the storage is ready before you start working with it. `readCandlesData` pulls a range of candles from storage and `writeCandlesData` adds new ones, ensuring the cache remains consistent.


## Class PersistBreakevenUtils

This class helps manage and save the breakeven state of your trading strategies. It handles the details of reading and writing this data to files so you don't have to.

Think of it as a central place to store information about when a breakeven target has been hit for each signal within your strategy.

It keeps things organized by storing data in a specific file structure under a directory named `dump/data/breakeven/`, creating separate folders for each symbol and strategy combination.

You can customize how this data is stored, for example, to use a different storage method or just simulate persistence for testing purposes. It intelligently creates these storage instances only when needed and remembers them for future use, making it efficient. If your working directory changes, you’ll need to clear the cache to ensure data is loaded correctly.

## Class PersistBreakevenInstance

This class provides a way to save and retrieve breakeven data persistently, using files to store the information. Think of it as a secure notebook for keeping track of your trading calculations. 

It's designed to work reliably even if your program crashes unexpectedly, ensuring your data isn't lost. It’s specifically tied to a symbol, a strategy name, and an exchange to keep everything organized.

Internally, it manages this storage using a file-based system and relies on a unique identifier (signalId) to pinpoint the exact data it needs. The `waitForInit` method is used to set up this storage area initially. 

You'll use `readBreakevenData` to load previously saved breakeven calculations, and `writeBreakevenData` to update them. These methods handle writing and retrieving data based on the signalId.


## Class PersistBase

PersistBase provides a foundation for reliably storing data to files, ensuring that your data isn't lost or corrupted. It's designed to handle file operations safely, using techniques like atomic writes to guarantee data integrity.

This class manages where your data files are stored and keeps things organized. It automatically validates and cleans up any damaged files it finds, and it can even retry deleting files if something goes wrong.

The `entityName` specifies what kind of data is being stored, and `baseDir` tells the system where to find those files.

The `waitForInit` method makes sure the storage directory is ready and all existing files are in good shape when you start.  You can use `readValue` to retrieve data, `hasValue` to quickly check if data exists, and `writeValue` to save your data, all while the system takes care of the low-level file management. The `keys` method gives you a way to loop through all the entity IDs that have been stored.

## Class PerformanceReportService

The PerformanceReportService helps you understand how long different parts of your trading strategy take to execute. It quietly records timing information during your strategy's runs.

Think of it as a performance detective, observing and noting how long each step takes. This is incredibly useful for finding bottlenecks and identifying areas where your strategy could run more efficiently.

To use it, you'll subscribe to listen for these timing events – but you only need to do this once.  The service protects you from accidentally subscribing multiple times.

When you’re done, you can easily unsubscribe to stop it from recording data. If you haven’t subscribed in the first place, unsubscribing won’t cause any problems.  The service also uses a logger to provide helpful debugging information.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like averages, minimums, maximums, and percentiles. 

It then creates readable reports in Markdown format, highlighting areas where your strategy might be struggling. These reports are automatically saved to your logs directory.

You can subscribe to receive performance updates, unsubscribe when you don't need them anymore, and retrieve specific performance data for a given strategy and symbol. The system prevents accidental duplicate subscriptions.

The `track` function is used internally to process performance events. You can also use methods to get overall performance stats, generate reports, and clear the accumulated data when it's no longer needed. There's a way to customize the columns included in the reports as well.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It allows you to gather and analyze performance statistics for specific symbols and strategies.

You can retrieve detailed performance data, which includes things like how many times operations were executed, how long they took, and volatility measures.

It also lets you generate easy-to-read markdown reports that highlight areas where your strategy might be slow or inefficient.

Finally, you can save these performance reports directly to your computer for later review or sharing. The reports will be organized in a `dump/performance` directory by default.

## Class PartialUtils

This utility class helps you understand and visualize the partial profits and losses your trading strategies are generating. It gathers data about partial events – those that aren't full completions – and organizes it for analysis.

You can retrieve statistical summaries of these partial events, providing an overview of profit and loss activity. 

It also generates detailed reports in markdown format, presenting the data in a clear, tabular style with columns like action, symbol, strategy, signal ID, and price. This report includes essential summary statistics at the bottom.

Finally, you can easily save these reports to files, named according to your symbol and strategy, making it simple to track performance over time. The class handles creating the necessary directories to store these reports. Essentially, it takes a stream of partial profit/loss data and turns it into useful insights and easily shareable reports.

## Class PartialReportService

The PartialReportService is designed to keep track of when your trades partially close, whether that's a profit or a loss. It essentially logs these partial exit events – the price and level at which they occurred – so you can analyze your trading performance in more detail.

This service listens for signals indicating partial profit or loss events and records those details. It uses a logger to help debug any issues and stores the recorded events in a database for later review.

You can tell it to start listening for these partial exit signals using the `subscribe` method, which returns a function you can call later to stop listening. If you try to subscribe more than once, it prevents duplicate subscriptions. Conversely, `unsubscribe` cleanly stops the service from listening and clears any existing subscriptions.

## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on small profits and losses ("partials") generated during a trading backtest or live trading. It listens for these partial profit and loss events, keeping a record of them for each symbol and strategy you're using.

It automatically creates formatted markdown reports detailing each event, including helpful statistics like the total profit and loss. These reports are saved as files on your computer, making it easy to analyze your trading performance.

You can subscribe to receive these partial events, and unsubscribe when you no longer need them. The service provides methods to retrieve accumulated data, generate markdown reports, and save those reports to disk. You also have the ability to clear out the accumulated data when needed, either for everything or specific combinations of symbol, strategy, and timeframe.

## Class PartialGlobalService

This service helps keep track of partial profits and losses across your trading strategies. It acts as a central point for handling these operations, making sure everything is logged and validated correctly.

Think of it as a middleman: your trading strategies pass information about profits, losses, and signal closures to this service, which then handles the details and keeps a record of what's happening.

It relies on other services for things like validating strategies and managing connections, keeping the core trading logic clean and organized. The service also memoizes validation to improve performance.

You’ll find this service injected into your strategies, allowing for consistent and centralized management of partial trading data. It's designed to make monitoring and debugging your trading activities easier.


## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It acts like a central hub, ensuring that each signal has its own dedicated record for tracking its performance. 

Think of it as a factory that creates and maintains these records, memoizing them to avoid unnecessary creation. It keeps track of things like profit and loss levels and cleans up these records when signals are no longer active.

This service is integrated with other parts of the system, receiving information about trades and notifying other components when profit or loss thresholds are reached. The service is responsible for creating and managing the individual "ClientPartial" objects that hold the details of each signal's partial state. When a signal closes, the service removes the corresponding record, preventing data accumulation.

## Class NotificationLiveAdapter

This class helps manage notifications related to your trading strategies, offering a flexible way to send updates and alerts. It's designed to be adaptable – you can easily switch between different notification methods without changing your core strategy logic.

Think of it as a central hub for all your trading notifications. 

It uses a pluggable design, allowing you to choose how notifications are handled. You can use an in-memory store (the default), persist them to disk, or even use a "dummy" adapter that does nothing at all – useful for testing or situations where you don't need notifications.

The `handleSignal`, `handlePartialProfit`, `handleRisk` and other `handle...` methods are the main entry points for sending notifications; they simply pass the information along to the currently active adapter. The `getInstance` property provides access to the currently active notification utilities, and `clear` resets it so you can ensure it's re-initialized when necessary.

You can easily switch adapters using methods like `useDummy`, `useMemory`, and `usePersist`.  The `useNotificationAdapter` method gives you the most control – letting you register a custom notification adapter class. The `getData` method lets you retrieve all stored notifications, while `dispose` clears them.


## Class NotificationHelperService

This service helps manage and send out notifications related to trading signals, specifically the 'signal.info' type. It's a behind-the-scenes component used to ensure everything is set up correctly before a notification is sent.

Think of it as a gatekeeper—it validates the strategy, exchange, frame, and action schemas to make sure everything is consistent and reliable. This validation is cleverly optimized; it only runs once for each unique combination of strategy, exchange, and frame.

The `commitSignalNotify` function is how the framework sends out these notifications.  It takes information about the signal, a symbol, the current price, and some context details.  It validates everything first, retrieves the signal data, and then publishes the notification to be received and recorded by other parts of the system.

## Class NotificationBacktestAdapter

The `NotificationBacktestAdapter` helps you manage and send notifications during backtesting, providing flexibility in how and where those notifications are stored or handled. It’s designed so you can easily swap out different notification methods without changing your core backtest logic.

You can use it with several built-in options: a default in-memory storage, a persistent storage option to save notifications to disk, or a dummy adapter that simply ignores notifications entirely.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods allow you to trigger notifications based on different events in your backtest.  The `getData` method lets you retrieve stored notifications, and `dispose` clears them.

To customize your notifications, you can use `useNotificationAdapter` to specify a custom notification adapter, or quickly switch between the dummy, memory, and persistent adapters using `useDummy`, `useMemory`, and `usePersist` respectively. The `clear` method ensures a fresh notification adapter instance when necessary, particularly when the working directory changes between backtest runs.

## Class NotificationAdapter

This component acts as a central hub for handling notifications, both during backtesting and in live trading. It automatically keeps track of notifications based on signals emitted by the system. 

You can think of it as a way to subscribe to important events – like profits, losses, or errors – so you can record and analyze them.

The `enable` property lets you start listening for these notifications, and it makes sure you don’t accidentally subscribe multiple times.  The `disable` property allows you to stop listening and is safe to call repeatedly. `getData` lets you retrieve the stored notifications, distinguishing between backtest and live data. Finally, `dispose` clears all the stored notifications to keep things tidy.

## Class MemoryLiveAdapter

This component provides a way to manage and store trading memory data, offering flexibility in how that data is handled. It allows you to easily switch between different storage methods, such as keeping data only in memory, persisting it to files, or even discarding it entirely for testing purposes.  It uses a clever system where it creates and reuses memory instances to optimize performance.

You can choose to store your data in-memory only, keep it saved to files, or use a "dummy" adapter that simply ignores any data written, which is useful for testing. It also lets you plug in your own custom storage solutions.

To clear out old data, you can call `disposeSignal` to remove entries associated with a specific signal, or `clear` to wipe the entire cache. The adapter keeps track of your data and makes it searchable using full-text search (BM25) and provides methods for listing, removing, and reading individual entries. It’s designed to be the core memory management piece for live trading scenarios.

## Class MemoryBacktestAdapter

This component, the MemoryBacktestAdapter, provides a flexible way to manage memory for your backtesting scenarios. It acts as a central hub for storing and retrieving data, allowing you to easily switch between different storage methods. By default, it uses an in-memory solution, but you can swap it out for persistent storage on your file system or even a dummy adapter that simply discards any data written.

You can choose between several storage options: the default in-memory storage, a file-system backed adapter, or a dummy adapter for testing purposes. Additionally, you can even plug in your own custom storage implementation.

The adapter manages memoized instances of data, which are discarded when a signal is cancelled. To clean up and ensure fresh instances, you can manually clear the cache or let the adapter handle it when the working directory changes. Functions are provided for writing, searching, listing, removing, and reading data from memory. The `disposeSignal` method is crucial for cleaning up memoized data when signals are no longer needed.

## Class MemoryAdapter

The MemoryAdapter acts as the central hub for managing memory storage, whether you're running a backtest or a live trading environment. It intelligently directs memory-related operations—writing, searching, listing, removing, and reading—to the appropriate system (MemoryBacktest or MemoryLive) depending on the context.

To begin using memory storage, you need to "enable" the adapter, which subscribes it to signal lifecycle events to ensure clean-up and prevent issues with stale data. Conversely, "disable" stops this process and is safe to call multiple times.

The `writeMemory` function lets you store data, `searchMemory` allows you to find entries using full-text search (BM25), `listMemory` retrieves all entries, `removeMemory` deletes specific entries, and `readMemory` fetches a single entry. All these methods are routed appropriately based on whether you're in backtest or live mode. The adapter also handles unsubscribing when signals are cancelled, ensuring resources are released properly and preventing memory leaks.

## Class MaxDrawdownUtils

This class offers tools to analyze and understand maximum drawdown events, which are important for assessing risk. It works by collecting data from drawdown events and presenting it in a useful way.

You can request specific data related to a symbol and strategy using the `getData` method, which returns a summary of the drawdown statistics.

The `getReport` method creates a detailed markdown report outlining all the maximum drawdown events for a particular symbol and strategy combination, allowing you to identify trends and potential problem areas.

Finally, `dump` lets you automatically generate and save that report as a file, which is handy for archiving or sharing. This class is designed to be easily accessible, allowing you to extract valuable insights from your drawdown data.


## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is designed to keep track of maximum drawdown events during a backtest and save this information for later analysis. It essentially listens for signals indicating new drawdown records have occurred and writes them to a database in a format suitable for analytics.

The service relies on a `loggerService` and `tick` object, and it specifically records details like timestamps, symbols, strategy names, exchange names, frames, signal IDs, positions, current prices, and order details. It’s important that signal-related information is pulled directly from the signal data itself, not from a broader contract.

To begin recording drawdown events, you need to use the `subscribe` method. This method ensures that you only subscribe once, preventing unnecessary re-subscriptions.  You'll receive an unsubscribe function which you'll call when you're finished tracking drawdowns.

If you want to stop recording drawdown events, use the `unsubscribe` method, which effectively clears the subscription and prevents any further records from being written.

## Class MaxDrawdownMarkdownService

This service is designed to create and store reports about maximum drawdowns, which are important for assessing trading risks. It listens for drawdown events and organizes them based on the symbol, strategy, exchange, and timeframe being used.

You can start receiving these events by subscribing, and stop listening by unsubscribing. This ensures you don’t accidentally subscribe multiple times.

The `tick` method processes each incoming drawdown event.

To get the accumulated drawdown data for a specific trading setup (symbol, strategy, exchange, timeframe), use the `getData` method.  You can also use `getReport` to generate a formatted markdown report for that setup, or `dump` to create the report and save it as a file.

Finally, the `clear` method provides a way to reset the accumulated data. You can either clear data for a specific trading setup by providing details (symbol, strategy, exchange, etc.) or clear all data at once.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter provides a flexible way to manage and output markdown reports from your backtests. It allows you to easily switch between different storage methods, like writing each report to a separate file, appending to a single JSONL log, or suppressing output entirely.

You can control how reports are saved by changing the storage adapter – it defaults to creating individual markdown files. 

The adapter automatically creates storage when needed. If your working directory changes, you can clear the adapter's cache to ensure new storage is created with the updated path. 

It uses memoization to make sure you only have one storage instance for each type of report, which helps manage resources efficiently. You can change the default adapter or opt for a dummy adapter that simply ignores all output.

## Class MarkdownUtils

MarkdownUtils helps you manage the creation of markdown reports for different parts of your trading system, such as backtests, live trading, and performance analysis.

It lets you turn markdown reporting on or off for specific areas, giving you fine-grained control over which reports are generated.

When you enable markdown reporting for a service, it starts collecting data and producing markdown files – remember to unsubscribe to avoid problems later!

You can also disable reporting for specific areas to stop the generation of those reports, or clear the existing data for a service while keeping the reporting itself active. This allows you to refresh the data without stopping the overall reporting process.

## Class MarkdownFolderBase

This adapter is designed to create a well-organized series of markdown files, one for each report. It's perfect if you want to easily browse your backtest results in a directory structure.

Each report gets its own individual `.md` file, making it simple to open and review specific results. The files are organized within a directory path you define, and the adapter handles creating the necessary folders automatically.

It’s straightforward to use because it writes files directly without needing to manage streams. Think of this as your go-to choice for creating easily understandable and reviewable backtest reports.

The `waitForInit` method doesn't actually *do* anything – it’s a placeholder because this adapter works directly with file writing.

The `dump` method is where the magic happens; it takes the report content and writes it to a file based on the provided path and file naming options.


## Class MarkdownFileBase

This component handles writing markdown reports to files in a standardized JSONL format. It's designed for centralized logging and easy processing with tools that work with JSONL.

Each report type (like trade details or performance metrics) gets its own file. The files are written one line at a time, with each line containing the report content along with metadata such as the symbol traded, the strategy used, the exchange, the timeframe, and a signal identifier.

The system automatically creates the necessary directories and uses a timeout mechanism to prevent write operations from hanging indefinitely. It also incorporates error handling to ensure issues are reported correctly.

You can use the `waitForInit` method to make sure the file and write stream are ready. The `dump` method is the primary way to add new reports; it takes the markdown content and metadata and writes it as a new line in the appropriate JSONL file. The initialization and directory creation only happen once, even if you call `waitForInit` multiple times.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods without changing your core code. 

You can choose to store your markdown data as individual files, each in its own .md file, or you can combine them into a single .jsonl file. 

There's even a 'dummy' adapter option that's useful for testing or situations where you don’t want to save anything. The adapter intelligently remembers which storage method you’re using so you don't have to configure it repeatedly. It only creates the storage when you first write to it, improving performance.

## Class LookupUtils

The `LookupUtils` class acts like a central record keeper for ongoing backtests and live trading sessions. Think of it as a place where the framework tracks what's currently running.

Whenever a backtest starts, a live trading session begins, or a strategy performs an iteration, information about that activity is registered here. When those activities finish, the framework cleans up those entries.

The `addActivity` method adds a new activity to this record, and `removeActivity` removes it when it's done. It's important to remove activities to prevent stale data.

You can also view a snapshot of all currently running activities using the `listActivity` method.

This system helps the framework manage resources and optimize performance, particularly by controlling how often the system pauses to allow other tasks to run.

## Class LoggerService

The LoggerService helps you keep your logging organized and informative across the entire backtesting process. It's designed to automatically add useful details to your log messages, so you don't have to manually include them every time. 

It works by injecting context about where the log message originated – things like the strategy name, exchange, and the part of the code being executed. 

If you don't provide your own logging system, it will fall back to a silent, "do nothing" logger.

You can customize the logging by providing your own implementation using the `setLogger` method. The service provides convenient methods for different logging levels like `log`, `debug`, `info`, and `warn`, all of which automatically include the added context. Internally, it uses `methodContextService` and `executionContextService` to manage that context, and delegates to a configurable `_commonLogger`.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting framework. Think of it as a central hub for all your logging needs, allowing you to easily switch between different storage methods. By default, logs are kept in memory, but you can easily change this to persistent storage on disk, a dummy adapter for testing purposes (where logs are effectively ignored), or even a JSONL file for detailed record-keeping.

You can change the way logs are handled using methods like `usePersist`, `useMemory`, and `useDummy`, making it easy to adapt your logging strategy. The `useJsonl` function allows you to direct logs to specific JSONL files, which is useful for detailed analysis. The `clear` method is important to use when your working directory changes to ensure fresh log instances are created. The `log`, `debug`, `info`, and `warn` methods provide standardized ways to record different levels of messages, and are all passed through to the currently selected logging mechanism.


## Class LiveUtils

The `LiveUtils` class provides tools for live trading, simplifying interactions with the core trading engine and offering features like crash recovery and real-time monitoring.

It's a central point for running live trading operations, offering several key functionalities. You can initiate live trading for a specific symbol and strategy, or run it in the background without directly receiving trade results. 

For more granular control, it provides methods to retrieve pending signals, calculate position statistics (like total percentage closed, cost basis, or breakeven), and check for the existence of signals.

It also includes tools to manage signals—canceling scheduled signals or closing existing positions—and to adjust positions via partial closes or trailing stops.  You can even trigger notifications based on signal events.

The class includes methods to get stats, reports, and lists of active trading instances, making it easy to monitor and debug live trading sessions. Essentially, it's designed to make live trading execution and oversight easier and more robust.

## Class LiveReportService

The LiveReportService helps you keep a real-time record of your trading activity. It listens for events as your strategy is running – things like when it's waiting, opening a position, actively trading, or closing a trade. 

It gathers detailed information about each of these events and saves them to a database, so you can monitor what's happening and analyze your performance.

To make sure you're not accidentally sending duplicate data, it uses a system to prevent multiple subscriptions to the live signal events.

You can start receiving these live events by using the `subscribe` function, which will return a way to stop listening when you're done.  The `unsubscribe` function is the way to do just that, ensuring you’re not continuing to log data unnecessarily.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create detailed reports of your live trading activity. It watches your trading signals and records everything that happens – from when a strategy is idle to when a trade is opened, active, and closed. 

It organizes this information into easy-to-read markdown tables, giving you a clear overview of how your strategies are performing. You'll also get important trading statistics like your win rate and average profit/loss.

This service saves these reports directly to your computer in a structured folder, making it easy to track your progress and analyze your strategies over time.

You can subscribe to receive real-time updates, and there's a way to unsubscribe when you no longer need the service. It's also designed to handle multiple strategies and trading environments, keeping data organized and separate. If you need to delete old data, you can clear out the accumulated event data, either for all strategies or just specific ones.

## Class LiveLogicPublicService

LiveLogicPublicService is designed to simplify live trading by handling the complexities of context and state management. It builds upon LiveLogicPrivateService, automatically passing along information about the trading strategy and exchange being used, so you don't have to specify it with every function call.

Think of it as an ongoing, resilient engine that continuously generates trading signals (opened, closed, or cancelled).

Key features include:

*   It operates as an infinite stream of trading events.
*   It's built to withstand crashes and automatically recovers saved progress.
*   It uses the current time to keep things synchronized.

To get it running, you provide a symbol (like ‘BTC-USDT’) and the strategy and exchange names. This initiates the live trading process and provides a steady flow of results.

## Class LiveLogicPrivateService

The LiveLogicPrivateService helps manage and execute live trading strategies. It continuously monitors market data in a loop, checking for new trading signals. 

The service then streams back the results – specifically, when positions are opened or closed – instead of showing every action taken.  

This approach uses an async generator to efficiently deliver results and avoids overwhelming the system.  

It's designed to be robust; if the process crashes, it will automatically recover and resume where it left off. The service relies on other components like the logger service, strategy core service, and method context service to function. You can initiate the process for a specific trading symbol using the `run` method.

## Class LiveCommandService

This service acts as a central point for accessing live trading features within the backtest-kit framework. It's designed to make it easy to inject dependencies and provides a simplified interface for live trading operations. 

It relies on several internal services for things like logging, validating strategies, and ensuring exchanges and risks are properly configured. 

The `validate` function checks your trading strategy and related risk settings, and it's optimized to avoid repeating those checks unnecessarily.

The `run` function is the workhorse – it's what actually executes the live trading process for a specific symbol. It continuously generates results and automatically handles any crashes that might occur, allowing for a resilient trading environment.


## Class IntervalUtils

The `IntervalUtils` class helps you manage functions that should only run once within a specific time interval. It's like having a gatekeeper for your functions, making sure they don’t run too frequently.

There are two main ways to use it: in-memory, where the state is held in the program's memory, and file-based, where the state is saved to a file so it persists even if the program restarts. This file-based option is great for ensuring your functions only run once per interval, even across program restarts.

You get a single, ready-to-use instance of this helper, making it simple to wrap your functions. The system keeps track of which functions have already run in each interval, creating a unique tracking object for each function you use.

You can also clean up old tracking data, which is useful when your working directory changes, or reset the counter for persistent instances. This ensures that your tracking starts fresh and avoids conflicts.


## Class HighestProfitUtils

This class helps you analyze and report on the highest profit events recorded during trading. It's designed to work with data collected by the `HighestProfitMarkdownService`.

You can think of it as a tool for summarizing your best trades.

It offers a few key functions:

*   `getData` allows you to pull out statistical summaries of the highest profit events for a specific trading symbol, strategy, and exchange.
*   `getReport` generates a formatted markdown report showing all the highest profit events related to a particular symbol and strategy. You can also choose which columns to include in the report.
*   `dump` is similar to `getReport`, but it saves the markdown report directly to a file for later review.

## Class HighestProfitReportService

This service is designed to track and record the highest profit events generated during a backtest. It monitors a specific data stream, `highestProfitSubject`, and whenever a new profit record is detected, it writes detailed information about that event to a JSONL database.

The information logged includes key details like the timestamp, symbol, strategy name, exchange, frame, backtest parameters, signal ID, position size, and the current price along with take profit and stop loss prices.

To start tracking these high-profit events, you need to subscribe to the data stream.  This process is designed to prevent accidental multiple subscriptions.

To stop the tracking process and prevent further logging, you can unsubscribe, which disconnects the service from the data stream. If you haven't subscribed yet, unsubscribing won't have any effect.


## Class HighestProfitMarkdownService

This service is designed to create and store reports about the highest profit achieved for a trading strategy. It listens for incoming data about profitable trades and organizes them based on the symbol traded, the strategy used, the exchange, and the time frame.

You can subscribe to receive these data events. Once subscribed, the service starts collecting information.  To prevent accidental multiple subscriptions, the first subscription creates a unique unsubscribe function, and subsequent subscription attempts will return the same one.  Unsubscribing completely stops the data collection and clears all stored information.

The `tick` method handles individual profit events, sorting them into the appropriate storage buckets.

You can request data or generate reports for a specific trading context – for example, a particular symbol, strategy, exchange, and time frame. The `getData` method retrieves accumulated statistics, and `getReport` formats them into a readable markdown report.  The `dump` method generates a report and saves it to a file, naming it according to the symbol, strategy, exchange and frame and whether it's a backtest or live trade.

Finally, the `clear` method provides a way to remove the collected data; you can clear specific data for a single configuration, or clear all the data collected.

## Class HeatUtils

HeatUtils helps you visualize and analyze your portfolio's performance using heatmaps. It's designed to simplify the process of gathering and presenting key statistics.

Think of it as a helper that collects performance data – like total profit, Sharpe ratio, and maximum drawdown – for each symbol your strategy traded.

You can use it to get a comprehensive overview of your strategy’s performance across all symbols.

It can also generate a nicely formatted markdown report that shows these statistics in a table, sorted by profitability, and even save that report as a file.


## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording closed trades. It focuses on capturing those final moments – when a signal is closed – and stores vital information like profit and loss (PNL) data.

This service listens for these closed signal events and neatly logs them in a database, allowing for portfolio-wide heatmap generation.  You can think of it as a system that provides insights into *when* your trades are most successful (or not).

To get started, you’ll subscribe to the signal emitter to receive those closed signal events, and when you're finished, you can unsubscribe to stop the process.  It's designed to prevent accidental double-subscriptions, ensuring that you only receive events as intended.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading strategies by creating a heatmap of your portfolio's performance. It listens for signals about your trades, then gathers and organizes data about each symbol you’re trading, broken down by exchange, timeframe, and whether it’s a backtest or live trade.

You can subscribe to receive updates as trades happen, and unsubscribe when you no longer need the data. The service then aggregates information like total profit/loss, Sharpe ratio (a measure of risk-adjusted return), and maximum drawdown (the biggest loss from a peak) for each symbol.

It also creates portfolio-wide summaries, combining metrics across all symbols and strategies. You can get these aggregated stats as a neatly formatted markdown report, or even save the report directly to a file.

The system avoids storing data indefinitely; you can clear the data for specific exchanges, timeframes, or modes, or clear everything entirely to start fresh. This makes it easy to reset your analysis when needed. It's designed to handle potentially problematic calculations (like dividing by zero) safely, preventing errors and ensuring reliable results.

## Class FrameValidationService

The FrameValidationService helps you keep track of and verify your trading timeframe configurations. It acts like a central record book, storing information about each timeframe you're using.

Before you start trading based on a specific timeframe, this service can quickly check if it's properly set up and registered. 

It also remembers its validation checks, which speeds things up if you need to check the same timeframe multiple times.

You can use it to add new timeframes, check if a particular timeframe is valid, and get a complete list of all the timeframes you've registered. Essentially, it’s your assistant for managing and guaranteeing the health of your timeframe configurations.


## Class FrameSchemaService

The FrameSchemaService helps manage a collection of frame schemas, acting like a central registry for them. It uses a special system to ensure the schemas are stored and accessed in a type-safe manner.

You add new frame schemas using the `register` method, providing a unique name and the schema definition.  If a schema with that name already exists, you can use `override` to update specific parts of it.

To get a previously registered schema, use the `get` method, providing the schema's name.

Before a schema is added, the `validateShallow` process checks that it contains all the necessary properties and that they are of the expected types – this helps prevent errors later on. The service also has access to logging and execution context services to aid in debugging and monitoring.

## Class FrameCoreService

The FrameCoreService acts as a central hub for managing and retrieving timeframes used in backtesting. It leverages a connection service to fetch timeframe data and a validation service to ensure its accuracy. Think of it as the engine that provides the chronological sequence of data points your trading strategies will analyze. 

It’s designed to work behind the scenes, primarily powering the BacktestLogicPrivateService.

The `getTimeframe` method is its key function; it’s what you'd use to get a list of dates for a specific trading symbol and timeframe (like daily, hourly, etc.). This function is crucial for setting up each backtest iteration.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It ensures that the correct frame implementation is used based on the current context.

Think of it as a smart router that directs requests to the right place.

It keeps a record of previously used frames to improve speed, and it automatically handles the process of setting up and managing timeframes for backtesting.

You can clear this record to force it to regenerate frames, which is important to ensure it’s working with the most up-to-date data.

The service allows you to define specific start and end dates for your backtests, controlling exactly which historical data is used. The frameName is empty for live mode when no timeframe constraints are applied.

## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your configured exchanges and makes sure they’re ready to use. It's like a central manager for your exchanges.

You can register new exchanges using `addExchange`, providing a name and the details of that exchange.

Before you try to do anything with an exchange, you can use `validate` to confirm it's properly set up. This helps catch errors early on.

To see a complete list of all the exchanges you've registered, call `list`.

The service is designed to be efficient, caching the results of validations so it doesn't have to re-check things unnecessarily. 


## Class ExchangeUtils

The ExchangeUtils class offers helpful tools for working with exchanges within the backtest-kit framework. It’s designed to make accessing and validating exchange-related data easier.

Think of it as a central place to get information like historical candles, current prices, and order book details. It’s set up so there’s only one instance of it, ensuring consistent behavior across your backtests.

You can retrieve candles for a specific trading pair and timeframe, calculate the average price using volume-weighted calculations, or get the closing price from the latest candle. The `formatQuantity` and `formatPrice` methods automatically adjust numbers to match the precision required by each exchange.

It also simplifies fetching order books and aggregated trade data, while `getRawCandles` allows for more advanced candle retrieval with control over start and end dates. It's careful about timing, especially during backtesting, to avoid looking into the future.

## Class ExchangeSchemaService

This service helps you keep track of and manage the structure of data related to different exchanges. It uses a special system to ensure everything is typed correctly and safely stored. 

You can add new exchange schemas using the `addExchange()` function (referred to as `register` here), and retrieve them later by their name using `get()`.

Before a new schema is added, it's quickly checked (`validateShallow`) to make sure it has all the necessary pieces in place.

If you need to update an existing exchange schema, the `override()` function lets you modify just the parts you need to change. 

Essentially, it's a central place for defining and maintaining the blueprint for how your exchange data is organized.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for all interactions with an exchange, ensuring each request is aware of the current trading context like the symbol being traded, the specific time, and whether it's a backtest or live environment. It manages connections to the exchange and injects relevant data to provide a consistent environment. 

This service handles common exchange operations like retrieving historical and future candle data, calculating average prices, and fetching order books and trades. It offers methods for formatting prices and quantities, taking the trading environment into account. 

Validation of exchange configurations is handled within this service, making it efficient and reducing repeated checks. It’s a foundational component for both backtesting and live trading logic.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently routes your requests – like fetching historical data or placing orders – to the correct exchange implementation, streamlining the process. It remembers which exchanges you've already connected to, improving efficiency and avoiding unnecessary setup.

This service provides a unified interface (`IExchange`) for working with various exchanges.  You don't have to worry about the specific details of each exchange's API; the service handles that for you based on the exchange specified in the current context.

Key operations include retrieving historical candle data (past prices), fetching the next set of candles based on the current execution timestamp, calculating the average price (either from live exchange data or historical candles), formatting prices and quantities to match exchange requirements, retrieving order book data, and getting aggregated trade information.  You can also request raw candle data with custom date ranges.


## Class DumpAdapter

The DumpAdapter helps you save information – like chat logs, data records, or errors – from your backtest runs in various formats. It acts as a middleman, letting you choose where and how that data is stored.

Initially, it defaults to creating individual markdown files for each data point.  You can easily change this behavior to store data in memory, discard it entirely (useful for testing), or even inject your own custom storage solution.

Before using the adapter to save data, you need to activate it, and deactivate it when you are done. The adapter keeps track of data instances, cleaning them up when signals are cancelled to prevent memory issues.  It's safe to activate and deactivate multiple times.

There are several methods for saving different types of information: agent conversations, simple records, tables of data, raw text, JSON objects, or error messages. Each method accepts a context object to provide additional information about the data being saved. 

The `clear` method is important if your working directory changes during the backtest process; it ensures that fresh instances are created.

## Class CronUtils

Okay, here's a human-friendly explanation of the `CronUtils` class:

This class helps schedule tasks that need to run at specific points in time related to trading, especially when you're doing backtesting and want those tasks to happen consistently across multiple tests running at the same time. It's like a reliable timer that ensures things happen only once, even if multiple tests are trying to do the same thing simultaneously.

Think of it as a way to organize events that need to occur at regular intervals during a backtest, such as processing data or executing actions.

Here's a breakdown of the important pieces:

*   **Registration:** You register tasks you want to run, giving them a name and a schedule.
*   **Synchronization:**  It prevents the same task from being executed multiple times at the same time when you're running tests in parallel.  It uses a system of "promises" to coordinate this.
*   **Memory Management:** It keeps track of which tasks have already run and cleans up old records to keep things efficient.
*   **Lifecycle Management:** It integrates with the testing framework to automatically schedule tasks based on the simulated market time.
*   **Disposal:** It provides a way to completely clear all scheduled tasks and related data when you’re finished with a testing session.

This ensures that tasks are executed reliably and predictably, especially when you're running multiple backtests at once. It manages the timing of these tasks so they align correctly with the simulated trading environment.

## Class ConstantUtils

The `ConstantUtils` class provides a set of pre-defined percentages used for calculating take-profit and stop-loss levels within your trading strategies. These values are derived from the Kelly Criterion and incorporate an exponential risk decay approach. Think of them as checkpoints along the way to your ultimate profit or loss targets.

For example, if your target profit is 10%, the different levels help you lock in portions of those gains at 3%, 6%, and 9% profit. Similarly, stop-loss levels guide you to manage risk by triggering at 40% and 80% of the distance to the ultimate stop-loss target. This allows you to proactively reduce exposure as the market moves against you.

Here's a breakdown of what each constant represents:

*   `TP_LEVEL1`: Triggers at 30% of the total profit target.
*   `TP_LEVEL2`: Triggers at 60% of the total profit target.
*   `TP_LEVEL3`: Triggers at 90% of the total profit target.
*   `SL_LEVEL1`: Triggers at 40% of the total stop-loss target.
*   `SL_LEVEL2`: Triggers at 80% of the total stop-loss target.

## Class ConfigValidationService

This service helps make sure your trading configurations are set up correctly and won't lead to losses. It's like a safety check for your settings. 

It carefully reviews various parameters within your trading plan. Things like slippage, trading fees, and profit margins must all be positive numbers.

The service also ensures that your take-profit settings are high enough to cover all potential costs, like slippage and fees, so you actually make a profit when the target is reached. 

It verifies that minimum and maximum values are consistent, and that time-related settings use positive whole numbers. Finally, it checks parameters related to how candles (price data) are handled, such as retry attempts and anomaly detection limits. Essentially, it's designed to catch potential errors in your configurations before they cause problems.

## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It's designed to check your column definitions against a standard, preventing issues caused by incomplete or incorrect data. 

Essentially, it verifies that each column has the necessary properties: a unique key, a descriptive label, a formatting function, and an indicator of visibility. 

The service also ensures that the keys are unique so you don’t have any conflicts.  It makes sure your labels and keys are strings, and that the functions you're using for formatting and visibility are actually functions and not something else. This process aims to maintain data integrity and prevent unexpected behavior when working with your column configurations.

## Class ClientSizing

The ClientSizing component helps determine how much of an asset to trade based on various strategies. It's a flexible system that allows you to define how position sizes are calculated, letting you choose from methods like fixed percentages, the Kelly Criterion, or using Average True Range (ATR).  You can also set limits on the minimum or maximum position size, and cap the overall percentage of your capital that's used.  It's designed to work behind the scenes in your trading strategies, figuring out the best position sizes automatically.  You can even provide custom callbacks for additional validation or logging during the calculation process. Essentially, it provides a configurable and controlled way to manage risk and optimize trading.


## Class ClientRisk

ClientRisk manages risk at the portfolio level, ensuring trading signals adhere to predefined limits. It prevents signals that would exceed maximum concurrent positions or fail custom validation checks. Multiple trading strategies share a single ClientRisk instance, enabling analysis of risk across different strategies.

The `params` property holds the configuration parameters for the risk management system. The `_activePositions` property tracks currently open positions, using a unique key combining strategy, exchange, and symbol. Initialization of this map happens once and skips persistence during backtesting. `waitForInit` manages this one-time initialization process. `_updatePositions` handles persistence of active positions, also skipped in backtest mode.

The core functionality is in `checkSignal`, which determines whether a signal is permissible based on risk constraints and uses information about current positions. `checkSignalAndReserve` provides a concurrency-safe way to check signals *and* reserve space in the active position map, preventing situations where multiple strategies simultaneously pass checks and exceed limits.

`addSignal` records when a signal is opened, and `removeSignal` clears a signal when it’s closed. These methods are used by the system to update the tracking of active positions. Careful use of `checkSignalAndReserve`, `addSignal`, and `removeSignal` is crucial to avoid stale reservations in the risk map.

## Class ClientFrame

The ClientFrame helps create the timelines your backtesting runs need, essentially providing the sequence of dates and times for your historical data. It's designed to be efficient, so it avoids re-calculating the same timelines repeatedly by keeping a cache. 

You can control how finely the timeline is divided – from minute-by-minute to daily intervals. 

It also allows you to hook into the timeline generation process, so you can check if the data is correct or record what's happening. 

The `getTimeframe` property is the main method you'll use; it fetches the timeframe array for a specific symbol, remembering previous requests to speed things up.


## Class ClientExchange

This `ClientExchange` acts as a bridge, letting your backtest framework communicate with actual exchange data. It handles fetching historical and future candle data, which is crucial for testing your trading strategies. It can also calculate the Volume Weighted Average Price (VWAP) to help understand price trends and format quantity and price data to match the exchange's specific rules.

Here’s a breakdown of what it can do:

*   **Candle Data:** It retrieves historical and future candle data – necessary for backtesting – making sure the data aligns properly with your backtest’s timeline.
*   **VWAP Calculation:** Calculates VWAP using recent 1-minute candles, providing a good indication of the average price considering trading volume.
*   **Price/Quantity Formatting:** Automatically formats prices and quantities to match the exact standards of the exchange you are working with, ensuring compatibility.
*   **Flexible Data Retrieval:** The `getRawCandles` method offers a lot of control, letting you specify start and end dates or just a limit, and it's designed to prevent look-ahead bias (using future data to influence past decisions).
*   **Order Book and Trades:** It can also fetch order book information and aggregated trade data.
*   **Memory Efficiency:** It utilizes prototype functions to optimize memory usage.



Essentially, this component takes care of the complex data interactions with the exchange, allowing your backtest framework to focus on strategy development and testing.

## Class ClientAction

The `ClientAction` component is responsible for managing and executing your custom action handlers, which are essential for things like state management, logging, notifications, and analytics within your trading strategy. It acts as a bridge between the core trading framework and your custom logic.

Think of it as a central hub that routes different events—like signals, breakeven updates, or risk rejections—to the appropriate functions within your action handler. It ensures these handlers are only created and cleaned up once.

You’ll use specific methods like `signal`, `signalLive`, and `signalBacktest` to pass data to your handlers based on the type of trading mode (live or backtest).  Specialized methods exist for events such as partial profits, losses, and scheduled tasks, letting you handle these situations precisely. 

The framework also offers ways to manually trigger events (`scheduleEvent`, `pendingEvent`) that let you connect your custom logic to events through specific callbacks. These callbacks let you control and manage signal lifecycles and ping events. The `orderSync` and `orderCheck` methods handle order-related events. Remember that errors from these two methods are passed up for handling elsewhere.

## Class CacheUtils

CacheUtils helps you easily store the results of functions to avoid recalculating them, especially when those calculations depend on things like candle intervals. It’s like having a smart assistant that remembers what a function has already computed.

You can use `fn` to cache regular functions based on time intervals; the assistant will only run the function again when the time interval changes.

For async functions, `file` provides a way to store results persistently on disk, using files to hold the cached data – essentially creating a file-based cache. This is useful for more complex calculations.

If you need to completely clear the cache for a specific function, `dispose` removes it and any saved results, forcing the function to recalculate.

`clear` completely wipes out all cached data.  It’s good to use when the working directory of your project changes, to make sure the cache is recreated using the new paths.

`resetCounter` resets the index used for file caching, preventing clashes when the working directory changes and ensuring fresh file names are used. Think of it as a clean slate for file-based caching.

## Class BrokerBase

This class, `BrokerBase`, is the foundation for connecting your trading strategy to actual exchanges. Think of it as a template for creating your own "broker" that understands how to interact with a specific exchange like Binance or Coinbase. It provides a lot of the groundwork, like automatic logging of important events, so you don’t have to build that from scratch.

You'll extend this class to handle tasks like placing orders, updating stop-loss and take-profit levels, tracking your positions, and sending notifications (like Telegram messages).

Here’s a breakdown of how it works:

**Initialization:** When your strategy starts, `waitForInit()` lets you do any setup work, like logging into your exchange account.

**Event Handling:**  As your strategy runs, different “commit” methods are called when key events happen. These include opening and closing positions, taking profits, and adding to positions through dollar-cost averaging (DCA).

*   `onSignalOpenCommit`: Used to actually place a market or limit order when a new trading signal appears.
*   `onSignalCloseCommit`: Used to close an existing position when the strategy reaches a take-profit or stop-loss target.
*   `onOrderCheck`: (Advanced) Lets you check with the exchange to see if an order was actually placed. If it wasn't, you can retry.
*   `onSignalActivePing`, `onSignalSchedulePing`, `onSignalIdlePing`: These methods are purely for keeping track of what’s happening – they provide a way to monitor the status of pending orders.
*   `onSignalScheduleOpen`: Used to place a limit order when a potential trade opportunity arises.
*   `onSignalScheduleCancelled`: Used to cancel a resting order when a signal is no longer valid.
*   `onSignalPendingOpen`: Called when a position is actually opened – used for mirroring this state elsewhere.
*   `onSignalPendingClose`: Called when a position is closed, used for mirroring this state elsewhere.
*   `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, `onAverageBuyCommit`: These methods handle more specialized actions, like taking partial profits, adjusting stop-loss levels, or adding to a position through DCA.

Most of these methods include default implementations, so you only need to override the ones that you want to customize. The `BrokerBase` automatically handles logging and integrates with the framework's event system, making it easier to build a robust and reliable trading bot.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, controlling how trade actions are executed. Think of it as a safety net—if something goes wrong during a trade, it prevents the changes from being applied. 

During backtesting, it essentially ignores these actions, making your tests run faster. When you're trading live, it forwards your trades to the broker.

Here's a breakdown of what it does:

*   **Signal Handling:** Automatically sends open and close signals to your broker.
*   **Ping Messages:** Regularly sends informational updates (pings) to the broker about active, scheduled, and idle positions.
*   **Commit Interception:**  Provides control points (`commitSignalOpen`, `commitSignalClose`, etc.) before key actions (like partial profit/loss adjustments, trailing stops, and take profits) occur. If any of these commit functions throws an error, the trading action is halted.
*   **Adapter Registration:** You need to tell the framework which broker adapter to use via `useBrokerAdapter()`.
*   **Enabling/Disabling:** To start using the broker adapter, you need to call `enable()`. To stop, call `disable()`.

The `clear()` function is useful for refreshing the broker adapter when the environment changes (like when changing directories).

## Class BreakevenUtils

This class helps you understand and analyze your breakeven performance. It acts like a central hub for accessing information gathered about breakeven events, providing both statistical summaries and detailed reports. Think of it as a way to inspect how your trading strategies are behaving in relation to breakeven points.

It collects data on events like timestamp, the asset being traded, the strategy used, signal IDs, position type, entry prices, current prices, and whether the test was a backtest or live trade.

You can use it to get overall statistics about breakeven events, create formatted markdown reports that show all the relevant details in a table, or save those reports directly to files. The reports include things like symbol, strategy, signal ID, position, entry and breakeven prices, and timestamps, giving you a clear picture of what's happening. You can also specify which columns to include in the report. The files are named using the symbol and strategy name for easy organization.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven point. It’s designed to automatically record these moments, along with all the details about the signal, so you can analyze your trading performance later.

Think of it as a dedicated recorder for breakeven milestones. It listens for breakeven events and carefully stores them in a database.

To use it, you'll need to subscribe to receive the events. This ensures you don't accidentally subscribe multiple times. When you're done, you can unsubscribe to stop the service from recording further. It’s straightforward: subscribe to start, unsubscribe to stop.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them by symbol and strategy, then generates well-formatted markdown tables that summarize the information. You can request statistics like the total number of breakeven events, and the service conveniently saves these reports as markdown files, making them easy to review and share.

You can subscribe to receive these breakeven events, and it’s designed to prevent accidental multiple subscriptions. When you're finished, you can unsubscribe to stop receiving events.

The service allows you to retrieve the data and generate reports for specific symbols, strategies, exchanges, frames, and backtest configurations.  You can also trigger a complete dump of reports to disk, or clear the accumulated data when needed, either for a specific symbol/strategy combination or everything. The storage system ensures that each unique combination of symbol, strategy, exchange, frame, and backtest has its own dedicated storage space.

## Class BreakevenGlobalService

This service acts as a central point for managing breakeven tracking within the system. It's designed to be injected into the ClientStrategy, offering a consistent way to handle breakeven operations and providing a place to log those activities.

Essentially, it sits between the ClientStrategy and the actual connection to the breakeven functionality. It logs each operation before passing it on, ensuring everything is monitored.

Several validation services are used to verify the existence of strategies, risks, exchanges, frames, and actions before breakeven processes are initiated.

The `validate` function checks if a strategy and its associated risk configuration are valid, and it remembers the results to avoid repeating the check unnecessarily.

The `check` function determines if a breakeven trigger is needed, and if so, it emits an event; it also logs the action.

Finally, the `clear` function resets the breakeven state when a signal is closed, again with logging and delegation to the connection service.


## Class BreakevenConnectionService

This service helps track and manage breakeven points for trading signals. It’s designed to be efficient, creating and storing only one breakeven calculation instance for each unique signal, regardless of whether it's a backtest or a live trade. 

Think of it as a central hub for breakeven calculations that’s automatically handled and cleaned up.

It's connected to other parts of the trading system, receiving information about signals and prices. It then uses this information to determine if a breakeven point needs to be checked or cleared.

The service keeps track of these calculations to avoid redundant work and prevent memory issues, ensuring that calculations are ready when needed and removed when they’re no longer relevant. It's responsible for creating, managing, and cleaning up these calculations within the system.

## Class BacktestUtils

This utility class simplifies backtesting operations by providing convenient functions to interact with the backtest engine. It acts as a centralized access point for common tasks, often used as a singleton.

It allows you to run backtests, either normally or in the background for tasks like logging. You can also retrieve information about pending signals, such as whether one exists, or details like the price, cost, and time elapsed.

Several methods are available to analyze a position's performance, including calculating total percentage closed, total cost closed, breakeven price, effective entry price, and various profit/loss metrics over time.  It also offers functions to manage signals, allowing you to cancel scheduled signals, close pending signals, and adjust stop-loss and take-profit levels.

There are also specialized functions for controlling and monitoring the backtest itself, such as committing price movements, activating scheduled signals, or generating reports and statistics. The `getData` and `getReport` methods provide a way to collect and view the results of your backtests.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what’s happening during your backtests. It's like a meticulous observer, noting every important change in your trading signals – when they're just waiting, when they're actively trading, and everything in between.

It works by listening for signals from your backtest and diligently recording each tick event, including all the specific details of the signal. This data is then saved to a database, ready for you to analyze and figure out how to improve your strategies.

You can easily set it up to start recording, and it prevents accidental double-registration. When you're done, you can also easily stop it from recording. Think of it as a vital tool for understanding and refining your trading strategies through careful examination of past performance. 


## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports of your backtesting results. It works by listening for events as your strategy runs, tracking the results of closed trades (signals).

It organizes this data using a unique storage system for each symbol, strategy, exchange, timeframe, and backtest run, ensuring that data from different tests stays separate.

You can then use this service to generate markdown reports that clearly show the information about each closed signal. These reports are saved as files on your disk, making it easy to review and share your backtesting findings.

Here's a breakdown of what it offers:

*   **Data Accumulation:** It automatically gathers closed signal data as your strategy runs.
*   **Report Generation:** You can request formatted markdown reports for specific symbols and strategies.
*   **File Saving:** It saves these reports directly to files in a designated directory.
*   **Data Clearing:**  You can clear out accumulated data, either for a specific test configuration or all data at once.
*   **Event Subscription:** It allows you to connect to the backtest process and receive updates as ticks occur. You can easily stop listening when you no longer need to.

## Class BacktestLogicPublicService

This service helps you run backtests in a clean and organized way. It handles the complexities of keeping track of important information like the strategy name, exchange, and frame used during the backtest.

You don't need to constantly pass these details around; the service manages them automatically.

It essentially builds upon a private backtest logic service, making it easier to use and maintain.

Here’s a breakdown of what you'll find:

*   **loggerService:** Provides access to logging and execution context information.
*   **backtestLogicPrivateService:** The core engine for running the backtest.
*   **timeMetaService:**  Deals with time-related data and calculations.
*   **frameSchemaService:** Manages the structure and definition of data frames.
*   **exchangeConnectionService:**  Handles connections to exchanges.

The `run` method is the main way to start a backtest. It takes a symbol and context (strategy, exchange, frame) and delivers the results as a stream of signals (like closed trades). This stream allows you to process the backtest data step-by-step.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process in a streamlined way. It works by pulling timeframes from a frame service and then stepping through each one, checking for signals. 

When a signal appears, it fetches the necessary historical data (candles) and runs a backtest. The service then efficiently skips ahead to the point where the signal closes.

Results are delivered continuously as a stream of data – closed strategy results – rather than building up a large array in memory, making it more efficient for large backtests. 

You can also stop the backtest early if needed by interrupting the stream. This service relies on several other services like the strategy core service, exchange core service, and frame core service to handle specific tasks, and also uses a logger for detailed logging during execution. The `run` method is the key entry point, taking the symbol to backtest as input and returning an asynchronous generator that yields the results.

## Class BacktestCommandService

The BacktestCommandService acts as the central point for running backtests within the system. It simplifies access to backtesting features and makes them suitable for use throughout the application.

It bundles together several important services like validation and risk management, ensuring that backtests are set up correctly and safely.

The `validate` function checks the strategy and its associated risk settings to make sure everything is compatible. To optimize performance, this check is only performed once for each unique combination of strategy, exchange, and frame.

The `run` function is the key command—it actually executes the backtest for a specific symbol and provides a stream of results detailing what happened during the simulated trading period, including order openings, closings, and cancellations. You provide the symbol being backtested, along with details about the strategy, exchange, and frame being used.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers – those pieces of code that respond to specific actions in your system. Think of it as a central place to register and verify these handlers.

It allows you to add new handlers using `addAction`, ensuring they're known to the service. 

Before using an action handler, you can call `validate` to confirm it exists, preventing errors later on.

To see all the handlers you've registered, `list` provides a convenient way to get a complete overview.

For efficiency, validation results are cached, so repeated checks for the same handler are quick.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of and manage the different actions your system can perform. It's like a central catalog for your actions, making sure they're all set up correctly and consistently.

This service is built to be very reliable, using a special system for storing action details in a type-safe way.  It checks to ensure that your action handlers only use approved methods.

Here's a breakdown of what it does:

*   **Registering Actions:** You can register new actions, and the service will check them to make sure they're set up properly, preventing duplicates.
*   **Validation:** It performs quick checks to make sure your action schemas have the necessary parts.
*   **Updating Actions:**  You don't always need to re-create an action – you can make smaller changes to existing ones.
*   **Retrieving Actions:** Easily find action configurations when you need them.



The service relies on a `loggerService` for tracking and errors, and uses an internal `_registry` to hold the action schemas.

## Class ActionProxy

The `ActionProxy` acts as a safety net when running custom code within the trading framework. It essentially wraps your custom functions (like `init`, `signal`, `breakevenAvailable`, etc.) and automatically catches any errors that might occur during their execution. This prevents errors in your custom code from crashing the entire trading system.

Think of it as a protective layer – if something goes wrong in your code, it gets logged and reported, but the trading process continues uninterrupted.

It uses a factory pattern, meaning you don’t directly create instances of `ActionProxy`; instead, you use the `fromInstance` method to wrap existing action handlers. The `ActionProxy` checks if a method exists on the wrapped object before calling it, allowing for partial implementations. Crucially, certain methods (`orderSync` and `orderCheck`) intentionally *don't* have this error protection because they need to propagate errors directly to other parts of the system. Finally, it includes methods to handle various lifecycle events related to signals, scheduling, and order management, all with the same robust error handling.

## Class ActionCoreService

This service acts as a central hub for managing actions within your trading strategies. It handles everything from retrieving the list of actions defined in a strategy's configuration to ensuring they're properly validated and executed.

Here’s a breakdown of what it does:

*   **Action Management:** It reads the list of actions needed by a strategy from its schema, validating their configuration and invoking handlers for each one.
*   **Event Routing:** It's responsible for sending different types of events—like signals, breakeven calculations, partial profits, and risk rejections—to the appropriate actions.  There are specific functions for backtesting, live trading, and scheduled events.
*   **Initialization and Cleanup:**  It ensures actions are properly initialized when a strategy starts and cleaned up when it finishes, including retrieving any persisted data.
*   **Validation:** A critical component, it validates the strategy's setup (strategy name, exchange, frame) and the actions themselves to prevent errors. It caches these validations for efficiency.
*   **Synchronization:** It offers functions for synchronizing and checking order-related actions, ensuring consistency across all involved actions.
*   **Data Clearing:** Provides options to clear action data, either selectively for a specific action or comprehensively for all strategies.

Essentially, it's a behind-the-scenes component that automates the execution and coordination of actions within your trading strategies.

## Class ActionConnectionService

This service acts as a central hub for directing different kinds of actions related to a trading strategy. It intelligently routes events – like signals, breakeven updates, or scheduled tasks – to the correct action handler based on things like the action's name, the strategy being used, and the specific trading frame. To make things efficient, it remembers recently used action handlers, so it doesn't have to recreate them every time.

Think of it like a postal service for actions, ensuring each one gets to the right place within your trading system.

Here’s a breakdown of its core functionalities:

*   **Action Routing:** It takes an action name and figures out which handler is responsible.
*   **Caching:** It saves those handlers so they can be reused quickly. This speeds up the process. The cache key includes vital details to make sure the right action is used for each strategy and frame combination.
*   **Event Handling:** It passes events (like trade signals, risk notifications, or order updates) to the appropriate handler.
*   **Initialization & Disposal:**  It handles the setup and cleanup of those handlers when needed, which might include loading persistent data or releasing resources.
*   **Clear Cache:** It has a function to clear the cached action instances if needed.

## Class ActionBase

This framework provides a base class, `ActionBase`, for building custom actions that extend the core trading logic. Think of it as a starting point for plugging in your own unique features, like sending notifications or managing risk. It handles the basic setup and logging, so you don't have to.

When you extend `ActionBase`, you'll receive notifications at various points in the trading process – for example, when a signal is generated, when a profit or loss target is hit, or when a signal is rejected by risk management. You can then build logic around these events to create custom behaviors.

The class offers several pre-built methods, each triggered by a specific event. These methods automatically log relevant information, allowing you to track what’s happening in your strategy. You only need to implement the methods that are relevant to your custom actions.

The lifecycle of an action is straightforward: it initializes once, then receives events as the strategy runs, and finally cleans up when it’s finished. This structured approach ensures your custom actions are seamlessly integrated into the backtest-kit framework.

