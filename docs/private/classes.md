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

This service helps you keep track of and make sure your walker configurations – those parameter sweeps you use for optimization – are set up correctly. It acts like a central manager for your walkers, letting you register new ones, check if they exist before you try to use them, and even remembers past validation checks to speed things up.

You can add new walker definitions using the `addWalker` function. 

If you want to confirm a walker exists before proceeding, the `validate` function is your tool.

Need a complete overview of all the walkers you’ve defined? The `list` function provides a handy list of all registered walker schemas. 

It also uses a built-in log for any needed debugging.

## Class WalkerUtils

WalkerUtils helps you run and manage your trading walkers in a simpler way. It’s like a central control panel for your walker comparisons.

This class handles the details of executing walkers, automatically figuring out the necessary settings based on their configuration. It also keeps track of walker instances, ensuring each symbol and walker pairing gets its own dedicated space.

You can use WalkerUtils to:

*   Run comparisons for a specific symbol, providing extra information about what the walker should focus on.
*   Run comparisons in the background, perfect for tasks like logging or triggering actions without needing to directly monitor the results.
*   Stop a walker from generating new trading signals—it does this gently, letting existing signals finish before preventing new ones from being created.
*   Retrieve all the results of a walker's comparisons.
*   Generate and save detailed reports about walker performance.
*   Get a quick overview of all your active walker instances and their current status.

WalkerUtils makes managing and understanding your walkers much easier, acting as a single point of access for common operations.

## Class WalkerSchemaService

This service is responsible for keeping track of walker schemas, acting like a central repository for them. 

It uses a special system to ensure the schemas are stored safely and accurately.

You can add new walker schemas using the `addWalker` function and get them back later by their name.

Before a new schema is officially registered, it's quickly checked to make sure it has all the necessary parts and the right types.

If you need to update an existing schema, you can do so with the `override` function, which lets you modify only specific parts of it.

Finally, the `get` function allows you to easily retrieve a schema using its name.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It acts as a listener, recording results from your strategy tests, along with key metrics and statistics.

Think of it as a data logger for your optimization process.

It automatically stores this information in a SQLite database, allowing you to monitor progress, compare different strategy configurations, and identify your best-performing setups.

You can easily start and stop this logging process using the `subscribe` and `unsubscribe` functions to manage your connection to the optimization events. 

The service also includes a built-in safeguard to prevent accidental multiple subscriptions.

## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save reports about your trading strategies. It listens for updates during strategy testing ("walker" events) and carefully keeps track of the results for each strategy.

It organizes the results and presents them in easy-to-read markdown tables, making it simple to compare different strategies side-by-side.  These reports are then saved as files on your computer, so you can review them later.

You can subscribe to these walker events to get real-time updates, and easily unsubscribe when you're done.

The service uses a clever system to store data efficiently, ensuring each walker has its own separate set of results. You can fetch specific data, generate full reports, or clear all accumulated results. You can even control which columns appear in the generated reports. The reports are saved in a `logs/walker/{walkerName}.md` format.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated trading processes. It builds upon a private service to handle the core walker logic. 

Think of it as a layer that automatically passes along important information like the strategy being used, the exchange involved, the time frame, and the specific walker instance – so you don't have to explicitly provide it everywhere.

The `run` method is key: you give it a ticker symbol and a context (walker name, exchange, frame), and it generates a sequence of results from running the walkers. It’s designed to run tests across all your strategies, making it easy to compare their performance.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps manage and compare different trading strategies, like orchestrating a team of runners in a race. It handles the process of running each strategy one after another.

As each strategy finishes, you'll receive updates on its progress. The service keeps track of the best performing strategy so far.

Finally, you'll get a complete report, showing how all strategies stacked up against each other in a ranked order.

It uses BacktestLogicPublicService internally to actually execute the strategies.

The service has a logger for tracking events, access to backtest logic, markdown formatting, and schema handling.

The `run` method is the main entry point, where you specify the trading symbol, the list of strategies to compare, the metric you're using to judge performance, and the overall context of the test. It returns a series of progress updates as each strategy is completed.

## Class WalkerCommandService

The WalkerCommandService acts as a central point for interacting with the walker functionality within the backtest-kit framework. Think of it as a convenient bridge, simplifying how different parts of the system communicate and access walker-related features. 

It's designed for use with dependency injection, meaning it’s easily integrated into various parts of the application. 

Inside, it holds references to several other services responsible for things like logging, walker logic, schema management, and validation, covering everything from strategy and exchange rules to frame and action correctness. 

The `run` method is the key feature – it’s how you initiate a walker comparison for a particular trading symbol. When you call it, you specify the symbol you want to analyze, along with details about the walker's name, the exchange it's using, and the frame it's operating within.  The results are delivered asynchronously, allowing for efficient processing.


## Class TimeMetaService

The TimeMetaService keeps track of the most recent candle timestamp for each trading setup – considering the symbol, strategy, exchange, and timeframe being used. It's a handy way to get the current candle time even when you're not actively in a trading tick.

Think of it as a memory bank for timestamps, where each setup has its own entry. If you need the timestamp within a trading tick, it grabs it directly from another service; otherwise, it looks it up in its memory. It will wait briefly if a timestamp hasn’t been recorded yet.

You can clear this memory to free up resources or to make sure you're working with fresh data, especially when starting a new backtest or live trading session. The service automatically gets updated after each tick and is centrally managed within the system.

## Class SystemUtils

The SystemUtils class helps keep backtest sessions separate and prevent them from accidentally affecting each other. It essentially creates a way to temporarily "pause" the connections between different parts of your trading system. 

Think of it like putting a temporary block on how information flows so that one backtest doesn't mess up another.

The `createSnapshot` method is the key – it takes a picture of the current connections and resets them, allowing you to run a new backtest without interference.  Later, you can restore those connections to their original state.

## Class SyncUtils

The `SyncUtils` class helps you analyze and understand the lifecycle of your trading signals. It gathers information about signal openings and closings, providing statistics and detailed reports.

Think of it as a tool to review how your strategies are performing. It collects data from signal events and organizes it for easy examination.

You can use it to:

*   Get aggregated statistics, like the total number of signal openings and closings for a specific symbol and strategy.
*   Generate markdown reports that provide a comprehensive view of signal activity, including details on each signal’s action, pricing, profit/loss, and reason for closing.
*   Save these reports as files, automatically creating folders and naming them to keep things organized. These reports can be customized to display specific data columns. 

The class pulls data from a service that monitors signal events, storing a limited history to allow for meaningful analysis.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals, specifically when they're opened and closed. It's designed to record every important step, like when a signal is created and when a position is exited, storing these details in a report file.

Essentially, it listens for signal events and meticulously logs them, including performance data like profit and loss (PNL) and the reason for closing a position. This detailed record-keeping is incredibly useful for auditing your trading activity and understanding what's working well.

To use it, you subscribe to receive these signal events, and when you’re done, you unsubscribe to stop the service. This setup prevents accidental duplicate subscriptions. The service also provides a logger for any debugging needs.

## Class SyncMarkdownService

This service is responsible for collecting and reporting on signal synchronization events during backtesting or live trading. It keeps track of signal open and close events for each symbol, strategy, exchange, and timeframe combination.

You can subscribe to receive these signal sync events and generate detailed markdown reports. The reports include a table of events, along with statistics like the total number of events, opens, and closes.

The service offers a way to retrieve accumulated statistics for a specific symbol, strategy, exchange, frame, and backtest combination. It also allows you to generate and save these markdown reports directly to disk.

Finally, you can clear the accumulated data for specific combinations or clear everything completely to start fresh. This helps keep the data organized and manageable.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and makes sure they're set up correctly. It acts like a central hub for all your strategies, allowing you to register them easily.

It checks that each strategy exists, and if you’ve defined risk profiles or actions for it, it verifies those too. To make things run faster, it remembers the results of these checks, so it doesn't have to repeat them unnecessarily.

You can add new strategies using the `addStrategy` function. The `validate` function ensures a strategy is valid before you try to use it.  And, if you need to see all the strategies you've registered, the `list` function provides a handy list of them. The service relies on other services for risk and action validation, and uses a map to store strategies.

## Class StrategyUtils

StrategyUtils helps you understand and analyze how your trading strategies are performing. It acts as a central place to gather and present information about strategy events like closing positions, taking profits, and setting stops.

You can use it to:

*   Get statistical summaries of your strategy's actions, showing you how often different events occur.
*   Create detailed reports in Markdown format, displaying all the events that have happened for a specific strategy and symbol. This includes important details like price, percentage values, and timestamps.
*   Save these reports to files on your computer for easy sharing and review. The file names are designed to be descriptive, including the symbol, strategy name, exchange, timeframe, and a timestamp.

Essentially, StrategyUtils simplifies the process of tracking, understanding, and documenting your trading strategy's performance. It pulls data from a system that keeps track of those events and presents them in a readable and useful way.

## Class StrategySchemaService

This service helps you keep track of the blueprints, or schemas, for your trading strategies. It uses a special system to make sure your schemas are consistent and type-safe. 

You can add new strategy schemas using the `addStrategy()` function, and retrieve them later by their names. 

Before a strategy schema is officially registered, it undergoes a quick check to ensure it has all the necessary properties and they're the right types.

If a strategy schema already exists, you can update it with new information, like changing a setting.

Finally, you can easily look up a specific strategy schema by its name to see its details.


## Class StrategyReportService

This service helps you keep a detailed audit trail of your trading strategy's actions by recording specific events to individual JSON files. Think of it as a detailed logbook for your strategy.

It captures key moments like when a scheduled signal is canceled, a pending order is closed, or when you take partial profits or losses. It also logs trailing stop-loss and take-profit adjustments, breakeven adjustments, early signal activations, and average buy (DCA) events.

To start using it, you need to "subscribe" – essentially activate the logging. After that, every time one of the tracked events happens, it gets immediately written to a file.  When you're done, you "unsubscribe" to stop the logging and clean up.  This is different from other reporting methods that might hold everything in memory; this one writes immediately for maximum security and traceability.

## Class StrategyMarkdownService

This service helps track and report on what's happening in your trading strategies during backtests or live trading. It's like a detailed logbook for your strategies.

It collects events like when orders are canceled, positions are closed, or stop-losses are adjusted.  Instead of writing each event to a file immediately, it stores them temporarily, allowing for more efficient batch reporting.

To start using it, you need to "subscribe" to begin tracking events. Once subscribed, events are automatically recorded.  You can then use methods to view statistics, generate reports in Markdown format (easy to read and share), or save the reports to files. When you're done, you "unsubscribe" to stop tracking and clear the collected data.

The `getStorage` property manages how the data is stored, making sure each strategy on a given symbol has its own dedicated storage.

Methods like `cancelScheduled`, `closePending`, `partialProfit`, and `breakeven` each record a specific type of event, providing a granular view of strategy behavior.

`getData` lets you grab all the accumulated data and statistics for a particular strategy. `getReport` and `dump` are for creating and saving nicely formatted Markdown reports. Finally, `clear` allows you to wipe the slate clean, removing all the accumulated data.

## Class StrategyCoreService

This service acts as a central hub for managing strategy operations, particularly during backtesting or live trading. It combines the functionality of several other services to provide a comprehensive set of tools for interacting with and monitoring trading strategies.

It handles validation of strategies, retrieves information about pending signals (like current price, profit/loss, and entry details), and provides methods for actions like closing positions or adjusting stop-loss levels.  Essentially, it provides a unified interface for most actions a strategy would need to perform.

The service keeps track of information like cost basis, DCA entries, and partial closes, allowing you to understand the full performance of a strategy's positions. You can also retrieve data about a position’s duration, peak profit/loss points, and drawdown.  It also includes methods for stopping, cancelling, or disposing of strategies.


## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for your trading strategies, making sure the right strategy handles incoming requests. It’s like a traffic controller for your strategies.

It keeps track of your strategies and their associated data, caching them for faster access.  This is particularly useful in backtesting scenarios.

Here's a breakdown of what it does and its key components:

*   **Automatic Routing:** It automatically connects requests to the correct strategy based on factors like the trading symbol and the strategy's name.
*   **Caching:** It stores frequently used strategies to avoid recreating them repeatedly, improving performance.
*   **Initialization:** It ensures that strategies are fully ready before any trading actions are taken.
*   **Handles Live and Backtest:** It’s designed to work with both live trading (using `tick()`) and historical data (using `backtest()`).

The service relies on other services:

*   `loggerService`: For logging information and context.
*   `executionContextService`: For managing execution context.
*   `methodContextService`: For managing method execution context.
*   `strategySchemaService`: For managing strategy schema.
*   `riskConnectionService`: For handling risk-related operations.
*   `exchangeConnectionService`: For interacting with exchanges.
*   `partialConnectionService`: For managing partial trades.
*   `breakevenConnectionService`: For handling breakeven calculations.
*   `actionCoreService`: For executing core actions.
*   `timeMetaService`: For time-related meta operations.
*   `priceMetaService`: For price-related meta operations.

The service offers several methods to interact with strategies:

*   `getStrategy()`: Retrieves a cached strategy.
*   `getPendingSignal()`, `getTotalPercentClosed()`, `getTotalCostClosed()`, `getPositionEffectivePrice()`, `getPositionInvestedCount()`, `getPositionInvestedCost()`, `getPositionPnlPercent()`, `getPositionPnlCost()`, `getPositionLevels()`, `getPositionPartials()`, `getPositionEntries()`, `getScheduledSignal()`: These methods provide information about the state of a strategy's position, such as pending signals, partial closes, and costs.
*   `tick()`: Executes a trading tick (live).
*   `backtest()`: Executes a backtest.
*   `stopStrategy()`: Stops a strategy from generating new signals.
*   `hasPendingSignal()`, `hasScheduledSignal()`: Checks for signals.
*   `dispose()`: Clears a strategy from the cache.
*   `cancelScheduled()`, `closePending()`:  Manage scheduled and pending signals.
*   `validate...()`, `...()`: Methods for partial profit, partial loss, trailing stop, breakeven, and average buy, providing validation and execution capabilities.

## Class StorageLiveAdapter

The `StorageLiveAdapter` helps manage how your trading signals are stored, offering flexibility by letting you choose different storage methods. It acts as a middleman, handling events like signals being opened, closed, scheduled, or cancelled and passing those actions along to the chosen storage system.

You can easily switch between different storage types: persistent storage (saving to disk), in-memory storage (temporary and lost when the application restarts), or a dummy adapter for testing purposes.  The adapter defaults to persistent storage.

It provides convenient functions like `usePersist`, `useMemory`, and `useDummy` to quickly switch storage methods.  You can also use `useStorageAdapter` for more advanced customization if you need to implement a totally new storage method.  

The adapter also keeps track of when signals are active or scheduled by updating a timestamp. If you need to start fresh, you can use `clear` to reset the adapter back to its default persistent storage and cached instance.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` acts as a flexible middleman for managing how your backtest data is stored. It lets you easily switch between different storage methods – like persistent storage on your hard drive, keeping data in memory, or even using a "dummy" adapter that does nothing. 

Think of it as a plug-in system for your storage needs.

The adapter itself handles events like signals being opened, closed, scheduled, or cancelled, and it provides methods to find and list signals. It keeps track of when signals were last active, updating their information as needed.

You can easily change which storage method is used with functions like `usePersist()`, `useMemory()`, and `useDummy()`, and `useStorageAdapter` allows you to provide custom storage solutions. The `clear()` method is important to call when the working directory changes so that the adapter can be reset.

## Class StorageAdapter

The StorageAdapter is the central component for handling and organizing both backtest and live trading signals. It automatically keeps track of incoming signals by listening for updates and storing them. 

To start using it, you’ll enable the storage, which subscribes it to the signal emitters, ensuring it only does this once.  You can also disable the storage to stop these subscriptions, and it’s safe to disable it multiple times.

If you need to look up a specific signal, you can find it using its ID, searching across both your historical backtest data and current live signals. 

You can also retrieve lists of all backtest signals or all live signals to view the stored data.

## Class StateLiveAdapter

The `StateLiveAdapter` provides a flexible way to manage and store trading state, allowing you to easily swap out different storage methods. It's designed to work with trading strategies, particularly those using LLMs to evaluate trade performance and potentially automate exits.

By default, it saves state to a file on your computer, so your data isn't lost when you restart your application.  However, you can switch to other options: a temporary in-memory storage for testing, or even a dummy adapter that simply ignores any changes.

The adapter keeps track of things like the highest percentage gain and how long a position has been open, which are key factors in the automated trading rule described.  This information is saved persistently, meaning it survives application restarts.

The `disposeSignal` function cleans up old data when a trading signal is finished.  You'll use `getState` to read the stored data and `setState` to update it.

If you need a completely custom storage approach, `useStateAdapter` lets you plug in your own implementation.  `useLocal`, `usePersist`, and `useDummy` offer quick ways to change the storage backend. Finally, `clear` helps ensure your data is fresh when the working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store information during backtesting, allowing you to swap out different storage methods easily. By default, it uses an in-memory storage, but you can switch to storing data on disk or even using a dummy adapter that doesn’t save anything. This is helpful for testing and experimenting with different ways of handling your backtest data.

You can think of it as a way to track key metrics like the highest percentage gain and how long a trade has been open. This tracking is important for testing advanced trading rules, such as automatically closing a trade if it hasn't performed as expected after a certain amount of time.

The `disposeSignal` function cleans up old data when a trading signal is finished. The `getState` and `setState` functions let you read and update this data. You can choose the storage backend via helper functions like `useLocal`, `usePersist`, and `useDummy`.  Finally, `clear` helps ensure you’re using fresh data when running multiple backtests.

## Class StateAdapter

The `StateAdapter` acts as a central manager for how your backtest and live trading systems store and access data. It automatically handles cleaning up old data when signals are finished, preventing issues caused by outdated information. 

You can enable the state adapter to start storing data, and disable it to stop. 

The `getState` function lets you retrieve the current value of a signal’s data, seamlessly switching between backtest and live environments depending on your needs. Similarly, `setState` allows you to update that data, ensuring consistent updates whether you’re in a backtest or a live trading scenario. It makes managing your data's lifecycle easier by taking care of the subscription and unsubscription processes for you.

## Class SizingValidationService

This service helps you keep track of and verify your position sizing strategies. It acts as a central place to register your sizing methods and make sure they're available when you need them.

Think of it like a librarian for your sizing rules – you add them to the library (using `addSizing`), and it makes sure they’re there when you ask for them (with `validate`).

To get a quick overview of what you've registered, you can use `list` to see all the sizing strategies you've added. The service is also designed to be efficient, remembering previous validation results so it doesn’t have to re-check things unnecessarily. It uses a `loggerService` for internal logging and `_sizingMap` to store the sizing strategies.

## Class SizingSchemaService

This service helps you keep track of sizing schemas, which define how much of an asset to trade in different scenarios. It uses a specialized registry to store these schemas, ensuring that they are consistently structured and typed. You can add new sizing schemas using the `register` method, or update existing ones using `override`. If you need to know how a specific sizing schema is configured, you can use the `get` method to retrieve it by name. The service includes a validation step to ensure new schemas have the necessary properties before they are added to the registry, helping to prevent errors.

## Class SizingGlobalService

The SizingGlobalService is a central component that figures out how much of an asset to trade, based on your risk preferences and trading strategy. It acts as a middleman, using a separate service to handle the actual size calculations. This service is used both behind the scenes by the trading framework and also as part of the tools you, as a user, can access.

It manages several internal tools, including logging and validation, to ensure the sizing calculations are accurate and reliable.

The key function is `calculate`, which takes details about the trade and the current context (like the sizing operation name) and returns the recommended position size. This is the core method you’d leverage to determine the size of your trades programmatically.


## Class SizingConnectionService

The SizingConnectionService is designed to handle position sizing calculations within your backtesting framework. It acts as a central point, directing sizing requests to the right sizing implementation based on a name you provide. 

To improve efficiency, it uses a caching mechanism, so frequently used sizing configurations are quickly accessible. 

Essentially, you tell it which sizing method you want to use (like fixed percentage or Kelly criterion), and it handles the actual calculations, ensuring the correct sizing rules are applied. If no sizing configuration exists, you can use an empty string for the sizing name.

The service relies on two key components: a logger for tracking activity and a sizing schema service for defining the sizing configurations. 

The `getSizing` property is how you access a specific sizing implementation; it creates it if it doesn't already exist and remembers it for future use. 

Finally, the `calculate` function is where the actual sizing calculation happens, taking your risk parameters and sizing method name as input to produce the position size.

## Class SessionLiveAdapter

The `SessionLiveAdapter` allows you to manage and store data during live trading sessions in a flexible way. It acts as an intermediary, letting you easily swap out how and where session data is stored. By default, it uses a file-based storage that survives restarts, but you can switch to an in-memory option for quick testing or a dummy adapter that simply discards data.

You can retrieve data from a specific trading session using `getData`, specifying the symbol, strategy name, exchange, frame, and timestamp. Similarly, `setData` allows you to update session values.

For convenience, you can quickly change the storage method using functions like `useLocal`, `usePersist`, `useDummy`, or `useSessionAdapter` to use your own custom storage solution.

The `clear` function is useful for situations where the base directory changes; calling it ensures that new session instances are created.


## Class SessionBacktestAdapter

This component helps manage and store data during backtesting runs, allowing you to easily switch between different storage methods. It acts as a flexible middleman, letting you plug in various ways to handle session data – whether that's keeping everything in memory for speed, saving it to files for persistence, or even using a dummy adapter that throws away data for testing purposes. 

You can quickly choose between using the default in-memory storage, a file-based option, a discard-everything dummy, or bring in your own custom storage solution. The system cleverly remembers and reuses these storage setups for different combinations of symbols, strategies, exchanges, and frames.

The `getData` function retrieves existing data, while `setData` updates it, associating the data with specific parameters. 

To refresh the storage settings, you can use `clear` to reset the memoized cache, which is particularly useful when the working directory changes during a backtest.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data during both simulated (backtest) and live trading sessions. It intelligently directs data retrieval and updates to the appropriate storage mechanism – either the backtest data store or the live data store – depending on whether you're running a backtest or not. 

You can use `getData` to fetch the current value of a signal, specifying the symbol, context (strategy, exchange, frame), whether it's a backtest, and the timestamp.  Similarly, `setData` allows you to update signal values, also taking into account the backtest flag and context. Essentially, it simplifies the process of working with data consistently across different session types.

## Class ScheduleUtils

The ScheduleUtils class is designed to help you understand and monitor your trading signals' scheduling and execution. It essentially acts as a central point for accessing information about signals that have been queued, cancelled, or are currently being processed.

It helps you track how signals are performing by providing data on cancellation rates and average wait times. 

You can easily retrieve statistics for specific trading symbols and strategies, giving you insights into potential bottlenecks or inefficiencies in your signal processing. 

The class can also create formatted reports in Markdown, making it easier to share and analyze signal performance data, and even saves those reports directly to a file. It's designed to be readily accessible for consistent use throughout your backtesting or live trading workflow.

## Class ScheduleReportService

This service helps track the lifecycle of scheduled signals, allowing you to see how long they take to execute or get cancelled. It listens for events like when a signal is scheduled, when it starts running, and when it's cancelled. 

The service calculates the time elapsed between scheduling a signal and when it actually runs or is cancelled, providing insights into potential delays. It then stores this information in a database for detailed tracking and analysis. 

You can easily start and stop the service's monitoring using the `subscribe` and `unsubscribe` functions to control when it's active. It prevents accidental multiple subscriptions to avoid redundant logging.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals by automatically creating reports detailing scheduled and cancelled signals. It listens for these events as they happen, organizing them by strategy to provide a clear overview of what's happening in your system. 

The service generates nicely formatted Markdown tables that include details about each signal event and provides helpful statistics like cancellation rates and average wait times. These reports are saved to disk so you can review them later, usually in a logs folder, organized by strategy name.

You can subscribe to receive these events, and the service ensures you don't accidentally subscribe multiple times.  You can also manually clear out the accumulated data if needed.

The service provides functions to retrieve the statistics or the full report for a particular strategy and symbol combination, and to save these reports to disk.  It uses a clever storage system that keeps data isolated for each unique combination of symbol, strategy, exchange, frame, and backtest setting.

## Class RiskValidationService

This service helps you keep track of your risk management rules and make sure they're all set up correctly before you start trading. It's like a central directory for your risk profiles, ensuring everything is in place and valid.

You can easily register new risk profiles using `addRisk`, and then `validate` them to confirm they exist before any trading action is taken. To see a complete list of all the risk profiles you’ve added, you can use the `list` function.

The service also remembers the results of validations to speed things up, avoiding redundant checks. Basically, it's designed to provide a reliable and efficient way to manage your risk configurations.

## Class RiskUtils

The RiskUtils class provides tools for analyzing and reporting on risk rejection events, helping you understand and improve your trading strategies. It acts as a central point to access and summarize data collected about rejections, offering both statistical insights and detailed reports.

You can use it to get aggregated statistics like the total number of rejections, broken down by symbol and strategy. It can also generate nicely formatted markdown reports that show each rejection event, including details like the symbol, strategy, position, price, and the reason for the rejection.

Finally, it can automatically generate and save those reports as markdown files, naming them based on the symbol and strategy involved – making it easy to organize and share your risk analysis. Essentially, this class is your go-to for understanding and documenting the risks associated with your trading.


## Class RiskSchemaService

This service helps you manage and keep track of your risk schemas. It uses a special system to store these schemas in a way that prevents errors caused by incorrect data types.

You can add new risk schemas using the `addRisk()` function (represented here as `register`), and easily find them again by their names with the `get()` function.

Before adding a new schema, it quickly checks that it has all the necessary parts using `validateShallow`.

If a schema already exists, you can update parts of it using `override`, keeping your existing data while making specific changes. 

The service also has a way to log important information, `loggerService`, and a hidden storage area, `_registry`.

## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system rejects trading signals. It essentially acts as a watchdog, noting down each rejection, including why it happened and what the signal was. 

This service listens for those rejection events and saves the details—like the reason for the rejection and information about the signal—in a database for later review and analysis. 

You can think of the `subscribe` function as enabling this monitoring, and it prevents you from accidentally setting it up multiple times.  The `unsubscribe` function then turns off this monitoring, ensuring you're only logging what's necessary. If you’ve already unsubscribed, calling it again won’t cause any problems.


## Class RiskMarkdownService

The RiskMarkdownService helps you create and save reports detailing rejected trades due to risk management. It listens for "risk rejection" events and organizes them based on the symbol and trading strategy involved.

It automatically generates nicely formatted markdown tables that summarize these rejections, along with overall statistics like the total number of rejections and breakdowns by symbol and strategy.

You can subscribe to receive these rejection events, and the service handles ensuring you don't subscribe multiple times. The service stores data separately for each symbol, strategy, exchange, frame, and backtest configuration, so reports are tailored to specific setups.

It provides functions to retrieve aggregated data, generate reports, and save them as markdown files to a designated directory. You can also clear all accumulated rejection data or clear data for a particular symbol/strategy combination.

## Class RiskGlobalService

This service, RiskGlobalService, acts as a central point for managing risk checks within the backtesting framework. It works closely with a connection service to validate risk limits, and it’s a critical component used both internally by trading strategies and within the public API.

It keeps track of validations to avoid unnecessary repeats, and logs these activities for monitoring.

The core functions allow you to check if a trading signal is permissible based on defined risk limits, with a special, thread-safe version that secures reservations for positions to avoid conflicts when multiple strategies try to execute simultaneously.

You can also register newly opened signals within the risk management system, and when a signal is closed, it’s removed. Finally, it allows for clearing of risk data, either for a specific set of risk parameters or a complete reset of all risk data.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks during trading, ensuring that your strategies adhere to predefined limits. It intelligently connects your trading signals to the correct risk management implementation, streamlining the process and preventing potential errors.

Think of it as a traffic controller, directing signals to the right place for validation. It remembers which risk rules apply to different exchanges and timeframes, improving efficiency by caching these rules.

Key functions include verifying if a trade is permissible based on things like portfolio drawdown and symbol exposure, and then registering or removing trades once they're opened or closed. There’s also a special function that helps coordinate trade placement, safeguarding against conflicts when multiple trades are happening at once. You can also clear out the cached risk rules when needed. 

Essentially, it's all about making sure your trades stay within acceptable risk boundaries.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you collect and store data from your trading strategies in a structured way, making it easier to analyze and debug your performance. It uses a flexible design, allowing you to switch between different storage methods without changing your core code.

It keeps track of storage instances, ensuring that you only have one storage location for each type of report (like backtest results, live trading data, or walker logs). This helps manage resources and avoids conflicts.

You can easily change how data is stored by setting a different "ReportFactory"—essentially, a constructor for your storage method. The default is JSONL storage, which appends data to files.

The `writeData` function handles writing the data to the appropriate storage, automatically creating the storage if it doesn't already exist.

If you need to discard data for testing or development, the `useDummy` function allows you to temporarily disable all writes. And when you want to go back to standard JSONL storage, the `useJsonl` function does the job. It's also possible to clear the stored instances with `clear()` if the working directory changes.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs. Think of it as a way to turn on or off data collection for things like backtest runs, live trading, or performance analysis.

You can selectively enable logging for different service types, such as backtests or walkers. When you enable a service, it starts recording events and writing them to JSONL files, making it easier to analyze what happened.  Crucially, when you enable logging, you get a function to *unsubscribe* – it's really important to use that function later to avoid problems with your application's memory.

Conversely, you can disable logging for specific services without affecting others. This is useful for focusing on particular areas of interest or when you need to reduce the amount of data being generated. Disabling stops the logging immediately; no unsubscribe function is needed in this case.


## Class ReportBase

This adapter lets you log events—like trading signals or performance data—to a JSONL file, making it easy to analyze your backtests later. It's designed to handle a lot of events without slowing down your backtest, using a streamlined approach where data is written line by line.

Each report type gets its own file, and the adapter automatically creates the necessary directories. If writing gets interrupted, it includes safety measures to prevent data loss and a timeout to avoid indefinite delays.

You can easily search for specific events within your reports using metadata like the traded symbol, the strategy used, the exchange, the timeframe, the signal ID, and the walker name.

The `waitForInit` method ensures the file and stream are properly set up, and you can call it repeatedly without issue. The `write` method is the core function, allowing you to add event data along with the relevant metadata and a timestamp.


## Class ReportAdapter

The `ReportAdapter` helps you manage and store your trading data in a consistent and organized way. Think of it as a flexible system for handling how your reports are saved.

It allows you to easily swap out different storage methods without changing your core trading logic – for instance, you could switch between saving data to JSONL files or a database.  It also remembers which storage method you're using for each type of report, making things efficient. 

The `useReportAdapter` method lets you tell the system which storage method to use going forward. To start fresh and clear out any existing stored data, use the `clear` method.  If you just want to temporarily stop saving data (perhaps for testing or development), `useDummy` provides a way to discard all report writes. Finally, `useJsonl` returns you to the standard JSONL file storage.

## Class ReflectUtils

This utility class, `ReflectUtils`, helps you monitor and analyze your trading positions in real-time, whether you're live trading or backtesting. It provides a centralized place to retrieve key metrics like profit and loss (PnL), peak profit, and drawdown information.

Think of it as a toolkit for understanding how your strategies are performing. The class is designed to be easily accessible - there's only one instance of it available for use throughout your application.

Here’s what you can do with it:

*   **Track PnL:** Get the unrealized PnL as a percentage or in dollar cost for your current pending signals.
*   **Monitor Peak Performance:** Discover the highest profit price achieved, when it happened, and the PnL associated with it.
*   **Analyze Drawdown:** Understand the depth of your losses, including when the worst price occurred and the related PnL.
*   **Measure Time Metrics:** Track how long a position has been active, how long a signal has been waiting, and how much time has passed since key events.
*   **Calculate Distances:** Determine the difference between the current price and peak profit/drawdown levels, expressed as both a percentage and a dollar amount.



All methods accept a `backtest` parameter to adapt to different trading environments. They all return `null` if there's no active signal to analyze.

## Class RecentLiveAdapter

This component helps manage recent trading signals and allows you to choose where those signals are stored – either persistently on disk or temporarily in memory. It’s designed to be flexible; you can easily swap out the storage mechanism without changing the rest of your code.

The default behavior is to store signals persistently, but you can switch to an in-memory storage for faster, but non-permanent, access. You can also customize the storage adapter yourself if you have a specific need.

It provides functions to retrieve the most recent signal for a particular trading setup and to calculate how long ago that signal was created. Active ping events are also handled and passed on to the currently configured storage adapter. Finally, you can clear the current storage configuration and revert back to the persistent storage default.

## Class RecentBacktestAdapter

This class provides a flexible way to manage and access recent trading signals, allowing you to choose between storing data in memory or persisting it to disk. It acts as a bridge between your backtesting framework and the actual storage mechanism.

You can easily swap out the storage backend using the `useRecentAdapter` method, or quickly switch between memory and persistent storage with `usePersist` and `useMemory`. The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods provide access to the underlying storage functionality, forwarding requests to the currently selected adapter. If you need a fresh start, the `clear` method resets the adapter back to its default in-memory configuration.

## Class RecentAdapter

The RecentAdapter is a central component for managing and accessing recent trading signals, whether you're backtesting or running live. It automatically keeps track of the most recent signals based on updates received.

You can easily get the newest signal for a particular trading pair and situation using the `getLatestSignal` function, which checks both your historical data and the live data feeds. It's designed to avoid look-ahead bias, meaning it won't show you signals that haven't actually happened yet. 

The `getMinutesSinceLatestSignalCreated` method helps you understand how long ago the last signal was generated, also accounting for the look-ahead restriction. 

To control its operation, you'll enable and disable the adapter, ensuring it only subscribes once to avoid unnecessary updates. The adapter handles the subscription and unsubscription process automatically.


## Class PriceMetaService

PriceMetaService helps you get the most up-to-date market prices for your trading strategies. It acts like a central repository, keeping track of prices for each combination of symbol, strategy, exchange, frame, and whether it’s a backtest. It ensures that you always have the right price information, even when your code isn't running directly within a trading tick.

If you need a price outside of the usual trading cycle, like when executing a command between ticks, PriceMetaService provides a reliable source. It uses a special technique to remember these prices and update them automatically.

If you're running in a live trading environment, it uses the exchange’s average price to provide you the latest data. If it hasn't received a price yet, it patiently waits for a short time.

You can also clear the stored prices to ensure you're always working with fresh data – useful when starting a backtest or live trading session. It’s like a reset button for your price information. This keeps your memory clean and prevents outdated prices from affecting your trading decisions.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, based on different strategies. Think of it as a calculator for your position sizing.

It includes several pre-built methods, each with its own way of calculating the right size, like using a fixed percentage of your account or applying the Kelly Criterion. 

Each method has built-in checks to make sure the inputs you provide are compatible with the chosen sizing approach, preventing errors and ensuring accuracy. It's designed to simplify the process of managing risk and optimizing trade sizes.


## Class Position

The Position class helps you figure out where to place your take profit and stop loss orders. It's designed to work whether you're going long (buying) or short (selling) a position.

It provides two handy functions:

*   **moonbag:**  This is a simple strategy that sets your take profit a fixed distance above (for long positions) or below (for short positions) your entry price. It essentially aims for a 50% gain.

*   **bracket:** This is more flexible. You tell it your entry price, desired stop loss percentage, and desired take profit percentage, and it calculates the exact take profit and stop loss prices you need to use. It automatically adjusts these levels based on whether you're long or short.

## Class PersistStorageUtils

This class provides tools for saving and loading signal data, ensuring that your backtesting and live trading sessions don't lose information. It handles the underlying storage management for you, creating specific storage instances for backtest and live modes.

The framework uses a clever system to remember which storage instance it's using, so you don't have to recreate them every time.

You can easily swap out the default storage mechanism with your own custom solution, or use a dummy storage for testing purposes where you don't actually want to save anything. 

If your working directory changes, you'll need to clear the storage cache to ensure everything loads correctly. The `readStorageData` and `writeStorageData` functions handle reading and saving all signal data for a given mode and automatically set up the storage if it doesn’t already exist.


## Class PersistStorageInstance

This class provides a way to store and retrieve data persistently, specifically for signals used in a backtesting environment. It uses files to manage individual signals, creating a separate file for each one based on its ID. 

The storage system is designed to be robust – even if something interrupts the process, it attempts to ensure data isn't lost. You can control whether this storage is used for a backtest or not when you create the instance. 

Initially, it needs to be fully prepared for use, which you can trigger. To retrieve all stored signals, you’ll call a function that goes through all the storage keys. When updating the data, the signals are individually written to their corresponding files based on their IDs.

## Class PersistStateUtils

This class helps manage how your trading state is saved and loaded, ensuring it survives unexpected interruptions. It acts like a central organizer for state persistence, creating and managing storage instances based on unique identifiers for signals and buckets.

Think of it as a system for keeping track of your data, making sure it’s consistently available even if things go wrong.

Here's what it does:

*   It remembers which storage methods to use for different signals and buckets, so you don't have to.
*   It lets you plug in your own ways to store data – whether that’s saving to files, using a dummy adapter for testing, or something else entirely.
*   It handles creating, reading, and writing data safely and reliably.

You can clear its memory if your working directory changes. It also allows you to clean up storage entries when signals are removed, preventing clutter. Finally, it allows to substitute default storage implementation by custom one.

## Class PersistStateInstance

This class, PersistStateInstance, provides a way to save and load data related to a trading signal to a file. It’s essentially a convenient wrapper around the file storage system, making sure writes happen reliably.

It identifies each set of data with a `signalId` and a `bucketName`, which acts like a unique identifier for the data within that signal.

To get things started, `waitForInit` makes sure the storage is ready.  You can then use `readStateData` to pull existing data and `writeStateData` to save new or updated data – both use the `bucketName` to pinpoint the correct information.

Finally, `dispose` doesn't actually do anything directly; instead, it relies on a separate utility function to clean up any temporary data it might be using.


## Class PersistSignalUtils

This class helps manage how signal data is saved and loaded for your trading strategies, ensuring it's reliable even if things go wrong. It keeps track of different signal data instances based on the trading symbol, strategy name, and exchange.

You can customize how this data is stored, for example, using files, a database, or even a dummy storage that doesn't actually save anything—useful for testing. 

When you need to read or write signal data, this class handles the process and automatically creates the necessary data storage the first time it's used. It also makes sure operations are done safely, preventing data loss or corruption.

If your working directory changes, you’ll need to clear the cached data. The class also provides ways to switch between different storage methods.

## Class PersistSignalInstance

This class, `PersistSignalInstance`, provides a reliable way to save and retrieve signal data for your trading strategies. Think of it as a safe keeper for your strategy's important information. 

It's designed to work with a specific trading symbol, strategy name, and exchange. 

The class ensures data integrity by using a file-based system and handling writes atomically, protecting against crashes. 

Here’s what you can do with it:

*   It initializes the storage needed to hold the data.
*   You can easily read the stored signal data using the symbol as an identifier.
*   You can also write new signal data, or clear existing data by setting it to null. 

Essentially, it makes persisting your signal data straightforward and crash-resistant.

## Class PersistSessionUtils

This utility class helps manage how your trading strategy's session data is saved and loaded. It provides a way to persist information like your strategy's state across different runs, even if the program crashes.

It uses a smart caching system, so it only creates and initializes storage locations once for each unique combination of strategy name, exchange, and frame. You can easily swap out the default storage method with your own custom implementation.

The `waitForInit` function makes sure the storage is ready before you start working with it, and can be used to control initial setup. You can read data back using `readSessionData` and write new data using `writeSessionData`.

There are also handy shortcuts to use a dummy storage (which does nothing) for testing or to revert to the default file-based storage. If you need to start over or clean up old data, the `clear` and `dispose` functions are there for you. Finally, `usePersistSessionAdapter` lets you provide a completely new way of managing session persistence.

## Class PersistSessionInstance

This class helps you persistently store and retrieve data related to a specific trading strategy and exchange setup. It acts as a bridge, ensuring that information like your session data is saved to a file and can be loaded later. 

Think of it as a dedicated container for storing data tied to a particular strategy and exchange, using a unique identifier called `frameName` to keep everything organized.

The `waitForInit` method ensures the storage is ready before you try to save anything.  `readSessionData` lets you retrieve the saved data, and `writeSessionData` is used to store updates.  Finally, `dispose` simply does nothing – any cleanup is managed elsewhere. It's designed to work seamlessly with the overall backtest-kit framework.

## Class PersistScheduleUtils

This class, PersistScheduleUtils, helps manage how your trading strategies remember scheduled signals – those signals that are planned for future execution. It ensures each strategy keeps track of these signals in a reliable way, even if the system crashes.

It’s designed to work seamlessly with ClientStrategy and handles the storage of scheduled signals.

You can customize how these signals are stored using different "adapters," essentially swapping out the storage mechanism. This allows you to choose between file-based storage, a dummy adapter for testing (where nothing is actually saved), or a completely custom solution.

The `readScheduleData` method retrieves an existing scheduled signal, and `writeScheduleData` saves a new one, or clears an existing one. Importantly, these actions are designed to be safe and consistent.

If you ever need to change the storage adapter, `usePersistScheduleAdapter` lets you swap it out, and `clear` helps ensure everything is fresh when settings change.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, handles saving and retrieving schedule data to a file. It’s designed to be reliable, ensuring data isn't lost even if something goes wrong.

Think of it as a safe place to store information about your trading schedule.

It uses the trading symbol, strategy name, and exchange name to identify the specific schedule it's managing.  The data is stored in a file and updated in a way that minimizes the risk of data corruption.

Here's a breakdown of what you can do with it:

*   **Initialization:** You can tell it to initialize its storage – helpful when setting things up for the first time.
*   **Reading Data:** It lets you retrieve the currently saved schedule data based on the trading symbol. If there’s no data, it returns nothing.
*   **Saving Data:**  You can use it to write new schedule data, or clear the existing schedule by providing `null`. The `symbol` acts as a unique identifier for the schedule being saved.

## Class PersistRiskUtils

This class helps manage how active trading positions are saved and retrieved, especially for risk management. It ensures that each risk profile has its own dedicated storage, and it's designed to work reliably even if something unexpected happens during the trading process.

You can easily customize how this storage works by providing your own methods for persisting data, or you can use the built-in options like saving to a file or using a dummy instance for testing.

The class intelligently creates storage instances only when needed, and it guarantees that reading and writing data happens safely and consistently.  

Here’s a bit more detail on what you can do:

*   **Changing how data is stored:** You can switch between different storage methods (like file-based, or a dummy/testing version) to suit your needs.
*   **Clearing the storage:** If your working directory changes, you’ll need to clear the storage to ensure everything is working correctly. 
*   **Reading and Writing:** The class provides simple functions to read existing position data and write new position data.

## Class PersistRiskInstance

This class helps manage and save position data persistently, ensuring it's saved reliably even if things go wrong. It acts as a middleman, wrapping another storage mechanism to ensure data is written safely and consistently. 

The class identifies each set of positions by a fixed name ("positions") to keep everything organized. It's designed to be crash-safe, meaning it won't lose data if your application unexpectedly stops working.

You give it a risk name and exchange name when you create it, which helps identify the data it's managing.

It provides methods to initialize storage, read existing position data, and write new or updated position data to that storage. The `waitForInit` method ensures the storage is ready before you try to read or write anything.

## Class PersistRecentUtils

This class, `PersistRecentUtils`, helps manage how recent trading signals are saved and retrieved, ensuring data is handled safely and consistently. Think of it as a helper for remembering the latest signal for each specific trading strategy and market. 

It cleverly uses a system where each signal is stored based on a unique combination of factors like the traded asset, the strategy being used, the exchange, and even the timeframe.

You can even customize how these signals are stored by providing your own way of handling them.

This utility is used internally by other tools designed for backtesting and live trading.

Here’s a bit more detail on what you can do:

*   **PersistRecentInstanceCtor:** This lets you define precisely how these signals are stored, and you can swap this out to change the storage method.
*   **createKey:** This defines how the unique storage location for each signal is created.
*   **getStorage:** This is the mechanism for making sure each signal is stored in the right place, based on the key.
*   **readRecentData:** This gets the most recent signal, making sure it creates the necessary storage if it doesn’t already exist.
*   **writeRecentData:** This saves a new signal, again creating the storage if needed.
*   **usePersistRecentAdapter:** Allows you to change the storage method being used.
*   **clear:**  Useful if your environment changes, like if you're running multiple strategy iterations, to make sure the data isn’t mixed up.
*   **useJson / useDummy:** These provide quick ways to switch between a standard file-based storage and a dummy storage for testing.

## Class PersistRecentInstance

This class helps you save and load the most recent data for a trading signal, ensuring it's persisted even if your program restarts. It's designed to work with a specific trading symbol, strategy, exchange, and timeframe, and it remembers whether the data comes from a backtest or live trading environment. 

The class uses files to store this data, organizing it based on the trading context (symbol, strategy, exchange, frame, and backtest/live mode).

Here's a breakdown of what it does:

*   **Initialization:** `waitForInit` makes sure the storage is ready before anything else happens.
*   **Loading:** `readRecentData` retrieves the latest signal data associated with the symbol.
*   **Saving:** `writeRecentData` saves a new signal, marking the time it was recorded.

Essentially, it’s a convenient way to keep track of your most recent signal data, automatically managing where it’s stored and how it's organized.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and safely store partial profit and loss information for your trading strategies. It acts as a central hub for keeping track of these values, ensuring they're handled reliably even if there are interruptions.

It intelligently caches storage instances based on the symbol, strategy, and exchange being used, so you don't have to recreate them constantly.  You can even customize how these storage instances are created, allowing you to choose between file-based storage, a dummy instance for testing, or a custom adapter you build yourself.

If you need to retrieve previously recorded partial data or update it, `readPartialData` and `writePartialData` provide the way, automatically setting up the storage if it doesn’t exist already. There's also a `clear` method available to flush the cache when conditions change. Finally, functions like `usePersistPartialAdapter`, `useJson`, and `useDummy` make it easy to switch between different persistence methods.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, handles saving and retrieving pieces of data related to your trading strategies. It's designed to be reliable, even if your system crashes.

Think of it as a way to temporarily store information—like intermediate calculations or partial results—while a trading strategy is running. It uses a file to keep track of this data, ensuring it’s saved safely.

Each instance is tied to a specific trading symbol, strategy name, and exchange. The class keeps track of its internal storage, handles initializing it, and provides methods to read and write this partial data using a unique signal identifier. This makes it easy to manage temporary data during the backtesting process.


## Class PersistNotificationUtils

This class provides tools to reliably manage how notification data is saved and loaded. It's a behind-the-scenes helper used by other components for storing information related to notifications.

It cleverly caches notification storage instances, so it doesn't have to recreate them repeatedly.

You can customize how notifications are persisted by providing your own storage mechanism.

Each notification's data is stored in its own file, and the process is designed to be safe even if things go wrong unexpectedly.

The class includes methods to switch between different storage options, such as a standard file-based system, a JSON-based approach, or even a dummy version that doesn't actually save anything (helpful for testing). It also provides a way to clear the cache when needed, ensuring that changes to settings are reflected in the storage.

## Class PersistNotificationInstance

This class helps you reliably store and retrieve notification data, particularly useful when you need to keep track of events over time. It’s designed to be resilient even if your system crashes unexpectedly. 

Each notification is saved as a separate file, making it easy to manage individual pieces of information. When you need to retrieve all your notifications, it goes through each file.

The class has a setting to indicate whether it's being used for a test environment, and it uses a file system to hold the notification data.

You can use `waitForInit` to make sure the storage is ready before you start working with it. To get all the notifications, use `readNotificationData`, and to save them, use `writeNotificationData`.

## Class PersistMemoryUtils

This utility class helps manage how your memory data is saved and loaded, especially when dealing with crash-safe data persistence. It keeps track of storage instances for different signals and buckets, making sure you don’t create unnecessary duplicates.

You can customize how memory instances are created by providing your own constructors, or easily switch back to the default file-based system or even a dummy version for testing.

The class provides functions to read, write, check for the existence of, and delete memory entries. It also includes a way to clear the internal cache when your working directory changes. You can also clean up storage associated with signals that are no longer needed. Finally, it provides a way to iterate through all stored memory entries, useful for index rebuilding.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data to files. It's built to work seamlessly within the backtest-kit trading framework.

Think of it as a dedicated place to save information related to a specific signal and bucket.

It uses a file-based system for storage, ensuring that data is safely written and can be recovered later.  It allows you to "soft-delete" entries—essentially marking them as removed rather than physically deleting them—and provides a way to list only the active, non-deleted data.

Initializing the storage is handled through `waitForInit`, and individual memory entries are accessed by their unique ID. You can read, write, and remove entries, and the `listMemoryData` method gives you a way to get all the valid memory entries.  The `dispose` method doesn't do anything directly; it relies on a separate utility to clear any associated caches.

## Class PersistMeasureUtils

This utility class helps manage how your trading strategy's data from external sources (like APIs) is stored persistently. It's designed to make sure this data is handled reliably, even if your strategy crashes unexpectedly.

The class uses a clever system where it creates and manages storage instances based on specific identifiers – essentially, it creates a dedicated storage area for each unique combination of timestamp and symbol. 

You can customize how this storage actually works by providing your own "adapter" – a way to handle the storage using different methods.  There are also some built-in options for convenience, like using a standard file-based storage or a dummy adapter that does nothing at all (helpful for testing).

The class offers functions for reading, writing, and deleting data, and it automatically creates the necessary storage areas as needed.  It also keeps track of what's been removed but not yet physically deleted, and provides ways to clear out this cache when your environment changes.

## Class PersistMeasureInstance

This class helps you reliably store and retrieve data for your backtesting simulations, using files on your computer. It's designed to handle measure data, which represents specific pieces of information you're tracking during a backtest. 

The class manages a "bucket," essentially a folder where your data is kept. It safely writes data to files, ensures changes are applied correctly, and offers a way to mark data as deleted without actually removing the file – a process called soft deletion.

When you need to load data, `readMeasureData` fetches a specific entry by its unique key, returning nothing if it’s missing or has been soft-deleted. `writeMeasureData` lets you save new data or update existing entries.

If you need to remove data, `removeMeasureData` simply flags it as deleted, keeping the file intact. When listing your data, `listMeasureData` provides a way to get a list of available keys, excluding any that have been marked for deletion. It also initializes the underlying storage to ensure everything is ready to go.

## Class PersistLogUtils

This class provides tools to handle saving and retrieving log data, ensuring that your trading strategy's history is preserved. It uses a cached instance of a log manager, allowing it to quickly access and update log entries.

You can customize how the logs are stored by swapping out the default log manager with your own. This allows for flexibility in storage solutions.

The class automatically handles saving new log entries, making sure to avoid duplicates. Retrieving all the log data is also straightforward.

There's functionality to clear the log instance, which is particularly useful when your working directory changes. Options exist to easily switch back to the default file-based logging or to use a dummy log instance for testing, where no actual saving takes place.

## Class PersistLogInstance

This class provides a way to persistently store trading logs to files on your computer. It’s designed to be reliable, even if your program crashes unexpectedly.

Each log entry is saved as a separate JSON file, ensuring that you can access individual entries easily.  The system only adds new entries; it doesn't modify or delete existing ones, which helps prevent data loss.

Before you start using it, you'll need to initialize the underlying storage.  To retrieve all the stored log entries, you can use a function that scans through all the available files. The primary function is for saving log data and it adds new entries, skipping over any entries that have already been saved.


## Class PersistIntervalUtils

This component helps manage whether a specific trading interval has already fired for a given data bucket. It essentially keeps track of which intervals have been processed.

It stores this information as files under a designated directory (`./dump/data/interval/`), with each file representing a fired interval for a specific bucket and key. If a file exists, it signifies the interval has already run; if it's missing, it means it hasn't.

You can customize how these markers are stored using adapters.  For example, you can switch to a simple file-based adapter, a dummy adapter that does nothing, or provide your own custom constructor.

The `readIntervalData` and `writeIntervalData` methods handle loading and saving these markers, and they also handle creating the initial storage for a bucket if it doesn't already exist.  `removeIntervalData` allows "soft" deleting a marker. The `listIntervalData` method lets you iterate through the fired intervals within a bucket. Finally, `clear` wipes the cached storage, which is helpful when your working directory changes during a strategy run.

## Class PersistIntervalInstance

This component provides a way to store and manage data related to specific intervals, like when a trading strategy should execute. It's designed to work with files, making it persistent across restarts of your application.

The system uses a "bucket" to organize the data, allowing you to keep different intervals separate. Data is stored as JSON files and uses a simple mechanism for soft-deleting entries—instead of deleting a file, a flag is set to indicate it's no longer active.

You can read existing interval data, write new data, or remove existing data using provided methods. Listing available intervals excludes those that have been soft-deleted, ensuring that your strategies can reactivate them if necessary. The `waitForInit` function ensures the underlying storage is ready before any operations are attempted.

## Class PersistCandleUtils

This utility class helps manage a cache of historical candle data for trading strategies. It stores each candle as a separate JSON file, organized by exchange, symbol, timeframe, and timestamp. The system checks if the cached data is still valid before using it and automatically updates the cache when needed. 

You can customize how the cache is implemented, for example, by providing your own way to store and retrieve the candle data. The `getCandlesStorage` property helps ensure that the right cache instance is used for each combination of symbol, timeframe, and exchange.

The `readCandlesData` method retrieves the cached candle data within a specified time range, while `writeCandlesData` saves new candles to the cache. To change the candle cache implementation, you can use `usePersistCandleAdapter`, `useJson` (to use the default JSON-based storage), or `useDummy` (for testing purposes with an empty cache). Finally, `clear` is useful to refresh the cache when the working directory changes.


## Class PersistCandleInstance

This component helps you save and retrieve historical candle data, acting as a persistent storage layer for your trading system. It’s specifically designed to store each candle as a separate file, using the timestamp as its unique identifier.

Think of it as a simple file-based database for your candles.

If you try to read data for a time period that doesn't exist in the files, it will return null, prompting your system to fetch the data from the original source. It only saves complete candles - those with a closing time in the past - and avoids overwriting existing data, ensuring the cache remains append-only. If it finds a problem with the stored candle data, it will let you know with a warning before treating it as if it weren't there.

The system knows which symbol, interval, and exchange the data belongs to.
It manages the underlying file storage, and it has a method to ensure the storage is ready for use.


## Class PersistBreakevenUtils

This utility class helps manage and store breakeven data persistently for your trading strategies. It’s designed to save and load breakeven information to disk, ensuring your progress isn't lost. The class cleverly uses a caching system, so it only creates the necessary data storage objects when you actually need them.

It organizes your breakeven data in a specific file structure, creating separate files for each trading symbol and strategy combination.

You can customize how this data is stored by swapping in different “adapters” – essentially, you can choose to use the default file-based storage, a dummy adapter for testing (which doesn’t actually save anything), or even provide your own custom storage solution.

If you're changing the working directory of your process, you'll want to clear the internal cache to make sure data is reloaded correctly. It's designed as a global utility, making sure you're always working with the right data for your trading strategies.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data for your trading strategies, even if things go wrong. It's designed to be a persistent storage solution, meaning your data survives crashes.

The class keeps track of the symbol, strategy name, and exchange name it's associated with.  It handles the actual storage using files, ensuring your data is saved securely and consistently for each context.

To get started, you need to specify the symbol, strategy name, and exchange name when creating an instance.

The `waitForInit` method ensures the storage is ready before you start working with it, and the `readBreakevenData` method retrieves existing data for a specific signal. Finally, `writeBreakevenData` allows you to save new or updated breakeven information linked to a signal.

## Class PersistBase

PersistBase provides a foundation for reliably storing and retrieving data to files. It's designed to ensure data integrity, even if things go wrong during writes.

The framework handles the details of file management, including creating the storage directory and validating that files aren't corrupted. You can easily list all the data you're storing using an asynchronous generator.

It offers methods for reading, writing, and checking the existence of data, all while performing file operations safely to prevent data loss. This base class simplifies working with file-based persistence and guarantees robust handling of your data. 

The `entityName` specifies what kind of data you're storing, while `baseDir` is the main folder where the data will be saved. Internally, it keeps track of the actual directory path. `waitForInit` sets up the storage location and checks existing data upon initialization.


## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run. It listens for timing information as your strategy executes and saves that data so you can later identify bottlenecks and areas for improvement.

You can think of it as a detective, quietly observing and recording the durations of various operations.

To use it, you'll subscribe to receive these timing events. When you're done, you'll unsubscribe to stop the recording. 

The service uses a logger to help with debugging and ensures you only subscribe once to avoid issues. The `track` property is the key component for processing and logging these timing details into the performance database.


## Class PerformanceMarkdownService

The PerformanceMarkdownService helps you keep track of how your trading strategies are performing. It listens for performance data, organizes it by strategy, and calculates key statistics like average, minimum, maximum, and percentiles. 

It can then generate clear, readable reports in Markdown format, highlighting potential bottlenecks and areas for improvement. These reports are saved automatically to your logs folder.

You can retrieve specific performance statistics for a given strategy and symbol, or request a full report. The service also allows you to clear the accumulated data when necessary. It uses a unique storage system for each combination of symbol, strategy, exchange, frame and backtest, ensuring data isolation. Subscribing to performance events is protected to prevent duplicate subscriptions and provides a way to unsubscribe when needed.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to analyze metrics and generate reports.

You can retrieve aggregated performance data for specific symbols and strategies, revealing details like how long operations take, their average duration, and volatility. 

The class can also create nicely formatted markdown reports that visually break down performance, pinpointing potential bottlenecks by examining time distribution and percentiles. 

Finally, you can easily save these reports to disk, defaulting to a directory structure like `./dump/performance/{strategyName}.md`, for later review or sharing. This simplifies tracking and sharing performance insights.

## Class PartialUtils

This class helps you analyze and report on partial profit and loss events, providing a way to understand how your trading strategies are performing. It acts as a central point to access and organize data collected about smaller, incremental gains and losses.

You can use it to get summarized statistics like total profit/loss counts for a specific trading symbol and strategy.

It also allows you to generate easy-to-read markdown reports, displaying a table of individual profit/loss events with details like action, symbol, signal ID, position, level, price, and timestamp.  These reports are designed to be human-friendly.

Finally, you can easily save these markdown reports to files, creating a record of your trading performance. The files will be named in a clear format, such as "BTCUSDT_my-strategy.md", making them easy to organize and review. The entire process is designed to simplify understanding and documenting partial profit/loss activity within your trading framework.


## Class PartialReportService

The PartialReportService helps you keep track of every time a position is partially closed, whether it's a profit or a loss. It essentially acts as a recorder for these "partial exit" events.

It listens for signals indicating partial profit and partial loss events, then saves details like the price and level at which these closures occurred into a database.

To use it, you'll subscribe to receive these signals and it will alert you when a partial position is closed. When you’re done, you can unsubscribe to stop receiving updates. The service also has a built-in mechanism to prevent accidental multiple subscriptions.


## Class PartialMarkdownService

The PartialMarkdownService is designed to automatically generate and save reports detailing your trading profits and losses. It listens for events indicating profit or loss on trades.

It keeps track of these events for each symbol and trading strategy you use, building up a record of each one.

You can then request these reports, which are formatted as readable markdown tables, along with overall statistics about your trading performance. These reports are saved to your disk for later review.

The service offers ways to retrieve accumulated data, generate reports, save those reports to disk, and even clear the stored data when you need to start fresh. You subscribe to receive updates about profit and loss events, and can later unsubscribe to stop receiving them.

## Class PartialGlobalService

This service acts as a central hub for managing and tracking partial profits and losses within the trading system. It’s designed to keep things organized and provide a consistent way to monitor these partial states.

Think of it as a middleman – it receives requests related to partial profits and losses, logs them for monitoring, and then passes them on to the actual connection service that handles the details.

The service is injected into the core trading strategy, allowing for a structured approach to managing dependencies. It's also responsible for validating certain configurations, like the strategy and associated risks, to ensure everything is set up correctly.

It offers methods for recording profits, losses, and clearing these partial states, all while ensuring operations are logged for auditing and debugging. Essentially, it provides a unified and traceable way to manage partial trading results.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for each trading signal. Think of it as a central hub that keeps track of each signal’s performance.

It creates and manages individual "ClientPartial" objects, one for each signal, acting like a factory to create them and ensuring they’re properly handled. These ClientPartial objects are cached for efficiency, so they don't need to be recreated repeatedly.

When a signal generates profit or loss, this service handles the updates and makes sure the relevant events are triggered. It also cleans up the records when a signal is closed out, preventing unnecessary data from sticking around.

The service relies on other components like a logger and an action core to do its job effectively, and it's injected into the overall trading strategy for seamless operation. This whole process ensures that profit and loss information is tracked accurately and efficiently across all signals.

## Class NotificationLiveAdapter

This component manages how your trading strategy sends out notifications about its progress. It's designed to be flexible, allowing you to easily switch between different notification methods without changing your core strategy code.

You can choose how notifications are handled, storing them in memory, saving them to a file, or even effectively ignoring them altogether (using the "dummy" adapter for testing).

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods all pass along relevant information to the currently selected notification method.  The `getData` method retrieves all stored notifications, and `dispose` clears them.

If you need a different way to send notifications, you can replace the default adapter with your own implementation. You can quickly switch to a dummy adapter to silence notifications, or change to persistent storage to retain them. The `clear` method is important if your environment changes during backtesting.

## Class NotificationHelperService

This service helps manage and send out notifications related to trading signals. It's like a central hub for making sure everything is set up correctly before a signal is sent.

It automatically checks the strategy, exchange, frame, risk and action schemas to avoid issues, and it only does this check once for each unique combination of strategy, exchange, and frame name—meaning it’s efficient and doesn’t repeat unnecessary work.

The `commitSignalNotify` function is how the system sends out these notifications. It gathers information, validates settings, and then delivers the signal information. This is the method used when active pings occur, allowing the framework to communicate signal details and data.


## Class NotificationBacktestAdapter

This component acts as a central hub for managing notifications during backtesting. It's designed to be flexible, allowing you to easily switch between different ways of storing or handling those notifications – whether that's keeping them in memory, saving them to a file, or simply discarding them.

You can think of it as a messenger that relays important events like signals, profit updates, errors, and more to a chosen notification system.

Initially, it uses an in-memory system for notifications. However, you can easily change this to use a persistent storage (saving notifications to disk) or a "dummy" adapter that doesn't store anything.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, `handleError`) are how you send those notifications to the active adapter. The `getData` method lets you retrieve all the notifications that have been recorded, and `dispose` clears them out.

If you need to change the notification method mid-backtest, you can use methods like `useDummy`, `useMemory`, and `usePersist` to quickly switch.  If your environment changes in a way that affects where files are located (like changing the current working directory), be sure to use `clear` to reset to the default in-memory adapter and ensure notifications are handled correctly.

## Class NotificationAdapter

This component acts as a central hub for managing notifications during backtesting and live trading. It automatically keeps track of important events like signal updates, profit/loss changes, and error conditions. 

You can easily subscribe to these notification events to receive real-time updates. To prevent redundant subscriptions, it uses a "single shot" mechanism.

It's designed to provide a single, unified way to access notifications regardless of whether you're in backtest mode or live trading.

To start, you enable the notification system to listen for updates. To stop, simply disable it, and it’s safe to call this multiple times. 

You can retrieve all stored notifications for either backtesting or live trading sessions, and when you're finished, you can clear the storage to ensure everything is clean.


## Class MemoryLiveAdapter

This component provides a flexible way to manage trading memory during live sessions. It acts as a central hub, allowing you to easily switch between different storage methods like keeping data only in memory, saving it to files, or even discarding it entirely for testing.

You can choose where your data lives: in-memory for speed, persisted to files for long-term storage, or a dummy adapter for testing purposes. It's designed to be adaptable—you can even plug in your own custom storage solutions. The `disposeSignal` function is important for cleaning up memory when signals are closed.

The adapter uses a clever system to store data efficiently, and provides methods to write, search, list, remove, and read memory entries.  If your working directory changes, be sure to use the `clear` function to refresh the adapter's configuration.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory for your backtesting framework. It allows you to easily swap out different storage methods, choosing between a simple in-memory solution, a persistent file-based option, or even a dummy adapter for testing purposes. The default setup uses an in-memory system that utilizes BM25 for searching and doesn't save data between runs.

You can quickly switch between storage methods using `useLocal`, `usePersist`, and `useDummy` functions. For more advanced scenarios, you can even plug in your own custom memory adapter. The adapter also manages cached instances for efficiency, which are cleared when a signal is canceled.

When working with this adapter, you'll have methods for writing data (`writeMemory`), searching (`searchMemory`), listing entries (`listMemory`), removing entries (`removeMemory`), and reading single entries (`readMemory`).  If your working directory changes during backtest iterations, be sure to call `clear` to refresh the cached instances. This makes sure your backtest uses the correct directory paths.

## Class MemoryAdapter

The MemoryAdapter is the central component for managing how data is stored and accessed during backtesting and live trading. It's designed to keep track of memory instances and automatically clean up old data when signals are no longer active, preventing issues caused by outdated information.

Think of it as a traffic controller that directs data writing, searching, listing, removing, and reading operations either to the backtesting environment or to the live trading system, based on where the data belongs.

The `enable` property is like a switch that activates this memory management, ensuring everything is set up correctly.  You can safely call the `disable` property multiple times to turn off memory storage.

The `writeMemory` function lets you save information to memory, while `searchMemory` allows you to find what you're looking for using powerful full-text search.  `listMemory` retrieves all the stored entries, `removeMemory` deletes specific items, and `readMemory` pulls a single piece of data. The adapter handles the specifics of where to do these actions based on whether you're running a backtest or live trades.

## Class MaxDrawdownUtils

This utility class helps you analyze and understand the maximum drawdown experienced during trading simulations or live trading. It acts as a central place to access information gathered about drawdown events. 

You can retrieve detailed statistical data like the maximum drawdown amount, recovery time, and more, by specifying the trading symbol, strategy name, exchange, and timeframe. 

Want to see a comprehensive report of all drawdown events? It can generate a markdown report showing each instance of a drawdown for a given symbol and strategy.

Finally, it offers a convenient way to automatically save this markdown report directly to a file, streamlining the process of documenting and sharing drawdown information.

## Class MaxDrawdownReportService

This service is designed to keep track of maximum drawdown events and store that information for later analysis. It actively monitors for drawdown occurrences and records them in a structured JSON format.

The service receives updates about drawdown events and writes them to a database for reporting and analytics purposes. Each record includes details like the timestamp, symbol, strategy name, exchange name, and the specifics of the trade signal, including open, take profit, and stop-loss prices. 

To get started, you need to subscribe to the drawdown events.  Subscribing also provides a way to stop monitoring by returning an unsubscribe function which will detach the service from the event stream. If you don’t subscribe, attempting to unsubscribe won't do anything.

## Class MaxDrawdownMarkdownService

This service helps you automatically create and save reports about maximum drawdown, a key risk metric for trading strategies. It listens for drawdown events and organizes them by symbol, strategy, exchange, and timeframe. 

You can start receiving these events by subscribing, and stop them by unsubscribing, which also clears any collected data. The `tick` method processes individual drawdown events as they come in.

To retrieve the accumulated data, use `getData`. To generate a formatted markdown report, use `getReport`.  `dump` will create the report and write it directly to a file. 

Finally, `clear` provides a way to reset the service – you can clear the data for a specific combination of symbol, strategy, exchange, and timeframe, or completely wipe all accumulated data.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your backtest reports are saved. It provides a flexible way to choose where and how your reports are stored, letting you switch between saving them in individual files, appending them to a single log, or even suppressing the output entirely. This component uses a clever system to ensure that only one storage instance exists for each type of report (like backtest, live, or walker results), making it efficient and reliable. 

You can easily change how reports are saved by setting a new storage adapter. It automatically creates the necessary storage when you first write data.

Here's a quick overview of the available options:

*   **`useMd()`:** This is the default – it saves each report as a separate markdown file.
*   **`useJsonl()`:** This option gathers all reports into a single, append-only JSONL file.
*   **`useDummy()`:** This completely disables markdown output.
*   **`clear()`:** This clears the storage cache, useful if the working directory changes during a test.



The `MarkdownFactory` property lets you customize the type of storage used, and `getMarkdownStorage` is a behind-the-scenes cache that keeps track of your storage instances.

## Class MarkdownUtils

The MarkdownUtils class helps you manage how markdown reports are generated for different parts of your trading system, like backtests, live trading, or performance analysis. It lets you turn report generation on or off for specific areas.

You can use the `enable` method to start collecting data and generating markdown reports for the features you want – remember to call the returned function later to stop the data collection and clean up.

If you only want to temporarily stop report generation for a few things, `disable` lets you turn off those reports without affecting the others. 

Finally, the `clear` method allows you to reset the data collected for reports without stopping the report generation itself – a good way to start fresh without interrupting the process.

## Class MarkdownFolderBase

This class helps you organize your trading reports into a directory structure, with each report saved as its own markdown file. It's designed for situations where you want clearly separated, human-readable reports.

The adapter creates a new markdown file for each report, automatically setting up the necessary directories based on your configuration options.  You don't need to worry about managing streams, as it writes the content directly to the file. 

The file's location is determined by the `options.path` and `options.file` settings, creating a predictable file format.

Initialization is handled automatically because it writes directly to files. 

Essentially, it's your go-to choice for reports intended for manual review and a clean, organized directory layout.

## Class MarkdownFileBase

This component handles writing markdown reports to a file in a specific JSONL format, designed for easy post-processing and centralized logging. It creates a single file for each type of markdown report, ensuring each line contains a JSON object with the markdown content, relevant metadata like the symbol and strategy used, and a timestamp.

The adapter automatically manages the file location and creation, and it’s built to be reliable with features like timeout protection and backpressure handling to prevent data loss during writes. Initialization is handled automatically, but you can explicitly call `waitForInit` if needed, although it only runs once. You'll use the `dump` method to send markdown data to the file, which takes the markdown text and options to set the metadata.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, giving you flexibility in how it's organized. It lets you easily switch between different storage methods, like keeping each markdown file as a separate document or appending them all to a single JSONL file. 

You can set the default storage method using `useMarkdownAdapter`, but shortcuts like `useMd` (for separate files) and `useJsonl` (for a single file) make it even simpler.  

If you just want to test things out without actually writing any data, `useDummy` will discard all writes. The system remembers which storage method you’ve chosen and only creates one storage instance for each type of markdown you're using, making it efficient.

## Class LoggerService

The `LoggerService` helps you keep your trading framework's logs organized and informative. It's designed to add extra details to your log messages automatically, so you don't have to remember to include them each time.

It uses a provided logger, but if you don't set one up, it will simply do nothing.

The `LoggerService` intelligently adds context to each log entry, including things like the strategy name, exchange, the part of the code being executed, and any relevant symbols or timestamps. This makes it much easier to track down issues and understand what's happening during backtests or live trading.

You can customize the logging behavior by providing your own `ILogger` implementation.  The `setLogger` method allows you to swap in a different logging system. 

The service also has internal components to manage the context it adds, which are the `methodContextService` and `executionContextService`.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting environment. It lets you choose where your log messages are stored – whether that’s in memory, persistently on disk, or even discarded entirely with a dummy adapter. 

You can easily switch between these different storage methods using methods like `usePersist`, `useMemory`, and `useDummy`. The `useLogger` function gives you even more control, allowing you to plug in your own custom log implementations. 

The `getList` method lets you retrieve all the log entries that have been recorded, and the `log`, `debug`, `info`, `warn` methods are all shortcuts for sending messages at different severity levels. Finally, `clear` provides a way to reset the logger to its initial in-memory state, which is particularly useful when the environment changes during backtesting.

## Class LiveUtils

This class provides tools for running and managing live trading sessions. It's designed to simplify the process, handle crashes gracefully, and give you real-time insights.

The main feature is the `run` method, which starts a live trading session for a specific symbol and strategy.  It’s like a continuous engine that keeps running, even if your program unexpectedly stops. The `background` method is similar, but it runs the trading process silently without displaying results, making it perfect for background tasks.

You can also get information about your current position using methods like `getTotalPercentClosed`, `getBreakeven`, and `getPositionInvestedCost`.

The class also helps you manage signals, cancel scheduled signals, and adjust take profit and stop-loss levels.  There are also methods to generate reports and get statistical data about your trading activity. It's all about keeping your live trading running smoothly and providing useful data.

## Class LiveReportService

The LiveReportService is designed to keep a record of everything your live trading strategy is doing, storing that information in an SQLite database. It listens for events as your strategy goes through its lifecycle – from being idle to opening a position, actively trading, and finally closing it.

Each time an event happens, like a new signal or a trade being closed, the service logs all the details, providing a complete picture of what’s happening in real-time. The service writes this data to the database to preserve it.

To prevent accidental double-logging, it uses a clever system to ensure it only subscribes to the live signal events once. You can easily stop the service from tracking by using the unsubscribe function it provides, and if it wasn't subscribed in the first place, unsubscribing does nothing. You'll also find a logger service built in to help with debugging.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically generate reports about your live trading activity. It keeps track of everything that happens during trading – from periods of inactivity to when trades are opened, active, and closed.

This service creates detailed markdown tables summarizing these events for each strategy you're using. It also calculates useful trading statistics like win rate and average profit/loss.

The reports are saved as markdown files in a logs/live/ directory, making it easy to review your trading performance.

To start using it, you'll subscribe to your live signal emitter and provide the `tick` function within your strategy’s `onTick` callback. The service then uses this information to generate the reports and statistics.

You can retrieve the accumulated data, generate reports, or clear the stored data for specific trading combinations (symbol, strategy, exchange, frame, and backtest flag) or globally.

## Class LiveLogicPublicService

The LiveLogicPublicService is designed to make live trading easier to manage. It handles the complex coordination of trading activities and keeps track of important information like the strategy and exchange being used.

It’s like a helper that automatically passes along necessary details to various trading functions, so you don't have to do it manually.

This service continuously runs, providing a stream of trading results – signals to open, close, or cancel positions – and it's built to be resilient, automatically recovering from crashes by saving and restoring its progress. It uses the current time to manage the trade progression.


## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, orchestrating everything behind the scenes. It continuously monitors market data in a loop, checking for new trading opportunities. 

The service generates updates in real-time, focusing on signals that have actually resulted in trades being opened or closed – it doesn’t send updates for signals that are simply active.

Think of it like a never-ending stream of trading events. If something goes wrong and the process crashes, it’s designed to automatically recover and continue where it left off. To make this happen, it relies on other components like the logger service, strategy core service, and method context service to function properly. You provide the symbol you want to trade, and it handles the rest, providing a continuous flow of trading results.


## Class LiveCommandService

LiveCommandService helps manage live trading operations by providing a convenient way to access and use live trading functionality within the backtest-kit framework. It acts as a middleman, simplifying dependency injection and ensuring smooth integration with public API exports.

This service handles tasks like validating strategies and exchanges, and managing risk and action validations during the live trading process.

The core function, `run`, initiates live trading for a specific symbol, providing continuous data updates via an asynchronous generator. It’s designed for resilience, including automatic recovery from potential crashes during live execution. The `run` function needs the strategy name and exchange name to properly execute the live trading process.

## Class IntervalUtils

The `IntervalUtils` class provides a way to control how often your functions are executed, especially within trading strategies that need to run tasks at specific time intervals. Think of it as a way to prevent your functions from running too frequently, ensuring they only fire once per interval.

It offers two main modes of operation: in-memory, which keeps track of firing within the current process, and file-based, which persists the fired state to disk, so it survives process restarts. The `fn` method is for functions that don’t need persistence, while the `file` method provides that persistent record.

Each function you wrap gets its own independent tracker, meaning different functions will operate independently.

You can also manually clean up these trackers using `dispose` to remove specific functions from the system or `clear` to wipe them all out. The `resetCounter` helps to avoid conflicts when the environment changes between strategy runs. It’s designed to be a singleton, accessed as `Interval`, making it easy to use throughout your backtesting framework.

## Class HighestProfitUtils

This class helps you understand and report on the highest profit events recorded during trading simulations. It's like a central place to gather and analyze the best-performing trades for a specific strategy and symbol. 

You can use it to get detailed statistical data about those top trades, generate a clear markdown report summarizing them, or even save that report directly to a file.

Think of it as a tool for digging into your most successful trades and learning from what made them work so well.

Here’s what you can do:

*   **`getData()`**: Get a collection of statistics related to the highest profits.
*   **`getReport()`**: Create a human-readable markdown report of the highest profit events. You can customize what columns appear in the report.
*   **`dump()`**: Generate and save a markdown report to a file, again with options for which columns to include.

## Class HighestProfitReportService

This service is designed to keep track of the highest profit achieved during a trading backtest. It listens for events indicating a new highest profit has been reached and records these events in a structured, persistent format suitable for analysis.

Essentially, it takes the data from each time a new profit record is set and saves it to a database in a JSONL format. This data includes important details like the timestamp, symbol, strategy name, exchange, and backtest information, as well as specifics about the signal, position, and pricing.

To get it working, you'll need to subscribe it to a specific event stream. This subscription is handled in a way that prevents it from accidentally subscribing multiple times. When you’re finished with the service, you can unsubscribe to stop the logging of profit records.

## Class HighestProfitMarkdownService

This service is designed to create and save reports detailing the highest profit achieved for different trading scenarios. It listens for incoming data about trading activity and organizes it based on the symbol, strategy, exchange, and timeframe used.

You can subscribe to receive these data events, though it prevents multiple subscriptions to avoid unnecessary processing. Unsubscribing will stop the data reception and clear all accumulated information.

The service provides methods to retrieve the raw data, generate formatted reports, and save those reports as markdown files to disk. You can specify which symbol, strategy, exchange, and timeframe to report on.

For targeted cleanup, the `clear` method allows you to selectively erase data for a specific trading combination. If called without any specific parameters, it completely clears all stored data.

## Class HeatUtils

HeatUtils helps you visualize and understand your portfolio's performance across different strategies and symbols. It acts as a central place to gather and display statistics, like total profit, Sharpe ratio, and drawdown, for each asset your strategy has traded.

You can easily retrieve the raw data used to generate these visualizations, or have it formatted into a readable markdown report.

It's designed to be simple to use, as it handles the details of collecting data from all your closed trades and presents it in a useful way.

You can even save the generated report directly to a file. It’s a handy tool for quickly assessing and comparing the effectiveness of your trading strategies.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading decisions by recording when signals are closed, specifically focusing on the profit and loss (PNL) associated with those closures. It essentially listens for closed signal events across all your trading symbols and stores this information in a database.

This service is designed to give you a portfolio-wide view of your trading activity, allowing you to spot patterns and understand performance across different assets.

You can subscribe to receive these signal events; however, it prevents accidental multiple subscriptions using a single shot mechanism. Remember to unsubscribe when you no longer need the service to avoid unnecessary database logging. The logger service provides debug output, giving you insights into its operation.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance using heatmaps and markdown reports. It listens for trading signals and gathers statistics about each symbol and strategy you're using.

Think of it as a central hub for collecting and presenting your trading data, breaking it down by exchange, timeframe, and backtest mode.

It allows you to subscribe to receive trading events, which it then organizes and aggregates. You can request a snapshot of your data with `getData` or generate a nicely formatted markdown report with `getReport` and `dump`. 

If you want to start fresh or clear out old data, the `clear` function lets you reset the stored information for specific configurations or everything at once. The service is designed to handle potential errors gracefully and uses memoization for efficient storage management.

## Class FrameValidationService

This service helps you keep track of your trading timeframes, ensuring they're correctly defined and available for use. Think of it as a central registry where you register your different timeframe configurations, like "1m", "5m", or "1h".

Before you start using a timeframe in your backtesting process, you can use this service to confirm it’s properly set up. It remembers previous validation results to speed things up.

You can add new timeframes using `addFrame`, verify the existence of a timeframe with `validate`, and retrieve a full list of all registered timeframes with `list`. This helps prevent errors and makes your framework more robust. The service also utilizes a logger to help you track and troubleshoot any issues related to frame validation.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of the different structures, or schemas, used within your trading system. It's like a central catalog for defining what a "frame" looks like.

This service uses a special registry to securely store these schemas in a way that prevents errors due to incorrect data types.

You can add new frame schemas using the `register` method, and update existing ones with `override`. If you need to use a schema, simply retrieve it by name with `get`.

The service also performs quick checks during registration to ensure the schema has all the necessary components and is generally set up correctly. This helps catch potential issues early on.

## Class FrameCoreService

FrameCoreService is the central hub for managing timeframes within the backtesting environment. It essentially handles the creation of the time windows you'll be analyzing.

It works closely with FrameConnectionService to fetch and organize those timeframes, and it’s a critical component used behind the scenes by the core backtesting logic.

You can use the `getTimeframe` method to retrieve a specific array of dates for a given symbol and timeframe name – think of it as getting the exact time slices you need for your test. This service is designed to ensure consistency and proper handling of timeframe data during the entire backtesting process.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different frame implementations within the backtest-kit. It intelligently routes requests to the correct frame based on the active method context, essentially determining which timeframe you’re working with.

To optimize performance, it uses a caching system, so frequently used frame instances are readily available without needing to be recreated each time. 

This service also handles the backtest timeframe, allowing you to define a start and end date, and an interval, to constrain your backtest to a specific period. 

When running in live mode, the frameName is intentionally empty, indicating no specific frame constraints are applied.

The service relies on other components like a logger, schema service, and method context service to function correctly.

You can retrieve a specific frame instance using `getFrame`, providing the frame name, and get the timeframe boundaries for a given symbol using `getTimeframe`.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify your trading exchanges. Think of it as a central manager for ensuring your exchange configurations are correct and available. 

It lets you register new exchanges, allowing you to easily add them to the system. Before performing any actions involving an exchange, you can use the service to confirm that it's properly configured and present. 

To speed things up, it remembers the results of previous validations, so it doesn't have to re-check everything every time. If you need a complete list of all your configured exchanges, the service provides a method to display them. 

Essentially, this service is designed to make managing and confirming your exchange setups smooth and efficient.

## Class ExchangeUtils

The ExchangeUtils class is designed to make working with exchange data easier and more reliable within the backtest-kit framework. It acts as a central helper, providing a single, accessible instance for various common exchange-related tasks.

It handles retrieving historical candle data, calculating average prices like VWAP, and getting the most recent closing price for a trading pair.

You can also use it to format quantities and prices to match the specific precision requirements of the exchange you're interacting with.  It offers methods to fetch order books and aggregated trades.

Finally, it provides a way to retrieve raw candle data, allowing for greater control over date ranges and limiting the number of candles returned, while ensuring proper safeguards against look-ahead bias. It calculates dates automatically based on the desired timeframe and data limits.

## Class ExchangeSchemaService

This service helps keep track of information about different cryptocurrency exchanges, ensuring everything is organized and consistent. 

It uses a special system to store this information in a type-safe way.

You can add new exchange details using `addExchange()` and retrieve them later by their name.

Before adding new exchanges, the service checks to make sure they have all the necessary information.

If you need to update an existing exchange's details, you can use the `override` method to apply changes.

Finally, `get` lets you easily find the information for a specific exchange by its name.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for handling exchange-related operations within the backtesting framework. It combines connection management with execution context, ensuring that each request includes relevant details like the trading symbol, date, and whether it's a backtest. This service is a foundational component, used by other core parts of the framework to interact with exchanges.

It provides methods for retrieving various data points, including historical candles, future candles (specifically for backtesting), VWAP prices, and the closing price of a candle. You can also use it to format price and quantity values, fetch order books, and access aggregated trade data. There's a method for retrieving raw candle data, allowing for flexible control over date ranges and limits. The validation process is designed to be efficient, remembering previous validations to avoid unnecessary repeats.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests—like fetching candles, order books, or aggregated trades—to the correct exchange implementation based on the currently active exchange. To speed things up, it remembers (caches) the exchange connections it creates, so it doesn't have to create a new one every time.

It provides methods for retrieving historical candle data (`getCandles`, `getNextCandles`), calculating average prices (`getAveragePrice`), obtaining the latest close price (`getClosePrice`), and fetching order books (`getOrderBook`) and aggregated trades (`getAggregatedTrades`). 

Beyond just retrieving data, it also handles formatting prices and quantities (`formatPrice`, `formatQuantity`) to comply with the specific rules of each exchange, ensuring your orders are valid. You can also fetch raw candle data with custom date ranges using `getRawCandles`. Essentially, this service simplifies interacting with various exchanges by abstracting away the complexities of connecting to each one individually.

## Class DumpAdapter

The DumpAdapter helps you save information related to your trading tests – like messages, records, and tables – in a structured way. Think of it as a tool that gathers all the important details and then presents them in a useful format.

It has a default way of saving data as Markdown files, but you can easily change this to store the data in memory, discard it entirely, or even use your own custom saving method.

Before you start saving anything, you need to activate the adapter, and you can deactivate it later when you're done. This helps prevent issues with old data lingering around.

The adapter keeps track of individual data "instances" to avoid problems, and it cleans up these instances when signals are finished.  

You have several methods to save different types of data: full message histories, individual records, tables, raw text, error descriptions, and JSON objects.

If you need to change how and where data is stored, the `use...` methods (like `useMemory` or `useDummy`) allow you to switch between different storage backends. If you need something more specific, `useDumpAdapter` lets you inject a completely custom solution. Clearing the adapter is useful when your working directory changes to ensure fresh data storage.

## Class ConstantUtils

This class provides a set of predefined constants for managing take-profit and stop-loss levels in your trading strategies. These values are derived from the Kelly Criterion and exponential risk decay, designed to help you optimize your risk and reward balance.

The constants represent percentages of the total distance to your final take-profit or stop-loss target. For example, TP_LEVEL1 is set at 30%, meaning it triggers when the price reaches 30% of the way to your overall take-profit goal.  Similarly, SL_LEVEL1 triggers at 40% of the way to your stop-loss target, acting as an early warning sign.

The constants are structured as:

*   TP_LEVEL1:  Early partial take-profit (30% of target)
*   TP_LEVEL2:  Mid-level take-profit (60% of target)
*   TP_LEVEL3:  Final partial take-profit (90% of target)
*   SL_LEVEL1: Early warning stop-loss (40% of target)
*   SL_LEVEL2: Final exit stop-loss (80% of target)

These constants give you a way to systematically lock in profits and reduce potential losses in stages.

## Class ConfigValidationService

The ConfigValidationService helps keep your backtesting configurations sound and profitable. It's designed to automatically check your settings to catch potential errors before they impact your results.

This service focuses on ensuring the numbers you use for things like slippage, fees, profit margins, and stop-loss distances are logically correct. It verifies that percentages are non-negative and time-related values are positive integers.

Most importantly, it makes sure your take-profit distance is set high enough to actually cover the costs of the trade (slippage and fees), guaranteeing you won’t lose money even when your target is reached. It also enforces relationships between parameters like minimum and maximum values for distances, and validates candle-related settings. 

The `validate` function performs all these checks, providing a safety net for your backtesting setup. The service uses a `loggerService` for any errors or warnings it finds, so you can easily address any configuration issues.


## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It checks your column definitions to ensure they have all the necessary parts, like a unique identifier (key), a descriptive label, a formatting function, and a visibility function.

It also verifies that these identifiers are unique, preventing conflicts.

The service confirms that the key and label fields are text strings and that the format and visibility functions are actually functions and not something else.  Essentially, it's a safeguard to catch potential errors early on and ensure your columns behave as expected.

## Class ClientSizing

This component handles figuring out how much of an asset to trade, based on your strategy's needs. It allows you to define different methods for calculating position size, like using a fixed percentage, the Kelly criterion, or Average True Range (ATR). You can also set limits on the minimum and maximum position sizes, and restrict the total percentage of your capital that can be used for a single trade. The system provides hooks to let you validate the sizing calculations and log important details, ensuring your trades are executed safely and according to your plan. 

Essentially, it's the brains behind determining how much to buy or sell for each trade, using rules you define.

The `calculate` method is the core of this component, taking parameters related to the trade and returning the calculated position size.


## Class ClientRisk

ClientRisk helps manage risk at the portfolio level, preventing trading signals that exceed predefined limits. It acts as a central control point, shared by multiple strategies, to ensure they don’t collectively violate risk constraints like maximum concurrent positions or custom validation rules. Think of it as a safety net, ensuring that your overall trading activity stays within acceptable boundaries.

When a trading signal arrives, ClientRisk assesses whether it's safe to execute. It checks against these established risk parameters, using information about all currently active positions across all strategies. If a signal violates a rule, ClientRisk blocks it and provides a reason.

ClientRisk keeps track of all active positions, stored in a map that links a strategy, exchange, and symbol together. This ensures a comprehensive view of exposure.

`checkSignal` performs the core risk assessment – it validates signals and can trigger callbacks based on the result. A more specialized `checkSignalAndReserve` function exists to make the signal validation process thread-safe. This is especially crucial when multiple strategies are sharing the same risk profile and trying to open positions concurrently. This method reserves a spot in the active positions map to prevent over-commitment while validating.

Finally, `addSignal` and `removeSignal` are used to update the record of active positions when a signal is opened or closed. These methods are called by the strategy execution system to maintain accurate tracking. It is important that `checkSignalAndReserve` is followed by either `addSignal` or `removeSignal` to ensure the riskMap doesn’t accumulate stale reservations.

## Class ClientFrame

The ClientFrame helps create the timeline of data your backtest uses to simulate trading. It's responsible for building arrays of timestamps representing the historical periods you want to analyze. To avoid unnecessary work, it caches these timelines so they aren't recreated every time.

You can adjust how far apart these timestamps are, choosing intervals from one minute to one day.

It also offers a way to hook in your own code to verify the data or record details about the process.

Essentially, it feeds the data backbone to the core backtesting engine, ensuring it has the right sequence of timestamps for each symbol.

The `getTimeframe` method is the primary way to get this timeline data – it’s like requesting the historical data array for a specific asset. It remembers previous requests to speed things up.

## Class ClientExchange

The `ClientExchange` class provides a way to interact with exchange data, acting as a bridge between your backtesting or trading logic and the actual exchange. It gives you tools to retrieve historical and future candle data, calculate the volume-weighted average price (VWAP) based on recent trades, and format price and quantity information to match the exchange's specific requirements. 

Here’s a breakdown of what it offers:

*   **Candle Data:** It can fetch historical candles (going backward in time) and future candles (needed for backtesting when you need to simulate future market conditions).
*   **VWAP Calculation:**  It computes the VWAP using a configurable number of recent 1-minute candles. If there's not enough volume data, it falls back to a simple average of close prices.
*   **Price & Quantity Formatting:**  You can use it to properly format prices and quantities according to how the exchange expects them.
*   **Flexible Candle Retrieval:** The `getRawCandles` method gives you a lot of control, allowing you to specify start and end dates, or just a limit of candles. The system carefully prevents looking into the future to ensure accurate backtesting.
*   **Order Book & Trades:** You can fetch order book information and aggregated trades, retrieving data relative to the current time.

The class is designed with efficiency in mind, employing prototype functions to reduce memory usage, and with safeguards to avoid look-ahead bias in backtesting scenarios.

## Class ClientAction

The `ClientAction` component is a central piece for managing custom actions within your trading strategy, handling their lifecycle and making sure they communicate effectively. Think of it as a bridge between your strategy's core logic and external systems like notification services or data analytics.

It takes care of creating and managing an instance of your custom action handler, ensuring it's initialized only once and properly cleaned up when it's no longer needed.  You'll use this to connect your strategy to things like logging, real-time alerts (via Telegram, Discord, or email), and monitoring your performance.

The `signal` methods are your primary way to trigger these custom actions in response to events from live or backtest environments. There are separate methods for live and backtest signals, as well as specific events like reaching breakeven, partial profits/losses, or risk rejections.  The `signalSync` method provides a specialized way to handle position management through limit orders, and it's crucial to ensure any errors within that function are handled carefully.

## Class CacheUtils

CacheUtils helps you simplify function caching, especially when you're working with time-based data like trading strategies. It's like having a little helper that remembers the results of your calculations, so you don't have to repeat them unnecessarily.

Think of it as a central manager for caching – there's only one instance of it available for your entire application.

The `fn` method lets you wrap your functions, automatically storing their results based on a timeframe (like a 1-minute or 1-hour candle). This is great for performance because it avoids re-calculating things if the data hasn't changed.

Similarly, `file` wraps asynchronous functions and stores the results persistently in files. This is super useful if you have calculations that take a long time and you want to avoid running them again. These files are stored in a specific directory structure to keep things organized.

If you need to force a cache refresh, you can use `dispose` to clear the cache for a specific function.  `clear` is the nuclear option—it wipes out *all* cached results, which is helpful when your environment changes. 

Lastly, `resetCounter` helps ensure that your file-based caches don't get mixed up between different runs of your trading strategy.

## Class BrokerBase

This class, `BrokerBase`, serves as a foundational building block for connecting your trading strategies to real exchanges. Think of it as a template for creating custom adapters for different brokers or exchanges. It handles the repetitive tasks, like logging events and ensuring everything follows a standard process, so you can focus on the specifics of your exchange integration.

You’ll extend this class to define how your strategy interacts with a particular exchange, covering actions like placing orders, managing stop-loss and take-profit levels, tracking your positions, and sending out trade notifications.

The framework automatically handles logging of all key events using the built-in logger. Each event type—opening a new position, closing a position, partial profit/loss adjustments, trailing stops—has a corresponding method you can override to implement the actual exchange interaction.

Initialization happens through the `waitForInit()` method, where you’d connect to the exchange and authenticate. Then, as your strategy executes, the other methods (`onSignalOpenCommit`, `onSignalCloseCommit`, etc.) are triggered, allowing you to react and perform the necessary actions on the exchange. This framework streamlines building customized, exchange-specific trading integrations.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategies and the actual broker, giving you a chance to control and validate actions before they’re sent to the exchange. Think of it as a safety net for your trading orders.

When testing strategies, the `BrokerAdapter` quietly ignores these commit operations, allowing you to run backtests without real-world interactions. In live trading, it forwards those same operations to your registered broker.

Several functions within `BrokerAdapter` allow you to intercept key actions such as opening/closing signals, partial profits/losses, trailing stops, take profits, breakeven adjustments, and average buy orders.  These functions act as crucial points where you can add extra checks or modifications before the trade is finalized.  If any of these checks fail, the trade is prevented.

You must register a broker adapter using `useBrokerAdapter` before activating the adapter with `enable`. `enable` sets up automatic handling of signal open/close events. Remember to use `disable` to deactivate, and `clear` when necessary to refresh the broker instance.

## Class BreakevenUtils

The BreakevenUtils class helps you understand and visualize the results of your breakeven protection strategies. It's like a central place to gather information about how your strategies are performing. 

You can use it to get overall statistics, like the total number of breakeven events that have occurred. It can also generate detailed reports, showing individual breakeven events in a nicely formatted table with key details such as entry price, position, and timestamps. 

Finally, it provides a simple way to save these reports to files, making it easy to track your strategy's performance over time. The reports are named consistently using the symbol and strategy name, so you can easily organize them.


## Class BreakevenReportService

The BreakevenReportService is designed to track when your trading signals reach their breakeven point – that moment when they've recovered the initial investment. 

It diligently listens for these "breakeven" events and records them, including all the details about the signal that triggered it.

This service uses a logger for debugging and handles database storage through a mechanism that ensures it only registers for these events once.

To start tracking breakeven points, you’ll subscribe to the service, which returns a function to later stop the tracking.  If you need to stop, simply call that returned function. If it isn't subscribed, calling this function won't have any effect.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you create and store reports detailing breakeven events for your trading strategies. It listens for these breakeven signals, keeping track of them for each symbol and strategy you’re using. 

This service automatically generates easy-to-read markdown tables summarizing the events, along with overall statistics. It saves these reports to your computer, organizing them in a specific directory structure.

You can subscribe to receive these breakeven events, unsubscribe to stop receiving them, and retrieve data or reports for specific symbol-strategy combinations. It also offers a way to completely clear out the accumulated data if needed. Think of it as a tool to automatically document and analyze how close your trades came to being unprofitable.

## Class BreakevenGlobalService

The BreakevenGlobalService acts as a central hub for managing breakeven tracking within the backtest-kit framework. Think of it as a middleman, receiving requests related to breakeven calculations and forwarding them to the connection service while also keeping a record of what's happening. It’s injected into the core strategy component to ensure consistent and controlled access to breakeven functionality. 

This service provides a convenient single point for injecting dependencies and crucial logging capabilities to monitor breakeven operations. It's designed to abstract away the specific connection details, allowing the strategy to focus on its core trading logic. 

Several validation services (strategy, schema, risk, exchange, and frame) are included to ensure all dependencies are properly set up before any breakeven checks are performed. The `validate` function memoizes validation results, making repeated checks for the same strategy, risk, and frame combination more efficient. The key functions, `check` and `clear`, handle the core logic of initiating and resolving breakeven states, respectively, with detailed logging before forwarding the request.

## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It's like a central hub that keeps track of breakeven information for each signal, ensuring that this information is readily available and managed efficiently.

It avoids creating duplicate breakeven calculations by remembering ("memoizing") already calculated instances for each signal. 

Think of it as a factory that creates and manages these breakeven instances, handling their lifecycle and ensuring they're properly configured with logging and notifications. The service automatically cleans up these instances when signals are no longer needed, preventing unnecessary resource consumption.

This service is a key part of the trading strategy and interacts with other services to manage actions and keep track of time-related data. It's designed to handle situations where a breakeven point needs to be checked or cleared, such as when a signal is triggered or closed.

## Class BacktestUtils

This class provides helpful tools for backtesting trading strategies. It acts as a central point for running tests and gathering data, making the backtesting process simpler.

The `run` method is your primary way to execute a backtest for a specific trading symbol and configuration. You can also run tests in the background with `background` for tasks like logging without blocking the main test.

For inspecting a running or completed backtest, you have several methods. You can retrieve pending or scheduled signals, check if signals exist, and get details like total percentage closed, cost basis, and entry prices.  

The framework also offers ways to manipulate the ongoing backtest, allowing you to adjust trailing stops, take profits, and even activate scheduled signals prematurely. There are methods to calculate PnL, drawdown, and other key performance indicators, providing a comprehensive view of the strategy's behavior.  You can also generate reports and lists of backtest instances.

## Class BacktestReportService

This service helps you keep a detailed record of what's happening during your backtests. It's designed to listen for events related to your trading signals—like when a signal is idle, opened, active, or closed—and carefully logs these events.

Essentially, it acts as an observer, capturing all the important milestones of each signal. 

It stores this information in a database, allowing you to later analyze and debug your backtesting strategies.

You can easily start and stop this logging process using the `subscribe` method which prevents multiple subscriptions. When you're finished, `unsubscribe` will cleanly stop the logging. The service relies on a logger for diagnostic output and handles the actual tick event processing.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save reports detailing your backtest results. It listens for updates during the backtesting process, keeping track of when signals are closed. It then uses this information to generate readable markdown tables, which are saved as files on your disk, making it easy to analyze your strategy's performance.

The service uses a clever system to store data, ensuring that each backtest run has its own dedicated area. It's designed to work with your strategy's "onTick" callback, specifically focusing on closed signals.

You can retrieve overall statistics for a given strategy and symbol, generate the complete report in markdown format, and save it directly to a file. The service also provides functions to clear out this accumulated data when you're done or want to start fresh.

Finally, it has subscription and unsubscription functions for receiving tick events, allowing you to seamlessly integrate it into your backtest environment.

## Class BacktestLogicPublicService

This service helps manage and run backtests in a structured way. It simplifies the process by automatically handling essential information like the strategy name, exchange, and frame being used. 

Think of it as a wrapper that makes it easier to access data and execute functions within your backtest. You don't have to manually pass context details everywhere – the service takes care of that for you.

The `run` method is the core of this service; it executes the backtest for a given symbol and provides a stream of results (like signals to buy, sell, or cancel orders). This stream represents the chronological flow of events during the backtest.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire process of running a backtest, designed to be efficient and flexible. It works by fetching timeframes, processing them one by one, and reacting to signals generated by your trading strategy.

When a signal to open a trade appears, the service retrieves the necessary candle data and executes the backtest logic. It then pauses processing until the trade is closed.

The results, including opened, closed, and cancelled trades, are streamed back to you as a sequence of values, which means you don't have to hold everything in memory at once. You can also stop the backtest early if needed.

Essentially, it's the engine that drives your backtest, connecting your strategy to historical data and providing results in a manageable, stream-like format.

The service relies on several core services for its operation, including those for handling timeframes, strategy execution, exchange data, actions, and method context.


## Class BacktestCommandService

The BacktestCommandService acts as a central point for running backtests within the system. It provides a straightforward way to access and execute backtesting functionality. 

Think of it as a helpful assistant, simplifying the process of running simulations. It handles the underlying complexity, letting you focus on defining what you want to test.

It relies on several other services internally to manage things like validating strategies, understanding risks, and making sure everything is set up correctly. These services include handling strategy schemas, risk assessments, actions, backtest logic, strategy validation, exchange details, and frame definitions.

The primary function, `run`, is used to kick off a backtest, specifying which symbol to test and providing context like the strategy and exchange names. The backtest execution returns a stream of results, detailing the outcomes of each tick, whether it's a scheduled event, an opened position, a closed position, or a cancelled order.

## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers, ensuring they're available when needed. Think of it as a central place to register all your actions and confirm they’re working correctly.

It lets you add new action schemas with `addAction`, and then use `validate` to check if a specific action exists before you try to use it. This prevents errors and makes your trading strategies more robust.

To speed things up, it remembers the results of previous validations using a technique called memoization. 

Finally, you can use `list` to see exactly which action handlers are currently registered.

## Class ActionSchemaService

The ActionSchemaService is responsible for keeping track of and managing different action schemas, which define how actions are handled within the system. It ensures that these schemas are properly structured and contain only the allowed methods, making the whole process more reliable and less prone to errors.

It uses a special storage system to keep track of schemas in a type-safe way.

You can register new action schemas, which involves verifying they are correctly formatted and contain only approved methods. The service prevents duplicate schema names.

If you have existing schemas and need to make small changes, you can override them – updating parts of the schema without needing to completely re-register it.

You can also retrieve existing schemas when you need their details, like when setting up connections for actions.

The service also has a validation process to quickly check schemas for the essential components before they are registered. 

Finally, it utilizes a logger service for tracking and debugging purposes.

## Class ActionProxy

The `ActionProxy` acts as a safety net when you're using custom actions within your trading strategy. It's designed to prevent errors in your code from crashing the entire system. Think of it as a wrapper that automatically catches and logs any errors that occur within your action handlers.

The `ActionProxy` works by wrapping all the standard methods you might use – like `init`, `signal`, `signalLive`, `breakevenAvailable`, and more – in a way that protects against unexpected errors. If an error *does* happen, it gets logged and sent for further processing, but the trading process keeps going.

You don’t directly create `ActionProxy` instances; instead, you use the `fromInstance` method to create them, providing your action handler and any necessary parameters.  This makes sure all your action methods are safely wrapped.

There's one important exception: the `signalSync` method is *not* wrapped in error handling. This is because any errors here are meant to be handled at a higher level. The `dispose` method, like `init`, is wrapped for safe resource cleanup at the end of the strategy's execution. Essentially, it’s about making your custom actions as reliable as possible without bringing down the whole show.

## Class ActionCoreService

The ActionCoreService acts as a central manager for all actions executed by your trading strategies. It's responsible for orchestrating the flow of information and ensuring that the correct actions are triggered at the right times.

Think of it as a dispatcher that gets instructions from your strategy’s blueprint (the strategy schema). It then verifies everything is in order and sends signals to the appropriate action handlers.

Here’s a breakdown of what it does:

*   **Initialization:** When a strategy starts, it initializes the actions that need to be executed, potentially loading any necessary data.
*   **Signal Routing:**  It delivers market signals (like price updates) to the actions based on the strategy's defined rules. Different signal types have their own routes (`signal`, `signalLive`, `signalBacktest`).
*   **Event Handling:** It routes various events (like breakeven, partial profit/loss, pings, and risk rejections) to the correct actions.
*   **Validation:**  It thoroughly checks the strategy's setup and configuration before things run – this includes verifying names, exchange details, and risk profiles – to avoid errors.  It remembers previous validations to improve performance.
*   **Cleanup:** When a strategy finishes, it ensures all actions are properly shut down and release any resources.
*   **Synchronization:** The `signalSync` method allows for coordinating actions across all registered actions, ensuring consistent behavior.

Essentially, the ActionCoreService simplifies the process of managing actions within a trading strategy, providing a robust and organized framework for execution.  It handles the details so you can focus on defining your trading logic.


## Class ActionConnectionService

This component acts as a central router, directing different actions (like signals or breakeven calculations) to the correct action handler based on its name, the strategy and frame being used. It intelligently caches these handlers to improve performance, avoiding redundant creation. Think of it as a traffic controller for your trading actions, ensuring they reach the right place efficiently.

The `getAction` method is key – it’s responsible for fetching these cached action handlers, creating them only when needed. The cache is specific to a combination of factors: the action name, the strategy being employed, the exchange used, and the frame’s context, making sure you get the right action for the right situation.

Several methods (`signal`, `signalLive`, `breakevenAvailable`, etc.) are available to trigger these actions. These methods forward events – like new market data or profit targets being met – to the appropriate cached handler for processing. Finally, `dispose` and `clear` methods are there to clean up resources when actions are no longer needed.

## Class ActionBase

The `ActionBase` class serves as a foundation for creating custom actions that extend the backtest-kit trading framework. It simplifies the process of building custom logic for state management, real-time notifications, logging, analytics, and other tasks.

Think of it as a starting point; you inherit from this class and override specific methods to implement your own custom behavior. It handles the basic setup and logging automatically, letting you focus on your custom functionality.

The class lifecycle starts with a constructor and includes an `init` method for async setup. Throughout the execution of a strategy, you can override methods like `signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, and others to react to various events. For example, `signalLive` is for actions unique to live trading, whereas `signalBacktest` is tailored for backtesting operations.

Finally, the `dispose` method ensures cleanup and resource release when the strategy concludes. Essentially, `ActionBase` gives you a structured and convenient way to plug in your custom logic into the backtesting and live trading process.

