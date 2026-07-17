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

The WalkerValidationService helps you keep track of and confirm the settings for your parameter sweeps, also known as walkers. It acts like a central directory for these walker configurations.

You can register new walkers using `addWalker`, ensuring they're known to the system. Before using a walker, `validate` checks if it exists and makes sure its associated strategies, risks, and actions are also valid.

The service remembers validation results, so it doesn't have to repeat checks unnecessarily – this makes things faster.  Finally, `list` allows you to see all the walkers currently registered.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, providing a central place to manage and monitor their execution. It's designed to make running and interacting with walkers easier, handling common setup tasks like retrieving walker information and logging.

The `run` method executes a walker for a specific symbol, allowing you to process and receive data as it becomes available.  If you just need a walker to perform actions like logging or triggering callbacks without directly handling the results, the `background` method is perfect for that. 

For situations where you need to halt a walker’s signal generation, the `stop` method offers a controlled way to interrupt its activity, ensuring current signals finish gracefully. You can also retrieve comprehensive data and reports from walker comparisons using `getData` and `getReport`, and even save reports to files directly using `dump`. Lastly, `list` gives you a quick overview of all currently running walkers and their states. The system utilizes a singleton pattern, meaning you'll always be working with the same instance of WalkerUtils for consistent access and control.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of and manage your walker schemas, which define the structure of your data. It uses a special system to ensure that your schemas are consistent and typed correctly.

You can add new schemas using `addWalker()` and find them again by their name.

Here's a bit more detail:

*   The `register` function lets you add a new walker schema to the system.
*   `validateShallow` checks the new schema quickly to make sure it has all the essential parts.
*   `override` allows you to update an existing schema, changing only specific parts of it.
*   `get` is your way to retrieve a schema once it’s been registered.

Essentially, this service is designed to make working with your walker schemas organized and reliable.

## Class WalkerReportService

This service helps you keep track of how your trading strategies perform during optimization, specifically when using the walker framework. It essentially listens for updates on your strategy tests and records the results – things like metrics and performance statistics – into a database. 

You can think of it as a detailed logbook for your optimization experiments. It remembers the best performing strategies it's seen so far and tracks how the optimization process is progressing.

To get it working, you need to subscribe to the walker's events. The subscription process is designed to prevent accidental multiple connections. You can stop listening at any time using the unsubscribe function. The service uses a logger to output helpful debugging information as it works.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they run. It listens for updates from your trading strategies (walkers) and carefully organizes the results. 

Each walker gets its own dedicated storage area to keep its data separate. The service then generates clear, readable markdown tables that compare the performance of different strategies. Finally, these reports are saved to your disk, making it easy to review and analyze your trading activity.

You can subscribe to receive these updates in real time, and there’s a way to unsubscribe if you no longer need them. The `tick` function is how the service receives these updates, and you can use methods like `getData`, `getReport`, and `dump` to access and save the data.  You can also clear out previously saved data, either for a specific walker or for all of them.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are components in your trading system. It builds upon a private service, automatically passing along important information like the strategy name, exchange, frame, and walker identifier with each request. 

Think of it as a helper that simplifies the process of executing tests or simulations across different strategies and data sources.

The `run` method is the core – it takes a symbol (like a stock ticker) and some context data, then generates a sequence of walker results. It essentially kicks off the backtesting process, handling the details of propagating context. 

You'll find properties for logging, accessing the underlying private service, and managing the structure of the walkers themselves.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies, essentially orchestrating a series of backtests. It’s designed to give you ongoing updates on how each strategy is performing.

As each strategy finishes running, you'll receive progress information.  The service keeps track of the best performing strategy so far, letting you see real-time results.

Finally, it delivers a complete report, ranking all the strategies you tested against each other.  It relies on the BacktestLogicPublicService to actually run the individual backtests for each strategy.


## Class WalkerCommandService

WalkerCommandService acts as a central point for interacting with walker functionality within the backtest-kit framework. It's designed to make it easy to inject dependencies, like logging and validation services, into the system.

This service provides a `run` method, which is your primary way to execute a walker comparison. You give it a symbol (like a stock ticker) and context information – the walker’s name, the exchange involved, and the frame being used – and it will return a sequence of results.

Several validation services are built in to ensure the walker and its strategy configurations are set up correctly. The validation process is repeated intentionally for added security, catching potential issues early. 

The service also exposes several validation services directly: strategy, risk, action, exchange, frame, walker, and strategy schema validation.

## Class TimeMetaService

The TimeMetaService helps you keep track of the latest candle timestamps for your trading strategies. It's particularly useful when you need to know the current time outside of the usual trading tick process, like when a command needs to be executed between ticks.

Think of it as a central place that stores the most recent timestamp for each combination of symbol, strategy, exchange, frame, and whether you're in a backtest or not. It automatically updates these timestamps after each tick, making sure you always have the latest information.

If you're running code within a trading tick, it uses the timestamp already provided by the environment. Otherwise, it looks up the timestamp from its internal records, and if it hasn't seen one yet, it waits briefly for the first one to arrive.

You can clear these stored timestamps to free up memory and ensure you're working with fresh data – especially important at the start of a new strategy run. This service is managed automatically by the framework and is essential for coordinating trading activity.


## Class SystemUtils

SystemUtils helps keep backtest runs separate from each other. Think of it as a way to create a clean slate for each test so that one test doesn't accidentally mess up another.

It provides a way to temporarily pause all listeners that are subscribed to global events. This is useful to make sure each backtest operates independently.

The `createSnapshot` function lets you essentially "freeze" the current state of all listeners, like taking a picture. It clears out the internal tracking of event listeners so that a backtest can run without influencing the others and without getting affected by previous ones. You can later restore that picture to bring everything back to how it was.


## Class SyncUtils

SyncUtils helps you understand and analyze the lifecycle of your trading signals. It gathers data from signal openings and closings, providing insights into the overall activity.

You can request statistics like the total number of signals opened and closed.

It can also generate detailed reports in Markdown format. These reports present your signals in a table, showcasing key information like signal ID, action taken, position details, profit/loss information, and timestamps.

Finally, SyncUtils can automatically save these reports as files, making it easy to track and review your signal performance. The files are named clearly to identify the symbol, strategy, exchange, frame, and whether it's a backtest or live data.

## Class SyncReportService

The SyncReportService is designed to keep track of signal activity and create audit trails for order management. It monitors signal lifecycle events, specifically when a signal is opened (when a limit order is filled) and when it’s closed (when a position is exited).

It records detailed information about these events, including signal specifics for openings and profit/loss and closing reasons for exits. 

The service uses a logger to output debug information and stores data using a report writer to persistently save the events. To prevent accidental duplicate subscriptions, it uses a mechanism called "singleshot" which ensures that only one subscription exists at a time.

You can subscribe to receive these signal events, and it's important to unsubscribe when you no longer need to listen to avoid unnecessary processing. If you’ve already subscribed, unsubscribing will simply stop the event monitoring.


## Class SyncMarkdownService

This service helps you create and save reports detailing signal synchronization events. It's like a dedicated record-keeper for your trading signals, letting you understand their lifecycle and performance.

It works by listening for signal events, organizing them by symbol, strategy, exchange, and timeframe. Then, it builds markdown reports—easy-to-read tables—that show you each signal's opening, closing, and other details, along with overall statistics. These reports are saved to disk, keeping a history of your signal activity.

You can subscribe to receive these events, and the service will automatically keep track of them. When you’re done, you can unsubscribe to clear the accumulated data and stop listening for new events.

The `tick` method is the engine that processes each incoming signal event, adding helpful context like timestamps. You can also request data (statistics or the full report) for a specific trading context, or dump the report directly to a file. Finally, there’s a `clear` function to completely wipe the records for specific combinations or everything.

## Class StrategyValidationService

This service helps keep track of your trading strategies and makes sure they're set up correctly. It's like a central control panel for your strategies, allowing you to register new ones, and confirming that everything associated with them—like risk profiles and any actions they take—is also valid. 

You can add strategies using the `addStrategy` method, which essentially registers them with the service. To check if a strategy and its linked parts are all good to go, use the `validate` function. If you need a quick view of all the strategies you've registered, the `list` function will give you a comprehensive list of them.

Internally, the service is designed to be efficient, remembering the results of validations so it doesn't have to re-check things unnecessarily. It relies on other services – `riskValidationService` and `actionValidationService` – to validate their respective components.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. Think of it as a tool for getting reports and statistics on your strategy's activity.

It gathers data about events like closing trades, taking profits, or setting stop losses. This information is collected by another component, and StrategyUtils then organizes it into easy-to-understand reports.

You can use StrategyUtils to:

*   Get summarized statistical data, showing how often different actions are taken.
*   Generate detailed markdown reports, presenting each event in a table with key information like price, percentages, and timestamps.
*   Save these reports to files for later review or sharing.

Essentially, it gives you a way to track and document your strategies' behavior and performance over time.

## Class StrategySchemaService

The StrategySchemaService helps keep track of different trading strategy blueprints, ensuring they're all structured correctly. It uses a special system for type-safe storage.

You can add new strategy blueprints using `addStrategy()`, and find them again by their names.

Here's what else it offers:

*   It makes sure new strategy blueprints have the essential properties when you add them.
*   You can update existing strategy blueprints with new information.
*   It provides a way to easily look up a strategy blueprint by its name.

It also has a logger to help track what's happening and a registry to store the strategy blueprints.

## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions. It’s like having a constantly updating log file that records every significant event, such as when a trade is canceled, closed, or when partial profits or losses are taken.

To start using it, you need to “subscribe” – this turns on the logging functionality. Events like trailing stop adjustments, breakeven movements, and average buy entries are all recorded as separate JSON files. This approach contrasts with other reporting methods that hold everything in memory.

When you’re done, you need to “unsubscribe” to stop the logging and clean up resources. It's a straightforward process of enabling and disabling the recording of these key strategy events.


## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's actions during backtesting or live trading. Think of it as a detailed logbook that collects information about events like canceling scheduled orders, closing positions, and adjusting stop-loss levels.

It remembers these events in memory, grouped by symbol, strategy, exchange, and frame, instead of writing each one to a file immediately. This is more efficient for generating complete reports.

Here's how it works:

1.  **Start Collection:**  Use `subscribe()` to tell the service you want it to start recording events.
2.  **Automatic Recording:** It automatically captures events like `cancelScheduled`, `closePending`, `partialProfit`, and more. You don't need to manually trigger these – the service listens for them.
3.  **Access Data:** You can retrieve collected data using `getData()` to get statistics or `getReport()` to generate a markdown report. The reports can be customized with specific columns to show exactly what you need.  `dump()` is a convenient shortcut to create and save that report as a file.
4.  **Stop Collection:** When you're done, use `unsubscribe()` to stop recording and clear the stored data.

The `getStorage` property is a special system for creating these memory containers, making sure each combination of symbol, strategy, exchange, frame, and backtest scenario gets its own unique storage area.

This service gives you a way to easily analyze and understand what your strategy is doing and how it's performing.


## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for managing strategies during backtesting or live trading. It essentially wraps other services to inject relevant information like the trading symbol, timestamp, and backtest mode into the trading process.

Here's a breakdown of what it does:

*   **Validation:** It can validate both the strategy itself and its associated risk configurations. This helps ensure the strategy is set up correctly.
*   **Signal Retrieval:** It can retrieve pending or scheduled signals for a specific trading symbol. These signals represent potential trading opportunities.
*   **Position Data:** It provides access to detailed information about a currently open position, including cost basis, entry prices, partial close history, and profit/loss metrics.
*   **Control Functions:** It allows for actions like stopping the strategy, canceling scheduled signals, or closing positions.
*   **Tick Processing:** It handles individual "ticks" of data by wrapping the strategy's tick function and providing the necessary context.
*   **Backtesting:** It facilitates running fast backtests against historical price data.
*   **Metrics:** Provides a lot of information about the performance of a position: highest profits, maximum drawdowns, and time elapsed since those events. It has helper methods to calculate metrics such as P&L, breakeven, and active/waiting minutes.



Essentially, `StrategyCoreService` streamlines the complex process of managing strategies, ensuring that they are properly validated, monitored, and controlled.

## Class StrategyConnectionService

This class, `StrategyConnectionService`, acts as a central hub for routing trading strategy operations. It ensures that requests for a strategy (like getting its current state or executing a trade) are directed to the correct, specific strategy implementation based on the trading symbol and strategy name. To optimize performance, it keeps a cached copy of these strategy implementations, reusing them when possible.

Before you can use any of its methods, it's important to initialize the service.

The service provides various functions to interact with the strategy, including retrieving information like pending signals, total position percentages, costs, and estimated durations. It also allows for key actions, such as executing trades (`tick`, `backtest`), managing signals (`createSignal`), and modifying the strategy's behavior (`trailingStop`). Importantly, it offers methods for partial closing of positions (`partialProfit`, `partialLoss`) and for adjusting stop-loss/take-profit levels (`trailingStop`, `trailingTake`). It also includes methods for managing scheduled signals (`cancelScheduled`, `activateScheduled`). Finally, you can use it to validate actions before executing them.


## Class StorageLiveAdapter

The StorageLiveAdapter helps manage how your trading signals are stored, offering flexibility in where that data lives. Think of it as a central hub that can connect to different storage systems like disk, memory, or even a dummy system for testing. By default, it uses persistent storage – meaning signals are saved to your hard drive. However, you can easily switch to in-memory storage for faster performance during development, or use the dummy adapter to simulate storage without actually saving anything.

This adapter keeps a cached version of the storage utility to improve performance, but it’s important to clear that cache (`clear()`) if your base directory changes between strategy runs, ensuring the adapter uses the correct storage location.  It provides methods like `handleOpened`, `handleClosed`, `findById`, and `list` to interact with the signal data, forwarding those requests to the currently selected storage backend. You can also influence the adapter’s behavior using `useStorageAdapter` to use a custom storage implementation, or quickly switch to dummy, memory, or persistent storage with `useDummy`, `usePersist`, and `useMemory` respectively. The `handleActivePing` and `handleSchedulePing` methods automatically update signal timestamps when ping events are received.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` helps manage how your backtesting data is stored, offering flexibility in choosing where that data lives. It lets you swap out different storage methods – like keeping everything in memory, persisting data to disk, or using a dummy adapter for testing – without changing much of your core code.

This adapter acts as a central point for interacting with the storage, providing methods to find signals, list them, and handle various events related to signals (opened, closed, scheduled, cancelled, and ping events). You can easily switch between storage types using convenient helper functions like `useMemory`, `usePersist`, and `useDummy`. The system remembers the storage adapter you've chosen, but you can clear this memoized instance if you need to ensure a fresh start, particularly when the working directory changes. This allows for different strategies to reuse the same base path.

## Class StorageAdapter

The StorageAdapter is the central piece for keeping track of both historical (backtest) and current (live) trading signals. It automatically updates its records whenever new signals are generated. 

To start tracking signals, you enable the adapter, which subscribes it to the sources of those signals, ensuring this only happens once. Conversely, you can disable it to stop tracking, and it's safe to disable it multiple times.

Need to look up a specific signal? You can search for it by its unique ID.  

You can also retrieve lists of all backtest signals or all live signals, allowing you to examine past performance or monitor current activity.

## Class StateLiveAdapter

The `StateLiveAdapter` provides a way to manage and store trading state information, allowing for flexibility in how that state is handled. It uses an adapter pattern, meaning you can easily swap out different storage methods without changing the core logic.

By default, it saves data to a file on your computer, so your progress is preserved even if your application restarts. You also have the option to use an in-memory storage (lost on restart) or a dummy storage (data is ignored).

This adapter is designed to support complex trading strategies, particularly those that use LLMs (Large Language Models) to make decisions. It helps track important metrics like the percentage gain and how long a trade has been open, and can automatically close trades if certain criteria aren’t met.

To help keep things tidy, there are functions to:

*   `disposeSignal()`: Clears out old data associated with specific trading signals.
*   `getState()`: Retrieves the current state of a signal.
*   `setState()`: Updates the state of a signal.
*   `useLocal()`, `usePersist()`, `useDummy()`: Quickly switch between different storage backends.
*   `useStateAdapter()`: Use a custom storage implementation.
*   `clear()`: Resets the cached data, useful when your working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage the state during backtesting, allowing you to choose different storage methods for your data. It uses an adapter pattern, meaning you can easily swap out the underlying storage mechanism without changing your core logic. By default, it uses an in-memory store for simplicity, but you can also switch to a file-based persistence option or a dummy adapter for testing purposes.

This adapter is designed to track important metrics like the peak percentage gain and how long a position has been open, which are crucial for evaluating trading rules, especially those driven by AI.

The `disposeSignal` method is key for cleaning up old data when a trading signal is finished, preventing memory leaks. You can retrieve and update state using `getState` and `setState` methods, which handle the complexity of storing and retrieving data based on the selected adapter.

If you want to quickly switch storage methods, there are convenient functions: `useLocal` for memory, `usePersist` for file storage, `useDummy` for discarding changes, and `useStateAdapter` to incorporate your own custom storage solutions.  Finally, `clear` helps ensure new instances are created when the working directory changes.

## Class StateAdapter

The StateAdapter is the central hub for managing data during backtesting and live trading. It handles all the state storage, making sure things are cleaned up properly.

You can think of it as a smart manager that subscribes to signals and automatically takes care of stale data. It ensures that you don’t end up with outdated information hanging around.

To start using the state storage, you'll use the `enable` function.  This function sets everything up to listen for signal changes. It is designed to prevent being called multiple times.  Conversely, `disable` stops the listening, and it's perfectly safe to call it more than once.

The `getState` function allows you to retrieve the current state for a specific signal. The `setState` function is used to update the state, again, intelligently directing the update based on whether you're backtesting or in live mode.

## Class SizingValidationService

This service helps you keep track of and make sure your position sizing rules are set up correctly within the backtest-kit framework. It acts like a central hub for managing your sizing strategies.

You can register new sizing strategies using `addSizing`, allowing you to define how much of your capital to allocate to each trade.  Before you use a sizing strategy, `validate` checks that it actually exists and is configured properly, preventing errors later on. To speed things up, the results of these validations are cached.  Finally, `list` provides a way to see all the sizing strategies that are currently registered.

## Class SizingSchemaService

The SizingSchemaService helps you organize and manage different sizing strategies for your trading tests. It's like a central library where you can store and retrieve these sizing schemas, ensuring they’re all set up correctly.

It uses a special type of registry to keep track of your sizing schemas, which helps avoid errors and makes your code more reliable.

You add sizing schemas using `register`, update existing ones with `override`, and retrieve them using `get`. Before a sizing schema is added, `validateShallow` checks that it has the expected basic structure and types. This makes sure everything is set up properly before your backtests run.

## Class SizingGlobalService

The SizingGlobalService handles the calculation of how much to trade, essentially determining your position size. It acts as a central hub, coordinating with other services to ensure these calculations are accurate and aligned with your risk management rules. 

Think of it as the engine that translates your risk tolerance and strategy into concrete order sizes.

It uses a `SizingConnectionService` to perform the position size calculation and also relies on a `SizingValidationService` to check things along the way. The `calculate` method is the main function; it takes your sizing parameters and a context (like the name of the sizing operation) and returns the calculated size. 

The `loggerService` is used for internal logging and debugging.

## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategy determines the size of each position. It acts as a central hub, directing sizing requests to the specific sizing method you've configured (like fixed percentage or Kelly Criterion).

To improve performance, it remembers which sizing methods it’s already created, avoiding unnecessary re-creation.

This service relies on a `sizingName` to identify the correct sizing method to use. If your strategy doesn't have a sizing configuration, this name will be an empty string.

It leverages `ClientSizing` instances to perform the actual size calculations, considering risk parameters and chosen strategies.

The `getSizing` property provides a way to get these sizing implementations, benefiting from the caching for efficiency. 

You can use the `calculate` method to request a position size, providing the parameters and the sizing name – the service then handles the routing and calculation behind the scenes.

## Class SessionLiveAdapter

This component manages live trading sessions and provides a flexible way to store and retrieve session data. It acts as an intermediary, allowing you to easily swap out how session data is handled – whether it's stored in memory, persisted to a file on disk, or simply discarded. 

By default, session data is saved to a file, ensuring it's available even if the application restarts.  You can switch to other options like storing everything in memory for faster access, or using a dummy adapter for testing where data persistence isn't needed. 

It keeps track of session data based on combinations of symbol, strategy name, exchange name, and frame name, and it intelligently caches these instances for efficiency. If your working directory changes, it’s important to clear this cache to ensure fresh instances are created with the new directory. 

There are convenient functions to quickly switch between the different storage methods: local, persistent, and dummy. Finally, you can even plug in your own custom storage solution using `useSessionAdapter`.

## Class SessionBacktestAdapter

This component manages how backtest sessions are stored and accessed. Think of it as a flexible layer that allows you to easily switch between different storage methods without changing your core backtesting logic.

Initially, it uses a simple in-memory storage, which is great for quick tests and development.  You can also change it to save data to disk for persistence or even use a dummy adapter that throws away any data it receives – useful for isolated testing scenarios.

It remembers the session data for each trading symbol, strategy, exchange, and timeframe combination, so it doesn’t have to re-read everything constantly.

To change how data is stored, you can use commands like `useLocal`, `usePersist`, or `useDummy` to quickly switch storage.  If you need even more control, you can provide a custom session adapter implementation with `useSessionAdapter`.

There's a way to clear out its memory (`clear`), which is important to call if your working directory changes during your backtesting process, ensuring that new storage instances are created.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both backtesting and live trading sessions. It intelligently directs data operations to the appropriate storage mechanism – either a backtest-specific storage or a live trading storage – depending on whether you're running a simulation or a live trade. 

You can use `getData` to retrieve existing data associated with a particular signal, specifying the symbol, strategy, exchange, frame, and whether the data relates to a backtest. Similarly, `setData` allows you to update or create new data entries for signals, also taking into account the context and backtest flag. Essentially, it simplifies data management by abstracting away the differences between backtesting and live environments.


## Class ScheduleUtils

ScheduleUtils helps you understand how your scheduled signals are performing. It’s designed to make it easy to monitor and report on the process of sending signals at specific times.

You can use it to gather data about signals waiting to be sent, those that were canceled, and calculate things like cancellation rates and average wait times.

This tool can also create easy-to-read markdown reports that summarize the signal scheduling activity for a particular trading strategy and symbol.

It provides a simple, singleton access point to these functions, making it convenient to use in your workflow. This tool is intended to provide insights into your scheduling processes, helping you identify and resolve any bottlenecks or issues.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of when signals are scheduled, opened, and cancelled, especially useful for understanding delays in order execution. It essentially listens for signal events and records them in a database.

It calculates how long signals take from scheduling to either being opened or cancelled, providing valuable insights into potential bottlenecks.

You can easily start and stop the service's signal event monitoring using the `subscribe` and `unsubscribe` methods; it prevents accidental multiple subscriptions. The `tick` property is where the actual event processing happens, and it's designed to handle the different stages of a signal's lifecycle. It also utilizes a logger to help with debugging.

## Class ScheduleMarkdownService

This service automatically creates reports about scheduled trading signals. It monitors signals as they are scheduled and cancelled, tracking details for each strategy. 

The service generates clear, readable markdown tables containing information about each signal event, along with useful statistics like cancellation rates and average wait times. These reports are saved to your logs directory, making it easy to review signal activity and performance.

You can subscribe to receive updates on signal events, and the service handles managing that subscription automatically. It also provides methods to retrieve the collected statistics and reports for specific symbols and strategies, or to clear all accumulated data when needed. This allows you to examine signal behavior across different trading strategies and environments.

## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management settings and make sure they're all set up correctly. It acts like a central record of your risk profiles, ensuring that a profile exists before you try to use it in your trading strategies.

It also remembers the results of its validations, which speeds things up if you're constantly checking the same profiles.

Here's what it lets you do:

*   Add new risk profiles to its registry.
*   Check if a risk profile exists.
*   See a complete list of all the risk profiles you’ve registered. 

The service has a place to store its logging service and the list of risk profiles it manages.

## Class RiskUtils

This class helps you understand and analyze risk rejection events within your trading system. It acts as a central point to gather statistics and create reports related to when your risk controls triggered.

Think of it as a tool to examine why trades were rejected and to quantify the frequency of those rejections.

You can request statistical data, such as the total number of rejections or breakdowns by symbol and strategy. It also allows you to generate detailed markdown reports that present rejection events in a readable table format including details like price, position, and the reason for rejection. Finally, it can automatically save these reports to files for later review and record-keeping, named using the symbol and strategy in the filename. The reports include a summary of the rejection statistics at the end.

## Class RiskSchemaService

This service helps you keep track of your risk schemas, ensuring they're consistent and well-organized. 

It uses a special storage system to maintain type safety and relies on a logger to track activity. 

You can add new risk schemas using the `addRisk()` function (accessed through `register`), and retrieve them later by their names using the `get()` function. 

Before adding a new schema, `validateShallow()` checks its basic structure to make sure it has all the necessary information. 

If a schema already exists, you can update it using `override()`, which lets you modify specific parts of the existing schema.

## Class RiskReportService

The RiskReportService is designed to keep a record of when trading signals are rejected by your risk management system. It's essentially a way to build an audit trail for risk-related decisions.

It actively listens for these rejection events and captures important information like the reason for the rejection and the details of the signal itself. 

This data is then stored in a database, allowing you to analyze why signals are being rejected and to better understand and improve your risk management processes.

To use it, you’ll subscribe to the risk rejection events; this subscription can be cancelled later to stop the service from receiving events. The service makes sure you don't accidentally subscribe multiple times. It also uses a logger to provide helpful debug information.

## Class RiskMarkdownService

This service helps you create and store detailed reports about rejected trades due to risk management rules. It listens for "risk rejection" events happening in your trading system and keeps track of them for each symbol and trading strategy.

The service automatically generates markdown tables summarizing these rejections, complete with statistics like the total number of rejections and breakdowns by symbol and strategy. These reports are saved as files on your computer, organized by symbol and strategy name.

You can subscribe to receive these rejection events and unsubscribe when you no longer need them. The service provides functions to retrieve accumulated data, generate reports, save those reports to disk, and even clear out the stored data when it's no longer needed. It uses a memoized storage system, ensuring that each unique combination of symbol, strategy, exchange, frame, and backtest has its own isolated data storage.

## Class RiskGlobalService

RiskGlobalService acts as the central hub for managing risk within the trading framework. It handles validations and limit checks related to trading signals, working closely with other services like RiskConnectionService.

It's designed to prevent redundant validations by remembering previous checks. 

This service provides key functions like `checkSignal` to see if a trade is allowed based on defined risk limits.  A special version, `checkSignalAndReserve`, provides an extra layer of safety by atomically validating and reserving resources, preventing conflicts when multiple trading attempts happen at the same time.

When a trade is approved, `addSignal` registers it with the risk system. Conversely, `removeSignal` records when a trade closes. Finally, `clear` allows you to wipe out all stored risk data or selectively clear data for specific risk instances.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within the trading framework. It intelligently routes requests to the correct risk management implementation, ensuring that risk limits are applied appropriately for each strategy and exchange. 

It keeps a record of commonly used risk management instances to speed things up, and this record is organized by risk name, exchange, and frame. 

The core functions allow you to check if a trading signal is permissible based on pre-defined risk rules, reserve resources for a signal and register or remove signals from the system's tracking. You can also clear the cached risk management instances when needed. Essentially, it streamlines the entire risk management process, making it efficient and reliable.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage how trading data and events are saved for analysis. It acts as a flexible layer, allowing you to easily swap out different storage methods without changing your core code. 

It automatically creates and keeps track of storage instances for different types of reports (like backtest results, live trading data, etc.), making sure you don't accidentally create multiple copies of the same data.

By default, it saves data in JSONL format, but you can customize this using the `useReportAdapter` method to use your preferred storage solution.  

The adapter also provides handy options like a dummy adapter to temporarily disable logging or a quick way to revert to the default JSONL storage. You can clear the internal cache if the base directory changes during a process, ensuring fresh storage instances are used.

## Class ReportUtils

ReportUtils helps you control which parts of your trading framework generate detailed logs. Think of it as a way to turn on and off reporting for specific activities like backtesting, live trading, or analyzing performance.

It's designed to be extended by other classes, usually ReportAdapter, to add even more customized reporting features.

The `enable` function lets you pick and choose which services you want to monitor and log in JSONL format. You'll get a function back – make sure to call it later to stop the logging and avoid memory issues.

The `disable` function is straightforward; it stops logging for the services you specify. Unlike `enable`, it doesn’t give you a function to unsubscribe; the services are stopped immediately.

## Class ReportBase

The `ReportBase` class is designed to help you easily log and analyze data generated during backtesting. It's like a dedicated reporter that writes events to a file in a structured JSONL format.

Think of it as a system for capturing snapshots of what's happening during your simulations.

It organizes data by report type and automatically creates the necessary directories.  The class includes features to prevent data loss, with write timeouts and automatic error handling.  You can efficiently search through these log files later based on criteria like the trading symbol, strategy, or exchange used.

The class ensures that the writing process is reliable, even if things get busy.  The `waitForInit` method sets everything up initially, but you only need to call it once, and the `write` method is how you add new data to the log file.

## Class ReportAdapter

The ReportAdapter helps manage how your trading data and reports are stored, offering flexibility and efficiency. Think of it as a customizable system for saving your analytics.

You can easily swap out the way reports are stored by providing a different constructor for the storage adapter.

The system automatically remembers which storage method you're using for each type of report, ensuring consistency.

If your working directory changes, you'll need to clear the adapter's cache to ensure new storage instances are created correctly.

For testing or when you don't need to actually save data, you can switch to a dummy adapter that simply ignores all writes. 

Want to go back to the standard JSONL format? The `useJsonl` method allows you to revert to the default reporting method.

## Class ReflectUtils

This class, `ReflectUtils`, is your go-to for getting real-time insights into your trading positions – think P&L, peak profit, and drawdown metrics. It streamlines how you access these details from your strategies, handling validation and logging for you.  It’s designed to work equally well whether you’re running live trades or backtesting.

You can use it to retrieve various position statistics:

*   **Profit & Loss (P&L):** Get unrealized P&L as a percentage or in dollar terms.
*   **Peak Performance:**  Find out the highest profit price reached, along with the time and P&L associated with that peak.
*   **Drawdown Analysis:** Track how far your position has fallen from its peak, including the price, timestamp, and associated P&L at the point of maximum drawdown.
*   **Time-Based Metrics:** See how long a position has been active, the wait time for a scheduled signal, and the time elapsed since key events.

Essentially, `ReflectUtils` simplifies monitoring your position’s health and performance, providing valuable data for analysis and optimization. Since it's a singleton instance, you access it conveniently from anywhere in your code. The `backtest` parameter lets you tailor the calculations for backtesting scenarios.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, offering flexibility in how those signals are stored. It’s designed to be adaptable, letting you choose between persistent storage on disk or a faster, in-memory solution.

It provides simple ways to switch between these storage methods, defaulting to persistent storage for reliability.

You can easily swap out the storage mechanism by specifying a different adapter, and the system remembers the last used adapter for efficiency.

The adapter also offers methods to retrieve the latest signal, calculate how long ago it was created, and respond to active ping events, all while delegating these tasks to the chosen storage backend. The `clear` method is important to call when your environment changes to ensure a fresh adapter is used.

## Class RecentBacktestAdapter

This component provides a flexible way to manage and access recent trading signals, allowing you to choose between storing them in memory or persisting them to disk. It acts as a bridge between your backtesting process and the actual storage of signal data.

You can easily switch between different storage methods using the `useMemory` and `usePersist` functions – the default is in-memory storage.  The `useRecentAdapter` function gives you even more control, allowing you to define your own custom storage implementation.

To ensure your data is up-to-date, especially when working with different strategy iterations or changing environments, use the `clear` function to force a refresh of the storage utilities.  The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods simply pass through requests to the active storage adapter, providing a unified interface.

## Class RecentAdapter

The RecentAdapter manages and stores recent trading signals, whether you’re running a backtest or a live trading system. It automatically updates signal storage by listening for incoming data, and provides a straightforward way to get the most recent signal for a specific trading setup.

To prevent issues, it only subscribes once and includes a way to safely shut down and unsubscribe when you're finished.

You can use `getLatestSignal` to fetch the most recent signal, which first checks backtest data and then live data, while avoiding look-ahead bias by only returning signals created before a specified time. `getMinutesSinceLatestSignalCreated` calculates how long ago the latest signal was created, also respecting the look-ahead cutoff and providing a reference point for the calculation.


## Class PriceMetaService

PriceMetaService helps you get the latest market price for a specific trading setup – think of it as knowing the current price for a particular symbol, strategy, exchange, and timeframe. It keeps track of these prices and updates them as new ticks come in.

It's designed to be used when you need a price outside of the normal trading tick process, like when triggering a command between trades.

The service stores these prices in a special cache for each unique combination, and if a price isn't immediately available, it waits briefly for it to arrive. 

If you’re executing something within the trading process itself, the service will use the live exchange price. Otherwise, it serves up the cached value. You can clear this cache entirely, or just for a specific setup, to make sure you’re working with fresh data, particularly useful when starting a new backtest or live trade. The service is automatically updated and managed, so you don't have to worry about constantly refreshing prices.

## Class PositionSizeUtils

This class offers tools to help you determine how much of an asset to trade, based on different strategies. 

It provides several pre-built methods for position sizing, each with its own formula. 

You can use these methods like `fixedPercentage`, `kellyCriterion`, and `atrBased` to calculate the appropriate size of your trades. 

Each sizing method has built-in checks to make sure the input data aligns with the method's requirements, which helps prevent errors. 

Essentially, it takes information about your account balance, trade entry price, and other factors specific to the chosen sizing strategy, and then figures out the right position size.

## Class Position

The `Position` framework helps you figure out where to place your take profit and stop loss orders when trading. It automatically adjusts the direction of these orders depending on whether you’re going long (buying) or short (selling).

It provides two main functions to simplify this:

*   **moonbag:** This calculates your take profit and stop loss levels based on a very simple, aggressive strategy – your take profit is set at a fixed percentage above (for long positions) or below (for short positions) the current price.

*   **bracket:** This function gives you more control, letting you specify both a percentage for your take profit *and* a percentage for your stop loss.

## Class PersistStrategyUtils

This utility class helps manage how your trading strategies store and retrieve information, particularly when dealing with deferred actions like order commitments or signal activations. It's designed to ensure that this data is safely persisted, even if things go wrong.

The class handles creating and managing separate storage instances for each strategy, taking into account the trading symbol, strategy name, and exchange. It uses a clever system to only create these storage instances when needed, and it remembers them for future use.

You can customize how these storage instances are created, choosing from different adapters like a file-based JSON solution or a dummy adapter for testing. 

If you need to refresh the storage, like when your working directory changes, a `clear` method can be used to wipe the memoization cache. The `useJson` and `useDummy` methods offer easy switches to standard or no-op persistence options.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file, ensuring that even if something goes wrong, your progress isn't lost. It's designed to work with a specific trading strategy, identified by its name and the exchange it’s operating on. The class manages the file writing process carefully to avoid data corruption, and it automatically handles the setup of the file storage.

You provide the symbol being traded, the strategy's name, and the exchange name when you create an instance of this class. 

It includes functions to:

*   Initialize the storage area.
*   Retrieve the saved strategy data from the file.
*   Save the current state of the strategy back to the file. If you want to clear the saved state, you can pass null. 

A key called `STORAGE_KEY` is always used to identify where the strategy data is stored within the file.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, especially for backtesting and live trading. It ensures that each signal is stored as a separate file, identified by its unique ID, and handles potential crashes safely.

It provides a convenient way to get storage instances, automatically creating one for each mode (like backtest or live), ensuring only one instance exists per mode. You can also customize how the storage works by providing your own storage class.

The class offers methods to read all saved signals and write new signals, making sure these operations happen reliably.  It also allows you to easily switch between different storage methods, like using a file-based storage, a default JSON storage, or even a dummy storage for testing. 

Remember to clear the cache when your working directory changes to ensure proper storage functionality.

## Class PersistStorageInstance

This class provides a way to store and retrieve data persistently, primarily for backtesting scenarios. It uses individual JSON files to represent each signal, making management and organization easier.

The system is designed to be robust, even in the event of crashes, thanks to atomic write operations.

It essentially allows you to save the state of your signals to disk and load them again later.

Here's a breakdown of the key features:

*   It initializes the storage mechanism.
*   It reads all saved signals by examining the available keys.
*   It saves signals by writing each one to its own file, identified by its unique ID.
*   A `backtest` flag dictates the context in which the storage is used.
*   The underlying storage itself is managed within a private property.


## Class PersistStateUtils

This class provides tools for safely saving and loading state data, particularly useful for keeping track of things like market signals and their associated information. It helps ensure your trading logic doesn't lose progress even if things go wrong.

The framework smartly manages storage locations, creating a unique place for each signal and bucket. You can easily switch between different storage methods, like using a simple dummy storage for testing or a real file-based storage for production.

The `waitForInit` method helps you set up the storage initially, while `readStateData` and `writeStateData` are the key functions for loading and saving data.  Think of it as a way to remember important details for each trading signal.

You have the flexibility to customize how this storage works, swapping in your own storage implementations. And for clean-up, functions like `clear` and `dispose` help release resources when they're no longer needed, especially as you move between different trading scenarios.

## Class PersistStateInstance

This class, PersistStateInstance, provides a way to save and load state data for your trading strategies, primarily using files. Think of it as a convenient wrapper for managing the persistence of your data. 

It uses a unique identifier (signalId) and a bucket name to organize the stored data, treating each signal as its own entity. 

The `waitForInit` method ensures the storage is ready before you attempt to read or write.  You can then use `readStateData` to retrieve previously saved data or `writeStateData` to update it. 

Finally, when you're done, `dispose` doesn't actually do anything itself – cleanup happens automatically through a separate utility function, ensuring memo caches are invalidated correctly.

## Class PersistSignalUtils

This class helps manage how signal data is saved and retrieved, particularly for trading strategies. It ensures that each strategy's signals are stored in a consistent and reliable way.

It keeps track of where and how signal data should be stored, creating a unique storage location for each combination of trading symbol, strategy, and exchange.

You can customize how this storage works by providing your own signal creation logic.

The class makes reading and writing signal data easy, and it handles the creation of the storage instance automatically the first time you need it.

If you need to change how data is stored, there are functions to switch between different storage methods, like using a file, a dummy (no-op) storage, or a custom adapter.

It also provides a way to completely clear the stored data, which is useful if your program’s working directory changes.

## Class PersistSignalInstance

This class helps you reliably store and retrieve signal data for your trading strategies. Think of it as a safe way to keep track of signals, even if your program crashes.

It’s designed to work with a specific trading symbol, strategy name, and exchange, making it easy to manage signals for different setups. 

The `waitForInit` method ensures the storage is ready before you start working with it. 

`readSignalData` lets you pull back the signal that was previously saved, and `writeSignalData` allows you to update or clear that signal. This class handles the file writing securely, minimizing the risk of lost data.

## Class PersistSessionUtils

This class helps manage how your trading session data is saved and loaded, ensuring it’s reliable even if things go wrong. It's like a helper for keeping track of your progress in a trade.

It intelligently caches these session data containers, making sure you don't recreate them unnecessarily. You can even customize how the data is stored, choosing between using files, a simple dummy option for testing, or your own custom storage method.

The class handles the details of reading and writing the session data, and makes sure those operations happen safely. There’s a way to clear the cache if your working directory changes, and another to manually remove specific session data when it's no longer needed. If you want to test without actually saving anything, a 'dummy' mode lets you bypass the storage entirely.

## Class PersistSessionInstance

This class helps save and load session data for your trading strategies, specifically designed for backtesting environments. Think of it as a way to remember where your strategy was when you shut it down, so it can pick up right where it left off.

It essentially manages a file on disk to store this information, keeping things organized by strategy name, exchange, frame (a specific time slice), and the trading symbol. The file name itself is constructed to be unique for each combination of these factors, preventing conflicts between different strategies or symbols.

The class handles writing data to the file safely and offers a way to retrieve previously saved session data. Importantly, it doesn't handle cleaning up old data itself – that’s the job of a separate utility function. 

The class tracks the name of the strategy and exchange used, along with the frame and symbol being traded, as well as whether it's a backtest or not. It uses these details to organize its storage and identify the specific data it's responsible for.

## Class PersistScheduleUtils

This utility class helps manage how scheduled signals are saved and retrieved, ensuring they're handled reliably even if things go wrong. It creates a dedicated storage system for each strategy, symbol, and exchange combination, preventing conflicts and making things organized. 

You can customize how these signals are stored by providing your own storage adapter, or you can choose to use the default file-based storage or even a dummy storage that doesn't actually save anything.

The class automatically handles reading and writing signals, and initializes the storage system the first time it's needed. If your strategy's working directory changes, you’ll need to clear the cache to make sure everything is up to date. The `clear` method does exactly that.

## Class PersistScheduleInstance

This class helps you save and load scheduled trading signals to a file, ensuring the information isn't lost. It's designed to work with a specific trading symbol, strategy name, and exchange. 

Think of it as a safe keeper for your schedule, automatically handling the details of writing data to a file and making sure it's done reliably, even if something unexpected happens. It uses the trading symbol to identify the specific schedule it's managing.

The class needs to be initialized with the symbol, strategy name, and exchange name it manages.

It includes methods to make sure the storage is ready, to read existing schedule data, and to save new or updated schedule information. If you want to clear a scheduled signal, you can simply pass `null` to the `writeScheduleData` method.

## Class PersistRiskUtils

This class helps manage how active trading positions are saved and loaded, particularly for risk management. It ensures that the storage used for this information is handled efficiently and reliably, especially when dealing with different risk profiles.

It intelligently caches storage instances to avoid repeatedly creating them, and it allows you to customize how this storage works using different adapters. 

The class provides functions to read and write position data, making sure that the information is consistent. The system is designed to be robust, minimizing the risk of data loss even if there are unexpected interruptions. 

You can easily swap out the storage mechanism, like switching to a file-based system or using a dummy version for testing. To refresh the storage cache, you can simply call a clear function.

## Class PersistRiskInstance

This class, `PersistRiskInstance`, helps you save and load position data safely. It's designed to work as a reliable way to keep track of your trading positions across different sessions.

Think of it as a safe deposit box for your position information. It uses a standard name ("positions") for organization and uses special techniques to prevent data loss even if something unexpected happens during the saving process.

Here's what you can do with it:

*   **Initialization:** You can kickstart the storage process with `waitForInit`.
*   **Reading Data:**  `readPositionData` lets you retrieve all of your position data, specifying a timestamp for when the data applies.
*   **Saving Data:**  `writePositionData` is used to store changes to your positions. It automatically handles saving the data in a crash-safe manner.

The class essentially takes care of the behind-the-scenes details of storing your position data, allowing you to focus on building your trading strategies.

## Class PersistRecentUtils

This class provides a way to reliably store and retrieve the most recent trading signals. It’s designed to handle situations where the program might crash or restart, ensuring that the most up-to-date signal is always available. 

It uses a clever system of caching, so it only creates a storage instance once for each unique combination of symbol, strategy name, exchange, and timeframe.

You can customize how these signals are stored by providing your own storage adapter, or easily switch back to a standard file-based option or even a "dummy" option that simply ignores all data. 

The class handles the underlying complexities of reading and writing data, offering a simple interface for retrieving the latest signal. It’s important to clear the cache when the working directory changes to maintain data integrity across different strategy runs.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent data for a specific trading strategy. It's designed to work with files, ensuring your data is safely stored.

Think of it as a way to remember the last signal your strategy generated. 

It organizes data based on the trading symbol, strategy name, exchange, and frame name – essentially creating a unique identifier for each situation. It also distinguishes between backtesting and live trading environments.

Here's a breakdown of what it does:

*   **Initialization:** It has a way to make sure the storage is ready before you start saving anything.
*   **Reading:** It can retrieve the most recently saved signal data using the unique identifier.
*   **Writing:** It allows you to store new signal data, ensuring that the saved information is the most up-to-date.

The class uses the trading symbol as a key to locate the data within the storage, and it manages the storage behind the scenes. This helps to keep things organized and efficient.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and save your trading progress, specifically the partial profits and losses, for each trade. It ensures that these values are saved reliably, even if something unexpected happens during trading.

Think of it as a way to remember where you were in a trade – even if the system restarts.

It intelligently creates and manages storage for these partial values, making sure each trade (identified by symbol, strategy, and exchange) has its own dedicated space.  You can also customize how this storage works, plugging in your own methods for saving and retrieving the data.

The system remembers the state of partial data for each signal and only loads it when needed, and it's designed to work safely even if there are interruptions.

You can easily switch between different storage methods, like using a file-based system or a dummy system for testing.  Remember to clear the cache when your working directory changes to ensure proper data handling.

## Class PersistPartialInstance

This class helps you save and retrieve pieces of information related to your trading strategies, like progress or intermediate results. It's designed to be reliable, even if your program crashes unexpectedly.

The `PersistPartialInstance` class works with files to store this data, ensuring that your data is written safely. It organizes data by associating it with a unique identifier (signalId) and keeps everything specific to your strategy and exchange.

Here’s a breakdown of what you can do with it:

*   **Initialization:** You start it up using a symbol, strategy name, and exchange name to define its context.
*   **Reading Data:**  You can retrieve partial data for a specific signal, effectively loading a snapshot of the trading process.
*   **Writing Data:**  You can save partial data, which is helpful for tracking progress or preserving intermediate calculations.
*   **Atomic Operations:** It uses safe writing techniques so that your data isn’t corrupted if something goes wrong.
*   **Internal Storage:** It manages an internal storage area tied to your strategy's context.

## Class PersistNotificationUtils

This class provides helpful tools for managing how notification data is saved and loaded, particularly for backtesting and live trading environments. It handles the behind-the-scenes details of storing notifications securely and reliably.

You don't need to worry about creating storage instances yourself; it does that for you, remembering what it's already created.

It allows you to customize how notifications are persisted, using different ways to store them like files or even a dummy implementation for testing purposes. This gives you flexibility in how you manage your data.

The notifications themselves are stored individually, each identified by its unique ID, which helps keep things organized. The system is designed to be resilient and won't lose data even if there are unexpected crashes.

If you're using `NotificationPersistLiveUtils` or `NotificationPersistBacktestUtils`, this class is working behind the scenes to handle the persistence of your notifications. You can also refresh the storage with `clear()` if the base directory changes.

## Class PersistNotificationInstance

This class provides a way to store and retrieve notification data persistently, using files on your system. Think of it as a secure way to keep track of important events even if your application restarts.

It’s designed to be reliable, using techniques to ensure data isn't lost even if something unexpected happens. Each notification is saved as its own JSON file, making it easy to manage individual entries.

You can control whether this persistent storage is used in a simulated testing environment or in a real application. 

The `waitForInit` method ensures the storage is ready before you try to read or write anything. `readNotificationData` retrieves all stored notifications, while `writeNotificationData` saves a set of notifications, each identified by its unique ID.

## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how your trading strategy's memory data is saved and loaded, ensuring it survives crashes and restarts. It intelligently caches storage instances to avoid unnecessary work.

You can customize how the memory is persisted by providing your own "memory instance" constructors, allowing for different storage methods like using files or a dummy (no-op) implementation for testing.

The class provides functions for reading, writing, and deleting memory entries, along with a way to check if a particular entry exists.  You'll find methods for initializing memory storage and cleaning up storage when signals are removed. 

To rebuild indexes or perform other maintenance tasks, you can iterate through existing memory entries. Importantly, you can clear the entire cache of storage instances, which is useful when your working directory changes.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve data related to signals, using files for storage. It acts as a bridge between your application and the underlying file system, making sure data is written safely.

It allows you to read, write, and delete (soft delete, meaning the data isn't actually erased) memory entries identified by a unique ID. You can easily check if a particular memory entry exists.

The `listMemoryData` method provides a way to retrieve all the active (non-deleted) memory entries within a specific bucket.

Importantly, this implementation doesn't handle cleanup of caches itself; it relies on a separate utility function for that.  Initialization of the underlying storage is managed by `waitForInit`.

## Class PersistMeasureUtils

This utility class helps manage cached data retrieved from external APIs, ensuring that the data is reliably stored and retrieved. It acts like a central hub for handling these caches, keeping things organized and efficient.

The system intelligently creates and manages specific cache containers based on a combination of timestamp and symbol, using a customizable approach to building these containers. You can even swap in different ways to handle the data persistence, such as using files or a dummy implementation for testing.

It simplifies retrieving and saving data, and if a particular container hasn't been accessed before, it will be created automatically. The process is designed to be safe even if the system unexpectedly crashes.

The `usePersistMeasureAdapter` function lets you plug in your own data storage mechanism, while `useJson` and `useDummy` provide pre-built options for file storage and testing, respectively. You can clear the internal cache using `clear` to ensure fresh data when needed, particularly when the working directory changes during repeated strategy runs. Finally, `listMeasureData` offers a way to see all of the stored data within a specific container.

## Class PersistMeasureInstance

This component provides a way to store and retrieve measure data persistently, typically using files. It's designed to handle saving and loading data reliably, even if things go wrong during the process.

The data is organized into buckets, which are essentially named folders where your measurements are stored.

To read a specific measurement, you’ll use a key—think of it like a unique identifier for that piece of data.  If a measurement doesn't exist or has been marked for removal, it won't be returned.

Writing new measurements is also straightforward.  To remove a measurement, it's not actually deleted from storage; instead, a flag is set to indicate it's been soft-deleted.

When you need to see a list of all existing measurements, a special function gives you a list of their keys, excluding any that have been soft-deleted.

The component ensures the underlying storage is ready before you start interacting with it, and provides a way to refresh that initial setup if needed.


## Class PersistLogUtils

This class helps manage how log data is saved and retrieved, providing a central point for persistence. It keeps a single, ready-to-use log instance available, creating it only when needed. You can even swap out the way logs are stored – using a custom adapter, the default file-based method, or even a dummy version that does nothing.

It automatically handles reading and writing all log entries, ensuring that entries are saved individually and duplicates aren't created.  The system also manages the log state to be reliable even if crashes occur.

You can replace the default logging implementation using `usePersistLogAdapter`, clear the current log instance with `clear`, or switch back to the default file-based storage with `useJson`.  `useDummy` allows you to effectively disable logging for testing or specific situations.

## Class PersistLogInstance

This class provides a way to store trading logs to files, ensuring your historical data is preserved. It essentially creates individual JSON files for each log entry, making them easy to manage. 

Importantly, it's designed to be append-only – once a log entry is written, it can't be changed, guaranteeing data integrity.  The system handles potential crashes during the writing process to prevent data loss.

The `waitForInit` method prepares the storage space for the log data. `readLogData` retrieves all the logged information by examining the file keys. Finally, `writeLogData` adds new log entries to the storage, skipping any entries that already exist to avoid accidentally overwriting older logs.


## Class PersistIntervalUtils

This framework component handles remembering which time intervals have already been processed. It's designed to prevent duplicate actions within your trading strategies.

Think of it as a record-keeping system that stores markers in a directory called `./dump/data/interval/`.  Each marker indicates whether a specific time interval has already been handled. If a marker exists, it means the interval has been processed; if it’s missing, it means it hasn't.

You can customize how this record-keeping happens by providing your own storage mechanism.  The framework offers options for using a standard file-based system, a JSON-based approach, or even a "dummy" mode where nothing is actually saved to disk.

There are functions for reading, writing, and deleting these interval markers, as well as methods to clear the storage and configure the adapter used for persistence.  This helps manage the state of processed intervals and is crucial for reliable backtesting and live trading.


## Class PersistIntervalInstance

This component handles storing and retrieving data related to specific time intervals, like those used for backtesting trading strategies. Think of it as a way to save information about what happened at each point in time.

It uses files to store this data, organizing it into buckets. It ensures that changes to the data are written reliably.

When a piece of data is no longer needed, it's not permanently deleted; instead, it's marked as 'removed'. This allows you to easily rebuild or re-evaluate your data later.

You can fetch a specific data point by its key, write new data points, or list all the active (non-removed) data points in a bucket. It also takes care of initializing the underlying storage so everything is ready to go.


## Class PersistCandleUtils

This class helps manage how your historical candle data (like open, high, low, and close prices) is stored and retrieved. It's designed to keep things organized and efficient, particularly when dealing with large amounts of data.

Each candle is saved as a separate file, making it easy to pinpoint and update individual data points. The system checks if the cached data is still valid before using it, and it automatically updates the cache when needed.

You can customize how the data is stored by providing your own “candle instance creator.”  This lets you use different storage methods, like files, or even a dummy instance for testing.

The `clear` method is helpful if your working directory changes, ensuring the cache is refreshed.  You can quickly revert to the standard file-based storage using `useJson`, or use the dummy storage (`useDummy`) to simulate data behavior without actually writing anything.


## Class PersistCandleInstance

This component handles saving and retrieving candle data to a file-based storage. Think of it as a way to persist your historical trading data. 

Each candle is stored as a separate JSON file, making it easy to locate by its timestamp. If a candle is missing when you try to read it, it indicates a cache miss and a need to fetch the data again.

To ensure data integrity, writing to the cache skips any candles that aren't fully complete (those with a future closing time) and prevents overwriting existing data. Any corrupted or invalid candle data found in the cache will trigger a warning, and it will be treated as a cache miss, prompting a fresh retrieval.

The storage is organized by symbol, interval, and the name of the exchange, providing a clear scope for the saved data. The `waitForInit` method ensures the underlying storage is ready before any data operations occur.  You can use `readCandlesData` to retrieve a batch of candles within a specific time window, and `writeCandlesData` to add new, complete candles to the cache.

## Class PersistBreakevenUtils

This class helps manage and save the breakeven information for your trading strategies. It's designed to store this data persistently, meaning it's saved to disk so you don't lose it between runs. 

It creates a unique storage space for each symbol (like BTCUSDT) and strategy you're using, keeping the data organized within files. 

Importantly, it only loads the necessary data when you actually need it, and it uses a clever system to ensure you’re always working with the correct storage instance for your particular combination of symbol, strategy, and exchange.

You can customize how the data is stored, for example, by using a simple file-based system or even a "dummy" system that doesn't actually save anything. If you need to change how data is persisted, there's a way to plug in your own storage adapter. Finally, the class offers a way to clear the stored data if you’re starting fresh or moving your project to a new location.

## Class PersistBreakevenInstance

This class helps you save and retrieve breakeven data persistently, essentially acting as a reliable record-keeper for your trading strategies. 

It's designed to be durable, ensuring your data isn't lost even if something unexpected happens. Think of it as a safe place to store information about when a trade became profitable.

It uses a file on your system to store this data, and each piece of information is linked to a specific trading signal using a unique identifier.

The constructor sets up the basics – which symbol, strategy, and exchange the data relates to. 

You can use `readBreakevenData` to load previously saved data, and `writeBreakevenData` to save new information. `waitForInit` ensures the storage is ready before you try to read or write anything.


## Class PersistBase

PersistBase provides a foundation for storing and managing data files, ensuring data integrity through atomic write operations. It's designed to keep your data files safe and consistent, even if interruptions occur during writing. 

The framework automatically checks and cleans up any corrupted data files it finds. It also allows you to easily loop through all the IDs of stored entities.

You can think of it as a starting point for creating systems that need to persistently store data on disk, and it simplifies common tasks like checking if data exists and writing data safely. 

The constructor sets up where the data files are stored, and it includes built-in checks and recovery mechanisms to prevent data loss or corruption. Methods like `readValue`, `hasValue`, and `writeValue` provide straightforward ways to interact with the stored data. `keys` gives you a way to iterate through all the available data IDs.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It acts like a detective, listening for timing signals during the strategy execution and carefully recording them. 

These timing records are then saved to a database, allowing you to later analyze where your strategy might be slow or inefficient.

To start tracking, you need to subscribe to the performance events. This is done once, and it provides a way to stop listening later on.

If you've already subscribed, you can use the unsubscribe function to gracefully end the performance data collection. It's like telling the detective to stop watching.

## Class PerformanceMarkdownService

The PerformanceMarkdownService is designed to help you understand how your trading strategies are performing. It keeps track of various performance metrics, breaking them down by strategy and other factors like the trading symbol and timeframe.

It listens for performance events and calculates things like average performance, minimums, maximums, and percentiles. 

You can request these statistics to see how a specific strategy has been doing. It can also automatically create detailed reports in markdown format, highlighting potential bottlenecks in your strategy’s performance. These reports are saved to your logs directory.

You have the ability to clear out the stored performance data when it’s no longer needed. The service uses a memoized storage system, meaning each unique combination of trading symbol, strategy name, exchange, timeframe, and backtest setting gets its own, separate storage space.


## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It offers tools to gather and analyze performance data, identify bottlenecks, and generate clear reports.

You can use `getData` to retrieve a comprehensive breakdown of performance metrics for a specific trading strategy and symbol, showing things like average durations, volatility, and outlier percentiles. 

The `getReport` method creates a markdown document that visualizes this data, including charts illustrating time distribution across different operations and a detailed table of statistics.

Finally, `dump` allows you to save these performance reports directly to your hard drive, with options to customize the file name and location. This makes it easy to track performance over time and share results.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data. It's designed to work with data collected by the PartialMarkdownService, allowing you to understand performance metrics for specific trading strategies.

You can use it to grab key statistics like total profit/loss event counts. It also allows you to generate detailed markdown reports showing individual profit and loss events, including the action taken, symbol traded, strategy used, signal ID, position size, level, price at the time, and the timestamp.

Finally, you can easily save those reports to files, creating automatically named markdown files for each symbol and strategy combination. These files contain the full event details and summary statistics, providing a clear picture of your trading performance.

## Class PartialReportService

The `PartialReportService` helps you keep track of when your trading strategies make small profits or losses along the way. It focuses on logging those "partial exits" – when a position isn't fully closed but still generates a profit or loss.

This service listens for signals indicating partial profit or loss events. It then records these events, including the price and level at which they occurred, allowing you to analyze how your strategy performs in smaller increments.

To start tracking these partial exits, you need to subscribe to the service. This subscription is designed to prevent accidental double-subscription. When you're done tracking, you can unsubscribe to stop receiving those signals. 

The service also uses a logger to provide helpful debugging information. It stores the recorded data for later analysis and persistence.

## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and document your trading performance, specifically focusing on profit and loss events. It listens for these events – both profits and losses – and neatly organizes them by symbol and strategy. 

Think of it as a reporting engine that gathers details about each profit and loss event and presents them in a well-formatted markdown table. 

You can easily retrieve overall statistics like total profit/loss events and generate comprehensive reports. These reports are then saved as markdown files, making it simple to review and analyze your trading history.

The service offers functions to clear old data, dump reports to disk, and retrieve summarized information. It ensures that each trading strategy and symbol combination has its own, independent data storage. You subscribe to receive the profit/loss events and can unsubscribe when you no longer need them.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It's designed to simplify how strategies interact with the underlying connection layer, promoting cleaner code and easier debugging.

Think of it as a middleman: strategies don't directly talk to the connection layer; instead, they go through this service. It keeps a record of all partial operations by logging them, making it easier to monitor what's happening.

The service relies on several other services (like validation and schema services) to ensure everything is configured correctly and to confirm the existence of strategies, risks, exchanges, frames, and actions.

Key functions include recording profits, losses, and clearing partial states, all while ensuring proper validation and providing a central logging point. These actions are handled by forwarding them to the `PartialConnectionService`.

## Class PartialConnectionService

This service manages the tracking of partial profits and losses for trading signals. It acts like a central hub, creating and maintaining individual records for each signal, ensuring each signal only has one record.

It intelligently reuses these records, caching them for efficiency, but cleans them up when signals are no longer active. This service is integrated with other parts of the system to handle events related to profit, loss, and signal closures.

You can think of it as a factory that creates and manages these individual tracking records (ClientPartial instances), providing the necessary tools for logging and event handling along the way. It ensures that the information about each signal's performance is tracked correctly and efficiently. When a signal is finished, it cleans up the associated data, preventing unnecessary clutter.

## Class OrderTransientError

This class, `OrderTransientError`, isn't about special handling – it's more of a clear signal for your code. It indicates a temporary, retryable issue when placing or managing orders, like a network hiccup or exchange overload. Think of it as saying, "This isn't a permanent problem, try again later."

It's part of a trio of error types, alongside `OrderRejectedError` (a business rejection) and `OrderDeletedError` (order not found), which help clarify different scenarios.

When an error is flagged as transient, the system behaves differently depending on whether it's related to opening or closing an order, or performing a check:

*   **Opening an order:** The system retries immediately with the exact same signal, attempting up to a certain number of times. You *must* check for existing orders with the same identifier before retrying. If retries fail, it's a serious issue, signaling a potential problem with the connection.
*   **Closing an order:** Similar to opening, the system retries closing the position, continuing until successful or exhaustion. If closing fails repeatedly, it can lead to a forced state reconciliation.
*   **Checks:** The system tolerates occasional failures and keeps monitoring. Repeated failures, however, lead to a terminal error.

Importantly, repeated transient errors are considered fatal – a critical sign something's wrong with the connection. The counters for open and close retries persist even across crashes, so you need to reconcile the order's state before retrying. The `isOrderTransientError` and `fromError` methods provide a way to consistently identify transient errors, even if the error object comes from a different part of your application.

## Class OrderRejectedError

OrderRejectedError signifies a definitive and unrecoverable rejection of an order by the exchange – it’s a permanent "no" and retrying won't work. This error is thrown within specific order handling components: broker adapters, action schema callbacks, or listenSync listeners.

When this error happens, it immediately halts order processing. For new orders, the attempt is dropped completely, preventing any retries and clearing any existing retry attempts. For closing orders, the engine will force-close the position, bypassing normal retry mechanisms. While an error notification is logged, the system continues running – it’s an expected, though undesirable, outcome.

It's crucial to only use this error for genuine business rejections from the exchange, like disallowance of a symbol, delisting, or account restrictions. Don't use it for temporary issues like network timeouts or rate limits – those should be handled with standard error handling or OrderTransientError.

This error is context-specific; throwing it in the wrong place will degrade it to a transient error. The framework identifies the error by a unique symbol brand, ensuring it's recognized even across different code modules. This error is primarily relevant in live environments; it’s mostly a non-factor during backtesting. The error message itself is informational and doesn’t affect routing; the brand is what matters.

You can create a new `OrderRejectedError` using its constructor, which accepts an optional message. There are utility methods, `isOrderRejectedError` and `fromError`, to reliably identify and create instances of this error type, even when dealing with duplicated code modules.

## Class OrderDeletedError

This error signals that the exchange has definitively confirmed an order is no longer present, meaning it's been canceled or liquidated – essentially, it’s gone. You’ll only use this when dealing with order checks – specifically when the broker adapter is actively verifying order status or when using older action schema callbacks. 

It’s crucial to use this *only* when the exchange explicitly says the order is missing; don’t use it for temporary issues like network problems or filled orders. A filled order isn't deleted; it was successfully executed, and an error should not be thrown. Throwing this in the wrong place, like during order opening or closing processes, will prevent proper error handling.

This error bypasses standard retry mechanisms and results in immediate actions – positions will close, and schedules will be canceled. Importantly, it's treated as a business fact about a single order, not a general system failure, so it won't trigger a fatal exit.

To correctly identify this error, always use the static `isOrderDeletedError` method instead of `instanceof` to account for how modules are bundled. This ensures that the error is properly recognized even if your code is split across different modules. It’s also worth noting that checks don’t occur during backtesting, as there's no live exchange to query.

## Class NotificationLiveAdapter

The `NotificationLiveAdapter` helps you send notifications about your trading strategy's progress, like signals, profits, losses, or errors. Think of it as a central hub for all your notification needs, allowing you to easily switch between different notification methods without changing your core strategy code.

It's designed to be flexible, letting you plug in various ways to send those notifications—whether it's to a simple in-memory store, a persistent storage like a file, or even a dummy adapter that does nothing at all for testing purposes. You can choose your preferred notification method using convenience functions like `useMemory`, `usePersist`, and `useDummy`.

The adapter uses a system where it "proxies" calls to the underlying notification adapter, meaning it essentially passes the notification details to the selected method.  It also has a `getInstance` property that makes sure the notification tools are only built when needed and cached, which helps optimize performance.

If your strategy’s working directory changes, use `clear` to force it to rebuild these cached tools. This is useful in iterative processes.

Several methods exist to handle different events, such as signal processing (`handleSignal`, `handleSignalNotify`), profit and loss tracking (`handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`), and error handling (`handleError`, `handleCriticalError`, `handleValidationError`). You can also retrieve all notifications with `getData` or clear them completely with `dispose`.


## Class NotificationHelperService

This service helps manage and send notifications related to signals, particularly during backtesting. It’s an internal component, so you typically won't directly use it, but it’s important for how the system operates behind the scenes.

The service performs validation checks on strategy, exchange, frame, risk and action schemas. These validations are done only once per unique combination of strategy, exchange, and frame names, making the process efficient.

The `commitSignalNotify` function is the main way this service is used. It gathers information, validates everything, and then sends out a notification with details about the signal. This notification is then handled by other parts of the system to be displayed and recorded.

## Class NotificationBacktestAdapter

This component acts as a central hub for sending notifications during backtesting, offering flexibility in how and where those notifications are stored. It uses a pattern where you can easily swap out different "notification adapters" to control whether notifications are stored in memory, persisted to disk, or simply ignored (using a dummy adapter). The default behavior saves notifications in memory, but switching to a persistent adapter allows you to review events after a backtest run.

You can easily switch notification methods using `useMemory`, `useDummy`, and `usePersist`. The `handleSignal`, `handlePartialProfit`, and other "handle" methods forward notification events to the currently active adapter. You can also replace the entire notification adapter using `useNotificationAdapter`. A key method, `clear`, is crucial when your working directory changes between backtest runs; it ensures a fresh instance of the notification system is created. Retrieving stored notifications is done via `getData`, and `dispose` allows you to clear them when finished.

## Class NotificationAdapter

The NotificationAdapter is the central hub for managing and accessing notifications, whether you’re running a backtest or a live trading session. It automatically keeps track of notifications, making sure you don't miss important events.

You can easily subscribe to receive notifications by enabling the adapter, and it’s designed to avoid duplicate subscriptions. It keeps backtest and live notifications separate but provides a single place to view them. 

To stop notifications, you can simply disable the adapter, and it’s completely safe to disable it multiple times. You can retrieve all stored notifications for either the backtest or live environment and also clear all notifications when you're finished.

## Class MemoryLiveAdapter

The MemoryLiveAdapter provides a flexible way to manage trading memory, allowing you to choose different storage options. It acts as a central point for interacting with memory, using an adapter pattern to easily swap out the underlying storage mechanism.

By default, it uses file-based storage, meaning your data persists even if the application restarts. You can also switch to an in-memory option for faster performance or a dummy adapter for testing purposes.

The adapter offers convenient functions for writing, searching, listing, removing, and reading memory entries. Importantly, it memoizes (caches) these instances to improve performance, but provides a `disposeSignal` function to clear them when a signal is canceled, ensuring data consistency.

For advanced users, it also allows you to implement and use your own custom memory adapter. Don’t forget to clear the cache if your working directory changes during a strategy’s run.

## Class MemoryBacktestAdapter

This component offers a flexible way to manage memory storage for backtesting, allowing you to easily swap out different storage methods. By default, it uses an in-memory system with BM25 scoring for searching, providing a quick and easy setup. 

You also have the option to persist data to files or use a dummy adapter that ignores any writes, offering choices for different testing needs.

The `disposeSignal` function is important for cleaning up old data when signals are closed.  You can interact with the memory through methods for writing, searching, listing, removing, and reading data. 

Switching between different storage methods is straightforward using functions like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter`, enabling you to tailor the adapter to your specific backtest requirements. Finally, the `clear` function helps ensure fresh instances are created when the working directory changes.

## Class MemoryAdapter

The MemoryAdapter acts as the central hub for managing memory storage within the backtest and live environments. It intelligently handles the storage and retrieval of data, ensuring that the correct memory system—either the backtest or live version—is used based on the provided information.

It's designed to be robust and efficient, automatically cleaning up old data when signals are closed or cancelled to prevent issues caused by outdated information. The `enable` property allows you to activate this memory storage functionality, while `disable` lets you turn it off, and it’s perfectly safe to call `disable` multiple times.

You can use the `writeMemory` function to store data, `searchMemory` to find specific information using a full-text search, `listMemory` to view all entries, `removeMemory` to delete items, and `readMemory` to retrieve a single piece of data. All of these functions route the requests to the appropriate memory system based on whether you're working within a backtest or live setting.

## Class MaxDrawdownUtils

This class is designed to help you understand and analyze the maximum drawdown experienced during your trading tests. Think of it as a tool for generating reports and statistics about how much your strategy lost from its peak value.

It works by gathering information from events that track maximum drawdown, and it offers several methods to access that data.

You can use `getData` to get a statistical summary of the max drawdown for a specific trading setup (like a particular symbol, strategy, exchange, and timeframe).

`getReport` allows you to create a detailed markdown report outlining all the max drawdown events for a given symbol and strategy combination.

Finally, `dump` takes all that information and saves the markdown report directly to a file, so you can easily share or archive the results.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is responsible for tracking and recording maximum drawdown events. It monitors a specific data stream (maxDrawdownSubject) and whenever a new drawdown is detected, it saves a detailed record.

This record includes important information like the timestamp, symbol, strategy name, exchange, frame, backtest details, signal ID, position size, current price, and order parameters (open, take profit, stop loss). The information comes directly from the signal data itself.

To start collecting this drawdown data, you need to subscribe to the service. This process only happens once – if you try to subscribe again, it won't re-subscribe and will return the original unsubscribe function. 

When you're finished collecting drawdown data, you can unsubscribe, which stops the process and prevents further records from being saved. If you didn't subscribe in the first place, unsubscribing won't do anything.

## Class MaxDrawdownMarkdownService

This service helps create and store reports about maximum drawdown, a key risk metric in trading. It listens for drawdown events related to specific trading setups (symbol, strategy, exchange, timeframe) and gathers data.

You can subscribe to receive these drawdown events or unsubscribe to stop the process and clear stored data.  The service provides methods to retrieve the accumulated data, generate a formatted markdown report, or write that report directly to a file. 

It's designed to avoid multiple subscriptions to ensure data integrity.

Finally, there's a clear function that allows you to remove the stored drawdown data.  You can clear data for a specific trading setup or clear everything at once.

## Class MarkdownWriterAdapter

This component helps you manage where your backtest results and other markdown reports are saved, offering flexibility in how they're stored. You can easily switch between different storage methods, like saving each report as a separate file, appending them all to a single file, or even disabling markdown output entirely.

It remembers the storage settings so you don't have to repeatedly configure them, and it’s designed to ensure that you only have one instance of each storage type running at a time.

You can change the default way markdown is stored, or switch to a different storage method like JSONL or a dummy adapter that does nothing. The `clear` function is useful to reset storage when your working directory changes. Essentially, it provides a streamlined way to control how your markdown output is handled.


## Class MarkdownUtils

MarkdownUtils helps you control the generation of markdown reports for various aspects of your trading framework, such as backtests, live trading, and performance analysis.

You can selectively turn on markdown reporting for specific areas, and it will start collecting data and creating files when needed. Remember to unsubscribe from these services when you're done to avoid memory issues.

Conversely, you can disable report generation for certain areas without affecting others. 

If you just want to reset the data being collected for reports without stopping the reporting itself, you can clear the accumulated data for those areas.

## Class MarkdownFolderBase

This adapter lets you generate each report as a distinct markdown file, making it easy to browse and understand your backtesting results. It organizes reports into directories based on the provided path and file name options. 

You don't need to worry about managing streams; it directly writes the markdown content to the file system. 

The `waitForInit` method is a placeholder, as it doesn’t require any specific initialization steps because of its direct writing approach.

The `dump` method handles the actual writing of the markdown content, creating directories as needed and using the provided options to determine the filename and location of the report. Essentially, it takes the markdown string and creates a readable file in your desired directory structure.

## Class MarkdownFileBase

This framework component handles writing markdown reports to files in a specific JSONL format. It's designed for centralized logging and allows you to easily process your reports with standard JSONL tools. 

The system creates a dedicated file for each type of markdown report, and each line in the file contains the report content along with helpful metadata like the symbol, strategy, exchange, frame, and signal ID. This makes it simple to filter and analyze your reports later.

The adapter uses a write-once, append-only approach to the files and includes features to prevent data loss, like timeouts and handling full write buffers. You can think of it as a way to organize and store your markdown reports in a consistent, machine-readable format. 

The `waitForInit` method sets up the initial file and stream, and you use `dump` to add new reports, providing the markdown content and any relevant metadata.

## Class MarkdownAdapter

The MarkdownAdapter provides a flexible way to manage how your markdown files are stored. It allows you to easily switch between different storage methods, like saving each markdown file as a separate `.md` file or appending them to a single `.jsonl` file. This adapter remembers which storage method you're using, so you don't have to keep reconfiguring it. 

You can customize the storage backend by providing your own constructor function, affecting how new markdown files are handled. 

For convenience, shortcuts exist: `useMd` defaults to folder-based storage, `useJsonl` uses JSONL append, and `useDummy` lets you test without writing anything to disk. The adapter is only initialized when you first need to write a markdown file.

## Class LookupUtils

This utility provides a way to keep track of what's currently happening in your backtests and live trading sessions. Think of it as a central record of active processes.

Whenever you start a backtest run, a live trading session, or a loop within a strategy, this system automatically registers information about it. Similarly, when those processes finish, the system removes that record.

The system uses a special map to organize these entries, based on unique identifiers. 

You don't need to create or configure this system – it's already available and ready to use.

Here's a quick rundown of what you can do:

*   **Add an Activity:**  You don't directly call this, it's managed automatically by the backtest/live framework.
*   **Remove an Activity:** Also managed automatically but important for ensuring clean bookkeeping.
*   **List Active Activities:**  You can request a snapshot of all the activities that are currently running.



This system is also involved in optimizing performance during candle processing, deciding when to pause and let other tasks run.

## Class LoggerService

This service helps standardize how logging is done throughout the backtest-kit framework, ensuring messages are clear and informative. It injects relevant context into your log messages automatically, like the name of the strategy being used, the exchange involved, and the specific part of the code being executed.

You can customize the logging behavior by providing your own logger implementation through the `setLogger` function. If you don’t set a custom logger, it defaults to a "no-op" logger that doesn’t actually record anything, which is useful for development or when you want to disable logging altogether.

The service manages information about where the log messages come from – which method, which strategy, which exchange – and adds it to the messages you write. It has functions for different logging levels like general messages (`log`), detailed debugging information (`debug`), informational messages (`info`), and warnings (`warn`).

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting framework. It allows you to easily switch between different logging methods, such as in-memory storage, persistent storage to disk, or even a dummy logger that does nothing. Think of it as a central point for controlling where and how your log messages are recorded.

You can swap out the logging implementation using functions like `usePersist`, `useMemory`, `useDummy`, and `useJsonl`, which let you specify different storage options.  `useJsonl` is especially useful for writing logs to JSONL files.

To ensure your logs are always using the correct configuration, especially when working with changing directory paths, the `clear` method is handy; it resets the cached log instance. The `log`, `debug`, `info`, `warn` methods provide standard logging levels, and they all pass through to your selected logging adapter. Finally, `useLogger` allows more direct control over the logger’s construction.

## Class LiveUtils

LiveUtils provides tools for managing live trading operations, streamlining access to the core trading engine. It acts as a central point for running strategies, handling errors, and retrieving key data.

The `run` method initiates live trading for a specific symbol and strategy, continuously generating trading results, even if the process crashes—it recovers from saved states. You can also run trading in the background (`background`) without directly receiving results, useful for tasks like logging or persistent data storage.

For insight into a strategy's current state, functions like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionInvestedCost` provide critical information about open positions and their financial status. These also include methods to check for the absence of signals.

You can also retrieve details such as breakeven points (`getBreakeven`), position cost basis (`getPositionEffectivePrice`), and even control the process with `stop` (to halt trading) and `commitClosePending` (to close the active position). 

`commitAverageBuy` adds entries to a position's history, while functions like `commitTrailingStop` and `commitTrailingTake` allow for dynamically adjusting stop-loss and take-profit levels. The `dump` and `list` methods enable reporting and status monitoring of active strategies.


## Class LiveReportService

This service helps you keep a record of what’s happening with your live trading strategies. It listens for events related to signals – things like when a strategy is idle, when a position is opened, when it’s actively trading, and when it’s closed.

Everything it hears is carefully logged, including all the details of the signal, and then saved to a database. 

You can think of it as a way to create a continuous log of your strategy’s activity for monitoring and later analysis.

It avoids accidentally logging duplicate information by making sure it only subscribes once. 

To start receiving these live events, use the `subscribe` method, which also gives you a way to stop listening.  The `unsubscribe` method will stop the service from receiving any further events.

## Class LiveMarkdownService

This service helps you create automated reports about your live trading activity. It listens to what’s happening in your strategies, like when they're waiting, opening trades, actively trading, or closing positions. 

It gathers all these details and turns them into readable markdown tables, complete with key trading statistics such as win rate and average profit/loss. These reports are automatically saved to your computer, organized by strategy name, making it easy to review your performance over time.

You can also request specific data or reports for individual strategies, or clear out the collected data when you need to. The service is designed to keep data separate for each strategy and trading environment to ensure accurate reporting. You subscribe to receive updates and can unsubscribe when you're finished.

## Class LiveLogicPublicService

The LiveLogicPublicService is designed to manage and orchestrate live trading operations, simplifying the process by automatically handling context information. It builds upon the LiveLogicPrivateService and integrates with a method context service, meaning you don’t need to explicitly pass strategy and exchange names to functions like `getCandles()` or `getSignal()`.

It operates as an infinite, asynchronous generator, continually producing strategy tick results (opened, closed, or cancelled). A key benefit is its crash recovery feature - if the process fails, it can automatically restart and restore the trading state from saved data. Real-time progression is managed using the current timestamp.

Here’s a breakdown of its components:

*   It uses a logger service for logging and context.
*   It relies on a private LiveLogicService for the core trading logic.
*   It depends on an ExchangeConnectionService to manage connections to exchanges.
*   The `run` method initiates the live trading process for a specific symbol, automatically providing the necessary context.


## Class LiveLogicPrivateService

This service manages the live trading process for a specific symbol, continuously monitoring and reacting to signals. It functions as an ongoing loop, checking for new signals and generating updates in real-time. 

The service streams results – specifically, when positions are opened or closed – rather than constantly reporting on active trades. This design keeps the data flowing efficiently and avoids overwhelming the system. 

Importantly, the system is designed to handle crashes and automatically recover, ensuring that the trading process doesn't lose its place.  The `run` method is the core of this process, creating an infinite generator that provides a continuous flow of trading updates.


## Class LiveCommandService

The LiveCommandService acts as a central hub for live trading operations within the backtest-kit framework. Think of it as a helper that simplifies accessing the core live trading features.

It bundles together several essential components, including services for logging, interacting with the live trading logic, validating strategies and exchanges, and handling risk assessments. 

The `validate` property offers a way to confirm that a trading strategy and its related risk settings are properly configured, preventing potential issues before live trading begins. This validation process is optimized to avoid repeated checks.

The key functionality lies in the `run` method which initiates and manages live trading for a specific asset.  It's designed to continuously execute and gracefully recover from unexpected errors, ensuring a stable and persistent trading experience.


## Class IntervalUtils

The `IntervalUtils` class helps you control how often your functions are executed, ensuring they run only once within a specific time interval. Think of it as a way to prevent your code from running too frequently and potentially overwhelming the system.

There are two main ways to use this: in-memory, where the state is lost when the program stops, or file-based, where the firing state is saved to a file so it persists even if the program restarts.

The `fn` property lets you wrap regular functions for this "once-per-interval" behavior, keeping track of when they last ran in memory.  The `file` property does the same for asynchronous functions, but writes the state to a file. 

You can also clean up old, unused function instances using `dispose` and `clear`, and reset the counter for file-based instances using `resetCounter`, particularly when the working directory changes. This helps avoid conflicts and ensure proper operation across different runs. Because this is a singleton, it's simply accessed as `Interval` to make it easily available in your code.

## Class HighestProfitUtils

This class helps you analyze and report on your highest profit trading events. It's like a central place to gather information collected during backtests or live trading. 

You can use it to get summarized statistics for a specific trading symbol and strategy.

It also lets you create detailed markdown reports showing all the highest profit events for a given combination of symbol, strategy, exchange, and timeframe. 

Finally, you can automatically save these reports as files, making it easy to share or keep records of your most profitable trades. It's a handy tool for understanding what's working well in your trading system.

## Class HighestProfitReportService

This service is designed to track and record the moments when a trading strategy achieves its highest profit. It essentially listens for "highest profit" events and diligently saves details about those events to a database for later analysis.

The service keeps a record of crucial information each time a new profit record is made, like the timestamp, trading symbol, strategy name, exchange, timeframe, and backtest details. It also captures specifics related to the signal itself, including its ID, position size, current price, and take profit/stop loss levels.

To get things started, you'll need to subscribe to the service, which begins the process of logging these high-profit events. To stop the logging, you can unsubscribe. The subscription process is designed to be safe – you can only subscribe once to avoid unnecessary activity.

## Class HighestProfitMarkdownService

This service helps you create and save reports detailing your highest profit trading performance. It listens for incoming data about profitable trades and organizes it based on symbol, strategy, exchange, and timeframe.

To start receiving data, you need to subscribe to the service; doing so only happens once.  Unsubscribing completely stops the data collection and clears everything.

Each time the service receives a new piece of profitable trade data, it's stored and categorized.  You can then request specific reports for a given symbol, strategy, exchange, and timeframe.  These reports present the data in an easily readable markdown format, including a table of recent events and a total count.

You can also save these reports directly to disk, where they are named based on the symbol, strategy, exchange, timeframe, and a timestamp.

Finally, you can clear the stored data. Providing specific details like symbol, strategy, etc., clears only the data for those parameters. Omitting them clears all accumulated data across all symbols, strategies, and timeframes.

## Class HeatUtils

HeatUtils helps you visualize and understand your portfolio's performance across different strategies and symbols. It’s designed to make creating and exporting heatmap reports easy.

This class automatically gathers statistics like total profit, Sharpe Ratio, maximum drawdown, and the number of trades for each symbol within a strategy.

You can use `getData` to get the raw data for these statistics or `getReport` to generate a nicely formatted markdown table summarizing performance.

The `dump` function lets you save the markdown report directly to a file, creating the necessary directories if they don't already exist. Think of it as a simple way to keep track of how your strategies are doing and share that information.


## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording closed trade signals. It listens for these signals – essentially, when a trade is finished – and stores the relevant data, including profit and loss, in a database. This data can then be used to create heatmaps, providing a visual overview of your portfolio's activity and helping you identify patterns or areas for improvement.

The service is designed to be reliable; it prevents you from accidentally subscribing multiple times and provides a clean way to stop listening for signals. You can think of it as an automated system for capturing important data points about your trades to help you understand what's working well and what might need adjustment.




It uses a logger to provide debugging output.




The `tick` property is responsible for processing these signals and logging the details.




To start, you'll subscribe to the signal emitter, and when you're done, you can unsubscribe.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance through portfolio heatmaps. It listens for trading signals and gathers statistics for each strategy and symbol.

You can subscribe to receive real-time updates on closed trades, and easily unsubscribe when you no longer need them.

The service provides ways to retrieve aggregated data, generate formatted reports in markdown, and even save those reports directly to a file. 

It manages data storage efficiently, creating separate, isolated storage areas for each exchange, frame, and backtest mode.  This means you can track metrics independently for different testing environments or live trading scenarios.

You can clear the accumulated data for specific exchanges and frames or clear everything if needed. The service also handles potential math errors gracefully, ensuring stability.

## Class FrameValidationService

This service helps you keep track of and verify your trading timeframe configurations. Think of it as a central manager for your timeframes. 

You can use it to register new timeframes with their details, ensuring they're correctly set up for your backtesting. It also provides a way to quickly check if a timeframe actually exists before you try to use it, preventing errors. 

To speed things up, it remembers the results of previous validations so it doesn’t have to check repeatedly. Finally, you can easily get a complete list of all the timeframes you’ve registered. 

It utilizes a `loggerService` for handling logs and maintains an internal map (`_frameMap`) for tracking the frames. The `addFrame` method allows you to register new frames, `validate` confirms a frame's existence, `list` provides a list of all frames, and the constructor initializes the service.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas, ensuring consistency and type safety throughout your backtesting process. It acts like a central library where you store and manage the blueprints for your frames.

You can add new frame schemas using the `register` method, essentially adding a new blueprint to the library. If a frame schema already exists, the `override` method allows you to update specific parts of that blueprint. 

To use a frame schema, you can retrieve it by name using the `get` method. 

Before a new frame schema is added, a quick check (`validateShallow`) makes sure it has all the necessary parts and those parts are of the expected types. This helps prevent errors down the line.

## Class FrameCoreService

This service acts as the central hub for managing and generating timeframes within the backtesting environment. It relies on a connection service to fetch data and a validation service to ensure the frames are usable. Think of it as the engine that provides the sequence of dates you'll be analyzing during a backtest.

Specifically, it offers a method called `getTimeframe` which is crucial: you provide a symbol (like a stock ticker) and a timeframe name (like "daily" or "hourly"), and it returns an array of dates representing that timeframe. This is the foundation for iterating through your historical data. The `loggerService`, `frameConnectionService`, and `frameValidationService` properties are internal components used to power these operations.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It intelligently routes requests to the correct frame implementation based on the current context.

Think of it as a smart router that figures out which frame you need based on what you're trying to do.

It's designed to be efficient too, by storing frequently used frames in a cache, so it doesn't have to recreate them every time.

This service also handles the backtest timeframe, defining the start and end dates for your analysis.  A key function, `clear`, is important for ensuring the backtest always uses the latest data; without it, the backtest might unknowingly operate with outdated timeframe information.

Finally, `getTimeframe` allows you to specify the symbol and frame name to retrieve the relevant date boundaries for your backtest.

## Class ExchangeValidationService

This service helps you keep track of your configured exchanges and make sure they're set up correctly before you start trading. It acts like a central manager for your exchange configurations, storing them in a registry. 

You can use it to register new exchanges, ensuring they're known to the system. It provides a way to verify if an exchange exists and is ready to be used before attempting any actions, preventing errors.

To speed things up, it remembers the results of these checks so you don't have to re-validate every time. Finally, it provides a way to see a complete list of all the exchanges you've registered.

## Class ExchangeUtils

The `ExchangeUtils` class provides helpful tools for working with exchange data. Think of it as a centralized helper for common tasks like fetching candles, calculating prices, and formatting trade quantities. It's designed to be easily accessible, functioning as a single, shared instance.

Retrieving historical candle data is simplified with `getCandles`, which automatically calculates the date range based on the interval and number of candles you need. Need to know the current average price? `getAveragePrice` calculates that for you. You can also easily grab the closing price of the most recent candle using `getClosePrice`.

When placing orders, `formatQuantity` and `formatPrice` ensure your order details align with the specific formatting rules of the exchange. Getting order book and aggregated trade data is streamlined, allowing you to check market depth and trade history. 

Finally, `getRawCandles` lets you fetch very specific sets of candles, with options to define precise start and end dates – and it protects against potential look-ahead bias during backtesting by intelligently determining its reference time.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring consistency and accuracy. It uses a special system for storing this information safely and reliably. 

You can add new exchange details using the `addExchange` function, and retrieve existing ones by their name when you need them.

Before adding a new exchange, the service checks to make sure all the necessary information is present and in the correct format, preventing errors later on. 

You can also update existing exchange information, replacing specific fields with new values. If you need to find details about a particular exchange, the `get` function lets you retrieve all the information associated with its name.

## Class ExchangeCoreService

ExchangeCoreService acts as a central hub for interacting with exchanges within the trading framework, ensuring operations are aware of the specific trading environment, like the symbol being traded and the time period. It combines connection to the exchange with details about the execution context, like whether it's a live trade or a backtest.

This service provides methods for retrieving essential market data, such as historical and future candle data (for backtesting), average prices, order books, and aggregated trades. The `validate` method checks the exchange's configuration and caches the results for efficiency. Each data retrieval method is executed within the defined execution context.

You can use this to get historical price data, simulate future scenarios during backtests, and retrieve order book information. All operations are designed to inject the necessary context and time-related information for proper execution and analysis. The `formatPrice` and `formatQuantity` methods ensure prices and quantities are appropriately formatted based on the context of the trade.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange implementation based on the currently selected exchange, streamlining your backtesting or live trading process. It remembers previously used exchanges to speed things up, avoiding unnecessary re-initialization.

Here's a breakdown of what it can do:

*   **Automatic Exchange Selection:** It figures out which exchange to use automatically, based on the active context.
*   **Cached Connections:** It keeps track of previously created connections to exchanges for faster access.
*   **Comprehensive Functionality:** Provides methods for fetching historical candles, retrieving the next batch of candles relative to the current execution timestamp, and getting the average price – all routed correctly.
*   **Price and Quantity Formatting:** Ensures that prices and quantities are formatted correctly according to the rules of the specific exchange, which is critical for avoiding order rejections.
*   **Data Retrieval:** It provides ways to fetch order books, aggregated trades, and raw candle data, all while correctly directing those requests to the appropriate exchange.

## Class DumpAdapter

The DumpAdapter helps you save different pieces of information generated during your backtesting process, providing flexible ways to store them. It acts as a central point for managing these saves, letting you choose where the data goes – whether it's to markdown files, memory, or even just discarded.

You can select the storage method easily: default is markdown, but you can switch to memory storage, a dummy (no-op) mode for testing, or even provide your own custom storage implementation.  Before using any of the save methods, you need to activate the adapter using `enable()`, and deactivate it with `disable()` later.

The adapter provides methods for saving various types of data, including agent message histories, simple records, tables, raw text, error messages, and even complex JSON objects, all while managing scoped instances to avoid stale data. Clearing the adapter's cache (`clear()`) is a good practice when your working directory changes between tests.

## Class CronUtils

This class helps manage scheduled tasks that need to run precisely at specific times within a trading backtest. It’s particularly useful when running many backtests in parallel because it ensures that these tasks only execute once, even if multiple backtests try to run them simultaneously. 

Think of it like a traffic controller for scheduled actions. It makes sure that everyone waits their turn and that only one handler runs for each boundary, preventing conflicts and ensuring accurate results.

Here's a breakdown of the key elements:

*   **Registration and Unregistration:** You register tasks (like "check market conditions every minute") with the system. You can later remove these tasks.
*   **Shared State:**  It uses a few internal data structures to keep track of registered tasks and their status.  This includes managing generation counters to prevent interference between different versions of the same task.
*   **Synchronization:** The core functionality prevents multiple tasks from running at the exact same time. If several backtests try to run the same task at the same time, it ensures only one does.
*   **Clearance:**  You can clear fire-once tasks so that they can trigger again. This is useful for resetting the system or rerunning specific actions.
*   **Disposal:** There's a way to completely reset the system, removing all tasks and subscriptions.
*   **Lifecycle Integration:** The `enable` and `disable` functions connect this system with the trading backtest's lifecycle events, so tasks run automatically at appropriate times.

The framework automatically handles the timing and coordination, allowing you to focus on defining the tasks you want to schedule within your backtest environment.

## Class ConstantUtils

This class provides a set of predefined constants that are useful when setting take-profit and stop-loss levels for trading strategies. These constants are based on the Kelly Criterion and incorporate exponential risk decay, helping manage risk and maximize potential profits. The take-profit levels (TP_LEVEL1, TP_LEVEL2, TP_LEVEL3) represent percentages of the total distance to the final take-profit target, allowing for gradual profit capture as the price moves favorably. 

For example, TP_LEVEL1 triggers when the price reaches 30% of the way to your ultimate profit target. The stop-loss levels (SL_LEVEL1, SL_LEVEL2) function similarly, acting as warning signs and ultimate exits to minimize losses if the trade moves against you. SL_LEVEL1 triggers at 40% of the distance to the final stop-loss target, helping reduce exposure when the initial trading setup appears to be failing.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading setup is mathematically sound and capable of making a profit. It checks your global configuration parameters to prevent mistakes that could lead to losses.

It makes sure percentages like slippage and fees aren't negative, and that your take-profit distance is large enough to cover all costs. The service also verifies that ranges of parameters, like stop-loss distances, are set up correctly with appropriate minimum and maximum values.

Finally, it confirms that time-related settings and candle parameters are using positive integer values. This helps to catch errors early on, ensuring a more reliable and profitable trading environment. 

The `validate` function performs these checks, acting as a safety net for your trading configuration.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It checks your column definitions against a set of rules to prevent errors and inconsistencies.

Specifically, it verifies that each column has the necessary properties: a unique key, a descriptive label, a formatting function, and a visibility function. 

It also makes sure those keys are unique within their group, and that the key and label properties are strings. 

The `validate` method performs these checks on all your column configurations.

## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on your strategy’s needs. It’s designed to provide flexible position sizing, allowing you to use different approaches like a fixed percentage, Kelly criterion, or volatility-based sizing using ATR. You can also set limits on the minimum or maximum position size, and restrict the overall percentage of your capital used in any single trade.  It provides the `calculate` method to actually perform the sizing calculation, considering all the rules and settings you've defined. This component helps to ensure your trades are appropriately sized according to your strategy’s risk management parameters.

## Class ClientRisk

ClientRisk helps manage risk across multiple strategies, ensuring no signals violate defined limits like maximum concurrent positions or custom validations. It's a central component for portfolio-level risk management.

Think of it as a gatekeeper for your trading signals, preventing actions that could lead to unwanted risks.

**Key Features:**

*   **Shared Risk Profile:** Multiple strategies can use the same ClientRisk instance, enabling cross-strategy risk analysis and coordination.
*   **Concurrency Control:** It prevents strategies from exceeding defined limits, even when they operate concurrently.
*   **Customizable:** You can define your own risk checks and validations.
*   **Atomic Operations:** `checkSignalAndReserve` ensures reservations are done safely to avoid over-limit situations.

**How it works:**

1.  **Initialization:** Loads existing positions (skipping this during backtesting).
2.  **Signal Validation:** `checkSignal` evaluates if a signal is valid based on risk rules. `checkSignalAndReserve` does the same while reserving a position slot.
3.  **Position Tracking:** Keeps track of active positions across all strategies.
4.  **Signal Registration:** `addSignal` marks a position as open, and `removeSignal` marks it as closed.

ClientRisk ensures that signal execution is safe and aligned with your risk management strategy.

## Class ClientFrame

The ClientFrame is a key component that handles creating the timelines used for backtesting trades. Think of it as the engine that produces the sequence of dates and times your backtest will run against.

It's designed to be efficient, avoiding unnecessary recalculations by storing previously generated timeframes.  You can customize the spacing between these time points, choosing intervals from one minute to one day.

It also allows for custom checks or actions to be triggered during timeframe generation, like verifying data or recording events. Essentially, it provides the backbone for iterating through historical data during the backtesting process.

The `getTimeframe` property is the core function - it's how you request a timeframe for a specific asset. This function remembers its results so that generating timeframes for the same asset doesn’t become slow.


## Class ClientExchange

This `ClientExchange` component acts as a bridge to retrieve market data, designed to be efficient and prevent data leakage during backtesting. It provides methods for fetching historical and future candle data – crucial for both analyzing past performance and simulating future trading scenarios. It also calculates the Volume Weighted Average Price (VWAP), formats prices and quantities for exchange compatibility, and retrieves order book data and aggregated trades.

Here's a breakdown of what it does:

*   **Data Retrieval:** You can request candles from the past (`getCandles`) or future (`getNextCandles`), essential for backtesting. A `getRawCandles` function also exists for more flexible data retrieval, allowing you to specify start and end dates and a limit.
*   **Price Calculations:** It calculates the VWAP to understand average prices, and provides methods to retrieve the latest closing price for specific intervals.
*   **Formatting:** The component helps prepare data for the exchange by formatting prices and quantities, ensuring they adhere to the exchange's specific rules.
*   **Order Book and Trades:** It retrieves order book data and aggregated trades, giving you insights into market depth and recent trading activity.
*   **Look-Ahead Prevention:** The system carefully aligns timestamps to avoid using future data when evaluating past decisions – a key principle for accurate backtesting.

## Class ClientAction

The `ClientAction` class is a core component for managing and executing custom action handlers within the trading framework. Think of it as a central hub that sets up, routes, and cleans up after these handlers, which are responsible for things like updating your trading state, logging activity, sending notifications, or collecting performance data.

It initializes your action handler once, ensuring it's ready to process events, and then directs those events (like signals, profit/loss updates, or scheduled tasks) to the appropriate methods within your handler.  This class handles the lifecycle of the handler, making sure it's properly disposed of when no longer needed.

There are specific methods for handling different types of events—signal events from live or backtest modes, breakeven and partial profit/loss levels, scheduled pings, order synchronization, and risk rejection.  Some event handling relies on manual setup where you define callbacks to connect the event to specific actions. Finally, the `dispose` function is vital for cleaning up resources and preventing memory leaks.

## Class CacheUtils

CacheUtils is a helper class that lets you easily cache the results of your functions, especially useful when dealing with time-based data like trading strategies. It acts like a central manager for these cached functions, making sure everything runs smoothly.

It provides two main ways to cache: regular functions and asynchronous functions that also store data on disk. Both methods use the timeframe interval to determine when the cached data becomes stale and needs to be recalculated.

The `fn` function allows you to wrap any regular function and automatically cache its results based on intervals. `file` wraps asynchronous functions, persisting the cached results to disk under a specific file structure.  Each function you wrap gets its own dedicated cache to avoid interference.

If you need to manually clean up a function’s cache, you can use `dispose`. To completely wipe all caches and start fresh, use `clear`.  `resetCounter` helps avoid filename conflicts when the working directory changes during testing or backtesting runs. Using the same function reference ensures the correct cache is used.

## Class BrokerBase

This class, `BrokerBase`, is designed to help you create custom adapters to interact with different exchanges. Think of it as a starting point to connect your trading strategy to a specific broker. It provides all the basic functionality for things like placing orders, managing stops and take profits, and tracking your positions.

You don't need to re-implement everything—it has default "no-op" implementations for most actions, which simply log what’s happening. You only need to override the methods that are specific to the exchange you're working with.

**Here's a breakdown of what it does:**

*   **Initialization:** `waitForInit()` is called once to set up your connection to the exchange (logging in, etc.).
*   **Order Management:** Methods like `onOrderOpenCommit` (placing entry orders), `onOrderCloseCommit` (closing positions), and `onPartialProfitCommit` (taking partial profits) let you handle orders.
*   **Monitoring:**  `onSignalActivePing` and `onSignalSchedulePing` give you a chance to check the status of active or scheduled orders.
*   **Notifications:**  Methods like `onTrailingStopCommit` and `onAverageBuyCommit` handle events like updating stop losses or adding to a DCA position.

Essentially, `BrokerBase` gives you the structure to build your own broker adapter, ensuring that your trading strategy can communicate with and control an external exchange. The framework handles a lot of the boilerplate and event logging for you.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker. It's designed to provide control and safety during order execution. Think of it as a gatekeeper before any changes are made to your trading data.

During backtesting, it largely ignores order-related signals to speed up the process. However, in live trading, it forwards these signals to the real broker.

It also handles automatic events, like signaling when orders open or close, and sending pings for active, scheduled, or idle periods. These events are automatically handled when the adapter is enabled.

Crucially, it offers a chance to intercept certain actions – like partial profits, losses, stop-loss adjustments, and breakeven orders – before they're finalized, allowing for validation or cancellation if necessary.  Essentially, it’s a safety net.

You register your specific broker adapter using `useBrokerAdapter` and then activate it with `enable`.  Disabling removes the broker connection, and `clear` resets the adapter's internal state if needed, for instance when the working directory changes.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events, which track when a trade reaches its breakeven point. It's like having a dedicated tool to understand how your trading strategies perform regarding breakeven levels.

You can ask it to give you summarized statistics about breakeven events for a specific symbol and strategy – think of it as getting a quick overview of breakeven performance.

It also creates detailed markdown reports that list individual breakeven events, including important details like entry price, position, and timestamps. These reports can be saved as files, making it easy to share or archive your breakeven data.

Finally, you can tell it to directly save these reports to a file, organizing them by symbol and strategy for easy access and comparison.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading strategies reach their breakeven point. It acts like a recorder, listening for these significant moments – when a trade starts to become profitable – and carefully noting down all the details.

This service saves information like the full signal details associated with each breakeven event. The data is then stored persistently, ready for you to analyze and understand how your strategies are performing.

To use it, you’ll subscribe to a signal emitter to receive breakeven notifications.  It ensures you won't accidentally subscribe multiple times.  When you’re done, you can unsubscribe to stop receiving those notifications.


## Class BreakevenMarkdownService

This service helps you create and store reports detailing when your trading strategies hit breakeven points. It listens for breakeven events and keeps track of them for each symbol and strategy you're using.

It organizes these events and generates easy-to-read markdown tables summarizing the data, along with overall statistics like the total number of breakeven events.

The service automatically saves these reports as markdown files in a dedicated directory, making it simple to review and analyze your strategies' performance. 

You can subscribe to receive breakeven events, and the service handles ensuring you don't accidentally subscribe multiple times. It also provides a way to unsubscribe when you no longer need to receive these events.

You can retrieve statistical data or complete reports for specific symbol-strategy combinations, or clear the accumulated data completely if needed.

## Class BreakevenGlobalService

This service acts as a central hub for managing breakeven calculations within the system. It's designed to be a single point of access for strategies needing breakeven functionality, making it easier to track and control how these calculations happen.

Think of it as a middleman; it receives requests for breakeven checks and clear operations, logs them for monitoring purposes, and then passes them on to a dedicated connection service.  It keeps things organized and provides a consistent way to handle breakeven events.

Several validation services are injected to ensure the strategy, risk, exchange, frame, and action configurations are valid before proceeding.

The `validate` function makes sure strategy and risk configurations are correct, remembering previous validations to avoid unnecessary checks.  The `check` function determines whether to trigger a breakeven event, while `clear` resets the breakeven state when a signal closes.


## Class BreakevenConnectionService

The BreakevenConnectionService manages the tracking of breakeven points for trading signals. It ensures that each signal has its own dedicated breakeven tracker, and it keeps these trackers organized and efficient. 

Think of it as a central hub that creates and manages these trackers. It remembers which trackers it has created and reuses them when the same signal appears again, preventing unnecessary creation.

When a signal needs to be checked or cleared (like when a trade is opened or closed), this service handles those operations by directing them to the appropriate tracker. 

It also keeps things tidy by removing trackers when signals are no longer active, preventing your system from getting bogged down with old data. This service is essential for managing the breakeven calculations that help determine trade profitability.

## Class BacktestUtils

This utility class provides helpful shortcuts and tools for running and analyzing backtests within the trading framework. It simplifies interaction with the backtest engine and provides access to various data points and control options.

You can think of it as a central hub for common backtesting tasks.

**Running Backtests:**

*   `run()`:  Executes a backtest for a specific symbol and strategy, yielding results as they become available.
*   `background()`: Runs a backtest in the background without immediate result processing. This is useful for tasks like logging or side effects.

**Signal Management:**

*   Methods like `getPendingSignal`, `getScheduledSignal`, and related `hasNo...Signal` functions allow you to inspect and interact with pending and scheduled signals, helping you understand the strategy's decision-making process.

**Position Data & Analysis:**

*   Functions like `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionEffectivePrice`, and `getPositionInvestedCount` give you detailed information about the current position's status and cost basis, accounting for DCA entries.
*   Functions to get position data like highest profit/drawdown, minutes elapsed, and estimated duration offer insights into the strategy's performance.

**Control & Manipulation:**

*   `stop()`: Halts a backtest, allowing for interruption or early termination.
*   `commitCancelScheduled` and `commitClosePending` offer precise control over signal lifecycle.
*   `commitAverageBuy` and similar functions let you simulate specific actions within the backtest.

**Reporting & Data Extraction:**

*   `getReport()` creates a detailed markdown report of backtest results.
*   `dump()` saves this report to a file.
*   `list()` provides a snapshot of all active backtest instances and their status.

The `BacktestUtils` singleton is designed for ease of access and consistent operation across different backtest scenarios. It streamlines the backtesting workflow and simplifies accessing essential data and control functions.

## Class BacktestReportService

BacktestReportService helps you record what's happening during your backtests. It listens for signals generated by your trading strategy and carefully saves details about each signal's lifecycle – when it's idle, opened, active, or closed.

Think of it as a detailed logbook for your backtests.

This service uses a database to store this information, making it easier to analyze how your strategy performs and to find and fix any problems.

To start using it, you’ll subscribe to the backtest signal events.  Once you’re done, remember to unsubscribe to stop the service from actively logging. If you accidentally try to subscribe more than once, it prevents duplicate entries and ensures clean data.


## Class BacktestMarkdownService

The BacktestMarkdownService helps you automatically create and save reports about your backtesting results. It listens for updates during backtests and keeps track of signal information, like when trades are closed.

It organizes this data using a special storage system that keeps information separate for each symbol, strategy, exchange, frame, and backtest. This ensures your reports are well-organized.

The service then transforms this data into readable markdown tables, making it easy to analyze your backtest performance. Finally, it saves these reports as files on your computer, making them readily available for review.

You can also request specific data or reports, and clear the accumulated data when you're finished. 

To use it, you’ll need to subscribe to receive tick events during your backtest and unsubscribe when you are done.


## Class BacktestLogicPublicService

This service helps manage and run backtests, simplifying the process by automatically handling important contextual information. It builds upon a private backtest logic service and intelligently manages things like strategy names, exchange details, and frame names. 

You no longer need to manually pass these details to various functions; the service handles that for you.

Here’s a breakdown of what you can do:

*   **loggerService:** Provides access to context and execution services, along with methods for setting up logging.
*   **backtestLogicPrivateService:** The core logic for running the backtest.
*   **timeMetaService:** Handles time-related data and calculations.
*   **frameSchemaService:**  Manages the schema related to data frames.
*   **exchangeConnectionService:** Deals with connections to exchanges.

The primary method is `run`. This is what starts the backtest process for a given symbol.  It streams results like signals and order execution events, providing a continuous flow of information as the backtest progresses. The context information is automatically included, making the process easier.

## Class BacktestLogicPrivateService

BacktestLogicPrivateService handles the complex process of running a backtest, breaking it down into manageable steps. It starts by gathering the necessary timeframes and then systematically processes each one. When a trading signal appears, it fetches the required candle data and executes the backtest logic. The system intelligently skips ahead to the timeframe when a trade closes, efficiently streaming the results instead of storing everything in memory. 

You can even stop the backtest early if needed.

The service relies on several other core services to function, including those managing strategies, exchanges, timeframes, actions, and price data. Essentially, it orchestrates all the pieces needed to simulate trading and provide a stream of results detailing trade outcomes.


## Class BacktestCommandService

This service acts as a central point for all backtesting operations. It provides a straightforward way to access and manage backtest functionality within the framework.

It relies on several other services to handle tasks like logging, strategy validation, and ensuring configurations are correct. These dependencies are managed internally, making it easy to integrate into your application.

The `validate` function checks the strategy and its risk settings, remembering previous validations to speed things up.

The `run` function is the core of the backtesting process; it executes a backtest for a specific trading symbol, along with information about the strategy, exchange, and frame being used. This method returns results as a series of scheduled, opened, closed, or cancelled strategy tick results.


## Class ActionValidationService

The ActionValidationService is like a librarian for your action handlers, keeping track of them and making sure they're available when you need them. It lets you register new actions, check if an action exists before trying to use it, and provides a way to see a complete list of all registered actions.  It's designed to be efficient, remembering previous validation results to avoid unnecessary checks. The service helps guarantee your trading strategies can reliably execute the actions they intend to perform. You can register action schemas using `addAction`, verify their existence with `validate`, and get a full overview of registered actions using `list`. It also utilizes a logger service and an internal map to keep everything organized.

## Class ActionSchemaService

The ActionSchemaService is responsible for keeping track of all the different actions your trading system can perform. It makes sure these actions are set up correctly, with the right methods and configurations.

It uses a type-safe system to store these action definitions, so you're less likely to make mistakes when defining them.

It checks to ensure that action handlers only use the approved methods.

Here's what you can do with it:

*   **Register new actions:** You can register new action schemas, and the service validates that they are properly formatted and don't conflict with existing actions.
*   **Modify existing actions:** You can update existing action schemas with only the changes you need, without needing to recreate the whole thing.
*   **Retrieve action details:** You can retrieve the full configuration of an action, which is used to create and manage those actions.
*   **Shallow validation:** There's a feature for quickly checking if an action schema has the essential parts before it's added to the system.

The service uses a logger to track its activities and stores its action schemas in a registry.

## Class ActionProxy

The ActionProxy acts as a safety net when you're using custom code within the backtest framework. It essentially wraps all your action handlers (like `init`, `signal`, `dispose`, etc.) in a protective layer that catches any errors they might throw. This prevents errors in your custom code from crashing the entire backtesting process – instead, the errors are logged and the execution continues.

Think of it as a way to gracefully handle situations where your code might be incomplete or have unexpected issues. The `ActionProxy` ensures that even if a particular method is missing or produces an error, the backtest can still proceed.

It's created through a factory method called `fromInstance`, which takes your custom action handler and wraps it with this error-handling logic. Methods like `signalLive`, `breakevenAvailable`, and `pingScheduled` all receive this protected treatment, ensuring consistency in how errors are managed across various events.

There are a few critical methods, `orderSync` and `orderCheck`, which *don't* have this error-catching protection. These are special cases where errors need to be immediately surfaced for debugging purposes.



Each ActionProxy instance holds a reference to the actual code it's wrapping (`_target`) and the parameters associated with the action (`params`).

## Class ActionCoreService

The `ActionCoreService` acts as a central hub for managing actions within your trading strategies. It's like an orchestrator that ensures all the actions associated with a strategy are executed in the correct order and with the right data.

It retrieves the necessary actions from the strategy's definition and then handles them, whether it's for backtesting, live trading, or other events like breakeven calculations or scheduled pings. Essentially, it keeps everything coordinated behind the scenes.

Here's a breakdown of what it does:

*   **Initialization:** Sets up all necessary components and services used by the action system.
*   **Validation:** Checks that the strategy, exchange, and frame configurations are all valid before proceeding, avoiding errors later on. It caches these validations to be more efficient.
*   **Event Routing:** When a specific event occurs (like a new market tick, a scheduled ping, or a risk rejection), the service distributes it to all the registered actions, ensuring each action can react appropriately.
*   **Lifecycle Management:** The service also handles clean-up tasks like disposing of resources when a strategy execution is complete.

Different methods are available for handling various signal events like `signal`, `signalLive`, `signalBacktest` as well as specific events like `breakevenAvailable`, `partialProfitAvailable`, `orderSync`, and `orderCheck`. Each of these routes the related signal to the applicable ClientActions.

Finally, it provides a `clear` function to wipe out action data, either for a specific action or globally across all strategies.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions related to your trading strategy. It's designed to efficiently route events – like signals, breakeven notifications, or scheduled tasks – to the correct action handler based on the action's name and the specific strategy and frame being used.

Think of it like a postal service that makes sure each letter (event) gets to the right address (action). To avoid creating the same action handler repeatedly, it cleverly caches these handlers, reusing them whenever possible for better performance.

This service helps manage several types of events:

*   **Signal Events:** Routes different types of signal events, including live and backtest versions.
*   **Profit/Loss Events:** Handles notifications about breakeven, partial profit, and partial loss conditions.
*   **Scheduled Tasks:**  Deals with scheduled pings and lifecycle events related to signals.
*   **Order Management:** Sends events related to order synchronization and order checks.
*   **Disposal:** Provides a way to properly clean up and release resources when an action is no longer needed.
*   **Cache Clearing:** Allows you to manually clear out cached action instances if needed.

The service keeps track of which actions are being used for which strategy and frame, preventing conflicts and ensuring actions are applied correctly within each context.

## Class ActionBase

This class serves as a foundation for creating custom actions within your trading strategies. Think of it as a starting point for handling events and extending functionality.

It provides pre-built logging and access to key information like strategy and frame names, so you don't have to reimplement those common tasks. It supports a range of events, from initial setup (`init`) to signal events (`signal`, `signalLive`, `signalBacktest`) and various milestone notifications (`breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, `pingScheduled`, `pingActive`, `pingIdle`, `riskRejection`), offering a comprehensive structure for custom logic.

When you need to send notifications, manage state, or implement custom logic, extend this base class to create tailored action handlers. The `dispose` method ensures proper cleanup when the strategy ends. The provided default implementations handle basic logging, letting you focus on your custom event responses. Note that some features like older order handling are deliberately not implemented to encourage best practices.
