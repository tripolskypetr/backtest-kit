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

The WalkerValidationService helps you keep track of and make sure your parameter sweep configurations, often called "walkers," are set up correctly. It acts as a central place to register these walkers, ensuring they exist before you try to use them in your backtesting or optimization processes.

Think of it as a librarian for your walkers – you add them to the registry, and it checks that they're actually there before letting you proceed.

The service also speeds things up by remembering (memoizing) whether a walker is valid, so it doesn’t have to check again and again.

You can use it to:

*   Add new walker configurations.
*   Verify that a walker exists and that all its connected strategies, risks, and actions are also valid.
*   See a complete list of all the walkers you've registered. 

The service relies on other helper services like `StrategyValidationService` to ensure everything is consistent.

## Class WalkerUtils

WalkerUtils helps you manage and run "walkers," which are essentially automated trading strategy comparisons. It simplifies the process of running these walkers by handling the underlying setup and logging.

Think of it as a convenient way to kick off and control these trading strategy tests. The system ensures each symbol and walker combination gets its own dedicated instance, preventing interference.

Here’s what you can do with WalkerUtils:

*   **Run walkers:**  Start a comparison of strategies for a specific trading symbol and provide extra information.
*   **Run in the background:**  Execute walkers without constantly checking for updates, useful when you just want to log something or trigger a side effect.
*   **Stop walkers:**  Halt strategies within a walker from producing new trading signals. This doesn't immediately kill active signals; instead, they'll complete normally before stopping.
*   **Get data:** Retrieve the complete results from all strategy comparisons in a walker.
*   **Generate reports:** Create markdown reports summarizing the walker's performance.
*   **Save reports:** Export those reports to a file on your disk.
*   **List walkers:** View a list of all currently running walkers and their status (pending, completed, failed, or ready).

WalkerUtils is designed to be easily accessible, making it a central point for interacting with your walker system.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema templates used by walkers, ensuring they are well-defined and consistent. It uses a specialized system to store these templates in a type-safe way.

You can add new schema templates using the `addWalker()` method, and then retrieve them later by their name.

The service performs a quick check when a new schema is added to make sure it has the essential elements in the right format. 

If you need to update an existing schema template, you can use the `override()` method to make targeted changes. 

Finally, `get()` allows you to find a specific schema template by its name.

## Class WalkerReportService

WalkerReportService helps you keep track of your strategy optimization experiments. It’s designed to automatically record the results of your strategy tests, saving them to a SQLite database.

This service listens for updates from your optimization process and saves key information like metrics and statistics for each test run. You can use this logged data to analyze how different parameter settings affect your strategy's performance and identify the best configurations.

Think of it as a detailed logbook for your optimization experiments, helping you compare strategies and understand what works best.

To use it, you'll subscribe to receive optimization updates, and when you're done, you'll unsubscribe to stop the data flow. This prevents accidental double-logging of results. The `tick` property handles the actual processing and logging of these events.

## Class WalkerMarkdownService

This service helps generate and save reports about your trading strategies as they're being tested. It listens for updates during the backtesting process, keeping track of how each strategy performs. It then organizes this information into easy-to-read markdown tables that compare the strategies.

The service uses a special storage system to ensure each walker – each individual simulation of a strategy – has its own separate set of results.

You can subscribe to receive updates as the backtest progresses, or unsubscribe when you no longer need them. The `tick` function is automatically called to process these updates.

You can request data about a specific strategy or generate a full report, which can then be saved as a markdown file in the `logs/walker` directory. It's also possible to clear the accumulated data, either for a single walker or for all of them.

## Class WalkerLogicPublicService

This service helps manage and run automated trading strategies, often called "walkers." It's designed to make sure your strategies have the information they need, like the name of the strategy, exchange, and data frame, automatically passed along.

Think of it as a helpful layer on top of the core walker logic, making it easier to keep things organized and consistent.

It lets you easily trigger the execution of your trading strategies by providing a symbol and context. This handles the complexities of setting up the environment for each strategy to run, like ensuring all the necessary data is available. Essentially, you give it a symbol, and it orchestrates the backtesting process.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService manages the process of comparing different trading strategies. It handles the execution and tracking of multiple strategies, essentially acting as a coordinator.

The service follows a specific workflow: it reports on the progress of each strategy as it finishes, keeps an eye on the best performance metric achieved so far, and then delivers a final report that ranks all the strategies involved.

It uses BacktestLogicPublicService behind the scenes to actually run the individual strategies.

The `run` method is your entry point – you provide it with the trading symbol, a list of strategies to compare, the metric you'll use for evaluation (like profit or Sharpe ratio), and some contextual information about the trading environment.

The `run` method provides updates as each strategy completes, letting you monitor the process in real-time.


## Class WalkerCommandService

WalkerCommandService acts as a central access point for walker-related functionalities within the system. It's designed to simplify how you interact with the walker logic, particularly when using dependency injection.

Think of it as a helpful layer that sits between you and the core walker operations.

This service has several key components it relies on, including services that handle validation of strategies, exchanges, frames, and the walker itself.

It also has a built-in validation process that's intentionally checked twice to ensure data integrity - it's a safety measure to prevent errors.

Finally, the `run` function allows you to initiate a comparison of a walker against a specific symbol, while also passing along important details like the walker's name, exchange, and frame. This lets the walker operate within a defined context.

## Class TimeMetaService

The TimeMetaService helps you keep track of the latest candle timestamps for your trading strategies. It ensures you always know the current time, even when you’re not actively running a trading tick.

Essentially, it remembers the last timestamp received for each combination of symbol, strategy, exchange, and frame. It’s like a quick reference guide to candle times.

If you're already in the middle of a trading tick, it uses existing information; otherwise, it will wait for a short time to get that timestamp. The service automatically updates itself after each tick, so you don't have to worry about manual updates.

You can clear this memory to reset it, either for a specific combination or everything at once. This is particularly important when starting a new trading test or strategy run to avoid using outdated timestamps.

## Class SystemUtils

SystemUtils helps keep backtest sessions separate from each other. It prevents one backtest from accidentally affecting another by temporarily disconnecting from the global event system. 

Essentially, it allows you to pause the event listeners for a backtest, run your test, and then easily resume the listeners afterward. 

The `createSnapshot` method is key to this – it takes a picture of the current event listeners so they can be perfectly restored once the backtest is complete. This ensures a clean and isolated testing environment.


## Class SyncUtils

SyncUtils helps you analyze and understand the lifecycle of your trading signals. It collects data from signal openings and closures, giving you insights into what’s happening with your strategies.

Think of it as a tool to monitor how your signals are performing – how many signals you're creating, how many are being closed, and all the details in between.

You can request statistics to see the overall numbers for a specific strategy and symbol.  It's like getting a quick summary of the signal activity.

Need more detail?  You can generate a comprehensive markdown report. This report provides a table showing all the signal events for a given symbol and strategy, including crucial information like entry/exit prices, take profit/stop loss levels, and profit/loss.

Finally, you can easily export these reports as markdown files to disk, which you can then share or keep for later review. The filenames are designed to be descriptive, making it easy to identify the report's contents.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals. It's like a detailed logbook that records every time a signal is created (when a limit order gets filled) and every time a signal is closed (when a position is exited).

This service listens for these events and carefully notes down all the important details, such as signal specifics and profit/loss information along with the reason for exiting. 

The information gathered is then stored for auditing and order management purposes. To prevent issues with accidentally logging the same events multiple times, it ensures only one subscription to the signal events is active at a time. 

You can start receiving these reports by subscribing, and stop them with an unsubscribe function. If you’re not subscribed, unsubscribing does nothing.

## Class SyncMarkdownService

This service helps you create and save reports about how signals are opening and closing during a backtest or live trading. It listens for these signal events and organizes them by symbol, strategy, exchange, and timeframe.

It then builds detailed reports in markdown format, showing the lifecycle of each signal, along with some statistics like total signals, opens, and closes. These reports are saved to disk for later review.

To start collecting data, you need to subscribe to the signal events. You can unsubscribe at any time to stop collecting data and clear all the accumulated information.

Each time a signal event happens (open or close), the service records it and adds it to the corresponding report. You can retrieve the accumulated data for a specific combination of symbol, strategy, exchange, and timeframe. It’s also possible to generate a full report in markdown, or directly save the report as a file. 

Finally, you can clear the collected data either for a specific signal combination or clear everything at once, effectively starting fresh.


## Class StrategyValidationService

The StrategyValidationService helps you keep track of and ensure the correctness of your trading strategies. Think of it as a central hub for managing strategy definitions.

It allows you to register new strategies, automatically checks if they exist before you use them, and verifies that any associated risk profiles and actions are set up correctly. 

To make things efficient, it remembers the results of its validation checks, so it doesn't have to repeat the work unnecessarily.

You can use the service to:

*   Add new strategies to its registry.
*   Validate a specific strategy to confirm it's properly configured.
*   Get a list of all strategies that have been registered.

The service relies on other services, a logger, a risk validation service, and an action validation service, to perform its detailed validation steps.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It's like a central hub for collecting and presenting data about your strategies' actions, such as closing positions, taking profits, or setting stop-loss orders.

You can use it to get statistical summaries of your strategy's behavior, showing you how often different actions occur. It can also create detailed markdown reports that list every event the strategy has triggered, including important details like the price, percentage values, and timestamps.

Furthermore, you can export these reports directly to files, making it easy to track performance over time and share results. The reports are organized by symbol, strategy, and timeframe, and can be customized to show only the columns you are interested in.


## Class StrategySchemaService

This service helps you keep track of different trading strategy blueprints, ensuring they're well-defined and consistent. It uses a secure system to store these blueprints, making sure they're easy to find and manage.

You can add new strategy blueprints using the `addStrategy()` function, and then retrieve them later by their name.

Before a new strategy blueprint is added, it's checked to make sure it has all the necessary components and is structured correctly.

If you need to update an existing strategy blueprint, you can use the `override()` function to make specific changes.

Finally, the `get()` function allows you to easily retrieve a strategy blueprint when you need it.

## Class StrategyReportService

This service is designed to keep a detailed, persistent record of actions taken by your trading strategies. Think of it as a detailed audit trail for your backtests. It's different from services that build reports in memory; this one writes each event – like canceling a scheduled order, closing a pending order, or taking partial profits – directly to a JSON file as it happens.

To start using it, you need to "subscribe" to the service.  Once subscribed, the service will capture key events and log them.  When you're finished with the logging, you need to "unsubscribe" to clean up and stop the logging process.

The service provides several specific functions to log different types of events:

*   **cancelScheduled:** Records when a scheduled order is cancelled.
*   **closePending:** Records the closing of a pending order.
*   **partialProfit:** Logs when a portion of the position is closed with a profit.
*   **partialLoss:** Logs when a portion of the position is closed at a loss.
*   **trailingStop:** Tracks adjustments to the stop-loss order (trailing stop).
*   **trailingTake:** Tracks adjustments to the take-profit order (trailing take).
*   **breakeven:** Records when the stop-loss is moved to the entry price.
*   **activateScheduled:** Logs a premature activation of a scheduled signal.
*   **averageBuy:** Records when a new average buy entry is added (useful for DCA strategies).

Each of these functions receives details about the event, including the symbol, context (strategy name, exchange, etc.), timestamp, signal ID, and relevant financial data like P&L, peak profit, and drawdown.

## Class StrategyMarkdownService

This service helps you track and report on what your trading strategies are doing during backtests or live trading. It essentially acts as a memory bank for important events like signals being canceled, orders being filled, or take-profit levels being adjusted.

Instead of writing each event to a file immediately, it holds them temporarily for a more efficient, batch-oriented reporting process. It uses a clever caching system to manage data for different symbols and strategies.

To start using it, you need to "subscribe" to begin collecting events. Events are automatically logged when things happen in your strategies. Then, you can use functions like `getData()` to get summary information, or `getReport()` and `dump()` to create nicely formatted markdown reports.  When you're done, "unsubscribe" to stop the data collection and clear everything.

There are functions to record various actions your strategy takes, like canceling scheduled signals, closing positions, setting take profits, and more.  You can retrieve all of the events for a specific symbol and strategy combination, or generate a full markdown report with customizable columns. The `dump()` function lets you save these reports to files with timestamped names for easy tracking.  You can also clear the temporary storage of events if needed.

## Class StrategyCoreService

This class, `StrategyCoreService`, is a central hub for managing trading strategies within the backtest-kit framework. It acts as a middleman, receiving requests and injecting necessary information (like the trading symbol, timestamp, and backtest settings) into the strategy's execution environment.

Think of it as a coordinator that handles all the behind-the-scenes work, making sure your strategies run smoothly and safely.

Here's what it does:

*   **Validation:** It validates strategies and their configurations to ensure they are set up correctly. This validation is cached to avoid repeated checks.
*   **Signal Retrieval:** It can fetch the current pending or scheduled signal for a symbol, crucial for monitoring things like stop-loss levels and expiration times.
*   **Position Information:** It provides detailed insights into a currently open position, like its overall cost, entry prices (including DCA history), partial close history, and profitability.
*   **State Management:**  It allows you to query and modify the state of active strategies, from checking if a strategy is stopped to canceling scheduled signals or closing positions.
*   **Simulation and Execution:**  It handles running strategies in backtesting mode and initiating live trading.
*   **Resource Cleanup:** It can clear cached strategies to free up resources when they're no longer needed.

Essentially, `StrategyCoreService` is the engine that powers the execution and monitoring of your trading strategies within the backtest-kit environment. It streamlines operations and provides a consistent interface for interacting with your strategies.

## Class StrategyConnectionService

This service acts as a central hub for managing strategy operations within the backtest kit. It intelligently routes method calls to the correct strategy implementation, ensuring that they're applied to the right symbol and strategy combination.

Think of it as a smart dispatcher—when you want a strategy to perform an action, this service figures out exactly *which* strategy is responsible and executes it. To optimize performance, it caches frequently used strategies, preventing redundant creation.

Here's a breakdown of how it works:

*   **Routing:** It handles requests for strategy actions (like `tick()` or `backtest()`) and makes sure they're directed to the right strategy instance.
*   **Caching:** It stores strategy instances in a cache to avoid repeatedly creating them, making the process faster.  The cache key takes into account exchange and frame specifics.
*   **Initialization:** It ensures the strategy is ready before processing any requests.
*   **Comprehensive Operations:** It manages both live trading (`tick()`) and historical simulation (`backtest()`) scenarios.

The service relies on several other connected services to properly function, including:

*   **Logging:** Manages logging and context information.
*   **Schema Management:** Handles strategy schema definitions.
*   **Risk & Exchange Connections:** Integrates with risk and exchange-related services.
*   **Time & Pricing Data:**  Provides access to time and price information.



The service provides a wide range of methods for interacting with strategies, including:

*   **Retrieving Signals:**  It can fetch active signals, scheduled signals, and details related to pending positions (like total cost, percent closed, and entry prices).
*   **Position Management:** Methods like `partialProfit`, `partialLoss`, and `averageBuy` allow for modifying and managing active positions.
*   **Control and Monitoring:**  It allows for stopping a strategy, clearing its cache, and checking its status.
*   **Validation:** It can validate potential actions (e.g., partial profit, average buy) before executing them.

## Class StorageLiveAdapter

The `StorageLiveAdapter` helps manage how trading signals are stored, giving you flexibility to choose different storage methods. It acts as a middleman, allowing you to easily switch between persistent storage (saving to disk), in-memory storage (keeping data only during the current session), or a dummy adapter (which does nothing – useful for testing).

You can pick your storage method using `usePersist`, `useMemory`, or `useDummy`, and the adapter handles the details of saving and retrieving signals. The `getInstance` property is a smart shortcut that builds the storage utilities only when needed and reuses them afterward, which helps with performance.

The adapter also provides methods like `handleOpened`, `handleClosed`, `findById`, and `list` to manage signals – it passes these actions on to whatever storage method you’ve selected.  The `clear` function is particularly useful when the environment changes between strategy runs, forcing a fresh start for the storage utilities. The `handleActivePing` and `handleSchedulePing` methods keep the `updatedAt` field of the signals up-to-date for active and scheduled signals, respectively.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how your backtest data is stored. It allows you to easily switch between different storage methods like persistent storage (saving to disk), in-memory storage, or even a dummy storage that doesn't actually save anything.

You can choose which storage method to use with convenience functions like `usePersist`, `useMemory`, and `useDummy`. It also handles events like signals being opened, closed, scheduled, or cancelled, relaying these to the currently selected storage adapter.

If you need to find a specific signal or retrieve a list of all signals, it provides methods for that too. Importantly, there's a `clear` function to ensure that if your working directory changes, a fresh storage instance is created, preventing potential issues across different backtest runs. Essentially, it decouples the storage logic from the core backtesting process, giving you a lot of control and flexibility.

## Class StorageAdapter

The StorageAdapter is the central piece for managing how your trading signals are saved and accessed. It automatically keeps track of signals as they come in, whether they're from a backtest or from a live trading scenario.

You can turn on signal storage by enabling it, which will subscribe to the signal emitters – but it's designed to only subscribe once, preventing unwanted duplicates.

Conversely, disabling signal storage unsubscribes from everything, and it’s perfectly safe to disable it multiple times if needed.

Need to find a specific signal? The `findSignalById` function lets you search for signals using their unique ID, looking in both backtest and live storage areas. 

If you want to see all the signals from your backtesting runs, use `listSignalBacktest`.  Similarly, `listSignalLive` displays all the live signals that have been recorded.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage the state of your trading strategies, allowing you to easily switch between different storage methods. Think of it as a flexible way to keep track of important data for each trading signal.

It offers several built-in storage options: a default file-based persistence (great for saving progress between restarts), an in-memory option (fast but not persistent), and a dummy adapter (useful for testing).

A key feature is that it remembers things like the peak percentage gain and how long a trade has been open, which is really handy for advanced strategies – particularly those involving LLMs – to automatically adjust trades based on specific criteria.

Here’s what you can do with it:

*   **`disposeSignal`**: Clears out old state data when a signal is finished.
*   **`getState`**: Retrieves the current state information.
*   **`setState`**:  Updates the state.
*   **`useLocal`, `usePersist`, `useDummy`**:  Quickly change the storage method being used.
*   **`useStateAdapter`**:  Lets you plug in your own custom state management logic.
*   **`clear`**: Clears the cache of stored states, essential when the base path changes.

The `StateLiveAdapter` is designed to be adaptable, making it easier to build and maintain robust trading strategies.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage the state information used during backtesting. It allows you to easily switch between different storage methods – keeping data only in memory, saving it to disk, or using a dummy adapter for testing purposes. This adaptability is key for experimenting with different backtesting scenarios and ensuring data integrity.

The adapter tracks metrics like peak percentage change and how long a position has been open, allowing you to implement rules, such as automatically exiting trades if they haven't met certain performance thresholds.

You can switch between storage methods using handy helper functions like `useLocal`, `usePersist`, and `useDummy`.  The `disposeSignal` method is important for cleaning up memoized data when a signal is finished, and `clear` is useful when the working directory changes, guaranteeing fresh data for each test. It's designed to work with various state instance implementations, making it a central piece for managing data throughout your backtesting framework.

## Class StateAdapter

The StateAdapter acts as a central hub for managing how your backtesting and live trading systems store and access data. It automatically handles cleaning up old data when signals are stopped, preventing issues caused by outdated information.

It uses a special method to ensure subscriptions only happen once, and provides ways to both turn state storage on and off.

You can retrieve the current state of a signal using `getState`, or update it using `setState`. Importantly, these functions intelligently direct operations to either your backtest environment or your live trading system based on the provided configuration.

## Class SizingValidationService

This service helps you keep track of and make sure your position sizing strategies are set up correctly. It acts like a central manager, keeping a record of all your sizing methods.

You can add new sizing strategies using `addSizing`, which registers them for use.

To ensure a sizing strategy exists before you use it, use the `validate` method.  It's designed to catch potential errors early on.

If you need to see a full list of all the sizing strategies you've registered, the `list` method provides that information. It remembers previous validation results to speed things up too.

## Class SizingSchemaService

The SizingSchemaService helps you manage and store sizing schemas, which define how much of an asset to trade. It uses a special registry to keep track of these schemas, ensuring they're all set up correctly.

You add new sizing schemas using `register` and can update existing ones with `override`.

To use a specific sizing schema, simply request it by name with `get`.

Before a sizing schema is added, a quick check (`validateShallow`) makes sure it has all the necessary information in the right format. This helps prevent errors later on.


## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, essentially figuring out your position size. It acts as a central hub, using a connection service to perform the actual calculations. This service is critical for both how strategies run and the tools available for users.

It manages several internal components:

*   A logger for tracking and debugging.
*   A connection service to handle the sizing calculations themselves.
*   A validation service to ensure the sizing request is valid.

The core function, `calculate`, is how you request a position size. You provide the parameters like risk tolerance and the context of the sizing request, and it returns the suggested size.


## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategy determines the size of each position it takes. It acts as a central hub, directing sizing calculations to the correct specialized sizing component based on its name.

Think of it like a switchboard – you tell it which sizing method you want to use, and it connects you to the right expert.

To improve speed and efficiency, it remembers which sizing components it's already created, so it doesn't have to build them again.

When your strategy needs to calculate a position size, it uses this service. The service handles the details of choosing the right sizing method, applying risk management rules, and ultimately returning the calculated position size. 

If your strategy doesn't have a custom sizing configuration, you’ll use an empty string as the sizing name.

## Class SessionLiveAdapter

This framework component, `SessionLiveAdapter`, provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub where your trading strategies can read and write information, and this hub can be configured to store that data in different ways.

You can easily switch between storage options: keep data only in memory for testing, use a persistent file-based system to survive restarts, or even use a dummy adapter to simply discard data. The adapter uses a default file-based storage but allows for swapping in alternatives.

It remembers which adapter you're using based on the symbol, strategy name, exchange, and frame, ensuring you're always working with the correct data. If your project directory changes, the `clear` function can be used to refresh these settings. This allows for robust, configurable data management during your live trading runs.

## Class SessionBacktestAdapter

This component helps manage and store data during backtesting. Think of it as a flexible system for handling session data – the information that changes as your trading strategy runs. 

It allows you to easily switch between different ways of storing this data, such as keeping it only in memory (fast but temporary), saving it to disk for later use, or even discarding it entirely for testing purposes. 

You can quickly change how the data is handled with convenient commands like `useLocal`, `usePersist`, and `useDummy`.  It intelligently caches data to avoid unnecessary creations. If you need to use a custom way of managing data, you can even plug in your own adapter.  Finally, `clear` can be used to refresh the cached data if the program’s working directory changes.

## Class SessionAdapter

The SessionAdapter is the central hub for handling data storage during both simulated backtesting and live trading. It intelligently directs data requests and updates to either the backtest storage or the live trading storage, depending on whether you're running a simulation or a real-time operation. 

You can use `getData` to retrieve the current value of a signal, providing details like the symbol, strategy name, exchange, frame, and a timestamp. Similarly, `setData` lets you update a signal’s value, ensuring the update is saved to the correct storage location. Essentially, it simplifies data management by abstracting away the difference between backtesting and live environments.

## Class ScheduleUtils

This class, `ScheduleUtils`, helps you keep track of and report on scheduled signals – think of it as a way to monitor how your trading strategies are sending out orders. It’s designed to be easy to use, acting as a central place to get information and generate reports about those signals.

You can request data about signals for specific trading symbols and strategies to see how they're performing. 

It also creates clear, readable reports in Markdown format, which you can then share or store.

Finally, it offers the ability to save these reports directly to your computer's file system. The class is always available in one single instance, making it very convenient to use.

## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing. It monitors these signals and records important events like when they're scheduled, when they start, and when they're cancelled.

Think of it as a detailed logbook for your scheduled orders, noting how long it takes from the initial schedule to when the order actually executes or is cancelled.

It uses a logger to provide debugging information and works by listening for signal events and then writing those events to a database. To use it, you'll subscribe to receive events, and when you’re finished, you can unsubscribe to stop the monitoring. It’s designed to prevent duplicate subscriptions to avoid issues.

## Class ScheduleMarkdownService

This service automatically creates reports detailing scheduled and cancelled trading signals. It keeps track of these events for each strategy you're using.

It works by listening for signal events and then organizing them into tables, providing useful insights like cancellation rates and average wait times. 

These reports are saved as markdown files, making them easy to read and share, usually found in a logs folder under a "schedule" directory.

You can subscribe to receive these signal events, and the service will handle the rest. It also allows you to fetch data or reports for a specific trading setup or completely clear all accumulated data if needed.

## Class RiskValidationService

This service helps you keep track of and verify your risk management setups. Think of it as a central place to register different risk profiles and make sure they're available before you need them.

It allows you to add new risk profiles using `addRisk`, ensuring they’re known to the system.  You can then use `validate` to confirm that a specific risk profile exists before proceeding with any actions that depend on it. 

To see what profiles you've registered, you can call `list`, which returns a comprehensive list of all the risk schemas currently managed. The service is also designed to be efficient; it remembers validation results to avoid unnecessary checks.

## Class RiskUtils

The RiskUtils class offers tools for examining and reporting on risk rejection events, helping you understand and address potential issues in your trading system. It acts as a central point for accessing and summarizing data collected about rejections, primarily by pulling information from the RiskMarkdownService.

You can use it to get statistical summaries of rejections, broken down by symbol, strategy, and other factors. It can also create detailed markdown reports, formatted as tables showing individual rejection events with key details like price, position, and reason.

Finally, the class lets you easily save those reports directly to files, automatically creating the necessary directory structure with filenames that clearly identify the symbol and strategy involved. Think of it as your go-to resource for digging into and documenting what's going wrong with your risk management.

## Class RiskSchemaService

The RiskSchemaService helps you manage and store risk schemas in a type-safe way. It uses a registry to keep track of your risk profiles, ensuring consistency and preventing errors. 

You can add new risk profiles to the registry using the `addRisk()` method (represented by `register` here) and retrieve existing ones by their names using `get()`. 

Before adding a risk profile, the service performs a quick check with `validateShallow()` to make sure it has all the essential information in the correct format. 

If a risk profile already exists, you can update it using `override()`, which allows you to modify specific properties without replacing the entire schema. 

The service also has internal components like a logger (`loggerService`) to help track its activity.


## Class RiskReportService

The RiskReportService is designed to keep a record of when trading signals are rejected by the risk management system. Think of it as an audit trail for risk decisions.

It listens for these rejections and saves them – including why they were rejected and details about the signal itself – into a database.

You can tell it to start listening for these rejection events, and it will automatically stop listening if you need it to. It also makes sure you don't accidentally subscribe multiple times, which could cause problems. 

The service relies on a logger to provide some debugging information.

## Class RiskMarkdownService

This service is designed to automatically create and save reports detailing rejected trades due to risk management rules. It listens for these rejection events and organizes them, creating easy-to-read markdown tables that summarize the rejections for each symbol and trading strategy.

Think of it as an automated reporting system that helps you understand why trades are being rejected and identify potential issues.

Here's a bit more detail:

*   It keeps track of all rejection events, separating them by symbol and strategy.
*   It generates reports in a standard markdown format, including statistics about the rejections.
*   The reports are saved to disk so you can review them later.
*   It’s designed to be flexible, allowing you to clear old data or focus on specific symbol/strategy combinations.
*   It uses a "storage" system to keep data isolated for each symbol, strategy, exchange, frame and backtest combination.

You can subscribe to receive these rejection events, and when you’re done, you can unsubscribe. The `dump` method allows you to save the generated reports directly to your file system.

## Class RiskGlobalService

This service manages risk-related operations, acting as a central point for validating risk limits. It works closely with a connection service to ensure that trading actions comply with predefined risk parameters.

Several components help with this process: a logger for tracking activity, services for validating risk configurations, exchange details, and trading frames. The `validate` function ensures risk configurations are correct and avoids repeated checks for the same scenarios.

The `checkSignal` function determines if a trading signal is permissible based on risk limits, while `checkSignalAndReserve` provides a safe way to validate signals and temporarily allocate resources, preventing conflicts when multiple trading attempts occur simultaneously. 

Furthermore, there are methods to record open signals (`addSignal`) and close signals (`removeSignal`) within the risk management system. Finally, the `clear` function allows for resetting risk data, either for a specific risk instance or globally.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently connects different parts of your system to the right risk management components.

It's designed to route risk-related operations to the correct "ClientRisk" instance, making sure that risk assessments are accurate and consistent. To speed things up, it remembers previously used risk management components, avoiding repetitive work.

Here's a breakdown of what it does:

*   **Risk Routing:** It uses a `riskName` to direct risk assessment requests to the appropriate component. If you don't specify a `riskName` (like for strategies without specific risk settings), it defaults to an empty string.
*   **Caching:** It saves previously used risk management components to avoid recreating them, which improves performance.
*   **Signal Validation:** It verifies whether a trading signal is safe to execute by checking against predefined risk limits like portfolio drawdown and exposure.
*   **Concurrency Control:** `checkSignalAndReserve` provides a way to validate signals and reserve resources safely, preventing conflicts in concurrent trading scenarios.
*   **Signal Management:** It provides methods to register and remove trading signals within the risk management system.
*   **Cache Clearing:**  You can clear the cached risk management components if needed.

The service relies on other services like `RiskSchemaService`, `TimeMetaService` and `ActionCoreService` and includes logging capabilities for monitoring and debugging.

## Class ReportWriterAdapter

This component provides a flexible way to manage and store your trading data, like backtest results or live trading information. It acts as a bridge between your trading strategies and different storage options, allowing you to easily switch between them.

The system automatically keeps track of which storage method is being used for each type of report (e.g., backtest results, walker data), ensuring you don't accidentally mix up your data. It starts with a default JSONL storage option, which appends data to JSONL files.

You can customize the storage method by providing your own adapter. The adapter remembers these settings, so you don’t have to reconfigure them every time. It also only creates storage instances when it first needs to write data, which optimizes performance.

For testing or debugging, you can switch to a "dummy" adapter that ignores all data writes, or revert back to the default JSONL adapter. If your working directory changes, it’s a good idea to clear the adapter cache to ensure fresh storage instances are created.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed reports. Think of it as a way to turn on and off specific data logging for things like backtests, live trading sessions, or performance analysis.

You can selectively enable these logging features – for instance, just turning on logging for backtests without affecting other areas. When you enable a feature, it starts recording events and writing them to JSONL files, which contain helpful information like timestamps and other details. It’s crucial to remember to stop these processes later to avoid resource problems, which ReportUtils helps with.

Conversely, you can disable logging for specific services without impacting others, allowing you to focus on the data you need. This is done by simply unsubscribing from those services. The `enable` method provides a way to subscribe to multiple services simultaneously and provides a function to unsubscribe from all of them at once.


## Class ReportBase

This class provides a way to efficiently log trading events to JSONL files, making it easier to analyze your backtests later. It’s designed to write data incrementally, one event at a time, to a single file for each report type. The system handles potential delays and errors gracefully, ensuring data isn't lost and processes don't get stuck.

You can specify where the files are saved and what kind of report you're creating (like order events, trade executions, or portfolio snapshots).

It automatically sets up the necessary directories and handles writing the data in a structured format, including metadata like the symbol, strategy, and exchange involved. The `waitForInit` method initializes everything once, and the `write` method is how you add new event data to the log file. The writing process is also designed to be reliable, with timeout protections and backpressure management to avoid overwhelming the system. The system provides a method to search this logged data with various criteria like symbol, strategy, exchange, frame, signalId and walkerName.

## Class ReportAdapter

The ReportAdapter helps you organize and store your trading data in a structured way, allowing for flexible analytics and logging. It acts as a central point for managing how your reports are stored, letting you easily switch between different storage methods without changing your core trading logic.  It remembers which storage method is active, ensuring consistency across your tests.

You can customize the storage method by providing your own adapter, or use the built-in options like the default JSONL-based storage, or even a dummy adapter for testing when you don’t need to save data. It initializes storage only when needed and can also clear its memory if you’re changing the location where your reports are saved. This makes it great for keeping track of what's happening during your backtests and analyzing your trading decisions.

## Class ReflectUtils

This utility class, `ReflectUtils`, provides a centralized way to track key performance metrics for your trading positions, like profit, drawdown, and duration. It's designed to work seamlessly whether you're live trading or running backtests.

Think of it as a reporting tool that gives you insights into how your strategies are performing. It pulls data related to P&L, peak profit, and drawdown, and it handles all the behind-the-scenes calculations for you.

Here's a breakdown of what it can do:

*   **Real-time Position Metrics:** You can retrieve data like unrealized P&L in percentage or dollar terms, the highest profit achieved, and the maximum drawdown experienced.
*   **Timing Information:** It lets you know how long a position has been active, when the best profit was recorded, and how long it’s been since the worst loss.
*   **Distance Calculations:** It calculates the difference between current prices and the highest profit or deepest drawdown points, expressed as either percentage or dollar values.
*   **Singleton Instance:** `ReflectUtils` is a singleton, meaning you'll only ever have one instance of it, making it easy to access.
*   **Backtest Support:** It works for both live and simulated trading scenarios.
*   **Context Awareness**: Requires context like strategy, exchange and frame name to retrieve the correct data.



Essentially, `ReflectUtils` simplifies the process of analyzing your strategies' performance and provides critical data for evaluation.

## Class RecentLiveAdapter

This component manages recent trading signals, allowing you to choose where that data is stored – either persistently on disk or in memory. It provides a flexible way to work with signals, letting you easily switch between storage methods as needed.

The system keeps track of a single, cached instance of your chosen storage method for efficiency.  You can change which storage method is used with functions like `usePersist` (for disk storage) and `useMemory` (for in-memory storage), with the default being persistent storage.

You can also provide your own storage implementation using `useRecentAdapter`.

It offers methods to retrieve the most recent signal, calculate how long ago a signal was created, and react to "active ping" events, all by forwarding requests to the currently selected storage adapter.  If the environment changes (like when running different strategies), you can clear the cached storage instance using `clear` to ensure a fresh start.

## Class RecentBacktestAdapter

This component provides a flexible way to manage and access recent trading signals, allowing you to choose between storing them in memory or persistently on disk. It acts as a central point for interacting with the signal storage, letting you swap out different storage methods easily.

Think of it as an adapter pattern – you can plug in different storage solutions without changing the core logic that uses them. By default, it uses in-memory storage for quick access.

You can switch between in-memory and persistent storage using simple methods like `useMemory()` and `usePersist()`.  The `clear()` function is helpful for refreshing the storage connection when your project's working directory changes. The `getInstance` property makes sure that storage operations are efficient by creating the storage utility instance only once.

## Class RecentAdapter

The RecentAdapter manages how recent trading signals are stored and accessed, working for both backtesting and live trading environments. It automatically keeps track of signals by listening for updates and provides a simple way to get the most recent signal for a specific trading context. 

To prevent unnecessary subscriptions, it ensures only one subscription happens at a time. You can easily turn this storage on or off, and it's safe to turn it off multiple times without causing problems.

When you need to find the newest signal, `getLatestSignal` looks first in your backtest data and then in live data.  It’s designed to avoid "look-ahead bias" – it won't return signals that haven't happened yet based on the specified time.

Finally, `getMinutesSinceLatestSignalCreated` tells you how much time has passed since the most recent signal appeared, also respecting that look-ahead bias. It’s useful for understanding how frequently signals are being generated.

## Class PriceMetaService

PriceMetaService helps you get the latest market prices for your trading strategies, even when you're not actively executing a trade. It keeps track of prices for each symbol, strategy, exchange, frame, and backtest combination, updating them as new ticks come in.

Think of it as a central price tracker, ensuring you have the right information whenever you need it, like when a command is triggered outside of the usual trading flow. If a price isn't immediately available, it'll wait a short time to see if it arrives, preventing errors.

It's designed to be a clean and efficient way to access prices, with the ability to clear out old price data to keep things fresh. The service automatically manages the price tracking, so you don't have to worry about setting it up yourself. You can either clear prices for a specific combination or clear all of them at once, which is especially useful when starting a new backtest or trading session.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade, using different strategies. It’s a collection of tools to calculate position sizes, like determining how many shares or contracts to buy or sell. 

Each calculation method—fixed percentage, Kelly Criterion, and ATR-based—is implemented as a function within this class. These functions not only perform the calculations but also make sure the information you provide is suitable for the specific sizing technique. 

For example, the Kelly Criterion needs your win rate and win-loss ratio, while the ATR-based method requires the Average True Range. The class handles checking these inputs so you can be more confident in your position sizing.


## Class Position

The Position class helps you figure out where to place your take profit and stop loss orders. It intelligently adjusts based on whether you're going long (buying) or short (selling) an asset.

It offers two main strategies for calculating these levels:

*   **moonbag:** This calculates a take profit level that's a fixed percentage above (for long positions) or below (for short positions) the current price. Think of it as a simple way to lock in some gains.

*   **bracket:** This allows you to define your own custom take profit and stop loss percentages to fit a more specific trading plan. It provides greater flexibility in managing risk and reward. 

The `moonbag` and `bracket` functions take information about your position—like current price, your stop loss percentage, and whether you're long or short—and return the calculated take profit and stop loss prices.

## Class PersistStrategyUtils

This utility class helps manage how a strategy’s state is saved and restored, especially when dealing with delayed actions like queueing trades or signals. It ensures that each strategy's state is persisted correctly, even if things go wrong. 

It uses a clever system to create storage instances for each strategy, symbol, and exchange, creating them only when needed.  You can customize how this storage works by providing your own 'constructors' to handle the saving and loading of data.

The `readStrategyData` method retrieves this saved data, while `writeStrategyData` saves any changes. It also provides ways to switch between different storage methods, like using files, a default JSON implementation, or even a dummy version that does nothing for testing purposes.

If you need to completely refresh the storage, you can clear the cache. This is useful when the working directory changes during testing or development.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file. It's designed to be reliable, even if your program crashes unexpectedly. 

It essentially manages the storage of your strategy's data, using a specific identifier ("strategy") within a defined storage area. 

Here's a breakdown:

*   **How it works:** It automatically handles saving and loading your strategy's data to a file.
*   **Initialization:** You need to tell it when to initially set up the storage (using `waitForInit`).
*   **Saving data:**  `writeStrategyData` lets you save the current state of your strategy, or clear it entirely.
*   **Loading data:** `readStrategyData` retrieves the saved strategy state, or returns nothing if there's no data.
*   **Context-aware:** It associates the storage with a specific trading symbol, strategy name, and exchange.



The `STORAGE_KEY` is a constant identifier that tells the system where to find or store strategy data. The `_storage` property is the actual file system component being used to persist your data.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, particularly for backtesting and live trading. It ensures that each signal's information is stored as a separate file, making it organized and easy to manage.

The system intelligently caches storage instances to avoid repeatedly creating them, which improves performance. 

You can customize how these storage instances are created using a constructor, and it offers a way to switch between different storage methods, like using a standard file system, a dummy storage for testing, or even plugging in your own custom storage solution.

This is important for keeping track of signal states even if the application crashes or restarts. The `readStorageData` and `writeStorageData` functions provide a safe and reliable way to access and update this stored data. The `clear` function allows you to refresh the storage cache when necessary.

## Class PersistStorageInstance

This class provides a way to store your trading signals persistently using files on your computer. It's designed to be reliable, even if your program crashes unexpectedly.

Each trading signal is saved as its own JSON file, making it easy to manage and identify them individually. When you need to retrieve all your signals, it scans through all the available files. 

The constructor lets you indicate whether you're in a backtesting mode. 

You can use `waitForInit` to make sure the storage is ready before you start working with it.  `readStorageData` fetches all your saved signals. `writeStorageData` saves a collection of signals, ensuring each one is written safely.


## Class PersistStateUtils

This utility class, `PersistStateUtils`, helps manage how your trading strategies save and load their data. It keeps track of different storage locations based on identifiers, making sure each strategy's data stays separate and organized.

You can think of it as a central place to control how your state is persisted, allowing for flexibility in storage methods.

It's designed to make sure your strategy’s state survives unexpected interruptions like crashes, automatically setting up the necessary storage.

Here's a quick breakdown of what it offers:

*   **Smart Storage:** It remembers which storage locations are already in use, so you don’t have to set them up every time.
*   **Customizable:** You can swap out the default storage method with your own, tailoring it to your specific needs.
*   **Easy Clean-up:**  Functions are provided to clear out old storage or clean up after a strategy is finished.
*   **Testing Mode:** A 'dummy' mode lets you simulate state persistence without actually saving anything, which is useful for testing.

When your strategy needs to save information, this class takes care of the details, so you can focus on the trading logic.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a way to save and load state data persistently, typically to a file. Think of it as a reliable container for keeping track of your trading strategy's progress.

It's designed to work with a specific signal and a bucket name, essentially creating a unique storage space for each combination. The bucket name acts like an identifier for the data being stored.

The `waitForInit` method makes sure the storage is ready before you try to read or write anything.

Reading and writing state are straightforward with `readStateData` and `writeStateData` methods, each using that bucket name to locate the correct data.  The `writeStateData` method also accepts a timestamp to indicate when the data was last updated.

Finally, `dispose` doesn’t actually do anything itself; it relies on a separate utility function to clean up related resources.

## Class PersistSignalUtils

This class helps manage how signal data is saved and retrieved, ensuring that each trading strategy has its own persistent storage. It's designed to be reliable, even if your application crashes unexpectedly.

The `PersistSignalUtils` system provides a way to customize how this storage works, allowing you to plug in different adapters for various storage needs. 

It automatically handles creating and managing these storage instances, making it easy to work with. You can also clear the existing storage if needed, like when the working directory changes.

The `readSignalData` method lets you retrieve previously saved signal data, while `writeSignalData` allows you to update that data, or even clear it entirely. There are also options to easily switch between different storage methods, such as using files, a dummy implementation for testing, or a custom solution.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, is designed to reliably store and retrieve signal data, acting as a bridge between your trading strategy and persistent storage. It's built to be robust, handling situations where your application might crash unexpectedly.

It combines file-based storage with techniques to ensure data integrity, making sure your signals are saved correctly even if something goes wrong. Each signal is uniquely identified by its symbol, the name of the strategy using it, and the exchange involved, keeping everything organized.

The `waitForInit` method sets up the initial storage. The `readSignalData` method fetches the signal data associated with a specific symbol, while `writeSignalData` saves a signal's data (or clears it if you need to remove it). Essentially, this class provides a safe and predictable way to manage your signal data across sessions.

## Class PersistSessionUtils

This class provides tools for safely saving and loading session data during your trading strategies. Think of it as a way to remember what your strategy learned between runs, like important configurations or intermediate results.

It manages these saved sessions in a structured way, creating a unique storage location based on your strategy's name, the exchange it's trading on, and a specific "frame" or snapshot in time. 

You can easily swap out how the data is stored, whether it's to a file, a dummy adapter for testing, or a custom solution. The system automatically handles creating and managing these storage locations, and it ensures that writing and reading data happens reliably.

It also has a way to clear out old data and clean up sessions when they're no longer needed, keeping things tidy and preventing issues.  Essentially, it helps to preserve your trading strategy's state across multiple executions.

## Class PersistSessionInstance

This class provides a way to save and load data associated with a specific trading strategy and exchange, persisting it to a file. Think of it as a way to remember the state of your backtest.

It uses a unique identifier, `frameName`, to organize this data within a larger storage system.

The `waitForInit` method ensures that the storage is ready before you try to use it.

`readSessionData` retrieves previously saved data, while `writeSessionData` saves the current state.

Finally, `dispose` doesn’t do anything directly; it relies on a separate utility function to handle any cleanup required, like clearing cached data.


## Class PersistScheduleUtils

This utility class helps manage how scheduled signals are saved and loaded, especially for strategies that need to remember their planned actions. It makes sure each strategy has its own dedicated storage space for these signals, and it’s designed to be reliable even if there are unexpected interruptions.

You can customize how these signals are stored – for example, using files, a database, or even a dummy system that doesn't actually save anything. The class automatically handles creating these storage spaces when needed and ensures changes are written safely.

If you want to change the storage method, you can use the `usePersistScheduleAdapter` method to specify a custom storage constructor.  You can also easily revert to a default file-based storage using `useJson` or use a dummy adapter for testing purposes with `useDummy`.  If your program's working directory changes, you'll need to clear the cache using `clear` to ensure everything loads correctly. Reading data happens on first access and writing works similarly to initialize and write the signal information.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, helps reliably store and retrieve schedule data for your trading strategies. It's designed to work with file-based storage, ensuring your data is saved safely even if things go wrong. 

Think of it as a dedicated container for a specific trading strategy's schedule, identified by its symbol (the asset being traded), the name of the strategy, and the exchange it operates on.

It handles the underlying file storage for you, ensuring that writes happen securely.

Here's a quick rundown of what you can do with it:

*   It initializes the storage to get things started.
*   It reads existing schedule data, looking for signals associated with a particular symbol.
*   It allows you to write new schedule data or clear out existing data, again using the symbol for identification.


## Class PersistRiskUtils

This class helps manage how active trading positions are saved and loaded, especially for risk management. It keeps track of position data and makes sure it's stored reliably.

It intelligently creates storage instances based on the risk profile being used, avoiding unnecessary creations.

You can customize how this storage works by providing your own storage constructors.

The `readPositionData` method retrieves previously saved active positions, and `writePositionData` saves the current positions. These operations happen in a safe and consistent manner.

If you need to change the storage mechanism, functions like `usePersistRiskAdapter`, `useJson`, and `useDummy` allow you to switch between different storage types, including using a custom adapter or a dummy instance for testing.

The `clear` function is useful to reset the stored instances when the working directory changes.

## Class PersistRiskInstance

This class provides a way to save and load trading positions persistently, ensuring your backtesting results aren't lost. It's designed to work reliably even if your program crashes unexpectedly. 

It essentially acts as a manager for your position data, automatically handling the details of saving it to a file. The data is stored under a specific, predefined name ("positions") to keep things organized.

Here's a breakdown of what it does:

*   It initializes the storage location for your position data.
*   It retrieves the saved position data from the storage file.
*   It saves the current position data back to the storage file.

The `riskName` and `exchangeName` properties help identify the context of the data being stored, making it easy to manage data from different sources. The `STORAGE_KEY` constant is a fixed identifier used internally.

## Class PersistRecentUtils

This class, `PersistRecentUtils`, helps manage how recent trading signals are stored and retrieved, ensuring they’re handled consistently across different scenarios. It’s designed to work behind the scenes in backtesting and live trading environments.

It keeps track of these signal instances based on a combination of factors like the traded symbol, the strategy being used, the exchange involved, and the timeframe.

The class automatically handles the storage, using a system that remembers which storage method is active and only creates a storage instance once for each unique combination of those factors.  You can even swap out the storage method, allowing you to use a file-based system, a simple dummy system for testing, or provide your own custom storage solution.

The `readRecentData` method fetches the latest signal, and `writeRecentData` saves a new one.  These operations are designed to be safe, even if there are unexpected interruptions.

If your working directory changes, you'll need to manually clear the cached storage to ensure data integrity.

## Class PersistRecentInstance

This class helps you save and load the most recent trading signal data for a specific strategy and exchange. It's designed to work with files, making sure the data is written reliably.

Each instance focuses on a particular symbol (the asset being traded), a strategy name, an exchange, a frame (like a timeframe), and whether it's a backtest or live trading scenario.

The class automatically manages the underlying file storage, keeping things organized. 

You can use `waitForInit` to ensure storage is ready before you start, and `readRecentData` to retrieve the latest signal data.  `writeRecentData` is used to save new data, associating it with the specific symbol for later retrieval.


## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and safely store information about partial profits and losses for trading strategies. It’s designed to be reliable even if things go wrong, ensuring your strategy's progress isn't lost.

The system remembers which storage method to use for each trading symbol and strategy, so you don't have to worry about managing those details yourself. You can even customize how the data is stored if you need to, by providing your own storage adapter.

It handles reading and writing partial data in a way that's designed to be safe and consistent.

If you need to switch back to a simple file-based storage or just want to test things out without actually saving data, there are convenient options for that as well. The system cleans up its temporary data when necessary, especially when the working directory changes.

## Class PersistPartialInstance

This class helps you save and load pieces of data related to your trading strategies, particularly useful when dealing with incomplete or temporary information. It's designed to work with files, making sure your data is stored reliably.

It remembers three key pieces of information: the symbol you’re trading, the name of your strategy, and the exchange you’re using.

The class uses a unique identifier (signalId) to organize data and ensures that writing data happens safely, even if there are interruptions.

To get started, it needs to be initialized with the symbol, strategy name, and exchange name.

You can use `waitForInit` to make sure the storage is ready before you start saving anything.

`readPartialData` lets you retrieve any saved partial data associated with a specific signal, and `writePartialData` allows you to store new partial data. Essentially, it provides a convenient way to manage temporary data associated with your trading signals.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved, particularly for backtesting and live trading environments. It provides a way to store each notification as a separate file, identified by a unique ID, ensuring reliable and safe data handling even if the system crashes.

It uses a clever system of memoization, meaning it only creates one storage instance per environment (backtest or live) to optimize performance.

You can customize how notifications are persisted by providing your own storage constructor, or you can easily switch back to the default file-based storage or a dummy storage that doesn't actually save anything – useful for testing.

The `readNotificationData` and `writeNotificationData` functions handle reading and writing notification information, and they automatically set up the necessary storage if it's not already available.

If you need to refresh the storage, such as when the working directory changes, `clear` will reset the memoization and force a new instance to be created.

## Class PersistNotificationInstance

This class provides a way to save and load notification data persistently, using files on your computer. It’s designed to be reliable, even if your program crashes unexpectedly. 

Each notification is stored as its own JSON file, making it easy to manage individual updates. The system reads all these files when loading data.

You can control whether this feature is used during backtesting scenarios with a simple boolean setting. The underlying file storage mechanism is handled automatically. 

The `waitForInit` method prepares the storage, and `readNotificationData` retrieves all stored notifications. Finally, `writeNotificationData` saves a collection of notifications, assigning each one a unique identifier for easy access.


## Class PersistMemoryUtils

This utility class helps manage how trading memory data is saved and loaded persistently. It intelligently caches storage instances, making sure you don't create unnecessary files or slow down your backtesting process. 

You can customize how these memory instances are created, allowing for different storage solutions. The class also provides methods to read, write, and delete memory entries, all while handling potential errors gracefully. 

It offers a way to check if a specific memory entry exists before attempting to read it, and you can clear the cache when needed, for instance, when the working directory changes. There's also a handy function to list all stored entries for rebuilding indexes. Finally, it provides built-in options to use a default JSON-based storage or even a dummy instance for testing purposes.

## Class PersistMemoryInstance

This class provides a way to store and retrieve data persistently, like saving information to a file. It’s designed to work with the backtest-kit framework and specifically manages data related to a particular signal and bucket. 

Think of it as a manager for saving and loading "memory" – data that needs to be kept around between different parts of the system.

It handles saving data to a file, ensuring that changes are written completely. When data isn’t needed anymore, it doesn’t actually delete it; instead, it marks it as removed, which allows for easy recovery if needed.  You can check if data exists, read specific entries by ID, write new data, and list all the available data.  Importantly, this class doesn't handle cleaning up the underlying memory cache; that's taken care of by another part of the system.

## Class PersistMeasureUtils

This class helps manage cached data from external APIs, ensuring the data is saved reliably and consistently. It creates specialized storage areas for data, organized by a combination of timestamp and symbol.

You can customize how this caching happens by providing your own storage solutions. The class automatically handles reading, writing, and even soft-deleting data, making sure the process is safe even if the system crashes.

For testing or development, you can switch to a "dummy" adapter that doesn't actually store anything. 

If your working directory changes between strategy runs, you'll need to clear the cached storage to avoid issues. You can also use built-in options to switch back to a standard file-based storage or a simple dummy.

## Class PersistMeasureInstance

This component handles saving and retrieving measure data, essentially acting as a persistent storage system for your trading strategies. It's designed to be reliable, ensuring data is written safely and consistently to a file.

Data is managed within a "bucket," which acts as a logical grouping for your measure data. 

You can read specific entries using their keys, and if an entry is no longer needed, it's not actually deleted – instead, it's marked as removed, keeping the file intact but excluding it from active use. 

The `listMeasureData` function provides a way to see only the valid, non-removed data entries.


## Class PersistLogUtils

This class helps manage how your log data is saved and retrieved. It uses a cached copy of the log instance to make things efficient. You can even customize how the logs are stored by swapping out the default storage mechanism for your own adapter.

The system automatically handles reading and writing log entries, making sure that updates are reliable. Each log entry is stored as a separate file, and the whole process is designed to be safe even if the system crashes. 

You can easily change the persistence method, for example, to use a default file-based storage, a JSON-based method, or even a dummy method that does nothing. The cached instance is reset when you change persistence methods or when the working directory changes. This ensures that you're always using the correct storage configuration.

## Class PersistLogInstance

This class helps you store your trading log data persistently, like saving it to a file so you don't lose it. It's a default way to make sure your logs are saved reliably.

Each log entry gets its own individual file, making it easy to manage and access specific entries. The system reads the logs by looking at a list of all the files it’s managing.

Importantly, it only *adds* to the logs – it won’t overwrite anything already there. This is a safeguard against data loss in case of unexpected interruptions. The process is designed to be safe even if your system crashes during storage.

You can use `waitForInit` to make sure the storage area is ready before you start writing logs. `readLogData` pulls all the existing log entries, and `writeLogData` adds new entries to the log, avoiding overwrites.

## Class PersistIntervalUtils

This component manages persistence for tracking when specific time intervals have "fired" within your backtesting process. It essentially keeps a record of which intervals have already occurred.

It stores these records as files within a designated directory structure, allowing you to prevent repeated actions for the same time period.

You can customize how this persistence works by providing your own storage mechanisms, such as using a file-based system, a JSON adapter, or even a dummy adapter for testing purposes where no actual storage happens.

The framework lazily initializes storage for each time period (bucket) only when it's first needed.

Functions are available to read, write, and delete these interval markers, as well as to clear the internal cache if the working directory changes. You can also iterate through all markers for a given time period to see which intervals have already been processed.

## Class PersistIntervalInstance

This class provides a way to store and manage data related to trading intervals using files. It acts as a reliable record-keeper, ensuring your trading logic can consistently track and react to time-based events.

The system uses a designated "bucket" to organize these interval records. Data is saved as JSON files, and a special "removed" flag allows for soft deletion – essentially marking a record as inactive without permanently deleting it. This lets your trading framework retry operations if a marker appears to have been missed.

Here's a breakdown of how it works:

*   **Initialization:** `waitForInit` sets up the file storage for the bucket.
*   **Reading Data:**  `readIntervalData` retrieves a specific interval record; if the record is missing or has been soft-deleted, it returns nothing.
*   **Writing Data:** `writeIntervalData` creates or updates an interval record.
*   **Soft Deletion:** `removeIntervalData` marks a record as deleted without actually removing the file, allowing for retries.
*   **Listing Data:** `listIntervalData` provides a way to iterate through all active (non-deleted) interval records within the bucket.


## Class PersistCandleUtils

This class helps manage a persistent cache of historical candle data, essentially saving and loading it from files on your computer. Each candle's data is stored in its own file, organized by the exchange, symbol, timeframe, and timestamp.

It’s designed to be efficient; it only loads cached data if the number of files matches what's expected, and it automatically handles refreshing the cache when needed. It also guarantees that writes to the cache happen reliably.

You can customize how the cache is stored by providing your own way of creating candle instances, or you can revert to the standard file-based approach or even use a dummy implementation for testing. The `clear` method is useful when you're restarting your strategy because it resets the cache.

## Class PersistCandleInstance

This class provides a way to persistently store candle data, like opening prices, highs, lows, and volumes, for a specific trading symbol and timeframe. It essentially acts as a file system-based cache for this data.

Each candle's data is saved as a separate JSON file, making it easy to retrieve individual candles. If a candle's timestamp isn't found, it's treated as a cache miss, meaning the system needs to fetch it from the original source.

When saving data, the system intelligently skips any incomplete candles, which are those that haven't yet reached their closing time, and avoids overwriting existing data.  This ensures a clean and consistent cache of fully completed candles.

The `waitForInit` method ensures the underlying storage is ready before any read or write operations. It's designed to be used when you first start using the persistence layer.

The class's internal storage is specific to the symbol, interval, and exchange it manages, keeping the data neatly organized.

## Class PersistBreakevenUtils

This utility class helps manage and save breakeven data, which is essential for tracking and optimizing trading strategies. It’s designed to reliably store and retrieve this data to disk, ensuring that your strategies remember their state even across restarts.

The class uses a clever system to avoid unnecessary file operations; it only creates a storage instance when it's actually needed. It automatically handles saving the data in a specific file structure, so you don't have to worry about the details of where and how the information is stored.

You can also customize how the data is stored—for example, you might want to use a different file format or even bypass storage entirely for testing purposes. The class provides easy ways to switch between different storage methods, like using a standard JSON file, a custom adapter, or a dummy instance that doesn’t actually save anything. It's like having a built-in assistant for keeping your breakeven information organized and accessible.

## Class PersistBreakevenInstance

This class provides a way to reliably save and load breakeven data for your trading strategies. It’s designed to be persistent, meaning the data survives even if your application crashes.

Think of it as a safe keeper for important information about your trading setups. It uses files to store this data, and ensures that writes are done safely to prevent corruption.

The class needs to know which symbol, strategy, and exchange it’s working with when it’s created. It uses a unique identifier, the signal ID, to track each piece of data.

The `waitForInit` method makes sure the storage is ready before you try to save anything.  `readBreakevenData` fetches the breakeven data for a specific signal, while `writeBreakevenData` allows you to save updated information. Essentially, it handles the reading and writing of your breakeven data persistently.


## Class PersistBase

`PersistBase` provides a foundation for reliably saving and loading data to files, ensuring your data remains consistent even if errors occur. It's designed to handle the complexities of managing files, like automatically fixing corrupted files and safely deleting them. 

This class manages files related to a specific type of data (defined by `entityName`) and stores them in a designated directory (`baseDir`). The path to that directory is automatically calculated and maintained.

You can use `readValue` to retrieve a saved entity, `hasValue` to check if an entity exists, and `writeValue` to save new or updated entities.  It makes sure writes are atomic, so data isn’t left incomplete in case of interruptions. 

`keys()` gives you a way to go through all the IDs of the stored entities. `waitForInit` is used to set up the storage directory and check the integrity of any existing data.

## Class PerformanceReportService

This service helps you understand how long different parts of your trading strategies take to run. It listens for timing events generated during strategy execution and records them in a database. Think of it as a way to identify performance bottlenecks – where your strategy is spending the most time.

You can tell it to start listening for these timing events using the `subscribe` method, which will return a function you can call to stop listening. The `unsubscribe` method does the same thing, ensuring you don't accidentally subscribe multiple times. It uses a special technique to prevent unwanted multiple subscriptions.

The service also has a logger for debugging and a way to write the collected data to the database for later analysis. It's designed to be a straightforward way to gain insights into your strategy's performance and find areas for improvement.

## Class PerformanceMarkdownService

The PerformanceMarkdownService is a tool designed to monitor and report on how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like averages, minimums, maximums, and percentiles.

It automatically generates easy-to-read markdown reports, which include a breakdown of potential bottlenecks. These reports are saved directly to your logs directory.

You can subscribe to receive performance updates, and unsubscribe when you no longer need them. The `track` function is used to feed it the actual performance data as it's being generated.

The service provides methods to retrieve specific performance data for a particular strategy, generate reports on demand, and clear out accumulated data when necessary. The storage mechanism ensures each strategy’s data is kept separate and organized.

## Class Performance

The Performance class helps you understand how your trading strategies are performing. It offers tools to analyze performance metrics for specific symbols and strategies, giving you a clear picture of what's working well and where there might be issues.

You can retrieve detailed performance statistics, which include information like the number of operations, their durations, averages, and outliers. This lets you pinpoint areas where your strategy might be slow or inefficient.

The class also allows you to generate easy-to-read markdown reports. These reports visualize your performance data, highlighting bottlenecks and important trends, and provide a structured overview.

Finally, it's simple to save these reports directly to your computer's file system for later review or sharing, with the option to customize the file path and included data columns.

## Class PartialUtils

The PartialUtils class helps you analyze and report on partial profit and loss data gathered during trading. Think of it as a tool to understand how your strategies are performing in terms of smaller, incremental gains and losses.

It pulls information from the system that tracks these partial events, allowing you to get statistics like total profit/loss counts.

You can generate detailed reports in markdown format, which displays your partial profit and loss events in a clear, organized table. This table shows important details like the type of event (profit or loss), the symbol traded, the strategy used, the signal ID, position, percentage level, price, and when it occurred. Summary statistics appear at the bottom of this table.

Finally, it allows you to easily save these reports to a file, automatically creating any necessary folders. The reports are named with the symbol and strategy name, making them easy to identify and manage.

## Class PartialReportService

The PartialReportService is designed to keep track of smaller, partial exits from your trades – those times when you take some profit or cut a loss before the entire position is closed. 

It works by monitoring two streams of data: one for partial profit events and one for partial loss events. Whenever a partial exit occurs, the service records details like the price and level at which it happened.

This information is then persistently stored in a database, allowing you to analyze how these partial exits impact your overall trading strategy.

You can tell the service to start listening for these events using the `subscribe` method, which returns a function you’ll use to stop listening.  The `unsubscribe` method handles stopping the monitoring process, ensuring you don't accumulate unnecessary data. 


## Class PartialMarkdownService

The PartialMarkdownService helps you keep track of and report on your trading performance, specifically focusing on partial profits and losses. It listens for these events as they happen and carefully organizes them for each symbol and strategy you're using.

It builds detailed markdown reports, essentially tables, that show exactly what happened with each profit and loss. You can also get overall statistics like the total number of profit and loss events.

This service automatically saves these reports to your disk, creating files named after the symbol and strategy.

To use it, you'll need to subscribe to the profit and loss signals to start collecting data. You can then request reports, statistics, or have the reports saved directly to disk. Finally, you have the option to clear the accumulated data if needed, either for a specific combination of symbol, strategy, exchange, frame, and backtest or to clear everything.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the backtest-kit framework. It’s designed to keep things organized by handling logging and forwarding requests to a dedicated connection service. Think of it as a gatekeeper – it's where ClientStrategies receive their initial instructions related to partials, ensuring consistent monitoring and a layer of separation between the strategy logic and the underlying connection mechanics.

Several services, including validation and schema services, are integrated to ensure proper setup and configuration.

The `profit` and `loss` functions handle updates to profit/loss states, notifying the system when new levels are reached.  The `clear` function resets the partial state when a signal is closed. All these functions log actions before passing them on to the connection service for actual execution.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It acts like a central hub, ensuring that each signal has its own dedicated record for this purpose.

Think of it as a factory – it creates and maintains these records (ClientPartial instances), remembering them for later use. When a signal reaches a profit or loss milestone, this service handles the necessary updates and notifications. 

It's designed to be efficient; it uses a caching system to avoid creating duplicate records and cleans them up when they're no longer needed. The service is integrated into the overall trading system and works closely with other components to ensure accurate and timely updates. When a trade closes, the service clears out the relevant data, preventing lingering information.

## Class NotificationLiveAdapter

This component helps manage notifications during live trading, providing a flexible way to send updates about your strategies. It acts as a central hub, handling events like signals, profits, losses, and errors, and then sending those updates through a chosen notification method.

Think of it like a messenger – you tell it *what* happened (a signal, a partial profit, etc.), and it delivers that message using a specific method.

You can easily switch between different "messengers" (notification adapters) to control where these updates go – whether it's to memory, a persistent storage, or even a dummy adapter that does nothing.

It’s designed to be adaptable: you can choose how your notifications are handled, with options for in-memory storage, persistent storage, or even a dummy adapter that ignores them altogether.  The `use...` methods simplify switching between these adapters.

The `getInstance` property and its associated `clear` method are important for maintaining a fresh notification adapter when your environment changes, such as when you change the working directory. This ensures notifications are handled correctly in different iterations of your strategy.

Essentially, this framework streamlines the process of notifying you about important events happening during your trading strategies, letting you customize how and where that information is delivered.

## Class NotificationHelperService

This service helps manage and send out important notifications during trading simulations. It’s designed to make sure everything is checked and working correctly before a notification is sent.

Think of it as a quality control line for signals – it validates details like the trading strategy, exchange, and the timeframe being used. This validation happens only once for each specific combination of strategy, exchange, and timeframe to keep things efficient.

The service provides a way to trigger these notifications, specifically `signal.info` events, which are then sent to interested parties and recorded for later review. You’ll typically use this service through the `commitSignalNotify()` method when you're setting up callbacks in your trading strategies. It ensures that the information being sent is accurate and compliant.


## Class NotificationBacktestAdapter

This component acts as a central point for managing notifications during backtesting. It's designed to be flexible, allowing you to choose different ways to handle those notifications – whether that's storing them in memory, persisting them to disk, or effectively ignoring them altogether for testing purposes.

Think of it as a pluggable system; you can easily swap out the underlying notification mechanism without changing much of your core backtesting code.  It comes with a default "memory" option for simple storage, but you can also use persistent storage or a dummy adapter to suppress notifications.

The `handleSignal`, `handlePartialProfit`, `handleRisk`, and other `handle...` methods are all entry points for different types of notifications. These methods simply pass the data along to the currently selected notification adapter.  The `getData` method retrieves any notifications that have been recorded, and `dispose` clears them out.

You can switch between notification adapters using methods like `useDummy`, `useMemory`, and `usePersist`.  The `useNotificationAdapter` method provides the most control, allowing you to specify a custom adapter constructor. The `clear` method is important to call when things change, like when the base directory changes, so you get a fresh notification instance.

## Class NotificationAdapter

The NotificationAdapter is responsible for handling and managing notifications, both from backtesting and live trading scenarios. It automatically receives and processes notifications by connecting to signal emitters. 

You can think of it as a central hub where all your notifications are collected and accessible in a consistent way. To prevent unnecessary subscriptions, it uses a "singleshot" mechanism that ensures you only subscribe once.

The `enable` property lets you activate notification tracking, and `disable` lets you stop it safely, even if called repeatedly. `getData` allows you to retrieve all notifications, specifying whether you want backtest or live data, while `dispose` provides a way to clear out the stored notifications.

## Class MemoryLiveAdapter

This component, called `MemoryLiveAdapter`, provides a flexible way to store and manage data during live trading. Think of it as a central memory bank for your trading strategies. It’s designed to be easily swapped out with different storage methods, letting you choose how your data is saved and accessed.

By default, it saves your data to files, ensuring that your memory persists even if your program restarts. However, you can also choose to store data only in memory for faster access or use a dummy adapter for testing purposes.

You can interact with this adapter using functions to write new data, search for existing data, list all entries, remove entries, and retrieve specific entries.  It also offers convenient commands to quickly switch between different storage methods.  If you're canceling a signal, there's a specific function to clear the memoized data related to that signal. When dealing with scenarios where the base directory of your process changes, clearing the memoized cache is helpful to ensure fresh instances are created.

## Class MemoryBacktestAdapter

The `MemoryBacktestAdapter` provides a flexible way to manage memory storage during backtesting. It allows you to easily switch between different storage implementations, like an in-memory solution, a persistent file-based storage, or even a dummy adapter for testing.

The default storage is in-memory, providing fast access but without persistence. You can switch to a file-based storage to save your memory data or use a dummy adapter if you just want to test the core logic without actually writing anything to memory.

You can also plug in your own custom storage implementations. 

When you're finished with a specific signal, use the `disposeSignal` method to clean up any resources associated with it. You have methods to write, search, list, remove and read memory entries.

If your working directory changes during strategy iterations, be sure to clear the cache using `clear` to ensure new instances are created using the updated base path.


## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing memory storage within the backtest and live trading environments. It handles subscriptions to signal lifecycle events, automatically cleaning up old data when signals are closed to prevent memory buildup. This adapter intelligently directs memory operations – writing, searching, listing, removing, and reading – to either the backtest or live environment, depending on the specific request. A key feature ensures subscriptions happen only once, preventing unnecessary overhead. The `enable` property activates this memory management, while `disable` safely stops it, and you can call `disable` multiple times without issues.

## Class MaxDrawdownUtils

This class helps you understand and analyze the maximum drawdown experienced during trading. It's like a tool to review how much your strategy lost from its peak before hitting a new low.

You can request detailed statistical data about a specific trading setup, including the strategy, exchange, and timeframe. This data provides a comprehensive view of the drawdown performance.

Need to see the drawdown events laid out clearly? You can generate a markdown report that lists each event.

Finally, you can automate the process by having these reports saved directly to a file, simplifying your analysis workflow.

## Class MaxDrawdownReportService

This service keeps track of maximum drawdown events during backtesting and saves that data for later analysis. It listens for updates about drawdown changes and records each one to a database in a format suitable for reporting and analytics.

The service is initialized with a logger and a tick object, and it's designed to handle individual drawdown records, capturing key details about the situation at the time of the event. These details include timestamps, symbol, strategy name, exchange, frame, the signal ID, position size, current price, and order parameters like take profit and stop loss.

To start tracking drawdown events, you need to subscribe to the service. This sets up the connection to receive those updates. The subscription also gives you a function to unsubscribe, which is important for cleaning up when you no longer need the service.  Unsubscribing effectively stops the recording of drawdown events. The subscription mechanism prevents accidentally setting up multiple listeners.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and store reports about maximum drawdown, a key risk metric in trading. It listens for drawdown data and organizes it by symbol, strategy, exchange, and timeframe. 

You need to tell it to start listening for data using `subscribe()` and can stop it with `unsubscribe()`.

The service provides several handy methods: `getData()` lets you retrieve the raw drawdown statistics, `getReport()` generates a nicely formatted markdown report, and `dump()` saves that report directly to a file.

The `clear()` method is useful for resetting the data. It can either clear all accumulated data or selectively clear data for a specific symbol, strategy, exchange, and timeframe combination.


## Class MarkdownWriterAdapter

This component manages how your backtest results are saved, offering different ways to store the information. It allows you to easily switch between writing reports to individual files, appending them to a single log file, or even disabling markdown output altogether. The system remembers which storage method is active and reuses it, ensuring that data for a specific report type (like backtest or live trading) is consistently handled.

You can customize how markdown files are created by swapping out the default storage adapter. 

The `useMd()` function provides the standard approach of creating a separate Markdown file for each report. `useJsonl()` gathers all your reports into a single, continuously updated JSONL file. `useDummy()` is handy for temporarily silencing the markdown output during development or debugging. Finally, you can clear the system’s memory of previously used storage methods if your working directory changes.

## Class MarkdownUtils

MarkdownUtils helps you control which parts of the backtest-kit framework generate markdown reports. You can choose to have reports made for backtests, live trading, strategy performance, and more.

It's designed to be extended by other classes for even more specialized reporting.

The `enable` method lets you turn on markdown reports for specific services, and it's really important to remember to unsubscribe from those services when you're done to avoid issues.

`disable` stops report generation for services without needing to unsubscribe – it just cuts off the reporting immediately.

Finally, `clear` lets you wipe the data used for reports without completely stopping the report generation process. This allows you to reset reports while keeping the underlying services running.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate backtest reports, creating each report as a separate markdown file within a defined directory structure. Think of it as ideal for keeping your reports organized and easily accessible for human review. 

Each report gets its own `.md` file, named based on your specified path and file name, for example, `./dump/backtest/BTCUSDT_my-strategy_binance_2024-Q1_backtest-1736601234567.md`.

It handles the creation of necessary directories automatically, so you don't have to worry about setting up the folder structure. Because it writes files directly, there’s no need for complex initialization, making it a simple and reliable solution. 

The constructor simply takes a key related to the target of the markdown, and the `dump` method is your main tool for creating the report files, writing the content and establishing the file's location.

## Class MarkdownFileBase

The `MarkdownFileBase` class helps you automatically generate and store markdown reports as JSONL files. Think of it as a tool for consistently logging your trading reports in a structured format. It creates a single JSONL file for each type of report you need (like trade summaries or performance analysis).

The system handles the details of writing to these files, including creating the necessary directories, managing the writing process to avoid overwhelming the system, and ensuring things don't hang for too long. You can search these reports later by filtering based on criteria like the trading symbol, strategy used, or the timeframe.

Essentially, this class allows for centralized logging and simplifies post-processing of trading data using standard JSONL tools. The initialization happens only once, and you can safely call the `dump` method to append new markdown content along with helpful metadata to the files.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility and efficiency. It allows you to easily switch between different storage methods like individual files or a single JSONL file. 

You can customize the adapter's behavior by providing your own storage constructor, ensuring all new markdown instances use your preferred method. 

For convenience, the `useMd()` method reverts to the default folder-based storage, where each dump creates a new markdown file. `useJsonl()` switches to the alternative JSONL-based storage, which appends data to a single file. There’s even a `useDummy()` option that essentially does nothing with the data, useful for testing or situations where you don’t need to persist anything. 

The adapter also remembers the storage instances, so you don't have to recreate them repeatedly, making things faster and more resource-friendly. It only initializes the storage when you first write data.


## Class LookupUtils

The `LookupUtils` class acts like a central record keeper for what's currently happening in your backtests and live trading sessions. Whenever a backtest or live session starts (like when you run `Backtest.run` or `Live.run`), or when a strategy's steps are being executed, an entry is added to this registry. Similarly, when these activities finish, the entry is removed.

Think of it as a constantly updated list of what's running. 

The `addActivity` method adds a new activity, and `removeActivity` cleans up when an activity is done. Importantly, `removeActivity` should be used even if errors occur during the activity to prevent lingering entries. `listActivity` gives you a current view of all the activities that are currently running. This class is accessed through the `Lookup` singleton and doesn’t require any special setup.

## Class LoggerService

The LoggerService helps standardize logging across the backtest-kit framework. It's designed to automatically add important context to your log messages, like which trading strategy, exchange, or frame is generating the log. 

This means you don't have to manually add these details every time you want to log something. 

If you don't configure a specific logger, it defaults to a "no-op" logger that doesn't actually do anything, so it won’t interfere with your existing setup.

You can customize the logging behavior by providing your own logger implementation using the `setLogger` method. 

The service also manages information about the method context (like the strategy name) and the execution context (symbol, timestamp, backtest status), appending this to each log message for increased clarity and traceability.


## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store your trading logs. It allows you to easily switch between different logging methods, like storing logs in memory, persisting them to disk, or even suppressing them entirely. Think of it as a central hub for all your log messages, providing different ways to handle them based on your needs.

You can choose between different log implementations – the default is in-memory, but there are options for persistent storage, a dummy (no-op) logger, and JSONL file logging. `usePersist`, `useMemory`, `useDummy`, and `useJsonl` let you easily switch between these logging strategies.

The `log`, `debug`, `info`, `warn`, and `getList` methods provide a consistent interface for writing different types of log messages, regardless of the underlying storage mechanism. The `clear` function ensures you're using the freshest adapter if your working directory changes during backtesting. The `useLogger` function allows you to customize the logger entirely using a constructor.

## Class LiveUtils

The `LiveUtils` class provides tools for running and managing live trading operations within the backtest-kit framework. It acts as a central point for interacting with live trading, simplifying processes and providing features like crash recovery and real-time monitoring.

Here's a breakdown of what it offers:

*   **Easy Live Trading Execution:** The `run` method is your primary way to kick off live trading, handling the complexities of connecting to the exchange and processing ticks. It’s designed to be persistent, meaning it will attempt to recover if the process crashes.
*   **Background Operation:** If you just want to run live trading for side effects (like sending notifications or saving data), the `background` method lets you do so without processing or displaying the individual ticks.
*   **Signal Management:** Several methods let you peek at what signals the strategy is currently working with, like `getPendingSignal` (the active signal) or `getScheduledSignal` (the signal waiting to be triggered).  You can also check if signals are missing with `hasNoPendingSignal` and `hasNoScheduledSignal`.
*   **Position Insights:**  Get detailed information about your current open position, including the percentage held (`getTotalPercentClosed`), cost basis (`getTotalCostClosed`), and profit/loss calculations (`getPositionPnlCost`, `getPositionPnlPercent`).  You can also see the history of price entries (`getPositionEntries`) and partial closes (`getPositionPartials`).
*   **Control and Adjustment:** You can adjust the strategy's behavior with `stop` (to pause trading), `commitCancelScheduled` (to cancel a scheduled signal), and `commitClosePending` (to close the current position).
*   **Trailing Stop/Take Profit:** Fine-tune your positions with trailing stop-loss and take-profit orders using methods like `commitTrailingStop` and `commitTrailingTake`, ensuring your gains are protected and profits are maximized.
*   **Data & Reporting:** Access real-time data about the running strategy with `getStrategyStatus`, and generate comprehensive reports with `getReport` and `dump`.  `getData` provides a way to gather statistics.



In essence, `LiveUtils` gives you the necessary tools to run, monitor, and manage your live trading strategies in a robust and reliable manner.

## Class LiveReportService

LiveReportService helps you track what your trading strategy is doing in real-time by recording every signal event—like when it's waiting, opening a position, actively trading, or closing a position. 

It works by listening for these events and saving all the details to a database, so you can monitor and analyze your strategy’s performance as it’s happening. 

You can think of it as a real-time data logger specifically for your trading strategy.

To get started, you’ll use the `subscribe` function to connect it to your signal events. This ensures you don't accidentally subscribe more than once.  When you’re finished, `unsubscribe` cleanly stops the data logging. 

The service also uses a logger for any helpful debugging information.


## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate and save reports about your live trading activity. It keeps track of all the important events – like when a strategy is idle, when a trade is opened or closed, and everything in between – for each strategy you're running. 

It turns this data into easy-to-read markdown tables, providing insights into your trading performance, like win rates and average profit/loss. These reports are then saved to your computer in a structured way, making it simple to review your trading history.

You can subscribe to receive live updates as trades happen, and the service safely handles unsubscribing when you no longer need those updates. It allows you to retrieve specific data or full reports for individual strategies, and even clear the recorded data when needed. The service organizes data by symbol, strategy, exchange, frame, and whether it’s a backtest, ensuring that everything is neatly separated.

## Class LiveLogicPublicService

The LiveLogicPublicService is designed to manage and orchestrate live trading, making it easier to work with. It builds upon the LiveLogicPrivateService and includes automatic context management, so you don't have to constantly pass around information about the strategy and exchange being used.

It acts as an infinite stream of trading results (signals to open, close, or cancel positions).

This service is robust, designed to handle crashes and recover from previous states saved on disk. Real-time progression is achieved by using the current time to track events.

The `run` method is the core of the service, initiating live trading for a specific symbol. It automatically injects the necessary context, streamlining the process of getting candles, signals, and executing other trading-related actions.


## Class LiveLogicPrivateService

This service manages live trading operations, constantly monitoring and reacting to market data. It operates as an ongoing process, checking for new trading signals at regular intervals.

The core function, `run`, acts like an endless stream of trading activity, providing real-time updates on trades that have been opened or closed – it skips over trades that are currently active. 

Because this is a continuous process, the system is designed to handle unexpected crashes; it recovers its state from saved data, ensuring trading can resume seamlessly. This approach also uses memory efficiently by streaming results rather than storing everything at once.


## Class LiveCommandService

This service, `LiveCommandService`, acts as a central point for live trading operations. It simplifies accessing and managing the underlying live trading logic.

Think of it as a helper that makes it easy to inject dependencies needed for live trading.

It uses several validation services - for strategies, exchanges, schemas, risk, and actions - to ensure everything is set up correctly before trading begins. The validation process is optimized to prevent unnecessary repeated checks.

The core function, `run`, handles the actual live trading process for a specific trading symbol.  It keeps things running even if errors occur and provides results as an ongoing stream of information about how the strategy is performing (whether it's opened, closed, or cancelled).


## Class IntervalUtils

IntervalUtils helps you control how often functions are executed within a specific time interval, preventing them from running too frequently. It offers two ways to manage this: a simple in-memory approach and a more robust, file-based persistent method.

The `fn` function lets you wrap regular functions to ensure they only run once per interval. If a function returns `null`, it will wait for the next interval before attempting to run again. Each unique function gets its own separate management, so modifications to one don't affect others.

For asynchronous functions, the `file` function provides similar control but saves the "fired" state to a file. This means the function will still only fire once per interval even if your application restarts. Each unique function also gets its own persistent instance here too.

You can clean up unused functions with `dispose` to free up memory, or completely reset the system with `clear` when necessary, like when the working directory changes. The `resetCounter` helps ensure new files are created with the correct starting index if the working directory changes. It essentially acts as a cleanup to avoid conflicts between strategy runs.

## Class HighestProfitUtils

This class helps you understand and analyze the highest profits achieved during trading. It acts as a central place to gather and present information about those peak performance moments.

Think of it as a tool for reviewing how well your strategies have performed – specifically, when they've made the most money. 

You can use this class to:

*   Get detailed statistics about the highest profit events for a specific trading pair (like BTC/USD) and strategy.
*   Generate reports that summarize all the highest profit occurrences in a readable markdown format.
*   Save those reports directly to a file so you can share them or keep a record of your results.

It's designed to work with data collected by other parts of the backtest-kit system, providing a focused view on the moments of greatest success.

## Class HighestProfitReportService

This service is designed to track and record the highest profit moments during a backtest. It monitors a specific data stream, `highestProfitSubject`, and whenever a new record of highest profit is detected, it writes that information to a JSONL database for later analysis.

The service utilizes a `ReportWriter` to handle the actual persistence of the data.

Each record includes details like the timestamp, symbol, strategy name, exchange, frame, and backtest information, along with signal-specific data such as signal ID, position, current price, and take profit/stop-loss levels.  Importantly, signal-level details come directly from the signal data itself.

To begin recording these high-profit events, you need to use the `subscribe` method. This only runs the subscription once, preventing multiple subscriptions.  The `subscribe` method returns a function which you’ll call to stop the recording.  If you need to stop recording, call the `unsubscribe` method.


## Class HighestProfitMarkdownService

This service helps you create reports detailing the highest profit achieved for a specific trading setup. It listens for data about profitable trades and organizes that information.

You can subscribe to receive these profit events, but the system ensures you only subscribe once to avoid unnecessary actions. Unsubscribing completely clears all the collected data.

Each time a new profit event comes in, the service processes it and stores it.

You can then request data, generate a formatted report, or even save the report directly to a file. The filename for saved reports includes details like the symbol, strategy, exchange, and whether it was a backtest.

Finally, there's a way to clear the stored data, either for a specific trading setup or all of them at once, giving you a fresh start.

## Class HeatUtils

HeatUtils helps you easily visualize and analyze the performance of your trading strategies using heatmaps. It gathers key statistics like total profit, Sharpe ratio, maximum drawdown, and trade counts for each symbol used by a strategy.

It's designed to be straightforward to use, aggregating data automatically from all completed trades for a specific strategy across an exchange and timeframe.

You can retrieve the raw data, generate a formatted markdown report, or save the report directly to a file on your computer. The report will present your results in a table sorted by profitability, offering a clear overview of how your strategy performed across different assets. The utility provides logging for tracing operations, and it’s set up as a single, readily accessible instance.

## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording every time a signal closes. It's designed to gather data about closed signals across all your investments to give you a portfolio-wide view.

The service listens for these closing signals and saves key information, like profit and loss (PNL), to a database for later analysis.

Here's a quick rundown of how it works:

*   It connects to a central system that broadcasts signal events.
*   It only focuses on signals that have actually closed – it ignores other types of events.
*   The data it collects is written to a file that can be used to generate a heatmap visualization.

To get started, you'll subscribe to the signal events. This setup prevents accidental duplicate subscriptions, and it gives you a way to stop listening later using the unsubscribe function. If you’ve already unsubscribed, attempting to do so again won’t have any effect.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance using heatmaps. It listens for trading signals and organizes them, giving you a clear picture of how your strategies are doing.

You can get detailed statistics for each individual symbol, like total profit, Sharpe Ratio, and maximum drawdown, as well as aggregated portfolio-level metrics across all your strategies.

It creates reports in a user-friendly markdown format, allowing for easy sharing and analysis. The system is designed to handle tricky situations gracefully, avoiding errors caused by unusual data.

The service keeps track of data efficiently, storing it separately for different exchanges, timeframes, and backtest modes. You can subscribe to receive updates, and unsubscribe when you no longer need them.  It allows clearing of stored data to reset the heatmap for a specific exchange/timeframe/mode or globally. This ensures that new data is tracked from a clean slate.


## Class FrameValidationService

This service helps you keep track of and verify your trading timeframes, also known as "frames." Think of it as a central authority for your timeframe configurations.

You can use it to register new timeframes with specific settings, ensuring they're properly defined. 

Before you start using a timeframe in your backtesting, you can ask this service to check if it exists, preventing errors and ensuring everything runs smoothly. It remembers its checks, so validation happens quickly.

Finally, if you just need a quick overview of all the timeframes you've set up, you can ask it to list them all. It's designed to be efficient and reliable for managing your timeframe configurations.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas in a structured and reliable way. It’s designed to store these schemas safely and consistently using a specialized registry. 

You add new frame schemas using the `register` method and can retrieve them later by their name using `get`. If a schema already exists, you can update parts of it using the `override` method. 

Before a schema is added, a quick check happens (`validateShallow`) to ensure the essential properties are in place and have the right format, making sure everything is set up correctly from the start. The service also leverages logging services for better insights into what's happening.

## Class FrameCoreService

FrameCoreService is a central component that handles the creation and management of timeframes for your backtesting processes. It relies on other services to connect to data sources and validate the resulting data. Think of it as the engine that provides the chronological sequence of data points your trading strategies will be tested against. 

It generates arrays of dates representing the time periods for each backtest run. Specifically, you can ask it to create a timeframe array for a particular trading symbol and timeframe name. This service is a critical internal part of the backtest framework.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames within the backtest environment. It intelligently directs requests to the correct frame implementation based on the current method context.

To optimize performance, it keeps a record of frequently used frames, so it doesn't have to recreate them every time.

This service also handles the timeframe used for backtesting, allowing you to define the start and end dates and the interval (e.g., daily, hourly) for your historical data. 

When in live mode, no specific frame is active, and the `frameName` will be an empty string.

Here's a breakdown of its core components:

*   It relies on the `loggerService` for logging, `frameSchemaService` for frame definitions, and `methodContextService` to understand the current frame in use.
*   The `getFrame` function is its primary way of providing frames, efficiently retrieving or creating them based on the provided frame name.
*   The `getTimeframe` function allows you to determine the date range for testing, limiting the backtest to a specific period and interval.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and confirm the settings for your trading exchanges. Think of it as a central place to register your exchanges and double-check they’re set up correctly before you start trading. It’s designed to be efficient – once an exchange is validated, the result is stored so you don't have to repeat the check unnecessarily. 

You can use `addExchange` to add a new exchange, `validate` to make sure an exchange exists before using it, and `list` to see all the exchanges you've registered. The service also uses a 'loggerService' and an internal 'exchangeMap' to manage and store this information.


## Class ExchangeUtils

ExchangeUtils provides a set of helpful functions to interact with different exchanges within the backtest-kit framework. Think of it as a toolbox simplifying common exchange-related tasks.

It's designed as a single, always-available tool, ensuring consistency across your backtesting environment.

Need historical price data? The `getCandles` function retrieves it, automatically calculating the date range based on the interval and how much data you need.  Similarly, `getAveragePrice` helps you determine the VWAP based on recent trading activity.

You can also get the most recent closing price with `getClosePrice` or retrieve the complete order book with `getOrderBook`.

Formatting trades is often tricky due to varying exchange rules; `formatQuantity` and `formatPrice` handle this for you, ensuring your orders are correctly structured.

Finally, `getAggregatedTrades` pulls trade history, and `getRawCandles` offers even more control over retrieving raw candle data with precise date ranges.


## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different exchanges, ensuring everything is consistent and correct. 

It uses a special system to store these exchange details in a type-safe way.

You can add new exchanges using the `addExchange()` function (represented here as `register`) and then find them again later by their name using the `get()` function. 

Before adding a new exchange, the service will quickly check that it has all the necessary information using `validateShallow`.

If you need to update an existing exchange, you can use `override` to only change specific parts of its details. 

This service also has internal components for logging and managing different contexts, but those are typically handled automatically.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, ensuring that key information like the symbol, time, and backtest settings are always factored into the process. It combines the capabilities of connection and execution services to streamline operations.

This service handles tasks like fetching historical and future candles, calculating average prices, and retrieving order book data. It also offers utilities for formatting prices and quantities, adapting to the specific context of the operation. 

Validation of exchange configurations is also a core function, performed efficiently through memoization to avoid repeated checks. Essentially, it provides a standardized and context-aware way to access exchange data within the trading framework.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges within the backtest-kit framework. It intelligently routes requests to the correct exchange implementation based on the currently configured exchange name. To optimize performance, it keeps a cache of these exchange connections, reusing them whenever possible.

It provides a consistent interface (`IExchange`) for accessing exchange data and functionalities like retrieving historical candles (`getCandles`, `getNextCandles`), fetching the average price (`getAveragePrice`), obtaining the order book (`getOrderBook`), and getting aggregated trades (`getAggregatedTrades`). It handles nuances like formatting prices and quantities (`formatPrice`, `formatQuantity`) to align with each exchange’s specific rules. The service leverages several other services for logging, execution context, and exchange schema, ensuring a controlled and informed operation. You can access the specific exchange instance using `getExchange`, which also benefits from memoization.

## Class DumpAdapter

The `DumpAdapter` provides a way to save data during your backtesting process, acting as a central point for how that data is stored. It has a default method of saving to markdown files, but you can easily change where the data goes.

Think of it as a manager that handles the actual saving process, making sure the right data ends up in the right place.

You’ll need to “activate” the adapter using `enable()` before you start saving anything, and “deactivate” it with `disable()` when you’re done. Calling `enable()` multiple times won't cause problems, it just returns the same subscription handle.

The adapter has several functions to save different types of data, including full conversation histories (`dumpAgentAnswer`), individual records (`dumpRecord`), tables (`dumpTable`), raw text (`dumpText`), error messages (`dumpError`), and JSON objects (`dumpJson`).

You can switch the storage method using functions like `useMarkdown` (the default), `useMemory`, or `useDummy` (which throws away the data).  For more advanced control, `useDumpAdapter` lets you provide your own custom storage implementation.

If you need to change the base path (where files are saved), use `clear()` to refresh the adapter's internal cache.

## Class CronUtils

This utility class, `CronUtils`, helps manage periodic tasks within backtesting environments, especially when running multiple tests in parallel. It ensures that even when multiple tests try to fire a task at the same time, only one actually runs, preventing conflicts.

Think of it like a traffic controller for scheduled events. When several tests need to perform something at a specific time, `CronUtils` makes sure only one gets through, and the others wait.

Here’s a breakdown of its key components:

*   **Registration:** You register tasks with names and intervals.
*   **Single Execution:** Even when multiple tests try to run the same task at the same time, only one will execute, keeping things synchronized.
*   **Synchronization:** It uses promises to coordinate execution across parallel tests.
*   **Watermarking:** It ensures that if a scheduled event is missed due to a jump in virtual time, it's caught on the next tick.
*   **Cleanup:** You can clear out fired-once marks to allow tasks to run again, or completely reset the entire system if needed.
*   **Lifecycle Integration:** It easily integrates with the backtesting engine's lifecycle to automatically schedule tasks.

Essentially, `CronUtils` simplifies managing and synchronizing periodic tasks in parallel backtests, preventing conflicts and ensuring accurate results.

## Class ConstantUtils

The `ConstantUtils` class provides a set of predefined percentages designed to manage take-profit and stop-loss levels based on the Kelly Criterion with an exponential decay approach. These constants, like `TP_LEVEL1`, `TP_LEVEL2`, `TP_LEVEL3`, `SL_LEVEL1`, and `SL_LEVEL2`, are calculated as percentages of the total distance to your final take-profit or stop-loss target. For example, `TP_LEVEL1` at 30% means you'll trigger a partial take-profit when the price reaches 30% of the way to your ultimate profit target. This allows for a gradual exit from a trade, locking in some profits while still allowing for potential further gains, and similarly helps to manage risk with early stop-loss warnings. Essentially, these values help to optimize risk management and profit taking in a trading strategy.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading configurations are mathematically sound and capable of making a profit. It checks a wide range of settings, from percentage-based values like slippage and fees to time-based parameters like timeouts.

Specifically, it makes sure your take profit distance is large enough to account for costs like slippage and fees, preventing unprofitable trades. It also ensures that percentage values are positive, time and count values are positive whole numbers, and relationships between minimum and maximum values are correct. Finally, it validates settings related to how candles are processed. 

This service's `validate` function is the core of the process; it examines all of these parameters to catch potential errors before your backtest begins.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly and consistently. It checks that each column definition includes all the essential pieces of information: a unique key, a descriptive label, a formatting function, and a visibility function to control how it's displayed. 

It verifies these configurations are actually strings and functions as expected, and that the unique keys don't overlap within your column groupings. This service essentially acts as a safeguard, preventing errors and inconsistencies in your column setups before they cause problems.

The `validate` method performs this entire validation process across all your column configurations.

## Class ClientSizing

The ClientSizing component handles how much of your capital gets allocated to each trade. It uses different methods, like fixed percentages, Kelly Criterion, or Average True Range (ATR), to determine the right size for a position.

You can also set limits to ensure your positions don't become too large, either as a maximum dollar amount or as a percentage of your total capital. ClientSizing offers flexibility by letting you provide custom validation checks and logging throughout the sizing process.  Essentially, it's the engine that figures out the best position size for your strategy to execute.

The `calculate` method is the core of this component; it takes input parameters and returns the calculated position size.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring they don't exceed defined limits. It acts as a central control point, preventing signals that would violate those limits, like exceeding the maximum number of concurrent positions or failing custom validations. Multiple strategies can share the same ClientRisk instance, enabling a holistic view of portfolio risk.

It tracks active positions – essentially, what’s currently open in your portfolio – and uses this information to evaluate new trading signals. The `checkSignal` method is the core of this process; it evaluates whether a new signal is permissible based on the configured risk parameters.  `checkSignalAndReserve` is a special, thread-safe version of `checkSignal` that not only performs the check but also temporarily "reserves" a spot in the active position tracker, preventing other strategies from accidentally exceeding the limits between the check and the actual trade execution.

The `addSignal` method is used to register when a trade is actually opened, and `removeSignal` cleans up when a trade closes.  These methods work with a key identifying the strategy, exchange, and symbol of the position. It handles persistence of position data, though this is skipped in backtesting mode.  It’s vital to remember that after a successful `checkSignalAndReserve`, you *must* either `addSignal` (to finalize the position) or `removeSignal` (if the position is cancelled) to avoid accumulating stale data.

## Class ClientFrame

The `ClientFrame` is a key component that creates the timelines used for backtesting trades. It efficiently generates arrays of timestamps representing the backtest period, ensuring the process isn't repeated unnecessarily with its caching feature.

You can customize the spacing between these timestamps, choosing intervals from one minute to one day.

The framework also allows for callbacks, which are useful for validating the generated timeframe data or for logging important events during its creation. 

Essentially, `ClientFrame` works behind the scenes, feeding the historical data to the backtesting engine. The `getTimeframe` function is the main way to access this functionality, generating and caching those crucial timeline arrays for a given trading symbol.

## Class ClientExchange

This class, `ClientExchange`, acts as a bridge to get data from an exchange, designed to be efficient and safe for backtesting. It handles fetching historical and future candle data, which is crucial for analyzing past performance and simulating trades. You can retrieve past candles going backwards from a specific point in time, or look ahead to get data needed for signal durations in backtesting scenarios.

It also provides convenient methods for calculating things like the VWAP (volume-weighted average price), which is a common indicator used in trading.  The class formats prices and quantities appropriately for different trading symbols, ensuring compatibility with exchange requirements.

Beyond basic candle data, you can get the current order book and aggregated trades, crucial for understanding market depth and order flow.  The system carefully prevents "look-ahead bias," meaning it only uses data available at a given point in time, which is vital for accurate backtesting. The whole class is built to be memory efficient by using prototype functions.

## Class ClientAction

The `ClientAction` component is a central piece for running your custom action handlers within the backtest-kit framework. Think of it as a manager that sets up, routes, and cleans up after your action handlers – these are the pieces of code that handle things like logging, sending notifications, managing your state (like with Redux), or collecting analytics.

It works by initializing an instance of your handler, and then directing different types of events to specific methods on that handler. There are separate methods for dealing with events coming from live trading, backtesting, and specific situations like when a breakeven or partial profit target is reached.

Importantly, `ClientAction` makes sure that initialization and cleanup only happen once, even if multiple events are triggered. It also provides a direct channel for gated position adjustments using limit orders, with a special note that errors in that process will be passed up for handling elsewhere.

## Class CacheUtils

CacheUtils provides a straightforward way to cache function results, especially useful when dealing with time-sensitive data like financial markets. It's like having a memory for your functions, so they don't have to repeat calculations unnecessarily.

The `fn` method lets you wrap regular functions, so their results are cached based on specific time intervals (like hourly, daily, etc.). This is ideal for calculations that should only update when new data becomes available.

For asynchronous functions (like those fetching data from a database or external API), the `file` method provides persistent caching, saving data to disk. This is extremely helpful for complex calculations that take a while to run; the results are stored in files within a directory structure that helps keep things organized.  Each unique function gets its own, independent cache.

If you need to completely clear out the cached results for a specific function, you can use `dispose`. The `clear` function removes *all* cached data, which is handy if the environment or working directory changes.  Finally, `resetCounter` helps keep file names consistent when you are working across different iterations of a strategy.

Essentially, CacheUtils helps you optimize performance by avoiding redundant calculations, storing data efficiently, and managing cached results easily.


## Class BrokerBase

This `BrokerBase` class is designed to help you connect your trading strategies to real exchanges. Think of it as a foundation for creating adapters that talk to specific brokers or exchanges. It provides a default structure and handles the basic logging of events, so you don't have to worry about setting that up from scratch.

You can extend this class to implement a custom adapter. It’s like building a specialized connector for placing orders, managing stop-loss and take-profit levels, tracking your position, and sending trade notifications.

Here’s how it works:

1.  **Initialization:**  The `waitForInit()` method lets you perform any setup needed before the trading begins, such as logging into your exchange account.
2.  **Event Handling:** As your strategy runs, the `onSignalOpenCommit`, `onSignalCloseCommit`, and other `on...Commit` methods are triggered. These are your opportunities to interact with the exchange – placing orders, closing positions, adjusting stops, and recording trades.
3.  **Default Behavior:** Each of these commit methods has a default implementation that simply logs the event.  You can customize these methods to perform the actual actions on your exchange.
4.  **Lifecycle:** The broker doesn’t require explicit cleanup; any teardown can be done in the `waitForInit` method or handled externally.

Essentially, `BrokerBase` gives you a convenient and organized way to plug your trading strategy into the real world.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper for any actions that modify your trading system's state, ensuring everything happens safely and in the right order. It’s particularly important when connecting to a live broker, but it also plays a role even in backtesting.

Think of it as a safety net: if anything goes wrong during a trade execution, the `BrokerAdapter` prevents the system from entering an inconsistent state.

Here's a breakdown of what it does:

*   **Connects to Your Broker:** You tell the `BrokerAdapter` which broker to use through `useBrokerAdapter`. It then handles the communication with that broker.
*   **Manages Trade Events:** It automatically sends "signal open" and "signal close" notifications to your broker, keeping it informed about your trading activity.
*   **Intercepts Key Actions:** Before the core trading logic makes changes (like setting partial profits or trailing stops), the `BrokerAdapter` steps in. This is a chance to make sure everything is valid. If anything fails at this stage, the core system remains untouched.
*   **Backtesting Considerations:** During backtesting, these actions are skipped to focus solely on the historical data and simulation.
*   **Easy Activation/Deactivation:** You can turn the broker interaction on (`enable`) or off (`disable`) as needed.  There's also a `clear` function to ensure a fresh start when things change (like your working directory).

Essentially, the `BrokerAdapter` provides a reliable way to manage interactions with your broker and safeguards your trading system.

## Class BreakevenUtils

This class offers tools for analyzing and reporting on breakeven events in your trading backtests. Think of it as a way to get a clear picture of how often your strategies hit breakeven points and what those events look like.

It gathers information about breakeven events, which include details like the trading symbol, strategy used, signal ID, position type, entry and current prices, and whether it was a backtest or live trade.

You can use it to get statistical summaries of breakeven events, create detailed markdown reports that table all relevant information about these events, or directly save those reports to files.

The reports include tables showing the details of each breakeven event, along with useful statistics at the bottom.  The reports are structured with columns such as symbol, strategy name, signal ID, and position type, along with prices and timestamps.

The class handles creating the necessary directory structure to store the report files and names them in a predictable format using the symbol and strategy name.

## Class BreakevenReportService

The BreakevenReportService helps you track when your trading strategies reach a breakeven point. It essentially listens for these "breakeven" moments and records them in a database.

Think of it as a diligent observer that captures every time a signal becomes profitable. 

It uses a logger to keep you informed and ensures that you don't accidentally subscribe multiple times, which could lead to duplicate entries.

To start using it, you’ll need to subscribe to the breakeven signal, and when you're done tracking, you can unsubscribe. The `subscribe` method returns a function that you can call to unsubscribe.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you track and report on breakeven events that occur during trading. It keeps track of these events for each symbol and strategy you're using, organizing them so you can understand what’s happening.

You can think of it as a reporter that listens for "breakeven" signals and compiles them into easy-to-read markdown reports. These reports include detailed event information and overall statistics.

The service stores these reports on your computer, neatly organized into folders, making it simple to review your trading activity. 

You can tell it to create these reports for specific symbols and strategies, or clear out all of the accumulated data when you need to start fresh. It’s designed to keep its data separate for each symbol, strategy, exchange, frame, and backtest combination, so you get focused insights.


## Class BreakevenGlobalService

This service acts as a central hub for managing and tracking breakeven points within the trading system. Think of it as a go-between, ensuring all breakeven-related activities are logged and handled consistently.

It's designed to be injected into the core trading strategy, streamlining how strategies interact with the underlying connection layer. 

The service relies on other services—validation and schema services—to make sure everything is set up correctly before any actions are taken.

The `validate` function checks that the strategy and associated configurations are valid, and it remembers those checks to avoid repeating them unnecessarily.

The `check` function determines if a breakeven trigger should happen, logs the action, and then passes the request along. Similarly, `clear` handles closing a breakeven position, logging it, and delegating the task.

## Class BreakevenConnectionService

The BreakevenConnectionService manages tracking breakeven points for trading signals. It's designed to create and manage individual tracking instances, ensuring efficiency and preventing unnecessary object creation.

Essentially, it acts as a central hub for breakeven calculations, keeping track of these calculations for each trading signal.

Here's how it works:

*   It remembers previously created breakeven trackers (memoization), so it doesn’t recreate them every time.
*   It receives information about the trading signal and setup, allowing it to configure each tracker properly.
*   It handles the actual checks and clear operations through dedicated trackers, and cleans up when signals are no longer needed.
*   It works in coordination with other services to provide a complete trading strategy framework.

## Class BacktestUtils

This utility class helps streamline backtesting operations, providing easier access to core functions and logging. It acts as a central point for managing backtest instances, ensuring each symbol-strategy pairing gets its own isolated environment.

You can run backtests using the `run` method, which processes data and provides results asynchronously. For background runs that don't require immediate results, use `background`. There are also methods to retrieve specific signal information like pending or scheduled signals (`getPendingSignal`, `getScheduledSignal`), and details about the current position (`getTotalPercentClosed`, `getPositionEffectivePrice`, `getPositionPnlPercent`, `getPositionLevels`).

The class offers functions to check for signal absence (`hasNoPendingSignal`, `hasNoScheduledSignal`), and to determine breakeven (`getBreakeven`).  You can also access position-specific data like entry prices (`getPositionEntries`), partial close events (`getPositionPartials`), and estimated durations (`getPositionEstimateMinutes`).  Several functions help analyze position performance and potential for profit or loss.

Finally, the `stop` method allows you to halt a backtest, while `commit...` methods let you manipulate signals and positions during the process.  `commitCreateSignal` allows inserting custom signals.  `list` displays the current status of all backtest instances.

## Class BacktestReportService

This service helps you keep a detailed record of what’s happening during your backtests. It listens for events related to your trading signals – when they're inactive, being set up, actively trading, and when they're finished. 

Essentially, it’s capturing a snapshot of each signal’s journey, storing all the details in a database so you can analyze them later to understand what worked well and what didn't. 

You can think of it as a logging system specifically designed for backtesting, and it avoids accidentally recording the same events multiple times. To start using it, you'll subscribe to the signal events; this returns a function you can call to stop listening. If you're already subscribed and call unsubscribe, it simply stops the service from recording further events.

## Class BacktestMarkdownService

The BacktestMarkdownService is designed to automatically create and save detailed reports about your trading backtests. It listens for updates as your strategies run, carefully recording information about each signal that closes.

This service keeps track of closed signals for each strategy, neatly organized using a storage system that prevents data from different combinations of symbols, strategies, exchanges, and frames from interfering with each other. It then transforms this data into easy-to-read markdown tables.

You can use it to generate reports that summarize the performance of your strategies, and it saves these reports directly to your backtest logs. 

The service offers a way to clear out this accumulated data when it’s no longer needed, and it provides functions for getting specific data or reports, or even saving them to a particular file path. To use it effectively, you'll need to connect it to your backtest environment, using the provided `subscribe` and `unsubscribe` methods.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps run backtests in a structured way, handling details like the trading strategy, exchange, and the specific timeframe being tested. It simplifies things by automatically passing this information to the functions used during the backtest, so you don't have to manually include it every time.

It uses a logger to track events and manage time-related information. 

The service also relies on other services to handle connections to exchanges and define the structure of the data being used in the backtest.

The `run` method is the core function to start a backtest. You provide the symbol you want to backtest, and it will give you a stream of results as the backtest progresses, showing the signals generated and the trades executed. The context you provide—strategy, exchange, and timeframe—is automatically applied to every step of the backtest process.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the complex process of running a backtest for trading strategies. It works by first obtaining the relevant timeframes from a frame service. Then, for each timeframe, it processes incoming data and decides whether to execute trading actions. 

When a trading signal arises, the service fetches the necessary historical data (candles) and executes the backtest logic to simulate the strategy's actions. It intelligently skips ahead in time until the signal is closed, efficiently utilizing resources.

The service delivers results incrementally using an asynchronous generator, meaning it streams the outcomes (like opened, closed, or cancelled signals) without first storing everything in memory—this is great for large backtests. You can also stop the backtest early by interrupting the generator.

Internally, it relies on several core services: StrategyCoreService, ExchangeCoreService, FrameCoreService, ActionCoreService, TimeMetaService, PriceMetaService, and a logger service for tracking what’s happening. The run method is the key entry point, and it takes a symbol (like a stock ticker) to specify which asset to backtest.

## Class BacktestCommandService

This service acts as a central point for accessing backtesting capabilities within the framework. It's designed to be easily integrated into other parts of your application.

It bundles together several internal services, like those handling logging, strategy validation, and exchange validation, to ensure a smooth and consistent backtesting experience.

The `validate` function helps you ensure your strategy and its associated risk settings are correctly configured before you run a backtest. It intelligently remembers past validations to save time.

The core function, `run`, performs the actual backtest, taking a symbol and some contextual information like the strategy, exchange, and frame names. It delivers the results step by step.


## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers – those pieces of code that respond to specific events in your trading system. Think of it as a central manager ensuring your handlers are correctly registered and available when needed.

It provides a straightforward way to register new handlers using `addAction`, letting you define what actions your system can respond to and how.  Before running anything that relies on an action handler, you can use `validate` to confirm it’s actually registered, preventing errors. 

To make things efficient, the service remembers previous validation results – a technique called memoization – so it doesn’t have to re-check the same handlers repeatedly. If you need a complete overview of what’s registered, `list` provides a listing of all your configured action schemas. It also has properties for internal usage like `loggerService` and `_actionMap`.

## Class ActionSchemaService

The ActionSchemaService is in charge of keeping track of and managing the blueprints for actions within your trading system. It ensures that actions are set up correctly and safely, using type safety to prevent errors. 

Think of it as a central place where you define what actions your system can perform, what methods those actions use, and how they're validated.

Here's a breakdown of what it does:

*   **Registration:** It lets you register new action types, making sure they’re correctly structured and that the methods used within them are approved.
*   **Validation:** It checks that your action setups are complete and follow the rules before they're actually used.  It verifies that any public methods used in the action's code are allowed.
*   **Modification:** You can update existing action schemas without having to completely redefine them. This is helpful for making small changes.
*   **Retrieval:** It provides a way to fetch the details of an action when you need it.

The service relies on a logger to help debug and monitor its operation. It uses a registry to store and manage the action schemas in a secure and organized way.

## Class ActionProxy

The `ActionProxy` acts as a safety net when your custom trading strategies interact with the backtest framework. Think of it as a protective layer around your code. It takes your action handlers—the code that reacts to events like a new signal or a profit level—and ensures that any errors within those handlers don't crash the entire backtesting process.

Instead of letting errors halt the simulation, `ActionProxy` catches them, logs them, and allows the backtest to continue.  This is crucial for robust testing and debugging.

Here's a breakdown of what it does:

*   **Error Handling:** It wraps almost every method of your action handlers in error-catching code.  This means even if your code has a bug, the backtest won't abruptly stop.
*   **Handles Different Events:** It handles signal events (for live, backtest, and general modes), breakeven events, partial profit/loss events, scheduled pings, risk rejections, and cleanup processes (`dispose`).
*   **Factory Pattern:**  You don't create `ActionProxy` instances directly; you use the `fromInstance` method, which is the correct way to wrap your action handlers.
*   **`signalSync` Exception:** Note that `signalSync` isn’t wrapped in error handling.  Exceptions here are intentional, as they're meant to be caught by a specific system function related to limit order synchronization.

In essence, `ActionProxy` is a vital component ensuring that your strategies can be tested and refined without bringing down the whole backtest.

## Class ActionCoreService

The `ActionCoreService` acts as a central coordinator for handling actions within your trading strategies. It essentially manages how actions are triggered and executed, ensuring they run in the correct order and that all necessary validations are performed.

Think of it as a traffic controller for your strategy's actions. It fetches the list of actions needed from the strategy's blueprint, verifies that everything is configured correctly (like making sure the strategy name, exchange, and frame are valid), and then sends those actions to the appropriate handlers.

Here's a breakdown of its key functions:

*   **Initialization:** `initFn` sets up the action handlers, preparing them for use.
*   **Signal Routing:**  Methods like `signal`, `signalLive`, `signalBacktest`, and others (breakeven, partial profit, ping events, risk rejection) all route different kinds of events to the strategy's actions. Each one retrieves the action list and sequentially invokes the corresponding handler for each action.
*   **Validation:**  `validate` checks that all parts of your strategy setup are correct to prevent errors during execution. It caches the results to avoid repeated checks.
*   **Synchronization:** `signalSync` ensures all actions agree on position changes, acting as a gatekeeper.
*   **Cleanup:** `dispose` cleans up all the action handlers after the strategy is finished running.
*   **Data Clearing:** `clear` allows you to remove action-related data, either for a specific action or globally.



Essentially, the `ActionCoreService` keeps everything running smoothly and in the right order when your trading strategy is in motion.

## Class ActionConnectionService

This service acts as a central hub for directing different actions within your trading strategies. It’s designed to route specific events (like signals, breakeven adjustments, or ping requests) to the correct action handler, ensuring the right logic is executed for each situation.

The service uses a clever caching system – memoization – to avoid repeatedly creating action handlers, which significantly boosts performance. The cache is keyed by the action name, strategy, exchange and frame, meaning actions are isolated per strategy and frame.

You provide the name of the action, and the service finds or creates the appropriate handler, making it a flexible and efficient way to manage actions in your backtesting and live trading environments. It also includes methods for initializing, disposing, and clearing cached action instances. It allows handling different event types, like regular signals and backtest-specific signals.

## Class ActionBase

This class, `ActionBase`, provides a foundation for building custom actions within the backtest-kit trading framework. It's designed to simplify adding logic for things like sending notifications, logging data, or triggering custom actions based on strategy events.

Think of it as a starting point—you extend this class to create specialized handlers. It takes care of common tasks, like logging events, so you can focus on your unique logic.

Here’s how it works:

1.  **Construction:** You're given the strategy name, frame name, action name, and whether you're in backtest mode.

2.  **`init()`:**  Use this method to set up your action, like connecting to a database or initializing an API.  It's called once at the beginning.

3.  **Event Handlers:**  The class provides methods like `signal()`, `signalLive()`, `signalBacktest()`, `breakevenAvailable()`, etc. Each of these is called when a specific event occurs within the strategy.  You override the ones you need to react to.  For example, `signalLive()` is only called when the strategy is live.

4.  **`dispose()`:** This method runs when the strategy finishes, allowing you to clean up resources, such as closing connections.

Essentially, `ActionBase` handles the boilerplate, so you can concentrate on defining the *specific* actions your strategy should take in response to different trading events. It simplifies creating custom logic for all aspects of your strategy’s behavior.
